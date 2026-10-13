/**
 * includes/grasspread.bb: the grass layer. The implementation is
 * engine/environment/grass.ts (GrassCore) inside the environment; these are
 * the original functions with the game's state filled in. Without WebGL
 * (headless tests) there is no grass and they do nothing.
 *
 * The grass_* globals (grass_c, grass_dist, grass_mapsize, grass_rgb,
 * grass_h, ...) of load_vars.bb exist on G for completeness, but the layer
 * keeps its own state in RT.env.grass.
 */
import { RT, hasRuntime } from './rt';
import { G } from './state';

const has = (): boolean => hasRuntime('env') && !!RT.env.terrain;

/** Function grass_map(): size the grass map by set_grass and take the colours from the colour map. */
export function grass_map(): void {
	if (!has()) return;
	const env = RT.env;
	env.grass.grass_map(G.set_grass, env.colormap, env.colormapSize, env.terrain!.size);
}

/** Function grass_heightmap(): decide by terrain height where grass grows. */
export function grass_heightmap(): void {
	if (!has()) return;
	const ter = RT.env.terrain!;
	RT.env.grass.grass_heightmap(ter.size, (x, z) => ter.terrainY(x, z), RT.core.rng);
}

/** Function grass_spread(): move the grass patches with the camera. */
export function grass_spread(): number {
	if (!has()) return 0;
	return RT.env.grass_spread();
}

/** Function grass_free() */
export function grass_free(): void {
	if (hasRuntime('env')) RT.env.grass.grass_free();
}

/** Function grass_colors(r,g,b): script command "grasscolor". */
export function grass_colors(r: number, g: number, b: number): void {
	if (hasRuntime('env')) RT.env.grass_colors(r, g, b);
}
