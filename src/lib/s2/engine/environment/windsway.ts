import type * as THREE from 'three';
import { entityAngles, rotateEntity } from '../blitzSpace';
import { Sin, fmod, type BlitzRandom } from './blitzMath';

/**
 * Object wind sway. Ported from update_object() in
 * includes/handle_objects.bb; cull() in includes/cull.bb runs the same lines
 * inline for every object that is in view and whose type has a non-zero
 * swayspeed.
 */

/** The per-object state the sway needs (Tobject\windsway#). */
export interface WindSwayState {
	windsway: number;
}

/** set_object(): Tobject\windsway#=Rand(0,360) */
export function initialWindsway(rng: BlitzRandom): number {
	return rng.Rand(0, 360);
}

/**
 * update_object():
 *   If set_windsway Then
 *     angle#=(TCobject\windsway#+(Dobject_swayspeed#(typ)*f#)) Mod 360
 *     TCobject\windsway#=angle#
 *     RotateEntity h,EntityPitch(h),EntityYaw(h),Sin(angle#)*Dobject_swaypower#(typ)
 *
 * Call it only for objects with swayspeed <> 0 that are in view, as cull() does.
 * `pitch`/`yaw` may be passed when the caller tracks them, otherwise they are
 * read back from the entity like EntityPitch/EntityYaw.
 */
export function update_object(
	h: THREE.Object3D,
	state: WindSwayState,
	swayspeed: number,
	swaypower: number,
	f: number,
	set_windsway: number,
	pitch?: number,
	yaw?: number
): void {
	//Windsway
	if (set_windsway) {
		let angle = state.windsway;
		angle = Math.fround(fmod(Math.fround(angle + Math.fround(swayspeed * f)), 360));
		state.windsway = angle;
		if (pitch === undefined || yaw === undefined) {
			const a = entityAngles(h);
			pitch = pitch ?? a.pitch;
			yaw = yaw ?? a.yaw;
		}
		rotateEntity(h, pitch, yaw, Sin(angle) * swaypower);
	}
}
