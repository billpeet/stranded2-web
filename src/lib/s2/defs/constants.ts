/**
 * Every Const from includes/load_const.bb with its original name and value,
 * plus the material tables from includes/load_materials.bb.
 * Float constants (declared with # in the original) are single precision.
 */

import { Int } from '../blitz';

// World (Cworld)

export const Cworld_size = 64; // Terrain X/Z Size
export const Cworld_height = 3200; // Terrain Height
export const Cworld_mscale = 2; // Mesh Scale

export const Cworld_g = Math.fround(9.81); // World Gravity
export const Cworld_facct = 3000; // Fall Acceleration Time (ms)

export const Cworld_col = 100; // World Collision Type (Polygonal)
export const Cworld_unitcol = 1; // Units Collision Type (Radius)
export const Cworld_procol = 50; // Projectile Collision Type (Radius)
export const Cworld_itemcol = 2; // Items Collisions Type (Radius)

export const Cworld_userange = 48; // Use Range
export const Cworld_useradius = 5; // Use Radius

export const Cworld_minute_ms = 500; // Game Time Minute / Real Time Millisecs - Ratio
// (200 in an earlier version)

export const Cchatshow = 8000; // Chatmessage Showtime

export const Cpeakblur = Math.fround(0.97); // Peak Motion Blur

// Sections (Csection)

export const Csection_menu = 0; // Menu
export const Csection_game_sp = 1; // Game SP
export const Csection_game_mp = 2; // Game MP
export const Csection_editor = 3; // Editor

// Menus (Cmenu)

// Main
export const Cmenu_main = 0; // Main
export const Cmenu_set_in = 50; // Settings Input
export const Cmenu_set_gfx = 51; // Settings GFX
export const Cmenu_set_sfx = 52; // Settings SFX
export const Cmenu_reboot = 53; // Reboot
export const Cmenu_set_inscript = 54; // Settings Input for Scriptkeys
export const Cmenu_sp = 60; // Singleplayer
export const Cmenu_sp_load = 61; // Singleplayer Load
export const Cmenu_random = 70; // Random
export const Cmenu_mp = 80; // Multiplayer (Online Games)
export const Cmenu_mp_lan = 81; // Multiplayer (LAN Games)
export const Cmenu_mp_create = 82; // Multiplayer Create Game
export const Cmenu_credits = 90; // Credits
export const Cmenu_quit = 100; // Quit?

// Editor
export const Cmenu_ed_new = 1;
export const Cmenu_ed_settings = 2;
export const Cmenu_ed_infolist = 3;
export const Cmenu_ed_options = 4;
export const Cmenu_ed_quit = 5;
export const Cmenu_ed_load = 10;
export const Cmenu_ed_save = 20;
export const Cmenu_ed_heightmap = 30;
export const Cmenu_ed_colormap = 35;
export const Cmenu_ed_grassmap = 40;
export const Cmenu_ed_objects = 100;
export const Cmenu_ed_units = 101;
export const Cmenu_ed_items = 102;
export const Cmenu_ed_infos = 103;
export const Cmenu_ed_scripts = 104;
export const Cmenu_ed_states = 105;
export const Cemnu_ed_defvars = 109;
export const Cmenu_ed_attachments = 110;
export const Cmenu_ed_random = 120;
export const Cmenu_ed_list = 200;
export const Cmenu_ed_map = 201;

// Interface
export const Cmenu_if_char = 1; // Menus with Inferface + Sidebar (Game paused)
export const Cmenu_if_items = 2;
export const Cmenu_if_diary = 3;
export const Cmenu_if_loadgame = 10;
export const Cmenu_if_savegame = 15;
export const Cmenu_if_build = 20;
export const Cmenu_if_msg = 21;
export const Cmenu_if_find = 22;
export const Cmenu_if_exchange = 23;
export const Cmenu_if_map = 24;
export const Cmenu_if_cracklock = 25;
export const Cmenu_if_dlg = 26;
export const Cmenu_if_combine = 27;
export const Cmenu_if_debugmenu = 40;
export const Cmenu_if_debugmenu_items = 41;
export const Cmenu_if_debugmenu_script = 42;
export const Cmenu_if_quit = 50;

export const Cmenu_if_clickscreen = 60; // Menus with Nothing (Game paused)

export const Cmenu_if_movie = 100; // Menus with Nothing (Game unpaused)
export const Cmenu_if_cheat = 102;
export const Cmenu_if_use = 200;

export const Cmenu_if_buildsetup = 300; // Menus with Interface only (Game unpaused)
export const Cmenu_if_selplace = 301;
export const Cmenu_if_debug = 302;
export const Cmenu_if_chat = 305;

// Classes (Cclass)

export const Cclass_global = 0;
export const Cclass_world = 0; // Global/World
export const Cclass_object = 1; // Object Class ID
export const Cclass_unit = 2; // Unit Class ID
export const Cclass_item = 3; // Item Class ID
export const Cclass_info = 4; // Info Class ID
export const Cclass_state = 5; // State Class ID

export const Cclass_building = 150; // Building Class (for Groups)

// Parent Modes (Cpm)

export const Cpm_out = 0; // Stored Outside (Visible Model)
export const Cpm_in = 1; // Stored Inside (Invisible Model)

// Icons (Cicon)

export const Cicon_save = 0;
export const Cicon_load = 1;
export const Cicon_new = 2;
export const Cicon_x = 3;
export const Cicon_colormap = 4;
export const Cicon_heightmap = 5;
export const Cicon_stuffmap = 6;
export const Cicon_left = 7;
export const Cicon_right = 8;
export const Cicon_dir = 9;
export const Cicon_up = 10;
export const Cicon_down = 11;
export const Cicon_inc = 12;
export const Cicon_dec = 13;
export const Cicon_pw = 14;
export const Cicon_distort = 15;
export const Cicon_options = 16;
export const Cicon_ok = 17;
export const Cicon_figure = 18;
export const Cicon_bag = 19;
export const Cicon_tree = 20;
export const Cicon_info = 21;
export const Cicon_dialog = 22;

export const Cicon_smooth = 23;
export const Cicon_borderup = 24;
export const Cicon_borderdown = 25;
export const Cicon_border = 26;
export const Cicon_one = 27;
export const Cicon_all = 28;
export const Cicon_grassmap = 29;

export const Cicon_mapaction = 30;
export const Cicon_script = 31;
export const Cicon_ext = 32;

export const Cicon_entity = 33;

export const Cicon_check = 41;
export const Cicon_list = 42;

export const Cicon_build = 44;
export const Cicon_cam = 45;

export const Cicon_brush = 46;
export const Cicon_spray = 47;
export const Cicon_sun = 48;
export const Cicon_moon = 49;
export const Cicon_update = 50;
export const Cicon_file = 51;
export const Cicon_parentdir = 52;
export const Cicon_soundfile = 53;
export const Cicon_imagefile = 54;
export const Cicon_stranded = 55;
export const Cicon_zoom = 56;
export const Cicon_settoterrain = 57;
export const Cicon_flatten = 58;
export const Cicon_updown = 59;

export const Cicon_trange = 60;
export const Cicon_ttime = 61;
export const Cicon_tcount = 62;

export const Cicon_sleep = 63;

export const Cicon_ex1 = 64;
export const Cicon_ex5 = 65;
export const Cicon_exall = 66;

export const Cicon_map = 67;
export const Cicon_select = 68;

export const Cicon_s2script = 73;

export const Cicon_plotbrush = 74;
export const Cicon_linebrush = 75;

export const Cicon_globe = 76;
export const Cicon_hand = 77;
export const Cicon_eat = 80;

// Bitmap Fonts (Cbmpf)

export const Cbmpf_norm = 0;
export const Cbmpf_over = 1;
export const Cbmpf_yellow = 1;
export const Cbmpf_dark = 2;
export const Cbmpf_red = 3;
export const Cbmpf_green = 4;
export const Cbmpf_tiny = 5;
export const Cbmpf_handwriting = 6;
export const Cbmpf_hw = 6;

// Ressources (Cres)

export const Cres_image = 0;
export const Cres_texture = 1;
export const Cres_sound = 2;
export const Cres_mesh = 3;
export const Cres_animmesh = 4;
export const Cres_music = 5;

// Keys (Ckey)

export const Ckey_forward = 0;
export const Ckey_backward = 1;
export const Ckey_left = 2;
export const Ckey_right = 3;

export const Ckey_jump = 4;
export const Ckey_sleep = 5;

export const Ckey_attack1 = 6;
export const Ckey_attack2 = 7;
export const Ckey_next = 8;
export const Ckey_prev = 9;
export const Ckey_drop = 10;

export const Ckey_use = 11;
export const Ckey_chat = 16;
export const Ckey_char = 12;
export const Ckey_items = 13;
export const Ckey_diary = 17;
export const Ckey_quicksave = 14;
export const Ckey_quickload = 15;

// Materials (Cmat)

export const Cmat_c = 11;

export const Cmat_none = 0;
export const Cmat_wood = 1;
export const Cmat_stone = 2;
export const Cmat_dirt = 3;
export const Cmat_dust = 4;
export const Cmat_leaf = 5;
export const Cmat_metal = 6;
export const Cmat_flesh = 7;
export const Cmat_water = 8;
export const Cmat_lava = 9;
export const Cmat_fruit = 10;
export const Cmat_glass = 11;

// States (Cstate)

export const Cstate_bleeding = 1;
export const Cstate_intoxication = 2;
export const Cstate_pus = 3;
export const Cstate_fire = 4;
export const Cstate_eternalfire = 5;
export const Cstate_frostbite = 6;
export const Cstate_fracture = 7;
export const Cstate_electroshock = 8;
export const Cstate_bloodrush = 9;
export const Cstate_dizzy = 10;
export const Cstate_wet = 11;
export const Cstate_fuddle = 12;

export const Cstate_healing = 16;
export const Cstate_invulnerability = 17;
export const Cstate_tame = 18;

export const Cstate_action = 21;
export const Cstate_flare = 22;
export const Cstate_smoke = 23;
export const Cstate_light = 24;
export const Cstate_particles = 25;

export const Cstate_phy = 51; // Physical Forces
export const Cstate_buildplace = 52; // Object is a Buildplace
export const Cstate_link = 53; // Object is linked to Another Object
export const Cstate_speedmod = 54; // Unit Speedmodification
export const Cstate_ghost = 55; // Object has no collision

export const Cstate_ai_stick = 60; // AI does not move

export const Cstate_pc_build = 100; // Process: Build
export const Cstate_pc_dig = 151; // Process: Dig
export const Cstate_pc_fish = 152; // Process: Fish
export const Cstate_pc_custom = 153; // Process: Custom

// Particles (Cp)

// 3D / Sprites
export const Cp_attack = 4;
export const Cp_debug = 5;
export const Cp_bubbles = 10;
export const Cp_rwave = 11;
export const Cp_splash = 12;
export const Cp_wave = 15;
export const Cp_hover = 19;
export const Cp_smoke = 20;
export const Cp_spark = 21;
export const Cp_splatter = 22;
export const Cp_subsplatter = 23;
export const Cp_wood = 24;
export const Cp_puddle = 25;
export const Cp_flames = 30;
export const Cp_firespark = 35;
export const Cp_risingflare = 40;
export const Cp_explode = 45;
export const Cp_shockwave = 46;
export const Cp_starflare = 50;
export const Cp_spawn = 51;
export const Cp_impact = 60;
export const Cp_rain = 70;
export const Cp_snow = 71;
export const Cp_fade = 98;
export const Cp_seqfade = 99;
export const Cp_flash = 100;
export const Cp_fadeout = 101;
export const Cp_fall = 102;
export const Cp_resfade = 103;
export const Cp_stuck = 104;

// 2D
export const Cp2d_blackrect = -1;
export const Cp2d_item = -2;
export const Cp2d_dot = -3;
export const Cp2d_cdot = -4;

// Projectile "Tails"

// Normal
export const Cpro_smoke = 1;
export const Cpro_fire = 2;
export const Cpro_poison = 3;
export const Cpro_blood = 4;
export const Cpro_wet = 5;
export const Cpro_healing = 6;
export const Cpro_tame = 7;

// Adjustable
export const Cpro_asmoke = 10;
export const Cpro_asparkle = 11;
export const Cpro_asupersparkle = 12;
export const Cpro_aresfade = 13;

// AI Modes

// Modes
export const ai_idle = 50; // Idle
export const ai_move = 51; // Move
export const ai_movel = 52; // Move Left
export const ai_mover = 53; // Move Right
export const ai_turnl = 54; // Turn Left
export const ai_turnr = 55; // Turn Right

export const ai_rise = 60; // Rise (Birds)
export const ai_fall = 61; // Fall (Birds)

export const ai_return = 101; // Return to AI Center
export const ai_sreturn = 102; // Return to AI Center (Strict!)
export const ai_attack = 103; // Attack
export const ai_hunt = 104; // Hunt Player

export const ai_movetarget = 150; // Move to Target
export const ai_getfood = 151; // Move to Target + Eat it!
export const ai_flee = 152; // Run Away from Target

export const ai_sani = 155; // Script Animation

// Mode Levels
export const ail_superior = 149; // Superior Mode Level Starting at 149

// Attitudes
export const ai_passive = 0;
export const ai_shy = 1;
export const ai_agressive = 2;

// Signals
export const ai_food = 2;
export const ai_attract = 1;
export const ai_distract = -1;

// Animations

export const ani_idle1 = 1;
export const ani_idle2 = 2;
export const ani_idle3 = 3;
export const ani_move = 10;
export const ani_attack = 11;
export const ani_use = 12;
export const ani_die = 13;
export const ani_special = 14;

// Sounds

export const snd_spot = 1;
export const snd_attack = 2;
export const snd_idle1 = 3;
export const snd_idle2 = 4;
export const snd_idle3 = 5;
export const snd_die = 6;
export const snd_flee = 7;
export const snd_move = 8;


// Materials (includes/load_materials.bb)

function matTable(entries: [number, number][]): number[] {
	const t: number[] = new Array(Cmat_c + 1).fill(0);
	for (const [mat, v] of entries) t[mat] = v;
	return t;
}

/** Dmat_swim: 0 = sinks, 1 = swims, 2 = hovers in water */
export const Dmat_swim: readonly number[] = matTable([
	[Cmat_wood, 1],
	[Cmat_leaf, 1]
]);

/** Dmat_nofire: 1 = cannot burn */
export const Dmat_nofire: readonly number[] = matTable([
	[Cmat_stone, 1],
	[Cmat_dirt, 1],
	[Cmat_dust, 1],
	[Cmat_metal, 1],
	[Cmat_water, 1],
	[Cmat_glass, 1]
]);

/** Dmat_hard: 0 = not hard, 1 = hard (muffling), 2 = really hard (clinking) */
export const Dmat_hard: readonly number[] = matTable([
	[Cmat_none, 1],
	[Cmat_wood, 1],
	[Cmat_stone, 2],
	[Cmat_dirt, 1],
	[Cmat_dust, 1],
	[Cmat_metal, 2],
	[Cmat_flesh, 1],
	[Cmat_fruit, 1],
	[Cmat_glass, 2]
]);

/** get_material() */
export function get_material(name: string): number {
	switch (name.toLowerCase()) {
		case 'none':
			return Cmat_none;
		case 'wood':
			return Cmat_wood;
		case 'stone':
			return Cmat_stone;
		case 'dirt':
			return Cmat_dirt;
		case 'dust':
			return Cmat_dust;
		case 'leaf':
			return Cmat_leaf;
		case 'metal':
			return Cmat_metal;
		case 'flesh':
			return Cmat_flesh;
		case 'water':
			return Cmat_water;
		case 'lava':
			return Cmat_lava;
		case 'fruit':
			return Cmat_fruit;
		case 'glass':
			return Cmat_glass;
		default:
			return Int(name.toLowerCase());
	}
}
