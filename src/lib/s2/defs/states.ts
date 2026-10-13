import { Int } from '../blitz';
import type { Vfs } from '../io/Vfs';
import { InfStream, constName } from './_helpers';
import * as C from './constants';
import { DefinitionError } from './objects';

/**
 * State definitions (sys/states.inf). Ported from load_states() in
 * includes/load_states.bb; field names follow the Dstate_* arrays.
 */

export const Cstate_count = 70;

export interface StateDef {
	id: number;
	/** Scripting constant names set with "const=" (leading # stripped). */
	consts: string[];
	name: string;
	/** Frame in the shared state icon sheet (gfx_states) */
	frame: number;
	/**
	 * Path of an own icon image when "icon=" named one that load_res() can
	 * find, "" when Dstate_icon is the shared sheet gfx_states.
	 */
	icon: string;
	/** Script lines joined with SEP_LINE (not pre-parsed by the original). */
	script: string;
	/** Dstate_a: state needs per-frame handling */
	active: number;
}

export interface StateDefs {
	byId: Map<number, StateDef>;
	/** Index 0 of the Dstate_* arrays: receives properties that appear before the first "id=". */
	zero: StateDef;
	/** state_count: number of "id=" lines read */
	count: number;
}

/** The states flagged in Dstate_a at program start. */
const ACTIVE_STATES: readonly number[] = [
	C.Cstate_frostbite,
	C.Cstate_fracture,
	C.Cstate_electroshock,
	C.Cstate_bloodrush,
	C.Cstate_tame,
	C.Cstate_ai_stick,
	C.Cstate_speedmod
];

/** The name table of parse_getstate() in includes/parser_functions.bb. */
const STATE_NAMES: [string[], number][] = [
	[['bleeding'], C.Cstate_bleeding],
	[['intoxication'], C.Cstate_intoxication],
	[['pus'], C.Cstate_pus],
	[['fire'], C.Cstate_fire],
	[['eternalfire', 'eternal fire'], C.Cstate_eternalfire],
	[['frostbite'], C.Cstate_frostbite],
	[['fracture'], C.Cstate_fracture],
	[['electroshock'], C.Cstate_electroshock],
	[['bloodrush'], C.Cstate_bloodrush],
	[['dizzy'], C.Cstate_dizzy],
	[['wet'], C.Cstate_wet],
	[['fuddle'], C.Cstate_fuddle],
	[['healing'], C.Cstate_healing],
	[['invulnerability', 'invulnerable'], C.Cstate_invulnerability],
	[['tame'], C.Cstate_tame],
	[['action'], C.Cstate_action],
	[['flare'], C.Cstate_flare],
	[['smoke'], C.Cstate_smoke],
	[['light'], C.Cstate_light],
	[['particles'], C.Cstate_particles],
	[['physics'], C.Cstate_phy],
	[['buildplace'], C.Cstate_buildplace],
	[['link'], C.Cstate_link],
	[['ai_stick'], C.Cstate_ai_stick],
	[['speed', 'speedmod'], C.Cstate_speedmod],
	[['ghost'], C.Cstate_ghost]
];

/**
 * parse_getstate(txt$): state id for a state name or for the decimal text
 * of one of the listed ids (case sensitive, exact match). Returns undefined
 * where the original calls parse_error("state",txt$) and returns 0.
 */
export function parse_getstate(txt: string): number | undefined {
	for (const [names, id] of STATE_NAMES) {
		if (names.includes(txt) || txt === String(id)) return id;
	}
	return undefined;
}

/**
 * Whether load_res(path$,...) gets as far as loading a file: the path
 * exists, or a ".inf" resource link stands in for it (name up to the first
 * dot). A file that exists but cannot be decoded is a RuntimeError in the
 * original, never a 0 result.
 */
function resFound(vfs: Vfs, path: string): boolean {
	if (vfs.exists(path)) return true;
	const dot = path.indexOf('.');
	if (dot < 0) return false;
	return vfs.exists(path.substring(0, dot) + '.inf');
}

export async function loadStates(vfs: Vfs): Promise<StateDefs> {
	const defs: StateDefs = { byId: new Map(), zero: blankStateDef(0), count: 0 };
	let d = defs.zero;

	if (!vfs.exists('sys\\states.inf')) throw new DefinitionError('Unable to read sys\\states.inf');
	const stream = await InfStream.open(vfs, 'sys\\states.inf');
	for (let p = stream.next(); p; p = stream.next()) {
		const { key, val } = p;
		switch (key) {
			case 'id': {
				defs.count++;
				const i = Int(val);
				if (i < 1 || i > Cstate_count) {
					throw new DefinitionError(`ID between 1 and ${Cstate_count} expected!`);
				}
				d = defs.byId.get(i) ?? blankStateDef(i);
				defs.byId.set(i, d);
				d.icon = ''; // Dstate_icon(i)=gfx_states
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
				if (d.frame < 0 || d.frame > 30) {
					throw new DefinitionError('Frame between 0 and 30 expected!');
				}
				break;
			case 'icon':
				// Dstate_icon(i)=load_res(val$,Cres_image,0); success resets the frame
				if (resFound(vfs, val)) {
					d.icon = val;
					d.frame = 0;
				} else {
					d.icon = '';
				}
				break;
			case 'script':
				if (d.id < 29) {
					throw new DefinitionError(
						'States from 1-29 are fixed states which cannot have a script'
					);
				}
				if (val === 'start') d.script += stream.readBlock('script=end');
				break;
			default:
				throw new DefinitionError(`Invalid STATE Property '${key}'`);
		}
	}
	return defs;
}

function blankStateDef(id: number): StateDef {
	return {
		id,
		consts: [],
		name: '',
		frame: 0,
		icon: '',
		script: '',
		active: ACTIVE_STATES.includes(id) ? 1 : 0
	};
}
