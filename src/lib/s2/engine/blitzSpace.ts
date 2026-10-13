import * as THREE from 'three';

/**
 * Bridges Blitz3D's conventions to Three.js so that ported game logic can use
 * the original coordinates, angles and winding unchanged.
 *
 * Blitz3D (Direct3D 7): left-handed, +Z forward, clockwise front faces,
 * UV origin top-left, angles in degrees, colours 0..255 in gamma space.
 *
 * Strategy: the scene graph holds Blitz coordinates verbatim. Only the camera
 * projection mirrors Z (see BlitzCamera), and geometry indices are reversed
 * at creation (see toThreeWinding) so faces stay front-facing.
 */

const FLIP_Z = new THREE.Matrix4().makeScale(1, 1, -1);
const DEG = Math.PI / 180;

/**
 * Camera that looks down +Z in a left-handed world, like Blitz3D's.
 * CameraZoom semantics: tan(horizontal half-angle) = 1/zoom.
 */
export class BlitzCamera extends THREE.PerspectiveCamera {
	blitzZoom = 1;

	constructor(near = 1, far = 1000) {
		super(90, 1, near, far);
	}

	setViewport(width: number, height: number): void {
		this.aspect = width / height;
		this.updateProjectionMatrix();
	}

	override updateProjectionMatrix(): void {
		this.fov = (2 * Math.atan(1 / (this.blitzZoom ?? 1) / this.aspect)) / DEG;
		super.updateProjectionMatrix();
		this.projectionMatrix.multiply(FLIP_Z);
		this.projectionMatrixInverse.copy(this.projectionMatrix).invert();
	}
}

/**
 * RotateEntity pitch, yaw, roll.
 * Blitz composes yaw * pitch * roll with its conjugate quaternion convention
 * (blitz3d/geom.h: pitchQuat(p/-2), yawQuat(y/2), rollQuat(r/-2)), which in
 * standard right-hand-rule matrices is Ry(-yaw) * Rx(pitch) * Rz(roll).
 */
export function rotateEntity(o: THREE.Object3D, pitch: number, yaw: number, roll: number): void {
	o.rotation.set(pitch * DEG, -yaw * DEG, roll * DEG, 'YXZ');
}

/** EntityPitch/EntityYaw/EntityRoll for an object whose rotation was set via rotateEntity. */
export function entityAngles(o: THREE.Object3D): { pitch: number; yaw: number; roll: number } {
	const e = new THREE.Euler().setFromQuaternion(o.quaternion, 'YXZ');
	return { pitch: e.x / DEG, yaw: -e.y / DEG, roll: e.z / DEG };
}

/** Blitz/B3D quaternion (w, x, y, z) to a Three.js quaternion. */
export function blitzQuat(q: readonly [number, number, number, number]): THREE.Quaternion {
	return new THREE.Quaternion(-q[1], -q[2], -q[3], q[0]);
}

/** Reverses triangle winding in place (Blitz clockwise fronts to GL counter-clockwise). */
export function toThreeWinding<T extends Uint16Array | Uint32Array | number[]>(indices: T): T {
	for (let i = 0; i + 2 < indices.length; i += 3) {
		const t = indices[i + 1];
		indices[i + 1] = indices[i + 2];
		indices[i + 2] = t;
	}
	return indices;
}

/** Blitz colours are plain 0..255 values with no colour management. */
export function rgb255(r: number, g: number, b: number): THREE.Color {
	return new THREE.Color(r / 255, g / 255, b / 255);
}

/**
 * Three's Lambert model divides by PI; Direct3D's fixed-function lighting
 * does not. Light intensities are scaled by this to compensate.
 */
export const LIGHT_SCALE = Math.PI;

let fogInstalled = false;

/**
 * BlitzCamera looks down +Z, so view-space z is positive in front of the
 * camera and Three's stock `vFogDepth = -mvPosition.z` is negative: no fog at
 * all. Direct3D 7 table fog with WFOG (what gxScene selects) is linear in
 * eye-space depth, which is +mvPosition.z here. (Signed on purpose: the
 * varying must stay linear across triangles that reach behind the camera.)
 * Must run before the first material is compiled; configureRenderer calls it.
 */
export function installBlitzFog(): void {
	if (fogInstalled) return;
	fogInstalled = true;
	THREE.ShaderChunk.fog_vertex = /* glsl */ `
#ifdef USE_FOG
	vFogDepth = mvPosition.z;
#endif`;
}

/** Fog range that yields no fog (CameraFogMode cam,0) without recompiling materials. */
export const NO_FOG_NEAR = 1e20;
export const NO_FOG_FAR = 2e20;

/** Renderer settings that reproduce un-managed, gamma-space fixed-function output. */
export function configureRenderer(renderer: THREE.WebGLRenderer): void {
	THREE.ColorManagement.enabled = false;
	renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
	installBlitzFog();
}
