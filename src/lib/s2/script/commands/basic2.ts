/**
 * parse_commands() slice: parser_commands.bb lines 1191-2158
 * ("downloadfile" .. "find": the rest of BASIC and the whole PLAYER section).
 * timer / freetimers / timercount / exit live in the interpreter core.
 *
 * Blitz fixes the type of a local at its first appearance in the function.
 * parse_commands() declares x#, y#, z# (line 24/383), fval#, pr_spd#, pr_dmg#,
 * pr_drag# as floats and pitch$, yaw$ (line 834/836), class$, idstr$,
 * idstring$, unitidstr$, txt$, path$, server$, loc$, dbg1$, dbg2$ as strings.
 * So an untagged "x=param()" in this range is a FLOAT read and
 * "pitch=param()" a STRING read, while x2/y2/z2, id, typ, mode, offset, col,
 * r/g/b, f1/f2, count, range, p ... are ints.
 */
import type { CommandDef, ParseCtx } from '../api';
import { Float, Int, Left, Replace, Right, f2i, istr } from '../_helpers';
import { Cclass_item, Cclass_object, Cclass_unit } from '../host';

export interface Host {
	// --- queries -----------------------------------------------------------
	/** FileType(path$): 0 missing, 1 file, 2 directory. */
	FileType(path: string): number;
	/** parent_pos(class, id): 1 if the entity exists (and leaves its position in tmp_x#/tmp_y#/tmp_z#). */
	parent_pos(cls: number, id: number): number;

	// --- BASIC -------------------------------------------------------------
	/** tcp_loadfile(server$, path$, localfile$) */
	tcp_loadfile(P: ParseCtx, server: string, path: string, loc: string): void;
	/** tcp_callscript(server$, path$): leaves the downloaded script in pv_buffer$ (P.pv.buffer). */
	tcp_callscript(P: ParseCtx, server: string, path: string): void;
	/**
	 * spawntimer: daytimervalue given = set Tobject\daytimer, grow_object(), return the new daytimer
	 * (p_return$ stays "0" if the object does not exist). undefined = get: the original always ends
	 * with tmp_killspawntimer (if tmp_killclass/tmp_killid match) or parse_kill_get(Cclass_object,id,1).
	 */
	cmd_spawntimer(P: ParseCtx, id: number, daytimervalue: number | undefined): string | void;
	/** growtime: Dobject_growtime(typ) if typ>=0 And typ<=Cobject_count, else "0". */
	cmd_growtime(P: ParseCtx, typ: number): string | void;
	/** unitpath: up_setup(unitid), then up_addnode(unitid, node) for every node in order. */
	cmd_unitpath(P: ParseCtx, unitid: number, nodes: number[]): void;
	/** up_free(unit) */
	up_free(P: ParseCtx, unitid: number): void;
	/** wateralpha: EntityAlpha env_sea2, alpha# */
	cmd_wateralpha(P: ParseCtx, alpha: number): void;
	/** watertexture: return 0 if load_image(path$) failed (the handler then raises the parse_error). */
	cmd_watertexture(P: ParseCtx, path: string): number | void;
	/** terraintexture: return 0 if e_terraincm(path$,0) failed (non-"generate" paths only; the handler then raises the parse_error). */
	cmd_terraintexture(P: ParseCtx, path: string, grass: number): number | void;
	/** skytexture: map_skybox$=path$ and rebuild env_sky. */
	cmd_skytexture(P: ParseCtx, path: string): void;
	/** grass_colors(r, g, b) */
	grass_colors(P: ParseCtx, r: number, g: number, b: number): void;
	/** alterobject: if con_object(id), free_object + set_object(id,newtype,...) at the same place. */
	cmd_alterobject(P: ParseCtx, id: number, newtype: number): void;
	/** speech(file$, override, forceid) */
	speech(P: ParseCtx, file: string, override: number, id: number): void;
	/** revive: restore health / collision / AI of the unit. */
	cmd_revive(P: ParseCtx, unitid: number): void;
	/** dbugcmd(p1$, p2$) */
	dbugcmd(P: ParseCtx, dbg1: string, dbg2: string): void;
	/** freeze: id=0 all units, mode<2 freeze_unit(unit,mode), mode>=2 return Tunit\freeze. */
	cmd_freeze(P: ParseCtx, id: number, mode: number): string | void;
	/**
	 * intersect: class2/id2 undefined = ha_intersect(classint,id), else MeshesIntersect of both.
	 * The host raises parse_error("object", id2 | id) when parent_h() is 0.
	 */
	cmd_intersect(
		P: ParseCtx,
		classint: number,
		id: number,
		class2: number | undefined,
		id2: number | undefined
	): string | void;
	/** storage: mode 0 capacity, 1 capacity-maxweight, 2 maxweight (items: weight, mode ignored). */
	cmd_storage(P: ParseCtx, classint: number, id: number, mode: number): string | void;
	/**
	 * projectile. a/b/c depend on mode: 1 = classint, id, 0 (only called when parent_pos() succeeded);
	 * 2 = x2, y2, z2 (ints); 3 = pitch#, yaw#, 0; 4 = 0, 0, 0; 5 and 6 = lowdist (range+1), 0, 0.
	 * Not called for any other mode (the original does nothing).
	 */
	cmd_projectile(
		P: ParseCtx,
		typ: number,
		x: number,
		y: number,
		z: number,
		mode: number,
		a: number,
		b: number,
		c: number,
		offset: number,
		pr_wpn: number,
		pr_spd: number,
		pr_dmg: number,
		pr_drag: number
	): void;
	/** unit_loadani(typ, f1, f2): p_return$ text. */
	unit_loadani(P: ParseCtx, id: number, f1: number, f2: number): string | void;
	/** unit_scriptani(id, f1, f2, speed#, mode): p_return$ text. */
	unit_scriptani(
		P: ParseCtx,
		id: number,
		f1: number,
		f2: number,
		speed: number,
		mode: number
	): string | void;
	/** viewline(x1#,y1#,z1#,x2#,y2#,z2#): p_return$ text. */
	viewline(
		P: ParseCtx,
		x: number,
		y: number,
		z: number,
		x2: number,
		y2: number,
		z2: number
	): string | void;
	/** text3d: only if ha_type(classint,id)>0; txt$="" deletes an existing t3d (but creates an empty one if none exists). */
	cmd_text3d(
		P: ParseCtx,
		classint: number,
		id: number,
		txt: string,
		col: number,
		y: number,
		z: number
	): void;
	/** lensflares: set_flarefx=value */
	cmd_lensflares(P: ParseCtx, value: number): void;
	/** skycolor: in_skyoverride(0)=mode; r/g/b undefined = keep in_skyoverride(1..3); in_skyoverride(4)=mix; e_environment_update_light(). */
	cmd_skycolor(
		P: ParseCtx,
		mode: number,
		r: number | undefined,
		g: number | undefined,
		b: number | undefined,
		mix: number
	): void;
	/** behaviour: D<class>_behaviour(typ), classint is object/unit/item. The host raises parse_error("typerange", typ) when typ is outside 0..C<class>_count. */
	cmd_behaviour(P: ParseCtx, classint: number, typ: number): string | void;
	/** name: D<class>_name(typ), same range rule as cmd_behaviour. */
	cmd_name(P: ParseCtx, classint: number, typ: number): string | void;
	/** mkdir: CreateDir(path$); return "1" if FileType(path$)=2 afterwards. */
	cmd_mkdir(P: ParseCtx, path: string): string | void;
	/** ha_copychilds(class, id, vars, items, states, script, addtocache) */
	ha_copychilds(
		P: ParseCtx,
		classint: number,
		id: number,
		cvars: number,
		citems: number,
		cstates: number,
		cscript: number,
		addtocache: number
	): void;
	/** ha_pastechilds(class, id, vars, items, states, script) */
	ha_pastechilds(
		P: ParseCtx,
		classint: number,
		id: number,
		cvars: number,
		citems: number,
		cstates: number,
		cscript: number
	): void;

	// --- PLAYER ------------------------------------------------------------
	/** Dunit_speed#(1)=value */
	cmd_player_speed(P: ParseCtx, value: number): void;
	/** Dunit_damage#(1)=value */
	cmd_player_damage(P: ParseCtx, value: number): void;
	/** Dunit_attackrange(1)=value# (int array: the float is rounded on assignment) */
	cmd_player_attackrange(P: ParseCtx, value: number): void;
	/** Dunit_maxweight(1)=value# (int array: the float is rounded on assignment) */
	cmd_player_maxweight(P: ParseCtx, value: number): void;
	/** Dunit_mat(1)=get_material(name$) */
	cmd_player_mat(P: ParseCtx, name: string): void;
	/** game_weapon_bytype(typ) */
	game_weapon_bytype(P: ParseCtx, typ: number): void;
	/** game_ammo_bytype(typ) */
	game_ammo_bytype(P: ParseCtx, typ: number): void;
	/** game_jumptime=value (already rounded to int) */
	cmd_jumptime(P: ParseCtx, value: number): void;
	/** game_jumpfac#=value */
	cmd_jumpfactor(P: ParseCtx, value: number): void;
	/** playerspotted: "1" if an aggressive, living unit in ai_movetarget/ai_attack is within 300 of the camera. */
	cmd_playerspotted(P: ParseCtx): string | void;
	/**
	 * getplayervalue: 1 health#, 2 hunger#, 3 thirst#, 4 exhaustion#. Nothing if there is no player;
	 * otherwise the host raises parse_error("expect"," 1,2,3 or 4 as parameter for 'getplayervalue'") for any other typ.
	 */
	cmd_getplayervalue(P: ParseCtx, typ: number): string | void;
	/** game_target(range#=10000): range undefined = called without argument. */
	game_target(P: ParseCtx, range: number | undefined): void;
	/** tmp_tarx# / tmp_tary# / tmp_tarz# as float text. */
	cmd_targetx(P: ParseCtx): string | void;
	cmd_targety(P: ParseCtx): string | void;
	cmd_targetz(P: ParseCtx): string | void;
	/** tmp_tarclass / tmp_tarid as int text. */
	cmd_targetclass(P: ParseCtx): string | void;
	cmd_targetid(P: ParseCtx): string | void;
	/** EntityDistance(cam, target position) as float text. */
	cmd_targetdistance(P: ParseCtx): string | void;
	/** air: if g_dive<>0, g_airtimer+=p, capped at gt. */
	cmd_air(P: ParseCtx, p: number): void;
	/** game_sleep() */
	game_sleep(P: ParseCtx): void;
	/** find: set_item at the camera, store_item to the player, 2D effect, message, sound. */
	cmd_find(P: ParseCtx, typ: number, count: number): void;
}

/**
 * class$=param(): classint=parse_getclass(class$): "self"/"-1" -> environment
 * class and id, anything else -> required comma and id=param().
 */
function classId(P: ParseCtx): { cls: string; classint: number; id: number } {
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
	return { cls, classint, id };
}

/** "self" -> p_env_id, else Int(text). */
function selfId(P: ParseCtx, txt: string): number {
	return txt === 'self' ? P.p_env_id : Int(txt);
}

/** projectile: the nested optional weapon / speed / damage / drag tail (defaults 0, 1, 1, 0). */
function projectileTail(P: ParseCtx): [number, number, number, number] {
	let pr_wpn = 0;
	let pr_spd = 1;
	let pr_dmg = 1;
	let pr_drag = 0;
	if (P.parse_comma(0)) {
		pr_wpn = Int(P.param());
		if (P.parse_comma(0)) {
			pr_spd = Float(P.param());
			if (P.parse_comma(0)) {
				pr_dmg = Float(P.param());
				if (P.parse_comma(0)) {
					pr_drag = Float(P.param());
				}
			}
		}
	}
	return [pr_wpn, pr_spd, pr_dmg, pr_drag];
}

/** behaviour / name share their parameter reading and class dispatch. */
function typeInfo(P: ParseCtx, which: 'behaviour' | 'name'): void {
	P.p_return = '';
	const cls = P.param();
	// "self" gives -1 here and is NOT resolved: it falls into the wrongclass error below.
	const classint = P.parse_getclass(cls);
	P.parse_comma(1);
	const id = Int(P.param());
	if (classint === Cclass_object || classint === Cclass_unit || classint === Cclass_item) {
		const r =
			which === 'behaviour'
				? P.host.cmd_behaviour(P, classint, id)
				: P.host.cmd_name(P, classint, id);
		if (typeof r === 'string') P.p_return = r;
	} else {
		P.parse_error('wrongclass', cls);
	}
}

export const commands: CommandDef[] = [
	// ################################################# BASIC (continued)
	{
		names: ['downloadfile'],
		section: 'BASIC',
		line: 1192,
		kind: 'host',
		returns: false,
		usage: 'server:s, path:s, loc:s',
		run(P) {
			const server = P.param();
			P.parse_comma(1);
			const path = P.param();
			P.parse_comma(1);
			const loc = P.param();
			P.host.tcp_loadfile(P, server, path, loc);
		}
	},
	{
		names: ['callscript'],
		section: 'BASIC',
		line: 1201,
		kind: 'host',
		returns: false,
		usage: 'server:s, path:s [, execute:s]',
		run(P) {
			const server = P.param();
			P.parse_comma(1);
			const path = P.param();
			P.host.tcp_callscript(P, server, path);
			if (P.parse_comma(0)) {
				// param()=1 is a string compare: only the exact text "1" executes ("1.0", "01", " 1" do not).
				if (P.param() === '1') {
					P.parse_task(0, 0, 'download', 'script loaded with callscript', P.pv.buffer);
				}
			}
		}
	},
	{
		names: ['fileexists'],
		section: 'BASIC',
		line: 1213,
		kind: 'host',
		returns: true,
		usage: 'path:s',
		run(P) {
			const path = P.param();
			// Directories count as existing too (FileType 2).
			if ((P.host.FileType(path) ?? 0) !== 0) {
				P.p_return = '1';
			} else {
				P.p_return = '0';
			}
		}
	},
	{
		names: ['spawntimer'],
		section: 'BASIC',
		line: 1222,
		kind: 'host',
		returns: true,
		usage: 'id:s("self"|int) [, daytimervalue:i]',
		run(P) {
			P.p_return = '0';
			const idstring = P.param();
			const id = selfId(P, idstring);
			let daytimervalue: number | undefined;
			if (P.parse_comma(0)) {
				daytimervalue = Int(P.param());
			}
			// Quirk (host side): in "get" mode the Tobject\daytimer just found is always
			// overwritten by the kill-cache value (tmp_killspawntimer / parse_kill_get).
			const r = P.host.cmd_spawntimer(P, id, daytimervalue);
			if (typeof r === 'string') P.p_return = r;
		}
	},
	{
		names: ['growtime'],
		section: 'BASIC',
		line: 1259,
		kind: 'host',
		returns: true,
		usage: 'typ:i',
		run(P) {
			const id = Int(P.param());
			const r = P.host.cmd_growtime(P, id);
			if (typeof r === 'string') P.p_return = r;
		}
	},
	{
		names: ['unitpath'],
		section: 'BASIC',
		line: 1268,
		kind: 'host',
		returns: false,
		usage: 'unit:s("self"|int), node:i [, node:i]...',
		run(P) {
			const unitidstr = P.param();
			const unitid = selfId(P, unitidstr);
			// The original calls up_setup(unitid) here, before the nodes are read, and
			// up_addnode() after each node; the host gets them in one call.
			const nodes: number[] = [];
			P.parse_comma(1);
			nodes.push(Int(P.param()));
			while (P.parse_comma(0)) {
				nodes.push(Int(P.param()));
			}
			P.host.cmd_unitpath(P, unitid, nodes);
		}
	},
	{
		names: ['freeunitpath'],
		section: 'BASIC',
		line: 1285,
		kind: 'host',
		returns: false,
		usage: 'unit:i',
		run(P) {
			// No "self" here, unlike unitpath: "self" is Int("self") = 0.
			const unitid = Int(P.param());
			P.host.up_free(P, unitid);
		}
	},
	{
		names: ['wateralpha'],
		section: 'BASIC',
		line: 1290,
		kind: 'host',
		returns: false,
		usage: 'alpha:f',
		run(P) {
			P.host.cmd_wateralpha(P, Float(P.param()));
		}
	},
	{
		names: ['watertexture'],
		section: 'BASIC',
		line: 1294,
		kind: 'host',
		returns: false,
		usage: 'path:S',
		run(P) {
			const path = P.params();
			if (P.host.cmd_watertexture(P, path) === 0) {
				P.parse_error("unable to load water texture '" + path + "'");
			}
		}
	},
	{
		names: ['terraintexture'],
		section: 'BASIC',
		line: 1317,
		kind: 'host',
		returns: false,
		usage: 'path:S [, grass=1:i]',
		run(P) {
			const path = P.params();
			let grass = 1;
			if (P.parse_comma(0)) {
				grass = Int(P.param());
			}
			if (P.host.cmd_terraintexture(P, path, grass) === 0) {
				P.parse_error("unable to load terrain texture '" + path + "'");
			}
		}
	},
	{
		names: ['skytexture'],
		section: 'BASIC',
		line: 1368,
		kind: 'host',
		returns: false,
		usage: 'path:S',
		run(P) {
			const path = P.params();
			P.host.cmd_skytexture(P, path);
		}
	},
	{
		names: ['grasscolor'],
		section: 'BASIC',
		line: 1382,
		kind: 'host',
		returns: false,
		usage: 'r:i, g:i, b:i',
		run(P) {
			const r = Int(P.param());
			P.parse_comma();
			const g = Int(P.param());
			P.parse_comma();
			const b = Int(P.param());
			P.host.grass_colors(P, r, g, b);
		}
	},
	{
		names: ['alterobject'],
		section: 'BASIC',
		line: 1392,
		kind: 'host',
		returns: false,
		usage: 'id:s("self"|int), newtype:i',
		run(P) {
			let idstr = P.param();
			if (idstr === 'self') idstr = istr(P.p_env_id);
			P.parse_comma();
			const newtype = Int(P.param());
			P.host.cmd_alterobject(P, Int(idstr), newtype);
		}
	},
	{
		names: ['speech'],
		section: 'BASIC',
		line: 1420,
		kind: 'host',
		returns: false,
		usage: 'file:s [, override=0:i [, id=0:i]]',
		run(P) {
			const idstr = P.param();
			let override = 0;
			let id = 0;
			if (P.parse_comma(0)) {
				override = Int(P.param());
				if (P.parse_comma(0)) {
					id = Int(P.param());
				}
			}
			P.host.speech(P, idstr, override, id);
		}
	},
	{
		names: ['revive'],
		section: 'BASIC',
		line: 1433,
		kind: 'host',
		returns: false,
		usage: 'unit:s("self"|int)',
		run(P) {
			const unitidstr = P.param();
			const unitid = selfId(P, unitidstr);
			P.host.cmd_revive(P, unitid);
		}
	},
	{
		names: ['debug'],
		section: 'BASIC',
		line: 1466,
		kind: 'host',
		returns: false,
		usage: 'dbg1:s [, dbg2:s]',
		run(P) {
			const dbg1 = P.param();
			let dbg2 = '';
			if (P.parse_comma(0)) {
				dbg2 = P.param();
			}
			P.host.dbugcmd(P, dbg1, dbg2);
		}
	},
	{
		names: ['freeze'],
		section: 'BASIC',
		line: 1474,
		kind: 'host',
		returns: true,
		usage: '[id=0:s("self"|int) [, mode=1:i]]',
		run(P) {
			P.p_return = '0';
			let id = 0;
			let mode = 1;
			if (P.parse_param()) {
				const idstr = P.param();
				id = selfId(P, idstr);
				if (P.parse_comma(0)) {
					mode = Int(P.param());
				}
			}
			// Quirk (host side): with id=0 every unit is frozen with "mode" even when mode>=2 (no query).
			const r = P.host.cmd_freeze(P, id, mode);
			if (typeof r === 'string') P.p_return = r;
		}
	},
	{
		names: ['intersect'],
		section: 'BASIC',
		line: 1512,
		kind: 'host',
		returns: true,
		usage: 'class:s [, id:i] [, class2:s, id2:i]',
		run(P) {
			const { classint, id } = classId(P);
			if (P.parse_comma(0)) {
				// Quirk: class 2 is not self-resolved; "self" gives class2=-1 and an id is still required.
				const class2 = P.parse_getclass(P.param());
				P.parse_comma(1);
				const id2 = Int(P.param());
				P.p_return = '0';
				const r = P.host.cmd_intersect(P, classint, id, class2, id2);
				if (typeof r === 'string') P.p_return = r;
			} else {
				P.p_return = '0';
				const r = P.host.cmd_intersect(P, classint, id, undefined, undefined);
				if (typeof r === 'string') P.p_return = r;
			}
		}
	},
	{
		names: ['storage'],
		section: 'BASIC',
		line: 1548,
		kind: 'host',
		returns: true,
		usage: 'class:s [, id:i] [, mode=0:i]',
		run(P) {
			const { classint, id } = classId(P);
			let mode = 0;
			if (P.parse_comma(0)) {
				mode = Int(P.param());
			}
			P.p_return = '0';
			// Quirks (host side): items return Ditem_weight whatever the mode; a mode outside 0..2 leaves "0".
			const r = P.host.cmd_storage(P, classint, id, mode);
			if (typeof r === 'string') P.p_return = r;
		}
	},
	{
		names: ['projectile'],
		section: 'BASIC',
		line: 1595,
		kind: 'host',
		returns: false,
		usage:
			'typ:i, x:f, y:f, z:f, mode:i {1: , class:s [, id:i] [, offset:i] [, wpn:i [, spd:f [, dmg:f [, drag:f]]]] | 2: , x2:i, y2:i, z2:i [, offset:i] [, wpn:i [, spd:f [, dmg:f [, drag:f]]]] | 3: , pitch:s, yaw:s [, offset:i] [, wpn ...] | 4: [, offset:i] [, wpn ...] | 5,6: , range:i [, offset:i] [, wpn ...]}',
		run(P) {
			const typ = Int(P.param());
			P.parse_comma(1);
			// x, y, z are the function's float locals x#, y#, z#.
			const x = Float(P.param());
			P.parse_comma(1);
			const y = Float(P.param());
			P.parse_comma(1);
			const z = Float(P.param());
			P.parse_comma(1);
			const mode = Int(P.param());
			let offset = 0;
			switch (mode) {
				case 1: {
					// Target object
					P.parse_comma(1);
					const { classint, id } = classId(P);
					if (P.parse_comma(0)) {
						offset = Int(P.param());
					}
					// Quirk: the weapon/speed/damage/drag tail is only read when the target exists;
					// otherwise it is left unread (the following parse_semi then complains) and nothing is fired.
					if (P.host.parent_pos(classint, id) ?? 0) {
						const [w, s, d, g] = projectileTail(P);
						P.host.cmd_projectile(P, typ, x, y, z, mode, classint, id, 0, offset, w, s, d, g);
					}
					break;
				}
				case 2: {
					// Target position. Quirk: x2/y2/z2 are int locals, the target is rounded to whole units.
					P.parse_comma(1);
					const x2 = Int(P.param());
					P.parse_comma(1);
					const y2 = Int(P.param());
					P.parse_comma(1);
					const z2 = Int(P.param());
					if (P.parse_comma(0)) {
						offset = Int(P.param());
					}
					const [w, s, d, g] = projectileTail(P);
					P.host.cmd_projectile(P, typ, x, y, z, mode, x2, y2, z2, offset, w, s, d, g);
					break;
				}
				case 3: {
					// Direction. Quirk: pitch/yaw are the function's STRING locals pitch$/yaw$
					// (declared by an earlier Case); they become floats when passed to pro_add_script.
					P.parse_comma(1);
					const pitch = P.param();
					P.parse_comma(1);
					const yaw = P.param();
					if (P.parse_comma(0)) {
						offset = Int(P.param());
					}
					const [w, s, d, g] = projectileTail(P);
					P.host.cmd_projectile(
						P,
						typ,
						x,
						y,
						z,
						mode,
						Float(pitch),
						Float(yaw),
						0,
						offset,
						w,
						s,
						d,
						g
					);
					break;
				}
				case 4: {
					// Target player. Quirk (host side): without a player the pivot is never placed, so pitch=yaw=0.
					if (P.parse_comma(0)) {
						offset = Int(P.param());
					}
					const [w, s, d, g] = projectileTail(P);
					P.host.cmd_projectile(P, typ, x, y, z, mode, 0, 0, 0, offset, w, s, d, g);
					break;
				}
				case 5:
				case 6: {
					// Nearest unit (5) / nearest aggressive, untamed unit (6) within range.
					// Quirk (host side): lowdist is an int, each closer distance found is rounded.
					P.parse_comma();
					const lowdist = Int(P.param()) + 1;
					if (P.parse_comma(0)) {
						offset = Int(P.param());
					}
					const [w, s, d, g] = projectileTail(P);
					P.host.cmd_projectile(P, typ, x, y, z, mode, lowdist, 0, 0, offset, w, s, d, g);
					break;
				}
				// Any other mode: nothing is read and nothing happens.
			}
		}
	},
	{
		names: ['loadani'],
		section: 'BASIC',
		line: 1809,
		kind: 'host',
		returns: true,
		usage: 'typ:i, f1:i, f2:i',
		run(P) {
			const id = Int(P.param());
			P.parse_comma(1);
			const f1 = Int(P.param());
			P.parse_comma(1);
			const f2 = Int(P.param());
			const r = P.host.unit_loadani(P, id, f1, f2);
			if (typeof r === 'string') P.p_return = r;
		}
	},
	{
		names: ['animate'],
		section: 'BASIC',
		line: 1818,
		kind: 'host',
		returns: true,
		usage: 'id:i, f1:i, f2:i, speed:f [, mode=3:i]',
		run(P) {
			const id = Int(P.param());
			P.parse_comma(1);
			const f1 = Int(P.param());
			P.parse_comma(1);
			const f2 = Int(P.param());
			P.parse_comma(1);
			const fval = Float(P.param());
			let mode = 3;
			if (P.parse_comma(0)) {
				mode = Int(P.param());
			}
			const r = P.host.unit_scriptani(P, id, f1, f2, fval, mode);
			if (typeof r === 'string') P.p_return = r;
		}
	},
	{
		names: ['viewline'],
		section: 'BASIC',
		line: 1833,
		kind: 'host',
		returns: true,
		usage: 'x:f, y:f, z:f, x2:i, y2:i, z2:i',
		run(P) {
			const x = Float(P.param());
			P.parse_comma(1);
			const y = Float(P.param());
			P.parse_comma(1);
			const z = Float(P.param());
			P.parse_comma(); // written "parse_comma" without parentheses: same call, error=1
			// Quirk: the first point is float (x#, y#, z#), the second one int (x2, y2, z2 are untyped locals).
			const x2 = Int(P.param());
			P.parse_comma(1);
			const y2 = Int(P.param());
			P.parse_comma(1);
			const z2 = Int(P.param());
			// Written "p_return=" without the $: still the global string p_return$.
			const r = P.host.viewline(P, x, y, z, x2, y2, z2);
			if (typeof r === 'string') P.p_return = r;
		}
	},
	{
		names: ['text3d'],
		section: 'BASIC',
		line: 1848,
		kind: 'host',
		returns: false,
		usage: 'class:s [, id:i], txt:s [, col=0:i] [, offset=0:f] [, range=300:f]',
		run(P) {
			const cls = P.param();
			let classint = P.parse_getclass(cls);
			let col = 0;
			let y = 0; // y#, z# are float locals; t3d\offset / t3d\range convert on assignment (host side)
			let z = 300;
			let id: number;
			if (classint === -1) {
				classint = P.p_env_class;
				id = P.p_env_id;
			} else {
				P.parse_comma(1);
				id = Int(P.param());
			}
			P.parse_comma();
			const txt = P.param();
			// Three independent optional reads (not nested).
			if (P.parse_comma(0)) col = Int(P.param());
			if (P.parse_comma(0)) y = Float(P.param());
			if (P.parse_comma(0)) z = Float(P.param());
			P.host.cmd_text3d(P, classint, id, txt, col, y, z);
		}
	},
	{
		names: ['lensflares'],
		section: 'BASIC',
		line: 1896,
		kind: 'host',
		returns: false,
		usage: 'value:i',
		run(P) {
			P.host.cmd_lensflares(P, Int(P.param()));
		}
	},
	{
		names: ['skycolor'],
		section: 'BASIC',
		line: 1900,
		kind: 'host',
		returns: false,
		usage: 'mode:i [, r:i, g:i, b:i [, mix=0:i]]',
		run(P) {
			let mix = 0;
			const mode = Int(P.param());
			let r: number | undefined;
			let g: number | undefined;
			let b: number | undefined;
			if (P.parse_comma(0)) {
				r = Int(P.param());
				P.parse_comma();
				g = Int(P.param());
				P.parse_comma();
				b = Int(P.param());
				if (P.parse_comma(0)) {
					mix = Int(P.param());
				}
			}
			// Quirk: without r,g,b the previous in_skyoverride(1..3) stay, only the mix is reset to 0.
			P.host.cmd_skycolor(P, mode, r, g, b, mix);
		}
	},
	{
		names: ['behaviour'],
		section: 'BASIC',
		line: 1916,
		kind: 'host',
		returns: true,
		usage: 'class:s, typ:i',
		run(P) {
			typeInfo(P, 'behaviour');
		}
	},
	{
		names: ['name'],
		section: 'BASIC',
		line: 1945,
		kind: 'host',
		returns: true,
		usage: 'class:s, typ:i',
		run(P) {
			typeInfo(P, 'name');
		}
	},
	{
		names: ['mkdir'],
		section: 'BASIC',
		line: 1974,
		kind: 'host',
		returns: true,
		usage: 'path:s',
		run(P) {
			let cls = P.param(); // the path is kept in class$
			P.p_return = '0';
			cls = Replace(cls, '/', '\\');
			if (Right(cls, 1) === '\\') cls = Left(cls, cls.length - 1);
			// Returns 1 also when the directory already existed.
			const r = P.host.cmd_mkdir(P, cls);
			if (typeof r === 'string') P.p_return = r;
		}
	},
	{
		names: ['copychilds', 'copychildren'],
		section: 'BASIC',
		line: 1985,
		kind: 'host',
		returns: false,
		usage:
			'class:s [, id:i] [, vars=1:i] [, items=1:i] [, states=1:i] [, script=0:i] [, addtocache=0:i]',
		run(P) {
			const { classint, id } = classId(P);
			let cvars = 1;
			let citems = 1;
			let cstates = 1;
			let cscript = 0;
			let addtocache = 0;
			// Independent optional reads (not nested).
			if (P.parse_comma(0)) cvars = Int(P.param());
			if (P.parse_comma(0)) citems = Int(P.param());
			if (P.parse_comma(0)) cstates = Int(P.param());
			if (P.parse_comma(0)) cscript = Int(P.param());
			if (P.parse_comma(0)) addtocache = Int(P.param());
			P.host.ha_copychilds(P, classint, id, cvars, citems, cstates, cscript, addtocache);
		}
	},
	{
		names: ['pastechilds', 'pastechildren'],
		section: 'BASIC',
		line: 2008,
		kind: 'host',
		returns: false,
		usage: 'class:s [, id:i] [, vars=1:i] [, items=1:i] [, states=1:i] [, script=0:i]',
		run(P) {
			const { classint, id } = classId(P);
			let cvars = 1;
			let citems = 1;
			let cstates = 1;
			let cscript = 0;
			if (P.parse_comma(0)) cvars = Int(P.param());
			if (P.parse_comma(0)) citems = Int(P.param());
			if (P.parse_comma(0)) cstates = Int(P.param());
			if (P.parse_comma(0)) cscript = Int(P.param());
			P.host.ha_pastechilds(P, classint, id, cvars, citems, cstates, cscript);
		}
	},

	// ################################################# PLAYER
	{
		names: ['player_speed'],
		section: 'PLAYER',
		line: 2031,
		kind: 'host',
		returns: false,
		usage: 'value:f',
		run(P) {
			const fval = Float(P.param());
			P.host.cmd_player_speed(P, fval);
		}
	},
	{
		names: ['player_damage'],
		section: 'PLAYER',
		line: 2036,
		kind: 'host',
		returns: false,
		usage: 'value:f',
		run(P) {
			const fval = Float(P.param());
			P.host.cmd_player_damage(P, fval);
		}
	},
	{
		names: ['player_attackrange'],
		section: 'PLAYER',
		line: 2041,
		kind: 'host',
		returns: false,
		usage: 'value:f',
		run(P) {
			const fval = Float(P.param());
			// Quirk (host side): Dunit_attackrange is an int array, the float is rounded.
			P.host.cmd_player_attackrange(P, fval);
		}
	},
	{
		names: ['player_maxweight'],
		section: 'PLAYER',
		line: 2046,
		kind: 'host',
		returns: false,
		usage: 'value:f',
		run(P) {
			const fval = Float(P.param());
			// Quirk (host side): Dunit_maxweight is an int array, the float is rounded.
			P.host.cmd_player_maxweight(P, fval);
		}
	},
	{
		names: ['player_mat'],
		section: 'PLAYER',
		line: 2051,
		kind: 'host',
		returns: false,
		usage: 'material:s',
		run(P) {
			P.host.cmd_player_mat(P, P.param());
		}
	},
	{
		names: ['player_weapon'],
		section: 'PLAYER',
		line: 2055,
		kind: 'host',
		returns: false,
		usage: 'typ:i',
		run(P) {
			const typ = Int(P.param());
			P.host.game_weapon_bytype(P, typ);
		}
	},
	{
		names: ['player_ammo'],
		section: 'PLAYER',
		line: 2060,
		kind: 'host',
		returns: false,
		usage: 'typ:i',
		run(P) {
			const typ = Int(P.param());
			P.host.game_ammo_bytype(P, typ);
		}
	},
	{
		names: ['jumptime'],
		section: 'PLAYER',
		line: 2065,
		kind: 'host',
		returns: false,
		usage: 'value:f',
		run(P) {
			const fval = Float(P.param());
			// game_jumptime=Int(fval#): read as float, then rounded to nearest (not truncated).
			P.host.cmd_jumptime(P, f2i(fval));
		}
	},
	{
		names: ['jumpfactor'],
		section: 'PLAYER',
		line: 2070,
		kind: 'host',
		returns: false,
		usage: 'value:f',
		run(P) {
			const fval = Float(P.param());
			P.host.cmd_jumpfactor(P, fval);
		}
	},
	{
		names: ['playerspotted'],
		section: 'PLAYER',
		line: 2075,
		kind: 'host',
		returns: true,
		usage: '',
		run(P) {
			P.p_return = '0';
			const r = P.host.cmd_playerspotted(P);
			if (typeof r === 'string') P.p_return = r;
		}
	},
	{
		names: ['getplayervalue'],
		section: 'PLAYER',
		line: 2091,
		kind: 'host',
		returns: true,
		usage: 'typ:i',
		run(P) {
			const typ = Int(P.param());
			// Quirk (host side): the "expect 1,2,3 or 4" error is only raised while a player exists.
			const r = P.host.cmd_getplayervalue(P, typ);
			if (typeof r === 'string') P.p_return = r;
		}
	},
	{
		names: ['scantarget'],
		section: 'PLAYER',
		line: 2104,
		kind: 'host',
		returns: false,
		usage: '[range:i]',
		run(P) {
			if (P.parse_param()) {
				// range is an int local although game_target() takes a float.
				const range = Int(P.param());
				P.host.game_target(P, range);
			} else {
				P.host.game_target(P, undefined);
			}
		}
	},
	{
		names: ['targetx'],
		section: 'PLAYER',
		line: 2113,
		kind: 'host',
		returns: true,
		usage: '',
		run(P) {
			const r = P.host.cmd_targetx(P);
			if (typeof r === 'string') P.p_return = r;
		}
	},
	{
		names: ['targety'],
		section: 'PLAYER',
		line: 2114,
		kind: 'host',
		returns: true,
		usage: '',
		run(P) {
			const r = P.host.cmd_targety(P);
			if (typeof r === 'string') P.p_return = r;
		}
	},
	{
		names: ['targetz'],
		section: 'PLAYER',
		line: 2115,
		kind: 'host',
		returns: true,
		usage: '',
		run(P) {
			const r = P.host.cmd_targetz(P);
			if (typeof r === 'string') P.p_return = r;
		}
	},
	{
		names: ['targetclass'],
		section: 'PLAYER',
		line: 2118,
		kind: 'host',
		returns: true,
		usage: '',
		run(P) {
			const r = P.host.cmd_targetclass(P);
			if (typeof r === 'string') P.p_return = r;
		}
	},
	{
		names: ['targetid'],
		section: 'PLAYER',
		line: 2122,
		kind: 'host',
		returns: true,
		usage: '',
		run(P) {
			const r = P.host.cmd_targetid(P);
			if (typeof r === 'string') P.p_return = r;
		}
	},
	{
		names: ['targetdistance'],
		section: 'PLAYER',
		line: 2126,
		kind: 'host',
		returns: true,
		usage: '',
		run(P) {
			const r = P.host.cmd_targetdistance(P);
			if (typeof r === 'string') P.p_return = r;
		}
	},
	{
		names: ['air'],
		section: 'PLAYER',
		line: 2133,
		kind: 'host',
		returns: false,
		usage: 'p:i',
		run(P) {
			const p = Int(P.param());
			P.host.cmd_air(P, p);
		}
	},
	{
		names: ['sleep'],
		section: 'PLAYER',
		line: 2143,
		kind: 'host',
		returns: false,
		usage: '',
		run(P) {
			P.host.game_sleep(P);
		}
	},
	{
		names: ['find'],
		section: 'PLAYER',
		line: 2147,
		kind: 'host',
		returns: false,
		usage: 'typ:i [, count=1:i]',
		run(P) {
			const typ = Int(P.param());
			let count = 1;
			if (P.parse_comma(0)) {
				count = Int(P.param());
			}
			P.host.cmd_find(P, typ, count);
		}
	}
];
