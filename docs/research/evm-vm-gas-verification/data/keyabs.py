import json
c = json.load(open('data/corpus_focused.json'))
keys = [
    'MultiCall: A Transaction-batching Interpreter',
    'Max-SMT Superoptimizer for EVM',
    'GASOL: Gas Analysis and Optimization',
    'KEVM: A Complete Semantics',
    'VerX: Safety Verification',
    'MadMax',
    'DeFi Composability as MEV Non-interference',
    'IELE: An Intermediate-Level Blockchain Language',
    'eThor',
    'Running on Fumes',
    'Survey on Formal Verification for Solidity',
    'solc-verify',
    'Generalized Formal Semantic Framework',
]
for k in keys:
    for p in c:
        if k.lower() in (p.get('title') or '').lower():
            print('### '+p.get('title'))
            print(f"year={p.get('year')} cit={p.get('citations')} src={p.get('source')} doi={p.get('doi')}")
            print((p.get('abstract') or '(no abstract)')[:700])
            print()
            break
