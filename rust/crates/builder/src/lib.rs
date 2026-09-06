//! Transaction builder for multicall-scripting — Rust port of `js/index.js`.
//!
//! Composes a sequence of calls where a value returned by one call can be spliced into the
//! calldata of a later call. Offsets are produced by [`multicall_scripter_codec`]; ABI encoding
//! uses `alloy-dyn-abi` (the role viem plays in the JS layer).
//!
//! Positions are derived from the real ABI encoding, exactly as in the JS builder: return-data
//! offsets from the canonical layout of the producing function's outputs, calldata targets by
//! reading the head pointers of the encoded calldata.
//!
//! ## Supported (parity-tested against the JS layer)
//! - scalar return values chained as scalar arguments, any number of calls apart
//! - multiple scalar return values (tuple of statics), referenced positionally; a sole struct
//!   output is flattened one level
//! - a single dynamic (`bytes` / `string` / `T[]` of statics) return sized via
//!   [`ReturnRef::with_length`]
//! - state-changing calls with an indexed `msg.value`
//!
//! ## Not ported (use the JS builder)
//! - a [`ReturnRef`] nested inside an array/tuple *argument* (top-level arguments only)
//! - element access into a returned array (`result[i]`) and struct field access by name

use alloy_dyn_abi::{DynSolType, DynSolValue};
use alloy_json_abi::{Function, Param, StateMutability};
use alloy_primitives::{Address, Bytes, FixedBytes, I256, U256};
use thiserror::Error;

use multicall_scripter_codec as codec;

#[derive(Debug, Error)]
pub enum BuildError {
    #[error("argument count mismatch: {got} vs {expected}")]
    ArgCountMismatch { got: usize, expected: usize },
    #[error("{0} is view/pure; it cannot receive msg.value")]
    ValueOnStaticCall(String),
    #[error("{ty} return value requires with_length() before use")]
    RequiresLength { ty: String },
    #[error("cannot pass a {from} return value as a {to} argument")]
    TypeMismatch { from: String, to: String },
    #[error("call #{call}: too many variables ({count}) from one call")]
    TooManyVars { call: usize, count: usize },
    #[error("call #{call} variable {var}: return data slice exceeds returnDataSize")]
    SliceExceedsReturnData { call: usize, var: usize },
    #[error("unsupported: {0}")]
    Unsupported(String),
    #[error("type resolution failed: {0}")]
    TypeResolve(String),
    #[error(transparent)]
    Codec(#[from] codec::CodecError),
}

/// A reference to a value returned by a previously added call. Pass it as an [`Arg::Ref`] to a
/// later `add_call` to chain it. Mirrors the JS descriptor object.
#[derive(Debug, Clone)]
pub struct ReturnRef {
    owner: Option<std::sync::Arc<()>>,
    call_index: usize,
    /// byte offset of this value within the producing call's return data (for dynamic values:
    /// the length word)
    offset: u64,
    /// byte length to copy (32 for statics; length word + data for dynamics, set via `with_length`)
    size: u64,
    is_dynamic: bool,
    requires_length: bool,
    /// static size of one element, for `T[]` returns (with_length counts elements)
    element_size: Option<u64>,
    /// declared data length (bytes for bytes/string, elements for T[]) after `with_length`
    length: Option<u64>,
    /// set when the value's position cannot be known before execution
    unsupported: Option<String>,
    ty: String,
}

impl ReturnRef {
    /// Construct a static return reference from raw fields. Used by the CLI, where references
    /// arrive as `{callIndex, offset, size}` JSON (mirrors the cli.js ref contract).
    pub fn raw(call_index: usize, offset: u64, size: u64) -> Self {
        Self {
            owner: None,
            call_index,
            offset,
            size,
            is_dynamic: false,
            requires_length: false,
            element_size: None,
            length: None,
            unsupported: None,
            ty: String::new(),
        }
    }

    /// Declare the runtime length of a dynamic return value: byte length for `bytes`/`string`,
    /// element count for `T[]`. It must be exact. The original length word is copied; an incorrect declaration
    /// can revert or make the consumer read adjacent arguments. This is not a runtime length check.
    pub fn with_length(mut self, n: u64) -> Self {
        if self.unsupported.is_some() {
            return self;
        }
        if !self.is_dynamic {
            self.unsupported = Some(format!(
                "{} is static; with_length() is only for bytes, string and T[] return values",
                self.ty
            ));
            return self;
        }
        let size = match self.element_size {
            Some(elem) => n.checked_mul(elem).and_then(|n| n.checked_add(32)),
            None => n
                .div_ceil(32)
                .checked_mul(32)
                .and_then(|n| n.checked_add(32)),
        };
        match size {
            Some(size) if size <= u16::MAX as u64 => self.size = size,
            _ => {
                self.unsupported = Some("returnDataSize is too large".into());
                return self;
            }
        }
        self.requires_length = false;
        self.length = Some(n);
        self
    }
}

/// An argument to a call: either a literal value or a reference to a prior call's return value.
pub enum Arg {
    Value(DynSolValue),
    Ref(ReturnRef),
}

struct Call {
    target: Address,
    fn_calldata: Bytes,
    calltype_flag: u8,
    mem_targets: Vec<u64>,
    result_lengths: Vec<u64>,
    return_offsets: Vec<u64>,
    return_data_size: u64,
    msg_value: U256,
}

#[derive(Debug, Default)]
pub struct BuildOutput {
    pub targets: Vec<Address>,
    pub offsets: Vec<U256>,
    pub calldatas: Bytes,
    pub msg_values: Vec<U256>,
}

#[derive(Default)]
pub struct TransactionBuilder {
    owner: std::sync::Arc<()>,
    calls: Vec<Call>,
}

impl TransactionBuilder {
    pub fn new() -> Self {
        Self::default()
    }

    /// Mirrors `addCall`. Returns one [`ReturnRef`] per declared output (positional; a sole
    /// struct output is flattened into its components).
    pub fn add_call(
        &mut self,
        function: &Function,
        target: Address,
        args: Vec<Arg>,
        msg_value: U256,
    ) -> Result<Vec<ReturnRef>, BuildError> {
        if args.len() != function.inputs.len() {
            return Err(BuildError::ArgCountMismatch {
                got: args.len(),
                expected: function.inputs.len(),
            });
        }
        let is_static = matches!(
            function.state_mutability,
            StateMutability::Pure | StateMutability::View
        );
        if is_static && msg_value > U256::ZERO {
            return Err(BuildError::ValueOnStaticCall(function.name.clone()));
        }

        let input_types: Vec<DynSolType> = function
            .inputs
            .iter()
            .map(|p| {
                p.selector_type()
                    .parse::<DynSolType>()
                    .map_err(|e| BuildError::TypeResolve(e.to_string()))
            })
            .collect::<Result<_, _>>()?;

        // Validate every reference before recording any splice.
        for (arg, ty) in args.iter().zip(&input_types) {
            let Arg::Ref(r) = arg else { continue };
            if r.owner
                .as_ref()
                .is_some_and(|owner| !std::sync::Arc::ptr_eq(owner, &self.owner))
            {
                return Err(BuildError::Unsupported(
                    "Return reference belongs to another builder".into(),
                ));
            }
            if let Some(reason) = &r.unsupported {
                return Err(BuildError::Unsupported(reason.clone()));
            }
            if r.is_dynamic != is_dynamic(ty)
                || (if r.is_dynamic {
                    r.ty != ty.to_string()
                } else {
                    r.size != static_size(ty)
                })
            {
                return Err(BuildError::TypeMismatch {
                    from: r.ty.clone(),
                    to: ty.to_string(),
                });
            }
            if r.is_dynamic && r.requires_length {
                return Err(BuildError::RequiresLength { ty: r.ty.clone() });
            }
            if r.call_index >= self.calls.len() || r.offset.checked_add(r.size).is_none() {
                return Err(BuildError::Unsupported("Invalid return reference".into()));
            }
        }

        // literals use their value; refs a placeholder occupying exactly the space the spliced
        // return data will take
        let values: Vec<DynSolValue> = args
            .iter()
            .zip(&input_types)
            .map(|(arg, ty)| match arg {
                Arg::Value(v) => v.clone(),
                Arg::Ref(r) if r.is_dynamic => placeholder_value(ty, r.length.unwrap_or(0)),
                Arg::Ref(_) => default_value(ty),
            })
            .collect();
        if !DynSolValue::matches_many(&values, &input_types) {
            return Err(BuildError::TypeResolve(
                "literal argument does not match its ABI type".into(),
            ));
        }
        let fn_calldata = encode_calldata(function, &values);

        // the executor resolves memTargets relative to the calldata of the call *after* the
        // producer, so add the size of every call in between
        let mut head_pos = 4u64;
        for (arg, ty) in args.iter().zip(&input_types) {
            if let Arg::Ref(r) = arg {
                let pos = if is_dynamic(ty) {
                    4 + read_word(&fn_calldata, head_pos)
                } else {
                    head_pos
                };
                let distance: u64 = self.calls[r.call_index + 1..]
                    .iter()
                    .map(|c| region_size(&c.fn_calldata))
                    .sum();
                let producing = &mut self.calls[r.call_index];
                producing.mem_targets.push(distance + pos);
                producing.result_lengths.push(r.size);
                producing.return_offsets.push(r.offset);
                producing.return_data_size = producing.return_data_size.max(r.offset + r.size);
            }
            head_pos += head_size(ty);
        }

        self.calls.push(Call {
            target,
            fn_calldata,
            calltype_flag: if is_static {
                codec::STATIC_CALL_FLAG
            } else {
                codec::CALL_FLAG
            },
            mem_targets: Vec::new(),
            result_lengths: Vec::new(),
            return_offsets: Vec::new(),
            return_data_size: 0,
            msg_value,
        });

        self.build_function_outputs(function)
    }

    /// Lays out the outputs of the call just pushed. Outputs form a tuple at byte 0 of the return
    /// data; a sole struct output is flattened one level (behind its pointer word if dynamic).
    fn build_function_outputs(&self, function: &Function) -> Result<Vec<ReturnRef>, BuildError> {
        let call_index = self.calls.len() - 1;
        let (params, base): (Vec<&Param>, u64) = match function.outputs.as_slice() {
            [only] if only.ty == "tuple" => {
                let comps: Vec<&Param> = only.components.iter().collect();
                let base = if comps.iter().any(|c| param_is_dynamic(c)) {
                    32
                } else {
                    0
                };
                (comps, base)
            }
            outputs => (outputs.iter().collect(), 0),
        };

        let dynamics = params.iter().filter(|p| param_is_dynamic(p)).count();
        let heads: u64 = params.iter().map(|p| param_head_size(p)).sum();
        let mut head_pos = base;
        let mut refs = Vec::with_capacity(params.len());
        for p in params {
            let dynamic = param_is_dynamic(p);
            let (offset, unsupported) = if dynamic {
                let reason = if dynamics > 1 {
                    Some(format!(
                        "{} return value: more than one dynamic value in the return data",
                        p.ty
                    ))
                } else if p.ty != "bytes" && p.ty != "string" && !p.ty.ends_with("[]") {
                    Some(format!("{} return value: whole dynamic tuples and fixed arrays of dynamic elements are not supported", p.ty))
                } else if p.ty.ends_with("[]") && param_is_dynamic(&element_param(p)) {
                    Some(format!(
                        "{} return value: arrays of dynamic elements are not supported",
                        p.ty
                    ))
                } else {
                    None
                };
                (base + heads, reason)
            } else {
                (head_pos, None)
            };
            let element_size = if dynamic && p.ty.ends_with("[]") {
                Some(param_static_size(&element_param(p)))
            } else {
                None
            };
            refs.push(ReturnRef {
                owner: Some(self.owner.clone()),
                call_index,
                offset,
                size: if dynamic { 32 } else { param_static_size(p) },
                is_dynamic: dynamic,
                requires_length: dynamic,
                element_size,
                length: None,
                unsupported,
                ty: p.selector_type().into_owned(),
            });
            head_pos += param_head_size(p);
        }
        Ok(refs)
    }

    /// Mirrors `build()`. Produces `(targets, offsets, calldatas, msgValues)`.
    pub fn build(&self) -> Result<BuildOutput, BuildError> {
        let mut out = BuildOutput::default();
        let mut packed = Vec::new();

        for (call_index, call) in self.calls.iter().enumerate() {
            out.targets.push(call.target);
            packed.extend_from_slice(&U256::from(call.fn_calldata.len()).to_be_bytes::<32>());
            packed.extend_from_slice(&call.fn_calldata);
            packed.resize(packed.len().div_ceil(32) * 32, 0);

            if call.mem_targets.len() > codec::PARTIAL_RETURN_VARS as usize {
                return Err(BuildError::TooManyVars {
                    call: call_index,
                    count: call.mem_targets.len(),
                });
            }
            for j in 0..call.return_offsets.len() {
                if call.return_offsets[j] + call.result_lengths[j] > call.return_data_size {
                    return Err(BuildError::SliceExceedsReturnData {
                        call: call_index,
                        var: j,
                    });
                }
            }

            let offset = if call.calltype_flag == codec::STATIC_CALL_FLAG {
                if call.mem_targets.is_empty() {
                    codec::static_call(U256::ZERO, U256::ZERO)?
                } else {
                    codec::static_call_partial_return(
                        &call.mem_targets,
                        &call.result_lengths,
                        &call.return_offsets,
                        call.return_data_size,
                    )?
                }
            } else {
                let mut msg_value_index = 0;
                if call.msg_value > U256::ZERO {
                    out.msg_values.push(call.msg_value);
                    msg_value_index = out.msg_values.len() as u64;
                }
                if call.mem_targets.is_empty() {
                    codec::state_changing_call(msg_value_index)?
                } else {
                    codec::call_partial_return(
                        msg_value_index,
                        &call.mem_targets,
                        &call.result_lengths,
                        &call.return_offsets,
                        call.return_data_size,
                    )?
                }
            };

            out.offsets.push(offset);
        }

        out.calldatas = packed.into();
        Ok(out)
    }
}

fn encode_calldata(function: &Function, values: &[DynSolValue]) -> Bytes {
    let encoded = DynSolValue::Tuple(values.to_vec()).abi_encode_params();
    let mut data = function.selector().to_vec();
    data.extend_from_slice(&encoded);
    Bytes::from(data)
}

/// bytes a call occupies in the executor's calldata region: [length word][data padded to 32]
fn region_size(calldata: &Bytes) -> u64 {
    32 + (calldata.len() as u64).div_ceil(32) * 32
}

fn read_word(data: &Bytes, pos: u64) -> u64 {
    let pos = pos as usize;
    let word = U256::from_be_slice(&data[pos..pos + 32]);
    u64::try_from(word).expect("head pointer fits in u64")
}

// ---- layout helpers over DynSolType (inputs) ----

fn is_dynamic(ty: &DynSolType) -> bool {
    match ty {
        DynSolType::Bytes | DynSolType::String | DynSolType::Array(_) => true,
        DynSolType::FixedArray(inner, _) => is_dynamic(inner),
        DynSolType::Tuple(tys) => tys.iter().any(is_dynamic),
        _ => false,
    }
}

fn static_size(ty: &DynSolType) -> u64 {
    match ty {
        DynSolType::FixedArray(inner, n) => *n as u64 * static_size(inner),
        DynSolType::Tuple(tys) => tys.iter().map(static_size).sum(),
        _ => 32,
    }
}

fn head_size(ty: &DynSolType) -> u64 {
    if is_dynamic(ty) {
        32
    } else {
        static_size(ty)
    }
}

// ---- layout helpers over ABI Params (outputs) ----

fn array_suffix(ty: &str) -> Option<(&str, Option<usize>)> {
    let open = ty.rfind('[')?;
    if !ty.ends_with(']') {
        return None;
    }
    let inner = &ty[open + 1..ty.len() - 1];
    let count = if inner.is_empty() {
        None
    } else {
        Some(inner.parse().ok()?)
    };
    Some((&ty[..open], count))
}

fn element_param(p: &Param) -> Param {
    let (base, _) = array_suffix(&p.ty).expect("array type");
    Param {
        ty: base.to_string(),
        name: p.name.clone(),
        components: p.components.clone(),
        internal_type: None,
    }
}

fn param_is_dynamic(p: &Param) -> bool {
    if let Some((_, count)) = array_suffix(&p.ty) {
        return count.is_none() || param_is_dynamic(&element_param(p));
    }
    match p.ty.as_str() {
        "bytes" | "string" => true,
        "tuple" => p.components.iter().any(param_is_dynamic),
        _ => false,
    }
}

fn param_static_size(p: &Param) -> u64 {
    if let Some((_, Some(count))) = array_suffix(&p.ty) {
        return count as u64 * param_static_size(&element_param(p));
    }
    if p.ty == "tuple" {
        return p.components.iter().map(param_static_size).sum();
    }
    32
}

fn param_head_size(p: &Param) -> u64 {
    if param_is_dynamic(p) {
        32
    } else {
        param_static_size(p)
    }
}

/// Placeholder value for a dynamic ref argument, sized to `n` so its calldata layout (and thus the
/// reserved splice region) matches the JS builder byte-for-byte: `string` -> `n` spaces, `bytes`
/// -> `n` zero bytes, `T[]` -> `n` default elements.
fn placeholder_value(ty: &DynSolType, n: u64) -> DynSolValue {
    let n = n as usize;
    match ty {
        DynSolType::String => DynSolValue::String(" ".repeat(n)),
        DynSolType::Bytes => DynSolValue::Bytes(vec![0u8; n]),
        DynSolType::Array(inner) => {
            DynSolValue::Array((0..n).map(|_| default_value(inner)).collect())
        }
        _ => default_value(ty),
    }
}

fn default_value(ty: &DynSolType) -> DynSolValue {
    match ty {
        DynSolType::Bool => DynSolValue::Bool(false),
        DynSolType::Int(n) => DynSolValue::Int(I256::ZERO, *n),
        DynSolType::Uint(n) => DynSolValue::Uint(U256::ZERO, *n),
        DynSolType::Address => DynSolValue::Address(Address::ZERO),
        DynSolType::Function => DynSolValue::Function(Default::default()),
        DynSolType::FixedBytes(n) => DynSolValue::FixedBytes(FixedBytes::<32>::ZERO, *n),
        DynSolType::Bytes => DynSolValue::Bytes(Vec::new()),
        DynSolType::String => DynSolValue::String(String::new()),
        DynSolType::Array(_) => DynSolValue::Array(Vec::new()),
        DynSolType::FixedArray(inner, n) => {
            DynSolValue::FixedArray((0..*n).map(|_| default_value(inner)).collect())
        }
        DynSolType::Tuple(tys) => DynSolValue::Tuple(tys.iter().map(default_value).collect()),
    }
}
