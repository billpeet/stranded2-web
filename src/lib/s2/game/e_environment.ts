/**
 * includes/e_environment.bb: the functions the environment layer does not
 * have (e_terrain, e_gc, e_teralign), ported line by line; everything else is
 * e_environment.ported.ts.
 *
 * e_terrain is half of the bridge between the game code and the environment
 * layer (see _additions/map.ts): in the browser `ter` is the proxy entity of
 * the layer's terrain, headless it is a bb3d terrain. Every statement of the
 * original is kept; the bb3d commands that have no effect on a proxy
 * (EntityTexture, EntityColor) simply do nothing there.
 */
import {
	CreatePivot,
	CreateTerrain,
	CreateTexture,
	EntityColor,
	EntityPickMode,
	EntityPitch,
	EntityTexture,
	EntityX,
	EntityY,
	EntityZ,
	FreeEntity,
	FreeTexture,
	LoadTexture,
	ModifyTerrain,
	PointEntity,
	PositionEntity,
	RotateEntity,
	ScaleEntity,
	ScaleTexture,
	TerrainDetail,
	TerrainShading,
	TerrainY,
	TextureBlend,
	TextureHeight,
	type Handle
} from '../bb3d';
import { Int, Log, Rand, Rnd, RuntimeError, Str, f32, idivConst } from '../blitz';
import { envColormapFromTexture, envCreateTerrain, envHas, grassMapHeadless, groundYFromEnv, terTexColorFromEnv } from './_additions/map';
import { Cworld_height, Cworld_size } from './consts';
import { e_terraincm as e_terraincm_, e_terraincmscale as e_terraincmscale_, e_terrainground as e_terrainground_, e_tery } from './e_environment.ported';
import { editor_textobuffer } from './editor_functions';
import { p_kill2d } from './particles';
import { FileType } from './files';
import { grass_map } from './grasspread';
import { G } from './state';

export * from './e_environment.ported';

/**
 * Function e_terrainground(fx=1): the layer's function (e_environment.ported.ts), and after it the
 * first statement of the original, which the layer does only for its own copy of the variable:
 *
 *     ter_groundy=TerrainY(ter,-((ter_size/2)*Cworld_size),0,-((ter_size/2)*Cworld_size))
 *
 * (This export takes precedence over the one of `export *`. See _additions/map.ts.)
 */
export function e_terrainground(fx = 1): void {
	e_terrainground_(fx);
	if (envHas()) {
		groundYFromEnv();
	} else if (G.ter !== null) {
		G.ter_groundy = TerrainY(G.ter, -(idivConst(G.ter_size, 2) * Cworld_size), 0, -(idivConst(G.ter_size, 2) * Cworld_size));
	}
}

/**
 * Function e_terraincm(file$,loadscreen=1): the layer's function, which replaces ITS colour map;
 * then the texture ter_tex_color of the original is recreated from it (one of two storages of
 * the colour map, see _additions/map.ts), so that the callers' editor_textobuffer(ter_tex_color),
 * TextureHeight(ter_tex_color) and save_map see the new one.
 */
export async function e_terraincm(file: string, loadscreen = 1): Promise<number> {
	const r = await e_terraincm_(file, loadscreen);
	if (r) terTexColorFromEnv();
	return r;
}

/**
 * Function e_terraincmscale(newscale): the layer's function (scale, grass_map, grass_heightmap),
 * then ter_tex_color from the layer and the rest of the original's "Update" block:
 *
 *     editor_textobuffer(ter_tex_color)
 *     p_kill2d()
 */
export function e_terraincmscale(newscale: number): number {
	const r = e_terraincmscale_(newscale);
	if (envHas()) {
		terTexColorFromEnv();
		editor_textobuffer(G.ter_tex_color);
		p_kill2d();
	}
	return r;
}

//############################################ Engine Terrain
//Build Terrain
/** Function e_terrain(size,tex_color$) */
export function e_terrain(size: number, tex_color: string): void {
	//Size Check
	let texsize = 0;
	let scalefac = 0;
	let sizecheck = 0;
	const set_ter: number = 0;
	let x = 0;
	let z = 0;
	sizecheck = f32(Log(size) / Log(2));
	if (Int(sizecheck) !== sizecheck || size < 16) RuntimeError("'" + Str(size) + "' is an invalid Terrainsize! ");
	G.ter_size = size;

	//Build Terrain
	if (G.ter !== null) FreeEntity(G.ter);
	// bridge: in the browser the terrain belongs to the environment layer and G.ter is its proxy entity
	G.ter = envCreateTerrain(G.ter_size) ?? CreateTerrain(G.ter_size);
	//DebugLog "ter in e_terrain: "+ter
	// quirk: set_ter is not a global (the setting is set_terrain): a local that is always 0, so always "Case 0"
	switch (set_ter) {
		case 0:
			TerrainDetail(G.ter, 5000, 1);
			break;
		case 1:
			TerrainDetail(G.ter, 7500, 1);
			break;
		case 2:
			TerrainDetail(G.ter, 10000, 1);
			break;
	}
	ScaleEntity(G.ter, Cworld_size, Cworld_height, Cworld_size);
	PositionEntity(G.ter, -idivConst(Cworld_size * G.ter_size, 2), -idivConst(Cworld_height, 2), -idivConst(Cworld_size * G.ter_size, 2));
	EntityPickMode(G.ter, 2, 1);
	TerrainShading(G.ter, 1);
	//EntityType ter,Cworld_col
	for (x = 0; x <= G.ter_size; x++) {
		for (z = 0; z <= G.ter_size; z++) {
			ModifyTerrain(G.ter, x, z, Rnd(0.5, 0.52));
			if (Rand(50) === 1) ModifyTerrain(G.ter, x, z, 1);
		}
	}

	//Colortexture (Load from File or use already generated Texture)
	if (tex_color !== 'generated') {
		//Load
		if (G.ter_tex_color !== null) FreeTexture(G.ter_tex_color);
		if (FileType(tex_color) === 1) {
			G.ter_tex_color = LoadTexture(tex_color);
			EntityTexture(G.ter, G.ter_tex_color, 0, 0);
		} else {
			G.ter_tex_color = CreateTexture(64, 64);
			EntityTexture(G.ter, G.ter_tex_color, 0, 0);
		}
	} else {
		//Use generated
		EntityTexture(G.ter, G.ter_tex_color, 0, 0);
	}
	texsize = TextureHeight(G.ter_tex_color);
	scalefac = f32(f32(f32(G.ter_size / texsize) * Cworld_size) * f32(texsize / Cworld_size));
	ScaleTexture(G.ter_tex_color, scalefac, -scalefac);

	//Texture Stuff
	switch (G.set_terrain) {
		case 0:
			EntityColor(G.ter, 120, 120, 120);
			TextureBlend(G.ter_tex_color, 1);
			break;
		case 1:
			EntityColor(G.ter, 240, 240, 240);
			EntityTexture(G.ter, G.gfx_terraindirt, 0, 1);
			break;
		case 2:
			EntityColor(G.ter, 120, 120, 120);
			EntityTexture(G.ter, G.gfx_terraindirt, 0, 1);
			EntityTexture(G.ter, G.gfx_terstruc, 0, 2);
			break;
	}
	// bridge: the layer draws the terrain; it gets the pixels of ter_tex_color and builds the material for set_terrain
	envColormapFromTexture();

	//Grass
	grass_map();
	grassMapHeadless(); // substitute: grass_map() of grasspread.ts has no grass_rgb without RT.env
}

//### Ground Collision
/** Function e_gc(h,add#) */
export function e_gc(h: Handle, add: number): void {
	let y = 0;
	let hy = 0;
	//DEBUG
	// quirk: the function returns at once; what follows is dead code of the original
	if (h !== undefined) return;
	//DEBUG
	y = TerrainY(G.ter, EntityX(h), 0, EntityZ(h));
	if (y < f32(G.ter_groundy + add)) y = G.ter_groundy;
	hy = EntityY(h);
	if (hy < f32(y + add)) {
		PositionEntity(h, EntityX(h), f32(y + add), EntityZ(h), 0);
	}
}

//### Terrain Align
/** Function e_teralign(h,s#=1.) */
export function e_teralign(h: Handle, s = 1): void {
	let x = 0;
	let z = 0;
	let p1: Handle = null;
	let p2: Handle = null;
	let pitch = 0;
	let roll = 0;
	x = EntityX(h);
	z = EntityZ(h);
	p1 = CreatePivot();
	p2 = CreatePivot();
	PositionEntity(p1, x, e_tery(x, f32(z - s)), f32(z - s));
	PositionEntity(p2, x, e_tery(x, f32(z + s)), f32(z + s));
	PointEntity(p1, p2);
	pitch = EntityPitch(p1);
	PositionEntity(p1, f32(x + s), e_tery(f32(x + s), z), z);
	PositionEntity(p2, f32(x - s), e_tery(f32(x - s), z), z);
	PointEntity(p1, p2);
	roll = EntityPitch(p1);
	FreeEntity(p1);
	FreeEntity(p2);
	RotateEntity(h, pitch, 0, roll);
}
