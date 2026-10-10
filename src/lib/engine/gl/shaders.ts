/**
 * GLSL ES 3.00 shaders for the WebGL2 rendering pipeline.
 * The colour math mirrors src/lib/engine/pixel.ts (CPU reference). Keep the two
 * in sync; tests exercise the CPU version and e2e tests compare both paths.
 */
import { LENS } from '../params';

export const VERTEX = /* glsl */ `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

/** Shared helpers. `FLOAT_FBO` is defined as 1 when float render targets are available. */
const COMMON = /* glsl */ `
precision highp float;
precision highp sampler2D;
precision highp sampler3D;

const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);

float srgbToLinear(float v) { return v <= 0.04045 ? v / 12.92 : pow((v + 0.055) / 1.055, 2.4); }
float linearToSrgb(float v) { return v <= 0.0 ? 0.0 : (v <= 0.0031308 ? v * 12.92 : 1.055 * pow(v, 1.0 / 2.4) - 0.055); }
vec3 srgbToLinear3(vec3 c) { return vec3(srgbToLinear(c.r), srgbToLinear(c.g), srgbToLinear(c.b)); }
vec3 linearToSrgb3(vec3 c) { return vec3(linearToSrgb(c.r), linearToSrgb(c.g), linearToSrgb(c.b)); }

// Intermediate linear storage: exact in float targets, sqrt-encoded in 8-bit fallback.
vec4 storeLin(vec4 c) {
#if FLOAT_FBO
  return c;
#else
  return vec4(sqrt(clamp(c.rgb, 0.0, 1.0)), c.a);
#endif
}
vec4 loadLin(vec4 c) {
#if FLOAT_FBO
  return c;
#else
  return vec4(c.rgb * c.rgb, c.a);
#endif
}

float encodeY(float y) { return y > 1.0 ? 1.0 + (y - 1.0) * 0.4 : linearToSrgb(y); }
float decodeY(float p) { return p > 1.0 ? 1.0 + (p - 1.0) / 0.4 : srgbToLinear(max(0.0, p)); }

vec3 softClip(vec3 c) {
  c = max(c, 0.0);
  float mx = max(c.r, max(c.g, c.b));
  if (mx <= 1.0) return c;
  float y = min(dot(c, LUMA), 1.0);
  float t = clamp((mx - 1.0) / max(mx - y, 1e-6), 0.0, 1.0);
  return mix(c, vec3(y), t);
}

vec3 setLuminance(vec3 c, float yNew) {
  float y = dot(c, LUMA);
  vec3 o = y < 1e-6 ? vec3(yNew) : c * (yNew / y);
  return softClip(o);
}

vec3 linearToOklab(vec3 c) {
  c = max(c, 0.0);
  float l = 0.4122214708 * c.r + 0.5363325363 * c.g + 0.0514459929 * c.b;
  float m = 0.2119034982 * c.r + 0.6806995451 * c.g + 0.1073969566 * c.b;
  float s = 0.0883024619 * c.r + 0.2817188376 * c.g + 0.6299787005 * c.b;
  vec3 lms = pow(vec3(l, m, s), vec3(1.0 / 3.0));
  return vec3(
    0.2104542553 * lms.x + 0.7936177850 * lms.y - 0.0040720468 * lms.z,
    1.9779984951 * lms.x - 2.4285922050 * lms.y + 0.4505937099 * lms.z,
    0.0259040371 * lms.x + 0.7827717662 * lms.y - 0.8086757660 * lms.z);
}

vec3 oklabToLinear(vec3 lab) {
  float l_ = lab.x + 0.3963377774 * lab.y + 0.2158037573 * lab.z;
  float m_ = lab.x - 0.1055613458 * lab.y - 0.0638541728 * lab.z;
  float s_ = lab.x - 0.0894841775 * lab.y - 1.2914855480 * lab.z;
  float l = l_ * l_ * l_; float m = m_ * m_ * m_; float s = s_ * s_ * s_;
  return vec3(
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
   -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
   -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s);
}

const float BELL_NORM = 0.10546875;

float applyContrast(float p, float c) {
  if (c == 0.0) return p;
  float k = c > 0.0 ? 1.0 + 1.3 * c : 1.0 / (1.0 - 0.75 * c);
  float m = 0.46;
  float pc = clamp(p, 0.0, 1.0);
  float q = pc < m ? m * pow(pc / m, k) : 1.0 - (1.0 - m) * pow((1.0 - pc) / (1.0 - m), k);
  return q + (p - pc);
}

vec3 dehaze(vec3 x, vec3 bl, float amount) {
  const float A = 0.92;
  float dark = min(bl.r, min(bl.g, bl.b));
  if (amount > 0.0) {
    float t = max(1.0 - 0.9 * amount * (dark / A), 0.25);
    return softClip(max((x - A) / t + A, 0.0));
  }
  float k = -amount * 0.55;
  return mix(x, vec3(A * 0.85, A * 0.86, A * 0.88), k);
}

float hash(vec2 p) {
  float h = sin(p.x * 127.1 + p.y * 311.7) * 43758.5453123;
  return fract(h) * 2.0 - 1.0;
}
float valueNoise(vec2 p) {
  vec2 i = floor(p); vec2 f = p - i;
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i), b = hash(i + vec2(1.0, 0.0)), c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
`;

const header = (floatFbo: boolean) => `#version 300 es
#define FLOAT_FBO ${floatFbo ? 1 : 0}
${COMMON}`;

/** sRGB 8-bit source -> linear intermediate. Keeps alpha (straight). */
export const linearizeFrag = (f: boolean) => `${header(f)}
in vec2 v_uv; out vec4 o;
uniform sampler2D u_src;
void main() {
  vec4 c = texture(u_src, v_uv);
  o = storeLin(vec4(srgbToLinear3(c.rgb), c.a));
}`;

/** Plain copy (used for downsampling with bilinear filtering). */
export const copyFrag = (f: boolean) => `${header(f)}
in vec2 v_uv; out vec4 o;
uniform sampler2D u_src;
void main() { o = texture(u_src, v_uv); }`;

/** Separable Gaussian blur on linear data. */
export const blurFrag = (f: boolean) => `${header(f)}
in vec2 v_uv; out vec4 o;
uniform sampler2D u_src;
uniform vec2 u_dir;      // texel step in uv
uniform float u_sigma;   // in texels
void main() {
  if (u_sigma < 0.3) { o = texture(u_src, v_uv); return; }
  int taps = int(min(ceil(u_sigma * 3.0), 32.0));
  float inv = 1.0 / (2.0 * u_sigma * u_sigma);
  vec4 acc = loadLin(texture(u_src, v_uv));
  float wsum = 1.0;
  for (int i = 1; i <= 32; i++) {
    if (i > taps) break;
    float w = exp(-float(i * i) * inv);
    acc += w * (loadLin(texture(u_src, v_uv + u_dir * float(i))) + loadLin(texture(u_src, v_uv - u_dir * float(i))));
    wsum += 2.0 * w;
  }
  o = storeLin(acc / wsum);
}`;

/** Portrait retouching on linear data (source space). */
export const retouchFrag = (f: boolean) => `${header(f)}
in vec2 v_uv; out vec4 o;
uniform sampler2D u_lin, u_bs, u_bm, u_pmask;
uniform vec4 u_region;      // source region of this texture within the full image (normalized)
uniform vec2 u_fullSize;    // full image size in px
uniform float u_skin, u_skinTex, u_eye, u_teeth, u_faceLight, u_underEye;
uniform int u_hasMask;
uniform int u_spotCount;
uniform vec4 u_spots[32];   // x, y (global normalized), r (fraction of long edge), unused
uniform vec2 u_spotOff[32]; // offset (global normalized)
uniform vec2 u_texel;       // 1 / texture size
uniform float u_skinRadius; // surface-blur radius in texels

vec2 toLocal(vec2 g) { return (g - u_region.xy) / u_region.zw; }
vec3 linAt(vec2 g) { return loadLin(texture(u_lin, toLocal(g))).rgb; }

// Edge-preserving "surface blur" (bilateral on perceptual luminance): neighbours
// with a different tone (lip line, nostril, eyebrow) get little weight, so
// features stay sharp while blotchy skin evens out.
vec3 surfaceBlur(vec2 uv, vec3 center) {
  float pc = encodeY(dot(center, LUMA));
  vec3 acc = center;
  float wsum = 1.0;
  for (int ring = 1; ring <= 3; ring++) {
    float r = u_skinRadius * float(ring) / 3.0;
    float ws = exp(-float(ring * ring) / 6.0);
    for (int k = 0; k < 8; k++) {
      float a = (float(k) + 0.5 * float(ring)) * 0.785398;
      vec3 sm = loadLin(texture(u_lin, uv + vec2(cos(a), sin(a)) * r * u_texel)).rgb;
      float dr = (encodeY(dot(sm, LUMA)) - pc) / 0.06;
      float w = ws * exp(-dr * dr);
      acc += sm * w;
      wsum += w;
    }
  }
  return acc / wsum;
}

void main() {
  vec4 src = loadLin(texture(u_lin, v_uv));
  vec3 c = src.rgb;
  vec2 g = u_region.xy + v_uv * u_region.zw;
  float longEdge = max(u_fullSize.x, u_fullSize.y);
  vec2 toLE = u_fullSize / longEdge;

  // Healing spots: clone from the offset source, matched to the target's colour at the ring.
  for (int i = 0; i < 32; i++) {
    if (i >= u_spotCount) break;
    vec4 s = u_spots[i];
    float d = length((g - s.xy) * toLE) / s.z;
    if (d < 1.0) {
      vec2 off = u_spotOff[i];
      vec3 diff = vec3(0.0);
      for (int k = 0; k < 8; k++) {
        float a = float(k) * 0.785398;
        vec2 ring = s.xy + vec2(cos(a), sin(a)) * (s.z * 1.15) / toLE;
        diff += linAt(ring) - linAt(ring + off);
      }
      diff /= 8.0;
      vec3 healed = max(linAt(g + off) + diff, 0.0);
      c = mix(c, healed, 1.0 - smoothstep(0.55, 1.0, d));
    }
  }

  if (u_hasMask == 1) {
    vec4 m = texture(u_pmask, g);
    vec3 bs = loadLin(texture(u_bs, v_uv)).rgb;
    vec3 bm = loadLin(texture(u_bm, v_uv)).rgb;
    vec3 lab = linearToOklab(c);
    float C = length(lab.yz);
    float h = degrees(atan(lab.z, lab.y));
    float dh = abs(mod(h - 55.0 + 180.0, 360.0) - 180.0);
    float skinColor = exp(-pow(dh / 40.0, 2.0)) * smoothstep(0.01, 0.035, C);

    if (u_skin > 0.0 && m.r > 0.001) {
      // Surface blur evens tone; adding back the finest band (c - bs) keeps pores.
      vec3 base = surfaceBlur(v_uv, c);
      vec3 smoothed = max(base + (c - bs) * u_skinTex, 0.0);
      float w = u_skin * 0.9 * m.r * (0.35 + 0.65 * skinColor);
      c = mix(c, smoothed, clamp(w, 0.0, 1.0));
    }
    if (u_underEye > 0.0 && m.a > 0.001) {
      vec3 l2 = linearToOklab(mix(c, bm, 0.35 * u_underEye * m.a));
      l2.x += u_underEye * 0.05 * m.a * (1.0 - l2.x);
      l2.yz *= 1.0 - 0.25 * u_underEye * m.a;
      c = softClip(oklabToLinear(l2));
    }
    if (u_teeth > 0.0 && m.g > 0.001) {
      vec3 l2 = linearToOklab(c);
      float bright = smoothstep(0.35, 0.6, l2.x);
      float w = u_teeth * m.g * bright;
      if (l2.z > 0.0) l2.z *= 1.0 - 0.75 * w;
      l2.y *= 1.0 - 0.4 * w;
      l2.x += 0.05 * w * (1.0 - l2.x);
      c = softClip(oklabToLinear(l2));
    }
    if (u_eye > 0.0 && m.b > 0.001) {
      float p = encodeY(dot(c, LUMA));
      float pm = encodeY(dot(bm, LUMA));
      float w = u_eye * m.b;
      float q = p + w * 0.06 + w * 0.6 * (p - pm);
      c = setLuminance(c, decodeY(max(q, 0.0)));
      vec3 l2 = linearToOklab(c);
      l2.yz *= 1.0 + 0.3 * w;
      c = softClip(oklabToLinear(l2));
    }
    if (u_faceLight > 0.0) {
      float soft = textureLod(u_pmask, g, 4.0).r;
      c = softClip(c * (1.0 + 0.45 * u_faceLight * soft));
    }
  }
  o = storeLin(vec4(c, src.a));
}`;

/** Global develop: detail stage, WB, exposure, mixer, tone, colour, curves, levels, LUT. Output is display-encoded. */
export const developFrag = (f: boolean) => `${header(f)}
in vec2 v_uv; out vec4 o;
uniform sampler2D u_src, u_bs, u_bm, u_bl, u_curves;
uniform sampler3D u_lut3d;
uniform int u_detailOn;
uniform vec4 u_detail1;   // texture, clarity, dehaze, sharpen
uniform vec3 u_detail2;   // sharpenMask, noise, colorNoise
uniform int u_globalOn;
uniform vec3 u_wb;
uniform float u_exposure;
uniform int u_mixerOn;
uniform mat3 u_mixer;
uniform vec3 u_tone1;     // blacks, whites, shadows
uniform vec3 u_tone2;     // highlights, contrast, brightness
uniform int u_hslOn;
uniform float u_hslHues[8], u_hslShift[8], u_hslSat[8], u_hslLum[8];
uniform float u_vib, u_sat, u_mono;
uniform int u_gradeOn;
uniform vec3 u_gS, u_gM, u_gH, u_gG, u_gSplit;
uniform int u_curvesOn;
uniform int u_levelsOn;
uniform vec3 u_lv1;       // inBlack, inWhite, invGamma
uniform vec2 u_lv2;       // outBlack, outWhite
uniform int u_lutOn;
uniform float u_lutAmount, u_lutSize;

float bandInterp(float vals[8], float h) {
  for (int i = 0; i < 8; i++) {
    float h0 = u_hslHues[i];
    float h1 = i == 7 ? u_hslHues[0] + 360.0 : u_hslHues[i + 1];
    float hh = h < h0 ? h + 360.0 : h;
    if (hh >= h0 && hh < h1) {
      float t = smoothstep(0.0, 1.0, (hh - h0) / (h1 - h0));
      return mix(vals[i], vals[(i + 1) % 8], t);
    }
  }
  return vals[0];
}

float toneShape(float p) {
  float q = p;
  float pc = clamp(q, 0.0, 1.0);
  q += u_tone1.x * 0.1 * pow(1.0 - pc, 4.0);
  q += u_tone1.y * 0.12 * pow(pc, 4.0);
  float pc2 = clamp(q, 0.0, 1.0);
  q += u_tone1.z * 0.22 * (pc2 * pow(1.0 - pc2, 3.0)) / BELL_NORM;
  q += u_tone2.x * 0.22 * (pow(pc2, 3.0) * (1.0 - pc2)) / BELL_NORM;
  q = applyContrast(q, u_tone2.y);
  if (u_tone2.z != 0.0) q = pow(max(q, 0.0), exp2(-0.7 * u_tone2.z));
  return q;
}

vec3 colorStage(vec3 lin) {
  vec3 lab = linearToOklab(lin);
  float L = lab.x;
  float C = length(lab.yz);
  float h = degrees(atan(lab.z, lab.y));
  if (h < 0.0) h += 360.0;
  if (u_hslOn == 1 && C > 1e-5) {
    float cw = smoothstep(0.0, 0.06, C);
    float shift = bandInterp(u_hslShift, h);
    float sat = bandInterp(u_hslSat, h);
    float lum = bandInterp(u_hslLum, h);
    h += shift * cw;
    C *= max(0.0, 1.0 + sat * cw);
    L += lum * 0.16 * cw;
  }
  if (u_vib != 0.0) {
    float dh = abs(mod(h - 55.0 + 180.0, 360.0) - 180.0);
    float skin = exp(-pow(dh / 25.0, 2.0));
    float protect = u_vib > 0.0 ? 1.0 - 0.6 * skin : 1.0;
    C *= max(0.0, 1.0 + u_vib * (1.0 - smoothstep(0.0, 0.18, C)) * protect);
  }
  if (u_sat != 0.0) C *= max(0.0, 1.0 + u_sat);
  float rad = radians(h);
  vec2 ab = C * vec2(cos(rad), sin(rad));
  if (u_gradeOn == 1) {
    float ws = 1.0 - smoothstep(u_gSplit.x - u_gSplit.z, u_gSplit.x + u_gSplit.z, L);
    float wh = smoothstep(u_gSplit.y - u_gSplit.z, u_gSplit.y + u_gSplit.z, L);
    float wm = clamp(1.0 - ws - wh, 0.0, 1.0);
    vec3 off = ws * u_gS + wm * u_gM + wh * u_gH + u_gG;
    ab += off.xy;
    L += off.z;
  }
  if (u_mono > 0.0) ab *= 1.0 - u_mono;
  L = clamp(L, 0.0, 1.25);
  return softClip(oklabToLinear(vec3(L, ab)));
}

float curve(float v, float row) {
  return texture(u_curves, vec2((clamp(v, 0.0, 1.0) * 255.0 + 0.5) / 256.0, (row + 0.5) / 4.0)).r;
}

void main() {
  vec4 src = loadLin(texture(u_src, v_uv));
  vec3 x = src.rgb;

  if (u_detailOn == 1) {
    vec3 s = loadLin(texture(u_bs, v_uv)).rgb;
    vec3 m = loadLin(texture(u_bm, v_uv)).rgb;
    vec3 l = loadLin(texture(u_bl, v_uv)).rgb;
    if (u_detail2.z > 0.0) {
      vec3 lab = linearToOklab(x);
      vec3 labm = linearToOklab(m);
      x = softClip(oklabToLinear(vec3(lab.x, mix(lab.yz, labm.yz, u_detail2.z))));
    }
    float p0 = encodeY(dot(x, LUMA));
    float ps = encodeY(dot(s, LUMA));
    float pm = encodeY(dot(m, LUMA));
    float pl = encodeY(dot(l, LUMA));
    float p = p0;
    if (u_detail2.y > 0.0) p = mix(p, ps, u_detail2.y * (1.0 - smoothstep(0.015, 0.09, abs(p0 - ps))));
    if (u_detail1.w > 0.0) {
      float edge = smoothstep(0.004, 0.04, abs(ps - pm));
      p += u_detail1.w * 1.6 * (p0 - ps) * mix(1.0, edge, u_detail2.x);
    }
    if (u_detail1.x != 0.0) p += u_detail1.x * 1.1 * (ps - pm);
    if (u_detail1.y != 0.0) {
      float mid = 1.0 - pow(clamp(2.0 * p - 1.0, -1.0, 1.0), 2.0);
      p += u_detail1.y * 0.8 * (pm - pl) * (0.35 + 0.65 * mid) + u_detail1.y * 0.35 * (p0 - pl) * mid;
    }
    if (p != p0) x = setLuminance(x, decodeY(max(p, 0.0)));
    if (u_detail1.z != 0.0) x = dehaze(x, l, u_detail1.z);
  }

  vec3 disp;
  if (u_globalOn == 1) {
    x = x * u_wb * u_exposure;
    if (u_mixerOn == 1) x = max(u_mixer * x, 0.0);
    float y = dot(x, LUMA);
    float p = encodeY(y);
    float q = toneShape(p);
    x = q == p ? softClip(x) : setLuminance(x, decodeY(max(q, 0.0)));
    x = colorStage(x);
    disp = linearToSrgb3(x);
    if (u_curvesOn == 1) {
      disp = vec3(curve(curve(disp.r, 0.0), 1.0), curve(curve(disp.g, 0.0), 2.0), curve(curve(disp.b, 0.0), 3.0));
    }
    if (u_levelsOn == 1) {
      disp = clamp((disp - u_lv1.x) / (u_lv1.y - u_lv1.x), 0.0, 1.0);
      disp = u_lv2.x + pow(disp, vec3(u_lv1.z)) * (u_lv2.y - u_lv2.x);
    }
  } else {
    disp = linearToSrgb3(softClip(x));
  }
  if (u_lutOn == 1) {
    vec3 coord = (clamp(disp, 0.0, 1.0) * (u_lutSize - 1.0) + 0.5) / u_lutSize;
    disp = mix(disp, texture(u_lut3d, coord).rgb, u_lutAmount);
  }
  o = vec4(disp, src.a);
}`;

/** One masked adjustment layer on display-encoded data. */
export const layerFrag = (f: boolean) => `${header(f)}
in vec2 v_uv; out vec4 o;
uniform sampler2D u_cur, u_mask, u_bl, u_blurCur;
uniform vec4 u_region;
uniform float u_opacity;
uniform int u_invert;
uniform float u_exposure;
uniform vec3 u_wb;
uniform vec3 u_tone;       // contrast, highlights, shadows
uniform float u_sat, u_clarity, u_dehaze, u_blur;
uniform vec2 u_tint;
uniform int u_blurOn;

void main() {
  vec4 cur = texture(u_cur, v_uv);
  vec2 g = u_region.xy + v_uv * u_region.zw;
  float m = texture(u_mask, g).a;
  if (u_invert == 1) m = 1.0 - m;
  m *= u_opacity;
  if (m <= 0.0005) { o = cur; return; }
  vec3 disp = cur.rgb;
  if (u_blurOn == 1 && u_blur > 0.0) disp = mix(disp, texture(u_blurCur, v_uv).rgb, clamp(u_blur * 1.5, 0.0, 1.0));
  vec3 x = srgbToLinear3(disp) * u_exposure * u_wb;
  vec3 bl = loadLin(texture(u_bl, v_uv)).rgb;
  if (u_tone != vec3(0.0) || u_clarity != 0.0) {
    float p0 = encodeY(dot(x, LUMA));
    float p = p0;
    float pc = clamp(p, 0.0, 1.0);
    p += u_tone.z * 0.22 * (pc * pow(1.0 - pc, 3.0)) / BELL_NORM;
    p += u_tone.y * 0.22 * (pow(pc, 3.0) * (1.0 - pc)) / BELL_NORM;
    p = applyContrast(p, u_tone.x);
    if (u_clarity != 0.0) {
      float pl = encodeY(dot(bl, LUMA));
      float mid = 1.0 - pow(clamp(2.0 * p - 1.0, -1.0, 1.0), 2.0);
      p += u_clarity * 0.9 * (p0 - pl) * mid;
    }
    x = setLuminance(x, decodeY(max(p, 0.0)));
  }
  if (u_dehaze != 0.0) x = dehaze(x, bl, u_dehaze);
  if (u_sat != 0.0 || u_tint != vec2(0.0)) {
    vec3 lab = linearToOklab(x);
    lab.yz = lab.yz * max(0.0, 1.0 + u_sat) + u_tint;
    x = softClip(oklabToLinear(lab));
  }
  vec3 res = linearToSrgb3(softClip(x));
  o = vec4(mix(cur.rgb, res, m), cur.a);
}`;

/** Output pass: geometry (crop/rotate/flip/straighten), vignette, grain, dither. */
export const outputFrag = (f: boolean) => `${header(f)}
in vec2 v_uv; out vec4 o;
uniform sampler2D u_dev;
uniform mat3 u_m;            // output-normalized -> source-normalized
uniform vec4 u_srcRegion;    // region of u_dev within the full source (normalized)
uniform vec4 u_outRegion;    // region of this render within the full output (normalized)
uniform vec2 u_outFull;      // full-resolution output size (px)
uniform float u_scale;       // rendered px per full-res px
uniform float u_aspect;
uniform vec4 u_vig;          // amount, midpoint, roundness, feather
uniform vec3 u_grain;        // amount, size, roughness
uniform int u_effectsOn;
uniform vec4 u_bg;

void main() {
  // Texture convention throughout the pipeline: v = 0 is the image's top row.
  vec2 uvOut = u_outRegion.xy + v_uv * u_outRegion.zw;
  vec3 s = u_m * vec3(uvOut, 1.0);
  vec2 local = (s.xy - u_srcRegion.xy) / u_srcRegion.zw;
  if (s.x < 0.0 || s.y < 0.0 || s.x > 1.0 || s.y > 1.0) { o = u_bg; return; }
  vec4 c = texture(u_dev, local);
  vec3 disp = c.rgb;
  if (u_effectsOn == 1) {
    if (u_vig.x != 0.0) {
      vec2 uv = uvOut * 2.0 - 1.0;
      float k = (u_vig.z + 1.0) / 2.0;
      float sx = mix(1.0, u_aspect, k);
      float d = length(vec2(uv.x * sx, uv.y)) / length(vec2(sx, 1.0)) * 1.41421356;
      float r0 = mix(0.25, 1.25, u_vig.y);
      float w = mix(0.05, 1.1, u_vig.w);
      float wt = smoothstep(r0 - w * 0.5, r0 + w * 0.5, d);
      vec3 lin = srgbToLinear3(disp);
      if (u_vig.x < 0.0) lin *= 1.0 + u_vig.x * wt * 0.9;
      else lin = mix(lin, vec3(1.0), u_vig.x * wt * 0.75);
      disp = linearToSrgb3(lin);
    }
    if (u_grain.x > 0.0) {
      vec2 fp = uvOut * u_outFull;
      float cell = mix(0.8, 6.0, u_grain.y);
      float atten = min(1.0, cell * u_scale);
      float n1 = valueNoise(fp / cell);
      float n2 = valueNoise(fp / cell * 2.3 + vec2(17.1, 5.3));
      float n = (n1 * (1.0 - u_grain.z * 0.5) + n2 * u_grain.z * 0.5) * atten;
      float y = dot(disp, LUMA);
      float wgt = 0.35 + 0.65 * (1.0 - pow(2.0 * y - 1.0, 2.0));
      disp = clamp(disp + n * u_grain.x * 0.11 * wgt, 0.0, 1.0);
    }
  }
  // Ordered dither to hide 8-bit banding.
  float dither = (fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) / 255.0;
  o = vec4(clamp(disp + dither, 0.0, 1.0), c.a);
}`;

/** Presentation to the canvas: before/after split, mask overlay. */
export const presentFrag = (f: boolean) => `${header(f)}
in vec2 v_uv; out vec4 o;
uniform sampler2D u_after, u_before, u_mask;
uniform int u_mode;          // 0 after, 1 split, 2 before
uniform float u_split;
uniform int u_overlay;
uniform mat3 u_m;            // output-normalized -> source-normalized (for mask overlay)
uniform vec4 u_overlayColor;
void main() {
  // The canvas's default framebuffer has y up; image textures have row 0 at the top.
  vec2 uv = vec2(v_uv.x, 1.0 - v_uv.y);
  vec4 a = texture(u_after, uv);
  vec4 b = texture(u_before, uv);
  vec4 c = u_mode == 2 ? b : (u_mode == 1 && uv.x < u_split ? b : a);
  // Checkerboard behind transparent pixels.
  vec2 cell = floor(gl_FragCoord.xy / 8.0);
  float chk = mod(cell.x + cell.y, 2.0) < 1.0 ? 0.22 : 0.28;
  vec3 rgb = mix(vec3(chk), c.rgb, c.a);
  if (u_overlay == 1) {
    vec3 s = u_m * vec3(uv, 1.0);
    float m = (s.x >= 0.0 && s.y >= 0.0 && s.x <= 1.0 && s.y <= 1.0) ? texture(u_mask, s.xy).a : 0.0;
    rgb = mix(rgb, u_overlayColor.rgb, m * u_overlayColor.a);
  }
  o = vec4(rgb, 1.0);
}`;

// ---------------------------------------------------------------------------
// Lens blur (depth of field): prep -> gather -> composite. Mirrors
// lensBlurLinear in cpu/cpuRender.ts and the lens helpers in pixel.ts.
// ---------------------------------------------------------------------------

function glslFloat(v: number): string {
  const s = String(v);
  return s.includes('.') || s.includes('e') ? s : `${s}.0`;
}

const LENS_COMMON = /* glsl */ `
uniform sampler2D u_depth;   // R8 nearness (0 far .. 1 near), full image extent
uniform vec4 u_region;       // this texture's region within the full image (normalized)
uniform vec2 u_size;         // source (region) size in px
uniform vec4 u_lens;         // focus, band, width, boost
const float GOLDEN_ANGLE = 2.399963229728653;
const float BOKEH_T = ${glslFloat(LENS.highlightThreshold)};

float lensCoc(float n) {
  float d = u_lens.x - n;
  float t = clamp((abs(d) - u_lens.y) / u_lens.z, 0.0, 1.0);
  float s = t * (2.0 - t);
  return d < 0.0 ? -s : s;
}
// p: position in source px (texel centres at +0.5).
float cocAtPx(vec2 p) { return lensCoc(texture(u_depth, u_region.xy + (p / u_size) * u_region.zw).r); }

vec3 bokehExpand(vec3 c, float boost) {
  float y = dot(c, LUMA);
  if (boost <= 0.0 || y <= BOKEH_T) return c;
  return c * ((y + boost * (y - BOKEH_T) * (y - BOKEH_T)) / y);
}
vec3 bokehCompress(vec3 c, float boost) {
  float y = dot(c, LUMA);
  if (boost <= 0.0 || y <= BOKEH_T) return c;
  float g = BOKEH_T + (sqrt(1.0 + 4.0 * boost * (y - BOKEH_T)) - 1.0) / (2.0 * boost);
  return c * (g / y);
}
float cocSimilarity(float a, float ref) {
  float tau = 0.5 + 0.25 * abs(ref);
  return 1.0 - smoothstep(tau, 2.0 * tau, abs(a - ref));
}

// Low-resolution lens targets: exact in float targets; the 8-bit fallback
// encodes (expanded) colour as sqrt(v / 4) and the signed CoC around 0.5.
vec4 storeBokeh(vec3 rgb, float coc) {
#if FLOAT_FBO
  return vec4(rgb, coc);
#else
  return vec4(sqrt(clamp(rgb / 4.0, 0.0, 1.0)), clamp(0.5 + coc / 64.0, 0.0, 1.0));
#endif
}
vec4 loadBokeh(vec4 v) {
#if FLOAT_FBO
  return v;
#else
  return vec4(v.rgb * v.rgb * 4.0, (v.a - 0.5) * 64.0);
#endif
}
vec4 storeGather(vec3 rgb, float fg) {
#if FLOAT_FBO
  return vec4(rgb, fg);
#else
  return vec4(sqrt(clamp(rgb / 4.0, 0.0, 1.0)), fg);
#endif
}
vec4 loadGather(vec4 v) {
#if FLOAT_FBO
  return v;
#else
  return vec4(v.rgb * v.rgb * 4.0, v.a);
#endif
}
`;

const lensHeader = (f: boolean) => `${header(f)}${LENS_COMMON}`;

/** Lens prep (low res): highlight-expanded colour averaged over factor x factor blocks at the block's depth; alpha = CoC. */
export const lensPrepFrag = (f: boolean) => `${lensHeader(f)}
out vec4 o;
uniform sampler2D u_src;
uniform int u_factor;
uniform float u_cocScale; // full blur radius in this level's px
void main() {
  ivec2 lo = ivec2(gl_FragCoord.xy);
  int fac = u_factor;
  ivec2 sz = ivec2(u_size);
  float cc = cocAtPx((vec2(lo) + 0.5) * float(fac)) * u_cocScale;
  vec3 acc = vec3(0.0);
  vec3 pacc = vec3(0.0);
  float ws = 0.0;
  float pn = 0.0;
  ivec2 b = lo * fac;
  for (int y = 0; y < ${LENS.maxFactor}; y++) {
    int sy = b.y + y;
    if (y >= fac || sy >= sz.y) break;
    for (int x = 0; x < ${LENS.maxFactor}; x++) {
      int sx = b.x + x;
      if (x >= fac || sx >= sz.x) break;
      vec3 e = bokehExpand(loadLin(texelFetch(u_src, ivec2(sx, sy), 0)).rgb, u_lens.w);
      float w = cocSimilarity(cocAtPx(vec2(sx, sy) + 0.5) * u_cocScale, cc);
      acc += e * w;
      ws += w;
      pacc += e;
      pn += 1.0;
    }
  }
  vec3 c = ws > 1e-3 ? acc / ws : pacc / max(pn, 1.0);
  o = storeBokeh(c, cc);
}`;

/** Lens gather (low res): scatter-as-gather disc blur with golden-angle samples. Alpha = foreground spill. */
export const lensGatherFrag = (f: boolean) => `${lensHeader(f)}
out vec4 o;
uniform sampler2D u_prep;
uniform vec2 u_lowSize;
uniform float u_radius;
uniform int u_samples;
void main() {
  vec2 p = gl_FragCoord.xy;
  vec4 c = loadBokeh(texelFetch(u_prep, ivec2(p), 0));
  vec3 acc = c.rgb;
  float ws = 1.0;
  float fg = 0.0;
  float c0 = abs(c.a);
  for (int k = 0; k < ${LENS.maxSamples}; k++) {
    if (k >= u_samples) break;
    float fk = float(k);
    float r = u_radius * sqrt((fk + 0.5) / float(u_samples));
    float a = fk * GOLDEN_ANGLE;
    // Bilinear footprint, but each of the 4 texels is tested for coverage on its own: interpolating
    // colour and CoC first would let in-focus texels leak across depth edges as halos.
    vec2 q = p + r * vec2(cos(a), sin(a)) - 0.5;
    vec2 q0 = floor(q);
    vec2 fr = q - q0;
    for (int t = 0; t < 4; t++) {
      ivec2 off = ivec2(t & 1, t >> 1);
      ivec2 ix = clamp(ivec2(q0) + off, ivec2(0), ivec2(u_lowSize) - 1);
      float bil = (off.x == 1 ? fr.x : 1.0 - fr.x) * (off.y == 1 ? fr.y : 1.0 - fr.y);
      vec4 s = loadBokeh(texelFetch(u_prep, ix, 0));
      float cs = abs(s.a);
      if (s.a > c.a + 0.5) cs = min(cs, c0 * 2.0 + 0.5);
      float w = bil * clamp(cs - r + 0.5, 0.0, 1.0);
      acc += s.rgb * w;
      ws += w;
      if (s.a < c.a - 0.5 && cs > c0) fg += w;
    }
  }
  o = storeGather(acc / ws, fg / ws);
}`;

/** Lens composite (full res): depth-aware upsample of the gather, mixed with the sharp image by CoC. */
export const lensCompositeFrag = (f: boolean) => `${lensHeader(f)}
in vec2 v_uv; out vec4 o;
uniform sampler2D u_src, u_prep, u_gather, u_prepF, u_gatherF;
uniform vec2 u_lowSize, u_fineSize;
uniform int u_factor;
uniform int u_fineFactor;  // 0 = no fine level
uniform float u_rmax;      // full blur radius in source px

// Depth-aware (joint bilateral) upsample of one level's gather: rgb + foreground spill.
vec4 upsample(sampler2D prep, sampler2D gather, vec2 size, float fac, vec2 p, float c0) {
  float c0l = c0 / fac;
  vec2 q = p / fac - 0.5;
  vec2 q0 = floor(q);
  vec2 fr = q - q0;
  ivec2 hi = ivec2(size) - 1;
  vec4 acc = vec4(0.0);
  float ws = 0.0;
  vec4 bacc = vec4(0.0);
  for (int k = 0; k < 4; k++) {
    ivec2 off = ivec2(k & 1, k >> 1);
    ivec2 ix = clamp(ivec2(q0) + off, ivec2(0), hi);
    float bil = (off.x == 1 ? fr.x : 1.0 - fr.x) * (off.y == 1 ? fr.y : 1.0 - fr.y);
    float a = loadBokeh(texelFetch(prep, ix, 0)).a;
    vec4 g = loadGather(texelFetch(gather, ix, 0));
    float w = bil * cocSimilarity(a, c0l);
    acc += g * w;
    ws += w;
    bacc += g * bil;
  }
  return ws > 1e-4 ? acc / ws : bacc;
}

void main() {
  vec4 src = loadLin(texture(u_src, v_uv));
  vec2 p = gl_FragCoord.xy;
  float fac = float(u_factor);
  float c0 = cocAtPx(p) * u_rmax;
  float ac = abs(c0);
  float tc;
  float u;
  if (u_fineFactor == 0) {
    tc = smoothstep(0.5, 0.5 + fac, ac);
    u = 1.0;
  } else {
    tc = smoothstep(0.5, 0.5 + float(u_fineFactor), ac);
    u = smoothstep(0.75 * fac, 1.5 * fac, ac);
  }
  vec4 b = upsample(u_prep, u_gather, u_lowSize, fac, p, c0);
  if (u_fineFactor != 0 && u < 1.0) {
    vec4 a = upsample(u_prepF, u_gatherF, u_fineSize, float(u_fineFactor), p, c0);
    b = mix(a, b, u);
  }
  float t = max(tc, b.a);
  if (t <= 0.0) { o = storeLin(src); return; }
  o = storeLin(vec4(mix(src.rgb, bokehCompress(b.rgb, u_lens.w), t), src.a));
}`;
