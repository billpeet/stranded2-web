# bb3d: the Blitz3D 3D command runtime

Ported game code calls the Blitz3D 3D commands under their original names,
with the original argument order and defaults:

```
PositionEntity TCunit\h,x#,y#,z#              PositionEntity(TCunit.h, x, y, z);
If EntityPick(cam,50)=TCobject\h Then         if (EntityPick(cam, 50) === TCobject.h) {
h=CopyEntity(Dobject_modelh(typ))             h = CopyEntity(Dobject_modelh[typ]);
If h<>0 Then FreeEntity h : h=0               if (h !== null) { FreeEntity(h); h = null; }
ter_tex=CreateTexture(64,64)                  ter_tex = CreateTexture(64, 64);
SetBuffer TextureBuffer(ter_tex)              SetBuffer(TextureBuffer(ter_tex)!);   // SetBuffer is gfx2d's
```

```ts
import { World, CreateCamera, LoadMesh, UpdateWorld, RenderWorld /* ... */ } from '$lib/s2/bb3d';
```

`commands.ts` is the command list (every 3D command of `bbblitz3d.cpp` except
MD2 and BSP); read its doc comments for per-command notes.

## Setup

```ts
const renderer = new THREE.WebGLRenderer({ canvas });
configureRenderer(renderer);                 // engine/blitzSpace.ts, before anything is drawn
const world = new World({ vfs, renderer, width: set_scrx, height: set_scry });
await world.preload('all');                  // or a list of paths
```

- There is one current world (`World.current`, set by the constructor); the
  commands act on it. `Graphics3D(w, h)` only sets its logical screen size.
- **Loading is synchronous after `preload`.** `LoadMesh`, `LoadAnimMesh`,
  `LoadTexture`, `LoadAnimTexture`, `LoadSprite` return `null` for a file that
  does not exist, exactly as Blitz returns 0, and also for a file that exists
  but was not preloaded (those paths collect in `world.resources.missed`).
  `await world.ensureLoaded(path)` adds a file later (map attachments);
  `world.resources.addImage/addModel` register data that is already decoded.
- A world without a renderer (tests, tools) does everything except draw.

## Handles

| Blitz | here | "0" |
| --- | --- | --- |
| entity | `BBEntity` (`Handle = BBEntity \| null`) | `null` |
| texture | `Texture` | `null` |
| brush | `Brush` (engine/anim/brush.ts) | `null` |
| surface | `Surface` | - |
| 2D buffer of a texture | `Canvas2D` from gfx2d (`TextureBuffer`) | `null` |

A `BBEntity` owns both halves of an entity:

- `h.ent`, the collision module's `Entity`: a line-by-line port of Blitz's
  Entity/Object. It is the **authority** for transforms, hierarchy, collision
  and picking. `EntityX` and friends read it.
- `h.obj`, the `THREE.Object3D` that is drawn: a mirror of `ent`'s local
  transform and parent, in Blitz coordinates (see engine/blitzSpace.ts).

Never write `h.obj.position` and the like: go through the commands. The
commands mirror immediately; the two things that move entities on their own
are handled inside `UpdateWorld` (collision response, animation).

Children are in the same order on both sides (`CountChildren`, `GetChild`,
`FindChild` use the Blitz order). `LoadAnimMesh` gives every node and bone of
the file its own entity.

`FreeEntity` frees children too and sets `h.freed` on all of them.
`EntityExists(h)` is `h !== null && !h.freed`. Using a freed or null entity in
any other command **throws** (Blitz would crash or corrupt memory): treat it
as a porting bug. `FreeEntity(null)` and freeing twice are harmless. Blitz code
that tests `If h<>0` ports to `if (h !== null)` and must null its variable
after `FreeEntity`, as the original does.

Commands returning truth values return `1`/`0`.

## The frame

```
... game logic: PositionEntity / TranslateEntity / Animate / picks ...
UpdateWorld()      // per enabled entity, in hierarchy order: clear its collisions,
                   // advance its animation, collide it, record its velocity
... logic that reads EntityCollided / CountCollisions, moves cameras ...
RenderWorld()      // flush edited meshes/terrains/textures, then every camera
```

`RenderWorld` draws the cameras highest `EntityOrder` first; per camera:
viewport and clear (`CameraViewport`, `CameraClsMode/Color`), fog, auto fade,
then models with order > 0 (highest first, no depth test), the unordered scene
(opaque, then transparent far-to-near by entity origin), then order < 0. Each
distinct order value is one pass over the scene (`drawOrder.ts`).

With the environment module (`WorldEnvironment`, below) the loop is

```
if (!env.frameBegin(now)) return;
... logic ... UpdateWorld() ...
env.update(); env.render(); env.updatePost();   // env.render() = RenderWorld + under-water 2D effect
```

## Meshes

- `LoadMesh` twice gives two independent meshes that share geometry and
  collider until one is edited. `CopyEntity` copies **share the mesh**, as in
  Blitz: `ScaleMesh` on a copy changes them all. `CopyMesh` is independent.
- Surface commands (`GetSurface`, `VertexX`, `AddVertex`, `ScaleMesh`,
  `FlipMesh`, `UpdateNormals`, `AddMesh`, `PaintSurface` ...) work on loaded
  meshes too; the first one unpacks the mesh into editable surfaces. Render
  geometry is rebuilt at the next `RenderWorld`, the collider at the next pick
  or collision.
- Polygon picking/collision (`EntityPickMode h,2`, `Collisions a,b,2,r`) works
  for loaded meshes, runtime meshes, primitives, planes and terrains. Boned
  meshes collide in their bind pose, as in Blitz.

## Textures

- `LoadTexture` twice with the same file and flags shares the image (and its
  pixels) but not blend/scale/position/rotation, as in Blitz.
- `TextureFilter` starts with Blitz's default (`""` adds colour + mipmap); the
  game's own filters come from its `load_setup.bb` port.
- Dimensions are rounded **up** to powers of two; loaded images are stretched
  (nearest neighbour) as `ddUtil::loadSurface` does.
- `TextureBuffer(tex, frame)` is a gfx2d buffer over the texture's pixels:
  `SetBuffer`, `LockBuffer`, `WritePixelFast`, `ReadPixelFast`, `CopyRect`,
  `DrawBlock`, `Cls` ... write straight into it and the next `RenderWorld`
  uploads it. Textures with the alpha or mask flag keep the alpha byte of the
  ARGB values written; others are opaque.
- `CopyRect ... BackBuffer(),TextureBuffer(t)` (motion blur) needs the scene
  grabber: `gfx2d.setSceneGrabber(() => world.grabScene())`.

## Game globals

`cam`, lights, pivots, units, objects: plain bb3d entities, created by the
ported code (`cam = CreateCamera()`).

Sea, sky, ground, terrain, sun, fog are drawn by the existing environment
module (engine/environment, the port of e_environment.bb). `WorldEnvironment`
(environment.ts) runs it on a bb3d world and provides the handles:

```ts
import { WorldEnvironment } from '$lib/s2/bb3d/environment';   // not part of the index
cam = CreateCamera();
const env = new WorldEnvironment({ world, cam, vfs, textures, meshes });   // TextureCache / MeshCache of engine/
const terrain = new Terrain(map.terrainSize, map.heights, material); world.scene.add(terrain.mesh);
await env.setMap(map, terrain);
ter = env.entities.ter; env_sea = env.entities.env_sea;
env_sea2 = env.entities.env_sea2; env_ground = env.entities.env_ground; env_light = env.env_light;
```

`ter`, `env_sea`, `env_sea2`, `env_ground` are proxy entities: right transform
and collider, nothing drawn. On them work `TerrainY/TerrainHeight/TerrainSize/
ModifyTerrain(ter, ...)`, `EntityPickMode`, all picks and comparisons with a
pick (`If in_pe=env_sea2`), collisions, `Hide/ShowEntity`, `EntityAlpha
env_sea2`. Brush commands on them are ignored; use the `Environment` methods
(`wateralpha`, `watertexture`, `skytexture`, `e_terraincm` ...). The handles
are replaced by `setMap` / `e_environment`: re-read them afterwards. Sky,
weather box, moon and flares have no handle.

A terrain can also be built entirely with bb3d (`CreateTerrain`,
`ModifyTerrain`, `EntityTexture ter,tex,0,layer`): see
`src/routes/dev/bb3d/scene.ts`, which is the reference for how ported code
looks.

## Not exact

- Maths is in doubles (Blitz: 32-bit floats), except where the collision
  module already rounds (terrain heights, TerrainY, triangle tree order).
  Vertex data is stored as floats.
- No render tweening: `CaptureWorld` is a no-op and `RenderWorld`'s tween is
  ignored (the game renders with tween 1).
- Terrains are drawn at full detail (`TerrainDetail` is stored only); picks,
  collisions and `TerrainY` are exact.
- Planes draw a quad around the camera out past the far plane instead of the
  clipped frustum polygon; `CreatePlane`'s segment count is ignored.
- Lighting is per fragment (Direct3D: per vertex). Spot lights use Three's
  cone falloff. Sprites that lose full-bright through `EntityFX` are lit with
  a facing normal (Blitz: null normal, ambient only).
- Entities with the same `EntityOrder` draw all their opaque surfaces before
  their transparent ones (Blitz: entity by entity, in an unspecified order).
  More than 31 distinct non-zero orders at once share a pass. Objects of the
  environment module use `renderOrderFor` inside the unordered pass, so its
  flares draw before bb3d entities with negative orders.
- Cube map textures (flag 128) exist as six 2D buffers (`SetCubeFace`) but are
  sampled as a plain texture (face 1). The water reflection is implemented by
  the environment module itself.
- `WireFrame` draws lines; `TrisRendered` is then 0.
- `.dds` textures, `.x`/`.3ds` meshes, MD2, BSP: not loaded (null). Mirrors
  (`CreateMirror` is a pivot), `SetAnimKey`, `SetCubeMode`, `MeshCullBox`,
  `HWMultiTex`, `Dither`, `AntiAlias`, `WBuffer`, `LoaderMatrix`: accepted, no
  effect. `ClearWorld` does not free textures.
- `EmitSound`/`CreateListener`: the listener is a pivot (`world.listener`,
  parameters in its `userData`); the audio layer reads it.
- `Surface::updateNormals` leaves a zero normal on vertices no triangle uses
  (Blitz: NaN). Triangle indices are 16 bit, as in Blitz.
- A changed number of visible lights recompiles lit shaders once (a short
  hitch when a `CreateLight` appears for the first time).
