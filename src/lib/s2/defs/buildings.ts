import { Int, Trim, split } from '../blitz';
import type { Vfs } from '../io/Vfs';
import { InfStream, constName, sysFiles, typeExists } from './_helpers';
import type { ItemDefs } from './items';
import { DefinitionError, type ObjectDefs } from './objects';
import type { UnitDefs } from './units';

/**
 * Buildings (sys/buildings*.inf). Ported from load_buildings() in
 * includes/load_buildings.bb. The original keeps one flat Tbui list in
 * which every aspect of a building is its own record, tied together by the
 * building id.
 */

export const Cbui_req = 0;
export const Cbui_buildspace = 1;
export const Cbui_head = 2;
export const Cbui_atobject = 3;
export const Cbui_buildingsite = 4;

/** "buildspace=" values, in the order of their numeric codes (Tbui\typ of a mode 1 record). */
export const BUILDSPACES: readonly string[] = [
	'land',
	'land and water',
	'water',
	'shore',
	'hill',
	'shallow water',
	'at object'
];

/** Type Tbui */
export interface Tbui {
	/** Building id ("id=") */
	id: number;
	/** 0 = required item, 1 = buildspace, 2 = head, 3 = build-at-object id, 4 = building site object id */
	mode: number;
	/**
	 * mode 0: item type; mode 1: buildspace code; mode 2: object type, or
	 * minus the unit type for "unitid="; mode 3 and 4: object type
	 */
	typ: number;
	/** mode 0: item count */
	count: number;
	/** mode 2: script lines joined with SEP_LINE */
	script: string;
	/** Set by "group=" on whichever record was touched last (see loadBuildings) */
	group: string;
}

/** One building as a view onto its Tbui records (same objects as in `list`). */
export interface Building {
	id: number;
	head: Tbui;
	req: Tbui[];
	/** The mode 1 record, if "buildspace=" was given; the game treats a missing one as 0 (land). */
	buildspace?: Tbui;
	atobject: Tbui[];
	buildingsite?: Tbui;
	/** Scripting constant names set with "const=" (leading # stripped); value is `id`. */
	consts: string[];
}

export interface BuildingDefs {
	/** Every Tbui in creation order, as "For Tbui.Tbui=Each Tbui" walks them. */
	list: Tbui[];
	/** Buildings in load order, grouped by id. */
	buildings: Building[];
	/** "const=" lines read before the first "id=" (value 0). */
	zeroConsts: string[];
}

export interface BuildingDeps {
	objects: ObjectDefs;
	units: UnitDefs;
	items: ItemDefs;
	/** Cobject_count from game.inf (ha_typeexists rejects object ids above it) */
	Cobject_count: number;
}

function newTbui(id: number, mode: number): Tbui {
	return { id, mode, typ: 0, count: 0, script: '', group: '' };
}

export async function loadBuildings(vfs: Vfs, deps: BuildingDeps): Promise<BuildingDefs> {
	const list: Tbui[] = [];
	const consts = new Map<number, string[]>();
	let i = 0;
	// `set` belongs to the whole function: "buildspace" resets it, "buildingsite" does not.
	let set = 0;

	// The Tbui handle of load_buildings(): the record created last, or the one a
	// search loop stopped on; Null after a search that found nothing. "group="
	// and the error texts read through it, so they follow the original's quirk.
	let Tbui: Tbui | undefined;
	const cur = (): Tbui => {
		// Null handle: the original dies with a memory access violation here
		if (!Tbui) throw new DefinitionError('Memory access violation');
		return Tbui;
	};
	const find = (mode: number) => list.find((t) => t.mode === mode && t.id === i);
	const create = (mode: number): Tbui => {
		const t = newTbui(i, mode);
		list.push(t);
		return t;
	};
	const objectExists = (typ: number) => typeExists(deps.objects, deps.Cobject_count, typ);

	for (const file of sysFiles(vfs, 'buildings')) {
		const stream = await InfStream.open(vfs, `sys\\${file}`);
		for (let p = stream.next(); p; p = stream.next()) {
			const { key, val } = p;
			switch (key) {
				case 'name':
					break;
				case 'id':
					i = Int(val);
					if (find(Cbui_head)) {
						throw new DefinitionError(`Building with ID ${i} is already defined!`);
					}
					Tbui = create(Cbui_head);
					break;
				case 'const': {
					const n = constName(val);
					if (n !== undefined) {
						if (!consts.has(i)) consts.set(i, []);
						consts.get(i)!.push(n);
					}
					break;
				}
				case 'objectid':
					if (objectExists(Int(val))) {
						Tbui = find(Cbui_head);
						if (Tbui) Tbui.typ = Int(val);
					} else {
						throw new DefinitionError(`Invalid OBJECT ID for BUILDING (${cur().typ})`);
					}
					break;
				case 'unitid':
					if (typeExists(deps.units, deps.units.limit, Int(val))) {
						Tbui = find(Cbui_head);
						if (Tbui) Tbui.typ = -Int(val);
					} else {
						throw new DefinitionError(`Invalid UNIT ID for BUILDING (${cur().typ})`);
					}
					break;
				case 'buildspace': {
					set = 0;
					const typ = BUILDSPACES.indexOf(val);
					if (typ < 0) throw new DefinitionError(`Invalid BUILDSPACE for BUILDING '${val}'`);
					Tbui = find(Cbui_buildspace);
					if (Tbui) {
						Tbui.typ = typ;
						set = 1;
					}
					if (set === 0) {
						Tbui = create(Cbui_buildspace);
						Tbui.typ = typ;
					}
					break;
				}
				case 'buildingsite':
					if (objectExists(Int(val))) {
						Tbui = find(Cbui_buildingsite);
						if (Tbui) {
							Tbui.typ = Int(val);
							set = 1;
						}
						if (set === 0) {
							Tbui = create(Cbui_buildingsite);
							Tbui.typ = Int(val);
						}
					} else {
						throw new DefinitionError(
							`Invalid OBJECT ID for BUILDING buildplace (${cur().typ})`
						);
					}
					break;
				case 'req': {
					Tbui = create(Cbui_req);
					const s = split(val, ',', 1);
					Tbui.typ = Int(Trim(s[0]));
					if (!typeExists(deps.items, deps.items.limit, Tbui.typ)) {
						throw new DefinitionError(`Invalid REQ ITEM ID for BUILDING (${Tbui.typ})`);
					}
					s[1] = Trim(s[1]);
					if (Int(s[1]) <= 0) s[1] = '1';
					Tbui.count = Int(s[1]);
					break;
				}
				case 'atobject':
					if (objectExists(Int(val))) {
						Tbui = create(Cbui_atobject);
						Tbui.typ = Int(val);
					} else {
						throw new DefinitionError(`Invalid AT OBJECT ID for BUILDING (${cur().typ})`);
					}
					break;
				case 'script':
					if (val === 'start') {
						// Without a head for the current id nothing is consumed and
						// the script lines get parsed as properties.
						Tbui = find(Cbui_head);
						if (Tbui) Tbui.script += stream.readBlock('script=end');
					}
					break;
				case 'group':
					cur().group = val; // group_set$(Cclass_unit,val$)
					break;
				default:
					throw new DefinitionError(`Invalid BUILDING Property '${key}'`);
			}
		}
	}

	const buildings: Building[] = [];
	const byId = new Map<number, Building>();
	for (const t of list) {
		if (t.mode !== Cbui_head) continue;
		const b: Building = { id: t.id, head: t, req: [], atobject: [], consts: consts.get(t.id) ?? [] };
		buildings.push(b);
		byId.set(t.id, b);
	}
	for (const t of list) {
		const b = byId.get(t.id);
		if (!b) continue;
		if (t.mode === Cbui_req) b.req.push(t);
		else if (t.mode === Cbui_atobject) b.atobject.push(t);
		else if (t.mode === Cbui_buildspace) b.buildspace ??= t;
		else if (t.mode === Cbui_buildingsite) b.buildingsite ??= t;
	}
	return { list, buildings, zeroConsts: byId.has(0) ? [] : (consts.get(0) ?? []) };
}
