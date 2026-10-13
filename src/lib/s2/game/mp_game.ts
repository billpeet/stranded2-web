/**
 * includes/mp_game.bb: the section function of a multiplayer game
 * (m_section=Csection_game_mp), called once per frame by the main loop. An
 * unfinished copy of game(): no player collision, no weapon, no debug keys,
 * and the network update at the end.
 */
import { EntityX, EntityY, EntityYaw, EntityZ, UpdateWorld } from '../bb3d';
import { MilliSecs, Str, idivConst } from '../blitz';
import { BackBuffer, DrawImage, SaveBuffer } from '../gfx2d';
import { KeyDown, KeyHit, MoveMouse } from '../input';
import { Cmenu_if_buildsetup, Cmenu_if_quit } from './consts';
import { cull } from './cull';
import { RenderWorld, e_environment_update, e_environment_update_water, e_environment_water2dfx } from './e_environment';
import { delay } from './flow';
import { focus_update } from './game_focus';
import { game_setcam } from './game_functions';
import { game_input_menu, game_input_normal } from './game_input';
import { grass_spread } from './grasspread';
import { update_state } from './handle_states';
import { endinput, getinput } from './input';
import { interface_ } from './interface';
import { mb_update } from './motionblur';
import { mp_scoreboard } from './mp_game_functions';
import { p_update, p_update_2d } from './particles';
import { pro_update } from './projectiles';
import { sfx_update } from './sfx';
import { G } from './state';
import { After, First, Tudp_con } from './types';
import { udp_update } from './udp_functions';
import { udp_send, udp_w_byte, udp_w_float, udp_w_int } from './udp_messages';

//############################################ GAME

/** Function game_mp() */
export async function game_mp(): Promise<void> {
	let x = 0;
	let Tudp_con_: Tudp_con | null = null;

	//Input
	getinput();
	if (G.m_menu === 0) MoveMouse(idivConst(G.set_scrx, 2), idivConst(G.set_scry, 2));

	//Renderstuff
	UpdateWorld(G.f);
	game_setcam();
	e_environment_update_water();
	RenderWorld();
	await mb_update();
	e_environment_water2dfx();

	//Update
	await cull();

	grass_spread();
	e_environment_update();
	focus_update();
	update_state();
	sfx_update();

	if (KeyHit(59)) {
		SaveBuffer(BackBuffer(), 'screen' + Str(G.ms) + '.bmp');
		//f#=0.3
	}

	//Interface
	await interface_();

	//Normal Game Input

	//mp_movepos()

	if (G.m_menu === 0) {
		game_input_normal();
	}

	//Change Menu
	game_input_menu();

	//Particles & Projectiles
	// quirk: g_unpaused is only ever set by game(); here it is whatever the last single player frame left
	if (G.g_unpaused) {
		p_update();
		pro_update();
	} else {
		p_update_2d();
	}

	//Crosshair
	if (G.m_menu === 0) DrawImage(G.gfx_cursor[6], idivConst(G.set_scrx, 2), idivConst(G.set_scry, 2));

	//Scoreboard
	if (KeyDown(15)) {
		mp_scoreboard();
	}

	//Endinput
	x = ((G.m_menu > 0 ? 1 : 0) & (G.m_menu < Cmenu_if_quit ? 1 : 0)) | (G.m_menu >= Cmenu_if_buildsetup ? 1 : 0);
	endinput(x, x);

	//Sequence Blend
	//seq_blend()

	//######################### Netstuff
	udp_update();

	if ((1 as number) === 1) {
		//Send Position
		if (((G.ms - G.mp_sendpostimer) | 0) > G.mp_sendposrate) {
			G.mp_sendpostimer = G.ms;
			//Send Position
			for (Tudp_con_ = First(Tudp_con); Tudp_con_ !== null; Tudp_con_ = After(Tudp_con, Tudp_con_)) {
				udp_send(Tudp_con_.ip, Tudp_con_.port, 50, 1);
				udp_w_byte(G.g_player);
				udp_w_float(EntityX(G.g_cplayer!.h));
				udp_w_float(EntityY(G.g_cplayer!.h));
				udp_w_float(EntityZ(G.g_cplayer!.h));
				udp_w_float(EntityYaw(G.g_cplayer!.h));
			}
		}

		//Send Ping
		if (((G.ms - G.mp_sendpingtimer) | 0) > 5 * 1000) {
			G.mp_sendpingtimer = G.ms;
			for (Tudp_con_ = First(Tudp_con); Tudp_con_ !== null; Tudp_con_ = After(Tudp_con, Tudp_con_)) {
				udp_send(Tudp_con_.ip, Tudp_con_.port, 5, 1);
				udp_w_byte(1);
				udp_w_int(MilliSecs());
			}
		}
	}

	//DEBUG PURPOSES
	await delay(10);
}
