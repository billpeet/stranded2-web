import { Sin, blitzInt } from './blitzMath';

/**
 * The per-frame redraw of gfx_water from e_environment_update_water(),
 * done on a plain RGBA pixel buffer:
 *
 *   SetBuffer TextureBuffer(gfx_water)
 *   DrawBlock gfx_waterimg,0,0
 *   For x=0 To size Step n : CopyRect x,0,n,size,x,Sin(isin+x*2.8125)*3. : Next
 *   For y=0 To size Step n : CopyRect 0,y,size,n,Sin(isin+y*2.8125)*3.,y : Next
 *
 * 2.8125 is 360/128, so one sine period spans the 128 pixel texture.
 */

let scratch = new Uint8Array(0);

/**
 * CopyRect within one buffer (Blitz3D gxCanvas::blit, solid): both rectangles
 * are clipped to the buffer, nothing wraps, and overlapping source and
 * destination behave like memmove.
 */
export function copyRect(
	buf: Uint8Array | Uint8ClampedArray,
	bw: number,
	bh: number,
	sx: number,
	sy: number,
	w: number,
	h: number,
	dx: number,
	dy: number
): void {
	// clip( &dest_r,&src_r ): clip destination to the canvas, moving the source along
	let dl = dx,
		dt = dy,
		dr = dx + w,
		db = dy + h;
	let sl = sx,
		st = sy,
		sr = sx + w,
		sb = sy + h;
	if (dr <= dl || db <= dt || dl >= bw || dr <= 0 || dt >= bh || db <= 0) return;
	if (dl < 0) (sl -= dl), (dl = 0);
	if (dr > bw) (sr -= dr - bw), (dr = bw);
	if (dt < 0) (st -= dt), (dt = 0);
	if (db > bh) (sb -= db - bh), (db = bh);
	// ::clip( src->clip_rect,&src_r,&dest_r ): clip source to the canvas, moving the destination along
	if (sr <= sl || sb <= st || sl >= bw || sr <= 0 || st >= bh || sb <= 0) return;
	if (sl < 0) (dl -= sl), (sl = 0);
	if (sr > bw) (dr -= sr - bw), (sr = bw);
	if (st < 0) (dt -= st), (st = 0);
	if (sb > bh) (db -= sb - bh), (sb = bh);
	const cw = sr - sl;
	const ch = sb - st;
	if (cw <= 0 || ch <= 0) return;
	if (sl === dl && st === dt) return;

	const rowBytes = cw * 4;
	if (scratch.length < rowBytes * ch) scratch = new Uint8Array(rowBytes * ch);
	for (let y = 0; y < ch; y++) {
		const o = ((st + y) * bw + sl) * 4;
		scratch.set(buf.subarray(o, o + rowBytes), y * rowBytes);
	}
	for (let y = 0; y < ch; y++) {
		buf.set(scratch.subarray(y * rowBytes, (y + 1) * rowBytes), ((dt + y) * bw + dl) * 4);
	}
}

/** Strip width used by each set_water level (0 = no distortion). */
export function waterStep(set_water: number): number {
	switch (set_water) {
		case 1:
			return 4;
		case 2:
			return 2;
		case 3:
		case 4:
		case 5:
		case 6:
			return 1;
		default:
			return 0;
	}
}

/** Sin(isin+Float(Float(x)*2.8125))*3. converted to the integer CopyRect takes. */
export function waterShift(isin: number, x: number): number {
	return blitzInt(Math.fround(Sin(Math.fround(isin + Math.fround(x * 2.8125))) * 3));
}

/**
 * Redraws the water texture.
 * @param dst   texture pixels, size*size RGBA (TextureBuffer(gfx_water))
 * @param base  gfx_waterimg or gfx_waterimg_custom, same layout
 * @param size  TextureHeight(gfx_water)
 * @param isin  env_seasinus# converted to Int
 */
export function drawWaterTexture(
	dst: Uint8Array | Uint8ClampedArray,
	base: Uint8Array | Uint8ClampedArray,
	size: number,
	set_water: number,
	isin: number
): void {
	//DrawBlock gfx_waterimg,0,0
	dst.set(base);
	const n = waterStep(set_water);
	if (n === 0) return;
	for (let x = 0; x <= size; x += n) {
		copyRect(dst, size, size, x, 0, n, size, x, waterShift(isin, x));
	}
	for (let y = 0; y <= size; y += n) {
		copyRect(dst, size, size, 0, y, size, n, waterShift(isin, y), y);
	}
}
