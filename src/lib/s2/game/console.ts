/**
 * includes/console.bb, ported line by line.
 *
 * The module exports a function named `console`; the browser's console is
 * `globalThis.console` in here (PORTING_GUIDE.md, section 2).
 */
//############################################ CONSOLE
import { Chr, CurrentDate, CurrentTime, Instr, Int, LSet, Left, Len, Mid, MilliSecs, Replace, SEP_LINE, Str, Trim, f32, idiv, idivConst } from '../blitz';
import { ActiveTextures, EntityAlpha, EntityX, EntityZ, TrisRendered, WireFrame } from '../bb3d';
import { GraphicsDepth, GraphicsHeight, GraphicsWidth, TileBlock } from '../gfx2d';
import { FlushKeys, KeyHit } from '../input';
import { Cbmpf_dark, Cbmpf_green, Cbmpf_over, Cbmpf_red, Cbmpf_tiny, Cbmpf_yellow, Cmenu_if_debug, Cmenu_if_debugmenu, Csection_game_mp, Csection_game_sp, Cversion } from './consts';
import { Ditem_name } from './defs_arrays';
import { CloseFile, WriteFile, WriteLine, type Stream } from './files';
import { zerofill } from './functions';
import { bmpf_txt } from './load_bmpf';
import { parent_h } from './parentchild';
import { G } from './state';
import { AvailVidMem, DottedIP, NET, TotalVidMem } from './sys';
import { After, Before, Delete, Each, First, Last, New, Tbui, Tcom, Tcon, Tconst, Tfrap, Titem, Tunit, Tx, isNull } from './types';

//### Console
/** Function console() */
export function console(): number {
	let Tcon_: Tcon | null = null;
	let i = 0;
	let y = 0;
	let key = 0;
	//Control Console
	if (KeyHit(41)) con_toggle();
	//Draw Console
	if (G.in_console === 0) return 0;
	TileBlock(G.gfx_bg[1]);
	Tcon_ = Last(Tcon);
	if (G.in_conscroll > 0) {
		for (i = 1; i <= G.in_conscroll; i++) {
			// quirk: with an empty console (after "cls") and a scroll offset, Before of Null crashes ("Memory access violation")
			Tcon_ = Before(Tcon, Tcon_);
			if (isNull(Tcon, Tcon_)) {
				G.in_conscroll = G.in_conscroll - 1;
				break;
			}
		}
	}
	for (y = G.set_scry - 40; y >= 0; y += -15) {
		if (isNull(Tcon, Tcon_)) break;
		if (Left(Tcon_!.txt, 1) === '!') {
			bmpf_txt(2, y - 2, '>', Int(Mid(Tcon_!.txt, 2, 1)));
			bmpf_txt(14, y, Mid(Tcon_!.txt, 4, -1), Cbmpf_tiny);
		} else {
			bmpf_txt(2, y, Tcon_!.txt, Cbmpf_tiny);
		}
		Tcon_ = Before(Tcon, Tcon_);
	}
	//Scroll
	G.in_conscroll = Int(f32(G.in_conscroll + f32(G.in_mzs * 3)));
	if (KeyHit(201)) G.in_conscroll = G.in_conscroll + 25;
	if (KeyHit(209)) G.in_conscroll = G.in_conscroll - 25;
	if (KeyHit(207)) G.in_conscroll = 0;
	if (G.in_conscroll < 0) G.in_conscroll = 0;
	//Input
	G.in_inputfocus = -1;
	key = G.in_key;
	if (key > 31 && key < 127) {
		G.in_conin = G.in_conin + Chr(key);
	} else if (key === 4) {
		G.in_conin = '';
	} else if (key === 8) {
		if (Len(G.in_conin) > 0) G.in_conin = LSet(G.in_conin, Len(G.in_conin) - 1);
	} else if (key === 13) {
		con_enter();
	}
	G.in_key = 0;
	//Remove ^
	if (Left(G.in_conin, 1) === '^') G.in_conin = Mid(G.in_conin, 2, -1);
	//Draw Input
	if (G.in_cursor !== 0) {
		bmpf_txt(2, G.set_scry - 15, G.in_conin + '|', Cbmpf_tiny);
	} else {
		bmpf_txt(2, G.set_scry - 15, G.in_conin, Cbmpf_tiny);
	}
	return 0;
}

//### Console Add Message
/** Function con_add(txt$="",special=-1) */
export function con_add(txt: string = '', special: number = -1): void {
	let Tcon_: Tcon | null = null;
	Tcon_ = New(Tcon);
	if (special === -1) {
		Tcon_.txt = txt;
	} else {
		Tcon_.txt = '!' + Str(special) + ' ' + txt;
	}
}

//### Console Clear
/** Function con_clear() */
export function con_clear(): void {
	let Tcon_: Tcon | null = null;
	for (Tcon_ = First(Tcon); Tcon_ !== null; Tcon_ = After(Tcon, Tcon_)) {
		Delete(Tcon, Tcon_);
	}
}

//### Console Welcome
/** Function con_welcome() */
export function con_welcome(): void {
	con_add();
	con_add('****************************************************************************************', 0);
	con_add('Welcome to Stranded II', 0);
	con_add('You are playing version ' + Cversion, 0);
	con_add('Web: www.stranded.unrealsoftware.de', 0);
	con_add('Mail: stranded2@unrealsoftware.de', 0);
	con_add('****************************************************************************************', 0);
	con_add();
}

//### Console Memory
/** Function con_memory() */
export function con_memory(): void {
	let total = 0;
	let avail = 0;
	let used = 0;
	con_add();
	total = TotalVidMem();
	avail = AvailVidMem();
	used = total - avail;
	con_add('*** Video Memory ***', 0);
	con_add('Total: ' + Str(idivConst(idivConst(total, 1024), 1024)) + ' mb (' + Str(idivConst(total, 1024)) + ' kb)', Cbmpf_over);
	con_add('Used: ' + Str(idivConst(idivConst(used, 1024), 1024)) + ' mb (' + Str(idivConst(used, 1024)) + ' kb)', Cbmpf_red);
	con_add('Avail: ' + Str(idivConst(idivConst(avail, 1024), 1024)) + ' mb (' + Str(idivConst(avail, 1024)) + ' kb)', Cbmpf_green);
	con_add();
}

//### Console 3D
/** Function con_3d() */
export function con_3d(): void {
	con_add();
	con_add('*** 3D Stats ***', 0);
	con_add('Res: ' + Str(GraphicsWidth()) + '*' + Str(GraphicsHeight()) + '*' + Str(GraphicsDepth()), Cbmpf_over);
	con_add('Tris: ' + Str(TrisRendered()) + ' (' + Str(idiv(TrisRendered(), 1000)) + ' k)', Cbmpf_over);
	con_add('Textures: ' + Str(ActiveTextures()), Cbmpf_over);
	con_add();
}

//### Console Debugmenu
/** Function con_debugmenu() */
export function con_debugmenu(): void {
	if (G.m_section === Csection_game_sp) {
		G.m_menu = Cmenu_if_debugmenu;
		con_close();
	} else {
		con_add('Debug Menu is only available in-game');
	}
}

//### Console Debug
/** Function con_debug() */
export function con_debug(): void {
	let Tunit_: Tunit | null = null;
	G.set_debug = 1 - G.set_debug;
	con_add();
	con_add('*** Debug ***', 0);
	if (G.set_debug === 1) {
		con_add('Debug mode is ON', Cbmpf_green);
		//Show Unit Collisionstuff
		for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
			if (Tunit_.vh !== null) EntityAlpha(Tunit_.vh, f32(0.5));
			if (Tunit_.h_pivot === 0) EntityAlpha(Tunit_.h, f32(0.1));
		}
	} else {
		con_add('Debug mode is OFF', Cbmpf_red);
		//Hide Unit Collisionstuff
		for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
			if (Tunit_.vh !== null) EntityAlpha(Tunit_.vh, 0);
			if (Tunit_.h_pivot === 0) EntityAlpha(Tunit_.h, 0);
		}
	}
	con_add();
}

//### Console Debug
/** Function con_debugtimes() */
export function con_debugtimes(): void {
	G.set_debug_rt = 1 - G.set_debug_rt;
	con_add();
	con_add('*** Debug Times ***', 0);
	if (G.set_debug_rt === 1) {
		con_add('Debug Times ON', Cbmpf_green);
	} else {
		con_add('Debug Times OFF', Cbmpf_red);
	}
	con_add();
}

//### Sequences Debug
/** Function con_debugsequences() */
export function con_debugsequences(): void {
	G.set_debug_seq = 1 - G.set_debug_seq;
	con_add();
	con_add('*** Debug Sequences ***', 0);
	if (G.set_debug_seq === 1) {
		con_add('Debug Sequences ON', Cbmpf_green);
	} else {
		con_add('Debug Sequences OFF', Cbmpf_red);
	}
	con_add();
}

//### Console Debug
/** Function con_debugmap() */
export function con_debugmap(): void {
	if (G.m_section === Csection_game_sp || G.m_section === Csection_game_mp) {
		G.set_debug_menu = 1;
		G.m_menu = Cmenu_if_debug;
		con_close();
	} else {
		con_add('Debugmap is only available in a single- or multiplayer game', Cbmpf_red);
	}
}

//### Script Debug
/** Function con_debugscript() */
export function con_debugscript(): void {
	let i = 0;
	con_add();
	con_add('*** Debug Script ***', 0);
	for (i = 0; i <= G.p_lines - 1; i++) {
		con_add(zerofill(Str(i + 1), 3) + ': ' + G.Dpc[i]);
	}
}

//### Console Debug Load
/** Function con_debugload() */
export function con_debugload(): void {
	G.set_debug_load = 1 - G.set_debug_load;
	con_add();
	con_add('*** Debug Load ***', 0);
	if (G.set_debug_load === 1) {
		con_add('Debug Load ON', Cbmpf_green);
	} else {
		con_add('Debug Load OFF', Cbmpf_red);
	}
	con_add();
}

//### Console Online
/** Function con_online() */
export function con_online(): void {
	let stream = 0;
	let online = 0;
	let ip = '';
	let ping = 0;
	stream = NET.OpenTCPStream('www.usgn.unrealsoftware.de', 80);
	if (stream !== 0) {
		ping = MilliSecs();
		NET.WriteLine(stream, 'GET http://www.usgn.unrealsoftware.de/getip.php');
		ip = NET.ReadLine(stream);
		ping = MilliSecs() - ping;
		if (ip !== '') online = 1;
		NET.CloseTCPStream(stream);
	}
	con_add();
	con_add('*** Online ***', 0);
	if (online === 1) {
		con_add('You are ONLINE', Cbmpf_green);
		con_add('IP: ' + ip, Cbmpf_over);
		con_add('Ping: ' + Str(ping) + ' ms (usgn.unrealsoftware.de)', Cbmpf_over);
	} else {
		con_add('You are OFFLINE', Cbmpf_red);
	}
	con_add();
}

//### Console Save
/** Function con_save() */
export function con_save(): void {
	let name = '';
	let stream: Stream = 0;
	let Tcon_: Tcon | null = null;
	name = 'CON_D_' + CurrentDate() + '_T_' + CurrentTime() + '.txt';
	name = Replace(name, ' ', '_');
	name = Replace(name, ':', '_');
	stream = WriteFile(name);
	if (stream !== 0) {
		for (Tcon_ = First(Tcon); Tcon_ !== null; Tcon_ = After(Tcon, Tcon_)) {
			WriteLine(stream, Tcon_.txt);
		}
		CloseFile(stream);
		con_add("Console output saved to '" + name + "'", Cbmpf_green);
	} else {
		con_add("ERROR: Unable to save console output to '" + name + "'", Cbmpf_red);
	}
}

//### Console Listplayers
/** Function con_listplayers() */
export function con_listplayers(): void {
	let Tunit_: Tunit | null = null;
	con_add();
	con_add('*** Player List ***', 0);
	for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
		if (Tunit_.id < 100) {
			if (Tunit_.id === G.g_player) {
				con_add('#' + Str(Tunit_.id) + ' ' + Tunit_.player_name + ' (' + DottedIP(Tunit_.player_ip) + ':' + Str(Tunit_.player_port) + ')', Cbmpf_green);
			} else {
				con_add('#' + Str(Tunit_.id) + ' ' + Tunit_.player_name + ' (' + DottedIP(Tunit_.player_ip) + ':' + Str(Tunit_.player_port) + ')', Cbmpf_yellow);
			}
		}
	}
}

//### Console Listvars
/** Function con_listvars() */
export function con_listvars(): void {
	let Tscr: Tx | null = null;
	con_add();
	con_add('*** Variables List ***', 0);
	for (Tscr = First(Tx); Tscr !== null; Tscr = After(Tx, Tscr)) {
		if (Tscr.mode === 1) {
			con_add('GLOBAL $' + Tscr.key + ' = ' + Tscr.value);
		}
	}
	for (Tscr = First(Tx); Tscr !== null; Tscr = After(Tx, Tscr)) {
		if (Tscr.mode === 4) {
			con_add('LOCAL $' + Tscr.key + ' = ' + Tscr.value + ' @ ' + Str(Tscr.parent_class) + ',' + Str(Tscr.parent_id));
		}
	}
}

//### Console Listconst
/** Function con_listconst() */
export function con_listconst(): void {
	con_add();
	con_add('*** Constants List ***', 0);
	// Each(): the Tconst list is a view of the script engine's map (types.ts), its objects are snapshots
	for (const Tconst_ of Each(Tconst)) {
		con_add('CONST #' + Tconst_.name + ' = ' + Str(Tconst_.value));
	}
}

//### Console Listitems
/** Function con_listitems() */
export function con_listitems(): void {
	let Titem_: Titem | null = null;
	con_add();
	con_add('*** Item List ***', 0);
	for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
		if (Titem_.parent_class === 0) {
			con_add('#' + Str(Titem_.id) + ' ' + Ditem_name(Titem_.typ) + ' ' + Str(Titem_.count) + 'x', Cbmpf_yellow);
		} else {
			con_add(
				'#' + Str(Titem_.id) + ' ' + Ditem_name(Titem_.typ) + ' ' + Str(Titem_.count) + 'x (stored ' + Str(Titem_.parent_class) + ',' + Str(Titem_.parent_id) + ',' + Str(Titem_.parent_mode) + ')',
				Cbmpf_dark
			);
		}
	}
}

//### Console Listscripts
/** Function con_listscripts() */
export function con_listscripts(): void {
	let txt = '';
	let x = 0;
	let Tscr: Tx | null = null;
	con_add();
	con_add('*** Scripts List ***', 0);
	if (G.map_briefing !== '') {
		con_add('Script @ 0,0 (Map Script)');
		txt = G.map_briefing;
		for (;;) {
			x = Instr(txt, SEP_LINE);
			if (x !== 0) {
				con_add(Left(txt, x - 1));
				txt = Mid(txt, x + 1);
			} else {
				con_add(txt);
				break;
			}
		}
	}
	for (Tscr = First(Tx); Tscr !== null; Tscr = After(Tx, Tscr)) {
		if (Tscr.mode === 0) {
			if (parent_h(Tscr.parent_class, Tscr.parent_id) !== null) {
				con_add('Script @ ' + Str(Tscr.parent_class) + ',' + Str(Tscr.parent_id), Cbmpf_yellow);
				txt = Tscr.value;
				for (;;) {
					x = Instr(txt, SEP_LINE);
					if (x !== 0) {
						con_add(Left(txt, x - 1));
						txt = Mid(txt, x + 1);
					} else {
						con_add(txt);
						break;
					}
				}
			} else {
				con_add('Script @ ' + Str(Tscr.parent_class) + ',' + Str(Tscr.parent_id) + ' - PARENT DOES NOT EXIST! -> DELETED', Cbmpf_red);
				txt = Tscr.value;
				for (;;) {
					x = Instr(txt, SEP_LINE);
					if (x !== 0) {
						con_add(Left(txt, x - 1));
						txt = Mid(txt, x + 1);
					} else {
						con_add(txt);
						break;
					}
				}
				Delete(Tx, Tscr);
			}
		}
	}
}

//### Console Listfraps
/** Function con_listfraps() */
export function con_listfraps(): void {
	let Tfrap_: Tfrap | null = null;
	let c = 0;
	con_add();
	con_add('*** FRAP List ***', 0);
	for (Tfrap_ = First(Tfrap); Tfrap_ !== null; Tfrap_ = After(Tfrap, Tfrap_)) {
		c = c + 1;
	}
	con_add('FRAP Count: ' + Str(c));
}

//### Console Wireframe
/** Function con_wireframe() */
export function con_wireframe(): void {
	G.set_debug_wireframe = 1 - G.set_debug_wireframe;
	con_add();
	con_add('*** Wireframe ***', 0);
	if (G.set_debug_wireframe === 1) {
		con_add('Wireframe mode is ON', Cbmpf_green);
	} else {
		con_add('Wireframe mode is OFF', Cbmpf_red);
	}
	WireFrame(G.set_debug_wireframe);
}

//### Mod Info
/** Function con_modinfo() */
export function con_modinfo(): void {
	let c = 0;
	let Tbui_: Tbui | null = null;
	let Tcom_: Tcom | null = null;
	con_add();
	con_add('*** Mod Info ***', 0);
	con_add('Name/Dir: ' + G.set_moddir, 1);
	con_add('---------------', 0);
	con_add('Objects: ' + Str(G.object_count), 1);
	con_add('Units: ' + Str(G.unit_count), 1);
	con_add('Items: ' + Str(G.item_count), 1);
	con_add('Infos: ' + Str(G.info_count), 1);
	con_add('---------------', 0);
	c = 0;
	for (Tbui_ = First(Tbui); Tbui_ !== null; Tbui_ = After(Tbui, Tbui_)) {
		if (Tbui_.mode === 2) c = c + 1;
	}
	con_add('Buildings: ' + Str(c), 1);
	c = 0;
	for (Tcom_ = First(Tcom); Tcom_ !== null; Tcom_ = After(Tcom, Tcom_)) {
		if (Tcom_.mode === 2) c = c + 1;
	}
	con_add('Combinations: ' + Str(c), 1);
	con_add();
}

//### Console Enter
/** Function con_enter() */
export function con_enter(): void {
	let Tunit_: Tunit | null = null;
	switch (Trim(G.in_conin)) {
		case 'clear':
		case 'cls':
			con_clear();
			break;
		case 'close':
			G.in_console = 0;
			break;
		case 'quit':
		case 'exit':
			G.m_performquit = 1;
			break;
		case 'welcome':
		case 'info':
		case 'version':
			con_welcome();
			break;
		case 'memory':
			con_memory();
			break;
		case '3d':
		case 'tris':
			con_3d();
			break;
		case 'debugmenu':
		case 'cheat':
		case 'dm':
			con_debugmenu();
			break;
		case 'debug':
			con_debug();
			break;
		case 't':
		case 'debugtimes':
		case 'times':
			con_debugtimes();
			break;
		case 'seq':
		case 'debugsequences':
		case 'debugseq':
		case 'sequences':
			con_debugsequences();
			break;
		case 'debugmap':
			con_debugmap();
			break;
		case 'debugscript':
			con_debugscript();
			break;
		case 'debugload':
			con_debugload();
			break;
		case 'online':
		case 'ip':
		case 'ping':
		case 'net':
		case 'www':
			con_online();
			break;
		case 'save':
			con_save();
			break;
		case 'listplayers':
		case 'playerlist':
			con_listplayers();
			break;
		case 'vars':
		case 'listvars':
		case 'debugvars':
			con_listvars();
			break;
		case 'items':
		case 'listitems':
			con_listitems();
			break;
		case 'scripts':
		case 'listscripts':
			con_listscripts();
			break;
		case 'fraps':
		case 'listfraps':
			con_listfraps();
			break;
		case 'wireframe':
		case 'wf':
			con_wireframe();
			break;
		case 'centers':
			for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
				con_add(Str(EntityX(Tunit_.ai_ch), 'float') + '|' + Str(EntityZ(Tunit_.ai_ch), 'float'));
			}
			break;
		case 'gore':
			G.set_gore = 1;
			break;
		case 'nogore':
			G.set_gore = 0;
			break;
		case 'interface':
		case 'if':
			G.set_drawinterface = 1 - G.set_drawinterface;
			break;
		case 'const':
			con_listconst();
			break;
		case 'modinfo':
			con_modinfo();
			break;
		case '':
			con_add('');
			break;
		default:
			con_add("ERROR: Unknown Command '" + Trim(G.in_conin) + "'", Cbmpf_red);
	}
	G.in_conin = '';
}

//### Console Toggle
/** Function con_toggle(set=-1) */
export function con_toggle(set: number = -1): void {
	G.in_console = 1 - G.in_console;
	if (set !== -1) G.in_console = set;
	FlushKeys();
	G.in_conin = '';
	G.in_conscroll = 0;
}

//### Console Close
/** Function con_close() */
export function con_close(): void {
	con_toggle(0);
}

//### Console Open
/** Function con_open() */
export function con_open(): void {
	con_toggle(1);
}
