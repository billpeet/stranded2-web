/**
 * An in-memory network for tests: an implementation of the `Network`
 * interface of ../sys.ts that connects several game runtimes living in one
 * process. OPTIONAL: nothing of the game imports this module, and it is not a
 * transport for real play (see README.md in this directory).
 *
 *     const net = new LoopbackNet();
 *     const a = net.machine('10.0.0.1');      // one per runtime
 *     const b = net.machine('10.0.0.2');
 *     setNetwork(a);                          // sys.ts, in the runtime of machine a
 *     net.serveTcp('usgn.unrealsoftware.de', 80, (request) => '...');
 *
 * UDP: datagrams between the sockets of the machines, kept whole, delivered
 * in order unless told otherwise: `drop`, `lossRate`, `duplicateRate`,
 * `reorderRate`, `latency`, or `hold` + `release()` for a hand-made order.
 * Everything random comes from one seeded generator, so a test is repeatable.
 *
 * TCP: request / response only, which is all the game does (one or more
 * WriteLine, then reading until Eof): the handler registered with serveTcp()
 * gets the bytes the client has written when the client first reads, and
 * returns the complete answer; after it the stream is at its end.
 *
 * Blocking code: udp_join() and the wait loop of usgn_joinserver() poll
 * RecvUDPMsg in a busy loop. `onIdle` is called whenever a poll finds
 * nothing; a test uses it to run the other runtime (and to advance its clock).
 *
 * This module imports types only, so one LoopbackNet can be shared by runtimes
 * that are separate module instances (vi.resetModules() in tests).
 */
import type { Network } from '../sys';

/** A datagram on its way. */
export interface Datagram {
	/** Running number in the order of sending (1, 2, ...). */
	seq: number;
	fromIp: number;
	fromPort: number;
	toIp: number;
	toPort: number;
	data: Uint8Array;
	/** Earliest delivery time (latency); 0 = at once. */
	at: number;
}

/** The answer of a TCP server: text (one char per byte) or bytes; null = accept and close without data. */
export type TcpHandler = (request: string, from: LoopbackMachine) => string | Uint8Array | null;

interface UdpSocket {
	port: number;
	queue: Datagram[];
}

interface TcpConnection {
	handler: TcpHandler;
	remoteIp: number;
	/** bytes the client wrote */
	request: string;
	response: Uint8Array | null;
	pos: number;
}

interface TcpListener {
	host: string;
	ip: number;
	port: number;
	handler: TcpHandler;
}

/** "a.b.c.d" -> Int IP as Blitz has it (a in the top byte). */
export function ipToInt(ip: string | number): number {
	if (typeof ip === 'number') return ip | 0;
	const p = ip.split('.').map((n) => parseInt(n, 10) & 255);
	return ((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]) | 0;
}

/** Int IP -> "a.b.c.d" */
export function ipToString(ip: number): string {
	return `${(ip >>> 24) & 255}.${(ip >>> 16) & 255}.${(ip >>> 8) & 255}.${ip & 255}`;
}

export class LoopbackNet {
	private readonly machines = new Map<number, LoopbackMachine>();
	private readonly listeners: TcpListener[] = [];
	private handles = 0;
	private seq = 0;
	private rng: number;
	private idle = false;

	/** Every datagram given to SendUDPMsg, before loss and reordering (tests assert on the bytes). */
	readonly sent: Datagram[] = [];
	/** Datagrams held back by `hold` or parked by `reorderRate`. */
	readonly held: Datagram[] = [];

	/** true: datagrams are collected in `held` until release(). */
	hold = false;
	/** Return true to lose this datagram. */
	drop: ((d: Datagram) => boolean) | null = null;
	/** Probability 0..1 of losing a datagram. */
	lossRate = 0;
	/** Probability 0..1 of delivering a datagram twice. */
	duplicateRate = 0;
	/** Probability 0..1 of a datagram being overtaken by the next one to the same socket. */
	reorderRate = 0;
	/** Milliseconds a datagram travels; needs `now`. */
	latency = 0;
	/** The clock for `latency` (the same one the runtimes use for MilliSecs). */
	now: () => number = () => 0;
	/** Called when RecvUDPMsg finds nothing (not re-entered). */
	onIdle: ((machine: LoopbackMachine) => void) | null = null;

	constructor(seed = 1) {
		this.rng = seed >>> 0 || 1;
	}

	/** A machine with this address; one per game runtime. */
	machine(ip: string | number): LoopbackMachine {
		const n = ipToInt(ip);
		let m = this.machines.get(n);
		if (!m) {
			m = new LoopbackMachine(this, n);
			this.machines.set(n, m);
		}
		return m;
	}

	/**
	 * A TCP server. `host` is the name OpenTCPStream is called with (compared
	 * without case); `ip` is what TCPStreamIP answers for it.
	 */
	serveTcp(host: string, port: number, handler: TcpHandler, ip: string | number = '192.0.2.1'): void {
		this.listeners.push({ host: host.toLowerCase(), ip: ipToInt(ip), port, handler });
	}

	/** Delivers the held datagrams: in the order given by `order` (indices into `held`), else as sent. */
	release(order?: number[]): void {
		const list = this.held.splice(0);
		const seqd = order ? order.map((i) => list[i]).filter((d) => d !== undefined) : list;
		for (const d of seqd) this.deliver(d);
	}

	/** Forgets the held datagrams (they are lost). */
	discardHeld(): void {
		this.held.length = 0;
	}

	/** @internal */
	nextHandle(): number {
		return ++this.handles;
	}

	/** mulberry32 */
	private random(): number {
		let t = (this.rng += 0x6d2b79f5);
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	}

	/** @internal */
	send(from: LoopbackMachine, fromPort: number, data: Uint8Array, toIp: number, toPort: number): void {
		// 127.x.x.x is the sending machine itself
		const dest = ((toIp >>> 24) & 255) === 127 ? from.ip : toIp | 0;
		const d: Datagram = {
			seq: ++this.seq,
			fromIp: from.ip,
			fromPort,
			toIp: dest,
			toPort: toPort !== 0 ? toPort : fromPort,
			data: data.slice(),
			at: this.latency > 0 ? this.now() + this.latency : 0
		};
		this.sent.push(d);
		if (this.drop?.(d)) return;
		if (this.lossRate > 0 && this.random() < this.lossRate) return;
		if (this.hold) {
			this.held.push(d);
			return;
		}
		if (this.reorderRate > 0) {
			// a parked datagram for the same socket goes out after this one
			const i = this.held.findIndex((h) => h.toIp === d.toIp && h.toPort === d.toPort);
			if (i >= 0) {
				const [parked] = this.held.splice(i, 1);
				this.deliver(d);
				this.deliver(parked);
				return;
			}
			if (this.random() < this.reorderRate) {
				this.held.push(d);
				return;
			}
		}
		this.deliver(d);
		if (this.duplicateRate > 0 && this.random() < this.duplicateRate) this.deliver({ ...d, data: d.data.slice() });
	}

	private deliver(d: Datagram): void {
		// nobody there: a datagram to a closed port just disappears
		this.machines.get(d.toIp)?.socketAt(d.toPort)?.queue.push(d);
	}

	/** @internal */
	idleHook(m: LoopbackMachine): void {
		if (this.idle || !this.onIdle) return;
		this.idle = true;
		try {
			this.onIdle(m);
		} finally {
			this.idle = false;
		}
	}

	/** @internal */
	listener(server: string, port: number): TcpListener | null {
		const name = server.toLowerCase();
		return this.listeners.find((l) => l.port === port && (l.host === name || ipToString(l.ip) === name)) ?? null;
	}
}

/** One machine of a LoopbackNet: the `Network` of one game runtime. */
export class LoopbackMachine implements Network {
	private readonly udp = new Map<number, UdpSocket>();
	private readonly tcp = new Map<number, TcpConnection>();
	private ephemeral = 49152;

	constructor(
		readonly net: LoopbackNet,
		readonly ip: number
	) {}

	/** @internal */
	socketAt(port: number): UdpSocket | null {
		for (const s of this.udp.values()) if (s.port === port) return s;
		return null;
	}

	// ------------------------------------------------------------ UDP

	/** CreateUDPStream(port): port 0 = any free port. 0 when the port is taken. */
	CreateUDPStream(port: number): number {
		if (port === 0) {
			while (this.socketAt(this.ephemeral)) this.ephemeral++;
			port = this.ephemeral++;
		} else if (this.socketAt(port)) {
			return 0;
		}
		const h = this.net.nextHandle();
		this.udp.set(h, { port, queue: [] });
		return h;
	}

	CloseUDPStream(stream: number): void {
		this.udp.delete(stream);
	}

	SendUDPMsg(stream: number, data: Uint8Array, destIp: number, destPort: number): void {
		const s = this.udp.get(stream);
		if (!s) return;
		this.net.send(this, s.port, data, destIp, destPort);
	}

	RecvUDPMsg(stream: number): { ip: number; port: number; data: Uint8Array } | null {
		const s = this.udp.get(stream);
		if (!s) return null;
		let d = this.take(s);
		if (!d) {
			this.net.idleHook(this);
			d = this.take(s);
		}
		return d ? { ip: d.fromIp, port: d.fromPort, data: d.data } : null;
	}

	private take(s: UdpSocket): Datagram | null {
		const now = this.net.latency > 0 ? this.net.now() : 0;
		const i = s.queue.findIndex((d) => d.at === 0 || d.at <= now);
		return i < 0 ? null : s.queue.splice(i, 1)[0];
	}

	/** UDPStreamIP: the socket is bound to "any address", which Blitz reports as 0. */
	UDPStreamIP(_stream: number): number {
		return 0;
	}

	UDPStreamPort(stream: number): number {
		return this.udp.get(stream)?.port ?? 0;
	}

	/** Datagrams waiting at a socket (tests). */
	pending(stream: number): number {
		return this.udp.get(stream)?.queue.length ?? 0;
	}

	// ------------------------------------------------------------ TCP

	OpenTCPStream(server: string, port: number): number {
		const l = this.net.listener(server, port);
		if (!l) return 0;
		const h = this.net.nextHandle();
		this.tcp.set(h, { handler: l.handler, remoteIp: l.ip, request: '', response: null, pos: 0 });
		return h;
	}

	CloseTCPStream(stream: number): void {
		this.tcp.delete(stream);
	}

	/** WriteLine: the text and CR LF. */
	WriteLine(stream: number, txt: string): void {
		const c = this.tcp.get(stream);
		if (c) c.request += txt + '\r\n';
	}

	/** The answer exists from the first read on. */
	private answer(stream: number): TcpConnection | null {
		const c = this.tcp.get(stream);
		if (!c) return null;
		if (c.response === null) {
			const r = c.handler(c.request, this);
			if (r === null) c.response = new Uint8Array(0);
			else if (typeof r === 'string') c.response = Uint8Array.from(r, (ch) => ch.charCodeAt(0) & 255);
			else c.response = r;
		}
		return c;
	}

	/** ReadLine$: bytes up to LF, CR dropped (bbReadLine). */
	ReadLine(stream: number): string {
		const c = this.answer(stream);
		if (!c) return '';
		const r = c.response!;
		let out = '';
		while (c.pos < r.length) {
			const b = r[c.pos++];
			if (b === 10) break;
			if (b !== 13) out += String.fromCharCode(b);
		}
		return out;
	}

	/** ReadByte: 0 at the end of the stream. (Not in `Network`; see _additions/net.ts.) */
	ReadByte(stream: number): number {
		const c = this.answer(stream);
		if (!c) return 0;
		return c.pos < c.response!.length ? c.response![c.pos++] : 0;
	}

	/** Eof: 1 when the server has answered and everything is read. */
	Eof(stream: number): number {
		const c = this.answer(stream);
		if (!c) return 1;
		return c.pos >= c.response!.length ? 1 : 0;
	}

	ReadAvail(stream: number): number {
		const c = this.answer(stream);
		return c ? c.response!.length - c.pos : 0;
	}

	/** TCPStreamIP: the address of the server. (Not in `Network`; see _additions/net.ts.) */
	TCPStreamIP(stream: number): number {
		return this.tcp.get(stream)?.remoteIp ?? 0;
	}

	// ------------------------------------------------------------ host

	CountHostIPs(_host: string): number {
		return 1;
	}

	HostIP(_index: number): number {
		return this.ip;
	}
}
