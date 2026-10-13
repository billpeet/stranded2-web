/**
 * RT: the runtime singletons of the running game session. This module only
 * holds them (so that every game module can import it without pulling in the
 * layers); runtime.ts creates and wires them.
 *
 *   RT.vfs      read-only view of the mod directory
 *   RT.world    bb3d World (also World.current, which the 3D commands act on)
 *   RT.core     EnvCore: the logic half of e_environment.bb (always there)
 *   RT.env      WorldEnvironment: its drawing half (browser only: needs WebGL)
 *   RT.audio    S2Audio (sfx.bb, speech.bb, sound part of ressources.bb)
 *   RT.script   ScriptEngine (parser*.bb, timer.bb)
 *   RT.timer    FrameTimer bound to G.ms / G.gt / G.f / G.in_t*
 *
 * Reading a member before the runtime exists throws with a clear message
 * instead of failing later with "undefined is not a function".
 */
import type { S2Audio } from '../audio/S2Audio';
import type { World } from '../bb3d';
import type { WorldEnvironment } from '../bb3d/environment';
import type { MeshCache } from '../engine/b3dToThree';
import type { EnvCore } from '../engine/environment/envCore';
import type { FrameTimer } from '../engine/environment/fps';
import type { TextureCache } from '../engine/textures';
import type { Vfs } from '../io/Vfs';
import type { ScriptEngine } from '../script/engine';

export interface Runtime {
	vfs: Vfs;
	world: World;
	core: EnvCore;
	/** Undefined in a headless runtime. */
	env: WorldEnvironment;
	audio: S2Audio;
	script: ScriptEngine;
	timer: FrameTimer;
	textures: TextureCache;
	meshes: MeshCache;
	/** True for createTestRuntime(): no renderer, fake audio backend. */
	headless: boolean;
}

const slots: Partial<Runtime> = {};
const KEYS = new Set<string>(['vfs', 'world', 'core', 'env', 'audio', 'script', 'timer', 'textures', 'meshes']);

export const RT: Runtime = new Proxy(slots as Runtime, {
	get(target, key) {
		const v = (target as unknown as Record<string | symbol, unknown>)[key];
		if (v === undefined && typeof key === 'string' && KEYS.has(key)) {
			throw new Error(
				key === 'env' && target.headless
					? 'RT.env does not exist in a headless runtime (no WebGL): use RT.core, or guard with hasRuntime("env")'
					: `RT.${key} is not available: create the runtime first (runtime.ts createRuntime / createTestRuntime)`
			);
		}
		return v;
	}
});

/** True once that member exists. */
export function hasRuntime(key: keyof Runtime = 'script'): boolean {
	return slots[key] !== undefined;
}

/** runtime.ts only. */
export function installRuntime(part: Partial<Runtime>): void {
	Object.assign(slots, part);
}

/** runtime.ts only. */
export function clearRuntime(): void {
	for (const k of Object.keys(slots)) delete (slots as Record<string, unknown>)[k];
}
