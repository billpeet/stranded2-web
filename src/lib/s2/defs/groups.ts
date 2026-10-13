import { split } from '../blitz';
import type { Vfs } from '../io/Vfs';
import { InfStream } from './_helpers';
import { Cclass_building, Cclass_info, Cclass_item, Cclass_object, Cclass_unit } from './constants';
import { DefinitionError } from './objects';

/**
 * Editor/build-menu groups (sys/groups.inf). Ported from load_groups(),
 * group_add() and group_set$() in includes/load_groups.bb.
 */

/** Type Tgroup (its `count` field is filled at run time, not by the loader). */
export interface Tgroup {
	/** Cclass_object, Cclass_unit, Cclass_item, Cclass_info or Cclass_building */
	class: number;
	group: string;
	name: string;
}

const GROUP_CLASSES: Record<string, number> = {
	object: Cclass_object,
	unit: Cclass_unit,
	item: Cclass_item,
	info: Cclass_info,
	building: Cclass_building
};

/** group_add(class,group$,name$) */
export function group_add(groups: Tgroup[], cls: number, group: string, name: string): void {
	if (name === '') name = group;
	if (group === '') throw new DefinitionError('Missing Group Name');
	for (const g of groups) {
		if (g.class === cls && g.group === group) {
			throw new DefinitionError(`Group '${group}' has already been defined`);
		}
	}
	groups.push({ class: cls, group, name });
}

/**
 * group_set$(class,group$): returns the group text unchanged; the check
 * against the defined groups is commented out in the original.
 */
export function group_set(_cls: number, group: string): string {
	return group;
}

/** Groups in definition order; an absent sys\groups.inf gives none. */
export async function loadGroups(vfs: Vfs): Promise<Tgroup[]> {
	const groups: Tgroup[] = [];
	if (!vfs.exists('sys\\groups.inf')) return groups;
	const stream = await InfStream.open(vfs, 'sys\\groups.inf');
	for (let p = stream.next(); p; p = stream.next()) {
		const s = split(p.val, ',');
		if (!Object.hasOwn(GROUP_CLASSES, p.key)) {
			throw new DefinitionError(
				`Invalid GROUP Property '${p.key}' - only object,unit,item,info and building are allowed`
			);
		}
		group_add(groups, GROUP_CLASSES[p.key], s[0], s[1]);
	}
	return groups;
}
