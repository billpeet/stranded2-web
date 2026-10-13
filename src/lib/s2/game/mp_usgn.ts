/**
 * includes/mp_usgn.bb: the U.S.G.N. (Unreal Software Gaming Network) master
 * server, hosting and joining.
 *
 * Master server protocol (TCP, usgn.unrealsoftware.de port 80; one request
 * line ended by CR LF, no HTTP version and no headers, so the answer is the
 * bare document):
 *
 *   GET http://usgn.unrealsoftware.de/game_stranded2/ips.txt
 *       line 1: current game version, line 2: a message for the menu,
 *       then one "a.b.c.d:port" per line: the server list
 *   GET http://usgn.unrealsoftware.de/game_stranded2/save.php?port=<port>
 *       registers the caller as a server; line 1 of the answer: the caller's IP
 *   GET http://usgn.unrealsoftware.de/getip.php     (udp_getip)
 *       line 1: the caller's IP
 *
 * Server list ping (UDP, usgn_update): the 1 byte datagram 100 to a server;
 * answer 101, String name, String map, byte players, byte maxplayers, byte password.
 */
import { Instr, Int, Left, Mid, MilliSecs, RuntimeError, Str, Trim, f32 } from '../blitz';
import * as NS from './_additions/net';
import { con_add } from './console';
import { Cbmpf_red, Cbmpf_yellow, Csection_game_mp } from './consts';
import { load_map } from './e_load_map';
import { game_playerspawn, game_setplayer } from './game_functions';
import { bmpf_loadscreen } from './load_bmpf';
import { mp_checkname } from './mp_game_functions';
import { G } from './state';
import { DottedIP, NET } from './sys';
import { After, Delete, First, New, Tserver } from './types';
import { udp_int, udp_join, udp_setup, udp_update } from './udp_functions';
import { udp_send, udp_w_byte, udp_w_tiny } from './udp_messages';

//############################################ USGN

//### Load Servers from U.S.G.N.
/** Function usgn_setup() */
export async function usgn_setup(): Promise<void> {
	let tcp = 0;
	let Tserver_: Tserver | null = null;
	let in_ = '';
	let sep = 0;
	await bmpf_loadscreen('Loading U.S.G.N. Serverlist');
	//UDP
	udp_setup();
	if (G.udp === 0) RuntimeError('Failed to initialize UDP Sockets');
	//TCP
	tcp = NET.OpenTCPStream('usgn.unrealsoftware.de', 80);
	if (tcp !== 0) {
		for (Tserver_ = First(Tserver); Tserver_ !== null; Tserver_ = After(Tserver, Tserver_)) {
			Delete(Tserver, Tserver_);
		}
		NET.WriteLine(tcp, 'GET http://usgn.unrealsoftware.de/game_stranded2/ips.txt');
		G.in_usgn_version = Trim(NET.ReadLine(tcp));
		G.in_usgn_msg = Trim(NET.ReadLine(tcp));
		G.in_usgn_msgscr = f32(500);
		while (NET.Eof(tcp) === 0) {
			in_ = Trim(NET.ReadLine(tcp));
			if (in_ !== '') {
				Tserver_ = New(Tserver);
				sep = Instr(in_, ':');
				Tserver_.ip = udp_int(Left(in_, sep - 1));
				Tserver_.port = Int(Mid(in_, sep + 1, -1));
				if (G.set_debug === 1) {
					con_add('Got U.S.G.N. Server ' + DottedIP(Tserver_.ip) + ':' + Str(Tserver_.port), Cbmpf_yellow);
				}
			}
		}
		NET.CloseTCPStream(tcp);
	}
}

//### Host Server
/** Function usgn_hostserver(port) */
export async function usgn_hostserver(port: number): Promise<void> {
	let tcp = 0;
	let in_ = '';
	await bmpf_loadscreen('Adding Server to U.S.G.N. Serverlist');
	//UDP
	udp_setup(port);
	if (G.udp === 0) RuntimeError('Failed to create server at UDP Port ' + Str(port) + '!');
	G.udp_host = 1;
	G.set_sv_port = port;
	//TCP
	tcp = NET.OpenTCPStream('usgn.unrealsoftware.de', 80);
	if (tcp !== 0) {
		NET.WriteLine(tcp, 'GET http://usgn.unrealsoftware.de/game_stranded2/save.php?port=' + Str(port));
		if (NET.Eof(tcp) === 0) {
			in_ = Trim(NET.ReadLine(tcp));
			if (in_ !== '') {
				G.set_sv_ip = udp_int(in_);
			}
		}
		NET.CloseTCPStream(tcp);
	}
	//Map
	G.m_section = Csection_game_mp;
	await load_map('maps\\' + G.in_win_map + '.s2', '');
	game_playerspawn(1); //Create Player
	game_setplayer(1); //Cache own Player Data
	G.TCunit!.player_name = mp_checkname(G.set_name); //Set Player Name
	G.TCunit!.player_ip = G.set_sv_ip; //Set Player IP
	G.TCunit!.player_port = G.set_sv_port; //Set Player Port
	G.m_menu = 0;
}

//### Join Server
/** Function usgn_joinserver(ip,port,password$="") */
export async function usgn_joinserver(ip: number, port: number, password: string = ''): Promise<number> {
	let out = 0;
	let joined = 0;
	let timeout = 0;
	//UDP
	udp_setup();
	if (G.udp === 0) RuntimeError('Failed to initialize UDP Sockets');
	G.udp_host = 0;
	//Join
	out = udp_join(ip, port, 10000, 1000);
	//Joined?
	switch (out) {
		//Ok
		case 1:
			joined = 1;
			break;
		//Error
		default:
			joined = 0;
	}
	//Proceed Joining
	if (joined === 1) {
		//Cache Server Data
		G.set_sv_ip = G.udp_hostip;
		G.set_sv_port = G.udp_hostport;
		//Send Join Request
		udp_send(G.set_sv_ip, G.set_sv_port, 1);
		udp_w_tiny(G.set_name);
		udp_w_tiny(password);
		//Get Data
		G.mp_joinserver = 0;
		timeout = MilliSecs();
		// The original stands in this loop (no Flip, no Delay) until the answer has been processed.
		while (G.mp_joinserver === 0) {
			udp_update();
			if (((MilliSecs() - timeout) | 0) > 10000) {
				return 0;
			}
		}
		//mp_joinserver
		//1 - Ok
		//2 - Map Get
		//3 - Map Differs
		//RuntimeError("JOINED! Code: "+mp_joinserver)
		switch (G.mp_joinserver) {
			//1 - Ok
			case 1:
				//Load Map
				G.m_section = Csection_game_mp;
				await load_map('maps\\' + G.set_sv_map + '.s2', '');
				game_playerspawn(G.mp_id); //Create Player
				game_setplayer(G.mp_id); //Cache own Player Data
				G.TCunit!.player_name = G.mp_name; //Set Player Name
				G.TCunit!.player_ip = G.mp_ip; //Set Player IP
				G.TCunit!.player_port = G.udp_port; //Set Player Port
				G.m_menu = 0;
				//Send Join Ok
				udp_send(G.set_sv_ip, G.set_sv_port, 3);
				udp_w_byte(1);
				break;
		}
		// quirk: 1 also when the map is missing (2) or differs (3): nothing was loaded then
		return 1;
		//Error
	} else {
		return 0;
	}
}

//### Ping Servers
/** Function usgn_update() */
export function usgn_update(): void {
	let fip = 0;
	let fport = 0;
	let Tserver_: Tserver | null = null;
	let id = 0;
	//Get
	while (NS.RecvUDPMsg(G.udp) !== 0) {
		if (NS.ReadAvail(G.udp) > 0) {
			//From Data
			fip = NS.UDPMsgIP(G.udp);
			fport = NS.UDPMsgPort(G.udp);

			//Only Read Messages from Servers
			for (Tserver_ = First(Tserver); Tserver_ !== null; Tserver_ = After(Tserver, Tserver_)) {
				if (Tserver_.ip === fip) {
					if (Tserver_.port === fport) {
						id = NS.ReadByte(G.udp);

						switch (id) {
							//Server Data
							case 101:
								Tserver_.name = NS.ReadString(G.udp);
								Tserver_.map = NS.ReadString(G.udp);
								Tserver_.players = NS.ReadByte(G.udp);
								Tserver_.maxplayers = NS.ReadByte(G.udp);
								Tserver_.password = NS.ReadByte(G.udp);
								break;

							//Error
							default:
								if (G.set_debug === 1) {
									con_add('ERROR: Unexpected U.S.G.N. Message: ' + Str(id), Cbmpf_red);
								}
								while (NS.ReadAvail(G.udp) > 0) {
									NS.ReadByte(G.udp);
								}
						}

						break;
					}
				}
			}
		}
	}

	//Send
	for (Tserver_ = First(Tserver); Tserver_ !== null; Tserver_ = After(Tserver, Tserver_)) {
		if (((G.ms - Tserver_.timer) | 0) > 3000) {
			//Info Request
			// quirk: nothing in this file ever sets Tserver\ping, so only the 15 s rule sends
			if (Tserver_.ping !== 0 || ((G.ms - Tserver_.timer) | 0) > 15000) {
				Tserver_.timer = G.ms;
				Tserver_.pingstamp = G.ms;
				NS.WriteByte(G.udp, 100);
				NS.SendUDPMsg(G.udp, Tserver_.ip, Tserver_.port);
				con_add('send request to ' + DottedIP(Tserver_.ip) + ':' + Str(Tserver_.port));
			}
		}
	}
}
