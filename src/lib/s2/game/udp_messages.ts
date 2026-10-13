/**
 * includes/udp_messages.bb: building an outgoing message (udp_send, udp_w_*)
 * and reading the values of an incoming packet (udp_r_*).
 *
 * A message is built in the bank of the newest Tudp_msg; udp_update() later
 * packs the messages of one receiver into a packet. The udp_r_* functions read
 * from the bank udp_process() selected (udp_indb, position udp_indbp, size
 * udp_indbs). All values are little endian (Blitz banks).
 *
 *     byte   1 byte
 *     short  2 bytes
 *     int    4 bytes on the wire, of which udp_w_int only writes the low 2 (see there)
 *     float  4 bytes IEEE single
 *     tiny   1 length byte, then the bytes of the text (at most 255)
 *     txt    2 length bytes, then the bytes of the text (at most 65535)
 */
import {
	Asc,
	BankSize,
	Chr,
	CreateBank,
	Len,
	Mid,
	PeekByte,
	PeekFloat,
	PeekInt,
	PeekShort,
	PokeByte,
	PokeFloat,
	PokeShort,
	ResizeBank,
	f32
} from '../blitz';
import { PeekByteR, PeekShortR, bankHandle, bankOf } from './_additions/net';
import { Cudp_size_byte, Cudp_size_float, Cudp_size_int, Cudp_size_short, Cudp_size_tiny, Cudp_size_txt, Cudp_sys } from './consts';
import { G } from './state';
import { Last, New, Tudp_msg } from './types';

//################################################# Initiale Message for Sending

//Send Message
/** Function udp_send(ip,port,msgid,reliable=1) */
export function udp_send(ip: number, port: number, msgid: number, reliable: number = 1): void {
	let Tudp_msg_: Tudp_msg | null = null;
	//Create new Message
	Tudp_msg_ = New(Tudp_msg);
	Tudp_msg_.ip = ip;
	Tudp_msg_.port = port;
	//Reliability
	Tudp_msg_.reliable = reliable;
	//Bank
	Tudp_msg_.db = bankHandle(CreateBank());
	//Message ID
	udp_w_byte(msgid);
	//Set to Start
	if (msgid >= Cudp_sys) {
		Tudp_msg_.system = 1;
	}
}

//################################################# Write Commands

//Write Byte
/** Function udp_w_byte(value) */
export function udp_w_byte(value: number): void {
	let Tudp_msg_: Tudp_msg | null = null;
	let size = 0;
	Tudp_msg_ = Last(Tudp_msg);
	size = BankSize(bankOf(Tudp_msg_!.db));
	ResizeBank(bankOf(Tudp_msg_!.db), size + Cudp_size_byte);
	PokeByte(bankOf(Tudp_msg_!.db), size, value);
}

//Write Short
/** Function udp_w_short(value) */
export function udp_w_short(value: number): void {
	let Tudp_msg_: Tudp_msg | null = null;
	let size = 0;
	Tudp_msg_ = Last(Tudp_msg);
	size = BankSize(bankOf(Tudp_msg_!.db));
	ResizeBank(bankOf(Tudp_msg_!.db), size + Cudp_size_short);
	PokeShort(bankOf(Tudp_msg_!.db), size, value);
}

//Write Int
/** Function udp_w_int(value) */
export function udp_w_int(value: number): void {
	let Tudp_msg_: Tudp_msg | null = null;
	let size = 0;
	Tudp_msg_ = Last(Tudp_msg);
	size = BankSize(bankOf(Tudp_msg_!.db));
	ResizeBank(bankOf(Tudp_msg_!.db), size + Cudp_size_int);
	// quirk: PokeShort, not PokeInt: only the low 16 bits of the value are written. The other
	// two bytes are what ResizeBank left there: 0 here (and in the original whenever the bank
	// grows inside its capacity; uninitialised memory when the resize reallocates).
	// A player IP or a MilliSecs() ping stamp arrives cut to 16 bits.
	PokeShort(bankOf(Tudp_msg_!.db), size, value);
}

//Write Float
/** Function udp_w_float(value#) */
export function udp_w_float(value: number): void {
	let Tudp_msg_: Tudp_msg | null = null;
	let size = 0;
	Tudp_msg_ = Last(Tudp_msg);
	size = BankSize(bankOf(Tudp_msg_!.db));
	ResizeBank(bankOf(Tudp_msg_!.db), size + Cudp_size_float);
	PokeFloat(bankOf(Tudp_msg_!.db), size, f32(value));
}

//Write Tiny Text
/** Function udp_w_tiny(value$) */
export function udp_w_tiny(value: string): void {
	let Tudp_msg_: Tudp_msg | null = null;
	let size = 0;
	let l = 0;
	let i = 0;
	Tudp_msg_ = Last(Tudp_msg);
	size = BankSize(bankOf(Tudp_msg_!.db));
	l = Len(value);
	if (l > 255) l = 255;
	ResizeBank(bankOf(Tudp_msg_!.db), size + Cudp_size_tiny + l);
	PokeByte(bankOf(Tudp_msg_!.db), size, l);
	for (i = 1; i <= l; i++) {
		PokeByte(bankOf(Tudp_msg_!.db), size + i, Asc(Mid(value, i, 1)));
	}
}

//Write Text
/** Function udp_w_txt(value$) */
export function udp_w_txt(value: string): void {
	let Tudp_msg_: Tudp_msg | null = null;
	let size = 0;
	let l = 0;
	let i = 0;
	Tudp_msg_ = Last(Tudp_msg);
	size = BankSize(bankOf(Tudp_msg_!.db));
	l = Len(value);
	if (l > 65535) l = 65535;
	ResizeBank(bankOf(Tudp_msg_!.db), size + Cudp_size_txt + l);
	PokeShort(bankOf(Tudp_msg_!.db), size, l);
	for (i = 1; i <= l; i++) {
		PokeByte(bankOf(Tudp_msg_!.db), size + i + 1, Asc(Mid(value, i, 1)));
	}
}

//################################################# Read Commands

//Read Byte
/** Function udp_r_byte() */
export function udp_r_byte(): number {
	let value = 0;
	if (G.udp_indbp <= G.udp_indbs - Cudp_size_byte) {
		value = PeekByte(bankOf(G.udp_indb), G.udp_indbp);
		G.udp_indbp = G.udp_indbp + Cudp_size_byte;
		return value;
	} else {
		return 0;
	}
}

//Read Short
/** Function udp_r_short() */
export function udp_r_short(): number {
	let value = 0;
	if (G.udp_indbp <= G.udp_indbs - Cudp_size_short) {
		value = PeekShort(bankOf(G.udp_indb), G.udp_indbp);
		G.udp_indbp = G.udp_indbp + Cudp_size_short;
		return value;
	} else {
		return 0;
	}
}

//Read Int
/** Function udp_r_int() */
export function udp_r_int(): number {
	let value = 0;
	if (G.udp_indbp <= G.udp_indbs - Cudp_size_int) {
		value = PeekInt(bankOf(G.udp_indb), G.udp_indbp);
		G.udp_indbp = G.udp_indbp + Cudp_size_int;
		return value;
	} else {
		return 0;
	}
}

//Read Float
/** Function udp_r_float#() */
export function udp_r_float(): number {
	let value = 0;
	if (G.udp_indbp <= G.udp_indbs - Cudp_size_float) {
		value = f32(PeekFloat(bankOf(G.udp_indb), G.udp_indbp));
		G.udp_indbp = G.udp_indbp + Cudp_size_float;
		return value;
	} else {
		return 0;
	}
}

//Read Tiny
/** Function udp_r_tiny$() */
export function udp_r_tiny(): string {
	let l = 0;
	let value = '';
	let i = 0;
	let byte = 0;
	// quirk: no range check, unlike udp_r_byte .. udp_r_float: a length byte at or behind the
	// end of the packet reads memory behind the bank (PeekByteR: 0, see _additions/net.ts)
	l = PeekByteR(bankOf(G.udp_indb), G.udp_indbp);
	value = '';
	for (i = 1; i <= l; i++) {
		byte = PeekByteR(bankOf(G.udp_indb), G.udp_indbp + i);
		value = value + Chr(byte);
	}
	G.udp_indbp = G.udp_indbp + Cudp_size_tiny + l;
	return value;
}

//Read Text
/** Function udp_r_txt$() */
export function udp_r_txt(): string {
	let l = 0;
	let value = '';
	let i = 0;
	let byte = 0;
	// quirk: no range check (see udp_r_tiny)
	l = PeekShortR(bankOf(G.udp_indb), G.udp_indbp);
	value = '';
	for (i = 1; i <= l; i++) {
		byte = PeekByteR(bankOf(G.udp_indb), G.udp_indbp + i + 1);
		value = value + Chr(byte);
	}
	G.udp_indbp = G.udp_indbp + Cudp_size_txt + l;
	return value;
}
