/**
 * includes/e_clear.bb, ported line by line.
 *
 * Two blocks of the original are methods of runtime layers, called at the
 * position of the block (PORTING_GUIDE.md section 2): the weather variables
 * (RT.core.e_clear) and the ambient / music channels (RT.audio.e_clear_audio).
 * The layers' fields are bound to G, so the statements are the same.
 * envFreeTerrain / envClear (_additions/map.ts) do for the drawing half of
 * the environment what FreeEntity ter and the water texture reset do here.
 */
import { CreatePivot, FreeEntity, FreeTexture, TextureBuffer } from '../bb3d';
import { BackBuffer, Cls, DrawBlock, FreeImage, SetBuffer, type ImageHandle } from '../gfx2d';
import { envClear, envFreeTerrain } from './_additions/map';
import { Cinfo_count } from './consts';
import {
	Dinfo_script,
	Dinfo_scriptk,
	Dinfo_scripto,
	Ditem_script,
	Ditem_scriptk,
	Ditem_scripto,
	Dobject_script,
	Dobject_scriptk,
	Dobject_scripto,
	Dunit_attackrange,
	Dunit_damage,
	Dunit_mat,
	Dunit_maxweight,
	Dunit_script,
	Dunit_scriptk,
	Dunit_scripto,
	Dunit_speed
} from './defs_arrays';
import { grass_free } from './grasspread';
import { preparse_string } from './parser_pre';
import { RT } from './rt';
import { G, dim } from './state';
import {
	After,
	Delete,
	First,
	T3d,
	Tat,
	Tbmpf_img,
	Tcopy,
	Tcscr,
	Tfrap,
	Tin_quicksave,
	Tinfo,
	Titem,
	Tmsg,
	Tobject,
	Tp,
	Tpro,
	Tpt,
	Tseq,
	Tstate,
	Ttimer,
	Tunit,
	Tup,
	Tx
} from './types';

//############################################ Engine Clear

/** Function e_clear() */
export function e_clear(): void {
	let frame = 0;
	let Tobject_: Tobject | null = null;
	let Tunit_: Tunit | null = null;
	let Titem_: Titem | null = null;
	let Tinfo_: Tinfo | null = null;
	let Tstate_: Tstate | null = null;
	let Tx_: Tx | null = null;
	let Tp_: Tp | null = null;
	let Tpro_: Tpro | null = null;
	let Tmsg_: Tmsg | null = null;
	let Tseq_: Tseq | null = null;
	let Tpt_: Tpt | null = null;
	let Tin_quicksave_: Tin_quicksave | null = null;
	let Tcscr_: Tcscr | null = null;
	let Tat_: Tat | null = null;
	let Ttimer_: Ttimer | null = null;
	let Tfrap_: Tfrap | null = null;
	let Tup_: Tup | null = null;
	let i = 0;
	let Tbmpf_img_: Tbmpf_img | null = null;
	let t3d: T3d | null = null;
	let Tcopy_: Tcopy | null = null;
	const audio = RT.audio.bb;

	//Frame
	// quirk: "frame" is not a global (the frame counter is gframe): a local, the statement has no effect
	frame = 0;
	void frame;

	//### Temp
	G.tmp_x = 0;
	G.tmp_y = 0;
	G.tmp_z = 0;
	G.tmp_rx = 0;
	G.tmp_ry = 0;
	G.tmp_rz = 0;
	G.tmp_h = null;
	G.tmp_class = 0;
	G.tmp_id = 0;
	G.tmp_ty = 0;
	G.tmp_iselx = 0;
	G.tmp_isely = 0;
	G.tmp_iseltyp = 0;
	G.tmp_kill = 0;
	G.tmp_killclass = 0;
	G.tmp_killid = 0;
	G.tmp_killmodel = null;
	G.tmp_ph = null;
	G.tmp_lines = 0;
	G.tmp_linesvisible = 0;
	G.tmp_spawnid = 0;
	G.tmp_dumpvars = 0;
	G.tmp_skipevent = 0;
	G.tmp_loading = 0;
	G.tmp_setcam = 0;
	G.tmp_tarclass = 0;
	G.tmp_tarid = 0;
	G.tmp_tarx = 0;
	G.tmp_tary = 0;
	G.tmp_tarz = 0;

	//### Menu
	G.m_menu = 0;

	//### TERRAIN

	//Terrain
	if (G.ter !== null) {
		FreeEntity(G.ter);
		G.ter = null;
	}
	envFreeTerrain(); // bridge: the terrain of the environment layer (G.ter was its proxy)
	//Terrain Tex Color
	if (G.ter_tex_color !== null) {
		FreeTexture(G.ter_tex_color);
		G.ter_tex_color = null;
	}

	//### ENVIRONMENT

	//Environment Sea
	if (G.env_sea !== null) {
		FreeEntity(G.env_sea);
		G.env_sea = null;
	}
	if (G.env_sea2 !== null) {
		FreeEntity(G.env_sea2);
		G.env_sea2 = null;
	}
	if (G.gfx_waterimg_custom !== 0) {
		FreeImage(G.gfx_waterimg_custom);
		SetBuffer(TextureBuffer(G.gfx_water)!);
		DrawBlock(G.gfx_waterimg, 0, 0);
		SetBuffer(BackBuffer());
		G.gfx_waterimg_custom = 0;
	}
	envClear(); // bridge: the layer's own custom water image and water alpha
	//env_wcol(0)=220
	//env_wcol(1)=110
	//env_wcol(2)=90
	//  -> RT.core.e_clear() below
	//Environment Sky
	if (G.env_sky !== null) {
		FreeEntity(G.env_sky);
		G.env_sky = null;
	}
	//Ground
	if (G.env_ground !== null) {
		FreeEntity(G.env_ground);
		G.env_ground = null;
	}
	//Environment Light
	//If env_light<>0 Then
	//	FreeEntity env_light
	//	env_light=0
	//EndIf
	//Environment Weather
	//env_cweather=0
	G.env_weathery = 0;
	//If env_weatherchan<>0 Then
	//	If ChannelPlaying(env_weatherchan) Then
	//		StopChannel env_weatherchan
	//		env_weatherchan=0
	//	EndIf
	//EndIf
	//env_wa#=0
	// the environment layer's part of this function: env_wcol(0..2)=220,110,90, env_cweather=0, the weather
	// channel, env_wa#=0 (and, early, Dim in_skyoverride(4), set_flarefx=1, in_gtmod=1., which follow below
	// at their original positions as well)
	RT.core.e_clear();
	//Itemlight
	if (G.env_itemlight !== null) {
		FreeEntity(G.env_itemlight);
		G.env_itemlight = null;
	}
	//Itemchan
	if (G.env_itemchan !== 0) {
		if (audio.ChannelPlaying(G.env_itemchan)) audio.StopChannel(G.env_itemchan);
		G.env_itemchan = 0;
	}
	//Moon
	if (G.env_moon !== null) {
		FreeEntity(G.env_moon);
		G.env_moon = null;
	}

	//### Grass
	grass_free();

	//### Stuff

	//OBJECT
	for (Tobject_ = First(Tobject); Tobject_ !== null; Tobject_ = After(Tobject, Tobject_)) {
		if (Tobject_.ch !== null) FreeEntity(Tobject_.ch);
		if (Tobject_.h !== null) FreeEntity(Tobject_.h);
		Delete(Tobject, Tobject_);
	}
	G.g_objectlistc = 0;
	G.g_objectlist = dim<Tobject | null>(null, 0);
	G.object_serial = 0;

	//UNIT
	for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
		if (Tunit_.mh !== null) FreeEntity(Tunit_.mh);
		if (Tunit_.h !== null) FreeEntity(Tunit_.h);
		if (Tunit_.ai_ch !== null) FreeEntity(Tunit_.ai_ch);
		if (Tunit_.vh !== null) FreeEntity(Tunit_.vh);
		if (Tunit_.chan !== 0) audio.StopChannel(Tunit_.chan);
		Delete(Tunit, Tunit_);
	}
	G.g_unitlistc = 0;
	G.g_unitlist = dim<Tunit | null>(null, 0);
	G.unit_serial = 99;

	//ITEM
	for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
		if (Titem_.h !== null) FreeEntity(Titem_.h);
		Delete(Titem, Titem_);
	}
	G.item_serial = 0;

	//INFO
	for (Tinfo_ = First(Tinfo); Tinfo_ !== null; Tinfo_ = After(Tinfo, Tinfo_)) {
		if (Tinfo_.h !== null) FreeEntity(Tinfo_.h);
		if (Tinfo_.typ === 47) {
			if (Tinfo_.ints[0] !== 0) audio.FreeSound(Tinfo_.ints[0]);
			if (Tinfo_.ints[1] !== 0) {
				audio.StopChannel(Tinfo_.ints[1]);
			}
		}
		Delete(Tinfo, Tinfo_);
	}
	G.info_serial = 0;

	//STATE
	for (Tstate_ = First(Tstate); Tstate_ !== null; Tstate_ = After(Tstate, Tstate_)) {
		if (Tstate_.h !== null) FreeEntity(Tstate_.h);
		if (Tstate_.light !== null) FreeEntity(Tstate_.light);
		Delete(Tstate, Tstate_);
	}

	//EXTENSION
	for (Tx_ = First(Tx); Tx_ !== null; Tx_ = After(Tx, Tx_)) {
		Delete(Tx, Tx_);
	}

	//PARTICLE
	for (Tp_ = First(Tp); Tp_ !== null; Tp_ = After(Tp, Tp_)) {
		if (Tp_.h !== null) FreeEntity(Tp_.h);
		Delete(Tp, Tp_);
	}

	//PROJECTILE
	for (Tpro_ = First(Tpro); Tpro_ !== null; Tpro_ = After(Tpro, Tpro_)) {
		if (Tpro_.h !== null) FreeEntity(Tpro_.h);
		Delete(Tpro, Tpro_);
	}

	//MSG
	for (Tmsg_ = First(Tmsg); Tmsg_ !== null; Tmsg_ = After(Tmsg, Tmsg_)) {
		Delete(Tmsg, Tmsg_);
	}

	//SEQUENCES
	G.seq_blend = 0;
	G.seq_blendp = 0;
	G.seq_start = 0;
	for (Tseq_ = First(Tseq); Tseq_ !== null; Tseq_ = After(Tseq, Tseq_)) {
		Delete(Tseq, Tseq_);
	}
	if (G.seq_cpoint_p === null) {
		G.seq_cpoint_p = CreatePivot();
	}
	G.seq_msg = dim('', 2, 1);
	if (G.seq_img !== 0) {
		FreeImage(G.seq_img);
		G.seq_img = 0;
	}
	G.seq_flw_class = 0;

	//PARSE TASKS
	for (Tpt_ = First(Tpt); Tpt_ !== null; Tpt_ = After(Tpt, Tpt_)) {
		Delete(Tpt, Tpt_);
	}

	//Stuff
	G.map_timeupdate = 0;
	G.map_briefing = '';
	G.map_briefing_key = '';

	//Player
	G.g_player = 0;
	G.g_player_dead = 0;
	G.g_airtimer = 0;
	G.g_dive = 0;
	G.g_swim = 0;
	G.g_drive = 0;
	G.g_sleep = 0;

	//GT
	G.gt = 0;
	G.in_tgametime = 0;
	G.in_gtmod = 1;

	//GT Timers
	G.in_gt20 = 0;
	G.in_gt20go = 0;
	G.in_gt50 = 0;
	G.in_gt50go = 0;
	G.in_gt100 = 0;
	G.in_gt100go = 0;
	G.in_gt500 = 0;
	G.in_gt500go = 0;
	G.in_gt1000 = 0;
	G.in_gt1000go = 0;
	G.in_gt5000 = 0;
	G.in_gt5000go = 0;
	G.in_waverate = 0;

	//Process / Focus
	G.in_focus = 0;
	G.in_fo_x = 0;
	G.in_fo_y = 0;
	// quirk: a number assigned to a String: the focus text becomes "0"
	G.in_fo_txt = '0';
	G.in_fo_perc = 0;
	G.in_fo_id = 0;
	G.in_fo_timer = 0;
	G.pc_typ = 0;
	G.pc_value = 0;
	G.pc_child = 0;
	G.pc_txt = '';
	G.pc_gt = 0;
	G.in_pc_custom = '';
	G.in_pc_customt = 0;
	// quirk: a number assigned to a String: the custom process event becomes "0"
	G.in_pc_event = '0';
	G.in_pc_menu = 0;
	G.in_pc_menu_x = 0;
	G.in_pc_menu_y = 0;

	//Compass
	G.in_compass = 1;

	//Sky Override
	G.in_skyoverride = dim(0, 4);

	//Last Jump
	G.in_lastjump = 0;

	//Teleport
	G.in_tpforce = 0;

	//Editor
	G.in_fraph = null;
	G.in_turnh = null;

	//Drag and Drop
	G.in_dnd = 0;
	G.in_dnd_pivotx = 0;
	G.in_dnd_pivoty = 0;
	G.in_dnd_src = 0;
	G.in_dnd_typ = 0;

	//Interface
	G.in_scr_scr = 0;
	G.in_scr_scr2 = 0;
	G.in_scr_scr3 = 0;
	G.in_scr_descr = 0;
	G.in_scr_sel = -1;
	G.in_scr_sel2 = -1;
	G.in_ex_sel = 0;
	G.in_ex_class = 0;
	G.in_ex_id = 0;
	G.in_accelerate = 0;
	G.in_getkey = -1;
	G.in_msgtitle = '';
	G.in_msgtext = '';
	G.in_chat = '';
	G.in_sticktoslide = 0;
	G.in_quicksave = 0;
	for (Tin_quicksave_ = First(Tin_quicksave); Tin_quicksave_ !== null; Tin_quicksave_ = After(Tin_quicksave, Tin_quicksave_)) {
		Delete(Tin_quicksave, Tin_quicksave_);
	}
	G.in_wpnrdy = 1;
	G.in_wpnrdyg = 0;
	G.in_blockclose = 0;
	G.in_jumprehit = 0;
	if (G.in_clickscreenimage !== 0) {
		FreeImage(G.in_clickscreenimage);
		G.in_clickscreenimage = 0;
	}
	for (Tcscr_ = First(Tcscr); Tcscr_ !== null; Tcscr_ = After(Tcscr, Tcscr_)) {
		if (Tcscr_.image !== 0) FreeImage(Tcscr_.image);
		Delete(Tcscr, Tcscr_);
	}

	//Stop/Free AMB Channel and Sound
	//If amb_chan<>0 Then
	//	StopChannel amb_chan
	//	amb_chan=0
	//EndIf
	//If amb_file<>0 Then
	//	FreeSound(amb_file)
	//	amb_file=0
	//EndIf
	//amb_chan=0
	//amb_mode=0

	//MUSIC
	//If mfx_chan<>0 Then
	//	If ChannelPlaying(mfx_chan) Then
	//		StopChannel(mfx_chan)
	//	EndIf
	//	mfx_chan=0
	//EndIf
	//If mfx_file<>0 Then FreeSound(mfx_file)
	//mfx_fade=0
	//mfx_file=0
	//mfx_filename$=""
	// the audio layer's part of this function: exactly the two blocks above
	RT.audio.e_clear_audio();

	//Attachments
	for (Tat_ = First(Tat); Tat_ !== null; Tat_ = After(Tat, Tat_)) {
		Delete(Tat, Tat_);
	}

	//Map Image
	if (G.map_mapimage !== 0) {
		FreeImage(G.map_mapimage);
		G.map_mapimage = 0;
	}

	//Map Ratios
	G.map_rainratio = G.game_rainratio;
	G.map_snowratio = G.game_snowratio;

	//Timers
	for (Ttimer_ = First(Ttimer); Ttimer_ !== null; Ttimer_ = After(Ttimer, Ttimer_)) {
		Delete(Ttimer, Ttimer_);
	}

	//FRAPs (free rotation and position)
	for (Tfrap_ = First(Tfrap); Tfrap_ !== null; Tfrap_ = After(Tfrap, Tfrap_)) {
		Delete(Tfrap, Tfrap_);
	}

	//Unit Paths
	for (Tup_ = First(Tup); Tup_ !== null; Tup_ = After(Tup, Tup_)) {
		Delete(Tup, Tup_);
	}

	//Reset Definition Scripts
	for (i = 1; i <= G.Cobject_count; i++) {
		Dobject_script.set(i, Dobject_scripto(i));
		Dobject_scriptk.set(i, preparse_string(Dobject_script(i)));
	}
	for (i = 1; i <= G.Cunit_count; i++) {
		Dunit_script.set(i, Dunit_scripto(i));
		Dunit_scriptk.set(i, preparse_string(Dunit_script(i)));
	}
	for (i = 1; i <= G.Citem_count; i++) {
		Ditem_script.set(i, Ditem_scripto(i));
		Ditem_scriptk.set(i, preparse_string(Ditem_script(i)));
	}
	for (i = 1; i <= Cinfo_count; i++) {
		Dinfo_script.set(i, Dinfo_scripto(i));
		Dinfo_scriptk.set(i, preparse_string(Dinfo_script(i)));
	}

	//Reset Player Stuff
	Dunit_speed.set(1, Dunit_speed(0));
	Dunit_damage.set(1, Dunit_damage(0));
	Dunit_attackrange.set(1, Dunit_attackrange(0));
	Dunit_maxweight.set(1, Dunit_maxweight(0));
	Dunit_mat.set(1, Dunit_mat(0));

	//Reset Game Inf Stuff
	G.game_jumptime = G.game_jumptime2;
	G.game_jumpfac = G.game_jumpfac2;

	//Reset Parse Stuff
	G.p_parseinprogress = 0;

	//Reset Motion Blur Override
	G.set_mb_alpha_override = 0;
	G.in_scriptblur = 0;

	//Flare
	G.set_flarefx = 1;

	//Reset Interface Buttons/Text/Image
	G.in_sb = dim(0, 9);
	G.in_sitxt = dim(0, 19);
	for (i = 0; i <= 39; i++) {
		if (G.in_siimg[i] !== 0) FreeImage(G.in_siimg[i]);
	}
	G.in_siimg = dim<ImageHandle>(0, 39);

	//Bmpf Scroll Images
	for (Tbmpf_img_ = First(Tbmpf_img); Tbmpf_img_ !== null; Tbmpf_img_ = After(Tbmpf_img, Tbmpf_img_)) {
		if (Tbmpf_img_.h !== 0) {
			FreeImage(Tbmpf_img_.h as ImageHandle);
		}
		Delete(Tbmpf_img, Tbmpf_img_);
	}

	//Text 3D
	for (t3d = First(T3d); t3d !== null; t3d = After(T3d, t3d)) {
		Delete(T3d, t3d);
	}

	//Parse Vars
	G.pv_x = 0;
	G.pv_y = 0;
	G.pv_z = 0;
	G.pv_buffer = '';
	G.pv_attack_damage = 0;
	G.pv_attack_weapon = 0;
	G.pv_attack_ammo = 0;
	G.pv_impact_class = 0;
	G.pv_impact_id = 0;
	G.pv_impact_kill = 0;
	G.pv_impact_num = 0;
	G.pv_impact_amount = 0;
	G.pv_impact_x = 0;
	G.pv_impact_y = 0;
	G.pv_impact_z = 0;
	G.pv_impact_ground = 0;
	G.pv_ai_eater = 0;
	G.p_return = '';
	G.p_internal = 0;
	G.p_internaltxt = '';
	G.pv_lastbuilding = 0;

	//Editor Setscript
	G.ed_setscript = '';

	//Clear Blur Buffer
	if (G.set_mb) {
		if (G.mb_tex !== null) {
			SetBuffer(TextureBuffer(G.mb_tex)!);
			Cls();
			SetBuffer(BackBuffer());
		}
	}

	//Clear Copy
	for (Tcopy_ = First(Tcopy); Tcopy_ !== null; Tcopy_ = After(Tcopy, Tcopy_)) {
		Delete(Tcopy, Tcopy_);
	}

	//FPS Factor
	G.f = 1;
}
