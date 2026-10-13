/**
 * Port of blitz3d/geom.h + geom.cpp (Vector, Line, Plane, Quat, Matrix, Box,
 * Transform and the rotation helpers). Everything is in Blitz3D's left-handed
 * coordinate system and uses Blitz's own conventions:
 *
 *  - Matrix stores three COLUMN vectors i, j, k; `m.mulVec(q)` = i*q.x + j*q.y + k*q.z.
 *  - Quat is the conjugate of the textbook quaternion (see Quat.mul / Matrix.fromQuat).
 *  - `Vector.equals` is the epsilon comparison of Vector::operator==.
 *
 * Operator mapping:  -M / -T  -> inverse()      ~M / ~T -> transposed() / transposedInverse()
 *                    M*v      -> mulVec(v)      T*v     -> mulVec(v)
 *                    T*Line   -> mulLine()      T*Box   -> mulBox()
 *
 * Blitz computes in 32-bit floats; this port computes in doubles (see index.ts notes).
 */

export const PI = 3.14159265359;
export const TWOPI = PI * 2.0;
export const HALFPI = PI * 0.5;
export const EPSILON = 0.000001;
export const INFINITY = 10000000.0;
/** bbblitz3d.cpp: dtor / rtod */
export const dtor = 0.0174532925199432957692369076848861;
export const rtod = 1 / dtor;

export class Vector {
	constructor(
		public x = 0,
		public y = 0,
		public z = 0
	) {}
	clone(): Vector {
		return new Vector(this.x, this.y, this.z);
	}
	copy(q: Vector): this {
		this.x = q.x;
		this.y = q.y;
		this.z = q.z;
		return this;
	}
	get(n: number): number {
		return n === 0 ? this.x : n === 1 ? this.y : this.z;
	}
	neg(): Vector {
		return new Vector(-this.x, -this.y, -this.z);
	}
	mul(s: number): Vector {
		return new Vector(this.x * s, this.y * s, this.z * s);
	}
	mulv(q: Vector): Vector {
		return new Vector(this.x * q.x, this.y * q.y, this.z * q.z);
	}
	div(s: number): Vector {
		return new Vector(this.x / s, this.y / s, this.z / s);
	}
	divv(q: Vector): Vector {
		return new Vector(this.x / q.x, this.y / q.y, this.z / q.z);
	}
	add(q: Vector): Vector {
		return new Vector(this.x + q.x, this.y + q.y, this.z + q.z);
	}
	sub(q: Vector): Vector {
		return new Vector(this.x - q.x, this.y - q.y, this.z - q.z);
	}
	/** Vector::operator== (per-component EPSILON compare) */
	equals(q: Vector): boolean {
		return (
			Math.abs(this.x - q.x) <= EPSILON && Math.abs(this.y - q.y) <= EPSILON && Math.abs(this.z - q.z) <= EPSILON
		);
	}
	dot(q: Vector): number {
		return this.x * q.x + this.y * q.y + this.z * q.z;
	}
	cross(q: Vector): Vector {
		return new Vector(this.y * q.z - this.z * q.y, this.z * q.x - this.x * q.z, this.x * q.y - this.y * q.x);
	}
	length(): number {
		return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
	}
	distance(q: Vector): number {
		const dx = this.x - q.x,
			dy = this.y - q.y,
			dz = this.z - q.z;
		return Math.sqrt(dx * dx + dy * dy + dz * dz);
	}
	normalized(): Vector {
		const l = this.length();
		return new Vector(this.x / l, this.y / l, this.z / l);
	}
	normalize(): void {
		const l = this.length();
		this.x /= l;
		this.y /= l;
		this.z /= l;
	}
	/** radians; -atan2(x,z) */
	yaw(): number {
		return -Math.atan2(this.x, this.z);
	}
	/** radians; -atan2(y,sqrt(x*x+z*z)) */
	pitch(): number {
		return -Math.atan2(this.y, Math.sqrt(this.x * this.x + this.z * this.z));
	}
}

export class Line {
	constructor(
		public o: Vector = new Vector(),
		public d: Vector = new Vector()
	) {}
	/** Line::operator*(float): o + d*q */
	at(q: number): Vector {
		return new Vector(this.o.x + this.d.x * q, this.o.y + this.d.y * q, this.o.z + this.d.z * q);
	}
	nearest(q: Vector): Vector {
		return this.o.add(this.d.mul(this.d.dot(q.sub(this.o)) / this.d.dot(this.d)));
	}
}

export class Plane {
	constructor(
		public n: Vector = new Vector(),
		public d = 0
	) {}
	/** Plane( const Vector &p,const Vector &n ) */
	static pointNormal(p: Vector, n: Vector): Plane {
		return new Plane(n.clone(), -n.dot(p));
	}
	/** Plane( v0,v1,v2 ) */
	static fromTri(v0: Vector, v1: Vector, v2: Vector): Plane {
		const n = v1.sub(v0).cross(v2.sub(v0)).normalized();
		return new Plane(n, -n.dot(v0));
	}
	clone(): Plane {
		return new Plane(this.n.clone(), this.d);
	}
	neg(): Plane {
		return new Plane(this.n.neg(), -this.d);
	}
	distance(q: Vector): number {
		return this.n.dot(q) + this.d;
	}
	t_intersect(q: Line): number {
		return -this.distance(q.o) / this.n.dot(q.d);
	}
	intersectLine(q: Line): Vector {
		return q.at(this.t_intersect(q));
	}
	/** Line Plane::intersect( const Plane &q ) */
	intersectPlane(q: Plane): Line {
		const lv = this.n.cross(q.n).normalized();
		return new Line(q.intersectLine(new Line(this.nearest(this.n.mul(-this.d)), this.n.cross(lv))), lv);
	}
	nearest(q: Vector): Vector {
		return q.sub(this.n.mul(this.distance(q)));
	}
}

export class Quat {
	constructor(
		public w = 1,
		public v: Vector = new Vector()
	) {}
	clone(): Quat {
		return new Quat(this.w, this.v.clone());
	}
	/** Quat::operator-() : conjugate */
	neg(): Quat {
		return new Quat(this.w, this.v.neg());
	}
	/** Quat::operator*( const Quat & ) */
	mul(q: Quat): Quat {
		const v = this.v;
		return new Quat(this.w * q.w - v.dot(q.v), q.v.cross(v).add(q.v.mul(this.w)).add(v.mul(q.w)));
	}
	/** Quat::operator*( const Vector & ) */
	mulVec(q: Vector): Vector {
		return this.mul(new Quat(0, q)).mul(this.neg()).v;
	}
	scale(q: number): Quat {
		return new Quat(this.w * q, this.v.mul(q));
	}
	length(): number {
		const v = this.v;
		return Math.sqrt(this.w * this.w + v.x * v.x + v.y * v.y + v.z * v.z);
	}
	normalized(): Quat {
		const l = this.length();
		return new Quat(this.w / l, this.v.div(l));
	}
	i(): Vector {
		const v = this.v,
			w = this.w;
		const xz = v.x * v.z,
			wy = w * v.y;
		const xy = v.x * v.y,
			wz = w * v.z;
		const yy = v.y * v.y,
			zz = v.z * v.z;
		return new Vector(1 - 2 * (yy + zz), 2 * (xy - wz), 2 * (xz + wy));
	}
	j(): Vector {
		const v = this.v,
			w = this.w;
		const yz = v.y * v.z,
			wx = w * v.x;
		const xy = v.x * v.y,
			wz = w * v.z;
		const xx = v.x * v.x,
			zz = v.z * v.z;
		return new Vector(2 * (xy + wz), 1 - 2 * (xx + zz), 2 * (yz - wx));
	}
	k(): Vector {
		const v = this.v,
			w = this.w;
		const xz = v.x * v.z,
			wy = w * v.y;
		const yz = v.y * v.z,
			wx = w * v.x;
		const xx = v.x * v.x,
			yy = v.y * v.y;
		return new Vector(2 * (xz - wy), 2 * (yz + wx), 1 - 2 * (xx + yy));
	}
}

export class Matrix {
	constructor(
		public i: Vector = new Vector(1, 0, 0),
		public j: Vector = new Vector(0, 1, 0),
		public k: Vector = new Vector(0, 0, 1)
	) {}
	static fromQuat(q: Quat): Matrix {
		return new Matrix(q.i(), q.j(), q.k());
	}
	clone(): Matrix {
		return new Matrix(this.i.clone(), this.j.clone(), this.k.clone());
	}
	/** Matrix::operator~ */
	transposed(): Matrix {
		const { i, j, k } = this;
		return new Matrix(new Vector(i.x, j.x, k.x), new Vector(i.y, j.y, k.y), new Vector(i.z, j.z, k.z));
	}
	determinant(): number {
		const { i, j, k } = this;
		return i.x * (j.y * k.z - j.z * k.y) - i.y * (j.x * k.z - j.z * k.x) + i.z * (j.x * k.y - j.y * k.x);
	}
	/** Matrix::operator-() */
	inverse(): Matrix {
		const { i, j, k } = this;
		const t = 1.0 / this.determinant();
		return new Matrix(
			new Vector(t * (j.y * k.z - j.z * k.y), -t * (i.y * k.z - i.z * k.y), t * (i.y * j.z - i.z * j.y)),
			new Vector(-t * (j.x * k.z - j.z * k.x), t * (i.x * k.z - i.z * k.x), -t * (i.x * j.z - i.z * j.x)),
			new Vector(t * (j.x * k.y - j.y * k.x), -t * (i.x * k.y - i.y * k.x), t * (i.x * j.y - i.y * j.x))
		);
	}
	cofactor(): Matrix {
		const { i, j, k } = this;
		return new Matrix(
			new Vector(j.y * k.z - j.z * k.y, -(j.x * k.z - j.z * k.x), j.x * k.y - j.y * k.x),
			new Vector(-(i.y * k.z - i.z * k.y), i.x * k.z - i.z * k.x, -(i.x * k.y - i.y * k.x)),
			new Vector(i.y * j.z - i.z * j.y, -(i.x * j.z - i.z * j.x), i.x * j.y - i.y * j.x)
		);
	}
	mulVec(q: Vector): Vector {
		const { i, j, k } = this;
		return new Vector(
			i.x * q.x + j.x * q.y + k.x * q.z,
			i.y * q.x + j.y * q.y + k.y * q.z,
			i.z * q.x + j.z * q.y + k.z * q.z
		);
	}
	mul(q: Matrix): Matrix {
		return new Matrix(this.mulVec(q.i), this.mulVec(q.j), this.mulVec(q.k));
	}
	orthogonalize(): void {
		this.k.normalize();
		this.i = this.j.cross(this.k).normalized();
		this.j = this.k.cross(this.i);
	}
}

export class Box {
	a: Vector;
	b: Vector;
	constructor(a?: Vector, b?: Vector) {
		this.a = a ? a.clone() : new Vector(INFINITY, INFINITY, INFINITY);
		this.b = b ? b.clone() : a ? a.clone() : new Vector(-INFINITY, -INFINITY, -INFINITY);
	}
	/** Box( const Line &l ) */
	static fromLine(l: Line): Box {
		const t = new Box(l.o);
		t.update(l.o.add(l.d));
		return t;
	}
	clone(): Box {
		return new Box(this.a, this.b);
	}
	empty(): boolean {
		return this.b.x < this.a.x || this.b.y < this.a.y || this.b.z < this.a.z;
	}
	corner(n: number): Vector {
		return new Vector((n & 1 ? this.b : this.a).x, (n & 2 ? this.b : this.a).y, (n & 4 ? this.b : this.a).z);
	}
	update(q: Vector): void {
		const { a, b } = this;
		if (q.x < a.x) a.x = q.x;
		if (q.y < a.y) a.y = q.y;
		if (q.z < a.z) a.z = q.z;
		if (q.x > b.x) b.x = q.x;
		if (q.y > b.y) b.y = q.y;
		if (q.z > b.z) b.z = q.z;
	}
	overlaps(q: Box): boolean {
		const { a, b } = this;
		return (
			(b.x < q.b.x ? b.x : q.b.x) >= (a.x > q.a.x ? a.x : q.a.x) &&
			(b.y < q.b.y ? b.y : q.b.y) >= (a.y > q.a.y ? a.y : q.a.y) &&
			(b.z < q.b.z ? b.z : q.b.z) >= (a.z > q.a.z ? a.z : q.a.z)
		);
	}
	expand(n: number): void {
		this.a.x -= n;
		this.a.y -= n;
		this.a.z -= n;
		this.b.x += n;
		this.b.y += n;
		this.b.z += n;
	}
	width(): number {
		return this.b.x - this.a.x;
	}
	height(): number {
		return this.b.y - this.a.y;
	}
	depth(): number {
		return this.b.z - this.a.z;
	}
}

export class Transform {
	constructor(
		public m: Matrix = new Matrix(),
		public v: Vector = new Vector()
	) {}
	clone(): Transform {
		return new Transform(this.m.clone(), this.v.clone());
	}
	/** Transform::operator-() : true inverse */
	inverse(): Transform {
		const m = this.m.inverse();
		return new Transform(m, m.mulVec(this.v.neg()));
	}
	/** Transform::operator~() : inverse assuming an orthonormal matrix */
	transposedInverse(): Transform {
		const m = this.m.transposed();
		return new Transform(m, m.mulVec(this.v.neg()));
	}
	mulVec(q: Vector): Vector {
		const { i, j, k } = this.m;
		const v = this.v;
		return new Vector(
			i.x * q.x + j.x * q.y + k.x * q.z + v.x,
			i.y * q.x + j.y * q.y + k.y * q.z + v.y,
			i.z * q.x + j.z * q.y + k.z * q.z + v.z
		);
	}
	mulLine(q: Line): Line {
		const t = this.mulVec(q.o);
		return new Line(t, this.mulVec(q.o.add(q.d)).sub(t));
	}
	mulBox(q: Box): Box {
		const t = new Box(this.mulVec(q.corner(0)));
		for (let k = 1; k < 8; ++k) t.update(this.mulVec(q.corner(k)));
		return t;
	}
	mul(q: Transform): Transform {
		return new Transform(this.m.mul(q.m), this.m.mulVec(q.v).add(this.v));
	}
}

export function pitchMatrix(q: number): Matrix {
	return new Matrix(
		new Vector(1, 0, 0),
		new Vector(0, Math.cos(q), Math.sin(q)),
		new Vector(0, -Math.sin(q), Math.cos(q))
	);
}
export function yawMatrix(q: number): Matrix {
	return new Matrix(
		new Vector(Math.cos(q), 0, Math.sin(q)),
		new Vector(0, 1, 0),
		new Vector(-Math.sin(q), 0, Math.cos(q))
	);
}
export function rollMatrix(q: number): Matrix {
	return new Matrix(
		new Vector(Math.cos(q), Math.sin(q), 0),
		new Vector(-Math.sin(q), Math.cos(q), 0),
		new Vector(0, 0, 1)
	);
}
export function scaleMatrix(x: number, y: number, z: number): Matrix {
	return new Matrix(new Vector(x, 0, 0), new Vector(0, y, 0), new Vector(0, 0, z));
}
export function pitchQuat(p: number): Quat {
	return new Quat(Math.cos(p / -2), new Vector(Math.sin(p / -2), 0, 0));
}
export function yawQuat(y: number): Quat {
	return new Quat(Math.cos(y / 2), new Vector(0, Math.sin(y / 2), 0));
}
export function rollQuat(r: number): Quat {
	return new Quat(Math.cos(r / -2), new Vector(0, 0, Math.sin(r / -2)));
}
/** rotationQuat( p,y,r ) in radians: yawQuat(y)*pitchQuat(p)*rollQuat(r) */
export function rotationQuat(p: number, y: number, r: number): Quat {
	return yawQuat(y).mul(pitchQuat(p)).mul(rollQuat(r));
}
export function rotationMatrix(p: number, y: number, r: number): Matrix {
	return yawMatrix(y).mul(pitchMatrix(p)).mul(rollMatrix(r));
}
export function matrixRoll(m: Matrix): number {
	return Math.atan2(m.i.y, m.j.y);
}
export function quatPitch(q: Quat): number {
	return q.k().pitch();
}
export function quatYaw(q: Quat): number {
	return q.k().yaw();
}
export function quatRoll(q: Quat): number {
	return matrixRoll(Matrix.fromQuat(q));
}
export function matrixQuat(p: Matrix): Quat {
	const m = p.clone();
	m.orthogonalize();
	let t = m.i.x + m.j.y + m.k.z,
		w: number,
		x: number,
		y: number,
		z: number;
	if (t > EPSILON) {
		t = Math.sqrt(t + 1) * 2;
		x = (m.k.y - m.j.z) / t;
		y = (m.i.z - m.k.x) / t;
		z = (m.j.x - m.i.y) / t;
		w = t / 4;
	} else if (m.i.x > m.j.y && m.i.x > m.k.z) {
		t = Math.sqrt(m.i.x - m.j.y - m.k.z + 1) * 2;
		x = t / 4;
		y = (m.j.x + m.i.y) / t;
		z = (m.i.z + m.k.x) / t;
		w = (m.k.y - m.j.z) / t;
	} else if (m.j.y > m.k.z) {
		t = Math.sqrt(m.j.y - m.k.z - m.i.x + 1) * 2;
		x = (m.j.x + m.i.y) / t;
		y = t / 4;
		z = (m.k.y + m.j.z) / t;
		w = (m.i.z - m.k.x) / t;
	} else {
		t = Math.sqrt(m.k.z - m.j.y - m.i.x + 1) * 2;
		x = (m.i.z + m.k.x) / t;
		y = (m.k.y + m.j.z) / t;
		z = t / 4;
		w = (m.j.x - m.i.y) / t;
	}
	return new Quat(w, new Vector(x, y, z));
}
