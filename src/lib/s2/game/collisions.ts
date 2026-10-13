/**
 * includes/collisions.bb, ported line by line.
 */
import {
	CollisionEntity,
	CollisionX,
	CollisionY,
	CollisionZ,
	Collisions,
	CountCollisions,
	EntityX,
	EntityY,
	EntityZ,
	TranslateEntity,
	type Handle
} from '../bb3d';
import { f32 } from '../blitz';
import { Cworld_col, Cworld_itemcol, Cworld_procol, Cworld_unitcol } from './consts';
import { Dobject_col, Dunit_colyr } from './defs_arrays';
import { get_object } from './handle_objects';
import { G } from './state';

//############################################ Collisions

/** Top-level code of collisions.bb */
export function include_collisions(): void {
	//Set Collisions
	col_set();
}

/** Function col_set() */
export function col_set(): void {
	Collisions(Cworld_unitcol, Cworld_col, 2, 3); //UNITS -> WORLD (Radius->Polygon, slide)
	//Collisions Cworld_unitcol,Cworld_unitcol,1,3	;UNITS -> UNITS (Radius->Radius, slide)
	Collisions(Cworld_procol, Cworld_col, 2, 3); //PROJECTILES -> WORLD (Radius->Polygon, slide)
	Collisions(Cworld_procol, Cworld_unitcol, 1, 3); //PROJECTILES -> UNITS (Radius->Radius, slide)
	Collisions(Cworld_procol, Cworld_itemcol, 2, 1); //PROJECTILES -> ITEMS (Radius->Polygon, stop)
	Collisions(Cworld_itemcol, Cworld_col, 2, 3); //ITEMS -> WORLD (Radius->Polygon, slide)
}

//### Collision Center = Bottom?
/** Function col_bottom(h,radius#) */
export function col_bottom(h: Handle, _radius: number): void {
	let c = 0;
	let x = 0;
	let y = 0;
	let z = 0;
	let i = 0;
	c = CountCollisions(h);
	x = EntityX(h);
	y = EntityY(h);
	z = EntityZ(h);
	if (c > 0) {
		// quirk: an empty loop; the function has no effect
		for (i = 1; i <= c; i++) {
			/* empty */
		}
	}
	void x;
	void y;
	void z;
}

//### Jump Col Check
/** Function col_jump() */
export function col_jump(): number {
	let c = 0;
	let out = 0;
	let i = 0;
	let h: Handle = null;
	c = CountCollisions(G.TCunit!.h);
	if (c > 0) {
		out = 1;
		for (i = 1; i <= c; i++) {
			h = CollisionEntity(G.TCunit!.h, i);
			if (get_object(h) !== -1) {
				//High Collision - No Jump!
				if (Dobject_col(G.TCobject!.typ) !== 4) {
					if (CollisionY(G.TCunit!.h, i) > f32(EntityY(G.TCunit!.h) - f32(Dunit_colyr(G.TCunit!.typ) / 1.5))) {
						return 0;
					}
				}
			}
		}
		return out;
	} else {
		return 1;
	}
}

//### Player Collision
/** Function col_player() */
export function col_player(): void {
	let c = 0;
	let i = 0;
	let h: Handle = null;
	c = CountCollisions(G.TCunit!.h);
	if (c > 0) {
		for (i = 1; i <= c; i++) {
			h = CollisionEntity(G.TCunit!.h, i);
			if (get_object(h) !== -1) {
				//High Collision
				if (Dobject_col(G.TCobject!.typ) !== 4) {
					if (CollisionY(G.TCunit!.h, i) > f32(EntityY(G.TCunit!.h) - f32(Dunit_colyr(G.TCunit!.typ) / 1.5))) {
						//X Correction
						if (CollisionX(G.TCunit!.h, i) > EntityX(G.TCunit!.h)) {
							TranslateEntity(G.TCunit!.h, -1, 0, 0);
						} else {
							TranslateEntity(G.TCunit!.h, 1, 0, 0);
						}
						//Z Correction
						if (CollisionZ(G.TCunit!.h, i) > EntityZ(G.TCunit!.h)) {
							TranslateEntity(G.TCunit!.h, 0, 0, -1);
						} else {
							TranslateEntity(G.TCunit!.h, 0, 0, 1);
						}
					}
				}
			}
		}
	}
}
