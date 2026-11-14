import { useTilt } from '@/components/fx/useTilt';
import { AnimatePresence, motion } from 'motion/react';
import { publishLookSequence } from '@/features/editor/lookSequence';
import { isoDate, stampText } from '@/lib/finish/stamp';
import { Check, Copy, Download, MoreHorizontal, Pencil, Search, Star, Trash2, Blend, X } from 'lucide-react';
import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { usePresets, ALL_CATEGORY_LABELS, downloadText } from '@/state/presetStore';
import { useEditor } from '@/state/editorStore';
import { presetThumb, thumbSourceListeners, previewSourceId } from '@/engine/presetThumbs';
import type { Preset, PresetCategoryId } from '@/lib/schema/preset';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { ROLL_IDS, rollOf } from '@/lib/presets/rolls';
import { usePhotoPicks } from './usePhotoPicks';

type Filter = 'all' | 'foryou' | 'favorites' | 'recent' | 'yours' | PresetCategoryId;
type Mode = 'rolls' | 'kept' | 'recent' | 'yours';

const MODES: { id: Mode; label: string }[] = [
  { id: 'rolls', label: 'Rolls' },
  { id: 'kept', label: 'Kept' },
  { id: 'recent', label: 'Last roll' },
  { id: 'yours', label: 'Yours' },
];

/** Today as a digicam date stamp: '26 11 08. */
const dateStamp = () => stampText(isoDate());

/**
 * `panel`: side panel grid. `page`: the preset library. `strip`: phones, one row of square
 * thumbnails with the name underneath (the filter row of most phone editors) that scrolls
 * sideways under the photo, with search behind an icon. Favourite / more actions live in the
 * expanded grid, so nothing covers the small previews.
 */
export function PresetBrowser({
  variant = 'panel',
  onApply,
  canApply = true,
  actionVerb = 'Apply',
  initialFilter,
  trailing,
}: {
  /** Extra control at the end of the switch row (the phone sheet's close button). */
  trailing?: ReactNode;
  variant?: 'panel' | 'page' | 'strip';
  onApply?: (p: Preset) => void;
  canApply?: boolean;
  actionVerb?: string;
  initialFilter?: PresetCategoryId;
}) {
  const load = usePresets((s) => s.load);
  const user = usePresets((s) => s.user);
  const favorites = usePresets((s) => s.favorites);
  const recent = usePresets((s) => s.recent);
  const all = usePresets((s) => s.all);
  const [query, setQuery] = useState('');
  // In the editor the browser opens on the looks picked for the open photo; elsewhere on roll 01.
  const inEditor = variant !== 'page' && !!onApply;
  const [filter, setFilter] = useState<Filter>(initialFilter ?? (inEditor ? 'foryou' : variant === 'page' ? 'all' : 'signature'));
  const picks = usePhotoPicks(inEditor);
  // Grid tiles take the photo's shape (between 4:5 and 3:2), so a look is judged on the whole
  // picture, not on a tall slice of a wide photo. The first preview to load gives the shape.
  const [tileRatio, setTileRatio] = useState<number | null>(null);
  const onPreviewSize = useCallback((w: number, h: number) => {
    if (w > 0 && h > 0) setTileRatio(Math.min(1.5, Math.max(0.8, w / h)));
  }, []);
  const [editing, setEditing] = useState<Preset | null>(null);
  const [deleting, setDeleting] = useState<Preset | null>(null);
  const appliedId = useEditor((s) => s.edit.appliedPreset?.id);
  const strip = variant === 'strip';
  const [searching, setSearching] = useState(false);
  // Phones: press and hold a look in the strip to see it large without applying it.
  const [peek, setPeek] = useState<{ preset: Preset; url: string | null } | null>(null);

  useEffect(() => {
    void load();
  }, [load]);

  const presets = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = (p: Preset) => {
      if (!q) return true;
      const roll = rollOf(p.category);
      return `${p.name} ${p.description} ${p.tags.join(' ')} ${ALL_CATEGORY_LABELS[p.category]} ${roll.name} ${roll.mood}`.toLowerCase().includes(q);
    };
    // For this photo: the measured picks, best first (roll 01 until the photo has been measured).
    if (filter === 'foryou') {
      const byId = new Map(all().map((p) => [p.id, p]));
      const chosen = picks?.ids.map((id) => byId.get(id)).filter((p): p is Preset => !!p) ?? [];
      return (chosen.length ? chosen : all().filter((p) => p.category === 'signature')).filter(matches);
    }
    // Last roll keeps the order the looks were applied in, newest first.
    if (filter === 'recent') {
      const byId = new Map(all().map((p) => [p.id, p]));
      return recent.map((id) => byId.get(id)).filter((p): p is Preset => !!p && matches(p));
    }
    return all().filter((p) => {
      if (filter === 'favorites' && !favorites.includes(p.id)) return false;
      if (filter === 'yours') return p.origin !== 'builtin' && matches(p);
      if (filter !== 'all' && filter !== 'favorites' && p.category !== filter) return false;
      return matches(p);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, filter, favorites, recent, user, all, picks]);

  // The editor's browser tells a swipe on the photo which looks to step through (roadmap 2.1).
  useEffect(() => {
    if (inEditor) publishLookSequence(presets.map((p) => p.id));
  }, [inEditor, presets]);

  // Frame numbers ("04·07": roll 4, frame 7) are stable: counted over the whole library, not the filtered view.
  const numbers = useMemo(() => {
    const seen = new Map<string, number>();
    const out = new Map<string, string>();
    for (const p of all()) {
      const n = seen.get(p.category) ?? 0;
      seen.set(p.category, n + 1);
      const roll = rollOf(p.category).no;
      const frame = String(n + 1).padStart(2, '0');
      out.set(p.id, roll === '—' ? frame : `${roll}·${frame}`);
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, all]);

  // One switch picks the collection: Rolls (then a row of rolls), Kept, Last roll, Yours.
  const mode: Mode = filter === 'favorites' ? 'kept' : filter === 'recent' ? 'recent' : filter === 'yours' ? 'yours' : 'rolls';
  // Coming back to Rolls reopens the roll you were on.
  const [lastRoll, setLastRoll] = useState<Filter>(filter);
  const pickMode = (m: Mode) => {
    if (m === mode) return;
    setFilter(m === 'kept' ? 'favorites' : m === 'recent' ? 'recent' : m === 'yours' ? 'yours' : lastRoll);
  };
  const rolls: Filter[] = [...(inEditor ? (['foryou'] as const) : []), ...ROLL_IDS, 'all'];
  const stamp = useMemo(() => dateStamp(), []);
  const roll = mode === 'rolls' && filter !== 'all' && filter !== 'foryou' ? rollOf(filter) : null;
  const hasQuery = query.trim().length > 0;
  // Keep the open roll's tab fully in view (it never sits cut off at the edge).
  const rollTabs = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const row = rollTabs.current;
    const tab = row?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!row || !tab) return;
    const left = tab.offsetLeft - row.offsetLeft;
    if (left < row.scrollLeft + 12 || left + tab.offsetWidth > row.scrollLeft + row.clientWidth - 28)
      row.scrollTo({ left: Math.max(0, left - 24), behavior: 'smooth' });
  }, [filter, mode]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={`shrink-0 space-y-2 ${variant === 'panel' ? 'px-3 pt-3 pb-2' : strip ? 'px-3 pt-1 pb-2' : 'pb-4'}`}>
        {strip && !searching ? null : (
        <label className="relative block">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-fg-4" />
          <span className="sr-only">Search looks</span>
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              // Search the whole library, not only the open category (Kept and Last roll stay filters).
              if (e.target.value.trim() && mode === 'rolls' && filter !== 'all') setFilter('all');
              // Clearing the search goes back to the roll you were on.
              else if (!e.target.value.trim() && mode === 'rolls' && filter === 'all' && lastRoll !== 'all') setFilter(lastRoll);
            }}
            placeholder={`Search ${all().length} looks`}
            autoFocus={strip}
            className={`w-full rounded-full border border-line-soft bg-well pr-10 pl-10 text-fg placeholder:text-fg-4 transition-colors focus:border-accent/60 focus:outline-none ${variant === 'page' ? 'h-12 text-[15px]' : 'h-9 text-[13px] coarse:h-10 coarse:text-sm'}`}
          />
          {strip && (
            <button
              type="button"
              aria-label="Close search"
              onClick={() => {
                setSearching(false);
                setQuery('');
              }}
              className="absolute top-1/2 right-1 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-fg-3 hover:bg-control"
            >
              <X size={15} />
            </button>
          )}
        </label>
        )}
        <div className="flex items-center gap-2">
          <div role="radiogroup" aria-label="Look collections" className="flex min-w-0 flex-1 rounded-full border border-line bg-well p-[3px]">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                role="radio"
                aria-checked={mode === m.id}
                onClick={() => pickMode(m.id)}
                className={`relative h-8 flex-1 rounded-full px-2 text-[13px] font-medium whitespace-nowrap transition-colors coarse:h-11 ${mode === m.id ? 'text-fg' : 'text-fg-4 hover:text-fg-2'}`}
              >
                {mode === m.id && (
                  <motion.span
                    layoutId={`look-mode-${variant}`}
                    className="absolute inset-0 rounded-full bg-raised-2 ring-1 ring-line"
                    transition={{ type: 'spring', stiffness: 520, damping: 40 }}
                  />
                )}
                <span className="relative">{m.label}</span>
              </button>
            ))}
          </div>
          {strip && !searching && (
            <button
              type="button"
              aria-label="Search looks"
              onClick={() => setSearching(true)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-fg-3 hover:text-fg coarse:h-11 coarse:w-11"
            >
              <Search size={16} />
            </button>
          )}
          {trailing}
        </div>
        {/* Rolls: a slim mono row of the numbered rolls, then "all". */}
        {mode === 'rolls' && (
          <div
            ref={rollTabs}
            // A mouse wheel turns the row sideways (it has no visible scrollbar).
            onWheel={(e) => {
              if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) e.currentTarget.scrollLeft += e.deltaY;
            }}
            role="tablist"
            aria-label="Rolls"
            className={`no-scrollbar flex gap-4 overflow-x-auto ${variant === 'page' ? '-mx-4 px-4 sm:mx-0 sm:flex-wrap sm:gap-x-5 sm:gap-y-1 sm:px-0' : '-mx-3 px-3 [mask-image:linear-gradient(90deg,transparent,#000_12px,#000_calc(100%-36px),transparent)]'}`}
          >
            {rolls.map((f) => (
              <button
                key={f}
                type="button"
                role="tab"
                aria-selected={filter === f}
                onClick={() => {
                  setFilter(f);
                  setLastRoll(f);
                }}
                className={`flex h-8 shrink-0 items-baseline gap-1.5 border-b-[1.5px] pt-2 font-mono text-[11px] lowercase whitespace-nowrap transition-colors [font-stretch:87.5%] coarse:h-11 coarse:pt-3.5 ${
                  filter === f ? 'border-accent text-fg' : 'border-transparent text-fg-4 hover:text-fg-2'
                }`}
              >
                {f === 'all' ? (
                  'All'
                ) : f === 'foryou' ? (
                  'For this photo'
                ) : (
                  <>
                    <span aria-hidden className={filter === f ? 'text-accent-fg' : 'text-fg-4/70'}>
                      {rollOf(f).no}
                    </span>
                    {rollOf(f).name}
                  </>
                )}
              </button>
            ))}
          </div>
        )}
        {/* The open roll's mood (grids only; the phone strip keeps its fixed height). */}
        {!strip && (
          <p className={`label-caps text-fg-3 ${filter === 'foryou' ? '' : 'truncate'}`}>
            {hasQuery ? (
              `${presets.length} ${presets.length === 1 ? 'look' : 'looks'} for “${query.trim()}”`
            ) : filter === 'foryou' ? (
              picks ? (
                <>
                  <span className="text-fg">picked for this photo</span>
                  {picks.traits && ` · ${picks.traits}`}
                </>
              ) : (
                'a good place to start'
              )
            ) : roll ? (
              <>
                {roll.no !== '—' && <span className="text-fg-2">roll {roll.no} · </span>}
                <span className="text-fg">{roll.name.toLowerCase()}</span> · {roll.mood}
              </>
            ) : filter === 'recent' ? (
              'the looks you used last, newest first'
            ) : filter === 'favorites' ? (
              'looks you kept with the star'
            ) : filter === 'yours' ? (
              'looks you saved or matched'
            ) : (
              `every look · ${all().length}`
            )}
          </p>
        )}
      </div>
      <div className={`scroll-quiet min-h-0 flex-1 ${strip ? 'overflow-hidden' : 'overflow-y-auto'} ${variant === 'panel' ? 'px-3 pb-4' : ''}`}>
        {presets.length === 0 ? (
          <p className="py-10 text-center text-sm text-fg-3">
            {query.trim()
              ? 'No looks match your search.'
              : filter === 'favorites'
                ? 'Nothing kept yet. Star a look to keep it here.'
                : filter === 'recent'
                  ? 'Looks you put on a photo will show up here.'
                  : filter === 'yours'
                    ? 'Looks you save or match from a reference will show up here.'
                    : 'No looks here yet.'}
          </p>
        ) : (
          <ul
            className={
              strip
                ? 'no-scrollbar flex gap-2 overflow-x-auto overscroll-x-contain px-3 pt-2 pb-3'
                : `grid ${variant === 'panel' ? 'grid-cols-2 gap-2' : 'grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6'}`
            }
            aria-label="Looks"
            style={strip || !tileRatio ? undefined : ({ '--tile-ratio': String(tileRatio) } as React.CSSProperties)}
          >
            {presets.map((p) => (
              <PresetCard
                key={p.id}
                preset={p}
                active={appliedId === p.id}
                favorite={favorites.includes(p.id)}
                onApply={canApply ? onApply : undefined}
                onEdit={setEditing}
                onDelete={setDeleting}
                large={variant === 'page'}
                strip={strip}
                actionVerb={actionVerb}
                catalogue={numbers.get(p.id)}
                stamp={stamp}
                onPeek={strip ? setPeek : undefined}
                onPreviewSize={strip ? undefined : onPreviewSize}
              />
            ))}
          </ul>
        )}
      </div>
      {strip && <LookPeek peek={peek} catalogue={peek ? numbers.get(peek.preset.id) : undefined} />}
      <PresetEditDialog key={editing?.id ?? 'none'} preset={editing} onClose={() => setEditing(null)} />
      <Dialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete look?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (deleting) void usePresets.getState().remove(deleting.id);
                setDeleting(null);
              }}
            >
              Delete look
            </Button>
          </>
        }
      >
        <p className="px-5 pb-5 text-sm leading-relaxed text-fg-3">
          “{deleting?.name}” will be removed. Photos already edited with it keep their settings.
        </p>
      </Dialog>
    </div>
  );
}

const PresetCard = memo(function PresetCard({
  preset,
  active,
  favorite,
  onApply,
  onEdit,
  onDelete,
  large,
  strip,
  actionVerb,
  catalogue,
  stamp,
  onPeek,
  onPreviewSize,
}: {
  /** Grids only: reports a loaded preview's pixel size (the photo's shape). */
  onPreviewSize?: (w: number, h: number) => void;
  /** Strip only: press and hold shows the look large (null when let go). */
  onPeek?: (p: { preset: Preset; url: string | null } | null) => void;
  actionVerb: string;
  catalogue?: string;
  /** Today's date stamp, shown on the chosen look. */
  stamp?: string;
  strip?: boolean;
  preset: Preset;
  active: boolean;
  favorite: boolean;
  onApply?: (p: Preset) => void;
  onEdit: (p: Preset) => void;
  onDelete: (p: Preset) => void;
  large: boolean;
}) {
  const [thumb, setThumb] = useState<{ key: string; url: string } | null>(null);
  const [sourceId, setSourceId] = useState(previewSourceId());
  const [menu, setMenu] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const toggleFavorite = usePresets((s) => s.toggleFavorite);
  const duplicate = usePresets((s) => s.duplicate);
  const isUser = preset.origin !== 'builtin';

  useEffect(() => {
    const fn = (id: string) => setSourceId(id);
    thumbSourceListeners.add(fn);
    return () => void thumbSourceListeners.delete(fn);
  }, []);

  // Grids render previews only for tiles on or near the screen (the strip is short enough to
  // render in order). Tiles that scroll away before their turn give their place up.
  const item = useRef<HTMLLIElement>(null);
  const [near, setNear] = useState(strip);
  useEffect(() => {
    if (near || !item.current || typeof IntersectionObserver === 'undefined') return setNear(true);
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setNear(true), { rootMargin: '400px 0px' });
    io.observe(item.current);
    return () => io.disconnect();
  }, [near]);
  const thumbKey = `${sourceId}:${preset.id}`;
  useEffect(() => {
    if (!near) return;
    const ctrl = new AbortController();
    presetThumb(preset.id, preset.adjustments, ctrl.signal).then((u) => !ctrl.signal.aborted && setThumb({ key: thumbKey, url: u }), () => undefined);
    return () => ctrl.abort();
  }, [preset.id, preset.adjustments, thumbKey, near]);
  const url = thumb?.key === thumbKey ? thumb.url : null;
  const tilt = useTilt<HTMLButtonElement>(6);
  const holdTimer = useRef(0);
  const press = useRef<{ x: number; y: number } | null>(null);
  const peeked = useRef(false);
  const endPeek = () => {
    window.clearTimeout(holdTimer.current);
    press.current = null;
    if (peeked.current) onPeek?.(null);
  };

  // Phones: a frame from a contact strip with the look's name under it, so you know what you are
  // about to try. Press and hold for a large preview without applying it.
  if (strip) {
    return (
      <li ref={item} className="w-[96px] shrink-0">
        <button
          type="button"
          onClick={(e) => {
            if (peeked.current) {
              peeked.current = false;
              e.preventDefault();
              return;
            }
            onApply?.(preset);
          }}
          onPointerDown={(e) => {
            peeked.current = false;
            if (!onPeek) return;
            press.current = { x: e.clientX, y: e.clientY };
            window.clearTimeout(holdTimer.current);
            holdTimer.current = window.setTimeout(() => {
              peeked.current = true;
              onPeek({ preset, url });
            }, 380);
          }}
          onPointerMove={(e) => {
            const p0 = press.current;
            if (p0 && Math.hypot(e.clientX - p0.x, e.clientY - p0.y) > 8) {
              window.clearTimeout(holdTimer.current);
              press.current = null;
            }
          }}
          onPointerUp={endPeek}
          onPointerCancel={endPeek}
          onPointerLeave={endPeek}
          onContextMenu={(e) => e.preventDefault()}
          disabled={!onApply}
          aria-pressed={active}
          aria-label={`${onApply ? actionVerb : 'Look'} ${preset.name}`}
          title={preset.description ? `${preset.name}: ${preset.description}` : preset.name}
          className={`relative flex w-full flex-col gap-1.5 rounded-[8px] border bg-well px-1 pt-2 pb-1.5 text-left transition-[transform,box-shadow,border-color] duration-200 select-none [-webkit-touch-callout:none] enabled:active:scale-[0.95] ${
            active ? 'border-accent shadow-offset-sm' : 'border-line'
          }`}
        >
          <span aria-hidden className="absolute top-[3px] right-1.5 left-1.5 h-[3px] bg-[repeating-linear-gradient(90deg,var(--color-line-strong)_0_4px,transparent_4px_8px)] opacity-70" />
          <span className="relative block aspect-[4/5] overflow-hidden rounded-[3px] bg-raised-2">
            <AnimatePresence>
              {url && (
                <motion.img
                  key={url}
                  src={url}
                  alt=""
                  draggable={false}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.4 }}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              )}
            </AnimatePresence>
            {!url && <span className="skeleton absolute inset-0" />}
            <span className={`absolute top-1 left-1 rounded-[3px] bg-black/55 px-1 font-mono text-[11px] leading-[15px] ${active ? 'text-accent-fg' : 'text-white/85'}`}>{catalogue}</span>
          </span>
          <span className={`line-clamp-2 min-h-[2.3em] px-0.5 text-[11.5px] leading-[1.15] font-medium tracking-[-0.01em] ${active ? 'text-fg' : 'text-fg-2'}`}>{preset.name}</span>
        </button>
      </li>
    );
  }

  return (
    <li ref={item} className={`group relative ${strip ? 'w-[92px] shrink-0' : 'flex flex-col'}`}>
      {/* A look: its preview fills the tile; the chosen look gets a lilac edge, its afterimage and today's date stamp. */}
      <button
        {...tilt}
        type="button"
        onClick={() => onApply?.(preset)}
        disabled={!onApply}
        aria-pressed={active}
        aria-label={`${onApply ? actionVerb : 'Look'} ${preset.name}`}
        title={preset.description ? `${preset.name}: ${preset.description}` : preset.name}
        className={`tilt relative block w-full overflow-hidden bg-raised-2 text-left transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] enabled:active:scale-[0.95] ${
          large ? 'rounded-lg' : 'rounded-md'
        } aspect-[var(--tile-ratio,0.8)] ${active ? 'shadow-selected' : 'shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)] enabled:hover:-translate-y-0.5'}`}
      >
        <AnimatePresence>
          {url && (
            <motion.img
              key={url}
              src={url}
              alt=""
              onLoad={(e) => onPreviewSize?.(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)}
              initial={{ opacity: 0, scale: 1.06 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.05]"
            />
          )}
        </AnimatePresence>
        {!url && <span className="skeleton absolute inset-0" />}
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
        <span aria-hidden className="tilt-light" />
        {catalogue && !active && (
          <span className={`absolute top-0 left-0 font-mono font-medium text-white/80 [text-shadow:0_1px_3px_rgb(0_0_0/0.7)] ${strip ? 'p-1.5 text-[11px]' : 'p-2 text-[11px]'}`}>
            {catalogue}
          </span>
        )}
        {active ? (
          <motion.span
            initial={{ scale: 0, rotate: -90 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 520, damping: 22 }}
            className={`absolute flex items-center justify-center rounded-full bg-accent text-on-accent shadow-offset-sm ${strip ? 'top-1.5 left-1.5 h-5 w-5' : 'top-2 left-2 h-6 w-6'}`}
          >
            <Check size={strip ? 12 : 14} strokeWidth={3} />
          </motion.span>
        ) : preset.origin === 'reference' ? (
          <Blend size={12} aria-label="Made from a reference photo" className={`absolute text-white/80 ${strip ? 'top-1.5 right-1.5' : 'top-2.5 right-2.5'}`} />
        ) : null}
        {active && stamp && !strip && (
          <span aria-hidden className="absolute right-2 bottom-2 font-mono text-[11px] text-stamp [text-shadow:0_0_6px_rgb(242_153_74/0.35)]">
            {stamp}
          </span>
        )}
        <span className={`absolute inset-x-0 bottom-0 block ${strip ? 'px-2 pb-1.5' : active ? 'px-2.5 pb-6' : 'px-2.5 pb-2'}`}>
          <span className={`line-clamp-2 block leading-[1.15] font-semibold tracking-[-0.01em] text-white ${strip ? 'text-[11.5px]' : large ? 'text-[15px]' : 'text-[13px]'}`}>{preset.name}</span>
        </span>
      </button>
      {large && preset.description && <p className="mt-2 line-clamp-2 px-0.5 text-[13px] leading-snug text-fg-3">{preset.description}</p>}
      {/* The chosen look's check takes the frame number's corner, so these never sit over the tile's middle. */}
      <div className={`absolute top-1.5 right-1.5 flex gap-1 ${strip ? 'hidden' : ''}`}>
        <motion.button
          type="button"
          whileTap={{ scale: 0.75 }}
          aria-label={favorite ? `Remove ${preset.name} from Kept` : `Keep ${preset.name}`}
          aria-pressed={favorite}
          onClick={() => toggleFavorite(preset.id)}
          className={`flex h-7 w-7 items-center justify-center rounded-full bg-black/55 backdrop-blur-md transition-opacity coarse:h-8 coarse:w-8 ${
            favorite ? 'text-accent opacity-100' : 'text-white fine:opacity-0 fine:group-focus-within:opacity-100 fine:group-hover:opacity-100'
          }`}
        >
          <motion.span key={String(favorite)} initial={{ scale: 0.4 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 14 }}>
            <Star size={13} fill={favorite ? 'currentColor' : 'none'} />
          </motion.span>
        </motion.button>
        <button
          ref={menuButton}
          type="button"
          aria-label={`More actions for ${preset.name}`}
          aria-expanded={menu}
          onClick={() => setMenu(!menu)}
          className="flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-md coarse:h-8 coarse:w-8 fine:opacity-0 fine:group-focus-within:opacity-100 fine:group-hover:opacity-100"
        >
          <MoreHorizontal size={14} />
        </button>
      </div>
      <AnimatePresence>
        {menu && (
          <CardMenu anchor={menuButton} onClose={() => setMenu(false)}>
            <MenuButton icon={<Copy size={12} />} label="Duplicate" onClick={() => { setMenu(false); void duplicate(preset.id); }} />
            <MenuButton
              icon={<Download size={12} />}
              label="Export as a file"
              onClick={() => {
                setMenu(false);
                downloadText(usePresets.getState().exportJson([preset.id]), `${preset.name.replace(/[^\w-]+/g, '_')}.lumen-preset.json`);
              }}
            />
            {isUser && <MenuButton icon={<Pencil size={12} />} label="Rename" onClick={() => { setMenu(false); onEdit(preset); }} />}
            {isUser && <MenuButton icon={<Trash2 size={12} />} label="Delete" danger onClick={() => { setMenu(false); onDelete(preset); }} />}
          </CardMenu>
        )}
      </AnimatePresence>
    </li>
  );
});

/**
 * A card's actions menu, drawn over everything (a portal) next to its button, so it is never
 * clipped by the scrolling grid or the sideways strip. Closes on outside tap, Escape or scroll.
 */
function CardMenu({ anchor, onClose, children }: { anchor: React.RefObject<HTMLButtonElement | null>; onClose: () => void; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  useLayoutEffect(() => {
    const r = anchor.current?.getBoundingClientRect();
    if (!r) return;
    const w = 168;
    const h = panel.current?.offsetHeight ?? 130;
    const below = r.bottom + 4 + h <= window.innerHeight - 8;
    setPos({ left: Math.min(window.innerWidth - w - 8, Math.max(8, r.right - w)), top: below ? r.bottom + 4 : Math.max(8, r.top - 4 - h) });
  }, [anchor]);
  useEffect(() => {
    const away = (e: PointerEvent) => !panel.current?.contains(e.target as Node) && !anchor.current?.contains(e.target as Node) && onClose();
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('pointerdown', away, true);
    window.addEventListener('keydown', key);
    window.addEventListener('scroll', onClose, true);
    return () => {
      window.removeEventListener('pointerdown', away, true);
      window.removeEventListener('keydown', key);
      window.removeEventListener('scroll', onClose, true);
    };
  }, [anchor, onClose]);
  return createPortal(
    <motion.div
      ref={panel}
      role="menu"
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.14 }}
      className="fixed z-[95] w-44 rounded-md border border-line bg-raised-2 p-1.5 shadow-float"
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
    >
      {children}
    </motion.div>,
    document.body,
  );
}

function MenuButton({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} className={`flex h-8 w-full items-center gap-2.5 rounded-sm px-2.5 text-[13px] hover:bg-control coarse:h-10 ${danger ? 'text-danger' : 'text-fg-2 hover:text-fg'}`}>
      {icon}
      {label}
    </button>
  );
}

function PresetEditDialog({ preset, onClose }: { preset: Preset | null; onClose: () => void }) {
  // Remounted per preset (key), so initial state comes straight from the preset.
  const [name, setName] = useState(preset?.name ?? '');
  const [description, setDescription] = useState(preset?.description ?? '');
  return (
    <Dialog
      open={!!preset}
      onClose={onClose}
      title="Edit look"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!name.trim()}
            onClick={async () => {
              if (preset) await usePresets.getState().update(preset.id, { name: name.trim().slice(0, 80), description: description.slice(0, 400) });
              onClose();
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <PresetFields name={name} setName={setName} description={description} setDescription={setDescription} />
    </Dialog>
  );
}

export function PresetFields({
  name,
  setName,
  description,
  setDescription,
}: {
  name: string;
  setName: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
}) {
  return (
    <div className="space-y-4 px-5 pb-5">
      <div>
        <label htmlFor="preset-name" className="mb-1.5 block text-xs font-medium text-fg-3">
          Name
        </label>
        <input
          id="preset-name"
          data-autofocus
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          className="h-11 w-full rounded-sm border border-line bg-well px-3.5 text-sm text-fg outline-none transition-colors focus:border-accent/60"
        />
      </div>
      <div>
        <label htmlFor="preset-desc" className="mb-1.5 block text-xs font-medium text-fg-3">
          Note (optional)
        </label>
        <textarea
          id="preset-desc"
          value={description}
          maxLength={400}
          rows={3}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded-sm border border-line bg-well px-3.5 py-2.5 text-sm text-fg outline-none transition-colors focus:border-accent/60"
        />
      </div>
    </div>
  );
}

/**
 * Phones: the look you are pressing on, large, with its name and what it does. Let go to close;
 * nothing is applied. Drawn over everything (a portal), above the strip.
 */
function LookPeek({ peek, catalogue }: { peek: { preset: Preset; url: string | null } | null; catalogue?: string }) {
  return createPortal(
    <AnimatePresence>
      {peek && (
        <motion.div
          key="peek-dim"
          aria-hidden
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="pointer-events-none fixed inset-0 z-[89] bg-black/60 backdrop-blur-[6px]"
        />
      )}
      {peek && (
        <motion.div
          key={peek.preset.id}
          initial={{ opacity: 0, scale: 0.92, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 8 }}
          transition={{ type: 'spring', stiffness: 420, damping: 32 }}
          className="pointer-events-none fixed inset-x-6 top-[12dvh] z-[90] mx-auto max-w-sm"
          role="status"
          aria-live="polite"
        >
          <div className="liquid overflow-hidden rounded-3xl bg-[rgb(22_20_28/0.9)]! p-2.5">
            <div className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-raised-2">
              {peek.url ? <img src={peek.url} alt="" className="h-full w-full object-cover" /> : <span className="skeleton absolute inset-0" />}
              {catalogue && <span className="absolute top-2.5 left-2.5 rounded-md bg-black/55 px-1.5 py-0.5 font-mono text-[11px] text-white">{catalogue}</span>}
            </div>
            <div className="px-1.5 pt-3 pb-1.5">
              <p className="text-[17px] font-semibold tracking-[-0.015em] text-fg">{peek.preset.name}</p>
              {peek.preset.description && <p className="mt-1 line-clamp-3 text-[13px] leading-snug text-fg-3">{peek.preset.description}</p>}
              <p className="mt-2 text-[12px] text-fg-4">Let go to close · tap the look to try it</p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
