/**
 * includes/e_environment.bb: the functions that already exist in the
 * environment layer (engine/environment, on the bb3d world through
 * bb3d/environment.ts WorldEnvironment), under their original names.
 *
 * The owner of e_environment.ts re-exports this module and ports what is
 * left: e_terrain, e_gc, e_teralign. (e_skybox has no counterpart as a
 * function: the layer builds the sky in e_environment(); use
 * `RT.env.skytexture(path)` to change it.)
 *
 * ## How the layer differs from the original
 *
 * - The terrain is a `Terrain` object (RT.env.terrain) plus the proxy entity
 *   G.ter; the colour map is data inside the layer (RT.env.colormap), not the
 *   texture ter_tex_color. Sea, sky, ground, moon, flares are drawn by the
 *   layer; G.env_sea, G.env_sea2, G.env_ground are proxy entities.
 * - A frame of the original
 *
 *       e_environment_update_water() : e_environment_update()
 *       RenderWorld() : e_environment_water2dfx() : grass_spread()
 *
 *   ports with exactly these calls, but RenderWorld must be the one exported
 *   HERE: it renders through the layer, which applies the under-water
 *   distortion of e_environment_water2dfx in the same pass (a browser cannot
 *   distort the frame afterwards with CopyRect). e_environment_water2dfx()
 *   itself then has nothing left to do.
 * - Without WebGL (headless tests) only the logic half exists (RT.core):
 *   time, weather, light colours, water timers. Functions that need the
 *   drawing half do nothing there.
 */
import { TerrainY } from '../bb3d';
import type { EnvCore } from '../engine/environment/envCore';
import { e_terpitch as e_terpitch_, e_terroll as e_terroll_, type TerrainEditor } from '../engine/environment/terrainEdit';
import { bmpf_loadscreen } from './load_bmpf';
import { RT, hasRuntime } from './rt';
import { G } from './state';

const has = (): boolean => hasRuntime('env');

/** The layer's private per-frame syncs (planes follow the camera, flares). */
function sync(...names: ('syncPlanes' | 'syncFlares')[]): void {
	if (!has()) return;
	const e = RT.env as unknown as Record<string, () => void>;
	for (const n of names) e[n]();
}

// ---------------------------------------------------------------- environment

/** Function e_environment(update=1): build sea, sky, flares, moon, weather box, ground. */
export function e_environment(...a: Parameters<EnvCore['e_environment']>): void {
	RT.core.e_environment(...a);
}

/** Function e_environment_update(): time, weather, sky and light, flares. */
export function e_environment_update(): void {
	RT.core.e_environment_update();
	sync('syncPlanes', 'syncFlares');
}

/** Function e_environment_update_light() */
export function e_environment_update_light(): void {
	RT.core.e_environment_update_light();
}

/** Function e_environment_update_water(): water texture animation, waves, reflection. */
export function e_environment_update_water(): void {
	if (has()) {
		RT.env.cam.obj.updateMatrixWorld();
		RT.env.terrainEditor?.flush();
		sync('syncPlanes');
	}
	RT.core.e_environment_update_water();
}

/** Function e_environment_setup_water() */
export function e_environment_setup_water(): void {
	RT.core.e_environment_setup_water();
}

/**
 * Function e_environment_water2dfx(): the under-water distortion of the
 * rendered frame. Done by RenderWorld() of this module (see above); kept so
 * that the ported frame reads like the original.
 */
export function e_environment_water2dfx(): void {}

/**
 * RenderWorld for the main scene: the bb3d world through the environment
 * layer (with the under-water effect). Import it from here in game.ts,
 * menu.ts, editor.ts; plain bb3d RenderWorld elsewhere (e.g. the logo screen).
 */
export function RenderWorld(): void {
	if (has()) RT.env.render();
	else RT.world.renderWorld();
}

/** Function e_environment_setweather(weather) */
export function e_environment_setweather(...a: Parameters<EnvCore['e_environment_setweather']>): void {
	RT.core.e_environment_setweather(...a);
}

/** Function e_addflare(sprite,scale#,alpha#,order,offset#) */
export function e_addflare(...a: Parameters<EnvCore['e_addflare']>): void {
	RT.core.e_addflare(...a);
}

/** Function e_tercol(r,g,b,id) */
export function e_tercol(...a: Parameters<EnvCore['e_tercol']>): void {
	RT.core.e_tercol(...a);
}

// ---------------------------------------------------------------- terrain

function ed(): TerrainEditor {
	const e = has() ? RT.env.terrainEditor : undefined;
	if (!e) throw new Error('e_terrain*: there is no terrain (no map loaded, or headless runtime)');
	return e;
}

/** Function e_terrainsmooth() */
export function e_terrainsmooth(): void {
	ed().e_terrainsmooth();
}
/** Function e_terraindistort(power#) */
export function e_terraindistort(...a: Parameters<TerrainEditor['e_terraindistort']>): void {
	ed().e_terraindistort(...a);
}
/** Function e_terrainrandom(x,z,max#=0.3,mode=0) */
export function e_terrainrandom(...a: Parameters<TerrainEditor['e_terrainrandom']>): void {
	ed().e_terrainrandom(...a);
}
/**
 * Function e_terrainhm(path$,scale#): heights from an image file. The three
 * load screens of the original are not shown (sync barrier).
 */
export function e_terrainhm(path: string, scale: number): number {
	return ed().e_terrainhm(RT.world.resources.pixels(path), scale);
}
/** Function e_terraincompleteh(change#) */
export function e_terraincompleteh(...a: Parameters<TerrainEditor['e_terraincompleteh']>): void {
	ed().e_terraincompleteh(...a);
}
/** Function e_terrainborder(absh#,change#=0) */
export function e_terrainborder(...a: Parameters<TerrainEditor['e_terrainborder']>): void {
	ed().e_terrainborder(...a);
}
/** Function e_terraintrans(rx,rz,change#,r=1) */
export function e_terraintrans(...a: Parameters<TerrainEditor['e_terraintrans']>): void {
	ed().e_terraintrans(...a);
}
/** Function e_terrainflatten(rx,rz,r=1) */
export function e_terrainflatten(...a: Parameters<TerrainEditor['e_terrainflatten']>): void {
	ed().e_terrainflatten(...a);
}
/** Function e_terrainsmoothp(rx,rz,r=1) */
export function e_terrainsmoothp(...a: Parameters<TerrainEditor['e_terrainsmoothp']>): void {
	ed().e_terrainsmoothp(...a);
}
/** Function e_terraindistortp(rx,rz,change#,r=1) */
export function e_terraindistortp(...a: Parameters<TerrainEditor['e_terraindistortp']>): void {
	ed().e_terraindistortp(...a);
}

/** Function e_terraincm(file$,loadscreen=1): load the colour map. 0 when the file does not exist. */
export async function e_terraincm(file: string, loadscreen = 1): Promise<number> {
	if (loadscreen === 1) await bmpf_loadscreen('Loading Colormap');
	if (!has()) return 0;
	return RT.env.e_terraincm(file);
}

/**
 * Function e_terraincmscale(newscale): scale the colour map. The load screen
 * and the two "min./max. size" message boxes of the original are not shown
 * (sync barrier); the size is clamped the same way.
 */
export function e_terraincmscale(newscale: number): number {
	if (!has()) return newscale;
	return RT.env.e_terraincmscale(newscale);
}

/** Function e_terrainground(fx=1) */
export function e_terrainground(fx = 1): void {
	if (has()) RT.env.e_terrainground(fx);
	else RT.core.engine.e_terrainground(fx);
}

/** Function e_tery#(x#,z#): terrain height, never below the ground level. */
export function e_tery(x: number, z: number): number {
	if (has() && RT.env.terrain) return RT.env.terrain.tery(x, z);
	if (G.ter === null) return G.ter_groundy;
	const y = TerrainY(G.ter, x, 0, z);
	if (y < G.ter_groundy) return G.ter_groundy;
	return y;
}

const TERY = { tery: e_tery };

/** Function e_terpitch#(x#,z#,s#=1) */
export function e_terpitch(x: number, z: number, s = 1): number {
	return e_terpitch_(TERY, x, z, s);
}

/** Function e_terroll#(x#,z#,s#=1) */
export function e_terroll(x: number, z: number, s = 1): number {
	return e_terroll_(TERY, x, z, s);
}
