/**
 * includes/game_focus.bb: the "focus" of the player: the running process
 * (build, dig, fish, custom) and its progress bar below the top of the screen.
 */
import { Int, f32, idivConst } from '../blitz';
import { DrawBlock, DrawBlockRect } from '../gfx2d';
import { MoveMouse } from '../input';
import { Cstate_pc_build, Cstate_pc_custom, Cstate_pc_dig, Cstate_pc_fish } from './consts';
import { game_buildfocus } from './game_build';
import { game_dig, game_fish } from './game_functions';
import { bmpf_txt_c } from './load_bmpf';
import { sm } from './load_strings';
import { parse_globalevent } from './parser_functions';
import { sfx } from './sfx';
import { G } from './state';

//############################################ FOCUS

//Update Focus
/** Function focus_update() */
export function focus_update(): void {
	if (G.m_menu === 0) {
		//Rescan every 300 MS
		if (G.ms - G.in_fo_timer > 300) {
			G.in_fo_timer = G.ms;
			G.in_focus = 0;

			//Get Focus by Process?
			if (G.pc_typ !== 0) {
				G.in_focus = G.pc_typ;
			}

			//Pick
			//If in_focus=0 Then
			//	Local target=CreatePivot()
			//	PositionEntity target,EntityX(cam),EntityY(cam),EntityZ(cam)
			//	RotateEntity target,EntityPitch(cam),EntityYaw(cam),EntityRoll(cam)
			//	MoveEntity target,0,0,Cworld_userange
			//	in_pe=0
			//	in_pe=LinePick(EntityX(cam),EntityY(cam),EntityZ(cam),EntityX(target)-EntityX(cam),EntityY(target)-EntityY(cam),EntityZ(target)-EntityZ(cam),Cworld_useradius)
			//	in_px#=PickedX()
			//	in_py#=PickedY()
			//	in_pz#=PickedZ()
			//	FreeEntity target
			//	;Picked?
			//	If in_pe<>0 Then
			//		;Item?
			//		If get_item(in_pe)>-1 Then
			//			in_focus=1:in_fo_x=set_scrx/2:in_fo_y=35
			//			in_fo_txt$=Ditem_name$(TCitem\typ)
			//			in_fo_perc=(TCitem\health#/Ditem_health#(TCitem\typ))*100.
			//		;Unit?
			//		ElseIf get_unit(in_pe)>-1 Then
			//			in_focus=1:in_fo_x=set_scrx/2:in_fo_y=35
			//			If TCunit\id<100 Then
			//				in_fo_txt$="#"+TCunit\id+" "+TCunit\player_name$
			//			Else
			//				in_fo_txt$=Dunit_name$(TCunit\typ)
			//			EndIf
			//			in_fo_perc=(TCunit\health#/TCunit\health_max#)*100.
			//		EndIf
			//	EndIf
			//EndIf
		}
	}
}

//Draw Focus Stuff
/** Function focus_draw() */
export function focus_draw(): void {
	const in_perc = 0; // quirk: in_perc is not a global (in_fo_perc is): a fresh local, always 0
	let x = 0;
	let y = 0;
	let perc = 0;
	if (G.in_focus !== 0) {
		switch (G.in_focus) {
			//1 - Text
			case 1:
				bmpf_txt_c(G.in_fo_x, G.in_fo_y, G.in_fo_txt);
				if (in_perc > -1) {
					x = idivConst(G.set_scrx, 2) - 51;
					y = 55;
					//DrawBlock gfx_if_barback,x,y
					//DrawBlockRect gfx_bars,x+1,y+1,0,0,in_fo_perc,5
				}
				break;

			//Process Build
			case Cstate_pc_build:
				game_buildfocus(G.pc_child);
				if (G.gt - G.pc_gt >= 3000) {
					G.pc_typ = 0;
					G.in_focus = 0;
				}
				break;

			//Process Dig
			case Cstate_pc_dig:
				bmpf_txt_c(idivConst(G.set_scrx, 2), 35, sm(178));
				x = idivConst(G.set_scrx, 2) - 51;
				y = 55;
				// perc is an Int: the Float percentage is rounded
				perc = Int(f32(f32((G.gt - G.pc_gt) / G.game_digtime) * 100));
				DrawBlock(G.gfx_if_barback, x, y);
				DrawBlockRect(G.gfx_bars, x + 1, y + 1, 0, 0, perc, 5);
				if (G.in_t500go) sfx(G.sfx_dig);
				if (G.gt - G.pc_gt >= G.game_digtime) {
					G.pc_typ = 0;
					G.in_focus = 0;
					game_dig();
				}
				break;

			//Process Fish
			case Cstate_pc_fish:
				bmpf_txt_c(idivConst(G.set_scrx, 2), 35, sm(179));
				x = idivConst(G.set_scrx, 2) - 51;
				y = 55;
				perc = Int(f32(f32((G.gt - G.pc_gt) / G.game_fishtime) * 100));
				DrawBlock(G.gfx_if_barback, x, y);
				DrawBlockRect(G.gfx_bars, x + 1, y + 1, 0, 0, perc, 5);
				if (G.gt - G.pc_gt >= G.game_fishtime) {
					G.pc_typ = 0;
					G.in_focus = 0;
					game_fish();
				}
				break;

			//Process Custom
			case Cstate_pc_custom:
				bmpf_txt_c(idivConst(G.set_scrx, 2), 35, G.in_pc_custom);
				x = idivConst(G.set_scrx, 2) - 51;
				y = 55;
				perc = Int(f32(f32((G.gt - G.pc_gt) / G.in_pc_customt) * 100));
				DrawBlock(G.gfx_if_barback, x, y);
				DrawBlockRect(G.gfx_bars, x + 1, y + 1, 0, 0, perc, 5);
				if (G.gt - G.pc_gt >= G.in_pc_customt) {
					//Quit Process
					G.pc_typ = 0;
					G.in_focus = 0;
					//Return to Menu
					if (G.in_pc_menu !== 0) {
						G.m_menu = G.in_pc_menu;
						MoveMouse(G.in_pc_menu_x, G.in_pc_menu_y);
						G.in_pc_menu = 0;
					}
					//Event
					if (G.in_pc_event !== '') {
						parse_globalevent(G.in_pc_event);
					}
				}
				break;
		}
	}
}
