/**
 * includes/e_save_map.bb, ported line by line on the file commands of files.ts.
 *
 * save_map writes what the original writes, byte for byte. Fields that differ
 * between two saves of the same state, in the original as well: the date and
 * time lines, the password key (Rand(5,250)) with the encoded password, and
 * the preview image (a fresh screenshot).
 *
 * Bridge calls (marked "bridge", see _additions/map.ts): the colour map is
 * pulled out of the environment layer when the layer changed it, and attached
 * media files are read into memory before the stream commands open them.
 */
import { EntityPitch, EntityX, EntityY, EntityYaw, EntityZ, HideEntity, PositionEntity, RotateEntity, TextureBuffer, TextureHeight } from '../bb3d';
import { CurrentDate, CurrentTime, Rand, Str, idivConst } from '../blitz';
import {
	BackBuffer,
	CreateImage,
	DrawImage,
	FreeImage,
	GrabImage,
	ImageBuffer,
	ImageHeight,
	ImageWidth,
	LockBuffer,
	ReadPixelFast,
	ResizeImage,
	SetBuffer,
	UnlockBuffer,
	type ImageHandle
} from '../gfx2d';
import { TerrainHeight_exe, grass_rgb_get, terTexColorFromEnv } from './_additions/map';
import { con_add } from './console';
import { Cclass_unit, Csection_editor, Cversion } from './consts';
import { RenderWorld } from './e_environment';
import {
	CloseFile,
	Eof,
	FileSize,
	FileType,
	ReadByte,
	ReadFile,
	WriteByte,
	WriteFile,
	WriteFloat,
	WriteInt,
	WriteLine,
	WriteShort,
	WriteString,
	ensureFile,
	type Stream
} from './files';
import { code, strinv } from './functions.ported';
import { con_unit } from './handle_units';
import { bmpf_loadscreen } from './load_bmpf';
import { LoadImage } from './load_functions';
import { s } from './load_strings';
import { parse_all, parse_globalevent } from './parser_functions';
import { G } from './state';
import { After, Delete, First, HandleOf, New, T3d, Tat, Tfrap, Tinfo, Titem, Tobject, Tstate, Ttimer, Tunit, Tup, Tx } from './types';

//############################################ Engine Save Map

//### SAVE MAP
/** Function save_map(path$,mode$,pw$,s_skills=1,s_items=1,s_vars=1,s_diary=1,s_states=1,s_locks=1) */
export async function save_map(
	path: string,
	mode: string,
	pw: string,
	s_skills: number = 1,
	s_items: number = 1,
	s_vars: number = 1,
	s_diary: number = 1,
	s_states: number = 1,
	s_locks: number = 1
): Promise<number> {
	let stream: Stream = 0;
	let tfobject = 0;
	let tfunit = 0;
	let tfitem = 0;
	let tfstring = '';
	let x = 0;
	let y = 0;
	let rgb = 0;
	let pwkey = 0;
	let encodedpw = '';
	let i = 0;
	let h = 0;
	let c = 0;
	let Tobject_: Tobject | null = null;
	let peak = 0;
	let Tunit_: Tunit | null = null;
	let Titem_: Titem | null = null;
	let Tinfo_: Tinfo | null = null;
	let Tstate_: Tstate | null = null;
	let Tx_: Tx | null = null;
	let ds = 0;
	let Tat_: Tat | null = null;
	let atstream: Stream = 0;
	let byte = 0;

	stream = WriteFile(path);
	if (stream === 0) return 0;

	//Event: Presave
	if (G.m_section !== Csection_editor) {
		parse_globalevent('presave');
		parse_all();
	}

	//### Headers

	//Main Header
	await bmpf_loadscreen(s(10), 10);
	WriteLine(stream, '### Stranded II Mapfile \xa9by Unreal Software 2004-2007');
	WriteLine(stream, Cversion); //Version
	WriteLine(stream, CurrentDate()); //Date
	WriteLine(stream, CurrentTime()); //Time
	WriteLine(stream, 'default'); //Format
	WriteLine(stream, mode); //Mode

	//Type Format
	tfobject = 0;
	tfunit = 0;
	tfitem = 0;
	if (G.Cobject_count > 255) tfobject = 1;
	if (G.Cunit_count > 255) tfunit = 1;
	if (G.Citem_count > 255) tfitem = 1;
	if (tfobject + tfunit + tfitem > 0) {
		tfstring = '';
		tfstring = tfstring + Str(tfobject);
		tfstring = tfstring + Str(tfunit);
		tfstring = tfstring + Str(tfitem);
		WriteLine(stream, tfstring);
	} else {
		WriteLine(stream, '');
	}

	WriteLine(stream, '');
	WriteLine(stream, '');
	WriteLine(stream, '');
	WriteLine(stream, '');
	WriteLine(stream, '###'); //###

	//Image
	save_map_image(mode);
	SetBuffer(ImageBuffer(G.map_image));
	LockBuffer(ImageBuffer(G.map_image));
	for (x = 0; x <= 96 - 1; x++) {
		for (y = 0; y <= 72 - 1; y++) {
			rgb = ReadPixelFast(x, y);
			WriteByte(stream, idivConst(rgb & 0xff0000, 0x10000)); //R
			WriteByte(stream, idivConst(rgb & 0xff00, 0x100)); //G
			WriteByte(stream, rgb & 0xff); //B
		}
	}
	UnlockBuffer(ImageBuffer(G.map_image));
	SetBuffer(BackBuffer());

	//Password Header
	pwkey = Rand(5, 250);
	WriteByte(stream, pwkey); //Code Key
	encodedpw = code(pw, pwkey, 0);
	WriteLine(stream, encodedpw); //Password
	G.map_password = pw;

	//Map Vars
	WriteInt(stream, G.map_day); //Map Time Day
	WriteByte(stream, G.map_hour); //Map Time Hour
	WriteByte(stream, G.map_minute); //Map Time Minute
	WriteByte(stream, G.map_freezetime); //Map Time frozen?
	WriteString(stream, G.map_skybox); //Map Skybox
	WriteByte(stream, G.map_multiplayer); //Map Multiplayer
	WriteByte(stream, G.map_climate); //Map Climate
	WriteString(stream, G.map_music); //Map Music
	WriteString(stream, G.map_briefing); //Map Briefing
	WriteByte(stream, G.map_fog[0]); //Map Fog R
	WriteByte(stream, G.map_fog[1]); //Map Fog G
	WriteByte(stream, G.map_fog[2]); //Map Fog B
	WriteByte(stream, G.map_fog[3]); //Map Fog Mode
	WriteByte(stream, 0); //Extended Stuff

	//Interface
	for (i = 0; i <= 9; i++) {
		// in_quickslot(9) is an Int array: written as its decimal text
		WriteString(stream, Str(G.in_quickslot[i])); //Quickslot
	}

	//### Maps

	//Colormap
	await bmpf_loadscreen(s(11), 20);
	terTexColorFromEnv(); // bridge: the layer's colour map, if e_terraincm / e_terraincmscale replaced it
	h = TextureHeight(G.ter_tex_color); //Colortexture Size
	WriteInt(stream, h);
	SetBuffer(TextureBuffer(G.ter_tex_color)!);
	LockBuffer(TextureBuffer(G.ter_tex_color)!);
	for (x = 0; x <= h - 1; x++) {
		for (y = 0; y <= h - 1; y++) {
			rgb = ReadPixelFast(x, y);
			WriteByte(stream, idivConst(rgb & 0xff0000, 0x10000)); //R
			WriteByte(stream, idivConst(rgb & 0xff00, 0x100)); //G
			WriteByte(stream, rgb & 0xff); //B
		}
	}
	UnlockBuffer(TextureBuffer(G.ter_tex_color)!);
	SetBuffer(BackBuffer());

	//Heightmap
	await bmpf_loadscreen(s(12), 30);
	WriteInt(stream, G.ter_size); //Terrain Size
	for (x = 0; x <= G.ter_size; x++) {
		for (y = 0; y <= G.ter_size; y++) {
			// TerrainHeight(ter,x,y) with the float arithmetic of the shipped runtime (see _additions/map.ts)
			WriteFloat(stream, TerrainHeight_exe(G.ter, x, y)); //Height
		}
	}

	//Grassmap
	await bmpf_loadscreen(s(13), 35);
	for (x = 0; x <= h; x++) {
		for (y = 0; y <= h; y++) {
			WriteByte(stream, grass_rgb_get(x, y, 3)); //Gras? 1/0
		}
	}

	//### Stuff

	//Object
	await bmpf_loadscreen(s(14), 40);
	c = 0;
	for (Tobject_ = First(Tobject); Tobject_ !== null; Tobject_ = After(Tobject, Tobject_)) {
		c = c + 1;
	}
	WriteInt(stream, c); //Count
	for (Tobject_ = First(Tobject); Tobject_ !== null; Tobject_ = After(Tobject, Tobject_)) {
		WriteInt(stream, Tobject_.id); //ID
		if (tfobject) {
			//Typ
			WriteShort(stream, Tobject_.typ);
		} else {
			WriteByte(stream, Tobject_.typ);
		}
		WriteFloat(stream, EntityX(Tobject_.h)); //X
		WriteFloat(stream, EntityZ(Tobject_.h)); //Z
		WriteFloat(stream, EntityYaw(Tobject_.h)); //Yaw
		WriteFloat(stream, Tobject_.health); //Health
		WriteFloat(stream, Tobject_.health_max); //Health Max
		WriteInt(stream, Tobject_.daytimer); //Daytimer
	}

	//Unit
	peak = 100;
	if (mode === 'sav') peak = 0;
	await bmpf_loadscreen(s(15), 70);
	c = 0;
	for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
		if (Tunit_.id >= peak) c = c + 1;
	}
	WriteInt(stream, c); //Count
	for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
		if (Tunit_.id >= peak) {
			if (mode === 'map') {
				//Cache AI Center
				Tunit_.ai_cx = EntityX(Tunit_.h);
				Tunit_.ai_cz = EntityZ(Tunit_.h);
			}
			WriteInt(stream, Tunit_.id); //ID
			if (tfunit) {
				//Typ
				WriteShort(stream, Tunit_.typ);
			} else {
				WriteByte(stream, Tunit_.typ);
			}
			WriteFloat(stream, EntityX(Tunit_.h)); //X
			WriteFloat(stream, EntityY(Tunit_.h)); //Y
			WriteFloat(stream, EntityZ(Tunit_.h)); //Z
			WriteFloat(stream, EntityYaw(Tunit_.h)); //Yaw
			WriteFloat(stream, Tunit_.health); //Health
			WriteFloat(stream, Tunit_.health_max); //Health Max
			WriteFloat(stream, Tunit_.hunger); //Hunger
			WriteFloat(stream, Tunit_.thirst); //Thirst
			WriteFloat(stream, Tunit_.exhaustion); //Exhaustion
			WriteFloat(stream, Tunit_.ai_cx); //AI Center X
			WriteFloat(stream, Tunit_.ai_cz); //AI Center Z
		}
	}

	//Item
	await bmpf_loadscreen(s(16), 80);
	if (s_items === 1) {
		c = 0;
		for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
			c = c + 1;
		}
		WriteInt(stream, c); //Count
		for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
			WriteInt(stream, Titem_.id); //ID
			if (tfitem) {
				//Typ
				WriteShort(stream, Titem_.typ);
			} else {
				WriteByte(stream, Titem_.typ);
			}
			WriteFloat(stream, EntityX(Titem_.h)); //X
			WriteFloat(stream, EntityY(Titem_.h)); //Y
			WriteFloat(stream, EntityZ(Titem_.h)); //Z
			WriteFloat(stream, EntityYaw(Titem_.h)); //Yaw
			WriteFloat(stream, Titem_.health); //Health
			WriteInt(stream, Titem_.count); //Count
			WriteByte(stream, Titem_.parent_class); //Parent Class
			WriteByte(stream, Titem_.parent_mode); //Parent Mode
			WriteInt(stream, Titem_.parent_id); //Parent ID
		}
	} else {
		c = 0;
		for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
			if (Titem_.parent_class !== Cclass_unit || Titem_.parent_id !== 1) {
				c = c + 1;
			}
		}
		WriteInt(stream, c); //Count
		for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
			if (Titem_.parent_class !== Cclass_unit || Titem_.parent_id !== 1) {
				WriteInt(stream, Titem_.id); //ID
				if (tfitem) {
					//Typ
					WriteShort(stream, Titem_.typ);
				} else {
					WriteByte(stream, Titem_.typ);
				}
				WriteFloat(stream, EntityX(Titem_.h)); //X
				WriteFloat(stream, EntityY(Titem_.h)); //Y
				WriteFloat(stream, EntityZ(Titem_.h)); //Z
				WriteFloat(stream, EntityYaw(Titem_.h)); //Yaw
				WriteFloat(stream, Titem_.health); //Health
				WriteInt(stream, Titem_.count); //Count
				WriteByte(stream, Titem_.parent_class); //Parent Class
				WriteByte(stream, Titem_.parent_mode); //Parent Mode
				WriteInt(stream, Titem_.parent_id); //Parent ID
			}
		}
	}

	//Info
	await bmpf_loadscreen(s(17), 90);
	c = 0;
	for (Tinfo_ = First(Tinfo); Tinfo_ !== null; Tinfo_ = After(Tinfo, Tinfo_)) {
		c = c + 1;
	}
	WriteInt(stream, c); //Count
	for (Tinfo_ = First(Tinfo); Tinfo_ !== null; Tinfo_ = After(Tinfo, Tinfo_)) {
		WriteInt(stream, Tinfo_.id); //ID
		WriteByte(stream, Tinfo_.typ); //Typ
		WriteFloat(stream, EntityX(Tinfo_.h)); //X
		WriteFloat(stream, EntityY(Tinfo_.h)); //Y
		WriteFloat(stream, EntityZ(Tinfo_.h)); //Z
		WriteFloat(stream, EntityPitch(Tinfo_.h)); //Pitch
		WriteFloat(stream, EntityYaw(Tinfo_.h)); //Yaw
		WriteString(stream, Tinfo_.vars); //Vars
	}

	//State
	await bmpf_loadscreen(s(18), 92);
	if (s_states === 1) {
		c = 0;
		for (Tstate_ = First(Tstate); Tstate_ !== null; Tstate_ = After(Tstate, Tstate_)) {
			c = c + 1;
		}
		WriteInt(stream, c); //Count
		for (Tstate_ = First(Tstate); Tstate_ !== null; Tstate_ = After(Tstate, Tstate_)) {
			WriteByte(stream, Tstate_.typ); //Typ
			WriteByte(stream, Tstate_.parent_class); //Parent Class
			WriteInt(stream, Tstate_.parent_id); //Parent ID
			WriteFloat(stream, Tstate_.x); //X
			WriteFloat(stream, Tstate_.y); //Y
			WriteFloat(stream, Tstate_.z); //Z
			WriteFloat(stream, Tstate_.fx); //FX
			WriteFloat(stream, Tstate_.fy); //FY
			WriteFloat(stream, Tstate_.fz); //FZ
			WriteInt(stream, Tstate_.value); //Value
			WriteFloat(stream, Tstate_.value_f); //Value Float
			WriteString(stream, Tstate_.value_s); //Value String
		}
	} else {
		c = 0;
		for (Tstate_ = First(Tstate); Tstate_ !== null; Tstate_ = After(Tstate, Tstate_)) {
			if (Tstate_.parent_class !== Cclass_unit || Tstate_.parent_id !== 1) {
				c = c + 1;
			}
		}
		WriteInt(stream, c); //Count
		for (Tstate_ = First(Tstate); Tstate_ !== null; Tstate_ = After(Tstate, Tstate_)) {
			if (Tstate_.parent_class !== Cclass_unit || Tstate_.parent_id !== 1) {
				WriteByte(stream, Tstate_.typ); //Typ
				WriteByte(stream, Tstate_.parent_class); //Parent Class
				WriteInt(stream, Tstate_.parent_id); //Parent ID
				WriteFloat(stream, Tstate_.x); //X
				WriteFloat(stream, Tstate_.y); //Y
				WriteFloat(stream, Tstate_.z); //Z
				WriteFloat(stream, Tstate_.fx); //FX
				WriteFloat(stream, Tstate_.fy); //FY
				WriteFloat(stream, Tstate_.fz); //FZ
				WriteInt(stream, Tstate_.value); //Value
				WriteFloat(stream, Tstate_.value_f); //Value Float
				WriteString(stream, Tstate_.value_s); //Value String
			}
		}
	}

	//Extensions
	await bmpf_loadscreen(s(19), 95);
	c = 0;
	save_map_extensions(mode, s_items);
	//free temp vars - dont save them
	for (Tx_ = First(Tx); Tx_ !== null; Tx_ = After(Tx, Tx_)) {
		if (Tx_.mode === 1) {
			if (Tx_.stuff === 'temp') Delete(Tx, Tx_);
		}
	}
	//Save
	if (s_skills + s_vars + s_diary + s_locks === 4) {
		for (Tx_ = First(Tx); Tx_ !== null; Tx_ = After(Tx, Tx_)) {
			c = c + 1;
		}
		WriteInt(stream, c); //Count
		for (Tx_ = First(Tx); Tx_ !== null; Tx_ = After(Tx, Tx_)) {
			WriteByte(stream, Tx_.typ); //Typ
			WriteByte(stream, Tx_.parent_class); //Parent Class
			WriteInt(stream, Tx_.parent_id); //Parent ID
			WriteInt(stream, Tx_.mode); //Mode
			if (Tx_.mode === 0) {
				//Key (dont save script keys)
				WriteString(stream, '');
			} else {
				WriteString(stream, Tx_.key);
			}
			WriteString(stream, Tx_.value); //Value
			WriteString(stream, Tx_.stuff); //Stuff
			if (Tx_.mode === 6) Delete(Tx, Tx_);
		}
	} else {
		for (Tx_ = First(Tx); Tx_ !== null; Tx_ = After(Tx, Tx_)) {
			ds = 1;
			if (s_skills === 0 && Tx_.mode === 5) ds = 0;
			if (s_vars === 0 && Tx_.mode === 1) ds = 0;
			if (s_diary === 0 && Tx_.mode === 2) ds = 0;
			if (s_locks === 0 && Tx_.mode === 3) ds = 0;
			if (ds === 1) c = c + 1;
		}
		WriteInt(stream, c); //Count
		for (Tx_ = First(Tx); Tx_ !== null; Tx_ = After(Tx, Tx_)) {
			ds = 1;
			if (s_skills === 0 && Tx_.mode === 5) ds = 0;
			if (s_vars === 0 && Tx_.mode === 1) ds = 0;
			if (s_diary === 0 && Tx_.mode === 2) ds = 0;
			if (s_locks === 0 && Tx_.mode === 3) ds = 0;
			if (ds === 1) {
				WriteByte(stream, Tx_.typ); //Typ
				WriteByte(stream, Tx_.parent_class); //Parent Class
				WriteInt(stream, Tx_.parent_id); //Parent ID
				WriteInt(stream, Tx_.mode); //Mode
				if (Tx_.mode === 0) {
					//Key (dont save script keys)
					WriteString(stream, '');
				} else {
					WriteString(stream, Tx_.key);
				}
				WriteString(stream, Tx_.value); //Value
				WriteString(stream, Tx_.stuff); //Stuff
				if (Tx_.mode === 6) Delete(Tx, Tx_);
			}
		}
	}

	//Save Cam Angels (sav) + Player Position
	if (mode === 'sav') {
		WriteFloat(stream, EntityPitch(G.cam));
		WriteFloat(stream, EntityYaw(G.cam));
	}

	//### End
	await bmpf_loadscreen(s(20), 100);
	con_add('');
	WriteLine(stream, '');
	WriteLine(stream, '### EOF Map File');
	WriteLine(stream, 'www.unrealsoftware.de');

	//Attachments
	if (mode === 'map') {
		for (Tat_ = First(Tat); Tat_ !== null; Tat_ = After(Tat, Tat_)) {
			// bridge: media files of the mod are not in memory until they are asked for
			await ensureFile(G.set_rootdir + 'mods\\' + G.set_moddir + '\\' + Tat_.path);
			if (FileType(G.set_rootdir + 'mods\\' + G.set_moddir + '\\' + Tat_.path) === 1) {
				atstream = ReadFile(G.set_rootdir + 'mods\\' + G.set_moddir + '\\' + Tat_.path);
				if (atstream !== 0) {
					WriteLine(stream, strinv(Tat_.path));
					WriteInt(stream, FileSize(G.set_rootdir + 'mods\\' + G.set_moddir + '\\' + Tat_.path));
					while (Eof(atstream) === 0) {
						byte = ReadByte(atstream);
						byte = 255 - byte;
						WriteByte(stream, byte);
					}
					CloseFile(atstream);
					atstream = 0;
				}
			}
		}
	}

	//Event: Postsave
	if (G.m_section !== Csection_editor) parse_globalevent('postsave');

	//Finish
	CloseFile(stream);
	return 1;
}

//### SAVE MAP IMAGE
/** Function save_map_image(mode$) */
export function save_map_image(mode: string): void {
	let pvimg: ImageHandle = 0;
	let ox = 0;
	let oy = 0;
	let oz = 0;
	let o1 = 0;
	let o2 = 0;
	let Tinfo_: Tinfo | null = null;
	ox = EntityX(G.cam);
	oy = EntityY(G.cam);
	oz = EntityZ(G.cam);
	o1 = EntityPitch(G.cam);
	o2 = EntityYaw(G.cam);
	//Create Image
	if (G.map_image !== 0) FreeImage(G.map_image);
	G.map_image = CreateImage(G.set_scrx, G.set_scry);
	//Get Previewimage Info
	if (mode === 'map') {
		for (Tinfo_ = First(Tinfo); Tinfo_ !== null; Tinfo_ = After(Tinfo, Tinfo_)) {
			if (Tinfo_.typ === 48) {
				//Load Image
				if (Tinfo_.strings[0] !== '') {
					pvimg = LoadImage(Tinfo_.strings[0]);
				}
				//Set Cam Position and Rotation
				PositionEntity(G.cam, EntityX(Tinfo_.h), EntityY(Tinfo_.h), EntityZ(Tinfo_.h));
				RotateEntity(G.cam, EntityPitch(Tinfo_.h), EntityYaw(Tinfo_.h), 0);
				//Ignore further Infos
				break;
			}
		}
	}
	//Render Image
	if (G.m_section === Csection_editor) {
		if (G.mb_sprite !== null) HideEntity(G.mb_sprite);
		for (Tinfo_ = First(Tinfo); Tinfo_ !== null; Tinfo_ = After(Tinfo, Tinfo_)) {
			HideEntity(Tinfo_.h);
		}
	}
	RenderWorld();
	GrabImage(G.map_image, 0, 0);
	//Resize Image
	ResizeImage(G.map_image, 96, 72);
	//Add Previewimage
	if (pvimg !== 0) {
		if (ImageWidth(pvimg) !== 96 || ImageHeight(pvimg) !== 72) {
			ResizeImage(pvimg, 96, 72);
		}
		SetBuffer(ImageBuffer(G.map_image));
		DrawImage(pvimg, 0, 0);
		SetBuffer(BackBuffer());
		FreeImage(pvimg);
	}
	PositionEntity(G.cam, ox, oy, oz);
	RotateEntity(G.cam, o1, o2, 0);
}

//### SAVE MAP EXTENSIONS (PREPARE EXTENSIONS!)
/** Function save_map_extensions(mode$="",s_items=1) */
export function save_map_extensions(mode: string = '', s_items: number = 1): void {
	let Tx_: Tx | null = null;
	let Ttimer_: Ttimer | null = null;
	let start = 0;
	let Tfrap_: Tfrap | null = null;
	let c: Tfrap | null = null;
	let Tup_: Tup | null = null;
	let Tunit_: Tunit | null = null;
	let t3d: T3d | null = null;
	for (Tx_ = First(Tx); Tx_ !== null; Tx_ = After(Tx, Tx_)) {
		if (Tx_.mode === 6) Delete(Tx, Tx_);
	}
	if (mode !== 'map') {
		//Drive/Ride
		Tx_ = New(Tx);
		Tx_.mode = 6;
		Tx_.key = 'g_drive';
		Tx_.value = Str(G.g_drive);
		//Weather
		Tx_ = New(Tx);
		Tx_.mode = 6;
		Tx_.key = 'env_cweather';
		Tx_.value = Str(G.env_cweather);
	}
	//Timer
	for (Ttimer_ = First(Ttimer); Ttimer_ !== null; Ttimer_ = After(Ttimer, Ttimer_)) {
		Tx_ = New(Tx);
		Tx_.mode = 6;
		Tx_.key = 't';
		Tx_.parent_class = Ttimer_.parent_class;
		Tx_.parent_id = Ttimer_.parent_id;
		start = G.gt - Ttimer_.start;
		if (start < 0) start = 0;
		Tx_.value = Str(Ttimer_.typ) + ',' + Str(Ttimer_.duration) + ',' + Str(start) + ',' + Str(Ttimer_.mode);
		Tx_.stuff = Ttimer_.scr;
	}
	//Current Weapon/Ammo
	if (s_items === 1) {
		if (con_unit(1)) {
			Tx_ = New(Tx);
			Tx_.mode = 6;
			Tx_.key = 'w/a';
			Tx_.value = Str(G.TCunit!.player_weapon);
			Tx_.parent_class = G.TCunit!.player_weapon;
			Tx_.parent_id = G.TCunit!.player_ammo;
		}
	}
	//FRAPs (free rotation and position)
	for (Tfrap_ = First(Tfrap); Tfrap_ !== null; Tfrap_ = After(Tfrap, Tfrap_)) {
		for (c = First(Tfrap); c !== null; c = After(Tfrap, c)) {
			if (HandleOf(Tfrap, Tfrap_) !== HandleOf(Tfrap, c)) {
				if (Tfrap_.parent_class === c.parent_class) {
					if (Tfrap_.parent_id === c.parent_id) {
						Delete(Tfrap, c);
					}
				}
			}
		}
	}
	for (Tfrap_ = First(Tfrap); Tfrap_ !== null; Tfrap_ = After(Tfrap, Tfrap_)) {
		Tx_ = New(Tx);
		Tx_.mode = 6;
		Tx_.key = 'f';
		Tx_.parent_class = Tfrap_.parent_class;
		Tx_.parent_id = Tfrap_.parent_id;
		Tx_.value = Str(Tfrap_.y, 'float') + ',' + Str(Tfrap_.pitch, 'float') + ',' + Str(Tfrap_.roll, 'float');
	}
	//Unit Path
	for (Tup_ = First(Tup); Tup_ !== null; Tup_ = After(Tup, Tup_)) {
		Tx_ = New(Tx);
		Tx_.mode = 6;
		Tx_.key = 'u';
		Tx_.parent_class = Tup_.mode;
		Tx_.parent_id = Tup_.info;
		Tx_.value = Str(Tup_.unit);
	}
	//Freezes (i for ice)
	for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
		if (Tunit_.freeze === 1) {
			Tx_ = New(Tx);
			Tx_.mode = 6;
			Tx_.key = 'i';
			Tx_.parent_class = Cclass_unit;
			Tx_.parent_id = Tunit_.id;
		}
	}
	//3D Texts
	for (t3d = First(T3d); t3d !== null; t3d = After(T3d, t3d)) {
		Tx_ = New(Tx);
		Tx_.mode = 6;
		Tx_.key = 't3d';
		Tx_.value = t3d.txt;
		Tx_.stuff = Str(t3d.typ) + ',' + Str(t3d.offset) + ',' + Str(t3d.range);
		Tx_.parent_class = t3d.class;
		Tx_.parent_id = t3d.id;
	}
	//Last Time
	Tx_ = New(Tx);
	Tx_.mode = 6;
	Tx_.key = 'lasttime';
	Tx_.stuff = Str(G.map_lday) + ',' + Str(G.map_lhour) + ',' + Str(G.map_lminute);
}
