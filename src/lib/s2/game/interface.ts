/**
 * includes/interface.bb: INTERFACE (line-by-line port, PORTING_GUIDE.md).
 *
 * `interface` is a reserved word: the function is exported as `interface_`.
 */
import {
	CameraPick,
	CameraProject,
	EntityDistance,
	EntityInView,
	EntityPickMode,
	EntityType,
	EntityX,
	EntityY,
	EntityYaw,
	EntityZ,
	PickedX,
	PickedY,
	PickedZ,
	PositionEntity,
	ProjectedX,
	ProjectedY,
	type Handle
} from '../bb3d';
import { Abs, Cos, CurrentDate, CurrentTime, Instr, Int, Len, Mid, Replace, SEP_LINE, Sin, Str, f32, fabs, fgt, idivConst } from '../blitz';
import { Cls, ClsColor, Color, DrawBlock, DrawBlockRect, DrawImage, ImageHeight, ImageWidth, Line, Rect } from '../gfx2d';
import { FlushKeys, FlushMouse, KeyHit, MoveMouse } from '../input';
import { con_debug, con_debugmap, con_debugscript, con_debugsequences, con_debugtimes, con_open } from './console';
import {
	Cbmpf_dark,
	Cbmpf_green,
	Cbmpf_handwriting,
	Cbmpf_norm,
	Cbmpf_over,
	Cbmpf_red,
	Cbmpf_tiny,
	Cbmpf_yellow,
	Cchatshow,
	Cclass_building,
	Cclass_item,
	Cclass_object,
	Cclass_unit,
	Cicon_bag,
	Cicon_build,
	Cicon_check,
	Cicon_dialog,
	Cicon_down,
	Cicon_eat,
	Cicon_ex1,
	Cicon_ex5,
	Cicon_exall,
	Cicon_figure,
	Cicon_hand,
	Cicon_inc,
	Cicon_left,
	Cicon_load,
	Cicon_map,
	Cicon_ok,
	Cicon_options,
	Cicon_right,
	Cicon_save,
	Cicon_select,
	Cicon_sleep,
	Cicon_up,
	Cicon_x,
	Cicon_zoom,
	Ckey_chat,
	Cmenu_if_build,
	Cmenu_if_buildsetup,
	Cmenu_if_char,
	Cmenu_if_chat,
	Cmenu_if_clickscreen,
	Cmenu_if_combine,
	Cmenu_if_cracklock,
	Cmenu_if_debug,
	Cmenu_if_debugmenu,
	Cmenu_if_debugmenu_items,
	Cmenu_if_debugmenu_script,
	Cmenu_if_diary,
	Cmenu_if_dlg,
	Cmenu_if_exchange,
	Cmenu_if_find,
	Cmenu_if_items,
	Cmenu_if_loadgame,
	Cmenu_if_map,
	Cmenu_if_movie,
	Cmenu_if_msg,
	Cmenu_if_quit,
	Cmenu_if_savegame,
	Cmenu_if_selplace,
	Csection_editor,
	Csection_game_mp,
	Cstate_buildplace,
	Cstate_invulnerability,
	Cstate_pc_build,
	Cworld_size
} from './consts';
import { debug_map } from './debug';
import {
	Ditem_icondh,
	Ditem_iconh,
	Ditem_info,
	Ditem_name,
	Ditem_rate,
	Ditem_script,
	Ditem_scriptk,
	Ditem_weight,
	Dobject_iconh,
	Dobject_maxweight,
	Dobject_name,
	Dstate_frame,
	Dstate_name,
	Dunit_col,
	Dunit_health,
	Dunit_iconh,
	Dunit_maxweight,
	Dunit_name,
	Dunit_store
} from './defs_arrays';
import { e_tery } from './e_environment';
import { load_map, load_map_header, load_savegames } from './e_load_map';
import { save_map } from './e_save_map';
import { DeleteFile } from './files';
import { genmap, ntrim, numsep, play } from './functions';
import { game_buildsetup_end, game_buildsetup_start, game_buildsetup_update } from './game_build';
import { focus_draw } from './game_focus';
import { game_sleep, game_useasweapon } from './game_functions';
import {
	gui_dndwatch,
	gui_button,
	gui_healthbar,
	gui_ibutton,
	gui_ibuttona,
	gui_iconbox,
	gui_iconboxc,
	gui_iconboxqs,
	gui_input,
	gui_inputstr,
	gui_msgdecide,
	gui_opt,
	gui_scrollbar,
	gui_tt,
	gui_txtb,
	gui_win_command,
	gui_win_file
} from './gui';
import { gui_tb, gui_tb_loadfile, gui_tb_loadstring, gui_tb_savefile, gui_tb_savestring, gui_tb_scripthelper_list } from './gui_tb';
import {
	combine_item,
	countstored_items,
	eat_item,
	exchange_item,
	free_item,
	get_stored_item,
	merge_item,
	set_item,
	store_item,
	unstore_item,
	use_item
} from './handle_items';
import { con_object, search_object } from './handle_objects';
import { free_state, get_state, set_state } from './handle_states';
import { con_unit, unit_values } from './handle_units';
import { flushinput } from './input';
import { bmpf_len, bmpf_txt, bmpf_txt_c, bmpf_txt_r, bmpf_txt_rect } from './load_bmpf';
import { makedark } from './load_media';
import { s, se, sm, ss } from './load_strings';
import { menu_start } from './menu';
import { mb_override } from './motionblur';
import { parent_h } from './parentchild';
import { parse } from './parser';
import { parse_dialogue } from './parser_dialogue';
import { loadstring_parsecache, parse_emuevent, parse_env, parse_globalevent, parse_isevent, parse_task, set_parsecache } from './parser_functions';
import { p_add2d } from './particles';
import { sfx } from './sfx';
import { speech } from './speech';
import { G } from './state';
import {
	After,
	Delete,
	First,
	InsertBefore,
	New,
	T3d,
	Tbui,
	Tcom,
	Tcscr,
	Tfind,
	Tgroup,
	Tinfo,
	Titem,
	Tmsg,
	Tobject,
	Tsg,
	Tstate,
	Ttrade,
	Tudp_con,
	Tunit,
	Tx,
	isNull
} from './types';
import { udp_send, udp_w_byte, udp_w_txt } from './udp_messages';

//############################################ INTERFACE

//### Interface (Ingame)
/** Function interface() */
export async function interface_(): Promise<void> {
	let alive = 0;
	let t3dh: Handle = null;
	let T3d_: T3d | null = null;
	let y = 0;
	let Tmsg_: Tmsg | null = null;
	let i = 0;
	let perc = 0;
	let typ = 0;
	let x = 0;
	let Tstate_: Tstate | null = null;
	let total = 0;
	let current = 0;
	let tperc = 0;
	let weaponc = 0;
	let Titem_: Titem | null = null;
	let ammo = 0;
	let cox = 0;
	let coy = 0;
	let a = 0;
	let loadtemp = '';
	let Tsg_: Tsg | null = null;
	// quirk: Cmenu_if_debugmenu_item (the constant is Cmenu_if_debugmenu_items) is an undeclared name: a local, always 0
	const Cmenu_if_debugmenu_item = 0;
	let Tx_: Tx | null = null;
	let j = 0;
	let selcount = 0;
	let selx = 0;
	let sely = 0;
	let id = 0;
	let msgy = 0;
	let actv = 0;
	let ix = 0;
	let half = 0;
	let c = 0;
	let matched = 0;
	let btc = 0;
	let tradec = 0;
	let Trd: Ttrade | null = null;
	let Trd2: Ttrade | null = null;
	let exc = 0;
	let over = 0;
	let buildings = 0;
	let buildingsvisible = 0;
	let groups = 0;
	let totalbuildings = 0;
	let grp: Tgroup | null = null;
	let Tbui_: Tbui | null = null;
	let locked = 0;
	let starty = 0;
	let Tbuireq: Tbui | null = null;
	let gentyp = 0;
	let Tcom_: Tcom | null = null;
	let Tgen: Tcom | null = null;
	let txt = '';
	let Treq: Tcom | null = null;
	let Tfind_: Tfind | null = null;
	let restrictedex = 0;
	let exreturn = 0;
	let keyin = '';
	let Tobject_: Tobject | null = null;
	let buiid = 0;
	let itemid = 0;
	let click = 0;
	let cheatscript = '';
	let Tcscr_: Tcscr | null = null;
	let Tudp_con_: Tudp_con | null = null;

	//Player Alive?
	alive = 0;
	if (G.g_player !== 0) {
		if (G.g_cplayer!.health > 0) alive = 1;
	}
	if (alive === 0) {
		//Dead Message
		bmpf_txt_c(idivConst(G.set_scrx, 2), idivConst(G.set_scry, 2) - 50, sm(140), Cbmpf_red);

		//Dead Blur
		mb_override(f32(0.96));
	}

	//3D Texts
	if (alive === 1) {
		if (G.m_menu === 0) {
			for (T3d_ = First(T3d); T3d_ !== null; T3d_ = After(T3d, T3d_)) {
				t3dh = parent_h(T3d_.class, T3d_.id);
				if (t3dh !== null) {
					if (EntityDistance(t3dh, G.cam) < T3d_.range) {
						if (EntityInView(t3dh, G.cam)) {
							CameraProject(G.cam, EntityX(t3dh), f32(EntityY(t3dh) + T3d_.offset), EntityZ(t3dh));
							bmpf_txt_c(Int(f32(ProjectedX() - 10)), Int(ProjectedY()), T3d_.txt, T3d_.typ);
						}
					}
				} else {
					Delete(T3d, T3d_);
				}
			}
		}
	}

	//Messages
	if (G.m_menu === 0 || G.m_menu >= Cmenu_if_buildsetup) {
		//Normal
		y = idivConst(G.set_scry, 2);
		for (Tmsg_ = First(Tmsg); Tmsg_ !== null; Tmsg_ = After(Tmsg, Tmsg_)) {
			if (y < 55) {
				Delete(Tmsg, Tmsg_);
			} else {
				//Scroll
				if (G.ms - Tmsg_.age > 0) Tmsg_.scroll = f32(Tmsg_.scroll * f32(1 + G.f));
				//Show
				bmpf_txt(Int(f32(5 - Tmsg_.scroll)), y, Tmsg_.msg, Tmsg_.col);
				//Delete
				if (Tmsg_.scroll > 400) Delete(Tmsg, Tmsg_);
			}
			y = y - 20;
		}

		if (G.set_drawinterface === 1) {
			for (i = 0; i <= 19; i++) {
				//Images
				if (G.in_siimg[i] !== 0) {
					if (G.in_siimg_mask[i] === 0) {
						DrawBlock(G.in_siimg[i], G.in_siimg_x[i], G.in_siimg_y[i]);
					} else {
						DrawImage(G.in_siimg[i], G.in_siimg_x[i], G.in_siimg_y[i]);
					}
				}
			}
		}
	}

	if (G.m_menu <= Cmenu_if_quit || G.m_menu >= Cmenu_if_buildsetup) {
		if (G.set_drawinterface === 1) {
			//######################### HEALTH STATE

			//### Values
			con_unit(G.g_player);
			typ = G.TCunit!.typ;
			DrawImage(G.gfx_if_values, 0, 0);

			//Health
			perc = Int(f32(f32(G.TCunit!.health / G.TCunit!.health_max) * 100));
			if (perc <= 30) {
				DrawBlockRect(G.gfx_bars, 5, 4, 0, 0, perc, 5, G.in_cursor);
			} else {
				DrawBlockRect(G.gfx_bars, 5, 4, 0, 0, perc, 5, 0);
			}

			//Hunger
			if (G.game_healthsystem >= 2) {
				perc = Int(f32(f32(G.TCunit!.hunger / Dunit_store(typ)) * 100));
				if (perc >= 70) {
					DrawBlockRect(G.gfx_bar_hunger, 5, 12, 0, 0, perc, 5, G.in_cursor);
				} else {
					DrawBlockRect(G.gfx_bar_hunger, 5, 12, 0, 0, perc, 5, 1);
				}

				//Thirst
				if (G.game_healthsystem >= 3) {
					perc = Int(f32(f32(G.TCunit!.thirst / Dunit_store(typ)) * 100));
					if (perc >= 70) {
						DrawBlockRect(G.gfx_bar_thirst, 5, 20, 0, 0, perc, 5, G.in_cursor);
					} else {
						DrawBlockRect(G.gfx_bar_thirst, 5, 20, 0, 0, perc, 5, 1);
					}

					//Exhaustion
					if (G.game_healthsystem >= 4) {
						perc = Int(f32(f32(G.TCunit!.exhaustion / Dunit_store(typ)) * 100));
						if (perc >= 70) {
							DrawBlockRect(G.gfx_bar_exhaustion, 5, 28, 0, 0, perc, 5, G.in_cursor);
						} else {
							DrawBlockRect(G.gfx_bar_exhaustion, 5, 28, 0, 0, perc, 5, 1);
						}
					}
				}
			}

			//States
			if (G.m_menu === 0 || G.m_menu >= Cmenu_if_buildsetup) {
				x = 200;
				for (Tstate_ = First(Tstate); Tstate_ !== null; Tstate_ = After(Tstate, Tstate_)) {
					if (Tstate_.parent_class === Cclass_unit) {
						if (Tstate_.parent_id === G.g_player) {
							if (Tstate_.typ < 50) {
								DrawImage(G.gfx_state, x, 2, G.in_statefxf);
								DrawImage(G.gfx_states, x, 2, Dstate_frame(Tstate_.typ));
								x = x + 26;
							}
						}
					}
				}
			}

			//######################### Weapons
			if (G.m_menu === 0 || G.m_menu >= Cmenu_if_buildsetup) {
				DrawImage(G.gfx_if_weapon, G.set_scrx - 137, G.set_scry - 60);
				//Weapon
				DrawBlock(G.gfx_if_itemback, G.set_scrx - 5 - 45 - 40, G.set_scry - 5 - 40);
				if (G.TCunit!.player_weapon !== 0) {
					//Timer
					total = Ditem_rate(G.TCunit!.player_weapon);
					current = G.gt - G.TCunit!.player_lastattack;
					if (current > total) current = total;
					// quirk: Float division, a fire rate of 0 gives 0/0 = NaN, no error. NaN compares as "greater" (fgt):
					// such a weapon is never "ready" and gets a black frame (Color NaN is 0) every frame
					tperc = f32((total - current) / total);
					//Weapon Cooldown
					if (fgt(tperc, 0)) {
						G.in_wpnrdy = 0;
						G.in_wpnrdyg = 0;
						Color(f32(255 * tperc), 0, 0);
						Rect(G.set_scrx - 5 - 45 - 40, G.set_scry - 5 - 40, 39, 39, 0);
					} else if (G.in_wpnrdy === 0) {
						G.in_wpnrdy = 1;
						G.in_wpnrdyg = 255;
					}
					//Cooldown finished
					if (G.in_wpnrdyg > 0) {
						Color(0, G.in_wpnrdyg, 0);
						Rect(G.set_scrx - 5 - 45 - 40, G.set_scry - 5 - 40, 39, 39, 0);
						G.in_wpnrdyg = f32(G.in_wpnrdyg - f32(15 * G.f));
					}

					//Weapon Icon
					DrawImage(Ditem_iconh(G.TCunit!.player_weapon), G.set_scrx - 5 - 45 - 40, G.set_scry - 5 - 40);

					//Count
					weaponc = 0;
					for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
						if (Titem_.parent_class === Cclass_unit) {
							if (Titem_.parent_id === G.TCunit!.id) {
								if (Titem_.typ === G.TCunit!.player_weapon) {
									weaponc = Titem_.count;
								}
							}
						}
					}
					gui_iconboxc(G.set_scrx - 5 - 45 - 40, G.set_scry - 5 - 40, weaponc, 1);
				}

				//Ammo
				ammo = 0;
				DrawBlock(G.gfx_if_itemback, G.set_scrx - 5 - 40, G.set_scry - 5 - 40);
				if (G.TCunit!.player_ammo !== 0) {
					for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
						if (Titem_.parent_class === Cclass_unit) {
							if (Titem_.parent_id === G.TCunit!.id) {
								if (Titem_.typ === G.TCunit!.player_ammo) {
									ammo = Titem_.count;
								}
							}
						}
					}
					DrawImage(Ditem_iconh(G.TCunit!.player_ammo), G.set_scrx - 5 - 40, G.set_scry - 5 - 40);
					gui_iconboxc(G.set_scrx - 5 - 40, G.set_scry - 5 - 40, ammo, 1);
					if (ammo === 0) {
						Color(fabs(f32(255 * Sin(G.in_ca))), 0, 0);
						Rect(G.set_scrx - 5 - 40, G.set_scry - 5 - 40, 40, 40, 0);
					}
				}

				//######################### Compass / Images / Texts

				if (G.m_menu === 0) {
					if (G.set_drawinterface === 1) {
						//Compass
						if (G.in_compass === 1) {
							cox = G.set_scrx - 46;
							coy = 20;
							DrawImage(G.gfx_if_compass, cox, coy);
							a = EntityYaw(G.cam);
							bmpf_txt_c(Int(f32(cox + 2 - f32(Sin(a) * 34))), Int(f32(coy + 14 + f32(Cos(a) * 34))), s(40), Cbmpf_red);
							bmpf_txt_c(Int(f32(cox + 2 - f32(Sin(f32(a + 90)) * 34))), Int(f32(coy + 14 + f32(Cos(f32(a + 90)) * 34))), s(41), 0);
							bmpf_txt_c(Int(f32(cox + 2 - f32(Sin(f32(a + 180)) * 34))), Int(f32(coy + 14 + f32(Cos(f32(a + 180)) * 34))), s(42), Cbmpf_green);
							bmpf_txt_c(Int(f32(cox + 2 - f32(Sin(f32(a + 270)) * 34))), Int(f32(coy + 14 + f32(Cos(f32(a + 270)) * 34))), s(43), 0);
						}
					}
				}
			}
		}
	}

	//Foucs / Air
	if (G.m_menu === 0) {
		if (alive === 1) {
			//Focus
			if (G.in_focus !== 0) {
				focus_draw();
				//Air
			} else if (G.g_dive !== 0) {
				if (G.game_divetime !== -1) {
					//No more Air
					if (G.gt - G.g_airtimer >= G.game_divetime) {
						bmpf_txt_c(idivConst(G.set_scrx, 2), 35, sm(168), Cbmpf_red);
						if (G.in_cursor) {
							gui_healthbar(idivConst(G.set_scrx, 2) - 51, 55, 0, 1, 1, G.gfx_bar_thirst);
						}
						//Air
					} else {
						bmpf_txt_c(idivConst(G.set_scrx, 2), 35, sm(168));
						gui_healthbar(idivConst(G.set_scrx, 2) - 51, 55, G.game_divetime - (G.gt - G.g_airtimer), G.game_divetime, 1, G.gfx_bar_thirst);
					}
				}
			}
		}
	}

	if (G.m_menu === 0 || G.m_menu >= Cmenu_if_buildsetup) {
		//Images
		for (i = 20; i <= 39; i++) {
			if (G.in_siimg[i] !== 0) {
				if (G.in_siimg_mask[i] === 0) {
					DrawBlock(G.in_siimg[i], G.in_siimg_x[i], G.in_siimg_y[i]);
				} else {
					DrawImage(G.in_siimg[i], G.in_siimg_x[i], G.in_siimg_y[i]);
				}
			}
		}
		//Texts
		if (G.set_debug === 1) {
			y = 100;
		} else {
			y = 0;
		}
		if (G.in_compass === 1) y = y + 100;
		for (i = 0; i <= 19; i++) {
			if (G.in_sitxt[i] === 1) {
				//Texts
				if (G.in_sitxt_align[i] === -1) {
					bmpf_txt_r(G.set_scrx - 3, y, G.in_sitxt_txt[i], G.in_sitxt_font[i]);
					y = y + 16;
				} else {
					switch (G.in_sitxt_align[i]) {
						//Left
						case 1:
							bmpf_txt(G.in_sitxt_x[i], G.in_sitxt_y[i], G.in_sitxt_txt[i], G.in_sitxt_font[i]);
							break;
						//Center
						case 2:
							bmpf_txt_c(G.in_sitxt_x[i], G.in_sitxt_y[i], G.in_sitxt_txt[i], G.in_sitxt_font[i]);
							break;
						//Right
						case 3:
							bmpf_txt_r(G.in_sitxt_x[i], G.in_sitxt_y[i], G.in_sitxt_txt[i], G.in_sitxt_font[i]);
							break;
						//Default
						default:
							bmpf_txt(G.in_sitxt_x[i], G.in_sitxt_y[i], G.in_sitxt_txt[i], G.in_sitxt_font[i]);
					}
				}
			}
		}
	}

	//MENUS
	if (G.m_menu > 0) {
		if (G.m_menu <= Cmenu_if_quit) {
			//Char
			if (gui_button(5, 60, sm(141), alive, Cicon_figure)) {
				G.m_menu = Cmenu_if_char;
			}

			//Items
			if (gui_button(5, 60 + 50, sm(142), alive, Cicon_bag)) {
				G.m_menu = Cmenu_if_items;
				if_unselectitems();
				G.in_scr_scr = 0;
			}

			//Diary
			if (gui_button(5, 60 + 100, sm(143), alive, Cicon_dialog)) {
				G.m_menu = Cmenu_if_diary;
				G.in_scr_scr = 0;
				G.in_scr_scr2 = 0;
				G.in_opt[0] = 0;
				if_lastentry();
			}

			if (G.game_m_loadsave === 1) {
				//Load
				if (gui_button(5, idivConst(G.set_scry, 2), sm(144), 1, Cicon_load)) {
					if (G.m_menu === Cmenu_if_loadgame) {
						loadtemp = '';
						i = 0;
						for (Tsg_ = First(Tsg); Tsg_ !== null; Tsg_ = After(Tsg, Tsg_)) {
							i = i + 1;
							if (i === G.in_opt[0]) {
								loadtemp = Tsg_.name;
								break;
							}
						}
						if (loadtemp !== '') {
							await load_map('saves\\' + loadtemp + '.sav', '');
							G.m_menu = 0;
							G.set_debug_testmap = 0;
						}
					} else {
						load_savegames();
						G.in_scr_scr = 0;
						G.m_menu = Cmenu_if_loadgame;
					}
				}

				//Save
				if (gui_button(5, idivConst(G.set_scry, 2) + 50, sm(145), alive, Cicon_save)) {
					if (G.m_menu === Cmenu_if_savegame) {
						loadtemp = G.in_input[0];
						if (loadtemp !== '') {
							await save_map('saves\\' + loadtemp + '.sav', 'sav', '');
							G.m_menu = 0;
						}
					} else {
						load_savegames();
						G.in_scr_scr = 0;
						G.m_menu = Cmenu_if_savegame;
					}
				}
			}

			//Return to Main Menu
			if (gui_button(5, G.set_scry - 100, sm(47), 1, Cicon_x)) {
				if (await gui_msgdecide(sm(191), Cbmpf_red, sm(2), sm(1))) {
					await menu_start();
				}
			}

			//Close
			if (gui_button(5, G.set_scry - 50, sm(15), 1, Cicon_x)) G.m_menu = 0;

			//Draw Window
			DrawImage(G.gfx_win, 215, 0);
			DrawImage(G.gfx_winbar, 215, 42);
			if (gui_ibutton(742, 5, Cicon_x, sm(15))) G.m_menu = 0;

			//Switch to Loadgame Menu if Menu is not available for dead players ;)
			if (alive === 0) {
				switch (G.m_menu) {
					case 0:
					case Cmenu_if_loadgame:
						break;
					case Cmenu_if_debugmenu:
					case Cmenu_if_debugmenu_item:
						break;
					default:
						load_savegames();
						G.in_scr_scr = 0;
						G.m_menu = Cmenu_if_loadgame;
				}
			}

			switch (G.m_menu) {
				//Char
				case Cmenu_if_char:
					DrawImage(G.gfx_icons, 236, 5, Cicon_figure);
					bmpf_txt(236 + 37, 10, sm(141));

					bmpf_txt(236, 63, sm(146) + ':');
					perc = Int(f32(f32(G.TCunit!.health / G.TCunit!.health_max) * 100));
					DrawBlock(G.gfx_if_barback, 435, 69);
					DrawBlockRect(G.gfx_bars, 436, 70, 0, 0, perc, 5);
					bmpf_txt(546, 63, Str(Int(perc)) + '% (' + Str(Int(G.TCunit!.health)) + '/' + Str(Int(G.TCunit!.health_max)) + ')');

					if (G.game_healthsystem >= 2) {
						bmpf_txt(236, 83, sm(147) + ':');
						perc = Int(f32(f32(G.TCunit!.hunger / Dunit_store(typ)) * 100));
						DrawBlock(G.gfx_if_barback, 435, 89);
						DrawBlockRect(G.gfx_bar_hunger, 436, 90, 0, 0, perc, 5);
						bmpf_txt(546, 83, Str(Int(perc)) + '%');

						if (G.game_healthsystem >= 3) {
							bmpf_txt(236, 103, sm(148) + ':');
							perc = Int(f32(f32(G.TCunit!.thirst / Dunit_store(typ)) * 100));
							DrawBlock(G.gfx_if_barback, 435, 109);
							DrawBlockRect(G.gfx_bar_thirst, 436, 110, 0, 0, perc, 5);
							bmpf_txt(546, 103, Str(Int(perc)) + '%');

							if (G.game_healthsystem >= 4) {
								bmpf_txt(236, 123, sm(149) + ':');
								perc = Int(f32(f32(G.TCunit!.exhaustion / Dunit_store(typ)) * 100));
								DrawBlock(G.gfx_if_barback, 435, 129);
								DrawBlockRect(G.gfx_bar_exhaustion, 436, 130, 0, 0, perc, 5);
								bmpf_txt(546, 123, Str(Int(perc)) + '%');
							}
						}
					}

					//bmpf_txt(236,160,"Krankheiten, Wunden etc.:")

					//States
					x = 0;
					for (Tstate_ = First(Tstate); Tstate_ !== null; Tstate_ = After(Tstate, Tstate_)) {
						if (Tstate_.parent_class === Cclass_unit) {
							if (Tstate_.parent_id === G.g_player) {
								if (Tstate_.typ < 50) {
									//Draw
									DrawImage(G.gfx_state, 236 + x, 150, G.in_statefxf);
									DrawImage(G.gfx_states, 236 + x, 150, Dstate_frame(Tstate_.typ));
									//Check Mouse Over
									if (G.in_mx >= 236 + x) {
										if (G.in_my >= 150) {
											if (G.in_mx <= 236 + x + 26) {
												if (G.in_my <= 150 + 26) {
													//Tool Tip
													gui_tt(G.in_mx, G.in_my, Dstate_name(Tstate_.typ));
												}
											}
										}
									}
									x = x + 26;
								}
							}
						}
					}

					//Skills
					y = 0;
					for (Tx_ = First(Tx); Tx_ !== null; Tx_ = After(Tx, Tx_)) {
						if (Tx_.mode === 5) {
							if (Tx_.stuff !== '') {
								DrawImage(G.gfx_check[2], 236, 191 + y);
								// string compared with the number as a string ("0")
								if (Tx_.value !== '0') {
									if (gui_txtb(255, 190 + y, Tx_.stuff + ' (' + Tx_.value + ')')) {
										parse_globalevent('skill_' + Replace(Tx_.key, ' ', '_'), 'menu click at skill');
									}
								} else {
									if (gui_txtb(255, 190 + y, Tx_.stuff)) {
										parse_globalevent('skill_' + Replace(Tx_.key, ' ', '_'), 'menu click at skill');
									}
								}
								y = y + 20;
							}
						}
					}

					//Day
					// quirk: se$() (editor string table), not sm$()
					bmpf_txt(236, 535, se(162) + ':');
					bmpf_txt(346, 535, Str(G.map_day));

					//Time (Hour only)
					bmpf_txt(236, 555, sm(163) + ':');
					bmpf_txt(346, 555, Str(G.map_hour) + ' ' + sm(36));

					//Sleep
					if (gui_ibutton(742, 542, Cicon_sleep, sm(164))) {
						game_sleep();
						G.m_menu = 0;
					}
					break;

				//Inventory (Items)
				case Cmenu_if_items:
					DrawImage(G.gfx_icons, 236, 5, Cicon_bag);
					bmpf_txt(236 + 37, 10, sm(142));

					//List
					for (x = 0; x <= 10; x++) {
						for (y = 0; y <= 4; y++) {
							DrawBlock(G.gfx_if_itemback, 236 + x * 45, 63 + y * 45);
						}
					}
					x = 0;
					y = 0;
					j = 0;
					selcount = 0;
					selx = 0;
					sely = 0;

					for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
						if (Titem_.parent_class === Cclass_unit) {
							if (Titem_.parent_id === G.g_player) {
								j = j + 1;

								//Visible
								if (j > G.in_scr_scr && y < 225) {
									//Iconbox
									typ = Titem_.typ;
									id = Titem_.id;
									if (gui_iconbox(236 + x, 63 + y, Ditem_iconh(typ), Ditem_name(typ), Titem_.if_sel === 1 ? 1 : 0)) {
										FlushKeys();
										Titem_.if_sel = 1 - Titem_.if_sel;
									}
									//Drag and Drop
									if (gui_dndwatch(236 + x, 63 + y)) {
										G.in_dnd = 1;
										G.in_dnd_pivotx = G.in_mx - (236 + x);
										G.in_dnd_pivoty = G.in_my - (63 + y);
										G.in_dnd_src = 0;
										G.in_dnd_typ = typ;
										G.in_dnd_x = G.in_mx;
										G.in_dnd_y = G.in_my;
										G.in_dnd_show = 0;
									}
									//Iconcount
									gui_iconboxc(236 + x, 63 + y, Titem_.count);
									//Iconquickslot
									for (i = 1; i <= 9; i++) {
										if (G.in_quickslot[i] === Titem_.typ) {
											gui_iconboxqs(236 + x, 63 + y, i);
											break;
										}
									}
									//Cache
									if (Titem_.if_sel === 1) {
										selcount = selcount + 1;
										G.TCitem = Titem_;
										selx = 236 + x;
										sely = 63 + y;
										G.tmp_iselx = selx;
										G.tmp_isely = sely;
										G.tmp_iseltyp = Titem_.typ;
									}
									x = x + 45;
									if (x >= 495) {
										x = 0;
										y = y + 45;
									}
									//Invisible
								} else {
									//Cache
									if (Titem_.if_sel === 1) {
										selcount = selcount + 1;
										G.TCitem = Titem_;
										selx = 236 + x;
										sely = 63 + y;
										G.tmp_iselx = selx;
										G.tmp_isely = sely;
										G.tmp_iseltyp = Titem_.typ;
									}
								}
							}
						}
					}

					//Scroll
					if (gui_ibutton(742, 63, Cicon_up, sm(29), G.in_scr_scr > 0 ? 1 : 0)) {
						G.in_scr_scr = G.in_scr_scr - 11;
						if (G.in_scr_scr < 0) G.in_scr_scr = 0;
					}
					if (gui_ibutton(742, 63 + 180 + 10, Cicon_down, sm(30), y >= 225 ? 1 : 0)) {
						G.in_scr_scr = G.in_scr_scr + 11;
					}
					if (G.in_mzs > 0 && G.in_scr_scr > 0) {
						G.in_scr_scr = G.in_scr_scr - 11;
						if (G.in_scr_scr < 0) G.in_scr_scr = 0;
					}
					// quirk: y>225 never holds (y stops at 225): the wheel cannot scroll down here
					if (G.in_mzs < 0 && y > 225) G.in_scr_scr = G.in_scr_scr + 11;

					//Inventory Capacy State
					x = 0;
					for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
						if (Titem_.parent_class === Cclass_unit) {
							if (Titem_.parent_id === G.g_player) {
								x = x + Ditem_weight(Titem_.typ) * Titem_.count;
							}
						}
					}
					// quirk: always unit type 1, whatever the player's type
					total = Dunit_maxweight(1);
					bmpf_txt(236, 285, ss(sm(150), numsep(Str(x)), numsep(Str(total)), numsep(Str(total - x))), Cbmpf_tiny);

					perc = Int(f32(f32(x / total) * 100));
					DrawBlock(G.gfx_if_barback, 500, 289);
					DrawBlockRect(G.gfx_bars, 501, 290, 0, 0, 100 - perc, 5);

					//Weight Infos
					if (selcount === 1) {
						if (G.TCitem!.count === 1) {
							bmpf_txt(236, 305, Ditem_name(G.TCitem!.typ) + ' (' + Str(G.TCitem!.count) + ' x ' + numsep(Str(Ditem_weight(G.TCitem!.typ))) + 'g)');
						} else {
							bmpf_txt(
								236,
								305,
								Ditem_name(G.TCitem!.typ) +
									' (' +
									Str(G.TCitem!.count) +
									' x ' +
									numsep(Str(Ditem_weight(G.TCitem!.typ))) +
									'g = ' +
									numsep(Str(Ditem_weight(G.TCitem!.typ) * G.TCitem!.count)) +
									'g)'
							);
						}
					}

					//Info Text
					if (selcount === 1) {
						if (Ditem_info(G.TCitem!.typ) !== '') {
							bmpf_txt_rect(236, 325, 480 + 64, 150, Ditem_info(G.TCitem!.typ), Cbmpf_dark);
						}
					}

					//Messages
					msgy = 520;
					for (Tmsg_ = First(Tmsg); Tmsg_ !== null; Tmsg_ = After(Tmsg, Tmsg_)) {
						if (G.ms - Tmsg_.age > 0) {
							Delete(Tmsg, Tmsg_);
						} else {
							bmpf_txt(236, msgy, Tmsg_.msg, Tmsg_.col);
							msgy = msgy - 20;
							if (msgy < 440) break;
						}
					}

					//Process Focus (game_focus)
					actv = 1;
					if (G.in_focus > 99) {
						if (G.in_focus !== Cstate_pc_build) {
							actv = 0;
						}
					}

					ix = 236;

					//Use
					if (gui_ibutton(ix, 542, Cicon_check, sm(151), selcount === 1 && actv === 1 ? 1 : 0, 0, 18)) {
						use_item(G.TCitem!.id);
					}

					//Eat
					ix = ix + 37;
					if (gui_ibutton(ix, 542, Cicon_eat, sm(194), selcount === 1 && actv === 1 ? 1 : 0, 0, 19)) {
						eat_item(G.TCitem!.id);
					}

					//Take in Hand
					ix = ix + 37 + 37;
					if (gui_ibutton(ix, 542, Cicon_hand, sm(188), selcount === 1 && actv === 1 ? 1 : 0, 0, 20)) {
						if (!isNull(Tunit, G.g_cplayer)) {
							game_useasweapon(G.TCitem!.typ);
							G.m_menu = 0;
						}
					}

					//Combine
					ix = ix + 37 + 37;
					if (gui_ibutton(ix, 542, Cicon_inc, sm(152), selcount > 1 && actv === 1 ? 1 : 0, 0, 31)) {
						combine_item(Cclass_unit, G.g_player);
					}

					//Drop
					ix = ix + 37 + 37;
					if (gui_ibutton(ix, 542, Cicon_x, sm(153) + ' (1x)', selcount === 1 && actv === 1 ? 1 : 0, 0, 32)) {
						//Event: on:drop
						G.p_skipevent = 0;
						if (set_parsecache(Cclass_item, G.TCitem!.id, 'drop')) parse();
						if (Instr(Ditem_scriptk(G.TCitem!.typ), SEP_LINE + 'drop')) {
							parse_env(Cclass_item, G.TCitem!.id, 'drop');
							loadstring_parsecache(Ditem_script(G.TCitem!.typ));
							parse();
						}
						//Unstore
						if (G.p_skipevent === 0) {
							p_add2d(selx, sely, -2, G.TCitem!.typ);
							if (unstore_item(G.TCitem!.id, 1, 1)) merge_item(G.TCitem!.id);
						}
					}

					//Drop More
					if (selcount === 1) {
						if (!isNull(Titem, G.TCitem)) {
							if (G.TCitem!.count > 5) {
								//Drop Half
								half = idivConst(G.TCitem!.count, 2);
								ix = ix + 37;
								if (gui_ibutton(ix, 542, Cicon_x, sm(153) + ' (' + Str(half) + 'x)', selcount === 1 && actv === 1 ? 1 : 0)) {
									//Event: on:drop
									G.p_skipevent = 0;
									if (set_parsecache(Cclass_item, G.TCitem!.id, 'drop')) parse();
									if (Instr(Ditem_scriptk(G.TCitem!.typ), SEP_LINE + 'drop')) {
										parse_env(Cclass_item, G.TCitem!.id, 'drop');
										loadstring_parsecache(Ditem_script(G.TCitem!.typ));
										parse();
									}
									//Unstore
									if (G.p_skipevent === 0) {
										for (i = 1; i <= half; i++) {
											p_add2d(selx, sely, -2, G.TCitem!.typ);
											if (i === 10) break;
										}
										if (unstore_item(G.TCitem!.id, half, 1)) merge_item(G.TCitem!.id);
									}
								}
								bmpf_txt_c(ix + 16, 542 + 19, Str(half), Cbmpf_tiny);
								//Drop All
								ix = ix + 37;
								half = G.TCitem!.count;
								if (gui_ibutton(ix, 542, Cicon_x, sm(153) + ' (' + Str(G.TCitem!.count) + 'x)', selcount === 1 && actv === 1 ? 1 : 0)) {
									//Event: on:drop
									G.p_skipevent = 0;
									if (set_parsecache(Cclass_item, G.TCitem!.id, 'drop')) parse();
									if (Instr(Ditem_scriptk(G.TCitem!.typ), SEP_LINE + 'drop')) {
										parse_env(Cclass_item, G.TCitem!.id, 'drop');
										loadstring_parsecache(Ditem_script(G.TCitem!.typ));
										parse();
									}
									//Unstore
									if (G.p_skipevent === 0) {
										for (i = 1; i <= half; i++) {
											p_add2d(selx, sely, -2, G.TCitem!.typ);
											if (i === 20) break;
										}
										if (unstore_item(G.TCitem!.id, G.TCitem!.count, 1)) merge_item(G.TCitem!.id);
									}
								}
								bmpf_txt_c(ix + 16, 542 + 19, Str(G.TCitem!.count), Cbmpf_tiny);
							}
						}
					}

					//Quickslot
					if (selcount === 1) {
						if (KeyHit(2)) if_quickslot(1, 1);
						if (KeyHit(3)) if_quickslot(2, 1);
						if (KeyHit(4)) if_quickslot(3, 1);
						if (KeyHit(5)) if_quickslot(4, 1);
						if (KeyHit(6)) if_quickslot(5, 1);
						if (KeyHit(7)) if_quickslot(6, 1);
						if (KeyHit(8)) if_quickslot(7, 1);
						if (KeyHit(9)) if_quickslot(8, 1);
						if (KeyHit(10)) if_quickslot(9, 1);
					}
					break;

				//Diary
				case Cmenu_if_diary:
					DrawImage(G.gfx_icons, 236, 5, Cicon_dialog);
					bmpf_txt(236 + 37, 10, sm(143));

					//List Quests/Entries
					i = 0;
					j = 0;
					y = 0;
					for (Tx_ = First(Tx); Tx_ !== null; Tx_ = After(Tx, Tx_)) {
						if (Tx_.mode === 2) {
							j = j + 1;
							if (j > G.in_scr_scr) {
								if (gui_opt(236, 63 + i * 20, Tx_.key, j, 0)) {
									G.in_scr_scr2 = 0;
								}
								i = i + 1;
								if (i > 4) break;
							}
						}
					}

					//Scroll
					if (gui_ibutton(742, 63, Cicon_up, sm(29), G.in_scr_scr > 0 ? 1 : 0)) {
						G.in_scr_scr = G.in_scr_scr - 1;
					}
					if (gui_ibutton(742, 163 - 32 - 5, Cicon_down, sm(30), i > 4 ? 1 : 0)) {
						G.in_scr_scr = G.in_scr_scr + 1;
					}

					//Bar
					DrawImage(G.gfx_winbar, 215, 163);

					//Paperback
					DrawImage(G.gfx_paperback, 231, 163 + 16);

					//Quest Text
					i = 0;
					j = 0;
					y = 0;
					for (Tx_ = First(Tx); Tx_ !== null; Tx_ = After(Tx, Tx_)) {
						if (Tx_.mode === 2) {
							j = j + 1;
							if (G.in_opt[0] === j) {
								i = bmpf_txt_rect(236, 163 + 16 + 5, 480, 390, Tx_.value, Cbmpf_handwriting, G.in_scr_scr2);
								y = 1;
								break;
							}
						}
					}
					if (y === 0) i = 1;

					//Scroll
					if (gui_ibutton(742, 163 + 16 + 5, Cicon_up, sm(29), G.in_scr_scr2 > 0 ? 1 : 0)) {
						G.in_scr_scr2 = G.in_scr_scr2 - 1;
					}
					if (gui_ibutton(742, 542 - 37, Cicon_down, sm(30), i === 0 ? 1 : 0)) {
						G.in_scr_scr2 = G.in_scr_scr2 + 1;
					}
					if (G.in_mzs > 0 && G.in_scr_scr2 > 0) G.in_scr_scr2 = G.in_scr_scr2 - 1;
					if (G.in_mzs < 0 && i === 0) G.in_scr_scr2 = G.in_scr_scr2 + 1;

					G.in_scr_scr2 = gui_scrollbar(742, 221, 537 - 221 - 37, G.tmp_lines, G.in_scr_scr2, 19);

					//Close
					if (gui_ibutton(742, 542, Cicon_x, sm(15))) G.m_menu = 0;
					break;

				//Loadgame
				case Cmenu_if_loadgame:
					DrawImage(G.gfx_icons, 236, 5, Cicon_load);
					bmpf_txt(236 + 37, 10, sm(154));

					//List Savegames
					Color(0, 0, 0);
					Rect(236, 195, 500, 379, 1);
					i = 0;
					j = 0;
					y = 0;
					for (Tsg_ = First(Tsg); Tsg_ !== null; Tsg_ = After(Tsg, Tsg_)) {
						j = j + 1;
						if (j > G.in_scr_scr) {
							if (gui_opt(236 + 5, 200 + i * 20, Tsg_.name, j, 0)) {
								load_map_header('saves\\' + Tsg_.name + '.sav');
							}
							i = i + 1;
							if (i > 18) break;
						}
					}

					//Scroll
					if (gui_ibutton(742, 200, Cicon_up, sm(29), G.in_scr_scr > 0 ? 1 : 0)) {
						G.in_scr_scr = G.in_scr_scr - 1;
					}
					if (gui_ibutton(742, 542 - 37 - 37, Cicon_down, sm(30), i > 18 ? 1 : 0)) {
						G.in_scr_scr = G.in_scr_scr + 1;
					}
					if (G.in_mzs > 0 && G.in_scr_scr > 0) G.in_scr_scr = G.in_scr_scr - 1;
					if (G.in_mzs < 0 && i > 18) G.in_scr_scr = G.in_scr_scr + 1;

					c = 0;
					for (Tsg_ = First(Tsg); Tsg_ !== null; Tsg_ = After(Tsg, Tsg_)) {
						c = c + 1;
					}
					G.in_scr_scr = gui_scrollbar(742, 237, 500 - 237 - 37, c, G.in_scr_scr, 19);

					//Determine & Show
					loadtemp = '';
					i = 0;
					for (Tsg_ = First(Tsg); Tsg_ !== null; Tsg_ = After(Tsg, Tsg_)) {
						i = i + 1;
						if (i === G.in_opt[0]) {
							loadtemp = Tsg_.name;
							break;
						}
					}
					if (loadtemp === '') {
						Color(0, 0, 0);
						Rect(236, 63, 96, 72, 1);
						bmpf_txt(336, 63, sm(156), Cbmpf_red);
					} else {
						DrawBlock(G.map_image, 236, 63);
						bmpf_txt(336, 63, sm(157) + ':');
						bmpf_txt(450, 63, loadtemp);
						bmpf_txt(336, 83, sm(158) + ':');
						bmpf_txt(450, 83, G.sg_date);
						bmpf_txt(336, 103, sm(35) + ':');
						bmpf_txt(450, 103, G.sg_time + ' ' + sm(36));
					}

					//Delete
					if (gui_ibutton(742, 542 - 37, Cicon_x, sm(189), loadtemp !== '' ? 1 : 0)) {
						if (await gui_msgdecide(ss(sm(190), loadtemp), Cbmpf_red, sm(2), sm(1))) {
							DeleteFile('saves\\' + loadtemp + '.sav');
							load_savegames();
							G.in_scr_scr = 0;
						}
					}

					//Load
					if (gui_ibutton(742, 542, Cicon_load, sm(154), loadtemp !== '' ? 1 : 0)) {
						await load_map('saves\\' + loadtemp + '.sav', '');
						G.m_menu = 0;
						G.set_debug_testmap = 0;
					}
					break;

				//Savegame
				case Cmenu_if_savegame:
					DrawImage(G.gfx_icons, 236, 5, Cicon_save);
					bmpf_txt(236 + 37, 10, sm(155));

					//Input
					bmpf_txt(236, 150, sm(157) + ':');
					gui_input(236, 170, 320, 0);

					//Scan by Input
					i = 0;
					matched = 0;
					for (Tsg_ = First(Tsg); Tsg_ !== null; Tsg_ = After(Tsg, Tsg_)) {
						i = i + 1;
						if (Tsg_.name === G.in_input[0]) {
							matched = 1;
							if (G.in_opt[0] !== i) {
								G.in_opt[0] = i;
								load_map_header('saves\\' + Tsg_.name + '.sav');
							}
						}
					}
					if (matched === 0) {
						G.in_opt[0] = 0;
					}

					//List Savegames
					Color(0, 0, 0);
					Rect(236, 195, 500, 379, 1);
					i = 0;
					j = 0;
					y = 0;
					for (Tsg_ = First(Tsg); Tsg_ !== null; Tsg_ = After(Tsg, Tsg_)) {
						j = j + 1;
						if (j > G.in_scr_scr) {
							if (gui_opt(236 + 5, 200 + i * 20, Tsg_.name, j, 0)) {
								load_map_header('saves\\' + Tsg_.name + '.sav');
								G.in_input[0] = Tsg_.name;
							}
							i = i + 1;
							if (i > 18) break;
						}
					}

					//Scroll
					if (gui_ibutton(742, 200, Cicon_up, sm(29), G.in_scr_scr > 0 ? 1 : 0)) {
						G.in_scr_scr = G.in_scr_scr - 1;
					}
					if (gui_ibutton(742, 542 - 37 - 37, Cicon_down, sm(30), i > 18 ? 1 : 0)) {
						G.in_scr_scr = G.in_scr_scr + 1;
					}
					if (G.in_mzs > 0 && G.in_scr_scr > 0) G.in_scr_scr = G.in_scr_scr - 1;
					if (G.in_mzs < 0 && i > 18) G.in_scr_scr = G.in_scr_scr + 1;

					c = 0;
					for (Tsg_ = First(Tsg); Tsg_ !== null; Tsg_ = After(Tsg, Tsg_)) {
						c = c + 1;
					}
					G.in_scr_scr = gui_scrollbar(742, 237, 500 - 237 - 37, c, G.in_scr_scr, 19);

					//Determine & Show
					loadtemp = '';
					i = 0;
					for (Tsg_ = First(Tsg); Tsg_ !== null; Tsg_ = After(Tsg, Tsg_)) {
						i = i + 1;
						if (i === G.in_opt[0]) {
							loadtemp = Tsg_.name;
							break;
						}
					}
					if (loadtemp === '') {
						loadtemp = G.in_input[0];
						Color(0, 0, 0);
						Rect(236, 63, 96, 72, 1);
						bmpf_txt(336, 63, sm(157) + ':');
						bmpf_txt(450, 63, loadtemp, Cbmpf_over);
						bmpf_txt(336, 83, sm(158) + ':');
						bmpf_txt(450, 83, CurrentDate());
						bmpf_txt(336, 103, sm(35) + ':');
						bmpf_txt(450, 103, CurrentTime() + ' ' + sm(36));
					} else {
						DrawBlock(G.map_image, 236, 63);
						bmpf_txt(336, 63, sm(157) + ':');
						bmpf_txt(450, 63, loadtemp);
						bmpf_txt(336, 83, sm(158) + ':');
						bmpf_txt(450, 83, G.sg_date);
						bmpf_txt(336, 103, sm(35) + ':');
						bmpf_txt(450, 103, G.sg_time + ' ' + sm(36));
					}

					//Delete
					if (gui_ibutton(742, 542 - 37, Cicon_x, sm(189), G.in_opt[0] !== 0 ? 1 : 0)) {
						if (await gui_msgdecide(ss(sm(190), loadtemp), Cbmpf_red, sm(2), sm(1))) {
							DeleteFile('saves\\' + loadtemp + '.sav');
							load_savegames();
							G.in_scr_scr = 0;
						}
					}

					//Save
					if (gui_ibutton(742, 542, Cicon_save, sm(155), loadtemp !== '' ? 1 : 0)) {
						await save_map('saves\\' + loadtemp + '.sav', 'sav', '');
						G.m_menu = 0;
					}
					break;

				//Messagebox
				case Cmenu_if_msg:
					DrawImage(G.gfx_icons, 236, 5, Cicon_dialog);
					bmpf_txt(236 + 37, 10, G.in_msgtitle);

					//Script Buttons
					btc = 0;
					for (i = 0; i <= 9; i++) {
						if (G.in_sb[i] === 1) btc = btc + 1;
					}

					//Text
					i = bmpf_txt_rect(236, 63, 480, 500 - btc * 37, G.in_msgtext, Cbmpf_norm, G.in_scr_scr);
					if (btc > 0) btc = btc - 1;

					//Scroll
					if (gui_ibutton(742, 63, Cicon_up, sm(29), G.in_scr_scr > 0 ? 1 : 0)) {
						G.in_scr_scr = G.in_scr_scr - 1;
					}
					if (gui_ibutton(742, 542 - btc * 37, Cicon_down, sm(30), i === 0 ? 1 : 0)) {
						G.in_scr_scr = G.in_scr_scr + 1;
					}

					if (G.in_mzs > 0 && G.in_scr_scr > 0) G.in_scr_scr = G.in_scr_scr - 1;
					if (G.in_mzs < 0 && i === 0) G.in_scr_scr = G.in_scr_scr + 1;
					G.in_scr_scr = gui_scrollbar(742, 63 + 37, 542 - btc * 37 - 63 - 42, G.tmp_lines, G.in_scr_scr, G.tmp_linesvisible);

					//Buttons
					y = 542 - btc * 37;
					for (i = 0; i <= 9; i++) {
						if (G.in_sb[i] === 1) {
							//Frame Button
							if (G.in_sb_icon[i] > -1) {
								if (gui_ibutton(236, y, G.in_sb_icon[i], G.in_sb_txt[i])) {
									if (parse_isevent(G.in_sb_scr[i])) {
										parse_globalevent(G.in_sb_scr[i], 'Script Button Click');
									} else {
										parse_task(0, 0, 'click', 'Script Button Click', G.in_sb_scr[i]);
									}
								}
								//Image Button
							} else {
								if (gui_ibuttona(236, y, G.in_sb_handle[i], G.in_sb_txt[i])) {
									if (parse_isevent(G.in_sb_scr[i])) {
										parse_globalevent(G.in_sb_scr[i], 'Script Button Click');
									} else {
										parse_task(0, 0, 'click', 'Script Button Click', G.in_sb_scr[i]);
									}
								}
							}
							bmpf_txt(236 + 40, y + 7, G.in_sb_txt[i], 0);
							y = y + 37;
						}
					}
					break;

				//Dialogue
				case Cmenu_if_dlg:
					DrawImage(G.gfx_icons, 236, 5, Cicon_dialog);
					bmpf_txt(236 + 37, 10, G.in_msgtitle);

					//Dialogue Buttons
					btc = 0;
					for (i = 0; i <= 9; i++) {
						if (G.in_sb[i] === 1) btc = btc + 1;
					}

					//Text / Trade
					tradec = 0;
					for (Trd = First(Ttrade); Trd !== null; Trd = After(Ttrade, Trd)) {
						if (Trd.id > tradec) tradec = Trd.id;
					}
					if (tradec === 0) {
						//Text
						i = bmpf_txt_rect(236, 63, 480, 500 - btc * 37, G.in_msgtext, Cbmpf_norm, G.in_scr_scr);
					} else {
						//Trade
						i = 1;
						y = 63;
						x = 236;
						for (Trd = First(Ttrade); Trd !== null; Trd = After(Ttrade, Trd)) {
							if (Trd.mode === 0) {
								if (Trd.id > G.in_scr_scr) {
									//Sells
									c = 0;
									for (Trd2 = First(Ttrade); Trd2 !== null; Trd2 = After(Ttrade, Trd2)) {
										if (Trd2.id === Trd.id && Trd2.mode === 1) c = c + 1;
									}
									x = 236;
									for (Trd2 = First(Ttrade); Trd2 !== null; Trd2 = After(Ttrade, Trd2)) {
										if (Trd2.id === Trd.id) {
											if (Trd2.mode === 1) {
												DrawBlock(G.gfx_if_itemback, x, y);
												DrawImage(Ditem_iconh(Trd2.typ), x, y);

												exc = countstored_items(Cclass_unit, G.g_player, Trd2.typ);
												if (exc >= Trd2.count) {
													gui_iconboxc(x, y, Trd2.count, 1);
												} else {
													if (G.in_cursor) gui_iconboxc(x, y, Trd2.count, 1, 1);
												}

												//Tooltip
												if (G.in_mx >= x && G.in_mx <= x + 40) {
													if (G.in_my >= y && G.in_my <= y + 40) {
														gui_tt(G.in_mx, G.in_my, ss(sm(203), Str(Trd2.count), Ditem_name(Trd2.typ), Str(exc)));
													}
												}

												x = x + 45;
											}
										}
									}
									//Buys
									c = 0;
									for (Trd2 = First(Ttrade); Trd2 !== null; Trd2 = After(Ttrade, Trd2)) {
										if (Trd2.id === Trd.id && Trd2.mode === 2) c = c + 1;
									}
									x = 236 + 500 - 40;
									for (Trd2 = First(Ttrade); Trd2 !== null; Trd2 = After(Ttrade, Trd2)) {
										if (Trd2.id === Trd.id) {
											if (Trd2.mode === 2) {
												DrawBlock(G.gfx_if_itemback, x, y);
												DrawImage(Ditem_iconh(Trd2.typ), x, y);
												gui_iconboxc(x, y, Trd2.count, 1);

												//Tooltip
												if (G.in_mx >= x && G.in_mx <= x + 40) {
													if (G.in_my >= y && G.in_my <= y + 40) {
														exc = countstored_items(Cclass_unit, G.g_player, Trd2.typ);
														gui_tt(G.in_mx, G.in_my, ss(sm(204), Str(Trd2.count), Ditem_name(Trd2.typ), Str(exc)));
													}
												}

												x = x - 45;
											}
										}
									}
									//Over / Click
									over = 0;
									if (G.in_mx >= 236 && G.in_mx <= 236 + 500) {
										if (G.in_my >= y && G.in_my <= y + 40) {
											over = 1;
										}
									}
									if (over === 0) {
										DrawImage(G.gfx_icons_passive, 236 + 250 - 16, y + 4, Cicon_right);
									} else {
										DrawImage(G.gfx_icons, 236 + 250 - 16, y + 4, Cicon_right);
										if (G.in_mrelease[1]) {
											play(G.sfx_click);
											over = 1;
											//Check Sell Conditions
											for (Trd2 = First(Ttrade); Trd2 !== null; Trd2 = After(Ttrade, Trd2)) {
												if (Trd2.id === Trd.id) {
													if (Trd2.mode === 1) {
														if (countstored_items(Cclass_unit, G.g_player, Trd2.typ) < Trd2.count) {
															over = 0;
															break;
														}
													}
												}
											}
											//Trade?
											if (over === 1) {
												//TRADE OKAY!
												speech('positive');
												//Free Sells
												for (Trd2 = First(Ttrade); Trd2 !== null; Trd2 = After(Ttrade, Trd2)) {
													if (Trd2.id === Trd.id) {
														if (Trd2.mode === 1) {
															if (get_stored_item(Trd2.typ, Cclass_unit, G.g_player)) {
																free_item(G.TCitem!.id, Trd2.count);
															}
														}
													}
												}
												//Get Buys
												for (Trd2 = First(Ttrade); Trd2 !== null; Trd2 = After(Ttrade, Trd2)) {
													if (Trd2.id === Trd.id) {
														if (Trd2.mode === 2) {
															if (set_item(-1, Trd2.typ, EntityX(G.cam), EntityY(G.cam), EntityZ(G.cam), Trd2.count) >= 0) {
																store_item(G.TCitem!.id, Cclass_unit, G.g_player);
															}
														}
													}
												}
											} else {
												//TRADE FAILED!
												speech('negative');
											}
										}
									}
									//Y Offset
									y = y + 50;
									if (y > 542 - btc * 37) {
										if (Trd.id < tradec) i = 0;
										break;
									}
								}
							}
						}
					}
					if (btc > 0) btc = btc - 1;

					//Scroll
					if (gui_ibutton(742, 63, Cicon_up, sm(29), G.in_scr_scr > 0 ? 1 : 0)) {
						G.in_scr_scr = G.in_scr_scr - 1;
					}
					if (gui_ibutton(742, 542 - btc * 37, Cicon_down, sm(30), i === 0 ? 1 : 0)) {
						G.in_scr_scr = G.in_scr_scr + 1;
					}

					if (G.in_mzs > 0 && G.in_scr_scr > 0) G.in_scr_scr = G.in_scr_scr - 1;
					if (G.in_mzs < 0 && i === 0) G.in_scr_scr = G.in_scr_scr + 1;
					i = 0;
					y = 63;
					for (;;) {
						i = i + 1;
						y = y + 50;
						if (y > 542 - btc * 37) break;
					}
					G.in_scr_scr = gui_scrollbar(742, 63 + 37, 542 - btc * 37 - 63 - 42, tradec, G.in_scr_scr, i);

					//Buttons
					y = 542 - btc * 37;
					for (i = 0; i <= 9; i++) {
						if (G.in_sb[i] === 1) {
							//Frame Button
							if (G.in_sb_icon[i] > -1) {
								if (gui_ibutton(236, y, G.in_sb_icon[i], G.in_sb_txt[i])) {
									parse_dialogue(G.in_sb_scr[i]);
								}
								//Image Button
							} else {
								if (gui_ibuttona(236, y, G.in_sb_handle[i], G.in_sb_txt[i])) {
									parse_dialogue(G.in_sb_scr[i]);
								}
							}
							bmpf_txt(236 + 40, y + 7, G.in_sb_txt[i], 0);
							y = y + 37;
						}
					}
					break;

				//Build
				case Cmenu_if_build:
					DrawImage(G.gfx_icons, 236, 5, Cicon_build);
					bmpf_txt(236 + 37, 10, sm(159));

					x = 0;
					y = 0;
					j = 0;
					selcount = 0;

					buildings = 0;
					buildingsvisible = 0;
					groups = 0;
					totalbuildings = 0;

					//Count Groups
					for (grp = First(Tgroup); grp !== null; grp = After(Tgroup, grp)) {
						if (grp.class === Cclass_building) {
							groups = groups + 1;
						}
					}

					//Groups - Group Selection / Group List
					if (groups > 0) {
						//Group Selection
						if (G.in_buildg === '') {
							//List Groups
							y = 63;
							totalbuildings = 0;
							for (grp = First(Tgroup); grp !== null; grp = After(Tgroup, grp)) {
								if (grp.class === Cclass_building) {
									//Count Buildings in Group
									buildings = 0;
									for (Tbui_ = First(Tbui); Tbui_ !== null; Tbui_ = After(Tbui, Tbui_)) {
										if (Tbui_.mode === 2) {
											if (Tbui_.group === grp.group) {
												//Locked?
												locked = 0;
												for (Tx_ = First(Tx); Tx_ !== null; Tx_ = After(Tx, Tx_)) {
													if (Tx_.mode === 3) {
														if (Tx_.key === Str(Tbui_.id)) {
															locked = 1;
															break;
														}
													}
												}
												//Only Show when unlocked!
												if (locked === 0) {
													buildings = buildings + 1;
												}
											}
										}
									}
									//Display
									if (G.game_showemptybuildinggroups === 1) {
										if (gui_ibutton(236, y, Cicon_right, grp.name, buildings > 0 ? 1 : 0)) {
											G.in_buildg = grp.group;
										}
										if (buildings > 0) {
											bmpf_txt(236 + 40, y + 7, grp.name + ' (' + Str(buildings) + ')', 0);
										} else {
											bmpf_txt(236 + 40, y + 7, grp.name + ' (0)', Cbmpf_dark);
										}
										y = y + 37;
										totalbuildings = totalbuildings + buildings;
									} else {
										if (buildings > 0) {
											if (gui_ibutton(236, y, Cicon_right, grp.name, buildings > 0 ? 1 : 0)) {
												G.in_buildg = grp.group;
											}
											bmpf_txt(236 + 40, y + 7, grp.name + ' (' + Str(buildings) + ')', 0);
											y = y + 37;
											totalbuildings = totalbuildings + buildings;
										}
									}
								}
							}

							//No Buildings?
							if (totalbuildings === 0) {
								bmpf_txt(236, y + 20, sm(160), Cbmpf_red);
							}

							//List
						} else {
							//Count Buildings
							for (Tbui_ = First(Tbui); Tbui_ !== null; Tbui_ = After(Tbui, Tbui_)) {
								if (Tbui_.mode === 2) {
									if (Tbui_.group === G.in_buildg) {
										//Locked?
										locked = 0;
										for (Tx_ = First(Tx); Tx_ !== null; Tx_ = After(Tx, Tx_)) {
											if (Tx_.mode === 3) {
												if (Tx_.key === Str(Tbui_.id)) {
													locked = 1;
													break;
												}
											}
										}
										//Only Show when unlocked!
										if (locked === 0) {
											buildings = buildings + 1;
										}
									}
								}
							}

							//List Buildings
							for (Tbui_ = First(Tbui); Tbui_ !== null; Tbui_ = After(Tbui, Tbui_)) {
								if (Tbui_.mode === 2) {
									if (Tbui_.group === G.in_buildg) {
										//Locked?
										locked = 0;
										for (Tx_ = First(Tx); Tx_ !== null; Tx_ = After(Tx, Tx_)) {
											if (Tx_.mode === 3) {
												if (Tx_.key === Str(Tbui_.id)) {
													locked = 1;
													break;
												}
											}
										}
										//Only Show when unlocked!
										if (locked === 0) {
											j = j + 1;
											if (j > G.in_scr_scr) {
												buildingsvisible = buildingsvisible + 1;
												//Building Stuff
												typ = Tbui_.typ;
												id = Tbui_.id;
												DrawBlock(G.gfx_if_itemback, 236, 63 + y);
												starty = y;
												//List required Items
												x = 0;
												for (Tbuireq = First(Tbui); Tbuireq !== null; Tbuireq = After(Tbui, Tbuireq)) {
													if (Tbuireq.id === Tbui_.id) {
														if (Tbuireq.mode === 0) {
															DrawBlock(G.gfx_if_itemback, 436 + x, 63 + y);
															DrawImage(Ditem_iconh(Tbuireq.typ), 436 + x, 63 + y);
															gui_iconboxc(436 + x, 63 + y, Tbuireq.count);
															x = x + 45;
															if (x >= 270) {
																x = 0;
																y = y + 45;
																if (y >= 470) break;
															}
														}
													}
												}
												//Over?
												over = 0;
												if (G.in_mx >= 236) {
													if (G.in_mx <= 738) {
														if (G.in_my >= 63 + starty) {
															if (G.in_my <= y + 45 + 63) {
																over = 1;
																if (typ > 0) {
																	gui_tt(G.in_mx, G.in_my, ss(sm(161), Dobject_name(typ)));
																} else {
																	gui_tt(G.in_mx, G.in_my, ss(sm(161), Dunit_name(Abs(typ))));
																}
																if (G.in_mrelease[1]) {
																	G.in_buildg = '';
																	game_buildsetup_start(typ);
																}
															}
														}
													}
												}
												if (G.set_debug === 1) {
													Color(100, 100, 100);
													Rect(236, 63 + starty, 738 - 236, y + 45 + 63 - (63 + starty), 0);
												}
												//Object (Positive Type)
												if (typ > 0) {
													gui_iconbox(236, 63 + starty, Dobject_iconh(typ), ss(sm(161), Dobject_name(typ)), 0);
													//bmpf_txt(236+45,63+5+starty,Dobject_name$(typ),over)
													bmpf_txt_rect(236 + 45, 63 + starty, 150, 50, Dobject_name(typ), over);
													//Unit (Negative Type)
												} else {
													gui_iconbox(236, 63 + starty, Dunit_iconh(Abs(typ)), ss(sm(161), Dunit_name(Abs(typ))), 0);
													//bmpf_txt(236+45,63+5+starty,Dunit_name$(Abs(typ)),over)
													bmpf_txt_rect(236 + 45, 63 + starty, 150, 50, Dunit_name(Abs(typ)), over);
												}
												//Position Stuff
												y = y + 50;
												if (y >= 470) break;
											}
										}
									}
								}
							}

							//Return Button
							if (gui_ibutton(236, 63 + y, Cicon_left, sm(131))) {
								G.in_buildg = '';
							}

							//Scroll
							if (gui_ibutton(742, 63, Cicon_up, sm(29), G.in_scr_scr > 0 ? 1 : 0)) {
								G.in_scr_scr = G.in_scr_scr - 1;
								if (G.in_scr_scr < 0) G.in_scr_scr = 0;
							}
							if (gui_ibutton(742, 542, Cicon_down, sm(30), G.in_scr_scr <= buildings - 9 ? 1 : 0)) {
								G.in_scr_scr = G.in_scr_scr + 1;
							}

							if (G.in_mzs > 0 && G.in_scr_scr > 0) G.in_scr_scr = G.in_scr_scr - 1;
							if (G.in_mzs < 0 && G.in_scr_scr <= buildings - 9) G.in_scr_scr = G.in_scr_scr + 1;
							G.in_scr_scr = gui_scrollbar(742, 63 + 37, 542 - 63 - 42, buildings, G.in_scr_scr, 9);
						}

						//No Groups - Old Building Menu
					} else {
						//Count Buildings
						for (Tbui_ = First(Tbui); Tbui_ !== null; Tbui_ = After(Tbui, Tbui_)) {
							if (Tbui_.mode === 2) {
								//Locked?
								locked = 0;
								for (Tx_ = First(Tx); Tx_ !== null; Tx_ = After(Tx, Tx_)) {
									if (Tx_.mode === 3) {
										if (Tx_.key === Str(Tbui_.id)) {
											locked = 1;
											break;
										}
									}
								}
								//Only Show when unlocked!
								if (locked === 0) {
									buildings = buildings + 1;
								}
							}
						}

						//List Buildings
						for (Tbui_ = First(Tbui); Tbui_ !== null; Tbui_ = After(Tbui, Tbui_)) {
							if (Tbui_.mode === 2) {
								//Locked?
								locked = 0;
								for (Tx_ = First(Tx); Tx_ !== null; Tx_ = After(Tx, Tx_)) {
									if (Tx_.mode === 3) {
										if (Tx_.key === Str(Tbui_.id)) {
											locked = 1;
											break;
										}
									}
								}
								//Only Show when unlocked!
								if (locked === 0) {
									j = j + 1;
									if (j > G.in_scr_scr) {
										buildingsvisible = buildingsvisible + 1;
										//Building Stuff
										typ = Tbui_.typ;
										id = Tbui_.id;
										DrawBlock(G.gfx_if_itemback, 236, 63 + y);
										starty = y;
										//List required Items
										x = 0;
										for (Tbuireq = First(Tbui); Tbuireq !== null; Tbuireq = After(Tbui, Tbuireq)) {
											if (Tbuireq.id === Tbui_.id) {
												if (Tbuireq.mode === 0) {
													DrawBlock(G.gfx_if_itemback, 436 + x, 63 + y);
													DrawImage(Ditem_iconh(Tbuireq.typ), 436 + x, 63 + y);
													gui_iconboxc(436 + x, 63 + y, Tbuireq.count);
													x = x + 45;
													if (x >= 270) {
														x = 0;
														y = y + 45;
														if (y >= 470) break;
													}
												}
											}
										}
										//Over?
										over = 0;
										if (G.in_mx >= 236) {
											if (G.in_mx <= 738) {
												if (G.in_my >= 63 + starty) {
													if (G.in_my <= y + 45 + 63) {
														over = 1;
														if (typ > 0) {
															gui_tt(G.in_mx, G.in_my, ss(sm(161), Dobject_name(typ)));
														} else {
															gui_tt(G.in_mx, G.in_my, ss(sm(161), Dunit_name(Abs(typ))));
														}
														if (G.in_mrelease[1]) {
															game_buildsetup_start(typ);
														}
													}
												}
											}
										}
										if (G.set_debug === 1) {
											Color(100, 100, 100);
											Rect(236, 63 + starty, 738 - 236, y + 45 + 63 - (63 + starty), 0);
										}
										//Object (Positive Type)
										if (typ > 0) {
											gui_iconbox(236, 63 + starty, Dobject_iconh(typ), ss(sm(161), Dobject_name(typ)), 0);
											//bmpf_txt(236+45,63+5+starty,Dobject_name$(typ),over)
											bmpf_txt_rect(236 + 45, 63 + starty, 150, 50, Dobject_name(typ), over);
											//Unit (Negative Type)
										} else {
											gui_iconbox(236, 63 + starty, Dunit_iconh(Abs(typ)), ss(sm(161), Dunit_name(Abs(typ))), 0);
											//bmpf_txt(236+45,63+5+starty,Dunit_name$(Abs(typ)),over)
											bmpf_txt_rect(236 + 45, 63 + starty, 150, 50, Dunit_name(Abs(typ)), over);
										}
										//Position Stuff
										y = y + 50;
										if (y >= 470) break;
									}
								}
							}
						}

						//Scroll
						if (gui_ibutton(742, 63, Cicon_up, sm(29), G.in_scr_scr > 0 ? 1 : 0)) {
							G.in_scr_scr = G.in_scr_scr - 1;
							if (G.in_scr_scr < 0) G.in_scr_scr = 0;
						}
						if (gui_ibutton(742, 542, Cicon_down, sm(30), G.in_scr_scr <= buildings - 9 ? 1 : 0)) {
							G.in_scr_scr = G.in_scr_scr + 1;
						}

						if (G.in_mzs > 0 && G.in_scr_scr > 0) G.in_scr_scr = G.in_scr_scr - 1;
						if (G.in_mzs < 0 && G.in_scr_scr <= buildings - 9) G.in_scr_scr = G.in_scr_scr + 1;
						G.in_scr_scr = gui_scrollbar(742, 63 + 37, 542 - 63 - 42, buildings, G.in_scr_scr, 9);

						//No Buildings?
						if (j === 0) {
							bmpf_txt(236, 63, sm(160), Cbmpf_red);
						}
					}
					break;

				//Combine
				case Cmenu_if_combine:
					DrawImage(G.gfx_icons, 236, 5, Cicon_inc);
					bmpf_txt(236 + 37, 10, sm(152));

					x = 0;
					y = 0;
					j = 0;
					gentyp = 0;

					for (Tcom_ = First(Tcom); Tcom_ !== null; Tcom_ = After(Tcom, Tcom_)) {
						if (Tcom_.gid === G.in_combi_gid) {
							j = j + 1;
							if (j > G.in_scr_scr) {
								//Locked?
								locked = 0;
								for (Tx_ = First(Tx); Tx_ !== null; Tx_ = After(Tx, Tx_)) {
									if (Tx_.mode === 50) {
										if (Tx_.key === Tcom_.aid) {
											locked = 1;
											break;
										}
									}
								}

								//Gen
								x = 0;
								c = 0;
								if (Tcom_.genname === '') {
									for (Tgen = First(Tcom); Tgen !== null; Tgen = After(Tcom, Tgen)) {
										if (Tgen.id === Tcom_.id) {
											if (Tgen.mode === 1) {
												//Draw
												DrawBlock(G.gfx_if_itemback, 236 + x, 83 + y);
												DrawImage(Ditem_iconh(Tgen.typ), 236 + x, 83 + y);
												// quirk: the count is drawn at 63+y, 20 pixels above its icon (83+y)
												gui_iconboxc(236 + x, 63 + y, Tgen.count);
												x = x + 45;
												c = c + 1;
												if (c === 1) gentyp = Tgen.typ;
											}
										}
									}
									txt = '';
									for (Tgen = First(Tcom); Tgen !== null; Tgen = After(Tcom, Tgen)) {
										if (Tgen.id === Tcom_.id) {
											if (Tgen.mode === 1) {
												if (txt === '') {
													txt = Ditem_name(Tgen.typ);
												} else {
													txt = txt + ', ' + Ditem_name(Tgen.typ);
												}
											}
										}
									}
								} else {
									txt = Tcom_.genname;
									DrawBlock(G.gfx_if_itemback, 236 + x, 83 + y);
									DrawImage(G.gfx_icons, 236 + x + 4, 83 + y + 4, Cicon_options);
									x = x + 45;
									c = 999;
								}

								//Over?
								over = 0;
								if (G.in_mx >= 236) {
									if (G.in_mx <= 738) {
										if (G.in_my >= 83 + y) {
											if (G.in_my <= 83 + y + 55) {
												over = 1;
												if (c === 999) {
													gui_tt(G.in_mx, G.in_my, txt);
												} else {
													gui_tt(G.in_mx, G.in_my, ss(sm(199), txt));
												}
												if (G.in_mrelease[1]) {
													combine_item(Cclass_unit, G.g_player, Tcom_.id);
												}
											}
										}
									}
								}

								//Text
								if (c > 0) {
									if (locked === 0) {
										bmpf_txt_rect(236 + x, 83 + y, 150, 50, txt, over);
									} else {
										bmpf_txt_rect(236 + x, 83 + y, 150, 50, txt, Cbmpf_red);
									}
								}

								//Req
								x = 0;
								for (Treq = First(Tcom); Treq !== null; Treq = After(Tcom, Treq)) {
									if (Treq.id === Tcom_.id) {
										if (Treq.mode === 0) {
											exc = countstored_items(Cclass_unit, G.g_player, Treq.typ);

											//Draw
											DrawBlock(G.gfx_if_itemback, 436 + x, 83 + y);
											DrawImage(Ditem_iconh(Treq.typ), 436 + x, 83 + y);

											if (exc >= Treq.count) {
												gui_iconboxc(436 + x, 83 + y, Treq.count, 1);
											} else {
												if (G.in_cursor) gui_iconboxc(436 + x, 83 + y, Treq.count, 1, 1);
											}

											//Counts
											if (y === 0) {
												if (exc === 0) {
													bmpf_txt_c(436 + x + 20, 63 + y, '0', Cbmpf_red);
												} else {
													bmpf_txt_c(436 + x + 20, 63 + y, Str(exc), 0);
												}
											}
											x = x + 45;
										}
									}
								}

								//Count
								if (c === 1) {
									exc = countstored_items(Cclass_unit, G.g_player, gentyp);
									if (exc === 0) {
										bmpf_txt_r(742 - 20, 83 + y, '0', Cbmpf_red);
									} else {
										bmpf_txt_r(742 - 20, 83 + y, Str(exc), over);
									}
								} else {
									bmpf_txt_r(742 - 20, 83 + y, '-', over);
								}

								//Locked
								if (locked === 1) {
									if (G.in_cursor) bmpf_txt(438, 83 + y, sm(200), Cbmpf_red);
								}

								//Position Stuff
								y = y + 55;
								if (y >= 470) break;
							}
						}
					}

					//Return Button
					if (gui_ibutton(236, 83 + y, Cicon_left, sm(142))) {
						G.m_menu = Cmenu_if_items;
						if_unselectitems();
						G.in_scr_scr = 0;
					}

					//Messages
					msgy = 600 - 50;
					for (Tmsg_ = First(Tmsg); Tmsg_ !== null; Tmsg_ = After(Tmsg, Tmsg_)) {
						if (G.ms - Tmsg_.age > 0) {
							Delete(Tmsg, Tmsg_);
						} else {
							bmpf_txt(236, msgy, Tmsg_.msg, Tmsg_.col);
							msgy = msgy - 20;
							if (msgy < 63) break;
						}
					}

					//Scroll
					if (gui_ibutton(742, 63, Cicon_up, sm(29), G.in_scr_scr > 0 ? 1 : 0)) {
						G.in_scr_scr = G.in_scr_scr - 1;
						if (G.in_scr_scr < 0) G.in_scr_scr = 0;
					}
					if (gui_ibutton(742, 542, Cicon_down, sm(30), y >= 225 ? 1 : 0)) {
						G.in_scr_scr = G.in_scr_scr + 1;
					}
					break;

				//Search
				case Cmenu_if_find:
					DrawImage(G.gfx_icons, 236, 5, Cicon_zoom);
					bmpf_txt(236 + 37, 10, 'Suchen');

					typ = Int(G.in_input[0]);

					//Icon
					DrawBlock(G.gfx_if_itemback, 236, 63);
					DrawImage(Dobject_iconh(typ), 236, 63);
					//Name
					bmpf_txt(236 + 45, 63, Dobject_name(typ), Cbmpf_norm);
					//Health
					if (con_object(Int(G.in_input[1]))) {
						gui_healthbar(236 + 45, 63 + 20, G.TCobject!.health, G.TCobject!.health_max);
					}

					DrawImage(G.gfx_winbar, 215, 108);

					y = 40 + 5 + 16 + 5;

					for (Tfind_ = First(Tfind); Tfind_ !== null; Tfind_ = After(Tfind, Tfind_)) {
						if (Tfind_.parent === typ) {
							//Icon
							DrawBlock(G.gfx_if_itemback, 236, 63 + y);
							if (gui_iconbox(236, 63 + y, Ditem_iconh(Tfind_.typ), 'Nach ' + Ditem_name(Tfind_.typ) + ' suchen', 0)) {
								search_object(Int(G.in_input[1]), Tfind_.typ);
							}
							//Name
							bmpf_txt(236 + 45, 63 + 5 + y, Ditem_name(Tfind_.typ), Cbmpf_norm);

							//Frequency
							if (Tfind_.ratio > 90) {
								bmpf_txt(550, 63 + 5 + y, 'sehr haeufig', Cbmpf_green);
							} else if (Tfind_.ratio > 70) {
								bmpf_txt(550, 63 + 5 + y, 'haeufig', Cbmpf_green);
							} else if (Tfind_.ratio > 30) {
								bmpf_txt(550, 63 + 5 + y, 'normal', Cbmpf_yellow);
							} else if (Tfind_.ratio > 10) {
								bmpf_txt(550, 63 + 5 + y, 'selten', Cbmpf_red);
							} else {
								bmpf_txt(550, 63 + 5 + y, 'sehr selten', Cbmpf_red);
							}

							//Position Stuff
							y = y + 55;
							if (y >= 470) break;
						}
					}
					break;

				//Exchange
				case Cmenu_if_exchange:
					DrawImage(G.gfx_icons, 236, 5, Cicon_bag);
					switch (G.in_ex_class) {
						case Cclass_object:
							if (con_object(G.in_ex_id)) {
								bmpf_txt(236 + 37, 10, ss(sm(202), Dobject_name(G.TCobject!.typ)));
							}
							break;
						case Cclass_unit:
							if (con_unit(G.in_ex_id)) {
								bmpf_txt(236 + 37, 10, ss(sm(202), Dunit_name(G.TCunit!.typ)));
							}
							break;
						default:
							bmpf_txt(236 + 37, 10, sm(201));
					}

					//List PLAYER Items
					for (x = 0; x <= 10; x++) {
						for (y = 0; y <= 4; y++) {
							DrawBlock(G.gfx_if_itemback, 236 + x * 45, 63 + y * 45);
						}
					}
					x = 0;
					y = 0;
					j = 0;
					restrictedex = 0;
					if (G.in_ex_only !== '') restrictedex = 1;
					for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
						if (Titem_.parent_class === Cclass_unit) {
							if (Titem_.parent_id === G.g_player) {
								j = j + 1;
								if (j > G.in_scr_scr) {
									//Iconbox
									typ = Titem_.typ;
									id = Titem_.id;
									if (gui_iconbox(236 + x, 63 + y, Ditem_iconh(typ), Ditem_name(typ), id === G.in_ex_sel ? 1 : 0)) {
										G.in_ex_sel = id;
									}
									//Drag and Drop
									if (gui_dndwatch(236 + x, 63 + y)) {
										G.in_dnd = 1;
										G.in_dnd_pivotx = G.in_mx - (236 + x);
										G.in_dnd_pivoty = G.in_my - (63 + y);
										G.in_dnd_src = 0;
										G.in_dnd_typ = typ;
										G.in_dnd_x = G.in_mx;
										G.in_dnd_y = G.in_my;
										G.in_dnd_show = 0;
									}
									//Restricted
									if (restrictedex === 1) {
										if (Instr(G.in_ex_only, '|' + Str(typ) + '|') === 0) {
											DrawBlock(G.gfx_if_itemback, 236 + x, 63 + y);
											if (Ditem_icondh(typ) === 0) Ditem_icondh.set(typ, makedark(Ditem_iconh(typ)));
											DrawImage(Ditem_icondh(typ), 236 + x, 63 + y);
											if (id === G.in_ex_sel) {
												Color(fabs(f32(255 * Sin(G.in_ca))), 0, 0);
												Rect(236 + x, 63 + y, 40, 40, 0);
											}
										}
									}
									//Iconcount
									gui_iconboxc(236 + x, 63 + y, Titem_.count);
									//Cache
									if (id === G.in_ex_sel) {
										G.TCitem = Titem_;
									}
									x = x + 45;
									if (x >= 495) {
										x = 0;
										y = y + 45;
										if (y >= 225) break;
									}
								}
							}
						}
					}

					//Player Scroll
					if (gui_ibutton(742, 63, Cicon_up, sm(29), G.in_scr_scr > 0 ? 1 : 0)) {
						G.in_scr_scr = G.in_scr_scr - 11;
						if (G.in_scr_scr < 0) G.in_scr_scr = 0;
					}
					if (gui_ibutton(742, 63 + 180 + 10, Cicon_down, sm(30), y >= 225 ? 1 : 0)) {
						G.in_scr_scr = G.in_scr_scr + 11;
					}

					//Player Inventory Capacy State
					x = 0;
					for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
						if (Titem_.parent_class === Cclass_unit) {
							if (Titem_.parent_id === G.g_player) {
								x = x + Ditem_weight(Titem_.typ) * Titem_.count;
							}
						}
					}
					total = Dunit_maxweight(1);
					bmpf_txt(236, 285, ss(sm(150), numsep(Str(x)), numsep(Str(total)), numsep(Str(total - x))), Cbmpf_tiny);

					perc = Int(f32(f32(x / total) * 100));
					DrawBlock(G.gfx_if_barback, 500, 289);
					DrawBlockRect(G.gfx_bars, 501, 290, 0, 0, 100 - perc, 5);

					//List OBJECT Items
					for (x = 0; x <= 10; x++) {
						for (y = 0; y <= 3; y++) {
							DrawBlock(G.gfx_if_itemback, 236 + x * 45, 347 + y * 45);
						}
					}
					x = 0;
					y = 0;
					j = 0;
					for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
						if (Titem_.parent_class === G.in_ex_class) {
							if (Titem_.parent_id === G.in_ex_id) {
								j = j + 1;
								if (j > G.in_scr_scr2) {
									//Iconbox
									typ = Titem_.typ;
									id = Titem_.id;
									if (gui_iconbox(236 + x, 347 + y, Ditem_iconh(typ), Ditem_name(typ), id === G.in_ex_sel ? 1 : 0)) {
										G.in_ex_sel = id;
									}
									//Drag and Drop
									if (gui_dndwatch(236 + x, 347 + y)) {
										G.in_dnd = 1;
										G.in_dnd_pivotx = G.in_mx - (236 + x);
										G.in_dnd_pivoty = G.in_my - (347 + y);
										G.in_dnd_src = 1;
										G.in_dnd_typ = typ;
										G.in_dnd_x = G.in_mx;
										G.in_dnd_y = G.in_my;
										G.in_dnd_show = 0;
									}
									//Restricted
									if (restrictedex === 1) {
										if (Instr(G.in_ex_only, '|' + Str(typ) + '|') === 0) {
											DrawBlock(G.gfx_if_itemback, 236 + x, 347 + y);
											if (Ditem_icondh(typ) === 0) Ditem_icondh.set(typ, makedark(Ditem_iconh(typ)));
											DrawImage(Ditem_icondh(typ), 236 + x, 347 + y);
											if (id === G.in_ex_sel) {
												Color(fabs(f32(255 * Sin(G.in_ca))), 0, 0);
												Rect(236 + x, 347 + y, 40, 40, 0);
											}
										}
									}
									//Iconcount
									gui_iconboxc(236 + x, 347 + y, Titem_.count);
									//Cache
									if (id === G.in_ex_sel) {
										G.TCitem = Titem_;
									}
									x = x + 45;
									if (x >= 495) {
										x = 0;
										y = y + 45;
										if (y >= 180) break;
									}
								}
							}
						}
					}

					//Close (go to normal inventory)
					if (gui_ibutton(742, 347 - 37, Cicon_x, '')) {
						//Set Menu
						G.m_menu = Cmenu_if_items;
						//Reset Scrolling
						G.in_scr_scr = 0;
						G.in_scr_scr2 = 0;
						//Deselect Items at Object
						for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
							if (Titem_.parent_class !== Cclass_unit || Titem_.parent_id !== G.g_player) {
								Titem_.if_sel = 0;
							}
						}
					}

					//Object Scroll
					if (gui_ibutton(742, 347, Cicon_up, sm(29), G.in_scr_scr2 > 0 ? 1 : 0)) {
						G.in_scr_scr2 = G.in_scr_scr2 - 11;
						if (G.in_scr_scr2 < 0) G.in_scr_scr2 = 0;
					}
					if (gui_ibutton(742, 347 + 135 + 10, Cicon_down, sm(30), y >= 135 ? 1 : 0)) {
						G.in_scr_scr2 = G.in_scr_scr2 + 11;
					}

					//Object Inventory Capacy State
					x = 0;
					for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
						if (Titem_.parent_class === G.in_ex_class) {
							if (Titem_.parent_id === G.in_ex_id) {
								x = x + Ditem_weight(Titem_.typ) * Titem_.count;
							}
						}
					}
					switch (G.in_ex_class) {
						case Cclass_object:
							con_object(G.in_ex_id);
							total = Dobject_maxweight(G.TCobject!.typ);
							bmpf_txt(236, 524, ss(sm(150), numsep(Str(x)), numsep(Str(total)), numsep(Str(total - x))), Cbmpf_tiny);
							break;
						case Cclass_unit:
							con_unit(G.in_ex_id);
							total = Dunit_maxweight(G.TCunit!.typ);
							bmpf_txt(236, 524, ss(sm(150), numsep(Str(x)), numsep(Str(total)), numsep(Str(total - x))), Cbmpf_tiny);
							break;
					}

					perc = Int(f32(f32(x / total) * 100));
					DrawBlock(G.gfx_if_barback, 500, 528);
					DrawBlockRect(G.gfx_bars, 501, 529, 0, 0, 100 - perc, 5);

					//EXCHANGE!
					x = 0;
					if (gui_ibutton(410 + 37, 305, Cicon_ex1, sm(165), G.in_ex_sel > 0 ? 1 : 0)) x = 1;
					if (gui_ibutton(410 + 37 + 37, 305, Cicon_ex5, sm(166), G.in_ex_sel > 0 ? 1 : 0)) x = 2;
					if (gui_ibutton(410 + 37 + 37 + 37, 305, Cicon_exall, sm(167), G.in_ex_sel > 0 ? 1 : 0)) x = 3;
					if (x > 0) {
						switch (x) {
							case 1:
								c = 1;
								break;
							case 2:
								c = 5;
								break;
							case 3:
								c = G.TCitem!.count;
								break;
						}
						if (if_exchange_allowed(G.TCitem!.typ)) {
							//Player -> Object
							if (G.TCitem!.parent_id === G.g_player && G.TCitem!.parent_class === Cclass_unit) {
								if (G.in_ex_allowstore === 1) {
									exreturn = exchange_item(G.in_ex_class, G.in_ex_id, c);
									if (exreturn === 0) {
										if_msg(sm(181), Cbmpf_red);
										sfx(G.sfx_fail);
									} else if (exreturn === -1) {
										if_msg(sm(181), Cbmpf_red);
										sfx(G.sfx_fail);
										speech('nospace');
									}
									if (exreturn !== 2) {
										G.in_ex_sel = 0;
										for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
											if (Titem_.parent_class === Cclass_unit) {
												if (Titem_.parent_id === G.g_player) {
													G.in_ex_sel = Titem_.id;
													break;
												}
											}
										}
									}
								} else {
									speech('negative');
								}
								//Object -> Player
							} else {
								exreturn = exchange_item(Cclass_unit, G.g_player, c);
								if (exreturn === 0) {
									if_msg(sm(181), Cbmpf_red);
									sfx(G.sfx_fail);
									speech('nospace');
								} else if (exreturn === -1) {
									if_msg(sm(181), Cbmpf_red);
									sfx(G.sfx_fail);
								}
								if (exreturn !== 2) {
									G.in_ex_sel = 0;
									for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
										if (Titem_.parent_class === G.in_ex_class) {
											if (Titem_.parent_id === G.in_ex_id) {
												G.in_ex_sel = Titem_.id;
												break;
											}
										}
									}
								}
							}
						} else {
							speech('negative');
						}
					}

					//Okay
					if (gui_ibutton(742, 542, Cicon_ok, sm(5))) G.m_menu = 0;
					break;

				//Map
				case Cmenu_if_map:
					if_map();
					break;

				//Crack Lock
				case Cmenu_if_cracklock:
					DrawImage(G.gfx_icons, 236, 5, Cicon_bag);
					bmpf_txt(236 + 37, 10, G.pl_cl_title);

					keyin = '';

					//Position
					bmpf_txt_c(489 + 16, 306, Str(G.pc_cl_pos), Cbmpf_dark);

					//Left
					i = 0;
					if (G.pc_cl_mode > 0) i = 1;
					if (gui_ibutton(489 - 37, 300, Cicon_left, '', i, 0, 203)) {
						keyin = 'l';
						sfx(G.sfx_crack[0]);
					}

					//Right
					i = 0;
					if (G.pc_cl_mode > 1) i = 1;
					if (gui_ibutton(489 + 37, 300, Cicon_right, '', i, 0, 205)) {
						keyin = 'r';
						sfx(G.sfx_crack[1]);
					}

					//Up
					i = 0;
					if (G.pc_cl_mode > 2) i = 1;
					if (gui_ibutton(489, 300 - 37, Cicon_up, '', i, 0, 200)) {
						keyin = 'u';
						sfx(G.sfx_crack[2]);
					}

					//Down
					i = 0;
					if (G.pc_cl_mode > 3) i = 1;
					if (gui_ibutton(489, 300 + 37, Cicon_down, '', i, 0, 208)) {
						keyin = 'd';
						sfx(G.sfx_crack[3]);
					}

					//Perform Check?
					if (keyin !== '') {
						//Success
						if (Mid(G.pc_cl_code, G.pc_cl_pos, 1) === keyin) {
							G.pc_cl_pos = G.pc_cl_pos + 1;
							//Cracked!
							if (G.pc_cl_pos > Len(G.pc_cl_code)) {
								//Event
								parse_emuevent(G.pc_cl_class, G.pc_cl_id, 'cracklock_success');
								//Close Menu
								G.m_menu = 0;
							}
							//Failure
						} else {
							//Reset
							G.pc_cl_pos = 1;
							//Event
							parse_emuevent(G.pc_cl_class, G.pc_cl_id, 'cracklock_failure');
							//Failure Sound
							sfx(G.sfx_fail);
						}
					}
					break;

				//Debugmenu
				case Cmenu_if_debugmenu:
					DrawImage(G.gfx_icons, 236, 5, Cicon_zoom);
					bmpf_txt(236 + 37, 10, 'Debug');

					//DEBUG
					y = 63;
					bmpf_txt(236, y, 'Options');

					//Debugmode
					y = y + 20;
					if (gui_ibutton(236, y, Cicon_zoom, 'Debug Mode')) {
						con_debug();
					}
					bmpf_txt(273, y, 'Debug Mode');
					bmpf_txt(273, y + 16, 'Debug Mode ON/OFF', Cbmpf_tiny);
					//Debugtime
					y = y + 37;
					if (gui_ibutton(236, y, Cicon_zoom, 'Debug Times')) {
						con_debugtimes();
					}
					bmpf_txt(273, y, 'Debug Times');
					bmpf_txt(273, y + 16, 'Time Info ON/OFF', Cbmpf_tiny);
					//Debugsequences
					y = y + 37;
					if (gui_ibutton(236, y, Cicon_zoom, 'Debug Sequences')) {
						con_debugsequences();
					}
					bmpf_txt(273, y, 'Debug Sequences');
					bmpf_txt(273, y + 16, 'Sequence Info ON/OFF', Cbmpf_tiny);
					//Debugmap
					y = y + 37;
					if (gui_ibutton(236, y, Cicon_zoom, 'Debug Map')) {
						con_debugmap();
					}
					bmpf_txt(273, y, 'Debug Map');
					bmpf_txt(273, y + 16, 'Show Debugmap', Cbmpf_tiny);
					//Debugscript
					y = y + 37;
					if (gui_ibutton(236, y, Cicon_zoom, 'Debug Script')) {
						con_debugscript();
						con_open();
					}
					bmpf_txt(273, y, 'Debug Script');
					bmpf_txt(273, y + 16, 'Show last parsed Script', Cbmpf_tiny);

					//CHEATS
					y = y + 47;
					bmpf_txt(236, y, 'Cheats');

					//Invulnerable
					y = y + 20;
					if (gui_ibutton(236, y, Cicon_ok, 'Invulnerability / Revive')) {
						if (get_state(Cstate_invulnerability, Cclass_unit, 1) === 0) {
							set_state(Cstate_invulnerability, Cclass_unit, 1);
						} else {
							free_state(Cstate_invulnerability, Cclass_unit, 1);
						}
						if (con_unit(1)) {
							G.g_player_dead = 0;
							G.TCunit!.health_max = f32(Dunit_health(G.TCunit!.typ));
							G.TCunit!.health = f32(Dunit_health(G.TCunit!.typ));
							EntityType(G.TCunit!.h, Dunit_col(G.TCunit!.typ));
							EntityPickMode(G.TCunit!.mh, 2, 1);
						}
						G.m_menu = 0;
						if_msg('< invulnerability / revive cheat >', Cbmpf_yellow);
					}
					bmpf_txt(273, y, 'Invulnerability / Revive');
					bmpf_txt(273, y + 16, 'Invulnerability ON/OFF, revive when death', Cbmpf_tiny);
					//Reset Values
					y = y + 37;
					if (gui_ibutton(236, y, Cicon_ok, 'Reset Values')) {
						if (con_unit(1)) {
							G.TCunit!.hunger = 0;
							G.TCunit!.thirst = 0;
							G.TCunit!.exhaustion = 0;
							unit_values();
						}
						G.m_menu = 0;
						if_msg('< reset values cheat >', Cbmpf_yellow);
					}
					bmpf_txt(273, y, 'Reset Values');
					bmpf_txt(273, y + 16, 'No hunger/thirst/exhaustion', Cbmpf_tiny);
					//Remove States
					y = y + 37;
					if (gui_ibutton(236, y, Cicon_ok, 'Remove States')) {
						for (Tstate_ = First(Tstate); Tstate_ !== null; Tstate_ = After(Tstate, Tstate_)) {
							if (Tstate_.parent_class === Cclass_unit) {
								if (Tstate_.parent_id === 1) {
									free_state(Tstate_.typ, Cclass_unit, 1);
								}
							}
						}
						G.m_menu = 0;
						if_msg('< remove states cheat >', Cbmpf_yellow);
					}
					bmpf_txt(273, y, 'Remove States');
					bmpf_txt(273, y + 16, 'Remove all States of the Player', Cbmpf_tiny);
					//Give Item
					y = y + 37;
					if (gui_ibutton(236, y, Cicon_ok, 'Give Item')) {
						G.in_item_sel = 0;
						G.in_item_scr = 0;
						G.m_menu = Cmenu_if_debugmenu_items;
					}
					bmpf_txt(273, y, 'Give Item');
					bmpf_txt(273, y + 16, 'Give an Item to the Player', Cbmpf_tiny);
					//Buildplace Items
					y = y + 37;
					if (gui_ibutton(236, y, Cicon_ok, 'Buildplace Items')) {
						//Find Buildplace
						for (Tobject_ = First(Tobject); Tobject_ !== null; Tobject_ = After(Tobject, Tobject_)) {
							if (Tobject_.typ === G.set_buildplaceid || Tobject_.typ === G.set_buildplacewaterid) {
								if (EntityDistance(G.cam, Tobject_.h) < 75) {
									if (get_state(Cstate_buildplace, Cclass_object, Tobject_.id) !== 0) {
										//Delete stored Items
										for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
											if (Titem_.parent_class === Cclass_object) {
												if (Titem_.parent_id === Tobject_.id) {
													free_item(Titem_.id);
												}
											}
										}
										//Fill
										buiid = 0;
										//Get Building Type ID
										for (Tbui_ = First(Tbui); Tbui_ !== null; Tbui_ = After(Tbui, Tbui_)) {
											if (Tbui_.mode === 2) {
												if (Tbui_.typ === G.TCstate!.value) {
													buiid = Tbui_.id;
													break;
												}
											}
										}
										//Create Items
										for (Tbui_ = First(Tbui); Tbui_ !== null; Tbui_ = After(Tbui, Tbui_)) {
											if (Tbui_.mode === 0) {
												if (Tbui_.id === buiid) {
													itemid = set_item(-1, Tbui_.typ, 0, 0, 0, Tbui_.count);
													store_item(itemid, Cclass_object, Tobject_.id);
												}
											}
										}
										G.m_menu = 0;
										if_msg('< buildplace items cheat >', Cbmpf_yellow);
										break;
									}
								}
							}
						}
					}
					bmpf_txt(273, y, 'Buildplace Items');
					bmpf_txt(273, y + 16, 'Store required Items in next Buildplace', Cbmpf_tiny);
					//Execute Script
					y = y + 37;
					if (gui_ibutton(236, y, Cicon_ok, 'Execute Script')) {
						gui_tb_loadstring('', '');
						G.in_scr_scr = 0;
						G.m_menu = Cmenu_if_debugmenu_script;
					}
					bmpf_txt(273, y, 'Execute Script');
					bmpf_txt(273, y + 16, 'Enter and execute a SII Script', Cbmpf_tiny);
					break;

				//Debugmenu Items
				case Cmenu_if_debugmenu_items:
					DrawImage(G.gfx_icons, 236, 5, Cicon_zoom);
					bmpf_txt(236 + 37, 10, 'Cheat - Give Item');

					//List
					x = 0;
					y = 0;
					j = 0;
					x = 236 - 5;
					y = 63;
					for (i = 0; i <= G.Citem_count; i++) {
						if (Ditem_name(i) !== '') {
							j = j + 1;
							if (j > G.in_item_scr) {
								DrawBlock(G.gfx_if_itemback, 5 + x, y);
								click = gui_iconbox(
									5 + x,
									y,
									Ditem_iconh(i),
									Ditem_name(i) + ' (' + Str(i) + ') -> left click +1 / right click +10',
									i === G.in_item_sel ? 1 : 0
								);
								if (click > 0) {
									//left click -> +1
									if (click === 1) {
										id = set_item(-1, i, EntityX(G.cam), EntityY(G.cam), EntityZ(G.cam), 1);
										if (id > 0) {
											merge_item(id);
											store_item(id, Cclass_unit, G.g_player);
										}
										//right click -> +10
									} else if (click === 2) {
										id = set_item(-1, i, EntityX(G.cam), EntityY(G.cam), EntityZ(G.cam), 10);
										if (id > 0) {
											merge_item(id);
											store_item(id, Cclass_unit, G.g_player);
										}
									}
								}
								x = x + 45;
								if (x >= 495 + 231) {
									x = 236 - 5;
									y = y + 45;
									if (y >= 540) break;
								}
							}
						}
					}

					//Scroll
					if (gui_ibutton(742, 63, Cicon_up, sm(29), G.in_item_scr > 0 ? 1 : 0)) {
						G.in_item_scr = G.in_item_scr - 11;
						if (G.in_item_scr < 0) G.in_item_scr = 0;
					}
					if (gui_ibutton(742, 542, Cicon_down, sm(30), y >= 540 ? 1 : 0)) {
						G.in_item_scr = G.in_item_scr + 11;
					}
					if (G.in_mzs > 0 && G.in_item_scr > 0) {
						G.in_item_scr = G.in_item_scr - 11;
						// quirk: clamps in_scr_scr, not in_item_scr (which may go negative)
						if (G.in_scr_scr < 0) G.in_scr_scr = 0;
					}
					if (G.in_mzs < 0 && y > 540) G.in_item_scr = G.in_item_scr + 11;
					break;

				//Debugmenu Script
				case Cmenu_if_debugmenu_script:
					DrawImage(G.gfx_icons, 236, 5, Cicon_zoom);
					bmpf_txt(236 + 37, 10, 'Cheat - Execute Script');

					//Focus
					G.in_inputfocus = 1337;

					//Scriptbox
					gui_tb(236, 85, 538, 29, 1, 1);

					//Okay
					if (gui_ibutton(742, 542, Cicon_ok, sm(5))) {
						cheatscript = gui_tb_savestring(SEP_LINE);
						parse_task(0, 0, 'cheat', 'Cheat Script Execution', cheatscript);
						G.m_menu = 0;
					}
					//Cancel
					if (gui_ibutton(742 - 37, 542, Cicon_x, sm(3))) {
						G.m_menu = 0;
					}

					//Delete
					if (gui_ibutton(236, 542, Cicon_x, se(141))) {
						gui_tb_loadstring('', '');
					}

					//Load
					if (gui_ibutton(236 + 37 + 37, 542, Cicon_load, se(177))) {
						if (await gui_win_file(se(177), G.set_rootdir, '', 0, 0)) {
							await gui_tb_loadfile(G.in_win_path + G.in_win_file);
						}
					}
					//Export
					if (gui_ibutton(236 + 37 + 37 + 37, 542, Cicon_save, se(178))) {
						if (await gui_win_file(se(178), G.set_rootdir, '', 0, 1)) {
							await gui_tb_savefile(G.in_win_path + G.in_win_file);
						}
					}

					//Add Command
					gui_tb_scripthelper_list();
					if (gui_ibutton(236 + 37 + 37 + 37 + 5 + 37, 542, Cicon_inc, se(179))) {
						await gui_win_command();
					}
					break;
			}

			//### Special Menus
		} else {
			switch (G.m_menu) {
				//Clickscreen
				case Cmenu_if_clickscreen:
					ClsColor(0, 0, 0);
					Cls();

					if (G.in_clickscreenimage !== 0) {
						DrawImage(
							G.in_clickscreenimage,
							idivConst(G.set_scrx, 2) - idivConst(ImageWidth(G.in_clickscreenimage), 2),
							idivConst(G.set_scry, 2) - idivConst(ImageHeight(G.in_clickscreenimage), 2)
						);
					}

					for (Tcscr_ = First(Tcscr); Tcscr_ !== null; Tcscr_ = After(Tcscr, Tcscr_)) {
						switch (Tcscr_.typ) {
							//Text
							case 1:
								switch (Tcscr_.align) {
									case 0:
									case 1:
										x = Tcscr_.x;
										break;
									case 2:
										x = Tcscr_.x - idivConst(bmpf_len(Tcscr_.txt, Tcscr_.col), 2);
										break;
									case 3:
										x = Tcscr_.x - bmpf_len(Tcscr_.txt, Tcscr_.col);
										break;
									default:
										x = Tcscr_.x;
								}
								if (gui_txtb(x, Tcscr_.y, Tcscr_.txt, 1, Tcscr_.col, Tcscr_.tooltip)) {
									if (parse_isevent(Tcscr_.event)) {
										parse_globalevent(Tcscr_.event, 'Script Text Click');
									} else {
										parse_task(0, 0, 'click', 'Script Text Click', Tcscr_.event);
									}
								}
								break;
							//Image
							case 2:
								if (Tcscr_.image !== 0) {
									DrawImage(Tcscr_.image, Tcscr_.x, Tcscr_.y);
									if (G.in_mx >= Tcscr_.x) {
										if (G.in_my >= Tcscr_.y) {
											if (G.in_mx <= Tcscr_.x + ImageWidth(Tcscr_.image)) {
												if (G.in_my <= Tcscr_.y + ImageHeight(Tcscr_.image)) {
													if (Tcscr_.tooltip !== '') {
														gui_tt(G.in_mx, G.in_my, Tcscr_.tooltip);
													}
													if (G.in_mrelease[1]) {
														play(G.sfx_click);
														flushinput();
														if (parse_isevent(Tcscr_.event)) {
															parse_globalevent(Tcscr_.event, 'Script Image Click');
														} else {
															parse_task(0, 0, 'click', 'Script Image Click', Tcscr_.event);
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

					//Close
					if (G.in_clickscreenx) {
						if (gui_ibutton(G.set_scrx - 37, 5, Cicon_x, sm(3), 1, 0, 1)) {
							G.m_menu = 0;
						}
					}
					break;

				//Buildsetup
				case Cmenu_if_buildsetup:
					DrawImage(G.gfx_win, 215, -537);
					if (gui_ibutton(742, 5, Cicon_x, sm(3))) game_buildsetup_end();
					DrawImage(G.gfx_icons, 236, 5, Cicon_build);
					//Object (Positive Type)
					if (G.in_buildsetup_typ > 0) {
						bmpf_txt(236 + 37, 10, ss(sm(161), Dobject_name(G.in_buildsetup_typ)));
						//Unit (Negative Type)
					} else {
						bmpf_txt(236 + 37, 10, ss(sm(161), Dunit_name(Abs(G.in_buildsetup_typ))));
					}

					//Update Position Stuff
					game_buildsetup_update();
					break;

				//Select Place
				case Cmenu_if_selplace:
					DrawImage(G.gfx_win, 215, -537);
					DrawImage(G.gfx_icons, 236, 5, Cicon_select);
					bmpf_txt(236 + 37, 10, G.pc_sp_txt);
					if (gui_ibutton(742, 5, Cicon_x, sm(3))) {
						G.m_menu = 0;
					} else {
						if (G.in_mhit[1]) {
							CameraPick(G.cam, G.in_mx, G.in_my);
							//Vars
							G.pc_sp_x = PickedX();
							G.pc_sp_y = PickedY();
							G.pc_sp_z = PickedZ();
							//Event
							parse_emuevent(G.pc_sp_class, G.pc_sp_id, 'selectplace');
						}
					}
					break;

				//Debug
				case Cmenu_if_debug:
					DrawImage(G.gfx_win, 215, -537);
					if (gui_ibutton(742, 5, Cicon_x, sm(3))) G.m_menu = 0;
					DrawImage(G.gfx_icons, 236, 5, Cicon_zoom);
					bmpf_txt(236 + 37, 10, 'Debug');

					switch (G.set_debug_menu) {
						case 1:
							debug_map();
							break;
					}
					break;

				//Chat
				case Cmenu_if_chat:
					//Input
					bmpf_txt(5, idivConst(G.set_scry, 2) + 25, sm(162) + ': ' + G.in_chat, Cbmpf_yellow);
					G.in_chat = gui_inputstr(G.in_chat, 350);

					//Chat
					if (G.in_keyhit[Ckey_chat]) {
						G.in_chat = ntrim(G.in_chat);
						G.in_lastchat = G.in_chat;
						if (G.udp !== 0) {
							if (Len(G.in_chat) > 0) {
								//Send
								if (G.m_section === Csection_game_mp) {
									for (Tudp_con_ = First(Tudp_con); Tudp_con_ !== null; Tudp_con_ = After(Tudp_con, Tudp_con_)) {
										udp_send(Tudp_con_.ip, Tudp_con_.port, 100, 1);
										udp_w_byte(1);
										udp_w_byte(G.g_player);
										udp_w_txt(G.in_chat);
									}
								}
								//Local Say
								con_unit(G.g_player);
								if_msg(G.TCunit!.player_name + ': ' + G.in_chat, 0, Cchatshow);
							}
						}
						FlushKeys();
						G.m_menu = 0;
						G.in_keyhit[Ckey_chat] = 0;
					}
					break;

				//Movie / Sequences
				case Cmenu_if_movie:
					break;

				//Default
				default:
				//RuntimeError("unknown interface menu '"+m_menu+"'!")
			}
		}
	}

	//Tutorial
	//If in_tut=1 Then
	//	if_tutorial()
	//EndIf
}

//### Interface Message
/** Function if_msg(msg$,col=0,showtime=3000) */
export function if_msg(msg: string, col = 0, showtime = 3000): void {
	let Tmsg_: Tmsg | null = null;
	Tmsg_ = New(Tmsg);
	Tmsg_.msg = msg;
	Tmsg_.col = col;
	Tmsg_.age = G.ms + showtime;
	Tmsg_.scroll = f32(0.1);
	InsertBefore(Tmsg, Tmsg_, First(Tmsg)!);
}

//### Interface Unselect All Items
/** Function if_unselectitems() */
export function if_unselectitems(): void {
	let Titem_: Titem | null = null;
	for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
		Titem_.if_sel = 0;
	}
}

//### Interface Select Item
/** Function if_selectitem(id,typ=-1) */
export function if_selectitem(id: number, typ = -1): number {
	let Titem_: Titem | null = null;
	for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
		// quirk: no parent check, the first item of any owner (or lying on the map) with this id or type is selected
		if (Titem_.id === id || Titem_.typ === typ) {
			Titem_.if_sel = 1;
			return 1;
		}
	}
	return 0;
}

//### Interface Quickslot
/** Function if_quickslot(forceslot=0,msg=0) */
export function if_quickslot(forceslot = 0, msg = 0): number {
	let i = 0;
	let found = 0;
	let Titem_: Titem | null = null;
	FlushKeys();
	for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
		if (Titem_.if_sel === 1) {
			//Forced
			if (forceslot > 0) {
				if (G.in_quickslot[forceslot] === Titem_.typ) {
					G.in_quickslot[forceslot] = 0;
					if (msg === 1) {
						if_msg(ss(sm(198), Ditem_name(Titem_.typ)));
					}
				} else {
					G.in_quickslot[forceslot] = Titem_.typ;
					if (msg === 1) {
						if_msg(ss(sm(197), Ditem_name(Titem_.typ), Str(forceslot)));
					}
				}
				for (i = 1; i <= 9; i++) {
					if (i !== forceslot) {
						if (G.in_quickslot[i] === Titem_.typ) G.in_quickslot[i] = 0;
					}
				}
				//Free
			} else {
				found = 0;
				for (i = 1; i <= 9; i++) {
					if (G.in_quickslot[i] === Titem_.typ) {
						G.in_quickslot[i] = 0;
						found = 1;
						if (msg === 1) {
							if_msg(ss(sm(198), Ditem_name(Titem_.typ)));
						}
					}
				}
				if (found === 0) {
					for (i = 1; i <= 9; i++) {
						if (G.in_quickslot[i] === 0) {
							G.in_quickslot[i] = Titem_.typ;
							found = 1;
							if (msg === 1) {
								if_msg(ss(sm(197), Ditem_name(Titem_.typ), Str(i)));
							}
							break;
						}
					}
					if (found === 0) {
						G.in_quickslot[1] = Titem_.typ;
					}
				}
			}
			if_unselectitems();
			return 1;
		}
	}
	if_unselectitems();
	return 0;
}

//### Exchange
/** Function if_exchange(class,id,allowstore=0,only$="") */
export function if_exchange(class_: number, id: number, allowstore = 0, only = ''): number {
	// quirk: in_ex_mode is not a Global: a local that is set and never read
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	let in_ex_mode = 0;
	let Titem_: Titem | null = null;
	//Set Exchange
	G.in_ex_class = class_;
	G.in_ex_id = id;
	in_ex_mode = 0;
	G.in_ex_allowstore = allowstore;
	G.in_ex_only = only;
	//Set Menu
	G.m_menu = Cmenu_if_exchange;
	//Reset Scrolling
	G.in_scr_scr = 0;
	G.in_scr_scr2 = 0;
	//Select First Item
	G.in_ex_sel = 0;
	for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
		if (Titem_.parent_class === class_) {
			if (Titem_.parent_id === id) {
				G.in_ex_sel = Titem_.id;
				return 1;
			}
		}
	}
	for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
		if (Titem_.parent_class === Cclass_unit) {
			if (Titem_.parent_id === G.g_player) {
				G.in_ex_sel = Titem_.id;
				return 1;
			}
		}
	}
	return 0;
}

//Exchange Allowed?
/** Function if_exchange_allowed(typ) */
export function if_exchange_allowed(typ: number): number {
	if (G.in_ex_only === '') {
		return 1;
	} else {
		if (Instr(G.in_ex_only, '|' + Str(typ) + '|') > 0) return 1;
	}
	return 0;
}

//### Set Mouse to Close Position
/** Function if_centerpos() */
export function if_centerpos(): void {
	let x = 0;
	let y = 0;
	//No Click!
	FlushMouse();
	G.in_mhit[1] = 0;
	G.in_mdown[1] = 0;
	G.in_mrelease[1] = 0;
	//Set Positon
	x = idivConst(G.set_scrx, 2);
	y = idivConst(G.set_scry, 2);
	MoveMouse(x, y);
	G.in_mx = x;
	G.in_my = y;
}

//### Map Menu
/** Function if_map() */
export function if_map(): void {
	let cx = 0;
	let cy = 0;
	let fac = 0;
	let Tinfo_: Tinfo | null = null;
	let px = 0;
	let py = 0;
	let sx = 0;
	let sy = 0;
	let frame = 0;
	DrawImage(G.gfx_icons, 236, 5, Cicon_map);
	bmpf_txt(236 + 37, 10, sm(169));

	//Map
	if (G.map_mapimage === 0) {
		genmap(256);
	}

	cx = 236 + 15 + 256;
	cy = 50 + 256;
	if (G.m_section === Csection_editor) {
		Color(0, 0, 0);
		Rect(cx - (128 + 64), cy - (128 + 64), 256 + 128, 256 + 128, 1);
	}
	DrawBlock(G.map_mapimage, cx - 128, cy - 128);

	//Factor
	fac = f32((G.ter_size * Cworld_size) / 256);

	//Map Indications
	for (Tinfo_ = First(Tinfo); Tinfo_ !== null; Tinfo_ = After(Tinfo, Tinfo_)) {
		if (Tinfo_.typ === 36) {
			//Active?
			if (Tinfo_.ints[1] === 1 || (G.m_section === Csection_editor && G.in_cursor === 1)) {
				//Position
				px = Int(f32(EntityX(Tinfo_.h) / f32(-fac)));
				py = Int(f32(EntityZ(Tinfo_.h) / fac));
				//Draw
				DrawImage(G.gfx_arrows, cx + px, cy + py, Tinfo_.ints[0]);
			}
		}
	}

	//Player Position
	px = Int(f32(EntityX(G.cam) / f32(-fac)));
	py = Int(f32(EntityZ(G.cam) / fac));

	if (Abs(px) > 127 || Abs(py) > 127) {
		if (px > 127) {
			px = 127;
		} else if (px < -127) {
			px = -127;
		}
		if (py > 127) {
			py = 127;
		} else if (py < -127) {
			py = -127;
		}

		sx = idivConst(px + 128 + 32, 32);
		sy = idivConst(py + 128 + 32, 32);

		switch (sx) {
			case 0:
			case 1:
			case 2:
				switch (sy) {
					case 0:
					case 1:
					case 2:
						frame = 8;
						break;
					case 3:
					case 4:
					case 5:
					case 6:
						frame = 7;
						break;
					case 7:
					case 8:
						frame = 6;
						break;
				}
				break;
			case 3:
			case 4:
			case 5:
			case 6:
				switch (sy) {
					case 0:
					case 1:
					case 2:
						frame = 1;
						break;
					case 3:
					case 4:
					case 5:
					case 6:
						frame = 0;
						break;
					case 7:
					case 8:
						frame = 5;
						break;
				}
				break;
			case 7:
			case 8:
				switch (sy) {
					case 0:
					case 1:
					case 2:
						frame = 2;
						break;
					case 3:
					case 4:
					case 5:
					case 6:
						frame = 3;
						break;
					case 7:
					case 8:
						frame = 4;
						break;
				}
				break;
		}

		DrawImage(G.gfx_arrows, cx + px, cy + py, frame);
	} else {
		DrawImage(G.gfx_arrows, cx + px, cy + py, 0);
	}

	//Player Direction
	if (G.in_compass === 1) {
		Color(0, 230, 0);
		Line(cx + px, cy + py, f32(cx + px + f32(Sin(EntityYaw(G.cam)) * 10)), f32(cy + py + f32(Cos(EntityYaw(G.cam)) * 10)));
	}

	//Player Info Text
	if (Abs(G.in_mx - (cx + px)) < 8) {
		if (Abs(G.in_my - (cy + py)) < 8) {
			bmpf_txt_c(cx + px, cy + py - 20, sm(170), Cbmpf_tiny);
		}
	}

	//Map Indications Info Text
	for (Tinfo_ = First(Tinfo); Tinfo_ !== null; Tinfo_ = After(Tinfo, Tinfo_)) {
		if (Tinfo_.typ === 36) {
			//Active?
			if (Tinfo_.ints[1] === 1 || G.m_section === Csection_editor) {
				//Position
				px = Int(f32(EntityX(Tinfo_.h) / f32(-fac)));
				py = Int(f32(EntityZ(Tinfo_.h) / fac));
				//Info Text
				if (Abs(G.in_mx - (cx + px)) < 8) {
					if (Abs(G.in_my - (cy + py)) < 8) {
						if (Tinfo_.strings[0] !== '') {
							bmpf_txt_c(cx + px, cy + py - 20, Tinfo_.strings[0], Cbmpf_tiny);
						}
					}
				}
			}
		}
	}

	//Set Position (Editor only)
	if (G.m_section === Csection_editor) {
		if (G.in_mx >= cx - (128 + 64)) {
			if (G.in_mx <= cx + (128 + 64)) {
				if (G.in_my >= cy - (128 + 64)) {
					if (G.in_my <= cy + (128 + 64)) {
						G.in_cursorf = 2;
						if (G.in_mdown[1]) {
							PositionEntity(G.cam, f32((cx - G.in_mx) * fac), 0, f32((G.in_my - cy) * fac));
							PositionEntity(G.cam, EntityX(G.cam), f32(e_tery(EntityX(G.cam), EntityZ(G.cam)) + 50), EntityZ(G.cam));
						}
					}
				}
			}
		}
	}

	//Okay
	if (gui_ibutton(742, 542, Cicon_ok, sm(5))) G.m_menu = 0;
}

//Tutorial
/** Function if_tutorial() */
export function if_tutorial(): void {
	let hide = 0;
	//Position
	if (G.m_menu === 0 || G.m_menu >= Cmenu_if_buildsetup) {
		hide = 0;
	} else {
		if (G.in_my >= G.set_scry - 150) hide = 1;
	}
	if (hide === 1) {
		G.in_tut_y = f32(G.in_tut_y + f32(10 * G.f));
		if (G.in_tut_y > 150) G.in_tut_y = 150;
	} else {
		G.in_tut_y = f32(G.in_tut_y - f32(10 * G.f));
		if (G.in_tut_y < 0) G.in_tut_y = 0;
	}
	//Draw Tutor
	DrawImage(G.gfx_tutor, 0, f32(G.set_scry + G.in_tut_y));
	//Tutorial Text
	bmpf_txt_rect(200, Int(f32(G.set_scry - 120 + G.in_tut_y)), G.set_scrx - 200 - 140, 120, G.in_tut_txt, 1, 0);
}

//Select Last Diary Entry
/** Function if_lastentry() */
export function if_lastentry(): void {
	let i = 0;
	let Tx_: Tx | null = null;
	for (Tx_ = First(Tx); Tx_ !== null; Tx_ = After(Tx, Tx_)) {
		if (Tx_.mode === 2) {
			i = i + 1;
		}
	}
	G.in_opt[0] = i;
	if (i > 4) G.in_scr_scr = i - 4;
}

//Interface Drop
/** Function if_drop() */
export function if_drop(): void {
	let exreturn = 0;
	let Titem_: Titem | null = null;
	//Drop
	if (G.in_mx < 215 || G.in_mx > 795 || G.in_my > 595) {
		if (G.in_dnd_src === 0) {
			if (get_stored_item(G.in_dnd_typ, Cclass_unit, G.g_player)) {
				//Event: on:drop
				G.p_skipevent = 0;
				if (set_parsecache(Cclass_item, G.TCitem!.id, 'drop')) parse();
				if (Instr(Ditem_scriptk(G.TCitem!.typ), SEP_LINE + 'drop')) {
					parse_env(Cclass_item, G.TCitem!.id, 'drop');
					loadstring_parsecache(Ditem_script(G.TCitem!.typ));
					parse();
				}
				//Unstore
				if (G.p_skipevent === 0) {
					if (p_add2d(G.in_mx - G.in_dnd_pivotx, G.in_my - G.in_dnd_pivoty, -2, G.TCitem!.typ)) {
						G.TCp!.fx = 0;
						G.TCp!.fy = 0;
					}
					if (unstore_item(G.TCitem!.id, G.TCitem!.count, 1)) merge_item(G.TCitem!.id);
				}
			}
		}
	}

	//Exchange
	if (G.m_menu === Cmenu_if_exchange) {
		//To Player
		if (G.in_mx >= 236 && G.in_mx <= 725 && G.in_my >= 63 && G.in_my <= 282) {
			if (G.in_dnd_src === 1) {
				if (get_stored_item(G.in_dnd_typ, G.in_ex_class, G.in_ex_id)) {
					if (if_exchange_allowed(G.in_dnd_typ)) {
						exreturn = exchange_item(Cclass_unit, G.g_player, G.TCitem!.count);
						if (exreturn === 0) {
							if_msg(sm(181), Cbmpf_red);
							sfx(G.sfx_fail);
							speech('nospace');
						} else if (exreturn === -1) {
							if_msg(sm(181), Cbmpf_red);
							sfx(G.sfx_fail);
						}
						if (exreturn !== 2) {
							G.in_ex_sel = 0;
							for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
								if (Titem_.parent_class === G.in_ex_class) {
									if (Titem_.parent_id === G.in_ex_id) {
										G.in_ex_sel = Titem_.id;
										break;
									}
								}
							}
						}
					} else {
						speech('negative');
					}
				}
			}
			//To Object
		} else if (G.in_mx >= 236 && G.in_mx <= 725 && G.in_my >= 347 && G.in_my <= 521) {
			if (G.in_dnd_src === 0) {
				if (get_stored_item(G.in_dnd_typ, Cclass_unit, G.g_player)) {
					if (G.in_ex_allowstore === 1) {
						if (if_exchange_allowed(G.in_dnd_typ)) {
							exreturn = exchange_item(G.in_ex_class, G.in_ex_id, G.TCitem!.count);
							if (exreturn === 0) {
								if_msg(sm(181), Cbmpf_red);
								sfx(G.sfx_fail);
							} else if (exreturn === -1) {
								if_msg(sm(181), Cbmpf_red);
								sfx(G.sfx_fail);
								speech('nospace');
							}
							if (exreturn !== 2) {
								G.in_ex_sel = 0;
								for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
									if (Titem_.parent_class === Cclass_unit) {
										if (Titem_.parent_id === G.g_player) {
											G.in_ex_sel = Titem_.id;
											break;
										}
									}
								}
							}
						} else {
							speech('negative');
						}
					} else {
						speech('negative');
					}
				}
			}
		}
	}

	//Reset
	G.in_dnd = 0;
	G.in_dnd_src = 0;
	G.in_dnd_typ = 0;
}
