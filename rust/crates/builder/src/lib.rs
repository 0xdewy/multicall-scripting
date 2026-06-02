//! Transaction builder for multicall-scripting — Rust port of `js/index.js`.
//!
//! Composes a sequence of calls where a value returned by one call can be spliced into the
//! calldata of a later call. Offsets are produced by [`multicall_scripter_codec`]; ABI encoding
//! uses `alloy-dyn-abi` (the role viem plays in the JS layer).
//!
//! ## Supported (parity-tested against the JS layer)
//! - scalar return values chained as scalar arguments (the primary multicall pattern)
//! - calls with no chained return, and state-changing calls with an indexed `msg.value`
//! - a single dynamic (`bytes`/`string`) return sized via [`ReturnRef::with_length`]
//! - multiple scalar return values (tuple of statics), referenced positionally
//!
//! ## Deferred (mirrors the `TODO`s in js/index.js:398,435 — not yet ported)
//! - a [`ReturnRef`] nested inside an array/tuple argument
//! - array-element references (`result[0]`) spliced into an array parameter
//! - struct field access by name (use positional indices into the returned `Vec<ReturnRef>`)

use alloy_dyn_abi::{DynSolType, DynSolValue};
use alloy_json_abi::{Function, StateMutability};
use alloy_primitives::{Address, Bytes, FixedBytes, I256, U256};
use std::collections::HashSet;
use thiserror::Error;

use multicall_scripter_codec as codec;

#[derive(Debug, Error)]
pub enum BuildError {
    #[error("argument count mismatch: {got} vs {expected}")]
    ArgCountMismatch { got: usize, expected: usize },
    #[error("{ty} return value requires with_length() before use")]
    RequiresLength { ty: String },
    #[error(
        "output variable from call {call} at offset {offset} with size {size} has already been used; \
         each output variable can only be used once"
    )]
    DuplicateDescriptor { call: usize, offset: u64, size: u64 },
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
    call_index: usize,
    /// byte offset of this value within the producing call's return data
    offset: u64,
    /// byte length to copy (32 for statics; length+data for dynamics, set via `with_length`)
    size: u64,
    is_dynamic: bool,
    requires_length: bool,
    /// requested data length set by `with_length`; used to size the calldata placeholder so the
    /// spliced return data has reserved space (matches the JS descriptor's value sizing).
    length: Option<u64>,
    ty: String,
}

impl ReturnRef {
    /// Construct a static return reference from raw fields. Used by the CLI, where references
    /// arrive as `{callIndex, offset, size}` JSON (mirrors the cli.js partial-return contract).
    pub fn raw(call_index: usize, offset: u64, size: u64) -> Self {
        Self {
            call_index,
            offset,
            size,
            is_dynamic: false,
            requires_length: false,
            length: None,
            ty: String::new(),
        }
    }

    /// Sizes a dynamic (`bytes`/`string`) return. `n` is the byte length of the data, mirroring
    /// `DescriptorUtils.setupDynamicDescriptor` in js/index.js.
    pub fn with_length(mut self, n: u64) -> Self {
        // 32-byte length word + data padded to a 32-byte boundary
        self.size = 32 + n.div_ceil(32) * 32;
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
    pub calldatas: Vec<Bytes>,
    pub msg_values: Vec<U256>,
}

#[derive(Default)]
pub struct TransactionBuilder {
    calls: Vec<Call>,
    used_descriptors: HashSet<String>,
}

impl TransactionBuilder {
    pub fn new() -> Self {
        Self::default()
    }

    /// Mirrors `addCall`. Returns one [`ReturnRef`] per declared output (positional).
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

        let calltype_flag = match function.state_mutability {
            StateMutability::Pure | StateMutability::View => codec::STATIC_CALL_FLAG,
            _ => codec::CALL_FLAG,
        };

        // Resolve input parameter types once, via the canonical type string (handles tuples).
        let input_types: Vec<DynSolType> = function
            .inputs
            .iter()
            .map(|p| {
                p.selector_type()
                    .parse::<DynSolType>()
                    .map_err(|e| BuildError::TypeResolve(e.to_string()))
            })
            .collect::<Result<_, _>>()?;

        // Record return-data splices on producing calls (must happen before this call is pushed,
        // matching js/index.js ordering).
        self.process_output_descriptors(&args, &input_types)?;

        // Build calldata: literals use their value, refs use the type's zero value (the on-chain
        // VM splices the real return data over it at execution time).
        let values: Vec<DynSolValue> = args
            .iter()
            .zip(&input_types)
            .map(|(arg, ty)| match arg {
                Arg::Value(v) => v.clone(),
                // A dynamic ref must reserve a placeholder sized to its data length so the on-chain
                // splice has room (mirrors the JS descriptor's `value`). Static refs use the zero value.
                Arg::Ref(r) if r.is_dynamic => placeholder_value(ty, r.length.unwrap_or(0)),
                Arg::Ref(_) => default_value(ty),
            })
            .collect();
        let fn_calldata = encode_calldata(function, &values);

        self.calls.push(Call {
            target,
            fn_calldata,
            calltype_flag,
            mem_targets: Vec::new(),
            result_lengths: Vec::new(),
            return_offsets: Vec::new(),
            return_data_size: 0,
            msg_value,
        });

        Ok(self.build_function_outputs(function))
    }

    fn process_output_descriptors(
        &mut self,
        args: &[Arg],
        input_types: &[DynSolType],
    ) -> Result<(), BuildError> {
        // First pass: positions of dynamic argument data within calldata (js/index.js:351-405).
        let total_offset_fields = 32 * args.len() as u64;
        let mut current_dynamic_pos = 4 + total_offset_fields;
        let mut dynamic_positions: Vec<Option<u64>> = vec![None; args.len()];

        for (i, (arg, ty)) in args.iter().zip(input_types).enumerate() {
            if !is_dynamic_type(ty) {
                continue;
            }
            dynamic_positions[i] = Some(current_dynamic_pos);
            let data_size = match arg {
                Arg::Ref(r) => r.size,
                Arg::Value(v) => 32 + dynamic_value_data_size(v),
            };
            current_dynamic_pos += data_size;
        }

        // Second pass: record each ref's splice on the call that produces it.
        for (index, arg) in args.iter().enumerate() {
            let Arg::Ref(r) = arg else { continue };

            if r.is_dynamic && r.requires_length {
                return Err(BuildError::RequiresLength { ty: r.ty.clone() });
            }

            let id = format!("{}:{}:{}", r.call_index, r.offset, r.size);
            if !self.used_descriptors.insert(id) {
                return Err(BuildError::DuplicateDescriptor {
                    call: r.call_index,
                    offset: r.offset,
                    size: r.size,
                });
            }

            let param_offset = 4 + 32 * index as u64;
            let mem_target = if r.is_dynamic {
                dynamic_positions[index].unwrap_or(param_offset + 32)
            } else {
                param_offset
            };

            // Dynamic returns: skip the 32-byte offset word in the source return data.
            let return_offset = if r.is_dynamic { r.offset + 32 } else { r.offset };
            let result_length = r.size;

            let producing = &mut self.calls[r.call_index];
            producing.mem_targets.push(mem_target);
            producing.result_lengths.push(result_length);
            producing.return_offsets.push(return_offset);
            producing.return_data_size = producing.return_data_size.max(return_offset + result_length);
        }

        Ok(())
    }

    /// Builds the [`ReturnRef`]s for the call just pushed. Flattens a single tuple output into its
    /// (scalar) components; otherwise one ref per output. Mirrors `buildFunctionOutputs`.
    fn build_function_outputs(&self, function: &Function) -> Vec<ReturnRef> {
        let call_index = self.calls.len() - 1;
        let mut outputs = Vec::new();
        let mut offset = 0u64;

        let push = |outputs: &mut Vec<ReturnRef>, ty: &str, offset: &mut u64| {
            let is_dynamic = is_dynamic_type_str(ty);
            outputs.push(ReturnRef {
                call_index,
                offset: *offset,
                size: 32,
                is_dynamic,
                requires_length: is_dynamic,
                length: None,
                ty: ty.to_string(),
            });
            *offset += 32;
        };

        for output in &function.outputs {
            if output.ty == "tuple" {
                for comp in &output.components {
                    // Nested tuples are deferred; flatten one level of scalar components.
                    push(&mut outputs, &comp.ty, &mut offset);
                }
            } else {
                push(&mut outputs, &output.ty, &mut offset);
            }
        }

        outputs
    }

    /// Mirrors `build()`. Produces `(targets, offsets, calldatas, msgValues)`.
    pub fn build(&self) -> Result<BuildOutput, BuildError> {
        let mut out = BuildOutput::default();

        for (call_index, call) in self.calls.iter().enumerate() {
            out.targets.push(call.target);
            out.calldatas.push(call.fn_calldata.clone());

            if call.mem_targets.len() > codec::PARTIAL_RETURN_VARS as usize {
                return Err(BuildError::TooManyVars {
                    call: call_index,
                    count: call.mem_targets.len(),
                });
            }
            for j in 0..call.return_offsets.len() {
                if call.return_offsets[j] + call.result_lengths[j] > call.return_data_size {
                    return Err(BuildError::SliceExceedsReturnData { call: call_index, var: j });
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
            } else if !call.mem_targets.is_empty() {
                let msg_value_index = if call.msg_value > U256::ZERO {
                    out.msg_values.len() as u64 + 1
                } else {
                    0
                };
                if call.msg_value > U256::ZERO {
                    out.msg_values.push(call.msg_value);
                }
                codec::call_partial_return(
                    msg_value_index,
                    &call.mem_targets,
                    &call.result_lengths,
                    &call.return_offsets,
                    call.return_data_size,
                )?
            } else if call.msg_value > U256::ZERO {
                let idx = out.msg_values.len() as u64 + 1;
                out.msg_values.push(call.msg_value);
                codec::state_changing_call(idx)?
            } else {
                codec::state_changing_call(0)?
            };

            out.offsets.push(offset);
        }

        Ok(out)
    }
}

fn encode_calldata(function: &Function, values: &[DynSolValue]) -> Bytes {
    let encoded = DynSolValue::Tuple(values.to_vec()).abi_encode_params();
    let mut data = function.selector().to_vec();
    data.extend_from_slice(&encoded);
    Bytes::from(data)
}

fn is_dynamic_type(ty: &DynSolType) -> bool {
    matches!(ty, DynSolType::Bytes | DynSolType::String | DynSolType::Array(_))
}

fn is_dynamic_type_str(ty: &str) -> bool {
    if ty == "bytes" || ty == "string" {
        return true;
    }
    if let Some(stripped) = ty.strip_suffix("[]") {
        return stripped != "string" && stripped != "bytes";
    }
    false
}

/// Byte length of a dynamic literal's data region (excluding the length word), padded to 32.
fn dynamic_value_data_size(v: &DynSolValue) -> u64 {
    let len = match v {
        DynSolValue::Bytes(b) => b.len() as u64,
        DynSolValue::String(s) => s.len() as u64,
        DynSolValue::Array(items) => return items.len() as u64 * 32,
        _ => 0,
    };
    len.div_ceil(32) * 32
}

/// Placeholder value for a dynamic ref argument, sized to `n` so its calldata layout (and thus the
/// reserved splice region) matches the JS builder byte-for-byte: `string` -> `n` spaces, `bytes`
/// -> `n` zero bytes, `T[]` -> `n` default elements.
fn placeholder_value(ty: &DynSolType, n: u64) -> DynSolValue {
    let n = n as usize;
    match ty {
        DynSolType::String => DynSolValue::String(" ".repeat(n)),
        DynSolType::Bytes => DynSolValue::Bytes(vec![0u8; n]),
        DynSolType::Array(inner) => DynSolValue::Array((0..n).map(|_| default_value(inner)).collect()),
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
