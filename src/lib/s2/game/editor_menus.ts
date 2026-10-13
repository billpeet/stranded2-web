/**
 * includes/editor_menus.bb, ported line by line: the windows of the map
 * editor (editor_menus, one Select over m_menu), their fill function
 * (editor_setmenu) and the save helpers of the property windows.
 *
 * Layer notes (see _additions/editor_menus.ts):
 * - e_skybox() has no function in the port: the Settings window rebuilds the
 *   sky through the substitute there.
 * - ter_tex_color is not a texture in the environment layer: its existence
 *   and size are read through the substitutes there.
 */
import { EntityFX, EntityOrder, EntityPitch, EntityRoll, EntityYaw, FreeEntity, PositionEntity, RotateEntity, type Handle } from '../bb3d';
import { Float, Instr, Int, Left, Len, Mid, Replace, SEP_LINE, Str, f32, idivConst } from '../blitz';
import { Color, DrawBlock, DrawImage, FreeImage, Rect, SaveImage, type ImageHandle } from '../gfx2d';
import { e_skybox, ter_tex_color_exists, ter_tex_color_height, ter_tex_color_width } from './_additions/editor_menus';
import {
	Cbmpf_dark,
	Cbmpf_green,
	Cbmpf_red,
	Cbmpf_tiny,
	Cclass_info,
	Cclass_item,
	Cclass_object,
	Cclass_state,
	Cclass_unit,
	Cicon_all,
	Cicon_brush,
	Cicon_cam,
	Cicon_check,
	Cicon_colormap,
	Cicon_dir,
	Cicon_down,
	Cicon_grassmap,
	Cicon_heightmap,
	Cicon_inc,
	Cicon_info,
	Cicon_left,
	Cicon_list,
	Cicon_load,
	Cicon_moon,
	Cicon_new,
	Cicon_ok,
	Cicon_options,
	Cicon_right,
	Cicon_save,
	Cicon_script,
	Cicon_spray,
	Cicon_sun,
	Cicon_up,
	Cicon_update,
	Cicon_x,
	Cicon_zoom,
	Cmenu_ed_attachments,
	Cmenu_ed_colormap,
	Cmenu_ed_grassmap,
	Cmenu_ed_heightmap,
	Cmenu_ed_infolist,
	Cmenu_ed_infos,
	Cmenu_ed_items,
	Cmenu_ed_list,
	Cmenu_ed_load,
	Cmenu_ed_map,
	Cmenu_ed_new,
	Cmenu_ed_objects,
	Cmenu_ed_options,
	Cmenu_ed_quit,
	Cmenu_ed_random,
	Cmenu_ed_save,
	Cmenu_ed_scripts,
	Cmenu_ed_settings,
	Cmenu_ed_states,
	Cmenu_ed_units,
	Cpm_in,
	Cpm_out,
	Cstate_flare,
	Cstate_light,
	Cstate_particles
} from './consts';
import {
	Dinfo_descr,
	Dinfo_frame,
	Dinfo_name,
	Ditem_descr,
	Ditem_health,
	Ditem_iconh,
	Ditem_name,
	Dobject_descr,
	Dobject_health,
	Dobject_iconh,
	Dobject_name,
	Dobject_spawn,
	Dstate_frame,
	Dstate_name,
	Dunit_descr,
	Dunit_health,
	Dunit_iconh,
	Dunit_name
} from './defs_arrays';
import { e_environment_update_light, e_tercol, e_terraincm, e_terraincmscale, e_terrainhm } from './e_environment';
import { load_map, load_recent } from './e_load_map';
import { save_map } from './e_save_map';
import {
	editor_buffertoheightmap,
	editor_buffertotex,
	editor_bufferwin,
	editor_defaultmapsettings,
	editor_gencolormap,
	editor_genmap,
	editor_getskybox,
	editor_grassmaptobuffer,
	editor_heightmaptobuffer,
	editor_ini,
	editor_jumpto,
	editor_picking,
	editor_quit,
	editor_resetcam,
	editor_setmode,
	editor_testmap,
	editor_textobuffer
} from './editor_functions';
import { FileType } from './files';
import { split, stripext } from './functions';
import { game_cd_object } from './game_changeday';
import { grass_heightmap, grass_map } from './grasspread';
import {
	gui_check,
	gui_classselbox,
	gui_colorbox,
	gui_healthbar,
	gui_ibutton,
	gui_iconbox,
	gui_iconboxc,
	gui_input,
	gui_msg,
	gui_msgdecide,
	gui_operator,
	gui_opt,
	gui_scrollbar,
	gui_slider,
	gui_txtb,
	gui_win_color,
	gui_win_command,
	gui_win_defvars,
	gui_win_file,
	gui_win_text
} from './gui';
import { gui_tb, gui_tb_filled, gui_tb_loadfile, gui_tb_loadstring, gui_tb_savefile, gui_tb_savestring, gui_tb_scripthelper_list } from './gui_tb';
import { con_info, free_info, info_setupsprite, info_vts } from './handle_infos';
import { con_item, free_item, set_item, store_item } from './handle_items';
import { con_object, free_object } from './handle_objects';
import { free_state, look_state, set_state } from './handle_states';
import { con_unit, free_unit } from './handle_units';
import { if_map } from './interface';
import { bmpf_txt, bmpf_txt_c, bmpf_txt_rect } from './load_bmpf';
import { se, sm, ss } from './load_strings';
import { menu_start } from './menu';
import { p_kill2d } from './particles';
import { load_randommap, randommap } from './randommap';
import { G } from './state';
import { ExecFile } from './sys';
import { After, Delete, First, New, Tat, Tdefvar, Tinfo, Titem, Tobject, Trecent, Tstate, Tunit, Tx } from './types';

//############################################ EDITOR MENUS

/** Function editor_menus() */
export async function editor_menus(): Promise<void> {
	let c1 = 0;
	let Tobject_: Tobject | null = null;
	let c2 = 0;
	let Tunit_: Tunit | null = null;
	let c3 = 0;
	let cstored = 0;
	let Titem_: Titem | null = null;
	let c4 = 0;
	let Tinfo_: Tinfo | null = null;
	let c5 = 0;
	let Tstate_: Tstate | null = null;
	let c6 = 0;
	let Tx_: Tx | null = null;
	let objectfit = 0;
	let unitfit = 0;
	let name = '';
	let delcount = 0;
	let delstored = 0;
	let statedel = 0;
	let scriptdel = 0;
	let itemdel = 0;
	let y = 0;
	let Tat_: Tat | null = null;
	let j = 0;
	let i = 0;
	let c = 0;
	let path = '';
	let doload = 0;
	let Trecent_: Trecent | null = null;
	const menu: number = 0; // quirk: never assigned; only read in editor_ini(menu=Cmenu_ed_new)
	let dosave = 0;
	let grey = 0;
	let a = 0;
	let x = 0;
	let typ = 0;
	let h: Handle = null;
	let scrolldown = 0;
	let defvars = 0;
	let Tdefvar_: Tdefvar | null = null;
	let img: ImageHandle = 0;
	let over = 0;

	switch (G.m_menu) {
		//Blank
		case 0:
			break;

		//New
		case Cmenu_ed_new:
			DrawImage(G.gfx_win, 215, 0);
			if (gui_ibutton(742, 5, Cicon_x, sm(15), 1, 0, 1)) G.m_menu = 0;
			DrawImage(G.gfx_icons, 236, 5, Cicon_new);
			bmpf_txt(236 + 37, 10, se(1) + '...');
			DrawImage(G.gfx_winbar, 215, 42);

			//Size
			bmpf_txt(236, 63, se(30) + ':');

			bmpf_txt(450, 63, se(31) + ':', 4);
			gui_opt(450, 63 + 20, '16x16', 0, 3);
			gui_opt(450, 63 + 40, '32x32', 1, 3);
			//gui_opt(450,63+60,"64x64",2,3)

			bmpf_txt(550, 63, se(32) + ':', 1);
			gui_opt(550, 63 + 20, '64x64', 3, 3); //gui_opt(550,63+20,"128x128",3,3)
			gui_opt(550, 63 + 40, '128x128', 4, 3); //gui_opt(550,63+40,"256x256",4,3)
			//gui_opt(550,63+60,"512x512",5,3)

			bmpf_txt(650, 63, se(33) + ':', 3);
			gui_opt(650, 63 + 20, '256x256', 6, 3); //gui_opt(650,63+20,"1024x1024",6,3)
			//gui_opt(650,63+40,"512x512",7,3,0) ;gui_opt(650,63+40,"2048x2048",7,3,0)
			//gui_opt(650,63+60,"4096x4096",8,3,0)

			//Terrain
			bmpf_txt(236, 163, se(34) + ':');
			gui_opt(450, 163, se(35), 0, 4);
			gui_opt(450, 163 + 20, se(36), 1, 4);
			gui_opt(450, 163 + 40, se(37), 2, 4);
			gui_opt(450, 163 + 60, se(38), 3, 4);
			gui_opt(450, 163 + 80, se(39), 4, 4);
			gui_opt(450, 163 + 100, se(40), 5, 4);

			//Vegetation
			//bmpf_txt(236,303,se$(41)+":")
			//gui_opt(450,303,se$(42),0,5)
			//gui_opt(450,303+20,se$(43),1,5)
			//gui_opt(450,303+40,se$(44),2,5)
			//gui_opt(450,303+60,se$(45),3,5)
			//gui_opt(450,303+80,se$(46),4,5)
			//gui_opt(450,303+100,se$(47),5,5)

			//gui_check(450,303+140,se$(48),5,in_opt(5)>0)
			//gui_check(450,303+160,se$(49),6,in_opt(5)>0)
			//gui_check(450,303+180,se$(50),7,in_opt(5)>0)
			//gui_check(450,303+200,se$(51),8,in_opt(5)>0)

			//Cancel/Okay
			if (gui_ibutton(742, 542, Cicon_ok, sm(5))) {
				editor_defaultmapsettings(); //Standardmapeinstellungen
				await editor_genmap(); //Map generieren (Zufall und so)
				await editor_gencolormap(); //Colormap generieren (aus Heightmap)
				grass_map(); //Grassmap generieren (aus Colormap)
				grass_heightmap(); //Grassmap anpassen (an Heightmap)
				G.m_menu = 0;
				G.in_edmap = '';
				editor_resetcam();
			}
			if (gui_ibutton(742 - 37, 542, Cicon_x, sm(3))) G.m_menu = 0;
			break;

		//Settings
		case Cmenu_ed_settings:
			DrawImage(G.gfx_win, 215, 0);
			if (gui_ibutton(742, 5, Cicon_x, sm(15), 1, 0, 1)) G.m_menu = 0;
			DrawImage(G.gfx_icons, 236, 5, Cicon_options);
			bmpf_txt(236 + 37, 10, se(4) + '...');
			DrawImage(G.gfx_winbar, 215, 42);

			//Time
			bmpf_txt(236, 63, se(52) + ':');
			gui_input(450, 63, 128, 3);
			gui_check(590, 63, se(53), 5);

			//Skybox
			bmpf_txt(236, 88, se(54) + ':');
			gui_input(450, 88, 256, 4, 1, se(55));
			//Browse
			if (gui_ibutton(742, 83, Cicon_dir, se(75))) {
				if (await gui_win_file(se(56), G.set_rootdir + 'mods\\' + G.set_moddir + '\\skies', '', 1)) {
					G.in_input[4] = editor_getskybox(G.in_win_file);
				}
			}

			//Multiplayer
			bmpf_txt(236, 118, sm(43) + ':');
			gui_check(450, 118, se(57), 6);

			//Climate
			bmpf_txt(236, 143, se(58) + ':');
			gui_opt(450, 143, se(59), 0, 3); //Normal (Sun/Rain)
			gui_opt(450, 143 + 20, se(60), 1, 3); //Arctic (Sun/Snow)
			gui_opt(450, 143 + 40, se(61), 2, 3); //Sun only
			gui_opt(450, 143 + 60, se(62), 3, 3); //Rain only
			gui_opt(580, 143 + 40, se(63), 4, 3); //Snow only
			gui_opt(580, 143 + 60, se(64), 5, 3); //Lightning only

			//Background Music
			bmpf_txt(236, 225, se(65) + ':');
			gui_input(450, 225, 256, 5, 1, se(66));
			//Browse
			if (gui_ibutton(742, 220, Cicon_dir, se(75))) {
				if (await gui_win_file(se(67), G.set_rootdir + 'mods\\' + G.set_moddir + '\\sfx', '', 1)) {
					G.in_input[5] = G.in_win_file;
				}
			}

			//Fog
			bmpf_txt(236, 255, se(68) + ':');
			if (gui_colorbox(G.map_fog[0], G.map_fog[1], G.map_fog[2], 450, 255, 32, 16, se(76))) {
				G.in_slider[0] = Int(f32(Float(G.map_fog[0]) / f32(2.55)));
				G.in_slider[1] = Int(f32(Float(G.map_fog[1]) / f32(2.55)));
				G.in_slider[2] = Int(f32(Float(G.map_fog[2]) / f32(2.55)));
				if (await gui_win_color()) {
					G.map_fog[0] = G.in_win_color[0];
					G.map_fog[1] = G.in_win_color[1];
					G.map_fog[2] = G.in_win_color[2];
				}
			}

			gui_check(500, 255, se(69), 7);

			//Global
			bmpf_txt(236, 285, se(70));
			gui_tb(450, 285, 285, 16);
			if (gui_ibutton(742, 285, Cicon_script, se(71))) {
				editor_savescript(0);
				G.in_input[3] = Str(0);
				editor_setmenu(Cmenu_ed_scripts);
			}

			//Checkmap
			if (gui_ibutton(236, 542, Cicon_check, se(72))) {
				await editor_testmap();
			}
			//Options
			if (gui_ibutton(236 + 37, 542, Cicon_options, se(73))) editor_setmenu(Cmenu_ed_options);
			//Infolist
			if (gui_ibutton(236 + 37 + 37, 542, Cicon_list, se(74))) editor_setmenu(Cmenu_ed_infolist);
			//Attachments
			if (gui_ibutton(236 + 37 + 37 + 37, 542, Cicon_dir, se(186))) editor_setmenu(Cmenu_ed_attachments);

			//Cancel/Okay
			if (gui_ibutton(742, 542, Cicon_ok, sm(5))) {
				editor_savesettings();
				G.m_menu = 0;
				//Sky
				if (G.env_sky !== null) FreeEntity(G.env_sky);
				// layer: e_skybox is the substitute of _additions/editor_menus.ts (the sky belongs to the
				// environment layer, which also applies the three entity commands; G.env_sky stays null)
				if (G.map_skybox === '') {
					G.env_sky = await e_skybox('skies\\sky');
				} else {
					G.env_sky = await e_skybox('skies\\' + G.map_skybox);
				}
				if (G.env_sky !== null) {
					EntityFX(G.env_sky, 1 + 8);
					EntityOrder(G.env_sky, 3);
					PositionEntity(G.env_sky, 0, 500, 0);
				}
				e_environment_update_light();
			}
			if (gui_ibutton(742 - 37, 542, Cicon_x, sm(3))) G.m_menu = 0;
			break;

		//Infolist
		case Cmenu_ed_infolist:
			DrawImage(G.gfx_win, 215, 0);
			if (gui_ibutton(742, 5, Cicon_x, sm(15), 1, 0, 1)) G.m_menu = 0;
			DrawImage(G.gfx_icons, 236, 5, Cicon_list);
			bmpf_txt(236 + 37, 10, se(74));
			DrawImage(G.gfx_winbar, 215, 42);

			//Size (Terrain)
			bmpf_txt(236, 63, se(77) + ':');
			bmpf_txt(450, 63, Str(G.ter_size) + 'x' + Str(G.ter_size));
			//Size (Colormap)
			bmpf_txt(236, 83, se(78) + ':');
			// layer: ter_tex_color<>0 / TextureWidth(ter_tex_color) / TextureHeight(ter_tex_color) through _additions
			if (ter_tex_color_exists()) {
				bmpf_txt(450, 83, Str(ter_tex_color_width()) + 'x' + Str(ter_tex_color_height()) + ' Pixel');
			} else {
				bmpf_txt(450, 83, 'N/A', Cbmpf_red);
			}

			//Counts
			bmpf_txt(236, 123, se(7) + ':');
			c1 = 0;
			for (Tobject_ = First(Tobject); Tobject_ !== null; Tobject_ = After(Tobject, Tobject_)) c1 = c1 + 1;
			bmpf_txt(450, 123, Str(c1));
			bmpf_txt(236, 143, se(8) + ':');
			c2 = 0;
			for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) c2 = c2 + 1;
			bmpf_txt(450, 143, Str(c2));
			bmpf_txt(236, 163, se(9) + ':');
			c3 = 0;
			cstored = 0;
			for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
				c3 = c3 + 1;
				if (Titem_.parent_class !== 0) cstored = cstored + 1;
			}
			bmpf_txt(450, 163, Str(c3) + ' ' + ss(se(79), Str(cstored)));
			bmpf_txt(236, 183, se(10) + ':');
			c4 = 0;
			for (Tinfo_ = First(Tinfo); Tinfo_ !== null; Tinfo_ = After(Tinfo, Tinfo_)) c4 = c4 + 1;
			bmpf_txt(450, 183, Str(c4));
			bmpf_txt(236, 203, se(80) + ':');
			c5 = 0;
			for (Tstate_ = First(Tstate); Tstate_ !== null; Tstate_ = After(Tstate, Tstate_)) c5 = c5 + 1;
			bmpf_txt(450, 203, Str(c5));
			bmpf_txt(236, 223, se(81) + ':');
			c6 = 0;
			for (Tx_ = First(Tx); Tx_ !== null; Tx_ = After(Tx, Tx_)) c6 = c6 + 1;
			bmpf_txt(450, 223, Str(c6));

			bmpf_txt(236, 243, '----------', Cbmpf_dark);
			bmpf_txt(450, 243, '----------', Cbmpf_dark);

			bmpf_txt(236, 263, se(82) + ':');
			bmpf_txt(450, 263, Str(c1 + c2 + c3 + c4 + c5 + c6) + ss(se(83), Str(c1 + c2 + c3)));

			//Okay
			if (gui_ibutton(742, 542, Cicon_ok, sm(5))) G.m_menu = 0;
			break;

		//Options
		case Cmenu_ed_options:
			DrawImage(G.gfx_win, 215, 0);
			if (gui_ibutton(742, 5, Cicon_x, sm(15), 1, 0, 1)) G.m_menu = 0;
			DrawImage(G.gfx_icons, 236, 5, Cicon_options);
			bmpf_txt(236 + 37, 10, se(73));
			DrawImage(G.gfx_winbar, 215, 42);

			//Health
			if (gui_ibutton(236, 63, Cicon_ok, se(84))) {
				if (await gui_msgdecide(se(85))) {
					//Local objectfit
					//Local unitfit
					for (Tobject_ = First(Tobject); Tobject_ !== null; Tobject_ = After(Tobject, Tobject_)) {
						if (Tobject_.health_max > Dobject_health(Tobject_.typ)) {
							Tobject_.health_max = f32(Dobject_health(Tobject_.typ));
							if (Tobject_.health > Tobject_.health_max) {
								Tobject_.health = Tobject_.health_max;
							}
							objectfit = objectfit + 1;
						} else if (Tobject_.health_max < Dobject_health(Tobject_.typ)) {
							Tobject_.health_max = f32(Dobject_health(Tobject_.typ));
							Tobject_.health = Tobject_.health_max;
							objectfit = objectfit + 1;
						}
					}
					for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
						if (Tunit_.health_max > Dunit_health(Tunit_.typ)) {
							Tunit_.health_max = f32(Dunit_health(Tunit_.typ));
							if (Tunit_.health > Tunit_.health_max) {
								Tunit_.health = Tunit_.health_max;
							}
							unitfit = unitfit + 1;
						} else if (Tunit_.health_max < Dunit_health(Tunit_.typ)) {
							Tunit_.health_max = f32(Dunit_health(Tunit_.typ));
							Tunit_.health = Tunit_.health_max;
							unitfit = unitfit + 1;
						}
					}
					if (objectfit + unitfit > 0) {
						await gui_msg(ss(se(86), Str(objectfit), Str(unitfit)), Cbmpf_green);
					} else {
						await gui_msg(se(87), Cbmpf_red);
					}
				}
			}
			bmpf_txt(273, 63, se(84));
			bmpf_txt(273, 79, se(88), Cbmpf_tiny);

			//Free
			if (gui_ibutton(236, 100, Cicon_ok, se(89), G.in_opt[0] > 0 ? 1 : 0)) {
				//Local name$
				switch (G.in_opt[0]) {
					case Cclass_object:
						name = Dobject_name(G.in_object_sel);
						break;
					case Cclass_unit:
						name = Dunit_name(G.in_unit_sel);
						break;
					case Cclass_item:
						name = Ditem_name(G.in_item_sel);
						break;
					case Cclass_info:
						name = Dinfo_name(G.in_info_sel);
						break;
				}
				if (await gui_msgdecide(ss(se(90), name))) {
					//Local delcount
					switch (G.in_opt[0]) {
						case Cclass_object:
							for (Tobject_ = First(Tobject); Tobject_ !== null; Tobject_ = After(Tobject, Tobject_)) {
								if (Tobject_.typ === G.in_object_sel) {
									free_object(Tobject_.id);
									delcount = delcount + 1;
								}
							}
							break;
						case Cclass_unit:
							for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
								if (Tunit_.typ === G.in_unit_sel) {
									free_unit(Tunit_.id);
									delcount = delcount + 1;
								}
							}
							break;
						case Cclass_item:
							delstored = await gui_msgdecide(se(91), 0, sm(2), sm(1));
							for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
								if (Titem_.typ === G.in_item_sel) {
									if (delstored === 1 || Titem_.parent_class === 0) {
										free_item(Titem_.id);
										delcount = delcount + 1;
									}
								}
							}
							break;
						case Cclass_info:
							for (Tinfo_ = First(Tinfo); Tinfo_ !== null; Tinfo_ = After(Tinfo, Tinfo_)) {
								if (Tinfo_.typ === G.in_info_sel) {
									free_info(Tinfo_.id);
									delcount = delcount + 1;
								}
							}
							break;
					}
					if (delcount > 0) {
						await gui_msg(ss(se(92), Str(delcount), name), Cbmpf_green);
					} else {
						await gui_msg(ss(se(93), name), Cbmpf_red);
					}
				}
			}
			bmpf_txt(273, 100, se(89));
			bmpf_txt(273, 116, se(94), Cbmpf_tiny);

			//Free
			if (gui_ibutton(236, 137, Cicon_ok, se(95))) {
				//Local statedel
				//Local scriptdel
				//Local itemdel
				if (await gui_msgdecide(se(96))) {
					for (Tstate_ = First(Tstate); Tstate_ !== null; Tstate_ = After(Tstate, Tstate_)) {
						free_state(Tstate_.typ, Tstate_.parent_class, Tstate_.parent_id);
						statedel = statedel + 1;
					}
				}
				if (await gui_msgdecide(se(97))) {
					for (Tx_ = First(Tx); Tx_ !== null; Tx_ = After(Tx, Tx_)) {
						if (Tx_.mode === 0) {
							Delete(Tx, Tx_);
							scriptdel = scriptdel + 1;
						}
					}
				}
				if (await gui_msgdecide(se(98))) {
					for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
						if (Titem_.parent_class !== 0) {
							free_item(Titem_.id);
							itemdel = itemdel + 1;
						}
					}
				}
				if (statedel + scriptdel + itemdel > 0) {
					await gui_msg(ss(se(99), Str(statedel), Str(scriptdel), Str(itemdel)), Cbmpf_green);
				} else {
					await gui_msg(se(101), Cbmpf_red);
				}
			}
			bmpf_txt(273, 137, se(95));
			bmpf_txt(273, 153, se(100), Cbmpf_tiny);

			//Cancel/Okay
			if (gui_ibutton(742, 542, Cicon_ok, sm(5))) editor_setmenu(Cmenu_ed_settings);
			break;

		//Attachments
		case Cmenu_ed_attachments:
			DrawImage(G.gfx_win, 215, 0);
			if (gui_ibutton(742, 5, Cicon_x, sm(15), 1, 0, 1)) G.m_menu = 0;
			DrawImage(G.gfx_icons, 236, 5, Cicon_dir);
			bmpf_txt(236 + 37, 10, se(186));
			DrawImage(G.gfx_winbar, 215, 42);

			//Black Rect
			Color(0, 0, 0);
			Rect(236, 63, 537, 435 + 37, 1);

			//List Attachments
			y = 0;
			for (Tat_ = First(Tat); Tat_ !== null; Tat_ = After(Tat, Tat_)) {
				//Name
				bmpf_txt(236 + 37 + 5, 63 + y * 37 + 12, Tat_.path);

				//Button
				if (gui_ibutton(236 + 5, 63 + y * 37 + 5, Cicon_x, se(188))) {
					Delete(Tat, Tat_);
				}

				//Pos
				y = y + 1;
				if (y >= 12) {
					y = -1;
					break;
				}
			}

			//Add
			if (gui_ibutton(236, 542, Cicon_inc, se(187) + '...', y !== -1 ? 1 : 0)) {
				if (await gui_win_file(se(187) + '...', G.set_rootdir + 'mods\\' + G.set_moddir, '')) {
					//gui_win_file(se$(67),set_rootdir$+"mods\"+set_moddir$+"\sfx","",1)
					Tat_ = New(Tat);
					if (Instr(G.in_win_path, G.set_rootdir + 'mods\\' + G.set_moddir + '\\') === 1) {
						G.in_win_path = Replace(G.in_win_path, G.set_rootdir + 'mods\\' + G.set_moddir + '\\', '');
						Tat_.path = G.in_win_path + G.in_win_file;
					} else {
						// quirk: the new Tat stays in the list with an empty path
						await gui_msg(se(189), Cbmpf_red);
					}
				}
			}

			//Cancel/Okay
			if (gui_ibutton(742, 542, Cicon_ok, sm(5))) editor_setmenu(Cmenu_ed_settings);
			break;

		//Random
		case Cmenu_ed_random:
			DrawImage(G.gfx_win, 215, 0);
			if (gui_ibutton(742, 5, Cicon_x, sm(15), 1, 0, 1)) G.m_menu = 0;
			DrawImage(G.gfx_icons, 236, 5, Cicon_all);
			bmpf_txt(236 + 37, 10, se(216));
			DrawImage(G.gfx_winbar, 215, 42);

			//Amount
			bmpf_txt(236, 63, se(143) + ':');
			gui_input(450, 63, 256, 3);

			//Objects
			bmpf_txt(236, 100, se(203) + ':');
			gui_check(450, 100, se(7), 5);
			gui_check(450, 100 + 20, se(8), 6);
			gui_check(450, 100 + 20 + 20, se(9), 7);

			//Profile
			bmpf_txt(236, 283, se(129) + ':');
			y = 0;
			Color(0, 0, 0);
			Rect(431, 278, 306, 298, 1);
			j = 0;
			y = 0;
			for (i = 1; i <= G.Crandom_c; i++) {
				if (G.Drprofile[i] !== '') {
					j = j + 1;
					if (j > G.in_scr_scr) {
						gui_opt(436, 283 + y * 20, G.Drprofile[i], i, 5);
						y = y + 1;
						if (y > 13) break;
					}
				}
			}

			//Scroll
			if (gui_ibutton(742, 283, Cicon_up, sm(29), G.in_scr_scr > 0 ? 1 : 0)) {
				G.in_scr_scr = G.in_scr_scr - 1;
			}
			if (gui_ibutton(742, 542 - 37, Cicon_down, sm(30), y > 13 ? 1 : 0)) {
				G.in_scr_scr = G.in_scr_scr + 1;
			}

			if (G.in_mzs > 0 && G.in_scr_scr > 0) G.in_scr_scr = G.in_scr_scr - 1;
			if (G.in_mzs < 0 && y > 13) G.in_scr_scr = G.in_scr_scr + 1;

			c = 0;
			for (i = 1; i <= G.Crandom_c; i++) {
				if (G.Drprofile[i] !== '') c = c + 1;
			}
			G.in_scr_scr = gui_scrollbar(742, 320, 180, c, G.in_scr_scr, 14);

			//Cancel/Okay
			if (gui_ibutton(742, 542, Cicon_ok, sm(5))) {
				if (Int(G.in_input[3]) > 0) {
					load_randommap(G.in_opt[5]);
					randommap(Int(G.in_input[3]), G.in_check[5], G.in_check[6], G.in_check[7]);
				}
				G.m_menu = 0;
			}
			break;

		//Quit
		case Cmenu_ed_quit:
			DrawImage(G.gfx_win, 215, 0);
			if (gui_ibutton(742, 5, Cicon_x, sm(15), 1, 0, 1)) G.m_menu = 0;
			DrawImage(G.gfx_icons, 236, 5, Cicon_x);
			bmpf_txt(236 + 37, 10, se(5) + '...');
			DrawImage(G.gfx_winbar, 215, 42);

			//Text
			bmpf_txt(236, 63, se(102));
			bmpf_txt(236, 83, se(103), 3);

			//Cancel/Okay
			if (gui_ibutton(742, 542, Cicon_ok, sm(5))) {
				editor_quit();
				await menu_start();
			}
			if (gui_ibutton(742 - 37, 542, Cicon_x, sm(3))) G.m_menu = 0;
			break;

		//Load
		case Cmenu_ed_load:
			DrawImage(G.gfx_win, 215, 0);
			if (gui_ibutton(742, 5, Cicon_x, sm(15), 1, 0, 1)) G.m_menu = 0;
			DrawImage(G.gfx_icons, 236, 5, Cicon_load);
			bmpf_txt(236 + 37, 10, se(2) + '...');
			DrawImage(G.gfx_winbar, 215, 42);

			//Name/PW
			bmpf_txt(236, 63, se(104) + ':');
			gui_input(450, 63, 256, 3);
			bmpf_txt(236, 88, se(105) + ':');
			gui_input(450, 88, 128, 4);

			//Browse
			if (gui_ibutton(742, 63, Cicon_dir, se(75))) {
				if (await gui_win_file(se(2) + '...', G.set_rootdir + 'mods\\' + G.set_moddir + '\\maps', '', 0)) {
					path = Replace(G.in_win_path, G.set_rootdir + 'mods\\' + G.set_moddir + '\\maps', '');
					if (Left(path, 1) === '\\') path = Mid(path, 2, -1);
					G.in_input[3] = path + stripext(G.in_win_file);
				}
			}

			//Recent
			y = 1;
			doload = 0;
			for (Trecent_ = First(Trecent); Trecent_ !== null; Trecent_ = After(Trecent, Trecent_)) {
				if (gui_txtb(236, 110 + y * 20, Trecent_.file)) {
					G.in_input[3] = Trecent_.file;
					if (Left(G.in_input[3], 5) === 'maps\\' || Left(G.in_input[3], 5) === 'maps/') {
						G.in_input[3] = Mid(G.in_input[3], 6, -1);
					}
					doload = 1;
				}
				y = y + 1;
			}

			//Okay
			if ((gui_ibutton(742, 542, Cicon_ok, sm(5)) | doload) !== 0) {
				G.in_input[3] = Replace(G.in_input[3], '.S2', '');
				G.in_input[3] = Replace(G.in_input[3], '.s2', '');
				if (Instr(G.in_input[3], ':')) {
					if (await load_map(G.in_input[3] + '.s2', G.in_input[4])) {
						load_recent(G.in_input[3] + '.s2');
						G.in_edmap = G.in_input[3];
						G.m_menu = 0;
						editor_resetcam();
					} else {
						await gui_msg(se(106), Cbmpf_red);
						// quirk: "menu=Cmenu_ed_new" is a comparison of the local menu (0) with 1: editor_ini(0)
						await editor_ini(menu === Cmenu_ed_new ? 1 : 0);
					}
				} else {
					if (await load_map('maps\\' + G.in_input[3] + '.s2', G.in_input[4])) {
						load_recent('maps\\' + G.in_input[3] + '.s2');
						G.in_edmap = G.in_input[3];
						G.m_menu = 0;
						editor_resetcam();
					} else {
						await gui_msg(se(106), Cbmpf_red);
						// quirk: "menu=Cmenu_ed_new" is a comparison of the local menu (0) with 1: editor_ini(0)
						await editor_ini(menu === Cmenu_ed_new ? 1 : 0);
					}
				}
			}
			//Cancel
			if (gui_ibutton(742 - 37, 542, Cicon_x, sm(3))) G.m_menu = 0;
			break;

		//Save
		case Cmenu_ed_save:
			DrawImage(G.gfx_win, 215, 0);
			if (gui_ibutton(742, 5, Cicon_x, sm(15), 1, 0, 1)) G.m_menu = 0;
			DrawImage(G.gfx_icons, 236, 5, Cicon_save);
			bmpf_txt(236 + 37, 10, se(3) + '...');
			DrawImage(G.gfx_winbar, 215, 42);

			//Name/PW
			bmpf_txt(236, 63, se(104) + ':');
			gui_input(450, 63, 256, 3);
			bmpf_txt(236, 88, se(105) + ':');
			gui_input(450, 88, 128, 4);

			//Browse
			if (gui_ibutton(742, 63, Cicon_dir, se(75))) {
				if (await gui_win_file(se(3) + '...', G.set_rootdir + 'mods\\' + G.set_moddir + '\\maps', '', 0, 1)) {
					path = Replace(G.in_win_path, G.set_rootdir + 'mods\\' + G.set_moddir + '\\maps', '');
					if (Left(path, 1) === '\\') path = Mid(path, 2, -1);
					G.in_input[3] = path + stripext(G.in_win_file);
				}
			}

			//Recent
			y = 1;
			dosave = 0;
			for (Trecent_ = First(Trecent); Trecent_ !== null; Trecent_ = After(Trecent, Trecent_)) {
				if (gui_txtb(236, 110 + y * 20, Trecent_.file)) {
					G.in_input[3] = Trecent_.file;
					if (Left(G.in_input[3], 5) === 'maps\\' || Left(G.in_input[3], 5) === 'maps/') {
						G.in_input[3] = Mid(G.in_input[3], 6, -1);
					}
					dosave = 1;
				}
				y = y + 1;
			}

			//Okay
			if ((gui_ibutton(742, 542, Cicon_ok, sm(5)) | dosave) !== 0) {
				G.in_input[3] = Replace(G.in_input[3], '.S2', '');
				G.in_input[3] = Replace(G.in_input[3], '.s2', '');
				if (Instr(G.in_input[3], ':')) {
					if (FileType(G.in_input[3] + '.s2') === 1) {
						if (await gui_msgdecide(se(107), Cbmpf_red)) {
							if (await save_map(G.in_input[3] + '.s2', 'map', G.in_input[4])) {
								load_recent(G.in_input[3] + '.s2');
								G.in_edmap = G.in_input[3];
								G.m_menu = 0;
							} else {
								await gui_msg(se(108), Cbmpf_red);
							}
						}
					} else {
						if (await save_map(G.in_input[3] + '.s2', 'map', G.in_input[4])) {
							load_recent(G.in_input[3] + '.s2');
							G.in_edmap = G.in_input[3];
							G.m_menu = 0;
						} else {
							await gui_msg(se(108), Cbmpf_red);
						}
					}
				} else {
					if (FileType('maps\\' + G.in_input[3] + '.s2') === 1 && G.in_edmap !== G.in_input[3]) {
						if (await gui_msgdecide(se(107), Cbmpf_red)) {
							if (await save_map('maps\\' + G.in_input[3] + '.s2', 'map', G.in_input[4])) {
								load_recent('maps\\' + G.in_input[3] + '.s2');
								G.in_edmap = G.in_input[3];
								G.m_menu = 0;
							} else {
								await gui_msg(se(108), Cbmpf_red);
							}
						}
					} else {
						if (await save_map('maps\\' + G.in_input[3] + '.s2', 'map', G.in_input[4])) {
							load_recent('maps\\' + G.in_input[3] + '.s2');
							G.in_edmap = G.in_input[3];
							G.m_menu = 0;
						} else {
							await gui_msg(se(108), Cbmpf_red);
						}
					}
				}
			}
			//Cancel
			if (gui_ibutton(742 - 37, 542, Cicon_x, sm(3))) G.m_menu = 0;
			break;

		//Heightmap
		case Cmenu_ed_heightmap:
			DrawImage(G.gfx_win, 215, 0);
			if (gui_ibutton(742, 5, Cicon_x, sm(15), 1, 0, 1)) G.m_menu = 0;
			DrawImage(G.gfx_icons, 236, 5, Cicon_heightmap);
			bmpf_txt(236 + 37, 10, se(11) + '...');
			DrawImage(G.gfx_winbar, 215, 42);

			//Map/Scale
			bmpf_txt(236, 63, se(109) + ':');
			gui_input(702, 63, 64, 4);

			//Import
			if (gui_ibutton(742 - 37, 103, Cicon_load, se(110))) {
				if (await gui_win_file(se(110), G.set_rootdir, '', 0, 0)) {
					G.in_input[3] = G.in_win_path + G.in_win_file;
					if (e_terrainhm(G.in_input[3], Float(G.in_input[4]))) {
						editor_heightmaptobuffer();
					} else {
						await gui_msg(se(119), Cbmpf_red);
					}
				}
			}
			//Export
			if (gui_ibutton(742, 103, Cicon_save, se(111))) {
				if (await gui_win_file(se(111), G.set_rootdir, '', 0, 1)) {
					G.in_input[3] = G.in_win_path + G.in_win_file;
					if (SaveImage(G.in_editor_buffer, G.in_input[3])) {
					} else {
						await gui_msg(se(119), Cbmpf_red);
					}
				}
			}

			//Bar
			DrawImage(G.gfx_winbar, 215, 140);

			//Bufferwin
			editor_bufferwin(236, 160, 500, 375);

			//Colors
			grey = Int(f32(Float(G.in_slider[0]) * f32(2.55)));
			gui_colorbox(grey, grey, grey, 236, 542, 64, 32, se(112) + ': ' + Str(grey));
			gui_slider(236 + 64 + 10, 550, 100, 0);

			//Alpha
			a = G.in_slider[10];
			bmpf_txt_c(460 + 32, 542, se(113) + ':', Cbmpf_tiny);
			bmpf_txt_c(460 + 32, 542 + 16, Str(a) + '%', Cbmpf_tiny);
			gui_slider(460 + 64 + 10, 550, 100, 10);

			//Tools
			if (gui_ibutton(742, 160, Cicon_brush, se(114), 1, G.in_edtool === 0 ? 1 : 0)) {
				G.in_edtool = 0;
			}
			if (gui_ibutton(742, 160 + 37, Cicon_spray, se(115), 1, G.in_edtool === 1 ? 1 : 0)) {
				G.in_edtool = 1;
			}
			if (gui_ibutton(742, 160 + 37 + 37, Cicon_sun, se(116), 1, G.in_edtool === 2 ? 1 : 0)) {
				G.in_edtool = 2;
			}
			if (gui_ibutton(742, 160 + 37 + 37 + 37, Cicon_moon, se(117), 1, G.in_edtool === 3 ? 1 : 0)) {
				G.in_edtool = 3;
			}
			if (gui_ibutton(742, 160 + 37 + 37 + 37 + 37, 83, se(224), 1, G.in_edtool === 4 ? 1 : 0)) {
				G.in_edtool = 4;
			}
			if (gui_ibutton(742, 160 + 37 + 37 + 37 + 37 + 37 + 37, Cicon_zoom, se(118), 1, G.in_edzoom > 1 ? 1 : 0)) {
				G.in_edzoom = G.in_edzoom * 2;
				if (G.in_edzoom > 8) G.in_edzoom = 1;
				G.in_editor_bufferx = -5;
				G.in_editor_buffery = -5;
			}
			bmpf_txt(742 + 12, 160 + 37 + 37 + 37 + 37 + 37 + 37 + 15, Str(G.in_edzoom) + 'x', Cbmpf_tiny);

			//Close
			if (gui_ibutton(742 - 37, 542, Cicon_x, sm(3))) G.m_menu = 0;
			//Ok
			if (gui_ibutton(742, 542, Cicon_ok, sm(5))) {
				editor_buffertoheightmap();
				G.m_menu = 0;
			}
			break;

		//Colormap
		case Cmenu_ed_colormap:
			DrawImage(G.gfx_win, 215, 0);
			if (gui_ibutton(742, 5, Cicon_x, sm(15), 1, 0, 1)) G.m_menu = 0;
			DrawImage(G.gfx_icons, 236, 5, Cicon_colormap);
			bmpf_txt(236 + 37, 10, se(12) + '...');
			DrawImage(G.gfx_winbar, 215, 42);

			//Map/Scale
			bmpf_txt(236, 63, se(120) + ':');
			gui_input(702 - 37, 63, 64, 4);
			if (gui_ibutton(742, 63, Cicon_ok, se(121))) {
				G.in_input[4] = Str(e_terraincmscale(Int(G.in_input[4])));
			}

			//Import
			if (gui_ibutton(742 - 37, 103, Cicon_load, se(122))) {
				if (await gui_win_file(se(122), G.set_rootdir, '', 0, 0)) {
					G.in_input[3] = G.in_win_path + G.in_win_file;
					if (await e_terraincm(G.in_input[3])) {
						editor_textobuffer(G.ter_tex_color);
						// layer: TextureHeight(ter_tex_color) through _additions
						G.in_input[4] = Str(ter_tex_color_height());
						grass_map();
					} else {
						await gui_msg(se(119), Cbmpf_red);
					}
				}
			}
			//Export
			if (gui_ibutton(742, 103, Cicon_save, se(123))) {
				if (await gui_win_file(se(123), G.set_rootdir, '', 0, 1)) {
					G.in_input[3] = G.in_win_path + G.in_win_file;
					if (SaveImage(G.in_editor_buffer, G.in_input[3])) {
					} else {
						await gui_msg(se(119), Cbmpf_red);
					}
				}
			}

			//Bar
			DrawImage(G.gfx_winbar, 215, 140);

			//Bufferwin
			editor_bufferwin(236, 160, 500, 375);

			//Maincolor
			if (gui_colorbox(G.in_col[0], G.in_col[1], G.in_col[2], 236, 542, 64, 32, se(124))) {
				G.in_slider[0] = Int(f32(Float(G.in_col[0]) / f32(2.55)));
				G.in_slider[1] = Int(f32(Float(G.in_col[1]) / f32(2.55)));
				G.in_slider[2] = Int(f32(Float(G.in_col[2]) / f32(2.55)));
				if (await gui_win_color()) {
					G.in_col[0] = G.in_win_color[0];
					G.in_col[1] = G.in_win_color[1];
					G.in_col[2] = G.in_win_color[2];
				}
			}
			//Deepcolor
			x = gui_colorbox(G.in_tercol[0][0], G.in_tercol[1][0], G.in_tercol[2][0], 236 + 64 + 15, 542, 32, 32, se(125));
			if (x === 1) {
				G.in_col[0] = G.in_tercol[0][0];
				G.in_col[1] = G.in_tercol[1][0];
				G.in_col[2] = G.in_tercol[2][0];
			} else if (x === 2) {
				G.in_slider[0] = Int(f32(Float(G.in_tercol[0][0]) / f32(2.55)));
				G.in_slider[1] = Int(f32(Float(G.in_tercol[1][0]) / f32(2.55)));
				G.in_slider[2] = Int(f32(Float(G.in_tercol[2][0]) / f32(2.55)));
				if (await gui_win_color()) {
					e_tercol(G.in_win_color[0], G.in_win_color[1], G.in_win_color[2], 0);
				}
			}
			//Basecolor
			x = gui_colorbox(G.in_tercol[0][1], G.in_tercol[1][1], G.in_tercol[2][1], 236 + 64 + 15 + 37, 542, 32, 32, se(126));
			if (x === 1) {
				G.in_col[0] = G.in_tercol[0][1];
				G.in_col[1] = G.in_tercol[1][1];
				G.in_col[2] = G.in_tercol[2][1];
			} else if (x === 2) {
				G.in_slider[0] = Int(f32(Float(G.in_tercol[0][1]) / f32(2.55)));
				G.in_slider[1] = Int(f32(Float(G.in_tercol[1][1]) / f32(2.55)));
				G.in_slider[2] = Int(f32(Float(G.in_tercol[2][1]) / f32(2.55)));
				if (await gui_win_color()) {
					e_tercol(G.in_win_color[0], G.in_win_color[1], G.in_win_color[2], 1);
				}
			}
			//Heightcolor
			x = gui_colorbox(G.in_tercol[0][2], G.in_tercol[1][2], G.in_tercol[2][2], 236 + 64 + 15 + 37 + 37, 542, 32, 32, se(127));
			if (x === 1) {
				G.in_col[0] = G.in_tercol[0][2];
				G.in_col[1] = G.in_tercol[1][2];
				G.in_col[2] = G.in_tercol[2][2];
			} else if (x === 2) {
				G.in_slider[0] = Int(f32(Float(G.in_tercol[0][2]) / f32(2.55)));
				G.in_slider[1] = Int(f32(Float(G.in_tercol[1][2]) / f32(2.55)));
				G.in_slider[2] = Int(f32(Float(G.in_tercol[2][2]) / f32(2.55)));
				if (await gui_win_color()) {
					e_tercol(G.in_win_color[0], G.in_win_color[1], G.in_win_color[2], 2);
				}
			}

			//Alpha
			a = G.in_slider[10];
			bmpf_txt_c(460 + 32, 542, se(113) + ':', Cbmpf_tiny);
			bmpf_txt_c(460 + 32, 542 + 16, Str(a) + '%', Cbmpf_tiny);
			gui_slider(460 + 64 + 10, 550, 100, 10);

			//Tools
			if (gui_ibutton(742, 160, Cicon_brush, se(114), 1, G.in_edtool === 0 ? 1 : 0)) {
				G.in_edtool = 0;
			}
			if (gui_ibutton(742, 160 + 37, Cicon_spray, se(115), 1, G.in_edtool === 1 ? 1 : 0)) {
				G.in_edtool = 1;
			}
			if (gui_ibutton(742, 160 + 37 + 37, Cicon_sun, se(116), 1, G.in_edtool === 2 ? 1 : 0)) {
				G.in_edtool = 2;
			}
			if (gui_ibutton(742, 160 + 37 + 37 + 37, Cicon_moon, se(117), 1, G.in_edtool === 3 ? 1 : 0)) {
				G.in_edtool = 3;
			}
			if (gui_ibutton(742, 160 + 37 + 37 + 37 + 37, 83, se(224), 1, G.in_edtool === 4 ? 1 : 0)) {
				G.in_edtool = 4;
			}
			if (gui_ibutton(742, 160 + 37 + 37 + 37 + 37 + 37 + 37, Cicon_zoom, se(118), 1, G.in_edzoom > 1 ? 1 : 0)) {
				G.in_edzoom = G.in_edzoom * 2;
				if (G.in_edzoom > 8) G.in_edzoom = 1;
				G.in_editor_bufferx = -5;
				G.in_editor_buffery = -5;
			}
			bmpf_txt(742 + 12, 160 + 37 + 37 + 37 + 37 + 37 + 37 + 15, Str(G.in_edzoom) + 'x', Cbmpf_tiny);

			//Update
			if (gui_ibutton(742 - 37 - 47, 542, Cicon_update, se(128))) {
				await editor_gencolormap(0);
				editor_textobuffer(G.ter_tex_color);
				p_kill2d();
			}
			//Close
			if (gui_ibutton(742 - 37, 542, Cicon_x, sm(3))) G.m_menu = 0;
			//Ok
			if (gui_ibutton(742, 542, Cicon_ok, sm(5))) {
				editor_buffertotex(G.ter_tex_color);
				G.m_menu = 0;
			}
			break;

		//Grassmap
		case Cmenu_ed_grassmap:
			DrawImage(G.gfx_win, 215, 0);
			if (gui_ibutton(742, 5, Cicon_x, sm(15), 1, 0, 1)) G.m_menu = 0;
			DrawImage(G.gfx_icons, 236, 5, Cicon_grassmap);
			bmpf_txt(236 + 37, 10, se(13) + '...');
			DrawImage(G.gfx_winbar, 215, 42);

			//Bar
			DrawImage(G.gfx_winbar, 215, 140);

			//Bufferwin
			editor_bufferwin(236, 160, 500, 375);

			//Grassmode
			if (gui_ibutton(236, 542, Cicon_grassmap, se(129), 1, G.in_edgrassmode === 1 ? 1 : 0)) {
				G.in_edgrassmode = 1 - G.in_edgrassmode;
			}
			if (G.in_edgrassmode === 1) {
				bmpf_txt(236 + 37, 542 + 5, se(129) + ': ' + se(130), Cbmpf_green);
			} else {
				bmpf_txt(236 + 37, 542 + 5, se(129) + ': ' + se(131), Cbmpf_red);
			}

			//Tools
			if (gui_ibutton(742, 160, Cicon_brush, se(114), 1, G.in_edtool === 0 ? 1 : 0)) {
				G.in_edtool = 0;
			}
			if (gui_ibutton(742, 160 + 37, Cicon_spray, se(115), 1, G.in_edtool === 1 ? 1 : 0)) {
				G.in_edtool = 1;
			}
			if (gui_ibutton(742, 160 + 37 + 37 + 37 + 37 + 37 + 37, Cicon_zoom, se(118), 1, G.in_edzoom > 1 ? 1 : 0)) {
				G.in_edzoom = G.in_edzoom * 2;
				if (G.in_edzoom > 8) G.in_edzoom = 1;
				G.in_editor_bufferx = -5;
				G.in_editor_buffery = -5;
			}
			bmpf_txt(742 + 12, 160 + 37 + 37 + 37 + 37 + 37 + 37 + 15, Str(G.in_edzoom) + 'x', Cbmpf_tiny);

			//Update
			if (gui_ibutton(742 - 47, 542, Cicon_update, se(132))) {
				grass_heightmap();
				editor_grassmaptobuffer();
				p_kill2d();
			}
			//Ok
			if (gui_ibutton(742, 542, Cicon_ok, sm(5))) {
				G.m_menu = 0;
			}
			break;

		//Object Properties
		case Cmenu_ed_objects:
			DrawImage(G.gfx_win, 215, 0);
			if (gui_ibutton(742, 5, Cicon_x, sm(15), 1, 0, 1)) {
				G.m_menu = 0;
				G.in_opt[0] = Cclass_object;
				editor_setmode(Cclass_object);
			}
			DrawImage(G.gfx_icons, 236, 5, Cicon_options);
			bmpf_txt(236 + 37, 10, se(133));
			DrawImage(G.gfx_winbar, 215, 42);

			//ID
			bmpf_txt(236, 63, se(137) + ':');
			gui_input(450, 63, 64, 3);
			G.in_input[3] = Str(Int(G.in_input[3]));
			if (Len(G.in_input[3]) > 6) G.in_input[3] = Left(G.in_input[3], 6);
			if (G.in_inputfocus === 3) editor_setmenu(Cmenu_ed_objects, Int(G.in_input[3]));

			//Exists?
			i = 0;
			for (Tobject_ = First(Tobject); Tobject_ !== null; Tobject_ = After(Tobject, Tobject_)) {
				if (Tobject_.id === Int(G.in_input[3])) {
					i = 1;

					bmpf_txt(236, 93, se(138) + ':');
					typ = Tobject_.typ;
					DrawBlock(G.gfx_if_itemback, 450, 93);
					DrawImage(Dobject_iconh(typ), 450, 93);
					bmpf_txt(495, 93, Dobject_name(typ) + ' (' + Str(typ) + ')');
					h = Tobject_.h;

					bmpf_txt(236, 140, se(139) + ':');
					gui_input(450, 140, 128, 4);

					bmpf_txt(236, 165, se(140) + ':');
					gui_input(450, 165, 128, 5);
					bmpf_txt(590, 165, '/');
					gui_input(600, 165, 128, 6);
					// quirk: x is an Int: the health picked on the bar is rounded
					x = Int(gui_healthbar(450, 190, Float(G.in_input[5]), Float(G.in_input[6])));
					if (x !== -1) G.in_input[5] = Str(x);
					if (Float(G.in_input[5]) > Float(G.in_input[6])) G.in_input[5] = Str(Float(G.in_input[6]), 'float');

					//Description
					scrolldown = bmpf_txt_rect(236, 210, 500, 160, Dobject_descr(typ), 2, G.in_scr_descr);
					if (gui_ibutton(742, 210, Cicon_up, sm(29), G.in_scr_descr > 0 ? 1 : 0)) {
						G.in_scr_descr = G.in_scr_descr - 1;
					}
					if (gui_ibutton(742, 370 - 32, Cicon_down, sm(30), scrolldown === 0 ? 1 : 0)) {
						G.in_scr_descr = G.in_scr_descr + 1;
					}

					editor_childs(Cclass_object, Int(G.in_input[3]));

					G.TCobject = Tobject_;

					break;
				}
			}

			if (!i) bmpf_txt(236, 93, 'N/A', 3);

			//Jump to Parent
			if (gui_ibutton(742 - 37, 5, Cicon_cam, se(202), i)) {
				editor_jumpto(Cclass_object, Int(G.in_input[3]));
			}

			//Spawn
			if (i === 1) {
				if (Dobject_spawn(G.TCobject!.typ) !== '') {
					if (gui_ibutton(236 + 37, 542, 78, 'Spawn')) {
						game_cd_object();
					}
				} else {
					gui_ibutton(236 + 37, 542, 78, 'Spawn', 0);
				}
			} else {
				gui_ibutton(236 + 37, 542, 78, 'Spawn', 0);
			}

			//Delete
			if (gui_ibutton(236, 542, Cicon_x, se(141), i)) {
				free_object(Int(G.in_input[3]));
				G.m_menu = 0;
				G.in_opt[0] = Cclass_object;
				editor_setmode(Cclass_object);
			}

			//Okay
			if (gui_ibutton(742, 542, Cicon_ok, sm(5))) {
				if (i) {
					//Rotation
					RotateEntity(Tobject_!.h!, EntityPitch(Tobject_!.h!), Float(G.in_input[4]), EntityRoll(Tobject_!.h!));
					//Health
					Tobject_!.health = Float(G.in_input[5]);
					Tobject_!.health_max = Float(G.in_input[6]);
					//Script
					editor_savescript(Cclass_object, Int(G.in_input[3]));
				}
				G.m_menu = 0;
				G.in_opt[0] = Cclass_object;
				editor_setmode(Cclass_object);
			}

			//Cancel
			if (gui_ibutton(742 - 37, 542, Cicon_x, sm(3))) {
				G.m_menu = 0;
				G.in_opt[0] = Cclass_object;
				editor_setmode(Cclass_object);
			}

			//Defvars
			defvars = 0;
			if (i) {
				for (Tdefvar_ = First(Tdefvar); Tdefvar_ !== null; Tdefvar_ = After(Tdefvar, Tdefvar_)) {
					if (Tdefvar_.class === Cclass_object) {
						if (Tdefvar_.typ === typ) {
							defvars = 1;
							break;
						}
					}
				}
			}
			if (gui_ibutton(742 - 37 * 3, 542, Cicon_options, se(223), defvars)) {
				await gui_win_defvars(Cclass_object, typ, Int(G.in_input[3]));
			}

			//Info
			if (gui_ibutton(742 - 37 * 4, 542, Cicon_info, se(144), Len(Dobject_descr(typ)) > 0 ? 1 : 0)) {
				await gui_win_text(Dobject_descr(typ));
			}
			break;

		//Unit Properties
		case Cmenu_ed_units:
			DrawImage(G.gfx_win, 215, 0);
			if (gui_ibutton(742, 5, Cicon_x, sm(15), 1, 0, 1)) {
				G.m_menu = 0;
				G.in_opt[0] = Cclass_unit;
				editor_setmode(Cclass_unit);
			}
			DrawImage(G.gfx_icons, 236, 5, Cicon_options);
			bmpf_txt(236 + 37, 10, se(134));
			DrawImage(G.gfx_winbar, 215, 42);

			//ID
			bmpf_txt(236, 63, se(137) + ':');
			gui_input(450, 63, 64, 3);
			G.in_input[3] = Str(Int(G.in_input[3]));
			if (Len(G.in_input[3]) > 6) G.in_input[3] = Left(G.in_input[3], 6);
			if (G.in_inputfocus === 3) editor_setmenu(Cmenu_ed_units, Int(G.in_input[3]));

			//Exists?
			i = 0;
			for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
				if (Tunit_.id === Int(G.in_input[3])) {
					i = 1;

					bmpf_txt(236, 93, se(138) + ':');
					typ = Tunit_.typ;
					DrawBlock(G.gfx_if_itemback, 450, 93);
					DrawImage(Dunit_iconh(typ), 450, 93);
					bmpf_txt(495, 93, Dunit_name(typ) + ' (' + Str(typ) + ')');
					h = Tunit_.h;

					bmpf_txt(236, 140, se(139) + ':');
					gui_input(450, 140, 128, 4);

					bmpf_txt(236, 165, se(140) + ':');
					gui_input(450, 165, 128, 5);
					bmpf_txt(590, 165, '/');
					gui_input(600, 165, 128, 6);
					// quirk: x is an Int: the health picked on the bar is rounded
					x = Int(gui_healthbar(450, 190, Float(G.in_input[5]), Float(G.in_input[6])));
					if (x !== -1) G.in_input[5] = Str(x);
					if (Float(G.in_input[5]) > Float(G.in_input[6])) G.in_input[5] = Str(Float(G.in_input[6]), 'float');

					//Description
					scrolldown = bmpf_txt_rect(236, 210, 500, 160, Dunit_descr(typ), 2, G.in_scr_descr);
					if (gui_ibutton(742, 210, Cicon_up, sm(29), G.in_scr_descr > 0 ? 1 : 0)) {
						G.in_scr_descr = G.in_scr_descr - 1;
					}
					if (gui_ibutton(742, 370 - 32, Cicon_down, sm(30), scrolldown === 0 ? 1 : 0)) {
						G.in_scr_descr = G.in_scr_descr + 1;
					}

					editor_childs(Cclass_unit, Int(G.in_input[3]));

					break;
				}
			}

			if (!i) bmpf_txt(236, 93, 'N/A', 3);

			//Jump to Parent
			if (gui_ibutton(742 - 37, 5, Cicon_cam, se(202), i)) {
				editor_jumpto(Cclass_unit, Int(G.in_input[3]));
			}

			//Delete
			if (gui_ibutton(236, 542, Cicon_x, se(141), i)) {
				free_unit(Int(G.in_input[3]));
				G.m_menu = 0;
				G.in_opt[0] = Cclass_unit;
				editor_setmode(Cclass_unit);
			}

			//Okay
			if (gui_ibutton(742, 542, Cicon_ok, sm(5))) {
				if (i) {
					//Rotation
					RotateEntity(Tunit_!.h!, EntityPitch(Tunit_!.h!), Float(G.in_input[4]), EntityRoll(Tunit_!.h!));
					//Health
					Tunit_!.health = Float(G.in_input[5]);
					Tunit_!.health_max = Float(G.in_input[6]);
					//Script
					editor_savescript(Cclass_unit, Int(G.in_input[3]));
				}
				G.m_menu = 0;
				G.in_opt[0] = Cclass_unit;
				editor_setmode(Cclass_unit);
			}

			//Cancel
			if (gui_ibutton(742 - 37, 542, Cicon_x, sm(3))) {
				G.m_menu = 0;
				G.in_opt[0] = Cclass_unit;
				editor_setmode(Cclass_unit);
			}

			//Defvars
			defvars = 0;
			if (i) {
				for (Tdefvar_ = First(Tdefvar); Tdefvar_ !== null; Tdefvar_ = After(Tdefvar, Tdefvar_)) {
					if (Tdefvar_.class === Cclass_unit) {
						if (Tdefvar_.typ === typ) {
							defvars = 1;
							break;
						}
					}
				}
			}
			if (gui_ibutton(742 - 37 * 3, 542, Cicon_options, se(223), defvars)) {
				await gui_win_defvars(Cclass_unit, typ, Int(G.in_input[3]));
			}

			//Info
			if (gui_ibutton(742 - 37 * 4, 542, Cicon_info, se(144), Len(Dunit_descr(typ)) > 0 ? 1 : 0)) {
				await gui_win_text(Dunit_descr(typ));
			}
			break;

		//Item Properties
		case Cmenu_ed_items:
			DrawImage(G.gfx_win, 215, 0);
			if (gui_ibutton(742, 5, Cicon_x, sm(15), 1, 0, 1)) {
				G.m_menu = 0;
				G.in_opt[0] = 3;
				editor_picking(Cclass_item);
			}
			DrawImage(G.gfx_icons, 236, 5, Cicon_options);
			bmpf_txt(236 + 37, 10, se(135));
			DrawImage(G.gfx_winbar, 215, 42);

			//ID
			bmpf_txt(236, 63, se(137) + ':');
			gui_input(450, 63, 64, 3);
			G.in_input[3] = Str(Int(G.in_input[3]));
			if (Len(G.in_input[3]) > 6) G.in_input[3] = Left(G.in_input[3], 6);
			if (G.in_inputfocus === 3) editor_setmenu(Cmenu_ed_items, Int(G.in_input[3]));

			//Exists?
			i = 0;
			for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
				if (Titem_.id === Int(G.in_input[3])) {
					i = 1;

					//Item
					bmpf_txt(236, 93, se(138) + ':');
					typ = Titem_.typ;
					DrawBlock(G.gfx_if_itemback, 450, 93);
					DrawImage(Ditem_iconh(typ), 450, 93);
					bmpf_txt(495, 93, Ditem_name(typ) + ' (' + Str(typ) + ')');
					h = Titem_.h;
					if (Titem_.parent_class !== 0) {
						if (Titem_.parent_mode === Cpm_in) {
							bmpf_txt(495, 113, '(' + se(142) + ')');
						}
					}

					//Rotation
					bmpf_txt(236, 140, se(139) + ':');
					gui_input(450, 140, 128, 4);

					//Health
					bmpf_txt(236, 165, se(140) + ':');
					gui_input(450, 165, 128, 5);
					bmpf_txt(590, 165, '/ ' + Str(Ditem_health(typ), 'float'));
					// quirk: x is an Int: the health picked on the bar is rounded
					x = Int(gui_healthbar(450, 190, Float(G.in_input[5]), Ditem_health(typ)));
					if (x !== -1) G.in_input[5] = Str(x);

					//Count
					bmpf_txt(236, 205, se(143) + ':');
					gui_input(450, 205, 128, 6);

					//Attach to Objects
					x = 1;
					if (Titem_.parent_class !== 0) {
						if (Titem_.parent_mode === Cpm_in) x = 0;
					}
					if (x === 1) {
						bmpf_txt(236, 235, se(219) + ':');
					} else {
						bmpf_txt(236, 235, se(219) + ':', Cbmpf_dark);
					}
					gui_input(450, 235, 128, 7, x);

					//Description
					scrolldown = bmpf_txt_rect(236, 260, 500, 120, Ditem_descr(typ), 2, G.in_scr_descr);
					if (gui_ibutton(742, 260, Cicon_up, sm(29), G.in_scr_descr > 0 ? 1 : 0)) {
						G.in_scr_descr = G.in_scr_descr - 1;
					}
					if (gui_ibutton(742, 380 - 32, Cicon_down, sm(30), scrolldown === 0 ? 1 : 0)) {
						G.in_scr_descr = G.in_scr_descr + 1;
					}

					//Childs
					editor_childs(Cclass_item, Int(G.in_input[3]), 1, 0, 1);

					break;
				}
			}

			if (!i) bmpf_txt(236, 93, 'N/A', 3);

			//Jump to Parent
			if (gui_ibutton(742 - 37, 5, Cicon_cam, se(202), i)) {
				if (Titem_!.parent_class === 0) {
					editor_jumpto(Cclass_item, Int(G.in_input[3]));
				} else {
					editor_jumpto(Titem_!.parent_class, Titem_!.parent_id);
				}
			}

			//Delete
			if (gui_ibutton(236, 542, Cicon_x, se(141), i)) {
				free_item(Int(G.in_input[3]));
				G.m_menu = 0;
				G.in_opt[0] = 3;
				editor_picking(Cclass_item);
			}

			//Okay
			if (gui_ibutton(742, 542, Cicon_ok, sm(5))) {
				if (i) {
					//Rotation
					RotateEntity(Titem_!.h!, EntityPitch(Titem_!.h!), Float(G.in_input[4]), EntityRoll(Titem_!.h!));
					//Health
					Titem_!.health = Float(G.in_input[5]);
					//Count
					if (Int(G.in_input[6]) < 1) G.in_input[6] = Str(1);
					Titem_!.count = Int(G.in_input[6]);
					//Save Object
					x = 1;
					if (Titem_!.parent_class !== 0) {
						if (Titem_!.parent_mode === Cpm_in) {
							x = 0;
						}
					}
					if (x === 1) {
						// quirk: a String compared with 0 compares as strings: an empty field is <> "0"
						if (G.in_input[7] !== '0') {
							Titem_!.parent_class = Cclass_object;
							Titem_!.parent_id = Int(G.in_input[7]);
							Titem_!.parent_mode = Cpm_out;
							RotateEntity(Titem_!.h!, -90, EntityYaw(Titem_!.h!), 0);
						} else {
							Titem_!.parent_class = 0;
							Titem_!.parent_id = 0;
							Titem_!.parent_mode = 0;
							RotateEntity(Titem_!.h!, 0, EntityYaw(Titem_!.h!), 0);
						}
					}
					//Script
					editor_savescript(Cclass_item, Int(G.in_input[3]));
				}
				G.m_menu = 0;
				G.in_opt[0] = 3;
				editor_picking(Cclass_item);
			}

			//Cancel
			if (gui_ibutton(742 - 37, 542, Cicon_x, sm(3))) {
				G.m_menu = 0;
				G.in_opt[0] = 3;
				editor_picking(Cclass_item);
			}

			//Defvars
			defvars = 0;
			if (i) {
				for (Tdefvar_ = First(Tdefvar); Tdefvar_ !== null; Tdefvar_ = After(Tdefvar, Tdefvar_)) {
					if (Tdefvar_.class === Cclass_item) {
						if (Tdefvar_.typ === typ) {
							defvars = 1;
							break;
						}
					}
				}
			}
			if (gui_ibutton(742 - 37 * 3, 542, Cicon_options, se(223), defvars)) {
				await gui_win_defvars(Cclass_item, typ, Int(G.in_input[3]));
			}

			//Info
			if (gui_ibutton(742 - 37 * 4, 542, Cicon_info, se(144), Len(Ditem_descr(typ)) > 0 ? 1 : 0)) {
				await gui_win_text(Ditem_descr(typ));
			}
			break;

		//Info Properties
		case Cmenu_ed_infos:
			DrawImage(G.gfx_win, 215, 0);
			if (gui_ibutton(742, 5, Cicon_x, sm(15), 1, 0, 1)) G.m_menu = 0;
			DrawImage(G.gfx_icons, 236, 5, Cicon_options);
			bmpf_txt(236 + 37, 10, se(136));
			DrawImage(G.gfx_winbar, 215, 42);

			//ID
			bmpf_txt(236, 63, se(137) + ':');
			gui_input(450, 63, 64, 3);
			G.in_input[3] = Str(Int(G.in_input[3]));
			if (Len(G.in_input[3]) > 6) G.in_input[3] = Left(G.in_input[3], 6);
			if (G.in_inputfocus === 3) editor_setmenu(Cmenu_ed_infos, Int(G.in_input[3]));

			//Exists?
			i = 0;
			for (Tinfo_ = First(Tinfo); Tinfo_ !== null; Tinfo_ = After(Tinfo, Tinfo_)) {
				if (Tinfo_.id === Int(G.in_input[3])) {
					i = 1;

					bmpf_txt(236, 93, se(138) + ':');
					typ = Tinfo_.typ;
					DrawBlock(G.gfx_if_itemback, 450, 93);
					DrawImage(G.gfx_icons, 450 + 4, 93 + 4, Dinfo_frame(typ));
					bmpf_txt(495, 93, Dinfo_name(typ) + ' (' + Str(typ) + ')');
					h = Tinfo_.h;

					//Infostuff
					switch (typ) {
						//Spawnpoint
						case 1:
							bmpf_txt(236, 140, se(144) + ':');
							bmpf_txt(450, 140, se(145));
							break;

						//Sprite
						case 5:
							//Image
							bmpf_txt(236, 140, se(207) + ':');
							gui_input(450, 140, 256, 4);

							//Browse
							if (gui_ibutton(742, 140, Cicon_dir, se(75))) {
								if (await gui_win_file(se(2) + '...', G.set_rootdir + 'mods\\' + G.set_moddir, '', 0)) {
									path = Replace(G.in_win_path, G.set_rootdir + 'mods\\' + G.set_moddir, '');
									if (Left(path, 1) === '\\') path = Mid(path, 2, -1);
									G.in_input[4] = path + G.in_win_file;
								}
							}

							//Size
							bmpf_txt(236, 170, se(30) + ':');
							gui_input(450, 170, 64, 5);
							bmpf_txt(450 + 64 + 5, 170, 'x');
							gui_input(450 + 64 + 15, 170, 64, 6);

							//Color
							bmpf_txt(236, 200, se(194) + ':');
							if (gui_colorbox(G.in_scol[0], G.in_scol[1], G.in_scol[2], 450, 200, 64, 32)) {
								G.in_slider[0] = Int(f32(Float(G.in_scol[0]) / f32(2.55)));
								G.in_slider[1] = Int(f32(Float(G.in_scol[1]) / f32(2.55)));
								G.in_slider[2] = Int(f32(Float(G.in_scol[2]) / f32(2.55)));
								if (await gui_win_color()) {
									G.in_scol[0] = G.in_win_color[0];
									G.in_scol[1] = G.in_win_color[1];
									G.in_scol[2] = G.in_win_color[2];
								}
							}

							//Alpha
							bmpf_txt(236, 240, se(196) + ':');
							gui_slider(450, 240, 100, 0);

							//Blend
							bmpf_txt(236, 270, se(208) + ':');
							gui_check(450, 270, se(208), 0);

							//Fix
							bmpf_txt(236, 300, se(209) + ':');
							gui_check(450, 300, se(210), 1);
							break;

						//Trigger Range
						case 10:
							bmpf_txt(236, 140, se(146) + ':');
							if (gui_opt(450, 140, se(147), 0, 3)) G.in_input[4] = Str(0);
							if (gui_opt(450, 160, se(148), Cclass_object, 3)) G.in_input[4] = Str(0);
							if (gui_opt(450, 180, se(149), Cclass_unit, 3)) G.in_input[4] = Str(0);
							if (gui_opt(450, 200, se(150), Cclass_item, 3)) G.in_input[4] = Str(0);
							if (gui_opt(450, 220, se(151), Cclass_state, 3)) G.in_input[4] = Str(0);

							if (G.in_opt[3] > 0) {
								bmpf_txt(236, 240, se(138) + ':');
							} else {
								bmpf_txt(236, 240, se(138) + ':', Cbmpf_dark);
							}
							DrawBlock(G.gfx_if_itemback, 450, 240);
							gui_classselbox(450, 240, G.in_opt[3], 4);

							bmpf_txt(236, 287, se(143) + ':');
							gui_operator(450, 287, 7);
							gui_input(636, 287, 64, 5);

							bmpf_txt(236, 312, se(152) + ':');
							gui_input(450, 312, 64, 6);

							bmpf_txt(236, 337, se(153) + ':');
							gui_check(450, 337, se(154), 0);
							break;

						//Trigger Time
						case 11:
							bmpf_txt(236, 140, se(146) + ':');
							gui_opt(450, 140, se(155), 0, 3);
							gui_opt(450, 160, se(156), 1, 3);
							gui_opt(450, 180, se(157), 2, 3);
							gui_opt(450, 200, se(158), 3, 3);
							//gui_opt(450,220,se$(159),4,3)

							switch (G.in_opt[3]) {
								case 0:
									bmpf_txt(236, 240, se(160) + ':');
									gui_input(450, 240, 64, 4);
									break;
								case 1:
									bmpf_txt(236, 240, se(161) + ':');
									gui_input(450, 240, 64, 4);
									break;
								case 2:
									bmpf_txt(236, 240, se(162) + ':');
									gui_input(450, 240, 64, 4);
									bmpf_txt(236, 265, se(163) + ':');
									gui_input(450, 265, 64, 5);
									bmpf_txt(236, 290, se(164) + ':');
									gui_input(450, 290, 64, 6);
									break;
								case 3:
									bmpf_txt(236, 250, se(163) + ':');
									gui_input(450, 250, 64, 4);
									bmpf_txt(236, 275, se(164) + ':');
									gui_input(450, 275, 64, 5);
									break;
							}

							bmpf_txt(236, 315, se(153) + ':');
							gui_check(450, 315, se(154), 0);
							break;

						//Trigger Item Count
						case 12:
							bmpf_txt(236, 140, se(146) + ':');
							gui_opt(450, 140, se(147), 0, 3);
							gui_opt(450, 160, se(165), Cclass_object, 3);
							gui_opt(450, 180, se(166), Cclass_unit, 3);
							gui_opt(450, 200, se(167), Cclass_info, 3);

							if (G.in_opt[3] > 0) {
								bmpf_txt(236, 220, se(137) + ':');
							} else {
								bmpf_txt(236, 220, se(137) + ':', Cbmpf_dark);
							}
							gui_input(450, 220, 64, 4, G.in_opt[3] > 0 ? 1 : 0);

							bmpf_txt(236, 245, se(168) + ':');
							DrawBlock(G.gfx_if_itemback, 450, 245);
							gui_classselbox(450, 245, Cclass_item, 5);

							bmpf_txt(236, 292, se(143) + ':');
							gui_operator(450, 292, 7);
							gui_input(636, 292, 64, 6);

							bmpf_txt(236, 317, se(153) + ':');
							gui_check(450, 317, se(154), 0);
							break;

						//Map Indication
						case 36:
							bmpf_txt(236, 140, se(190) + ':');
							gui_opt(450, 140, '      ', 0, 3);
							DrawImage(G.gfx_arrows, 475, 147, 0);
							gui_opt(450, 160, '      ', 9, 3);
							DrawImage(G.gfx_arrows, 475, 167, 9);
							gui_opt(450, 180, '      ', 10, 3);
							DrawImage(G.gfx_arrows, 475, 187, 10);
							gui_opt(450, 200, '      ', 11, 3);
							DrawImage(G.gfx_arrows, 475, 207, 11);

							bmpf_txt(236, 225, se(144) + ':');
							gui_input(450, 225, 256, 4);

							bmpf_txt(236, 317, se(153) + ':');
							gui_check(450, 317, se(154), 0);
							break;

						//Freshwater Area
						case 41:
							bmpf_txt(236, 140, se(152) + ':');
							gui_input(450, 140, 64, 4);
							break;

						//Dig Area
						case 42:
							bmpf_txt(236, 140, se(152) + ':');
							gui_input(450, 140, 64, 4);
							break;

						//Fishing Area
						case 43:
							bmpf_txt(236, 140, se(152) + ':');
							gui_input(450, 140, 64, 4);
							break;

						//Area
						case 44:
							bmpf_txt(236, 140, se(152) + ':');
							gui_input(450, 140, 64, 4);
							break;

						//Spawn-Control
						case 45:
							bmpf_txt(236, 140, se(152) + ':');
							gui_input(450, 140, 64, 4);

							bmpf_txt(236, 175, se(203) + ':');
							if (gui_opt(450, 175, se(165), Cclass_object, 3)) {
								G.in_opt[0] = 1;
								G.in_input[5] = Str(0);
							}
							if (gui_opt(450, 195, se(166), Cclass_unit, 3)) {
								G.in_opt[0] = 2;
								G.in_input[5] = Str(0);
							}
							if (gui_opt(450, 215, se(168), Cclass_item, 3)) {
								G.in_opt[0] = 3;
								G.in_input[5] = Str(0);
							}

							DrawBlock(G.gfx_if_itemback, 450, 240);
							img = 0;
							switch (G.in_opt[3]) {
								case Cclass_object:
									img = Dobject_iconh(Int(G.in_input[5]));
									break;
								case Cclass_unit:
									img = Dunit_iconh(Int(G.in_input[5]));
									break;
								case Cclass_item:
									img = Ditem_iconh(Int(G.in_input[5]));
									break;
							}
							if (gui_iconbox(450, 240, img, '', 0) !== 0) {
								switch (G.in_opt[3]) {
									case Cclass_object:
										if (G.in_opt[0] === 1) {
											G.in_input[5] = Str(G.in_object_sel);
										} else {
											G.in_opt[0] = 1;
										}
										break;
									case Cclass_unit:
										if (G.in_opt[0] === 2) {
											G.in_input[5] = Str(G.in_unit_sel);
										} else {
											G.in_opt[0] = 2;
										}
										break;
									case Cclass_item:
										if (G.in_opt[0] === 3) {
											G.in_input[5] = Str(G.in_item_sel);
										} else {
											G.in_opt[0] = 3;
										}
										break;
								}
							}

							bmpf_txt(236, 295, se(215) + ':');
							gui_input(450, 295, 64, 7);
							bmpf_txt(450 + 90, 295, '/');
							gui_input(450 + 100, 295, 64, 6);

							bmpf_txt(236, 327, se(214) + ':');
							gui_input(450, 327, 64, 8);

							bmpf_txt(236, 359, se(153) + ':');
							gui_check(450, 359, se(154), 0);
							break;

						//AI Area
						case 46:
							bmpf_txt(236, 140, se(152) + ':');
							gui_input(450, 140, 64, 4);

							bmpf_txt(236, 170, se(211) + ':');
							gui_opt(450, 170, se(212), 0, 3);
							gui_opt(450, 190, se(213), 1, 3);
							break;

						//Loudspeaker
						case 47:
							//Sound
							bmpf_txt(236, 140, se(220) + ':');
							gui_input(450, 140, 256, 4);

							//Browse
							if (gui_ibutton(742, 140, Cicon_dir, se(75))) {
								if (await gui_win_file(se(2) + '...', G.set_rootdir + 'mods\\' + G.set_moddir, '', 0)) {
									path = Replace(G.in_win_path, G.set_rootdir + 'mods\\' + G.set_moddir, '');
									if (Left(path, 1) === '\\') path = Mid(path, 2, -1);
									G.in_input[4] = path + G.in_win_file;
								}
							}

							//Radius
							bmpf_txt(236, 170, se(152) + ':');
							gui_input(450, 170, 64, 5);
							bmpf_txt(450, 200, se(221));
							break;

						//Previewimage
						case 48:
							//Image
							bmpf_txt(236, 140, se(207) + ':');
							gui_input(450, 140, 256, 4);

							//Browse
							if (gui_ibutton(742, 140, Cicon_dir, se(75))) {
								if (await gui_win_file(se(2) + '...', G.set_rootdir + 'mods\\' + G.set_moddir, '', 0)) {
									path = Replace(G.in_win_path, G.set_rootdir + 'mods\\' + G.set_moddir, '');
									if (Left(path, 1) === '\\') path = Mid(path, 2, -1);
									G.in_input[4] = path + G.in_win_file;
								}
							}
							break;

						//Default
						default:
							if (Dinfo_descr(typ) === '') {
								//Nothing Special
								bmpf_txt(236, 140, se(144) + ':');
								bmpf_txt(450, 140, se(169));
							} else {
								//Description
								scrolldown = bmpf_txt_rect(236, 140, 500, 230, Dinfo_descr(typ), 2, G.in_scr_descr);
								if (gui_ibutton(742, 140, Cicon_up, sm(29), G.in_scr_descr > 0 ? 1 : 0)) {
									G.in_scr_descr = G.in_scr_descr - 1;
								}
								if (gui_ibutton(742, 370 - 32, Cicon_down, sm(30), scrolldown === 0 ? 1 : 0)) {
									G.in_scr_descr = G.in_scr_descr + 1;
								}
							}
					}

					//Childs
					editor_childs(Cclass_info, Int(G.in_input[3]), 1, 1, 1);

					break;
				}
			}

			if (!i) bmpf_txt(236, 93, 'N/A', 3);

			//Jump to Parent
			if (gui_ibutton(742 - 37, 5, Cicon_cam, se(202), i)) {
				editor_jumpto(Cclass_info, Int(G.in_input[3]));
			}

			//Delete
			if (gui_ibutton(236, 542, Cicon_x, se(141), i)) {
				free_info(Int(G.in_input[3]));
				G.m_menu = 0;
				G.in_opt[0] = 4;
				editor_picking(Cclass_info);
			}

			//Okay
			if (gui_ibutton(742, 542, Cicon_ok, sm(5))) {
				if (i === 1) {
					editor_saveinfo(Tinfo_);
				}
				G.m_menu = 0;
				G.in_opt[0] = 4;
				editor_picking(Cclass_info);
			}

			//Cancel
			if (gui_ibutton(742 - 37, 542, Cicon_x, sm(3))) {
				G.m_menu = 0;
				G.in_opt[0] = 4;
				editor_picking(Cclass_info);
			}

			//Defvars
			defvars = 0;
			if (i) {
				for (Tdefvar_ = First(Tdefvar); Tdefvar_ !== null; Tdefvar_ = After(Tdefvar, Tdefvar_)) {
					if (Tdefvar_.class === Cclass_info) {
						if (Tdefvar_.typ === typ) {
							defvars = 1;
							break;
						}
					}
				}
			}
			if (gui_ibutton(742 - 37 * 3, 542, Cicon_options, se(223), defvars)) {
				await gui_win_defvars(Cclass_info, typ, Int(G.in_input[3]));
			}

			//Info
			if (gui_ibutton(742 - 37 * 4, 542, Cicon_info, se(144), Len(Dinfo_descr(typ)) > 0 ? 1 : 0)) {
				await gui_win_text(Dinfo_descr(typ));
			}
			break;

		//Script Editor
		case Cmenu_ed_scripts:
			DrawImage(G.gfx_win, 215, 0);
			if (gui_ibutton(742, 5, Cicon_x, sm(15), 1, 0, 1)) G.m_menu = 0;
			DrawImage(G.gfx_icons, 236, 5, Cicon_options);
			bmpf_txt(236 + 37, 10, se(71));
			DrawImage(G.gfx_winbar, 215, 42);

			//Focus
			G.in_inputfocus = 1337;

			//ID
			i = 0;
			for (Tx_ = First(Tx); Tx_ !== null; Tx_ = After(Tx, Tx_)) {
				if (Tx_.parent_class === Int(G.in_input[3])) {
					if (Tx_.parent_id === Int(G.in_input[4])) {
						i = 1;
						break;
					}
				}
			}

			bmpf_txt(236, 63, se(170) + ':');
			switch (Int(G.in_input[3])) {
				case 0:
					bmpf_txt(450, 63, se(171));
					break;
				case -1:
					bmpf_txt(450, 63, se(226));
					break;
				case Cclass_object:
					bmpf_txt(450, 63, ss(se(172), G.in_input[4]));
					break;
				case Cclass_unit:
					bmpf_txt(450, 63, ss(se(173), G.in_input[4]));
					break;
				case Cclass_item:
					bmpf_txt(450, 63, ss(se(174), G.in_input[4]));
					break;
				case Cclass_info:
					bmpf_txt(450, 63, ss(se(175), G.in_input[4]));
					break;
			}

			gui_tb(236, 85, 538, 29, 1, 1);

			//Okay
			if (gui_ibutton(742, 542, Cicon_ok, sm(5))) {
				editor_savescript(Int(G.in_input[3]), Int(G.in_input[4]));
				editor_setmenu(G.in_prevmenu, Int(G.in_input[4]));
			}
			//Cancel
			if (gui_ibutton(742 - 37, 542, Cicon_x, sm(3))) {
				editor_setmenu(G.in_prevmenu, Int(G.in_input[4]));
			}

			//Jump to Parent
			if (gui_ibutton(742 - 37, 5, Cicon_cam, se(202))) {
				editor_jumpto(Int(G.in_input[3]), Int(G.in_input[4]));
			}

			//Help
			x = 0;
			if (G.in_sh === 1) {
				// quirk: a String compared with 0 compares as strings
				if (G.in_sh_cmd !== '0') {
					x = 1;
				}
			}
			if (gui_ibutton(236 + 37, 542, Cicon_zoom, ss(se(222), G.in_sh_cmd), x, 0, 59)) {
				ExecFile('http://www.stranded.unrealsoftware.de/s2_commands.php?cmd=' + G.in_sh_cmd + '#cmd');
			}

			//Delete
			if (gui_ibutton(236, 542, Cicon_x, se(141))) {
				if (await gui_msgdecide(se(176), Cbmpf_red, sm(2), sm(1))) {
					if (Int(G.in_input[3]) === 0) {
						G.map_briefing = '';
					} else if (Int(G.in_input[3]) === -1) {
						G.ed_setscript = '';
					} else {
						if (i) Delete(Tx, Tx_);
					}
					editor_setmenu(G.in_prevmenu, Int(G.in_input[4]));
				}
			}

			//List
			//If gui_ibutton(236+37,542,Cicon_list,se$(201)) Then
			//	editor_setmenu(Cmenu_ed_list)
			//EndIf

			//Load
			if (gui_ibutton(236 + 37 + 37, 542, Cicon_load, se(177))) {
				if (await gui_win_file(se(177), G.set_rootdir, '', 0, 0)) {
					await gui_tb_loadfile(G.in_win_path + G.in_win_file);
				}
			}
			//Export
			if (gui_ibutton(236 + 37 + 37 + 37, 542, Cicon_save, se(178))) {
				if (await gui_win_file(se(178), G.set_rootdir, '', 0, 1)) {
					await gui_tb_savefile(G.in_win_path + G.in_win_file);
				}
			}

			//Add Command
			gui_tb_scripthelper_list();
			if (gui_ibutton(236 + 37 + 37 + 37 + 5 + 37, 542, Cicon_inc, se(179))) {
				await gui_win_command();
			}
			break;

		//State Properties
		case Cmenu_ed_states:
			DrawImage(G.gfx_win, 215, 0);
			if (gui_ibutton(742, 5, Cicon_x, sm(15), 1, 0, 1)) {
				G.m_menu = 0;
				G.in_opt[0] = 3;
			}
			DrawImage(G.gfx_icons, 236, 5, Cicon_options);
			bmpf_txt(236 + 37, 10, se(192));
			DrawImage(G.gfx_winbar, 215, 42);

			//Exists?
			i = 0;
			for (Tstate_ = First(Tstate); Tstate_ !== null; Tstate_ = After(Tstate, Tstate_)) {
				if (Tstate_.typ === Int(G.in_input[3])) {
					if (Tstate_.parent_class === Int(G.in_input[4])) {
						if (Tstate_.parent_id === Int(G.in_input[5])) {
							i = 1;

							//Jump to Parent
							if (gui_ibutton(742 - 37, 5, Cicon_cam, se(202))) {
								editor_jumpto(Tstate_.parent_class, Tstate_.parent_id);
							}

							bmpf_txt(236, 63, se(138) + ':');
							typ = Tstate_.typ;
							DrawBlock(G.gfx_if_itemback, 450, 63);
							DrawImage(G.gfx_states, 450 + 10, 63 + 10, Dstate_frame(Tstate_.typ));
							DrawImage(G.gfx_state, 450 + 10, 63 + 10, G.in_statefxf);

							bmpf_txt(495, 63, Dstate_name(typ) + ' (' + Str(typ) + ')');

							//Power/Damage (value_f#)
							bmpf_txt(236, 140, se(193) + ':');
							gui_input(450, 140, 128, 6);

							//Color
							if (Tstate_.typ === Cstate_flare || Tstate_.typ === Cstate_light || Tstate_.typ === Cstate_particles) {
								bmpf_txt(236, 170, se(194) + ':');
								if (gui_colorbox(G.in_scol[0], G.in_scol[1], G.in_scol[2], 450, 170, 64, 32)) {
									G.in_slider[0] = Int(f32(Float(G.in_scol[0]) / f32(2.55)));
									G.in_slider[1] = Int(f32(Float(G.in_scol[1]) / f32(2.55)));
									G.in_slider[2] = Int(f32(Float(G.in_scol[2]) / f32(2.55)));
									if (await gui_win_color()) {
										G.in_scol[0] = G.in_win_color[0];
										G.in_scol[1] = G.in_win_color[1];
										G.in_scol[2] = G.in_win_color[2];
									}
								}
							}

							//Size
							if (Tstate_.typ === Cstate_flare || Tstate_.typ === Cstate_light) {
								bmpf_txt(236, 210, se(195) + ':');
								gui_input(450, 210, 64, 7);
							}

							break;
						}
					}
				}
			}

			if (!i) bmpf_txt(236, 93, 'N/A', 3);

			//Delete
			if (gui_ibutton(236, 542, Cicon_x, se(141), i)) {
				free_state(Int(G.in_input[3]), Int(G.in_input[4]), Int(G.in_input[5]));
				G.m_menu = 0;
			}

			//Okay
			if (gui_ibutton(742, 542, Cicon_ok, sm(5))) {
				if (i) {
					//Value
					Tstate_!.value_f = Float(G.in_input[6]);
					//Color
					if (Tstate_!.typ === Cstate_flare || Tstate_!.typ === Cstate_light || Tstate_!.typ === Cstate_particles) {
						Tstate_!.value_s = Str(G.in_scol[0]) + ',' + Str(G.in_scol[1]) + ',' + Str(G.in_scol[2]);
					}
					//Size
					if (Tstate_!.typ === Cstate_flare || Tstate_!.typ === Cstate_light) {
						Tstate_!.value = Int(G.in_input[7]);
					}
					//Look
					G.TCstate = Tstate_;
					look_state();
				}
				G.m_menu = 0;
			}

			//Cancel
			if (gui_ibutton(742 - 37, 542, Cicon_x, sm(3))) G.m_menu = 0;
			break;

		//List
		case Cmenu_ed_list:
			DrawImage(G.gfx_win, 215, 0);
			if (gui_ibutton(742, 5, Cicon_x, sm(15), 1, 0, 1)) G.m_menu = 0;
			DrawImage(G.gfx_icons, 236, 5, Cicon_list);
			bmpf_txt(236 + 37, 10, se(201));
			DrawImage(G.gfx_winbar, 215, 42);

			//Groups
			if (gui_opt(236, 63, se(7), Cclass_object, 3)) G.in_scr_scr = 0;
			if (gui_opt(236, 63 + 20, se(8), Cclass_unit, 3)) G.in_scr_scr = 0;
			if (gui_opt(236 + 200, 63, se(9), Cclass_item, 3)) G.in_scr_scr = 0;
			if (gui_opt(236 + 200, 63 + 20, se(10), Cclass_info, 3)) G.in_scr_scr = 0;
			if (gui_opt(236 + 400, 63, se(80), Cclass_state, 3)) G.in_scr_scr = 0;
			if (gui_opt(236 + 400, 63 + 20, se(81), 100, 3)) G.in_scr_scr = 0;

			DrawImage(G.gfx_winbar, 215, 63 + 40);

			y = 103 + 16 + 5;
			scrolldown = 0;

			//List
			switch (G.in_opt[3]) {
				//Objects
				case Cclass_object:
					i = 0;
					for (Tobject_ = First(Tobject); Tobject_ !== null; Tobject_ = After(Tobject, Tobject_)) {
						i = i + 1;
						if (G.in_scr_scr < i) {
							//Over?
							over = 0;
							if (G.in_mx >= 236) {
								if (G.in_mx <= 738) {
									if (G.in_my >= y) {
										if (G.in_my < y + 45) {
											over = 1;
										}
									}
								}
							}
							//Output
							typ = Tobject_.typ;
							DrawBlock(G.gfx_if_itemback, 236, y);
							DrawImage(Dobject_iconh(typ), 236, y);
							bmpf_txt(236 + 45, y, '#' + Str(Tobject_.id) + ' ' + Dobject_name(typ) + ' (' + Str(typ) + ')', over);
							//Action
							if (over) {
								if (G.in_mrelease[1]) {
									editor_setmenu(Cmenu_ed_objects, Tobject_.id);
								}
							}
							//Pos
							y = y + 45;
							if (y > 550) {
								scrolldown = 1;
								break;
							}
						}
					}

					c = 0;
					for (Tobject_ = First(Tobject); Tobject_ !== null; Tobject_ = After(Tobject, Tobject_)) {
						c = c + 1;
					}
					G.in_scr_scr = gui_scrollbar(742, 161, 500 - 161, c, G.in_scr_scr, 10);
					break;

				//Units
				case Cclass_unit:
					i = 0;
					for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
						i = i + 1;
						if (G.in_scr_scr < i) {
							//Over?
							over = 0;
							if (G.in_mx >= 236) {
								if (G.in_mx <= 738) {
									if (G.in_my >= y) {
										if (G.in_my < y + 45) {
											over = 1;
										}
									}
								}
							}
							//Output
							typ = Tunit_.typ;
							DrawBlock(G.gfx_if_itemback, 236, y);
							DrawImage(Dunit_iconh(typ), 236, y);
							bmpf_txt(236 + 45, y, '#' + Str(Tunit_.id) + ' ' + Dunit_name(typ) + ' (' + Str(typ) + ')', over);
							//Action
							if (over) {
								if (G.in_mrelease[1]) {
									editor_setmenu(Cmenu_ed_units, Tunit_.id);
								}
							}
							//Pos
							y = y + 45;
							if (y > 550) {
								scrolldown = 1;
								break;
							}
						}
					}

					c = 0;
					for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
						c = c + 1;
					}
					G.in_scr_scr = gui_scrollbar(742, 161, 500 - 161, c, G.in_scr_scr, 10);
					break;

				//Items
				case Cclass_item:
					i = 0;
					for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
						i = i + 1;
						if (G.in_scr_scr < i) {
							//Over?
							over = 0;
							if (G.in_mx >= 236) {
								if (G.in_mx <= 738) {
									if (G.in_my >= y) {
										if (G.in_my < y + 45) {
											over = 1;
										}
									}
								}
							}
							//Output
							typ = Titem_.typ;
							DrawBlock(G.gfx_if_itemback, 236, y);
							DrawImage(Ditem_iconh(typ), 236, y);
							bmpf_txt(236 + 45, y, '#' + Str(Titem_.id) + ' ' + Ditem_name(typ) + ' (' + Str(typ) + ')', over);
							if (Titem_.parent_class === 0) {
								bmpf_txt(236 + 45, y + 18, Str(Titem_.count) + 'x', Cbmpf_dark);
							} else {
								bmpf_txt(236 + 45, y + 18, Str(Titem_.count) + 'x (' + se(142) + ')', Cbmpf_dark);
							}
							//Action
							if (over) {
								if (G.in_mrelease[1]) {
									editor_setmenu(Cmenu_ed_items, Titem_.id);
								}
							}
							//Pos
							y = y + 45;
							if (y > 550) {
								scrolldown = 1;
								break;
							}
						}
					}

					c = 0;
					for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
						c = c + 1;
					}
					G.in_scr_scr = gui_scrollbar(742, 161, 500 - 161, c, G.in_scr_scr, 10);
					break;

				//Infos
				case Cclass_info:
					i = 0;
					for (Tinfo_ = First(Tinfo); Tinfo_ !== null; Tinfo_ = After(Tinfo, Tinfo_)) {
						i = i + 1;
						if (G.in_scr_scr < i) {
							//Over?
							over = 0;
							// quirk: in_mx>=0 here (236 in the other lists)
							if (G.in_mx >= 0) {
								if (G.in_mx <= 738) {
									if (G.in_my >= y) {
										if (G.in_my < y + 45) {
											over = 1;
										}
									}
								}
							}
							//Output
							typ = Tinfo_.typ;
							DrawBlock(G.gfx_if_itemback, 236, y);
							DrawImage(G.gfx_icons, 236 + 4, y + 4, Dinfo_frame(typ));
							bmpf_txt(236 + 45, y, '#' + Str(Tinfo_.id) + ' ' + Dinfo_name(typ) + ' (' + Str(typ) + ')', over);
							//Action
							if (over) {
								if (G.in_mrelease[1]) {
									editor_setmenu(Cmenu_ed_infos, Tinfo_.id);
								}
							}
							//Pos
							y = y + 45;
							if (y > 550) {
								scrolldown = 1;
								break;
							}
						}
					}

					c = 0;
					for (Tinfo_ = First(Tinfo); Tinfo_ !== null; Tinfo_ = After(Tinfo, Tinfo_)) {
						c = c + 1;
					}
					G.in_scr_scr = gui_scrollbar(742, 161, 500 - 161, c, G.in_scr_scr, 10);
					break;

				//States
				case Cclass_state:
					i = 0;
					for (Tstate_ = First(Tstate); Tstate_ !== null; Tstate_ = After(Tstate, Tstate_)) {
						i = i + 1;
						if (G.in_scr_scr < i) {
							//Over?
							over = 0;
							if (G.in_mx >= 236) {
								if (G.in_mx <= 738) {
									if (G.in_my >= y) {
										if (G.in_my < y + 45) {
											over = 1;
										}
									}
								}
							}
							//Output
							typ = Tstate_.typ;
							DrawBlock(G.gfx_if_itemback, 236, y);
							DrawImage(G.gfx_states, 236 + 10, y + 10, Dstate_frame(typ));
							DrawImage(G.gfx_state, 236 + 10, y + 10, G.in_statefxf);
							bmpf_txt(236 + 45, y, Dstate_name(typ) + ' (' + Str(typ) + ')', over);
							switch (Tstate_.parent_class) {
								case Cclass_object:
									bmpf_txt(236 + 45, y + 18, '@ ' + se(165) + ' #' + Str(Tstate_.parent_id), Cbmpf_dark);
									break;
								case Cclass_unit:
									bmpf_txt(236 + 45, y + 18, '@ ' + se(166) + ' #' + Str(Tstate_.parent_id), Cbmpf_dark);
									break;
								case Cclass_item:
									bmpf_txt(236 + 45, y + 18, '@ ' + se(168) + ' #' + Str(Tstate_.parent_id), Cbmpf_dark);
									break;
								case Cclass_info:
									bmpf_txt(236 + 45, y + 18, '@ ' + se(167) + ' #' + Str(Tstate_.parent_id), Cbmpf_dark);
									break;
								default:
									bmpf_txt(236 + 45, y + 18, 'Global', Cbmpf_dark);
							}
							//Action
							if (over) {
								if (G.in_mrelease[1]) {
									G.in_input[3] = Str(Tstate_.typ);
									G.in_input[4] = Str(Tstate_.parent_class);
									G.in_input[5] = Str(Tstate_.parent_id);
									editor_setmenu(Cmenu_ed_states);
								}
							}
							//Pos
							y = y + 45;
							if (y > 550) {
								scrolldown = 1;
								break;
							}
						}
					}

					c = 0;
					for (Tstate_ = First(Tstate); Tstate_ !== null; Tstate_ = After(Tstate, Tstate_)) {
						c = c + 1;
					}
					G.in_scr_scr = gui_scrollbar(742, 161, 500 - 161, c, G.in_scr_scr, 10);
					break;

				//Scripts
				case 100:
					i = 0;
					for (Tx_ = First(Tx); Tx_ !== null; Tx_ = After(Tx, Tx_)) {
						if (Tx_.mode === 0) {
							i = i + 1;
							if (G.in_scr_scr < i) {
								//Over?
								over = 0;
								if (G.in_mx >= 236) {
									if (G.in_mx <= 738) {
										if (G.in_my >= y) {
											if (G.in_my < y + 45) {
												over = 1;
											}
										}
									}
								}
								//Output
								DrawBlock(G.gfx_if_itemback, 236, y);
								bmpf_txt(236 + 45, y, 'Script', over);
								switch (Tx_.parent_class) {
									case Cclass_object:
										bmpf_txt(236 + 45, y + 18, '@ ' + se(165) + ' #' + Str(Tx_.parent_id), Cbmpf_dark);
										if (con_object(Tx_.parent_id)) {
											DrawImage(Dobject_iconh(G.TCobject!.typ), 236, y);
										}
										break;
									case Cclass_unit:
										bmpf_txt(236 + 45, y + 18, '@ ' + se(166) + ' #' + Str(Tx_.parent_id), Cbmpf_dark);
										if (con_unit(Tx_.parent_id)) {
											DrawImage(Dunit_iconh(G.TCunit!.typ), 236, y);
										}
										break;
									case Cclass_item:
										bmpf_txt(236 + 45, y + 18, '@ ' + se(168) + ' #' + Str(Tx_.parent_id), Cbmpf_dark);
										if (con_item(Tx_.parent_id)) {
											DrawImage(Ditem_iconh(G.TCitem!.typ), 236, y);
										}
										break;
									case Cclass_info:
										bmpf_txt(236 + 45, y + 18, '@ ' + se(167) + ' #' + Str(Tx_.parent_id), Cbmpf_dark);
										if (con_info(Tx_.parent_id)) {
											DrawImage(G.gfx_icons, 236 + 4, y + 4, Dinfo_frame(G.TCinfo!.typ));
										}
										break;
									default:
										bmpf_txt(236 + 45, y + 18, 'Global', Cbmpf_dark);
								}
								DrawImage(G.gfx_icons, 236, y, Cicon_script);
								//Action
								if (over) {
									if (G.in_mrelease[1]) {
										G.in_input[3] = Str(Tx_.parent_class);
										G.in_input[4] = Str(Tx_.parent_id);
										editor_setmenu(Cmenu_ed_scripts);
									}
								}
								//Pos
								y = y + 45;
								if (y > 550) {
									scrolldown = 1;
									break;
								}
							}
						}
					}

					c = 0;
					for (Tx_ = First(Tx); Tx_ !== null; Tx_ = After(Tx, Tx_)) {
						if (Tx_.mode === 0) {
							c = c + 1;
						}
					}
					G.in_scr_scr = gui_scrollbar(742, 161, 500 - 161, c, G.in_scr_scr, 10);
					break;
			}

			//Scroll
			if (gui_ibutton(742, 124, Cicon_up, sm(29), G.in_scr_scr > 0 ? 1 : 0)) {
				G.in_scr_scr = G.in_scr_scr - 1;
			}
			if (gui_ibutton(742, 542 - 37, Cicon_down, sm(30), scrolldown)) {
				G.in_scr_scr = G.in_scr_scr + 1;
			}

			//Okay
			if (gui_ibutton(742, 542, Cicon_ok, sm(5))) G.m_menu = 0;
			break;

		//Map
		case Cmenu_ed_map:
			DrawImage(G.gfx_win, 215, 0);
			if (gui_ibutton(742, 5, Cicon_x, sm(15), 1, 0, 1)) G.m_menu = 0;
			DrawImage(G.gfx_winbar, 215, 42);

			if_map();
			break;
	}

	// h: a local of the original that is only assigned (kept for fidelity)
	void h;
}

//############################################ EDITOR FILLMENU

/** Function editor_setmenu(menu,param=-1) */
export function editor_setmenu(menu: number, param: number = -1): void {
	let Tx_: Tx | null = null;
	let Tstate_: Tstate | null = null;

	G.in_prevmenu = G.m_menu;
	G.m_menu = menu;
	G.in_scr_scr = 0;
	G.in_scr_scr2 = 0;
	G.in_scr_scr3 = 0;
	G.in_scr_descr = 0;
	switch (menu) {
		//### MAIN

		//New
		case Cmenu_ed_new:
			G.in_opt[3] = 0;
			G.in_opt[4] = 0;
			G.in_opt[5] = 0;
			G.in_check[5] = 1;
			G.in_check[6] = 1;
			G.in_check[7] = 1;
			G.in_check[8] = 1;
			break;
		//Load
		case Cmenu_ed_load:
			load_recent();
			G.in_input[3] = '';
			G.in_input[4] = '';
			G.in_opt[3] = 0;
			if (G.in_edmap !== '') G.in_input[3] = G.in_edmap;
			break;
		//Save
		case Cmenu_ed_save:
			load_recent();
			G.in_input[3] = '';
			G.in_input[4] = '';
			G.in_opt[3] = 0;
			if (G.in_edmap !== '') G.in_input[3] = G.in_edmap;
			break;

		//### TERRAIN

		//Heightmap
		case Cmenu_ed_heightmap:
			editor_heightmaptobuffer();
			G.in_editor_bufferx = -5;
			G.in_editor_buffery = -5;
			G.in_input[3] = '';
			G.in_input[4] = Str(1);
			G.in_slider[0] = 50;
			G.in_slider[10] = 100;
			G.in_edtool = 0;
			break;
		//Colormap
		case Cmenu_ed_colormap:
			editor_textobuffer(G.ter_tex_color);
			G.in_editor_bufferx = -5;
			G.in_editor_buffery = -5;
			G.in_input[3] = '';
			// layer: TextureHeight(ter_tex_color) through _additions
			G.in_input[4] = Str(ter_tex_color_height());
			G.in_edtool = 0;
			G.in_slider[10] = 100;
			break;
		//Grassmap
		case Cmenu_ed_grassmap:
			editor_grassmaptobuffer();
			G.in_editor_bufferx = -5;
			G.in_editor_buffery = -5;
			G.in_edtool = 0;
			break;
		//Random
		case Cmenu_ed_random:
			G.in_input[3] = Str(idivConst(G.ter_size * G.ter_size, 4));
			G.in_check[5] = 1;
			G.in_check[6] = 0;
			G.in_check[7] = 0;
			G.in_opt[5] = 1;
			G.in_scr_scr = 0;
			break;

		//### PROPERTIES
		case Cmenu_ed_settings:
			//Time
			G.in_input[3] = Str(G.map_day) + ':' + Str(G.map_hour) + ':' + Str(G.map_minute);
			G.in_check[5] = G.map_freezetime;
			//Skybox
			G.in_input[4] = G.map_skybox;
			//Multiplayer
			G.in_check[6] = G.map_multiplayer;
			//Climate
			G.in_opt[3] = G.map_climate;
			//Background Music
			G.in_input[5] = G.map_music;
			//Fog
			G.in_check[7] = G.map_fog[3];
			//Briefing/Global Scripts
			gui_tb_loadstring(G.map_briefing, SEP_LINE);
			break;

		//Object Properties
		case Cmenu_ed_objects:
			if (param !== -1) G.in_input[3] = Str(param);
			if (con_object(Int(G.in_input[3]))) {
				G.in_input[4] = Str(EntityYaw(G.TCobject!.h!), 'float');
				G.in_input[5] = Str(G.TCobject!.health, 'float');
				G.in_input[6] = Str(G.TCobject!.health_max, 'float');
				gui_tb_loadstring('', '');
				for (Tx_ = First(Tx); Tx_ !== null; Tx_ = After(Tx, Tx_)) {
					if (Tx_.parent_class === Cclass_object) {
						if (Tx_.parent_id === Int(G.in_input[3])) {
							if (Tx_.mode === 0) {
								gui_tb_loadstring(Tx_.value, SEP_LINE);
							}
						}
					}
				}
			}
			break;
		//Unit Properties
		case Cmenu_ed_units:
			if (param !== -1) G.in_input[3] = Str(param);
			if (con_unit(Int(G.in_input[3]))) {
				G.in_input[4] = Str(EntityYaw(G.TCunit!.h!), 'float');
				G.in_input[5] = Str(G.TCunit!.health, 'float');
				G.in_input[6] = Str(G.TCunit!.health_max, 'float');
				gui_tb_loadstring('', '');
				for (Tx_ = First(Tx); Tx_ !== null; Tx_ = After(Tx, Tx_)) {
					if (Tx_.parent_class === Cclass_unit) {
						if (Tx_.parent_id === Int(G.in_input[3])) {
							if (Tx_.mode === 0) {
								gui_tb_loadstring(Tx_.value, SEP_LINE);
							}
						}
					}
				}
			}
			break;
		//Item Properties
		case Cmenu_ed_items:
			if (param !== -1) G.in_input[3] = Str(param);
			if (con_item(Int(G.in_input[3]))) {
				G.in_input[4] = Str(EntityYaw(G.TCitem!.h!), 'float');
				G.in_input[5] = Str(G.TCitem!.health, 'float');
				G.in_input[6] = Str(G.TCitem!.count);
				gui_tb_loadstring('', '');
				for (Tx_ = First(Tx); Tx_ !== null; Tx_ = After(Tx, Tx_)) {
					if (Tx_.parent_class === Cclass_item) {
						if (Tx_.parent_id === Int(G.in_input[3])) {
							if (Tx_.mode === 0) {
								gui_tb_loadstring(Tx_.value, SEP_LINE);
							}
						}
					}
				}
				G.in_input[7] = Str(0);
				if (G.TCitem!.parent_class !== 0) {
					if (G.TCitem!.parent_mode === Cpm_out) {
						G.in_input[7] = Str(G.TCitem!.parent_id);
					}
				}
			}
			break;
		//Info Properties
		case Cmenu_ed_infos:
			if (param !== -1) G.in_input[3] = Str(param);
			if (con_info(Int(G.in_input[3]))) {
				switch (G.TCinfo!.typ) {
					//Sprite
					case 5:
						G.in_input[4] = G.TCinfo!.strings[0];
						G.in_input[5] = Str(G.TCinfo!.floats[0], 'float');
						G.in_input[6] = Str(G.TCinfo!.floats[1], 'float');
						G.in_scol[0] = G.TCinfo!.ints[0];
						G.in_scol[1] = G.TCinfo!.ints[1];
						G.in_scol[2] = G.TCinfo!.ints[2];
						G.in_slider[0] = Int(Float(f32(G.TCinfo!.floats[2] * 100)));
						G.in_check[0] = Int(G.TCinfo!.strings[1]);
						G.in_check[1] = Int(G.TCinfo!.strings[2]);
						break;
					//Trigger Range,Trigger Time,Trigger Item Count
					case 10:
					case 11:
					case 12:
						G.in_opt[3] = G.TCinfo!.ints[0];
						G.in_input[4] = Str(G.TCinfo!.ints[1]);
						G.in_input[5] = Str(G.TCinfo!.ints[2]);
						G.in_input[6] = Str(Int(G.TCinfo!.floats[0]));
						G.in_check[0] = Int(G.TCinfo!.floats[1]);
						G.in_input[7] = Str(Int(G.TCinfo!.floats[2]));
						break;
					//Map Indication
					case 36:
						G.in_opt[3] = G.TCinfo!.ints[0];
						G.in_check[0] = G.TCinfo!.ints[1];
						G.in_input[4] = G.TCinfo!.strings[0];
						break;
					//Areas
					case 41:
					case 42:
					case 43:
					case 44:
						G.in_input[4] = Str(Int(G.TCinfo!.floats[0]));
						break;
					//Spawn Control
					case 45:
						G.in_input[4] = Str(Int(G.TCinfo!.floats[0]));
						G.in_check[0] = Int(G.TCinfo!.floats[1]);
						G.in_opt[3] = G.TCinfo!.ints[0];
						G.in_input[5] = Str(G.TCinfo!.ints[1]);
						G.in_input[6] = Str(G.TCinfo!.ints[2]);
						G.in_input[7] = Str(Int(G.TCinfo!.strings[0]));
						G.in_input[8] = Str(Int(G.TCinfo!.strings[1]));
						break;
					//AI Area
					case 46:
						G.in_input[4] = Str(Int(G.TCinfo!.floats[0]));
						G.in_opt[3] = G.TCinfo!.ints[0];
						break;
					//Loudspeaker
					case 47:
						G.in_input[4] = G.TCinfo!.strings[0];
						G.in_input[5] = Str(Int(G.TCinfo!.floats[0]));
						break;
					//Previewimage
					case 48:
						G.in_input[4] = G.TCinfo!.strings[0];
						break;
				}
				gui_tb_loadstring('', '');
				for (Tx_ = First(Tx); Tx_ !== null; Tx_ = After(Tx, Tx_)) {
					if (Tx_.parent_class === Cclass_info) {
						if (Tx_.parent_id === Int(G.in_input[3])) {
							if (Tx_.mode === 0) {
								gui_tb_loadstring(Tx_.value, SEP_LINE);
							}
						}
					}
				}
			}
			break;

		//Script Editor
		case Cmenu_ed_scripts:
			//in_input(3)=Script Parent Class
			//in_input(4)=Script Parent ID
			gui_tb_loadstring('', '');
			if (G.in_prevmenu === Cmenu_ed_settings) {
				gui_tb_loadstring(G.map_briefing, SEP_LINE);
			} else if (Int(G.in_input[3]) === -1) {
				gui_tb_loadstring(G.ed_setscript, SEP_LINE);
			} else {
				for (Tx_ = First(Tx); Tx_ !== null; Tx_ = After(Tx, Tx_)) {
					if (Tx_.parent_class === Int(G.in_input[3])) {
						if (Tx_.parent_id === Int(G.in_input[4])) {
							if (Tx_.mode === 0) {
								gui_tb_loadstring(Tx_.value, SEP_LINE);
								break;
							}
						}
					}
				}
			}
			break;

		//State Properties
		case Cmenu_ed_states:
			//in_input(3)=State Parent Type
			//in_input(4)=State Parent Class
			//in_input(5)=State Parent ID
			for (Tstate_ = First(Tstate); Tstate_ !== null; Tstate_ = After(Tstate, Tstate_)) {
				if (Tstate_.typ === Int(G.in_input[3])) {
					if (Tstate_.parent_class === Int(G.in_input[4])) {
						if (Tstate_.parent_id === Int(G.in_input[5])) {
							G.in_input[6] = Str(Tstate_.value_f, 'float');
							G.in_input[7] = Str(Tstate_.value);
							split(Tstate_.value_s, ',', 3);
							G.in_scol[0] = Int(G.splits[0]);
							G.in_scol[1] = Int(G.splits[1]);
							G.in_scol[2] = Int(G.splits[2]);
						}
					}
				}
			}
			break;

		//Map
		case Cmenu_ed_map:
			if (G.map_mapimage !== 0) {
				FreeImage(G.map_mapimage);
				G.map_mapimage = 0;
			}
			break;
	}
}

//Save Script
/** Function editor_savescript(class,id=0) */
export function editor_savescript(class_: number, id: number = 0): number {
	let Tx_: Tx | null = null;

	//Global Scripts
	if (class_ === 0) {
		if (gui_tb_filled()) {
			G.map_briefing = gui_tb_savestring(SEP_LINE);
		} else {
			G.map_briefing = '';
		}
		return 1;
	} else if (class_ === -1) {
		if (gui_tb_filled()) {
			G.ed_setscript = gui_tb_savestring(SEP_LINE);
		} else {
			G.ed_setscript = '';
		}
		return 1;
	}
	//Change or Delete existing Script
	for (Tx_ = First(Tx); Tx_ !== null; Tx_ = After(Tx, Tx_)) {
		if (Tx_.parent_class === class_) {
			if (Tx_.parent_id === id) {
				if (Tx_.mode === 0) {
					if (gui_tb_filled()) {
						Tx_.value = gui_tb_savestring(SEP_LINE);
						return 1;
					} else {
						Delete(Tx, Tx_);
						return 0;
					}
				}
			}
		}
	}
	//Create new Script (if needed!)
	if (gui_tb_filled()) {
		Tx_ = New(Tx);
		Tx_.parent_class = class_;
		Tx_.parent_id = id;
		Tx_.value = gui_tb_savestring(SEP_LINE);
		return 1;
	} else {
		return 0;
	}
}

//Save Settings
/** Function editor_savesettings() */
export function editor_savesettings(): void {
	//Time
	const tstr: string = G.in_input[3];
	G.map_day = 1;
	G.map_hour = 9;
	G.map_minute = 0;
	let d1 = 0;
	let d2 = 0;
	d1 = Instr(tstr, ':');
	d2 = Instr(tstr, ':', d1 + 1);
	if (d2 !== 0) {
		G.map_day = Int(Mid(tstr, 1, d1 - 1));
		G.map_hour = Int(Mid(tstr, d1 + 1, d2 - d1 - 1));
		G.map_minute = Int(Mid(tstr, d2 + 1, -1));
	}
	if (G.map_day < 1) G.map_day = 1;
	if (G.map_hour < 0) G.map_hour = 0;
	if (G.map_hour > 23) G.map_hour = 23;
	if (G.map_minute < 0) G.map_minute = 0;
	if (G.map_minute > 59) G.map_minute = 59;
	G.map_freezetime = G.in_check[5];
	//Skybox
	G.map_skybox = G.in_input[4];
	//Multiplayer
	G.map_multiplayer = G.in_check[6];
	//Climate
	G.map_climate = G.in_opt[3];
	//Background Music
	G.map_music = G.in_input[5];
	//Fog
	G.map_fog[3] = G.in_check[7];
	//Briefing / Global Scripts
	if (gui_tb_filled()) {
		G.map_briefing = gui_tb_savestring(SEP_LINE);
	} else {
		G.map_briefing = '';
	}
	//Update Light
	e_environment_update_light();
}

//Childs Menu to setup Childs
/** Function editor_childs(pclass,pid,states=1,items=1,scripts=1) */
export function editor_childs(pclass: number, pid: number, states: number = 1, items: number = 1, scripts: number = 1): void {
	let x = 0;
	let y = 0;
	let j = 0;
	let Tstate_: Tstate | null = null;
	let ret = 0;
	let Titem_: Titem | null = null;
	let Tobject_: Tobject | null = null;
	let Tunit_: Tunit | null = null;
	let Tinfo_: Tinfo | null = null;

	//pclass = parent_class
	//pid = parent_id

	//##################################### States
	if (states) {
		//Child States List
		x = 0;
		y = 0;
		j = 0;
		bmpf_txt(236, 390, se(180) + ':');
		x = 450;
		for (Tstate_ = First(Tstate); Tstate_ !== null; Tstate_ = After(Tstate, Tstate_)) {
			if (Tstate_.parent_class === pclass) {
				if (Tstate_.parent_id === pid) {
					j = j + 1;
					if (j > G.in_scr_scr) {
						DrawBlock(G.gfx_if_itemback, x, 390);
						ret = gui_iconbox(x, 390, 0, se(181), 0);
						if (ret === 1) {
							free_state(Tstate_.typ, Tstate_.parent_class, Tstate_.parent_id);
							if (G.in_scr_scr > 0) G.in_scr_scr = G.in_scr_scr - 1;
						} else if (ret === 2) {
							G.in_input[3] = Str(Tstate_.typ);
							G.in_input[4] = Str(pclass);
							G.in_input[5] = Str(pid);
							editor_setmenu(Cmenu_ed_states);
						} else {
							DrawImage(G.gfx_states, x + 10, 390 + 10, Dstate_frame(Tstate_.typ));
							DrawImage(G.gfx_state, x + 10, 390 + 10, G.in_statefxf);
						}
						x = x + 45;
						if (x > 450 + 45 * 3) break;
					}
				}
			}
		}

		//Child State Options
		if (gui_ibutton(742, 390, Cicon_inc, se(182))) {
			if (G.in_opt[0] !== Cclass_state) {
				G.in_opt[0] = Cclass_state;
				editor_setmode(Cclass_state);
			} else {
				set_state(G.in_state_sel, pclass, pid);
				if (x > 450 + 45 * 3) G.in_scr_scr = G.in_scr_scr + 1;
			}
		}
		if (gui_ibutton(742 - 37, 390, Cicon_right, se(183), x > 450 + 45 * 3 ? 1 : 0)) G.in_scr_scr = G.in_scr_scr + 1;
		if (gui_ibutton(742 - 37 - 37, 390, Cicon_left, se(184), G.in_scr_scr > 0 ? 1 : 0)) G.in_scr_scr = G.in_scr_scr - 1;
	}

	//##################################### Items
	if (items) {
		//Child Items List
		x = 0;
		y = 0;
		j = 0;
		bmpf_txt(236, 440, se(9) + ':');
		x = 450;
		for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
			if (Titem_.parent_class === pclass) {
				if (Titem_.parent_id === pid) {
					j = j + 1;
					if (j > G.in_scr_scr2) {
						DrawBlock(G.gfx_if_itemback, x, 440);
						ret = gui_iconbox(x, 440, Ditem_iconh(Titem_.typ), se(181), 0);
						if (ret === 1) {
							free_item(Titem_.id);
							if (G.in_scr_scr2 > 0) G.in_scr_scr2 = G.in_scr_scr2 - 1;
						} else if (ret === 2) {
							editor_setmenu(Cmenu_ed_items, Titem_.id);
						} else {
							gui_iconboxc(x, 440, Titem_.count);
						}
						x = x + 45;
						if (x > 450 + 45 * 3) break;
					}
				}
			}
		}
		//Child Item Options
		if (gui_ibutton(742, 440, Cicon_inc, se(185))) {
			if (G.in_opt[0] !== Cclass_item) {
				G.in_opt[0] = Cclass_item;
				editor_setmode(Cclass_item);
			} else {
				set_item(-1, G.in_item_sel, 0, 0, 0, 1);
				store_item(G.TCitem!.id, pclass, pid);
				if (x > 450 + 45 * 3) G.in_scr_scr2 = G.in_scr_scr2 + 1;
			}
		}
		if (gui_ibutton(742 - 37, 440, Cicon_right, se(183), x > 450 + 45 * 3 ? 1 : 0)) G.in_scr_scr2 = G.in_scr_scr2 + 1;
		if (gui_ibutton(742 - 37 - 37, 440, Cicon_left, se(184), G.in_scr_scr2 > 0 ? 1 : 0)) G.in_scr_scr2 = G.in_scr_scr2 - 1;
	}

	//##################################### Scripts
	if (scripts) {
		//Scripts
		bmpf_txt(236, 490, se(170) + ':');
		gui_tb(450, 490, 285, 3, 0, 1);
		if (gui_ibutton(742, 490, Cicon_script, se(71))) {
			//Save Stuff
			switch (pclass) {
				//Object
				case Cclass_object:
					for (Tobject_ = First(Tobject); Tobject_ !== null; Tobject_ = After(Tobject, Tobject_)) {
						if (Tobject_.id === pid) {
							//Rotation
							RotateEntity(Tobject_.h!, EntityPitch(Tobject_.h!), Float(G.in_input[4]), EntityRoll(Tobject_.h!));
							//Health
							Tobject_.health = Float(G.in_input[5]);
							Tobject_.health_max = Float(G.in_input[6]);
							//Script
							editor_savescript(Cclass_object, Int(G.in_input[3]));
							break;
						}
					}
					break;
				//Unit
				case Cclass_unit:
					for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
						if (Tunit_.id === pid) {
							//Rotation
							RotateEntity(Tunit_.h!, EntityPitch(Tunit_.h!), Float(G.in_input[4]), EntityRoll(Tunit_.h!));
							//Health
							Tunit_.health = Float(G.in_input[5]);
							Tunit_.health_max = Float(G.in_input[6]);
							//Script
							editor_savescript(Cclass_unit, Int(G.in_input[3]));
							break;
						}
					}
					break;
				//Item
				case Cclass_item:
					for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
						if (Titem_.id === pid) {
							//Rotation
							RotateEntity(Titem_.h!, EntityPitch(Titem_.h!), Float(G.in_input[4]), EntityRoll(Titem_.h!));
							//Health
							Titem_.health = Float(G.in_input[5]);
							//Count
							if (Int(G.in_input[6]) < 1) G.in_input[6] = Str(1);
							Titem_.count = Int(G.in_input[6]);
							//Script
							editor_savescript(Cclass_item, Int(G.in_input[3]));
							break;
						}
					}
					break;
				//Info
				case Cclass_info:
					for (Tinfo_ = First(Tinfo); Tinfo_ !== null; Tinfo_ = After(Tinfo, Tinfo_)) {
						if (Tinfo_.id === pid) {
							editor_saveinfo(Tinfo_);
							break;
						}
					}
					break;
			}
			//Open Scriptmenu
			G.in_input[3] = Str(pclass);
			G.in_input[4] = Str(pid);
			editor_setmenu(Cmenu_ed_scripts);
		}
	}

	// y: a local of the original that is only assigned (kept for fidelity)
	void y;
}

/** Function editor_saveinfo(Tinfo.Tinfo) */
export function editor_saveinfo(Tinfo_: Tinfo | null): void {
	switch (Tinfo_!.typ) {
		//Sprite
		case 5:
			Tinfo_!.strings[0] = G.in_input[4];
			Tinfo_!.floats[0] = Float(G.in_input[5]);
			Tinfo_!.floats[1] = Float(G.in_input[6]);
			Tinfo_!.ints[0] = G.in_scol[0];
			Tinfo_!.ints[1] = G.in_scol[1];
			Tinfo_!.ints[2] = G.in_scol[2];
			Tinfo_!.floats[2] = Float(f32(Float(G.in_slider[0]) / 100));
			Tinfo_!.strings[1] = Str(G.in_check[0]);
			Tinfo_!.strings[2] = Str(G.in_check[1]);
			info_vts();
			info_setupsprite(Tinfo_);
			break;
		//Trigger Range,Trigger Time,Trigger Item Count
		case 10:
		case 11:
		case 12:
			Tinfo_!.ints[0] = G.in_opt[3];
			Tinfo_!.ints[1] = Int(G.in_input[4]);
			Tinfo_!.ints[2] = Int(G.in_input[5]);
			Tinfo_!.floats[0] = f32(Int(G.in_input[6]));
			Tinfo_!.floats[1] = f32(Int(G.in_check[0]));
			Tinfo_!.floats[2] = f32(Int(G.in_input[7]));
			info_vts();
			break;
		//Map Indication
		case 36:
			Tinfo_!.ints[0] = G.in_opt[3];
			Tinfo_!.ints[1] = Int(G.in_check[0]);
			Tinfo_!.strings[0] = G.in_input[4];
			info_vts();
			break;
		//Areas
		case 41:
		case 42:
		case 43:
		case 44:
			// quirk: writes through the global TCinfo, not the parameter (also in the cases below)
			G.TCinfo!.floats[0] = f32(Int(G.in_input[4]));
			info_vts();
			break;
		//Spawn Control
		case 45:
			G.TCinfo!.floats[0] = f32(Int(G.in_input[4]));
			Tinfo_!.floats[1] = f32(Int(G.in_check[0]));
			G.TCinfo!.ints[0] = G.in_opt[3];
			G.TCinfo!.ints[1] = Int(G.in_input[5]);
			G.TCinfo!.ints[2] = Int(G.in_input[6]);
			G.TCinfo!.strings[0] = Str(Int(G.in_input[7]));
			G.TCinfo!.strings[1] = Str(Int(G.in_input[8]));
			info_vts();
			break;
		//AI Area
		case 46:
			G.TCinfo!.floats[0] = f32(Int(G.in_input[4]));
			G.TCinfo!.ints[0] = G.in_opt[3];
			info_vts();
			break;
		//Loudspeaker
		case 47:
			Tinfo_!.strings[0] = G.in_input[4];
			G.TCinfo!.floats[0] = f32(Int(G.in_input[5]));
			info_vts();
			break;
		//Previewimage
		case 48:
			Tinfo_!.strings[0] = G.in_input[4];
			info_vts();
			break;
	}
	//Save Script
	editor_savescript(Cclass_info, Int(G.in_input[3]));
}
