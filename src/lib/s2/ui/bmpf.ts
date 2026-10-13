/**
 * Port of includes/load_bmpf.bb: bitmap fonts.
 *
 * A font is an animated image (one frame per glyph, all frames the same
 * size) plus a .bmpf file giving, per glyph, the byte it stands for and its
 * advance width. Text is drawn glyph by glyph with DrawImage; a space
 * advances by half the frame width and draws nothing.
 */
import {
	BackBuffer,
	Cls,
	ClsColor,
	Color,
	DrawImage,
	DrawImageRect,
	Flip,
	ImageHeight,
	LoadAnimImage,
	LoadImage,
	MaskImage,
	Rect,
	SetBuffer,
	type ImageHandle
} from '../gfx2d';
import type { Vfs } from '../io/Vfs';
import {
	Ckey_attack1,
	Ckey_attack2,
	Ckey_backward,
	Ckey_char,
	Ckey_chat,
	Ckey_diary,
	Ckey_drop,
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
	S
} from '../input/state';
import { Instr, IntS, Left, Mid, Replace, RuntimeError, Trim, idiv, trimspace } from './bb';
import { SEP_LINE } from './consts';
import { M } from './gfx';
import { host } from './host';

export const bmpf_count = 6;

const table = (): number[][] => Array.from({ length: 256 }, () => new Array<number>(bmpf_count + 1).fill(0));

/** Dim bmpf_image(bmpf_count) */
export const bmpf_image: ImageHandle[] = new Array<ImageHandle>(bmpf_count + 1).fill(0);
export const bmpf_frames: number[] = new Array<number>(bmpf_count + 1).fill(0);
export const bmpf_framesx: number[] = new Array<number>(bmpf_count + 1).fill(0);
export const bmpf_framesy: number[] = new Array<number>(bmpf_count + 1).fill(0);
/** Dim bmpf_framesw(255,bmpf_count): advance width of byte `sign` in font `id`. */
export const bmpf_framesw: number[][] = table();
/** Dim bmpf_framesc(255,bmpf_count): frame index of byte `sign` in font `id`. */
export const bmpf_framesc: number[][] = table();

/** Type Tbmpf_s: the lines the last bmpf_txt_rect call wrapped its text into. */
export const Tbmpf_s: string[] = [];

export interface BmpfDefinition {
	frames: number;
	framesx: number;
	framesy: number;
	/** In file order: the byte each frame stands for and its width. */
	glyphs: { sign: number; width: number }[];
}

/**
 * The .bmpf layout as bmpf_load_font reads it: one text line (ReadLine),
 * three shorts (frame count, frame width, frame height), then per frame a
 * byte (the character) and a short (its width).
 */
export function parse_bmpf(bytes: Uint8Array): BmpfDefinition {
	// ReadLine: up to LF, CR ignored.
	let p = 0;
	while (p < bytes.length && bytes[p] !== 10) p++;
	p++;
	const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const short = (): number => {
		const v = p + 1 < bytes.length ? dv.getUint16(p, true) : 0;
		p += 2;
		return v;
	};
	const frames = short();
	const framesx = short();
	const framesy = short();
	const glyphs: { sign: number; width: number }[] = [];
	for (let i = 1; i <= frames; i++) {
		const sign = p < bytes.length ? bytes[p] : 0;
		p++;
		glyphs.push({ sign, width: short() });
	}
	return { frames, framesx, framesy, glyphs };
}

/** Install a parsed definition as font `id` (the table half of bmpf_load_font). */
export function bmpf_set_definition(def: BmpfDefinition, id: number): void {
	bmpf_frames[id] = def.frames;
	bmpf_framesx[id] = def.framesx;
	bmpf_framesy[id] = def.framesy;
	def.glyphs.forEach((g, i) => {
		bmpf_framesc[g.sign][id] = i;
		bmpf_framesw[g.sign][id] = g.width;
	});
}

/** Function bmpf_load_font(bmp$,bmpf$,id) */
export async function bmpf_load_font(vfs: Vfs, bmp: string, bmpf: string, id: number): Promise<number> {
	if (!vfs.exists(bmpf)) RuntimeError('Unable to load Bitmapfont ' + bmp);
	bmpf_set_definition(parse_bmpf(await vfs.readBytes(bmpf)), id);
	const image = LoadAnimImage(bmp, bmpf_framesx[id], bmpf_framesy[id], 0, bmpf_frames[id]);
	// Blitz: LoadAnimImage returns 0 and the following MaskImage fails.
	if (!image) RuntimeError('Unable to load Bitmapfont ' + bmp);
	await image.ready;
	if (image.error) RuntimeError(`Unable to load Bitmapfont ${bmp} (${image.error})`);
	bmpf_image[id] = image;
	MaskImage(image, 255, 0, 255);
	return 1;
}

/**
 * The start-up code of load_bmpf.bb: progress bar image, then the seven
 * fonts with a load screen between them.
 */
export async function load_bmpf(vfs: Vfs): Promise<void> {
	const bar = LoadImage('sys\\gfx\\progress.bmp');
	if (!bar) RuntimeError('Unable to load Image sys\\gfx\\progress.bmp');
	await bar.ready;
	MaskImage(bar, 255, 0, 255);
	M.gfx_bar = bar;

	await bmpf_load_font(vfs, 'sys\\gfx\\font_tiny.bmp', 'sys\\gfx\\font_tiny.bmpf', 5);
	bmpf_loadscreen('Loading Fonts', 0);
	await bmpf_load_font(vfs, 'sys\\gfx\\font_norm.bmp', 'sys\\gfx\\font_norm.bmpf', 0);
	bmpf_loadscreen('Loading Fonts', 1);
	await bmpf_load_font(vfs, 'sys\\gfx\\font_norm_over.bmp', 'sys\\gfx\\font_norm.bmpf', 1);
	bmpf_loadscreen('Loading Fonts', 2);
	await bmpf_load_font(vfs, 'sys\\gfx\\font_norm_dark.bmp', 'sys\\gfx\\font_norm.bmpf', 2);
	bmpf_loadscreen('Loading Fonts', 3);
	await bmpf_load_font(vfs, 'sys\\gfx\\font_norm_bad.bmp', 'sys\\gfx\\font_norm.bmpf', 3);
	bmpf_loadscreen('Loading Fonts', 4);
	await bmpf_load_font(vfs, 'sys\\gfx\\font_norm_good.bmp', 'sys\\gfx\\font_norm.bmpf', 4);
	bmpf_loadscreen('Loading Fonts', 5);
	await bmpf_load_font(vfs, 'sys\\gfx\\font_handwriting.bmp', 'sys\\gfx\\font_norm.bmpf', 6);
}

const asc = (txt: string, i: number): number => txt.charCodeAt(i - 1) & 255;

/** Function bmpf_txt(x,y,txt$,id=0): draw left-aligned. */
export function bmpf_txt(x: number, y: number, txt: string | number, id = 0): void {
	txt = String(txt);
	const strlen = txt.length;
	const half = idiv(bmpf_framesx[id], 2);
	for (let i = 1; i <= strlen; i++) {
		const sign = asc(txt, i);
		if (sign !== 32) {
			DrawImage(bmpf_image[id], x, y, bmpf_framesc[sign][id]);
			x = x + bmpf_framesw[sign][id];
		} else {
			x = x + half;
		}
	}
}

/** Function bmpf_txt_c(x,y,txt$,id=0): draw centred on x. */
export function bmpf_txt_c(x: number, y: number, txt: string | number, id = 0): void {
	txt = String(txt);
	const strlen = txt.length;
	const half = idiv(bmpf_framesx[id], 2);
	let offset = 0;
	for (let i = 1; i <= strlen; i++) {
		const sign = asc(txt, i);
		if (sign !== 32) offset = offset + bmpf_framesw[sign][id];
		else offset = offset + half;
	}
	x = x - idiv(offset, 2);
	for (let i = 1; i <= strlen; i++) {
		const sign = asc(txt, i);
		if (sign !== 32) {
			DrawImage(bmpf_image[id], x, y, bmpf_framesc[sign][id]);
			x = x + bmpf_framesw[sign][id];
		} else {
			x = x + half;
		}
	}
}

/** Function bmpf_txt_r(x,y,txt$,id=0): draw right-aligned, ending at x. */
export function bmpf_txt_r(x: number, y: number, txt: string | number, id = 0): void {
	txt = String(txt);
	const strlen = txt.length;
	const half = idiv(bmpf_framesx[id], 2);
	for (let i = strlen; i >= 1; i--) {
		const sign = asc(txt, i);
		if (sign !== 32) {
			x = x - bmpf_framesw[sign][id];
			DrawImage(bmpf_image[id], x, y, bmpf_framesc[sign][id]);
		} else {
			x = x - half;
		}
	}
}

/** Function bmpf_len(txt$,id=0): width in pixels. */
export function bmpf_len(txt: string | number, id = 0): number {
	txt = String(txt);
	const strlen = txt.length;
	const half = idiv(bmpf_framesx[id], 2);
	let x = 0;
	for (let i = 1; i <= strlen; i++) {
		const sign = asc(txt, i);
		if (sign !== 32) x = x + bmpf_framesw[sign][id];
		else x = x + half;
	}
	return x;
}

/**
 * Function bmpf_trim$(txt$,id,maxlen): drop characters from the end until
 * the text fits. Original quirk kept: removing a trailing space ADDS half a
 * frame width to the running length instead of subtracting it.
 */
export function bmpf_trim(txt: string, id: number, maxlen: number): string {
	const strlen = txt.length;
	const half = idiv(bmpf_framesx[id], 2);
	let x = 0;
	for (let i = 1; i <= strlen; i++) {
		const sign = asc(txt, i);
		if (sign !== 32) x = x + bmpf_framesw[sign][id];
		else x = x + half;
	}
	while (x > maxlen) {
		if (txt.length === 0) return '';
		const sign = asc(txt, txt.length);
		if (sign !== 32) x = x - bmpf_framesw[sign][id];
		else x = x + half;
		txt = Left(txt, txt.length - 1);
	}
	return txt;
}

const KEY_VARS: readonly [string, number][] = [
	['$key_forward', Ckey_forward],
	['$key_backward', Ckey_backward],
	['$key_left', Ckey_left],
	['$key_right', Ckey_right],
	['$key_jump', Ckey_jump],
	['$key_sleep', Ckey_sleep],
	['$key_attack1', Ckey_attack1],
	['$key_attack2', Ckey_attack2],
	['$key_next', Ckey_next],
	['$key_prev', Ckey_prev],
	['$key_drop', Ckey_drop],
	['$key_use', Ckey_use],
	['$key_chat', Ckey_chat],
	['$key_char', Ckey_char],
	['$key_items', Ckey_items],
	['$key_diary', Ckey_diary],
	['$key_quicksave', Ckey_quicksave],
	['$key_quickload', Ckey_quickload]
];

/**
 * The first half of bmpf_txt_rect: replaces $key_* names and script
 * variables, registers $img= images, and wraps the text to width `w`.
 * Returns the lines (also left in Tbmpf_s) and sets S.tmp_lines.
 *
 * Wrapping rules, all from the original:
 *  - byte 166 forces a line break and is dropped;
 *  - a line breaks at the last whitespace (dropped), '-' (moves to the next
 *    line) or byte 182 (dropped) before the overflowing character;
 *  - without such a place the line breaks two characters back;
 *  - each line is stripped of leading/trailing spaces.
 */
export function bmpf_txt_rect_lines(w: number, txt: string, id = 0): string[] {
	let i = 0,
		lastspace = 0,
		sign = 0,
		add = 0;
	let lastbreak = 1;

	// Alte Lines in Types löschen
	Tbmpf_s.length = 0;

	// String Keyvars Replacen
	if (Instr(txt, '$key_')) {
		for (const [name, key] of KEY_VARS) txt = Replace(txt, name, S.in_keyname[S.in_keys[key]] ?? '');
	}

	// String nach anderen Vars durchgehen
	let offset = 0;
	let pend = 0,
		path = '',
		imgh = 0,
		addstr = '';
	for (let guard = 0; guard < 100000; guard++) {
		if (offset > 0) i = Instr(txt, '$', offset);
		else i = Instr(txt, '$');
		if (i === 0) break;
		offset = i + 1;
		let nomorecheck = 0;
		// Image
		if (Mid(txt, i, 5) === '$img=') {
			nomorecheck = 1;
			pend = Instr(txt, SEP_LINE, i + 1);
			path = Trim(Mid(txt, i + 5, pend - (i + 5)));
			let found = 0;
			for (const img of S.Tbmpf_img) {
				if (img.file === path) {
					found = 1;
					imgh = ImageHeight(img.h);
					break;
				}
			}
			if (found === 0) {
				// load_image(path$,1): masked, RuntimeError when missing.
				const h = LoadImage(path);
				if (!h) RuntimeError('Unable to load Image ' + path);
				MaskImage(h, 255, 0, 255);
				S.Tbmpf_img.push({ file: path, h });
				// The pixels arrive asynchronously: the height is 0 until then.
				imgh = ImageHeight(h);
			}
			if (imgh > 20) {
				imgh = Math.ceil(imgh / 20) - 1;
				addstr = '';
				for (let k = 1; k <= imgh; k++) addstr = addstr + SEP_LINE;
			}
			txt = Left(txt, pend) + addstr + Mid(txt, pend, -1);
		}
		// Normal Vars (per Line)
		if (nomorecheck === 0) {
			pend = Instr(txt, SEP_LINE, i + 1);
			if (pend > 0) {
				path = Mid(txt, i, pend - i);
				path = host.var_rep(path);
				if (i === 1) txt = path + Mid(txt, pend, -1);
				else txt = Left(txt, i - 1) + path + Mid(txt, pend, -1);
			} else {
				path = Mid(txt, i, -1);
				path = host.var_rep(path);
				txt = Left(txt, i - 1) + path;
			}
		}
	}

	// Lines in Types anlegen
	let x = 0;
	S.tmp_lines = 0;
	S.tmp_linesvisible = 0;
	const strlen = txt.length;
	const half = idiv(bmpf_framesx[id], 2);
	// The original never terminates when a single glyph is wider than w; give up instead of hanging.
	let guard = strlen * 4 + 1000;
	for (i = 1; i <= strlen; i++) {
		if (--guard < 0) break;
		// Zeichenlänge
		sign = asc(txt, i);
		if (sign !== 32) x = x + bmpf_framesw[sign][id];
		else x = x + half;
		// Nextline/Lastspace
		if (sign === 166) {
			lastspace = i;
			x = w + 1;
			add = 1;
		}
		if (x > w) {
			// Nextline
			if (lastspace === 0) lastspace = i - 1;
			x = 0;
			Tbmpf_s.push(trimspace(Mid(txt, lastbreak, lastspace - lastbreak)));
			i = lastspace;
			lastbreak = lastspace + add;
			lastspace = 0;
			S.tmp_lines = S.tmp_lines + 1;
		} else {
			// Lastspace
			add = 0;
			if (sign < 33) {
				// Whitespaces
				lastspace = i;
				add = 1;
			} else if (sign === 45) {
				// -
				lastspace = i;
			} else if (sign === 182) {
				// Forced Break
				lastspace = i;
				add = 1;
			}
		}
	}
	// Lastline
	Tbmpf_s.push(trimspace(Mid(txt, lastbreak, -1)));
	S.tmp_lines = S.tmp_lines + 1;
	return Tbmpf_s;
}

/**
 * Function bmpf_txt_rect(x,y,w,h,txt$,id=0,scroll=0): word-wrapped text in a
 * box, 20 pixels per line, starting at line `scroll`.
 * Returns 0 when the text was cut off at the bottom (more to scroll), else 1.
 * Sets S.tmp_lines (total) and S.tmp_linesvisible.
 *
 * A line starting with "!" + digit is drawn in that font; a line starting
 * with "$img=" draws that image (clipped to the box).
 */
export function bmpf_txt_rect(x: number, y: number, w: number, h: number, txt: string, id = 0, scroll = 0): number {
	const rx = x;
	const ry = y;
	const lines = bmpf_txt_rect_lines(w, txt, id);

	// Ausgeben unter Berücksichtigung des Scrolls
	x = rx;
	y = ry;
	let i = 0;
	for (const line of lines) {
		if (i >= scroll) {
			S.tmp_linesvisible = S.tmp_linesvisible + 1;
			if (Left(line, 5) === '$img=') {
				// Image
				const path = Trim(Mid(line, 6, -1));
				for (const img of S.Tbmpf_img) {
					if (img.file === path) {
						DrawImageRect(img.h, x, y, 0, 0, w, ry + h - y);
						break;
					}
				}
				y = y + 20;
				if (y + 18 > ry + h) return 0;
			} else {
				// Text
				if (Left(line, 1) === '!') {
					let tid = IntS(Mid(line, 2, 1));
					if (tid < 0) tid = id;
					if (tid > 6) tid = id;
					bmpf_txt(x, y, Mid(line, 3, -1), tid);
				} else {
					bmpf_txt(x, y, line, id);
				}
				y = y + 20;
				if (y + 18 > ry + h) return 0;
			}
		}
		i = i + 1;
	}
	// Lines Left. `rh` is never assigned in the original, so the test is y>h.
	const rh = 0;
	for (;;) {
		S.tmp_linesvisible = S.tmp_linesvisible + 1;
		y = y + 20;
		if (y > rh + h) return 1;
	}
}

/**
 * Function bmpf_txt_scroll(x#,y,txt$,id=0,ml,scroll#): text shifted by
 * `scroll`; glyphs are drawn only while x>=start and x+20<ml.
 */
export function bmpf_txt_scroll(x: number, y: number, txt: string, id: number, ml: number, scroll: number): void {
	const f = Math.fround;
	const sx = f(x);
	const strlen = txt.length;
	const half = idiv(bmpf_framesx[id], 2);
	x = f(f(x) + f(scroll));
	for (let i = 1; i <= strlen; i++) {
		const sign = asc(txt, i);
		if (sign !== 32) {
			if (x >= sx && x + 20 < ml) DrawImage(bmpf_image[id], x, y, bmpf_framesc[sign][id]);
			x = f(x + bmpf_framesw[sign][id]);
		} else {
			x = f(x + half);
		}
	}
}

/**
 * Function bmpf_loadscreen(txt$,percent=-1): black screen, message in the
 * tiny font, 600 pixel progress bar. Flips. The caller yields to the
 * browser if the screen should actually become visible.
 */
export function bmpf_loadscreen(txt: string, percent = -1): void {
	const cx = idiv(S.set_scrx, 2),
		cy = idiv(S.set_scry, 2);
	SetBuffer(BackBuffer());
	ClsColor(0, 0, 0);
	Cls();
	bmpf_txt_c(cx, cy - 20, txt, 5);
	if (percent > -1) {
		if (percent > 100) percent = 100;
		Color(60, 60, 60);
		Rect(cx - 300, cy + 5, 600, 5, 1);
		DrawImageRect(M.gfx_bar, cx - 300, cy + 5, 0, 0, percent * 6, 5);
		bmpf_txt_c(cx, cy + 20, percent + '%', 5);
	}
	Flip();
	if (S.in_conlastloadmsg !== txt) {
		S.in_conlastloadmsg = txt;
		host.con_add(txt);
	}
	host.p_rectscreen();
}

/** Function bmpf_txt_ml(x,y,txt$,id,maxlen): draw until a glyph would pass x=maxlen. Returns 0 if cut. */
export function bmpf_txt_ml(x: number, y: number, txt: string, id: number, maxlen: number): number {
	const strlen = txt.length;
	const half = idiv(bmpf_framesx[id], 2);
	for (let i = 1; i <= strlen; i++) {
		const sign = asc(txt, i);
		if (sign !== 32) {
			if (x + bmpf_framesw[sign][id] > maxlen) return 0;
			DrawImage(bmpf_image[id], x, y, bmpf_framesc[sign][id]);
			x = x + bmpf_framesw[sign][id];
		} else {
			x = x + half;
		}
	}
	return 1;
}

/** Function bmpf_txt_ml_len(x,y,txt$,id,maxlen): width bmpf_txt_ml would draw. */
export function bmpf_txt_ml_len(x: number, _y: number, txt: string, id: number, maxlen: number): number {
	const strlen = txt.length;
	const half = idiv(bmpf_framesx[id], 2);
	const sx = x;
	for (let i = 1; i <= strlen; i++) {
		const sign = asc(txt, i);
		if (sign !== 32) {
			if (x + bmpf_framesw[sign][id] > maxlen) return x - sx;
			x = x + bmpf_framesw[sign][id];
		} else {
			x = x + half;
		}
	}
	return x - sx;
}

/**
 * Function bmpf_txt_ml_marked(x,y,txt$,id,maxlen,ms,me): like bmpf_txt_ml,
 * with a brown box behind characters ms+1..me (1-based).
 */
export function bmpf_txt_ml_marked(x: number, y: number, txt: string, id: number, maxlen: number, ms: number, me: number): number {
	Color(84, 51, 0);
	const strlen = txt.length;
	const half = idiv(bmpf_framesx[id], 2);
	for (let i = 1; i <= strlen; i++) {
		const sign = asc(txt, i);
		if (sign !== 32) {
			if (x + bmpf_framesw[sign][id] > maxlen) return 0;
			if (i > ms && i <= me) Rect(x - 1, y + 1, bmpf_framesw[sign][id] + 2, 14, 1);
			DrawImage(bmpf_image[id], x, y, bmpf_framesc[sign][id]);
			x = x + bmpf_framesw[sign][id];
		} else {
			if (i > ms && i <= me) Rect(x - 1, y + 1, half + 2, 14, 1);
			x = x + half;
		}
	}
	return 1;
}

/**
 * Function bmpf_txt_pos(txt$,id,pos): character index (0..len) for a pixel
 * offset, used to place the text cursor from a mouse x.
 */
export function bmpf_txt_pos(txt: string, id: number, pos: number): number {
	const strlen = txt.length;
	const half = idiv(bmpf_framesx[id], 2);
	let x = 0;
	if (pos <= 3) return 0;
	for (let i = 1; i <= strlen; i++) {
		const sign = asc(txt, i);
		const os = sign !== 32 ? bmpf_framesw[sign][id] : half;
		x = x + os;
		if (x - idiv(os, 2) >= pos) return i - 1;
		if (x >= pos) return i;
	}
	return strlen;
}
