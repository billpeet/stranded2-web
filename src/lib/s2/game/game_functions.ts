/**
 * includes/game_functions.bb: the player in the running game: spawning,
 * camera, movement, using, weapons and ammunition, damage, sleeping, digging,
 * fishing, catching, explosions, targeting and the item in the hand.
 */
import {
	CameraPick,
	CreateCamera,
	CreateLight,
	CreatePivot,
	EntityAlpha,
	EntityBlend,
	EntityColor,
	EntityDistance,
	EntityPick,
	EntityPickMode,
	EntityPitch,
	EntityRoll,
	EntityX,
	EntityY,
	EntityYaw,
	EntityZ,
	FreeEntity,
	HideEntity,
	LightColor,
	LightRange,
	LinePick,
	MoveEntity,
	PickedX,
	PickedY,
	PickedZ,
	PositionEntity,
	RotateEntity,
	ShowEntity,
	TerrainY,
	TranslateEntity,
	type BBEntity,
	type Handle
} from '../bb3d';
import { Cos, Instr, Int, Rand, Replace, Rnd, RuntimeError, SEP_LINE, Sin, Sqr, Str, f32, fpow, idivConst } from '../blitz';
import { ai_mode } from './ai_units';
import { con_add } from './console';
import {
	Cbmpf_green,
	Cbmpf_red,
	Cclass_info,
	Cclass_item,
	Cclass_object,
	Cclass_unit,
	Ckey_attack1,
	Cmenu_if_buildsetup,
	Cmenu_if_movie,
	Cmenu_if_selplace,
	Cp_attack,
	Cp_firespark,
	Cp_flash,
	Cp_smoke,
	Cp_spark,
	Cpm_in,
	Cpm_out,
	Cstate_pc_dig,
	Cstate_pc_fish,
	Cworld_userange,
	Cworld_useradius,
	ai_idle
} from './consts';
import {
	Dinfo_name,
	Ditem_behaviour,
	Ditem_name,
	Ditem_radius,
	Ditem_rate,
	Ditem_script,
	Ditem_scriptk,
	Ditem_speed,
	Dobject_col,
	Dobject_script,
	Dobject_scriptk,
	Dunit_driveoffset,
	Dunit_eyes,
	Dunit_script,
	Dunit_scriptk,
	Dunit_store
} from './defs_arrays';
import { e_environment_update_light, e_tery } from './e_environment';
import { dist } from './functions';
import { game_build } from './game_build';
import { game_cd } from './game_changeday';
import { seq_update } from './game_sequences';
import { game_wpn_blade, game_wpn_distance, game_wpn_distancef, game_wpn_none, game_wpn_selfthrow } from './game_weapons';
import { ha_getclass } from './handle_all';
import { countstored_items, damage_item, get_item, get_stored_item, item_getrandom, store_item, unstore_item, use_item } from './handle_items';
import { damage_object, get_object, use_object } from './handle_objects';
import { con_unit, free_unit, get_unit, hurt_unit, pos_unit, set_unit, use_unit } from './handle_units';
import { if_msg } from './interface';
import { sm, ss } from './load_strings';
import { parse_emuevent, parse_globalevent, parse_sel, parse_sel_event, parse_task, set_parsecache } from './parser_functions';
import { p_add, p_add2d, p_explosion } from './particles';
import { RT } from './rt';
import { sfx, sfx_3d, sfx_emit } from './sfx';
import { speech } from './speech';
import { G } from './state';
import { After, Delete, First, New, Tcache, Tinfo, Titem, Tobject, Tunit, isNull } from './types';

//############################################ GAME FUNCTION

//### Get Player Handle
/** Function game_playerh() */
export function game_playerh(): BBEntity | null | -1 {
	let Tunit_: Tunit | null = null;
	for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
		if (Tunit_.id === G.g_player) return Tunit_.h;
	}
	return -1;
}

//### Spawn Player
/** Function game_playerspawn(id=-1,spawnid=-1) */
export function game_playerspawn(id: number = -1, spawnid: number = -1): number {
	let c = 0;
	let Tinfo_: Tinfo | null = null;
	let x = 0;
	let y = 0;
	let z = 0;
	//Spawn Randomly
	if (spawnid === -1) {
		c = 0;
		for (Tinfo_ = First(Tinfo); Tinfo_ !== null; Tinfo_ = After(Tinfo, Tinfo_)) {
			if (Tinfo_.typ === 1) c = c + 1;
		}
		if (c === 0) {
			con_add("ERROR: Missing info '" + Dinfo_name(1) + "' - spawning player at center", Cbmpf_red);
			free_unit(id);
			set_unit(id, 1, 0, 0);
			G.tmp_spawnid = 0;
			return 0;
		}
		for (;;) {
			for (Tinfo_ = First(Tinfo); Tinfo_ !== null; Tinfo_ = After(Tinfo, Tinfo_)) {
				if (Tinfo_.typ === 1) {
					if (Rand(10) === 1) {
						x = EntityX(Tinfo_.h);
						y = EntityY(Tinfo_.h);
						z = EntityZ(Tinfo_.h);
						free_unit(id);
						set_unit(id, 1, x, z);
						pos_unit(G.TCunit, x, y, z);
						if (G.g_player === id) {
							RotateEntity(G.cam, EntityPitch(Tinfo_.h), EntityYaw(Tinfo_.h), 0);
						}
						G.tmp_spawnid = Tinfo_.id;
						return 1;
					}
				}
			}
		}
		//Spawn at specific Info
	} else {
		for (Tinfo_ = First(Tinfo); Tinfo_ !== null; Tinfo_ = After(Tinfo, Tinfo_)) {
			if (Tinfo_.typ === 1) {
				if (Tinfo_.id === spawnid) {
					x = EntityX(Tinfo_.h);
					y = EntityY(Tinfo_.h);
					z = EntityZ(Tinfo_.h);
					free_unit(id);
					set_unit(id, 1, x, z);
					pos_unit(G.TCunit, x, y, z);
					if (G.g_player === id) {
						RotateEntity(G.cam, EntityPitch(Tinfo_.h), EntityYaw(Tinfo_.h), 0);
					}
					G.tmp_spawnid = spawnid;
					return 1;
				}
			}
		}
		con_add("ERROR: Missing info '" + Dinfo_name(1) + "' with ID #" + Str(spawnid) + ' - spawning player at center', Cbmpf_red);
		free_unit(id);
		set_unit(id, 1, 0, 0);
		G.tmp_spawnid = 0;
		return 0;
	}
}

//### Set Player
/** Function game_setplayer(id) */
export function game_setplayer(id: number): void {
	G.g_player = id;
	if (con_unit(id) === 0) RuntimeError('Unable to setup player #' + Str(id) + ' (game_setplayer)');
	G.g_cplayer = G.TCunit;
}

//### Set Cam Position
/** Function game_setcam() */
export function game_setcam(): number {
	let h: Handle = null;
	let typ = 0;
	let y = 0;
	switch (G.m_menu) {
		//Set to Player
		case 0:
			if (G.g_player !== 0) {
				h = G.g_cplayer!.h;
				typ = G.g_cplayer!.typ;
				HideEntity(G.g_cplayer!.mh);
				//Drive
				if (G.g_drive > 0) {
					//Player Still Living?
					if (G.g_cplayer!.health > 0) {
						//Unit exists?
						if (con_unit(G.g_drive)) {
							//Unit "living"?
							if (G.TCunit!.health_max > 0) {
								HideEntity(h);
								PositionEntity(h, EntityX(G.TCunit!.h), f32(EntityY(G.TCunit!.h) + Dunit_driveoffset(G.TCunit!.typ)), EntityZ(G.TCunit!.h));
								ShowEntity(h);
								PositionEntity(G.cam, EntityX(h), f32(EntityY(h) + Dunit_eyes(typ)), EntityZ(h));
								PositionEntity(G.camxz, EntityX(G.cam), 0, EntityZ(G.cam));
								//Reset AI Timer (Avoid AI Movement)
								G.TCunit!.ai_mode = 0;
								G.TCunit!.ai_duration = 5000;
								G.TCunit!.ai_timer = G.gt;
								//Reset Center
								if (Sqr(f32(fpow(f32(EntityX(G.TCunit!.h) - G.TCunit!.ai_cx), 2) + fpow(f32(EntityZ(G.TCunit!.h) - G.TCunit!.ai_cz), 2))) > 200) {
									G.TCunit!.ai_cx = EntityX(G.TCunit!.h);
									G.TCunit!.ai_cz = EntityZ(G.TCunit!.h);
								}
								//"Dead" Unit, stop driving!
							} else {
								G.g_drive = 0;
								PositionEntity(G.cam, EntityX(h), f32(EntityY(h) + Dunit_eyes(typ)), EntityZ(h));
								PositionEntity(G.camxz, EntityX(G.cam), 0, EntityZ(G.cam));
								return 1;
							}
							//Stop Driving when driven unit does not exist
						} else {
							G.g_drive = 0;
							PositionEntity(G.cam, EntityX(h), f32(EntityY(h) + Dunit_eyes(typ)), EntityZ(h));
							PositionEntity(G.camxz, EntityX(G.cam), 0, EntityZ(G.cam));
							return 1;
						}
						//Stop Driving when killed!
					} else {
						G.g_drive = 0;
						PositionEntity(G.cam, EntityX(h), EntityY(G.cam), EntityZ(h));
						TranslateEntity(G.cam, 0, -f32(1.5 * G.f), 0);
						y = e_tery(EntityX(G.cam), EntityZ(G.cam));
						if (EntityY(G.cam) < f32(y + 8)) {
							PositionEntity(G.cam, EntityX(G.cam), f32(y + 8), EntityZ(G.cam));
						}
						PositionEntity(G.camxz, EntityX(G.cam), 0, EntityZ(G.cam));
						return 1;
					}
					//Normal
				} else {
					//Living
					if (G.g_cplayer!.health > 0) {
						PositionEntity(G.cam, EntityX(h), f32(EntityY(h) + Dunit_eyes(typ)), EntityZ(h));
						PositionEntity(G.camxz, EntityX(G.cam), 0, EntityZ(G.cam));
						return 1;
						//Dead
					} else {
						PositionEntity(G.cam, EntityX(h), EntityY(G.cam), EntityZ(h));
						TranslateEntity(G.cam, 0, -f32(1.5 * G.f), 0);
						y = e_tery(EntityX(G.cam), EntityZ(G.cam));
						if (EntityY(G.cam) < f32(y + 8)) {
							PositionEntity(G.cam, EntityX(G.cam), f32(y + 8), EntityZ(G.cam));
						}
						PositionEntity(G.camxz, EntityX(G.cam), 0, EntityZ(G.cam));
						return 1;
					}
				}
			}
			return 0;
		//Buildsetup
		case Cmenu_if_buildsetup:
			if (con_unit(G.g_player)) {
				if (EntityY(G.TCunit!.h) < 0) {
					if (G.in_buildsetup_watersurface === 0) {
						if (EntityDistance(G.TCunit!.h, G.cam) < G.in_buildcamh) {
							TranslateEntity(G.cam, 0, f32(5 * G.f), 0);
							if (f32(EntityPitch(G.cam) + f32(1 * G.f)) < 85) RotateEntity(G.cam, f32(EntityPitch(G.cam) + f32(1 * G.f)), EntityYaw(G.cam), EntityRoll(G.cam));
							PositionEntity(G.camxz, EntityX(G.cam), 0, EntityZ(G.cam));
							if (EntityY(G.cam) > -1) PositionEntity(G.cam, EntityX(G.cam), -1, EntityZ(G.cam));
						}
					} else {
						if (EntityY(G.cam) < G.in_buildcamh * 2) {
							TranslateEntity(G.cam, 0, f32(5 * G.f), 0);
							if (f32(EntityPitch(G.cam) + f32(1 * G.f)) < 85) RotateEntity(G.cam, f32(EntityPitch(G.cam) + f32(1 * G.f)), EntityYaw(G.cam), EntityRoll(G.cam));
							PositionEntity(G.camxz, EntityX(G.cam), 0, EntityZ(G.cam));
						}
					}
				} else {
					if (EntityDistance(G.TCunit!.h, G.cam) < G.in_buildcamh) {
						TranslateEntity(G.cam, 0, f32(5 * G.f), 0);
						if (f32(EntityPitch(G.cam) + f32(1 * G.f)) < 85) RotateEntity(G.cam, f32(EntityPitch(G.cam) + f32(1 * G.f)), EntityYaw(G.cam), EntityRoll(G.cam));
						PositionEntity(G.camxz, EntityX(G.cam), 0, EntityZ(G.cam));
					}
				}
			}
			break;
		//Select Place
		case Cmenu_if_selplace:
			if (con_unit(G.g_player)) {
				if (EntityDistance(G.TCunit!.h, G.cam) < G.pc_sp_height) {
					TranslateEntity(G.cam, 0, f32(5 * G.f), 0);
					if (f32(EntityPitch(G.cam) + f32(1 * G.f)) < 85) RotateEntity(G.cam, f32(EntityPitch(G.cam) + f32(1 * G.f)), EntityYaw(G.cam), EntityRoll(G.cam));
					PositionEntity(G.camxz, EntityX(G.cam), 0, EntityZ(G.cam));
				}
			}
			break;
		//Movie
		case Cmenu_if_movie:
			seq_update();
			break;
	}
	return 0;
}

//### Move
/** Function game_move(speed#,diroff#,climbmax#=3.5) */
export function game_move(speed: number, diroff: number, climbmax: number = f32(3.5)): number {
	let h: Handle = null;
	let yaw = 0;
	let mx = 0;
	let mz = 0;
	//Cache / Calc
	speed = f32(speed * G.f);
	h = G.TCunit!.h;
	yaw = EntityYaw(h);
	mx = f32(Cos(f32(yaw + diroff)) * speed);
	mz = f32(Sin(f32(yaw + diroff)) * speed);

	//Move
	if (climbmax > 0) {
		//Take Account of Height Difference
		//Local t1#=e_tery(EntityX(h),EntityZ(h))
		//Local t2#=e_tery(EntityX(h)+mx#,EntityZ(h)+mz#)
		//If t1#>=t2# Then
		TranslateEntity(h, mx, 0, mz);
		return 1;
		//Else
		//	If (EntityY(h)-Dunit_colyr#(TCunit\typ))-t1#<15. Then
		//		Local dif#=t2#-t1#
		//		If dif#>climbmax# Then dif#=climbmax#
		//		Local perc#=1.0-(dif#/climbmax#)
		//		mx#=Cos(yaw#+diroff#)*(speed#*perc#)
		//		mz#=Sin(yaw#+diroff#)*(speed#*perc#)
		//		TranslateEntity h,mx#,0,mz#
		//		Return 1
		//	Else
		//		TranslateEntity h,mx#,0,mz#
		//	EndIf
		//EndIf
	} else {
		//Ignore Height Difference (e.g. while jumping)
		TranslateEntity(h, mx, 0, mz);
		return 1;
	}

	//Return 0   (never reached)
}

//### Use
/** Function game_use() */
export function game_use(): number {
	let Tunit_: Tunit | null = null;
	let target: Handle = null;
	let x = 0;
	let stored = 0;
	let itemtyp = 0;
	let oldcount = 0;
	let count = 0;
	let Titem_: Titem | null = null;
	let x2 = 0;

	//Stop Driving
	if (G.g_drive > 0) {
		//Event: on:getoff
		G.p_skipevent = 0;
		for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
			if (Tunit_.id === G.g_drive) {
				set_parsecache(Cclass_unit, Tunit_.id, 'getoff');
				if (Instr(Dunit_scriptk(Tunit_.typ), SEP_LINE + 'getoff')) {
					parse_task(Cclass_unit, Tunit_.id, 'getoff', '', Dunit_script(Tunit_.typ));
				}
				parse_sel(Cclass_unit, Tunit_.id, 'getoff');
				break;
			}
		}

		//Get off if not skipped
		if (G.p_skipevent === 0) {
			if (con_unit(G.g_drive)) {
				ai_mode(ai_idle);
			}
			G.g_drive = 0;
		}

		return 1;

		//Normal Using
	} else {
		//Pick (without water -> items and stuff have a higher priority!)
		target = CreatePivot();
		PositionEntity(target, EntityX(G.cam), EntityY(G.cam), EntityZ(G.cam));
		RotateEntity(target, EntityPitch(G.cam), EntityYaw(G.cam), EntityRoll(G.cam));
		MoveEntity(target, 0, 0, Cworld_userange);
		EntityPickMode(G.g_cplayer!.h, 0);
		G.in_pe = null;
		G.in_pe = LinePick(
			EntityX(G.cam),
			EntityY(G.cam),
			EntityZ(G.cam),
			f32(EntityX(target) - EntityX(G.cam)),
			f32(EntityY(target) - EntityY(G.cam)),
			f32(EntityZ(target) - EntityZ(G.cam)),
			Cworld_useradius
		);
		G.in_px = PickedX();
		G.in_py = PickedY();
		G.in_pz = PickedZ();
		EntityPickMode(G.g_cplayer!.h, 2, 1);
		//Picked nothing or terrain -> repick including the water
		if (G.in_pe === null || G.in_pe === G.ter) {
			EntityPickMode(G.env_sea2, 2, 1);
			EntityPickMode(G.g_cplayer!.h, 0);
			G.in_pe = null;
			G.in_pe = LinePick(
				EntityX(G.cam),
				EntityY(G.cam),
				EntityZ(G.cam),
				f32(EntityX(target) - EntityX(G.cam)),
				f32(EntityY(target) - EntityY(G.cam)),
				f32(EntityZ(target) - EntityZ(G.cam)),
				Cworld_useradius
			);
			G.in_px = PickedX();
			G.in_py = PickedY();
			G.in_pz = PickedZ();
			EntityPickMode(G.env_sea2, 0);
			EntityPickMode(G.g_cplayer!.h, 2, 1);
		}
		FreeEntity(target);
		//Script Vars
		G.pc_use_x = G.in_px;
		G.pc_use_y = G.in_py;
		G.pc_use_z = G.in_pz;
	}

	//None - Cancel
	if (G.in_pe === null) {
		return 0;
	}

	//Terrain
	if (G.in_pe === G.ter) {
		parse_globalevent('useground');
		//Return
		return 1;
	}

	//Water
	if (G.in_pe === G.env_sea2) {
		parse_globalevent('usesea');
		//Return
		return 1;
	}

	//Item?
	x = get_item(G.in_pe);
	if (x > -1) {
		//Event: on:collect
		G.p_skipevent = 0;
		set_parsecache(Cclass_item, x, 'collect');
		if (Instr(Ditem_scriptk(G.TCitem!.typ), SEP_LINE + 'collect')) {
			parse_task(Cclass_item, x, 'collect', '', Ditem_script(G.TCitem!.typ));
		}
		parse_sel(Cclass_item, x, 'collect');
		//FX & Store
		if (G.p_skipevent === 0) {
			if (!isNull(Titem, G.TCitem)) {
				stored = 0;
				itemtyp = G.TCitem!.typ;
				oldcount = countstored_items(Cclass_unit, G.g_player, itemtyp, 0);
				stored = store_item(x, Cclass_unit, G.g_player);
				count = countstored_items(Cclass_unit, G.g_player, itemtyp, 0);
				if (stored !== 0) {
					p_add2d(idivConst(G.set_scrx, 2), idivConst(G.set_scry, 2), -2, itemtyp);
					if_msg(ss(sm(180), Ditem_name(itemtyp), Str(count - oldcount)), Cbmpf_green);
					sfx(G.sfx_collect);
				} else {
					if_msg(sm(181), Cbmpf_red);
					sfx(G.sfx_fail);
					speech('nospace');
				}
			}
		}
		//Return
		return 1;
	}

	//Object?
	x = get_object(G.in_pe);
	if (x > -1) {
		//Object with Items hanging outside
		for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
			if (Titem_.parent_mode === Cpm_out) {
				if (Titem_.parent_class === Cclass_object) {
					if (Titem_.parent_id === x) {
						//Disable Picking on Parent Object
						EntityPickMode(G.TCobject!.h, 0);

						//Pick Again
						// quirk: this second pivot is never freed
						target = CreatePivot();
						PositionEntity(target, EntityX(G.cam), EntityY(G.cam), EntityZ(G.cam));
						RotateEntity(target, EntityPitch(G.cam), EntityYaw(G.cam), EntityRoll(G.cam));
						MoveEntity(target, 0, 0, Cworld_userange);
						EntityPickMode(G.g_cplayer!.h, 0);
						G.in_pe = null;
						G.in_pe = LinePick(
							EntityX(G.cam),
							EntityY(G.cam),
							EntityZ(G.cam),
							f32(EntityX(target) - EntityX(G.cam)),
							f32(EntityY(target) - EntityY(G.cam)),
							f32(EntityZ(target) - EntityZ(G.cam)),
							Cworld_useradius
						);
						G.in_px = PickedX();
						G.in_py = PickedY();
						G.in_pz = PickedZ();
						EntityPickMode(G.g_cplayer!.h, 2, 1);

						//Enable Picking on Parent Object
						if (Dobject_col(G.TCobject!.typ) > 0) {
							EntityPickMode(G.TCobject!.h, 2, 1);
						}

						//Item?
						x2 = get_item(G.in_pe);
						if (x2 > -1) {
							//Event: on:collect
							G.p_skipevent = 0;
							set_parsecache(Cclass_item, x2, 'collect');
							if (Instr(Ditem_scriptk(G.TCitem!.typ), SEP_LINE + 'collect')) {
								parse_task(Cclass_item, x2, 'collect', '', Ditem_script(G.TCitem!.typ));
							}
							parse_sel(Cclass_item, x2, 'collect');
							//FX & Store
							if (G.p_skipevent === 0) {
								if (!isNull(Titem, G.TCitem)) {
									stored = 0;
									itemtyp = G.TCitem!.typ;
									oldcount = countstored_items(Cclass_unit, G.g_player, itemtyp, 0);
									stored = store_item(x2, Cclass_unit, G.g_player);
									count = countstored_items(Cclass_unit, G.g_player, itemtyp, 0);
									if (stored !== 0) {
										p_add2d(idivConst(G.set_scrx, 2), idivConst(G.set_scry, 2), -2, itemtyp);
										if_msg(ss(sm(180), Ditem_name(itemtyp), Str(count - oldcount)), Cbmpf_green);
										sfx(G.sfx_collect);
									} else {
										if_msg(sm(181), Cbmpf_red);
										sfx(G.sfx_fail);
									}
								}
							}
							//Return
							return 1;
						}

						break;
					}
				}
			}
		}
		//Event: on:use
		use_object(x);
		//Return
		return 1;
	}

	//Unit?
	x = get_unit(G.in_pe);
	if (x > -1) {
		//Event: on:use
		use_unit(x);
		//Return
		return 1;
	}

	return 0;
}

//### Use as weapon
/** Function game_useasweapon(typ) */
export function game_useasweapon(typ: number): number {
	let Titem_: Titem | null = null;
	if (typ === -1) {
		con_unit(G.g_player);
		G.TCunit!.player_weapon = 0;
		G.TCunit!.player_ammo = 0;
		return 1;
	}
	if (typ === 0) return 0;
	con_unit(G.g_player);
	//Player got item of this type?
	for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
		if (Titem_.typ === typ) {
			if (Titem_.parent_class === Cclass_unit) {
				if (Titem_.parent_id === G.g_player) {
					G.TCunit!.player_weapon = typ;
					G.TCunit!.player_ammo = 0;
					game_ammo(G.g_player);
					//inhand Event
					if (Instr(Ditem_scriptk(typ), SEP_LINE + 'inhand')) {
						parse_task(Cclass_item, Titem_.id, 'inhand', '', Ditem_script(typ));
					}
					return 1;
				}
			}
		}
	}
	return 0;
}

//### Scrollweapon
/** Function game_scrollweapon(dir) */
export function game_scrollweapon(dir: number): number {
	let i = 0;
	let current = 0;
	let oldweapon = 0;
	con_unit(G.g_player);
	//No weapon? Find one!
	if (G.TCunit!.player_weapon === 0) {
		if (dir === 1) {
			for (i = 1; i <= 9; i++) {
				if (game_useasweapon(G.in_quickslot[i])) return 1;
			}
		} else {
			for (i = 9; i >= 1; i += -1) {
				if (game_useasweapon(G.in_quickslot[i])) return 1;
			}
		}
		return 0;
	}
	oldweapon = G.TCunit!.player_weapon;
	//Next weapon
	if (dir === 1) {
		//Determine current
		for (i = 1; i <= 9; i++) {
			if (G.in_quickslot[i] === oldweapon) {
				current = i;
				break;
			}
		}
		//Find & use next
		current = current + 1;
		for (i = current; i <= 9; i++) {
			if (game_useasweapon(G.in_quickslot[i])) return 1;
		}
		if (oldweapon !== 0) {
			game_useasweapon(-1);
			return 1;
		}
		// quirk: never reached, oldweapon is not 0 here
		for (i = 1; i <= 9; i++) {
			if (game_useasweapon(G.in_quickslot[i])) return 1;
		}
		//Prev weapon
	} else {
		//Determine current
		for (i = 1; i <= 9; i++) {
			if (G.in_quickslot[i] === oldweapon) {
				current = i;
				break;
			}
		}
		//Find & use next
		current = current - 1;
		if (current > 0) {
			for (i = current; i >= 1; i += -1) {
				if (game_useasweapon(G.in_quickslot[i])) return 1;
			}
		}
		if (oldweapon !== 0) {
			game_useasweapon(-1);
			return 1;
		}
		// quirk: never reached, oldweapon is not 0 here
		for (i = 9; i >= 1; i += -1) {
			if (game_useasweapon(G.in_quickslot[i])) return 1;
		}
	}
	return 0;
}

//### Attack 1
/** Function game_attack1() */
export function game_attack1(): number {
	let wexists = 0;
	let Titem_: Titem | null = null;
	let speed = 0;
	let i = 0;
	let argx = 0;
	let argy = 0;
	let argz = 0;
	let argsize = 0;
	let arga = 0;
	con_unit(G.g_player);

	//pro_add(g_player,21,EntityPitch(cam),EntityYaw(cam))

	//No Weapon (Hands)
	if (G.TCunit!.player_weapon === 0) {
		G.p_skipevent = 0;
		set_parsecache(Cclass_unit, G.TCunit!.id, 'attack1');
		if (Instr(Dunit_scriptk(G.TCunit!.typ), SEP_LINE + 'attack1')) {
			parse_task(Cclass_unit, G.TCunit!.id, 'attack1', '', Dunit_script(G.TCunit!.typ));
		}
		parse_sel(Cclass_unit, G.TCunit!.id, 'attack1');
		if (G.p_skipevent === 0) {
			if (game_wpn_none(G.g_player)) sfx_emit(G.sfx_swing_slow, G.cam);
		}

		//Weapon
	} else {
		//Weapon exists?
		wexists = 0;
		for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
			if (Titem_.typ === G.TCunit!.player_weapon) {
				if (Titem_.parent_class === Cclass_unit) {
					if (Titem_.parent_id === G.g_player) {
						wexists = 1;
						break;
					}
				}
			}
		}
		if (wexists === 0) return 0;

		//Skip
		speed = Ditem_rate(G.TCunit!.player_weapon);
		if (G.gt - G.TCunit!.player_lastattack < speed) return 0;

		//Event: on:attack1
		G.p_skipevent = 0;
		if (get_stored_item(G.TCunit!.player_weapon, Cclass_unit, G.g_player)) {
			set_parsecache(Cclass_item, G.TCitem!.id, 'attack1');
			if (Instr(Ditem_scriptk(G.TCitem!.typ), SEP_LINE + 'attack1')) {
				parse_task(Cclass_item, G.TCitem!.id, 'attack1', '', Ditem_script(G.TCitem!.typ));
			}
			parse_sel(Cclass_item, G.TCitem!.id, 'attack1');
		}
		parse_emuevent(Cclass_unit, G.g_player, 'attack1');

		if (G.p_skipevent === 0) {
			switch (Ditem_behaviour(G.TCunit!.player_weapon)) {
				//Use
				case 'useenv':
					game_use();
					break;

				//Hammer
				case 'hammer':
					if (game_wpn_blade(G.g_player)) sfx_emit(G.sfx_swing_slow, G.cam);
					break;

				//Spade
				case 'spade':
					if (game_wpn_blade(G.g_player)) sfx_emit(G.sfx_swing_slow, G.cam);
					break;

				//Net
				case 'net':
					if (game_wpn_blade(G.g_player)) sfx_emit(G.sfx_swing_slow, G.cam);
					break;

				//Fisihingrod
				case 'fishingrod':
					if (game_wpn_blade(G.g_player)) sfx_emit(G.sfx_swing_slow, G.cam);
					break;

				//Torch
				case 'torch':
					if (game_wpn_blade(G.g_player)) sfx_emit(G.sfx_swing_slow, G.cam);
					break;

				//Blades
				case 'slowblade':
					if (game_wpn_blade(G.g_player)) sfx_emit(G.sfx_swing_slow, G.cam);
					break;
				case 'blade':
					if (game_wpn_blade(G.g_player)) sfx_emit(G.sfx_swing_slow, G.cam);
					break;
				case 'fastblade':
					if (game_wpn_blade(G.g_player)) sfx_emit(G.sfx_swing_fast, G.cam);
					break;

				//Distance
				case 'slingshot':
					if (game_wpn_distance(G.g_player)) sfx_emit(G.sfx_swing_fast, G.cam);
					break;
				case 'bow':
					if (game_wpn_distance(G.g_player)) sfx_emit(G.sfx_swing_fast, G.cam);
					break;
				case 'launcher':
					if (game_wpn_distance(G.g_player)) {
						sfx_emit(G.sfx_launch, G.cam);
						if (G.set_effects > 0) {
							for (i = 1; i <= 5; i++) {
								// exe: arguments evaluated z, size, alpha, y, x
								argz = f32(EntityZ(G.cam) + Rnd(-3, 3));
								argsize = Rnd(5, 7);
								arga = Rnd(0.4, 0.7);
								argy = f32(EntityY(G.cam) + Rnd(-3, 3));
								argx = f32(EntityX(G.cam) + Rnd(-3, 3));
								p_add(argx, argy, argz, Cp_smoke, argsize, arga);
							}
						}
					}
					break;
				case 'catapult':
					if (game_wpn_distance(G.g_player)) sfx_emit(G.sfx_swing_fast, G.cam);
					break;

				//Distance (Fire)
				case 'pistol':
					if (game_wpn_distancef(G.g_player)) sfx_emit(G.sfx_pistol, G.cam);
					break;
				case 'gun':
					game_wpn_distancef(G.g_player);
					break;
				case 'machinegun':
					game_wpn_distancef(G.g_player);
					break;

				//Distance (Selfthrow)
				case 'selfthrow':
					game_wpn_selfthrow(G.g_player);
					break;
				case 'spear':
					if (game_wpn_selfthrow(G.g_player)) sfx_emit(G.sfx_swing_fast, G.cam);
					break;
				case 'killthrow':
					if (game_wpn_selfthrow(G.g_player)) sfx_emit(G.sfx_swing_fast, G.cam);
					break;
				case 'throw':
					if (game_wpn_selfthrow(G.g_player)) sfx_emit(G.sfx_swing_fast, G.cam);
					break;

				//Default
				default:
					//Determine by Instr.
					if (Instr(Ditem_behaviour(G.TCunit!.player_weapon), 'selfthrow')) {
						game_wpn_selfthrow(G.g_player);
					} else if (Instr(Ditem_behaviour(G.TCunit!.player_weapon), 'spear')) {
						if (game_wpn_selfthrow(G.g_player)) sfx_emit(G.sfx_swing_fast, G.cam);
					} else if (Instr(Ditem_behaviour(G.TCunit!.player_weapon), 'killthrow')) {
						if (game_wpn_selfthrow(G.g_player)) sfx_emit(G.sfx_swing_fast, G.cam);
					} else if (Instr(Ditem_behaviour(G.TCunit!.player_weapon), 'throw')) {
						if (game_wpn_selfthrow(G.g_player)) sfx_emit(G.sfx_swing_fast, G.cam);
						//Just Use Item
					} else {
						if (G.in_keyhit[Ckey_attack1]) {
							for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
								if (Titem_.parent_class === Cclass_unit) {
									if (Titem_.parent_id === G.g_player) {
										if (Titem_.typ === G.TCunit!.player_weapon) {
											use_item(Titem_.id);
										}
									}
								}
							}
						}
					}
			}
		}
	}
	return 0;
}

//### Attack 2
/** Function game_attack2() */
export function game_attack2(): number {
	let wexists = 0;
	let Titem_: Titem | null = null;
	con_unit(G.g_player);

	//No Weapon (Hands)
	if (G.TCunit!.player_weapon === 0) {
		game_use();
		parse_emuevent(Cclass_unit, G.g_player, 'attack2');

		//Weapon
	} else {
		//Weapon exists?
		wexists = 0;
		for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
			if (Titem_.typ === G.TCunit!.player_weapon) {
				if (Titem_.parent_class === Cclass_unit) {
					if (Titem_.parent_id === G.g_player) {
						wexists = 1;
						break;
					}
				}
			}
		}
		if (wexists === 0) return 0;

		//Event: on:attack2
		G.p_skipevent = 0;
		if (get_stored_item(G.TCunit!.player_weapon, Cclass_unit, G.g_player)) {
			set_parsecache(Cclass_item, G.TCitem!.id, 'attack2');
			if (Instr(Ditem_scriptk(G.TCitem!.typ), SEP_LINE + 'attack2')) {
				parse_task(Cclass_item, G.TCitem!.id, 'attack2', '', Ditem_script(G.TCitem!.typ));
			}
			parse_sel(Cclass_item, G.TCitem!.id, 'attack2');
		}
		parse_emuevent(Cclass_unit, G.g_player, 'attack2');

		if (G.p_skipevent === 0) {
			switch (Ditem_behaviour(G.TCunit!.player_weapon)) {
				//Hammer
				case 'hammer':
					game_build();
					break;

				//Spade
				case 'spade':
					if (G.pc_typ === 0) {
						//Add Dig State
						G.pc_typ = Cstate_pc_dig;
						G.pc_gt = G.gt;
						G.in_focus = G.pc_typ;
					}
					break;

				//Fishingrod
				case 'fishingrod':
					if (G.pc_typ === 0) {
						//Add Fish State
						G.pc_typ = Cstate_pc_fish;
						G.pc_gt = G.gt;
						G.in_focus = G.pc_typ;
						sfx(G.sfx_fish);
					}
					break;

				//Net
				case 'net':
					game_catch(Ditem_speed(G.TCunit!.player_weapon));
					break;

				//Distance
				case 'slingshot':
					game_ammo(G.g_player);
					break;
				case 'bow':
					game_ammo(G.g_player);
					break;
				case 'launcher':
					game_ammo(G.g_player);
					break;
				case 'catapult':
					game_ammo(G.g_player);
					break;

				//Distance (Fire)
				case 'pistol':
					game_ammo(G.g_player);
					break;
				case 'gun':
					game_ammo(G.g_player);
					break;
				case 'machinegun':
					game_ammo(G.g_player);
					break;
			}
		}
	}
	return 0;
}

//### Ammo
/** Function game_ammo(id) */
export function game_ammo(id: number): number {
	let wpn = '';
	let Tcache_: Tcache | null = null;
	let c = 0;
	let Titem_: Titem | null = null;
	let tmp = '';
	let foundincache = 0;
	//Get
	con_unit(id);
	wpn = 'ammo:' + Str(G.TCunit!.player_weapon);
	//Free Cache
	for (Tcache_ = First(Tcache); Tcache_ !== null; Tcache_ = After(Tcache, Tcache_)) {
		Delete(Tcache, Tcache_);
	}
	//Save matching stored Ammo to Cache
	c = 0;
	for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
		if (Titem_.parent_class === Cclass_unit) {
			if (Titem_.parent_id === id) {
				if (Instr(Ditem_behaviour(Titem_.typ), wpn) > 0) {
					tmp = Ditem_behaviour(Titem_.typ);
					tmp = Replace(tmp, ' ', ',');
					tmp = Replace(tmp, ';', ',');
					tmp = tmp + ',';
					if (Instr(tmp, wpn + ',') > 0) {
						Tcache_ = New(Tcache);
						Tcache_.id = Titem_.typ;
						c = c + 1;
					}
				}
			}
		}
	}
	//None
	if (c === 0) {
		G.TCunit!.player_ammo = 0;
		return 0;
	}
	//First in Cache
	if (G.TCunit!.player_ammo === 0) {
		Tcache_ = First(Tcache);
		G.TCunit!.player_ammo = Tcache_!.id;
		return 1;
		//Next in Cache
	} else {
		//Only if current Ammo does not fit
		if (Instr(Ditem_behaviour(G.TCunit!.player_ammo), wpn) > 0) {
			foundincache = 0;
			for (Tcache_ = First(Tcache); Tcache_ !== null; Tcache_ = After(Tcache, Tcache_)) {
				if (foundincache === 1) {
					G.TCunit!.player_ammo = Tcache_.id;
					return 1;
				} else {
					if (Tcache_.id === G.TCunit!.player_ammo) foundincache = 1;
				}
			}
		} else {
			Tcache_ = First(Tcache);
			G.TCunit!.player_ammo = Tcache_!.id;
			return 1;
		}
		//Failed? First!
		Tcache_ = First(Tcache);
		G.TCunit!.player_ammo = Tcache_!.id;
		return 1;
	}
}

//### Set Ammo by Type
/** Function game_ammo_bytype(typ) */
export function game_ammo_bytype(typ: number): number {
	let wpn = '';
	let Titem_: Titem | null = null;
	let tmp = '';
	if (!isNull(Tunit, G.g_cplayer)) {
		wpn = 'ammo:' + Str(G.g_cplayer!.player_weapon);
		for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
			if (Titem_.typ === typ) {
				if (Titem_.parent_class === Cclass_unit) {
					if (Titem_.parent_id === G.g_cplayer!.id) {
						if (Instr(Ditem_behaviour(Titem_.typ), wpn)) {
							tmp = Ditem_behaviour(Titem_.typ);
							tmp = Replace(tmp, ' ', ',');
							tmp = Replace(tmp, ';', ',');
							tmp = tmp + ',';
							if (Instr(tmp, wpn + ',') > 0) {
								G.g_cplayer!.player_ammo = typ;
								return 1;
							}
						}
					}
				}
			}
		}
	}
	return 0;
}

//### Set Weapon by Type
/** Function game_weapon_bytype(typ) */
export function game_weapon_bytype(typ: number): number {
	let Titem_: Titem | null = null;
	if (!isNull(Tunit, G.g_cplayer)) {
		for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
			if (Titem_.typ === typ) {
				if (Titem_.parent_class === Cclass_unit) {
					if (Titem_.parent_id === G.g_cplayer!.id) {
						G.g_cplayer!.player_weapon = typ;
						return 1;
					}
				}
			}
		}
	}
	return 0;
}

//### Picking
/** Function game_picking(mode) */
export function game_picking(mode: number): void {
	let Tobject_: Tobject | null = null;
	let Tunit_: Tunit | null = null;
	let Titem_: Titem | null = null;
	//Picking ON
	if (mode === 1) {
		//Objects
		for (Tobject_ = First(Tobject); Tobject_ !== null; Tobject_ = After(Tobject, Tobject_)) {
			if (Dobject_col(Tobject_.typ) > 0) {
				EntityPickMode(Tobject_.h, 2, 1);
			}
		}
		//Units
		for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
			EntityPickMode(Tunit_.mh, 2, 1);
		}
		//Items
		for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
			if (Ditem_radius(Titem_.typ) === 0) {
				EntityPickMode(Titem_.h, 2, 1);
			} else {
				EntityPickMode(Titem_.h, 1, 1);
			}
		}
		//Picking OFF
	} else {
		//Objects
		for (Tobject_ = First(Tobject); Tobject_ !== null; Tobject_ = After(Tobject, Tobject_)) {
			EntityPickMode(Tobject_.h, 0, 0);
		}
		//Units
		for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
			EntityPickMode(Tunit_.mh, 0, 0);
		}
		//Items
		for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
			EntityPickMode(Titem_.h, 0, 0);
		}
	}
}

//### Damage
/** Function game_damage(entity,damage#,causer,pickcords=0,bycollisionpivot=0) */
export function game_damage(entity: Handle, damage: number, causer: number, pickcords: number = 0, bycollisionpivot: number = 0): number {
	G.tmp_kill = 0;
	//Item?
	if (get_item(entity) > -1) {
		if (causer === G.g_player) {
			//Event: on:hit
			set_parsecache(Cclass_item, G.TCitem!.id, 'hit');
			if (Instr(Ditem_scriptk(G.TCitem!.typ), SEP_LINE + 'hit')) {
				parse_task(Cclass_item, G.TCitem!.id, 'hit', '', Ditem_script(G.TCitem!.typ));
			}
		}
		if (!isNull(Titem, G.TCitem)) {
			G.tmp_class = Cclass_item;
			G.tmp_id = G.TCitem!.id;
			damage_item(damage, 0, pickcords);
		}
		return 1;
		//Unit?
	} else if (get_unit(entity, bycollisionpivot) > -1) {
		if (causer === G.g_player) {
			//Event: on:hit
			set_parsecache(Cclass_unit, G.TCunit!.id, 'hit');
			if (Instr(Dunit_scriptk(G.TCunit!.typ), SEP_LINE + 'hit')) {
				parse_task(Cclass_unit, G.TCunit!.id, 'hit', '', Dunit_script(G.TCunit!.typ));
			}
		}
		if (!isNull(Tunit, G.TCunit)) {
			G.tmp_class = Cclass_unit;
			G.tmp_id = G.TCunit!.id;
			hurt_unit(damage, 0, pickcords);
		}
		return 1;
		//Object?
	} else if (get_object(entity) > -1) {
		if (causer === G.g_player) {
			//Event: on:hit
			set_parsecache(Cclass_object, G.TCobject!.id, 'hit');
			if (Instr(Dobject_scriptk(G.TCobject!.typ), SEP_LINE + 'hit')) {
				parse_task(Cclass_object, G.TCobject!.id, 'hit', '', Dobject_script(G.TCobject!.typ));
			}
		}
		if (!isNull(Tobject, G.TCobject)) {
			G.tmp_class = Cclass_object;
			G.tmp_id = G.TCobject!.id;
			damage_object(damage, 0, pickcords);
		}
		return 1;
	}
	//Failed
	return 0;
}

//### Fall Damage
/** Function game_falldamage() */
export function game_falldamage(): void {
	let dif = 0;
	let perc = 0;
	let max = 0;
	let damage = 0;
	//con_add("falldamage ...")
	dif = f32(G.TCunit!.phy_fally - EntityY(G.TCunit!.h));
	if (dif > G.game_fallminy) {
		perc = f32(dif - G.game_fallminy);
		max = f32(G.game_fallmaxy - G.game_fallminy);
		damage = f32(f32(perc / max) * G.game_falldamage);
		//con_add("falldamage!!! -> "+damage#+" (falldistance="+dif+")",Cbmpf_red)
		hurt_unit(damage);
	}
}

//### Sleep
/** Function game_sleep() */
export function game_sleep(): void {
	//Script Event Sleep
	parse_globalevent('sleep');
	G.tmp_skipevent = 0;
	parse_sel_event('sleep');

	if (G.tmp_skipevent === 0) {
		G.g_sleep = 1; //reset in cull.bb

		//Change Time
		if (G.map_timeupdate === 0) {
			G.map_lday = G.map_day;
			G.map_lhour = G.map_hour;
			G.map_lminute = G.map_minute;
			//Inc. Hour
			if (G.map_lminute >= 60) {
				G.map_lminute = 0;
				G.map_lhour = G.map_lhour + 1;
				//Inc. Day
				if (G.map_lhour >= 24) {
					G.map_lhour = 0;
					G.map_lday = G.map_lday + 1;
				}
			}
			G.map_timeupdate = 1;
		}
		//Update
		G.in_tgametime = G.gt;
		//Change Time or Just the Day
		if (G.map_freezetime === 0) {
			//Sleep until next Morning
			if (G.map_hour >= 12) {
				G.map_hour = 7;
				G.map_minute = 0;
				//Change Day Update Stuff
				game_cd();
				G.map_day = G.map_day + 1;
				//Sleep 6 hours
			} else {
				G.map_hour = G.map_hour + 6;
			}
		} else {
			//Time frozen -> Just Increase Day!
			G.map_day = G.map_day + 1;
		}

		//Fadesprite
		p_add(0, 0, 0, Cp_flash, f32(0.01), 1.5);
		EntityColor(G.TCp!.h, 0, 0, 0);

		//SFX
		sfx(G.sfx_sleep);

		//Update Light
		e_environment_update_light();
	}

	//g_sleep=0 reset in cull.bb
	//reset in cull.bb because of script command
}

//### Exhaust
/** Function game_exhaust(hunger#,thirst#,exhaustion#) */
export function game_exhaust(hunger: number, thirst: number, exhaustion: number): void {
	G.TCunit!.hunger = f32(G.TCunit!.hunger + hunger);
	G.TCunit!.thirst = f32(G.TCunit!.thirst + thirst);
	G.TCunit!.exhaustion = f32(G.TCunit!.exhaustion + exhaustion);
	if (G.TCunit!.hunger > Dunit_store(G.TCunit!.typ)) G.TCunit!.hunger = Dunit_store(G.TCunit!.typ);
	if (G.TCunit!.thirst > Dunit_store(G.TCunit!.typ)) G.TCunit!.thirst = Dunit_store(G.TCunit!.typ);
	if (G.TCunit!.exhaustion > Dunit_store(G.TCunit!.typ)) G.TCunit!.exhaustion = Dunit_store(G.TCunit!.typ);
}

//### Dig
/** Function game_dig(range=100) */
export function game_dig(range: number = 100): number {
	let skip = 0;
	let Tinfo_: Tinfo | null = null;
	let p: Handle = null;
	let stored = 0;
	let itemtyp = 0;
	let count = 0;
	let Tobject_: Tobject | null = null;
	let Tunit_: Tunit | null = null;
	let Titem_: Titem | null = null;
	skip = 0;
	con_add('DIG');
	//Infos
	for (Tinfo_ = First(Tinfo); Tinfo_ !== null; Tinfo_ = After(Tinfo, Tinfo_)) {
		if (EntityDistance(Tinfo_.h, G.cam) < range) {
			skip = set_parsecache(Cclass_info, Tinfo_.id, 'dig');
		}
		//Digging Area
		if (Tinfo_.typ === 42) {
			if (f32(dist(EntityX(Tinfo_.h), EntityZ(Tinfo_.h), EntityX(G.cam), EntityZ(G.cam)) - Tinfo_.floats[0]) < range) {
				if (skip === 0) {
					skip = set_parsecache(Cclass_info, Tinfo_.id, 'dig');
				}
				if (item_getrandom(Cclass_info, Tinfo_.id)) {
					p = CreatePivot();
					PositionEntity(p, EntityX(G.cam), EntityY(G.cam), EntityZ(G.cam));
					RotateEntity(p, 0, EntityYaw(G.cam), 0);
					MoveEntity(p, 0, 0, 50);
					stored = 0;
					if (unstore_item(G.TCitem!.id, 1, 0, EntityX(p), f32(e_tery(EntityX(p), EntityZ(p)) + 20), EntityZ(p))) {
						if (!isNull(Titem, G.TCitem)) {
							itemtyp = G.TCitem!.typ;
							count = G.TCitem!.count;
							if (store_item(G.TCitem!.id, Cclass_unit, G.g_player) !== 0) {
								p_add2d(idivConst(G.set_scrx, 2), idivConst(G.set_scry, 2), -2, itemtyp);
								if_msg(ss(sm(180), Ditem_name(itemtyp), Str(count)), Cbmpf_green);
								sfx(G.sfx_collect);
								stored = 1;
							}
						}
					}
					FreeEntity(p);
					if (stored === 0) {
						if_msg(sm(181), Cbmpf_red);
						sfx(G.sfx_fail);
					}
					//If countstored_items(Cclass_info,Tinfo\id)=0 Then
					//free_info(Tinfo\id)
					//EndIf
					//Else
					//free_info(Tinfo\id)
				}
				skip = 1;
			}
		}
		if (skip) return 1;
	}
	con_add('DIG NOINFO');
	//Objects
	for (Tobject_ = First(Tobject); Tobject_ !== null; Tobject_ = After(Tobject, Tobject_)) {
		if (EntityDistance(Tobject_.h, G.cam) < range) {
			skip = set_parsecache(Cclass_object, Tobject_.id, 'dig');
			if (Instr(Dobject_scriptk(Tobject_.typ), SEP_LINE + 'dig')) {
				parse_task(Cclass_object, Tobject_.id, 'dig', '', Dobject_script(Tobject_.typ));
				skip = 1;
			}
			if (skip) return 1;
		}
	}
	con_add('DIG NOOBJECT');
	for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
		if (EntityDistance(Tunit_.h, G.cam) < range) {
			skip = set_parsecache(Cclass_unit, Tunit_.id, 'dig');
			if (Instr(Dunit_scriptk(Tunit_.typ), SEP_LINE + 'dig')) {
				parse_task(Cclass_unit, Tunit_.id, 'dig', '', Dunit_script(Tunit_.typ));
				skip = 1;
			}
			if (skip) return 1;
		}
	}
	con_add('DIG NOUNIT');
	for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
		if (Titem_.parent_mode !== Cpm_in) {
			if (EntityDistance(Titem_.h, G.cam) < range) {
				skip = set_parsecache(Cclass_item, Titem_.id, 'dig');
				if (Instr(Ditem_scriptk(Titem_.typ), SEP_LINE + 'dig')) {
					parse_task(Cclass_item, Titem_.id, 'dig', '', Ditem_script(Titem_.typ));
					skip = 1;
				}
				if (skip) return 1;
			}
		}
	}
	con_add('DIG NOITEM');
	//Failure
	parse_globalevent('dig_failure');
	return 0;
}

//### Fish
/** Function game_fish(range=150) */
export function game_fish(range: number = 150): number {
	let Tinfo_: Tinfo | null = null;
	let skip = 0;
	let p: Handle = null;
	let stored = 0;
	let itemtyp = 0;
	let count = 0;
	let Tobject_: Tobject | null = null;
	let Tunit_: Tunit | null = null;
	let Titem_: Titem | null = null;
	let success = 0;
	let h: Handle = null;
	let c: Handle = null;
	let i = 0;
	let tery = 0;
	//Infos
	for (Tinfo_ = First(Tinfo); Tinfo_ !== null; Tinfo_ = After(Tinfo, Tinfo_)) {
		if (EntityDistance(Tinfo_.h, G.cam) < range) {
			skip = set_parsecache(Cclass_info, Tinfo_.id, 'fish');
		}
		//Fishing Area
		if (Tinfo_.typ === 43) {
			if (f32(dist(EntityX(Tinfo_.h), EntityZ(Tinfo_.h), EntityX(G.cam), EntityZ(G.cam)) - Tinfo_.floats[0]) < range) {
				if (item_getrandom(Cclass_info, Tinfo_.id)) {
					p = CreatePivot();
					PositionEntity(p, EntityX(G.cam), EntityY(G.cam), EntityZ(G.cam));
					RotateEntity(p, 0, EntityYaw(G.cam), 0);
					MoveEntity(p, 0, 0, 50);
					stored = 0;
					if (unstore_item(G.TCitem!.id, 1, 0, EntityX(p), f32(e_tery(EntityX(p), EntityZ(p)) + 20), EntityZ(p))) {
						if (!isNull(Titem, G.TCitem)) {
							itemtyp = G.TCitem!.typ;
							count = G.TCitem!.count;
							if (store_item(G.TCitem!.id, Cclass_unit, G.g_player) !== 0) {
								p_add2d(idivConst(G.set_scrx, 2), idivConst(G.set_scry, 2), -2, itemtyp);
								if_msg(ss(sm(180), Ditem_name(itemtyp), Str(count)), Cbmpf_green);
								sfx(G.sfx_collect);
								stored = 1;
							}
						}
					}
					FreeEntity(p);
					if (stored === 0) {
						if_msg(sm(181), Cbmpf_red);
						sfx(G.sfx_fail);
					}
					//If countstored_items(Cclass_info,Tinfo\id)=0 Then
					//	free_info(Tinfo\id)
					//EndIf
					//Else
					//free_info(Tinfo\id)
				}
				skip = 1;
			}
		}
		if (skip) return 1;
	}
	//Objects
	for (Tobject_ = First(Tobject); Tobject_ !== null; Tobject_ = After(Tobject, Tobject_)) {
		if (EntityDistance(Tobject_.h, G.cam) < range) {
			skip = set_parsecache(Cclass_object, Tobject_.id, 'fish');
			if (Instr(Dobject_scriptk(Tobject_.typ), SEP_LINE + 'fish')) {
				parse_task(Cclass_object, Tobject_.id, 'fish', '', Dobject_script(Tobject_.typ));
				skip = 1;
			}
			if (skip) return 1;
		}
	}
	for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
		if (EntityDistance(Tunit_.h, G.cam) < range) {
			skip = set_parsecache(Cclass_unit, Tunit_.id, 'fish');
			if (Instr(Dunit_scriptk(Tunit_.typ), SEP_LINE + 'fish')) {
				parse_task(Cclass_unit, Tunit_.id, 'fish', '', Dunit_script(Tunit_.typ));
				skip = 1;
			}
			if (skip) return 1;
		}
	}
	for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
		if (EntityDistance(Titem_.h, G.cam) < range) {
			if (Titem_.parent_mode !== Cpm_in) {
				skip = set_parsecache(Cclass_item, Titem_.id, 'fish');
				if (Instr(Ditem_scriptk(Titem_.typ), SEP_LINE + 'fish')) {
					parse_task(Cclass_item, Titem_.id, 'fish', '', Ditem_script(Titem_.typ));
					skip = 1;
				}
				if (skip) return 1;
			}
		}
	}
	//Nothing - Check if there is Water
	success = 0;
	EntityPickMode(G.g_cplayer!.h, 0);
	EntityPickMode(G.env_sea2, 2, 1);
	h = CameraPick(G.cam, idivConst(G.set_scrx, 2), idivConst(G.set_scry, 2));
	if (h === G.env_sea2) {
		p = CreatePivot();
		PositionEntity(p, PickedX(), PickedY(), PickedZ());
		if (EntityDistance(p, G.cam) <= 100) {
			success = 1;
		}
		FreeEntity(p);
	}
	if (success === 0) {
		c = CreateCamera();
		PositionEntity(c, EntityX(G.cam), EntityY(G.cam), EntityZ(G.cam));
		for (i = 1; i <= 4; i++) {
			RotateEntity(c, 0, EntityYaw(G.cam), 0);
			MoveEntity(c, 0, 0, 25);
			// quirk: tery is an Int: the terrain height is rounded
			tery = Int(TerrainY(G.ter, EntityX(c), EntityY(c), EntityZ(c)));
			if (tery < 0) tery = 0;
			if (EntityY(c) < tery) {
				PositionEntity(c, EntityX(c), tery + 5, EntityZ(c));
			}
			RotateEntity(c, 90, 0, 0);
			h = CameraPick(c, idivConst(G.set_scrx, 2), idivConst(G.set_scry, 2));
			if (h === G.env_sea2) {
				success = 1;
				break;
			}
		}
		FreeEntity(c);
	}
	EntityPickMode(G.env_sea2, 0);
	EntityPickMode(G.g_cplayer!.h, 2, 1);
	if (success === 1) {
		//Water -> Success
		parse_globalevent('fish_success');
	} else {
		//No Water -> Failure
		parse_globalevent('fish_failure');
	}
	return 0;
}

//### Net
/** Function game_catch(range#=200) */
export function game_catch(range: number = 200): number {
	let target: Handle = null;
	let skip = 0;
	let Tobject_: Tobject | null = null;
	let Tunit_: Tunit | null = null;
	let Titem_: Titem | null = null;
	//Timer Stuff
	con_unit(G.g_player);
	if (G.gt - G.TCunit!.player_lastattack < Ditem_rate(G.TCunit!.player_weapon)) return 0;
	G.TCunit!.player_lastattack = G.gt;

	//Pick
	target = CreatePivot();
	PositionEntity(target, EntityX(G.cam), EntityY(G.cam), EntityZ(G.cam));
	RotateEntity(target, EntityPitch(G.cam), EntityYaw(G.cam), EntityRoll(G.cam));
	MoveEntity(target, 0, 0, range);
	EntityPickMode(G.g_cplayer!.h, 0);
	EntityPickMode(G.env_sea2, 0);
	G.in_pe = null;
	G.in_pe = LinePick(
		EntityX(G.cam),
		EntityY(G.cam),
		EntityZ(G.cam),
		f32(EntityX(target) - EntityX(G.cam)),
		f32(EntityY(target) - EntityY(G.cam)),
		f32(EntityZ(target) - EntityZ(G.cam)),
		Cworld_useradius
	);
	G.in_px = PickedX();
	G.in_py = PickedY();
	G.in_pz = PickedZ();
	FreeEntity(target);
	EntityPickMode(G.g_cplayer!.h, 2, 1);

	//SFX
	sfx_emit(G.sfx_swing_slow, G.cam);

	//FX
	p_add(Rand(-1, 2), 0, 0, Cp_attack, 12, 0.5);

	if (G.in_pe === G.ter) return 0;

	skip = 0;

	if (G.in_pe !== null) {
		if (ha_getclass(G.in_pe, 0)) {
			switch (G.tmp_class) {
				//Object
				case Cclass_object:
					Tobject_ = G.TCobject;
					skip = set_parsecache(Cclass_object, Tobject_!.id, 'catch');
					if (Instr(Dobject_scriptk(Tobject_!.typ), SEP_LINE + 'catch')) {
						parse_task(Cclass_object, Tobject_!.id, 'catch', '', Dobject_script(Tobject_!.typ));
						skip = 1;
					}
					if (skip) return 1;
					break;
				//Unit
				case Cclass_unit:
					Tunit_ = G.TCunit;
					skip = set_parsecache(Cclass_unit, Tunit_!.id, 'catch');
					if (Instr(Dunit_scriptk(Tunit_!.typ), SEP_LINE + 'catch')) {
						parse_task(Cclass_unit, Tunit_!.id, 'catch', '', Dunit_script(Tunit_!.typ));
						skip = 1;
					}
					if (skip) return 1;
					break;
				//Item
				case Cclass_item:
					Titem_ = G.TCitem;
					skip = set_parsecache(Cclass_item, Titem_!.id, 'catch');
					if (Instr(Ditem_scriptk(Titem_!.typ), SEP_LINE + 'catch')) {
						parse_task(Cclass_item, Titem_!.id, 'catch', '', Ditem_script(Titem_!.typ));
						skip = 1;
					}
					if (skip) return 1;
					break;
			}
		}
	}
	//Failure
	parse_globalevent('catch_failure');
	return 0;
}

//### Explosion
/** Function game_explosion(x#,y#,z#,range#=50.,damage#=50.,style=1) */
export function game_explosion(x: number, y: number, z: number, range: number = 50, damage: number = 50, style: number = 1): void {
	let p: Handle = null;
	let Tobject_: Tobject | null = null;
	let Tunit_: Tunit | null = null;
	let Titem_: Titem | null = null;
	let size = 0;
	let i = 0;
	let argx = 0;
	let argy = 0;
	let argz = 0;
	let argsize = 0;
	let arga = 0;
	p = CreatePivot();
	PositionEntity(p, x, y, z);
	//Damage
	for (Tobject_ = First(Tobject); Tobject_ !== null; Tobject_ = After(Tobject, Tobject_)) {
		if (EntityDistance(Tobject_.h, p) < range) {
			G.TCobject = Tobject_;
			damage_object(damage, 0, 0);
		}
	}
	for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
		if (EntityDistance(Tunit_.h, p) < range) {
			G.TCunit = Tunit_;
			hurt_unit(damage, 0, 0);
		}
	}
	for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
		if (EntityDistance(Titem_.h, p) < range) {
			if (Titem_.parent_mode !== Cpm_in) {
				G.TCitem = Titem_;
				damage_item(damage, 0, 0);
			}
		}
	}
	//FX
	size = f32(range / 10);
	switch (style) {
		//0 - none
		case 0:
			break;
		//1 - explosion
		case 1:
			p_explosion(x, y, z, size);
			break;
		//2 - poision
		case 2:
			break;
		//3 - bio
		case 3:
			//Fire Sprites
			for (i = 1; i <= 10; i++) {
				if (Rand(3) === 1) {
					// exe: arguments evaluated z, size, alpha, y, x
					argz = f32(z + Rnd(f32(-size * 3), f32(size * 3)));
					argsize = Rnd(10, 30);
					arga = Rnd(0.9, 1.5);
					argy = f32(y + Rnd(f32(size * 3)));
					argx = f32(x + Rnd(f32(-size * 3), f32(size * 3)));
					p_add(argx, argy, argz, Cp_smoke, argsize, arga);
					EntityColor(G.TCp!.h, 256, Rand(128, 256), Rand(32, 128));
					//EntityBlend TCp\h,3
					G.TCp!.a = G.TCp!.fadein;
					G.TCp!.fadein = 0;
					EntityAlpha(G.TCp!.h, G.TCp!.a);
				}
				// exe: arguments evaluated x, z, size, y
				argx = f32(x + Rnd(f32(-size * 3), f32(size * 3)));
				argz = f32(z + Rnd(f32(-size * 3), f32(size * 3)));
				argsize = Rand(2, 3);
				argy = f32(y + Rnd(f32(size * 3)));
				p_add(argx, argy, argz, Cp_spark, argsize, 3);
				EntityColor(G.TCp!.h, 128, Rand(64, 128), Rand(0, 64));
				EntityBlend(G.TCp!.h, 1);
				// quirk: Rand takes Ints: Rand(0.5,1.5) is Rand(0,2) (the constants round to even)
				// exe: arguments evaluated y, z, size, x
				argy = f32(y + Rnd(f32(-size * 3), f32(size * 3)));
				argz = f32(z + Rnd(f32(-size * 3), f32(size * 3)));
				argsize = Rand(Int(0.5), Int(1.5));
				argx = f32(x + Rnd(f32(-size * 3), f32(size * 3)));
				p_add(argx, argy, argz, Cp_firespark, argsize, 1);
				EntityColor(G.TCp!.h, 128, Rand(64, 128), Rand(0, 64));
				EntityBlend(G.TCp!.h, 1);
			}
			//SFX
			sfx_3d(Int(x), Int(y), Int(z), G.sfx_pang);
			break;
	}
	//P
	FreeEntity(p);
}

//Game Target
/** Function game_target(range#=10000) */
export function game_target(range: number = 10000): number {
	let h: Handle = null;
	//Reset
	G.tmp_tarclass = 0;
	G.tmp_tarid = 0;
	G.tmp_tarx = 0;
	G.tmp_tary = 0;
	G.tmp_tarz = 0;

	if (isNull(Tunit, G.g_cplayer)) return 0;

	//Start
	// quirk: this pivot is never freed
	h = CreatePivot();
	RotateEntity(h, EntityPitch(G.cam), EntityYaw(G.cam), 0);
	PositionEntity(h, EntityX(G.cam), EntityY(G.cam), EntityZ(G.cam));
	//MoveEntity h,0,0,Dunit_colxr#(g_cplayer\typ)+5.

	//Pick
	G.in_pe = null;
	EntityPickMode(G.env_sea2, 2, 1);
	EntityPickMode(G.g_cplayer!.h, 0);
	G.in_pe = EntityPick(h, range);
	EntityPickMode(G.g_cplayer!.h, 2, 1);
	EntityPickMode(G.env_sea2, 0);
	G.in_px = PickedX();
	G.in_py = PickedY();
	G.in_pz = PickedZ();

	//Save Data
	if (G.in_pe !== null) {
		G.tmp_tarx = G.in_px;
		G.tmp_tary = G.in_py;
		G.tmp_tarz = G.in_pz;

		if (G.in_pe === G.env_ground || G.in_pe === G.ter) {
			G.tmp_tarclass = -1;
		} else if (G.in_pe === G.env_sea2) {
			G.tmp_tarclass = -2;
		} else if (get_item(G.in_pe) > -1) {
			G.tmp_tarclass = Cclass_item;
			G.tmp_tarid = G.TCitem!.id;
		} else if (get_unit(G.in_pe, 0) > -1) {
			G.tmp_tarclass = Cclass_unit;
			G.tmp_tarid = G.TCunit!.id;
		} else if (get_object(G.in_pe) > -1) {
			G.tmp_tarclass = Cclass_object;
			G.tmp_tarid = G.TCobject!.id;
		}

		return 1;
	} else {
		return 0;
	}
}

//Render Weapon
/** Function game_renderweapon() */
export function game_renderweapon(): void {
	let free = 0;
	let h: Handle = null;
	//Set
	free = 1;
	if (G.m_menu === 0) {
		if (G.g_player !== 0) {
			h = G.g_cplayer!.h;
			if (G.g_cplayer!.player_weapon !== 0) {
				G.tmp_x = EntityX(h);
				G.tmp_y = EntityY(h);
				G.tmp_z = EntityZ(h);
				if (countstored_items(Cclass_unit, G.g_player, G.g_cplayer!.player_weapon) > 0) {
					switch (Ditem_behaviour(G.g_cplayer!.player_weapon)) {
						//Torch
						case 'torch':
							//only over the water
							if (G.tmp_y > 0) {
								//not when it rains or snows
								if (G.env_cweather < 1 || G.env_cweather > 2) {
									free = 0;
									//GFX
									if (G.env_itemlight === null) G.env_itemlight = CreateLight(2);
									LightColor(G.env_itemlight, 70, Rnd(45, 70), 0);
									LightRange(G.env_itemlight, Rnd(300, 305));
									PositionEntity(G.env_itemlight, G.tmp_x, G.tmp_y, G.tmp_z);
									if (G.in_gt100go) {
										if (Rand(5) === 1) {
											p_add(G.tmp_x, G.tmp_y, G.tmp_z, Cp_firespark, Rand(2, 6), 1);
										}
										if (G.in_gt1000go) {
											if (Rand(1) === 1) {
												p_add(G.tmp_x, G.tmp_y, G.tmp_z, Cp_spark, Rand(1, 2), 3);
											}
										}
									}
									//SFX
									if (RT.audio.bb.ChannelPlaying(G.env_itemchan) === 0) {
										G.env_itemchan = sfx_emit(G.sfx_fire, h, 0.5);
									}
								}
							}
							break;
					}
				}
			}
		}
	}
	//Free?
	if (free === 1) {
		if (G.env_itemlight !== null) {
			FreeEntity(G.env_itemlight);
			G.env_itemlight = null;
		}
		if (RT.audio.bb.ChannelPlaying(G.env_itemchan)) {
			RT.audio.bb.StopChannel(G.env_itemchan);
		}
	}
}
