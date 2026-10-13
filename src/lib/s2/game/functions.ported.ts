/**
 * includes/functions.bb: the functions that already exist. The owner of
 * functions.ts re-exports this module (`export * from './functions.ported'`)
 * and ports the rest: pheight, drawaxes, darkbuffer, meshline, incam, genmap,
 * intime, indailytime, groundpitch, brightness, viewline, cachedata, screenshot.
 */
import { numsep as numsep_, split as split_ } from '../blitz';
import { s } from '../ui/strings';
import { RT } from './rt';
import { G } from './state';

export {
	cinstr,
	code,
	dist,
	extval,
	getfilename,
	ntrim,
	path,
	reppart,
	strinv,
	stripext,
	trimexquote,
	trimspace,
	trimtext,
	zerofill
} from '../blitz';
export { drawy } from '../ui/gui';
export { copy, paste } from './sys';

/**
 * Function split$(txt$,sign$=",",limit=10): fills the global array splits$()
 * (G.splits, re-dimensioned to `limit`) with the parts.
 *
 *     split(val$)                       split(val);
 *     x=Int(splits$(0))                 x = Int(G.splits[0]);
 *
 * The original is declared `$` and returns `limit`; no caller uses the
 * result. Here the array is returned for convenience.
 */
export function split(txt: string, sign = ',', limit = 10): string[] {
	G.splits = split_(txt, sign, limit);
	return G.splits;
}

/** Function numsep$(txt$): thousands separators, the separator is s$(33). */
export function numsep(txt: string | number): string {
	return numsep_(String(txt), s(33));
}

/** Function play(sound): 2D sound at the effects volume. */
export function play(sound: number): void {
	RT.audio.play(sound);
}
