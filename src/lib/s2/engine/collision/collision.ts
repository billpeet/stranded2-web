/**
 * Port of blitz3d/collision.cpp ("NEW VERSION" - the code that is compiled;
 * the commented-out OLD VERSION is not used by Blitz3D 1.98+).
 */
import { Box, Line, Matrix, Plane, Vector, type Transform } from './geom';

export const COLLISION_EPSILON = 0.001;

/** Anything an entity can use as its polygon geometry (Object::collide overrides). */
export interface Collider {
	/**
	 * Swept sphere (radius 0 = ray) `line` in world space against the geometry
	 * placed by `tform`. Updates `curr_coll` and returns true on a nearer hit.
	 */
	collide(line: Line, radius: number, curr_coll: Collision, tform: Transform): boolean;
}

/** struct Collision */
export class Collision {
	time = 1;
	normal = new Vector();
	/** Whatever the collider registered for the hit triangle's surface (null if none). */
	surface: unknown = null;
	/** `unsigned short index` initialised to ~0. */
	index = 0xffff;

	clone(): Collision {
		const c = new Collision();
		c.time = this.time;
		c.normal = this.normal.clone();
		c.surface = this.surface;
		c.index = this.index;
		return c;
	}

	/** Collision::update */
	update(line: Line, t: number, n: Vector): boolean {
		// Deviation: reject NaN (degenerate triangles). In C the outcome of the
		// comparisons below with NaN operands depends on MSVC6's x87 code
		// generation; accepting a NaN time would poison every later compare.
		if (t !== t || n.x !== n.x) return false;

		if (t > this.time) return false;
		const p = Plane.pointNormal(line.at(t), n);
		if (p.n.dot(line.d) >= 0) return false;
		if (p.distance(line.o) < -COLLISION_EPSILON) return false;

		this.time = t;
		this.normal = n;
		return true;
	}

	/** Collision::sphereCollide( line,radius,dest,dest_radius ) */
	sphereCollide(line: Line, radius: number, dest: Vector, dest_radius: number): boolean {
		radius += dest_radius;
		const l = new Line(line.o.sub(dest), line.d);

		const a = l.d.dot(l.d);
		if (!a) return false;
		const b = l.o.dot(l.d) * 2;
		const c = l.o.dot(l.o) - radius * radius;
		const d = b * b - 4 * a * c;
		if (d < 0) return false;

		const t1 = (-b + Math.sqrt(d)) / (2 * a);
		const t2 = (-b - Math.sqrt(d)) / (2 * a);

		const t = t1 < t2 ? t1 : t2;

		if (t > this.time) return false;

		return this.update(line, t, l.at(t).normalized());
	}

	/** Collision::triangleCollide */
	triangleCollide(line: Line, radius: number, v0: Vector, v1: Vector, v2: Vector): boolean {
		//triangle plane
		const p = Plane.fromTri(v0, v1, v2);
		if (p.n.dot(line.d) >= 0) return false;

		//move plane out
		p.d -= radius;
		const t = p.t_intersect(line);
		if (t > this.time) return false;

		//edge planes
		const p0 = Plane.fromTri(v0.add(p.n), v1, v0),
			p1 = Plane.fromTri(v1.add(p.n), v2, v1),
			p2 = Plane.fromTri(v2.add(p.n), v0, v2);

		//intersects triangle?
		const i = line.at(t);
		if (p0.distance(i) >= 0 && p1.distance(i) >= 0 && p2.distance(i) >= 0) {
			return this.update(line, t, p.n);
		}

		if (radius <= 0) return false;

		// non-short-circuit '|' in the original: all three are evaluated
		const e0 = edgeTest(v0, v1, p.n, p0.n, line, radius, this);
		const e1 = edgeTest(v1, v2, p.n, p1.n, line, radius, this);
		const e2 = edgeTest(v2, v0, p.n, p2.n, line, radius, this);
		return e0 || e1 || e2;
	}

	/** Collision::boxCollide */
	boxCollide(line: Line, radius: number, box: Box): boolean {
		let hit = false;

		for (let n = 0; n < 24; n += 4) {
			const v0 = box.corner(quads[n]),
				v1 = box.corner(quads[n + 1]),
				v2 = box.corner(quads[n + 2]),
				v3 = box.corner(quads[n + 3]);

			//quad plane
			const p = Plane.fromTri(v0, v1, v2);
			if (p.n.dot(line.d) >= 0) continue;

			//move plane out
			p.d -= radius;
			const t = p.t_intersect(line);
			if (t > this.time) return false; // sic: 'return false', not 'continue'

			//edge planes
			const p0 = Plane.fromTri(v0.add(p.n), v1, v0),
				p1 = Plane.fromTri(v1.add(p.n), v2, v1),
				p2 = Plane.fromTri(v2.add(p.n), v3, v2),
				p3 = Plane.fromTri(v3.add(p.n), v0, v3);

			//intersects triangle?
			const i = line.at(t);
			if (p0.distance(i) >= 0 && p1.distance(i) >= 0 && p2.distance(i) >= 0 && p3.distance(i) >= 0) {
				if (this.update(line, t, p.n)) hit = true;
				continue;
			}

			if (radius <= 0) continue;

			const e0 = edgeTest(v0, v1, p.n, p0.n, line, radius, this);
			const e1 = edgeTest(v1, v2, p.n, p1.n, line, radius, this);
			const e2 = edgeTest(v2, v3, p.n, p2.n, line, radius, this);
			const e3 = edgeTest(v3, v0, p.n, p3.n, line, radius, this);
			if (e0 || e1 || e2 || e3) hit = true;
		}
		return hit;
	}
}

const quads = [2, 3, 1, 0, 3, 7, 5, 1, 7, 6, 4, 5, 6, 2, 0, 4, 6, 7, 3, 2, 0, 1, 5, 4];

//v0,v1 = edge verts
//pn = poly normal
//en = edge normal
function edgeTest(
	v0: Vector,
	v1: Vector,
	pn: Vector,
	en: Vector,
	line: Line,
	radius: number,
	curr_coll: Collision
): boolean {
	const tm = new Matrix(en, v1.sub(v0).normalized(), pn).transposed();
	const sv = tm.mulVec(line.o.sub(v0)),
		dv = tm.mulVec(line.o.add(line.d).sub(v0));
	const l = new Line(sv, dv.sub(sv));
	//do cylinder test...
	let a: number, b: number, c: number, d: number, t1: number, t2: number, t: number;
	a = l.d.x * l.d.x + l.d.z * l.d.z;
	if (!a) return false; //ray parallel to cylinder
	b = (l.o.x * l.d.x + l.o.z * l.d.z) * 2;
	c = l.o.x * l.o.x + l.o.z * l.o.z - radius * radius;
	d = b * b - 4 * a * c;
	if (d < 0) return false; //ray misses cylinder
	t1 = (-b + Math.sqrt(d)) / (2 * a);
	t2 = (-b - Math.sqrt(d)) / (2 * a);
	t = t1 < t2 ? t1 : t2;
	if (t > curr_coll.time) return false; //intersects too far away
	let i = l.at(t);
	const p = new Vector();
	if (i.y > v0.distance(v1)) return false; //intersection above cylinder
	if (i.y >= 0) {
		p.y = i.y;
	} else {
		//below bottom of cylinder...do sphere test...
		a = l.d.dot(l.d);
		if (!a) return false; //ray parallel to sphere
		b = l.o.dot(l.d) * 2;
		c = l.o.dot(l.o) - radius * radius;
		d = b * b - 4 * a * c;
		if (d < 0) return false; //ray misses sphere
		t1 = (-b + Math.sqrt(d)) / (2 * a);
		t2 = (-b - Math.sqrt(d)) / (2 * a);
		t = t1 < t2 ? t1 : t2;
		if (t > curr_coll.time) return false;
		i = l.at(t);
	}

	// ~tm is the transpose of the transpose = the original (en, edge, pn) basis
	return curr_coll.update(line, t, tm.transposed().mulVec(i.sub(p)).normalized());
}
