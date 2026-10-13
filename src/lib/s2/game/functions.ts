/**
 * includes/functions.bb: the functions that did not exist in a runtime layer,
 * ported line by line (pheight, drawaxes, darkbuffer, meshline, incam, genmap,
 * intime, indailytime, groundpitch, brightness, viewline, cachedata,
 * screenshot). The rest is functions.ported.ts.
 */
import {
	CameraProject,
	CreateCube,
	CreatePivot,
	EntityDistance,
	EntityPickMode,
	EntityPitch,
	EntityRoll,
	EntityVisible,
	EntityX,
	EntityY,
	EntityYaw,
	EntityZ,
	FreeEntity,
	MoveEntity,
	PointEntity,
	PositionEntity,
	ProjectedX,
	ProjectedY,
	RotateEntity,
	ScaleEntity,
	TerrainY,
	type Handle
} from '../bb3d';
import { Int, Rnd, SEP_FIELD, Sqr, Str, f32, fpow, idivConst, imod } from '../blitz';
import {
	BackBuffer,
	Cls,
	Color,
	ColorBlue,
	ColorGreen,
	ColorRed,
	CreateImage,
	DrawImage,
	Flip,
	FreeImage,
	FrontBuffer,
	GetColor,
	ImageBuffer,
	ImageHeight,
	ImageWidth,
	Line,
	LockBuffer,
	Plot,
	ReadPixelFast,
	SaveBuffer,
	SaveImage,
	SetBuffer,
	Text,
	UnlockBuffer,
	WritePixelFast,
	setSaveHandler,
	type ImageHandle
} from '../gfx2d';
import { Cbmpf_yellow, Cclass_unit, Cworld_height, Cworld_size } from './consts';
import { e_tery } from './e_environment.ported';
import { FileType, writeFileBytes } from './files';
import { frame, waitKey } from './flow';
import { zerofill } from './functions.ported';
import { if_msg } from './interface';
import { LoadImage } from './load_functions';
import { G } from './state';
import { After, Delete, First, New, Titem, Tstate, Tunit, Tx, Txc, isNull } from './types';

export * from './functions.ported';

// SaveImage / SaveBuffer (brightness, screenshot): the BMP goes into the writable file system.
setSaveHandler((path, bmp) => {
	writeFileBytes(path, bmp);
});

//############################################ FUNCTIONS

//### Pickedheight
/** Function pheight#() */
export function pheight(): number {
	return e_tery(G.in_px, G.in_pz);
}

//### Draw Axes
/** Function drawaxes(h,size#=20) */
export function drawaxes(h: Handle, size: number = 20): void {
	let piv: Handle = null;
	let rx = 0;
	let ry = 0;
	let rz = 0;
	let rx2d = 0;
	let ry2d = 0;
	piv = CreatePivot();
	rx = EntityX(h);
	ry = EntityY(h);
	rz = EntityZ(h);
	CameraProject(G.cam, rx, ry, rz);
	rx2d = Int(ProjectedX());
	ry2d = Int(ProjectedY());
	RotateEntity(piv, EntityPitch(h, 1), EntityYaw(h, 1), EntityRoll(h, 1));
	//Red Pitch
	Color(255, 0, 0);
	PositionEntity(piv, rx, ry, rz);
	MoveEntity(piv, size, 0, 0);
	CameraProject(G.cam, EntityX(piv), EntityY(piv), EntityZ(piv));
	Line(rx2d, ry2d, ProjectedX(), ProjectedY());
	//Blue Roll
	Color(0, 0, 255);
	PositionEntity(piv, rx, ry, rz);
	MoveEntity(piv, 0, 0, size);
	CameraProject(G.cam, EntityX(piv), EntityY(piv), EntityZ(piv));
	Line(rx2d, ry2d, ProjectedX(), ProjectedY());
	//Green Yaw
	Color(0, 255, 0);
	PositionEntity(piv, rx, ry, rz);
	MoveEntity(piv, 0, size, 0);
	CameraProject(G.cam, EntityX(piv), EntityY(piv), EntityZ(piv));
	Line(rx2d, ry2d, ProjectedX(), ProjectedY());
	// quirk: piv is never freed (one pivot leaks per call)
}

//### Dark Backbuffer
/** Function darkbuffer() */
export function darkbuffer(): void {
	let x = 0;
	let y = 0;
	let rgb = 0;
	let r = 0;
	let g = 0;
	let b = 0;
	SetBuffer(FrontBuffer());
	LockBuffer(FrontBuffer());
	for (x = 0; x <= G.set_scrx - 1; x++) {
		for (y = 0; y <= G.set_scry - 1; y++) {
			rgb = ReadPixelFast(x, y);
			r = idivConst(rgb & 0xff0000, 0x10000);
			g = idivConst(rgb & 0xff00, 0x100);
			b = rgb & 0xff;
			r = Int(f32((r + 40) / 2.5));
			g = Int(f32((g + 20) / 2.5));
			b = Int(f32((b + 0) / 2.5));
			rgb = r * 0x10000 + g * 0x100 + b;
			WritePixelFast(x, y, rgb);
		}
	}
	UnlockBuffer(FrontBuffer());
	SetBuffer(BackBuffer());
}

//### Meshline
/** Function meshline(x1#,y1#,z1#,x2#,y2#,z2#,thick#=0.3) */
export function meshline(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number, thick: number = f32(0.3)): Handle {
	let s: Handle = null;
	let e: Handle = null;
	let c: Handle = null;
	let dist = 0;
	let h: Handle = null;
	//Start Pivot
	s = CreatePivot();
	PositionEntity(s, x1, y1, z1);
	//End Pivot
	e = CreatePivot();
	PositionEntity(e, x2, y2, z2);
	//Center Pivot
	c = CreatePivot();
	PositionEntity(c, x1, y1, z1);

	//Find Center
	dist = EntityDistance(s, e);
	PointEntity(c, e);
	MoveEntity(c, 0, 0, f32(dist / 2));

	//Cube
	h = CreateCube();
	ScaleEntity(h, thick, thick, f32(dist / 2));
	PositionEntity(h, EntityX(c), EntityY(c), EntityZ(c));
	PointEntity(h, e);

	//p_add(x1#,y1#,z1#,Cp_risingflare,10,3):EntityColor TCp\h,0,255,0
	//p_add(x2#,y2#,z2#,Cp_risingflare,10,3):EntityColor TCp\h,0,255,0
	//p_add(EntityX(c),EntityY(c),EntityZ(c),Cp_risingflare,10,3):EntityColor TCp\h,255,255,0

	//Free
	FreeEntity(s);
	FreeEntity(e);
	FreeEntity(c);

	//Return
	return h;
}

//### Incamrange
/** Function incam(x1#,z1#) */
export function incam(x1: number, z1: number): number {
	if (Sqr(f32(fpow(f32(x1 - EntityX(G.cam)), 2) + fpow(f32(z1 - EntityZ(G.cam)), 2))) < f32(500 * G.set_viewfac)) {
		return 1;
	} else {
		return 0;
	}
}

//### Map
/** Function genmap(size=256) */
export function genmap(size: number = 256): void {
	//Tempvars
	let rx = 0;
	let ry = 0;
	let fac = 0;
	let x = 0;
	let y = 0;
	let h = 0;
	let r = 0;
	let g = 0;
	let b = 0;
	let rgb = 0;
	rx = -(idivConst(G.ter_size, 2) * Cworld_size);
	ry = -(idivConst(G.ter_size, 2) * Cworld_size);
	fac = f32((G.ter_size * Cworld_size) / (size - 1));

	//Free
	if (G.map_mapimage !== 0) {
		FreeImage(G.map_mapimage);
		G.map_mapimage = 0;
	}

	//Create
	G.map_mapimage = CreateImage(size, size);
	SetBuffer(ImageBuffer(G.map_mapimage));
	LockBuffer(ImageBuffer(G.map_mapimage));

	for (x = 0; x <= size - 1; x++) {
		for (y = 0; y <= size - 1; y++) {
			//Color
			h = f32(TerrainY(G.ter, f32(rx + f32(x * fac)), 0, f32(ry + f32(y * fac))) / Cworld_height);
			r = Int(f32(118 + f32(137 * h)));
			g = Int(f32(105 + f32(137 * h)));
			b = Int(f32(52 + f32(137 * h)));
			//Underwater
			if (h < 0) {
				r = idivConst(r * 3 + 41, 4);
				g = idivConst(g * 3 + 221, 4);
				b = idivConst(b * 3 + 241, 4);
			}
			//Grid darken
			if (imod(x, 64) === 0 || imod(y, 64) === 0) {
				r = Int(f32(r / Rnd(1.1, 1.2)));
				g = Int(f32(g / Rnd(1.1, 1.2)));
				b = Int(f32(b / Rnd(1.1, 1.2)));
			} else if (imod(x, 16) === 0 || imod(y, 16) === 0) {
				r = Int(f32(r / Rnd(1.02, 1.05)));
				g = Int(f32(g / Rnd(1.02, 1.05)));
				b = Int(f32(b / Rnd(1.02, 1.05)));
			}
			//Draw
			rgb = (255 * 0x1000000 + r * 0x10000 + g * 0x100 + b) | 0;
			//WritePixelFast x,size-(y+1),rgb
			WritePixelFast(size - (x + 1), y, rgb);
		}
	}

	UnlockBuffer(ImageBuffer(G.map_mapimage));
	SetBuffer(BackBuffer());
}

//### In Time between Curren Map Time and Last Map Time Update?
/** Function intime(day,hour=0,minute=0) */
export function intime(day: number, hour: number = 0, minute: number = 0): number {
	let check = 0;
	let current = 0;
	let lastupdate = 0;
	check = day * 100 * 100 + hour * 100 + minute;
	current = G.map_day * 100 * 100 + G.map_hour * 100 + G.map_minute;
	lastupdate = G.map_lday * 100 * 100 + G.map_lhour * 100 + G.map_lminute;
	//DebugLog "lastupdate: "+lastupdate
	//DebugLog "check: "+check
	//DebugLog "current: "+current
	if (check >= lastupdate) {
		if (check <= current) {
			return 1;
		}
	}
	return 0;
}

//### In Time between Curren Map Time and Last Map Time Update (without days)?
/** Function indailytime(hour,minute=0) */
export function indailytime(hour: number, minute: number = 0): number {
	let check = 0;
	let current = 0;
	let lastupdate = 0;
	check = G.map_day * 100 * 100 + hour * 100 + minute;
	current = G.map_day * 100 * 100 + G.map_hour * 100 + G.map_minute;
	lastupdate = G.map_lday * 100 * 100 + G.map_lhour * 100 + G.map_lminute;
	if (check >= lastupdate) {
		if (check <= current) {
			return 1;
		}
	}
	if (G.map_lday < G.map_day) {
		check = G.map_lday * 100 * 100 + hour * 100 + minute;
		if (check >= lastupdate) {
			if (check <= current) {
				return 1;
			}
		}
	}
	return 0;
}

//### Align Pitch to Ground
/** Function groundpitch#(h,dist#=100) */
export function groundpitch(h: Handle, dist: number = 100): number {
	//Cache
	let rx = 0;
	let ry = 0;
	let rz = 0;
	let ryaw = 0;
	let p1: Handle = null;
	let p2: Handle = null;
	let pitch = 0;
	rx = EntityX(h);
	ry = EntityY(h);
	rz = EntityZ(h);
	ryaw = EntityYaw(h);
	//Setup
	p1 = CreatePivot();
	p2 = CreatePivot();
	//Position Pivot 1
	PositionEntity(p1, rx, ry, rz);
	RotateEntity(p1, 0, ryaw, 0);
	MoveEntity(p1, 0, 0, dist);
	// quirk: this positions p2, not p1: pivot 1 stays at the height of the entity
	PositionEntity(p2, EntityX(p1), e_tery(EntityX(p1), EntityZ(p1)), EntityZ(p1));
	//Position Pivot 2
	PositionEntity(p2, rx, ry, rz);
	RotateEntity(p2, 0, ryaw, 0);
	MoveEntity(p2, 0, 0, f32(-dist));
	PositionEntity(p2, EntityX(p2), e_tery(EntityX(p2), EntityZ(p2)), EntityZ(p2));
	//Get Pitch
	PointEntity(p2, p1);
	pitch = EntityPitch(p2);
	//visualization
	//p_add(EntityX(p1),EntityY(p1),EntityZ(p1),Cp_flames)
	//p_add(EntityX(p2),EntityY(p2),EntityZ(p2),Cp_flames)
	//Free
	FreeEntity(p1);
	FreeEntity(p2);
	//Return Pitch
	return pitch;
}

/** Function brightness(file$,mr,mg,mb,c#) */
export async function brightness(file: string, mr: number, _mg: number, _mb: number, c: number): Promise<void> {
	let img: ImageHandle = 0;
	let w = 0;
	let h = 0;
	let r = 0;
	let g = 0;
	let b = 0;
	let x = 0;
	let y = 0;
	img = LoadImage(file);
	w = ImageWidth(img);
	h = ImageHeight(img);
	SetBuffer(ImageBuffer(img));
	// quirk: "To w" / "To h" run one pixel past the image
	for (x = 0; x <= w; x++) {
		for (y = 0; y <= h; y++) {
			GetColor(x, y);
			r = ColorRed();
			g = ColorGreen();
			b = ColorBlue();
			// quirk: all three channels are compared with mr; mg and mb are never used
			if (r !== mr || g !== mr || b !== mr) {
				r = Int(f32(r * c));
				g = Int(f32(g * c));
				b = Int(f32(b * c));
				if (r > 255) r = 255;
				if (g > 255) g = 255;
				if (b > 255) b = 255;
				if (r < 0) r = 0;
				if (g < 0) g = 0;
				if (b < 0) b = 0;
				Color(r, g, b);
				Plot(x, y);
			}
		}
	}
	SetBuffer(BackBuffer());
	Cls();
	DrawImage(img, 200, 200);
	Color(255, 255, 255);
	Text(200, 250, 'brlvl: ' + Str(G.br, 'float'));
	Flip();
	await frame();
	x = await waitKey();
	if (x === 43) {
		G.br = f32(G.br + 0.1);
		await brightness(file, 0, 0, 0, G.br);
		FreeImage(img);
		return;
	}
	if (x === 45) {
		G.br = f32(G.br - 0.1);
		await brightness(file, 0, 0, 0, G.br);
		FreeImage(img);
		return;
	}
	if (x === 32) {
		SaveImage(img, file);
		FreeImage(img);
		return;
	}
	if (x === 120) {
		FreeImage(img);
		return;
	}
}

/** Function viewline(x1#,y1#,z1#,x2#,y2#,z2#) */
export function viewline(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number): number {
	let p1: Handle = null;
	let p2: Handle = null;
	let v = 0;
	p1 = CreateCube();
	PositionEntity(p1, x1, y1, z1);
	EntityPickMode(p1, 2, 1);
	p2 = CreateCube();
	PositionEntity(p2, x2, y2, z2);
	EntityPickMode(p2, 2, 1);
	v = EntityVisible(p1, p2);
	FreeEntity(p1);
	FreeEntity(p2);
	return v;
}

/** Function cachedata(free=1,ot_skills=0,ot_items=0,ot_vars=0,ot_diary=0,ot_states=0,ot_locks=0) */
export function cachedata(free: number = 1, ot_skills: number = 0, ot_items: number = 0, ot_vars: number = 0, ot_diary: number = 0, ot_states: number = 0, ot_locks: number = 0): void {
	let Txc_: Txc | null = null;
	let Tx_: Tx | null = null;
	let Titem_: Titem | null = null;
	let i = 0;
	let Tstate_: Tstate | null = null;
	//Free Old Caches
	if (free === 1) {
		for (Txc_ = First(Txc); Txc_ !== null; Txc_ = After(Txc, Txc_)) {
			Delete(Txc, Txc_);
		}
	}
	//Cache Player Skills?
	if (ot_skills) {
		for (Tx_ = First(Tx); Tx_ !== null; Tx_ = After(Tx, Tx_)) {
			if (Tx_.mode === 5) {
				Txc_ = New(Txc);
				Txc_.typ = Tx_.typ;
				Txc_.parent_class = Tx_.parent_class;
				Txc_.parent_id = Tx_.parent_id;
				Txc_.mode = Tx_.mode;
				Txc_.key = Tx_.key;
				Txc_.value = Tx_.value;
				Txc_.stuff = Tx_.stuff;
			}
		}
	}
	//Cache Player Items?
	if (ot_items) {
		//Items
		for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
			if (Titem_.parent_class === Cclass_unit) {
				if (Titem_.parent_id === G.g_player) {
					Txc_ = New(Txc);
					Txc_.mode = 7;
					Txc_.typ = Titem_.typ;
					Txc_.value = Str(Titem_.count);
				}
			}
		}
		//Quickslot
		for (i = 0; i <= 9; i++) {
			Txc_ = New(Txc);
			Txc_.typ = i;
			Txc_.mode = 8;
			Txc_.value = Str(G.in_quickslot[i]);
		}
		//Weapon and Ammo
		if (!isNull(Tunit, G.g_cplayer)) {
			//Weapon
			Txc_ = New(Txc);
			Txc_.typ = 10;
			Txc_.mode = 8;
			Txc_.value = Str(G.g_cplayer!.player_weapon);
			//Ammo
			Txc_ = New(Txc);
			Txc_.typ = 11;
			Txc_.mode = 8;
			Txc_.value = Str(G.g_cplayer!.player_ammo);
		}
	}
	//Cache Global Vars?
	if (ot_vars) {
		for (Tx_ = First(Tx); Tx_ !== null; Tx_ = After(Tx, Tx_)) {
			if (Tx_.mode === 1) {
				Txc_ = New(Txc);
				Txc_.typ = Tx_.typ;
				Txc_.parent_class = Tx_.parent_class;
				Txc_.parent_id = Tx_.parent_id;
				Txc_.mode = Tx_.mode;
				Txc_.key = Tx_.key;
				Txc_.value = Tx_.value;
				Txc_.stuff = Tx_.stuff;
			}
		}
	}
	//Cache Diary Entries?
	if (ot_diary) {
		for (Tx_ = First(Tx); Tx_ !== null; Tx_ = After(Tx, Tx_)) {
			if (Tx_.mode === 2) {
				Txc_ = New(Txc);
				Txc_.typ = Tx_.typ;
				Txc_.parent_class = Tx_.parent_class;
				Txc_.parent_id = Tx_.parent_id;
				Txc_.mode = Tx_.mode;
				Txc_.key = Tx_.key;
				Txc_.value = Tx_.value;
				Txc_.stuff = Tx_.stuff;
			}
		}
	}
	//Cache Player States
	if (ot_states) {
		for (Tstate_ = First(Tstate); Tstate_ !== null; Tstate_ = After(Tstate, Tstate_)) {
			if (Tstate_.parent_class === Cclass_unit) {
				if (Tstate_.parent_id === G.g_player) {
					Txc_ = New(Txc);
					Txc_.mode = 9;
					Txc_.typ = Tstate_.typ;
					Txc_.parent_class = Tstate_.parent_class;
					Txc_.parent_id = Tstate_.parent_id;
					Txc_.stuff = Str(Tstate_.x, 'float') + SEP_FIELD + Str(Tstate_.y, 'float') + SEP_FIELD + Str(Tstate_.z, 'float');
					Txc_.stuff = Txc_.stuff + SEP_FIELD + Str(Tstate_.fx, 'float') + SEP_FIELD + Str(Tstate_.fy, 'float') + SEP_FIELD + Str(Tstate_.fz, 'float');
					Txc_.stuff = Txc_.stuff + SEP_FIELD + Str(Tstate_.value) + SEP_FIELD + Str(Tstate_.value_f, 'float') + SEP_FIELD + Tstate_.value_s;
					Txc_.stuff = Txc_.stuff + SEP_FIELD + Str(Tstate_.r) + SEP_FIELD + Str(Tstate_.g) + SEP_FIELD + Str(Tstate_.b);
				}
			}
		}
	}
	//Cache Buildlocks
	if (ot_locks) {
		for (Tx_ = First(Tx); Tx_ !== null; Tx_ = After(Tx, Tx_)) {
			if (Tx_.mode === 3) {
				Txc_ = New(Txc);
				Txc_.typ = Tx_.typ;
				Txc_.parent_class = Tx_.parent_class;
				Txc_.parent_id = Tx_.parent_id;
				Txc_.mode = Tx_.mode;
				Txc_.key = Tx_.key;
				Txc_.value = Tx_.value;
				Txc_.stuff = Tx_.stuff;
			}
		}
	}
}

/** Function screenshot(out=1) */
export function screenshot(out: number = 1): void {
	let id = 0;
	let name = '';
	id = 1;
	for (;;) {
		name = 'screen_' + zerofill(Str(id), 5) + '.bmp';
		if (FileType(name) === 0) {
			SaveBuffer(BackBuffer(), name);
			break;
		} else {
			id = id + 1;
		}
	}
	if (out === 1) {
		if_msg("< screenshot saved as '" + name + "' >", Cbmpf_yellow);
	}
}
