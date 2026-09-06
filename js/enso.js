import { getAddress } from "viem";
import { TransactionBuilder } from "./index.js";

function address(value, label) {
    try { return getAddress(value); }
    catch { throw new Error(`Enso ${label} is not a valid address`); }
}

function transaction(entry, label, caller) {
    const tx = label === "tx" ? entry : entry?.tx;
    if (!tx || typeof tx !== "object") throw new Error(`Enso ${label} is missing tx`);
    const from = address(tx.from, `${label}.from`);
    if (from !== caller) throw new Error(`Enso ${label}.from does not match the Scripter execution account`);
    return {to: address(tx.to, `${label}.to`), data: tx.data, value: tx.value ?? 0n};
}

/**
 * Convert an Enso `router` route response into MulticallScripter inputs.
 *
 * `caller` is the address that targets observe as msg.sender: the bare executor address, or the
 * delegating EOA when using SevenSevenZeroTwoCaller. Delegate-strategy responses are deliberately
 * rejected because they require the wallet itself to delegatecall Enso's delegate contract.
 */
export function buildEnsoRouterBatch(response, {caller, routingStrategy}) {
    if (routingStrategy !== "router") {
        throw new Error("Only Enso router responses can be wrapped; delegate responses require delegatecall");
    }
    if (!response || typeof response !== "object") throw new Error("Enso response must be an object");
    const executionAccount = address(caller, "caller");
    if (response.preTransactions !== undefined && !Array.isArray(response.preTransactions)) {
        throw new Error("Enso preTransactions must be an array");
    }

    const transactions = (response.preTransactions ?? []).map((entry, i) =>
        transaction(entry, `preTransactions[${i}]`, executionAccount));
    transactions.push(transaction(response.tx, "tx", executionAccount));

    const builder = new TransactionBuilder();
    for (const tx of transactions) builder.addRawCall(tx.to, tx.data, tx.value);
    const batch = builder.build();
    return {batch, value: batch.msgValues.reduce((sum, amount) => sum + amount, 0n)};
}
