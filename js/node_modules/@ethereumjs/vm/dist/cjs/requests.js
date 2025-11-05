"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.accumulateRequests = void 0;
const common_1 = require("@ethereumjs/common");
const util_1 = require("@ethereumjs/util");
const DEPOSIT_TOPIC = '0x649bbc62d0e31342afea4e5cd82d4049e7e1ee912fc0889aa790803be39038c5';
const PUBKEY_OFFSET = BigInt(160);
const WITHDRAWAL_CREDENTIALS_OFFSET = BigInt(256);
const AMOUNT_OFFSET = BigInt(320);
const SIGNATURE_OFFSET = BigInt(384);
const INDEX_OFFSET = BigInt(512);
const PUBKEY_SIZE = BigInt(48);
const WITHDRAWAL_CREDENTIALS_SIZE = BigInt(32);
const AMOUNT_SIZE = BigInt(8);
const SIGNATURE_SIZE = BigInt(96);
const INDEX_SIZE = BigInt(8);
const LOG_SIZE = 576;
const LOG_LAYOUT_MISMATCH = 'invalid deposit log: unsupported data layout';
/**
 * This helper method generates a list of all CL requests that can be included in a pending block
 * @param vm VM instance (used in deriving partial withdrawal requests)
 * @param txResults (used in deriving deposit requests)
 * @returns a list of CL requests in ascending order by type
 */
const accumulateRequests = async (vm, txResults) => {
    const requests = [];
    const common = vm.common;
    if (common.isActivatedEIP(6110)) {
        const depositContractAddress = vm.common['_chainParams'].depositContractAddress ?? common_1.Mainnet.depositContractAddress;
        if (depositContractAddress === undefined)
            throw (0, util_1.EthereumJSErrorWithoutCode)('deposit contract address required with EIP 6110');
        const depositsRequest = accumulateDepositsRequest(depositContractAddress, txResults);
        requests.push(depositsRequest);
    }
    if (common.isActivatedEIP(7002)) {
        const withdrawalsRequest = await accumulateWithdrawalsRequest(vm);
        requests.push(withdrawalsRequest);
    }
    if (common.isActivatedEIP(7251)) {
        const consolidationsRequest = await accumulateConsolidationsRequest(vm);
        requests.push(consolidationsRequest);
    }
    // requests are already type byte ordered by construction
    return requests;
};
exports.accumulateRequests = accumulateRequests;
const accumulateWithdrawalsRequest = async (vm) => {
    // Partial withdrawals logic
    const addressBytes = (0, util_1.setLengthLeft)((0, util_1.bigIntToBytes)(vm.common.param('withdrawalRequestPredeployAddress')), 20);
    const withdrawalsAddress = (0, util_1.createAddressFromString)((0, util_1.bytesToHex)(addressBytes));
    const systemAddressBytes = (0, util_1.bigIntToAddressBytes)(vm.common.param('systemAddress'));
    const systemAddress = (0, util_1.createAddressFromString)((0, util_1.bytesToHex)(systemAddressBytes));
    const systemAccount = await vm.stateManager.getAccount(systemAddress);
    const originalAccount = await vm.stateManager.getAccount(withdrawalsAddress);
    if (originalAccount === undefined) {
        return new util_1.CLRequest(util_1.CLRequestType.Withdrawal, new Uint8Array());
    }
    const results = await vm.evm.runCall({
        caller: systemAddress,
        gasLimit: BigInt(1000000),
        to: withdrawalsAddress,
    });
    if (systemAccount === undefined) {
        await vm.stateManager.deleteAccount(systemAddress);
    }
    else {
        await vm.stateManager.putAccount(systemAddress, systemAccount);
    }
    const resultsBytes = results.execResult.returnValue;
    return new util_1.CLRequest(util_1.CLRequestType.Withdrawal, resultsBytes);
};
const accumulateConsolidationsRequest = async (vm) => {
    // Partial withdrawals logic
    const addressBytes = (0, util_1.setLengthLeft)((0, util_1.bigIntToBytes)(vm.common.param('consolidationRequestPredeployAddress')), 20);
    const consolidationsAddress = (0, util_1.createAddressFromString)((0, util_1.bytesToHex)(addressBytes));
    const systemAddressBytes = (0, util_1.bigIntToAddressBytes)(vm.common.param('systemAddress'));
    const systemAddress = (0, util_1.createAddressFromString)((0, util_1.bytesToHex)(systemAddressBytes));
    const systemAccount = await vm.stateManager.getAccount(systemAddress);
    const originalAccount = await vm.stateManager.getAccount(consolidationsAddress);
    if (originalAccount === undefined) {
        return new util_1.CLRequest(util_1.CLRequestType.Consolidation, new Uint8Array(0));
    }
    const results = await vm.evm.runCall({
        caller: systemAddress,
        gasLimit: BigInt(1000000),
        to: consolidationsAddress,
    });
    if (systemAccount === undefined) {
        await vm.stateManager.deleteAccount(systemAddress);
    }
    else {
        await vm.stateManager.putAccount(systemAddress, systemAccount);
    }
    const resultsBytes = results.execResult.returnValue;
    return new util_1.CLRequest(util_1.CLRequestType.Consolidation, resultsBytes);
};
const accumulateDepositsRequest = (depositContractAddress, txResults) => {
    let resultsBytes = new Uint8Array(0);
    const depositContractAddressLowerCase = depositContractAddress.toLowerCase();
    for (const [_, tx] of txResults.entries()) {
        for (let i = 0; i < tx.receipt.logs.length; i++) {
            const log = tx.receipt.logs[i];
            const [address, topics, data] = log;
            if (topics.length > 0 &&
                (0, util_1.bytesToHex)(topics[0]) === DEPOSIT_TOPIC &&
                depositContractAddressLowerCase === (0, util_1.bytesToHex)(address).toLowerCase()) {
                const { pubkey, withdrawalCredentials, amount, signature, index } = parseDepositLog(data);
                const depositRequestBytes = (0, util_1.concatBytes)(pubkey, withdrawalCredentials, amount, signature, index);
                resultsBytes = (0, util_1.concatBytes)(resultsBytes, depositRequestBytes);
            }
        }
    }
    return new util_1.CLRequest(util_1.CLRequestType.Deposit, resultsBytes);
};
function parseDepositLog(requestData) {
    if (requestData.length !== LOG_SIZE) {
        throw (0, util_1.EthereumJSErrorWithoutCode)(LOG_LAYOUT_MISMATCH);
    }
    // Extracts validator pubkey, withdrawal credential, deposit amount, signature,
    // and validator index from Deposit Event log.
    // The event fields are non-indexed so contained in one byte array (log[2]) so parsing is as follows:
    // 1. Read the first 32 bytes to get the starting position of the first field.
    // 2. Continue reading the byte array in 32 byte increments to get all the field starting positions
    // 3. Read 32 bytes starting with the first field position to get the size of the first field
    // 4. Read the bytes from first field position + 32 + the size of the first field to get the first field value
    // 5. Repeat steps 3-4 for each field
    const pubKeyIdxBigInt = (0, util_1.bytesToBigInt)(requestData.slice(0, 32));
    const withdrawalCreditsIdxBigInt = (0, util_1.bytesToBigInt)(requestData.slice(32, 64));
    const amountIdxBigInt = (0, util_1.bytesToBigInt)(requestData.slice(64, 96));
    const sigIdxBigInt = (0, util_1.bytesToBigInt)(requestData.slice(96, 128));
    const indexIdxBigInt = (0, util_1.bytesToBigInt)(requestData.slice(128, 160));
    if (pubKeyIdxBigInt !== PUBKEY_OFFSET ||
        withdrawalCreditsIdxBigInt !== WITHDRAWAL_CREDENTIALS_OFFSET ||
        amountIdxBigInt !== AMOUNT_OFFSET ||
        sigIdxBigInt !== SIGNATURE_OFFSET ||
        indexIdxBigInt !== INDEX_OFFSET) {
        throw (0, util_1.EthereumJSErrorWithoutCode)(LOG_LAYOUT_MISMATCH);
    }
    const pubKeyIdx = Number(pubKeyIdxBigInt);
    const withdrawalCreditsIdx = Number(withdrawalCreditsIdxBigInt);
    const amountIdx = Number(amountIdxBigInt);
    const sigIdx = Number(sigIdxBigInt);
    const indexIdx = Number(indexIdxBigInt);
    const pubKeySizeBigInt = (0, util_1.bytesToBigInt)(requestData.slice(pubKeyIdx, pubKeyIdx + 32));
    const withdrawalCreditsSizeBigInt = (0, util_1.bytesToBigInt)(requestData.slice(withdrawalCreditsIdx, withdrawalCreditsIdx + 32));
    const amountSizeBigInt = (0, util_1.bytesToBigInt)(requestData.slice(amountIdx, amountIdx + 32));
    const sigSizeBigInt = (0, util_1.bytesToBigInt)(requestData.slice(sigIdx, sigIdx + 32));
    const indexSizeBigInt = (0, util_1.bytesToBigInt)(requestData.slice(indexIdx, indexIdx + 32));
    if (pubKeySizeBigInt !== PUBKEY_SIZE ||
        withdrawalCreditsSizeBigInt !== WITHDRAWAL_CREDENTIALS_SIZE ||
        amountSizeBigInt !== AMOUNT_SIZE ||
        sigSizeBigInt !== SIGNATURE_SIZE ||
        indexSizeBigInt !== INDEX_SIZE) {
        throw (0, util_1.EthereumJSErrorWithoutCode)(LOG_LAYOUT_MISMATCH);
    }
    const pubKeySize = Number(pubKeySizeBigInt);
    const withdrawalCreditsSize = Number(withdrawalCreditsSizeBigInt);
    const amountSize = Number(amountSizeBigInt);
    const sigSize = Number(sigSizeBigInt);
    const indexSize = Number(indexSizeBigInt);
    const pubkey = requestData.slice(pubKeyIdx + 32, pubKeyIdx + 32 + pubKeySize);
    const withdrawalCredentials = requestData.slice(withdrawalCreditsIdx + 32, withdrawalCreditsIdx + 32 + withdrawalCreditsSize);
    const amount = requestData.slice(amountIdx + 32, amountIdx + 32 + amountSize);
    const signature = requestData.slice(sigIdx + 32, sigIdx + 32 + sigSize);
    const index = requestData.slice(indexIdx + 32, indexIdx + 32 + indexSize);
    return {
        pubkey,
        withdrawalCredentials,
        amount,
        signature,
        index,
    };
}
//# sourceMappingURL=requests.js.map