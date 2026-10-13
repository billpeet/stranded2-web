/**
 * includes/physics.bb, ported line by line.
 */
import { f32 } from '../blitz';
import { Cstate_phy } from './consts';
import { After, First, New, Tstate } from './types';

//############################################ Physics

//Set Physics
/** Function phy_set(class,id,x#,y#,z#,mx#=1.,my#=1.,mz#=1.) */
export function phy_set(class_: number, id: number, x: number, y: number, z: number, _mx: number = 1, _my: number = 1, _mz: number = 1): void {
	let found = 0;
	let Tstate_: Tstate | null = null;
	for (Tstate_ = First(Tstate); Tstate_ !== null; Tstate_ = After(Tstate, Tstate_)) {
		if (Tstate_.typ === Cstate_phy) {
			if (Tstate_.parent_class === class_) {
				if (Tstate_.parent_id === id) {
					found = 1;
					break;
				}
			}
		}
	}
	if (found === 0) {
		Tstate_ = New(Tstate);
		Tstate_.parent_class = class_;
		Tstate_.parent_id = id;
		Tstate_.typ = Cstate_phy;
	}
	Tstate_!.fx = f32(x);
	Tstate_!.fy = f32(y);
	Tstate_!.fz = f32(z);
	Tstate_!.x = f32(x);
	Tstate_!.y = f32(y);
	Tstate_!.z = f32(z);
}
