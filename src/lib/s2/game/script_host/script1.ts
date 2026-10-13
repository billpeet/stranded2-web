/**
 * ScriptHost, part "script1": the game side of the script commands of
 * script/commands/basic1.ts and basic2.ts, i.e. the Case blocks of
 * parse_commands() in parser_commands.bb lines 18-2157 (section BASIC and
 * section PLAYER).
 *
 * Each method is the rest of the original Case block after the parameters
 * were read by the handler. Locals keep the names and Blitz types they have
 * in parse_commands() (types are fixed by the first appearance in that
 * function: x#, y#, z#, xpos#, zpos#, height#, value#, damage#, fval#,
 * pr_spd#, pr_dmg#, pr_drag#, xp#, zp#, yawrot# are Floats; setpx$, setpy$,
 * setpz$, pitch$, yaw$, roll$, idstring$, path$ are Strings; everything else
 * is an Int).
 *
 * Methods are synchronous. Commands whose original blocks inside a modal
 * window or a load screen (exec, quit, credits, terraintexture) and the two
 * asynchronous methods of the environment layer (watertexture, skytexture)
 * are started with defer() (flow.ts): they run when the script has returned
 * to the main loop.
 */
import { Abs, Float, Instr, Int, Left, Len, Mid, Rand, SEP_LINE, Str, f32, idivConst } from '../../blitz';
import {
	Animate,
	CreatePivot,
	EntityAlpha,
	EntityDistance,
	EntityPickMode,
	EntityPitch,
	EntityRadius,
	EntityRoll,
	EntityType,
	EntityX,
	EntityY,
	EntityYaw,
	EntityZ,
	FreeEntity,
	MeshesIntersect,
	ModifyTerrain,
	MoveEntity,
	PointEntity,
	PositionEntity,
	RotateEntity,
	TerrainHeight,
	TextureBuffer,
	TextureHeight,
	TextureWidth,
	type Handle
} from '../../bb3d';
import { BackBuffer, ColorBlue, ColorGreen, ColorRed, DrawBlock, FreeImage, GetColor, ImageHeight, ImageWidth, ResizeImage, SetBuffer } from '../../gfx2d';
import type { ParseCtx } from '../../script/api';
import type { ScriptHost } from '../../script/host';
import { ai_agressive, ai_ini, ai_mode } from '../ai_units';
import { con_add, con_enter } from '../console';
import {
	Cbmpf_green,
	Cbmpf_red,
	Cbmpf_yellow,
	Cclass_info,
	Cclass_item,
	Cclass_object,
	Cclass_unit,
	Cmenu_credits,
	Cmenu_if_items,
	Cpm_out,
	Cstate_tame,
	Cworld_size,
	ai_attack,
	ai_idle,
	ai_movetarget
} from '../consts';
import { dbugcmd } from '../debug';
import {
	Dinfo_script,
	Dinfo_scriptk,
	Ditem_behaviour,
	Ditem_health,
	Ditem_iconh,
	Ditem_name,
	Ditem_script,
	Ditem_scriptk,
	Ditem_weight,
	Dobject_behaviour,
	Dobject_growtime,
	Dobject_maxweight,
	Dobject_name,
	Dobject_script,
	Dobject_scriptk,
	Dunit_attackrange,
	Dunit_behaviour,
	Dunit_col,
	Dunit_colxr,
	Dunit_colyr,
	Dunit_damage,
	Dunit_health,
	Dunit_mat,
	Dunit_maxweight,
	Dunit_name,
	Dunit_script,
	Dunit_scriptk,
	Dunit_speed
} from '../defs_arrays';
import { e_environment_setweather, e_environment_update_light, e_tercol, e_terraincm, e_terrainground, e_tery } from '../e_environment';
import { editor_gencolormap } from '../editor_functions';
import { CreateDir, FileType } from '../files';
import { defer } from '../flow';
import { cachedata, split, viewline } from '../functions';
import { game_ammo_bytype, game_sleep, game_target, game_weapon_bytype } from '../game_functions';
import { game_input_vehicledata } from '../game_input_vehicles';
import { grass_colors, grass_heightmap, grass_map } from '../grasspread';
import { gui_msgdecide } from '../gui';
import { ha_copychilds, ha_damage, ha_setpos, ha_heal, ha_intersect, ha_pastechilds, ha_type } from '../handle_all';
import { set_info } from '../handle_infos';
import { capacity, con_item, free_item, set_item, store_item, unstore_item } from '../handle_items';
import { con_object, free_object, grow_object, object_spawnpos, set_object } from '../handle_objects';
import { get_state } from '../handle_states';
import { con_unit, freeze_unit, kill_unit, set_unit, unit_loadani, unit_scriptani, unit_values } from '../handle_units';
import { if_msg } from '../interface';
import { load_image } from '../load_functions';
import { get_material } from '../load_materials';
import { sm, ss } from '../load_strings';
import { menu_set, menu_start } from '../menu';
import { parent_h, parent_pos } from '../parentchild';
import { parse_kill_get, parse_task, set_parsecache } from '../parser_functions';
import { p_add2d, p_combine, p_pixelizeeat } from '../particles';
import { pro_add_script } from '../projectiles';
import { randomcreate } from '../randommap';
import { RT, hasRuntime } from '../rt';
import { sfx, sfx_emit } from '../sfx';
import { speech } from '../speech';
import { G } from '../state';
import { ExecFile } from '../sys';
import { tcp_callscript, tcp_loadfile } from '../tcpcommands';
import { After, Delete, First, New, T3d, Tfrap, Tin_quicksave, Tinfo, Titem, Tobject, Tunit, isNull } from '../types';
import { up_addnode, up_free, up_setup } from '../unitpath';

/**
 * Case "setpos","setat", parser_commands.bb lines 798-820: the part both
 * branches share (the handler calls cmd_setpos or cmd_setat for the branch
 * before it).
 */
function setpos_setat(P: ParseCtx, classint: number, id: number, setpx: string, setpy: string, setpz: string): void {
	let setph: Handle = null;
	let Titem_: Titem | null = null;
	setph = parent_h(classint, id);
	if (setph !== null) {
		if (setpx === 'self') setpx = Str(EntityX(setph), 'float');
		if (setpy === 'self') setpy = Str(EntityY(setph), 'float');
		if (setpz === 'self') setpz = Str(EntityZ(setph), 'float');
		//Setpos
		if (classint === Cclass_item) {
			//Items can only set to a position if they are not stored inside sth.
			for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
				if (Titem_.id === id) {
					if (Titem_.parent_class === 0 || Titem_.parent_mode === Cpm_out) {
						ha_setpos(setph, classint, id, setpx, setpy, setpz);
					}
					break;
				}
			}
		} else {
			//Everything als can be set to any position anytime
			ha_setpos(setph, classint, id, setpx, setpy, setpz);
		}
	} else {
		P.parse_error('object', id);
	}
}

export const host: Partial<ScriptHost> = {
	// =====================================================================================
	// queries of the handlers
	// =====================================================================================

	/** FileType(path$) */
	FileType(path) {
		return FileType(path);
	},

	/** parent_pos(parentclass,parentid): fills tmp_x#/tmp_y#/tmp_z# */
	parent_pos(cls, id) {
		return parent_pos(cls, id);
	},

	// =====================================================================================
	//################################################# BASIC
	// =====================================================================================

	/** Case "terrain" (parser_commands.bb:18) */
	cmd_terrain(_P, xpos, zpos, mode, height) {
		let x = 0;
		let z = 0;
		x = f32(f32(xpos + idivConst(G.ter_size, 2) * Cworld_size) / Cworld_size);
		z = f32(f32(zpos + idivConst(G.ter_size, 2) * Cworld_size) / Cworld_size);
		switch (mode) {
			case 0: //Get Height
				return Str(f32(TerrainHeight(G.ter, x, z) * 100), 'float');
			case 1: //Set Height
				ModifyTerrain(G.ter, x, z, f32(height / 100));
				break;
			case 2: //Modify Height
				height = f32(f32(TerrainHeight(G.ter, x, z) * 100) + height);
				if (height < 0) height = 0;
				// quirk: a height above 1000 becomes 100, not 1000
				if (height > 1000) height = 100;
				ModifyTerrain(G.ter, x, z, f32(height / 100));
				break;
			case 3: //Terrain Matrix X
				return Str(Int(x));
			case 4: //Terrain Matrix Z
				return Str(Int(z));
		}
	},

	/** Case "compass" (parser_commands.bb:46) */
	cmd_compass(_P, value) {
		G.in_compass = value;
	},

	/** Case "eat","drink","consume" (parser_commands.bb:50), lines 51-71: before the parameters */
	cmd_eat_fx(_P, com) {
		//FX
		switch (com) {
			case 'eat':
				sfx_emit(G.sfx_eat, G.cam);
				if (G.m_menu === Cmenu_if_items) {
					if (Ditem_iconh(G.tmp_iseltyp) !== 0) {
						p_pixelizeeat(G.tmp_iselx, G.tmp_isely, Ditem_iconh(G.tmp_iseltyp), 0, 1, 0);
					}
				}
				break;
			case 'drink':
				sfx_emit(G.sfx_drink, G.cam);
				if (G.m_menu === Cmenu_if_items) {
					if (Ditem_iconh(G.tmp_iseltyp) !== 0) {
						p_pixelizeeat(G.tmp_iselx, G.tmp_isely, Ditem_iconh(G.tmp_iseltyp), 0, 1, 1);
					}
				}
				break;
		}
		//Decrease Item Count
		if (G.p_env_class === Cclass_item) {
			free_item(G.p_env_id, 1);
		}
	},

	/** Case "eat","drink","consume" (parser_commands.bb:50), lines 80-86: after the parameters */
	cmd_eat(_P, cunit, chealth, chunger, cthirst, cexhaustion) {
		if (con_unit(cunit)) {
			G.TCunit!.health = f32(G.TCunit!.health + chealth);
			G.TCunit!.hunger = f32(G.TCunit!.hunger - chunger);
			G.TCunit!.thirst = f32(G.TCunit!.thirst - cthirst);
			G.TCunit!.exhaustion = f32(G.TCunit!.exhaustion - cexhaustion);
			unit_values();
		}
	},

	/** Case "fry" (parser_commands.bb:90) */
	cmd_fry(_P) {
		sfx(G.sfx_fizzle);
		if (G.m_menu === Cmenu_if_items) {
			if (Ditem_iconh(G.tmp_iseltyp) !== 0) {
				p_pixelizeeat(G.tmp_iselx, G.tmp_isely, Ditem_iconh(G.tmp_iseltyp), 1, 1, 0);
			}
		}
	},

	/** Case "maxhealth" (parser_commands.bb:99); p_return$ is "0" before the call */
	cmd_maxhealth(_P, classint, id, value) {
		let Tunit_: Tunit | null = null;
		let Tobject_: Tobject | null = null;
		let Titem_: Titem | null = null;
		switch (classint) {
			case Cclass_unit:
				for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
					if (Tunit_.id === id) {
						Tunit_.health_max = f32(Tunit_.health_max + value);
						if (Tunit_.health_max < 0) Tunit_.health_max = 0;
						if (Tunit_.health > Tunit_.health_max) Tunit_.health = Tunit_.health_max;
						return Str(Tunit_.health_max, 'float');
					}
				}
				break;
			case Cclass_object:
				for (Tobject_ = First(Tobject); Tobject_ !== null; Tobject_ = After(Tobject, Tobject_)) {
					if (Tobject_.id === id) {
						Tobject_.health_max = f32(Tobject_.health_max + value);
						if (Tobject_.health_max < 0) Tobject_.health_max = 0;
						if (Tobject_.health > Tobject_.health_max) Tobject_.health = Tobject_.health_max;
						return Str(Tobject_.health_max, 'float');
					}
				}
				break;
			case Cclass_item:
				for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
					if (Titem_.id === id) {
						return Str(Ditem_health(Titem_.typ), 'float');
					}
				}
				break;
		}
	},

	/** Case "jade" (parser_commands.bb:145) */
	cmd_jade(_P, cvalue) {
		if (con_unit(G.g_player)) {
			G.TCunit!.hunger = f32(G.TCunit!.hunger + cvalue);
			G.TCunit!.thirst = f32(G.TCunit!.thirst + cvalue);
			G.TCunit!.exhaustion = f32(G.TCunit!.exhaustion + cvalue);
			unit_values();
		}
	},

	/** Case "con" (parser_commands.bb:155) */
	cmd_con(_P, in_conin) {
		G.in_conin = in_conin;
		con_enter();
	},

	/** Case "exec" (parser_commands.bb:160) */
	cmd_exec(_P, exec) {
		// deferred: gui_msgdecide is a modal window (the script continues before the question is answered)
		defer(async () => {
			if (await gui_msgdecide("Execute '" + exec + "'?", Cbmpf_yellow)) {
				con_add("Executing '" + exec + "' ...", Cbmpf_yellow);
				ExecFile(exec);
			} else {
				con_add("Permission denied to execute '" + exec + "'.", Cbmpf_red);
			}
		});
	},

	/** Case "create" (parser_commands.bb:289); p_return$ is "0" before the call */
	cmd_create(_P, classint, typ, xpos, zpos, count) {
		if (xpos === undefined || zpos === undefined) {
			// (a script without a player crashes here, as in the original: g_cplayer is Null)
			xpos = EntityX(G.g_cplayer!.h);
			zpos = EntityZ(G.g_cplayer!.h);
		}
		switch (classint) {
			case Cclass_object:
				set_object(-1, typ, xpos, zpos);
				if (!isNull(Tobject, G.TCobject)) {
					return Str(G.TCobject!.id);
				}
				break;
			case Cclass_unit:
				set_unit(-1, typ, xpos, zpos);
				if (!isNull(Tunit, G.TCunit)) {
					const p_return = Str(G.TCunit!.id);
					ai_ini();
					return p_return;
				}
				break;
			case Cclass_item:
				set_item(-1, typ, xpos, e_tery(xpos, zpos), zpos, count);
				if (!isNull(Titem, G.TCitem)) {
					return Str(G.TCitem!.id);
				}
				break;
			case Cclass_info:
				set_info(-1, typ, xpos, e_tery(xpos, zpos), zpos);
				if (!isNull(Tinfo, G.TCinfo)) {
					return Str(G.TCinfo!.id);
				}
				break;
		}
	},

	/** Case "randomcreate" (parser_commands.bb:334) */
	randomcreate(_P, classint, typ, xpos, zpos, count) {
		//Create
		return Str(randomcreate(classint, typ, xpos, zpos, count));
	},

	/** Case "areal_event" (parser_commands.bb:378) */
	cmd_areal_event(_P, event, x, y, z, range, eventlimit) {
		let tempp: Handle = null;
		let skip = 0;
		let c = 0;
		let Tobject_: Tobject | null = null;
		let Tunit_: Tunit | null = null;
		let Titem_: Titem | null = null;
		let Tinfo_: Tinfo | null = null;
		tempp = CreatePivot();
		PositionEntity(tempp, x, y, z);
		skip = 0;
		c = 0;
		//Objects
		for (Tobject_ = First(Tobject); Tobject_ !== null; Tobject_ = After(Tobject, Tobject_)) {
			if (EntityDistance(Tobject_.h, tempp) < range) {
				skip = set_parsecache(Cclass_object, Tobject_.id, event);
				if (Instr(Dobject_scriptk(Tobject_.typ), SEP_LINE + event)) {
					parse_task(Cclass_object, Tobject_.id, event, '', Dobject_script(Tobject_.typ));
					skip = 1;
				}
				if (skip) {
					c = c + 1;
					if (c >= eventlimit && eventlimit > 0) break;
				}
			}
		}
		//Units
		if (c < eventlimit || eventlimit === 0) {
			for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
				if (EntityDistance(Tunit_.h, tempp) < range) {
					skip = set_parsecache(Cclass_unit, Tunit_.id, event);
					if (Instr(Dunit_scriptk(Tunit_.typ), SEP_LINE + event)) {
						parse_task(Cclass_unit, Tunit_.id, event, '', Dunit_script(Tunit_.typ));
						skip = 1;
					}
					if (skip) {
						c = c + 1;
						if (c >= eventlimit && eventlimit > 0) break;
					}
				}
			}
		}
		//Items
		if (c < eventlimit || eventlimit === 0) {
			for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
				if (Titem_.parent_mode === Cpm_out) {
					if (EntityDistance(Titem_.h, tempp) < range) {
						skip = set_parsecache(Cclass_item, Titem_.id, event);
						if (Instr(Ditem_scriptk(Titem_.typ), SEP_LINE + event)) {
							parse_task(Cclass_item, Titem_.id, event, '', Ditem_script(Titem_.typ));
							skip = 1;
						}
						if (skip) {
							c = c + 1;
							if (c >= eventlimit && eventlimit > 0) break;
						}
					}
				}
			}
		}
		//Infos
		if (c < eventlimit || eventlimit === 0) {
			for (Tinfo_ = First(Tinfo); Tinfo_ !== null; Tinfo_ = After(Tinfo, Tinfo_)) {
				if (EntityDistance(Tinfo_.h, tempp) < range) {
					skip = set_parsecache(Cclass_info, Tinfo_.id, event);
					if (Instr(Dinfo_scriptk(Tinfo_.typ), SEP_LINE + event)) {
						parse_task(Cclass_info, Tinfo_.id, event, '', Dinfo_script(Tinfo_.typ));
						skip = 1;
					}
					if (skip) {
						c = c + 1;
						if (c >= eventlimit && eventlimit > 0) break;
					}
				}
			}
		}
		FreeEntity(tempp);
	},

	/** Case "quicksave" (parser_commands.bb:466) */
	cmd_quicksave(_P) {
		let Tin_quicksave_: Tin_quicksave | null = null;
		Tin_quicksave_ = New(Tin_quicksave);
		Tin_quicksave_.mode = 1;
		G.in_quicksave = 1;
		//Quicksave performed in cull.bb (to avoid crossparsing)
	},

	/** Case "quickload" (parser_commands.bb:473) */
	cmd_quickload(_P) {
		let Tin_quicksave_: Tin_quicksave | null = null;
		Tin_quicksave_ = New(Tin_quicksave);
		Tin_quicksave_.mode = 2;
		G.in_quicksave = 2;
		//Quickload performed in cull.bb (to avoid crossparsing)
	},

	/** Case "autosave" (parser_commands.bb:480) */
	cmd_autosave(_P) {
		let Tin_quicksave_: Tin_quicksave | null = null;
		Tin_quicksave_ = New(Tin_quicksave);
		Tin_quicksave_.mode = 3;
		G.in_quicksave = 3;
		//Autosave performed in cull.bb (to avoid crossparsing)
	},

	/** Case "autoload" (parser_commands.bb:487) */
	cmd_autoload(_P) {
		let Tin_quicksave_: Tin_quicksave | null = null;
		Tin_quicksave_ = New(Tin_quicksave);
		Tin_quicksave_.mode = 4;
		G.in_quicksave = 4;
		//Autoload performed in cull.bb (to avoid crossparsing)
	},

	/** Case "loadmap" (parser_commands.bb:494) */
	cmd_loadmap(_P, path, ot_skills, ot_items, ot_vars, ot_diary, ot_states, ot_locks) {
		let Tin_quicksave_: Tin_quicksave | null = null;
		cachedata(1, ot_skills, ot_items, ot_vars, ot_diary, ot_states, ot_locks);
		//Perform
		G.tmp_loadmapcmdmap = path;
		G.in_quicksave = 5;
		Tin_quicksave_ = New(Tin_quicksave);
		Tin_quicksave_.mode = 5;
		Tin_quicksave_.map = G.tmp_loadmapcmdmap;
		//Loadmap performed in cull.bb (to avoid crossparsing)
	},

	/** Case "savemap" (parser_commands.bb:534) */
	cmd_savemap(_P, path, ot_skills, ot_items, ot_vars, ot_diary, ot_states, ot_locks) {
		let Tin_quicksave_: Tin_quicksave | null = null;
		//Perform
		G.tmp_loadmapcmdmap = path;
		G.in_quicksave = 6;
		Tin_quicksave_ = New(Tin_quicksave);
		Tin_quicksave_.mode = 6;
		Tin_quicksave_.map = G.tmp_loadmapcmdmap;
		Tin_quicksave_.skills = ot_skills;
		Tin_quicksave_.items = ot_items;
		Tin_quicksave_.vars = ot_vars;
		Tin_quicksave_.diary = ot_diary;
		Tin_quicksave_.states = ot_states;
		Tin_quicksave_.locks = ot_locks;
		//Savemap performed in cull.bb (to avoid crossparsing)
	},

	/** Case "alteritem" (parser_commands.bb:579), lines 591-632 */
	cmd_alteritem(_P, c, newtype, newcount, newnewtype) {
		let itemid = 0;
		let Titem_: Titem | null = null;
		//Replace Current Item
		if (newnewtype === 0) {
			if (G.p_env_class === Cclass_item && G.p_env_event === 'use') {
				if (con_item(G.p_env_id)) {
					if (G.TCitem!.count >= c) {
						//FX
						p_combine(G.TCitem!.typ, newtype);
						//Free C
						free_item(G.p_env_id, c);
						//New
						itemid = set_item(-1, newtype, 0, 0, 0, newcount);
						if (itemid > -1) {
							store_item(itemid, Cclass_unit, G.g_player);
						}
					}
				}
			} else {
				//parse_error("'alteritem' only works in 'on:use'-events when it has got 3 or less parameters")
				// (raised by the handler, script/commands/basic1.ts, which does not call this method then)
			}
			//Replace Specific Item
		} else {
			for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
				if (Titem_.parent_class === Cclass_unit) {
					if (Titem_.parent_id === G.g_player) {
						if (Titem_.typ === newtype) {
							if (Titem_.count >= c) {
								//FX
								p_combine(newtype, newnewtype);
								//Free C
								free_item(Titem_.id, c);
								//New
								itemid = set_item(-1, newnewtype, 0, 0, 0, newcount);
								if (itemid > -1) {
									store_item(itemid, Cclass_unit, G.g_player);
								}
							}
							break;
						}
					}
				}
			}
		}
	},

	/** Case "quit" (parser_commands.bb:635) */
	cmd_quit(_P) {
		// deferred: menu_start() is asynchronous (the rest of the script runs before the map is cleared)
		defer(async () => {
			await menu_start();
		});
	},

	/** Case "credits" (parser_commands.bb:640) */
	cmd_credits(_P) {
		// deferred: menu_start() and menu_set() are asynchronous
		defer(async () => {
			await menu_start();
			await menu_set(Cmenu_credits, 0);
		});
	},

	/** Case "setpos","setat" (parser_commands.bb:774), branch p_com$="setpos" */
	cmd_setpos(P, classint, id, setpx, setpy, setpz) {
		setpos_setat(P, classint, id, setpx, setpy, setpz);
	},

	/** Case "setpos","setat" (parser_commands.bb:774), Else branch */
	cmd_setat(P, classint, id, class2, id2) {
		let setath: Handle = null;
		let setpx = '';
		let setpy = '';
		let setpz = '';
		setath = parent_h(class2, id2);
		if (setath !== null) {
			// quirk: the position goes through a String (setpx$=EntityX(...)): it is cut to Blitz's float text
			setpx = Str(EntityX(setath), 'float');
			setpy = Str(EntityY(setath), 'float');
			setpz = Str(EntityZ(setath), 'float');
		}
		// quirk: without a target entity setpx$/setpy$/setpz$ stay "" and ha_setpos is still called
		setpos_setat(P, classint, id, setpx, setpy, setpz);
	},

	/** Case "setrot" (parser_commands.bb:823) */
	cmd_setrot(P, classint, id, pitch, yaw, roll) {
		let setph: Handle = null;
		let Tobject_: Tobject | null = null;
		let update = 0;
		let Tfrap_: Tfrap | null = null;
		setph = parent_h(classint, id);
		if (setph !== null) {
			if (pitch === 'self') pitch = Str(EntityPitch(setph), 'float');
			if (yaw === 'self') yaw = Str(EntityYaw(setph), 'float');
			if (roll === 'self') roll = Str(EntityRoll(setph), 'float');
			RotateEntity(setph, Float(pitch), Float(yaw), Float(roll));
			//Update FRAP Data
			if (classint === Cclass_object) {
				for (Tobject_ = First(Tobject); Tobject_ !== null; Tobject_ = After(Tobject, Tobject_)) {
					if (Tobject_.id === id) {
						if (Tobject_.ch !== null) {
							RotateEntity(Tobject_.ch, Float(pitch), Float(yaw), Float(roll));
						}
						break;
					}
				}
				update = 0;
				for (Tfrap_ = First(Tfrap); Tfrap_ !== null; Tfrap_ = After(Tfrap, Tfrap_)) {
					if (Tfrap_.parent_class === Cclass_object) {
						if (Tfrap_.parent_id === id) {
							Tfrap_.y = EntityY(setph);
							Tfrap_.pitch = EntityPitch(setph);
							Tfrap_.roll = EntityRoll(setph);
							update = 1;
							break;
						}
					}
				}
				if (update === 0) {
					Tfrap_ = New(Tfrap);
					Tfrap_.parent_class = Cclass_object;
					Tfrap_.parent_id = id;
					Tfrap_.y = EntityY(setph);
					Tfrap_.pitch = EntityPitch(setph);
					Tfrap_.roll = EntityRoll(setph);
				}
			}
			//Player? -> Rotate Cam
			if (classint === Cclass_unit) {
				// quirk: unit id 1, not g_player
				if (id === 1) {
					RotateEntity(G.cam, EntityPitch(setph), EntityYaw(setph), EntityRoll(setph));
				}
			}
		} else {
			P.parse_error('object', id);
		}
	},

	/** Case "rpos" (parser_commands.bb:887) */
	cmd_rpos(P, classint, id, setpx, setpy, setpz, pitch, yaw, roll) {
		let setph: Handle = null;
		let p: Handle = null;
		let Titem_: Titem | null = null;
		setph = parent_h(classint, id);
		if (setph !== null) {
			if (pitch === 'self') pitch = Str(EntityPitch(setph), 'float');
			if (yaw === 'self') yaw = Str(EntityYaw(setph), 'float');
			if (roll === 'self') roll = Str(EntityRoll(setph), 'float');
			//Pivot Movement
			p = CreatePivot();
			PositionEntity(p, EntityX(setph), EntityY(setph), EntityZ(setph));
			RotateEntity(p, Float(pitch), Float(yaw), Float(roll));
			MoveEntity(p, Float(setpx), Float(setpy), Float(setpz));
			G.tmp_x = EntityX(p);
			G.tmp_y = EntityY(p);
			G.tmp_z = EntityZ(p);
			FreeEntity(p);
			//Setpos
			if (classint === Cclass_item) {
				//Items can only set to a position if they are not stored inside sth.
				for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
					if (Titem_.id === id) {
						if (Titem_.parent_class === 0 || Titem_.parent_mode === Cpm_out) {
							// quirk: the Floats are passed to String parameters (Blitz float text)
							ha_setpos(setph, classint, id, Str(G.tmp_x, 'float'), Str(G.tmp_y, 'float'), Str(G.tmp_z, 'float'));
						}
						break;
					}
				}
			} else {
				//Everything als can be set to any position anytime
				ha_setpos(setph, classint, id, Str(G.tmp_x, 'float'), Str(G.tmp_y, 'float'), Str(G.tmp_z, 'float'));
			}
		} else {
			P.parse_error('object', id);
		}
	},

	/** Case "store" (parser_commands.bb:940), lines 961-978 */
	cmd_store(_P, idstring, classint, id, mode) {
		// quirk: x#,y#,z# are never assigned in this Case: 0
		const x = 0;
		const y = 0;
		const z = 0;
		if (mode === 0) {
			return Str(store_item(Int(idstring), classint, id));
		} else {
			G.tmp_x = 0;
			G.tmp_y = 0;
			G.tmp_z = 0;
			// quirk: con_item() is asked for the id of the container, and tmp_x/y/z are not used afterwards
			if (con_item(id)) {
				G.tmp_x = EntityX(G.TCitem!.h);
				G.tmp_y = EntityY(G.TCitem!.h);
				G.tmp_z = EntityZ(G.TCitem!.h);
			}
			if (mode === 2) {
				if (classint === Cclass_object) {
					object_spawnpos(id);
				}
			}
			return Str(store_item(Int(idstring), classint, id, Cpm_out, x, y, z));
		}
	},

	/** Case "unstore" (parser_commands.bb:981), lines 992-995 */
	cmd_unstore(_P, idstring, count) {
		unstore_item(Int(idstring), count, 1);
		if (!isNull(Titem, G.TCitem)) {
			return Str(G.TCitem!.id);
		}
	},

	/** Case "kill" (parser_commands.bb:998) */
	cmd_kill(_P, id) {
		if (con_unit(id)) {
			kill_unit();
		}
	},

	/** Case "damage" (parser_commands.bb:1010) */
	ha_damage(_P, classint, id, damage) {
		ha_damage(classint, id, damage);
	},

	/** Case "heal","repair" (parser_commands.bb:1025) */
	ha_heal(_P, classint, id, damage) {
		ha_heal(classint, id, damage);
	},

	/** Case "setcount","setamount" (parser_commands.bb:1040) */
	cmd_setcount(P, id, count) {
		let Titem_: Titem | null = null;
		for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
			if (Titem_.id === id) {
				if (Titem_.parent_class === 0) {
					if (Abs(count) === 0) count = 1;
					Titem_.count = Abs(count);
				} else {
					P.parse_error("'setcount' has to be used with an unstored item");
				}
				break;
			}
		}
	},

	/** Case "ride","drive" (parser_commands.bb:1062) */
	cmd_ride(_P, id) {
		if (con_unit(id)) {
			//Set Drive
			G.g_drive = id;
			//Rotate Cam to View of Vehicle
			RotateEntity(G.cam, EntityPitch(G.cam), EntityYaw(G.TCunit!.h), EntityRoll(G.cam));
			//Get Vehicle Stuff
			game_input_vehicledata(G.TCunit!.typ);
			//Set Mode
			G.TCunit!.ai_mode = 0;
			G.TCunit!.ai_duration = 5000;
			G.TCunit!.ai_timer = G.gt;
			//Set Ani
			Animate(G.TCunit!.mh, 0);
			G.TCunit!.ani = 0;
		}
	},

	/** Case "getoff" (parser_commands.bb:1085) */
	cmd_getoff(_P) {
		if (con_unit(G.g_drive)) {
			ai_mode(ai_idle);
		}
		G.g_drive = 0;
	},

	/** Case "climate" (parser_commands.bb:1092): the Cases of Select newclimate$ */
	cmd_climate(_P, climate) {
		switch (climate) {
			case 0:
				G.map_climate = 0;
				if (G.env_cweather > 1) {
					e_environment_setweather(Rand(0, 1));
				}
				break;
			case 1:
				G.map_climate = 1;
				if (G.env_cweather !== 0 && G.env_cweather !== 2) {
					e_environment_setweather(Rand(0, 1) * 2);
				}
				break;
			case 2:
				G.map_climate = 2;
				e_environment_setweather(0);
				break;
			case 3:
				G.map_climate = 3;
				e_environment_setweather(1);
				break;
			case 4:
				G.map_climate = 4;
				e_environment_setweather(2);
				break;
			case 5:
				G.map_climate = 5;
				e_environment_setweather(3);
				break;
		}
	},

	/** Case "weather" (parser_commands.bb:1122) */
	e_environment_setweather(_P, weather) {
		e_environment_setweather(weather);
	},

	/** Case "rainratio" (parser_commands.bb:1138) */
	cmd_rainratio(_P, value) {
		G.map_rainratio = value;
	},

	/** Case "snowratio" (parser_commands.bb:1142) */
	cmd_snowratio(_P, value) {
		G.map_snowratio = value;
	},

	/** Case "downloadfile" (parser_commands.bb:1192) */
	tcp_loadfile(_P, server, path, loc) {
		tcp_loadfile(server, path, loc);
	},

	/** Case "callscript" (parser_commands.bb:1201) */
	tcp_callscript(_P, server, path) {
		tcp_callscript(server, path);
	},

	/** Case "spawntimer" (parser_commands.bb:1222); p_return$ is "0" before the call */
	cmd_spawntimer(_P, id, daytimervalue) {
		let Tobject_: Tobject | null = null;
		let p_return: string | undefined = undefined;
		//Set
		if (daytimervalue !== undefined) {
			for (Tobject_ = First(Tobject); Tobject_ !== null; Tobject_ = After(Tobject, Tobject_)) {
				if (Tobject_.id === id) {
					Tobject_.daytimer = daytimervalue;
					grow_object(Tobject_);
					p_return = Str(Tobject_.daytimer);
					//con_add("set daytimer "+daytimervalue)
					break;
				}
			}
			//Get
		} else {
			for (Tobject_ = First(Tobject); Tobject_ !== null; Tobject_ = After(Tobject, Tobject_)) {
				if (Tobject_.id === id) {
					p_return = Str(Tobject_.daytimer);
					//con_add("get daytimer "+Tobject\daytimer)
					break;
				}
			}
			// quirk: the daytimer just found is always overwritten by the value of the kill cache
			if (G.tmp_killclass === Cclass_object && G.tmp_killid === id) {
				p_return = Str(G.tmp_killspawntimer);
			} else {
				p_return = Str((parse_kill_get(Cclass_object, id, 1) as number));
			}
		}
		return p_return;
	},

	/** Case "growtime" (parser_commands.bb:1259) */
	cmd_growtime(_P, id) {
		if (id >= 0 && id <= G.Cobject_count) {
			return Str(Dobject_growtime(id));
		} else {
			return '0';
		}
	},

	/**
	 * Case "unitpath" (parser_commands.bb:1268). The original calls up_setup() before the first
	 * node is read and up_addnode() after each node; the handler reads all nodes first.
	 */
	cmd_unitpath(_P, unitid, nodes) {
		let i = 0;
		up_setup(unitid);
		for (i = 0; i < nodes.length; i++) {
			up_addnode(unitid, nodes[i]);
		}
	},

	/** Case "freeunitpath" (parser_commands.bb:1285) */
	up_free(_P, unitid) {
		up_free(unitid);
	},

	/** Case "wateralpha" (parser_commands.bb:1290) */
	cmd_wateralpha(_P, alpha) {
		EntityAlpha(G.env_sea2, alpha);
	},

	/**
	 * Case "watertexture" (parser_commands.bb:1294). Returns 0 for the Else branch (the handler
	 * raises the parse_error).
	 */
	cmd_watertexture(_P, path) {
		if (G.gfx_waterimg_custom !== 0) FreeImage(G.gfx_waterimg_custom);
		G.gfx_waterimg_custom = 0;
		// quirk: load_image() ends the program with "Unable to load Image" when the file is missing,
		// so the parse_error of the Else branch is never reached
		G.gfx_waterimg_custom = load_image(path);
		if (G.gfx_waterimg_custom !== 0) {
			// quirk: resized only when BOTH width and height differ
			if (ImageWidth(G.gfx_waterimg_custom) !== TextureWidth(G.gfx_water)) {
				if (ImageHeight(G.gfx_waterimg_custom) !== TextureHeight(G.gfx_water)) {
					ResizeImage(G.gfx_waterimg_custom, TextureWidth(G.gfx_water), TextureHeight(G.gfx_water));
				}
			}
			SetBuffer(TextureBuffer(G.gfx_water)!);
			DrawBlock(G.gfx_waterimg_custom, 0, 0);
			GetColor(0, 0);
			G.env_wcol[0] = 255 - ColorRed();
			G.env_wcol[1] = 255 - ColorGreen();
			G.env_wcol[2] = 255 - ColorBlue();
			SetBuffer(BackBuffer());
			// The environment layer draws the water from its own copy of the image
			// (_additions/script1.ts): tell it. Asynchronous in the layer: deferred.
			if (hasRuntime('env')) {
				defer(async () => {
					await RT.env.watertexture(path);
				});
			}
		} else {
			//parse_error("unable to load water texture '"+path$+"'")
			return 0;
		}
	},

	/**
	 * Case "terraintexture" (parser_commands.bb:1317). editor_gencolormap() and e_terraincm() are
	 * asynchronous (load screen): each branch is deferred from that call on, so the method never
	 * returns 0 and the parse_error of the original is raised by the deferred part itself.
	 */
	cmd_terraintexture(P, path, grass) {
		if (Left(path, 8) === 'generate') {
			G.in_opt[4] = 0;
			// deferred: editor_gencolormap() shows a load screen
			defer(async () => {
				if (Len(path) > 8) {
					switch (Mid(path, 10, -1)) {
						case 'desert':
							G.in_opt[4] = 3;
							await editor_gencolormap(1);
							break;
						case 'snow':
							G.in_opt[4] = 4;
							await editor_gencolormap(1);
							break;
						case 'swamp':
							G.in_opt[4] = 5;
							await editor_gencolormap(1);
							break;
						default:
							split(Mid(path, 10, -1));
							e_tercol(Int(G.splits[0]), Int(G.splits[1]), Int(G.splits[2]), 0);
							e_tercol(Int(G.splits[3]), Int(G.splits[4]), Int(G.splits[5]), 1);
							e_tercol(Int(G.splits[6]), Int(G.splits[7]), Int(G.splits[8]), 2);
							await editor_gencolormap(0);
					}
				} else {
					await editor_gencolormap(1);
				}
				//Grass
				if (grass === 1) {
					grass_map();
					grass_heightmap();
				}
				//Ground
				e_terrainground();
			});
		} else {
			// deferred: e_terraincm() is asynchronous
			defer(async () => {
				if (await e_terraincm(path, 0)) {
					//Grass
					if (grass === 1) {
						grass_map();
						grass_heightmap();
					}
					//Ground
					e_terrainground();
				} else {
					P.parse_error("unable to load terrain texture '" + path + "'");
				}
			});
		}
	},

	/** Case "skytexture" (parser_commands.bb:1368) */
	cmd_skytexture(_P, path) {
		G.map_skybox = path;
		//If env_sky<>0 Then FreeEntity env_sky
		//If map_skybox$="" Then
		//	env_sky=e_skybox("skies\sky")
		//Else
		//	env_sky=e_skybox("skies\"+map_skybox$)
		//EndIf
		//EntityFX env_sky,1+8
		//EntityOrder env_sky,3
		//PositionEntity env_sky,0,500,0
		// The sky has no entity in the port (e_skybox is absorbed by the environment layer, which
		// rebuilds it with exactly these settings). Asynchronous in the layer: deferred.
		if (hasRuntime('env')) {
			defer(async () => {
				await RT.env.skytexture(path);
			});
		}
	},

	/** Case "grasscolor" (parser_commands.bb:1382) */
	grass_colors(_P, r, g, b) {
		grass_colors(r, g, b);
	},

	/** Case "alterobject" (parser_commands.bb:1392) */
	cmd_alterobject(_P, id, newtype) {
		let xp = 0;
		let zp = 0;
		let yawrot = 0;
		if (con_object(id)) {
			xp = EntityX(G.TCobject!.h);
			zp = EntityZ(G.TCobject!.h);
			yawrot = EntityYaw(G.TCobject!.h);
			id = G.TCobject!.id;
			free_object(id);
			set_object(id, newtype, xp, zp, yawrot);
		}
	},

	/** Case "speech" (parser_commands.bb:1420) */
	speech(_P, file, override, id) {
		speech(file, override, id);
	},

	/** Case "revive" (parser_commands.bb:1433) */
	cmd_revive(_P, unitid) {
		// quirk: the loop variable is the global TCunit (Null afterwards when the unit does not exist)
		for (G.TCunit = First(Tunit); G.TCunit !== null; G.TCunit = After(Tunit, G.TCunit)) {
			if (G.TCunit.id === unitid) {
				//Health
				if (G.TCunit.health_max > 0) {
					G.TCunit.health = Dunit_health(G.TCunit.typ);
				} else {
					G.TCunit.health_max = Dunit_health(G.TCunit.typ);
					G.TCunit.health = Dunit_health(G.TCunit.typ);
				}
				//Picking/Collisions
				if (Dunit_col(G.TCunit.typ) > 0) {
					EntityType(G.TCunit.h, Dunit_col(G.TCunit.typ));
					EntityRadius(G.TCunit.h, Dunit_colxr(G.TCunit.typ), Dunit_colyr(G.TCunit.typ));
				}
				EntityPickMode(G.TCunit.mh, 2, 1);
				//AI Initiale (without setting center)
				ai_ini(0);
				//Player?
				if (G.TCunit!.id === G.g_player) {
					G.g_player_dead = 0;
				}
				break;
			}
		}
	},

	/** Case "debug" (parser_commands.bb:1466) */
	dbugcmd(_P, dbg1, dbg2) {
		dbugcmd(dbg1, dbg2);
	},

	/** Case "freeze" (parser_commands.bb:1474), lines 1489-1509; p_return$ is "0" before the call */
	cmd_freeze(_P, id, mode) {
		let Tunit_: Tunit | null = null;
		if (id === 0) {
			// quirk: every unit gets "mode", also a mode >= 2
			for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
				freeze_unit(Tunit_, mode);
			}
		} else {
			if (mode < 2) {
				for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
					if (Tunit_.id === id) {
						freeze_unit(Tunit_, mode);
						break;
					}
				}
			} else {
				for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
					if (Tunit_.id === id) {
						return Str(Tunit_.freeze);
					}
				}
			}
		}
	},

	/** Case "intersect" (parser_commands.bb:1512), lines 1525-1544; p_return$ is "0" before the call */
	cmd_intersect(P, classint, id, class2, id2) {
		let h1: Handle = null;
		let h2: Handle = null;
		if (class2 !== undefined && id2 !== undefined) {
			h1 = parent_h(classint, id, 1);
			h2 = parent_h(class2, id2, 1);
			if (h1 !== null) {
				if (h2 !== null) {
					return Str(MeshesIntersect(h1, h2));
				} else {
					P.parse_error('object', id2);
				}
			} else {
				P.parse_error('object', id);
			}
		} else {
			h1 = parent_h(classint, id, 1);
			if (h1 !== null) {
				return Str(ha_intersect(classint, id));
			} else {
				P.parse_error('object', id);
			}
		}
	},

	/** Case "storage" (parser_commands.bb:1548), lines 1563-1592; p_return$ is "0" before the call */
	cmd_storage(_P, classint, id, mode) {
		let typ = 0;
		let Tobject_: Tobject | null = null;
		let Tunit_: Tunit | null = null;
		let Titem_: Titem | null = null;
		switch (classint) {
			case Cclass_object:
				typ = 0;
				for (Tobject_ = First(Tobject); Tobject_ !== null; Tobject_ = After(Tobject, Tobject_)) {
					if (Tobject_.id === id) {
						typ = Tobject_.typ;
						break;
					}
				}
				switch (mode) {
					case 0:
						return Str(capacity(classint, id, typ));
					case 1:
						return Str(capacity(classint, id, typ) - Dobject_maxweight(typ));
					case 2:
						return Str(Dobject_maxweight(typ));
				}
				break;
			case Cclass_unit:
				for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
					if (Tunit_.id === id) {
						typ = Tunit_.typ;
						break;
					}
				}
				switch (mode) {
					case 0:
						return Str(capacity(classint, id, typ));
					case 1:
						return Str(capacity(classint, id, typ) - Dunit_maxweight(typ));
					case 2:
						return Str(Dunit_maxweight(typ));
				}
				break;
			case Cclass_item:
				for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
					if (Titem_.id === id) {
						// quirk: the weight of the item type, whatever the mode
						return Str(Ditem_weight(Titem_.typ));
					}
				}
				break;
			default:
				return '0';
		}
	},

	/**
	 * Case "projectile" (parser_commands.bb:1595). a/b/c by mode: 1 = classint, id, - (parent_pos()
	 * succeeded and left the target in tmp_x#/tmp_y#/tmp_z#); 2 = x2, y2, z2; 3 = pitch, yaw;
	 * 4 = -; 5, 6 = lowdist.
	 */
	cmd_projectile(_P, typ, x, y, z, mode, a, b, c, offset, pr_wpn, pr_spd, pr_dmg, pr_drag) {
		let p: Handle = null;
		let p2: Handle = null;
		let classint = 0;
		let id = 0;
		let Tunit_: Tunit | null = null;
		let x2 = 0;
		let y2 = 0;
		let z2 = 0;
		let pitch = 0;
		let yaw = 0;
		let found = 0;
		let lowdist = 0;
		let tame = 0;
		p = CreatePivot();
		p2 = CreatePivot();
		switch (mode) {
			case 1: //Target Object
				classint = a;
				id = b;
				//If parent_pos(classint,id) Then (handler)
				PositionEntity(p, x, y, z);
				PositionEntity(p2, G.tmp_x, G.tmp_y, G.tmp_z);
				PointEntity(p, p2);
				if (classint === Cclass_unit) {
					for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
						if (Tunit_.id === id) {
							PositionEntity(p2, G.tmp_x, f32(G.tmp_y - f32(Dunit_colyr(Tunit_.typ) / 2.0)), G.tmp_z);
							PointEntity(p, p2);
							break;
						}
					}
				}
				pro_add_script(typ, x, y, z, EntityPitch(p), EntityYaw(p), offset, pr_wpn, pr_spd, pr_dmg, pr_drag);
				break;
			case 2: //Target Position
				// quirk: x2, y2, z2 are Ints
				x2 = a;
				y2 = b;
				z2 = c;
				PositionEntity(p, x, y, z);
				PositionEntity(p2, x2, y2, z2);
				PointEntity(p, p2);
				pro_add_script(typ, x, y, z, EntityPitch(p), EntityYaw(p), offset, pr_wpn, pr_spd, pr_dmg, pr_drag);
				break;
			case 3: //Direction
				pitch = a;
				yaw = b;
				pro_add_script(typ, x, y, z, pitch, yaw, offset, pr_wpn, pr_spd, pr_dmg, pr_drag);
				break;
			case 4: //Target Player
				if (!isNull(Tunit, G.g_cplayer)) {
					PositionEntity(p, x, y, z);
					PointEntity(p, G.g_cplayer!.h);
				}
				// quirk: without a player the pivot stays at the origin: pitch and yaw 0
				pro_add_script(typ, x, y, z, EntityPitch(p), EntityYaw(p), offset, pr_wpn, pr_spd, pr_dmg, pr_drag);
				break;
			case 5:
				PositionEntity(p, x, y, z);
				found = 0;
				lowdist = a;
				for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
					if (Tunit_.id >= 100) {
						if (Tunit_.health > 0) {
							if (EntityDistance(Tunit_.h, p) < lowdist) {
								// quirk: lowdist is an Int, the distance is rounded
								lowdist = Int(EntityDistance(Tunit_.h, p));
								PositionEntity(p2, EntityX(Tunit_.h), f32(EntityY(Tunit_.h) - f32(Dunit_colyr(Tunit_.typ) / 2.0)), EntityZ(Tunit_.h));
								found = 1;
							}
						}
					}
				}
				if (found === 1) {
					PointEntity(p, p2);
					pro_add_script(typ, x, y, z, EntityPitch(p), EntityYaw(p), offset, pr_wpn, pr_spd, pr_dmg, pr_drag);
				}
				break;
			case 6:
				PositionEntity(p, x, y, z);
				found = 0;
				lowdist = a;
				for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
					if (Tunit_.id >= 100) {
						if (Tunit_.health > 0) {
							if (EntityDistance(Tunit_.h, p) < lowdist) {
								if (ai_agressive(Dunit_behaviour(Tunit_.typ)) === 1) {
									tame = 0;
									if (Tunit_.states === 1) {
										if (get_state(Cstate_tame, Cclass_unit, Tunit_.id) === 1) {
											tame = 1;
										}
									}
									if (tame === 0) {
										// quirk: lowdist is an Int, the distance is rounded
										lowdist = Int(EntityDistance(Tunit_.h, p));
										PositionEntity(p2, EntityX(Tunit_.h), f32(EntityY(Tunit_.h) - f32(Dunit_colyr(Tunit_.typ) / 2.0)), EntityZ(Tunit_.h));
										found = 1;
									}
								}
							}
						}
					}
				}
				if (found === 1) {
					PointEntity(p, p2);
					pro_add_script(typ, x, y, z, EntityPitch(p), EntityYaw(p), offset, pr_wpn, pr_spd, pr_dmg, pr_drag);
				}
				break;
		}
		FreeEntity(p);
		FreeEntity(p2);
	},

	/** Case "loadani" (parser_commands.bb:1809) */
	unit_loadani(_P, id, f1, f2) {
		return Str(unit_loadani(id, f1, f2));
	},

	/** Case "animate" (parser_commands.bb:1818) */
	unit_scriptani(_P, id, f1, f2, speed, mode) {
		return Str(unit_scriptani(id, f1, f2, speed, mode));
	},

	/** Case "viewline" (parser_commands.bb:1833) */
	viewline(_P, x, y, z, x2, y2, z2) {
		return Str(viewline(x, y, z, x2, y2, z2));
	},

	/** Case "text3d" (parser_commands.bb:1848), lines 1866-1893 */
	cmd_text3d(_P, classint, id, txt, col, y, z) {
		let found = 0;
		let t3d: T3d | null = null;
		if (ha_type(classint, id) > 0) {
			found = 0;
			for (t3d = First(T3d); t3d !== null; t3d = After(T3d, t3d)) {
				if (t3d.class === classint) {
					if (t3d.id === id) {
						if (txt !== '') {
							t3d.txt = txt;
							t3d.typ = col;
							// (y#, z# are Floats, the fields Ints)
							t3d.offset = Int(y);
							t3d.range = Int(z);
						} else {
							Delete(T3d, t3d);
						}
						found = 1;
						break;
					}
				}
			}
			if (found === 0) {
				// quirk: an empty text for an entity without a text creates an empty entry
				t3d = New(T3d);
				t3d.class = classint;
				t3d.id = id;
				t3d.txt = txt;
				t3d.typ = col;
				t3d.offset = Int(y);
				t3d.range = Int(z);
			}
		}
	},

	/** Case "lensflares" (parser_commands.bb:1896) */
	cmd_lensflares(_P, value) {
		G.set_flarefx = value;
	},

	/** Case "skycolor" (parser_commands.bb:1900) */
	cmd_skycolor(_P, mode, r, g, b, mix) {
		G.in_skyoverride[4] = 0;
		G.in_skyoverride[0] = mode;
		if (r !== undefined && g !== undefined && b !== undefined) {
			G.in_skyoverride[1] = r; //R
			G.in_skyoverride[2] = g; //G
			G.in_skyoverride[3] = b; //B
			G.in_skyoverride[4] = mix; //MIX
		}
		e_environment_update_light();
	},

	/** Case "behaviour" (parser_commands.bb:1916): the Cases of Select classint; p_return$ is "" before the call */
	cmd_behaviour(P, classint, id) {
		switch (classint) {
			case Cclass_object:
				if (id >= 0 && id <= G.Cobject_count) {
					return Dobject_behaviour(id);
				} else {
					P.parse_error('typerange', id);
				}
				break;
			case Cclass_unit:
				if (id >= 0 && id <= G.Cunit_count) {
					return Str(Dunit_behaviour(id));
				} else {
					P.parse_error('typerange', id);
				}
				break;
			case Cclass_item:
				if (id >= 0 && id <= G.Citem_count) {
					return Ditem_behaviour(id);
				} else {
					P.parse_error('typerange', id);
				}
				break;
		}
	},

	/** Case "name" (parser_commands.bb:1945): the Cases of Select classint; p_return$ is "" before the call */
	cmd_name(P, classint, id) {
		switch (classint) {
			case Cclass_object:
				if (id >= 0 && id <= G.Cobject_count) {
					return Dobject_name(id);
				} else {
					P.parse_error('typerange', id);
				}
				break;
			case Cclass_unit:
				if (id >= 0 && id <= G.Cunit_count) {
					return Dunit_name(id);
				} else {
					P.parse_error('typerange', id);
				}
				break;
			case Cclass_item:
				if (id >= 0 && id <= G.Citem_count) {
					return Ditem_name(id);
				} else {
					P.parse_error('typerange', id);
				}
				break;
		}
	},

	/** Case "mkdir" (parser_commands.bb:1974), lines 1979-1982; p_return$ is "0" before the call */
	cmd_mkdir(_P, path) {
		CreateDir(path);
		if (FileType(path) === 2) {
			return '1';
		}
	},

	/** Case "copychilds","copychildren" (parser_commands.bb:1985) */
	ha_copychilds(_P, classint, id, cvars, citems, cstates, cscript, addtocache) {
		ha_copychilds(classint, id, cvars, citems, cstates, cscript, addtocache);
	},

	/** Case "pastechilds","pastechildren" (parser_commands.bb:2008) */
	ha_pastechilds(_P, classint, id, cvars, citems, cstates, cscript) {
		ha_pastechilds(classint, id, cvars, citems, cstates, cscript);
	},

	// =====================================================================================
	//################################################# PLAYER
	// =====================================================================================

	/** Case "player_speed" (parser_commands.bb:2031) */
	cmd_player_speed(_P, fval) {
		Dunit_speed.set(1, f32(fval));
	},

	/** Case "player_damage" (parser_commands.bb:2036) */
	cmd_player_damage(_P, fval) {
		Dunit_damage.set(1, f32(fval));
	},

	/** Case "player_attackrange" (parser_commands.bb:2041) */
	cmd_player_attackrange(_P, fval) {
		// quirk: an Int array receives the Float
		Dunit_attackrange.set(1, Int(fval));
	},

	/** Case "player_maxweight" (parser_commands.bb:2046) */
	cmd_player_maxweight(_P, fval) {
		// quirk: an Int array receives the Float
		Dunit_maxweight.set(1, Int(fval));
	},

	/** Case "player_mat" (parser_commands.bb:2051) */
	cmd_player_mat(_P, name) {
		Dunit_mat.set(1, get_material(name));
	},

	/** Case "player_weapon" (parser_commands.bb:2055) */
	game_weapon_bytype(_P, typ) {
		game_weapon_bytype(typ);
	},

	/** Case "player_ammo" (parser_commands.bb:2060) */
	game_ammo_bytype(_P, typ) {
		game_ammo_bytype(typ);
	},

	/** Case "jumptime" (parser_commands.bb:2065): value is Int(fval#) */
	cmd_jumptime(_P, value) {
		G.game_jumptime = value;
	},

	/** Case "jumpfactor" (parser_commands.bb:2070) */
	cmd_jumpfactor(_P, fval) {
		G.game_jumpfac = f32(fval);
	},

	/** Case "playerspotted" (parser_commands.bb:2075); p_return$ is "0" before the call */
	cmd_playerspotted(_P) {
		let Tunit_: Tunit | null = null;
		for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
			if (ai_agressive(Dunit_behaviour(Tunit_.typ)) === 1) {
				if (Tunit_.ai_mode === ai_movetarget || Tunit_.ai_mode === ai_attack) {
					if (Tunit_.health > 0) {
						if (EntityDistance(Tunit_.h, G.cam) < 300) {
							return '1';
						}
					}
				}
			}
		}
	},

	/** Case "getplayervalue" (parser_commands.bb:2091) */
	cmd_getplayervalue(P, typ) {
		// quirk: nothing at all (not even the error) while there is no player
		if (!isNull(Tunit, G.g_cplayer)) {
			switch (typ) {
				case 1:
					return Str(G.g_cplayer!.health, 'float');
				case 2:
					return Str(G.g_cplayer!.hunger, 'float');
				case 3:
					return Str(G.g_cplayer!.thirst, 'float');
				case 4:
					return Str(G.g_cplayer!.exhaustion, 'float');
				default:
					P.parse_error('expect', " 1,2,3 or 4 as parameter for 'getplayervalue'");
			}
		}
	},

	/** Case "scantarget" (parser_commands.bb:2104) */
	game_target(_P, range) {
		if (range !== undefined) {
			game_target(range);
		} else {
			game_target();
		}
	},

	/** Case "targetx" (parser_commands.bb:2113) */
	cmd_targetx(_P) {
		return Str(G.tmp_tarx, 'float');
	},
	/** Case "targety" (parser_commands.bb:2114) */
	cmd_targety(_P) {
		return Str(G.tmp_tary, 'float');
	},
	/** Case "targetz" (parser_commands.bb:2115) */
	cmd_targetz(_P) {
		return Str(G.tmp_tarz, 'float');
	},

	/** Case "targetclass" (parser_commands.bb:2118) */
	cmd_targetclass(_P) {
		return Str(G.tmp_tarclass);
	},

	/** Case "targetid" (parser_commands.bb:2122) */
	cmd_targetid(_P) {
		return Str(G.tmp_tarid);
	},

	/** Case "targetdistance" (parser_commands.bb:2126) */
	cmd_targetdistance(_P) {
		let p: Handle = null;
		let p_return = '';
		p = CreatePivot();
		PositionEntity(p, G.tmp_tarx, G.tmp_tary, G.tmp_tarz);
		p_return = Str(EntityDistance(G.cam, p), 'float');
		FreeEntity(p);
		return p_return;
	},

	/** Case "air" (parser_commands.bb:2133) */
	cmd_air(_P, p) {
		if (G.g_dive !== 0) {
			G.g_airtimer = G.g_airtimer + p;
			if (G.g_airtimer > G.gt) {
				G.g_airtimer = G.gt;
			}
		}
	},

	/** Case "sleep" (parser_commands.bb:2143) */
	game_sleep(_P) {
		game_sleep();
	},

	/** Case "find" (parser_commands.bb:2147), lines 2153-2157 */
	cmd_find(_P, typ, count) {
		let id = 0;
		id = set_item(-1, typ, EntityX(G.cam), EntityY(G.cam), EntityZ(G.cam), count);
		// quirk: stored into unit 1, not g_player
		store_item(id, Cclass_unit, 1);
		// quirk: p_add2d(x,y,typ,size#): the particle type is -2 and the item type is passed as its size
		p_add2d(idivConst(G.set_scrx, 2), idivConst(G.set_scry, 2), -2, typ);
		if_msg(ss(sm(180), Ditem_name(typ), Str(count)), Cbmpf_green);
		sfx(G.sfx_collect);
	}
};
