/**
 * Parser for the declarations of the original Stranded II Blitz3D source:
 * Global, Dim, Const, Type/Field, Function, labels, Goto/Gosub, the call
 * graph and the top-level statements of every file. Read-only: the source is
 * only tokenised, never executed.
 *
 * Used by scripts/gen-game-foundation.mjs (state.ts, types.ts, defs.ts,
 * function_index.json) and by tests/gameState.test.ts (completeness checks).
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Default location of the original source, relative to the project root. */
export const DEFAULT_SOURCE = join(import.meta.dirname, '..', '..', 's2_re', 'source', 'source');

export function sourceAvailable(root = DEFAULT_SOURCE) {
	return existsSync(join(root, 'StrandedII.bb'));
}

/** Files in the order StrandedII.bb includes them; files never included come last. */
export function sourceFiles(root = DEFAULT_SOURCE) {
	const main = readFileSync(join(root, 'StrandedII.bb'), 'latin1');
	const order = ['StrandedII.bb'];
	const seen = new Set(order);
	const scan = (text, list) => {
		for (const m of text.matchAll(/^[ \t]*Include[ \t]+"([^"]+)"/gim)) {
			const rel = m[1].replaceAll('\\', '/');
			if (seen.has(rel.toLowerCase())) continue;
			seen.add(rel.toLowerCase());
			list.push(rel);
			if (existsSync(join(root, rel))) scan(readFileSync(join(root, rel), 'latin1'), list);
		}
	};
	scan(main, order);
	const included = order.length;
	for (const dir of ['includes', 'includes/ai']) {
		for (const f of readdirSync(join(root, dir)).sort()) {
			if (!/\.bb$/i.test(f)) continue;
			const rel = `${dir}/${f}`;
			if (!seen.has(rel.toLowerCase())) {
				seen.add(rel.toLowerCase());
				order.push(rel);
			}
		}
	}
	return { files: order, included };
}

/** Removes the comment and blanks out string literals (same length), so columns stay valid. */
export function stripLine(line) {
	let out = '';
	let inStr = false;
	for (let i = 0; i < line.length; i++) {
		const c = line[i];
		if (inStr) {
			if (c === '"') {
				inStr = false;
				out += '"';
			} else out += ' ';
		} else if (c === '"') {
			inStr = true;
			out += '"';
		} else if (c === ';') break;
		else out += c;
	}
	return out;
}

/** Splits a declaration list on top-level commas. */
function splitTop(s) {
	const parts = [];
	let depth = 0;
	let cur = '';
	let inStr = false;
	for (const c of s) {
		if (inStr) {
			cur += c;
			if (c === '"') inStr = false;
			continue;
		}
		if (c === '"') inStr = true;
		if (c === '(' || c === '[') depth++;
		if (c === ')' || c === ']') depth--;
		if (c === ',' && depth === 0) {
			parts.push(cur);
			cur = '';
		} else cur += c;
	}
	if (cur.trim() !== '') parts.push(cur);
	return parts.map((p) => p.trim());
}

/** Statements of a line: split on ':' outside strings and parentheses. */
function splitStatements(code) {
	const parts = [];
	let cur = '';
	let inStr = false;
	let depth = 0;
	for (const c of code) {
		if (inStr) {
			cur += c;
			if (c === '"') inStr = false;
			continue;
		}
		if (c === '"') inStr = true;
		if (c === '(') depth++;
		if (c === ')') depth--;
		if (c === ':' && depth === 0) {
			parts.push(cur);
			cur = '';
		} else cur += c;
	}
	parts.push(cur);
	return parts;
}

const SIGIL = { '%': 'int', '#': 'float', $: 'string' };

/** "name#", "name.Type", "name$(3)", "name[2]" -> { name, type, ref, rest } */
function parseVar(decl) {
	const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*([%#$]|\.\s*[A-Za-z_][A-Za-z0-9_]*)?\s*(.*)$/s.exec(decl.trim());
	if (!m) return null;
	let type = 'int';
	let ref = null;
	if (m[2]) {
		if (m[2][0] === '.') {
			type = 'ref';
			ref = m[2].slice(1).trim();
		} else type = SIGIL[m[2]];
	}
	return { name: m[1], type, ref, rest: m[3].trim() };
}

/** Blocking commands of the Blitz runtime: the program stands still inside them. */
export const BLOCKING_COMMANDS = ['flip', 'delay', 'waitkey', 'waitmouse', 'waittimer', 'vwait', 'input'];

/**
 * @returns {{
 *   files: string[], included: number,
 *   globals: any[], dims: any[], consts: any[], types: any[], functions: any[],
 *   toplevel: Record<string, {line:number,text:string}[]>, labels: any[], jumps: any[],
 *   lineCounts: Record<string, number>
 * }}
 */
export function parseSource(root = DEFAULT_SOURCE) {
	const { files, included } = sourceFiles(root);
	const globals = [];
	const dims = [];
	const consts = [];
	const types = [];
	const functions = [];
	const toplevel = {};
	const labels = [];
	const jumps = [];
	const lineCounts = {};
	const bodies = [];

	for (const file of files) {
		const lines = readFileSync(join(root, file), 'latin1').split(/\r?\n/);
		lineCounts[file] = lines.length;
		toplevel[file] = [];
		let fn = null;
		let type = null;
		for (let i = 0; i < lines.length; i++) {
			const code = stripLine(lines[i]);
			const raw = lines[i];
			const t = code.trim();
			if (t === '') continue;
			const line = i + 1;
			const comment = commentOf(raw);
			let m;

			if (type) {
				if (/^End\s*Type\b/i.test(t)) {
					type = null;
					continue;
				}
				if ((m = /^Field\s+(.*)$/i.exec(t))) {
					for (const part of splitTop(m[1])) {
						const v = parseVar(part);
						if (!v) continue;
						let size = null;
						const a = /^\[\s*(\d+)\s*\]/.exec(v.rest);
						if (a) size = Number(a[1]);
						type.fields.push({ name: v.name, type: v.type, ref: v.ref, size, line, comment });
					}
				}
				continue;
			}
			if ((m = /^Type\s+([A-Za-z_][A-Za-z0-9_]*)/i.exec(t))) {
				type = { name: m[1], file, line, comment, fields: [] };
				types.push(type);
				continue;
			}

			if (!fn && (m = /^Function\s+([A-Za-z_][A-Za-z0-9_]*)\s*([%#$]|\.\s*[A-Za-z_][A-Za-z0-9_]*)?\s*(?:\((.*)\))?\s*$/i.exec(t))) {
				// parameter defaults contain string literals: take them from the raw line.
				// "Function name" without a parameter list is legal (watersystem.bb).
				const rawParams = (/\((.*)\)/s.exec(stripComment(raw)) ?? ['', ''])[1];
				const params = splitTop(rawParams).map((p) => {
					const eq = p.indexOf('=');
					const v = parseVar(eq >= 0 ? p.slice(0, eq) : p);
					return { name: v.name, type: v.type, ref: v.ref, default: eq >= 0 ? p.slice(eq + 1).trim() : null };
				});
				let ret = 'int';
				let retRef = null;
				if (m[2]) {
					if (m[2][0] === '.') {
						ret = 'ref';
						retRef = m[2].slice(1).trim();
					} else ret = SIGIL[m[2]];
				}
				fn = { name: m[1], ret, retRef, params, file, line, endLine: line, body: [] };
				functions.push(fn);
				continue;
			}
			if (fn) {
				if (/^End\s*Function\b/i.test(t)) {
					fn.endLine = line;
					bodies.push(fn);
					fn = null;
					continue;
				}
				fn.body.push({ line, code });
			}

			for (const stmtRaw of splitStatements(code)) {
				const stmt = stmtRaw.trim();
				if (stmt === '') continue;
				if ((m = /^Global\s+(.*)$/i.exec(stmt))) {
					// initialisers contain string literals: re-read from the raw line
					const rawStmt = rawStatement(raw, /Global\s+/i);
					for (const part of splitTop(rawStmt)) {
						const eq = topLevelEquals(part);
						const v = parseVar(eq >= 0 ? part.slice(0, eq) : part);
						if (!v) continue;
						globals.push({
							name: v.name,
							type: v.type,
							ref: v.ref,
							init: eq >= 0 ? part.slice(eq + 1).trim() : null,
							file,
							line,
							comment,
							inFunction: fn ? fn.name : null
						});
					}
				} else if ((m = /^Dim\s+(.*)$/i.exec(stmt))) {
					for (const part of splitTop(m[1])) {
						const v = parseVar(part);
						if (!v) continue;
						const a = /^\((.*)\)$/s.exec(v.rest);
						dims.push({
							name: v.name,
							type: v.type,
							ref: v.ref,
							dims: a ? splitTop(a[1]) : [],
							file,
							line,
							comment,
							inFunction: fn ? fn.name : null
						});
					}
				} else if ((m = /^Const\s+(.*)$/i.exec(stmt))) {
					const rawStmt = rawStatement(raw, /Const\s+/i);
					for (const part of splitTop(rawStmt)) {
						const eq = topLevelEquals(part);
						if (eq < 0) continue;
						const v = parseVar(part.slice(0, eq));
						if (!v) continue;
						consts.push({ name: v.name, type: v.type, value: part.slice(eq + 1).trim(), file, line });
					}
				} else if ((m = /^\.([A-Za-z_][A-Za-z0-9_]*)$/.exec(stmt))) {
					labels.push({ name: m[1], file, line, inFunction: fn ? fn.name : null });
				} else if (!fn && !/^(Include|End Function)\b/i.test(stmt)) {
					toplevel[file].push({ line, text: stmt });
				}
				if ((m = /\b(Goto|Gosub)\s+([A-Za-z_][A-Za-z0-9_]*)/i.exec(stmt))) {
					jumps.push({ kind: m[1], label: m[2], file, line, inFunction: fn ? fn.name : null });
				}
			}
		}
	}

	// ---- call graph
	const byName = new Map();
	for (const f of functions) if (!byName.has(f.name.toLowerCase())) byName.set(f.name.toLowerCase(), f);
	const blocking = new Set(BLOCKING_COMMANDS);
	const analyse = (bodyLines) => {
		const calls = new Set();
		const blocks = new Set();
		for (const { code } of bodyLines) {
			for (const stmtRaw of splitStatements(code)) {
				// statements after Then/Else on the same line start a new statement
				for (const stmt of stmtRaw.split(/\b(?:Then|Else)\b/i)) {
					const re = /(\\\s*)?([A-Za-z_][A-Za-z0-9_]*)([%#$])?(\s*)(.?)/g;
					let m;
					let first = true;
					const lead = /^\s*(?:(?:If|ElseIf|Else If|While|Until|Return|Case|Select|For|To|Step|Not|And|Or|Xor)\b)?/i;
					void lead;
					while ((m = re.exec(stmt))) {
						const id = m[2].toLowerCase();
						const isField = !!m[1];
						const next = m[5];
						const prevChar = m.index > 0 ? stmt[m.index - 1] : '';
						const atStart = first && stmt.slice(0, m.index).trim() === '';
						first = false;
						re.lastIndex = m.index + (m[1] ? m[1].length : 0) + m[2].length + (m[3] ? 1 : 0);
						if (isField || prevChar === '.') continue;
						if (byName.has(id)) {
							// a call has "(" after it, or stands at the start of a statement and is not assigned to
							if (next === '(' || (atStart && next !== '=')) calls.add(byName.get(id).name);
						} else if (blocking.has(id)) {
							// "Input" only counts as the command (Input("...") / Input$), never as a variable
							if (id === 'input' && next !== '(') continue;
							if (next === '=' && id !== 'flip') continue;
							blocks.add(id);
						}
					}
				}
			}
		}
		return { calls: [...calls], blocks: [...blocks] };
	};
	for (const f of functions) {
		const a = analyse(f.body);
		f.calls = a.calls;
		f.blocks = a.blocks;
	}
	const topCalls = {};
	for (const file of files) {
		const a = analyse(toplevel[file].map((s) => ({ code: s.text })));
		topCalls[file] = a;
	}

	return { files, included, globals, dims, consts, types, functions, toplevel, topCalls, labels, jumps, lineCounts };
}

/** The text of the trailing ; comment of a line, '' if none. */
function commentOf(line) {
	const code = stripComment(line);
	return code.length < line.length ? line.slice(code.length + 1).trim() : '';
}

function stripComment(line) {
	let inStr = false;
	for (let i = 0; i < line.length; i++) {
		const c = line[i];
		if (c === '"') inStr = !inStr;
		else if (c === ';' && !inStr) return line.slice(0, i);
	}
	return line;
}

/** The text after the keyword up to the end of that statement, from the raw line (strings intact). */
function rawStatement(raw, keyword) {
	const line = stripComment(raw);
	const m = keyword.exec(line);
	if (!m) return '';
	const rest = line.slice(m.index + m[0].length);
	let inStr = false;
	let depth = 0;
	for (let i = 0; i < rest.length; i++) {
		const c = rest[i];
		if (c === '"') inStr = !inStr;
		else if (!inStr) {
			if (c === '(') depth++;
			else if (c === ')') depth--;
			else if (c === ':' && depth === 0) return rest.slice(0, i);
		}
	}
	return rest;
}

function topLevelEquals(part) {
	let inStr = false;
	let depth = 0;
	for (let i = 0; i < part.length; i++) {
		const c = part[i];
		if (c === '"') inStr = !inStr;
		else if (!inStr) {
			if (c === '(') depth++;
			else if (c === ')') depth--;
			else if (c === '=' && depth === 0) return i;
		}
	}
	return -1;
}

/**
 * Functions that block in the original: they contain a blocking command or
 * call (directly or transitively) a function that does.
 * `extraSeeds`: function names that are blocking in the port for another reason.
 */
export function blockingClosure(functions, extraSeeds = []) {
	const byName = new Map(functions.map((f) => [f.name.toLowerCase(), f]));
	const reason = new Map();
	for (const f of functions) if (f.blocks.length) reason.set(f.name.toLowerCase(), f.blocks.join('/'));
	for (const s of extraSeeds) if (byName.has(s.toLowerCase()) && !reason.has(s.toLowerCase())) reason.set(s.toLowerCase(), 'port');
	let changed = true;
	while (changed) {
		changed = false;
		for (const f of functions) {
			const k = f.name.toLowerCase();
			if (reason.has(k)) continue;
			for (const c of f.calls) {
				if (reason.has(c.toLowerCase())) {
					reason.set(k, 'calls ' + c);
					changed = true;
					break;
				}
			}
		}
	}
	return reason;
}
