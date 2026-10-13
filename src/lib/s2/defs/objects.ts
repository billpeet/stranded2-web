import { Float, Int, SEP_LINE, Trim, split, trimspace } from '../blitz';
import { readLines, type Vfs } from '../io/Vfs';
import { constName, parseDefVar } from './_helpers';

/**
 * Object definitions (sys/objects*.inf). Ported from load_objects() in
 * includes/load_objects.bb; field names follow the Dobject_* arrays.
 */

export const Cmat: Record<string, number> = {
	none: 0,
	wood: 1,
	stone: 2,
	dirt: 3,
	dust: 4,
	leaf: 5,
	metal: 6,
	flesh: 7,
	water: 8,
	lava: 9,
	fruit: 10,
	glass: 11
};

/** get_material() from includes/load_materials.bb */
export function getMaterial(name: string): number {
	name = name.toLowerCase();
	return name in Cmat ? Cmat[name] : Int(name);
}

export interface FindDef {
	typ: number;
	ratio: number;
	max: number;
	min: number;
	reqtyp: number;
}

export interface ObjectDef {
	id: number;
	/** Scripting constant names set with "const=" (leading # stripped; an empty name is ignored, as const_set does). */
	consts: string[];
	name: string;
	icon: string;
	model: string;
	size: [number, number, number];
	color: [number, number, number];
	fx: number;
	autofade: number;
	alpha: number;
	shininess: number;
	detailtex: string;
	/** 0 none, 1 normal, 2 climbable, 3 wall */
	col: number;
	mat: number;
	health: number;
	healthchange: number;
	swayspeed: number;
	swaypower: number;
	maxweight: number;
	/** [mode, x, y, z]; mode 0 = random position, 1 = fixed offsets */
	state: [number, number, number, number];
	searchratio: number;
	active: number;
	behaviour: string;
	/** "item,rate,xzRange,yRange,yOffset,limit,count" as rebuilt by the original, or "" */
	spawn: string;
	/** Script lines joined with SEP_LINE (each line trimmed and terminated). */
	script: string;
	/** 0 none, 1 align to water, 2 align pitch to ground */
	align: number;
	descr: string;
	ined: number;
	growtime: number;
	group: string;
	finds: FindDef[];
	params: { key: string; value: string }[];
	/** Raw "var=" declarations; interpreted by the script variable system. */
	vars: string[];
}

export interface ObjectDefs {
	byId: Map<number, ObjectDef>;
	/** Array slot 0: receives properties that appear before the first id=. */
	zero: ObjectDef;
	/** object_count: number of "id=" lines read */
	count: number;
	/** object_count_e: named objects with editor<>0 */
	countEditor: number;
	/** Cobject_count the definitions were loaded with (game.inf "limit_objects", 255 by default) */
	limit: number;
	buildplaceId: number;
	buildplaceWaterId: number;
}

/** Cobject_count_limit from includes/load_game.bb */
export const Cobject_count_limit = 5000;

export class DefinitionError extends Error {}

/**
 * load_objects(). `Cobject_count` is the id limit: the original takes it from
 * game.inf ("limit_objects", default 255). The default here stays at the
 * hard upper limit so that callers without game.inf accept every id.
 */
export async function loadObjects(vfs: Vfs, Cobject_count = Cobject_count_limit): Promise<ObjectDefs> {
	const defs: ObjectDefs = {
		byId: new Map(),
		zero: newObjectDef(0),
		count: 0,
		countEditor: 0,
		limit: Cobject_count,
		buildplaceId: 0,
		buildplaceWaterId: 0
	};
	// Properties before the first id= land in array slot 0, and the current id
	// carries over from one file to the next, as in the original.
	let d: ObjectDef = defs.zero;

	for (const file of vfs.list('sys')) {
		if (!(file.startsWith('objects') && file.toLowerCase().endsWith('.inf'))) continue;
		const lines = await readLines(vfs, `sys\\${file}`);
		for (let ln = 0; ln < lines.length; ln++) {
			const line = lines[ln];
			const equal = line.startsWith('#') ? -1 : line.indexOf('=');
			if (equal < 0) continue;
			const key = Trim(line.substring(0, equal));
			let val = trimspace(line.substring(equal + 1));

			if (key === 'id') {
				const i = Int(val);
				if (i < 1 || i > Cobject_count) {
					throw new DefinitionError(`ID between 1 and ${Cobject_count} expected!`);
				}
				const prev = defs.byId.get(i);
				if (prev && prev.name !== '') {
					throw new DefinitionError(`Object with ID ${i} is already defined as '${prev.name}'!`);
				}
				if (prev) {
					// Re-declared while still unnamed: only the defaults the original
					// assigns on id= are reset; every other field keeps its value.
					d = prev;
					d.size = [1, 1, 1];
					d.color = [255, 255, 255];
					d.alpha = 1;
					d.autofade = 500;
					d.swaypower = 1;
					d.health = 500;
					d.col = 1;
					d.searchratio = 30;
					d.maxweight = 100000;
					d.ined = 1;
					d.growtime = 10;
				} else {
					d = newObjectDef(i);
					defs.byId.set(i, d);
				}
				defs.count++;
				continue;
			}

			switch (key) {
				case 'const': {
					// const_set(val$,i): one leading # is dropped, an empty name is ignored
					const n = constName(val);
					if (n !== undefined) d.consts.push(n);
					break;
				}
				case 'name':
					d.name = val;
					break;
				case 'icon':
					d.icon = val;
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
				case 'detailtex':
					d.detailtex = Trim(val);
					break;
				case 'col':
					d.col = Int(val);
					break;
				case 'mat':
					d.mat = getMaterial(val);
					break;
				case 'health':
					d.health = Float(val);
					d.healthchange = Math.fround(d.health / 10);
					break;
				case 'healthchange':
					d.healthchange = Float(val);
					break;
				case 'swayspeed':
					d.swayspeed = Float(val);
					d.active = 1;
					break;
				case 'swaypower':
					d.swaypower = Float(val);
					d.active = 1;
					break;
				case 'maxweight':
					d.maxweight = Int(val);
					break;
				case 'state':
					if (val === 'random') {
						d.state[0] = 0;
					} else {
						const s = split(val, ',', 2);
						d.state = [1, Float(Trim(s[0])), Float(Trim(s[1])), Float(Trim(s[2]))];
					}
					break;
				case 'behaviour':
					d.behaviour = val;
					switch (val) {
						case 'buildingsite':
							defs.buildplaceId = d.id;
							break;
						case 'buildingsite_water':
							defs.buildplaceWaterId = d.id;
							d.align = 1;
							break;
						case 'aligntowater':
							d.align = 1;
							break;
						case 'fountain':
						case 'closekill':
						case 'closetrigger':
							d.active = 1;
							break;
						case 'waterpipe_empty':
						case 'waterpipe_full':
							d.align = 2;
							break;
					}
					break;
				case 'script':
					if (val === 'start') {
						while (++ln < lines.length) {
							val = lines[ln];
							if (val === 'script=end') break;
							d.script += Trim(val) + SEP_LINE;
						}
					}
					break;
				case 'findratio':
					d.searchratio = Float(Trim(val));
					break;
				case 'find': {
					const s = split(val, ',', 4);
					const f: FindDef = {
						typ: Int(Trim(s[0])),
						ratio: Int(Trim(s[1])),
						max: Int(Trim(s[2])),
						min: Int(Trim(s[3])),
						reqtyp: Int(Trim(s[4]))
					};
					if (f.ratio <= 0) f.ratio = 1;
					if (f.max <= 1) f.max = 1;
					if (f.min <= 1) f.min = 1;
					if (f.min >= f.max) f.min = f.max;
					d.finds.push(f);
					break;
				}
				case 'spawn': {
					const s = split(val);
					const item = Int(s[0]);
					let rate = Int(s[1]);
					if (rate < 1) rate = 1;
					const xzr = Float(s[2]);
					const yr = Float(s[3]);
					const yo = Float(s[4]);
					let limit = Int(s[5]);
					if (limit < 1) limit = 3;
					let count = Int(s[6]);
					if (count < 0) count = 1;
					// The original stores this as a string built with Blitz float formatting;
					// consumers re-parse it, so plain JS number formatting is equivalent.
					d.spawn = `${item},${rate},${xzr},${yr},${yo},${limit},${count}`;
					break;
				}
				case 'description':
					if (val === 'start') {
						while (++ln < lines.length) {
							val = lines[ln];
							if (val === 'description=end') break;
							d.descr += Trim(val) + SEP_LINE;
						}
					}
					break;
				case 'editor':
					d.ined = Int(val);
					break;
				case 'param': {
					const s = split(val);
					d.params.push({ key: s[0], value: s[1] });
					break;
				}
				case 'growtime':
					d.growtime = Int(val);
					break;
				case 'var':
					// split(val$) : defvar_set(Cclass_object,i) -> RuntimeError on a missing name
					parseDefVar(val);
					d.vars.push(val);
					break;
				case 'group':
					d.group = val;
					break;
				default:
					throw new DefinitionError(`Invalid OBJECT Property '${key}'`);
			}
		}
	}
	//Editor Count
	for (const o of defs.byId.values()) {
		if (o.name !== '' && o.ined !== 0) defs.countEditor++;
	}
	return defs;
}

function newObjectDef(id: number): ObjectDef {
	return {
		id,
		consts: [],
		name: '',
		icon: '',
		model: '',
		size: [1, 1, 1],
		color: [255, 255, 255],
		fx: 0,
		autofade: 500,
		alpha: 1,
		shininess: 0,
		detailtex: '',
		col: 1,
		mat: 0,
		health: 500,
		healthchange: 0,
		swayspeed: 0,
		swaypower: 1,
		maxweight: 100000,
		state: [0, 0, 0, 0],
		searchratio: 30,
		active: 0,
		behaviour: '',
		spawn: '',
		script: '',
		align: 0,
		descr: '',
		ined: 1,
		growtime: 10,
		group: '',
		finds: [],
		params: [],
		vars: []
	};
}
