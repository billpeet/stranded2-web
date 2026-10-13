/**
 * includes/handle_infos.bb: info entities, their timers/triggers, spawn control, sprites, loudspeakers.
 * Line-by-line port (PORTING_GUIDE.md); original comments kept.
 */
//############################################ Handle Infos
import {
	CameraProject,
	CreateCube,
	CreatePivot,
	CreateSprite,
	EntityAlpha,
	EntityAutoFade,
	EntityBlend,
	EntityColor,
	EntityDistance,
	EntityInView,
	EntityParent,
	EntityPickMode,
	EntityPitch,
	EntityRoll,
	EntityTexture,
	EntityX,
	EntityY,
	EntityYaw,
	EntityZ,
	FreeEntity,
	HideEntity,
	MoveEntity,
	NameEntity,
	PositionEntity,
	ProjectedX,
	ProjectedY,
	RotateEntity,
	ScaleEntity,
	ScaleSprite,
	SpriteViewMode,
	TranslateEntity,
	type Handle,
	type Texture
} from '../bb3d';
import { Cos, Float, Instr, Int, Len, Rand, Rnd, SEP_LINE, Sin, Str, f32 } from '../blitz';
import { Color, DrawImage, Line } from '../gfx2d';
import { KeyDown, KeyHit } from '../input';
import { ai_signal } from './ai_signals';
import { ai_ini } from './ai_units';
import {
	Cbmpf_tiny,
	Cclass_info,
	Cclass_item,
	Cclass_object,
	Cclass_unit,
	Cp_rwave,
	Cp_spawn,
	Cres_texture,
	Csection_editor,
	ai_attract,
	ai_distract
} from './consts';
import {
	Dinfo_frame,
	Dinfo_name,
	Ditem_script,
	Ditem_scriptk,
	Dobject_script,
	Dobject_scriptk,
	Dunit_colyr,
	Dunit_script,
	Dunit_scriptk
} from './defs_arrays';
import { e_tery } from './e_environment';
import { editor_range } from './editor_functions';
import { FileType } from './files';
import { dist, indailytime, intime, split } from './functions';
import { ha_inrange } from './handle_all';
import { countstored_items, set_item } from './handle_items';
import { set_object } from './handle_objects';
import { set_unit } from './handle_units';
import { bmpf_txt_c } from './load_bmpf';
import { se, ss } from './load_strings';
import { free_childs } from './parentchild';
import { parse_task, set_parsecache } from './parser_functions';
import { defvar_oncreate } from './parser_vars';
import { p_add } from './particles';
import { load_res } from './ressources';
import { RT } from './rt';
import { sfx } from './sfx';
import { G } from './state';
import { After, Delete, First, New, Tinfo, Titem, Tobject, Tunit, isNull } from './types';

//### Set Info
/** Function set_info(id=-1,typ,x#,y#,z#) */
export function set_info(id: number = -1, typ: number, x: number, y: number, z: number): number {
	let Tinfo_: Tinfo | null = null;

	//Invalid typ? Cancel
	if (Len(Dinfo_name(typ)) === 0) return -1;

	//Add at End
	if (id === -1) {
		G.info_serial = G.info_serial + 1;
		id = G.info_serial;
	}

	//Create
	Tinfo_ = New(Tinfo);
	Tinfo_.id = id;
	Tinfo_.typ = typ;

	//Adjust
	if (G.m_section === Csection_editor) {
		Tinfo_.h = CreateCube();
		ScaleEntity(Tinfo_.h, 5, 5, 5);
		EntityBlend(Tinfo_.h, 3);
		EntityColor(Tinfo_.h, 0, 255, 0);
		EntityAutoFade(Tinfo_.h, 5000, 5500);
		EntityPickMode(Tinfo_.h, 2, 1);
	} else {
		Tinfo_.h = CreatePivot();
		HideEntity(Tinfo_.h);
	}

	//Sprite Info
	if (typ === 5) {
		Tinfo_.strings[0] = ''; //Path
		Tinfo_.floats[0] = 1; //X Size
		Tinfo_.floats[1] = 1; //Y Size
		Tinfo_.ints[0] = 255; //R
		Tinfo_.ints[1] = 255; //G
		Tinfo_.ints[2] = 255; //B
		Tinfo_.floats[2] = 1; //Alpha
		Tinfo_.strings[1] = Str(0); //Blend
		Tinfo_.strings[2] = Str(0); //Fix
	}

	//Position
	PositionEntity(Tinfo_.h, x, y, z);

	//Defvars
	if (G.tmp_loading === 0) defvar_oncreate(Cclass_info, id, typ);

	//Okay
	G.TCinfo = Tinfo_;
	// quirk: no Return here: a successful set_info returns 0, not the id (the id is in TCinfo\id)
	return 0;
}

//### Get Info ID by Handle
/** Function get_info(searchhandle) */
export function get_info(searchhandle: Handle): number {
	let Tinfo_: Tinfo | null = null;

	for (Tinfo_ = First(Tinfo); Tinfo_ !== null; Tinfo_ = After(Tinfo, Tinfo_)) {
		if (Tinfo_.h === searchhandle) {
			G.TCinfo = Tinfo_;
			return Tinfo_.id;
		}
	}
	return -1;
}

//### Set Info Container
/** Function con_info(id) */
export function con_info(id: number): number {
	let Tinfo_: Tinfo | null = null;

	for (Tinfo_ = First(Tinfo); Tinfo_ !== null; Tinfo_ = After(Tinfo, Tinfo_)) {
		if (Tinfo_.id === id) {
			G.TCinfo = Tinfo_;
			return 1;
		}
	}
	return 0;
}

//### Free Info
/** Function free_info(id) */
export function free_info(id: number): number {
	let Tinfo_: Tinfo | null = null;

	for (Tinfo_ = First(Tinfo); Tinfo_ !== null; Tinfo_ = After(Tinfo, Tinfo_)) {
		if (Tinfo_.id === id) {
			//Childs
			free_childs(Cclass_info, id);
			//Delete
			if (Tinfo_.h !== null) FreeEntity(Tinfo_.h);
			//Loudspeaker
			if (Tinfo_.typ === 47) {
				if (Tinfo_.ints[0] !== 0) RT.audio.bb.FreeSound(Tinfo_.ints[0]);
				if (Tinfo_.ints[1] !== 0) {
					RT.audio.bb.StopChannel(Tinfo_.ints[1]);
				}
			}
			//Delete
			Delete(Tinfo, Tinfo_);
			//Ok
			return 1;
		}
	}
	return 0;
}

//### Draw Infos
/** Function draw_info() */
export function draw_info(): void {
	let Tinfo_: Tinfo | null = null;
	let dist_ = 0; // Int local "dist" (the function dist#() is not used here)

	for (Tinfo_ = First(Tinfo); Tinfo_ !== null; Tinfo_ = After(Tinfo, Tinfo_)) {
		//In View
		if (EntityInView(Tinfo_.h, G.cam)) {
			dist_ = Int(EntityDistance(Tinfo_.h, G.cam));
			//Distance
			if (dist_ < 1500) {
				//Icon
				CameraProject(G.cam, EntityX(Tinfo_.h), EntityY(Tinfo_.h), EntityZ(Tinfo_.h));
				DrawImage(G.gfx_icons, Int(f32(ProjectedX() - 16)), Int(f32(ProjectedY() - 16)), Dinfo_frame(Tinfo_.typ));
				if (G.in_opt[0] === 4) {
					//Details
					if (dist_ < 1000) {
						//Text
						bmpf_txt_c(Int(ProjectedX()), Int(f32(ProjectedY() - 30)), '#' + Str(Tinfo_.id) + ' ' + Dinfo_name(Tinfo_.typ), Cbmpf_tiny);
						//Special
						switch (Tinfo_.typ) {
							//Trigger Range
							case 10:
								editor_range(EntityX(Tinfo_.h), EntityY(Tinfo_.h), EntityZ(Tinfo_.h), Int(Tinfo_.floats[0]));
								break;
							//Map Indication
							case 36:
								if (Tinfo_.ints[1] === 1 || G.in_cursor === 1) {
									DrawImage(G.gfx_arrows, Int(ProjectedX()), Int(f32(ProjectedY() + 18)), Tinfo_.ints[0]);
								}
								break;
							//Areas
							case 41:
							case 42:
							case 43:
							case 44:
							case 45:
							case 46:
							case 47:
								editor_range(EntityX(Tinfo_.h), EntityY(Tinfo_.h), EntityZ(Tinfo_.h), Int(Tinfo_.floats[0]));
								break;
						}
					}
				}
			}
		}
	}
}

//### Update Info
/** Function update_info() */
export function update_info(): void {
	let c = 0;
	let t = 0;
	let l = 0;
	let dir = 0;
	let dist_ = 0; // Float local "dist#"; dist#(x1,z1,x2,z2) with arguments is the function of functions.bb
	let nx = 0;
	let nz = 0;
	let x = 0;

	switch (G.TCinfo!.typ) {
		//Trigger Range
		case 10:
			//Check Range Condition
			if (Int(G.TCinfo!.floats[1]) === 1) {
				c = ha_inrange(G.TCinfo!.h, Int(G.TCinfo!.floats[0]), G.TCinfo!.ints[0], G.TCinfo!.ints[1]);
				t = 0;
				switch (Int(G.TCinfo!.floats[2])) {
					case 0:
						if (c === G.TCinfo!.ints[2]) t = 1; //=
						break;
					case 1:
						if (c > G.TCinfo!.ints[2]) t = 1; //>
						break;
					case 2:
						if (c < G.TCinfo!.ints[2]) t = 1; //<
						break;
					case 3:
						if (c >= G.TCinfo!.ints[2]) t = 1; //>=
						break;
					case 4:
						if (c <= G.TCinfo!.ints[2]) t = 1; //<=
						break;
					case 5:
						if (c !== G.TCinfo!.ints[2]) t = 1; //<>
						break;
				}
				if (t === 1) {
					set_parsecache(Cclass_info, G.TCinfo!.id, 'trigger', 'triggered');
				}
			}
			break;
		//Trigger Time
		case 11:
			//Check Time Condition
			if (Int(G.TCinfo!.floats[1]) === 1) {
				switch (G.TCinfo!.ints[0]) {
					//Every X Seconds
					case 0:
						G.TCinfo!.timer = G.TCinfo!.timer + 1;
						if (G.TCinfo!.timer >= G.TCinfo!.ints[1]) {
							G.TCinfo!.timer = 0;
							set_parsecache(Cclass_info, G.TCinfo!.id, 'trigger', 'triggered (every x seconds)');
						}
						break;
					//Every X Game Minutes
					case 1:
						if (G.map_timeupdate) {
							c = G.map_day * 24 * 60 + G.map_hour * 60 + G.map_minute;
							l = G.map_lday * 24 * 60 + G.map_lhour * 60 + G.map_lminute;
							G.TCinfo!.timer = G.TCinfo!.timer + (c - l);
							if (G.TCinfo!.timer >= G.TCinfo!.ints[1]) {
								G.TCinfo!.timer = 0;
								set_parsecache(Cclass_info, G.TCinfo!.id, 'trigger', 'triggered (every x game minutes)');
							}
						}
						break;
					//At Special Gametime
					case 2:
						if (G.map_timeupdate) {
							if (intime(G.TCinfo!.ints[1], G.TCinfo!.ints[2], Int(G.TCinfo!.floats[0]))) {
								//Only triggered once - so deactivate!
								G.TCinfo!.floats[1] = 0;
								info_vts();
								//Script
								set_parsecache(Cclass_info, G.TCinfo!.id, 'trigger', 'triggered (at defined time)');
							}
						}
						break;
					//Daily at defined Time
					case 3:
						if (G.map_timeupdate) {
							if (indailytime(G.TCinfo!.ints[1], G.TCinfo!.ints[2])) {
								set_parsecache(Cclass_info, G.TCinfo!.id, 'trigger', 'triggered (daily at defined time)');
							}
						}
						break;
					//Sleep
					//Case 4
					//Removed
				}
			}
			break;
		//Trigger Item Count
		case 12:
			//Check Count
			if (Int(G.TCinfo!.floats[1]) === 1) {
				if (G.TCinfo!.ints[0] === 0) {
					c = countstored_items(Cclass_unit, G.g_player, G.TCinfo!.ints[2]);
				} else {
					c = countstored_items(G.TCinfo!.ints[0], G.TCinfo!.ints[1], G.TCinfo!.ints[2]);
				}
				//DebugLog "Itemcount "+c+" need to be "+Int(TCinfo\floats[0])
				t = 0;
				switch (Int(G.TCinfo!.floats[2])) {
					case 0:
						if (c === Int(G.TCinfo!.floats[0])) t = 1;
						break;
					case 1:
						if (c > Int(G.TCinfo!.floats[0])) t = 1;
						break;
					case 2:
						if (c < Int(G.TCinfo!.floats[0])) t = 1;
						break;
					case 3:
						// quirk: ">" where the range trigger (typ 10) has ">="
						if (c > Int(G.TCinfo!.floats[0])) t = 1;
						break;
					case 4:
						// quirk: "<" where the range trigger (typ 10) has "<="
						if (c < Int(G.TCinfo!.floats[0])) t = 1;
						break;
					case 5:
						if (c !== Int(G.TCinfo!.floats[0])) t = 1;
						break;
				}
				if (t === 1) {
					set_parsecache(Cclass_info, G.TCinfo!.id, 'trigger', 'triggered');
				}
			}
			break;
		//Fishing Area
		case 43:
			//Spawn Bubbles
			if (f32(dist(EntityX(G.TCinfo!.h), EntityZ(G.TCinfo!.h), EntityX(G.cam), EntityZ(G.cam)) - G.TCinfo!.floats[0]) < 500) {
				dir = Rand(360);
				dist_ = Rnd(G.TCinfo!.floats[0]);
				nx = f32(EntityX(G.TCinfo!.h) + f32(Sin(dir) * dist_));
				nz = f32(EntityZ(G.TCinfo!.h) - f32(Cos(dir) * dist_));
				p_add(nx, 1, nz, Cp_rwave, Rnd(5, 10), Rnd(f32(0.9), 1.5));
				// the To expression is evaluated on every pass: a new Rand(5,10) per test
				for (x = 0; x <= Rand(5, 10); x++) {
					dir = Rand(360);
					dist_ = Rnd(G.TCinfo!.floats[0]);
					nx = f32(EntityX(G.TCinfo!.h) + f32(Sin(dir) * dist_));
					nz = f32(EntityZ(G.TCinfo!.h) - f32(Cos(dir) * dist_));
					p_add(nx, f32(-Rnd(5, 50)), nz, 10, Rnd(1, 3));
				}
			}
			break;
		//AI Area
		case 46:
			//Attract / Distract
			switch (G.TCinfo!.ints[0]) {
				//0 - Attract
				case 0:
					ai_signal(Cclass_info, G.TCinfo!.id, ai_attract, Int(G.TCinfo!.floats[0]));
					break;
				//1 - Distract
				case 1:
					ai_signal(Cclass_info, G.TCinfo!.id, ai_distract, Int(G.TCinfo!.floats[0]));
					break;
			}
			break;
		//Loudspeaker
		case 47:
			if (G.TCinfo!.ints[0] !== 0) {
				//Play Everywhere
				if (Int(G.TCinfo!.floats[0]) === 0.0) {
					if (G.TCinfo!.ints[1] === 0) G.TCinfo!.ints[1] = sfx(G.TCinfo!.ints[0]);
					//Play Local
				} else {
					dist_ = EntityDistance(G.cam, G.TCinfo!.h);
					if (dist_ <= G.TCinfo!.floats[0]) {
						if (G.TCinfo!.ints[1] === 0) G.TCinfo!.ints[1] = sfx(G.TCinfo!.ints[0]);
					} else {
						if (G.TCinfo!.ints[1] !== 0) {
							RT.audio.bb.StopChannel(G.TCinfo!.ints[1]);
							G.TCinfo!.ints[1] = 0;
						}
					}
				}
			}
			break;
	}
}

//### Determine Serial Peak
/** Function serialpeak_info() */
export function serialpeak_info(): void {
	let peak = 0;
	let Tinfo_: Tinfo | null = null;

	for (Tinfo_ = First(Tinfo); Tinfo_ !== null; Tinfo_ = After(Tinfo, Tinfo_)) {
		if (Tinfo_.id > peak) peak = Tinfo_.id;
	}
	G.info_serial = peak;
}

//### Vars to String
/** Function info_vts() */
export function info_vts(): void {
	G.TCinfo!.vars = Str(G.TCinfo!.ints[0]) + SEP_LINE + Str(G.TCinfo!.ints[1]) + SEP_LINE + Str(G.TCinfo!.ints[2]) + SEP_LINE;
	G.TCinfo!.vars = G.TCinfo!.vars + Str(G.TCinfo!.floats[0], 'float') + SEP_LINE + Str(G.TCinfo!.floats[1], 'float') + SEP_LINE + Str(G.TCinfo!.floats[2], 'float') + SEP_LINE;
	G.TCinfo!.vars = G.TCinfo!.vars + G.TCinfo!.strings[0] + SEP_LINE + G.TCinfo!.strings[1] + SEP_LINE + G.TCinfo!.strings[2] + SEP_LINE;
}

//### String to Vars
/** Function info_stv() */
export function info_stv(): void {
	split(G.TCinfo!.vars, SEP_LINE, 8);
	G.TCinfo!.ints[0] = Int(G.splits[0]);
	G.TCinfo!.ints[1] = Int(G.splits[1]);
	G.TCinfo!.ints[2] = Int(G.splits[2]);
	G.TCinfo!.floats[0] = Float(G.splits[3]);
	G.TCinfo!.floats[1] = Float(G.splits[4]);
	G.TCinfo!.floats[2] = Float(G.splits[5]);
	G.TCinfo!.strings[0] = G.splits[6];
	G.TCinfo!.strings[1] = G.splits[7];
	G.TCinfo!.strings[2] = G.splits[8];
}

//### Info Object in area of info typ
/** Function info_area(typ,x#,z#) */
export function info_area(typ: number, x: number, z: number): number {
	let Tinfo_: Tinfo | null = null;

	for (Tinfo_ = First(Tinfo); Tinfo_ !== null; Tinfo_ = After(Tinfo, Tinfo_)) {
		if (Tinfo_.typ === typ) {
			//Check
			if (f32(dist(EntityX(Tinfo_.h), EntityZ(Tinfo_.h), x, z) - Tinfo_.floats[0]) <= 0) {
				//Is in!
				return 1;
			}
		}
	}
	//Failed
	return 0;
}

//### Spawncontrol
/** Function info_spawncontrol(Tinfo.Tinfo,force=0) */
export function info_spawncontrol(Tinfo_: Tinfo | null, force: number = 0): void {
	let c = 0;
	let pc = 0;
	let Tobject_: Tobject | null = null;
	let i = 0;
	let a = 0;
	let argx = 0;
	let argy = 0;
	let argz = 0;
	let argsize = 0;
	let arga = 0;
	let dist_ = 0; // Float local "dist#"
	let xos = 0;
	let zos = 0;
	let fx = 0;
	let Tunit_: Tunit | null = null;
	let Titem_: Titem | null = null;
	let ypos = 0;

	if (Tinfo_!.typ === 45) {
		//Daytimer Stuff
		Tinfo_!.strings[2] = Str(Int(Tinfo_!.strings[2]) + 1);
		if (Int(Tinfo_!.strings[2]) >= Int(Tinfo_!.strings[1]) || force === 1) {
			//Reset
			Tinfo_!.strings[2] = Str(0);
			//Partial Count
			pc = Int(Tinfo_!.strings[0]);
			//Active?
			if (Int(Tinfo_!.floats[1]) === 1 || force === 1) {
				c = 0;
				switch (Tinfo_!.ints[0]) {
					//Spawn Objects
					case Cclass_object:
						for (Tobject_ = First(Tobject); Tobject_ !== null; Tobject_ = After(Tobject, Tobject_)) {
							if (Tobject_.typ === Tinfo_!.ints[1]) {
								if (dist(EntityX(Tinfo_!.h), EntityZ(Tinfo_!.h), EntityX(Tobject_.h), EntityZ(Tobject_.h)) <= Tinfo_!.floats[0]) {
									c = c + 1;
								}
							}
						}
						c = Tinfo_!.ints[2] - c;
						if (pc > 0 && c > pc) c = pc;
						if (c > 0) {
							for (i = 1; i <= c; i++) {
								a = Rand(360);
								dist_ = Rnd(Tinfo_!.floats[0]);
								xos = f32(Sin(a) * dist_);
								zos = f32(Cos(a) * dist_);
								set_object(-1, Tinfo_!.ints[1], f32(EntityX(Tinfo_!.h) + xos), f32(EntityZ(Tinfo_!.h) + zos));
								if (!isNull(Tobject, G.TCobject)) {
									//Rotate
									RotateEntity(G.TCobject!.h, 0, Rnd(360), 0);
									//Event
									set_parsecache(Cclass_object, G.TCobject!.id, 'spawn');
									if (Instr(Dobject_scriptk(G.TCobject!.typ), SEP_LINE + 'spawn')) {
										parse_task(Cclass_object, G.TCobject!.id, 'spawn', '', Dobject_script(G.TCobject!.typ));
									}
									//FX
									if (EntityInView(G.TCobject!.h, G.cam)) {
										if (EntityDistance(G.TCobject!.h, G.cam) < 3000) {
											for (fx = 1; fx <= 5 + G.set_effects * 10; fx++) {
												// exe: arguments evaluated z, size, alpha, y, x
												argz = f32(EntityZ(G.TCobject!.h) + Rnd(-20, 20));
												argsize = Rnd(3, 6);
												arga = Rnd(0.5, 2);
												argy = f32(EntityY(G.TCobject!.h) + Rnd(-5, 5));
												argx = f32(EntityX(G.TCobject!.h) + Rnd(-20, 20));
												p_add(argx, argy, argz, Cp_spawn, argsize, arga);
											}
										}
									}
								}
							}
						}
						break;
					//Spawn Units
					case Cclass_unit:
						for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
							if (Tunit_.typ === Tinfo_!.ints[1]) {
								if (dist(EntityX(Tinfo_!.h), EntityZ(Tinfo_!.h), EntityX(Tunit_.h), EntityZ(Tunit_.h)) <= Tinfo_!.floats[0]) {
									c = c + 1;
								}
							}
						}
						c = Tinfo_!.ints[2] - c;
						if (pc > 0 && c > pc) c = pc;
						if (c > 0) {
							for (i = 1; i <= c; i++) {
								a = Rand(360);
								dist_ = Rnd(Tinfo_!.floats[0]);
								xos = f32(Sin(a) * dist_);
								zos = f32(Cos(a) * dist_);
								set_unit(-1, Tinfo_!.ints[1], f32(EntityX(Tinfo_!.h) + xos), f32(EntityZ(Tinfo_!.h) + zos));
								if (!isNull(Tunit, G.TCunit)) {
									//Rotate
									RotateEntity(G.TCunit!.h, 0, Rnd(360), 0);
									ai_ini();
									//Event
									set_parsecache(Cclass_unit, G.TCunit!.id, 'spawn');
									if (Instr(Dunit_scriptk(G.TCunit!.typ), SEP_LINE + 'spawn')) {
										parse_task(Cclass_unit, G.TCunit!.id, 'spawn', '', Dunit_script(G.TCunit!.typ));
									}
									//FX
									if (EntityInView(G.TCunit!.h, G.cam)) {
										if (EntityDistance(G.TCunit!.h, G.cam) < 3000) {
											for (fx = 1; fx <= 5 + G.set_effects * 10; fx++) {
												// exe: arguments evaluated z, size, alpha, y, x
												argz = f32(EntityZ(G.TCunit!.h) + Rnd(-20, 20));
												argsize = Rnd(3, 6);
												arga = Rnd(0.5, 2);
												argy = f32(f32(EntityY(G.TCunit!.h) - Dunit_colyr(G.TCunit!.typ)) + Rnd(-5, 5));
												argx = f32(EntityX(G.TCunit!.h) + Rnd(-20, 20));
												p_add(argx, argy, argz, Cp_spawn, argsize, arga);
											}
										}
									}
								}
							}
						}
						break;
					//Spawn Items
					case Cclass_item:
						for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
							if (Titem_.typ === Tinfo_!.ints[1]) {
								if (dist(EntityX(Tinfo_!.h), EntityZ(Tinfo_!.h), EntityX(Titem_.h), EntityZ(Titem_.h)) <= Tinfo_!.floats[0]) {
									c = c + 1;
								}
							}
						}
						c = Tinfo_!.ints[2] - c;
						if (pc > 0 && c > pc) c = pc;
						if (c > 0) {
							for (i = 1; i <= c; i++) {
								a = Rand(360);
								dist_ = Rnd(Tinfo_!.floats[0]);
								xos = f32(Sin(a) * dist_);
								zos = f32(Cos(a) * dist_);
								ypos = f32(e_tery(f32(EntityX(Tinfo_!.h) + xos), f32(EntityZ(Tinfo_!.h) + zos)));
								set_item(-1, Tinfo_!.ints[1], f32(EntityX(Tinfo_!.h) + xos), ypos, f32(EntityZ(Tinfo_!.h) + zos));
								if (!isNull(Titem, G.TCitem)) {
									//Rotate
									RotateEntity(G.TCitem!.h, 0, Rnd(360), 0);
									//Event
									set_parsecache(Cclass_item, G.TCitem!.id, 'spawn');
									if (Instr(Ditem_scriptk(G.TCitem!.typ), SEP_LINE + 'spawn')) {
										parse_task(Cclass_item, G.TCitem!.id, 'spawn', '', Ditem_script(G.TCitem!.typ));
									}
									//FX
									if (EntityInView(G.TCitem!.h, G.cam)) {
										if (EntityDistance(G.TCitem!.h, G.cam) < 3000) {
											for (fx = 1; fx <= 5 + G.set_effects * 10; fx++) {
												// exe: arguments evaluated z, size, alpha, y, x
												argz = f32(EntityZ(G.TCitem!.h) + Rnd(-20, 20));
												argsize = Rnd(3, 6);
												arga = Rnd(0.5, 2);
												argy = f32(EntityY(G.TCitem!.h) + Rnd(-5, 5));
												argx = f32(EntityX(G.TCitem!.h) + Rnd(-20, 20));
												p_add(argx, argy, argz, Cp_spawn, argsize, arga);
											}
										}
									}
								}
							}
						}
						break;
				}
			}
		}
	}
}

//### Setup Info Sprite
/** Function info_setupsprite(i.Tinfo) */
export function info_setupsprite(i: Tinfo | null): void {
	let x = 0;
	let y = 0;
	let z = 0;
	let usesprite = 0;
	let tex: Texture | null = null;
	let temp: Handle = null;

	x = EntityX(i!.h);
	y = EntityY(i!.h);
	z = EntityZ(i!.h);
	usesprite = 0;
	FreeEntity(i!.h);
	if (i!.strings[0] !== '') {
		tex = load_res(i!.strings[0], Cres_texture);
		if (tex !== null) {
			//Sprite
			i!.h = CreateSprite();
			EntityTexture(i!.h, tex);
			ScaleSprite(i!.h, i!.floats[0], i!.floats[1]);
			EntityColor(i!.h, i!.ints[0], i!.ints[1], i!.ints[2]);
			EntityAlpha(i!.h, i!.floats[2]);
			if (Int(i!.strings[1]) === 1) {
				EntityBlend(i!.h, 3);
			}
			if (Int(i!.strings[2]) === 1) {
				SpriteViewMode(i!.h, 4);
			}
			EntityAutoFade(i!.h, f32(500 * G.set_viewfac), f32(f32(500 * G.set_viewfac) + 300));
			//Create Handle in order to make info clickable (Editor only)
			temp = i!.h;
			NameEntity(temp, 'model');
			if (G.m_section === Csection_editor) {
				i!.h = CreateCube();
				ScaleEntity(i!.h, 5, 5, 5);
				EntityBlend(i!.h, 3);
				EntityColor(i!.h, 0, 255, 0);
				EntityAutoFade(i!.h, 5000, 5500);
				EntityPickMode(i!.h, 2, 1);
				EntityParent(temp, i!.h);
			}
			usesprite = 1;
		}
	}
	if (usesprite === 0) {
		if (G.m_section === Csection_editor) {
			i!.h = CreateCube();
			ScaleEntity(i!.h, 5, 5, 5);
			EntityBlend(i!.h, 3);
			EntityColor(i!.h, 0, 255, 0);
			EntityAutoFade(i!.h, 5000, 5500);
			EntityPickMode(i!.h, 2, 1);
		} else {
			i!.h = CreatePivot();
			HideEntity(i!.h);
		}
	}
	PositionEntity(i!.h, x, y, z);
}

//### Setup Info Loudspeaker
/** Function info_setuploudspeaker(i.Tinfo) */
export function info_setuploudspeaker(i: Tinfo | null): void {
	if (i!.strings[0] !== '') {
		//Loadsound
		if (FileType(i!.strings[0]) === 1) {
			i!.ints[0] = RT.audio.bb.LoadSound(i!.strings[0]);
			if (i!.ints[0] !== 0) {
				RT.audio.bb.LoopSound(i!.ints[0]);
				//Play?
				//Play Everywhere
				if (i!.floats[0] === 0.0) {
					if (i!.ints[1] === 0) i!.ints[1] = sfx(i!.ints[0]);
				}
			}
		}
	} else {
		if (G.tmp_loading === 0) {
			//Stopsound
			if (i!.ints[1] !== 0) RT.audio.bb.StopChannel(i!.ints[1]);
			i!.ints[0] = 0;
			i!.ints[1] = 0;
		}
	}
}

//### Frap Routine
/** Function frap_info() */
export function frap_info(): void {
	let Tinfo_: Tinfo | null = null;
	let h: Handle = null;
	let size = 0;
	let piv: Handle = null;
	let rx = 0;
	let ry = 0;
	let rz = 0;
	let rx2d = 0;
	let ry2d = 0;
	let px = 0;
	let py = 0;
	let s = 0;
	let shift = 0;
	let mhp: Handle = null;

	Tinfo_ = G.TCinfo;

	//Setup
	h = Tinfo_!.h;
	size = 20;
	// quirk: this pivot is never freed
	piv = CreatePivot();
	rx = EntityX(h);
	ry = EntityY(h);
	rz = EntityZ(h);
	CameraProject(G.cam, rx, ry, rz);
	rx2d = Int(ProjectedX());
	ry2d = Int(ProjectedY());
	RotateEntity(piv, EntityPitch(h, 1), EntityYaw(h, 1), EntityRoll(h, 1));

	s = 0.25;
	shift = KeyDown(42) + KeyDown(54);

	if (EntityInView(Tinfo_!.h, G.cam)) {
		if (rx2d > G.in_editor_sidebar * 210) {
			if (ry2d > 0) {
				//(1) Red Pitch
				Color(255, 0, 0);
				PositionEntity(piv, rx, ry, rz);
				MoveEntity(piv, size, 0, 0);
				CameraProject(G.cam, EntityX(piv), EntityY(piv), EntityZ(piv));
				px = Int(ProjectedX());
				py = Int(ProjectedY());
				// quirk: 210 here, in_editor_sidebar*210 for the other axes
				if (px > 210) {
					if (py > 0) {
						Line(rx2d, ry2d, px, py);
						DrawImage(G.gfx_ex, px, py);

						if (G.in_frapdown === 0) {
							if (G.in_mx > px - 5) {
								if (G.in_my > py - 5) {
									if (G.in_mx < px + 5) {
										if (G.in_my < py + 5) {
											DrawImage(G.gfx_esel, px, py);
											if (G.in_mdown[1]) {
												G.in_mx = px;
												G.in_mxo = G.in_mx;
												G.in_my = py;
												G.in_myo = G.in_my;
												G.in_frapdown = 1;
												if (shift === 0) {
													G.in_cursorf = 4;
													RotateEntity(h, f32(EntityPitch(h) + f32(f32(G.in_mxs + G.in_mys) * s)), EntityYaw(h), EntityRoll(h));
												} else {
													G.in_cursorf = 2;
													MoveEntity(h, f32(f32(G.in_mxs + G.in_mys) * s), 0, 0);
												}
											}
										}
									}
								}
							}
						} else if (G.in_frapdown === 1) {
							DrawImage(G.gfx_esel, px, py);
							if (G.in_mdown[1]) {
								G.in_mx = px;
								G.in_mxo = G.in_mx;
								G.in_my = py;
								G.in_myo = G.in_my;
								G.in_frapdown = 1;
								if (shift === 0) {
									G.in_cursorf = 4;
									RotateEntity(h, f32(EntityPitch(h) + f32(f32(G.in_mxs + G.in_mys) * s)), EntityYaw(h), EntityRoll(h));
								} else {
									G.in_cursorf = 2;
									MoveEntity(h, f32(f32(G.in_mxs + G.in_mys) * s), 0, 0);
								}
							}
						}
					}
				}

				//(2) Green Yaw
				Color(0, 255, 0);
				PositionEntity(piv, rx, ry, rz);
				MoveEntity(piv, 0, size, 0);
				CameraProject(G.cam, EntityX(piv), EntityY(piv), EntityZ(piv));
				px = Int(ProjectedX());
				py = Int(ProjectedY());
				if (px > G.in_editor_sidebar * 210) {
					if (py > 0) {
						Line(rx2d, ry2d, px, py);
						DrawImage(G.gfx_ey, px, py);

						if (G.in_frapdown === 0) {
							if (G.in_mx > px - 5) {
								if (G.in_my > py - 5) {
									if (G.in_mx < px + 5) {
										if (G.in_my < py + 5) {
											DrawImage(G.gfx_esel, px, py);
											if (G.in_mdown[1]) {
												G.in_mx = px;
												G.in_mxo = G.in_mx;
												G.in_my = py;
												G.in_myo = G.in_my;
												G.in_frapdown = 2;
												if (shift === 0) {
													G.in_cursorf = 4;
													RotateEntity(h, EntityPitch(h), f32(EntityYaw(h) + f32(f32(G.in_mxs + G.in_mys) * s)), EntityRoll(h));
												} else {
													G.in_cursorf = 2;
													MoveEntity(h, 0, f32(f32(G.in_mxs + G.in_mys) * s), 0);
												}
											}
										}
									}
								}
							}
						} else if (G.in_frapdown === 2) {
							DrawImage(G.gfx_esel, px, py);
							if (G.in_mdown[1]) {
								G.in_mx = px;
								G.in_mxo = G.in_mx;
								G.in_my = py;
								G.in_myo = G.in_my;
								G.in_frapdown = 2;
								if (shift === 0) {
									G.in_cursorf = 4;
									RotateEntity(h, EntityPitch(h), f32(EntityYaw(h) + f32(f32(G.in_mxs + G.in_mys) * s)), EntityRoll(h));
								} else {
									G.in_cursorf = 2;
									MoveEntity(h, 0, f32(f32(G.in_mxs + G.in_mys) * s), 0);
								}
							}
						}
					}
				}

				//(3) Blue Roll
				Color(0, 0, 255);
				PositionEntity(piv, rx, ry, rz);
				MoveEntity(piv, 0, 0, size);
				CameraProject(G.cam, EntityX(piv), EntityY(piv), EntityZ(piv));
				px = Int(ProjectedX());
				py = Int(ProjectedY());
				if (px > G.in_editor_sidebar * 210) {
					if (py > 0) {
						Line(rx2d, ry2d, px, py);

						DrawImage(G.gfx_ez, px, py);

						if (G.in_frapdown === 0) {
							if (G.in_mx > px - 5) {
								if (G.in_my > py - 5) {
									if (G.in_mx < px + 5) {
										if (G.in_my < py + 5) {
											DrawImage(G.gfx_esel, px, py);
											if (G.in_mdown[1]) {
												G.in_mx = px;
												G.in_mxo = G.in_mx;
												G.in_my = py;
												G.in_myo = G.in_my;
												G.in_frapdown = 3;
												if (shift === 0) {
													G.in_cursorf = 4;
													RotateEntity(h, EntityPitch(h), EntityYaw(h), f32(EntityRoll(h) + f32(f32(G.in_mxs + G.in_mys) * s)));
												} else {
													G.in_cursorf = 2;
													MoveEntity(h, 0, 0, f32(f32(G.in_mxs + G.in_mys) * s));
												}
											}
										}
									}
								}
							}
						} else if (G.in_frapdown === 3) {
							DrawImage(G.gfx_esel, px, py);
							if (G.in_mdown[1]) {
								G.in_mx = px;
								G.in_mxo = G.in_mx;
								G.in_my = py;
								G.in_myo = G.in_my;
								G.in_frapdown = 3;
								if (shift === 0) {
									G.in_cursorf = 4;
									RotateEntity(h, EntityPitch(h), EntityYaw(h), f32(EntityRoll(h) + f32(f32(G.in_mxs + G.in_mys) * s)));
								} else {
									G.in_cursorf = 2;
									MoveEntity(h, 0, 0, f32(f32(G.in_mxs + G.in_mys) * s));
								}
							}
						}
					}
				}

				//(4) Green Center Position
				px = rx2d;
				py = ry2d;
				DrawImage(G.gfx_ey, px, py);

				if (G.in_frapdown === 0) {
					if (G.in_mx > px - 5) {
						if (G.in_my > py - 5) {
							if (G.in_mx < px + 5) {
								if (G.in_my < py + 5) {
									DrawImage(G.gfx_esel, px, py);
									if (G.in_mdown[1]) {
										G.in_mx = px;
										G.in_mxo = G.in_mx;
										G.in_my = py;
										G.in_myo = G.in_my;
										G.in_frapdown = 4;
										G.in_cursorf = 2;
										TranslateEntity(h, 0, f32(-G.in_mys * s), 0);
										mhp = CreatePivot();
										PositionEntity(mhp, EntityX(h), 0, EntityZ(h));
										RotateEntity(mhp, 0, EntityYaw(G.cam), 0);
										MoveEntity(mhp, f32(-G.in_mxs * s), 0, f32(G.in_mzs * s));
										PositionEntity(h, EntityX(mhp), EntityY(h), EntityZ(mhp));
										FreeEntity(mhp);
									}
								}
							}
						}
					}
				} else if (G.in_frapdown === 4) {
					DrawImage(G.gfx_esel, px, py);
					if (G.in_mdown[1]) {
						G.in_mx = px;
						G.in_mxo = G.in_mx;
						G.in_my = py;
						G.in_myo = G.in_my;
						G.in_frapdown = 4;
						G.in_cursorf = 2;
						TranslateEntity(h, 0, f32(-G.in_mys * s), 0);
						mhp = CreatePivot();
						PositionEntity(mhp, EntityX(h), 0, EntityZ(h));
						RotateEntity(mhp, 0, EntityYaw(G.cam), 0);
						MoveEntity(mhp, f32(-G.in_mxs * s), 0, f32(G.in_mzs * s));
						PositionEntity(h, EntityX(mhp), EntityY(h), EntityZ(mhp));
						FreeEntity(mhp);
					}
				}

				//Name
				if (G.in_frapdown === 0) {
					CameraProject(G.cam, EntityX(Tinfo_!.h), EntityY(Tinfo_!.h), EntityZ(Tinfo_!.h));
					bmpf_txt_c(Int(ProjectedX()), Int(f32(ProjectedY() - 30)), '#' + Str(Tinfo_!.id) + ' ' + Dinfo_name(Tinfo_!.typ), Cbmpf_tiny);
				}

				//Info
				G.in_edoverinfo = ss(se(197), Dinfo_name(Tinfo_!.typ));
			}
		}
	}

	//Free
	if (KeyHit(211)) {
		free_info(Tinfo_!.id);
		G.in_fraph = null;
	}

	//Leave FRAP Mode
	if (KeyHit(57)) G.in_fraph = null;
}
