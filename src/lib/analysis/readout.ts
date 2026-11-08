/**
 * A camera-style info readout of what was measured in a reference photo ("Afterimage": the match
 * result reads like a digicam's info screen). Words only, from the measured statistics, using the
 * same thresholds as `describeStyle` and the mapping, so the readout never disagrees with the look
 * that was built.
 */
import { CANONICAL } from './mapping';
import type { ImageStats } from './stats';

export interface ReadoutRow {
  label: string;
  value: string;
}

export function cameraReadout(s: ImageStats): ReadoutRow[] {
  const rows: ReadoutRow[] = [];
  const pc = s.percentiles;

  const light = pc.p50 < 0.3 ? 'dark, low-key' : pc.p50 > 0.62 ? 'bright, airy' : 'balanced';
  rows.push({ label: 'exposure', value: light });

  const spread = pc.p95 - pc.p5;
  const contrast = spread > 0.86 ? 'high' : spread < 0.62 ? 'low' : 'medium';
  const ends: string[] = [];
  if (s.blackFloor > 0.055) ends.push('lifted blacks');
  if (s.whiteCeiling < 0.9) ends.push('soft whites');
  rows.push({ label: 'contrast', value: [contrast, ...ends].join(', ') });

  if (s.monochrome) {
    rows.push({ label: 'colour', value: 'black & white' });
  } else {
    const castC = Math.hypot(s.cast.a, s.cast.b);
    let wb = 'neutral';
    if (castC > 0.006) {
      wb = s.cast.b > 0 ? 'warm' : 'cool';
      if (Math.abs(s.cast.a) > 0.004) wb += s.cast.a > 0 ? ', a little magenta' : ', a little green';
    }
    rows.push({ label: 'white balance', value: wb });
    const satRatio = s.chroma.p50 / CANONICAL.chromaP50;
    rows.push({ label: 'colour', value: satRatio < 0.7 ? 'muted' : satRatio > 1.4 ? 'vivid' : 'natural' });
  }

  if (s.grain !== null) {
    rows.push({ label: 'grain', value: s.grain < 0.008 ? 'clean' : s.grain < 0.018 ? 'fine' : 'visible' });
  }
  const falloff = 1 - s.vignette.ratio;
  if (falloff > 0.12 && s.vignette.symmetry > 0.6) rows.push({ label: 'vignette', value: falloff > 0.3 ? 'strong' : 'subtle' });

  return rows;
}
