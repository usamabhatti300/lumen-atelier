import { AnimatePresence, motion } from 'motion/react';
import { Check, Copy, Download, MoreHorizontal, Pencil, Search, Star, Trash2, Wand2, X } from 'lucide-react';
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { usePresets, ALL_CATEGORY_LABELS, downloadText } from '@/state/presetStore';
import { useEditor } from '@/state/editorStore';
import { presetThumb, thumbSourceListeners, previewSourceId } from '@/engine/presetThumbs';
import { PRESET_CATEGORY_IDS, type Preset, type PresetCategoryId } from '@/lib/schema/preset';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { catalogueNumber } from '@/lib/presets/codes';

type Filter = 'all' | 'favorites' | PresetCategoryId;

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
}: {
  variant?: 'panel' | 'page' | 'strip';
  onApply?: (p: Preset) => void;
  canApply?: boolean;
  actionVerb?: string;
  initialFilter?: PresetCategoryId;
}) {
  const load = usePresets((s) => s.load);
  const user = usePresets((s) => s.user);
  const favorites = usePresets((s) => s.favorites);
  const all = usePresets((s) => s.all);
  const [query, setQuery] = useState('');
  // The Signature Collection is the first and default tab.
  const [filter, setFilter] = useState<Filter>(initialFilter ?? 'signature');
  const [editing, setEditing] = useState<Preset | null>(null);
  const [deleting, setDeleting] = useState<Preset | null>(null);
  const appliedId = useEditor((s) => s.edit.appliedPreset?.id);
  const strip = variant === 'strip';
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    void load();
  }, [load]);

  const presets = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all().filter((p) => {
      if (filter === 'favorites' && !favorites.includes(p.id)) return false;
      if (filter !== 'all' && filter !== 'favorites' && p.category !== filter) return false;
      if (!q) return true;
      return `${p.name} ${p.description} ${p.tags.join(' ')} ${ALL_CATEGORY_LABELS[p.category]}`.toLowerCase().includes(q);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, filter, favorites, user, all]);

  // Catalogue numbers are stable: counted over the whole library, not the filtered view.
  const numbers = useMemo(() => {
    const seen = new Map<string, number>();
    const out = new Map<string, string>();
    for (const p of all()) {
      const n = seen.get(p.category) ?? 0;
      seen.set(p.category, n + 1);
      out.set(p.id, catalogueNumber(p.category, n));
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, all]);

  const filters: Filter[] = [
    'signature',
    'all',
    'favorites',
    ...PRESET_CATEGORY_IDS.filter((c) => c !== 'signature')
      .filter((c) => c !== 'reference' || user.some((p) => p.category === 'reference'))
      .filter((c) => c !== 'custom' || user.some((p) => p.category === 'custom')),
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={`shrink-0 space-y-2 ${variant === 'panel' ? 'px-3 pt-3 pb-2' : strip ? 'px-3 pt-1 pb-2' : 'pb-4'}`}>
        {strip && !searching ? null : (
        <label className="relative block">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-fg-4" />
          <span className="sr-only">Search presets</span>
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              // Search the whole library, not only the open category (Favourites stays a filter).
              if (e.target.value.trim() && filter !== 'all' && filter !== 'favorites') setFilter('all');
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
        <div className={`flex gap-1.5 ${variant === 'page' ? 'no-scrollbar -mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0' : 'no-scrollbar -mx-3 overflow-x-auto px-3 pb-1 [mask-image:linear-gradient(90deg,#000_86%,transparent)]'}`} role="tablist" aria-label="Preset categories">
          {strip && !searching && (
            <button
              type="button"
              aria-label="Search presets"
              onClick={() => setSearching(true)}
              className="flex h-8 w-9 shrink-0 items-center justify-center rounded-full bg-control text-fg-2 coarse:h-9 coarse:w-10"
            >
              <Search size={14} />
            </button>
          )}
          {filters.map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filter === f}
              onClick={() => setFilter(f)}
              className={`h-8 shrink-0 rounded-full px-3.5 text-[13px] font-medium whitespace-nowrap transition-[background-color,color,transform] duration-200 active:scale-95 coarse:h-9 coarse:px-4 ${
                filter === f ? 'bg-fg text-ground' : 'bg-control text-fg-2 hover:bg-control-2 hover:text-fg'
              }`}
            >
              {f === 'all' ? 'All' : f === 'favorites' ? <span className="flex items-center gap-1.5"><Star size={12} fill="currentColor" aria-hidden /> Favourites</span> : ALL_CATEGORY_LABELS[f]}
            </button>
          ))}
        </div>
      </div>
      <div className={`scroll-quiet min-h-0 flex-1 ${strip ? 'overflow-hidden' : 'overflow-y-auto'} ${variant === 'panel' ? 'px-3 pb-4' : ''}`}>
        {presets.length === 0 ? (
          <p className="py-10 text-center text-sm text-fg-3">
            {filter === 'favorites' ? 'No favourites yet. Star a preset to keep it here.' : 'No presets match your search.'}
          </p>
        ) : (
          <ul
            className={
              strip
                ? 'no-scrollbar flex gap-2 overflow-x-auto overscroll-x-contain px-3 pt-2 pb-3'
                : `grid ${variant === 'panel' ? 'grid-cols-2 gap-2' : 'grid-cols-2 gap-x-3 gap-y-6 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6'}`
            }
            aria-label="Presets"
          >
            {presets.map((p) => (
              <PresetCard
                key={p.id}
                preset={p}
                active={appliedId === p.id}
                favorite={favorites.includes(p.id)}
                onApply={canApply ? onApply : undefined}
                onEdit={() => setEditing(p)}
                onDelete={() => setDeleting(p)}
                large={variant === 'page'}
                strip={strip}
                actionVerb={actionVerb}
                catalogue={numbers.get(p.id)}
              />
            ))}
          </ul>
        )}
      </div>
      <PresetEditDialog key={editing?.id ?? 'none'} preset={editing} onClose={() => setEditing(null)} />
      <Dialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete preset?"
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
              Delete preset
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
}: {
  actionVerb: string;
  catalogue?: string;
  strip?: boolean;
  preset: Preset;
  active: boolean;
  favorite: boolean;
  onApply?: (p: Preset) => void;
  onEdit: () => void;
  onDelete: () => void;
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

  return (
    <li ref={item} className={`group relative ${strip ? 'w-[92px] shrink-0' : 'flex flex-col'}`}>
      {/* A look: its preview fills the tile; the chosen look glows lime. */}
      <button
        type="button"
        onClick={() => onApply?.(preset)}
        disabled={!onApply}
        aria-pressed={active}
        aria-label={`${onApply ? actionVerb : 'Preset'} ${preset.name}`}
        title={preset.description ? `${preset.name}: ${preset.description}` : preset.name}
        className={`relative block w-full overflow-hidden bg-raised-2 text-left transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] enabled:active:scale-[0.95] ${
          strip ? 'aspect-[3/4] rounded-md' : large ? 'aspect-[4/5] rounded-lg' : 'aspect-[4/5] rounded-md'
        } ${active ? 'shadow-glow' : 'shadow-[inset_0_0_0_1px_rgb(255_255_255/0.06)] enabled:hover:-translate-y-0.5'}`}
      >
        <AnimatePresence>
          {url && (
            <motion.img
              key={url}
              src={url}
              alt=""
              initial={{ opacity: 0, scale: 1.06 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.05]"
            />
          )}
        </AnimatePresence>
        {!url && <span className="skeleton absolute inset-0" />}
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
        {catalogue && (
          <span className={`absolute top-0 left-0 font-mono font-medium tracking-[0.06em] text-white/75 uppercase [text-shadow:0_1px_3px_rgb(0_0_0/0.7)] ${strip ? 'p-1.5 text-[9px]' : 'p-2 text-[10px]'}`}>
            {catalogue}
          </span>
        )}
        {active ? (
          <motion.span
            initial={{ scale: 0, rotate: -90 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 520, damping: 22 }}
            className={`absolute flex items-center justify-center rounded-full bg-accent text-on-accent shadow-[0_0_14px_rgb(212_255_63/0.7)] ${strip ? 'top-1.5 right-1.5 h-5 w-5' : 'top-2 right-2 h-6 w-6'}`}
          >
            <Check size={strip ? 12 : 14} strokeWidth={3} />
          </motion.span>
        ) : preset.origin === 'reference' ? (
          <Wand2 size={12} aria-label="Made from a reference photo" className={`absolute text-white/80 ${strip ? 'top-1.5 right-1.5' : 'top-2.5 right-2.5'}`} />
        ) : null}
        <span className={`absolute inset-x-0 bottom-0 block ${strip ? 'px-2 pb-1.5' : 'px-2.5 pb-2'}`}>
          <span className={`line-clamp-2 block leading-[1.15] font-semibold tracking-[-0.01em] text-white ${strip ? 'text-[11.5px]' : large ? 'text-[15px]' : 'text-[13px]'}`}>{preset.name}</span>
        </span>
      </button>
      {large && preset.description && <p className="mt-2 line-clamp-2 px-0.5 text-[13px] leading-snug text-fg-3">{preset.description}</p>}
      <div className={`absolute right-1.5 flex gap-1 ${strip ? 'hidden' : ''} ${active ? 'top-10' : 'top-1.5'}`}>
        <motion.button
          type="button"
          whileTap={{ scale: 0.75 }}
          aria-label={favorite ? `Remove ${preset.name} from favourites` : `Add ${preset.name} to favourites`}
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
              label="Export JSON"
              onClick={() => {
                setMenu(false);
                downloadText(usePresets.getState().exportJson([preset.id]), `${preset.name.replace(/[^\w-]+/g, '_')}.lumen-preset.json`);
              }}
            />
            {isUser && <MenuButton icon={<Pencil size={12} />} label="Rename / edit" onClick={() => { setMenu(false); onEdit(); }} />}
            {isUser && <MenuButton icon={<Trash2 size={12} />} label="Delete" danger onClick={() => { setMenu(false); onDelete(); }} />}
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
  const [category, setCategory] = useState<PresetCategoryId>(preset?.category ?? 'custom');
  return (
    <Dialog
      open={!!preset}
      onClose={onClose}
      title="Edit preset"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!name.trim()}
            onClick={async () => {
              if (preset) await usePresets.getState().update(preset.id, { name: name.trim().slice(0, 80), description: description.slice(0, 400), category });
              onClose();
            }}
          >
            Save preset
          </Button>
        </>
      }
    >
      <PresetFields name={name} setName={setName} description={description} setDescription={setDescription} category={category} setCategory={setCategory} />
    </Dialog>
  );
}

export function PresetFields({
  name,
  setName,
  description,
  setDescription,
  category,
  setCategory,
}: {
  name: string;
  setName: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  category: PresetCategoryId;
  setCategory: (v: PresetCategoryId) => void;
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
          Description
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
      <div>
        <label htmlFor="preset-cat" className="mb-1.5 block text-xs font-medium text-fg-3">
          Category
        </label>
        <select
          id="preset-cat"
          value={category}
          onChange={(e) => setCategory(e.target.value as PresetCategoryId)}
          className="h-11 w-full rounded-sm border border-line bg-well px-3 text-sm text-fg outline-none transition-colors focus:border-accent/60"
        >
          {PRESET_CATEGORY_IDS.map((c) => (
            <option key={c} value={c}>
              {ALL_CATEGORY_LABELS[c]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
