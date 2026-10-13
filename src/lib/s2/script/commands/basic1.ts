/**
 * parse_commands(), parser_commands.bb lines 16-1145: section BASIC,
 * Case "terrain" through Case "snowratio".
 *
 * Not in this file (ported with the interpreter core): skipevent, event,
 * def_extend, def_override, def_free, addscript, extendscript.
 *
 * Every handler reads its parameters in exactly the order and with exactly
 * the Blitz types of the original Case block; world effects are delegated to
 * the Host declared below.
 */
import type { CommandDef, ParseCtx } from '../api';
import { Float, Int, istr } from '../_helpers';

const Cclass_object = 1;
const Cclass_unit = 2;
const Cclass_item = 3;
const Cclass_info = 4;

/**
 * Host methods of this slice. Arguments after P are the parsed values in the
 * order the original reads them. Methods returning `string | void` return the
 * exact p_return$ text, or nothing to leave p_return$ as the handler set it.
 */
export interface Host {
	/**
	 * terrain x, z, mode [, height]. mode 0: return TerrainHeight*100 (float text), 1: set height,
	 * 2: modify height, 3/4: return Int(matrix x) / Int(matrix z). height is 0 unless mode is 1 or 2.
	 * Original quirk to keep in mode 2: `If height#>1000 Then height#=100` (100, not 1000).
	 * Any other mode does nothing.
	 */
	cmd_terrain(P: ParseCtx, xpos: number, zpos: number, mode: number, height: number): string | void;
	/** in_compass=value */
	cmd_compass(P: ParseCtx, value: number): void;
	/**
	 * First half of eat/drink/consume, runs BEFORE the parameters are read: sound + icon
	 * pixelize effect chosen by com ("eat" / "drink", anything else: none), then
	 * `If p_env_class=Cclass_item Then free_item(p_env_id,1)`.
	 */
	cmd_eat_fx(P: ParseCtx, com: string): void;
	/**
	 * Second half of eat/drink/consume, only called when parameters are present:
	 * `If con_unit(cunit)` add health, subtract hunger/thirst/exhaustion, unit_values().
	 */
	cmd_eat(
		P: ParseCtx,
		cunit: number,
		chealth: number,
		chunger: number,
		cthirst: number,
		cexhaustion: number
	): void;
	/** fry: sfx(sfx_fizzle) + icon pixelize effect. */
	cmd_fry(P: ParseCtx): void;
	/**
	 * maxhealth class, id [, change]. p_return$ is "0" before the call. Unit/object: change
	 * health_max and return it (float text); item: return Ditem_health#(typ); other classes: nothing.
	 */
	cmd_maxhealth(P: ParseCtx, classint: number, id: number, value: number): string | void;
	/** jade value: add value to hunger, thirst and exhaustion of the player. */
	cmd_jade(P: ParseCtx, cvalue: number): void;
	/** con "text": in_conin$=text : con_enter() */
	cmd_con(P: ParseCtx, in_conin: string): void;
	/** exec "file": gui_msgdecide + ExecFile. */
	cmd_exec(P: ParseCtx, exec: string): void;
	/**
	 * create class, typ [, x, z] [, count]. xpos/zpos are undefined when not given (original uses
	 * the position of g_cplayer\h). Only called for classint 1..4 (object, unit, item, info);
	 * count is 1 or the given value for items and 0 for every other class. p_return$ is "0"
	 * before the call; return the new id as int text when the entity was created.
	 */
	cmd_create(
		P: ParseCtx,
		classint: number,
		typ: number,
		xpos: number | undefined,
		zpos: number | undefined,
		count: number
	): string | void;
	/** randomcreate(class, typ, miny#, maxy#, count): returns the int result as text. */
	randomcreate(P: ParseCtx, classint: number, typ: number, xpos: number, zpos: number, count: number): string | void;
	/**
	 * areal_event "event", x, y, z [, range=50] [, eventlimit=1]: the object/unit/item/info loops
	 * with set_parsecache() and parse_task().
	 */
	cmd_areal_event(
		P: ParseCtx,
		event: string,
		x: number,
		y: number,
		z: number,
		range: number,
		eventlimit: number
	): void;
	/** New Tin_quicksave with mode 1, in_quicksave=1 */
	cmd_quicksave(P: ParseCtx): void;
	/** New Tin_quicksave with mode 2, in_quicksave=2 */
	cmd_quickload(P: ParseCtx): void;
	/** New Tin_quicksave with mode 3, in_quicksave=3 */
	cmd_autosave(P: ParseCtx): void;
	/** New Tin_quicksave with mode 4, in_quicksave=4 */
	cmd_autoload(P: ParseCtx): void;
	/** loadmap: cachedata(1, ot_...) then queue Tin_quicksave mode 5 for path. */
	cmd_loadmap(
		P: ParseCtx,
		path: string,
		ot_skills: number,
		ot_items: number,
		ot_vars: number,
		ot_diary: number,
		ot_states: number,
		ot_locks: number
	): void;
	/** savemap: queue Tin_quicksave mode 6 for path with the six flags. */
	cmd_savemap(
		P: ParseCtx,
		path: string,
		ot_skills: number,
		ot_items: number,
		ot_vars: number,
		ot_diary: number,
		ot_states: number,
		ot_locks: number
	): void;
	/**
	 * alteritem count, type [, newcount=1 [, newtype=0]]. Not called when newnewtype=0 outside
	 * of an item "use" event (the handler raises the parse error itself).
	 */
	cmd_alteritem(P: ParseCtx, c: number, newtype: number, newcount: number, newnewtype: number): void;
	/** quit: menu_start() */
	cmd_quit(P: ParseCtx): void;
	/** credits: menu_start() : menu_set(Cmenu_credits,0) */
	cmd_credits(P: ParseCtx): void;
	/**
	 * setpos branch. setpx/setpy/setpz are the raw parameter texts (may be "self").
	 * The host must call P.parse_error("object", id) when parent_h(classint,id) is 0.
	 */
	cmd_setpos(P: ParseCtx, classint: number, id: number, setpx: string, setpy: string, setpz: string): void;
	/**
	 * setat branch: target position is that of parent_h(class2,id2); when that handle is 0 the
	 * original still calls ha_setpos with setpx$=setpy$=setpz$="" (no error).
	 * The host must call P.parse_error("object", id) when parent_h(classint,id) is 0.
	 */
	cmd_setat(P: ParseCtx, classint: number, id: number, class2: number, id2: number): void;
	/** setrot. pitch/yaw/roll are raw texts (may be "self"). Host calls P.parse_error("object", id) when parent_h is 0. */
	cmd_setrot(P: ParseCtx, classint: number, id: number, pitch: string, yaw: string, roll: string): void;
	/**
	 * rpos. All six are raw texts; pitch/yaw/roll are "" when the optional group is absent
	 * (Float("")=0) and may be "self". Host calls P.parse_error("object", id) when parent_h is 0.
	 */
	cmd_rpos(
		P: ParseCtx,
		classint: number,
		id: number,
		setpx: string,
		setpy: string,
		setpz: string,
		pitch: string,
		yaw: string,
		roll: string
	): void;
	/**
	 * store item, class, id [, mode=0]. idstring is the item id text (converted with Int() by
	 * store_item's int parameter). Returns store_item()'s int result as text.
	 * Original quirks to keep for mode<>0: con_item() is asked for the CONTAINER id, the
	 * tmp_x/y/z it fills are never used, and store_item gets Cpm_out with x#,y#,z# = 0,0,0.
	 */
	cmd_store(P: ParseCtx, idstring: string, classint: number, id: number, mode: number): string | void;
	/** unstore item [, count=1]: unstore_item(Int(idstring),count,1); returns TCitem\id text if TCitem<>Null. */
	cmd_unstore(P: ParseCtx, idstring: string, count: number): string | void;
	/** kill id: If con_unit(id) Then kill_unit() */
	cmd_kill(P: ParseCtx, id: number): void;
	/** ha_damage(class, id, damage#) */
	ha_damage(P: ParseCtx, classint: number, id: number, damage: number): void;
	/** ha_heal(class, id, damage#) */
	ha_heal(P: ParseCtx, classint: number, id: number, damage: number): void;
	/**
	 * setcount id, count. For the item with that id: unstored (parent_class=0) -> count=Abs(count),
	 * 0 becomes 1; stored -> P.parse_error("'setcount' has to be used with an unstored item").
	 */
	cmd_setcount(P: ParseCtx, id: number, count: number): void;
	/** ride/drive [id]: If con_unit(id) then g_drive=id ... */
	cmd_ride(P: ParseCtx, id: number): void;
	/** getoff */
	cmd_getoff(P: ParseCtx): void;
	/**
	 * climate n (0 normal, 1 arctic, 2 sun, 3 rain, 4 snow, 5 thunder): map_climate=n and the
	 * weather change of that Case (0 and 1 use Rand(0,1) conditionally: call P.Rand).
	 */
	cmd_climate(P: ParseCtx, climate: number): void;
	/** e_environment_setweather(weather) */
	e_environment_setweather(P: ParseCtx, weather: number): void;
	/** map_rainratio=value */
	cmd_rainratio(P: ParseCtx, value: number): void;
	/** map_snowratio=value */
	cmd_snowratio(P: ParseCtx, value: number): void;
}

/**
 * class$=param() : classint=parse_getclass(class$) : If classint=-1 Then env Else parse_comma(1) : id=param()
 * Quirk: an unknown class text gives classint 0 (parse_getclass falls off its end) and the id is still read.
 */
function classId(P: ParseCtx): [number, number] {
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

/** The six nested optional flags of loadmap / savemap. */
function mapFlags(P: ParseCtx, def: number): [number, number, number, number, number, number] {
	let ot_skills = def;
	let ot_items = def;
	let ot_vars = def;
	let ot_diary = def;
	let ot_states = def;
	let ot_locks = def;
	if (P.parse_comma(0)) {
		ot_skills = Int(P.param());
		if (P.parse_comma(0)) {
			ot_items = Int(P.param());
			if (P.parse_comma(0)) {
				ot_vars = Int(P.param());
				if (P.parse_comma(0)) {
					ot_diary = Int(P.param());
					if (P.parse_comma(0)) {
						ot_states = Int(P.param());
						if (P.parse_comma(0)) {
							ot_locks = Int(P.param());
						}
					}
				}
			}
		}
	}
	return [ot_skills, ot_items, ot_vars, ot_diary, ot_states, ot_locks];
}

export const commands: CommandDef[] = [
	{
		names: ['terrain'],
		section: 'BASIC',
		line: 18,
		kind: 'host',
		returns: true,
		usage: 'x:f, z:f, mode:i {mode=1|2: , height:f}',
		run(P) {
			const xpos = Float(P.param());
			P.parse_comma(1);
			const zpos = Float(P.param());
			P.parse_comma(1);
			const mode = Int(P.param());
			let height = 0;
			if (mode === 1 || mode === 2) {
				P.parse_comma(1);
				height = Float(P.param());
			}
			// Quirk (host side): mode 2 clamps a height above 1000 to 100.
			const r = P.host.cmd_terrain(P, xpos, zpos, mode, height);
			if (typeof r === 'string') P.p_return = r;
		}
	},
	{
		names: ['compass'],
		section: 'BASIC',
		line: 46,
		kind: 'host',
		returns: false,
		usage: 'value:i',
		run(P) {
			P.host.cmd_compass(P, Int(P.param()));
		}
	},
	{
		names: ['eat', 'drink', 'consume'],
		section: 'BASIC',
		line: 50,
		kind: 'host',
		returns: false,
		usage: '[health:f [, hunger:f] [, thirst:f] [, exhaustion:f] [, unit:i=player]]',
		run(P) {
			// The effect and free_item(p_env_id,1) happen before any parameter is evaluated.
			P.host.cmd_eat_fx(P, P.p_com);
			if (P.parse_param()) {
				let cunit = P.host.g_player();
				const chealth = Float(P.param());
				let chunger = 0;
				let cthirst = 0;
				let cexhaustion = 0;
				// Quirk: the optional reads are not nested, they are four independent parse_comma(0).
				if (P.parse_comma(0)) chunger = Float(P.param());
				if (P.parse_comma(0)) cthirst = Float(P.param());
				if (P.parse_comma(0)) cexhaustion = Float(P.param());
				if (P.parse_comma(0)) cunit = Int(P.param());
				P.host.cmd_eat(P, cunit, chealth, chunger, cthirst, cexhaustion);
			}
		}
	},
	{
		names: ['fry'],
		section: 'BASIC',
		line: 90,
		kind: 'host',
		returns: false,
		usage: '',
		run(P) {
			P.host.cmd_fry(P);
		}
	},
	{
		names: ['maxhealth'],
		section: 'BASIC',
		line: 99,
		kind: 'host',
		returns: true,
		usage: '{"self" | class:s, id:i} [, change:f=0]',
		run(P) {
			const [classint, id] = classId(P);
			let value = 0;
			if (P.parse_comma(0)) {
				value = Float(P.param());
			}
			P.p_return = '0';
			const r = P.host.cmd_maxhealth(P, classint, id, value);
			if (typeof r === 'string') P.p_return = r;
		}
	},
	{
		names: ['jade'],
		section: 'BASIC',
		line: 145,
		kind: 'host',
		returns: false,
		usage: 'value:f',
		run(P) {
			P.host.cmd_jade(P, Float(P.param()));
		}
	},
	{
		names: ['con'],
		section: 'BASIC',
		line: 155,
		kind: 'host',
		returns: false,
		usage: 'command:S',
		run(P) {
			P.host.cmd_con(P, P.params());
		}
	},
	{
		names: ['exec'],
		section: 'BASIC',
		line: 160,
		kind: 'host',
		returns: false,
		usage: 'file:S',
		run(P) {
			P.host.cmd_exec(P, P.params());
		}
	},
	{
		names: ['create'],
		section: 'BASIC',
		line: 289,
		kind: 'host',
		returns: true,
		usage: 'class:s, typ:i [, x:f, z:f] {class=item: [, count:i=1]}',
		run(P) {
			const cls = P.param();
			// Quirk: parse_getclass in mode 1, so "self" gives -1 and ends in the "wrongclass" error.
			const classint = P.parse_getclass(cls);
			P.parse_comma(1);
			const typ = Int(P.param());
			let xpos: number | undefined;
			let zpos: number | undefined;
			if (P.parse_comma(0)) {
				xpos = Float(P.param());
				P.parse_comma(1);
				zpos = Float(P.param());
			}
			P.p_return = '0';
			let count = 0;
			switch (classint) {
				case Cclass_object:
				case Cclass_unit:
				case Cclass_info:
					break;
				case Cclass_item:
					count = 1;
					if (P.parse_comma(0)) {
						count = Int(P.param());
					}
					break;
				default:
					P.parse_error('wrongclass', P.parse_getclasstxt(classint));
					return;
			}
			const r = P.host.cmd_create(P, classint, typ, xpos, zpos, count);
			if (typeof r === 'string') P.p_return = r;
		}
	},
	{
		names: ['randomcreate'],
		section: 'BASIC',
		line: 334,
		kind: 'host',
		returns: true,
		usage: 'class:s, typ:i [, ymin:f=0 [, ymax:f=1000000 [, count:i=1]]]',
		run(P) {
			const cls = P.param();
			const classint = P.parse_getclass(cls);
			P.parse_comma(1);
			const typ = Int(P.param());
			// Quirk: the variables are called xpos#/zpos# but hold the min/max terrain height.
			let xpos = 0;
			let zpos = 1000000;
			let count = 1;
			if (P.parse_comma(0)) {
				xpos = Float(P.param());
				if (P.parse_comma(0)) {
					zpos = Float(P.param());
					if (P.parse_comma(0)) {
						count = Int(P.param());
					}
				}
			}
			const r = P.host.randomcreate(P, classint, typ, xpos, zpos, count);
			if (typeof r === 'string') P.p_return = r;
		}
	},
	{
		names: ['areal_event'],
		section: 'BASIC',
		line: 378,
		kind: 'host',
		returns: false,
		usage: 'event:S, x:f, y:f, z:f [, range:i=50] [, eventlimit:i=1]',
		run(P) {
			const event = P.params();
			P.parse_comma(1);
			const x = Float(P.param());
			P.parse_comma(1);
			const y = Float(P.param());
			P.parse_comma(1);
			const z = Float(P.param());
			let range = 50;
			let eventlimit = 1;
			// Quirk: two independent optional reads (not nested); range is an int.
			if (P.parse_comma(0)) {
				range = Int(P.param());
			}
			if (P.parse_comma(0)) {
				eventlimit = Int(P.param());
			}
			P.host.cmd_areal_event(P, event, x, y, z, range, eventlimit);
		}
	},
	{
		names: ['quicksave'],
		section: 'BASIC',
		line: 466,
		kind: 'host',
		returns: false,
		usage: '',
		run(P) {
			P.host.cmd_quicksave(P);
		}
	},
	{
		names: ['quickload'],
		section: 'BASIC',
		line: 473,
		kind: 'host',
		returns: false,
		usage: '',
		run(P) {
			P.host.cmd_quickload(P);
		}
	},
	{
		names: ['autosave'],
		section: 'BASIC',
		line: 480,
		kind: 'host',
		returns: false,
		usage: '',
		run(P) {
			P.host.cmd_autosave(P);
		}
	},
	{
		names: ['autoload'],
		section: 'BASIC',
		line: 487,
		kind: 'host',
		returns: false,
		usage: '',
		run(P) {
			P.host.cmd_autoload(P);
		}
	},
	{
		names: ['loadmap'],
		section: 'BASIC',
		line: 494,
		kind: 'host',
		returns: false,
		usage:
			'path:S [, skills:i=0 [, items:i=0 [, vars:i=0 [, diary:i=0 [, states:i=0 [, locks:i=0]]]]]]',
		run(P) {
			const path = P.params();
			const [ot_skills, ot_items, ot_vars, ot_diary, ot_states, ot_locks] = mapFlags(P, 0);
			P.host.cmd_loadmap(P, path, ot_skills, ot_items, ot_vars, ot_diary, ot_states, ot_locks);
		}
	},
	{
		names: ['loadmaptakeover'],
		section: 'BASIC',
		line: 530,
		kind: 'core',
		returns: true,
		usage: '',
		run(P) {
			P.p_return = istr(P.pv.loadmaploaded);
		}
	},
	{
		names: ['savemap'],
		section: 'BASIC',
		line: 534,
		kind: 'host',
		returns: false,
		usage:
			'path:S [, skills:i=1 [, items:i=1 [, vars:i=1 [, diary:i=1 [, states:i=1 [, locks:i=1]]]]]]',
		run(P) {
			const path = P.params();
			const [ot_skills, ot_items, ot_vars, ot_diary, ot_states, ot_locks] = mapFlags(P, 1);
			P.host.cmd_savemap(P, path, ot_skills, ot_items, ot_vars, ot_diary, ot_states, ot_locks);
		}
	},
	{
		names: ['echo'],
		section: 'BASIC',
		line: 575,
		kind: 'core',
		returns: false,
		usage: 'text:S',
		run(P) {
			// con_add(params()): special keeps its default (-1).
			P.host.con_add(P.params());
		}
	},
	{
		names: ['alteritem'],
		section: 'BASIC',
		line: 579,
		kind: 'host',
		returns: false,
		usage: 'count:i, type:i [, newcount:i=1 [, newtype:i=0]]',
		run(P) {
			const c = Int(P.param());
			P.parse_comma(1);
			const newtype = Int(P.param());
			let newcount = 1;
			let newnewtype = 0;
			if (P.parse_comma(0)) {
				newcount = Int(P.param());
				if (P.parse_comma(0)) {
					newnewtype = Int(P.param());
				}
			}
			if (newnewtype === 0) {
				if (!(P.p_env_class === Cclass_item && P.p_env_event === 'use')) {
					// Quirk: an explicit 4th parameter of 0 also lands here ("3 or less parameters").
					P.parse_error(
						"'alteritem' only works in 'on:use'-events when it has got 3 or less parameters"
					);
					return;
				}
			}
			P.host.cmd_alteritem(P, c, newtype, newcount, newnewtype);
		}
	},
	{
		names: ['quit'],
		section: 'BASIC',
		line: 635,
		kind: 'host',
		returns: false,
		usage: '',
		run(P) {
			P.host.cmd_quit(P);
			P.jumptosemi = 0;
		}
	},
	{
		names: ['credits'],
		section: 'BASIC',
		line: 640,
		kind: 'host',
		returns: false,
		usage: '',
		run(P) {
			P.host.cmd_credits(P);
			P.jumptosemi = 0;
		}
	},
	{
		names: ['setpos', 'setat'],
		section: 'BASIC',
		line: 774,
		kind: 'host',
		returns: false,
		usage: '{"self" | class:s, id:i} {setpos: , x:s, y:s, z:s | setat: , class2:s, id2:i}',
		run(P) {
			const [classint, id] = classId(P);
			// Quirk: p_com$ is tested after class/id were read; a function call inside those
			// parameters has overwritten it, which turns a "setpos" into the setat branch.
			if (P.p_com === 'setpos') {
				P.parse_comma(1);
				const setpx = P.param();
				P.parse_comma(1);
				const setpy = P.param();
				P.parse_comma(1);
				const setpz = P.param();
				P.host.cmd_setpos(P, classint, id, setpx, setpy, setpz);
			} else {
				P.parse_comma(1);
				// Quirk: "self" is not resolved for the second class (class2 stays -1).
				const class2 = P.parse_getclass(P.param());
				P.parse_comma(1);
				const id2 = Int(P.param());
				P.host.cmd_setat(P, classint, id, class2, id2);
			}
		}
	},
	{
		names: ['setrot'],
		section: 'BASIC',
		line: 823,
		kind: 'host',
		returns: false,
		usage: '{"self" | class:s, id:i}, pitch:s, yaw:s, roll:s',
		run(P) {
			const [classint, id] = classId(P);
			P.parse_comma(1);
			const pitch = P.param();
			P.parse_comma(1);
			const yaw = P.param();
			P.parse_comma(1);
			const roll = P.param();
			// Quirk (host side): the camera follows only for unit id 1, not for g_player.
			P.host.cmd_setrot(P, classint, id, pitch, yaw, roll);
		}
	},
	{
		names: ['rpos'],
		section: 'BASIC',
		line: 887,
		kind: 'host',
		returns: false,
		usage: '{"self" | class:s, id:i}, x:s, y:s, z:s [, pitch:s, yaw:s, roll:s]',
		run(P) {
			const [classint, id] = classId(P);
			P.parse_comma(1);
			const setpx = P.param();
			P.parse_comma(1);
			const setpy = P.param();
			P.parse_comma(1);
			const setpz = P.param();
			// Quirk: without the optional group pitch/yaw/roll are "" (rotation 0,0,0, not the entity's own).
			let pitch = '';
			let yaw = '';
			let roll = '';
			if (P.parse_comma(0)) {
				pitch = P.param();
				P.parse_comma(1);
				yaw = P.param();
				P.parse_comma(1);
				roll = P.param();
			}
			P.host.cmd_rpos(P, classint, id, setpx, setpy, setpz, pitch, yaw, roll);
		}
	},
	{
		names: ['store'],
		section: 'BASIC',
		line: 940,
		kind: 'host',
		returns: true,
		usage: 'item:s, {"self" | class:s, id:i} [, mode:i=0]',
		run(P) {
			let idstring = P.param();
			if (idstring === 'self') {
				// Quirk: outside an item event "self" stays as text and becomes item id 0.
				if (P.p_env_class === Cclass_item) {
					idstring = istr(P.p_env_id);
				}
			}
			P.parse_comma(1);
			const [classint, id] = classId(P);
			let mode = 0;
			if (P.parse_comma(0)) {
				mode = Int(P.param());
			}
			// Quirks (host side, mode<>0): con_item(id) checks the container id, tmp_x/y/z are
			// filled but store_item is given the never assigned x#,y#,z# (0,0,0).
			const r = P.host.cmd_store(P, idstring, classint, id, mode);
			if (typeof r === 'string') P.p_return = r;
		}
	},
	{
		names: ['unstore'],
		section: 'BASIC',
		line: 981,
		kind: 'host',
		returns: true,
		usage: 'item:s [, count:i=1]',
		run(P) {
			let idstring = P.param();
			if (idstring === 'self') {
				if (P.p_env_class === Cclass_item) {
					idstring = istr(P.p_env_id);
				}
			}
			let count = 1;
			if (P.parse_comma(0)) {
				count = Int(P.param());
			}
			// Quirk (host side): p_return$ is only set when TCitem<>Null after unstore_item().
			const r = P.host.cmd_unstore(P, idstring, count);
			if (typeof r === 'string') P.p_return = r;
		}
	},
	{
		names: ['kill'],
		section: 'BASIC',
		line: 998,
		kind: 'host',
		returns: false,
		usage: 'unit:s',
		run(P) {
			let idstring = P.param();
			if (idstring === 'self') {
				// Quirk: outside a unit event "self" becomes Int("self") = 0.
				if (P.p_env_class === Cclass_unit) {
					idstring = istr(P.p_env_id);
				}
			}
			P.host.cmd_kill(P, Int(idstring));
		}
	},
	{
		names: ['damage'],
		section: 'BASIC',
		line: 1010,
		kind: 'host',
		returns: false,
		usage: '{"self" | class:s, id:i}, damage:f',
		run(P) {
			const [classint, id] = classId(P);
			P.parse_comma(1);
			const damage = Float(P.param());
			P.host.ha_damage(P, classint, id, damage);
		}
	},
	{
		names: ['heal', 'repair'],
		section: 'BASIC',
		line: 1025,
		kind: 'host',
		returns: false,
		usage: '{"self" | class:s, id:i}, amount:f',
		run(P) {
			const [classint, id] = classId(P);
			P.parse_comma(1);
			const damage = Float(P.param());
			P.host.ha_heal(P, classint, id, damage);
		}
	},
	{
		names: ['setcount', 'setamount'],
		section: 'BASIC',
		line: 1040,
		kind: 'host',
		returns: false,
		usage: 'item:s, count:i',
		run(P) {
			const cls = P.param();
			let id: number;
			if (cls === 'self') {
				// Quirk: p_env_id is used without checking that the environment is an item.
				id = P.p_env_id;
			} else {
				id = Int(cls);
			}
			P.parse_comma(1);
			const count = Int(P.param());
			// Quirk (host side): the error text says 'setcount' for setamount too.
			P.host.cmd_setcount(P, id, count);
		}
	},
	{
		names: ['ride', 'drive'],
		section: 'BASIC',
		line: 1062,
		kind: 'host',
		returns: false,
		usage: '[unit:i=self]',
		run(P) {
			let id: number;
			if (P.parse_param()) {
				id = Int(P.param());
			} else {
				// Quirk: p_env_id without checking that the environment is a unit.
				id = P.p_env_id;
			}
			P.host.cmd_ride(P, id);
		}
	},
	{
		names: ['getoff'],
		section: 'BASIC',
		line: 1085,
		kind: 'host',
		returns: false,
		usage: '',
		run(P) {
			P.host.cmd_getoff(P);
		}
	},
	{
		names: ['climate'],
		section: 'BASIC',
		line: 1092,
		kind: 'host',
		returns: false,
		usage: 'climate:s',
		run(P) {
			const newclimate = P.param();
			// Select on a string: the numeric Case values compare as text ("0", not "0.0" or "00").
			let climate: number;
			switch (newclimate) {
				case '0':
				case 'normal':
					climate = 0;
					break;
				case '1':
				case 'arctic':
					climate = 1;
					break;
				case '2':
				case 'sun':
					climate = 2;
					break;
				case '3':
				case 'rain':
					climate = 3;
					break;
				case '4':
				case 'snow':
					climate = 4;
					break;
				case '5':
				case 'thunder':
					climate = 5;
					break;
				default:
					P.parse_error("'" + newclimate + "' is no valid climate");
					return;
			}
			P.host.cmd_climate(P, climate);
		}
	},
	{
		names: ['weather'],
		section: 'BASIC',
		line: 1122,
		kind: 'host',
		returns: false,
		usage: 'weather:s',
		run(P) {
			// Quirk: the variable is newclimate$ here as well.
			const newclimate = P.param();
			let weather: number;
			switch (newclimate) {
				case '0':
				case 'sun':
					weather = 0;
					break;
				case '1':
				case 'rain':
					weather = 1;
					break;
				case '2':
				case 'snow':
					weather = 2;
					break;
				case '3':
				case 'thunder':
					weather = 3;
					break;
				default:
					P.parse_error("'" + newclimate + "' is no valid weather");
					return;
			}
			P.host.e_environment_setweather(P, weather);
		}
	},
	{
		names: ['rainratio'],
		section: 'BASIC',
		line: 1138,
		kind: 'host',
		returns: false,
		usage: 'ratio:i',
		run(P) {
			P.host.cmd_rainratio(P, Int(P.param()));
		}
	},
	{
		names: ['snowratio'],
		section: 'BASIC',
		line: 1142,
		kind: 'host',
		returns: false,
		usage: 'ratio:i',
		run(P) {
			P.host.cmd_snowratio(P, Int(P.param()));
		}
	}
];
