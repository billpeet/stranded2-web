/**
 * includes/game.bb: the section function of the running game, called once
 * per frame by the main loop.
 */
import { PositionEntity, UpdateWorld } from '../bb3d';
import { MilliSecs, Str, idivConst } from '../blitz';
import { DrawImage } from '../gfx2d';
import { KeyHit, MoveMouse } from '../input';
import { col_player } from './collisions';
import { con_debugmenu } from './console';
import { Cbmpf_yellow, Cmenu_if_buildsetup, Cmenu_if_clickscreen, Cmenu_if_movie, Cmenu_if_quit } from './consts';
import { cull, cull_items } from './cull';
import { RenderWorld, e_environment_update, e_environment_update_water, e_environment_water2dfx } from './e_environment';
import { screenshot } from './functions';
import { game_cd } from './game_changeday';
import { focus_update } from './game_focus';
import { game_renderweapon, game_setcam } from './game_functions';
import { game_input_menu, game_input_normal } from './game_input';
import { seq_blend } from './game_sequences';
import { grass_spread } from './grasspread';
import { update_state } from './handle_states';
import { endinput, getinput } from './input';
import { if_msg, interface_ } from './interface';
import { mb_update } from './motionblur';
import { p_update, p_update_2d } from './particles';
import { pro_update } from './projectiles';
import { sfx_update } from './sfx';
import { G } from './state';
import { Tunit, isNull } from './types';
import { up_update } from './unitpath';

//############################################ GAME

/** Function game() */
export async function game(): Promise<void> {
	let ct = 0;
	let x = 0;

	//Unpaused?
	G.g_unpaused = (G.m_menu === 0 ? 1 : 0) | (G.m_menu >= Cmenu_if_movie ? 1 : 0);

	//Input
	getinput(G.g_unpaused);
	if (G.m_menu === 0) {
		MoveMouse(idivConst(G.set_scrx, 2), idivConst(G.set_scry, 2)); //Ingame Mouse Reset
	} else if (G.m_menu === Cmenu_if_movie) {
		if (G.seq_cpoint === 4) {
			MoveMouse(idivConst(G.set_scrx, 2), idivConst(G.set_scry, 2)); //Sequence Mouse Reset
		}
	}

	//Update Items
	cull_items();

	//Update World
	ct = MilliSecs();
	UpdateWorld(G.f);
	if (G.set_debug_rt) {
		G.set_debug_rt_updateworld = Str((MilliSecs() - ct) | 0) + ' ms Update';
	}

	//Set Camera
	game_setcam();

	//Player Collision
	if (G.m_menu === 0) {
		if (G.g_drive === 0) {
			if (!isNull(Tunit, G.g_cplayer)) {
				G.TCunit = G.g_cplayer;
				col_player();
			}
		}
	}

	//Teleport
	if (G.in_tpforce > 0) {
		G.in_tpforce = G.in_tpforce - 1;
		if (!isNull(Tunit, G.g_cplayer)) {
			PositionEntity(G.g_cplayer!.h, G.in_tp[0], G.in_tp[1], G.in_tp[2]);
		}
	}

	//Update Objects / Units / Infos / Timer / Parse Scripts
	await cull();

	//Environment Stuff (Pre Render)
	e_environment_update_water(); //Water
	e_environment_update(); //Environemnt

	//Player Weapon
	game_renderweapon();

	//Render
	G.set_debug_rt_render = MilliSecs();
	RenderWorld(); //Render
	G.set_debug_rt_render = (MilliSecs() - G.set_debug_rt_render) | 0;
	if (KeyHit(59)) screenshot(); //F1 -> Screenshot

	ct = MilliSecs();

	//Environment Stuff (Post Render)
	await mb_update(); //Motion Blur
	e_environment_water2dfx(); //Water 2D FX (Dive)
	grass_spread(); //Grass
	focus_update(); //Focus (Process etc)
	update_state(); //States
	sfx_update(); //SFX
	up_update(); //Unitpaths

	//Interface
	await interface_();

	//Normal Game Input
	if (G.m_menu === 0) {
		game_input_normal();
	}

	//Change Menu Input
	game_input_menu();

	//Debug Hotkeys
	if (G.set_debug === 1) {
		if (KeyHit(67)) {
			//F9  -> Debug Off
			G.set_debug = 0;
			if_msg('< debug off >', Cbmpf_yellow);
		}
		if (KeyHit(68)) con_debugmenu(); //F10 -> Debug Menu
		if (KeyHit(87)) {
			//F11 -> Changeday
			game_cd();
			if_msg('< change day >', Cbmpf_yellow);
		}
	}

	//Particles & Projectiles
	if (G.g_unpaused) {
		p_update();
		pro_update();
	} else {
		p_update_2d();
	}

	//Crosshair
	if (G.m_menu === 0) {
		if (G.set_drawinterface === 1) {
			DrawImage(G.gfx_cursor[6], idivConst(G.set_scrx, 2), idivConst(G.set_scry, 2));
		}
	}

	//Sequence Blend
	seq_blend();

	//Endinput
	x = ((G.m_menu > 0 ? 1 : 0) & (G.m_menu < Cmenu_if_quit ? 1 : 0)) | (G.m_menu >= Cmenu_if_buildsetup ? 1 : 0) | (G.m_menu === Cmenu_if_clickscreen ? 1 : 0);
	endinput(x, x, 0);

	//Debug Times
	if (G.set_debug_rt) {
		G.set_debug_rt_poststuff = Str((MilliSecs() - ct) | 0) + ' ms Poststuff';
	}
}
