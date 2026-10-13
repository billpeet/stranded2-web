import type * as THREE from 'three';

/**
 * Blitz3D draw order (blitz3d/world.cpp World::render), the one
 * implementation shared by bb3d and the environment module.
 *
 * Per camera Blitz draws
 *   1. models with EntityOrder > 0, highest first, without depth test,
 *   2. unordered models: opaque surfaces, then the transparent ones far to
 *      near by the distance from the eye to the ENTITY ORIGIN (TransComp),
 *      with depth test but no depth write,
 *   3. models with EntityOrder < 0, highest (closest to 0) first, without
 *      depth test.
 *
 * bb3d renders each distinct order value as its own pass (see World.render);
 * objects that are not bb3d entities emulate the order with `renderOrderFor`.
 */

interface RenderItem {
	groupOrder: number;
	renderOrder: number;
	id: number;
	object: THREE.Object3D;
}

/**
 * Transparent sort as World::render does it: far to near by the distance
 * from the eye to the entity origin (not view depth). Objects may carry
 * `userData.blitzOrigin` when their mesh is not at the entity origin (the
 * environment module's camera-following planes).
 * renderOrder still takes precedence so `renderOrderFor` keeps working.
 */
export function makeBlitzTransparentSort(eye: THREE.Vector3) {
	const dist = (o: THREE.Object3D): number => {
		const origin = o.userData.blitzOrigin as THREE.Vector3 | undefined;
		if (origin) return eye.distanceToSquared(origin);
		const e = o.matrixWorld.elements;
		const dx = e[12] - eye.x;
		const dy = e[13] - eye.y;
		const dz = e[14] - eye.z;
		return dx * dx + dy * dy + dz * dz;
	};
	return (a: RenderItem, b: RenderItem): number => {
		if (a.groupOrder !== b.groupOrder) return a.groupOrder - b.groupOrder;
		if (a.renderOrder !== b.renderOrder) return a.renderOrder - b.renderOrder;
		const d = dist(b.object) - dist(a.object);
		if (d !== 0) return d;
		return a.id - b.id;
	};
}

/**
 * Render order values that emulate EntityOrder for objects outside bb3d:
 * positive orders draw before everything else and negative ones after. The
 * caller also has to switch depth test and depth write off on the material.
 */
export function renderOrderFor(entityOrder: number): number {
	if (entityOrder > 0) return -1000 - entityOrder;
	if (entityOrder < 0) return 1000 - entityOrder;
	return 0;
}

/** Distinct order values, in the sequence Blitz draws them: positive descending, 0, negative descending. */
export function orderSequence(orders: Iterable<number>): number[] {
	const set = new Set<number>(orders);
	set.add(0);
	return [...set].sort((a, b) => b - a);
}
