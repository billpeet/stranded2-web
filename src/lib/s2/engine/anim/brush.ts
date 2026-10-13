import * as THREE from 'three';
import {
	TEX_CUBE,
	TEX_SPHERE,
	TEXBLEND_ADD,
	TEXBLEND_ALPHA,
	TEXBLEND_DOT3,
	TEXBLEND_MULTIPLY,
	TEXBLEND_MULTIPLY2,
	type TextureHandle
} from '../textures';

/**
 * Blitz3D brushes and their Direct3D 7 fixed-function render state, turned
 * into Three.js materials.
 *
 * Sources: blitz3d/brush.cpp (combining and Brush::getBlend),
 * gxruntime/gxscene.cpp (setRenderState, setTexState), blitz3d/world.cpp
 * (opaque and transparent passes).
 */

/** Blitz3D EntityFX / brush FX flags. */
export const FX_FULLBRIGHT = 1;
export const FX_VERTEXCOLOR = 2;
export const FX_FLATSHADED = 4;
export const FX_NOFOG = 8;
export const FX_TWOSIDED = 16;
export const FX_VERTEXALPHA = 32;

/** Resolved blend of a surface (gxScene::BLEND_*). EntityBlend takes 1..3; 0 on a brush means "not set". */
export const BLEND_REPLACE = 0;
export const BLEND_ALPHA = 1;
export const BLEND_MULTIPLY = 2;
export const BLEND_ADD = 3;

export const MAX_TEXTURES = 8;

export class Brush {
	/** 0..1 */
	r = 1;
	g = 1;
	b = 1;
	alpha = 1;
	shininess = 0;
	/** 0 = not set */
	blend = 0;
	fx = 0;
	/** Up to 8 layers; holes allowed. A texture whose image failed to load is stored as undefined. */
	texs: (TextureHandle | undefined)[] = [];

	clone(): Brush {
		const b = new Brush();
		b.r = this.r;
		b.g = this.g;
		b.b = this.b;
		b.alpha = this.alpha;
		b.shininess = this.shininess;
		b.blend = this.blend;
		b.fx = this.fx;
		b.texs = this.texs.slice();
		return b;
	}

	/** Brush::setTexture */
	setTexture(index: number, t: TextureHandle | undefined): void {
		if (index < 0 || index >= MAX_TEXTURES) return;
		while (this.texs.length <= index) this.texs.push(undefined);
		this.texs[index] = t;
	}

	/** Index of the last used layer + 1 (Brush::Rep::max_tex). */
	maxTex(): number {
		let n = 0;
		for (let k = 0; k < this.texs.length && k < MAX_TEXTURES; k++) if (this.texs[k]) n = k + 1;
		return n;
	}

	/**
	 * Brush( const Brush &a,const Brush &b ): a surface brush `a` seen through
	 * an entity brush `b`. Colours and alpha multiply, shininess adds, FX flags
	 * are OR-ed, and b's blend and textures replace a's where b has them.
	 */
	static combine(a: Brush, b: Brush): Brush {
		const c = a.clone();
		c.r *= b.r;
		c.g *= b.g;
		c.b *= b.b;
		c.alpha *= b.alpha;
		c.shininess += b.shininess;
		if (b.blend) c.blend = b.blend;
		c.fx |= b.fx;
		const n = Math.max(a.maxTex(), b.maxTex());
		for (let k = 0; k < n; k++) if (b.texs[k]) c.setTexture(k, b.texs[k]);
		return c;
	}

	/** True when layer 0 is a masked texture: the surface is alpha-tested (FX_ALPHATEST). */
	alphaTest(): boolean {
		return !!this.texs[0]?.image.masked;
	}

	/** Brush::getBlend: the blend the surface is drawn with. Anything but BLEND_REPLACE is a transparent surface. */
	getBlend(): number {
		const maxTex = this.maxTex();
		// Texture::isTransparent: alpha flag without mask flag.
		const transparent = (t: TextureHandle | undefined) =>
			!!t && t.image.transparent && !t.image.masked;
		if (this.blend) {
			if (this.blend !== BLEND_ALPHA) return this.blend;
			for (let k = 0; k < maxTex; k++) if (transparent(this.texs[k])) return BLEND_ALPHA;
		} else if (maxTex === 1 && transparent(this.texs[0])) {
			// single transparent texture?
			return BLEND_ALPHA;
		}
		// vertex alpha or entityalpha?
		if (this.fx & FX_VERTEXALPHA || this.alpha < 1) return BLEND_ALPHA;
		return BLEND_REPLACE;
	}
}

interface Stage {
	tex: TextureHandle;
	blend: number;
	coords: number;
	/** D3DTSS_ALPHAOP is MODULATE for textures with the alpha (or mask) flag, else the texture alpha is ignored. */
	alphaOp: boolean;
	sphere: boolean;
}

/** The texture stages gxScene::setRenderState enables: layers with an image and a non-zero blend. */
function stagesOf(brush: Brush): Stage[] {
	const out: Stage[] = [];
	const n = brush.maxTex();
	for (let k = 0; k < n; k++) {
		const tex = brush.texs[k];
		if (!tex || !tex.blend) continue;
		out.push({
			tex,
			blend: tex.blend,
			coords: tex.coords & 1,
			alphaOp: tex.image.transparent,
			// Cube maps (flag 128) are not supported; they are sampled as plain textures.
			sphere: (tex.image.flags & (TEX_SPHERE | TEX_CUBE)) === TEX_SPHERE
		});
	}
	return out;
}

const materials = new Map<string, THREE.Material>();

/** Alpha is quantised to the 8 bits the frame buffer can show, which bounds the cache under EntityAutoFade. */
function q8(a: number): number {
	return Math.round(Math.min(1, Math.max(0, a)) * 255);
}

/**
 * The material that draws a surface with this (already combined) brush.
 * Materials are shared: equal render states give the same object.
 *
 * `hasVertexColors` tells whether the geometry has a colour attribute; Blitz
 * vertices without colours are opaque white.
 */
export function brushMaterial(brush: Brush, hasVertexColors: boolean): THREE.Material {
	const stages = stagesOf(brush);
	const blend = brush.getBlend();
	const alphaTest = brush.alphaTest();
	const fx = brush.fx & 63;
	const vertexColor = (fx & FX_VERTEXCOLOR) !== 0;

	// D3DRENDERSTATE_COLORVERTEX: with FX 2 the vertex colour (including its
	// alpha) replaces the material colour and alpha altogether.
	const r = vertexColor ? 1 : brush.r;
	const g = vertexColor ? 1 : brush.g;
	const b = vertexColor ? 1 : brush.b;
	const a = vertexColor ? 255 : q8(brush.alpha);
	// The alpha reference follows the brush alpha even then (gxScene::setRenderState).
	const alphaRef = alphaTest ? (fx & FX_VERTEXALPHA ? 0 : Math.trunc(128 * brush.alpha)) : -1;

	const stageKey = stages
		.map((s) => `${s.tex.id}:${s.blend}:${s.coords}:${s.alphaOp ? 1 : 0}:${s.sphere ? 1 : 0}`)
		.join(',');
	const key = `${r},${g},${b},${a},${brush.shininess},${blend},${fx},${alphaRef},${
		vertexColor && hasVertexColors ? 1 : 0
	}|${stageKey}`;
	let m = materials.get(key);
	if (m) return m;

	const params: THREE.MeshLambertMaterialParameters = {
		color: new THREE.Color(r, g, b),
		opacity: a / 255,
		side: fx & FX_TWOSIDED ? THREE.DoubleSide : THREE.FrontSide,
		vertexColors: vertexColor && hasVertexColors,
		fog: (fx & FX_NOFOG) === 0
	};
	if (alphaRef >= 0) {
		// D3DCMP_GREATER against alpharef/255. Three discards below the value,
		// so the reference is nudged up to exclude equality.
		params.alphaTest = (alphaRef + 0.5) / 255;
	}
	if (blend !== BLEND_REPLACE) {
		// Transparent surfaces are drawn after the opaque ones, far to near,
		// with depth test but no depth write (World::render, ZMODE_CMPONLY).
		params.transparent = true;
		params.depthWrite = false;
		if (blend === BLEND_MULTIPLY) {
			params.blending = THREE.CustomBlending;
			params.blendSrc = THREE.DstColorFactor;
			params.blendDst = THREE.ZeroFactor;
		} else if (blend === BLEND_ADD) {
			params.blending = THREE.CustomBlending;
			params.blendSrc = THREE.SrcAlphaFactor;
			params.blendDst = THREE.OneFactor;
		} else {
			params.blending = THREE.NormalBlending;
		}
	}

	let kind: 'basic' | 'lambert' | 'phong';
	if (fx & FX_FULLBRIGHT) {
		// Lights off and white ambient: the surface shows its own colour.
		kind = 'basic';
		m = new THREE.MeshBasicMaterial(params);
	} else if (brush.shininess > 0) {
		// material.specular = min(shininess,1), material.power = shininess*128
		kind = 'phong';
		const s = Math.min(brush.shininess, 1);
		const pm = new THREE.MeshPhongMaterial(params);
		pm.specular = new THREE.Color(s, s, s);
		pm.shininess = brush.shininess * 128;
		pm.flatShading = (fx & FX_FLATSHADED) !== 0;
		m = pm;
	} else {
		kind = 'lambert';
		const lm = new THREE.MeshLambertMaterial(params);
		lm.flatShading = (fx & FX_FLATSHADED) !== 0;
		m = lm;
	}

	const config = `blitz|${kind}|${stages
		.map((s) => `${s.blend}:${s.coords}:${s.alphaOp ? 1 : 0}:${s.sphere ? 1 : 0}`)
		.join(',')}`;
	m.customProgramCacheKey = () => config;
	m.onBeforeCompile = (shader) => patchShader(shader, kind, stages);
	materials.set(key, m);
	return m;
}

type Shader = Parameters<THREE.Material['onBeforeCompile']>[0];

function replaceOnce(src: string, find: string, replacement: string): string {
	if (!src.includes(find)) throw new Error(`Blitz material: shader anchor "${find}" not found`);
	return src.replace(find, () => replacement);
}

/**
 * Rewrites a Three.js basic/lambert/phong shader into the Direct3D
 * fixed-function pipeline Blitz3D sets up:
 * lit vertex colour -> texture stages in order -> + specular -> fog.
 */
function patchShader(shader: Shader, kind: 'basic' | 'lambert' | 'phong', stages: Stage[]): void {
	let vs = shader.vertexShader;
	let fs = shader.fragmentShader;

	// --- vertex: one UV per stage ---
	let vPars = '';
	let vMain = '';
	let fPars = '';
	let fSample = '';
	let fCombine = '';
	if (stages.some((s) => s.coords === 1 && !s.sphere)) {
		vPars += '#ifndef USE_UV1\nattribute vec2 uv1;\n#endif\n';
	}
	if (stages.some((s) => s.sphere)) {
		// D3DTSS_TCI_CAMERASPACENORMAL with sphere_mat: (nx*.5+.5, -ny*.5+.5).
		// View space here equals Blitz camera space (see blitzSpace.ts).
		vMain +=
			kind === 'basic'
				? '#if defined ( USE_ENVMAP ) || defined ( USE_SKINNING )\n\tvec3 blitzN = normalize( transformedNormal );\n#else\n\tvec3 blitzN = normalize( normalMatrix * normal );\n#endif\n'
				: '\tvec3 blitzN = normalize( transformedNormal );\n';
	}
	stages.forEach((s, i) => {
		shader.uniforms[`blitzTex${i}`] = { value: s.tex.image.texture };
		vPars += `varying vec2 vBlitzUv${i};\n`;
		fPars += `uniform sampler2D blitzTex${i};\nvarying vec2 vBlitzUv${i};\n`;
		if (s.sphere) {
			vMain += `\tvBlitzUv${i} = vec2( blitzN.x * 0.5 + 0.5, - blitzN.y * 0.5 + 0.5 );\n`;
		} else {
			// The matrix object is shared with the texture handle, so ScaleTexture,
			// PositionTexture and RotateTexture show without touching the material.
			shader.uniforms[`blitzTexMat${i}`] = { value: s.tex.matrix };
			vPars += `uniform mat3 blitzTexMat${i};\n`;
			vMain += `\tvBlitzUv${i} = ( blitzTexMat${i} * vec3( ${s.coords ? 'uv1' : 'uv'}, 1.0 ) ).xy;\n`;
		}
		fSample += `\tvec4 blitzT${i} = texture2D( blitzTex${i}, vBlitzUv${i} );\n`;
		if (s.alphaOp) fSample += `\tdiffuseColor.a *= blitzT${i}.a;\n`;
		const t = `blitzT${i}`;
		switch (s.blend) {
			case TEXBLEND_ALPHA: // D3DTOP_BLENDTEXTUREALPHA
				fCombine += `\tblitzC = mix( blitzC, ${t}.rgb, ${t}.a );\n`;
				break;
			case TEXBLEND_MULTIPLY: // D3DTOP_MODULATE
				fCombine += `\tblitzC = blitzC * ${t}.rgb;\n`;
				break;
			case TEXBLEND_ADD: // D3DTOP_ADD
				fCombine += `\tblitzC = min( blitzC + ${t}.rgb, 1.0 );\n`;
				break;
			case TEXBLEND_DOT3: // D3DTOP_DOTPRODUCT3
				fCombine += `\tblitzC = vec3( clamp( 4.0 * dot( blitzC - 0.5, ${t}.rgb - 0.5 ), 0.0, 1.0 ) );\n`;
				break;
			case TEXBLEND_MULTIPLY2: // D3DTOP_MODULATE2X
				fCombine += `\tblitzC = min( blitzC * ${t}.rgb * 2.0, 1.0 );\n`;
				break;
			default:
				// Any other value leaves the previous colour operation in place in
				// Direct3D; treated as multiply, the default.
				fCombine += `\tblitzC = blitzC * ${t}.rgb;\n`;
		}
	});

	vs = replaceOnce(vs, '#include <common>', `#include <common>\n${vPars}`);
	vs = replaceOnce(vs, '#include <project_vertex>', `#include <project_vertex>\n${vMain}`);

	// --- fragment ---
	fs = replaceOnce(fs, '#include <common>', `#include <common>\n${fPars}`);
	// Texture alpha takes part in the alpha test, which precedes lighting here.
	fs = replaceOnce(fs, '#include <map_fragment>', fSample);

	if (kind !== 'basic') {
		// Direct3D lights vertices with their own normal whichever side is
		// seen; it has no two-sided lighting.
		const chunk = THREE.ShaderChunk.normal_fragment_begin;
		if (chunk.includes('normal *= faceDirection;')) {
			fs = replaceOnce(
				fs,
				'#include <normal_fragment_begin>',
				chunk.replace('normal *= faceDirection;', '')
			);
		}
	}
	if (kind === 'phong') {
		// Direct3D specular: every Blitz light has a white specular colour, and
		// the term is material.specular * (N.H)^power without the N.L factor or
		// the energy normalisation of Three's Blinn-Phong.
		const chunk = THREE.ShaderChunk.lights_phong_pars_fragment;
		const re = /reflectedLight\.directSpecular \+= [^;]*;/;
		if (re.test(chunk)) {
			fs = replaceOnce(
				fs,
				'#include <lights_phong_pars_fragment>',
				chunk.replace(
					re,
					'reflectedLight.directSpecular += material.specularColor * pow( max( dot( geometryNormal, normalize( directLight.direction + geometryViewDir ) ), 0.0 ), material.specularShininess );'
				)
			);
		}
	}

	// The lit colour is clamped to 0..1 as a Direct3D diffuse colour, run
	// through the texture stages, and specular is added afterwards.
	const spec =
		kind === 'phong'
			? 'reflectedLight.directSpecular + reflectedLight.indirectSpecular'
			: 'vec3( 0.0 )';
	fs = replaceOnce(
		fs,
		'#include <opaque_fragment>',
		`\t{\n\tvec3 blitzSpec = ${spec};\n\tvec3 blitzC = clamp( outgoingLight - blitzSpec, 0.0, 1.0 );\n${fCombine}\toutgoingLight = blitzC + blitzSpec;\n\t}\n#include <opaque_fragment>`
	);

	shader.vertexShader = vs;
	shader.fragmentShader = fs;
}
