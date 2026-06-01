import json
from collections import Counter

c = json.load(open('data/corpus.json'))
print('total', len(c))
print('by source', dict(Counter(p['source'] for p in c)))
print('retracted', sum(1 for p in c if p.get('is_retracted')))
yrs = Counter(p.get('year') for p in c)
print('years', sorted((k, v) for k, v in yrs.items() if k))
# top cited
top = sorted(c, key=lambda p: (p.get('citations') or 0), reverse=True)[:40]
print('\n=== TOP 40 BY CITATIONS ===')
for p in top:
    print(f"[{p.get('citations')}] {p.get('year')} {p.get('title')[:110]}")
