/**
 * bb3d: the Blitz3D 3D command runtime of the Stranded II port.
 * See README.md in this directory.
 */
export * from './commands';
export { BBCamera, BBEntity, World, handleOf } from './world';
export type { EntityKind, ProxyHooks, RenderViewOptions, WorldOptions } from './world';
export { MeshModel, brushEquals } from './mesh';
export { TextureCanvas, TextureManager, adjustTexSize } from './texture';
export type { DecodedPixels, TextureFrame } from './texture';
export { Resources, defaultImageDecoder } from './resources';
export type { ImageDecoder } from './resources';
export { makeBlitzTransparentSort, orderSequence, renderOrderFor } from './drawOrder';
// WorldEnvironment (the environment module on a bb3d world) is imported from './environment' directly,
// so that this index does not pull in the environment module.
