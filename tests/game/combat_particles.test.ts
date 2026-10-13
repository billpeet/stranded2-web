/**
 * particles.bb and motionblur.bb (package combat). Expected values are taken
 * from the original source, branch by branch; random values are replayed with
 * the same seed in the order the original draws them.
 */
import { existsSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AddTriangle, AddVertex, CreateCube, CreateMesh, CreatePivot, CreateSurface, EntityX, EntityY, EntityZ, GetParent, PositionEntity, type BBEntity } from '../../src/lib/s2/bb3d';
import { Rand, Rnd, SeedRnd, f32, setClock } from '../../src/lib/s2/blitz';
import { BackBuffer, Color, ReadPixelFast, Rect, SetBuffer } from '../../src/lib/s2/gfx2d';
import { envHooks } from '../../src/lib/s2/game/runtime';
import * as consoleMod from '../../src/lib/s2/game/console';
import { setFrameHook } from '../../src/lib/s2/game/flow';
import { injectMouseDown, injectMouseUp } from '../../src/lib/s2/input';
import {
	Cbmpf_red,
	Cclass_unit,
	Cmenu_if_movie,
	Cp2d_blackrect,
	Cp2d_dot,
	Cp2d_item,
	Cp_attack,
	Cp_bubbles,
	Cp_explode,
	Cp_fadeout,
	Cp_fall,
	Cp_flames,
	Cp_flash,
	Cp_resfade,
	Cp_rwave,
	Cp_seqfade,
	Cp_shockwave,
	Cp_smoke,
	Cp_spark,
	Cp_spawn,
	Cp_stuck,
	Csection_game_sp,
	Csection_menu
} from '../../src/lib/s2/game/consts';
import { Ditem_alpha, Ditem_modelh } from '../../src/lib/s2/game/defs';
import { DEFS } from '../../src/lib/s2/game/defs_store';
import * as functions from '../../src/lib/s2/game/functions';
import * as handle_units from '../../src/lib/s2/game/handle_units';
import { mb_override, mb_setup, mb_update } from '../../src/lib/s2/game/motionblur';
import {
	p_add,
	p_add2d,
	p_combine,
	p_explosion,
	p_fragment,
	p_itemposition,
	p_kill2d,
	p_lightning,
	p_parent,
	p_pixelizeeat,
	p_projectile,
	p_rectscreen,
	p_update,
	p_update_2d
} from '../../src/lib/s2/game/particles';
import { RT } from '../../src/lib/s2/game/rt';
import { G } from '../../src/lib/s2/game/state';
import { New, Titem, Tp, Tunit, isNull } from '../../src/lib/s2/game/types';
import { MOD, particles, setupCombat, teardownCombat } from './combat.helpers';

describe.skipIf(!existsSync(MOD))('combat: particles.bb', () => {
	beforeEach(setupCombat);
	afterEach(teardownCombat);

	it('p_add Cp_smoke: draws its values in the original order and leaves the particle in TCp', () => {
		SeedRnd(7);
		p_add(10, 20, 30, Cp_smoke, 4, 0.75);
		const t = G.TCp!;
		SeedRnd(7);
		Rand(0, 1); // texture
		Rand(100, 150); // grey
		const rot = Rand(360);
		const fx = Rnd(f32(0.05), f32(0.1));
		const fy = Rnd(f32(0.15), f32(0.35));
		const fz = Rnd(f32(-1.5), f32(1.5));

		expect(particles()).toEqual([t]);
		expect(t.typ).toBe(Cp_smoke);
		expect([EntityX(t.h), EntityY(t.h), EntityZ(t.h)]).toEqual([10, 20, 30]);
		expect(t.h!.sprite!.xscale).toBe(4);
		expect([t.rot, t.fx, t.fy, t.fz]).toEqual([rot, fx, fy, fz]);
		expect(t.size).toBe(4);
		expect(t.r).toBe(f32(0.007));
		expect(t.a).toBe(0); // fades in ...
		expect(t.fadein).toBe(f32(0.75)); // ... up to a#

		// p_update: fade in by 0.034 per frame, grow by fx, rise by fy, turn by fz
		p_update();
		expect(t.a).toBe(f32(0.034));
		expect(t.size).toBe(f32(4 + fx));
		expect(EntityY(t.h)).toBeCloseTo(20 + fy, 4); // (bb3d keeps positions in double precision)
		expect(t.rot).toBe(f32(rot + fz));
		for (let i = 2; i <= 22; i++) p_update();
		expect(t.fadein).toBe(f32(0.75)); // 22 * 0.034 = 0.748: not there yet
		p_update();
		expect(t.a).toBe(f32(0.75)); // clamped,
		expect(t.fadein).toBe(0); // then the fade out starts: a -= r
		p_update();
		expect(t.a).toBe(f32(f32(0.75) - f32(0.007)));
		// until a < 0: sprite freed, particle deleted
		for (let i = 0; i < 200 && !isNull(Tp, t); i++) p_update();
		expect(isNull(Tp, t)).toBe(true);
		expect(t.h!.freed).toBe(true);
		expect(particles()).toEqual([]);
	});

	it('p_add Cp_attack: side by the sign of x, parented to the camera; p_update swings and fades it', () => {
		p_add(1, 0, 0, Cp_attack, 12, 0.5);
		const right = G.TCp!;
		expect([right.r, right.rot, right.a]).toEqual([1, 20, 0.5]);
		expect(GetParent(right.h)).toBe(G.cam);
		p_add(0, 0, 0, Cp_attack, 12, 0.5);
		const left = G.TCp!;
		expect([left.r, left.rot]).toEqual([0, -20]);

		p_update();
		expect(right.rot).toBe(-10); // 20 - 30*f
		expect(left.rot).toBe(10);
		expect(right.a).toBe(f32(0.5 - f32(0.075)));
		for (let i = 0; i < 6; i++) p_update(); // 7 * 0.075 = 0.525 > 0.5
		expect(particles()).toEqual([]);
	});

	it('particle types from 101 take over tmp_ph instead of creating a sprite', () => {
		const mesh = CreateMesh();
		G.tmp_ph = mesh;
		p_add(0, 0.05, 0.03, Cp_fadeout);
		const t = G.TCp!;
		expect(t.h).toBe(mesh);
		expect(t.a).toBe(f32(0.05)); // y# is the alpha,
		expect(t.fx).toBe(f32(0.03)); // z# the fade speed
		p_update();
		expect(t.a).toBe(f32(f32(0.05) - f32(0.03)));
		expect(mesh.freed).toBe(false);
		p_update();
		expect(mesh.freed).toBe(true);
		expect(isNull(Tp, t)).toBe(true);

		const m2 = CreateMesh();
		G.tmp_ph = m2;
		p_add(0, 0.5, 0.25, Cp_resfade); // r = fade speed, g = growth
		expect([G.TCp!.h, G.TCp!.r, G.TCp!.g]).toEqual([m2, 0.5, 0.25]);
		G.TCp!.a = 1;
		p_update();
		expect([G.TCp!.a, G.TCp!.fx, G.TCp!.fy, G.TCp!.fz]).toEqual([0.5, 0.25, 0.25, 0.25]);

		const m3 = CreateMesh();
		G.tmp_ph = m3;
		p_add(0, 0, 0, Cp_stuck, 1, 0.5);
		expect([G.TCp!.h, G.TCp!.a]).toEqual([m3, 0.5]);

		const m4 = CreateMesh();
		PositionEntity(m4, 0, 10, 0);
		G.tmp_ph = m4;
		p_add(0, 0, 0, Cp_fall);
		const fall = G.TCp!;
		expect(Math.abs(fall.fx)).toBe(1);
		expect(Math.abs(fall.fz)).toBe(1);
		G.ter_groundy = 0;
		p_update(); // sinks by 0.9 per frame (no frame factor), freed 300 below the ground
		expect(EntityY(m4)).toBeCloseTo(9.1, 4);
		PositionEntity(m4, 0, -299.5, 0);
		p_update();
		expect(m4.freed).toBe(true);
	});

	it('quirk: an underwater Cp_flames particle deletes itself and TCp points at the dead particle', () => {
		let smoke = 0;
		let bubbles = 0;
		for (let seed = 1; seed <= 60; seed++) {
			SeedRnd(seed);
			p_add(0, -5, 0, Cp_flames, 3, 1);
			expect(isNull(Tp, G.TCp)).toBe(true);
			expect(G.TCp!.typ).toBe(Cp_flames);
			expect(G.TCp!.h!.freed).toBe(true);
			for (const t of particles()) {
				expect([Cp_smoke, Cp_bubbles]).toContain(t.typ);
				if (t.typ === Cp_smoke) smoke++;
				else bubbles++;
			}
			p_kill2d();
			for (const t of particles()) Tp.list.delete(t);
		}
		expect(smoke).toBeGreaterThan(0); // If Rand(3)=1
		expect(bubbles).toBeGreaterThan(0); // If Rand(20)=1
		// above the water it stays
		p_add(0, 5, 0, Cp_flames, 3, 1);
		expect(isNull(Tp, G.TCp)).toBe(false);
		expect(G.TCp!.fy).toBe(f32(3 * f32(1.7)));
	});

	it('Cp_bubbles: reaching the surface spawns a round wave that the same p_update pass already updates', () => {
		for (const dive of [0, 1]) {
			G.g_dive = dive;
			p_add(5, -3.5, 7, Cp_bubbles, 2, 1);
			const b = G.TCp!;
			expect(b.fy).toBeGreaterThanOrEqual(f32(0.3));
			for (let i = 0; i < 3 && !isNull(Tp, b); i++) p_update();
			expect(isNull(Tp, b)).toBe(true);
			const all = particles();
			expect(all.length).toBe(1);
			const w = all[0];
			expect(w.typ).toBe(Cp_rwave);
			expect([EntityX(w.h), EntityY(w.h), EntityZ(w.h)]).toEqual([5, dive === 1 ? -1 : 2, 7]);
			// created with a#=0.4 and updated once in the pass that created it (For Each visits new objects)
			expect(w.a).toBe(f32(f32(0.4) - f32(0.02)));
			expect(w.size).toBeGreaterThanOrEqual(2);
			expect(w.size).toBeLessThanOrEqual(f32(4 + 0.1));
			Tp.list.delete(w);
		}
	});

	it('Cp_spark: falls, and under water turns into smoke (20) and bubbles (10)', () => {
		G.ter_groundy = -100;
		p_add(0, -20, 0, Cp_spark, 1, 3);
		const s = G.TCp!;
		const fy = s.fy;
		p_update();
		expect(s.fy).toBe(f32(fy - f32(0.3))); // gravity
		expect(isNull(Tp, s)).toBe(true);
		expect(particles().map((t) => t.typ)).toEqual([Cp_smoke, Cp_bubbles]);

		// on the ground it stops
		for (const t of particles()) Tp.list.delete(t);
		G.ter_groundy = 10;
		p_add(0, 9, 0, Cp_spark, 1, 3);
		const g = G.TCp!;
		g.fy = 0;
		p_update();
		expect(EntityY(g.h)).toBe(10);
		expect([g.fx, g.fy, g.fz, g.fadein]).toEqual([0, 0, 0, 0]);
		expect(g.a).toBe(f32(3 - f32(0.025)));
	});

	it('Cp_seqfade: lives from Tp\\x to Tp\\y ms after seq_start, and only in the menu or the movie screen', () => {
		p_add(0, 0, 0, Cp_seqfade);
		const t = G.TCp!;
		t.x = 100;
		t.y = 600;
		t.fx = 1;
		G.m_section = Csection_menu;
		G.seq_start = 4700;
		setClock(() => 5000);
		p_update(); // time = 301
		expect(isNull(Tp, t)).toBe(false);
		setClock(() => 5300);
		p_update(); // time = 601 > 600
		expect(isNull(Tp, t)).toBe(true);

		p_add(0, 0, 0, Cp_seqfade);
		const u = G.TCp!;
		u.y = 600;
		G.m_section = Csection_game_sp;
		G.m_menu = Cmenu_if_movie;
		setClock(() => 5000);
		p_update();
		expect(isNull(Tp, u)).toBe(false);
		G.m_menu = 0;
		p_update(); // neither movie nor menu: freed at once
		expect(isNull(Tp, u)).toBe(true);
	});

	it('Cp_flash / Cp_fade and the debug time string', () => {
		p_add(0, 0, 0, Cp_flash, 0.25, 0.5);
		const t = G.TCp!;
		expect([t.a, t.fx]).toEqual([0.5, 0.25]);
		expect(GetParent(t.h)).toBe(G.cam);
		G.set_debug_rt = 1;
		setClock(() => 777);
		p_update();
		expect(t.a).toBe(0.25);
		expect(G.set_debug_rt_particles).toBe('0 ms Particles (1)');
		p_update();
		expect(isNull(Tp, t)).toBe(false); // a = 0 is not < 0
		p_update();
		expect(isNull(Tp, t)).toBe(true);
	});

	it('Cp_spawn follows its parent unit (p_parent / p_toparent)', () => {
		const unit = New(Tunit);
		unit.id = 7;
		unit.h = CreatePivot();
		PositionEntity(unit.h, 100, 0, 50);
		const con_unit = vi.spyOn(handle_units, 'con_unit').mockImplementation((id) => {
			if (id !== 7) return 0;
			G.TCunit = unit;
			return 1;
		});
		p_add(110, 5, 45, Cp_spawn, 2, 1);
		const t = G.TCp!;
		expect(t.fy).toBe(5); // size * 2.5
		p_parent(8, t);
		expect(t.parentid).toBe(0);
		p_parent(7, t);
		expect([t.parentid, t.parentx, t.parentz]).toEqual([7, 10, -5]);
		PositionEntity(unit.h, 200, 0, 60);
		p_update();
		expect(con_unit).toHaveBeenLastCalledWith(7);
		expect([EntityX(t.h), EntityZ(t.h)]).toEqual([210, 55]);
		expect(EntityY(t.h)).toBeCloseTo(5.1, 4); // rises by 0.1*fx*f*fz
		expect(t.size).toBe(f32(2 - f32(0.01)));
		expect(t.fy).toBe(f32(5 + f32(1.8)));
	});

	it('p_explosion: 3 spheres, a shock wave, 10 to 20 fire clouds and the sound at Int coordinates', () => {
		const sfx_3d = vi.spyOn(RT.audio, 'sfx_3d').mockImplementation(() => {});
		G.sfx_explode = [11, 12, 13, 14, 0];
		p_explosion(10.6, 20.4, 30.5, 2);
		const all = particles();
		expect(all.slice(0, 3).map((t) => [t.typ, t.size])).toEqual([
			[Cp_explode, 2],
			[Cp_explode, 2],
			[Cp_explode, 2]
		]);
		expect(all[0].h!.cls).toBe('Mesh'); // the sprite was replaced by a sphere
		expect([all[3].typ, all[3].size]).toEqual([Cp_shockwave, 6]);
		expect(EntityY(all[3].h)).toBe(f32(f32(20.4) + 15));
		const clouds = all.slice(4);
		expect(clouds.length).toBeGreaterThanOrEqual(10);
		expect(clouds.length).toBeLessThanOrEqual(20);
		expect(clouds.every((t) => t.typ === Cp_smoke)).toBe(true);
		// the ten "fire" clouds start visible (a = fadein, fadein = 0); the extra smoke clouds fade in
		expect(clouds.filter((t) => t.fadein === 0).length).toBe(10);
		expect(sfx_3d).toHaveBeenCalledOnce();
		const [x, y, z, snd] = sfx_3d.mock.calls[0];
		expect([x, y, z]).toEqual([11, 20, 30]); // Int(): to nearest, ties to even
		expect([11, 12, 13, 14]).toContain(snd);
	});

	it('p_lightning: one fading mesh line per step, each starting where the last one ended', () => {
		const lines: BBEntity[] = [];
		const meshline = vi.spyOn(functions, 'meshline').mockImplementation(() => {
			lines.push(CreateMesh());
			return lines[lines.length - 1];
		});
		p_lightning(1, 2, 3, 4, 5);
		expect(meshline).toHaveBeenCalledTimes(4);
		const calls = meshline.mock.calls;
		expect(calls[0].slice(0, 3)).toEqual([1, 2, 3]);
		for (let i = 1; i < 4; i++) expect(calls[i].slice(0, 3)).toEqual(calls[i - 1].slice(3, 6));
		expect(calls.map((c) => c[6])).toEqual([f32(0.3), f32(f32(0.3) * f32(0.6)), f32(f32(f32(0.3) * f32(0.6)) * f32(0.6)), f32(f32(f32(f32(0.3) * f32(0.6)) * f32(0.6)) * f32(0.6))]);
		expect(particles().map((t) => [t.typ, t.h, t.a, t.fx])).toEqual(lines.map((l) => [Cp_fadeout, l, 1, f32(0.2)]));
	});

	it('p_projectile: a copy of the item model becomes a Cp_stuck particle', () => {
		const typ = [...DEFS.items.byId.keys()][0];
		Ditem_modelh.set(typ, CreateCube());
		const old = CreatePivot();
		PositionEntity(old, 3, 4, 5);
		p_projectile(old, typ, Cclass_unit, 9);
		const t = G.TCp!;
		expect([t.typ, t.age, t.timer]).toEqual([Cp_stuck, Cclass_unit, 9]);
		expect(t.a).toBe(Ditem_alpha(typ));
		expect(t.h).toBe(G.tmp_ph);
		expect(t.h).not.toBe(Ditem_modelh(typ));
		expect([EntityX(t.h), EntityY(t.h), EntityZ(t.h)]).toEqual([3, 4, 5]);
	});

	it('p_fragment: quirk, the triangle loop runs 1..tris', () => {
		const con_add = vi.spyOn(consoleMod, 'con_add').mockImplementation(() => {});
		const m = CreateMesh();
		const s = CreateSurface(m);
		const v = [AddVertex(s, 0, 0, 0), AddVertex(s, 1, 0, 0), AddVertex(s, 0, 1, 0), AddVertex(s, 1, 1, 0)];
		AddTriangle(s, v[0], v[1], v[2]);
		AddTriangle(s, v[1], v[3], v[2]);
		p_fragment(m);
		// triangle 1 (the second) is split off; "triangle 2" does not exist
		expect(con_add.mock.calls).toEqual([['addmesh']]);
		expect(particles()).toEqual([]);
	});

	it('env_p_add (substitute for the runtime.ts hook): colour and blend go to TCp\\h', () => {
		envHooks().p_add({ x: 0, y: 0, z: 0, typ: Cp_flash, size: 0.2, a: 0.75, color: [255, 255, 255], blend: 3 });
		expect([G.TCp!.typ, G.TCp!.a, G.TCp!.fx]).toEqual([Cp_flash, 0.75, f32(0.2)]);
	});
});

describe.skipIf(!existsSync(MOD))('combat: particles.bb, 2D', () => {
	beforeEach(setupCombat);
	afterEach(teardownCombat);

	it('Cp2d_blackrect: drawn, moved by f and shrunk by 2f until its size reaches 0', () => {
		SetBuffer(BackBuffer());
		Color(255, 0, 0);
		Rect(0, 0, 300, 300, 1);
		expect(p_add2d(100, 50, Cp2d_blackrect)).toBe(1);
		const t = G.TCp!;
		expect([t.typ, t.x, t.y, t.a]).toEqual([Cp2d_blackrect, 100, 50, 50]);
		p_update_2d();
		expect(ReadPixelFast(110, 60, BackBuffer()) & 0xffffff).toBe(0);
		expect(ReadPixelFast(99, 60, BackBuffer()) & 0xffffff).toBe(0xff0000);
		expect(ReadPixelFast(150, 60, BackBuffer()) & 0xffffff).toBe(0xff0000);
		expect([t.x, t.y, t.a]).toEqual([101, 51, 48]);
		for (let i = 2; i <= 24; i++) p_update_2d();
		expect(isNull(Tp, t)).toBe(false); // a = 2
		p_update(); // the 3D update runs the 2D particles as well
		expect(isNull(Tp, t)).toBe(true);
	});

	it('Cp2d_item and Cp2d_dot', () => {
		SetBuffer(BackBuffer());
		p_add2d(400, 300, Cp2d_item, 5);
		const item = G.TCp!;
		expect([item.x, item.y, item.a]).toEqual([380, 280, 5]); // centred icon, a = item type
		expect(item.fy).toBeLessThanOrEqual(-5); // thrown upwards
		const fy = item.fy;
		const fx = item.fx;
		p_update_2d(); // (no icon loaded: nothing drawn)
		expect(item.fy).toBe(f32(fy + 1));
		expect(item.fx).toBe(f32(fx * f32(0.96)));
		expect(item.y).toBe(f32(280 + f32(item.fy * 2.5)));
		item.y = G.set_scry + 1;
		item.fy = 0;
		p_update_2d();
		expect(isNull(Tp, item)).toBe(true); // fell out of the screen

		const argb = 0xff0000ff | 0;
		p_add2d(10, 10, Cp2d_dot, argb);
		const dot = G.TCp!;
		expect(dot.age).toBe(argb);
		expect(dot.fy).toBeLessThanOrEqual(-3.5);
		dot.fx = 0;
		dot.fy = 0;
		dot.frame = 1;
		p_update_2d();
		for (const [x, y] of [
			[10, 10],
			[11, 10],
			[10, 11],
			[11, 11]
		])
			expect(ReadPixelFast(x, y, BackBuffer()) & 0xffffff).toBe(0xff);
		dot.x = 1; // not > 1: off screen
		p_update_2d();
		expect(isNull(Tp, dot)).toBe(true);
	});

	it('p_rectscreen covers the screen with 50 pixel rectangles; p_kill2d removes the 2D particles only', () => {
		p_add(0, 0, 0, Cp_smoke);
		p_add2d(1, 1, Cp2d_blackrect);
		p_rectscreen();
		const all = particles();
		expect(all.length).toBe(1 + 18 * 14); // x = 0..850, y = 0..650 at 800x600; the old rectangle is gone
		expect([all[1].x, all[1].y, all[2].x, all[2].y]).toEqual([0, 0, 0, 50]);
		p_kill2d();
		expect(particles().map((t) => t.typ)).toEqual([Cp_smoke]);
	});

	it('p_itemposition: slot of an item type in the 11 x 5 inventory grid, behind the scroll offset', () => {
		G.g_player = 1;
		for (const typ of [5, 6, 7]) {
			const it = New(Titem);
			it.typ = typ;
			it.parent_class = Cclass_unit;
			it.parent_id = 1;
		}
		const other = New(Titem); // somebody else's
		other.typ = 9;
		other.parent_class = Cclass_unit;
		other.parent_id = 2;

		expect(p_itemposition(6)).toBe(1);
		expect([G.tmp_x, G.tmp_y]).toEqual([236 + 45, 63]);
		G.in_scr_scr = 1; // first item scrolled away
		expect(p_itemposition(6)).toBe(1);
		expect([G.tmp_x, G.tmp_y]).toEqual([236, 63]);
		G.in_scr_scr = 0;
		expect(p_itemposition(9)).toBe(1); // not there: the next free slot
		expect([G.tmp_x, G.tmp_y]).toEqual([236 + 3 * 45, 63]);
		for (let i = 0; i < 9; i++) {
			const it = New(Titem);
			it.typ = 20;
			it.parent_class = Cclass_unit;
			it.parent_id = 1;
		}
		expect(p_itemposition(9)).toBe(1); // 12 items: second row, second slot
		expect([G.tmp_x, G.tmp_y]).toEqual([236 + 45, 63 + 45]);
		for (let i = 0; i < 43; i++) {
			const it = New(Titem);
			it.typ = 20;
			it.parent_class = Cclass_unit;
			it.parent_id = 1;
		}
		expect(p_itemposition(9)).toBe(0); // 55 items: the grid is full
	});

	it('p_combine and p_pixelizeeat are switched off in the original (Return 0 first)', () => {
		expect(p_combine(1, 2)).toBe(0);
		expect(p_pixelizeeat(0, 0, 0)).toBe(0);
		expect(particles()).toEqual([]);
	});
});

describe.skipIf(!existsSync(MOD))('combat: motionblur.bb', () => {
	beforeEach(setupCombat);
	afterEach(teardownCombat);

	it('mb_setup (called by include_load_setup): a sprite in front of the camera with a screen sized texture', () => {
		expect(G.mb_sprite).not.toBeNull();
		expect(GetParent(G.mb_sprite)).toBe(G.cam);
		expect(G.mb_tex).not.toBeNull();
		expect(G.mb_sprite!.sprite!.viewMode).toBe(2);
		expect(G.mb_sprite!.order).toBe(-200);
		expect([G.mb_sprite!.sprite!.xscale, G.mb_sprite!.sprite!.yscale]).toEqual([10, f32(f32(G.set_scry / G.set_scrx) * 10)]);
		const first = G.mb_sprite;
		mb_setup();
		expect(G.mb_sprite).not.toBe(first);
	});

	it('mb_override only raises the override', () => {
		mb_override(0.5);
		expect(G.set_mb_alpha_override).toBe(0.5);
		mb_override(0.25);
		expect(G.set_mb_alpha_override).toBe(0.5);
		mb_override(0.75);
		expect(G.set_mb_alpha_override).toBe(0.75);
	});

	it('mb_update: hides the sprite when blur is off or has no alpha, applies the script blur', async () => {
		G.set_mb = 0;
		G.in_scriptblur = 0.25;
		await mb_update();
		expect(G.set_mb_alpha_override).toBe(0.25);
		expect(G.mb_sprite!.obj.visible).toBe(false);

		G.set_mb = 1;
		G.set_mb_alpha = 0;
		await mb_update(); // override 0.25 > alpha 0: shown
		expect(G.mb_sprite!.obj.visible).toBe(true);

		G.in_scriptblur = 0;
		G.set_mb_alpha_override = 0;
		await mb_update(); // alpha <= 0 and no override: hidden again
		expect(G.mb_sprite!.obj.visible).toBe(false);

		G.set_mb_alpha = 0.5;
		await mb_update();
		expect(G.mb_sprite!.obj.visible).toBe(true);
	});

	it('mb_update without a buffer texture switches motion blur off and reports it', async () => {
		const con_add = vi.spyOn(consoleMod, 'con_add').mockImplementation(() => {});
		G.set_mb = 1;
		G.mb_tex = null;
		let frames = 0;
		setFrameHook(() => {
			// gui_msg waits for a key or a mouse click
			frames++;
			injectMouseDown(1);
			if (frames > 400) throw new Error('gui_msg did not close');
		});
		await mb_update();
		expect(G.set_mb).toBe(0);
		expect(con_add).toHaveBeenCalledWith('WARNING: Motion blur has been disabled automatically', Cbmpf_red);
		expect(frames).toBeGreaterThan(0); // the message window was open
		// gui_msg ends with p_rectscreen() (wired through the interface host by _additions/combat.ts)
		expect(particles().filter((t) => t.typ === Cp2d_blackrect).length).toBe(18 * 14);
		injectMouseUp(1);
	});
});
