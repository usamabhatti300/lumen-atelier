/**
 * Approximate Lightroom/Camera Raw XMP preset export.
 *
 * Only settings with a reasonable Camera Raw equivalent are written. Values
 * are mapped, not identical: Lumen Atelier's tone, HSL and grading maths
 * (OKLab-based) differ from Adobe's, so the result is a starting point that
 * will look similar rather than the same. Everything not exported is listed
 * in the returned `omitted` array and in an XMP comment.
 */
import { HSL_BANDS, isIdentityCurve, type Adjustments } from '../schema/adjustments';

const ADOBE_BAND: Record<(typeof HSL_BANDS)[number], string> = {
  red: 'Red',
  orange: 'Orange',
  yellow: 'Yellow',
  green: 'Green',
  aqua: 'Aqua',
  blue: 'Blue',
  purple: 'Purple',
  magenta: 'Magenta',
};

const esc = (s: string) => s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!);
const int = (v: number) => String(Math.round(v));
const signed = (v: number) => (Math.round(v) > 0 ? `+${Math.round(v)}` : String(Math.round(v)));

/** OKLCh hue (our wheels) -> approximate HSV hue used by Camera Raw colour grading. */
function toAdobeHue(okHue: number): number {
  // Piecewise mapping measured on fully saturated sRGB primaries/secondaries.
  const table: [number, number][] = [
    [0, 341], [29, 0], [70, 30], [110, 60], [142, 120], [195, 180], [264, 240], [328, 300], [360, 341],
  ];
  for (let i = 0; i < table.length - 1; i++) {
    const [a0, b0] = table[i];
    const [a1, b1] = table[i + 1];
    if (okHue >= a0 && okHue <= a1) {
      const t0 = b0;
      let t1 = b1;
      if (t1 < t0) t1 += 360;
      return Math.round((t0 + ((okHue - a0) / (a1 - a0)) * (t1 - t0)) % 360);
    }
  }
  return Math.round(okHue);
}

export function generateXmp(adj: Adjustments, name: string): { xml: string; omitted: string[] } {
  const b = adj.basic;
  const attrs: Record<string, string> = {
    'crs:PresetType': 'Normal',
    'crs:Version': '15.0',
    'crs:ProcessVersion': '11.0',
    'crs:Exposure2012': (b.exposure >= 0 ? '+' : '') + b.exposure.toFixed(2),
    'crs:Contrast2012': signed(b.contrast),
    'crs:Highlights2012': signed(b.highlights),
    'crs:Shadows2012': signed(b.shadows),
    'crs:Whites2012': signed(b.whites),
    'crs:Blacks2012': signed(b.blacks),
    // Non-raw (JPEG/PNG) files use incremental white balance in Camera Raw.
    'crs:IncrementalTemperature': signed(b.temperature),
    'crs:IncrementalTint': signed(b.tint),
    'crs:Vibrance': signed(b.vibrance),
    'crs:Saturation': signed(b.saturation),
    'crs:Texture': signed(adj.presence.texture),
    'crs:Clarity2012': signed(adj.presence.clarity),
    'crs:Dehaze': signed(adj.presence.dehaze),
    'crs:Sharpness': int(adj.detail.sharpening),
    'crs:LuminanceSmoothing': int(adj.detail.noiseReduction),
    'crs:ColorNoiseReduction': int(adj.detail.colorNoiseReduction),
    'crs:PostCropVignetteAmount': signed(adj.effects.vignette),
    'crs:PostCropVignetteMidpoint': int(adj.effects.vignetteMidpoint),
    'crs:PostCropVignetteRoundness': signed(adj.effects.vignetteRoundness),
    'crs:PostCropVignetteFeather': int(adj.effects.vignetteFeather),
    'crs:GrainAmount': int(adj.effects.grain),
    'crs:GrainSize': int(adj.effects.grainSize),
    'crs:GrainFrequency': int(adj.effects.grainRoughness),
    'crs:ConvertToGrayscale': b.monochrome >= 100 ? 'True' : 'False',
    'crs:ColorGradeBlending': int(adj.grading.blending),
    'crs:ColorGradeBalance': signed(adj.grading.balance),
  };
  for (const band of HSL_BANDS) {
    const h = adj.hsl[band];
    attrs[`crs:HueAdjustment${ADOBE_BAND[band]}`] = signed(h.hue);
    attrs[`crs:SaturationAdjustment${ADOBE_BAND[band]}`] = signed(h.saturation);
    attrs[`crs:LuminanceAdjustment${ADOBE_BAND[band]}`] = signed(h.luminance);
  }
  const zones = { shadows: 'Shadow', midtones: 'Midtone', highlights: 'Highlight', global: 'Global' } as const;
  for (const [key, adobe] of Object.entries(zones)) {
    const w = adj.grading[key as keyof typeof zones];
    attrs[`crs:ColorGrade${adobe}Hue`] = int(toAdobeHue(w.hue));
    attrs[`crs:ColorGrade${adobe}Sat`] = int(w.saturation);
    attrs[`crs:ColorGrade${adobe}Lum`] = signed(w.luminance);
  }

  const curve = (pts: [number, number][]) =>
    `<rdf:Seq>${pts.map(([x, y]) => `<rdf:li>${Math.round(x * 255)}, ${Math.round(y * 255)}</rdf:li>`).join('')}</rdf:Seq>`;
  const curves = [
    ['crs:ToneCurvePV2012', adj.curves.master],
    ['crs:ToneCurvePV2012Red', adj.curves.red],
    ['crs:ToneCurvePV2012Green', adj.curves.green],
    ['crs:ToneCurvePV2012Blue', adj.curves.blue],
  ] as const;

  const omitted: string[] = [
    'Exact rendering: tone, HSL and colour-grading maths differ between apps, so the look is approximate.',
    'HSL hue shifts and grading hues are converted between colour models.',
  ];
  const m = adj.mixer;
  if (m.red.r !== 100 || m.red.g || m.red.b || m.green.g !== 100 || m.green.r || m.green.b || m.blue.b !== 100 || m.blue.r || m.blue.g)
    omitted.push('Channel mixer (no Camera Raw equivalent for colour photos)');
  const lv = adj.levels;
  if (lv.inBlack || lv.inWhite !== 255 || lv.gamma !== 1 || lv.outBlack || lv.outWhite !== 255) omitted.push('Levels (bake them into the tone curve instead)');
  if (adj.basic.brightness) omitted.push('Brightness (no direct equivalent in Process Version 2012+)');
  if (adj.basic.monochrome > 0 && adj.basic.monochrome < 100) omitted.push('Partial monochrome (only full black-and-white is exported)');
  omitted.push('Sharpen edge masking uses a different scale; masks, retouching, crop and LUTs are not part of presets.');

  const attrText = Object.entries(attrs)
    .map(([k, v]) => `   ${k}="${esc(v)}"`)
    .join('\n');
  const curveText = curves
    .filter(([, pts]) => !isIdentityCurve(pts))
    .map(([k, pts]) => `   <${k}>${curve(pts)}</${k}>`)
    .join('\n');
  const xml = `<x:xmpmeta xmlns:x="adobe:ns:meta/" x:xmptk="Lumen Atelier">
 <!-- Approximate conversion from Lumen Atelier. Not exported: ${esc(omitted.join(' | '))} -->
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
   xmlns:crs="http://ns.adobe.com/camera-raw-settings/1.0/"
${attrText}>
   <crs:Name><rdf:Alt><rdf:li xml:lang="x-default">${esc(name)}</rdf:li></rdf:Alt></crs:Name>
   <crs:Group><rdf:Alt><rdf:li xml:lang="x-default">Lumen Atelier</rdf:li></rdf:Alt></crs:Group>
${curveText}
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
`;
  return { xml, omitted };
}
