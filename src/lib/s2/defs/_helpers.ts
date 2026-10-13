import { Int, SEP_LINE, Trim, split, trimspace } from '../blitz';
import { readLines, type Vfs } from '../io/Vfs';
import { DefinitionError } from './objects';

/**
 * Helpers shared by the definition loaders: the line-reading idiom every
 * load_*.bb repeats, and the small functions those loaders call
 * (const_set, defvar_set, ha_typeexists, Blitz float-to-string).
 */

/**
 * The ReadDir/NextFile filter used by the loaders:
 * Left(file$,Len(prefix))=prefix And Lower(Right(file$,4))=".inf".
 * The prefix comparison is case sensitive, the extension is not.
 *
 * Files come back in the order NextFile yields them on NTFS, which is by
 * upper-cased character code ("units.inf" before "units_b.inf"). The order
 * matters: the current id carries over from one file to the next.
 */
export function sysFiles(vfs: Vfs, prefix: string): string[] {
	return vfs
		.list('sys')
		.filter((f) => f.startsWith(prefix) && f.toLowerCase().endsWith('.inf'))
		.sort((a, b) => {
			const x = a.toUpperCase();
			const y = b.toUpperCase();
			return x < y ? -1 : x > y ? 1 : 0;
		});
}

export interface Property {
	/** var$ = Trim(Left(in$,equal-1)) */
	key: string;
	/** Mid(in$,equal+1,-1), untrimmed */
	raw: string;
	/** trimspace(raw): what most loaders use as val$ */
	val: string;
}

/** A file being read with ReadLine; script/description blocks consume lines from the same stream. */
export class InfStream {
	private ln = 0;

	constructor(readonly lines: string[]) {}

	static async open(vfs: Vfs, path: string): Promise<InfStream> {
		return new InfStream(await readLines(vfs, path));
	}

	eof(): boolean {
		return this.ln >= this.lines.length;
	}

	readLine(): string {
		return this.ln < this.lines.length ? this.lines[this.ln++] : '';
	}

	/** Next "key=value" line; lines starting with # and lines without = are skipped. */
	next(): Property | undefined {
		while (!this.eof()) {
			const line = this.readLine();
			const equal = line.startsWith('#') ? -1 : line.indexOf('=');
			if (equal < 0) continue;
			const raw = line.substring(equal + 1);
			return { key: Trim(line.substring(0, equal)), raw, val: trimspace(raw) };
		}
		return undefined;
	}

	/**
	 * The "script=start ... script=end" loop: every line up to the exact
	 * terminator line (or Eof) is trimmed and terminated with SEP_LINE.
	 */
	readBlock(terminator: string): string {
		let out = '';
		while (!this.eof()) {
			const val = this.readLine();
			if (val === terminator) break;
			out += Trim(val) + SEP_LINE;
		}
		return out;
	}
}

/**
 * const_set(n$,v) from parser_vars.bb: the name with one leading # removed,
 * or undefined when the original ignores the call (empty name).
 */
export function constName(n: string): string | undefined {
	if (n.startsWith('#')) n = n.substring(1);
	return n !== '' ? n : undefined;
}

/** Tdefvar, as created by defvar_set() in parser_vars.bb. */
export interface DefVar {
	key: string;
	descr: string;
	defaultval: string;
	isglobal: number;
}

/** split(val$) followed by defvar_set(): parses a raw "var=" value. */
export function parseDefVar(raw: string): DefVar {
	const s = split(raw);
	if (s[0] === '') throw new DefinitionError('Invalid Def VAR definition (missing var name)');
	if (s[1] === '') s[1] = s[0];
	return { key: s[0], descr: s[1], defaultval: s[2], isglobal: Int(s[3]) };
}

/** Tdefparam */
export interface DefParam {
	key: string;
	value: string;
}

/** split(val$) and the Tdefparam fields taken from it. */
export function parseDefParam(raw: string): DefParam {
	const s = split(raw);
	return { key: s[0], value: s[1] };
}

/** The part of a definition table ha_typeexists() looks at (the D*_name$ array). */
export interface TypeTable {
	byId: Map<number, { name: string }>;
}

/**
 * ha_typeexists(class,typ) from handle_all.bb for one class: the id is in
 * 1..limit and its definition has a non-empty name.
 */
export function typeExists(defs: TypeTable, limit: number, typ: number): boolean {
	if (typ < 1 || typ > limit) return false;
	const d = defs.byId.get(typ);
	return d !== undefined && d.name !== '';
}

/** Blitz3D float-to-string conversion; see src/lib/s2/blitz/num.ts. */
export { ftoa } from '../blitz';
