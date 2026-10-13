/**
 * includes/ai_signals.bb as it is in the shipped executable (1.0.0.1).
 *
 * The file of that name in the source repository is a stray copy of an AI
 * behaviour file and is not what shipped. The executable has four functions in
 * its place; they are reconstructed here from the machine code
 * (stranded2_main.elf: ai_signal 0x550b30, ai_typesignal 0x550de0,
 * ai_behavioursignal 0x5510a0, ai_unitmode 0x5513a0; decompiled C in
 * s2_re/out/decomp). Parameter and local names are not in the executable: they
 * follow the callers (handle_infos.bb:254, parser_commands.bb:5326-5386) and the
 * constants of load_const.bb ("Signals": ai_food=2, ai_attract=1, ai_distract=-1).
 *
 * How the code was read:
 *  - Tunit fields by offset (4 bytes each, in declaration order): +0x04 typ,
 *    +0x08 h, +0x18 health#, +0x68 ai_mode, +0x70 ai_target_class,
 *    +0x74 ai_target_id, +0x78 ai_timer, +0x7c ai_duration.
 *  - The "calls" L_20053() / L_20064() / L_20079() followed by `return` in the
 *    decompiled C are jumps to the end of the Select (0x550d5d, 0x551023,
 *    0x5512ee), which falls into the `Next` of the For Each loop: the loop goes
 *    on with the next unit, every unit in range gets the signal.
 *  - In ai_behavioursignal the end of the Select is followed by two more
 *    statements (0x5512ee-0x551318) which the decompiler dropped:
 *    TCunit\ai_duration=10000 and TCunit\ai_timer=gt.
 *  - All four end with the implicit "Return 0" of a function without Return.
 */
import { EntityDistance, type Handle } from '../bb3d';
import { ai_mode } from './ai_units';
import * as K from './consts';
import { ai_attract, ai_distract, ai_food } from './consts';
import { Dunit_behaviour } from './defs_arrays';
import { con_unit } from './handle_units';
import { parent_h } from './parentchild';
import { G } from './state';
import { After, First, Tunit } from './types';

/**
 * Function ai_signal(class,id,signal,range)
 *
 *     Local temp.Tunit=TCunit
 *     h=parent_h(class,id)
 *     If h<>0 Then
 *         For Tunit.Tunit=Each Tunit
 *             If Tunit\health#>0. Then
 *                 If EntityDistance(Tunit\h,h)<range Then
 *                     TCunit=Tunit
 *                     TCunit\ai_target_class=class
 *                     TCunit\ai_target_id=id
 *                     Select signal
 *                         Case ai_food     If TCunit\ai_mode<>ai_getfood Then ai_mode(ai_getfood,20000)
 *                         Case ai_attract  If TCunit\ai_mode<>ai_movetarget Then ai_mode(ai_movetarget,20000)
 *                         Case ai_distract If TCunit\ai_mode<>ai_flee Then ai_mode(ai_flee,20000)
 *                     End Select
 *                 EndIf
 *             EndIf
 *         Next
 *     EndIf
 *     TCunit=temp
 */
export function ai_signal(class_: number, id: number, signal: number, range: number): void {
	let temp: Tunit | null = null;
	let h: Handle = null;
	let Tunit_: Tunit | null = null;

	temp = G.TCunit;
	h = parent_h(class_, id, 0);
	if (h !== null) {
		for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
			if (Tunit_.health > 0) {
				if (EntityDistance(Tunit_.h, h) < range) {
					G.TCunit = Tunit_;
					G.TCunit.ai_target_class = class_;
					G.TCunit.ai_target_id = id;
					switch (signal) {
						case ai_food:
							if (G.TCunit.ai_mode !== K.ai_getfood) {
								ai_mode(K.ai_getfood, 20000, 1);
							}
							break;
						case ai_attract:
							if (G.TCunit.ai_mode !== K.ai_movetarget) {
								ai_mode(K.ai_movetarget, 20000, 1);
							}
							break;
						case ai_distract:
							if (G.TCunit.ai_mode !== K.ai_flee) {
								ai_mode(K.ai_flee, 20000, 1);
							}
							break;
					}
				}
			}
		}
	}
	G.TCunit = temp;
}

/**
 * Function ai_typesignal(class,id,signal,typ,range)
 *
 * Like ai_signal, for the units of one type only
 * (`If Tunit\health#>0. Then : If Tunit\typ=typ Then`), and with a mode
 * duration of 10000 instead of 20000.
 */
export function ai_typesignal(class_: number, id: number, signal: number, typ: number, range: number): void {
	let temp: Tunit | null = null;
	let h: Handle = null;
	let Tunit_: Tunit | null = null;

	temp = G.TCunit;
	h = parent_h(class_, id, 0);
	if (h !== null) {
		for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
			if (Tunit_.health > 0) {
				if (Tunit_.typ === typ) {
					if (EntityDistance(Tunit_.h, h) < range) {
						G.TCunit = Tunit_;
						G.TCunit.ai_target_class = class_;
						G.TCunit.ai_target_id = id;
						switch (signal) {
							case ai_food:
								if (G.TCunit.ai_mode !== K.ai_getfood) {
									ai_mode(K.ai_getfood, 10000, 1);
								}
								break;
							case ai_attract:
								if (G.TCunit.ai_mode !== K.ai_movetarget) {
									ai_mode(K.ai_movetarget, 10000, 1);
								}
								break;
							case ai_distract:
								if (G.TCunit.ai_mode !== K.ai_flee) {
									ai_mode(K.ai_flee, 10000, 1);
								}
								break;
						}
					}
				}
			}
		}
	}
	G.TCunit = temp;
}

/**
 * Function ai_behavioursignal(class,id,signal,behaviour,range)
 *
 * Like ai_typesignal, for the units whose type has one behaviour
 * (`If Dunit_behaviour(Tunit\typ)=behaviour Then`). After the Select it
 * restarts the mode timer of every unit it reached:
 *
 *                         End Select
 *                         TCunit\ai_duration=10000
 *                         TCunit\ai_timer=gt
 */
export function ai_behavioursignal(class_: number, id: number, signal: number, behaviour: number, range: number): void {
	let temp: Tunit | null = null;
	let h: Handle = null;
	let Tunit_: Tunit | null = null;

	temp = G.TCunit;
	h = parent_h(class_, id, 0);
	if (h !== null) {
		for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
			if (Tunit_.health > 0) {
				if (Dunit_behaviour(Tunit_.typ) === behaviour) {
					if (EntityDistance(Tunit_.h, h) < range) {
						G.TCunit = Tunit_;
						G.TCunit.ai_target_class = class_;
						G.TCunit.ai_target_id = id;
						switch (signal) {
							case ai_food:
								if (G.TCunit.ai_mode !== K.ai_getfood) {
									ai_mode(K.ai_getfood, 10000, 1);
								}
								break;
							case ai_attract:
								if (G.TCunit.ai_mode !== K.ai_movetarget) {
									ai_mode(K.ai_movetarget, 10000, 1);
								}
								break;
							case ai_distract:
								if (G.TCunit.ai_mode !== K.ai_flee) {
									ai_mode(K.ai_flee, 10000, 1);
								}
								break;
						}
						// quirk: also for a signal that is none of the three, and when the mode was not changed
						G.TCunit.ai_duration = 10000;
						G.TCunit.ai_timer = G.gt;
					}
				}
			}
		}
	}
	G.TCunit = temp;
}

/**
 * Function ai_unitmode(unit,mode,class,id)
 *
 *     If con_unit(unit) Then
 *         ai_mode(mode)
 *         TCunit\ai_target_class=class
 *         TCunit\ai_target_id=id
 *     EndIf
 *
 * quirk: TCunit is not restored: it stays on the unit (script command "ai_mode").
 */
export function ai_unitmode(unit: number, mode: number, class_: number, id: number): void {
	if (con_unit(unit)) {
		ai_mode(mode, 0, 1);
		G.TCunit!.ai_target_class = class_;
		G.TCunit!.ai_target_id = id;
	}
}
