/**
 * The input/interface globals of load_vars.bb ("INPUT / INTERFACE (in_)"),
 * with their original names, plus the handful of other globals the input
 * and GUI code reads. Blitz globals are module-wide mutable variables; ES
 * modules cannot export those writably, so they live on one object: `S`.
 *
 * Arrays keep Blitz's sizes: `Dim a(n)` has n+1 elements.
 */
import type { ImageHandle } from '../gfx2d';

const ints = (n: number): number[] => new Array<number>(n + 1).fill(0);
const strs = (n: number): string[] => new Array<string>(n + 1).fill('');

// load_const.bb
export const Csection_menu = 0,
	Csection_game_sp = 1,
	Csection_game_mp = 2,
	Csection_editor = 3;

export const Cmenu_ed_scripts = 104;
export const Cmenu_if_items = 2,
	Cmenu_if_exchange = 23;

export const Cclass_object = 1,
	Cclass_unit = 2,
	Cclass_item = 3,
	Cclass_info = 4,
	Cclass_state = 5;

export const Ckey_forward = 0,
	Ckey_backward = 1,
	Ckey_left = 2,
	Ckey_right = 3,
	Ckey_jump = 4,
	Ckey_sleep = 5,
	Ckey_attack1 = 6,
	Ckey_attack2 = 7,
	Ckey_next = 8,
	Ckey_prev = 9,
	Ckey_drop = 10,
	Ckey_use = 11,
	Ckey_char = 12,
	Ckey_items = 13,
	Ckey_quicksave = 14,
	Ckey_quickload = 15,
	Ckey_chat = 16,
	Ckey_diary = 17;

/** Type Tfile (file window entries). */
export interface Tfile {
	name: string;
	path: string;
	/** 1 = file, 2 = directory/drive */
	typ: number;
	icon: number;
}
/** Type Ttbt (text box row). */
export interface Ttbt {
	txt: string;
}
/** Type Tbmpf_img (images referenced from text via $img=). */
export interface Tbmpf_img {
	file: string;
	h: ImageHandle;
}

function initialState() {
	return {
		// ---- settings / timing / menu globals owned by other parts of the game
		set_scrx: 800,
		set_scry: 600,
		/** Running from the Blitz IDE (dev mode): enables the command list update button. */
		set_inbb: 0,
		ms: 0,
		lastms: 0,
		/** Game timer (Int) */
		gt: 0,
		fps: 0,
		fpsms: 0,
		fpsf: 0,
		/** FPS factor f# */
		f: 1,
		blackframe: 0,
		m_section: Csection_menu,
		m_menu: 0,
		game_scriptkeys: 0,
		game_scriptkey: ints(20),
		tmp_lines: 0,
		tmp_linesvisible: 0,
		tmp_slideend: 0,
		ed_groupg: strs(4),
		ed_groupn: strs(4),

		// ---- in_
		in_mhit: ints(5),
		in_mdown: ints(5),
		in_mrelease: ints(5),
		in_mx: 0,
		in_my: 0,
		in_mxo: 0,
		in_myo: 0,
		in_mpt: 0,
		in_mpts: 0,
		in_mxs: 0,
		in_mys: 0,
		in_mzs: 0,
		in_key: 0,
		in_escape: 0,
		in_ttx: 0,
		in_tty: 0,
		in_ttt: '',
		in_check: ints(10),
		in_opt: ints(10),
		in_input: strs(30),
		in_inputfocus: 0,
		in_slider: ints(10),
		in_slidefocus: 0,
		in_cursor: 0,
		in_cursorms: 0,
		in_cursorf: 0,
		in_px: 0,
		in_py: 0,
		in_pz: 0,
		in_pe: 0,
		in_ca: 0,
		in_wa: 0,

		in_t50: 0,
		in_t50go: 0,
		in_t100: 0,
		in_t100go: 0,
		in_t500: 0,
		in_t500go: 0,
		in_t1000: 0,
		in_t1000go: 0,
		in_t2000: 0,
		in_t2000go: 0,
		in_t3000: 0,
		in_t3000go: 0,
		in_t5000: 0,
		in_t5000go: 0,
		in_t10000: 0,
		in_t10000go: 0,
		in_tgametime: 0,
		in_gt20: 0,
		in_gt20go: 0,
		in_gt50: 0,
		in_gt50go: 0,
		in_gt100: 0,
		in_gt100go: 0,
		in_gt500: 0,
		in_gt500go: 0,
		in_gt1000: 0,
		in_gt1000go: 0,
		in_gt5000: 0,
		in_gt5000go: 0,
		in_gtmod: 1,

		in_turnh: 0,
		in_object_scr: 0,
		in_object_sel: 0,
		in_unit_scr: 0,
		in_unit_sel: 0,
		in_item_scr: 0,
		in_item_sel: 0,
		in_info_scr: 0,
		in_info_sel: 0,
		in_state_scr: 0,
		in_state_sel: 0,
		in_scr_scr: 0,
		in_scr_scr2: 0,
		in_scr_scr3: 0,
		in_scr_descr: 0,
		in_scr_sel: -1,
		in_scr_sel2: -1,

		in_ex_sel: 0,
		in_ex_class: 0,
		in_ex_id: 0,
		in_ex_allowstore: 0,
		in_ex_only: '',

		in_dnd: 0,
		in_dnd_pivotx: 0,
		in_dnd_pivoty: 0,
		in_dnd_src: 0,
		in_dnd_typ: 0,
		in_dnd_x: 0,
		in_dnd_y: 0,
		in_dnd_show: 0,

		in_accelerate: 0,

		in_getkey: -1,
		in_keys: ints(20),
		in_keyname: strs(262),
		in_keyhit: ints(41),
		in_keydown: ints(41),
		in_keyrelease: ints(41),

		in_col: ints(2),
		in_scol: ints(2),

		in_edbrush: 0,
		in_edtool: 0,
		in_edgrassmode: 0,
		in_edzoom: 1,
		in_edmap: '',
		in_edrandrot: 0,
		in_edrot: 0,
		in_edtertool: 0,
		in_edbrushangle: 0,
		in_edoverinfo: '',
		in_edterbtool: 0,
		in_edselgroup: 0,

		in_fraph: 0,
		in_frapdown: 0,

		in_tb_scrx: 0,
		in_tb_scry: 0,
		in_tb_row: 0,
		in_tb_col: 0,
		in_input_scr: 0,
		in_input_col: 0,

		in_mark: 0,
		in_ms_col: 0,
		in_ms_row: 0,
		in_me_col: 0,
		in_me_row: 0,

		in_editor_sidebar: 0,

		in_console: 0,
		in_conin: '',
		in_conlastloadmsg: '',
		in_conscroll: 0,

		in_mxsmooth: 0,
		in_mysmooth: 0,

		in_win_color: ints(2),
		in_win_path: '',
		in_win_file: '',
		in_win_map: '',

		in_sh: 0,
		in_sh_x: 0,
		in_sh_y: 0,
		in_sh_txt: '',
		in_sh_cmd: '',
		in_sh_update: 0,

		in_sticktoslide: 0,
		in_sticktoslidex: 0,
		in_sticktoslidey: 0,

		in_blockclose: 0,
		in_jumprehit: 0,

		in_statefxf: 0,
		in_statefxt: 0,

		// ---- Blitz type lists
		Tfile: [] as Tfile[],
		Ttbt: [] as Ttbt[],
		Tbmpf_img: [] as Tbmpf_img[]
	};
}

export type InputState = ReturnType<typeof initialState>;

export const S: InputState = initialState();

/** Back to program-start values (tests, restart). */
export function resetState(): void {
	Object.assign(S, initialState());
}
