/**
 * includes/debug.bb, ported line by line.
 *
 * debug() is a sync barrier (called from the synchronous endinput()): its
 * F12 "back to the editor" branch runs through defer() (PORTING_GUIDE.md, section 7).
 */
//############################################ Debug Outputs
import { Abs, Instr, Int, Left, Mid, MilliSecs, SEP_LINE, Str, f32, idivConst } from '../blitz';
import { EntityPitch, EntityRoll, EntityX, EntityY, EntityYaw, EntityZ } from '../bb3d';
import { Color, Line, Rect } from '../gfx2d';
import { KeyHit } from '../input';
import { con_add, con_enter } from './console';
import { Cbmpf_red, Cclass_info, Cclass_item, Cclass_object, Cclass_unit, Csection_editor, Csection_game_sp } from './consts';
import { Dinfo_name, Ditem_health, Ditem_name, Dobject_name, Dstate_name, Dunit_name } from './defs_arrays';
import { load_map } from './e_load_map';
import { editor_ini } from './editor_functions';
import { CloseFile, FileType, OpenFile, WriteFile, WriteLine, type Stream } from './files';
import { defer } from './flow';
import { draw_units_debug } from './handle_units';
import { bmpf_txt_c, bmpf_txt_r } from './load_bmpf';
import { se } from './load_strings';
import { parse_getclass } from './parser_functions';
import { G } from './state';
import { DottedIP } from './sys';
import { After, First, Tinfo, Titem, Tobject, Tseq, Tstate, Tudp_con, Tunit, Tup, Tx } from './types';

//### Normal Debug Output
/** Function debug() */
export function debug(): void {
	let debugtime = 0;
	let y = 0;
	let Tudp_con_: Tudp_con | null = null;
	let i = 0;
	let Tseq_: Tseq | null = null;
	if (G.set_debug !== 0) {
		debugtime = MilliSecs();

		//AI
		draw_units_debug();

		//FPS
		bmpf_txt_r(G.set_scrx - 3, 0, Str(G.fps) + ' FPS', 5);
		//FPS Factor
		bmpf_txt_r(G.set_scrx - 3, 12, Left(Str(G.f, 'float'), 5) + ' Factor', 5);

		//Pitch
		//bmpf_txt_r(set_scrx-3,y,Int(EntityPitch(cam)))

		//Jump
		//If con_unit(g_player)
		//bmpf_txt_r(set_scrx-3,20, TCunit\phy_jump#+" Jump",5)
		//bmpf_txt_r(set_scrx-3,30, (ms-TCunit\phy_ft)+" Last Col.",5)
		//EndIf

		//UDP
		y = 450;
		for (Tudp_con_ = First(Tudp_con); Tudp_con_ !== null; Tudp_con_ = After(Tudp_con, Tudp_con_)) {
			bmpf_txt_r(G.set_scrx - 3, y, DottedIP(Tudp_con_.ip) + ':' + Str(Tudp_con_.port));
			y = y + 15;
		}

		//Y for Outputs
		y = 25;

		//Debug Times
		if (G.set_debug_rt !== 0) {
			bmpf_txt_r(G.set_scrx - 3, y, G.set_debug_rt_objects, 5);
			y = y + 12;
			bmpf_txt_r(G.set_scrx - 3, y, G.set_debug_rt_units, 5);
			y = y + 12;
			bmpf_txt_r(G.set_scrx - 3, y, G.set_debug_rt_items, 5);
			y = y + 12;
			bmpf_txt_r(G.set_scrx - 3, y, G.set_debug_rt_infos, 5);
			y = y + 12;
			bmpf_txt_r(G.set_scrx - 3, y, G.set_debug_rt_states, 5);
			y = y + 12;
			bmpf_txt_r(G.set_scrx - 3, y, G.set_debug_rt_particles, 5);
			y = y + 12;
			bmpf_txt_r(G.set_scrx - 3, y, G.set_debug_rt_cull, 5);
			y = y + 12;
			bmpf_txt_r(G.set_scrx - 3, y, G.set_debug_rt_poststuff, 5);
			y = y + 12;
			bmpf_txt_r(G.set_scrx - 3, y, G.set_debug_rt_updateworld, 5);
			y = y + 12;
			bmpf_txt_r(G.set_scrx - 3, y, Str(G.set_debug_rt_render) + ' ms Rendertime', 5);
			y = y + 12;
			bmpf_txt_r(G.set_scrx - 3, y, Str(MilliSecs() - debugtime) + ' ms Debug', 5);
			y = y + 12;
		}

		//Debug Sequences
		if (G.set_debug_seq !== 0) {
			bmpf_txt_r(G.set_scrx - 3, y, 'SEQ T: ' + Str(MilliSecs() - G.seq_start) + ' CAM: ' + Str(G.seq_cpoint), 5);
			y = y + 12;
			i = 0;
			for (Tseq_ = First(Tseq); Tseq_ !== null; Tseq_ = After(Tseq, Tseq_)) {
				bmpf_txt_r(G.set_scrx - 3, y, Str(Tseq_.t) + ' ' + Tseq_.event, 5);
				y = y + 12;
				i = i + 1;
				if (i > 10) break;
			}
		}

		//Cam Position
		bmpf_txt_r(G.set_scrx - 3, y, 'cam: ' + Str(Int(EntityX(G.cam))) + '|' + Str(Int(EntityY(G.cam))) + '|' + Str(Int(EntityZ(G.cam))), 5);
		y = y + 12;
		//Cam Rotation
		bmpf_txt_r(G.set_scrx - 3, y, 'pitch: ' + Str(Int(EntityPitch(G.cam))) + ' yaw: ' + Str(Int(EntityYaw(G.cam))), 5);
		y = y + 12;
	}

	//Testmap
	if (G.set_debug_testmap === 1) {
		if (G.m_section === Csection_game_sp) {
			if (G.set_drawinterface === 1) {
				bmpf_txt_c(idivConst(G.set_scrx, 2), G.set_scry - 20, se(204), G.in_cursor);
			}
			//F12 -> Testmap
			if (KeyHit(88)) {
				// deferred: debug() is synchronous (called from endinput); the rest of the frame runs before this block
				defer(async () => {
					await editor_ini();
					G.m_section = Csection_editor;
					if (Instr(G.set_debug_testmapfile, ':')) {
						await load_map(G.set_debug_testmapfile + '.s2', '');
					} else {
						await load_map('maps\\' + G.set_debug_testmapfile + '.s2', '');
					}
					if (G.set_debug_testmapfile === 'editor\\checkmap') {
						G.in_edmap = '';
					} else {
						G.in_edmap = G.set_debug_testmapfile;
					}
					G.set_debug = 0;
				});
			}
		}
	}
}

//### Debug Map
/** Function debug_map() */
export function debug_map(): void {
	let sc = 0;
	let bx = 0;
	let bz = 0;
	let cx = 0;
	let cz = 0;
	let x = 0;
	let z = 0;
	let camx = 0;
	let camz = 0;
	let Tunit_: Tunit | null = null;
	//Scale Factor
	sc = f32(0.3);
	//Back
	//Color 0,0,0
	//Rect 236,63,537,509,1
	//Set Bounds
	bx = idivConst(537, 2);
	bz = idivConst(509, 2);
	//Set Center
	cx = 236 + bx;
	cz = 63 + bz;
	//Calc Center Pos
	camx = EntityX(G.cam);
	camz = EntityZ(G.cam);
	//Units
	for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
		x = Int(f32(f32(camx - EntityX(Tunit_.h)) * sc));
		z = Int(f32(f32(camz - EntityZ(Tunit_.h)) * sc));
		if (Abs(x) < bx) {
			if (Abs(z) < bz) {
				Color(150, 150, 150);
				Line(cx + x, cz + z, f32(cx + f32(f32(camx - Tunit_.ai_cx) * sc)), f32(cz + f32(f32(camz - Tunit_.ai_cz) * sc)));
				Color(0, 0, 0);
				Rect(cx + x - 2, cz + z - 2, 4, 4, 1);
				Color(255, 255, 0);
				Rect(cx + x - 1, cz + z - 1, 2, 2, 1);
			}
		}
	}
	//Center
	Color(255, 0, 0);
	Rect(cx - 1, cz - 1, 2, 2, 1);
}

//### Debug Log
/** Function dlog(txt$) */
export function dlog(txt: string): void {
	let stream: Stream = 0;
	if (FileType(G.set_rootdir + 'debug.txt') !== 1) {
		stream = WriteFile(G.set_rootdir + 'debug.txt');
	} else {
		// quirk: OpenFile starts at position 0 and nothing seeks to the end: every call overwrites the start of the file
		stream = OpenFile(G.set_rootdir + 'debug.txt');
	}
	if (stream !== 0) {
		WriteLine(stream, txt);
		CloseFile(stream);
	}
}

//### Debug Command
/** Function dbugcmd(p1$,p2$="") */
export function dbugcmd(p1: string, p2: string = ''): void {
	let p1c = 0;
	let Tobject_: Tobject | null = null;
	let Tunit_: Tunit | null = null;
	let Titem_: Titem | null = null;
	let Tinfo_: Tinfo | null = null;
	con_add();
	con_add('*** Debug: ' + p1 + ' ' + p2 + ' ***', Cbmpf_red);
	p1c = parse_getclass(p1);
	if (p1c === -1) {
		p1 = Str(G.p_env_class);
		p2 = Str(G.p_env_id);
	}
	// Select p1$ with Int cases (Cclass_...): the Int is compared as a string
	if (p1 === 'map') {
		G.in_conin = 'debugmap';
		con_enter();
	} else if (p1 === 'vars') {
		G.in_conin = 'vars';
		con_enter();
	} else if (p1 === 'scripts') {
		G.in_conin = 'scripts';
		con_enter();
	} else if (p1 === 'object' || p1 === Str(Cclass_object)) {
		con_add('object #' + Str(Int(p2)));
		for (Tobject_ = First(Tobject); Tobject_ !== null; Tobject_ = After(Tobject, Tobject_)) {
			if (Tobject_.id === Int(p2)) {
				con_add('type: ' + Str(Tobject_.typ) + ' (' + Dobject_name(Tobject_.typ) + ')');
				con_add('health: ' + Str(Tobject_.health, 'float') + '/' + Str(Tobject_.health_max, 'float'));
				con_add('position: ' + Str(Int(EntityX(Tobject_.h))) + ',' + Str(Int(EntityY(Tobject_.h))) + ',' + Str(Int(EntityZ(Tobject_.h))));
				con_add('rotation: ' + Str(Int(EntityPitch(Tobject_.h))) + ',' + Str(Int(EntityYaw(Tobject_.h))) + ',' + Str(Int(EntityRoll(Tobject_.h))));
				// quirk: p1c is still -1 when the class came from the script environment ("self"): no child matches then
				dbugcmdchilds(p1c, Int(p2));
				return;
			}
		}
		con_add('does not exist');
	} else if (p1 === 'unit' || p1 === Str(Cclass_unit)) {
		con_add('unit #' + Str(Int(p2)));
		for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
			if (Tunit_.id === Int(p2)) {
				con_add('type: ' + Str(Tunit_.typ) + ' (' + Dunit_name(Tunit_.typ) + ')');
				con_add('health: ' + Str(Tunit_.health, 'float') + '/' + Str(Tunit_.health_max, 'float'));
				con_add('position: ' + Str(Int(EntityX(Tunit_.h))) + ',' + Str(Int(EntityY(Tunit_.h))) + ',' + Str(Int(EntityZ(Tunit_.h))));
				con_add('rotation: ' + Str(Int(EntityPitch(Tunit_.h))) + ',' + Str(Int(EntityYaw(Tunit_.h))) + ',' + Str(Int(EntityRoll(Tunit_.h))));
				dbugcmdchilds(p1c, Int(p2));
				return;
			}
		}
		con_add('does not exist');
	} else if (p1 === 'item' || p1 === Str(Cclass_item)) {
		// quirk: says "unit #" for an item
		con_add('unit #' + Str(Int(p2)));
		for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
			if (Titem_.id === Int(p2)) {
				con_add('type: ' + Str(Titem_.typ) + ' (' + Ditem_name(Titem_.typ) + ')');
				con_add('count: ' + Str(Titem_.count));
				con_add('parent: ' + Str(Titem_.parent_class) + ',' + Str(Titem_.parent_id) + ' (Mode ' + Str(Titem_.parent_mode) + ')');
				con_add('health: ' + Str(Titem_.health, 'float') + '/' + Str(Ditem_health(Titem_.typ), 'float'));
				con_add('position: ' + Str(Int(EntityX(Titem_.h))) + ',' + Str(Int(EntityY(Titem_.h))) + ',' + Str(Int(EntityZ(Titem_.h))));
				con_add('rotation: ' + Str(Int(EntityPitch(Titem_.h))) + ',' + Str(Int(EntityYaw(Titem_.h))) + ',' + Str(Int(EntityRoll(Titem_.h))));
				dbugcmdchilds(p1c, Int(p2));
				return;
			}
		}
		con_add('does not exist');
	} else if (p1 === 'info' || p1 === Str(Cclass_info)) {
		con_add('info #' + Str(Int(p2)));
		for (Tinfo_ = First(Tinfo); Tinfo_ !== null; Tinfo_ = After(Tinfo, Tinfo_)) {
			if (Tinfo_.id === Int(p2)) {
				con_add('type: ' + Str(Tinfo_.typ) + ' (' + Dinfo_name(Tinfo_.typ) + ')');
				con_add('position: ' + Str(Int(EntityX(Tinfo_.h))) + ',' + Str(Int(EntityY(Tinfo_.h))) + ',' + Str(Int(EntityZ(Tinfo_.h))));
				con_add('rotation: ' + Str(Int(EntityPitch(Tinfo_.h))) + ',' + Str(Int(EntityYaw(Tinfo_.h))) + ',' + Str(Int(EntityRoll(Tinfo_.h))));
				dbugcmdchilds(p1c, Int(p2));
				return;
			}
		}
		con_add('does not exist');
	}
}

//### Debug Childs
/** Function dbugcmdchilds(class,id) */
export function dbugcmdchilds(class_: number, id: number): void {
	let Tx_: Tx | null = null;
	let Tstate_: Tstate | null = null;
	let Troot: Tup | null = null;
	let Tup_: Tup | null = null;
	let Titem_: Titem | null = null;
	let txt = '';
	let x = 0;
	//Vars
	con_add('* locals: ', Cbmpf_red);
	for (Tx_ = First(Tx); Tx_ !== null; Tx_ = After(Tx, Tx_)) {
		if (Tx_.mode === 4) {
			if (Tx_.parent_class === class_) {
				if (Tx_.parent_id === id) {
					if (Tx_.stuff === '') {
						con_add('$' + Tx_.key + ' = ' + Tx_.value);
					} else {
						con_add('$' + Tx_.key + ' = ' + Tx_.value + ' (' + Tx_.stuff + ')');
					}
				}
			}
		}
	}
	//States
	con_add('* states: ', Cbmpf_red);
	for (Tstate_ = First(Tstate); Tstate_ !== null; Tstate_ = After(Tstate, Tstate_)) {
		if (Tstate_.parent_class === class_) {
			if (Tstate_.parent_id === id) {
				con_add(Str(Tstate_.typ) + ' (' + Dstate_name(Tstate_.typ) + ')');
			}
		}
	}
	//Units Paths
	if (class_ === Cclass_unit) {
		con_add('* unitpath: ', Cbmpf_red);
		for (Troot = First(Tup); Troot !== null; Troot = After(Tup, Troot)) {
			if (Troot.mode === 0) {
				if (Troot.unit === id) {
					con_add('rootnode - current node: ' + Str(Troot.info));
					for (Tup_ = First(Tup); Tup_ !== null; Tup_ = After(Tup, Tup_)) {
						if (Tup_.unit === Troot.unit) {
							if (Tup_.mode > 0) {
								con_add('node ' + Str(Tup_.mode) + ' @ info ' + Str(Tup_.info));
							}
						}
					}
				}
			}
		}
	}
	//Items
	if (class_ !== Cclass_item) {
		con_add('* items: ', Cbmpf_red);
		for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
			if (Titem_.parent_class === class_) {
				if (Titem_.parent_id === id) {
					con_add(Str(Titem_.typ) + ' (' + Ditem_name(Titem_.typ) + ') x' + Str(Titem_.count) + '');
				}
			}
		}
	}
	//Scripts
	con_add('* script: ', Cbmpf_red);
	for (Tx_ = First(Tx); Tx_ !== null; Tx_ = After(Tx, Tx_)) {
		if (Tx_.mode === 0) {
			if (Tx_.parent_class === class_) {
				if (Tx_.parent_id === id) {
					txt = Tx_.value;
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
			}
		}
	}
}
