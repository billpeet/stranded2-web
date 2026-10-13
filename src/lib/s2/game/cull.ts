/**
 * includes/cull.bb, ported line by line.
 */
import {
	EntityAlpha,
	EntityCollided,
	EntityDistance,
	EntityInView,
	EntityPitch,
	EntityX,
	EntityY,
	EntityYaw,
	EntityZ,
	HideEntity,
	PositionEntity,
	RotateEntity,
	ShowEntity,
	TranslateEntity,
	type Handle
} from '../bb3d';
import { Cos, Int, MilliSecs, Sin, Str, f32, fmod } from '../blitz';
import { update_unit } from './ai_units';
import { Csection_editor, Cworld_col, Cworld_facct, Cworld_g } from './consts';
import { Ditem_afc, Ditem_mat, Dmat_swim, Dobject_active, Dobject_afc, Dobject_col, Dobject_swaypower, Dobject_swayspeed, Dunit_afc } from './defs_arrays';
import { e_tery } from './e_environment';
import { load_map } from './e_load_map';
import { save_map } from './e_save_map';
import { FileType } from './files';
import { update_info } from './handle_infos';
import { update_object_behaviour } from './handle_objects';
import { con_unit } from './handle_units';
import { parse_all, parse_error } from './parser_functions';
import { G } from './state';
import { timer_update } from './timer';
import { After, Delete, First, Tin_quicksave, Tinfo, Titem, Tobject, Tp, Tunit } from './types';

//############################################ Render Culling
//Show only objects which really need to be rendered
//and do all the updating for all stuff

/** Function cull() */
export async function cull(): Promise<void> {
	let ccull = 0;
	let c = 0;
	let cv = 0;
	let ct = 0;
	let dist = 0;
	let h: Handle = null;
	let angle = 0;
	let Tinfo_: Tinfo | null = null;
	let Tin_quicksave_: Tin_quicksave | null = null;
	let Tp_: Tp | null = null;

	ccull = MilliSecs();
	con_unit(G.g_player);

	//Object
	c = 0;
	cv = 0;
	ct = MilliSecs();
	for (G.TCobject = First(Tobject); G.TCobject !== null; G.TCobject = After(Tobject, G.TCobject)) {
		c = c + 1;
		if (G.TCobject!.ch === null) {
			//Distance
			// dist has no sigil: an Int, the distance is rounded
			dist = Int(EntityDistance(G.TCobject!.h, G.cam));
			//Hide at large Distance
			if (dist > Dobject_afc(G.TCobject!.typ)) {
				HideEntity(G.TCobject!.h);
			} else {
				//Show when in View
				if (EntityInView(G.TCobject!.h, G.cam)) {
					cv = cv + 1;
					ShowEntity(G.TCobject!.h);
					EntityAlpha(G.TCobject!.h, G.TCobject!.alpha);
					if (Dobject_swayspeed(G.TCobject!.typ) !== 0) {
						//update_object()
						//Windsway
						if (G.set_windsway) {
							h = G.TCobject!.h;
							angle = G.TCobject!.windsway;
							angle = fmod(f32(angle + f32(Dobject_swayspeed(G.TCobject!.typ) * G.f)), 360);
							G.TCobject!.windsway = angle;
							RotateEntity(h, EntityPitch(h), EntityYaw(h), f32(Sin(angle) * Dobject_swaypower(G.TCobject!.typ)));
						}
					}
					if (Dobject_active(G.TCobject!.typ) === 1) {
						update_object_behaviour();
					}
					//Hide by Alpha for Collision at short Distance and not in View
				} else if (dist < 500) {
					ShowEntity(G.TCobject!.h);
					EntityAlpha(G.TCobject!.h, 0);
					//Hide when not in View and not short Distance
				} else {
					HideEntity(G.TCobject!.h);
				}
			}
		} else {
			//Distance
			dist = Int(EntityDistance(G.TCobject!.h, G.cam));
			//Hide at large Distance
			if (dist > Dobject_afc(G.TCobject!.typ)) {
				HideEntity(G.TCobject!.h);
				if (Dobject_col(G.TCobject!.typ) !== 3) HideEntity(G.TCobject!.ch);
			} else {
				//Show when in View
				if (EntityInView(G.TCobject!.h, G.cam)) {
					cv = cv + 1;
					ShowEntity(G.TCobject!.h);
					ShowEntity(G.TCobject!.ch);
					//EntityAlpha TCobject\h,TCobject\alpha#
					if (Dobject_swayspeed(G.TCobject!.typ) !== 0) {
						//update_object()
						//Windsway
						if (G.set_windsway) {
							h = G.TCobject!.h;
							angle = G.TCobject!.windsway;
							angle = fmod(f32(angle + f32(Dobject_swayspeed(G.TCobject!.typ) * G.f)), 360);
							G.TCobject!.windsway = angle;
							RotateEntity(h, EntityPitch(h), EntityYaw(h), f32(Sin(angle) * Dobject_swaypower(G.TCobject!.typ)));
						}
					}
					if (Dobject_active(G.TCobject!.typ) === 1) {
						update_object_behaviour();
					}
					//Only show Collision Thingy for Collision at short Distance and not in View
				} else if (dist < 500) {
					HideEntity(G.TCobject!.h);
					ShowEntity(G.TCobject!.ch);
					//Hide when not in View and not short Distance
				} else {
					HideEntity(G.TCobject!.h);
					if (Dobject_col(G.TCobject!.typ) !== 3) HideEntity(G.TCobject!.ch);
				}
			}
		}
	}
	//Debug Times
	if (G.set_debug_rt) {
		G.set_debug_rt_objects = Str(MilliSecs() - ct) + ' ms Objects (' + Str(cv) + '/' + Str(c) + ')';
	}

	//Unit
	c = 0;
	cv = 0;
	ct = MilliSecs();
	if (G.m_section !== Csection_editor) {
		for (G.TCunit = First(Tunit); G.TCunit !== null; G.TCunit = After(Tunit, G.TCunit)) {
			c = c + 1;
			if (G.TCunit!.id !== G.g_player) {
				//Hide at large Distance
				if (EntityDistance(G.TCunit!.h, G.cam) > Dunit_afc(G.TCunit!.typ)) {
					HideEntity(G.TCunit!.h);
					//Show at short Distance
				} else {
					cv = cv + 1;
					ShowEntity(G.TCunit!.h);
					if (G.g_unpaused) update_unit();
				}
			} else {
				if (G.g_unpaused) update_unit();
			}
		}
	} else {
		for (G.TCunit = First(Tunit); G.TCunit !== null; G.TCunit = After(Tunit, G.TCunit)) {
			c = c + 1;
			//Hide at large Distance
			if (EntityDistance(G.TCunit!.h, G.cam) > Dunit_afc(G.TCunit!.typ)) {
				HideEntity(G.TCunit!.h);
				//Show at short Distance
			} else {
				if (EntityInView(G.TCunit!.h, G.cam)) {
					cv = cv + 1;
					ShowEntity(G.TCunit!.h);
				} else {
					HideEntity(G.TCunit!.h);
				}
			}
		}
	}
	//Debug Times
	if (G.set_debug_rt) {
		G.set_debug_rt_units = Str(MilliSecs() - ct) + ' ms Units (' + Str(cv) + '/' + Str(c) + ')';
	}

	//Info
	if (G.m_section !== Csection_editor) {
		//Update Infos (Game)
		if (G.in_t1000go) {
			if (G.g_unpaused === 1) {
				c = 0;
				cv = 0;
				ct = MilliSecs();
				for (Tinfo_ = First(Tinfo); Tinfo_ !== null; Tinfo_ = After(Tinfo, Tinfo_)) {
					c = c + 1;
					if (Tinfo_.typ >= 10) {
						if (Tinfo_.typ < 30) {
							cv = cv + 1;
							G.TCinfo = Tinfo_;
							update_info();
						} else if (Tinfo_.typ > 40) {
							cv = cv + 1;
							G.TCinfo = Tinfo_;
							update_info();
						}
					}
				}
				if (G.map_timeupdate === 1) {
					G.g_sleep = 0;
					G.map_timeupdate = 0;
				}
			}
		}
	} else {
		//Cull Infos (Editor)
		for (Tinfo_ = First(Tinfo); Tinfo_ !== null; Tinfo_ = After(Tinfo, Tinfo_)) {
			if (EntityDistance(Tinfo_.h, G.cam) < 2000) {
				if (EntityInView(Tinfo_.h, G.cam)) {
					ShowEntity(Tinfo_.h);
				} else {
					HideEntity(Tinfo_.h);
				}
			} else {
				HideEntity(Tinfo_.h);
			}
		}
	}
	//Debug Times
	if (G.set_debug_rt) {
		// quirk: when the infos were not updated in this frame, ct, cv and c are still those of the units
		G.set_debug_rt_infos = Str(MilliSecs() - ct) + ' ms Infos (' + Str(cv) + '/' + Str(c) + ')';
	}

	//Timers
	if (G.m_section !== Csection_editor) {
		//Update Timers
		timer_update();
	}

	//Parse Scripts
	parse_all();

	//Perform Quicksave/Quickload/Autosave/Autoload
	if (G.in_quicksave > 0) {
		for (Tin_quicksave_ = First(Tin_quicksave); Tin_quicksave_ !== null; Tin_quicksave_ = After(Tin_quicksave, Tin_quicksave_)) {
			G.tmp_loadmapcmdmap = Tin_quicksave_.map;
			switch (Tin_quicksave_.mode) {
				//Quicksave
				case 1:
					Delete(Tin_quicksave, Tin_quicksave_);
					if (G.game_m_loadsave === 1) {
						await save_map('saves\\QUICKSAVE.sav', 'sav', '');
					}
					break;
				//Quickload
				case 2:
					Delete(Tin_quicksave, Tin_quicksave_);
					if (FileType('saves\\QUICKSAVE.sav') === 1) {
						if (G.game_m_loadsave === 1) {
							await load_map('saves\\QUICKSAVE.sav', '');
						}
					}
					break;
				//Autosave
				case 3:
					Delete(Tin_quicksave, Tin_quicksave_);
					if (G.game_m_loadsave === 1) {
						await save_map('saves\\AUTOSAVE.sav', 'sav', '');
						for (Tp_ = First(Tp); Tp_ !== null; Tp_ = After(Tp, Tp_)) {
							if (Tp_.typ === -1) Delete(Tp, Tp_);
						}
					}
					break;
				//Autoload
				case 4:
					Delete(Tin_quicksave, Tin_quicksave_);
					if (FileType('saves\\AUTOSAVE.sav') === 1) {
						if (G.game_m_loadsave === 1) {
							await load_map('saves\\AUTOSAVE.sav', '');
						}
					}
					break;
				//Loadmap
				case 5:
					Delete(Tin_quicksave, Tin_quicksave_);
					await load_map(G.tmp_loadmapcmdmap, '');
					break;
				//Savemap
				case 6:
					if ((await save_map(G.tmp_loadmapcmdmap, 'map', '', Tin_quicksave_.skills, Tin_quicksave_.items, Tin_quicksave_.vars, Tin_quicksave_.diary, Tin_quicksave_.states, Tin_quicksave_.locks)) === 0) {
						parse_error('Failed to save ' + G.tmp_loadmapcmdmap);
					}
					for (Tp_ = First(Tp); Tp_ !== null; Tp_ = After(Tp, Tp_)) {
						if (Tp_.typ === -1) Delete(Tp, Tp_);
					}
					Delete(Tin_quicksave, Tin_quicksave_);
					break;
			}
		}
		G.in_quicksave = 0;
	}

	//Debug Times
	if (G.set_debug_rt) {
		G.set_debug_rt_cull = Str(MilliSecs() - ccull) + ' ms Cull';
	}
}

/** Function cull_items() */
export function cull_items(): void {
	let c = 0;
	let cv = 0;
	let ct = 0;
	let Titem_: Titem | null = null;
	// quirk: Cp_out is not a constant (the constant is Cpm_out): a local that is always 0. Cpm_out is 0 as well.
	const Cp_out: number = 0;
	let par = 0;
	let tot = 0;
	let perc = 0;
	let swim = 0;
	let tery = 0;
	//Items
	c = 0;
	cv = 0;
	ct = MilliSecs();
	//InGame Culling
	if (G.m_section !== Csection_editor) {
		for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
			c = c + 1;
			//Update and show only Items which are NOT stored inside
			if (Titem_.parent_class === 0 || Titem_.parent_mode === Cp_out) {
				//Hide at large Distance
				if (EntityDistance(Titem_.h, G.cam) > Ditem_afc(Titem_.typ)) {
					HideEntity(Titem_.h);
					Titem_.phy_fall = G.gt;
				} else {
					//Update and Show at Short Distance

					//Unstored Items
					if (Titem_.parent_class === 0) {
						cv = cv + 1;
						ShowEntity(Titem_.h);

						//Game Unpaused
						if (G.g_unpaused) {
							//Physics Unpaused
							if (Titem_.phy_pause <= 0) {
								//Fall!
								par = G.gt - Titem_.phy_fall;
								if (par > Cworld_facct) par = Cworld_facct;
								tot = Cworld_facct;
								perc = f32(par / tot);
								swim = Dmat_swim(Ditem_mat(Titem_.typ));
								if (swim !== 0) {
									//Swim
									if (swim === 1) {
										//Position
										if (EntityY(Titem_.h) > -1) {
											//Fall
											TranslateEntity(Titem_.h, 0, f32(-f32(f32(Cworld_g * G.f) * f32(1.5 * perc))), 0);
										} else if (EntityY(Titem_.h) !== -1) {
											//Escalate
											TranslateEntity(Titem_.h, 0, f32(f32(0.45) * G.f), 0);
											if (EntityY(Titem_.h) > -1) {
												PositionEntity(Titem_.h, EntityX(Titem_.h), -1, EntityZ(Titem_.h));
												Titem_.phy_fall = G.gt;
											}
										} else {
											//Wooble
											RotateEntity(Titem_.h, Sin(f32(G.in_wa + Titem_.id * 20)), EntityYaw(Titem_.h), Cos(f32(G.in_wa + Titem_.id * 20)));
										}
										//Hover
									} else if (swim === 2) {
										//Position
										if (EntityY(Titem_.h) > -1) {
											//Fall
											TranslateEntity(Titem_.h, 0, f32(-f32(f32(Cworld_g * G.f) * f32(1.5 * perc))), 0);
										} else {
											//Hover
											Titem_.phy_fall = G.gt;
											//Wooble
											RotateEntity(Titem_.h, Sin(f32(G.in_wa + Titem_.id * 20)), EntityYaw(Titem_.h), Cos(f32(G.in_wa + Titem_.id * 20)));
										}
									}
								} else {
									//Just Fall!
									TranslateEntity(Titem_.h, 0, f32(-f32(f32(Cworld_g * G.f) * f32(1.5 * perc))), 0);
								}

								//On Ground (prevent Item from falling through the earth)
								tery = e_tery(EntityX(Titem_.h), EntityZ(Titem_.h));
								if (EntityY(Titem_.h) < f32(tery + 3)) {
									PositionEntity(Titem_.h, EntityX(Titem_.h), f32(tery + 1), EntityZ(Titem_.h));
									Titem_.phy_fall = G.gt;
									if (swim === 0) {
										Titem_.phy_pause = 1;
									}
								}

								//Collisions
								if (EntityCollided(Titem_.h, Cworld_col) !== null) {
									Titem_.phy_fall = G.gt;
									if (swim === 0) {
										if (Titem_.phy_pause >= 0) {
											Titem_.phy_pause = 1;
										} else {
											Titem_.phy_pause = Titem_.phy_pause + 1;
										}
									}
								}

								//Physics Paused
							} else {
								//Hide
								if (!EntityInView(Titem_.h, G.cam)) {
									HideEntity(Titem_.h);
								}
							}

							//Game Paused
						} else {
							//Hide
							if (!EntityInView(Titem_.h, G.cam)) {
								HideEntity(Titem_.h);
							}
						}
						//Hanging Item -> Show if in View
					} else {
						if (EntityInView(Titem_.h, G.cam)) {
							cv = cv + 1;
							ShowEntity(Titem_.h);
						} else {
							HideEntity(Titem_.h);
						}
						Titem_.phy_fall = G.gt;
					}
				}
				//Item stored Inside -> Hide
			} else {
				HideEntity(Titem_.h);
				Titem_.phy_fall = G.gt;
			}
		}
		//Editor Culling
	} else {
		for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
			c = c + 1;
			//Update and show only Items which are NOT stored inside
			if (Titem_.parent_class === 0 || Titem_.parent_mode === Cp_out) {
				//Hide at large Distance
				if (EntityDistance(Titem_.h, G.cam) > Ditem_afc(Titem_.typ)) {
					HideEntity(Titem_.h);
					Titem_.phy_fall = G.gt;
				} else {
					//Update and Show at Short Distance

					//Unstored Items
					if (Titem_.parent_class === 0) {
						cv = cv + 1;
						ShowEntity(Titem_.h);
						//Hanging Items - Show if in View
					} else {
						if (EntityInView(Titem_.h, G.cam)) {
							cv = cv + 1;
							ShowEntity(Titem_.h);
						} else {
							HideEntity(Titem_.h);
						}
						Titem_.phy_fall = G.gt;
					}
				}
			} else {
				HideEntity(Titem_.h);
				Titem_.phy_fall = G.gt;
			}
		}
	}
	//Debug Times
	if (G.set_debug_rt) {
		G.set_debug_rt_items = Str(MilliSecs() - ct) + ' ms Items (' + Str(cv) + '/' + Str(c) + ')';
	}
}
