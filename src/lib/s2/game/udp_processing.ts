/**
 * includes/udp_processing.bb: the game's messages inside a received packet.
 *
 *   1    join request      tiny name, tiny password
 *   2    join answer       byte sub: 1 ok (tiny name, byte id, int ip, tiny server name,
 *                          tiny map, tiny map id [, int spawn id: sent, never read]),
 *                          2 wrong password, 3 full
 *   3    join stuff        byte sub: 1 ok, 100 / 101 player data (mp_getplayerdata)
 *   5    ping              byte sub: 1 request (int stamp), 2 answer (int stamp),
 *                          3 ping data (byte player, short ping)
 *   50   position          byte player, float x, y, z, yaw
 *   100  message           byte sub: 1 chat (byte player, txt), 2 server message (txt, byte colour)
 */
import { PositionEntity, RotateEntity } from '../bb3d';
import { BankSize, MilliSecs, RuntimeError, Str } from '../blitz';
import { bankOf } from './_additions/net';
import { con_add } from './console';
import { Cbmpf_green, Cbmpf_red, Cchatshow } from './consts';
import { if_msg } from './interface';
import { mp_client_checkmap, mp_getplayerdata, mp_server_joinrequest, mp_server_sendplayerdata } from './mp_game_functions';
import { G } from './state';
import { After, First, Tudp_con, Tunit, type Tudp_ipq } from './types';
import { udp_r_byte, udp_r_float, udp_r_int, udp_r_short, udp_r_tiny, udp_r_txt, udp_send, udp_w_byte, udp_w_int, udp_w_txt } from './udp_messages';

//Process a Packet and its Messages
/** Function udp_process(p.Tudp_ipq) */
export function udp_process(p: Tudp_ipq | null): void {
	let ip = 0;
	let port = 0;
	let id = 0;
	let name = '';
	let pw = '';
	let sub = 0;
	let mapid = '';
	let pingstamp = 0;
	let Tunit_: Tunit | null = null;
	let playerid = 0;
	let ping = 0;
	let x = 0;
	let y = 0;
	let z = 0;
	let yaw = 0;
	let msg = '';
	let Tudp_con_: Tudp_con | null = null;
	let col = 0;
	G.udp_indb = p!.db;
	G.udp_indbp = 0;
	G.udp_indbs = BankSize(bankOf(p!.db));
	ip = p!.ip;
	port = p!.port;
	while (G.udp_indbp < G.udp_indbs) {
		id = udp_r_byte();

		switch (id) {
			//1 - Join Request
			case 1:
				name = udp_r_tiny();
				pw = udp_r_tiny();
				// quirk: no test for udp_host: a client that reads a 1 here (the stale bytes udp_system
				// leaves behind are enough) accepts a "player" too
				mp_server_joinrequest(ip, port, name, pw);
				break;

			//2 - Join Answer
			case 2:
				sub = udp_r_byte();
				//1 - Ok
				if (sub === 1) {
					G.mp_name = udp_r_tiny();
					G.mp_id = udp_r_byte();
					G.mp_ip = udp_r_int();
					G.set_sv_name = udp_r_tiny();
					G.set_sv_map = udp_r_tiny();
					mapid = udp_r_tiny();
					mp_client_checkmap(G.set_sv_map, mapid);
					//2 - Wrong Password
				} else if (sub === 2) {
					RuntimeError('Join: Wrong Password');
					//3 - Full
				} else if (sub === 3) {
					RuntimeError('Join: Full');
					//4 - Banned
				} else if (sub === 2) {
					// quirk: `Case 2` a second time: never reached
					RuntimeError('Join: Banned');
				}
				break;

			//3 - Join Stuff
			case 3:
				sub = udp_r_byte();
				switch (sub) {
					//1 - Ok
					case 1:
						if (G.udp_host === 1) {
							mp_server_sendplayerdata(ip, port);
							if_msg('BLAAAH joined the game!', Cbmpf_green);
						}
						break;
					//2 - Map Request
					//3 - Map Send Start
					//4 - Map Send Data
					//5 - Map Send End
					//7 - Map Differs
					//100 - Player Data (existing Player)
					case 100:
						mp_getplayerdata(100);
						break;
					//101 - Player Data (new Player)
					case 101:
						mp_getplayerdata(101);
						break;
				}
				break;

			//5 - Ping
			case 5:
				sub = udp_r_byte();
				switch (sub) {
					//1 - Request
					case 1:
						pingstamp = udp_r_int();
						udp_send(ip, port, 5, 1);
						udp_w_byte(2);
						udp_w_int(pingstamp);
						break;
					//2 - Answer
					case 2:
						pingstamp = udp_r_int();
						if (pingstamp <= MilliSecs()) {
							for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
								if (Tunit_.id < 100) {
									if (Tunit_.player_ip === ip) {
										if (Tunit_.player_port === port) {
											Tunit_.player_ping = (MilliSecs() - pingstamp) | 0;
											break;
										}
									}
								}
							}
						}
						break;
					//3 - Ping Data
					case 3:
						playerid = udp_r_byte();
						ping = udp_r_short();
						for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
							if (Tunit_.id === playerid) {
								Tunit_.player_ping = ping;
								break;
							}
						}
						break;
				}
				con_add('GOT PING mode ' + Str(sub), Cbmpf_red);
				break;

			//50 -  Position
			case 50:
				playerid = udp_r_byte();
				x = udp_r_float();
				y = udp_r_float();
				z = udp_r_float();
				yaw = udp_r_float();
				for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
					if (Tunit_.id === playerid) {
						PositionEntity(Tunit_.h, x, y, z);
						RotateEntity(Tunit_.h, 0, yaw, 0);
						break;
					}
				}
				con_add('GOT POS! #' + Str(playerid));
				break;

			//100 - Message
			case 100:
				sub = udp_r_byte();
				switch (sub) {
					//1 - Chat
					case 1:
						playerid = udp_r_byte();
						msg = udp_r_txt();
						for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
							if (Tunit_.id === playerid) {
								if_msg(Tunit_.player_name + ': ' + msg, 0, Cchatshow);
								break;
							}
						}
						if (G.udp_host === 1) {
							for (Tudp_con_ = First(Tudp_con); Tudp_con_ !== null; Tudp_con_ = After(Tudp_con, Tudp_con_)) {
								// quirk: And, not Or: a client that shares the sender's IP or its port number gets no copy
								if (Tudp_con_.ip !== ip && Tudp_con_.port !== port) {
									udp_send(Tudp_con_.ip, Tudp_con_.port, 100, 1);
									udp_w_byte(1);
									udp_w_byte(playerid);
									udp_w_txt(msg);
								}
							}
						}
						break;

					//2 - Servermessage
					case 2:
						msg = udp_r_txt();
						col = udp_r_byte();
						if_msg(msg, col);
						break;
				}
				break;

			//Trash
			default:
				con_add('ERROR: Got unexpected Message (#' + Str(id) + ')');
		}
	}
}
