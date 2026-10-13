/**
 * includes/randommap.bb, ported line by line.
 */
import { RotateEntity } from '../bb3d';
import { Float, Instr, Int, Left, Mid, MilliSecs, Rand, RuntimeError, SEP_LINE, Str, Trim, f32, idivConst } from '../blitz';
import { FlushKeys, FlushMouse } from '../input';
import { envLoad, envLoadSky, grassMapHeadless, splitLimit } from './_additions/map';
import { ai_ini } from './ai_units';
import { con_add } from './console';
import { Cbmpf_red, Cclass_info, Cclass_item, Cclass_object, Cclass_unit, Csection_editor, Csection_game_sp, Cworld_size } from './consts';
import { e_clear } from './e_clear';
import { e_environment, e_tery } from './e_environment';
import { editor_defaultmapsettings, editor_gencolormap, editor_genmap } from './editor_functions';
import { CloseDir, CloseFile, Eof, NextFile, ReadDir, ReadFile, ReadLine, type DirHandle, type Stream } from './files';
import { split } from './functions.ported';
import { game_playerspawn, game_setcam, game_setplayer } from './game_functions';
import { grass_heightmap, grass_map } from './grasspread';
import { set_info } from './handle_infos';
import { set_item } from './handle_items';
import { set_object } from './handle_objects';
import { set_unit } from './handle_units';
import { bmpf_loadscreen } from './load_bmpf';
import { parse_globalevent, parse_sel_event } from './parser_functions';
import { preparse } from './parser_pre';
import { defvar_oncreate } from './parser_vars';
import { G, dim } from './state';
import { After, Delete, First, HandleOf, New, ObjectOf, Tinfo, Titem, Tobject, Tran, Tunit, isNull } from './types';

//Random Map Stuff

//### Load Randommap Stuff

/** Function load_randommap(loadid=0) */
export function load_randommap(loadid: number = 0): void {
	let Tran_: Tran | null = null;
	let stream: Stream = 0;
	let in_ = '';
	let var_ = '';
	let val = '';
	let i = 0;
	let equal = 0;
	let r1 = 0;
	let r2 = 0;
	let a = 0;
	let cp = '';
	let profilec = 0;
	let readok = 0;
	let id = 0;
	let dir: DirHandle = 0;
	let file = '';
	let c = 0;
	//Delete
	for (Tran_ = First(Tran); Tran_ !== null; Tran_ = After(Tran, Tran_)) {
		Delete(Tran, Tran_);
	}
	//Load
	r1 = -1000000;
	r2 = 1000000;
	a = 100;
	cp = '';
	profilec = 0;
	readok = 0;
	id = 0;
	void cp;
	void profilec;
	dir = ReadDir('sys');
	G.random_script = '';
	if (dir === 0) RuntimeError('Unable to read sys dir');
	for (;;) {
		file = NextFile(dir);
		if (Left(file, 6) === 'random') {
			stream = ReadFile('sys\\' + file);
			if (stream === 0) RuntimeError('Unable to read sys\\' + file);

			while (Eof(stream) === 0) {
				in_ = ReadLine(stream);
				equal = Instr(in_, '=');
				if (Left(in_, 1) === '#') equal = 0;
				if (equal > 0) {
					var_ = Trim(Left(in_, equal - 1));
					val = Trim(Mid(in_, equal + 1, -1));
					switch (var_) {
						case 'id':
							id = Int(val);
							if (id < 1 || id > G.Crandom_c) RuntimeError('ID between 1 and ' + Str(G.Crandom_c) + ' expected!');
							if (id === loadid) {
								readok = 1;
							} else {
								readok = 0;
							}
							// quirk: random_c is never reset: it grows with every call of load_randommap
							G.random_c = G.random_c + 1;
							G.Drprofile[id] = 'Unnamed Profile (#' + Str(id) + ')';
							break;

						case 'name':
							G.Drprofile[id] = val;
							break;

						case 'amount':
						case 'ratio':
							if (readok === 1) {
								a = Int(val);
								if (a < 1) RuntimeError("Invalid AMOUNT Value '" + val + "' - has to be at least 1 (sys\\" + file + ')');
								if (a > 100) RuntimeError("Invalid AMOUNT Value '" + val + "' - has to be maximally 100 (sys\\" + file + ')');
							}
							break;

						case 'range':
							if (readok === 1) {
								if (Instr(val, ',')) {
									split(val, ',', 2);
									r1 = Float(G.splits[0]);
									r2 = Float(G.splits[1]);
									if (r1 > r2) RuntimeError("Invalid RANGE Value '" + val + "' - first value has to be smaller than the second one (sys\\" + file + ')');
								} else {
									switch (val) {
										case 'land':
											r1 = 0;
											r2 = 1000000;
											break;
										case 'land and water':
											r1 = -1000000;
											r2 = 1000000;
											break;
										case 'water':
											r1 = -10000000;
											r2 = 0;
											break;
										case 'shore':
											r1 = -3;
											r2 = 3;
											break;
										case 'hill':
											r1 = 100;
											r2 = 1000000;
											break;
										case 'shallow water':
											r1 = -3;
											r2 = f32(-0.1);
											break;
										default:
											RuntimeError("Invalid RANGE Value '" + val + "' (sys\\" + file + ')');
									}
								}
							}
							break;

						case 'object':
						case 'objects':
							if (readok === 1) {
								if (Instr(val, ',')) {
									// split$() returns its limit, here Len(val$): see _additions/map.ts
									c = Int(Str(splitLimit(split(val, ',', 0))));
								} else {
									c = 0;
									G.splits = dim('', 0);
									G.splits[0] = Str(Int(val));
								}
								for (i = 0; i <= c; i++) {
									if (Int(G.splits[i]) > 0) {
										Tran_ = New(Tran);
										Tran_.r1 = r1;
										Tran_.r2 = r2;
										Tran_.a = a;
										Tran_.class = Cclass_object;
										Tran_.id = Int(G.splits[i]);
									}
								}
							}
							break;

						case 'unit':
						case 'units':
							if (readok === 1) {
								if (Instr(val, ',')) {
									c = Int(Str(splitLimit(split(val, ',', 0))));
								} else {
									c = 0;
									G.splits = dim('', 0);
									G.splits[0] = Str(Int(val));
								}
								for (i = 0; i <= c; i++) {
									if (Int(G.splits[i]) > 0) {
										Tran_ = New(Tran);
										Tran_.r1 = r1;
										Tran_.r2 = r2;
										Tran_.a = a;
										Tran_.class = Cclass_unit;
										Tran_.id = Int(G.splits[i]);
									}
								}
							}
							break;

						case 'item':
						case 'items':
							if (readok === 1) {
								if (Instr(val, ',')) {
									c = Int(Str(splitLimit(split(val, ',', 0))));
								} else {
									c = 0;
									G.splits = dim('', 0);
									G.splits[0] = Str(Int(val));
								}
								for (i = 0; i <= c; i++) {
									if (Int(G.splits[i]) > 0) {
										Tran_ = New(Tran);
										Tran_.r1 = r1;
										Tran_.r2 = r2;
										Tran_.a = a;
										Tran_.class = Cclass_item;
										Tran_.id = Int(G.splits[i]);
									}
								}
							}
							break;

						case 'script':
							if (readok === 1) {
								if (val === 'start') {
									while (Eof(stream) === 0) {
										val = ReadLine(stream);
										if (val === 'script=end') {
											break;
										} else {
											G.random_script = G.random_script + Trim(val) + SEP_LINE;
										}
									}
								}
							} else {
								if (val === 'start') {
									while (Eof(stream) === 0) {
										val = ReadLine(stream);
										if (val === 'script=end') {
											break;
										}
									}
								}
							}
							break;

						default:
							RuntimeError("Invalid RANDOM Property '" + var_ + "' (sys\\" + file + ')');
					}
				}
			}
			CloseFile(stream);
		} else if (file === '') {
			break;
		}
	}
	CloseDir(dir);
}

/** Top-level code of randommap.bb */
export function include_randommap(): void {
	load_randommap();
}

//Fill Map
/** Function randommap(stuffcount,objects=1,units=1,items=0) */
export function randommap(stuffcount: number, objects: number = 1, units: number = 1, items: number = 0): number {
	//Count
	let t = 0;
	let Tran_: Tran | null = null;
	let i = 0;
	let j = 0;
	let x = 0;
	let y = 0;
	let z = 0;
	let yaw = 0;
	let size = 0;
	let rid = 0;
	let retry = 0;
	const typ: number = 0;
	t = 0;
	for (Tran_ = First(Tran); Tran_ !== null; Tran_ = After(Tran, Tran_)) {
		switch (Tran_.class) {
			//Objects
			case Cclass_object:
				if (objects === 1) t = t + Tran_.a;
				break;
			//Units
			case Cclass_unit:
				if (units === 1) t = t + Tran_.a;
				break;
			//Items
			case Cclass_item:
				if (items === 1) t = t + Tran_.a;
				break;
		}
	}

	if (t === 0) {
		con_add('ERROR: random.inf contains not enough information for random map filling (or does not exist)', Cbmpf_red);
		return 0;
	}

	//Create and Fill Pool
	G.Drpool = dim(0, t);

	i = 0;
	for (Tran_ = First(Tran); Tran_ !== null; Tran_ = After(Tran, Tran_)) {
		switch (Tran_.class) {
			//Objects
			case Cclass_object:
				if (objects === 1) {
					for (j = i; j <= i + Tran_.a - 1; j++) {
						G.Drpool[j] = HandleOf(Tran, Tran_);
					}
					i = i + Tran_.a;
				}
				break;
			//Units
			case Cclass_unit:
				if (units === 1) {
					for (j = i; j <= i + Tran_.a - 1; j++) {
						G.Drpool[j] = HandleOf(Tran, Tran_);
					}
					i = i + Tran_.a;
				}
				break;
			//Items
			case Cclass_item:
				if (items === 1) {
					for (j = i; j <= i + Tran_.a - 1; j++) {
						G.Drpool[j] = HandleOf(Tran, Tran_);
					}
					i = i + Tran_.a;
				}
				break;
		}
	}

	//Create Stuff
	size = idivConst(G.ter_size * Cworld_size, 2);
	for (i = 1; i <= stuffcount; i++) {
		//Select Thingy
		rid = Rand(0, t - 1);
		Tran_ = ObjectOf(Tran, G.Drpool[rid]);
		//If Tran<>Null Then

		//Set it
		retry: for (retry = 0; retry <= 99; retry++) {
			//Position
			x = Rand(-size, size);
			z = Rand(-size, size);
			yaw = Rand(360);

			//Can be Set here?
			y = e_tery(x, z);
			if (y >= Tran_!.r1) {
				if (y <= Tran_!.r2) {
					//All Okay! Set!
					switch (Tran_!.class) {
						//Object
						case Cclass_object:
							set_object(-1, Tran_!.id, x, z, yaw);
							defvar_oncreate(Cclass_object, G.TCobject!.id, Tran_!.id);
							break;

						//Unit
						case Cclass_unit:
							set_unit(-1, Tran_!.id, x, z);
							defvar_oncreate(Cclass_unit, G.TCunit!.id, Tran_!.id);
							RotateEntity(G.TCunit!.h, 0, yaw, 0);
							if (G.m_section !== Csection_editor) ai_ini();
							break;

						//Item
						case Cclass_item:
							set_item(-1, Tran_!.id, x, y, z);
							defvar_oncreate(Cclass_item, G.TCitem!.id, Tran_!.id);
							RotateEntity(G.TCitem!.h, 0, yaw, 0);
							break;

						//Info
						case Cclass_info:
							// quirk: typ is an undeclared local (0); load_randommap never creates entries of this class
							set_info(-1, typ, x, y, z);
							defvar_oncreate(Cclass_info, G.TCinfo!.id, Tran_!.id);
							break;
					}

					break retry;
				}
			}
		}

		//EndIf
	}
	// no Return value at the end of the original: 0
	return 0;
}

//Create Randommap
/** Function randommapcreate() */
export async function randommapcreate(): Promise<void> {
	let count = 0;
	let m = 0;
	await bmpf_loadscreen('Setup');
	//Clear
	e_clear();

	//Section
	G.m_section = Csection_game_sp;

	//Generate Island
	//in_opt(3) for mapsize!
	editor_defaultmapsettings();
	await envLoad(); // bridge: the environment's media, before its terrain is built
	await editor_genmap();
	await editor_gencolormap();
	grass_map();
	grassMapHeadless(); // substitute: grass_map() of grasspread.ts has no grass_rgb without RT.env
	grass_heightmap();
	await envLoadSky(); // bridge: the sky textures of map_skybox$ (the layer loads them asynchronously)
	e_environment();

	//Map Script
	G.map_briefing = G.random_script;
	preparse();

	//Scripts preload
	parse_globalevent('preload');
	parse_sel_event('preload');

	//Fill
	await bmpf_loadscreen('Filling Island');
	G.tmp_loading = 1;
	count = idivConst(G.ter_size * G.ter_size, 4);
	randommap(count, 1, 1, 1);
	G.tmp_loading = 0;

	//Player
	G.g_player = 1;
	game_playerspawn(1);
	game_setplayer(1);

	//Scripts start/load
	parse_globalevent('start');
	parse_globalevent('load');
	parse_sel_event('start');
	parse_sel_event('load');

	//Flush
	FlushKeys();
	FlushMouse();
	//Blackframe
	G.blackframe = 10;

	//Unit Physics Stuff
	G.lastms = MilliSecs();
	G.ms = G.lastms;
	G.gt = 0;

	//Setcam
	m = G.m_menu;
	G.m_menu = 0;
	game_setcam();
	G.m_menu = m;
}

//Create Random Objects (Scriptcommand)
/** Function randomcreate(class,typ,miny#,maxy#,count=0) */
export function randomcreate(class_: number, typ: number, miny: number, maxy: number, count: number = 0): number {
	let size = 0;
	let x = 0;
	let y = 0;
	let z = 0;
	let yaw = 0;
	let id = 0;
	let retry = 0;
	size = idivConst(G.ter_size * Cworld_size, 2);
	id = 0;
	for (retry = 0; retry <= 9999; retry++) {
		//Position
		x = Rand(-size, size);
		z = Rand(-size, size);
		yaw = Rand(360);

		//Can be Set here?
		y = e_tery(x, z);
		if (y >= miny) {
			if (y <= maxy) {
				//Set
				switch (class_) {
					//Object
					case Cclass_object:
						G.TCobject = null;
						set_object(-1, typ, x, z, yaw);
						if (!isNull(Tobject, G.TCobject)) {
							id = G.TCobject!.id;
						}
						break;

					//Unit
					case Cclass_unit:
						G.TCunit = null;
						set_unit(-1, typ, x, z);
						if (!isNull(Tunit, G.TCunit)) {
							id = G.TCunit!.id;
							RotateEntity(G.TCunit!.h, 0, yaw, 0);
							if (G.m_section !== Csection_editor) ai_ini();
						}
						break;

					//Item
					case Cclass_item:
						G.TCitem = null;
						set_item(-1, typ, x, y, z, count);
						if (!isNull(Titem, G.TCitem)) {
							id = G.TCitem!.id;
							RotateEntity(G.TCitem!.h, 0, yaw, 0);
						}
						break;

					//Info
					case Cclass_info:
						G.TCinfo = null;
						set_info(-1, typ, x, y, z);
						if (!isNull(Tinfo, G.TCinfo)) {
							id = G.TCinfo!.id;
						}
						break;
				}

				return id;
			}
		}
	}
	return 0;
}
