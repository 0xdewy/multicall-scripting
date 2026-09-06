//! Parity check for the core scalar-chaining path: reproduces the `math.add` chain from
//! test/MulticallScripter.t.sol (test_simple_usage_raw) and asserts the produced offsets equal
//! the codec encoding the on-chain VM expects.

use alloy_dyn_abi::DynSolValue;
use alloy_json_abi::JsonAbi;
use alloy_primitives::{Address, U256};
use multicall_scripter::{Arg, TransactionBuilder};
use multicall_scripter_codec as codec;

const ABI: &str = r#"[
  {"type":"function","name":"add","stateMutability":"view",
   "inputs":[{"name":"a","type":"uint256"},{"name":"b","type":"uint256"}],
   "outputs":[{"name":"","type":"uint256"}]},
  {"type":"function","name":"setNum","stateMutability":"nonpayable",
   "inputs":[{"name":"n","type":"uint256"}],"outputs":[]}
]"#;

// Extra ABI for error-path coverage: a 4-return function (exceeds the 3-var limit) and a
// dynamic-returning function (exercises the with_length requirement).
const ABI2: &str = r#"[
  {"type":"function","name":"getFour","stateMutability":"pure","inputs":[],
   "outputs":[{"name":"","type":"uint256"},{"name":"","type":"uint256"},{"name":"","type":"uint256"},{"name":"","type":"uint256"}]},
  {"type":"function","name":"setFour","stateMutability":"nonpayable",
   "inputs":[{"name":"a","type":"uint256"},{"name":"b","type":"uint256"},{"name":"c","type":"uint256"},{"name":"d","type":"uint256"}],"outputs":[]},
  {"type":"function","name":"getString","stateMutability":"pure","inputs":[],"outputs":[{"name":"","type":"string"}]},
  {"type":"function","name":"setText","stateMutability":"nonpayable","inputs":[{"name":"t","type":"string"}],"outputs":[]}
]"#;

fn uint(n: u64) -> Arg {
    Arg::Value(DynSolValue::Uint(U256::from(n), 256))
}

#[test]
fn scalar_chaining_offsets_match_codec() {
    let abi: JsonAbi = serde_json::from_str(ABI).unwrap();
    let add = &abi.function("add").unwrap()[0];
    let set_num = &abi.function("setNum").unwrap()[0];
    let target = Address::ZERO;

    let mut b = TransactionBuilder::new();
    // x = add(2, 2)
    let x = b
        .add_call(add, target, vec![uint(2), uint(2)], U256::ZERO)
        .unwrap();
    // y = add(2, x)  — x is spliced into arg index 1 (memTarget 4 + 32*1 = 36)
    let y = b
        .add_call(
            add,
            target,
            vec![uint(2), Arg::Ref(x[0].clone())],
            U256::ZERO,
        )
        .unwrap();
    // setNum(y)      — y is spliced into arg index 0 (memTarget 4)
    b.add_call(set_num, target, vec![Arg::Ref(y[0].clone())], U256::ZERO)
        .unwrap();

    let out = b.build().unwrap();

    assert_eq!(out.targets.len(), 3);
    assert_eq!(out.calldatas.len(), 352);
    assert_eq!(out.msg_values.len(), 0);

    assert_eq!(
        out.offsets[0],
        codec::static_call_partial_return(&[36], &[32], &[0], 32).unwrap(),
        "call0 splices its return into call1 arg index 1"
    );
    assert_eq!(
        out.offsets[1],
        codec::static_call_partial_return(&[4], &[32], &[0], 32).unwrap(),
        "call1 splices its return into call2 arg index 0"
    );
    assert_eq!(
        out.offsets[2],
        codec::state_changing_call(0).unwrap(),
        "call2 is a plain state-changing call"
    );

    // calldata = selector ++ abi-encoded args; add() selector + two 32-byte words.
    assert_eq!(U256::from_be_slice(&out.calldatas[..32]), U256::from(68));
    assert_eq!(
        U256::from_be_slice(&out.calldatas[256..288]),
        U256::from(36)
    );
}

#[test]
fn descriptor_can_feed_multiple_consumers() {
    let abi: JsonAbi = serde_json::from_str(ABI).unwrap();
    let add = &abi.function("add").unwrap()[0];
    let mut b = TransactionBuilder::new();
    let x = b
        .add_call(add, Address::ZERO, vec![uint(1), uint(2)], U256::ZERO)
        .unwrap();
    b.add_call(
        add,
        Address::ZERO,
        vec![Arg::Ref(x[0].clone()), Arg::Ref(x[0].clone())],
        U256::ZERO,
    )
    .unwrap();
    b.add_call(
        add,
        Address::ZERO,
        vec![uint(5), Arg::Ref(x[0].clone())],
        U256::ZERO,
    )
    .unwrap();
    assert_eq!(
        b.build().unwrap().offsets[0],
        codec::static_call_partial_return(&[4, 36, 164], &[32; 3], &[0; 3], 32).unwrap()
    );
}

#[test]
fn rejects_arg_count_mismatch() {
    let abi: JsonAbi = serde_json::from_str(ABI).unwrap();
    let add = &abi.function("add").unwrap()[0];
    let mut b = TransactionBuilder::new();
    // add expects 2 args
    let err = b
        .add_call(add, Address::ZERO, vec![uint(1)], U256::ZERO)
        .unwrap_err();
    assert!(format!("{err}").contains("argument count mismatch"));
}

#[test]
fn rejects_dynamic_ref_without_length() {
    let abi: JsonAbi = serde_json::from_str(ABI2).unwrap();
    let get_string = &abi.function("getString").unwrap()[0];
    let set_text = &abi.function("setText").unwrap()[0];
    let mut b = TransactionBuilder::new();
    let s = b
        .add_call(get_string, Address::ZERO, vec![], U256::ZERO)
        .unwrap();
    // pass the dynamic ref to setText WITHOUT calling with_length() first
    let err = b
        .add_call(
            set_text,
            Address::ZERO,
            vec![Arg::Ref(s[0].clone())],
            U256::ZERO,
        )
        .unwrap_err();
    assert!(format!("{err}").contains("requires with_length"));
}

#[test]
fn rejects_more_than_three_vars() {
    let abi: JsonAbi = serde_json::from_str(ABI2).unwrap();
    let get_four = &abi.function("getFour").unwrap()[0];
    let set_four = &abi.function("setFour").unwrap()[0];
    let mut b = TransactionBuilder::new();
    let r = b
        .add_call(get_four, Address::ZERO, vec![], U256::ZERO)
        .unwrap();
    // chaining all 4 returns into one consumer => producing call has 4 vars (> PARTIAL_RETURN_VARS)
    b.add_call(
        set_four,
        Address::ZERO,
        vec![
            Arg::Ref(r[0].clone()),
            Arg::Ref(r[1].clone()),
            Arg::Ref(r[2].clone()),
            Arg::Ref(r[3].clone()),
        ],
        U256::ZERO,
    )
    .unwrap();
    let err = b.build().unwrap_err();
    assert!(format!("{err}").contains("too many variables"));
}

#[test]
fn mismatched_array_layout_is_rejected_without_poisoning_builder() {
    let abi: JsonAbi = serde_json::from_str(r#"[
        {"type":"function","name":"get","stateMutability":"pure","inputs":[],"outputs":[{"type":"uint256[2][]"}]},
        {"type":"function","name":"bad","stateMutability":"pure","inputs":[{"type":"uint256[]"}],"outputs":[]},
        {"type":"function","name":"good","stateMutability":"pure","inputs":[{"type":"uint256[2][]"}],"outputs":[]}
    ]"#).unwrap();
    let mut b = TransactionBuilder::new();
    let r = b
        .add_call(
            &abi.function("get").unwrap()[0],
            Address::ZERO,
            vec![],
            U256::ZERO,
        )
        .unwrap()[0]
        .clone()
        .with_length(2);
    assert!(b
        .add_call(
            &abi.function("bad").unwrap()[0],
            Address::ZERO,
            vec![Arg::Ref(r.clone())],
            U256::ZERO
        )
        .is_err());
    b.add_call(
        &abi.function("good").unwrap()[0],
        Address::ZERO,
        vec![Arg::Ref(r)],
        U256::ZERO,
    )
    .unwrap();
    assert_eq!(
        b.build().unwrap().offsets[0],
        codec::static_call_partial_return(&[36], &[160], &[32], 192).unwrap()
    );
}

#[test]
fn oversized_dynamic_length_returns_error_without_allocating() {
    let abi: JsonAbi = serde_json::from_str(ABI2).unwrap();
    let mut b = TransactionBuilder::new();
    let r = b
        .add_call(
            &abi.function("getString").unwrap()[0],
            Address::ZERO,
            vec![],
            U256::ZERO,
        )
        .unwrap()[0]
        .clone()
        .with_length(u64::MAX);
    let error = b
        .add_call(
            &abi.function("setText").unwrap()[0],
            Address::ZERO,
            vec![Arg::Ref(r)],
            U256::ZERO,
        )
        .unwrap_err();
    assert!(error.to_string().contains("too large"));
}

#[test]
fn rejects_reference_from_another_builder_without_mutating() {
    let abi: JsonAbi = serde_json::from_str(ABI).unwrap();
    let add = &abi.function("add").unwrap()[0];
    let set_num = &abi.function("setNum").unwrap()[0];
    let mut a = TransactionBuilder::new();
    let mut b = TransactionBuilder::new();
    let own = a
        .add_call(add, Address::ZERO, vec![uint(1), uint(2)], U256::ZERO)
        .unwrap()
        .remove(0);
    let foreign = b
        .add_call(add, Address::ZERO, vec![uint(10), uint(20)], U256::ZERO)
        .unwrap()
        .remove(0);
    let before = a.build().unwrap();
    let err = a
        .add_call(set_num, Address::ZERO, vec![Arg::Ref(foreign)], U256::ZERO)
        .unwrap_err();
    assert!(err.to_string().contains("another builder"));
    assert_eq!(a.build().unwrap().offsets, before.offsets);
    a.add_call(set_num, Address::ZERO, vec![Arg::Ref(own)], U256::ZERO)
        .unwrap();
}
