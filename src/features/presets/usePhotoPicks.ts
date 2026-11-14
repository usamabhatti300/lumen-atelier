/**
 * "For this photo": the looks picked for the open photo, from measured traits of its pixels
 * (lib/presets/recommend.ts). Null while there is no photo to measure yet.
 */
import { useEffect, useState } from 'react';
import { photoSample } from '@/engine/lookAdapt';
import { thumbSourceListeners } from '@/engine/presetThumbs';
import { usePortraitStore } from '@/features/portrait/portraitState';
import { describeTraits, photoTraits, recommendLooks } from '@/lib/presets/recommend';
import { useEditor } from '@/state/editorStore';
import { BUILTIN_SUITS } from '@/state/presetStore';

export interface PhotoPicks {
  /** Look ids, best first. */
  ids: string[];
  /** "dark · warm · a face": what was measured. */
  traits: string;
}

export const PICK_COUNT = 6;

export function usePhotoPicks(enabled: boolean): PhotoPicks | null {
  const photoId = useEditor((s) => s.activePhotoId);
  const faces = usePortraitStore((s) => (photoId ? (s.faces[photoId] ?? 0) : 0));
  const [picks, setPicks] = useState<{ photoId: string; picks: PhotoPicks } | null>(null);
  // The preview source changes when the photo's pixels are ready (and again after removals).
  const [source, setSource] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const fn = () => setSource((n) => n + 1);
    thumbSourceListeners.add(fn);
    return () => void thumbSourceListeners.delete(fn);
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !photoId) return;
    const lin = photoSample();
    if (!lin) return;
    const traits = photoTraits(lin, faces > 0);
    const ids = recommendLooks(traits, BUILTIN_SUITS, PICK_COUNT);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- derived from engine pixels, which React can't subscribe to
    setPicks({ photoId, picks: { ids, traits: describeTraits(traits) } });
  }, [enabled, photoId, faces, source]);

  return picks && picks.photoId === photoId ? picks.picks : null;
}
