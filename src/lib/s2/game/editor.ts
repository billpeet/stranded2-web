/**
 * includes/editor.bb: line-by-line port (PORTING_GUIDE.md).
 *
 * editor() is the per-frame section function of the map editor.
 */
import {
	CameraPick,
	CameraProject,
	EntityPitch,
	EntityRoll,
	EntityX,
	EntityY,
	EntityYaw,
	EntityZ,
	HideEntity,
	MoveEntity,
	PickedEntity,
	PickedX,
	PickedY,
	PickedZ,
	PositionEntity,
	ProjectedX,
	ProjectedY,
	RotateEntity,
	ShowEntity,
	TerrainHeight,
	TextureHeight,
	UpdateWorld
} from '../bb3d';
import { Ceil, Cos, Int, MilliSecs, Rand, RuntimeError, SEP_LINE, Sin, Str, f32, fabs, fmod, idiv, idivConst } from '../blitz';
import { Cls, ClsColor, Color, DrawBlock, DrawImage, Line, Oval } from '../gfx2d';
import { KeyDown, KeyHit, MouseX, MouseY, MoveMouse } from '../input';
import {
	Cbmpf_tiny,
	Cclass_info,
	Cclass_item,
	Cclass_object,
	Cclass_unit,
	Cicon_all,
	Cicon_border,
	Cicon_borderdown,
	Cicon_borderup,
	Cicon_cam,
	Cicon_colormap,
	Cicon_distort,
	Cicon_down,
	Cicon_flatten,
	Cicon_grassmap,
	Cicon_heightmap,
	Cicon_inc,
	Cicon_linebrush,
	Cicon_list,
	Cicon_load,
	Cicon_map,
	Cicon_new,
	Cicon_options,
	Cicon_plotbrush,
	Cicon_save,
	Cicon_script,
	Cicon_settoterrain,
	Cicon_smooth,
	Cicon_up,
	Cicon_update,
	Cicon_updown,
	Cicon_x,
	Cmenu_ed_colormap,
	Cmenu_ed_grassmap,
	Cmenu_ed_heightmap,
	Cmenu_ed_infos,
	Cmenu_ed_items,
	Cmenu_ed_list,
	Cmenu_ed_load,
	Cmenu_ed_map,
	Cmenu_ed_new,
	Cmenu_ed_objects,
	Cmenu_ed_quit,
	Cmenu_ed_random,
	Cmenu_ed_save,
	Cmenu_ed_scripts,
	Cmenu_ed_settings,
	Cmenu_ed_units,
	Cstate_count,
	Cworld_size
} from './consts';
import { cull } from './cull';
import {
	Dinfo_frame,
	Dinfo_name,
	Ditem_iconh,
	Ditem_name,
	Dobject_align,
	Dobject_iconh,
	Dobject_name,
	Dstate_frame,
	Dstate_name,
	Dunit_align,
	Dunit_iconh,
	Dunit_name
} from './defs_arrays';
import {
	RenderWorld,
	e_environment_update,
	e_environment_update_water,
	e_environment_water2dfx,
	e_terrainborder,
	e_terraincompleteh,
	e_terraindistort,
	e_terraindistortp,
	e_terrainflatten,
	e_terrainground,
	e_terrainsmooth,
	e_terrainsmoothp,
	e_terraintrans,
	e_tery
} from './e_environment';
import { editor_list, editor_paintcm, editor_range, editor_setdummy, editor_setfx, editor_setmode, editor_settoterrain, editor_testmap } from './editor_functions';
import { editor_menus, editor_setmenu } from './editor_menus';
import { dist, drawaxes, groundpitch } from './functions';
import { grass_spread } from './grasspread';
import { gui_colorbox, gui_groupsel, gui_ibutton, gui_iconbox, gui_opt, gui_scrollbar, gui_tt, gui_txtb, gui_win_color } from './gui';
import { gui_tb_loadstring } from './gui_tb';
import { ha_getclass, ha_setpos } from './handle_all';
import { draw_info, frap_info, free_info, get_info, serialpeak_info, set_info } from './handle_infos';
import { draw_item, frap_item, free_item, get_item, serialpeak_item, set_item } from './handle_items';
import { draw_object, frap_object, free_object, get_object, serialpeak_object, set_object } from './handle_objects';
import { update_state } from './handle_states';
import { draw_unit, frap_unit, free_unit, get_unit, serialpeak_unit, set_unit } from './handle_units';
import { endinput, getinput } from './input';
import { bmpf_txt } from './load_bmpf';
import { se, sm, ss } from './load_strings';
import { mb_update } from './motionblur';
import { parent_pos } from './parentchild';
import { parse_editorsetscript } from './parser_functions';
import { p_update } from './particles';
import { G } from './state';
import { After, First, Tgroupl, Tinfo, Titem, Tobject, Tunit } from './types';

//############################################ EDITOR

/** Function editor() */
export async function editor(): Promise<void> {
	let ct = 0;
	let camspeed = 0;
	let x = 0;
	let size = 0;
	let over = 0;
	let z = 0;
	let i = 0;
	let visx1 = 0;
	let visz1 = 0;
	let visy1 = 0;
	let visx2 = 0;
	let visz2 = 0;
	let visy2 = 0;
	let lx1 = 0;
	let ly1 = 0;
	let lx2 = 0;
	let ly2 = 0;
	let pbvf = 0;
	let Tobject_: Tobject | null = null;
	let Tunit_: Tunit | null = null;
	let Titem_: Titem | null = null;
	let Tinfo_: Tinfo | null = null;
	let y = 0;
	let j = 0;
	let Tgroupl_: Tgroupl | null = null;
	let shift = 0;

	//Unpaused?
	G.g_unpaused = 1;

	//Input
	getinput();
	G.in_edoverinfo = '';

	//Terrain Ground
	HideEntity(G.env_ground);
	e_terrainground(0);

	//Render
	if (G.m_menu === 0) {
		//Renderstuff
		ct = MilliSecs();
		UpdateWorld(G.f);
		//Debug Times
		if (G.set_debug_rt) {
			G.set_debug_rt_updateworld = Str(MilliSecs() - ct) + ' ms Update';
		}

		//Update
		await cull();

		e_environment_update_water();
		G.set_debug_rt_render = MilliSecs();
		RenderWorld();
		G.set_debug_rt_render = MilliSecs() - G.set_debug_rt_render;
		await mb_update();
		e_environment_water2dfx();

		grass_spread();
		e_environment_update();
		update_state();
		draw_info();
	} else {
		ClsColor(0, 0, 0);
		Cls();
	}

	//### Move Cam
	if (G.m_menu === 0) {
		camspeed = f32(f32(2 + G.in_accelerate) * G.f);
		x = 0;
		if (KeyDown(31)) {
			MoveEntity(G.cam, 0, 0, f32(-camspeed));
			x = 1;
		} //Backwards
		if (KeyDown(17)) {
			MoveEntity(G.cam, 0, 0, camspeed);
			x = 1;
		} //Forwards
		if (KeyDown(30)) {
			MoveEntity(G.cam, f32(-camspeed), 0, 0);
			x = 1;
		} //Left
		if (KeyDown(32)) {
			MoveEntity(G.cam, camspeed, 0, 0);
			x = 1;
		} //Right
		if (x) {
			G.in_accelerate = f32(G.in_accelerate + f32(G.f / 0.5));
			if (G.in_accelerate > 30) G.in_accelerate = 30;
		} else {
			G.in_accelerate = 0;
		}
	}

	//### Mouse
	if (G.in_mrelease[1]) G.in_turnh = null;
	if ((G.in_mx > 210 || G.in_editor_sidebar === 0) && G.m_menu === 0) {
		if (G.in_mx > 37 || G.in_my < G.set_scry - 37) {
			//Rotate Cam
			if (G.in_mdown[2] === 1) {
				G.in_cursorf = 2;
				if (G.in_mxs !== 0) RotateEntity(G.cam, EntityPitch(G.cam), f32(EntityYaw(G.cam) + G.in_mxs), EntityRoll(G.cam));
				if (G.in_mys !== 0) {
					if (G.in_mys > 0) {
						if (f32(EntityPitch(G.cam) + G.in_mys) > 70) {
							G.in_mys = f32(70 - EntityPitch(G.cam));
						}
						RotateEntity(G.cam, f32(EntityPitch(G.cam) + G.in_mys), EntityYaw(G.cam), EntityRoll(G.cam));
					} else if (G.in_mys < 0) {
						if (f32(EntityPitch(G.cam) + G.in_mys) < -70) {
							G.in_mys = f32(-70 - EntityPitch(G.cam));
						}
						RotateEntity(G.cam, f32(EntityPitch(G.cam) + G.in_mys), EntityYaw(G.cam), EntityRoll(G.cam));
					}
				}
			}

			//Rotate Turn Handle Entity
			if (G.in_turnh !== null) {
				G.in_cursorf = 4;
				RotateEntity(G.in_turnh, EntityPitch(G.in_turnh), f32(EntityYaw(G.in_turnh) - f32(G.in_mxs * G.f)), EntityRoll(G.in_turnh));
				CameraProject(G.cam, EntityX(G.in_turnh), EntityY(G.in_turnh), EntityZ(G.in_turnh));
				MoveMouse(Int(ProjectedX()), Int(ProjectedY()));
				G.in_mx = MouseX();
				G.in_my = MouseY();
				drawaxes(G.in_turnh, 20);
			}

			//Pick?
			x = 0;
			//Pick on -> Click/Release!
			if (G.in_mhit[1] === 1 || G.in_mrelease[1] === 1) x = 1;
			//Pick on:
			if (G.in_opt[1] === 0) {
				//If in_mzs#<>0.0 Then x=1
				//If in_mdown(1) Then x=1
			}
			//Pick on -> Mousemove
			x = 1;
			//Pick on -> Mousewheel @ in Terrain Menu
			if (G.in_opt[0] === 0) {
				if (G.in_mzs !== 0) x = 1;
			}
			//Perform Pick!
			if (x === 1) {
				G.in_pe = null;
				CameraPick(G.cam, G.in_mx, G.in_my);
				G.in_px = PickedX();
				G.in_py = PickedY();
				G.in_pz = PickedZ();
				G.in_pe = PickedEntity();
			}
		}
	}

	//### Menu (SIDEBAR)
	if (G.in_editor_sidebar === 1) {
		DrawImage(G.gfx_sidebar, 0, 0);

		//Main Options (New,Load,Save,Settings,Quit)
		if (gui_ibutton(5, 5, Cicon_new, se(1) + '...')) editor_setmenu(Cmenu_ed_new);
		if (gui_ibutton(5 + 37, 5, Cicon_load, se(2) + '...')) editor_setmenu(Cmenu_ed_load);
		if (gui_ibutton(5 + 37 + 37, 5, Cicon_save, se(3) + '...')) editor_setmenu(Cmenu_ed_save);
		if (gui_ibutton(5 + 37 + 37 + 37, 5, Cicon_options, se(4) + '...')) editor_setmenu(Cmenu_ed_settings);
		if (gui_ibutton(5 + 37 + 37 + 37 + 37, 5, Cicon_x, se(5) + '...')) editor_setmenu(Cmenu_ed_quit);

		DrawImage(G.gfx_border[1], -40, 32 + 5 + 5);
		DrawImage(G.gfx_border[0], 194, 32 + 5 + 5);

		//Sections (Terrain,Objects,Units,Items,Infos)
		if (gui_opt(5, 63, se(6), 0, 0)) editor_setmode(0);
		if (gui_opt(5, 63 + 20, se(7), 1, 0)) editor_setmode(Cclass_object);
		if (gui_opt(5, 63 + 20 + 20, se(8), 2, 0)) editor_setmode(Cclass_unit);
		if (gui_opt(5, 63 + 20 + 20 + 20, se(9), 3, 0)) editor_setmode(Cclass_item);
		if (gui_opt(5, 63 + 20 + 20 + 20 + 20, se(10), 4, 0)) editor_setmode(Cclass_info);

		//List
		if (gui_ibutton(5 + 37 + 37 + 37 + 37, 63, Cicon_list, se(201))) {
			switch (G.in_opt[0]) {
				case 1:
					editor_setmenu(Cmenu_ed_list);
					G.in_opt[3] = 1;
					break;
				case 2:
					editor_setmenu(Cmenu_ed_list);
					G.in_opt[3] = 2;
					break;
				case 3:
					editor_setmenu(Cmenu_ed_list);
					G.in_opt[3] = 3;
					break;
				case 4:
					editor_setmenu(Cmenu_ed_list);
					G.in_opt[3] = 4;
					break;
				case 5:
					editor_setmenu(Cmenu_ed_list);
					G.in_opt[3] = 5;
					break;
				default:
					editor_setmenu(Cmenu_ed_list);
					G.in_opt[3] = 1;
			}
		}

		//Map
		if (gui_ibutton(5 + 37 + 37 + 37 + 37, 63 + 37, Cicon_map, sm(169))) {
			editor_setmenu(Cmenu_ed_map);
		}

		//Borders
		DrawImage(G.gfx_border[1], -40, 165);
		DrawImage(G.gfx_border[0], 194, 165);
	}

	switch (G.in_opt[0]) {
		//### Terrain Menu
		case 0:
			if (G.in_editor_sidebar === 1) {
				//Terrain Maps Options
				if (gui_ibutton(5, 186, Cicon_heightmap, se(11) + '...')) editor_setmenu(Cmenu_ed_heightmap);
				if (gui_ibutton(5 + 37, 186, Cicon_colormap, se(12) + '...')) editor_setmenu(Cmenu_ed_colormap);
				//gui_ibutton(5+37+37,186,Cicon_stuffmap,"Objectmap bearbeiten...")
				if (gui_ibutton(5 + 37 + 37, 186, Cicon_grassmap, se(13) + '...')) editor_setmenu(Cmenu_ed_grassmap);
				if (gui_ibutton(5 + 37 + 37 + 37, 186, Cicon_all, se(216) + '...')) editor_setmenu(Cmenu_ed_random);

				//Terrain Options
				if (gui_ibutton(5, 186 + 37, Cicon_up, se(14), G.m_menu === 0 ? 1 : 0)) e_terraincompleteh(f32(0.01));
				if (gui_ibutton(5 + 37, 186 + 37, Cicon_down, se(15), G.m_menu === 0 ? 1 : 0)) e_terraincompleteh(f32(-0.01));
				if (gui_ibutton(5 + 37 + 37, 186 + 37, Cicon_smooth, se(16), G.m_menu === 0 ? 1 : 0)) e_terrainsmooth();
				if (gui_ibutton(5 + 37 + 37 + 37, 186 + 37, Cicon_distort, se(17), G.m_menu === 0 ? 1 : 0)) e_terraindistort(f32(0.05));
				if (gui_ibutton(5 + 37 + 37 + 37 + 37, 186 + 37, Cicon_settoterrain, se(18), G.m_menu === 0 ? 1 : 0)) editor_settoterrain();

				//Terrain Border Options
				if (gui_ibutton(5, 186 + 37 + 37, Cicon_borderup, se(19), G.m_menu === 0 ? 1 : 0)) e_terrainborder(-1, f32(0.01));
				if (gui_ibutton(5 + 37, 186 + 37 + 37, Cicon_borderdown, se(20), G.m_menu === 0 ? 1 : 0)) e_terrainborder(-1, f32(-0.01));
				if (gui_ibutton(5 + 37 + 37, 186 + 37 + 37, Cicon_border, se(21), G.m_menu === 0 ? 1 : 0)) e_terrainborder(TerrainHeight(G.ter, 0, 0));

				//Terrain Instant Editing Brush
				Color(56, 34, 0);
				size = 10 + G.in_edbrush;
				Oval(100 - 1 - idivConst(size, 2), 380 - 1 - idivConst(size, 2), size + 2, size + 2, 1);
				Color(0, 0, 0);
				Oval(100 - idivConst(size, 2), 380 - idivConst(size, 2), size, size, 1);
				over = 0;
				if (G.in_mx > 5) {
					if (G.in_mx < 200) {
						if (G.in_my > 300) {
							if (G.in_my < 460) {
								over = 1;
								if (G.in_mdown[1]) {
									G.in_edbrush = G.in_edbrush + 1;
									if (G.in_edbrush > 99) G.in_edbrush = 99;
								} else if (G.in_mdown[2]) {
									G.in_edbrush = G.in_edbrush - 1;
									if (G.in_edbrush < 0) G.in_edbrush = 0;
								}
								if (G.in_mzs !== 0) {
									G.in_edbrush = Int(f32(G.in_edbrush + G.in_mzs));
									if (G.in_edbrush > 99) G.in_edbrush = 99;
									if (G.in_edbrush < 0) G.in_edbrush = 0;
									G.in_mzs = 0;
								}
								gui_tt(G.in_mx, G.in_my, se(22));
							}
						}
					}
				}
				bmpf_txt(5, 300, se(23) + ': ' + Str(G.in_edbrush + 1), over);

				//Terrain Tool
				if (gui_ibutton(5, 450, Cicon_updown, se(24), 1, G.in_edtertool === 0 ? 1 : 0)) G.in_edtertool = 0;
				if (gui_ibutton(5 + 37, 450, Cicon_flatten, se(25), 1, G.in_edtertool === 1 ? 1 : 0)) G.in_edtertool = 1;
				if (gui_ibutton(5 + 37 + 37, 450, Cicon_smooth, se(26), 1, G.in_edtertool === 2 ? 1 : 0)) G.in_edtertool = 2;
				if (gui_ibutton(5 + 37 + 37 + 37, 450, Cicon_distort, se(27), 1, G.in_edtertool === 3 ? 1 : 0)) G.in_edtertool = 3;

				//Terrain Color
				if (gui_colorbox(G.in_col[0], G.in_col[1], G.in_col[2], 5, 500, 90, 32, se(124))) {
					G.in_slider[0] = Int(f32(G.in_col[0] / f32(2.55)));
					G.in_slider[1] = Int(f32(G.in_col[1] / f32(2.55)));
					G.in_slider[2] = Int(f32(G.in_col[2] / f32(2.55)));
					if (await gui_win_color()) {
						G.in_col[0] = G.in_win_color[0];
						G.in_col[1] = G.in_win_color[1];
						G.in_col[2] = G.in_win_color[2];
					}
				}

				//Terrain Coloring Mode
				if (G.in_edterbtool === 0) {
					if (gui_ibutton(100, 500, Cicon_plotbrush, se(199))) {
						G.in_edterbtool = 1;
					}
				} else {
					if (gui_ibutton(100, 500, Cicon_linebrush, se(200))) {
						G.in_edterbtool = 0;
					}
				}
			}

			//Transform
			if (G.in_pe === G.ter) {
				//Calc
				x = Int(f32(f32(G.in_px + idivConst(G.ter_size, 2) * Cworld_size) / Cworld_size));
				z = Int(f32(f32(G.in_pz + idivConst(G.ter_size, 2) * Cworld_size) / Cworld_size));
				//Brush 3D Visualization
				//in_edbrushangle#=(in_edbrushangle#+5.*f) Mod 360
				//visx#=in_px#+(Sin(in_edbrushangle#)*(Cworld_size*(in_edbrush+1)))
				//visz#=in_pz#+(Cos(in_edbrushangle#)*(Cworld_size*(in_edbrush+1)))
				//visy#=TerrainY(ter,visx#,0,visz#)
				//p_add(visx#,visy#,visz#,Cp_risingflare,30,0.5)
				//EntityColor TCp\h,0,255,0
				//EntityOrder TCp\h,-1
				//Brush 2D Visualization
				Color(0, Int(fabs(f32(255 * Cos(G.in_ca)))), 0);
				for (i = Int(f32(10 * f32(G.in_ca / 360))); i <= 360; i += 10) {
					visx1 = f32(G.in_px + f32(Sin(i) * (Cworld_size * (G.in_edbrush + 1))));
					visz1 = f32(G.in_pz + f32(Cos(i) * (Cworld_size * (G.in_edbrush + 1))));
					visy1 = e_tery(visx1, visz1);
					visx2 = f32(G.in_px + f32(Sin(i + 5) * (Cworld_size * (G.in_edbrush + 1))));
					visz2 = f32(G.in_pz + f32(Cos(i + 5) * (Cworld_size * (G.in_edbrush + 1))));
					visy2 = e_tery(visx2, visz2);
					CameraProject(G.cam, visx1, visy1, visz1);
					lx1 = Int(ProjectedX());
					if (lx1 > 210 || G.in_editor_sidebar === 0) {
						ly1 = Int(ProjectedY());
						CameraProject(G.cam, visx2, visy2, visz2);
						lx2 = Int(ProjectedX());
						if (lx2 > 210 || G.in_editor_sidebar === 0) {
							ly2 = Int(ProjectedY());
							Line(lx1, ly1, lx2, ly2);
						}
					}
				}

				//2D Paint Brush Visualization
				pbvf = idiv(Cworld_size * G.ter_size, TextureHeight(G.ter_tex_color));
				editor_range(G.in_px, G.in_py, G.in_pz, G.in_edbrush * pbvf);

				//Action HEIGHT
				if (G.in_mzs !== 0) {
					switch (G.in_edtertool) {
						case 0:
							e_terraintrans(x, z, f32(f32(0.01) * G.in_mzs), G.in_edbrush + 1);
							break;
						case 1:
							e_terrainflatten(x, z, G.in_edbrush + 1);
							break;
						case 2:
							e_terrainsmoothp(x, z, G.in_edbrush + 1);
							break;
						case 3:
							e_terraindistortp(x, z, f32(f32(0.01) * G.in_mzs), G.in_edbrush + 1);
							break;
					}
				}
				if (KeyDown(27) || KeyDown(78)) {
					if (G.in_t50go) e_terraintrans(x, z, f32(f32(0.01) * G.f), G.in_edbrush + 1);
				}
				if (KeyDown(53) || KeyDown(74)) {
					if (G.in_t50go) e_terraintrans(x, z, f32(f32(-0.01) * G.f), G.in_edbrush + 1);
				}

				//Action Paint
				if (G.in_edterbtool === 0) {
					if (G.in_mhit[1]) {
						editor_paintcm(G.in_px, G.in_pz, G.in_edbrush + 2, G.in_col[0], G.in_col[1], G.in_col[2]);
					}
				} else {
					if (G.in_mdown[1]) {
						editor_paintcm(G.in_px, G.in_pz, G.in_edbrush + 2, G.in_col[0], G.in_col[1], G.in_col[2]);
					}
				}

				//Delete
				if (KeyHit(211)) {
					//Delete Objects
					for (Tobject_ = First(Tobject); Tobject_ !== null; Tobject_ = After(Tobject, Tobject_)) {
						if (dist(G.in_px, G.in_pz, EntityX(Tobject_.h), EntityZ(Tobject_.h)) < Cworld_size * (G.in_edbrush + 1)) {
							free_object(Tobject_.id);
						}
					}
					//Delete Units
					for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
						if (dist(G.in_px, G.in_pz, EntityX(Tunit_.h), EntityZ(Tunit_.h)) < Cworld_size * (G.in_edbrush + 1)) {
							free_unit(Tunit_.id);
						}
					}
					//Delete Items
					for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
						if (Titem_.parent_class === 0) {
							if (dist(G.in_px, G.in_pz, EntityX(Titem_.h), EntityZ(Titem_.h)) < Cworld_size * (G.in_edbrush + 1)) {
								free_item(Titem_.id);
							}
						}
					}
					//Delete Infos
					for (Tinfo_ = First(Tinfo); Tinfo_ !== null; Tinfo_ = After(Tinfo, Tinfo_)) {
						if (dist(G.in_px, G.in_pz, EntityX(Tinfo_.h), EntityZ(Tinfo_.h)) < Cworld_size * (G.in_edbrush + 1)) {
							free_info(Tinfo_.id);
						}
					}
				}
			}
			break;

		//### Object Menu
		case 1:
			if (G.object_count_e === 0) RuntimeError('No editor objects defined!');

			//Group Selection
			if (gui_groupsel(5, 190, Cclass_object)) {
				//List
				x = 0;
				y = 0;
				j = 0;
				editor_list(Cclass_object, G.ed_groupg[Cclass_object]);
				for (Tgroupl_ = First(Tgroupl); Tgroupl_ !== null; Tgroupl_ = After(Tgroupl, Tgroupl_)) {
					i = Tgroupl_.id;
					if (G.in_object_sel === 0) G.in_object_sel = i;
					j = j + 1;
					if (j > G.in_object_scr) {
						if (G.in_editor_sidebar === 1) {
							DrawBlock(G.gfx_if_itemback, 5 + x, 223 + y);
							if (gui_iconbox(5 + x, 223 + y, Dobject_iconh(i), Dobject_name(i) + ' (' + Str(i) + ')', i === G.in_object_sel ? 1 : 0)) {
								//p_pixelizeeat(5+x,223+y,Dobject_iconh(i))
								G.in_object_sel = i;
								editor_setdummy(Cclass_object, i);
								G.in_frapdown = 0;
								G.in_fraph = null;
							}
						}
						x = x + 45;
						if (x >= 180) {
							x = 0;
							y = y + 45;
							if (y >= 315) break;
						}
					}
				}

				if (G.in_editor_sidebar === 1) {
					//Scroll
					if (gui_ibutton(5 + 37 + 37 + 37 + 37, 186, Cicon_up, sm(29), G.in_object_scr > 0 ? 1 : 0)) {
						G.in_object_scr = G.in_object_scr - 4;
						if (G.in_object_scr < 0) G.in_object_scr = 0;
					}
					DrawBlock(G.gfx_scrollspace, 194, 223);
					G.in_object_scr = gui_scrollbar(158 + 16, 228, 528 - 228, Int(Ceil(f32(G.ed_current_c / 4))), idivConst(G.in_object_scr, 4), 7) * 4;
					if (gui_ibutton(5 + 37 + 37 + 37 + 37, 538, Cicon_down, sm(30), G.tmp_slideend)) {
						G.in_object_scr = G.in_object_scr + 4;
					}

					//Random Rotation
					if (gui_ibutton(5, 538, Cicon_update, se(28), 1, G.in_edrandrot)) {
						G.in_edrandrot = 1 - G.in_edrandrot;
					}

					//Setscript
					if (gui_ibutton(5 + 37, 538, Cicon_script, se(226))) {
						gui_tb_loadstring(G.ed_setscript, SEP_LINE);
						G.in_input[3] = '-1';
						editor_setmenu(Cmenu_ed_scripts);
					}
				}
			}

			//Normal
			if (G.in_fraph === null) {
				//Set/Select
				if ((G.in_mhit[1] & (G.m_menu === 0 ? 1 : 0)) !== 0) {
					shift = KeyDown(42) + KeyDown(54);
					if (G.in_pe === G.ter || shift > 0) {
						serialpeak_object();
						if (shift) {
							if (ha_getclass(G.in_pe, 0)) {
								if (parent_pos(G.tmp_class, G.tmp_id)) {
									set_object(-1, G.in_object_sel, G.tmp_x, G.tmp_z, G.in_edrot);
									if (EntityY(G.TCobject!.h) !== G.tmp_y) {
										ha_setpos(G.TCobject!.h, Cclass_object, G.TCobject!.id, Str(G.tmp_x, 'float'), Str(G.tmp_y, 'float'), Str(G.tmp_z, 'float'));
									}
								}
							} else {
								set_object(-1, G.in_object_sel, G.in_px, G.in_pz, G.in_edrot);
							}
						} else {
							set_object(-1, G.in_object_sel, G.in_px, G.in_pz, G.in_edrot);
						}
						G.in_turnh = G.TCobject!.h;
						if (G.in_edrandrot) G.in_edrot = f32(Rand(15) * 22.5);
						editor_setfx(G.in_turnh);
						parse_editorsetscript(Cclass_object, G.TCobject!.id);
					} else {
						x = get_object(G.in_pe);
						if (x > -1) {
							editor_setmenu(Cmenu_ed_objects, x);
						}
					}
				}

				//Draw Info Text
				if (G.in_pe !== G.ter && G.in_turnh === null) {
					if (get_object(G.in_pe) > -1) draw_object();
				}
				KeyHit(211);
				KeyHit(57);

				//FRAP
			} else {
				//Run FRAP Function or disable FRAP
				x = get_object(G.in_fraph);
				if (x > -1) {
					frap_object();
				} else {
					G.in_fraph = null;
				}
			}
			break;

		//### Unit Menu
		case 2:
			if (G.unit_count_e === 0) RuntimeError('No editor units defined!');

			//Group Selection
			if (gui_groupsel(5, 190, Cclass_unit) === 1) {
				//List
				x = 0;
				y = 0;
				j = 0;
				editor_list(Cclass_unit, G.ed_groupg[Cclass_unit]);
				for (Tgroupl_ = First(Tgroupl); Tgroupl_ !== null; Tgroupl_ = After(Tgroupl, Tgroupl_)) {
					i = Tgroupl_.id;
					if (G.in_unit_sel === 0) G.in_unit_sel = i;
					j = j + 1;
					if (j > G.in_unit_scr) {
						if (G.in_editor_sidebar === 1) {
							DrawBlock(G.gfx_if_itemback, 5 + x, 223 + y);
							if (gui_iconbox(5 + x, 223 + y, Dunit_iconh(i), Dunit_name(i) + ' (' + Str(i) + ')', i === G.in_unit_sel ? 1 : 0)) {
								//p_pixelizeeat(5+x,223+y,Dunit_iconh(i))
								G.in_unit_sel = i;
								editor_setdummy(Cclass_unit, i);
								G.in_frapdown = 0;
								G.in_fraph = null;
							}
						}
						x = x + 45;
						if (x >= 180) {
							x = 0;
							y = y + 45;
							if (y >= 315) break;
						}
					}
				}

				if (G.in_editor_sidebar === 1) {
					//Scroll
					if (gui_ibutton(5 + 37 + 37 + 37 + 37, 186, Cicon_up, sm(29), G.in_unit_scr > 0 ? 1 : 0)) {
						G.in_unit_scr = G.in_unit_scr - 4;
						if (G.in_unit_scr < 0) G.in_unit_scr = 0;
					}
					DrawBlock(G.gfx_scrollspace, 194, 223);
					G.in_unit_scr = gui_scrollbar(158 + 16, 228, 528 - 228, idivConst(G.ed_current_c, 4), idivConst(G.in_unit_scr, 4), 7) * 4;
					if (gui_ibutton(5 + 37 + 37 + 37 + 37, 538, Cicon_down, sm(30), G.tmp_slideend)) {
						G.in_unit_scr = G.in_unit_scr + 4;
					}

					//Random Rotation
					if (gui_ibutton(5, 538, Cicon_update, se(28), 1, G.in_edrandrot)) {
						G.in_edrandrot = 1 - G.in_edrandrot;
					}

					//Setscript
					if (gui_ibutton(5 + 37, 538, Cicon_script, se(226))) {
						gui_tb_loadstring(G.ed_setscript, SEP_LINE);
						G.in_input[3] = '-1';
						editor_setmenu(Cmenu_ed_scripts);
					}
				}
			}

			//Normal
			if (G.in_fraph === null) {
				//Set/Select
				if ((G.in_mhit[1] & (G.m_menu === 0 ? 1 : 0)) !== 0) {
					shift = KeyDown(42) + KeyDown(54);
					if (G.in_pe === G.ter || shift > 0) {
						serialpeak_unit();
						set_unit(-1, G.in_unit_sel, G.in_px, G.in_pz);
						RotateEntity(G.TCunit!.h, 0, G.in_edrot, 0);
						G.in_turnh = G.TCunit!.h;
						if (G.in_edrandrot) G.in_edrot = f32(Rand(15) * 22.5);
						editor_setfx(G.in_turnh);
						parse_editorsetscript(Cclass_unit, G.TCunit!.id);
					} else {
						x = get_unit(G.in_pe);
						if (x > -1) {
							editor_setmenu(Cmenu_ed_units, x);
						}
					}
				}

				//Draw Info Text
				if (G.in_pe !== G.ter && G.in_turnh === null) {
					if (get_unit(G.in_pe) > -1) draw_unit();
				}
				KeyHit(211);
				KeyHit(57);

				//FRAP
			} else {
				//Run FRAP Function or disable FRAP
				x = get_unit(G.in_fraph, 1);
				if (x > -1) {
					frap_unit();
				} else {
					G.in_fraph = null;
				}
			}
			break;

		//### Item Menu
		case 3:
			if (G.item_count_e === 0) RuntimeError('No editor items defined!');

			//Group Selection
			if (gui_groupsel(5, 190, Cclass_item) === 1) {
				//List
				x = 0;
				y = 0;
				j = 0;
				editor_list(Cclass_item, G.ed_groupg[Cclass_item]);
				for (Tgroupl_ = First(Tgroupl); Tgroupl_ !== null; Tgroupl_ = After(Tgroupl, Tgroupl_)) {
					i = Tgroupl_.id;
					if (G.in_item_sel === 0) G.in_item_sel = i;
					j = j + 1;
					if (j > G.in_item_scr) {
						if (G.in_editor_sidebar === 1) {
							DrawBlock(G.gfx_if_itemback, 5 + x, 223 + y);
							if (gui_iconbox(5 + x, 223 + y, Ditem_iconh(i), Ditem_name(i) + ' (' + Str(i) + ')', i === G.in_item_sel ? 1 : 0)) {
								//p_pixelizeeat(5+x,223+y,Ditem_iconh(i))
								G.in_item_sel = i;
								editor_setdummy(Cclass_item, i);
								G.in_frapdown = 0;
								G.in_fraph = null;
							}
						}
						x = x + 45;
						if (x >= 180) {
							x = 0;
							y = y + 45;
							if (y >= 315) break;
						}
					}
				}

				if (G.in_editor_sidebar === 1) {
					//Scroll
					if (gui_ibutton(5 + 37 + 37 + 37 + 37, 186, Cicon_up, sm(29), G.in_item_scr > 0 ? 1 : 0)) {
						G.in_item_scr = G.in_item_scr - 4;
						if (G.in_item_scr < 0) G.in_item_scr = 0;
					}
					DrawBlock(G.gfx_scrollspace, 194, 223);
					G.in_item_scr = gui_scrollbar(158 + 16, 228, 528 - 228, idivConst(G.ed_current_c, 4), idivConst(G.in_item_scr, 4), 7) * 4;
					if (gui_ibutton(5 + 37 + 37 + 37 + 37, 538, Cicon_down, sm(30), G.tmp_slideend)) {
						G.in_item_scr = G.in_item_scr + 4;
					}

					//Random Rotation
					if (gui_ibutton(5, 538, Cicon_update, se(28), 1, G.in_edrandrot)) {
						G.in_edrandrot = 1 - G.in_edrandrot;
					}

					//Setscript
					if (gui_ibutton(5 + 37, 538, Cicon_script, se(226))) {
						gui_tb_loadstring(G.ed_setscript, SEP_LINE);
						G.in_input[3] = '-1';
						editor_setmenu(Cmenu_ed_scripts);
					}
				}
			}

			//Normal
			if (G.in_fraph === null) {
				//Set/Select
				if ((G.in_mhit[1] & (G.m_menu === 0 ? 1 : 0)) !== 0) {
					shift = KeyDown(42) + KeyDown(54);
					if (G.in_pe === G.ter || shift > 0) {
						serialpeak_item();
						set_item(-1, G.in_item_sel, G.in_px, G.in_py, G.in_pz);
						RotateEntity(G.TCitem!.h, 0, G.in_edrot, 0);
						G.in_turnh = G.TCitem!.h;
						if (G.in_edrandrot) G.in_edrot = f32(Rand(15) * 22.5);
						editor_setfx(G.in_turnh);
						parse_editorsetscript(Cclass_item, G.TCitem!.id);
					} else {
						x = get_item(G.in_pe);
						if (x > -1) {
							editor_setmenu(Cmenu_ed_items, x);
						}
					}
				}

				//Draw Info Text
				if (G.in_pe !== G.ter && G.in_turnh === null) {
					if (get_item(G.in_pe) > -1) draw_item();
				}
				KeyHit(211);
				KeyHit(57);

				//FRAP
			} else {
				//Run FRAP Function or disable FRAP
				x = get_item(G.in_fraph);
				if (x > -1) {
					frap_item();
				} else {
					G.in_fraph = null;
				}
			}
			break;

		//### Info Menu
		case 4:
			//Group Selection
			if (gui_groupsel(5, 190, Cclass_info) === 1) {
				//List
				x = 0;
				y = 0;
				j = 0;
				editor_list(Cclass_info, G.ed_groupg[Cclass_info]);
				for (Tgroupl_ = First(Tgroupl); Tgroupl_ !== null; Tgroupl_ = After(Tgroupl, Tgroupl_)) {
					i = Tgroupl_.id;
					if (G.in_info_sel === 0) G.in_info_sel = i;
					j = j + 1;
					if (j > G.in_info_scr) {
						if (G.in_editor_sidebar === 1) {
							DrawBlock(G.gfx_if_itemback, 5 + x, 223 + y);
							if (gui_iconbox(5 + x, 223 + y, 0, Dinfo_name(i) + ' (' + Str(i) + ')', i === G.in_info_sel ? 1 : 0)) {
								G.in_info_sel = i;
								editor_setdummy(Cclass_info, i);
								G.in_frapdown = 0;
								G.in_fraph = null;
							}
							DrawImage(G.gfx_icons, 5 + x + 4, 223 + y + 4, Dinfo_frame(i));
						}
						x = x + 45;
						if (x >= 180) {
							x = 0;
							y = y + 45;
							if (y >= 315) break;
						}
					}
				}

				if (G.in_editor_sidebar === 1) {
					//Scroll
					if (gui_ibutton(5 + 37 + 37 + 37 + 37, 186, Cicon_up, sm(29), G.in_info_scr > 0 ? 1 : 0)) {
						G.in_info_scr = G.in_info_scr - 4;
						if (G.in_info_scr < 0) G.in_info_scr = 0;
					}
					DrawBlock(G.gfx_scrollspace, 194, 223);
					G.in_info_scr = gui_scrollbar(158 + 16, 228, 528 - 228, idivConst(G.ed_current_c, 4), idivConst(G.in_info_scr, 4), 7) * 4;
					if (gui_ibutton(5 + 37 + 37 + 37 + 37, 538, Cicon_down, sm(30), G.tmp_slideend)) {
						G.in_info_scr = G.in_info_scr + 4;
					}

					//Set at Cam
					if (gui_ibutton(5, 538, Cicon_cam, se(29), 1)) {
						serialpeak_info();
						set_info(-1, G.in_info_sel, EntityX(G.cam), EntityY(G.cam), EntityZ(G.cam));
						RotateEntity(G.TCinfo!.h, EntityPitch(G.cam), EntityYaw(G.cam), 0);
						parse_editorsetscript(Cclass_info, G.TCinfo!.id);
					}

					//Setscript
					if (gui_ibutton(5 + 37, 538, Cicon_script, se(226))) {
						gui_tb_loadstring(G.ed_setscript, SEP_LINE);
						G.in_input[3] = '-1';
						editor_setmenu(Cmenu_ed_scripts);
					}
				}
			}

			//Normal
			if (G.in_fraph === null) {
				//Set/Select
				if ((G.in_mhit[1] & (G.m_menu === 0 ? 1 : 0)) !== 0) {
					shift = KeyDown(42) + KeyDown(54);
					if (G.in_pe === G.ter || shift > 0) {
						serialpeak_info();
						set_info(-1, G.in_info_sel, G.in_px, G.in_py, G.in_pz);
						G.in_turnh = G.TCinfo!.h;
						editor_setfx(G.in_turnh);
						parse_editorsetscript(Cclass_info, G.TCinfo!.id);
					} else {
						x = get_info(G.in_pe);
						if (x > -1) {
							editor_setmenu(Cmenu_ed_infos, x);
						}
					}
				}

				//Info
				if (G.in_pe !== G.ter && G.in_turnh === null) {
					if (get_info(G.in_pe) > -1) {
						G.in_edoverinfo = ss(se(197), Dinfo_name(G.TCinfo!.typ));
						if (KeyHit(57)) G.in_fraph = G.TCinfo!.h;
						if (KeyHit(211)) free_info(G.TCinfo!.id);
					}
				}
				KeyHit(211);
				KeyHit(57);

				//FRAP
			} else {
				//Run FRAP Function or disable FRAP
				x = get_info(G.in_fraph);
				if (x > -1) {
					frap_info();
				} else {
					G.in_fraph = null;
				}
			}
			break;

		//### State Menu
		case 5:
			//List
			x = 0;
			y = 0;
			j = 0;
			for (i = 0; i <= Cstate_count; i++) {
				if (Dstate_name(i) !== '') {
					if (G.in_state_sel === 0) G.in_state_sel = i;
					j = j + 1;
					if (j > G.in_state_scr) {
						if (G.in_editor_sidebar === 1) {
							DrawBlock(G.gfx_if_itemback, 5 + x, 223 + y);
							if (gui_iconbox(5 + x, 223 + y, 0, Dstate_name(i) + ' (' + Str(i) + ')', i === G.in_state_sel ? 1 : 0)) {
								G.in_state_sel = i;
							}
							DrawImage(G.gfx_states, 5 + x + 10, 223 + y + 10, Dstate_frame(i));
							DrawImage(G.gfx_state, 5 + x + 10, 223 + y + 10, G.in_statefxf);
						}
						x = x + 45;
						if (x >= 180) {
							x = 0;
							y = y + 45;
							if (y >= 315) break;
						}
					}
				}
			}

			if (G.in_editor_sidebar === 1) {
				//Scroll
				if (gui_ibutton(5 + 37 + 37 + 37 + 37, 186, Cicon_up, sm(29), G.in_state_scr > 0 ? 1 : 0)) {
					G.in_state_scr = G.in_state_scr - 4;
					if (G.in_state_scr < 0) G.in_state_scr = 0;
				}
				if (gui_ibutton(5 + 37 + 37 + 37 + 37, 538, Cicon_down, sm(30), y >= 315 ? 1 : 0)) {
					G.in_state_scr = G.in_state_scr + 4;
				}
				DrawBlock(G.gfx_scrollspace, 194, 223);
				if (G.m_menu === 0) {
					G.in_state_scr = gui_scrollbar(158 + 16, 228, 528 - 228, idivConst(G.state_count, 4), idivConst(G.in_state_scr, 4), 7) * 4;
				}
			}
			break;
	}

	//Sidebar Show/Hide
	if (G.in_editor_sidebar === 1) {
		//Hide Sidebar
		//If gui_ibutton(5+73,set_scry-37,Cicon_dec,se$(217)) Then
		if (gui_txtb(5, G.set_scry - 18, se(217))) {
			G.in_editor_sidebar = 0;
		}
	} else {
		//Show Sidebar
		if (gui_ibutton(5, G.set_scry - 37, Cicon_inc, se(218))) {
			G.in_editor_sidebar = 1;
		}
	}

	//Update Dummy
	if (G.m_menu === 0) {
		if (G.in_opt[0] > 0 && G.in_opt[0] < 5) {
			if (G.in_editor_dummy !== null) {
				RotateEntity(G.in_editor_dummy, 0, G.in_edrot, 0);
				if (G.in_mzs !== 0) {
					if (G.in_mzs > 0) {
						G.in_edrot = fmod(f32(G.in_edrot + 22.5), 360);
					} else {
						G.in_edrot = fmod(f32(G.in_edrot - 22.5), 360);
					}
				}
				//If in_t100go Then
				if (G.in_pe === G.ter && G.in_turnh === null) {
					ShowEntity(G.in_editor_dummy);
					PositionEntity(G.in_editor_dummy, G.in_px, e_tery(G.in_px, G.in_pz), G.in_pz);
					//Special Positioning / Hide in FRAP Mode
					//Objects
					if (G.in_opt[0] === 1) {
						switch (Dobject_align(G.in_object_sel)) {
							case 0: //-
								break;
							case 1:
								if (EntityY(G.in_editor_dummy) < 1) PositionEntity(G.in_editor_dummy, G.in_px, 1, G.in_pz);
								break;
							case 2:
								RotateEntity(G.in_editor_dummy, groundpitch(G.in_editor_dummy, 60), G.in_edrot, 0);
								break;
						}
						if (G.in_fraph !== null) HideEntity(G.in_editor_dummy);
						//Units
					} else if (G.in_opt[0] === 2) {
						switch (Dunit_align(G.in_unit_sel)) {
							case 0: //-
								break;
							case 1:
								if (EntityY(G.in_editor_dummy) < 1) PositionEntity(G.in_editor_dummy, G.in_px, 1, G.in_pz);
								break;
						}
						if (G.in_fraph !== null) HideEntity(G.in_editor_dummy);
						//Items
					} else if (G.in_opt[0] === 3) {
						if (G.in_fraph !== null) HideEntity(G.in_editor_dummy);
						//Infos
					} else if (G.in_opt[0] === 4) {
						if (G.in_fraph !== null) HideEntity(G.in_editor_dummy);
					}
				} else {
					HideEntity(G.in_editor_dummy);
				}
				//EndIf
			}
		}
	}

	//Cam Infos
	if (G.m_menu === 0) {
		//Over Info
		if (G.in_edoverinfo !== '') {
			bmpf_txt(212, G.set_scry - 17 - 12, G.in_edoverinfo, Cbmpf_tiny);
		}

		//Cam Info
		bmpf_txt(
			212,
			G.set_scry - 17,
			'Camera Position (X: ' +
				Str(Int(EntityX(G.cam))) +
				' | Y: ' +
				Str(Int(EntityY(G.cam))) +
				' | Z: ' +
				Str(Int(EntityZ(G.cam))) +
				' ) Angle (Yaw: ' +
				Str(Int(EntityYaw(G.cam))) +
				' )',
			Cbmpf_tiny
		);
	}

	//### Menu (WINDOW)
	await editor_menus();

	//Particles
	p_update();

	//Endinput
	endinput();

	//### Hotkeys

	//F12 - Checkmap
	if (KeyHit(88)) {
		await editor_testmap();
	}
}
