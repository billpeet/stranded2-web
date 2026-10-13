/**
 * Blitz3D language/runtime semantics the game logic depends on, plus the
 * generic helpers from includes/functions.bb. This is the only
 * implementation of them: ported code calls these instead of JS built-ins
 * wherever the behaviour differs, and no other module may carry its own copy.
 *
 * Everything was checked against the Blitz3D source
 * (github.com/blitz-research/blitz3d: bbruntime/*.cpp, stdutil/stdutil.cpp,
 * compiler/*.cpp) and, where that left doubt, against the runtime inside the
 * shipped StrandedII.exe. Each module documents its sources.
 *
 *   blitz/num.ts        Int/Float/Str, float32 discipline, integer operators,
 *                       comparisons and implicit coercion, For-loop rules
 *   blitz/math.ts       Sin..Log10 in degrees/float32, Rnd/Rand/SeedRnd/RndSeed
 *   blitz/string.ts     Len Left Right Mid Instr Replace Upper Lower Trim
 *                       LSet RSet Chr Asc Hex Bin String
 *   blitz/time.ts       MilliSecs, CurrentDate, CurrentTime
 *   blitz/bank.ts       CreateBank, Peek*, Poke*, ResizeBank, CopyBank
 *   blitz/typelist.ts   TypeList<T>: New/Delete/First/Last/After/Before/
 *                       Insert/For Each
 *   blitz/functions.ts  split, trimspace, ntrim, code, numsep, ... (functions.bb)
 *   blitz/errors.ts     BlitzRuntimeError / RuntimeError
 *   io/BinaryReader.ts, io/BinaryWriter.ts   the stream value encodings
 */
export * from './blitz/errors';
export * from './blitz/num';
export * from './blitz/math';
export * from './blitz/string';
export * from './blitz/time';
export * from './blitz/bank';
export * from './blitz/typelist';
export * from './blitz/functions';
export { BinaryReader, latin1 } from './io/BinaryReader';
export { BinaryWriter } from './io/BinaryWriter';
