/**
 * parse_commands() slice: parser_commands.bb lines 2185-3356.
 * Sections Interface, Diary, MAP INDICATORS, INFOS, BUILDINGS
 * (Case "closemenu" .. Case "buildsetup").
 *
 * Types of the parse_commands locals used here (a Blitz variable keeps the
 * type of its first appearance in the function):
 *   string: class$ frame$ source$ txt$ title$ image$ path$ file$ idstring$ lockid$ ...
 *   float:  x# y# alpha# tmp_y#
 *   int:    id typ col time classint mode fix r g b part max days entryl c i sfx lockbuildingid
 */
import type { CommandDef, ParseCtx } from '../api';
import { Cbmpf_red, Cclass_info, Cclass_unit } from '../host';
import { SEP_LINE, cinstr, split } from '../../blitz';
import { Float, Instr, Int, Mid, istr } from '../_helpers';

/** Const Cicon_ok=17 (load_const.bb) */
const Cicon_ok = 17;

export interface Host {
	/** set_debug: the debug setting (1 = on). */
	set_debug(): number;

	// --- Interface ----------------------------------------------------------
	/** closemenu: If m_section<>Csection_menu Then m_menu=0 : in_pc_menu=0 */
	cmd_closemenu(P: ParseCtx): void;
	/** map: If m_section<>Csection_menu Then m_menu=Cmenu_if_map */
	cmd_map(P: ParseCtx): void;
	/**
	 * equip. typ given: If typ>0 And typ<=Citem_count Then game_useasweapon(typ).
	 * typ undefined (no parameter): If m_menu=Cmenu_if_items Then if_quickslot().
	 */
	cmd_equip(P: ParseCtx, typ: number | undefined): void;
	/** if_msg(msg$, col, time). col is already forced to 0 when outside 0..6. */
	if_msg(P: ParseCtx, msg: string, col: number, time: number): void;
	/**
	 * msgbox. in_msgtitle$=title (always). text given: in_msgtext$=text and,
	 * If m_section<>Csection_menu, m_menu=Cmenu_if_msg. text undefined (the
	 * text source could not be resolved, parse_error already raised): neither.
	 * Always afterwards: in_sb(0..9)=0 and in_blockclose=ms.
	 */
	cmd_msgbox(P: ParseCtx, title: string, text: string | undefined): void;
	/** msg_extend: in_msgtext$=in_msgtext$+SEP_LINE+text */
	cmd_msg_extend(P: ParseCtx, text: string): void;
	/** msg_replace: in_msgtext$=Replace(in_msgtext$,from$,to$) */
	cmd_msg_replace(P: ParseCtx, from: string, to: string): void;
	/** gui_msg(title$, col, image$) */
	gui_msg(P: ParseCtx, title: string, col: number, image: string): void;
	/** gui_win_image(image$) */
	gui_win_image(P: ParseCtx, image: string): void;
	/** p_return$=gui_msgdecide(title$, col, cancel$, okay$, image$) */
	gui_msgdecide(
		P: ParseCtx,
		title: string,
		col: number,
		cancel: string,
		okay: string,
		image: string
	): string | void;
	/** p_return$=gui_msginput(title$, col, cancel$, okay$, image$) */
	gui_msginput(
		P: ParseCtx,
		title: string,
		col: number,
		cancel: string,
		okay: string,
		image: string
	): string | void;
	/**
	 * button (id is 0..9). If scr is given: in_sb_scr$(id)=scr (undefined: the
	 * text source could not be resolved, in_sb_scr$ stays as it was). Then
	 * in_sb(id)=1, in_sb_icon(id)=Int(frame$), in_sb_txt$(id)=title,
	 * in_sb_handle(id)=0 and, If Len(frame$)>2, in_sb_handle(id)=
	 * load_res(frame$,Cres_image,1) with in_sb_icon(id)=Cicon_ok (17) when
	 * that is 0, else -1. frame is the raw string ("17" by default).
	 */
	cmd_button(
		P: ParseCtx,
		id: number,
		title: string,
		frame: string,
		scr: string | undefined
	): void;
	/** exchange: if_exchange(classint,id,allowstore,types$) : in_blockclose=ms. types$ is "" or "|a|b|". */
	cmd_exchange(
		P: ParseCtx,
		classint: number,
		id: number,
		allowstore: number,
		types: string
	): void;
	/**
	 * selectplace: pc_sp_txt$=title, pc_sp_height#=height, pc_sp_x/y/z#=0,
	 * pc_sp_class/pc_sp_id=p_env_class/p_env_id, If m_section<>Csection_menu
	 * Then m_menu=Cmenu_if_selplace, in_blockclose=ms.
	 */
	cmd_selectplace(
		P: ParseCtx,
		title: string,
		height: number,
		env_class: number,
		env_id: number
	): void;
	/** p_return$=pc_sp_x# (float text) */
	cmd_selectplace_x(P: ParseCtx): string | void;
	/** p_return$=pc_sp_y# (float text) */
	cmd_selectplace_y(P: ParseCtx): string | void;
	/** p_return$=pc_sp_z# (float text) */
	cmd_selectplace_z(P: ParseCtx): string | void;
	/** process: in_pc_custom$=title, in_pc_customt=time, in_pc_event$=event, then "Start Custom Process". */
	cmd_process(P: ParseCtx, title: string, time: number, event: string): void;
	/**
	 * cracklock: FlushKeys(), pl_cl_title$=title, pc_cl_mode=mode,
	 * pc_cl_code$=code, pc_cl_class/pc_cl_id=p_env_class/p_env_id,
	 * pc_cl_pos=1, If m_section<>Csection_menu Then m_menu=Cmenu_if_cracklock,
	 * in_blockclose=ms.
	 */
	cmd_cracklock(
		P: ParseCtx,
		title: string,
		mode: number,
		code: string,
		env_class: number,
		env_id: number
	): void;
	/** text (id is 0..19): in_sitxt(id)=1 and in_sitxt_txt$/font/x/y/align(id). */
	cmd_text(
		P: ParseCtx,
		id: number,
		txt: string,
		font: number,
		x: number,
		y: number,
		align: number
	): void;
	/**
	 * image (id is 0..38): free in_siimg(id) if set, in_siimg_mask(id)=mask.
	 * If path$<>"": in_siimg(id)=load_image(path$), in_siimg_x/y(id)=x/y.
	 * path "" : x and y are undefined (in_siimg_x/y keep their values).
	 */
	cmd_image(
		P: ParseCtx,
		id: number,
		path: string,
		x: number | undefined,
		y: number | undefined,
		mask: number
	): void;
	/**
	 * dialogue: in_msgtitle$="Dialogue", in_dlg_page$=page (both always). txt
	 * given: in_dlg$=txt, free in_buildsetup_dummy If m_menu=Cmenu_if_buildsetup,
	 * If m_section<>Csection_menu Then m_menu=Cmenu_if_dlg, in_scr_scr=0,
	 * parse_dialogue(in_dlg_page), in_blockclose=ms. txt undefined: the text
	 * source could not be resolved (parse_error already raised), nothing more.
	 */
	cmd_dialogue(P: ParseCtx, page: string, txt: string | undefined): void;
	/** p_return$=m_menu */
	cmd_menu(P: ParseCtx): string | void;
	/**
	 * cscr: free in_clickscreenimage and every Tcscr, in_clickscreenx=close,
	 * If image$<>"" Then in_clickscreenimage=load_image(image$),
	 * m_menu=Cmenu_if_clickscreen (no m_section check here).
	 */
	cmd_cscr(P: ParseCtx, image: string, close: number): void;
	/** cscr_text: New Tcscr, typ=1, txt/x/y/col/align/tooltip/event. */
	cmd_cscr_text(
		P: ParseCtx,
		txt: string,
		x: number,
		y: number,
		col: number,
		align: number,
		tooltip: string,
		event: string
	): void;
	/** cscr_image: New Tcscr, typ=2, image=load_image(path$), x/y/tooltip/event. */
	cmd_cscr_image(
		P: ParseCtx,
		path: string,
		x: number,
		y: number,
		tooltip: string,
		event: string
	): void;
	/** savemapimage: genmap(size) : SaveImage map_mapimage,path$ : If size<>256 Then genmap(256) */
	cmd_savemapimage(P: ParseCtx, path: string, size: number): void;
	/**
	 * lockcombi: If a Tcom with mode=2 And aid$=combi exists: delete every Tx
	 * with mode=50 And key$=combi, then New Tx (mode=50, key$=combi).
	 */
	cmd_lockcombi(P: ParseCtx, combi: string): void;
	/** lockcombis: delete every Tx with mode=50, then New Tx (mode=50, key$=Tcom\aid$) for each Tcom with mode=2. */
	cmd_lockcombis(P: ParseCtx): void;

	// --- Diary --------------------------------------------------------------
	/**
	 * diary. txt given: New Tx (mode=2, key$=title, value$=txt); txt undefined:
	 * the text source could not be resolved (parse_error already raised), no
	 * entry. Then in both cases: If m_menu<Cmenu_if_movie (sic, "<") { If
	 * m_section<>Csection_menu Then m_menu=Cmenu_if_diary : if_centerpos() :
	 * in_scr_scr=0 : in_scr_scr2=0 : in_opt(0)=0 : select the first mode 2 Tx
	 * with key$=title (in_opt(0)=i, If i>4 Then in_scr_scr=i-4) }, sfx
	 * sfx_diary, if_msg(sm$(182),Cbmpf_yellow), in_blockclose=ms.
	 */
	cmd_diary(P: ParseCtx, title: string, txt: string | undefined): void;
	/**
	 * showentry: If m_menu<>Cmenu_if_movie { If m_section<>Csection_menu Then
	 * m_menu=Cmenu_if_diary : if_centerpos() }, in_scr_scr=0, in_scr_scr2=0,
	 * in_opt(0)=0, select the first mode 2 Tx with key$=entry, If sfx Then
	 * sfx sfx_diary, in_blockclose=ms.
	 */
	cmd_showentry(P: ParseCtx, entry: string, sfx: number): void;
	/** setday: map_day=day (already Abs(Int())). */
	cmd_setday(P: ParseCtx, day: number): void;
	/** sethour: map_hour=hour (already Abs(Int()), >23 -> 0) : e_environment_update_light() */
	cmd_sethour(P: ParseCtx, hour: number): void;
	/** setminute: map_minute=minute (already Abs(Int()), >59 -> 0) : e_environment_update_light() */
	cmd_setminute(P: ParseCtx, minute: number): void;

	// --- MAP INDICATORS (info typ 36) ------------------------------------------
	/** hideindicator (info exists and is typ 36): TCinfo\ints[1]=0 : info_vts() */
	cmd_hideindicator(P: ParseCtx, id: number): void;
	/** showindicator (info exists and is typ 36): TCinfo\ints[1]=1 : info_vts() */
	cmd_showindicator(P: ParseCtx, id: number): void;
	/** hideindicators: every Tinfo with typ=36: ints[1]=0 : info_vts() */
	cmd_hideindicators(P: ParseCtx): void;
	/** showindicators: every Tinfo with typ=36: ints[1]=1 : info_vts() */
	cmd_showindicators(P: ParseCtx): void;
	/**
	 * setindicatorlook (info exists and is typ 36). frame is a STRING (frame$
	 * of the "button" command): Select frame / Case 0,1 -> ints[0]=0, Case 2
	 * -> 9, Case 3 -> 10, Case 4 -> 11 compare as strings ("0","1","2","3",
	 * "4"); anything else leaves ints[0] alone. Then info_vts().
	 */
	cmd_setindicatorlook(P: ParseCtx, id: number, frame: string): void;
	/** setindicatorinfo (info exists and is typ 36): TCinfo\strings[0]=infotxt$ : info_vts() */
	cmd_setindicatorinfo(P: ParseCtx, id: number, infotxt: string): void;

	// --- INFOS --------------------------------------------------------------
	/** stoptrigger (info exists, typ NOT checked): TCinfo\floats[1]=0 : info_vts() */
	cmd_stoptrigger(P: ParseCtx, id: number): void;
	/** starttrigger (info exists, typ NOT checked): TCinfo\floats[1]=1 : info_vts() */
	cmd_starttrigger(P: ParseCtx, id: number): void;
	/** stoptriggers: every Tinfo with typ>=10 And typ<30: floats[1]=0 : info_vts() */
	cmd_stoptriggers(P: ParseCtx): void;
	/** starttriggers: every Tinfo with typ>=10 And typ<30: floats[1]=1 : info_vts() */
	cmd_starttriggers(P: ParseCtx): void;
	/** info_spawncontrol(TCinfo, mode) for the existing info `id`. */
	info_spawncontrol(P: ParseCtx, id: number, mode: number): void;
	/**
	 * info_sprite (info `id` is typ 5): If file$<>"self" Then strings[0]=file$,
	 * floats[0]=x, floats[1]=y, ints[0..2]=r,g,b, floats[2]=alpha,
	 * strings[1]=mode, strings[2]=fix, info_vts(), info_setupsprite(Tinfo).
	 */
	cmd_info_sprite(
		P: ParseCtx,
		id: number,
		file: string,
		x: number,
		y: number,
		r: number,
		g: number,
		b: number,
		alpha: number,
		mode: number,
		fix: number
	): void;
	/**
	 * info_loudspeaker (info `id` is typ 47): If file$<>"self" Then
	 * strings[0]=file$, If x#<>-1.0 Then floats[0]=x#, info_vts(),
	 * info_setuploudspeaker(Tinfo). x is -1.0 when not given.
	 */
	cmd_info_loudspeaker(P: ParseCtx, id: number, file: string, x: number): void;
	/**
	 * info_spawncontrol command (info `id` is typ 45): floats[0]=radius,
	 * ints[0]=classint, ints[1]=typ, strings[0]=part, ints[2]=max,
	 * strings[1]=days, info_vts().
	 */
	cmd_info_spawncontrol(
		P: ParseCtx,
		id: number,
		radius: number,
		classint: number,
		typ: number,
		part: number,
		max: number,
		days: number
	): void;

	// --- BUILDINGS ------------------------------------------------------------
	/** lockbuildings: delete every Tx with mode=3, then New Tx (mode=3, key$=Tbui\id) for each Tbui with mode=2. */
	cmd_lockbuildings(P: ParseCtx): void;
	/** builtat: Tstate\parent_id of the first Tstate with typ=Cstate_link And value=id (int text); void when none. */
	cmd_builtat(P: ParseCtx, id: number): string | void;
	/** game_buildsetup_start(id, y#) */
	game_buildsetup_start(P: ParseCtx, id: number, y: number): void;
}

/**
 * The "text source" lookup shared by many commands: an info id (first Tx of
 * that info, whatever its mode) or a script file. Returns "0" (txt$=0) when
 * the info has no Tx.
 */
function txtsource(P: ParseCtx, source: string): string {
	let txt = '0';
	if (Int(source) !== 0) {
		const n = Int(source);
		const tx = P.tx.find((t) => t.parent_class === Cclass_info && t.parent_id === n);
		if (tx) txt = tx.value;
	} else {
		txt = P.parse_loadscript(source);
	}
	return txt;
}

/** If txt$=0 Or txt$="" (string compare) */
function txtbad(txt: string): boolean {
	return txt === '0' || txt === '';
}

export const commands: CommandDef[] = [
	// ################################################# Interface
	{
		names: ['closemenu'],
		section: 'Interface',
		line: 2188,
		kind: 'host',
		returns: false,
		usage: '',
		run(P) {
			P.host.cmd_closemenu(P);
		}
	},
	{
		names: ['map'],
		section: 'Interface',
		line: 2195,
		kind: 'host',
		returns: false,
		usage: '',
		run(P) {
			P.host.cmd_map(P);
		}
	},
	{
		names: ['equip'],
		section: 'Interface',
		line: 2201,
		kind: 'host',
		returns: false,
		usage: '[typ:i]',
		run(P) {
			if (P.parse_param()) {
				const typ = Int(P.param());
				P.host.cmd_equip(P, typ);
			} else {
				P.host.cmd_equip(P, undefined);
			}
		}
	},
	{
		names: ['msg'],
		section: 'Interface',
		line: 2212,
		kind: 'host',
		returns: false,
		usage: 'msg:S [, col:i=0] [, time:i=3000]',
		run(P) {
			const msg = P.params();
			let col = 0;
			let time = 3000;
			if (P.parse_comma(0)) col = Int(P.param());
			if (P.parse_comma(0)) time = Int(P.param());
			if (col < 0) col = 0;
			else if (col > 6) col = 0;
			P.host.if_msg(P, msg, col, time);
		}
	},
	{
		names: ['msgbox'],
		section: 'Interface',
		line: 2225,
		kind: 'host',
		returns: false,
		usage: 'title:S [, source:s]',
		run(P) {
			const title = P.params();
			let text: string | undefined;
			if (P.parse_comma(0)) {
				const source = P.param();
				const txt = txtsource(P, source);
				if (txtbad(txt)) {
					// quirk: the title is replaced and the buttons are freed even though the text is not
					P.parse_error('txtsource', source);
				} else {
					text = txt;
				}
			} else {
				text = P.pv.buffer;
				P.pv.buffer = '';
			}
			P.host.cmd_msgbox(P, title, text);
		}
	},
	{
		names: ['msg_extend'],
		section: 'Interface',
		line: 2264,
		kind: 'host',
		returns: false,
		// quirk: there is no first parameter, so a source needs a LEADING comma ("msg_extend ,source;")
		usage: '[, source:s]',
		run(P) {
			if (P.parse_comma(0)) {
				const source = P.param();
				const txt = txtsource(P, source);
				if (txtbad(txt)) {
					P.parse_error('txtsource', source);
				} else {
					P.host.cmd_msg_extend(P, txt);
				}
			} else {
				const txt = P.pv.buffer;
				P.pv.buffer = '';
				P.host.cmd_msg_extend(P, txt);
			}
		}
	},
	{
		names: ['msg_replace'],
		section: 'Interface',
		line: 2290,
		kind: 'host',
		returns: false,
		usage: 'from:s , to:s',
		run(P) {
			const txt = P.param();
			P.parse_comma();
			const title = P.param();
			P.host.cmd_msg_replace(P, txt, title);
		}
	},
	{
		names: ['msgwin'],
		section: 'Interface',
		line: 2298,
		kind: 'host',
		returns: false,
		usage: 'title:S [, col:i=0] [, image:S]',
		run(P) {
			let col = 0;
			let image = '';
			const title = P.params();
			if (P.parse_comma(0)) col = Int(P.param());
			if (P.parse_comma(0)) image = P.params();
			P.host.gui_msg(P, title, col, image);
		}
	},
	{
		names: ['imagewin'],
		section: 'Interface',
		line: 2306,
		kind: 'host',
		returns: false,
		usage: 'image:S',
		run(P) {
			const image = P.params();
			P.host.gui_win_image(P, image);
		}
	},
	{
		names: ['decisionwin'],
		section: 'Interface',
		line: 2311,
		kind: 'host',
		returns: true,
		usage: 'title:S [, col:i=0] [, cancel:S] [, okay:S] [, image:S]',
		run(P) {
			let col = 0;
			let cancel = '';
			let okay = '';
			let image = '';
			const title = P.params();
			if (P.parse_comma(0)) col = Int(P.param());
			if (P.parse_comma(0)) cancel = P.params();
			if (P.parse_comma(0)) okay = P.params();
			if (P.parse_comma(0)) image = P.params();
			const r = P.host.gui_msgdecide(P, title, col, cancel, okay, image);
			if (typeof r === 'string') P.p_return = r;
		}
	},
	{
		names: ['inputwin'],
		section: 'Interface',
		line: 2326,
		kind: 'host',
		returns: true,
		usage: 'title:S [, col:i=0] [, cancel:S] [, okay:S] [, image:S]',
		run(P) {
			let col = 0;
			let cancel = '';
			let okay = '';
			let image = '';
			const title = P.params();
			if (P.parse_comma(0)) col = Int(P.param());
			if (P.parse_comma(0)) cancel = P.params();
			if (P.parse_comma(0)) okay = P.params();
			if (P.parse_comma(0)) image = P.params();
			const r = P.host.gui_msginput(P, title, col, cancel, okay, image);
			if (typeof r === 'string') P.p_return = r;
		}
	},
	{
		names: ['button'],
		section: 'Interface',
		line: 2341,
		kind: 'host',
		returns: false,
		usage: 'id:i , title:S [, frame:s=17] [, source:s]',
		run(P) {
			const id = Int(P.param());
			// frame$ is a string: holds an icon number or an image path
			let frame = istr(Cicon_ok);
			if (id >= 0 && id < 10) {
				P.parse_comma(1);
				const title = P.params();
				if (P.parse_comma(0)) {
					frame = P.param();
				}
				let scr: string | undefined;
				if (P.parse_comma(0)) {
					const source = P.param();
					const txt = txtsource(P, source);
					if (txtbad(txt)) {
						// quirk: the button is still set up, keeping whatever script slot `id` had
						P.parse_error('txtsource', source);
					} else {
						scr = txt;
					}
				} else {
					scr = P.pv.buffer;
					P.pv.buffer = '';
				}
				P.host.cmd_button(P, id, title, frame, scr);
			} else {
				// quirk: the remaining parameters are not read
				P.parse_error('Button ID between 0 and 9 expected!');
			}
		}
	},
	{
		names: ['exchange'],
		section: 'Interface',
		line: 2397,
		kind: 'host',
		returns: false,
		usage: '{class:s , id:i | self} [, allowstore:i=1] [, type:s ...]',
		run(P) {
			let cls = P.param();
			let classint = P.parse_getclass(cls);
			let id = 0;
			if (classint === -1) {
				classint = P.p_env_class;
				id = P.p_env_id;
			} else {
				P.parse_comma(1);
				id = Int(P.param());
			}
			if (P.host.parent_con(classint, id)) {
				let typ = 1;
				if (P.parse_comma(0)) typ = Int(P.param());
				cls = '';
				while (P.parse_comma(0) > 0) {
					if (cls === '') cls = '|';
					cls = cls + P.param() + '|';
				}
				P.host.cmd_exchange(P, classint, id, typ, cls);
			} else {
				// quirk: no parse_error, only a console line in debug mode; the remaining parameters are not read
				if ((P.host.set_debug() ?? 0) === 1) {
					P.host.con_add('ERROR: exchange - invalid class/id', Cbmpf_red);
				}
			}
		}
	},
	{
		names: ['selectplace'],
		section: 'Interface',
		line: 2423,
		kind: 'host',
		returns: false,
		usage: 'title:S [, height:f=100]',
		run(P) {
			const title = P.params();
			let height = 100;
			if (P.parse_comma(0)) {
				height = Float(P.param());
			}
			P.host.cmd_selectplace(P, title, height, P.p_env_class, P.p_env_id);
		}
	},
	{
		names: ['selectplace_x'],
		section: 'Interface',
		line: 2441,
		kind: 'host',
		returns: true,
		usage: '',
		run(P) {
			const r = P.host.cmd_selectplace_x(P);
			if (typeof r === 'string') P.p_return = r;
		}
	},
	{
		names: ['selectplace_y'],
		section: 'Interface',
		line: 2445,
		kind: 'host',
		returns: true,
		usage: '',
		run(P) {
			const r = P.host.cmd_selectplace_y(P);
			if (typeof r === 'string') P.p_return = r;
		}
	},
	{
		names: ['selectplace_z'],
		section: 'Interface',
		line: 2449,
		kind: 'host',
		returns: true,
		usage: '',
		run(P) {
			const r = P.host.cmd_selectplace_z(P);
			if (typeof r === 'string') P.p_return = r;
		}
	},
	{
		names: ['process'],
		section: 'Interface',
		line: 2453,
		kind: 'host',
		returns: false,
		usage: 'title:S [, time:i=5000] [, event:S]',
		run(P) {
			const title = P.params();
			let time: number;
			if (P.parse_comma(0)) {
				time = Int(P.param());
			} else {
				time = 5000;
			}
			let event: string;
			if (P.parse_comma(0)) {
				event = P.params();
			} else {
				event = '';
			}
			P.host.cmd_process(P, title, time, event);
		}
	},
	{
		names: ['cracklock'],
		section: 'Interface',
		line: 2480,
		kind: 'host',
		returns: false,
		usage: 'title:S , mode:i , code:S',
		run(P) {
			// (FlushKeys() comes first in the original; it is part of the host call)
			const title = P.params();
			P.parse_comma();
			const mode = Int(P.param());
			P.parse_comma();
			const code = P.params();
			P.host.cmd_cracklock(P, title, mode, code, P.p_env_class, P.p_env_id);
		}
	},
	{
		names: ['text'],
		section: 'Interface',
		line: 2497,
		kind: 'host',
		returns: false,
		usage: 'id:i , txt:s [, font:i=0] [, x:i , y:i [, align:i=1]]',
		run(P) {
			const id = Int(P.param());
			if (id >= 0 && id < 20) {
				P.parse_comma(1);
				const txt = P.param();
				let font = 0;
				let align = -1; // -1 = no position given; becomes 1 once x,y are read
				let x = 0;
				let y = 0;
				if (P.parse_comma(0)) {
					font = Int(P.param());
				}
				if (P.parse_comma(0)) {
					x = Int(P.param());
					P.parse_comma(1);
					y = Int(P.param());
					align = 1;
					if (P.parse_comma(0)) {
						align = Int(P.param());
					}
				}
				P.host.cmd_text(P, id, txt, font, x, y, align);
			} else {
				// quirk: the remaining parameters are not read
				P.parse_error('Interface Text ID between 0 and 19 expected!');
			}
		}
	},
	{
		names: ['image'],
		section: 'Interface',
		line: 2525,
		kind: 'host',
		returns: false,
		usage: 'id:i , path:s {, x:i , y:i [, mask:i=1] | (path "")}',
		run(P) {
			const id = Int(P.param());
			// quirk: "id<39" although the array and the error text allow 0..39, so image 39 is unusable
			if (id >= 0 && id < 39) {
				P.parse_comma(1);
				const path = P.param();
				let mask = 1;
				let x: number | undefined;
				let y: number | undefined;
				if (path !== '') {
					P.parse_comma(1);
					x = Int(P.param());
					P.parse_comma(1);
					y = Int(P.param());
					if (P.parse_comma(0)) {
						mask = Int(P.param());
					}
				}
				P.host.cmd_image(P, id, path, x, y, mask);
			} else {
				P.parse_error('Interface Image ID between 0 and 39 expected!');
			}
		}
	},
	{
		names: ['dialogue'],
		section: 'Interface',
		line: 2551,
		kind: 'host',
		returns: false,
		usage: 'page:s , source:s',
		run(P) {
			const page = P.param();
			P.parse_comma(1);
			const source = P.param();
			const txt = txtsource(P, source);
			if (txtbad(txt)) {
				// quirk: in_msgtitle$ and in_dlg_page$ are overwritten even when the source is invalid
				P.parse_error('txtsource', source);
				P.host.cmd_dialogue(P, page, undefined);
			} else {
				P.host.cmd_dialogue(P, page, txt);
			}
		}
	},
	{
		names: ['menu'],
		section: 'Interface',
		line: 2587,
		kind: 'host',
		returns: true,
		usage: '',
		run(P) {
			const r = P.host.cmd_menu(P);
			if (typeof r === 'string') P.p_return = r;
		}
	},
	{
		names: ['cscr'],
		section: 'Interface',
		line: 2592,
		kind: 'host',
		returns: false,
		usage: '[image:S [, close:i=1]]',
		run(P) {
			let close = 1;
			let image = '';
			if (P.parse_param()) {
				image = P.params();
				if (P.parse_comma(0)) {
					close = Int(P.param());
				}
			}
			P.host.cmd_cscr(P, image, close);
		}
	},
	{
		names: ['cscr_text'],
		section: 'Interface',
		line: 2615,
		kind: 'host',
		returns: false,
		usage: 'txt:s , x:i , y:i [, col:i=-1] [, align:i] [, tooltip:s] [, source:s]',
		run(P) {
			const txt = P.param();
			P.parse_comma(1);
			const x = Int(P.param());
			P.parse_comma(1);
			const y = Int(P.param());
			let col = -1;
			let align = 0;
			let tooltip = '';
			let event = '';
			if (P.parse_comma(0)) {
				col = Int(P.param());
			}
			if (P.parse_comma(0)) {
				align = Int(P.param());
			}
			if (P.parse_comma(0)) {
				tooltip = P.param();
			}
			if (P.parse_comma(0)) {
				const source = P.param();
				const t = txtsource(P, source);
				if (txtbad(t)) {
					// quirk: the text is still added, without an event
					P.parse_error('txtsource', source);
				} else {
					event = t;
				}
			} else {
				// quirk: without a source the buffer is always consumed as the click event
				event = P.pv.buffer;
				P.pv.buffer = '';
			}
			P.host.cmd_cscr_text(P, txt, x, y, col, align, tooltip, event);
		}
	},
	{
		names: ['cscr_image'],
		section: 'Interface',
		line: 2663,
		kind: 'host',
		returns: false,
		usage: 'path:s , x:i , y:i [, tooltip:s] [, source:s]',
		run(P) {
			const path = P.param();
			P.parse_comma(1);
			const x = Int(P.param());
			P.parse_comma(1);
			const y = Int(P.param());
			let tooltip = '';
			let event = '';
			if (P.parse_comma(0)) {
				tooltip = P.param();
			}
			if (P.parse_comma(0)) {
				const source = P.param();
				const t = txtsource(P, source);
				if (txtbad(t)) {
					// quirk: the image is still added, without an event
					P.parse_error('txtsource', source);
				} else {
					event = t;
				}
			} else {
				// quirk: without a source the buffer is always consumed as the click event
				event = P.pv.buffer;
				P.pv.buffer = '';
			}
			P.host.cmd_cscr_image(P, path, x, y, tooltip, event);
		}
	},
	{
		names: ['savemapimage'],
		section: 'Interface',
		line: 2705,
		kind: 'host',
		returns: false,
		usage: 'path:s [, size:i=256]',
		run(P) {
			const path = P.param();
			let classint = 256;
			if (P.parse_comma(0)) {
				classint = Int(P.param());
			}
			// quirk: "If path$<>0" is a string compare with "0"; an empty path is NOT rejected
			if (path !== '0') {
				P.host.cmd_savemapimage(P, path, classint);
			}
		}
	},
	{
		names: ['lockcombi'],
		section: 'Interface',
		line: 2718,
		kind: 'host',
		returns: false,
		usage: 'combi:S',
		run(P) {
			const combistring = P.params();
			// needs the Tcom definitions: whole effect (incl. the Tx mode 50 update) is the host's
			P.host.cmd_lockcombi(P, combistring);
		}
	},
	{
		names: ['lockcombis'],
		section: 'Interface',
		line: 2739,
		kind: 'host',
		returns: false,
		usage: '',
		run(P) {
			P.host.cmd_lockcombis(P);
		}
	},
	{
		names: ['unlockcombi'],
		section: 'Interface',
		line: 2752,
		kind: 'core',
		returns: false,
		usage: 'combi:S',
		run(P) {
			const combistring = P.params();
			P.tx.remove((t) => t.mode === 50 && t.key === combistring);
		}
	},
	{
		names: ['unlockcombis'],
		section: 'Interface',
		line: 2759,
		kind: 'core',
		returns: false,
		usage: '',
		run(P) {
			P.tx.remove((t) => t.mode === 50);
		}
	},

	// ################################################# Diary
	{
		names: ['diary'],
		section: 'Diary',
		line: 2769,
		kind: 'host',
		returns: false,
		// note: the source is read with params() here (param() in the Interface commands)
		usage: 'title:S [, source:S]',
		run(P) {
			const title = P.params();
			let txt: string | undefined;
			if (P.parse_comma(0)) {
				const source = P.params();
				const t = txtsource(P, source);
				if (txtbad(t)) {
					// quirk: the diary still opens, plays its sound and shows the "new entry" message
					P.parse_error('txtsource', source);
				} else {
					txt = t;
				}
			} else {
				txt = P.pv.buffer;
				P.pv.buffer = '';
			}
			P.host.cmd_diary(P, title, txt);
		}
	},
	{
		names: ['freeentry'],
		section: 'Diary',
		line: 2830,
		kind: 'core',
		returns: false,
		usage: '[entry:S]',
		run(P) {
			if (P.parse_param()) {
				const entry = P.params();
				// only the first entry with that title
				const tx = P.tx.find((t) => t.mode === 2 && t.key === entry);
				if (tx) P.tx.delete(tx);
			} else {
				P.tx.remove((t) => t.mode === 2);
			}
		}
	},
	{
		names: ['modifyentry'],
		section: 'Diary',
		line: 2850,
		kind: 'core',
		returns: false,
		usage: 'entry:S [, source:S]',
		run(P) {
			const entry = P.params();
			if (P.parse_comma(0)) {
				const source = P.params();
				const txt = txtsource(P, source);
				if (txtbad(txt)) {
					P.parse_error('txtsource', source);
				} else {
					const tx = P.tx.find((t) => t.mode === 2 && t.key === entry);
					if (tx) tx.value = txt;
				}
			} else {
				const tx = P.tx.find((t) => t.mode === 2 && t.key === entry);
				if (tx) {
					// quirk: the buffer is only cleared when the entry exists
					tx.value = P.pv.buffer;
					P.pv.buffer = '';
				}
			}
		}
	},
	{
		names: ['modifyentryline'],
		section: 'Diary',
		line: 2892,
		kind: 'core',
		returns: false,
		usage: 'entry:S , line:i , newline:S',
		run(P) {
			const entry = P.params();
			P.parse_comma(1);
			const entryl = Int(P.param());
			P.parse_comma(1);
			const newline = P.params();
			const tx = P.tx.find((t) => t.mode === 2 && t.key === entry);
			if (tx) {
				// BUG kept: cinstr() always returns 0, so c=0: split() gets limit 0 (= Len) and
				// only splits$(0) is written back. The entry is cut down to its first line
				// (or to `newline` when line=0) plus a trailing separator.
				const c = cinstr(tx.value, SEP_LINE);
				const splits = split(tx.value, SEP_LINE, c);
				// splits$(entryl)=newline$: out of range writes are unchecked memory writes in the
				// original (no visible effect here: ignored)
				if (entryl >= 0 && entryl < splits.length) splits[entryl] = newline;
				tx.value = '';
				for (let i = 0; i <= c; i++) {
					tx.value = tx.value + splits[i] + SEP_LINE;
				}
			}
		}
	},
	{
		names: ['extendentry'],
		section: 'Diary',
		line: 2914,
		kind: 'core',
		returns: false,
		usage: 'entry:S [, source:S]',
		run(P) {
			const entry = P.params();
			if (P.parse_comma(0)) {
				const source = P.params();
				const txt = txtsource(P, source);
				if (txtbad(txt)) {
					P.parse_error('txtsource', source);
				} else {
					const tx = P.tx.find((t) => t.mode === 2 && t.key === entry);
					if (tx) tx.value = tx.value + SEP_LINE + txt;
				}
			} else {
				const tx = P.tx.find((t) => t.mode === 2 && t.key === entry);
				if (tx) {
					// quirk: the buffer is only cleared when the entry exists
					tx.value = tx.value + SEP_LINE + P.pv.buffer;
					P.pv.buffer = '';
				}
			}
		}
	},
	{
		names: ['showentry'],
		section: 'Diary',
		line: 2956,
		kind: 'host',
		returns: false,
		usage: 'entry:S [, sfx:i=1]',
		run(P) {
			const entry = P.params();
			// (the original switches the menu before reading the sfx parameter)
			let sfx = 1;
			if (P.parse_comma(0)) {
				sfx = Int(P.param());
			}
			P.host.cmd_showentry(P, entry, sfx);
		}
	},
	{
		names: ['setday'],
		section: 'Diary',
		line: 2991,
		kind: 'host',
		returns: false,
		usage: 'day:i',
		run(P) {
			const day = Math.abs(Int(P.param())) | 0;
			P.host.cmd_setday(P, day);
		}
	},
	{
		names: ['sethour'],
		section: 'Diary',
		line: 2995,
		kind: 'host',
		returns: false,
		usage: 'hour:i',
		run(P) {
			let hour = Math.abs(Int(P.param())) | 0;
			// out of range becomes 0, it is not wrapped
			if (hour > 23) hour = 0;
			P.host.cmd_sethour(P, hour);
		}
	},
	{
		names: ['setminute'],
		section: 'Diary',
		line: 3001,
		kind: 'host',
		returns: false,
		usage: 'minute:i',
		run(P) {
			let minute = Math.abs(Int(P.param())) | 0;
			if (minute > 59) minute = 0;
			P.host.cmd_setminute(P, minute);
		}
	},

	// ################################################# MAP INDICATORS
	{
		names: ['hideindicator'],
		section: 'MAP INDICATORS',
		line: 3009,
		kind: 'host',
		returns: false,
		usage: 'id:i',
		run(P) {
			const id = Int(P.param());
			if (P.host.con_info(id)) {
				if (P.host.entity_typ(Cclass_info, id) === 36) {
					P.host.cmd_hideindicator(P, id);
				} else {
					P.parse_error('infotype', 36);
				}
			} else {
				P.parse_error('object', id);
			}
		}
	},
	{
		names: ['showindicator'],
		section: 'MAP INDICATORS',
		line: 3023,
		kind: 'host',
		returns: false,
		usage: 'id:i',
		run(P) {
			const id = Int(P.param());
			if (P.host.con_info(id)) {
				if (P.host.entity_typ(Cclass_info, id) === 36) {
					P.host.cmd_showindicator(P, id);
				} else {
					P.parse_error('infotype', 36);
				}
			} else {
				P.parse_error('object', id);
			}
		}
	},
	{
		names: ['hideindicators'],
		section: 'MAP INDICATORS',
		line: 3037,
		kind: 'host',
		returns: false,
		usage: '',
		run(P) {
			P.host.cmd_hideindicators(P);
		}
	},
	{
		names: ['showindicators'],
		section: 'MAP INDICATORS',
		line: 3046,
		kind: 'host',
		returns: false,
		usage: '',
		run(P) {
			P.host.cmd_showindicators(P);
		}
	},
	{
		names: ['setindicatorlook'],
		section: 'MAP INDICATORS',
		line: 3055,
		kind: 'host',
		returns: false,
		usage: 'id:i , frame:s',
		run(P) {
			const id = Int(P.param());
			P.parse_comma(1);
			// quirk: "frame" is the string frame$ of the button command, so the Select
			// compares text: "2" matches, "2.0" or "02" do not
			const frame = P.param();
			if (P.host.con_info(id)) {
				if (P.host.entity_typ(Cclass_info, id) === 36) {
					P.host.cmd_setindicatorlook(P, id, frame);
				} else {
					P.parse_error('infotype', 36);
				}
			} else {
				P.parse_error('object', id);
			}
		}
	},
	{
		names: ['setindicatorinfo'],
		section: 'MAP INDICATORS',
		line: 3076,
		kind: 'host',
		returns: false,
		usage: 'id:i , infotxt:S',
		run(P) {
			const id = Int(P.param());
			P.parse_comma(1);
			const infotxt = P.params();
			if (P.host.con_info(id)) {
				if (P.host.entity_typ(Cclass_info, id) === 36) {
					P.host.cmd_setindicatorinfo(P, id, infotxt);
				} else {
					P.parse_error('infotype', 36);
				}
			} else {
				P.parse_error('object', id);
			}
		}
	},

	// ################################################# INFOS
	{
		names: ['stoptrigger'],
		section: 'INFOS',
		line: 3096,
		kind: 'host',
		returns: false,
		usage: '{id:i | self}',
		run(P) {
			const idstring = P.param();
			let id: number;
			if (idstring === 'self') {
				id = P.p_env_id;
			} else {
				id = Int(idstring);
			}
			if (P.host.con_info(id)) {
				// quirk: the info type is not checked, floats[1] of ANY info is written
				P.host.cmd_stoptrigger(P, id);
			} else {
				P.parse_error('object', id);
			}
		}
	},
	{
		names: ['starttrigger'],
		section: 'INFOS',
		line: 3111,
		kind: 'host',
		returns: false,
		usage: '{id:i | self}',
		run(P) {
			const idstring = P.param();
			let id: number;
			if (idstring === 'self') {
				id = P.p_env_id;
			} else {
				id = Int(idstring);
			}
			if (P.host.con_info(id)) {
				// quirk: the info type is not checked, floats[1] of ANY info is written
				P.host.cmd_starttrigger(P, id);
			} else {
				P.parse_error('object', id);
			}
		}
	},
	{
		names: ['stoptriggers'],
		section: 'INFOS',
		line: 3126,
		kind: 'host',
		returns: false,
		usage: '',
		run(P) {
			P.host.cmd_stoptriggers(P);
		}
	},
	{
		names: ['starttriggers'],
		section: 'INFOS',
		line: 3135,
		kind: 'host',
		returns: false,
		usage: '',
		run(P) {
			P.host.cmd_starttriggers(P);
		}
	},
	{
		names: ['trigger'],
		section: 'INFOS',
		line: 3144,
		kind: 'host',
		returns: false,
		usage: 'id:i',
		run(P) {
			const id = Int(P.param());
			if (P.host.con_info(id)) {
				P.host.info_spawncontrol(P, id, 1);
				// BUG kept: the event is queued for Cclass_unit with the info's id, not for the info
				P.set_parsecache(Cclass_unit, id, 'trigger', 'triggered by trigger command');
			} else {
				P.parse_error('object', id);
			}
		}
	},
	{
		names: ['info_sprite'],
		section: 'INFOS',
		line: 3154,
		kind: 'host',
		returns: false,
		usage: 'id:i [, file:s [, x:f=1 , y:f=1 [, r:i=255 , g:i=255 , b:i=255 [, alpha:f=1 [, mode:i=0 [, fix:i=0]]]]]]',
		run(P) {
			let id = 0;
			let file = '';
			let x = 1;
			let y = 1;
			let r = 255;
			let g = 255;
			let b = 255;
			let alpha = 1.0;
			let mode = 0;
			let fix = 0;
			id = Int(P.param());
			if (P.parse_comma(0)) {
				file = P.param();
				if (P.parse_comma(0)) {
					x = Float(P.param());
					P.parse_comma(1);
					y = Float(P.param());
					if (P.parse_comma(0)) {
						r = Int(P.param());
						P.parse_comma(1);
						g = Int(P.param());
						P.parse_comma(1);
						b = Int(P.param());
						if (P.parse_comma(0)) {
							alpha = Float(P.param());
							if (P.parse_comma(0)) {
								mode = Int(P.param());
								if (P.parse_comma(0)) {
									fix = Int(P.param());
								}
							}
						}
					}
				}
			}
			// quirk: an unknown id is silently ignored; without a file the sprite's file is set to ""
			for (const T of [...(P.host.entities(Cclass_info) ?? [])]) {
				if (T.id === id) {
					if (T.typ === 5) {
						P.host.cmd_info_sprite(P, id, file, x, y, r, g, b, alpha, mode, fix);
					} else {
						P.parse_error("'info_sprite' expects a sprite info");
					}
				}
			}
		}
	},
	{
		names: ['info_loudspeaker'],
		section: 'INFOS',
		line: 3211,
		kind: 'host',
		returns: false,
		usage: 'id:i , file:s [, x:f=-1]',
		run(P) {
			let x = -1.0;
			const id = Int(P.param());
			P.parse_comma(1);
			const file = P.param();
			if (P.parse_comma(0)) {
				x = Float(P.param());
			}
			// quirk: an unknown id is silently ignored
			for (const T of [...(P.host.entities(Cclass_info) ?? [])]) {
				if (T.id === id) {
					if (T.typ === 47) {
						P.host.cmd_info_loudspeaker(P, id, file, x);
					} else {
						P.parse_error("'info_loudspeaker' expects a loudspeaker info");
					}
				}
			}
		}
	},
	{
		names: ['info_spawncontrol'],
		section: 'INFOS',
		line: 3235,
		kind: 'host',
		returns: false,
		usage: 'id:i , radius:f , class:s , typ:i , part:i , max:i , days:i',
		run(P) {
			const id = Int(P.param());
			P.parse_comma(1);
			const x = Float(P.param());
			P.parse_comma(1);
			// "class=param()" / "class=parse_getclass(class$,0)": class is the string class$ of the
			// function, so this works as intended (mode 0: no "self", parse_error on an unknown class)
			let cls = P.param();
			cls = istr(P.parse_getclass(cls, 0));
			P.parse_comma(1);
			const typ = Int(P.param());
			P.parse_comma(1);
			const part = Int(P.param());
			P.parse_comma(1);
			const max = Int(P.param());
			P.parse_comma(1);
			const days = Int(P.param());
			// quirk: an unknown id is silently ignored
			for (const T of [...(P.host.entities(Cclass_info) ?? [])]) {
				if (T.id === id) {
					if (T.typ === 45) {
						P.host.cmd_info_spawncontrol(P, id, x, Int(cls), typ, part, max, days);
					} else {
						P.parse_error("'info_spawncontrol' expects a spawncontrol info");
					}
				}
			}
		}
	},

	// ################################################# BUILDINGS
	{
		names: ['lockbuilding'],
		section: 'BUILDINGS',
		line: 3270,
		kind: 'core',
		returns: false,
		usage: 'id:i',
		run(P) {
			// lockbuildingid is an int: the key is its decimal text; the id is not validated
			const lockbuildingid = Int(P.param());
			const key = istr(lockbuildingid);
			P.tx.remove((t) => t.mode === 3 && t.key === key);
			P.tx.add({ mode: 3, key });
		}
	},
	{
		names: ['lockbuildings'],
		section: 'BUILDINGS',
		line: 3280,
		kind: 'host',
		returns: false,
		usage: '',
		run(P) {
			// needs the Tbui definitions: whole effect (incl. the Tx mode 3 update) is the host's
			P.host.cmd_lockbuildings(P);
		}
	},
	{
		names: ['unlockbuilding'],
		section: 'BUILDINGS',
		line: 3293,
		kind: 'core',
		returns: false,
		usage: 'id:i',
		run(P) {
			const lockbuildingid = Int(P.param());
			const key = istr(lockbuildingid);
			P.tx.remove((t) => t.mode === 3 && t.key === key);
		}
	},
	{
		names: ['unlockbuildings'],
		section: 'BUILDINGS',
		line: 3300,
		kind: 'core',
		returns: false,
		usage: '',
		run(P) {
			P.tx.remove((t) => t.mode === 3);
		}
	},
	{
		names: ['builtat'],
		section: 'BUILDINGS',
		line: 3306,
		kind: 'host',
		returns: true,
		usage: '{id:i | self}',
		run(P) {
			P.p_return = '0';
			const idstring = P.param();
			let id: number;
			if (idstring === 'self') {
				id = P.p_env_id;
			} else {
				id = Int(idstring);
			}
			const r = P.host.cmd_builtat(P, id);
			if (typeof r === 'string') P.p_return = r;
		}
	},
	{
		names: ['locked'],
		section: 'BUILDINGS',
		line: 3324,
		kind: 'core',
		returns: true,
		usage: 'lockid:s',
		run(P) {
			P.p_return = '0';
			const lockid = P.param();
			// a positive number asks for a building lock (mode 3), anything else for a
			// combination lock (mode 50) compared as text
			if (Int(lockid) > 0) {
				const n = Int(lockid);
				if (P.tx.find((t) => t.mode === 3 && Int(t.key) === n)) {
					P.p_return = '1';
				}
			} else {
				if (P.tx.find((t) => t.mode === 50 && t.key === lockid)) {
					P.p_return = '1';
				}
			}
		}
	},
	{
		names: ['lastbuildingsite'],
		section: 'BUILDINGS',
		line: 3344,
		kind: 'core',
		returns: true,
		usage: '',
		run(P) {
			P.p_return = istr(P.pv.lastbuilding);
		}
	},
	{
		names: ['buildsetup'],
		section: 'BUILDINGS',
		line: 3348,
		kind: 'host',
		returns: false,
		usage: 'id:s [, y:f=0]',
		run(P) {
			const lockid = P.param();
			let tmp_y: number;
			if (P.parse_comma(0)) {
				tmp_y = Float(P.param());
			} else {
				tmp_y = 0;
			}
			P.host.game_buildsetup_start(P, Int(lockid), tmp_y);
		}
	}
];
