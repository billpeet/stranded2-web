/**
 * includes/ai/005_idleturn.bb: top-level code, included inside
 * `Select Dunit_behaviour(TCunit\typ)` of update_unit (ai_units.bb). Works on
 * G.TCunit like the inline code. The implicitly declared locals of update_unit
 * it uses are locals here (each is assigned before it is read).
 *
 * K.<name> are the AI constants of load_const.bb (ai_idle, ai_move, ...): several
 * have the same name as a function of ai_units.bb (Blitz keeps constants and
 * functions in separate name spaces), so the constants are read through K.
 */
import { Animating, DeltaYaw, EntityDistance, EntityYaw, RotateEntity } from '../../bb3d';
import { f32 } from '../../blitz';
import { ai_dosani, ai_mode } from '../ai_units';
import * as K from '../consts';
import { Dunit_attackrange } from '../defs_arrays';
import { G } from '../state';

/** Include "includes\ai\005_idleturn.bb" */
export function include_005_idleturn(): void {
	//Turn to Target
	if (EntityDistance(G.TCunit!.h, G.g_cplayer!.h) < Dunit_attackrange(G.TCunit!.typ)) {
		RotateEntity(G.TCunit!.h, 0, f32(EntityYaw(G.TCunit!.h) + f32(DeltaYaw(G.TCunit!.h, G.g_cplayer!.h) / f32(5 * G.f))), 0);
	}

	//Action
	switch (G.TCunit!.ai_mode) {
		case K.ai_idle:
			G.TCunit!.ai_timer = 0;
			if (Animating(G.TCunit!.mh) !== 0) G.TCunit!.ai_timer = G.gt + 10000;
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
}
