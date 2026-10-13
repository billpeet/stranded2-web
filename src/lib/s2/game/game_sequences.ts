/**
 * includes/game_sequences.bb: SEQUENCES (line-by-line port, PORTING_GUIDE.md).
 *
 * Note: `seq_blend` and `seq_start` are both a Global and a Function in the
 * original (separate name spaces in Blitz): the globals are G.seq_blend /
 * G.seq_start, the functions are the exports below.
 */
import {
	CreatePivot,
	EntityAlpha,
	EntityColor,
	EntityPitch,
	EntityRoll,
	EntityX,
	EntityY,
	EntityYaw,
	EntityZ,
	FreeEntity,
	HideEntity,
	MoveEntity,
	PointEntity,
	PositionEntity,
	RotateEntity,
	ShowEntity,
	type Handle
} from '../bb3d';
import { Float, Int, MilliSecs, Str, f32, fgt, flt, idivConst } from '../blitz';
import { BackBuffer, Cls, ClsColor, Color, DrawBlock, DrawImage, FreeImage, ImageBuffer, MidHandle, Rect, SetBuffer } from '../gfx2d';
import { con_add } from './console';
import { Cbmpf_red, Cbmpf_yellow, Cclass_info, Cmenu_if_movie, Cp_flash, Cp_seqfade, Csection_game_sp } from './consts';
import { e_tery } from './e_environment';
import { con_info } from './handle_infos';
import { bmpf_txt, bmpf_txt_c, bmpf_txt_r } from './load_bmpf';
import { load_image } from './load_functions';
import { parent_h, parent_pos } from './parentchild';
import { param, params, parse_comma, parse_emuevent, parse_error, parse_getclass, parse_globalevent, parse_loadscript, parse_param, parse_task } from './parser_functions';
import { p_add, p_kill2d } from './particles';
import { sfx_play } from './sfx';
import { G, dim } from './state';
import { After, Delete, First, New, Tseq, Tx } from './types';

//############################################ SEQUENCES

//### Sequence Blend and Text (2D Stuff)
/** Function seq_blend() */
export function seq_blend(): void {
	//Modify Blend Position
	if (G.seq_blend === 1) {
		if (Int(G.seq_blendp) < 80) {
			G.seq_blendp = f32(G.seq_blendp + f32(2 * G.f));
			if (G.seq_blendp > 80) G.seq_blendp = 80;
		}
	} else {
		if (Int(G.seq_blendp) > 0) {
			G.seq_blendp = f32(G.seq_blendp - f32(2 * G.f));
		}
	}
	//CLS
	if (G.seq_cls === 1) {
		ClsColor(G.seq_cls_r, G.seq_cls_g, G.seq_cls_b);
		Cls();
		ClsColor(0, 0, 0);
	}
	//Image
	if (G.seq_img !== 0) {
		if (G.seq_img_masked === 1) {
			DrawImage(G.seq_img, idivConst(G.set_scrx, 2), idivConst(G.set_scry, 2));
		} else {
			DrawBlock(G.seq_img, idivConst(G.set_scrx, 2), idivConst(G.set_scry, 2));
		}
	}
	//Draw Blend?
	if (Int(G.seq_blendp) > 0) {
		Color(0, 0, 0);
		//Top Blend
		Rect(0, 0, G.set_scrx, G.seq_blendp, 1);
		//Bottom Blend
		Rect(0, f32(G.set_scry - G.seq_blendp), G.set_scrx, G.seq_blendp, 1);
	}
	//Draw Messages
	if (G.m_section === Csection_game_sp) {
		if (G.m_menu === Cmenu_if_movie) {
			if (G.seq_msg[0][0] !== '') bmpf_txt_c(idivConst(G.set_scrx, 2), G.set_scry - 50, G.seq_msg[0][0], Int(G.seq_msg[0][1]));
			if (G.seq_msg[1][0] !== '') bmpf_txt_c(idivConst(G.set_scrx, 2), 30, G.seq_msg[1][0], Int(G.seq_msg[1][1]));
			if (G.seq_msg[2][0] !== '') bmpf_txt_c(idivConst(G.set_scrx, 2), idivConst(G.set_scry, 2) - 10, G.seq_msg[2][0], Int(G.seq_msg[2][1]));
		}
	}
}

//### Sequence Start (called by parse_commands)
/** Function seq_start() */
export function seq_start(): void {
	let Tseq_: Tseq | null = null;
	//Params
	G.seq_blend = 1;
	G.seq_skipable = 0;
	//Blend?
	if (parse_param()) {
		G.seq_blend = Int(param());
		//Skipable?
		if (parse_comma(0)) {
			G.seq_skipable = Int(param());
			if (G.seq_skipable !== 1) {
				G.seq_skipable = 0;
			}
		}
	}
	//Reset Sequence Stuff
	G.seq_cpoint = 0;
	G.seq_cpoint_class = 0;
	G.seq_cpoint_id = 0;
	G.seq_msg = dim('', 2, 1);
	G.seq_tmod = 1;
	G.seq_tabs = 1;
	G.seq_tlast = 0;
	G.seq_cls = 0;
	// quirk: the movement pivots are forgotten, not freed (FreeEntity only happens in seq_cammovement)
	G.seq_cstart = null;
	G.seq_cend = null;
	G.seq_cstartt = 0;
	G.seq_cendt = 0;
	G.seq_hideplayer = 1;
	G.seq_flw_class = 0;
	//Image
	if (G.seq_img !== 0) {
		FreeImage(G.seq_img);
		G.seq_img = 0;
	}
	//Old Seq Stuff
	for (Tseq_ = First(Tseq); Tseq_ !== null; Tseq_ = After(Tseq, Tseq_)) {
		Delete(Tseq, Tseq_);
	}
	//Kill 2D Particles
	p_kill2d();
	//Start
	if (G.m_section === Csection_game_sp) G.m_menu = Cmenu_if_movie;
	G.seq_start = MilliSecs();
	//Activate Sequence Debug?
	if (G.set_debug === 1) {
		G.set_debug_seq = 1;
	}
}

//### Sequence End
/** Function seq_end() */
export function seq_end(): void {
	//End
	if (G.m_menu === Cmenu_if_movie) G.m_menu = 0;
	//Blend off
	G.seq_blend = 0;
	//CLS off
	G.seq_cls = 0;
}

//### Sequence Update (Main Sequence Stuff called by game_setcam)
/** Function seq_update() */
export function seq_update(): void {
	let time = 0;
	let Tseq_: Tseq | null = null;

	//Update Camera and its Movement / Rotation
	seq_cammovement();
	seq_camrotation();

	//Show/Hide Player
	if (G.seq_hideplayer === 1) {
		HideEntity(G.g_cplayer!.mh);
	} else {
		ShowEntity(G.g_cplayer!.mh);
	}

	//Sequence Events
	time = MilliSecs() - G.seq_start + 1;
	//DebugLog "ST: "+time
	for (Tseq_ = First(Tseq); Tseq_ !== null; Tseq_ = After(Tseq, Tseq_)) {
		//Handle if time is come
		if (time > Tseq_.t) {
			//Debug
			if (G.set_debug === 1) {
				if (G.set_debug_seq === 1) con_add('Sequence: ' + Tseq_.event + ' @ ' + Str(Tseq_.t) + ' ms', Cbmpf_yellow);
			}

			switch (Tseq_.event) {
				//End
				case 'end':
					seq_end();
					break;
				//Show a Message
				case 'msg':
					// quirk: the position is not checked (only 0..2 exist)
					G.seq_msg[Tseq_.in[1]][0] = Tseq_.txt[0]; //Text
					G.seq_msg[Tseq_.in[1]][1] = Str(Tseq_.in[0]); //Color
					break;
				//Message Clear
				case 'msgclear':
					if (Tseq_.in[0] === -1) {
						G.seq_msg[0][0] = '';
						G.seq_msg[1][0] = '';
						G.seq_msg[2][0] = '';
					} else {
						G.seq_msg[Tseq_.in[0]][0] = '';
					}
					break;
				//Play a Sound
				case 'sound':
					sfx_play(Tseq_.txt[0], Tseq_.fl[0], Tseq_.fl[1], Tseq_.in[0]);
					break;
				//Set Bar Mode
				case 'bar':
					G.seq_blend = Tseq_.in[0];
					break;
				//Hide Bar
				case 'hidebar':
					G.seq_blend = 0;
					G.seq_blendp = 0;
					break;
				//Show Bar
				case 'showbar':
					G.seq_blend = 1;
					G.seq_blendp = 80;
					break;

				//Event
				case 'event':
					if (Tseq_.in[0] === 0) {
						parse_globalevent(Tseq_.txt[0], 'performed by seqevent');
					} else {
						parse_emuevent(Tseq_.in[0], Tseq_.in[1], Tseq_.txt[0]);
					}
					break;
				//Script
				case 'script':
					parse_task(0, 0, 'sequence', 'triggered by seqscript command', Tseq_.txt[0]);
					break;
				//Hideplayer
				case 'hideplayer':
					G.seq_hideplayer = Tseq_.in[0];
					break;

				//Setcam
				case 'setcam':
					if (con_info(Tseq_.in[0])) {
						//Positiion
						PositionEntity(G.cam, EntityX(G.TCinfo!.h), EntityY(G.TCinfo!.h), EntityZ(G.TCinfo!.h));
						RotateEntity(G.cam, EntityPitch(G.TCinfo!.h), EntityYaw(G.TCinfo!.h), 0);
						//Rotation Pivot
						PositionEntity(G.seq_cpoint_p, EntityX(G.cam), EntityY(G.cam), EntityZ(G.cam));
						RotateEntity(G.seq_cpoint_p, EntityPitch(G.cam), EntityYaw(G.cam), EntityRoll(G.cam));
						MoveEntity(G.seq_cpoint_p, 0, 0, 100000);
						//Movement Vars
						// quirk: the pivots are forgotten, not freed
						G.seq_cstart = null;
						G.seq_cend = null;
					} else {
						con_add('ERROR: ' + Tseq_.event + ' @ ' + Str(Tseq_.t) + ' ms - info ' + Str(Tseq_.in[0]) + ' does not exist', Cbmpf_red);
					}
					break;
				//Movecam
				case 'movecam':
					//Setup
					if (G.seq_cstart === null) G.seq_cstart = CreatePivot();
					if (G.seq_cend === null) G.seq_cend = CreatePivot();
					G.seq_cstartt = Tseq_.t;
					G.seq_cendt = Tseq_.in[0];
					//Setup Start
					PositionEntity(G.seq_cstart, EntityX(G.cam), EntityY(G.cam), EntityZ(G.cam));
					RotateEntity(G.seq_cstart, EntityPitch(G.cam), EntityYaw(G.cam), 0);
					//Setup End
					if (con_info(Tseq_.in[1])) {
						PositionEntity(G.seq_cend, EntityX(G.TCinfo!.h), EntityY(G.TCinfo!.h), EntityZ(G.TCinfo!.h));
						RotateEntity(G.seq_cend, EntityPitch(G.TCinfo!.h), EntityYaw(G.TCinfo!.h), 0);
					}
					//Rotation Pivot
					PositionEntity(G.seq_cpoint_p, EntityX(G.cam), EntityY(G.cam), EntityZ(G.cam));
					RotateEntity(G.seq_cpoint_p, EntityPitch(G.cam), EntityYaw(G.cam), EntityRoll(G.cam));
					MoveEntity(G.seq_cpoint_p, 0, 0, 100000);
					//Update
					seq_cammovement();
					seq_camrotation();
					break;
				//Cammode
				case 'cammode':
					G.seq_cpoint = Tseq_.in[0];
					G.seq_cpoint_class = Tseq_.in[1];
					G.seq_cpoint_id = Tseq_.in[2];
					//Rotation Pivot
					PositionEntity(G.seq_cpoint_p, EntityX(G.cam), EntityY(G.cam), EntityZ(G.cam));
					RotateEntity(G.seq_cpoint_p, EntityPitch(G.cam), EntityYaw(G.cam), EntityRoll(G.cam));
					MoveEntity(G.seq_cpoint_p, 0, 0, 100000);
					//Update
					seq_camrotation();
					break;
				//Flash
				case 'flash':
					p_add(0, 0, 0, Cp_flash, Tseq_.fl[0], Tseq_.fl[1]);
					EntityColor(G.TCp!.h, Tseq_.in[0], Tseq_.in[1], Tseq_.in[2]);
					break;

				//Fade
				case 'fade':
					p_add(0, 0, 0, Cp_seqfade);
					EntityColor(G.TCp!.h, Tseq_.in[1], Tseq_.in[2], Tseq_.in[3]);
					G.TCp!.x = f32(Tseq_.t);
					G.TCp!.y = f32(Tseq_.in[0]);
					G.TCp!.fx = f32(Tseq_.in[4]);
					switch (Tseq_.in[4]) {
						case 0:
							EntityAlpha(G.TCp!.h, 0);
							break;
						case 1:
							EntityAlpha(G.TCp!.h, 0);
							break;
						case 2:
							EntityAlpha(G.TCp!.h, 1);
							break;
					}
					break;

				//CLS
				case 'cls':
					G.seq_cls = Tseq_.in[0];
					G.seq_cls_r = Tseq_.in[1];
					G.seq_cls_g = Tseq_.in[2];
					G.seq_cls_b = Tseq_.in[3];
					break;

				//Image
				case 'image':
					if (G.seq_img !== 0) FreeImage(G.seq_img);
					if (Tseq_.txt[0] === '0' || Tseq_.txt[0] === '') {
						G.seq_img = 0;
					} else {
						G.seq_img = load_image(Tseq_.txt[0], Tseq_.in[0]);
						G.seq_img_masked = Tseq_.in[0];
						if (G.seq_img !== 0) {
							MidHandle(G.seq_img);
						}
					}
					break;

				//itxt
				case 'itxt':
					if (G.seq_img !== 0) {
						SetBuffer(ImageBuffer(G.seq_img));
						switch (Tseq_.in[3]) {
							//0 - left
							case 0:
								bmpf_txt(Tseq_.in[0], Tseq_.in[1], Tseq_.txt[0], Tseq_.in[2]);
								break;
							//1 - middle
							case 1:
								bmpf_txt_c(Tseq_.in[0], Tseq_.in[1], Tseq_.txt[0], Tseq_.in[2]);
								break;
							//2 - right
							case 2:
								bmpf_txt_r(Tseq_.in[0], Tseq_.in[1], Tseq_.txt[0], Tseq_.in[2]);
								break;
							//default
							default:
								con_add('seqimagetext invalid alignment (only 0,1,2 allowed)', Cbmpf_red);
						}
						SetBuffer(BackBuffer());
					}
					break;
				//Camfollow
				case 'camfollow':
					if (Tseq_.in[0] === 0) {
						G.seq_flw_class = 0;
					} else {
						G.seq_cpoint = 1;
						G.seq_cpoint_class = Tseq_.in[0];
						G.seq_cpoint_id = Tseq_.in[1];
						//Rotation Pivot
						PositionEntity(G.seq_cpoint_p, EntityX(G.cam), EntityY(G.cam), EntityZ(G.cam));
						RotateEntity(G.seq_cpoint_p, EntityPitch(G.cam), EntityYaw(G.cam), EntityRoll(G.cam));
						MoveEntity(G.seq_cpoint_p, 0, 0, 100000);
						//Update
						seq_camrotation();
						//Follow
						G.seq_flw_class = Tseq_.in[0];
						G.seq_flw_id = Tseq_.in[1];
						G.seq_flw_x = f32(Tseq_.fl[0]);
						G.seq_flw_y = f32(Tseq_.fl[1]);
						G.seq_flw_z = f32(Tseq_.fl[2]);
						seq_cammovement();
					}
					break;

				//Default
				default:
					con_add("INTERNAL ERROR: invalid event '" + Tseq_.event + "' for seq_update", Cbmpf_red);
			}
			Delete(Tseq, Tseq_);
		}
	}
}

//### Sequence Camera Movement
/** Function seq_cammovement() */
export function seq_cammovement(): void {
	let x1 = 0;
	let y1 = 0;
	let z1 = 0;
	let x2 = 0;
	let y2 = 0;
	let z2 = 0;
	let time = 0;
	let t1 = 0;
	let t2 = 0;
	let perc = 0;
	let dx = 0;
	let dy = 0;
	let dz = 0;
	//Movement?
	if (G.seq_cstart !== null) {
		if (G.seq_cend !== null) {
			//Get Start Coordinates
			x1 = EntityX(G.seq_cstart);
			y1 = EntityY(G.seq_cstart);
			z1 = EntityZ(G.seq_cstart);
			//Get End Coordinates
			x2 = EntityX(G.seq_cend);
			y2 = EntityY(G.seq_cend);
			z2 = EntityZ(G.seq_cend);

			//Get Percent of Process
			time = MilliSecs() - G.seq_start;
			t1 = time - G.seq_cstartt;
			t2 = G.seq_cendt - G.seq_cstartt;
			// quirk: Float division, t2=0 gives infinity or (0/0) NaN, no error; NaN compares as "greater" (fgt): 1
			perc = f32(t1 / t2);
			if (flt(perc, 0)) {
				perc = 0;
			} else if (fgt(perc, 1)) {
				perc = 1;
			}

			//Get Distances between Start and End
			dx = f32(x2 - x1);
			dy = f32(y2 - y1);
			dz = f32(z2 - z1);
			//Set Position based on Startposition, Distances and Percentage
			PositionEntity(G.cam, f32(x1 + f32(dx * perc)), f32(y1 + f32(dy * perc)), f32(z1 + f32(dz * perc)));

			//Finished?
			if (time >= G.seq_cendt) {
				FreeEntity(G.seq_cstart);
				G.seq_cstart = null;
				FreeEntity(G.seq_cend);
				G.seq_cend = null;
			}
		}
	}

	//Follow
	if (G.seq_flw_class !== 0) {
		if (parent_pos(G.seq_flw_class, G.seq_flw_id)) {
			G.tmp_x = f32(G.tmp_x + G.seq_flw_x);
			G.tmp_y = f32(G.tmp_y + G.seq_flw_y);
			G.tmp_z = f32(G.tmp_z + G.seq_flw_z);
			PositionEntity(G.cam, G.tmp_x, G.tmp_y, G.tmp_z);
		}
	}

	//Keep Cam Over Terrain
	if (f32(EntityY(G.cam) - 30) < e_tery(EntityX(G.cam), EntityZ(G.cam))) {
		PositionEntity(G.cam, EntityX(G.cam), f32(e_tery(EntityX(G.cam), EntityZ(G.cam)) + 30), EntityZ(G.cam));
	}
}

//### Camera Rotation
/** Function seq_camrotation() */
export function seq_camrotation(): void {
	let center: Handle = null;
	let h: Handle = null;
	let rt: Handle = null;
	let x1 = 0;
	let y1 = 0;
	let z1 = 0;
	let x2 = 0;
	let y2 = 0;
	let z2 = 0;
	let dx = 0;
	let dy = 0;
	let dz = 0;
	let time = 0;
	let t1 = 0;
	let t2 = 0;
	let perc = 0;
	//Rotatecam
	switch (G.seq_cpoint) {
		//0 - Center
		case 0:
			center = CreatePivot();
			PointEntity(G.cam, center);
			FreeEntity(center);
			break;
		//1 - Object
		case 1:
			h = parent_h(G.seq_cpoint_class, G.seq_cpoint_id);
			if (h !== null) {
				PointEntity(G.cam, h);
			}
			//DebugLog "point "+seq_cpoint_class+" #"+seq_cpoint_id+" h:"+h
			break;
		//2 - Info Path
		case 2:
			if (G.seq_cend !== null) {
				//Create and Setup temp. Rotation Target
				rt = CreatePivot();
				PositionEntity(rt, EntityX(G.seq_cend), EntityY(G.seq_cend), EntityZ(G.seq_cend));
				RotateEntity(rt, EntityPitch(G.seq_cend), EntityYaw(G.seq_cend), EntityRoll(G.seq_cend));
				MoveEntity(rt, 0, 0, 100000);
				//Get Start Coordinates
				x1 = EntityX(G.seq_cpoint_p);
				y1 = EntityY(G.seq_cpoint_p);
				z1 = EntityZ(G.seq_cpoint_p);
				//Get End Coordinates
				x2 = EntityX(rt);
				y2 = EntityY(rt);
				z2 = EntityZ(rt);
				//Get Distances between Start and End
				dx = f32(x2 - x1);
				dy = f32(y2 - y1);
				dz = f32(z2 - z1);
				//Get Percent of Process
				time = MilliSecs() - G.seq_start;
				t1 = time - G.seq_cstartt;
				t2 = G.seq_cendt - G.seq_cstartt;
				// quirk: Float division, t2=0 gives infinity or (0/0) NaN, no error; NaN compares as "greater" (fgt): 1
				perc = f32(t1 / t2);
				if (flt(perc, 0)) {
					perc = 0;
				} else if (fgt(perc, 1)) {
					perc = 1;
				}
				//Set Position based on Startposition, Distances and Percentage
				PositionEntity(rt, f32(x1 + f32(dx * perc)), f32(y1 + f32(dy * perc)), f32(z1 + f32(dz * perc)));
				//Point and Free
				PointEntity(G.cam, rt);
				FreeEntity(rt);
			}
			break;

		//3 - Nothing
		case 3:
			break;

		//4 - Free Look
		case 4:
			//Mouselook
			if (G.set_xinvert === 1) {
				//Invert X-Axis
				G.in_mxs = f32(-G.in_mxs);
			}
			//X-Axis
			if (G.in_mxs !== 0) RotateEntity(G.cam, EntityPitch(G.cam), f32(EntityYaw(G.cam) + f32(G.in_mxs * G.set_msens)), EntityRoll(G.cam));
			//Y-Axis
			if (G.in_mys !== 0) {
				//Invert?
				G.in_mys = f32(f32(G.in_mys * G.set_msens) * G.set_minvert);
				//Rotate
				if (G.in_mys > 0) {
					if (f32(EntityPitch(G.cam) + G.in_mys) > 85) {
						G.in_mys = f32(85 - EntityPitch(G.cam));
					}
					RotateEntity(G.cam, f32(EntityPitch(G.cam) + G.in_mys), EntityYaw(G.cam), EntityRoll(G.cam));
				} else if (G.in_mys < 0) {
					if (f32(EntityPitch(G.cam) + G.in_mys) < -85) {
						G.in_mys = f32(-85 - EntityPitch(G.cam));
					}
					RotateEntity(G.cam, f32(EntityPitch(G.cam) + G.in_mys), EntityYaw(G.cam), EntityRoll(G.cam));
				}
			}
			break;
	}
}

//### Sequence Add Event (called by parse_commands)
/** Function seq_addevent(event$) */
export function seq_addevent(event: string): void {
	let Tseq_: Tseq | null = null;
	let t = 0;
	let class_ = '';
	let source = '';
	let txt = '';
	let Tx_: Tx | null = null;
	let steptime = 0;
	let i = 0;
	let classint = 0;
	let id = 0;
	//New Tseq
	Tseq_ = New(Tseq);
	//Set Time
	t = Int(param());
	if (G.seq_tabs === 1) {
		//Absolute
		Tseq_.t = t * G.seq_tmod;
	} else {
		//Relative
		Tseq_.t = G.seq_tlast + t * G.seq_tmod;
	}
	G.seq_tlast = Tseq_.t;
	//Set Event
	Tseq_.event = event;
	//Get Params
	switch (event) {
		//End
		case 'end':
			break;
		//Show a Message
		case 'msg':
			parse_comma(1);
			Tseq_.txt[0] = param(); //Message
			Tseq_.in[0] = 0;
			Tseq_.in[1] = 0;
			if (parse_comma(0)) Tseq_.in[0] = Int(param()); //Color
			if (parse_comma(0)) Tseq_.in[1] = Int(param()); //Pos
			break;
		//Message Clear
		case 'msgclear':
			Tseq_.in[0] = -1;
			if (parse_comma(0)) Tseq_.in[0] = Int(param()); //Pos
			break;
		//Play a Sound
		case 'sound':
			Tseq_.fl[0] = 1;
			Tseq_.fl[1] = 0;
			Tseq_.in[0] = 0;
			parse_comma(1);
			Tseq_.txt[0] = param(); //File
			if (parse_comma(0)) Tseq_.fl[0] = Float(param()); //Volume
			if (parse_comma(0)) Tseq_.fl[1] = Float(param()); //Pan
			if (parse_comma(0)) Tseq_.in[0] = Int(param()); //Pitch
			break;
		//Parse an event
		case 'event':
			parse_comma(1);
			Tseq_.txt[0] = param(); //Event
			if (parse_comma(0)) {
				class_ = param();
				Tseq_.in[0] = parse_getclass(class_); //Class
				parse_comma(1);
				Tseq_.in[1] = Int(param()); //ID
			}
			break;
		//Script
		case 'script':
			parse_comma(1);
			source = params(); //Source
			txt = '0';
			if (Int(source) !== 0) {
				for (Tx_ = First(Tx); Tx_ !== null; Tx_ = After(Tx, Tx_)) {
					if (Tx_.parent_class === Cclass_info) {
						if (Tx_.parent_id === Int(source)) {
							txt = Tx_.value;
							break;
						}
					}
				}
			} else {
				txt = parse_loadscript(source);
			}
			if (txt === '0' || txt === '') {
				parse_error('txtsource', source);
			}
			Tseq_.txt[0] = txt;
			//con_add("seqscript: "+txt$)
			break;
		//Hideplayer
		case 'hideplayer':
			Tseq_.in[0] = 1;
			// quirk: parse_comma(1), a missing parameter is a script error
			if (parse_comma(1)) {
				Tseq_.in[0] = Int(param());
			}
			break;

		//Set Bar Mode
		case 'bar':
			if (parse_comma(0)) Tseq_.in[0] = Int(param()); //Barmode
			break;
		//Hide Bar
		case 'hidebar':
			break;
		//Show Bar
		case 'showbar':
			break;

		//Setcam
		case 'setcam':
			parse_comma(1);
			Tseq_.in[0] = Int(param()); //Target
			break;
		//Movecam
		case 'movecam':
			parse_comma(1);
			Tseq_.in[0] = Int(param()); //Endtime
			parse_comma(1);
			Tseq_.in[1] = Int(param()); //Target
			break;
		//Campath
		case 'campath':
			Tseq_.event = 'movecam';
			parse_comma(1);
			steptime = Int(param()); //Steptime
			// quirk: t and steptime are used raw from here on (seq_tmod / relative time only apply to the first event's start)
			Tseq_.in[0] = t + steptime; //Endtime
			parse_comma(1);
			Tseq_.in[1] = Int(param()); //Target
			i = 1;
			//Get more?
			while (parse_comma(0)) {
				Tseq_ = New(Tseq);
				Tseq_.event = 'movecam'; //Event
				Tseq_.t = t + steptime * i; //Time
				i = i + 1;
				Tseq_.in[0] = t + steptime * i; //Endtime
				Tseq_.in[1] = Int(param()); //Target
			}
			break;
		//Timedcampath
		case 'timedcampath':
			Tseq_.event = 'movecam';
			parse_comma(1);
			steptime = Int(param()); //Steptime
			Tseq_.in[0] = t + steptime; //Endtime
			parse_comma(1);
			Tseq_.in[1] = Int(param()); //Target
			i = 1;
			//Get more?
			while (parse_comma(0)) {
				Tseq_ = New(Tseq);
				Tseq_.event = 'movecam'; //Event
				Tseq_.t = Int(t + Int(steptime)); //Time
				steptime = Int(steptime) + Int(param());
				Tseq_.in[0] = Int(t) + Int(steptime); //Endtime
				parse_comma(1);
				Tseq_.in[1] = Int(param()); //Target
				//con_add("tcp: @ "+Tseq\t+" to "+Tseq\in[1]+" until "+Tseq\in[0])
			}
			break;
		//Cammode
		case 'cammode':
			parse_comma(1);
			Tseq_.in[0] = Int(param()); //Mode
			if (parse_comma(0)) {
				class_ = param(); //Class
				classint = parse_getclass(class_);
				if (classint === -1) {
					classint = G.p_env_class;
					id = G.p_env_id;
				} else {
					parse_comma(1);
					id = Int(param()); //ID
				}
				Tseq_.in[1] = classint;
				Tseq_.in[2] = id;
			}
			break;

		//Flash
		case 'flash':
			Tseq_.in[0] = 255;
			Tseq_.in[1] = 255;
			Tseq_.in[2] = 255;
			Tseq_.fl[0] = f32(0.05);
			Tseq_.fl[1] = f32(1.1);
			if (parse_comma(0)) Tseq_.in[0] = Int(param()); //R
			if (parse_comma(0)) Tseq_.in[1] = Int(param()); //G
			if (parse_comma(0)) Tseq_.in[2] = Int(param()); //B
			if (parse_comma(0)) Tseq_.fl[0] = Float(param()); //Fadespeed
			if (parse_comma(0)) Tseq_.fl[1] = Float(param()); //Alpha
			break;

		//Fade
		case 'fade':
			parse_comma();
			Tseq_.in[1] = 255;
			Tseq_.in[2] = 255;
			Tseq_.in[3] = 255;
			Tseq_.in[4] = 0;
			Tseq_.in[0] = Int(param()); //Endtime
			if (parse_comma(0)) Tseq_.in[1] = Int(param()); //R
			if (parse_comma(0)) Tseq_.in[2] = Int(param()); //G
			if (parse_comma(0)) Tseq_.in[3] = Int(param()); //B
			if (parse_comma(0)) Tseq_.in[4] = Int(param()); //Mode
			break;

		//CLS
		case 'cls':
			parse_comma();
			Tseq_.in[1] = 0;
			Tseq_.in[2] = 0;
			Tseq_.in[3] = 0;
			Tseq_.in[0] = Int(param()); //Mode
			if (parse_comma(0)) Tseq_.in[1] = Int(param()); //R
			if (parse_comma(0)) Tseq_.in[2] = Int(param()); //G
			if (parse_comma(0)) Tseq_.in[3] = Int(param()); //B
			break;

		//Image
		case 'image':
			parse_comma();
			Tseq_.in[0] = 0;
			Tseq_.txt[0] = param(); //Image
			if (parse_comma(0)) Tseq_.in[0] = Int(param()); //Masked
			break;

		//itxt
		case 'itxt':
			parse_comma();
			Tseq_.txt[0] = param(); //Text
			parse_comma(1);
			Tseq_.in[0] = Int(param()); //X
			parse_comma(1);
			Tseq_.in[1] = Int(param()); //Y
			if (parse_comma(0)) {
				Tseq_.in[2] = Int(param()); //Color
			}
			if (parse_comma(0)) {
				Tseq_.in[3] = Int(param()); //Align
			}
			break;
		//camfollow
		case 'camfollow':
			parse_comma();
			class_ = param();
			//Class
			if (class_ !== '0') {
				classint = parse_getclass(class_);
				if (classint === -1) {
					classint = G.p_env_class;
					id = G.p_env_id;
				} else {
					parse_comma(1);
					id = Int(param()); //ID
				}
				Tseq_.in[0] = classint;
				Tseq_.in[1] = id;
				parse_comma();
				Tseq_.fl[0] = Float(param()); //X
				parse_comma();
				Tseq_.fl[1] = Float(param()); //Y
				parse_comma();
				Tseq_.fl[2] = Float(param()); //Z
			} else {
				Tseq_.in[0] = 0;
			}
			break;

		//Default
		default:
			con_add("INTERNAL ERROR: invalid event '" + event + "' for seq_addevent", Cbmpf_red);
	}
}
