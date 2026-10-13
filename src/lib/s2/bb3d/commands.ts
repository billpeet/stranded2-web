/**
 * The Blitz3D 3D command set (bbruntime/bbblitz3d.cpp) as free functions with
 * the original names, argument order and optional-argument defaults (from the
 * rtSym table), acting on `World.current`.
 *
 *   PositionEntity TCunit\h,x#,y#,z#        ->  PositionEntity(TCunit.h, x, y, z)
 *   If EntityPick(cam,50)=TCobject\h Then   ->  if (EntityPick(cam, 50) === TCobject.h)
 *   h=CopyEntity(Dobject_modelh(typ))       ->  h = CopyEntity(Dobject_modelh[typ])
 *
 * Handles: entities are `BBEntity | null`, textures `Texture | null`, brushes
 * `Brush | null`, surfaces `Surface`; null is Blitz's 0. Commands that return
 * a truth value return 1 or 0, as Blitz does.
 *
 * Where Blitz only checks an argument in debug builds (and misbehaves in
 * release builds) these functions throw: a null or freed entity is always a
 * porting bug.
 */
import type * as THREE from 'three';
import { Brush } from '../engine/anim/brush';
import {
	addAnimSeq as animAddAnimSeq,
	animate as animAnimate,
	createAnimMesh,
	entityAlpha,
	entityAutoFade,
	entityBlend,
	entityBrush,
	entityColor,
	entityFX,
	entityShininess,
	getAnimator,
	paintEntity,
	refreshEntity,
	setAnimTime as animSetAnimTime
} from '../engine/anim/entity';
import type { BlitzCamera } from '../engine/blitzSpace';
import * as C from '../engine/collision/commands';
import type { Entity } from '../engine/collision/entity';
import { Box, PI, Transform, Vector, dtor, rotationMatrix, scaleMatrix } from '../engine/collision/geom';
import { getFrustum } from '../engine/collision/world';
import type { Canvas2D } from '../gfx2d/canvas';
import { MeshModel, Surface, createCone, createCube, createCylinder, createSphere } from './mesh';
import { TerrainState } from './terrain';
import { Texture } from './texture';
import { BBEntity, World, applyLightState, handleOf, syncProjection } from './world';

export type Handle = BBEntity | null;

const ADDRESSES = new WeakMap<BBEntity, number>();
let nextAddress = 0x10000000;
/**
 * The Int value of an entity handle. In Blitz a handle is the entity's
 * address: a large number that never equals an id or a small integer. Used
 * where the original passes an entity to an Int that is compared with other
 * things (ai_check: game_damage(..., TCunith) as "causer"). Stable per
 * entity, 0 for none.
 */
export function EntityAddress(h: Handle): number {
	if (h === null) return 0;
	let a = ADDRESSES.get(h);
	if (a === undefined) {
		a = nextAddress;
		nextAddress += 0x100;
		ADDRESSES.set(h, a);
	}
	return a;
}
export { Brush, Surface, Texture };

const ctof = 1.0 / 255.0;

function W(): World {
	const w = World.current;
	if (!w) throw new Error('3D Graphics mode not set');
	return w;
}

/** debugEntity */
function E(h: Handle): BBEntity {
	if (!h || h.freed) throw new Error('Entity does not exist');
	return h;
}
/** An optional entity argument (parent, TFormPoint source ...). */
function P(h: Handle | undefined): BBEntity | null {
	if (!h) return null;
	if (h.freed) throw new Error('Parent entity does not exist');
	return h;
}
function T(t: Texture | null): Texture {
	if (!t || t.freed) throw new Error('Texture does not exist');
	return t;
}
function B(b: Brush | null): Brush {
	if (!b) throw new Error('Brush does not exist');
	return b;
}
function M(h: Handle): MeshModel {
	const e = E(h);
	if (!e.mesh) throw new Error('Entity is not a mesh');
	return e.mesh;
}
function H(e: Entity | null): Handle {
	return e ? ((e.userData as BBEntity | undefined) ?? null) : null;
}

/**
 * Blitz converts a Float passed for an Int parameter by rounding to nearest
 * (ties to even). Ints pass through.
 */
function toInt(v: number): number {
	if (Number.isInteger(v)) return v;
	const r = Math.round(v);
	if (Math.abs(v - Math.trunc(v)) === 0.5 && r % 2 !== 0) return r - 1;
	return r;
}

// ---------------------------------------------------------------------------
// Graphics mode
// ---------------------------------------------------------------------------

/** Graphics3D width,height,depth=0,mode=0: sets the logical screen size of the current world. */
export function Graphics3D(width: number, height: number, _depth = 0, _mode = 0): void {
	W().setGraphics(width, height);
}
/** Windowed3D(): windowed 3D is always possible. */
export function Windowed3D(): number {
	return 1;
}
/** GfxMode3DExists( width,height,depth ) */
export function GfxMode3DExists(_width: number, _height: number, _depth: number): number {
	return 1;
}
/** GfxMode3D( mode ) */
export function GfxMode3D(_mode: number): number {
	return 1;
}
/** GfxDriver3D( driver ) */
export function GfxDriver3D(_driver: number): number {
	return 1;
}

// ---------------------------------------------------------------------------
// Global world commands
// ---------------------------------------------------------------------------

/** LoaderMatrix: only the .b3d loader exists here, which has no matrix. */
export function LoaderMatrix(_ext: string, ..._m: number[]): void {}
export function HWMultiTex(_enable: number): void {}
export function HWTexUnits(): number {
	return 8;
}
export function GfxDriverCaps3D(): number {
	return 110;
}
export function WBuffer(_enable: number): void {}
export function Dither(_enable: number): void {}
export function AntiAlias(_enable: number): void {}

/** WireFrame enable */
export function WireFrame(enable: number | boolean): void {
	W().wireframe = !!enable;
}

/** AmbientLight red#,green#,blue# (default is 127,127,127) */
export function AmbientLight(r: number, g: number, b: number): void {
	W().ambient.color.setRGB(r * ctof, g * ctof, b * ctof);
}

export function ClearCollisions(): void {
	W().collision.ClearCollisions();
}

/** Collisions source_type,destination_type,method,response */
export function Collisions(src_type: number, dest_type: number, method: number, response: number): void {
	W().collision.Collisions(src_type, dest_type, method, response);
}

/** UpdateWorld elapsed_time#=1: collision pass and animation, in Blitz's per-entity order. */
export function UpdateWorld(elapsed = 1): void {
	W().updateWorld(elapsed);
}

/** CaptureWorld: render tweening is not implemented (the game always renders with tween 1). */
export function CaptureWorld(): void {}

/** RenderWorld tween#=1 */
export function RenderWorld(_tween = 1): void {
	W().renderWorld();
}

/** ClearWorld entities=1,brushes=1,textures=1 */
export function ClearWorld(entities = 1, brushes = 1, textures = 1): void {
	W().clear(!!entities, !!brushes, !!textures);
}

export function ActiveTextures(): number {
	return W().textures.active;
}

/** TrisRendered(): triangles drawn by the last RenderWorld. */
export function TrisRendered(): number {
	return W().trisRendered;
}

/** Stats3D( type ): 0 is "triangles compared for collision"; others are 0. */
export function Stats3D(_n: number): number {
	return 0;
}

// ---------------------------------------------------------------------------
// Texture commands
// ---------------------------------------------------------------------------

/** CreateTexture( width,height,flags=0,frames=1 ) */
export function CreateTexture(width: number, height: number, flags = 0, frames = 1): Texture {
	if (frames <= 0) throw new Error('Illegal number of texture frames');
	return W().textures.create(toInt(width), toInt(height), flags, frames);
}

/** LoadTexture( file$,flags=1 ): null when the file is missing (or was not preloaded). */
export function LoadTexture(file: string, flags = 1): Texture | null {
	return W().textures.load(file, flags);
}

/** LoadAnimTexture( file$,flags,width,height,first,count ) */
export function LoadAnimTexture(
	file: string,
	flags: number,
	width: number,
	height: number,
	first: number,
	count: number
): Texture | null {
	return W().textures.load(file, flags, width, height, first, count);
}

export function FreeTexture(t: Texture | null): void {
	if (!t) return;
	W().textures.free(t);
}

/** TextureBlend texture,blend (0 off, 1 alpha, 2 multiply, 3 add, 4 dot3, 5 multiply 2x) */
export function TextureBlend(t: Texture | null, blend: number): void {
	for (const h of T(t).rep.handles) h.setBlend(blend);
	W().materialsDirty = true;
}

/** TextureCoords texture,coords */
export function TextureCoords(t: Texture | null, coords: number): void {
	for (const h of T(t).rep.handles) h.setCoords(coords);
	W().materialsDirty = true;
}

/** ScaleTexture texture,u_scale#,v_scale# */
export function ScaleTexture(t: Texture | null, u_scale: number, v_scale: number): void {
	for (const h of T(t).rep.handles) h.scale(u_scale, v_scale);
}

/** RotateTexture texture,angle# */
export function RotateTexture(t: Texture | null, angle: number): void {
	for (const h of T(t).rep.handles) h.rotate(angle);
}

/** PositionTexture texture,u_offset#,v_offset# */
export function PositionTexture(t: Texture | null, u_pos: number, v_pos: number): void {
	for (const h of T(t).rep.handles) h.position(u_pos, v_pos);
}

/** TextureWidth( texture ): the width after rounding up to a power of two. */
export function TextureWidth(t: Texture | null): number {
	return T(t).frames[0].width;
}
export function TextureHeight(t: Texture | null): number {
	return T(t).frames[0].height;
}

/** TextureName$( texture ): the (normalised) path the image was loaded from, "" for created textures. */
export function TextureName(t: Texture | null): string {
	return T(t).rep.cached.file;
}

/** SetCubeFace texture,face */
export function SetCubeFace(t: Texture | null, face: number): void {
	W().textures.setCubeFace(T(t), face);
}

/** SetCubeMode texture,mode: cube map lookups are not implemented. */
export function SetCubeMode(_t: Texture | null, _mode: number): void {}

/**
 * TextureBuffer( texture,frame=0 ): the texture frame as a 2D buffer for the
 * gfx2d commands (SetBuffer, LockBuffer, ReadPixelFast, WritePixelFast,
 * CopyRect, DrawBlock ...). Changes reach the GPU at the next RenderWorld.
 */
export function TextureBuffer(t: Texture | null, frame = 0): Canvas2D | null {
	return W().textures.buffer(T(t), frame);
}

export function ClearTextureFilters(): void {
	W().textures.clearFilters();
}

/** TextureFilter match_text$,texture_flags=0 */
export function TextureFilter(match_text: string, flags = 0): void {
	W().textures.addFilter(match_text, flags);
}

// ---------------------------------------------------------------------------
// Brush commands
// ---------------------------------------------------------------------------

/** CreateBrush( red#=255,green#=255,blue#=255 ) */
export function CreateBrush(r = 255, g = 255, b = 255): Brush {
	const br = new Brush();
	br.r = r * ctof;
	br.g = g * ctof;
	br.b = b * ctof;
	W().brushes.add(br);
	return br;
}

/** LoadBrush( file$,texture_flags=1,u_scale#=1,v_scale#=1 ) */
export function LoadBrush(file: string, flags = 1, u_scale = 1, v_scale = 1): Brush | null {
	const t = LoadTexture(file, flags);
	if (!t) return null;
	if (u_scale !== 1 || v_scale !== 1) ScaleTexture(t, u_scale, v_scale);
	const br = CreateBrush(255, 255, 255);
	br.setTexture(0, t.handle(0));
	return br;
}

export function FreeBrush(b: Brush | null): void {
	if (!b) return;
	W().brushes.delete(b);
}

export function BrushColor(br: Brush | null, r: number, g: number, b: number): void {
	const q = B(br);
	q.r = r * ctof;
	q.g = g * ctof;
	q.b = b * ctof;
}
export function BrushAlpha(b: Brush | null, alpha: number): void {
	B(b).alpha = alpha;
}
export function BrushShininess(b: Brush | null, n: number): void {
	B(b).shininess = n;
}
/** BrushTexture brush,texture,frame=0,index=0 */
export function BrushTexture(b: Brush | null, t: Texture | null, frame = 0, index = 0): void {
	B(b).setTexture(index, T(t).handle(frame));
}
/** GetBrushTexture( brush,index=0 ): a new handle to the texture of a brush layer. */
export function GetBrushTexture(b: Brush | null, index = 0): Texture | null {
	const h = B(b).texs[index];
	if (!h) return null;
	return new Texture(W().textures.repOf(h));
}
export function BrushBlend(b: Brush | null, blend: number): void {
	B(b).blend = blend;
}
export function BrushFX(b: Brush | null, fx: number): void {
	B(b).fx = fx;
}

// ---------------------------------------------------------------------------
// Mesh commands
// ---------------------------------------------------------------------------

/** CreateMesh( parent=0 ) */
export function CreateMesh(parent: Handle = null): BBEntity {
	return W().createMesh(new MeshModel(), P(parent));
}

/** LoadMesh( file$,parent=0 ): the whole file collapsed into one mesh; null when it cannot be loaded. */
export function LoadMesh(file: string, parent: Handle = null): Handle {
	return W().loadMesh(file, P(parent));
}

/** LoadAnimMesh( file$,parent=0 ): the file's node hierarchy, bones and animation. */
export function LoadAnimMesh(file: string, parent: Handle = null): Handle {
	return W().loadAnimMesh(file, P(parent));
}

/** LoadAnimSeq( entity,file$ ): appends the sequences of another file; returns the last sequence index, -1 without animation. */
export function LoadAnimSeq(o: Handle, file: string): number {
	const h = E(o);
	const anim = h.animator;
	if (!anim) return -1;
	const w = W();
	const model = w.resources.model(file);
	const brushes = w.resources.brushes(file, w.textures);
	if (model && brushes) {
		const p = getAnimator(createAnimMesh(model, brushes));
		if (p) anim.addSeqs(p);
	}
	return anim.numSeqs() - 1;
}

export function CreateCube(parent: Handle = null): BBEntity {
	return W().createMesh(createCube(), P(parent));
}
/** CreateSphere( segments=8,parent=0 ) */
export function CreateSphere(segments = 8, parent: Handle = null): BBEntity {
	if (segments < 2 || segments > 100) throw new Error('Illegal number of segments');
	return W().createMesh(createSphere(segments), P(parent));
}
/** CreateCylinder( segments=8,solid=1,parent=0 ) */
export function CreateCylinder(segments = 8, solid: number | boolean = 1, parent: Handle = null): BBEntity {
	if (segments < 3 || segments > 100) throw new Error('Illegal number of segments');
	return W().createMesh(createCylinder(segments, !!solid), P(parent));
}
/** CreateCone( segments=8,solid=1,parent=0 ) */
export function CreateCone(segments = 8, solid: number | boolean = 1, parent: Handle = null): BBEntity {
	if (segments < 3 || segments > 100) throw new Error('Illegal number of segments');
	return W().createMesh(createCone(segments, !!solid), P(parent));
}

/** CopyMesh( mesh,parent=0 ): a new, independent mesh with the surfaces of `mesh` (default entity brush and transform). */
export function CopyMesh(m: Handle, parent: Handle = null): BBEntity {
	const t = new MeshModel();
	t.add(M(m));
	return W().createMesh(t, P(parent));
}

export function ScaleMesh(m: Handle, x: number, y: number, z: number): void {
	M(m).transform(new Transform(scaleMatrix(x, y, z)));
}
export function RotateMesh(m: Handle, pitch: number, yaw: number, roll: number): void {
	M(m).transform(new Transform(rotationMatrix(pitch * dtor, yaw * dtor, roll * dtor)));
}
export function PositionMesh(m: Handle, x: number, y: number, z: number): void {
	const t = new Transform();
	t.v = new Vector(x, y, z);
	M(m).transform(t);
}

/** FitMesh mesh,x#,y#,z#,width#,height#,depth#,uniform=0 */
export function FitMesh(m: Handle, x: number, y: number, z: number, w: number, h: number, d: number, uniform = 0): void {
	const mesh = M(m);
	const box = new Box(new Vector(x, y, z));
	box.update(new Vector(x + w, y + h, z + d));
	const curr = mesh.getBox();
	let x_scale = box.width() / curr.width();
	let y_scale = box.height() / curr.height();
	let z_scale = box.depth() / curr.depth();
	if (uniform) {
		if (x_scale < y_scale && x_scale < z_scale) y_scale = z_scale = x_scale;
		else if (y_scale < x_scale && y_scale < z_scale) x_scale = z_scale = y_scale;
		else x_scale = y_scale = z_scale;
	}
	const t = new Transform(scaleMatrix(x_scale, y_scale, z_scale));
	const centre = (b: Box) => b.a.add(b.b).mul(0.5);
	t.v = centre(box).sub(t.m.mulVec(centre(curr)));
	mesh.transform(t);
}

export function FlipMesh(m: Handle): void {
	M(m).flip();
}
export function PaintMesh(m: Handle, b: Brush | null): void {
	M(m).paint(B(b));
}
/** AddMesh source_mesh,dest_mesh */
export function AddMesh(src: Handle, dest: Handle): void {
	const s = M(src);
	const d = M(dest);
	if (s === d) throw new Error('A mesh cannot be added to itself');
	d.add(s);
}
export function UpdateNormals(m: Handle): void {
	M(m).updateNormals();
}

/** LightMesh mesh,red#,green#,blue#,range#=0,x#=0,y#=0,z#=0 (MeshUtil::lightMesh) */
export function LightMesh(m: Handle, r: number, g: number, b: number, range = 0, x = 0, y = 0, z = 0): void {
	const rgb = [r * ctof, g * ctof, b * ctof];
	for (const s of M(m).surfaces) {
		for (let j = 0; j < s.numVertices(); j++) {
			let i = 1;
			if (range) {
				const lv = new Vector(x - s.coords[j * 3], y - s.coords[j * 3 + 1], z - s.coords[j * 3 + 2]);
				const n = new Vector(s.normals[j * 3], s.normals[j * 3 + 1], s.normals[j * 3 + 2]).normalized();
				const dp = n.dot(lv);
				if (!(dp > 0)) continue;
				const d = lv.length();
				i = (1 / (d * (1 / range))) * (dp / d);
			}
			// Surface::getColor / setColor( n,Vector ): alpha becomes 255
			const c = s.colors[j];
			const ch = (shift: number, add: number) => {
				const v = Math.floor((((c >>> shift) & 255) / 255 + add * i) * 255);
				return v < 0 ? 0 : v > 255 ? 255 : v;
			};
			s.setColor(j, (0xff000000 | (ch(16, rgb[0]) << 16) | (ch(8, rgb[1]) << 8) | ch(0, rgb[2])) >>> 0);
		}
	}
}

/** MeshWidth#( mesh ): extent of the mesh's own vertices, unscaled. */
export function MeshWidth(m: Handle): number {
	return M(m).getBox().width();
}
export function MeshHeight(m: Handle): number {
	return M(m).getBox().height();
}
export function MeshDepth(m: Handle): number {
	return M(m).getBox().depth();
}

/** MeshesIntersect( mesh_a,mesh_b ): triangle against triangle (MeshModel::intersects). */
export function MeshesIntersect(a: Handle, b: Handle): number {
	const ea = E(a);
	const eb = E(b);
	const t = eb.ent.getWorldTform().inverse().mul(ea.ent.getWorldTform());
	return M(a).getCollider().intersects(M(b).getCollider(), t) ? 1 : 0;
}

export function CountSurfaces(m: Handle): number {
	return M(m).countSurfaces();
}
/** GetSurface( mesh,surface_index ): index counts from 1. */
export function GetSurface(m: Handle, index: number): Surface {
	const s = M(m).surfaces[index - 1];
	if (!s) throw new Error('Surface Index out of range');
	return s;
}
/** MeshCullBox: Three culls with the bounds of the geometry. */
export function MeshCullBox(_m: Handle, _x: number, _y: number, _z: number, _w: number, _h: number, _d: number): void {}

// ---------------------------------------------------------------------------
// Surface commands
// ---------------------------------------------------------------------------

export function FindSurface(m: Handle, b: Brush | null): Surface | null {
	return M(m).findSurface(B(b));
}
/** CreateSurface( mesh,brush=0 ) */
export function CreateSurface(m: Handle, b: Brush | null = null): Surface {
	return M(m).createSurface(b ?? new Brush());
}
export function GetSurfaceBrush(s: Surface): Brush {
	const br = s.brush.clone();
	W().brushes.add(br);
	return br;
}
export function GetEntityBrush(m: Handle): Brush {
	const br = entityBrush(E(m).obj).clone();
	W().brushes.add(br);
	return br;
}
/** ClearSurface surface,clear_vertices=1,clear_triangles=1 */
export function ClearSurface(s: Surface, verts = 1, tris = 1): void {
	s.clear(!!verts, !!tris);
}
export function PaintSurface(s: Surface, b: Brush | null): void {
	s.setBrush(B(b));
}
/** AddVertex( surface,x#,y#,z#,u#=0,v#=0,w#=1 ): both texture coordinate sets get u,v. */
export function AddVertex(s: Surface, x: number, y: number, z: number, u = 0, v = 0, _w = 1): number {
	return s.addVertex(x, y, z, u, v);
}
export function AddTriangle(s: Surface, v0: number, v1: number, v2: number): number {
	return s.addTriangle(toInt(v0), toInt(v1), toInt(v2));
}
export function VertexCoords(s: Surface, n: number, x: number, y: number, z: number): void {
	s.setCoords(n, x, y, z);
}
export function VertexNormal(s: Surface, n: number, x: number, y: number, z: number): void {
	s.setNormal(n, x, y, z);
}
/** VertexColor surface,index,red#,green#,blue#,alpha#=1 */
export function VertexColor(s: Surface, n: number, r: number, g: number, b: number, a = 1): void {
	if (r < 0) r = 0;
	else if (r > 255) r = 255;
	if (g < 0) g = 0;
	else if (g > 255) g = 255;
	if (b < 0) b = 0;
	else if (b > 255) b = 255;
	a *= 255;
	if (a < 0) a = 0;
	else if (a > 255) a = 255;
	s.setColor(n, ((Math.trunc(a) << 24) | (Math.trunc(r) << 16) | (Math.trunc(g) << 8) | Math.trunc(b)) >>> 0);
}
/** VertexTexCoords surface,index,u#,v#,w#=1,coord_set=0 */
export function VertexTexCoords(s: Surface, n: number, u: number, v: number, _w = 1, set = 0): void {
	s.setTexCoords(n, u, v, set);
}
export function CountVertices(s: Surface): number {
	return s.numVertices();
}
export function CountTriangles(s: Surface): number {
	return s.numTriangles();
}
function vcheck(s: Surface, n: number): void {
	if (n < 0 || n >= s.numVertices()) throw new Error('Vertex index out of range');
}
export function VertexX(s: Surface, n: number): number {
	vcheck(s, n);
	return s.coords[n * 3];
}
export function VertexY(s: Surface, n: number): number {
	vcheck(s, n);
	return s.coords[n * 3 + 1];
}
export function VertexZ(s: Surface, n: number): number {
	vcheck(s, n);
	return s.coords[n * 3 + 2];
}
export function VertexNX(s: Surface, n: number): number {
	vcheck(s, n);
	return s.normals[n * 3];
}
export function VertexNY(s: Surface, n: number): number {
	vcheck(s, n);
	return s.normals[n * 3 + 1];
}
export function VertexNZ(s: Surface, n: number): number {
	vcheck(s, n);
	return s.normals[n * 3 + 2];
}
export function VertexRed(s: Surface, n: number): number {
	vcheck(s, n);
	return (s.colors[n] >>> 16) & 255;
}
export function VertexGreen(s: Surface, n: number): number {
	vcheck(s, n);
	return (s.colors[n] >>> 8) & 255;
}
export function VertexBlue(s: Surface, n: number): number {
	vcheck(s, n);
	return s.colors[n] & 255;
}
export function VertexAlpha(s: Surface, n: number): number {
	vcheck(s, n);
	return (s.colors[n] >>> 24) / 255.0;
}
export function VertexU(s: Surface, n: number, set = 0): number {
	vcheck(s, n);
	return (set ? s.uv1 : s.uv0)[n * 2];
}
export function VertexV(s: Surface, n: number, set = 0): number {
	vcheck(s, n);
	return (set ? s.uv1 : s.uv0)[n * 2 + 1];
}
export function VertexW(_s: Surface, _n: number, _set = 0): number {
	return 1;
}
/** TriangleVertex( surface,index,vertex ) */
export function TriangleVertex(s: Surface, n: number, v: number): number {
	return s.tris[n * 3 + v];
}

// ---------------------------------------------------------------------------
// Camera commands
// ---------------------------------------------------------------------------

function CAM(c: Handle): BBEntity {
	const h = E(c);
	if (!h.camera || !h.ent.camera) throw new Error('Entity is not a camera');
	return h;
}

/** CreateCamera( parent=0 ): zoom 1, range 1..1000, viewport = the whole screen, black, no fog. */
export function CreateCamera(parent: Handle = null): BBEntity {
	return W().createCamera(P(parent));
}
export function CameraZoom(c: Handle, zoom: number): void {
	const h = CAM(c);
	C.CameraZoom(h.ent, zoom);
	syncProjection(h);
}
export function CameraRange(c: Handle, near: number, far: number): void {
	const h = CAM(c);
	C.CameraRange(h.ent, near, far);
	syncProjection(h);
}
export function CameraClsColor(c: Handle, r: number, g: number, b: number): void {
	CAM(c).camera!.clsColor = [r * ctof, g * ctof, b * ctof];
}
export function CameraClsMode(c: Handle, cls_color: number | boolean, cls_zbuffer: number | boolean): void {
	const x = CAM(c).camera!;
	x.clsArgb = !!cls_color;
	x.clsZ = !!cls_zbuffer;
}
/** CameraProjMode camera,mode (0 off, 1 perspective, 2 orthographic) */
export function CameraProjMode(c: Handle, mode: number): void {
	const h = CAM(c);
	C.CameraProjMode(h.ent, mode);
	syncProjection(h);
}
/** CameraViewport camera,x,y,width,height in logical screen pixels */
export function CameraViewport(c: Handle, x: number, y: number, w: number, h: number): void {
	const e = CAM(c);
	C.CameraViewport(e.ent, toInt(x), toInt(y), toInt(w), toInt(h));
	syncProjection(e);
}
export function CameraFogColor(c: Handle, r: number, g: number, b: number): void {
	CAM(c).camera!.fogColor = [r * ctof, g * ctof, b * ctof];
}
export function CameraFogRange(c: Handle, near: number, far: number): void {
	const x = CAM(c).camera!;
	x.fogNear = near;
	x.fogFar = far;
}
/** CameraFogMode camera,mode (0 none, 1 linear) */
export function CameraFogMode(c: Handle, mode: number): void {
	CAM(c).camera!.fogMode = mode;
}

/** CameraProject camera,x#,y#,z#: result in ProjectedX/Y/Z (0,0,0 when behind the camera or beyond its range). */
export function CameraProject(c: Handle, x: number, y: number, z: number): number {
	return W().collision.CameraProject(CAM(c).ent, x, y, z);
}
export function ProjectedX(): number {
	return W().collision.ProjectedX();
}
export function ProjectedY(): number {
	return W().collision.ProjectedY();
}
export function ProjectedZ(): number {
	return W().collision.ProjectedZ();
}

/** EntityInView( entity,camera ): the mesh box of a mesh entity, the position of anything else. */
export function EntityInView(e: Handle, c: Handle): number {
	const h = E(e);
	const cam = CAM(c);
	const inv = cam.ent.getWorldTform().inverse();
	const f = getFrustum(cam.ent.camera!);
	if (h.mesh) {
		const b = h.mesh.getBox();
		const t = inv.mul(h.ent.getWorldTform());
		const p: Vector[] = [];
		for (let k = 0; k < 8; ++k) p.push(t.mulVec(b.corner(k)));
		return f.cull(p) ? 1 : 0;
	}
	return f.cull([inv.mulVec(h.ent.getWorldPosition())]) ? 1 : 0;
}

/** EntityVisible( src_entity,dest_entity ): no pickable obscurer between the two positions. */
export function EntityVisible(src: Handle, dest: Handle): number {
	return W().collision.EntityVisible(E(src).ent, E(dest).ent) ? 1 : 0;
}

/** EntityPick( entity,range# ) */
export function EntityPick(src: Handle, range: number): Handle {
	return H(W().collision.EntityPick(E(src).ent, range));
}
/** LinePick( x#,y#,z#,dx#,dy#,dz#,radius#=0 ) */
export function LinePick(x: number, y: number, z: number, dx: number, dy: number, dz: number, radius = 0): Handle {
	return H(W().collision.LinePick(x, y, z, dx, dy, dz, radius));
}
/** CameraPick( camera,viewport_x#,viewport_y# ) */
export function CameraPick(c: Handle, x: number, y: number): Handle {
	return H(W().collision.CameraPick(CAM(c).ent, x, y));
}

/** After a pick that hit nothing these keep the values of the last hit, as in Blitz; PickedEntity is 0. */
export function PickedX(): number {
	return W().collision.PickedX();
}
export function PickedY(): number {
	return W().collision.PickedY();
}
export function PickedZ(): number {
	return W().collision.PickedZ();
}
export function PickedNX(): number {
	return W().collision.PickedNX();
}
export function PickedNY(): number {
	return W().collision.PickedNY();
}
export function PickedNZ(): number {
	return W().collision.PickedNZ();
}
export function PickedTime(): number {
	return W().collision.PickedTime();
}
export function PickedEntity(): Handle {
	return H(W().collision.PickedEntity());
}
export function PickedSurface(): Surface | null {
	const w = W().collision;
	const h = H(w.PickedEntity());
	return h?.mesh ? h.mesh.surfaceOf(w.PickedSurface()) : null;
}
export function PickedTriangle(): number {
	return W().collision.PickedTriangle();
}

// ---------------------------------------------------------------------------
// Light, pivot, sprite, plane, mirror, listener
// ---------------------------------------------------------------------------

/** CreateLight( type=1,parent=0 ): 1 directional (shines along its Z axis), 2 point, 3 spot. */
export function CreateLight(type = 1, parent: Handle = null): BBEntity {
	return W().createLight(type, P(parent));
}
function LIGHT(l: Handle): BBEntity {
	const h = E(l);
	if (!h.light) throw new Error('Entity is not a light');
	return h;
}
export function LightColor(l: Handle, r: number, g: number, b: number): void {
	(LIGHT(l).obj as THREE.Light).color.setRGB(r * ctof, g * ctof, b * ctof);
}
export function LightRange(l: Handle, range: number): void {
	const h = LIGHT(l);
	h.light!.range = range;
	applyLightState(h.obj as THREE.Light, h.light!);
}
/** LightConeAngles light,inner_angle#,outer_angle# (degrees) */
export function LightConeAngles(l: Handle, inner: number, outer: number): void {
	const h = LIGHT(l);
	inner *= dtor;
	outer *= dtor;
	if (inner < 0) inner = 0;
	else if (inner > PI) inner = PI;
	if (outer < inner) outer = inner;
	else if (outer > PI) outer = PI;
	h.light!.inner = inner;
	h.light!.outer = outer;
	applyLightState(h.obj as THREE.Light, h.light!);
}

export function CreatePivot(parent: Handle = null): BBEntity {
	return W().createPivot(P(parent));
}

/** CreateSprite( parent=0 ): full-bright quad of half-size 1, view mode 1. */
export function CreateSprite(parent: Handle = null): BBEntity {
	return W().createSprite(P(parent));
}
/** LoadSprite( file$,texture_flags=1,parent=0 ) */
export function LoadSprite(file: string, flags = 1, parent: Handle = null): Handle {
	const t = LoadTexture(file, flags);
	if (!t) return null;
	const s = CreateSprite(parent);
	EntityTexture(s, t, 0, 0);
	// mask -> BLEND_REPLACE, alpha -> BLEND_ALPHA, else BLEND_ADD
	if (flags & 4) EntityBlend(s, 0);
	else if (flags & 2) EntityBlend(s, 1);
	else EntityBlend(s, 3);
	return s;
}
function SPR(s: Handle): BBEntity {
	const h = E(s);
	if (!h.sprite) throw new Error('Entity is not a sprite');
	return h;
}
export function RotateSprite(s: Handle, angle: number): void {
	SPR(s).sprite!.rot = angle * dtor;
}
export function ScaleSprite(s: Handle, x: number, y: number): void {
	const q = SPR(s).sprite!;
	q.xscale = x;
	q.yscale = y;
}
export function HandleSprite(s: Handle, x: number, y: number): void {
	const q = SPR(s).sprite!;
	q.xhandle = x;
	q.yhandle = y;
}
/** SpriteViewMode sprite,view_mode (1 faces the camera, 2 free, 3 upright, 4 upright 2) */
export function SpriteViewMode(s: Handle, mode: number): void {
	SPR(s).sprite!.viewMode = mode;
}

/** CreateMirror: mirrors are not rendered; the entity exists for hierarchy only. */
export function CreateMirror(parent: Handle = null): BBEntity {
	return W().createPivot(P(parent), 'Mirror');
}

/** CreatePlane( segments=1,parent=0 ): the infinite plane y=0 of the entity, visible from above only. */
export function CreatePlane(segments = 1, parent: Handle = null): BBEntity {
	if (segments < 1 || segments > 20) throw new Error('Illegal number of segments');
	return W().createPlane(segments, P(parent));
}

/** CreateListener( parent,rolloff_factor#=1,doppler_scale#=1,distance_scale#=1 ): a pivot the audio layer reads. */
export function CreateListener(parent: Handle, rolloff = 1, doppler = 1, distance = 1): BBEntity {
	const w = W();
	const h = w.createPivot(P(parent), 'Listener');
	h.userData = { rolloff, doppler, distance };
	w.listener = h;
	return h;
}

// ---------------------------------------------------------------------------
// Terrain commands
// ---------------------------------------------------------------------------

function TER(t: Handle): BBEntity {
	const h = E(t);
	if (!h.terrain) throw new Error('Entity is not a terrain');
	return h;
}

/** CreateTerrain( grid_size,parent=0 ): grid_size must be a power of two; all heights 0. */
export function CreateTerrain(grid_size: number, parent: Handle = null): BBEntity {
	return W().createTerrain(toInt(grid_size), P(parent));
}

/** LoadTerrain( heightmap_file$,parent=0 ): height = brightest channel / 255. */
export function LoadTerrain(file: string, parent: Handle = null): Handle {
	const w = W();
	const img = w.resources.pixels(file);
	if (!img) throw new Error('Unable to load heightmap image');
	if (img.width !== img.height) throw new Error('Terrain must be square');
	const t = w.createTerrain(img.width, P(parent));
	const size = img.height;
	for (let y = 0; y < size; ++y) {
		for (let x = 0; x < size; ++x) {
			const o = (y * size + x) * 4;
			const p = Math.max(img.data[o], img.data[o + 1], img.data[o + 2]) / 255.0;
			t.terrain!.setHeight(x, size - 1 - y, p);
		}
	}
	return t;
}

/** TerrainDetail terrain,detail_level,morph=0: stored; the terrain is always drawn at full detail. */
export function TerrainDetail(t: Handle, detail: number, morph = 0): void {
	const s = TER(t).terrain!;
	s.detail = detail;
	s.morph = !!morph;
}
export function TerrainShading(t: Handle, enable: number | boolean): void {
	TER(t).terrain!.setShading(!!enable);
}
/** TerrainX#( terrain,world_x#,world_y#,world_z# ) */
export function TerrainX(t: Handle, x: number, y: number, z: number): number {
	return C.TerrainX(TER(t).ent, x, y, z);
}
/** TerrainY#( terrain,world_x#,world_y#,world_z# ): bilinear height in world space, 0 height outside the grid. */
export function TerrainY(t: Handle, x: number, y: number, z: number): number {
	return C.TerrainY(TER(t).ent, x, y, z);
}
export function TerrainZ(t: Handle, x: number, y: number, z: number): number {
	return C.TerrainZ(TER(t).ent, x, y, z);
}
export function TerrainSize(t: Handle): number {
	return TER(t).terrain!.size;
}
/** TerrainHeight#( terrain,terrain_x,terrain_z ): 0..1 in steps of 1/255. */
export function TerrainHeight(t: Handle, x: number, z: number): number {
	return TER(t).terrain!.collider.getHeight(toInt(x), toInt(z));
}
/** ModifyTerrain terrain,terrain_x,terrain_z,height#,realtime=0 */
export function ModifyTerrain(t: Handle, x: number, z: number, h: number, _realtime = 0): void {
	TER(t).terrain!.setHeight(toInt(x), toInt(z), h);
}

// ---------------------------------------------------------------------------
// Entity commands
// ---------------------------------------------------------------------------

/** CopyEntity( entity,parent=0 ): shares mesh data; own transform, brush and animation state; shown. */
export function CopyEntity(e: Handle, parent: Handle = null): BBEntity {
	return W().copyEntity(E(e), P(parent));
}

/** FreeEntity entity (and all its children). Freeing 0 or an already freed entity does nothing. */
export function FreeEntity(e: Handle): void {
	if (!e || e.freed) return;
	e.world.freeEntity(e);
}

export function HideEntity(e: Handle): void {
	const h = E(e);
	C.HideEntity(h.ent);
	h.obj.visible = false;
	h.proxy?.onVisible?.(false);
}

/** ShowEntity (also resets the entity's collision state, as Blitz does) */
export function ShowEntity(e: Handle): void {
	const h = E(e);
	C.ShowEntity(h.ent);
	h.obj.visible = true;
	h.proxy?.onVisible?.(true);
}

/** EntityParent entity,parent,global=1 */
export function EntityParent(e: Handle, parent: Handle, global = 1): void {
	const h = E(e);
	const p = P(parent);
	if (h.ent.getParent() === (p ? p.ent : null)) return;
	for (let t = p; t; t = t.parent) {
		if (t === h) throw new Error('Entity cannot be parented to itself!');
	}
	C.EntityParent(h.ent, p ? p.ent : null, global);
	(p ? p.obj : h.world.scene).add(h.obj);
	h.sync();
}

export function CountChildren(e: Handle): number {
	return C.CountChildren(E(e).ent);
}
/** GetChild( entity,index ): index counts from 1. */
export function GetChild(e: Handle, index: number): Handle {
	return H(C.GetChild(E(e).ent, index));
}
/** FindChild( entity,name$ ): depth first; the entity itself is tested first. */
export function FindChild(e: Handle, name: string): Handle {
	const find = (q: Entity): Entity | null => {
		if (q.name === name) return q;
		for (let p = q.children(); p; p = p.successor()) {
			const r = find(p);
			if (r) return r;
		}
		return null;
	};
	return H(find(E(e).ent));
}
export function GetParent(e: Handle): Handle {
	return H(E(e).ent.getParent());
}

// ---- animation

/** LoadAnimMesh entities and boned meshes have an animator; Animate on anything else is a runtime error in Blitz. */
export function Animate(o: Handle, mode = 1, speed = 1, seq = 0, trans = 0): void {
	const h = E(o);
	if (!h.animator) throw new Error('Entity has no animation');
	animAnimate(h.obj, mode, speed, seq, trans);
	h.world.pullAnimated(h.animator);
}
/** SetAnimTime entity,time#,anim_seq=0 */
export function SetAnimTime(o: Handle, time: number, seq = 0): void {
	const h = E(o);
	if (!h.animator) throw new Error('Entity has not animation');
	animSetAnimTime(h.obj, time, seq);
	h.world.pullAnimated(h.animator);
}
/** SetAnimKey: per-entity key frames (for AddAnimSeq) are not implemented. */
export function SetAnimKey(_o: Handle, _frame: number, _pos_key = 1, _rot_key = 1, _scale_key = 1): void {}
/** AddAnimSeq( entity,length ) */
export function AddAnimSeq(o: Handle, length: number): number {
	const h = E(o);
	animAddAnimSeq(h.obj, length);
	h.animator = getAnimator(h.obj) ?? null;
	return h.animator ? h.animator.numSeqs() - 1 : -1;
}
/** ExtractAnimSeq( entity,first_frame,last_frame,anim_seq=0 ): the new sequence index, -1 without animation. */
export function ExtractAnimSeq(o: Handle, first: number, last: number, seq = 0): number {
	const a = E(o).animator;
	return a ? a.extractSeq(first, last, seq) : -1;
}
export function AnimSeq(o: Handle): number {
	return E(o).animator?.animSeq() ?? -1;
}
export function AnimTime(o: Handle): number {
	return E(o).animator?.animTime() ?? -1;
}
export function AnimLength(o: Handle): number {
	return E(o).animator?.animLen() ?? -1;
}
export function Animating(o: Handle): number {
	return E(o).animator?.animating() ? 1 : 0;
}

// ---- entity special fx (models only; ignored for pivots, cameras, lights)

export function PaintEntity(m: Handle, b: Brush | null): void {
	const h = E(m);
	if (h.isModel && !h.proxy) paintEntity(h.obj, B(b));
}
export function EntityColor(m: Handle, r: number, g: number, b: number): void {
	const h = E(m);
	if (h.isModel && !h.proxy) entityColor(h.obj, r, g, b);
}
export function EntityAlpha(m: Handle, alpha: number): void {
	const h = E(m);
	if (h.proxy) h.proxy.onAlpha?.(alpha);
	else if (h.isModel) entityAlpha(h.obj, alpha);
}
export function EntityShininess(m: Handle, shininess: number): void {
	const h = E(m);
	if (h.isModel && !h.proxy) entityShininess(h.obj, shininess);
}
/** EntityTexture entity,texture,frame=0,index=0 */
export function EntityTexture(m: Handle, t: Texture | null, frame = 0, index = 0): void {
	const h = E(m);
	const tex = T(t);
	if (!h.isModel || h.proxy) return;
	entityBrush(h.obj).setTexture(index, tex.handle(frame));
	refreshEntity(h.obj);
}
/** EntityBlend entity,blend (1 alpha, 2 multiply, 3 add) */
export function EntityBlend(m: Handle, blend: number): void {
	const h = E(m);
	if (h.isModel && !h.proxy) entityBlend(h.obj, blend);
}
/** EntityFX entity,fx (1 full-bright, 2 vertex colours, 4 flat, 8 no fog, 16 two-sided, 32 vertex alpha) */
export function EntityFX(m: Handle, fx: number): void {
	const h = E(m);
	if (h.isModel && !h.proxy) entityFX(h.obj, fx);
}
/** EntityAutoFade entity,near#,far# */
export function EntityAutoFade(m: Handle, near: number, far: number): void {
	const h = E(m);
	if (!h.isModel || h.proxy) return;
	entityAutoFade(h.obj, near, far);
	h.world.autoFade.add(h);
}
/** EntityOrder entity,order: >0 drawn first, <0 drawn last, both without depth test; cameras render highest first. */
export function EntityOrder(o: Handle, n: number): void {
	const h = E(o);
	h.world.setOrder(h, toInt(n));
}

// ---- entity properties

export function EntityX(e: Handle, global = 0): number {
	return C.EntityX(E(e).ent, global);
}
export function EntityY(e: Handle, global = 0): number {
	return C.EntityY(E(e).ent, global);
}
export function EntityZ(e: Handle, global = 0): number {
	return C.EntityZ(E(e).ent, global);
}
export function EntityPitch(e: Handle, global = 0): number {
	return C.EntityPitch(E(e).ent, global);
}
export function EntityYaw(e: Handle, global = 0): number {
	return C.EntityYaw(E(e).ent, global);
}
export function EntityRoll(e: Handle, global = 0): number {
	return C.EntityRoll(E(e).ent, global);
}
export function GetMatElement(e: Handle, row: number, col: number): number {
	return C.GetMatElement(E(e).ent, row, col);
}
/** TFormPoint x#,y#,z#,source_entity,dest_entity (0 = world space) */
export function TFormPoint(x: number, y: number, z: number, src: Handle, dest: Handle): void {
	C.TFormPoint(x, y, z, P(src)?.ent ?? null, P(dest)?.ent ?? null);
}
export function TFormVector(x: number, y: number, z: number, src: Handle, dest: Handle): void {
	C.TFormVector(x, y, z, P(src)?.ent ?? null, P(dest)?.ent ?? null);
}
export function TFormNormal(x: number, y: number, z: number, src: Handle, dest: Handle): void {
	C.TFormNormal(x, y, z, P(src)?.ent ?? null, P(dest)?.ent ?? null);
}
export const TFormedX = C.TFormedX;
export const TFormedY = C.TFormedY;
export const TFormedZ = C.TFormedZ;
export const VectorYaw = C.VectorYaw;
export const VectorPitch = C.VectorPitch;
export function DeltaYaw(src: Handle, dest: Handle): number {
	return C.DeltaYaw(E(src).ent, E(dest).ent);
}
export function DeltaPitch(src: Handle, dest: Handle): number {
	return C.DeltaPitch(E(src).ent, E(dest).ent);
}

// ---- entity collision

export function ResetEntity(o: Handle): void {
	C.ResetEntity(E(o).ent);
}

/** EntityType entity,collision_type,recursive=0 */
export function EntityType(o: Handle, type: number, recursive = 0): void {
	const h = E(o);
	C.EntityType(h.ent, type, recursive);
	const mark = (q: BBEntity) => {
		if (type) q.world.collidable.add(q);
		else q.world.collidable.delete(q);
		if (recursive) for (const c of q.children()) mark(c);
	};
	mark(h);
}
/** EntityPickMode entity,pick_geometry,obscurer=1 (0 none, 1 sphere, 2 polygon, 3 box) */
export function EntityPickMode(o: Handle, mode: number, obscurer: number | boolean = 1): void {
	C.EntityPickMode(E(o).ent, mode, obscurer);
}
export function GetEntityType(o: Handle): number {
	return C.GetEntityType(E(o).ent);
}
/** EntityRadius entity,x_radius#,y_radius#=0 */
export function EntityRadius(o: Handle, x_radius: number, y_radius = 0): void {
	C.EntityRadius(E(o).ent, x_radius, y_radius);
}
export function EntityBox(o: Handle, x: number, y: number, z: number, w: number, h: number, d: number): void {
	C.EntityBox(E(o).ent, x, y, z, w, h, d);
}
/** EntityCollided( entity,type ): the first entity of that type collided with in the last UpdateWorld, or 0. */
export function EntityCollided(o: Handle, type: number): Handle {
	return H(C.EntityCollided(E(o).ent, type));
}
export function CountCollisions(o: Handle): number {
	return C.CountCollisions(E(o).ent);
}
/** Collision indices count from 1. */
export function CollisionX(o: Handle, index: number): number {
	return C.CollisionX(E(o).ent, index);
}
export function CollisionY(o: Handle, index: number): number {
	return C.CollisionY(E(o).ent, index);
}
export function CollisionZ(o: Handle, index: number): number {
	return C.CollisionZ(E(o).ent, index);
}
export function CollisionNX(o: Handle, index: number): number {
	return C.CollisionNX(E(o).ent, index);
}
export function CollisionNY(o: Handle, index: number): number {
	return C.CollisionNY(E(o).ent, index);
}
export function CollisionNZ(o: Handle, index: number): number {
	return C.CollisionNZ(E(o).ent, index);
}
export function CollisionTime(o: Handle, index: number): number {
	return C.CollisionTime(E(o).ent, index);
}
export function CollisionEntity(o: Handle, index: number): Handle {
	return H(C.CollisionEntity(E(o).ent, index));
}
export function CollisionSurface(o: Handle, index: number): Surface | null {
	const h = E(o);
	const other = H(C.CollisionEntity(h.ent, index));
	const value = C.CollisionSurface(h.ent, index);
	// The triangle belongs to whichever of the two is the polygon mesh.
	return other?.mesh?.surfaceOf(value) ?? h.mesh?.surfaceOf(value) ?? null;
}
export function CollisionTriangle(o: Handle, index: number): number {
	return C.CollisionTriangle(E(o).ent, index);
}
export function EntityDistance(src: Handle, dest: Handle): number {
	return C.EntityDistance(E(src).ent, E(dest).ent);
}

// ---- entity transformation

/** MoveEntity entity,x#,y#,z#: along the entity's own axes (unaffected by its scale). */
export function MoveEntity(e: Handle, x: number, y: number, z: number): void {
	const h = E(e);
	C.MoveEntity(h.ent, x, y, z);
	h.sync();
}
export function TurnEntity(e: Handle, pitch: number, yaw: number, roll: number, global = 0): void {
	const h = E(e);
	C.TurnEntity(h.ent, pitch, yaw, roll, global);
	h.sync();
}
export function TranslateEntity(e: Handle, x: number, y: number, z: number, global = 0): void {
	const h = E(e);
	C.TranslateEntity(h.ent, x, y, z, global);
	h.sync();
}
export function PositionEntity(e: Handle, x: number, y: number, z: number, global = 0): void {
	const h = E(e);
	C.PositionEntity(h.ent, x, y, z, global);
	h.sync();
}
export function ScaleEntity(e: Handle, x: number, y: number, z: number, global = 0): void {
	const h = E(e);
	C.ScaleEntity(h.ent, x, y, z, global);
	h.sync();
}
export function RotateEntity(e: Handle, pitch: number, yaw: number, roll: number, global = 0): void {
	const h = E(e);
	C.RotateEntity(h.ent, pitch, yaw, roll, global);
	h.sync();
}
/** PointEntity entity,target,roll#=0 */
export function PointEntity(e: Handle, target: Handle, roll = 0): void {
	const h = E(e);
	C.PointEntity(h.ent, E(target).ent, roll);
	h.sync();
}
/** AlignToVector entity,vector_x#,vector_y#,vector_z#,axis,rate#=1 */
export function AlignToVector(e: Handle, x: number, y: number, z: number, axis: number, rate = 1): void {
	const h = E(e);
	C.AlignToVector(h.ent, x, y, z, axis, rate);
	h.sync();
}

// ---- misc

export function NameEntity(e: Handle, name: string): void {
	const h = E(e);
	h.ent.name = name;
	h.obj.name = name;
}
export function EntityName(e: Handle): string {
	return E(e).ent.name;
}
/** EntityClass$( entity ): Pivot, Light, Camera, Mirror, Listener, Sprite, Terrain, Plane or Mesh. */
export function EntityClass(e: Handle): string {
	return E(e).cls;
}

// ---------------------------------------------------------------------------
// Not Blitz: access for engine code
// ---------------------------------------------------------------------------

/** The THREE object an entity renders with. */
export function EntityObject(e: Handle): THREE.Object3D {
	return E(e).obj;
}
/** The BlitzCamera of a camera entity (for modules that take a THREE camera). */
export function CameraObject(c: Handle): BlitzCamera {
	return CAM(c).obj as BlitzCamera;
}
/** The entity a THREE object belongs to, or null. */
export function EntityHandle(obj: THREE.Object3D): Handle {
	return handleOf(obj);
}
/** True for a handle that can be used: not 0 and not freed. */
export function EntityExists(e: Handle): boolean {
	return !!e && !e.freed;
}

export { TerrainState };
