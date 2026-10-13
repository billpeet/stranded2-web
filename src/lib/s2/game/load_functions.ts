/**
 * includes/load_functions.bb: the loaders with error handling, and the
 * load progress cache.
 *
 * Also the synchronous LoadImage / LoadAnimImage for game code. The 2D layer
 * decodes image files asynchronously (gfx2d LoadImage returns an empty image
 * that fills in later); the original code reads ImageWidth right after
 * loading. The bb3d world has every image of the mod decoded after
 * `RT.world.preload('all')` (include_load_media), so the versions here build
 * the image from those pixels at once. Use these, not gfx2d's, in ported code.
 */
import { RuntimeError } from '../blitz';
import {
	CreateCone,
	CreateCube,
	CreateCylinder,
	CreateSphere,
	LoadAnimMesh,
	LoadMesh,
	LoadTexture,
	type Handle,
	type Texture
} from '../bb3d';
import {
	BBImage,
	Canvas2D,
	LoadAnimImage as LoadAnimImageLazy,
	LoadImage as LoadImageLazy,
	MaskImage,
	type ImageHandle
} from '../gfx2d';
import { Instr, Left, Mid, Right, Trim } from '../blitz';
import { con_add } from './con_add';
import { CloseFile, FileType, ReadFile, ReadShort, WriteFile, WriteShort } from './files';
import { RT, hasRuntime } from './rt';
import { G } from './state';
import { DebugLog } from './sys';

// ---------------------------------------------------------------- synchronous images

/** The decoded pixels of an image file as an opaque native surface, or undefined when they are not preloaded. */
function decoded(path: string): Canvas2D | undefined {
	if (!hasRuntime('world')) return undefined;
	const d = RT.world.resources.pixels(path);
	if (!d) return undefined;
	const px = new Uint32Array(d.width * d.height);
	px.set(new Uint32Array(d.data.buffer, d.data.byteOffset, d.width * d.height));
	// loaded images are opaque (the mask colour is applied when drawing)
	for (let i = 0; i < px.length; i++) px[i] |= 0xff000000;
	return new Canvas2D(d.width, d.height, px);
}

/**
 * LoadImage(file$): 0 when the file does not exist. The image is complete on
 * return when the file was preloaded; otherwise it is the 2D layer's lazy
 * image (await `image.ready`).
 */
export function LoadImage(path: string): ImageHandle {
	if (FileType(path) !== 1 && !(hasRuntime('vfs') && RT.vfs.exists(path))) return 0;
	const c = decoded(path);
	if (!c) return LoadImageLazy(path);
	const image = new BBImage([c]);
	image.path = path;
	return image;
}

/** LoadAnimImage(file$,w,h,first,count): frames left to right, top to bottom. 0 when there are not enough frames. */
export function LoadAnimImage(path: string, w: number, h: number, first: number, count: number): ImageHandle {
	if (FileType(path) !== 1 && !(hasRuntime('vfs') && RT.vfs.exists(path))) return 0;
	const src = decoded(path);
	if (!src) return LoadAnimImageLazy(path, w, h, first, count);
	if (w <= 0 || h <= 0 || count <= 0) return 0;
	const perRow = Math.floor(src.width / w);
	const rows = Math.floor(src.height / h);
	if (first + count > perRow * rows) return 0; // "Not enough frames in bitmap"
	const frames: Canvas2D[] = [];
	for (let k = first; k < first + count; k++) {
		const fx = (k % perRow) * w;
		const fy = Math.floor(k / perRow) * h;
		const px = new Uint32Array(w * h);
		for (let y = 0; y < h; y++) px.set(src.px.subarray((fy + y) * src.width + fx, (fy + y) * src.width + fx + w), y * w);
		frames.push(new Canvas2D(w, h, px));
	}
	const image = new BBImage(frames);
	image.path = path;
	return image;
}

// ---------------------------------------------------------------- load_functions.bb

/** Function load_image(path$,masked=1) */
export function load_image(path: string, masked = 1): ImageHandle {
	if (G.set_debug) con_add('Loading Image: ' + path);
	const image = LoadImage(path);
	if (image === 0) RuntimeError('Unable to load Image ' + path);
	if (masked) MaskImage(image, 255, 0, 255);
	return image;
}

/** Function load_animimage(path$,w,h,f,masked=1) */
export function load_animimage(path: string, w: number, h: number, f: number, masked = 1): ImageHandle {
	if (G.set_debug) con_add('Loading animated Image: ' + path);
	const image = LoadAnimImage(path, w, h, 0, f);
	if (image === 0) RuntimeError('Unable to load Image ' + path);
	if (masked) MaskImage(image, 255, 0, 255);
	return image;
}

/** Function load_texture(path$,mode=1) */
export function load_texture(path: string, mode = 1): Texture {
	if (G.set_debug) con_add('Loading Texture: ' + path);
	const image = LoadTexture(path, mode);
	if (image === null) RuntimeError('Unable to load Texture ' + path);
	return image;
}

/** Function load_mesh(path$) */
export function load_mesh(path: string): NonNullable<Handle> {
	if (G.set_debug) con_add('Loading Mesh: ' + path);
	const mesh = LoadMesh(path);
	if (mesh === null) RuntimeError('Unable to load Model ' + path);
	return mesh;
}

/** Function load_animmesh(path$) */
export function load_animmesh(path: string): NonNullable<Handle> {
	if (G.set_debug) con_add('Loading animated Mesh: ' + path);
	const mesh = LoadAnimMesh(path);
	if (mesh === null) RuntimeError('Unable to load (animated) Model ' + path);
	return mesh;
}

/** Function mesh_primitives(path$): "...primitive:cube" creates a primitive; 0 (null) for any other path. */
export function mesh_primitives(path: string): Handle {
	const p = Instr(path, ':');
	DebugLog(Right(Left(path, p - 1), 9));
	if (Right(Left(path, p - 1), 9) === 'primitive') {
		let typ = Mid(path, p + 1, -1);
		typ = Trim(typ);
		switch (typ) {
			case 'cube':
				return CreateCube();
			case 'sphere':
				return CreateSphere();
			case 'cylinder':
				return CreateCylinder();
			case 'cone':
				return CreateCone();
			default:
				RuntimeError("'" + typ + "' is no valid primitive!");
		}
	}
	return null;
}

// ---------------------------------------------------------------- PROGRESS

/** Function load_progress_get(): the definition counts of the last start, for the progress bar. */
export function load_progress_get(): void {
	G.load_objects_c = 255;
	G.load_units_c = 255;
	G.load_items_c = 255;
	if (FileType('sys\\load.cache') === 1) {
		const stream = ReadFile('sys\\load.cache');
		if (stream !== 0) {
			G.load_objects_c = ReadShort(stream);
			G.load_units_c = ReadShort(stream);
			G.load_items_c = ReadShort(stream);
			CloseFile(stream);
		}
	}
}

/** Function load_progress_set() */
export function load_progress_set(): void {
	const stream = WriteFile('sys\\load.cache');
	if (stream !== 0) {
		WriteShort(stream, G.object_count);
		WriteShort(stream, G.unit_count);
		WriteShort(stream, G.item_count);
		CloseFile(stream);
	}
}
