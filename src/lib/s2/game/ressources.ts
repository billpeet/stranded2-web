/**
 * includes/ressources.bb: load_res, load_soundset, play_soundset, and
 * sfx_emit of sfx.bb (it takes an entity).
 *
 * The functions are the audio layer's ports (S2Audio); this module gives
 * them the original signatures for game code: entities are bb3d handles, and
 * load_res returns the handle type of the resource class:
 *
 *   Cres_image              ImageHandle (0 = failed)
 *   Cres_texture            Texture | null
 *   Cres_mesh, _animmesh    Handle (null = failed)
 *   Cres_sound, Cres_music  sound handle number (0 = failed)
 *
 * One Tres list holds all classes (types.ts Tres = S2Audio.Tres).
 */
import type { Handle, Texture } from '../bb3d';
import type { ImageHandle } from '../gfx2d';
import { Cres_animmesh, Cres_image, Cres_mesh, Cres_music, Cres_sound, Cres_texture } from './consts';
import { load_animmesh, load_image, load_mesh, load_texture } from './load_functions';
import { RT } from './rt';
import { audioEntity } from './runtime';
import { G } from './state';

/**
 * The non-sound branches of load_res's Select:
 *     Case Cres_image Tres\h=load_image(path$,mode)
 *     Case Cres_texture Tres\h=load_texture(path$)
 *     Case Cres_mesh Tres\h=load_mesh(path$)
 *     Case Cres_animmesh Tres\h=load_animmesh(path$)
 * with set_debug switched off around them, as the original does.
 * Installed as S2Audio's `load_other_res` by installResourceLoader().
 */
function load_other_res(path: string, typ: number, mode: number): number {
	// Headless tests do not preload the mod's media: a file that was not preloaded counts as
	// "cannot be loaded" (0) instead of raising the loaders' RuntimeError. Preload what a test needs
	// with `await RT.world.preload([...])`.
	if (RT.headless) {
		const r = RT.world.resources;
		const ok = typ === Cres_mesh || typ === Cres_animmesh ? r.model(path) !== undefined : r.hasImage(path);
		if (!ok) return 0;
	}
	const debug = G.set_debug;
	G.set_debug = 0;
	let h: unknown = 0;
	try {
		switch (typ) {
			case Cres_image:
				h = load_image(path, mode);
				break;
			case Cres_texture:
				h = load_texture(path);
				break;
			case Cres_mesh:
				h = load_mesh(path);
				break;
			case Cres_animmesh:
				h = load_animmesh(path);
				break;
		}
	} finally {
		G.set_debug = debug;
	}
	return h as number;
}

let installedOn: object | null = null;
function audio() {
	const a = RT.audio;
	if (installedOn !== a) {
		(a.host as { load_other_res?: typeof load_other_res }).load_other_res = load_other_res;
		installedOn = a;
	}
	return a;
}

/** Function load_res(path$,typ,mode=1): 0 / null when the file (or its .inf link) is missing or cannot be loaded. */
export function load_res(path: string, typ: typeof Cres_image, mode?: number): ImageHandle;
export function load_res(path: string, typ: typeof Cres_texture, mode?: number): Texture | null;
export function load_res(path: string, typ: typeof Cres_mesh | typeof Cres_animmesh, mode?: number): Handle;
export function load_res(path: string, typ: typeof Cres_sound | typeof Cres_music, mode?: number): number;
export function load_res(path: string, typ: number, mode?: number): ImageHandle | Texture | Handle | number;
export function load_res(path: string, typ: number, mode = 1): ImageHandle | Texture | Handle | number {
	const h = audio().load_res(path, typ, mode) as unknown;
	if (h === 0 && (typ === Cres_texture || typ === Cres_mesh || typ === Cres_animmesh)) return null;
	return h as ImageHandle | Texture | Handle | number;
}

/** Function load_soundset(name$) */
export function load_soundset(name: string): number {
	return audio().load_soundset(name);
}

/** Function play_soundset(name$,sound,entity): the channel, 0 when the set or sound does not exist. */
export function play_soundset(name: string, sound: number, entity: Handle): number {
	if (entity === null) return 0;
	return audio().play_soundset(name, sound, audioEntity(entity));
}

/** sfx.bb: Function sfx_emit(sound,emitter,volume#=1.): 3D sound that follows the entity. */
export function sfx_emit(sound: number, emitter: Handle, volume = 1): number {
	if (emitter === null) return 0;
	return audio().sfx_emit(sound, audioEntity(emitter), volume);
}
