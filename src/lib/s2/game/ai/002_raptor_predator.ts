/**
 * includes/ai/002_raptor_predator.bb: top-level code, included inside
 * `Select Dunit_behaviour(TCunit\typ)` of update_unit (ai_units.bb). Works on
 * G.TCunit like the inline code. The implicitly declared locals of update_unit
 * it uses are locals here (each is assigned before it is read).
 *
 * K.<name> are the AI constants of load_const.bb (ai_idle, ai_move, ...): several
 * have the same name as a function of ai_units.bb (Blitz keeps constants and
 * functions in separate name spaces), so the constants are read through K.
 */
import { Animating, TurnEntity } from '../../bb3d';
import { Rand, f32 } from '../../blitz';
import { ai_attack, ai_check, ai_dosani, ai_flee, ai_getfood, ai_hunt, ai_mode, ai_move, ai_movesound, ai_movetarget, ai_return } from '../ai_units';
import * as K from '../consts';
import { Cclass_unit, Cstate_ai_stick } from '../consts';
import { Dunit_speed, Dunit_tspeed } from '../defs_arrays';
import { get_state } from '../handle_states';
import { G } from '../state';

/** Include "includes\ai\002_raptor_predator.bb" */
export function include_002_raptor_predator(): void {
	let x = 0;

	//Stay?
	if (G.TCunit!.states === 1) {
		if (G.TCunit!.ai_mode !== K.ai_idle && G.TCunit!.ai_mode !== K.ai_attack) {
			if (get_state(Cstate_ai_stick, Cclass_unit, G.TCunit!.id) === 1) {
				ai_mode(K.ai_idle);
			}
		}
	}

	//Action
	switch (G.TCunit!.ai_mode) {
		case K.ai_idle:
			G.TCunit!.ai_timer = 0;
			if (Animating(G.TCunit!.mh) !== 0) G.TCunit!.ai_timer = G.gt + 10000;
			break;
		case K.ai_move:
			ai_movesound();
			ai_move(Dunit_speed(G.TCunit!.typ), 90);
			break;
		case K.ai_movel:
			ai_movesound();
			ai_move(Dunit_speed(G.TCunit!.typ), 90);
			TurnEntity(G.TCunit!.h, 0, f32(Dunit_tspeed(G.TCunit!.typ) * G.f), 0);
			break;
		case K.ai_mover:
			ai_movesound();
			ai_move(Dunit_speed(G.TCunit!.typ), 90);
			TurnEntity(G.TCunit!.h, 0, f32(-Dunit_tspeed(G.TCunit!.typ) * G.f), 0);
			break;
		case K.ai_movetarget:
			ai_movesound();
			ai_movetarget();
			break;
		case K.ai_return:
			ai_movesound();
			ai_return();
			break;
		case K.ai_sreturn:
			ai_movesound();
			ai_return(0, 2);
			break;
		case K.ai_attack:
			ai_attack();
			break;
		case K.ai_hunt:
			ai_movesound();
			ai_hunt();
			break;
		case K.ai_getfood:
			ai_movesound();
			ai_getfood();
			break;
		case K.ai_flee:
			ai_movesound();
			ai_flee();
			break;
		case K.ai_sani:
			ai_dosani();
			break;
	}

	//Set Mode
	if (G.gt - G.TCunit!.ai_timer > G.TCunit!.ai_duration) {
		x = Rand(0, 11);
		switch (x) {
			case 0:
			case 1:
			case 2:
			case 3:
				ai_mode(K.ai_move);
				break;
			case 4:
			case 5:
			case 6:
				ai_mode(K.ai_movel);
				break;
			case 7:
			case 8:
			case 9:
				ai_mode(K.ai_mover);
				break;
			default:
				ai_mode(K.ai_idle);
				break;
		}
	}
	if (G.in_gt50go !== 0) ai_check(K.ai_agressive);
}
