/**
 * includes/ai_units.bb: the AI of the units (modes, movement, checks, attack)
 * and update_unit (AI + physics of one unit per frame).
 *
 * ai_getbehaviour is in ai_units.ported.ts.
 *
 * K.<name> are the AI constants of load_const.bb (ai_idle, ai_move, ...). Seven
 * of them (ai_move, ai_return, ai_attack, ai_hunt, ai_movetarget, ai_getfood,
 * ai_flee) and the attitude ai_agressive have the same name as a function of
 * this file: Blitz keeps constants/variables and functions in separate name
 * spaces, JavaScript does not, so the constants are read through K here.
 */
import {
	Animate,
	Animating,
	CollisionEntity,
	CountCollisions,
	CreatePivot,
	DeltaYaw,
	EntityBlend,
	EntityCollided,
	EntityColor,
	EntityDistance,
	EntityPick,
	EntityPickMode,
	EntityType,
	EntityX,
	EntityY,
	EntityYaw,
	EntityZ,
	FreeEntity,
	HideEntity,
	MoveEntity,
	PickedX,
	PickedY,
	PickedZ,
	PointEntity,
	PositionEntity,
	RotateEntity,
	ShowEntity,
	TranslateEntity,
	TurnEntity,
	type Handle,
	EntityAddress
} from '../bb3d';
import { Cos, Float, Instr, Int, Rand, Rnd, SEP_LINE, Sin, Sqr, Str, f32, fabs, fpow } from '../blitz';
import { include_001_normal_animal } from './ai/001_normal_animal';
import { include_002_raptor_predator } from './ai/002_raptor_predator';
import { include_003_standandsnap } from './ai/003_standandsnap';
import { include_004_idle } from './ai/004_idle';
import { include_005_idleturn } from './ai/005_idleturn';
import { include_006_standandshoot } from './ai/006_standandshoot';
import { include_007_monkey } from './ai/007_monkey';
import { include_008_shy } from './ai/008_shy';
import { include_009_plague } from './ai/009_plague';
import { include_010_landbird } from './ai/010_landbird';
import { include_200_crab } from './ai/200_crab';
import { include_201_amphibian } from './ai/201_amphibian';
import { include_300_fish } from './ai/300_fish';
import { include_301_circlingfish } from './ai/301_circlingfish';
import { include_302_predatorfish } from './ai/302_predatorfish';
import { include_303_deepseafish } from './ai/303_deepseafish';
import { include_400_405_406_bird } from './ai/400_405_406_bird';
import { include_401_circlingbird } from './ai/401_circlingbird';
import { include_404_flyinginsect } from './ai/404_flyinginsect';
import { include_407_landskybird } from './ai/407_landskybird';
import { include_408_killerbird } from './ai/408_killerbird';
import * as K from './consts';
import {
	Cclass_info,
	Cclass_item,
	Cclass_object,
	Cclass_unit,
	Cmenu_if_movie,
	Cp_bubbles,
	Cp_debug,
	Cp_fadeout,
	Cp_rwave,
	Cp_smoke,
	Cstate_ai_stick,
	Cstate_bloodrush,
	Cstate_count,
	Cstate_electroshock,
	Cstate_fracture,
	Cstate_frostbite,
	Cstate_speedmod,
	Cstate_tame,
	Cworld_col,
	Cworld_facct,
	Cworld_g,
	ani_attack,
	ani_die,
	ani_idle1,
	ani_idle2,
	ani_idle3,
	ani_move,
	ani_use,
	snd_attack,
	snd_idle1,
	snd_idle2,
	snd_idle3,
	snd_move,
	snd_spot
} from './consts';
import {
	Ditem_mat,
	Dobject_mat,
	Dstate_a,
	Dunit_ani_attack,
	Dunit_ani_die,
	Dunit_ani_idle1,
	Dunit_ani_idle2,
	Dunit_ani_idle3,
	Dunit_ani_move,
	Dunit_ani_use,
	Dunit_attackrange,
	Dunit_behaviour,
	Dunit_colxr,
	Dunit_colyr,
	Dunit_damage,
	Dunit_eyes,
	Dunit_loopmoveani,
	Dunit_mat,
	Dunit_range,
	Dunit_script,
	Dunit_scriptk,
	Dunit_sfx,
	Dunit_speed
} from './defs_arrays';
import { e_tery } from './e_environment';
import { meshline } from './functions';
import { game_damage } from './game_functions';
import { free_info } from './handle_infos';
import { con_item, damage_item, get_item } from './handle_items';
import { con_object, damage_object, get_object } from './handle_objects';
import { get_state } from './handle_states';
import { ani_unit, checkattackline, con_unit, kill_unit, unit_speed } from './handle_units';
import { material_stepsfx } from './load_materials';
import { parent_h } from './parentchild';
import { parse_emuevent, parse_sel, parse_task, set_parsecache } from './parser_functions';
import { p_add } from './particles';
import { play_soundset, sfx_emit } from './ressources';
import { RT } from './rt';
import { sfx } from './sfx';
import { G } from './state';
import { After, First, Titem, Tobject, Tstate, Tunit, isNull } from './types';

export * from './ai_units.ported';

//############################################ AI

/** Function ai_agressive(behaviour) */
export function ai_agressive(behaviour: number): number {
	switch (behaviour) {
		case 2:
			return 1;
		case 3:
			return 1;
		case 6:
			return 1;
		case 302:
			return 1;
		case 402:
			return 1;
		case 408:
			return 1;
	}
	return 0;
}

/** Function ai_ini(setupcenter=1) */
export function ai_ini(setupcenter: number = 1): void {
	let x = 0;

	//Setup AI Center
	if (setupcenter === 1) {
		PositionEntity(G.TCunit!.ai_ch, G.TCunit!.ai_cx, 0, G.TCunit!.ai_cz);
	}

	//Setup Start Behaviour
	switch (Dunit_behaviour(G.TCunit!.typ)) {
		//300,301,302 - fish,predatorfish,deepseafish
		case 300:
		case 302:
		case 303:
			x = Rand(0, 3);
			switch (x) {
				case 0:
					ai_mode(K.ai_move);
					break;
				case 1:
					ai_mode(K.ai_movel);
					break;
				case 2:
					ai_mode(K.ai_mover);
					break;
			}
			break;

		//301 - circlingfish,circlingbird
		case 301:
		case 401:
			x = Rand(0, 1);
			switch (x) {
				case 0:
					ai_mode(K.ai_movel);
					break;
				case 1:
					ai_mode(K.ai_mover);
					break;
			}
			break;

		//404 - Flying Insect
		case 404:
			x = Rand(0, 3);
			switch (x) {
				case 0:
					ai_mode(K.ai_move);
					break;
				case 1:
					ai_mode(K.ai_movel);
					break;
				case 2:
					ai_mode(K.ai_mover);
					break;
			}
			break;
	}
	G.TCunit!.ai_timer = G.gt;

	//Dead?
	if (G.TCunit!.health <= 0) {
		G.TCunit!.freeze = 0;
		G.TCunit!.ani = Int(Dunit_ani_die(G.TCunit!.typ, 1));
		Animate(G.TCunit!.mh, 3, Dunit_ani_die(G.TCunit!.typ, 0), Int(Dunit_ani_die(G.TCunit!.typ, 1)));
		G.TCunit!.health_max = 0;
		EntityType(G.TCunit!.h, 0);
		EntityPickMode(G.TCunit!.mh, 2, 1);
	}
}

/** Function ai_ani(typ) */
export function ai_ani(typ: number): void {
	switch (typ) {
		//Idle 1
		case ani_idle1:
			//Animate
			ani_unit(3, Dunit_ani_idle1(G.TCunit!.typ, 0), Int(Dunit_ani_idle1(G.TCunit!.typ, 1)));
			//Event
			set_parsecache(Cclass_unit, G.TCunit!.id, 'ai_idle1');
			if (Instr(Dunit_scriptk(G.TCunit!.typ), SEP_LINE + 'ai_idle1')) {
				parse_task(Cclass_unit, G.TCunit!.id, 'ai_idle1', '', Dunit_script(G.TCunit!.typ));
			}
			break;
		//Idle 2
		case ani_idle2:
			//Animate
			ani_unit(3, Dunit_ani_idle2(G.TCunit!.typ, 0), Int(Dunit_ani_idle2(G.TCunit!.typ, 1)));
			//Event
			set_parsecache(Cclass_unit, G.TCunit!.id, 'ai_idle2');
			if (Instr(Dunit_scriptk(G.TCunit!.typ), SEP_LINE + 'ai_idle2')) {
				parse_task(Cclass_unit, G.TCunit!.id, 'ai_idle2', '', Dunit_script(G.TCunit!.typ));
			}
			break;
		//Idle 3
		case ani_idle3:
			//Animate
			ani_unit(3, Dunit_ani_idle3(G.TCunit!.typ, 0), Int(Dunit_ani_idle3(G.TCunit!.typ, 1)));
			//Event
			set_parsecache(Cclass_unit, G.TCunit!.id, 'ai_idle3');
			if (Instr(Dunit_scriptk(G.TCunit!.typ), SEP_LINE + 'ai_idle3')) {
				parse_task(Cclass_unit, G.TCunit!.id, 'ai_idle3', '', Dunit_script(G.TCunit!.typ));
			}
			break;
		//Move
		case ani_move:
			if (Dunit_loopmoveani(G.TCunit!.typ) === 1) {
				ani_unit(1, Dunit_ani_move(G.TCunit!.typ, 0), Int(Dunit_ani_move(G.TCunit!.typ, 1)));
			} else {
				ani_unit(2, Dunit_ani_move(G.TCunit!.typ, 0), Int(Dunit_ani_move(G.TCunit!.typ, 1)));
			}
			break;
		//Attack
		case ani_attack:
			ani_unit(3, Dunit_ani_attack(G.TCunit!.typ, 0), Int(Dunit_ani_attack(G.TCunit!.typ, 1)), 1, 1);
			break;
		//Use
		case ani_use:
			ani_unit(3, Dunit_ani_use(G.TCunit!.typ, 0), Int(Dunit_ani_use(G.TCunit!.typ, 1)));
			break;
		//Die
		case ani_die:
			ani_unit(3, Dunit_ani_die(G.TCunit!.typ, 0), Int(Dunit_ani_die(G.TCunit!.typ, 1)));
			break;
	}
}

/** Function ai_mode(mode,duration=0,setani=1) */
export function ai_mode(mode: number, duration: number = 0, setani: number = 1): void {
	let playidle = 0;
	let x = 0;
	let idleanis = 0;

	if (duration === 0) {
		duration = Rand(1500, 3500);
	}
	G.TCunit!.ai_mode = mode;
	G.TCunit!.ai_duration = duration;
	G.TCunit!.ai_timer = G.gt;

	//Stay?
	// quirk: TCunit\ai_mode is already set; "stick" only replaces the animation by the idle one
	if (G.TCunit!.states === 1) {
		if (mode !== K.ai_idle) {
			if (get_state(Cstate_ai_stick, Cclass_unit, G.TCunit!.id) === 1) {
				mode = K.ai_idle;
			}
		}
	}

	//Animation
	if (setani === 1) {
		switch (mode) {
			//Idle
			case K.ai_idle:
				playidle = 0;
				x = Rand(1, 3);
				switch (x) {
					case 1:
						if (Dunit_ani_idle1(G.TCunit!.typ, 0) !== 0) {
							ai_ani(ani_idle1);
							play_soundset(Dunit_sfx(G.TCunit!.typ), snd_idle1, G.TCunit!.h);
							playidle = 1;
						}
						break;
					case 2:
						if (Dunit_ani_idle2(G.TCunit!.typ, 0) !== 0) {
							ai_ani(ani_idle2);
							play_soundset(Dunit_sfx(G.TCunit!.typ), snd_idle2, G.TCunit!.h);
							playidle = 1;
						}
						break;
					case 3:
						if (Dunit_ani_idle3(G.TCunit!.typ, 0) !== 0) {
							ai_ani(ani_idle3);
							play_soundset(Dunit_sfx(G.TCunit!.typ), snd_idle3, G.TCunit!.h);
							playidle = 1;
						}
						break;
				}
				//Animation Failed?
				if (playidle === 0) {
					Animate(G.TCunit!.mh, 0);
					G.TCunit!.ani = 0;
					idleanis = 0;
					if (Dunit_ani_idle1(G.TCunit!.typ, 0) !== 0) idleanis = idleanis + 1;
					if (Dunit_ani_idle2(G.TCunit!.typ, 0) !== 0) idleanis = idleanis + 1;
					if (Dunit_ani_idle3(G.TCunit!.typ, 0) !== 0) idleanis = idleanis + 1;
					// quirk: idleanis is counted and never used
					void idleanis;
					G.TCunit!.ai_duration = 0;
				}
				break;
			//Move
			case K.ai_move:
			case K.ai_movel:
			case K.ai_mover:
				ai_ani(ani_move);
				break;
			//Turn
			case K.ai_turnl:
			case K.ai_turnr:
				ai_ani(ani_move);
				break;
			//Rise / Fall
			case K.ai_rise:
			case K.ai_fall:
				ai_ani(ani_move);
				break;
			//Movetarget
			case K.ai_movetarget:
				ai_ani(ani_move);
				break;
			//Return
			case K.ai_return:
			case K.ai_sreturn:
				ai_ani(ani_move);
				break;
			//Attack
			case K.ai_attack:
				ai_ani(ani_attack);
				break;
			//Hunt
			case K.ai_hunt:
				ai_ani(ani_move);
				break;
			//Get Food
			case K.ai_getfood:
				ai_ani(ani_move);
				break;
			//Flee
			case K.ai_flee:
				ai_ani(ani_move);
				break;
		}
	}
}

/** Function ai_move(speed#,diroff#,landcheck=0) */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function ai_move(speed: number, diroff: number, landcheck: number = 0): number {
	let Tstate_: Tstate | null = null;
	let h: Handle = null;
	let yaw = 0;
	let mx = 0;
	let mz = 0;
	let tery1 = 0;
	let tery2 = 0;
	let dif = 0;

	//Speed Mod.
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
	//Move
	speed = f32(speed * G.f);
	h = G.TCunit!.h;
	yaw = EntityYaw(h);
	mx = f32(Cos(f32(yaw + diroff)) * speed);
	mz = f32(Sin(f32(yaw + diroff)) * speed);
	tery1 = e_tery(EntityX(h), EntityZ(h));
	tery2 = e_tery(f32(EntityX(h) + mx), f32(EntityZ(h) + mz));
	dif = f32(tery2 - tery1);
	// quirk: dif is computed and never used (the climb check below is commented out)
	void dif;

	//If dif#<(climbmax#*f#) Then
	TranslateEntity(h, mx, 0, mz);
	return 1;
	//EndIf

	//Landcheck
	//If landcheck<>0 Then
	//	Select landcheck
	//		;1 - No Water
	//		Case 1
	//		;2 - No Land
	//		Case 2
	//	End Select
	//EndIf

	//Return 0   (unreachable in the original too)
}

/** Function ai_check(attitude=0,landcheck=1,centercheck=1) */
export function ai_check(attitude: number = 0, landcheck: number = 1, centercheck: number = 1): void {
	let Tunit_: Tunit | null = null;
	let tame = 0;
	let doit = 0;
	let tempunit: Tunit | null = null;

	//Don't change mode during attacking-animation!
	if (G.TCunit!.ai_mode !== K.ai_attack) {
		//Land Check
		if (landcheck === 1) {
			if (EntityY(G.TCunit!.mh, 1) < 0) {
				//if_msg("water! "+EntityY(TCunit\mh,1))
				//p_add(EntityX(TCunit\h),EntityY(TCunit\h),EntityZ(TCunit\h),Cp_starflare,10,5)
				ai_mode(K.ai_sreturn);
				return;
			}
		} else if (landcheck === 2) {
			if (EntityY(G.TCunit!.mh, 1) > -5) {
				ai_mode(K.ai_sreturn);
				return;
			}
		}

		//Center Check
		if (centercheck === 1) {
			if (G.TCunit!.ai_mode !== K.ai_return) {
				if (
					Sqr(f32(fpow(f32(EntityX(G.TCunit!.h) - G.TCunit!.ai_cx), 2) + fpow(f32(EntityZ(G.TCunit!.h) - G.TCunit!.ai_cz), 2))) >
					Dunit_range(G.TCunit!.typ)
				) {
					if (Dunit_behaviour(G.TCunit!.typ) === 408) {
						if (G.TCunit!.ai_mode !== K.ai_hunt) {
							if (G.TCunit!.ai_mode !== K.ai_rise) {
								ai_mode(K.ai_return);
							}
						}
					} else {
						ai_mode(K.ai_return);
					}
				}
			}
		}

		//Movement based on Player
		switch (attitude) {
			//0 - Passive
			case 0:
				break;
			//1 - Shy
			case 1:
				if (G.TCunit!.ai_mode !== K.ai_flee) {
					for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
						if (Tunit_.id === G.g_player) {
							if (EntityDistance(Tunit_.h, G.TCunit!.h) < 100) {
								ai_mode(K.ai_flee, 10000);
								G.TCunit!.ai_target_class = Cclass_unit;
								G.TCunit!.ai_target_id = G.g_player;
							}
						}
					}
				} else {
					G.TCunit!.ai_duration = 10000;
					G.TCunit!.ai_timer = G.gt;
				}
				break;
			//2 - Aggressive
			case 2:
				//Tame?
				tame = 0;
				if (G.TCunit!.states === 1) {
					if (get_state(Cstate_tame, Cclass_unit, G.TCunit!.id) === 1) {
						tame = 1;
					}
				}

				if (tame === 0) {
					//No Unitpath?
					if (G.TCunit!.ai_mode !== -1) {
						//Attack
						if (G.TCunit!.ai_mode !== K.ai_attack) {
							if (G.TCunit!.ai_mode < K.ail_superior) {
								//In Attack Range?
								if (EntityDistance(G.TCunit!.h, G.g_cplayer!.h) < Dunit_attackrange(G.TCunit!.typ)) {
									//Alive?
									if (G.g_cplayer!.health > 0) {
										//Not Tame?
										doit = 0;

										//Check Line
										if (checkattackline() === 1) {
											//Damage
											tempunit = G.TCunit;
											switch (Dunit_behaviour(G.TCunit!.typ)) {
												case 0:
													// quirk: the causer argument (an Int, compared with unit ids) receives the unit's entity handle
													game_damage(G.g_cplayer!.mh, Dunit_damage(G.TCunit!.typ), EntityAddress(G.TCunit!.h));
													doit = 1;
													break;
												case 6:
													ai_shoot();
													doit = 1;
													break;
												case 302:
													if (EntityY(G.g_cplayer!.h) < 0) {
														game_damage(G.g_cplayer!.mh, Dunit_damage(G.TCunit!.typ), EntityAddress(G.TCunit!.h));
														doit = 1;
													}
													break;
												case 408:
													if (G.TCunit!.ai_mode !== K.ai_rise) {
														if (G.TCunit!.ai_mode !== K.ai_sreturn && G.TCunit!.ai_mode !== K.ai_return) {
															game_damage(G.g_cplayer!.mh, Dunit_damage(G.TCunit!.typ), EntityAddress(G.TCunit!.h));
															doit = 1;
														}
													}
													break;
												default:
													game_damage(G.g_cplayer!.mh, Dunit_damage(G.TCunit!.typ), EntityAddress(G.TCunit!.h));
													doit = 1;
													break;
											}
											G.TCunit = tempunit;
											if ((tame as number) === 1) doit = 0; // quirk: never true (this is inside If tame=0)
											if (doit === 1) {
												//Sound / FX
												play_soundset(Dunit_sfx(G.TCunit!.typ), snd_attack, G.TCunit!.h);
												ai_mode(K.ai_attack);
												//Event
												set_parsecache(Cclass_unit, G.TCunit!.id, 'ai_attack');
												if (Instr(Dunit_scriptk(G.TCunit!.typ), SEP_LINE + 'ai_attack')) {
													parse_task(Cclass_unit, G.TCunit!.id, 'ai_attack', '', Dunit_script(G.TCunit!.typ));
												}
												parse_sel(Cclass_unit, G.TCunit!.id, 'ai_attack');
											}
										}
									}
								}
							}
						}
						//Hunt
						if (G.TCunit!.ai_mode !== K.ai_attack) {
							if (G.TCunit!.ai_mode !== K.ai_hunt) {
								if (G.TCunit!.ai_mode < K.ail_superior) {
									//In Perception Range?
									if (EntityDistance(G.TCunit!.h, G.g_cplayer!.h) < Dunit_range(G.TCunit!.typ)) {
										//Alive?
										if (G.g_cplayer!.health > 0) {
											//Reachable?
											//Player is in Water
											if (EntityY(G.g_cplayer!.h) < f32(0.1)) {
												if (Dunit_behaviour(G.TCunit!.typ) >= 300) {
													//Killerbird does not Attack Waterstuff!
													if (Dunit_behaviour(G.TCunit!.typ) !== 408) {
														ai_mode(K.ai_hunt, 10000);
														if (G.ms - G.TCunit!.lastspot > 5000) {
															G.TCunit!.lastspot = G.ms;
															play_soundset(Dunit_sfx(G.TCunit!.typ), snd_spot, G.TCunit!.h);
														}
													}
												}
												//Player is on Land
											} else {
												if (Dunit_behaviour(G.TCunit!.typ) < 300) {
													ai_mode(K.ai_hunt, 10000);
													if (G.ms - G.TCunit!.lastspot > 5000) {
														G.TCunit!.lastspot = G.ms;
														play_soundset(Dunit_sfx(G.TCunit!.typ), snd_spot, G.TCunit!.h);
													}
													//Killerbird (408) Attack
												} else if (Dunit_behaviour(G.TCunit!.typ) === 408) {
													if (G.TCunit!.ai_mode !== K.ai_rise) {
														ai_mode(K.ai_hunt, 10000);
														if (G.ms - G.TCunit!.lastspot > 5000) {
															G.TCunit!.lastspot = G.ms;
															play_soundset(Dunit_sfx(G.TCunit!.typ), snd_spot, G.TCunit!.h);
														}
													}
												}
											}
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
}

/** Function ai_return(water=0,turndelay#=30.) */
export function ai_return(water: number = 0, turndelay: number = 30): void {
	//Turn to Center
	RotateEntity(G.TCunit!.h, 0, f32(EntityYaw(G.TCunit!.h) + f32(DeltaYaw(G.TCunit!.h, G.TCunit!.ai_ch) / f32(turndelay * G.f))), 0);
	//Move towards Center
	if (water === 0) {
		ai_move(Dunit_speed(G.TCunit!.typ), 90);
	} else {
		MoveEntity(G.TCunit!.h, 0, 0, f32(unit_speed() * G.f));
	}
	//Cancel Return Process at a low Distance
	if (Sqr(f32(fpow(f32(EntityX(G.TCunit!.h) - G.TCunit!.ai_cx), 2) + fpow(f32(EntityZ(G.TCunit!.h) - G.TCunit!.ai_cz), 2))) < 75) {
		G.TCunit!.ai_timer = 0;
	}
}

/** Function ai_hunt(water=0) */
export function ai_hunt(water: number = 0): void {
	//Cancel Process at a low Distance
	if (
		Sqr(f32(fpow(f32(EntityX(G.TCunit!.h) - EntityX(G.g_cplayer!.h)), 2) + fpow(f32(EntityZ(G.TCunit!.h) - EntityZ(G.g_cplayer!.h)), 2))) <
		f32(Float(Dunit_attackrange(G.TCunit!.typ)) / 2)
	) {
		G.TCunit!.ai_timer = 0;
	} else {
		//Turn to Player
		RotateEntity(G.TCunit!.h, 0, f32(EntityYaw(G.TCunit!.h) + f32(DeltaYaw(G.TCunit!.h, G.g_cplayer!.h) / f32(5 * G.f))), 0);
		//Move towards Player
		if (water === 0) {
			ai_move(Dunit_speed(G.TCunit!.typ), 90);
		} else {
			MoveEntity(G.TCunit!.h, 0, 0, f32(unit_speed() * G.f));
			if (fabs(f32(EntityY(G.TCunit!.h) - EntityY(G.g_cplayer!.h))) > 20) {
				if (EntityY(G.TCunit!.h) > EntityY(G.g_cplayer!.h)) {
					TranslateEntity(G.TCunit!.h, 0, f32(f32(-unit_speed() / 3) * G.f), 0);
				} else {
					TranslateEntity(G.TCunit!.h, 0, f32(f32(unit_speed() / 3) * G.f), 0);
				}
			}
		}
	}
}

/** Function ai_movetarget(water=0) */
export function ai_movetarget(water: number = 0): void {
	let target: Handle = null;

	//Get Target Handle
	target = parent_h(G.TCunit!.ai_target_class, G.TCunit!.ai_target_id);
	if (target === null) {
		G.TCunit!.ai_timer = 0;
	} else {
		//Cancel Move Target Process at a low Distance
		if (Sqr(f32(fpow(f32(EntityX(G.TCunit!.h) - EntityX(target)), 2) + fpow(f32(EntityZ(G.TCunit!.h) - EntityZ(target)), 2))) < 10) {
			G.TCunit!.ai_timer = 0;
		} else {
			//Turn to Target
			RotateEntity(G.TCunit!.h, 0, f32(EntityYaw(G.TCunit!.h) + f32(DeltaYaw(G.TCunit!.h, target) / f32(5 * G.f))), 0);
			//Move towards Target
			if (water === 0) {
				ai_move(Dunit_speed(G.TCunit!.typ), 90);
			} else {
				MoveEntity(G.TCunit!.h, 0, 0, f32(unit_speed() * G.f));
				// quirk: the height is adjusted towards the player, not towards the target
				if (fabs(f32(EntityY(G.TCunit!.h) - EntityY(G.g_cplayer!.h))) > 20) {
					if (EntityY(G.TCunit!.h) > EntityY(G.g_cplayer!.h)) {
						TranslateEntity(G.TCunit!.h, 0, f32(f32(-unit_speed() / 3) * G.f), 0);
					} else {
						TranslateEntity(G.TCunit!.h, 0, f32(f32(unit_speed() / 3) * G.f), 0);
					}
				}
			}
		}
	}
}

/** Function ai_getfood(water=0) */
export function ai_getfood(water: number = 0): number {
	let target: Handle = null;
	let Titem_: Titem | null = null;
	let temp: Tunit | null = null;

	//Get Target Handle
	target = parent_h(G.TCunit!.ai_target_class, G.TCunit!.ai_target_id);
	if (target === null) {
		//Cancel if target is not found
		G.TCunit!.ai_timer = 0;
		G.TCunit!.ai_duration = 0;
	} else {
		//Stored Item -> Cancel
		if (G.TCunit!.ai_target_class === Cclass_item) {
			for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
				if (Titem_.id === G.TCunit!.ai_target_id) {
					if (Titem_.parent_class !== 0) {
						G.TCunit!.ai_timer = 0;
						G.TCunit!.ai_duration = 0;
						//con_add("target is stored")
						return 0;
					}
				}
			}
		}
		//Cancel Move Target Process at a low Distance (AND EAT!)
		if (Sqr(f32(fpow(f32(EntityX(G.TCunit!.h) - EntityX(target)), 2) + fpow(f32(EntityZ(G.TCunit!.h) - EntityZ(target)), 2))) < 30) {
			if (((G.TCunit!.ani !== Dunit_ani_attack(G.TCunit!.typ, 1) ? 1 : 0) | (Animating(G.TCunit!.mh) === 0 ? 1 : 0)) !== 0) {
				//EAT!
				G.TCunit!.ai_mode = K.ai_idle;
				G.TCunit!.ai_duration = 5000;
				G.TCunit!.ai_timer = G.gt;
				ai_ani(ani_attack);
				play_soundset(Dunit_sfx(G.TCunit!.typ), snd_attack, G.TCunit!.h);
				sfx_emit(G.sfx_eat, G.TCunit!.h);

				//Script
				G.pv_ai_eater = G.TCunit!.id;
				G.p_skipevent = 0;
				parse_emuevent(G.TCunit!.ai_target_class, G.TCunit!.ai_target_id, 'ai_eat');
				parse_sel(G.TCunit!.ai_target_class, G.TCunit!.ai_target_id, 'ai_eat');
				if (G.p_skipevent === 0) {
					//Eat/Destory Food
					switch (G.TCunit!.ai_target_class) {
						//Object
						case Cclass_object:
							if (con_object(G.TCunit!.ai_target_id)) {
								damage_object(Dunit_damage(G.TCunit!.typ));
								if (con_object(G.TCunit!.ai_target_id)) {
									G.TCunit!.ai_mode = K.ai_getfood;
									G.TCunit!.ai_duration = 20000;
									G.TCunit!.ai_timer = G.gt;
								}
							}
							break;
						//Unit
						case Cclass_unit:
							temp = G.TCunit;
							if (con_unit(G.TCunit!.ai_target_id)) kill_unit();
							G.TCunit = temp;
							break;
						//Item
						case Cclass_item:
							if (con_item(G.TCunit!.ai_target_id)) {
								damage_item(Dunit_damage(G.TCunit!.typ), 1);
								if (con_item(G.TCunit!.ai_target_id)) {
									G.TCunit!.ai_mode = K.ai_getfood;
									G.TCunit!.ai_duration = 20000;
									G.TCunit!.ai_timer = G.gt;
								}
							}
							break;
						//Info
						case Cclass_info:
							free_info(G.TCunit!.ai_target_id);
							break;
					}
				}
			}
		} else {
			//Turn to Target
			RotateEntity(G.TCunit!.h, 0, f32(EntityYaw(G.TCunit!.h) + f32(DeltaYaw(G.TCunit!.h, target) / f32(5 * G.f))), 0);
			//Move towards Target
			if (water === 0) {
				ai_move(Dunit_speed(G.TCunit!.typ), 90);
			} else {
				MoveEntity(G.TCunit!.h, 0, 0, f32(unit_speed() * G.f));
				// quirk: the height is adjusted towards the player, not towards the food
				if (fabs(f32(EntityY(G.TCunit!.h) - EntityY(G.g_cplayer!.h))) > 20) {
					if (EntityY(G.TCunit!.h) > EntityY(G.g_cplayer!.h)) {
						TranslateEntity(G.TCunit!.h, 0, f32(f32(-unit_speed() / 3) * G.f), 0);
					} else {
						TranslateEntity(G.TCunit!.h, 0, f32(f32(unit_speed() / 3) * G.f), 0);
					}
				}
			}
		}
	}
	return 0;
}

/** Function ai_flee(water=0) */
export function ai_flee(water: number = 0): void {
	let target: Handle = null;
	let fp: Handle = null;

	//Get Target Handle
	target = parent_h(G.TCunit!.ai_target_class, G.TCunit!.ai_target_id);
	if (target === null) {
		G.TCunit!.ai_timer = 0;
	} else {
		//Cancel Flee Process at a high Distance
		if (Sqr(f32(fpow(f32(EntityX(G.TCunit!.h) - EntityX(target)), 2) + fpow(f32(EntityZ(G.TCunit!.h) - EntityZ(target)), 2))) > 50) {
			if (G.TCunit!.ai_duration !== 3000) {
				G.TCunit!.ai_duration = 3000;
				G.TCunit!.ai_timer = G.gt;
			}
		}

		//Flee Pivot
		fp = CreatePivot();
		PositionEntity(fp, EntityX(target), EntityY(target), EntityZ(target));
		RotateEntity(fp, 0, f32(f32(EntityYaw(G.TCunit!.h) + DeltaYaw(G.TCunit!.h, target)) + 180), 0);
		MoveEntity(fp, 0, 0, 300);

		//Turn away from Target
		RotateEntity(G.TCunit!.h, 0, f32(EntityYaw(G.TCunit!.h) + f32(DeltaYaw(G.TCunit!.h, fp) / f32(10 * G.f))), 0);
		//Move away from Target
		if (water === 0) {
			//Land
			ai_move(Dunit_speed(G.TCunit!.typ), 90);
		} else if (water === -1) {
			//Sky
			MoveEntity(G.TCunit!.h, 0, 0, f32(f32(unit_speed() * G.f) * 4.0));
			TranslateEntity(G.TCunit!.h, 0, f32(f32(unit_speed() * G.f) * 0.5), 0);
		} else {
			//Water
			MoveEntity(G.TCunit!.h, 0, 0, f32(unit_speed() * G.f));
			//Change Height
			// quirk: the height is compared with the player, not with the target
			if (fabs(f32(EntityY(G.TCunit!.h) - EntityY(G.g_cplayer!.h))) > 20) {
				if (EntityY(G.TCunit!.h) > EntityY(G.g_cplayer!.h)) {
					TranslateEntity(G.TCunit!.h, 0, f32(f32(-unit_speed() / 3) * G.f), 0);
				} else {
					TranslateEntity(G.TCunit!.h, 0, f32(f32(unit_speed() / 3) * G.f), 0);
				}
			}
			//Collision?
			if (e_tery(EntityX(G.TCunit!.h), EntityZ(G.TCunit!.h)) <= f32(EntityY(G.TCunit!.h) - Dunit_colyr(G.TCunit!.typ))) {
				TurnEntity(G.TCunit!.h, 0, f32(unit_speed() * G.f), 0);
				ai_watertest();
			} else if (EntityCollided(G.TCunit!.h, Cworld_col) !== null) {
				TurnEntity(G.TCunit!.h, 0, f32(unit_speed() * G.f), 0);
			}
		}
		//Free Flee Pivot
		FreeEntity(fp);
	}
}

/** Function ai_attack(turndelay#=30.) */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function ai_attack(turndelay: number = 30): void {
	//Turn to Target
	RotateEntity(G.TCunit!.h, 0, f32(EntityYaw(G.TCunit!.h) + f32(DeltaYaw(G.TCunit!.h, G.g_cplayer!.h) / f32(5 * G.f))), 0);
	//Keep mode while animating
	if (Animating(G.TCunit!.mh)) {
		//Keep mode
		G.TCunit!.ai_timer = G.gt + 10000;
	} else {
		//Attacking Finished, go on with hunting or attacking, based on distance
		G.TCunit!.ai_mode = 0;
		G.TCunit!.ai_timer = 0;
		G.TCunit!.ai_duration = -1;
		ai_check(K.ai_agressive);
	}
}

/** Function ai_watertest() */
export function ai_watertest(): number {
	let ty = 0;

	ty = e_tery(EntityX(G.TCunit!.h), EntityZ(G.TCunit!.h));
	MoveEntity(G.TCunit!.h, 0, 0, f32(unit_speed() * G.f));
	if (e_tery(EntityX(G.TCunit!.h), EntityZ(G.TCunit!.h)) > ty) {
		MoveEntity(G.TCunit!.h, 0, 0, f32(-unit_speed() * G.f));
		return 1;
	} else {
		return 0;
	}
}

/** Function ai_shoot() */
export function ai_shoot(): number {
	let t: Handle = null;
	let h: Handle = null;
	let i = 0;
	let water = 0;
	let target: Handle = null;
	let sx = 0;
	let sy = 0;
	let sz = 0;
	let cx = 0;
	let cy = 0;
	let cz = 0;
	let lineh: Handle = null;
	let argx = 0;
	let argy = 0;
	let argz = 0;
	let argsize = 0;
	let arga = 0;
	// quirk: "e_ter" is not a global (the terrain is "ter"): an implicit local that is always 0
	const e_ter: Handle = null;
	let tempunit: Tunit | null = null;

	//Target
	t = CreatePivot();
	PositionEntity(t, EntityX(G.g_cplayer!.h), EntityY(G.g_cplayer!.h), EntityZ(G.g_cplayer!.h));
	//Start
	h = CreatePivot();
	PositionEntity(h, EntityX(G.TCunit!.h), f32(EntityY(G.TCunit!.h) + Dunit_eyes(G.TCunit!.typ)), EntityZ(G.TCunit!.h));
	PointEntity(h, t);
	FreeEntity(t);
	MoveEntity(h, 0, 0, f32(Dunit_colxr(G.TCunit!.typ) + 5));
	//Pick
	G.in_pe = null;
	EntityPickMode(G.env_sea2, 0);
	EntityPickMode(G.TCunit!.h, 0);
	ShowEntity(G.g_cplayer!.mh);
	G.in_pe = EntityPick(h, Dunit_attackrange(G.TCunit!.typ));
	EntityPickMode(G.TCunit!.h, 2, 1);
	HideEntity(G.g_cplayer!.mh);
	G.in_px = PickedX();
	G.in_py = PickedY();
	G.in_pz = PickedZ();

	//Muzzle Smoke
	if (G.set_effects > 0) {
		for (i = 1; i <= 5; i++) {
			// exe: arguments evaluated z, size, alpha, y, x
			argz = f32(EntityZ(h) + Rnd(-3, 3));
			argsize = Rnd(5, 7);
			arga = Rnd(0.15, 0.4);
			argy = f32(EntityY(h) + Rnd(-3, 3));
			argx = f32(EntityX(h) + Rnd(-3, 3));
			p_add(argx, argy, argz, Cp_smoke, argsize, arga);
		}
	}

	//Water
	if (EntityY(h) < 0 || G.in_py < 0) {
		water = 0;
		target = CreatePivot();
		sx = EntityX(h);
		sy = EntityY(h);
		sz = EntityZ(h);
		PositionEntity(target, G.in_px, G.in_py, G.in_pz);
		if (EntityY(h) < 0) water = 1;
		for (i = 1; i <= 10000; i++) {
			MoveEntity(h, 0, 0, 10);
			//Over Water
			if (water === 0) {
				if (EntityY(h) < 0) {
					water = 1;
					p_add(EntityX(h), 1, EntityZ(h), Cp_rwave, Rnd(5, 10), Rnd(0.9, 1.5));
					cx = EntityX(h);
					cy = EntityY(h);
					cz = EntityZ(h);
				}
				//Under Water
			} else {
				if (Rand(2) === 1) {
					p_add(EntityX(h), EntityY(h), EntityZ(h), Cp_bubbles, Rnd(1, 3), Rnd(0.3, 0.5));
				}
				if (EntityY(h) > 0) {
					water = 0;
					p_add(EntityX(h), 1, EntityZ(h), Cp_rwave, Rnd(5, 10), Rnd(0.9, 1.5));
					cx = EntityX(h);
					cy = EntityY(h);
					cz = EntityZ(h);
					break;
				}
			}
			//Exit Loop
			if (EntityDistance(h, target) < 10) break;
		}
		//Line
		if (sy > 0) {
			lineh = meshline(cx, cy, cz, G.in_px, G.in_py, G.in_pz, f32(0.4));
		} else {
			if (water === 0) {
				lineh = meshline(sx, sy, sz, cx, cy, cz, f32(0.4));
			} else {
				lineh = meshline(sx, sy, sz, G.in_px, G.in_py, G.in_pz, f32(0.4));
			}
		}
		if (lineh !== null) {
			EntityBlend(lineh, 3);
			G.tmp_ph = lineh;
			p_add(0, f32(0.2), f32(0.011), Cp_fadeout);
		}

		FreeEntity(target);
	}

	//Free Pivot
	FreeEntity(h);

	//Damage
	if (G.in_pe !== null) {
		//Terrain
		// quirk: never true (e_ter is always 0): a hit on the terrain goes to game_damage like any entity
		if (G.in_pe === e_ter) {
			p_add(G.in_px, G.in_py, G.in_pz, Cp_smoke, Rnd(5, 10), Rnd(0.3, 1.5));
			//if_msg("Terrain: "+in_pe)
			//Object?
		} else {
			tempunit = G.TCunit;
			game_damage(G.in_pe, Dunit_damage(G.TCunit!.typ), G.TCunit!.id, 1);
			G.TCunit = tempunit;
			//if_msg(in_pe)
		}
		return 1;
	} else {
		return 0;
		//if_msg("no pick")
	}
}

/** Function ai_obstacle() */
export function ai_obstacle(): number {
	let c = 0;

	//if_msg(EntityCollided(TCunit\h,Cworld_col))
	if (EntityCollided(G.TCunit!.h, Cworld_col) !== null) return 1;
	c = CountCollisions(G.TCunit!.h);
	if (c > 0) {
		return 1;
		// quirk: the rest of the block is unreachable in the original (it follows "Return 1"), and it
		// indexes Dunit_colyr# with the entity handle instead of the type:
		//	Local i
		//	Local y#=EntityY(TCunit\h)-(Dunit_colyr#(TCunit\h)/2.)
		//	For i=1 To c
		//		If CollisionY(TCunit\h,i)>y# Then Return 1
		//	Next
	}
	return 0;
}

/** Function ai_turn() */
export function ai_turn(): void {
	if (Rand(1, 2) === 1) {
		ai_mode(K.ai_movel);
	} else {
		ai_mode(K.ai_mover);
	}
}

/** Function ai_scanenv() */
export function ai_scanenv(): void {
	let p: Handle = null;
	let angle = 0;

	p = CreatePivot();
	HideEntity(G.TCunit!.h);
	EntityPickMode(G.ter, 0);
	for (angle = 0; angle <= 270; angle += 45) {
		PositionEntity(p, EntityX(G.TCunit!.h), EntityY(G.TCunit!.h), EntityZ(G.TCunit!.h));
		RotateEntity(p, 0, angle, 0);
		MoveEntity(p, 0, 0, Dunit_colxr(G.TCunit!.typ));
		//If LinePick (EntityX(p),EntityY(p),EntityZ(p),1,1,1,15)=0 Then
		if (EntityPick(p, 300) === null) {
			RotateEntity(G.TCunit!.h, 0, angle, 0);
			p_add(EntityX(p), EntityY(p), EntityZ(p), Cp_debug);
			EntityColor(G.TCp!.h, 0, 255, 0);
		} else {
			p_add(EntityX(p), EntityY(p), EntityZ(p), Cp_debug);
			EntityColor(G.TCp!.h, 255, 0, 0);
		}
	}
	EntityPickMode(G.ter, 2, 1);
	ShowEntity(G.TCunit!.h);
	FreeEntity(p);
}

/** Function update_unit() */
export function update_unit(): void {
	let behaviour = 0;
	let mode = 0;
	let par = 0;
	let tot = 0;
	let perc = 0;
	let tery = 0;
	let col = 0;
	let colwithunit = 0;
	let Tunit_: Tunit | null = null;
	let freecon = 0;
	let rtery = 0;

	behaviour = Dunit_behaviour(G.TCunit!.typ);

	//MODES
	//0 - Land/Swim
	//1 - Land/Water Ground
	//2 - Water
	//3 - Sky
	//4 - Water Surface
	//5 - Aircraft
	//6 - Land / Skyflee

	switch (behaviour) {
		case 1:
		case 2:
		case 3:
		case 7:
		case 8:
		case 9:
			mode = 1;
			break;
		case 10:
			mode = 6;
			break;
		case 200:
		case 201:
			mode = 1;
			break;
		case 300:
		case 301:
		case 302:
		case 303:
			mode = 2;
			break;
		case 400:
		case 401:
		case 402:
		case 403:
		case 404:
		case 405:
		case 406:
		case 407:
		case 408:
			mode = 3;
			break;
		case 500:
			mode = 1;
			break;
		case 501:
			mode = 4;
			break;
		case 502:
			mode = 5;
			break;
		default:
			mode = 0;
			break;
	}

	//########################################################################## LIVING?!
	if (G.TCunit!.health > 0.0) {
		//Frozen?
		if (G.TCunit!.freeze === 0) {
			//Behaviour related Stuff
			switch (Dunit_behaviour(G.TCunit!.typ)) {
				//#################################### Land Stuff

				//0 - Passive
				case 0:
					break;

				//1 - Normal / Animal
				case 1:
					include_001_normal_animal();
					break;

				//2 - Raptor / Predator
				case 2:
					include_002_raptor_predator();
					break;

				//3 - Stand and Snap
				case 3:
					include_003_standandsnap();
					break;

				//4 - Idle
				case 4:
					include_004_idle();
					break;

				//5 - Idle Turn
				case 5:
					include_005_idleturn();
					break;

				//6 - Stand and Shoot
				case 6:
					include_006_standandshoot();
					break;

				//7 - Monkey
				case 7:
					include_007_monkey();
					break;

				//8 - Shy
				case 8:
					include_008_shy();
					break;

				//9 - Plague
				case 9:
					include_009_plague();
					break;

				//10 - Landbird
				case 10:
					include_010_landbird();
					break;

				//#################################### Land/Water Stuff

				//200 - Crab
				case 200:
					include_200_crab();
					break;

				//201 - Amphibian
				case 201:
					include_201_amphibian();
					break;

				//#################################### Fish Stuff

				//300 - Fish
				case 300:
					include_300_fish();
					break;

				//301 - circlingfish
				case 301:
					include_301_circlingfish();
					break;

				//302 - Predatorfish
				case 302:
					include_302_predatorfish();
					break;

				//303 - Deepseafish
				case 303:
					include_303_deepseafish();
					break;

				//#################################### Air Stuff

				//400 - Bird / 405 - Highbird / 406 - Lowbird
				case 400:
				case 405:
				case 406:
					include_400_405_406_bird();
					break;

				//401 - Circling Bird
				case 401:
					include_401_circlingbird();
					break;

				//404 - Flying Insect
				case 404:
					include_404_flyinginsect();
					break;

				//407 - Land Sky Bird
				case 407:
					include_407_landskybird();
					break;

				//408 - Killerbird
				case 408:
					include_408_killerbird();
					break;

				//#################################### Vehicle Stuff

				//500 - Vehicle
				case 500:
					//Stop Sound
					if (G.TCunit!.id !== G.g_drive) {
						if (RT.audio.bb.ChannelPlaying(G.TCunit!.chan) !== 0) {
							RT.audio.bb.StopChannel(G.TCunit!.chan);
						}
					}
					break;

				//501 - Watercraft
				case 501:
					//Water Wobble!
					RotateEntity(G.TCunit!.h, Sin(f32(G.in_wa + G.TCunit!.id * 20)), EntityYaw(G.TCunit!.h), Cos(f32(G.in_wa + G.TCunit!.id * 20)));
					//Vehicle Model
					PositionEntity(G.TCunit!.vh, EntityX(G.TCunit!.mh, 1), EntityY(G.TCunit!.mh, 1), EntityZ(G.TCunit!.mh, 1));
					RotateEntity(G.TCunit!.vh, 0, EntityYaw(G.TCunit!.h), 0);
					//Stop Sound
					if (G.TCunit!.id !== G.g_drive) {
						if (RT.audio.bb.ChannelPlaying(G.TCunit!.chan) !== 0) {
							RT.audio.bb.StopChannel(G.TCunit!.chan);
						}
					}
					break;

				//502 - Aircraft
				case 502:
					//Stop Sound
					if (G.TCunit!.id !== G.g_drive) {
						if (RT.audio.bb.ChannelPlaying(G.TCunit!.chan) !== 0) {
							RT.audio.bb.StopChannel(G.TCunit!.chan);
						}
					}
					break;
			}

			//########################################################################## PHYSICAL

			switch (mode) {
				//0 - Land/Swim
				case 0:
					//Land
					if (EntityY(G.TCunit!.h) > f32(0 - f32(Dunit_colyr(G.TCunit!.typ) / 2))) {
						//Jump
						if (f32(G.gt - G.TCunit!.phy_jump) < 0) {
							par = Int(f32(G.TCunit!.phy_jump - G.gt));
							tot = G.game_jumptime;
							perc = Float(f32(Float(par) / Float(tot)));
							//perc#=1.-perc#
							//perc#=Sin(perc#*360.)
							//TranslateEntity TCunit\h,0,((4.*perc#)*f#),0
							//TranslateEntity TCunit\h,0,(Cworld_g#*f#*0.39),0
							TranslateEntity(G.TCunit!.h, 0, f32(f32(4 * perc) * G.f), 0);
							//On Ground / Keep over Terrain
							tery = e_tery(EntityX(G.TCunit!.h), EntityZ(G.TCunit!.h));
							if (EntityY(G.TCunit!.h) <= f32(tery + Dunit_colyr(G.TCunit!.typ))) {
								PositionEntity(G.TCunit!.h, EntityX(G.TCunit!.h), f32(tery + Dunit_colyr(G.TCunit!.typ)), EntityZ(G.TCunit!.h));
								G.TCunit!.phy_ft = G.gt;
								G.TCunit!.phy_jump = 0;
							} else if (EntityCollided(G.TCunit!.h, Cworld_col) !== null) {
								G.TCunit!.phy_ft = G.gt;
								G.TCunit!.phy_jump = 0;
							}
							G.TCunit!.phy_fall = G.gt;
							G.TCunit!.phy_fally = EntityY(G.TCunit!.h);
						} else {
							//Fall
							par = G.gt - G.TCunit!.phy_fall;
							if (par > Cworld_facct) par = Cworld_facct;
							tot = Cworld_facct;
							perc = Float(f32(Float(par) / Float(tot)));
							TranslateEntity(G.TCunit!.h, 0, -f32(f32(Cworld_g * G.f) * f32(3 * perc)), 0);
							tery = e_tery(EntityX(G.TCunit!.h), EntityZ(G.TCunit!.h));
							col = 0;
							//On Ground / Keep over Terrain
							if (EntityY(G.TCunit!.h) <= f32(tery + Dunit_colyr(G.TCunit!.typ))) {
								//If TCunit\phy_fally#-EntityY(TCunit\h)>100 Then game_falldamage()
								PositionEntity(G.TCunit!.h, EntityX(G.TCunit!.h), f32(tery + Dunit_colyr(G.TCunit!.typ)), EntityZ(G.TCunit!.h));
								if (G.gt - G.TCunit!.phy_fall > 300) col = 1;
								G.TCunit!.phy_ft = G.gt;
								G.TCunit!.phy_fall = G.gt;
								G.TCunit!.phy_fally = EntityY(G.TCunit!.h);
							} else if (EntityCollided(G.TCunit!.h, Cworld_col) !== null) {
								//If TCunit\phy_fally#-EntityY(TCunit\h)>100 Then game_falldamage()
								if (G.gt - G.TCunit!.phy_fall > 300) col = 1;
								G.TCunit!.phy_ft = G.gt;
								G.TCunit!.phy_fall = G.gt;
								G.TCunit!.phy_fally = EntityY(G.TCunit!.h);
							}
							if (col === 1) {
								//Hit Ground! - Player Movement Sounds
								if (G.TCunit!.id === G.g_player) {
									if (G.g_drive === 0) {
										if (EntityCollided(G.TCunit!.h, Cworld_col) !== null) {
											if (get_object(CollisionEntity(G.TCunit!.h, 1)) !== -1) {
												if (!isNull(Tobject, G.TCobject)) {
													material_stepsfx(Dobject_mat(G.TCobject!.typ));
												}
											} else if (get_item(CollisionEntity(G.TCunit!.h, 1)) !== -1) {
												if (!isNull(Titem, G.TCitem)) {
													material_stepsfx(Ditem_mat(G.TCitem!.typ));
												}
											} else {
												colwithunit = 0;
												for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
													if (Tunit_.vh === CollisionEntity(G.TCunit!.h, 1)) {
														material_stepsfx(Dunit_mat(Tunit_.typ));
														colwithunit = 1;
														break;
													}
												}
												if (colwithunit === 0) {
													if (G.m_menu !== Cmenu_if_movie) {
														sfx(G.sfx_step[Rand(0, 3)]);
													}
												}
											}
										} else {
											if (G.m_menu !== Cmenu_if_movie) {
												sfx(G.sfx_step[Rand(0, 3)]);
											}
										}
										G.g_player_mst = G.ms;
									}
								}
							}
						}
						//Water
					} else {
						//No Gravity and Jump Stuff
						G.TCunit!.phy_ft = G.gt;
						G.TCunit!.phy_fall = G.gt;
						G.TCunit!.phy_jump = 0;
						//Keep over Terrain
						tery = e_tery(EntityX(G.TCunit!.h), EntityZ(G.TCunit!.h));
						if (EntityY(G.TCunit!.h) < f32(tery + Dunit_colyr(G.TCunit!.typ))) {
							PositionEntity(G.TCunit!.h, EntityX(G.TCunit!.h), f32(tery + Dunit_colyr(G.TCunit!.typ)), EntityZ(G.TCunit!.h));
						}
					}
					break;
				//1 - Land/Water Ground
				case 1:
					//Land
					if (EntityY(G.TCunit!.h) > 0) {
						//Fall
						TranslateEntity(G.TCunit!.h, 0, -f32(f32(Cworld_g * G.f) * f32(0.6)), 0);
						tery = e_tery(EntityX(G.TCunit!.h), EntityZ(G.TCunit!.h));
						//On Ground / Keep over Terrain
						if (EntityY(G.TCunit!.h) <= f32(tery + Dunit_colyr(G.TCunit!.typ))) {
							PositionEntity(G.TCunit!.h, EntityX(G.TCunit!.h), f32(tery + Dunit_colyr(G.TCunit!.typ)), EntityZ(G.TCunit!.h));
							G.TCunit!.phy_ft = G.gt;
						} else if (EntityCollided(G.TCunit!.h, Cworld_col) !== null) {
							G.TCunit!.phy_ft = G.gt;
						}
						//Water
					} else {
						//No Gravity and Jump Stuff
						G.TCunit!.phy_ft = G.gt;
						G.TCunit!.phy_fall = G.gt;
						G.TCunit!.phy_jump = 0;
						//Fall
						TranslateEntity(G.TCunit!.h, 0, -f32(f32(Cworld_g * G.f) * f32(0.6)), 0);
						//Keep over Terrain
						tery = e_tery(EntityX(G.TCunit!.h), EntityZ(G.TCunit!.h));
						if (EntityY(G.TCunit!.h) < f32(tery + Dunit_colyr(G.TCunit!.typ))) {
							PositionEntity(G.TCunit!.h, EntityX(G.TCunit!.h), f32(tery + Dunit_colyr(G.TCunit!.typ)), EntityZ(G.TCunit!.h));
						}
					}
					break;
				//2 - Water
				case 2:
					//Keep over Terrain
					tery = e_tery(EntityX(G.TCunit!.h), EntityZ(G.TCunit!.h));
					if (EntityY(G.TCunit!.h) < f32(tery + Dunit_colyr(G.TCunit!.typ))) {
						PositionEntity(G.TCunit!.h, EntityX(G.TCunit!.h), f32(tery + Dunit_colyr(G.TCunit!.typ)), EntityZ(G.TCunit!.h));
					}
					//Keep under Water Surface (push down when too high)
					if (EntityY(G.TCunit!.h) > -10) {
						PositionEntity(G.TCunit!.h, EntityX(G.TCunit!.h), -10, EntityZ(G.TCunit!.h));
					}
					break;
				//3 - Sky
				case 3:
					freecon = 0;
					//Keep over Terrain / Water Surface
					tery = e_tery(EntityX(G.TCunit!.h), EntityZ(G.TCunit!.h));
					if (tery < 1) tery = 1;
					rtery = tery;
					switch (Dunit_behaviour(G.TCunit!.typ)) {
						//Bird
						case 400:
							tery = f32(tery + 350);
							break;
						case 401:
							tery = f32(tery + 350);
							break;
						//Flying Insect
						case 404:
							tery = f32(tery + 20);
							break;
						//Highbird
						case 405:
							tery = f32(tery + 500);
							break;
						//Lowbird
						case 406:
							tery = f32(tery + 180);
							break;
						//Land/Sky Bird
						case 407:
							tery = f32(tery + 210);
							freecon = 1;
							break;
						//Killerbird
						case 408:
							tery = f32(tery + 400);
							freecon = 1;
							break;
					}
					//No Free Control
					if (freecon === 0) {
						//Avoid from Flying into Ground
						if (EntityY(G.TCunit!.h) < tery) {
							PositionEntity(G.TCunit!.h, EntityX(G.TCunit!.h), tery, EntityZ(G.TCunit!.h));
							//Avoid from Flying to high
						} else {
							switch (Dunit_behaviour(G.TCunit!.typ)) {
								//Birds
								case 400:
								case 401:
								case 405:
								case 406:
									TranslateEntity(G.TCunit!.h, 0, f32(f32(-0.2) * G.f), 0);
									break;
								//Flying Insect
								case 404:
									TranslateEntity(G.TCunit!.h, 0, f32(f32(-0.3) * G.f), 0);
									break;
							}
							//Post-Translation-Check
							if (EntityY(G.TCunit!.h) < tery) {
								PositionEntity(G.TCunit!.h, EntityX(G.TCunit!.h), tery, EntityZ(G.TCunit!.h));
							}
						}
						//Free Control
					} else {
						//Ground?
						if (EntityY(G.TCunit!.h) < rtery) {
							if (G.TCunit!.ai_mode === K.ai_fall) {
								//Don't land at water!
								if (rtery > 2) {
									//Land! - (after falling)
									ai_mode(K.ai_idle);
									PositionEntity(G.TCunit!.h, EntityX(G.TCunit!.h), f32(rtery + Dunit_colyr(G.TCunit!.typ)), EntityZ(G.TCunit!.h));
								} else {
									//Rise!
									ai_mode(K.ai_rise, Rand(3000, 10000));
									PositionEntity(G.TCunit!.h, EntityX(G.TCunit!.h), rtery, EntityZ(G.TCunit!.h));
								}
							} else {
								//Rise!
								ai_mode(K.ai_rise, Rand(3000, 10000));
								PositionEntity(G.TCunit!.h, EntityX(G.TCunit!.h), rtery, EntityZ(G.TCunit!.h));
							}
							//Avoid from Flying to high
						} else if (EntityY(G.TCunit!.h) > tery) {
							TranslateEntity(G.TCunit!.h, 0, f32(f32(-0.2) * G.f), 0);
							if (G.TCunit!.ai_mode !== K.ai_fall) {
								if (G.TCunit!.ai_mode !== K.ai_return && G.TCunit!.ai_mode !== K.ai_sreturn) {
									if (G.TCunit!.ai_mode === K.ai_rise) {
										//Select Rand(0,4)
										//	Case 0 ai_mode(ai_move,Rand(2000,4000))
										//	Case 1 ai_mode(ai_movel,Rand(2000,4000))
										//	Case 2 ai_mode(ai_mover,Rand(2000,4000))
										//	Case 3 ai_mode(ai_fall,Rand(2000,4000))
										//End Select
									}
								}
							}
						}
					}
					break;
				//4 - Water Surface
				case 4:
					PositionEntity(G.TCunit!.h, EntityX(G.TCunit!.h), f32(1 + Dunit_colyr(G.TCunit!.typ)), EntityZ(G.TCunit!.h));
					break;
				//5 - Aircraft
				case 5:
					if (G.TCunit!.vh !== null) HideEntity(G.TCunit!.vh);
					//Fall
					if (G.g_drive !== G.TCunit!.id) {
						TranslateEntity(G.TCunit!.h, 0, -f32(f32(Cworld_g * G.f) * 2), 0);
					}
					//Keep over Terrain
					tery = e_tery(EntityX(G.TCunit!.h), EntityZ(G.TCunit!.h));
					if (EntityY(G.TCunit!.h) < f32(tery + Dunit_colyr(G.TCunit!.typ))) {
						PositionEntity(G.TCunit!.h, EntityX(G.TCunit!.h), f32(tery + Dunit_colyr(G.TCunit!.typ)), EntityZ(G.TCunit!.h));
					}
					if (G.TCunit!.vh !== null) ShowEntity(G.TCunit!.vh);
					break;
				//6 - Land / Skyflee
				case 6:
					//Land
					if (G.TCunit!.ai_mode !== K.ai_flee) {
						TranslateEntity(G.TCunit!.h, 0, -f32(f32(Cworld_g * G.f) * f32(0.6)), 0);
						tery = e_tery(EntityX(G.TCunit!.h), EntityZ(G.TCunit!.h));
						//On Ground / Keep over Terrain
						if (EntityY(G.TCunit!.h) <= f32(tery + Dunit_colyr(G.TCunit!.typ))) {
							PositionEntity(G.TCunit!.h, EntityX(G.TCunit!.h), f32(tery + Dunit_colyr(G.TCunit!.typ)), EntityZ(G.TCunit!.h));
							G.TCunit!.phy_ft = G.gt;
						} else if (EntityCollided(G.TCunit!.h, Cworld_col) !== null) {
							G.TCunit!.phy_ft = G.gt;
						}
					} else {
						G.TCunit!.phy_ft = G.gt;
					}
					break;
			}
		} else {
			//Frozen, no Animation
			if (G.TCunit!.ani !== 0) {
				G.TCunit!.ani = 0;
				Animate(G.TCunit!.mh, 0);
			}
		}

		//########################################################################## DEAD
	} else {
		//0 - Land/Swim
		//1 - Land/Water Ground
		//2 - Water
		//3 - Sky
		//4 - Water Surface
		//5 - Aircraft
		//6 - Land / Sky Flee

		switch (mode) {
			//0 - Land/Swim
			case 0:
				//Fall
				TranslateEntity(G.TCunit!.h, 0, -f32(f32(Cworld_g * G.f) * f32(0.6)), 0);
				//Keep over Terrain / Water Surface
				tery = e_tery(EntityX(G.TCunit!.h), EntityZ(G.TCunit!.h));
				if (tery < -2) tery = -2;
				if (EntityY(G.TCunit!.h) < f32(tery + Dunit_colyr(G.TCunit!.typ))) {
					PositionEntity(G.TCunit!.h, EntityX(G.TCunit!.h), f32(tery + Dunit_colyr(G.TCunit!.typ)), EntityZ(G.TCunit!.h));
				}
				break;
			//1 - Land/Water Ground
			case 1:
			case 6:
				//Fall / Swim Up
				if (EntityY(G.TCunit!.h) <= f32(-3 + Dunit_colyr(G.TCunit!.typ))) {
					TranslateEntity(G.TCunit!.h, 0, f32(0.5 * G.f), 0);
					if (EntityY(G.TCunit!.h) > f32(-3 + Dunit_colyr(G.TCunit!.typ))) {
						PositionEntity(G.TCunit!.h, EntityX(G.TCunit!.h), f32(-3 + Dunit_colyr(G.TCunit!.typ)), EntityZ(G.TCunit!.h));
					}
				} else {
					TranslateEntity(G.TCunit!.h, 0, -f32(f32(Cworld_g * G.f) * f32(0.6)), 0);
				}
				//Keep over Terrain / Under Water Surface
				tery = e_tery(EntityX(G.TCunit!.h), EntityZ(G.TCunit!.h));
				if (EntityY(G.TCunit!.h) < f32(tery + Dunit_colyr(G.TCunit!.typ))) {
					PositionEntity(G.TCunit!.h, EntityX(G.TCunit!.h), f32(tery + Dunit_colyr(G.TCunit!.typ)), EntityZ(G.TCunit!.h));
				}
				break;
			//2 - Water
			case 2:
				//Swim to Water Surface
				if (EntityY(G.TCunit!.h) < -2) {
					TranslateEntity(G.TCunit!.h, 0, f32(0.5 * G.f), 0);
				} else {
					PositionEntity(G.TCunit!.h, EntityX(G.TCunit!.h), -2, EntityZ(G.TCunit!.h));
					if (e_tery(EntityX(G.TCunit!.h), EntityZ(G.TCunit!.h)) > EntityY(G.TCunit!.h)) {
						PositionEntity(
							G.TCunit!.h,
							EntityX(G.TCunit!.h),
							f32(e_tery(EntityX(G.TCunit!.h), EntityZ(G.TCunit!.h)) + Dunit_colyr(G.TCunit!.typ)),
							EntityZ(G.TCunit!.h)
						);
					}
				}
				break;
			//3 - Sky
			case 3:
				//Fall
				TranslateEntity(G.TCunit!.h, 0, -f32(f32(Cworld_g * G.f) * 2), 0);
				//Keep over Terrain / Water Surface
				tery = e_tery(EntityX(G.TCunit!.h), EntityZ(G.TCunit!.h));
				if (tery < -2) tery = -2;
				if (EntityY(G.TCunit!.h) < f32(tery + Dunit_colyr(G.TCunit!.typ))) {
					PositionEntity(G.TCunit!.h, EntityX(G.TCunit!.h), f32(tery + Dunit_colyr(G.TCunit!.typ)), EntityZ(G.TCunit!.h));
				}
				break;
		}
	}
}

/** Function ai_movesound(mode=1) */
export function ai_movesound(mode: number = 1): void {
	if (!isNull(Tunit, G.TCunit)) {
		if (mode === 1) {
			//Play
			if (G.TCunit!.chan !== 0) {
				if (RT.audio.bb.ChannelPlaying(G.TCunit!.chan) === 0) {
					G.TCunit!.chan = play_soundset(Dunit_sfx(G.TCunit!.typ), snd_move, G.TCunit!.h);
					//If TCunit\chan<>0 Then LoopSound TCunit\chan
				}
			} else {
				G.TCunit!.chan = play_soundset(Dunit_sfx(G.TCunit!.typ), snd_move, G.TCunit!.h);
				//If TCunit\chan<>0 Then LoopSound TCunit\chan
			}
		} else {
			//Stop
			if (G.TCunit!.chan !== 0) {
				if (RT.audio.bb.ChannelPlaying(G.TCunit!.chan) === 1) {
					RT.audio.bb.StopChannel(G.TCunit!.chan);
				}
			}
		}
	}
}

/** Function ai_center() */
export function ai_center(): void {
	G.TCunit!.ai_cx = EntityX(G.TCunit!.h);
	G.TCunit!.ai_cz = EntityZ(G.TCunit!.h);
	PositionEntity(G.TCunit!.ai_ch, G.TCunit!.ai_cx, 0, G.TCunit!.ai_cz);
}

/** Function ai_dosani() */
export function ai_dosani(): void {
	G.TCunit!.ai_timer = 0;
	if (Animating(G.TCunit!.mh)) {
		G.TCunit!.ai_timer = G.gt + 10000;
	}
}

/** Function ai_modetxt$(mode) */
export function ai_modetxt(mode: number): string {
	switch (mode) {
		case K.ai_idle:
			return Str(K.ai_idle) + ': idle';
		case K.ai_move:
			return Str(K.ai_move) + ': move';
		case K.ai_movel:
			return Str(K.ai_movel) + ': move left';
		case K.ai_mover:
			return Str(K.ai_mover) + ': move right';
		case K.ai_turnl:
			return Str(K.ai_turnl) + ': turn left';
		case K.ai_turnr:
			return Str(K.ai_turnr) + ': turn right';
		case K.ai_rise:
			return Str(K.ai_rise) + ': rise';
		case K.ai_fall:
			return Str(K.ai_fall) + ': fall';
		case K.ai_return:
			return Str(K.ai_return) + ': return';
		case K.ai_sreturn:
			return Str(K.ai_sreturn) + ': strict return';
		case K.ai_attack:
			// quirk: prints the number of ai_idle (50), not of ai_attack
			return Str(K.ai_idle) + ': attack player';
		case K.ai_hunt:
			// quirk: prints the number of ai_idle (50), not of ai_hunt
			return Str(K.ai_idle) + ': hunt player';
		case K.ai_movetarget:
			return Str(K.ai_movetarget) + ': move to target';
		case K.ai_getfood:
			return Str(K.ai_getfood) + ': get food';
		case K.ai_flee:
			return Str(K.ai_flee) + ': flee';
		case K.ai_sani:
			return Str(K.ai_sani) + ': script animation';
		default:
			return Str(mode) + ': UNKNOWN MODE';
	}
}
