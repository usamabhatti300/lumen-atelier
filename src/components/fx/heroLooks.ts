/** The looks the home hero washes across its particle photo (shader approximations of real rolls). */
export interface HeroLook {
  /** Shown under the plate, e.g. "roll 03 · Late Showing". */
  label: string;
  /** contrast, saturation, warmth (−1..1), fade (lifted blacks 0..0.2) */
  p: [number, number, number, number];
  /** Split toning added to shadows and highlights (rgb offsets). */
  shadows: [number, number, number];
  highlights: [number, number, number];
  mono?: boolean;
}

export const HERO_LOOKS: HeroLook[] = [
  { label: 'as shot', p: [1, 1, 0, 0], shadows: [0, 0, 0], highlights: [0, 0, 0] },
  {
    label: 'roll 03 · Late Showing',
    p: [1.2, 0.82, 0.12, 0.03],
    shadows: [-0.03, 0.03, 0.07],
    highlights: [0.07, 0.025, -0.05],
  },
  {
    label: 'roll 04 · Blue Hour Tapes',
    p: [0.9, 0.62, -0.65, 0.08],
    shadows: [0, 0.02, 0.07],
    highlights: [-0.01, 0.02, 0.05],
  },
  {
    label: 'roll 06 · Golden Minutes',
    p: [1.06, 1.28, 0.85, 0.02],
    shadows: [0.02, 0, -0.02],
    highlights: [0.07, 0.03, -0.04],
  },
  {
    label: 'roll 08 · Monochrome Diary',
    p: [1.32, 0, 0, 0.03],
    shadows: [0, 0, 0],
    highlights: [0, 0, 0],
    mono: true,
  },
  {
    label: 'roll 02 · Basement Summer',
    p: [0.9, 0.88, 0.5, 0.11],
    shadows: [0.03, 0, 0.04],
    highlights: [0.05, 0.025, 0],
  },
];
