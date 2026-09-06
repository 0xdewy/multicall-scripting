//! Offset encoding/decoding for multicall-scripting.
//!
//! Direct port of `js/encoding.js`. All constants and the bit layout are generated at build time
//! from `schema/offset-schema.json` (the canonical source of truth shared with the Solidity and
//! JavaScript layers) — see `build.rs`. `src/MulticallScripter.sol` must mirror these definitions
//! exactly.

use alloy_primitives::U256;
use thiserror::Error;

// Generated: VALUE_OFFSET, PARTIAL_RETURN_VARS, per-flag u8 constants, and FLAGS table.
include!(concat!(env!("OUT_DIR"), "/schema_constants.rs"));

/// Errors mirror the `throw new Error(...)` messages in `js/encoding.js` so the three layers
/// agree on rejection cases as well as on accepted encodings.
#[derive(Debug, Error, PartialEq, Eq)]
pub enum CodecError {
    #[error("memTarget value too large")]
    MemTargetTooLarge,
    #[error("resultLength value too large")]
    ResultLengthTooLarge,
    #[error("returnOffset value too large")]
    ReturnOffsetTooLarge,
    #[error("msgValueIndex too large")]
    MsgValueIndexTooLarge,
    #[error("returnDataSize is too large")]
    ReturnDataSizeTooLarge,
    #[error("invalid number of params")]
    InvalidNumberOfParams,
    #[error("mismatched memTargets/resultLengths/returnOffsets lengths")]
    MismatchedLengths,
    #[error("Unknown calltype: 0x{0:x}")]
    UnknownCalltype(u8),
}

#[inline]
fn mask(bits: u32) -> U256 {
    (U256::from(1u64) << (bits as usize)) - U256::from(1u64)
}

fn uint120_max() -> U256 {
    mask(120)
}

#[inline]
fn as_u64(v: U256) -> u64 {
    u64::try_from(v).expect("masked value fits in u64")
}

// ---- Encode helpers (return the 256-bit offset word) ----

/// Mirrors `staticCall(memTarget, resultLength)`.
pub fn static_call(mem_target: U256, result_length: U256) -> Result<U256, CodecError> {
    if mem_target > uint120_max() {
        return Err(CodecError::MemTargetTooLarge);
    }
    if result_length > uint120_max() {
        return Err(CodecError::ResultLengthTooLarge);
    }
    Ok((U256::from(STATIC_CALL_FLAG) << (VALUE_OFFSET as usize))
        | (mem_target << 120usize)
        | result_length)
}

/// Mirrors `stateChangingCall(msgValueIndex = 0)`.
pub fn state_changing_call(msg_value_index: u64) -> Result<U256, CodecError> {
    if msg_value_index > 0xFF {
        return Err(CodecError::MsgValueIndexTooLarge);
    }
    Ok((U256::from(CALL_FLAG) << (VALUE_OFFSET as usize))
        | (U256::from(msg_value_index) << 240usize))
}

/// Mirrors `staticCallPartialReturn(memTargets, resultLengths, returnOffsets, returnDataSize)`.
pub fn static_call_partial_return(
    mem_targets: &[u64],
    result_lengths: &[u64],
    return_offsets: &[u64],
    return_data_size: u64,
) -> Result<U256, CodecError> {
    encode_partial(
        STATIC_CALL_PARTIAL_RETURN_FLAG,
        None,
        mem_targets,
        result_lengths,
        return_offsets,
        return_data_size,
    )
}

/// Mirrors `callPartialReturn(msgValueIndex, memTargets, resultLengths, returnOffsets, returnDataSize)`.
pub fn call_partial_return(
    msg_value_index: u64,
    mem_targets: &[u64],
    result_lengths: &[u64],
    return_offsets: &[u64],
    return_data_size: u64,
) -> Result<U256, CodecError> {
    encode_partial(
        CALL_PARTIAL_RETURN_FLAG,
        Some(msg_value_index),
        mem_targets,
        result_lengths,
        return_offsets,
        return_data_size,
    )
}

fn encode_partial(
    flag: u8,
    msg_value_index: Option<u64>,
    mem_targets: &[u64],
    result_lengths: &[u64],
    return_offsets: &[u64],
    return_data_size: u64,
) -> Result<U256, CodecError> {
    let vars = PARTIAL_RETURN_VARS as usize;
    if mem_targets.len() > vars || result_lengths.len() > vars || return_offsets.len() > vars {
        return Err(CodecError::InvalidNumberOfParams);
    }
    if mem_targets.len() != result_lengths.len() || result_lengths.len() != return_offsets.len() {
        return Err(CodecError::MismatchedLengths);
    }
    if let Some(idx) = msg_value_index {
        if idx > 0xFF {
            return Err(CodecError::MsgValueIndexTooLarge);
        }
    }
    if return_data_size > u16::MAX as u64 {
        return Err(CodecError::ReturnDataSizeTooLarge);
    }

    let uint40_max = u64::from(u32::MAX) << 8 | 0xFF; // (1<<40)-1
    let uint16_max = u16::MAX as u64;

    let len = mem_targets.len();
    let mut encoded_mem_targets = U256::ZERO;
    let mut encoded_result_lengths = U256::ZERO;
    let mut encoded_offsets = U256::ZERO;

    for i in 0..len {
        let v_mem_target = mem_targets[i];
        let v_result_length = result_lengths[i];
        let v_return_offset = return_offsets[i];

        if v_mem_target > uint40_max {
            return Err(CodecError::MemTargetTooLarge);
        }
        if v_result_length > uint16_max {
            return Err(CodecError::ResultLengthTooLarge);
        }
        if v_return_offset > uint16_max {
            return Err(CodecError::ReturnOffsetTooLarge);
        }

        // MSB packing, identical to encoding.js: varOffset = PARTIAL_RETURN_VARS - (i + 1)
        let var_offset = PARTIAL_RETURN_VARS as usize - (i + 1);
        encoded_mem_targets |= U256::from(v_mem_target) << (var_offset * 40);
        encoded_result_lengths |= U256::from(v_result_length) << (var_offset * 16);
        encoded_offsets |= U256::from(v_return_offset) << (var_offset * 16);
    }

    let value_bits = match msg_value_index {
        Some(idx) => U256::from(idx) << 240usize,
        None => U256::ZERO,
    };

    Ok((U256::from(flag) << (VALUE_OFFSET as usize))
        | value_bits
        | (encoded_mem_targets << 120usize)
        | (encoded_result_lengths << 72usize)
        | (encoded_offsets << 24usize)
        | (U256::from(return_data_size) << 8usize)
        | U256::from(len as u64))
}

// ---- Decode helpers ----

pub fn decode_calltype(offset: U256) -> u8 {
    u8::try_from(offset >> (VALUE_OFFSET as usize)).expect("calltype is one byte")
}

pub fn decode_value_index(offset: U256, flag: u8) -> u64 {
    if flag != CALL_FLAG && flag != CALL_PARTIAL_RETURN_FLAG {
        return 0;
    }
    as_u64((offset >> 240usize) & U256::from(0xFFu64))
}

pub fn decode_mem_target(offset: U256) -> U256 {
    (offset >> 120usize) & uint120_max()
}

pub fn decode_result_length(offset: U256) -> U256 {
    offset & uint120_max()
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PartialReturn {
    pub mem_targets: Vec<u64>,
    pub result_lengths: Vec<u64>,
    pub return_offsets: Vec<u64>,
    pub return_data_size: u64,
    pub num_vars: u32,
}

pub fn decode_partial_return(offset: U256) -> Result<PartialReturn, CodecError> {
    let num_vars = as_u64(offset & U256::from(0xFFu64)) as u32;
    if num_vars > PARTIAL_RETURN_VARS {
        return Err(CodecError::InvalidNumberOfParams);
    }
    let return_data_size = as_u64((offset >> 8usize) & U256::from(0xFFFFu64));

    let raw_return_offsets = (offset >> 24usize) & U256::from(0xFFFFFFFFFFFFu64);
    let raw_result_lengths = (offset >> 72usize) & U256::from(0xFFFFFFFFFFFFu64);
    let raw_mem_targets = (offset >> 120usize) & mask(120);

    let mut mem_targets = Vec::new();
    let mut result_lengths = Vec::new();
    let mut return_offsets = Vec::new();

    for i in 0..num_vars as usize {
        let var_shift = (PARTIAL_RETURN_VARS as usize - (i + 1)) * 40;
        let small_shift = (PARTIAL_RETURN_VARS as usize - (i + 1)) * 16;
        mem_targets.push(as_u64(
            (raw_mem_targets >> var_shift) & U256::from(0xFFFFFFFFFFu64),
        ));
        result_lengths.push(as_u64(
            (raw_result_lengths >> small_shift) & U256::from(0xFFFFu64),
        ));
        return_offsets.push(as_u64(
            (raw_return_offsets >> small_shift) & U256::from(0xFFFFu64),
        ));
    }

    Ok(PartialReturn {
        mem_targets,
        result_lengths,
        return_offsets,
        return_data_size,
        num_vars,
    })
}

/// Mirrors `validateOffset`: rejects calltype bytes the executor does not understand.
pub fn validate_offset(offset: U256) -> Result<(), CodecError> {
    let calltype = decode_calltype(offset);
    if FLAGS.iter().any(|(value, _)| *value == calltype) {
        if matches!(
            calltype,
            STATIC_CALL_PARTIAL_RETURN_FLAG | CALL_PARTIAL_RETURN_FLAG
        ) && as_u64(offset & U256::from(0xFFu64)) > PARTIAL_RETURN_VARS as u64
        {
            return Err(CodecError::InvalidNumberOfParams);
        }
        Ok(())
    } else {
        Err(CodecError::UnknownCalltype(calltype))
    }
}
