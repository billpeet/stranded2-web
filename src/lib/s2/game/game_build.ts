/**
 * includes/game_build.bb, line-by-line port.
 */
import {
	CameraPick,
	CameraProject,
	CopyEntity,
	EntityBlend,
	EntityColor,
	EntityDistance,
	EntityInView,
	EntityPickMode,
	EntityPitch,
	EntityRoll,
	EntityType,
	EntityX,
	EntityY,
	EntityYaw,
	EntityZ,
	FreeEntity,
	MeshesIntersect,
	PickedEntity,
	PickedX,
	PickedZ,
	PointEntity,
	PositionEntity,
	ProjectedX,
	ProjectedY,
	RotateEntity,
	ScaleEntity,
	type Handle
} from '../bb3d';
import { Abs, Instr, Int, Rand, Rnd, SEP_LINE, f32, idivConst } from '../blitz';
import { DrawBlock, DrawImage } from '../gfx2d';
import { Cbmpf_green, Cbmpf_red, Cclass_object, Cclass_unit, Cmenu_if_build, Cmenu_if_buildsetup, Cstate_buildplace, Cstate_ghost, Cstate_link, Cstate_pc_build } from './consts';
import {
	Ditem_iconh,
	Ditem_name,
	Ditem_rate,
	Dobject_align,
	Dobject_behaviour,
	Dobject_col,
	Dobject_modelh,
	Dobject_name,
	Dobject_script,
	Dobject_scriptk,
	Dobject_size,
	Dunit_align,
	Dunit_modelh,
	Dunit_name,
	Dunit_script,
	Dunit_scriptk,
	Dunit_size
} from './defs_arrays';
import { e_tery } from './e_environment';
import { drawaxes, groundpitch } from './functions';
import { game_picking } from './game_functions';
import { gui_healthbar, gui_iconboxc } from './gui';
import { free_item, get_stored_item, set_item, store_item } from './handle_items';
import { con_object, free_object, get_object, set_object } from './handle_objects';
import { free_state, get_state, set_state } from './handle_states';
import { con_unit, set_unit } from './handle_units';
import { if_msg } from './interface';
import { bmpf_txt_c } from './load_bmpf';
import { load_object_model } from './load_objects';
import { sm, ss } from './load_strings';
import { parse_sel_event, parse_task } from './parser_functions';
import { p_add, p_add2d } from './particles';
import { sfx, sfx_emit } from './sfx';
import { speech } from './speech';
import { G } from './state';
import { After, First, Tbui, Tobject, Tstate, isNull } from './types';

//############################################ BUILD

//### Build
/** Function game_build() */
export function game_build(): number {
	let Tobject_: Tobject | null = null;
	let typ = 0;
	let id = 0;
	let Tbui_: Tbui | null = null;
	let total = 0;
	let complete = 0;
	let ok = 0;
	let buildclass = 0;
	let buildid = 0;
	let y = 0;
	let i = 0;
	let Tstate_: Tstate | null = null;
	let argx = 0;
	let argy = 0;
	let argz = 0;
	let argsize = 0;
	let arga = 0;

	//Timer Stuff
	con_unit(G.g_player);
	if (G.gt - G.TCunit!.player_lastattack < Ditem_rate(G.TCunit!.player_weapon)) return 0;
	G.TCunit!.player_lastattack = G.gt;
	//Scan for nearby buildplace
	for (Tobject_ = First(Tobject); Tobject_ !== null; Tobject_ = After(Tobject, Tobject_)) {
		if (EntityDistance(G.cam, Tobject_.h) < 75) {
			if (get_state(Cstate_buildplace, Cclass_object, Tobject_.id)) {
				//Get State
				if (get_state(Cstate_buildplace, Cclass_object, Tobject_.id) === 0) return 0;
				typ = G.TCstate!.value;
				id = 0;
				//Get Building Type ID
				for (Tbui_ = First(Tbui); Tbui_ !== null; Tbui_ = After(Tbui, Tbui_)) {
					if (Tbui_.mode === 2) {
						if (Tbui_.typ === typ) {
							id = Tbui_.id;
							break;
						}
					}
				}
				if (id === 0) return 0;
				//Scan Req. Stuff
				total = 0;
				complete = 0;
				for (Tbui_ = First(Tbui); Tbui_ !== null; Tbui_ = After(Tbui, Tbui_)) {
					if (Tbui_.id === id) {
						if (Tbui_.mode === 0) {
							total = total + 1;
							ok = 0;
							//Is Req. complete?
							ok = get_stored_item(Tbui_.typ, Cclass_object, Tobject_.id);
							if (ok === 1) {
								if (Tbui_.count <= G.TCitem!.count) {
									complete = complete + 1;
									ok = 1;
								} else {
									ok = 0;
								}
							}
							//Not complete, try to complete!
							if (ok === 0) {
								if (get_stored_item(Tbui_.typ, Cclass_unit, G.g_player)) {
									free_item(G.TCitem!.id, 1);
									set_item(-1, Tbui_.typ);
									p_add2d(idivConst(G.set_scrx, 2), idivConst(G.set_scry, 2), -2, Tbui_.typ);
									store_item(G.TCitem!.id, Cclass_object, Tobject_.id);
									if_msg(ss(sm(172), Ditem_name(Tbui_.typ)), Cbmpf_green);
									sfx_emit(G.sfx_build, G.cam);
									//Build Process
									G.pc_typ = Cstate_pc_build;
									G.pc_gt = G.gt;
									G.pc_child = Tobject_.id;
									G.in_focus = G.pc_typ;
									//Return
									return 1;
								}
							}
						}
					}
				}
				//Finished?
				if (total === complete) {
					//Finished MSG + Sound
					if_msg(sm(173), Cbmpf_green);
					sfx_emit(G.sfx_build_finish, G.cam);
					buildclass = 0;
					buildid = 0;
					//Object (Positive Type)
					if (typ > 0) {
						set_object(-1, typ, EntityX(Tobject_.h), EntityZ(Tobject_.h), EntityYaw(Tobject_.h));
						buildclass = Cclass_object;
						buildid = G.TCobject!.id;
						//Disable Collision, Add Ghost State
						if (Dobject_col(G.TCobject!.typ) > 0) {
							if (G.TCobject!.ch !== null) {
								EntityType(G.TCobject!.ch, 0);
							} else {
								EntityType(G.TCobject!.h, 0);
							}
						}
						set_state(Cstate_ghost, buildclass, buildid);
						//Unit (Negative Type)
					} else {
						set_unit(-1, Abs(typ), EntityX(Tobject_.h), EntityZ(Tobject_.h));
						RotateEntity(G.TCunit!.h, 0, EntityYaw(Tobject_.h), 0);
						buildclass = Cclass_unit;
						buildid = G.TCunit!.id;
					}
					//Smoke FX
					// quirk: y is an Int local, the terrain height is rounded
					y = Int(e_tery(EntityX(Tobject_.h), EntityZ(Tobject_.h)));
					for (i = 1; i <= 15; i++) {
						// exe: arguments evaluated z, size, alpha, y, x
						argz = f32(EntityZ(Tobject_.h) + Rnd(-10, 10));
						argsize = Rnd(5, 10);
						arga = Rnd(f32(0.3), 1.5);
						argy = y + Rand(2, 5);
						argx = f32(EntityX(Tobject_.h) + Rnd(-10, 10));
						p_add(argx, argy, argz, 20, argsize, arga);
					}
					//DebugLog Tobject\id
					//Link
					for (Tstate_ = First(Tstate); Tstate_ !== null; Tstate_ = After(Tstate, Tstate_)) {
						if (Tstate_.typ === Cstate_link) {
							//DebugLog "linkstate found value = "+Tstate\value+" ("+Tobject\id+")"
							if (Tstate_.value === Tobject_.id) {
								//DebugLog "value = buildplace id!"
								if (buildclass === Cclass_object) {
									set_state(Cstate_link, Tstate_.parent_class, Tstate_.parent_id);
									G.TCstate!.value = buildid;
									//DebugLog "addstate "+TCstate\parent_id+" -> "+buildid
									break;
								}
							}
						}
					}
					//Free Buildplace
					if (!isNull(Tobject, Tobject_)) {
						free_object(Tobject_.id);
					}
					//Event: on:build
					for (Tbui_ = First(Tbui); Tbui_ !== null; Tbui_ = After(Tbui, Tbui_)) {
						if (Tbui_.mode === 2) {
							if (Tbui_.id === id) {
								if (Tbui_.script !== '') {
									parse_task(buildclass, buildid, 'build', '(buildings.inf-script)', Tbui_.script);
								}
								break;
							}
						}
					}
					//Event: on:build_finish
					if (typ > 0) {
						if (Instr(Dobject_scriptk(typ), SEP_LINE + 'build_finish')) {
							parse_task(Cclass_object, buildid, 'build_finish', '', Dobject_script(typ));
							parse_sel_event('build_finish');
						}
					} else {
						if (Instr(Dunit_scriptk(Abs(typ)), SEP_LINE + 'build_finish')) {
							// quirk: Dunit_script$(typ) with the negative typ (not Abs(typ)): an out-of-range read, "" here
							parse_task(Cclass_unit, buildid, 'build_finish', '', Dunit_script(typ));
							parse_sel_event('build_finish');
						}
					}
					//Free Build Process State
					free_state(Cstate_pc_build, Cclass_unit, G.g_player);
					//Return
					return 1;
				} else {
					if_msg(sm(174), Cbmpf_red);
					sfx(G.sfx_fail);
					//Build Process
					G.pc_typ = Cstate_pc_build;
					G.pc_gt = G.gt;
					G.pc_child = Tobject_.id;
					G.in_focus = G.pc_typ;
				}
				return 0;
			}
		}
	}
	//Open Build Menu
	G.in_buildg = '';
	G.m_menu = Cmenu_if_build;
	G.in_scr_scr = 0;
	return 0;
}

//### Start Buildsetup
/** Function game_buildsetup_start(typ,changeh=0) */
export function game_buildsetup_start(typ: number, changeh: number = 0): void {
	let x = 0;
	let z = 0;
	let buiid = 0;
	let Tbui_: Tbui | null = null;
	let Tbuis: Tbui | null = null;

	if (changeh === 0) {
		G.in_buildcamh = 100;
	} else {
		G.in_buildcamh = changeh;
	}
	//Event: on:build_setup
	G.p_skipevent = 0;
	if (typ > 0) {
		if (Instr(Dobject_scriptk(typ), SEP_LINE + 'build_setup')) {
			parse_task(0, 0, 'build_setup', '', Dobject_script(typ));
			parse_sel_event('build_setup');
		}
	} else {
		if (Instr(Dunit_scriptk(Abs(typ)), SEP_LINE + 'build_setup')) {
			parse_task(0, 0, 'build_setup', '', Dunit_script(Abs(typ)));
			parse_sel_event('build_setup');
		}
	}

	if (G.p_skipevent === 0) {
		//Dummy Model
		if (typ > 0) {
			load_object_model(typ);
			G.in_buildsetup_dummy = CopyEntity(Dobject_modelh(typ));
			ScaleEntity(G.in_buildsetup_dummy, Dobject_size(typ, 0), Dobject_size(typ, 1), Dobject_size(typ, 2));
		} else {
			G.in_buildsetup_dummy = CopyEntity(Dunit_modelh(Abs(typ)));
			ScaleEntity(G.in_buildsetup_dummy, Dunit_size(Abs(typ), 0), Dunit_size(Abs(typ), 1), Dunit_size(Abs(typ), 2));
		}
		EntityBlend(G.in_buildsetup_dummy, 3);
		EntityColor(G.in_buildsetup_dummy, 0, 255, 0);
		x = f32(EntityX(G.cam));
		z = f32(EntityZ(G.cam));
		//Buildsetup at Water Surface?
		G.in_buildsetup_watersurface = 0;
		if (typ > 0) {
			if (Dobject_behaviour(typ) === 'aligntowater') {
				G.in_buildsetup_watersurface = 1;
			} else if (Dobject_behaviour(typ) === 'buildingsite_water') {
				G.in_buildsetup_watersurface = 1;
			}
		} else {
			if (Dunit_align(Abs(typ)) === 1) G.in_buildsetup_watersurface = 1;
		}
		//Pos
		PositionEntity(G.in_buildsetup_dummy, x, e_tery(x, z), z);
		//Vars
		G.in_buildsetup_typ = typ;
		G.m_menu = Cmenu_if_buildsetup;
		//Get Buildspace
		G.in_buildsetup_space = 0;
		G.in_buildsetup_id = 0;
		buiid = 0;
		for (Tbui_ = First(Tbui); Tbui_ !== null; Tbui_ = After(Tbui, Tbui_)) {
			if (Tbui_.mode === 2) {
				if (Tbui_.typ === typ) {
					buiid = Tbui_.id;
					G.in_buildsetup_id = buiid;
					//Find Buildspace Stuff
					for (Tbuis = First(Tbui); Tbuis !== null; Tbuis = After(Tbui, Tbuis)) {
						if (Tbuis.mode === 1) {
							if (Tbuis.id === buiid) {
								G.in_buildsetup_space = Tbuis.typ;
								break;
							}
						}
					}
					break;
				}
			}
		}
		//Picking
		if (G.in_buildsetup_space !== 6) {
			game_picking(0);
		}
		if (G.in_buildsetup_watersurface === 1) {
			EntityPickMode(G.env_sea2, 2, 1);
		} else {
			EntityPickMode(G.env_sea2, 0);
		}
	}
}

//### Buildsetup Update
/** Function game_buildsetup_update() */
export function game_buildsetup_update(): void {
	let ok = 0;
	let Tobject_: Tobject | null = null;
	let h: Handle = null;
	let x2 = 0;
	let z2 = 0;
	let Tbui_: Tbui | null = null;
	// quirk: yaw# is never assigned: a Float local that is always 0
	const yaw = 0;

	if (G.in_my > 50) {
		//Place is free?
		ok = 1;
		switch (G.in_buildsetup_space) {
			case 0:
			case 1:
			case 2:
			case 3:
			case 4:
			case 5:
				EntityColor(G.in_buildsetup_dummy, 0, 255, 0);
				for (Tobject_ = First(Tobject); Tobject_ !== null; Tobject_ = After(Tobject, Tobject_)) {
					if (Dobject_col(Tobject_.typ) !== 0) {
						if (EntityInView(Tobject_.h, G.cam)) {
							if (MeshesIntersect(Tobject_.h, G.in_buildsetup_dummy)) {
								EntityColor(G.in_buildsetup_dummy, 255, 0, 0);
								ok = 0;
								break;
							}
						}
					}
				}
				break;
			case 6:
				EntityColor(G.in_buildsetup_dummy, 255, 0, 0);
				ok = 0;
				break;
		}

		//Rotate by Mousewheel
		if (G.in_mzs !== 0) {
			h = G.in_buildsetup_dummy;
			if (G.in_mzs > 0) {
				RotateEntity(h, EntityPitch(h), f32(EntityYaw(h) - f32(G.in_mzs * 10)), EntityRoll(h));
			} else {
				RotateEntity(h, EntityPitch(h), f32(EntityYaw(h) - f32(G.in_mzs * 10)), EntityRoll(h));
			}
		}

		//1 - Position (on move)
		if (G.in_mdown[1] === 0) {
			if (G.in_mrelease[1] === 0) {
				CameraPick(G.cam, G.in_mx, G.in_my);
				x2 = f32(PickedX());
				z2 = f32(PickedZ());
				PositionEntity(G.in_buildsetup_dummy, x2, e_tery(x2, z2), z2);
				//Assign to Object (Mode 6)
				if (G.in_buildsetup_space === 6) {
					if (get_object(PickedEntity()) !== -1) {
						for (Tbui_ = First(Tbui); Tbui_ !== null; Tbui_ = After(Tbui, Tbui_)) {
							if (Tbui_.mode === 3) {
								if (Tbui_.id === G.in_buildsetup_id) {
									if (Tbui_.typ === G.TCobject!.typ) {
										//Position
										PositionEntity(G.in_buildsetup_dummy, EntityX(G.TCobject!.h), EntityY(G.TCobject!.h), EntityZ(G.TCobject!.h));
										//Ok
										EntityColor(G.in_buildsetup_dummy, 0, 255, 0);
										ok = 1;
										break;
									}
								}
							}
						}
					}
				}
				//Special Positioning
				if (G.in_buildsetup_typ > 0) {
					//Objects
					switch (Dobject_align(G.in_buildsetup_typ)) {
						case 0: //-
							break;
						case 1:
							PositionEntity(G.in_buildsetup_dummy, x2, 1, z2);
							break;
						case 2:
							RotateEntity(G.in_buildsetup_dummy, groundpitch(G.in_buildsetup_dummy, 60), yaw, 0);
							break;
					}
				} else {
					//Units
					switch (Dunit_align(Abs(G.in_buildsetup_typ))) {
						case 0: //-
							break;
						case 1:
							PositionEntity(G.in_buildsetup_dummy, x2, 1, z2);
							break;
					}
				}
			}
			//2 - Rotate (on down)
		} else {
			if (G.in_mrelease[1] === 0) {
				h = G.in_buildsetup_dummy;
				G.in_cursorf = 4;
				RotateEntity(h, EntityPitch(h), f32(EntityYaw(h) - f32(f32(G.in_mxs * G.f) * 0.5)), EntityRoll(h));
				CameraProject(G.cam, EntityX(h), EntityY(h), EntityZ(h));
				G.in_mx = Int(ProjectedX());
				G.in_my = Int(ProjectedY());
				if (G.set_debug === 1) drawaxes(h, 20);
				if (G.in_buildsetup_space === 6) {
					EntityColor(G.in_buildsetup_dummy, 0, 255, 0);
					ok = 1;
				}
			}
		}
		//3 - Set (on release)
		if (G.in_mrelease[1]) {
			if (G.in_buildsetup_space === 6) {
				EntityColor(G.in_buildsetup_dummy, 0, 255, 0);
				ok = 1;
			}
			if (ok === 1) {
				if (game_buildplace(EntityX(G.in_buildsetup_dummy), EntityZ(G.in_buildsetup_dummy), EntityYaw(G.in_buildsetup_dummy), G.in_buildsetup_typ)) {
					if_msg(sm(175), Cbmpf_green);
					speech('buildingsite');
				}
			} else {
				sfx(G.sfx_fail);
				if_msg(sm(176), Cbmpf_red);
				speech('negative');
			}
			game_buildsetup_end();
		}

		//Skip
		if (G.in_mhit[2]) {
			game_buildsetup_end();
		}
	}
}

//### End Buildsetup
/** Function game_buildsetup_end() */
export function game_buildsetup_end(): void {
	//Dummy Model
	FreeEntity(G.in_buildsetup_dummy);
	//Vars
	G.in_buildsetup_typ = 0;
	G.m_menu = 0;
	//Picking
	game_picking(1);
	EntityPickMode(G.env_sea2, 0);
}

//### Create Buildplace
/** Function game_buildplace(x#,z#,yaw#,typ) */
export function game_buildplace(x: number, z: number, yaw: number, typ: number): number {
	let space = 0;
	let buiid = 0;
	let Tbui_: Tbui | null = null;
	let Tbuis: Tbui | null = null;
	let space_objectid = 0;
	let ok = 0;
	let Tobject_: Tobject | null = null;
	let custom = 0;
	let cbs: Tbui | null = null;
	let tmpbuildplaceid = 0;
	let y = 0;
	let i = 0;
	let argx = 0;
	let argy = 0;
	let argz = 0;
	let argsize = 0;
	let arga = 0;

	//Event: on:build_start
	G.p_skipevent = 0;
	if (typ > 0) {
		if (Instr(Dobject_scriptk(typ), SEP_LINE + 'build_start')) {
			parse_task(0, 0, 'build_start', '', Dobject_script(typ));
			parse_sel_event('build_start');
		}
	} else {
		if (Instr(Dunit_scriptk(Abs(typ)), SEP_LINE + 'build_start')) {
			parse_task(0, 0, 'build_start', '', Dunit_script(Abs(typ)));
			parse_sel_event('build_start');
		}
	}

	if (G.p_skipevent === 0) {
		//Get Buildspace
		space = 0;
		buiid = 0;
		for (Tbui_ = First(Tbui); Tbui_ !== null; Tbui_ = After(Tbui, Tbui_)) {
			if (Tbui_.mode === 2) {
				if (Tbui_.typ === typ) {
					buiid = Tbui_.id;
					//Find Buildspace Stuff
					for (Tbuis = First(Tbui); Tbuis !== null; Tbuis = After(Tbui, Tbuis)) {
						if (Tbuis.mode === 1) {
							if (Tbuis.id === buiid) {
								space = Tbuis.typ;
								break;
							}
						}
					}
					break;
				}
			}
		}
		//Check Buildspace
		space_objectid = 0;
		switch (space) {
			//0 - Land
			case 0:
				if (e_tery(x, z) < 0) {
					sfx(G.sfx_fail);
					if_msg(sm(183), Cbmpf_red);
					speech('negative');
					return 0;
				}
				break;
			//1 - Land and Water
			case 1:
				//Check Nothing! Huh!
				break;
			//2 - Water
			case 2:
				if (e_tery(x, z) > 0) {
					sfx(G.sfx_fail);
					if_msg(sm(184), Cbmpf_red);
					speech('negative');
					return 0;
				}
				break;
			//3 - Shore
			case 3:
				// quirk: "<-3 And >3" can never be true: the shore check never fails
				if (((e_tery(x, z) < -3 ? 1 : 0) & (e_tery(x, z) > 3 ? 1 : 0)) !== 0) {
					sfx(G.sfx_fail);
					if_msg(sm(185), Cbmpf_red);
					speech('negative');
					return 0;
				}
				break;
			//4 - Hill
			case 4:
				if (e_tery(x, z) < 100) {
					sfx(G.sfx_fail);
					if_msg(sm(186), Cbmpf_red);
					speech('negative');
					return 0;
				}
				break;
			//5 - Shallow water
			case 5:
				// quirk: "<-3 And >-0.1" can never be true: the shallow water check never fails
				if (((e_tery(x, z) < -3 ? 1 : 0) & (e_tery(x, z) > f32(-0.1) ? 1 : 0)) !== 0) {
					sfx(G.sfx_fail);
					if_msg(sm(187), Cbmpf_red);
					speech('negative');
					return 0;
				}
				break;
			//6 - at object
			case 6:
				ok = 0;
				for (Tobject_ = First(Tobject); Tobject_ !== null; Tobject_ = After(Tobject, Tobject_)) {
					if (EntityX(Tobject_.h) === x) {
						if (EntityZ(Tobject_.h) === z) {
							for (Tbui_ = First(Tbui); Tbui_ !== null; Tbui_ = After(Tbui, Tbui_)) {
								if (Tbui_.mode === 3) {
									if (Tbui_.id === buiid) {
										//Type ID Okay?
										if (Tbui_.typ === Tobject_.typ) {
											//Grown?
											if (Tobject_.daytimer >= 0) {
												space_objectid = Tobject_.id;
												//Okay
												ok = 1;
												break;
											}
										}
									}
								}
							}
						}
					}
				}
				if (ok === 0) {
					sfx(G.sfx_fail);
					if_msg(sm(193), Cbmpf_red);
					speech('negative');
					return 0;
				}
				break;
		}
		//Set Buildplace Object
		custom = 0;
		for (cbs = First(Tbui); cbs !== null; cbs = After(Tbui, cbs)) {
			if (cbs.id === buiid) {
				if (cbs.mode === 4) {
					custom = cbs.typ;
				}
			}
		}
		if (custom === 0) {
			//Default Buildingsite
			if (e_tery(x, z) < 0) {
				set_object(-1, G.set_buildplacewaterid, x, z);
			} else {
				set_object(-1, G.set_buildplaceid, x, z);
			}
		} else {
			//Custom Buildingsite
			set_object(-1, custom, x, z);
		}
		RotateEntity(G.TCobject!.h, 0, yaw, 0);
		G.pv_lastbuilding = G.TCobject!.id;
		tmpbuildplaceid = G.TCobject!.id;
		//Add Buildplace State in order to Cache Type of Building
		set_state(Cstate_buildplace, Cclass_object, tmpbuildplaceid);
		G.TCstate!.value = typ;
		//Add Link State to Building (destroy it if parent is destroyed)
		if (space === 6) {
			set_state(Cstate_link, Cclass_object, space_objectid);
			G.TCstate!.value = tmpbuildplaceid;
			//DebugLog "linkstate at "+space_objectid+", value="+tmpbuildplaceid
		}
		//Look at Building
		PointEntity(G.cam, G.TCobject!.h);
		//Smoke
		// quirk: y is an Int local, the terrain height is rounded
		y = Int(e_tery(x, z));
		for (i = 1; i <= 10; i++) {
			// exe: arguments evaluated size, alpha, z, y, x
			argsize = Rnd(5, 10);
			arga = Rnd(f32(0.3), 1.5);
			argz = f32(z + Rnd(-10, 10));
			argy = y + Rand(2, 5);
			argx = f32(x + Rnd(-10, 10));
			p_add(argx, argy, argz, 20, argsize, arga);
		}
		//Okay
		return 1;
	}
	return 0;
}

//### Buildplace Focus Stuff
/** Function game_buildfocus(buildplaceid) */
export function game_buildfocus(buildplaceid: number): void {
	let typ = 0;
	let id = 0;
	let Tbui_: Tbui | null = null;
	let total = 0;
	let complete = 0;
	let totalc = 0;
	let completec = 0;
	let ok = 0;
	let uncomplete = 0;
	let x = 0;
	let y = 0;
	let inline = 0;
	let itemcount = 0;

	con_object(buildplaceid);
	if (get_state(Cstate_buildplace, Cclass_object, buildplaceid)) {
		typ = G.TCstate!.value;
		//Buildplace Name
		G.in_fo_x = idivConst(G.set_scrx, 2);
		G.in_fo_y = 35;
		if (typ > 0) {
			bmpf_txt_c(G.in_fo_x, G.in_fo_y, ss(sm(177), Dobject_name(typ)));
		} else {
			bmpf_txt_c(G.in_fo_x, G.in_fo_y, ss(sm(177), Dunit_name(Abs(typ))));
		}
		//Get Building Type ID
		for (Tbui_ = First(Tbui); Tbui_ !== null; Tbui_ = After(Tbui, Tbui_)) {
			if (Tbui_.mode === 2) {
				if (Tbui_.typ === typ) {
					id = Tbui_.id;
					break;
				}
			}
		}
		//Scan Req. Stuff
		total = 0;
		complete = 0;
		totalc = 0;
		completec = 0;
		for (Tbui_ = First(Tbui); Tbui_ !== null; Tbui_ = After(Tbui, Tbui_)) {
			if (Tbui_.id === id) {
				if (Tbui_.mode === 0) {
					total = total + 1;
					totalc = totalc + Tbui_.count;
					ok = 0;
					//Is Req. complete?
					ok = get_stored_item(Tbui_.typ, Cclass_object, buildplaceid);
					if (ok === 1) {
						completec = completec + G.TCitem!.count;
						if (Tbui_.count <= G.TCitem!.count) {
							complete = complete + 1;
							ok = 1;
						} else {
							ok = 0;
						}
					}
				}
			}
		}
		//Draw Req. Stuff
		uncomplete = total - complete;
		x = idivConst(G.set_scrx, 2) - 51;
		y = 55;
		gui_healthbar(x, y, completec, totalc);
		y = 75;
		if (uncomplete >= 8) {
			inline = 8;
		} else {
			inline = uncomplete;
		}
		x = idivConst(G.set_scrx, 2) - idivConst(inline * 45, 2);
		for (Tbui_ = First(Tbui); Tbui_ !== null; Tbui_ = After(Tbui, Tbui_)) {
			if (Tbui_.id === id) {
				if (Tbui_.mode === 0) {
					ok = 0;
					itemcount = 0;
					//Is Req. complete?
					ok = get_stored_item(Tbui_.typ, Cclass_object, buildplaceid);
					if (ok === 1) {
						itemcount = G.TCitem!.count;
						if (Tbui_.count <= itemcount) {
							complete = complete + 1;
							ok = 1;
						} else {
							ok = 0;
						}
					}
					//Draw
					if (ok === 0) {
						DrawBlock(G.gfx_if_itemback, x, y);
						DrawImage(Ditem_iconh(Tbui_.typ), x, y);
						gui_iconboxc(x, y, Tbui_.count - itemcount);
						uncomplete = uncomplete - 1;
						x = x + 45;
						if (x >= idivConst(G.set_scrx, 2) + idivConst(8 * 45, 2)) {
							if (uncomplete >= 8) {
								inline = 8;
							} else {
								inline = uncomplete;
							}
							x = idivConst(G.set_scrx, 2) - idivConst(inline * 45, 2);
							y = y + 45;
						}
					}
				}
			}
		}
	}
}
