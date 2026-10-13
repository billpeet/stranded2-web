/**
 * The demo scene of /dev/bb3d, written the way ported game code is written:
 * a Blitz3D script transliterated command by command. Nothing here touches
 * Three.js; everything goes through the bb3d commands (and the gfx2d buffer
 * commands for texture pixels).
 *
 * The Blitz original of each block is quoted in the `;` comments.
 */
import {
	AddTriangle,
	AddVertex,
	AmbientLight,
	AnimTime,
	Animate,
	Animating,
	BrushTexture,
	CameraClsColor,
	CameraFogColor,
	CameraFogMode,
	CameraFogRange,
	CameraPick,
	CameraProject,
	CameraRange,
	CameraViewport,
	CameraZoom,
	Collisions,
	CopyEntity,
	CountCollisions,
	CreateBrush,
	CreateCamera,
	CreateLight,
	CreateMesh,
	CreatePivot,
	CreatePlane,
	CreateSphere,
	CreateSprite,
	CreateSurface,
	CreateTerrain,
	CreateTexture,
	EntityAlpha,
	EntityAutoFade,
	EntityBlend,
	EntityClass,
	EntityColor,
	EntityFX,
	EntityName,
	EntityOrder,
	EntityPickMode,
	EntityRadius,
	EntityTexture,
	EntityType,
	EntityX,
	EntityY,
	EntityYaw,
	EntityZ,
	ExtractAnimSeq,
	FlipMesh,
	FreeBrush,
	Graphics3D,
	HideEntity,
	LightColor,
	LightRange,
	LoadAnimMesh,
	LoadMesh,
	LoadTexture,
	MeshHeight,
	ModifyTerrain,
	NameEntity,
	PickedEntity,
	PickedX,
	PickedY,
	PickedZ,
	PointEntity,
	PositionEntity,
	PositionTexture,
	ProjectedX,
	ProjectedY,
	RenderWorld,
	RotateEntity,
	RotateSprite,
	ScaleEntity,
	ScaleMesh,
	ScaleSprite,
	ScaleTexture,
	ShowEntity,
	SpriteViewMode,
	TerrainShading,
	TerrainY,
	TextureBlend,
	TextureBuffer,
	TextureFilter,
	TextureHeight,
	TranslateEntity,
	TrisRendered,
	TurnEntity,
	UpdateWorld,
	type Handle,
	type Texture
} from '../../../lib/s2/bb3d';
import type { MapData } from '../../../lib/s2/formats/map';
import { BackBuffer, LockBuffer, SetBuffer, UnlockBuffer, WritePixelFast } from '../../../lib/s2/gfx2d';

// includes/load_const.bb
const Cworld_size = 64;
const Cworld_height = 3200;
const Cworld_col = 100;
const Cworld_unitcol = 1;

const Sin = (deg: number) => Math.sin((deg * Math.PI) / 180);
const Cos = (deg: number) => Math.cos((deg * Math.PI) / 180);

/** Files the script loads; the page preloads them. */
export const MEDIA = [
	'sys\\gfx\\terraindirt.bmp',
	'sys\\gfx\\terrainstructure.bmp',
	'gfx\\water.jpg',
	'skies\\sky_fr.jpg',
	'skies\\sky_lf.jpg',
	'skies\\sky_bk.jpg',
	'skies\\sky_rt.jpg',
	'skies\\sky_up.jpg',
	'skies\\sky_dn.jpg',
	'sprites\\flare1_a.bmp',
	'sprites\\smoke0_a.bmp',
	'gfx\\palm01.b3d',
	'gfx\\palm03.b3d',
	'gfx\\bamboohut01.b3d',
	'gfx\\crate01.b3d',
	'gfx\\raptor.b3d'
];

export interface Input {
	forward: number;
	turn: number;
	jump: boolean;
	mouseX: number;
	mouseY: number;
	orbitYaw: number;
	orbitPitch: number;
	orbitDist: number;
}

// ---- globals of the "game" (load_vars.bb style)
let cam: Handle = null;
let cam2: Handle = null;
let ter: Handle = null;
let ter_size = 0;
let ter_tex_color: Texture | null = null;
let gfx_terraindirt: Texture | null = null;
let gfx_terstruc: Texture | null = null;
let gfx_water: Texture | null = null;
let env_sea: Handle = null;
let env_sky: Handle = null;
let env_light: Handle = null;
let lamp: Handle = null;
let flare: Handle = null;
let smoke: Handle = null;
let marker: Handle = null;
let unit: Handle = null;
let unit_model: Handle = null;
let unit_vy = 0;
let ani_move = 0;
let ani_idle = 0;
let env_seascr = 0;
let time = 0;
const objects: Handle[] = [];

export interface PickInfo {
	hit: boolean;
	x: number;
	y: number;
	z: number;
	cls: string;
	name: string;
}

export const state = {
	pick: { hit: false, x: 0, y: 0, z: 0, cls: '', name: '' } as PickInfo,
	unit: { x: 0, y: 0, z: 0, yaw: 0, collisions: 0, onGround: false },
	anim: { time: 0, animating: 0 },
	tris: 0,
	unitScreen: { x: 0, y: 0 },
	objects: 0
};

/** e_skybox(file$) of e_environment.bb */
function e_skybox(file: string): Handle {
	const ext = 'jpg';
	//Mesh
	const m = CreateMesh();
	const face = (suffix: string, v: number[][]) => {
		const tex = LoadTexture(`${file}_${suffix}.${ext}`, 49);
		const b = CreateBrush();
		if (tex !== null) BrushTexture(b, tex);
		const sf = CreateSurface(m, b);
		for (const q of v) AddVertex(sf, q[0], q[1], q[2], q[3], q[4]);
		AddTriangle(sf, 0, 1, 2);
		AddTriangle(sf, 0, 2, 3);
		FreeBrush(b);
	};
	// prettier-ignore
	{
		face('fr', [[-1, 1, -1, 0, 0], [1, 1, -1, 1, 0], [1, -1, -1, 1, 1], [-1, -1, -1, 0, 1]]);
		face('lf', [[1, 1, -1, 0, 0], [1, 1, 1, 1, 0], [1, -1, 1, 1, 1], [1, -1, -1, 0, 1]]);
		face('bk', [[1, 1, 1, 0, 0], [-1, 1, 1, 1, 0], [-1, -1, 1, 1, 1], [1, -1, 1, 0, 1]]);
		face('rt', [[-1, 1, 1, 0, 0], [-1, 1, -1, 1, 0], [-1, -1, -1, 1, 1], [-1, -1, 1, 0, 1]]);
		face('up', [[-1, 1, 1, 0, 1], [1, 1, 1, 0, 0], [1, 1, -1, 1, 0], [-1, 1, -1, 1, 1]]);
		face('dn', [[-1, -1, -1, 1, 0], [1, -1, -1, 1, 1], [1, -1, 1, 0, 1], [-1, -1, 1, 0, 0]]);
	}
	ScaleMesh(m, 1000, 1000, 1000);
	FlipMesh(m);
	return m;
}

/** A place on dry land near the map centre. */
function findLand(minY: number, from = 0): [number, number] {
	for (let r = from; r < ter_size * Cworld_size; r += 48) {
		for (let a = 0; a < 360; a += 20) {
			const x = Sin(a) * r;
			const z = Cos(a) * r;
			if (TerrainY(ter, x, 0, z) > minY) return [x, z];
		}
	}
	return [0, 0];
}

/** The parts of load_map, e_terrain and e_environment that build colour map, terrain, sea and sky. */
function worldFromScript(map: MapData): void {
	// ---------------------------------------------------------------- load_map: colormap
	//h=ReadInt(stream) : ter_tex_color=CreateTexture(h,h,256)
	const h = map.colormapSize;
	ter_tex_color = CreateTexture(h, h, 256);
	SetBuffer(TextureBuffer(ter_tex_color)!);
	LockBuffer(TextureBuffer(ter_tex_color)!);
	for (let x = 0; x <= h - 1; x++) {
		for (let y = 0; y <= h - 1; y++) {
			const o = (x * h + y) * 3;
			const r = map.colormap[o];
			const g = map.colormap[o + 1];
			const b = map.colormap[o + 2];
			const rgb = 255 * 0x1000000 + r * 0x10000 + g * 0x100 + b;
			WritePixelFast(x, y, rgb);
		}
	}
	UnlockBuffer(TextureBuffer(ter_tex_color)!);
	SetBuffer(BackBuffer());

	// ---------------------------------------------------------------- e_terrain(size,"generated")
	ter_size = map.terrainSize;
	ter = CreateTerrain(ter_size);
	NameEntity(ter, 'terrain');
	ScaleEntity(ter, Cworld_size, Cworld_height, Cworld_size);
	PositionEntity(ter, -((Cworld_size * ter_size) / 2), -(Cworld_height / 2), -((Cworld_size * ter_size) / 2));
	EntityPickMode(ter, 2, 1);
	TerrainShading(ter, 1);
	//load_map: For x=0 To ter_size : For z=0 To ter_size : ModifyTerrain(ter,x,z,ReadFloat(stream))
	for (let x = 0; x <= ter_size; x++) {
		for (let z = 0; z <= ter_size; z++) {
			ModifyTerrain(ter, x, z, map.heights[x * (ter_size + 1) + z]);
		}
	}
	//Use generated
	EntityTexture(ter, ter_tex_color, 0, 0);
	const texsize = TextureHeight(ter_tex_color);
	const scalefac = (ter_size / texsize) * Cworld_size * (texsize / Cworld_size);
	ScaleTexture(ter_tex_color, scalefac, -scalefac);
	//load_media.bb
	gfx_terstruc = LoadTexture('sys\\gfx\\terrainstructure.bmp', 256 + 512);
	ScaleTexture(gfx_terstruc, 2, 2);
	TextureBlend(gfx_terstruc, 5);
	gfx_terraindirt = LoadTexture('sys\\gfx\\terraindirt.bmp');
	ScaleTexture(gfx_terraindirt, 0.5, 0.5);
	TextureBlend(gfx_terraindirt, 5);
	//Case 2 (set_terrain)
	EntityColor(ter, 120, 120, 120);
	EntityTexture(ter, gfx_terraindirt, 0, 1);
	EntityTexture(ter, gfx_terstruc, 0, 2);

	// ---------------------------------------------------------------- e_environment
	//Sea 2: env_sea2=CreatePlane() : EntityTexture env_sea2,gfx_water : ScaleTexture gfx_water,200,200
	gfx_water = LoadTexture('gfx\\water.jpg', 256 + 512);
	env_sea = CreatePlane();
	NameEntity(env_sea, 'sea');
	EntityTexture(env_sea, gfx_water);
	ScaleTexture(gfx_water, 200, 200);
	EntityAlpha(env_sea, 0.75);
	EntityPickMode(env_sea, 2, 1);
	//Sky: EntityFX env_sky,1+8 : EntityOrder env_sky,3 : PositionEntity env_sky,0,500,0
	env_sky = e_skybox('skies\\sky');
	EntityFX(env_sky, 1 + 8);
	EntityOrder(env_sky, 3);
	PositionEntity(env_sky, 0, 500, 0);
}

/**
 * With `ext` the camera, terrain, sea, sky, light and fog come from a
 * WorldEnvironment (the port of e_environment.bb) instead of this script:
 * the handles are the ones game code would keep in cam, ter and env_sea2.
 */
export interface External {
	cam: Handle;
	ter: Handle;
	env_sea2: Handle;
	/** Replaces RenderWorld: env.update() : env.render() : env.updatePost() */
	render: () => void;
}
let external: External | null = null;

export function build(map: MapData, ext: External | null = null): void {
	external = ext;
	//Graphics3D set_scrx,set_scry,set_scrbit
	Graphics3D(800, 600, 32);

	//load_setup.bb
	TextureFilter('', 8); //Mipmapping in every Texture
	TextureFilter('_a', 2); //_a = Alpha
	TextureFilter('_m', 4); //_m = Masked
	TextureFilter('_c', 16 + 32); //_c = Clamp u and v

	if (ext === null) {
		//cam=CreateCamera() : CameraRange cam,1,3000
		cam = CreateCamera();
		CameraRange(cam, 1, 3000);
		CameraZoom(cam, 1);
		CameraClsColor(cam, 120, 160, 200);
		CameraFogMode(cam, 1);
		CameraFogRange(cam, 1500, 3000);
		CameraFogColor(cam, 150, 180, 210);

		//env_light=CreateLight(1) : LightColor env_light,50,50,50
		AmbientLight(110, 110, 110);
		env_light = CreateLight(1);
		LightColor(env_light, 190, 180, 160);
		RotateEntity(env_light, 50, 30, 0);
	} else {
		cam = ext.cam;
		ter = ext.ter;
		ter_size = map.terrainSize;
		env_sea = ext.env_sea2;
		NameEntity(ter, 'terrain');
		NameEntity(env_sea, 'sea');
		EntityPickMode(env_sea, 2, 1);
	}

	//collisions.bb: Collisions Cworld_unitcol,Cworld_col,2,3 ;UNITS -> WORLD (Radius->Polygon, slide)
	Collisions(Cworld_unitcol, Cworld_col, 2, 3);

	if (ext === null) worldFromScript(map);

	// ---------------------------------------------------------------- objects: h=CopyEntity(Dobject_modelh(typ))
	const [sx, sz] = findLand(60);
	const protos = ['gfx\\palm01.b3d', 'gfx\\palm03.b3d', 'gfx\\crate01.b3d', 'gfx\\bamboohut01.b3d'].map((f) => {
		const m = LoadMesh(f);
		if (m !== null) HideEntity(m);
		return m;
	});
	const place = (typ: number, x: number, z: number, scale: number, yaw: number, name: string) => {
		if (protos[typ] === null) return null;
		if (TerrainY(ter, x, 0, z) < 5) return null;
		const o = CopyEntity(protos[typ]);
		NameEntity(o, name);
		ScaleEntity(o, scale, scale, scale);
		PositionEntity(o, x, TerrainY(ter, x, 0, z), z);
		RotateEntity(o, 0, yaw, 0);
		EntityType(o, Cworld_col);
		EntityPickMode(o, 2, 1);
		objects.push(o);
		return o;
	};
	for (let i = 0; i < 24; i++) {
		const a = i * 47;
		const r = 220 + ((i * 97) % 500);
		const o = place(i % 2, sx + Sin(a) * r, sz + Cos(a) * r, 1.6 + (i % 3) * 0.4, a * 3, `palm ${i}`);
		//EntityAutoFade h,near,far (Dobject_autofade)
		if (o !== null) EntityAutoFade(o, 900, 1300);
	}
	for (let i = 0; i < 5; i++) place(2, sx + 90 + i * 34, sz + 120 + (i % 2) * 20, 2.2, i * 20, `crate ${i}`);
	const hut = place(3, sx - 150, sz + 160, 2, 30, 'hut');

	// ---------------------------------------------------------------- unit: pivot with radius, model as child
	unit = CreatePivot();
	NameEntity(unit, 'unit');
	//EntityRadius Tunit\h,Dunit_colxr(typ),Dunit_colyr(typ) : EntityType Tunit\h,Cworld_unitcol
	EntityRadius(unit, 15, 30);
	PositionEntity(unit, sx, TerrainY(ter, sx, 0, sz) + 200, sz);
	EntityType(unit, Cworld_unitcol);
	unit_model = LoadAnimMesh('gfx\\raptor.b3d', unit);
	if (unit_model !== null) {
		ScaleEntity(unit_model, 0.5, 0.5, 0.5);
		PositionEntity(unit_model, 0, -30, 0);
		EntityPickMode(unit_model, 2, 0);
		NameEntity(unit_model, 'raptor');
		//ani_move=2,3,0.06 : ani_idle1=4,8,0.02
		ani_move = ExtractAnimSeq(unit_model, 2, 3);
		ani_idle = ExtractAnimSeq(unit_model, 4, 8);
		Animate(unit_model, 1, 0.02, ani_idle);
	}

	// ---------------------------------------------------------------- light, sprites
	lamp = CreateLight(2);
	LightColor(lamp, 255, 150, 40);
	LightRange(lamp, 220);
	flare = CreateSprite(lamp);
	EntityTexture(flare, LoadTexture('sprites\\flare1_a.bmp'));
	EntityBlend(flare, 3);
	ScaleSprite(flare, 30, 30);
	EntityFX(flare, 1 + 8);
	NameEntity(flare, 'flare');
	//smoke over the hut: an upright sprite
	smoke = CreateSprite();
	EntityTexture(smoke, LoadTexture('sprites\\smoke0_a.bmp'));
	ScaleSprite(smoke, 25, 60);
	SpriteViewMode(smoke, 4);
	EntityAlpha(smoke, 0.7);
	if (hut !== null) PositionEntity(smoke, EntityX(hut), EntityY(hut) + 120 + MeshHeight(hut), EntityZ(hut));

	//pick marker
	marker = CreateSphere(8);
	EntityColor(marker, 255, 40, 40);
	EntityFX(marker, 1);
	ScaleEntity(marker, 4, 4, 4);
	HideEntity(marker);

	//second camera: a map view in the corner, drawn after the main one
	cam2 = CreateCamera();
	CameraViewport(cam2, 590, 10, 200, 150);
	CameraRange(cam2, 10, 6000);
	CameraClsColor(cam2, 20, 30, 40);
	EntityOrder(cam2, -1);
	RotateEntity(cam2, 90, 0, 0);

	state.objects = objects.length;
}

/** One pass of the main loop: input, movement, UpdateWorld, camera, RenderWorld. */
export function loop(input: Input, f: number): void {
	time += f;

	// ---- unit movement (game.bb / handle_units.bb style)
	TurnEntity(unit, 0, input.turn * 3 * f, 0);
	const yaw = EntityYaw(unit);
	const speed = input.forward * 2.5 * f;
	//gravity
	unit_vy -= 0.25 * f;
	if (input.jump && state.unit.onGround) unit_vy = 5;
	TranslateEntity(unit, -Sin(yaw) * speed, unit_vy * f, Cos(yaw) * speed);
	if (unit_model !== null) {
		//Animate Tunit\mh,1,speed,seq when the state changes
		const moving = input.forward !== 0 ? 1 : 0;
		if (moving !== state.anim.animating) {
			Animate(unit_model, 1, moving ? 0.06 : 0.02, moving ? ani_move : ani_idle, 4);
			state.anim.animating = moving;
		}
	}

	//lamp circles the unit, flare rotates, sea scrolls
	PositionEntity(lamp, EntityX(unit) + Sin(time * 2) * 120, EntityY(unit) + 40, EntityZ(unit) + Cos(time * 2) * 120);
	RotateSprite(flare, time * 3);
	if (external === null) {
		env_seascr += 0.0005 * f;
		PositionTexture(gfx_water, env_seascr, env_seascr);
	}

	UpdateWorld();

	//terrain: units stand on TerrainY (the terrain has no collision type in the game)
	const ty = TerrainY(ter, EntityX(unit), 0, EntityZ(unit)) + 30;
	state.unit.onGround = false;
	if (EntityY(unit) <= ty) {
		PositionEntity(unit, EntityX(unit), ty, EntityZ(unit));
		unit_vy = 0;
		state.unit.onGround = true;
	} else if (CountCollisions(unit) > 0 && unit_vy < 0) {
		//standing on an object
		unit_vy = 0;
		state.unit.onGround = true;
	}

	// ---- camera: orbit around the unit
	const d = input.orbitDist;
	PositionEntity(
		cam,
		EntityX(unit) - Sin(input.orbitYaw) * Cos(input.orbitPitch) * d,
		EntityY(unit) + Sin(input.orbitPitch) * d,
		EntityZ(unit) - Cos(input.orbitYaw) * Cos(input.orbitPitch) * d
	);
	PointEntity(cam, unit);
	//keep the camera above the ground
	const cy = TerrainY(ter, EntityX(cam), 0, EntityZ(cam)) + 10;
	if (EntityY(cam) < cy) {
		PositionEntity(cam, EntityX(cam), cy, EntityZ(cam));
		PointEntity(cam, unit);
	}
	if (external === null) PositionEntity(env_sky, EntityX(cam), 500, EntityZ(cam));
	PositionEntity(cam2, EntityX(unit), EntityY(unit) + 1500, EntityZ(unit));

	// ---- picking under the mouse
	const pe = CameraPick(cam, input.mouseX, input.mouseY);
	if (pe !== null) {
		state.pick = { hit: true, x: PickedX(), y: PickedY(), z: PickedZ(), cls: EntityClass(pe), name: EntityName(pe) };
		ShowEntity(marker);
		PositionEntity(marker, PickedX(), PickedY(), PickedZ());
	} else {
		state.pick = { ...state.pick, hit: false, cls: '', name: '' };
		HideEntity(marker);
	}
	void PickedEntity;

	CameraProject(cam, EntityX(unit), EntityY(unit) + 40, EntityZ(unit));
	state.unitScreen = { x: ProjectedX(), y: ProjectedY() };
	state.unit = {
		...state.unit,
		x: EntityX(unit),
		y: EntityY(unit),
		z: EntityZ(unit),
		yaw,
		collisions: CountCollisions(unit)
	};
	if (unit_model !== null) state.anim.time = AnimTime(unit_model) + 0 * Animating(unit_model);

	if (external === null) RenderWorld();
	else external.render();
	state.tris = TrisRendered();
}

/** For the page's debug hooks. */
export function handles() {
	return { cam, cam2, ter, env_sea, env_sky, env_light, lamp, flare, smoke, marker, unit, unit_model, objects };
}
