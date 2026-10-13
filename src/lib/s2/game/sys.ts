/**
 * Blitz3D system commands and Windows calls the game uses, for the browser:
 * CommandLine, SystemProperty, AppTitle, ExecFile, End, DebugLog, the
 * clipboard userlib, and the network commands (an interface only).
 */
import { fromGameString, toGameString } from '../ui/bb';
import { host } from '../ui/host';
import { ROOT_DIR } from './files';

// ---------------------------------------------------------------- program

let commandLine: string | null = null;

/**
 * CommandLine$(): the text after the program name. In the browser it is
 * the `cmd` query parameter (`?cmd=-debug -win`), or the plain switches
 * `?debug`, `?win`, `?mod=Name`.
 */
export function CommandLine(): string {
	if (commandLine !== null) return commandLine;
	if (typeof location === 'undefined') return '';
	const q = new URLSearchParams(location.search);
	const cmd = q.get('cmd');
	if (cmd !== null) return toGameString(cmd);
	let out = '';
	if (q.has('debug')) out += ' -debug';
	if (q.has('win')) out += ' -win';
	if (q.has('mod')) out += ` -mod "${q.get('mod')}"`;
	return toGameString(out);
}

/** Tests / embedding pages: fix the command line. null = read it from the URL again. */
export function setCommandLine(cmd: string | null): void {
	commandLine = cmd;
}

/** SystemProperty$(name): "APPDIR" is the virtual program directory; everything else is "". */
export function SystemProperty(name: string): string {
	switch (name.toLowerCase()) {
		case 'appdir':
			return ROOT_DIR;
		default:
			return '';
	}
}

/** AppTitle title$: the page title. */
export function AppTitle(title: string): void {
	if (typeof document !== 'undefined') document.title = fromGameString(title);
}

/** Raised by End: the main loop stops and shuts down without showing an error. */
export class EndProgram extends Error {
	constructor() {
		super('End');
		this.name = 'EndProgram';
	}
}

/** `End`: ends the program from anywhere. */
export function End(): never {
	throw new EndProgram();
}

const debugLog: string[] = [];
/** DebugLog txt$: goes to the debugger in Blitz, i.e. nowhere in the shipped game. Kept for tests. */
export function DebugLog(txt: string | number): void {
	debugLog.push(String(txt));
	if (debugLog.length > 1000) debugLog.shift();
}
export const debugLogLines: readonly string[] = debugLog;

/**
 * ExecFile file$: the original opens web pages (the Unreal Software site,
 * the mod's readme) and, for the script command "exec", programs. URLs open
 * in a new tab; everything else is refused and reported in the browser console.
 */
export function ExecFile(file: string): void {
	const target = fromGameString(file).trim();
	if (/^(https?:\/\/|www\.)/i.test(target)) {
		if (typeof window !== 'undefined') window.open(/^www\./i.test(target) ? 'http://' + target : target, '_blank', 'noopener');
		return;
	}
	console.warn(`ExecFile("${target}") is not possible in the browser`);
}

/** Windowed3D(): the page is a window. */
export function Windowed3D(): number {
	return 1;
}

/** GfxMode3DExists(w,h,depth): every mode "exists", the canvas is scaled. */
export function GfxMode3DExists(_w: number, _h: number, _depth: number): number {
	return 1;
}

/** TotalVidMem() / AvailVidMem(): con_memory prints them. Unknown in a browser. */
export function TotalVidMem(): number {
	return 0;
}
export function AvailVidMem(): number {
	return 0;
}

// ---------------------------------------------------------------- clipboard (functions.bb copy / paste$)

/** copy(txt$): user32 OpenClipboard/SetClipboardData. The mirror of ui/host.ts makes paste() synchronous. */
export function copy(txt: string): void {
	host.copy(txt);
}

/** paste$() */
export function paste(): string {
	return host.paste();
}

// ---------------------------------------------------------------- network (not implemented)

/**
 * What the multiplayer and U.S.G.N. code needs from a transport. Browsers
 * have neither UDP sockets nor raw TCP, so nothing implements this yet: the
 * ported udp_*.bb / tcpcommands.bb / mp_usgn.bb call these functions, and
 * every one of them reports "no network" the way the Blitz command does when
 * it fails (0 / ""). A WebSocket or WebRTC relay can be plugged in with
 * setNetwork() without touching the ported code.
 */
export interface Network {
	/** OpenTCPStream(server$,port): stream handle, 0 on failure. */
	OpenTCPStream(server: string, port: number): number;
	CloseTCPStream(stream: number): void;
	/** WriteLine / ReadLine$ / Eof / ReadAvail on a TCP stream. */
	WriteLine(stream: number, txt: string): void;
	ReadLine(stream: number): string;
	Eof(stream: number): number;
	ReadAvail(stream: number): number;
	/** CreateUDPStream(port): stream handle, 0 on failure. */
	CreateUDPStream(port: number): number;
	CloseUDPStream(stream: number): void;
	/** SendUDPMsg stream,dest_ip,dest_port with the bytes written to the stream since the last send. */
	SendUDPMsg(stream: number, data: Uint8Array, destIp: number, destPort: number): void;
	/** RecvUDPMsg(stream): the next datagram, null when there is none. */
	RecvUDPMsg(stream: number): { ip: number; port: number; data: Uint8Array } | null;
	/** UDPStreamIP / UDPStreamPort of the local socket. */
	UDPStreamIP(stream: number): number;
	UDPStreamPort(stream: number): number;
	/** CountHostIPs(""), HostIP(n), DottedIP$(ip) */
	CountHostIPs(host: string): number;
	HostIP(index: number): number;
}

const noNetwork: Network = {
	OpenTCPStream: () => 0,
	CloseTCPStream() {},
	WriteLine() {},
	ReadLine: () => '',
	Eof: () => 1,
	ReadAvail: () => 0,
	CreateUDPStream: () => 0,
	CloseUDPStream() {},
	SendUDPMsg() {},
	RecvUDPMsg: () => null,
	UDPStreamIP: () => 0,
	UDPStreamPort: () => 0,
	CountHostIPs: () => 0,
	HostIP: () => 0
};

/** The transport. Ported network code calls `NET.OpenTCPStream(...)` etc. */
export let NET: Network = noNetwork;

export function setNetwork(n: Network | null): void {
	NET = n ?? noNetwork;
}

/** DottedIP$(ip): "a.b.c.d" of an Int IP (pure, no transport needed). */
export function DottedIP(ip: number): string {
	return `${(ip >>> 24) & 255}.${(ip >>> 16) & 255}.${(ip >>> 8) & 255}.${ip & 255}`;
}
