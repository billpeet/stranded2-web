/**
 * includes/load_commandline.bb, ported line by line. It also serves as a
 * worked example of the translation rules of PORTING_GUIDE.md.
 */
import { Chr, Instr, Left, Len, Lower, Mid, Right, RuntimeError, Trim } from '../blitz';
import { live } from './_stubs';
import { con_add } from './con_add';
import { Cbmpf_green, Cbmpf_red } from './consts';
import { ChangeDir, CurrentDir, DeleteFile, FileType } from './files';
import { mod_check } from './mods';
import { G } from './state';
import { CommandLine, SystemProperty } from './sys';

/** Function parse_commandline(): Scan Commandline */
export function parse_commandline(): void {
	//Default Mod
	G.set_moddir = 'Stranded II';
	//Locals
	let pp = 1;
	let plen = 0;
	let cmd = '';
	let s = '';
	let partend = 0;
	let inbb = 0;
	let setupmods = 0;
	// implicitly declared locals of the original
	let modstart = 0;
	let modend = 0;
	let modquote = 0;
	let mods = '';
	let changed = 0;
	G.set_inbb = 0;
	plen = Len(G.set_cmd);
	if (plen > 0) {
		//Scan sign by sign
		while (pp < plen) {
			s = Mid(G.set_cmd, pp, 1);

			//Get Command Line Param introduced by "-"
			if (s === '-') {
				if (Instr(G.set_cmd, '-', pp + 1) === 0) {
					cmd = Mid(G.set_cmd, pp, -1);
				} else {
					cmd = Mid(G.set_cmd, pp, -1);
					partend = Instr(cmd, '-', 2);
					cmd = Left(cmd, partend - 1);
				}
				if (Instr(cmd, ' ')) {
					cmd = Left(cmd, Instr(cmd, ' ') - 1);
				}
				cmd = Trim(Lower(cmd));
				switch (cmd) {
					//inbb
					case '-inbb':
						con_add('COMMANDLINE: In BB IDE', Cbmpf_green);
						inbb = 1;
						G.set_inbb = 1;
						pp = pp + Len(cmd);
						break;
					//debug
					case '-debug':
						con_add('COMMANDLINE: Debug mode is ON', Cbmpf_green);
						G.set_debug = 1;
						pp = pp + Len(cmd);
						break;
					//win
					case '-win':
						con_add('COMMANDLINE: Using windowed mode', Cbmpf_green);
						G.set_scrwin = 2;
						pp = pp + Len(cmd);
						break;
					//setup
					case '-setup':
						setupmods = 1;
						pp = pp + Len(cmd);
						break;
					//mod
					case '-mod':
						pp = pp + Len(cmd);
						modstart = 0;
						modend = 0;
						modquote = 0;
						mods = '';
						for (let i = pp; i <= plen; i++) {
							mods = Mid(G.set_cmd, i, 1);
							//Start
							if (modstart === 0) {
								if (mods !== ' ') {
									if (mods === Chr(34)) {
										modquote = 1;
										modstart = i + 1;
									} else {
										modstart = i;
									}
								}
								//End
							} else {
								if (modquote === 0) {
									if (mods === ' ') {
										modend = i;
										break;
									}
								} else {
									if (mods === Chr(34)) {
										modend = i;
										break;
									}
								}
							}
						}
						if (modend === 0) modend = plen + 1;
						changed = 0;
						//Get Mod
						if (modstart > 0 && modstart <= plen) {
							if (modstart < modend) {
								G.set_moddir = Mid(G.set_cmd, modstart, modend - modstart);
								pp = modend;
								if (modquote === 1) pp = pp + 1;
								changed = 1;
							}
						}
						if (changed === 0) {
							con_add('COMMANDLINE: Unable to get mod name', Cbmpf_red);
						}
						break;
					//-default
					default:
						con_add("COMMANDLINE: '" + cmd + "' is no valid Command Line Parameter", Cbmpf_red);
						pp = pp + Len(cmd);
				}
				//No Command - Increase Position
			} else {
				pp = pp + 1;
			}
		}
	}
	//Root Dir
	if (inbb === 1) {
		G.set_rootdir = CurrentDir();
	} else {
		G.set_rootdir = SystemProperty('APPDIR');
	}
	if (Right(G.set_rootdir, 1) !== '\\') G.set_rootdir = G.set_rootdir + '\\';
	//Mod Dir
	if (G.set_moddir !== 'Stranded II') {
		if (FileType(G.set_rootdir + 'mods\\' + G.set_moddir) !== 2) {
			con_add("COMMANDLINE: Mod '" + G.set_moddir + "' does not exist - loading Stranded II", Cbmpf_red);
			G.set_moddir = 'Stranded II';
		} else {
			con_add("COMMANDLINE: Loading mod '" + G.set_moddir + "'", Cbmpf_green);
		}
	}
	//Set Path
	if (FileType(G.set_rootdir + 'mods\\' + G.set_moddir) !== 2) RuntimeError('Stranded II Mod dir/game files are missing');
	ChangeDir(G.set_rootdir + 'mods\\' + G.set_moddir);
	if (G.set_debug) con_add('Current Dir: ' + CurrentDir());
	con_add();
	//Check Mod
	if (setupmods === 1) {
		if (FileType(G.set_rootdir + 'core\\mods.inf') === 1) {
			DeleteFile(G.set_rootdir + 'core\\mods.inf');
		}
	}
	mod_check();
}

/**
 * Top-level code of load_commandline.bb:
 *     set_cmd$=Trim(CommandLine())
 *     parse_commandline()
 */
export function include_load_commandline(): void {
	G.set_cmd = Trim(CommandLine());
	parse_commandline();
}
