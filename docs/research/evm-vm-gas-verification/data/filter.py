import json, re
c = json.load(open('data/corpus.json'))

INCLUDE = [
    'gas optimization','gas cost','gas consumption','gas-efficient','gas efficiency','gas saving','out-of-gas','out of gas','superoptim','out-of-gas',
    'formal verification','formal verif','theorem prov','model check','symbolic execution','coq','isabelle','k framework','k-framework','provably sound','static analysis',
    'evm','ethereum virtual machine','bytecode','operational semantics','formal semantics','executable semantics','interpreter',
    'smart contract','solidity','vyper','yul','scilla','reentran','vulnerab',
    'multicall','weiroll','batching','batch execution','composability','account abstraction','erc-4337','eip-','transaction batch','meta-transaction','op','intent',
]
# Off-topic application-domain blockchain noise to drop unless they also hit a core technical term
EXCLUDE_DOMAIN = [
    'supply chain','healthcare','health record','electronic health','iot','internet of things','energy trading','smart grid','smart cities','smart city',
    'central bank','cbdc','marketing','education','curriculum','traceability','pharma','agricultur','voting','land regist','insurance','ponzi','tourism','transport',
    'genetika','banking','manufactur','sharing economy','identity management','federated learning','anomaly detection','model predictive control','gpt-4 technical',
]

def text(p):
    return ((p.get('title') or '') + ' ' + (p.get('abstract') or '')).lower()

CORE = ['gas','formal verif','theorem prov','symbolic execution','bytecode','evm','ethereum virtual machine','operational semantics','formal semantics','superoptim','multicall','weiroll','account abstraction','erc-4337','eip-','solidity','yul','scilla','static analysis','model check','reentran']

kept = []
for p in c:
    t = text(p)
    if not any(k in t for k in INCLUDE):
        continue
    # drop domain-noise unless it also clearly hits a core technical term
    if any(d in t for d in EXCLUDE_DOMAIN) and not any(k in t for k in CORE):
        continue
    kept.append(p)

kept.sort(key=lambda p: (p.get('citations') or 0), reverse=True)
json.dump(kept, open('data/corpus_focused.json','w'), indent=1)
print('focused corpus:', len(kept), 'of', len(c))
