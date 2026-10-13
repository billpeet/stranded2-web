/**
 * Windows BMP decoder/encoder. Decoding in our own code (instead of the
 * browser's) keeps pixel values exact, which the magenta colour key relies
 * on, and lets the tests run without a DOM.
 *
 * Covers what the game ships: BITMAPINFOHEADER, uncompressed 1/4/8/16/24/32
 * bit, plus RLE8 for robustness.
 */

export interface DecodedImage {
	width: number;
	height: number;
	/** Opaque native pixels (A<<24 | B<<16 | G<<8 | R). */
	px: Uint32Array;
}

export function isBmp(bytes: Uint8Array): boolean {
	return bytes.length > 54 && bytes[0] === 0x42 && bytes[1] === 0x4d;
}

export function decodeBmp(bytes: Uint8Array): DecodedImage {
	const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	if (!isBmp(bytes)) throw new Error('Not a BMP file');
	const offBits = dv.getUint32(10, true);
	const hdr = dv.getUint32(14, true);
	let width: number, rawH: number, bpp: number, comp: number, clrUsed: number, palEntry: number;
	if (hdr === 12) {
		width = dv.getUint16(18, true);
		rawH = dv.getInt16(20, true);
		bpp = dv.getUint16(24, true);
		comp = 0;
		clrUsed = 0;
		palEntry = 3;
	} else {
		width = dv.getInt32(18, true);
		rawH = dv.getInt32(22, true);
		bpp = dv.getUint16(28, true);
		comp = dv.getUint32(30, true);
		clrUsed = dv.getUint32(46, true);
		palEntry = 4;
	}
	const topDown = rawH < 0;
	const height = Math.abs(rawH);
	const px = new Uint32Array(width * height).fill(0xff000000);

	let palette: Uint32Array | undefined;
	if (bpp <= 8) {
		const n = clrUsed || 1 << bpp;
		palette = new Uint32Array(256).fill(0xff000000);
		const p = 14 + hdr;
		for (let i = 0; i < n && p + i * palEntry + 2 < bytes.length; i++) {
			const b = bytes[p + i * palEntry],
				g = bytes[p + i * palEntry + 1],
				r = bytes[p + i * palEntry + 2];
			palette[i] = (0xff000000 | (b << 16) | (g << 8) | r) >>> 0;
		}
	}

	const rowOf = (y: number) => (topDown ? y : height - 1 - y) * width;

	if (comp === 1 && bpp === 8) {
		// RLE8
		let p = offBits,
			x = 0,
			y = 0;
		while (p + 1 < bytes.length && y < height) {
			const n = bytes[p++],
				v = bytes[p++];
			if (n > 0) {
				for (let i = 0; i < n && x < width; i++) px[rowOf(y) + x++] = palette![v];
			} else if (v === 0) {
				x = 0;
				y++;
			} else if (v === 1) break;
			else if (v === 2) {
				x += bytes[p++];
				y += bytes[p++];
			} else {
				for (let i = 0; i < v; i++) {
					const c = bytes[p++];
					if (x < width && y < height) px[rowOf(y) + x++] = palette![c];
				}
				if (v & 1) p++;
			}
		}
		return { width, height, px };
	}
	if (comp !== 0 && !(comp === 3 && (bpp === 16 || bpp === 32))) throw new Error(`Unsupported BMP compression ${comp}`);

	// BI_BITFIELDS masks (16/32 bit); default 16-bit layout is X1R5G5B5.
	let rm = 0x7c00,
		gm = 0x03e0,
		bm = 0x001f;
	if (bpp === 32) {
		rm = 0xff0000;
		gm = 0xff00;
		bm = 0xff;
	}
	if (comp === 3) {
		rm = dv.getUint32(54, true);
		gm = dv.getUint32(58, true);
		bm = dv.getUint32(62, true);
	}
	const scale = (v: number, m: number): number => {
		if (!m) return 0;
		let shift = 0;
		while (!((m >>> shift) & 1)) shift++;
		const max = m >>> shift;
		return Math.round((((v & m) >>> shift) * 255) / max);
	};

	const stride = ((width * bpp + 31) >>> 5) << 2;
	for (let y = 0; y < height; y++) {
		const row = offBits + y * stride;
		const out = rowOf(y);
		switch (bpp) {
			case 24:
				for (let x = 0, p = row; x < width; x++, p += 3) {
					px[out + x] = (0xff000000 | (bytes[p] << 16) | (bytes[p + 1] << 8) | bytes[p + 2]) >>> 0;
				}
				break;
			case 32:
				for (let x = 0; x < width; x++) {
					const v = dv.getUint32(row + x * 4, true);
					px[out + x] = (0xff000000 | (scale(v, bm) << 16) | (scale(v, gm) << 8) | scale(v, rm)) >>> 0;
				}
				break;
			case 16:
				for (let x = 0; x < width; x++) {
					const v = dv.getUint16(row + x * 2, true);
					px[out + x] = (0xff000000 | (scale(v, bm) << 16) | (scale(v, gm) << 8) | scale(v, rm)) >>> 0;
				}
				break;
			case 8:
				for (let x = 0; x < width; x++) px[out + x] = palette![bytes[row + x]];
				break;
			case 4:
				for (let x = 0; x < width; x++) {
					const b = bytes[row + (x >> 1)];
					px[out + x] = palette![x & 1 ? b & 15 : b >> 4];
				}
				break;
			case 1:
				for (let x = 0; x < width; x++) px[out + x] = palette![(bytes[row + (x >> 3)] >> (7 - (x & 7))) & 1];
				break;
			default:
				throw new Error(`Unsupported BMP bit depth ${bpp}`);
		}
	}
	return { width, height, px };
}

/** 24-bit bottom-up BMP, the layout bbgraphics.cpp saveCanvas() writes (SaveImage/SaveBuffer). */
export function encodeBmp(width: number, height: number, px: Uint32Array): Uint8Array {
	const stride = (width * 3 + 3) & ~3;
	const out = new Uint8Array(54 + stride * height);
	const dv = new DataView(out.buffer);
	out[0] = 0x42;
	out[1] = 0x4d;
	dv.setUint32(2, out.length, true);
	dv.setUint32(10, 54, true);
	dv.setUint32(14, 40, true);
	dv.setInt32(18, width, true);
	dv.setInt32(22, height, true);
	dv.setUint16(26, 1, true);
	dv.setUint16(28, 24, true);
	for (let y = 0; y < height; y++) {
		let p = 54 + (height - 1 - y) * stride;
		for (let x = 0; x < width; x++) {
			const v = px[y * width + x];
			out[p++] = (v >>> 16) & 0xff;
			out[p++] = (v >>> 8) & 0xff;
			out[p++] = v & 0xff;
		}
	}
	return out;
}
