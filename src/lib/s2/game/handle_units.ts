/**
 * includes/handle_units.bb - Handle units.
 * Line-by-line port (PORTING_GUIDE.md). Package entities1.
 */
import {
	Animate,
	CameraProject,
	CopyEntity,
	CreateCube,
	CreatePivot,
	CreateSphere,
	EntityAlpha,
	EntityAutoFade,
	EntityBlend,
	EntityColor,
	EntityDistance,
	EntityFX,
	EntityInView,
	EntityParent,
	EntityPickMode,
	EntityPitch,
	EntityRadius,
	EntityRoll,
	EntityShininess,
	EntityType,
	EntityVisible,
	EntityX,
	EntityY,
	EntityYaw,
	EntityZ,
	ExtractAnimSeq,
	FreeEntity,
	HideEntity,
	MoveEntity,
	PositionEntity,
	ProjectedX,
	ProjectedY,
	RotateEntity,
	ScaleEntity,
	ShowEntity,
	TranslateEntity,
	type Handle
} from '../bb3d';
import { Instr, Int, Len, Rand, SEP_LINE, Str, f32 } from '../blitz';
import { Color, DrawImage, Line } from '../gfx2d';
import { KeyDown, KeyHit } from '../input';
import { ai_mode, ai_modetxt } from './ai_units';
import { con_add } from './console';
import {
	Cbmpf_tiny,
	Cclass_unit,
	Cp_flash,
	Csection_editor,
	Cstate_bloodrush,
	Cstate_count,
	Cstate_electroshock,
	Cstate_fracture,
	Cstate_frostbite,
	Cstate_invulnerability,
	Cstate_speedmod,
	Cworld_col,
	ai_attack,
	ai_flee,
	ai_hunt,
	ai_sani,
	snd_die
} from './consts';
import {
	Dstate_a,
	Dunit_align,
	Dunit_alpha,
	Dunit_ani_die,
	Dunit_ani_move,
	Dunit_autofade,
	Dunit_behaviour,
	Dunit_col,
	Dunit_color,
	Dunit_colxr,
	Dunit_colyr,
	Dunit_eyes,
	Dunit_fx,
	Dunit_health,
	Dunit_mat,
	Dunit_modelh,
	Dunit_name,
	Dunit_script,
	Dunit_scriptk,
	Dunit_sfx,
	Dunit_shininess,
	Dunit_size,
	Dunit_speed,
	Dunit_store
} from './defs_arrays';
import { e_tery } from './e_environment';
import { set_item, store_item } from './handle_items';
import { free_state, get_state } from './handle_states';
import { if_exchange } from './interface';
import { bmpf_txt_c } from './load_bmpf';
import { material_fx } from './load_materials';
import { se, ss } from './load_strings';
import { free_childs } from './parentchild';
import { parse_error, parse_kill_add, parse_sel, parse_task, set_parsecache } from './parser_functions';
import { defvar_oncreate } from './parser_vars';
import { p_add } from './particles';
import { play_soundset } from './ressources';
import { RT } from './rt';
import { sfx_emit } from './sfx';
import { G } from './state';
import { After, Delete, First, New, Tfind, Tfrap, Tsani, Tstate, Tunit, isNull } from './types';
import { up_free } from './unitpath';

//############################################ Handle units

//### Set unit
/** Function set_unit(id=-1,typ,x#,z#) */
export function set_unit(id: number = -1, typ: number, x: number, z: number): number {
	let y = 0;
	let Tunit_: Tunit | null = null;
	let ch: Handle = null;
	let h: Handle = null;
	let vh: Handle = null;

	G.TCunit = null;

	//Invalid typ? Cancel
	if (Len(Dunit_name(typ)) === 0) return -1;

	//Add at End
	if (id === -1) {
		G.unit_serial = G.unit_serial + 1;
		id = G.unit_serial;
	}

	//Determine Terrain Y for Unit
	y = f32(e_tery(x, z) + 50);

	//Create
	Tunit_ = New(Tunit);
	Tunit_.id = id;
	Tunit_.typ = typ;

	//Create Collision Pivot (Type:h, Local:ch)
	if (G.set_debug) {
		ch = CreateSphere();
		Tunit_.h_pivot = 0;
		EntityAlpha(ch, f32(0.1));
		ScaleEntity(ch, Dunit_colxr(typ), Dunit_colyr(typ), Dunit_colxr(typ));
		EntityBlend(ch, 3);
	} else {
		ch = CreatePivot();
		Tunit_.h_pivot = 1;
	}
	PositionEntity(ch, x, f32(y + Dunit_colyr(typ)), z);
	if (Dunit_col(typ) > 0) {
		EntityType(ch, Dunit_col(typ));
		EntityRadius(ch, Dunit_colxr(typ), Dunit_colyr(typ));
	}
	Tunit_.h = ch;

	//Create Model (Type:mh, Local:h)
	h = CopyEntity(Dunit_modelh(typ));
	PositionEntity(h, x, y, z);
	Tunit_.mh = h;

	//Animate Model (in editor)
	if (G.m_section === Csection_editor) {
		Animate(h, 2, Dunit_ani_move(typ, 0), Int(Dunit_ani_move(typ, 1)));
	}

	//Adjust
	ScaleEntity(h, Dunit_size(typ, 0), Dunit_size(typ, 1), Dunit_size(typ, 2));
	EntityColor(h, Dunit_color(typ, 0), Dunit_color(typ, 1), Dunit_color(typ, 2));
	if (Dunit_fx(typ) !== 0) EntityFX(h, Dunit_fx(typ));
	if (Dunit_autofade(typ) !== 0) EntityAutoFade(h, f32(f32(Dunit_autofade(typ)) * G.set_viewfac), f32(f32(f32(Dunit_autofade(typ)) * G.set_viewfac) + 300));
	EntityAlpha(h, Dunit_alpha(typ));
	if (Dunit_shininess(typ) > 0.0) EntityShininess(h, Dunit_shininess(typ));

	//Vehicle Model
	if (Dunit_behaviour(typ) > 499) {
		if (Dunit_behaviour(typ) !== 502) {
			vh = CopyEntity(Dunit_modelh(typ));
			ScaleEntity(vh, Dunit_size(typ, 0), Dunit_size(typ, 1), Dunit_size(typ, 2));
			if (G.set_debug === 1) {
				EntityAlpha(vh, 0.5);
				//If m_section=Csection_editor Then EntityAlpha vh,0.
			} else {
				EntityAlpha(vh, 0);
			}
			EntityType(vh, Cworld_col);
			Tunit_.vh = vh;
		}
	}

	//Values
	Tunit_.health = f32(Dunit_health(typ));
	Tunit_.health_max = f32(Dunit_health(typ));
	//Tunit\hunger#=Dunit_store#(typ)
	//Tunit\thirst#=Dunit_store#(typ)
	//Tunit\exhaustion#=Dunit_store#(typ)

	//AI
	Tunit_.ai_cx = f32(x);
	Tunit_.ai_cz = f32(z);
	Tunit_.ai_ch = CreatePivot();

	//Parent
	EntityParent(h, ch);

	//Position
	switch (Dunit_align(typ)) {
		case 0:
			TranslateEntity(ch, 0, -50, 0);
			break;
		case 1:
			PositionEntity(Tunit_.h, x, f32(1 + Dunit_colyr(typ)), z);
			break;
	}

	//Pick
	EntityPickMode(Tunit_.mh, 2, 1);

	//Event: on:create
	if (G.tmp_loading === 0) {
		set_parsecache(Cclass_unit, Tunit_.id, 'create');
		if (Instr(Dunit_scriptk(Tunit_.typ), SEP_LINE + 'create')) {
			parse_task(Cclass_unit, Tunit_.id, 'create', '', Dunit_script(Tunit_.typ));
		}
	}

	//Defvars
	if (G.tmp_loading === 0) defvar_oncreate(Cclass_unit, id, typ);

	//Okay
	G.TCunit = Tunit_;
	// quirk: no Return value at the end: a created unit returns 0, an invalid typ -1
	return 0;
}

//### Get Unit ID by Handle
/** Function get_unit(searchhandle,bycollisionpivot=0) */
export function get_unit(searchhandle: Handle, bycollisionpivot: number = 0): number {
	let Tunit_: Tunit | null = null;
	//by Model Handle
	if (bycollisionpivot === 0) {
		for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
			if (Tunit_.mh === searchhandle) {
				G.TCunit = Tunit_;
				return Tunit_.id;
			}
		}
		//by Collision Pivot Handle
	} else {
		for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
			if (Tunit_.h === searchhandle) {
				G.TCunit = Tunit_;
				return Tunit_.id;
				// quirk: searchhandle 0 matches the first unit without vehicle model (vh=0)
			} else if (Tunit_.vh === searchhandle) {
				G.TCunit = Tunit_;
				return Tunit_.id;
			}
		}
	}
	return -1;
}

//### Get Unit Collision Pivot Handle
/** Function get_unitcp(searchhandle) */
export function get_unitcp(searchhandle: Handle): number {
	let Tunit_: Tunit | null = null;
	for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
		if (Tunit_.h === searchhandle) {
			G.TCunit = Tunit_;
			return Tunit_.id;
		}
	}
	return -1;
}

//### Set Unit Container
/** Function con_unit(id) */
export function con_unit(id: number): number {
	let Tunit_: Tunit | null = null;
	for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
		if (Tunit_.id === id) {
			G.TCunit = Tunit_;
			return 1;
		}
	}
	return 0;
}

//### Draw Unit
/** Function draw_unit() */
export function draw_unit(): void {
	let Tunit_: Tunit | null = null;
	let found = 0;
	let Tfrap_: Tfrap | null = null;

	Tunit_ = G.TCunit;
	if (EntityInView(Tunit_!.h, G.cam)) {
		//Name
		CameraProject(G.cam, EntityX(Tunit_!.h), EntityY(Tunit_!.h), EntityZ(Tunit_!.h));
		bmpf_txt_c(Int(ProjectedX()), Int(f32(ProjectedY() - 60)), '#' + Str(Tunit_!.id) + ' ' + Dunit_name(Tunit_!.typ), Cbmpf_tiny);
		bmpf_txt_c(Int(ProjectedX()), Int(f32(ProjectedY() - 30)), Str(Tunit_!.health, 'float') + '|' + Str(Tunit_!.health_max, 'float'), Cbmpf_tiny);
		//Free Rotation and Position
		if (KeyHit(57)) {
			found = 0;
			for (Tfrap_ = First(Tfrap); Tfrap_ !== null; Tfrap_ = After(Tfrap, Tfrap_)) {
				if (Tfrap_.parent_class === Cclass_unit) {
					if (Tfrap_.parent_id === Tunit_!.id) {
						found = 1;
						break;
					}
				}
			}
			//New FRAP
			if (found === 0) {
				Tfrap_ = New(Tfrap);
				Tfrap_.parent_class = Cclass_unit;
				Tfrap_.parent_id = Tunit_!.id;
				Tfrap_.y = f32(EntityY(Tunit_!.h));
				Tfrap_.pitch = 0;
				Tfrap_.roll = 0;
				G.in_fraph = Tunit_!.h;
				//Existing FRAP
			} else {
				G.in_fraph = Tunit_!.h;
			}
		}
		//Info
		G.in_edoverinfo = ss(se(197), Dunit_name(Tunit_!.typ));
		if (KeyHit(211)) free_unit(Tunit_!.id);
	}
}

//### Draw Units Debug
/** Function draw_units_debug() */
export function draw_units_debug(): void {
	let Tunit_: Tunit | null = null;
	let x = 0;
	let y = 0;
	for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
		if (EntityInView(Tunit_.h, G.cam)) {
			if (EntityDistance(Tunit_.h, G.cam) < 500) {
				//Position
				CameraProject(G.cam, EntityX(Tunit_.h), EntityY(Tunit_.h), EntityZ(Tunit_.h));
				x = Int(ProjectedX());
				y = Int(ProjectedY());
				//ID / Name
				bmpf_txt_c(x, y - 45, '#' + Str(Tunit_.id) + ' ' + Dunit_name(Tunit_.typ), Cbmpf_tiny);
				//AI
				bmpf_txt_c(x, y - 35, ai_modetxt(Tunit_.ai_mode), Cbmpf_tiny);
			}
		}
	}
}

//### Use Unit
/** Function use_unit(id) */
export function use_unit(id: number): number {
	let Tunit_: Tunit | null = null;
	for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
		if (Tunit_.id === id) {
			//Event: on:use
			G.p_skipevent = 0;
			set_parsecache(Cclass_unit, Tunit_.id, 'use');
			if (Instr(Dunit_scriptk(Tunit_.typ), SEP_LINE + 'use')) {
				parse_task(Cclass_unit, Tunit_.id, 'use', '', Dunit_script(Tunit_.typ));
			}
			parse_sel(Cclass_unit, Tunit_.id, 'use');

			//Behaviour based Actions / Looting
			if (G.p_skipevent === 0) {
				if (!isNull(Tunit, Tunit_)) {
					//Loot when dead
					if (Tunit_.health <= 0) {
						if_exchange(Cclass_unit, id);
					}
				}
			}

			return 1;
		}
	}
	return 0;
}

//### Free unit
/** Function free_unit(id,update=1,childs=1) */
export function free_unit(id: number, update: number = 1, childs: number = 1): number {
	let Tunit_: Tunit | null = null;
	void update;
	for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
		if (Tunit_.id === id) {
			//Childs
			if (childs) free_childs(Cclass_unit, id);
			//Chan
			if (Tunit_.chan !== 0) RT.audio.bb.StopChannel(Tunit_.chan);
			//Delete
			// quirk: the AI pivot Tunit\ai_ch is not freed
			if (Tunit_.h !== null) FreeEntity(Tunit_.h);
			if (Tunit_.vh !== null) FreeEntity(Tunit_.vh);
			Delete(Tunit, Tunit_);
			//Ok
			return 1;
		}
	}
	return 0;
}

//### Update unit
//
//
//Function is located @ ai_units.bb!
//
//

//### Determine Serial Peak
/** Function serialpeak_unit() */
export function serialpeak_unit(): void {
	let peak = 99;
	let Tunit_: Tunit | null = null;
	for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
		if (Tunit_.id > peak) peak = Tunit_.id;
	}
	G.unit_serial = peak;
}

//### Hurt Unit
/** Function hurt_unit(damage#,kill=0,pickcords=0) */
export function hurt_unit(damage: number, kill: number = 0, pickcords: number = 0): number {
	let action = 0;

	//Decrase Health
	if (get_state(Cstate_invulnerability, Cclass_unit, G.TCunit!.id) === 0) {
		G.TCunit!.health = f32(G.TCunit!.health - damage);
		if (G.TCunit!.health_max <= 0) {
			G.TCunit!.health = 0;
		}
		//Player Hit Sound
		if (G.TCunit!.id === G.g_player) {
			if (G.TCunit!.health > 0) {
				if (Rand(5) !== 2) {
					sfx_emit(G.sfx_humanhit[Rand(0, 4)], G.TCunit!.h);
				}
			}
		}
	}
	if (pickcords === 1) {
		material_fx(G.in_px, G.in_py, G.in_pz, Dunit_mat(G.TCunit!.typ));
	} else if (pickcords === 0) {
		material_fx(EntityX(G.TCunit!.h), f32(EntityY(G.TCunit!.h) + Dunit_eyes(G.TCunit!.typ)), EntityZ(G.TCunit!.h), Dunit_mat(G.TCunit!.typ));
	}
	//Player? Redscreen
	if (G.TCunit!.id === G.g_player) {
		p_add(0, 0, 0, Cp_flash, f32(0.06), 0.75);
		EntityColor(G.TCp!.h, 255, 0, 0);
	}
	//Kill?
	if (G.TCunit!.health <= 0 || kill === 1) {
		kill_unit();
		return 2;
		//AI Reaction on Hit!
	} else {
		if (G.TCunit!.health_max > 0) {
			if (G.TCunit!.health > 0) {
				//Action
				action = 0;
				//0 - none
				//1 - attack
				//2 - flee
				switch (Dunit_behaviour(G.TCunit!.typ)) {
					case 1:
						action = 2;
						break;
					case 2:
						action = 1;
						break;
					case 7:
						action = 2;
						break;
					case 200:
						action = 2;
						break;
					case 201:
						action = 2;
						break;
					case 300:
						action = 2;
						break;
					case 302:
						action = 1;
						break;
					case 303:
						action = 2;
						break;
					case 403:
						action = 2;
						break;
					case 404:
						action = 2;
						break;
					default:
						action = 0;
				}
				//Perform Action
				if (action !== 0) {
					//attack
					if (action === 1) {
						if (G.TCunit!.ai_mode !== ai_hunt && G.TCunit!.ai_mode !== ai_attack) {
							ai_mode(ai_hunt, 15000);
						}
						//flee
					} else if (action === 2) {
						ai_mode(ai_flee, 10000);
						G.TCunit!.ai_target_class = Cclass_unit;
						G.TCunit!.ai_target_id = G.g_player;
					}
				}
			}
		}
	}
	return 1;
}

//### Change Health
/** Function health_unit(change#) */
export function health_unit(change: number): void {
	G.TCunit!.health = f32(G.TCunit!.health + change);
	if (G.TCunit!.health > G.TCunit!.health_max) G.TCunit!.health = G.TCunit!.health_max;
	//Kill?
	if (G.TCunit!.health <= 0) {
		kill_unit();
	}
}

//### Kill Unit
/** Function kill_unit() */
export function kill_unit(): void {
	let Tkill: Tunit | null = null;
	let tmp_killpivot: Handle = null;
	let Tstate_: Tstate | null = null;

	//Health 0
	Tkill = G.TCunit;
	G.TCunit!.health = 0;
	if (G.TCunit!.health_max > 0) {
		//Set State to "killed" by setting health_max to 0
		Tkill!.health_max = 0;
		Tkill!.health = 0;
		//Spawn Items
		spawn_unit_items(G.TCunit!.id, G.TCunit!.typ);
		//Event: on:kill
		set_parsecache(Cclass_unit, G.TCunit!.id, 'kill');
		if (Instr(Dunit_scriptk(G.TCunit!.typ), SEP_LINE + 'kill')) {
			parse_task(Cclass_unit, G.TCunit!.id, 'kill', '', Dunit_script(G.TCunit!.typ));
			//parse_sel(Cclass_unit,TCunit\id,"kill")
		}
		//Temp Stuff (Tpkill for Parser)
		G.tmp_killclass = Cclass_unit;
		G.tmp_killid = Tkill!.id;
		tmp_killpivot = CreatePivot();
		if (Tkill!.h !== null) {
			PositionEntity(tmp_killpivot, EntityX(Tkill!.h), EntityY(Tkill!.h), EntityZ(Tkill!.h));
			RotateEntity(tmp_killpivot, EntityPitch(Tkill!.h), EntityYaw(Tkill!.h), EntityRoll(Tkill!.h));
		}
		G.tmp_killmodel = tmp_killpivot;
		parse_kill_add(G.tmp_killclass, G.tmp_killid, G.tmp_killmodel);
		//Play Death Animation
		if (!isNull(Tunit, Tkill)) {
			Tkill!.freeze = 0;
			if (Tkill!.ani !== Dunit_ani_die(Tkill!.typ, 1)) {
				Tkill!.ani = Int(Dunit_ani_die(Tkill!.typ, 1));
				Animate(Tkill!.mh, 3, Dunit_ani_die(Tkill!.typ, 0), Int(Dunit_ani_die(Tkill!.typ, 1)));
				//SFX
				play_soundset(Dunit_sfx(Tkill!.typ), snd_die, Tkill!.h);
			}
			//Health Max
			Tkill!.health_max = 0;
		}
		G.tmp_kill = 1;
	}
	if (!isNull(Tunit, Tkill)) {
		//Modify Collision
		EntityType(Tkill!.h, 0);
		EntityPickMode(Tkill!.mh, 2, 1);
		//States
		for (Tstate_ = First(Tstate); Tstate_ !== null; Tstate_ = After(Tstate, Tstate_)) {
			if (Tstate_.parent_class === Cclass_unit) {
				if (Tstate_.parent_id === Tkill!.id) {
					free_state(Tstate_.typ, Cclass_unit, Tkill!.id);
				}
			}
		}
		//Unit Paths
		up_free(Tkill!.id);
		//Player
		if (Tkill!.id === G.g_player) {
			G.g_player_dead = 1;
		}

		//p_fragment(Tkill\mh)
	}
}

//### Check Values
/** Function unit_values() */
export function unit_values(): void {
	//Max Health
	if (G.TCunit!.health_max < 0) G.TCunit!.health_max = 0;
	//Health
	if (G.TCunit!.health <= 0) G.TCunit!.health = 0;
	if (G.TCunit!.health > G.TCunit!.health_max) G.TCunit!.health = G.TCunit!.health_max;
	//Hunger
	if (G.TCunit!.hunger > Dunit_store(G.TCunit!.typ)) G.TCunit!.hunger = f32(Dunit_store(G.TCunit!.typ));
	if (G.TCunit!.hunger < 0) G.TCunit!.hunger = 0;
	//Thirst
	if (G.TCunit!.thirst > Dunit_store(G.TCunit!.typ)) G.TCunit!.thirst = f32(Dunit_store(G.TCunit!.typ));
	if (G.TCunit!.thirst < 0) G.TCunit!.thirst = 0;
	//Exhaustion
	if (G.TCunit!.exhaustion > Dunit_store(G.TCunit!.typ)) G.TCunit!.exhaustion = f32(Dunit_store(G.TCunit!.typ));
	if (G.TCunit!.exhaustion < 0) G.TCunit!.exhaustion = 0;
}

//### Spawn Items at Unit
/** Function spawn_unit_items(unitid,unittyp) */
export function spawn_unit_items(unitid: number, unittyp: number): void {
	let Tfind_: Tfind | null = null;
	let id = 0;
	//Spawn
	for (Tfind_ = First(Tfind); Tfind_ !== null; Tfind_ = After(Tfind, Tfind_)) {
		if (Tfind_.class === Cclass_unit) {
			if (Tfind_.parent === unittyp) {
				id = set_item(-1, Tfind_.typ, 0, 0, 0, Tfind_.max);
				if (id !== 0) {
					store_item(id, Cclass_unit, unitid);
				}
			}
		}
	}
}

//### Animate
/** Function ani_unit(mode,speed#,seq,transition#=1.,override=0) */
export function ani_unit(mode: number, speed: number, seq: number, transition: number = 1, override: number = 0): void {
	if (G.TCunit!.ani !== seq || override === 1) {
		G.TCunit!.ani = seq;
		Animate(G.TCunit!.mh, mode, speed, seq, transition);
	}
}

//### Position Unit
/** Function pos_unit(unit.Tunit,x#,y#,z#) */
export function pos_unit(unit: Tunit | null, x: number, y: number, z: number): void {
	HideEntity(unit!.h);
	PositionEntity(unit!.h, x, y, z);
	ShowEntity(unit!.h);
	if (unit!.vh !== null) {
		HideEntity(unit!.vh);
		PositionEntity(unit!.vh, x, y, z);
		ShowEntity(unit!.vh);
	}
}

//### Frap Routine
/** Function frap_unit() */
export function frap_unit(): void {
	let Tunit_: Tunit | null = null;
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
	let Tfrap_: Tfrap | null = null;

	Tunit_ = G.TCunit;

	//Setup
	h = Tunit_!.h;
	size = 20;
	// quirk: this pivot is never freed (one per call)
	piv = CreatePivot();
	rx = f32(EntityX(h));
	ry = f32(EntityY(h));
	rz = f32(EntityZ(h));
	CameraProject(G.cam, rx, ry, rz);
	rx2d = Int(ProjectedX());
	ry2d = Int(ProjectedY());
	RotateEntity(piv, EntityPitch(h, 1), EntityYaw(h, 1), EntityRoll(h, 1));

	s = f32(0.25);
	// quirk: shift is read but units can only be moved
	shift = KeyDown(42) + KeyDown(54);
	void shift;

	if (EntityInView(Tunit_!.h, G.cam)) {
		if (rx2d > G.in_editor_sidebar * 210) {
			if (ry2d > 0) {
				//(1) Red Pitch
				Color(255, 0, 0);
				PositionEntity(piv, rx, ry, rz);
				MoveEntity(piv, size, 0, 0);
				CameraProject(G.cam, EntityX(piv), EntityY(piv), EntityZ(piv));
				px = Int(ProjectedX());
				py = Int(ProjectedY());
				// quirk: the red handle tests px>210 without in_editor_sidebar
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
												G.in_cursorf = 2;
												MoveEntity(h, f32(f32(G.in_mxs + G.in_mys) * s), 0, 0);
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
								G.in_cursorf = 2;
								MoveEntity(h, f32(f32(G.in_mxs + G.in_mys) * s), 0, 0);
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
												G.in_cursorf = 2;
												MoveEntity(h, 0, f32(f32(G.in_mxs + G.in_mys) * s), 0);
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
								G.in_cursorf = 2;
								MoveEntity(h, 0, f32(f32(G.in_mxs + G.in_mys) * s), 0);
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
												G.in_cursorf = 2;
												MoveEntity(h, 0, 0, f32(f32(G.in_mxs + G.in_mys) * s));
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
								G.in_cursorf = 2;
								MoveEntity(h, 0, 0, f32(f32(G.in_mxs + G.in_mys) * s));
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
					CameraProject(G.cam, EntityX(Tunit_!.h), EntityY(Tunit_!.h), EntityZ(Tunit_!.h));
					bmpf_txt_c(Int(ProjectedX()), Int(f32(ProjectedY() - 30)), '#' + Str(Tunit_!.id) + ' ' + Dunit_name(Tunit_!.typ), Cbmpf_tiny);
				}

				//Info
				G.in_edoverinfo = ss(se(197), Dunit_name(Tunit_!.typ));
			}
		}
	}

	//Update FRAP Data
	for (Tfrap_ = First(Tfrap); Tfrap_ !== null; Tfrap_ = After(Tfrap, Tfrap_)) {
		if (Tfrap_.parent_class === Cclass_unit) {
			if (Tfrap_.parent_id === Tunit_!.id) {
				Tfrap_.y = f32(EntityY(Tunit_!.h));
				//Tfrap\pitch#=EntityPitch(Tunit\h)
				//Tfrap\roll#=EntityRoll(Tunit\h)
				break;
			}
		}
	}

	//Free
	if (KeyHit(211)) {
		free_unit(Tunit_!.id);
		G.in_fraph = null;
	}

	//Leave FRAP Mode
	if (KeyHit(57)) G.in_fraph = null;
}

//(Un)Freeze
/** Function freeze_unit(unit.Tunit,mode=1) */
export function freeze_unit(unit: Tunit | null, mode: number = 1): void {
	if (mode === 1) {
		unit!.freeze = 1;
		unit!.ani = 0;
		Animate(unit!.mh, 0);
	} else {
		unit!.freeze = 0;
	}
}

//Calc Speed
/** Function unit_speed#() */
export function unit_speed(): number {
	let speed = f32(Dunit_speed(G.TCunit!.typ));
	let Tstate_: Tstate | null = null;
	if (G.TCunit!.states === 1) {
		for (Tstate_ = First(Tstate); Tstate_ !== null; Tstate_ = After(Tstate, Tstate_)) {
			if (Tstate_.typ <= Cstate_count) {
				if (Tstate_.parent_class === Cclass_unit) {
					if (Tstate_.parent_id === G.TCunit!.id) {
						if (Dstate_a(Tstate_.typ)) {
							switch (Tstate_.typ) {
								case Cstate_frostbite:
									speed = f32(speed * 0.5);
									break;
								case Cstate_fracture:
									speed = f32(speed * 0.5);
									break;
								case Cstate_electroshock:
									speed = f32(speed * 0.5);
									break;
								case Cstate_bloodrush:
									speed = f32(speed * Tstate_.value_f);
									break;
								case Cstate_speedmod:
									speed = f32(Tstate_.value_f);
									break;
							}
						}
					}
				}
			}
		}
	}
	return speed;
}

//Loadani
/** Function unit_loadani(typ,f1,f2) */
export function unit_loadani(typ: number, f1: number, f2: number): number {
	let Tsani_: Tsani | null = null;
	//Exists?
	for (Tsani_ = First(Tsani); Tsani_ !== null; Tsani_ = After(Tsani, Tsani_)) {
		if (Tsani_.typ === typ) {
			if (Tsani_.f1 === f1) {
				if (Tsani_.f2 === f2) {
					return 1;
				}
			}
		}
	}
	//Create New
	if (Dunit_modelh(typ) !== null) {
		Tsani_ = New(Tsani);
		Tsani_.typ = typ;
		Tsani_.f1 = f1;
		Tsani_.f2 = f2;
		Tsani_.h = ExtractAnimSeq(Dunit_modelh(typ), f1, f2);
		// quirk: the failed Tsani stays in the list, so a second call for the same frames returns 1
		if (Tsani_.h === 0) {
			parse_error('Failed to load animation');
			return 0;
		} else {
			return 1;
		}
	} else {
		parse_error("Unit type '" + Str(typ) + "' does not exist - unable to load animation");
		return 0;
	}
}

//Scriptani
/** Function unit_scriptani(id,f1,f2,speed#,mode=3) */
export function unit_scriptani(id: number, f1: number, f2: number, speed: number, mode: number = 3): number {
	let Tunit_: Tunit | null = null;
	let Tsani_: Tsani | null = null;
	con_add('animate unit ' + Str(id) + ' ' + Str(f1) + ' - ' + Str(f2) + ' speed ' + Str(speed, 'float') + ' mode ' + Str(mode));
	for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
		if (Tunit_.id === id) {
			//Exists?
			for (Tsani_ = First(Tsani); Tsani_ !== null; Tsani_ = After(Tsani, Tsani_)) {
				if (Tsani_.typ === Tunit_.typ) {
					if (Tsani_.f1 === f1) {
						if (Tsani_.f2 === f2) {
							if (Tsani_.h !== 0) {
								Animate(Tunit_.mh, 0);
								Tunit_.ani = Tsani_.h;
								Animate(Tunit_.mh, mode, speed, Tsani_.h, 1);
								Tunit_.ai_mode = ai_sani;
								Tunit_.ai_timer = G.gt + 10000;
								con_add('existing sani');
								return 1;
							}
						}
					}
				}
			}
			//Create
			Tsani_ = New(Tsani);
			Tsani_.typ = Tunit_.typ;
			Tsani_.f1 = f1;
			Tsani_.f2 = f2;
			Tsani_.h = ExtractAnimSeq(Dunit_modelh(Tunit_.typ), f1, f2);
			if (Tsani_.h !== 0) {
				Animate(Tunit_.mh, 0);
				Tunit_.ani = Tsani_.h;
				Animate(Tunit_.mh, mode, speed, Tsani_.h, 1);
				Tunit_.ai_mode = ai_sani;
				Tunit_.ai_timer = G.gt + 10000;
				con_add('new sani');
				return 1;
			}
		}
	}
	return 0;
}

//Check Attack Line
/** Function checkattackline() */
export function checkattackline(): number {
	let p1: Handle = null;
	let v = 0;
	if (Dunit_eyes(G.TCunit!.typ) === 0) {
		return 1;
	} else {
		if (!isNull(Tunit, G.g_cplayer)) {
			p1 = CreateCube();
			PositionEntity(p1, EntityX(G.TCunit!.h), f32(EntityY(G.TCunit!.h) - Dunit_eyes(G.TCunit!.typ)), EntityZ(G.TCunit!.h));
			EntityPickMode(p1, 2, 1);
			EntityPickMode(G.TCunit!.mh, 0);
			v = EntityVisible(p1, G.g_cplayer!.h);
			EntityPickMode(G.TCunit!.mh, 2, 1);
			FreeEntity(p1);
			return v;
		} else {
			return 0;
		}
	}
}
