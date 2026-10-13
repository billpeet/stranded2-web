/**
 * Port of includes/gui.bb: the immediate-mode widgets and the modal windows.
 *
 * Widgets draw themselves and report interaction in the same call, reading
 * the per-frame input state (S.in_mx, S.in_mrelease, ...) that getinput()
 * sampled. Layout numbers, draw order and quirks are the original's.
 *
 * The original's modal windows are blocking loops ("Repeat ... Flip ...
 * Forever"). A browser cannot block, so those functions are `async` and
 * await the next display frame after every Flip; everything else about them
 * is unchanged.
 */
import {
	BackBuffer,
	Cls,
	ClsColor,
	Color,
	CreateImage,
	DrawBlock,
	DrawBlockRect,
	DrawImage,
	DrawImageRect,
	Flip,
	FreeImage,
	FrontBuffer,
	GrabImage,
	ImageBuffer,
	ImageHeight,
	ImageWidth,
	LockBuffer,
	MidHandle,
	ReadPixel,
	Rect,
	SetBuffer,
	TileBlock,
	UnlockBuffer,
	WritePixelFast,
	bbInt,
	type ImageHandle
} from '../gfx2d';
import { FlushKeys, FlushMouse, GetKey, GetMouse, KeyDown, KeyHit, MoveMouse } from '../input';
import { endinput, flushinput, getinput, inputhit } from '../input/input';
import { Cclass_info, Cclass_item, Cclass_object, Cclass_state, Cclass_unit, S, type Tfile } from '../input/state';
import { Asc, Chr, Instr, IntS, LSet, Left, Len, Lower, Mid, Replace, Right, Upper, idiv, imod, ntrim } from './bb';
import { Sin, f32 } from '../blitz';
import {
	bmpf_framesy,
	bmpf_len,
	bmpf_txt,
	bmpf_txt_c,
	bmpf_txt_ml,
	bmpf_txt_r,
	bmpf_txt_rect
} from './bmpf';
import {
	Cbmpf_dark,
	Cbmpf_red,
	Cbmpf_tiny,
	Cbmpf_yellow,
	Cicon_colormap,
	Cicon_dir,
	Cicon_down,
	Cicon_file,
	Cicon_imagefile,
	Cicon_left,
	Cicon_moon,
	Cicon_ok,
	Cicon_parentdir,
	Cicon_right,
	Cicon_s2script,
	Cicon_soundfile,
	Cicon_stranded,
	Cicon_sun,
	Cicon_up,
	Cicon_update,
	Cicon_x,
	UMLAUTS
} from './consts';
import { M } from './gfx';
import { gui_tb_insert } from './gui_tb';
import { host } from './host';
import { load_image_async } from './media';
import { se, sm } from './strings';


const play = (sound: string): void => host.play(sound);

/** `Flip` inside a modal loop: show the frame, then let the browser run until the next one. */
async function FlipWait(): Promise<void> {
	Flip();
	await host.frame();
}

/** Mouse inside x..x+w, y..y+h (all four edges inclusive, as every widget tests it). */
function mouseover(x: number, y: number, w: number, h: number): boolean {
	return S.in_mx >= x && S.in_my >= y && S.in_mx <= x + w && S.in_my <= y + h;
}

// ############################################ FUNCTIONS

/** ### Tooltip: Function gui_tt(x,y,txt$) */
export function gui_tt(x: number, y: number, txt: string): void {
	if (x + 20 < S.set_scrx - bmpf_len(txt, 5)) S.in_ttx = x + 20;
	else S.in_ttx = x - 5 - bmpf_len(txt, 5);
	if (y + 25 < S.set_scry) S.in_tty = y + 5;
	else S.in_tty = y - 15;
	S.in_ttt = txt;
}

/** ### Button: Function gui_button(x,y,txt$,active=1,icon=-1). 190x45. Returns 1 on click. */
export function gui_button(x: number, y: number, txt: string, active = 1, icon = -1): number {
	if (active) {
		// Active
		let over = 0;
		if (mouseover(x, y, 190, 45)) over = 1;
		DrawImage(M.gfx_bigbutton[over], x, y);
		// Icon
		if (icon > -1) {
			if (over && S.in_mdown[1]) DrawImage(M.gfx_icons, x + 5 + 1, y + 6 + 1, icon);
			else DrawImage(M.gfx_icons, x + 5, y + 6, icon);
		}
		// Text
		x = x + idiv(190, 2);
		y = y + idiv(45, 2) - idiv(bmpf_framesy[0], 2);
		if (over) bmpf_txt_c(x + S.in_mdown[1], y + S.in_mdown[1], txt, over);
		else bmpf_txt_c(x, y, txt, over);
		// Click
		if (over) {
			if (S.in_mrelease[1]) {
				play('sfx_click');
				flushinput();
				return 1;
			}
		}
		// No Click
		return 0;
	} else {
		// Passive
		DrawImage(M.gfx_bigbutton[0], x, y);
		if (icon > -1) DrawImage(M.gfx_icons_passive, x + 5, y + 6, icon);
		x = x + idiv(190, 2);
		y = y + idiv(45, 2) - idiv(bmpf_framesy[0], 2);
		bmpf_txt_c(x, y, txt, 2);
		return 0;
	}
}

/** ### Icon Button: Function gui_ibutton(x,y,icon,txt$,active=1,forceover=0,hotkey=0). 32x32. */
export function gui_ibutton(x: number, y: number, icon: number, txt: string, active: number | boolean = 1, forceover = 0, hotkey = 0): number {
	let over = 0;
	if (active) {
		// Active
		if (mouseover(x, y, 32, 32)) {
			over = 1;
			// Tool Tip
			if (hotkey > 0) gui_tt(S.in_mx, S.in_my, txt + ' [' + S.in_keyname[hotkey] + ']');
			else gui_tt(S.in_mx, S.in_my, txt);
		}
		if (forceover) DrawImage(M.gfx_iconbutton[1], x, y);
		else DrawImage(M.gfx_iconbutton[over], x, y);
		if (over && S.in_mdown[1]) DrawImage(M.gfx_icons, x + 1, y + 1, icon);
		else DrawImage(M.gfx_icons, x, y, icon);

		// Click
		if (over) {
			if (S.in_mrelease[1]) {
				play('sfx_click');
				flushinput();
				return 1;
			}
		}
		// Hotkey
		if (hotkey > 0) {
			if (inputhit(hotkey)) return 1;
		}
		// No Click
		return 0;
	} else {
		// Passive
		DrawImage(M.gfx_iconbutton[0], x, y);
		DrawImage(M.gfx_icons_passive, x, y, icon);
		return 0;
	}
}

/** ### Icon Button with alternative Icon Image: `icon` is an image handle. */
export function gui_ibuttona(x: number, y: number, icon: ImageHandle, txt: string, active = 1, forceover = 0, hotkey = 0): number {
	let over = 0;
	if (active) {
		// Active
		if (mouseover(x, y, 32, 32)) {
			over = 1;
			// Tool Tip
			if (hotkey > 0) gui_tt(S.in_mx, S.in_my, txt + ' [' + S.in_keyname[hotkey] + ']');
			else gui_tt(S.in_mx, S.in_my, txt);
		}
		if (forceover) DrawImage(M.gfx_iconbutton[1], x, y);
		else DrawImage(M.gfx_iconbutton[over], x, y);
		if (over && S.in_mdown[1]) DrawImage(icon, x + 1, y + 1);
		else DrawImage(icon, x, y);

		// Click
		if (over) {
			if (S.in_mrelease[1]) {
				play('sfx_click');
				flushinput();
				return 1;
			}
		}
		// Hotkey
		if (hotkey > 0) {
			if (inputhit(hotkey)) return 1;
		}
		// No Click
		return 0;
	} else {
		// Passive
		DrawImage(M.gfx_iconbutton[0], x, y);
		DrawImage(icon, x, y);
		return 0;
	}
}

/** ### Checkbox: Function gui_check(x,y,txt$,id,active=1). Toggles S.in_check[id]. */
export function gui_check(x: number, y: number, txt: string, id: number, active = 1): number {
	if (active) {
		// Active
		let over = 0;
		if (mouseover(x, y, 16 + 3 + bmpf_len(txt), 16)) over = 1;
		DrawImage(M.gfx_check[over], x, y);
		if (S.in_check[id]) DrawImage(M.gfx_check[2], x, y);
		x = x + 16 + 3;
		y = y + 8 - idiv(bmpf_framesy[0], 2);
		bmpf_txt(x, y, txt, over);
		// Click
		if (over) {
			if (S.in_mrelease[1]) {
				play('sfx_switch');
				S.in_check[id] = S.in_check[id] ? 0 : 1;
				return 1;
			}
		}
		// No Click
		return 0;
	} else {
		// Passive
		DrawImage(M.gfx_check[0], x, y);
		if (S.in_check[id]) DrawImage(M.gfx_check[2], x, y);
		x = x + 16 + 3;
		y = y + 8 - idiv(bmpf_framesy[0], 2);
		bmpf_txt(x, y, txt, 2);
		return 0;
	}
}

/** ### Options: Function gui_opt(x,y,txt$,id,groupid,active=1). Sets S.in_opt[groupid]=id. */
export function gui_opt(x: number, y: number, txt: string, id: number, groupid: number, active = 1): number {
	if (active) {
		// Active
		let over = 0;
		if (mouseover(x, y, 16 + 3 + bmpf_len(txt), 16)) over = 1;
		DrawImage(M.gfx_opt[over], x, y);
		if (S.in_opt[groupid] === id) DrawImage(M.gfx_opt[2], x, y);
		x = x + 16 + 3;
		y = y + 8 - idiv(bmpf_framesy[0], 2);
		bmpf_txt(x, y, txt, over);
		// Click
		if (over) {
			if (S.in_mrelease[1]) {
				play('sfx_switch');
				S.in_opt[groupid] = id;
				return 1;
			}
		}
		// No Click
		return 0;
	} else {
		// Passive
		DrawImage(M.gfx_opt[0], x, y);
		if (S.in_opt[groupid] === id) DrawImage(M.gfx_opt[2], x, y);
		x = x + 16 + 3;
		y = y + 8 - idiv(bmpf_framesy[0], 2);
		bmpf_txt(x, y, txt, 2);
		return 0;
	}
}

/** ### Text Button: Function gui_txtb(x,y,txt$,active=1,col=-1,tooltip$="") */
export function gui_txtb(x: number, y: number, txt: string, active = 1, col = -1, tooltip = ''): number {
	if (active) {
		// Active
		let over = 0;
		if (mouseover(x, y, bmpf_len(txt), 16)) {
			over = 1;
			if (tooltip !== '') gui_tt(S.in_mx, S.in_my, tooltip);
		}
		if (col === -1) bmpf_txt(x, y, txt, over);
		else bmpf_txt(x, y, txt, col);
		// Click
		if (over) {
			if (S.in_mrelease[1]) {
				play('sfx_click');
				flushinput();
				return 1;
			}
		}
		// No Click
		return 0;
	} else {
		// Passive
		bmpf_txt(x, y, txt, 2);
		return 0;
	}
}

/**
 * ### Slider: Function gui_slider(x,y,steps,id,active=1). 100 pixels wide;
 * the value S.in_slider[id] runs 0..steps. `100/steps` is an integer
 * division in the original (so steps>100 divides by zero there, too).
 */
export function gui_slider(x: number, y: number, steps: number, id: number, active = 1): void {
	const stepw = idiv(100, steps);
	if (steps < 31) {
		for (let i = 0; i <= steps; i++) DrawImage(M.gfx_slider[3], x + i * stepw, y + 8);
	}
	if (active) {
		// Active
		let over = 0;
		if (mouseover(x - 10, y, 100 + 20, 16)) over = 1;
		// Click / Down
		if (S.in_slidefocus === id || (over === 1 && S.in_mdown[1])) {
			if (S.in_mhit[1] || S.in_mdown[1]) {
				over = 1;
				S.in_slidefocus = id;
				S.in_slider[id] = idiv(S.in_mx - x, stepw);
				if (S.in_slider[id] < 0) S.in_slider[id] = 0;
				else if (S.in_slider[id] > steps) S.in_slider[id] = steps;
			}
		}
		if (S.in_slidefocus !== id) over = 0;
		DrawImage(M.gfx_slider[over], x, y);
		DrawImage(M.gfx_slider[2], x + S.in_slider[id] * stepw, y + 8);
	} else {
		// Passive
		DrawImage(M.gfx_slider[0], x, y);
	}
}

/**
 * ### Input: Function gui_input(x,y,w,id,active=1,tt$=""). One-line text
 * field editing S.in_input[id]; click to focus. Typing appends, Backspace
 * removes the last character, Delete (and Ctrl+D, which is the same
 * character code 4) clears the field. Ctrl+X/C/V cut, copy, paste.
 */
export function gui_input(x: number, y: number, w: number, id: number, active = 1, tt = ''): void {
	let over = 0;
	if (active) {
		// Active
		if (mouseover(x, y, w, 22)) {
			over = 1;
			S.in_cursorf = 5;
			// Tool Tip
			if (tt !== '') gui_tt(S.in_mx, S.in_my, tt);
		}
		// Click / Down
		if (over) {
			if (S.in_mrelease[1]) S.in_inputfocus = id;
		}
		// Input
		if (S.in_inputfocus === id) {
			const key = S.in_key;
			// Add
			if ((key > 31 && key < 127) || Instr(UMLAUTS, Chr(key)) > 0) {
				const pre = S.in_input[id];
				S.in_input[id] = S.in_input[id] + Chr(key);
				if (bmpf_len(S.in_input[id], 0) > w - 3) S.in_input[id] = pre;
			} else if (key === 4) {
				// DEL
				S.in_input[id] = '';
			} else if (key === 8) {
				// BS
				if (Len(S.in_input[id]) > 0) S.in_input[id] = LSet(S.in_input[id], Len(S.in_input[id]) - 1);
			}
			// Ctrl
			if (KeyDown(29) || KeyDown(157)) {
				// Cut
				if (KeyHit(45)) {
					host.copy(S.in_input[id]);
					S.in_input[id] = '';
				}
				// Copy
				if (KeyHit(46)) host.copy(S.in_input[id]);
				// Paste
				if (KeyHit(47)) S.in_input[id] = host.paste();
			}
		}
	}
	// Draw
	let ds = 0; // Drawstep
	for (let dw = x; dw <= x + w; dw += 8) {
		switch (ds) {
			// 0 - Left
			case 0:
				DrawImage(M.gfx_input[0 + over], dw, y);
				ds = 1;
				break;
			// 1 - Middle
			case 1:
				DrawImage(M.gfx_input[2 + over], dw, y);
				if (x + w - dw <= 8) ds = 2;
				break;
			// 2 - Right
			case 2:
				DrawImage(M.gfx_input[4 + over], dw, y);
				break;
		}
	}
	if (active) {
		if (S.in_inputfocus === id) {
			if (S.in_cursor) bmpf_txt(x + 3, y + 1, S.in_input[id] + '|', 1);
			else bmpf_txt(x + 3, y + 1, S.in_input[id], 1);
		} else {
			bmpf_txt(x + 3, y + 1, S.in_input[id], 0);
		}
	} else {
		bmpf_txt(x + 3, y + 1, S.in_input[id], 2);
	}
}

/**
 * ### Colorbox: Function gui_colorbox(r,g,b,x,y,w,h,txt$=""). Bevelled
 * colour swatch. Returns 1 for a left click, 2 for a right click.
 */
export function gui_colorbox(r: number, g: number, b: number, x: number, y: number, w: number, h: number, txt = ''): number {
	const dif1 = 80;
	const dif2 = 180;
	// Mainrect
	Color(r, g, b);
	Rect(x + 1, y + 1, w - 2, h - 2, 1);
	// Highlight
	let r2 = r + dif1;
	if (r2 > 255) r2 = 255;
	let g2 = g + dif1;
	if (g2 > 255) g2 = 255;
	let b2 = b + dif1;
	if (b2 > 255) b2 = 255;
	Color(r2, g2, b2);
	Rect(x, y, w, 1, 1);
	Rect(x, y, 1, h, 1);
	// Shadow
	r2 = r - dif2;
	if (r2 < 0) r2 = 0;
	g2 = g - dif2;
	if (g2 < 0) g2 = 0;
	b2 = b - dif2;
	if (b2 < 0) b2 = 0;
	Color(r2, g2, b2);
	Rect(x, y + h - 1, w, 1, 1);
	Rect(x + w - 1, y, 1, h, 1);
	// Click
	if (mouseover(x, y, w, h)) {
		// Tool Tip
		gui_tt(S.in_mx, S.in_my, txt);
		// Click
		if (S.in_mrelease[1]) {
			play('sfx_switch');
			flushinput();
			return 1;
		} else if (S.in_mrelease[2]) {
			play('sfx_switch');
			flushinput();
			return 2;
		}
	}
	return 0;
}

/** Color 0,Abs(255.*Sin(in_ca#)),0 : Rect x,y,40,40,0 */
function selframe(x: number, y: number): void {
	Color(0, bbInt(Math.abs(f32(255 * Sin(S.in_ca)))), 0);
	Rect(x, y, 40, 40, 0);
}

/**
 * ### Iconbox: Function gui_iconbox(x,y,img,txt$,sel). 40x40 item slot with
 * a pulsing green frame when selected. Returns 1 (left) or 2 (right click).
 */
export function gui_iconbox(x: number, y: number, img: ImageHandle, txt: string, sel: number | boolean): number {
	// Over
	let over = 0;
	if (mouseover(x, y, 40, 40)) {
		over = 1;
		// Tool Tip
		gui_tt(S.in_mx, S.in_my, txt);
	}
	// Draw
	if (over) {
		if (S.in_mdown[1] || S.in_mdown[2]) {
			if (img !== 0) DrawImageRect(img, x + 1, y + 1, 0, 0, 39, 39);
			if (sel) selframe(x, y);
		} else {
			if (img !== 0) DrawImage(img, x, y);
			if (sel) selframe(x, y);
		}
	} else {
		if (img !== 0) DrawImage(img, x, y);
		if (sel) selframe(x, y);
	}
	// Click / Down
	if (over) {
		if (S.in_mrelease[1]) {
			play('sfx_switch');
			flushinput();
			return 1;
		} else if (S.in_mrelease[2]) {
			play('sfx_switch');
			flushinput();
			return 2;
		}
	}
	// None
	return 0;
}

/** ### Iconbox Count: Function gui_iconboxc(x,y,c,showeveryc=0,forcered=0) */
export function gui_iconboxc(x: number, y: number, c: number, showeveryc = 0, forcered = 0): void {
	if (forcered === 0) {
		// Show only >1
		if (showeveryc === 0) {
			if (c > 1) bmpf_txt(x + 2, y + 25, c, Cbmpf_tiny);
		} else {
			// Show Every Count, 0 = Red
			if (c === 0) bmpf_txt(x + 2, y + 23, c, Cbmpf_red);
			else bmpf_txt(x + 2, y + 25, c, Cbmpf_tiny);
		}
	} else {
		// Red
		bmpf_txt(x + 2, y + 23, c, Cbmpf_red);
	}
}

/** ### Iconbox Quickslot: Function gui_iconboxqs(x,y,s) */
export function gui_iconboxqs(x: number, y: number, s: number): void {
	if (s > 0) bmpf_txt(x + 2, y, s, 0);
}

/**
 * ### Healthbar: Function gui_healthbar#(x,y,current#,max#,blink=1,image=0).
 * 100x5 bar on its 102x7 background; blinks (frame = in_cursor) at 30% or
 * less. While the left button is held over it, returns the value under the
 * mouse (0..max), otherwise -1.
 */
export function gui_healthbar(x: number, y: number, current: number, max: number, blink = 1, image: ImageHandle = 0): number {
	// Image
	if (image === 0) image = M.gfx_bars;
	// Draw
	const perc = bbInt(f32(f32(f32(current) / f32(max)) * 100));
	DrawBlock(M.gfx_if_barback, x, y);
	if (blink === 1) {
		if (perc <= 30) DrawBlockRect(image, x + 1, y + 1, 0, 0, perc, 5, S.in_cursor);
		else DrawBlockRect(image, x + 1, y + 1, 0, 0, perc, 5);
	} else {
		DrawBlockRect(image, x + 1, y + 1, 0, 0, perc, 5);
	}
	// Action
	if (mouseover(x - 10, y, 120, 5)) {
		// Tool Tip
		gui_tt(S.in_mx, S.in_my, sm(6));
		// Down
		if (S.in_mdown[1]) {
			x = S.in_mx - x;
			if (x < 0) x = 0;
			if (x > 100) x = 100;
			return f32(f32(max) * f32(x / 100));
		}
	}
	return -1;
}

/**
 * ### Classselbox: Function gui_classselbox(x,y,class,in). Shows the
 * object/unit/item/state whose type number is in S.in_input[in]; clicking
 * replaces it with the type currently selected in the editor.
 * `in_input$(in)=0` compares strings in Blitz, i.e. tests for the text "0".
 */
export function gui_classselbox(x: number, y: number, cls: number, inp: number): number {
	// Over
	let over = 0;
	if (mouseover(x, y, 40, 40)) {
		over = 1;
		// Tool Tip
		gui_tt(S.in_mx, S.in_my, sm(7));
	}
	// Class
	let img: ImageHandle = 0;
	switch (cls) {
		case Cclass_object:
			S.in_opt[0] = 1;
			if (S.in_input[inp] === '0') S.in_input[inp] = String(S.in_object_sel);
			img = host.Dobject_iconh(IntS(S.in_input[inp]));
			break;
		case Cclass_unit:
			S.in_opt[0] = 2;
			if (S.in_input[inp] === '0') S.in_input[inp] = String(S.in_unit_sel);
			img = host.Dunit_iconh(IntS(S.in_input[inp]));
			break;
		case Cclass_item:
			S.in_opt[0] = 3;
			if (S.in_input[inp] === '0') S.in_input[inp] = String(S.in_item_sel);
			img = host.Ditem_iconh(IntS(S.in_input[inp]));
			break;
		case Cclass_state:
			S.in_opt[0] = 5;
			if (S.in_input[inp] === '0') S.in_input[inp] = String(S.in_state_sel);
			break;
		default:
			return 0;
	}
	if (S.in_input[inp] === '0') return 0;
	// Draw
	if (img === 0) {
		const frame = host.Dstate_frame(IntS(S.in_input[inp]));
		if (over) {
			if (S.in_mdown[1]) DrawImage(M.gfx_states, x + 11, y + 11, frame);
			else DrawImage(M.gfx_states, x + 10, y + 10, frame);
		} else {
			DrawImage(M.gfx_states, x + 10, y + 10, frame);
		}
	} else {
		if (over) {
			if (S.in_mdown[1]) DrawImageRect(img, x + 1, y + 1, 0, 0, 39, 39);
			else DrawImage(img, x, y);
		} else {
			DrawImage(img, x, y);
		}
	}
	// Click / Down
	if (over) {
		if (S.in_mrelease[1]) {
			play('sfx_switch');
			flushinput();
			switch (cls) {
				case Cclass_object:
					S.in_input[inp] = String(S.in_object_sel);
					break;
				case Cclass_unit:
					S.in_input[inp] = String(S.in_unit_sel);
					break;
				case Cclass_item:
					S.in_input[inp] = String(S.in_item_sel);
					break;
				case Cclass_state:
					S.in_input[inp] = String(S.in_state_sel);
					break;
			}
			return 1;
		}
	}
	// None
	return 0;
}

/**
 * ### Operator: Function gui_operator(x,y,id,active=1). Comparison operator
 * 0..5 kept as text in S.in_input[id]; left click next, right click previous.
 */
export function gui_operator(x: number, y: number, id: number, active = 1): number {
	let txt = '';
	switch (IntS(S.in_input[id])) {
		case 0:
			txt = sm(8);
			break;
		case 1:
			txt = sm(9);
			break;
		case 2:
			txt = sm(10);
			break;
		case 3:
			txt = sm(11);
			break;
		case 4:
			txt = sm(12);
			break;
		case 5:
			txt = sm(13);
			break;
	}
	// Over
	let over = 0;
	if (mouseover(x, y, bmpf_len(txt), 20)) over = 1;
	// Draw
	if (active) {
		bmpf_txt(x, y, txt, over);
	} else {
		bmpf_txt(x, y, txt, Cbmpf_dark);
		return 0;
	}
	// Click
	if (over) {
		if (S.in_mrelease[1]) {
			play('sfx_switch');
			flushinput();
			S.in_input[id] = String(IntS(S.in_input[id]) + 1);
			if (IntS(S.in_input[id]) > 5) S.in_input[id] = '0';
			return 1;
		} else if (S.in_mrelease[2]) {
			play('sfx_switch');
			flushinput();
			S.in_input[id] = String(IntS(S.in_input[id]) - 1);
			if (IntS(S.in_input[id]) < 0) S.in_input[id] = '5';
			return 2;
		}
	}
	// None
	return 0;
}

/** ### Input String: Function gui_inputstr$(txt$,ml=-1). Apply this frame's typing to a string. */
export function gui_inputstr(txt: string, ml = -1): string {
	const key = S.in_key;
	// Add
	if (key > 31 && key < 127) {
		txt = txt + Chr(key);
	} else if (key === 4) {
		// DEL
		txt = '';
	} else if (key === 8) {
		// BS
		if (Len(txt) > 0) txt = LSet(txt, Len(txt) - 1);
	}
	// Ctrl
	if (KeyDown(29) || KeyDown(157)) {
		// Cut
		if (KeyHit(45)) {
			host.copy(txt);
			txt = '';
		}
		// Copy
		if (KeyHit(46)) host.copy(txt);
		// Paste
		if (KeyHit(47)) txt = host.paste();
	}
	// Length Trim
	if (ml > -1) {
		while (bmpf_len(txt, 0) > ml) txt = LSet(txt, Len(txt) - 1);
	}
	// Return
	return txt;
}

/**
 * ### Tiny Text Button: Function gui_ttb(x,y,txt$,forceover=0,tt$="").
 * Returns 1 (left click), 2 (right click, silent) or 0.
 */
export function gui_ttb(x: number, y: number, txt: string, forceover: number | boolean = 0, tt = ''): number {
	const l = bmpf_len(txt, Cbmpf_tiny) + 2;
	// Over
	let over = 0;
	if (mouseover(x, y, l, 18)) {
		over = 1;
		if (tt !== '') gui_tt(S.in_mx, S.in_my, tt);
	}
	if (over || forceover) Color(84, 51, 0);
	else Color(0, 0, 0);
	Rect(x, y, l, 18, 1);
	bmpf_txt(x + 1, y, txt, Cbmpf_tiny);
	// Click
	if (over) {
		if (S.in_mrelease[1]) {
			play('sfx_click');
			flushinput();
			return 1;
		} else if (S.in_mrelease[2]) {
			flushinput();
			return 2;
		}
	}
	return 0;
}

/** load_image(image$,0) for the message screens: unmasked, mid-handled, 0 when no image is asked for. */
async function msgimage(image: string): Promise<ImageHandle> {
	let img: ImageHandle = 0;
	if (image !== '') img = await load_image_async(image, 0);
	if (img !== 0) MidHandle(img);
	return img;
}

/**
 * ### GUI Message: Function gui_msg(txt$,col=0,image$=""). Full-screen
 * message; waits for any character key or mouse button.
 */
export async function gui_msg(txt: string, col = 0, image = ''): Promise<void> {
	const img = await msgimage(image);
	const cx = idiv(S.set_scrx, 2),
		cy = idiv(S.set_scry, 2);
	ClsColor(0, 0, 0);
	Cls();
	if (img !== 0) DrawBlock(img, cx, cy);
	bmpf_txt_c(cx, cy - 10, txt, col);
	bmpf_txt_c(cx, cy + 15, sm(14), Cbmpf_tiny);
	Flip();
	if (S.in_conlastloadmsg !== txt) {
		S.in_conlastloadmsg = txt;
		host.con_add(txt, col);
	}
	flushinput();
	for (;;) {
		const key = GetKey();
		const mouse = GetMouse();
		if (key !== 0 || mouse !== 0) break;
		await host.frame();
	}
	flushinput();
	if (img !== 0) FreeImage(img);
	host.p_rectscreen();
}

/**
 * ### GUI Input: Function gui_msginput$(txt$,col=0,cancel$="",okay$="",image$="",id=9).
 * Returns the entered text, "" on cancel (Escape). Enter accepts.
 */
export async function gui_msginput(txt: string, col = 0, cancel = '', okay = '', image = '', id = 9): Promise<string> {
	S.in_input[id] = '';
	const img = await msgimage(image);
	if (cancel === '') cancel = sm(3);
	if (okay === '') okay = sm(5);
	const cx = idiv(S.set_scrx, 2),
		cy = idiv(S.set_scry, 2);
	flushinput();
	for (;;) {
		getinput(0);
		ClsColor(0, 0, 0);
		Cls();
		if (img !== 0) DrawBlock(img, cx, cy);
		bmpf_txt_c(cx, cy - 45, txt, col);
		gui_input(cx - 128, cy - 22, 256, id);

		// Cancel
		if (gui_ibutton(cx - 32 - 3, cy + 5, Cicon_x, cancel, 1, 0, 1)) {
			flushinput();
			return '';
		}
		// Okay
		if (gui_ibutton(cx + 3, cy + 5, Cicon_ok, okay, 1, 0, 28)) {
			flushinput();
			return S.in_input[id];
		}

		endinput(1, 1, 0);
		host.console();
		await FlipWait();
	}
}

/**
 * ### GUI Decision: Function gui_msgdecide(txt$,col=0,cancel$="",okay$="",image$="").
 * Returns 1 for okay (Enter), 0 for cancel (Escape).
 */
export async function gui_msgdecide(txt: string, col = 0, cancel = '', okay = '', image = ''): Promise<number> {
	const img = await msgimage(image);
	if (cancel === '') cancel = sm(3);
	if (okay === '') okay = sm(5);
	const cx = idiv(S.set_scrx, 2),
		cy = idiv(S.set_scry, 2);
	flushinput();
	for (;;) {
		getinput(0);
		ClsColor(0, 0, 0);
		Cls();
		if (img !== 0) DrawBlock(img, cx, cy);
		bmpf_txt_c(cx, cy - 20, txt, col);

		// Cancel
		if (gui_ibutton(cx - 32 - 3, cy + 5, Cicon_x, cancel, 1, 0, 1)) {
			flushinput();
			return 0;
		}
		// Okay
		if (gui_ibutton(cx + 3, cy + 5, Cicon_ok, okay, 1, 0, 28)) {
			flushinput();
			return 1;
		}

		endinput(1, 1, 0);
		host.console();
		await FlipWait();
	}
}

/** The 300x256 hue/brightness board of the colour window. */
function make_colorboard(): ImageHandle {
	const colorboard = CreateImage(300, 256);
	SetBuffer(ImageBuffer(colorboard));
	LockBuffer(ImageBuffer(colorboard));
	for (let y = 0; y <= 255; y++) {
		let st = 0;
		let r = f32(255),
			g = f32(0),
			b = f32(0);
		for (let x = 0; x <= 299; x++) {
			if (x % 50 === 0) st = st + 1;
			switch (st) {
				case 1:
					g = f32(g + f32(5.1));
					break;
				case 2:
					r = f32(r - f32(5.1));
					break;
				case 3:
					b = f32(b + f32(5.1));
					break;
				case 4:
					g = f32(g - f32(5.1));
					break;
				case 5:
					r = f32(r + f32(5.1));
					break;
				case 6:
					b = f32(b - f32(5.1));
					break;
			}
			let rt = bbInt(f32(r - y)),
				gt = bbInt(f32(g - y)),
				bt = bbInt(f32(b - y));
			if (rt < 0) rt = 0;
			if (gt < 0) gt = 0;
			if (bt < 0) bt = 0;
			// rgb=255*$1000000+rt*$10000+gt*$100+bt (an overflowing channel carries into the next, as in the original)
			const rgb = (255 * 0x1000000 + rt * 0x10000 + gt * 0x100 + bt) | 0;
			WritePixelFast(x, y, rgb);
		}
	}
	UnlockBuffer(ImageBuffer(colorboard));
	SetBuffer(BackBuffer());
	return colorboard;
}

/** in_slider (0..100) from a 0..255 channel: Float(v)/2.55 stored in an Int. */
const toSlider = (v: number): number => bbInt(f32(f32(v) / f32(2.55)));

/**
 * ### Color Window: Function gui_win_color(). Edits S.in_slider[0..2]
 * (0..100 per channel); the result is in S.in_win_color[0..2] (0..255).
 * Returns 1 for okay, 0 for cancel/close/Escape.
 */
export async function gui_win_color(): Promise<number> {
	const temp = CreateImage(S.set_scrx, S.set_scry);
	SetBuffer(FrontBuffer());
	GrabImage(temp, 0, 0);
	// Generate Colorboard
	const colorboard = make_colorboard();
	// Loop
	let quit = 0,
		ret = 0;
	while (quit === 0) {
		getinput(0);
		if (KeyHit(1)) quit = 1;
		DrawBlock(temp, 0, 0);

		// Head
		DrawImage(M.gfx_win, 215, 0);
		if (gui_ibutton(742, 5, Cicon_x, sm(15))) quit = 1;
		DrawImage(M.gfx_icons, 236, 5, Cicon_colormap);
		bmpf_txt(236 + 37, 10, sm(16));
		DrawImage(M.gfx_winbar, 215, 42);

		// Colorboard
		Color(0, 0, 0);
		Rect(236, 63, 302, 258, 0);
		DrawBlock(colorboard, 237, 64);
		if (mouseover(237, 64, 300, 256)) {
			if (S.in_mdown[1]) {
				const rgb = ReadPixel(S.in_mx, S.in_my);
				S.in_slider[0] = toSlider((rgb & 0xff0000) / 0x10000);
				S.in_slider[1] = toSlider((rgb & 0xff00) / 0x100);
				S.in_slider[2] = toSlider(rgb & 0xff);
			}
		}

		// Big Color Matrix
		let x = 0,
			y = 0;
		for (let br = 0; br <= 255; br += 51) {
			for (let bg = 0; bg <= 255; bg += 51) {
				for (let bb = 0; bb <= 255; bb += 51) {
					if (gui_colorbox(br, bg, bb, 543 + x * 21, 63 + y * 13, 16, 8, br + ',' + bg + ',' + bb)) {
						S.in_slider[0] = toSlider(br);
						S.in_slider[1] = toSlider(bg);
						S.in_slider[2] = toSlider(bb);
					}
					x = x + 1;
					if (x >= 11) {
						x = 0;
						y = y + 1;
					}
				}
			}
		}

		// Red
		S.in_win_color[0] = bbInt(f32(S.in_slider[0] * f32(2.55)));
		gui_colorbox(255, 0, 0, 236, 370, 29, 32);
		gui_colorbox(S.in_win_color[0], 0, 0, 236 + 34, 370, 29, 32);
		gui_slider(236 + 64 + 10, 370 + 5, 100, 0);
		bmpf_txt(336 + 64 + 20, 370 + 2, S.in_win_color[0]);
		// Green
		S.in_win_color[1] = bbInt(f32(S.in_slider[1] * f32(2.55)));
		gui_colorbox(0, 255, 0, 236, 370 + 37, 29, 32);
		gui_colorbox(0, S.in_win_color[1], 0, 236 + 34, 370 + 37, 29, 32);
		gui_slider(236 + 64 + 10, 370 + 5 + 37, 100, 1);
		bmpf_txt(336 + 64 + 20, 370 + 2 + 37, S.in_win_color[1]);
		// Blue
		S.in_win_color[2] = bbInt(f32(S.in_slider[2] * f32(2.55)));
		gui_colorbox(0, 0, 255, 236, 370 + 37 + 37, 29, 32);
		gui_colorbox(0, 0, S.in_win_color[2], 236 + 34, 370 + 37 + 37, 29, 32);
		gui_slider(236 + 64 + 10, 370 + 5 + 37 + 37, 100, 2);
		bmpf_txt(336 + 64 + 20, 370 + 2 + 37 + 37, S.in_win_color[2]);
		// Mixed
		gui_colorbox(S.in_win_color[0], S.in_win_color[1], S.in_win_color[2], 236, 328, 537, 30);

		// Aufhellen
		if (gui_ibutton(236, 542, Cicon_sun, sm(17))) {
			for (let i = 0; i <= 2; i++) {
				S.in_slider[i] = S.in_slider[i] + 5;
				if (S.in_slider[i] > 100) S.in_slider[i] = 100;
			}
		}
		// Abdunkeln
		if (gui_ibutton(236 + 37, 542, Cicon_moon, sm(18))) {
			for (let i = 0; i <= 2; i++) {
				S.in_slider[i] = S.in_slider[i] - 5;
				if (S.in_slider[i] < 0) S.in_slider[i] = 0;
			}
		}
		// Umkehren
		if (gui_ibutton(236 + 37 + 37, 542, Cicon_update, sm(19))) {
			for (let i = 0; i <= 2; i++) S.in_slider[i] = 100 - S.in_slider[i];
		}

		// Small Color Matrix
		x = 0;
		y = 0;
		for (let r = 0; r <= 255; r += 255) {
			for (let g = 0; g <= 255; g += 255) {
				for (let b = 0; b <= 255; b += 255) {
					if (gui_colorbox(r, g, b, 543 + x * 29, 370 + y * 37, 24, 32, r + ',' + g + ',' + b)) {
						S.in_slider[0] = toSlider(r);
						S.in_slider[1] = toSlider(g);
						S.in_slider[2] = toSlider(b);
					}
					x = x + 1;
					if (x >= 8) {
						x = 0;
						y = y + 1;
					}
				}
			}
		}
		x = 0;
		y = 0;
		for (let r = 0; r <= 128; r += 128) {
			for (let g = 0; g <= 128; g += 128) {
				for (let b = 0; b <= 128; b += 128) {
					if (gui_colorbox(r, g, b, 543 + x * 29, 370 + 37 + y * 37, 24, 32, r + ',' + g + ',' + b)) {
						S.in_slider[0] = toSlider(r);
						S.in_slider[1] = toSlider(g);
						S.in_slider[2] = toSlider(b);
					}
					x = x + 1;
					if (x >= 8) {
						x = 0;
						y = y + 1;
					}
				}
			}
		}

		// Cancel
		if (gui_ibutton(742 - 37, 542, Cicon_x, sm(3))) quit = 1;
		// Ok
		if (gui_ibutton(742, 542, Cicon_ok, sm(5))) {
			quit = 1;
			ret = 1;
		}

		endinput(1, 1, 0);
		host.console();
		await FlipWait();
	}
	// End
	FreeImage(temp);
	FreeImage(colorboard);
	// Return
	flushinput();
	return ret;
}

/**
 * ### File Window: Function gui_win_file(info$="",startdir$="",startfile$="",lockeddir=0,save=0).
 * Result in S.in_win_path / S.in_win_file; returns 1 when a file was chosen.
 * Files are listed three columns of 21; a second click on the selected file
 * accepts it.
 */
export async function gui_win_file(info = '', startdir = '', startfile = '', lockeddir = 0, save = 0): Promise<number> {
	const temp = CreateImage(S.set_scrx, S.set_scry);
	SetBuffer(FrontBuffer());
	GrabImage(temp, 0, 0);
	SetBuffer(BackBuffer());
	gui_win_file_listdir(startdir);
	// (sic) the start file is only preselected when it names a directory
	if (host.fileType(S.in_win_path + startfile) === 2) S.in_win_file = startfile;
	else S.in_win_file = '';
	// Loop
	let quit = 0,
		ret = 0;
	while (quit === 0) {
		getinput(0);
		if (KeyHit(1)) quit = 1;
		DrawBlock(temp, 0, 0);

		// Head
		DrawImage(M.gfx_win, 215, 0);
		if (gui_ibutton(742, 5, Cicon_x, sm(15))) quit = 1;
		DrawImage(M.gfx_icons, 236, 5, Cicon_dir);
		bmpf_txt(236 + 37, 10, info);
		DrawImage(M.gfx_winbar, 215, 42);

		// Path
		if (S.in_win_path !== '') {
			bmpf_txt_ml(236, 63, sm(20) + ': ' + S.in_win_path, 0, 236 + 537 - 37);
			if (gui_ibutton(742, 63, Cicon_parentdir, sm(21), 1 - lockeddir)) {
				gui_win_file_parentdir();
				S.in_win_file = '';
			}
		} else {
			bmpf_txt(236, 63, sm(22) + ':');
			gui_ibutton(742, 63, Cicon_parentdir, sm(21), 0);
		}

		// Black Rect
		Color(0, 0, 0);
		Rect(236, 100, 537, 435, 1);

		// List Files
		let x = 0,
			y = 0,
			j = 0;
		for (const file of [...S.Tfile]) {
			j = j + 1;
			if (j > S.in_scr_scr) {
				// Click / Over
				let over = 0;
				if (mouseover(236 + x * 165, 100 + y * 20, 165, 19)) {
					over = 1;
					// Tooltip
					gui_tt(S.in_mx, S.in_my, file.name);
					// Klick
					if (S.in_mhit[1]) {
						if (file.typ === 2) {
							if (lockeddir === 0) {
								gui_win_file_listdir(file.path + file.name);
								S.in_win_file = '';
								break;
							}
						} else {
							if (S.in_win_file === file.name) {
								quit = 1;
								ret = 1;
							} else {
								S.in_win_file = file.name;
							}
						}
					}
				}
				if (file.typ === 1) {
					if (S.in_win_file !== '') {
						if (file.name === S.in_win_file) over = 1;
					}
				}
				// Draw Icon
				if (over === 0) DrawImage(M.gfx_icons_passive, 236 + x * 165, 100 + y * 20, file.icon);
				else DrawImage(M.gfx_icons, 236 + x * 165, 100 + y * 20, file.icon);

				// Name
				bmpf_txt_ml(236 + x * 165 + 32, 100 + y * 20 + 5, file.name, over, 236 + x * 165 + 32 + 140);

				// Pos
				y = y + 1;
				if (y >= 21) {
					y = 0;
					x = x + 1;
					if (x > 2) break;
				}
			}
		}

		// Scroll
		if (gui_ibutton(236, 542, Cicon_left, sm(23), S.in_scr_scr > 0)) {
			S.in_scr_scr = S.in_scr_scr - 22;
			if (S.in_scr_scr < 0) S.in_scr_scr = 0;
		}
		if (gui_ibutton(742 - 37 - 37 - 37, 542, Cicon_right, sm(24), x > 2)) {
			S.in_scr_scr = S.in_scr_scr + 22;
		}

		// File
		if (save === 1) {
			S.in_input[10] = S.in_win_file;
			gui_input(236 + 37, 548, 320, 10, 1, sm(25));
			S.in_win_file = S.in_input[10];
		} else {
			if (S.in_win_file !== '') bmpf_txt_ml(236 + 37, 550, sm(26) + ': ' + S.in_win_file, 0, 236 + 300);
			else bmpf_txt(236 + 37, 550, sm(27));
		}

		// Cancel
		if (gui_ibutton(742 - 37, 542, Cicon_x, sm(3))) quit = 1;
		// Ok
		if (gui_ibutton(742, 542, Cicon_ok, sm(5), S.in_win_file !== '')) {
			quit = 1;
			ret = 1;
		}

		endinput(1, 1, 0);
		host.console();
		await FlipWait();
	}
	// End
	FreeImage(temp);
	// Return
	flushinput();
	MoveMouse(742 + 16, 542 - 4);
	return ret;
}

/**
 * ### List dir: Function gui_win_file_listdir(path$). Fills S.Tfile with the
 * directory's entries; an empty path lists the drives. Entries with names of
 * two characters or fewer are skipped (this is how "." and ".." are dropped).
 */
export function gui_win_file_listdir(path: string): number {
	// Check Path
	if (path !== '') {
		path = ntrim(path);
		path = Replace(path, '/', '\\');
		if (Right(path, 1) !== '\\') path = path + '\\';
		// Is Path?
		if (host.fileType(path) === 2) {
			// Delete Old
			S.in_scr_scr = 0;
			S.Tfile.length = 0;
			// Set Path
			S.in_win_path = path;
			// Read and add all files/dirs
			for (const file of host.readDir(path)) {
				if (Len(file) > 2) {
					// Add
					const t: Tfile = { name: file, path, typ: host.fileType(path + file), icon: 0 };
					if (t.typ === 1) {
						const extp = Instr(file, '.');
						const ext = Lower(Mid(file, extp + 1, -1));
						switch (ext) {
							case 'wav':
							case 'mp3':
							case 'raw':
							case 'ogg':
								t.icon = Cicon_soundfile;
								break;
							case 'bmp':
							case 'jpg':
							case 'jpeg':
							case 'png':
							case 'pcx':
							case 'tga':
							case 'iff':
								t.icon = Cicon_imagefile;
								break;
							case 's2':
								t.icon = Cicon_stranded;
								break;
							case 's2s':
								t.icon = Cicon_s2script;
								break;
							default:
								t.icon = Cicon_file;
						}
					} else {
						t.icon = Cicon_dir;
					}
					S.Tfile.push(t);
				} else if (file === '') {
					break;
				}
			}
			// Okay
			return 1;
		}
		// Failed
		return 0;
	} else {
		// Empty Path - Get Drives! Yeah!
		// Delete Old
		S.in_scr_scr = 0;
		S.Tfile.length = 0;
		S.in_win_path = '';
		// Add A: without scan because floppy disk drive noise is crap!
		S.Tfile.push({ name: 'A:', path: '', typ: 2, icon: Cicon_dir });
		// Scan letters C to Z
		for (let driveasc = 67; driveasc <= 90; driveasc++) {
			if (host.fileType(Chr(driveasc) + ':') === 2) {
				S.Tfile.push({ name: Chr(driveasc) + ':', path: '', typ: 2, icon: Cicon_dir });
			}
		}
		// Okay
		return 1;
	}
}

/** ### Goto Parent Dir: Function gui_win_file_parentdir() */
export function gui_win_file_parentdir(): void {
	if (Len(S.in_win_path) <= 3) {
		gui_win_file_listdir('');
	} else {
		const l = Len(S.in_win_path) - 1;
		let lastslash = 0;
		for (let i = 1; i <= l; i++) {
			if (Mid(S.in_win_path, i, 1) === '\\') lastslash = i;
		}
		if (lastslash === 0) {
			gui_win_file_listdir('');
		} else {
			S.in_win_path = Left(S.in_win_path, lastslash);
			gui_win_file_listdir(S.in_win_path);
		}
	}
}

/**
 * ### Map Window: Function gui_win_map(mp=0,jumpto$=""). Map list with
 * preview; the chosen map name is left in S.in_win_map. Returns 1 if chosen.
 */
export async function gui_win_map(mp = 0, jumpto = ''): Promise<number> {
	const temp = CreateImage(S.set_scrx, S.set_scry);
	SetBuffer(FrontBuffer());
	GrabImage(temp, 0, 0);
	// (sic) no SetBuffer BackBuffer() here: the original relies on load_map_header doing it after
	// building the preview image. With an empty map list it keeps drawing to the front buffer.
	// Load Maps
	await host.load_maps(1, mp);
	// Jump to Map
	if (jumpto !== '') {
		let j = 0;
		for (const sg of host.Tsg) {
			j = j + 1;
			if (sg.name === jumpto) {
				await host.load_map_header('maps\\' + sg.name + '.s2');
				S.in_opt[0] = j;
				break;
			}
		}
	}
	// Loop
	let quit = 0,
		ret = 0;
	while (quit === 0) {
		getinput(0);
		if (KeyHit(1)) quit = 1;
		DrawBlock(temp, 0, 0);

		// Head
		DrawImage(M.gfx_win, 215, 0);
		if (gui_ibutton(742, 5, Cicon_x, sm(15))) quit = 1;
		DrawImage(M.gfx_icons, 236, 5, Cicon_dir);
		bmpf_txt(236 + 37, 10, sm(28));
		DrawImage(M.gfx_winbar, 215, 42);

		// List Maps
		let forceok = 0;
		Color(0, 0, 0);
		Rect(236, 195, 500, 379, 1);
		let i = 0,
			j = 0;
		for (const sg of host.Tsg) {
			j = j + 1;
			if (j > S.in_scr_scr) {
				const cache = S.in_opt[0];
				// Click
				if (gui_opt(236 + 5, 200 + i * 20, sg.name, j, 0)) {
					await host.load_map_header('maps\\' + sg.name + '.s2');
					// Click at already selected
					if (S.in_opt[0] === cache) forceok = 1;
				}
				i = i + 1;
				if (i > 18) break;
			}
		}

		// Scroll
		if (gui_ibutton(742, 200, Cicon_up, sm(29), S.in_scr_scr > 0)) S.in_scr_scr = S.in_scr_scr - 1;
		if (gui_ibutton(742, 542 - 32 - 5, Cicon_down, sm(30), i > 18)) S.in_scr_scr = S.in_scr_scr + 1;

		// Determine & Show
		let loadtemp = '';
		i = 0;
		for (const sg of host.Tsg) {
			i = i + 1;
			if (i === S.in_opt[0]) loadtemp = sg.name;
		}
		if (loadtemp === '') {
			Color(0, 0, 0);
			Rect(236, 63, 96, 72, 1);
			if (mp === 0) bmpf_txt(336, 63, sm(31), Cbmpf_red);
			else bmpf_txt(336, 63, sm(32), Cbmpf_red);
		} else {
			DrawBlock(host.map_image, 236, 63);
			bmpf_txt(336, 63, sm(33) + ':');
			bmpf_txt(450, 63, loadtemp);
			bmpf_txt(336, 83, sm(34) + ':');
			bmpf_txt(450, 83, host.sg_date);
			bmpf_txt(336, 103, sm(35) + ':');
			bmpf_txt(450, 103, host.sg_time + ' ' + sm(36));
		}

		// Load
		if (gui_ibutton(742, 542, Cicon_ok, sm(5), loadtemp !== '') || forceok === 1) {
			S.in_win_map = loadtemp;
			quit = 1;
			ret = 1;
		}

		endinput(1, 1, 0);
		host.console();
		await FlipWait();
	}
	// End
	FreeImage(temp);
	// Return
	flushinput();
	return ret;
}

/**
 * ### COMMAND WINDOW: Function gui_win_command(). Script command reference
 * of the editor: pick by first letter or by group; clicking a command
 * inserts it (or the rest of a half-typed one) into the text box.
 * Returns 1 when a command was inserted, 0 on cancel (Escape).
 */
export async function gui_win_command(): Promise<number> {
	FlushKeys();
	FlushMouse();
	let letter = 'a';
	if (S.in_sh_cmd !== '') letter = Lower(Left(S.in_sh_cmd, 1));
	let updated = 0;
	let group = '';
	for (;;) {
		getinput(0);
		TileBlock(M.gfx_bg[1]);
		bmpf_txt(5, 5, se(179));

		// Border
		DrawImage(M.gfx_border[3], 0, 25);

		// Letters
		let x = 5;
		let ble = 0;
		for (let i = 97; i <= 122; i++) {
			ble = bmpf_len(' ' + Upper(Chr(i)) + ' ', Cbmpf_tiny) + 3;
			if (gui_ttb(x, 45, ' ' + Upper(Chr(i)) + ' ', Asc(letter) === i)) {
				letter = Chr(i);
				group = '';
			}
			x = x + ble;
		}

		// Border
		DrawImage(M.gfx_border[3], 0, 68);

		// Groups
		x = 5;
		let yo = 85;
		for (const sgr of host.Tsgr) {
			ble = bmpf_len(' ' + sgr.group + ' ', Cbmpf_tiny) + 3;
			if (x + ble > 795) {
				x = 5;
				yo = yo + 19;
			}
			if (gui_ttb(x, yo, ' ' + sgr.group + ' ', group === sgr.group)) {
				letter = '1';
				group = sgr.group;
			}
			x = x + ble;
		}

		// Border
		DrawImage(M.gfx_border[3], 0, yo + 23);

		// Commands
		let comc = 0;
		x = 5;
		let y = 1;
		const selmode = letter === '1' ? 1 : 0;
		for (const sc of host.Tsc) {
			let sel = 0;
			if (selmode === 0) {
				if (Left(sc.cmd, 1) === letter) sel = 1;
			} else {
				if (Instr(sc.groups, group)) sel = 1;
			}
			if (sel === 1) {
				comc = comc + 1;
				ble = bmpf_len(' ' + sc.cmd + ' ', Cbmpf_tiny) + 3;
				if (x + ble > 795) {
					x = 5;
					y = y + 1;
				}
				if (gui_ttb(x, yo + 50 + y * 19, ' ' + sc.cmd + ' ', 0, sc.cmd + sc.params)) {
					const l = Len(S.in_sh_cmd);
					if (l === 0) {
						gui_tb_insert(sc.cmd);
					} else {
						if (Left(sc.cmd, l) === S.in_sh_cmd) gui_tb_insert(Mid(sc.cmd, l + 1, -1));
						else gui_tb_insert(sc.cmd);
					}
					S.in_sh = 0;
					S.in_sh_cmd = '';
					S.in_sh_update = 1;
					return 1;
				}
				x = x + ble;
			}
		}

		// Count
		if (comc === 0) bmpf_txt(5, yo + 46, '0 Commands', Cbmpf_tiny);
		else if (comc === 1) bmpf_txt(5, yo + 46, '1 Command', Cbmpf_tiny);
		else bmpf_txt(5, yo + 46, comc + ' Commands', Cbmpf_tiny);

		// Update
		if (S.set_inbb === 1) {
			updated = 1;
			if (gui_ibutton(5, S.set_scry - 37, Cicon_update, sm(171), updated === 1)) {
				await host.update_scriptcommands();
			}
		}

		// Cancel
		if (gui_ibutton(S.set_scrx - 37, S.set_scry - 37, Cicon_x, sm(3), 1, 0, 1)) return 0;

		endinput(1, 1, 0);
		host.console();
		await FlipWait();
	}
}

/**
 * ### GUI Window Defvars: Function gui_win_defvars(class,typ,id). Editor for
 * the predefined script variables of an entity (up to 21, inputs 10..30).
 * Okay stores non-default values as variables and deletes default ones.
 */
export async function gui_win_defvars(cls: number, typ: number, id: number): Promise<number> {
	FlushKeys();
	FlushMouse();
	let i = 0;
	// Fill with values
	for (i = 10; i <= 30; i++) S.in_input[i] = '';
	i = 10;
	for (const dv of host.Tdefvar) {
		if (dv.class === cls) {
			if (dv.typ === typ) {
				S.in_input[i] = dv.defaultval;
				if (dv.isglobal === 0) {
					// Local
					const v = host.var_local_get(cls, id, dv.key);
					if (v !== undefined) S.in_input[i] = v;
				} else {
					// Global
					const v = host.var_global_get(dv.key);
					if (v !== undefined) S.in_input[i] = v;
				}
				i = i + 1;
				if (i > 30) break;
			}
		}
	}
	// Draw
	for (;;) {
		getinput(0);
		TileBlock(M.gfx_bg[1]);
		bmpf_txt(5, 5, se(223));

		// Border
		DrawImage(M.gfx_border[3], 0, 25);

		// List
		i = 10;
		let y = 45;
		for (const dv of host.Tdefvar) {
			if (dv.class === cls) {
				if (dv.typ === typ) {
					// Description
					bmpf_txt(5, y, dv.descr + ':');
					// Value Input
					gui_input(300, y, 128, i);
					// Show / Reset Default
					if (S.in_input[i] !== dv.defaultval) {
						if (gui_txtb(445, y, 'Default: ' + dv.defaultval)) S.in_input[i] = dv.defaultval;
					} else {
						bmpf_txt(445, y, 'Default: ' + dv.defaultval, Cbmpf_dark);
					}
					// Local / Global Var
					bmpf_txt(620, y, '$' + dv.key, Cbmpf_tiny);
					if (dv.isglobal === 0) bmpf_txt_r(S.set_scrx - 5, y, 'L', Cbmpf_yellow);
					else bmpf_txt_r(S.set_scrx - 5, y, 'G', Cbmpf_red);
					i = i + 1;
					y = y + 25;
					if (i > 30) break;
				}
			}
		}

		// Okay (sic: the hotkey is Escape, the same as Cancel, so Escape accepts)
		if (gui_ibutton(S.set_scrx - 37, S.set_scry - 37, Cicon_ok, sm(4), 1, 0, 1)) {
			// Save
			i = 10;
			for (const dv of host.Tdefvar) {
				if (dv.class === cls) {
					if (dv.typ === typ) {
						// The original has no upper bound here and would index past in_input$(30).
						const value = S.in_input[i] ?? '';
						if (value === dv.defaultval) {
							// Default - Delete Vars
							if (dv.isglobal === 0) host.var_local_delete(cls, id, dv.key);
							else host.var_global_delete(dv.key);
						} else {
							// Not Default - Create Vars
							if (dv.isglobal === 0) host.var_set_local(cls, id, dv.key, IntS(value));
							else host.var_set(dv.key, IntS(value));
						}
						i = i + 1;
					}
				}
			}
			return 1;
		}

		// Cancel
		if (gui_ibutton(S.set_scrx - 37 - 37, S.set_scry - 37, Cicon_x, sm(3), 1, 0, 1)) return 0;

		endinput(1, 1, 0);
		host.console();
		await FlipWait();
	}
}

/** ### GUI Window Image: Function gui_win_image(path$,inimage=0). Centred image with an Okay button (Enter). */
export async function gui_win_image(path: string, inimage: ImageHandle = 0): Promise<number> {
	// load_image raises a RuntimeError for a missing file, so `image` is never 0 here.
	const image = inimage !== 0 ? inimage : await load_image_async(path, 0);
	MidHandle(image);
	FlushKeys();
	FlushMouse();
	for (;;) {
		getinput(0);
		ClsColor(0, 0, 0);
		Cls();

		// Image
		DrawImage(image, idiv(S.set_scrx, 2), idiv(S.set_scry, 2));

		// Okay
		if (gui_ibutton(idiv(S.set_scrx, 2) - 16, S.set_scry - 37, Cicon_ok, sm(5), 1, 0, 28)) return 1;

		endinput(1, 1, 0);
		host.console();
		await FlipWait();
	}
}

/** ### GUI Window Text: Function gui_win_text(txt$). Scrollable full-screen text with an Okay button (Enter). */
export async function gui_win_text(txt: string): Promise<number> {
	FlushKeys();
	FlushMouse();
	let scr = 0;
	for (;;) {
		getinput(0);
		ClsColor(0, 0, 0);
		Cls();

		// Description
		const scrolldown = bmpf_txt_rect(5, 5, S.set_scrx - 15 - 32, S.set_scry - 10, txt, 2, scr);
		if (gui_ibutton(S.set_scrx - 37, 5, Cicon_up, sm(29), scr > 0)) scr = scr - 1;
		if (gui_ibutton(S.set_scrx - 37, S.set_scry - 37 - 37, Cicon_down, sm(30), scrolldown === 0)) scr = scr + 1;

		// Okay
		if (gui_ibutton(S.set_scrx - 37, S.set_scry - 37, Cicon_ok, sm(5), 1, 0, 28)) return 1;

		endinput(1, 1, 0);
		host.console();
		await FlipWait();
	}
}

/** functions.bb drawy(img,x,y,h): repeat an image downwards to fill height h. */
export function drawy(img: ImageHandle, x: number, y: number, h: number): void {
	const xsize = ImageWidth(img);
	const ysize = ImageHeight(img);
	if (ysize <= 0) return; // not loaded; the original would divide by zero
	let pos = y;
	const rest = imod(h, ysize);
	while (pos < y + h - rest) {
		DrawImage(img, x, pos);
		pos = pos + ysize;
	}
	if (rest !== 0) DrawImageRect(img, x, y + h - rest, 0, 0, xsize, rest);
}

/**
 * ### GUI Scrollbar: Function gui_scrollbar(x,y,h,total,offset,visible).
 * Vertical bar, 32 pixels wide hit area. Returns the new offset. While the
 * slider is dragged the mouse is "stuck" to it: S.in_mx/in_my are forced
 * onto the slider and getinput() hides the real x until release.
 * S.tmp_slideend is 1 while the returned offset is below the end.
 */
export function gui_scrollbar(x: number, y: number, h: number, total: number, offset: number, visible: number): number {
	S.tmp_slideend = 0;
	// No Scrollbar required
	if (total < visible) {
		drawy(M.gfx_scroll[0], x + 14, y, h);
		return 0;
	}
	// Vars
	let newo = offset;
	let overbar = 0;
	let over = 0;
	const range = total + 1 - visible;
	let slideh = bbInt(f32(f32(h) / f32(range)));
	if (slideh < 16) slideh = 16;
	const nh = h - slideh;
	const pos = (yo: number): number => bbInt(f32(f32(f32(yo) / f32(nh)) * f32(range)));
	// Slider
	let slidey = bbInt(f32(f32(f32(offset) / f32(range)) * f32(nh)));
	slidey = slidey + y;
	if (S.in_mx >= x) {
		if (S.in_mx <= x + 32) {
			if (S.in_my >= slidey) {
				if (S.in_my <= slidey + slideh) {
					over = 1;
					if (S.in_mhit[1]) {
						S.in_sticktoslide = 1;
						S.in_sticktoslidex = x;
					}
				}
			}
		}
	}
	if (S.in_sticktoslide === 1) {
		if (S.in_sticktoslidex >= x && S.in_sticktoslidex <= x + 32) {
			S.in_mx = x + 16;
			let yo = S.in_my - y;
			yo = yo - idiv(slideh, 2);
			newo = pos(yo);
			if (newo < 0) newo = 0;
			if (newo > range) newo = range;
			over = 1;
		}
	}
	// Scrollbar
	if (over === 0) {
		if (S.in_mx >= x) {
			if (S.in_mx <= x + 32) {
				if (S.in_my >= y) {
					if (S.in_my <= y + h) overbar = 1;
				}
			}
		}
	}
	if (overbar === 1) {
		// Click
		if (over === 0) {
			if (S.in_mhit[1]) {
				let yo = S.in_my - y;
				yo = yo - idiv(slideh, 2);
				newo = pos(yo);
				if (newo < 0) newo = 0;
				if (newo > range) newo = range;
			}
		}
	}
	drawy(M.gfx_scroll[over], x + 14, y, h);
	// Draw Slider
	DrawImage(M.gfx_scroll_bar[0], x + 8, slidey);
	drawy(M.gfx_scroll_bar[1], x + 8, slidey + 4, slideh - 8);
	DrawImage(M.gfx_scroll_bar[2], x + 8, slidey + slideh - 4);
	if (S.in_sticktoslide === 1) {
		if (S.in_sticktoslidex >= x && S.in_sticktoslidex <= x + 32) {
			S.in_my = slidey + idiv(slideh, 2);
			S.in_sticktoslidex = S.in_mx;
			S.in_sticktoslidey = S.in_my;
			S.in_cursorf = 1;
		}
	}
	// Return
	if (newo < range) S.tmp_slideend = 1;
	return newo;
}

/** Drag and Drop Watch: Function gui_dndwatch(x,y). 1 when the left button went down over the 40x40 slot. */
export function gui_dndwatch(x: number, y: number): number {
	// Over
	let over = 0;
	if (mouseover(x, y, 40, 40)) over = 1;
	if (over === 1) {
		if (S.in_mhit[1]) return 1;
	}
	return 0;
}

/**
 * GUI Groupsel: Function gui_groupsel(x,y,class). Editor sidebar group
 * filter. Returns 1 while the list is closed (the caller then draws its own
 * content), 0 while the group list is open.
 */
export function gui_groupsel(x: number, y: number, cls: number): number {
	let txt = S.ed_groupn[cls];
	if (txt === '') txt = se(225);
	if (S.in_edselgroup === 0) {
		if (S.in_editor_sidebar === 1) {
			if (gui_txtb(x, y, txt)) S.in_edselgroup = 1;
		}
		return 1;
	} else {
		if (S.in_editor_sidebar === 1) {
			if (gui_txtb(x, y, txt, 1, Cbmpf_dark)) S.in_edselgroup = 0;
			y = y + 30;
			if (gui_txtb(x, y, se(225))) {
				S.ed_groupg[cls] = '';
				S.ed_groupn[cls] = '';
				S.in_edselgroup = 0;
			}
			for (const g of host.Tgroup) {
				if (g.class === cls) {
					y = y + 20;
					if (gui_txtb(x, y, g.name)) {
						S.ed_groupg[cls] = g.group;
						S.ed_groupn[cls] = g.name;
						S.in_edselgroup = 0;
						switch (cls) {
							case Cclass_object:
								S.in_object_scr = 0;
								break;
							case Cclass_unit:
								S.in_unit_scr = 0;
								break;
							case Cclass_item:
								S.in_item_scr = 0;
								break;
							case Cclass_info:
								S.in_info_scr = 0;
								break;
						}
					}
				}
			}
		}
		return 0;
	}
}
