/**
 * Temporary additions of the package editor_menus (editor_menus.bb) to the
 * shared files. Each entry says what should change where.
 */
import { TextureHeight, TextureWidth, type Handle } from '../../bb3d';
import { RT, hasRuntime } from '../rt';
import { G } from '../state';

/**
 * function_index: e_skybox(file$) is "absorbed" (e_environment.bb:1376): the
 * environment layer builds the sky itself and there is no function that
 * returns a sky entity. editor_menus() (Settings, Okay) does
 *
 *     If env_sky<>0 Then FreeEntity env_sky
 *     env_sky=e_skybox("skies\"+map_skybox$)      ("skies\sky" when map_skybox$="")
 *     EntityFX env_sky,1+8 : EntityOrder env_sky,3 : PositionEntity env_sky,0,500,0
 *
 * Substitute until e_environment.ts exports an e_skybox: the layer rebuilds
 * its sky from G.map_skybox (which editor_savesettings() has just set; the
 * `file` argument names the same sky) and applies FX/order/position itself.
 * The result is the value for G.env_sky, which stays what it was (null: the
 * sky is not a bb3d entity). Headless (no RT.env): nothing happens.
 *
 * It is async because RT.env.skytexture() loads the six textures; the
 * original e_skybox is synchronous. The only caller, editor_menus(), is async.
 */
export async function e_skybox(file: string): Promise<Handle> {
	void file;
	if (!hasRuntime('env')) return null;
	await RT.env.skytexture(G.map_skybox);
	//EntityFX env_sky,1+8
	RT.core.engine.skyFX(1 + 8);
	//PositionEntity env_sky,0,500,0
	RT.core.engine.positionSky(0, 500, 0);
	return null;
}

/**
 * state.ts / e_environment: G.ter_tex_color (the colour map texture) is not
 * maintained by the environment layer, which keeps the colour map as data
 * (RT.env.colormap / colormapSize); G.ter_tex_color stays null. editor_menus
 * tests `ter_tex_color<>0` and reads TextureWidth/TextureHeight of it.
 * Substitutes until G.ter_tex_color is a real texture (or the layer offers
 * these under the original names):
 */
export function ter_tex_color_exists(): boolean {
	if (G.ter_tex_color !== null) return true;
	return hasRuntime('env') && RT.env.terrain !== undefined;
}
/** TextureWidth(ter_tex_color) */
export function ter_tex_color_width(): number {
	if (G.ter_tex_color !== null) return TextureWidth(G.ter_tex_color);
	if (hasRuntime('env')) return RT.env.colormapSize;
	return TextureWidth(G.ter_tex_color);
}
/** TextureHeight(ter_tex_color) */
export function ter_tex_color_height(): number {
	if (G.ter_tex_color !== null) return TextureHeight(G.ter_tex_color);
	if (hasRuntime('env')) return RT.env.colormapSize;
	return TextureHeight(G.ter_tex_color);
}

/*
 * Signatures (function_index.json) as used by editor_menus.ts:
 *
 * - editor_saveinfo(Tinfo.Tinfo): the parameter is named Tinfo_ in the port
 *   (a local named like its Type). No change of types.
 * - gui_iconbox(x,y,img,txt$,sel): the index types img as number; it is an
 *   ImageHandle (the ui layer already declares it so).
 * - gui_healthbar#(...,image=0): image is an ImageHandle (not used here).
 * - split$(...) returns string[] in the port (index says string); unused here.
 */
