/**
 * Package "net": a host and a client, two complete game runtimes in one
 * process, talking through the in-memory network (game/net/loopback.ts).
 *
 * Each runtime is its own instance of the game's modules (vi.resetModules()
 * before importing them), so each has its own G, its own Type lists and its
 * own clock binding, exactly like two programs. What they share is the
 * LoopbackNet and the test's clock.
 *
 * Functions of other packages that need a loaded map (load_map,
 * game_playerspawn, set_unit, the per-frame functions of game_mp) are
 * replaced by small stand-ins; everything of the net package is real.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { LoopbackNet, ipToInt, type Datagram, type LoopbackMachine } from '../../src/lib/s2/game/net/loopback';

const HOST_IP = '10.0.0.1';
const CLIENT_IP = '10.0.0.2';
const PORT = 36963;

async function loadModules() {
	vi.resetModules();
	const [blitz, bb3d, gfx2d, state, types, sys, runtime, flow, additions, udp_functions, udp_messages, mp_game_functions, mp_usgn, mp_game, e_load_map, game_functions, handle_units, load_bmpf, input, e_environment, motionblur, cull, grasspread, game_focus, handle_states, sfx, iface, game_input, particles, projectiles, consts] =
		await Promise.all([
			import('../../src/lib/s2/blitz'),
			import('../../src/lib/s2/bb3d'),
			import('../../src/lib/s2/gfx2d'),
			import('../../src/lib/s2/game/state'),
			import('../../src/lib/s2/game/types'),
			import('../../src/lib/s2/game/sys'),
			import('../../src/lib/s2/game/runtime'),
			import('../../src/lib/s2/game/flow'),
			import('../../src/lib/s2/game/_additions/net'),
			import('../../src/lib/s2/game/udp_functions'),
			import('../../src/lib/s2/game/udp_messages'),
			import('../../src/lib/s2/game/mp_game_functions'),
			import('../../src/lib/s2/game/mp_usgn'),
			import('../../src/lib/s2/game/mp_game'),
			import('../../src/lib/s2/game/e_load_map'),
			import('../../src/lib/s2/game/game_functions'),
			import('../../src/lib/s2/game/handle_units'),
			import('../../src/lib/s2/game/load_bmpf'),
			import('../../src/lib/s2/game/input'),
			import('../../src/lib/s2/game/e_environment'),
			import('../../src/lib/s2/game/motionblur'),
			import('../../src/lib/s2/game/cull'),
			import('../../src/lib/s2/game/grasspread'),
			import('../../src/lib/s2/game/game_focus'),
			import('../../src/lib/s2/game/handle_states'),
			import('../../src/lib/s2/game/sfx'),
			import('../../src/lib/s2/game/interface'),
			import('../../src/lib/s2/game/game_input'),
			import('../../src/lib/s2/game/particles'),
			import('../../src/lib/s2/game/projectiles'),
			import('../../src/lib/s2/game/consts')
		]);
	return { blitz, bb3d, gfx2d, state, types, sys, runtime, flow, additions, udp_functions, udp_messages, mp_game_functions, mp_usgn, mp_game, e_load_map, game_functions, handle_units, load_bmpf, input, e_environment, motionblur, cull, grasspread, game_focus, handle_states, sfx, iface, game_input, particles, projectiles, consts };
}
type Modules = Awaited<ReturnType<typeof loadModules>>;

/** One program: its modules, its machine in the network, and what the stand-ins recorded. */
class Side {
	machine!: LoopbackMachine;
	/** what load_map_id() answers on this machine */
	mapId = 'island-id';
	loadedMaps: string[] = [];
	frames = 0;

	constructor(
		readonly m: Modules,
		readonly ip: string
	) {}

	get G() {
		return this.m.state.G;
	}

	async start(net: LoopbackNet, clock: { now: number }): Promise<void> {
		const m = this.m;
		await m.runtime.createTestRuntime();
		m.flow.setFrameScheduler((cb) => cb());
		m.blitz.setClock(() => clock.now);
		this.machine = net.machine(this.ip);
		m.sys.setNetwork(this.machine);
		this.mapId = 'island-id';
		this.loadedMaps = [];
		this.frames = 0;

		// ---- other packages ----
		vi.spyOn(m.load_bmpf, 'bmpf_loadscreen').mockResolvedValue();
		vi.spyOn(m.e_load_map, 'load_map').mockImplementation(async (path) => {
			this.loadedMaps.push(path);
			return 1;
		});
		vi.spyOn(m.e_load_map, 'load_map_id').mockImplementation(() => this.mapId);
		vi.spyOn(m.game_functions, 'game_playerspawn').mockImplementation((id = -1) => {
			this.G.TCunit = this.unit(id, 10 * id, 1, -10 * id);
			this.G.tmp_spawnid = 7;
			return 1;
		});
		vi.spyOn(m.handle_units, 'set_unit').mockImplementation((id, _typ, x, z) => {
			this.G.TCunit = this.unit(id, x, 0, z);
			return 1;
		});
		// the frame of game_mp(): everything that needs a map does nothing
		vi.spyOn(m.input, 'getinput').mockImplementation(() => {
			this.G.ms = m.blitz.MilliSecs();
			this.frames++;
		});
		vi.spyOn(m.input, 'endinput').mockImplementation(() => {});
		vi.spyOn(m.game_functions, 'game_setcam').mockReturnValue(0);
		vi.spyOn(m.e_environment, 'e_environment_update_water').mockImplementation(() => {});
		vi.spyOn(m.e_environment, 'RenderWorld').mockImplementation(() => {});
		vi.spyOn(m.e_environment, 'e_environment_water2dfx').mockImplementation(() => {});
		vi.spyOn(m.e_environment, 'e_environment_update').mockImplementation(() => {});
		vi.spyOn(m.motionblur, 'mb_update').mockResolvedValue();
		vi.spyOn(m.cull, 'cull').mockResolvedValue();
		vi.spyOn(m.grasspread, 'grass_spread').mockReturnValue(undefined as never);
		vi.spyOn(m.game_focus, 'focus_update').mockImplementation(() => {});
		vi.spyOn(m.handle_states, 'update_state').mockImplementation(() => {});
		vi.spyOn(m.sfx, 'sfx_update').mockImplementation(() => {});
		vi.spyOn(m.iface, 'interface_').mockResolvedValue();
		vi.spyOn(m.game_input, 'game_input_normal').mockImplementation(() => {});
		vi.spyOn(m.game_input, 'game_input_menu').mockImplementation(() => {});
		vi.spyOn(m.particles, 'p_update').mockImplementation(() => {});
		vi.spyOn(m.particles, 'p_update_2d').mockImplementation(() => {});
		vi.spyOn(m.projectiles, 'pro_update').mockImplementation(() => {});
		vi.spyOn(m.flow, 'delay').mockResolvedValue();
		this.G.gfx_cursor[6] = m.gfx2d.CreateImage(4, 4);
	}

	stop(): void {
		const m = this.m;
		m.sys.setNetwork(null);
		m.additions.resetUdpStreams();
		m.runtime.disposeRuntime();
		m.state.resetGameState();
		m.flow.clearDeferred();
		m.flow.setFrameScheduler(null);
		m.blitz.setClock(() => performance.now());
		for (const t of Object.values(m.types.TYPES)) {
			try {
				m.types.DeleteEach(t);
			} catch {
				// the Tconst view
			}
		}
		m.types.CONST_STORE.clear();
	}

	unit(id: number, x = 0, y = 0, z = 0) {
		const u = this.m.types.New(this.m.types.Tunit);
		u.id = id;
		u.typ = 1;
		u.h = this.m.bb3d.CreatePivot();
		this.m.bb3d.PositionEntity(u.h, x, y, z);
		return u;
	}

	units() {
		return [...this.m.types.Each(this.m.types.Tunit)];
	}
	player(id: number) {
		return this.units().find((u) => u.id === id)!;
	}
	pos(id: number): number[] {
		const h = this.player(id).h;
		return [this.m.bb3d.EntityX(h), this.m.bb3d.EntityY(h), this.m.bb3d.EntityZ(h)];
	}
	/** if_msg texts, oldest first */
	msgs(): string[] {
		return [...this.m.types.Each(this.m.types.Tmsg)].reverse().map((t) => t.msg);
	}
	con(): string[] {
		return [...this.m.types.Each(this.m.types.Tcon)].map((t) => t.txt);
	}
	clearLogs(): void {
		this.m.types.DeleteEach(this.m.types.Tcon);
		this.m.types.DeleteEach(this.m.types.Tmsg);
	}
	cons() {
		return [...this.m.types.Each(this.m.types.Tudp_con)];
	}
	update(): void {
		this.m.udp_functions.udp_update();
	}
	/** a server message (100/2) to the first connection */
	say(text: string, col = 0): void {
		const c = this.cons()[0];
		this.m.udp_messages.udp_send(c.ip, c.port, 100);
		this.m.udp_messages.udp_w_byte(2);
		this.m.udp_messages.udp_w_txt(text);
		this.m.udp_messages.udp_w_byte(col);
	}
}

const unpack = (d: Datagram): { id: number; body: number[] } => ({ id: d.data[0] | (d.data[1] << 8), body: [...d.data.subarray(2)].map((b) => b ^ 5) });

describe('net: host and client', () => {
	let host: Side;
	let client: Side;
	let net: LoopbackNet;
	const clock = { now: 0 };

	beforeAll(async () => {
		host = new Side(await loadModules(), HOST_IP);
		client = new Side(await loadModules(), CLIENT_IP);
	}, 120000);

	afterAll(() => {
		vi.resetModules();
	});

	beforeEach(async () => {
		clock.now = 300000;
		net = new LoopbackNet(7);
		net.now = () => clock.now;
		await host.start(net, clock);
		await client.start(net, clock);
		// the master server: only save.php is asked for here
		net.serveTcp('usgn.unrealsoftware.de', 80, (req, from) => (req.includes('save.php') ? `${(from.ip >>> 24) & 255}.${(from.ip >>> 16) & 255}.${(from.ip >>> 8) & 255}.${from.ip & 255}\r\n` : null));
	});

	afterEach(() => {
		host.stop();
		client.stop();
		vi.restoreAllMocks();
	});

	/** The packets (not the 1 byte datagrams) one side has sent, decoded. */
	function packets(from: 'host' | 'client'): { id: number; body: number[] }[] {
		const ip = ipToInt(from === 'host' ? HOST_IP : CLIENT_IP);
		return net.sent.filter((d) => d.fromIp === ip && d.data.length > 2).map(unpack);
	}

	/** Both programs run `n` updates, `ms` apart. */
	function step(n = 1, ms = 100): void {
		for (let k = 0; k < n; k++) {
			clock.now += ms;
			host.update();
			client.update();
		}
	}

	async function startHost(): Promise<void> {
		const G = host.G;
		G.set_name = 'Host';
		G.in_win_map = 'island';
		G.set_sv_name = 'Test Island';
		G.set_sv_map = 'island';
		G.set_sv_playerlimit = 4;
		G.map_id = 'island-id';
		await host.m.mp_usgn.usgn_hostserver(PORT);
	}

	/** usgn_joinserver() stands in busy loops; while it polls, the host runs. */
	async function join(password = ''): Promise<number> {
		client.G.set_name = 'Client';
		net.onIdle = (m) => {
			clock.now += 10;
			if (m === client.machine) host.update();
		};
		try {
			return await client.m.mp_usgn.usgn_joinserver(ipToInt(HOST_IP), PORT, password);
		} finally {
			net.onIdle = null;
		}
	}

	it('the two runtimes are separate programs', () => {
		expect(host.G).not.toBe(client.G);
		expect(host.m.types.Tunit).not.toBe(client.m.types.Tunit);
		host.G.set_name = 'only here';
		expect(client.G.set_name).toBe('');
	});

	it('join: request, answer, map check, player data', async () => {
		await startHost();
		expect(host.units().map((u) => [u.id, u.player_name, u.player_ip, u.player_port])).toEqual([[1, 'Host', ipToInt(HOST_IP), PORT]]);

		expect(await join()).toBe(1);

		// --- the datagrams, in order ---
		const cport = client.G.udp_port;
		const log = net.sent.map((d) => [d.fromIp === ipToInt(HOST_IP) ? 'host' : 'client', d.data.length === 1 ? d.data[0] : unpack(d)]);
		const tiny = (s: string): number[] => [s.length, ...[...s].map((c) => c.charCodeAt(0))];
		expect(log).toEqual([
			['client', 10], // connection request
			['host', 20], // acknowledged
			['client', { id: 2, body: [1, ...tiny('Client'), ...tiny('')] }], // 1: join request
			[
				'host',
				{
					id: 2,
					// 2/1: name, id, IP (16 bits of it), server name, map, map id, spawn id
					body: [2, 1, ...tiny('Client'), 2, ipToInt(CLIENT_IP) & 255, (ipToInt(CLIENT_IP) >> 8) & 255, 0, 0, ...tiny('Test Island'), ...tiny('island'), ...tiny('island-id'), 7, 0, 0, 0]
				}
			]
		]);

		// --- the client ---
		const C = client.G;
		expect([C.mp_joinserver, C.mp_name, C.mp_id, C.mp_ip, C.set_sv_name, C.set_sv_map]).toEqual([1, 'Client', 2, ipToInt(CLIENT_IP) & 0xffff, 'Test Island', 'island']);
		expect([C.set_sv_ip, C.set_sv_port, C.udp_host, C.m_section, C.m_menu, C.g_player]).toEqual([ipToInt(HOST_IP), PORT, 0, client.m.consts.Csection_game_mp, 0, 2]);
		expect(client.loadedMaps).toEqual(['maps\\island.s2']);
		expect(client.units().map((u) => [u.id, u.player_name, u.player_ip, u.player_port])).toEqual([[2, 'Client', ipToInt(CLIENT_IP) & 0xffff, cport]]);
		// the spawn id the client does not read: four "messages"
		expect(client.con()).toEqual(['ERROR: Got unexpected Message (#7)', 'ERROR: Got unexpected Message (#0)', 'ERROR: Got unexpected Message (#0)', 'ERROR: Got unexpected Message (#0)']);

		// --- the host ---
		expect(host.units().map((u) => [u.id, u.player_name, u.player_ip, u.player_port])).toEqual([
			[1, 'Host', ipToInt(HOST_IP), PORT],
			[2, 'Client', ipToInt(CLIENT_IP), cport]
		]);
		expect(host.msgs()).toEqual(['Client connected!']);
		expect(host.cons().map((c) => [c.ip, c.port])).toEqual([[ipToInt(CLIENT_IP), cport]]);

		// --- "join ok" (3/1) and the player data (3/100) ---
		net.sent.length = 0;
		step(4);
		expect(unpack(net.sent[0])).toEqual({ id: 4, body: [3, 1] });
		const data = unpack(net.sent[1]);
		expect([data.id, data.body.slice(0, 8)]).toEqual([4, [3, 100, ...tiny('Host'), 1]]);
		expect(host.msgs()).toEqual(['Client connected!', 'BLAAAH joined the game!']);
		expect(host.con()).toEqual([`send player data Client #1 To ${CLIENT_IP}:${cport}`]);
		expect(client.units().map((u) => [u.id, u.player_name])).toEqual([
			[2, 'Client'],
			[1, 'Host']
		]);
		expect(client.pos(1)).toEqual(host.pos(1));
		expect(client.con().at(-1)).toBe('get player data Host #1');
	});

	it('join: wrong password and full server end the client program (RuntimeError)', async () => {
		await startHost();
		host.G.set_sv_pw = 'secret';
		await expect(join('guess')).rejects.toThrow('Join: Wrong Password');
		expect(host.units().length).toBe(1);

		client.stop();
		await client.start(net, clock);
		host.G.set_sv_playerlimit = 1;
		await expect(join('secret')).rejects.toThrow('Join: Full');
		expect(host.units().length).toBe(1);
	});

	it('join: the client has another version of the map, or none', async () => {
		await startHost();
		client.mapId = 'other-id';
		expect(await join()).toBe(1); // quirk: "joined", but nothing is loaded
		expect(client.G.mp_joinserver).toBe(3);
		expect(client.loadedMaps).toEqual([]);
		expect(client.units()).toEqual([]);
		step(3);
		// "map differs" (3/7) went to the host, which has no code for it
		expect(packets('client').map((p) => p.body)).toEqual([[1, 6, 0x43, 0x6c, 0x69, 0x65, 0x6e, 0x74, 0], [3, 7]]);
		expect(host.con()).toEqual([]);

		client.stop();
		await client.start(net, clock);
		client.mapId = '0';
		net.sent.length = 0;
		expect(await join()).toBe(1);
		expect(client.G.mp_joinserver).toBe(2);
		step(3);
		// "map request" (3/2): not implemented either
		expect(packets('client').map((p) => p.body).at(-1)).toEqual([3, 2]);
	});

	it('join: a program that is no host refuses; nobody there is a timeout', async () => {
		host.m.udp_functions.udp_setup(PORT);
		host.G.udp_host = 0;
		expect(await join()).toBe(0);
		expect(net.sent.map((d) => [...d.data])).toEqual([[10], [31]]);

		host.m.udp_functions.udp_clear();
		net.sent.length = 0;
		const t = clock.now;
		net.onIdle = () => {
			clock.now += 240;
		};
		expect(await client.m.mp_usgn.usgn_joinserver(ipToInt(HOST_IP), PORT)).toBe(0);
		expect(clock.now - t).toBeGreaterThanOrEqual(10000);
		// rate 1000: a request whenever a poll finds more than 1000 ms passed, i.e. every 1200 ms here
		expect(net.sent.map((d) => [...d.data])).toEqual(Array(9).fill([10]));
	});

	describe('after joining', () => {
		beforeEach(async () => {
			await startHost();
			await join();
			step(4);
			host.clearLogs();
			client.clearLogs();
			net.sent.length = 0;
		});

		it('game_mp: positions go both ways every frame interval', async () => {
			// 20 ms frames; positions are sent when more than mp_sendposrate (50) ms have passed
			host.m.bb3d.PositionEntity(host.player(1).h, 100, 20, -30);
			client.m.bb3d.PositionEntity(client.player(2).h, -55.5, 3, 77.25);
			client.m.bb3d.RotateEntity(client.player(2).h, 0, 90, 0);
			for (let k = 0; k < 20; k++) {
				clock.now += 20;
				await host.m.mp_game.game_mp();
				await client.m.mp_game.game_mp();
			}
			expect(host.frames).toBe(20);
			expect(host.pos(2)).toEqual([-55.5, 3, 77.25]);
			expect(host.m.bb3d.EntityYaw(host.player(2).h)).toBeCloseTo(90, 3);
			expect(client.pos(1)).toEqual([100, 20, -30]);
			expect(host.con()).toContain('GOT POS! #2');
			expect(client.con()).toContain('GOT POS! #1');
			expect(host.m.flow.delay).toHaveBeenCalledWith(10);
			// every position message: 50, player id, four floats; all in reliable packets
			const positions = net.sent.filter((d) => d.data.length > 2).map(unpack);
			expect(positions.every((p) => p.id % 2 === 0)).toBe(true);
			const fromClient = net.sent.filter((d) => d.fromIp === ipToInt(CLIENT_IP) && d.data.length > 2).map(unpack);
			const pos = fromClient.find((p) => p.body[0] === 50)!;
			expect(pos.body.slice(0, 2)).toEqual([50, 2]);
			expect([...new Float32Array(Uint8Array.from(pos.body.slice(2, 14)).buffer)]).toEqual([-55.5, 3, 77.25]);
		});

		it('game_mp: the ping stamp travels as 16 bits, so the measured ping is off by the cut', async () => {
			// the first frame sends a ping request (5/1) at once: ms-0 > 5000
			const t0 = clock.now + 20;
			for (let k = 0; k < 30; k++) {
				clock.now += 20;
				await host.m.mp_game.game_mp();
				await client.m.mp_game.game_mp();
			}
			// the host's first packet starts with the messages of its first frame: the position (18 bytes),
			// then the ping request with MilliSecs() cut to 16 bits
			const first = packets('host')[0].body;
			expect(first.slice(0, 2)).toEqual([50, 1]);
			expect(first.slice(18, 24)).toEqual([5, 1, t0 & 255, (t0 >> 8) & 255, 0, 0]);
			// the client sends the stamp back (5/2); the host finds the client by its address and stores
			// "MilliSecs() - stamp": the round trip plus everything the cut took away (300000 = 0x40000 + ..)
			const answer = packets('client').find((p) => p.body.includes(5) && p.body[p.body.indexOf(5) + 1] === 2);
			expect(answer).toBeDefined();
			const ping = host.player(2).player_ping;
			expect(ping - 0x40000).toBeGreaterThan(0);
			expect(ping - 0x40000).toBeLessThan(600);
			// the client knows the host only from the player data, without address: its ping stays 0
			expect(client.player(1).player_ping).toBe(0);
			expect(host.con()).toContain('!3 GOT PING mode 2');
			expect(client.con()).toContain('!3 GOT PING mode 1');
		});

		it('chat (100/1) from the client is shown by the host; server messages (100/2) by the client', () => {
			// what interface.bb does when the player sends a chat line
			const c = client.cons()[0];
			client.m.udp_messages.udp_send(c.ip, c.port, 100, 1);
			client.m.udp_messages.udp_w_byte(1);
			client.m.udp_messages.udp_w_byte(client.G.g_player);
			client.m.udp_messages.udp_w_txt('hello host');
			host.say('welcome', 3);
			step(3);
			expect(host.msgs()).toEqual(['Client: hello host']);
			expect([...client.m.types.Each(client.m.types.Tmsg)].map((t) => [t.msg, t.col])).toEqual([['welcome', 3]]);
			// nobody else is connected: the host passes the chat on to no one
			expect(net.sent.filter((d) => d.fromIp === ipToInt(HOST_IP) && unpack(d).body.includes(1) && unpack(d).body[0] === 100 && unpack(d).body[1] === 1)).toEqual([]);
		});

		it('ping data (5/3) sets the ping the scoreboard shows', () => {
			const c = host.cons()[0];
			host.m.udp_messages.udp_send(c.ip, c.port, 5);
			host.m.udp_messages.udp_w_byte(3);
			host.m.udp_messages.udp_w_byte(1);
			host.m.udp_messages.udp_w_short(123);
			step(3);
			expect(client.player(1).player_ping).toBe(123);
		});

		it('reordering: packets that arrive out of order wait and are processed by id', () => {
			net.hold = true;
			for (const t of ['one', 'two', 'three', 'four']) {
				host.say(t);
				clock.now += 100;
				host.update();
			}
			expect(net.held.map((d) => unpack(d).id)).toEqual([6, 8, 10, 12]);
			net.hold = false;
			net.release([3, 1]); // 12 and 8 first
			step(1, 20);
			step(1, 20);
			expect(client.msgs()).toEqual([]);
			expect(client.cons()[0].iid).toBe(6);
			expect([...client.m.types.Each(client.m.types.Tudp_ipq)].map((p) => p.id)).toEqual([12, 8]);
		});

		it('reordering: once the missing packets are there, all are processed in one update', () => {
			net.hold = true;
			for (const t of ['one', 'two', 'three', 'four']) {
				host.say(t);
				clock.now += 100;
				host.update();
			}
			net.hold = false;
			net.release([3, 1, 2, 0]);
			step(2, 20);
			expect(client.msgs()).toEqual(['one', 'two', 'three', 'four']);
			expect(client.cons()[0].iid).toBe(14);
			expect(client.cons()[0].resend).toBe(0);
			expect(client.m.types.Tudp_ipq.list.count).toBe(0);
		});

		it('duplicates are processed once', () => {
			net.duplicateRate = 1;
			host.say('once');
			step(3);
			host.say('twice?');
			step(3);
			expect(client.msgs()).toEqual(['once', 'twice?']);
		});

		it('loss: the gap is noticed with the next packet, requested, resent, and the order is kept', () => {
			// the packet with "two" is lost on its first way
			let lost = 0;
			net.drop = (d) => {
				const hit = d.fromIp === ipToInt(HOST_IP) && d.data.length > 2 && unpack(d).id === 8 && lost === 0;
				if (hit) lost++;
				return hit;
			};
			host.say('one');
			step(1);
			host.say('two');
			step(1);
			host.say('three');
			step(1);
			expect(client.msgs()).toEqual(['one']);
			net.sent.length = 0;
			step(4);
			expect(lost).toBe(1);
			expect(client.msgs()).toEqual(['one', 'two', 'three']);
			// the request: system message 254 with the missing id, in an unreliable (odd) packet
			const fromClient = net.sent.filter((d) => d.fromIp === ipToInt(CLIENT_IP)).map(unpack);
			expect(fromClient[0].body).toEqual([254, 8, 0]);
			expect(fromClient[0].id % 2).toBe(1);
			// the resend: the same id and bytes as the first time
			const resent = net.sent.filter((d) => d.fromIp === ipToInt(HOST_IP)).map(unpack)[0];
			expect(resent).toEqual({ id: 8, body: [100, 2, 3, 0, 0x74, 0x77, 0x6f, 0] });
			expect(client.cons()[0].resend).toBe(0);
			// quirk: on the host the request packet survives as garbage and is "processed"
			expect(host.con()[0]).toBe('process unreliable packet');
			expect(host.con().slice(1)).toEqual(Array(7).fill('ERROR: Got unexpected Message (#0)'));
		});

		it('loss: an acknowledgement that arrives before the gap is noticed makes the loss permanent', () => {
			// "one" is lost; nothing else is sent until the client's next acknowledgement (every 2 s)
			net.drop = (d) => d.fromIp === ipToInt(HOST_IP) && d.data.length > 2 && unpack(d).body.includes(0x6f);
			host.say('one');
			step(1);
			net.drop = null;
			const spq = () => [...host.m.types.Each(host.m.types.Tudp_spq)].map((p) => p.id);
			expect(spq()).toEqual([2, 4, 6]); // join answer, player data, "one": nothing acknowledged yet
			step(25); // 2.5 s: the client acknowledges "next expected: 6", and the host dumps packet 6 with the others
			expect(spq()).toEqual([]);
			host.say('two');
			step(30);
			// the client asks for 6 again and again; the host has nothing to resend; "two" is never shown
			expect(client.msgs()).toEqual([]);
			expect(client.cons()[0].iid).toBe(6);
			expect([...client.m.types.Each(client.m.types.Tudp_ipq)].map((p) => p.id)).toEqual([8]);
			const requests = net.sent.filter((d) => d.fromIp === ipToInt(CLIENT_IP)).map(unpack).filter((p) => p.body[0] === 254);
			expect(requests.length).toBeGreaterThanOrEqual(5);
			expect(requests.every((p) => p.body[1] === 6)).toBe(true);
		});

		it('many messages over a line that reorders and duplicates arrive complete and in order', () => {
			net.reorderRate = 0.35;
			net.duplicateRate = 0.25;
			const texts: string[] = [];
			for (let k = 0; k < 120; k++) {
				const t = 'm' + String(1000 + k);
				texts.push(t);
				host.say(t);
				step(1, 60 + (k % 5) * 30);
			}
			net.reorderRate = 0;
			net.duplicateRate = 0;
			net.release();
			step(10);
			expect(client.msgs()).toEqual(texts);
			expect(host.m.types.Tudp_con.list.count).toBe(1);
			expect(client.m.types.Tudp_ipq.list.count).toBe(0);
		});

		it('a silent partner: the connection is dropped after 20 s', () => {
			for (let k = 0; k < 205; k++) {
				clock.now += 100;
				host.update(); // the client does nothing any more
			}
			expect(host.cons()).toEqual([]);
			// the player stays in the game: nothing removes it
			expect(host.units().map((u) => u.id)).toEqual([1, 2]);
		});
	});
});
