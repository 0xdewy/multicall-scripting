# /// script
# dependencies = ["z3-solver==5.1.0.0"]
# ///
# Run: uv run script/check-memory-bounds.py
# Models the range checks in both executors; changes to those checks require model review.
from z3 import BitVec, BitVecVal, ULE, UGE, ULT, UGT, Or, Solver, unsat
B = lambda n: BitVecVal(n, 256)
ptr, end, length, target, size, source, captured, actual = [BitVec(n, 256) for n in ('ptr', 'end', 'length', 'target', 'size', 'source', 'captured', 'actual')]
# Assumption: allocated memory addresses are below 2**64, far above feasible EVM memory.
allocated = [UGE(ptr, B(128)), ULE(ptr, end), ULT(end, B(2**64))]
def prove(name, assumptions, violation):
    s = Solver(); s.set(timeout=30000); s.add(*assumptions, violation)
    result = s.check()
    assert result == unsat, (name, result, s.model() if str(result) == 'sat' else '')
    print('UNSAT:', name)
next_ptr = ptr + B(32) + ((length + B(31)) & ~B(31))
prove('accepted packed frame cannot wrap or read past the region', allocated + [ULE(length, end), ULE(next_ptr, end)],
      Or(ULT(next_ptr, ptr+B(32)), UGT(ptr+B(32)+length, end), ULT(length+B(31), length)))
dest = ptr+B(32)+target
prove('accepted 120-bit regular splice cannot wrap or write backwards', allocated + [ULT(target,B(2**120)), ULT(size,B(2**120)), ULE(dest+size,end)],
      Or(ULT(dest,ptr+B(32)), ULT(dest+size,dest), UGT(dest,end)))
prove('accepted 40/16-bit partial destination cannot wrap or write backwards', allocated + [ULT(target,B(2**40)), ULT(size,B(2**16)), ULE(dest+size,end)],
      Or(ULT(dest,ptr+B(32)), ULT(dest+size,dest), UGT(dest,end)))
prove('accepted partial slice is contained in actual returndata', [ULT(source,B(2**16)), ULT(size,B(2**16)), ULT(captured,B(2**16)), ULE(captured,actual), ULE(source+size,captured)],
      Or(ULT(source+size,source), UGT(source+size,actual)))
print('These are scoped bit-vector checks, not a proof of the complete contracts or compiler.')
