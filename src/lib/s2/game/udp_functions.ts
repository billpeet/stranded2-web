/**
 * includes/udp_functions.bb: the "Unreal Software UDP Library" (udp.bb):
 * addresses, the socket, connection establishing, the per-frame update
 * (receive, order, acknowledge, request, assemble, send) and the windowing
 * test. Based on "A Reliable Messaging Protocol" (Game Programming Gems 5).
 *
 * Wire format (udp_update / udp_get):
 *
 *   1 byte datagram        connection establishing: Cudp_cest_* (10 request, 20 ack,
 *                          21 exists, 31 no host), or 100 = server info request
 *   server info answer     101, String name, String map, byte players, byte maxplayers,
 *                          byte password (Blitz WriteString: Int length + bytes); not encrypted
 *   3 and more bytes       packet: Short id, then the messages, every message byte Xor Cudp_encrk (5).
 *                          Even ids are reliable packets (2,4,..65534, then 0), odd ids
 *                          (sid+1) unreliable ones. Messages >= Cudp_sys (250) are system
 *                          messages and stand at the start: 255 ack + Short id, 254 request + Short id.
 *
 * All socket access goes through the UDP stream commands of _additions/net.ts
 * and NET of sys.ts; there is no transport in here.
 */
import {
	BankSize,
	CopyBank,
	CreateBank,
	FreeBank,
	Instr,
	Int,
	Left,
	Len,
	Lower,
	MilliSecs,
	PeekByte,
	PokeByte,
	ResizeBank,
	Right,
	Shl,
	Str,
	idivConst,
	imod
} from '../blitz';
import * as NS from './_additions/net';
import { CopyBankR, PeekByteR, PeekShortR, bankHandle, bankOf } from './_additions/net';
import { con_add } from './console';
import {
	Cudp_cest_ack,
	Cudp_cest_exists,
	Cudp_cest_nohost,
	Cudp_cest_req,
	Cudp_cest_timeout,
	Cudp_encr,
	Cudp_encrk,
	Cudp_sys,
	Cudp_sys_ack,
	Cudp_sys_ping,
	Cudp_sys_req,
	Cudp_win_limit,
	Cudp_win_range
} from './consts';
import { G } from './state';
import { DebugLog, DottedIP, NET } from './sys';
import { After, Delete, First, New, Tudp_cest, Tudp_con, Tudp_ipq, Tudp_msg, Tudp_resend, Tudp_spq } from './types';
import { udp_send, udp_w_short } from './udp_messages';
import { udp_process } from './udp_processing';

/** Cudp_encr as an Int (the comparisons `Cudp_encr=0` / `Cudp_encr=1` of the original are kept). */
const encr: number = Cudp_encr;

//################################################# Functions

//Get IP out of String (Advanced with Deriving)
/** Function udp_ip(ip$) */
export function udp_ip(ip: string): number {
	let sep = 0;
	let prot = '';
	let port = 0;
	let tcps = 0;
	let a1 = 0;
	let a2 = 0;
	let a3 = 0;
	let a4 = 0;
	//Local
	if (Lower(ip) === 'local') {
		ip = '127.0.0.1';
		//URL
	} else if ((Instr(Lower(ip), '://') | Instr(Lower(ip), 'www')) !== 0) {
		//Derive Port from used Protocol
		if (Instr(Lower(ip), '://') !== 0) {
			sep = Instr(ip, ':');
			prot = Left(ip, sep - 1);
			prot = Lower(prot);
			switch (prot) {
				case 'http':
					port = 80;
					break;
				case 'https':
					port = 443;
					break;
				case 'ftp':
					port = 21;
					break;
				case 'ssh':
					port = 22;
					break;
				case 'irc':
					port = 6667;
					break;
				default:
					port = 80;
			}
			//On WWW use HTTP Port 80
		} else {
			port = 80;
		}
		//Try to Connect and to get the IP
		// quirk: the whole text, protocol prefix included, is given to OpenTCPStream as host name
		tcps = NET.OpenTCPStream(ip, port);
		if (tcps !== 0) {
			ip = Str(NS.TCPStreamIP(tcps));
			ip = DottedIP(Int(ip));
			NET.CloseTCPStream(tcps);
		}
	}
	//Empty
	if (ip === '') ip = '127.0.0.1';
	//Check IP Format
	a1 = Instr(ip, '.');
	if (a1 === 0) return 0;
	a2 = Instr(ip, '.', a1 + 1);
	if (a2 === 0) return 0;
	a3 = Instr(ip, '.', a2 + 1);
	if (a3 === 0) return 0;
	//Get Integer IP out of String
	a1 = Int(Left(ip, Instr(ip, '.') - 1));
	ip = Right(ip, Len(ip) - Instr(ip, '.'));
	a2 = Int(Left(ip, Instr(ip, '.') - 1));
	ip = Right(ip, Len(ip) - Instr(ip, '.'));
	a3 = Int(Left(ip, Instr(ip, '.') - 1));
	ip = Right(ip, Len(ip) - Instr(ip, '.'));
	a4 = Int(ip);
	return (Shl(a1, 24) + Shl(a2, 16) + Shl(a3, 8) + a4) | 0;
}

//IP String to Int
/** Function udp_int(ip$) */
export function udp_int(ip: string): number {
	let a1 = 0;
	let a2 = 0;
	let a3 = 0;
	let a4 = 0;
	a1 = Int(Left(ip, Instr(ip, '.') - 1));
	ip = Right(ip, Len(ip) - Instr(ip, '.'));
	a2 = Int(Left(ip, Instr(ip, '.') - 1));
	ip = Right(ip, Len(ip) - Instr(ip, '.'));
	a3 = Int(Left(ip, Instr(ip, '.') - 1));
	ip = Right(ip, Len(ip) - Instr(ip, '.'));
	a4 = Int(ip);
	return (Shl(a1, 24) + Shl(a2, 16) + Shl(a3, 8) + a4) | 0;
}

//Get own IP from the U.S.G.N. (Unreal Software Gaming Network)
/** Function udp_getip() */
export function udp_getip(): number {
	let tcps = 0;
	let in_ = '';
	tcps = NET.OpenTCPStream('usgn.unrealsoftware.de', 80);
	if (tcps !== 0) {
		NET.WriteLine(tcps, 'GET http://usgn.unrealsoftware.de/getip.php');
		in_ = NET.ReadLine(tcps);
		G.udp_ip = udp_ip(in_);
		NET.CloseTCPStream(tcps);
		return 1;
	}
	return 0;
}

//Clear
/** Function udp_clear() */
export function udp_clear(): void {
	let Tudp_con_: Tudp_con | null = null;
	let Tudp_ipq_: Tudp_ipq | null = null;
	let Tudp_spq_: Tudp_spq | null = null;
	let Tudp_msg_: Tudp_msg | null = null;
	let Tudp_cest_: Tudp_cest | null = null;
	let Tudp_resend_: Tudp_resend | null = null;
	//Connection
	if (G.udp !== 0) {
		NS.CloseUDPStream(G.udp);
		G.udp = 0;
	}
	G.udp_port = 0;
	G.udp_ip = 0;
	//Connections
	for (Tudp_con_ = First(Tudp_con); Tudp_con_ !== null; Tudp_con_ = After(Tudp_con, Tudp_con_)) {
		Delete(Tudp_con, Tudp_con_);
	}
	//Packet Queues
	for (Tudp_ipq_ = First(Tudp_ipq); Tudp_ipq_ !== null; Tudp_ipq_ = After(Tudp_ipq, Tudp_ipq_)) {
		FreeBank(bankOf(Tudp_ipq_.db));
		Delete(Tudp_ipq, Tudp_ipq_);
	}
	for (Tudp_spq_ = First(Tudp_spq); Tudp_spq_ !== null; Tudp_spq_ = After(Tudp_spq, Tudp_spq_)) {
		FreeBank(bankOf(Tudp_spq_.db));
		Delete(Tudp_spq, Tudp_spq_);
	}
	//Messages
	for (Tudp_msg_ = First(Tudp_msg); Tudp_msg_ !== null; Tudp_msg_ = After(Tudp_msg, Tudp_msg_)) {
		FreeBank(bankOf(Tudp_msg_.db));
		Delete(Tudp_msg, Tudp_msg_);
	}
	//CESTs
	for (Tudp_cest_ = First(Tudp_cest); Tudp_cest_ !== null; Tudp_cest_ = After(Tudp_cest, Tudp_cest_)) {
		Delete(Tudp_cest, Tudp_cest_);
	}
	//Resends
	for (Tudp_resend_ = First(Tudp_resend); Tudp_resend_ !== null; Tudp_resend_ = After(Tudp_resend, Tudp_resend_)) {
		FreeBank(bankOf(Tudp_resend_.db));
		Delete(Tudp_resend, Tudp_resend_);
	}
}

//Setup
/** Function udp_setup(port=0) */
export function udp_setup(port: number = 0): number {
	//Clear
	udp_clear();
	//Connection
	G.udp = NS.CreateUDPStream(port);
	if (G.udp === 0) return 0;
	//Data
	G.udp_port = NS.UDPStreamPort(G.udp);
	return 0;
}

//Join
/** Function udp_join(ip,port,timeout=10000,rate=500) */
export function udp_join(ip: number, port: number, timeout: number = 10000, rate: number = 500): number {
	let lastsend = 0;
	let start = 0;
	let avail = 0;
	let fip = 0;
	let fport = 0;
	let id = 0;
	let Tudp_con_: Tudp_con | null = null;
	lastsend = 0;
	start = MilliSecs();
	// The original stands in this loop (no Flip, no Delay) until the host answers or the time is up.
	while (((MilliSecs() - start) | 0) < timeout) {
		//Read
		while (NS.RecvUDPMsg(G.udp) !== 0) {
			avail = NS.ReadAvail(G.udp);
			if (avail === 1) {
				//From Data
				fip = NS.UDPMsgIP(G.udp);
				fport = NS.UDPMsgPort(G.udp);
				//ID
				id = NS.ReadByte(G.udp);
				switch (id) {
					//Okay
					case Cudp_cest_ack:
					case Cudp_cest_exists:
						for (Tudp_con_ = First(Tudp_con); Tudp_con_ !== null; Tudp_con_ = After(Tudp_con, Tudp_con_)) {
							if (Tudp_con_.ip === fip) {
								if (Tudp_con_.port === fport) {
									Delete(Tudp_con, Tudp_con_);
								}
							}
						}
						//Connection Setup
						Tudp_con_ = New(Tudp_con);
						udp_con_setup(Tudp_con_, fip, fport);
						//Host Setup
						G.udp_hostip = fip;
						G.udp_hostport = fport;
						//DebugLog "UDP: Joined!"
						return 1;
					//Default (Failure)
					default:
						return id;
				}
			}
		}

		//Send Request
		if (((MilliSecs() - lastsend) | 0) > rate) {
			NS.WriteByte(G.udp, Cudp_cest_req);
			NS.SendUDPMsg(G.udp, ip, port);
			lastsend = MilliSecs();
			//DebugLog "UDP: Send CEST Join Request "+Cudp_cest_req
		}
	}
	//Failure
	return Cudp_cest_timeout;
}

//Connection Setup
/** Function udp_con_setup(con.Tudp_con,ip,port) */
export function udp_con_setup(con: Tudp_con | null, ip: number, port: number): void {
	//Address
	con!.ip = ip;
	con!.port = port;
	//IDs
	con!.iid = 2;
	con!.sid = 0;
	//Timers
	con!.ack = MilliSecs();
	con!.lastaction = MilliSecs();
	con!.resend = 0;
}

//Connection Delete
/** Function udp_con_delete(con.Tudp_con) */
export function udp_con_delete(con: Tudp_con | null): void {
	//Delete
	Delete(Tudp_con, con);
}

//Update
/** Function udp_update() */
export function udp_update(): void {
	let Tudp_msg_: Tudp_msg | null = null;
	let packetexists = 0;
	let Tudp_spq_: Tudp_spq | null = null;
	let size = 0;
	let oldsize = 0;
	let foundcon = 0;
	let Tudp_con_: Tudp_con | null = null;
	let reliableid = 0;
	let i = 0;
	let byte = 0;
	let Tudp_cest_: Tudp_cest | null = null;
	let Tudp_resend_: Tudp_resend | null = null;
	//Timer
	G.udp_ms = MilliSecs();

	//Process queued Packets and Update Connections
	udp_process_queued();

	//Get new Packets or cest Messages
	udp_get();

	//Assemble Messages to Packets
	for (Tudp_msg_ = First(Tudp_msg); Tudp_msg_ !== null; Tudp_msg_ = After(Tudp_msg, Tudp_msg_)) {
		packetexists = 0;
		//Add to existing, unsended Packet
		for (Tudp_spq_ = First(Tudp_spq); Tudp_spq_ !== null; Tudp_spq_ = After(Tudp_spq, Tudp_spq_)) {
			if (Tudp_spq_.sended === 0) {
				if (Tudp_spq_.ip === Tudp_msg_.ip) {
					if (Tudp_spq_.port === Tudp_msg_.port) {
						packetexists = 1;
						size = BankSize(bankOf(Tudp_msg_.db));
						oldsize = BankSize(bankOf(Tudp_spq_.db));
						//Add System Messages at Beginning
						if (Tudp_msg_.system === 1) {
							ResizeBank(bankOf(Tudp_spq_.db), oldsize + size);
							CopyBank(bankOf(Tudp_spq_.db), 0, bankOf(Tudp_spq_.db), size, oldsize);
							CopyBank(bankOf(Tudp_msg_.db), 0, bankOf(Tudp_spq_.db), 0, size);
							//Add Normal Messages at End
						} else {
							ResizeBank(bankOf(Tudp_spq_.db), oldsize + size);
							CopyBank(bankOf(Tudp_msg_.db), 0, bankOf(Tudp_spq_.db), oldsize, size);
						}
						if (Tudp_msg_.reliable === 1) Tudp_spq_.reliable = 1;
					}
				}
			}
		}
		//Create new Packet
		if (packetexists === 0) {
			Tudp_spq_ = New(Tudp_spq);
			Tudp_spq_.ip = Tudp_msg_.ip;
			Tudp_spq_.port = Tudp_msg_.port;
			size = BankSize(bankOf(Tudp_msg_.db));
			Tudp_spq_.db = bankHandle(CreateBank(size));
			CopyBank(bankOf(Tudp_msg_.db), 0, bankOf(Tudp_spq_.db), 0, size);
			Tudp_spq_.reliable = Tudp_msg_.reliable;
			Tudp_spq_.time = G.udp_ms;
		}
		//Delete Message
		FreeBank(bankOf(Tudp_msg_.db));
		Delete(Tudp_msg, Tudp_msg_);
	}

	//Send Stuff (in an interval of udp_sendrate millisecs)
	if (((G.udp_ms - G.udp_sendtimer) | 0) >= G.udp_sendrate) {
		G.udp_sendtimer = G.udp_ms;
		for (Tudp_spq_ = First(Tudp_spq); Tudp_spq_ !== null; Tudp_spq_ = After(Tudp_spq, Tudp_spq_)) {
			if (Tudp_spq_.sended === 0) {
				//Find Connection
				foundcon = 0;
				for (Tudp_con_ = First(Tudp_con); Tudp_con_ !== null; Tudp_con_ = After(Tudp_con, Tudp_con_)) {
					if (Tudp_con_.ip === Tudp_spq_.ip) {
						if (Tudp_con_.port === Tudp_spq_.port) {
							foundcon = 1;
							break;
						}
					}
				}
				//Create New Connection
				if (foundcon === 0) {
					//Connection Setup
					Tudp_con_ = New(Tudp_con);
					udp_con_setup(Tudp_con_, Tudp_spq_.ip, Tudp_spq_.port);
				}
				//Reliable Send ID
				reliableid = 0;
				if (Tudp_spq_.reliable === 1) {
					Tudp_con_!.sid = Tudp_con_!.sid + 2;
					if (Tudp_con_!.sid > Cudp_win_limit) {
						Tudp_con_!.sid = 0;
					}
					reliableid = Tudp_con_!.sid;
				} else {
					reliableid = Tudp_con_!.sid + 1;
				}
				//Send
				NS.WriteShort(G.udp, reliableid);
				size = BankSize(bankOf(Tudp_spq_.db));
				for (i = 0; i <= size - 1; i++) {
					if (encr === 0) {
						NS.WriteByte(G.udp, PeekByte(bankOf(Tudp_spq_.db), i));
					} else {
						byte = PeekByte(bankOf(Tudp_spq_.db), i);
						byte = byte ^ Cudp_encrk;
						NS.WriteByte(G.udp, byte);
					}
				}
				NS.SendUDPMsg(G.udp, Tudp_con_!.ip, Tudp_con_!.port);
				//Sended!
				Tudp_spq_.sended = 1;
				Tudp_spq_.id = Tudp_con_!.sid;
				//Delete when unreliable
				if (Tudp_spq_.reliable === 0) {
					FreeBank(bankOf(Tudp_spq_.db));
					Delete(Tudp_spq, Tudp_spq_);
				}
			}
		}

		//Send Connection Establishing Answers
		for (Tudp_cest_ = First(Tudp_cest); Tudp_cest_ !== null; Tudp_cest_ = After(Tudp_cest, Tudp_cest_)) {
			NS.WriteByte(G.udp, Tudp_cest_.msg);
			NS.SendUDPMsg(G.udp, Tudp_cest_.ip, Tudp_cest_.port);
			//DebugLog "UDP: Send CEST Answer "+Tudp_cest\msg+" to "+DottedIP(Tudp_cest\ip)+":"+Tudp_cest\port
			Delete(Tudp_cest, Tudp_cest_);
		}

		//Send Resend
		for (Tudp_resend_ = First(Tudp_resend); Tudp_resend_ !== null; Tudp_resend_ = After(Tudp_resend, Tudp_resend_)) {
			//Send
			NS.WriteShort(G.udp, Tudp_resend_.id);
			size = BankSize(bankOf(Tudp_resend_.db));
			for (i = 0; i <= size - 1; i++) {
				if (encr === 0) {
					NS.WriteByte(G.udp, PeekByte(bankOf(Tudp_resend_.db), i));
				} else {
					byte = PeekByte(bankOf(Tudp_resend_.db), i);
					byte = byte ^ Cudp_encrk;
					NS.WriteByte(G.udp, byte);
				}
			}
			NS.SendUDPMsg(G.udp, Tudp_resend_.ip, Tudp_resend_.port);
			//Free
			FreeBank(bankOf(Tudp_resend_.db));
			Delete(Tudp_resend, Tudp_resend_);
		}
	}
}

//Get
/** Function udp_get() */
export function udp_get(): void {
	let avail = 0;
	let fip = 0;
	let fport = 0;
	let id = 0;
	let foundcon = 0;
	let Tudp_con_: Tudp_con | null = null;
	let Tudp_cest_: Tudp_cest | null = null;
	let foundpacket = 0;
	let Tudp_ipq_: Tudp_ipq | null = null;
	let inbyte = 0;
	let i = 0;
	//Read Everything!
	while (NS.RecvUDPMsg(G.udp) !== 0) {
		avail = NS.ReadAvail(G.udp);
		if (avail > 0) {
			//From Data
			fip = NS.UDPMsgIP(G.udp);
			fport = NS.UDPMsgPort(G.udp);

			//###################### Connection Establishing Messages (1 Byte)
			if (avail === 1) {
				//Read ID
				id = NS.ReadByte(G.udp);

				//DebugLog "UDP: Got CEST Message "+id+" from "+DottedIP(fip)+":"+fport

				switch (id) {
					//Connection Establishing Request
					case Cudp_cest_req:
						//Is Host
						if (G.udp_host === 1) {
							foundcon = 0;
							for (Tudp_con_ = First(Tudp_con); Tudp_con_ !== null; Tudp_con_ = After(Tudp_con, Tudp_con_)) {
								if (Tudp_con_.ip === fip) {
									if (Tudp_con_.port === fport) {
										foundcon = 1;
										break;
									}
								}
							}
							Tudp_cest_ = New(Tudp_cest);
							Tudp_cest_.ip = fip;
							Tudp_cest_.port = fport;
							//Connection already exists
							if (foundcon === 1) {
								Tudp_cest_.msg = Cudp_cest_exists;
								//Acknowledgment
							} else {
								Tudp_cest_.msg = Cudp_cest_ack;
								//Connection Setup
								Tudp_con_ = New(Tudp_con);
								udp_con_setup(Tudp_con_, fip, fport);
							}
							//No Host
						} else {
							Tudp_cest_ = New(Tudp_cest);
							Tudp_cest_.ip = fip;
							Tudp_cest_.port = fport;
							Tudp_cest_.msg = Cudp_cest_nohost;
						}
						break;

					//Server Info Request
					case 100:
						//Host?
						if (G.udp_host === 1) {
							// quirk: the answer is a fixed placeholder, not the data of this server
							NS.WriteByte(G.udp, 101);
							NS.WriteString(G.udp, 'Bla');
							NS.WriteString(G.udp, 'mp_sawmp');
							NS.WriteByte(G.udp, 1);
							NS.WriteByte(G.udp, 4);
							NS.WriteByte(G.udp, 0);
							NS.SendUDPMsg(G.udp, fip, fport);
						}
						break;

					//Error
					default:
					//DebugLog "UDP: Unexpected Message from "+DottedIP(fip)+":"+fport
				}

				//###################### Packets (at least 3 Bytes)
			} else if (avail > 2) {
				//Valid Connection?
				foundcon = 0;
				for (Tudp_con_ = First(Tudp_con); Tudp_con_ !== null; Tudp_con_ = After(Tudp_con, Tudp_con_)) {
					if (Tudp_con_.ip === fip) {
						if (Tudp_con_.port === fport) {
							//Update Connection Last Action
							Tudp_con_.lastaction = G.udp_ms;

							//ID
							id = NS.ReadShort(G.udp);

							//Packet exists? -> Ignore
							foundpacket = 0;
							for (Tudp_ipq_ = First(Tudp_ipq); Tudp_ipq_ !== null; Tudp_ipq_ = After(Tudp_ipq, Tudp_ipq_)) {
								if (Tudp_ipq_.ip === fip) {
									if (Tudp_ipq_.port === fport) {
										if (Tudp_ipq_.id === id) {
											foundpacket = 1;
											break;
										}
									}
								}
							}
							//Packet doesn't exist -> put in Queue
							if (foundpacket === 0) {
								Tudp_ipq_ = New(Tudp_ipq);
								Tudp_ipq_.ip = fip;
								Tudp_ipq_.port = fport;
								Tudp_ipq_.id = id;
								Tudp_ipq_.time = G.udp_ms;
								//Reliable?
								if (imod(id, 2) === 0) Tudp_ipq_.reliable = 1;
								//System?
								inbyte = NS.ReadByte(G.udp);
								if (encr === 1) inbyte = inbyte ^ Cudp_encrk;
								if (inbyte >= Cudp_sys) Tudp_ipq_.system = 1;
								//Data
								Tudp_ipq_.db = bankHandle(CreateBank(avail - 2));
								PokeByte(bankOf(Tudp_ipq_.db), 0, inbyte);
								for (i = 1; i <= avail - 3; i++) {
									inbyte = NS.ReadByte(G.udp);
									if (encr === 0) {
										PokeByte(bankOf(Tudp_ipq_.db), i, inbyte);
									} else {
										inbyte = inbyte ^ Cudp_encrk;
										PokeByte(bankOf(Tudp_ipq_.db), i, inbyte);
									}
								}
								//Process System Messages immediately
								if (Tudp_ipq_.system === 1) {
									udp_system(Tudp_ipq_);
								}
							}

							//DebugLog "got msg #"+Tudp_ipq\id

							foundcon = 1;
							break;
						}
					}
				}

				//Invalid Connection
				if (foundcon === 0) {
					while (NS.ReadAvail(G.udp) > 0) {
						NS.ReadByte(G.udp);
					}
					//DebugLog "UDP: Unexpected Message from "+DottedIP(fip)+":"+fport
				}

				//Read ID
				//id=ReadShort(udp)

				//###################### Invalid Message
			} else {
				//Error
				while (NS.ReadAvail(G.udp) > 0) {
					NS.ReadByte(G.udp);
				}
				//DebugLog "UDP: Unexpected Message from "+DottedIP(fip)+":"+fport
			}
		}
	}
}

//Process System Messages in Packet (and remove them!)
/** Function udp_system(in.Tudp_ipq) */
export function udp_system(in_: Tudp_ipq | null): void {
	let size = 0;
	let i = 0;
	let msgid = 0;
	let id = 0;
	let lowest = 0;
	let highest = 0;
	let Tudp_spq_: Tudp_spq | null = null;
	let Tudp_resend_: Tudp_resend | null = null;
	let lastsys = '';
	size = BankSize(bankOf(in_!.db));
	for (i = 0; i <= size - 1; i++) {
		// PeekByteR / PeekShortR / CopyBankR: bank access without range check, see _additions/net.ts
		msgid = PeekByteR(bankOf(in_!.db), i);
		//System ID
		if (msgid >= Cudp_sys) {
			switch (msgid) {
				//Ping
				case Cudp_sys_ping:
					break;

				//Req
				case Cudp_sys_req:
					id = PeekShortR(bankOf(in_!.db), i + 1);
					i = i + 2;

					lowest = 10000;
					highest = 0;

					//Resend and Dump
					for (Tudp_spq_ = First(Tudp_spq); Tudp_spq_ !== null; Tudp_spq_ = After(Tudp_spq, Tudp_spq_)) {
						if (Tudp_spq_.ip === in_!.ip) {
							if (Tudp_spq_.port === in_!.port) {
								if (Tudp_spq_.sended === 1) {
									//Dump implicit acknowledged Messages
									if (udp_windowing(id - 1, Tudp_spq_.id) === 0) {
										if (Tudp_spq_.id < lowest) lowest = Tudp_spq_.id;
										if (Tudp_spq_.id > highest) highest = Tudp_spq_.id;

										DebugLog('discard ' + Str(Tudp_spq_.id));

										FreeBank(bankOf(Tudp_spq_.db));
										Delete(Tudp_spq, Tudp_spq_);

										//Resend requested Message
									} else if (Tudp_spq_.id === id) {
										Tudp_resend_ = New(Tudp_resend);
										Tudp_resend_.ip = Tudp_spq_.ip;
										Tudp_resend_.port = Tudp_spq_.port;
										Tudp_resend_.id = id;
										// quirk: `size` is the size of the incoming packet and the limit of the loop
										// around this; from here on it is the size of the resent packet, so the loop
										// reads on behind the (3 byte) request packet and the removal below works
										// with the wrong size.
										size = BankSize(bankOf(Tudp_spq_.db));
										Tudp_resend_.db = bankHandle(CreateBank(size));
										CopyBank(bankOf(Tudp_spq_.db), 0, bankOf(Tudp_resend_.db), 0, size);
									}
								}
							}
						}
					}

					lastsys = '!!! REQ ' + Str(id) + ' -> discard ' + Str(lowest) + '-' + Str(highest);
					break;

				//Ack
				case Cudp_sys_ack:
					id = PeekShortR(bankOf(in_!.db), i + 1);
					i = i + 2;

					lowest = 10000;
					highest = 0;

					//Dump acknowledged Messages
					// quirk: the acknowledged id is the receiver's NEXT expected packet (Tudp_con\iid), and
					// udp_windowing(id,id)=0, so a sent packet with exactly that id is dumped although it
					// has not arrived yet. If it was lost, it can never be resent.
					for (Tudp_spq_ = First(Tudp_spq); Tudp_spq_ !== null; Tudp_spq_ = After(Tudp_spq, Tudp_spq_)) {
						if (Tudp_spq_.ip === in_!.ip) {
							if (Tudp_spq_.port === in_!.port) {
								if (Tudp_spq_.sended === 1) {
									if (udp_windowing(id, Tudp_spq_.id) === 0) {
										if (Tudp_spq_.id < lowest) lowest = Tudp_spq_.id;
										if (Tudp_spq_.id > highest) highest = Tudp_spq_.id;

										DebugLog('discard ' + Str(Tudp_spq_.id));

										FreeBank(bankOf(Tudp_spq_.db));
										Delete(Tudp_spq, Tudp_spq_);
									}
								}
							}
						}
					}

					lastsys = 'ACK ' + Str(id) + ' -> discard ' + Str(lowest) + '-' + Str(highest);
					break;

				//Nothing
				default:
			}
			//Non System ID - Finished!
		} else {
			i = i;
			break;
		}
	}
	void lastsys; // lastsys$ is a local that nothing reads
	//Remove complete Packet
	if (i >= size - 1) {
		FreeBank(bankOf(in_!.db));
		Delete(Tudp_ipq, in_);
		//Remove Start with System Messages of Packet
	} else {
		CopyBankR(bankOf(in_!.db), i, bankOf(in_!.db), 0, size - i);
		// quirk: size-1, not size-i: the packet keeps i-1 stale bytes at its end, which udp_process()
		// then reads as message ids. (And a packet with a single byte after the system messages is
		// removed completely by the test above.)
		ResizeBank(bankOf(in_!.db), size - 1);
		in_!.system = 0;
	}
}

//Process queued Packets
/** Function udp_process_queued() */
export function udp_process_queued(): void {
	let lo: Tudp_ipq | null = null;
	let Tudp_con_: Tudp_con | null = null;
	let ip = 0;
	let port = 0;
	let c = 0;
	let Tudp_ipq_: Tudp_ipq | null = null;
	let i = 0;
	let lowest = 0;
	let old: Tudp_ipq | null = null;
	//Check all Connections
	for (Tudp_con_ = First(Tudp_con); Tudp_con_ !== null; Tudp_con_ = After(Tudp_con, Tudp_con_)) {
		ip = Tudp_con_.ip;
		port = Tudp_con_.port;
		c = 0;
		//Count
		for (Tudp_ipq_ = First(Tudp_ipq); Tudp_ipq_ !== null; Tudp_ipq_ = After(Tudp_ipq, Tudp_ipq_)) {
			if (Tudp_ipq_.ip === ip) {
				if (Tudp_ipq_.port === port) {
					Tudp_ipq_.checked = 0;
					c = c + 1;
				}
			}
		}
		//Process in correct Order
		if (c > 0) {
			for (i = 1; i <= c; i++) {
				lowest = -1;
				//Find Lowest of unchecked
				for (Tudp_ipq_ = First(Tudp_ipq); Tudp_ipq_ !== null; Tudp_ipq_ = After(Tudp_ipq, Tudp_ipq_)) {
					if (Tudp_ipq_.ip === ip) {
						if (Tudp_ipq_.port === port) {
							if (Tudp_ipq_.checked === 0) {
								if (lowest === -1) {
									lowest = Tudp_ipq_.id;
									lo = Tudp_ipq_;
								} else {
									if (Tudp_ipq_.id < lowest) {
										lowest = Tudp_ipq_.id;
										lo = Tudp_ipq_;
									}
								}
							}
						}
					}
				}

				//Process Packet
				// quirk: when the wrap-around below deleted queued packets, later passes find nothing and
				// `lo` is still the packet deleted in an earlier pass
				lo!.checked = 1;

				//DebugLog "process "+lo\id+" reliable "+lo\reliable+" coniid "+Tudp_con\iid

				//Reliable Packet
				if (lo!.reliable === 1) {
					//Process
					if (lo!.id === Tudp_con_.iid) {
						udp_process(lo);
						Tudp_con_.iid = Tudp_con_.iid + 2;
						if (Tudp_con_.iid > Cudp_win_limit) {
							Tudp_con_.iid = 2;
							for (old = First(Tudp_ipq); old !== null; old = After(Tudp_ipq, old)) {
								if (old.ip === ip) {
									if (old.port === port) {
										if (old.id > idivConst(Cudp_win_limit, 2)) {
											FreeBank(bankOf(old.db));
											Delete(Tudp_ipq, old);
										}
									}
								}
							}
						}
						FreeBank(bankOf(lo!.db));
						Delete(Tudp_ipq, lo);
						Tudp_con_.resend = 0;
						//Discard
					} else if (lo!.id < Tudp_con_.iid) {
						FreeBank(bankOf(lo!.db));
						Delete(Tudp_ipq, lo);
						//Request Missing Packet(s)
					} else {
						if (Tudp_con_.resend === 0) {
							Tudp_con_.resend = G.udp_ms + G.udp_request;
							DebugLog('request ' + Str(Tudp_con_.iid));
						}
						break;
					}
					//Unreliable Packet
				} else {
					con_add('process unreliable packet');
					udp_process(lo);
					FreeBank(bankOf(lo!.db));
					Delete(Tudp_ipq, lo);
					//Process
					//If lo\id=Tudp_con\iid-1 Then
					//	udp_process(lo)
					//Discard
					//ElseIf lo\id<Tudp_con\iid-1 Then
					//	FreeBank lo\db
					//	Delete lo
					//EndIf
					//Request Missing Packet(s)
					//Else
					//	If Tudp_con\resend=0 Then
					//		Tudp_con\resend=udp_ms+udp_request
					//	EndIf
					//	Exit
					//EndIf
				}
			}
		}
		//Connection Timeout
		if (((G.udp_ms - Tudp_con_.lastaction) | 0) >= G.udp_timeout) {
			udp_con_delete(Tudp_con_);
		} else {
			//Send Acknowledgements
			if (Tudp_con_.resend === 0) {
				if (((G.udp_ms - Tudp_con_.ack) | 0) >= G.udp_ack) {
					Tudp_con_.ack = G.udp_ms;
					udp_send(Tudp_con_.ip, Tudp_con_.port, Cudp_sys_ack, 0);
					udp_w_short(Tudp_con_.iid);
				}
				//Request Missed Packet
			} else {
				if (((G.udp_ms - Tudp_con_.resend) | 0) >= 0) {
					Tudp_con_.resend = (G.udp_ms + G.udp_rerequest) | 0;
					udp_send(Tudp_con_.ip, Tudp_con_.port, Cudp_sys_req, 0);
					udp_w_short(Tudp_con_.iid);
				}
			}
		}
	}
}

//Windowing - delete old Messages
/** Function udp_windowing(id1,id2) */
export function udp_windowing(id1: number, id2: number): number {
	if (id2 === -1) return 1;
	//Check at End
	if (id1 >= Cudp_win_limit - Cudp_win_range) {
		if (id2 > id1) {
			return 1;
		} else {
			if (id2 <= Cudp_win_range - (Cudp_win_limit - id1)) {
				return 1;
			} else {
				return 0;
			}
		}
		//Check at Start
	} else if (id1 < Cudp_win_range) {
		if (id2 > id1) {
			if (id2 - id1 <= Cudp_win_range) {
				return 1;
			} else {
				return 0;
			}
		} else {
			return 0;
		}
		//Check somewhere else (Middle)
	} else {
		if (id2 > id1) {
			if (id2 - id1 <= Cudp_win_range) {
				return 1;
			} else {
				return 0;
			}
		} else {
			return 0;
		}
	}
}

//Repeat
//	z1=Input("1->")
//	z2=Input("2->")
//	Print udp_windowing(z1,z2)
//Forever
