import { Int } from '../blitz';
import type { Vfs } from '../io/Vfs';
import { InfStream, constName, parseDefVar, sysFiles } from './_helpers';
import { DefinitionError } from './objects';

/**
 * Info definitions (sys/infos*.inf). Ported from load_infos() in
 * includes/load_infos.bb; field names follow the Dinfo_* arrays.
 */

export const Cinfo_count = 100;

export interface InfoDef {
	id: number;
	/** Scripting constant names set with "const=" (leading # stripped). */
	consts: string[];
	name: string;
	/** Icon frame, 0..99 */
	frame: number;
	/** Script lines joined with SEP_LINE. Dinfo_scripto is a copy; Dinfo_scriptk is preparse_string() of it. */
	script: string;
	group: string;
	descr: string;
	/** Raw "var=" declarations; see parseDefVar. */
	vars: string[];
}

export interface InfoDefs {
	byId: Map<number, InfoDef>;
	/** Index 0 of the Dinfo_* arrays: receives properties that appear before the first "id=". */
	zero: InfoDef;
	/** info_count: number of "id=" lines read */
	count: number;
}

export async function loadInfos(vfs: Vfs): Promise<InfoDefs> {
	const defs: InfoDefs = { byId: new Map(), zero: blankInfoDef(0), count: 0 };
	let d = defs.zero;

	for (const file of sysFiles(vfs, 'infos')) {
		const stream = await InfStream.open(vfs, `sys\\${file}`);
		for (let p = stream.next(); p; p = stream.next()) {
			const { key, val } = p;
			switch (key) {
				case 'id': {
					defs.count++;
					const i = Int(val);
					if (i < 1 || i > Cinfo_count) {
						throw new DefinitionError(`ID between 1 and ${Cinfo_count} expected!`);
					}
					// No duplicate check and no defaults: a repeated id keeps what it had.
					d = defs.byId.get(i) ?? blankInfoDef(i);
					defs.byId.set(i, d);
					break;
				}
				case 'const': {
					const n = constName(val);
					if (n !== undefined) d.consts.push(n);
					break;
				}
				case 'name':
					d.name = val;
					break;
				case 'frame':
					d.frame = Int(val);
					if (d.frame < 0 || d.frame > 99) {
						throw new DefinitionError('Frame between 0 and 99 expected!');
					}
					break;
				case 'var':
					parseDefVar(val); // defvar_set(Cclass_info,i): raises its error here
					d.vars.push(val);
					break;
				case 'script':
					if (val === 'start') d.script += stream.readBlock('script=end');
					break;
				case 'group':
					d.group = val; // group_set$(Cclass_info,val$)
					break;
				case 'description':
					if (val === 'start') d.descr += stream.readBlock('description=end');
					break;
				default:
					throw new DefinitionError(`Invalid INFO Property '${key}'`);
			}
		}
	}
	return defs;
}

function blankInfoDef(id: number): InfoDef {
	return { id, consts: [], name: '', frame: 0, script: '', group: '', descr: '', vars: [] };
}
