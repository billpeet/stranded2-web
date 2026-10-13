import * as THREE from 'three';
import { BlitzCamera, toThreeWinding } from '../blitzSpace';

/**
 * Three.js stand-ins for the Blitz3D entity types the environment uses.
 * Behaviour follows the Blitz3D source (github.com/blitz-research/blitz3d):
 * blitz3d/planemodel.cpp, sprite.cpp, model.cpp, world.cpp, frustum.cpp,
 * texture.cpp and gxruntime/gxscene.cpp.
 */

// The fog patch lives in blitzSpace.ts (configureRenderer installs it) and the
// draw order helpers in bb3d/drawOrder.ts; both are re-exported here for the
// environment module and its callers.
export { installBlitzFog, NO_FOG_FAR, NO_FOG_NEAR } from '../blitzSpace';
export { makeBlitzTransparentSort, renderOrderFor } from '../../bb3d/drawOrder';

/**
 * Frustum::cull for camera-space points: true unless every point is outside
 * the same plane. `ar` is viewport height / width.
 */
export function frustumCull(
	pts: readonly THREE.Vector3[],
	nr: number,
	fr: number,
	zoom: number,
	ar: number
): boolean {
	const kx = 1 / zoom;
	const ky = ar / zoom;
	for (let n = 0; n < 6; n++) {
		let k = 0;
		for (; k < pts.length; k++) {
			const v = pts[k];
			let d: number;
			switch (n) {
				case 0:
					d = v.z * ky - v.y; // top
					break;
				case 1:
					d = v.x + v.z * kx; // left
					break;
				case 2:
					d = v.y + v.z * ky; // bottom
					break;
				case 3:
					d = v.z * kx - v.x; // right
					break;
				case 4:
					d = v.z - nr; // near
					break;
				default:
					d = fr - v.z; // far
			}
			if (!(d < 0)) break;
		}
		if (k === pts.length) return false;
	}
	return true;
}

const _inv = new THREE.Matrix4();
const _corners = Array.from({ length: 8 }, () => new THREE.Vector3());
const _p = [new THREE.Vector3()];

/** EntityInView(mesh,cam): the mesh's bounding box corners against the camera frustum. */
export function boxInView(camera: BlitzCamera, box: THREE.Box3, x: number, y: number, z: number): boolean {
	_inv.copy(camera.matrixWorld).invert();
	let i = 0;
	for (const cx of [box.min.x, box.max.x]) {
		for (const cy of [box.min.y, box.max.y]) {
			for (const cz of [box.min.z, box.max.z]) {
				_corners[i++].set(cx + x, cy + y, cz + z).applyMatrix4(_inv);
			}
		}
	}
	return frustumCull(_corners, camera.near, camera.far, camera.blitzZoom, 1 / camera.aspect);
}

/** EntityInView(pivot,cam): a single point against the camera frustum. */
export function pointInView(camera: BlitzCamera, x: number, y: number, z: number): boolean {
	_inv.copy(camera.matrixWorld).invert();
	_p[0].set(x, y, z).applyMatrix4(_inv);
	return frustumCull(_p, camera.near, camera.far, camera.blitzZoom, 1 / camera.aspect);
}

/**
 * CameraProject cam,x,y,z (bbCameraProject, perspective): returns
 * ProjectedX/ProjectedY in viewport pixels, or 0,0 when the point is behind
 * the camera or beyond the far plane.
 */
export function cameraProject(
	camera: BlitzCamera,
	x: number,
	y: number,
	z: number,
	vp_w: number,
	vp_h: number
): [number, number] {
	_inv.copy(camera.matrixWorld).invert();
	const v = _p[0].set(x, y, z).applyMatrix4(_inv);
	if (v.z > 0 && v.z <= camera.far) {
		const nr = camera.near;
		const nr_w = (nr * 2) / camera.blitzZoom;
		const nr_h = ((nr * 2) / camera.blitzZoom) * (vp_h / vp_w);
		return [((v.x * nr) / v.z / nr_w + 0.5) * vp_w, (0.5 - (v.y * nr) / v.z / nr_h) * vp_h];
	}
	return [0, 0];
}

/**
 * Texture matrix as Blitz3D builds it (Texture::getMatrix with the argument
 * conversions of ScaleTexture, RotateTexture and PositionTexture):
 *   u' = (u*c + v*s)/scaleU - posU      c = cos(-angle), s = sin(-angle)
 *   v' = (-u*s + v*c)/scaleV - posV
 * `ou`,`ov` are added to the incoming coordinates first (used by planes whose
 * mesh follows the camera).
 */
export function setBlitzTextureMatrix(
	tex: THREE.Texture,
	scaleU: number,
	scaleV: number,
	angleDeg: number,
	posU: number,
	posV: number,
	ou = 0,
	ov = 0
): void {
	const rot = (-angleDeg * Math.PI) / 180;
	const c = Math.cos(rot);
	const s = Math.sin(rot);
	const sx = 1 / scaleU;
	const sy = 1 / scaleV;
	let tu = sx * (ou * c + ov * s) - posU;
	let tv = sy * (-ou * s + ov * c) - posV;
	// Keep the offset small for precision; only valid because these textures repeat.
	if (tex.wrapS === THREE.RepeatWrapping) tu -= Math.floor(tu);
	if (tex.wrapT === THREE.RepeatWrapping) tv -= Math.floor(tv);
	tex.matrixAutoUpdate = false;
	tex.matrix.set(sx * c, sx * s, tu, -sy * s, sy * c, tv, 0, 0, 1);
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();

/**
 * CreatePlane: an infinite plane through the entity origin with normal +Y,
 * visible only from the side the normal points to (PlaneModel::Rep::render
 * returns when the eye's local y is <= 0, even for double-sided brushes).
 *
 * Blitz builds the visible part from the frustum corners every frame with
 * texture coordinates equal to the plane-local x/z. Here a large quad follows
 * the camera and the texture matrix supplies the missing offset, which gives
 * the same picture as long as the quad reaches past the far clip plane.
 */
export class BlitzPlane {
	readonly mesh: THREE.Mesh;
	/** Entity position (PositionEntity). */
	readonly position = new THREE.Vector3();
	/** Entity roll in degrees (RotateEntity plane,0,0,roll). */
	roll = 0;
	/** Offset to add to the mesh-local x/z to get plane-local texture coordinates. */
	ou = 0;
	ov = 0;

	constructor(material: THREE.Material, halfSize = 8000) {
		const s = halfSize;
		const geo = new THREE.BufferGeometry();
		geo.setAttribute(
			'position',
			new THREE.Float32BufferAttribute([-s, 0, -s, -s, 0, s, s, 0, s, s, 0, -s], 3)
		);
		geo.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
		geo.setAttribute('uv', new THREE.Float32BufferAttribute([-s, -s, -s, s, s, s, s, -s], 2));
		// Clockwise seen from above (the plane's front) in Blitz space, same as the terrain.
		geo.setIndex(toThreeWinding([0, 1, 2, 0, 2, 3]));
		this.mesh = new THREE.Mesh(geo, material);
		this.mesh.frustumCulled = false;
	}

	/** Moves the quad under the camera and recomputes the texture coordinate offset. */
	follow(camX: number, camZ: number): void {
		const m = this.mesh;
		m.rotation.set(0, 0, (this.roll * Math.PI) / 180);
		// Slide the quad inside the plane: along world X/Z for roll 0 or 180.
		m.position.set(camX, this.position.y, camZ);
		// Plane-local coordinates of the quad centre.
		_q.copy(m.quaternion).invert();
		_v.set(camX - this.position.x, 0, camZ - this.position.z).applyQuaternion(_q);
		this.ou = _v.x;
		this.ov = _v.z;
		m.userData.blitzOrigin = this.position;
	}
}

/**
 * CreateSprite, SpriteViewMode 1 (the default): a quad of half-size
 * (xscale, yscale) that takes the rendering camera's orientation, whatever
 * its parent's rotation or scale (Sprite::render replaces the matrix).
 */
export class BlitzSprite {
	readonly mesh: THREE.Mesh;
	xscale = 1;
	yscale = 1;
	/** RotateSprite angle in degrees. */
	rot = 0;
	/** World position (after any parenting). */
	readonly position = new THREE.Vector3();

	constructor(material: THREE.Material) {
		const geo = new THREE.BufferGeometry();
		geo.setAttribute('position', new THREE.Float32BufferAttribute([-1, 1, 0, 1, 1, 0, 1, -1, 0, -1, -1, 0], 3));
		geo.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
		geo.setIndex(toThreeWinding([0, 1, 2, 0, 2, 3]));
		const mesh = new THREE.Mesh(geo, material);
		mesh.frustumCulled = false;
		mesh.matrixAutoUpdate = false;
		mesh.matrixWorldAutoUpdate = false;
		mesh.onBeforeRender = (_r, _s, camera) => {
			// t.m = camera matrix * rollMatrix(rot) * scaleMatrix(xscale,yscale,1)
			_q.setFromRotationMatrix(camera.matrixWorld);
			if (this.rot !== 0) {
				_m.makeRotationZ((this.rot * Math.PI) / 180);
				_q.multiply(new THREE.Quaternion().setFromRotationMatrix(_m));
			}
			mesh.matrixWorld.compose(this.position, _q, _v.set(this.xscale, this.yscale, 1));
		};
		this.mesh = mesh;
	}

	/** Keeps the matrix position current for transparent sorting. */
	sync(): void {
		this.mesh.matrixWorld.setPosition(this.position);
	}
}
