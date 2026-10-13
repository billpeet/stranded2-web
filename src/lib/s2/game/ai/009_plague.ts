/**
 * includes/ai/009_plague.bb: top-level code, included inside
 * `Select Dunit_behaviour(TCunit\typ)` of update_unit (ai_units.bb). Works on
 * G.TCunit like the inline code. The implicitly declared locals of update_unit
 * it uses are locals here (each is assigned before it is read).
 *
 * K.<name> are the AI constants of load_const.bb (ai_idle, ai_move, ...): several
 * have the same name as a function of ai_units.bb (Blitz keeps constants and
 * functions in separate name spaces), so the constants are read through K.
 */
import { Animating, EntityDistance, TurnEntity } from '../../bb3d';
import { Int, Rand, f32 } from '../../blitz';
import { ai_attack, ai_check, ai_dosani, ai_flee, ai_getfood, ai_hunt, ai_mode, ai_move, ai_movesound, ai_movetarget, ai_return } from '../ai_units';
import * as K from '../consts';
import { Cclass_item, Cclass_object, Cclass_unit, Cstate_ai_stick } from '../consts';
import { Ditem_behaviour, Dobject_behaviour, Dunit_speed, Dunit_tspeed } from '../defs_arrays';
import { get_state } from '../handle_states';
import { G } from '../state';
import { After, First, Titem, Tobject } from '../types';

/** Include "includes\ai\009_plague.bb" */
export function include_009_plague(): void {
	let hdist = 0;
	let dist = 0;
	let x = 0;
	let Titem_: Titem | null = null;
	let Tobject_: Tobject | null = null;

	//Stay?
	if (G.TCunit!.states === 1) {
		if (G.TCunit!.ai_mode !== K.ai_idle) {
			if (get_state(Cstate_ai_stick, Cclass_unit, G.TCunit!.id) === 1) {
				ai_mode(K.ai_idle);
			}
		}
	}

	//Get Food
	if (G.in_t3000go === 1) {
		if (G.TCunit!.ai_mode !== K.ai_getfood) {

			hdist = 500;
			dist = 0;

			//Items
			for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
				if (Titem_.parent_class === 0) {
					dist = Int(EntityDistance(Titem_.h, G.TCunit!.h)); // quirk: dist is an Int local, the distance is rounded
					if (dist < hdist) {
						if (Ditem_behaviour(Titem_.typ) === 'plague_target') {
							hdist = dist;
							G.TCunit!.ai_target_class = Cclass_item;
							G.TCunit!.ai_target_id = Titem_.id;
							ai_mode(K.ai_getfood, 20000);
						}
					}
				}
			}


			if (G.TCunit!.ai_mode !== K.ai_getfood) {
				//Objects
				for (Tobject_ = First(Tobject); Tobject_ !== null; Tobject_ = After(Tobject, Tobject_)) {
					dist = Int(EntityDistance(Tobject_.h, G.TCunit!.h)); // quirk: dist is an Int local, the distance is rounded
					if (dist < hdist) {
						if (Dobject_behaviour(Tobject_.typ) === 'plague_target') {
							hdist = dist;
							G.TCunit!.ai_target_class = Cclass_object;
							G.TCunit!.ai_target_id = Tobject_.id;
							ai_mode(K.ai_getfood, 20000);
						}
					}
				}
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
		x = Rand(0, 15);
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
	if (G.in_gt50go !== 0) ai_check(K.ai_passive);
}
