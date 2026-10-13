/**
 * includes/load_fps.bb: `Global looplimit=20` (G.looplimit) and calcfpsfactor().
 */
import { MilliSecs, f32 } from '../blitz';
import { G } from './state';

/**
 * Function calcfpsfactor(): called by endinput() at the end of every frame.
 *
 *     ;<<< WAIT >>>
 *     While MilliSecs()-ms<(looplimit) : Delay 1 : Wend
 *     Local looptime=MilliSecs()-ms
 *     f#=looptime : f#=f#*in_gtmod# : f#=f#/20.0 : in_gtmod#=1.
 *
 * The wait cannot happen here in a browser: the main loop makes it up before
 * it starts the next frame (flow.ts frameDue). Its effect on looptime is
 * reproduced: after the wait looptime is never below looplimit.
 */
export function calcfpsfactor(): void {
	//Looptime
	let looptime = MilliSecs() - G.ms;
	if (looptime < G.looplimit) looptime = G.looplimit; // the wait
	//FPS Factor
	G.f = looptime;
	G.f = f32(G.f * G.in_gtmod);
	G.f = f32(G.f / 20.0);
	G.in_gtmod = 1;
}
