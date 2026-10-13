/**
 * includes/unrealsoftware.bb, ported line by line: the fading logo at program start.
 */
//############################################ Unreal Software
import { MilliSecs, f32, idivConst } from '../blitz';
import { CreateSprite, EntityAlpha, EntityBlend, EntityTexture, FreeEntity, FreeTexture, PositionEntity, ScaleSprite, type Handle, type Texture } from '../bb3d';
import { Flip } from '../gfx2d';
import { FlushJoy, FlushKeys, FlushMouse, GetJoy, GetKey, GetMouse, KeyDown } from '../input';
import { RenderWorld } from './e_environment';
import { delay, frame } from './flow';
import { load_texture } from './load_functions';
import { G } from './state';

/** Function unrealsoftware() */
export async function unrealsoftware(): Promise<void> {
	let logotex: Texture | null = null;
	let logo: Handle = null;
	let a = 0;
	let fade = 0;
	let ms = 0;
	logotex = load_texture('sys\\gfx\\logo.bmp', 256);
	logo = CreateSprite();
	EntityTexture(logo, logotex);
	a = f32(-0.3);
	ScaleSprite(logo, 350, 150);
	PositionEntity(logo, idivConst(G.set_scrx, 2) * 2 - G.set_scrx, -(idivConst(G.set_scry, 2) * 2) + G.set_scry, G.set_scrx);
	EntityBlend(logo, 3);
	fade = 0;
	PositionEntity(G.cam, 0, 0, 0);

	FlushKeys();
	FlushMouse();
	FlushJoy();

	for (;;) {
		ms = MilliSecs();

		if (fade === 0) {
			a = f32(a + f32(0.025));
			if (a > 2.5) fade = 1;
		} else {
			a = f32(a - f32(0.025));
			if (a < -0.5) break;
		}
		EntityAlpha(logo, a);
		RenderWorld();

		Flip();
		await frame();

		while (MilliSecs() - ms < 20) {
			await delay(1);
		}

		if (KeyDown(31)) {
			// quirk: "a#=1.5 fade=0" on one line without a colon: two statements (S restarts the fade at full brightness)
			a = f32(1.5);
			fade = 0;
			FlushKeys();
		} else if (((GetKey() !== 0 ? 1 : 0) | (GetMouse() !== 0 ? 1 : 0) | (GetJoy() !== 0 ? 1 : 0)) !== 0) {
			break;
		}
	}

	FreeEntity(logo);
	FreeTexture(logotex);
}
