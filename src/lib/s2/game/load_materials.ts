/**
 * includes/load_materials.bb: material_fx and material_stepsfx, ported line
 * by line. The material tables (top-level code of the file) and get_material
 * are load_materials.ported.ts / defs/constants.ts.
 */
import { EntityColor } from '../bb3d';
import { Int, Rand, Rnd, f32 } from '../blitz';
import {
	Cmat_dirt,
	Cmat_dust,
	Cmat_flesh,
	Cmat_fruit,
	Cmat_glass,
	Cmat_lava,
	Cmat_leaf,
	Cmat_metal,
	Cmat_none,
	Cmat_stone,
	Cmat_water,
	Cmat_wood,
	Cmenu_if_movie,
	Cp_smoke,
	Cp_spark,
	Cp_splatter,
	Cp_wood
} from './consts';
import { p_add } from './particles';
import { sfx as sfx_, sfx_3d } from './sfx';
import { G } from './state';

export * from './load_materials.ported';

//### Spawn Material FX
/** Function material_fx(x#,y#,z#,material,sfx=1) */
export function material_fx(x: number, y: number, z: number, material: number, sfx: number = 1): void {
	let i = 0;
	let argx = 0;
	let argy = 0;
	let argz = 0;
	let argsize = 0;
	let arga = 0;
	switch (material) {
		//None
		case Cmat_none:
			if (G.set_effects > 0) {
				// exe: arguments evaluated size, alpha, z, y, x
				argsize = Rnd(5, 10);
				arga = Rnd(0.3, 1.5);
				argz = f32(z + Rnd(-5, 5));
				argy = f32(y + Rnd(-3, 3));
				argx = f32(x + Rnd(-5, 5));
				p_add(argx, argy, argz, Cp_smoke, argsize, arga);
			}
			break;
		//Wood
		case Cmat_wood:
			if (G.set_effects > 0) {
				// exe: arguments evaluated size, alpha, z, y, x
				argsize = Rnd(3, 5);
				arga = Rnd(0.3, 0.7);
				argz = f32(z + Rnd(-3, 3));
				argy = f32(y + Rnd(-3, 3));
				argx = f32(x + Rnd(-3, 3));
				p_add(argx, argy, argz, Cp_smoke, argsize, arga);
				EntityColor(G.TCp!.h, Rand(65, 100), 50, 0);
				for (i = 1; i <= G.set_effects * 3; i++) {
					p_add(x, y, z, Cp_wood, Rand(1, 3), 3);
				}
			}
			// sfx_3d(x,y,z,sound) has Int parameters: the Float position is rounded
			if (sfx) sfx_3d(Int(x), Int(y), Int(z), G.sfx_mat_wood[Rand(0, 1)]);
			break;
		//Stone
		case Cmat_stone:
			if (G.set_effects > 0) {
				// exe: arguments evaluated size, alpha, z, y, x
				argsize = Rnd(3, 5);
				arga = Rnd(0.3, 0.7);
				argz = f32(z + Rnd(-3, 3));
				argy = f32(y + Rnd(-3, 3));
				argx = f32(x + Rnd(-3, 3));
				p_add(argx, argy, argz, Cp_smoke, argsize, arga);
				if (Rand(2) === 1) p_add(x, y, z, Cp_spark, Rand(1, 5), 3);
			}
			if (sfx) sfx_3d(Int(x), Int(y), Int(z), G.sfx_mat_stone[0]);
			break;
		//Dirt
		case Cmat_dirt:
			break;
		//Dust
		case Cmat_dust:
			if (sfx) sfx_3d(Int(x), Int(y), Int(z), G.sfx_mat_dust[0]);
			break;
		//Leaf
		case Cmat_leaf:
			if (G.set_effects > 0) {
				for (i = 1; i <= G.set_effects * 3; i++) {
					//p_add(x#+Rnd(-5,5),y#+Rnd(-3,3),z#+Rnd(-5,5),Cp_subsplatter,Rnd(1,5),Rnd(0.9,1.5))
					//EntityColor TCp\h,0,Rand(100,255),0
				}
			}
			if (sfx) sfx_3d(Int(x), Int(y), Int(z), G.sfx_mat_leaf[Rand(0, 3)]);
			break;
		//Metal
		case Cmat_metal:
			if (G.set_effects > 0) {
				if (Rand(2) === 1) p_add(x, y, z, Cp_spark, Rand(1, 5), 3);
			}
			if (sfx) sfx_3d(Int(x), Int(y), Int(z), G.sfx_mat_metal[0]);
			break;
		//Flesh
		case Cmat_flesh:
			if (G.set_effects > 0) {
				if (G.set_gore === 1) {
					for (i = 1; i <= G.set_effects * 3; i++) {
						// exe: arguments evaluated size, alpha, z, y, x
						argsize = Rnd(1, 5);
						arga = Rnd(0.9, 1.5);
						argz = f32(z + Rnd(-5, 5));
						argy = f32(y + Rnd(-3, 3));
						argx = f32(x + Rnd(-5, 5));
						p_add(argx, argy, argz, Cp_splatter, argsize, arga);
					}
				}
			}
			if (sfx) sfx_3d(Int(x), Int(y), Int(z), G.sfx_mat_flesh[Rand(0, 4)]);
			break;
		//Water
		case Cmat_water:
			if (G.set_effects > 0) {
				for (i = 1; i <= G.set_effects * 3; i++) {
					p_add(x, y, z, Cp_spark, Rand(1, 2), 3);
					EntityColor(G.TCp!.h, Rand(230, 240), Rand(230, 240), 255);
				}
			}
			if (sfx) {
				switch (Rand(0, 2)) {
					case 0:
						sfx_3d(Int(x), Int(y), Int(z), G.sfx_startdive);
						break;
					case 1:
						sfx_3d(Int(x), Int(y), Int(z), G.sfx_splash);
						break;
					case 2:
						sfx_3d(Int(x), Int(y), Int(z), G.sfx_splash2);
						break;
				}
			}
			break;
		//Lava
		case Cmat_lava:
			if (G.set_effects > 0) {
				for (i = 1; i <= G.set_effects * 3; i++) {
					p_add(x, y, z, Cp_spark, Rand(1, 5), 3);
				}
			}
			if (sfx) sfx_3d(Int(x), Int(y), Int(z), G.sfx_explode[4]);
			break;
		//Fruit
		case Cmat_fruit:
			if (sfx) sfx_3d(Int(x), Int(y), Int(z), G.sfx_mat_fruit[Rand(0, 1)]);
			break;
		//Glass
		case Cmat_glass:
			if (sfx) sfx_3d(Int(x), Int(y), Int(z), G.sfx_mat_glass[Rand(0, 1)]);
			break;
	}
}

//### Material Step SFX
/** Function material_stepsfx(material) */
export function material_stepsfx(material: number): void {
	//No Material Step FX in Sequences
	if (G.m_menu !== Cmenu_if_movie) {
		switch (material) {
			//Wood
			case Cmat_wood:
				sfx_(G.sfx_woodstep[Rand(0, 1)]);
				break;
			//Stone
			case Cmat_stone:
				sfx_(G.sfx_stonestep[Rand(0, 1)]);
				break;
			//Water
			case Cmat_water:
				sfx_(G.sfx_waterstep);
				break;
			//Default
			default:
				sfx_(G.sfx_step[Rand(0, 3)]);
		}
	}
}
