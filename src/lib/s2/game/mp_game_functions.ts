/**
 * includes/mp_game_functions.bb: player names and ids, the server's and the
 * client's side of joining, player data, the scoreboard.
 */
import { EntityX, EntityY, EntityYaw, EntityZ, PositionEntity, RotateEntity } from '../bb3d';
import { Asc, Chr, Left, Len, Mid, Replace, Str, Trim } from '../blitz';
import { DrawImage } from '../gfx2d';
import { con_add } from './console';
import { Cbmpf_dark, Cbmpf_green, Cbmpf_red, Cbmpf_tiny, Cbmpf_yellow, Cicon_globe } from './consts';
import { load_map_id } from './e_load_map';
import { game_playerspawn } from './game_functions';
import { con_unit, set_unit } from './handle_units';
import { if_msg } from './interface';
import { bmpf_txt, bmpf_txt_c } from './load_bmpf';
import { G } from './state';
import { DottedIP } from './sys';
import { After, First, Tunit } from './types';
import { udp_r_byte, udp_r_float, udp_r_short, udp_r_tiny, udp_send, udp_w_byte, udp_w_float, udp_w_int, udp_w_short, udp_w_tiny } from './udp_messages';

//############################################ MULTIPLAYER GAME FUNCTIONS

//### Check Name and Return Valid Name
/** Function mp_checkname$(name$,checkexistence=1) */
export function mp_checkname(name: string, checkexistence: number = 1): string {
	let s = 0;
	let i = 0;
	let free = 0;
	let Tunit_: Tunit | null = null;
	let set = 0;
	name = Trim(name);
	if (Len(name) > 15) {
		name = Left(name, 15);
	}
	for (i = 1; i <= Len(name); i++) {
		s = Asc(Mid(name, i, 1));
		if (s < 48) {
			switch (s) {
				case 32:
				case 40:
				case 41:
				case 45:
				case 46:
					break;
				default:
					name = Replace(name, Chr(s), '_');
			}
		} else if (s > 57 && s < 65) {
			name = Replace(name, Chr(s), '_');
		} else if (s > 90 && s < 97) {
			switch (s) {
				case 91:
				case 93:
				case 95:
					break;
				default:
					name = Replace(name, Chr(s), '_');
			}
		} else if (s > 122) {
			name = Replace(name, Chr(s), '_');
		}
	}
	name = Replace(name, '__', '_');
	if (name === '') name = 'Mr. Stranded';
	//Exists?
	if (checkexistence === 1) {
		free = 1;
		for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
			if (Tunit_.id < 100) {
				if (Tunit_.player_name === name) {
					free = 0;
					break;
				}
			}
		}
		//Change
		if (free === 0) {
			i = 2;
			set = 0;
			while (set === 0) {
				free = 1;
				for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
					if (Tunit_.id < 100) {
						if (Tunit_.player_name === name + '(' + Str(i) + ')') {
							free = 0;
							break;
						}
					}
				}
				if (free === 1) {
					set = 1;
					name = name + '(' + Str(i) + ')';
				} else {
					i = i + 1;
				}
			}
		}
	}
	//Return
	return name;
}

//### Get a unused Player ID (1-100)
/** Function mp_getplayerid() */
export function mp_getplayerid(): number {
	let i = 0;
	let free = 0;
	let Tunit_: Tunit | null = null;
	for (i = 1; i <= 100; i++) {
		free = 1;
		for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
			if (Tunit_.id === i) {
				free = 0;
				break;
			}
		}
		if (free === 1) return i;
	}
	return 0;
}

//### Get Player
/** Function mp_getplayer(ip,port) */
export function mp_getplayer(ip: number, port: number): number {
	let Tunit_: Tunit | null = null;
	for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
		if (Tunit_.id < 100) {
			if (Tunit_.player_ip === ip) {
				if (Tunit_.player_port === port) {
					G.TCunit = Tunit_;
					return Tunit_.id;
				}
			}
		}
	}
	return 0;
}

//### Handle Joinrequest
/** Function mp_server_joinrequest(ip,port,name$,pw$) */
export function mp_server_joinrequest(ip: number, port: number, name: string, pw: string): void {
	let players = 0;
	let Tunit_: Tunit | null = null;
	let found = 0;
	let freeid = 0;
	let free = 0;
	//Name
	name = mp_checkname(name, 1);
	//Check Password
	if (pw === G.set_sv_pw || G.set_sv_pw === '') {
		//Check Playerlimit
		players = 0;
		for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
			if (Tunit_.id < 100) {
				players = players + 1;
			}
		}
		if (players < G.set_sv_playerlimit) {
			//Accept
			found = 0;
			freeid = 2;
			while (found === 0) {
				free = 1;
				for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
					if (Tunit_.id === freeid) {
						free = 0;
						break;
					}
				}
				if (free === 1) {
					found = 1;
				} else {
					freeid = freeid + 1;
				}
			}
			game_playerspawn(freeid, -1);
			con_unit(freeid);
			G.TCunit!.player_name = name; //Set Player Name
			G.TCunit!.player_ip = ip; //Set Player IP
			G.TCunit!.player_port = port; //Set Player Port
			//Send Join Accept
			udp_send(ip, port, 2);
			udp_w_byte(1);
			udp_w_tiny(name); //Player Name
			udp_w_byte(freeid); //Player ID
			udp_w_int(ip); //Player IP
			udp_w_tiny(G.set_sv_name); //Server Name
			udp_w_tiny(G.set_sv_map); //Server Map
			udp_w_tiny(G.map_id); //Server Map ID
			// quirk: the client's udp_process does not read this value; its 4 bytes are taken for message ids there
			udp_w_int(G.tmp_spawnid);
			//Output
			if_msg(name + ' connected!', Cbmpf_yellow);
		} else {
			//Full
			udp_send(ip, port, 2);
			udp_w_byte(3);
		}
	} else {
		//Wrong Password
		udp_send(ip, port, 2);
		udp_w_byte(2);
	}
}

//### Client Check Map
/** Function mp_client_checkmap(map$,mapid$) */
export function mp_client_checkmap(map: string, mapid: string): void {
	let ownid = '';
	ownid = load_map_id('maps\\' + map + '.s2');
	if (ownid === '0') {
		//Request!
		udp_send(G.set_sv_ip, G.set_sv_port, 3);
		udp_w_byte(2);
		G.mp_joinserver = 2;
	} else {
		if (ownid === mapid) {
			//Ok!
			G.mp_joinserver = 1;
		} else {
			//Wrong! Map Differs!
			udp_send(G.set_sv_ip, G.set_sv_port, 3);
			udp_w_byte(7);
			G.mp_joinserver = 3;
		}
	}
}

//### Send Player Data
/** Function mp_server_sendplayerdata(ip,port) */
export function mp_server_sendplayerdata(ip: number, port: number): void {
	let id = 0;
	let Tunit_: Tunit | null = null;
	//Get Player
	id = mp_getplayer(ip, port);
	if (id !== 0) {
		//Send Data of other Players to new Player
		for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
			if (Tunit_.id < 100) {
				if (Tunit_.id !== id) {
					udp_send(ip, port, 3);
					udp_w_byte(100);
					udp_w_tiny(Tunit_.player_name);
					udp_w_byte(Tunit_.id);
					udp_w_float(EntityX(Tunit_.h));
					udp_w_float(EntityY(Tunit_.h));
					udp_w_float(EntityZ(Tunit_.h));
					udp_w_float(EntityYaw(Tunit_.h));
					udp_w_short(Tunit_.player_score);
					udp_w_short(Tunit_.player_deads);
					udp_w_byte(1);
					udp_w_short(Tunit_.player_ping);
					// quirk: prints the name of the new player (TCunit) with the id of the other one
					con_add('send player data ' + G.TCunit!.player_name + ' #' + Str(Tunit_.id) + ' To ' + DottedIP(ip) + ':' + Str(port));
				}
			}
		}
		//Send Data of New Player to other Players
		for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
			if (Tunit_.id < 100) {
				if (Tunit_.id !== 1 && Tunit_.id !== id) {
					udp_send(Tunit_.player_ip, Tunit_.player_port, 3);
					udp_w_byte(101);
					udp_w_tiny(G.TCunit!.player_name);
					udp_w_byte(G.TCunit!.id);
					udp_w_float(EntityX(G.TCunit!.h));
					udp_w_float(EntityY(G.TCunit!.h));
					udp_w_float(EntityZ(G.TCunit!.h));
					udp_w_float(EntityYaw(G.TCunit!.h));
					udp_w_short(G.TCunit!.player_score);
					udp_w_short(G.TCunit!.player_deads);
					udp_w_byte(1);
					// quirk: the ping of the receiver (Tunit), not of the new player (TCunit)
					udp_w_short(Tunit_.player_ping);
					con_add('send player data ' + G.TCunit!.player_name + ' #' + Str(G.TCunit!.id) + ' To ' + DottedIP(Tunit_.player_ip) + ':' + Str(Tunit_.player_port));
				}
			}
		}
	}
}

//### Get Player Data
/** Function mp_getplayerdata(mode) */
export function mp_getplayerdata(mode: number): void {
	const name = udp_r_tiny();
	const id = udp_r_byte();
	const x = udp_r_float();
	const y = udp_r_float();
	const z = udp_r_float();
	const yaw = udp_r_float();
	const score = udp_r_short();
	const deads = udp_r_short();
	const dead = udp_r_byte();
	const ping = udp_r_short();
	void dead; // read and not used
	con_add('get player data ' + name + ' #' + Str(id));
	//Create
	if (con_unit(id) === 0) {
		set_unit(id, 1, x, z);
	}
	PositionEntity(G.TCunit!.h, x, y, z);
	RotateEntity(G.TCunit!.h, 0, yaw, 0);
	G.TCunit!.player_name = name;
	G.TCunit!.player_score = score;
	G.TCunit!.player_deads = deads;
	G.TCunit!.player_ping = ping;
	//Output
	if (mode === 101) {
		if_msg(name + ' joined the game!', Cbmpf_green);
	}
}

//### Scoreboard
/** Function mp_scoreboard() */
export function mp_scoreboard(): void {
	let y = 0;
	let Tunit_: Tunit | null = null;
	let col = 0;
	//Window
	DrawImage(G.gfx_win, 215, 0);
	DrawImage(G.gfx_icons, 236, 5, Cicon_globe);
	DrawImage(G.gfx_winbar, 215, 42);

	//Name
	bmpf_txt(236 + 37, 10, G.set_sv_name);

	//Adresse
	bmpf_txt_c(236 + 37 + 400, 7, DottedIP(G.set_sv_ip) + ':' + Str(G.set_sv_port), Cbmpf_tiny);
	bmpf_txt_c(236 + 37 + 400, 19, G.set_sv_map, Cbmpf_tiny);

	//Infos
	bmpf_txt(236, 63, 'Player', Cbmpf_dark);
	bmpf_txt(236 + 300, 63, 'Score', Cbmpf_dark);
	bmpf_txt(236 + 370, 63, 'Deads', Cbmpf_dark);
	bmpf_txt(236 + 470, 63, 'Net', Cbmpf_dark);

	//Players
	y = 63 + 20;
	for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
		if (Tunit_.id < 100) {
			//Name
			bmpf_txt(236, y, Tunit_.player_name);
			if (Tunit_.id === 1) bmpf_txt(236, y + 15, 'Server', Cbmpf_tiny);

			//Ping
			if (Tunit_.player_ping === 0) {
				bmpf_txt(236 + 470, y, '...', Cbmpf_dark);
			} else {
				col = Cbmpf_red;
				if (Tunit_.player_ping < 200) col = Cbmpf_yellow;
				if (Tunit_.player_ping < 100) col = Cbmpf_green;
				bmpf_txt(236 + 470, y, Str(Tunit_.player_ping), col);
			}

			y = y + 40;
		}
	}
}
