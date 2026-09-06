//! Property tests mirroring js/test/schemaRoundtrip.test.js and js/test/property-tests.test.js:
//! encode→decode roundtrips, boundary validation, and unknown-flag rejection.

use alloy_primitives::U256;
use multicall_scripter_codec::*;
use proptest::prelude::*;

const U40_MAX: u64 = (1 << 40) - 1;
const U16_MAX: u64 = u16::MAX as u64;
const U120_MASK: u128 = (1u128 << 120) - 1;

// strategy: 1..=3 equal-length arrays of (uint40 memTargets, uint16 result/return), + uint16 size
fn partial_inputs() -> impl Strategy<Value = (Vec<u64>, Vec<u64>, Vec<u64>, u64)> {
    (1usize..=3).prop_flat_map(|n| {
        (
            prop::collection::vec(0u64..=U40_MAX, n),
            prop::collection::vec(0u64..=U16_MAX, n),
            prop::collection::vec(0u64..=U16_MAX, n),
            0u64..=U16_MAX,
        )
    })
}

proptest! {
    #[test]
    fn arbitrary_words_validate_without_panics(limbs in any::<[u64; 4]>()) {
        let word = U256::from_limbs(limbs);
        let flag = decode_calltype(word);
        let count = limbs[0] & 255;
        let partial = flag == STATIC_CALL_PARTIAL_RETURN_FLAG || flag == CALL_PARTIAL_RETURN_FLAG;
        let valid = flag == STATIC_CALL_FLAG || flag == CALL_FLAG || (partial && count <= 3);
        prop_assert_eq!(validate_offset(word).is_ok(), valid);
        prop_assert_eq!(decode_partial_return(word).is_ok(), count <= 3);
    }

    #[test]
    fn static_call_roundtrip(mt in any::<u128>(), rl in any::<u128>()) {
        let mt = U256::from(mt & U120_MASK);
        let rl = U256::from(rl & U120_MASK);
        let offset = static_call(mt, rl).unwrap();
        prop_assert_eq!(decode_calltype(offset), STATIC_CALL_FLAG);
        prop_assert_eq!(decode_mem_target(offset), mt);
        prop_assert_eq!(decode_result_length(offset), rl);
    }

    #[test]
    fn static_partial_roundtrip((mt, rl, ro, size) in partial_inputs()) {
        let offset = static_call_partial_return(&mt, &rl, &ro, size).unwrap();
        prop_assert_eq!(decode_calltype(offset), STATIC_CALL_PARTIAL_RETURN_FLAG);
        let d = decode_partial_return(offset).unwrap();
        prop_assert_eq!(d.mem_targets, mt);
        prop_assert_eq!(d.result_lengths, rl);
        prop_assert_eq!(d.return_offsets, ro);
        prop_assert_eq!(d.return_data_size, size);
    }

    #[test]
    fn call_partial_roundtrip(idx in 0u64..=0xFF, (mt, rl, ro, size) in partial_inputs()) {
        let offset = call_partial_return(idx, &mt, &rl, &ro, size).unwrap();
        prop_assert_eq!(decode_calltype(offset), CALL_PARTIAL_RETURN_FLAG);
        prop_assert_eq!(decode_value_index(offset, CALL_PARTIAL_RETURN_FLAG), idx);
        let d = decode_partial_return(offset).unwrap();
        prop_assert_eq!(d.num_vars as usize, mt.len());
        prop_assert_eq!(d.mem_targets, mt);
    }
}

#[test]
fn rejects_oversized_fields() {
    let over_120 = (U256::from(1u64) << 120usize) + U256::from(1u64);
    assert_eq!(
        static_call(over_120, U256::ZERO),
        Err(CodecError::MemTargetTooLarge)
    );
    assert_eq!(
        static_call(U256::ZERO, over_120),
        Err(CodecError::ResultLengthTooLarge)
    );
    assert_eq!(
        state_changing_call(256),
        Err(CodecError::MsgValueIndexTooLarge)
    );
    assert_eq!(
        static_call_partial_return(&[U40_MAX + 1], &[1], &[0], 1),
        Err(CodecError::MemTargetTooLarge)
    );
    assert_eq!(
        static_call_partial_return(&[1], &[1], &[0], U16_MAX + 1),
        Err(CodecError::ReturnDataSizeTooLarge)
    );
    assert_eq!(
        static_call_partial_return(&[1, 2, 3, 4], &[1, 2, 3, 4], &[0, 0, 0, 0], 1),
        Err(CodecError::InvalidNumberOfParams)
    );
}

#[test]
fn decodes_state_changing_value_index() {
    let offset = state_changing_call(7).unwrap();
    assert_eq!(decode_calltype(offset), CALL_FLAG);
    assert_eq!(decode_value_index(offset, CALL_FLAG), 7);
    // a static call carries no value index
    let sc = static_call(U256::from(4u64), U256::from(32u64)).unwrap();
    assert_eq!(decode_value_index(sc, STATIC_CALL_FLAG), 0);
}

#[test]
fn zero_var_partial_roundtrip() {
    let offset = static_call_partial_return(&[], &[], &[], 0).unwrap();
    assert_eq!(decode_calltype(offset), STATIC_CALL_PARTIAL_RETURN_FLAG);
    let d = decode_partial_return(offset).unwrap();
    assert_eq!(d.num_vars, 0);
    assert!(d.mem_targets.is_empty());
    assert_eq!(d.return_data_size, 0);
}

#[test]
fn rejects_unknown_calltype() {
    let offset = U256::from(0xABu64) << (VALUE_OFFSET as usize);
    assert_eq!(
        validate_offset(offset),
        Err(CodecError::UnknownCalltype(0xAB))
    );
    assert!(validate_offset(static_call(U256::from(4u64), U256::from(32u64)).unwrap()).is_ok());
}

#[test]
fn malformed_partial_counts_never_panic() {
    for count in 4u64..=255 {
        let word = (U256::from(STATIC_CALL_PARTIAL_RETURN_FLAG) << 248usize) | U256::from(count);
        assert_eq!(
            decode_partial_return(word),
            Err(CodecError::InvalidNumberOfParams)
        );
        assert_eq!(
            validate_offset(word),
            Err(CodecError::InvalidNumberOfParams)
        );
    }
}
