/**
 * ScriptHost, part "script2": the game side of the script commands of
 * script/commands/interface.ts, world.ts and returns.ts, i.e. the Case blocks
 * of parse_commands() in parser_commands.bb lines 2188-5434 (sections
 * Interface, Diary, MAP INDICATORS, INFOS, BUILDINGS, SEQUENCE, EFFECTS,
 * SOUNDS, MODEL, STATES, FREE, RETURN, AI).
 *
 * Each method is the rest of the original Case block after its parameters
 * were read by the handler (which documents the parameters next to the Host
 * interface). The original statements are kept in their order; the comments
 * starting with a capital letter after "//" are the original ones.
 *
 * Locals of parse_commands that are really globals are written through G
 * here although the handler read them into its own locals: tmp_x#, tmp_y#,
 * tmp_z# ("model", "buildsetup"), TCstate ("statecolor", "statesize",
 * "statevalue", "getstatevalue"), TCinfo ("hideindicators", ...).
 */
import {
	CopyEntity,
	CreatePivot,
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
	EntityTexture,
	EntityType,
	EntityX,
	EntityY,
	EntityYaw,
	EntityZ,
	FreeEntity,
	HideEntity,
	PositionEntity,
	RotateEntity,
	ScaleEntity,
	type Handle,
	type Texture
} from '../../bb3d';
import { Abs, Int, Len, Rand, Replace, Rnd, SEP_LINE, Str, f32 } from '../../blitz';
import { FreeImage, SaveImage } from '../../gfx2d';
import { FlushKeys } from '../../input';
import type { ParseCtx } from '../../script/api';
import type { ScriptHost } from '../../script/host';
import { ai_behavioursignal, ai_signal, ai_typesignal, ai_unitmode } from '../ai_signals';
import { ai_getbehaviour } from '../ai_units';
import {
	Cbmpf_yellow,
	Cclass_info,
	Cclass_item,
	Cclass_object,
	Cclass_state,
	Cclass_unit,
	Cicon_ok,
	Cmenu_if_buildsetup,
	Cmenu_if_clickscreen,
	Cmenu_if_cracklock,
	Cmenu_if_diary,
	Cmenu_if_dlg,
	Cmenu_if_items,
	Cmenu_if_map,
	Cmenu_if_movie,
	Cmenu_if_msg,
	Cmenu_if_selplace,
	Cp_flash,
	Cp_spawn,
	Cp_subsplatter,
	Cpeakblur,
	Cpm_in,
	Cpm_out,
	Cres_image,
	Cres_mesh,
	Cres_texture,
	Csection_menu,
	Cstate_ai_stick,
	Cstate_link,
	Cstate_pc_custom,
	Cworld_col,
	Cworld_size
} from '../consts';
import {
	Ditem_autofade,
	Ditem_behaviour,
	Ditem_health,
	Ditem_mat,
	Ditem_radius,
	Ditem_size,
	Dobject_autofade,
	Dobject_behaviour,
	Dobject_col,
	Dobject_mat,
	Dobject_size,
	Dobject_swayspeed,
	Dunit_behaviour,
	Dunit_col,
	Dunit_colxr,
	Dunit_colyr,
	Dunit_eyes,
	Dunit_mat,
	Dunit_size
} from '../defs_arrays';
import { e_environment_update_light, e_tery } from '../e_environment';
import { defer } from '../flow';
import { genmap } from '../functions';
import { game_buildsetup_start } from '../game_build';
import { game_explosion, game_useasweapon } from '../game_functions';
import { seq_addevent, seq_start } from '../game_sequences';
import { gui_msg, gui_msgdecide, gui_msginput, gui_win_image } from '../gui';
import { ha_distance, ha_free, ha_freespace, ha_idinrange, ha_inrange, ha_killed, ha_type } from '../handle_all';
import { info_area, info_setuploudspeaker, info_setupsprite, info_spawncontrol, info_vts } from '../handle_infos';
import { con_item, countstored_items, free_item } from '../handle_items';
import { alpha_object, con_object } from '../handle_objects';
import { free_state, look_state, set_state } from '../handle_states';
import { con_unit } from '../handle_units';
import { if_centerpos, if_exchange, if_msg, if_quickslot } from '../interface';
import { load_image } from '../load_functions';
import { get_material } from '../load_materials';
import { sm } from '../load_strings';
import { parent_h } from '../parentchild';
import { parse_dialogue } from '../parser_dialogue';
import { parse_kill_get } from '../parser_functions';
import { p_add, p_parent } from '../particles';
import { load_res } from '../ressources';
import { RT } from '../rt';
import { sfx, sfx_music, sfx_play, stopsounds } from '../sfx';
import { G } from '../state';
import {
	After,
	Delete,
	First,
	New,
	Tbui,
	Tcom,
	Tcscr,
	Tdefparam,
	Tinfo,
	Titem,
	Tobject,
	Tp,
	Tstate,
	Tunit,
	Tx,
	isNull
} from '../types';

export const host: Partial<ScriptHost> = {
	/** set_debug (the "exchange" handler prints its error only in debug mode) */
	set_debug: () => G.set_debug,

	//################################################# Interface

	//CloseMenu
	/** Case "closemenu" (parser_commands.bb:2188) */
	cmd_closemenu(_P: ParseCtx): void {
		if (G.m_section !== Csection_menu) {
			G.m_menu = 0;
			G.in_pc_menu = 0;
		}
	},

	//Map
	/** Case "map" (parser_commands.bb:2195) */
	cmd_map(_P: ParseCtx): void {
		if (G.m_section !== Csection_menu) {
			G.m_menu = Cmenu_if_map;
		}
	},

	//Equip
	/** Case "equip" (parser_commands.bb:2201) */
	cmd_equip(_P: ParseCtx, typ: number | undefined): void {
		if (typ !== undefined) {
			if (typ > 0 && typ <= G.Citem_count) {
				game_useasweapon(typ);
			}
		} else {
			if (G.m_menu === Cmenu_if_items) if_quickslot();
		}
	},

	//Message
	/** Case "msg" (parser_commands.bb:2212) */
	if_msg(_P: ParseCtx, msg: string, col: number, time: number): void {
		if_msg(msg, col, time);
	},

	//Messagebox
	/** Case "msgbox" (parser_commands.bb:2225) */
	cmd_msgbox(_P: ParseCtx, title: string, text: string | undefined): void {
		let i = 0;
		G.in_msgtitle = title; //Title
		if (text !== undefined) {
			G.in_msgtext = text;
			if (G.m_section !== Csection_menu) {
				G.m_menu = Cmenu_if_msg;
			}
		}
		//Free Buttons
		for (i = 0; i <= 9; i++) {
			G.in_sb[i] = 0;
		}
		//Closeblock
		G.in_blockclose = G.ms;
	},

	//Message Extend
	/** Case "msg_extend" (parser_commands.bb:2264) */
	cmd_msg_extend(_P: ParseCtx, text: string): void {
		G.in_msgtext = G.in_msgtext + SEP_LINE + text;
	},

	//Message Replace
	/** Case "msg_replace" (parser_commands.bb:2290) */
	cmd_msg_replace(_P: ParseCtx, from: string, to: string): void {
		G.in_msgtext = Replace(G.in_msgtext, from, to);
	},

	//Message Win
	/** Case "msgwin" (parser_commands.bb:2298) */
	gui_msg(_P: ParseCtx, title: string, col: number, image: string): void {
		// deferred: the script interpreter is synchronous; the window opens after the script has finished
		defer(() => gui_msg(title, col, image));
	},

	//Image Win
	/** Case "imagewin" (parser_commands.bb:2306) */
	gui_win_image(_P: ParseCtx, image: string): void {
		// deferred: the script interpreter is synchronous; the window opens after the script has finished
		defer(async () => {
			await gui_win_image(image);
		});
	},

	//Decision Win
	/** Case "decisionwin" (parser_commands.bb:2311) */
	gui_msgdecide(_P: ParseCtx, title: string, col: number, cancel: string, okay: string, image: string): string {
		// unmapped: needs an asynchronous interpreter
		// (p_return$=gui_msgdecide(...): the window opens deferred, the script gets the "cancel" result)
		defer(async () => {
			await gui_msgdecide(title, col, cancel, okay, image);
		});
		return '0';
	},

	//Input Win
	/** Case "inputwin" (parser_commands.bb:2326) */
	gui_msginput(_P: ParseCtx, title: string, col: number, cancel: string, okay: string, image: string): string {
		// unmapped: needs an asynchronous interpreter
		// (p_return$=gui_msginput(...): the window opens deferred, the script gets the "cancel" result)
		defer(async () => {
			await gui_msginput(title, col, cancel, okay, image);
		});
		return '';
	},

	//Button
	/** Case "button" (parser_commands.bb:2341) */
	cmd_button(_P: ParseCtx, id: number, title: string, frame: string, scr: string | undefined): void {
		//Assign / Buffer Source
		if (scr !== undefined) {
			G.in_sb_scr[id] = scr;
		}
		//Setup Button
		G.in_sb[id] = 1;
		G.in_sb_icon[id] = Int(frame); // quirk: "frame" is the string frame$: an image path gives icon 0 here
		G.in_sb_txt[id] = title;
		G.in_sb_handle[id] = 0;
		if (Len(frame) > 2) {
			G.in_sb_handle[id] = load_res(frame, Cres_image, 1);
			if (G.in_sb_handle[id] === 0) {
				G.in_sb_icon[id] = Cicon_ok;
			} else {
				G.in_sb_icon[id] = -1;
			}
		}
	},

	//Exchange
	/** Case "exchange" (parser_commands.bb:2397) */
	cmd_exchange(_P: ParseCtx, classint: number, id: number, allowstore: number, types: string): void {
		if_exchange(classint, id, allowstore, types);
		//Closeblock
		G.in_blockclose = G.ms;
	},

	//SelectPlace
	/** Case "selectplace" (parser_commands.bb:2423) */
	cmd_selectplace(_P: ParseCtx, title: string, height: number, env_class: number, env_id: number): void {
		G.pc_sp_txt = title; //Title
		G.pc_sp_height = f32(height);
		G.pc_sp_x = 0;
		G.pc_sp_y = 0;
		G.pc_sp_z = 0;
		G.pc_sp_class = env_class;
		G.pc_sp_id = env_id;
		if (G.m_section !== Csection_menu) {
			G.m_menu = Cmenu_if_selplace;
		}
		//Closeblock
		G.in_blockclose = G.ms;
	},

	//Selectplace Stuff
	/** Case "selectplace_x" (parser_commands.bb:2441) */
	cmd_selectplace_x(_P: ParseCtx): string {
		return Str(G.pc_sp_x, 'float');
	},

	//Selectplace Stuff
	/** Case "selectplace_y" (parser_commands.bb:2445) */
	cmd_selectplace_y(_P: ParseCtx): string {
		return Str(G.pc_sp_y, 'float');
	},

	//Selectplace Stuff
	/** Case "selectplace_z" (parser_commands.bb:2449) */
	cmd_selectplace_z(_P: ParseCtx): string {
		return Str(G.pc_sp_z, 'float');
	},

	//Process
	/** Case "process" (parser_commands.bb:2453) */
	cmd_process(_P: ParseCtx, title: string, time: number, event: string): void {
		G.in_pc_custom = title; //Title
		G.in_pc_customt = time; //Time
		G.in_pc_event = event; //Event
		//Start Custom Process
		G.pc_typ = Cstate_pc_custom;
		G.pc_gt = G.gt;
		G.in_focus = G.pc_typ;
		G.in_pc_menu = 0;
		if (G.m_section !== Csection_menu) {
			if (G.m_menu !== 0) {
				G.in_pc_menu = G.m_menu;
				G.in_pc_menu_x = G.in_mx;
				G.in_pc_menu_y = G.in_my;
				G.m_menu = 0;
			}
		}
	},

	//Crack Lock
	/** Case "cracklock" (parser_commands.bb:2480) */
	cmd_cracklock(_P: ParseCtx, title: string, mode: number, code: string, env_class: number, env_id: number): void {
		// (the original flushes the keys before it reads the parameters)
		FlushKeys();
		G.pl_cl_title = title; //Title
		G.pc_cl_mode = mode; //Mode
		G.pc_cl_code = code; //Code
		G.pc_cl_class = env_class;
		G.pc_cl_id = env_id;
		G.pc_cl_pos = 1;
		if (G.m_section !== Csection_menu) {
			G.m_menu = Cmenu_if_cracklock;
		}
		//Closeblock
		G.in_blockclose = G.ms;
	},

	//interface txt
	/** Case "text" (parser_commands.bb:2497) */
	cmd_text(_P: ParseCtx, id: number, txt: string, font: number, x: number, y: number, align: number): void {
		//Setup interface text
		G.in_sitxt[id] = 1;
		G.in_sitxt_txt[id] = txt; //Text
		G.in_sitxt_font[id] = font; //Font
		G.in_sitxt_align[id] = align; //Ausrichtung
		G.in_sitxt_x[id] = x; //X
		G.in_sitxt_y[id] = y; //Y
	},

	//interface image
	/** Case "image" (parser_commands.bb:2525) */
	cmd_image(_P: ParseCtx, id: number, path: string, x: number | undefined, y: number | undefined, mask: number): void {
		//Setup interface image
		if (G.in_siimg[id] !== 0) {
			FreeImage(G.in_siimg[id]);
			G.in_siimg[id] = 0;
		}
		G.in_siimg_mask[id] = 1;
		if (path !== '') {
			G.in_siimg[id] = load_image(path);
			G.in_siimg_x[id] = x as number; //X
			G.in_siimg_y[id] = y as number; //Y
			G.in_siimg_mask[id] = mask; //Mask
		}
	},

	//Dialogue
	/** Case "dialogue" (parser_commands.bb:2551) */
	cmd_dialogue(_P: ParseCtx, page: string, txt: string | undefined): void {
		G.in_msgtitle = 'Dialogue';
		G.in_dlg_page = page; //Page
		if (txt !== undefined) {
			G.in_dlg = txt;
			if (G.m_menu === Cmenu_if_buildsetup) {
				FreeEntity(G.in_buildsetup_dummy);
			}
			if (G.m_section !== Csection_menu) {
				G.m_menu = Cmenu_if_dlg;
			}
			G.in_scr_scr = 0;
			//Parse
			parse_dialogue(G.in_dlg_page);
			//Closeblock
			G.in_blockclose = G.ms;
		}
	},

	//Menu
	/** Case "menu" (parser_commands.bb:2587) */
	cmd_menu(_P: ParseCtx): string {
		return Str(G.m_menu);
	},

	//Clickscreen
	/** Case "cscr" (parser_commands.bb:2592) */
	cmd_cscr(_P: ParseCtx, image: string, close: number): void {
		let Tcscr_: Tcscr | null = null;
		if (G.in_clickscreenimage !== 0) {
			FreeImage(G.in_clickscreenimage);
			G.in_clickscreenimage = 0;
		}
		for (Tcscr_ = First(Tcscr); Tcscr_ !== null; Tcscr_ = After(Tcscr, Tcscr_)) {
			if (Tcscr_.image !== 0) FreeImage(Tcscr_.image);
			Delete(Tcscr, Tcscr_);
		}
		G.in_clickscreenx = close; //Close (1 when not given)
		if (image !== '') {
			G.in_clickscreenimage = load_image(image);
		}
		G.m_menu = Cmenu_if_clickscreen;
	},

	//Clickscreen Text
	/** Case "cscr_text" (parser_commands.bb:2615) */
	cmd_cscr_text(_P: ParseCtx, txt: string, x: number, y: number, col: number, align: number, tooltip: string, event: string): void {
		let Tcscr_: Tcscr | null = null;
		Tcscr_ = New(Tcscr);
		Tcscr_.typ = 1;
		Tcscr_.txt = txt; //Text
		Tcscr_.x = x; //X
		Tcscr_.y = y; //Y
		Tcscr_.col = col; //Col
		Tcscr_.align = align; //Alignment
		Tcscr_.tooltip = tooltip; //Tooltip
		Tcscr_.event = event; //Event
	},

	//Clickscreen Image
	/** Case "cscr_image" (parser_commands.bb:2663) */
	cmd_cscr_image(_P: ParseCtx, path: string, x: number, y: number, tooltip: string, event: string): void {
		let Tcscr_: Tcscr | null = null;
		Tcscr_ = New(Tcscr);
		Tcscr_.typ = 2;
		Tcscr_.image = load_image(path); //Image
		Tcscr_.x = x; //X
		Tcscr_.y = y; //Y
		Tcscr_.tooltip = tooltip; //Tooltip
		Tcscr_.event = event; //Event
	},

	//Savemapimage
	/** Case "savemapimage" (parser_commands.bb:2705) */
	cmd_savemapimage(_P: ParseCtx, path: string, size: number): void {
		genmap(size);
		SaveImage(G.map_mapimage, path);
		if (size !== 256) genmap(256);
	},

	//lockcombi
	/** Case "lockcombi" (parser_commands.bb:2718) */
	cmd_lockcombi(_P: ParseCtx, combi: string): void {
		let classint = 0;
		let Tcom_: Tcom | null = null;
		let Tx_: Tx | null = null;
		classint = 0;
		for (Tcom_ = First(Tcom); Tcom_ !== null; Tcom_ = After(Tcom, Tcom_)) {
			if (Tcom_.mode === 2) {
				if (Tcom_.aid === combi) {
					classint = 1;
					break;
				}
			}
		}
		if (classint === 1) {
			for (Tx_ = First(Tx); Tx_ !== null; Tx_ = After(Tx, Tx_)) {
				if (Tx_.mode === 50 && Tx_.key === combi) Delete(Tx, Tx_);
			}
			Tx_ = New(Tx);
			Tx_.mode = 50;
			Tx_.key = combi;
		}
	},

	//lockcombis - lock all combinations
	/** Case "lockcombis" (parser_commands.bb:2739) */
	cmd_lockcombis(_P: ParseCtx): void {
		let Tx_: Tx | null = null;
		let Tcom_: Tcom | null = null;
		for (Tx_ = First(Tx); Tx_ !== null; Tx_ = After(Tx, Tx_)) {
			if (Tx_.mode === 50) Delete(Tx, Tx_);
		}
		for (Tcom_ = First(Tcom); Tcom_ !== null; Tcom_ = After(Tcom, Tcom_)) {
			if (Tcom_.mode === 2) {
				Tx_ = New(Tx);
				Tx_.mode = 50;
				Tx_.key = Tcom_.aid;
			}
		}
	},

	//################################################# Diary

	//Diary
	/** Case "diary" (parser_commands.bb:2769) */
	cmd_diary(_P: ParseCtx, title: string, txt: string | undefined): void {
		let Tx_: Tx | null = null;
		let i = 0;
		if (txt !== undefined) {
			Tx_ = New(Tx);
			Tx_.mode = 2;
			Tx_.key = title;
			Tx_.value = txt;
		}
		//Set Menu
		// quirk: "<" Cmenu_if_movie here, "<>" in showentry
		if (G.m_menu < Cmenu_if_movie) {
			if (G.m_section !== Csection_menu) {
				G.m_menu = Cmenu_if_diary;
			}
			if_centerpos();
			G.in_scr_scr = 0;
			G.in_scr_scr2 = 0;
			G.in_opt[0] = 0;
			i = 0;
			for (Tx_ = First(Tx); Tx_ !== null; Tx_ = After(Tx, Tx_)) {
				if (Tx_.mode === 2) {
					i = i + 1;
					if (Tx_.key === title) {
						G.in_opt[0] = i;
						if (i > 4) G.in_scr_scr = i - 4;
						break;
					}
				}
			}
		}
		//FX
		sfx(G.sfx_diary);
		if_msg(sm(182), Cbmpf_yellow);
		//Closeblock
		G.in_blockclose = G.ms;
	},

	//Show Entiry
	/** Case "showentry" (parser_commands.bb:2956) */
	cmd_showentry(_P: ParseCtx, entry: string, sfx_: number): void {
		let i = 0;
		let Tx_: Tx | null = null;
		//Set Menu
		if (G.m_menu !== Cmenu_if_movie) {
			if (G.m_section !== Csection_menu) {
				G.m_menu = Cmenu_if_diary;
			}
			if_centerpos();
		}
		G.in_scr_scr = 0;
		G.in_scr_scr2 = 0;
		G.in_opt[0] = 0;
		i = 0;
		for (Tx_ = First(Tx); Tx_ !== null; Tx_ = After(Tx, Tx_)) {
			if (Tx_.mode === 2) {
				i = i + 1;
				if (Tx_.key === entry) {
					G.in_opt[0] = i;
					if (i > 4) G.in_scr_scr = i - 4;
					break;
				}
			}
		}
		//FX
		// (the local "sfx" of the original hides nothing: Blitz keeps variables and functions apart)
		if (sfx_ !== 0) {
			sfx(G.sfx_diary);
		}
		//Closeblock
		G.in_blockclose = G.ms;
	},

	//setday
	/** Case "setday" (parser_commands.bb:2991) */
	cmd_setday(_P: ParseCtx, day: number): void {
		G.map_day = day;
	},

	//sethour
	/** Case "sethour" (parser_commands.bb:2995) */
	cmd_sethour(_P: ParseCtx, hour: number): void {
		G.map_hour = hour;
		if (G.map_hour > 23) G.map_hour = 0;
		e_environment_update_light();
	},

	//setminute
	/** Case "setminute" (parser_commands.bb:3001) */
	cmd_setminute(_P: ParseCtx, minute: number): void {
		G.map_minute = minute;
		if (G.map_minute > 59) G.map_minute = 0;
		e_environment_update_light();
	},

	//################################################# MAP INDICATORS

	//hideindicator
	/** Case "hideindicator" (parser_commands.bb:3009); con_info(id) and the type test are the handler's */
	cmd_hideindicator(_P: ParseCtx, _id: number): void {
		G.TCinfo!.ints[1] = 0;
		info_vts();
	},

	//showindicator
	/** Case "showindicator" (parser_commands.bb:3023) */
	cmd_showindicator(_P: ParseCtx, _id: number): void {
		G.TCinfo!.ints[1] = 1;
		info_vts();
	},

	//hideindicators
	/** Case "hideindicators" (parser_commands.bb:3037) */
	cmd_hideindicators(_P: ParseCtx): void {
		// the loop variable is the global TCinfo: it is Null afterwards
		for (G.TCinfo = First(Tinfo); G.TCinfo !== null; G.TCinfo = After(Tinfo, G.TCinfo)) {
			if (G.TCinfo.typ === 36) {
				G.TCinfo.ints[1] = 0;
				info_vts();
			}
		}
	},

	//showindicators
	/** Case "showindicators" (parser_commands.bb:3046) */
	cmd_showindicators(_P: ParseCtx): void {
		for (G.TCinfo = First(Tinfo); G.TCinfo !== null; G.TCinfo = After(Tinfo, G.TCinfo)) {
			if (G.TCinfo.typ === 36) {
				G.TCinfo.ints[1] = 1;
				info_vts();
			}
		}
	},

	//setindicatorlook
	/** Case "setindicatorlook" (parser_commands.bb:3055) */
	cmd_setindicatorlook(_P: ParseCtx, _id: number, frame: string): void {
		// quirk: "frame" is the string frame$ of the "button" command: Select compares text
		switch (frame) {
			case '0':
			case '1':
				G.TCinfo!.ints[0] = 0;
				break;
			case '2':
				G.TCinfo!.ints[0] = 9;
				break;
			case '3':
				G.TCinfo!.ints[0] = 10;
				break;
			case '4':
				G.TCinfo!.ints[0] = 11;
				break;
		}
		info_vts();
	},

	//setindicatorinfo
	/** Case "setindicatorinfo" (parser_commands.bb:3076) */
	cmd_setindicatorinfo(_P: ParseCtx, _id: number, infotxt: string): void {
		G.TCinfo!.strings[0] = infotxt;
		info_vts();
	},

	//################################################# INFOS

	//stoptrigger
	/** Case "stoptrigger" (parser_commands.bb:3096) */
	cmd_stoptrigger(_P: ParseCtx, _id: number): void {
		G.TCinfo!.floats[1] = 0;
		info_vts();
	},

	//starttrigger
	/** Case "starttrigger" (parser_commands.bb:3111) */
	cmd_starttrigger(_P: ParseCtx, _id: number): void {
		G.TCinfo!.floats[1] = 1;
		info_vts();
	},

	//stoptriggers
	/** Case "stoptriggers" (parser_commands.bb:3126) */
	cmd_stoptriggers(_P: ParseCtx): void {
		for (G.TCinfo = First(Tinfo); G.TCinfo !== null; G.TCinfo = After(Tinfo, G.TCinfo)) {
			if (G.TCinfo.typ >= 10 && G.TCinfo.typ < 30) {
				G.TCinfo.floats[1] = 0;
				info_vts();
			}
		}
	},

	//starttriggers
	/** Case "starttriggers" (parser_commands.bb:3135) */
	cmd_starttriggers(_P: ParseCtx): void {
		for (G.TCinfo = First(Tinfo); G.TCinfo !== null; G.TCinfo = After(Tinfo, G.TCinfo)) {
			if (G.TCinfo.typ >= 10 && G.TCinfo.typ < 30) {
				G.TCinfo.floats[1] = 1;
				info_vts();
			}
		}
	},

	//trigger
	/** Case "trigger" (parser_commands.bb:3144): info_spawncontrol(TCinfo,1); TCinfo was set by the handler's con_info(id) */
	info_spawncontrol(_P: ParseCtx, _id: number, mode: number): void {
		info_spawncontrol(G.TCinfo, mode);
	},

	//info_sprite
	/** Case "info_sprite" (parser_commands.bb:3154) */
	cmd_info_sprite(_P: ParseCtx, id: number, file: string, x: number, y: number, r: number, g: number, b: number, alpha: number, mode: number, fix: number): void {
		let Tinfo_: Tinfo | null = null;
		for (Tinfo_ = First(Tinfo); Tinfo_ !== null; Tinfo_ = After(Tinfo, Tinfo_)) {
			if (Tinfo_.id === id) {
				if (Tinfo_.typ === 5) {
					if (file !== 'self') Tinfo_.strings[0] = file;
					Tinfo_.floats[0] = f32(x);
					Tinfo_.floats[1] = f32(y);
					Tinfo_.ints[0] = r;
					Tinfo_.ints[1] = g;
					Tinfo_.ints[2] = b;
					Tinfo_.floats[2] = f32(alpha);
					Tinfo_.strings[1] = Str(mode);
					Tinfo_.strings[2] = Str(fix);
					// quirk: info_vts() works on the global TCinfo, not on the loop variable Tinfo
					info_vts();
					info_setupsprite(Tinfo_);
				}
				// Else parse_error("'info_sprite' expects a sprite info"): raised by the handler
			}
		}
	},

	//info_sprite
	/** Case "info_loudspeaker" (parser_commands.bb:3211) */
	cmd_info_loudspeaker(_P: ParseCtx, id: number, file: string, x: number): void {
		let Tinfo_: Tinfo | null = null;
		for (Tinfo_ = First(Tinfo); Tinfo_ !== null; Tinfo_ = After(Tinfo, Tinfo_)) {
			if (Tinfo_.id === id) {
				if (Tinfo_.typ === 47) {
					if (file !== 'self') Tinfo_.strings[0] = file;
					if (x !== -1.0) {
						Tinfo_.floats[0] = f32(x);
					}
					// quirk: info_vts() works on the global TCinfo, not on the loop variable Tinfo
					info_vts();
					info_setuploudspeaker(Tinfo_);
				}
				// Else parse_error("'info_loudspeaker' expects a loudspeaker info"): raised by the handler
			}
		}
	},

	//info_spawncontrol
	/** Case "info_spawncontrol" (parser_commands.bb:3235) */
	cmd_info_spawncontrol(_P: ParseCtx, id: number, radius: number, classint: number, typ: number, part: number, max: number, days: number): void {
		let Tinfo_: Tinfo | null = null;
		for (Tinfo_ = First(Tinfo); Tinfo_ !== null; Tinfo_ = After(Tinfo, Tinfo_)) {
			if (Tinfo_.id === id) {
				if (Tinfo_.typ === 45) {
					Tinfo_.floats[0] = f32(radius);
					Tinfo_.ints[0] = classint;
					Tinfo_.ints[1] = typ;
					Tinfo_.strings[0] = Str(part);
					Tinfo_.ints[2] = max;
					Tinfo_.strings[1] = Str(days);
					// quirk: info_vts() works on the global TCinfo, not on the loop variable Tinfo
					info_vts();
				}
				// Else parse_error("'info_spawncontrol' expects a spawncontrol info"): raised by the handler
			}
		}
	},

	//################################################# BUILDINGS

	//lockbuildings - lock all buildings
	/** Case "lockbuildings" (parser_commands.bb:3280) */
	cmd_lockbuildings(_P: ParseCtx): void {
		let Tx_: Tx | null = null;
		let Tbui_: Tbui | null = null;
		for (Tx_ = First(Tx); Tx_ !== null; Tx_ = After(Tx, Tx_)) {
			if (Tx_.mode === 3) Delete(Tx, Tx_);
		}
		for (Tbui_ = First(Tbui); Tbui_ !== null; Tbui_ = After(Tbui, Tbui_)) {
			if (Tbui_.mode === 2) {
				Tx_ = New(Tx);
				Tx_.mode = 3;
				Tx_.key = Str(Tbui_.id);
			}
		}
	},

	//builtat
	/** Case "builtat" (parser_commands.bb:3306); p_return$=0 is the handler's */
	cmd_builtat(_P: ParseCtx, id: number): string | void {
		let Tstate_: Tstate | null = null;
		for (Tstate_ = First(Tstate); Tstate_ !== null; Tstate_ = After(Tstate, Tstate_)) {
			if (Tstate_.typ === Cstate_link) {
				if (Tstate_.value === id) {
					return Str(Tstate_.parent_id);
				}
			}
		}
	},

	//Buildsetuo
	/** Case "buildsetup" (parser_commands.bb:3348) */
	game_buildsetup_start(_P: ParseCtx, id: number, y: number): void {
		// tmp_y# is a global: the command leaves its second parameter in it
		G.tmp_y = f32(y);
		// quirk: changeh is an Int parameter, the Float is rounded
		game_buildsetup_start(id, Int(G.tmp_y));
	},

	//################################################# SEQUENCE

	//seqstart
	/** Case "seqstart" (parser_commands.bb:3360): seq_start() reads its parameters from the script itself */
	seq_start(_P: ParseCtx): true {
		seq_start();
		return true;
	},

	//seqtimemode
	/** Case "seqtimemode" (parser_commands.bb:3364) */
	cmd_seqtimemode(_P: ParseCtx, tmod: number, tabs: number): void {
		G.seq_tmod = tmod; //Time Mode
		if (G.seq_tmod === 0) G.seq_tmod = 1;
		G.seq_tmod = Abs(G.seq_tmod);
		G.seq_tabs = tabs; //Absolute
	},

	//Seq Events
	/** Case "seqend" .. "camfollow" (parser_commands.bb:3374-3402): seq_addevent(event$) reads its parameters from the script itself */
	seq_addevent(_P: ParseCtx, event: string): true {
		seq_addevent(event);
		return true;
	},

	//################################################# EFFECTS

	//Flash
	/** Case "flash" (parser_commands.bb:3408) */
	cmd_flash(_P: ParseCtx, r: number, g: number, b: number, flashspeed: number, flasha: number): void {
		p_add(0, 0, 0, Cp_flash, flashspeed, flasha);
		//DebugLog "Flash "+flashspeed#+" / "+flasha#
		EntityColor(G.TCp!.h, r, g, b);
	},

	//Corona
	/** Case "corona" (parser_commands.bb:3424) */
	cmd_corona(_P: ParseCtx, x: number, z: number, size: number, r: number | undefined, g: number | undefined, b: number | undefined, speed: number, id: number): void {
		let y = 0;
		let i = 0;
		let argx = 0;
		let argy = 0;
		let argz = 0;
		let argsize = 0;
		let arga = 0;
		y = e_tery(x, z);
		if (r !== undefined) {
			for (i = 1; i <= 10 + G.set_effects * 10; i++) {
				// exe: arguments evaluated size, alpha, z, y, x
				argsize = Rnd(3, 6);
				arga = Rnd(0.5, 2);
				argz = f32(z + Rnd(-size, size));
				argy = f32(y + Rnd(-5, 5));
				argx = f32(x + Rnd(-size, size));
				p_add(argx, argy, argz, Cp_spawn, argsize, arga);
				EntityColor(G.TCp!.h, r, g as number, b as number);
				G.TCp!.fx = f32(speed);
				if (id > 0) p_parent(id, G.TCp);
			}
		} else {
			for (i = 1; i <= 10 + G.set_effects * 10; i++) {
				// exe: arguments evaluated size, alpha, z, y, x
				argsize = Rnd(3, 6);
				arga = Rnd(0.5, 2);
				argz = f32(z + Rnd(-size, size));
				argy = f32(y + Rnd(-5, 5));
				argx = f32(x + Rnd(-size, size));
				p_add(argx, argy, argz, Cp_spawn, argsize, arga);
				G.TCp!.fx = f32(speed);
				if (id > 0) p_parent(id, G.TCp);
			}
		}
	},

	//Thunder
	/** Case "thunder" (parser_commands.bb:3467) */
	cmd_thunder(_P: ParseCtx): void {
		sfx(G.sfx_thunder[Rand(0, 2)]);
		p_add(0, 0, 0, Cp_flash, Rnd(f32(0.1), f32(0.3)), Rnd(1));
		EntityColor(G.TCp!.h, 255, 255, 255);
		EntityBlend(G.TCp!.h, 3);
	},

	//Explosion
	/** Case "explosion","explode" (parser_commands.bb:3474) */
	game_explosion(_P: ParseCtx, x: number, y: number, z: number, range: number, damage: number, exstyle: number): void {
		game_explosion(x, y, z, range, damage, exstyle);
	},

	//Blur
	/** Case "blur" (parser_commands.bb:3495) */
	cmd_blur(_P: ParseCtx, value: number): void {
		G.in_scriptblur = f32(value); //Set Blur
		if (G.in_scriptblur < 0) {
			G.in_scriptblur = 0;
		} else if (G.in_scriptblur > Cpeakblur) {
			G.in_scriptblur = Cpeakblur;
		}
	},

	//Vomit
	/** Case "vomit" (parser_commands.bb:3504) */
	cmd_vomit(_P: ParseCtx, unitid: number): void {
		let i = 0;
		let argx = 0;
		let argy = 0;
		let argz = 0;
		let argsize = 0;
		let arga = 0;
		if (con_unit(unitid)) {
			for (i = 1; i <= 15; i++) {
				// exe: arguments evaluated z, size, alpha, y, x
				argz = f32(EntityZ(G.TCunit!.h) + Rnd(-5, 5));
				argsize = Rnd(4, 5);
				arga = Rnd(f32(0.9), 3);
				argy = f32(f32(EntityY(G.TCunit!.h) + Rnd(-5, 5)) + Dunit_eyes(G.TCunit!.typ));
				argx = f32(EntityX(G.TCunit!.h) + Rnd(-5, 5));
				p_add(argx, argy, argz, Cp_subsplatter, argsize, arga);
				G.TCp!.frame = 2;
				G.TCp!.r = Rnd(50, 150);
				G.TCp!.g = f32(G.TCp!.r + Rnd(0, 55));
				G.TCp!.b = 0;
				EntityColor(G.TCp!.h, G.TCp!.r, G.TCp!.g, G.TCp!.b);
			}
		}
	},

	//Particle
	/** Case "particle" (parser_commands.bb:3523) */
	cmd_particle(_P: ParseCtx, x: number, y: number, z: number, typ: number, size: number, alpha: number): void {
		p_add(x, y, z, typ, size, alpha);
	},

	//Particle Color
	/** Case "particlec" (parser_commands.bb:3542) */
	cmd_particlec(_P: ParseCtx, r: number, g: number, b: number): void {
		if (!isNull(Tp, G.TCp)) {
			if (G.TCp!.h !== null) {
				EntityColor(G.TCp!.h, r, g, b);
			}
		}
	},

	//################################################# SOUNDS

	//Play
	/** Case "play" (parser_commands.bb:3558) */
	sfx_play(_P: ParseCtx, file: string, vol: number, pan: number, pitch: number): void {
		sfx_play(file, vol, pan, pitch);
	},

	//Stopsounds
	/** Case "stopsounds" (parser_commands.bb:3570) */
	stopsounds(_P: ParseCtx): void {
		stopsounds();
	},

	//Music
	/** Case "music" (parser_commands.bb:3574) */
	cmd_music(_P: ParseCtx, file: string, vol: number, fade: number | undefined): void {
		sfx_music(file, vol);
		if (fade !== undefined) {
			//Fade
			G.mfx_fade = 1;
			G.mfx_fadestart = G.gt;
			G.mfx_fadeend = Abs(fade);
		}
	},

	//Stopmusic
	/** Case "stopmusic" (parser_commands.bb:3589) */
	cmd_stopmusic(_P: ParseCtx): void {
		if (G.mfx_file !== 0) RT.audio.bb.FreeSound(G.mfx_file);
		G.mfx_file = 0;
		G.mfx_chan = 0;
	},

	//Fademusic
	/** Case "fademusic" (parser_commands.bb:3595) */
	cmd_fademusic(_P: ParseCtx, fade: number): void {
		G.mfx_fade = -1;
		G.mfx_fadestart = G.gt;
		G.mfx_fadeend = Abs(fade);
	},

	//Musicvolume
	/** Case "musicvolume" (parser_commands.bb:3602) */
	cmd_musicvolume(_P: ParseCtx, vol: number): void {
		G.mfx_fade = 0;
		G.mfx_peakvol = f32(vol);
	},

	//Ambientsfx
	/** Case "ambientsfx" (parser_commands.bb:3607) */
	cmd_ambientsfx(_P: ParseCtx, file: string): void {
		// (the original stops and frees the old sound before it reads the parameter)
		if (G.amb_chan !== 0) RT.audio.bb.StopChannel(G.amb_chan);
		if (G.amb_file !== 0) RT.audio.bb.FreeSound(G.amb_file);
		// quirk: amb_chan and amb_file keep their stale handles when the new name is empty
		G.map_music = file;
		if (G.map_music !== '') {
			G.amb_file = RT.audio.bb.LoadSound('sfx\\' + G.map_music);
		}
	},

	//################################################# MODEL

	/** h=parent_h(...) of the MODEL commands, for the handlers' "If h<>0" (0 when there is no entity) */
	parent_h(parentclass: number, parentid: number, model: number): number {
		const h = parent_h(parentclass, parentid, model);
		// the Host interface types handles as numbers; the handlers only test "<>0"
		return h === null ? 0 : (h as unknown as number);
	},

	//Color
	/** Case "color" (parser_commands.bb:3619) */
	cmd_color(_P: ParseCtx, r: number, g: number, b: number, classint: number, id: number): void {
		let h: Handle = null;
		h = parent_h(classint, id, 1);
		if (h !== null) {
			EntityColor(h, r, g, b);
		}
	},

	//Blend
	/** Case "blend" (parser_commands.bb:3641) */
	cmd_blend(_P: ParseCtx, mode: number, classint: number, id: number): void {
		let h: Handle = null;
		h = parent_h(classint, id, 1);
		if (h !== null) {
			EntityBlend(h, mode);
		}
	},

	//Alpha
	/** Case "alpha" (parser_commands.bb:3659) */
	cmd_alpha(_P: ParseCtx, alpha: number, classint: number, id: number): void {
		let h: Handle = null;
		h = parent_h(classint, id, 1);
		if (h !== null) {
			EntityAlpha(h, alpha);
			// quirk: keyed on p_env_class / p_env_id, also when another target was named
			if (G.p_env_class === Cclass_object) {
				alpha_object(G.p_env_id, alpha);
			}
		}
	},

	//Scale
	/** Case "scale" (parser_commands.bb:3680) */
	cmd_scale(_P: ParseCtx, sx: number, sy: number, sz: number, classint: number, id: number): void {
		let h: Handle = null;
		let Tobject_: Tobject | null = null;
		let Tunit_: Tunit | null = null;
		let Titem_: Titem | null = null;
		h = parent_h(classint, id, 1);
		if (h !== null) {
			switch (classint) {
				//Object
				case Cclass_object:
					for (Tobject_ = First(Tobject); Tobject_ !== null; Tobject_ = After(Tobject, Tobject_)) {
						if (Tobject_.id === id) {
							sx = f32(sx * Dobject_size(Tobject_.typ, 0));
							sy = f32(sy * Dobject_size(Tobject_.typ, 1));
							sz = f32(sz * Dobject_size(Tobject_.typ, 2));
							//Scale Collisionmodel
							if (Tobject_.ch !== null) {
								ScaleEntity(Tobject_.ch, sx, sy, sz, 1);
							}
							break;
						}
					}
					break;
				//Unit
				case Cclass_unit:
					for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
						if (Tunit_.id === id) {
							if (Dunit_col(Tunit_.typ) > 0) {
								EntityRadius(Tunit_.h, f32(Dunit_colxr(Tunit_.typ) * sx), f32(Dunit_colyr(Tunit_.typ) * sy));
								if (G.set_debug) {
									EntityParent(Tunit_.mh, null);
									ScaleEntity(Tunit_.h, f32(Dunit_colxr(Tunit_.typ) * sx), f32(Dunit_colyr(Tunit_.typ) * sy), f32(Dunit_colxr(Tunit_.typ) * sx));
									EntityParent(Tunit_.mh, Tunit_.h);
								}
							}
							sx = f32(sx * Dunit_size(Tunit_.typ, 0));
							sy = f32(sy * Dunit_size(Tunit_.typ, 1));
							sz = f32(sz * Dunit_size(Tunit_.typ, 2));
							break;
						}
					}
					break;
				//Item
				case Cclass_item:
					for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
						if (Titem_.id === id) {
							sx = f32(sx * Ditem_size(Titem_.typ, 0));
							sy = f32(sy * Ditem_size(Titem_.typ, 1));
							sz = f32(sz * Ditem_size(Titem_.typ, 2));
							if (Ditem_radius(Titem_.typ) === 0) {
								EntityRadius(Titem_.h, f32(5 * sx));
							} else {
								EntityRadius(Titem_.h, f32(Ditem_radius(Titem_.typ) * sx));
							}
							break;
						}
					}
					break;
			}
			//Scale Model
			ScaleEntity(h, sx, sy, sz, 1);
		}
	},

	//FX
	/** Case "fx" (parser_commands.bb:3754) */
	cmd_fx(_P: ParseCtx, mode: number, classint: number, id: number): void {
		let h: Handle = null;
		h = parent_h(classint, id, 1);
		if (h !== null) {
			EntityFX(h, mode);
		}
	},

	//Shininess
	/** Case "shininess" (parser_commands.bb:3772) */
	cmd_shininess(_P: ParseCtx, shininess: number, classint: number, id: number): void {
		let h: Handle = null;
		h = parent_h(classint, id, 1);
		if (h !== null) {
			EntityShininess(h, shininess);
		}
	},

	//Model
	/** Case "model" (parser_commands.bb:3790); the class test and both parse_errors are the handler's */
	cmd_model(_P: ParseCtx, model: string, modelclass: number, modelid: number): void {
		let h: Handle = null;
		let newmodel: Handle = null;
		let tmp_yaw = 0;
		let range = 0;
		h = parent_h(modelclass, modelid, 1);
		if (h !== null) {
			if (modelclass === Cclass_object || modelclass === Cclass_item) {
				newmodel = load_res(model, Cres_mesh);
				if (newmodel !== null) {
					HideEntity(newmodel);
					G.tmp_x = EntityX(h);
					G.tmp_y = EntityY(h);
					G.tmp_z = EntityZ(h);
					tmp_yaw = EntityYaw(h);
					FreeEntity(h);
					//Object
					if (modelclass === Cclass_object) {
						con_object(modelid);
						if (G.TCobject!.ch !== null) {
							FreeEntity(G.TCobject!.ch);
							G.TCobject!.ch = null;
						}
						G.TCobject!.h = CopyEntity(newmodel);
						PositionEntity(G.TCobject!.h, G.tmp_x, G.tmp_y, G.tmp_z);
						RotateEntity(G.TCobject!.h, 0, tmp_yaw, 0);
						if (Dobject_col(G.TCobject!.typ) > 0) EntityPickMode(G.TCobject!.h, 2, 1);
						if (Dobject_col(G.TCobject!.typ) === 1) EntityType(G.TCobject!.h, Cworld_col);
						range = Int(f32(Dobject_autofade(G.TCobject!.typ) * G.set_viewfac));
						if (Dobject_autofade(G.TCobject!.typ) !== 0) EntityAutoFade(G.TCobject!.h, range, range + 300);
						//Collisions
						//1 / 4
						if (Dobject_col(G.TCobject!.typ) === 1 || Dobject_col(G.TCobject!.typ) === 4) {
							if (Dobject_swayspeed(G.TCobject!.typ) !== 0) {
								G.TCobject!.ch = CopyEntity(newmodel);
								PositionEntity(G.TCobject!.ch, G.tmp_x, G.tmp_y, G.tmp_z);
								RotateEntity(G.TCobject!.ch, 0, tmp_yaw, 0);
								EntityAlpha(G.TCobject!.ch, 0.0);
								EntityType(G.TCobject!.ch, Cworld_col);
							} else {
								EntityType(G.TCobject!.h, Cworld_col);
							}
							//3
						} else if (Dobject_col(G.TCobject!.typ) === 3) {
							G.TCobject!.ch = CopyEntity(newmodel);
							PositionEntity(G.TCobject!.ch, G.tmp_x, G.tmp_y, G.tmp_z);
							RotateEntity(G.TCobject!.ch, 0, tmp_yaw, 0);
							EntityAlpha(G.TCobject!.ch, 0.0);
							EntityType(G.TCobject!.ch, Cworld_col);
						}
						//Item
					} else if (modelclass === Cclass_item) {
						con_item(modelid);
						G.TCitem!.h = CopyEntity(newmodel);
						PositionEntity(G.TCitem!.h, G.tmp_x, G.tmp_y, G.tmp_z);
						// quirk: TCobject instead of TCitem: turns whatever object was current last (crashes without one); the item keeps yaw 0
						RotateEntity(G.TCobject!.h, 0, tmp_yaw, 0);
						if (Ditem_radius(G.TCitem!.typ) === 0) {
							EntityPickMode(G.TCitem!.h, 2, 1);
							EntityRadius(G.TCitem!.h, 5);
							EntityType(G.TCitem!.h, Cworld_col);
						} else {
							EntityRadius(G.TCitem!.h, Ditem_radius(G.TCitem!.typ));
							EntityPickMode(G.TCitem!.h, 1, 1);
							EntityType(G.TCitem!.h, Cworld_col);
						}
						if (Ditem_autofade(G.TCitem!.typ) !== 0)
							EntityAutoFade(G.TCitem!.h, f32(Ditem_autofade(G.TCitem!.typ) * G.set_viewfac), f32(f32(Ditem_autofade(G.TCitem!.typ) * G.set_viewfac) + 50));
					}
				}
			}
		}
	},

	//Texture
	/** Case "texture" (parser_commands.bb:3875) */
	cmd_texture(_P: ParseCtx, texture: string, classint: number, id: number): void {
		let h: Handle = null;
		let newtexture: Texture | null = null;
		h = parent_h(classint, id, 1);
		if (h !== null) {
			newtexture = load_res(texture, Cres_texture);
			if (newtexture !== null) {
				EntityTexture(h, newtexture);
			}
		}
	},

	//################################################# STATES

	//Add State
	/** Case "addstate" (parser_commands.bb:3903) */
	cmd_addstate(_P: ParseCtx, stateint: number, classint: number, id: number): string {
		return Str(set_state(stateint, classint, id));
	},

	//State Color
	/** Case "statecolor" (parser_commands.bb:3926) */
	cmd_statecolor(_P: ParseCtx, classint: number, id: number, stateint: number, r: number, g: number, b: number): void {
		// the loop variable is the global TCstate: Null afterwards when no state matched
		for (G.TCstate = First(Tstate); G.TCstate !== null; G.TCstate = After(Tstate, G.TCstate)) {
			if (G.TCstate.parent_class === classint) {
				if (G.TCstate.parent_id === id) {
					if (G.TCstate.typ === stateint) {
						G.TCstate.value_s = Str(r) + ',' + Str(g) + ',' + Str(b);
						G.TCstate.r = r;
						G.TCstate.g = g;
						G.TCstate.b = b;
						look_state();
						break;
					}
				}
			}
		}
	},

	//State Size
	/** Case "statesize" (parser_commands.bb:3963) */
	cmd_statesize(_P: ParseCtx, classint: number, id: number, stateint: number, size: number): void {
		for (G.TCstate = First(Tstate); G.TCstate !== null; G.TCstate = After(Tstate, G.TCstate)) {
			if (G.TCstate.parent_class === classint) {
				if (G.TCstate.parent_id === id) {
					if (G.TCstate.typ === stateint) {
						// quirk: "size" is the Float size# of parse_commands, rounded into the Int field
						G.TCstate.value = Int(size);
						look_state();
						break;
					}
				}
			}
		}
	},

	//State Value
	/** Case "statevalue" (parser_commands.bb:3993) */
	cmd_statevalue(_P: ParseCtx, classint: number, id: number, stateint: number, statevalue: number): void {
		for (G.TCstate = First(Tstate); G.TCstate !== null; G.TCstate = After(Tstate, G.TCstate)) {
			if (G.TCstate.parent_class === classint) {
				if (G.TCstate.parent_id === id) {
					if (G.TCstate.typ === stateint) {
						G.TCstate.value_f = f32(statevalue);
						break;
					}
				}
			}
		}
	},

	//getstatevalue
	/** Case "getstatevalue" (parser_commands.bb:4022) */
	cmd_getstatevalue(_P: ParseCtx, classint: number, id: number, stateint: number, valuetype: number): string | void {
		let p_return: string | undefined = undefined;
		for (G.TCstate = First(Tstate); G.TCstate !== null; G.TCstate = After(Tstate, G.TCstate)) {
			if (G.TCstate.parent_class === classint) {
				if (G.TCstate.parent_id === id) {
					if (G.TCstate.typ === stateint) {
						switch (valuetype) {
							case 0:
								p_return = Str(G.TCstate.value_f, 'float');
								break;
							case 1:
								p_return = Str(G.TCstate.value);
								break;
							case 2:
								p_return = Str(G.TCstate.r);
								break;
							case 3:
								p_return = Str(G.TCstate.g);
								break;
							case 4:
								p_return = Str(G.TCstate.b);
								break;
						}
						break;
					}
				}
			}
		}
		return p_return;
	},

	//areal_state
	/** Case "areal_state" (parser_commands.bb:4059) */
	cmd_areal_state(_P: ParseCtx, stateint: number, x: number, y: number, z: number, range: number): void {
		let tempp: Handle = null;
		let Tobject_: Tobject | null = null;
		let Tunit_: Tunit | null = null;
		let Titem_: Titem | null = null;
		tempp = CreatePivot();
		PositionEntity(tempp, x, y, z);
		for (Tobject_ = First(Tobject); Tobject_ !== null; Tobject_ = After(Tobject, Tobject_)) {
			if (EntityDistance(Tobject_.h, tempp) < range) {
				set_state(stateint, Cclass_object, Tobject_.id);
			}
		}
		for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
			if (EntityDistance(Tunit_.h, tempp) < range) {
				set_state(stateint, Cclass_unit, Tunit_.id);
			}
		}
		for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
			if (Titem_.parent_mode === Cpm_out) {
				if (EntityDistance(Titem_.h, tempp) < range) {
					set_state(stateint, Cclass_item, Titem_.id);
				}
			}
		}
		FreeEntity(tempp);
	},

	//################################################# FREE

	//free
	/** Case "free" (parser_commands.bb:4196) */
	cmd_free(_P: ParseCtx, cls: string, classint: number, id: number, count: number | undefined): void {
		let Tp_: Tp | null = null;
		//Item
		if (count !== undefined) {
			free_item(id, count);
			//Other Stuff
		} else {
			if (classint === 0) {
				switch (cls) {
					case 'particles':
						for (Tp_ = First(Tp); Tp_ !== null; Tp_ = After(Tp, Tp_)) {
							if (Tp_.h !== null) FreeEntity(Tp_.h);
							Delete(Tp, Tp_);
						}
						break;
				}
			} else {
				if (classint !== -1) {
					ha_free(classint, id);
				} else {
					ha_free(classint, -1); //Self
				}
			}
		}
	},

	//Free State
	/** Case "freestate" (parser_commands.bb:4235) */
	cmd_freestate(_P: ParseCtx, classint: number, id: number, stateint: number | undefined): void {
		let Tstate_: Tstate | null = null;
		if (stateint !== undefined) {
			free_state(stateint, classint, id);
		} else {
			for (Tstate_ = First(Tstate); Tstate_ !== null; Tstate_ = After(Tstate, Tstate_)) {
				if (Tstate_.parent_class === classint) {
					if (Tstate_.parent_id === id) {
						free_state(Tstate_.typ, classint, id);
					}
				}
			}
		}
	},

	//Free Stored Item
	/** Case "freestored" (parser_commands.bb:4272) */
	cmd_freestored(_P: ParseCtx, classint: number, id: number, typstr: string, count: number): void {
		let Titem_: Titem | null = null;
		//All
		if (typstr === 'all') {
			for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
				if (Titem_.parent_class === classint) {
					if (Titem_.parent_id === id) {
						free_item(Titem_.id, -1);
					}
				}
			}
			//Special
		} else {
			for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
				if (Titem_.parent_class === classint) {
					if (Titem_.parent_id === id) {
						if (Titem_.typ === Int(typstr)) {
							free_item(Titem_.id, count);
							break;
						}
					}
				}
			}
		}
	},

	//Free Button
	/** Case "freebutton" (parser_commands.bb:4315) */
	cmd_freebutton(_P: ParseCtx, id: number): void {
		G.in_sb[id] = 0;
	},

	//free interface txt
	/** Case "freetext" (parser_commands.bb:4324) */
	cmd_freetext(_P: ParseCtx, id: number): void {
		G.in_sitxt[id] = 0;
	},

	//################################################# RETURN

	/** get_material(name$) for "compare_material" */
	get_material: (name: string) => get_material(name),
	/** ai_getbehaviour(behaviour$) for "ai_behavioursignal" */
	ai_getbehaviour: (behaviour: string) => ai_getbehaviour(behaviour),

	//Playergotitem
	/** Case "playergotitem" (parser_commands.bb:4352) */
	countstored_items(_P: ParseCtx, parent_class: number, parent_id: number, typ: number): string {
		let itemcount = 0;
		itemcount = countstored_items(parent_class, parent_id, typ);
		return Str(itemcount);
	},

	//Day
	/** Case "day" (parser_commands.bb:4358) */
	cmd_day(_P: ParseCtx): string {
		return Str(G.map_day);
	},

	//Hour
	/** Case "hour" (parser_commands.bb:4362) */
	cmd_hour(_P: ParseCtx): string {
		return Str(G.map_hour);
	},

	//Minute
	/** Case "minute" (parser_commands.bb:4366) */
	cmd_minute(_P: ParseCtx): string {
		return Str(G.map_minute);
	},

	//In Range
	/** Case "inrange" (parser_commands.bb:4382) */
	cmd_inrange(_P: ParseCtx, classint: number, id: number, range: number, class2: number | undefined, id2: number | undefined): string {
		if (class2 !== undefined) {
			if (ha_distance(classint, id, class2, id2 as number) <= range) {
				return '1';
			} else {
				return '0';
			}
		} else {
			return Str(ha_idinrange(G.cam, range, classint, id));
		}
	},

	//Count In Range
	/** Case "count_inrange" (parser_commands.bb:4413) */
	cmd_count_inrange(_P: ParseCtx, classint: number, typ: number, range: number, class2: number | undefined, id2: number | undefined): string {
		let countinrangehandle: Handle = null;
		if (class2 !== undefined) {
			countinrangehandle = parent_h(class2, id2 as number);
			if (countinrangehandle !== null) {
				return Str(ha_inrange(countinrangehandle, range, classint, typ));
				//con_add("count_inrange object "+range+","+classint+","+typ+" -> "+p_return$)
			} else {
				return '0';
			}
		} else {
			return Str(ha_inrange(G.cam, range, classint, typ));
			//con_add("count_inrange cam "+range+","+classint+","+typ+" -> "+p_return$)
		}
	},

	//Count Behaviourinrange
	/** Case "count_behaviourinrange" (parser_commands.bb:4442); the Default branch (parse_error) is the handler's */
	cmd_count_behaviourinrange(_P: ParseCtx, classint: number, behaviour: string, range: number, class2: number | undefined, id2: number | undefined): string {
		let countinrangehandle: Handle = null;
		let p_return = '';
		let Tobject_: Tobject | null = null;
		let behaviourint = 0;
		let Tunit_: Tunit | null = null;
		let Titem_: Titem | null = null;
		countinrangehandle = G.cam;
		if (class2 !== undefined) {
			// (a missing entity gives handle 0: EntityDistance below then fails as in the original)
			countinrangehandle = parent_h(class2, id2 as number);
		}
		p_return = '0';
		switch (classint) {
			//Object
			case Cclass_object:
				for (Tobject_ = First(Tobject); Tobject_ !== null; Tobject_ = After(Tobject, Tobject_)) {
					if (Dobject_behaviour(Tobject_.typ) === behaviour) {
						if (EntityDistance(countinrangehandle, Tobject_.h) <= range) {
							p_return = Str(Int(p_return) + 1);
						}
					}
				}
				break;
			//Unit
			case Cclass_unit:
				behaviourint = ai_getbehaviour(behaviour);
				for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
					if (Dunit_behaviour(Tunit_.typ) === behaviourint) {
						if (EntityDistance(countinrangehandle, Tunit_.h) <= range) {
							p_return = Str(Int(p_return) + 1);
						}
					}
				}
				break;
			//Item
			case Cclass_item:
				for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
					if (Titem_.parent_class === 0) {
						// quirk: Tunit instead of Titem. Tunit is Null here: the original crashes ("Memory access
						// violation") as soon as one item lies in the world; the port throws a TypeError
						if (Ditem_behaviour(Tunit_!.typ) === behaviour) {
							if (EntityDistance(countinrangehandle, Tunit_!.h) <= range) {
								p_return = Str(Int(p_return) + 1);
							}
						}
					}
				}
				break;
		}
		return p_return;
	},

	//Count Stored
	/** Case "count_stored" (parser_commands.bb:4549) */
	cmd_count_stored(_P: ParseCtx, classint: number, id: number, typ: number | undefined): string {
		let p_return = '';
		let Titem_: Titem | null = null;
		p_return = '0';
		if (typ !== undefined) {
			//Count Special One
			for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
				if (Titem_.parent_class === classint) {
					if (Titem_.parent_id === id) {
						if (Titem_.typ === typ) {
							if (Titem_.parent_mode === Cpm_in) {
								p_return = Str(Int(p_return) + Titem_.count);
							}
						}
					}
				}
			}
		} else {
			//Count All
			for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
				if (Titem_.parent_class === classint) {
					if (Titem_.parent_id === id) {
						if (Titem_.parent_mode === Cpm_in) {
							p_return = Str(Int(p_return) + Titem_.count);
						}
					}
				}
			}
		}
		//con_add("count stored @"+classint+","+id+" = "+p_return$)
		return p_return;
	},

	//Got State
	/** Case "gotstate" (parser_commands.bb:4589) */
	cmd_gotstate(_P: ParseCtx, classint: number, id: number, stateint: number): string | void {
		let Tstate_: Tstate | null = null;
		for (Tstate_ = First(Tstate); Tstate_ !== null; Tstate_ = After(Tstate, Tstate_)) {
			if (Tstate_.parent_class === classint) {
				if (Tstate_.parent_id === id) {
					if (Tstate_.typ === stateint) {
						return '1';
					}
				}
			}
		}
	},

	//Count States
	/** Case "count_state" (parser_commands.bb:4615) */
	cmd_count_state(_P: ParseCtx, stateint: number): string {
		let p_return = '';
		let Tstate_: Tstate | null = null;
		p_return = '0';
		for (Tstate_ = First(Tstate); Tstate_ !== null; Tstate_ = After(Tstate, Tstate_)) {
			if (Tstate_.typ === stateint) {
				p_return = Str(Int(p_return) + 1);
			}
		}
		return p_return;
	},

	//Distance
	/** Case "distance" (parser_commands.bb:4626) */
	cmd_distance(P: ParseCtx, classint: number, id: number, classint2: number, id2: number): string {
		let h1: Handle = null;
		let h2: Handle = null;
		h1 = parent_h(classint, id);
		h2 = parent_h(classint2, id2);
		if (h1 !== null && h2 !== null) {
			return Str(EntityDistance(h1, h2), 'float');
		} else {
			if (h1 === null) {
				P.parse_error('object', id);
			} else {
				P.parse_error('object', id2);
			}
			return '0';
		}
	},

	//Player Distance
	/** Case "playerdistance" (parser_commands.bb:4655) */
	cmd_playerdistance(P: ParseCtx, classint: number, id: number): string {
		let h1: Handle = null;
		h1 = parent_h(classint, id);
		if (h1 !== null) {
			if (G.g_cplayer!.h !== null) {
				return Str(EntityDistance(G.g_cplayer!.h, h1), 'float');
			} else {
				return '0';
			}
		} else {
			P.parse_error('object', id);
			return '0';
		}
	},

	//In View
	/** Case "inview" (parser_commands.bb:4678) */
	cmd_inview(P: ParseCtx, classint: number, id: number): string {
		let h1: Handle = null;
		h1 = parent_h(classint, id, 1);
		if (h1 !== null) {
			return Str(EntityInView(h1, G.cam));
		} else {
			P.parse_error('object', id);
			return '0';
		}
	},

	//Get X / Y / Z / pitch / yaw, roll
	/** Case "getx","gety","getz","getpitch","getyaw","getroll" (parser_commands.bb:4697) */
	cmd_getx(P: ParseCtx, com: string, classint: number, id: number): string | void {
		let h: Handle = null;
		let Titem_: Titem | null = null;
		h = parent_h(classint, id);
		if (h === null) {
			//If tmp_killclass=classint Then
			//	If tmp_killid=id Then
			//		h=tmp_killmodel
			//	EndIf
			//EndIf
			// (the kill cache keeps its pivots as "unknown": 0 or an entity)
			const k = parse_kill_get(classint, id);
			h = k === 0 || k === undefined ? null : (k as Handle);
		}
		//Position of Parent in Case of stored Item
		if (classint === Cclass_item) {
			for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
				if (Titem_.id === id) {
					if (Titem_.parent_mode === Cpm_in) {
						h = parent_h(Titem_.parent_class, Titem_.parent_id);
					}
				}
			}
		}
		if (h !== null) {
			switch (com) {
				case 'getx':
					return Str(EntityX(h), 'float');
				case 'gety':
					return Str(EntityY(h), 'float');
				case 'getz':
					return Str(EntityZ(h), 'float');
				case 'getpitch':
					return Str(EntityPitch(h), 'float');
				case 'getyaw':
					return Str(EntityYaw(h), 'float');
				case 'getroll':
					return Str(EntityRoll(h), 'float');
			}
		} else {
			P.parse_error('object', id);
			return '0';
		}
	},

	//Lives
	/** Case "lives" (parser_commands.bb:4754) */
	cmd_lives(_P: ParseCtx, classint: number, id: number): string {
		return Str(1 - ha_killed(classint, id));
	},

	//inarea_freshwater
	/** Case "inarea_freshwater" (parser_commands.bb:4779) */
	cmd_inarea_freshwater(_P: ParseCtx, classint: number, id: number): string | void {
		let h: Handle = null;
		h = parent_h(classint, id);
		if (h !== null) {
			return Str(info_area(41, EntityX(h), EntityZ(h)));
		}
	},

	//inarea_dig
	/** Case "inarea_dig" (parser_commands.bb:4795) */
	cmd_inarea_dig(_P: ParseCtx, classint: number, id: number): string | void {
		let h: Handle = null;
		h = parent_h(classint, id);
		if (h !== null) {
			return Str(info_area(42, EntityX(h), EntityZ(h)));
		}
	},

	//inarea_fish
	/** Case "inarea_fish" (parser_commands.bb:4811) */
	cmd_inarea_fish(_P: ParseCtx, classint: number, id: number): string | void {
		let h: Handle = null;
		h = parent_h(classint, id);
		if (h !== null) {
			return Str(info_area(43, EntityX(h), EntityZ(h)));
		}
	},

	//inarea
	/** Case "inarea" (parser_commands.bb:4827) */
	cmd_inarea(_P: ParseCtx, classint: number, id: number): string | void {
		let h: Handle = null;
		h = parent_h(classint, id);
		if (h !== null) {
			return Str(info_area(44, EntityX(h), EntityZ(h)));
		}
	},

	//Get Stored Item ID
	/** Case "getstored" (parser_commands.bb:4843) */
	cmd_getstored(_P: ParseCtx, classint: number, id: number, typ: number): string | void {
		let Titem_: Titem | null = null;
		for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
			if (Titem_.parent_class === classint) {
				if (Titem_.parent_id === id) {
					if (Titem_.typ === typ || typ === 0) {
						return Str(Titem_.id);
					}
				}
			}
		}
	},

	//Get Amount
	/** Case "getamount" (parser_commands.bb:4865) */
	cmd_getamount(_P: ParseCtx, id: number): string | void {
		let Titem_: Titem | null = null;
		for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
			if (Titem_.id === id) {
				return Str(Titem_.count);
			}
		}
	},

	//Riding
	/** Case "riding" (parser_commands.bb:4875) */
	cmd_riding(_P: ParseCtx): string {
		return Str(G.g_drive);
	},

	//Player Weapon
	/** Case "getplayerweapon" (parser_commands.bb:4879) */
	cmd_getplayerweapon(_P: ParseCtx): string | void {
		if (!isNull(Tunit, G.g_cplayer)) return Str(G.g_cplayer!.player_weapon);
	},

	//Player Ammo
	/** Case "getplayerammo" (parser_commands.bb:4883) */
	cmd_getplayerammo(_P: ParseCtx): string | void {
		if (!isNull(Tunit, G.g_cplayer)) return Str(G.g_cplayer!.player_ammo);
	},

	//Weather
	/** Case "getweather" (parser_commands.bb:4887) */
	cmd_getweather(_P: ParseCtx): string {
		return Str(G.env_cweather);
	},

	//Freespace
	/** Case "freespace" (parser_commands.bb:4891) */
	ha_freespace(_P: ParseCtx, x: number, y: number, z: number, range: number, objects: number, units: number, items: number, infos: number): string {
		return Str(ha_freespace(x, y, z, range, objects, units, items, infos));
	},

	//Compare Material
	/** Case "compare_material" (parser_commands.bb:4920) */
	cmd_compare_material(_P: ParseCtx, classint: number, id: number, mat: number): string | void {
		switch (classint) {
			case Cclass_object:
				if (con_object(id)) {
					if (Dobject_mat(G.TCobject!.typ) === mat) return '1';
				}
				break;
			case Cclass_unit:
				if (con_unit(id)) {
					if (Dunit_mat(G.TCunit!.typ) === mat) return '1';
				}
				break;
			case Cclass_item:
				if (con_item(id)) {
					if (Ditem_mat(G.TCitem!.typ) === mat) return '1';
				}
				break;
		}
	},

	//Compare Behaviour
	/** Case "compare_behaviour" (parser_commands.bb:4949) */
	cmd_compare_behaviour(_P: ParseCtx, classint: number, id: number, behaviour: string): string | void {
		switch (classint) {
			case Cclass_object:
				if (con_object(id)) {
					if (Dobject_behaviour(G.TCobject!.typ) === behaviour) return '1';
				}
				break;
			case Cclass_unit:
				if (con_unit(id)) {
					if (Dunit_behaviour(G.TCunit!.typ) === ai_getbehaviour(behaviour)) return '1';
				}
				break;
			case Cclass_item:
				if (con_item(id)) {
					if (Ditem_behaviour(G.TCitem!.typ) === behaviour) return '1';
				}
				break;
		}
	},

	//Health
	/** Case "health" (parser_commands.bb:4978) */
	cmd_health(_P: ParseCtx, classint: number, id: number, value: number): string | void {
		let Tunit_: Tunit | null = null;
		let Tobject_: Tobject | null = null;
		let Titem_: Titem | null = null;
		switch (classint) {
			case Cclass_unit:
				for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
					if (Tunit_.id === id) {
						Tunit_.health = f32(Tunit_.health + value);
						if (Tunit_.health < 0) Tunit_.health = 0;
						if (Tunit_.health > Tunit_.health_max) Tunit_.health = Tunit_.health_max;
						return Str(Tunit_.health, 'float');
					}
				}
				break;
			case Cclass_object:
				for (Tobject_ = First(Tobject); Tobject_ !== null; Tobject_ = After(Tobject, Tobject_)) {
					if (Tobject_.id === id) {
						Tobject_.health = f32(Tobject_.health + value);
						if (Tobject_.health < 0) Tobject_.health = 0;
						if (Tobject_.health > Tobject_.health_max) Tobject_.health = Tobject_.health_max;
						return Str(Tobject_.health, 'float');
					}
				}
				break;
			case Cclass_item:
				for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
					if (Titem_.id === id) {
						Titem_.health = f32(Titem_.health + value);
						if (Titem_.health < 0) Titem_.health = 0;
						if (Titem_.health > Ditem_health(Titem_.typ)) Titem_.health = f32(Ditem_health(Titem_.typ));
						return Str(Titem_.health, 'float');
					}
				}
				break;
		}
	},

	//Type
	/** Case "type" (parser_commands.bb:5027) */
	ha_type(_P: ParseCtx, classint: number, id: number): string {
		return Str(ha_type(classint, id));
	},

	//Use Stuff
	/** Case "use_x" (parser_commands.bb:5040) */
	cmd_use_x(_P: ParseCtx): string {
		return Str(G.pc_use_x, 'float');
	},

	//Use Stuff
	/** Case "use_y" (parser_commands.bb:5044) */
	cmd_use_y(_P: ParseCtx): string {
		return Str(G.pc_use_y, 'float');
	},

	//Use Stuff
	/** Case "use_z" (parser_commands.bb:5048) */
	cmd_use_z(_P: ParseCtx): string {
		return Str(G.pc_use_z, 'float');
	},

	//TerrainY
	/** Case "terrainy" (parser_commands.bb:5052) */
	e_tery(_P: ParseCtx, x: number, z: number): string {
		return Str(e_tery(x, z), 'float');
	},

	//Parent Class / Parent ID
	/** Case "parent_class","parent_id" (parser_commands.bb:5092) */
	cmd_parent_class(_P: ParseCtx, com: string, id: number): string | void {
		let p_return: string | undefined = undefined;
		let Titem_: Titem | null = null;
		// (no Exit in the loop: the last item with that id wins)
		for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
			if (Titem_.id === id) {
				if (com === 'parent_class') {
					p_return = Str(Titem_.parent_class);
				} else if (com === 'parent_id') {
					p_return = Str(Titem_.parent_id);
				}
			}
		}
		return p_return;
	},

	//Mapsize
	/** Case "mapsize" (parser_commands.bb:5111) */
	cmd_mapsize(_P: ParseCtx): string {
		return Str(G.ter_size * Cworld_size);
	},

	//Count
	/** Case "count" (parser_commands.bb:5115); con_add "result "+p_return$ of the unit branch is the handler's */
	cmd_count(_P: ParseCtx, classint: number, typ: number): string {
		let p_return = '';
		let Tobject_: Tobject | null = null;
		let Tunit_: Tunit | null = null;
		let Titem_: Titem | null = null;
		let Tinfo_: Tinfo | null = null;
		let Tstate_: Tstate | null = null;
		p_return = '0';
		switch (classint) {
			case Cclass_object:
				for (Tobject_ = First(Tobject); Tobject_ !== null; Tobject_ = After(Tobject, Tobject_)) {
					if (Tobject_.typ === typ) p_return = Str(Int(p_return) + 1);
				}
				break;
			case Cclass_unit:
				for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
					if (Tunit_.typ === typ) {
						if (Tunit_.health > 0) {
							p_return = Str(Int(p_return) + 1);
						}
					}
				}
				break;
			case Cclass_item:
				for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
					if (Titem_.typ === typ) p_return = Str(Int(p_return) + Titem_.count);
				}
				break;
			case Cclass_info:
				for (Tinfo_ = First(Tinfo); Tinfo_ !== null; Tinfo_ = After(Tinfo, Tinfo_)) {
					if (Tinfo_.typ === typ) p_return = Str(Int(p_return) + 1);
				}
				break;
			case Cclass_state:
				for (Tstate_ = First(Tstate); Tstate_ !== null; Tstate_ = After(Tstate, Tstate_)) {
					if (Tstate_.typ === typ) p_return = Str(Int(p_return) + 1);
				}
				break;
		}
		return p_return;
	},

	//Defparam
	/** Case "defparam" (parser_commands.bb:5151) */
	cmd_defparam(_P: ParseCtx, classint: number, typ: number, key: string): string | void {
		let Tdefparam_: Tdefparam | null = null;
		for (Tdefparam_ = First(Tdefparam); Tdefparam_ !== null; Tdefparam_ = After(Tdefparam, Tdefparam_)) {
			if (Tdefparam_.class === classint) {
				if (Tdefparam_.typ === typ) {
					if (Tdefparam_.key === key) {
						return Tdefparam_.value;
					}
				}
			}
		}
	},

	//Impact Class
	/** Case "sleeping" (parser_commands.bb:5171) */
	cmd_sleeping(_P: ParseCtx): string {
		return Str(G.g_sleep);
	},

	//################################################# AI

	//ai_signal
	/** Case "ai_signal" (parser_commands.bb:5311) */
	ai_signal(_P: ParseCtx, classint: number, id: number, mode: number, rangeadd: number): void {
		ai_signal(classint, id, mode, rangeadd);
	},

	//ai_typesignal
	/** Case "ai_typesignal" (parser_commands.bb:5329) */
	ai_typesignal(_P: ParseCtx, classint: number, id: number, mode: number, unittype: number, rangeadd: number): void {
		ai_typesignal(classint, id, mode, unittype, rangeadd);
	},

	//ai_behavioursignal
	/** Case "ai_behavioursignal" (parser_commands.bb:5349) */
	ai_behavioursignal(_P: ParseCtx, classint: number, id: number, mode: number, unittype: number, rangeadd: number): void {
		ai_behavioursignal(classint, id, mode, unittype, rangeadd);
	},

	//ai_mode
	/** Case "ai_mode" (parser_commands.bb:5369) */
	ai_unitmode(_P: ParseCtx, unitid: number, mode: number, classint: number, id: number): void {
		ai_unitmode(unitid, mode, classint, id);
	},

	//ai_stay
	/** Case "ai_stay" (parser_commands.bb:5394) */
	cmd_ai_stay(_P: ParseCtx, unitid: number, set: number): void {
		if (set === 1) {
			//Set
			set_state(Cstate_ai_stick, Cclass_unit, unitid);
		} else {
			//Delete
			free_state(Cstate_ai_stick, Cclass_unit, unitid);
		}
	},

	//ai_center
	/** Case "ai_center" (parser_commands.bb:5414) */
	cmd_ai_center(_P: ParseCtx, unitid: number): void {
		let Tunit_: Tunit | null = null;
		for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
			if (Tunit_.id === unitid) {
				Tunit_.ai_cx = EntityX(Tunit_.h);
				Tunit_.ai_cz = EntityZ(Tunit_.h);
				if (Tunit_.ai_ch !== null) {
					PositionEntity(Tunit_.ai_ch, Tunit_.ai_cx, 0, Tunit_.ai_cz);
				}
				break;
			}
		}
	}
};

void Cclass_info;
