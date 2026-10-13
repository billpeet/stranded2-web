/**
 * includes/load_media.bb: every gfx_* image and texture and every sfx_*
 * sound of the game. The file is top-level code; it is `include_load_media()`.
 *
 * Three layers share the work:
 *   2D images (gfx_bigbutton ... gfx_tutor, the load screens at 8/10/12/16 %)
 *       ui/media.ts load_media, into M (G.gfx_* forwards there)
 *   textures and the grass mesh (gfx_terstruc ... gfx_moon)
 *       here, with bb3d
 *   sounds ("SYSTEM SFX")
 *       audio S2Audio.load_media_sfx, into the sfx_* fields bound to G
 *
 * Before anything is loaded the port decodes all models, textures, images
 * and sounds of the mod (the original reads them from disk on demand; the
 * browser cannot do that synchronously). That takes the place of the disk
 * time of the original's "Loading media" phase.
 */
import { HideEntity, ScaleTexture, TextureBlend } from '../bb3d';
import { BackBuffer, SetBuffer } from '../gfx2d';
import { load_media as load_media_2d } from '../ui/media';
import { overlayVfs } from './files';
import { frameIfDue } from './flow';
import { load_mesh, load_texture } from './load_functions';
import { RT } from './rt';
import { G } from './state';

export { makedark } from '../ui/media';

/** Top-level code of load_media.bb */
export async function include_load_media(): Promise<void> {
	// ---- port: make the synchronous loaders possible
	if (!RT.headless) {
		await RT.world.preload('all');
		await RT.audio.preload();
	}

	// ---- 2D images, with bmpf_loadscreen(s$(1),8) / 10 / 12 / 16 where the original has them
	await load_media_2d(overlayVfs(), () => frameIfDue(0));

	// ---- textures (between the load screens at 10 and 16 in the original)

	//### Structure Tex.
	G.gfx_terstruc = load_texture('sys\\gfx\\terrainstructure.bmp', 256 + 512);
	ScaleTexture(G.gfx_terstruc, 2, 2);
	TextureBlend(G.gfx_terstruc, 5);
	G.gfx_struc = load_texture('sys\\gfx\\structure.bmp', 256 + 512);
	ScaleTexture(G.gfx_struc, 2, 2);
	TextureBlend(G.gfx_struc, 5);

	//### Terrain Dirt Tex.
	G.gfx_terraindirt = load_texture('sys\\gfx\\terraindirt.bmp');
	ScaleTexture(G.gfx_terraindirt, 0.5, 0.5);
	TextureBlend(G.gfx_terraindirt, 5);

	//### Terrain Ground
	G.gfx_tergrounddirt = load_texture('sys\\gfx\\terraindirt.bmp');
	ScaleTexture(G.gfx_tergrounddirt, 30, 30);
	TextureBlend(G.gfx_tergrounddirt, 5);

	//### Terrain Grassspread Stuff
	G.gfx_grasspreadtex = load_texture('gfx\\grasspread_a.png');
	G.gfx_grasspread = load_mesh('gfx\\grasspread.b3d');
	HideEntity(G.gfx_grasspread);

	//### Water
	G.gfx_water = load_texture('gfx\\water.jpg', 256 + 512);
	// gfx_waterimg, gfx_waterimg_custom: 2D images, loaded above

	//### Weather
	G.gfx_rain = load_texture('sys\\gfx\\rain_a.bmp');
	ScaleTexture(G.gfx_rain, 1, 3);
	G.gfx_snow = load_texture('sys\\gfx\\snow_a.bmp');

	//### Particles / Sprites
	for (let i = 0; i <= 2; i++) {
		G.gfx_p_flare[i] = load_texture('sprites\\flare' + i + '_a.bmp');
	}
	for (let i = 0; i <= 1; i++) {
		G.gfx_p_bubbles[i] = load_texture('sprites\\bubbles' + i + '_a.bmp');
	}
	for (let i = 0; i <= 0; i++) {
		G.gfx_p_roundwave[i] = load_texture('sprites\\roundwave' + i + '_a.bmp');
	}
	for (let i = 0; i <= 0; i++) {
		G.gfx_p_wave[i] = load_texture('sprites\\wave' + i + '_a.bmp');
	}
	for (let i = 0; i <= 1; i++) {
		G.gfx_p_smoke[i] = load_texture('sprites\\smoke' + i + '_a.bmp');
	}
	for (let i = 0; i <= 0; i++) {
		G.gfx_p_spark[i] = load_texture('sprites\\spark' + i + '_a.bmp');
	}
	for (let i = 0; i <= 2; i++) {
		G.gfx_p_splatter[i] = load_texture('sprites\\splatter' + i + '_a.bmp');
	}
	for (let i = 0; i <= 4; i++) {
		G.gfx_p_woodfrag[i] = load_texture('sprites\\woodfrag' + i + '_a.bmp');
	}
	for (let i = 0; i <= 0; i++) {
		//gfx_p_flames(0)=LoadAnimTexture("sprites\flames"+i+"_a.png",2,64,64,0,4)
		G.gfx_p_flames[0] = load_texture('sprites\\flames' + i + '_a.png');
	}
	G.gfx_p_starflare = load_texture('sprites\\starflare_a.bmp');
	for (let i = 0; i <= 0; i++) {
		G.gfx_p_puddle[i] = load_texture('sprites\\puddle' + i + '_a.bmp');
	}
	G.gfx_p_shockwave = load_texture('sprites\\shockwave_a.bmp');
	for (let i = 0; i <= 0; i++) {
		G.gfx_p_splash[i] = load_texture('sprites\\splash' + i + '_a.bmp');
	}

	G.gfx_p_attack[0] = load_texture('sprites\\attack1_a.bmp');
	G.gfx_p_attack[1] = load_texture('sprites\\attack2_a.bmp');

	//### Moon
	G.gfx_moon = load_texture('sprites\\moon_a.png');

	//############################################ SYSTEM SFX
	RT.audio.load_media_sfx();

	//### Buffer
	SetBuffer(BackBuffer());
}
