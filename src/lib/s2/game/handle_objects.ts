/**
 * includes/handle_objects.bb - Handle Objects.
 * Line-by-line port (PORTING_GUIDE.md). Package entities1.
 */
import {
	CameraProject,
	CopyEntity,
	CreatePivot,
	EntityAlpha,
	EntityAutoFade,
	EntityColor,
	EntityDistance,
	EntityFX,
	EntityInView,
	EntityPickMode,
	EntityPitch,
	EntityRoll,
	EntityShininess,
	EntityTexture,
	EntityType,
	EntityX,
	EntityY,
	EntityYaw,
	EntityZ,
	FreeEntity,
	MoveEntity,
	PositionEntity,
	ProjectedX,
	ProjectedY,
	RotateEntity,
	ScaleEntity,
	TextureBlend,
	TranslateEntity,
	type Handle,
	type Texture
} from '../bb3d';
import { Ceil, Float, Instr, Int, Len, Rand, Rnd, SEP_LINE, Sin, Str, f32, fmod } from '../blitz';
import { Color, DrawImage, Line } from '../gfx2d';
import { KeyDown, KeyHit } from '../input';
import {
	Cbmpf_green,
	Cbmpf_red,
	Cbmpf_tiny,
	Cclass_object,
	Cclass_unit,
	Cp_fall,
	Cp_splash,
	Cpm_in,
	Cres_texture,
	Csection_editor,
	Cstate_invulnerability,
	Cworld_col
} from './consts';
import {
	Ditem_name,
	Dobject_align,
	Dobject_alpha,
	Dobject_autofade,
	Dobject_behaviour,
	Dobject_col,
	Dobject_color,
	Dobject_detailtex,
	Dobject_fx,
	Dobject_growtime,
	Dobject_health,
	Dobject_mat,
	Dobject_modelh,
	Dobject_name,
	Dobject_script,
	Dobject_scriptk,
	Dobject_searchratio,
	Dobject_shininess,
	Dobject_size,
	Dobject_spawn,
	Dobject_swaypower,
	Dobject_swayspeed
} from './defs_arrays';
import { e_tery } from './e_environment';
import { groundpitch, split } from './functions';
import { countstored_items, item_phyreset, set_item, store_item } from './handle_items';
import { get_state } from './handle_states';
import { con_unit } from './handle_units';
import { if_msg } from './interface';
import { bmpf_txt_c } from './load_bmpf';
import { material_fx } from './load_materials';
import { load_object_model } from './load_objects';
import { se, sm, ss } from './load_strings';
import { drop_childs, free_childs } from './parentchild';
import { parse_kill_add, parse_task, set_parsecache } from './parser_functions';
import { defvar_oncreate } from './parser_vars';
import { p_add, p_add2d } from './particles';
import { load_res } from './ressources';
import { RT } from './rt';
import { sfx, sfx_emit } from './sfx';
import { speech } from './speech';
import { G } from './state';
import { After, Delete, First, New, Tfind, Tfrap, Tobject, Tunit, isNull } from './types';

//############################################ Handle Objects

//### Set Object
/** Function set_object(id=-1,typ,x#,z#,yaw#=0) */
export function set_object(id: number = -1, typ: number, x: number, z: number, yaw: number = 0): number {
	let Tobject_: Tobject | null = null;
	let h: Handle = null;
	let range = 0;
	let detailtex: Texture | null = null;

	G.TCobject = null;

	//Invalid typ? Cancel
	if (Len(Dobject_name(typ)) === 0) return -1;

	//Add at End
	if (id === -1) {
		G.object_serial = G.object_serial + 1;
		id = G.object_serial;
	}

	//Check Model
	if (Dobject_modelh(typ) === null) {
		load_object_model(typ);
	}

	//Create
	Tobject_ = New(Tobject);
	Tobject_.id = id;
	Tobject_.typ = typ;
	h = CopyEntity(Dobject_modelh(typ));
	Tobject_.h = h;

	//Adjust
	ScaleEntity(h, Dobject_size(typ, 0), Dobject_size(typ, 1), Dobject_size(typ, 2));
	EntityColor(h, Dobject_color(typ, 0), Dobject_color(typ, 1), Dobject_color(typ, 2));
	if (Dobject_fx(typ) !== 0) EntityFX(h, Dobject_fx(typ));
	// quirk: range has no sigil: the fade range is rounded to an Int (units keep the Float)
	range = Int(f32(Dobject_autofade(typ) * G.set_viewfac));
	if (Dobject_autofade(typ) !== 0) EntityAutoFade(h, range, range + 300);
	EntityAlpha(h, Dobject_alpha(typ));
	Tobject_.alpha = f32(Dobject_alpha(typ));
	if (Dobject_shininess(typ) > 0.0) EntityShininess(h, Dobject_shininess(typ));
	Tobject_.windsway = f32(Rand(0, 360));

	//Detail Texture
	if (G.set_terrain > 1) {
		// quirk: a String compared with the Int 0 compares as strings ("" <> "0" is true: load_res("") runs for objects without detail texture)
		if (Dobject_detailtex(typ) !== '0') {
			if (Dobject_detailtex(typ) === '1') {
				EntityTexture(Tobject_.h, G.gfx_struc, 0, 2);
			} else {
				detailtex = load_res(Dobject_detailtex(typ), Cres_texture, 256 + 512);
				if (detailtex !== null) {
					TextureBlend(detailtex, 5);
					EntityTexture(Tobject_.h, detailtex, 0, 2);
				}
			}
		}
	}

	//Values
	Tobject_.health = f32(Dobject_health(typ));
	Tobject_.health_max = f32(Dobject_health(typ));

	//Rotate
	RotateEntity(h, 0, yaw, 0);

	//Position
	PositionEntity(h, x, e_tery(x, z), z);
	switch (Dobject_align(typ)) {
		case 0: //-
			break;
		case 1:
			if (EntityY(h) < 1) PositionEntity(h, x, 1, z);
			break;
		case 2:
			RotateEntity(h, groundpitch(h, 60), yaw, 0);
			break;
	}

	//Pick
	if (G.m_section === Csection_editor) {
		EntityPickMode(h, 2, 1);
	} else {
		if (Dobject_col(typ) > 0) {
			EntityPickMode(h, 2, 1);
		}
	}

	//Collision and Collision Handle
	if (G.m_section !== Csection_editor) {
		//1 / 4
		if (Dobject_col(typ) === 1 || Dobject_col(typ) === 4) {
			if (Dobject_swayspeed(typ) !== 0) {
				Tobject_.ch = CopyEntity(Dobject_modelh(typ));
				ScaleEntity(Tobject_.ch, Dobject_size(typ, 0), Dobject_size(typ, 1), Dobject_size(typ, 2));
				EntityAlpha(Tobject_.ch, 0.0);
				EntityType(Tobject_.ch, Cworld_col);
				PositionEntity(Tobject_.ch, EntityX(h), EntityY(h), EntityZ(h));
				RotateEntity(Tobject_.ch, EntityPitch(h), EntityYaw(h), EntityRoll(h));
			} else {
				EntityType(h, Cworld_col);
			}
			//3
		} else if (Dobject_col(typ) === 3) {
			Tobject_.ch = CopyEntity(Dobject_modelh(typ));
			ScaleEntity(Tobject_.ch, Dobject_size(typ, 0), Dobject_size(typ, 1), Dobject_size(typ, 2));
			EntityAlpha(Tobject_.ch, 0.0);
			EntityType(Tobject_.ch, Cworld_col);
			PositionEntity(Tobject_.ch, EntityX(h), EntityY(h), EntityZ(h));
			RotateEntity(Tobject_.ch, EntityPitch(h), EntityYaw(h), EntityRoll(h));
			if (G.set_debug === 1) {
				//EntityAlpha Tobject\ch,0.5
			}
		}
	}

	//Event: on:create
	if (G.tmp_loading === 0) {
		set_parsecache(Cclass_object, Tobject_.id, 'create');
		if (Instr(Dobject_scriptk(Tobject_.typ), SEP_LINE + 'create')) {
			parse_task(Cclass_object, Tobject_.id, 'create', '', Dobject_script(Tobject_.typ));
		}
	}

	//Defvars
	if (G.tmp_loading === 0) defvar_oncreate(Cclass_object, id, typ);

	//Okay
	G.TCobject = Tobject_;
	// quirk: no Return value at the end: a created object returns 0, an invalid typ -1
	return 0;
}

//### Get Object ID by Handle
/** Function get_object(searchhandle) */
export function get_object(searchhandle: Handle): number {
	let Tobject_: Tobject | null = null;
	if (searchhandle === null) return -1;
	for (Tobject_ = First(Tobject); Tobject_ !== null; Tobject_ = After(Tobject, Tobject_)) {
		if (Tobject_.h === searchhandle) {
			G.TCobject = Tobject_;
			return Tobject_.id;
		} else if (Tobject_.ch === searchhandle) {
			G.TCobject = Tobject_;
			return Tobject_.id;
		}
	}
	return -1;
}

//### Set Object Container
/** Function con_object(id) */
export function con_object(id: number): number {
	let Tobject_: Tobject | null = null;
	for (Tobject_ = First(Tobject); Tobject_ !== null; Tobject_ = After(Tobject, Tobject_)) {
		if (Tobject_.id === id) {
			G.TCobject = Tobject_;
			return 1;
		}
	}
	return 0;
}

//### Alpha Object
/** Function alpha_object(id,alpha#) */
export function alpha_object(id: number, alpha: number): number {
	let Tobject_: Tobject | null = null;
	for (Tobject_ = First(Tobject); Tobject_ !== null; Tobject_ = After(Tobject, Tobject_)) {
		if (Tobject_.id === id) {
			Tobject_.alpha = f32(alpha);
			return 1;
		}
	}
	return 0;
}

//### Draw Object
/** Function draw_object() */
export function draw_object(): void {
	let Tobject_: Tobject | null = null;
	let found = 0;
	let Tfrap_: Tfrap | null = null;

	Tobject_ = G.TCobject;
	if (EntityInView(Tobject_!.h, G.cam)) {
		//Name
		CameraProject(G.cam, EntityX(Tobject_!.h), EntityY(Tobject_!.h), EntityZ(Tobject_!.h));
		bmpf_txt_c(Int(ProjectedX()), Int(f32(ProjectedY() - 30)), '#' + Str(Tobject_!.id) + ' ' + Dobject_name(Tobject_!.typ), Cbmpf_tiny);
		//Free Rotation and Position
		if (KeyHit(57)) {
			found = 0;
			for (Tfrap_ = First(Tfrap); Tfrap_ !== null; Tfrap_ = After(Tfrap, Tfrap_)) {
				if (Tfrap_.parent_class === Cclass_object) {
					if (Tfrap_.parent_id === Tobject_!.id) {
						found = 1;
						break;
					}
				}
			}
			//New FRAP
			if (found === 0) {
				Tfrap_ = New(Tfrap);
				Tfrap_.parent_class = Cclass_object;
				Tfrap_.parent_id = Tobject_!.id;
				Tfrap_.y = f32(EntityY(Tobject_!.h));
				Tfrap_.pitch = 0;
				Tfrap_.roll = 0;
				G.in_fraph = Tobject_!.h;
				//Existing FRAP
			} else {
				G.in_fraph = Tobject_!.h;
			}
		}
		//Info
		G.in_edoverinfo = ss(se(197), Dobject_name(Tobject_!.typ));
		if (KeyHit(211)) free_object(Tobject_!.id);
	}
}

//### Use Object
/** Function use_object(id) */
export function use_object(id: number): number {
	let Tobject_: Tobject | null = null;
	for (Tobject_ = First(Tobject); Tobject_ !== null; Tobject_ = After(Tobject, Tobject_)) {
		if (Tobject_.id === id) {
			//Event: on:use
			set_parsecache(Cclass_object, Tobject_.id, 'use');
			if (Instr(Dobject_scriptk(Tobject_.typ), SEP_LINE + 'use')) {
				parse_task(Cclass_object, Tobject_.id, 'use', '', Dobject_script(Tobject_.typ));
			}

			//Search
			//For Tfind.Tfind=Each Tfind
			//	If Tfind\parent=Tobject\typ Then
			//		;Search Menu
			//		in_input$(0)=Tobject\typ
			//		in_input$(1)=Tobject\id
			//		m_menu=Cmenu_if_find
			//		Exit
			//	EndIf
			//Next

			return 1;
		}
	}
	return 0;
}

//### Search Item at Object
/** Function search_object(id,itemtyp) */
export function search_object(id: number, itemtyp: number): number {
	let Tfind_: Tfind | null = null;
	let randomval = 0;
	let findcount = 0;

	if (con_object(id) === 0) return 0;
	//Find
	for (Tfind_ = First(Tfind); Tfind_ !== null; Tfind_ = After(Tfind, Tfind_)) {
		if (Tfind_.parent === G.TCobject!.typ) {
			if (Tfind_.typ === itemtyp) {
				//Damage
				//damage_object(Dobject_searchdamage#(TCobject\typ))
				//Find?
				randomval = Rand(1, 100);
				if (randomval <= Tfind_.ratio) {
					findcount = Rand(Tfind_.min, Tfind_.max);
					set_item(-1, Tfind_.typ, 0, 0, 0, findcount);
					p_add2d(G.in_mx, G.in_my, -2, G.TCitem!.typ);
					if_msg(Ditem_name(G.TCitem!.typ) + ' gefunden!', Cbmpf_green);
					store_item(G.TCitem!.id, Cclass_unit, G.g_player, Cpm_in);
				}
				//Close Screen when object is killed?
				if (con_object(id) === 0) G.m_menu = 0;
				return 0;
			}
		}
	}
	return 0;
}

//### Find Item at Object
/** Function find_object(id) */
export function find_object(id: number): number {
	let wpn = 0;
	let total = 0;
	let Tfind_: Tfind | null = null;
	let total_r = 0;
	let total_t = 0;
	let findcount = 0;
	let itemtyp = 0;
	let oldcount = 0;
	let count = 0;

	if (con_unit(G.g_player)) {
		wpn = G.TCunit!.player_weapon;
	} else {
		return 0;
	}
	if (con_object(id) === 0) return 0;
	//Total
	total = 0;
	//Count
	for (Tfind_ = First(Tfind); Tfind_ !== null; Tfind_ = After(Tfind, Tfind_)) {
		if (Tfind_.class === Cclass_object) {
			if (Tfind_.parent === G.TCobject!.typ) {
				//do only consider stuff which can be found with used or no weapon
				if (wpn === Tfind_.reqtyp || Tfind_.reqtyp === 0) {
					total = total + Tfind_.ratio;
				}
			}
		}
	}
	if (total === 0) return 0; //Nothing to find here
	//Ratio
	if (Rand(1, 100) <= Int(Dobject_searchratio(G.TCobject!.typ))) {
		//Random
		total_r = Rand(0, total);
		total_t = 0;
		//Find
		for (Tfind_ = First(Tfind); Tfind_ !== null; Tfind_ = After(Tfind, Tfind_)) {
			if (Tfind_.class === Cclass_object) {
				if (Tfind_.parent === G.TCobject!.typ) {
					if (wpn === Tfind_.reqtyp || Tfind_.reqtyp === 0) {
						if (total_r >= total_t) {
							if (total_r <= total_t + Tfind_.ratio) {
								findcount = Rand(Tfind_.min, Tfind_.max);
								set_item(-1, Tfind_.typ, EntityX(G.cam), EntityY(G.cam), EntityZ(G.cam), findcount);
								p_add2d(G.in_mx, G.in_my, -2, G.TCitem!.typ);
								itemtyp = G.TCitem!.typ;
								oldcount = countstored_items(Cclass_unit, G.g_player, itemtyp, 0);
								if (store_item(G.TCitem!.id, Cclass_unit, G.g_player, Cpm_in) !== 0) {
									count = countstored_items(Cclass_unit, G.g_player, itemtyp, 0);
									if_msg(ss(sm(180), Ditem_name(itemtyp), Str(count - oldcount)), Cbmpf_green);
									sfx(G.sfx_collect);
								} else {
									if_msg(sm(181), Cbmpf_red);
									sfx(G.sfx_fail);
									speech('nospace');
								}
								return 1;
							}
						}
						total_t = total_t + Tfind_.ratio;
					}
				}
			}
		}
	}
	return 0;
}

//### Free Object
/** Function free_object(id,update=1,childs=1,entity=1) */
export function free_object(id: number, update: number = 1, childs: number = 1, entity: number = 1): number {
	let Tobject_: Tobject | null = null;
	void update;
	for (Tobject_ = First(Tobject); Tobject_ !== null; Tobject_ = After(Tobject, Tobject_)) {
		if (Tobject_.id === id) {
			//Delete Entity (Model)
			if (Tobject_.ch !== null) FreeEntity(Tobject_.ch);
			if (entity === 1) {
				if (Tobject_.h !== null) FreeEntity(Tobject_.h);
			} else {
				G.tmp_h = Tobject_.h;
				EntityType(G.tmp_h, 0);
			}
			//Delete
			Delete(Tobject, Tobject_);
			//Childs
			if (childs) free_childs(Cclass_object, id);
			//Items
			item_phyreset();
			//Ok
			return 1;
		}
	}
	return 0;
}

//### Update Object (windsway only)
/** Function update_object() */
export function update_object(): void {
	let h: Handle = null;
	let angle = 0;
	//Windsway
	if (G.set_windsway) {
		h = G.TCobject!.h;
		angle = G.TCobject!.windsway;
		angle = fmod(f32(angle + f32(Dobject_swayspeed(G.TCobject!.typ) * G.f)), 360);
		G.TCobject!.windsway = angle;
		RotateEntity(h, EntityPitch(h), EntityYaw(h), f32(Sin(angle) * Dobject_swaypower(G.TCobject!.typ)));
	}
}

//### Update Object (based on behaviour)
/** Function update_object_behaviour() */
export function update_object_behaviour(): void {
	switch (Dobject_behaviour(G.TCobject!.typ)) {
		//Fountain
		case 'fountain':
			//FX
			if (G.in_gt50go === 1) {
				// exe: the three Rnd calls run in this order (x, z, size), EntityY last
				p_add(
					f32(EntityX(G.TCobject!.h) + Rnd(-3, 3)),
					f32(EntityY(G.TCobject!.h) + 5),
					f32(EntityZ(G.TCobject!.h) + Rnd(-3, 3)),
					Cp_splash,
					Rnd(15, 18),
					1
				);
				EntityColor(G.TCp!.h, 150, 190, 255);
			}
			//Sound
			if (!RT.audio.bb.ChannelPlaying(G.TCobject!.chan)) {
				if (EntityDistance(G.cam, G.TCobject!.h) < 200) {
					G.TCobject!.chan = sfx_emit(G.sfx_fountain, G.TCobject!.h);
				}
			}
			break;
		//Closeexplode
		case 'closekill':
			//Distance
			if (G.in_gt100go === 1) {
				if (!isNull(Tunit, G.g_cplayer)) {
					if (EntityDistance(G.g_cplayer!.h, G.TCobject!.h) < 50) {
						damage_object(0, 1);
					}
				}
			}
			break;
		//Closetrigger
		case 'closetrigger':
			//Distance
			if (G.in_gt500go === 1) {
				if (!isNull(Tunit, G.g_cplayer)) {
					if (EntityDistance(G.g_cplayer!.h, G.TCobject!.h) < 50) {
						//Event: on:trigger
						set_parsecache(Cclass_object, G.TCobject!.id, 'trigger');
						if (Instr(Dobject_scriptk(G.TCobject!.typ), SEP_LINE + 'trigger')) {
							parse_task(Cclass_object, G.TCobject!.id, 'trigger', '', Dobject_script(G.TCobject!.typ));
						}
					}
				}
			}
			break;
	}
}

//### Determine Serial Peak
/** Function serialpeak_object() */
export function serialpeak_object(): void {
	let peak = 0;
	let Tobject_: Tobject | null = null;
	for (Tobject_ = First(Tobject); Tobject_ !== null; Tobject_ = After(Tobject, Tobject_)) {
		if (Tobject_.id > peak) peak = Tobject_.id;
	}
	G.object_serial = peak;
}

//### Damage Object
/** Function damage_object(damage#,kill=0,pickcords=0) */
export function damage_object(damage: number, kill: number = 0, pickcords: number = 0): number {
	let Tkill: Tobject | null = null;
	let tmp_killpivot: Handle = null;

	//Decrease Health
	if (get_state(Cstate_invulnerability, Cclass_object, G.TCobject!.id) === 0) {
		G.TCobject!.health = f32(G.TCobject!.health - damage);
	}
	if (pickcords === 1) {
		material_fx(G.in_px, G.in_py, G.in_pz, Dobject_mat(G.TCobject!.typ));
	} else if (pickcords === 0) {
		material_fx(EntityX(G.TCobject!.h), EntityY(G.TCobject!.h), EntityZ(G.TCobject!.h), Dobject_mat(G.TCobject!.typ));
	}
	//Kill?
	if (G.TCobject!.health <= 0 || kill === 1) {
		Tkill = G.TCobject;
		//Event: on:kill
		set_parsecache(Cclass_object, G.TCobject!.id, 'kill');
		if (Instr(Dobject_scriptk(G.TCobject!.typ), SEP_LINE + 'kill')) {
			parse_task(Cclass_object, G.TCobject!.id, 'kill', '', Dobject_script(G.TCobject!.typ));
			//parse_sel(Cclass_object,TCobject\id,"kill")
		}
		//Drop Child Items
		drop_childs(Cclass_object, Tkill!.id, 1, Tkill!.h);
		//Behaviour based Stuff
		switch (Dobject_behaviour(Tkill!.typ)) {
			case 'tree':
				sfx_emit(G.sfx_treefall, Tkill!.h);
				break;
		}
		//Free
		G.tmp_h = null;
		G.tmp_killclass = Cclass_object;
		G.tmp_killid = Tkill!.id;
		G.tmp_killspawntimer = Tkill!.daytimer;
		free_object(Tkill!.id, 1, 1, 0);
		tmp_killpivot = CreatePivot();
		if (G.tmp_h !== null) {
			PositionEntity(tmp_killpivot, EntityX(G.tmp_h), EntityY(G.tmp_h), EntityZ(G.tmp_h));
			RotateEntity(tmp_killpivot, EntityPitch(G.tmp_h), EntityYaw(G.tmp_h), EntityRoll(G.tmp_h));
		}
		G.tmp_killmodel = tmp_killpivot;
		parse_kill_add(G.tmp_killclass, G.tmp_killid, G.tmp_killmodel, G.tmp_killspawntimer);
		//Death Animation "Particle"
		if (G.tmp_h !== null) {
			G.tmp_ph = G.tmp_h;
			p_add(0, 0, 0, Cp_fall);
			EntityType(G.tmp_h, 0);
			EntityPickMode(G.tmp_h, 0, 0);
		}
		G.tmp_kill = 1;
		item_phyreset();
		return 2;
	}
	return 1;
}

//### Grow Style
/** Function grow_object(o.Tobject) */
export function grow_object(o: Tobject | null): void {
	let perc = f32(1.0);
	let part = 0;
	let r = 0;

	if (o!.daytimer < 0) {
		if (Dobject_growtime(o!.typ) > 0) {
			//Determine Growth Percentage
			part = Dobject_growtime(o!.typ) + o!.daytimer;
			if (part < 1) part = 1;
			perc = f32(f32(part) / f32(Dobject_growtime(o!.typ)));
			if (perc > 1.0) perc = 1.0;
		}
	}

	//Setup Size
	ScaleEntity(o!.h, f32(Dobject_size(o!.typ, 0) * perc), f32(Dobject_size(o!.typ, 1) * perc), f32(Dobject_size(o!.typ, 2) * perc));
	if (o!.ch !== null) {
		ScaleEntity(o!.ch, f32(Dobject_size(o!.typ, 0) * perc), f32(Dobject_size(o!.typ, 1) * perc), f32(Dobject_size(o!.typ, 2) * perc));
	}

	//Setup Color
	r = Dobject_color(o!.typ, 1);
	r = Int(f32(r + f32(255.0 * f32(1.0 - perc))));
	EntityColor(o!.h, Dobject_color(o!.typ, 0), r, Dobject_color(o!.typ, 2));

	//Setup Health
	if (o!.health_max !== Ceil(f32(Dobject_health(o!.typ) * perc))) {
		o!.health_max = Ceil(f32(Dobject_health(o!.typ) * perc));
		o!.health = o!.health_max;
	}
}

//### Frap Routine
/** Function frap_object() */
export function frap_object(): void {
	let Tobject_: Tobject | null = null;
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

	Tobject_ = G.TCobject;

	//Setup
	h = Tobject_!.h;
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
	shift = KeyDown(42) + KeyDown(54);

	if (EntityInView(Tobject_!.h, G.cam)) {
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

						if (Dobject_swayspeed(Tobject_!.typ) === 0) {
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
					CameraProject(G.cam, EntityX(Tobject_!.h), EntityY(Tobject_!.h), EntityZ(Tobject_!.h));
					bmpf_txt_c(Int(ProjectedX()), Int(f32(ProjectedY() - 30)), '#' + Str(Tobject_!.id) + ' ' + Dobject_name(Tobject_!.typ), Cbmpf_tiny);
				}

				//Info
				G.in_edoverinfo = ss(se(197), Dobject_name(Tobject_!.typ));
			}
		}
	}

	//Update FRAP Data
	for (Tfrap_ = First(Tfrap); Tfrap_ !== null; Tfrap_ = After(Tfrap, Tfrap_)) {
		if (Tfrap_.parent_class === Cclass_object) {
			if (Tfrap_.parent_id === Tobject_!.id) {
				Tfrap_.y = f32(EntityY(Tobject_!.h));
				Tfrap_.pitch = f32(EntityPitch(Tobject_!.h));
				Tfrap_.roll = f32(EntityRoll(Tobject_!.h));
				break;
			}
		}
	}

	//Free
	if (KeyHit(211)) {
		free_object(Tobject_!.id);
		G.in_fraph = null;
	}

	//Leave FRAP Mode
	if (KeyHit(57)) G.in_fraph = null;
}

//Get Spawn Position of Object
/** Function object_spawnpos(id) */
export function object_spawnpos(id: number): number {
	let Tobject_: Tobject | null = null;
	let s_item = 0;
	let s_rate = 0;
	let s_xzr = 0;
	let s_yr = 0;
	let s_yo = 0;
	let s_limit = 0;
	let s_count = 0;
	let p: Handle = null;

	//Find
	for (Tobject_ = First(Tobject); Tobject_ !== null; Tobject_ = After(Tobject, Tobject_)) {
		if (Tobject_.id === id) {
			if (Dobject_spawn(Tobject_.typ) !== '') {
				//Split
				// quirk: splits the spawn definition of TCobject's typ, not of the object found
				split(Dobject_spawn(G.TCobject!.typ));
				s_item = Int(G.splits[0]);
				s_rate = Int(G.splits[1]);
				s_xzr = Float(G.splits[2]);
				s_yr = Float(G.splits[3]);
				s_yo = Float(G.splits[4]);
				s_limit = Int(G.splits[5]);
				s_count = Int(G.splits[6]);
				void s_item;
				void s_rate;
				void s_limit;
				void s_count;
				//Position
				p = CreatePivot();
				PositionEntity(p, EntityX(Tobject_.h), f32(f32(EntityY(Tobject_.h) + Rnd(f32(-s_yr), s_yr)) + s_yo), EntityZ(Tobject_.h));
				RotateEntity(p, 0, Rand(360), 0);
				MoveEntity(p, 0, 0, Rnd(f32(s_xzr / 2.5), s_xzr));
				G.tmp_x = f32(EntityX(p));
				G.tmp_y = f32(EntityY(p));
				G.tmp_z = f32(EntityZ(p));
				FreeEntity(p);
				return 1;
			}
			return 0;
		}
	}
	return 0;
}
