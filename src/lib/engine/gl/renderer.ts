/**
 * WebGL2 rendering pipeline.
 *
 *   source (sRGB 8-bit texture)
 *     -> linearize                       [float intermediate]
 *     -> retouch (heal spots, skin, eyes, teeth, under-eye, face light)
 *     -> lens blur (depth of field from a depth map: prep, gather, composite)
 *     -> Gaussian blur pyramid (small / medium / large), downsampled for large radii
 *     -> develop (detail, WB, exposure, mixer, tone, OKLab colour, curves, levels, LUT)
 *     -> adjustment layers (masked local adjustments, optional blur)
 *     -> output (crop / rotate / flip / straighten, vignette, grain, dither) [RGBA8]
 *     -> present (before/after, mask overlay) to the canvas
 *
 * Every pass works on a "source region": the full image for previews, or a
 * padded tile for full-resolution export. Masks and grain are addressed in
 * full-image coordinates so tiles join seamlessly.
 */
import type { CropRect, EditState } from '../../schema/adjustments';
import {
  BLUR_RADII,
  MIN_BLUR_PX,
  deriveLensParams,
  deriveLocalParams,
  lensBlurPlan,
  lensRadiusPx,
  type DevelopParams,
} from '../params';
import { outputToSourceMatrix, toGlMat3, type Mat3, type Size } from '../geometry';
import { CURVE_LUT_SIZE } from '../../color/curves';
import { fringeScale } from '../pixel';
import {
  VERTEX,
  blurFrag,
  copyFrag,
  developFrag,
  glowFrag,
  layerFrag,
  lensCompositeFrag,
  lensGatherFrag,
  lensPrepFrag,
  linearizeFrag,
  outputFrag,
  presentFrag,
  retouchFrag,
} from './shaders';

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RenderRequest {
  edit: EditState;
  params: DevelopParams;
  /** Full-resolution oriented source size. */
  fullSize: Size;
  /** Pixel size of this render. */
  out: Size;
  /** Region of the full output covered by this render (tiles). Defaults to the whole output. */
  outRegion?: Rect;
  /** Override crop (crop tool shows the whole straightened frame). */
  cropOverride?: CropRect;
  /** Render without adjustments (the "before" view); geometry still applies. */
  neutral?: boolean;
  /** Target name, "after" or "before" (or export). */
  target?: string;
  /** Mask raster textures per layer id (provided via setLayerMask). */
}

export interface PresentOptions {
  mode: 'after' | 'split' | 'before' | 'side';
  split: number;
  overlayLayerId?: string | null;
  overlayMatrix?: Mat3;
}

interface Target {
  tex: WebGLTexture;
  fbo: WebGLFramebuffer;
  w: number;
  h: number;
  float: boolean;
}

type Uniform = number | number[] | Float32Array | boolean;

export class WebGLUnavailableError extends Error {}

export class GLRenderer {
  readonly gl: WebGL2RenderingContext;
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  readonly maxTextureSize: number;
  readonly floatFbo: boolean;
  private programs = new Map<string, { prog: WebGLProgram; uniforms: Map<string, WebGLUniformLocation | null> }>();
  private targets = new Map<string, Target>();
  private vao: WebGLVertexArrayObject;
  private srcTex: WebGLTexture | null = null;
  private srcSize: Size = { width: 1, height: 1 };
  private srcRegion: Rect = { x: 0, y: 0, w: 1, h: 1 };
  private curveTex: WebGLTexture;
  private lutTex: WebGLTexture | null = null;
  private lutSize = 2;
  private blankTex: WebGLTexture;
  private blank3d: WebGLTexture;
  private layerMasks = new Map<string, WebGLTexture>();
  private portraitMask: WebGLTexture | null = null;
  private depthTex: WebGLTexture | null = null;
  private lost = false;
  onContextLost?: () => void;

  constructor(canvas: HTMLCanvasElement | OffscreenCanvas) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    }) as WebGL2RenderingContext | null;
    if (!gl) throw new WebGLUnavailableError('WebGL2 is not available in this browser.');
    this.gl = gl;
    this.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    this.floatFbo = !!gl.getExtension('EXT_color_buffer_float');
    gl.getExtension('OES_texture_float_linear');
    gl.disable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);

    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.vao = vao;

    this.blankTex = this.createTexture(1, 1, new Uint8Array([0, 0, 0, 0]));
    this.curveTex = gl.createTexture()!;
    this.blank3d = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_3D, this.blank3d);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, 1, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));

    if ('addEventListener' in canvas) {
      (canvas as HTMLCanvasElement).addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        this.lost = true;
        this.onContextLost?.();
      });
    }
  }

  get isLost(): boolean {
    return this.lost || this.gl.isContextLost();
  }

  // -------------------------------------------------------------------------
  // Resources
  // -------------------------------------------------------------------------

  /** Uploads the source image (oriented, sRGB). `region` is its extent within the full image. */
  setSource(image: TexImageSource, size: Size, region: Rect = { x: 0, y: 0, w: 1, h: 1 }) {
    const gl = this.gl;
    if (size.width > this.maxTextureSize || size.height > this.maxTextureSize) {
      throw new RangeError(`Image exceeds the GPU texture limit (${this.maxTextureSize}px).`);
    }
    if (!this.srcTex) this.srcTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.srcTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.BROWSER_DEFAULT_WEBGL);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, image);
    this.setFilter(gl.LINEAR);
    this.srcSize = size;
    this.srcRegion = region;
  }

  setLayerMask(layerId: string, source: TexImageSource | null) {
    const gl = this.gl;
    const existing = this.layerMasks.get(layerId);
    if (!source) {
      if (existing) gl.deleteTexture(existing);
      this.layerMasks.delete(layerId);
      return;
    }
    const tex = existing ?? gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
    this.setFilter(gl.LINEAR);
    this.layerMasks.set(layerId, tex);
  }

  pruneLayerMasks(keep: Set<string>) {
    for (const id of [...this.layerMasks.keys()]) if (!keep.has(id)) this.setLayerMask(id, null);
  }

  /** RGBA portrait mask: R skin, G teeth, B iris, A under-eye. Mipmapped for soft face light. */
  setPortraitMask(source: TexImageSource | null) {
    const gl = this.gl;
    if (!source) {
      if (this.portraitMask) gl.deleteTexture(this.portraitMask);
      this.portraitMask = null;
      return;
    }
    const tex = this.portraitMask ?? gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.portraitMask = tex;
  }

  /** Depth raster for lens blur: one byte per pixel, nearness 0 (far) .. 255 (near), full-image extent. */
  setDepthMap(depth: { width: number; height: number; data: Uint8Array | Uint8ClampedArray } | null) {
    const gl = this.gl;
    if (!depth) {
      if (this.depthTex) gl.deleteTexture(this.depthTex);
      this.depthTex = null;
      return;
    }
    const tex = this.depthTex ?? gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    const data = depth.data instanceof Uint8Array ? depth.data : new Uint8Array(depth.data.buffer, depth.data.byteOffset, depth.data.length);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, depth.width, depth.height, 0, gl.RED, gl.UNSIGNED_BYTE, data);
    this.setFilter(gl.LINEAR);
    this.depthTex = tex;
  }

  get hasDepthMap(): boolean {
    return this.depthTex !== null;
  }

  /** 3D LUT (size^3 RGB floats, red fastest). Pass null to clear. */
  setLut(data: Float32Array | null, size = 0) {
    const gl = this.gl;
    if (!data) {
      if (this.lutTex) gl.deleteTexture(this.lutTex);
      this.lutTex = null;
      return;
    }
    const tex = this.lutTex ?? gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_3D, tex);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGB16F, size, size, size, 0, gl.RGB, gl.FLOAT, data);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R])
      gl.texParameteri(gl.TEXTURE_3D, p, gl.CLAMP_TO_EDGE);
    this.lutTex = tex;
    this.lutSize = size;
  }

  /** Frees intermediate render targets (e.g. when switching images). */
  releaseIntermediates() {
    const gl = this.gl;
    for (const t of this.targets.values()) {
      gl.deleteTexture(t.tex);
      gl.deleteFramebuffer(t.fbo);
    }
    this.targets.clear();
  }

  dispose() {
    const gl = this.gl;
    this.releaseIntermediates();
    for (const tex of this.layerMasks.values()) gl.deleteTexture(tex);
    this.layerMasks.clear();
    for (const t of [this.srcTex, this.portraitMask, this.depthTex, this.lutTex, this.curveTex, this.blankTex, this.blank3d])
      if (t) gl.deleteTexture(t);
    for (const p of this.programs.values()) gl.deleteProgram(p.prog);
    this.programs.clear();
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  /** Runs the full pipeline into an RGBA8 target (default "after"). Returns the target name. */
  render(req: RenderRequest): string {
    if (!this.srcTex) throw new Error('No source image set.');
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    const { edit, params } = req;
    const sw = this.srcSize.width;
    const sh = this.srcSize.height;
    const f = this.floatFbo;
    const neutral = !!req.neutral;
    const globalOn = !neutral && edit.adjustmentsVisible;

    // 1. Linearize.
    const lin = this.ensureTarget('lin', sw, sh, f);
    this.pass('linearize', linearizeFrag(f), lin, { u_src: this.srcTex });
    let base = lin;

    const pxPerFull = sw / (this.srcRegion.w * req.fullSize.width);
    const longEdge = Math.max(req.fullSize.width, req.fullSize.height);
    const radius = (frac: number, min: number) => Math.max(min, frac * longEdge * pxPerFull);
    const r = edit.retouch;
    const retouchOn =
      !neutral &&
      (r.spots.length > 0 ||
        (this.portraitMask !== null &&
          (r.skinSmoothing > 0 || r.eyeEnhance > 0 || r.teethWhitening > 0 || r.faceLight > 0 || r.underEye > 0)));

    // 2. Retouch.
    if (retouchOn) {
      const bs = this.blur('rbs', lin, radius(BLUR_RADII.small, MIN_BLUR_PX.small));
      const bm = this.blur('rbm', lin, radius(BLUR_RADII.medium * 1.6, MIN_BLUR_PX.medium));
      const spots = r.spots.slice(0, 32);
      const spotData = new Float32Array(32 * 4);
      const offData = new Float32Array(32 * 2);
      spots.forEach((s, i) => {
        spotData.set([s.x, s.y, s.r, 0], i * 4);
        offData.set([s.dx, s.dy], i * 2);
      });
      const out = this.ensureTarget('retouched', sw, sh, f);
      this.pass('retouch', retouchFrag(f), out, {
        u_lin: lin.tex,
        u_bs: bs.tex,
        u_bm: bm.tex,
        u_pmask: this.portraitMask ?? this.blankTex,
        u_hasMask: this.portraitMask ? 1 : 0,
        u_region: [this.srcRegion.x, this.srcRegion.y, this.srcRegion.w, this.srcRegion.h],
        u_fullSize: [req.fullSize.width, req.fullSize.height],
        u_skin: r.skinSmoothing / 100,
        u_skinTex: r.skinTexture / 100,
        u_eye: r.eyeEnhance / 100,
        u_teeth: r.teethWhitening / 100,
        u_faceLight: r.faceLight / 100,
        u_underEye: r.underEye / 100,
        u_spotCount: spots.length,
        u_texel: [1 / sw, 1 / sh],
        u_skinRadius: radius(BLUR_RADII.medium * 2, 2),
        'u_spots[0]': spotData,
        'u_spotOff[0]': offData,
      });
      base = out;
    }

    // 2b. Lens blur (depth of field), in linear source space.
    const lens = deriveLensParams(edit.lensBlur);
    const lensPx = lensRadiusPx(lens, longEdge, pxPerFull);
    if (!neutral && lens.active && this.depthTex && lensPx >= 0.5) {
      const plan = lensBlurPlan(lensPx);
      const common = {
        u_depth: this.depthTex,
        u_region: [this.srcRegion.x, this.srcRegion.y, this.srcRegion.w, this.srcRegion.h],
        u_size: [sw, sh],
        u_lens: [lens.focus, lens.band, lens.width, lens.boost],
      };
      const src = base;
      const level = (name: string, lv: { factor: number; radius: number; samples: number }) => {
        const size = [Math.ceil(sw / lv.factor), Math.ceil(sh / lv.factor)];
        const prep = this.ensureTarget(`${name}Prep`, size[0], size[1], f);
        this.pass('lensPrep', lensPrepFrag(f), prep, { ...common, u_src: src.tex, u_factor: lv.factor, u_cocScale: lensPx / lv.factor });
        const gather = this.ensureTarget(`${name}Gather`, size[0], size[1], f);
        this.pass('lensGather', lensGatherFrag(f), gather, {
          ...common,
          u_prep: prep.tex,
          u_lowSize: size,
          u_radius: lv.radius,
          u_samples: lv.samples,
        });
        return { prep, gather, size };
      };
      const coarse = level('lens', plan);
      const fine = plan.fine ? level('lensFine', plan.fine) : null;
      const out = this.ensureTarget('lensOut', sw, sh, f);
      this.pass('lensComposite', lensCompositeFrag(f), out, {
        ...common,
        u_src: src.tex,
        u_prep: coarse.prep.tex,
        u_gather: coarse.gather.tex,
        u_lowSize: coarse.size,
        u_factor: plan.factor,
        u_prepF: (fine ?? coarse).prep.tex,
        u_gatherF: (fine ?? coarse).gather.tex,
        u_fineSize: (fine ?? coarse).size,
        u_fineFactor: plan.fine?.factor ?? 0,
        u_rmax: lensPx,
      });
      base = out;
    }

    // 3. Blur pyramid for the detail stage and layers.
    const D = params.detail;
    const layers = neutral ? [] : edit.layers.filter((l) => l.visible && l.opacity > 0 && this.layerMasks.has(l.id));
    const detailOn =
      globalOn &&
      (D.sharpen > 0 || D.noise > 0 || D.colorNoise > 0 || D.texture !== 0 || D.clarity !== 0 || D.dehaze !== 0);
    const layerNeedsLarge = layers.some((l) => l.adjustments.clarity !== 0 || l.adjustments.dehaze !== 0);
    const needSmall = detailOn && (D.sharpen > 0 || D.noise > 0 || D.texture !== 0);
    const needMed = detailOn && (D.sharpen > 0 || D.texture !== 0 || D.colorNoise > 0 || D.clarity !== 0);
    const needLarge = (detailOn && (D.clarity !== 0 || D.dehaze !== 0)) || layerNeedsLarge;
    const bs = needSmall ? this.blur('bs', base, radius(BLUR_RADII.small, MIN_BLUR_PX.small)) : base;
    const bm = needMed ? this.blur('bm', base, radius(BLUR_RADII.medium, MIN_BLUR_PX.medium)) : base;
    const bl = needLarge ? this.blur('bl', base, radius(BLUR_RADII.large, MIN_BLUR_PX.large)) : base;

    // 4. Develop.
    this.uploadCurves(params.curveLut);
    const dev = this.ensureTarget('devA', sw, sh, f);
    const m = params.mixer;
    const lutOn = !neutral && edit.lut !== null && this.lutTex !== null && edit.lut.amount > 0;
    this.pass('develop', developFrag(f), dev, {
      u_src: base.tex,
      u_bs: bs.tex,
      u_bm: bm.tex,
      u_bl: bl.tex,
      u_curves: this.curveTex,
      u_lut3d: { tex3d: this.lutTex ?? this.blank3d },
      u_detailOn: detailOn ? 1 : 0,
      u_detail1: [D.texture, D.clarity, D.dehaze, D.sharpen],
      u_detail2: [D.sharpenMask, D.noise, D.colorNoise],
      u_globalOn: globalOn ? 1 : 0,
      u_wb: params.wb,
      u_exposure: params.exposureMul,
      u_mixerOn: params.mixerActive ? 1 : 0,
      u_mixer: { mat3: new Float32Array([m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]) },
      u_tone1: [params.tone.blacks, params.tone.whites, params.tone.shadows],
      u_tone2: [params.tone.highlights, params.tone.contrast, params.tone.brightness],
      u_hslOn: params.hslActive ? 1 : 0,
      'u_hslHues[0]': { floats: params.hslHues },
      'u_hslShift[0]': { floats: params.hslHueShift },
      'u_hslSat[0]': { floats: params.hslSat },
      'u_hslLum[0]': { floats: params.hslLum },
      u_vib: params.vibrance,
      u_sat: params.saturation,
      u_mono: params.monochrome,
      u_gradeOn: params.grading.active ? 1 : 0,
      u_gS: params.grading.shadows,
      u_gM: params.grading.midtones,
      u_gH: params.grading.highlights,
      u_gG: params.grading.global,
      u_gSplit: [params.grading.split1, params.grading.split2, params.grading.width],
      u_curvesOn: params.curvesActive ? 1 : 0,
      u_levelsOn: params.levelsActive ? 1 : 0,
      u_lv1: [params.levels.inBlack, params.levels.inWhite, params.levels.invGamma],
      u_lv2: [params.levels.outBlack, params.levels.outWhite],
      u_lutOn: lutOn ? 1 : 0,
      u_lutAmount: (edit.lut?.amount ?? 0) / 100,
      u_lutSize: this.lutSize,
    });

    // 5. Adjustment layers (ping-pong).
    let cur = dev;
    let flip = false;
    for (const layer of layers) {
      const lp = deriveLocalParams(layer.adjustments);
      const blurCur =
        lp.blur > 0 ? this.blur('layerBlur', cur, radius(BLUR_RADII.layerMax * lp.blur, 1)) : cur;
      const next = this.ensureTarget(flip ? 'devA' : 'devB', sw, sh, f);
      this.pass('layer', layerFrag(f), next, {
        u_cur: cur.tex,
        u_mask: this.layerMasks.get(layer.id)!,
        u_bl: bl.tex,
        u_blurCur: blurCur.tex,
        u_region: [this.srcRegion.x, this.srcRegion.y, this.srcRegion.w, this.srcRegion.h],
        u_opacity: layer.opacity / 100,
        u_invert: layer.invert ? 1 : 0,
        u_exposure: lp.exposureMul,
        u_wb: lp.wb,
        u_tone: [lp.contrast, lp.highlights, lp.shadows],
        u_sat: lp.saturation,
        u_clarity: needLarge ? lp.clarity : 0,
        u_dehaze: needLarge ? lp.dehaze : 0,
        u_blur: lp.blur,
        u_blurOn: lp.blur > 0 ? 1 : 0,
        u_tint: lp.tint,
      });
      cur = next;
      flip = !flip;
    }

    // 5b. Bloom, halation and dreamy soft blur (roadmap 2.5), on the finished develop.
    const FX = params.fx;
    if (globalOn && params.glowActive) {
      const halo = FX.halation > 0 ? this.blur('fxHalo', cur, radius(BLUR_RADII.halation, 2)) : cur;
      const glow = FX.bloom > 0 || FX.dreamy > 0 ? this.blur('fxGlow', cur, radius(BLUR_RADII.glow, 4)) : cur;
      const next = this.ensureTarget(flip ? 'devA' : 'devB', sw, sh, f);
      this.pass('glow', glowFrag(f), next, {
        u_cur: cur.tex,
        u_halo: halo.tex,
        u_glow: glow.tex,
        u_fx: [FX.bloom, FX.halation, FX.dreamy],
      });
      cur = next;
      flip = !flip;
    }

    // 6. Output.
    const targetName = req.target ?? (neutral ? 'before' : 'after');
    const out = this.ensureTarget(targetName, req.out.width, req.out.height, false);
    const crop = req.cropOverride ?? edit.geometry.crop;
    const mat = outputToSourceMatrix(req.fullSize, edit.geometry, crop);
    const outRegion = req.outRegion ?? { x: 0, y: 0, w: 1, h: 1 };
    const outFull = {
      width: req.out.width / outRegion.w,
      height: req.out.height / outRegion.h,
    };
    const fullOut = {
      width: crop.w * (edit.geometry.rotate90 % 2 ? req.fullSize.height : req.fullSize.width),
      height: crop.h * (edit.geometry.rotate90 % 2 ? req.fullSize.width : req.fullSize.height),
    };
    const V = params.vignette;
    const G = params.grain;
    this.pass('output', outputFrag(f), out, {
      u_dev: cur.tex,
      u_m: { mat3: toGlMat3(mat) },
      u_srcRegion: [this.srcRegion.x, this.srcRegion.y, this.srcRegion.w, this.srcRegion.h],
      u_outRegion: [outRegion.x, outRegion.y, outRegion.w, outRegion.h],
      u_outFull: [fullOut.width, fullOut.height],
      u_scale: outFull.width / fullOut.width,
      u_aspect: fullOut.width / fullOut.height,
      u_vig: [V.amount, V.midpoint, V.roundness, V.feather],
      u_grain: [G.amount, G.size, G.roughness],
      u_fx1: [FX.lightLeak, FX.flare, FX.dust, FX.flash],
      u_fringe: fringeScale(FX.fringe),
      u_effectsOn: globalOn && !req.cropOverride ? 1 : 0,
      u_bg: [0.07, 0.066, 0.063, 1],
    });
    return targetName;
  }

  /** Draws rendered targets to the canvas. In "side" mode the canvas holds before | after. */
  present(opts: PresentOptions) {
    const after = this.targets.get('after');
    if (!after) return;
    const before = this.targets.get('before') ?? after;
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    const side = opts.mode === 'side';
    const gap = side ? Math.max(4, Math.round(after.w * 0.01)) : 0;
    const cw = side ? after.w * 2 + gap : after.w;
    if (this.canvas.width !== cw || this.canvas.height !== after.h) {
      this.canvas.width = cw;
      this.canvas.height = after.h;
    }
    const overlayTex = opts.overlayLayerId ? this.layerMasks.get(opts.overlayLayerId) : undefined;
    const common = {
      u_after: after.tex,
      u_before: before.tex,
      u_mask: overlayTex ?? this.blankTex,
      u_split: opts.split,
      u_overlay: overlayTex ? 1 : 0,
      u_m: { mat3: toGlMat3(opts.overlayMatrix ?? [1, 0, 0, 0, 1, 0, 0, 0, 1]) },
      u_overlayColor: [0.86, 0.33, 0.27, 0.45],
    };
    if (side) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, cw, after.h);
      gl.clearColor(0.07, 0.066, 0.063, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      this.pass('present', presentFrag(this.floatFbo), null, { ...common, u_mode: 2, u_overlay: 0 }, [0, 0, after.w, after.h]);
      this.pass('present', presentFrag(this.floatFbo), null, { ...common, u_mode: 0 }, [after.w + gap, 0, after.w, after.h]);
      return;
    }
    this.pass('present', presentFrag(this.floatFbo), null, {
      ...common,
      u_mode: opts.mode === 'split' ? 1 : opts.mode === 'before' ? 2 : 0,
    });
  }

  hasTarget(name: string): boolean {
    return this.targets.has(name);
  }

  /** Reads an RGBA8 target. Rows are top-down (image orientation). */
  readTarget(name: string): ImageData {
    const t = this.targets.get(name);
    if (!t) throw new Error(`No target ${name}`);
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
    const data = new Uint8ClampedArray(t.w * t.h * 4);
    gl.readPixels(0, 0, t.w, t.h, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return new ImageData(data, t.w, t.h);
  }

  /**
   * Reads a target without blocking: the pixels are copied into a pixel-pack buffer on the GPU, and
   * fetched once a fence says the GPU has finished. `readPixels` into client memory instead makes the
   * main thread wait for every queued render (seconds on slow GPUs; roadmap 1.5 measured 2–4 s stalls
   * when a look was applied, from the histogram and thumbnail reads).
   */
  readTargetAsync(name: string): Promise<ImageData> {
    const t = this.targets.get(name);
    if (!t) return Promise.reject(new Error(`No target ${name}`));
    const gl = this.gl;
    const bytes = t.w * t.h * 4;
    const pbo = gl.createBuffer();
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
    gl.bufferData(gl.PIXEL_PACK_BUFFER, bytes, gl.STREAM_READ);
    gl.bindFramebuffer(gl.FRAMEBUFFER, t.fbo);
    gl.readPixels(0, 0, t.w, t.h, gl.RGBA, gl.UNSIGNED_BYTE, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const { w, h } = t;
    return new Promise((resolve, reject) => {
      const done = () => {
        gl.deleteSync(sync);
        gl.deleteBuffer(pbo);
      };
      const poll = () => {
        if (this.isLost) {
          reject(new Error('The GPU context was lost.'));
          return;
        }
        const s = gl.clientWaitSync(sync!, 0, 0);
        if (s === gl.WAIT_FAILED) {
          done();
          reject(new Error('GPU readback failed.'));
          return;
        }
        if (s === gl.TIMEOUT_EXPIRED) {
          setTimeout(poll, 4);
          return;
        }
        const data = new Uint8ClampedArray(bytes);
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pbo);
        gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, data);
        gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
        done();
        resolve(new ImageData(data, w, h));
      };
      setTimeout(poll, 0);
    });
  }

  /** Size of a target, or null. */
  targetSize(name: string): { w: number; h: number } | null {
    const t = this.targets.get(name);
    return t ? { w: t.w, h: t.h } : null;
  }

  /** Downsampled, non-blocking read of a target (see `readTargetAsync`). */
  readTargetScaledAsync(name: string, maxSide: number): Promise<ImageData> {
    const t = this.targets.get(name);
    if (!t) return Promise.reject(new Error(`No target ${name}`));
    const k = Math.min(1, maxSide / Math.max(t.w, t.h));
    const w = Math.max(1, Math.round(t.w * k));
    const h = Math.max(1, Math.round(t.h * k));
    // GL runs commands in order, so the copy into the pixel buffer happens before any later pass reuses this target.
    const smallName = `${name}_a${w}x${h}`; // one per size, so the histogram and the snapshot don't keep resizing it
    const small = this.ensureTarget(smallName, w, h, false);
    this.gl.bindVertexArray(this.vao);
    this.pass('copy', copyFrag(this.floatFbo), small, { u_src: t.tex });
    return this.readTargetAsync(smallName);
  }

  /** Downsampled read of a target for histograms/analysis. */
  readTargetScaled(name: string, maxSide: number): ImageData {
    const t = this.targets.get(name);
    if (!t) throw new Error(`No target ${name}`);
    const k = Math.min(1, maxSide / Math.max(t.w, t.h));
    const w = Math.max(1, Math.round(t.w * k));
    const h = Math.max(1, Math.round(t.h * k));
    const small = this.ensureTarget(`${name}_small`, w, h, false);
    this.gl.bindVertexArray(this.vao);
    this.pass('copy', copyFrag(this.floatFbo), small, { u_src: t.tex });
    return this.readTarget(`${name}_small`);
  }

  // -------------------------------------------------------------------------
  // Internals
  // -------------------------------------------------------------------------

  private blur(name: string, input: Target, sigmaPx: number): Target {
    let cur = input;
    let factor = 1;
    while (sigmaPx / factor > 8 && factor < 32 && cur.w > 8 && cur.h > 8) {
      factor *= 2;
      const next = this.ensureTarget(
        `${name}_d${factor}`,
        Math.max(1, Math.ceil(input.w / factor)),
        Math.max(1, Math.ceil(input.h / factor)),
        cur.float,
      );
      this.pass('copy', copyFrag(this.floatFbo), next, { u_src: cur.tex });
      cur = next;
    }
    const sigma = sigmaPx / factor;
    const tmp = this.ensureTarget(`${name}_h`, cur.w, cur.h, cur.float);
    const out = this.ensureTarget(name, cur.w, cur.h, cur.float);
    const frag = blurFrag(this.floatFbo);
    this.pass('blur', frag, tmp, { u_src: cur.tex, u_dir: [1 / cur.w, 0], u_sigma: sigma });
    this.pass('blur', frag, out, { u_src: tmp.tex, u_dir: [0, 1 / cur.h], u_sigma: sigma });
    return out;
  }

  private uploadCurves(lut: Float32Array) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.curveTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R16F, CURVE_LUT_SIZE, 4, 0, gl.RED, gl.FLOAT, lut);
    this.setFilter(gl.LINEAR);
  }

  private ensureTarget(name: string, w: number, h: number, float: boolean): Target {
    const existing = this.targets.get(name);
    if (existing && existing.w === w && existing.h === h && existing.float === float) return existing;
    const gl = this.gl;
    if (existing) {
      gl.deleteTexture(existing.tex);
      gl.deleteFramebuffer(existing.fbo);
    }
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    if (float) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    this.setFilter(gl.LINEAR);
    const fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      gl.deleteTexture(tex);
      gl.deleteFramebuffer(fbo);
      throw new Error(`Framebuffer incomplete (${status}) for ${name} ${w}x${h}`);
    }
    const t = { tex, fbo, w, h, float };
    this.targets.set(name, t);
    return t;
  }

  private createTexture(w: number, h: number, data: Uint8Array): WebGLTexture {
    const gl = this.gl;
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    this.setFilter(gl.NEAREST);
    return tex;
  }

  private setFilter(filter: number) {
    const gl = this.gl;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  private program(key: string, frag: string) {
    const cacheKey = `${key}:${this.floatFbo}`;
    let p = this.programs.get(cacheKey);
    if (p) return p;
    const gl = this.gl;
    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(sh);
        gl.deleteShader(sh);
        throw new Error(`Shader compile failed (${key}): ${log}`);
      }
      return sh;
    };
    const prog = gl.createProgram()!;
    const vs = compile(gl.VERTEX_SHADER, VERTEX);
    const fs = compile(gl.FRAGMENT_SHADER, frag);
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.bindAttribLocation(prog, 0, 'a_pos');
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(`Program link failed (${key}): ${gl.getProgramInfoLog(prog)}`);
    }
    p = { prog, uniforms: new Map() };
    this.programs.set(cacheKey, p);
    return p;
  }

  private pass(
    key: string,
    frag: string,
    target: Target | null,
    uniforms: Record<string, Uniform | WebGLTexture | { tex3d: WebGLTexture } | { mat3: Float32Array } | { floats: number[] }>,
    viewport?: [number, number, number, number],
  ) {
    const gl = this.gl;
    const p = this.program(key, frag);
    gl.useProgram(p.prog);
    const loc = (name: string) => {
      if (!p.uniforms.has(name)) p.uniforms.set(name, gl.getUniformLocation(p.prog, name));
      return p.uniforms.get(name)!;
    };
    let unit = 0;
    for (const [name, value] of Object.entries(uniforms)) {
      const l = loc(name);
      if (l === null) continue;
      if (value instanceof WebGLTexture) {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, value);
        gl.uniform1i(l, unit++);
      } else if (typeof value === 'object' && value !== null && 'tex3d' in value) {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_3D, value.tex3d);
        gl.uniform1i(l, unit++);
      } else if (typeof value === 'object' && value !== null && 'mat3' in value) {
        gl.uniformMatrix3fv(l, false, value.mat3);
      } else if (typeof value === 'object' && value !== null && 'floats' in value) {
        gl.uniform1fv(l, value.floats);
      } else if (typeof value === 'number' || typeof value === 'boolean') {
        const v = Number(value);
        if (name.startsWith('u_') && isIntUniform(name)) gl.uniform1i(l, v);
        else gl.uniform1f(l, v);
      } else if (value instanceof Float32Array && (name.endsWith('[0]'))) {
        if (name.startsWith('u_spots')) gl.uniform4fv(l, value);
        else gl.uniform2fv(l, value);
      } else {
        const arr = value as number[];
        if (arr.length === 2) gl.uniform2f(l, arr[0], arr[1]);
        else if (arr.length === 3) gl.uniform3f(l, arr[0], arr[1], arr[2]);
        else if (arr.length === 4) gl.uniform4f(l, arr[0], arr[1], arr[2], arr[3]);
      }
    }
    if (target) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
      gl.viewport(0, 0, target.w, target.h);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      if (viewport) gl.viewport(viewport[0], viewport[1], viewport[2], viewport[3]);
      else gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    // Unbind textures so the next pass can render into them without feedback loops.
    for (let i = 0; i < unit; i++) {
      gl.activeTexture(gl.TEXTURE0 + i);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.bindTexture(gl.TEXTURE_3D, null);
    }
  }
}

const INT_UNIFORMS = new Set([
  'u_hasMask',
  'u_spotCount',
  'u_detailOn',
  'u_globalOn',
  'u_mixerOn',
  'u_hslOn',
  'u_gradeOn',
  'u_curvesOn',
  'u_levelsOn',
  'u_lutOn',
  'u_invert',
  'u_blurOn',
  'u_effectsOn',
  'u_mode',
  'u_overlay',
  'u_factor',
  'u_samples',
  'u_fineFactor',
]);
function isIntUniform(name: string) {
  return INT_UNIFORMS.has(name);
}
