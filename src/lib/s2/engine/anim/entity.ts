import * as THREE from 'three';
import type { B3dMesh, B3dModel, B3dNode } from '../../formats/b3d';
import { blitzQuat } from '../blitzSpace';
import { defaultTextureHandle, type BlitzTexture, TextureHandle } from '../textures';
import { Animation } from './Animation';
import { Animator } from './Animator';
import { Brush, brushMaterial } from './brush';

/**
 * Blitz3D model entities on top of THREE.Object3D.
 *
 * An entity is a plain Object3D (Mesh, SkinnedMesh, Bone or Object3D) whose
 * position, quaternion and scale are the Blitz local transform. Everything
 * Blitz keeps on the entity besides that (brush, auto fade, animator, mesh
 * data) lives in a side table, never in userData, which Three deep-copies
 * through JSON.
 *
 * Sources: blitz3d/loader_b3d.cpp, meshloader.cpp, meshmodel.cpp, surface.cpp,
 * model.cpp, object.cpp, bbruntime/bbblitz3d.cpp.
 */

/** surface.h MAX_SURFACE_BONES */
export const MAX_SURFACE_BONES = 4;

/** Shared mesh data (MeshModel::Rep): one geometry with a group per surface. */
export interface MeshRep {
	geometry: THREE.BufferGeometry;
	/** Brush of each surface; index = material index of the geometry group. */
	surfaces: Brush[];
	/** Box around the vertices used by triangles (MeshModel::getBox). */
	box: THREE.Box3;
	hasColors: boolean;
	/** Skinned meshes: inverse bind transform per animator object (Rep::bone_tforms). */
	boneInverses?: THREE.Matrix4[];
}

interface EntityState {
	/** Model::brush, set by EntityColor, EntityAlpha, EntityTexture ... */
	brush: Brush;
	autoFade?: { near: number; far: number };
	rep?: MeshRep;
	animator?: Animator;
	/** Alpha (0..255) the current materials were made for; -1 none yet, -2 not drawn. */
	shownAlpha: number;
}

const states = new WeakMap<THREE.Object3D, EntityState>();

/** Material of surfaces that Blitz does not draw (alpha 0, or beyond the auto fade range). */
const HIDDEN = new THREE.MeshBasicMaterial({ visible: false });

function stateOf(e: THREE.Object3D): EntityState {
	let s = states.get(e);
	if (!s) {
		s = { brush: new Brush(), shownAlpha: -1 };
		states.set(e, s);
	}
	return s;
}

/** Rebuilds the materials of a mesh entity from its brush (MeshModel::render: Brush( surface, render_brush )). */
function applyBrush(e: THREE.Object3D, s: EntityState, alpha = s.brush.alpha): void {
	const mesh = e as THREE.Mesh;
	if (!s.rep || !mesh.isMesh) return;
	// Model::beginRender / doAutoFade: nothing is drawn at alpha <= 0.
	if (!(alpha > 0)) {
		if (s.shownAlpha !== -2) mesh.material = s.rep.surfaces.map(() => HIDDEN);
		s.shownAlpha = -2;
		return;
	}
	let b = s.brush;
	if (alpha !== b.alpha) {
		b = b.clone();
		b.alpha = alpha;
	}
	mesh.material = s.rep.surfaces.map((sb) => brushMaterial(Brush.combine(sb, b), s.rep!.hasColors));
	s.shownAlpha = Math.round(Math.min(1, alpha) * 255);
}

function brushChanged(e: THREE.Object3D, s: EntityState): void {
	s.shownAlpha = -1;
	applyBrush(e, s);
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

interface SkinData {
	/** MAX_SURFACE_BONES entries per vertex, 255 = unused (Surface::Vertex::bone_bones). */
	bones: Uint8Array;
	weights: Float32Array;
}

interface Part {
	mesh: B3dMesh;
	/** Baked into the vertices when given (LoadMesh collapse). */
	matrix?: THREE.Matrix4;
	skin?: SkinData;
}

interface SurfaceBuild {
	brush: Brush;
	/** Start of this surface's index range. */
	indices: number[];
}

/**
 * Builds surfaces the way MeshLoader::endMesh and MeshModel::add do: one
 * surface per brush, each with its own copy of the vertices it uses.
 * `brushOf(i)` maps a TRIS brush index (-1 = none) to a brush.
 */
function buildRep(parts: Part[], brushOf: (index: number) => Brush): MeshRep {
	const hasColors = parts.some((p) => !!p.mesh.colors);
	const hasUv1 = parts.some((p) => p.mesh.texCoords.length > 1);
	const hasSkin = parts.some((p) => !!p.skin);

	const pos: number[] = [];
	const nrm: number[] = [];
	const col: number[] = [];
	const uv0: number[] = [];
	const uv1: number[] = [];
	const skinIndex: number[] = [];
	const skinWeight: number[] = [];
	let vertexCount = 0;

	const surfaces = new Map<number, SurfaceBuild>();
	const tmp = new THREE.Vector3();
	const cof = new THREE.Matrix3();

	for (const part of parts) {
		const m = part.mesh;
		const size = m.texCoordSize;
		if (part.matrix) {
			// Matrix::cofactor = det * inverse transpose
			cof.getNormalMatrix(part.matrix).multiplyScalar(part.matrix.determinant());
		}
		// Triangles of this mesh by brush, in first-use order.
		const byBrush = new Map<number, Uint32Array[]>();
		for (const s of m.surfaces) {
			let list = byBrush.get(s.brush < 0 ? -1 : s.brush);
			if (!list) byBrush.set(s.brush < 0 ? -1 : s.brush, (list = []));
			list.push(s.indices);
		}
		for (const [brushIndex, lists] of byBrush) {
			let surf = surfaces.get(brushIndex);
			if (!surf) surfaces.set(brushIndex, (surf = { brush: brushOf(brushIndex), indices: [] }));
			const vertMap = new Map<number, number>();
			const first = vertexCount;
			const triStart = surf.indices.length;
			for (const indices of lists) {
				for (let i = 0; i + 2 < indices.length; i += 3) {
					for (let j = 0; j < 3; j++) {
						const n = indices[i + j];
						let id = vertMap.get(n);
						if (id === undefined) {
							if (n >= m.vertexCount) {
								throw new Error(`B3D triangle uses vertex ${n} of ${m.vertexCount}`);
							}
							id = vertexCount++;
							vertMap.set(n, id);
							pos.push(m.positions[n * 3], m.positions[n * 3 + 1], m.positions[n * 3 + 2]);
							if (m.normals) nrm.push(m.normals[n * 3], m.normals[n * 3 + 1], m.normals[n * 3 + 2]);
							else nrm.push(0, 0, 0);
							if (hasColors) {
								if (m.colors) {
									// readColor: clamped, then int(c*255)
									for (let k = 0; k < 4; k++) {
										const c = Math.min(1, Math.max(0, m.colors[n * 4 + k]));
										col.push(Math.trunc(c * 255) / 255);
									}
								} else col.push(1, 1, 1, 1);
							}
							// Only two components of the first two sets are kept (readVertices).
							const t0 = m.texCoords[0];
							const t1 = m.texCoords[1];
							uv0.push(t0 && size > 0 ? t0[n * size] : 0, t0 && size > 1 ? t0[n * size + 1] : 0);
							if (hasUv1) {
								uv1.push(t1 && size > 0 ? t1[n * size] : 0, t1 && size > 1 ? t1[n * size + 1] : 0);
							}
							if (hasSkin) pushSkin(part.skin, n, skinIndex, skinWeight);
						}
						surf.indices.push(id);
					}
				}
			}
			if (!m.normals) updateNormals(pos, nrm, surf.indices, triStart, first, vertexCount);
			if (part.matrix) {
				for (let v = first; v < vertexCount; v++) {
					tmp.set(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]).applyMatrix4(part.matrix);
					pos[v * 3] = tmp.x;
					pos[v * 3 + 1] = tmp.y;
					pos[v * 3 + 2] = tmp.z;
					// Left unnormalised by Blitz; Direct3D normalises when lighting.
					tmp.set(nrm[v * 3], nrm[v * 3 + 1], nrm[v * 3 + 2]).applyMatrix3(cof).normalize();
					nrm[v * 3] = tmp.x;
					nrm[v * 3 + 1] = tmp.y;
					nrm[v * 3 + 2] = tmp.z;
				}
			}
		}
	}

	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
	geometry.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
	geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv0, 2));
	if (hasUv1) geometry.setAttribute('uv1', new THREE.Float32BufferAttribute(uv1, 2));
	if (hasColors) geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
	if (hasSkin) {
		geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
		geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeight, 4));
	}

	const total = [...surfaces.values()].reduce((n, s) => n + s.indices.length, 0);
	const index = vertexCount > 65535 ? new Uint32Array(total) : new Uint16Array(total);
	const brushes: Brush[] = [];
	let off = 0;
	for (const s of surfaces.values()) {
		// Blitz front faces are clockwise; reversed here (blitzSpace.ts).
		for (let i = 0; i + 2 < s.indices.length; i += 3) {
			index[off + i] = s.indices[i];
			index[off + i + 1] = s.indices[i + 2];
			index[off + i + 2] = s.indices[i + 1];
		}
		geometry.addGroup(off, s.indices.length, brushes.length);
		brushes.push(s.brush);
		off += s.indices.length;
	}
	geometry.setIndex(new THREE.BufferAttribute(index, 1));

	const box = new THREE.Box3();
	for (let v = 0; v < vertexCount; v++) box.expandByPoint(tmp.set(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]));
	geometry.boundingBox = box.clone();
	geometry.boundingSphere = box.isEmpty() ? new THREE.Sphere() : box.getBoundingSphere(new THREE.Sphere());

	return { geometry, surfaces: brushes, box, hasColors };
}

/**
 * Surface::getMesh( bones ) vertex rules: no bone -> bone 0 (the mesh
 * itself); one bone -> that bone at full weight; otherwise up to four
 * weighted bones.
 */
function pushSkin(skin: SkinData | undefined, n: number, outIndex: number[], outWeight: number[]): void {
	const o = n * MAX_SURFACE_BONES;
	if (!skin || skin.bones[o] === 255) {
		outIndex.push(0, 0, 0, 0);
		outWeight.push(1, 0, 0, 0);
	} else if (skin.bones[o + 1] === 255) {
		outIndex.push(skin.bones[o], 0, 0, 0);
		outWeight.push(1, 0, 0, 0);
	} else {
		let k = 0;
		for (; k < MAX_SURFACE_BONES && skin.bones[o + k] !== 255; k++) {
			outIndex.push(skin.bones[o + k]);
			outWeight.push(skin.weights[o + k]);
		}
		for (; k < MAX_SURFACE_BONES; k++) {
			outIndex.push(0);
			outWeight.push(0);
		}
	}
}

const EPSILON = 0.000001;

/**
 * Surface::updateNormals for the vertices first..end and the triangles from
 * triStart on: unit face normals are summed per vertex position (vertices at
 * the same place share a normal, whatever their UVs) and normalised.
 * Indices are still in Blitz winding here.
 * Blitz matches positions within 1e-6 per axis; exact equality is used.
 */
function updateNormals(
	pos: number[],
	nrm: number[],
	indices: number[],
	triStart: number,
	first: number,
	end: number
): void {
	const sums = new Map<string, [number, number, number]>();
	const keyOf = (v: number) => `${pos[v * 3]},${pos[v * 3 + 1]},${pos[v * 3 + 2]}`;
	for (let i = triStart; i + 2 < indices.length; i += 3) {
		const a = indices[i] * 3;
		const b = indices[i + 1] * 3;
		const c = indices[i + 2] * 3;
		const ux = pos[b] - pos[a];
		const uy = pos[b + 1] - pos[a + 1];
		const uz = pos[b + 2] - pos[a + 2];
		const vx = pos[c] - pos[a];
		const vy = pos[c + 1] - pos[a + 1];
		const vz = pos[c + 2] - pos[a + 2];
		let nx = uy * vz - uz * vy;
		let ny = uz * vx - ux * vz;
		let nz = ux * vy - uy * vx;
		const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
		if (len <= EPSILON) continue;
		nx /= len;
		ny /= len;
		nz /= len;
		for (let j = 0; j < 3; j++) {
			const key = keyOf(indices[i + j]);
			const s = sums.get(key);
			if (s) {
				s[0] += nx;
				s[1] += ny;
				s[2] += nz;
			} else sums.set(key, [nx, ny, nz]);
		}
	}
	for (let v = first; v < end; v++) {
		const s = sums.get(keyOf(v));
		if (!s) continue;
		const len = Math.sqrt(s[0] * s[0] + s[1] * s[1] + s[2] * s[2]);
		if (!len) continue;
		nrm[v * 3] = s[0] / len;
		nrm[v * 3 + 1] = s[1] / len;
		nrm[v * 3 + 2] = s[2] / len;
	}
}

function localMatrix(n: B3dNode): THREE.Matrix4 {
	return new THREE.Matrix4().compose(
		new THREE.Vector3(...n.position),
		blitzQuat(n.rotation),
		new THREE.Vector3(...n.scale)
	);
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

/**
 * Brushes of a model file with resolved textures, in BRUS chunk order
 * (readTextures / readBrushes of loader_b3d.cpp). `images[i]` is the loaded
 * image of TEXS entry i, or undefined when it could not be loaded.
 */
export function modelBrushes(model: B3dModel, images: (BlitzTexture | undefined)[]): Brush[] {
	const handles = model.textures.map((t, i) => {
		const image = images[i];
		if (!image) return undefined;
		const h = new TextureHandle(image);
		h.blend = t.blend;
		if (t.flags & 0x10000) h.coords = 1;
		if (t.x !== 0 || t.y !== 0 || t.scaleX !== 1 || t.scaleY !== 1 || t.rotation !== 0) {
			h.setRaw(t.scaleX, t.scaleY, t.x, t.y, t.rotation);
		}
		return h;
	});
	return model.brushes.map((src) => {
		const b = new Brush();
		b.r = src.r;
		b.g = src.g;
		b.b = src.b;
		b.alpha = src.a;
		b.shininess = src.shininess;
		b.blend = src.blend;
		b.fx = src.fx;
		for (let k = 0; k < 8 && k < src.textures.length; k++) {
			const id = src.textures[k];
			if (id < 0) continue;
			b.setTexture(k, handles[id]);
		}
		return b;
	});
}

const DEFAULT_BRUSH = new Brush();

function brushLookup(brushes: Brush[]): (index: number) => Brush {
	return (i) => (i >= 0 ? (brushes[i] ?? DEFAULT_BRUSH) : DEFAULT_BRUSH);
}

/**
 * LoadMesh: the whole file collapsed into one mesh (bbLoadMesh, collapseMesh).
 * Every mesh node is transformed by its world transform within the file and
 * added surface by surface. The brush a MESH chunk names for the whole mesh
 * is dropped by this path in Blitz, as are bones and animation.
 */
export function buildCollapsedRep(model: B3dModel, brushes: Brush[]): MeshRep {
	const parts: Part[] = [];
	const walk = (n: B3dNode, parent: THREE.Matrix4 | undefined) => {
		const local = localMatrix(n);
		const world = parent ? parent.clone().multiply(local) : local;
		// collapseMesh handles the children first.
		for (const c of n.children) walk(c, world);
		if (n.mesh) parts.push({ mesh: n.mesh, matrix: world });
	};
	if (model.root) walk(model.root, undefined);
	return buildRep(parts, brushLookup(brushes));
}

/** Creates a mesh entity for shared mesh data. */
export function createMeshEntity(rep: MeshRep, brush?: Brush): THREE.Mesh {
	const mesh = new THREE.Mesh(rep.geometry);
	const s = stateOf(mesh);
	s.rep = rep;
	if (brush) s.brush = brush;
	applyBrush(mesh, s);
	return mesh;
}

interface PreparedNode {
	rep?: MeshRep;
	/** Animator objects of a boned mesh: the mesh node itself, then its bones. */
	skinBones?: B3dNode[];
	keys: Animation;
}

interface Prepared {
	nodes: Map<B3dNode, PreparedNode>;
}

const prepared = new WeakMap<B3dModel, Prepared>();

/**
 * The file-level part of LoadAnimMesh, done once per parsed model: bone
 * assignment (MeshLoader::addBone / endMesh), geometry and key tracks.
 */
function prepare(model: B3dModel, brushes: Brush[]): Prepared {
	let p = prepared.get(model);
	if (p) return p;
	p = { nodes: new Map() };
	const nodes = p.nodes;
	const lookup = brushLookup(brushes);

	// loader_b3d.cpp keeps one global list of bones; the next mesh node to be
	// completed takes all of them. Bone numbers are positions in that list + 1
	// (0 is the mesh), assigned to the vertices of the innermost open mesh.
	let bones: B3dNode[] = [];
	const meshStack: { node: B3dNode; skin: SkinData }[] = [];

	const addBone = (skin: SkinData, n: number, w: number, b: number) => {
		const o = n * MAX_SURFACE_BONES;
		let i = 0;
		for (; i < MAX_SURFACE_BONES; i++) {
			if (skin.bones[o + i] === 255 || w > skin.weights[o + i]) break;
		}
		if (i === MAX_SURFACE_BONES) return;
		for (let k = MAX_SURFACE_BONES - 1; k > i; k--) {
			skin.bones[o + k] = skin.bones[o + k - 1];
			skin.weights[o + k] = skin.weights[o + k - 1];
		}
		skin.bones[o + i] = b;
		skin.weights[o + i] = w;
	};

	const visit = (n: B3dNode) => {
		const keys = new Animation();
		for (const k of n.keys) {
			if (k.position) keys.setPositionKey(k.frame, k.position);
			if (k.scale) keys.setScaleKey(k.frame, k.scale);
			if (k.rotation) {
				const q = blitzQuat(k.rotation);
				keys.setRotationKey(k.frame, [q.x, q.y, q.z, q.w]);
			}
		}
		const info: PreparedNode = { keys };
		nodes.set(n, info);

		let skin: SkinData | undefined;
		if (n.mesh) {
			skin = {
				bones: new Uint8Array(n.mesh.vertexCount * MAX_SURFACE_BONES).fill(255),
				weights: new Float32Array(n.mesh.vertexCount * MAX_SURFACE_BONES)
			};
			meshStack.push({ node: n, skin });
		}
		if (n.bone) {
			bones.push(n);
			const open = meshStack[meshStack.length - 1];
			if (!open) throw new Error(`B3D bone "${n.name}" is outside any mesh`);
			const count = open.node.mesh!.vertexCount;
			for (let i = 0; i < n.bone.vertices.length; i++) {
				const v = n.bone.vertices[i];
				if (v >= count) throw new Error(`B3D bone "${n.name}" uses vertex ${v} of ${count}`);
				addBone(open.skin, v, n.bone.weights[i], bones.length);
			}
		}
		for (const c of n.children) visit(c);

		if (n.mesh && skin) {
			meshStack.pop();
			// MeshLoader::endMesh: weights of boned vertices are scaled to sum 1.
			for (let v = 0; v < n.mesh.vertexCount; v++) {
				const o = v * MAX_SURFACE_BONES;
				if (skin.bones[o] === 255) continue;
				let t = 0;
				for (let j = 0; j < MAX_SURFACE_BONES && skin.bones[o + j] !== 255; j++) t += skin.weights[o + j];
				t = 1 / t;
				for (let j = 0; j < MAX_SURFACE_BONES; j++) skin.weights[o + j] *= t;
			}
			if (bones.length) {
				info.skinBones = [n, ...bones];
				bones = [];
				info.rep = buildRep([{ mesh: n.mesh, skin }], lookup);
				// MeshModel::createBones runs before the mesh gets its parent: the
				// bind transforms are relative to the parent of the mesh node.
				const bind = new Map<B3dNode, THREE.Matrix4>();
				const walk = (c: B3dNode, parent: THREE.Matrix4 | undefined) => {
					const local = localMatrix(c);
					const world = parent ? parent.clone().multiply(local) : local;
					bind.set(c, world);
					for (const cc of c.children) walk(cc, world);
				};
				walk(n, undefined);
				info.rep.boneInverses = info.skinBones.map((b) => {
					const m = bind.get(b);
					if (!m) throw new Error(`B3D bone "${b.name}" is not below its mesh`);
					return m.clone().invert();
				});
			} else {
				info.rep = buildRep([{ mesh: n.mesh }], lookup);
			}
		}
	};
	if (model.root) visit(model.root);
	prepared.set(model, p);
	return p;
}

/**
 * LoadAnimMesh: the node hierarchy of the file as entities (readObject of
 * loader_b3d.cpp, then bbLoadAnimMesh). Each call gives a new, independent
 * entity; geometry is shared between calls with the same parsed model.
 *
 * - A node with a mesh and bones below it becomes a SkinnedMesh with its own
 *   Animator over [mesh, bones...]; its length is that node's ANIM length.
 * - Any other node with an ANIM length gets an Animator over its subtree
 *   (objects already claimed by a boned mesh take part without keys).
 * - The returned root is posed at frame 0 of sequence 0 if it has an animator.
 * - The brush a MESH chunk names for the whole mesh becomes the entity brush.
 */
export function createAnimMesh(model: B3dModel, brushes: Brush[]): THREE.Object3D {
	if (!model.root) return new THREE.Object3D();
	const prep = prepare(model, brushes);
	const objOf = new Map<B3dNode, THREE.Object3D>();
	const claimed = new Set<B3dNode>();

	const takeKeys = (n: B3dNode): Animation => {
		// obj->getAnimation() followed by obj->setAnimation( Animation() )
		if (claimed.has(n)) return new Animation();
		claimed.add(n);
		return prep.nodes.get(n)!.keys;
	};

	const read = (n: B3dNode): THREE.Object3D => {
		const info = prep.nodes.get(n)!;
		let obj: THREE.Object3D;
		if (info.rep) {
			obj = info.skinBones ? new THREE.SkinnedMesh(info.rep.geometry) : new THREE.Mesh(info.rep.geometry);
			const s = stateOf(obj);
			s.rep = info.rep;
			const mb = n.mesh!.brush;
			if (mb !== -1 && brushes[mb]) s.brush = brushes[mb].clone();
		} else if (n.bone) {
			obj = new THREE.Bone();
		} else {
			obj = new THREE.Object3D();
		}
		objOf.set(n, obj);
		obj.name = n.name;
		obj.position.set(...n.position);
		obj.scale.set(...n.scale);
		obj.quaternion.copy(blitzQuat(n.rotation));
		for (const c of n.children) obj.add(read(c));

		const frames = n.anim?.frames ?? 0;
		if (info.skinBones) {
			const objs = info.skinBones.map((b) => objOf.get(b)!);
			const animator = new Animator(objs, frames, info.skinBones.map(takeKeys));
			stateOf(obj).animator = animator;
			bindSkin(obj as THREE.SkinnedMesh, animator, info.rep!);
		} else if (frames) {
			// Animator::addObjs: the node and all its descendants, depth first.
			const list: B3dNode[] = [];
			const add = (c: B3dNode) => {
				list.push(c);
				for (const cc of c.children) add(cc);
			};
			add(n);
			stateOf(obj).animator = new Animator(
				list.map((c) => objOf.get(c)!),
				frames,
				list.map(takeKeys)
			);
		}
		const s = states.get(obj);
		if (s?.rep) applyBrush(obj, s);
		return obj;
	};

	const root = read(model.root);
	// bbLoadAnimMesh: anim->animate( 1,0,0,0 )
	states.get(root)?.animator?.animate(1, 0, 0, 0);
	return root;
}

/**
 * Boned rendering of MeshModel::render: vertex = bone world transform *
 * inverse bind transform * vertex, the bones being the animator's objects.
 */
function bindSkin(mesh: THREE.SkinnedMesh, animator: Animator, rep: MeshRep): void {
	const bones = animator.getObjects() as unknown as THREE.Bone[];
	const skeleton = new THREE.Skeleton(bones, rep.boneInverses!);
	// Attached mode with an identity bind matrix leaves exactly
	// boneWorld * boneInverse in world space.
	mesh.bind(skeleton, new THREE.Matrix4());
	// Blitz culls with the bind pose box; the pose can leave it, so do not cull.
	mesh.frustumCulled = false;
}

// ---------------------------------------------------------------------------
// Entity commands
// ---------------------------------------------------------------------------

/**
 * CopyEntity( entity,parent=0 ): Object::copy. The copy shares geometry and
 * has its own transforms, brush and, where the source has one, an Animator
 * with the same sequences in the reset state (sequence 0, not animating,
 * AnimLength 0 until Animate or SetAnimTime). The copy starts in the
 * source's current pose and is shown even if the source is hidden.
 */
export function copyEntity<T extends THREE.Object3D>(e: T, parent?: THREE.Object3D): T {
	const copies = new Map<THREE.Object3D, THREE.Object3D>();
	const copy = (src: THREE.Object3D): THREE.Object3D => {
		const s = states.get(src);
		let dst: THREE.Object3D;
		if ((src as THREE.SkinnedMesh).isSkinnedMesh) {
			const sm = src as THREE.SkinnedMesh;
			const d = new THREE.SkinnedMesh(sm.geometry, sm.material);
			d.name = src.name;
			d.position.copy(src.position);
			d.quaternion.copy(src.quaternion);
			d.scale.copy(src.scale);
			d.renderOrder = src.renderOrder;
			dst = d;
		} else {
			dst = src.clone(false);
		}
		const mesh = dst as THREE.Mesh;
		if (mesh.isMesh && Array.isArray(mesh.material)) mesh.material = mesh.material.slice();
		dst.visible = true; // bbCopyEntity: insertEntity shows and enables the whole copy
		copies.set(src, dst);
		for (const c of src.children) dst.add(copy(c));
		if (s) {
			const d: EntityState = {
				brush: s.brush.clone(),
				autoFade: s.autoFade && { ...s.autoFade },
				rep: s.rep,
				shownAlpha: s.shownAlpha
			};
			if (s.animator) {
				d.animator = Animator.copy(
					s.animator,
					s.animator.getObjects().map((o) => copies.get(o as THREE.Object3D) ?? o)
				);
				if ((dst as THREE.SkinnedMesh).isSkinnedMesh && s.rep?.boneInverses) {
					bindSkin(dst as THREE.SkinnedMesh, d.animator, s.rep);
				}
			}
			states.set(dst, d);
		}
		return dst;
	};
	const out = copy(e);
	parent?.add(out);
	return out as T;
}

/** EntityColor entity,red,green,blue (0..255). Replaces the entity brush colour. */
export function entityColor(e: THREE.Object3D, r: number, g: number, b: number): void {
	const s = stateOf(e);
	s.brush.r = r / 255;
	s.brush.g = g / 255;
	s.brush.b = b / 255;
	brushChanged(e, s);
}

/** EntityAlpha entity,alpha */
export function entityAlpha(e: THREE.Object3D, alpha: number): void {
	const s = stateOf(e);
	s.brush.alpha = alpha;
	brushChanged(e, s);
}

/** EntityShininess entity,shininess */
export function entityShininess(e: THREE.Object3D, shininess: number): void {
	const s = stateOf(e);
	s.brush.shininess = shininess;
	brushChanged(e, s);
}

/**
 * EntityTexture entity,texture,frame=0,index=0. Takes a texture handle, or an
 * image, which stands for a handle with default blend and transform.
 * A later TextureBlend or TextureCoords on the handle shows after the next
 * brush change of the entity; ScaleTexture, PositionTexture and RotateTexture
 * show at once.
 */
export function entityTexture(e: THREE.Object3D, texture: TextureHandle | BlitzTexture, index = 0): void {
	const s = stateOf(e);
	s.brush.setTexture(index, texture instanceof TextureHandle ? texture : defaultTextureHandle(texture));
	brushChanged(e, s);
}

/** EntityBlend entity,blend (1 alpha, 2 multiply, 3 add) */
export function entityBlend(e: THREE.Object3D, blend: number): void {
	const s = stateOf(e);
	s.brush.blend = blend;
	brushChanged(e, s);
}

/** EntityFX entity,fx */
export function entityFX(e: THREE.Object3D, fx: number): void {
	const s = stateOf(e);
	s.brush.fx = fx;
	brushChanged(e, s);
}

/** PaintEntity entity,brush */
export function paintEntity(e: THREE.Object3D, brush: Brush): void {
	const s = stateOf(e);
	s.brush = brush.clone();
	brushChanged(e, s);
}

/** The entity brush (Model::getBrush). Call refreshEntity after changing it in place. */
export function entityBrush(e: THREE.Object3D): Brush {
	return stateOf(e).brush;
}

/** Rebuilds the materials of an entity after its brush or a texture's blend/coords changed. */
export function refreshEntity(e: THREE.Object3D): void {
	brushChanged(e, stateOf(e));
}

/**
 * EntityAutoFade entity,near#,far#. Takes effect in updateAutoFade, which
 * has to run before each render.
 */
export function entityAutoFade(e: THREE.Object3D, near: number, far: number): void {
	stateOf(e).autoFade = { near, far };
}

/** FindChild( entity,name$ ): depth-first, and the entity itself is tested first. */
export function findChild(e: THREE.Object3D, name: string): THREE.Object3D | undefined {
	if (e.name === name) return e;
	for (const c of e.children) {
		const q = findChild(c, name);
		if (q) return q;
	}
	return undefined;
}

/** CountChildren( entity ) */
export function countChildren(e: THREE.Object3D): number {
	return e.children.length;
}

/** GetChild( entity,index ): index counts from 1. */
export function getChild(e: THREE.Object3D, index: number): THREE.Object3D | undefined {
	// Entity *p=e->children(); while( --index && p ) p=p->successor();
	let i = 0;
	let p: THREE.Object3D | undefined = e.children[0];
	while (--index && p) p = e.children[++i];
	return p;
}

/** The shared mesh data of a mesh entity. */
export function meshRep(e: THREE.Object3D): MeshRep | undefined {
	return states.get(e)?.rep;
}

/**
 * Gives a mesh entity other mesh data (its mesh was edited: AddVertex,
 * ScaleMesh, PaintSurface ...) and rebuilds its materials.
 */
export function setMeshRep(e: THREE.Object3D, rep: MeshRep): void {
	const s = stateOf(e);
	s.rep = rep;
	(e as THREE.Mesh).geometry = rep.geometry;
	brushChanged(e, s);
}

/** Replaces the entity brush object without copying it (used when a copy is given its own state). */
export function setEntityBrush(e: THREE.Object3D, brush: Brush): void {
	const s = stateOf(e);
	s.brush = brush;
	brushChanged(e, s);
}

/** The EntityAutoFade range of an entity, if one was set. */
export function entityAutoFadeRange(e: THREE.Object3D): { near: number; far: number } | undefined {
	return states.get(e)?.autoFade;
}

/** MeshWidth#( mesh ): extent of the entity's own mesh in mesh space, unscaled. */
export function meshWidth(e: THREE.Object3D): number {
	const box = states.get(e)?.rep?.box;
	return box && !box.isEmpty() ? box.max.x - box.min.x : 0;
}

/** MeshHeight#( mesh ) */
export function meshHeight(e: THREE.Object3D): number {
	const box = states.get(e)?.rep?.box;
	return box && !box.isEmpty() ? box.max.y - box.min.y : 0;
}

/** MeshDepth#( mesh ) */
export function meshDepth(e: THREE.Object3D): number {
	const box = states.get(e)?.rep?.box;
	return box && !box.isEmpty() ? box.max.z - box.min.z : 0;
}

// ---------------------------------------------------------------------------
// Animation commands (bbruntime/bbblitz3d.cpp). Each acts on the animator of
// the given entity only, as in Blitz; entities without one are ignored.
// ---------------------------------------------------------------------------

/** The Animator of an entity, if it has one. */
export function getAnimator(e: THREE.Object3D): Animator | undefined {
	return states.get(e)?.animator;
}

/** Animate entity,mode=1,speed#=1,sequence=0,transition#=0 */
export function animate(e: THREE.Object3D, mode = 1, speed = 1, seq = 0, trans = 0): void {
	states.get(e)?.animator?.animate(mode, speed, seq, trans);
}

/** ExtractAnimSeq( entity,first_frame,last_frame,anim_seq=0 ): the new sequence index, -1 without animation. */
export function extractAnimSeq(e: THREE.Object3D, first: number, last: number, seq = 0): number {
	const a = states.get(e)?.animator;
	return a ? a.extractSeq(first, last, seq) : -1;
}

/** AddAnimSeq( entity,length ) */
export function addAnimSeq(e: THREE.Object3D, length: number): number {
	const s = stateOf(e);
	if (s.animator) return s.animator.addSeq(length);
	// Animator( Object *tree,int frames )
	const objs: THREE.Object3D[] = [];
	const add = (o: THREE.Object3D) => {
		objs.push(o);
		for (const c of o.children) add(c);
	};
	add(e);
	s.animator = new Animator(objs, length, []);
	return 0;
}

/** SetAnimTime entity,time#,anim_seq=0 */
export function setAnimTime(e: THREE.Object3D, time: number, seq = 0): void {
	states.get(e)?.animator?.setAnimTime(time, seq);
}

/** AnimSeq( entity ), -1 without animation */
export function animSeq(e: THREE.Object3D): number {
	return states.get(e)?.animator?.animSeq() ?? -1;
}

/** AnimTime#( entity ), -1 without animation */
export function animTime(e: THREE.Object3D): number {
	return states.get(e)?.animator?.animTime() ?? -1;
}

/** AnimLength( entity ), -1 without animation */
export function animLength(e: THREE.Object3D): number {
	return states.get(e)?.animator?.animLen() ?? -1;
}

/** Animating( entity ) */
export function animating(e: THREE.Object3D): boolean {
	return states.get(e)?.animator?.animating() ?? false;
}

/**
 * The animation part of UpdateWorld elapsed#=1: advances the animators of
 * `root` and everything below it. Hidden entities and their children are
 * skipped, as World::update only visits enabled objects.
 */
export function updateWorld(root: THREE.Object3D, elapsed = 1): void {
	if (!root.visible) return;
	states.get(root)?.animator?.update(elapsed);
	const children = root.children;
	for (let i = 0; i < children.length; i++) updateWorld(children[i], elapsed);
}

const worldPos = new THREE.Vector3();

/**
 * Model::doAutoFade for `root` and everything below it, to be called before
 * each render with the camera position in world space: an entity with
 * EntityAutoFade keeps its alpha up to `near`, fades linearly and is not
 * drawn from `far` on.
 */
export function updateAutoFade(root: THREE.Object3D, eye: THREE.Vector3): void {
	if (!root.visible) return;
	autoFadeEntity(root, eye);
	const children = root.children;
	for (let i = 0; i < children.length; i++) updateAutoFade(children[i], eye);
}

/**
 * Model::doAutoFade for one entity (not its children). `origin` is the
 * entity's world position when the caller already has it.
 */
export function autoFadeEntity(e: THREE.Object3D, eye: THREE.Vector3, origin?: THREE.Vector3): void {
	const s = states.get(e);
	if (s?.autoFade && s.rep) {
		let alpha = s.brush.alpha;
		const d = eye.distanceTo(origin ?? e.getWorldPosition(worldPos));
		if (d >= s.autoFade.far) alpha = 0;
		else if (d >= s.autoFade.near) {
			alpha *= 1 - (d - s.autoFade.near) / (s.autoFade.far - s.autoFade.near);
		}
		const shown = alpha > 0 ? Math.round(Math.min(1, alpha) * 255) : -2;
		if (shown !== s.shownAlpha) applyBrush(e, s, alpha);
	}
}
