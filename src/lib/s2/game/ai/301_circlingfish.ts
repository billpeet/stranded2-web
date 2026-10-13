/**
 * includes/ai/301_circlingfish.bb: top-level code, included inside
 * `Select Dunit_behaviour(TCunit\typ)` of update_unit (ai_units.bb). Works on
 * G.TCunit like the inline code. The implicitly declared locals of update_unit
 * it uses are locals here (each is assigned before it is read).
 *
 * K.<name> are the AI constants of load_const.bb (ai_idle, ai_move, ...): several
 * have the same name as a function of ai_units.bb (Blitz keeps constants and
 * functions in separate name spaces), so the constants are read through K.
 */
import { EntityCollided, EntityX, EntityY, EntityZ, MoveEntity, TurnEntity } from '../../bb3d';
import { Rand, f32 } from '../../blitz';
import { ai_dosani, ai_mode, ai_movesound, ai_watertest } from '../ai_units';
import * as K from '../consts';
import { Cworld_col } from '../consts';
import { Dunit_colyr, Dunit_tspeed } from '../defs_arrays';
import { e_tery } from '../e_environment';
import { unit_speed } from '../handle_units';
import { G } from '../state';

/** Include "includes\ai\301_circlingfish.bb" */
export function include_301_circlingfish(): void {
	//Action
	switch (G.TCunit!.ai_mode) {
		case K.ai_movel:
			//Move
			ai_movesound();
			TurnEntity(G.TCunit!.h, 0, f32(Dunit_tspeed(G.TCunit!.typ) * G.f), 0);
			MoveEntity(G.TCunit!.h, 0, 0, f32(unit_speed() * G.f));
			//Collision?
			if (e_tery(EntityX(G.TCunit!.h), EntityZ(G.TCunit!.h)) <= f32(EntityY(G.TCunit!.h) - Dunit_colyr(G.TCunit!.typ))) {
				MoveEntity(G.TCunit!.h, 0, 0, f32(-unit_speed() * G.f));
				TurnEntity(G.TCunit!.h, 0, f32(Dunit_tspeed(G.TCunit!.typ) * G.f), 0);
				ai_watertest();
			} else if (EntityCollided(G.TCunit!.h, Cworld_col) !== null) {
				TurnEntity(G.TCunit!.h, 0, f32(Dunit_tspeed(G.TCunit!.typ) * G.f), 0);
			}
			break;
		case K.ai_mover:
			//Move
			ai_movesound();
			TurnEntity(G.TCunit!.h, 0, f32(-Dunit_tspeed(G.TCunit!.typ) * G.f), 0);
			MoveEntity(G.TCunit!.h, 0, 0, f32(unit_speed() * G.f));
			//Collision?
			if (e_tery(EntityX(G.TCunit!.h), EntityZ(G.TCunit!.h)) <= f32(EntityY(G.TCunit!.h) - Dunit_colyr(G.TCunit!.typ))) {
				MoveEntity(G.TCunit!.h, 0, 0, f32(-unit_speed() * G.f));
				TurnEntity(G.TCunit!.h, 0, f32(-Dunit_tspeed(G.TCunit!.typ) * G.f), 0);
				ai_watertest();
			} else if (EntityCollided(G.TCunit!.h, Cworld_col) !== null) {
				TurnEntity(G.TCunit!.h, 0, f32(-Dunit_tspeed(G.TCunit!.typ) * G.f), 0);
			}
			break;
		case K.ai_sani:
			ai_dosani();
			break;
		default:
			//If Rand(1,2)=1 Then ai_mode(ai_movel) Else ai_mode(ai_mover)
			break;
	}
}
