/**
 * includes/ai/003_standandsnap.bb: top-level code, included inside
 * `Select Dunit_behaviour(TCunit\typ)` of update_unit (ai_units.bb). Works on
 * G.TCunit like the inline code. The implicitly declared locals of update_unit
 * it uses are locals here (each is assigned before it is read).
 *
 * K.<name> are the AI constants of load_const.bb (ai_idle, ai_move, ...): several
 * have the same name as a function of ai_units.bb (Blitz keeps constants and
 * functions in separate name spaces), so the constants are read through K.
 */
import { Animating } from '../../bb3d';
import { ai_attack, ai_check, ai_dosani, ai_mode } from '../ai_units';
import * as K from '../consts';
import { G } from '../state';

/** Include "includes\ai\003_standandsnap.bb" */
export function include_003_standandsnap(): void {
	//Action
	switch (G.TCunit!.ai_mode) {
		case K.ai_idle:
			G.TCunit!.ai_timer = 0;
			if (Animating(G.TCunit!.mh) !== 0) G.TCunit!.ai_timer = G.gt + 10000;
			break;
		case K.ai_attack:
			ai_attack();
			break;
		case K.ai_getfood:
		case K.ai_flee:
			G.TCunit!.ai_timer = 0;
			break;
		case K.ai_sani:
			ai_dosani();
			break;
	}

	//Set Mode
	if (G.gt - G.TCunit!.ai_timer > G.TCunit!.ai_duration) {
		ai_mode(K.ai_idle);
	}
	if (G.in_gt50go !== 0) ai_check(K.ai_agressive, 0, 0);
}
