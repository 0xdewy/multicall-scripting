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
    for call in &calls {
        validate_json_numbers(call)?;
    }
    let mut builder = TransactionBuilder::new();

    for call in &calls {
        let abi_path = call["abiPath"].as_str().ok_or("missing abiPath")?;
        let function_name = call["functionName"]
            .as_str()
            .ok_or("missing functionName")?;
        let target: Address = call["target"]
            .as_str()
            .ok_or("missing target")?
            .parse()
            .map_err(|e| format!("invalid target address: {e}"))?;
        let value = parse_u256(&call["value"])?;

        let abi = load_abi(abi_path)?;
        let functions = abi
            .function(function_name)
            .ok_or_else(|| format!("Function {function_name} not found in ABI"))?;
        if functions.len() != 1 {
            return Err(format!("Ambiguous function {function_name}; supply an ABI containing only the intended overload"));
        }
        let function = &functions[0];

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
        "calldatas": out.calldatas.to_string(),
        "msgValues": out.msg_values.iter().map(|v| v.to_string()).collect::<Vec<_>>(),
    });
    println!(
        "{}",
        serde_json::to_string(&result).map_err(|e| e.to_string())?
    );
    Ok(())
}

fn build_args(function: &Function, json_args: &[Value]) -> Result<Vec<Arg>, String> {
    let mut out = Vec::with_capacity(json_args.len());
    for (i, raw) in json_args.iter().enumerate() {
        // A partial-return reference: { callIndex, offset, size }
        if let Some(obj) = raw.as_object() {
            if obj.contains_key("callIndex") {
                let call_index = obj["callIndex"]
                    .as_u64()
                    .ok_or("ref.callIndex must be a number")?
                    as usize;
                let offset = obj["offset"]
                    .as_u64()
                    .ok_or("ref.offset must be a number")?;
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

fn validate_json_numbers(value: &Value) -> Result<(), String> {
    match value {
        Value::Number(n)
            if !n
                .as_i64()
                .is_some_and(|v| v.unsigned_abs() <= 9_007_199_254_740_991) =>
        {
            return Err("JSON numbers must be safe integers; quote large integers".into());
        }
        Value::Array(items) => {
            for item in items {
                validate_json_numbers(item)?;
            }
        }
        Value::Object(items) => {
            for item in items.values() {
                validate_json_numbers(item)?;
            }
        }
        _ => {}
    }
    Ok(())
}

fn parse_u256(val: &Value) -> Result<U256, String> {
    match val {
        Value::Null => Ok(U256::ZERO),
        Value::String(s) => {
            let valid = if let Some(hex) = s.strip_prefix("0x").or_else(|| s.strip_prefix("0X")) {
                !hex.is_empty() && hex.bytes().all(|c| c.is_ascii_hexdigit())
            } else {
                !s.is_empty() && s.bytes().all(|c| c.is_ascii_digit())
            };
            if !valid {
                return Err("value must fit uint256".into());
            }
            s.parse().map_err(|_| "value must fit uint256".into())
        }
        Value::Number(n) => n
            .as_u64()
            .map(U256::from)
            .ok_or("value must fit uint256".into()),
        _ => Err("value must fit uint256".into()),
    }
}

/// Loads an ABI from a file, accepting either a raw ABI array or a Foundry artifact `{ "abi": [...] }`.
/// Mirrors js/abi.js (minus the multi-path fallback — the caller passes an explicit path).
fn load_abi(path: &str) -> Result<JsonAbi, String> {
    let raw = fs::read_to_string(path).map_err(|e| format!("cannot read ABI {path}: {e}"))?;
    let value: Value =
        serde_json::from_str(&raw).map_err(|e| format!("invalid ABI JSON {path}: {e}"))?;
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

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn malformed_value_is_not_silently_zero() {
        for value in [
            json!("oops"),
            json!(""),
            json!(" "),
            json!("0x"),
            json!("-1"),
            json!(-1),
            json!(1.5),
            json!(true),
        ] {
            assert!(parse_u256(&value).is_err(), "{value}");
        }
        assert_eq!(parse_u256(&Value::Null).unwrap(), U256::ZERO);
        assert_eq!(
            parse_u256(&json!(U256::MAX.to_string())).unwrap(),
            U256::MAX
        );
    }
    #[test]
    fn large_json_numbers_are_rejected_recursively() {
        assert!(validate_json_numbers(&json!({"args": [[9007199254740993u64]]})).is_err());
        assert!(validate_json_numbers(&json!({"args": [["9007199254740993"]]})).is_ok());
        assert!(validate_json_numbers(&json!({"args": [9007199254740991u64]})).is_ok());
    }
}
