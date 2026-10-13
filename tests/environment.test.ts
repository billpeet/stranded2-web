import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
	BlitzRandom,
	Cp_flash,
	Cp_rain,
	EnvCore,
	FrameTimer,
	GrassCore,
	TerrainEditor,
	blitzInt,
	copyRect,
	defaultSettings,
	drawWaterTexture,
	e_terpitch,
	e_terraincmscale_size,
	e_terroll,
	frustumCull,
	grassProperties,
	quantizeHeight,
	setupWaveMatrix,
	update_object,
	viewfacOnLoad,
	viewfacOnSave,
	water2dfxShifts,
	waterShift,
	type EnvEngine,
	type EnvHooks,
	type ParticleRequest
} from '../src/lib/s2/engine/environment';
import { entityAngles } from '../src/lib/s2/engine/blitzSpace';
import { Terrain } from '../src/lib/s2/engine/terrain';

/** sys\lightcycle.inf as shipped; the hand-computed expectations below use these rows. */
const LIGHTCYCLE = `0=23,23,55
1=23,23,55
2=23,23,55
3=23,23,55
4=23,23,55
5=40,40,70
6=70,70,120
7=255,100,50
8=255,255,255
9=255,255,255
10=255,255,255
11=255,255,255
12=255,255,255
13=255,255,255
14=255,255,255
15=255,255,255
16=255,255,255
17=255,255,255
18=255,255,255
19=255,255,255
20=255,100,50
21=100,100,150
22=40,40,70
23=40,40,70`.split('\n');

/** Records every engine call; camera and view answers are settable. */
class MockEngine implements EnvEngine {
	calls: [string, ...unknown[]][] = [];
	cam = { x: 0, y: 50, z: 0 };
	sunInView = true;
	sunVisible = true;
	projected: [number, number] = [600, 100];
	ter: ReturnType<EnvEngine['waveTerrain']> = undefined;
	private rec(name: string, ...a: unknown[]) {
		this.calls.push([name, ...a]);
	}
	last(name: string): unknown[] | undefined {
		for (let i = this.calls.length - 1; i >= 0; i--) if (this.calls[i][0] === name) return this.calls[i].slice(1);
		return undefined;
	}
	all(name: string): unknown[][] {
		return this.calls.filter((c) => c[0] === name).map((c) => c.slice(1));
	}
	camX = () => this.cam.x;
	camY = () => this.cam.y;
	camZ = () => this.cam.z;
	positionCam(x: number, y: number, z: number) {
		this.cam = { x, y, z };
	}
	buildEntities = () => this.rec('buildEntities');
	e_terrainground = (fx: number) => this.rec('e_terrainground', fx);
	positionSky = (x: number, y: number, z: number) => this.rec('positionSky', x, y, z);
	wbox = (show: boolean, a: number) => this.rec('wbox', show, a);
	moon = (show: boolean, a: number, x: number, y: number, z: number) => this.rec('moon', show, a, x, y, z);
	positionLensSun = (x: number, y: number, z: number) => this.rec('positionLensSun', x, y, z);
	lensSunInView = () => this.sunInView;
	lensSunVisible = () => this.sunVisible;
	cameraProject = () => this.projected;
	flare = (i: number, show: boolean, x: number, y: number, a: number) => this.rec('flare', i, show, x, y, a);
	skyColor = (r: number, g: number, b: number) => this.rec('skyColor', r, g, b);
	ambientLight = (r: number, g: number, b: number) => this.rec('ambientLight', r, g, b);
	wboxColor = (g: number) => this.rec('wboxColor', g);
	positionWaterTexture = (u: number, v: number) => this.rec('positionWaterTexture', u, v);
	drawWaterTexture = (q: number, isin: number) => this.rec('drawWaterTexture', q, isin);
	rotateSea2 = (roll: number) => this.rec('rotateSea2', roll);
	skyFX = (fx: number) => this.rec('skyFX', fx);
	cameraFog = (...a: number[]) => this.rec('cameraFog', ...a);
	renderWaterCubemap = () => this.rec('renderWaterCubemap');
	setupWaterReflection = (n: number) => this.rec('setupWaterReflection', n);
	camDistance = (x: number, y: number, z: number) =>
		Math.hypot(this.cam.x - x, this.cam.y - y, this.cam.z - z);
	pointInView = () => true;
	water2dfx = (...a: number[]) => this.rec('water2dfx', ...a);
	waveTerrain = () => this.ter;
}

function makeCore(hooks: EnvHooks = {}, rnd: () => number = () => 0.5) {
	const engine = new MockEngine();
	const core = new EnvCore(engine, defaultSettings(), hooks, new FrameTimer(), new BlitzRandom(rnd));
	core.load_lightcycle(LIGHTCYCLE);
	return { core, engine };
}

describe('blitz numeric semantics', () => {
	it('converts floats to ints rounding half to even', () => {
		expect(blitzInt(2.5)).toBe(2);
		expect(blitzInt(3.5)).toBe(4);
		expect(blitzInt(-2.5)).toBe(-2);
		expect(blitzInt(2.4)).toBe(2);
		expect(blitzInt(2.6)).toBe(3);
		expect(blitzInt(-2.7)).toBe(-3);
		expect(Object.is(blitzInt(-0.2), 0)).toBe(true);
	});
	it('Rand is inclusive and swaps reversed bounds, Rnd is linear', () => {
		const lo = new BlitzRandom(() => 0);
		const hi = new BlitzRandom(() => 0.999999);
		expect(lo.Rand(10)).toBe(1);
		expect(hi.Rand(10)).toBe(10);
		expect(lo.Rand(0, 2)).toBe(0);
		expect(hi.Rand(0, 2)).toBe(2);
		expect(lo.Rand(-150, 150)).toBe(-150);
		expect(hi.Rand(-150, 150)).toBe(150);
		expect(new BlitzRandom(() => 0.25).Rnd(20, 30)).toBe(22.5);
	});
});

describe('load_fps.bb: calcfpsfactor', () => {
	it('f is looptime/20, scaled by in_gtmod which then resets', () => {
		const t = new FrameTimer();
		t.getinput(1000);
		expect(t.frameDue(1010)).toBe(false);
		expect(t.frameDue(1020)).toBe(true);
		expect(t.calcfpsfactor(1020)).toBe(1);
		t.getinput(1020);
		expect(t.calcfpsfactor(1050)).toBe(1.5);
		t.getinput(1050);
		t.in_gtmod = 4;
		expect(t.calcfpsfactor(1070)).toBe(4);
		expect(t.in_gtmod).toBe(1);
	});
	it('game time only advances with gametimer=1 and fires the gt/ms timers', () => {
		const t = new FrameTimer();
		t.getinput(5000, 1);
		expect(t.gt).toBe(0); // lastms was 0
		t.getinput(5020, 1);
		expect(t.gt).toBe(20);
		expect(t.in_gt20go).toBe(1);
		t.getinput(5040, 0);
		expect(t.gt).toBe(20);
		expect(t.in_gt20go).toBe(0);
		t.in_gtmod = 3;
		t.getinput(5060, 1);
		expect(t.gt).toBe(80);
		// in_t1000 fires on the first frame (ms-0>=1000), in_t2000 on every second in_t1000
		const u = new FrameTimer();
		const go: number[] = [];
		for (let ms = 1000; ms <= 5000; ms += 500) {
			u.getinput(ms);
			go.push(u.in_t1000go * 10 + u.in_t2000go);
		}
		expect(go).toEqual([10, 0, 11, 0, 10, 0, 11, 0, 10]);
	});
});

describe('e_environment_update_light', () => {
	it('blends the two hours by minute/59 (hand-computed from lightcycle.inf)', () => {
		const { core, engine } = makeCore();
		const at = (h: number, m: number) => {
			core.map_hour = h;
			core.map_minute = m;
			return core.lightColors();
		};
		// 7:30 -> p=30/59=0.50847: g=100*0.49153+255*0.50847=178.81, b=50*0.49153+255*0.50847=154.24
		expect(at(7, 30)).toEqual({ rgb: [255, 179, 154], ambient: [200, 124, 99], grey: 111 });
		// 6:00 -> exactly the hour's row
		expect(at(6, 0)).toEqual({ rgb: [70, 70, 120], ambient: [15, 15, 65], grey: 1 });
		// 20:59 -> p=1: exactly the next hour's row
		expect(at(20, 59)).toEqual({ rgb: [100, 100, 150], ambient: [45, 45, 95], grey: 31 });
		// 23:30 wraps to hour 0: r=40*0.49153+23*0.50847=31.36, b=70*0.49153+55*0.50847=62.37
		expect(at(23, 30)).toEqual({ rgb: [31, 31, 62], ambient: [0, 0, 7], grey: 0 });
		// noon
		expect(at(12, 15)).toEqual({ rgb: [255, 255, 255], ambient: [200, 200, 200], grey: 170 });

		core.map_hour = 7;
		core.map_minute = 30;
		core.e_environment_update_light();
		expect(core.env_col).toEqual([255, 179, 154]);
		expect(engine.last('skyColor')).toEqual([255, 179, 154]);
		expect(engine.last('ambientLight')).toEqual([200, 124, 99]);
		expect(engine.last('wboxColor')).toEqual([111]);
	});

	it('applies in_skyoverride unmixed and mixed', () => {
		const { core } = makeCore();
		core.map_hour = 12;
		core.map_minute = 0;
		core.in_skyoverride = [1, 10, 20, 30, 0];
		expect(core.lightColors().rgb).toEqual([10, 20, 30]);
		// mix 25: p1=0.25 of the cycle colour, p2=0.75 of the override: 10*0.75+255*0.25=71.25
		core.in_skyoverride = [1, 10, 20, 30, 25];
		expect(core.lightColors().rgb).toEqual([71, 79, 86]);
		// mix above 100 clamps to the pure cycle colour
		core.in_skyoverride = [1, 10, 20, 30, 250];
		expect(core.lightColors().rgb).toEqual([255, 255, 255]);
		core.skycolor(0);
		expect(core.in_skyoverride[0]).toBe(0);
		expect(core.env_col).toEqual([255, 255, 255]);
	});

	it('computes fog above and below water', () => {
		const { core } = makeCore();
		core.env_col = [255, 179, 154];
		core.map_fog = [200, 220, 255, 0];
		// range (500*1.5)-250 .. +600 ; colour env_col-(255-map_fog), floored at 0
		expect(core.fogAboveWater()).toEqual({ mode: 1, near: 500, far: 1100, rgb: [200, 144, 154] });
		core.settings.set_fog = 0;
		expect(core.fogAboveWater().mode).toBe(0);
		core.map_fog[3] = 1; // map forces fog
		expect(core.fogAboveWater().mode).toBe(1);
		core.settings.set_viewfac = 4;
		expect(core.fogAboveWater().near).toBe(1750);
		// under water: env_col-env_wcol(220,110,90)
		expect(core.fogUnderWater()).toEqual({ mode: 1, near: 1, far: 500, rgb: [35, 69, 64] });
		core.env_col = [23, 23, 55];
		expect(core.fogUnderWater().rgb).toEqual([0, 0, 0]);
	});

	it('view range factor tables differ between load and save, as in the original', () => {
		expect([0, 1, 2, 3, 4, 9].map(viewfacOnLoad)).toEqual([0.5, 1, 1.5, 2.5, 4, 1.5]);
		expect([0, 1, 2, 3, 4, 9].map(viewfacOnSave)).toEqual([0.5, 1, 1.5, 2, 2.5, 1.5]);
	});
});

describe('e_environment_update: time', () => {
	it('advances one minute per Cworld_minute_ms of game time and rolls over', () => {
		let days = 0;
		const { core } = makeCore({ game_cd: () => days++ });
		core.map_day = 3;
		core.map_hour = 23;
		core.map_minute = 58;
		core.in_tgametime = 0;
		core.timer.gt = 499;
		expect(core.e_environment_update_time()).toBe(false);
		core.timer.gt = 500;
		expect(core.e_environment_update_time()).toBe(true);
		expect([core.map_day, core.map_hour, core.map_minute]).toEqual([3, 23, 59]);
		// "last time update" snapshot is taken once until the game clears map_timeupdate
		expect([core.map_lday, core.map_lhour, core.map_lminute, core.map_timeupdate]).toEqual([3, 23, 59, 1]);
		core.timer.gt = 700;
		expect(core.e_environment_update_time()).toBe(false);
		core.timer.gt = 1000;
		expect(core.e_environment_update_time()).toBe(true);
		expect([core.map_day, core.map_hour, core.map_minute]).toEqual([4, 0, 0]);
		expect(days).toBe(1);
		expect(core.map_lminute).toBe(59); // unchanged while map_timeupdate=1
		expect(core.env_col).toEqual([23, 23, 55]); // light refreshed
	});
	it('stops for map_freezetime and in the editor', () => {
		const { core } = makeCore();
		core.timer.gt = 5000;
		core.map_freezetime = 1;
		expect(core.e_environment_update_time()).toBe(false);
		core.map_freezetime = 0;
		core.editor = true;
		expect(core.e_environment_update_time()).toBe(false);
		core.editor = false;
		expect(core.e_environment_update_time()).toBe(true);
	});
	it('snapshot rolls its own hour and day', () => {
		const { core } = makeCore();
		core.map_day = 1;
		core.map_hour = 23;
		core.map_minute = 59;
		core.timer.gt = 500;
		core.e_environment_update_time();
		expect([core.map_lday, core.map_lhour, core.map_lminute]).toEqual([2, 0, 0]);
	});
});

describe('moon and lens flare schedule', () => {
	it('moon fades in during hour 19 and out during hour 7', () => {
		const { core } = makeCore();
		const a = (h: number, m: number) => {
			core.map_hour = h;
			core.map_minute = m;
			return core.moonAlpha();
		};
		expect(a(18, 59)).toBe(-1);
		expect(a(19, 0)).toBe(0);
		expect(a(19, 30)).toBe(0.5);
		expect(a(19, 45)).toBe(0.75);
		expect(a(20, 0)).toBe(1);
		expect(a(3, 0)).toBe(1);
		expect(a(7, 0)).toBe(1);
		expect(a(7, 15)).toBe(0.75);
		expect(a(7, 59)).toBeCloseTo(1 / 60, 6);
		expect(a(8, 0)).toBe(-1);
		expect(a(12, 0)).toBe(-1);
	});
	it('moon sits at cam + (-2000,1000,-1500)', () => {
		const { core, engine } = makeCore();
		engine.cam = { x: 100, y: 40, z: -50 };
		core.map_hour = 22;
		core.e_environment_update();
		expect(engine.last('moon')).toEqual([true, 1, -1900, 1040, -1550]);
		core.map_hour = 12;
		core.e_environment_update();
		expect(engine.last('moon')![0]).toBe(false);
	});
	it('lens flare factor fades out during hour 18 and in during hour 7', () => {
		const { core } = makeCore();
		const a = (h: number, m: number, base = 1) => {
			core.map_hour = h;
			core.map_minute = m;
			return core.lensNightFactor(base);
		};
		expect(a(17, 59)).toBe(1);
		expect(a(18, 0)).toBe(1);
		expect(a(18, 30)).toBe(0.5);
		expect(a(19, 0)).toBe(0);
		expect(a(2, 0)).toBe(0);
		expect(a(7, 30)).toBe(0.5);
		expect(a(8, 0)).toBe(1);
		expect(a(18, 30, 0.35)).toBeCloseTo(0.175, 6);
	});
	it('places flares along the line from the sun through the screen centre', () => {
		const { core, engine } = makeCore();
		core.e_environment(0);
		core.map_hour = 12;
		core.settings.set_scrx = 800;
		core.settings.set_scry = 600;
		engine.projected = [700, 300]; // 300 px right of centre
		core.timer.f = 1;
		core.e_environment_update();
		// vx=400-700=-300, distance=300, nx=-1: fx = 400 - (-1*(300/offset))
		const f = engine.all('flare').slice(-6);
		expect(f.map((c) => c[2])).toEqual([700, 550, 500, 438, 300, 250]); // offsets 1,2,3,8,-3,-2 (437.5 -> 438)
		expect(f.every((c) => c[3] === 300 && c[1] === true)).toBe(true);
		// alpha fades in by 0.02*f per frame up to each flare's own alpha
		expect(f.map((c) => c[4] as number).every((v) => Math.abs(v - 0.02) < 1e-6)).toBe(true);
		for (let i = 0; i < 30; i++) core.e_environment_update();
		const g = engine.all('flare').slice(-6);
		g.forEach((c, i) => expect(c[4]).toBeCloseTo([0.4, 0.1, 0.3, 0.3, 0.2, 0.2][i], 6));
		// out of sight: fade out by 0.03*f, then hide
		engine.sunVisible = false;
		core.e_environment_update();
		expect(engine.all('flare').slice(-6)[0][4]).toBeCloseTo(0.37, 6);
		for (let i = 0; i < 20; i++) core.e_environment_update();
		expect(engine.all('flare').slice(-6).every((c) => c[1] === false)).toBe(true);
		// rain dims the flares to 0.35
		engine.sunVisible = true;
		core.env_cweather = 1;
		for (let i = 0; i < 40; i++) core.e_environment_update();
		expect(engine.all('flare').slice(-6)[0][4]).toBeCloseTo(0.4 * 0.35, 6);
		// set_flarefx=0 hides them
		core.set_flarefx = 0;
		core.e_environment_update();
		expect(engine.all('flare').slice(-6).every((c) => c[1] === false)).toBe(true);
	});
});

describe('weather', () => {
	it('climate picks the weather and the grey box fades by 0.002*f', () => {
		const { core, engine } = makeCore();
		core.map_climate = 3;
		core.e_environment(0);
		expect(core.env_cweather).toBe(1);
		expect(core.env_wa).toBe(0.75);
		core.e_environment_setweather(0);
		core.timer.f = 2;
		core.e_environment_update();
		expect(core.env_wa).toBeCloseTo(0.746, 6);
		expect(engine.last('wbox')![0]).toBe(true);
		for (let i = 0; i < 200; i++) core.e_environment_update();
		expect(core.env_wa).toBe(0);
		expect(engine.last('wbox')![0]).toBe(false);
	});
	it('rain emits three particles every in_gt20go and thunder with a flash', () => {
		const parts: ParticleRequest[] = [];
		const sounds: string[] = [];
		let fires = 0;
		// Rand(10)=1 and Rand(5)<>1 need different draws: 0 then 0.999
		const seq = [0, 0.5, 0.999];
		let k = 0;
		const { core } = makeCore(
			{
				p_add: (p) => parts.push(p),
				sfx: (s) => (sounds.push(s), 0),
				sfx_emit: (s) => (sounds.push('emit ' + s), 0),
				free_fire_states: () => fires++
			},
			() => seq[k++ % seq.length]
		);
		core.e_environment(0);
		core.e_environment_setweather(1);
		expect(fires).toBe(1);
		core.e_environment_setweather(3);
		expect(fires).toBe(1);
		core.e_environment_setweather(1);
		core.timer.in_gt20go = 1;
		core.timer.in_t2000go = 1;
		k = 0;
		core.e_environment_update();
		expect(sounds).toEqual(['emit rain', 'thunder1']);
		const flash = parts.filter((p) => p.typ === Cp_flash);
		expect(flash).toHaveLength(1);
		expect(flash[0].color).toEqual([255, 255, 255]);
		expect(flash[0].blend).toBe(3);
		expect(parts.filter((p) => p.typ === Cp_rain)).toHaveLength(3);
		// paused: no particles
		parts.length = 0;
		core.g_unpaused = 0;
		core.e_environment_update();
		expect(parts).toHaveLength(0);
	});
});

describe('e_environment_update_water', () => {
	it('switches surface, sky fog and fog range at y=0 and keeps the camera off the surface', () => {
		const sounds: string[] = [];
		const { core, engine } = makeCore({ sfx: (s) => (sounds.push(s), 0) });
		core.env_col = [255, 255, 255];
		core.map_fog = [255, 255, 255, 0];
		engine.cam.y = 30;
		core.timer.f = 1;
		core.e_environment_update_water();
		expect(engine.last('rotateSea2')).toEqual([0]);
		expect(engine.last('skyFX')).toEqual([9]);
		expect(engine.last('cameraFog')).toEqual([1, 500, 1100, 255, 255, 255]);
		expect(engine.last('drawWaterTexture')).toEqual([3, 2]);
		expect(core.env_seascr).toBeCloseTo(0.0003, 7);

		engine.cam.y = -30;
		core.timer.gt = 5000;
		core.e_environment_update_water();
		expect(engine.last('rotateSea2')).toEqual([-180]);
		expect(engine.last('skyFX')).toEqual([1]);
		expect(engine.last('cameraFog')).toEqual([1, 1, 500, 35, 145, 165]);
		expect(core.g_dive).toBe(1);
		expect(sounds).toEqual(['startdive']);

		// surfacing after more than 1500 ms without air: splash and gasp
		engine.cam.y = 0.4;
		core.timer.gt = 7000;
		core.e_environment_update_water();
		expect(sounds).toEqual(['startdive', 'splash2', 'gasp']);
		expect(engine.cam.y).toBe(1.3);
		engine.cam.y = -0.2;
		core.e_environment_update_water();
		expect(engine.cam.y).toBe(-1.3);
	});
	it('sets up the reflection texture size per set_water and renders it only above water', () => {
		const { core, engine } = makeCore();
		const sizes = [0, 1, 2, 3, 4, 5, 6].map((q) => {
			core.settings.set_water = q;
			core.e_environment_setup_water();
			return core.set_water_texsize;
		});
		expect(sizes).toEqual([0, 0, 0, 0, 64, 128, 256]);
		expect(engine.last('setupWaterReflection')).toEqual([256]);
		engine.cam.y = 20;
		core.timer.ms = 100;
		core.e_environment_update_water();
		expect(engine.all('renderWaterCubemap')).toHaveLength(1);
		engine.cam.y = -20;
		core.e_environment_update_water();
		expect(engine.all('renderWaterCubemap')).toHaveLength(1);
	});
	it('water 2D fx only under water with set_2dfx, strip sizes per set_water', () => {
		const { core, engine } = makeCore();
		core.timer.f = 1;
		engine.cam.y = 10;
		expect(core.e_environment_water2dfx()).toBeUndefined();
		engine.cam.y = -10;
		core.settings.set_water = 1;
		expect(core.e_environment_water2dfx()).toEqual({ step: 20, height: 20, ws: 6, inc: 20 });
		core.settings.set_water = 3;
		expect(core.e_environment_water2dfx()).toEqual({ step: 10, height: 10, ws: 12, inc: 15 });
		core.settings.set_water = 6;
		expect(core.e_environment_water2dfx()).toEqual({ step: 5, height: 10, ws: 18, inc: 7 });
		core.settings.set_2dfx = 0;
		expect(core.e_environment_water2dfx()).toBeUndefined();
		// Sin(90)*6=6, Sin(105)*6=5.8->6, Sin(120)*6=5.196->5, Sin(135)*6=4.24->4
		expect(water2dfxShifts(30, 10, 90, 15)).toEqual([6, 6, 5, 4]);
	});
});

describe('water texture animation', () => {
	it('CopyRect clips instead of wrapping and tolerates overlap', () => {
		const w = 4;
		const buf = new Uint8Array(w * w * 4);
		for (let i = 0; i < w * w; i++) buf[i * 4] = i;
		const px = () => Array.from({ length: w * w }, (_, i) => buf[i * 4]);
		copyRect(buf, w, w, 1, 0, 1, 4, 1, 1); // column 1 down by one
		expect(px()).toEqual([0, 1, 2, 3, 4, 1, 6, 7, 8, 5, 10, 11, 12, 9, 14, 15]);
		copyRect(buf, w, w, 0, 3, 4, 1, -2, 3); // row 3 left by two
		expect(px().slice(12)).toEqual([14, 15, 14, 15]);
		copyRect(buf, w, w, 4, 0, 1, 4, 4, 1); // x = size: entirely outside
		expect(px().slice(0, 4)).toEqual([0, 1, 2, 3]);
	});
	it('shift is Sin(isin+x*2.8125)*3 rounded to nearest', () => {
		expect(waterShift(0, 0)).toBe(0);
		expect(waterShift(0, 32)).toBe(3); // Sin(90)*3
		expect(waterShift(0, 96)).toBe(-3); // Sin(270)*3
		expect(waterShift(0, 4)).toBe(1); // Sin(11.25)*3=0.585
		expect(waterShift(90, 64)).toBe(-3); // Sin(270)
		expect(waterShift(30, 0)).toBe(2); // Sin(30)*3=1.5 -> even
	});
	it('level 0 just redraws the base image; other levels displace columns then rows', () => {
		const size = 128;
		const base = new Uint8Array(size * size * 4);
		for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) base.set([x, y, 0, 255], (y * size + x) * 4);
		const dst = new Uint8Array(base.length);
		drawWaterTexture(dst, base, size, 0, 77);
		expect(dst).toEqual(base);
		drawWaterTexture(dst, base, size, 3, 0);
		// Pixel (x,y): the row pass moved it from x-sx(y); the column pass before that from y-sy(x').
		const at = (x: number, y: number) => [dst[(y * size + x) * 4], dst[(y * size + x) * 4 + 1]];
		// row 32 shifts by +3, column 61 (source of x=64) shifts by Sin(171.56)*3=0.44 -> 0
		expect(at(64, 32)).toEqual([61, 32]);
		// row 64 shifts by Sin(180)*3=0; column 32 shifts down by 3
		expect(at(32, 64)).toEqual([32, 61]);
		// row 10 shifts by Sin(28.1)*3=1.41 -> 1: x=32 comes from column 31, which is down by 3 too
		expect(at(32, 10)).toEqual([31, 7]);
		// top rows of a down-shifted column keep the base image
		expect(at(32, 1)).toEqual([32, 1]);
		// level 1 uses 4 pixel wide strips: columns 32..35 all take the shift of x=32
		drawWaterTexture(dst, base, size, 1, 0);
		expect(at(35, 64)).toEqual([35, 61]);
	});
});

describe('grass spread', () => {
	it('density, spacing, fade range and alpha per set_grass', () => {
		expect(grassProperties(0).grass_c).toBe(0);
		const g = new GrassCore();
		const cm = new Uint8Array(4 * 4 * 3);
		const rows = [1, 2, 3, 4].map((q) => {
			g.grass_map(q, cm, 4, 16);
			return [g.grass_c, g.grass_dist, g.fade_start, g.fade_end, g.alpha, g.shown.length];
		});
		expect(rows).toEqual([
			[10, 23, 23, 115, 0.45, 121],
			[20, 22, 44, 220, 0.43, 441],
			[40, 21, 63, 420, 0.41, 1681],
			[80, 20, 100, 800, 0.39, 6561]
		]);
		// set_grass=0 keeps the previous grass_dist and allocates the single grass_h(0,0)
		g.grass_map(0, cm, 4, 16);
		expect([g.grass_c, g.grass_dist, g.shown.length]).toEqual([0, 20, 1]);
	});

	it('places tufts on the original grid and paints them from the colour map', () => {
		const g = new GrassCore();
		const size = 8;
		const cm = new Uint8Array(size * size * 3);
		for (let x = 0; x < size; x++) for (let y = 0; y < size; y++) cm.set([x * 10, y * 10, 7], (x * size + y) * 3);
		g.grass_map(1, cm, size, 16);
		// grass_f = (ter_size/mapsize)*Cworld_size = 2*64
		expect(g.grass_f).toBe(128);
		const ctx = {
			set_grass: 1,
			f: 1,
			in_t100go: 0,
			camX: 100.4,
			camZ: -57.6,
			camYaw: 0,
			ter_size: 16,
			terrainY: (x: number, z: number) => x * 0.5 + z,
			entityInView: () => true
		};
		expect(g.grass_spread(ctx)).toBe(1);
		// camx=100, camz=-58, half=-5: grass_x=((100/23)-5)*23=-23, grass_y=((-58/23)-5)*23=-161
		expect([g.grass_x, g.grass_y]).toEqual([-23, -161]);
		const n = 11;
		const tuft = (x: number, y: number) => {
			const i = x * n + y;
			return [g.pos[i * 3], g.pos[i * 3 + 1], g.pos[i * 3 + 2]];
		};
		// tuft(0,0): gx=-23 (odd, kept), gz=-161 (odd, kept)
		expect(tuft(0, 0)).toEqual([-23, -23 * 0.5 - 161, -161]);
		// tuft(1,1): gx=0 (even -> +23/2=11), gz=-138 (even -> -127)
		expect(tuft(1, 1)).toEqual([11, 11 * 0.5 - 127, -127]);
		// tuft(5,7): gx=92 -> 103, gz=0 -> 11
		expect(tuft(5, 7)).toEqual([103, 103 * 0.5 + 11, 11]);
		// colour map cell: gcx=Int((gx+512)/128), gcy=Int((gz+512)/128)
		// tuft(5,7): (103+512)/128=4.80 -> 5, (11+512)/128=4.09 -> 4
		const i = 5 * n + 7;
		expect([g.col[i * 3], g.col[i * 3 + 1], g.col[i * 3 + 2]]).toEqual([50, 40, 7]);
		expect(g.shown[i]).toBe(1);
		// wind: grass_wind += 2*f, texture rotation Sin(grass_wind)*1.5
		expect(g.grass_wind).toBe(2);
		expect(g.texRotation).toBeCloseTo(Math.sin((2 * Math.PI) / 180) * 1.5, 6);

		// same cell: no position update; visibility refresh only on in_t100go
		const v = g.version;
		expect(g.grass_spread({ ...ctx, entityInView: () => false })).toBe(2);
		expect(g.version).toBe(v);
		expect(g.shown[i]).toBe(1);
		expect(g.grass_spread({ ...ctx, in_t100go: 1, entityInView: () => false })).toBe(2);
		expect(g.shown[i]).toBe(0);
		// moving into the next grid cell triggers a position update
		expect(g.grass_spread({ ...ctx, camX: 116 })).toBe(1);
		expect(g.grass_x).toBe(0);
	});

	it('hides tufts outside the map or where the grass map says so', () => {
		const g = new GrassCore();
		const size = 4;
		const cm = new Uint8Array(size * size * 3).fill(100);
		g.grass_map(1, cm, size, 16); // world -512..512, grass_f=256
		const flags = new Uint8Array((size + 1) * (size + 1)).fill(1);
		flags[2 * (size + 1) + 2] = 0; // cell (2,2) around the origin
		g.loadGrassFlags(flags);
		const ctx = {
			set_grass: 1,
			f: 1,
			in_t100go: 0,
			camX: 0,
			camZ: 0,
			camYaw: 0,
			ter_size: 16,
			terrainY: () => 0,
			entityInView: () => true
		};
		g.grass_spread(ctx);
		const n = 11;
		// tuft(5,5): gx=0 -> 11: (11+512)/256=2.04 -> cell 2 -> disabled
		expect(g.shown[5 * n + 5]).toBe(0);
		// tuft(0,0): gx=-115: (-115+512)/256=1.55 -> cell 2 as well
		expect(g.shown[0]).toBe(0);
		// tuft(0,5): gx=-115 -> 2, gz=11 -> 2: still cell (2,2)
		// far corner of the map: camera at the edge puts half of the tufts outside
		g.grass_spread({ ...ctx, camX: 600, camZ: 0 });
		// tuft(10,5): gx=((600/23)-5+10)*23=713: (713+512)/256=4.79 -> 5 > mapsize -> hidden
		expect(g.shown[10 * n + 5]).toBe(0);
		// tuft(0,0): gx=483: 3.89 -> 4 = grass_mapsize: allowed index, flag from the map (1), colour never set (0,0,0)
		expect(g.shown[0]).toBe(1);
		expect([g.col[0], g.col[1], g.col[2]]).toEqual([0, 0, 0]);
		g.grass_colors(1, 2, 3);
		expect(Array.from(g.grass_rgb.slice(0, 3))).toEqual([1, 2, 3]);
		g.grass_free();
		expect(g.grass_x).toBe(-2147483648);
		expect(g.grass_spread(ctx)).toBe(0);
	});

	it('grass_heightmap disables grass in deep water and thins it on mountains', () => {
		const g = new GrassCore();
		const size = 4;
		g.grass_map(1, new Uint8Array(size * size * 3), size, 16);
		// h = TerrainY/3200+0.5: column x=0 deep (0.50), x=1 shallow (0.53), x=2 land (0.55), x=3 mountain (0.60)
		const heights = [0, 96, 160, 320];
		const terrainY = (x: number) => heights[Math.round((x + 512) / 256)];
		g.grass_heightmap(16, terrainY, new BlitzRandom(() => 0)); // Rand(n)=1 always
		const flag = (x: number, y: number) => g.grass_rgb[(x * (size + 1) + y) * 4 + 3];
		expect([flag(0, 0), flag(1, 0), flag(2, 0), flag(3, 0)]).toEqual([0, 1, 1, 1]);
		g.grass_heightmap(16, terrainY, new BlitzRandom(() => 0.99)); // Rand(n)<>1 always
		expect([flag(0, 0), flag(1, 0), flag(2, 0), flag(3, 0)]).toEqual([0, 0, 1, 0]);
	});
});

describe('terrain functions', () => {
	const make = (size: number, fill = 0.5) => {
		const heights = new Float32Array((size + 1) * (size + 1)).fill(fill);
		const ter = new Terrain(size, heights, new THREE.MeshBasicMaterial());
		return { ter, ed: new TerrainEditor(ter, new BlitzRandom(() => 0.75)) };
	};

	it('ModifyTerrain quantises to bytes and wraps the last row/column onto the first', () => {
		const { ed } = make(4);
		expect(quantizeHeight(0.5)).toBe(127 / 255);
		expect(quantizeHeight(1)).toBe(1);
		ed.ModifyTerrain(1, 2, 0.3);
		expect(ed.TerrainHeight(1, 2)).toBe(Math.fround(76 / 255));
		// raw map floats read back as the byte Blitz would hold
		expect(ed.TerrainHeight(3, 3)).toBe(Math.fround(127 / 255));
		// x=ter_size is the same cell as x=0
		ed.ModifyTerrain(4, 1, 1);
		expect(ed.TerrainHeight(0, 1)).toBe(1);
		expect(ed.TerrainHeight(4, 1)).toBe(1);
		ed.ModifyTerrain(0, 0, 0);
		expect([ed.TerrainHeight(4, 4), ed.TerrainHeight(0, 4), ed.TerrainHeight(4, 0)]).toEqual([0, 0, 0]);
	});

	it('flush rebuilds the mesh', () => {
		const { ter, ed } = make(4);
		ed.e_terrainborder(0.25);
		ed.ModifyTerrain(2, 2, 1);
		expect(ed.dirty).toBe(true);
		ed.flush();
		expect(ed.dirty).toBe(false);
		const pos = ter.mesh.geometry.getAttribute('position');
		expect(pos.getY(2 * 5 + 2)).toBe(1600);
		expect(pos.getY(0)).toBeCloseTo((63 / 255) * 3200 - 1600, 3);
		expect(ter.terrainY(ter.origin, ter.origin)).toBeCloseTo((63 / 255) * 3200 - 1600, 3);
	});

	it('e_terrainsmooth uses the 8/2/1 kernel over 20 on interior cells, in place', () => {
		const { ed } = make(4, 0);
		ed.ModifyTerrain(2, 2, 1);
		ed.e_terrainsmooth();
		// (1,1) is visited first: diagonal neighbour (2,2)=1 -> 1/20 -> byte 12
		expect(ed.TerrainHeight(1, 1)).toBe(Math.fround(12 / 255));
		// (1,2): edge neighbour (2,2)*2 plus already smoothed (1,1)*2: (2 + 2*12/255)/20 -> byte 26
		expect(ed.TerrainHeight(1, 2)).toBe(Math.fround(26 / 255));
		// borders untouched
		expect(ed.TerrainHeight(0, 2)).toBe(0);
	});

	it('border, complete height, transform and flatten', () => {
		const { ed } = make(8, 0.5);
		ed.e_terrainborder(-1, 0.2); // relative to the corner height 127/255
		// 127/255+0.2 = 0.698039 in single precision, times 255 = 178
		expect(ed.TerrainHeight(0, 3)).toBe(Math.fround(178 / 255));
		expect(ed.TerrainHeight(3, 0)).toBe(Math.fround(178 / 255));
		expect(ed.TerrainHeight(3, 3)).toBe(Math.fround(127 / 255));
		ed.e_terraincompleteh(0.9); // clamps at 1, interior only
		expect(ed.TerrainHeight(3, 3)).toBe(1);
		expect(ed.TerrainHeight(0, 3)).toBe(Math.fround(178 / 255));
		ed.e_terraincompleteh(-2);
		expect(ed.TerrainHeight(3, 3)).toBe(0);

		// round brush r=2 at (4,4): centre +0.5, direct neighbours +0.25, diagonals +0.5*(1-1.414/2)
		ed.e_terraintrans(4, 4, 0.5, 2);
		expect(ed.TerrainHeight(4, 4)).toBe(Math.fround(127 / 255));
		expect(ed.TerrainHeight(5, 4)).toBe(Math.fround(63 / 255));
		expect(ed.TerrainHeight(5, 5)).toBe(Math.fround(37 / 255));
		expect(ed.TerrainHeight(6, 4)).toBe(0); // dist = r is outside

		// flatten pulls neighbours toward the centre height by (1-dist/r)
		ed.e_terrainflatten(4, 4, 2);
		expect(ed.TerrainHeight(5, 4)).toBe(Math.fround(95 / 255)); // 63/255*0.5+127/255*0.5 = 95/255
		expect(ed.TerrainHeight(4, 4)).toBe(Math.fround(127 / 255));
	});

	it('random, distort and heightmap', () => {
		const { ed } = make(4, 0);
		ed.e_terrainrandom(1, 1, 0.4, 1); // +Rnd(0,0.4) with rnd 0.75 = 0.3
		expect(ed.TerrainHeight(1, 1)).toBe(Math.fround(76 / 255));
		ed.e_terrainrandom(1, 1, 0.4, 0); // +Rnd(-0.4,0.4) = +0.2
		expect(ed.TerrainHeight(1, 1)).toBe(Math.fround(127 / 255));
		ed.e_terrainrandom(1, 1, 0.4, -1); // -Rnd(0,0.4) = -0.3
		expect(ed.TerrainHeight(1, 1)).toBe(Math.fround(50 / 255));
		// Rand(3) with rnd 0.75 is 3: e_terraindistort leaves everything alone
		ed.e_terraindistort(0.5);
		expect(ed.TerrainHeight(2, 2)).toBe(0);
		const lo = new TerrainEditor(ed.terrain, new BlitzRandom(() => 0));
		lo.e_terraindistort(0.1); // Rand(3)=1 everywhere, Rnd(-0.1,0.1)=-0.1 -> wraps like the byte cast
		expect(lo.TerrainHeight(1, 1)).toBe(Math.fround(24 / 255));

		// heightmap: red channel * scale, image resized to ter_size
		const img = { width: 4, height: 4, data: new Uint8Array(64).fill(255) };
		for (let i = 0; i < 16; i++) img.data[i * 4] = i < 8 ? 255 : 0; // top half red=255
		expect(ed.e_terrainhm(undefined, 1)).toBe(0);
		expect(ed.e_terrainhm(img, 5)).toBe(1); // scale clamps to 1
		expect(ed.TerrainHeight(1, 0)).toBe(1);
		expect(ed.TerrainHeight(1, 3)).toBe(0);
	});

	it('e_terraincmscale picks the nearest power of two within 8..4096', () => {
		expect([1, 8, 11, 12, 13, 100, 190, 193, 5000, 9999].map(e_terraincmscale_size)).toEqual([
			8, 8, 8, 16, 16, 128, 128, 256, 4096, 4096
		]);
	});

	it('e_terpitch / e_terroll / wind sway', () => {
		// ground rising 1 per unit along +Z, 0.5 per unit along +X
		const ter = { tery: (x: number, z: number) => z + 0.5 * x };
		// PointEntity from z-s to z+s: pitch = -ATan2(dy, 2s) = -45
		expect(e_terpitch(ter, 10, 20, 1)).toBeCloseTo(-45, 5);
		// from x+s to x-s: dy = -1 over 2 -> +26.565
		expect(e_terroll(ter, 10, 20, 1)).toBeCloseTo(26.565, 3);
		expect(e_terpitch({ tery: () => 5 }, 0, 0, 3)).toBeCloseTo(0, 9);

		const h = new THREE.Object3D();
		const state = { windsway: 350 };
		update_object(h, state, 8, 2, 1.5, 1, 0, 40); // (350+8*1.5) Mod 360 = 2
		expect(state.windsway).toBe(2);
		const a = entityAngles(h);
		expect(a.roll).toBeCloseTo(Math.sin((2 * Math.PI) / 180) * 2, 5);
		expect(a.yaw).toBeCloseTo(40, 5);
		update_object(h, state, 8, 2, 1.5, 0, 0, 40); // set_windsway off
		expect(state.windsway).toBe(2);
	});
});

describe('frustum and wave matrix', () => {
	it('Frustum::cull keeps anything not entirely outside one plane', () => {
		const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
		// zoom 1, 4:3 viewport: |x| <= z, |y| <= 0.75 z, 1 <= z <= 3000
		expect(frustumCull([v(0, 0, 10)], 1, 3000, 1, 0.75)).toBe(true);
		expect(frustumCull([v(11, 0, 10)], 1, 3000, 1, 0.75)).toBe(false);
		expect(frustumCull([v(0, 8, 10)], 1, 3000, 1, 0.75)).toBe(false);
		expect(frustumCull([v(0, 0, -5)], 1, 3000, 1, 0.75)).toBe(false);
		expect(frustumCull([v(0, 0, 3001)], 1, 3000, 1, 0.75)).toBe(false);
		// a box straddling the left plane is in view
		expect(frustumCull([v(-12, 0, 10), v(-9, 0, 10)], 1, 3000, 1, 0.75)).toBe(true);
		// points outside different planes are not culled (Blitz's conservative test)
		expect(frustumCull([v(-50, 0, 10), v(50, 0, 10)], 1, 3000, 1, 0.75)).toBe(true);
	});

	it('finds shore cells, points waves up the slope and drops those with land behind', () => {
		// A beach: height rises along +X, sea level at x=0. ter_size 16 -> world -512..512.
		const beach = {
			size: 16,
			terrainY: (x: number) => x * 0.25,
			tery: (x: number) => Math.max(x * 0.25, -128)
		};
		const r = setupWaveMatrix(beach, 300);
		expect(r.waves.length).toBeGreaterThan(0);
		// Shore cells are |h|<5 -> |x|<20; cleanup keeps the lowest column, whose sample x is -8-16k...
		const xs = new Set(r.waves.map((w) => w.x));
		expect(xs.size).toBe(1);
		// slope rises toward +X: forward (-Sin(a),0,Cos(a)) must point to +X -> yaw 270
		expect(new Set(r.waves.map((w) => w.dir))).toEqual(new Set([270]));
		// a narrow channel (land again 100 units behind the shore) loses its spawns
		const channel = {
			size: 16,
			terrainY: (x: number) => x * 0.25,
			tery: (x: number) => (x < -100 ? 10 : x * 0.25)
		};
		expect(setupWaveMatrix(channel, 300).waves).toHaveLength(0);
		expect(setupWaveMatrix(channel, 50).waves.length).toBeGreaterThan(0);
	});
});

const root = resolve('static/game/mod');
describe.skipIf(!existsSync(root))('original data', () => {
	it('parses the shipped lightcycle.inf to the table used above', () => {
		const lines = readFileSync(resolve(root, 'sys/lightcycle.inf'), 'latin1').replaceAll('\r', '').split('\n');
		const { core } = makeCore();
		const expected = core.Dlightcycle.map((r) => [...r]);
		core.load_lightcycle(lines);
		expect(core.Dlightcycle).toEqual(expected);
		expect(core.Dlightcycle[7]).toEqual([255, 100, 50]);
		expect(core.Dlightcycle[21]).toEqual([100, 100, 150]);
	});
});
