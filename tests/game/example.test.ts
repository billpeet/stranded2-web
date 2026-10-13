/**
 * The worked example of src/lib/s2/game/PORTING_GUIDE.md, section 12: how to
 * test a ported game module headlessly. It tests modules of the foundation
 * (definitions, resources, the object model loader, the command line) the
 * way a work package tests its own.
 *
 *     pnpm vitest run tests/game/example
 */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EntityX, PositionEntity, type BBEntity } from '../../src/lib/s2/bb3d';
import { Rand, SeedRnd, setClock } from '../../src/lib/s2/blitz';
import { BackBuffer, Color, ReadPixelFast, Rect, SetBuffer } from '../../src/lib/s2/gfx2d';
import { injectKeyDown, injectKeyUp, injectMouseMove } from '../../src/lib/s2/input';
import { Cclass_unit, Cres_image } from '../../src/lib/s2/game/consts';
import { Dobject_model, Dobject_modelh, Dunit_name, load_object_model, loadAllDefinitions } from '../../src/lib/s2/game/defs';
import { DEFS, resetDefs } from '../../src/lib/s2/game/defs_store';
import { clearDeferred, defer, frame, runDeferred, setFrameHook, setFrameScheduler } from '../../src/lib/s2/game/flow';
import { getinput } from '../../src/lib/s2/game/input';
import { include_load_commandline } from '../../src/lib/s2/game/load_commandline';
import { include_load_setup } from '../../src/lib/s2/game/load_setup';
import * as mods from '../../src/lib/s2/game/mods';
import { parse_task } from '../../src/lib/s2/game/parser_functions';
import { var_get } from '../../src/lib/s2/game/parser_vars';
import { load_res } from '../../src/lib/s2/game/ressources';
import { RT, hasRuntime } from '../../src/lib/s2/game/rt';
import { createTestRuntime, disposeRuntime } from '../../src/lib/s2/game/runtime';
import { G, resetGameState } from '../../src/lib/s2/game/state';
import { setCommandLine } from '../../src/lib/s2/game/sys';
import { CONST_STORE, DeleteEach, New, TYPES, Tunit } from '../../src/lib/s2/game/types';
import { NodeVfs } from '../NodeVfs';

const MOD = resolve('static/game/mod');

describe.skipIf(!existsSync(MOD))('worked example: a headless module test', () => {
	let now = 0;

	beforeEach(async () => {
		// RT, files, lists and G wired; no window, no WebGL, no sound device
		await createTestRuntime({ vfs: new NodeVfs(MOD) });
		setFrameScheduler((cb) => cb()); // frame() returns at once
		now = 1000;
		setClock(() => (now += 20)); // MilliSecs(): 20 ms per call, deterministic
		SeedRnd(0x1234); // the Rnd/Rand sequence of a fresh program
		include_load_setup(); // cam, listener, env_light, RT.core (as StrandedII.bb does)
		await loadAllDefinitions(); // the D... accessors, Tfind, Tdefvar, constants
	});

	afterEach(() => {
		disposeRuntime();
		resetGameState();
		resetDefs();
		clearDeferred();
		setFrameScheduler(null);
		setFrameHook(null);
		setCommandLine(null);
		setClock(() => performance.now());
		for (const t of Object.values(TYPES)) {
			try {
				DeleteEach(t);
			} catch {
				// the Tconst view
			}
		}
		CONST_STORE.clear();
		vi.restoreAllMocks();
	});

	it('3D: commands work without a renderer; models load after preload', async () => {
		expect(G.cam).not.toBeNull();
		expect(hasRuntime('env')).toBe(false); // no drawing half of the environment
		const typ = [...DEFS.objects.byId.values()].find((o) => o.model.toLowerCase().endsWith('.b3d'))!.id;

		// not preloaded: the loader reports "cannot be loaded", as for a broken file
		expect(() => load_object_model(typ)).toThrow('Unable to load ' + Dobject_model(typ));

		await RT.world.preload([Dobject_model(typ)]);
		load_object_model(typ);
		const h = Dobject_modelh(typ) as BBEntity;
		expect(h).not.toBeNull();
		PositionEntity(h, 10, 0, -5);
		expect(EntityX(h)).toBe(10);
	});

	it('calls into a package that is not ported: spy on its skeleton', () => {
		// parse_commandline() ends with mod_check() of mods.bb
		const mod_check = vi.spyOn(mods, 'mod_check').mockImplementation(() => {});
		setCommandLine('-debug -win');
		include_load_commandline();
		expect(mod_check).toHaveBeenCalledOnce();
		expect(G.set_debug).toBe(1);
		expect(G.set_scrwin).toBe(2);
	});

	it('scripts: run one through the engine, or record what the module asks of it', () => {
		const u = New(Tunit);
		u.id = 7;
		u.typ = 1;
		// the real interpreter
		parse_task(Cclass_unit, 7, 'test', '', 'on:test {\xa6$seen=' + '1;\xa6}\xa6');
		RT.script.parse_all();
		expect(var_get('seen')).toBe('1');
		// or a recording hook
		const calls: string[] = [];
		vi.spyOn(RT.script, 'parse_task').mockImplementation((cls, id, event) => {
			calls.push(`${cls}:${id}:${event}`);
		});
		parse_task(Cclass_unit, 7, 'kill', '', '');
		expect(calls).toEqual(['2:7:kill']);
		expect(Dunit_name(1)).not.toBe('');
	});

	it('sound: silent; assert on the calls', () => {
		const sfx = vi.spyOn(RT.audio, 'sfx');
		RT.audio.sfx(G.sfx_click, 0.5);
		expect(sfx).toHaveBeenCalledWith(G.sfx_click, 0.5);
		expect(load_res('sfx\\click.wav', 2)).toBe(0); // no sound files unless createTestRuntime({ sounds: true })
	});

	it('input, time and frames are under the control of the test', async () => {
		injectMouseMove(320, 200);
		injectKeyDown(57); // space
		getinput();
		expect(G.in_mx).toBe(320);
		expect(G.in_my).toBe(200);
		expect(G.ms).toBe(now);
		injectKeyUp(57);

		// a blocking loop of the original: runs until the hook "presses" something
		let frames = 0;
		let done = false;
		setFrameHook(() => {
			if (++frames === 3) done = true;
		});
		while (!done) await frame();
		expect(frames).toBe(3);

		// deferred work of a sync barrier
		defer(async () => {
			await frame();
			G.m_menu = 5;
		});
		await runDeferred();
		expect(G.m_menu).toBe(5);
	});

	it('2D: draw into the back buffer and read it back; images after preload', async () => {
		SetBuffer(BackBuffer());
		Color(255, 0, 0);
		Rect(10, 10, 4, 4, 1);
		expect(ReadPixelFast(11, 11, BackBuffer()) & 0xffffff).toBe(0xff0000);
		await RT.world.preload(['sys\\gfx\\defaulticon.bmp']);
		const img = load_res('sys\\gfx\\defaulticon.bmp', Cres_image, 0);
		expect(img).not.toBe(0);
	});

	it('random numbers are the program-wide generator', () => {
		SeedRnd(42);
		const a = [Rand(1, 100), RT.script.Rand(1, 100)];
		SeedRnd(42);
		expect([Rand(1, 100), Rand(1, 100)]).toEqual(a);
	});
});
