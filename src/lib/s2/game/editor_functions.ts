/**
 * includes/editor_functions.bb: line-by-line port (PORTING_GUIDE.md).
 *
 * Notes for the integrator (details in _additions/editor_core.ts):
 * - The colour map functions work on the texture G.ter_tex_color and the grass
 *   map functions on G.grass_rgb / G.grass_mapsize, exactly like the original.
 *   The environment layer keeps its own copies (RT.env.colormap, RT.env.grass).
 * - Terrain heights go through the bb3d terrain commands on G.ter and the
 *   e_terrain* facades of e_environment.
 */
import {
	CameraProject,
	CopyEntity,
	CreateCube,
	CreatePivot,
	CreateTexture,
	EntityBlend,
	EntityColor,
	EntityFX,
	EntityPickMode,
	EntityX,
	EntityY,
	EntityZ,
	FreeEntity,
	ModifyTerrain,
	MoveEntity,
	PointEntity,
	PositionEntity,
	ProjectedX,
	ProjectedY,
	RotateEntity,
	ScaleEntity,
	TerrainHeight,
	TerrainSize,
	TerrainY,
	TextureBuffer,
	TextureHeight,
	TranslateEntity,
	UpdateWorld,
	type Handle,
	type Texture
} from '../bb3d';
import { Abs, Cos, Instr, Int, Left, Rand, Replace, Rnd, RuntimeError, SEP_LINE, Sin, Sqr, Trim, f32, fabs, fpow, idiv, idivConst } from '../blitz';
import {
	BackBuffer,
	Color,
	ColorBlue,
	ColorGreen,
	ColorRed,
	CopyPixelFast,
	CopyRect,
	CreateImage,
	DrawBlockRect,
	FreeImage,
	GetColor,
	ImageBuffer,
	ImageHeight,
	Line,
	LockBuffer,
	Oval,
	ReadPixelFast,
	Rect,
	SetBuffer,
	UnlockBuffer,
	WritePixel,
	WritePixelFast
} from '../gfx2d';
import { FlushKeys } from '../input';
import { con_add } from './console';
import {
	Cbmpf_red,
	Cclass_info,
	Cclass_item,
	Cclass_object,
	Cclass_unit,
	Cinfo_count,
	Cmenu_ed_colormap,
	Cmenu_ed_grassmap,
	Cmenu_ed_heightmap,
	Cmenu_ed_new,
	Cp_shockwave,
	Csection_editor,
	Csection_game_sp,
	Cworld_height,
	Cworld_size
} from './consts';
import {
	Dinfo_group,
	Dinfo_name,
	Ditem_group,
	Ditem_ined,
	Ditem_modelh,
	Ditem_name,
	Ditem_radius,
	Ditem_size,
	Dobject_group,
	Dobject_ined,
	Dobject_modelh,
	Dobject_name,
	Dobject_size,
	Dunit_group,
	Dunit_ined,
	Dunit_modelh,
	Dunit_name,
	Dunit_size
} from './defs_arrays';
import { e_clear } from './e_clear';
import { envColormapFromTexture } from './_additions/map';
import { e_environment, e_tercol, e_terrain, e_terraindistort, e_terrainrandom, e_terrainsmooth, e_tery } from './e_environment';
import { load_map } from './e_load_map';
import { save_map } from './e_save_map';
import { editor_setmenu } from './editor_menus';
import { CloseFile, Eof, ReadFile, ReadLine } from './files';
import { split } from './functions';
import { grass_heightmap, grass_map } from './grasspread';
import { gui_msg, gui_msgdecide } from './gui';
import { bmpf_loadscreen } from './load_bmpf';
import { load_item_model } from './load_items';
import { load_object_model } from './load_objects';
import { se, sm } from './load_strings';
import { parent_h } from './parentchild';
import { p_add } from './particles';
import { G } from './state';
import { After, Delete, First, New, Tgroup, Tgroupl, Tinfo, Titem, Tobject, Tsc, Tsgr, Tunit } from './types';

//######################################################################################################

//############################################ Editor Initialization
/** Function editor_ini(menu=Cmenu_ed_new) */
export async function editor_ini(menu: number = Cmenu_ed_new): Promise<void> {
	let i = 0;
	let g: Tgroup | null = null;
	let c = 0;
	const Cobject_item = 0; // quirk: misspelled (Citem_count): an undeclared local, always 0

	//Clear
	e_clear();

	//Set Menu
	G.in_opt[0] = 0;
	G.in_opt[3] = 0;
	G.in_opt[4] = 0;
	G.m_menu = menu;

	//Determine first Stuff for Lists
	//First Object
	for (i = 0; i <= G.Cobject_count; i++) {
		if (Dobject_name(i) !== '') {
			G.in_object_sel = i;
			break;
		}
	}
	//First Unit
	for (i = 0; i <= G.Cunit_count; i++) {
		if (Dunit_name(i) !== '') {
			G.in_unit_sel = i;
			break;
		}
	}
	//First Item
	for (i = 0; i <= G.Citem_count; i++) {
		if (Ditem_name(i) !== '') {
			G.in_item_sel = i;
			break;
		}
	}
	//First Info
	for (i = 0; i <= Cinfo_count; i++) {
		if (Dinfo_name(i) !== '') {
			G.in_info_sel = i;
			break;
		}
	}

	//Group Counts
	for (g = First(Tgroup); g !== null; g = After(Tgroup, g)) {
		c = 0;
		switch (g.class) {
			case Cclass_object:
				for (i = 0; i <= G.Cobject_count; i++) {
					if (Dobject_ined(i) === 1) {
						if (Dobject_group(i) === g.group) {
							c = c + 1;
						}
					}
				}
				break;
			case Cclass_unit:
				for (i = 0; i <= G.Cunit_count; i++) {
					if (Dunit_ined(i) === 1) {
						if (Dunit_group(i) === g.group) {
							c = c + 1;
						}
					}
				}
				break;
			case Cclass_item:
				// quirk: "For i=0 To Cobject_item": the loop only looks at item 0
				for (i = 0; i <= Cobject_item; i++) {
					if (Ditem_ined(i) === 1) {
						if (Ditem_group(i) === g.group) {
							c = c + 1;
						}
					}
				}
				break;
			case Cclass_info:
				for (i = 0; i <= Cinfo_count; i++) {
					if (Dinfo_group(i) === g.group) {
						c = c + 1;
					}
				}
				break;
		}
		g.count = c;
	}

	//Script Commands
	editor_ini_sc();

	//Default Map
	G.in_edrandrot = 1;
	editor_defaultmapsettings();

	//Blank Map
	await editor_genmap();
	await editor_gencolormap();
	grass_map();
	grass_heightmap();
	G.in_edmap = '';
	editor_resetcam();

	//Activate Sidebar
	G.in_editor_sidebar = 1;
}

//############################################ Editor Initialization Script Commands
/** Function editor_ini_sc() */
export function editor_ini_sc(): void {
	let Tsc_: Tsc | null = null;
	let in_ = ''; // Local in$ ("in" is a reserved word here)
	// Local matchpos,match$: declared, never used
	let stream: ReturnType<typeof ReadFile> = 0;
	let Tsgr_: Tsgr | null = null;
	let i = 0;
	let gexists = 0;
	let group = '';

	//Script Commands
	for (Tsc_ = First(Tsc); Tsc_ !== null; Tsc_ = After(Tsc, Tsc_)) {
		Delete(Tsc, Tsc_);
	}
	stream = ReadFile(G.set_rootdir + 'core\\scriptcommands.inf');
	if (stream !== 0) {
		while (!Eof(stream)) {
			in_ = ReadLine(stream);
			in_ = Trim(in_);
			if (in_ !== '') {
				split(in_, SEP_LINE, 3);
				Tsc_ = New(Tsc);
				Tsc_.cmd = G.splits[0];
				Tsc_.groups = G.splits[1];
				Tsc_.params = G.splits[2];
			}
		}
		CloseFile(stream);
	} else {
		con_add("ERROR: Unable to load 'core\\scriptcommands.inf'", Cbmpf_red);
	}
	//Script Groups
	for (Tsgr_ = First(Tsgr); Tsgr_ !== null; Tsgr_ = After(Tsgr, Tsgr_)) {
		Delete(Tsgr, Tsgr_);
	}
	for (Tsc_ = First(Tsc); Tsc_ !== null; Tsc_ = After(Tsc, Tsc_)) {
		split(Tsc_.groups, ',', 5);
		for (i = 0; i <= 5; i++) {
			if (G.splits[i] !== '') {
				gexists = 0;
				group = Trim(G.splits[i]);
				for (Tsgr_ = First(Tsgr); Tsgr_ !== null; Tsgr_ = After(Tsgr, Tsgr_)) {
					if (Tsgr_.group === group) {
						gexists = 1;
						break;
					}
				}
				if (gexists === 0) {
					Tsgr_ = New(Tsgr);
					Tsgr_.group = group;
				}
			}
		}
	}
}

//############################################ Editor Quit
/** Function editor_quit() */
export function editor_quit(): void {
	let Tsc_: Tsc | null = null;
	let Tsgr_: Tsgr | null = null;
	//Script Commands
	for (Tsc_ = First(Tsc); Tsc_ !== null; Tsc_ = After(Tsc, Tsc_)) {
		Delete(Tsc, Tsc_);
	}
	//Script Groups
	for (Tsgr_ = First(Tsgr); Tsgr_ !== null; Tsgr_ = After(Tsgr, Tsgr_)) {
		Delete(Tsgr, Tsgr_);
	}
	//Dummy
	if (G.in_editor_dummy !== null) {
		FreeEntity(G.in_editor_dummy);
		G.in_editor_dummy = null;
	}
}

//############################################ Set Picking
/** Function editor_picking(mode) */
export function editor_picking(mode: number): void {
	//Options
	let objects = 0;
	let units = 0;
	let items = 0;
	let infos = 0;
	let Tobject_: Tobject | null = null;
	let Tunit_: Tunit | null = null;
	let Titem_: Titem | null = null;
	let Tinfo_: Tinfo | null = null;
	switch (mode) {
		case Cclass_object:
			objects = 1;
			break;
		case Cclass_unit:
			units = 1;
			break;
		case Cclass_item:
			items = 1;
			break;
		case Cclass_info:
			infos = 1;
			break;
	}
	//Objects
	for (Tobject_ = First(Tobject); Tobject_ !== null; Tobject_ = After(Tobject, Tobject_)) {
		EntityPickMode(Tobject_.h, objects * 2, 1);
	}
	//Units
	for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
		EntityPickMode(Tunit_.h, units * 2, 1);
	}
	//Items
	for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
		if (Ditem_radius(Titem_.typ) === 0) {
			EntityPickMode(Titem_.h, items * 2, 1);
		} else {
			EntityPickMode(Titem_.h, items * 1, 1);
		}
	}
	//Infos
	for (Tinfo_ = First(Tinfo); Tinfo_ !== null; Tinfo_ = After(Tinfo, Tinfo_)) {
		if (Tinfo_.h !== null) EntityPickMode(Tinfo_.h, infos * 2, 1);
	}
}

//############################################ Generate Map
/** Function editor_genmap(ctexsize=128) */
export async function editor_genmap(ctexsize: number = 128): Promise<void> {
	let size = 0;
	let x = 0;
	let z = 0;
	let seaground = 0;
	let landground = 0;
	let hdif = 0;
	let dist = 0;
	let perc = 0;
	let c = 0;
	let h = 0;
	let coast = 0;
	let transc = 0;
	let transmin = 0;
	let transmax = 0;
	let i = 0;
	let angle = 0;

	//Clear
	e_clear();
	//Get Size
	switch (G.in_opt[3]) {
		case 0:
			size = 16;
			break;
		case 1:
			size = 32;
			break;
		case 3:
			size = 64; //Case 2 size=64
			break;
		case 4:
			size = 128; //Case 3 size=128
			break;
		case 6:
			size = 256; //Case 4 size=256
			break;
		case 7:
			size = 512; //Case 5 size=512
			break;
		//Case 6 size=1024
		//Case 7 size=2048
		//Case 8 size=4096
		default:
			size = 32;
	}
	//Create Terrain Color Texture
	await bmpf_loadscreen('Initialing');
	G.ter_tex_color = CreateTexture(ctexsize, ctexsize);
	//Initiale Terrain and Environment
	e_terrain(size, 'generated');
	e_environment();

	//### Generate Hills
	await bmpf_loadscreen('Generating Terrain');
	//Set Seaground
	seaground = f32(0.45);
	for (x = 0; x <= size; x++) {
		for (z = 0; z <= size; z++) {
			ModifyTerrain(G.ter, x, z, seaground);
		}
	}
	//Set Landground
	landground = f32(0.55);
	hdif = f32(landground - seaground);
	c = idivConst(size, 2);
	h = idivConst(size, 2) - 2;
	coast = h;
	switch (size) {
		case 16:
			coast = coast - 1;
			break;
		case 32:
			coast = coast - 3;
			break;
		case 64:
			coast = coast - 5;
			break;
		default:
			coast = coast - 7;
	}
	for (x = 2; x <= size - 2; x++) {
		for (z = 2; z <= size - 2; z++) {
			//Distance
			dist = Int(Sqr(f32(fpow(c - x, 2) + fpow(c - z, 2))));
			//Land Cirlce?
			if (dist < h) {
				//Coast Area? -> slope
				if (dist > coast) {
					perc = f32((dist - coast) / (h - coast));
					perc = f32(1 - perc);
					ModifyTerrain(G.ter, x, z, f32(seaground + f32(perc * hdif)));
					//Mainland
				} else {
					ModifyTerrain(G.ter, x, z, landground);
				}
			}
		}
	}
	//General Island Transforming
	transc = Rand(15, 25);
	transmin = idiv(h, 5);
	transmax = idivConst(h, 2);
	for (i = 1; i <= transc; i++) {
		angle = Rnd(0, 360);
		x = Int(f32(c + f32(Sin(angle) * coast)));
		z = Int(f32(c - f32(Cos(angle) * coast)));
		if (Rand(1, 2) === 1) {
			editor_genmap_hill(x, z, Rand(transmin, transmax), size, landground);
		} else {
			editor_genmap_hill(x, z, Rand(transmin, transmax), size, seaground);
		}
	}
	e_terraindistort(f32(0.05));

	//Modifications Based on Landscape Type
	switch (G.in_opt[4]) {
		//Normal
		case 0:
			for (x = 1; x <= size - 1; x++) {
				for (z = 1; z <= size - 1; z++) {
					if (Rand(3) === 1) e_terrainrandom(x, z, f32(0.03));
				}
			}
			for (i = 1; i <= 5; i++) e_terrainsmooth();
			break;
		//Hilly/Desert/Snow
		case 1:
		case 3:
		case 4:
			for (i = 1; i <= 3; i++) e_terrainsmooth();
			for (x = 1; x <= size - 1; x++) {
				for (z = 1; z <= size - 1; z++) {
					if (Rand(3) === 1) e_terrainrandom(x, z, f32(0.05));
				}
			}
			for (i = 1; i <= 3; i++) e_terrainsmooth();
			break;
		//Mountains
		case 2:
			for (x = 4; x <= size - 4; x++) {
				for (z = 4; z <= size - 4; z++) {
					ModifyTerrain(G.ter, x, z, f32(0.6));
				}
			}
			for (i = 1; i <= 5; i++) e_terrainsmooth();
			for (x = 1; x <= size - 1; x++) {
				for (z = 1; z <= size - 1; z++) {
					if (Rand(3) === 1) e_terrainrandom(x, z, f32(0.25));
				}
			}
			for (i = 1; i <= 3; i++) e_terrainsmooth();
			break;
		//Swamp
		case 5:
			for (x = 1; x <= size - 1; x++) {
				for (z = 1; z <= size - 1; z++) {
					if (Rand(3) === 1) e_terrainrandom(x, z, f32(0.05));
				}
			}
			for (x = 1; x <= size - 1; x++) {
				for (z = 1; z <= size - 1; z++) {
					if (Rand(5) === 1) e_terrainrandom(x, z, f32(0.2), -1);
				}
			}
			for (i = 1; i <= 2; i++) e_terrainsmooth();
			break;
	}
}

/** Function editor_genmap_hill(cx,cz,size,tersize,h#) */
export function editor_genmap_hill(cx: number, cz: number, size: number, tersize: number, h: number): void {
	let x = 0;
	let z = 0;
	let dist = 0;
	size = idivConst(size, 2);
	if (size < 1) size = 1;
	for (x = cx - size; x <= cx + size; x++) {
		for (z = cz - size; z <= cz + size; z++) {
			if (x >= 2 && x <= tersize - 2) {
				if (z >= 2 && z <= tersize - 2) {
					dist = Int(Sqr(f32(fpow(cx - x, 2) + fpow(cz - z, 2))));
					if (dist < size) {
						ModifyTerrain(G.ter, x, z, h);
					}
				}
			}
		}
	}
}

//############################################ Generate Color Map
/** Function editor_gencolormap(updatecolorset=1) */
export async function editor_gencolormap(updatecolorset: number = 1): Promise<void> {
	let ctexsize = 0;
	let size = 0;
	let h = 0;
	let a = 0;
	let r = 0;
	let g = 0;
	let b = 0;
	let r2 = 0;
	let g2 = 0;
	let b2 = 0;
	let rgb = 0;
	let texsize = 0;
	let rx = 0;
	let ry = 0;
	let fac = 0;
	let x = 0;
	let y = 0;

	if (G.m_section === Csection_editor) await bmpf_loadscreen('Generating Colormap');
	ctexsize = TextureHeight(G.ter_tex_color);
	size = G.ter_size;
	if (updatecolorset === 1) {
		//Set Colorset: Normal
		//e_tercol(230,223,145,0)
		//e_tercol(69,138,13,1)
		//e_tercol(160,172,125,2)
		e_tercol(G.game_tercol[0][0], G.game_tercol[1][0], G.game_tercol[2][0], 0);
		e_tercol(G.game_tercol[3][0], G.game_tercol[4][0], G.game_tercol[5][0], 1);
		e_tercol(G.game_tercol[6][0], G.game_tercol[7][0], G.game_tercol[8][0], 2);
		switch (G.in_opt[4]) {
			//Set Colorset: Desert
			case 3:
				//e_tercol(230,223,145,0)
				//e_tercol(254,243,118,1)
				//e_tercol(245,204,61,2)
				e_tercol(G.game_tercol[0][1], G.game_tercol[1][1], G.game_tercol[2][1], 0);
				e_tercol(G.game_tercol[3][1], G.game_tercol[4][1], G.game_tercol[5][1], 1);
				e_tercol(G.game_tercol[6][1], G.game_tercol[7][1], G.game_tercol[8][1], 2);
				break;
			//Set Colorset: Snow
			case 4:
				//e_tercol(200,224,230,0)
				//e_tercol(255,255,255,1)
				//e_tercol(100,100,100,2)
				e_tercol(G.game_tercol[0][2], G.game_tercol[1][2], G.game_tercol[2][2], 0);
				e_tercol(G.game_tercol[3][2], G.game_tercol[4][2], G.game_tercol[5][2], 1);
				e_tercol(G.game_tercol[6][2], G.game_tercol[7][2], G.game_tercol[8][2], 2);
				break;
			//Set Colorset: Swamp
			case 5:
				//e_tercol(159,206,0,0)
				//e_tercol(135,174,0,1)
				//e_tercol(70,104,72,2)
				e_tercol(G.game_tercol[0][3], G.game_tercol[1][3], G.game_tercol[2][3], 0);
				e_tercol(G.game_tercol[3][3], G.game_tercol[4][3], G.game_tercol[5][3], 1);
				e_tercol(G.game_tercol[6][3], G.game_tercol[7][3], G.game_tercol[8][3], 2);
				break;
		}
	}
	SetBuffer(TextureBuffer(G.ter_tex_color)!);
	texsize = ctexsize - 1;
	rx = -(idivConst(size, 2) * Cworld_size);
	ry = -(idivConst(size, 2) * Cworld_size);
	fac = f32((size * Cworld_size) / ctexsize);
	r2 = G.in_tercol[0][1];
	g2 = G.in_tercol[1][1];
	b2 = G.in_tercol[2][1];

	if (G.m_section === Csection_editor) UpdateWorld();

	for (x = 0; x <= texsize; x++) {
		for (y = 0; y <= texsize; y++) {
			//Get Height
			h = f32(f32(TerrainY(G.ter, f32(rx + f32(x * fac)), 0, f32(ry + f32(y * fac))) / Cworld_height) + 0.5);

			//Normal Height
			a = 1;
			r = G.in_tercol[0][1];
			g = G.in_tercol[1][1];
			b = G.in_tercol[2][1];

			//Deep
			if (h < f32(0.52)) {
				if (h >= 0.5) a = f32(f32(h - 0.5) / f32(0.02));
				r = G.in_tercol[0][0];
				g = G.in_tercol[1][0];
				b = G.in_tercol[2][0];

				//High
			} else if (h > f32(0.55)) {
				if (h <= f32(0.6)) a = f32(1 - f32(f32(h - f32(0.55)) / f32(0.05)));
				r = G.in_tercol[0][2];
				g = G.in_tercol[1][2];
				b = G.in_tercol[2][2];
			}

			//Random Color Modification
			r = r + Rand(-5, 5);
			g = g + Rand(-5, 5);
			b = b + Rand(-5, 5);
			if (r < 0) {
				r = 0;
			} else if (r > 255) {
				r = 255;
			}
			if (g < 0) {
				g = 0;
			} else if (g > 255) {
				g = 255;
			}
			if (b < 0) {
				b = 0;
			} else if (b > 255) {
				b = 255;
			}

			//Draw Normal
			if (a === 1) {
				rgb = (255 * 0x1000000 + r * 0x10000 + g * 0x100 + b) | 0;
				WritePixel(x, y, rgb);
				//Draw Alphamixed
			} else {
				editor_gencolormap_apm(r, g, b, r2, g2, b2, a, x, y);
			}

			//RED DEBUG PIXELS
			//If x Mod 4=0 And y Mod 4=0 Then
			//	WritePixelFast x,y,$FFFF0000
			//	test=CreateCube()
			//	PositionEntity test,rx+(x*fac#),TerrainY(ter,rx+(x*fac#),0,ry+(y*fac#)),ry+(y*fac#)
			//EndIf
		}
	}

	SetBuffer(BackBuffer());
	envColormapFromTexture(); // layer: the terrain is drawn from the layer's copy of ter_tex_color
}

//############################################ Draw Alpha Pixel Mixed for editor_gencolormap Function
/** Function editor_gencolormap_apm(r#,g#,b#,r2#,g2#,b2#,a#,x,y) */
export function editor_gencolormap_apm(r: number, g: number, b: number, r2: number, g2: number, b2: number, a: number, x: number, y: number): void {
	let nr = Int(f32(f32(r2 * a) + f32(r * f32(1 - a))));
	let ng = Int(f32(f32(g2 * a) + f32(g * f32(1 - a))));
	let nb = Int(f32(f32(b2 * a) + f32(b * f32(1 - a))));
	let rgb = 0;
	if (nr < 0) {
		nr = 0;
	} else if (nr > 255) {
		nr = 255;
	}
	if (ng < 0) {
		ng = 0;
	} else if (ng > 255) {
		ng = 255;
	}
	if (nb < 0) {
		nb = 0;
	} else if (nb > 255) {
		nb = 255;
	}
	rgb = (255 * 0x1000000 + nr * 0x10000 + ng * 0x100 + nb) | 0;
	WritePixel(x, y, rgb);
}

//############################################ Set Dummy
/** Function editor_setdummy(class,typ) */
export function editor_setdummy(class_: number, typ: number): void {
	// quirk: the freed dummy stays in in_editor_dummy when class matches no Case; the EntityFX below then hits a freed entity
	if (G.in_editor_dummy !== null) FreeEntity(G.in_editor_dummy);
	switch (class_) {
		case Cclass_object:
			load_object_model(typ);
			G.in_editor_dummy = CopyEntity(Dobject_modelh(typ));
			ScaleEntity(G.in_editor_dummy, Dobject_size(typ, 0), Dobject_size(typ, 1), Dobject_size(typ, 2));
			break;
		case Cclass_unit:
			G.in_editor_dummy = CopyEntity(Dunit_modelh(typ));
			ScaleEntity(G.in_editor_dummy, Dunit_size(typ, 0), Dunit_size(typ, 1), Dunit_size(typ, 2));
			break;
		case Cclass_item:
			load_item_model(typ);
			if (Ditem_modelh(typ) !== null) {
				G.in_editor_dummy = CopyEntity(Ditem_modelh(typ));
			} else {
				G.in_editor_dummy = CopyEntity(G.game_defaultitemmodel);
			}
			ScaleEntity(G.in_editor_dummy, Ditem_size(typ, 0), Ditem_size(typ, 1), Ditem_size(typ, 2));
			break;
		case Cclass_info:
			G.in_editor_dummy = CreateCube();
			ScaleEntity(G.in_editor_dummy, 5, 5, 5);
			break;
	}
	EntityFX(G.in_editor_dummy, 16);
	EntityBlend(G.in_editor_dummy, 3);
	EntityColor(G.in_editor_dummy, 0, 255, 0);
}

//############################################ Set Mode
/** Function editor_setmode(mode,picking=1) */
export function editor_setmode(mode: number, picking: number = 1): void {
	switch (mode) {
		//0 - Terrain
		case 0:
			if (picking) editor_picking(0);
			break;
		//1 - Objects
		case Cclass_object:
			if (G.object_count === 0) RuntimeError('No objects defined!');
			if (picking) editor_picking(Cclass_object);
			editor_setdummy(Cclass_object, G.in_object_sel);
			break;
		//2 - Units
		case Cclass_unit:
			if (picking) editor_picking(Cclass_unit);
			editor_setdummy(Cclass_unit, G.in_unit_sel);
			break;
		//3 - Items
		case Cclass_item:
			if (G.item_count === 0) RuntimeError('No items defined!');
			if (picking) editor_picking(Cclass_item);
			editor_setdummy(Cclass_item, G.in_item_sel);
			break;
		//4 - Infos
		case Cclass_info:
			if (picking) editor_picking(Cclass_info);
			editor_setdummy(Cclass_info, G.in_info_sel);
			break;
	}
	FlushKeys();
}

//############################################ Set Default Map Settings
/** Function editor_defaultmapsettings() */
export function editor_defaultmapsettings(): void {
	//Time
	G.map_day = 1;
	G.map_hour = 9;
	G.map_minute = 0;
	G.map_freezetime = 0;
	//Sky
	G.map_skybox = 'sky';
	//MP
	G.map_multiplayer = 0;
	//Climate
	G.map_climate = 0;
	//Music
	G.map_music = 'amb_jungle.mp3';
	//Fog
	G.map_fog[0] = 255 - 50;
	G.map_fog[1] = 255 - 45;
	G.map_fog[2] = 255 - 10;
	G.map_fog[3] = 0;
	//Briefing
	G.map_briefing = '';
	//PW
	G.map_password = '';
}

//############################################ Fill Buffer with Texture
/** Function editor_textobuffer(tex) */
export function editor_textobuffer(tex: Texture | null): void {
	let size = 0;
	let x = 0;
	let y = 0;
	size = TextureHeight(tex);
	if (G.in_editor_buffer !== 0) FreeImage(G.in_editor_buffer);
	G.in_editor_buffer = CreateImage(size, size);
	LockBuffer(TextureBuffer(tex)!);
	LockBuffer(ImageBuffer(G.in_editor_buffer));
	for (x = 0; x <= size - 1; x++) {
		for (y = 0; y <= size - 1; y++) {
			CopyPixelFast(x, y, TextureBuffer(tex)!, x, y, ImageBuffer(G.in_editor_buffer));
		}
	}
	UnlockBuffer(TextureBuffer(tex)!);
	UnlockBuffer(ImageBuffer(G.in_editor_buffer));
	if (tex === G.ter_tex_color) envColormapFromTexture(); // layer: its copy of the colour map
}

//############################################ Fill Texture with Buffer
/** Function editor_buffertotex(tex) */
export function editor_buffertotex(tex: Texture | null): void {
	let size = 0;
	let x = 0;
	let y = 0;
	size = TextureHeight(tex);
	LockBuffer(TextureBuffer(tex)!);
	LockBuffer(ImageBuffer(G.in_editor_buffer));
	for (x = 0; x <= size - 1; x++) {
		for (y = 0; y <= size - 1; y++) {
			CopyPixelFast(x, y, ImageBuffer(G.in_editor_buffer), x, y, TextureBuffer(tex)!);
		}
	}
	UnlockBuffer(TextureBuffer(tex)!);
	UnlockBuffer(ImageBuffer(G.in_editor_buffer));
}

//############################################ Buffer to Heightmap
/** Function editor_buffertoheightmap() */
export function editor_buffertoheightmap(): void {
	let size = 0;
	let x = 0;
	let y = 0;
	let rgb = 0;
	let r = 0;
	let h = 0;
	size = ImageHeight(G.in_editor_buffer);
	SetBuffer(ImageBuffer(G.in_editor_buffer));
	LockBuffer(ImageBuffer(G.in_editor_buffer));
	for (x = 0; x <= size - 1; x++) {
		for (y = 0; y <= size - 1; y++) {
			rgb = ReadPixelFast(x, y);
			r = idivConst(rgb & 0xff0000, 0x10000);
			h = f32(r / 255);
			ModifyTerrain(G.ter, x, y, h);
		}
	}
	UnlockBuffer(ImageBuffer(G.in_editor_buffer));
	SetBuffer(BackBuffer());
}

//############################################ Heightmap to Buffer
/** Function editor_heightmaptobuffer() */
export function editor_heightmaptobuffer(): void {
	let size = 0;
	let x = 0;
	let y = 0;
	let h = 0;
	let r = 0;
	let rgb = 0;
	size = TerrainSize(G.ter);
	if (G.in_editor_buffer !== 0) FreeImage(G.in_editor_buffer);
	G.in_editor_buffer = CreateImage(size, size);
	LockBuffer(ImageBuffer(G.in_editor_buffer));
	for (x = 0; x <= size - 1; x++) {
		for (y = 0; y <= size - 1; y++) {
			h = TerrainHeight(G.ter, x, y);
			r = Int(f32(h * 255));
			rgb = (255 * 0x1000000 + r * 0x10000 + r * 0x100 + r) | 0;
			WritePixelFast(x, y, rgb, ImageBuffer(G.in_editor_buffer));
		}
	}
	UnlockBuffer(ImageBuffer(G.in_editor_buffer));
}

//############################################ Grassmap to Buffer
/** Function editor_grassmaptobuffer() */
export function editor_grassmaptobuffer(): void {
	let x = 0;
	let y = 0;
	let rgb = 0;
	let size = 0;
	let r = 0;
	let g = 0;
	let b = 0;
	//Update Grassmap Colors
	SetBuffer(TextureBuffer(G.ter_tex_color)!);
	LockBuffer(TextureBuffer(G.ter_tex_color)!);
	for (x = 0; x <= G.grass_mapsize - 1; x++) {
		for (y = 0; y <= G.grass_mapsize - 1; y++) {
			rgb = ReadPixelFast(x, y);
			G.grass_rgb[x][y][0] = idivConst(rgb & 0xff0000, 0x10000);
			G.grass_rgb[x][y][1] = idivConst(rgb & 0xff00, 0x100);
			G.grass_rgb[x][y][2] = rgb & 0xff;
		}
	}
	UnlockBuffer(TextureBuffer(G.ter_tex_color)!);
	//Save to Buffer
	size = G.grass_mapsize;
	if (G.in_editor_buffer !== 0) FreeImage(G.in_editor_buffer);
	G.in_editor_buffer = CreateImage(size, size);
	SetBuffer(ImageBuffer(G.in_editor_buffer));
	LockBuffer(ImageBuffer(G.in_editor_buffer));
	for (x = 0; x <= size - 1; x++) {
		for (y = 0; y <= size - 1; y++) {
			if (G.grass_rgb[x][y][3] === 1) {
				r = G.grass_rgb[x][y][0];
				g = G.grass_rgb[x][y][1];
				b = G.grass_rgb[x][y][2];
			} else {
				r = 255;
				g = 0;
				b = 255;
			}
			rgb = (255 * 0x1000000 + r * 0x10000 + g * 0x100 + b) | 0;
			WritePixelFast(x, y, rgb);
		}
	}
	UnlockBuffer(ImageBuffer(G.in_editor_buffer));
	SetBuffer(BackBuffer());
}

//############################################ Buffer Win
/** Function editor_bufferwin(x,y,w,h) */
export function editor_bufferwin(x: number, y: number, w: number, h: number): void {
	let mx = 0;
	let my = 0;
	let size = 0;
	let zx = 0;
	let i = 0;
	let zy = 0;
	let brush = 0;
	let grey = 0;
	Color(0, 0, 0);
	Rect(x - 1, y - 1, w + 2, h + 2, 1);
	size = ImageHeight(G.in_editor_buffer);
	//Zoomed or normal?
	if (G.in_edzoom > 1) {
		//Setup Zoom Buffer
		if (G.in_editor_bufferz === 0) {
			G.in_editor_bufferz = CreateImage(size * G.in_edzoom, size * G.in_edzoom);
		} else if (ImageHeight(G.in_editor_bufferz) !== size * G.in_edzoom) {
			FreeImage(G.in_editor_bufferz);
			G.in_editor_bufferz = CreateImage(size * G.in_edzoom, size * G.in_edzoom);
		}
		//Zoom!
		for (zx = 0; zx <= size; zx++) {
			for (i = 0; i <= G.in_edzoom; i++) {
				CopyRect(zx, 0, 1, size, zx * G.in_edzoom + i, 0, ImageBuffer(G.in_editor_buffer), ImageBuffer(G.in_editor_bufferz));
			}
		}
		for (zy = size; zy >= 0; zy += -1) {
			for (i = 0; i <= G.in_edzoom; i++) {
				CopyRect(0, zy, size * G.in_edzoom, 1, 0, zy * G.in_edzoom + i, ImageBuffer(G.in_editor_bufferz), ImageBuffer(G.in_editor_bufferz));
			}
		}
		//Draw Zoomed
		DrawBlockRect(G.in_editor_bufferz, x, y, G.in_editor_bufferx, G.in_editor_buffery, w, h);
	} else {
		//Draw Normal
		DrawBlockRect(G.in_editor_buffer, x, y, G.in_editor_bufferx, G.in_editor_buffery, w, h);
	}
	//Cache
	brush = G.in_edbrush;
	if (G.in_edbrush < 3) brush = 3;
	//In Area?
	if (G.in_mx >= x) {
		if (G.in_my >= y) {
			if (G.in_mx <= x + w) {
				if (G.in_my <= y + h) {
					//Modify Brush
					if (G.in_mzs !== 0) {
						G.in_edbrush = Int(f32(G.in_edbrush + G.in_mzs));
						if (G.in_edbrush > 99) G.in_edbrush = 99;
						if (G.in_edbrush < 0) G.in_edbrush = 0;
					}
					//Cache
					brush = G.in_edbrush;
					if (G.in_edbrush < 3) brush = 3;
					//Scroll Around with Right Mouse Button
					if (G.in_mdown[2]) {
						G.in_cursorf = 2;
						G.in_editor_bufferx = Int(f32(G.in_editor_bufferx + G.in_mxs));
						G.in_editor_buffery = Int(f32(G.in_editor_buffery - G.in_mys));
					} else {
						G.in_cursorf = -1;
						Color(255, 255, 255);
						Oval(G.in_mx - idivConst(brush, 2) * G.in_edzoom, G.in_my - idivConst(brush, 2) * G.in_edzoom, brush * G.in_edzoom, brush * G.in_edzoom, 0);
					}

					//Stuff
					mx = idiv(G.in_mx - x + G.in_editor_bufferx, G.in_edzoom);
					my = idiv(G.in_my - y + G.in_editor_buffery, G.in_edzoom);
					switch (G.m_menu) {
						//Heightmap
						case Cmenu_ed_heightmap:
						case Cmenu_ed_heightmap + 1:
							if (((G.in_mdown[1] & ((G.in_mxs !== 0 ? 1 : 0) | (G.in_mys !== 0 ? 1 : 0))) | G.in_mhit[1]) !== 0) {
								grey = Int(f32(G.in_slider[0] * f32(2.55)));
								switch (G.in_edtool) {
									case 0:
										editor_bufferpaint(mx, my, brush, grey, grey, grey, 0, G.in_slider[10]);
										break;
									case 1:
										editor_bufferpaint(mx, my, brush, grey, grey, grey, 1, G.in_slider[10]);
										break;
									case 2:
										editor_buffergamma(mx, my, brush, 1, f32(G.in_slider[10] / 10));
										break;
									case 3:
										editor_buffergamma(mx, my, brush, 0, f32(G.in_slider[10] / 10));
										break;
									case 4:
										editor_buffergetcolor(mx, my);
										break;
								}
							}
							break;
						//Colormap
						case Cmenu_ed_colormap:
							if (((G.in_mdown[1] & ((G.in_mxs !== 0 ? 1 : 0) | (G.in_mys !== 0 ? 1 : 0))) | G.in_mhit[1]) !== 0) {
								switch (G.in_edtool) {
									case 0:
										editor_bufferpaint(mx, my, brush, G.in_col[0], G.in_col[1], G.in_col[2], 0, G.in_slider[10]);
										break;
									case 1:
										editor_bufferpaint(mx, my, brush, G.in_col[0], G.in_col[1], G.in_col[2], 1, G.in_slider[10]);
										break;
									case 2:
										editor_buffergamma(mx, my, brush, 1, f32(G.in_slider[10] / 10));
										break;
									case 3:
										editor_buffergamma(mx, my, brush, 0, f32(G.in_slider[10] / 10));
										break;
									case 4:
										editor_buffergetcolor(mx, my);
										break;
								}
							}
							break;
						//Grassmap
						case Cmenu_ed_grassmap:
							if (((G.in_mdown[1] & ((G.in_mxs !== 0 ? 1 : 0) | (G.in_mys !== 0 ? 1 : 0))) | G.in_mhit[1]) !== 0) {
								editor_bufferpaintgrassmap(mx, my, brush);
							}
							break;
					}
				}
			}
		}
	}
}

//############################################ Buffer Paint
/** Function editor_bufferpaint(x,y,size,r,g,b,spray=0,a#) */
export function editor_bufferpaint(x: number, y: number, size: number, r: number, g: number, b: number, spray: number = 0, a: number): void {
	let bsize = 0;
	let rad = 0;
	let sx = 0;
	let sy = 0;
	let ex = 0;
	let ey = 0;
	let rx = 0;
	let ry = 0;
	let rgb = 0;
	let r2 = 0;
	let g2 = 0;
	let b2 = 0;
	let dist = 0;
	let perc = 0;
	bsize = ImageHeight(G.in_editor_buffer);
	SetBuffer(ImageBuffer(G.in_editor_buffer));
	LockBuffer(ImageBuffer(G.in_editor_buffer));
	rad = idivConst(size, 2);
	sx = x - rad;
	sy = y - rad;
	ex = x + rad;
	ey = y + rad;
	rx = x;
	ry = y;
	a = f32(a / 100);
	a = f32(1 - a);
	for (x = sx; x <= ex; x++) {
		for (y = sy; y <= ey; y++) {
			if (x >= 0) {
				if (y >= 0) {
					if (x < bsize) {
						if (y < bsize) {
							dist = Sqr(f32(fpow(x - rx, 2) + fpow(y - ry, 2)));
							if (dist < rad) {
								// Or evaluates both sides: Rand(10) is drawn for every pixel, also without spray
								if (((spray === 0 ? 1 : 0) | (Rand(10) === 1 ? 1 : 0)) !== 0) {
									perc = f32(dist / rad);
									if (perc < a) perc = a;
									if (perc < 0) perc = 0;
									if (perc > 1) perc = 1;
									rgb = ReadPixelFast(x, y);
									r2 = idivConst(rgb & 0xff0000, 0x10000);
									g2 = idivConst(rgb & 0xff00, 0x100);
									b2 = rgb & 0xff;
									editor_bufferpaint_apm(r, g, b, r2, g2, b2, perc, x, y);
								}
							}
						}
					}
				}
			}
		}
	}
	UnlockBuffer(ImageBuffer(G.in_editor_buffer));
	SetBuffer(BackBuffer());
}

//############################################ Buffer Getcolor
/** Function editor_buffergetcolor(x,y) */
export function editor_buffergetcolor(x: number, y: number): void {
	let r = 0;
	let g = 0;
	let b = 0;
	SetBuffer(ImageBuffer(G.in_editor_buffer));
	GetColor(x, y);
	r = ColorRed();
	g = ColorGreen();
	b = ColorBlue();

	if (G.m_menu === Cmenu_ed_colormap) {
		G.in_col[0] = r;
		G.in_col[1] = g;
		G.in_col[2] = b;
	} else if (G.m_menu === Cmenu_ed_heightmap) {
		G.in_slider[0] = Int(f32(r / f32(2.55)));
	}

	SetBuffer(BackBuffer());
}

//############################################ Buffer Gamma
/** Function editor_buffergamma(x,y,size,mode,power#=10.) */
export function editor_buffergamma(x: number, y: number, size: number, mode: number, power: number = 10): void {
	let bsize = 0;
	let rad = 0;
	let sx = 0;
	let sy = 0;
	let ex = 0;
	let ey = 0;
	let rx = 0;
	let ry = 0;
	let rgb = 0;
	let r = 0;
	let g = 0;
	let b = 0;
	let dist = 0;
	let perc = 0;
	const spray = 0; // quirk: not a parameter here (copied from editor_bufferpaint): an undeclared local, always 0
	bsize = ImageHeight(G.in_editor_buffer);
	SetBuffer(ImageBuffer(G.in_editor_buffer));
	LockBuffer(ImageBuffer(G.in_editor_buffer));
	rad = idivConst(size, 2);
	sx = x - rad;
	sy = y - rad;
	ex = x + rad;
	ey = y + rad;
	rx = x;
	ry = y;
	for (x = sx; x <= ex; x++) {
		for (y = sy; y <= ey; y++) {
			if (x >= 0) {
				if (y >= 0) {
					if (x < bsize) {
						if (y < bsize) {
							dist = Sqr(f32(fpow(x - rx, 2) + fpow(y - ry, 2)));
							if (dist < rad) {
								// Or evaluates both sides: Rand(10) is drawn for every pixel
								if (((spray === 0 ? 1 : 0) | (Rand(10) === 1 ? 1 : 0)) !== 0) {
									perc = f32(dist / rad);
									if (perc > 1) perc = 1;
									perc = f32(1 - perc);
									rgb = ReadPixelFast(x, y);
									r = idivConst(rgb & 0xff0000, 0x10000);
									g = idivConst(rgb & 0xff00, 0x100);
									b = rgb & 0xff;
									if (mode === 1) {
										r = Int(f32(r + f32(power * perc)));
										g = Int(f32(g + f32(power * perc)));
										b = Int(f32(b + f32(power * perc)));
										if (r > 255) r = 255;
										if (g > 255) g = 255;
										if (b > 255) b = 255;
									} else {
										r = Int(f32(r - f32(power * perc)));
										g = Int(f32(g - f32(power * perc)));
										b = Int(f32(b - f32(power * perc)));
										if (r < 0) r = 0;
										if (g < 0) g = 0;
										if (b < 0) b = 0;
									}
									rgb = (255 * 0x1000000 + r * 0x10000 + g * 0x100 + b) | 0;
									WritePixelFast(x, y, rgb);
								}
							}
						}
					}
				}
			}
		}
	}
	UnlockBuffer(ImageBuffer(G.in_editor_buffer));
	SetBuffer(BackBuffer());
}

//############################################ Buffer Paint Grassmap
/** Function editor_bufferpaintgrassmap(x,y,size) */
export function editor_bufferpaintgrassmap(x: number, y: number, size: number): void {
	let bsize = 0;
	let rad = 0;
	let sx = 0;
	let sy = 0;
	let ex = 0;
	let ey = 0;
	let rx = 0;
	let ry = 0;
	let rgb = 0;
	let r = 0;
	let g = 0;
	let b = 0;
	let dist = 0;
	bsize = ImageHeight(G.in_editor_buffer);
	SetBuffer(ImageBuffer(G.in_editor_buffer));
	LockBuffer(ImageBuffer(G.in_editor_buffer));
	rad = idivConst(size, 2);
	sx = x - rad;
	sy = y - rad;
	ex = x + rad;
	ey = y + rad;
	rx = x;
	ry = y;
	for (x = sx; x <= ex; x++) {
		for (y = sy; y <= ey; y++) {
			if (x >= 0) {
				if (y >= 0) {
					if (x < bsize) {
						if (y < bsize) {
							dist = Sqr(f32(fpow(x - rx, 2) + fpow(y - ry, 2)));
							if (dist < rad) {
								//Toolbased Change
								if (G.in_edtool === 0) {
									G.grass_rgb[x][y][3] = G.in_edgrassmode;
								} else {
									if (Rand(5) === 1) G.grass_rgb[x][y][3] = G.in_edgrassmode;
								}

								//Draw
								if (G.grass_rgb[x][y][3] === 1) {
									r = G.grass_rgb[x][y][0];
									g = G.grass_rgb[x][y][1];
									b = G.grass_rgb[x][y][2];
								} else {
									r = 255;
									g = 0;
									b = 255;
								}
								rgb = (255 * 0x1000000 + r * 0x10000 + g * 0x100 + b) | 0;
								WritePixelFast(x, y, rgb);
							}
						}
					}
				}
			}
		}
	}
	UnlockBuffer(ImageBuffer(G.in_editor_buffer));
	SetBuffer(BackBuffer());
}

//############################################ Draw Alpha Pixel Mixed for bufferpaint Function
/** Function editor_bufferpaint_apm(r#,g#,b#,r2#,g2#,b2#,a#,x,y) */
export function editor_bufferpaint_apm(r: number, g: number, b: number, r2: number, g2: number, b2: number, a: number, x: number, y: number): void {
	// quirk: no clamping to 0..255 here (editor_gencolormap_apm has it)
	const nr = Int(f32(f32(r2 * a) + f32(r * f32(1 - a))));
	const ng = Int(f32(f32(g2 * a) + f32(g * f32(1 - a))));
	const nb = Int(f32(f32(b2 * a) + f32(b * f32(1 - a))));
	const rgb = (255 * 0x1000000 + nr * 0x10000 + ng * 0x100 + nb) | 0;
	WritePixelFast(x, y, rgb);
}

//############################################ Get Skybox out of Filename
/** Function editor_getskybox$(name$) */
export function editor_getskybox(name: string): string {
	let s = 0;
	//Is Skybox File?
	s = Instr(name, '_bk.');
	if (s === 0) s = Instr(name, '_dn.');
	if (s === 0) s = Instr(name, '_do.');
	if (s === 0) s = Instr(name, '_fr.');
	if (s === 0) s = Instr(name, '_lf.');
	if (s === 0) s = Instr(name, '_rt.');
	if (s === 0) s = Instr(name, '_up.');
	//No!
	if (s === 0) {
		return '';
		//Yep!
	} else {
		return Left(name, s - 1);
	}
}

//############################################ Set to Terrain
/** Function editor_settoterrain() */
export function editor_settoterrain(): void {
	let x = 0;
	let z = 0;
	let Tobject_: Tobject | null = null;
	let Tunit_: Tunit | null = null;
	let Titem_: Titem | null = null;

	//Objects
	for (Tobject_ = First(Tobject); Tobject_ !== null; Tobject_ = After(Tobject, Tobject_)) {
		x = EntityX(Tobject_.h);
		z = EntityZ(Tobject_.h);
		PositionEntity(Tobject_.h, x, e_tery(x, z), z);
	}

	//Units
	for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
		x = EntityX(Tunit_.h);
		z = EntityZ(Tunit_.h);
		PositionEntity(Tunit_.h, x, e_tery(x, z), z);
	}

	//Items
	for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
		if (Titem_.parent_id === 0) {
			x = EntityX(Titem_.h);
			z = EntityZ(Titem_.h);
			PositionEntity(Titem_.h, x, e_tery(x, z), z);
		}
	}
}

//############################################ Editor Reset Cam
/** Function editor_resetcam() */
export function editor_resetcam(): void {
	let x = 0;
	let z = 0;
	let y = 0;
	let anglepiv: Handle = null;
	//Position
	x = idivConst(-(G.ter_size * Cworld_size), 2);
	z = idivConst(-(G.ter_size * Cworld_size), 2);
	y = Int(e_tery(x, z));
	if (y < 0) {
		y = 150;
	} else {
		y = y + 150;
	}
	PositionEntity(G.cam, x, y, z);
	//Angle
	anglepiv = CreatePivot();
	PositionEntity(anglepiv, 0, e_tery(0, 0), 0);
	PointEntity(G.cam, anglepiv);
	FreeEntity(anglepiv);
}

//############################################ Editor Range
/** Function editor_range(rx#,ry#,rz#,range) */
export function editor_range(rx: number, ry: number, rz: number, range: number): void {
	let lx1 = 0;
	let ly1 = 0;
	let lx2 = 0;
	let ly2 = 0;
	let p: Handle = null;
	let i = 0;
	if (range === 0) return;
	Color(0, Int(fabs(f32(255 * Cos(G.in_ca)))), 0);
	p = CreatePivot();
	for (i = Int(f32(20 * f32(G.in_ca / 360))); i <= 360; i += 20) {
		PositionEntity(p, rx, ry, rz);
		RotateEntity(p, 0, i, 0);
		MoveEntity(p, 0, 0, range);
		CameraProject(G.cam, EntityX(p), EntityY(p), EntityZ(p));
		lx1 = Int(ProjectedX());
		if (lx1 > 210) {
			ly1 = Int(ProjectedY());
			if (ly1 > 0) {
				PositionEntity(p, rx, ry, rz);
				RotateEntity(p, 0, i + 5, 0);
				MoveEntity(p, 0, 0, range);
				CameraProject(G.cam, EntityX(p), EntityY(p), EntityZ(p));
				lx2 = Int(ProjectedX());
				if (lx2 > 210) {
					ly2 = Int(ProjectedY());
					if (ly2 > 0) {
						Line(lx1, ly1, lx2, ly2);
					}
				}
			}
		}
	}
	FreeEntity(p);
}

//############################################ Editor Paint Colormap
/** Function editor_paintcm(x3d#,z3d#,size,r,g,b) */
export function editor_paintcm(x3d: number, z3d: number, size: number, r: number, g: number, b: number): void {
	let sc3d = 0;
	let sc2d = 0;
	let tfac = 0;
	let x = 0;
	let y = 0;
	let bsize = 0;
	let rad = 0;
	let sx = 0;
	let sy = 0;
	let ex = 0;
	let ey = 0;
	let rx = 0;
	let ry = 0;
	let rgb = 0;
	let r2 = 0;
	let g2 = 0;
	let b2 = 0;
	let dist = 0;
	let perc = 0;
	let a = 0;
	//Translate 3D to 2D Coords
	sc3d = f32(Cworld_size * G.ter_size);
	sc2d = f32(TextureHeight(G.ter_tex_color));
	tfac = f32(sc3d / sc2d);
	x = Int(f32(f32(x3d + f32(sc3d / 2)) / tfac));
	y = Int(f32(f32(z3d + f32(sc3d / 2)) / tfac));
	//con_add("paint @ "+x+"|"+y+"  - fac: "+tfac#)

	//Paint
	bsize = Int(sc2d);
	SetBuffer(TextureBuffer(G.ter_tex_color)!);
	LockBuffer(TextureBuffer(G.ter_tex_color)!);
	rad = idivConst(size, 2);
	sx = x - rad;
	sy = y - rad;
	ex = x + rad;
	ey = y + rad;
	rx = x;
	ry = y;
	a = 0;
	for (x = sx; x <= ex; x++) {
		for (y = sy; y <= ey; y++) {
			if (x >= 0) {
				if (y >= 0) {
					if (x < bsize) {
						if (y < bsize) {
							dist = Sqr(f32(fpow(x - rx, 2) + fpow(y - ry, 2)));
							if (dist < rad) {
								perc = f32(dist / rad);
								if (perc < a) perc = a;
								if (perc < 0) perc = 0;
								if (perc > 1) perc = 1;
								rgb = ReadPixelFast(x, y);
								r2 = idivConst(rgb & 0xff0000, 0x10000);
								g2 = idivConst(rgb & 0xff00, 0x100);
								b2 = rgb & 0xff;
								editor_bufferpaint_apm(r, g, b, r2, g2, b2, perc, x, y);
								//rgb=255*$1000000+r*$10000+g*$100+b
								//WritePixelFast x,y,rgb
							}
						}
					}
				}
			}
		}
	}
	UnlockBuffer(TextureBuffer(G.ter_tex_color)!);
	SetBuffer(BackBuffer());
	envColormapFromTexture(); // layer: the terrain is drawn from the layer's copy of ter_tex_color
}

//############################################ Editor Jump to Object
/** Function editor_jumpto(class,id,dist#=50) */
export function editor_jumpto(class_: number, id: number, dist: number = 50): void {
	let h: Handle = null;
	let i = 0;
	h = parent_h(class_, id);
	if (h !== null) {
		PositionEntity(G.cam, EntityX(h), EntityY(h), EntityZ(h));
		TranslateEntity(G.cam, f32(-dist), f32(dist * 2), f32(-dist));
		PointEntity(G.cam, h);
		for (i = -10; i <= 10; i += 5) {
			p_add(EntityX(h), f32(EntityY(h) + i), EntityZ(h), Cp_shockwave, 30 - Abs(i) * 2, 0.5);
			EntityColor(G.TCp!.h, 0, 255, 0);
		}
	}
	G.m_menu = 0;
}

//############################################ Set FX
/** Function editor_setfx(h) */
export function editor_setfx(h: Handle): void {
	let i = 0;
	for (i = -10; i <= 10; i += 5) {
		p_add(EntityX(h), f32(EntityY(h) + i), EntityZ(h), Cp_shockwave, 30 - Abs(i) * 2, 0.5);
		EntityColor(G.TCp!.h, 0, 255, 0);
	}
}

//############################################ Test Map
/** Function editor_testmap(forcecheckmap=0) */
export async function editor_testmap(forcecheckmap: number = 0): Promise<number> {
	const Cmenu_ed_check = 0; // quirk: no such constant: an undeclared local, always 0 (the menu is closed)
	//Change Menu to Save Stuff of current Menu
	if (forcecheckmap === 0) editor_setmenu(Cmenu_ed_check);

	//Debug on!
	G.set_debug = 1;

	//Forced Checkmap
	if (forcecheckmap === 1) {
		G.m_section = Csection_game_sp;
		G.set_debug_testmap = 1;
		G.set_debug_testmapfile = 'editor\\checkmap';
		await load_map('maps\\editor\\checkmap.s2', '');
		return 1;
	}

	//Use Saved Map File
	if (G.in_edmap !== '') {
		if (await gui_msgdecide(se(206), 0, sm(2), sm(1))) {
			//Save
			if (Instr(G.in_edmap, ':')) {
				await save_map(G.in_edmap + '.s2', 'map', G.map_password);
			} else {
				await save_map('maps\\' + G.in_edmap + '.s2', 'map', G.map_password);
			}
			editor_quit();
			G.m_section = Csection_game_sp;
			G.set_debug_testmap = 1;
			G.set_debug_testmapfile = G.in_edmap;
			if (Instr(G.in_edmap, ':')) {
				await load_map(G.in_edmap + '.s2', G.map_password);
			} else {
				await load_map('maps\\' + G.in_edmap + '.s2', G.map_password);
			}
			return 1;
		}
	}

	//Use Checkmap
	if (await save_map('maps\\editor\\checkmap.s2', 'map', '')) {
		editor_quit();
		G.m_section = Csection_game_sp;
		G.set_debug_testmap = 1;
		G.set_debug_testmapfile = 'editor\\checkmap';
		await load_map('maps\\editor\\checkmap.s2', '');
		return 1;
	} else {
		await gui_msg(se(205), Cbmpf_red);
	}
	return 0;
}

//############################################ Get Skybox out of Filename
/** Function editor_list(class,group$) */
export function editor_list(class_: number, group: string): void {
	let Tgroupl_: Tgroupl | null = null;
	let tmp = '';
	let i = 0;
	if (class_ !== G.ed_current_class || group !== G.ed_current_group) {
		G.ed_current_class = class_;
		G.ed_current_group = group;
		G.ed_current_c = 0;
		for (Tgroupl_ = First(Tgroupl); Tgroupl_ !== null; Tgroupl_ = After(Tgroupl, Tgroupl_)) {
			Delete(Tgroupl, Tgroupl_);
		}
		group = group + ',';
		switch (class_) {
			case Cclass_object:
				for (i = 0; i <= G.Cobject_count; i++) {
					if (Dobject_name(i) !== '') {
						if (Dobject_ined(i) !== 0) {
							tmp = Dobject_group(i) + ',';
							tmp = Replace(tmp, ' ', '');
							if (Instr(tmp, group) > 0 || group === ',') {
								Tgroupl_ = New(Tgroupl);
								Tgroupl_.id = i;
								G.ed_current_c = G.ed_current_c + 1;
							}
						}
					}
				}
				break;
			case Cclass_unit:
				for (i = 0; i <= G.Cunit_count; i++) {
					if (Dunit_name(i) !== '') {
						if (Dunit_ined(i) !== 0) {
							tmp = Dunit_group(i) + ',';
							tmp = Replace(tmp, ' ', '');
							if (Instr(tmp, group) > 0 || group === ',') {
								Tgroupl_ = New(Tgroupl);
								Tgroupl_.id = i;
								G.ed_current_c = G.ed_current_c + 1;
							}
						}
					}
				}
				break;
			case Cclass_item:
				for (i = 0; i <= G.Citem_count; i++) {
					if (Ditem_name(i) !== '') {
						if (Ditem_ined(i) !== 0) {
							tmp = Ditem_group(i) + ',';
							tmp = Replace(tmp, ' ', '');
							if (Instr(tmp, group) > 0 || group === ',') {
								Tgroupl_ = New(Tgroupl);
								Tgroupl_.id = i;
								G.ed_current_c = G.ed_current_c + 1;
							}
						}
					}
				}
				break;
			case Cclass_info:
				for (i = 0; i <= Cinfo_count; i++) {
					if (Dinfo_name(i) !== '') {
						tmp = Dinfo_group(i) + ',';
						tmp = Replace(tmp, ' ', '');
						if (Instr(tmp, group) > 0 || group === ',') {
							Tgroupl_ = New(Tgroupl);
							Tgroupl_.id = i;
							G.ed_current_c = G.ed_current_c + 1;
						}
					}
				}
				break;
		}
	}
}
