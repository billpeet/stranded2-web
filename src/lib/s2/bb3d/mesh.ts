/**
 * Mesh data for bb3d: blitz3d/surface.cpp (Surface), blitz3d/meshmodel.cpp
 * (MeshModel::Rep: surfaces, transform, flip, add, box, collider) and
 * blitz3d/meshutil.cpp (the CreateCube/Sphere/Cylinder/Cone primitives).
 *
 * A `MeshModel` is what Blitz's MeshModel::Rep is: the mesh data that
 * CopyEntity copies SHARE. It exists in one of two states:
 *  - packed: straight from the model loader, as a `MeshRep` (one THREE
 *    geometry with a group per surface) that is shared with every other
 *    LoadMesh of the same file;
 *  - unpacked: a list of editable `Surface`s, created on the first command
 *    that needs surface access (GetSurface, AddVertex, ScaleMesh ...). The
 *    render geometry and the collider are then rebuilt lazily after edits.
 */
import * as THREE from 'three';
import { BLEND_REPLACE, Brush } from '../engine/anim/brush';
import type { MeshRep } from '../engine/anim/entity';
import type { Collider, Collision } from '../engine/collision/collision';
import {
	Box,
	EPSILON,
	HALFPI,
	PI,
	TWOPI,
	Transform,
	Vector,
	rotationMatrix,
	yawMatrix,
	type Line
} from '../engine/collision/geom';
import { MeshCollider } from '../engine/collision/meshCollider';
import { meshColliderFromGeometry } from '../engine/collision/three';

const fr = Math.fround;

/**
 * Brush::operator< compares the render states; two brushes are "the same"
 * for FindSurface / AddMesh when neither is less than the other.
 */
export function brushEquals(a: Brush, b: Brush): boolean {
	if (a.r !== b.r || a.g !== b.g || a.b !== b.b || a.alpha !== b.alpha) return false;
	if (a.shininess !== b.shininess || a.fx !== b.fx) return false;
	if (a.getBlend() !== b.getBlend()) return false;
	const n = Math.max(a.maxTex(), b.maxTex());
	for (let k = 0; k < n; k++) {
		const ta = a.texs[k];
		const tb = b.texs[k];
		if (ta === tb) continue;
		if (!ta || !tb) return false;
		if (ta.image !== tb.image || ta.blend !== tb.blend || ta.coords !== tb.coords) return false;
		if (ta.sx !== tb.sx || ta.sy !== tb.sy || ta.tx !== tb.tx || ta.ty !== tb.ty || ta.rot !== tb.rot) return false;
	}
	return true;
}

/** A Blitz surface: vertices and triangles with one brush. The handle GetSurface/CreateSurface return. */
export class Surface {
	/** xyz per vertex */
	coords: number[] = [];
	normals: number[] = [];
	/** ARGB per vertex (Surface::Vertex::color), 0xffffffff by default */
	colors: number[] = [];
	/** uv per vertex, coordinate set 0 and 1 */
	uv0: number[] = [];
	uv1: number[] = [];
	/** Three vertex indices per triangle, Blitz winding (clockwise fronts). */
	tris: number[] = [];
	/** Bone data of a boned mesh, carried through edits (4 per vertex). */
	skinIndex?: number[];
	skinWeight?: number[];
	brush = new Brush();
	name = '';

	constructor(readonly mesh: MeshModel) {}

	numVertices(): number {
		return this.colors.length;
	}
	numTriangles(): number {
		return this.tris.length / 3;
	}

	/** Surface::setBrush */
	setBrush(b: Brush): void {
		this.brush = b.clone();
		this.mesh.brushChanged();
	}

	/** Surface::addVertex with the Vertex() defaults: no normal, white, no bones. */
	addVertex(x: number, y: number, z: number, u = 0, v = 0, nx = 0, ny = 0, nz = 0): number {
		this.coords.push(fr(x), fr(y), fr(z));
		this.normals.push(fr(nx), fr(ny), fr(nz));
		this.colors.push(0xffffffff);
		this.uv0.push(fr(u), fr(v));
		this.uv1.push(fr(u), fr(v));
		if (this.skinIndex) {
			this.skinIndex.push(0, 0, 0, 0);
			this.skinWeight!.push(1, 0, 0, 0);
		}
		this.mesh.geomChanged();
		return this.numVertices() - 1;
	}

	/** Surface::addTriangle. Triangle::verts are unsigned shorts. */
	addTriangle(v0: number, v1: number, v2: number): number {
		this.tris.push(v0 & 0xffff, v1 & 0xffff, v2 & 0xffff);
		this.mesh.geomChanged();
		return this.numTriangles() - 1;
	}

	/** Surface::clear */
	clear(verts: boolean, tris: boolean): void {
		if (verts) {
			this.coords = [];
			this.normals = [];
			this.colors = [];
			this.uv0 = [];
			this.uv1 = [];
			if (this.skinIndex) {
				this.skinIndex = [];
				this.skinWeight = [];
			}
		}
		if (tris) this.tris = [];
		this.mesh.geomChanged();
	}

	/** Surface::setCoords (counts as a geometry change) */
	setCoords(n: number, x: number, y: number, z: number): void {
		this.coords[n * 3] = fr(x);
		this.coords[n * 3 + 1] = fr(y);
		this.coords[n * 3 + 2] = fr(z);
		this.mesh.geomChanged();
	}

	/** Surface::setNormal (NOT a geometry change in Blitz: UpdateNormals will not redo its work after it) */
	setNormal(n: number, x: number, y: number, z: number): void {
		this.normals[n * 3] = fr(x);
		this.normals[n * 3 + 1] = fr(y);
		this.normals[n * 3 + 2] = fr(z);
		this.mesh.attributesChanged();
	}

	/** Surface::setColor( n,argb ) */
	setColor(n: number, argb: number): void {
		this.colors[n] = argb >>> 0;
		this.mesh.attributesChanged();
	}

	/** Surface::setTexCoords */
	setTexCoords(n: number, u: number, v: number, set: number): void {
		const t = set ? this.uv1 : this.uv0;
		t[n * 2] = fr(u);
		t[n * 2 + 1] = fr(v);
		this.mesh.attributesChanged();
	}

	/**
	 * Surface::updateNormals: unit face normals summed per vertex POSITION
	 * (vertices at the same place share a normal) and normalised.
	 * Blitz leaves NaN normals on vertices no valid triangle uses (a zero
	 * vector normalised); they are left at zero here.
	 */
	updateNormals(): void {
		const c = this.coords;
		const sums = new Map<string, [number, number, number]>();
		const keyOf = (v: number) => `${c[v * 3]},${c[v * 3 + 1]},${c[v * 3 + 2]}`;
		const t = this.tris;
		for (let i = 0; i + 2 < t.length; i += 3) {
			const a = t[i] * 3;
			const b = t[i + 1] * 3;
			const d = t[i + 2] * 3;
			const ux = c[b] - c[a];
			const uy = c[b + 1] - c[a + 1];
			const uz = c[b + 2] - c[a + 2];
			const vx = c[d] - c[a];
			const vy = c[d + 1] - c[a + 1];
			const vz = c[d + 2] - c[a + 2];
			let nx = uy * vz - uz * vy;
			let ny = uz * vx - ux * vz;
			let nz = ux * vy - uy * vx;
			const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
			if (!(len > EPSILON)) continue;
			nx /= len;
			ny /= len;
			nz /= len;
			for (let j = 0; j < 3; j++) {
				const key = keyOf(t[i + j]);
				const s = sums.get(key);
				if (s) {
					s[0] += nx;
					s[1] += ny;
					s[2] += nz;
				} else sums.set(key, [nx, ny, nz]);
			}
		}
		const n = this.numVertices();
		for (let v = 0; v < n; v++) {
			const s = sums.get(keyOf(v));
			let x = 0,
				y = 0,
				z = 0;
			if (s) {
				const len = Math.sqrt(s[0] * s[0] + s[1] * s[1] + s[2] * s[2]);
				if (len) {
					x = s[0] / len;
					y = s[1] / len;
					z = s[2] / len;
				}
			}
			this.normals[v * 3] = fr(x);
			this.normals[v * 3 + 1] = fr(y);
			this.normals[v * 3 + 2] = fr(z);
		}
		this.mesh.attributesChanged();
	}
}

const colliders = new WeakMap<THREE.BufferGeometry, MeshCollider>();

function emptyRep(): MeshRep {
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
	geometry.setAttribute('normal', new THREE.Float32BufferAttribute([], 3));
	geometry.setAttribute('uv', new THREE.Float32BufferAttribute([], 2));
	geometry.setAttribute('uv1', new THREE.Float32BufferAttribute([], 2));
	geometry.setIndex([]);
	geometry.boundingBox = new THREE.Box3();
	geometry.boundingSphere = new THREE.Sphere();
	return { geometry, surfaces: [], box: new THREE.Box3(), hasColors: false };
}

export class MeshModel implements Collider {
	private _surfaces: Surface[] | null;
	private _rep: MeshRep;
	/** True when `_rep` was built here (and may be updated in place / disposed). */
	private ownsRep = false;
	private repDirty = false;
	private boneInverses?: THREE.Matrix4[];

	/** Surface::Monitor */
	geomChanges = 0;
	brushChanges = 0;
	private collider: MeshCollider | null = null;
	private collValid = -1;
	private box = new Box();
	private boxValid = -1;
	private normsValid = -1;

	/** The entities that render this mesh (CopyEntity copies share it). Opaque to this module. */
	readonly users = new Set<object>();
	/** Called on every change that needs the render geometry or materials rebuilt. */
	onDirty: ((m: MeshModel) => void) | null = null;

	/** A new empty mesh (CreateMesh), or one wrapping loader output. */
	constructor(rep?: MeshRep) {
		if (rep) {
			this._rep = rep;
			this._surfaces = null;
			this.boneInverses = rep.boneInverses;
		} else {
			this._rep = emptyRep();
			this.ownsRep = true;
			this._surfaces = [];
		}
	}

	/** True until a command needed surface access. */
	get packed(): boolean {
		return this._surfaces === null;
	}

	geomChanged(): void {
		++this.geomChanges;
		this.markDirty();
	}
	/** Normals, colours, texture coordinates: no change of geom_changes in Blitz. */
	attributesChanged(): void {
		this.markDirty();
	}
	brushChanged(): void {
		++this.brushChanges;
		this.markDirty();
	}
	private markDirty(): void {
		if (this.repDirty) return;
		this.repDirty = true;
		this.onDirty?.(this);
	}

	/** MeshModel::getSurfaces (unpacks loader data on first use). */
	get surfaces(): Surface[] {
		if (!this._surfaces) this._surfaces = this.unpack();
		return this._surfaces;
	}

	/** CountSurfaces without unpacking. */
	countSurfaces(): number {
		return this._surfaces ? this._surfaces.length : this._rep.surfaces.length;
	}

	private unpack(): Surface[] {
		const rep = this._rep;
		const geo = rep.geometry;
		const pos = geo.getAttribute('position');
		const nrm = geo.getAttribute('normal');
		const uv = geo.getAttribute('uv');
		const uv1 = geo.getAttribute('uv1');
		const col = geo.getAttribute('color');
		const si = geo.getAttribute('skinIndex');
		const sw = geo.getAttribute('skinWeight');
		const index = geo.getIndex();
		const out: Surface[] = [];
		for (let g = 0; g < rep.surfaces.length; g++) {
			const group = geo.groups.find((q) => q.materialIndex === g);
			const s = new Surface(this);
			s.brush = rep.surfaces[g].clone();
			out.push(s);
			if (!group || !index) continue;
			// The vertices a surface uses, in ascending order: the order the loader added them in.
			const used = new Set<number>();
			for (let i = 0; i < group.count; i++) used.add(index.getX(group.start + i));
			const ids = [...used].sort((a, b) => a - b);
			const map = new Map<number, number>();
			if (si) {
				s.skinIndex = [];
				s.skinWeight = [];
			}
			ids.forEach((id, k) => {
				map.set(id, k);
				s.coords.push(pos.getX(id), pos.getY(id), pos.getZ(id));
				if (nrm) s.normals.push(nrm.getX(id), nrm.getY(id), nrm.getZ(id));
				else s.normals.push(0, 0, 0);
				if (col) {
					const r = Math.round(col.getX(id) * 255);
					const gg = Math.round(col.getY(id) * 255);
					const b = Math.round(col.getZ(id) * 255);
					const a = Math.round(col.getW(id) * 255);
					s.colors.push(((a << 24) | (r << 16) | (gg << 8) | b) >>> 0);
				} else s.colors.push(0xffffffff);
				const u = uv ? uv.getX(id) : 0;
				const v = uv ? uv.getY(id) : 0;
				s.uv0.push(u, v);
				if (uv1) s.uv1.push(uv1.getX(id), uv1.getY(id));
				else s.uv1.push(u, v);
				if (si && sw) {
					s.skinIndex!.push(si.getX(id), si.getY(id), si.getZ(id), si.getW(id));
					s.skinWeight!.push(sw.getX(id), sw.getY(id), sw.getZ(id), sw.getW(id));
				}
			});
			// The geometry index is in Three winding; back to Blitz winding.
			for (let i = 0; i + 2 < group.count; i += 3) {
				const o = group.start + i;
				s.tris.push(map.get(index.getX(o))!, map.get(index.getX(o + 2))!, map.get(index.getX(o + 1))!);
			}
		}
		return out;
	}

	/** The render data, rebuilt first when the mesh was edited. */
	getRep(): MeshRep {
		if (this.repDirty) this.rebuild();
		return this._rep;
	}

	/** True when getRep() would return something new or changed. */
	get dirty(): boolean {
		return this.repDirty;
	}

	private rebuild(): void {
		this.repDirty = false;
		const surfaces = this._surfaces;
		if (!surfaces) return;
		let nv = 0;
		let ni = 0;
		let hasColors = false;
		let hasSkin = false;
		for (const s of surfaces) {
			nv += s.numVertices();
			ni += s.tris.length;
			if (s.skinIndex) hasSkin = true;
			if (!hasColors) {
				const c = s.colors;
				for (let i = 0; i < c.length; i++) {
					if (c[i] !== 0xffffffff) {
						hasColors = true;
						break;
					}
				}
			}
		}

		const old = this._rep;
		const og = old.geometry;
		// Same layout as before (vertex animation, FlipMesh, repainting): refill the buffers in place.
		const reuse =
			this.ownsRep &&
			og.getAttribute('position').count === nv &&
			(og.getIndex()?.count ?? -1) === ni &&
			!!og.getAttribute('uv1') &&
			!!og.getAttribute('color') === hasColors &&
			!!og.getAttribute('skinIndex') === hasSkin &&
			og.groups.length === surfaces.length &&
			surfaces.every((s, k) => og.groups[k].count === s.tris.length && og.groups[k].materialIndex === k);

		const geometry = reuse ? og : new THREE.BufferGeometry();
		const attr = (name: string, size: number): Float32Array => {
			if (reuse) {
				const a = geometry.getAttribute(name) as THREE.BufferAttribute;
				a.needsUpdate = true;
				return a.array as Float32Array;
			}
			const arr = new Float32Array(nv * size);
			geometry.setAttribute(name, new THREE.BufferAttribute(arr, size));
			return arr;
		};
		const pos = attr('position', 3);
		const nrm = attr('normal', 3);
		const uv0 = attr('uv', 2);
		const uv1 = attr('uv1', 2);
		const col = hasColors ? attr('color', 4) : null;
		let skinIndex: Uint16Array | null = null;
		let skinWeight: Float32Array | null = null;
		if (hasSkin) {
			if (reuse) {
				skinIndex = geometry.getAttribute('skinIndex').array as Uint16Array;
				skinWeight = geometry.getAttribute('skinWeight').array as Float32Array;
			} else {
				skinIndex = new Uint16Array(nv * 4);
				skinWeight = new Float32Array(nv * 4);
				geometry.setAttribute('skinIndex', new THREE.BufferAttribute(skinIndex, 4));
				geometry.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
			}
		}
		let index: Uint16Array | Uint32Array;
		if (reuse) index = geometry.getIndex()!.array as Uint16Array | Uint32Array;
		else {
			index = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
			geometry.setIndex(new THREE.BufferAttribute(index, 1));
		}

		const box = new THREE.Box3();
		const p = new THREE.Vector3();
		let vo = 0;
		let io = 0;
		surfaces.forEach((s, k) => {
			const n = s.numVertices();
			pos.set(s.coords, vo * 3);
			nrm.set(s.normals, vo * 3);
			uv0.set(s.uv0, vo * 2);
			uv1.set(s.uv1, vo * 2);
			if (col) {
				for (let i = 0; i < n; i++) {
					const c = s.colors[i];
					const o = (vo + i) * 4;
					col[o] = ((c >>> 16) & 255) / 255;
					col[o + 1] = ((c >>> 8) & 255) / 255;
					col[o + 2] = (c & 255) / 255;
					col[o + 3] = (c >>> 24) / 255;
				}
			}
			if (skinIndex && skinWeight) {
				geometry.getAttribute('skinIndex').needsUpdate = true;
				geometry.getAttribute('skinWeight').needsUpdate = true;
				if (s.skinIndex && s.skinWeight) {
					skinIndex.set(s.skinIndex, vo * 4);
					skinWeight.set(s.skinWeight, vo * 4);
				} else {
					for (let i = 0; i < n; i++) skinWeight[(vo + i) * 4] = 1;
				}
			}
			for (let i = 0; i < n; i++) box.expandByPoint(p.set(s.coords[i * 3], s.coords[i * 3 + 1], s.coords[i * 3 + 2]));
			// Blitz front faces are clockwise; reversed here (engine/blitzSpace.ts).
			const t = s.tris;
			for (let i = 0; i + 2 < t.length; i += 3) {
				index[io + i] = t[i] + vo;
				index[io + i + 1] = t[i + 2] + vo;
				index[io + i + 2] = t[i + 1] + vo;
			}
			if (!reuse) geometry.addGroup(io, t.length, k);
			vo += n;
			io += t.length;
		});
		if (reuse) geometry.getIndex()!.needsUpdate = true;
		geometry.boundingBox = box.clone();
		geometry.boundingSphere = box.isEmpty() ? new THREE.Sphere() : box.getBoundingSphere(new THREE.Sphere());

		if (!reuse && this.ownsRep) og.dispose();
		this.ownsRep = true;
		this._rep = {
			geometry,
			surfaces: surfaces.map((s) => s.brush),
			box,
			hasColors,
			boneInverses: this.boneInverses
		};
	}

	/** Frees GPU data this mesh owns (when its last entity is freed). */
	dispose(): void {
		if (this.ownsRep) this._rep.geometry.dispose();
	}

	// ------------------------------------------------------------- MeshModel::Rep

	/** Rep::createSurface */
	createSurface(b: Brush): Surface {
		const s = new Surface(this);
		this.surfaces.push(s);
		s.brush = b.clone();
		this.brushChanged();
		return s;
	}

	/** Rep::findSurface */
	findSurface(b: Brush): Surface | null {
		for (const s of this.surfaces) if (brushEquals(s.brush, b)) return s;
		return null;
	}

	/** Rep::paint (PaintMesh) */
	paint(b: Brush): void {
		for (const s of this.surfaces) s.brush = b.clone();
		this.brushChanged();
	}

	/**
	 * Rep::add (AddMesh, CopyMesh): surfaces of `t` are appended to the surface
	 * of this mesh with the same brush, or to a new one.
	 */
	add(t: MeshModel): void {
		for (const src of t.surfaces) {
			let dest = this.findSurface(src.brush);
			if (!dest) dest = this.createSurface(src.brush);
			const base = dest.numVertices();
			for (let j = 0; j < src.tris.length; j++) dest.tris.push((src.tris[j] + base) & 0xffff);
			for (let j = 0; j < src.coords.length; j++) dest.coords.push(src.coords[j]);
			for (let j = 0; j < src.normals.length; j++) dest.normals.push(src.normals[j]);
			for (let j = 0; j < src.colors.length; j++) dest.colors.push(src.colors[j]);
			for (let j = 0; j < src.uv0.length; j++) dest.uv0.push(src.uv0[j]);
			for (let j = 0; j < src.uv1.length; j++) dest.uv1.push(src.uv1[j]);
			if (dest.skinIndex) {
				for (let j = 0; j < src.numVertices(); j++) {
					dest.skinIndex.push(0, 0, 0, 0);
					dest.skinWeight!.push(1, 0, 0, 0);
				}
			}
		}
		this.geomChanged();
	}

	/** Rep::transform (ScaleMesh, RotateMesh, PositionMesh): normals go through the cofactor matrix, unnormalised. */
	transform(t: Transform): void {
		const co = t.m.cofactor();
		for (const s of this.surfaces) {
			const n = s.numVertices();
			for (let j = 0; j < n; j++) {
				const v = t.mulVec(new Vector(s.coords[j * 3], s.coords[j * 3 + 1], s.coords[j * 3 + 2]));
				const q = co.mulVec(new Vector(s.normals[j * 3], s.normals[j * 3 + 1], s.normals[j * 3 + 2]));
				s.coords[j * 3] = fr(v.x);
				s.coords[j * 3 + 1] = fr(v.y);
				s.coords[j * 3 + 2] = fr(v.z);
				s.normals[j * 3] = fr(q.x);
				s.normals[j * 3 + 1] = fr(q.y);
				s.normals[j * 3 + 2] = fr(q.z);
			}
		}
		this.geomChanged();
	}

	/** Rep::flip (FlipMesh): normals negated, triangles reversed. */
	flip(): void {
		for (const s of this.surfaces) {
			for (let j = 0; j < s.normals.length; j++) s.normals[j] = -s.normals[j];
			for (let j = 0; j + 2 < s.tris.length; j += 3) {
				const t = s.tris[j + 1];
				s.tris[j + 1] = s.tris[j + 2];
				s.tris[j + 2] = t;
			}
		}
		this.geomChanged();
	}

	/** Rep::updateNormals: only when the geometry changed since the last UpdateNormals. */
	updateNormals(): void {
		if (this.normsValid !== this.geomChanges) {
			for (const s of this.surfaces) s.updateNormals();
			this.normsValid = this.geomChanges;
		}
	}

	/** Rep::getBox: bounds of all surface vertices; a cleared (inverted) box for an empty mesh. */
	getBox(): Box {
		if (this.boxValid !== this.geomChanges) {
			const box = new Box();
			if (!this._surfaces) {
				const b = this._rep.box;
				if (!b.isEmpty()) {
					box.update(new Vector(b.min.x, b.min.y, b.min.z));
					box.update(new Vector(b.max.x, b.max.y, b.max.z));
				}
			} else {
				for (const s of this._surfaces) {
					const c = s.coords;
					for (let j = 0; j + 2 < c.length; j += 3) box.update(new Vector(c[j], c[j + 1], c[j + 2]));
				}
			}
			this.box = box;
			this.boxValid = this.geomChanges;
		}
		return this.box;
	}

	/**
	 * Rep::getCollider, built on first use and after geometry changes. Packed
	 * meshes share one collider per loader geometry (so do all LoadMesh and
	 * CopyEntity instances of a model); its triangles report the surface index.
	 */
	getCollider(): MeshCollider {
		if (this.collValid !== this.geomChanges || !this.collider) {
			if (!this._surfaces) {
				const geo = this._rep.geometry;
				let c = colliders.get(geo);
				if (!c) {
					c = meshColliderFromGeometry(geo);
					colliders.set(geo, c);
				}
				this.collider = c;
			} else {
				this.collider = MeshCollider.fromSurfaces(
					this._surfaces.map((s) => ({ positions: s.coords, indices: s.tris, surface: s }))
				);
			}
			this.collValid = this.geomChanges;
		}
		return this.collider;
	}

	/** MeshModel::collide */
	collide(line: Line, radius: number, curr_coll: Collision, t: Transform): boolean {
		return this.getCollider().collide(line, radius, curr_coll, t);
	}

	/** The Surface a collider triangle's `surface` value stands for (PickedSurface, CollisionSurface). */
	surfaceOf(value: unknown): Surface | null {
		if (value instanceof Surface) return value;
		if (typeof value === 'number') return this.surfaces[value] ?? null;
		return null;
	}

	/** True when every surface is drawn opaque with this entity brush (used by tests and diagnostics). */
	opaque(entityBrush: Brush): boolean {
		const list = this._surfaces ? this._surfaces.map((s) => s.brush) : this._rep.surfaces;
		return list.every((b) => Brush.combine(b, entityBrush).getBlend() === BLEND_REPLACE);
	}
}

// ----------------------------------------------------------------- MeshUtil

/** MeshUtil::createCube */
export function createCube(): MeshModel {
	const norms = [
		[0, 0, -1],
		[1, 0, 0],
		[0, 0, 1],
		[-1, 0, 0],
		[0, 1, 0],
		[0, -1, 0]
	];
	const tex = [
		[0, 0],
		[1, 0],
		[1, 1],
		[0, 1]
	];
	const verts = [2, 3, 1, 0, 3, 7, 5, 1, 7, 6, 4, 5, 6, 2, 0, 4, 6, 7, 3, 2, 0, 1, 5, 4];
	const m = new MeshModel();
	const s = m.createSurface(new Brush());
	for (let k = 0; k < 24; k += 4) {
		const n = norms[k / 4];
		for (let j = 0; j < 4; j++) {
			// Box( Vector(-1,-1,-1),Vector(1,1,1) ).corner( n )
			const c = verts[k + j];
			s.addVertex(c & 1 ? 1 : -1, c & 2 ? 1 : -1, c & 4 ? 1 : -1, tex[j][0], tex[j][1], n[0], n[1], n[2]);
		}
		s.addTriangle(k, k + 1, k + 2);
		s.addTriangle(k, k + 2, k + 3);
	}
	return m;
}

/** MeshUtil::createSphere */
export function createSphere(segs: number): MeshModel {
	const h_segs = segs * 2;
	const v_segs = segs;
	const m = new MeshModel();
	const s = m.createSurface(new Brush());
	let k: number;
	for (k = 0; k < h_segs; ++k) s.addVertex(0, 1, 0, (k + 0.5) / h_segs, 0, 0, 1, 0);
	for (k = 1; k < v_segs; ++k) {
		const pitch = fr(fr((k * PI) / v_segs) - HALFPI);
		for (let j = 0; j <= h_segs; ++j) {
			const yaw = fr(((j % h_segs) * TWOPI) / h_segs);
			const v = rotationMatrix(pitch, yaw, 0).k;
			s.addVertex(v.x, v.y, v.z, j / h_segs, k / v_segs, v.x, v.y, v.z);
		}
	}
	for (k = 0; k < h_segs; ++k) s.addVertex(0, -1, 0, (k + 0.5) / h_segs, 1, 0, -1, 0);
	for (k = 0; k < h_segs; ++k) {
		const a = k;
		const b = a + h_segs + 1;
		s.addTriangle(a, b, b - 1);
	}
	for (k = 1; k < v_segs - 1; ++k) {
		for (let j = 0; j < h_segs; ++j) {
			const a = k * (h_segs + 1) + j - 1;
			const b = a + 1;
			const c = b + h_segs + 1;
			s.addTriangle(a, b, c);
			s.addTriangle(a, c, c - 1);
		}
	}
	for (k = 0; k < h_segs; ++k) {
		const a = (h_segs + 1) * (v_segs - 1) + k - 1;
		const b = a + 1;
		s.addTriangle(a, b, b + h_segs);
	}
	return m;
}

/** MeshUtil::createCylinder */
export function createCylinder(segs: number, solid: boolean): MeshModel {
	const m = new MeshModel();
	let s = m.createSurface(new Brush());
	let k: number;
	for (k = 0; k <= segs; ++k) {
		const yaw = fr(((k % segs) * TWOPI) / segs);
		const c = rotationMatrix(0, yaw, 0).k;
		s.addVertex(c.x, 1, c.z, k / segs, 0, c.x, 0, c.z);
		s.addVertex(c.x, -1, c.z, k / segs, 1, c.x, 0, c.z);
	}
	for (k = 0; k < segs; ++k) {
		const a = k * 2;
		const b = a + 2;
		const c = b + 1;
		s.addTriangle(a, b, c);
		s.addTriangle(a, c, c - 2);
	}
	if (!solid) return m;

	s = m.createSurface(new Brush());
	for (k = 0; k < segs; ++k) {
		const yaw = fr((k * TWOPI) / segs);
		const c = rotationMatrix(0, yaw, 0).k;
		const u = c.x * 0.5 + 0.5;
		const v = c.z * 0.5 + 0.5;
		s.addVertex(c.x, 1, c.z, u, v, 0, 1, 0);
		s.addVertex(c.x, -1, c.z, u, v, 0, -1, 0);
	}
	for (k = 2; k < segs; ++k) {
		s.addTriangle(0, k * 2, (k - 1) * 2);
		s.addTriangle(1, (k - 1) * 2 + 1, k * 2 + 1);
	}
	return m;
}

/** MeshUtil::createCone (the base keeps the outward side normals, as in Blitz) */
export function createCone(segs: number, solid: boolean): MeshModel {
	const m = new MeshModel();
	let s = m.createSurface(new Brush());
	let k: number;
	for (k = 0; k < segs; ++k) s.addVertex(0, 1, 0, (k + 0.5) / segs, 0, 0, 1, 0);
	for (k = 0; k <= segs; ++k) {
		const yaw = fr(((k % segs) * TWOPI) / segs);
		const c = yawMatrix(yaw).k;
		s.addVertex(c.x, -1, c.z, k / segs, 1, c.x, 0, c.z);
	}
	for (k = 0; k < segs; ++k) s.addTriangle(k, k + segs + 1, k + segs);
	if (!solid) return m;
	s = m.createSurface(new Brush());
	for (k = 0; k < segs; ++k) {
		const yaw = fr((k * TWOPI) / segs);
		const c = yawMatrix(yaw).k;
		s.addVertex(c.x, -1, c.z, c.x * 0.5 + 0.5, c.z * 0.5 + 0.5, c.x, 0, c.z);
	}
	for (k = 2; k < segs; ++k) s.addTriangle(0, k - 1, k);
	return m;
}

