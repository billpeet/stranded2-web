/**
 * includes/load_bmpf.bb: bitmap fonts. The implementation is ui/bmpf.ts;
 * this module gives game code the original names on the game's file layer
 * and makes bmpf_loadscreen yield to the browser.
 */
import * as B from '../ui/bmpf';
import { overlayVfs } from './files';
import { frame, frameIfDue } from './flow';

export {
	bmpf_len,
	bmpf_trim,
	bmpf_txt,
	bmpf_txt_c,
	bmpf_txt_ml,
	bmpf_txt_ml_len,
	bmpf_txt_ml_marked,
	bmpf_txt_pos,
	bmpf_txt_r,
	bmpf_txt_rect,
	bmpf_txt_scroll
} from '../ui/bmpf';

/** Function bmpf_load_font(bmp$,bmpf$,id) */
export async function bmpf_load_font(bmp: string, bmpf: string, id: number): Promise<number> {
	return B.bmpf_load_font(overlayVfs(), bmp, bmpf, id);
}

/**
 * Function bmpf_loadscreen(txt$,percent=-1): black screen, text, progress
 * bar, Flip. The Flip of the original shows the screen; here the function
 * then gives the browser the chance to paint (at most once per display
 * frame), which is why it is async and every caller awaits it.
 */
export async function bmpf_loadscreen(txt: string, percent = -1): Promise<void> {
	B.bmpf_loadscreen(txt, percent);
	await frameIfDue();
}

/**
 * Top-level code of load_bmpf.bb: `Global gfx_bar=load_image(...progress.bmp)`,
 * then the seven fonts with `bmpf_loadscreen("Loading Fonts",n)` between them.
 */
export async function include_load_bmpf(): Promise<void> {
	await B.load_bmpf(overlayVfs());
	await frame();
}
