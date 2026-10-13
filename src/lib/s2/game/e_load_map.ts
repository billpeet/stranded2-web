/**
 * includes/e_load_map.bb, ported line by line on the file commands of files.ts.
 *
 * load_map reads the stream itself, statement by statement, with every side
 * effect in the original order (formats/map.ts parseMap is not used: it is the
 * same format without the effects). The environment layer is kept in step by
 * the bridge of _additions/map.ts; the four bridge calls are marked "bridge".
 */
import {
	Animate,
	CreateTexture,
	EntityX,
	EntityYaw,
	EntityZ,
	HideEntity,
	ModifyTerrain,
	PositionEntity,
	RotateEntity,
	ShowEntity,
	TerrainY,
	TextureBuffer
} from '../bb3d';
import { Float, Int, Left, Len, Mid, MilliSecs, Right, RuntimeError, SEP_FIELD, Str, f32, idivConst } from '../blitz';
import { BackBuffer, CreateImage, FreeImage, ImageBuffer, LockBuffer, MaskImage, SetBuffer, UnlockBuffer, WritePixelFast } from '../gfx2d';
import { FlushKeys, FlushMouse } from '../input';
import { envLoad, envLoadSky, envSyncGroundY, grassMapHeadless, grass_rgb_set } from './_additions/map';
import { ai_ini } from './ai_units';
import { con_add } from './console';
import { Cbmpf_red, Cclass_item, Cclass_object, Cclass_unit, Cpm_out, Csection_editor, Csection_game_sp, Cworld_size } from './consts';
import { Dstate_name } from './defs_arrays';
import { e_clear } from './e_clear';
import { e_environment, e_terrain } from './e_environment';
import {
	CloseDir,
	CloseFile,
	Eof,
	FileSize,
	FileType,
	NextFile,
	ReadByte,
	ReadDir,
	ReadFile,
	ReadFloat,
	ReadInt,
	ReadLine,
	ReadShort,
	ReadString,
	WriteByte,
	WriteFile,
	WriteLine,
	type DirHandle,
	type Stream
} from './files';
import { code, getfilename, split, strinv } from './functions.ported';
import { game_playerspawn, game_setcam, game_setplayer } from './game_functions';
import { game_input_vehicledata } from './game_input_vehicles';
import { grass_map, grass_spread } from './grasspread';
import { gui_msg, gui_win_image } from './gui';
import { info_setuploudspeaker, info_setupsprite, info_stv, serialpeak_info, set_info } from './handle_infos';
import { con_item, serialpeak_item, set_item, store_item } from './handle_items';
import { con_object, grow_object, serialpeak_object, set_object } from './handle_objects';
import { get_state, look_state, set_state } from './handle_states';
import { con_unit, serialpeak_unit, set_unit } from './handle_units';
import { bmpf_loadscreen } from './load_bmpf';
import { s } from './load_strings';
import { parse_globalevent, parse_sel_event } from './parser_functions';
import { preparse, preparse_string } from './parser_pre';
import { defvar_ini } from './parser_vars';
import { RT } from './rt';
import { G } from './state';
import { After, Delete, First, New, T3d, Tat, Tfrap, Trecent, Tsg, Ttimer, Tunit, Tup, Tx, Txc } from './types';

//############################################ Engine Load Map

//### LOAD MAP
/** Function load_map(path$,pw$) */
export async function load_map(path: string, pw: string): Promise<number> {
	let stream: Stream = 0;
	let in_ = '';
	let f = '';
	let tfobject = 0;
	let tfunit = 0;
	let tfitem = 0;
	let tfstring = '';
	let x = 0;
	let y = 0;
	let r = 0;
	let g = 0;
	let b = 0;
	let rgb = 0;
	let pwkey = 0;
	let readpw = '';
	let i = 0;
	let h = 0;
	let c = 0;
	let id = 0;
	let typ = 0;
	let xp = 0;
	let zp = 0;
	let yaw = 0;
	let yp = 0;
	let pitch = 0;
	let parent_class = 0;
	let parent_id = 0;
	let Tx_: Tx | null = null;
	let Txc_: Txc | null = null;
	let cx: Tx | null = null;
	let campitch = 0;
	let camyaw = 0;
	let Tat_: Tat | null = null;
	let atfile = '';
	let atsize = 0;
	let atstream: Stream = 0;
	let byte = 0;
	let citem = 0;
	let m = 0;

	G.map_id = '0';
	if (FileType(path) === 1) G.map_id = Str(FileSize(path));
	stream = ReadFile(path);
	if (stream === 0) {
		con_add('Unable to load Map ' + path, Cbmpf_red);
		return 0;
	}
	e_clear();
	G.tmp_loading = 1;

	//### Headers

	//Main Header
	await bmpf_loadscreen(s(21), 10);
	in_ = ReadLine(stream);
	if (Left(in_, 15) !== '### Stranded II') RuntimeError('Invalid Map! (Invalid Header)');
	ReadLine(stream); //Version
	G.map_id = G.map_id + ReadLine(stream); //Date
	G.map_id = G.map_id + ReadLine(stream); //Time
	f = ReadLine(stream); //Format
	void f;
	G.map_mode = ReadLine(stream); //Mode

	//Type Format
	tfobject = 0;
	tfunit = 0;
	tfitem = 0;
	tfstring = ReadLine(stream);
	if (tfstring !== '') {
		tfobject = Int(Mid(tfstring, 1, 1));
		tfunit = Int(Mid(tfstring, 2, 1));
		tfitem = Int(Mid(tfstring, 3, 1));
	}

	ReadLine(stream);
	ReadLine(stream);
	ReadLine(stream);
	ReadLine(stream);
	ReadLine(stream); //###

	//Image
	if (G.map_image !== 0) FreeImage(G.map_image);
	G.map_image = CreateImage(96, 72);
	SetBuffer(ImageBuffer(G.map_image));
	LockBuffer(ImageBuffer(G.map_image));
	for (x = 0; x <= 96 - 1; x++) {
		for (y = 0; y <= 72 - 1; y++) {
			r = ReadByte(stream); //R
			g = ReadByte(stream); //G
			b = ReadByte(stream); //B
			rgb = (255 * 0x1000000 + r * 0x10000 + g * 0x100 + b) | 0;
			WritePixelFast(x, y, rgb);
		}
	}
	UnlockBuffer(ImageBuffer(G.map_image));
	SetBuffer(BackBuffer());
	//Debug Show Map Image
	if (G.set_debug_load === 1) {
		await gui_win_image('', G.map_image);
	}

	//Password Header
	pwkey = ReadByte(stream); //Code Key
	readpw = ReadLine(stream); //Password
	//Check Password (Editor only)
	if (G.m_section === Csection_editor) {
		if (code(pw, pwkey, 0) !== readpw) {
			//RuntimeError "|"+code(readpw$,pwkey,1)+"|"
			con_add('ERROR: Invalid Map Password!', Cbmpf_red);
			G.tmp_loading = 0;
			// quirk: the stream stays open, and the previous map is already cleared
			return 0;
		}
		G.map_password = pw;
	}

	//Debug
	if (G.set_debug_load === 1) {
		await gui_msg('Map PW Key: ' + Str(pwkey) + ', PW: ' + code(readpw, pwkey, 1) + ' (len: ' + Str(Len(readpw)) + ')');
	}

	//Map Vars
	G.map_name = getfilename(path); //Map Name
	G.map_path = path; //Map Path
	G.map_day = ReadInt(stream); //Map Time Day
	G.map_hour = ReadByte(stream); //Map Time Hour
	G.map_minute = ReadByte(stream); //Map Time Minute
	G.map_freezetime = ReadByte(stream); //Map Time frozen?
	G.map_skybox = ReadString(stream); //Map Skybox
	G.map_multiplayer = ReadByte(stream); //Map Multiplayer
	G.map_climate = ReadByte(stream); //Map Climate
	G.map_music = ReadString(stream); //Map Music
	G.map_briefing = ReadString(stream); //Map Briefing (Global Map Script)
	G.map_fog[0] = ReadByte(stream); //Map Fog R
	G.map_fog[1] = ReadByte(stream); //Map Fog G
	G.map_fog[2] = ReadByte(stream); //Map Fog B
	G.map_fog[3] = ReadByte(stream); //Map Fog Mode
	G.map_lday = G.map_day; //Map Time Update last Day
	G.map_lhour = G.map_hour; //Map Time Update last Hour
	G.map_lminute = G.map_minute; //Map Time Update last Minute
	G.map_timeupdate = 1;
	ReadByte(stream); //Extended Stuff

	//Interface
	for (i = 0; i <= 9; i++) {
		// in_quickslot(9) is an Int array: the string is converted
		G.in_quickslot[i] = Int(ReadString(stream)); //Quickslot
	}

	//Debug
	if (G.set_debug_load === 1) {
		await gui_msg('Map Skybox: ' + G.map_skybox);
		await gui_msg('Map Briefing: ' + G.map_briefing);
		await gui_msg('Map Vars Loaded (day ' + Str(G.map_day) + ', time ' + Str(G.map_hour) + ':' + Str(G.map_minute) + ')');
	}

	//Check
	if (G.map_hour < 0 || G.map_hour > 24) {
		con_add('ERROR: Error in Map Vars (Hour)!', Cbmpf_red);
		G.tmp_loading = 0;
		return 0;
	} else if (G.map_minute < 0 || G.map_minute > 60) {
		con_add('ERROR: Error in Map Vars (Minute)!', Cbmpf_red);
		G.tmp_loading = 0;
		return 0;
	}

	//### Maps

	//Colormap
	await bmpf_loadscreen(s(22), 20);
	h = ReadInt(stream); //Colortexture Size
	G.ter_tex_color = CreateTexture(h, h, 256);
	SetBuffer(TextureBuffer(G.ter_tex_color)!);
	LockBuffer(TextureBuffer(G.ter_tex_color)!);
	for (x = 0; x <= h - 1; x++) {
		for (y = 0; y <= h - 1; y++) {
			r = ReadByte(stream); //R
			g = ReadByte(stream); //G
			b = ReadByte(stream); //B
			rgb = (255 * 0x1000000 + r * 0x10000 + g * 0x100 + b) | 0;
			WritePixelFast(x, y, rgb);
		}
	}
	UnlockBuffer(TextureBuffer(G.ter_tex_color)!);
	SetBuffer(BackBuffer());

	//Debug
	if (G.set_debug_load === 1) await gui_msg('Colormap loaded (' + Str(h) + 'x' + Str(h) + ')');

	//Heightmap
	await bmpf_loadscreen(s(23), 30);
	G.ter_size = ReadInt(stream); //Terrain Size
	if (G.ter_size < 0) G.ter_size = 32;
	await envLoad(); // bridge: the environment's media, before its terrain is built
	e_terrain(G.ter_size, 'generated');
	for (x = 0; x <= G.ter_size; x++) {
		for (y = 0; y <= G.ter_size; y++) {
			ModifyTerrain(G.ter, x, y, ReadFloat(stream)); //Height
		}
	}

	//Debug
	if (G.set_debug_load === 1) await gui_msg('Heightmap loaded (' + Str(G.ter_size) + 'x' + Str(G.ter_size) + ')');

	//Grassmap
	await bmpf_loadscreen(s(24), 35);
	grass_map();
	grassMapHeadless(); // substitute: grass_map() of grasspread.ts has no grass_rgb without RT.env
	for (x = 0; x <= h; x++) {
		for (y = 0; y <= h; y++) {
			grass_rgb_set(x, y, 3, ReadByte(stream)); //Gras? 1/0
		}
	}
	grass_spread();

	//Debug
	if (G.set_debug_load === 1) await gui_msg('Grassmap loaded');

	//Ground Y
	G.ter_groundy = TerrainY(G.ter, -(idivConst(G.ter_size, 2) * Cworld_size), 0, -(idivConst(G.ter_size, 2) * Cworld_size));
	envSyncGroundY(); // bridge: e_tery of the layer reads its own copy of ter_groundy

	//on:preload
	G.map_briefing_key = preparse_string(G.map_briefing);
	parse_globalevent('preload');
	parse_sel_event('preload');

	//### Stuff

	//Object
	await bmpf_loadscreen(s(25), 40);
	c = ReadInt(stream); //Count
	for (i = 1; i <= c; i++) {
		id = ReadInt(stream); //ID
		if (tfobject) {
			//Typ
			typ = ReadShort(stream);
		} else {
			typ = ReadByte(stream);
		}
		xp = ReadFloat(stream); //X
		zp = ReadFloat(stream); //Z
		yaw = ReadFloat(stream); //Yaw
		if (set_object(id, typ, xp, zp, yaw) !== -1) {
			//SET
			G.TCobject!.health = ReadFloat(stream); //Health
			G.TCobject!.health_max = ReadFloat(stream); //Health Max
			G.TCobject!.daytimer = ReadInt(stream); //Daytimer
			HideEntity(G.TCobject!.h);
			if (G.TCobject!.daytimer < 0) {
				//Grow
				grow_object(G.TCobject);
			}
		} else {
			RuntimeError('Object of type ' + Str(typ) + ' is undefined! Are you sure that you are using the right mod/version for this map?');
		}
	}
	serialpeak_object();
	//Debug
	if (G.set_debug_load === 1) await gui_msg('Objects loaded (' + Str(c) + ')');

	//Unit
	await bmpf_loadscreen(s(26), 70);
	c = ReadInt(stream); //Count
	for (i = 1; i <= c; i++) {
		id = ReadInt(stream); //ID
		if (tfunit) {
			//Typ
			typ = ReadShort(stream);
		} else {
			typ = ReadByte(stream);
		}
		xp = ReadFloat(stream); //X
		yp = ReadFloat(stream); //Y
		zp = ReadFloat(stream); //Z
		if (set_unit(id, typ, xp, zp) !== -1) {
			//SET
			HideEntity(G.TCunit!.h); //POSITION
			PositionEntity(G.TCunit!.h, xp, yp, zp);
			ShowEntity(G.TCunit!.h);
			if (G.TCunit!.vh !== null) {
				HideEntity(G.TCunit!.vh);
				PositionEntity(G.TCunit!.vh, xp, yp, zp);
				ShowEntity(G.TCunit!.vh);
			}
			yaw = ReadFloat(stream); //Yaw
			RotateEntity(G.TCunit!.h, 0, yaw, 0); //ROTATE
			G.TCunit!.health = ReadFloat(stream); //Health
			G.TCunit!.health_max = ReadFloat(stream); //Health Max
			G.TCunit!.hunger = ReadFloat(stream); //Hunger
			G.TCunit!.thirst = ReadFloat(stream); //Thirst
			G.TCunit!.exhaustion = ReadFloat(stream); //Exhaustion
			G.TCunit!.ai_cx = ReadFloat(stream); //AI Center X
			G.TCunit!.ai_cz = ReadFloat(stream); //AI Center Z
			if (G.m_section !== Csection_editor) ai_ini(); //Initialize AI
		} else {
			RuntimeError('Unit of type ' + Str(typ) + ' is undefined! Are you sure that you are using the right mod/version for this map?');
		}
	}
	serialpeak_unit();
	//Debug
	if (G.set_debug_load === 1) await gui_msg('Units loaded (' + Str(c) + ')');

	//Item
	await bmpf_loadscreen(s(27), 80);
	c = ReadInt(stream); //Count
	for (i = 1; i <= c; i++) {
		id = ReadInt(stream); //ID
		if (tfitem) {
			//Typ
			typ = ReadShort(stream);
		} else {
			typ = ReadByte(stream);
		}
		xp = ReadFloat(stream); //X
		yp = ReadFloat(stream); //Y
		zp = ReadFloat(stream); //Z
		if (set_item(id, typ, xp, yp, zp) !== -1) {
			//SET
			yaw = ReadFloat(stream); //Yaw
			RotateEntity(G.TCitem!.h, 0, yaw, 0); //ROTATE
			G.TCitem!.health = ReadFloat(stream); //Health
			G.TCitem!.count = ReadInt(stream); //Count
			G.TCitem!.parent_class = ReadByte(stream); //Parent Class
			G.TCitem!.parent_mode = ReadByte(stream); //Parent Mode
			G.TCitem!.parent_id = ReadInt(stream); //Parent ID
			if (G.TCitem!.parent_mode === Cpm_out) {
				if (G.TCitem!.parent_class !== 0) {
					RotateEntity(G.TCitem!.h, -90, yaw, 0);
				}
			}
		} else {
			RuntimeError('Item of type ' + Str(typ) + ' is undefined! Are you sure that you are using the right mod/version for this map?');
		}
	}
	serialpeak_item();
	//Debug
	if (G.set_debug_load === 1) await gui_msg('Items loaded (' + Str(c) + ')');

	//Info
	await bmpf_loadscreen(s(28), 90);
	c = ReadInt(stream);
	for (i = 1; i <= c; i++) {
		id = ReadInt(stream); //ID
		typ = ReadByte(stream); //Typ
		xp = ReadFloat(stream); //X
		yp = ReadFloat(stream); //Y
		zp = ReadFloat(stream); //Z
		set_info(id, typ, xp, yp, zp); //SET
		pitch = ReadFloat(stream); //Pitch
		yaw = ReadFloat(stream); //Yaw
		RotateEntity(G.TCinfo!.h, pitch, yaw, 0); //ROTATE
		G.TCinfo!.vars = ReadString(stream); //Vars
		info_stv(); //String to Vars
		switch (typ) {
			case 5:
				info_setupsprite(G.TCinfo);
				break;
			case 47:
				info_setuploudspeaker(G.TCinfo);
				break;
		}
	}
	serialpeak_info();
	//Debug
	if (G.set_debug_load === 1) await gui_msg('Infos loaded (' + Str(c) + ')');

	//State
	await bmpf_loadscreen(s(29), 92);
	c = ReadInt(stream); //Count
	for (i = 1; i <= c; i++) {
		typ = ReadByte(stream); //Typ
		parent_class = ReadByte(stream); //Parent Class
		parent_id = ReadInt(stream); //Parent ID
		if (set_state(typ, parent_class, parent_id)) {
			//SET
			G.TCstate!.x = ReadFloat(stream); //X
			G.TCstate!.y = ReadFloat(stream); //Y
			G.TCstate!.z = ReadFloat(stream); //Z
			G.TCstate!.fx = ReadFloat(stream); //FX
			G.TCstate!.fy = ReadFloat(stream); //FY
			G.TCstate!.fz = ReadFloat(stream); //FZ
			G.TCstate!.value = ReadInt(stream); //Value
			G.TCstate!.value_f = ReadFloat(stream); //Value Float
			G.TCstate!.value_s = ReadString(stream); //Value String
			look_state();
		} else {
			ReadFloat(stream);
			ReadFloat(stream);
			ReadFloat(stream);
			ReadFloat(stream);
			ReadFloat(stream);
			ReadFloat(stream);
			ReadInt(stream);
			ReadFloat(stream);
			ReadString(stream);
			con_add('Unable to create state ' + Str(typ) + ' (' + Dstate_name(typ) + ') @ ' + Str(parent_class) + ',' + Str(parent_id));
		}
	}
	//Debug
	if (G.set_debug_load === 1) await gui_msg('States loaded (' + Str(c) + ')');

	//Extensions and Vars etc.
	await bmpf_loadscreen(s(30), 95);
	c = ReadInt(stream); //Count
	for (i = 1; i <= c; i++) {
		Tx_ = New(Tx);
		Tx_.typ = ReadByte(stream); //Typ
		Tx_.parent_class = ReadByte(stream); //Parent Class
		Tx_.parent_id = ReadInt(stream); //Parent ID
		Tx_.mode = ReadInt(stream); //Mode
		Tx_.key = ReadString(stream); //Key
		Tx_.value = ReadString(stream); //Value
		Tx_.stuff = ReadString(stream); //Stuff
	}
	load_map_extensions();
	//Debug
	if (G.set_debug_load === 1) await gui_msg('Extensions loaded (' + Str(c) + ')');

	//Set Definition Vars with default Values on Start (not in editor!)
	if (G.m_section !== Csection_editor) {
		if (G.map_mode === 'map') {
			defvar_ini();
		}
	}

	//Load Cached Extensions (loadmap command)
	G.pv_loadmaploaded = 0;
	for (Txc_ = First(Txc); Txc_ !== null; Txc_ = After(Txc, Txc_)) {
		G.pv_loadmaploaded = 1;
		if (Txc_.mode < 7) {
			//Cleanup
			switch (Txc_.mode) {
				//1 - Global Var
				case 1:
					for (cx = First(Tx); cx !== null; cx = After(Tx, cx)) {
						if (cx.mode === Txc_.mode) {
							if (cx.key === Txc_.key) Delete(Tx, cx);
						}
					}
					break;
				//3 - Buildlocks
				case 3:
					for (cx = First(Tx); cx !== null; cx = After(Tx, cx)) {
						if (cx.mode === Txc_.mode) {
							if (cx.key === Txc_.key) Delete(Tx, cx);
						}
					}
					break;
				//5 - Skills
				case 5:
					for (cx = First(Tx); cx !== null; cx = After(Tx, cx)) {
						if (cx.mode === Txc_.mode) {
							if (cx.key === Txc_.key) Delete(Tx, cx);
						}
					}
					break;
			}
			//Create
			Tx_ = New(Tx);
			Tx_.typ = Txc_.typ;
			Tx_.parent_class = Txc_.parent_class;
			Tx_.parent_id = Txc_.parent_id;
			Tx_.mode = Txc_.mode;
			Tx_.key = Txc_.key;
			Tx_.value = Txc_.value;
			Tx_.stuff = Txc_.stuff;
			Delete(Txc, Txc_);
		}
	}

	//Load Cam Angels (sav)
	if (G.map_mode === 'sav') {
		campitch = ReadFloat(stream);
		camyaw = ReadFloat(stream);
		RotateEntity(G.cam, campitch, camyaw, 0);
	}

	//Pre Parse Scripts
	preparse();

	//### End
	ReadLine(stream);
	ReadLine(stream);
	in_ = ReadLine(stream);
	if (in_ !== 'www.unrealsoftware.de') {
		//Error
		con_add('ERROR: Unable to load map completely!', 3);
		con_add('ERROR: It may be damaged!', 3);
		con_add('ERROR: Possible attachments are lost!', 3);
	} else {
		//Attachments
		if (G.map_mode === 'map') {
			for (Tat_ = First(Tat); Tat_ !== null; Tat_ = After(Tat, Tat_)) {
				Delete(Tat, Tat_);
			}
			while (Eof(stream) === 0) {
				atfile = strinv(ReadLine(stream));
				atsize = ReadInt(stream);
				Tat_ = New(Tat);
				Tat_.path = atfile;
				if (FileType(G.set_rootdir + 'mods\\' + G.set_moddir + '\\' + atfile) === 1) {
					for (i = 1; i <= atsize; i++) {
						ReadByte(stream);
					}
				} else {
					atstream = WriteFile(G.set_rootdir + 'mods\\' + G.set_moddir + '\\' + atfile);
					// quirk: when the file cannot be created its bytes are not skipped, and the loop reads on in the middle of them
					if (atstream !== 0) {
						for (i = 1; i <= atsize; i++) {
							byte = ReadByte(stream);
							byte = 255 - byte;
							WriteByte(atstream, byte);
						}
						CloseFile(atstream);
						atstream = 0;
					}
				}
			}
		}
	}

	//Music
	if (G.map_music !== '') {
		G.amb_file = RT.audio.bb.LoadSound('sfx\\' + G.map_music);
		//If amb_file<>0 Then LoopSound amb_file
	}

	//Environment
	await bmpf_loadscreen(s(31), 97);
	await envLoadSky(); // bridge: the sky textures of map_skybox$ (the layer loads them asynchronously)
	e_environment();

	//Spawn Player @ Singleplayer Map
	await bmpf_loadscreen(s(32), 100);
	con_add('');
	if (G.m_section === Csection_game_sp) {
		if (G.map_mode === 'map') {
			G.g_player = 1;
			game_playerspawn(1);
			game_setplayer(1);
		} else {
			game_setplayer(1);
		}
	}

	//Load Cached Items and Stuff (loadmap command)
	for (Txc_ = First(Txc); Txc_ !== null; Txc_ = After(Txc, Txc_)) {
		//7 Player Item
		if (Txc_.mode === 7) {
			citem = set_item(-1, Txc_.typ, 0, 0, 0, Int(Txc_.value));
			if (citem > -1) {
				store_item(citem, Cclass_unit, G.g_player);
			}
			//8 Player Quickslot/Weapon/Ammo
		} else if (Txc_.mode === 8) {
			if (Txc_.typ < 10) {
				G.in_quickslot[Txc_.typ] = Int(Txc_.value);
			} else if (Txc_.typ === 10) {
				G.g_cplayer!.player_weapon = Int(Txc_.value);
			} else if (Txc_.typ === 11) {
				G.g_cplayer!.player_ammo = Int(Txc_.value);
			}
			//9 Player State
		} else if (Txc_.mode === 9) {
			set_state(Txc_.typ, Txc_.parent_class, Txc_.parent_id);
			if (get_state(Txc_.typ, Txc_.parent_class, Txc_.parent_id)) {
				split(Txc_.stuff, SEP_FIELD, 15);
				G.TCstate!.x = Float(G.splits[0]);
				G.TCstate!.y = Float(G.splits[1]);
				G.TCstate!.z = Float(G.splits[2]);
				G.TCstate!.fx = Float(G.splits[3]);
				G.TCstate!.fy = Float(G.splits[4]);
				G.TCstate!.fz = Float(G.splits[5]);
				G.TCstate!.value = Int(Float(G.splits[6]));
				G.TCstate!.value_f = Float(G.splits[7]);
				// quirk: the string value goes through Float(): "abc" comes back as "0.0"
				G.TCstate!.value_s = Str(Float(G.splits[8]), 'float');
				G.TCstate!.r = Int(Float(G.splits[9]));
				G.TCstate!.g = Int(Float(G.splits[10]));
				G.TCstate!.b = Int(Float(G.splits[11]));
				look_state();
			}
		}
		Delete(Txc, Txc_);
	}

	//Parse Scripts
	G.tmp_loading = 0;
	if (G.map_mode === 'map') {
		//on:start
		parse_globalevent('start');
		parse_sel_event('start');
	}
	//on:load
	parse_globalevent('load');
	parse_sel_event('load');

	//Flush
	FlushKeys();
	FlushMouse();
	//Finish
	CloseFile(stream);
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

	return 1;
}

//### LOAD MAP ID
/** Function load_map_id$(path$) */
export function load_map_id(path: string): string {
	let id = '';
	let stream: Stream = 0;
	id = '0';
	if (FileType(path) === 1) {
		id = Str(FileSize(path));
		stream = ReadFile(path);
		if (stream !== 0) {
			ReadLine(stream); //Header
			ReadLine(stream); //Version
			id = id + ReadLine(stream); //Date
			id = id + ReadLine(stream); //Time
			CloseFile(stream);
		}
	}
	return id;
}

//### LOAD MAP HEADER
/** Function load_map_header(path$,image=1) */
export function load_map_header(path: string, image: number = 1): number {
	let stream: Stream = 0;
	let in_ = '';
	let f = '';
	let x = 0;
	let y = 0;
	let r = 0;
	let g = 0;
	let b = 0;
	let rgb = 0;
	stream = ReadFile(path);
	if (stream === 0) {
		con_add('Unable to load Map Info from ' + path, Cbmpf_red);
		return 0;
	}

	//### Headers

	//Main Header
	in_ = ReadLine(stream);
	if (Left(in_, 15) !== '### Stranded II') RuntimeError('Invalid Map! (Invalid Header)');
	ReadLine(stream); //Version
	G.sg_date = ReadLine(stream); //Date
	G.sg_time = ReadLine(stream); //Time
	f = ReadLine(stream); //Format
	void f;
	// quirk: this overwrites the mode of the map that is currently loaded
	G.map_mode = ReadLine(stream); //Mode
	ReadLine(stream); //Type Format
	ReadLine(stream);
	ReadLine(stream);
	ReadLine(stream);
	ReadLine(stream);
	ReadLine(stream); //###

	//Image
	if (image === 1) {
		if (G.map_image !== 0) FreeImage(G.map_image);
		G.map_image = CreateImage(96, 72);
		SetBuffer(ImageBuffer(G.map_image));
		LockBuffer(ImageBuffer(G.map_image));
		for (x = 0; x <= 96 - 1; x++) {
			for (y = 0; y <= 72 - 1; y++) {
				r = ReadByte(stream); //R
				g = ReadByte(stream); //G
				b = ReadByte(stream); //B
				rgb = (255 * 0x1000000 + r * 0x10000 + g * 0x100 + b) | 0;
				WritePixelFast(x, y, rgb);
			}
		}
		UnlockBuffer(ImageBuffer(G.map_image));
		SetBuffer(BackBuffer());
		MaskImage(G.map_image, 255, 0, 255);
	} else {
		for (x = 0; x <= 96 - 1; x++) {
			for (y = 0; y <= 72 - 1; y++) {
				ReadByte(stream);
				ReadByte(stream);
				ReadByte(stream);
			}
		}
	}

	//Password Header
	ReadByte(stream); //Code Key
	ReadLine(stream); //Password

	//Map Vars
	ReadInt(stream); //Map Time Day
	ReadByte(stream); //Map Time Hour
	ReadByte(stream); //Map Time Minute
	ReadByte(stream); //Map Time frozen?
	ReadString(stream); //Map Skybox
	G.sg_multiplayer = ReadByte(stream); //Map Multiplayer
	ReadByte(stream); //Map Climate
	ReadString(stream); //Map Music
	ReadString(stream); //Map Briefing
	ReadByte(stream); //Extended Stuff

	//Close
	CloseFile(stream);
	// no Return value at the end of the original: 0
	return 0;
}

//### LOAD SAVEGAMES
/** Function load_savegames(loadfirst=1) */
export function load_savegames(loadfirst: number = 1): void {
	let Tsg_: Tsg | null = null;
	let dir: DirHandle = 0;
	let file = '';
	//Delete old
	for (Tsg_ = First(Tsg); Tsg_ !== null; Tsg_ = After(Tsg, Tsg_)) {
		Delete(Tsg, Tsg_);
	}
	//Find
	dir = ReadDir('saves');
	if (dir !== 0) {
		for (;;) {
			file = NextFile(dir);
			if (file === '') break;
			if (FileType('saves\\' + file) === 1) {
				if (Right(file, 4) === '.sav') {
					Tsg_ = New(Tsg);
					Tsg_.name = Left(file, Len(file) - 4);
				}
			}
		}
		CloseDir(dir);
	} else {
		con_add("ERROR: Unable to read 'saves' dir!", Cbmpf_red);
	}
	//Loadfirst
	if (loadfirst) {
		// quirk: the image is freed but map_image keeps the handle (load_map_header frees it a second time)
		if (G.map_image !== 0) FreeImage(G.map_image);
		for (Tsg_ = First(Tsg); Tsg_ !== null; Tsg_ = After(Tsg, Tsg_)) {
			load_map_header('saves\\' + Tsg_.name + '.sav');
			G.in_opt[0] = 1;
			G.in_input[0] = '';
			return;
		}
	}
}

//### LOAD MAPS
/** Function load_maps(loadfirst=1,mponly=0) */
export function load_maps(loadfirst: number = 1, mponly: number = 0): void {
	let Tsg_: Tsg | null = null;
	let dir: DirHandle = 0;
	let file = '';
	//Delete old
	for (Tsg_ = First(Tsg); Tsg_ !== null; Tsg_ = After(Tsg, Tsg_)) {
		Delete(Tsg, Tsg_);
	}
	//Find
	dir = ReadDir('maps');
	if (dir !== 0) {
		for (;;) {
			file = NextFile(dir);
			if (file === '') break;
			//DebugLog file$
			if (FileType('maps\\' + file) === 1) {
				if (Right(file, 3) === '.s2') {
					Tsg_ = New(Tsg);
					Tsg_.name = Left(file, Len(file) - 3);
				}
			}
		}
		CloseDir(dir);
	} else {
		con_add("ERROR: Unable to read 'maps' dir!", Cbmpf_red);
	}
	//Delete Maps which are no Multiplayer Maps
	if (mponly === 1) {
		for (Tsg_ = First(Tsg); Tsg_ !== null; Tsg_ = After(Tsg, Tsg_)) {
			load_map_header('maps\\' + Tsg_.name + '.s2', 0);
			if (G.sg_multiplayer === 0) {
				Delete(Tsg, Tsg_);
			}
		}
	} else if (mponly === -1) {
		for (Tsg_ = First(Tsg); Tsg_ !== null; Tsg_ = After(Tsg, Tsg_)) {
			load_map_header('maps\\' + Tsg_.name + '.s2', 0);
			if (G.sg_multiplayer === 1) {
				Delete(Tsg, Tsg_);
			}
		}
	}
	//Loadfirst
	if (loadfirst) {
		// quirk: the image is freed but map_image keeps the handle (load_map_header frees it a second time)
		if (G.map_image !== 0) FreeImage(G.map_image);
		for (Tsg_ = First(Tsg); Tsg_ !== null; Tsg_ = After(Tsg, Tsg_)) {
			load_map_header('maps\\' + Tsg_.name + '.s2');
			G.in_opt[0] = 1;
			G.in_win_map = Tsg_.name;
			return;
		}
	}
}

//### LOAD MAP EXTENSIONS (PREPARE EXTENSIONS!)
/** Function load_map_extensions() */
export function load_map_extensions(): void {
	let Tx_: Tx | null = null;
	let Ttimer_: Ttimer | null = null;
	let Tfrap_: Tfrap | null = null;
	let Tup_: Tup | null = null;
	let Tunit_: Tunit | null = null;
	let t3d: T3d | null = null;
	for (Tx_ = First(Tx); Tx_ !== null; Tx_ = After(Tx, Tx_)) {
		if (Tx_.mode === 6) {
			switch (Tx_.key) {
				//Drive/Ride
				case 'g_drive':
					G.g_drive = Int(Tx_.value);
					if (con_unit(G.g_drive)) {
						//Get Vehicle Stuff
						game_input_vehicledata(G.TCunit!.typ);
						//Set Mode
						G.TCunit!.ai_mode = 0;
						G.TCunit!.ai_duration = 5000;
						G.TCunit!.ai_timer = G.gt;
						//Set Ani
						Animate(G.TCunit!.mh, 0);
						G.TCunit!.ani = 0;
					}
					break;
				//Weather
				case 'env_cweather':
					G.env_cweather = Int(Tx_.value);
					break;
				//Current Weapon/Ammo
				case 'w/a':
					if (con_unit(1)) {
						G.TCunit!.player_weapon = Tx_.parent_class;
						G.TCunit!.player_ammo = Tx_.parent_id;
						if (Tx_.value !== '') {
							G.TCunit!.player_weapon = Int(Tx_.value);
						}
					}
					break;
				//Timer
				case 't':
					Ttimer_ = New(Ttimer);
					Ttimer_.parent_class = Tx_.parent_class;
					Ttimer_.parent_id = Tx_.parent_id;
					split(Tx_.value, ',', 3);
					Ttimer_.typ = Int(G.splits[0]);
					Ttimer_.duration = Int(G.splits[1]);
					// quirk: what was saved is the time the timer had been running (gt-start); it is taken as the start time
					Ttimer_.start = Int(G.splits[2]);
					Ttimer_.mode = Int(G.splits[3]);
					Ttimer_.scr = Tx_.stuff;
					break;
				//FRAP (free rotation and position)
				case 'f':
					Tfrap_ = New(Tfrap);
					Tfrap_.parent_class = Tx_.parent_class;
					Tfrap_.parent_id = Tx_.parent_id;
					split(Tx_.value, ',', 2);
					Tfrap_.y = Float(G.splits[0]);
					Tfrap_.pitch = Float(G.splits[1]);
					Tfrap_.roll = Float(G.splits[2]);
					switch (Tfrap_.parent_class) {
						//Object
						case Cclass_object:
							if (con_object(Tfrap_.parent_id)) {
								RotateEntity(G.TCobject!.h, Tfrap_.pitch, EntityYaw(G.TCobject!.h), Tfrap_.roll);
								PositionEntity(G.TCobject!.h, EntityX(G.TCobject!.h), Tfrap_.y, EntityZ(G.TCobject!.h));
								if (G.TCobject!.ch !== null) {
									RotateEntity(G.TCobject!.ch, Tfrap_.pitch, EntityYaw(G.TCobject!.h), Tfrap_.roll);
									PositionEntity(G.TCobject!.ch, EntityX(G.TCobject!.h), Tfrap_.y, EntityZ(G.TCobject!.h));
								}
							}
							break;
						//Unit
						case Cclass_unit:
							if (con_unit(Tfrap_.parent_id)) {
								PositionEntity(G.TCunit!.h, EntityX(G.TCunit!.h), Tfrap_.y, EntityZ(G.TCunit!.h));
							}
							break;
						//Item
						case Cclass_item:
							if (con_item(Tfrap_.parent_id)) {
								PositionEntity(G.TCitem!.h, EntityX(G.TCitem!.h), Tfrap_.y, EntityZ(G.TCitem!.h));
							}
							break;
					}
					break;
				//Unit Path
				case 'u':
					Tup_ = New(Tup);
					Tup_.mode = Tx_.parent_class;
					Tup_.info = Tx_.parent_id;
					Tup_.unit = Int(Tx_.value);
					break;
				//Freeze (Ice)
				case 'i':
					if (Tx_.parent_class === Cclass_unit) {
						for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
							if (Tunit_.id === Tx_.parent_id) {
								Tunit_.freeze = 1;
								break;
							}
						}
					}
					break;
				//3D Texts
				case 't3d':
					t3d = New(T3d);
					t3d.class = Tx_.parent_class;
					t3d.id = Tx_.parent_id;
					t3d.txt = Tx_.value;
					split(Tx_.stuff, ',', 2);
					t3d.typ = Int(G.splits[0]);
					t3d.offset = Int(G.splits[1]);
					t3d.range = Int(G.splits[2]);
					break;
				//Last Time
				case 'lasttime':
					split(Tx_.stuff, ',', 2);
					G.map_lday = Int(G.splits[0]);
					G.map_lhour = Int(G.splits[1]);
					G.map_lminute = Int(G.splits[2]);
					G.map_timeupdate = 1;
					break;
			}
			Delete(Tx, Tx_);
		}
	}
}

//Recent Stuff
/** Function load_recent(add$="") */
export function load_recent(add: string = ''): void {
	let Trecent_: Trecent | null = null;
	let update = 0;
	let limit = 0;
	let file: Stream = 0;
	let in_ = '';
	//Delete old
	for (Trecent_ = First(Trecent); Trecent_ !== null; Trecent_ = After(Trecent, Trecent_)) {
		Delete(Trecent, Trecent_);
	}
	update = 0;
	limit = 0;
	file = ReadFile('sys/recent.cache');
	if (file !== 0) {
		//Add
		if (add !== '') {
			Trecent_ = New(Trecent);
			Trecent_.file = add;
		}
		//Read
		while (Eof(file) === 0) {
			in_ = ReadLine(file);
			if (in_ !== '') {
				if (in_ !== add) {
					Trecent_ = New(Trecent);
					Trecent_.file = in_;
					limit = limit + 1;
					if (limit >= 15) break;
				}
			}
		}
		CloseFile(file);
		update = 1;
	} else {
		//Add
		if (add !== '') {
			Trecent_ = New(Trecent);
			Trecent_.file = add;
			update = 1;
		}
	}
	//Write
	if (update === 1) {
		limit = 0;
		file = WriteFile('sys/recent.cache');
		if (file !== 0) {
			for (Trecent_ = First(Trecent); Trecent_ !== null; Trecent_ = After(Trecent, Trecent_)) {
				limit = limit + 1;
				WriteLine(file, Trecent_.file);
				if (limit >= 15) break;
			}
			CloseFile(file);
		}
	}
}
