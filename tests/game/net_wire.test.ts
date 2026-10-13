/**
 * Package "net": byte layouts and protocol steps of udp_*.bb, tcpcommands.bb,
 * mp_usgn.bb and mp_game_functions.bb, one game runtime against raw sockets
 * of the in-memory network (game/net/loopback.ts).
 * Expected values are derived from the original source, branch by branch.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CreatePivot, EntityX, EntityY, EntityYaw, EntityZ, PositionEntity } from '../../src/lib/s2/bb3d';
import { BankSize, BlitzRuntimeError, setClock } from '../../src/lib/s2/blitz';
import { CreateImage } from '../../src/lib/s2/gfx2d';
import * as NS from '../../src/lib/s2/game/_additions/net';
import { bankOf, netOptions, resetUdpStreams } from '../../src/lib/s2/game/_additions/net';
import {
	Cbmpf_dark,
	Cbmpf_green,
	Cbmpf_red,
	Cbmpf_tiny,
	Cbmpf_yellow,
	Cchatshow,
	Csection_game_mp,
	Cudp_cest_ack,
	Cudp_cest_exists,
	Cudp_cest_nohost,
	Cudp_cest_timeout
} from '../../src/lib/s2/game/consts';
import * as e_load_map from '../../src/lib/s2/game/e_load_map';
import { readFileBytes } from '../../src/lib/s2/game/files';
import { clearDeferred, setFrameHook, setFrameScheduler } from '../../src/lib/s2/game/flow';
import * as game_functions from '../../src/lib/s2/game/game_functions';
import * as handle_units from '../../src/lib/s2/game/handle_units';
import * as load_bmpf from '../../src/lib/s2/game/load_bmpf';
import { mp_checkname, mp_client_checkmap, mp_getplayer, mp_getplayerdata, mp_getplayerid, mp_scoreboard, mp_server_joinrequest, mp_server_sendplayerdata } from '../../src/lib/s2/game/mp_game_functions';
import { usgn_hostserver, usgn_joinserver, usgn_setup, usgn_update } from '../../src/lib/s2/game/mp_usgn';
import { LoopbackNet, ipToInt, ipToString, type LoopbackMachine } from '../../src/lib/s2/game/net/loopback';
import { createTestRuntime, disposeRuntime } from '../../src/lib/s2/game/runtime';
import { G, resetGameState } from '../../src/lib/s2/game/state';
import { debugLogLines, setCommandLine, setNetwork } from '../../src/lib/s2/game/sys';
import { tcp_callscript, tcp_loadfile } from '../../src/lib/s2/game/tcpcommands';
import { CONST_STORE, DeleteEach, Each, First, Last, New, TYPES, Tcon, Tmsg, Tserver, Tudp_cest, Tudp_con, Tudp_ipq, Tudp_msg, Tudp_resend, Tudp_spq, Tunit } from '../../src/lib/s2/game/types';
import { udp_clear, udp_con_delete, udp_getip, udp_int, udp_ip, udp_join, udp_setup, udp_update, udp_windowing } from '../../src/lib/s2/game/udp_functions';
import { udp_r_byte, udp_r_float, udp_r_int, udp_r_short, udp_r_tiny, udp_r_txt, udp_send, udp_w_byte, udp_w_float, udp_w_int, udp_w_short, udp_w_tiny, udp_w_txt } from '../../src/lib/s2/game/udp_messages';
import { udp_process } from '../../src/lib/s2/game/udp_processing';

const ME = '10.0.0.1';
const PEER = '10.0.0.2';
const PORT = 36963;

/** A plain socket on another machine: the "other program". */
class Raw {
	readonly h: number;
	constructor(
		readonly m: LoopbackMachine,
		readonly port: number
	) {
		this.h = m.CreateUDPStream(port);
	}
	send(bytes: number[], toIp = ME, toPort = PORT): void {
		this.m.SendUDPMsg(this.h, Uint8Array.from(bytes), ipToInt(toIp), toPort);
	}
	recv(): number[] | null {
		const d = this.m.RecvUDPMsg(this.h);
		return d ? [...d.data] : null;
	}
	recvAll(): number[][] {
		const out: number[][] = [];
		for (let d = this.recv(); d !== null; d = this.recv()) out.push(d);
		return out;
	}
}

/** A packet as udp_update() sends it: Short id, then every byte Xor 5. */
const packet = (id: number, body: number[]): number[] => [id & 255, id >> 8, ...body.map((b) => b ^ 5)];
/** ... and back. */
const unpack = (d: number[]): { id: number; body: number[] } => ({ id: d[0] | (d[1] << 8), body: d.slice(2).map((b) => b ^ 5) });
const chars = (s: string): number[] => [...s].map((c) => c.charCodeAt(0));
const con = (): string[] => [...Each(Tcon)].map((c) => c.txt);
/** if_msg puts the newest message first; this is the order they were shown in. */
const msgs = (): { msg: string; col: number }[] => [...Each(Tmsg)].reverse().map((m) => ({ msg: m.msg, col: m.col }));
const lastMsgBytes = (): number[] => [...bankOf(Last(Tudp_msg)!.db).data];
const count = (t: { list: { count: number } }): number => t.list.count;

function unit(id: number, name = '', x = 0, y = 0, z = 0): Tunit {
	const u = New(Tunit);
	u.id = id;
	u.typ = 1;
	u.h = CreatePivot();
	PositionEntity(u.h, x, y, z);
	u.player_name = name;
	return u;
}

describe('net: wire formats and protocol steps', () => {
	let now = 0;
	let net: LoopbackNet;
	let me: LoopbackMachine;
	let peer: Raw;

	beforeEach(async () => {
		await createTestRuntime();
		setFrameScheduler((cb) => cb());
		now = 100000;
		setClock(() => now);
		net = new LoopbackNet();
		me = net.machine(ME);
		setNetwork(me);
		peer = new Raw(net.machine(PEER), 4000);
		// other packages
		vi.spyOn(load_bmpf, 'bmpf_loadscreen').mockResolvedValue();
		vi.spyOn(e_load_map, 'load_map').mockResolvedValue(1);
		vi.spyOn(game_functions, 'game_playerspawn').mockImplementation((id = -1) => {
			G.TCunit = unit(id, '', 10 * id, 5, -10 * id);
			G.tmp_spawnid = 0x0403;
			return 1;
		});
		vi.spyOn(handle_units, 'set_unit').mockImplementation((id, _typ, x, z) => {
			G.TCunit = unit(id, '', x, 0, z);
			return 1;
		});
	});

	afterEach(() => {
		setNetwork(null);
		resetUdpStreams();
		netOptions.strictBanks = false;
		disposeRuntime();
		resetGameState();
		clearDeferred();
		setFrameScheduler(null);
		setFrameHook(null);
		setCommandLine(null);
		setClock(() => performance.now());
		for (const t of Object.values(TYPES)) {
			try {
				DeleteEach(t);
			} catch {
				// the Tconst view
			}
		}
		CONST_STORE.clear();
		vi.restoreAllMocks();
	});

	// ------------------------------------------------------------------ udp_messages.bb

	describe('udp_send, udp_w_*, udp_r_*', () => {
		it('writes every value type little endian into the newest message', () => {
			udp_send(ipToInt(PEER), 4000, 7);
			udp_w_byte(300); // low 8 bits
			udp_w_short(0x12345); // low 16 bits
			udp_w_int(0x12345678); // quirk: PokeShort into 4 bytes
			udp_w_float(1.5);
			udp_w_tiny('ab\xe4');
			udp_w_txt('hi');
			const m = Last(Tudp_msg)!;
			expect(lastMsgBytes()).toEqual([7, 44, 0x45, 0x23, 0x78, 0x56, 0, 0, 0, 0, 0xc0, 0x3f, 3, 0x61, 0x62, 0xe4, 2, 0, 0x68, 0x69]);
			expect([m.ip, m.port, m.reliable, m.system]).toEqual([ipToInt(PEER), 4000, 1, 0]);

			// and reads them back in the same order
			G.udp_indb = m.db;
			G.udp_indbp = 0;
			G.udp_indbs = BankSize(bankOf(m.db));
			expect(udp_r_byte()).toBe(7);
			expect(udp_r_byte()).toBe(44);
			expect(udp_r_short()).toBe(0x2345);
			expect(udp_r_int()).toBe(0x5678); // what is left of 0x12345678
			expect(udp_r_float()).toBe(1.5);
			expect(udp_r_tiny()).toBe('ab\xe4');
			expect(udp_r_txt()).toBe('hi');
			expect(G.udp_indbp).toBe(20);
			// at the end: the checked readers answer 0 and stay
			expect([udp_r_byte(), udp_r_short(), udp_r_int(), udp_r_float()]).toEqual([0, 0, 0, 0]);
			expect(G.udp_indbp).toBe(20);
			// the unchecked ones read behind the bank (0 here) and move on
			expect(udp_r_tiny()).toBe('');
			expect(G.udp_indbp).toBe(21);
			expect(udp_r_txt()).toBe('');
			expect(G.udp_indbp).toBe(23);
		});

		it('a short, an int or a float that does not fit completely is not read', () => {
			udp_send(1, 1, 9);
			udp_w_byte(1);
			udp_w_byte(2);
			const m = Last(Tudp_msg)!;
			G.udp_indb = m.db;
			G.udp_indbp = 0;
			G.udp_indbs = 3;
			expect(udp_r_int()).toBe(0);
			expect(udp_r_float()).toBe(0);
			expect(G.udp_indbp).toBe(0);
			expect(udp_r_short()).toBe(9 | (1 << 8));
			expect(udp_r_short()).toBe(0);
			expect(udp_r_byte()).toBe(2);
		});

		it('tiny text is cut to 255 bytes, a text length is a Short', () => {
			udp_send(1, 1, 1);
			udp_w_tiny('x'.repeat(300));
			let b = lastMsgBytes();
			expect(b.length).toBe(1 + 1 + 255);
			expect(b[1]).toBe(255);
			udp_send(1, 1, 1);
			udp_w_txt('y'.repeat(300));
			b = lastMsgBytes();
			expect(b.length).toBe(1 + 2 + 300);
			expect([b[1], b[2]]).toEqual([300 & 255, 300 >> 8]);
			expect(b[302]).toBe(0x79);
		});

		it('ids from 250 on are system messages; reliable is what the caller says', () => {
			udp_send(1, 2, 255, 0);
			let m = Last(Tudp_msg)!;
			expect([m.system, m.reliable]).toEqual([1, 0]);
			udp_send(1, 2, 250);
			m = Last(Tudp_msg)!;
			expect([m.system, m.reliable]).toEqual([1, 1]);
			udp_send(1, 2, 249, 0);
			m = Last(Tudp_msg)!;
			expect([m.system, m.reliable]).toEqual([0, 0]);
		});

		it('udp_r_tiny with the throwing bank accessors raises the debug runtime error', () => {
			udp_send(1, 1, 1);
			const m = Last(Tudp_msg)!;
			G.udp_indb = m.db;
			G.udp_indbp = 1;
			G.udp_indbs = 1;
			netOptions.strictBanks = true;
			expect(() => udp_r_tiny()).toThrow('Offset out of range');
		});
	});

	// ------------------------------------------------------------------ udp_functions.bb

	describe('udp_windowing', () => {
		it('id2 = -1 is always inside', () => {
			expect(udp_windowing(10, -1)).toBe(1);
			expect(udp_windowing(60000, -1)).toBe(1);
		});
		it('start of the id range: inside means ahead by at most 32767', () => {
			expect(udp_windowing(10, 10)).toBe(0);
			expect(udp_windowing(10, 8)).toBe(0);
			expect(udp_windowing(10, 12)).toBe(1);
			expect(udp_windowing(10, 10 + 32767)).toBe(1);
			expect(udp_windowing(10, 10 + 32768)).toBe(0);
			expect(udp_windowing(-1, 0)).toBe(1); // udp_system: id-1 with id 0
		});
		it('end of the id range: everything above, and the wrapped part below', () => {
			expect(udp_windowing(40000, 40000)).toBe(0);
			expect(udp_windowing(40000, 40002)).toBe(1);
			expect(udp_windowing(40000, 65534)).toBe(1);
			// 32767-(65534-40000) = 7233
			expect(udp_windowing(40000, 7233)).toBe(1);
			expect(udp_windowing(40000, 7234)).toBe(0);
			expect(udp_windowing(32767, 0)).toBe(1);
			expect(udp_windowing(32767, 1)).toBe(0);
			expect(udp_windowing(65534, 0)).toBe(1);
			expect(udp_windowing(65534, 32767)).toBe(1);
			expect(udp_windowing(65534, 32768)).toBe(0);
		});
	});

	describe('udp_ip, udp_int, udp_getip', () => {
		it('udp_int packs a.b.c.d with a in the top byte', () => {
			expect(udp_int('10.0.0.2')).toBe(0x0a000002);
			expect(udp_int('192.168.1.20')).toBe(ipToInt('192.168.1.20'));
			expect(udp_int('192.168.1.20')).toBeLessThan(0); // a signed Int
			expect(udp_int('1.2.3.4xyz')).toBe(0x01020304);
		});

		it('udp_ip: "local", empty, and text that is no address', () => {
			expect(udp_ip('LOCAL')).toBe(0x7f000001);
			expect(udp_ip('')).toBe(0x7f000001);
			expect(udp_ip('1.2.3.4')).toBe(0x01020304);
			expect(udp_ip('nonsense')).toBe(0);
			expect(udp_ip('1.2')).toBe(0);
			expect(udp_ip('1.2.3')).toBe(0);
		});

		it('udp_ip resolves a URL by connecting to it: port by protocol, name as written', () => {
			const opened: [string, number][] = [];
			const open = me.OpenTCPStream.bind(me);
			vi.spyOn(me, 'OpenTCPStream').mockImplementation((server, port) => {
				opened.push([server, port]);
				return open(server, port);
			});
			net.serveTcp('www.example.org', 80, () => null, '93.184.216.34');
			expect(udp_ip('www.example.org')).toBe(ipToInt('93.184.216.34'));
			// the protocol prefix stays in the host name (and so nothing answers)
			expect(udp_ip('https://www.example.org')).toBe(0);
			expect(udp_ip('ftp://x')).toBe(0);
			expect(udp_ip('SSH://x')).toBe(0);
			expect(udp_ip('irc://x')).toBe(0);
			expect(udp_ip('gopher://x')).toBe(0);
			expect(opened).toEqual([
				['www.example.org', 80],
				['https://www.example.org', 443],
				['ftp://x', 21],
				['SSH://x', 22],
				['irc://x', 6667],
				['gopher://x', 80]
			]);
		});

		it('udp_getip asks the U.S.G.N. for the own address', () => {
			expect(udp_getip()).toBe(0); // no server
			const requests: string[] = [];
			net.serveTcp('usgn.unrealsoftware.de', 80, (req, from) => {
				requests.push(req);
				return ipToString(from.ip) + '\r\n';
			});
			expect(udp_getip()).toBe(1);
			expect(requests).toEqual(['GET http://usgn.unrealsoftware.de/getip.php\r\n']);
			expect(G.udp_ip).toBe(ipToInt(ME));
		});
	});

	describe('udp_setup, udp_clear', () => {
		it('opens the socket and remembers its port; 0 stays 0 when the port is taken', () => {
			expect(udp_setup(PORT)).toBe(0);
			expect(G.udp).not.toBe(0);
			expect(G.udp_port).toBe(PORT);
			const taken = new Raw(me, 5000);
			expect(taken.h).not.toBe(0);
			udp_setup(5000);
			expect(G.udp).toBe(0);
			expect(G.udp_port).toBe(0);
			udp_setup();
			expect(G.udp_port).toBeGreaterThanOrEqual(49152);
		});

		it('udp_clear closes the socket and empties every list', () => {
			udp_setup(PORT);
			New(Tudp_con);
			New(Tudp_cest);
			for (const t of [Tudp_ipq, Tudp_spq, Tudp_resend]) {
				udp_send(1, 1, 1);
				(New(t as typeof Tudp_ipq) as { db: number }).db = Last(Tudp_msg)!.db;
			}
			G.udp_ip = 5;
			udp_clear();
			expect([G.udp, G.udp_port, G.udp_ip]).toEqual([0, 0, 0]);
			expect([Tudp_con, Tudp_ipq, Tudp_spq, Tudp_msg, Tudp_cest, Tudp_resend].map(count)).toEqual([0, 0, 0, 0, 0, 0]);
			// the port is free again
			expect(new Raw(me, PORT).h).not.toBe(0);
		});

		it('without a network CreateUDPStream fails', () => {
			setNetwork(null);
			udp_setup(PORT);
			expect(G.udp).toBe(0);
		});
	});

	describe('connection establishing (1 byte datagrams)', () => {
		it('a host answers a request with 20, a repeated one with 21', () => {
			udp_setup(PORT);
			G.udp_host = 1;
			peer.send([10]);
			udp_update();
			expect(peer.recvAll()).toEqual([[Cudp_cest_ack]]);
			const c = First(Tudp_con)!;
			expect([c.ip, c.port, c.iid, c.sid, c.ack, c.lastaction, c.resend]).toEqual([ipToInt(PEER), 4000, 2, 0, now, now, 0]);

			peer.send([10]);
			udp_update(); // received, but the send interval (100 ms) is not over
			expect(peer.recvAll()).toEqual([]);
			now += 100;
			udp_update();
			expect(peer.recvAll()).toEqual([[Cudp_cest_exists]]);
			expect(count(Tudp_con)).toBe(1);
		});

		it('a program that is no host answers 31 and makes no connection', () => {
			udp_setup(PORT);
			G.udp_host = 0;
			peer.send([10]);
			udp_update();
			expect(peer.recvAll()).toEqual([[Cudp_cest_nohost]]);
			expect(count(Tudp_con)).toBe(0);
		});

		it('server info request 100: a host answers with the fixed placeholder, unencrypted', () => {
			udp_setup(PORT);
			G.udp_host = 1;
			G.set_sv_name = 'Real name';
			peer.send([100]);
			udp_update();
			expect(peer.recvAll()).toEqual([[101, 3, 0, 0, 0, ...chars('Bla'), 8, 0, 0, 0, ...chars('mp_sawmp'), 1, 4, 0]]);
			G.udp_host = 0;
			peer.send([100]);
			peer.send([77]); // unknown id: ignored
			peer.send([1, 2]); // 2 bytes: invalid
			now += 100;
			udp_update();
			expect(peer.recvAll()).toEqual([]);
		});

		it('udp_join: sends 10 every `rate` ms until the answer; 20 and 21 make the connection', () => {
			udp_setup();
			const host = new Raw(net.machine(PEER), PORT);
			let polls = 0;
			net.onIdle = () => {
				now += 100;
				if (++polls === 12) host.send([Cudp_cest_ack], ME, G.udp_port);
			};
			const stale = New(Tudp_con);
			stale.ip = ipToInt(PEER);
			stale.port = PORT;
			stale.iid = 40;
			expect(udp_join(ipToInt(PEER), PORT, 10000, 500)).toBe(1);
			// a request at once and one when more than 500 ms have passed (poll 7); the next would be at poll 13
			expect(host.recvAll()).toEqual([[10], [10]]);
			expect([G.udp_hostip, G.udp_hostport]).toEqual([ipToInt(PEER), PORT]);
			expect(count(Tudp_con)).toBe(1);
			expect(First(Tudp_con)!.iid).toBe(2); // the old connection was replaced
		});

		it('udp_join: any other answer is returned as it is; silence is 32 after the timeout', () => {
			udp_setup();
			const host = new Raw(net.machine(PEER), PORT);
			net.onIdle = () => {
				now += 100;
				host.send([Cudp_cest_nohost], ME, G.udp_port);
			};
			expect(udp_join(ipToInt(PEER), PORT)).toBe(Cudp_cest_nohost);
			expect(count(Tudp_con)).toBe(0);

			const start = now;
			net.onIdle = () => {
				now += 250;
			};
			expect(udp_join(ipToInt(PEER), 1, 3000, 1000)).toBe(Cudp_cest_timeout);
			expect(now - start).toBeGreaterThanOrEqual(3000);

			// a datagram that is not 1 byte long is skipped
			let sent = false;
			net.onIdle = () => {
				now += 250;
				if (!sent) host.send([20, 20], ME, G.udp_port);
				sent = true;
			};
			expect(udp_join(ipToInt(PEER), PORT, 1000, 1000)).toBe(Cudp_cest_timeout);
		});
	});

	describe('packets', () => {
		beforeEach(() => {
			udp_setup(PORT);
			G.udp_host = 1;
			peer.send([10]);
			udp_update();
			peer.recvAll();
			now += 100;
		});

		it('incoming: Short id, bytes Xor 5; processed one update later, in order of the ids', () => {
			peer.send(packet(4, [100, 2, 1, 0, 0x42, Cbmpf_green]));
			peer.send(packet(2, [100, 2, 1, 0, 0x41, Cbmpf_red]));
			udp_update(); // queued by udp_get, which runs after udp_process_queued
			expect(msgs()).toEqual([]);
			expect([...Each(Tudp_ipq)].map((p) => [p.id, p.reliable, p.system, [...bankOf(p.db).data]])).toEqual([
				[4, 1, 0, [100, 2, 1, 0, 0x42, Cbmpf_green]],
				[2, 1, 0, [100, 2, 1, 0, 0x41, Cbmpf_red]]
			]);
			udp_update();
			expect(msgs()).toEqual([
				{ msg: 'A', col: Cbmpf_red },
				{ msg: 'B', col: Cbmpf_green }
			]);
			expect(count(Tudp_ipq)).toBe(0);
			expect(First(Tudp_con)!.iid).toBe(6);
		});

		it('a packet that is already queued, or older than expected, is ignored', () => {
			peer.send(packet(4, [100, 2, 1, 0, 0x42, 0]));
			peer.send(packet(4, [100, 2, 1, 0, 0x58, 0])); // same id: dropped on arrival
			udp_update();
			expect(count(Tudp_ipq)).toBe(1);
			peer.send(packet(2, [100, 2, 1, 0, 0x41, 0]));
			udp_update();
			udp_update();
			expect(msgs().map((m) => m.msg)).toEqual(['A', 'B']);
			peer.send(packet(2, [100, 2, 1, 0, 0x5a, 0])); // id 2 again, expected is 6: discarded
			udp_update();
			udp_update();
			expect(msgs().map((m) => m.msg)).toEqual(['A', 'B']);
			expect(count(Tudp_ipq)).toBe(0);
		});

		it('packets from an address without connection are thrown away', () => {
			const stranger = new Raw(net.machine('10.0.0.3'), 4000);
			stranger.send(packet(2, [100, 2, 1, 0, 0x41, 0]));
			udp_update();
			udp_update();
			expect(count(Tudp_ipq)).toBe(0);
			expect(msgs()).toEqual([]);
		});

		it('a gap: the packet waits, a request (254) goes out after 100 ms and then every 500 ms', () => {
			peer.send(packet(4, [100, 2, 1, 0, 0x42, 0]));
			udp_update();
			udp_update(); // 4 is not 2: request timer
			const c = First(Tudp_con)!;
			expect(c.resend).toBe(now + 100);
			expect(debugLogLines.at(-1)).toBe('request 2');
			expect(peer.recvAll()).toEqual([]);
			now += 100;
			udp_update();
			// unreliable packet: id = sid+1 = 1; request for packet 2
			expect(peer.recvAll()).toEqual([packet(1, [254, 2, 0])]);
			expect(c.resend).toBe(now + 500);
			now += 400;
			udp_update();
			expect(peer.recvAll()).toEqual([]);
			now += 100;
			udp_update();
			expect(peer.recvAll()).toEqual([packet(1, [254, 2, 0])]);
			// no acknowledgements while a request is open
			now += 2000;
			udp_update();
			expect(peer.recvAll()).toEqual([packet(1, [254, 2, 0])]);
			// the missing packet arrives: both are processed, the request ends
			peer.send(packet(2, [100, 2, 1, 0, 0x41, 0]));
			udp_update();
			udp_update();
			expect(msgs().map((m) => m.msg)).toEqual(['A', 'B']);
			expect(c.resend).toBe(0);
			expect(c.iid).toBe(6);
		});

		it('acknowledgement (255) every 2000 ms: the next expected id, in an unreliable packet', () => {
			peer.send(packet(2, [100, 2, 1, 0, 0x41, 0]));
			udp_update();
			udp_update();
			expect(peer.recvAll()).toEqual([]);
			now += 1900; // 2000 ms after the connection was made
			udp_update();
			expect(peer.recvAll()).toEqual([packet(1, [255, 4, 0])]);
			expect([...packet(1, [255, 4, 0])]).toEqual([1, 0, 250, 1, 5]);
			expect(count(Tudp_spq)).toBe(0); // unreliable: not kept
		});

		it('outgoing: messages of one interval share a packet, system messages first; ids 2, 4, ..', () => {
			const ip = ipToInt(PEER);
			udp_send(ip, 4000, 100);
			udp_w_byte(2);
			udp_w_txt('yo');
			udp_w_byte(1);
			udp_send(ip, 4000, 50, 0); // an unreliable message in a reliable packet
			udp_w_byte(9);
			udp_send(ip, 4000, 255, 0);
			udp_w_short(2);
			udp_update();
			expect(peer.recvAll()).toEqual([packet(2, [255, 2, 0, 100, 2, 2, 0, 0x79, 0x6f, 1, 50, 9])]);
			const q = First(Tudp_spq)!;
			expect([q.id, q.sended, q.reliable, count(Tudp_spq), count(Tudp_msg)]).toEqual([2, 1, 1, 1, 0]);

			// nothing goes out before the interval is over; then the next id
			udp_send(ip, 4000, 5);
			udp_update();
			expect(peer.recvAll()).toEqual([]);
			now += 100;
			udp_update();
			expect(peer.recvAll()).toEqual([packet(4, [5])]);

			// an unreliable packet gets the odd id above the last reliable one and is not kept
			udp_send(ip, 4000, 50, 0);
			now += 100;
			udp_update();
			expect(peer.recvAll()).toEqual([packet(5, [50])]);
			expect([...Each(Tudp_spq)].map((p) => p.id)).toEqual([2, 4]);
		});

		it('a message to an address without connection makes one', () => {
			udp_send(ipToInt('10.0.0.3'), 1234, 5);
			udp_update();
			expect([...Each(Tudp_con)].map((c) => [c.ip, c.port, c.sid])).toEqual([
				[ipToInt(PEER), 4000, 0],
				[ipToInt('10.0.0.3'), 1234, 2]
			]);
		});

		it('an incoming acknowledgement dumps the sent packets up to AND INCLUDING its id', () => {
			const ip = ipToInt(PEER);
			for (let k = 0; k < 3; k++) {
				udp_send(ip, 4000, 5);
				udp_update();
				now += 100;
			}
			expect([...Each(Tudp_spq)].map((p) => p.id)).toEqual([2, 4, 6]);
			// "I expect 4 next": 2 is acknowledged, but 4 goes too
			peer.send(packet(1, [255, 4, 0]));
			udp_update();
			expect([...Each(Tudp_spq)].map((p) => p.id)).toEqual([6]);
			expect(debugLogLines.slice(-2)).toEqual(['discard 2', 'discard 4']);
			expect(count(Tudp_ipq)).toBe(0); // a packet of system messages only is removed
		});

		it('an incoming request resends that packet, dumps the older ones, and leaves a packet of garbage', () => {
			const ip = ipToInt(PEER);
			const bodies = [
				[100, 2, 1, 0, 0x41, 1],
				[100, 2, 1, 0, 0x42, 2],
				[100, 2, 1, 0, 0x43, 3]
			];
			for (const b of bodies) {
				udp_send(ip, 4000, b[0]);
				for (const v of b.slice(1)) udp_w_byte(v);
				udp_update();
				now += 100;
			}
			expect(peer.recvAll()).toEqual([packet(2, bodies[0]), packet(4, bodies[1]), packet(6, bodies[2])]);
			peer.send(packet(1, [254, 4, 0]));
			udp_update();
			// the same bytes again under the same id
			expect(peer.recvAll()).toEqual([packet(4, bodies[1])]);
			expect([...Each(Tudp_spq)].map((p) => p.id)).toEqual([4, 6]);
			expect(count(Tudp_resend)).toBe(0);
			// quirk: `size` became the size of packet 4 (6), the loop ran behind the 3 byte request,
			// and the request packet stays in the queue, 5 bytes long, as an unreliable packet
			const left = First(Tudp_ipq)!;
			expect([left.id, left.reliable, left.system, [...bankOf(left.db).data]]).toEqual([1, 0, 0, [0, 0, 0, 0, 0]]);
			udp_update();
			expect(con()).toEqual(['process unreliable packet', ...Array(5).fill('ERROR: Got unexpected Message (#0)')]);
			expect(count(Tudp_ipq)).toBe(0);
		});

		it('an acknowledgement in front of other messages leaves two stale bytes behind them', () => {
			// [255 6 0] [100 2 "hi" col]: the server message is processed, then 'h' and 'i' as message ids
			peer.send(packet(2, [255, 6, 0, 100, 2, 2, 0, 0x68, 0x69, Cbmpf_yellow]));
			udp_update();
			expect([...bankOf(First(Tudp_ipq)!.db).data]).toEqual([100, 2, 2, 0, 0x68, 0x69, Cbmpf_yellow, 0x68, 0x69]);
			udp_update();
			expect(msgs()).toEqual([{ msg: 'hi', col: Cbmpf_yellow }]);
			expect(con()).toEqual(['ERROR: Got unexpected Message (#104)', 'ERROR: Got unexpected Message (#105)']);
		});

		it('a single byte behind the system messages is lost with them', () => {
			peer.send(packet(2, [255, 2, 0, 77]));
			udp_update();
			expect(count(Tudp_ipq)).toBe(0);
			udp_update();
			expect(con()).toEqual([]);
			// and the reliable id 2 was never counted: the connection still waits for it
			expect(First(Tudp_con)!.iid).toBe(2);
		});

		it('ids wrap after 65534: the sender goes on with 0, the receiver expects 2', () => {
			const c = First(Tudp_con)!;
			const ip = ipToInt(PEER);
			c.sid = 65532;
			udp_send(ip, 4000, 5);
			udp_update();
			now += 100;
			udp_send(ip, 4000, 5);
			udp_update();
			now += 100;
			udp_send(ip, 4000, 5);
			udp_update();
			expect(peer.recvAll().map((d) => unpack(d).id)).toEqual([65534, 0, 2]);

			c.iid = 65534;
			peer.send(packet(40000, [100, 2, 1, 0, 0x58, 0])); // an old one from the upper half: discarded
			peer.send(packet(65534, [100, 2, 1, 0, 0x41, 0]));
			udp_update();
			udp_update();
			expect(msgs().map((m) => m.msg)).toEqual(['A']);
			expect(c.iid).toBe(2);
			// the sender's next packet has id 0, which is "older than 2": lost. Then 2 is taken.
			peer.send(packet(0, [100, 2, 1, 0, 0x42, 0]));
			peer.send(packet(2, [100, 2, 1, 0, 0x43, 0]));
			udp_update();
			udp_update();
			expect(msgs().map((m) => m.msg)).toEqual(['A', 'C']);
			expect(c.iid).toBe(4);
			expect(count(Tudp_ipq)).toBe(0);
		});

		it('ids wrap: packets 0 and 2 that overtake 65534 are thrown away as old', () => {
			const c = First(Tudp_con)!;
			c.iid = 65534;
			peer.send(packet(2, [100, 2, 1, 0, 0x43, 0]));
			peer.send(packet(65534, [100, 2, 1, 0, 0x41, 0]));
			udp_update();
			udp_update();
			expect(msgs().map((m) => m.msg)).toEqual(['A']);
			expect([c.iid, count(Tudp_ipq)]).toEqual([2, 0]);
		});

		it('a connection without incoming packets is deleted after 20 s', () => {
			now += 19800;
			udp_update();
			expect(count(Tudp_con)).toBe(1);
			now += 100;
			udp_update();
			expect(count(Tudp_con)).toBe(0);
			// udp_con_delete on its own
			const c = New(Tudp_con);
			udp_con_delete(c);
			expect(count(Tudp_con)).toBe(0);
		});
	});

	// ------------------------------------------------------------------ udp_processing.bb

	describe('udp_process', () => {
		const FROM = ipToInt(PEER);

		/** Runs udp_process over these message bytes, as a packet from PEER:4000. */
		function process(body: number[]): void {
			udp_send(FROM, 4000, body[0]);
			for (const b of body.slice(1)) udp_w_byte(b);
			const m = Last(Tudp_msg)!;
			const p = New(Tudp_ipq);
			p.ip = FROM;
			p.port = 4000;
			p.db = m.db;
			Tudp_msg.list.delete(m);
			udp_process(p);
			Tudp_ipq.list.delete(p);
		}
		const f32le = (v: number): number[] => [...new Uint8Array(new Float32Array([v]).buffer)];
		const tiny = (s: string): number[] => [s.length, ...chars(s)];
		const txt = (s: string): number[] => [s.length & 255, s.length >> 8, ...chars(s)];

		it('1: join request -> mp_server_joinrequest; the answer 2/1 byte for byte', () => {
			unit(1, 'Host');
			G.set_sv_playerlimit = 4;
			G.set_sv_name = 'Island';
			G.set_sv_map = 'adventure';
			G.map_id = '4711x';
			process([1, ...tiny('  New Guy! '), ...tiny('')]);
			const u = Last(Tunit)!;
			expect([u.id, u.player_name, u.player_ip, u.player_port]).toEqual([2, 'New Guy_', FROM, 4000]);
			expect(lastMsgBytes()).toEqual([
				2,
				1,
				...tiny('New Guy_'),
				2,
				FROM & 255,
				(FROM >> 8) & 255,
				0, // quirk: udp_w_int writes 16 bits of the IP
				0,
				...tiny('Island'),
				...tiny('adventure'),
				...tiny('4711x'),
				0x03,
				0x04,
				0,
				0
			]);
			expect(msgs()).toEqual([{ msg: 'New Guy_ connected!', col: Cbmpf_yellow }]);
		});

		it('1: wrong password and full server', () => {
			unit(1, 'Host');
			G.set_sv_playerlimit = 4;
			G.set_sv_pw = 'secret';
			process([1, ...tiny('A'), ...tiny('guess')]);
			expect(lastMsgBytes()).toEqual([2, 2]);
			process([1, ...tiny('A'), ...tiny('secret')]);
			expect(lastMsgBytes().slice(0, 2)).toEqual([2, 1]);
			G.set_sv_playerlimit = 2;
			process([1, ...tiny('B'), ...tiny('secret')]);
			expect(lastMsgBytes()).toEqual([2, 3]);
			expect([...Each(Tunit)].map((u) => u.id)).toEqual([1, 2]);
		});

		it('2/1: join answer -> mp_* and set_sv_*, then the map check; the spawn id is read as message ids', () => {
			const load_map_id = vi.spyOn(e_load_map, 'load_map_id').mockReturnValue('4711x');
			G.set_sv_ip = FROM;
			G.set_sv_port = 4000;
			process([2, 1, ...tiny('Me(2)'), 3, 0x34, 0x12, 0, 0, ...tiny('Island'), ...tiny('adventure'), ...tiny('4711x'), 9, 0, 0, 0]);
			expect([G.mp_name, G.mp_id, G.mp_ip, G.set_sv_name, G.set_sv_map, G.mp_joinserver]).toEqual(['Me(2)', 3, 0x1234, 'Island', 'adventure', 1]);
			expect(load_map_id).toHaveBeenCalledWith('maps\\adventure.s2');
			expect(con()).toEqual(['ERROR: Got unexpected Message (#9)', ...Array(3).fill('ERROR: Got unexpected Message (#0)')]);
			expect(count(Tudp_msg)).toBe(0);
		});

		it('2/2 and 2/3 end the program; other sub ids do nothing', () => {
			expect(() => process([2, 2])).toThrow(new BlitzRuntimeError('Join: Wrong Password'));
			expect(() => process([2, 3])).toThrow(new BlitzRuntimeError('Join: Full'));
			process([2, 4]);
			process([2]);
			expect(con()).toEqual([]);
		});

		it('mp_client_checkmap: missing map asks for it (3/2), a different one reports it (3/7)', () => {
			const load_map_id = vi.spyOn(e_load_map, 'load_map_id');
			G.set_sv_ip = FROM;
			G.set_sv_port = 4000;
			load_map_id.mockReturnValue('0');
			mp_client_checkmap('m', 'abc');
			expect([G.mp_joinserver, lastMsgBytes()]).toEqual([2, [3, 2]]);
			load_map_id.mockReturnValue('abd');
			mp_client_checkmap('m', 'abc');
			expect([G.mp_joinserver, lastMsgBytes()]).toEqual([3, [3, 7]]);
			const m = Last(Tudp_msg)!;
			expect([m.ip, m.port, m.reliable]).toEqual([FROM, 4000, 1]);
			load_map_id.mockReturnValue('abc');
			mp_client_checkmap('m', 'abc');
			expect([G.mp_joinserver, count(Tudp_msg)]).toEqual([1, 2]);
		});

		it('3/1: only a host sends the player data, and greets with the placeholder text', () => {
			const host = unit(1, 'Host', 1, 2, 3);
			host.player_score = 7;
			host.player_deads = 1;
			host.player_ping = 0;
			const other = unit(2, 'Other', 4, 5, 6);
			other.player_ip = ipToInt('10.0.0.3');
			other.player_port = 4100;
			other.player_ping = 55;
			const neu = unit(3, 'New', 7, 8, 9);
			neu.player_ip = FROM;
			neu.player_port = 4000;
			neu.player_score = 2;

			const yaw0 = f32le(EntityYaw(host.h)); // the yaw of an unturned entity, as EntityYaw reports it

			G.udp_host = 0;
			process([3, 1]);
			expect([count(Tudp_msg), msgs()]).toEqual([0, []]);

			G.udp_host = 1;
			process([3, 1]);
			expect(msgs()).toEqual([{ msg: 'BLAAAH joined the game!', col: Cbmpf_green }]);
			const out = [...Each(Tudp_msg)].map((m) => [m.ip, m.port, [...bankOf(m.db).data]]);
			expect(out).toEqual([
				// the others to the new player (3/100): name, id, x, y, z, yaw, score, deads, 1, ping
				[FROM, 4000, [3, 100, ...tiny('Host'), 1, ...f32le(1), ...f32le(2), ...f32le(3), ...yaw0, 7, 0, 1, 0, 1, 0, 0]],
				[FROM, 4000, [3, 100, ...tiny('Other'), 2, ...f32le(4), ...f32le(5), ...f32le(6), ...yaw0, 0, 0, 0, 0, 1, 55, 0]],
				// the new player to the other clients (3/101), not to the host itself; ping of the receiver
				[ipToInt('10.0.0.3'), 4100, [3, 101, ...tiny('New'), 3, ...f32le(7), ...f32le(8), ...f32le(9), ...yaw0, 2, 0, 0, 0, 1, 55, 0]]
			]);
			expect(con()).toEqual([
				'send player data New #1 To 10.0.0.2:4000',
				'send player data New #2 To 10.0.0.2:4000',
				'send player data New #3 To 10.0.0.3:4100'
			]);
			// an address that is no player: nothing
			DeleteEach(Tudp_msg);
			mp_server_sendplayerdata(ipToInt('10.9.9.9'), 1);
			expect(count(Tudp_msg)).toBe(0);
		});

		it('3/100 and 3/101: player data makes or updates the unit', () => {
			process([3, 100, ...tiny('Host'), 1, ...f32le(1.5), ...f32le(2), ...f32le(-3), ...f32le(90), 7, 0, 2, 0, 1, 55, 0]);
			const u = First(Tunit)!;
			expect([u.id, u.player_name, u.player_score, u.player_deads, u.player_ping]).toEqual([1, 'Host', 7, 2, 55]);
			expect([EntityX(u.h), EntityY(u.h), EntityZ(u.h)]).toEqual([1.5, 2, -3]);
			expect(EntityYaw(u.h)).toBeCloseTo(90, 3);
			expect(msgs()).toEqual([]);
			expect(con()).toEqual(['get player data Host #1']);
			// the same id again: no second unit; mode 101 announces
			process([3, 101, ...tiny('Hosty'), 1, ...f32le(0), ...f32le(0), ...f32le(0), ...f32le(0), 0, 0, 0, 0, 1, 0, 0]);
			expect(count(Tunit)).toBe(1);
			expect(u.player_name).toBe('Hosty');
			expect(msgs()).toEqual([{ msg: 'Hosty joined the game!', col: Cbmpf_green }]);
			expect(handle_units.set_unit).toHaveBeenCalledTimes(1);
			expect(handle_units.set_unit).toHaveBeenCalledWith(1, 1, 1.5, -3);
		});

		it('5/1: a ping request is answered with the same stamp', () => {
			process([5, 1, 0x10, 0x20, 0, 0]);
			expect(lastMsgBytes()).toEqual([5, 2, 0x10, 0x20, 0, 0]);
			expect([Last(Tudp_msg)!.ip, Last(Tudp_msg)!.port, Last(Tudp_msg)!.reliable]).toEqual([FROM, 4000, 1]);
			expect(con()).toEqual(['!3 GOT PING mode 1']);
		});

		it('5/2: the answer sets the ping of the player with that address', () => {
			const a = unit(2, 'A');
			a.player_ip = FROM;
			a.player_port = 4000;
			const b = unit(150, 'no player');
			b.player_ip = FROM;
			b.player_port = 4000;
			// a stamp from the future is ignored
			process([5, 2, 0xff, 0xff, 0xff, 0x7f]);
			expect(a.player_ping).toBe(0);
			// 100000-0x2010
			process([5, 2, 0x10, 0x20, 0, 0]);
			expect(a.player_ping).toBe(now - 0x2010);
			expect(b.player_ping).toBe(0);
			expect(con()).toEqual(['!3 GOT PING mode 2', '!3 GOT PING mode 2']);
		});

		it('5/3: ping data for a player id; unknown sub ids only print', () => {
			const a = unit(2, 'A');
			process([5, 3, 2, 0x2c, 0x01]);
			expect(a.player_ping).toBe(300);
			process([5, 9]);
			expect(con()).toEqual(['!3 GOT PING mode 3', '!3 GOT PING mode 9']);
		});

		it('50: position and yaw of a player', () => {
			const a = unit(2, 'A');
			process([50, 2, ...f32le(12.25), ...f32le(3), ...f32le(-40.5), ...f32le(45)]);
			expect([EntityX(a.h), EntityY(a.h), EntityZ(a.h)]).toEqual([12.25, 3, -40.5]);
			expect(EntityYaw(a.h)).toBeCloseTo(45, 3);
			process([50, 9, ...f32le(1), ...f32le(1), ...f32le(1), ...f32le(1)]); // nobody
			expect(con()).toEqual(['GOT POS! #2', 'GOT POS! #9']);
		});

		it('100/1: chat is shown, and a host passes it on (not to the same IP, not to the same port)', () => {
			unit(2, 'Alice');
			const cons: [string, number][] = [
				[PEER, 4000], // the sender
				[PEER, 4001], // same IP
				['10.0.0.3', 4000], // same port
				['10.0.0.4', 4100]
			];
			for (const [ip, port] of cons) {
				const c = New(Tudp_con);
				c.ip = ipToInt(ip);
				c.port = port;
			}
			G.ms = 5000;
			process([100, 1, 2, ...txt('hello')]);
			expect([...Each(Tmsg)].map((m) => [m.msg, m.col, m.age])).toEqual([['Alice: hello', 0, 5000 + Cchatshow]]);
			expect(count(Tudp_msg)).toBe(0); // not a host
			G.udp_host = 1;
			process([100, 1, 2, ...txt('again')]);
			expect([...Each(Tudp_msg)].map((m) => [m.ip, m.port, m.reliable, [...bankOf(m.db).data]])).toEqual([[ipToInt('10.0.0.4'), 4100, 1, [100, 1, 2, ...txt('again')]]]);
			// a player id nobody has: no text, but still passed on
			process([100, 1, 77, ...txt('x')]);
			expect(count(Tmsg)).toBe(2);
			expect(count(Tudp_msg)).toBe(2);
		});

		it('100/2: server message with its colour; unknown ids are reported', () => {
			process([100, 2, ...txt('Server says hi'), Cbmpf_red, 100, 3, 99]);
			expect(msgs()).toEqual([{ msg: 'Server says hi', col: Cbmpf_red }]);
			expect(con()).toEqual(['ERROR: Got unexpected Message (#99)']);
		});
	});

	// ------------------------------------------------------------------ mp_game_functions.bb

	describe('mp_checkname, mp_getplayerid, mp_getplayer, mp_scoreboard', () => {
		it('trims, cuts to 15 and replaces everything but letters, digits and " ()-.[]_"', () => {
			expect(mp_checkname('  Hans Wurst!?  ', 0)).toBe('Hans Wurst_');
			expect(mp_checkname('1234567890abcdefXYZ', 0)).toBe('1234567890abcde');
			expect(mp_checkname('(a-b).[c]_d', 0)).toBe('(a-b).[c]_d');
			expect(mp_checkname('a{b', 0)).toBe('a_b');
			expect(mp_checkname('a\xe4^@:/b', 0)).toBe('a___b'); // five replaced chars; "__" -> "_" runs once: 2+2+1 -> 1+1+1
			expect(mp_checkname('', 0)).toBe('Mr. Stranded');
			expect(mp_checkname('   ', 0)).toBe('Mr. Stranded');
		});

		it('"__" is replaced once from left to right', () => {
			expect(mp_checkname('a!!!b', 0)).toBe('a__b');
			expect(mp_checkname('a!!!!b', 0)).toBe('a__b');
			expect(mp_checkname('a!!b', 0)).toBe('a_b');
		});

		it('a name a player (id below 100) already has gets a number', () => {
			unit(1, 'Bob');
			unit(200, 'Tom');
			expect(mp_checkname('Bob')).toBe('Bob(2)');
			expect(mp_checkname('Bob', 0)).toBe('Bob');
			expect(mp_checkname('Tom')).toBe('Tom');
			unit(2, 'Bob(2)');
			unit(3, 'Bob(3)');
			expect(mp_checkname('Bob')).toBe('Bob(4)');
		});

		it('mp_getplayerid: the first unused id from 1; mp_getplayer: by address, sets TCunit', () => {
			expect(mp_getplayerid()).toBe(1);
			unit(1);
			unit(2);
			const u = unit(4);
			expect(mp_getplayerid()).toBe(3);
			u.player_ip = 77;
			u.player_port = 88;
			const npc = unit(100);
			npc.player_ip = 5;
			npc.player_port = 6;
			expect(mp_getplayer(77, 88)).toBe(4);
			expect(G.TCunit).toBe(u);
			expect(mp_getplayer(77, 89)).toBe(0);
			expect(mp_getplayer(5, 6)).toBe(0);
		});

		it('mp_server_joinrequest gives the lowest free id from 2', () => {
			unit(2, 'x');
			unit(3, 'y');
			G.set_sv_playerlimit = 9;
			mp_server_joinrequest(1, 2, 'z', '');
			expect(game_functions.game_playerspawn).toHaveBeenCalledWith(4, -1);
			expect(G.TCunit!.id).toBe(4);
		});

		it('mp_getplayerdata reads the ten values in order', () => {
			udp_send(1, 1, 3);
			udp_w_tiny('N');
			udp_w_byte(5);
			for (const v of [1, 2, 3, 4]) udp_w_float(v);
			udp_w_short(300);
			udp_w_short(2);
			udp_w_byte(1);
			udp_w_short(99);
			const m = Last(Tudp_msg)!;
			G.udp_indb = m.db;
			G.udp_indbp = 1;
			G.udp_indbs = BankSize(bankOf(m.db));
			mp_getplayerdata(100);
			expect(G.udp_indbp).toBe(G.udp_indbs);
			const u = G.TCunit!;
			expect([u.id, u.player_name, u.player_score, u.player_deads, u.player_ping, EntityY(u.h)]).toEqual([5, 'N', 300, 2, 99, 2]);
		});

		it('mp_scoreboard lists the players with the ping colour', () => {
			const calls: unknown[][] = [];
			vi.spyOn(load_bmpf, 'bmpf_txt').mockImplementation((...a) => void calls.push(a));
			vi.spyOn(load_bmpf, 'bmpf_txt_c').mockImplementation((...a) => void calls.push(['c', ...a]));
			G.gfx_win = CreateImage(8, 8);
			G.gfx_winbar = CreateImage(8, 8);
			G.gfx_icons = CreateImage(8, 8, 100);
			G.set_sv_name = 'Island';
			G.set_sv_ip = ipToInt(ME);
			G.set_sv_port = PORT;
			G.set_sv_map = 'adventure';
			unit(1, 'Host');
			unit(2, 'Fast').player_ping = 99;
			unit(3, 'Mid').player_ping = 199;
			unit(4, 'Slow').player_ping = 200;
			unit(100, 'Animal');
			mp_scoreboard();
			expect(calls).toEqual([
				[273, 10, 'Island'],
				['c', 673, 7, '10.0.0.1:36963', Cbmpf_tiny],
				['c', 673, 19, 'adventure', Cbmpf_tiny],
				[236, 63, 'Player', Cbmpf_dark],
				[536, 63, 'Score', Cbmpf_dark],
				[606, 63, 'Deads', Cbmpf_dark],
				[706, 63, 'Net', Cbmpf_dark],
				[236, 83, 'Host'],
				[236, 98, 'Server', Cbmpf_tiny],
				[706, 83, '...', Cbmpf_dark],
				[236, 123, 'Fast'],
				[706, 123, '99', Cbmpf_green],
				[236, 163, 'Mid'],
				[706, 163, '199', Cbmpf_yellow],
				[236, 203, 'Slow'],
				[706, 203, '200', Cbmpf_red]
			]);
		});
	});

	// ------------------------------------------------------------------ mp_usgn.bb

	describe('U.S.G.N.', () => {
		let requests: string[];
		beforeEach(() => {
			requests = [];
			net.serveTcp('usgn.unrealsoftware.de', 80, (req, from) => {
				requests.push(req);
				if (req.includes('ips.txt')) return '1.0.0.1  \r\n Welcome to the U.S.G.N.\r\n10.0.0.2:4000\r\n\r\n  192.168.1.20:36963  \r\n';
				if (req.includes('save.php')) return ipToString(from.ip) + '\r\n';
				return null;
			});
		});

		it('usgn_setup: one request line, version, message, then the server list', async () => {
			New(Tserver).name = 'old';
			await usgn_setup();
			expect(load_bmpf.bmpf_loadscreen).toHaveBeenCalledWith('Loading U.S.G.N. Serverlist');
			expect(requests).toEqual(['GET http://usgn.unrealsoftware.de/game_stranded2/ips.txt\r\n']);
			expect([G.in_usgn_version, G.in_usgn_msg, G.in_usgn_msgscr]).toEqual(['1.0.0.1', 'Welcome to the U.S.G.N.', 500]);
			expect([...Each(Tserver)].map((s) => [s.ip, s.port, s.name])).toEqual([
				[ipToInt(PEER), 4000, ''],
				[ipToInt('192.168.1.20'), 36963, '']
			]);
			expect(G.udp).not.toBe(0);
			expect(con()).toEqual([]);
		});

		it('usgn_setup: in debug mode the servers are printed; without the master server the old list stays', async () => {
			G.set_debug = 1;
			await usgn_setup();
			expect(con()).toEqual(['!1 Got U.S.G.N. Server 10.0.0.2:4000', '!1 Got U.S.G.N. Server 192.168.1.20:36963']);
			const lonely = new LoopbackNet().machine(ME);
			setNetwork(lonely);
			await usgn_setup();
			expect(count(Tserver)).toBe(2);
		});

		it('usgn_setup without sockets ends the program', async () => {
			setNetwork(null);
			await expect(usgn_setup()).rejects.toThrow(new BlitzRuntimeError('Failed to initialize UDP Sockets'));
			await expect(usgn_joinserver(1, 2)).rejects.toThrow(new BlitzRuntimeError('Failed to initialize UDP Sockets'));
		});

		it('usgn_update: asks a server (100) at most every 15 s and reads its answer (101)', async () => {
			await usgn_setup();
			const s = First(Tserver)!;
			G.ms = 15000; // not more than 15000 since timer 0
			usgn_update();
			expect(peer.recvAll()).toEqual([]);
			G.ms = 15001;
			usgn_update();
			expect(peer.recvAll()).toEqual([[100]]);
			expect([s.timer, s.pingstamp]).toEqual([15001, 15001]);
			expect(con()).toEqual(['send request to 10.0.0.2:4000', 'send request to 192.168.1.20:36963']);
			G.ms = 30001;
			usgn_update();
			expect(peer.recvAll()).toEqual([]);
			// with a ping the 3 s rule applies
			s.ping = 40;
			G.ms = 18002;
			usgn_update();
			expect(peer.recvAll()).toEqual([[100]]);

			const to = G.udp_port;
			peer.send([101, 4, 0, 0, 0, ...chars('Isle'), 3, 0, 0, 0, ...chars('map'), 2, 8, 1], ME, to);
			new Raw(net.machine('10.0.0.3'), 4000).send([101, 1, 0, 0, 0, 0x58, 1, 0, 0, 0, 0x58, 9, 9, 9], ME, to); // not in the list
			usgn_update();
			expect([s.name, s.map, s.players, s.maxplayers, s.password]).toEqual(['Isle', 'map', 2, 8, 1]);
			expect(Last(Tserver)!.name).toBe('');

			// anything else is skipped, and reported in debug mode
			peer.send([55, 1, 2, 3], ME, to);
			usgn_update();
			G.set_debug = 1;
			peer.send([55, 1, 2, 3], ME, to);
			usgn_update();
			expect(con().at(-1)).toBe('!3 ERROR: Unexpected U.S.G.N. Message: 55');
		});

		it('usgn_hostserver: socket at the port, registration, map, player 1', async () => {
			G.in_win_map = 'adventure';
			G.set_name = 'The Host!';
			G.m_menu = 9;
			await usgn_hostserver(PORT);
			expect(load_bmpf.bmpf_loadscreen).toHaveBeenCalledWith('Adding Server to U.S.G.N. Serverlist');
			expect(requests).toEqual(['GET http://usgn.unrealsoftware.de/game_stranded2/save.php?port=36963\r\n']);
			expect([G.udp_port, G.udp_host, G.set_sv_port, G.set_sv_ip]).toEqual([PORT, 1, PORT, ipToInt(ME)]);
			expect(e_load_map.load_map).toHaveBeenCalledWith('maps\\adventure.s2', '');
			expect(game_functions.game_playerspawn).toHaveBeenCalledWith(1);
			const u = G.g_cplayer!;
			expect([G.m_section, G.m_menu, G.g_player, u.id, u.player_name, u.player_ip, u.player_port]).toEqual([Csection_game_mp, 0, 1, 1, 'The Host_', ipToInt(ME), PORT]);
		});

		it('usgn_hostserver: a taken port ends the program; no master server leaves the IP 0', async () => {
			const taken = new Raw(me, PORT);
			await expect(usgn_hostserver(PORT)).rejects.toThrow(new BlitzRuntimeError('Failed to create server at UDP Port 36963!'));
			me.CloseUDPStream(taken.h);
			setNetwork(new LoopbackNet().machine(ME));
			await usgn_hostserver(PORT);
			expect([G.udp_host, G.set_sv_ip, G.g_cplayer!.player_ip]).toEqual([1, 0, 0]);
		});

		it('usgn_joinserver: 0 when the other side is no host or does not answer the join request', async () => {
			const other = new Raw(net.machine(PEER), PORT);
			net.onIdle = () => {
				now += 100;
				const d = other.recv();
				if (d && d.length === 1) other.send([Cudp_cest_nohost], ME, G.udp_port);
			};
			expect(await usgn_joinserver(ipToInt(PEER), PORT)).toBe(0);
			expect(count(Tudp_msg)).toBe(0);

			// accepted, but then silence: the request goes out as packet 2, and after 10 s the function gives up
			G.set_name = 'Me';
			const got: number[][] = [];
			net.onIdle = () => {
				now += 100;
				const d = other.recv();
				if (!d) return;
				if (d.length === 1) other.send([Cudp_cest_ack], ME, G.udp_port);
				else got.push(d);
			};
			const start = now;
			expect(await usgn_joinserver(ipToInt(PEER), PORT, 'pw')).toBe(0);
			expect(now - start).toBeGreaterThan(10000);
			expect(got[0]).toEqual(packet(2, [1, 2, 0x4d, 0x65, 2, 0x70, 0x77]));
			expect([G.set_sv_ip, G.set_sv_port, G.udp_host]).toEqual([ipToInt(PEER), PORT, 0]);
			expect(e_load_map.load_map).not.toHaveBeenCalled();
		});
	});

	// ------------------------------------------------------------------ tcpcommands.bb

	describe('tcp_loadfile, tcp_callscript', () => {
		const REQUEST = 'GET http://example.org/dir/file.bin HTTP/1.1\r\nHost: example.org\r\nUser-Agent: Stranded II\r\nAccept: */*\r\n\r\n';

		it('tcp_loadfile writes Content-Length bytes of the body into the file, byte for byte', () => {
			const requests: string[] = [];
			net.serveTcp('example.org', 80, (req) => {
				requests.push(req);
				return 'HTTP/1.1 200 OK\r\nServer: x\r\nCONTENT-LENGTH:   7  \r\nContent-Type: a/b\r\n\r\nA\r\nB\x00\xff\nrest';
			});
			expect(tcp_loadfile('example.org', 'dir\\file.bin', 'got.bin')).toBe(0);
			expect(requests).toEqual([REQUEST]);
			expect([...readFileBytes('got.bin')!]).toEqual([0x41, 13, 10, 0x42, 0, 255, 10]);
			// quirk: the loop variable is size+1 after a complete download, so the result is "0" all the same
			expect(G.p_return).toBe('0');
			expect(con()).toEqual([]);
		});

		it('tcp_loadfile: a body that ends early', () => {
			net.serveTcp('example.org', 80, () => 'HTTP/1.1 200 OK\r\nContent-Length: 5\r\n\r\nabc');
			tcp_loadfile('example.org', 'f', 'part.bin');
			expect([...readFileBytes('part.bin')!]).toEqual([0x61, 0x62, 0x63]);
			expect(con()).toEqual(["!3 ERROR: Unable to finish download of 'http://example.org/f' (4 of 5 Bytes)"]);
			expect(G.p_return).toBe('0');
		});

		it('tcp_loadfile: absolute path, no server, no length', () => {
			G.p_return = 'x';
			tcp_loadfile('example.org', 'f', 'C:\\autoexec.bat');
			expect(G.p_return).toBe('0');
			tcp_loadfile('example.org', 'f', 'a.bin');
			net.serveTcp('example.org', 80, () => 'HTTP/1.1 404 Not Found\r\n\r\nnothing here');
			tcp_loadfile('example.org', 'f', 'a.bin');
			expect(con()).toEqual([
				"!3 ERROR: Absolute path 'C:\\autoexec.bat' for loadfile command is not allowed",
				"!3 ERROR: Unable to connect to 'example.org'",
				"!3 ERROR: Unable to download 'http://example.org/f' (file not found or invalid http header)"
			]);
			expect(readFileBytes('a.bin')).toBeNull();
		});

		it('tcp_callscript puts the body into pv_buffer$, lines joined by the script separator', () => {
			const requests: string[] = [];
			net.serveTcp('example.org', 80, (req) => {
				requests.push(req);
				return 'HTTP/1.1 200 OK\r\nX: y\r\n\r\nmsg "a";\r\n\r\nmsg "b";';
			});
			G.pv_buffer = 'old';
			tcp_callscript('example.org', 'dir\\file.bin');
			expect(requests).toEqual([REQUEST]);
			expect(G.pv_buffer).toBe('msg "a";\xa6\xa6msg "b";\xa6');
			expect(G.p_return).toBe('1');

			tcp_callscript('nowhere.example', 's.php');
			expect([G.p_return, G.pv_buffer]).toEqual(['0', '']);
			expect(con()).toEqual(["!3 ERROR: Unable to connect to 'nowhere.example'"]);
		});
	});

	// ------------------------------------------------------------------ _additions/net.ts

	describe('UDP stream commands', () => {
		it('writes collect, SendUDPMsg sends one datagram; RecvUDPMsg replaces the read buffer', () => {
			const s = NS.CreateUDPStream(700);
			expect(NS.UDPStreamPort(s)).toBe(700);
			NS.WriteByte(s, 0x1ff);
			NS.WriteShort(s, 0x12345);
			NS.WriteInt(s, -2);
			NS.WriteString(s, 'a\xe4');
			NS.SendUDPMsg(s, ipToInt(PEER), 4000);
			NS.SendUDPMsg(s, ipToInt(PEER), 4000); // the buffer is empty again
			expect(peer.recvAll()).toEqual([[0xff, 0x45, 0x23, 0xfe, 0xff, 0xff, 0xff, 2, 0, 0, 0, 0x61, 0xe4], []]);

			expect(NS.RecvUDPMsg(s)).toBe(0);
			peer.send([1, 2, 3, 4, 5, 6, 7], ME, 700);
			peer.send([9, 3, 0, 0, 0, 0x61, 0x62, 0x63, 5], ME, 700);
			expect(NS.RecvUDPMsg(s)).toBe(ipToInt(PEER));
			expect([NS.UDPMsgIP(s), NS.UDPMsgPort(s), NS.ReadAvail(s)]).toEqual([ipToInt(PEER), 4000, 7]);
			expect([NS.ReadByte(s), NS.ReadShort(s), NS.ReadAvail(s)]).toEqual([1, 2 | (3 << 8), 4]);
			// the unread rest is gone with the next datagram
			expect(NS.RecvUDPMsg(s)).toBe(ipToInt(PEER));
			expect([NS.ReadByte(s), NS.ReadString(s), NS.ReadByte(s), NS.ReadAvail(s)]).toEqual([9, 'abc', 5, 0]);
			// reading an empty buffer gives 0 / ""
			expect([NS.ReadByte(s), NS.ReadShort(s), NS.ReadInt(s), NS.ReadString(s)]).toEqual([0, 0, 0, '']);
			NS.CloseUDPStream(s);
			expect(NS.UDPStreamPort(s)).toBe(0);
		});
	});
});
