/**
 * The home hero ("Lit"): a photo made of particles. Every particle is one pixel of the photo; on
 * arrival they fly in from a loose cloud and assemble the picture. Then looks wash across it one
 * after another: a wave front sweeps left to right, particles lift as it passes and come down in
 * the new look, with a lilac flash on the front (the afterimage). The pointer pushes particles
 * aside and tilts the whole plate; a click scatters them and they settle again.
 *
 * The looks here are shader approximations of real rolls, for the demonstration only; edits in the
 * app always go through the engine. WebGL failure or reduced motion → the plain photo.
 */
import { useEffect, useRef, useState } from 'react';
import {
  BufferAttribute,
  BufferGeometry,
  Group,
  NormalBlending,
  PerspectiveCamera,
  Plane,
  Points,
  Raycaster,
  Scene,
  ShaderMaterial,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { motionReduced } from '@/lib/haptics';
import { HERO_LOOKS, type HeroLook } from './heroLooks';

const VERT = /* glsl */ `
  attribute vec3 aTarget;
  attribute vec3 aScatter;
  attribute vec3 aColor;
  attribute float aSeed;
  uniform float uTime, uAssemble, uWave, uMouseOn, uBurst, uSize, uCamZ;
  uniform vec2 uMouse, uHalf;
  uniform vec4 uAp, uBp;
  uniform vec3 uAs, uAh, uBs, uBh;
  uniform float uAm, uBm;
  varying vec3 vColor;
  varying float vAlpha;

  vec3 grade(vec3 c, vec4 p, vec3 sh, vec3 hi, float mono) {
    float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
    c = mix(vec3(l), c, p.y);
    c = mix(c, vec3(l), mono);
    c.r += p.z * 0.07; c.b -= p.z * 0.07; c.g += p.z * 0.015;
    c = (c - 0.5) * p.x + 0.5;
    float L = dot(clamp(c, 0.0, 1.0), vec3(0.2126, 0.7152, 0.0722));
    c += sh * (1.0 - smoothstep(0.0, 0.55, L)) + hi * smoothstep(0.45, 1.0, L);
    c = vec3(p.w) + c * (1.0 - p.w);
    return clamp(c, 0.0, 1.0);
  }

  void main() {
    float t = clamp(uAssemble * 1.7 - aSeed * 0.7, 0.0, 1.0);
    float e = 1.0 - pow(1.0 - t, 3.0);
    vec3 pos = mix(aScatter, aTarget, e);
    pos = mix(pos, aScatter * 0.55 + aTarget * 0.45, uBurst * (0.4 + aSeed));

    // Breathing: a slow ripple keeps the assembled plate alive.
    pos.z += sin(uTime * 0.9 + aTarget.x * 2.6 + aTarget.y * 1.9) * 0.018 * e;

    // The look wave: a front sweeping left to right; particles lift as it passes.
    float nx = aTarget.x / uHalf.x * 0.5 + 0.5;
    float front = uWave * 1.5 - 0.25;
    float d = nx - front + (aSeed - 0.5) * 0.06;
    float k = smoothstep(0.1, 0.0, abs(d)) * step(0.001, uWave) * step(uWave, 0.999);
    float take = smoothstep(0.015, -0.015, d);
    pos.z += k * 0.42;
    pos.y += k * 0.03 * sin(aSeed * 40.0);

    // The pointer pushes particles aside and toward the viewer.
    vec2 diff = pos.xy - uMouse;
    float dist = length(diff);
    float f = smoothstep(0.6, 0.0, dist) * uMouseOn * e;
    pos.xy += normalize(diff + 1e-5) * f * 0.2;
    pos.z += f * 0.32;

    vec3 a = grade(aColor, uAp, uAs, uAh, uAm);
    vec3 b = grade(aColor, uBp, uBs, uBh, uBm);
    vColor = mix(a, b, take) + k * 0.35 * vec3(0.78, 0.72, 1.0);
    vAlpha = (0.2 + 0.8 * e);

    vec4 mv = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * (uCamZ / -mv.z) * (1.0 + k * 0.7 + f * 0.9 + (1.0 - e) * 0.6);
  }
`;

const FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 p = gl_PointCoord - 0.5;
    float d = max(abs(p.x), abs(p.y));
    float a = smoothstep(0.5, 0.44, d) * vAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor, a);
  }
`;

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image failed'));
    img.src = src;
  });
}

function setLook(u: Record<string, { value: unknown }>, slot: 'A' | 'B', look: HeroLook) {
  (u[`u${slot}p`].value as number[]).splice(0, 4, ...look.p);
  (u[`u${slot}s`].value as Vector3).set(...look.shadows);
  (u[`u${slot}h`].value as Vector3).set(...look.highlights);
  u[`u${slot}m`].value = look.mono ? 1 : 0;
}

export default function ParticlePhoto({
  src,
  className = '',
  onLook,
}: {
  src: string;
  className?: string;
  /** Called with the index into HERO_LOOKS whenever a new look starts washing in. */
  onLook?: (index: number) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [still] = useState(() => motionReduced());
  const onLookRef = useRef(onLook);
  useEffect(() => {
    onLookRef.current = onLook;
  }, [onLook]);

  useEffect(() => {
    const el = host.current;
    if (!el || still) return;
    let disposed = false;
    let renderer: WebGLRenderer | null = null;
    let raf = 0;
    const cleanups: (() => void)[] = [];

    void (async () => {
      let img: HTMLImageElement;
      try {
        img = await loadImage(src);
      } catch {
        if (!disposed) setFailed(true);
        return;
      }
      if (disposed) return;
      try {
        renderer = new WebGLRenderer({
          antialias: false,
          alpha: true,
          powerPreference: 'high-performance',
        });
      } catch {
        setFailed(true);
        return;
      }
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      renderer.setPixelRatio(dpr);
      renderer.setClearColor(0x000000, 0);
      renderer.domElement.style.display = 'block';
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      renderer.domElement.setAttribute('aria-hidden', 'true');
      el.appendChild(renderer.domElement);

      // Sample the photo into a grid: one particle per cell.
      const small = el.clientWidth < 520;
      const cols = small ? 132 : 210;
      const aspect = img.naturalWidth / img.naturalHeight;
      const rows = Math.round(cols / aspect);
      const cv = document.createElement('canvas');
      cv.width = cols;
      cv.height = rows;
      const cx = cv.getContext('2d', { willReadFrequently: true });
      if (!cx) {
        setFailed(true);
        return;
      }
      cx.drawImage(img, 0, 0, cols, rows);
      const px = cx.getImageData(0, 0, cols, rows).data;
      const n = cols * rows;
      const H = 2;
      const W = H * aspect;
      const target = new Float32Array(n * 3);
      const scatter = new Float32Array(n * 3);
      const color = new Float32Array(n * 3);
      const seed = new Float32Array(n);
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const k = j * cols + i;
          const x = (i / (cols - 1) - 0.5) * W;
          const y = (0.5 - j / (rows - 1)) * H;
          target.set([x, y, 0], k * 3);
          color.set([px[k * 4] / 255, px[k * 4 + 1] / 255, px[k * 4 + 2] / 255], k * 3);
          // The cloud: a loose shell around the plate, deeper toward the back.
          const th = Math.random() * Math.PI * 2;
          const ph = Math.acos(2 * Math.random() - 1);
          const r = 1.6 + Math.random() * 2.2;
          scatter.set(
            [
              Math.cos(th) * Math.sin(ph) * r * 1.4,
              Math.sin(th) * Math.sin(ph) * r * 0.9,
              Math.cos(ph) * r - 1.2,
            ],
            k * 3,
          );
          const centre = Math.hypot(x / W, y / H) / 0.7;
          seed[k] = Math.min(1, Math.random() * 0.55 + centre * 0.45);
        }
      }
      const geo = new BufferGeometry();
      geo.setAttribute('position', new BufferAttribute(target, 3));
      geo.setAttribute('aTarget', new BufferAttribute(target, 3));
      geo.setAttribute('aScatter', new BufferAttribute(scatter, 3));
      geo.setAttribute('aColor', new BufferAttribute(color, 3));
      geo.setAttribute('aSeed', new BufferAttribute(seed, 1));

      const uniforms: Record<string, { value: unknown }> = {
        uTime: { value: 0 },
        uAssemble: { value: 0 },
        uWave: { value: 0 },
        uMouseOn: { value: 0 },
        uBurst: { value: 0 },
        uSize: { value: 4 },
        uCamZ: { value: 5 },
        uMouse: { value: new Vector2(99, 99) },
        uHalf: { value: new Vector2(W / 2, H / 2) },
        uAp: { value: [1, 1, 0, 0] },
        uBp: { value: [1, 1, 0, 0] },
        uAs: { value: new Vector3() },
        uAh: { value: new Vector3() },
        uBs: { value: new Vector3() },
        uBh: { value: new Vector3() },
        uAm: { value: 0 },
        uBm: { value: 0 },
      };
      // vec4 uniforms are plain 4-number arrays (three uploads arrays for vec4 too).
      const mat = new ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms,
        transparent: true,
        depthWrite: false,
        blending: NormalBlending,
      });
      const points = new Points(geo, mat);
      points.frustumCulled = false;
      const plate = new Group();
      plate.add(points);
      const scene = new Scene();
      scene.add(plate);
      const camera = new PerspectiveCamera(32, 1, 0.1, 50);

      const resize = () => {
        if (!renderer) return;
        const w = Math.max(1, el.clientWidth);
        const h = Math.max(1, el.clientHeight);
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        const fov = (camera.fov * Math.PI) / 180;
        const fitH = (H * 1.14) / 2 / Math.tan(fov / 2);
        const fitW = (W * 1.14) / 2 / Math.tan(fov / 2) / camera.aspect;
        const z = Math.max(fitH, fitW);
        camera.position.set(0, 0, z);
        camera.updateProjectionMatrix();
        uniforms.uCamZ.value = z;
        // One cell in device pixels at the plate's depth, a touch over so neighbours meet.
        const pxPerUnit = (h * dpr) / (2 * z * Math.tan(fov / 2));
        uniforms.uSize.value = (W / cols) * pxPerUnit * 1.2;
      };
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(el);
      cleanups.push(() => ro.disconnect());

      // Pointer: project onto the plate's plane.
      const ray = new Raycaster();
      const plane = new Plane(new Vector3(0, 0, 1), 0);
      const hit = new Vector3();
      const ndc = new Vector2();
      const tilt = { x: 0, y: 0, tx: 0, ty: 0 };
      let mouseOn = 0;
      let mouseTarget = 0;
      const move = (e: PointerEvent) => {
        const r = el.getBoundingClientRect();
        ndc.set(
          ((e.clientX - r.left) / r.width) * 2 - 1,
          -((e.clientY - r.top) / r.height) * 2 + 1,
        );
        tilt.tx = ndc.x;
        tilt.ty = ndc.y;
        ray.setFromCamera(ndc, camera);
        if (ray.ray.intersectPlane(plane, hit))
          (uniforms.uMouse.value as Vector2).set(hit.x, hit.y);
        mouseTarget = 1;
      };
      const leave = () => {
        mouseTarget = 0;
        tilt.tx = 0;
        tilt.ty = 0;
      };
      let burst = 0;
      const down = () => {
        burst = 1;
      };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerleave', leave);
      el.addEventListener('pointerdown', down);
      cleanups.push(() => {
        el.removeEventListener('pointermove', move);
        el.removeEventListener('pointerleave', leave);
        el.removeEventListener('pointerdown', down);
      });

      // Only animate while on screen and the tab is visible.
      let visible = true;
      const io = new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        if (visible) start();
      });
      io.observe(el);
      const vis = () => !document.hidden && start();
      document.addEventListener('visibilitychange', vis);
      cleanups.push(() => {
        io.disconnect();
        document.removeEventListener('visibilitychange', vis);
      });

      // Timeline: assemble (2.4 s), hold, then a new look every 3.8 s, each wave taking 1.4 s.
      let current = 0;
      let next = 1;
      let waveStart = -1;
      let nextWaveAt = 3.6;
      let clock = 0;
      let last = performance.now();
      setLook(uniforms, 'A', HERO_LOOKS[0]);
      setLook(uniforms, 'B', HERO_LOOKS[0]);
      onLookRef.current?.(0);

      const frame = (now: number) => {
        raf = 0;
        if (disposed || !renderer) return;
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        clock += dt;
        uniforms.uTime.value = clock;
        uniforms.uAssemble.value = Math.min(1, clock / 2.4);
        mouseOn += (mouseTarget - mouseOn) * Math.min(1, dt * 6);
        uniforms.uMouseOn.value = mouseOn;
        burst *= Math.pow(0.08, dt);
        uniforms.uBurst.value = burst;
        tilt.x += (tilt.tx - tilt.x) * Math.min(1, dt * 3);
        tilt.y += (tilt.ty - tilt.y) * Math.min(1, dt * 3);
        plate.rotation.y = tilt.x * 0.16;
        plate.rotation.x = -tilt.y * 0.1;

        if (waveStart < 0 && clock >= nextWaveAt) {
          waveStart = clock;
          setLook(uniforms, 'A', HERO_LOOKS[current]);
          setLook(uniforms, 'B', HERO_LOOKS[next]);
          onLookRef.current?.(next);
        }
        if (waveStart >= 0) {
          const w = Math.min(1, (clock - waveStart) / 1.4);
          uniforms.uWave.value = 1 - (1 - w) * (1 - w);
          if (w >= 1) {
            current = next;
            next = (next + 1) % HERO_LOOKS.length;
            setLook(uniforms, 'A', HERO_LOOKS[current]);
            uniforms.uWave.value = 0;
            waveStart = -1;
            nextWaveAt = clock + 2.4;
          }
        }
        renderer.render(scene, camera);
        if (visible && !document.hidden) raf = requestAnimationFrame(frame);
      };
      function start() {
        if (!raf && !disposed) {
          last = performance.now();
          raf = requestAnimationFrame(frame);
        }
      }
      start();

      cleanups.push(() => {
        geo.dispose();
        mat.dispose();
      });
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      cleanups.forEach((c) => c());
      if (renderer) {
        renderer.dispose();
        renderer.forceContextLoss();
        renderer.domElement.remove();
      }
    };
  }, [src, still]);

  if (still || failed) {
    return (
      <div className={className}>
        <img src={src} alt="" className="h-full w-full object-contain" />
      </div>
    );
  }
  return <div ref={host} className={`touch-pan-y ${className}`} style={{ cursor: 'crosshair' }} />;
}
