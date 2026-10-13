/**
 * Package "net" (udp_functions.bb, udp_messages.bb, udp_processing.bb,
 * tcpcommands.bb, mp_usgn.bb, mp_game.bb, mp_game_functions.bb): substitutes
 * for things that are missing in the shared files. Everything here should
 * move to the place named in its comment. Nothing in this file is a
 * transport: every socket operation ends in `NET` of ../sys.
 *
 * 1. Blitz stream commands on a UDP stream (bbruntime/bbsockets.cpp UDPStream)
 * 2. Two TCP commands the `Network` interface lacks (ReadByte, TCPStreamIP)
 * 3. Bank fields typed `number` in types.ts / state.ts
 * 4. Bank access of the release runtime (no range check)
 */
import { CopyBank, PeekByte, PeekShort, type Bank } from '../../blitz';
import { NET, type Network } from '../sys';

// =====================================================================================
// 1. UDP stream commands
// =====================================================================================
//
// sys.ts `Network` models a datagram socket: SendUDPMsg(stream, data, ip, port) takes the
// finished datagram and RecvUDPMsg(stream) returns a whole one. Blitz has a stream on top:
//
//   WriteByte/WriteShort/WriteString udp,...   append to the stream's out buffer
//   SendUDPMsg udp,ip,port                     sends the out buffer as one datagram, empties it
//   RecvUDPMsg(udp)                            replaces the in buffer with the next datagram
//                                              (unread bytes of the previous one are lost),
//                                              returns the sender's IP, 0 when there is none
//   ReadAvail(udp)                             unread bytes of the in buffer
//   ReadByte/ReadShort/ReadString(udp)         read from the in buffer
//   UDPMsgIP(udp) / UDPMsgPort(udp)            sender of the datagram in the in buffer
//
// (UDPStream::read/write/avail/recv/send.) These buffers are what is kept here, per stream
// handle. Should become: these functions in sys.ts next to NET (or the stream commands of
// files.ts accepting a network stream), so that ported code can write `WriteByte(G.udp, x)`.

interface UdpStreamState {
	/** out_buf */
	out: number[];
	/** in_buf */
	in_: Uint8Array;
	/** in_get */
	get: number;
	msgIp: number;
	msgPort: number;
}

const udpStreams = new Map<number, UdpStreamState>();

function udpState(stream: number): UdpStreamState {
	let s = udpStreams.get(stream);
	if (s === undefined) {
		s = { out: [], in_: new Uint8Array(0), get: 0, msgIp: 0, msgPort: 0 };
		udpStreams.set(stream, s);
	}
	return s;
}

/** CreateUDPStream([port]): 0 on failure. */
export function CreateUDPStream(port = 0): number {
	const stream = NET.CreateUDPStream(port);
	if (stream !== 0) udpStreams.delete(stream); // a reused handle starts with empty buffers
	return stream;
}

/** CloseUDPStream udp_stream */
export function CloseUDPStream(stream: number): void {
	udpStreams.delete(stream);
	NET.CloseUDPStream(stream);
}

/** UDPStreamPort(udp_stream) */
export function UDPStreamPort(stream: number): number {
	return NET.UDPStreamPort(stream);
}

/** UDPStreamIP(udp_stream) */
export function UDPStreamIP(stream: number): number {
	return NET.UDPStreamIP(stream);
}

/**
 * RecvUDPMsg(udp_stream): UDPStream::recv. Returns the IP of the sender (so a
 * datagram from 0.0.0.0 reads as "nothing received", as in the original).
 */
export function RecvUDPMsg(stream: number): number {
	const m = NET.RecvUDPMsg(stream);
	if (m === null) return 0;
	const s = udpState(stream);
	s.in_ = m.data;
	s.get = 0;
	s.msgIp = m.ip | 0;
	s.msgPort = m.port;
	return s.msgIp;
}

/**
 * SendUDPMsg udp_stream,dest_ip[,dest_port]: UDPStream::send. The out buffer
 * becomes one datagram. dest_port 0 means "the port of this stream" in Blitz
 * (bbsockets.cpp: `port ? port : addr.sin_port`); the game never sends to
 * port 0 on purpose, so 0 is handed to the transport unchanged.
 */
export function SendUDPMsg(stream: number, destIp: number, destPort = 0): void {
	const s = udpState(stream);
	const data = Uint8Array.from(s.out);
	s.out.length = 0;
	NET.SendUDPMsg(stream, data, destIp, destPort);
}

/** UDPMsgIP(udp_stream) */
export function UDPMsgIP(stream: number): number {
	return udpState(stream).msgIp;
}

/** UDPMsgPort(udp_stream) */
export function UDPMsgPort(stream: number): number {
	return udpState(stream).msgPort;
}

/** ReadAvail(udp_stream): UDPStream::avail. */
export function ReadAvail(stream: number): number {
	const s = udpState(stream);
	return s.in_.length - s.get;
}

/** UDPStream::read: as many bytes as there are, the rest of the value stays 0 (bbReadByte etc. start from n=0). */
function udpRead(stream: number, size: number): Uint8Array {
	const s = udpState(stream);
	const out = new Uint8Array(size);
	const n = Math.min(size, s.in_.length - s.get);
	out.set(s.in_.subarray(s.get, s.get + n));
	s.get += n;
	return out;
}

/** ReadByte(udp_stream): 0..255, 0 when the datagram is used up. */
export function ReadByte(stream: number): number {
	return udpRead(stream, 1)[0];
}

/** ReadShort(udp_stream): 0..65535, little endian. */
export function ReadShort(stream: number): number {
	const b = udpRead(stream, 2);
	return b[0] | (b[1] << 8);
}

/** ReadInt(udp_stream): signed 32 bit, little endian. */
export function ReadInt(stream: number): number {
	const b = udpRead(stream, 4);
	return b[0] | (b[1] << 8) | (b[2] << 16) | (b[3] << 24);
}

/**
 * ReadString$(udp_stream): Int length, then the bytes (bbReadString). A
 * length that runs past the datagram gives the bytes that are there (the
 * original returns `length` bytes of which the missing ones are heap garbage).
 */
export function ReadString(stream: number): string {
	const s = udpState(stream);
	if (s.in_.length - s.get <= 0) return '';
	const len = ReadInt(stream);
	if (len <= 0) return '';
	const n = Math.min(len, s.in_.length - s.get);
	let out = '';
	for (let i = 0; i < n; i++) out += String.fromCharCode(s.in_[s.get + i]);
	s.get += n;
	return out;
}

/** WriteByte udp_stream,value: the low 8 bits. */
export function WriteByte(stream: number, value: number): void {
	udpState(stream).out.push(value & 255);
}

/** WriteShort udp_stream,value: the low 16 bits, little endian. */
export function WriteShort(stream: number, value: number): void {
	udpState(stream).out.push(value & 255, (value >> 8) & 255);
}

/** WriteInt udp_stream,value: 4 bytes, little endian. */
export function WriteInt(stream: number, value: number): void {
	udpState(stream).out.push(value & 255, (value >> 8) & 255, (value >> 16) & 255, (value >> 24) & 255);
}

/** WriteString udp_stream,txt$: Int length, then the bytes (bbWriteString). */
export function WriteString(stream: number, txt: string): void {
	WriteInt(stream, txt.length);
	const out = udpState(stream).out;
	for (let i = 0; i < txt.length; i++) out.push(txt.charCodeAt(i) & 255);
}

/** Tests: forget all stream buffers (a new session starts with new sockets). */
export function resetUdpStreams(): void {
	udpStreams.clear();
}

// =====================================================================================
// 2. TCP commands missing in sys.ts `Network`
// =====================================================================================

/**
 * sys.ts `Network` has WriteLine / ReadLine / Eof / ReadAvail for TCP streams but
 *  - no ReadByte(tcp): tcp_loadfile (script command "downloadfile") reads the file body
 *    byte by byte; ReadLine cannot stand in for it (it drops CR and LF),
 *  - no TCPStreamIP(tcp): udp_ip() resolves a host name by connecting to it.
 * Should become: both methods in `Network` (sys.ts), `ReadByte(stream): number` and
 * `TCPStreamIP(stream): number`. Until then a transport may provide them as extra
 * methods (game/net/loopback.ts does); without them the substitutes answer what Blitz
 * answers on a dead stream: 0.
 */
export interface NetworkTcpExtras {
	/** ReadByte(tcp_stream): the next byte, 0 when the stream has ended. */
	ReadByte(stream: number): number;
	/** TCPStreamIP(tcp_stream): the Int IP of the remote machine. */
	TCPStreamIP(stream: number): number;
}
export type NetworkExt = Network & Partial<NetworkTcpExtras>;

/** ReadByte(tcp_stream) */
export function TCPReadByte(stream: number): number {
	const n = NET as NetworkExt;
	return n.ReadByte ? n.ReadByte(stream) & 255 : 0;
}

/** TCPStreamIP(tcp_stream) */
export function TCPStreamIP(stream: number): number {
	const n = NET as NetworkExt;
	return n.TCPStreamIP ? n.TCPStreamIP(stream) | 0 : 0;
}

// =====================================================================================
// 3. Bank handles in fields typed `number`
// =====================================================================================

/**
 * types.ts: Tudp_ipq.db, Tudp_spq.db, Tudp_msg.db, Tudp_resend.db and state.ts: G.udp_indb
 * are typed `number` (an Int holding a bank handle in Blitz). They hold a `Bank` of
 * $lib/s2/blitz. Should become: `db: Bank | null` in the four Types and `udp_indb: Bank | null`
 * in G (generator correction table). Substitutes until then:
 */
export const bankOf = (db: number): Bank => db as unknown as Bank;
export const bankHandle = (b: Bank): number => b as unknown as number;

// =====================================================================================
// 4. Bank access without range check (release runtime)
// =====================================================================================

/**
 * blitz/bank.ts throws "Offset out of range" for every Peek/Poke/CopyBank outside the bank
 * (the debug runtime's check). The shipped executable is a release build: it reads and
 * writes whatever lies behind the bank. The UDP library depends on that in three places,
 * all of them on the normal path of a running connection:
 *
 *  - udp_system(): the "Req" case overwrites the local `size` with the size of the packet
 *    it resends, so the loop over the incoming 3 byte request packet walks on behind the
 *    bank (udp_functions.bb:555), and the CopyBank / ResizeBank at the end use that size;
 *  - udp_r_tiny() / udp_r_txt(): no range check at all (udp_messages.bb:130-151), and
 *    udp_process() reaches them with the two stale bytes udp_system() leaves at the end
 *    of a packet (ResizeBank ...,size-1 instead of size-i).
 *
 * With the throwing accessors the first lost packet (the resend request) would end the
 * program; the original carries on, processing garbage. The substitutes below read 0
 * behind the end and ignore writes behind the end: the most harmless "whatever lies
 * behind the bank". Set `netOptions.strictBanks = true` to get the throwing accessors of
 * blitz/bank.ts instead. Should become: a decision in blitz/bank.ts (a "release" mode).
 */
export const netOptions = {
	strictBanks: false
};

/** PeekByte without range check: 0 behind the end. */
export function PeekByteR(b: Bank, offset: number): number {
	if (netOptions.strictBanks) return PeekByte(b, offset);
	return offset >= 0 && offset < b.size ? b.data[offset] : 0;
}

/** PeekShort without range check: missing bytes read 0. */
export function PeekShortR(b: Bank, offset: number): number {
	if (netOptions.strictBanks) return PeekShort(b, offset);
	return PeekByteR(b, offset) | (PeekByteR(b, offset + 1) << 8);
}

/** CopyBank without range check (memmove): bytes behind the source read 0, bytes behind the destination are dropped. */
export function CopyBankR(src: Bank, srcPos: number, dest: Bank, destPos: number, count: number): void {
	if (netOptions.strictBanks) {
		CopyBank(src, srcPos, dest, destPos, count);
		return;
	}
	if (count <= 0) return;
	const tmp = new Uint8Array(count);
	for (let i = 0; i < count; i++) tmp[i] = PeekByteR(src, srcPos + i);
	for (let i = 0; i < count; i++) {
		const p = destPos + i;
		if (p >= 0 && p < dest.size) dest.data[p] = tmp[i];
	}
}

/*
 * function_index.json / skeleton corrections: none. Names, parameter order, defaults and
 * sync/async of all 42 functions are as generated.
 *
 * Remarks for the integrator (see also game/net/README.md):
 *
 * - udp_join() (sync in the index, and in the original a busy loop of up to 10 s without
 *   Flip or Delay) and the wait loop of usgn_joinserver() (`While mp_joinserver=0 :
 *   udp_update() : Wend`, no await in it) poll NET.RecvUDPMsg without ever returning to the
 *   event loop. A transport fed by WebSocket/WebRTC events can therefore never deliver the
 *   answer while they run. A browser transport needs either a synchronous receive path
 *   (worker + SharedArrayBuffer) or these two loops made asynchronous (index change:
 *   udp_join async, callers await it).
 * - With the default "no network" transport CreateUDPStream answers 0, and usgn_setup()
 *   then does what the original does on a machine without sockets:
 *   RuntimeError("Failed to initialize UDP Sockets"). menu_set(Cmenu_mp) calls it, so
 *   opening the multiplayer menu ends the program unless menu.ts guards the entry.
 */
