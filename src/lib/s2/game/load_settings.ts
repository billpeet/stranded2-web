/**
 * includes/load_settings.bb, ported line by line on the file commands of
 * files.ts (a worked example for stream code: ReadFile / ReadLine /
 * ReadShort / WriteLine ...). What save_settings() writes lands in the
 * writable overlay and is there again at the next start.
 */
import { Float, Int, RuntimeError, Str, f32 } from '../blitz';
import { EntityAlpha } from '../bb3d';
import { live } from './_stubs';
import { Cpeakblur } from './consts';
import { e_environment_setup_water } from './e_environment.ported';
import {
	CloseFile,
	ReadByte,
	ReadFile,
	ReadFloat,
	ReadLine,
	ReadShort,
	WriteByte,
	WriteFile,
	WriteFloat,
	WriteLine,
	WriteShort
} from './files';
import { grass_heightmap, grass_map, grass_spread } from './grasspread';
import { mp_checkname } from './mp_game_functions';
import { G, dim } from './state';

/** Function load_settings() */
export function load_settings(): void {
	//Controls
	G.in_keys = dim(0, 20);
	let stream = ReadFile('sys\\controls.cfg');
	if (stream === 0) {
		//Failed? Set Defaults!
		G.set_msens = f32(0.2);
		G.set_minvert = 1;
		G.set_msmooth = 0;
	} else {
		//Load
		ReadLine(stream);
		for (let i = 0; i <= 20; i++) {
			G.in_keys[i] = ReadShort(stream);
		}
		G.set_msens = ReadFloat(stream);
		G.set_minvert = ReadByte(stream) - 128;
		G.set_msmooth = ReadByte(stream);
		CloseFile(stream);
	}
	//Scriptcontrols
	G.game_scriptkey = dim(0, 20);
	stream = ReadFile('sys\\scriptcontrols.cfg');
	if (stream !== 0) {
		ReadLine(stream);
		for (let i = 0; i <= 20; i++) {
			G.game_scriptkey[i] = ReadShort(stream);
		}
		CloseFile(stream);
	}
	//Settings
	stream = ReadFile('sys\\settings.cfg');
	if (stream === 0) {
		//Failed? Set Defaults!
		G.set_scrx = 800;
		G.set_scry = 600;
		G.set_scrbit = 32;
		G.set_hwmultitex = 1;
		G.set_mb = 1;
		G.set_mb_alpha = f32(0.35);
	} else {
		//Load
		ReadLine(stream);
		// Int variable = String: Int(), Float variable = String: Float()
		G.set_scrx = Int(ReadLine(stream));
		G.set_scrx_c = G.set_scrx;
		G.set_scry = Int(ReadLine(stream));
		G.set_scry_c = G.set_scry;
		G.set_scrbit = Int(ReadLine(stream));
		G.set_scrbit_c = G.set_scrbit;
		G.set_viewrange = Int(ReadLine(stream));
		G.set_terrain = Int(ReadLine(stream));
		G.set_water = Int(ReadLine(stream));
		G.set_sky = Int(ReadLine(stream));
		G.set_effects = Int(ReadLine(stream));
		G.set_musicvolume = Float(ReadLine(stream));
		G.set_fxvolume = Float(ReadLine(stream));
		G.set_grass = Int(ReadLine(stream));
		G.set_2dfx = Int(ReadLine(stream));
		G.set_lightfx = Int(ReadLine(stream));
		G.set_windsway = Int(ReadLine(stream));
		G.set_name = ReadLine(stream);
		G.set_serverport = Int(ReadLine(stream));
		G.set_fog = Int(ReadLine(stream));
		G.set_hwmultitex = Int(ReadLine(stream));
		G.set_mb = Int(ReadLine(stream));
		G.set_mb_alpha = Float(ReadLine(stream));
		CloseFile(stream);
	}

	//Setup

	//Viewrange
	switch (G.set_viewrange) {
		case 0:
			G.set_viewfac = 0.5;
			break;
		case 1:
			G.set_viewfac = 1.0;
			break;
		case 2:
			G.set_viewfac = 1.5;
			break;
		case 3:
			G.set_viewfac = 2.5;
			break;
		case 4:
			G.set_viewfac = 4.0;
			break;
		default:
			G.set_viewfac = 1.5;
	}

	//Motion Blur
	if (G.mb_sprite !== null) {
		EntityAlpha(G.mb_sprite, G.set_mb_alpha);
		if (G.set_mb_alpha > Cpeakblur) EntityAlpha(G.mb_sprite, Cpeakblur);
	}
}

/** Top-level code of load_settings.bb: `load_settings()` */
export function include_load_settings(): void {
	load_settings();
}

/** Function save_settings() */
export function save_settings(): void {
	//Controls
	let stream = WriteFile('sys\\controls.cfg');
	if (stream === 0) RuntimeError('Unable to write sys\\controls.cfg');
	WriteLine(stream, '### ' + G.set_moddir + ' Control Settings (Warning: Editing this File may cause Errors)');
	for (let i = 0; i <= 20; i++) {
		WriteShort(stream, G.in_keys[i]);
	}
	WriteFloat(stream, G.set_msens);
	WriteByte(stream, G.set_minvert + 128);
	WriteByte(stream, G.set_msmooth);
	CloseFile(stream);
	//Scriptcontrols
	if (G.game_scriptkeys > 0) {
		stream = WriteFile('sys\\scriptcontrols.cfg');
		if (stream === 0) RuntimeError('Unable to write sys\\scriptcontrols.cfg');
		WriteLine(stream, '### ' + G.set_moddir + ' Script Control Settings (Warning: Editing this File may cause Errors)');
		for (let i = 0; i <= 20; i++) {
			WriteShort(stream, G.game_scriptkey[i]);
		}
		CloseFile(stream);
	}
	//Settings
	stream = WriteFile('sys\\settings.cfg');
	if (stream === 0) RuntimeError('Unable to write sys\\settings.cfg');
	WriteLine(stream, '### ' + G.set_moddir + ' Settings (Warning: Editing this File may cause Errors)');
	WriteLine(stream, Str(G.set_scrx_c));
	WriteLine(stream, Str(G.set_scry_c));
	WriteLine(stream, Str(G.set_scrbit_c));
	WriteLine(stream, Str(G.set_viewrange));
	WriteLine(stream, Str(G.set_terrain));
	WriteLine(stream, Str(G.set_water));
	WriteLine(stream, Str(G.set_sky));
	WriteLine(stream, Str(G.set_effects));
	WriteLine(stream, Str(G.set_musicvolume, 'float'));
	WriteLine(stream, Str(G.set_fxvolume, 'float'));
	WriteLine(stream, Str(G.set_grass));
	WriteLine(stream, Str(G.set_2dfx));
	WriteLine(stream, Str(G.set_lightfx));
	WriteLine(stream, Str(G.set_windsway));
	// mp_checkname is mp_game_functions.bb; the name is written unchecked until that file is ported
	G.set_name = live(mp_checkname, ((name: string) => name) as typeof mp_checkname)(G.set_name, 0);
	WriteLine(stream, G.set_name);
	WriteLine(stream, Str(G.set_serverport));
	WriteLine(stream, Str(G.set_fog));
	WriteLine(stream, Str(G.set_hwmultitex));
	WriteLine(stream, Str(G.set_mb));
	WriteLine(stream, Str(G.set_mb_alpha, 'float'));
	CloseFile(stream);

	//Setup

	//Viewrange
	switch (G.set_viewrange) {
		case 0:
			G.set_viewfac = 0.5;
			break;
		case 1:
			G.set_viewfac = 1;
			break;
		case 2:
			G.set_viewfac = 1.5;
			break;
		case 3:
			G.set_viewfac = 2;
			break;
		case 4:
			G.set_viewfac = 2.5;
			break;
		default:
			G.set_viewfac = 1.5;
	}

	//Motion Blur
	if (G.mb_sprite !== null) {
		EntityAlpha(G.mb_sprite, G.set_mb_alpha);
		if (G.set_mb_alpha > Cpeakblur) EntityAlpha(G.mb_sprite, Cpeakblur);
	}

	//Water
	e_environment_setup_water();

	//Grass
	grass_map();
	grass_heightmap();
	G.grass_x = -2147483648;
	G.grass_y = -2147483648;
	grass_spread();
}
