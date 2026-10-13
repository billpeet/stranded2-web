/**
 * Port of blitz3d/meshcollider.cpp (+ MeshModel::Rep::getCollider and
 * MeshModel::Rep::getBox from meshmodel.cpp).
 *
 * Vertices are in the mesh's local space, triangles in Blitz winding
 * (clockwise front faces). The entity transform - including scale - is applied
 * to each candidate triangle at test time exactly as Blitz does.
 */
import { Collision, type Collider } from './collision';
import { Box, Line, Plane, Transform, Vector } from './geom';

const MAX_COLL_TRIS = 16;
const fr = Math.fround;

/** One surface of a mesh, as passed to MeshCollider.fromSurfaces. */
export interface ColliderSurface {
	/** xyz triples (stride 3), mesh-local Blitz coordinates */
	positions: ArrayLike<number>;
	/** triangle vertex indices in BLITZ winding order */
	indices: ArrayLike<number>;
	/** Value reported by CollisionSurface/PickedSurface. Defaults to the surface's index (0-based). */
	surface?: unknown;
}

interface Node {
	box: Box;
	left: Node | null;
	right: Node | null;
	triangles: number[];
}

/** Statistics counter equivalent to stats3d[0] ("tris compared for collision"). */
export const stats3d = { trisCompared: 0 };

export class MeshCollider implements Collider {
	/** xyz per vertex (floats, like Surface::Vertex::coords) */
	readonly vertices: Float32Array;
	/** 3 vertex indices per triangle */
	readonly triVerts: Int32Array;
	/** per triangle: surface handle */
	readonly triSurface: unknown[];
	/** per triangle: index of the triangle inside its surface */
	readonly triIndex: Int32Array;
	/** MeshModel::getBox(): bounds of all surface vertices (used by EntityInView, MeshWidth...). */
	readonly box: Box;

	private tree: Node;
	private leaves: Node[] = [];
	private tri_centres: Float32Array;

	/** MeshCollider( verts,tris ) */
	constructor(vertices: Float32Array, triVerts: Int32Array, triSurface: unknown[], triIndex: Int32Array) {
		this.vertices = vertices;
		this.triVerts = triVerts;
		this.triSurface = triSurface;
		this.triIndex = triIndex;

		this.box = new Box();
		for (let k = 0; k < vertices.length; k += 3) {
			this.box.update(new Vector(vertices[k], vertices[k + 1], vertices[k + 2]));
		}

		const n = triVerts.length / 3;
		const ts: number[] = [];
		this.tri_centres = new Float32Array(n * 3);
		for (let k = 0; k < n; ++k) {
			const a = triVerts[k * 3] * 3,
				b = triVerts[k * 3 + 1] * 3,
				c = triVerts[k * 3 + 2] * 3;
			// (v0+v1+v2)/3 in single precision, so that sort ties match Blitz
			for (let j = 0; j < 3; ++j) {
				this.tri_centres[k * 3 + j] = fr(fr(fr(vertices[a + j] + vertices[b + j]) + vertices[c + j]) / 3);
			}
			ts.push(k);
		}
		this.tree = this.createNode(ts);
	}

	/**
	 * MeshModel::Rep::getCollider(): concatenates all surfaces (triangles of
	 * surface k, then its vertices) into one collider.
	 */
	static fromSurfaces(surfaces: readonly ColliderSurface[]): MeshCollider {
		let nv = 0,
			nt = 0;
		for (const s of surfaces) {
			nv += Math.floor(s.positions.length / 3);
			nt += Math.floor(s.indices.length / 3);
		}
		const vertices = new Float32Array(nv * 3);
		const triVerts = new Int32Array(nt * 3);
		const triSurface: unknown[] = new Array(nt);
		const triIndex = new Int32Array(nt);
		let vo = 0,
			to = 0;
		surfaces.forEach((s, k) => {
			const st = Math.floor(s.indices.length / 3);
			const handle = s.surface === undefined ? k : s.surface;
			for (let j = 0; j < st; ++j) {
				triVerts[to * 3] = s.indices[j * 3] + vo;
				triVerts[to * 3 + 1] = s.indices[j * 3 + 1] + vo;
				triVerts[to * 3 + 2] = s.indices[j * 3 + 2] + vo;
				triSurface[to] = handle;
				triIndex[to] = j;
				++to;
			}
			const sv = Math.floor(s.positions.length / 3);
			for (let j = 0; j < sv * 3; ++j) vertices[vo * 3 + j] = s.positions[j];
			vo += sv;
		});
		return new MeshCollider(vertices, triVerts, triSurface, triIndex);
	}

	get triangleCount(): number {
		return this.triVerts.length / 3;
	}

	/** Number of leaves of the triangle tree (each holds at most 16 triangles). */
	get leafCount(): number {
		return this.leaves.length;
	}

	private vert(n: number): Vector {
		const v = this.vertices;
		return new Vector(v[n * 3], v[n * 3 + 1], v[n * 3 + 2]);
	}

	/** bool MeshCollider::collide( line,radius,curr_coll,t ) */
	collide(line: Line, radius: number, curr_coll: Collision, t: Transform): boolean {
		//create local box
		const box = Box.fromLine(line);
		box.expand(radius);
		const local_box = t.inverse().mulBox(box);

		return this.collideNode(local_box, line, radius, t, curr_coll, this.tree);
	}

	private collideNode(
		line_box: Box,
		line: Line,
		radius: number,
		tform: Transform,
		curr_coll: Collision,
		node: Node
	): boolean {
		if (!line_box.overlaps(node.box)) {
			return false;
		}

		let hit = false;
		if (!node.triangles.length) {
			if (node.left) hit = this.collideNode(line_box, line, radius, tform, curr_coll, node.left) || hit;
			if (node.right) hit = this.collideNode(line_box, line, radius, tform, curr_coll, node.right) || hit;
			return hit;
		}

		stats3d.trisCompared += node.triangles.length;

		const tv = this.triVerts;
		const a = line_box.a,
			b = line_box.b;
		const vs = this.vertices;
		for (let k = 0; k < node.triangles.length; ++k) {
			const tri = node.triangles[k];
			const i0 = tv[tri * 3] * 3,
				i1 = tv[tri * 3 + 1] * 3,
				i2 = tv[tri * 3 + 2] * 3;

			//tri box: 'Box tri_box(...); if( !tri_box.overlaps( line_box ) ) continue;' without allocating
			let lo: number, hi: number, p: number, q: number, r: number;
			p = vs[i0];
			q = vs[i1];
			r = vs[i2];
			lo = p < q ? (p < r ? p : r) : q < r ? q : r;
			hi = p > q ? (p > r ? p : r) : q > r ? q : r;
			if (!((hi < b.x ? hi : b.x) >= (lo > a.x ? lo : a.x))) continue;
			p = vs[i0 + 1];
			q = vs[i1 + 1];
			r = vs[i2 + 1];
			lo = p < q ? (p < r ? p : r) : q < r ? q : r;
			hi = p > q ? (p > r ? p : r) : q > r ? q : r;
			if (!((hi < b.y ? hi : b.y) >= (lo > a.y ? lo : a.y))) continue;
			p = vs[i0 + 2];
			q = vs[i1 + 2];
			r = vs[i2 + 2];
			lo = p < q ? (p < r ? p : r) : q < r ? q : r;
			hi = p > q ? (p > r ? p : r) : q > r ? q : r;
			if (!((hi < b.z ? hi : b.z) >= (lo > a.z ? lo : a.z))) continue;

			const t_v0 = new Vector(vs[i0], vs[i0 + 1], vs[i0 + 2]);
			const t_v1 = new Vector(vs[i1], vs[i1 + 1], vs[i1 + 2]);
			const t_v2 = new Vector(vs[i2], vs[i2 + 1], vs[i2 + 2]);

			if (!curr_coll.triangleCollide(line, radius, tform.mulVec(t_v0), tform.mulVec(t_v1), tform.mulVec(t_v2)))
				continue;

			curr_coll.surface = this.triSurface[tri];
			curr_coll.index = this.triIndex[tri] & 0xffff; // 'unsigned short index'

			hit = true;
		}
		return hit;
	}

	private nodeBox(tris: number[]): Box {
		const box = new Box();
		for (let k = 0; k < tris.length; ++k) {
			for (let j = 0; j < 3; ++j) box.update(this.vert(this.triVerts[tris[k] * 3 + j]));
		}
		return box;
	}

	private createLeaf(tris: number[]): Node {
		const c: Node = { box: this.nodeBox(tris), left: null, right: null, triangles: tris };
		this.leaves.push(c);
		return c;
	}

	private createNode(tris: number[]): Node {
		if (tris.length <= MAX_COLL_TRIS) return this.createLeaf(tris);

		const c: Node = { box: this.nodeBox(tris), left: null, right: null, triangles: [] };

		//find longest axis
		let max = c.box.width();
		if (c.box.height() > max) max = c.box.height();
		if (c.box.depth() > max) max = c.box.depth();
		let axis = 0;
		if (max === c.box.height()) axis = 1;
		else if (max === c.box.depth()) axis = 2;

		//sort by axis (multimap<float,int>: equal keys keep insertion order = stable sort)
		const centres = this.tri_centres;
		const sorted = tris.slice().sort((p, q) => centres[p * 3 + axis] - centres[q * 3 + axis]);

		//generate left node
		const half = Math.floor(sorted.length / 2);
		c.left = this.createNode(sorted.slice(0, half));

		//generate right node
		c.right = this.createNode(sorted.slice(half));

		return c;
	}

	/**
	 * bool MeshCollider::intersects( const MeshCollider &c,const Transform &t )
	 * `t` maps this collider's space into c's space.
	 */
	intersects(c: MeshCollider, t: Transform): boolean {
		if (!t.mulBox(this.tree.box).overlaps(c.tree.box)) return false;
		const a: Vector[][] = [];
		const b: Vector[] = [new Vector(), new Vector(), new Vector()];
		for (let k = 0; k < this.leaves.length; ++k) {
			const p = this.leaves[k];
			const box = t.mulBox(p.box);
			let tformed = false;
			for (let j = 0; j < c.leaves.length; ++j) {
				const q = c.leaves[j];
				if (!box.overlaps(q.box)) continue;
				if (!tformed) {
					for (let n = 0; n < p.triangles.length; ++n) {
						const tri = p.triangles[n] * 3;
						a[n] = [
							t.mulVec(this.vert(this.triVerts[tri])),
							t.mulVec(this.vert(this.triVerts[tri + 1])),
							t.mulVec(this.vert(this.triVerts[tri + 2]))
						];
					}
					tformed = true;
				}
				for (let n = 0; n < q.triangles.length; ++n) {
					const tri = q.triangles[n] * 3;
					b[0] = c.vert(c.triVerts[tri]);
					b[1] = c.vert(c.triVerts[tri + 1]);
					b[2] = c.vert(c.triVerts[tri + 2]);
					for (let m = 0; m < p.triangles.length; ++m) {
						if (trisIntersect(a[m], b)) return true;
					}
				}
			}
		}
		return false;
	}
}

function triTest(a: Vector[], b: Vector[]): boolean {
	let p0: Plane | null = null,
		p1: Plane | null = null,
		p2: Plane | null = null;
	const p = Plane.fromTri(a[0], a[1], a[2]);
	for (let k = 0; k < 3; ++k) {
		const l = new Line(b[k], b[(k + 1) % 3].sub(b[k]));
		const t = p.t_intersect(l);
		// 'if( t<0 || t>1 ) continue;' - written so that NaN (0/0: edge start
		// lying in the plane and parallel to it) is skipped too.
		if (!(t >= 0 && t <= 1)) continue;
		const i = l.at(t);
		if (!p0) p0 = Plane.fromTri(a[0].add(p.n), a[1], a[0]);
		if (p0.distance(i) < 0) continue;
		if (!p1) p1 = Plane.fromTri(a[1].add(p.n), a[2], a[1]);
		if (p1.distance(i) < 0) continue;
		if (!p2) p2 = Plane.fromTri(a[2].add(p.n), a[0], a[2]);
		if (p2.distance(i) < 0) continue;
		return true;
	}
	return false;
}

function trisIntersect(a: Vector[], b: Vector[]): boolean {
	return triTest(a, b) || triTest(b, a);
}
