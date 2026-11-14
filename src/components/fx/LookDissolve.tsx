/**
 * The look-change dissolve (editor). When a new look lands, the previous frame breaks up into
 * pixels: a dissolve front runs across the photo with a lilac burning edge, and each released
 * pixel lifts off, drifts and fades, uncovering the new look underneath.
 *
 * `source` is the engine's snapshot of the previous frame (a 2D canvas whose pixels may arrive a
 * moment later from the GPU); the effect waits for them, then plays once (~1 s) and calls `onDone`.
 * Loaded lazily with three.js. The caller skips it entirely with reduced motion.
 */
import { useEffect, useRef } from 'react';
import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  LinearFilter,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  Points,
  Scene,
  ShaderMaterial,
  SRGBColorSpace,
  WebGLRenderer,
} from 'three';

const COLS = 84;
const DURATION = 1050;

const COMMON = /* glsl */ `
  uniform float uProgress;
  uniform vec2 uGrid;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  // When a cell lets go: a sweep from the left with a ragged, noisy front.
  float threshold(vec2 cell) {
    vec2 c = cell / uGrid;
    return c.x * 0.62 + hash(cell) * 0.32 + abs(c.y - 0.5) * 0.06;
  }
`;

const PLATE_V = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;
const PLATE_F = /* glsl */ `
  ${COMMON}
  uniform sampler2D uTex;
  varying vec2 vUv;
  void main() {
    vec2 cell = floor(vUv * uGrid);
    float th = threshold(cell);
    float d = th - uProgress;
    if (d < 0.0) discard;
    vec4 c = texture2D(uTex, vUv);
    float edge = smoothstep(0.07, 0.0, d);
    c.rgb = mix(c.rgb, vec3(0.86, 0.80, 1.0), edge * 0.85) + edge * edge * 0.25;
    gl_FragColor = vec4(c.rgb, 1.0);
  }
`;

const DUST_V = /* glsl */ `
  ${COMMON}
  attribute vec2 aCell;
  uniform sampler2D uTex;
  uniform float uSize;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float th = threshold(aCell);
    float t = clamp((uProgress - th) / 0.36, 0.0, 1.0);
    vec2 uv = (aCell + 0.5) / uGrid;
    vec3 col = texture2D(uTex, uv).rgb;
    float h = hash(aCell + 7.0);
    float h2 = hash(aCell + 19.0);
    vec2 pos = uv * 2.0 - 1.0;
    float e = t * t;
    pos.x += (0.08 + h * 0.22) * e;
    pos.y += (h2 - 0.35) * 0.28 * e + 0.12 * e;
    vColor = mix(vec3(0.86, 0.80, 1.0), col, smoothstep(0.0, 0.35, t));
    vAlpha = (t > 0.0 ? 1.0 : 0.0) * (1.0 - t);
    gl_Position = vec4(pos, 0.0, 1.0);
    gl_PointSize = uSize * (1.0 - t * 0.75) * (0.8 + h * 0.5);
  }
`;
const DUST_F = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    if (vAlpha <= 0.0) discard;
    gl_FragColor = vec4(vColor, vAlpha);
  }
`;

function hasPixels(src: HTMLCanvasElement, probe: CanvasRenderingContext2D) {
  probe.clearRect(0, 0, 8, 8);
  probe.drawImage(src, 0, 0, 8, 8);
  const d = probe.getImageData(0, 0, 8, 8).data;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 0) return true;
  return false;
}

export default function LookDissolve({
  source,
  onStart,
  onDone,
}: {
  source: HTMLCanvasElement;
  onStart?: () => void;
  onDone: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const done = useRef(onDone);
  const started = useRef(onStart);
  useEffect(() => {
    done.current = onDone;
    started.current = onStart;
  }, [onDone, onStart]);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let renderer: WebGLRenderer;
    try {
      renderer = new WebGLRenderer({ alpha: true, antialias: false, premultipliedAlpha: false });
    } catch {
      done.current();
      return;
    }
    const w = Math.max(1, el.clientWidth);
    const h = Math.max(1, el.clientHeight);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.cssText =
      'position:absolute;inset:0;width:100%;height:100%;display:block';
    el.appendChild(renderer.domElement);

    const rows = Math.max(1, Math.round((COLS * h) / w));
    // A light copy of the snapshot (≤ 1024 px wide) for the texture.
    const copy = document.createElement('canvas');
    copy.width = Math.min(1024, source.width || w);
    copy.height = Math.max(
      1,
      Math.round((copy.width * (source.height || h)) / (source.width || w)),
    );
    const tex = new CanvasTexture(copy);
    tex.colorSpace = SRGBColorSpace;
    tex.minFilter = LinearFilter;
    tex.generateMipmaps = false;
    const uniforms = {
      uProgress: { value: 0 },
      uGrid: { value: [COLS, rows] },
      uTex: { value: tex },
      uSize: { value: (w / COLS) * dpr * 1.05 },
    };
    const plate = new Mesh(
      new PlaneGeometry(2, 2),
      new ShaderMaterial({
        vertexShader: PLATE_V,
        fragmentShader: PLATE_F,
        uniforms,
        transparent: true,
        depthTest: false,
      }),
    );
    const cells = new Float32Array(COLS * rows * 2);
    for (let j = 0; j < rows; j++)
      for (let i = 0; i < COLS; i++) cells.set([i, j], (j * COLS + i) * 2);
    const geo = new BufferGeometry();
    geo.setAttribute('aCell', new BufferAttribute(cells, 2));
    geo.setAttribute('position', new BufferAttribute(new Float32Array(COLS * rows * 3), 3));
    const dust = new Points(
      geo,
      new ShaderMaterial({
        vertexShader: DUST_V,
        fragmentShader: DUST_F,
        uniforms,
        transparent: true,
        depthTest: false,
      }),
    );
    dust.frustumCulled = false;
    const scene = new Scene();
    scene.add(plate, dust);
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    let raf = 0;
    let t0 = -1;
    const waitStart = performance.now();
    const frame = (now: number) => {
      if (t0 < 0) {
        // Wait for the snapshot's pixels (they come back from the GPU asynchronously).
        if (probe && hasPixels(source, probe)) {
          copy.getContext('2d')?.drawImage(source, 0, 0, copy.width, copy.height);
          tex.needsUpdate = true;
          t0 = now;
          started.current?.();
        } else if (now - waitStart > 2500) {
          done.current();
          return;
        } else {
          raf = requestAnimationFrame(frame);
          return;
        }
      }
      const k = Math.min(1, (now - t0) / DURATION);
      uniforms.uProgress.value = k * 1.36 - 0.02;
      renderer.render(scene, camera);
      if (k < 1) raf = requestAnimationFrame(frame);
      else done.current();
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      geo.dispose();
      tex.dispose();
      (plate.material as ShaderMaterial).dispose();
      plate.geometry.dispose();
      (dust.material as ShaderMaterial).dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [source]);

  return <div ref={host} aria-hidden className="pointer-events-none absolute inset-0" />;
}
