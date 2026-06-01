import json
c = json.load(open('data/corpus.json'))

def has(p, *kw):
    t = (p.get('title') or '').lower() + ' ' + (p.get('abstract') or '').lower()
    return any(k in t for k in kw)

buckets = {
    'GAS': ['gas optimization', 'gas cost', 'gas consumption', 'gas-efficient', 'gas efficiency', 'gas saving'],
    'FORMAL_VER': ['formal verification', 'theorem prov', 'model check', 'verified', 'coq', 'isabelle', 'k framework', 'symbolic execution'],
    'VM_SEMANTICS': ['evm semantics', 'operational semantics', 'virtual machine', 'bytecode semantics', 'formal semantics'],
    'MULTICALL': ['multicall', 'weiroll', 'batching', 'batch', 'composability', 'account abstraction', 'erc-4337', '7702'],
}
for name, kws in buckets.items():
    hits = [p for p in c if has(p, *kws)]
    hits.sort(key=lambda p: (p.get('citations') or 0), reverse=True)
    print(f"\n===== {name}: {len(hits)} papers =====")
    for p in hits[:18]:
        print(f"[{p.get('citations') or 0}|{p.get('year')}] {(p.get('title') or '')[:100]}")
