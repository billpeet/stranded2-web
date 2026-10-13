/**
 * includes/handle_states.bb: states (fire, wet, bleeding, ...) of objects, units and items,
 * their lights, sprites and particle effects.
 * Line-by-line port (PORTING_GUIDE.md); original comments kept.
 */
//############################################ Handle states
import {
	CreateLight,
	CreatePivot,
	CreateSprite,
	EntityAlpha,
	EntityBlend,
	EntityColor,
	EntityDistance,
	EntityInView,
	EntityTexture,
	EntityType,
	EntityX,
	EntityY,
	EntityZ,
	FreeEntity,
	HideEntity,
	LightColor,
	LightRange,
	PositionEntity,
	ScaleSprite,
	ShowEntity,
	TranslateEntity,
	type Handle
} from '../bb3d';
import { Float, Int, MilliSecs, Rand, Rnd, Str, f32, fabs } from '../blitz';
import {
	Cclass_item,
	Cclass_object,
	Cclass_unit,
	Cp_fade,
	Cp_firespark,
	Cp_flames,
	Cp_smoke,
	Cp_spark,
	Cp_splatter,
	Cp_starflare,
	Csection_editor,
	Cstate_bleeding,
	Cstate_bloodrush,
	Cstate_dizzy,
	Cstate_electroshock,
	Cstate_eternalfire,
	Cstate_fire,
	Cstate_flare,
	Cstate_fracture,
	Cstate_frostbite,
	Cstate_fuddle,
	Cstate_ghost,
	Cstate_healing,
	Cstate_intoxication,
	Cstate_invulnerability,
	Cstate_light,
	Cstate_link,
	Cstate_particles,
	Cstate_phy,
	Cstate_pus,
	Cstate_smoke,
	Cstate_tame,
	Cstate_wet,
	Cworld_col,
	Cworld_userange
} from './consts';
import { Dmat_nofire, Dobject_col, Dstate_a } from './defs_arrays';
import { dist, incam, split } from './functions';
import { ha_damage, ha_getclass, ha_heal } from './handle_all';
import { con_item } from './handle_items';
import { free_object } from './handle_objects';
import { con_unit } from './handle_units';
import { mb_override } from './motionblur';
import { parent_h, parent_material, parent_pos, parent_statepos, parent_stateposstatic, parent_stateposvertex } from './parentchild';
import { parse_emuevent } from './parser_functions';
import { p_add, p_lightning } from './particles';
import { RT } from './rt';
import { sfx_3d, sfx_emit } from './sfx';
import { G } from './state';
import { After, Delete, Each, First, New, Tobject, Tstate, Tunit, isNull } from './types';

//### Set State
/** Function set_state(typ,parent_class,parent_id) */
export function set_state(typ: number, parent_class: number, parent_id: number): number {
	let value = 0;
	let Tstate_: Tstate | null = null;
	let h: Handle = null;
	let wet = 0;
	let ia = 0;
	let c: Tstate | null = null;
	let fire = 0;
	let i = 0;
	let Tunit_: Tunit | null = null;
	let argx = 0;
	let argy = 0;
	let argz = 0;
	let argsize = 0;
	let arga = 0;

	//Free same States
	value = 0;
	// Each form: the current object may be deleted and others created in the body; the loop goes on from its place
	for (const each_Tstate_ of Each(Tstate)) {
		Tstate_ = each_Tstate_;
		if (Tstate_.parent_class === parent_class) {
			if (Tstate_.parent_id === parent_id) {
				if (Tstate_.typ === typ) {
					value = f32(value + Tstate_.value_f);
					free_state(Tstate_.typ, Tstate_.parent_class, Tstate_.parent_id);
				}
			}
		}
	}

	//Create
	Tstate_ = New(Tstate);
	Tstate_.typ = typ;
	Tstate_.parent_class = parent_class;
	Tstate_.parent_id = parent_id;
	Tstate_.light = null;
	G.TCstate = Tstate_;

	//Power/Damage
	Tstate_.value_f = f32(3 + value);

	//Stuff
	switch (typ) {
		//Fire
		case Cstate_fire:
			//Do not allow Fire during Rain/Snow
			if (G.env_cweather === 1 || G.env_cweather === 2) {
				// quirk: TCstate keeps pointing at the deleted state
				Delete(Tstate, Tstate_);
				return 0;
			}
			//Do not allow Fire on Fire Resistant Material
			if (Dmat_nofire(parent_material(parent_class, parent_id)) === 1) {
				Delete(Tstate, Tstate_);
				return 0;
				//Do not allow Fire under Water
			} else {
				if (G.tmp_loading === 0) {
					h = parent_h(parent_class, parent_id);
					if (h !== null) {
						if (EntityY(h) < 0) {
							Delete(Tstate, Tstate_);
							return 0;
						}
					}
				}
			}
			//Wet State
			wet = 0;
			ia = 0;
			for (c = First(Tstate); c !== null; c = After(Tstate, c)) {
				if (c.parent_class === parent_class) {
					if (c.parent_id === parent_id) {
						if (c.typ === Cstate_wet) {
							ia = 1;
							wet = c.value_f;
							c.value_f = f32(c.value_f - Tstate_.value_f);
							if (c.value_f <= 0) {
								free_state(Cstate_wet, parent_class, parent_id);
							}
							break;
						}
					}
				}
			}
			if (ia === 1) {
				Tstate_.value_f = f32(Tstate_.value_f - wet);
				h = parent_h(parent_class, parent_id);
				if (h !== null) {
					sfx_emit(G.sfx_fizzle, h);
					p_add(EntityX(h), EntityY(h), EntityZ(h), Cp_smoke, Rnd(3, 5), Rnd(0.6, 0.9));
					EntityColor(G.TCp!.h, 240, 240, 240);
					EntityBlend(G.TCp!.h, 3);
				}
				if (Tstate_.value_f <= 0) {
					Delete(Tstate, Tstate_);
					return 0;
				}
			}
			//Light
			if (parent_stateposstatic(parent_class, parent_id) === 1) {
				Tstate_.light = CreateLight(2);
				LightColor(Tstate_.light, 255, 255, 0);
				LightRange(Tstate_.light, 50);
				parent_statepos(parent_class, parent_id);
				PositionEntity(Tstate_.light, G.tmp_x, G.tmp_y, G.tmp_z);
			}
			break;

		//Wet
		case Cstate_wet:
			//Fire State
			ia = 0;
			fire = 0;
			for (c = First(Tstate); c !== null; c = After(Tstate, c)) {
				if (c.parent_class === parent_class) {
					if (c.parent_id === parent_id) {
						if (c.typ === Cstate_fire) {
							ia = 1;
							fire = c.value_f;
							c.value_f = f32(c.value_f - Tstate_.value_f);
							if (c.value_f <= 0) {
								free_state(Cstate_fire, parent_class, parent_id);
							}
							break;
						}
					}
				}
			}
			if (ia === 1) {
				Tstate_.value_f = f32(Tstate_.value_f - fire);
				h = parent_h(parent_class, parent_id);
				if (h !== null) {
					sfx_emit(G.sfx_fizzle, h);
					p_add(EntityX(h), EntityY(h), EntityZ(h), Cp_smoke, Rnd(3, 5), Rnd(0.6, 0.9));
					EntityColor(G.TCp!.h, 240, 240, 240);
					EntityBlend(G.TCp!.h, 3);
				}
				if (Tstate_.value_f <= 0) {
					Delete(Tstate, Tstate_);
					return 0;
				}
			}
			//Eternal Fire
			for (c = First(Tstate); c !== null; c = After(Tstate, c)) {
				if (c.parent_class === parent_class) {
					if (c.parent_id === parent_id) {
						if (c.typ === Cstate_eternalfire) {
							h = parent_h(parent_class, parent_id);
							if (h !== null) {
								sfx_emit(G.sfx_fizzle, h);
								for (i = 1; i <= 3; i++) {
									// exe: arguments evaluated z, size, alpha, y, x
									argz = f32(EntityZ(h) + Rnd(-5, 5));
									argsize = Rnd(3, 5);
									arga = Rnd(0.6, 0.9);
									argy = f32(EntityY(h) + Rnd(-5, 5));
									argx = f32(EntityX(h) + Rnd(-5, 5));
									p_add(argx, argy, argz, Cp_smoke, argsize, arga);
									EntityColor(G.TCp!.h, 240, 240, 240);
									EntityBlend(G.TCp!.h, 3);
								}
							}
							break;
							// quirk: the two statements after the Exit never run: wet is added on top of eternal fire
							//Delete Tstate
							//Return 0
						}
					}
				}
			}
			break;

		//Eternal Fire
		case Cstate_eternalfire:
			Tstate_.value_f = f32(Tstate_.value_f - 3);
			//Light
			if (parent_stateposstatic(parent_class, parent_id) === 1) {
				Tstate_.light = CreateLight(2);
				LightColor(Tstate_.light, 255, 255, 0);
				LightRange(Tstate_.light, 50);
				parent_statepos(parent_class, parent_id);
				PositionEntity(Tstate_.light, G.tmp_x, G.tmp_y, G.tmp_z);
			}
			//Wet State
			for (c = First(Tstate); c !== null; c = After(Tstate, c)) {
				if (c.parent_class === parent_class) {
					if (c.parent_id === parent_id) {
						if (c.typ === Cstate_wet) {
							free_state(Cstate_wet, parent_class, parent_id);
							h = parent_h(parent_class, parent_id);
							if (h !== null) {
								sfx_emit(G.sfx_fizzle, h);
								for (i = 1; i <= 3; i++) {
									// exe: arguments evaluated z, size, alpha, y, x
									argz = f32(EntityZ(h) + Rnd(-5, 5));
									argsize = Rnd(3, 5);
									arga = Rnd(0.6, 0.9);
									argy = f32(EntityY(h) + Rnd(-5, 5));
									argx = f32(EntityX(h) + Rnd(-5, 5));
									p_add(argx, argy, argz, Cp_smoke, argsize, arga);
									EntityColor(G.TCp!.h, 240, 240, 240);
									EntityBlend(G.TCp!.h, 3);
								}
							}
							break;
						}
					}
				}
			}
			break;

		//Electro Shock
		case Cstate_electroshock:
			//Light
			Tstate_.light = CreateLight(2);
			LightColor(Tstate_.light, 0, 0, 255);
			LightRange(Tstate_.light, 75);
			parent_stateposvertex(parent_class, parent_id);
			PositionEntity(Tstate_.light, G.tmp_x, G.tmp_y, G.tmp_z);
			break;

		//Bloodrush
		case Cstate_bloodrush:
			Tstate_.value_f = 2;
			break;

		//Flare
		case Cstate_flare:
			Tstate_.h = CreateSprite();
			Tstate_.value = 50;
			ScaleSprite(Tstate_.h, Tstate_.value, Tstate_.value);
			EntityTexture(Tstate_.h, G.gfx_p_flare[0]);
			EntityBlend(Tstate_.h, 3);
			parent_statepos(parent_class, parent_id);
			PositionEntity(Tstate_.h, G.tmp_x, G.tmp_y, G.tmp_z);
			//EntityParent Tstate\h,parent_h(parent_class,parent_id)
			EntityAlpha(Tstate_.h, 0.25);
			Tstate_.value_s = '255,255,255';
			break;

		//Light
		case Cstate_light:
			Tstate_.h = CreateLight(2);
			parent_statepos(parent_class, parent_id);
			PositionEntity(Tstate_.h, G.tmp_x, G.tmp_y, G.tmp_z);
			Tstate_.value_s = '255,255,255';
			Tstate_.value = 10;
			LightRange(Tstate_.h, Tstate_.value);
			break;

		//Particles
		case Cstate_particles:
			Tstate_.value_s = '-1,-1,-1';
			Tstate_.r = -1;
			break;
	}

	//Unit States Stuff
	if (parent_class === Cclass_unit) {
		if (Dstate_a(typ) === 1) {
			for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
				if (Tunit_.id === parent_id) {
					Tunit_.states = 1;
					break;
				}
			}
		}
	}

	//Event
	G.pv_state = typ;
	parse_emuevent(parent_class, parent_id, 'addstate');
	//parse_sel(parent_class,parent_id,"addstate")

	//Okay
	return 1;
}

//## Alter State Look by its values
/** Function look_state() */
export function look_state(): void {
	switch (G.TCstate!.typ) {
		//Flare
		case Cstate_flare:
			split(G.TCstate!.value_s, ',');
			if (G.TCstate!.h !== null) {
				EntityColor(G.TCstate!.h, Float(G.splits[0]), Float(G.splits[1]), Float(G.splits[2]));
				ScaleSprite(G.TCstate!.h, G.TCstate!.value, G.TCstate!.value);
			}
			break;

		//Light
		case Cstate_light:
			split(G.TCstate!.value_s, ',');
			if (G.TCstate!.h !== null) {
				LightColor(G.TCstate!.h, Float(G.splits[0]), Float(G.splits[1]), Float(G.splits[2]));
				if (G.TCstate!.value > 0) {
					LightRange(G.TCstate!.h, G.TCstate!.value);
				}
			}
			break;

		//Particles
		case Cstate_particles:
			split(G.TCstate!.value_s, ',');
			G.TCstate!.r = Int(G.splits[0]);
			G.TCstate!.g = Int(G.splits[1]);
			G.TCstate!.b = Int(G.splits[2]);
			break;
	}
}

//### Attach State to Handle
/** Function attach_state(h,typ,onlyonclass=-1,bycollisionpivot=1) */
export function attach_state(h: Handle, typ: number, onlyonclass: number = -1, bycollisionpivot: number = 1): number {
	if (ha_getclass(h, bycollisionpivot)) {
		if (onlyonclass === -1 || onlyonclass === G.tmp_class) {
			if (set_state(typ, G.tmp_class, G.tmp_id)) {
				return 1;
			}
		}
	}
	return 0;
}

//### Free State
/** Function free_state(typ,parent_class,parent_id) */
export function free_state(typ: number, parent_class: number, parent_id: number): number {
	let Tstate_: Tstate | null = null;
	let set = 0;
	let t2: Tstate | null = null;
	let Tunit_: Tunit | null = null;

	for (Tstate_ = First(Tstate); Tstate_ !== null; Tstate_ = After(Tstate, Tstate_)) {
		if (Tstate_.parent_class === parent_class) {
			if (Tstate_.parent_id === parent_id) {
				if (Tstate_.typ === typ) {
					//State Stuff
					switch (Tstate_.typ) {
						case Cstate_link:
							free_object(Tstate_.value);
							break;
					}

					//if_msg("FREE STATE "+Dstate_name$(typ))

					//Model
					if (Tstate_.h !== null) {
						FreeEntity(Tstate_.h);
					}
					//Light
					if (Tstate_.light !== null) {
						FreeEntity(Tstate_.light);
						//if_msg("FREE LIGHT")
					}

					//Delete
					Delete(Tstate, Tstate_);

					//Unit States Stuff
					if (parent_class === Cclass_unit) {
						set = 0;
						for (t2 = First(Tstate); t2 !== null; t2 = After(Tstate, t2)) {
							if (t2.parent_class === Cclass_unit) {
								if (t2.parent_id === parent_id) {
									if (Dstate_a(t2.typ) === 1) {
										set = 1;
										break;
									}
								}
							}
						}
						for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
							if (Tunit_.id === parent_id) {
								Tunit_.states = set;
								break;
							}
						}
					}

					//Event
					G.pv_state = typ;
					parse_emuevent(parent_class, parent_id, 'freestate');
					//parse_sel(parent_class,parent_id,"freestate")

					//Ok
					return 1;
				}
			}
		}
	}
	return 0;
}

//### Get State
/** Function get_state(typ,parent_class,parent_id) */
export function get_state(typ: number, parent_class: number, parent_id: number): number {
	let Tstate_: Tstate | null = null;

	for (Tstate_ = First(Tstate); Tstate_ !== null; Tstate_ = After(Tstate, Tstate_)) {
		if (Tstate_.parent_class === parent_class) {
			if (Tstate_.parent_id === parent_id) {
				if (Tstate_.typ === typ) {
					G.TCstate = Tstate_;
					return 1;
				}
			}
		}
	}
	return 0;
}

//### Get Process State (typ > 99)
/** Function get_state_process(parent_class,parent_id) */
export function get_state_process(parent_class: number, parent_id: number): number {
	let Tstate_: Tstate | null = null;

	for (Tstate_ = First(Tstate); Tstate_ !== null; Tstate_ = After(Tstate, Tstate_)) {
		if (Tstate_.parent_class === parent_class) {
			if (Tstate_.parent_id === parent_id) {
				if (Tstate_.typ > 99) {
					G.TCstate = Tstate_;
					return 1;
				}
			}
		}
	}
	return 0;
}

//### Get State Position
/** Function state_inrange(rooth,typ,range=Cworld_userange) */
export function state_inrange(rooth: Handle, typ: number, range: number = Cworld_userange): number {
	let p1: Handle = null;
	let p2: Handle = null;
	let Tstate_: Tstate | null = null;

	p1 = CreatePivot();
	p2 = CreatePivot();
	PositionEntity(p1, EntityX(rooth), EntityY(rooth), EntityZ(rooth));
	for (Tstate_ = First(Tstate); Tstate_ !== null; Tstate_ = After(Tstate, Tstate_)) {
		if (Tstate_.typ === typ) {
			if (parent_statepos(Tstate_.parent_class, Tstate_.parent_id)) {
				PositionEntity(p2, G.tmp_x, G.tmp_y, G.tmp_z);
				if (EntityDistance(p1, p2) <= range) {
					FreeEntity(p1);
					FreeEntity(p2);
					return 1;
				}
			}
		}
	}
	FreeEntity(p1);
	FreeEntity(p2);
	return 0;
}

//### State Impact FX
/** Function state_impactfx(state,h) */
export function state_impactfx(state: number, h: Handle): void {
	let x = 0;
	let y = 0;
	let z = 0;
	let i = 0;

	x = EntityX(h);
	y = EntityY(h);
	z = EntityZ(h);
	switch (state) {
		case Cstate_bleeding:
			break;
		case Cstate_intoxication:
			// the To expression is evaluated on every pass: a new Rand(3,5) per test
			for (i = 0; i <= Rand(3, 5); i++) {
				p_add(x, y, z, Cp_spark, Rand(1, 2), 3);
				EntityColor(G.TCp!.h, 0, 255, 0);
			}
			p_add(x, y, z, Cp_smoke, Rnd(8, 14), Rnd(1, 1.5));
			EntityColor(G.TCp!.h, 0, Rand(150, 255), 0);
			EntityBlend(G.TCp!.h, 3);
			break;
		case Cstate_pus:
			break;
		case Cstate_fire:
		case Cstate_eternalfire:
			p_add(x, y, z, Cp_flames, 5, 1);
			for (i = 0; i <= Rand(3, 5); i++) {
				p_add(x, y, z, Cp_firespark, Rand(2, 6), 1);
			}
			for (i = 0; i <= Rand(3, 5); i++) {
				p_add(x, y, z, Cp_spark, Rand(1, 2), 3);
			}
			break;
		case Cstate_frostbite:
			break;
		case Cstate_fracture:
			break;
		case Cstate_electroshock:
			break;
		case Cstate_bloodrush:
			break;
		case Cstate_dizzy:
			break;
		case Cstate_wet:
			break;
		case Cstate_fuddle:
			break;
		case Cstate_healing:
			break;
		case Cstate_invulnerability:
			break;
	}
}

//### Update States
/** Function update_state() */
export function update_state(): void {
	let c = 0;
	let ct = 0;
	let Tstate_: Tstate | null = null;
	let i = 0;
	let h: Handle = null;
	let range = 0;
	let Tobject_: Tobject | null = null;
	let argx = 0;
	let argy = 0;
	let argz = 0;
	let argsize = 0;
	let arga = 0;
	let argr = 0;
	let argg = 0;
	let argb = 0;

	c = 0;
	ct = MilliSecs();
	G.set_mb_alpha_override = 0;
	G.set_xinvert = 0;
	// Each form: the current object may be deleted and others created in the body; the loop goes on from its place
	for (const each_Tstate_ of Each(Tstate)) {
		Tstate_ = each_Tstate_;
		c = c + 1;
		switch (Tstate_.typ) {
			//Physiks
			case Cstate_phy:
				//Move
				switch (Tstate_.parent_class) {
					//Unit Physiks
					case Cclass_unit:
						con_unit(Tstate_.parent_id);
						// quirk: TCunit/TCitem is whatever it was when the parent does not exist any more
						TranslateEntity(G.TCunit!.h, Tstate_.fx, Tstate_.fy, Tstate_.fz);
						break;

					//Items Physiks
					case Cclass_item:
						con_item(Tstate_.parent_id);
						TranslateEntity(G.TCitem!.h, Tstate_.fx, Tstate_.fy, Tstate_.fz);
						break;
				}
				//Modify
				if (G.in_gt100go) {
					Tstate_.fx = f32(Tstate_.fx * Tstate_.x);
					Tstate_.fy = f32(Tstate_.fy * Tstate_.y);
					Tstate_.fz = f32(Tstate_.fz * Tstate_.z);
					//Delete
					if (fabs(Tstate_.fy) < f32(0.001)) {
						if (fabs(Tstate_.fx) < f32(0.001)) {
							if (fabs(Tstate_.fz) < f32(0.001)) {
								// quirk: deleted without free_state (no freestate event, Tunit\states untouched)
								Delete(Tstate, Tstate_);
							}
						}
					}
				}
				break;

			//Bleeding
			case Cstate_bleeding:
				//Blood
				if (G.in_gt500go) {
					parent_statepos(Tstate_.parent_class, Tstate_.parent_id);
					if (incam(G.tmp_x, G.tmp_z)) {
						for (i = 1; i <= 3; i++) {
							p_add(G.tmp_x, G.tmp_y, G.tmp_z, Cp_splatter, Rnd(1, 5), Rnd(0.9, 1.5));
						}
					}
				}
				//Damage
				if (G.in_gt5000go) {
					if (G.m_section !== Csection_editor) {
						if (Tstate_.value_f !== 0) {
							ha_damage(Tstate_.parent_class, Tstate_.parent_id, Tstate_.value_f);
						}
					}
				}
				break;

			//Intoxication
			case Cstate_intoxication:
				//Poison Clouds
				if (G.in_gt500go) {
					parent_statepos(Tstate_.parent_class, Tstate_.parent_id);
					if (incam(G.tmp_x, G.tmp_z)) {
						p_add(G.tmp_x, G.tmp_y, G.tmp_z, Cp_smoke, Rnd(1, 5), Rnd(0.9, 1.5));
						EntityColor(G.TCp!.h, Rand(0, 255), Rand(150, 255), 0);
						EntityBlend(G.TCp!.h, 3);
					}
				}
				//Damage
				if (G.in_gt5000go) {
					if (G.m_section !== Csection_editor) {
						if (Tstate_.value_f !== 0) {
							ha_damage(Tstate_.parent_class, Tstate_.parent_id, Tstate_.value_f);
						}
					}
				}
				break;

			//Pus
			case Cstate_pus:
				break;

			//Fire
			case Cstate_fire:
				//Flames
				if (G.in_gt100go) {
					parent_statepos(Tstate_.parent_class, Tstate_.parent_id);
					if (incam(G.tmp_x, G.tmp_z)) {
						p_add(G.tmp_x, G.tmp_y, G.tmp_z, Cp_flames, 5, 1);
						if (Rand(5) === 1) {
							p_add(G.tmp_x, G.tmp_y, G.tmp_z, Cp_firespark, Rand(2, 6), 1);
						}
						if (G.in_gt5000go) {
							// quirk: Rand(1) is always 1
							if (Rand(1) === 1) {
								p_add(G.tmp_x, G.tmp_y, G.tmp_z, Cp_spark, Rand(1, 2), 3);
							}
						}
					}
				}
				//SFX
				if (!RT.audio.bb.ChannelPlaying(Tstate_.chan)) {
					h = parent_h(Tstate_.parent_class, Tstate_.parent_id);
					if (EntityDistance(G.cam, h) < 100) {
						Tstate_.chan = sfx_emit(G.sfx_fire, h);
					}
				}
				//Light
				if (G.in_gt50go) {
					if (Tstate_.light !== null) {
						LightColor(Tstate_.light, G.game_firelightbrightness, Rnd(G.game_firelightbrightness - 50, G.game_firelightbrightness), 0);
						range = Int(f32(G.game_firelightsize + Rnd(-5, 5)));
						if (range < 0) range = 0;
						LightRange(Tstate_.light, range);
						parent_statepos(Tstate_.parent_class, Tstate_.parent_id);
						PositionEntity(Tstate_.light, G.tmp_x, G.tmp_y, G.tmp_z);
						if (EntityDistance(G.cam, Tstate_.light) < f32(f32(300 * G.set_viewfac) + 300)) {
							if (EntityInView(Tstate_.light, G.cam)) {
								ShowEntity(Tstate_.light);
							} else if (EntityDistance(G.cam, Tstate_.light) < 500) {
								ShowEntity(Tstate_.light);
							} else {
								HideEntity(Tstate_.light);
							}
						} else {
							HideEntity(Tstate_.light);
						}
					}
				}
				//Damage
				if (G.in_gt5000go) {
					if (G.m_section !== Csection_editor) {
						parent_pos(Tstate_.parent_class, Tstate_.parent_id);
						if (Tstate_.value_f !== 0) {
							if (ha_damage(Tstate_.parent_class, Tstate_.parent_id, Tstate_.value_f) === 2) {
								//End of Fire - Expand?!
								for (Tobject_ = First(Tobject); Tobject_ !== null; Tobject_ = After(Tobject, Tobject_)) {
									if (dist(G.tmp_x, G.tmp_z, EntityX(Tobject_.h), EntityZ(Tobject_.h)) <= G.game_firerange) {
										set_state(Cstate_fire, Cclass_object, Tobject_.id);
									}
								}
								//Prevent Double Deletion!
								G.tmp_ry = 1;
							}
						}
					}
				}
				//Kill Under Water
				if (G.in_gt50go) {
					// quirk: tmp_ry# is whatever the last parent_pos()/other code left in it (only set here every 5 s)
					if (G.tmp_ry < 0) {
						h = parent_h(Tstate_.parent_class, Tstate_.parent_id);
						if (h !== null) {
							sfx_emit(G.sfx_fizzle, h);
							p_add(EntityX(h), EntityY(h), EntityZ(h), Cp_smoke, Rnd(3, 5), Rnd(0.6, 0.9));
							EntityColor(G.TCp!.h, 240, 240, 240);
							EntityBlend(G.TCp!.h, 3);
						}
						free_state(Tstate_.typ, Tstate_.parent_class, Tstate_.parent_id);
					}
				}
				break;

			//Eternal Fire
			case Cstate_eternalfire:
				//Flames
				if (G.in_gt100go) {
					parent_statepos(Tstate_.parent_class, Tstate_.parent_id);
					if (incam(G.tmp_x, G.tmp_z)) {
						p_add(G.tmp_x, G.tmp_y, G.tmp_z, Cp_flames, 5, 1);
						if (Rand(5) === 1) {
							p_add(G.tmp_x, G.tmp_y, G.tmp_z, Cp_firespark, Rand(2, 6), 1);
						}
						if (G.in_gt5000go) {
							// quirk: Rand(1) is always 1
							if (Rand(1) === 1) {
								p_add(G.tmp_x, G.tmp_y, G.tmp_z, Cp_spark, Rand(1, 2), 3);
							}
						}
					}
				}
				//SFX
				if (!RT.audio.bb.ChannelPlaying(Tstate_.chan)) {
					h = parent_h(Tstate_.parent_class, Tstate_.parent_id);
					if (EntityDistance(G.cam, h) < 100) {
						Tstate_.chan = sfx_emit(G.sfx_fire, h);
					}
				}
				//Light
				if (G.in_gt50go) {
					if (Tstate_.light !== null) {
						LightColor(Tstate_.light, G.game_firelightbrightness, Rnd(G.game_firelightbrightness - 50, G.game_firelightbrightness), 0);
						range = Int(f32(G.game_firelightsize + Rnd(-5, 5)));
						if (range < 0) range = 0;
						LightRange(Tstate_.light, range);
						parent_statepos(Tstate_.parent_class, Tstate_.parent_id);
						PositionEntity(Tstate_.light, G.tmp_x, G.tmp_y, G.tmp_z);
						if (EntityDistance(G.cam, Tstate_.light) < f32(f32(300 * G.set_viewfac) + 300)) {
							if (EntityInView(Tstate_.light, G.cam)) {
								ShowEntity(Tstate_.light);
							} else if (EntityDistance(G.cam, Tstate_.light) < 500) {
								ShowEntity(Tstate_.light);
							} else {
								HideEntity(Tstate_.light);
							}
						} else {
							HideEntity(Tstate_.light);
						}
					}
				}
				//Damage
				if (G.in_gt5000go) {
					if (Tstate_.value_f !== 0) {
						if (G.m_section !== Csection_editor) {
							ha_damage(Tstate_.parent_class, Tstate_.parent_id, Tstate_.value_f);
						}
					}
				}
				break;

			//Frostbite
			case Cstate_frostbite:
				//Damage
				if (G.in_gt5000go) {
					if (G.m_section !== Csection_editor) {
						if (Tstate_.value_f !== 0) {
							ha_damage(Tstate_.parent_class, Tstate_.parent_id, Tstate_.value_f);
						}
					}
				}
				break;

			//Fracture
			case Cstate_fracture:
				//Damage
				if (G.in_gt5000go) {
					if (G.m_section !== Csection_editor) {
						if (Tstate_.value_f !== 0) {
							ha_damage(Tstate_.parent_class, Tstate_.parent_id, Tstate_.value_f);
						}
					}
				}
				break;

			//Electroshock
			case Cstate_electroshock:
				//Light
				if (G.in_gt50go) {
					if (Tstate_.light !== null) {
						LightColor(Tstate_.light, 50, 50, Rand(150, 200));
						LightRange(Tstate_.light, Rnd(50, 100));
						parent_stateposvertex(Tstate_.parent_class, Tstate_.parent_id);
						PositionEntity(Tstate_.light, G.tmp_x, G.tmp_y, G.tmp_z);
						if (EntityDistance(G.cam, Tstate_.light) < f32(f32(100 * G.set_viewfac) + 300)) {
							ShowEntity(Tstate_.light);
						} else {
							HideEntity(Tstate_.light);
						}

						//Lightning / Sparks
						// quirk: "Rand(3=1)" is Rand(0), i.e. Rand(0,1): true half of the time (Rand(3)=1 was meant)
						if (Rand(0)) {
							if (EntityDistance(G.cam, Tstate_.light) < 500) {
								if (incam(G.tmp_x, G.tmp_z)) {
									p_lightning(G.tmp_x, G.tmp_y, G.tmp_z, Rand(3, 6), Rnd(4, 8));
									if (Rand(2) === 1) {
										p_add(G.tmp_x, G.tmp_y, G.tmp_z, Cp_spark, Rand(1, 2), 1);
										EntityColor(G.TCp!.h, 255, 255, 150);
									}
									if (Rand(4) === 1) {
										// sfx_3d(x,y,z,sound) has Int parameters: the position is rounded
										sfx_3d(Int(G.tmp_x), Int(G.tmp_y), Int(G.tmp_z), G.sfx_spark[Rand(0, 3)]);
									}
								}
							}
						}
					}
				}
				//Damage
				if (G.in_gt5000go) {
					if (G.m_section !== Csection_editor) {
						if (Tstate_.value_f !== 0) {
							ha_damage(Tstate_.parent_class, Tstate_.parent_id, Tstate_.value_f);
						}
					}
				}
				break;

			//Bloodrush
			case Cstate_bloodrush:
				//Particles
				if (G.in_gt50go) {
					parent_statepos(Tstate_.parent_class, Tstate_.parent_id);
					if (incam(G.tmp_x, G.tmp_z)) {
						// exe: arguments evaluated size, alpha, z, y, x
						argsize = Rnd(1, 5);
						arga = Rnd(0.4, 1);
						argz = f32(G.tmp_z + Rnd(-5, 5));
						argy = f32(G.tmp_y + Rnd(5));
						argx = f32(G.tmp_x + Rnd(-5, 5));
						p_add(argx, argy, argz, Cp_starflare, argsize, arga);
						EntityColor(G.TCp!.h, 255, Rand(0, 100), 0);
					}
				}
				//Motionblur
				if (Tstate_.parent_class === Cclass_unit) {
					if (Tstate_.parent_id === G.g_player) {
						mb_override(f32(0.4));
					}
				}
				break;

			//Dizzy
			case Cstate_dizzy:
				//Motionblur
				if (Tstate_.parent_class === Cclass_unit) {
					if (Tstate_.parent_id === G.g_player) {
						mb_override(0.75);
						G.set_xinvert = 1;
					}
				}
				break;

			//Wet
			case Cstate_wet:
				//Drips
				if (G.in_gt500go) {
					parent_statepos(Tstate_.parent_class, Tstate_.parent_id);
					if (incam(G.tmp_x, G.tmp_z)) {
						p_add(G.tmp_x, G.tmp_y, G.tmp_z, Cp_spark, Rand(1, 2), 3);
						EntityColor(G.TCp!.h, Rand(230, 240), Rand(230, 240), 255);
					}
				}
				break;

			//Fuddle
			case Cstate_fuddle:
				//Colorstuff
				if (G.in_gt500go) {
					if (Tstate_.value_f >= 10) {
						p_add(0, 0, 0, Cp_fade, Rnd(0.03, 0.05), Rnd(0.4, 0.6));
						// exe: arguments evaluated g, b, r
						argg = Rnd(255);
						argb = Rnd(255);
						argr = Rnd(255);
						EntityColor(G.TCp!.h, argr, argg, argb);
						EntityBlend(G.TCp!.h, 3);
					}
				}
				//Motionblur
				if (Tstate_.parent_class === Cclass_unit) {
					if (Tstate_.parent_id === G.g_player) {
						mb_override(f32(0.9));
					}
				}
				break;

			//Healing
			case Cstate_healing:
				//Particles
				if (G.in_gt50go) {
					parent_statepos(Tstate_.parent_class, Tstate_.parent_id);
					if (incam(G.tmp_x, G.tmp_z)) {
						// exe: arguments evaluated size, alpha, z, y, x
						argsize = Rnd(1, 5);
						arga = Rnd(0.4, 1);
						argz = f32(G.tmp_z + Rnd(-5, 5));
						argy = f32(G.tmp_y + Rnd(5));
						argx = f32(G.tmp_x + Rnd(-5, 5));
						p_add(argx, argy, argz, Cp_starflare, argsize, arga);
						EntityColor(G.TCp!.h, Rand(0, 100), 255, 0);
					}
				}
				//Heal
				if (G.in_gt1000go) {
					if (Tstate_.value_f !== 0) {
						if (G.m_section !== Csection_editor) {
							ha_heal(Tstate_.parent_class, Tstate_.parent_id, Tstate_.value_f);
						}
					}
				}
				break;

			//Invulnerability
			case Cstate_invulnerability:
				break;

			//Tame
			case Cstate_tame:
				//Particles
				if (G.in_gt100go) {
					parent_statepos(Tstate_.parent_class, Tstate_.parent_id);
					if (incam(G.tmp_x, G.tmp_z)) {
						// exe: arguments evaluated size, alpha, z, y, x
						argsize = Rnd(1, 5);
						arga = Rnd(0.4, 1);
						argz = f32(G.tmp_z + Rnd(-5, 5));
						argy = f32(G.tmp_y + Rnd(5));
						argx = f32(G.tmp_x + Rnd(-5, 5));
						p_add(argx, argy, argz, Cp_starflare, argsize, arga);
						EntityColor(G.TCp!.h, 255, 75, Rnd(100, 200));
					}
				}
				break;

			//Flare
			case Cstate_flare:
				if (Tstate_.parent_class === Cclass_unit) {
					if (Tstate_.h !== null) {
						parent_statepos(Tstate_.parent_class, Tstate_.parent_id);
						PositionEntity(Tstate_.h, G.tmp_x, G.tmp_y, G.tmp_z);
					}
				}
				break;

			//Smoke
			case Cstate_smoke:
				//Smoke Clouds
				if (G.in_gt500go) {
					parent_statepos(Tstate_.parent_class, Tstate_.parent_id);
					if (incam(G.tmp_x, G.tmp_z)) {
						p_add(G.tmp_x, G.tmp_y, G.tmp_z, Cp_smoke, Rnd(1, 5), Rnd(0.9, 2.4));
					}
				}
				break;

			//Light
			case Cstate_light:
				if (Tstate_.parent_class === Cclass_unit) {
					if (Tstate_.h !== null) {
						parent_statepos(Tstate_.parent_class, Tstate_.parent_id);
						PositionEntity(Tstate_.h, G.tmp_x, G.tmp_y, G.tmp_z);
						if (EntityDistance(G.cam, Tstate_.h) < f32(f32(300 * G.set_viewfac) + 300)) {
							if (EntityInView(Tstate_.h, G.cam)) {
								ShowEntity(Tstate_.h);
							} else if (EntityDistance(G.cam, Tstate_.h) < 500) {
								ShowEntity(Tstate_.h);
							} else {
								HideEntity(Tstate_.h);
							}
						} else {
							HideEntity(Tstate_.h);
						}
					}
				}
				break;

			//Particles
			case Cstate_particles:
				//Particles
				if (G.in_gt50go) {
					parent_statepos(Tstate_.parent_class, Tstate_.parent_id);
					if (incam(G.tmp_x, G.tmp_z)) {
						// exe: arguments evaluated size, alpha, z, y, x
						argsize = Rnd(1, 5);
						arga = Rnd(0.9, 2.4);
						argz = f32(G.tmp_z + Rnd(-3, 3));
						argy = f32(G.tmp_y + Rnd(-3, 3));
						argx = f32(G.tmp_x + Rnd(-3, 3));
						p_add(argx, argy, argz, Cp_starflare, argsize, arga);
						if (Tstate_.r > -1) {
							EntityColor(G.TCp!.h, Tstate_.r, Tstate_.g, Tstate_.b);
						}
					}
				}
				break;

			//Ghost
			case Cstate_ghost:
				if (G.in_gt50go) {
					//Check
					if (Tstate_.parent_class === Cclass_object) {
						for (Tobject_ = First(Tobject); Tobject_ !== null; Tobject_ = After(Tobject, Tobject_)) {
							if (!isNull(Tstate, Tstate_)) {
								if (Tobject_.id === Tstate_.parent_id) {
									if (Tobject_.h !== null) {
										if (EntityDistance(Tobject_.h, G.cam) > 75) {
											//Reset Collision
											if (Dobject_col(Tobject_.typ) > 0) {
												if (Tobject_.ch !== null) {
													EntityType(Tobject_.ch, Cworld_col);
												} else {
													EntityType(Tobject_.h, Cworld_col);
												}
											}
											//Delete State
											// quirk: deleted without free_state (no freestate event)
											Delete(Tstate, Tstate_);
										}
									}
								}
							}
						}
					}
				}
				break;
		}
	}
	//Debug Times
	if (G.set_debug_rt) {
		G.set_debug_rt_states = Str((MilliSecs() - ct) | 0) + ' ms States (' + Str(c) + ')';
	}
}

//Depleted?
/** Function state_depleted(state,water) */
export function state_depleted(state: number, water: number): number {
	if (water === 1) {
		switch (state) {
			case Cstate_fire:
				return 1;
			default:
				return 0;
		}
	} else {
		return 0;
	}
}
