/**
 * includes/ai/401_circlingbird.bb: top-level code, included inside
 * `Select Dunit_behaviour(TCunit\typ)` of update_unit (ai_units.bb). Works on
 * G.TCunit like the inline code. The implicitly declared locals of update_unit
 * it uses are locals here (each is assigned before it is read).
 *
 * K.<name> are the AI constants of load_const.bb (ai_idle, ai_move, ...): several
 * have the same name as a function of ai_units.bb (Blitz keeps constants and
 * functions in separate name spaces), so the constants are read through K.
 */
import { MoveEntity, TurnEntity } from '../../bb3d';
import { f32 } from '../../blitz';
import { ai_dosani, ai_mode, ai_movesound } from '../ai_units';
import * as K from '../consts';
import { Cclass_unit, Cstate_ai_stick } from '../consts';
import { Dunit_tspeed } from '../defs_arrays';
import { get_state } from '../handle_states';
import { unit_speed } from '../handle_units';
import { G } from '../state';

/** Include "includes\ai\401_circlingbird.bb" */
export function include_401_circlingbird(): void {
	//Stay?
	if (G.TCunit!.states === 1) {
		if (get_state(Cstate_ai_stick, Cclass_unit, G.TCunit!.id) === 1) {
			ai_mode(K.ai_idle);
		}
	}

	//Action
	switch (G.TCunit!.ai_mode) {
		case K.ai_movel:
			ai_movesound();
			MoveEntity(G.TCunit!.h, 0, 0, f32(unit_speed() * G.f));
			TurnEntity(G.TCunit!.h, 0, f32(Dunit_tspeed(G.TCunit!.typ) * G.f), 0);
			break;
		case K.ai_mover:
			ai_movesound();
			MoveEntity(G.TCunit!.h, 0, 0, f32(unit_speed() * G.f));
			TurnEntity(G.TCunit!.h, 0, f32(-Dunit_tspeed(G.TCunit!.typ) * G.f), 0);
			break;
		case K.ai_sani:
			ai_dosani();
			break;
	}
}
