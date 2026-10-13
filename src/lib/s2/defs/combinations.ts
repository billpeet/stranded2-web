import { Int, Trim, split } from '../blitz';
import type { Vfs } from '../io/Vfs';
import { InfStream, constName, sysFiles, typeExists } from './_helpers';
import type { ItemDefs } from './items';
import { DefinitionError } from './objects';

/**
 * Combinations (sys/combinations*.inf). Ported from load_combinations() and
 * combinations_similar() in includes/load_combinations.bb. The original
 * keeps one flat Tcom list in which a combination is a head record followed
 * by its req/gen records, all sharing the serial number in `id`.
 */

export const Ccom_req = 0;
export const Ccom_gen = 1;
export const Ccom_head = 2;

/** Type Tcom */
export interface Tcom {
	/** Internal serial number of the combination (1, 2, ... in load order) */
	id: number;
	/** 0 = required item, 1 = generated item, 2 = head */
	mode: number;
	/** Item type (req/gen) */
	typ: number;
	/** Item count (req/gen) */
	count: number;
	/** req only: 1 = item is consumed, 0 = "stay" */
	del: number;
	/** Head only: script lines joined with SEP_LINE */
	script: string;
	/** Head only: alternative name for the generated item */
	genname: string;
	/** Head only: group of combinations with the same requirements; negative = ungrouped */
	gid: number;
	/** Head only: the "id=" text used by scripts (lockcombi etc.) */
	aid: string;
}

/** One combination as a view onto its Tcom records (same objects as in `list`). */
export interface Combination {
	id: number;
	head: Tcom;
	req: Tcom[];
	gen: Tcom[];
	/** Scripting constant names set with "const=" (leading # stripped); value is `id`. */
	consts: string[];
}

export interface CombinationDefs {
	/** Every Tcom in creation order, as "For Tcom.Tcom=Each Tcom" walks them. */
	list: Tcom[];
	/** Combinations in load order, grouped by serial number. */
	combinations: Combination[];
	/** "const=" lines read before the first "combi=start" (value 0). */
	zeroConsts: string[];
}

function newTcom(id: number, mode: number): Tcom {
	return { id, mode, typ: 0, count: 0, del: 0, script: '', genname: '', gid: 0, aid: '' };
}

export async function loadCombinations(vfs: Vfs, items: ItemDefs): Promise<CombinationDefs> {
	const list: Tcom[] = [];
	const consts = new Map<number, string[]>();
	let Tcom_serial = 0;

	const head = () => list.find((t) => t.id === Tcom_serial && t.mode === Ccom_head);

	for (const file of sysFiles(vfs, 'combinations')) {
		const stream = await InfStream.open(vfs, `sys\\${file}`);
		for (let p = stream.next(); p; p = stream.next()) {
			const { key, val } = p;
			switch (key) {
				case 'name':
					break;
				case 'combi':
					if (val === 'start') {
						Tcom_serial++;
						list.push(newTcom(Tcom_serial, Ccom_head));
					} else if (val === 'end') {
						let headc = 0;
						let req = 0;
						let gen = 0;
						for (const t of list) {
							if (t.id !== Tcom_serial) continue;
							if (t.mode === Ccom_req) req++;
							else if (t.mode === Ccom_gen) gen++;
							else if (t.mode === Ccom_head) headc++;
						}
						if (req < 2) {
							throw new DefinitionError(
								"Invalid COMBINATION. Every Combination needs at least 2 'req'-Properties!"
							);
						}
						if (gen < 1) {
							throw new DefinitionError(
								"Invalid COMBINATION. Every Combination needs at least 1 'gen'-Property!"
							);
						}
						if (headc !== 1) {
							throw new DefinitionError(
								"Invalid COMBINATION. A Combination has to be enclosed in 'combi=start' and 'combi=end'"
							);
						}
					} else {
						throw new DefinitionError(
							"Invalid COMBINATION Value for 'combi'-Property. Use either 'start' or 'end' as value!"
						);
					}
					break;
				case 'const': {
					const n = constName(val);
					if (n !== undefined) {
						if (!consts.has(Tcom_serial)) consts.set(Tcom_serial, []);
						consts.get(Tcom_serial)!.push(n);
					}
					break;
				}
				case 'req': {
					const t = newTcom(Tcom_serial, Ccom_req);
					list.push(t);
					const s = split(val, ',', 2);
					t.typ = Int(Trim(s[0]));
					if (!typeExists(items, items.limit, t.typ)) {
						throw new DefinitionError(`Invalid ITEM ID for COMBINATION (${t.typ})`);
					}
					s[1] = Trim(s[1]);
					if (Int(s[1]) <= 0) s[1] = '1';
					t.count = Int(s[1]);
					t.del = Trim(s[2]) === 'stay' ? 0 : 1;
					break;
				}
				case 'gen': {
					const t = newTcom(Tcom_serial, Ccom_gen);
					list.push(t);
					const s = split(val, ',', 1);
					t.typ = Int(Trim(s[0]));
					if (!typeExists(items, items.limit, t.typ)) {
						throw new DefinitionError(`Invalid ITEM ID for COMBINATION (${t.typ})`);
					}
					s[1] = Trim(s[1]);
					if (Int(s[1]) <= 0) s[1] = '1';
					t.count = Int(s[1]);
					break;
				}
				case 'genname': {
					const h = head();
					if (h) h.genname = val;
					break;
				}
				case 'script': {
					// Any value starts the block, and only the first record of the
					// current serial is looked at: if that is not the head, the
					// script lines are not consumed and get parsed as properties.
					const first = list.find((t) => t.id === Tcom_serial);
					if (first && first.mode === Ccom_head) first.script += stream.readBlock('script=end');
					break;
				}
				case 'id': {
					const h = head();
					if (h) h.aid = val;
					break;
				}
				default:
					throw new DefinitionError(`Invalid COMBINATION Property '${key}'`);
			}
		}
	}

	combinations_similar(list);

	const combinations: Combination[] = [];
	const bySerial = new Map<number, Combination>();
	for (const t of list) {
		if (t.mode !== Ccom_head) continue;
		const c: Combination = { id: t.id, head: t, req: [], gen: [], consts: consts.get(t.id) ?? [] };
		combinations.push(c);
		bySerial.set(t.id, c);
	}
	for (const t of list) {
		const c = bySerial.get(t.id);
		if (!c) continue;
		if (t.mode === Ccom_req) c.req.push(t);
		else if (t.mode === Ccom_gen) c.gen.push(t);
	}
	return { list, combinations, zeroConsts: consts.get(0) ?? [] };
}

/**
 * combinations_similar(): gives heads whose requirement lists match the
 * same positive gid (coms_serial numbering), then numbers the rest -1, -2, ...
 */
export function combinations_similar(list: Tcom[]): void {
	let coms_serial = 0;
	const heads = list.filter((t) => t.mode === Ccom_head);
	const reqsOf = (id: number) => list.filter((t) => t.id === id && t.mode === Ccom_req);

	for (const Trcom of heads) {
		if (Trcom.gid !== 0) continue;
		const own = reqsOf(Trcom.id);
		const creq = own.length;

		for (const Tsrcom of heads) {
			if (Tsrcom.id === Trcom.id) continue;
			let tsreq = 0;
			let ssreq = 0;
			for (const Tsccom of reqsOf(Tsrcom.id)) {
				tsreq++;
				for (const Tscccom of own) {
					if (Tscccom.typ === Tsccom.typ) ssreq++;
				}
			}
			if (tsreq === ssreq && creq === tsreq) {
				if (Tsrcom.gid !== 0) {
					Trcom.gid = Tsrcom.gid;
				} else if (Trcom.gid !== 0) {
					Tsrcom.gid = Trcom.gid;
				} else {
					coms_serial++;
					Trcom.gid = coms_serial;
					Tsrcom.gid = coms_serial;
				}
			}
		}
	}

	let negid = -1;
	for (const Trcom of heads) {
		if (Trcom.gid === 0) {
			Trcom.gid = negid;
			negid--;
		}
	}
}
