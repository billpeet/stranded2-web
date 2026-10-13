/**
 * The environment module (engine/environment) on a bb3d world.
 *
 * `Environment` is the existing port of e_environment.bb; it draws sea, sky,
 * ground, weather box, moon, flares and grass with its own Three objects.
 * `WorldEnvironment` lets it live in a bb3d World and gives game code the
 * entity handles the original keeps in globals:
 *
 *   original global   here                      what works on the handle
 *   cam               env.cam (you create it)   everything; the environment moves it through PositionEntity
 *   env_light         env.env_light             everything (a bb3d light)
 *   ter               env.entities.ter          TerrainY/TerrainHeight/ModifyTerrain/TerrainSize, picks,
 *                                               collisions, EntityPickMode, compare with PickedEntity()
 *   env_sea2          env.entities.env_sea2     EntityPickMode, picks, compare with a pick, EntityAlpha,
 *                                               Hide/ShowEntity
 *   env_sea           env.entities.env_sea      the same
 *   env_ground        env.entities.env_ground   the same
 *
 * `ter`, `env_sea`, `env_sea2` and `env_ground` are proxies: bb3d entities
 * with the right transform and collider that draw nothing themselves. Brush
 * commands on them (EntityColor, EntityTexture ...) are ignored; use the
 * Environment methods (wateralpha, watertexture, skytexture, e_terraincm ...).
 * Sky, weather box, moon and flares have no handle.
 *
 * Rendering: `env.render()` is RenderWorld followed by the under-water 2D
 * effect; it calls World.renderWorld, so every bb3d camera and entity is drawn.
 */
import type * as THREE from 'three';
import type { BlitzCamera } from '../engine/blitzSpace';
import { Vector } from '../engine/collision/geom';
import { PlaneCollider } from '../engine/collision/terrainCollider';
import { Environment, type EnvironmentOptions } from '../engine/environment/Environment';
import type { Tlensf } from '../engine/environment/envCore';
import { Cworld_height, Cworld_size, type Terrain } from '../engine/terrain';
import type { MapData } from '../formats/map';
import {
	CreateLight,
	EntityPickMode,
	FreeEntity,
	HideEntity,
	LightColor,
	PositionEntity,
	RotateEntity,
	ScaleEntity,
	ShowEntity,
	type Handle
} from './commands';
import { TerrainState } from './terrain';
import type { BBEntity, World } from './world';

export interface WorldEnvironmentOptions
	extends Omit<EnvironmentOptions, 'renderer' | 'scene' | 'camera' | 'ambient' | 'sun' | 'installTransparentSort'> {
	world: World;
	/** cam=CreateCamera() */
	cam: BBEntity;
	/** env_light=CreateLight(1) : LightColor env_light,50,50,50. Created when omitted. */
	env_light?: BBEntity;
}

export class WorldEnvironment extends Environment {
	readonly world: World;
	readonly cam: BBEntity;
	readonly env_light: BBEntity;
	/**
	 * The handles game code keeps in the globals of the same names. They are
	 * replaced when the environment is rebuilt (setMap, e_environment), so read
	 * them from here after those calls.
	 */
	readonly entities: { ter: Handle; env_sea: Handle; env_sea2: Handle; env_ground: Handle } = {
		ter: null,
		env_sea: null,
		env_sea2: null,
		env_ground: null
	};
	private terrainDirty = false;

	constructor(o: WorldEnvironmentOptions) {
		const world = o.world;
		if (!world.renderer) throw new Error('WorldEnvironment needs a world with a renderer');
		let light = o.env_light;
		if (!light) {
			light = CreateLight(1);
			LightColor(light, 50, 50, 50);
		}
		const cam = o.cam;
		super({
			...o,
			renderer: world.renderer,
			scene: world.scene,
			camera: cam.obj as BlitzCamera,
			ambient: world.ambient,
			sun: light.obj as THREE.DirectionalLight,
			installTransparentSort: false,
			// EntityVisible(cam,env_lenssun): any pickable obscurer of the bb3d world
			entityVisible:
				o.entityVisible ??
				((from, to) => world.lineOfSight(new Vector(from.x, from.y, from.z), new Vector(to.x, to.y, to.z), [cam])),
			// HideEntity cam / ShowEntity cam around the water reflection renders
			onWaterCamera:
				o.onWaterCamera ??
				((rendering) => {
					if (rendering) HideEntity(cam);
					else ShowEntity(cam);
				})
		});
		this.world = world;
		this.cam = cam;
		this.env_light = light;
		// Fog belongs to the cameras in bb3d (CameraFogMode/Range/Color).
		world.scene.fog = world.fog;
	}

	// ------------------------------------------------------------ EnvEngine overrides

	override positionCam(x: number, y: number, z: number): void {
		PositionEntity(this.cam, x, y, z);
		this.cam.obj.updateMatrixWorld();
	}

	override cameraFog(mode: number, near: number, far: number, r: number, g: number, b: number): void {
		const c = this.cam.camera!;
		c.fogMode = mode ? 1 : 0;
		if (mode) {
			c.fogNear = near;
			c.fogFar = far;
			c.fogColor = [r / 255, g / 255, b / 255];
		}
	}

	protected override renderScene(camera: BlitzCamera, main: boolean): void {
		if (main) this.world.renderWorld();
		else this.world.renderView(camera, { fog: false });
	}

	override buildEntities(flares: readonly Tlensf[]): void {
		super.buildEntities(flares);
		const e = this.entities;
		FreeEntity(e.env_sea);
		FreeEntity(e.env_sea2);
		FreeEntity(e.env_ground);
		const world = this.world;
		//env_sea=CreatePlane(10) : PositionEntity env_sea,0,1,0
		e.env_sea = world.createProxy('Plane', new PlaneCollider(), {
			onVisible: (v) => {
				if (this.env_sea) this.env_sea.mesh.visible = v;
			}
		});
		PositionEntity(e.env_sea, 0, 1, 0);
		//env_sea2=CreatePlane()
		e.env_sea2 = world.createProxy('Plane', new PlaneCollider(), {
			onVisible: (v) => {
				if (this.env_sea2) this.env_sea2.mesh.visible = v;
			},
			onAlpha: (a) => this.wateralpha(a)
		});
		//env_ground=CreatePlane(1)
		e.env_ground = world.createProxy('Plane', new PlaneCollider(), {
			onVisible: (v) => {
				if (this.env_ground) this.env_ground.mesh.visible = v;
			}
		});
		this.syncGround();
	}

	private syncGround(): void {
		if (this.entities.env_ground && this.terrain) PositionEntity(this.entities.env_ground, 0, this.terrain.groundY, 0);
	}

	override e_terrainground(fx = 1): void {
		super.e_terrainground(fx);
		this.syncGround();
	}

	override rotateSea2(roll: number): void {
		super.rotateSea2(roll);
		if (this.entities.env_sea2) RotateEntity(this.entities.env_sea2, 0, 0, roll);
	}

	// ------------------------------------------------------------ map

	override async setMap(map: MapData, terrain: Terrain): Promise<void> {
		this.adoptTerrain(terrain);
		await super.setMap(map, terrain);
		this.syncGround();
	}

	/**
	 * `ter` for an engine Terrain, with the transform e_terrain() gives it:
	 * ScaleEntity ter,Cworld_size,Cworld_height,Cworld_size
	 * PositionEntity ter,-(Cworld_size*ter_size/2),-(Cworld_height/2),-(Cworld_size*ter_size/2)
	 * EntityPickMode ter,2,1
	 */
	private adoptTerrain(terrain: Terrain): void {
		FreeEntity(this.entities.ter);
		const state = new TerrainState(terrain.collider);
		state.onModified = () => {
			this.terrainDirty = true;
		};
		const ter = this.world.createProxy(
			'Terrain',
			terrain.collider,
			{
				onVisible: (v) => {
					terrain.mesh.visible = v;
				}
			},
			state
		);
		ScaleEntity(ter, Cworld_size, Cworld_height, Cworld_size);
		PositionEntity(ter, -(Cworld_size * terrain.size) / 2, -(Cworld_height / 2), -(Cworld_size * terrain.size) / 2);
		EntityPickMode(ter, 2, 1);
		this.entities.ter = ter;
	}

	/**
	 * Rebuilds the terrain mesh after ModifyTerrain on `ter` (Blitz rebuilds its
	 * terrain when it renders). Called before every render of the main scene.
	 */
	flushTerrain(): void {
		if (this.terrainDirty && this.terrain) {
			this.terrainDirty = false;
			this.terrain.rebuild();
			this.syncGround();
		}
	}

	override update(): void {
		this.flushTerrain();
		super.update();
	}

	override render(): void {
		this.flushTerrain();
		super.render();
	}

	override dispose(): void {
		super.dispose();
		const e = this.entities;
		FreeEntity(e.ter);
		FreeEntity(e.env_sea);
		FreeEntity(e.env_sea2);
		FreeEntity(e.env_ground);
		e.ter = e.env_sea = e.env_sea2 = e.env_ground = null;
		this.world.scene.fog = this.world.fog;
	}
}
