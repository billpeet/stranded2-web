/**
 * includes/motionblur.bb, line-by-line port.
 */
import {
	CreateSprite,
	CreateTexture,
	EntityAlpha,
	EntityOrder,
	EntityTexture,
	HideEntity,
	PositionEntity,
	ScaleSprite,
	ScaleTexture,
	ShowEntity,
	SpriteViewMode,
	TextureBlend,
	TextureBuffer,
	TextureHeight,
	TextureWidth
} from '../bb3d';
import { f32 } from '../blitz';
import { BackBuffer, CopyRect, type Buffer } from '../gfx2d';
import { con_add } from './console';
import { Cbmpf_red, Cpeakblur } from './consts';
import { gui_msg } from './gui';
import { G } from './state';

//############################################ Setup Motionblur
/** Function mb_setup() */
export function mb_setup(): void {
	let os = 0;
	let ratio = 0;

	os = f32(1.005);
	os = 1;
	//Sprite
	G.mb_sprite = CreateSprite(G.cam);
	SpriteViewMode(G.mb_sprite, 2);
	PositionEntity(G.mb_sprite, 0, 0, 10);
	EntityOrder(G.mb_sprite, -200);
	ratio = f32(G.set_scry / G.set_scrx);
	ScaleSprite(G.mb_sprite, f32(1 * 10 * os), f32(f32(ratio * 10) * os));
	//Texture
	G.mb_tex = CreateTexture(G.set_scrx, G.set_scry, 1 + 16 + 32 + 256);
	if (G.mb_tex === null) {
		con_add('ERROR: Failed to setup motion blur buffer', Cbmpf_red);
		if (G.set_mb === 1) {
			G.set_mb = 0;
			con_add('WARNING: Motion blur has been disabled automatically', Cbmpf_red);
		}
	} else {
		TextureBlend(G.mb_tex, 2);
		ScaleTexture(G.mb_tex, f32(TextureWidth(G.mb_tex) / G.set_scrx), f32(TextureHeight(G.mb_tex) / G.set_scry));
		//Final Setup
		EntityTexture(G.mb_sprite, G.mb_tex);
		EntityAlpha(G.mb_sprite, G.set_mb_alpha);
		if (G.set_mb_alpha > Cpeakblur) EntityAlpha(G.mb_sprite, Cpeakblur);
	}
}

//############################################ Update Motionblur
/** Function mb_update() */
export async function mb_update(): Promise<void> {
	//Script Motionblur?
	if (G.in_scriptblur > 0) {
		mb_override(G.in_scriptblur);
	}
	//Update
	if (G.set_mb) {
		if (G.mb_tex === null) {
			G.set_mb = 0;
			con_add('WARNING: Motion blur has been disabled automatically', Cbmpf_red);
			await gui_msg('Motion Blur Buffer Error', Cbmpf_red);
		} else {
			//Sprite
			ShowEntity(G.mb_sprite);
			CopyRect(0, 0, G.set_scrx, G.set_scry, 0, 0, BackBuffer(), TextureBuffer(G.mb_tex) as Buffer);
			//Alpha
			if (G.set_mb_alpha_override > G.set_mb_alpha) {
				EntityAlpha(G.mb_sprite, G.set_mb_alpha_override);
			} else {
				EntityAlpha(G.mb_sprite, G.set_mb_alpha);
				if (G.set_mb_alpha <= 0) HideEntity(G.mb_sprite);
			}
		}
	} else {
		HideEntity(G.mb_sprite);
	}
}

//############################################ Motionblur Alpha Override
/** Function mb_override(a#) */
export function mb_override(a: number): void {
	if (a > G.set_mb_alpha_override) {
		G.set_mb_alpha_override = f32(a);
	}
}
