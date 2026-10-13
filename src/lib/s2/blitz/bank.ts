/**
 * Blitz3D banks: bbruntime/bbbank.cpp. A bank is a resizable block of bytes;
 * all multi-byte values are little-endian.
 *
 * The original only checks offsets in debug builds; in the release build an
 * out-of-range Peek/Poke reads or corrupts whatever lies behind the bank.
 * That cannot be reproduced, so the port throws the debug build's
 * "Offset out of range" instead.
 */
import { BlitzRuntimeError } from './errors';

export class Bank {
	data: Uint8Array;
	private view: DataView;

	constructor(size = 0) {
		this.data = new Uint8Array(size > 0 ? size : 0);
		this.view = new DataView(this.data.buffer);
	}

	get size(): number {
		return this.data.length;
	}

	/** bbBank::resize: contents up to the smaller size are kept, new bytes are zero. */
	resize(n: number): void {
		if (n < 0) n = 0;
		if (n === this.data.length) return;
		const d = new Uint8Array(n);
		d.set(this.data.subarray(0, Math.min(n, this.data.length)));
		this.data = d;
		this.view = new DataView(d.buffer);
	}

	/** @internal */
	dv(offset: number, bytes: number): DataView {
		if (offset < 0 || offset + bytes > this.data.length) throw new BlitzRuntimeError('Offset out of range');
		return this.view;
	}
}

/** CreateBank(size=0): zero-filled. */
export function CreateBank(size = 0): Bank {
	return new Bank(size);
}

/** FreeBank: nothing to release here. */
export function FreeBank(_b: Bank): void {}

export function BankSize(b: Bank): number {
	return b.size;
}

export function ResizeBank(b: Bank, size: number): void {
	b.resize(size);
}

/** CopyBank src,src_offset,dest,dest_offset,count: memmove, so overlapping ranges in one bank are safe. */
export function CopyBank(src: Bank, srcPos: number, dest: Bank, destPos: number, count: number): void {
	if (count <= 0) return;
	src.dv(srcPos, count);
	dest.dv(destPos, count);
	if (src === dest) dest.data.copyWithin(destPos, srcPos, srcPos + count);
	else dest.data.set(src.data.subarray(srcPos, srcPos + count), destPos);
}

/** PeekByte: unsigned 0..255. */
export function PeekByte(b: Bank, offset: number): number {
	return b.dv(offset, 1).getUint8(offset);
}

/** PeekShort: unsigned 0..65535. */
export function PeekShort(b: Bank, offset: number): number {
	return b.dv(offset, 2).getUint16(offset, true);
}

/** PeekInt: signed 32 bit. */
export function PeekInt(b: Bank, offset: number): number {
	return b.dv(offset, 4).getInt32(offset, true);
}

export function PeekFloat(b: Bank, offset: number): number {
	return b.dv(offset, 4).getFloat32(offset, true);
}

/** PokeByte: stores the low 8 bits. */
export function PokeByte(b: Bank, offset: number, value: number): void {
	b.dv(offset, 1).setUint8(offset, value & 255);
}

/** PokeShort: stores the low 16 bits. */
export function PokeShort(b: Bank, offset: number, value: number): void {
	b.dv(offset, 2).setUint16(offset, value & 65535, true);
}

export function PokeInt(b: Bank, offset: number, value: number): void {
	b.dv(offset, 4).setInt32(offset, value | 0, true);
}

export function PokeFloat(b: Bank, offset: number, value: number): void {
	b.dv(offset, 4).setFloat32(offset, value, true);
}
