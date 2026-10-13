/**
 * Blitz3D collision, picking and entity maths, ported from the Blitz3D
 * source (github.com/blitz-research/blitz3d: blitz3d/collision.cpp, world.cpp,
 * object.cpp, entity.cpp, meshcollider.cpp, terrainrep.cpp, planemodel.cpp,
 * frustum.cpp, camera.cpp, geom.h and bbruntime/bbblitz3d.cpp).
 *
 * Usage sketch (mirrors the .bb code):
 *
 *   const world = new CollisionWorld();
 *   world.Collisions(Cworld_unitcol, Cworld_col, 2, 3);
 *   const h = world.CreateMesh(meshColliderFromB3d(model));
 *   PositionEntity(h, x, y, z); EntityType(h, Cworld_col); EntityPickMode(h, 2, 1);
 *   const p = world.CreatePivot(); EntityRadius(p, 10, 20); EntityType(p, Cworld_unitcol);
 *   MoveEntity(p, 0, 0, 5); world.UpdateWorld();
 *   if (world.LinePick(x, y, z, dx, dy, dz, 5)) { world.PickedX() ... }
 *
 * Known departures from bit-exact Blitz behaviour:
 *  - Blitz computes in 32-bit floats (x87 at 24-bit precision under D3D7);
 *    this port uses doubles, except where single precision changes discrete
 *    results (terrain byte quantisation, triangle-tree sort keys, TerrainY).
 *  - NaN times/normals from degenerate triangles are rejected explicitly.
 */
export * from './geom';
export * from './collision';
export * from './meshCollider';
export * from './terrainCollider';
export * from './entity';
export * from './world';
export * from './commands';
export * from './b3dCollider';
export * from './three';
