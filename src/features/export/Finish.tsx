/**
 * Finish: the step between editing and export, at the top of the export dialog (DESIGN.md). The
 * user's own additions (the date stamp now; frames, text and stickers later) are shown here on a
 * preview of the exported image, never on the editing view. The preview is drawn by the same
 * functions as the export (`drawStamp`, `drawContactSheet`), so it matches the file.
 */
import { useEffect, useRef } from 'react';
import { Check } from 'lucide-react';
import { Segmented, Toggle } from '@/components/ui/misc';
import { useEditor } from '@/state/editorStore';
import { engine } from '@/engine/controller';
import { stampDateFor } from '@/engine/batch';
import { drawStamp, isIsoDate, isoDate, loadFinishFonts, STAMP_PLACEMENTS, type StampOptions, type StampPlacement } from '@/lib/finish/stamp';
import { contactSheetLayout, drawContactSheet, MAX_SHEET_FRAMES, SHEET_RATIOS, type SheetFrame, type SheetRatio } from '@/lib/finish/contactSheet';

export type FinishMode = 'photo' | 'sheet';

/** The photo as it looks now: the live render for the open photo, else its thumbnail. */
async function previewSource(id: string): Promise<{ image: CanvasImageSource; width: number; height: number } | null> {
  if (engine.getActivePhotoId() === id) {
    const snap = engine.snapshot(1080);
    if (snap) return { image: snap, width: snap.width, height: snap.height };
  }
  const url = useEditor.getState().photos.find((p) => p.id === id)?.thumbUrl;
  if (!url) return null;
  const img = new Image();
  img.src = url;
  try {
    await img.decode();
  } catch {
    return null;
  }
  return { image: img, width: img.naturalWidth, height: img.naturalHeight };
}

export function FinishPreview({
  mode,
  photoId,
  sheetIds,
  stamp,
  ratio,
}: {
  mode: FinishMode;
  photoId: string | undefined;
  sheetIds: string[];
  stamp: StampOptions | null;
  ratio: SheetRatio;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const key = `${mode}|${photoId}|${sheetIds.join(',')}|${stamp?.placement}|${stamp?.date}|${ratio}`;

  useEffect(() => {
    let alive = true;
    void (async () => {
      await loadFinishFonts();
      const c = canvas.current;
      if (!c || !alive) return;
      const ctx = c.getContext('2d');
      if (!ctx) return;
      if (mode === 'photo') {
        if (!photoId) return;
        const src = await previewSource(photoId);
        if (!src || !alive) return;
        c.width = src.width;
        c.height = src.height;
        ctx.drawImage(src.image, 0, 0, src.width, src.height);
        if (stamp) drawStamp(ctx, { x: 0, y: 0, w: src.width, h: src.height }, stampDateFor(photoId, stamp.date), stamp.placement);
        return;
      }
      const frames: SheetFrame[] = [];
      for (const id of sheetIds) {
        const src = await previewSource(id);
        if (!src) continue;
        const edit = id === useEditor.getState().activePhotoId ? useEditor.getState().edit : useEditor.getState().stash[id]?.edit;
        frames.push({ ...src, look: edit?.appliedPreset?.name, date: stampDateFor(id, stamp?.date ?? null) });
      }
      if (!alive) return;
      const layout = contactSheetLayout(frames.length, ratio, 1080, frames.map((f) => f.width / f.height));
      c.width = layout.width;
      c.height = layout.height;
      drawContactSheet(ctx, layout, frames, { stamp: stamp?.placement ?? null, today: isoDate() });
    })();
    return () => {
      alive = false;
    };
    // `key` captures every input that changes the picture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <div className="flex justify-center rounded-lg border border-line-soft bg-well p-2">
      <canvas
        ref={canvas}
        role="img"
        aria-label={mode === 'sheet' ? 'Preview of the contact sheet' : 'Preview of the exported photo'}
        data-testid="finish-preview"
        className="block h-auto max-h-[34vh] w-auto max-w-full rounded-sm"
      />
    </div>
  );
}

/** A small corner mark: which corner of the photo the stamp goes in. */
function CornerIcon({ placement }: { placement: StampPlacement }) {
  const pos = { 'bottom-right': 'right-[2px] bottom-[2px]', 'bottom-left': 'left-[2px] bottom-[2px]', 'top-right': 'right-[2px] top-[2px]', 'top-left': 'left-[2px] top-[2px]' }[placement];
  return (
    <span aria-hidden className="relative block h-3.5 w-[18px] rounded-[3px] border border-current">
      <span className={`absolute h-[3px] w-[6px] rounded-[1px] bg-current ${pos}`} />
    </span>
  );
}

export function StampControls({
  on,
  setOn,
  placement,
  setPlacement,
  date,
  setDate,
  shownDate,
}: {
  on: boolean;
  setOn: (v: boolean) => void;
  placement: StampPlacement;
  setPlacement: (p: StampPlacement) => void;
  /** The chosen date, or null for each photo's own date. */
  date: string | null;
  setDate: (d: string | null) => void;
  /** What the date field shows when no date is chosen (the photo's own date), or '' for several photos. */
  shownDate: string;
}) {
  return (
    <div>
      <Toggle checked={on} onChange={setOn} label="Date stamp" description="The date in orange, like an old digital camera." />
      {on && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-3">
          <label className="flex items-center gap-2">
            <span className="label-caps text-fg-3">date</span>
            <input
              type="date"
              aria-label="Stamp date"
              value={date ?? shownDate}
              onChange={(e) => setDate(isIsoDate(e.target.value) ? e.target.value : null)}
              className="h-9 rounded-full bg-well px-3 font-mono text-[13px] text-fg ring-1 ring-line-soft [color-scheme:dark] focus-visible:outline-2 focus-visible:outline-accent-fg coarse:h-10"
            />
          </label>
          <Segmented
            label="Stamp placement"
            value={placement}
            onChange={setPlacement}
            options={STAMP_PLACEMENTS.map((p) => ({
              value: p.value,
              title: p.label,
              label: (
                <>
                  <CornerIcon placement={p.value} />
                  <span className="sr-only">{p.label}</span>
                </>
              ),
            }))}
          />
          {date ? (
            <button type="button" onClick={() => setDate(null)} className="text-xs text-fg-2 underline-offset-2 hover:text-fg hover:underline">
              Use each photo's own date
            </button>
          ) : !shownDate ? (
            <p className="w-full text-xs text-fg-3">Each photo shows the day it was taken. Pick a date to use one for all.</p>
          ) : null}
        </div>
      )}
    </div>
  );
}

export function SheetControls({
  ratio,
  setRatio,
  selected,
  setSelected,
}: {
  ratio: SheetRatio;
  setRatio: (r: SheetRatio) => void;
  selected: string[];
  setSelected: (ids: string[]) => void;
}) {
  const photos = useEditor((s) => s.photos);
  const toggle = (id: string) => {
    if (selected.includes(id)) {
      if (selected.length > 1) setSelected(selected.filter((x) => x !== id));
    } else if (selected.length < MAX_SHEET_FRAMES) {
      // Keep the project's order, so frame numbers follow the shoot.
      const next = new Set([...selected, id]);
      setSelected(photos.map((p) => p.id).filter((x) => next.has(x)));
    }
  };
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="label-caps text-fg-3">
          frames · {selected.length} of {Math.min(MAX_SHEET_FRAMES, photos.length)}
        </p>
        <Segmented label="Sheet shape" value={ratio} onChange={setRatio} options={SHEET_RATIOS} />
      </div>
      <ul className="scroll-quiet -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" aria-label="Photos on the contact sheet">
        {photos.map((p) => {
          const n = selected.indexOf(p.id);
          const on = n >= 0;
          return (
            <li key={p.id} className="shrink-0">
              <button
                type="button"
                aria-pressed={on}
                aria-label={`${on ? 'Leave out' : 'Add'} ${p.name}`}
                onClick={() => toggle(p.id)}
                disabled={!on && selected.length >= MAX_SHEET_FRAMES}
                className={`relative block h-14 w-14 overflow-hidden rounded-md bg-raised-2 transition-[box-shadow,opacity] disabled:opacity-40 coarse:h-16 coarse:w-16 ${on ? 'shadow-selected' : 'opacity-60'}`}
              >
                {p.thumbUrl && <img src={p.thumbUrl} alt="" className="h-full w-full object-cover" />}
                {on && (
                  <>
                    <span className="absolute top-1 left-1 rounded-sm bg-black/70 px-1 font-mono text-[11px] text-white">{String(n + 1).padStart(2, '0')}</span>
                    <Check size={13} strokeWidth={3} className="absolute right-1 bottom-1 text-accent" />
                  </>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
