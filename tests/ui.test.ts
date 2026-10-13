import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import * as G from '../src/lib/s2/gfx2d';
import * as I from '../src/lib/s2/input';
import { parse_controls } from '../src/lib/s2/input/controls';
import { flushinput, getinput, inputhit } from '../src/lib/s2/input/input';
import { Ckey_jump, Csection_game_sp, S, resetState } from '../src/lib/s2/input/state';
import { Instr, LSet, Left, Mid, Replace, Right, Trim, toGameString, fromGameString } from '../src/lib/s2/ui/bb';
import * as B from '../src/lib/s2/ui/bmpf';
import { SEP_LINE } from '../src/lib/s2/ui/consts';
import { M } from '../src/lib/s2/ui/gfx';
import * as GUI from '../src/lib/s2/ui/gui';
import * as TB from '../src/lib/s2/ui/gui_tb';
import { host, makeFileHost, setHost } from '../src/lib/s2/ui/host';
import { MEDIA_RESOURCES, load_media } from '../src/lib/s2/ui/media';
import { load_keynames, load_strings, sm } from '../src/lib/s2/ui/strings';
import { NodeVfs } from './NodeVfs';

const root = resolve('static/game/mod');
const have = existsSync(root);
const vfs = have ? new NodeVfs(root) : (undefined as unknown as NodeVfs);

/** Blitz 0xRRGGBB of a back-buffer pixel. */
const pix = (x: number, y: number, buf = G.BackBuffer()) => G.ReadPixelFast(x, y, buf) & 0xffffff;

describe('bb string helpers', () => {
	it('Mid/Left/Right/Instr/LSet follow bbstring.cpp', () => {
		expect(Mid('hello', 2, 3)).toBe('ell');
		expect(Mid('hello', 4, -1)).toBe('lo');
		expect(Mid('hello', 9, -1)).toBe('');
		expect(Mid('hello', 2, -5)).toBe('ello'); // any negative count = rest
		expect(Left('hello', 2)).toBe('he');
		expect(Right('hello', 9)).toBe('hello');
		expect(Instr('a$b$c', '$')).toBe(2);
		expect(Instr('a$b$c', '$', 3)).toBe(4);
		expect(Instr('abc', 'x')).toBe(0);
		expect(LSet('abc', 2)).toBe('ab');
		expect(LSet('abc', 5)).toBe('abc  ');
		expect(Replace('a   b', '   ', '\t')).toBe('a\tb');
		expect(Trim('  \tab c\r\n')).toBe('ab c');
	});
	it('converts between game bytes and unicode', () => {
		expect(toGameString('€ä→')).toBe('\x80\xe4?');
		expect(fromGameString('\x80\xe4')).toBe('€ä');
	});
	it('bbInt rounds half to even like x87', () => {
		expect(G.bbInt(2.5)).toBe(2);
		expect(G.bbInt(3.5)).toBe(4);
		expect(G.bbInt(-2.5)).toBe(-2);
		expect(G.bbInt(2.4)).toBe(2);
		expect(G.bbInt(2.6)).toBe(3);
		expect(G.bbInt(7)).toBe(7);
	});
});

describe('scancodes', () => {
	it('maps KeyboardEvent.code to DirectInput scancodes', () => {
		expect(I.scancodeOf('Escape')).toBe(1);
		expect(I.scancodeOf('KeyW')).toBe(17);
		expect(I.scancodeOf('Enter')).toBe(28);
		expect(I.scancodeOf('ControlLeft')).toBe(29);
		expect(I.scancodeOf('KeyX')).toBe(45);
		expect(I.scancodeOf('KeyC')).toBe(46);
		expect(I.scancodeOf('KeyV')).toBe(47);
		expect(I.scancodeOf('Space')).toBe(57);
		expect(I.scancodeOf('F5')).toBe(63);
		expect(I.scancodeOf('NumpadEnter')).toBe(156);
		expect(I.scancodeOf('ControlRight')).toBe(157);
		expect(I.scancodeOf('ArrowUp')).toBe(200);
		expect(I.scancodeOf('ArrowLeft')).toBe(203);
		expect(I.scancodeOf('ArrowRight')).toBe(205);
		expect(I.scancodeOf('ArrowDown')).toBe(208);
		expect(I.scancodeOf('Delete')).toBe(211);
		expect(I.scancodeOf('Unidentified')).toBe(0);
		const codes = Object.values(I.CODE_TO_SCANCODE);
		expect(new Set(codes).size).toBe(codes.length);
		expect(Math.max(...codes)).toBeLessThan(256);
	});
	it('toAscii gives what GetKey returns', () => {
		expect(I.toAscii(30, 'a')).toBe(97);
		expect(I.toAscii(30, 'A')).toBe(65);
		expect(I.toAscii(30, 'a', true)).toBe(1); // Ctrl+A
		expect(I.toAscii(32, 'd', true)).toBe(4); // Ctrl+D is the "Delete" code
		expect(I.toAscii(28, 'Enter')).toBe(13);
		expect(I.toAscii(14, 'Backspace')).toBe(8);
		expect(I.toAscii(15, 'Tab')).toBe(9);
		expect(I.toAscii(1, 'Escape')).toBe(27);
		expect(I.toAscii(211, 'Delete')).toBe(4);
		expect(I.toAscii(210, 'Insert')).toBe(3);
		expect(I.toAscii(199, 'Home')).toBe(1);
		expect(I.toAscii(207, 'End')).toBe(2);
		expect(I.toAscii(200, 'ArrowUp')).toBe(28);
		expect(I.toAscii(208, 'ArrowDown')).toBe(29);
		expect(I.toAscii(205, 'ArrowRight')).toBe(30);
		expect(I.toAscii(203, 'ArrowLeft')).toBe(31);
		expect(I.toAscii(59, 'F1')).toBe(0);
		expect(I.toAscii(42, 'Shift')).toBe(0);
		expect(I.toAscii(40, 'ä')).toBe(228);
		expect(I.toAscii(18, '€')).toBe(128);
		expect(I.toAscii(18, 'Dead')).toBe(0);
	});
});

describe('Blitz input devices', () => {
	beforeEach(() => {
		I.resetInput();
		I.setInputSize(800, 600);
	});

	it('KeyHit counts presses and resets, KeyDown tracks state', () => {
		I.injectKeyDown(30, 97);
		I.injectKeyUp(30);
		I.injectKeyDown(30, 97);
		I.injectKeyUp(30);
		I.injectKeyDown(30, 97);
		expect(I.KeyDown(30)).toBe(1);
		expect(I.KeyHit(30)).toBe(3);
		expect(I.KeyHit(30)).toBe(0);
		expect(I.KeyDown(30)).toBe(1);
		I.injectKeyUp(30);
		expect(I.KeyDown(30)).toBe(0);
		expect(I.KeyHit(31)).toBe(0);
	});

	it('FlushKeys forgets hits and queued characters but not held keys', () => {
		I.injectKeyDown(17, 119);
		I.FlushKeys();
		expect(I.KeyHit(17)).toBe(0);
		expect(I.GetKey()).toBe(0);
		expect(I.KeyDown(17)).toBe(1);
	});

	it('GetKey pops one press per call; presses without a character yield 0', () => {
		I.injectKeyDown(30, 97);
		I.injectKeyDown(42, 0); // Shift
		I.injectKeyDown(48, 66);
		expect(I.GetKey()).toBe(97);
		expect(I.GetKey()).toBe(0);
		expect(I.GetKey()).toBe(66);
		expect(I.GetKey()).toBe(0);
	});

	it('the key queue holds 32 presses; hit counts are not limited by it', () => {
		for (let i = 0; i < 40; i++) I.injectKeyDown(30, 97);
		let n = 0;
		while (I.GetKey()) n++;
		expect(n).toBe(32);
		expect(I.KeyHit(30)).toBe(40);
	});

	it('mouse buttons, GetMouse and FlushMouse', () => {
		I.injectMouseDown(1);
		I.injectMouseDown(2);
		expect(I.MouseDown(1)).toBe(1);
		expect(I.GetMouse()).toBe(1);
		expect(I.GetMouse()).toBe(2);
		expect(I.GetMouse()).toBe(0);
		expect(I.MouseHit(1)).toBe(1);
		expect(I.MouseHit(1)).toBe(0);
		I.injectMouseUp(1);
		I.injectMouseDown(1);
		I.FlushMouse();
		expect(I.MouseHit(1)).toBe(0);
		expect(I.MouseDown(1)).toBe(1);
	});

	it('mouse position is clamped to the screen; speeds are deltas since the last call', () => {
		I.injectMouseMove(100, 50);
		expect(I.MouseXSpeed()).toBe(100);
		expect(I.MouseYSpeed()).toBe(50);
		expect(I.MouseXSpeed()).toBe(0);
		I.injectMouseMove(90, 70);
		expect(I.MouseXSpeed()).toBe(-10);
		expect(I.MouseYSpeed()).toBe(20);
		I.injectMouseMove(5000, -3);
		expect(I.MouseX()).toBe(799);
		expect(I.MouseY()).toBe(0);
	});

	it('MoveMouse sets the position and resets the speed reference', () => {
		I.injectMouseMove(10, 10);
		I.MoveMouse(400, 300);
		expect(I.MouseX()).toBe(400);
		expect(I.MouseXSpeed()).toBe(0);
		I.injectMouseDelta(7, -4); // pointer-locked movement
		expect(I.MouseXSpeed()).toBe(7);
		expect(I.MouseYSpeed()).toBe(-4);
		I.injectMouseDelta(10000, 0);
		expect(I.MouseX()).toBe(799);
	});

	it('MouseZ counts whole wheel notches of 120', () => {
		I.injectWheel(100);
		expect(I.MouseZSpeed()).toBe(0);
		I.injectWheel(20);
		expect(I.MouseZSpeed()).toBe(1);
		I.injectWheel(-360);
		expect(I.MouseZSpeed()).toBe(-3);
		expect(I.MouseZ()).toBe(-2);
	});
});

describe('input.bb', () => {
	let now = 1000;
	beforeEach(() => {
		resetState();
		I.resetInput();
		I.setInputSize(800, 600);
		now = 1000;
		I.setClock(() => now);
	});

	it('getinput derives hit, down and release per frame', () => {
		I.injectMouseMove(10, 20);
		I.injectMouseDown(1);
		getinput(0);
		expect([S.in_mhit[1], S.in_mdown[1], S.in_mrelease[1]]).toEqual([1, 1, 0]);
		expect([S.in_mx, S.in_my]).toEqual([10, 20]);
		expect(S.in_inputfocus).toBe(-1); // any left button down drops the text focus
		getinput(0);
		expect([S.in_mhit[1], S.in_mdown[1], S.in_mrelease[1]]).toEqual([0, 1, 0]);
		I.injectMouseUp(1);
		getinput(0);
		expect([S.in_mhit[1], S.in_mdown[1], S.in_mrelease[1]]).toEqual([0, 0, 1]);
		expect(S.in_slidefocus).toBe(-1);
		getinput(0);
		expect(S.in_mrelease[1]).toBe(0);
	});

	it('a click that starts and ends between two frames is still a hit and a release', () => {
		I.injectMouseDown(1);
		I.injectMouseUp(1);
		getinput(0);
		// MouseHit saw the press, MouseDown did not: no release is ever reported (as in the original).
		expect([S.in_mhit[1], S.in_mdown[1], S.in_mrelease[1]]).toEqual([1, 0, 0]);
	});

	it('in_mxs is the negated x speed; in_mpt starts when the mouse rests', () => {
		I.injectMouseMove(50, 50);
		getinput(0);
		expect(S.in_mxs).toBe(-50);
		expect(S.in_mys).toBe(50);
		expect(S.in_mpt).toBe(-1);
		now = 1100;
		getinput(0);
		expect(S.in_mpt).toBe(1100);
		now = 1200;
		getinput(0);
		expect(S.in_mpt).toBe(1100);
	});

	it('action keys are only sampled in game sections; mouse codes map to buttons and wheel', () => {
		S.in_keys[Ckey_jump] = 57;
		S.in_keys[6] = 256;
		S.in_keys[8] = 261;
		S.in_keys[9] = 262;
		I.injectKeyDown(57, 32);
		getinput(0);
		expect(S.in_keyhit[Ckey_jump]).toBe(0); // menu section
		S.m_section = Csection_game_sp;
		I.injectKeyDown(1, 27);
		I.injectMouseDown(1);
		I.injectWheel(120);
		getinput(0);
		expect(S.in_keyhit[Ckey_jump]).toBe(1); // the press made in the menu was never read, so it is still counted
		expect(S.in_keydown[Ckey_jump]).toBe(1);
		expect(S.in_keyhit[6]).toBe(1);
		expect(S.in_keydown[6]).toBe(1);
		expect(S.in_keyhit[8]).toBe(1);
		expect(S.in_keyhit[9]).toBe(0);
		expect(S.in_escape).toBe(1);
		expect(S.in_key).toBe(27); // one queued press per frame: the space was read by the first getinput
		I.injectKeyUp(57);
		I.injectWheel(-120);
		getinput(0);
		expect(S.in_keyrelease[Ckey_jump]).toBe(1);
		expect(S.in_keyhit[9]).toBe(1);
		expect(S.in_jumprehit).toBe(1); // set by the jump hit while no menu was open
	});

	it('inputhit checks the raw key, the bound actions and Escape', () => {
		S.m_section = Csection_game_sp;
		S.in_keys[Ckey_jump] = 57;
		I.injectKeyDown(57, 32);
		getinput(0); // consumes KeyHit(57) into in_keyhit
		expect(inputhit(57)).toBe(1);
		I.injectKeyDown(1, 27);
		getinput(0);
		expect(inputhit(1)).toBe(1); // via in_escape
		expect(inputhit(28)).toBe(0);
		I.injectKeyDown(28, 13);
		expect(inputhit(28)).toBe(1);
		expect(inputhit(28)).toBe(0);
	});

	it('flushinput clears hits, the in_ arrays and Escape', () => {
		S.m_section = Csection_game_sp;
		S.in_keys[0] = 17;
		I.injectKeyDown(17, 119);
		I.injectKeyDown(1, 27);
		I.injectMouseDown(1);
		getinput(0);
		I.injectKeyDown(30, 97);
		I.injectMouseDown(2);
		flushinput();
		expect(S.in_keyhit[0]).toBe(0);
		expect(S.in_keydown[0]).toBe(0);
		expect(S.in_escape).toBe(0);
		expect(S.in_mdown[1]).toBe(0);
		expect(I.KeyHit(30)).toBe(0);
		expect(I.MouseHit(2)).toBe(0);
		expect(I.GetKey()).toBe(0);
		// keys only
		I.injectMouseDown(3);
		flushinput(1, 0);
		expect(I.MouseHit(3)).toBe(1);
	});

	it('cursor blink, timers and the game timer', () => {
		getinput(1);
		expect(S.in_cursor).toBe(1); // 1000-0 > 200
		expect(S.in_t1000go).toBe(1);
		expect(S.gt).toBe(0); // lastms was 0
		now = 1100;
		getinput(1);
		expect(S.in_cursor).toBe(1);
		expect(S.gt).toBe(100);
		expect(S.in_gt100go).toBe(1);
		expect(S.in_t100go).toBe(1);
		expect(S.in_t1000go).toBe(0);
		now = 1250;
		S.in_gtmod = 0.5;
		getinput(1);
		expect(S.in_cursor).toBe(0);
		expect(S.gt).toBe(175);
		getinput(0);
		expect(S.gt).toBe(175);
	});
});

describe('gfx2d (Blitz 2D semantics)', () => {
	beforeEach(() => {
		G.Graphics(64, 48);
		G.SetBuffer(G.BackBuffer());
	});

	const solidImage = (w: number, h: number, rgb: number) => {
		const img = G.CreateImage(w, h);
		const b = G.ImageBuffer(img);
		for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) G.WritePixelFast(x, y, rgb, b);
		return img;
	};

	it('Color/Rect/Plot/ReadPixel and Cls', () => {
		G.ClsColor(10, 20, 30);
		G.Cls();
		expect(pix(0, 0)).toBe(0x0a141e);
		G.Color(255, 128, 0);
		G.Rect(2, 3, 4, 5, 1);
		expect(pix(2, 3)).toBe(0xff8000);
		expect(pix(5, 7)).toBe(0xff8000);
		expect(pix(6, 7)).toBe(0x0a141e);
		expect(pix(5, 8)).toBe(0x0a141e);
		G.Plot(20, 20);
		expect(G.ReadPixel(20, 20) & 0xffffff).toBe(0xff8000);
		expect(G.ReadPixel(20, 20) >>> 24).toBe(0xff);
		G.GetColor(0, 0);
		expect([G.ColorRed(), G.ColorGreen(), G.ColorBlue()]).toEqual([10, 20, 30]);
	});

	it('an unfilled Rect is a one pixel outline', () => {
		G.Color(255, 255, 255);
		G.Rect(10, 10, 5, 4, 0);
		expect(pix(10, 10)).toBe(0xffffff);
		expect(pix(14, 13)).toBe(0xffffff);
		expect(pix(11, 11)).toBe(0);
		expect(pix(13, 12)).toBe(0);
		expect(pix(15, 10)).toBe(0);
	});

	it('Line includes both end points and clips', () => {
		G.Color(1, 2, 3);
		G.Line(5, 5, 9, 5);
		expect(pix(4, 5)).toBe(0);
		expect(pix(5, 5)).toBe(0x010203);
		expect(pix(9, 5)).toBe(0x010203);
		expect(pix(10, 5)).toBe(0);
		G.Line(-10, 40, 100, 40);
		expect(pix(0, 40)).toBe(0x010203);
		expect(pix(63, 40)).toBe(0x010203);
		G.Line(3, 3, 6, 6);
		expect(pix(4, 4)).toBe(0x010203);
		expect(pix(6, 6)).toBe(0x010203);
	});

	it('DrawImage skips the mask colour, DrawBlock does not; the default mask is black', () => {
		const img = solidImage(4, 4, 0xff00ff);
		G.WritePixelFast(1, 1, 0x00ff00, G.ImageBuffer(img));
		G.WritePixelFast(2, 2, 0x000000, G.ImageBuffer(img));
		G.ClsColor(50, 50, 50);
		G.Cls();
		G.DrawImage(img, 0, 0); // mask 0,0,0: magenta is drawn, black is not
		expect(pix(0, 0)).toBe(0xff00ff);
		expect(pix(2, 2)).toBe(0x323232);
		G.MaskImage(img, 255, 0, 255);
		G.Cls();
		G.DrawImage(img, 10, 10);
		expect(pix(10, 10)).toBe(0x323232);
		expect(pix(11, 11)).toBe(0x00ff00);
		expect(pix(12, 12)).toBe(0x000000);
		G.DrawBlock(img, 20, 10);
		expect(pix(20, 10)).toBe(0xff00ff);
	});

	it('handles offset the image; MidHandle uses integer halves', () => {
		const img = solidImage(5, 3, 0x112233);
		G.MidHandle(img);
		expect([G.ImageXHandle(img), G.ImageYHandle(img)]).toEqual([2, 1]);
		G.DrawBlock(img, 10, 10);
		expect(pix(8, 9)).toBe(0x112233);
		expect(pix(12, 11)).toBe(0x112233);
		expect(pix(7, 9)).toBe(0);
		expect(pix(13, 11)).toBe(0);
		G.HandleImage(img, 0, 0);
		G.DrawBlock(img, 62, 46); // clipped at the screen edge
		expect(pix(63, 47)).toBe(0x112233);
	});

	it('DrawImageRect draws a sub-rectangle at x,y', () => {
		const img = G.CreateImage(8, 8);
		const b = G.ImageBuffer(img);
		for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) G.WritePixelFast(x, y, 0x010000 * (x + 1) + (y + 1), b);
		G.DrawBlockRect(img, 20, 20, 2, 3, 3, 2);
		expect(pix(20, 20)).toBe(0x030004);
		expect(pix(22, 21)).toBe(0x050005);
		expect(pix(23, 20)).toBe(0);
		expect(pix(20, 22)).toBe(0);
		// a rect reaching past the image is cut to the image
		G.DrawBlockRect(img, 30, 30, 6, 6, 10, 10);
		expect(pix(31, 31)).toBe(0x080008);
		expect(pix(32, 30)).toBe(0);
	});

	it('Viewport clips, Origin offsets, SetBuffer resets both', () => {
		G.Viewport(10, 10, 5, 5);
		G.Color(255, 255, 255);
		G.Rect(0, 0, 64, 48, 1);
		expect(pix(9, 10)).toBe(0);
		expect(pix(10, 10)).toBe(0xffffff);
		expect(pix(14, 14)).toBe(0xffffff);
		expect(pix(15, 14)).toBe(0);
		G.SetBuffer(G.BackBuffer());
		G.ClsColor(0, 0, 0);
		G.Cls();
		G.Origin(5, 6);
		G.Plot(1, 1);
		expect(pix(6, 7)).toBe(0xffffff);
		G.SetBuffer(G.BackBuffer());
		G.Plot(1, 1);
		expect(pix(1, 1)).toBe(0xffffff);
	});

	it('TileBlock fills the viewport from the origin', () => {
		const img = G.CreateImage(3, 2);
		const b = G.ImageBuffer(img);
		for (let y = 0; y < 2; y++) for (let x = 0; x < 3; x++) G.WritePixelFast(x, y, 0x100000 * (x + 1) + y + 1, b);
		G.TileBlock(img);
		expect(pix(0, 0)).toBe(0x100001);
		expect(pix(3, 2)).toBe(0x100001);
		expect(pix(5, 3)).toBe(0x300002);
		expect(pix(63, 47)).toBe(0x100000 * ((63 % 3) + 1) + (47 % 2) + 1);
		G.TileBlock(img, 1, 0);
		expect(pix(1, 0)).toBe(0x100001);
		expect(pix(0, 0)).toBe(0x300001);
	});

	it('drawing into an ImageBuffer, GrabImage and CopyRect', () => {
		const img = G.CreateImage(8, 8);
		G.SetBuffer(G.ImageBuffer(img));
		G.Color(9, 9, 9);
		G.Rect(0, 0, 4, 4, 1);
		G.SetBuffer(G.BackBuffer());
		expect(pix(0, 0)).toBe(0);
		G.DrawBlock(img, 4, 4);
		expect(pix(4, 4)).toBe(0x090909);
		expect(pix(8, 8)).toBe(0);
		const grab = G.CreateImage(4, 4);
		G.GrabImage(grab, 6, 6);
		expect(G.ReadPixelFast(0, 0, G.ImageBuffer(grab)) & 0xffffff).toBe(0x090909);
		expect(G.ReadPixelFast(2, 2, G.ImageBuffer(grab)) & 0xffffff).toBe(0);
		G.CopyRect(4, 4, 4, 4, 40, 40);
		expect(pix(43, 43)).toBe(0x090909);
		expect(pix(44, 44)).toBe(0);
	});

	it('Flip shows the back buffer and keeps it; SceneRendered makes it transparent', () => {
		G.Color(7, 7, 7);
		G.Rect(0, 0, 64, 48, 1);
		expect(pix(1, 1, G.FrontBuffer())).toBe(0);
		G.Flip();
		expect(pix(1, 1, G.FrontBuffer())).toBe(0x070707);
		expect(pix(1, 1)).toBe(0x070707);
		G.SceneRendered();
		expect(G.BackBuffer().px[0] >>> 24).toBe(0);
		G.Plot(0, 0);
		expect(G.BackBuffer().px[0] >>> 24).toBe(0xff);
		// a grab of the scene keeps the "scene shows through" pixels unless a grabber is installed
		const grab = G.CreateImage(2, 1);
		G.GrabImage(grab, 0, 0);
		expect(G.ImageBuffer(grab).px[1] >>> 24).toBe(0);
		G.setSceneGrabber(() => new Uint32Array(64 * 48).fill(0xff332211));
		G.SceneRendered();
		G.GrabImage(grab, 0, 0);
		expect(G.ReadPixelFast(1, 0, G.ImageBuffer(grab)) & 0xffffff).toBe(0x112233);
		expect(G.ReadPixel(5, 5) & 0xffffff).toBe(0x112233);
		G.setSceneGrabber(null);
	});

	it('ResizeImage scales with bilinear filtering and keeps the mask', () => {
		const img = solidImage(2, 2, 0x808080);
		G.MaskImage(img, 255, 0, 255);
		G.ResizeImage(img, 4, 6);
		expect([G.ImageWidth(img), G.ImageHeight(img)]).toEqual([4, 6]);
		expect(G.ReadPixelFast(1, 2, G.ImageBuffer(img)) & 0xffffff).toBe(0x808080);
		expect(G.ImageBuffer(img).getMask() & 0xffffff).toBe(0xff00ff);
	});

	it('BMP round trip', () => {
		const img = G.CreateImage(3, 2);
		const b = G.ImageBuffer(img);
		G.WritePixelFast(0, 0, 0x123456, b);
		G.WritePixelFast(2, 1, 0xabcdef, b);
		const d = G.decodeBmp(G.encodeBmp(3, 2, b.px));
		expect([d.width, d.height]).toEqual([3, 2]);
		expect(d.px[0] >>> 0).toBe(G.argbToNative(0x123456));
		expect(d.px[5] >>> 0).toBe(G.argbToNative(0xabcdef));
	});
});

describe('text box logic (gui_tb.bb)', () => {
	beforeEach(() => {
		resetState();
	});

	it('insert, delete and backspace actions', () => {
		S.in_tb_col = 2;
		expect(TB.gui_tb_act_ins('abcd', 2, 'XY')).toBe('abXYcd');
		expect(S.in_tb_col).toBe(4);
		expect(TB.gui_tb_act_ins('abcd', 0, 'X')).toBe('Xabcd');
		expect(TB.gui_tb_act_ins('abcd', 9, 'X')).toBe('abcdX');
		expect(TB.gui_tb_act_del('abcd', 0)).toBe('bcd');
		expect(TB.gui_tb_act_del('abcd', 1)).toBe('acd');
		expect(TB.gui_tb_act_del('abcd', 3)).toBe('abc');
		expect(TB.gui_tb_act_del('abcd', 4)).toBe('abcd');
		S.in_tb_col = 3;
		expect(TB.gui_tb_act_bs('abcd', 3)).toBe('abd');
		expect(S.in_tb_col).toBe(2);
		expect(TB.gui_tb_act_bs('abcd', 0)).toBe('abcd');
		expect(TB.gui_tb_act_bs('abcd', 1)).toBe('bcd');
		expect(TB.gui_tb_act_bs('abcd', 4)).toBe('abc');
	});

	it('load/save strings split on the line separator', () => {
		TB.gui_tb_loadstring(`one${SEP_LINE}two${SEP_LINE}${SEP_LINE}four`, SEP_LINE);
		expect(S.Ttbt.map((r) => r.txt)).toEqual(['one', 'two', '', 'four']);
		expect(TB.gui_tb_savestring(SEP_LINE)).toBe(`one${SEP_LINE}two${SEP_LINE}${SEP_LINE}four${SEP_LINE}`);
		TB.gui_tb_resplit();
		expect(S.Ttbt.map((r) => r.txt)).toEqual(['one', 'two', '', 'four']);
		expect(TB.gui_tb_filled()).toBe(1);
		TB.gui_tb_clear(1);
		expect(S.Ttbt).toEqual([{ txt: '' }]);
		expect(TB.gui_tb_filled()).toBe(0);
	});

	it('Enter splits the row at the cursor', () => {
		TB.gui_tb_loadstring(`hello world${SEP_LINE}next`, SEP_LINE);
		S.in_tb_row = 0;
		S.in_tb_col = 5;
		TB.gui_tb_act_break();
		expect(S.Ttbt.map((r) => r.txt)).toEqual(['hello', ' world', 'next']);
		expect([S.in_tb_row, S.in_tb_col]).toEqual([1, 0]);
		TB.gui_tb_act_break(); // column 0: empty row inserted before, cursor row unchanged
		expect(S.Ttbt.map((r) => r.txt)).toEqual(['hello', '', ' world', 'next']);
		expect(S.in_tb_row).toBe(1);
		S.in_tb_row = 3;
		S.in_tb_col = 4;
		TB.gui_tb_act_break(); // end of row: empty row after
		expect(S.Ttbt.map((r) => r.txt)).toEqual(['hello', '', ' world', 'next', '']);
		expect(S.in_tb_row).toBe(4);
	});

	it('selection to string and replace, single row', () => {
		TB.gui_tb_loadstring(`abcdef${SEP_LINE}second`, SEP_LINE);
		S.in_ms_row = 0;
		S.in_me_row = 0;
		S.in_ms_col = 1;
		S.in_me_col = 4;
		expect(TB.gui_tb_tostrmarked()).toBe('bcd');
		TB.gui_tb_replacemarked('X');
		expect(S.Ttbt.map((r) => r.txt)).toEqual(['aXef', 'second']);
	});

	it('multi-row selection: original string and the original replace defect', () => {
		TB.gui_tb_loadstring(['abcdef', 'middle', 'uvwxyz', 'tail'].join(SEP_LINE), SEP_LINE);
		S.in_ms_row = 0;
		S.in_ms_col = 2;
		S.in_me_row = 2;
		S.in_me_col = 3;
		// start row from column 3, whole middle row, end row up to column 4 (Left(txt,me_col+1))
		expect(TB.gui_tb_tostrmarked()).toBe(['cdef', 'middle', 'uvwx'].join(SEP_LINE));
		expect(TB.gui_tb_tr1(`a   b${SEP_LINE}c`)).toBe('a\tb\r\nc');
		expect(TB.gui_tb_tr2('a\tb\r\nc')).toBe(`a   b${SEP_LINE}c`);
		TB.gui_tb_replacemarked('-');
		// start keeps ms_col+1 characters, and the merged row is appended at the end of the list
		expect(S.Ttbt.map((r) => r.txt)).toEqual(['tail', 'abc-xyz']);
	});

	it('gui_tb_insert and the script helper word detection', () => {
		TB.gui_tb_loadstring('if (ge', '');
		S.in_tb_row = 0;
		S.in_tb_col = 6;
		const saved = host.Tsc;
		host.Tsc = [
			{ cmd: 'getstored', groups: 'items', params: ' ("class", id)' },
			{ cmd: 'gt', groups: 'time', params: ' ()' }
		];
		TB.gui_tb_scripthelper('if (ge', 6, 100, 50);
		expect(S.in_sh_cmd).toBe('ge');
		expect(S.in_sh).toBe(0);
		TB.gui_tb_insert('tstored');
		expect(S.Ttbt[0].txt).toBe('if (getstored');
		expect(S.in_tb_col).toBe(13);
		TB.gui_tb_scripthelper(S.Ttbt[0].txt, 13, 100, 50);
		expect([S.in_sh, S.in_sh_txt, S.in_sh_x, S.in_sh_y]).toEqual([1, 'getstored ("class", id)', 120, 30]);
		TB.gui_tb_scripthelper('a', 1, 0, 0);
		expect(S.in_sh).toBe(0);
		host.Tsc = saved;
	});
});

describe('file host', () => {
	it('derives directories from a flat file list', () => {
		const fh = makeFileHost(['maps/a.s2', 'maps/adventure/b.s2', 'sys/gfx/x.bmp', 'readme.txt']);
		expect(fh.fileType('maps')).toBe(2);
		expect(fh.fileType('maps\\')).toBe(2);
		expect(fh.fileType('MAPS\\A.S2')).toBe(1);
		expect(fh.fileType('maps\\nope')).toBe(0);
		expect(fh.readDir('maps\\')).toEqual(['.', '..', 'a.s2', 'adventure']);
		expect(fh.readDir('')).toEqual(['.', '..', 'maps', 'readme.txt', 'sys']);
	});
});

describe('media list', () => {
	it('lists every non-2D global of load_media.bb', () => {
		const by = (g: string) => MEDIA_RESOURCES.filter((r) => r.global === g);
		expect(by('sfx_step').map((r) => r.path)).toEqual(['sfx\\step1.wav', 'sfx\\step2.wav', 'sfx\\step3.wav', 'sfx\\step4.wav']);
		expect(by('gfx_p_flare').map((r) => r.path)).toEqual(['sprites\\flare0_a.bmp', 'sprites\\flare1_a.bmp', 'sprites\\flare2_a.bmp']);
		expect(by('gfx_terstruc')[0]).toMatchObject({ kind: 'texture', flags: 768, scale: [2, 2], blend: 5 });
		expect(by('sfx_diary')[0].kind).toBe('music');
		expect(by('sfx_rain')[0].loop).toBe(true);
		expect(by('gfx_grasspread')[0]).toMatchObject({ kind: 'mesh', hide: true });
		expect(MEDIA_RESOURCES.filter((r) => r.kind === 'sound' || r.kind === 'music').length).toBe(85); // 66 load_res calls, 6 of them in loops of 4+4+4+5+5+3
	});
	it.skipIf(!have)('every listed file exists in the game data', () => {
		const missing = MEDIA_RESOURCES.filter((r) => !vfs.exists(r.path)).map((r) => r.path);
		// sfx/menu.wav is not shipped; load_res tolerates missing sounds.
		expect(missing).toEqual(['sfx\\menu.wav']);
	});
});

describe.skipIf(!have)('original game data', () => {
	const played: string[] = [];

	beforeAll(async () => {
		resetState();
		I.resetInput();
		I.setClock(() => 5000);
		G.Graphics(800, 600);
		G.setVfs(vfs);
		// No JPG decoder outside the browser: gfx\water.jpg becomes a flat image.
		G.setImageDecoder(async () => ({ width: 4, height: 4, px: new Uint32Array(16).fill(0xff804020) }));
		setHost({ play: (s) => void played.push(s) });
		await load_strings(vfs);
		await load_keynames(vfs);
		await B.load_bmpf(vfs);
		await load_media(vfs);
	});

	beforeEach(() => {
		played.length = 0;
		I.resetInput();
		const keep = [...S.in_keyname];
		resetState();
		S.in_keyname = keep;
		G.SetBuffer(G.BackBuffer());
		G.ClsColor(0, 0, 0);
		G.Cls();
	});

	it('parses the .bmpf files', async () => {
		const norm = B.parse_bmpf(await vfs.readBytes('sys/gfx/font_norm.bmpf'));
		expect([norm.frames, norm.framesx, norm.framesy]).toEqual([101, 16, 19]);
		expect(norm.glyphs.length).toBe(101);
		expect(norm.glyphs[0]).toEqual({ sign: 33, width: 6 }); // "!"
		expect(norm.glyphs[1]).toEqual({ sign: 34, width: 9 });
		expect(norm.glyphs[2]).toEqual({ sign: 35, width: 10 });
		expect(norm.glyphs[32]).toEqual({ sign: 65, width: 11 }); // "A"
		expect(norm.glyphs[54]).toEqual({ sign: 87, width: 16 }); // "W"
		expect(norm.glyphs[64]).toEqual({ sign: 97, width: 10 }); // "a"
		expect(norm.glyphs[72]).toEqual({ sign: 105, width: 6 }); // "i"
		expect(norm.glyphs[95]).toEqual({ sign: 228, width: 10 }); // "ä"
		// 94 printable ASCII glyphs and the seven German letters
		expect(norm.glyphs.slice(94).map((g) => g.sign)).toEqual([196, 228, 214, 246, 220, 252, 223]); // the order of the "ÄäÖöÜüß" literal
		const tiny = B.parse_bmpf(await vfs.readBytes('sys/gfx/font_tiny.bmpf'));
		expect([tiny.frames, tiny.framesx, tiny.framesy]).toEqual([256, 13, 16]);
		expect(tiny.glyphs.length).toBe(256);
	});

	it('installs the seven fonts with the right tables and images', () => {
		for (const id of [0, 1, 2, 3, 4, 6]) {
			expect([B.bmpf_frames[id], B.bmpf_framesx[id], B.bmpf_framesy[id]]).toEqual([101, 16, 19]);
			expect(B.bmpf_framesc[65][id]).toBe(32);
			expect(B.bmpf_framesw[65][id]).toBe(11);
		}
		expect([B.bmpf_frames[5], B.bmpf_framesx[5], B.bmpf_framesy[5]]).toEqual([256, 13, 16]);
		for (let id = 0; id <= 6; id++) {
			const img = B.bmpf_image[id];
			expect(img).not.toBe(0);
			if (!img) continue;
			expect(img.frames.length).toBe(B.bmpf_frames[id]);
			expect([G.ImageWidth(img), G.ImageHeight(img)]).toEqual([B.bmpf_framesx[id], B.bmpf_framesy[id]]);
			expect(img.frames[0].getMask() & 0xffffff).toBe(0xff00ff);
		}
		// a byte without a glyph has frame 0 and width 0 (it is drawn as frame 0 without advancing)
		expect([B.bmpf_framesc[1][0], B.bmpf_framesw[1][0]]).toEqual([0, 0]);
	});

	it('bmpf_len: glyph widths, half a frame for a space', () => {
		expect(B.bmpf_len('A')).toBe(11);
		expect(B.bmpf_len(' ')).toBe(8);
		expect(B.bmpf_len('A a')).toBe(11 + 8 + 10);
		expect(B.bmpf_len('Wi!')).toBe(16 + 6 + 6);
		expect(B.bmpf_len('')).toBe(0);
		expect(B.bmpf_len(' ', 5)).toBe(6); // 13/2
		expect(B.bmpf_len(42)).toBe(B.bmpf_len('42'));
	});

	it('bmpf_trim, including the space quirk', () => {
		expect(B.bmpf_trim('AAA', 0, 33)).toBe('AAA');
		expect(B.bmpf_trim('AAA', 0, 25)).toBe('AA');
		expect(B.bmpf_trim('AAA', 0, 5)).toBe('');
		expect(B.bmpf_trim('A', 0, 15)).toBe('A');
		// "A " is 19 wide. Removing the space ADDS 8 (27), so the A goes too (16) and then nothing is left.
		expect(B.bmpf_trim('A ', 0, 15)).toBe('');
	});

	it('bmpf_txt_pos and bmpf_txt_ml_len', () => {
		expect(B.bmpf_txt_pos('AAA', 0, 3)).toBe(0);
		expect(B.bmpf_txt_pos('AAA', 0, 5)).toBe(0); // 11-5=6 >= 5
		expect(B.bmpf_txt_pos('AAA', 0, 7)).toBe(1); // 6 < 7 <= 11
		expect(B.bmpf_txt_pos('AAA', 0, 17)).toBe(1); // 22-5=17
		expect(B.bmpf_txt_pos('AAA', 0, 18)).toBe(2);
		expect(B.bmpf_txt_pos('AAA', 0, 100)).toBe(3);
		expect(B.bmpf_txt_ml_len(0, 0, 'AAA', 0, 25)).toBe(22);
		expect(B.bmpf_txt_ml_len(10, 0, 'AAA', 0, 100)).toBe(33);
		expect(B.bmpf_txt_ml_len(0, 0, 'A A', 0, 25)).toBe(19); // the space is never the one that stops it
	});

	it('bmpf_txt_rect wraps at spaces, hyphens, forced breaks and mid-word', () => {
		expect([...B.bmpf_txt_rect_lines(40, 'AA AA AA')]).toEqual(['AA', 'AA', 'AA']);
		expect(S.tmp_lines).toBe(3);
		// "-" is 7 wide: AAA- is exactly 40 and fits; the next A overflows; the hyphen starts the next line
		expect(B.bmpf_framesw[45][0]).toBe(7);
		expect([...B.bmpf_txt_rect_lines(40, 'AAA-AAA')]).toEqual(['AAA', '-AAA']);
		// no break opportunity: break two characters back
		expect([...B.bmpf_txt_rect_lines(30, 'AAAAA')]).toEqual(['A', 'AA', 'AA']);
		expect([...B.bmpf_txt_rect_lines(100, `A${SEP_LINE}A`)]).toEqual(['A', 'A']);
		expect([...B.bmpf_txt_rect_lines(100, `A${SEP_LINE}${SEP_LINE}A`)]).toEqual(['A', '', 'A']);
		expect([...B.bmpf_txt_rect_lines(100, 'A ¶A')]).toEqual(['A ¶A']); // 182 only matters when the line overflows
		expect([...B.bmpf_txt_rect_lines(100, '')]).toEqual(['']);
		expect(S.tmp_lines).toBe(1);
	});

	it('bmpf_txt_rect replaces key names and script variables', () => {
		S.in_keys[Ckey_jump] = 57;
		expect([...B.bmpf_txt_rect_lines(700, 'Press $key_jump now')]).toEqual(['Press Space now']);
		const seen: string[] = [];
		setHost({
			var_rep: (t) => {
				seen.push(t);
				return t.replace('$x', '7');
			}
		});
		expect([...B.bmpf_txt_rect_lines(700, `a $x b${SEP_LINE}c $x`)]).toEqual(['a 7 b', 'c 7']);
		// var_rep gets the text from the "$" to the end of its line
		expect(seen).toEqual(['$x b', '$x']);
		setHost({ var_rep: (t) => t });
	});

	it('bmpf_txt_rect draws 20 pixel lines, honours scroll and reports overflow', () => {
		const txt = ['A', 'A', 'A', 'A'].join(SEP_LINE);
		// height 70: lines at y=0,20,40; after the third y=60 and 60+18>70 -> cut
		expect(B.bmpf_txt_rect(0, 0, 100, 70, txt)).toBe(0);
		expect(S.tmp_lines).toBe(4);
		expect(S.tmp_linesvisible).toBe(3);
		expect(B.bmpf_txt_rect(0, 0, 100, 200, txt)).toBe(1);
		expect(B.bmpf_txt_rect(0, 0, 100, 70, txt, 0, 2)).toBe(1);
		// a line "!3..." is drawn in font 3 without its two prefix characters
		G.Cls();
		B.bmpf_txt_rect(0, 0, 200, 100, '!3A');
		const a = G.BackBuffer().px.slice(0, 800 * 19);
		G.Cls();
		B.bmpf_txt(0, 0, 'A', 3);
		expect(G.BackBuffer().px.slice(0, 800 * 19)).toEqual(a);
	});

	it('draws glyphs from the font bitmap with magenta transparent', async () => {
		const bmp = G.decodeBmp(await vfs.readBytes('sys/gfx/font_norm.bmp'));
		expect([bmp.width, bmp.height]).toEqual([1616, 19]);
		G.ClsColor(1, 2, 3);
		G.Cls();
		B.bmpf_txt(100, 50, 'A');
		const frame = B.bmpf_framesc[65][0];
		let ink = 0;
		for (let y = 0; y < 19; y++) {
			for (let x = 0; x < 16; x++) {
				const src = G.nativeToArgb(bmp.px[y * 1616 + frame * 16 + x]) & 0xffffff;
				const expected = src === 0xff00ff ? 0x010203 : src;
				if (src !== 0xff00ff) ink++;
				expect(pix(100 + x, 50 + y)).toBe(expected);
			}
		}
		expect(ink).toBeGreaterThan(20);
		// right aligned and centred text end / centre where they should
		G.Cls();
		B.bmpf_txt_r(200, 0, 'AA');
		B.bmpf_txt(200 - 22, 30, 'AA');
		B.bmpf_txt_c(189, 60, 'AA'); // 189 - 22/2 = 178
		for (let y = 0; y < 19; y++) {
			for (let x = 170; x < 210; x++) {
				expect(pix(x, y)).toBe(pix(x, y + 30));
				expect(pix(x, y)).toBe(pix(x, y + 60));
			}
		}
	});

	it('load screen: centred text, grey track and bar', () => {
		B.bmpf_loadscreen('Loading Fonts', 50);
		const f = G.FrontBuffer();
		expect(pix(100, 305, f)).not.toBe(0); // bar: x 100..399 at 50%
		expect(pix(399, 309, f)).not.toBe(0x3c3c3c);
		expect(pix(400, 305, f)).toBe(0x3c3c3c); // track
		expect(pix(699, 309, f)).toBe(0x3c3c3c);
		expect(pix(700, 305, f)).toBe(0);
		expect(pix(99, 305, f)).toBe(0);
		expect(S.in_conlastloadmsg).toBe('Loading Fonts');
	});

	it('loads the 2D media with the original sizes, handles and masks', () => {
		const size = (i: G.ImageHandle) => [G.ImageWidth(i), G.ImageHeight(i)];
		expect(size(M.gfx_bigbutton[0])).toEqual([190, 45]);
		expect(size(M.gfx_iconbutton[1])).toEqual([32, 32]);
		expect(size(M.gfx_check[2])).toEqual([16, 16]);
		expect(M.gfx_icons && M.gfx_icons.frames.length).toBe(100);
		expect(M.gfx_icons_passive && M.gfx_icons_passive.frames.length).toBe(100);
		expect(size(M.gfx_icons)).toEqual([32, 32]);
		expect(size(M.gfx_border[3])).toEqual([800, 16]);
		expect(size(M.gfx_border[4])).toEqual([16, 600]);
		expect(size(M.gfx_sidebar)).toEqual([210, 600]);
		expect(size(M.gfx_win)).toEqual([580, 595]);
		expect(size(M.gfx_winbar)).toEqual([580, 16]);
		expect(M.gfx_bars && M.gfx_bars.frames.length).toBe(2);
		expect(size(M.gfx_bars)).toEqual([100, 5]);
		expect(M.gfx_states && M.gfx_states.frames.length).toBe(30);
		expect(M.gfx_arrows && M.gfx_arrows.frames.length).toBe(12);
		expect([G.ImageXHandle(M.gfx_arrows), G.ImageYHandle(M.gfx_arrows)]).toEqual([8, 8]);
		expect([G.ImageXHandle(M.gfx_cursor[5]), G.ImageYHandle(M.gfx_cursor[5])]).toEqual([3, 5]);
		const s2 = M.gfx_slider[2];
		expect(s2 && [s2.frames[0].handle_x, s2.frames[0].handle_y]).toEqual([
			Math.trunc(G.ImageWidth(s2) / 2),
			Math.trunc(G.ImageHeight(s2) / 2)
		]);
		expect([G.ImageXHandle(M.gfx_tutor), G.ImageYHandle(M.gfx_tutor)]).toEqual([1, G.ImageHeight(M.gfx_tutor)]);
		const masked = (i: G.ImageHandle) => (i ? i.frames[0].getMask() & 0xffffff : -1);
		expect(masked(M.gfx_bigbutton[0])).toBe(0xff00ff);
		expect(masked(M.gfx_icons_passive)).toBe(0xff00ff);
		expect(masked(M.gfx_bg[0])).toBe(0); // load_image(...,0)
		expect(masked(M.gfx_defaulticon)).toBe(0);
		// The magenta margins painted into gfx_win are covered again by the (fully opaque, 16 pixel)
		// border images drawn over them: right border at x 564..579, bottom border at y 579..594.
		const win = M.gfx_win ? M.gfx_win.frames[0] : undefined;
		const vert = M.gfx_border[2] ? M.gfx_border[2].frames[0] : undefined;
		const hori = M.gfx_border[1] ? M.gfx_border[1].frames[0] : undefined;
		const corn = M.gfx_border[0] ? M.gfx_border[0].frames[0] : undefined;
		const bg = M.gfx_bg[1] ? M.gfx_bg[1].frames[0] : undefined;
		expect([vert?.width, vert?.height, hori?.width, hori?.height]).toEqual([16, 250, 250, 16]);
		expect(win?.getPixelFast(574, 300)).toBe(vert?.getPixelFast(10, 50));
		expect(win?.getPixelFast(3, 300)).toBe(vert?.getPixelFast(3, 50));
		expect(win?.getPixelFast(300, 590)).toBe(hori?.getPixelFast(50, 11));
		expect(win?.getPixelFast(570, 585)).toBe(corn?.getPixelFast(6, 6));
		expect(win?.getPixelFast(300, 300)).toBe(bg?.getPixelFast(300 % bg!.width, 300 % bg!.height));
		expect(G.GraphicsBuffer()).toBe(G.BackBuffer());
		expect(sm(3)).toBe('Cancel');
		expect(S.in_keyname[57]).toBe('Space');
		expect(S.in_keyname[0]).toBe('-');
		expect(S.in_keyname[256]).toBe('Left Mousebutton');
	});

	it('reads the shipped key bindings', async () => {
		const c = parse_controls(await vfs.readBytes('sys/controls.cfg'));
		expect(c.keys.length).toBe(21);
		expect(c.keys.slice(0, 5)).toEqual([17, 31, 30, 32, 57]); // W S A D Space
		expect(c.keys.slice(6, 10)).toEqual([256, 257, 261, 262]); // mouse 1, mouse 2, wheel up, wheel down
		expect(c.msens).toBeCloseTo(0.2, 5);
		expect(c.minvert).toBe(1);
		expect(c.msmooth).toBe(0);
	});

	it('gui_button: hover image, click on release, sound, flush', () => {
		S.in_mx = 300;
		S.in_my = 300;
		expect(GUI.gui_button(10, 10, 'Play')).toBe(0);
		const idle = G.BackBuffer().px.slice();
		S.in_mx = 10 + 190; // right edge is inclusive
		S.in_my = 10 + 45;
		expect(GUI.gui_button(10, 10, 'Play')).toBe(0);
		expect(G.BackBuffer().px).not.toEqual(idle);
		S.in_mrelease[1] = 1;
		expect(GUI.gui_button(10, 10, 'Play')).toBe(1);
		expect(played).toEqual(['sfx_click']);
		expect(S.in_mrelease[1]).toBe(0); // flushinput
		S.in_mx = 10 + 191;
		S.in_mrelease[1] = 1;
		expect(GUI.gui_button(10, 10, 'Play')).toBe(0);
		// passive: never clicks
		S.in_mx = 20;
		S.in_my = 20;
		expect(GUI.gui_button(10, 10, 'Play', 0)).toBe(0);
		expect(played).toEqual(['sfx_click']);
	});

	it('gui_ibutton: tooltip with hotkey name, hotkey press', () => {
		S.in_mx = 110;
		S.in_my = 110;
		expect(GUI.gui_ibutton(100, 100, 3, 'Cancel', 1, 0, 1)).toBe(0);
		expect(S.in_ttt).toBe('Cancel [Escape]');
		expect([S.in_ttx, S.in_tty]).toEqual([130, 115]);
		S.in_mx = 0;
		S.in_ttt = '';
		I.injectKeyDown(1, 27);
		expect(GUI.gui_ibutton(100, 100, 3, 'Cancel', 1, 0, 1)).toBe(1);
		expect(S.in_ttt).toBe('');
		expect(played).toEqual([]); // hotkeys are silent
		// tooltip flips to the left near the right screen edge and up near the bottom
		GUI.gui_tt(790, 590, 'Cancel');
		expect([S.in_ttx, S.in_tty]).toEqual([790 - 5 - B.bmpf_len('Cancel', 5), 575]);
	});

	it('gui_check and gui_opt', () => {
		S.in_mx = 55;
		S.in_my = 55;
		S.in_mrelease[1] = 1;
		expect(GUI.gui_check(50, 50, 'Fog', 3)).toBe(1);
		expect(S.in_check[3]).toBe(1);
		expect(played).toEqual(['sfx_switch']);
		expect(S.in_mrelease[1]).toBe(1); // no flush
		expect(GUI.gui_check(50, 50, 'Fog', 3)).toBe(1);
		expect(S.in_check[3]).toBe(0);
		expect(GUI.gui_opt(50, 50, 'Low', 2, 1)).toBe(1);
		expect(S.in_opt[1]).toBe(2);
		// the hit area includes the label
		S.in_mx = 50 + 16 + 3 + B.bmpf_len('Fog');
		expect(GUI.gui_check(50, 50, 'Fog', 3)).toBe(1);
		S.in_mx += 1;
		expect(GUI.gui_check(50, 50, 'Fog', 3)).toBe(0);
	});

	it('gui_slider: integer steps, focus while dragging', () => {
		S.in_mx = 100 + 37;
		S.in_my = 205;
		S.in_mdown[1] = 1;
		GUI.gui_slider(100, 200, 100, 0);
		expect(S.in_slider[0]).toBe(37);
		expect(S.in_slidefocus).toBe(0);
		// 10 steps: 100/10 = 10 pixels per step, truncated
		S.in_mx = 100 + 59;
		GUI.gui_slider(100, 300, 10, 1); // another slider elsewhere: not over it, no focus, unchanged
		expect(S.in_slider[1]).toBe(0);
		GUI.gui_slider(100, 200, 10, 1); // button down over it: takes the focus
		expect(S.in_slider[1]).toBe(5);
		expect(S.in_slidefocus).toBe(1);
		// dragging outside keeps updating and clamps
		S.in_mx = 500;
		S.in_my = 0;
		GUI.gui_slider(100, 200, 10, 1);
		expect(S.in_slider[1]).toBe(10);
		S.in_mx = 0;
		GUI.gui_slider(100, 200, 10, 1);
		expect(S.in_slider[1]).toBe(0);
	});

	it('gui_input: focus, typing, width limit, backspace, delete', () => {
		S.in_mx = 110;
		S.in_my = 110;
		S.in_mrelease[1] = 1;
		GUI.gui_input(100, 100, 40, 2);
		expect(S.in_inputfocus).toBe(2);
		expect(S.in_cursorf).toBe(5);
		S.in_mrelease[1] = 0;
		const type = (key: number) => {
			S.in_key = key;
			GUI.gui_input(100, 100, 40, 2);
		};
		type(65);
		type(65);
		type(65);
		expect(S.in_input[2]).toBe('AAA'); // 33 <= 37
		type(65);
		expect(S.in_input[2]).toBe('AAA'); // 44 > 40-3: rejected
		type(8);
		expect(S.in_input[2]).toBe('AA');
		type(228);
		expect(S.in_input[2]).toBe('AAä');
		type(4);
		expect(S.in_input[2]).toBe('');
		type(200);
		expect(S.in_input[2]).toBe('');
		// clipboard
		type(72);
		type(105);
		I.injectKeyDown(29, 0);
		I.injectKeyDown(46, 3);
		type(3);
		I.injectKeyDown(45, 24);
		type(24);
		expect(S.in_input[2]).toBe('');
		I.injectKeyDown(47, 22);
		type(22);
		expect(S.in_input[2]).toBe('Hi');
	});

	it('gui_inputstr trims to a pixel length', () => {
		S.in_key = 65;
		expect(GUI.gui_inputstr('AA', 30)).toBe('AA');
		expect(GUI.gui_inputstr('A', 30)).toBe('AA');
		S.in_key = 8;
		expect(GUI.gui_inputstr('AB')).toBe('A');
		S.in_key = 4;
		expect(GUI.gui_inputstr('AB')).toBe('');
	});

	it('gui_colorbox, gui_iconbox, gui_ttb return 1 or 2 by button', () => {
		S.in_mx = 12;
		S.in_my = 12;
		expect(GUI.gui_colorbox(100, 150, 200, 10, 10, 20, 10, 'c')).toBe(0);
		expect(pix(11, 11)).toBe(0x6496c8);
		expect(pix(10, 10)).toBe(0xb4e6ff); // +80, clamped
		expect(pix(29, 19)).toBe(0x000014); // -180, clamped
		expect(S.in_ttt).toBe('c');
		S.in_mrelease[2] = 1;
		expect(GUI.gui_colorbox(100, 150, 200, 10, 10, 20, 10)).toBe(2);
		S.in_mrelease[1] = 1;
		expect(GUI.gui_iconbox(0, 0, 0, 'item', 1)).toBe(1);
		expect(played).toEqual(['sfx_switch', 'sfx_switch']);
		S.in_mrelease[2] = 1;
		played.length = 0;
		expect(GUI.gui_ttb(5, 5, ' A ')).toBe(2);
		expect(played).toEqual([]);
		S.in_mrelease[1] = 1;
		expect(GUI.gui_ttb(5, 5, ' A ')).toBe(1);
		expect(played).toEqual(['sfx_click']);
	});

	it('gui_healthbar: width from percent, value under the mouse while held', () => {
		S.in_mx = 500;
		S.in_my = 500;
		expect(GUI.gui_healthbar(100, 100, 50, 200)).toBe(-1);
		// 25%: bar pixels at x 101..125, background from 126
		const bar = M.gfx_bars ? M.gfx_bars.frames[0] : undefined;
		expect(pix(101 + 24, 101)).toBe(bar ? bar.getPixelFast(24, 0) & 0xffffff : -1);
		const back = M.gfx_if_barback ? M.gfx_if_barback.frames[0] : undefined;
		expect(pix(101 + 25, 101)).toBe(back ? back.getPixelFast(26, 1) & 0xffffff : -1);
		S.in_mx = 100 + 30;
		S.in_my = 102;
		S.in_mdown[1] = 1;
		expect(GUI.gui_healthbar(100, 100, 50, 200)).toBeCloseTo(60, 4);
		S.in_mx = 95; // within the 10 pixel margin: clamps to 0
		expect(GUI.gui_healthbar(100, 100, 50, 200)).toBe(0);
		expect(S.in_ttt).toBe(sm(6));
	});

	it('gui_operator cycles 0..5 with left and right clicks', () => {
		S.in_input[4] = '5';
		S.in_mx = 12;
		S.in_my = 12;
		S.in_mrelease[1] = 1;
		expect(GUI.gui_operator(10, 10, 4)).toBe(1);
		expect(S.in_input[4]).toBe('0');
		S.in_mrelease[2] = 1;
		expect(GUI.gui_operator(10, 10, 4)).toBe(2);
		expect(S.in_input[4]).toBe('5');
		S.in_mrelease[1] = 1;
		expect(GUI.gui_operator(10, 10, 4, 0)).toBe(0);
	});

	it('gui_scrollbar: slider geometry, click on the track, stick to slide', () => {
		S.in_mx = 700;
		S.in_my = 0;
		// fewer rows than fit: plain track, offset 0
		expect(GUI.gui_scrollbar(600, 100, 200, 5, 3, 10)).toBe(0);
		expect(S.tmp_slideend).toBe(0);
		// total 30, visible 10: range 21, slider height 200/21 = 9.5 -> 16 (minimum), travel 184
		expect(GUI.gui_scrollbar(600, 100, 200, 30, 4, 10)).toBe(4);
		expect(S.tmp_slideend).toBe(1);
		expect(GUI.gui_scrollbar(600, 100, 200, 30, 21, 10)).toBe(21);
		expect(S.tmp_slideend).toBe(0);
		// click on the track at y=100+100: yo=100-8=92 -> 92/184*21 = 10.5 -> 10 (round half to even)
		S.in_mx = 610;
		S.in_my = 200;
		S.in_mhit[1] = 1;
		expect(GUI.gui_scrollbar(600, 100, 200, 30, 0, 10)).toBe(10);
		expect(S.in_sticktoslide).toBe(0);
		// press on the slider itself (offset 0: slider at y 100..116): starts sticking
		S.in_my = 105;
		expect(GUI.gui_scrollbar(600, 100, 200, 30, 0, 10)).toBe(0);
		expect(S.in_sticktoslide).toBe(1);
		expect(S.in_mx).toBe(616);
		expect(S.in_my).toBe(108); // forced to the slider centre
		expect(S.in_cursorf).toBe(1);
		// next frame: getinput hides the x position while stuck, the bar follows y
		S.in_mhit[1] = 0;
		S.in_mx = -500;
		S.in_my = 100 + 8 + 92;
		expect(GUI.gui_scrollbar(600, 100, 200, 30, 0, 10)).toBe(10);
	});

	it('gui_dndwatch and gui_groupsel', () => {
		S.in_mx = 20;
		S.in_my = 20;
		expect(GUI.gui_dndwatch(0, 0)).toBe(0);
		S.in_mhit[1] = 1;
		expect(GUI.gui_dndwatch(0, 0)).toBe(1);
		expect(GUI.gui_dndwatch(100, 0)).toBe(0);
		expect(GUI.gui_groupsel(0, 0, 1)).toBe(1);
		S.in_edselgroup = 1;
		expect(GUI.gui_groupsel(0, 0, 1)).toBe(0);
	});

	it('gui_win_file_listdir filters and classifies entries; parentdir walks up', () => {
		setHost(makeFileHost(vfs.all()));
		expect(GUI.gui_win_file_listdir('sys/gfx')).toBe(1);
		expect(S.in_win_path).toBe('sys\\gfx\\');
		const names = S.Tfile.map((f) => f.name);
		expect(names).toContain('icons.bmp');
		expect(names).not.toContain('.');
		expect(S.Tfile.find((f) => f.name === 'icons.bmp')).toMatchObject({ typ: 1, icon: 54, path: 'sys\\gfx\\' });
		expect(S.Tfile.find((f) => f.name === 'font_norm.bmpf')?.icon).toBe(51);
		expect(GUI.gui_win_file_listdir('sys')).toBe(1);
		expect(S.Tfile.find((f) => f.name === 'gfx')).toMatchObject({ typ: 2, icon: 9 });
		expect(GUI.gui_win_file_listdir('maps')).toBe(1);
		expect(S.Tfile.find((f) => f.name.endsWith('.s2'))?.icon).toBe(55);
		expect(GUI.gui_win_file_listdir('nonexistent')).toBe(0);
		expect(S.in_win_path).toBe('maps\\');
		GUI.gui_win_file_listdir('sys\\gfx');
		GUI.gui_win_file_parentdir();
		expect(S.in_win_path).toBe('sys\\');
		GUI.gui_win_file_parentdir(); // no further backslash: drive list
		expect(S.in_win_path).toBe('');
		expect(S.Tfile.map((f) => f.name)).toEqual(['A:']);
	});

	it('modal windows run as async loops: gui_msgdecide', async () => {
		let frames = 0;
		setHost({
			frame: async () => {
				frames++;
				if (frames === 3) I.injectKeyDown(28, 13); // Enter = okay hotkey
			}
		});
		expect(await GUI.gui_msgdecide('Really quit?')).toBe(1);
		expect(frames).toBe(3);
		frames = 0;
		setHost({
			frame: async () => {
				frames++;
				if (frames === 2) I.injectKeyDown(1, 27);
			}
		});
		expect(await GUI.gui_msgdecide('Really quit?')).toBe(0);
		// gui_msginput: type, then Enter
		const keys = [
			[35, 72],
			[23, 105],
			[28, 13]
		];
		setHost({
			frame: async () => {
				const k = keys.shift();
				if (k) I.injectKeyDown(k[0], k[1]);
			}
		});
		S.in_inputfocus = 9;
		expect(await GUI.gui_msginput('Name?')).toBe('Hi');
	});

	it('text box: typing, joining rows and drawing with a selection', () => {
		TB.gui_tb_loadstring(`ab${SEP_LINE}cd`, SEP_LINE);
		S.in_inputfocus = 1337;
		S.in_mx = -100;
		S.in_my = -100;
		const frame = (key = 0) => {
			S.in_key = key;
			TB.gui_tb(10, 10, 300, 5, 1, 0);
		};
		S.in_tb_row = 1;
		S.in_tb_col = 0;
		frame(120); // "x"
		expect(S.Ttbt.map((r) => r.txt)).toEqual(['ab', 'xcd']);
		expect(S.in_tb_col).toBe(1);
		frame(8);
		expect(S.Ttbt.map((r) => r.txt)).toEqual(['ab', 'cd']);
		frame(8); // at column 0: join onto the previous row, cursor to the end of the joined row
		expect(S.Ttbt.map((r) => r.txt)).toEqual(['abcd']);
		expect([S.in_tb_row, S.in_tb_col]).toEqual([0, 4]);
		frame(13);
		expect(S.Ttbt.map((r) => r.txt)).toEqual(['abcd', '']);
		expect([S.in_tb_row, S.in_tb_col]).toEqual([1, 0]);
		frame(9);
		expect(S.Ttbt[1].txt).toBe('   ');
		I.injectKeyDown(200, 28); // cursor up
		frame(28);
		expect(S.in_tb_row).toBe(0);
		expect(S.in_tb_col).toBe(3); // column carried over, clamped to the row length on the way
		// mouse: press on row 0, drag, release on row 1 -> selection
		S.in_mx = 12;
		S.in_my = 12;
		S.in_mhit[1] = 1;
		S.in_mdown[1] = 1;
		frame();
		expect([S.in_mark, S.in_ms_row, S.in_ms_col]).toEqual([1, 0, 0]);
		S.in_mhit[1] = 0;
		S.in_mx = 12 + B.bmpf_len('ab', 5) + 1;
		frame();
		S.in_mdown[1] = 0;
		S.in_mrelease[1] = 1;
		frame();
		expect([S.in_mark, S.in_ms_col, S.in_me_col, S.in_me_row]).toEqual([2, 0, 2, 0]);
		S.in_mrelease[1] = 0;
		expect(TB.gui_tb_tostrmarked()).toBe('ab');
		// the selection is drawn with the brown marker colour behind the text
		frame();
		expect(pix(12, 12)).toBe(0x543300);
		frame(88); // typing replaces the selection
		expect(S.Ttbt[0].txt).toBe('Xcd');
		expect(S.in_mark).toBe(0);
	});
});
