/**
 * Port of includes/input.bb: per-frame input sampling (getinput), the
 * end-of-frame overlay (endinput: tooltip, script helper, drag and drop
 * icon, mouse cursor), inputhit and flushinput.
 */
import { Cls, ClsColor, Color, DrawImage, Rect, bbInt } from '../gfx2d';
import { Cbmpf_tiny, Cicon_x } from '../ui/consts';
import { bmpf_len, bmpf_txt } from '../ui/bmpf';
import { M } from '../ui/gfx';
import { host } from '../ui/host';
import { Not as not, f32, fmod } from '../blitz';
import {
	FlushKeys,
	FlushMouse,
	GetKey,
	KeyDown,
	KeyHit,
	MilliSecs,
	MouseDown,
	MouseHit,
	MouseX,
	MouseXSpeed,
	MouseY,
	MouseYSpeed,
	MouseZSpeed,
	MoveMouse
} from './index';
import {
	Ckey_jump,
	Cmenu_ed_scripts,
	Cmenu_if_exchange,
	Cmenu_if_items,
	Csection_editor,
	Csection_game_mp,
	Csection_game_sp,
	S
} from './state';



/** Read one key/button binding (key code as stored in controls.cfg: 0..255 scancode, 256..262 mouse). */
function sampleBinding(code: number, slot: number): void {
	if (code < 255) {
		S.in_keyhit[slot] = KeyHit(code);
		const downcache = KeyDown(code);
		if (S.in_keydown[slot] === 1 && downcache === 0) S.in_keyrelease[slot] = 1;
		else S.in_keyrelease[slot] = 0;
		S.in_keydown[slot] = downcache;
	} else {
		switch (code) {
			case 256:
			case 257:
			case 258:
			case 259:
			case 260: {
				const b = code - 255;
				S.in_keyhit[slot] = S.in_mhit[b];
				S.in_keydown[slot] = S.in_mdown[b];
				S.in_keyrelease[slot] = S.in_mrelease[b];
				break;
			}
			case 261:
				S.in_keyhit[slot] = 0;
				if (S.in_mzs > 0) S.in_keyhit[slot] = 1;
				break;
			case 262:
				S.in_keyhit[slot] = 0;
				if (S.in_mzs < 0) S.in_keyhit[slot] = 1;
				break;
		}
	}
}

/** Function getinput(gametimer=1) */
export function getinput(gametimer = 1): void {
	// Millisecs
	S.lastms = S.ms;
	S.ms = MilliSecs();
	const ms = S.ms;

	// Mouse
	for (let i = 1; i <= 5; i++) {
		S.in_mhit[i] = MouseHit(i);
		const downcache = MouseDown(i);
		if (S.in_mdown[i] === 1 && downcache === 0) {
			S.in_mrelease[i] = 1;
			// Mouse Release 1
			if (i === 1) host.if_drop();
		} else {
			S.in_mrelease[i] = 0;
		}
		S.in_mdown[i] = downcache;
	}
	S.in_mxo = S.in_mx;
	S.in_myo = S.in_my;
	S.in_mx = MouseX();
	S.in_my = MouseY();
	if (S.in_mxo === S.in_mx && S.in_myo === S.in_my) {
		if (S.in_mpt === -1) S.in_mpt = ms;
	} else {
		S.in_mpt = -1;
	}
	S.in_mxs = -MouseXSpeed();
	S.in_mys = MouseYSpeed();
	S.in_mzs = MouseZSpeed();

	// FRAP (Editor only!)
	if (S.m_section === Csection_editor) {
		if (S.in_opt[0] >= 1 && S.in_opt[0] <= 4) {
			if (S.in_fraph !== 0) {
				if (S.in_mdown[1] === 0) {
					S.in_frapdown = 0;
					if (S.in_mrelease[1]) MoveMouse(S.in_mxo, S.in_myo);
				} else {
					if (S.in_frapdown !== 0) {
						MoveMouse(Math.trunc(S.set_scrx / 2), Math.trunc(S.set_scry / 2));
						S.in_mx = S.in_mxo;
						S.in_my = S.in_myo;
					}
				}
			}
		}
	}

	// Mark
	if (S.in_mhit[1]) S.in_mark = 0;

	// Keys
	if (S.m_section === Csection_game_sp || S.m_section === Csection_game_mp) {
		for (let i = 0; i <= 20; i++) {
			sampleBinding(S.in_keys[i], i);
			// Script Keys
			if (S.game_scriptkeys > 0) sampleBinding(S.game_scriptkey[i], i + 21);
		}
	}

	// Jump Rehit
	if (S.in_keyhit[Ckey_jump]) {
		if (S.m_menu === 0) S.in_jumprehit = 1;
		else S.in_jumprehit = 0;
	}

	// Escape
	S.in_escape = KeyHit(1);

	// Picking
	S.in_pe = 0;

	// Focus
	if (S.in_mdown[1]) {
		S.in_inputfocus = -1;
	} else if (S.in_mrelease[1]) {
		S.in_slidefocus = -1;
		if (S.in_sticktoslide === 1) {
			S.in_sticktoslide = 0;
			S.in_mrelease[1] = 0;
			MoveMouse(S.in_sticktoslidex, S.in_sticktoslidey);
			S.in_mx = S.in_sticktoslidex;
			S.in_my = S.in_sticktoslidey;
		}
	}
	if (S.in_mhit[1]) {
		if (S.in_sticktoslide === 1) {
			S.in_sticktoslide = 0;
			S.in_mrelease[1] = 0;
			MoveMouse(S.in_sticktoslidex, S.in_sticktoslidey);
			S.in_mx = S.in_sticktoslidex;
			S.in_my = S.in_sticktoslidey;
		}
	}
	if (S.in_sticktoslide === 1) S.in_mx = -500;

	// Free Tool Tip Text
	S.in_ttt = '';

	// Key
	S.in_key = GetKey();

	// Cursor
	S.in_cursorf = 0;
	if (ms - S.in_cursorms > 200) {
		S.in_cursorms = ms;
		S.in_cursor = not(S.in_cursor);
	}

	// Color Angle
	S.in_ca = fmod(f32(S.in_ca + f32(5 * S.f)), 360);

	// Water Angle
	S.in_wa = fmod(f32(S.in_wa + f32(3 * S.f)), 360);

	// Timers
	S.in_t50go = 0;
	if (ms - S.in_t50 >= 50) {
		S.in_t50 = ms;
		S.in_t50go = 1;
	}
	S.in_t100go = 0;
	if (ms - S.in_t100 >= 100) {
		S.in_t100 = ms;
		S.in_t100go = 1;
	}
	S.in_t500go = 0;
	if (ms - S.in_t500 >= 500) {
		S.in_t500 = ms;
		S.in_t500go = 1;
	}
	S.in_t1000go = 0;
	S.in_t2000go = 0;
	S.in_t3000go = 0;
	S.in_t5000go = 0;
	S.in_t10000go = 0;
	if (ms - S.in_t1000 >= 1000) {
		S.in_t1000 = ms;
		S.in_t1000go = 1;
		S.in_t2000 = S.in_t2000 + 1;
		if (S.in_t2000 === 2) {
			S.in_t2000 = 0;
			S.in_t2000go = 1;
		}
		S.in_t3000 = S.in_t3000 + 1;
		if (S.in_t3000 === 3) {
			S.in_t3000 = 0;
			S.in_t3000go = 1;
		}
		S.in_t5000 = S.in_t5000 + 1;
		if (S.in_t5000 === 5) {
			S.in_t5000 = 0;
			S.in_t5000go = 1;
		}
		S.in_t10000 = S.in_t10000 + 1;
		if (S.in_t10000 === 10) {
			S.in_t10000 = 0;
			S.in_t10000go = 1;
		}
	}

	// Game Timer
	if (gametimer === 1) {
		if (S.lastms !== 0) S.gt = bbInt(f32(S.gt + f32(S.in_gtmod * (ms - S.lastms))));
	}
	const gt = S.gt;

	// Game Time Timer
	S.in_gt20go = 0;
	if (gt - S.in_gt20 >= 20) {
		S.in_gt20 = gt;
		S.in_gt20go = 1;
	}
	S.in_gt50go = 0;
	if (gt - S.in_gt50 >= 50) {
		S.in_gt50 = gt;
		S.in_gt50go = 1;
	}
	S.in_gt100go = 0;
	if (gt - S.in_gt100 >= 100) {
		S.in_gt100 = gt;
		S.in_gt100go = 1;
	}
	S.in_gt500go = 0;
	if (gt - S.in_gt500 >= 500) {
		S.in_gt500 = gt;
		S.in_gt500go = 1;
	}
	S.in_gt1000go = 0;
	if (gt - S.in_gt1000 >= 1000) {
		S.in_gt1000 = gt;
		S.in_gt1000go = 1;
	}
	S.in_gt5000go = 0;
	if (gt - S.in_gt5000 >= 5000) {
		S.in_gt5000 = gt;
		S.in_gt5000go = 1;
	}

	// Statefx
	if (ms - S.in_statefxt > 100) {
		S.in_statefxt = ms;
		S.in_statefxf = S.in_statefxf + 1;
		if (S.in_statefxf >= 9) S.in_statefxf = 1;
	}
}

/**
 * load_fps.bb calcfpsfactor() without its frame limiter (the browser paces
 * frames): f# = frame time * in_gtmod / 20, then in_gtmod is reset to 1.
 */
export function calcfpsfactor(): void {
	const looptime = MilliSecs() - S.ms;
	S.f = f32(f32(looptime * S.in_gtmod) / 20.0);
	S.in_gtmod = 1;
}

/** Function endinput(tooltip=1,cursor=1,scripthelper=1) */
export function endinput(tooltip = 1, cursor = 1, scripthelper = 1): void {
	const ms = S.ms;

	// Blackframe
	if (S.blackframe > 0) {
		S.blackframe = S.blackframe - 1;
		ClsColor(0, 0, 0);
		Cls();
	}

	// Tool Tip
	if (tooltip === 1) {
		if (S.in_mpt > -1) {
			if (ms - S.in_mpt > 500) {
				if (S.in_ttt !== '') {
					Color(0, 0, 0);
					Rect(S.in_ttx, S.in_tty, bmpf_len(S.in_ttt, Cbmpf_tiny) + 2, 18, 1);
					bmpf_txt(S.in_ttx + 1, S.in_tty, S.in_ttt, Cbmpf_tiny);
				}
			}
		}
	}

	// Script Helper
	if (scripthelper === 1) {
		if (S.m_section === Csection_editor) {
			if (S.m_menu === Cmenu_ed_scripts) {
				if (S.in_sh === 1) {
					Color(100, 60, 10);
					Rect(S.in_sh_x, S.in_sh_y, bmpf_len(S.in_sh_txt, Cbmpf_tiny) + 4, 18, 1);
					bmpf_txt(S.in_sh_x + 3, S.in_sh_y, S.in_sh_txt, Cbmpf_tiny);
				}
			}
		}
	}

	// Drag and Drop
	if (S.in_dnd === 1) {
		if (S.m_menu === Cmenu_if_items || S.m_menu === Cmenu_if_exchange) {
			const icon = host.Ditem_iconh(S.in_dnd_typ);
			if (icon !== 0) {
				if (S.in_dnd_show === 1) {
					DrawImage(icon, S.in_mx - S.in_dnd_pivotx - 1, S.in_my - S.in_dnd_pivoty - 1);
					// Drop (Inventory only)
					if (S.in_mx < 215 || S.in_mx > 795 || S.in_my > 595) {
						if (S.in_dnd_src === 0) DrawImage(M.gfx_icons, S.in_mx + 6, S.in_my - 10, Cicon_x);
					}
				} else {
					if (Math.abs(S.in_dnd_x - S.in_mx) > 2 || Math.abs(S.in_dnd_y - S.in_my) > 2) S.in_dnd_show = 1;
				}
			}
		} else {
			S.in_dnd = 0;
		}
	}

	// Cursor
	if (cursor) {
		if (S.in_cursorf >= 0) DrawImage(M.gfx_cursor[S.in_cursorf], S.in_mx, S.in_my);
	}

	// Debug Outputs (FPS etc.)
	host.debug();

	// FPS
	if (ms - S.fpsms > 999) {
		S.fps = S.fpsf;
		S.fpsf = 0;
		S.fpsms = ms;
	}
	S.fpsf = S.fpsf + 1;

	// FPS Factor
	(host.calcfpsfactor ?? calcfpsfactor)();
}

/** Function inputhit(key): was `key` (scancode or mouse code) hit this frame? */
export function inputhit(key: number): number {
	// Hit?
	if (KeyHit(key)) return 1;
	// Settings Keys / Script Keys
	for (let i = 0; i <= 20; i++) {
		if (S.in_keys[i] === key) {
			if (S.in_keyhit[i] === 1) return 1;
		}
		if (S.game_scriptkeys > 0) {
			if (S.game_scriptkey[i] === key) {
				if (S.in_keyhit[i + 21]) return 1;
			}
		}
	}
	// Others
	switch (key) {
		// Escape
		case 1:
			return S.in_escape;
	}
	// Not Hit
	return 0;
}

/** Function flushinput(keys=1,mouse=1) */
export function flushinput(keys = 1, mouse = 1): void {
	// Key
	if (keys === 1) {
		FlushKeys();
		for (let i = 0; i <= 20; i++) {
			S.in_keyhit[i] = 0;
			S.in_keyhit[i + 21] = 0;
			S.in_keydown[i] = 0;
			S.in_keyrelease[i] = 0;
			S.in_keydown[i + 21] = 0;
			S.in_keyrelease[i + 21] = 0;
		}
		S.in_escape = 0;
	}
	// Mouse
	if (mouse === 1) {
		FlushMouse();
		for (let i = 1; i <= 5; i++) {
			S.in_mhit[i] = 0;
			S.in_mdown[i] = 0;
			S.in_mrelease[i] = 0;
		}
	}
}
