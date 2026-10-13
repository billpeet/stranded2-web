import { Float, Int, Trim, split } from '../blitz';
import type { Vfs } from '../io/Vfs';
import { InfStream, constName, parseDefParam, parseDefVar, sysFiles, type DefParam } from './_helpers';
import { get_material } from './constants';
import { DefinitionError } from './objects';
import { parse_getstate } from './states';

/**
 * Item definitions (sys/items*.inf). Ported from load_items() in
 * includes/load_items.bb; field names follow the Ditem_* arrays.
 */

/** Citem_count_limit from includes/load_game.bb */
export const Citem_count_limit = 10000;

export interface ItemDef {
	id: number;
	/** Scripting constant names set with "const=" (leading # stripped). */
	consts: string[];
	name: string;
	icon: string;
	/** Loaded lazily by load_item_model(); "" falls back to game_defaultitemmodel. */
	model: string;
	size: [number, number, number];
	color: [number, number, number];
	fx: number;
	autofade: number;
	alpha: number;
	shininess: number;
	blend: number;
	col: number;
	mat: number;
	/** Weight in grams ("weight=" or "w=") */
	weight: number;
	health: number;
	healthchange: number;
	/** Ditem_gt: declared, its "gt=" property is commented out in the original */
	gt: number;
	/** [mode, x, y, z]; mode 0 = random position, 1 = fixed offsets */
	state: [number, number, number, number];
	radius: number;
	behaviour: string;
	/** Weapon/ammo damage, kept as text like the original */
	damage: string;
	/** Weapon speed or range ("speed=" or "range=") */
	speed: number;
	drag: number;
	rate: number;
	wstate: number;
	/** Script lines joined with SEP_LINE. Ditem_scripto is a copy; Ditem_scriptk is preparse_string() of it. */
	script: string;
	info: string;
	descr: string;
	ined: number;
	group: string;
	params: DefParam[];
	/** Raw "var=" declarations; see parseDefVar. */
	vars: string[];
}

export interface ItemDefs {
	byId: Map<number, ItemDef>;
	/**
	 * Index 0 of the Ditem_* arrays ("0 Values": speed 1, damage 1); also
	 * receives properties that appear before the first "id=".
	 */
	zero: ItemDef;
	/** item_count: number of "id=" lines read */
	count: number;
	/** item_count_e: named items with editor<>0 */
	countEditor: number;
	/** Citem_count the definitions were loaded with */
	limit: number;
	/** parse_error("state",...) texts raised by "weaponstate=" */
	warnings: string[];
}

export async function loadItems(vfs: Vfs, Citem_count = 255): Promise<ItemDefs> {
	const zero = blankItemDef(0);
	zero.speed = 1;
	zero.damage = '1';
	const defs: ItemDefs = {
		byId: new Map(),
		zero,
		count: 0,
		countEditor: 0,
		limit: Citem_count,
		warnings: []
	};
	let d = defs.zero;

	for (const file of sysFiles(vfs, 'items')) {
		const stream = await InfStream.open(vfs, `sys\\${file}`);
		for (let p = stream.next(); p; p = stream.next()) {
			const { key, val } = p;
			switch (key) {
				case 'id': {
					defs.count++;
					const i = Int(val);
					if (i < 1 || i > Citem_count) {
						throw new DefinitionError(`ID between 1 and ${Citem_count} expected!`);
					}
					const prev = defs.byId.get(i);
					if (prev && prev.name !== '') {
						throw new DefinitionError(`Item with ID ${i} is already defined as '${prev.name}'!`);
					}
					d = prev ?? blankItemDef(i);
					defs.byId.set(i, d);
					d.size = [1, 1, 1];
					d.color = [255, 255, 255];
					d.alpha = 1;
					d.autofade = 225;
					d.health = 15;
					d.radius = 0;
					d.speed = 10;
					d.drag = 0;
					d.damage = '1';
					d.rate = 500;
					d.healthchange = -Math.fround(d.health / 2);
					d.ined = 1;
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
				case 'icon':
					d.icon = val; // load_res(Ditem_icon$(i),Cres_image,0)
					break;
				case 'model':
					d.model = val;
					break;
				case 'x':
					d.size[0] = Float(val);
					break;
				case 'y':
					d.size[1] = Float(val);
					break;
				case 'z':
					d.size[2] = Float(val);
					break;
				case 'scale':
					d.size = [Float(val), Float(val), Float(val)];
					break;
				case 'r':
					d.color[0] = Int(val);
					break;
				case 'g':
					d.color[1] = Int(val);
					break;
				case 'b':
					d.color[2] = Int(val);
					break;
				case 'color': {
					const s = split(val, ',', 2);
					d.color = [Int(Trim(s[0])), Int(Trim(s[1])), Int(Trim(s[2]))];
					break;
				}
				case 'fx':
					d.fx = Int(val);
					break;
				case 'autofade':
					d.autofade = Int(val);
					break;
				case 'alpha':
					d.alpha = Float(val);
					break;
				case 'shine':
					d.shininess = Float(val);
					break;
				case 'blend':
					d.blend = Int(val);
					break;
				case 'col':
					d.col = Int(val);
					break;
				case 'mat':
					d.mat = get_material(val);
					break;
				case 'weight':
				case 'w':
					d.weight = Int(val);
					break;
				case 'health':
					d.health = Float(val);
					d.healthchange = -Math.fround(d.health / 2);
					break;
				case 'healthchange':
					d.healthchange = Float(val);
					break;
				case 'state':
					if (val === 'random') {
						d.state[0] = 0;
					} else {
						const s = split(val, ',', 2);
						d.state = [1, Float(Trim(s[0])), Float(Trim(s[1])), Float(Trim(s[2]))];
					}
					break;
				case 'radius':
					d.radius = Float(val);
					break;
				case 'behaviour':
					d.behaviour = val;
					break;
				case 'damage':
					d.damage = val;
					break;
				case 'speed':
				case 'range':
					d.speed = Float(val);
					break;
				case 'drag':
					d.drag = Float(val);
					break;
				case 'rate':
					d.rate = Int(val);
					break;
				case 'weaponstate':
					if (Int(val) === 0) {
						const state = parse_getstate(val);
						if (state === undefined) defs.warnings.push(`state: ${val}`); // parse_error("state",val$)
						d.wstate = state ?? 0;
					} else {
						d.wstate = Int(val);
					}
					break;
				case 'script':
					if (val === 'start') d.script += stream.readBlock('script=end');
					break;
				case 'info':
					d.info = val;
					break;
				case 'description':
					if (val === 'start') d.descr += stream.readBlock('description=end');
					break;
				case 'editor':
					d.ined = Int(val);
					break;
				case 'param':
					d.params.push(parseDefParam(val));
					break;
				case 'var':
					parseDefVar(val); // defvar_set(Cclass_item,i): raises its error here
					d.vars.push(val);
					break;
				case 'group':
					d.group = val; // group_set$(Cclass_item,val$)
					break;
				default:
					throw new DefinitionError(`Invalid ITEM Property '${key}'`);
			}
		}
	}

	for (const it of [defs.zero, ...defs.byId.values()]) {
		if (it.name !== '' && it.ined !== 0) defs.countEditor++;
	}
	return defs;
}

/** A Ditem_* slot as Dim leaves it; "id=" then sets the documented defaults. */
function blankItemDef(id: number): ItemDef {
	return {
		id,
		consts: [],
		name: '',
		icon: '',
		model: '',
		size: [0, 0, 0],
		color: [0, 0, 0],
		fx: 0,
		autofade: 0,
		alpha: 0,
		shininess: 0,
		blend: 0,
		col: 0,
		mat: 0,
		weight: 0,
		health: 0,
		healthchange: 0,
		gt: 0,
		state: [0, 0, 0, 0],
		radius: 0,
		behaviour: '',
		damage: '',
		speed: 0,
		drag: 0,
		rate: 0,
		wstate: 0,
		script: '',
		info: '',
		descr: '',
		ined: 0,
		group: '',
		params: [],
		vars: []
	};
}
