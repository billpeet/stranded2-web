/**
 * Builds MeshColliders from parsed .b3d models (formats/b3d.ts), which are
 * already in Blitz coordinates and Blitz winding.
 */
import type { B3dModel, B3dNode } from '../../formats/b3d';
import { Matrix, Quat, Transform, Vector } from './geom';
import { MeshCollider, type ColliderSurface } from './meshCollider';

/** Local transform of a .b3d node, composed as Entity::getLocalTform does. */
export function b3dNodeTform(node: B3dNode): Transform {
	const [w, x, y, z] = node.rotation;
	const m = Matrix.fromQuat(new Quat(w, new Vector(x, y, z)).normalized());
	m.i = m.i.mul(node.scale[0]);
	m.j = m.j.mul(node.scale[1]);
	m.k = m.k.mul(node.scale[2]);
	return new Transform(m, new Vector(node.position[0], node.position[1], node.position[2]));
}

/** The surfaces of one node's own mesh, untransformed (what a LoadAnimMesh child entity collides with). */
export function b3dNodeSurfaces(node: B3dNode, surfaceBase = 0): ColliderSurface[] {
	if (!node.mesh) return [];
	return node.mesh.surfaces.map((s, i) => ({
		positions: node.mesh!.positions,
		indices: s.indices,
		surface: surfaceBase + i
	}));
}

/**
 * LoadMesh semantics (bbLoadMesh -> collapseMesh in bbblitz3d.cpp): the whole
 * node hierarchy is flattened into one mesh, children before their parent,
 * each node's vertices transformed by its world transform within the file
 * (the root node's own transform included).
 *
 * Difference from Blitz: MeshModel::add merges surfaces that share a brush;
 * here every source surface stays separate, so PickedSurface/PickedTriangle
 * identify (node surface, triangle) rather than Blitz's merged numbering.
 * Geometry and hit results are unaffected.
 */
export function b3dCollapsedSurfaces(model: B3dModel): ColliderSurface[] {
	const out: ColliderSurface[] = [];
	const visit = (node: B3dNode, parent: Transform | null) => {
		const local = b3dNodeTform(node);
		const world = parent ? parent.mul(local) : local;
		for (const c of node.children) visit(c, world);
		const mesh = node.mesh;
		if (!mesh) return;
		const src = mesh.positions;
		const positions = new Float32Array(mesh.vertexCount * 3);
		for (let i = 0; i < mesh.vertexCount; i++) {
			const v = world.mulVec(new Vector(src[i * 3], src[i * 3 + 1], src[i * 3 + 2]));
			positions[i * 3] = v.x;
			positions[i * 3 + 1] = v.y;
			positions[i * 3 + 2] = v.z;
		}
		for (const s of mesh.surfaces) out.push({ positions, indices: s.indices, surface: out.length });
	};
	if (model.root) visit(model.root, null);
	return out;
}

/** MeshCollider for a model loaded with LoadMesh. */
export function meshColliderFromB3d(model: B3dModel): MeshCollider {
	return MeshCollider.fromSurfaces(b3dCollapsedSurfaces(model));
}
