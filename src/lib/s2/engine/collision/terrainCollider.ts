/**
 * Blitz3D terrain, as far as heights, picking and collision are concerned.
 * Port of blitz3d/terrainrep.cpp (TerrainRep: cells, error tree, the two
 * collide() overloads and clip()), blitz3d/terrain.cpp (bounds checks) and the
 * static terrainHeight()/terrainVector() helpers of bbruntime/bbblitz3d.cpp
 * that implement TerrainX/TerrainY/TerrainZ.
 *
 * Facts established from that source (they differ from engine/terrain.ts):
 *
 * 1. STORAGE. A terrain of grid size S (power of two) stores S*S cells, not
 *    (S+1)^2, as ONE UNSIGNED BYTE each: `height = h*255.0f` truncated.
 *    Heights therefore have only 256 levels (12.549 world units per level at
 *    the game's Y scale of 3200).
 *
 * 2. WRAPPING. TerrainRep indexes cells with `(x & mask, z & mask)`.
 *    ModifyTerrain/TerrainHeight accept 0..S inclusive, so x==S aliases x==0
 *    and z==S aliases z==0. The game's loader runs `For x=0 To S / For z=0 To S`
 *    so the values written for x==S (and z==S) OVERWRITE those of x==0 (z==0).
 *    Net effect: height(0,z) == height(S,z) == file value at (S,z), etc.
 *
 * 3. TerrainY IS BILINEAR, not triangulated: world point -> terrain local
 *    space, ix=floor(x), iz=floor(z), bilinear blend of the four corner
 *    heights, back to world space. Corners outside 0..S contribute height 0
 *    (so just outside the map TerrainY ramps to the terrain's base Y within
 *    one cell, and is exactly the base Y - world -1600 in the game - beyond).
 *    There is no clamping to the map edge.
 *
 * 4. PICKS AND COLLISIONS USE TRIANGLES, not the bilinear surface. The
 *    triangles come from a binary triangle tree ("ROAM" bintree) rooted at two
 *    triangles split along the (0,0)-(S,S) diagonal. Recursion stops at the
 *    finest level (two triangles per cell, diagonals alternating in the
 *    bintree pattern - see leafTriangles()) or earlier where the subtree is
 *    exactly flat (error byte == 0). Triangle vertices use the same wrapped,
 *    quantised heights. Unlike rendering, collision is independent of
 *    TerrainDetail / camera LOD / vertex morphing.
 *
 *    Consequently a pick against the terrain and TerrainY at the picked x/z
 *    disagree inside any non-planar cell (the game code lives with that).
 */
import { Collision, type Collider } from './collision';
import { Box, EPSILON, Line, Transform, Vector } from './geom';

const fr = Math.fround;

/** struct TerrainRep::Vert (only what collision needs) */
interface Vert {
	x: number;
	z: number;
	v: Vector;
}

const clipNormals = [
	new Vector(1, 0, 0),
	new Vector(0, 0, 1),
	new Vector(0, -1, 0),
	new Vector(-1, 0, 0),
	new Vector(0, 0, -1),
	new Vector(0, 1, 0)
];

/** static bool clip( const Line &l,const Box &box ) */
function clip(l: Line, box: Box): boolean {
	let v0 = l.o,
		v1 = l.o.add(l.d);
	for (let k = 0; k < 6; ++k) {
		const t = box.corner(k);
		const n = clipNormals[k];
		const d0 = n.dot(v0.sub(t)),
			d1 = n.dot(v1.sub(t));
		if (d0 < 0) {
			if (d1 < 0) return false;
			v0 = v0.add(v1.sub(v0).mul(d0 / (d0 - d1)));
		} else if (d1 < 0) {
			v1 = v1.add(v0.sub(v1).mul(d1 / (d1 - d0)));
		}
	}
	return true;
}

export class TerrainCollider implements Collider {
	/** cell_size: grid size S (cells per side) */
	readonly size: number;
	private readonly cell_shift: number;
	private readonly cell_mask: number;
	private readonly end_tri_id: number;
	/** S*S height bytes, index ((z&mask)<<shift)|(x&mask) */
	readonly cells: Uint8Array;
	private readonly err_error: Uint8Array;
	private readonly err_bound: Uint8Array;
	private errs_valid = true;

	/** CreateTerrain( grid_size ) */
	constructor(grid_size: number) {
		let shift = 0;
		while (1 << shift < grid_size) ++shift;
		if (1 << shift !== grid_size) throw new Error('Illegal terrain size');
		this.cell_shift = shift;
		this.size = 1 << shift;
		this.cell_mask = this.size - 1;
		this.end_tri_id = this.size * this.size * 2;
		this.cells = new Uint8Array(this.size * this.size);
		this.err_error = new Uint8Array(this.end_tri_id);
		this.err_bound = new Uint8Array(this.end_tri_id);
	}

	/**
	 * Builds the terrain exactly as e_load_map.bb does from a map file's
	 * height block: `For x=0 To S: For z=0 To S: ModifyTerrain(ter,x,z,h)`.
	 * `heights` is the (S+1)^2 column-major array used by engine/terrain.ts
	 * (index = x*(S+1)+z).
	 */
	static fromMapHeights(size: number, heights: ArrayLike<number>): TerrainCollider {
		const t = new TerrainCollider(size);
		const n = size + 1;
		for (let x = 0; x <= size; x++) {
			for (let z = 0; z <= size; z++) t.setHeight(x, z, heights[x * n + z]);
		}
		return t;
	}

	/**
	 * ModifyTerrain terrain,x,z,height (Terrain::setHeight + TerrainRep::setHeight).
	 * Ignored outside 0..S; x==S / z==S alias 0. The value is stored as
	 * `(unsigned char)(h*255.0f)`.
	 */
	setHeight(x: number, z: number, h: number): void {
		const S = this.size;
		if (!(x >= 0 && z >= 0 && x <= S && z <= S)) return;
		this.cells[((z & this.cell_mask) << this.cell_shift) | (x & this.cell_mask)] =
			Math.trunc(fr(fr(h) * 255.0)) & 255;
		this.errs_valid = false;
	}

	/** TerrainRep::getHeight: wraps, no bounds check. 0..1 */
	repHeight(x: number, z: number): number {
		return fr(this.cells[((z & this.cell_mask) << this.cell_shift) | (x & this.cell_mask)] / 255.0);
	}

	/** TerrainHeight( terrain,x,z ) (Terrain::getHeight): 0 outside 0..S, wraps at S. 0..1 */
	getHeight(x: number, z: number): number {
		const S = this.size;
		return x >= 0 && z >= 0 && x <= S && z <= S ? this.repHeight(x, z) : 0;
	}

	/**
	 * static float terrainHeight( Terrain *t,float x,float z ) from bbblitz3d.cpp:
	 * bilinear height (0..1) at terrain-local grid coordinates.
	 */
	terrainHeight(x: number, z: number): number {
		const ix = Math.floor(x);
		const iz = Math.floor(z);
		const tx = fr(x - ix),
			tz = fr(z - iz);
		const h0 = this.getHeight(ix, iz);
		const h1 = this.getHeight(ix + 1, iz);
		const h2 = this.getHeight(ix, iz + 1);
		const h3 = this.getHeight(ix + 1, iz + 1);
		const ha = fr(fr(fr(h1 - h0) * tx) + h0),
			hb = fr(fr(fr(h3 - h2) * tx) + h2);
		const h = fr(fr(fr(hb - ha) * tz) + ha);
		return h;
	}

	/**
	 * static Vector terrainVector( Terrain *t,float x,float y,float z ):
	 * the point of the (bilinear) terrain surface above/below a WORLD point,
	 * given the terrain entity's world transform. TerrainX/Y/Z return its
	 * components.
	 */
	terrainVector(worldTform: Transform, x: number, y: number, z: number): Vector {
		const v = worldTform.inverse().mulVec(new Vector(x, y, z));
		const lx = fr(v.x),
			lz = fr(v.z);
		const r = worldTform.mulVec(new Vector(lx, this.terrainHeight(lx, lz), lz));
		r.x = fr(r.x);
		r.y = fr(r.y);
		r.z = fr(r.z);
		return r;
	}

	private vert(x: number, z: number): Vert {
		return { x, z, v: new Vector(x, this.repHeight(x, z), z) };
	}

	/** TerrainRep::calcErr( id,v0,v1,v2 ); returns error | bound<<8 */
	private calcErr(id: number, v0: Vert, v1: Vert, v2: Vert): number {
		let y = v0.v.y;
		if (v1.v.y > y) y = v1.v.y;
		if (v2.v.y > y) y = v2.v.y;

		let error = 0;
		let bound = y >= 1 ? 255 : Math.ceil(fr(y * 255.0));

		if (id >= this.end_tri_id) return error | (bound << 8);

		const tv = this.vert((v1.x + v2.x) >> 1, (v1.z + v2.z) >> 1);
		const e = Math.abs(fr(tv.v.y - fr(fr(v1.v.y + v2.v.y) / 2)));
		// unsigned char = ceil( (e-EPSILON)*255.0f ): a tiny negative value ceils to (-)0
		error = e >= 1 ? 255 : Math.max(0, Math.ceil((e - EPSILON) * 255.0));

		const el = this.calcErr(id * 2, tv, v2, v0);
		const er = this.calcErr(id * 2 + 1, tv, v0, v1);

		if ((el & 255) > error) error = el & 255;
		if ((er & 255) > error) error = er & 255;

		if (el >> 8 > bound) bound = el >> 8;
		if (er >> 8 > bound) bound = er >> 8;

		this.err_error[id] = error;
		this.err_bound[id] = bound;
		return error | (bound << 8);
	}

	/** TerrainRep::validateErrs */
	private validateErrs(): void {
		if (this.errs_valid) return;
		const S = this.size;
		const v0 = this.vert(0, 0),
			v1 = this.vert(S, 0),
			v2 = this.vert(S, S),
			v3 = this.vert(0, S);
		this.calcErr(2, v1, v2, v0);
		this.calcErr(3, v3, v0, v2);
		this.errs_valid = true;
	}

	/** TerrainRep::collide( line,curr_coll,tform,id,v0,v1,v2,l ) - ray version */
	private collideRay(
		line: Line,
		curr_coll: Collision,
		tform: Transform,
		id: number,
		v0: Vert,
		v1: Vert,
		v2: Vert,
		l: Line
	): boolean {
		const b = new Box(v0.v);
		b.update(v1.v);
		b.update(v2.v);

		if (id >= this.end_tri_id || !this.err_error[id]) {
			return clip(l, b)
				? curr_coll.triangleCollide(line, 0, tform.mulVec(v0.v), tform.mulVec(v2.v), tform.mulVec(v1.v))
				: false;
		}

		b.a.y = 0;
		b.b.y = this.err_bound[id] / 255.0;
		if (!clip(l, b)) return false;

		const tv = this.vert((v1.x + v2.x) >> 1, (v1.z + v2.z) >> 1);

		const h0 = this.collideRay(line, curr_coll, tform, id * 2, tv, v2, v0, l);
		const h1 = this.collideRay(line, curr_coll, tform, id * 2 + 1, tv, v0, v1, l);
		return h0 || h1;
	}

	/** TerrainRep::collide( line,radius,curr_coll,tform,id,v0,v1,v2,box ) - swept sphere version */
	private collideSphere(
		line: Line,
		radius: number,
		curr_coll: Collision,
		tform: Transform,
		id: number,
		v0: Vert,
		v1: Vert,
		v2: Vert,
		box: Box
	): boolean {
		const b = new Box(v0.v);
		b.update(v1.v);
		b.update(v2.v);

		if (id >= this.end_tri_id || !this.err_error[id]) {
			return b.overlaps(box)
				? curr_coll.triangleCollide(line, radius, tform.mulVec(v0.v), tform.mulVec(v2.v), tform.mulVec(v1.v))
				: false;
		}

		b.a.y = 0;
		b.b.y = this.err_bound[id] / 255.0;
		if (!b.overlaps(box)) return false;

		const tv = this.vert((v1.x + v2.x) >> 1, (v1.z + v2.z) >> 1);
		const h0 = this.collideSphere(line, radius, curr_coll, tform, id * 2, tv, v2, v0, box);
		const h1 = this.collideSphere(line, radius, curr_coll, tform, id * 2 + 1, tv, v0, v1, box);
		return h0 || h1;
	}

	/** bool TerrainRep::collide( line,radius,curr_coll,tform ) */
	collide(line: Line, radius: number, curr_coll: Collision, tform: Transform): boolean {
		this.validateErrs();

		const S = this.size;
		const v0 = this.vert(0, 0),
			v1 = this.vert(S, 0),
			v2 = this.vert(S, S),
			v3 = this.vert(0, S);

		if (!radius) {
			const l = tform.inverse().mulLine(line);
			const h0 = this.collideRay(line, curr_coll, tform, 2, v1, v2, v0, l);
			const h1 = this.collideRay(line, curr_coll, tform, 3, v3, v0, v2, l);
			return h0 || h1;
		}

		//create local box
		const b = Box.fromLine(line);
		b.expand(radius);
		const box = tform.inverse().mulBox(b);

		const h0 = this.collideSphere(line, radius, curr_coll, tform, 2, v1, v2, v0, box);
		const h1 = this.collideSphere(line, radius, curr_coll, tform, 3, v3, v0, v2, box);
		return h0 || h1;
	}

	/**
	 * The finest-level triangles of the bintree (2 per cell) - the surface that
	 * picks/collisions see, and what Blitz renders at full detail. Returns
	 * grid-vertex index triples in Blitz winding (as `mesh->setTriangle(v0,v2,v1)`),
	 * with vertex index = x*(S+1)+z to match engine/terrain.ts. Use together
	 * with repHeight(x,z) for the vertex heights if the render mesh should
	 * match the collision surface.
	 */
	leafTriangles(): Uint32Array {
		const S = this.size,
			n = S + 1;
		const out = new Uint32Array(S * S * 6);
		let k = 0;
		const rec = (id: number, x0: number, z0: number, x1: number, z1: number, x2: number, z2: number) => {
			if (id >= this.end_tri_id) {
				out[k++] = x0 * n + z0;
				out[k++] = x2 * n + z2;
				out[k++] = x1 * n + z1;
				return;
			}
			const tx = (x1 + x2) >> 1,
				tz = (z1 + z2) >> 1;
			rec(id * 2, tx, tz, x2, z2, x0, z0);
			rec(id * 2 + 1, tx, tz, x0, z0, x1, z1);
		};
		rec(2, S, 0, S, S, 0, 0);
		rec(3, 0, S, 0, 0, S, S);
		return out;
	}
}

/**
 * Port of PlaneModel::collide (blitz3d/planemodel.cpp): the infinite plane
 * y=0 of a CreatePlane entity (the game's sea and ground planes use pick mode 2).
 */
export class PlaneCollider implements Collider {
	collide(l: Line, radius: number, curr_coll: Collision, tf: Transform): boolean {
		const line = tf.inverse().mulLine(l);

		// Plane p( Vector( 0,1,0 ),0 ); p.d-=radius; t=p.t_intersect( line )
		const d = -radius;
		const t = -(line.o.y + d) / line.d.y;
		if (t >= curr_coll.time) return false;
		// Same NaN deviation as Collision.update (ray lying in the plane: 0/0).
		if (t !== t) return false;

		const n = tf.m.cofactor().mulVec(new Vector(0, 1, 0)).normalized();

		return curr_coll.update(l, t, n);
	}
}
