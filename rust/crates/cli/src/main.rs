//! CLI for building multicall transactions — Rust port of js/cli.js.
//!
//! Usage: `tx-builder-rs '<callsJSON>'` where callsJSON is an array of
//! `{abiPath, target, functionName, args, value}`. Prints the same JSON shape as js/cli.js
//! (`{targets, offsets, calldatas, msgValues}`), so the Foundry FFI tests in test/JsLibrary.t.sol
//! (and the Rust-backed RustLibrary tests) can consume Rust output unchanged.

use std::fs;
use std::process::exit;

use alloy_dyn_abi::{DynSolType, DynSolValue};
use alloy_json_abi::{Function, JsonAbi};
use alloy_primitives::{Address, U256};
use multicall_scripter::{Arg, ReturnRef, TransactionBuilder};
use serde_json::{json, Value};

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 2 {
        eprintln!("Usage: tx-builder-rs <callsJSON>");
        exit(1);
    }
    if let Err(e) = run(&args[1]) {
        eprintln!("Error: {e}");
        exit(1);
    }
}

fn run(calls_json: &str) -> Result<(), String> {
    let calls: Vec<Value> = serde_json::from_str(calls_json).map_err(|e| e.to_string())?;
    let mut builder = TransactionBuilder::new();

    for call in &calls {
        let abi_path = call["abiPath"].as_str().ok_or("missing abiPath")?;
        let function_name = call["functionName"].as_str().ok_or("missing functionName")?;
        let target: Address = call["target"]
            .as_str()
            .ok_or("missing target")?
            .parse()
            .map_err(|e| format!("invalid target address: {e}"))?;
        let value = parse_u256(&call["value"]);

        let abi = load_abi(abi_path)?;
        let function = abi
            .function(function_name)
            .and_then(|fns| fns.first())
            .ok_or_else(|| format!("Function {function_name} not found in ABI"))?;

        let json_args = call["args"].as_array().cloned().unwrap_or_default();
        if json_args.len() != function.inputs.len() {
            return Err(format!(
                "Argument count mismatch for {function_name}: {} vs {}",
                json_args.len(),
                function.inputs.len()
            ));
        }

        let built_args = build_args(function, &json_args)?;
        builder
            .add_call(function, target, built_args, value)
            .map_err(|e| format!("Error processing call {function_name}: {e}"))?;
    }

    let out = builder.build().map_err(|e| e.to_string())?;

    let result = json!({
        "targets": out.targets.iter().map(|a| a.to_string()).collect::<Vec<_>>(),
        "offsets": out.offsets.iter().map(|o| o.to_string()).collect::<Vec<_>>(),
        "calldatas": out.calldatas.iter().map(|c| c.to_string()).collect::<Vec<_>>(),
        "msgValues": out.msg_values.iter().map(|v| v.to_string()).collect::<Vec<_>>(),
    });
    println!("{}", serde_json::to_string(&result).map_err(|e| e.to_string())?);
    Ok(())
}

fn build_args(function: &Function, json_args: &[Value]) -> Result<Vec<Arg>, String> {
    let mut out = Vec::with_capacity(json_args.len());
    for (i, raw) in json_args.iter().enumerate() {
        // A partial-return reference: { callIndex, offset, size }
        if let Some(obj) = raw.as_object() {
            if obj.contains_key("callIndex") {
                let call_index = obj["callIndex"].as_u64().ok_or("ref.callIndex must be a number")? as usize;
                let offset = obj["offset"].as_u64().ok_or("ref.offset must be a number")?;
                let size = obj["size"].as_u64().ok_or("ref.size must be a number")?;
                out.push(Arg::Ref(ReturnRef::raw(call_index, offset, size)));
                continue;
            }
        }
        let ty: DynSolType = function.inputs[i]
            .selector_type()
            .parse()
            .map_err(|e| format!("bad type for arg {i}: {e}"))?;
        out.push(Arg::Value(coerce(&ty, raw)?));
    }
    Ok(out)
}

/// Coerce a JSON arg into a `DynSolValue` for the given type, via alloy's human-readable parser.
fn coerce(ty: &DynSolType, val: &Value) -> Result<DynSolValue, String> {
    let s = to_coerce_string(val);
    ty.coerce_str(&s)
        .map_err(|e| format!("cannot coerce `{s}` to {ty:?}: {e}"))
}

fn to_coerce_string(val: &Value) -> String {
    match val {
        Value::String(s) => s.clone(),
        Value::Number(n) => n.to_string(),
        Value::Bool(b) => b.to_string(),
        Value::Array(items) => {
            let inner: Vec<String> = items.iter().map(to_coerce_string).collect();
            format!("[{}]", inner.join(","))
        }
        Value::Null => String::new(),
        Value::Object(_) => val.to_string(),
    }
}

fn parse_u256(val: &Value) -> U256 {
    match val {
        Value::String(s) if !s.is_empty() => s.parse().unwrap_or(U256::ZERO),
        Value::Number(n) => U256::from(n.as_u64().unwrap_or(0)),
        _ => U256::ZERO,
    }
}

/// Loads an ABI from a file, accepting either a raw ABI array or a Foundry artifact `{ "abi": [...] }`.
/// Mirrors js/abi.js (minus the multi-path fallback — the caller passes an explicit path).
fn load_abi(path: &str) -> Result<JsonAbi, String> {
    let raw = fs::read_to_string(path).map_err(|e| format!("cannot read ABI {path}: {e}"))?;
    let value: Value = serde_json::from_str(&raw).map_err(|e| format!("invalid ABI JSON {path}: {e}"))?;
    let abi_value = if value.is_array() {
        value
    } else {
        value
            .get("abi")
            .cloned()
            .ok_or_else(|| format!("ABI file {path} has no `abi` field and is not an array"))?
    };
    serde_json::from_value(abi_value).map_err(|e| format!("cannot parse ABI {path}: {e}"))
}
