import * as THREE from 'three';
import { normalizePath, type Vfs } from '../io/Vfs';

/** Blitz3D texture flags. */
export const TEX_COLOR = 1;
export const TEX_ALPHA = 2;
export const TEX_MASKED = 4;
export const TEX_MIPMAP = 8;
export const TEX_CLAMP_U = 16;
export const TEX_CLAMP_V = 32;
export const TEX_SPHERE = 64;
export const TEX_CUBE = 128;

/** Blitz3D texture blend modes (TextureBlend). */
export const TEXBLEND_NONE = 0;
export const TEXBLEND_ALPHA = 1;
export const TEXBLEND_MULTIPLY = 2;
export const TEXBLEND_ADD = 3;
export const TEXBLEND_DOT3 = 4;
export const TEXBLEND_MULTIPLY2 = 5;

/**
 * TextureFilter() calls from includes/load_setup.bb: flags added to any
 * texture whose path contains the given text.
 */
const TEXTURE_FILTERS: [string, number][] = [
	['', 8],
	['_a', 2],
	['_m', 4],
	['_c', 16 + 32],
	['_u', 16],
	['_v', 32],
	['_h', 256],
	['_hc', 512],
	['_sm', 64]
];

export function effectiveTextureFlags(path: string, flags: number): number {
	const p = path.toLowerCase();
	for (const [match, add] of TEXTURE_FILTERS) if (p.includes(match)) flags |= add;
	return flags;
}

export interface BlitzTexture {
	texture: THREE.Texture;
	flags: number;
	/** True when the texture carries transparency (alpha or mask flag). */
	transparent: boolean;
	masked: boolean;
	width: number;
	height: number;
}

/** LoadTexture with per-(path, flags) caching. */
export class TextureCache {
	private cache = new Map<string, Promise<BlitzTexture | undefined>>();

	constructor(private vfs: Vfs) {}

	/**
	 * Returns undefined when the file does not exist (LoadTexture returning 0).
	 * `filterName` is the name the TextureFilter rules are matched against:
	 * Blitz matches the name as given to LoadTexture or stored in the model
	 * (blitz3d/texture.cpp filterFile), which can differ from the resolved path.
	 */
	load(path: string, flags = TEX_COLOR, filterName = path): Promise<BlitzTexture | undefined> {
		flags = effectiveTextureFlags(filterName, flags);
		// blitz3d/texture.cpp Texture::Texture: a masked texture is always colour + alpha.
		if (flags & TEX_MASKED) flags |= TEX_COLOR | TEX_ALPHA;
		const key = `${normalizePath(path)}|${flags}`;
		let p = this.cache.get(key);
		if (!p) {
			p = this.loadUncached(path, flags);
			this.cache.set(key, p);
		}
		return p;
	}

	private async loadUncached(path: string, flags: number): Promise<BlitzTexture | undefined> {
		if (!this.vfs.exists(path)) return undefined;
		const bytes = await this.vfs.readBytes(path);
		const bitmap = await createImageBitmap(new Blob([bytes as BlobPart]), {
			premultiplyAlpha: 'none',
			colorSpaceConversion: 'none'
		});
		const width = bitmap.width;
		const height = bitmap.height;
		const masked = (flags & TEX_MASKED) !== 0;
		const alpha = (flags & TEX_ALPHA) !== 0;

		let texture: THREE.Texture;
		if (alpha && !masked && imageHasAlphaFormat(bytes)) {
			// The alpha channel of the file is used unchanged. The bitmap goes to the
			// GPU directly: a 2D canvas stores premultiplied pixels and would lose
			// the colour of fully transparent texels, which bilinear filtering
			// bleeds into the edges.
			texture = new THREE.Texture(bitmap);
		} else {
			const canvas = document.createElement('canvas');
			canvas.width = width;
			canvas.height = height;
			const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
			ctx.drawImage(bitmap, 0, 0);
			bitmap.close();
			const img = ctx.getImageData(0, 0, width, height);
			applyTextureAlpha(img.data, flags);
			ctx.putImageData(img, 0, 0);
			texture = new THREE.CanvasTexture(canvas);
		}

		texture.flipY = false; // Blitz UV origin is top-left
		texture.colorSpace = THREE.NoColorSpace;
		texture.wrapS = flags & TEX_CLAMP_U ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
		texture.wrapT = flags & TEX_CLAMP_V ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
		texture.premultiplyAlpha = false;
		if (flags & TEX_MIPMAP) {
			texture.generateMipmaps = true;
			texture.minFilter = THREE.LinearMipmapLinearFilter;
		} else {
			texture.generateMipmaps = false;
			texture.minFilter = THREE.LinearFilter;
		}
		texture.needsUpdate = true;
		return {
			texture,
			flags,
			transparent: masked || alpha,
			masked,
			width,
			height
		};
	}
}

/**
 * The alpha channel Blitz3D gives a loaded texture, applied in place to RGBA
 * bytes. From gxruntime/ddutil.cpp ddUtil::loadSurface (buildMask, buildAlpha):
 * - no alpha flag: alpha is forced to 255;
 * - masked: alpha is 255 where the colour is not pure black, else 0 (an alpha
 *   channel in the file is ignored);
 * - alpha flag on an image without an alpha channel: alpha is the integer
 *   mean (r+g+b)/3, and the colour becomes white when the colour flag is
 *   missing.
 * An alpha-flagged image that has an alpha channel is left as it is and must
 * not be passed here (see imageHasAlphaFormat).
 */
export function applyTextureAlpha(d: Uint8ClampedArray | Uint8Array, flags: number): void {
	if (!(flags & TEX_ALPHA)) {
		for (let i = 3; i < d.length; i += 4) d[i] = 255;
	} else if (flags & TEX_MASKED) {
		for (let i = 0; i < d.length; i += 4) d[i + 3] = d[i] | d[i + 1] | d[i + 2] ? 255 : 0;
	} else {
		const whiten = !(flags & TEX_COLOR);
		for (let i = 0; i < d.length; i += 4) {
			d[i + 3] = Math.floor((d[i] + d[i + 1] + d[i + 2]) / 3);
			if (whiten) d[i] = d[i + 1] = d[i + 2] = 255;
		}
	}
}

/**
 * The `trans` test of ddUtil::loadSurface: FreeImage_GetBPP()==32 or
 * FreeImage_IsTransparent(). It depends on the pixel format of the file, not
 * on whether any pixel is transparent, so it is read from the header.
 * True for RGBA and grey+alpha PNGs, PNGs with a tRNS chunk and 32-bit BMPs.
 * (RGBA PNGs with 16 bits per channel are assumed to count, as FreeImage
 * versions of that time reduce them to 8 bits when loading.)
 */
export function imageHasAlphaFormat(b: Uint8Array): boolean {
	if (b.length > 33 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
		const colorType = b[25];
		if (colorType === 6 || colorType === 4) return true;
		// A tRNS chunk, if present, comes before the first IDAT.
		let p = 8;
		while (p + 8 <= b.length) {
			const len = ((b[p] << 24) | (b[p + 1] << 16) | (b[p + 2] << 8) | b[p + 3]) >>> 0;
			const type = String.fromCharCode(b[p + 4], b[p + 5], b[p + 6], b[p + 7]);
			if (type === 'tRNS') return true;
			if (type === 'IDAT' || type === 'IEND') return false;
			p += 12 + len;
		}
		return false;
	}
	if (b.length > 30 && b[0] === 0x42 && b[1] === 0x4d) return (b[28] | (b[29] << 8)) === 32;
	return false;
}

let nextHandleId = 1;

/**
 * A Blitz3D texture handle (blitz3d/texture.cpp Texture): a shared image plus
 * the per-handle blend mode, coordinate set and UV transform. LoadTexture
 * returns a new handle each time while the image is cached.
 * The transform is stored the way Blitz stores it; `scale`, `rotate` and
 * `position` take the arguments of the Blitz commands and convert them.
 */
export class TextureHandle {
	readonly id = nextHandleId++;
	/** TextureBlend: 0 off, 1 alpha, 2 multiply (default), 3 add, 4 dot3, 5 multiply 2x. */
	blend = TEXBLEND_MULTIPLY;
	/** TextureCoords: 0 or 1, the vertex UV set used. */
	coords = 0;
	/** Stored values: u' = u*cos*sx + v*sin*sx + tx, v' = -u*sin*sy + v*cos*sy + ty. */
	sx = 1;
	sy = 1;
	tx = 0;
	ty = 0;
	rot = 0;
	/** UV transform as matrix * vec3(u, v, 1). Updated in place so that materials follow it. */
	readonly matrix = new THREE.Matrix3();

	constructor(readonly image: BlitzTexture) {}

	/** TextureBlend texture,blend */
	setBlend(blend: number): this {
		this.blend = blend;
		return this;
	}

	/** TextureCoords texture,coords */
	setCoords(coords: number): this {
		this.coords = coords;
		return this;
	}

	/** ScaleTexture texture,u_scale,v_scale (bbScaleTexture stores the reciprocals) */
	scale(u: number, v: number): this {
		return this.setRaw(1 / u, 1 / v, this.tx, this.ty, this.rot);
	}

	/** RotateTexture texture,angle in degrees (bbRotateTexture stores -angle in radians) */
	rotate(angle: number): this {
		return this.setRaw(this.sx, this.sy, this.tx, this.ty, (-angle * Math.PI) / 180);
	}

	/** PositionTexture texture,u,v (bbPositionTexture stores the negated offsets) */
	position(u: number, v: number): this {
		return this.setRaw(this.sx, this.sy, -u, -v, this.rot);
	}

	/** Sets the stored values directly, as the B3D loader does from a TEXS chunk. */
	setRaw(sx: number, sy: number, tx: number, ty: number, rot: number): this {
		this.sx = sx;
		this.sy = sy;
		this.tx = tx;
		this.ty = ty;
		this.rot = rot;
		// Texture::getMatrix; Direct3D applies it to the row vector (u, v, 1).
		const c = Math.cos(rot);
		const s = Math.sin(rot);
		this.matrix.set(c * sx, s * sx, tx, -s * sy, c * sy, ty, 0, 0, 1);
		return this;
	}
}

const defaultHandles = new WeakMap<BlitzTexture, TextureHandle>();

/** A handle with default settings for an image; the same one on every call. */
export function defaultTextureHandle(image: BlitzTexture): TextureHandle {
	let h = defaultHandles.get(image);
	if (!h) {
		h = new TextureHandle(image);
		defaultHandles.set(image, h);
	}
	return h;
}
