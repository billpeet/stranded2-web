/**
 * includes/projectiles.bb, line-by-line port.
 */
import {
	CollisionEntity,
	CollisionX,
	CollisionY,
	CollisionZ,
	CopyEntity,
	CountCollisions,
	CreatePivot,
	EntityAlpha,
	EntityBlend,
	EntityColor,
	EntityDistance,
	EntityFX,
	EntityParent,
	EntityPitch,
	EntityRadius,
	EntityRoll,
	EntityShininess,
	EntityType,
	EntityX,
	EntityY,
	EntityYaw,
	EntityZ,
	FreeEntity,
	MoveEntity,
	PositionEntity,
	RotateEntity,
	ScaleEntity,
	TranslateEntity,
	TurnEntity,
	type Handle
} from '../bb3d';
import { Cos, Float, Instr, Int, Left, Mid, Rand, Rnd, SEP_LINE, Sin, f32 } from '../blitz';
import {
	Cclass_item,
	Cclass_unit,
	Cp_bubbles,
	Cp_explode,
	Cp_fadeout,
	Cp_firespark,
	Cp_resfade,
	Cp_rwave,
	Cp_smoke,
	Cp_spark,
	Cp_splash,
	Cp_starflare,
	Cp_subsplatter,
	Cpro_aresfade,
	Cpro_asmoke,
	Cpro_asparkle,
	Cpro_asupersparkle,
	Cpro_blood,
	Cpro_fire,
	Cpro_healing,
	Cpro_poison,
	Cpro_smoke,
	Cpro_tame,
	Cpro_wet,
	Cstate_bleeding,
	Cstate_eternalfire,
	Cstate_fire,
	Cstate_healing,
	Cstate_intoxication,
	Cstate_smoke,
	Cstate_tame,
	Cstate_wet,
	Cworld_procol
} from './consts';
import {
	Ditem_alpha,
	Ditem_behaviour,
	Ditem_blend,
	Ditem_color,
	Ditem_damage,
	Ditem_drag,
	Ditem_fx,
	Ditem_mat,
	Ditem_modelh,
	Ditem_script,
	Ditem_scriptk,
	Ditem_shininess,
	Ditem_size,
	Ditem_speed,
	Ditem_wstate,
	Dunit_colxr,
	Dunit_eyes
} from './defs_arrays';
import { e_tery } from './e_environment';
import { split } from './functions';
import { game_damage, game_explosion } from './game_functions';
import { get_stored_item, set_item } from './handle_items';
import { attach_state, set_state, state_depleted, state_impactfx } from './handle_states';
import { con_unit } from './handle_units';
import { load_item_model } from './load_items';
import { material_fx } from './load_materials';
import { parse } from './parser';
import { loadstring_parsecache, parse_env, parse_task, set_parsecache } from './parser_functions';
import { p_add, p_projectile } from './particles';
import { sfx_3d, sfx_emit } from './sfx';
import { G } from './state';
import { After, Delete, First, New, Titem, Tpro, Tunit, isNull } from './types';

//############################################ PROJECTILES
//Stuff that comes out of weapons/enemies ;)

//### Projectile add
/** Function pro_add(spawner,typ,pitch#,yaw#) */
export function pro_add(spawner: number, typ: number, pitch: number, yaw: number): number {
	let unitspawn = 0;
	let Tpro_: Tpro | null = null;
	let h: Handle = null;
	let b = '';

	unitspawn = 0;
	//Con Spawner
	if (con_unit(spawner)) {
		unitspawn = 1;
	} else {
		unitspawn = 0;
	}

	//Check Model
	if (Ditem_modelh(typ) === null) {
		load_item_model(typ);
	}

	//Create
	Tpro_ = New(Tpro);
	Tpro_.spawner = spawner;
	Tpro_.typ = typ;
	h = CopyEntity(Ditem_modelh(typ));
	Tpro_.mh = h;
	Tpro_.age = G.gt;
	Tpro_.wc = 0;
	if (unitspawn === 1) Tpro_.weapon = G.TCunit!.player_weapon;

	//Adjust
	ScaleEntity(h, Ditem_size(typ, 0), Ditem_size(typ, 1), Ditem_size(typ, 2));
	EntityColor(h, Ditem_color(typ, 0), Ditem_color(typ, 1), Ditem_color(typ, 2));
	if (Ditem_fx(typ) !== 0) EntityFX(h, Ditem_fx(typ));
	//If Ditem_autofade(typ)<>0 Then EntityAutoFade h,Float(Ditem_autofade(typ))*set_viewfac#,(Float(Ditem_autofade(typ))*set_viewfac#)+50
	EntityAlpha(h, Ditem_alpha(typ));
	if (Ditem_shininess(typ) > 0.0) EntityShininess(h, Ditem_shininess(typ));
	if (Ditem_blend(typ) !== 0) EntityBlend(h, Ditem_blend(typ));

	//Position & Rotation
	if (unitspawn === 1) {
		RotateEntity(h, pitch, yaw, Rnd(0, 360));
		if (G.TCunit!.id === G.g_player) {
			//Spawn Player Shots at cam (due to y pos bug while riding)
			PositionEntity(h, EntityX(G.cam), EntityY(G.cam), EntityZ(G.cam));
		} else {
			//Spawn Shots at Unit
			PositionEntity(h, EntityX(G.TCunit!.h), f32(EntityY(G.TCunit!.h) + Dunit_eyes(G.TCunit!.typ)), EntityZ(G.TCunit!.h));
		}
		MoveEntity(h, 0, 0, f32(Dunit_colxr(G.TCunit!.typ) + 5));
	}

	//Pivot for Movement
	Tpro_.h = CreatePivot();
	PositionEntity(Tpro_.h, EntityX(Tpro_.mh), EntityY(Tpro_.mh), EntityZ(Tpro_.mh));
	RotateEntity(Tpro_.h, pitch, yaw, 0);
	EntityParent(Tpro_.mh, Tpro_.h);

	//Collisions
	EntityRadius(Tpro_.h, 3);
	EntityType(Tpro_.h, Cworld_procol);

	//Water
	if (EntityY(Tpro_.h) < 0) {
		Tpro_.water = 1;
		Tpro_.wc = 1;
	}

	//Tail
	//by State Weapon
	switch (Ditem_wstate(Tpro_.weapon)) {
		case Cstate_bleeding:
			Tpro_.tail = Cpro_blood;
			break;
		case Cstate_intoxication:
			Tpro_.tail = Cpro_poison;
			break;
		case Cstate_fire:
		case Cstate_eternalfire:
			Tpro_.tail = Cpro_fire;
			break;
		case Cstate_wet:
			Tpro_.tail = Cpro_wet;
			break;
		case Cstate_healing:
			Tpro_.tail = Cpro_healing;
			break;
		case Cstate_tame:
			Tpro_.tail = Cpro_tame;
			break;
		case Cstate_smoke:
			Tpro_.tail = Cpro_smoke;
			break;
	}
	//by State Ammo
	if (Tpro_.typ !== Tpro_.weapon) {
		switch (Ditem_wstate(Tpro_.typ)) {
			case Cstate_bleeding:
				Tpro_.tail = Cpro_blood;
				break;
			case Cstate_intoxication:
				Tpro_.tail = Cpro_poison;
				break;
			case Cstate_fire:
			case Cstate_eternalfire:
				Tpro_.tail = Cpro_fire;
				break;
			case Cstate_wet:
				Tpro_.tail = Cpro_wet;
				break;
			case Cstate_healing:
				Tpro_.tail = Cpro_healing;
				break;
			case Cstate_tame:
				Tpro_.tail = Cpro_tame;
				break;
			case Cstate_smoke:
				Tpro_.tail = Cpro_smoke;
				break;
		}
	}
	//by Behaviour
	b = Ditem_behaviour(Tpro_.typ);
	if (Left(b, 6) === 'notail') {
		Tpro_.tail = 0;
	} else if (Left(b, 6) === 'rocket') {
		Tpro_.tail = Cpro_fire;
	} else if (Left(b, 11) === 'toxicrocket') {
		Tpro_.tail = Cpro_fire;
	} else if (Left(b, 6) === 'poison') {
		Tpro_.tail = Cpro_poison;
	} else if (Left(b, 5) === 'smoke') {
		Tpro_.tail = Cpro_smoke;
	} else if (Left(b, 6) === 'asmoke') {
		Tpro_.tail = Cpro_asmoke;
		pro_add_style(Tpro_, 6);
	} else if (Left(b, 8) === 'asparkle') {
		Tpro_.tail = Cpro_asparkle;
		pro_add_style(Tpro_, 8);
	} else if (Left(b, 13) === 'asupersparkle') {
		Tpro_.tail = Cpro_asupersparkle;
		pro_add_style(Tpro_, 13);
		if (Tpro_.tset[0] <= 0) Tpro_.tset[0] = 3;
	} else if (Left(b, 8) === 'aresfade') {
		Tpro_.tail = Cpro_aresfade;
		pro_add_style(Tpro_, 8);
		if (Tpro_.tset[0] <= 0) Tpro_.tset[0] = f32(0.15);
		if (Tpro_.tset[1] === 0) Tpro_.tset[1] = f32(0.2);
	}
	//Deplete Fire in Water
	if (Tpro_.tail === Cpro_fire) {
		if (Tpro_.water === 1) {
			Tpro_.tail = Cpro_smoke;
		}
	}

	//Okay
	G.TCpro = Tpro_;
	return 1;
}

/** Function pro_ini() */
export function pro_ini(): void {
	if (G.TCpro!.weapon > 0) G.TCpro!.speed = Ditem_speed(G.TCpro!.weapon);
	G.TCpro!.spitch = f32(EntityPitch(G.TCpro!.h));
	G.TCpro!.sx = f32(Sin(G.TCpro!.spitch) * G.TCpro!.speed);
	G.TCpro!.sy = f32(f32(-Cos(G.TCpro!.spitch)) * G.TCpro!.speed);
}

//### Projectile Style
/** Function pro_add_style(Tpro.Tpro,offset) */
export function pro_add_style(Tpro_: Tpro | null, offset: number): void {
	let txt = '';

	txt = Mid(Ditem_behaviour(Tpro_!.typ), offset + 1, -1);
	if (txt === '') return;
	if (Left(txt, 1) === ':') {
		txt = Mid(txt, 2, -1);
		//DebugLog "get colors out of "+txt$
		split(txt, ',', 5);
		//Red
		if (G.splits[0] !== '') {
			Tpro_!.tcol[0] = Int(G.splits[0]);
			//Green
			if (G.splits[1] !== '') {
				Tpro_!.tcol[1] = Int(G.splits[1]);
				//Blue
				if (G.splits[2] !== '') {
					Tpro_!.tcol[2] = Int(G.splits[2]);
					//Blend
					if (G.splits[3] !== '') {
						Tpro_!.tfx = Int(G.splits[3]);
						//Set 0
						if (G.splits[4] !== '') {
							Tpro_!.tset[0] = Float(G.splits[4]);
							//Set 1
							if (G.splits[5] !== '') {
								Tpro_!.tset[1] = Float(G.splits[5]);
							}
						}
					}
				}
			}
		}
	}
	//DebugLog Tpro\tcol[0]+","+Tpro\tcol[1]+","+Tpro\tcol[2]+" PAR COL!"
}

//### Projectile Update
/** Function pro_update() */
export function pro_update(): void {
	let Tpro_: Tpro | null = null;
	let cc = 0;
	let turn = 0;
	let argx = 0;
	let argy = 0;
	let argz = 0;
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	let opitch = 0;
	let i = 0;
	let ft: Handle = null;
	let b = '';
	let noimpactdamage = 0;
	let h: Handle = null;
	let tmpdmg = 0;
	let Tunit_: Tunit | null = null;

	for (Tpro_ = First(Tpro); Tpro_ !== null; Tpro_ = After(Tpro, Tpro_)) {
		//Count Collisions
		cc = CountCollisions(Tpro_.h);

		if (cc === 0) {
			//Move
			if (Tpro_.weapon > 0) {
				MoveEntity(Tpro_.h, 0, 0, f32(Ditem_speed(Tpro_.weapon) * G.f));
			} else {
				MoveEntity(Tpro_.h, 0, 0, f32(Tpro_.speed * G.f));
			}
			//TranslateEntity Tpro\h,Sin(Tpro\sx#*f#),Tpro\sy#*f#,Sin(Tpro\sx#*f#)

			//Drag (rotate downwards to simulate gravity)
			turn = 0;
			if (Tpro_.weapon === 0) {
				opitch = f32(EntityPitch(Tpro_.h));
				TurnEntity(Tpro_.h, f32(f32(Tpro_.drag + Ditem_drag(Tpro_.typ)) * G.f), 0, 0);
				turn = 1;
			} else {
				if (Tpro_.weapon !== Tpro_.typ) {
					opitch = f32(EntityPitch(Tpro_.h));
					TurnEntity(Tpro_.h, f32(f32(Ditem_drag(Tpro_.weapon) + Ditem_drag(Tpro_.typ)) * G.f), 0, 0);
					turn = 1;
				} else {
					opitch = f32(EntityPitch(Tpro_.h));
					TurnEntity(Tpro_.h, f32(Ditem_drag(Tpro_.typ) * G.f), 0, 0);
					turn = 1;
				}
			}
			if (turn === 1) {
				if (EntityPitch(Tpro_.h) > 88) RotateEntity(Tpro_.h, 88, EntityYaw(Tpro_.h), 0);
			}

			//Rotate (around own axis)
			TurnEntity(Tpro_.mh, 0, 0, f32(10 * G.f));

			//Water
			//Over Water
			if (Tpro_.water === 0) {
				if (EntityY(Tpro_.h) < 0) {
					Tpro_.water = 1;
					p_add(EntityX(Tpro_.h), 1, EntityZ(Tpro_.h), Cp_rwave, Rnd(5, 10), Rnd(f32(0.9), 1.5));
					p_add(EntityX(Tpro_.h), 1, EntityZ(Tpro_.h), Cp_splash, Rnd(15, 20), 1);
					sfx_emit(G.sfx_blubb, Tpro_.h);
					//Extinguish Fire Tail
					if (Tpro_.tail === Cpro_fire) {
						Tpro_.tail = Cpro_smoke;
						sfx_emit(G.sfx_fizzle, Tpro_.h);
						p_add(EntityX(Tpro_.h), EntityY(Tpro_.h), EntityZ(Tpro_.h), Cp_smoke, Rnd(3, 5), Rnd(f32(0.6), f32(0.9)));
						EntityColor(G.TCp!.h, 240, 240, 240);
						EntityBlend(G.TCp!.h, 3);
					}
				}
				//Under Water
			} else {
				Tpro_.wc = 1;
				if (G.set_effects > 0) {
					if (G.in_gt20go) {
						if (Rand(2) === 1) {
							p_add(EntityX(Tpro_.h), EntityY(Tpro_.h), EntityZ(Tpro_.h), Cp_bubbles, Rnd(1, 3), Rnd(f32(0.3), f32(0.5)));
						}
					}
				}
				if (EntityY(Tpro_.h) > 0) {
					Tpro_.water = 0;
					p_add(EntityX(Tpro_.h), 1, EntityZ(Tpro_.h), Cp_rwave, Rnd(5, 10), Rnd(f32(0.9), 1.5));
					// quirk: the sound is emitted from the new wave particle (TCp\h), not from the projectile
					sfx_emit(G.sfx_blubb, G.TCp!.h);
				}
			}

			//Tail
			if (G.set_effects > 0) {
				if (G.in_gt20go) {
					if (Tpro_.tail !== 0) {
						switch (Tpro_.tail) {
							//Smoke Tail
							case Cpro_smoke:
								p_add(EntityX(Tpro_.h), EntityY(Tpro_.h), EntityZ(Tpro_.h), Cp_smoke, Rnd(1, 5), Rnd(f32(0.6), f32(0.9)));
								G.TCp!.r = f32(0.025);
								break;
							//Fire Tail
							case Cpro_fire:
								if (G.set_effects === 2) {
									if (Rand(3) === 1) {
										p_add(EntityX(Tpro_.h), EntityY(Tpro_.h), EntityZ(Tpro_.h), Cp_firespark, Rand(2, 6), 1);
									}
								}
								p_add(EntityX(Tpro_.h), EntityY(Tpro_.h), EntityZ(Tpro_.h), Cp_smoke, Rnd(3, 5), Rnd(f32(0.9), 1.5));
								EntityColor(G.TCp!.h, 255, Rand(50, 255), 0);
								EntityBlend(G.TCp!.h, 3);
								G.TCp!.r = f32(0.04);
								break;
							//Poision Tail
							case Cpro_poison:
								p_add(EntityX(Tpro_.h), EntityY(Tpro_.h), EntityZ(Tpro_.h), Cp_smoke, Rnd(1, 5), Rnd(f32(0.9), 1.5));
								EntityColor(G.TCp!.h, 0, Rand(150, 255), 0);
								EntityBlend(G.TCp!.h, 3);
								G.TCp!.r = f32(0.02);
								break;
							//Blood Tail
							case Cpro_blood:
								p_add(EntityX(Tpro_.h), EntityY(Tpro_.h), EntityZ(Tpro_.h), Cp_subsplatter, Rnd(1, 5), Rnd(f32(0.9), 1.5));
								break;
							//Wet Tail
							case Cpro_wet:
								//p_add(EntityX(Tpro\h),EntityY(Tpro\h),EntityZ(Tpro\h),Cp_spark,Rand(1,2),3)
								//EntityColor TCp\h,Rand(230,240),Rand(230,240),255
								//
								//PROBLEMS -> PARTICLE COLLIDES WITH PROJECTILE!
								//
								break;
							//Healing
							case Cpro_healing:
								p_add(EntityX(Tpro_.h), EntityY(Tpro_.h), EntityZ(Tpro_.h), Cp_starflare, Rnd(1, 5), Rnd(f32(0.4), 1));
								// exe: arguments evaluated y, z, x
								argy = Rnd(-5, 5);
								argz = Rnd(-5, 5);
								argx = Rnd(-5, 5);
								TranslateEntity(G.TCp!.h, argx, argy, argz);
								EntityColor(G.TCp!.h, Rand(0, 100), 255, 0);
								break;
							//Tame
							case Cpro_tame:
								p_add(EntityX(Tpro_.h), EntityY(Tpro_.h), EntityZ(Tpro_.h), Cp_starflare, Rnd(1, 5), Rnd(f32(0.4), 1));
								// exe: arguments evaluated y, z, x
								argy = Rnd(-5, 5);
								argz = Rnd(-5, 5);
								argx = Rnd(-5, 5);
								TranslateEntity(G.TCp!.h, argx, argy, argz);
								EntityColor(G.TCp!.h, 255, 75, Rnd(100, 200));
								break;
							//Adjustable Smoke
							case Cpro_asmoke:
								p_add(EntityX(Tpro_.h), EntityY(Tpro_.h), EntityZ(Tpro_.h), Cp_smoke, Rnd(1, 5), Rnd(f32(0.6), f32(0.9)));
								EntityColor(G.TCp!.h, Tpro_.tcol[0], Tpro_.tcol[1], Tpro_.tcol[2]);
								switch (Tpro_.tfx !== 0 ? 1 : 0) {
									case 0:
										EntityBlend(G.TCp!.h, 1);
										break;
									case 1:
										EntityBlend(G.TCp!.h, 3);
										break;
								}
								break;
							//Adjustable Sparkle
							case Cpro_asparkle:
								p_add(EntityX(Tpro_.h), EntityY(Tpro_.h), EntityZ(Tpro_.h), Cp_starflare, Rnd(1, 5), Rnd(f32(0.9), f32(1.4)));
								G.TCp!.r = Rnd(f32(0.01), f32(0.02));
								EntityColor(G.TCp!.h, Tpro_.tcol[0], Tpro_.tcol[1], Tpro_.tcol[2]);
								switch (Tpro_.tfx !== 0 ? 1 : 0) {
									case 0:
										EntityBlend(G.TCp!.h, 1);
										break;
									case 1:
										EntityBlend(G.TCp!.h, 3);
										break;
								}
								break;
							//Adjustable SUPER Sparkle! YAY!
							case Cpro_asupersparkle:
								for (i = 1; i <= Int(Tpro_.tset[0]); i++) {
									p_add(EntityX(Tpro_.h), EntityY(Tpro_.h), EntityZ(Tpro_.h), Cp_starflare, Rnd(1, 5), Rnd(f32(0.9), f32(1.4)));
									G.TCp!.r = Rnd(f32(0.02), f32(0.04));
									// exe: arguments evaluated y, z, x
									argy = Rnd(-5, 5);
									argz = Rnd(-5, 5);
									argx = Rnd(-5, 5);
									TranslateEntity(G.TCp!.h, argx, argy, argz);
									EntityColor(G.TCp!.h, Tpro_.tcol[0], Tpro_.tcol[1], Tpro_.tcol[2]);
									switch (Tpro_.tfx !== 0 ? 1 : 0) {
										case 0:
											EntityBlend(G.TCp!.h, 1);
											break;
										case 1:
											EntityBlend(G.TCp!.h, 3);
											break;
									}
								}
								break;
							//Adjustable Resize Fade Tail
							case Cpro_aresfade:
								ft = null;
								ft = CopyEntity(Tpro_.mh);
								if (ft !== null) {
									PositionEntity(ft, EntityX(Tpro_.h), EntityY(Tpro_.h), EntityZ(Tpro_.h));
									TurnEntity(ft, EntityPitch(Tpro_.h), EntityYaw(Tpro_.h), EntityRoll(Tpro_.mh), 1);
									//Fadespeed based on Effect Settings
									G.tmp_ph = ft;
									p_add(0, Tpro_.tset[0], Tpro_.tset[1], Cp_resfade);
									EntityColor(G.TCp!.h, Tpro_.tcol[0], Tpro_.tcol[1], Tpro_.tcol[2]);
									EntityAlpha(G.TCp!.h, Ditem_alpha(Tpro_.typ));
									G.TCp!.a = Ditem_alpha(Tpro_.typ);
									G.TCp!.fx = Ditem_size(Tpro_.typ, 0);
									G.TCp!.fy = Ditem_size(Tpro_.typ, 1);
									G.TCp!.fz = Ditem_size(Tpro_.typ, 2);
									ScaleEntity(G.TCp!.h, G.TCp!.fx, G.TCp!.fy, G.TCp!.fz);
								}
								break;
						}
					} else {
						//Model Tail
						ft = null;
						ft = CopyEntity(Tpro_.mh);
						if (ft !== null) {
							PositionEntity(ft, EntityX(Tpro_.h), EntityY(Tpro_.h), EntityZ(Tpro_.h));
							TurnEntity(ft, EntityPitch(Tpro_.h), EntityYaw(Tpro_.h), EntityRoll(Tpro_.mh), 1);
							EntityBlend(ft, 3);
							EntityColor(ft, 255, 255, 255);
							EntityAlpha(ft, f32(0.3));
							//Fadespeed based on Effect Settings
							G.tmp_ph = ft;
							if (G.set_effects === 1) {
								p_add(0, f32(0.3), f32(0.025), Cp_fadeout);
							} else {
								p_add(0, f32(0.3), f32(0.018), Cp_fadeout);
							}
						}
					}
				}
			}
		}

		//Collision
		if (cc === 0) {
			if (e_tery(EntityX(Tpro_.h), EntityZ(Tpro_.h)) > EntityY(Tpro_.h)) {
				cc = -1;
			}
		}
		if (cc !== 0) {
			//Behaviour Var
			b = Ditem_behaviour(Tpro_.typ);
			//(Script) Vars
			// (Ditem_damage$ is a String array: the values are parsed with Float)
			if (Tpro_.weapon === Tpro_.typ) {
				G.pv_attack_damage = Float(Ditem_damage(Tpro_.weapon));
			} else {
				G.pv_attack_damage = f32(Float(Ditem_damage(Tpro_.weapon)) * Float(Ditem_damage(Tpro_.typ)));
			}
			if (Tpro_.weapon === 0) {
				G.pv_attack_damage = f32(Tpro_.damage * Float(Ditem_damage(Tpro_.typ)));
			}
			//if_msg(pv_attack_damage#)
			G.pv_attack_weapon = Tpro_.weapon;
			G.pv_attack_ammo = Tpro_.typ;
			//Pick Vars
			G.in_px = f32(EntityX(Tpro_.h));
			G.in_py = f32(EntityY(Tpro_.h));
			G.in_pz = f32(EntityZ(Tpro_.h));
			//No Impact Damage?
			noimpactdamage = 0;
			if (Left(b, 6) === 'rocket') {
				noimpactdamage = 1;
			} else if (Left(b, 11) === 'toxicrocket') {
				noimpactdamage = 1;
			}
			//Scan Collisions
			if (cc > 0) {
				G.pv_impact_num = 0;
				G.pv_impact_amount = cc;
				for (i = 1; i <= cc; i++) {
					G.pv_impact_num = i;
					h = CollisionEntity(Tpro_.h, i);

					//Attach States to Object which was hit!
					//If Left(b$,4)="fire" Then
					//	attach_state(h,Cstate_fire)
					//ElseIf Left(b$,6)="poison" Then
					//	attach_state(h,Cstate_intoxication,Cclass_unit)
					//EndIf

					//State (by weapon)
					if (Ditem_wstate(G.pv_attack_weapon) !== 0) {
						if (!state_depleted(Ditem_wstate(G.pv_attack_weapon), Tpro_.wc)) {
							attach_state(h, Ditem_wstate(G.pv_attack_weapon));
						}
					}
					//State (by ammo)
					if (G.pv_attack_ammo !== G.pv_attack_weapon) {
						if (Ditem_wstate(G.pv_attack_ammo) !== 0) {
							if (!state_depleted(Ditem_wstate(G.pv_attack_ammo), Tpro_.wc)) {
								attach_state(h, Ditem_wstate(G.pv_attack_ammo));
							}
						}
					}

					//Collision / Damage
					G.pv_impact_class = 0;
					G.pv_impact_id = 0;
					G.pv_impact_kill = 0;
					G.pv_impact_x = f32(CollisionX(Tpro_.h, i));
					G.pv_impact_y = f32(CollisionY(Tpro_.h, i));
					G.pv_impact_z = f32(CollisionZ(Tpro_.h, i));
					G.pv_impact_ground = 0;
					//Damage
					if (noimpactdamage === 1) {
						tmpdmg = G.pv_attack_damage;
						G.pv_attack_damage = 0;
					}
					if (game_damage(h, G.pv_attack_damage, Tpro_.spawner, 1, 1)) {
						G.pv_impact_class = G.tmp_class;
						G.pv_impact_id = G.tmp_id;
						G.pv_impact_kill = G.tmp_kill;
						//Projectile Stuck Particle
						if (G.set_debug === 1) {
							if (i === 1) {
								p_projectile(Tpro_.mh, Tpro_.typ, G.tmp_class, G.tmp_id);
							}
						}
						//Impact Event at Weapon which fired projectile
						if (get_stored_item(G.pv_attack_weapon, Cclass_unit, G.g_player)) {
							set_parsecache(Cclass_item, G.TCitem!.id, 'impact');
							if (Instr(Ditem_scriptk(G.TCitem!.typ), SEP_LINE + 'impact')) {
								parse_task(Cclass_item, G.TCitem!.id, 'impact', '', Ditem_script(G.TCitem!.typ));
							}
						} else {
							set_parsecache(-2, 0, 'impact');
							if (Instr(Ditem_scriptk(G.pv_attack_weapon), SEP_LINE + 'impact')) {
								parse_task(-2, 0, 'impact', '', Ditem_script(G.pv_attack_weapon));
							}
						}
						//Impact Event at Projectile Itself
						if (G.pv_attack_ammo !== G.pv_attack_weapon) {
							if (get_stored_item(G.pv_attack_ammo, Cclass_unit, G.g_player)) {
								set_parsecache(Cclass_item, G.TCitem!.id, 'impact');
								if (Instr(Ditem_scriptk(G.TCitem!.typ), SEP_LINE + 'impact')) {
									parse_task(Cclass_item, G.TCitem!.id, 'impact', '', Ditem_script(G.TCitem!.typ));
								}
							} else {
								set_parsecache(-2, 0, 'impact');
								if (Instr(Ditem_scriptk(G.pv_attack_ammo), SEP_LINE + 'impact')) {
									parse_task(-2, 0, 'impact', '', Ditem_script(G.pv_attack_ammo));
								}
							}
						}
					}
					if (noimpactdamage === 1) G.pv_attack_damage = tmpdmg;
				}
			}

			//Ground Collision Event
			if (cc === -1) {
				G.pv_impact_class = 0;
				G.pv_impact_id = 0;
				G.pv_impact_kill = 0;
				G.pv_impact_num = 1;
				G.pv_impact_amount = 1;
				G.pv_impact_x = f32(EntityX(Tpro_.h));
				G.pv_impact_y = f32(EntityY(Tpro_.h));
				G.pv_impact_z = f32(EntityZ(Tpro_.h));
				G.pv_impact_ground = 1;
				if (get_stored_item(G.pv_attack_weapon, Cclass_unit, G.g_player)) {
					set_parsecache(Cclass_item, G.TCitem!.id, 'impact');
					if (Instr(Ditem_scriptk(G.TCitem!.typ), SEP_LINE + 'impact')) {
						parse_task(Cclass_item, G.TCitem!.id, 'impact', '', Ditem_script(G.TCitem!.typ));
					}
				} else {
					set_parsecache(-2, 0, 'impact');
					if (Instr(Ditem_scriptk(G.pv_attack_weapon), SEP_LINE + 'impact')) {
						parse_task(-2, 0, 'impact', '', Ditem_script(G.pv_attack_weapon));
					}
				}
				if (G.pv_attack_ammo !== G.pv_attack_weapon) {
					if (get_stored_item(G.pv_attack_ammo, Cclass_unit, G.g_player)) {
						set_parsecache(Cclass_item, G.TCitem!.id, 'impact');
						if (Instr(Ditem_scriptk(G.TCitem!.typ), SEP_LINE + 'impact')) {
							parse_task(Cclass_item, G.TCitem!.id, 'impact', '', Ditem_script(G.TCitem!.typ));
						}
					} else {
						set_parsecache(-2, 0, 'impact');
						if (Instr(Ditem_scriptk(G.pv_attack_ammo), SEP_LINE + 'impact')) {
							parse_task(-2, 0, 'impact', '', Ditem_script(G.pv_attack_ammo));
						}
					}
				}
			}

			//Item FX for Projectile
			material_fx(EntityX(Tpro_.h), EntityY(Tpro_.h), EntityZ(Tpro_.h), Ditem_mat(Tpro_.typ));

			//Behaviour Stuff
			//Rocket
			if (Left(b, 6) === 'rocket') {
				//FX / Damage
				game_explosion(EntityX(Tpro_.h), EntityY(Tpro_.h), EntityZ(Tpro_.h), 100, G.pv_attack_damage, 1);
				//Toxicrocket
			} else if (Left(b, 11) === 'toxicrocket') {
				//FX
				for (i = 1; i <= 3; i++) {
					p_add(EntityX(Tpro_.h), EntityY(Tpro_.h), EntityZ(Tpro_.h), Cp_explode, Rnd(2, 5), Rnd(1, 1.5));
					EntityColor(G.TCp!.h, 0, Rand(150, 255), 0);
				}
				// quirk: the loop limit Rand(3,5) is drawn again on every pass (Blitz re-evaluates the To expression)
				for (i = 0; i <= Rand(3, 5); i++) {
					p_add(EntityX(Tpro_.h), EntityY(Tpro_.h), EntityZ(Tpro_.h), Cp_spark, Rand(1, 2), 3);
					EntityColor(G.TCp!.h, 0, 255, 0);
				}
				p_add(EntityX(Tpro_.h), EntityY(Tpro_.h), EntityZ(Tpro_.h), Cp_smoke, Rnd(3, 5), Rnd(1, 1.5));
				EntityColor(G.TCp!.h, 0, Rand(150, 255), 0);
				EntityBlend(G.TCp!.h, 3);
				sfx_3d(Int(EntityX(Tpro_.h)), Int(EntityY(Tpro_.h)), Int(EntityZ(Tpro_.h)), G.sfx_explode[Rand(0, 3)]);
				//Damage
				game_explosion(EntityX(Tpro_.h), EntityY(Tpro_.h), EntityZ(Tpro_.h), 100, G.pv_attack_damage, 0);
				//Intoxication State
				for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
					if (EntityDistance(Tunit_.h, Tpro_.h) < 100) {
						set_state(Cstate_intoxication, Cclass_unit, Tunit_.id);
					}
				}
				//Throw
			} else if (Left(b, 5) === 'throw') {
				//Spawn Item
				if (G.p_skipevent === 0) {
					set_item(-1, Tpro_.typ, EntityX(Tpro_.h), EntityY(Tpro_.h), EntityZ(Tpro_.h), 1);
					//Event: on:drop
					G.p_skipevent = 0;
					if (!isNull(Titem, G.TCitem)) {
						if (set_parsecache(Cclass_item, G.TCitem!.id, 'drop')) parse();
						if (Instr(Ditem_scriptk(G.TCitem!.typ), SEP_LINE + 'drop')) {
							parse_env(Cclass_item, G.TCitem!.id, 'drop');
							loadstring_parsecache(Ditem_script(G.TCitem!.typ));
							parse();
						}
					}
				}
				//Kill Throw
			} else if (Left(b, 9) === 'killthrow') {
				//Nothing!
			}

			//State Stuff
			//by weapon
			if (Ditem_wstate(G.pv_attack_weapon) !== 0) {
				if (!state_depleted(Ditem_wstate(G.pv_attack_weapon), Tpro_.wc)) {
					state_impactfx(Ditem_wstate(G.pv_attack_weapon), Tpro_.h);
				}
			}
			//by ammo
			if (G.pv_attack_ammo !== G.pv_attack_weapon) {
				if (Ditem_wstate(G.pv_attack_ammo) !== 0) {
					if (!state_depleted(Ditem_wstate(G.pv_attack_ammo), Tpro_.wc)) {
						state_impactfx(Ditem_wstate(G.pv_attack_ammo), Tpro_.h);
					}
				}
			}

			//Free
			FreeEntity(Tpro_.mh);
			FreeEntity(Tpro_.h);
			Delete(Tpro, Tpro_);

			//Age Timeout
		} else if (G.gt - Tpro_.age > G.game_projectiletimeout) {
			//Free
			FreeEntity(Tpro_.mh);
			FreeEntity(Tpro_.h);
			Delete(Tpro, Tpro_);
		}
	}
	void opitch;
}

//### Projectile add Position
/** Function pro_add_script(typ,x#,y#,z#,pitch#,yaw#,offset,weapon=0,speed#=1,damage#=1,drag#=1) */
export function pro_add_script(
	typ: number,
	x: number,
	y: number,
	z: number,
	pitch: number,
	yaw: number,
	offset: number,
	weapon: number = 0,
	speed: number = 1,
	damage: number = 1,
	drag: number = 1
): number {
	if (pro_add(0, typ, 0, 0)) {
		//Disable Collisions
		EntityType(G.TCpro!.h, 0);

		//Positioning/Rotating
		EntityParent(G.TCpro!.mh, null);
		PositionEntity(G.TCpro!.mh, x, y, z);
		RotateEntity(G.TCpro!.mh, pitch, yaw, 0);
		PositionEntity(G.TCpro!.h, x, y, z);
		RotateEntity(G.TCpro!.h, pitch, yaw, 0);
		EntityParent(G.TCpro!.mh, G.TCpro!.h);
		G.TCpro!.spitch = f32(pitch);

		//Offset
		MoveEntity(G.TCpro!.h, 0, 0, offset);

		//Enable Collisions
		EntityType(G.TCpro!.h, Cworld_procol);

		//Set Values
		G.TCpro!.weapon = weapon;
		G.TCpro!.speed = f32(speed);
		G.TCpro!.damage = f32(damage);
		G.TCpro!.drag = f32(drag);

		pro_ini();

		return 1;
	} else {
		return 0;
	}
}
