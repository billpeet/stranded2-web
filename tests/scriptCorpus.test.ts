import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SEP_LINE, Trim } from '../src/lib/s2/blitz';
import { parseMap } from '../src/lib/s2/formats/map';
import {
	BlitzRuntimeError,
	commandIndex,
	createRecordingHost,
	createScriptEngine,
	scanScript,
	type ScanResult,
	type ScriptHost
} from '../src/lib/s2/script';

// Every script shipped with the game: definition scripts in sys/*.inf,
// script files (*.s2s) and the scripts stored inside the maps.
const root = resolve('static/game/mod');
const have = existsSync(root);

interface Source {
	/** Where it comes from, for messages. */
	name: string;
	/** Script class the game would run it in (-1 game.inf, 0 global, 1..4 entity). */
	cls: number;
	script: string;
}

const latin1 = (path: string) => readFileSync(path, 'latin1');
const fileLines = (path: string) => latin1(path).split(/\r?\n/);

function walk(dir: string, out: string[] = []): string[] {
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) walk(p, out);
		else out.push(p);
	}
	return out;
}

const rel = (p: string) => relative(root, p).split(sep).join('/');

/** script=start ... script=end blocks, stored the way the loaders do (lines trimmed, each followed by 0xA6). */
function infScripts(path: string): Source[] {
	const base = rel(path);
	const file = base.replace(/^sys\//, '');
	const cls = /^objects/.test(file)
		? 1
		: /^units/.test(file)
			? 2
			: /^items/.test(file)
				? 3
				: /^infos/.test(file)
					? 4
					: file === 'game.inf'
						? -1
						: 0;
	const out: Source[] = [];
	const lines = fileLines(path);
	let id = '';
	for (let i = 0; i < lines.length; i++) {
		const t = Trim(lines[i]);
		if (t.startsWith('id=')) id = t.substring(3);
		if (t === 'script=start') {
			const startLine = i + 1;
			let script = '';
			for (i++; i < lines.length; i++) {
				if (Trim(lines[i]) === 'script=end') break;
				script += Trim(lines[i]) + SEP_LINE;
			}
			out.push({ name: `${base}:${startLine} (id ${id})`, cls, script });
		}
	}
	return out;
}

/** A dialogue definition (page=...): its script blocks and "script:" buttons. */
function dialogueScripts(name: string, lines: string[]): Source[] {
	const out: Source[] = [];
	for (let i = 0; i < lines.length; i++) {
		const t = lines[i];
		if (Trim(t) === 'script=start') {
			const startLine = i + 1;
			let script = '';
			for (i++; i < lines.length; i++) {
				if (lines[i] === 'script=end') break;
				script += lines[i] + SEP_LINE;
			}
			out.push({ name: `${name}:${startLine} (dialogue script)`, cls: 0, script });
		} else {
			const m = /^i?button=(?:[^,]*,)?\s*script:([^,]*)/.exec(t);
			if (m) out.push({ name: `${name}:${i + 1} (dialogue button)`, cls: 0, script: Trim(m[1]) });
		}
	}
	return out;
}

const isDialogue = (lines: string[]) => lines.some((l) => /^page=/.test(l));

/** Does a text look like a script (as opposed to prose kept in a text container or a diary section)? */
function looksLikeScript(text: string): boolean {
	const lines = text
		.split(SEP_LINE)
		.map((l) => Trim(l))
		.filter((l) => l !== '' && !l.startsWith('//'));
	if (lines.length === 0) return false;
	return lines.every((l) => /[;{}]\s*(\/\/.*)?$|^\/\*|\*\/$|^on:/.test(l)) || lines.some((l) => /^on:\w+/.test(l));
}

/** A *.s2s file as parse_loadscript() reads it: whole, and each "//~name" section on its own. */
function s2sScripts(path: string): { scripts: Source[]; texts: number } {
	const name = rel(path);
	const lines = fileLines(path);
	if (lines.length && lines[lines.length - 1] === '') lines.pop();
	if (isDialogue(lines) && !lines.some((l) => l.startsWith('//~'))) return { scripts: dialogueScripts(name, lines), texts: 0 };
	const scripts: Source[] = [];
	let texts = 0;
	const sections = new Map<string, string[]>();
	let cur: string[] | null = null;
	const head: string[] = [];
	for (const l of lines) {
		if (l.startsWith('//~')) {
			cur = [];
			sections.set(l.substring(3), cur);
		} else if (cur) cur.push(l);
		else head.push(l);
	}
	if (sections.size === 0) {
		// Some .s2s files hold a plain description text.
		const text = lines.join(SEP_LINE);
		if (looksLikeScript(text)) scripts.push({ name, cls: 0, script: text });
		else texts++;
	} else {
		if (head.some((l) => Trim(l) !== '')) {
			const text = head.join(SEP_LINE);
			if (looksLikeScript(text)) scripts.push({ name: `${name} (head)`, cls: 0, script: text });
			else texts++;
		}
		for (const [sec, body] of sections) {
			const text = body.join(SEP_LINE);
			if (isDialogue(body)) scripts.push(...dialogueScripts(`${name}//~${sec}`, body));
			else if (looksLikeScript(text)) scripts.push({ name: `${name}//~${sec}`, cls: 0, script: text });
			else texts++;
		}
	}
	return { scripts, texts };
}

function mapScripts(path: string): { scripts: Source[]; texts: number; infoVars: number } {
	const name = rel(path);
	const map = parseMap(new Uint8Array(readFileSync(path)));
	const scripts: Source[] = [];
	let texts = 0;
	if (map.briefing !== '') scripts.push({ name: `${name} briefing`, cls: 0, script: map.briefing });
	const infoTyp = new Map(map.infos.map((i) => [i.id, i.typ]));
	for (const x of map.extensions) {
		if (x.mode !== 0) continue;
		const label = `${name} Tx(class ${x.parentClass}, id ${x.parentId})`;
		// Text container infos (type 37) hold texts, dialogues or script sources.
		if (x.parentClass === 4 && infoTyp.get(x.parentId) === 37) {
			const lines = x.value.split(SEP_LINE);
			if (isDialogue(lines)) scripts.push(...dialogueScripts(label, lines));
			else if (looksLikeScript(x.value)) scripts.push({ name: label + ' (text container)', cls: 0, script: x.value });
			else texts++;
		} else {
			scripts.push({ name: label, cls: x.parentClass, script: x.value });
		}
	}
	// Info "vars" are the field values of the info (numbers and short strings), not scripts.
	let infoVars = 0;
	for (const i of map.infos) {
		if (i.vars === '') continue;
		infoVars++;
		for (const field of i.vars.split(SEP_LINE)) {
			if (/;\s*$/.test(field) || /^on:\w+/.test(field)) {
				scripts.push({ name: `${name} info ${i.id} vars`, cls: 4, script: field });
			}
		}
	}
	return { scripts, texts, infoVars };
}

function gather() {
	const all = walk(root);
	const sources: Source[] = [];
	const count = { inf: 0, s2s: 0, map: 0, texts: 0, infoVars: 0, files: 0 };
	for (const p of all) {
		const r = rel(p).toLowerCase();
		if (/^sys\/[^/]+\.inf$/.test(r)) {
			const s = infScripts(p);
			if (s.length) count.files++;
			count.inf += s.length;
			sources.push(...s);
		} else if (r.endsWith('.s2s')) {
			const s = s2sScripts(p);
			count.files++;
			count.s2s += s.scripts.length;
			count.texts += s.texts;
			sources.push(...s.scripts);
		} else if (/\.s2$/.test(r) && r.startsWith('maps/')) {
			const s = mapScripts(p);
			count.files++;
			count.map += s.scripts.length;
			count.texts += s.texts;
			count.infoVars += s.infoVars;
			sources.push(...s.scripts);
		}
	}
	return { sources, count };
}

describe.skipIf(!have)('script corpus', () => {
	const { sources, count } = have
		? gather()
		: { sources: [], count: { inf: 0, s2s: 0, map: 0, texts: 0, infoVars: 0, files: 0 } };

	it('finds the shipped scripts', () => {
		expect(count.inf).toBeGreaterThan(200);
		expect(count.s2s).toBeGreaterThan(20);
		expect(count.map).toBeGreaterThan(50);
	});

	it('knows every command and function used by any shipped script', () => {
		const engine = createScriptEngine();
		const commands = new Map<string, number>();
		const functions = new Map<string, number>();
		const unknown: string[] = [];
		const problems: string[] = [];
		const voidFunctions = new Map<string, number>();
		let lines = 0;
		let statements = 0;
		let events = 0;
		for (const src of sources) {
			// Pre-parse: the event key must list every on: block the walk finds.
			const key = engine.preparse_string(src.script);
			const res: ScanResult = scanScript(src.script);
			lines += res.lines;
			statements += res.statements;
			events += res.events.length;
			for (const [k, n] of res.commands) commands.set(k, (commands.get(k) ?? 0) + n);
			for (const [k, n] of res.functions) functions.set(k, (functions.get(k) ?? 0) + n);
			for (const u of res.unknown) unknown.push(`${src.name} row ${u.row}: unknown ${u.kind} '${u.name}' in: ${u.line}`);
			for (const p of res.problems) problems.push(`${src.name} row ${p.row} col ${p.col}: ${p.message} in: ${p.line}`);
			for (const v of res.voidFunctions) voidFunctions.set(v.name, (voidFunctions.get(v.name) ?? 0) + 1);
			for (const e of res.events) expect(key, src.name).toContain(SEP_LINE + e);
		}
		const used = new Set([...commands.keys(), ...functions.keys()].filter((n) => commandIndex.has(n)));
		console.log(
			`corpus: ${sources.length} scripts (${count.inf} in inf files, ${count.s2s} from s2s files, ${count.map} in maps) from ${count.files} files; ` +
				`${count.texts} non-script texts and ${count.infoVars} info var records skipped; ` +
				`${lines} lines, ${statements} statements, ${events} on: blocks; ` +
				`${commands.size} distinct statement words, ${functions.size} distinct functions, ` +
				`${used.size} of ${commandIndex.size} table names used`
		);
		if (voidFunctions.size) {
			console.log(
				'function-style use of commands that return nothing: ' + [...voidFunctions].map(([k, n]) => `${k} x${n}`).join(', ')
			);
		}
		if (problems.length) console.log(`structural findings (${problems.length}):\n` + problems.slice(0, 40).join('\n'));
		expect(unknown).toEqual([]);
	});

	it('runs every event of every shipped script without an unknown command', () => {
		// A stand-in world: every entity exists, every host function answers "0".
		const { host } = createRecordingHost(
			{
				con_object: () => 1,
				con_unit: () => 1,
				con_item: () => 1,
				con_info: () => 1,
				parent_con: () => 1,
				g_player: () => 1,
				gt: () => 1000,
				entities: () => [],
				entity_typ: () => 1,
				def_name: () => 'x',
				ReadFileLines: (path: string) => {
					const p = join(root, path.split(String.fromCharCode(92)).join('/'));
					return existsSync(p) ? fileLines(p) : null;
				},
				ReadFileBytes: () => null,
				WriteFileBytes: () => 1
			} as Partial<ScriptHost>,
			false
		);
		const answering = new Proxy(host, {
			get(target, prop) {
				if (typeof prop === 'string' && /^(cmd_|count|ha_|e_tery|randomcreate)/.test(prop)) return () => '0';
				if (prop === 'parent_h' || prop === 'parent_pos') return () => 1;
				return (target as unknown as Record<string | symbol, unknown>)[prop];
			}
		});
		const engine = createScriptEngine(answering);
		engine.stepLimit = 2_000_000;
		// The definition counts of game.inf (Cobject_count ...), so def_extend & co. accept their types.
		for (const cls of [1, 2, 3, 4]) engine.Dcount[cls] = 255;
		const byId = new Map<string, number>();
		const samples = new Map<string, string>();
		const distinct = new Map<string, number>();
		const uk: string[] = [];
		const fatal: string[] = [];
		let runs = 0;
		for (const src of sources) {
			const events = new Set(['', ...engine.preparse_string(src.script).split(SEP_LINE)]);
			for (const event of events) {
				engine.clearErrors();
				engine.tasks.length = 0;
				engine.timers.length = 0;
				engine.p_parseinprogress = 0;
				engine.parse_env(src.cls, 1, event, 'corpus');
				engine.loadstring_parsecache(src.script);
				runs++;
				try {
					engine.parse();
				} catch (e) {
					if (!(e instanceof BlitzRuntimeError)) throw e;
					fatal.push(`${src.name} on:${event}: ${e.message}`);
				}
				for (const err of engine.errors) {
					const id = err.id.length > 14 ? 'message' : err.id;
					byId.set(id, (byId.get(id) ?? 0) + 1);
					const mk = err.message + ' in: ' + err.line;
					distinct.set(mk, (distinct.get(mk) ?? 0) + 1);
					if (!samples.has(id)) samples.set(id, `${src.name} on:${event} row ${err.row} col ${err.col}: ${err.message} in: ${err.line}`);
					if (err.id === 'uk') uk.push(`${src.name} on:${event} row ${err.row}: ${err.message} in: ${err.line}`);
				}
			}
		}
		console.log(
			`executed ${runs} script/event runs; script errors by id: ${JSON.stringify([...byId])}; runtime errors: ${fatal.length}`
		);
		for (const [id, s] of samples) console.log(`first '${id}': ${s}`);
		if (fatal.length) console.log(fatal.slice(0, 20).join('\n'));
		if (process.env.S2_CORPUS_ERRORS) console.log([...distinct].map(([k, n]) => n + 'x ' + k).join(String.fromCharCode(10)));
		expect(uk).toEqual([]);
	});
});
