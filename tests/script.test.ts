import { describe, expect, it } from 'vitest';
import { SEP_LINE } from '../src/lib/s2/blitz';
import {
	BlitzRnd,
	BlitzRuntimeError,
	createRecordingHost,
	createScriptEngine,
	f2i,
	fstr,
	scanScript,
	type HostEntity,
	type ScriptEngine,
	type ScriptHost
} from '../src/lib/s2/script';

// Expected values are derived by reading the original interpreter
// (includes/parser*.bb), not from what would be "correct" maths.

interface World {
	engine: ScriptEngine;
	console: string[];
	calls: { method: string; args: unknown[] }[];
	entities: Record<number, HostEntity[]>;
	files: Map<string, Uint8Array>;
	now: { gt: number };
}

function world(impl: Partial<ScriptHost> = {}): World {
	const consoleLines: string[] = [];
	const entities: Record<number, HostEntity[]> = { 1: [], 2: [], 3: [], 4: [], 5: [] };
	const files = new Map<string, Uint8Array>();
	const now = { gt: 0 };
	const exists = (cls: number) => (id: number) => (entities[cls].some((e) => e.id === id) ? 1 : 0);
	const { host, calls } = createRecordingHost({
		con_add: (txt = '') => void consoleLines.push(txt),
		con_open: () => {},
		sfx_fail: () => {},
		con_object: exists(1),
		con_unit: exists(2),
		con_item: exists(3),
		con_info: exists(4),
		parent_con: (cls, id) => (entities[cls]?.some((e) => e.id === id) ? 1 : 0),
		g_player: () => 1,
		gt: () => now.gt,
		entities: (cls) => entities[cls] ?? [],
		entity_typ: (cls, id) => entities[cls]?.find((e) => e.id === id)?.typ ?? 0,
		def_name: (_cls, typ) => 'type' + typ,
		ReadFileLines: () => null,
		ReadFileBytes: (path) => files.get(path) ?? null,
		WriteFileBytes: (path, data) => (files.set(path, data), 1),
		FreeEntity: () => {},
		...impl
	});
	return { engine: createScriptEngine(host), console: consoleLines, calls, entities, files, now };
}

/** Run a script as the global map script and return the engine. */
function run(script: string, event = '', w = world()): World {
	w.engine.run(script, 0, 0, event);
	return w;
}

/** Value of an expression assigned to a variable. */
function expr(e: string): string {
	const w = run(`$r=${e};`);
	expect(w.engine.errors.map((x) => x.message)).toEqual([]);
	return w.engine.var_get('r');
}

const errorsOf = (w: World) => w.engine.errors.map((e) => e.message);

describe('Blitz runtime helpers', () => {
	it('formats floats like the Blitz runtime', () => {
		expect(fstr(1)).toBe('1.0');
		expect(fstr(0)).toBe('0.0');
		expect(fstr(-2.5)).toBe('-2.5');
		expect(fstr(0.5)).toBe('0.5');
		expect(fstr(100)).toBe('100.0');
		expect(fstr(3.14159274)).toBe('3.14159');
		expect(fstr(0.05)).toBe('0.05');
		expect(fstr(123456)).toBe('123456.0');
		expect(fstr(1234567)).toBe('1234570.0');
		expect(fstr(0.1 + 0.2)).toBe('0.3');
		expect(fstr(1e9)).toBe('1.e+009');
		expect(fstr(0.00001)).toBe('1.e-005');
		expect(fstr(1 / 0)).toBe('Infinity');
	});

	it('rounds float to int to nearest even', () => {
		expect(f2i(2.5)).toBe(2);
		expect(f2i(3.5)).toBe(4);
		expect(f2i(-0.6)).toBe(-1);
		expect(f2i(1.4)).toBe(1);
	});

	it('reproduces the Rnd generator', () => {
		// state 0x1234 -> 48271*4660 = 224942860; low 16 bits 23308 -> 0.35566; int(0.35566*6)+1
		const r = new BlitzRnd();
		expect(r.Rand(1, 6)).toBe(3);
		const a = new BlitzRnd();
		const b = new BlitzRnd();
		a.SeedRnd(42);
		b.SeedRnd(42);
		expect([a.Rand(100), a.Rand(100), a.Rand(5, 1)]).toEqual([b.Rand(100), b.Rand(100), b.Rand(5, 1)]);
	});
});

describe('expressions (parse_math, parse_math_st)', () => {
	it('evaluates simple terms', () => {
		expect(expr('5')).toBe('5');
		expect(expr('1+2')).toBe('3');
		expect(expr('7-10')).toBe('-3');
		expect(expr('2*3')).toBe('6');
		expect(expr('-4*2')).toBe('-8');
		expect(expr('5*-3')).toBe('-15');
		expect(expr('5--3')).toBe('8');
	});

	it('keeps integers integer and switches to float text otherwise', () => {
		expect(expr('10/4')).toBe('2');
		expect(expr('10/4.0')).toBe('2.5');
		expect(expr('1.5+1')).toBe('2.5');
		expect(expr('2+2.0')).toBe('4.0');
		expect(expr('0.1+0.2')).toBe('0.3');
		expect(expr('1.5')).toBe('1.5');
	});

	it('quirk: drops every second operator/operand pair of a term', () => {
		expect(expr('1+2+3')).toBe('3');
		expect(expr('1+2+3+4')).toBe('7');
		expect(expr('1+2*3')).toBe('3');
		expect(expr('2*3+1')).toBe('6');
		expect(expr('10-1-1')).toBe('9');
	});

	it('resolves brackets innermost first', () => {
		expect(expr('((1+2)*3)')).toBe('9');
		expect(expr('2*(3+4)')).toBe('14');
		expect(expr('(((1+2)+3)+4)')).toBe('10');
		expect(expr('((2+3)*(4-1))')).toBe('15');
		expect(expr('5-(-3)')).toBe('8');
		expect(expr('((1+2+3)*2)')).toBe('6');
	});

	it('quirk: a parameter ends where its first bracket closes', () => {
		// param() stops at the ')' that brings the bracket depth back to 0
		const w = run('$r=(1+2)*3;');
		expect(errorsOf(w)).toEqual(['Expecting semicolon']);
		expect(w.engine.var_get('r')).toBe('3');
		expect(errorsOf(run('$r=int(3.7)+1;'))).toEqual(['Expecting semicolon']);
	});

	it('compares', () => {
		expect(expr('3>2')).toBe('1');
		expect(expr('3<2')).toBe('0');
		expect(expr('2>=2')).toBe('1');
		expect(expr('2=>3')).toBe('0');
		expect(expr('2<=2')).toBe('1');
		expect(expr('3=<2')).toBe('0');
		expect(expr('5==5')).toBe('1');
		expect(expr('5!=5')).toBe('0');
		expect(expr('5!=6')).toBe('1');
		expect(expr('5==5.0')).toBe('1');
		expect(expr('1.5>1')).toBe('1');
	});

	it('quirk: integers are compared as text by ==', () => {
		expect(expr('1==01')).toBe('0');
		expect(expr('1!=01')).toBe('0');
	});

	it('combines conditions (with brackets, because of the dropped operands)', () => {
		expect(expr('((1==1)&&(2==2))')).toBe('1');
		expect(expr('((1==1)&&(2==3))')).toBe('0');
		expect(expr('((1==2)||(2==2))')).toBe('1');
		expect(expr('((1==1)and(0==1))')).toBe('0');
		expect(expr('((0==1)or(1==1))')).toBe('1');
		expect(expr('((1==1)xor(1==1))')).toBe('0');
		expect(expr('((1==1) && (2==2))')).toBe('1');
		expect(expr('1&&1')).toBe('1');
	});

	it('quirk: without brackets a condition chain loses its middle part', () => {
		// 1==1&&2==3 -> parts (==,1) and (==,3); "&&2" is dropped: (1==1)==3 -> 0
		expect(expr('1==1&&2==3')).toBe('0');
		// 1==1||5==1 -> (1==1)==1 -> 1
		expect(expr('1==1||5==1')).toBe('1');
	});

	it('reports division by the literal 0 and then crashes like the original', () => {
		const w = world();
		expect(() => w.engine.run('$r=5/0;')).toThrow(BlitzRuntimeError);
		expect(errorsOf(w)).toEqual(["Division by zero is not allowed '5/0'"]);
		// float division is allowed to go on
		w.engine.p_parseinprogress = 0;
		w.engine.tasks.length = 0;
		w.engine.clearErrors();
		w.engine.run('$r=5.0/0;');
		expect(w.engine.var_get('r')).toBe('Infinity');
		// quirk: "0.0" is not the text "0", so no error at all
		w.engine.clearErrors();
		w.engine.run('$r=5/0.0;');
		expect(errorsOf(w)).toEqual([]);
		expect(w.engine.var_get('r')).toBe('Infinity');
	});

	it('rejects terms that start with an operator', () => {
		const w = run('$r=*5;');
		expect(errorsOf(w)[0]).toBe("Expression '*5' begins with an unexpected operator!");
	});

	it('quirk: operator words inside unquoted text are operators', () => {
		// "store": base "st", operator "or", operand "e" -> (0 or 0)
		expect(expr('store')).toBe('0');
		// "orange" starts with the operator "or"
		const w = run('$r=orange;');
		expect(errorsOf(w)[0]).toBe("Expression 'orange' begins with an unexpected operator!");
		// quoted text without brackets never reaches the maths
		expect(expr('"store"')).toBe('store');
	});

	it('mismatched brackets', () => {
		const w = run('$r=(1+2;');
		expect(errorsOf(w)[0]).toBe('Mismatched brackets');
	});

	it('determines value types like var_type', () => {
		const e = world().engine;
		expect(e.var_type('5')).toBe(0);
		expect(e.var_type('-5')).toBe(0);
		expect(e.var_type('')).toBe(0);
		expect(e.var_type('007')).toBe(0);
		expect(e.var_type('1.5')).toBe(1);
		expect(e.var_type('1.2.3')).toBe(1);
		expect(e.var_type('abc')).toBe(2);
		expect(e.var_type('5a')).toBe(2);
		expect(e.var_type('1e5')).toBe(2);
	});
});

describe('functions inside expressions', () => {
	it('calls functions and substitutes their result', () => {
		expect(expr('int(3.7)')).toBe('3');
		expect(expr('(int(3.7)+1)')).toBe('4');
		expect(expr('abs(-3)')).toBe('3.0');
		expect(expr('length("hello")')).toBe('5');
		expect(expr('2*length("abc")')).toBe('6');
		expect(expr('(length("abc")>2)')).toBe('1');
		expect(expr('sin(90)')).toBe('100.0');
		expect(expr('sin(90,0)')).toBe('1.0');
		expect(expr('cos(0)')).toBe('100.0');
	});

	it('string functions', () => {
		expect(expr('join("a","b","c")')).toBe('abc');
		expect(expr('replace("hello","l","L")')).toBe('heLLo');
		expect(expr('split("a,b,c",",",1)')).toBe('b');
		expect(expr('split("a,b,c",",",0)')).toBe('a');
		expect(expr('extract("hello",2,3)')).toBe('ell');
		expect(expr('extract("hello",3)')).toBe('llo');
		expect(expr('length("")')).toBe('0');
	});

	it('quirk: a function result is put back into the expression and evaluated again', () => {
		expect(expr('join("1","+","2")')).toBe('3');
		expect(expr('join("a","-","b")')).toBe('0.0');
		expect(expr('replace("1x2","x","*")')).toBe('2');
	});

	it('quirk: a function call nested in a function parameter loses its closing bracket', () => {
		const w = run('$r=int(abs(-3));');
		expect(errorsOf(w)[0]).toBe('Mismatched brackets');
	});

	it('quirk: capitals and digits end a function name', () => {
		const w = run('$r=Int(3);');
		expect(errorsOf(w)[0]).toBe("'nt' is an unknown script command");
	});

	it('random uses the shared Blitz generator', () => {
		const w = world();
		w.engine.rnd.SeedRnd(0x1234);
		w.engine.run('$a=random(6); $b=random(10,10);');
		expect(w.engine.var_get('a')).toBe('3');
		expect(w.engine.var_get('b')).toBe('10');
	});

	it('unknown function', () => {
		const w = run('$r=nope(1);');
		expect(errorsOf(w)[0]).toBe("'nope' is an unknown script command");
	});
});

describe('variables', () => {
	it('assigns, modifies and replaces', () => {
		const w = run('$a=5; $a++; $b=$a; $a+=2.5; $c=$a; $a-=1; $n--; $m-=-2; $s="x$b y";');
		const e = w.engine;
		expect(errorsOf(w)).toEqual([]);
		expect(e.var_get('b')).toBe('6');
		expect(e.var_get('c')).toBe('8.5');
		expect(e.var_get('a')).toBe('7.5');
		expect(e.var_get('n')).toBe('-1');
		expect(e.var_get('m')).toBe('2');
		expect(e.var_get('s')).toBe('x6 y');
		expect(e.var_get('unknown')).toBe('0');
	});

	it('keeps a dollar sign after a backslash', () => {
		const w = run('$s="cost \\$5";');
		expect(w.engine.var_get('s')).toBe('cost $5');
	});

	it('names: letters, digits and underscore', () => {
		const e = world().engine;
		expect(e.var_name('abc_1')).toBe(1);
		expect(e.var_name('a-b')).toBe(0);
		const w = run('$a b=1;');
		// quirk: the error names no variable and the variable is created anyway
		expect(errorsOf(w)[0]).toBe("'' is an invalid name for a variable!");
		expect(w.engine.var_get('a b')).toBe('1');
	});

	it('locals belong to the entity of the running script and shadow globals', () => {
		const w = world();
		const e = w.engine;
		e.run('$v=7.9; $g=1;', 0, 0);
		e.run('local $v; $v+=1; $g=2;', 1, 5);
		// quirk: turning a global into a local goes through an integer
		expect(e.var_get_local(1, 5, 'v')).toBe('8');
		expect(e.var_exists('v')).toBe(1); // the environment is still object 5
		e.parse_env(0, 0);
		expect(e.var_exists('v')).toBe(0);
		expect(e.var_get('g')).toBe('2');
		e.run('$x=getlocal("object",5,"v"); setlocal "object",5,$w,"hi"; $y=getlocal("object",5,"w"); $z=getlocal("object",5,$v);', 0, 0);
		expect(e.var_get('x')).toBe('8');
		expect(e.var_get('y')).toBe('hi');
		// quirk: inside a function call $v is replaced by its value before the name is read
		expect(e.var_get('z')).toBe('0');
	});

	it('varexists, freevar, rename, temp', () => {
		const w = run('$a=1; $b=2; $e1=varexists("a"); $e0=varexists($a); freevar $a;\n$e2=varexists("a"); rename $b,"c";\ntemp $c;');
		const e = w.engine;
		expect(errorsOf(w)).toEqual([]);
		expect(e.var_get('e1')).toBe('1');
		// quirk: "$a" is replaced by its value (1) first, and no variable is called "1"
		expect(e.var_get('e0')).toBe('0');
		expect(e.var_get('e2')).toBe('0');
		expect(e.var_exists('b')).toBe(0);
		expect(e.var_get('c')).toBe('2');
		expect(e.tx.find((t) => t.key === 'c')?.stuff).toBe('temp');
	});

	it('freevars removes globals and, by default, locals', () => {
		const w = world();
		const e = w.engine;
		e.run('$g=1; local $l; freevars 0;', 1, 5);
		expect(e.tx.items.map((t) => t.key)).toEqual(['l']);
		e.run('$g=1; freevars;', 1, 5);
		expect(e.tx.items).toEqual([]);
	});

	it('saves and loads the variable cache', () => {
		const w = run('$alpha=12; $beta="some text"; $gamma=1;\nsavevars "cache.dat","alpha, beta";');
		const e = w.engine;
		expect(errorsOf(w)).toEqual([]);
		const data = w.files.get('cache.dat')!;
		// WriteString: int32 length, then code$(key,5): shifted by 5 and reversed
		expect(Array.from(data.slice(0, 9))).toEqual([5, 0, 0, 0, ...[...'alpha'].reverse().map((c) => c.charCodeAt(0) + 5)]);
		e.run('freevars;\nloadvars "cache.dat";');
		expect(e.var_get('alpha')).toBe('12');
		expect(e.var_get('beta')).toBe('some text');
		expect(e.var_exists('gamma')).toBe(0);
		// quirk: used as functions they never see their parameters (parse_param() looks at
		// the script line, which is already consumed) and work on the file "varcache"
		e.run('$r=savevars("other.dat"); $l=loadvars("nope.dat");');
		expect(e.var_get('r')).toBe('1');
		expect(e.var_get('l')).toBe('1');
		expect(w.files.has('other.dat')).toBe(false);
		expect(w.files.has('varcache')).toBe(true);
	});

	it('definition variables', () => {
		const w = world();
		const e = w.engine;
		w.entities[1].push({ id: 3, typ: 9 }, { id: 4, typ: 2 });
		e.defvar_set(1, 9, ['wood', '', '10', '']);
		e.defvar_set(1, 9, ['shared', 'Shared value', 'x', '1']);
		expect(e.Tdefvar[0].descr).toBe('wood');
		e.defvar_ini();
		expect(e.var_get_local(1, 3, 'wood')).toBe('10');
		expect(e.var_get_local(1, 4, 'wood')).toBe('0');
		expect(e.var_get('shared')).toBe('x');
		e.var_set_local(1, 3, 'wood', '4');
		e.defvar_oncreate(1, 3, 9);
		expect(e.var_get_local(1, 3, 'wood')).toBe('4');
		expect(() => e.defvar_set(1, 9, ['', '', '', ''])).toThrow(BlitzRuntimeError);
	});

	it('constants', () => {
		const e = world().engine;
		e.const_set('#tree', 12);
		expect(e.const_get('tree')).toBe(1);
		expect(e.tmp_constv).toBe(12);
		expect(e.const_get('#tree')).toBe(0);
	});
});

describe('control flow', () => {
	const branch = (a: number) =>
		run(`$a=${a};\nif ($a==1) { $r=1; } elseif ($a==2) { $r=2; } elseif ($a==2) { $r=22; } else { $r=3; }\n$done=1;`).engine;

	it('if / elseif / else', () => {
		expect(branch(1).var_get('r')).toBe('1');
		expect(branch(2).var_get('r')).toBe('2');
		expect(branch(3).var_get('r')).toBe('3');
		expect(branch(1).var_get('done')).toBe('1');
	});

	it('braces may sit on the next line and blocks nest', () => {
		const e = run('if (1)\n{\n\tif (0)\n\t{\n\t\t$r=1;\n\t}\n\telse\n\t{\n\t\t$r=2;\n\t}\n}').engine;
		expect(e.errors).toEqual([]);
		expect(e.var_get('r')).toBe('2');
	});

	it('else without if', () => {
		expect(errorsOf(run('else { $r=1; }'))[0]).toBe("'else' or 'elseif' without matching 'if'");
	});

	it('quirk: a skipped elseif condition is still evaluated', () => {
		const w = run('if (1) { $r=1; } elseif (nope(1)==1) { $r=2; }');
		expect(errorsOf(w)[0]).toBe("'nope' is an unknown script command");
	});

	it('missing brace and stray characters', () => {
		expect(errorsOf(run('if (1) $r=1;'))[0]).toBe("Expecting '{'");
		expect(errorsOf(run('{ $r=1; }'))[0]).toBe("Opening brace '{' is not expected");
		expect(errorsOf(run('$r=1; }'))[0]).toBe('Mismatched brackets');
		expect(errorsOf(run('$r=1; ;'))[0]).toBe("Unexpected ';'");
		expect(errorsOf(run('$r=1'))[0]).toBe('Expecting semicolon');
		expect(errorsOf(run('$r'))[0]).toBe('Expecting variable assignment (=,+=,++,-=,--)');
	});

	it('count loops and loop_id', () => {
		const e = run('loop("count",4) { $n++; $s+=loop_id(); }\n$after=1;').engine;
		expect(e.errors).toEqual([]);
		expect(e.var_get('n')).toBe('4');
		expect(e.var_get('s')).toBe('10');
		expect(e.var_get('after')).toBe('1');
		expect(run('loop("count",0) { $n++; }').engine.var_exists('n')).toBe(0);
	});

	it('exit leaves the loop from inside nested blocks', () => {
		const e = run('loop("count",10) {\n\t$i++;\n\tif ($i==3) { exit; }\n\t$j++;\n}\n$after=$i;').engine;
		expect(e.errors).toEqual([]);
		expect(e.var_get('i')).toBe('3');
		expect(e.var_get('j')).toBe('2');
		expect(e.var_get('after')).toBe('3');
	});

	it('loops over entities, all or by type', () => {
		const w = world();
		w.entities[1].push({ id: 1, typ: 5 }, { id: 2, typ: 7 }, { id: 4, typ: 5 });
		w.entities[5].push({ id: 0, typ: 4 }, { id: 0, typ: 11 });
		const e = w.engine;
		e.run('loop("objects") {\n $all=join("$all",".",loop_id());\n}');
		e.run('loop("object",5) { $five=join("$five",".",loop_id()); }');
		e.run('loop("states") { $st=join("$st",".",loop_id()); }');
		e.run('loop("units") { $u++; }');
		expect(e.errors).toEqual([]);
		// quirk: the optional type is taken from any later comma on the line
		e.run('loop("objects") { $q=join("a","b"); }');
		expect(errorsOf(w)).toEqual(["Unexpected ';'", "Expecting '{' for loop"]);
		e.clearErrors();
		expect(e.var_get('all')).toBe('0.1.2.4');
		expect(e.var_get('five')).toBe('0.1.4');
		// quirk: a state loop yields state types
		expect(e.var_get('st')).toBe('0.4.11');
		expect(e.var_exists('u')).toBe(0);
	});

	it('loop errors', () => {
		expect(errorsOf(run('loop("count",2) { loop("count",2) { $n++; } }'))[0]).toBe("'loop' can not be used within a loop");
		expect(errorsOf(run('loop("things") { $n++; }'))[0]).toBe("'things' is no valid loop type");
		// quirk: the class number 2 is not accepted for units (typo "Class_unit" in the source), 0 is
		expect(errorsOf(run('loop(2) { $n++; }'))[0]).toBe("'2' is no valid loop type");
		expect(errorsOf(run('loop(0) { $n++; }'))).toEqual([]);
	});

	it('skip ends the script', () => {
		const e = run('$a=1; skip; $a=2;').engine;
		expect(e.var_get('a')).toBe('1');
		expect(e.errors).toEqual([]);
	});

	it('comments', () => {
		const e = run('// $a=1;\n$b=1; // $b=2;\n/* $c=1;\n$c=2; */ $d=1;\n$e=1; /* x */ $f=1;').engine;
		expect(e.errors).toEqual([]);
		expect(e.var_exists('a')).toBe(0);
		expect(e.var_get('b')).toBe('1');
		expect(e.var_exists('c')).toBe(0);
		expect(e.var_get('d')).toBe('1');
		expect(e.var_get('f')).toBe('1');
	});

	it('@ hides the error message but the script still stops', () => {
		const w = run('$a=1; @nope; $a=2;');
		expect(w.engine.var_get('a')).toBe('1');
		expect(w.engine.errors.map((e) => e.suppressed)).toEqual([true]);
		expect(w.console).toEqual([]);
		const v = run('@@nope;');
		expect(errorsOf(v)[0]).toBe("'@' sequences are not allowed. Max. one '@' per command");
	});

	it('quirk: an optional parameter is taken from any later comma on the line', () => {
		// sin reads 30, then looks for an optional second parameter and finds the comma behind "$b=2"
		const e = run('sin 30; $a=1; $b=2, 3;\n$c=1;').engine;
		expect(e.errors).toEqual([]);
		expect(e.var_exists('a')).toBe(0);
		expect(e.var_exists('b')).toBe(0);
		expect(e.var_get('c')).toBe('1');
	});

	it('quirk: quit and credits leave their semicolon behind', () => {
		const w = run('quit;');
		expect(errorsOf(w)).toEqual(["Unexpected ';'"]);
		expect(w.calls.map((c) => c.method)).toEqual(['cmd_quit']);
	});
});

describe('errors', () => {
	it('describes the script and position', () => {
		const w = world();
		w.entities[2].push({ id: 7, typ: 3 });
		w.engine.set_debug = 1;
		w.engine.run('on:use {\n\t$a=1;\n\tnope 1,2;\n}', 2, 7, 'use', 'testing');
		expect(w.console).toEqual([
			'PARSE:  @ 0,0 ',
			'',
			'SCRIPT ERROR:',
			"'nope' is an unknown script command",
			'Script: Unit 7 (type3 type 3)',
			'Info: testing',
			'Event: use',
			'Row: 3',
			'Col: 5',
			'Script: nope 1,2;',
			// the unknown command does not stop parse_commands: its semicolon check fails too
			'',
			'SCRIPT ERROR:',
			'Expecting semicolon',
			'Script: Unit 7 (type3 type 3)',
			'Info: testing',
			'Event: use',
			'Row: 3',
			'Col: 5',
			'Script: nope 1,2;'
		]);
		const short = world();
		short.engine.run('nope;', -1, 0);
		expect(short.console).toEqual(["SCRIPT ERROR: Script: Game Script (game.inf) Row:1 Col:5 ('debug' for details)"]);
	});

	it('class and state names', () => {
		const e = world().engine;
		expect(e.parse_getclass('unit')).toBe(2);
		expect(e.parse_getclass('3')).toBe(3);
		expect(e.parse_getclass('self')).toBe(-1);
		expect(e.parse_getclass('self', 0)).toBe(0);
		expect(e.errors[0].message).toBe("'self' is no valid class (object,unit,item,info,state[,self])");
		expect(e.parse_getclass('nonsense')).toBe(0);
		expect(e.errors.length).toBe(1);
		expect(e.parse_getstate('eternal fire')).toBe(5);
		expect(e.parse_getstate('54')).toBe(54);
		expect(e.parse_getstate('speed')).toBe(54);
		expect(e.parse_getaimode('sreturn')).toBe(102);
		expect(e.parse_getaisignal('flee')).toBe(-1);
		expect(e.parse_getclasstxt(4)).toBe('info');
	});
});

describe('events', () => {
	it('pre-parses event keys', () => {
		const e = world().engine;
		expect(e.preparse_string('on:start { } on:use{ }¦on:kill_1 {')).toBe('¦start¦use¦kill_1');
		expect(e.preparse_string('$a=1;')).toBe('');
		// quirk: plain text search
		expect(e.preparse_string('msg "Location: x"; // on:fake')).toBe('¦¦fake');
	});

	it('runs only the block of the current event; code outside blocks always runs', () => {
		const script = '$always++;\non:start { $s++; }\non:use { $u++; }';
		const w = world();
		w.engine.run(script, 0, 0, 'use');
		w.engine.run(script, 0, 0, 'other');
		expect(w.engine.var_get('always')).toBe('2');
		expect(w.engine.var_get('u')).toBe('1');
		expect(w.engine.var_exists('s')).toBe(0);
		expect(errorsOf(run('if (1) { on:start { $s=1; } }'))[0]).toBe("'on' must not be subordinated to conditions");
		expect(errorsOf(run('on start { }'))[0]).toBe("Expecting ':'");
	});

	it('queues global events in the original order', () => {
		const w = world();
		const e = w.engine;
		w.entities[1].push({ id: 10, typ: 2 }, { id: 11, typ: 1 }, { id: 12, typ: 2 });
		w.entities[2].push({ id: 20, typ: 1 });
		e.game_script_set('on:tick { echo "game"; }');
		e.map_briefing = 'on:tick { echo "map"; }';
		e.tx.add({ mode: 0, parent_class: 4, parent_id: 3, value: 'on:tick { echo "info3"; }' });
		e.tx.add({ mode: 0, parent_class: 1, parent_id: 11, value: 'on:other { echo "no"; }' });
		e.preparse();
		e.def_script_set(1, 1, 'on:tick { echo "objtype1"; }');
		e.def_script_set(1, 2, 'on:tick { echo "objtype2"; }');
		e.def_script_set(2, 1, 'on:tick { echo "unittype1"; }');
		e.parse_globalevent('tick', 'test');
		expect(e.tasks.map((t) => [t.class, t.id])).toEqual([
			[-1, 0],
			[0, 0],
			[4, 3],
			[1, 11],
			[1, 10],
			[1, 12],
			[2, 20]
		]);
		e.parse_all();
		expect(w.console).toEqual(['game', 'map', 'info3', 'objtype1', 'objtype2', 'objtype2', 'unittype1']);
		expect(e.tasks).toEqual([]);
	});

	it('emulated events run the definition script and the entity script', () => {
		const w = world();
		const e = w.engine;
		w.entities[3].push({ id: 5, typ: 8 });
		e.def_script_set(3, 8, 'on:use { $def=currentid(); }');
		e.tx.add({ mode: 0, parent_class: 3, parent_id: 5, value: 'on:use { $own=currentclass(); }' });
		e.preparse();
		e.parse_emuevent(3, 5, 'use');
		e.parse_emuevent(3, 5, 'nothing');
		e.parse_emuevent(3, 99, 'use');
		expect(e.tasks.length).toBe(2);
		expect(e.parse_sel(3, 5, 'use')).toBe(2);
		expect(e.var_get('def')).toBe('5');
		expect(e.var_get('own')).toBe('3');
	});

	it('quirk: set_parsecache queues the map script but reports 0', () => {
		const e = world().engine;
		e.map_briefing = 'on:go { $a=1; }';
		e.preparse();
		expect(e.set_parsecache(0, 0, 'go')).toBe(0);
		expect(e.tasks.length).toBe(1);
		e.tx.add({ mode: 0, parent_class: 2, parent_id: 1, value: 'on:go { }', key: '¦go' });
		expect(e.set_parsecache(2, 1, 'go')).toBe(1);
		expect(e.set_parsecache(2, 1, 'stay')).toBe(0);
	});

	it('the event command queues; queued tasks run after the current script', () => {
		const w = world();
		const e = w.engine;
		e.map_briefing = 'on:start { event "foo"; $a=1; }¦on:foo { $b=$a+1; }¦on:glob { $g++; }';
		e.game_script_set('on:glob { $g++; }');
		e.preparse();
		e.parse_globalevent('start');
		e.parse_all();
		expect(e.var_get('b')).toBe('2');
		e.run('event "glob","global";');
		expect(e.var_get('g')).toBe('2');
	});

	it('skipevent raises the flags the game checks', () => {
		const e = run('skipevent;').engine;
		expect([e.p_skipevent, e.tmp_skipevent]).toEqual([1, 1]);
	});

	it('refuses to parse while a parse is running', () => {
		let engine!: ScriptEngine;
		const w = world({
			cmd_closemenu: () => {
				engine.loadstring_parsecache('$x=1;');
				engine.parse();
			}
		} as Partial<ScriptHost>);
		engine = w.engine;
		expect(() => engine.run('closemenu;')).toThrow(/^Crossparsing Error/);
	});

	it('does nothing in the editor unless forced', () => {
		const e = world().engine;
		e.m_section_editor = true;
		e.loadstring_parsecache('$a=1;');
		expect(e.parse()).toBe(0);
		e.loadstring_parsecache('$a=1;');
		expect(e.parse(1)).toBe(1);
		expect(e.var_get('a')).toBe('1');
	});

	it('the parse cache drops empty lines and keeps the last line untrimmed', () => {
		const e = world().engine;
		e.loadstring_parsecache('  $a=1;  ¦¦\t$b=2;¦  $c=3;  ');
		expect(e.parse()).toBe(1);
		expect(e.p_lines).toBe(3);
		expect(e.add_parsecache('//')).toBe(0);
		expect(e.add_parsecache('// note')).toBe(1);
		expect(e.add_parsecache('   ')).toBe(0);
	});
});

describe('script mutation', () => {
	it('addscript replaces, extendscript appends', () => {
		const w = world();
		const e = w.engine;
		w.entities[1].push({ id: 4, typ: 1 });
		e.tx.add({ mode: 0, parent_class: 4, parent_id: 30, value: 'on:a { $a++; }' });
		e.tx.add({ mode: 0, parent_class: 4, parent_id: 31, value: 'on:b { $b++; }' });
		e.run('addscript "object",4,30; extendscript "object",4,31;');
		expect(e.errors).toEqual([]);
		const tx = e.tx.find((t) => t.parent_class === 1 && t.parent_id === 4)!;
		expect(tx.value).toBe('on:a { $a++; }¦on:b { $b++; }');
		expect(tx.key).toBe('¦a¦b');
		e.run('addscript "self",31;', 1, 4);
		expect(e.tx.items.filter((t) => t.parent_class === 1).map((t) => t.value)).toEqual(['on:b { $b++; }']);
		e.run('addscript "object",4,999;');
		expect(e.errors[0].details.slice(0, 2)).toEqual(["'999' is no valid text source", 'Use either an info id or a text file']);
	});

	it('def_extend / def_override / def_free change definition scripts', () => {
		const w = world({ ReadFileLines: (p) => (p === 'x.s2s' ? ['//~one', 'on:c { }', '//~two', 'on:d { }'] : null) });
		const e = w.engine;
		e.def_script_set(3, 5, 'on:a { }');
		e.run('def_extend "item",5,"x.s2s","two";\ndef_override "item",4,"x.s2s";\ndef_free "item",3;\ndef_free "item",9;');
		expect(e.Dscript[3][5]).toBe('on:a { }¦on:d { }');
		expect(e.Dscriptk[3][5]).toBe('¦a¦d');
		expect(e.Dscript[3][4]).toBe('//~one¦on:c { }¦//~two¦on:d { }');
		expect(errorsOf(w)).toEqual(["Type '9' is out of range"]);
		expect(errorsOf(run('def_free "state",1;'))[0]).toBe("Class 'state' is not expected");
	});

	it('the buffer', () => {
		const e = run('add "one"; add "two"; $b=buffer(); clear; $c=buffer();').engine;
		expect(e.var_get('b')).toBe('one¦two');
		// quirk: an empty function result as the whole expression is the empty term, "0"
		expect(e.var_get('c')).toBe('0');
		expect(e.pv.buffer).toBe('');
	});
});

describe('timers', () => {
	it('adds, counts, fires and frees', () => {
		const w = world();
		const e = w.engine;
		w.entities[2].push({ id: 1, typ: 1 });
		e.map_briefing = 'on:timer { $t++; }¦on:tock { $k++; }';
		e.preparse();
		e.tx.add({ mode: 0, parent_class: 2, parent_id: 1, value: 'on:ring { $ring=currentid(); }', key: '¦ring' });
		e.run('timer 0,100;\ntimer 0,50,2,"tock";\ntimer "unit",1,10,1,"ring";\n$n=timercount(0); $u=timercount("unit",1);');
		expect(e.errors).toEqual([]);
		expect(e.var_get('n')).toBe('2');
		expect(e.var_get('u')).toBe('1');
		expect(e.timers.map((t) => [t.parent_class, t.parent_id, t.duration, t.mode, t.typ, t.scr])).toEqual([
			[0, 0, 100, 1, 0, 'timer'],
			[0, 0, 50, 2, 0, 'tock'],
			[2, 1, 10, 1, 0, 'ring']
		]);
		w.now.gt = 51;
		e.timer_update();
		e.parse_all();
		expect([e.var_get('k'), e.var_get('ring'), e.var_exists('t')]).toEqual(['1', '1', 0]);
		expect(e.timers.length).toBe(2);
		w.now.gt = 102;
		e.timer_update();
		e.parse_all();
		expect([e.var_get('k'), e.var_get('t')]).toEqual(['2', '1']);
		expect(e.timers.length).toBe(0);
		e.run('timer 0,5,0,"tock";\ntimer 0,5;\nfreetimers 0,"tock";');
		expect(e.timers.map((t) => t.scr)).toEqual(['timer']);
		e.run('freetimers 0;');
		expect(e.timers.length).toBe(0);
	});

	it('script timers and missing parents', () => {
		const w = world();
		const e = w.engine;
		e.tx.add({ mode: 0, parent_class: 4, parent_id: 8, value: '$fired=1;' });
		e.run('timer 0,10,1,8;');
		expect(e.timers[0].typ).toBe(1);
		w.now.gt = 11;
		e.timer_update();
		e.parse_all();
		expect(e.var_get('fired')).toBe('1');
		// quirk: a script file is never loaded for a timer; the name is used as an event
		e.run('timer 0,10,1,"file.s2s";');
		expect([e.timers[0].typ, e.timers[0].scr]).toEqual([0, 'file.s2s']);
		const v = run('timer "unit",77,10;');
		expect(errorsOf(v)[0]).toBe("Object/Unit/Item/Info with ID '77' does not exist");
		expect(v.engine.timers.length).toBe(0);
	});
});

describe('host commands', () => {
	it('carries parsed parameters to the unimplemented host and records the call', () => {
		const w = world();
		w.engine.run('$t=5; randomcreate "object",$t+1,10,20.5,3; msg "Hello $t",2;');
		expect(w.engine.errors).toEqual([]);
		const rc = w.calls.find((c) => c.method === 'randomcreate')!;
		expect(rc.args).toEqual([1, 6, 10, 20.5, 3]);
		expect(w.calls.some((c) => c.args.includes('Hello 5'))).toBe(true);
	});

	it('uses a host answer as the function result', () => {
		const w = world({ cmd_day: () => '12' } as Partial<ScriptHost>);
		w.engine.run('if (day()>10) { $late=1; }');
		expect(w.engine.var_get('late')).toBe('1');
	});

	it('a recording host can be created without an engine', () => {
		const { host, calls } = createRecordingHost();
		expect(host.con_unit(3)).toBeUndefined();
		expect(calls).toEqual([{ method: 'con_unit', args: [3] }]);
	});
});

describe('dialogues', () => {
	const dlg = [
		'page=start',
		'title=Native',
		'text=start',
		'All hail!',
		'What want?',
		'text=end',
		'# a comment=ignored',
		'button=trade, I want to trade! ',
		'ibutton=5,info,Tell me',
		'button=action:close,Bye',
		'script=start',
		'$talked=1;',
		'script=end',
		'page=trade',
		'title=Trade',
		'trade=start',
		'sell=44,1',
		'buy=23',
		'trade=end'
	].join(SEP_LINE);

	it('parses a page into interface state', () => {
		const w = world({ Ditem_iconh: () => 1 } as Partial<ScriptHost>);
		const e = w.engine;
		e.dialogue.in_dlg = dlg;
		e.parse_dialogue('start');
		const d = e.dialogue;
		expect(e.errors).toEqual([]);
		expect(d.in_msgtitle).toBe('Native');
		expect(d.in_msgtext).toBe('All hail!¦What want?');
		expect(d.buttons.filter((b) => b.active).map((b) => [b.icon, b.scr, b.txt])).toEqual([
			[17, 'trade', 'I want to trade!'],
			[5, 'info', 'Tell me'],
			[17, 'action:close', 'Bye']
		]);
		expect(e.tasks.map((t) => [t.info, t.script])).toEqual([['dialogue script', '$talked=1;¦']]);
		e.parse_all();
		expect(e.var_get('talked')).toBe('1');

		e.parse_dialogue('trade');
		expect(d.in_msgtitle).toBe('Trade');
		expect(d.buttons.every((b) => b.active === 0)).toBe(true);
		expect(d.trades).toEqual([
			{ id: 1, mode: 0, typ: 0, count: 0 },
			{ id: 1, mode: 1, typ: 44, count: 1 },
			{ id: 1, mode: 2, typ: 23, count: 1 }
		]);
	});

	it('button actions and missing pages', () => {
		const w = world();
		const e = w.engine;
		e.dialogue.in_dlg = dlg;
		e.parse_dialogue('action:close');
		expect(e.dialogue.m_menu_closed).toBe(true);
		e.parse_dialogue('script:$clicked=1;');
		e.parse_all();
		expect(e.var_get('clicked')).toBe('1');
		e.parse_dialogue('nowhere');
		expect(e.errors[0].message).toBe("the dialogue page 'nowhere' is not defined");
		e.dialogue.in_dlg = 'page=x' + SEP_LINE + 'colour=red';
		expect(() => e.parse_dialogue('x')).toThrow("Invalid DIALOGUE Property 'colour'");
	});
});

describe('static scan', () => {
	it('lists commands, functions and events without running anything', () => {
		const res = scanScript('on:use {\n\tif (count_stored("unit",1)>2) { msg "a; b (c)"; }\n\t$x=random(5);\n\tnope 1;\n\t$y=bogus(2);\n}', '\n');
		expect(res.events).toEqual(['use']);
		expect([...res.commands.keys()]).toEqual(['on', 'if', 'msg', '$', 'nope']);
		expect([...res.functions.keys()]).toEqual(['count_stored', 'random', 'bogus']);
		expect(res.unknown.map((u) => [u.kind, u.name, u.row])).toEqual([
			['command', 'nope', 4],
			['function', 'bogus', 5]
		]);
		expect(res.problems).toEqual([]);
	});
});
