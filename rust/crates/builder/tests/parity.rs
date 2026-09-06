//! Whole-transaction parity: the Rust builder must reproduce the JS builder's full `build()`
//! output (offsets + calldatas + msgValues) for every implemented branch. Vectors are generated
//! by `bun js/scripts/gen-build-vectors.js` into js/build-vectors.json. The inline ABI here is a
//! verbatim copy of the one in that script.

use alloy_dyn_abi::DynSolValue;
use alloy_json_abi::{Function, JsonAbi};
use alloy_primitives::{Address, U256};
use multicall_scripter::{Arg, BuildOutput, TransactionBuilder};
use serde_json::Value;

const VECTORS: &str = include_str!("../../../../js/build-vectors.json");

const ABI: &str = r#"[
  {"type":"function","name":"add","stateMutability":"pure","inputs":[{"name":"a","type":"uint256"},{"name":"b","type":"uint256"}],"outputs":[{"name":"","type":"uint256"}]},
  {"type":"function","name":"setNum","stateMutability":"nonpayable","inputs":[{"name":"n","type":"uint256"}],"outputs":[]},
  {"type":"function","name":"getThree","stateMutability":"pure","inputs":[],"outputs":[{"name":"","type":"uint256"},{"name":"","type":"uint256"},{"name":"","type":"uint256"}]},
  {"type":"function","name":"setThree","stateMutability":"nonpayable","inputs":[{"name":"a","type":"uint256"},{"name":"b","type":"uint256"},{"name":"c","type":"uint256"}],"outputs":[]},
  {"type":"function","name":"getConstantString","stateMutability":"pure","inputs":[],"outputs":[{"name":"","type":"string"}]},
  {"type":"function","name":"setText","stateMutability":"nonpayable","inputs":[{"name":"t","type":"string"}],"outputs":[]},
  {"type":"function","name":"setUintValue","stateMutability":"payable","inputs":[],"outputs":[]},
  {"type":"function","name":"deposit","stateMutability":"payable","inputs":[],"outputs":[{"name":"","type":"uint256"}]},
  {"type":"function","name":"getConstant","stateMutability":"pure","inputs":[],"outputs":[{"name":"","type":"uint64"}]},
  {"type":"function","name":"setStaticThenWord","stateMutability":"nonpayable","inputs":[{"name":"s","type":"tuple","components":[{"name":"nA","type":"uint256"},{"name":"nB","type":"uint256"}]},{"name":"w","type":"uint256"}],"outputs":[]}
]"#;

fn target() -> Address {
    "0x0000000000000000000000000000000000000001"
        .parse()
        .unwrap()
}

fn uint(n: u64) -> Arg {
    Arg::Value(DynSolValue::Uint(U256::from(n), 256))
}

struct Abi {
    abi: JsonAbi,
}
impl Abi {
    fn load() -> Self {
        Self {
            abi: serde_json::from_str(ABI).unwrap(),
        }
    }
    fn f(&self, name: &str) -> &Function {
        &self.abi.function(name).unwrap()[0]
    }
}

fn scalar_chain(abi: &Abi) -> BuildOutput {
    let mut b = TransactionBuilder::new();
    let x = b
        .add_call(abi.f("add"), target(), vec![uint(2), uint(2)], U256::ZERO)
        .unwrap();
    let y = b
        .add_call(
            abi.f("add"),
            target(),
            vec![uint(2), Arg::Ref(x[0].clone())],
            U256::ZERO,
        )
        .unwrap();
    b.add_call(
        abi.f("setNum"),
        target(),
        vec![Arg::Ref(y[0].clone())],
        U256::ZERO,
    )
    .unwrap();
    b.build().unwrap()
}

fn multi_return(abi: &Abi) -> BuildOutput {
    let mut b = TransactionBuilder::new();
    let r = b
        .add_call(abi.f("getThree"), target(), vec![], U256::ZERO)
        .unwrap();
    b.add_call(
        abi.f("setThree"),
        target(),
        vec![
            Arg::Ref(r[0].clone()),
            Arg::Ref(r[1].clone()),
            Arg::Ref(r[2].clone()),
        ],
        U256::ZERO,
    )
    .unwrap();
    b.build().unwrap()
}

fn msg_value_no_return(abi: &Abi) -> BuildOutput {
    let mut b = TransactionBuilder::new();
    b.add_call(abi.f("setUintValue"), target(), vec![], U256::from(1000u64))
        .unwrap();
    b.build().unwrap()
}

fn msg_value_with_return(abi: &Abi) -> BuildOutput {
    let mut b = TransactionBuilder::new();
    let r = b
        .add_call(abi.f("deposit"), target(), vec![], U256::from(500u64))
        .unwrap();
    b.add_call(
        abi.f("setNum"),
        target(),
        vec![Arg::Ref(r[0].clone())],
        U256::ZERO,
    )
    .unwrap();
    b.build().unwrap()
}

fn dynamic_string(abi: &Abi) -> BuildOutput {
    let mut b = TransactionBuilder::new();
    let s = b
        .add_call(abi.f("getConstantString"), target(), vec![], U256::ZERO)
        .unwrap();
    let s = s.into_iter().next().unwrap().with_length(24);
    b.add_call(abi.f("setText"), target(), vec![Arg::Ref(s)], U256::ZERO)
        .unwrap();
    b.build().unwrap()
}

fn static_no_consumer(abi: &Abi) -> BuildOutput {
    let mut b = TransactionBuilder::new();
    b.add_call(abi.f("getConstant"), target(), vec![], U256::ZERO)
        .unwrap();
    b.add_call(abi.f("setNum"), target(), vec![uint(5)], U256::ZERO)
        .unwrap();
    b.build().unwrap()
}

fn static_tuple_then_ref(abi: &Abi) -> BuildOutput {
    let mut b = TransactionBuilder::new();
    let w = b
        .add_call(abi.f("getConstant"), target(), vec![], U256::ZERO)
        .unwrap();
    let s = DynSolValue::Tuple(vec![
        DynSolValue::Uint(U256::from(1u64), 256),
        DynSolValue::Uint(U256::from(2u64), 256),
    ]);
    b.add_call(
        abi.f("setStaticThenWord"),
        target(),
        vec![Arg::Value(s), Arg::Ref(w[0].clone())],
        U256::ZERO,
    )
    .unwrap();
    b.build().unwrap()
}

fn consumer_two_calls_later(abi: &Abi) -> BuildOutput {
    let mut b = TransactionBuilder::new();
    let w = b
        .add_call(abi.f("getConstant"), target(), vec![], U256::ZERO)
        .unwrap();
    b.add_call(abi.f("setNum"), target(), vec![uint(1)], U256::ZERO)
        .unwrap();
    b.add_call(
        abi.f("setNum"),
        target(),
        vec![Arg::Ref(w[0].clone())],
        U256::ZERO,
    )
    .unwrap();
    b.build().unwrap()
}

fn scalar_fanout(abi: &Abi) -> BuildOutput {
    let mut b = TransactionBuilder::new();
    let x = b
        .add_call(abi.f("add"), target(), vec![uint(2), uint(2)], U256::ZERO)
        .unwrap();
    b.add_call(
        abi.f("add"),
        target(),
        vec![Arg::Ref(x[0].clone()), Arg::Ref(x[0].clone())],
        U256::ZERO,
    )
    .unwrap();
    b.add_call(
        abi.f("setNum"),
        target(),
        vec![Arg::Ref(x[0].clone())],
        U256::ZERO,
    )
    .unwrap();
    b.build().unwrap()
}

fn assert_matches(name: &str, out: &BuildOutput, vectors: &[Value]) {
    let v = vectors
        .iter()
        .find(|s| s["name"] == name)
        .unwrap_or_else(|| panic!("no vector named {name}"));

    let exp_offsets: Vec<U256> = v["offsets"]
        .as_array()
        .unwrap()
        .iter()
        .map(|s| s.as_str().unwrap().parse().unwrap())
        .collect();
    let exp_calldatas = v["calldatas"].as_str().unwrap();
    let exp_values: Vec<U256> = v["msgValues"]
        .as_array()
        .unwrap()
        .iter()
        .map(|s| s.as_str().unwrap().parse().unwrap())
        .collect();

    assert_eq!(out.offsets, exp_offsets, "[{name}] offsets differ");
    let got_calldatas = out.calldatas.to_string();
    assert_eq!(got_calldatas, exp_calldatas, "[{name}] calldatas differ");
    assert_eq!(out.msg_values, exp_values, "[{name}] msgValues differ");
}

#[test]
fn whole_tx_parity_with_js() {
    let abi = Abi::load();
    let vectors: Vec<Value> = serde_json::from_str(VECTORS).unwrap();

    assert_matches("scalar_fanout", &scalar_fanout(&abi), &vectors);
    assert_matches("scalar_chain", &scalar_chain(&abi), &vectors);
    assert_matches("multi_return", &multi_return(&abi), &vectors);
    assert_matches("msg_value_no_return", &msg_value_no_return(&abi), &vectors);
    assert_matches(
        "msg_value_with_return",
        &msg_value_with_return(&abi),
        &vectors,
    );
    assert_matches("dynamic_string", &dynamic_string(&abi), &vectors);
    assert_matches("static_no_consumer", &static_no_consumer(&abi), &vectors);
    assert_matches(
        "static_tuple_then_ref",
        &static_tuple_then_ref(&abi),
        &vectors,
    );
    assert_matches(
        "consumer_two_calls_later",
        &consumer_two_calls_later(&abi),
        &vectors,
    );
}
