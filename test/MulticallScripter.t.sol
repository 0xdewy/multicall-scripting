// SPDX-License-Identifier: GPL3
pragma solidity ^0.8.28;

import {Test, console} from "forge-std/Test.sol";
import {CallBuilder, CallDecoder} from "src/CallBuilder.sol";
import {MulticallScripter} from "src/MulticallScripter.sol";
import {Math, SimpleReturn, DynamicReturn, Fuzzy} from "./Helpers.sol";

contract MulticallScriptTest is Test, CallBuilder, MulticallScripter {
    MulticallScripter multicall;
    CallDecoder callDecoder;

    SimpleReturn simpleReturn;
    DynamicReturn dynamicReturn;
    Math math;
    Fuzzy fuzzy;

    address[] targets;
    uint256[] offsets;
    bytes[] calldatas;
    uint256[] values;

    // partial return types
    uint256[] memTargets;
    uint256[] resultLengths;
    uint256[] returnOffsets;

    function setUp() public {
        multicall = new MulticallScripter();
        simpleReturn = new SimpleReturn();
        dynamicReturn = new DynamicReturn();
        callDecoder = new CallDecoder();
        math = new Math();
        fuzzy = new Fuzzy();
    }

    function test_simple_usage_raw() public {
        // x = math.add(2,2)
        calldatas.push(abi.encodeWithSelector(Math.add.selector, 2, 2));
        targets.push(address(math));
        // save 32 byte output 1 word + 4byte fn selector forward in call chain.
        // save call to first parameter of following call setNum(a,b)
        // specify offset within next call to store(setNum(a,b) == <4byte><32byte(a)><32byte(b)>)
        // so first param is 4 bytes forward
        offsets.push(staticCall(0x24, 0x20));

        // y = math.add(2, x)
        calldatas.push(abi.encodeWithSelector(Math.add.selector, 2, 0));
        targets.push(address(math));
        // next param offset is 4bytes + 32bytes (32==0x20)
        offsets.push(staticCall(0x4, 0x20));

        // math.setNum(y)
        calldatas.push(abi.encodeWithSelector(Math.setNum.selector, 0));
        targets.push(address(math));
        offsets.push(stateChangingCall());

        multicall.execute(targets, offsets, calldatas, values);

        // 2 + 2 => 4 + 2 => 6
        assertEq(math.number(), 6, "failed to add numbers");
    }

    function test_use_static_call_data_simple() public {
        calldatas.push(abi.encodeWithSelector(SimpleReturn.getConstant.selector));
        calldatas.push(abi.encodeWithSelector(SimpleReturn.setUint.selector, 0x0));
        targets.push(address(simpleReturn));
        targets.push(address(simpleReturn));
        uint256 memTarget = 0x4;
        offsets.push(staticCall(memTarget, 0x20));
        offsets.push(stateChangingCall());

        multicall.execute(targets, offsets, calldatas, values);

        assertEq(simpleReturn.getUint(), 69);
    }

    function test_fuzz_simple_set_and_get(uint set) public {
        calldatas.push(abi.encodeWithSelector(SimpleReturn.getConstant.selector));
        calldatas.push(abi.encodeWithSelector(SimpleReturn.setUint.selector, 0x0));
        targets.push(address(simpleReturn));
        targets.push(address(simpleReturn));
        uint256 memTarget = 0x4;
        offsets.push(staticCall(memTarget, 0x20));
        offsets.push(stateChangingCall());

        multicall.execute(targets, offsets, calldatas, values);

        assertEq(simpleReturn.getUint(), 69);
    }

    function test_use_state_changing_call_return(uint val, uint val2) public {
        // x = setUint(val)
        calldatas.push(abi.encodeWithSelector(SimpleReturn.setUint.selector, val));
        targets.push(address(simpleReturn));
        offsets.push(stateChangingCall(0x0, 0x4, 0x20));

        // y = math.add(x, 2)
        calldatas.push(abi.encodeWithSelector(Math.add.selector, 0x4, val2));
        targets.push(address(math));
        offsets.push(staticCall(0x4, 0x20));

        // setUint(y)
        calldatas.push(abi.encodeWithSelector(SimpleReturn.setUint.selector, 0x0));
        targets.push(address(simpleReturn));
        offsets.push(stateChangingCall());
        
        multicall.execute(targets, offsets, calldatas, values);

        uint res;
        unchecked {
          res = val + val2;
        }

        assertEq(simpleReturn.getUint(), res);
    }

    function test_use_raw_data_simple() public {
        calldatas.push(abi.encodeWithSelector(SimpleReturn.setUint.selector, 0x420));
        targets.push(address(simpleReturn));
        offsets.push(stateChangingCall());

        multicall.execute(targets, offsets, calldatas, values);
        assertEq(simpleReturn.getUint(), 0x420);
    }

    function test_multiple_raw_data_simple() public {
        calldatas.push(abi.encodeWithSelector(SimpleReturn.setUint.selector, 0x420));
        calldatas.push(abi.encodeWithSelector(SimpleReturn.setUint.selector, 0x69));
        targets.push(address(simpleReturn));
        targets.push(address(simpleReturn));
        offsets.push(stateChangingCall());
        offsets.push(stateChangingCall());

        multicall.execute(targets, offsets, calldatas, values);
        assertEq(simpleReturn.getUint(), 0x69);
    }

    function test_raw_data_simple_value() public {
        calldatas.push(abi.encodeWithSelector(SimpleReturn.setUintValue.selector));
        targets.push(address(simpleReturn));
        offsets.push(stateChangingCall(0x1));
        values.push(0x420);

        multicall.execute{value: 0x420}(targets, offsets, calldatas, values);

        assertEq(simpleReturn.getUint(), 0x420);
    }

    function test_use_tuple_packed_data() public {
        // getTuplePackedConstant
        calldatas.push(abi.encodeWithSelector(DynamicReturn.getTuplePackedConstant.selector));
        targets.push(address(dynamicReturn));
        uint256 memTarget = 0x4; // add(0x20, add(4, encodedCalldataLen))
        offsets.push(staticCall(memTarget, 0x60)); // tuple is returned with each element padded to 32 bytes

        // setTuplePacked
        calldatas.push(abi.encodeWithSelector(DynamicReturn.setTuplePacked.selector, 0, 0, 0));
        targets.push(address(dynamicReturn));
        offsets.push(stateChangingCall());

        multicall.execute(targets, offsets, calldatas, values);

        (uint128 a, uint64 b, uint64 c) = dynamicReturn.tuplePacked();
        assertEq(a, uint128(1));
        assertEq(b, uint64(2));
        assertEq(c, uint64(3));
    }

    function test_set_tuple_raw() public {
        // set tuple to all max uints
        calldatas.push(
            abi.encodeWithSelector(
                DynamicReturn.setTuple.selector, type(uint256).max, type(uint256).max, type(uint256).max
            )
        );
        targets.push(address(dynamicReturn));
        offsets.push(stateChangingCall());

        multicall.execute(targets, offsets, calldatas, values);

        (uint256 a, uint256 b, uint256 c) = dynamicReturn.tuple();
        assertEq(a, type(uint256).max);
        assertEq(b, type(uint256).max);
        assertEq(c, type(uint256).max);
    }

    function test_use_tuple_data() public {
        // getTupleConstant
        calldatas.push(abi.encodeWithSelector(DynamicReturn.getTupleConstant.selector));
        targets.push(address(dynamicReturn));
        uint256 memTarget = 0x4; // add(0x20, add(4, encodedCalldataLen))
        offsets.push(staticCall(memTarget, 0x60)); // tuple is returned with each element padded to 32 bytes

        // setTuple
        calldatas.push(abi.encodeWithSelector(DynamicReturn.setTuple.selector, 0, 0, 0));
        targets.push(address(dynamicReturn));
        offsets.push(stateChangingCall());

        multicall.execute(targets, offsets, calldatas, values);

        (uint256 a, uint256 b, uint256 c) = dynamicReturn.tuple();
        assertEq(a, uint256(1));
        assertEq(b, uint256(2));
        assertEq(c, uint256(3));
    }

    // set tuple(max, max, max) -> get_tuple_constants -> (1, 2, 3) -> setTuple(1, max, 3)
    function test_partial_return_data() public {
        // set_tuple(max, max, max)
        bytes memory set_tuple_first_calldata = abi.encodeWithSelector(
            DynamicReturn.setTuple.selector, type(uint256).max, type(uint256).max, type(uint256).max
        );
        // get tuple constants() -> (1, 2, 3)
        bytes memory partial_return_static_call = abi.encodeWithSelector(DynamicReturn.getTupleConstant.selector);
        // set_tuple(1, max, 3)
        bytes memory set_tuple_second_calldata =
            abi.encodeWithSelector(DynamicReturn.setTuple.selector, uint256(0), type(uint256).max, uint256(0));

        // ===============set_tuple=======================
        calldatas.push(set_tuple_first_calldata);
        targets.push(address(dynamicReturn));
        offsets.push(stateChangingCall());

        // ===============get_tuple_constants=======================
        calldatas.push(partial_return_static_call);
        targets.push(address(dynamicReturn));

        // 3 parameters from the last parameter
        //  <4byte_selector><tuple_data_offset><tuple_length><item0><item1><item2>
        uint256 next_call_data_start = set_tuple_second_calldata.length - 0x60;
        assertEq(next_call_data_start, 0x04);

        // where in next call to use
        memTargets.push(0x04); // pos 1
        memTargets.push(0x04 + 0x40); // pos 3
        // where in current call to fetch data
        returnOffsets.push(0x0); // first item
        returnOffsets.push(0x40); // third item
        resultLengths.push(0x20); // uint256
        resultLengths.push(0x20); // uint256
        offsets.push(staticCallPartialReturn(memTargets, resultLengths, returnOffsets, 0x60));

        // ==================set_tuple=================================
        calldatas.push(set_tuple_second_calldata);
        targets.push(address(dynamicReturn));
        offsets.push(stateChangingCall(0x0));

        // ===================execute=================================
        multicall.execute(targets, offsets, calldatas, values);

        (uint256 a, uint256 b, uint256 c) = dynamicReturn.tuple();
        assertEq(a, 1);
        assertEq(b, type(uint256).max);
        assertEq(c, 3);
    }

    function test_fuzz_bytes(bytes calldata startData) public {
        calldatas.push(abi.encodeWithSelector(Fuzzy.changeState.selector, startData));
        targets.push(address(fuzzy));
        offsets.push(stateChangingCall()); // tuple is returned with each element padded to 32 bytes

        calldatas.push(abi.encodeWithSelector(Fuzzy.getState.selector));
        targets.push(address(fuzzy));
        offsets.push(staticCall(0x04, startData.length)); // tuple is returned with each element padded to 32 bytes


        calldatas.push(abi.encodeWithSelector(Fuzzy.changeState.selector, startData));
        targets.push(address(fuzzy));
        offsets.push(stateChangingCall(0x0, 0x04, 0x20)); // tuple is returned with each element padded to 32 bytes


        calldatas.push(abi.encodeWithSelector(Fuzzy.setBool.selector, 0x0));
        targets.push(address(fuzzy));
        offsets.push(stateChangingCall());


        multicall.execute(targets, offsets, calldatas, values);

        assertEq(fuzzy.getState(), startData);
        assertEq(fuzzy.booool(), false);
    }


    function test_fuzz_bytes_alt(bytes calldata startData) public {
        calldatas.push(abi.encodeWithSelector(Fuzzy.changeState.selector, startData));
        targets.push(address(fuzzy));
        offsets.push(stateChangingCall()); // tuple is returned with each element padded to 32 bytes

        bytes memory newData = abi.encodeWithSignature("randomsignature(uint)", 0x69);

        while (newData.length == startData.length) {
          newData = abi.encode(newData, startData);
        }

        calldatas.push(abi.encodeWithSelector(Fuzzy.changeState.selector, newData));
        targets.push(address(fuzzy));
        offsets.push(stateChangingCall(0x0, 0x04, 0x20)); // tuple is returned with each element padded to 32 bytes


        calldatas.push(abi.encodeWithSelector(Fuzzy.setBool.selector, 0x0));
        targets.push(address(fuzzy));
        offsets.push(stateChangingCall());


        multicall.execute(targets, offsets, calldatas, values);

        assertEq(fuzzy.getState(), newData);
        assertEq(fuzzy.booool(), true);
    }
}


