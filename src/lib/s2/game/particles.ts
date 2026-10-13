/**
 * includes/particles.bb: the particle system (3D sprites/meshes and 2D screen
 * particles), line-by-line port.
 *
 * p_add() leaves the new particle in G.TCp; callers colour/blend it through
 * `TCp\h` right after the call. Particle types >= 101 take over the entity
 * in G.tmp_ph instead of creating a sprite.
 */
import {
	AddTriangle,
	AddVertex,
	CopyEntity,
	CountCollisions,
	CountSurfaces,
	CountTriangles,
	CountVertices,
	CreateMesh,
	CreatePivot,
	CreateSphere,
	CreateSprite,
	CreateSurface,
	EntityAlpha,
	EntityAutoFade,
	EntityBlend,
	EntityColor,
	EntityFX,
	EntityOrder,
	EntityParent,
	EntityPitch,
	EntityRadius,
	EntityRoll,
	EntityShininess,
	EntityTexture,
	EntityType,
	EntityX,
	EntityY,
	EntityYaw,
	EntityZ,
	FreeEntity,
	GetSurface,
	MoveEntity,
	PositionEntity,
	RotateEntity,
	RotateSprite,
	ScaleEntity,
	ScaleSprite,
	SpriteViewMode,
	TranslateEntity,
	TriangleVertex,
	TurnEntity,
	UpdateNormals,
	VertexNX,
	VertexNY,
	VertexNZ,
	type Handle,
	type Surface
} from '../bb3d';
import { ATan2, Cos, Int, MilliSecs, Rand, Rnd, Sin, Str, f32, fabs, fmod, idiv, idivConst, imod, imul } from '../blitz';
import { BackBuffer, Color, DrawImage, ImageBuffer, ImageHeight, ImageWidth, LockBuffer, ReadPixelFast, Rect, SetBuffer, UnlockBuffer, WritePixelFast, type ImageHandle } from '../gfx2d';
import { con_add } from './console';
import {
	Cclass_unit,
	Cmenu_if_movie,
	Cp2d_blackrect,
	Cp2d_cdot,
	Cp2d_dot,
	Cp2d_item,
	Cp_attack,
	Cp_bubbles,
	Cp_debug,
	Cp_explode,
	Cp_fade,
	Cp_fadeout,
	Cp_fall,
	Cp_firespark,
	Cp_flames,
	Cp_flash,
	Cp_hover,
	Cp_impact,
	Cp_puddle,
	Cp_rain,
	Cp_resfade,
	Cp_risingflare,
	Cp_rwave,
	Cp_seqfade,
	Cp_shockwave,
	Cp_smoke,
	Cp_snow,
	Cp_spark,
	Cp_spawn,
	Cp_splash,
	Cp_splatter,
	Cp_starflare,
	Cp_stuck,
	Cp_subsplatter,
	Cp_wave,
	Cp_wood,
	Csection_menu,
	Cworld_unitcol
} from './consts';
import { Ditem_alpha, Ditem_autofade, Ditem_blend, Ditem_color, Ditem_fx, Ditem_iconh, Ditem_modelh, Ditem_shininess, Ditem_size } from './defs_arrays';
import { e_tery } from './e_environment';
import { meshline } from './functions';
import { con_unit } from './handle_units';
import { sfx_3d } from './sfx';
import { G } from './state';
import { After, Delete, First, New, Titem, Tp } from './types';

//############################################ PARTICLES

//### Particle Add (3D)
/** Function p_add(x#,y#,z#,typ,size#=1.,a#=1.) */
export function p_add(x: number, y: number, z: number, typ: number, size: number = 1, a: number = 1): void {
	let Tp_: Tp | null = null;
	let p: Handle = null;
	let c = 0;
	let r = 0;
	let m: Handle = null;
	let surf: Surface | null = null;
	let tx = 0;
	let tz = 0;
	let v1 = 0;
	let v2 = 0;
	let v3 = 0;
	let v4 = 0;
	let argpitch = 0;
	let argyaw = 0;
	let argroll = 0;
	let argx = 0;
	let argy = 0;
	let argz = 0;
	let argr = 0;
	let argg = 0;
	let argb = 0;

	Tp_ = New(Tp);
	if (typ < 101) {
		Tp_.h = CreateSprite();
		PositionEntity(Tp_.h, x, y, z);
	}
	Tp_.typ = typ;
	Tp_.size = f32(size);
	switch (typ) {
		//4 Attack
		case Cp_attack:
			if (x > 0) {
				EntityTexture(Tp_.h, G.gfx_p_attack[0]);
				Tp_.r = 1;
				Tp_.rot = 20; //-70
			} else {
				EntityTexture(Tp_.h, G.gfx_p_attack[1]);
				Tp_.r = 0;
				Tp_.rot = -20; //70
			}
			RotateSprite(Tp_.h, Tp_.rot);
			ScaleSprite(Tp_.h, size, size);
			p = CreatePivot();
			RotateEntity(p, EntityPitch(G.cam), EntityYaw(G.cam), EntityRoll(G.cam));
			PositionEntity(p, EntityX(G.cam), EntityY(G.cam), EntityZ(G.cam));
			MoveEntity(p, 0, 0, 10);
			MoveEntity(p, 0, -7, 0);
			PositionEntity(Tp_.h, EntityX(p), EntityY(p), EntityZ(p));
			FreeEntity(p);
			EntityBlend(Tp_.h, 3);
			EntityAlpha(Tp_.h, a);
			Tp_.a = f32(a);
			EntityOrder(Tp_.h, -5);
			EntityParent(Tp_.h, G.cam);
			break;

		//5 Debug
		case Cp_debug:
			Tp_.a = f32(a);
			break;

		//10 Bubbles
		case Cp_bubbles:
			EntityTexture(Tp_.h, G.gfx_p_bubbles[Rand(0, 1)]);
			ScaleSprite(Tp_.h, size, size);
			EntityBlend(Tp_.h, 3);
			Tp_.fy = Rnd(f32(0.3), 1);
			Tp_.a = f32(a);
			break;

		//11 Roundwave
		case Cp_rwave:
			EntityTexture(Tp_.h, G.gfx_p_roundwave[0]);
			ScaleSprite(Tp_.h, size, size);
			EntityBlend(Tp_.h, 3);
			SpriteViewMode(Tp_.h, 2);
			RotateSprite(Tp_.h, Rand(360));
			Tp_.fy = Rnd(f32(0.05), f32(0.1));
			Tp_.a = f32(a);
			if (G.g_dive === 1) {
				PositionEntity(Tp_.h, x, -1, z);
				RotateEntity(Tp_.h, -90, 0, -90);
			} else {
				PositionEntity(Tp_.h, x, 2, z);
				RotateEntity(Tp_.h, 90, 0, 90);
			}
			break;

		//12 Splash
		case Cp_splash:
			EntityTexture(Tp_.h, G.gfx_p_splash[0]);
			ScaleSprite(Tp_.h, size, size);
			EntityBlend(Tp_.h, 3);
			SpriteViewMode(Tp_.h, 4);
			PositionEntity(Tp_.h, x, f32(y + 1), z);
			EntityAlpha(Tp_.h, a);
			Tp_.x = f32(size);
			Tp_.y = f32(size);
			Tp_.a = f32(a);
			Tp_.fx = f32(size / 15);
			break;

		//15 Wave
		case Cp_wave:
			PositionEntity(Tp_.h, x, 1, z);
			EntityTexture(Tp_.h, G.gfx_p_wave[0]);
			ScaleSprite(Tp_.h, size, size);
			EntityBlend(Tp_.h, 3);
			RotateEntity(Tp_.h, 90, 0, 90);
			SpriteViewMode(Tp_.h, 2);
			RotateSprite(Tp_.h, f32(a - 90));
			Tp_.fy = f32(a + Rnd(-5, 5));
			Tp_.a = Rnd(f32(-0.1), f32(0.01));
			EntityAlpha(Tp_.h, Tp_.a);
			TranslateEntity(Tp_.h, f32(Sin(Tp_.fy) * Rnd(40, 50)), 0, f32(f32(-Cos(Tp_.fy)) * Rnd(40, 50)));
			if (Rand(10) === 1) {
				TranslateEntity(Tp_.h, f32(Sin(Tp_.fy) * Rnd(20, 30)), 0, f32(f32(-Cos(Tp_.fy)) * Rnd(20, 30)));
				if (Rand(3) === 1) {
					TranslateEntity(Tp_.h, f32(Sin(Tp_.fy) * Rnd(20, 30)), 0, f32(f32(-Cos(Tp_.fy)) * Rnd(20, 30)));
				}
			}
			EntityAutoFade(Tp_.h, 1000, 1500);
			Tp_.fadein = Rnd(f32(0.7), 1);
			break;

		//19	Hover
		case Cp_hover:
			switch (Rand(9)) {
				case 0:
				case 1:
				case 2:
				case 3:
					EntityTexture(Tp_.h, G.gfx_p_spark[0]);
					break;
				case 4:
				case 5:
				case 6:
				case 7:
				case 8:
					EntityTexture(Tp_.h, G.gfx_p_splatter[Rand(0, 2)]);
					break;
				case 9:
					EntityTexture(Tp_.h, G.gfx_p_woodfrag[Rand(0, 4)]);
					break;
			}
			ScaleSprite(Tp_.h, size, size);
			EntityBlend(Tp_.h, 3);
			// exe: arguments evaluated g, b, r
			argg = Rand(240, 255);
			argb = Rand(220, 255);
			argr = Rand(200, 255);
			EntityColor(Tp_.h, argr, argg, argb);
			Tp_.a = 0;
			EntityAlpha(Tp_.h, 0);
			Tp_.fadein = Rnd(f32(0.2), f32(0.45));
			Tp_.r = Rnd(-5, 5);
			Tp_.fx = Rnd(f32(-0.5), f32(0.5));
			Tp_.fy = Rnd(f32(-0.5), f32(0.5));
			Tp_.fz = Rnd(f32(-0.5), f32(0.5));
			break;

		//20 Smoke
		case Cp_smoke:
			EntityTexture(Tp_.h, G.gfx_p_smoke[Rand(0, 1)]);
			ScaleSprite(Tp_.h, size, size);
			c = Rand(100, 150);
			EntityColor(Tp_.h, c, c, c);
			Tp_.rot = Rand(360);
			RotateSprite(Tp_.h, Tp_.rot);
			Tp_.fx = Rnd(f32(0.05), f32(0.1));
			Tp_.fy = Rnd(f32(0.15), f32(0.35));
			Tp_.fz = Rnd(f32(-1.5), f32(1.5));
			Tp_.r = f32(0.007);
			Tp_.a = 0;
			Tp_.fadein = f32(a);
			EntityAlpha(Tp_.h, 0);
			break;

		//21 Spark
		case Cp_spark:
			EntityTexture(Tp_.h, G.gfx_p_spark[0]);
			ScaleSprite(Tp_.h, size, size);
			EntityColor(Tp_.h, 255, Rand(50, 255), 0);
			Tp_.rot = Rand(360);
			RotateSprite(Tp_.h, Tp_.rot);
			Tp_.fx = Rnd(-2, 2);
			Tp_.fy = Rnd(-2, 2);
			Tp_.fz = Rnd(-2, 2);
			Tp_.a = f32(a);
			EntityBlend(Tp_.h, 3);
			EntityRadius(Tp_.h, 2);
			EntityType(Tp_.h, Cworld_unitcol);
			break;

		//22 Splatter
		case Cp_splatter:
			EntityTexture(Tp_.h, G.gfx_p_splatter[Rand(0, 2)]);
			ScaleSprite(Tp_.h, size, size);
			EntityColor(Tp_.h, Rand(150, 200), 0, 0);
			Tp_.rot = Rand(360);
			RotateSprite(Tp_.h, Tp_.rot);
			Tp_.fx = Rnd(-2, 2);
			Tp_.fy = Rnd(-2, 2);
			Tp_.fz = Rnd(-2, 2);
			Tp_.a = f32(a);
			break;

		//23 Subplatter
		case Cp_subsplatter:
			EntityTexture(Tp_.h, G.gfx_p_splatter[Rand(0, 2)]);
			ScaleSprite(Tp_.h, size, size);
			EntityColor(Tp_.h, Rand(150, 200), 0, 0);
			RotateSprite(Tp_.h, Rand(360));
			Tp_.a = f32(a);
			break;

		//24 Wood
		case Cp_wood:
			EntityTexture(Tp_.h, G.gfx_p_woodfrag[Rand(0, 4)]);
			ScaleSprite(Tp_.h, size, size);
			EntityColor(Tp_.h, Rand(65, 100), 40, 0);
			Tp_.rot = Rand(360);
			RotateSprite(Tp_.h, Tp_.rot);
			Tp_.fx = Rnd(-2, 2);
			Tp_.fy = Rnd(-2, 1);
			Tp_.fz = Rnd(-2, 2);
			Tp_.a = f32(a);
			EntityRadius(Tp_.h, 2);
			EntityType(Tp_.h, Cworld_unitcol);
			Tp_.fadein = Rnd(-35, 35);
			break;

		//25 Puddle
		case Cp_puddle:
			FreeEntity(Tp_.h);

			r = Rand(360);
			m = CreateMesh();
			PositionEntity(m, x, 0, z);
			surf = CreateSurface(m);

			tx = f32(Sin(imod(r, 360)) * size);
			tz = f32(Cos(imod(r, 360)) * size);
			v1 = AddVertex(surf, tx, f32(e_tery(f32(x + tx), f32(z + tz)) + 1.5), tz, 0, 1);
			tx = f32(Sin(imod(r + 90, 360)) * size);
			tz = f32(Cos(imod(r + 90, 360)) * size);
			v2 = AddVertex(surf, tx, f32(e_tery(f32(x + tx), f32(z + tz)) + 1.5), tz, 0, 0);
			tx = f32(Sin(imod(r + 180, 360)) * size);
			tz = f32(Cos(imod(r + 180, 360)) * size);
			v3 = AddVertex(surf, tx, f32(e_tery(f32(x + tx), f32(z + tz)) + 1.5), tz, 1, 0);
			tx = f32(Sin(imod(r + 270, 360)) * size);
			tz = f32(Cos(imod(r + 270, 360)) * size);
			v4 = AddVertex(surf, tx, f32(e_tery(f32(x + tx), f32(z + tz)) + 1.5), tz, 1, 1);

			AddTriangle(surf, v3, v2, v1);
			AddTriangle(surf, v4, v1, v3);

			UpdateNormals(m);

			Tp_.h = m;
			if (Rand(2) === 1) {
				EntityTexture(Tp_.h, G.gfx_p_puddle[0]);
			} else {
				EntityTexture(Tp_.h, G.gfx_p_splatter[Rand(0, 2)]);
			}
			EntityColor(Tp_.h, Rand(100, 160), 0, 0);
			EntityFX(Tp_.h, 16);
			Tp_.a = f32(a);
			EntityAlpha(Tp_.h, a);
			break;

		//30 Flames
		case Cp_flames:
			// exe: arguments evaluated y, z, x
			argy = Rnd(f32(-1.8), f32(1.8));
			argz = Rnd(f32(-1.8), f32(1.8));
			argx = Rnd(f32(-1.8), f32(1.8));
			TranslateEntity(Tp_.h, argx, argy, argz);
			EntityTexture(Tp_.h, G.gfx_p_flames[0], 0);
			ScaleSprite(Tp_.h, size, f32(size * f32(1.7)));
			//SpriteViewMode Tp\h,4
			EntityBlend(Tp_.h, 3);
			Tp_.fy = f32(size * f32(1.7));
			Tp_.a = f32(a);
			//Underwaterspawn
			if (y < 0) {
				FreeEntity(Tp_.h);
				Delete(Tp, Tp_);
				if (Rand(3) === 1) p_add(x, y, z, Cp_smoke, Rnd(3, 5), Rnd(f32(0.3), f32(0.5)));
				if (Rand(20) === 1) p_add(x, y, z, Cp_bubbles, Rnd(1, 3));
			}
			break;

		//35 Firespark
		case Cp_firespark:
			// exe: arguments evaluated y, z, x
			argy = Rnd(-2, 2);
			argz = Rnd(-2, 2);
			argx = Rnd(-2, 2);
			TranslateEntity(Tp_.h, argx, argy, argz);
			EntityTexture(Tp_.h, G.gfx_p_spark[0]);
			ScaleSprite(Tp_.h, size, size);
			EntityColor(Tp_.h, 255, Rand(50, 255), 0);
			RotateSprite(Tp_.h, Rand(360));
			Tp_.a = f32(a);
			Tp_.fy = Rnd(f32(0.5), 2);
			Tp_.fx = Rand(360);
			Tp_.fz = Rand(360);
			EntityBlend(Tp_.h, 3);
			break;

		//40 Risingflare
		case Cp_risingflare:
			EntityTexture(Tp_.h, G.gfx_p_flare[1]);
			ScaleSprite(Tp_.h, size, size);
			EntityColor(Tp_.h, 255, 0, 0);
			Tp_.rot = Rand(360);
			RotateSprite(Tp_.h, Tp_.rot);
			EntityBlend(Tp_.h, 3);
			Tp_.fx = Rnd(f32(0.05), f32(0.1));
			Tp_.fy = Rnd(f32(0.3), f32(0.5));
			Tp_.fz = Rnd(-5, 5);
			Tp_.a = f32(a);
			break;

		//45 - Explode
		case Cp_explode:
			FreeEntity(Tp_.h);
			Tp_.h = CreateSphere();
			PositionEntity(Tp_.h, x, y, z);
			EntityTexture(Tp_.h, G.gfx_p_smoke[Rand(0, 1)]);
			//ScaleSprite Tp\h,size#,size#
			ScaleEntity(Tp_.h, size, size, size);
			EntityColor(Tp_.h, 255, Rand(50, 255), 0);
			Tp_.rot = Rand(360);
			//RotateSprite Tp\h,Tp\rot#
			// exe: arguments evaluated yaw, roll, pitch
			argyaw = Rnd(360);
			argroll = Rnd(360);
			argpitch = Rnd(360);
			RotateEntity(Tp_.h, argpitch, argyaw, argroll);
			EntityBlend(Tp_.h, 3);
			EntityAlpha(Tp_.h, a);
			Tp_.a = f32(a);
			break;

		//46 - Shockwave
		case Cp_shockwave:
			EntityTexture(Tp_.h, G.gfx_p_shockwave);
			ScaleSprite(Tp_.h, size, size);
			EntityBlend(Tp_.h, 3);
			SpriteViewMode(Tp_.h, 2);
			RotateSprite(Tp_.h, Rand(360));
			Tp_.fy = Rnd(f32(0.5), f32(0.7));
			Tp_.a = f32(a);
			RotateEntity(Tp_.h, 90, 0, 90);
			EntityColor(Tp_.h, 255, Rand(50, 200), 0);
			break;

		//50 - Starflare
		case Cp_starflare:
			EntityTexture(Tp_.h, G.gfx_p_starflare);
			ScaleSprite(Tp_.h, size, size);
			EntityColor(Tp_.h, Rand(50, 150), 150, 0);
			EntityBlend(Tp_.h, 3);
			Tp_.rot = Rand(360);
			RotateSprite(Tp_.h, Tp_.rot);
			Tp_.fx = Rnd(f32(0.02), f32(0.06));
			Tp_.fy = Rnd(f32(0.1), f32(0.2));
			Tp_.fz = Rnd(-5, 5);
			Tp_.r = Rnd(f32(0.007), f32(0.01));
			Tp_.a = f32(a);
			break;

		//51 - Spawn
		case Cp_spawn:
			EntityTexture(Tp_.h, G.gfx_p_starflare);
			ScaleSprite(Tp_.h, size, f32(size * 2.5));
			EntityColor(Tp_.h, Rand(50, 150), 150, 0);
			EntityBlend(Tp_.h, 3);
			SpriteViewMode(Tp_.h, 4);
			Tp_.fy = f32(size * 2.5);
			Tp_.a = f32(a);
			Tp_.fz = 1;
			Tp_.fx = 1;
			break;

		//60 - Impact
		case Cp_impact:
			EntityTexture(Tp_.h, G.gfx_p_flare[0]);
			ScaleSprite(Tp_.h, size, size);
			EntityColor(Tp_.h, 255, Rand(150, 255), 150);
			EntityBlend(Tp_.h, 3);
			RotateSprite(Tp_.h, Rand(360));
			EntityAlpha(Tp_.h, a);
			Tp_.a = f32(a);
			break;

		//70 - Rain
		case Cp_rain:
			Tp_.a = f32(0.1);
			EntityTexture(Tp_.h, G.gfx_rain);
			ScaleSprite(Tp_.h, size, f32(size * 2));
			EntityBlend(Tp_.h, 3);
			EntityAlpha(Tp_.h, a);
			PositionEntity(Tp_.h, x, f32(EntityY(G.cam) + Rand(100, 150)), z);
			Tp_.fy = Rnd(6, 8);
			SpriteViewMode(Tp_.h, 4);
			RotateSprite(Tp_.h, Rnd(-3, 3));
			EntityParent(Tp_.h, G.camxz);
			break;

		//71 - Snow
		case Cp_snow:
			Tp_.a = f32(0.1);
			EntityTexture(Tp_.h, G.gfx_snow);
			ScaleSprite(Tp_.h, size, size);
			EntityBlend(Tp_.h, 3);
			EntityAlpha(Tp_.h, a);
			PositionEntity(Tp_.h, x, f32(EntityY(G.cam) + Rand(100, 200)), z);
			Tp_.fy = Rnd(3, 4);
			//SpriteViewMode Tp\h,4
			RotateSprite(Tp_.h, Rnd(360));
			EntityParent(Tp_.h, G.camxz);
			break;

		//98 - Fade
		case Cp_fade:
			ScaleSprite(Tp_.h, 10, 10);
			EntityParent(Tp_.h, G.cam, 0);
			MoveEntity(Tp_.h, 0, 0, 5);
			EntityFX(Tp_.h, 1);
			EntityOrder(Tp_.h, -5);
			Tp_.fx = f32(size);
			Tp_.a = 0;
			Tp_.fadein = f32(a);
			EntityAlpha(Tp_.h, 0);
			break;

		//99 - Sequence Fade
		case Cp_seqfade:
			ScaleSprite(Tp_.h, 10, 10);
			EntityParent(Tp_.h, G.cam, 0);
			MoveEntity(Tp_.h, 0, 0, 5);
			EntityFX(Tp_.h, 1);
			EntityOrder(Tp_.h, -5);
			break;

		//100 - Flash
		case Cp_flash:
			ScaleSprite(Tp_.h, 10, 10);
			EntityParent(Tp_.h, G.cam, 0);
			MoveEntity(Tp_.h, 0, 0, 5);
			EntityFX(Tp_.h, 1);
			EntityOrder(Tp_.h, -5);
			Tp_.a = f32(a);
			Tp_.fx = f32(size);
			break;

		//101 - Fadeout
		case Cp_fadeout:
			Tp_.h = G.tmp_ph;
			Tp_.a = f32(y);
			Tp_.fx = f32(z);
			break;

		//102 - Fall
		case Cp_fall:
			Tp_.h = G.tmp_ph;
			//Fall Directon
			Tp_.fx = 1;
			if (Rand(0, 1)) Tp_.fx = -1;
			Tp_.fz = 1;
			if (Rand(0, 1)) Tp_.fz = -1;
			break;

		//103 - Resfade
		case Cp_resfade:
			Tp_.h = G.tmp_ph;
			Tp_.r = f32(y);
			Tp_.g = f32(z);
			break;

		//104 - Stuck
		case Cp_stuck:
			Tp_.h = G.tmp_ph;
			Tp_.a = f32(a);
			break;
	}

	// quirk: an underwater Cp_flames particle was deleted above; TCp then points at the dead object
	// (TCp=Null is true for it), not at the smoke/bubble particle the recursive calls created
	G.TCp = Tp_;
}

//### Particle Add (2D)
/** Function p_add2d(x,y,typ,size#=0) */
export function p_add2d(x: number, y: number, typ: number, size: number = 0): number {
	let Tp_: Tp | null = null;

	//If set_2dfx=0 Then Return
	Tp_ = New(Tp);
	Tp_.typ = typ;
	Tp_.x = x;
	Tp_.y = y;
	switch (typ) {
		//-1 Black Rect
		case Cp2d_blackrect:
			Tp_.fx = Rnd(-5, 5);
			Tp_.fy = Rnd(5, -5);
			Tp_.a = 50;
			break;
		//-2 Item
		case Cp2d_item:
			Tp_.x = f32(Tp_.x - 20);
			Tp_.y = f32(Tp_.y - 20);
			Tp_.fx = Rnd(-10, 10);
			Tp_.fy = Rnd(-5, -10);
			Tp_.a = Int(size);
			break;
		//-3 Dot
		case Cp2d_dot:
			Tp_.age = Int(size);
			Tp_.fx = Rnd(f32(-0.8), f32(0.8));
			Tp_.fy = f32(-Rnd(f32(3.5), 7));
			Tp_.frame = Rand(0, 1);
			break;
		//-4 Controlled Dot
		case Cp2d_cdot:
			//Created with p_combine Function
			break;
	}
	G.TCp = Tp_;
	return 1;
}

//### Particle Update
/** Function p_update() */
export function p_update(): void {
	let c = 0;
	let ct = 0;
	let Tp_: Tp | null = null;
	let time = 0;
	let t1 = 0;
	let t2 = 0;
	let t3 = 0;
	let p = 0;
	let angle = 0;

	c = 0;
	ct = MilliSecs();
	for (Tp_ = First(Tp); Tp_ !== null; Tp_ = After(Tp, Tp_)) {
		c = c + 1;

		switch (Tp_.typ) {
			//############################## 3D

			//Attack
			case Cp_attack:
				if (Tp_.r === 1) {
					Tp_.rot = f32(Tp_.rot - f32(30 * G.f));
				} else {
					Tp_.rot = f32(Tp_.rot + f32(30 * G.f));
				}
				RotateSprite(Tp_.h, Tp_.rot);
				Tp_.a = f32(Tp_.a - f32(f32(0.075) * G.f));
				EntityAlpha(Tp_.h, Tp_.a);
				if (Tp_.a < 0.0) {
					FreeEntity(Tp_.h);
					Delete(Tp, Tp_);
				}
				break;

			//5 Debug
			case Cp_debug:
				Tp_.a = f32(Tp_.a - f32(f32(0.03) * G.f));
				EntityAlpha(Tp_.h, Tp_.a);
				if (Tp_.a < 0.0) {
					FreeEntity(Tp_.h);
					Delete(Tp, Tp_);
				}
				break;

			//10 Bubbles
			case Cp_bubbles:
				TranslateEntity(Tp_.h, 0, f32(Tp_.fy * G.f), 0);
				Tp_.a = f32(Tp_.a - f32(f32(0.01) * G.f));
				EntityAlpha(Tp_.h, Tp_.a);
				if (EntityY(Tp_.h) > -3 || Tp_.a < 0.0) {
					if (EntityY(Tp_.h) > -3) {
						p_add(EntityX(Tp_.h), 1, EntityZ(Tp_.h), Cp_rwave, f32(Tp_.size * Rnd(1, 2)), f32(0.4));
					}
					FreeEntity(Tp_.h);
					Delete(Tp, Tp_);
				}
				break;

			//11 Roundwave
			case Cp_rwave:
				Tp_.size = f32(Tp_.size + f32(Tp_.fy * G.f));
				ScaleSprite(Tp_.h, Tp_.size, Tp_.size);
				Tp_.a = f32(Tp_.a - f32(f32(0.02) * G.f));
				EntityAlpha(Tp_.h, Tp_.a);
				if (Tp_.a < 0.0) {
					FreeEntity(Tp_.h);
					Delete(Tp, Tp_);
				}
				break;

			//12 Splash
			case Cp_splash:
				Tp_.a = f32(Tp_.a - f32(f32(0.05) * G.f));
				if (Tp_.a > f32(0.6)) {
					Tp_.x = f32(Tp_.x + f32(Tp_.fx * G.f));
					Tp_.y = f32(Tp_.y + f32(f32(Tp_.fx * 2) * G.f));
				} else {
					Tp_.x = f32(Tp_.x + f32(f32(Tp_.fx * 2) * G.f));
					Tp_.y = f32(Tp_.y - f32(f32(Tp_.fx * 2) * G.f));
				}
				ScaleSprite(Tp_.h, Tp_.x, Tp_.y);
				EntityAlpha(Tp_.h, Tp_.a);
				if (Tp_.a < 0.0) {
					FreeEntity(Tp_.h);
					Delete(Tp, Tp_);
				}
				break;

			//15 Wave
			case Cp_wave:
				Tp_.size = f32(Tp_.size + f32(f32(0.1) * G.f));
				ScaleSprite(Tp_.h, Tp_.size, Tp_.size);
				if (Tp_.fx === 0) {
					Tp_.a = f32(Tp_.a + f32(f32(0.01) * G.f));
					if (Tp_.a > Tp_.fadein) {
						Tp_.a = Tp_.fadein;
						Tp_.fx = 1;
					}
				} else {
					Tp_.a = f32(Tp_.a - f32(f32(0.04) * G.f));
				}
				EntityAlpha(Tp_.h, Tp_.a);
				TranslateEntity(Tp_.h, f32(f32(f32(-Sin(Tp_.fy)) * G.f) * f32(0.4)), 0, f32(f32(Cos(Tp_.fy) * G.f) * f32(0.4)));
				if (Tp_.fx === 1) {
					if (Tp_.a < 0.0) {
						FreeEntity(Tp_.h);
						Delete(Tp, Tp_);
					}
				}
				break;

			//19	Hover
			case Cp_hover:
				TranslateEntity(Tp_.h, f32(Tp_.fx * G.f), f32(Tp_.fy * G.f), f32(Tp_.fz * G.f));
				Tp_.rot = f32(Tp_.rot + f32(Tp_.r * G.f));
				RotateSprite(Tp_.h, Tp_.rot);
				if (Tp_.fadein > 0) {
					Tp_.a = f32(Tp_.a + f32(f32(0.01) * G.f));
					EntityAlpha(Tp_.h, Tp_.a);
					if (Tp_.a >= Tp_.fadein) {
						Tp_.a = Tp_.fadein;
						Tp_.fadein = 0;
					}
					if (EntityY(Tp_.h) > -10) {
						PositionEntity(Tp_.h, EntityX(Tp_.h), -10, EntityZ(Tp_.h));
						Tp_.fy = 0;
					}
				} else {
					Tp_.a = f32(Tp_.a - f32(f32(0.002) * G.f));
					EntityAlpha(Tp_.h, Tp_.a);
					if (Tp_.a < 0.0) {
						FreeEntity(Tp_.h);
						Delete(Tp, Tp_);
					} else if (EntityY(Tp_.h) > -10) {
						PositionEntity(Tp_.h, EntityX(Tp_.h), -10, EntityZ(Tp_.h));
						Tp_.fy = 0;
					}
				}
				break;

			//20 Smoke
			case Cp_smoke:
				if (Tp_.fadein > 0) {
					Tp_.a = f32(Tp_.a + f32(f32(0.034) * G.f));
					if (Tp_.a >= Tp_.fadein) {
						Tp_.a = Tp_.fadein;
						Tp_.fadein = 0;
					}
					EntityAlpha(Tp_.h, Tp_.a);
					Tp_.size = f32(Tp_.size + f32(Tp_.fx * G.f));
					ScaleSprite(Tp_.h, Tp_.size, Tp_.size);
					TranslateEntity(Tp_.h, 0, f32(Tp_.fy * G.f), 0);
					Tp_.rot = f32(Tp_.rot + f32(Tp_.fz * G.f));
					RotateSprite(Tp_.h, Tp_.rot);
				} else {
					Tp_.size = f32(Tp_.size + f32(Tp_.fx * G.f));
					ScaleSprite(Tp_.h, Tp_.size, Tp_.size);
					TranslateEntity(Tp_.h, 0, f32(Tp_.fy * G.f), 0);
					Tp_.a = f32(Tp_.a - f32(Tp_.r * G.f));
					EntityAlpha(Tp_.h, Tp_.a);
					Tp_.rot = f32(Tp_.rot + f32(Tp_.fz * G.f));
					RotateSprite(Tp_.h, Tp_.rot);
					if (Tp_.a < 0.0) {
						FreeEntity(Tp_.h);
						Delete(Tp, Tp_);
					}
				}
				break;

			//21 Spark / 24 Wood
			case Cp_spark:
			case Cp_wood:
				//Rotate
				Tp_.rot = f32(Tp_.rot + f32(Tp_.fadein * G.f));
				RotateSprite(Tp_.h, Tp_.rot);
				//Move
				Tp_.fx = f32(Tp_.fx * f32(0.96));
				Tp_.fz = f32(Tp_.fz * f32(0.96));
				TranslateEntity(Tp_.h, f32(Tp_.fx * f32(2.5 * G.f)), f32(Tp_.fy * f32(2.5 * G.f)), f32(Tp_.fz * f32(2.5 * G.f)));
				//Fade
				Tp_.a = f32(Tp_.a - f32(f32(0.025) * G.f));
				EntityAlpha(Tp_.h, Tp_.a);
				//Fall
				if (CountCollisions(Tp_.h) > 0) {
					Tp_.fx = 0;
					Tp_.fy = 0;
					Tp_.fz = 0;
					Tp_.fadein = 0;
				} else {
					if (e_tery(EntityX(Tp_.h), EntityZ(Tp_.h)) > EntityY(Tp_.h)) {
						PositionEntity(Tp_.h, EntityX(Tp_.h), e_tery(EntityX(Tp_.h), EntityZ(Tp_.h)), EntityZ(Tp_.h));
						Tp_.fx = 0;
						Tp_.fy = 0;
						Tp_.fz = 0;
						Tp_.fadein = 0;
					} else {
						Tp_.fy = f32(Tp_.fy - f32(f32(0.3) * G.f));
					}
				}
				//Water / Free
				if (EntityY(Tp_.h) < 0) {
					p_add(EntityX(Tp_.h), EntityY(Tp_.h), EntityZ(Tp_.h), 20, Rnd(1, 3), Rnd(f32(0.5), f32(0.9)));
					p_add(EntityX(Tp_.h), EntityY(Tp_.h), EntityZ(Tp_.h), 10, Rnd(1, 3), Rnd(f32(0.5), f32(0.9)));
					Tp_.a = -1;
				}
				if (Tp_.a < 0.0) {
					FreeEntity(Tp_.h);
					Delete(Tp, Tp_);
				}
				break;

			//22 Splatter
			case Cp_splatter:
				Tp_.fx = f32(Tp_.fx * f32(0.96));
				Tp_.fy = f32(Tp_.fy - f32(f32(0.3) * G.f));
				Tp_.fz = f32(Tp_.fz * f32(0.96));
				//Surface
				if (EntityY(Tp_.h) > -2) {
					Tp_.a = f32(Tp_.a - f32(f32(0.05) * G.f));
					TranslateEntity(Tp_.h, f32(Tp_.fx * f32(1.5 * G.f)), f32(Tp_.fy * f32(2.5 * G.f)), f32(Tp_.fz * f32(1.5 * G.f)));
					//Spawn Subsplatter
					p_add(EntityX(Tp_.h), EntityY(Tp_.h), EntityZ(Tp_.h), Cp_subsplatter, Rnd(2, 3), Rnd(f32(0.5), 1));
					//Terrain
					if (e_tery(EntityX(Tp_.h), EntityZ(Tp_.h)) >= EntityY(Tp_.h)) {
						p_add(EntityX(Tp_.h), 0, EntityZ(Tp_.h), Cp_puddle, Rnd(4, 10), Rnd(f32(0.5), f32(0.8)));
						FreeEntity(Tp_.h);
						Delete(Tp, Tp_);
					} else {
						EntityAlpha(Tp_.h, Tp_.a);
						if (Tp_.a < 0.0) {
							FreeEntity(Tp_.h);
							Delete(Tp, Tp_);
						}
					}
					//Water
				} else {
					Tp_.size = f32(Tp_.size + f32(f32(0.6) * G.f));
					ScaleSprite(Tp_.h, Tp_.size, Tp_.size);
					Tp_.a = f32(Tp_.a - f32(f32(0.01) * G.f));
					if (Tp_.a > 0.5) Tp_.a = 0.5;
					EntityAlpha(Tp_.h, Tp_.a);
					if (Tp_.a < 0.0) {
						FreeEntity(Tp_.h);
						Delete(Tp, Tp_);
					}
				}
				break;

			//23 Subsplatter
			case Cp_subsplatter:
				Tp_.a = f32(Tp_.a - f32(f32(0.07) * G.f));
				if (e_tery(EntityX(Tp_.h), EntityZ(Tp_.h)) >= EntityY(Tp_.h)) {
					if (Tp_.frame < 2) {
						if (Rand(3) === 1) {
							p_add(EntityX(Tp_.h), 0, EntityZ(Tp_.h), Cp_puddle, Rnd(3, 5), Rnd(f32(0.3), f32(0.5)));
							if (Tp_.frame !== 0) {
								EntityColor(G.TCp!.h, Tp_.r, Tp_.g, Tp_.b);
							}
						}
					} else {
						p_add(EntityX(Tp_.h), 0, EntityZ(Tp_.h), Cp_puddle, Rnd(4, 10), Rnd(f32(0.5), f32(0.8)));
						EntityColor(G.TCp!.h, Tp_.r, Tp_.g, Tp_.b);
					}
					FreeEntity(Tp_.h);
					Delete(Tp, Tp_);
				} else {
					TranslateEntity(Tp_.h, 0, f32(-2 * G.f), 0);
					EntityAlpha(Tp_.h, Tp_.a);
					if (Tp_.a < 0.0) {
						FreeEntity(Tp_.h);
						Delete(Tp, Tp_);
					}
				}
				break;

			//25 Puddle
			case Cp_puddle:
				Tp_.a = f32(Tp_.a - f32(f32(0.005) * G.f));
				EntityAlpha(Tp_.h, Tp_.a);
				if (Tp_.a < 0.0) {
					FreeEntity(Tp_.h);
					Delete(Tp, Tp_);
				}
				break;

			//30 Flames
			case Cp_flames:
				TranslateEntity(Tp_.h, 0, f32(0.5 * G.f), 0);
				Tp_.size = f32(Tp_.size - f32(f32(0.15) * G.f));
				ScaleSprite(Tp_.h, Tp_.size, Tp_.fy);
				Tp_.a = f32(Tp_.a - f32(f32(0.03) * G.f));
				EntityAlpha(Tp_.h, Tp_.a);
				if (Tp_.a < 0.0 || Tp_.size < 0.0) {
					if (Rand(3) === 1) {
						p_add(EntityX(Tp_.h), EntityY(Tp_.h), EntityZ(Tp_.h), Cp_smoke, Rnd(3, 5), Rnd(f32(0.1), f32(0.3)));
						G.TCp!.r = f32(0.002);
						G.TCp!.fx = Rnd(f32(0.1), f32(0.2));
						G.TCp!.fy = Rnd(f32(0.4), f32(0.6));
					}
					FreeEntity(Tp_.h);
					Delete(Tp, Tp_);
				}
				break;

			//35 Firespark
			case Cp_firespark:
				Tp_.fx = fmod(f32(Tp_.fx + f32(10 * G.f)), 360);
				Tp_.fz = fmod(f32(Tp_.fz + f32(10 * G.f)), 360);
				TranslateEntity(Tp_.h, f32(Sin(Tp_.fx) * G.f), f32(Tp_.fy * G.f), f32(Cos(Tp_.fz) * G.f));
				Tp_.a = f32(Tp_.a - f32(f32(0.02) * G.f));
				EntityAlpha(Tp_.h, Tp_.a);
				if (Tp_.a < 0.0) {
					FreeEntity(Tp_.h);
					Delete(Tp, Tp_);
				}
				break;

			//40 Risingflare
			case Cp_risingflare:
				Tp_.size = f32(Tp_.size + f32(Tp_.fx * G.f));
				ScaleSprite(Tp_.h, Tp_.size, Tp_.size);
				TranslateEntity(Tp_.h, 0, f32(Tp_.fy * G.f), 0);
				Tp_.a = f32(Tp_.a - f32(f32(0.01) * G.f));
				EntityAlpha(Tp_.h, Tp_.a);
				Tp_.rot = f32(Tp_.rot + f32(Tp_.fz * G.f));
				RotateSprite(Tp_.h, Tp_.rot);
				if (Tp_.a < 0.0) {
					FreeEntity(Tp_.h);
					Delete(Tp, Tp_);
				}
				break;

			//45 - Explode
			case Cp_explode:
				Tp_.size = f32(Tp_.size + f32(5 * G.f));
				//ScaleSprite Tp\h,Tp\size#,Tp\size#
				ScaleEntity(Tp_.h, Tp_.size, Tp_.size, Tp_.size);
				Tp_.a = f32(Tp_.a - f32(f32(0.05) * G.f));
				EntityAlpha(Tp_.h, Tp_.a);
				if (Tp_.a < 0.0) {
					FreeEntity(Tp_.h);
					Delete(Tp, Tp_);
				}
				break;

			//46 - Shockwave
			case Cp_shockwave:
				Tp_.size = f32(Tp_.size + f32(Tp_.fy * G.f));
				ScaleSprite(Tp_.h, Tp_.size, Tp_.size);
				Tp_.a = f32(Tp_.a - f32(f32(0.04) * G.f));
				EntityAlpha(Tp_.h, Tp_.a);
				if (Tp_.a < 0.0) {
					FreeEntity(Tp_.h);
					Delete(Tp, Tp_);
				}
				break;

			//50 - Starflare
			case Cp_starflare:
				Tp_.size = f32(Tp_.size - f32(Tp_.fx * G.f));
				if (Tp_.size > 0) {
					ScaleSprite(Tp_.h, Tp_.size, Tp_.size);
					TranslateEntity(Tp_.h, 0, f32(Tp_.fy * G.f), 0);
					Tp_.a = f32(Tp_.a - f32(Tp_.r * G.f));
					EntityAlpha(Tp_.h, Tp_.a);
					Tp_.rot = f32(Tp_.rot + f32(Tp_.fz * G.f));
					RotateSprite(Tp_.h, Tp_.rot);
					if (Tp_.a < 0.0) {
						FreeEntity(Tp_.h);
						Delete(Tp, Tp_);
					}
				} else {
					FreeEntity(Tp_.h);
					Delete(Tp, Tp_);
				}
				break;

			//51 - Spawn
			case Cp_spawn:
				TranslateEntity(Tp_.h, 0, f32(f32(f32(f32(0.1) * Tp_.fx) * G.f) * Tp_.fz), 0);
				Tp_.size = f32(Tp_.size - f32(f32(f32(f32(0.01) * Tp_.fx) * G.f) * Tp_.fz));
				Tp_.fy = f32(Tp_.fy + f32(f32(f32(f32(1.8) * Tp_.fx) * G.f) * Tp_.fz));
				ScaleSprite(Tp_.h, Tp_.size, Tp_.fy);
				Tp_.a = f32(Tp_.a - f32(f32(f32(f32(0.02) * Tp_.fx) * G.f) * Tp_.fz));
				EntityAlpha(Tp_.h, Tp_.a);
				if (Tp_.parentid > 0) p_toparent(Tp_);
				if (Tp_.a < 0.0 || Tp_.size < 0.0) {
					FreeEntity(Tp_.h);
					Delete(Tp, Tp_);
				}
				break;

			//60 - Impact
			case Cp_impact:
				Tp_.size = f32(Tp_.size + f32(1.5 * G.f));
				ScaleSprite(Tp_.h, Tp_.size, Tp_.size);
				Tp_.a = f32(Tp_.a - f32(f32(0.05) * G.f));
				EntityAlpha(Tp_.h, Tp_.a);
				if (Tp_.a < 0.0) {
					FreeEntity(Tp_.h);
					Delete(Tp, Tp_);
				}
				break;

			//70 - Rain
			case Cp_rain:
				Tp_.a = f32(Tp_.a + f32(f32(0.05) * G.f));
				EntityAlpha(Tp_.h, Tp_.a);
				TranslateEntity(Tp_.h, 0, f32(-Tp_.fy * G.f), 0);
				if (EntityY(Tp_.h) < 0) {
					FreeEntity(Tp_.h);
					Delete(Tp, Tp_);
				}
				//ElseIf (e_tery(EntityX(Tp\h,1),EntityZ(Tp\h,1))-(Tp\size#))>EntityY(Tp\h) Then
				//FreeEntity Tp\h
				//Delete Tp
				//EndIf
				break;

			//71 - Snow
			case Cp_snow:
				Tp_.a = f32(Tp_.a + f32(f32(0.02) * G.f));
				EntityAlpha(Tp_.h, Tp_.a);
				TranslateEntity(Tp_.h, 0, f32(-Tp_.fy * G.f), 0);
				if (EntityY(Tp_.h) < 0) {
					FreeEntity(Tp_.h);
					Delete(Tp, Tp_);
				}
				//ElseIf (e_tery(EntityX(Tp\h,1),EntityZ(Tp\h,1))-(Tp\size#/2.))>EntityY(Tp\h) Then
				//FreeEntity Tp\h
				//Delete Tp
				//EndIf
				break;

			//98 - Fade
			case Cp_fade:
				if (Tp_.fadein > 0) {
					Tp_.a = f32(Tp_.a + f32(Tp_.fx * G.f));
					if (Tp_.a > Tp_.fadein) {
						Tp_.a = Tp_.fadein;
						Tp_.fadein = 0;
					}
					EntityAlpha(Tp_.h, Tp_.a);
				} else {
					Tp_.a = f32(Tp_.a - f32(Tp_.fx * G.f));
					EntityAlpha(Tp_.h, Tp_.a);
					if (Tp_.a < 0.0) {
						FreeEntity(Tp_.h);
						Delete(Tp, Tp_);
					}
				}
				break;

			//99 - Sequence Fade
			case Cp_seqfade:
				time = (((MilliSecs() - G.seq_start) | 0) + 1) | 0;
				if (time > Int(Tp_.y)) {
					FreeEntity(Tp_.h);
					Delete(Tp, Tp_);
				} else {
					//Mode
					t1 = time - Int(Tp_.x);
					t2 = Int(Tp_.y) - Int(Tp_.x);
					switch (Int(Tp_.fx)) {
						//0 - 1 - 0
						case 0:
							t3 = idivConst(t2, 2);
							if (t1 <= t3) {
								p = f32(t1 / t3);
								EntityAlpha(Tp_.h, p);
							} else {
								p = f32(t1 / t3);
								EntityAlpha(Tp_.h, f32(1 - p));
							}
							break;
						//0 - 1
						case 1:
							p = f32(t1 / t2);
							EntityAlpha(Tp_.h, p);
							break;
						//1 - 0
						case 2:
							p = f32(t1 / t2);
							EntityAlpha(Tp_.h, f32(1 - p));
							break;
					}
					//Free
					if (G.m_menu !== Cmenu_if_movie) {
						if (G.m_section !== Csection_menu) {
							FreeEntity(Tp_.h);
							Delete(Tp, Tp_);
						}
					}
				}
				break;

			//100 - Flash
			case Cp_flash:
				Tp_.a = f32(Tp_.a - f32(Tp_.fx * G.f));
				EntityAlpha(Tp_.h, Tp_.a);
				if (Tp_.a < 0.0) {
					FreeEntity(Tp_.h);
					Delete(Tp, Tp_);
				}
				break;

			//101 - Fadeout
			case Cp_fadeout:
				//TurnEntity Tp\h,0,0,20.*f#
				Tp_.a = f32(Tp_.a - f32(Tp_.fx * G.f));
				EntityAlpha(Tp_.h, Tp_.a);
				if (Tp_.a < 0.0) {
					FreeEntity(Tp_.h);
					Delete(Tp, Tp_);
				}
				break;

			//102 - Fall
			case Cp_fall:
				TranslateEntity(Tp_.h, 0, f32(-0.9), 0);
				TurnEntity(Tp_.h, f32(f32(0.55) * Tp_.fx), 0, f32(f32(0.27) * Tp_.fz));
				if (f32(EntityY(Tp_.h) + 300) < e_tery(EntityX(Tp_.h), EntityZ(Tp_.h))) {
					FreeEntity(Tp_.h);
					Delete(Tp, Tp_);
				}
				break;

			//103 - Resfade
			case Cp_resfade:
				Tp_.a = f32(Tp_.a - f32(Tp_.r * G.f));
				Tp_.fx = f32(Tp_.fx + f32(Tp_.g * G.f));
				Tp_.fy = f32(Tp_.fy + f32(Tp_.g * G.f));
				Tp_.fz = f32(Tp_.fz + f32(Tp_.g * G.f));
				EntityAlpha(Tp_.h, Tp_.a);
				ScaleEntity(Tp_.h, Tp_.fx, Tp_.fy, Tp_.fz);
				if (Tp_.a < 0.0) {
					FreeEntity(Tp_.h);
					Delete(Tp, Tp_);
				}
				break;

			//104 - Stuck
			case Cp_stuck:
				Tp_.a = f32(Tp_.a - f32(f32(0.01) * G.f));
				EntityAlpha(Tp_.h, Tp_.a);
				if (Tp_.a < 0.0) {
					FreeEntity(Tp_.h);
					Delete(Tp, Tp_);
				}
				break;

			//############################## 2D

			//-1 Black Rect
			case Cp2d_blackrect:
				Color(0, 0, 0);
				Rect(Int(Tp_.x), Int(Tp_.y), Int(Tp_.a), Int(Tp_.a), 1);
				Tp_.x = f32(Tp_.x + f32(1 * G.f));
				Tp_.y = f32(Tp_.y + f32(1 * G.f));
				Tp_.a = f32(Tp_.a - f32(2 * G.f));
				if (Int(Tp_.a) <= 0) {
					Delete(Tp, Tp_);
				}
				break;

			//-2 Itemcollect
			case Cp2d_item:
				if (Ditem_iconh(Int(Tp_.a)) !== 0) {
					DrawImage(Ditem_iconh(Int(Tp_.a)), Int(Tp_.x), Int(Tp_.y));
				}
				Tp_.fy = f32(Tp_.fy + f32(1 * G.f));
				Tp_.fx = f32(Tp_.fx * f32(0.96));
				Tp_.y = f32(Tp_.y + f32(Tp_.fy * f32(2.5 * G.f)));
				Tp_.x = f32(Tp_.x + f32(Tp_.fx * f32(2.5 * G.f)));
				if (Tp_.y > G.set_scry) Delete(Tp, Tp_);
				break;

			//-3 Dot
			case Cp2d_dot:
				Tp_.x = f32(Tp_.x + f32(Tp_.fx * G.f));
				Tp_.y = f32(Tp_.y + f32(Tp_.fy * G.f));
				LockBuffer(BackBuffer());
				if (Tp_.x > 1) {
					if (Tp_.y > 1) {
						if (Tp_.x < G.set_scrx - 2) {
							if (Tp_.y < G.set_scry - 2) {
								WritePixelFast(Int(Tp_.x), Int(Tp_.y), Tp_.age);
								if (Tp_.frame) {
									WritePixelFast(Int(f32(Tp_.x + 1)), Int(Tp_.y), Tp_.age);
									WritePixelFast(Int(Tp_.x), Int(f32(Tp_.y + 1)), Tp_.age);
									WritePixelFast(Int(f32(Tp_.x + 1)), Int(f32(Tp_.y + 1)), Tp_.age);
								}
							} else {
								Delete(Tp, Tp_);
							}
						} else {
							Delete(Tp, Tp_);
						}
					} else {
						Delete(Tp, Tp_);
					}
				} else {
					Delete(Tp, Tp_);
				}
				UnlockBuffer(BackBuffer());
				break;

			//-4 Controlled Dot
			case Cp2d_cdot:
				angle = Int(ATan2(f32(Tp_.fx - Tp_.x), f32(Tp_.y - Tp_.fy)));
				Tp_.x = f32(Tp_.x + f32(f32(Sin(angle) * Tp_.fz) * G.f));
				Tp_.y = f32(Tp_.y - f32(f32(Cos(angle) * Tp_.fz) * G.f));
				LockBuffer(BackBuffer());
				if (Tp_.x > 1) {
					if (Tp_.y > 1) {
						if (Tp_.x < G.set_scrx - 2) {
							if (Tp_.y < G.set_scry - 2) {
								WritePixelFast(Int(Tp_.x), Int(Tp_.y), Tp_.age);
								if (Tp_.frame) {
									WritePixelFast(Int(f32(Tp_.x + 1)), Int(Tp_.y), Tp_.age);
									WritePixelFast(Int(Tp_.x), Int(f32(Tp_.y + 1)), Tp_.age);
									WritePixelFast(Int(f32(Tp_.x + 1)), Int(f32(Tp_.y + 1)), Tp_.age);
								}
							} else {
								Delete(Tp, Tp_);
							}
						} else {
							Delete(Tp, Tp_);
						}
					} else {
						Delete(Tp, Tp_);
					}
				} else {
					Delete(Tp, Tp_);
				}
				UnlockBuffer(BackBuffer());
				// quirk: Tp may already be deleted here; the original reads its fields anyway (and deletes it again)
				if (fabs(f32(Tp_.x - Tp_.fx)) < 10) {
					if (fabs(f32(Tp_.y - Tp_.fy)) < 10) {
						Delete(Tp, Tp_);
					}
				}
				break;
		}
	}
	//Debug Times
	if (G.set_debug_rt) {
		G.set_debug_rt_particles = Str((MilliSecs() - ct) | 0) + ' ms Particles (' + Str(c) + ')';
	}
}

//### Particle Update 2D
/** Function p_update_2d() */
export function p_update_2d(): void {
	let Tp_: Tp | null = null;
	let angle = 0;

	for (Tp_ = First(Tp); Tp_ !== null; Tp_ = After(Tp, Tp_)) {
		if (Tp_.typ < 0) {
			switch (Tp_.typ) {
				//-1 Black Rect
				case Cp2d_blackrect:
					Color(0, 0, 0);
					Rect(Int(Tp_.x), Int(Tp_.y), Int(Tp_.a), Int(Tp_.a), 1);
					Tp_.x = f32(Tp_.x + f32(1 * G.f));
					Tp_.y = f32(Tp_.y + f32(1 * G.f));
					Tp_.a = f32(Tp_.a - f32(2 * G.f));
					if (Int(Tp_.a) <= 0) {
						Delete(Tp, Tp_);
					}
					break;

				//-2 Itemcollect
				case Cp2d_item:
					if (Ditem_iconh(Int(Tp_.a)) !== 0) {
						DrawImage(Ditem_iconh(Int(Tp_.a)), Int(Tp_.x), Int(Tp_.y));
					}
					Tp_.fy = f32(Tp_.fy + f32(1 * G.f));
					Tp_.fx = f32(Tp_.fx * f32(0.96));
					Tp_.y = f32(Tp_.y + f32(Tp_.fy * f32(2.5 * G.f)));
					Tp_.x = f32(Tp_.x + f32(Tp_.fx * f32(2.5 * G.f)));
					if (Tp_.y > G.set_scry) Delete(Tp, Tp_);
					break;

				//-3 Dot
				case Cp2d_dot:
					Tp_.x = f32(Tp_.x + f32(Tp_.fx * G.f));
					Tp_.y = f32(Tp_.y + f32(Tp_.fy * G.f));
					LockBuffer(BackBuffer());
					if (Tp_.x > 1) {
						if (Tp_.y > 1) {
							if (Tp_.x < G.set_scrx - 2) {
								if (Tp_.y < G.set_scry - 2) {
									WritePixelFast(Int(Tp_.x), Int(Tp_.y), Tp_.age);
									if (Tp_.frame) {
										WritePixelFast(Int(f32(Tp_.x + 1)), Int(Tp_.y), Tp_.age);
										WritePixelFast(Int(Tp_.x), Int(f32(Tp_.y + 1)), Tp_.age);
										WritePixelFast(Int(f32(Tp_.x + 1)), Int(f32(Tp_.y + 1)), Tp_.age);
									}
								} else {
									Delete(Tp, Tp_);
								}
							} else {
								Delete(Tp, Tp_);
							}
						} else {
							Delete(Tp, Tp_);
						}
					} else {
						Delete(Tp, Tp_);
					}
					UnlockBuffer(BackBuffer());
					break;

				//-4 Controlled Dot
				case Cp2d_cdot:
					angle = Int(ATan2(f32(Tp_.fx - Tp_.x), f32(Tp_.y - Tp_.fy)));
					Tp_.x = f32(Tp_.x + f32(f32(Sin(angle) * Tp_.fz) * G.f));
					Tp_.y = f32(Tp_.y - f32(f32(Cos(angle) * Tp_.fz) * G.f));
					LockBuffer(BackBuffer());
					if (Tp_.x > 1) {
						if (Tp_.y > 1) {
							if (Tp_.x < G.set_scrx - 2) {
								if (Tp_.y < G.set_scry - 2) {
									WritePixelFast(Int(Tp_.x), Int(Tp_.y), Tp_.age);
									if (Tp_.frame) {
										WritePixelFast(Int(f32(Tp_.x + 1)), Int(Tp_.y), Tp_.age);
										WritePixelFast(Int(Tp_.x), Int(f32(Tp_.y + 1)), Tp_.age);
										WritePixelFast(Int(f32(Tp_.x + 1)), Int(f32(Tp_.y + 1)), Tp_.age);
									}
								} else {
									Delete(Tp, Tp_);
								}
							} else {
								Delete(Tp, Tp_);
							}
						} else {
							Delete(Tp, Tp_);
						}
					} else {
						Delete(Tp, Tp_);
					}
					UnlockBuffer(BackBuffer());
					// quirk: Tp may already be deleted here; the original reads its fields anyway (and deletes it again)
					if (fabs(f32(Tp_.x - Tp_.fx)) < 10) {
						if (fabs(f32(Tp_.y - Tp_.fy)) < 10) {
							Delete(Tp, Tp_);
						}
					}
					break;
			}
		}
	}
}

//### Rectscreen
/** Function p_rectscreen() */
export function p_rectscreen(): void {
	let Tp_: Tp | null = null;
	let x = 0;
	let y = 0;

	for (Tp_ = First(Tp); Tp_ !== null; Tp_ = After(Tp, Tp_)) {
		if (Tp_.typ === Cp2d_blackrect) Delete(Tp, Tp_);
	}
	for (x = 0; x <= G.set_scrx + 50; x += 50) {
		for (y = 0; y <= G.set_scry + 50; y += 50) {
			p_add2d(x, y, Cp2d_blackrect);
		}
	}
}

//### Kill P2D
/** Function p_kill2d() */
export function p_kill2d(): void {
	let Tp_: Tp | null = null;

	for (Tp_ = First(Tp); Tp_ !== null; Tp_ = After(Tp, Tp_)) {
		if (Tp_.typ < 0) {
			Delete(Tp, Tp_);
		}
	}
}

/** `Return 0` as the first statement of a function whose remaining body the original keeps (dead code). */
const ALWAYS: boolean = true;

//### Pixelize Eat / Drink
/** Function p_pixelizeeat(rx,ry,img,er=0,eg=1,eb=0) */
export function p_pixelizeeat(rx: number, ry: number, img: ImageHandle, er: number = 0, eg: number = 1, eb: number = 0): number {
	// quirk: the function returns at once; everything below is dead code in the original as well
	if (ALWAYS) return 0;
	let x = 0;
	let y = 0;
	let h = 0;
	let w = 0;
	let r = 0;
	let g = 0;
	let b = 0;
	let rgb = 0;
	let f = 0;
	w = ImageWidth(img) - 1;
	h = ImageHeight(img) - 1;
	SetBuffer(ImageBuffer(img));
	LockBuffer(ImageBuffer(img));
	for (x = 0; x <= w; x += 2) {
		for (y = 0; y <= h; y += 2) {
			rgb = ReadPixelFast(x, y);
			r = idivConst(rgb & 0xff0000, 0x10000);
			g = idivConst(rgb & 0xff00, 0x100);
			b = rgb & 0xff;
			if (r + g + b > 3) {
				f = 100 + idiv(r + g + b, 3);
				if (f > 255) f = 255;
				if (er) {
					r = f;
				} else {
					r = 0;
				}
				if (eg) {
					g = f;
				} else {
					g = 0;
				}
				if (eb) {
					b = f;
				} else {
					b = 0;
				}
				rgb = (imul(255, 0x1000000) + r * 0x10000 + g * 0x100 + b) | 0;
				// quirk: the colour travels through the Float parameter size# (loses its low bits)
				p_add2d(rx + x, ry + y, Cp2d_dot, f32(rgb));
			}
		}
	}
	UnlockBuffer(ImageBuffer(img));
	SetBuffer(BackBuffer());
	return 0;
}

//### Explosion
/** Function p_explosion(x#,y#,z#,size#) */
export function p_explosion(x: number, y: number, z: number, size: number): void {
	let i = 0;
	let argx = 0;
	let argy = 0;
	let argz = 0;
	let argsize = 0;
	let arga = 0;

	//3D Explosion
	for (i = 1; i <= 3; i++) {
		p_add(x, y, z, Cp_explode, size, Rnd(1, 1.5));
	}
	//Shockwave
	p_add(x, f32(y + 15), z, Cp_shockwave, f32(size * 3));
	//Fire/Smoke Sprites
	for (i = 1; i <= 10; i++) {
		// exe: arguments evaluated z, size, alpha, y, x
		argz = f32(z + Rnd(f32(-size * 3), f32(size * 3)));
		argsize = Rnd(10, 30);
		arga = Rnd(f32(0.9), 1.5);
		argy = f32(y + Rnd(f32(size * 3)));
		argx = f32(x + Rnd(f32(-size * 5), f32(size * 5)));
		p_add(argx, argy, argz, Cp_smoke, argsize, arga);
		EntityColor(G.TCp!.h, 255, Rand(50, 200), 0);
		EntityBlend(G.TCp!.h, 3);
		G.TCp!.a = G.TCp!.fadein;
		G.TCp!.fadein = 0;
		if (Rand(4) !== 1) {
			EntityAlpha(G.TCp!.h, G.TCp!.a);
			// exe: arguments evaluated z, size, alpha, y, x
			argz = f32(z + Rnd(f32(-size * 3), f32(size * 3)));
			argsize = Rnd(10, 30);
			arga = Rnd(f32(0.9), 1.5);
			argy = f32(y + Rnd(size, f32(size * 3)));
			argx = f32(x + Rnd(f32(-size * 3), f32(size * 3)));
			p_add(argx, argy, argz, Cp_smoke, argsize, arga);
		}
	}
	//SFX
	sfx_3d(Int(x), Int(y), Int(z), G.sfx_explode[Rand(0, 3)]);
}

//### Combine
/** Function p_combine(source,target) */
export function p_combine(source: number, target: number): number {
	// quirk: the function returns at once; everything below is dead code in the original as well
	if (ALWAYS) return 0;
	let sx = 0;
	let sy = 0;
	let tx = 0;
	let ty = 0;
	let i = 0;
	let Tp_: Tp | null = null;
	if (p_itemposition(source)) {
		sx = Int(G.tmp_x);
		sy = Int(G.tmp_y);
		if (p_itemposition(target)) {
			tx = Int(G.tmp_x);
			ty = Int(G.tmp_y);
			//Add
			for (i = 0; i <= 15; i++) {
				Tp_ = New(Tp);
				Tp_.typ = Cp2d_cdot;
				Tp_.x = sx + 10 + Rand(20);
				Tp_.y = sy + 10 + Rand(20);
				Tp_.fx = tx + 10 + Rand(20);
				Tp_.fy = ty + 10 + Rand(20);
				Tp_.frame = Rand(0, 1);
				Tp_.fz = Rnd(2, 7);
				Tp_.age = (imul(255, 0x1000000) + 255 * 0x10000 + Rand(150, 255) * 0x100 + 0) | 0;
			}
		}
	}
	return 0;
}

//### Get Item Position in Inventory
/** Function p_itemposition(typ) */
export function p_itemposition(typ: number): number {
	let x = 0;
	let y = 0;
	let j = 0;
	let Titem_: Titem | null = null;

	x = 0;
	y = 0;
	j = 0;
	for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
		if (Titem_.parent_class === Cclass_unit) {
			if (Titem_.parent_id === G.g_player) {
				j = j + 1;
				if (j > G.in_scr_scr) {
					if (Titem_.typ === typ) {
						G.tmp_x = 236 + x;
						G.tmp_y = 63 + y;
						return 1;
					}
					x = x + 45;
					if (x >= 495) {
						x = 0;
						y = y + 45;
						if (y >= 225) break;
					}
				}
			}
		}
	}
	if (y < 225) {
		G.tmp_x = 236 + x;
		G.tmp_y = 63 + y;
		return 1;
	} else {
		return 0;
	}
}

//### Lightning
/** Function p_lightning(rx#,ry#,rz#,steps=5,size#=5.) */
export function p_lightning(rx: number, ry: number, rz: number, steps: number = 5, size: number = 5): void {
	let p: Handle = null;
	let thickness = 0;
	let argpitch = 0;
	let argyaw = 0;
	let argroll = 0;
	const h: Handle = null; // Local h: only used by the commented-out merge below
	let nh: Handle = null;
	let i = 0;
	let x1 = 0;
	let y1 = 0;
	let z1 = 0;
	let x2 = 0;
	let y2 = 0;
	let z2 = 0;

	p = CreatePivot();
	PositionEntity(p, rx, ry, rz);
	thickness = f32(0.3);
	for (i = 1; i <= steps; i++) {
		x1 = f32(EntityX(p));
		y1 = f32(EntityY(p));
		z1 = f32(EntityZ(p));
		// exe: arguments evaluated yaw, roll, pitch
		argyaw = Rnd(360);
		argroll = Rnd(360);
		argpitch = Rnd(360);
		RotateEntity(p, argpitch, argyaw, argroll);
		MoveEntity(p, 0, 0, f32(Rnd(1) * size));
		x2 = f32(EntityX(p));
		y2 = f32(EntityY(p));
		z2 = f32(EntityZ(p));
		nh = meshline(x1, y1, z1, x2, y2, z2, thickness);
		EntityBlend(nh, 3);
		thickness = f32(thickness * f32(0.6));

		//If i=1 Then
		//	h=nh
		//Else
		//	RotateMesh nh,EntityPitch(nh),EntityYaw(nh),EntityRoll(nh)
		//	PositionMesh nh,EntityX(nh),EntityY(nh),EntityZ(nh)
		//	PositionEntity nh,0,0,0
		//	AddMesh nh,h
		//	FreeEntity nh
		//EndIf

		G.tmp_ph = nh;
		p_add(0, 1, f32(0.2), Cp_fadeout);
	}

	//tmp_ph=h
	//p_add(0,1.,0.2,Cp_fadeout)

	FreeEntity(p);
	void h;
}

//### Projectile (Stuck)
/** Function p_projectile(oldh,typ,parent_class,parent_id) */
export function p_projectile(oldh: Handle, typ: number, parent_class: number, parent_id: number): void {
	let h: Handle = null;

	h = CopyEntity(Ditem_modelh(typ));
	//Adjust
	ScaleEntity(h, Ditem_size(typ, 0), Ditem_size(typ, 1), Ditem_size(typ, 2));
	EntityColor(h, Ditem_color(typ, 0), Ditem_color(typ, 1), Ditem_color(typ, 2));
	if (Ditem_fx(typ) !== 0) EntityFX(h, Ditem_fx(typ));
	if (Ditem_autofade(typ) !== 0) EntityAutoFade(h, f32(Ditem_autofade(typ) * G.set_viewfac), f32(f32(Ditem_autofade(typ) * G.set_viewfac) + 50));
	EntityAlpha(h, Ditem_alpha(typ));
	if (Ditem_shininess(typ) > 0.0) EntityShininess(h, Ditem_shininess(typ));
	if (Ditem_blend(typ) !== 0) EntityBlend(h, Ditem_blend(typ));
	//Position \ Rotation
	PositionEntity(h, EntityX(oldh, 1), EntityY(oldh, 1), EntityZ(oldh, 1));
	RotateEntity(h, EntityPitch(oldh, 1), EntityYaw(oldh, 1), EntityRoll(oldh, 1));
	//Setup Particle
	G.tmp_ph = h;
	p_add(0, 0, 0, Cp_stuck, 1, Ditem_alpha(typ));
	G.TCp!.age = parent_class;
	G.TCp!.timer = parent_id;
}

//### Fragment
/** Function p_fragment(h) */
export function p_fragment(h: Handle): void {
	let surfs = 0;
	let tris = 0;
	let j = 0;
	let v0 = 0;
	let v1 = 0;
	let v2 = 0;
	let surf: Surface | null = null;
	let verts = 0;
	let i = 0;
	let nh: Handle = null;
	let ns: Surface | null = null;
	let nv0 = 0;
	let nv1 = 0;
	let nv2 = 0;
	let argr = 0;
	let argg = 0;
	let argb = 0;

	surfs = CountSurfaces(h);
	for (i = 1; i <= surfs; i++) {
		surf = GetSurface(h, i);
		tris = CountTriangles(surf);
		verts = CountVertices(surf);
		// quirk: triangle indices are 0-based in Blitz; the loop runs 1..tris and so reads one past the last triangle
		for (j = 1; j <= tris; j++) {
			v0 = TriangleVertex(surf, j, 0);
			v1 = TriangleVertex(surf, j, 1);
			v2 = TriangleVertex(surf, j, 2);
			if (v0 <= verts && v1 <= verts && v2 <= verts) {
				con_add('addmesh');
				//Create New
				nh = CreateMesh();
				ns = CreateSurface(nh);
				// quirk: the new vertices are placed at the old vertices' normals (VertexNX/NY/NZ), not their positions
				nv0 = AddVertex(ns, VertexNX(surf, v0), VertexNY(surf, v0), VertexNZ(surf, v0));
				nv1 = AddVertex(ns, VertexNX(surf, v1), VertexNY(surf, v1), VertexNZ(surf, v1));
				nv2 = AddVertex(ns, VertexNX(surf, v2), VertexNY(surf, v2), VertexNZ(surf, v2));
				AddTriangle(ns, nv0, nv1, nv2);
				UpdateNormals(nh);
				// exe: arguments evaluated g, b, r
				argg = Rand(50);
				argb = Rand(50);
				argr = Rand(50);
				EntityColor(nh, argr, argg, argb);
				//tmp_ph=nh
				//p_add(0,1.,Rnd(0.05,0.2),Cp_fadeout)
				//PositionEntity nh,EntityX(h),EntityY(h),EntityZ(h)
			}
		}
	}
}

//### Parent
/** Function p_parent(id,Tp.Tp) */
export function p_parent(id: number, Tp_: Tp | null): void {
	if (con_unit(id)) {
		Tp_!.parentid = id;
		Tp_!.parentx = f32(EntityX(Tp_!.h) - EntityX(G.TCunit!.h));
		Tp_!.parentz = f32(EntityZ(Tp_!.h) - EntityZ(G.TCunit!.h));
	}
}

//### Settoparent
/** Function p_toparent(Tp.Tp) */
export function p_toparent(Tp_: Tp | null): void {
	if (con_unit(Tp_!.parentid)) {
		PositionEntity(Tp_!.h, f32(EntityX(G.TCunit!.h) + Tp_!.parentx), EntityY(Tp_!.h), f32(EntityZ(G.TCunit!.h) + Tp_!.parentz));
	}
}
