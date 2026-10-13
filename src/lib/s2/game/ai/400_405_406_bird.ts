/**
 * includes/ai/400_405_406_bird.bb: top-level code, included inside
 * `Select Dunit_behaviour(TCunit\typ)` of update_unit (ai_units.bb). Works on
 * G.TCunit like the inline code. The implicitly declared locals of update_unit
 * it uses are locals here (each is assigned before it is read).
 *
 * K.<name> are the AI constants of load_const.bb (ai_idle, ai_move, ...): several
 * have the same name as a function of ai_units.bb (Blitz keeps constants and
 * functions in separate name spaces), so the constants are read through K.
 */
import { MoveEntity, TurnEntity } from '../../bb3d';
import { Rand, f32 } from '../../blitz';
import { ai_check, ai_dosani, ai_flee, ai_getfood, ai_mode, ai_movesound, ai_return } from '../ai_units';
import * as K from '../consts';
import { Cclass_unit, Cstate_ai_stick } from '../consts';
import { Dunit_tspeed } from '../defs_arrays';
import { get_state } from '../handle_states';
import { unit_speed } from '../handle_units';
import { G } from '../state';

/** Include "includes\ai\400_405_406_bird.bb" */
export function include_400_405_406_bird(): void {
	let x = 0;

	//Stay?
	if (G.TCunit!.states === 1) {
		if (get_state(Cstate_ai_stick, Cclass_unit, G.TCunit!.id) === 1) {
			ai_mode(K.ai_idle);
		}
	}

	//Action
	switch (G.TCunit!.ai_mode) {
		case K.ai_move:
			ai_movesound();
			MoveEntity(G.TCunit!.h, 0, 0, f32(unit_speed() * G.f));
			break;
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
		case K.ai_return:
			ai_movesound();
			ai_return(1);
			break;
		case K.ai_sreturn:
			ai_movesound();
			ai_return(1);
			break;
		case K.ai_getfood:
			ai_movesound();
			ai_getfood(1);
			break;
		case K.ai_flee:
			ai_movesound();
			ai_flee(1);
			break;
		case K.ai_sani:
			ai_dosani();
			break;
	}

	//Set Mode
	if (G.gt - G.TCunit!.ai_timer > G.TCunit!.ai_duration) {
		x = Rand(0, 7);
		switch (x) {
			case 0:
			case 1:
				ai_mode(K.ai_move);
				break;
			case 2:
			case 3:
			case 4:
				ai_mode(K.ai_movel);
				break;
			case 5:
			case 6:
			case 7:
				ai_mode(K.ai_mover);
				break;
		}
	}
	if (G.in_gt50go !== 0) ai_check(K.ai_shy, 0);
}
