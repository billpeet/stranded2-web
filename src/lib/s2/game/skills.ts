/**
 * includes/skills.bb: the player's skills. A skill is a Tx record with mode 5:
 * key = skill id, value = its value, stuff = its caption.
 */
import { Int, Str } from '../blitz';
import { Delete, First, After, New, Tx } from './types';

//############################################ Skills

//Set Skill
/** Function set_skill(skill$,value,caption$="") */
export function set_skill(skill: string, value: number, caption: string = ''): number {
	let Tx_: Tx | null = null;
	//Modify Existing
	for (Tx_ = First(Tx); Tx_ !== null; Tx_ = After(Tx, Tx_)) {
		if (Tx_.mode === 5) {
			if (Tx_.key === skill) {
				Tx_.value = Str(value);
				if (caption !== '') Tx_.stuff = caption;
				return 2;
			}
		}
	}
	//Create New
	Tx_ = New(Tx);
	Tx_.mode = 5;
	Tx_.key = skill;
	Tx_.value = Str(value);
	Tx_.stuff = caption;
	return 1;
}

//Inc Skill
/** Function inc_skill(skill$,modify,caption$="") */
export function inc_skill(skill: string, modify: number, caption: string = ''): number {
	let Tx_: Tx | null = null;
	//Modify Existing
	for (Tx_ = First(Tx); Tx_ !== null; Tx_ = After(Tx, Tx_)) {
		if (Tx_.mode === 5) {
			if (Tx_.key === skill) {
				Tx_.value = Str((Int(Tx_.value) + modify) | 0);
				// quirk: unlike set_skill the caption is overwritten even when it is ""
				Tx_.stuff = caption;
				return 1;
			}
		}
	}
	//Create New
	Tx_ = New(Tx);
	Tx_.mode = 5;
	Tx_.key = skill;
	Tx_.value = Str(modify);
	Tx_.stuff = caption;
	return 0;
}

//Free Skill
/** Function free_skill(skill$) */
export function free_skill(skill: string): number {
	let Tx_: Tx | null = null;
	for (Tx_ = First(Tx); Tx_ !== null; Tx_ = After(Tx, Tx_)) {
		if (Tx_.mode === 5) {
			if (Tx_.key === skill) {
				Delete(Tx, Tx_);
				return 1;
			}
		}
	}
	//Fail
	return 0;
}

//Got Skill
/** Function got_skill(skill$) */
export function got_skill(skill: string): number {
	let Tx_: Tx | null = null;
	for (Tx_ = First(Tx); Tx_ !== null; Tx_ = After(Tx, Tx_)) {
		if (Tx_.mode === 5) {
			if (Tx_.key === skill) {
				return 1;
			}
		}
	}
	//Fail
	return 0;
}

//Skill Value
/** Function skill_value(skill$) */
export function skill_value(skill: string): number {
	let Tx_: Tx | null = null;
	for (Tx_ = First(Tx); Tx_ !== null; Tx_ = After(Tx, Tx_)) {
		if (Tx_.mode === 5) {
			if (Tx_.key === skill) {
				return Int(Tx_.value);
			}
		}
	}
	//Fail
	return 0;
}

//Skill Name
/** Function skill_name(skill$,name$) */
export function skill_name(skill: string, name: string): number {
	let Tx_: Tx | null = null;
	for (Tx_ = First(Tx); Tx_ !== null; Tx_ = After(Tx, Tx_)) {
		if (Tx_.mode === 5) {
			if (Tx_.key === skill) {
				Tx_.stuff = name;
				return 1;
			}
		}
	}
	//Fail
	return 0;
}
