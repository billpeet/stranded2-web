/**
 * Package "map": temporary additions to the shared files (PORTING_GUIDE.md section 4).
 *
 * 1. The bridge between the line-by-line ports of e_terrain / e_clear /
 *    load_map / save_map and the environment layer (RT.env, browser only).
 * 2. Substitutes for things that are missing in files this package may not edit.
 * 3. Signature corrections (comments at the end).
 *
 * ## The bridge
 *
 * The original keeps the terrain in the entity `ter`, the colour map in the
 * texture `ter_tex_color` and the grass flags in `grass_rgb(x,y,3)`. The
 * environment layer keeps them in its own objects (RT.env.terrain, an
 * engine `Terrain` whose proxy entity is G.ter; RT.env.colormap;
 * RT.env.grass.grass_rgb) and offers RT.env.setMap(map, terrain) to set all
 * of it from a parsed map file. setMap cannot be used by load_map: it runs
 * e_clear and e_environment itself, in one step, while the original needs
 * the terrain long before the environment is built (objects are placed on
 * it, on:preload runs in between) and builds the environment exactly once.
 * So the ported functions do what the original does, statement by statement,
 * on G.ter / G.ter_tex_color, and the functions below keep the layer's copies
 * in step. They use four members of Environment / WorldEnvironment that are
 * declared private or protected (EnvPrivate).
 *
 * WHAT SHOULD CHANGE IN THE FOUNDATION
 *  - bb3d/environment.ts WorldEnvironment: make `adoptTerrain` public, and
 *    engine/environment/Environment.ts: make `setColormapData`,
 *    `loadSkyTextures`, `gfx_waterimg_custom`, `waterAlpha` accessible (or add
 *    the three methods createTerrain(size) / freeTerrain() / setColormap(rgb,size)
 *    this file emulates). Then EnvPrivate goes away.
 *  - Environment.load() (media of the environment) is only called by setMap.
 *    load_map and randommapcreate call it through envLoad(); a code path that
 *    builds a terrain or the environment without loading a map first (editor
 *    "new map" before any map was loaded) has no gfx_water. load_media should
 *    await RT.env.load().
 *  - grasspread.ts grass_map() does nothing without RT.env, so G.grass_rgb is
 *    never dimensioned in a headless runtime. grassMapHeadless() below is the
 *    "Generate Colormap Array" part of grass_map() on G; grasspread.ts should
 *    do that itself. grass_rgb_get / grass_rgb_set are `grass_rgb(x,y,c)` for
 *    whichever storage exists (RT.env.grass.grass_rgb or G.grass_rgb).
 *  - G.ter_groundy and RT.env.terrain.groundY are two storages of one global
 *    (e_tery reads the layer's, game code G's). e_terrainground() of the layer
 *    only updates its own. envSyncGroundY() copies G -> layer after load_map
 *    computed it; e_environment.ts wraps e_terrainground to copy layer -> G.
 *  - The colour map exists twice in the browser: G.ter_tex_color (what ported
 *    code reads and writes pixel by pixel: load_map, save_map, the editor's
 *    buffer functions) and RT.env.colormap (what is drawn, what the facades
 *    e_terraincm / e_terraincmscale change). envColormapFromTexture() pushes
 *    the texture to the layer (e_terrain does it; the editor must call it after
 *    it wrote into TextureBuffer(ter_tex_color)); terTexColorFromEnv() pulls
 *    the layer's colour map back into G.ter_tex_color when the layer replaced
 *    it since the last push (save_map calls it first).
 *  - engine/collision/terrainCollider.ts repHeight: byte/255 instead of the
 *    runtime's byte*float32(1/255); see TerrainHeight_exe() below.
 *  - e_clear() frees the proxies of sea and ground and the layer's terrain, but
 *    the layer's own sea / sky / ground / moon / flare meshes stay in the scene
 *    until the next e_environment() rebuilds them (the layer has no "free").
 *  - _stubs.ts: STUBS.e_clear is no longer used (e_clear is ported), and
 *    include_collisions / include_randommap no longer fall back to STUBS.nothing.
 */
import * as THREE from 'three';
import { CreateTexture, FreeTexture, TerrainHeight, TextureBuffer, TextureHeight, type Handle } from '../../bb3d';
import { f32 } from '../../blitz';
import { TerrainEditor } from '../../engine/environment/terrainEdit';
import { Terrain } from '../../engine/terrain';
import { RT, hasRuntime } from '../rt';
import { G, dim } from '../state';

// =====================================================================================
// environment bridge
// =====================================================================================

/** The members of Environment / WorldEnvironment the bridge needs although they are not public. */
interface EnvPrivate {
	adoptTerrain(terrain: Terrain): void;
	setColormapData(colormap: Uint8Array, size: number): void;
	loadSkyTextures(): Promise<void>;
	gfx_waterimg_custom?: Uint8Array;
	waterAlpha: number;
	terrain?: Terrain;
	terrainEditor?: TerrainEditor;
}

/** True when the drawing half of the environment exists (browser). */
export function envHas(): boolean {
	return hasRuntime('env');
}

const priv = (): EnvPrivate => RT.env as unknown as EnvPrivate;

/** The engine Terrain this bridge created (so that it can be taken out of the scene again). */
let bridgeTerrain: Terrain | null = null;
/** RT.env.colormap as last pushed by envColormapFromTexture (identity tells whether the layer replaced it). */
let pushedColormap: Uint8Array | null = null;

/** Environment.load(): the environment's media. Before the first terrain / e_environment(). */
export async function envLoad(): Promise<void> {
	if (!envHas()) return;
	await RT.env.load();
}

/**
 * The texture loading half of e_skybox(map_skybox$), which the layer does
 * asynchronously: call (and await) before e_environment().
 */
export async function envLoadSky(): Promise<void> {
	if (!envHas()) return;
	await RT.env.load();
	await priv().loadSkyTextures();
}

/**
 * `ter=CreateTerrain(ter_size)` for the environment layer: an engine Terrain
 * (all heights 0, as a new Blitz terrain) in the scene, adopted by the layer;
 * G.ter becomes its proxy entity. Returns null in a headless runtime (the
 * caller then uses CreateTerrain of bb3d).
 */
export function envCreateTerrain(size: number): Handle {
	if (!envHas()) return null;
	envFreeTerrain();
	const env = RT.env;
	const terrain = new Terrain(size, new Float32Array((size + 1) * (size + 1)), new THREE.MeshBasicMaterial());
	RT.world.scene.add(terrain.mesh);
	bridgeTerrain = terrain;
	// adoptTerrain frees env.entities.ter (= G.ter, already freed by the caller) and creates the proxy
	G.ter = null;
	priv().adoptTerrain(terrain);
	priv().terrain = terrain;
	priv().terrainEditor = new TerrainEditor(terrain, env.core.rng);
	return env.entities.ter;
}

/** `FreeEntity ter` for the environment layer: its terrain leaves the scene. */
export function envFreeTerrain(): void {
	if (!envHas()) return;
	const p = priv();
	const t = p.terrain ?? bridgeTerrain;
	if (t) {
		t.mesh.parent?.remove(t.mesh);
		t.mesh.geometry.dispose();
		const m = t.mesh.material;
		for (const mat of Array.isArray(m) ? m : [m]) mat.dispose();
	}
	p.terrain = undefined;
	p.terrainEditor = undefined;
	bridgeTerrain = null;
}

/**
 * The environment's own share of e_clear() that is not a G variable:
 * gfx_waterimg_custom of the layer (script command "watertexture") and the
 * water alpha ("wateralpha"), as Environment.setMap resets them.
 */
export function envClear(): void {
	if (!envHas()) return;
	priv().gfx_waterimg_custom = undefined;
	priv().waterAlpha = 1;
}

/**
 * `EntityTexture ter,ter_tex_color`: gives the pixels of G.ter_tex_color to
 * the layer as its colour map (and terrain material). Nothing in a headless
 * runtime or without a terrain.
 */
export function envColormapFromTexture(): void {
	if (!envHas() || G.ter_tex_color === null || !priv().terrain) return;
	const size = TextureHeight(G.ter_tex_color);
	const buf = TextureBuffer(G.ter_tex_color)!;
	const colormap = new Uint8Array(size * size * 3);
	for (let x = 0; x < size; x++) {
		for (let y = 0; y < size; y++) {
			const rgb = buf.getPixelFast(x, y);
			const d = (x * size + y) * 3;
			colormap[d] = (rgb >> 16) & 255;
			colormap[d + 1] = (rgb >> 8) & 255;
			colormap[d + 2] = rgb & 255;
		}
	}
	priv().setColormapData(colormap, size);
	pushedColormap = RT.env.colormap;
}

/**
 * The opposite direction: when the layer replaced its colour map since the
 * last push (e_terraincm, e_terraincmscale of e_environment.ported.ts),
 * G.ter_tex_color is recreated from it. Called by save_map before it reads
 * TextureBuffer(ter_tex_color).
 */
export function terTexColorFromEnv(): void {
	if (!envHas() || !priv().terrain) return;
	const env = RT.env;
	if (env.colormap === pushedColormap) return;
	const size = env.colormapSize;
	const colormap = env.colormap;
	if (G.ter_tex_color !== null) FreeTexture(G.ter_tex_color);
	G.ter_tex_color = CreateTexture(size, size, 256);
	const buf = TextureBuffer(G.ter_tex_color)!;
	for (let x = 0; x < size; x++) {
		for (let y = 0; y < size; y++) {
			const s = (x * size + y) * 3;
			buf.setPixelFast(x, y, (0xff000000 | (colormap[s] << 16) | (colormap[s + 1] << 8) | colormap[s + 2]) | 0);
		}
	}
	pushedColormap = colormap;
}

/** G.ter_groundy -> RT.env.terrain.groundY (e_tery of the layer reads its own copy). */
export function envSyncGroundY(): void {
	if (!envHas()) return;
	const t = priv().terrain;
	if (t) t.groundY = G.ter_groundy;
}

/** RT.env.terrain.groundY -> G.ter_groundy (after the layer's e_terrainground). */
export function groundYFromEnv(): void {
	if (!envHas()) return;
	const t = priv().terrain;
	if (t) G.ter_groundy = t.groundY;
}

/** For tests: forget what the bridge remembers of a disposed runtime. */
export function resetMapBridge(): void {
	bridgeTerrain = null;
	pushedColormap = null;
}

// =====================================================================================
// TerrainHeight
// =====================================================================================

/**
 * TerrainHeight#(terrain,x,z) as the shipped runtime computes it.
 *
 * bb3d TerrainHeight (engine/collision/terrainCollider.ts repHeight) returns
 * float32(byte / 255). The Blitz3D runtime of the game multiplies by the
 * float32 reciprocal: float32(byte * float32(1/255)), which is one ulp higher
 * for 126 of the 256 byte values. Evidence: the height maps of all 13 shipped
 * maps (e.g. byte 114 is stored as 0x3EE4E4E6, not 0x3EE4E4E5); with this
 * function save_map reproduces them bit for bit.
 *
 * SHOULD CHANGE: repHeight of terrainCollider.ts (which also feeds TerrainY,
 * picks and collisions: heights are up to 1 ulp of the 0..1 value too low).
 * This function gives the same result before and after that fix.
 */
export function TerrainHeight_exe(ter: Handle, x: number, z: number): number {
	return f32(Math.round(TerrainHeight(ter, x, z) * 255) * f32(1 / 255));
}

// =====================================================================================
// grass_rgb
// =====================================================================================

/**
 * grasspread.ts grass_map() without RT.env: the part of the original that
 * fills grass_rgb from the colour texture.
 *
 *     grass_mapsize=TextureHeight(ter_tex_color)
 *     Dim grass_rgb(grass_mapsize,grass_mapsize,3)
 *     ... grass_rgb(x,y,0..2)=colour, grass_rgb(x,y,3)=1
 *
 * Call right after grass_map(). Does nothing when the layer has the grass.
 */
export function grassMapHeadless(): void {
	if (envHas() && priv().terrain) return;
	if (G.ter_tex_color === null) return;
	let x = 0;
	let y = 0;
	let rgb = 0;
	G.grass_mapsize = TextureHeight(G.ter_tex_color);
	G.grass_rgb = dim(0, G.grass_mapsize, G.grass_mapsize, 3);
	const buf = TextureBuffer(G.ter_tex_color)!;
	for (x = 0; x <= G.grass_mapsize - 1; x++) {
		for (y = 0; y <= G.grass_mapsize - 1; y++) {
			rgb = buf.getPixelFast(x, y);
			G.grass_rgb[x][y][0] = (rgb & 0xff0000) >> 16;
			G.grass_rgb[x][y][1] = (rgb & 0xff00) >> 8;
			G.grass_rgb[x][y][2] = rgb & 0xff;
			G.grass_rgb[x][y][3] = 1;
		}
	}
}

/** `grass_rgb(x,y,c)=v` in whichever storage exists. Outside the array: ignored (Blitz would write other memory). */
export function grass_rgb_set(x: number, y: number, c: number, v: number): void {
	if (envHas() && priv().terrain) {
		const g = RT.env.grass;
		const m = g.grass_mapsize + 1;
		if (x < 0 || y < 0 || x >= m || y >= m) return;
		g.grass_rgb[(x * m + y) * 4 + c] = v;
		return;
	}
	const row = G.grass_rgb[x]?.[y];
	if (row !== undefined && c < row.length) row[c] = v;
}

/** `grass_rgb(x,y,c)`. Outside the array: 0. */
export function grass_rgb_get(x: number, y: number, c: number): number {
	if (envHas() && priv().terrain) {
		const g = RT.env.grass;
		const m = g.grass_mapsize + 1;
		if (x < 0 || y < 0 || x >= m || y >= m) return 0;
		return g.grass_rgb[(x * m + y) * 4 + c] ?? 0;
	}
	return G.grass_rgb[x]?.[y]?.[c] ?? 0;
}

// =====================================================================================
// Signature corrections (function_index.json / the generated skeletons)
// =====================================================================================
//
// e_gc(h,add#)            h is an entity:  e_gc(h: Handle, add: number): void
// e_teralign(h,s#=1.)     h is an entity:  e_teralign(h: Handle, s = 1): void
// split$(txt$,sign$,limit) (functions.ported.ts) returns string[] and its comment says that no caller
//                         uses the result of the original. load_randommap does: `c=split$(val$,",",0)`
//                         is c=Int(Str(limit)) with limit=Len(val$). Ported there as
//                         `c = Int(Str(splitLimit(split(val, ',', 0))))`:
/** The value `split$()` returns in the original (its `limit` after `If limit<=0 Then limit=Len(txt$)`). */
export function splitLimit(splits: readonly string[]): number {
	return splits.length - 1;
}
// load_res(path, typ, mode) is typed `number` in the index; it returns the handle type of its class (ressources.ts).
// in_quickslot(9) is an Int array (G.in_quickslot: number[]); load_map assigns ReadString to it (Int(...)),
//                         save_map writes it with WriteString (Str(...)): as in the original.
