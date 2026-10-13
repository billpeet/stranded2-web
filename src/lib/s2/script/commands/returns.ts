/**
 * parse_commands(): section RETURN (parser_commands.bb 4334-5174) and section
 * AI (5308-5436).
 *
 * Not in this file (ported with the interpreter core): loop_id, return, int,
 * random, gt, currentclass/cclass/current_class, currentid/cid/current_id,
 * sin, cos, tan.
 *
 * Blitz types of the locals used here (a name keeps the type of its first
 * occurrence in parse_commands): x, y, z and value are floats; class, state,
 * behaviour, file, idstring and unitidstr are strings; everything else
 * (id, id2, typ, range, mode, mat, rangeadd, unittype, unitid, check_*, ...)
 * is an int.
 */
import type { CommandDef, ParseCtx } from '../api';
import { Float, Int, fstr, istr } from '../_helpers';
import { Cclass_item, Cclass_object, Cclass_unit } from '../host';

/** What a value-returning host method gives back: the exact p_return$ text, or nothing to leave p_return$ alone. */
type Ret = string | void;

export interface Host {
	// --- queries (named after the original function) ----------------------
	/** get_material(name$): material number of a material name (load_materials.bb). */
	get_material(name: string): number;
	/** ai_getbehaviour(behaviour$): behaviour number of a unit behaviour name (ai_units.bb). */
	ai_getbehaviour(behaviour: string): number;

	// --- RETURN -------------------------------------------------------------
	/** countstored_items(parent_class, parent_id, typ): the handler passes Cclass_unit, g_player, itemtyp. Returns the count. */
	countstored_items(P: ParseCtx, parent_class: number, parent_id: number, typ: number): Ret;
	/** p_return$=map_day */
	cmd_day(P: ParseCtx): Ret;
	/** p_return$=map_hour */
	cmd_hour(P: ParseCtx): Ret;
	/** p_return$=map_minute */
	cmd_minute(P: ParseCtx): Ret;
	/**
	 * inrange. class2/id2 present: "1" if ha_distance(classint,id,class2,id2)<=range else "0".
	 * class2/id2 undefined: ha_idinrange(cam,range,classint,id). range is 300 when not given.
	 * class2 comes from parse_getclass(mode 1) unresolved: -1 for "self", 0 for an unknown class.
	 */
	cmd_inrange(P: ParseCtx, classint: number, id: number, range: number, class2: number | undefined, id2: number | undefined): Ret;
	/**
	 * count_inrange. class2/id2 present (from parse_classid): h=parent_h(class2,id2); h<>0 ->
	 * ha_inrange(h,range,classint,typ), else "0". class2/id2 undefined: ha_inrange(cam,range,classint,typ).
	 * classint is the unresolved parse_getclass result (-1 for "self", 0 unknown).
	 */
	cmd_count_inrange(P: ParseCtx, classint: number, typ: number, range: number, class2: number | undefined, id2: number | undefined): Ret;
	/**
	 * count_behaviourinrange. Only called for classint object/unit/item (p_return$ is already "0").
	 * Measured from parent_h(class2,id2), or from cam when class2/id2 are undefined.
	 * Original bug in the item branch: it tests Ditem_behaviour$(Tunit\typ) and EntityDistance(..,Tunit\h)
	 * with the Tunit loop variable (Null there) instead of Titem.
	 */
	cmd_count_behaviourinrange(P: ParseCtx, classint: number, behaviour: string, range: number, class2: number | undefined, id2: number | undefined): Ret;
	/**
	 * count_stored: sum of Titem\count of the items stored (parent_mode=Cpm_in) in classint/id.
	 * typ undefined = no type parameter given, count all; otherwise only items of that type.
	 */
	cmd_count_stored(P: ParseCtx, classint: number, id: number, typ: number | undefined): Ret;
	/** gotstate: "1" if a Tstate with parent classint/id and typ=stateint exists (p_return$ is already "0"). */
	cmd_gotstate(P: ParseCtx, classint: number, id: number, stateint: number): Ret;
	/** count_state: number of Tstate with typ=stateint (p_return$ is already "0"). */
	cmd_count_state(P: ParseCtx, stateint: number): Ret;
	/**
	 * distance: h1=parent_h(classint,id), h2=parent_h(classint2,id2). Both set -> EntityDistance(h1,h2).
	 * Otherwise parse_error("object",id) when h1=0, else parse_error("object",id2); then "0".
	 */
	cmd_distance(P: ParseCtx, classint: number, id: number, classint2: number, id2: number): Ret;
	/**
	 * playerdistance: h1=parent_h(classint,id). h1<>0 -> EntityDistance(g_cplayer\h,h1) ("0" if the
	 * player has no handle). h1=0 -> parse_error("object",id) and "0".
	 */
	cmd_playerdistance(P: ParseCtx, classint: number, id: number): Ret;
	/** inview: h1=parent_h(classint,id,1). h1<>0 -> EntityInView(h1,cam). Else parse_error("object",id) and "0". */
	cmd_inview(P: ParseCtx, classint: number, id: number): Ret;
	/**
	 * getx/gety/getz/getpitch/getyaw/getroll. com is p_com$ as it is AFTER the parameters were read
	 * (a nested function call in a parameter changes it; then none of the six matches and p_return$ stays).
	 * h=parent_h(classint,id), falling back to parse_kill_get(classint,id); a stored item uses the
	 * handle of its parent. h=0 -> parse_error("object",id) and "0".
	 */
	cmd_getx(P: ParseCtx, com: string, classint: number, id: number): Ret;
	/** lives: 1-ha_killed(classint,id). */
	cmd_lives(P: ParseCtx, classint: number, id: number): Ret;
	/** inarea_freshwater: h=parent_h(classint,id); h<>0 -> info_area(41,EntityX(h),EntityZ(h)); else p_return$ untouched. */
	cmd_inarea_freshwater(P: ParseCtx, classint: number, id: number): Ret;
	/** inarea_dig: like inarea_freshwater with info type 42. */
	cmd_inarea_dig(P: ParseCtx, classint: number, id: number): Ret;
	/** inarea_fish: like inarea_freshwater with info type 43. */
	cmd_inarea_fish(P: ParseCtx, classint: number, id: number): Ret;
	/** inarea: like inarea_freshwater with info type 44. */
	cmd_inarea(P: ParseCtx, classint: number, id: number): Ret;
	/**
	 * getstored: id of the first Titem with parent classint/id and (typ matches or typ=0)
	 * (p_return$ is already "0"). The original does not test parent_mode here.
	 */
	cmd_getstored(P: ParseCtx, classint: number, id: number, typ: number): Ret;
	/** getamount: Titem\count of item id; p_return$ untouched when the item does not exist. */
	cmd_getamount(P: ParseCtx, id: number): Ret;
	/** p_return$=g_drive */
	cmd_riding(P: ParseCtx): Ret;
	/** g_cplayer\player_weapon; nothing when there is no player. */
	cmd_getplayerweapon(P: ParseCtx): Ret;
	/** g_cplayer\player_ammo; nothing when there is no player. */
	cmd_getplayerammo(P: ParseCtx): Ret;
	/** p_return$=env_cweather */
	cmd_getweather(P: ParseCtx): Ret;
	/** ha_freespace(x#,y#,z#,range,objects,units,items,infos) */
	ha_freespace(P: ParseCtx, x: number, y: number, z: number, range: number, objects: number, units: number, items: number, infos: number): Ret;
	/** compare_material: "1" if the material of the object/unit/item type equals mat (p_return$ is already "0"). */
	cmd_compare_material(P: ParseCtx, classint: number, id: number, mat: number): Ret;
	/**
	 * compare_behaviour: "1" if the behaviour of the object/unit/item type equals behaviour$
	 * (units compare Dunit_behaviour with ai_getbehaviour(behaviour$)); p_return$ is already "0".
	 */
	cmd_compare_behaviour(P: ParseCtx, classint: number, id: number, behaviour: string): Ret;
	/**
	 * health: adds value# to the health of the unit/object/item, clamps to 0..max and returns the
	 * new health as a float (p_return$ is already "0"; stays "0" for other classes / unknown ids).
	 */
	cmd_health(P: ParseCtx, classint: number, id: number, value: number): Ret;
	/** ha_type(class,id) */
	ha_type(P: ParseCtx, classint: number, id: number): Ret;
	/** p_return$=pc_use_x# */
	cmd_use_x(P: ParseCtx): Ret;
	/** p_return$=pc_use_y# */
	cmd_use_y(P: ParseCtx): Ret;
	/** p_return$=pc_use_z# */
	cmd_use_z(P: ParseCtx): Ret;
	/** e_tery#(x#,z#) */
	e_tery(P: ParseCtx, x: number, z: number): Ret;
	/**
	 * parent_class / parent_id of item `id`. com is p_com$ as it is after the parameter was read.
	 * The loop has no Exit (the last matching item wins); p_return$ is already "0".
	 */
	cmd_parent_class(P: ParseCtx, com: string, id: number): Ret;
	/** p_return$=(ter_size*Cworld_size) */
	cmd_mapsize(P: ParseCtx): Ret;
	/**
	 * count: number of objects / units with health>0 / infos / states of type typ, or the summed
	 * Titem\count of items of that type (p_return$ is already "0"). The handler prints the
	 * leftover debug line of the unit branch itself.
	 */
	cmd_count(P: ParseCtx, classint: number, typ: number): Ret;
	/** defparam: Tdefparam\value$ of the first entry with class/typ/key (p_return$ is already "0"). */
	cmd_defparam(P: ParseCtx, classint: number, typ: number, key: string): Ret;
	/** p_return$=g_sleep */
	cmd_sleeping(P: ParseCtx): Ret;

	// --- AI -----------------------------------------------------------------
	/** ai_signal(class,id,mode,range) */
	ai_signal(P: ParseCtx, classint: number, id: number, mode: number, rangeadd: number): void;
	/** ai_typesignal(class,id,mode,unittype,range) */
	ai_typesignal(P: ParseCtx, classint: number, id: number, mode: number, unittype: number, rangeadd: number): void;
	/** ai_behavioursignal(class,id,mode,behaviour,range) */
	ai_behavioursignal(P: ParseCtx, classint: number, id: number, mode: number, unittype: number, rangeadd: number): void;
	/** ai_unitmode(unitid,mode,class,id) */
	ai_unitmode(P: ParseCtx, unitid: number, mode: number, classint: number, id: number): void;
	/** ai_stay: set=1 -> set_state(Cstate_ai_stick,Cclass_unit,unitid), anything else -> free_state(...). */
	cmd_ai_stay(P: ParseCtx, unitid: number, set: number): void;
	/** ai_center: moves the AI centre (ai_cx/ai_cz, and the ai_ch pivot if any) of the unit to its current position. */
	cmd_ai_center(P: ParseCtx, unitid: number): void;
}

/** Assign what a value-returning host method gave back. */
function ret(P: ParseCtx, r: Ret): void {
	if (typeof r === 'string') P.p_return = r;
}

/**
 * The opening every "class, id" command shares:
 *   class$=param() : classint=parse_getclass(class$)
 *   If classint=-1 Then classint=p_env_class : id=p_env_id
 *   Else parse_comma(1) : id=param()
 */
function selfclassid(P: ParseCtx): [number, number] {
	const cls = P.param();
	let classint = P.parse_getclass(cls);
	let id: number;
	if (classint === -1) {
		classint = P.p_env_class;
		id = P.p_env_id;
	} else {
		P.parse_comma(1);
		id = Int(P.param());
	}
	return [classint, id];
}

/** unitidstr$=param(): "self" -> p_env_id, else Int(unitidstr$). */
function unitid(P: ParseCtx): number {
	const unitidstr = P.param();
	return unitidstr === 'self' ? P.p_env_id : Int(unitidstr);
}

const USAGE_CLASSID = 'class:s {self | , id:i}';

export const commands: CommandDef[] = [
	// ################################################# RETURN
	{
		names: ['playergotitem'],
		section: 'RETURN',
		line: 4352,
		kind: 'host',
		returns: true,
		usage: 'itemtyp:i',
		run(P) {
			const itemtyp = Int(P.param());
			ret(P, P.host.countstored_items(P, Cclass_unit, P.host.g_player() ?? 0, itemtyp));
		}
	},
	{
		names: ['day'],
		section: 'RETURN',
		line: 4358,
		kind: 'host',
		returns: true,
		usage: '',
		run(P) {
			ret(P, P.host.cmd_day(P));
		}
	},
	{
		names: ['hour'],
		section: 'RETURN',
		line: 4362,
		kind: 'host',
		returns: true,
		usage: '',
		run(P) {
			ret(P, P.host.cmd_hour(P));
		}
	},
	{
		names: ['minute'],
		section: 'RETURN',
		line: 4366,
		kind: 'host',
		returns: true,
		usage: '',
		run(P) {
			ret(P, P.host.cmd_minute(P));
		}
	},
	{
		names: ['inrange'],
		section: 'RETURN',
		line: 4382,
		kind: 'host',
		returns: true,
		usage: `${USAGE_CLASSID} [, range:i=300 [, class2:s, id2:i]]`,
		run(P) {
			const [classint, id] = selfclassid(P);
			let range: number;
			let class2: number | undefined;
			let id2: number | undefined;
			if (P.parse_comma(0)) {
				range = Int(P.param());
				if (P.parse_comma(0)) {
					// Quirk: class 2 is not self-resolved ("self" stays -1, an unknown class is 0, no error).
					class2 = P.parse_getclass(P.param());
					P.parse_comma(1);
					id2 = Int(P.param());
				}
			} else {
				range = 300;
			}
			ret(P, P.host.cmd_inrange(P, classint, id, range, class2, id2));
		}
	},
	{
		names: ['count_inrange'],
		section: 'RETURN',
		line: 4413,
		kind: 'host',
		returns: true,
		usage: 'class:s, typ:i [, range:i=300 [, {self | player | class2:s, id2:i}]]',
		run(P) {
			const cls = P.param();
			// Quirk: no self-resolution, "self" is passed on as class -1.
			const classint = P.parse_getclass(cls);
			P.parse_comma(1);
			const typ = Int(P.param());
			let range: number;
			let class2: number | undefined;
			let id2: number | undefined;
			if (P.parse_comma(0)) {
				range = Int(P.param());
				if (P.parse_comma(0)) {
					P.parse_classid();
					class2 = P.tmp_gclass;
					id2 = P.tmp_gid;
				}
			} else {
				range = 300;
			}
			ret(P, P.host.cmd_count_inrange(P, classint, typ, range, class2, id2));
		}
	},
	{
		names: ['count_behaviourinrange'],
		section: 'RETURN',
		line: 4442,
		kind: 'host',
		returns: true,
		usage: 'class:s, behaviour:S [, range:i=300 [, class2:s, id2:i]]',
		run(P) {
			const cls = P.param();
			const classint = P.parse_getclass(cls);
			P.parse_comma(1);
			const behaviour = P.params();
			let range: number;
			let class2: number | undefined;
			let id2: number | undefined;
			if (P.parse_comma(0)) {
				range = Int(P.param());
				if (P.parse_comma(0)) {
					class2 = P.parse_getclass(P.param());
					P.parse_comma(1);
					id2 = Int(P.param());
				}
			} else {
				range = 300;
			}
			P.p_return = '0';
			if (classint === Cclass_object || classint === Cclass_unit || classint === Cclass_item) {
				// Quirk (host side): the item branch uses Tunit\typ / Tunit\h instead of Titem.
				ret(P, P.host.cmd_count_behaviourinrange(P, classint, behaviour, range, class2, id2));
			} else {
				P.parse_error('wrongclass', P.parse_getclasstxt(classint));
			}
		}
	},
	{
		names: ['hit_damage'],
		section: 'RETURN',
		line: 4497,
		kind: 'core',
		returns: true,
		usage: '',
		run(P) {
			P.p_return = fstr(P.pv.attack_damage);
		}
	},
	{
		names: ['hit_weapon'],
		section: 'RETURN',
		line: 4501,
		kind: 'core',
		returns: true,
		usage: '',
		run(P) {
			P.p_return = istr(P.pv.attack_weapon);
		}
	},
	{
		names: ['hit_ammo'],
		section: 'RETURN',
		line: 4505,
		kind: 'core',
		returns: true,
		usage: '',
		run(P) {
			P.p_return = istr(P.pv.attack_ammo);
		}
	},
	{
		names: ['impact_class'],
		section: 'RETURN',
		line: 4509,
		kind: 'core',
		returns: true,
		usage: '',
		run(P) {
			P.p_return = istr(P.pv.impact_class);
		}
	},
	{
		names: ['impact_id'],
		section: 'RETURN',
		line: 4513,
		kind: 'core',
		returns: true,
		usage: '',
		run(P) {
			P.p_return = istr(P.pv.impact_id);
		}
	},
	{
		names: ['impact_kill'],
		section: 'RETURN',
		line: 4517,
		kind: 'core',
		returns: true,
		usage: '',
		run(P) {
			P.p_return = istr(P.pv.impact_kill);
		}
	},
	{
		names: ['impact_first'],
		section: 'RETURN',
		line: 4521,
		kind: 'core',
		returns: true,
		usage: '',
		run(P) {
			P.p_return = P.pv.impact_num === 1 ? '1' : '0';
		}
	},
	{
		names: ['impact_amount'],
		section: 'RETURN',
		line: 4529,
		kind: 'core',
		returns: true,
		usage: '',
		run(P) {
			P.p_return = istr(P.pv.impact_amount);
		}
	},
	{
		names: ['impact_ground'],
		section: 'RETURN',
		line: 4533,
		kind: 'core',
		returns: true,
		usage: '',
		run(P) {
			P.p_return = istr(P.pv.impact_ground);
		}
	},
	{
		names: ['impact_x'],
		section: 'RETURN',
		line: 4537,
		kind: 'core',
		returns: true,
		usage: '',
		run(P) {
			P.p_return = fstr(P.pv.impact_x);
		}
	},
	{
		names: ['impact_y'],
		section: 'RETURN',
		line: 4541,
		kind: 'core',
		returns: true,
		usage: '',
		run(P) {
			P.p_return = fstr(P.pv.impact_y);
		}
	},
	{
		names: ['impact_z'],
		section: 'RETURN',
		line: 4545,
		kind: 'core',
		returns: true,
		usage: '',
		run(P) {
			P.p_return = fstr(P.pv.impact_z);
		}
	},
	{
		names: ['count_stored'],
		section: 'RETURN',
		line: 4549,
		kind: 'host',
		returns: true,
		usage: `${USAGE_CLASSID} [, typ:i]`,
		run(P) {
			const [classint, id] = selfclassid(P);
			P.p_return = '0';
			// No type parameter = count all items (undefined), which differs from an explicit type 0.
			let typ: number | undefined;
			if (P.parse_comma(0)) typ = Int(P.param());
			ret(P, P.host.cmd_count_stored(P, classint, id, typ));
		}
	},
	{
		names: ['gotstate'],
		section: 'RETURN',
		line: 4589,
		kind: 'host',
		returns: true,
		usage: `${USAGE_CLASSID}, state:s`,
		run(P) {
			const [classint, id] = selfclassid(P);
			P.parse_comma(1);
			const state = P.param();
			const stateint = P.parse_getstate(state);
			P.p_return = '0';
			ret(P, P.host.cmd_gotstate(P, classint, id, stateint));
		}
	},
	{
		names: ['count_state'],
		section: 'RETURN',
		line: 4615,
		kind: 'host',
		returns: true,
		usage: 'state:s',
		run(P) {
			const state = P.param();
			const stateint = P.parse_getstate(state);
			P.p_return = '0';
			ret(P, P.host.cmd_count_state(P, stateint));
		}
	},
	{
		names: ['distance'],
		section: 'RETURN',
		line: 4626,
		kind: 'host',
		returns: true,
		usage: `${USAGE_CLASSID}, class2:s, id2:i`,
		run(P) {
			const [classint, id] = selfclassid(P);
			P.parse_comma(1);
			const cls = P.param();
			// Quirk: class 2 is not self-resolved ("self" stays -1 and always needs an id).
			const classint2 = P.parse_getclass(cls);
			P.parse_comma(1);
			const id2 = Int(P.param());
			// The host raises parse_error("object", id | id2) and returns "0" when a handle is missing.
			ret(P, P.host.cmd_distance(P, classint, id, classint2, id2));
		}
	},
	{
		names: ['playerdistance'],
		section: 'RETURN',
		line: 4655,
		kind: 'host',
		returns: true,
		usage: USAGE_CLASSID,
		run(P) {
			const [classint, id] = selfclassid(P);
			ret(P, P.host.cmd_playerdistance(P, classint, id));
		}
	},
	{
		names: ['inview'],
		section: 'RETURN',
		line: 4678,
		kind: 'host',
		returns: true,
		usage: USAGE_CLASSID,
		run(P) {
			const [classint, id] = selfclassid(P);
			ret(P, P.host.cmd_inview(P, classint, id));
		}
	},
	{
		names: ['getx', 'gety', 'getz', 'getpitch', 'getyaw', 'getroll'],
		section: 'RETURN',
		line: 4697,
		kind: 'host',
		returns: true,
		usage: USAGE_CLASSID,
		run(P) {
			const [classint, id] = selfclassid(P);
			// Quirk: p_com$ is read after the parameters; a nested function call in them has replaced it
			// and then no axis matches (p_return$ keeps the nested call's value).
			ret(P, P.host.cmd_getx(P, P.p_com, classint, id));
		}
	},
	{
		names: ['exists'],
		section: 'RETURN',
		line: 4741,
		kind: 'host',
		returns: true,
		usage: USAGE_CLASSID,
		run(P) {
			const [classint, id] = selfclassid(P);
			P.p_return = istr(P.host.parent_con(classint, id) ?? 0);
		}
	},
	{
		names: ['lives'],
		section: 'RETURN',
		line: 4754,
		kind: 'host',
		returns: true,
		usage: USAGE_CLASSID,
		run(P) {
			const [classint, id] = selfclassid(P);
			ret(P, P.host.cmd_lives(P, classint, id));
		}
	},
	{
		names: ['inarea_freshwater'],
		section: 'RETURN',
		line: 4779,
		kind: 'host',
		returns: true,
		usage: USAGE_CLASSID,
		run(P) {
			const [classint, id] = selfclassid(P);
			// Quirk: no default, p_return$ stays "" when the entity has no handle.
			ret(P, P.host.cmd_inarea_freshwater(P, classint, id));
		}
	},
	{
		names: ['inarea_dig'],
		section: 'RETURN',
		line: 4795,
		kind: 'host',
		returns: true,
		usage: USAGE_CLASSID,
		run(P) {
			const [classint, id] = selfclassid(P);
			// Quirk: no default, p_return$ stays "" when the entity has no handle.
			ret(P, P.host.cmd_inarea_dig(P, classint, id));
		}
	},
	{
		names: ['inarea_fish'],
		section: 'RETURN',
		line: 4811,
		kind: 'host',
		returns: true,
		usage: USAGE_CLASSID,
		run(P) {
			const [classint, id] = selfclassid(P);
			// Quirk: no default, p_return$ stays "" when the entity has no handle.
			ret(P, P.host.cmd_inarea_fish(P, classint, id));
		}
	},
	{
		names: ['inarea'],
		section: 'RETURN',
		line: 4827,
		kind: 'host',
		returns: true,
		usage: USAGE_CLASSID,
		run(P) {
			const [classint, id] = selfclassid(P);
			// Quirk: no default, p_return$ stays "" when the entity has no handle.
			ret(P, P.host.cmd_inarea(P, classint, id));
		}
	},
	{
		names: ['getstored'],
		section: 'RETURN',
		line: 4843,
		kind: 'host',
		returns: true,
		usage: 'class:s, id:i [, typ:i=0]',
		run(P) {
			const cls = P.param();
			// Quirk: no self-resolution, "self" is passed on as class -1 (and still needs an id).
			const classint = P.parse_getclass(cls);
			P.parse_comma(1);
			const id = Int(P.param());
			let typ = 0;
			if (P.parse_comma(0)) typ = Int(P.param());
			P.p_return = '0';
			ret(P, P.host.cmd_getstored(P, classint, id, typ));
		}
	},
	{
		names: ['getamount'],
		section: 'RETURN',
		line: 4865,
		kind: 'host',
		returns: true,
		usage: 'id:i',
		run(P) {
			const id = Int(P.param());
			// Quirk: no default, p_return$ stays "" when the item does not exist.
			ret(P, P.host.cmd_getamount(P, id));
		}
	},
	{
		names: ['riding'],
		section: 'RETURN',
		line: 4875,
		kind: 'host',
		returns: true,
		usage: '',
		run(P) {
			ret(P, P.host.cmd_riding(P));
		}
	},
	{
		names: ['getplayerweapon'],
		section: 'RETURN',
		line: 4879,
		kind: 'host',
		returns: true,
		usage: '',
		run(P) {
			ret(P, P.host.cmd_getplayerweapon(P));
		}
	},
	{
		names: ['getplayerammo'],
		section: 'RETURN',
		line: 4883,
		kind: 'host',
		returns: true,
		usage: '',
		run(P) {
			ret(P, P.host.cmd_getplayerammo(P));
		}
	},
	{
		names: ['getweather'],
		section: 'RETURN',
		line: 4887,
		kind: 'host',
		returns: true,
		usage: '',
		run(P) {
			ret(P, P.host.cmd_getweather(P));
		}
	},
	{
		names: ['freespace'],
		section: 'RETURN',
		line: 4891,
		kind: 'host',
		returns: true,
		usage: 'x:f, y:f, z:f [, range:i=300 [, objects:i=1 [, units:i=1 [, items:i=1 [, infos:i=0]]]]]',
		run(P) {
			// x, y, z are written without '#' here but are the float locals x#, y#, z# of parse_commands.
			const x = Float(P.param());
			P.parse_comma(1);
			const y = Float(P.param());
			P.parse_comma(1);
			const z = Float(P.param());
			let range = 300;
			let check_objects = 1;
			let check_units = 1;
			let check_items = 1;
			let check_infos = 0;
			if (P.parse_comma(0)) {
				range = Int(P.param());
				if (P.parse_comma(0)) {
					check_objects = Int(P.param());
					if (P.parse_comma(0)) {
						check_units = Int(P.param());
						if (P.parse_comma(0)) {
							check_items = Int(P.param());
							if (P.parse_comma(0)) {
								check_infos = Int(P.param());
							}
						}
					}
				}
			}
			ret(P, P.host.ha_freespace(P, x, y, z, range, check_objects, check_units, check_items, check_infos));
		}
	},
	{
		names: ['compare_material'],
		section: 'RETURN',
		line: 4920,
		kind: 'host',
		returns: true,
		usage: `${USAGE_CLASSID}, material:s`,
		run(P) {
			P.p_return = '0'; // before the parameters: a nested function call in them overwrites it
			const [classint, id] = selfclassid(P);
			P.parse_comma(1);
			const mat = P.host.get_material(P.param()) ?? 0;
			ret(P, P.host.cmd_compare_material(P, classint, id, mat));
		}
	},
	{
		names: ['compare_behaviour'],
		section: 'RETURN',
		line: 4949,
		kind: 'host',
		returns: true,
		usage: `${USAGE_CLASSID}, behaviour:s`,
		run(P) {
			P.p_return = '0'; // before the parameters: a nested function call in them overwrites it
			const [classint, id] = selfclassid(P);
			P.parse_comma(1);
			// Quirk: read with param() here, but with params() in count_behaviourinrange.
			const behaviour = P.param();
			ret(P, P.host.cmd_compare_behaviour(P, classint, id, behaviour));
		}
	},
	{
		names: ['health'],
		section: 'RETURN',
		line: 4978,
		kind: 'host',
		returns: true,
		usage: `${USAGE_CLASSID} [, change:f=0]`,
		run(P) {
			const [classint, id] = selfclassid(P);
			let value = 0;
			if (P.parse_comma(0)) value = Float(P.param());
			P.p_return = '0';
			ret(P, P.host.cmd_health(P, classint, id, value));
		}
	},
	{
		names: ['type'],
		section: 'RETURN',
		line: 5027,
		kind: 'host',
		returns: true,
		usage: USAGE_CLASSID,
		run(P) {
			const [classint, id] = selfclassid(P);
			ret(P, P.host.ha_type(P, classint, id));
		}
	},
	{
		names: ['use_x'],
		section: 'RETURN',
		line: 5040,
		kind: 'host',
		returns: true,
		usage: '',
		run(P) {
			ret(P, P.host.cmd_use_x(P));
		}
	},
	{
		names: ['use_y'],
		section: 'RETURN',
		line: 5044,
		kind: 'host',
		returns: true,
		usage: '',
		run(P) {
			ret(P, P.host.cmd_use_y(P));
		}
	},
	{
		names: ['use_z'],
		section: 'RETURN',
		line: 5048,
		kind: 'host',
		returns: true,
		usage: '',
		run(P) {
			ret(P, P.host.cmd_use_z(P));
		}
	},
	{
		names: ['terrainy'],
		section: 'RETURN',
		line: 5052,
		kind: 'host',
		returns: true,
		usage: 'x:f, z:f',
		run(P) {
			const x = Float(P.param());
			P.parse_comma(1);
			const z = Float(P.param());
			ret(P, P.host.e_tery(P, x, z));
		}
	},
	{
		names: ['parent_class', 'parent_id'],
		section: 'RETURN',
		line: 5092,
		kind: 'host',
		returns: true,
		usage: 'itemid:s',
		run(P) {
			let idstring = P.param();
			if (idstring === 'self') {
				// Quirk: "self" outside an item script is not replaced and becomes Int("self") = 0.
				if (P.p_env_class === Cclass_item) idstring = istr(P.p_env_id);
			}
			P.p_return = '0';
			// Quirk: p_com$ is read after the parameter; a nested function call in it has replaced it
			// and the result then stays "0". The item loop has no Exit.
			ret(P, P.host.cmd_parent_class(P, P.p_com, Int(idstring)));
		}
	},
	{
		names: ['mapsize'],
		section: 'RETURN',
		line: 5111,
		kind: 'host',
		returns: true,
		usage: '',
		run(P) {
			ret(P, P.host.cmd_mapsize(P));
		}
	},
	{
		names: ['count'],
		section: 'RETURN',
		line: 5115,
		kind: 'host',
		returns: true,
		usage: 'class:s, typ:i',
		run(P) {
			const cls = P.param();
			const classint = P.parse_getclass(cls);
			P.parse_comma(1);
			const id = Int(P.param()); // the type, kept in the variable "id"
			P.p_return = '0';
			ret(P, P.host.cmd_count(P, classint, id));
			// Quirk: leftover debug output, every unit count prints a console line.
			if (classint === Cclass_unit) P.host.con_add('result ' + P.p_return);
		}
	},
	{
		names: ['defparam'],
		section: 'RETURN',
		line: 5151,
		kind: 'host',
		returns: true,
		usage: 'class:s, typ:i, key:s',
		run(P) {
			const cls = P.param();
			const classint = P.parse_getclass(cls);
			P.parse_comma(1);
			const id = Int(P.param());
			P.parse_comma(1);
			const file = P.param();
			P.p_return = '0';
			ret(P, P.host.cmd_defparam(P, classint, id, file));
		}
	},
	{
		names: ['sleeping'],
		section: 'RETURN',
		line: 5171,
		kind: 'host',
		returns: true,
		usage: '',
		run(P) {
			ret(P, P.host.cmd_sleeping(P));
		}
	},

	// ################################################# AI
	{
		names: ['ai_signal'],
		section: 'AI',
		line: 5311,
		kind: 'host',
		returns: false,
		usage: 'signal:s [, range:i=300] [, class:s, id:i]',
		run(P) {
			const mode = P.parse_getaisignal(P.param());
			let rangeadd = 300;
			if (P.parse_comma(0)) rangeadd = Int(P.param());
			let classint: number;
			let id: number;
			// Quirk: two independent optional groups, so a class can only follow an explicit range.
			if (P.parse_comma(0)) {
				const cls = P.param();
				// Quirk: no self-resolution here, "self" is passed on as class -1.
				classint = P.parse_getclass(cls);
				P.parse_comma(1);
				id = Int(P.param());
			} else {
				classint = P.p_env_class;
				id = P.p_env_id;
			}
			P.host.ai_signal(P, classint, id, mode, rangeadd);
		}
	},
	{
		names: ['ai_typesignal'],
		section: 'AI',
		line: 5329,
		kind: 'host',
		returns: false,
		usage: 'signal:s, unittype:i [, range:i=300] [, class:s, id:i]',
		run(P) {
			const mode = P.parse_getaisignal(P.param());
			P.parse_comma(1);
			const unittype = Int(P.param());
			let rangeadd = 300;
			if (P.parse_comma(0)) rangeadd = Int(P.param());
			let classint: number;
			let id: number;
			if (P.parse_comma(0)) {
				const cls = P.param();
				// Quirk: no self-resolution here, "self" is passed on as class -1.
				classint = P.parse_getclass(cls);
				P.parse_comma(1);
				id = Int(P.param());
			} else {
				classint = P.p_env_class;
				id = P.p_env_id;
			}
			P.host.ai_typesignal(P, classint, id, mode, unittype, rangeadd);
		}
	},
	{
		names: ['ai_behavioursignal'],
		section: 'AI',
		line: 5349,
		kind: 'host',
		returns: false,
		usage: 'signal:s, behaviour:s [, range:i=300] [, class:s, id:i]',
		run(P) {
			const mode = P.parse_getaisignal(P.param());
			P.parse_comma(1);
			const unittype = P.host.ai_getbehaviour(P.param()) ?? 0;
			let rangeadd = 300;
			if (P.parse_comma(0)) rangeadd = Int(P.param());
			let classint: number;
			let id: number;
			if (P.parse_comma(0)) {
				const cls = P.param();
				// Quirk: no self-resolution here, "self" is passed on as class -1.
				classint = P.parse_getclass(cls);
				P.parse_comma(1);
				id = Int(P.param());
			} else {
				classint = P.p_env_class;
				id = P.p_env_id;
			}
			P.host.ai_behavioursignal(P, classint, id, mode, unittype, rangeadd);
		}
	},
	{
		names: ['ai_mode'],
		section: 'AI',
		line: 5369,
		kind: 'host',
		returns: false,
		usage: 'unit:s, mode:s [, class:s, id:i]',
		run(P) {
			const uid = unitid(P);
			P.parse_comma(1);
			const mode = P.parse_getaimode(P.param());
			let classint = 0;
			let id = 0;
			if (P.parse_comma(0)) {
				const cls = P.param();
				// Quirk: no self-resolution here, "self" is passed on as class -1.
				classint = P.parse_getclass(cls);
				P.parse_comma(1);
				id = Int(P.param());
			}
			P.host.ai_unitmode(P, uid, mode, classint, id);
		}
	},
	{
		names: ['ai_eater'],
		section: 'AI',
		line: 5389,
		kind: 'core',
		returns: true,
		usage: '',
		run(P) {
			P.p_return = istr(P.pv.ai_eater);
		}
	},
	{
		names: ['ai_stay'],
		section: 'AI',
		line: 5394,
		kind: 'host',
		returns: false,
		usage: 'unit:s [, set:i=1]',
		run(P) {
			const uid = unitid(P);
			let id = 1;
			if (P.parse_comma(0)) id = Int(P.param());
			// id=1 sets the ai_stick state, every other value removes it.
			P.host.cmd_ai_stay(P, uid, id);
		}
	},
	{
		names: ['ai_center'],
		section: 'AI',
		line: 5414,
		kind: 'host',
		returns: false,
		usage: '[unit:s]',
		run(P) {
			let uid: number;
			if (P.parse_param()) {
				uid = unitid(P);
			} else {
				uid = P.p_env_id;
			}
			P.host.cmd_ai_center(P, uid);
		}
	}
];
