/**
 * Shared setup of the combat package's tests (tests/game/combat*.test.ts):
 * the headless runtime of tests/game/example.test.ts plus the particle
 * textures that load_media.bb would have loaded.
 */
import { resolve } from 'node:path';
import { vi } from 'vitest';
import { CreateTexture } from '../../src/lib/s2/bb3d';
import { SeedRnd, setClock } from '../../src/lib/s2/blitz';
import { loadAllDefinitions } from '../../src/lib/s2/game/defs';
import { resetDefs } from '../../src/lib/s2/game/defs_store';
import { clearDeferred, setFrameHook, setFrameScheduler } from '../../src/lib/s2/game/flow';
import { include_load_setup } from '../../src/lib/s2/game/load_setup';
import { createTestRuntime, disposeRuntime } from '../../src/lib/s2/game/runtime';
import { G, resetGameState } from '../../src/lib/s2/game/state';
import { setCommandLine } from '../../src/lib/s2/game/sys';
import { CONST_STORE, DeleteEach, TYPES, Tp } from '../../src/lib/s2/game/types';
import { NodeVfs } from '../NodeVfs';

export const MOD = resolve('static/game/mod');

export const clock = { now: 1000 };

export async function setupCombat(): Promise<void> {
	await createTestRuntime({ vfs: new NodeVfs(MOD) });
	setFrameScheduler((cb) => cb());
	clock.now = 1000;
	setClock(() => (clock.now += 20));
	SeedRnd(0x1234);
	include_load_setup(); // cam, camxz, and (through live()) mb_setup of this package
	await loadAllDefinitions();
	// load_media.bb: the particle textures
	const tex = () => CreateTexture(8, 8);
	G.gfx_p_flare = [tex(), tex(), tex()];
	G.gfx_p_bubbles = [tex(), tex()];
	G.gfx_p_roundwave = [tex()];
	G.gfx_p_wave = [tex()];
	G.gfx_p_smoke = [tex(), tex()];
	G.gfx_p_spark = [tex()];
	G.gfx_p_splatter = [tex(), tex(), tex()];
	G.gfx_p_woodfrag = [tex(), tex(), tex(), tex(), tex()];
	G.gfx_p_flames = [tex()];
	G.gfx_p_starflare = tex();
	G.gfx_p_puddle = [tex()];
	G.gfx_p_shockwave = tex();
	G.gfx_p_splash = [tex()];
	G.gfx_p_attack = [tex(), tex()];
	G.gfx_rain = tex();
	G.gfx_snow = tex();
	G.f = 1;
}

export function teardownCombat(): void {
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
}

/** Every live particle, in list order. */
export function particles(): Tp[] {
	return Tp.list.toArray();
}
