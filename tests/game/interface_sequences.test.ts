/**
 * game_sequences.bb. Expected values are derived from the original source.
 */
import { existsSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreatePivot, EntityPitch, EntityX, EntityY, EntityYaw, EntityZ, MoveEntity, PositionEntity, RotateEntity } from '../../src/lib/s2/bb3d';
import { f32 } from '../../src/lib/s2/blitz';
import * as consoleMod from '../../src/lib/s2/game/console';
import { Cbmpf_red, Cclass_info, Cclass_object, Cmenu_if_movie, Cp_flash, Csection_game_sp } from '../../src/lib/s2/game/consts';
import { seq_addevent, seq_blend, seq_cammovement, seq_camrotation, seq_end, seq_start, seq_update } from '../../src/lib/s2/game/game_sequences';
import * as handle_infos from '../../src/lib/s2/game/handle_infos';
import * as parentchild from '../../src/lib/s2/game/parentchild';
import * as particles from '../../src/lib/s2/game/particles';
import { RT } from '../../src/lib/s2/game/rt';
import { G } from '../../src/lib/s2/game/state';
import { After, First, New, Tinfo, Tp, Tseq, Tx } from '../../src/lib/s2/game/types';
import { BackBuffer, Color, ReadPixelFast, Rect, SetBuffer } from '../../src/lib/s2/gfx2d';
import * as bmpf from '../../src/lib/s2/ui/bmpf';
import { MOD, clock, mkPlayer, setup, teardown } from './interface_setup';

function seqs(): Tseq[] {
	const out: Tseq[] = [];
	for (let q = First(Tseq); q !== null; q = After(Tseq, q)) out.push(q);
	return out;
}

/** The script parameters after the command name: param() takes the next one, parse_comma() says whether one is left. */
function scriptParams(...list: string[]) {
	const q = [...list];
	return {
		q,
		param: vi.spyOn(RT.script, 'param').mockImplementation(() => q.shift() ?? ''),
		params: vi.spyOn(RT.script, 'params').mockImplementation(() => q.shift() ?? ''),
		parse_comma: vi.spyOn(RT.script, 'parse_comma').mockImplementation(() => (q.length > 0 ? 1 : 0)),
		parse_param: vi.spyOn(RT.script, 'parse_param').mockImplementation(() => (q.length > 0 ? 1 : 0))
	};
}

function ev(event: string, t: number): Tseq {
	const q = New(Tseq);
	q.event = event;
	q.t = t;
	return q;
}

const px = (x: number, y: number) => ReadPixelFast(x, y, BackBuffer()) & 0xffffff;

describe.skipIf(!existsSync(MOD))('game_sequences.bb', () => {
	beforeEach(async () => {
		await setup();
		G.seq_cpoint_p = CreatePivot(); // e_clear creates it in the game
	});
	afterEach(teardown);

	describe('seq_blend', () => {
		it('opens the bars by 2 per frame unit up to 80 and draws them', () => {
			SetBuffer(BackBuffer());
			Color(255, 255, 255);
			Rect(0, 0, 800, 600, 1);
			G.seq_blend = 1;
			G.seq_blendp = 77;
			G.f = 1;
			seq_blend();
			expect(G.seq_blendp).toBe(79);
			seq_blend();
			expect(G.seq_blendp).toBe(80); // 81 clamped
			expect(px(10, 79)).toBe(0);
			expect(px(10, 80)).toBe(0xffffff);
			expect(px(10, 519)).toBe(0xffffff);
			expect(px(10, 520)).toBe(0);
			seq_blend();
			expect(G.seq_blendp).toBe(80);
		});

		it('the tests use the rounded position: 79.5 counts as open, 1.5 closes below 0', () => {
			G.seq_blend = 1;
			G.seq_blendp = 79.5;
			G.f = 1;
			seq_blend();
			expect(G.seq_blendp).toBe(79.5); // Int(79.5)=80
			G.seq_blend = 0;
			G.seq_blendp = 1.5;
			seq_blend();
			expect(G.seq_blendp).toBe(-0.5); // Int(1.5)=2 > 0
			seq_blend();
			expect(G.seq_blendp).toBe(-0.5);
		});

		it('cls mode clears in the sequence colour; messages only in the movie menu of a single player game', () => {
			SetBuffer(BackBuffer());
			G.seq_cls = 1;
			G.seq_cls_r = 10;
			G.seq_cls_g = 20;
			G.seq_cls_b = 30;
			G.seq_msg[0][0] = 'bottom';
			G.seq_msg[0][1] = '4';
			G.seq_msg[1][0] = 'top';
			G.seq_msg[2][0] = 'middle';
			G.seq_msg[2][1] = '1';
			const c = vi.spyOn(bmpf, 'bmpf_txt_c').mockImplementation(() => {});
			seq_blend();
			expect(px(400, 300)).toBe(0x0a141e);
			expect(c).not.toHaveBeenCalled();
			G.m_section = Csection_game_sp;
			G.m_menu = Cmenu_if_movie;
			seq_blend();
			expect(c.mock.calls).toEqual([
				[400, 550, 'bottom', 4],
				[400, 30, 'top', 0],
				[400, 290, 'middle', 1]
			]);
		});
	});

	describe('seq_start / seq_end', () => {
		it('resets the sequence state, starts the clock and enters the movie menu', () => {
			scriptParams();
			const kill = vi.spyOn(particles, 'p_kill2d').mockImplementation(() => {});
			ev('msg', 5);
			G.seq_msg[1][0] = 'old';
			G.seq_cpoint = 2;
			G.seq_tmod = 5;
			G.seq_tabs = 0;
			G.seq_tlast = 99;
			G.seq_cls = 1;
			G.seq_hideplayer = 0;
			G.seq_flw_class = 3;
			G.seq_skipable = 1;
			G.m_section = Csection_game_sp;
			G.set_debug = 1;
			clock.now = 4242;
			seq_start();
			expect(seqs()).toHaveLength(0);
			expect(kill).toHaveBeenCalledOnce();
			expect([G.seq_blend, G.seq_skipable, G.seq_cpoint, G.seq_tmod, G.seq_tabs, G.seq_tlast, G.seq_cls, G.seq_hideplayer, G.seq_flw_class]).toEqual([
				1, 0, 0, 1, 1, 0, 0, 1, 0
			]);
			expect(G.seq_msg).toEqual([
				['', ''],
				['', ''],
				['', '']
			]);
			expect(G.m_menu).toBe(Cmenu_if_movie);
			expect(G.seq_start).toBe(4242);
			expect(G.set_debug_seq).toBe(1);
		});

		it('parameters: blend mode and skipable (only 1 counts); outside a single player game the menu stays', () => {
			vi.spyOn(particles, 'p_kill2d').mockImplementation(() => {});
			scriptParams('0', '1');
			G.m_menu = 7;
			seq_start();
			expect([G.seq_blend, G.seq_skipable]).toEqual([0, 1]);
			expect(G.m_menu).toBe(7);
			expect(G.set_debug_seq).toBe(0);
			scriptParams('1', '5');
			seq_start();
			expect([G.seq_blend, G.seq_skipable]).toEqual([1, 0]);
		});

		it('seq_end leaves the movie menu only', () => {
			G.seq_blend = 1;
			G.seq_cls = 1;
			G.m_menu = 2;
			seq_end();
			expect([G.m_menu, G.seq_blend, G.seq_cls]).toEqual([2, 0, 0]);
			G.m_menu = Cmenu_if_movie;
			seq_end();
			expect(G.m_menu).toBe(0);
		});
	});

	describe('seq_addevent', () => {
		it('absolute time is scaled by the time modifier, relative time adds to the last event', () => {
			scriptParams('1000', 'Hi', '3', '1');
			G.seq_tabs = 1;
			G.seq_tmod = 2;
			seq_addevent('msg');
			scriptParams('500');
			G.seq_tabs = 0;
			G.seq_tmod = 1;
			seq_addevent('end');
			const l = seqs();
			expect([l[0].t, l[0].event, l[0].txt[0], l[0].in[0], l[0].in[1]]).toEqual([2000, 'msg', 'Hi', 3, 1]);
			expect([l[1].t, l[1].event]).toEqual([2500, 'end']);
			expect(G.seq_tlast).toBe(2500);
		});

		it('defaults of msgclear, sound, flash, fade, cls', () => {
			G.seq_tabs = 1;
			G.seq_tmod = 1;
			scriptParams('0');
			seq_addevent('msgclear');
			scriptParams('0', 'a.wav');
			seq_addevent('sound');
			scriptParams('0');
			seq_addevent('flash');
			scriptParams('10', '900', '1', '2');
			seq_addevent('fade');
			scriptParams('0', '1', '9');
			seq_addevent('cls');
			scriptParams('0', 'b.wav', '0.5', '-1', '2000');
			seq_addevent('sound');
			const l = seqs();
			expect(l[0].in[0]).toBe(-1);
			expect([l[1].txt[0], l[1].fl[0], l[1].fl[1], l[1].in[0]]).toEqual(['a.wav', 1, 0, 0]);
			expect(l[2].in.slice(0, 3)).toEqual([255, 255, 255]);
			expect([l[2].fl[0], l[2].fl[1]]).toEqual([f32(0.05), f32(1.1)]);
			expect([l[3].t, ...l[3].in.slice(0, 5)]).toEqual([10, 900, 1, 2, 255, 0]);
			expect(l[4].in.slice(0, 4)).toEqual([1, 9, 0, 0]);
			expect([l[5].fl[0], l[5].fl[1], l[5].in[0]]).toEqual([0.5, -1, 2000]);
		});

		it('campath becomes a chain of movecam events with a fixed step', () => {
			G.seq_tabs = 1;
			G.seq_tmod = 1;
			scriptParams('100', '50', '7', '8', '9');
			seq_addevent('campath');
			expect(seqs().map((q) => [q.event, q.t, q.in[0], q.in[1]])).toEqual([
				['movecam', 100, 150, 7],
				['movecam', 150, 200, 8],
				['movecam', 200, 250, 9]
			]);
		});

		it('timedcampath: each further point brings its own duration', () => {
			G.seq_tabs = 1;
			G.seq_tmod = 1;
			scriptParams('0', '100', '1', '200', '2', '300', '3');
			seq_addevent('timedcampath');
			expect(seqs().map((q) => [q.event, q.t, q.in[0], q.in[1]])).toEqual([
				['movecam', 0, 100, 1],
				['movecam', 100, 300, 2],
				['movecam', 300, 600, 3]
			]);
		});

		it('script: the text comes from an info with that id, or from a file; a missing source is a script error', () => {
			G.seq_tabs = 1;
			G.seq_tmod = 1;
			const other = New(Tx);
			other.parent_class = Cclass_object;
			other.parent_id = 12;
			other.value = 'wrong';
			const tx = New(Tx);
			tx.parent_class = Cclass_info;
			tx.parent_id = 12;
			tx.value = 'msg "x";';
			const err = vi.spyOn(RT.script, 'parse_error').mockReturnValue(0);
			const load = vi.spyOn(RT.script, 'parse_loadscript').mockReturnValue('from file');
			scriptParams('0', '12');
			seq_addevent('script');
			scriptParams('0', '13');
			seq_addevent('script');
			scriptParams('0', 'sys\\x.s2s');
			seq_addevent('script');
			const l = seqs();
			expect(l[0].txt[0]).toBe('msg "x";');
			expect(l[1].txt[0]).toBe('0');
			expect(err).toHaveBeenCalledOnce();
			expect(err).toHaveBeenCalledWith('txtsource', '13');
			expect(load).toHaveBeenCalledWith('sys\\x.s2s');
			expect(l[2].txt[0]).toBe('from file');
		});

		it('cammode / camfollow / event: a class of -1 means the object the script runs at', () => {
			G.seq_tabs = 1;
			G.seq_tmod = 1;
			G.p_env_class = 4;
			G.p_env_id = 77;
			const getclass = vi.spyOn(RT.script, 'parse_getclass').mockReturnValue(-1);
			scriptParams('0', '1', 'self');
			seq_addevent('cammode');
			getclass.mockReturnValue(2);
			scriptParams('0', '1', 'unit', '5');
			seq_addevent('cammode');
			scriptParams('0', 'unit', '5', '1.5', '2', '-3');
			seq_addevent('camfollow');
			scriptParams('0', '0');
			seq_addevent('camfollow');
			scriptParams('0', 'use', 'unit', '9');
			seq_addevent('event');
			scriptParams('0', 'start');
			seq_addevent('event');
			const l = seqs();
			expect(l[0].in.slice(0, 3)).toEqual([1, 4, 77]);
			expect(l[1].in.slice(0, 3)).toEqual([1, 2, 5]);
			expect([l[2].in[0], l[2].in[1], l[2].fl[0], l[2].fl[1], l[2].fl[2]]).toEqual([2, 5, 1.5, 2, -3]);
			expect(l[3].in[0]).toBe(0);
			expect([l[4].txt[0], l[4].in[0], l[4].in[1]]).toEqual(['use', 2, 9]);
			expect([l[5].txt[0], l[5].in[0]]).toEqual(['start', 0]);
		});

		it('an unknown event is reported, the event stays in the list', () => {
			const con_add = vi.spyOn(consoleMod, 'con_add').mockImplementation(() => {});
			scriptParams('0');
			seq_addevent('nonsense');
			expect(con_add).toHaveBeenCalledWith("INTERNAL ERROR: invalid event 'nonsense' for seq_addevent", Cbmpf_red);
			expect(seqs()).toHaveLength(1);
		});
	});

	describe('seq_update', () => {
		beforeEach(() => {
			const u = mkPlayer();
			u.mh = CreatePivot();
			G.seq_cpoint = 3; // no camera rotation
			G.seq_start = 1000;
			vi.spyOn(consoleMod, 'con_add').mockImplementation(() => {});
		});

		it('runs every event whose time has come (time is 1 ms ahead) and deletes it', () => {
			const gevent = vi.spyOn(RT.script, 'parse_globalevent').mockImplementation(() => {});
			const emu = vi.spyOn(RT.script, 'parse_emuevent').mockImplementation(() => {});
			const task = vi.spyOn(RT.script, 'parse_task').mockImplementation(() => {});
			const play = vi.spyOn(RT.audio, 'sfx_play').mockReturnValue(0);
			let q = ev('msg', 0);
			q.txt[0] = 'Hello';
			q.in[0] = 4;
			q.in[1] = 2;
			q = ev('cls', 0);
			q.in = [1, 10, 20, 30, 0, 0];
			q = ev('bar', 100);
			q.in[0] = 0;
			q = ev('event', 100);
			q.txt[0] = 'go';
			q = ev('event', 100);
			q.txt[0] = 'use';
			q.in[0] = 2;
			q.in[1] = 9;
			q = ev('script', 100);
			q.txt[0] = 'S';
			q = ev('sound', 100);
			q.txt[0] = 'a.wav';
			q.fl[0] = 0.5;
			q.fl[1] = 0;
			q.in[0] = 2000;
			q = ev('hideplayer', 100);
			q.in[0] = 0;
			ev('end', 101);
			G.seq_blend = 1;
			G.m_menu = Cmenu_if_movie;
			clock.now = 1099; // time = 100
			seq_update();
			expect(G.seq_msg[2]).toEqual(['Hello', '4']);
			expect([G.seq_cls, G.seq_cls_r, G.seq_cls_g, G.seq_cls_b]).toEqual([1, 10, 20, 30]);
			expect(seqs().map((x) => x.event)).toEqual(['bar', 'event', 'event', 'script', 'sound', 'hideplayer', 'end']);
			expect(G.seq_blend).toBe(1);
			clock.now = 1100; // time = 101 > 100
			seq_update();
			expect(G.seq_blend).toBe(0);
			expect(gevent).toHaveBeenCalledWith('go', 'performed by seqevent');
			expect(emu).toHaveBeenCalledWith(2, 9, 'use');
			expect(task).toHaveBeenCalledWith(0, 0, 'sequence', 'triggered by seqscript command', 'S');
			expect(play).toHaveBeenCalledWith('a.wav', 0.5, 0, 2000);
			expect(G.seq_hideplayer).toBe(0);
			expect(seqs().map((x) => x.event)).toEqual(['end']);
			expect(G.m_menu).toBe(Cmenu_if_movie);
			clock.now = 1101;
			seq_update();
			expect(seqs()).toHaveLength(0);
			expect(G.m_menu).toBe(0);
			expect(G.seq_cls).toBe(0);
		});

		it('msgclear, hidebar, showbar', () => {
			G.seq_msg[0][0] = 'a';
			G.seq_msg[1][0] = 'b';
			G.seq_msg[2][0] = 'c';
			let q = ev('msgclear', 0);
			q.in[0] = 1;
			ev('showbar', 0);
			clock.now = 1000;
			seq_update();
			expect(G.seq_msg.map((m) => m[0])).toEqual(['a', '', 'c']);
			expect([G.seq_blend, G.seq_blendp]).toEqual([1, 80]);
			q = ev('msgclear', 0);
			q.in[0] = -1;
			ev('hidebar', 0);
			seq_update();
			expect(G.seq_msg.map((m) => m[0])).toEqual(['', '', '']);
			expect([G.seq_blend, G.seq_blendp]).toEqual([0, 0]);
		});

		it('setcam puts the camera on the info and forgets a running movement', () => {
			const info = New(Tinfo);
			info.id = 5;
			info.h = CreatePivot();
			PositionEntity(info.h, 10, 500, 30);
			RotateEntity(info.h, 10, 45, 0);
			const con_info = vi.spyOn(handle_infos, 'con_info').mockImplementation((id: number) => {
				if (id !== 5) return 0;
				G.TCinfo = info;
				return 1;
			});
			G.seq_cstart = CreatePivot();
			G.seq_cend = CreatePivot();
			G.seq_cendt = 100000;
			let q = ev('setcam', 0);
			q.in[0] = 5;
			clock.now = 1000;
			seq_update();
			expect(con_info).toHaveBeenCalledWith(5);
			expect([EntityX(G.cam), EntityY(G.cam), EntityZ(G.cam)]).toEqual([10, 500, 30]);
			expect(EntityPitch(G.cam)).toBeCloseTo(10, 3);
			expect(EntityYaw(G.cam)).toBeCloseTo(45, 3);
			expect([G.seq_cstart, G.seq_cend]).toEqual([null, null]);
			// the look-at pivot is far ahead of the camera
			MoveEntity(G.cam, 0, 0, 100000);
			expect(EntityX(G.seq_cpoint_p)).toBeCloseTo(EntityX(G.cam), -1);
			// unknown info: an error line
			q = ev('setcam', 0);
			q.in[0] = 6;
			seq_update();
			expect(consoleMod.con_add).toHaveBeenLastCalledWith('ERROR: setcam @ 0 ms - info 6 does not exist', Cbmpf_red);
		});

		it('movecam moves from the current camera position to the info until its end time', () => {
			const info = New(Tinfo);
			info.id = 5;
			info.h = CreatePivot();
			PositionEntity(info.h, 100, 700, 0);
			vi.spyOn(handle_infos, 'con_info').mockImplementation(() => {
				G.TCinfo = info;
				return 1;
			});
			PositionEntity(G.cam, 0, 500, 0);
			const q = ev('movecam', 0);
			q.in[0] = 1000;
			q.in[1] = 5;
			clock.now = 1000;
			seq_update();
			expect([G.seq_cstartt, G.seq_cendt]).toEqual([0, 1000]);
			expect(G.seq_cstart).not.toBeNull();
			clock.now = 1500;
			seq_update();
			expect([EntityX(G.cam), EntityY(G.cam), EntityZ(G.cam)]).toEqual([50, 600, 0]);
			clock.now = 2500;
			seq_update();
			expect([EntityX(G.cam), EntityY(G.cam), EntityZ(G.cam)]).toEqual([100, 700, 0]);
			expect([G.seq_cstart, G.seq_cend]).toEqual([null, null]);
		});

		it('flash and fade create their particle and set it up; an unknown event is reported', () => {
			const tp = New(Tp);
			tp.h = CreatePivot();
			const p_add = vi.spyOn(particles, 'p_add').mockImplementation(() => {
				G.TCp = tp;
			});
			let q = ev('flash', 0);
			q.in = [1, 2, 3, 0, 0, 0];
			q.fl[0] = 0.25;
			q.fl[1] = 0.5;
			q = ev('fade', 7);
			q.in = [900, 1, 2, 3, 2, 0];
			ev('bogus', 7);
			clock.now = 1050;
			seq_update();
			expect(p_add.mock.calls[0]).toEqual([0, 0, 0, Cp_flash, 0.25, 0.5]);
			expect([tp.x, tp.y, tp.fx]).toEqual([7, 900, 2]);
			expect(consoleMod.con_add).toHaveBeenLastCalledWith("INTERNAL ERROR: invalid event 'bogus' for seq_update", Cbmpf_red);
			expect(seqs()).toHaveLength(0);
		});

		it('shows or hides the player model', () => {
			const mh = G.g_cplayer!.mh as unknown as { obj: { visible: boolean } };
			G.seq_hideplayer = 1;
			seq_update();
			expect(mh.obj.visible).toBe(false);
			G.seq_hideplayer = 0;
			seq_update();
			expect(mh.obj.visible).toBe(true);
		});
	});

	describe('camera', () => {
		it('seq_cammovement: follow adds the offset to the position of the followed thing', () => {
			vi.spyOn(parentchild, 'parent_pos').mockImplementation(() => {
				G.tmp_x = 10;
				G.tmp_y = 800;
				G.tmp_z = 30;
				return 1;
			});
			G.seq_flw_class = Cclass_object;
			G.seq_flw_id = 3;
			G.seq_flw_x = 1;
			G.seq_flw_y = 2;
			G.seq_flw_z = 3;
			seq_cammovement();
			expect(parentchild.parent_pos).toHaveBeenCalledWith(Cclass_object, 3);
			expect([EntityX(G.cam), EntityY(G.cam), EntityZ(G.cam)]).toEqual([11, 802, 33]);
		});

		it('seq_cammovement: a movement of no duration jumps to its end (x/0, and 0/0 counts as "greater")', () => {
			G.seq_cstart = CreatePivot();
			G.seq_cend = CreatePivot();
			PositionEntity(G.seq_cstart, 0, 500, 0);
			PositionEntity(G.seq_cend, 100, 700, 0);
			G.seq_start = 1000;
			G.seq_cstartt = 0;
			G.seq_cendt = 0;
			clock.now = 1000; // t1=0, t2=0
			seq_cammovement();
			expect([EntityX(G.cam), EntityY(G.cam), EntityZ(G.cam)]).toEqual([100, 700, 0]);
			expect([G.seq_cstart, G.seq_cend]).toEqual([null, null]);
		});

		it('seq_cammovement keeps the camera 30 above the ground', () => {
			G.ter = null;
			PositionEntity(G.cam, 5, G.ter_groundy - 100, 6);
			seq_cammovement();
			expect([EntityX(G.cam), EntityY(G.cam), EntityZ(G.cam)]).toEqual([5, f32(G.ter_groundy + 30), 6]);
		});

		it('seq_camrotation 0 looks at the centre of the map, 1 at a thing, 3 leaves the camera alone', () => {
			PositionEntity(G.cam, 0, 0, -50);
			RotateEntity(G.cam, 30, 30, 0);
			G.seq_cpoint = 3;
			seq_camrotation();
			expect(EntityYaw(G.cam)).toBeCloseTo(30, 3);
			G.seq_cpoint = 0;
			seq_camrotation();
			expect(EntityPitch(G.cam)).toBeCloseTo(0, 3);
			expect(EntityYaw(G.cam)).toBeCloseTo(0, 3);
			const target = CreatePivot();
			PositionEntity(target, 50, 0, -50);
			const parent_h = vi.spyOn(parentchild, 'parent_h').mockReturnValue(target);
			G.seq_cpoint = 1;
			G.seq_cpoint_class = Cclass_object;
			G.seq_cpoint_id = 4;
			seq_camrotation();
			expect(parent_h).toHaveBeenCalledWith(Cclass_object, 4);
			expect(Math.abs(EntityYaw(G.cam))).toBeCloseTo(90, 3);
			// nothing found: unchanged
			parent_h.mockReturnValue(null);
			RotateEntity(G.cam, 0, 12, 0);
			seq_camrotation();
			expect(EntityYaw(G.cam)).toBeCloseTo(12, 3);
		});

		it('seq_camrotation 2 turns from the old direction to the direction of the end point', () => {
			PositionEntity(G.cam, 0, 0, 0);
			PositionEntity(G.seq_cpoint_p, 0, 0, 100000); // looking along +z
			G.seq_cend = CreatePivot();
			RotateEntity(G.seq_cend, 0, 90, 0);
			G.seq_cpoint = 2;
			G.seq_start = 1000;
			G.seq_cstartt = 0;
			G.seq_cendt = 1000;
			clock.now = 2000; // 100%
			seq_camrotation();
			expect(Math.abs(EntityYaw(G.cam))).toBeCloseTo(90, 2);
			clock.now = 1000; // 0%
			seq_camrotation();
			expect(EntityYaw(G.cam)).toBeCloseTo(0, 2);
			clock.now = 1500; // half way between the two far points: 45 degrees
			seq_camrotation();
			expect(Math.abs(EntityYaw(G.cam))).toBeCloseTo(45, 2);
		});

		it('seq_camrotation 4: free look with sensitivity, inversion and the 85 degree limit', () => {
			PositionEntity(G.cam, 0, 0, 0);
			RotateEntity(G.cam, 0, 10, 0);
			G.seq_cpoint = 4;
			G.set_msens = 1.5;
			G.set_minvert = 1;
			G.set_xinvert = 0;
			G.in_mxs = 2;
			G.in_mys = 0;
			seq_camrotation();
			expect(EntityYaw(G.cam)).toBeCloseTo(13, 3);
			G.set_xinvert = 1;
			seq_camrotation();
			expect(G.in_mxs).toBe(-2);
			expect(EntityYaw(G.cam)).toBeCloseTo(10, 3);
			G.in_mxs = 0;
			G.in_mys = 100;
			seq_camrotation();
			expect(G.in_mys).toBeCloseTo(85, 3); // clamped to what is left up to 85
			expect(EntityPitch(G.cam)).toBeCloseTo(85, 3);
			G.in_mys = -20;
			G.set_minvert = -1;
			seq_camrotation();
			expect(G.in_mys).toBeCloseTo(0, 3); // +30 inverted, only 0 left
			G.in_mys = 20;
			seq_camrotation();
			expect(EntityPitch(G.cam)).toBeCloseTo(55, 3);
			G.in_mys = 200;
			seq_camrotation();
			expect(EntityPitch(G.cam)).toBeCloseTo(-85, 3);
		});
	});
});
