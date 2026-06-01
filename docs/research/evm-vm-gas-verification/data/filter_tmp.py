import json
data=json.load(open('corpus_focused.json'))
print('TOTAL', len(data))
kw=['evm','ethereum','bytecode','smart contract','gas','weiroll','superopt','mcopy','eip','intent','mev','composab','verif','formal','semantic','kevm','iele','solidity','vyper','account abstraction','4337','7702','decompil','multicall','yul','non-interference','defi','blockchain']
for d in data:
    t=(d.get('title') or '')
    tl=t.lower()
    if any(k in tl for k in kw):
        print(d.get('year'),'|',t)
