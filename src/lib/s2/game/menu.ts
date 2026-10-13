/**
 * includes/menu.bb, ported line by line: the main menu section (menu(), one
 * frame per call), switching its pages (menu_set) and the key setting rows.
 */
//############################################ MENU
import { Abs, Float, Int, Left, Len, Mid, MilliSecs, RuntimeError, Str, Trim, f32, idivConst } from '../blitz';
import { CameraPick, PickedX, PickedY, PickedZ, PositionEntity, UpdateWorld, type Handle } from '../bb3d';
import { Color, DrawBlock, DrawImage, Rect } from '../gfx2d';
import { KeyHit } from '../input';
import {
	Cbmpf_dark,
	Cbmpf_green,
	Cbmpf_red,
	Cbmpf_tiny,
	Cbmpf_yellow,
	Cicon_all,
	Cicon_dir,
	Cicon_down,
	Cicon_load,
	Cicon_ok,
	Cicon_options,
	Cicon_pw,
	Cicon_up,
	Cicon_x,
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
	Cmenu_credits,
	Cmenu_main,
	Cmenu_mp,
	Cmenu_mp_create,
	Cmenu_mp_lan,
	Cmenu_random,
	Cmenu_reboot,
	Cmenu_set_gfx,
	Cmenu_set_in,
	Cmenu_set_inscript,
	Cmenu_set_sfx,
	Cmenu_sp,
	Cmenu_sp_load,
	Csection_editor,
	Csection_game_sp,
	Csection_menu,
	Cversion
} from './consts';
import { cull, cull_items } from './cull';
import { RenderWorld, e_environment_update, e_environment_update_water, e_environment_water2dfx } from './e_environment';
import { load_map, load_map_header, load_maps, load_savegames } from './e_load_map';
import { editor_ini, editor_testmap } from './editor_functions';
import { CloseFile, DeleteFile, Eof, ReadFile, ReadLine, type Stream } from './files';
import { play } from './functions';
import { game_explosion, game_playerspawn, game_setplayer } from './game_functions';
import { seq_blend, seq_update } from './game_sequences';
import { grass_spread } from './grasspread';
import { gui_button, gui_check, gui_ibutton, gui_input, gui_msgdecide, gui_opt, gui_scrollbar, gui_slider, gui_tt, gui_win_map } from './gui';
import { update_state } from './handle_states';
import { endinput, getinput } from './input';
import { bmpf_len, bmpf_txt, bmpf_txt_c, bmpf_txt_ml, bmpf_txt_r, bmpf_txt_scroll } from './load_bmpf';
import { load_settings, save_settings } from './load_settings';
import { sm, se, ss } from './load_strings';
import { mb_update } from './motionblur';
import { usgn_hostserver, usgn_joinserver, usgn_setup, usgn_update } from './mp_usgn';
import { p_update } from './particles';
import { prepare_cache_viewranges } from './prepare';
import { load_randommap, randommapcreate } from './randommap';
import { RT } from './rt';
import { sfx_update } from './sfx';
import { G } from './state';
import { DottedIP } from './sys';
import { After, Delete, First, New, Tserver, Tsg, Ttbt } from './types';
import { udp_clear } from './udp_functions';
import { up_update } from './unitpath';

//### Menu Start
/** Function menu_start() */
export async function menu_start(): Promise<void> {
	//Section & Menu
	G.m_section = Csection_menu;
	//Load Map
	await load_map('maps\\menu\\menu.s2', '');
	//Setup Player
	game_playerspawn(1);
	game_setplayer(1);
	PositionEntity(G.TCunit!.h, -1000000, -1000000, -1000000);
}

//### Menu Set
/** Function menu_set(menu,save=1) */
export async function menu_set(menu: number, save: number = 1): Promise<void> {
	let Ttbt_: Ttbt | null = null;
	let stream: Stream = 0;
	//Save GUI Stuff @ Vars from current Menu
	if (save === 1) {
		switch (G.m_menu) {
			//Settings Controls
			case Cmenu_set_in:
				G.set_msens = f32(f32(0.02) * Float(G.in_slider[0]));
				G.set_minvert = 1;
				if (G.in_check[0] === 1) G.set_minvert = -1;
				G.set_msmooth = G.in_check[1];
				break;

			//Settings GFX
			case Cmenu_set_gfx:
				switch (G.in_slider[0]) {
					case 0:
						G.set_scrx_c = 800;
						G.set_scry_c = 600;
						break;
					case 1:
						G.set_scrx_c = 1024;
						G.set_scry_c = 768;
						break;
					case 2:
						G.set_scrx_c = 1152;
						G.set_scry_c = 864;
						break;
					case 3:
						G.set_scrx_c = 1280;
						G.set_scry_c = 960;
						break;
					case 4:
						G.set_scrx_c = 1600;
						G.set_scry_c = 1200;
						break;
				}
				switch (G.in_slider[1]) {
					case 0:
						G.set_scrbit_c = 16;
						break;
					case 1:
						G.set_scrbit_c = 24;
						break;
					case 2:
						G.set_scrbit_c = 32;
						break;
				}
				G.set_viewrange = G.in_slider[2];
				G.set_terrain = G.in_slider[3];
				G.set_water = G.in_slider[4];
				G.set_sky = G.in_slider[5];
				G.set_effects = G.in_slider[6];
				G.set_grass = G.in_slider[7];
				G.set_2dfx = G.in_check[0];
				G.set_lightfx = G.in_check[1];
				G.set_windsway = G.in_check[2];
				G.set_fog = G.in_check[3];
				G.set_hwmultitex = G.in_check[4];
				G.set_mb = G.in_check[5];
				G.set_mb_alpha = f32(Float(G.in_slider[8]) / 100);
				//Reboot?
				if (G.set_scrx !== G.set_scrx_c || G.set_scry !== G.set_scry_c || G.set_scrbit !== G.set_scrbit_c) {
					G.set_reboot = 1;
				} else {
					G.set_reboot = 0;
				}
				break;

			//Settings SFX
			case Cmenu_set_sfx:
				G.set_musicvolume = f32(Float(G.in_slider[0]) / 100);
				G.set_fxvolume = f32(Float(G.in_slider[1]) / 100);
				G.set_name = G.in_input[0];
				G.set_serverport = Int(G.in_input[1]);

				if (G.amb_chan !== 0) {
					RT.audio.bb.ChannelVolume(G.amb_chan, G.set_fxvolume);
				}
				break;

			//Multiplayer
			case Cmenu_mp:
				//Shutdown Multiplayer Stuff
				udp_clear();
				break;

			//Multiplayer Create Game
			case Cmenu_mp_create:
				G.set_sv_name = G.in_input[0];
				G.set_sv_port = Int(G.in_input[1]);
				G.set_sv_pw = G.in_input[2];
				G.set_sv_playerlimit = Int(G.in_input[3]);
				G.set_sv_map = G.in_win_map;
				break;

			//Credits
			case Cmenu_credits:
				for (Ttbt_ = First(Ttbt); Ttbt_ !== null; Ttbt_ = After(Ttbt, Ttbt_)) {
					Delete(Ttbt, Ttbt_);
				}
				break;
		}
	}

	//Set Menu
	G.m_menu = menu;

	//Fill new GUI Stuff with Var Stuff ;)
	switch (G.m_menu) {
		//Settings Controls
		case Cmenu_set_in:
			G.in_slider[0] = Int(f32(G.set_msens / f32(0.02)));
			G.in_check[0] = 0;
			if (G.set_minvert === -1) G.in_check[0] = 1;
			G.in_check[1] = G.set_msmooth;
			break;

		//Settings GFX
		case Cmenu_set_gfx:
			switch (G.set_scrx_c) {
				case 800:
					G.in_slider[0] = 0;
					break;
				case 1024:
					G.in_slider[0] = 1;
					break;
				case 1152:
					G.in_slider[0] = 2;
					break;
				case 1280:
					G.in_slider[0] = 3;
					break;
				case 1600:
					G.in_slider[0] = 4;
					break;
			}
			switch (G.set_scrbit_c) {
				case 16:
					G.in_slider[1] = 0;
					break;
				case 24:
					G.in_slider[1] = 1;
					break;
				case 32:
					G.in_slider[1] = 2;
					break;
			}
			G.in_slider[2] = G.set_viewrange;
			G.in_slider[3] = G.set_terrain;
			G.in_slider[4] = G.set_water;
			G.in_slider[5] = G.set_sky;
			G.in_slider[6] = G.set_effects;
			G.in_slider[7] = G.set_grass;
			G.in_check[0] = G.set_2dfx;
			G.in_check[1] = G.set_lightfx;
			G.in_check[2] = G.set_windsway;
			G.in_check[3] = G.set_fog;
			G.in_check[4] = G.set_hwmultitex;
			G.in_check[5] = G.set_mb;
			G.in_slider[8] = Int(f32(G.set_mb_alpha * 100));
			break;
		//Settings SFX
		case Cmenu_set_sfx:
			G.in_slider[0] = Int(f32(G.set_musicvolume * 100));
			G.in_slider[1] = Int(f32(G.set_fxvolume * 100));
			G.in_input[0] = G.set_name;
			G.in_input[1] = Str(G.set_serverport);
			break;

		//Singleplayer
		case Cmenu_sp:
			G.in_scr_scr = 0;
			//Load Maps
			// 1 = Load first Map Image
			//-1 = Load only Singleplayer Maps
			//load_maps(1,-1)
			load_maps(1, 0);
			break;

		//Singleplayer Load
		case Cmenu_sp_load:
			G.in_scr_scr = 0;
			break;

		//Random Map Settings
		case Cmenu_random:
			G.in_opt[3] = 1;
			G.in_opt[4] = 0;
			G.in_opt[5] = 1;
			G.in_scr_scr = 0;
			break;

		//Multiplayer
		case Cmenu_mp:
			await usgn_setup();
			break;

		//Multiplayer Create Game
		case Cmenu_mp_create:
			if (G.set_sv_name === '') G.set_sv_name = ss(sm(39), G.set_name);
			G.in_input[0] = G.set_sv_name;
			if (G.set_sv_port === 0) G.set_sv_port = G.set_serverport;
			// quirk: the port field shows set_serverport, not set_sv_port
			G.in_input[1] = Str(G.set_serverport);
			G.in_input[2] = G.set_sv_pw;
			if (G.set_sv_playerlimit === 0) G.set_sv_playerlimit = 4;
			G.in_input[3] = Str(G.set_sv_playerlimit);
			load_maps(1, 1);
			if (G.set_sv_map !== '') G.in_win_map = G.set_sv_map;
			break;

		//Credits
		case Cmenu_credits:
			G.in_input[0] = Str(G.set_scry);
			for (Ttbt_ = First(Ttbt); Ttbt_ !== null; Ttbt_ = After(Ttbt, Ttbt_)) {
				Delete(Ttbt, Ttbt_);
			}
			stream = ReadFile('sys\\credits.inf');
			if (stream === 0) RuntimeError('Unable to read sys\\credits.inf');
			while (!Eof(stream)) {
				Ttbt_ = New(Ttbt);
				Ttbt_.txt = ReadLine(stream);
			}
			CloseFile(stream);
			break;
	}
}

//### Menu
/** Function menu() */
export async function menu(): Promise<void> {
	let y = 0;
	let pick: Handle = null;
	let i = 0;
	let j = 0;
	let Tsg_: Tsg | null = null;
	let c = 0;
	let loadtemp = '';
	let Tserver_: Tserver | null = null;
	let over = 0;
	let col = 0;
	let ping = 0;
	let Ttbt_: Ttbt | null = null;

	//Unpaused?
	G.g_unpaused = 1;

	//Input
	getinput();

	//Cam Movement
	//MoveEntity cam,3.*f,0,0
	//Local center=CreatePivot()
	//PointEntity cam,center
	//FreeEntity center

	//Update Items
	cull_items();

	//Render
	UpdateWorld(G.f);
	seq_update();

	e_environment_update_water();
	G.set_debug_rt_render = MilliSecs();
	RenderWorld();
	G.set_debug_rt_render = MilliSecs() - G.set_debug_rt_render;
	await mb_update();
	e_environment_water2dfx();

	//Update
	await cull();

	grass_spread();
	e_environment_update();
	update_state();
	sfx_update();
	up_update();

	//Buttons
	// Select m_menu: the selector is evaluated once
	switch (G.m_menu) {
		//Main
		case Cmenu_main:
			//Title
			DrawImage(G.gfx_title, 200 + idivConst(G.set_scrx - 200, 2), 200);

			y = 0;

			//Adventure
			if (G.game_m_adventure === 1) {
				if (gui_button(5, 5, sm(40))) {
					G.m_section = Csection_game_sp;
					G.set_debug_testmap = 0;
					await load_map('maps\\adventure\\map01.s2', '');
				}
				y = y + 50;
			}

			//Random
			if (G.game_m_random === 1) {
				if (gui_button(5, 5 + y, sm(41))) {
					//randommapcreate()
					await menu_set(Cmenu_random);
				}
				y = y + 50;
			}

			//Singleplayer
			if (G.game_m_singleplayer === 1) {
				if (gui_button(5, 5 + y, sm(42))) await menu_set(Cmenu_sp);
				y = y + 50;
			}

			//Load Savegame
			if (G.game_m_loadsave === 1) {
				if (gui_button(5, 5 + y, sm(144))) {
					await menu_set(Cmenu_sp_load);
					load_savegames();
					G.in_scr_scr = 0;
				}
				y = y + 50;
			}

			//Multiplayer
			if (G.game_m_multiplayer === 1) {
				if (gui_button(5, 5 + y, sm(43))) await menu_set(Cmenu_mp);
				y = y + 50;
			}

			//Settings
			if (gui_button(5, idivConst(G.set_scry, 2) - 25, sm(44))) await menu_set(Cmenu_set_in);

			//Editor
			if (G.game_m_editor === 1) {
				if (gui_button(5, idivConst(G.set_scry, 2) + 25, sm(45))) {
					await editor_ini();
					G.m_section = Csection_editor;
				}
			}

			//Credits
			if (G.game_m_credits === 1) {
				if (gui_button(5, idivConst(G.set_scry, 2) + 75, sm(46))) await menu_set(Cmenu_credits);
			}

			//Quit
			if ((gui_button(5, G.set_scry - 50, sm(47), 1, Cicon_x) | G.in_escape) !== 0) {
				if (await gui_msgdecide(ss(sm(48), G.set_moddir), Cbmpf_red, sm(2), sm(1))) {
					G.m_performquit = 1;
				}
			}

			//Version
			bmpf_txt_r(G.set_scrx - 3, G.set_scry - 17, Cversion, Cbmpf_tiny);

			//Rightclick Explode Fun Stuff ;D
			if (G.in_mhit[2] === 1) {
				pick = CameraPick(G.cam, G.in_mx, G.in_my);
				game_explosion(PickedX(), PickedY(), PickedZ(), 50, 10, 1);
			}
			break;

		//Options Input
		case Cmenu_set_in:
		case Cmenu_set_gfx:
		case Cmenu_set_sfx:
		case Cmenu_set_inscript:
			//Buttons
			if (G.game_scriptkeys > 0) {
				if (gui_button(5, 5, sm(49) + ' (1)')) await menu_set(Cmenu_set_in);
				if (gui_button(5, 55, sm(49) + ' (2)')) await menu_set(Cmenu_set_inscript);
				if (gui_button(5, 105, sm(50))) await menu_set(Cmenu_set_gfx);
				if (gui_button(5, 155, sm(51))) await menu_set(Cmenu_set_sfx);
			} else {
				if (gui_button(5, 5, sm(49))) await menu_set(Cmenu_set_in);
				if (gui_button(5, 55, sm(50))) await menu_set(Cmenu_set_gfx);
				if (gui_button(5, 105, sm(51))) await menu_set(Cmenu_set_sfx);
			}

			if (gui_button(5, G.set_scry - 100, sm(3), 1, Cicon_x)) {
				await menu_set(Cmenu_main, 0);
				load_settings();
				prepare_cache_viewranges();
				G.set_reboot = 0;
			}
			if (gui_button(5, G.set_scry - 50, sm(4), 1, Cicon_ok)) {
				await menu_set(Cmenu_main);
				save_settings();
				prepare_cache_viewranges();
				//Reboot
				if (G.set_reboot === 1) {
					await menu_set(Cmenu_reboot);
				}
			}

			//Window
			// the inner Select reads m_menu again: a button above may just have changed it
			switch (G.m_menu) {
				//Controls
				case Cmenu_set_in:
					DrawImage(G.gfx_win, 215, 0);
					DrawImage(G.gfx_icons, 236, 5, Cicon_options);
					if (G.game_scriptkeys > 0) {
						bmpf_txt(236 + 37, 10, sm(49) + ' (1)');
					} else {
						bmpf_txt(236 + 37, 10, sm(49));
					}
					DrawImage(G.gfx_winbar, 215, 42);

					bmpf_txt(236, 63, sm(52) + ':', 2);
					bmpf_txt(506, 63, sm(53) + ':', 2);

					menu_keysetting(0, sm(54), Ckey_forward);
					menu_keysetting(20, sm(55), Ckey_backward);
					menu_keysetting(40, sm(56), Ckey_left);
					menu_keysetting(60, sm(57), Ckey_right);
					menu_keysetting(80, sm(58), Ckey_jump);
					//menu_keysetting(100,sm$(59),Ckey_laystay)

					menu_keysetting(130, sm(60), Ckey_attack1);
					menu_keysetting(150, sm(61), Ckey_attack2);
					menu_keysetting(170, sm(62), Ckey_next);
					menu_keysetting(190, sm(63), Ckey_prev);
					//menu_keysetting(210,sm$(64),Ckey_drop)

					menu_keysetting(240, sm(65), Ckey_use);
					menu_keysetting(260, sm(66), Ckey_chat);
					menu_keysetting(280, sm(67), Ckey_char);
					menu_keysetting(300, sm(68), Ckey_items);
					menu_keysetting(320, sm(69), Ckey_diary);
					menu_keysetting(340, sm(59), Ckey_sleep);

					if (G.game_m_loadsave === 1) {
						menu_keysetting(360, sm(70), Ckey_quickload);
						menu_keysetting(380, sm(71), Ckey_quicksave);
					}

					bmpf_txt(236, 510, sm(72) + ':');
					if (G.in_slider[0] < 1) G.in_slider[0] = 1;
					bmpf_txt(436, 510, sm(73) + ' ' + Str(f32(f32(0.02) * Float(G.in_slider[0])), 'float'));
					gui_slider(636, 510, 100, 0);
					gui_check(436, 540, sm(74), 0); //Invert
					//gui_check(636,540,sm$(75),1)	;Smooth
					break;

				//Graphics
				case Cmenu_set_gfx:
					DrawImage(G.gfx_win, 215, 0);
					DrawImage(G.gfx_icons, 236, 5, Cicon_options);
					bmpf_txt(236 + 37, 10, sm(50));
					DrawImage(G.gfx_winbar, 215, 42);

					//Resolution
					bmpf_txt(236, 63, sm(76) + ':');
					gui_slider(636, 63, 4, 0);
					switch (G.in_slider[0]) {
						case 0:
							bmpf_txt(436, 63, '800x600');
							break;
						case 1:
							bmpf_txt(436, 63, '1024x768');
							break;
						case 2:
							bmpf_txt(436, 63, '1152x864');
							break;
						case 3:
							bmpf_txt(436, 63, '1280x960');
							break;
						case 4:
							bmpf_txt(436, 63, '1600x1200');
							break;
					}

					//Color Depth
					bmpf_txt(236, 83, sm(77) + ':');
					gui_slider(636, 83, 2, 1);
					switch (G.in_slider[1]) {
						case 0:
							bmpf_txt(436, 83, '16 Bit');
							break;
						case 1:
							bmpf_txt(436, 83, '24 Bit');
							break;
						case 2:
							bmpf_txt(436, 83, '32 Bit');
							break;
					}

					bmpf_txt(236, 123, sm(78) + ':');
					gui_slider(636, 123, 4, 2);
					switch (G.in_slider[2]) {
						case 0:
							bmpf_txt(436, 123, sm(79));
							break;
						case 1:
							bmpf_txt(436, 123, sm(80));
							break;
						case 2:
							bmpf_txt(436, 123, sm(81));
							break;
						case 3:
							bmpf_txt(436, 123, sm(82));
							break;
						case 4:
							bmpf_txt(436, 123, sm(83));
							break;
					}

					bmpf_txt(236, 163, sm(84) + ':');
					gui_slider(636, 163, 2, 3);
					switch (G.in_slider[3]) {
						case 0:
							bmpf_txt(436, 163, sm(86));
							break;
						case 1:
							bmpf_txt(436, 163, sm(87));
							break;
						case 2:
							bmpf_txt(436, 163, sm(88));
							break;
					}

					bmpf_txt(236, 183, sm(90) + ':');
					gui_slider(636, 183, 6, 4);
					switch (G.in_slider[4]) {
						case 0:
							bmpf_txt(436, 183, sm(91));
							break;
						case 1:
							bmpf_txt(436, 183, sm(85));
							break;
						case 2:
							bmpf_txt(436, 183, sm(86));
							break;
						case 3:
							bmpf_txt(436, 183, sm(87));
							break;
						case 4:
							bmpf_txt(436, 183, sm(88));
							break;
						case 5:
							bmpf_txt(436, 183, sm(89));
							break;
						case 6:
							bmpf_txt(436, 183, sm(92));
							break;
					}

					bmpf_txt(236, 203, sm(93) + ':');
					gui_slider(636, 203, 2, 5);
					switch (G.in_slider[5]) {
						case 0:
							bmpf_txt(436, 203, sm(86));
							break;
						case 1:
							bmpf_txt(436, 203, sm(87));
							break;
						case 2:
							bmpf_txt(436, 203, sm(88));
							break;
					}

					bmpf_txt(236, 223, sm(94) + ':');
					gui_slider(636, 223, 2, 6);
					switch (G.in_slider[6]) {
						case 0:
							bmpf_txt(436, 223, sm(86));
							break;
						case 1:
							bmpf_txt(436, 223, sm(87));
							break;
						case 2:
							bmpf_txt(436, 223, sm(88));
							break;
					}

					bmpf_txt(236, 243, sm(95) + ':');
					gui_slider(636, 243, 4, 7);
					switch (G.in_slider[7]) {
						case 0:
							bmpf_txt(436, 243, sm(96));
							break;
						case 1:
							bmpf_txt(436, 243, sm(97));
							break;
						case 2:
							bmpf_txt(436, 243, sm(98));
							break;
						case 3:
							bmpf_txt(436, 243, sm(99));
							break;
						case 4:
							bmpf_txt(436, 243, sm(100));
							break;
					}

					bmpf_txt(236, 283, sm(101) + ':');
					gui_check(436, 283, sm(102), 0);
					gui_check(436, 303, sm(103), 1);
					gui_check(436, 323, sm(104), 2);
					gui_check(436, 343, sm(105), 3);
					//gui_check(436,363,sm$(106),4) Multitexturing Stuff

					//Motion Blur
					bmpf_txt(236, 383, sm(107) + ':');
					gui_check(436, 383, '', 5);
					bmpf_txt(436 + 20, 383, se(153));
					bmpf_txt(436, 403, sm(108));
					gui_slider(636, 403, 100, 8);
					break;

				//Sounds & MP
				case Cmenu_set_sfx:
					//Sounds
					DrawImage(G.gfx_win, 215, 0);
					DrawImage(G.gfx_icons, 236, 5, Cicon_options);
					bmpf_txt(236 + 37, 10, sm(110));
					DrawImage(G.gfx_winbar, 215, 42);

					bmpf_txt(236, 63, sm(111) + ':');
					gui_slider(636, 63, 100, 0);
					if (G.in_slider[0] > 0) {
						bmpf_txt(436, 63, Str(G.in_slider[0]) + '%');
					} else {
						bmpf_txt(436, 63, sm(112));
					}

					bmpf_txt(236, 93, sm(113) + ':');
					gui_slider(636, 93, 100, 1);
					if (G.in_slider[1] > 0) {
						bmpf_txt(436, 93, Str(G.in_slider[1]) + '%');
					} else {
						bmpf_txt(436, 93, sm(112));
					}

					//Multiplayer
					if (G.game_m_multiplayer === 1) {
						DrawImage(G.gfx_winbar, 215, 200);
						DrawImage(G.gfx_icons, 236, 221, Cicon_options);
						bmpf_txt(236 + 37, 226, sm(43));
						DrawImage(G.gfx_winbar, 215, 258);

						bmpf_txt(236, 279, sm(114) + ':');
						gui_input(436, 279, 256, 0);

						bmpf_txt(236, 309, sm(115) + ':');
						gui_input(436, 309, 128, 1);
					}
					break;

				//Controls Script
				case Cmenu_set_inscript:
					DrawImage(G.gfx_win, 215, 0);
					DrawImage(G.gfx_icons, 236, 5, Cicon_options);
					if (G.game_scriptkeys > 0) {
						bmpf_txt(236 + 37, 10, sm(49) + ' (2)');
					} else {
						bmpf_txt(236 + 37, 10, sm(49));
					}
					DrawImage(G.gfx_winbar, 215, 42);

					bmpf_txt(236, 63, sm(52) + ':', 2);
					bmpf_txt(506, 63, sm(53) + ':', 2);

					for (i = 0; i <= 20; i++) {
						if (G.game_scriptkeyn[i] !== '') {
							menu_keysettingscript(i * 20, G.game_scriptkeyn[i], i);
						}
					}
					break;
			}
			break;

		//Reboot
		case Cmenu_reboot:
			if (gui_button(5, G.set_scry - 50, sm(47), 1, Cicon_ok)) {
				G.m_performquit = 1;
			}

			//Window
			DrawImage(G.gfx_win, 215, 0);
			DrawImage(G.gfx_icons, 236, 5, Cicon_options);
			bmpf_txt(236 + 37, 10, sm(120));
			DrawImage(G.gfx_winbar, 215, 42);

			bmpf_txt(236, 63, sm(121));
			bmpf_txt(236, 63 + 20, sm(122));
			bmpf_txt(236, 63 + 60, sm(123));
			bmpf_txt(236, 63 + 80, sm(124));
			break;

		//Singleplayer
		case Cmenu_sp:
			//Window
			DrawImage(G.gfx_win, 215, 0);
			DrawImage(G.gfx_icons, 236, 5, Cicon_options);
			bmpf_txt(236 + 37, 10, sm(42));
			DrawImage(G.gfx_winbar, 215, 42);

			//List Maps
			Color(0, 0, 0);
			Rect(236, 195, 500, 379, 1);
			i = 0;
			j = 0;
			y = 0;
			for (Tsg_ = First(Tsg); Tsg_ !== null; Tsg_ = After(Tsg, Tsg_)) {
				j = j + 1;
				if (j > G.in_scr_scr) {
					if (gui_opt(236 + 5, 200 + i * 20, Tsg_.name, j, 0)) {
						load_map_header('maps\\' + Tsg_.name + '.s2');
					}
					i = i + 1;
					if (i > 18) break;
				}
			}

			//Scroll
			if (gui_ibutton(742, 200, Cicon_up, sm(29), G.in_scr_scr > 0 ? 1 : 0)) {
				G.in_scr_scr = G.in_scr_scr - 1;
			}
			if (gui_ibutton(742, 542 - 32 - 5, Cicon_down, sm(30), i > 18 ? 1 : 0)) {
				G.in_scr_scr = G.in_scr_scr + 1;
			}
			if (G.in_mzs > 0 && G.in_scr_scr > 0) G.in_scr_scr = G.in_scr_scr - 1;
			if (G.in_mzs < 0 && i > 18) G.in_scr_scr = G.in_scr_scr + 1;

			c = 0;
			for (Tsg_ = First(Tsg); Tsg_ !== null; Tsg_ = After(Tsg, Tsg_)) {
				c = c + 1;
			}
			G.in_scr_scr = gui_scrollbar(742, 237, 500 - 237, c, G.in_scr_scr, 19);

			//Determine & Show
			loadtemp = '';
			i = 0;
			for (Tsg_ = First(Tsg); Tsg_ !== null; Tsg_ = After(Tsg, Tsg_)) {
				i = i + 1;
				if (i === G.in_opt[0]) {
					loadtemp = Tsg_.name;
				}
			}
			if (loadtemp === '') {
				Color(0, 0, 0);
				Rect(236, 63, 96, 72, 1);
				bmpf_txt(336, 63, sm(156), Cbmpf_red);
			} else {
				if (G.map_image !== 0) DrawBlock(G.map_image, 236, 63);
				bmpf_txt(336, 63, sm(33) + ':');
				bmpf_txt(450, 63, loadtemp);
				bmpf_txt(336, 83, sm(158) + ':');
				bmpf_txt(450, 83, G.sg_date);
				bmpf_txt(336, 103, sm(35) + ':');
				bmpf_txt(450, 103, G.sg_time + ' ' + sm(36));
			}

			//Load
			if (gui_ibutton(742, 542, Cicon_load, sm(5), loadtemp !== '' ? 1 : 0)) {
				G.m_section = Csection_game_sp;
				G.m_menu = 0;
				G.set_debug_testmap = 0;
				await load_map('maps\\' + loadtemp + '.s2', '');
			}

			//Buttons
			if (gui_button(5, 5, sm(5), loadtemp !== '' ? 1 : 0)) {
				G.m_section = Csection_game_sp;
				G.m_menu = 0;
				G.set_debug_testmap = 0;
				await load_map('maps\\' + loadtemp + '.s2', '');
			}

			if (gui_button(5, G.set_scry - 50, sm(131), 1, Cicon_x)) await menu_set(Cmenu_main);
			break;

		//Singleplayer Load
		case Cmenu_sp_load:
			//Window
			DrawImage(G.gfx_win, 215, 0);
			DrawImage(G.gfx_icons, 236, 5, Cicon_load);
			bmpf_txt(236 + 37, 10, sm(154));
			DrawImage(G.gfx_winbar, 215, 42);

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
				if (G.map_image !== 0) DrawBlock(G.map_image, 236, 63);
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
				G.m_section = Csection_game_sp;
				G.m_menu = 0;
				G.set_debug_testmap = 0;
				await load_map('saves\\' + loadtemp + '.sav', '');
			}

			//Buttons
			if (gui_button(5, 5, sm(5), loadtemp !== '' ? 1 : 0)) {
				G.m_section = Csection_game_sp;
				G.m_menu = 0;
				G.set_debug_testmap = 0;
				await load_map('saves\\' + loadtemp + '.sav', '');
			}

			if (gui_button(5, G.set_scry - 50, sm(131), 1, Cicon_x)) await menu_set(Cmenu_main);
			break;

		//Random Map Settings
		case Cmenu_random:
			//Window
			DrawImage(G.gfx_win, 215, 0);
			DrawImage(G.gfx_icons, 236, 5, Cicon_all);
			bmpf_txt(236 + 37, 10, sm(41));
			DrawImage(G.gfx_winbar, 215, 42);

			//Size
			bmpf_txt(236, 63, se(30) + ':');
			gui_opt(436, 63, se(31), 1, 3);
			gui_opt(436, 63 + 20, se(32), 3, 3);
			gui_opt(436, 63 + 40, se(33), 4, 3);

			//Terrain
			bmpf_txt(236, 143, se(34) + ':');
			gui_opt(436, 143, se(35), 0, 4);
			gui_opt(436, 143 + 20, se(36), 1, 4);
			gui_opt(436, 143 + 40, se(37), 2, 4);
			gui_opt(436, 143 + 60, se(38), 3, 4);
			gui_opt(436, 143 + 80, se(39), 4, 4);
			gui_opt(436, 143 + 100, se(40), 5, 4);

			//Profile
			bmpf_txt(236, 283, se(129) + ':');
			y = 0;
			Color(0, 0, 0);
			Rect(431, 278, 306, 298, 1);
			j = 0;
			y = 0;
			for (i = 1; i <= G.Crandom_c; i++) {
				if (G.Drprofile[i] !== '') {
					j = j + 1;
					if (j > G.in_scr_scr) {
						gui_opt(436, 283 + y * 20, G.Drprofile[i], i, 5);
						y = y + 1;
						if (y > 13) break;
					}
				}
			}

			//Scroll
			if (gui_ibutton(742, 283, Cicon_up, sm(29), G.in_scr_scr > 0 ? 1 : 0)) {
				G.in_scr_scr = G.in_scr_scr - 1;
			}
			if (gui_ibutton(742, 542 - 37, Cicon_down, sm(30), y > 13 ? 1 : 0)) {
				G.in_scr_scr = G.in_scr_scr + 1;
			}

			if (G.in_mzs > 0 && G.in_scr_scr > 0) G.in_scr_scr = G.in_scr_scr - 1;
			if (G.in_mzs < 0 && y > 13) G.in_scr_scr = G.in_scr_scr + 1;

			c = 0;
			for (i = 1; i <= G.Crandom_c; i++) {
				if (G.Drprofile[i] !== '') c = c + 1;
			}
			G.in_scr_scr = gui_scrollbar(742, 320, 180, c, G.in_scr_scr, 14);

			//Load
			if (gui_ibutton(742, 542, Cicon_ok, sm(5))) {
				load_randommap(G.in_opt[5]);
				await randommapcreate();
			}

			//Buttons
			if (gui_button(5, 5, sm(5))) {
				load_randommap(G.in_opt[5]);
				await randommapcreate();
			}

			if (gui_button(5, G.set_scry - 50, sm(131), 1, Cicon_x)) await menu_set(Cmenu_main);
			break;

		//Multiplayer
		case Cmenu_mp:
			//Window
			DrawImage(G.gfx_win, 215, 0);
			DrawImage(G.gfx_icons, 236, 5, Cicon_options);
			bmpf_txt(236 + 37, 10, sm(125));
			DrawImage(G.gfx_winbar, 215, 42);

			//Buttons
			if (gui_button(5, 5, sm(125))) await menu_set(Cmenu_mp);
			if (gui_button(5, 5 + 50, sm(126), 0)) await menu_set(Cmenu_mp_lan);
			if (gui_button(5, 5 + 100, sm(127))) await menu_set(Cmenu_mp_create);

			if (gui_button(5, G.set_scry - 50, sm(131), 1, Cicon_x)) await menu_set(Cmenu_main);

			//Scrolltext
			bmpf_txt_scroll(236, 60, G.in_usgn_msg, 0, 740, G.in_usgn_msgscr);
			G.in_usgn_msgscr = f32(G.in_usgn_msgscr - f32(1 * G.f));
			if (G.in_t500go !== 0) {
				if (G.in_usgn_msgscr < -bmpf_len(G.in_usgn_msg)) {
					G.in_usgn_msgscr = 500;
				}
			}

			//Descriptions
			bmpf_txt(260, 80, sm(128), Cbmpf_dark);
			bmpf_txt(450, 80, sm(33), Cbmpf_dark);
			bmpf_txt(620, 80, sm(129), Cbmpf_dark);
			bmpf_txt(690, 80, sm(130), Cbmpf_dark);

			//Black Rect
			Color(0, 0, 0);
			Rect(236, 100, 500, 473, 1);

			//List Servers
			i = 0;
			j = 0;
			for (Tserver_ = First(Tserver); Tserver_ !== null; Tserver_ = After(Tserver, Tserver_)) {
				if (Tserver_.name !== '') {
					j = j + 1;
					if (j > G.in_scr_scr) {
						//Over / Click
						over = 0;
						if (G.in_mx >= 236) {
							if (G.in_my >= 105 + i * 20) {
								if (G.in_mx <= 736) {
									if (G.in_my < 105 + i * 20 + 20) {
										over = 1;
										gui_tt(G.in_mx, G.in_my, Tserver_.name + ' (' + DottedIP(Tserver_.ip) + ':' + Str(Tserver_.port) + ') ' + sm(132));
										//Click
										if (G.in_mhit[1] !== 0) {
											await usgn_joinserver(Tserver_.ip, Tserver_.port);
										}
									}
								}
							}
						}

						//Password
						if (Tserver_.password === 1) {
							if (over !== 0) {
								DrawImage(G.gfx_icons, 233, 99 + i * 20, Cicon_pw);
							} else {
								DrawImage(G.gfx_icons_passive, 233, 99 + i * 20, Cicon_pw);
							}
						}

						//Name
						bmpf_txt_ml(260, 105 + i * 20, Tserver_.name, over, 450 - 5);

						//Map
						bmpf_txt_ml(450, 105 + i * 20, Tserver_.map, over, 620 - 5);

						//Players
						col = Cbmpf_yellow;
						if (Tserver_.players === Tserver_.maxplayers) col = Cbmpf_red;
						bmpf_txt(620, 105 + i * 20, Str(Tserver_.players) + '/' + Str(Tserver_.maxplayers), col);

						//Ping
						if (Tserver_.ping !== 0) {
							ping = Tserver_.ping;
							col = Cbmpf_green;
							if (ping > 100) col = Cbmpf_yellow;
							if (ping > 200) col = Cbmpf_red;
							bmpf_txt(690, 105 + i * 20, Str(ping), col);
						}

						i = i + 1;
						if (i > 22) break;
					}
				}
			}

			//Scroll
			if (gui_ibutton(742, 100, Cicon_up, sm(29), G.in_scr_scr > 0 ? 1 : 0)) {
				G.in_scr_scr = G.in_scr_scr - 1;
			}
			if (gui_ibutton(742, 542, Cicon_down, sm(30), i > 22 ? 1 : 0)) {
				G.in_scr_scr = G.in_scr_scr + 1;
			}

			//Update Net Stuff
			if (G.udp !== 0) {
				usgn_update();
			}
			break;

		//Multiplayer Create Game
		case Cmenu_mp_create:
			//Window
			DrawImage(G.gfx_win, 215, 0);
			DrawImage(G.gfx_icons, 236, 5, Cicon_options);
			bmpf_txt(236 + 37, 10, sm(127));
			DrawImage(G.gfx_winbar, 215, 42);

			//Buttons
			if (gui_button(5, 5, sm(125))) await menu_set(Cmenu_mp);
			if (gui_button(5, 5 + 50, sm(126), 0)) await menu_set(Cmenu_mp_lan);
			if (gui_button(5, 5 + 100, sm(127))) await menu_set(Cmenu_mp_create);

			if (gui_button(5, G.set_scry - 50, sm(131), 1, Cicon_x)) await menu_set(Cmenu_main);

			//Server Name
			bmpf_txt(236, 63, sm(133) + ':');
			gui_input(436, 63, 256, 0);

			//Server Port
			bmpf_txt(236, 93, sm(115) + ':');
			gui_input(436, 93, 64, 1);

			//Server Map
			bmpf_txt(236, 133, sm(33) + ':');

			if (G.in_win_map === '') {
				bmpf_txt(436, 133, sm(134), Cbmpf_red);
				Color(0, 0, 0);
				Rect(436, 163, 96, 72, 1);
			} else {
				bmpf_txt(436, 133, G.in_win_map);
				if (G.map_image !== 0) DrawBlock(G.map_image, 436, 163);
			}

			//Browse
			if (gui_ibutton(742, 133, Cicon_dir, sm(135))) {
				if (!(await gui_win_map(1, G.in_win_map))) {
					if (G.in_win_map !== '') load_map_header('maps\\' + G.in_win_map + '.s2');
				}
			}

			//Server Password
			bmpf_txt(236, 243, sm(136) + ':');
			gui_input(436, 243, 128, 2);

			//Player Limit
			bmpf_txt(236, 273, sm(137) + ':');
			gui_input(436, 273, 64, 3);

			//Start
			if (gui_ibutton(742, 542, Cicon_ok, sm(127))) {
				//Cache Values
				G.set_sv_name = Trim(G.in_input[0]);
				if (Len(G.set_sv_name) > 20) G.set_sv_name = Trim(Left(G.set_sv_name, 20));
				if (G.set_sv_name === '') G.set_sv_name = 'Server';
				G.set_sv_port = Abs(Int(G.in_input[1]));
				G.set_sv_ip = 0;
				G.set_sv_map = G.in_win_map;
				G.set_sv_pw = G.in_input[2];
				G.set_sv_playerlimit = Int(G.in_input[3]);
				if (G.set_sv_playerlimit < 1) G.set_sv_playerlimit = 1;
				if (G.set_sv_playerlimit > 4) G.set_sv_playerlimit = 4;
				//Setup
				// quirk: menu_set saves the page again from the input fields (untrimmed name, unclamped limit, signed port)
				await menu_set(Cmenu_main);
				await usgn_hostserver(G.set_sv_port);
			}
			break;

		//Credits
		case Cmenu_credits:
			//Scroll
			G.in_input[0] = Str(f32(Float(G.in_input[0]) - Float(f32(1 * G.f))), 'float');

			//Draw
			y = Int(G.in_input[0]);
			for (Ttbt_ = First(Ttbt); Ttbt_ !== null; Ttbt_ = After(Ttbt, Ttbt_)) {
				if (y + 20 > 0 && y < G.set_scry) {
					if (Left(Ttbt_.txt, 1) === '!') {
						bmpf_txt_c(idivConst(G.set_scrx, 2), y, Mid(Ttbt_.txt, 4, -1), Int(Mid(Ttbt_.txt, 2, 1)));
					} else {
						bmpf_txt_c(idivConst(G.set_scrx, 2), y, Ttbt_.txt);
					}
				}
				y = y + 20;
			}
			if (y < 0) G.in_input[0] = Str(G.set_scry);

			//Quit Button
			if (gui_button(5, G.set_scry - 50, sm(131), 1, Cicon_x)) {
				await menu_set(Cmenu_main);
			}
			break;
	}

	//Particles
	p_update();

	//Sequence Blend
	seq_blend();

	//Endinput
	endinput();

	//### Hotkeys

	//Checkmap
	if (KeyHit(88)) {
		await editor_testmap(1);
	}
}

//### Menu Keysetting
/** Function menu_keysetting(y,name$,id) */
export function menu_keysetting(y: number, name: string, id: number): void {
	let over = 0;
	let gotkey = 0;
	let i = 0;
	if (G.in_getkey !== id) {
		//Input
		over = 0;
		if (G.in_getkey === -1) {
			if (G.in_my >= 83 + y) {
				if (G.in_my <= 83 + y + 20) {
					if (G.in_mx >= 236) {
						if (G.in_mx <= 775) {
							over = 1;
							if (G.in_mhit[1] !== 0) {
								G.in_getkey = id;
								play(G.sfx_click);
							}
						}
					}
				}
			}
		}
		//Draw
		bmpf_txt(236, 83 + y, name, over);
		bmpf_txt(506, 83 + y, G.in_keyname[G.in_keys[id]], over);
	} else {
		//Draw
		bmpf_txt(236, 83 + y, name, 1);
		bmpf_txt(506, 83 + y, sm(138), G.in_cursor);

		//Getcode
		gotkey = 0;
		if (G.in_mhit[1] !== 0) {
			gotkey = 256;
			G.in_mhit[1] = 0;
			G.in_mdown[1] = 0;
		}
		if (G.in_mhit[2] !== 0) gotkey = 257;
		if (G.in_mhit[3] !== 0) gotkey = 258;
		if (G.in_mhit[4] !== 0) gotkey = 259;
		if (G.in_mhit[5] !== 0) gotkey = 260;
		if (Int(G.in_mzs) !== 0) {
			if (Int(G.in_mzs) > 0) {
				gotkey = 261;
			} else {
				gotkey = 262;
			}
		}
		if (gotkey === 0) {
			for (i = 2; i <= 255; i++) {
				if (KeyHit(i)) {
					if (G.in_keyname[i] !== '') {
						gotkey = i;
						break;
					}
				}
			}
			if (G.in_escape === 1) {
				G.in_getkey = -1;
				gotkey = 0;
				play(G.sfx_fail);
			}
		}

		//Set
		if (gotkey !== 0) {
			for (i = 0; i <= 20; i++) {
				if (G.in_keys[i] === gotkey) G.in_keys[i] = 0;
				if (G.game_scriptkey[i] === gotkey) G.game_scriptkey[i] = 0;
			}
			G.in_keys[id] = gotkey;
			G.in_getkey = -1;
			play(G.sfx_click);
		}
	}
}

//### Menu Keysetting Script
/** Function menu_keysettingscript(y,name$,id) */
export function menu_keysettingscript(y: number, name: string, id: number): void {
	let over = 0;
	let gotkey = 0;
	let i = 0;
	if (G.in_getkey !== id) {
		//Input
		over = 0;
		if (G.in_getkey === -1) {
			if (G.in_my >= 83 + y) {
				if (G.in_my <= 83 + y + 20) {
					if (G.in_mx >= 236) {
						if (G.in_mx <= 775) {
							over = 1;
							if (G.in_mhit[1] !== 0) {
								G.in_getkey = id;
								play(G.sfx_click);
							}
						}
					}
				}
			}
		}
		//Draw
		bmpf_txt(236, 83 + y, name, over);
		bmpf_txt(506, 83 + y, G.in_keyname[G.game_scriptkey[id]], over);
	} else {
		//Draw
		bmpf_txt(236, 83 + y, name, 1);
		bmpf_txt(506, 83 + y, sm(138), G.in_cursor);

		//Getcode
		gotkey = 0;
		if (G.in_mhit[1] !== 0) {
			gotkey = 256;
			G.in_mhit[1] = 0;
			G.in_mdown[1] = 0;
		}
		if (G.in_mhit[2] !== 0) gotkey = 257;
		if (G.in_mhit[3] !== 0) gotkey = 258;
		if (G.in_mhit[4] !== 0) gotkey = 259;
		if (G.in_mhit[5] !== 0) gotkey = 260;
		if (Int(G.in_mzs) !== 0) {
			if (Int(G.in_mzs) > 0) {
				gotkey = 261;
			} else {
				gotkey = 262;
			}
		}
		if (gotkey === 0) {
			for (i = 2; i <= 255; i++) {
				if (KeyHit(i)) {
					if (G.in_keyname[i] !== '') {
						gotkey = i;
						break;
					}
				}
			}
			if (G.in_escape === 1) {
				G.in_getkey = -1;
				gotkey = 0;
				play(G.sfx_fail);
			}
		}

		//Set
		if (gotkey !== 0) {
			for (i = 0; i <= 20; i++) {
				if (G.in_keys[i] === gotkey) G.in_keys[i] = 0;
				if (G.game_scriptkey[i] === gotkey) G.game_scriptkey[i] = 0;
			}
			G.game_scriptkey[id] = gotkey;
			G.in_getkey = -1;
			play(G.sfx_click);
		}
	}
}
