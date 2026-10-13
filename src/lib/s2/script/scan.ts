/**
 * Static walk over a script: no execution, no game world. It follows the
 * same line, comment and command-word rules as parse() and reports which
 * commands, functions and events a script uses. Not part of the original;
 * used to check scripts against the command table.
 */
import { SEP_LINE, Trim } from '../blitz';
import { commandIndex, keywordIndex } from './commandTable';

export interface ScanUse {
	name: string;
	kind: 'command' | 'function';
	/** 1-based row (after empty lines are dropped, as in the parse cache) and column. */
	row: number;
	col: number;
	line: string;
}

export interface ScanResult {
	/** Lines in the parse cache. */
	lines: number;
	statements: number;
	/** Statement-level command words (including if/on/loop/$...), with counts. */
	commands: Map<string, number>;
	/** Names used as "name(" inside parameters, with counts. */
	functions: Map<string, number>;
	/** Events of "on:" blocks, in order. */
	events: string[];
	/** Names that are neither in the command table nor keywords. */
	unknown: ScanUse[];
	/** Function-style uses of a command that never assigns p_return$. */
	voidFunctions: ScanUse[];
	/** Structural findings: stray characters, unbalanced braces, missing semicolons. */
	problems: { message: string; row: number; col: number; line: string }[];
}

/** loadstring_parsecache(): split, trim, drop empty lines (the last line stays untrimmed). */
export function scriptLines(script: string, sep = SEP_LINE): string[] {
	const out: string[] = [];
	const parts = script.split(sep);
	parts.forEach((part, i) => {
		if (i < parts.length - 1) {
			const t = Trim(part);
			if (t !== '') out.push(t);
		} else if (part !== '') {
			out.push(part);
		}
	});
	return out;
}

const isWord = (s: number) => !(s < 48 || (s > 57 && s < 65) || (s > 90 && s < 95) || s === 96 || s > 122);

export function scanScript(script: string, sep = SEP_LINE): ScanResult {
	const lines = scriptLines(script, sep);
	const res: ScanResult = {
		lines: lines.length,
		statements: 0,
		commands: new Map(),
		functions: new Map(),
		events: [],
		unknown: [],
		voidFunctions: [],
		problems: []
	};
	const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
	let comment = false;
	let depth = 0;

	for (let row = 0; row < lines.length; row++) {
		const l = lines[row];
		let p = 0; // 0-based
		const problem = (message: string) => res.problems.push({ message, row: row + 1, col: p + 1, line: l });

		/** Functions in parameter text: "name(" with name made of a-z and _ (parse_math_getcom). */
		const findFunctions = (from: number, to: number) => {
			let quote = false;
			let stripped = '';
			const cols: number[] = [];
			for (let i = from; i < to; i++) {
				const c = l[i];
				if (c === '"') quote = !quote;
				if (quote || c === '"') {
					stripped += '"'; // placeholder: quoted text never forms a name
					cols.push(i);
				} else if (c !== ' ' && c !== '\t') {
					stripped += c;
					cols.push(i);
				}
			}
			for (let i = 1; i < stripped.length; i++) {
				if (stripped[i] !== '(') continue;
				let j = i;
				while (j > 0) {
					const s = stripped.charCodeAt(j - 1);
					if ((s < 97 || s > 122) && s !== 95) break;
					j--;
				}
				const name = stripped.substring(j, i);
				if (name === '') continue;
				// parse_math_op(prefix, 2): a prefix ending in an operator word is no function call.
				if (/(or|and|xor)$/.test(name)) continue;
				bump(res.functions, name);
				const use: ScanUse = { name, kind: 'function', row: row + 1, col: cols[j] + 1, line: l };
				const def = commandIndex.get(name);
				if (!def) res.unknown.push(use);
				else if (!def.returns) res.voidFunctions.push(use);
			}
		};

		/** End of a statement: the next ';' outside quotes (or a brace / end of line). */
		const statementEnd = (from: number): number => {
			let quote = false;
			for (let i = from; i < l.length; i++) {
				const c = l[i];
				if (c === '"') quote = !quote;
				else if (!quote) {
					if (c === ';') return i;
					if (c === '{' || c === '}') return -i - 1;
					if (c === '/' && l[i + 1] === '/') return -i - 1;
				}
			}
			return -l.length - 1;
		};

		/** A bracketed condition as param() scans it: up to the bracket that closes the first one. */
		const conditionEnd = (from: number): number => {
			let quote = false;
			let brace = 0;
			for (let i = from; i < l.length; i++) {
				const c = l[i];
				if (c === '"') quote = !quote;
				else if (!quote) {
					if (c === '(') brace++;
					else if (c === ')') {
						brace--;
						if (brace <= 0) return i + 1;
					} else if ((c === ';' || c === ',') && brace === 0) return i;
					else if (c === '{' && brace === 0) return i;
				}
			}
			return l.length;
		};

		while (p < l.length) {
			while (p < l.length && (l[p] === ' ' || l[p] === '\t')) p++;
			if (p >= l.length) break;
			const twof = l.substring(p, p + 2);
			if (comment) {
				if (twof === '*/') {
					comment = false;
					p += 2;
					while (p < l.length && (l[p] === ' ' || l[p] === '\t')) p++;
				} else if (l.includes('*/')) {
					p++;
					continue;
				} else {
					break;
				}
			} else {
				if (twof === '//') break;
				if (twof === '/*') {
					comment = true;
					continue;
				}
			}
			if (p >= l.length) break;

			// parse_com()
			const start = p;
			while (p < l.length && isWord(l.charCodeAt(p))) p++;
			let com = '';
			if (p < l.length && l[p] === '$') com = '$';
			else if (p < l.length && l[p] === '@') com = '@';
			else if (p > start) com = l.substring(start, p).toLowerCase();

			if (com === '') {
				const c = l[p];
				if (c === '{') depth++;
				else if (c === '}') {
					depth--;
					if (depth < 0) {
						problem("'}' without '{'");
						depth = 0;
					}
				} else problem("Unexpected '" + c + "'");
				p++;
				continue;
			}

			bump(res.commands, com);
			if (!keywordIndex.has(com) && !commandIndex.has(com)) {
				res.unknown.push({ name: com, kind: 'command', row: row + 1, col: start + 1, line: l });
			}

			if (com === '@') {
				p++;
				continue;
			}
			res.statements++;
			if (com === 'on') {
				if (l[p] !== ':') {
					problem("Expecting ':'");
					continue;
				}
				const s = ++p;
				while (p < l.length && isWord(l.charCodeAt(p))) p++;
				res.events.push(l.substring(s, p));
				continue;
			}
			if (com === 'if' || com === 'elseif' || com === 'loop') {
				const e = conditionEnd(p);
				findFunctions(p, e);
				p = e;
				continue;
			}
			if (com === 'else') continue;

			// Everything else runs to its semicolon.
			const e = statementEnd(p);
			if (e >= 0) {
				findFunctions(p, e);
				p = e + 1;
			} else {
				const stop = -e - 1;
				findFunctions(p, stop);
				// "skip" and "exit" never look for their semicolon.
				if (com !== 'skip' && com !== 'exit') {
					p = stop;
					problem("Expecting semicolon after '" + com + "'");
				}
				p = stop;
			}
		}
	}
	if (depth !== 0) {
		res.problems.push({ message: 'Unbalanced braces (' + depth + ' left open)', row: lines.length, col: 1, line: lines[lines.length - 1] ?? '' });
	}
	return res;
}
