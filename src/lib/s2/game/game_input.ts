/**
 * includes/game_input.bb: the player's controls in the running game
 * (game_input_normal) and the keys that open and close the menus
 * (game_input_menu).
 */
import { CollisionEntity, EntityCollided, EntityPitch, EntityRoll, EntityX, EntityY, EntityYaw, EntityZ, MoveEntity, PositionEntity, RotateEntity, type Handle } from '../bb3d';
import { Instr, MilliSecs, Rand, Rnd, RuntimeError, SEP_LINE, f32, fabs, zerofill } from '../blitz';
import { FlushKeys, KeyDown, KeyHit } from '../input';
import { col_jump } from './collisions';
import {
	Cclass_unit,
	Ckey_attack1,
	Ckey_attack2,
	Ckey_backward,
	Ckey_char,
	Ckey_chat,
	Ckey_diary,
	Ckey_forward,
	Ckey_items,
	Ckey_jump,
	Ckey_left,
	Ckey_next,
	Ckey_prev,
	Ckey_quickload,
	Ckey_quicksave,
	Ckey_right,
	Ckey_sleep,
	Ckey_use,
	Cmenu_if_char,
	Cmenu_if_chat,
	Cmenu_if_diary,
	Cmenu_if_items,
	Cmenu_if_movie,
	Cmenu_if_quit,
	Cp_rwave,
	Cp_splash,
	Cstate_bloodrush,
	Cstate_electroshock,
	Cstate_fracture,
	Cstate_frostbite,
	Cstate_speedmod,
	Cworld_col
} from './consts';
import { Ditem_mat, Dobject_mat, Dstate_a, Dunit_colyr, Dunit_mat, Dunit_speed, Dunit_store } from './defs_arrays';
import { e_tery } from './e_environment';
import { game_attack1, game_attack2, game_exhaust, game_move, game_scrollweapon, game_sleep, game_use, game_useasweapon } from './game_functions';
import { game_input_vehicles } from './game_input_vehicles';
import { seq_end } from './game_sequences';
import { get_item } from './handle_items';
import { get_object } from './handle_objects';
import { hurt_unit } from './handle_units';
import { if_lastentry, if_unselectitems } from './interface';
import { material_stepsfx } from './load_materials';
import { parse_globalevent, parse_task } from './parser_functions';
import { p_add } from './particles';
import { sfx } from './sfx';
import { G } from './state';
import { After, Delete, First, Titem, Tobject, Tseq, Tstate, Tunit, isNull } from './types';

//############################################ GAME INPUT

//### Normal Game Input
/** Function game_input_normal() */
export function game_input_normal(): void {
	let h: Handle = null;
	let damage = 0;
	let i = 0;
	let speed = 0;
	let Tstate_: Tstate | null = null;
	let m_lr = 0;
	let m_fb = 0;
	let x = 0;
	let moved = 0;
	let colwithunit = 0;
	let Tunit_: Tunit | null = null;
	let divey = 0;
	let argx = 0;
	let argz = 0;
	let argsize = 0;
	let arga = 0;

	G.TCunit = G.g_cplayer;
	if (isNull(Tunit, G.TCunit)) RuntimeError('Missing Player Data (game_input_normal)');
	h = G.TCunit!.h;

	//Hurt
	if (G.in_gt5000go) {
		if (G.TCunit!.health > 0) {
			damage = 0;
			if (G.TCunit!.hunger >= Dunit_store(G.TCunit!.typ)) {
				damage = f32(damage + G.game_exh_damage[0]);
			}
			if (G.TCunit!.thirst >= Dunit_store(G.TCunit!.typ)) {
				damage = f32(damage + G.game_exh_damage[1]);
			}
			if (G.TCunit!.exhaustion >= Dunit_store(G.TCunit!.typ)) {
				damage = f32(damage + G.game_exh_damage[2]);
			}
			if (damage > 0) {
				hurt_unit(damage);
				if (isNull(Tunit, G.TCunit)) return;
			}
		}
	}

	//Control only if Console is closed!
	if (G.in_console === 0) {
		//Scriptkeys
		if (G.game_scriptkeys > 0) {
			for (i = 0; i <= 20; i++) {
				if (G.game_scriptkey[i] !== 0) {
					// quirk: a String compared with 0 compares as strings: true unless the key's name is exactly "0"
					if (G.game_scriptkeyn[i] !== '0') {
						if (G.in_keyhit[i + 21]) {
							if (Instr(G.game_scriptk, SEP_LINE + 'keyhit' + zerofill(i, 2))) {
								parse_task(0, 0, 'keyhit' + zerofill(i, 2), '', G.game_script);
							}
						}
						if (G.in_keydown[i + 21]) {
							if (Instr(G.game_scriptk, SEP_LINE + 'keydown' + zerofill(i, 2))) {
								parse_task(0, 0, 'keydown' + zerofill(i, 2), '', G.game_script);
							}
						}
						if (G.in_keyrelease[i + 21]) {
							if (Instr(G.game_scriptk, SEP_LINE + 'keyrelease' + zerofill(i, 2))) {
								parse_task(0, 0, 'keyrelease' + zerofill(i, 2), '', G.game_script);
							}
						}
					}
				}
			}
		}

		//Only with health.
		if (G.TCunit!.health > 0) {
			//Only when Process Allows it
			if (G.pc_typ < 150) {
				//Onliy when not frozen
				if (G.TCunit!.freeze === 0) {
					//Drive
					if (G.g_drive > 0) {
						game_input_vehicles();

						//Walk
					} else {
						//Move Speed Influence by States
						speed = Dunit_speed(G.TCunit!.typ);
						if (G.TCunit!.states === 1) {
							for (Tstate_ = First(Tstate); Tstate_ !== null; Tstate_ = After(Tstate, Tstate_)) {
								if (Dstate_a(Tstate_.typ)) {
									if (Tstate_.parent_class === Cclass_unit) {
										// quirk: the unit id is the literal 1 (player 1), not g_player
										if (Tstate_.parent_id === 1) {
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
													speed = Tstate_.value_f;
													break;
											}
										}
									}
								}
							}
						}

						//2 Directional Movement - Speed Decrease
						m_lr = 0;
						m_fb = 0;
						if (G.in_keydown[Ckey_forward]) {
							m_fb = 1;
						} else if (G.in_keydown[Ckey_backward]) {
							m_fb = 1;
						}
						if (G.in_keydown[Ckey_left]) {
							m_lr = 1;
						} else if (G.in_keydown[Ckey_right]) {
							m_lr = 1;
						}
						if (m_fb === 1) {
							if (m_lr === 1) {
								speed = f32(speed * 0.75);
							}
						}

						x = 0;
						moved = 0;
						//Move Land
						if (EntityY(G.TCunit!.h) > f32(0 - f32(Dunit_colyr(G.TCunit!.typ) / 2))) {
							G.g_swim = 0;
							//Jumpmove
							if (f32(G.gt - G.TCunit!.phy_jump) < 0) {
								if (G.in_keydown[Ckey_forward]) {
									game_move(f32(speed * G.game_jumpfac), 90);
								}
								if (G.in_keydown[Ckey_backward]) {
									game_move(f32(speed * G.game_jumpfac), 270);
								}
								if (G.in_keydown[Ckey_left]) {
									game_move(f32(speed * G.game_jumpfac), 180);
								}
								if (G.in_keydown[Ckey_right]) {
									game_move(f32(speed * G.game_jumpfac), 0);
								}
								//Move
							} else {
								if (G.in_keydown[Ckey_forward]) {
									game_move(speed, 90);
									moved = 1;
								}
								if (G.in_keydown[Ckey_backward]) {
									game_move(speed, 270);
									moved = 1;
								}
								if (G.in_keydown[Ckey_left]) {
									game_move(speed, 180);
									moved = 1;
								}
								if (G.in_keydown[Ckey_right]) {
									game_move(speed, 0);
									moved = 1;
								}
								if (moved === 1) {
									//Exhaust
									if (G.in_gt100go) game_exhaust(G.game_exh_move[0], G.game_exh_move[1], G.game_exh_move[2]);
									//Move Sound
									if (G.ms - G.g_player_mst > 500) {
										if (G.gt - G.TCunit!.phy_fall < 20) {
											//Land
											if (f32(EntityY(G.TCunit!.h) - Dunit_colyr(G.TCunit!.typ)) > 0) {
												//Collision? -> Sound depending on Object\Item Material
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
															sfx(G.sfx_step[Rand(0, 3)]);
														}
													}
													//No Collision? -> Normal Step Sound
												} else {
													//Only on Ground (avoid Step Sound while in air!)
													if (fabs(f32(f32(EntityY(G.TCunit!.h) - Dunit_colyr(G.TCunit!.typ)) - e_tery(EntityX(G.TCunit!.h), EntityZ(G.TCunit!.h)))) < 5) {
														sfx(G.sfx_step[Rand(0, 3)]);
													}
												}
												//Water
											} else {
												sfx(G.sfx_waterstep);
												p_add(EntityX(G.TCunit!.h), 1, EntityZ(G.TCunit!.h), Cp_rwave, Rnd(5, 10), Rnd(0.9, 1.5));
												p_add(EntityX(G.TCunit!.h), 1, EntityZ(G.TCunit!.h), Cp_splash, Rnd(15, 20), 1);
											}
											//Reset Move Sound Timer
											G.g_player_mst = G.ms;
										}
									}
								}
							}
							//Move Water
						} else {
							//Start Swim
							if (G.g_swim === 0) {
								G.g_swim = 1;
								//Dive in at corresponding Fall Speed
								if (G.gt - G.TCunit!.phy_fall > 50) {
									//par=gt-TCunit\phy_fall
									//If par>Cworld_facct Then par=Cworld_facct
									//tot=Cworld_facct
									//perc#=Float(Float(par)/Float(tot))
									//phy_set(Cclass_unit,TCunit\id,0,1.*perc#,0,0,0.1,0)
									//con_add("Dive "+par+"/"+tot+" -> "+perc#+"%")
								}
							}
							//Move
							divey = EntityY(G.TCunit!.h);
							if (G.in_keydown[Ckey_forward]) {
								MoveEntity(G.TCunit!.h, 0, 0, f32(f32(speed * G.f) * 0.8));
								moved = 1;
							}
							if (G.in_keydown[Ckey_backward]) {
								MoveEntity(G.TCunit!.h, 0, 0, -f32(f32(speed * G.f) * 0.8));
								moved = 1;
							}
							if (G.in_keydown[Ckey_left]) {
								MoveEntity(G.TCunit!.h, -f32(f32(speed * G.f) * 0.8), 0, 0);
								moved = 1;
							}
							if (G.in_keydown[Ckey_right]) {
								MoveEntity(G.TCunit!.h, f32(f32(speed * G.f) * 0.8), 0, 0);
								moved = 1;
							}
							//Keep on Water Surface (avoids jerks)
							if (EntityY(G.TCunit!.h) > f32(0 - f32(Dunit_colyr(G.TCunit!.typ) / 2))) {
								PositionEntity(G.TCunit!.h, EntityX(G.TCunit!.h), -f32(Dunit_colyr(G.TCunit!.typ) / 2), EntityZ(G.TCunit!.h));
							}
							//Waves
							if (G.in_gt100go) {
								if (EntityY(G.cam) > 0) {
									// exe: arguments evaluated z, size, alpha, x
									argz = f32(EntityZ(G.TCunit!.h) + Rnd(-3, 3));
									argsize = Rnd(3, 6);
									arga = Rnd(0.3, 0.7);
									argx = f32(EntityX(G.TCunit!.h) + Rnd(-3, 3));
									p_add(argx, 1, argz, Cp_rwave, argsize, arga);
								}
							}
							//Sound + Exhaust
							if (moved === 1) {
								if (G.in_gt100go) game_exhaust(G.game_exh_swim[0], G.game_exh_swim[1], G.game_exh_swim[2]);
								if (G.ms - G.g_player_mst > 1000) {
									sfx(G.sfx_swim);
									G.g_player_mst = G.ms;
								}
							}

							//Damage (Air Lack)
							if (G.game_divetime > -1) {
								if (G.gt - G.g_airtimer >= G.game_divetime) {
									if (G.in_gt1000go) {
										//SFX
										sfx(G.sfx_drown);
										//Bubbles
										for (i = 1; i <= 5; i++) {
											p_add(f32(EntityX(G.cam) + Rnd(-5, 5)), f32(EntityY(G.cam) - 10), f32(EntityZ(G.cam) + Rnd(-5, 5)), 10, Rnd(1, 3));
										}
										//Damage
										hurt_unit(G.game_divedamage, 0, -1);
									}
								}
							}
						}

						//Jump
						if (G.in_keydown[Ckey_jump]) {
							if (G.in_jumprehit === 1) {
								if (G.gt - G.TCunit!.phy_ft < 10) {
									if (G.g_dive === 0) {
										if (col_jump()) {
											G.TCunit!.phy_jump = f32(G.gt + G.game_jumptime);
											//Exhaust
											if (G.gt - G.in_lastjump > 100) {
												if (EntityY(G.TCunit!.h) > 0) {
													game_exhaust(G.game_exh_jump[0], G.game_exh_jump[1], G.game_exh_jump[2]);
												}
												G.in_lastjump = G.gt;
											}
										}
									}
								}
							}
						}
					}

					//Use
					if (G.in_keyhit[Ckey_use]) game_use();

					//Weapon 1-9 Direct Selection
					if (KeyHit(2)) game_useasweapon(G.in_quickslot[1]);
					if (KeyHit(3)) game_useasweapon(G.in_quickslot[2]);
					if (KeyHit(4)) game_useasweapon(G.in_quickslot[3]);
					if (KeyHit(5)) game_useasweapon(G.in_quickslot[4]);
					if (KeyHit(6)) game_useasweapon(G.in_quickslot[5]);
					if (KeyHit(7)) game_useasweapon(G.in_quickslot[6]);
					if (KeyHit(8)) game_useasweapon(G.in_quickslot[7]);
					if (KeyHit(9)) game_useasweapon(G.in_quickslot[8]);
					if (KeyHit(10)) game_useasweapon(G.in_quickslot[9]);
					if (KeyHit(11)) game_useasweapon(-1); //(Hands)

					//Weapon Scroll
					if (G.in_keyhit[Ckey_next]) {
						game_scrollweapon(1);
					} else if (G.in_keyhit[Ckey_prev]) {
						game_scrollweapon(0);
					}

					//Weapon Attack 1
					if (G.in_keydown[Ckey_attack1]) {
						game_attack1();
						//Weapon Attack 2
					} else if (G.in_keyhit[Ckey_attack2]) {
						game_attack2();
					}

					//Sleep
					if (G.in_keyhit[Ckey_sleep]) {
						game_sleep();
					}

					if (G.game_m_loadsave === 1) {
						//Quicksave
						if (G.in_keyhit[Ckey_quicksave]) {
							G.in_quicksave = 1;
						}

						//Quickload
						if (G.in_keyhit[Ckey_quickload]) {
							G.in_quicksave = 2;
						}
					}
				}
			}

			//Mouselook
			if (G.set_xinvert === 1) {
				//Invert X-Axis
				G.in_mxs = -G.in_mxs;
			}
			//X-Axis
			if (G.in_mxs !== 0) RotateEntity(G.cam, EntityPitch(G.cam), f32(EntityYaw(G.cam) + f32(G.in_mxs * G.set_msens)), EntityRoll(G.cam));
			//Y-Axis
			if (G.in_mys !== 0) {
				//Invert?
				G.in_mys = f32(f32(G.in_mys * G.set_msens) * G.set_minvert);
				//Rotate
				if (G.in_mys > 0) {
					if (f32(EntityPitch(G.cam) + G.in_mys) > 88) {
						G.in_mys = f32(88 - EntityPitch(G.cam));
					}
					RotateEntity(G.cam, f32(EntityPitch(G.cam) + G.in_mys), EntityYaw(G.cam), EntityRoll(G.cam));
				} else if (G.in_mys < 0) {
					if (f32(EntityPitch(G.cam) + G.in_mys) < -88) {
						G.in_mys = f32(-88 - EntityPitch(G.cam));
					}
					RotateEntity(G.cam, f32(EntityPitch(G.cam) + G.in_mys), EntityYaw(G.cam), EntityRoll(G.cam));
				}
			}
			//Rotate Player Model
			RotateEntity(h, EntityPitch(G.cam), EntityYaw(G.cam), 0);

			//Chat
			if (G.in_keyhit[Ckey_chat]) {
				FlushKeys();
				G.m_menu = Cmenu_if_chat;
				G.in_chat = '';
			}

			//Dead Controls
		} else {
			//Mouselook
			//X-Axis
			if (G.in_mxs !== 0) RotateEntity(G.cam, EntityPitch(G.cam), f32(EntityYaw(G.cam) + f32(G.in_mxs * G.set_msens)), EntityRoll(G.cam));
			//Y-Axis
			if (G.in_mys !== 0) {
				//Invert?
				G.in_mys = f32(f32(G.in_mys * G.set_msens) * G.set_minvert);
				//Rotate
				if (G.in_mys > 0) {
					if (f32(EntityPitch(G.cam) + G.in_mys) > 70) {
						G.in_mys = f32(70 - EntityPitch(G.cam));
					}
					RotateEntity(G.cam, f32(EntityPitch(G.cam) + G.in_mys), EntityYaw(G.cam), EntityRoll(G.cam));
				} else if (G.in_mys < 0) {
					if (f32(EntityPitch(G.cam) + G.in_mys) < -70) {
						G.in_mys = f32(-70 - EntityPitch(G.cam));
					}
					RotateEntity(G.cam, f32(EntityPitch(G.cam) + G.in_mys), EntityYaw(G.cam), EntityRoll(G.cam));
				}
			}
			//Rotate Player Model
			RotateEntity(h, EntityPitch(G.cam), EntityYaw(G.cam), 0);
		}
	}
	// x and divey are assigned and never read in the original
	void x;
	void divey;
}

//### Change Menu Input
/** Function game_input_menu() */
export function game_input_menu(): void {
	let time = 0;
	let ht = 0;
	let Tseq_: Tseq | null = null;
	if (G.in_console === 0) {
		//Set
		if (G.m_menu < Cmenu_if_quit) {
			//Don't change menu while entering stuff in an input
			if (G.in_inputfocus === -1) {
				//Char Menu
				if (G.in_keyhit[Ckey_char]) {
					G.m_menu = Cmenu_if_char;
					//Item Menu
				} else if (G.in_keyhit[Ckey_items]) {
					G.m_menu = Cmenu_if_items;
					if_unselectitems();
					G.in_scr_scr = 0;
					//Diary Menu
				} else if (G.in_keyhit[Ckey_diary]) {
					G.m_menu = Cmenu_if_diary;
					G.in_scr_scr = 0;
					G.in_scr_scr2 = 0;
					G.in_opt[0] = 0;
					if_lastentry();
					//ESC
				} else if (G.in_escape) {
					if (KeyDown(42)) {
						G.m_performquit = 1;
					} else {
						if (G.m_menu === 0) {
							G.m_menu = Cmenu_if_items;
							if_unselectitems();
							G.in_scr_scr = 0;
						} else {
							G.m_menu = 0;
							//If gui_msgdecide(sm$(191),Cbmpf_red,sm$(2),sm$(1)) Then
							//	menu_start()
							//EndIf
						}
					}
					//Closemenu (Jump)
				} else if (G.in_keyhit[Ckey_jump]) {
					if (G.m_menu !== 0) {
						if (G.ms - G.in_blockclose > 1500) {
							G.m_menu = 0;
						}
					}
				}
			}
			//Skip Movie
		} else if (G.m_menu === Cmenu_if_movie) {
			if (G.in_escape) {
				if (G.seq_skipable === 1) {
					time = (MilliSecs() - G.seq_start + 1) | 0;
					ht = 0;
					for (Tseq_ = First(Tseq); Tseq_ !== null; Tseq_ = After(Tseq, Tseq_)) {
						Delete(Tseq, Tseq_);
					}
					seq_end();
					parse_globalevent('skipsequence', 'sequence skipped by user');
				}
			}
		}
	}
	// time and ht are assigned and never read in the original
	void time;
	void ht;
}
