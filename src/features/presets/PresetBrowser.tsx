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

type Filter = 'all' | 'favorites' | PresetCategoryId;

/**
 * `panel`: side panel grid. `page`: the preset library. `strip`: phones, one row of large
 * cards that scrolls sideways under the photo, with search behind an icon.
 */
export function PresetBrowser({
  variant = 'panel',
  onApply,
  canApply = true,
  actionVerb = 'Apply',
}: {
  variant?: 'panel' | 'page' | 'strip';
  onApply?: (p: Preset) => void;
  canApply?: boolean;
  actionVerb?: string;
}) {
  const load = usePresets((s) => s.load);
  const user = usePresets((s) => s.user);
  const favorites = usePresets((s) => s.favorites);
  const all = usePresets((s) => s.all);
  const [query, setQuery] = useState('');
  // The Signature Collection is the first and default tab.
  const [filter, setFilter] = useState<Filter>('signature');
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
          <Search size={13} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-faint" />
          <span className="sr-only">Search presets</span>
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              // Search the whole library, not only the open category (Favourites stays a filter).
              if (e.target.value.trim() && filter !== 'all' && filter !== 'favorites') setFilter('all');
            }}
            placeholder={`Search ${all().length} presets`}
            autoFocus={strip}
            className="h-8 w-full rounded-sm border border-line bg-ink-950 pr-9 pl-8 text-xs text-ivory placeholder:text-faint focus:border-amber/60 focus:outline-none coarse:h-10 coarse:text-sm"
          />
          {strip && (
            <button
              type="button"
              aria-label="Close search"
              onClick={() => {
                setSearching(false);
                setQuery('');
              }}
              className="absolute top-1/2 right-1 flex h-8 w-8 -translate-y-1/2 items-center justify-center text-mute"
            >
              <X size={15} />
            </button>
          )}
        </label>
        )}
        <div className={`flex gap-1 ${variant === 'page' ? 'flex-wrap' : 'scroll-quiet -mx-3 overflow-x-auto px-3 pb-1'}`} role="tablist" aria-label="Preset categories">
          {strip && !searching && (
            <button
              type="button"
              aria-label="Search presets"
              onClick={() => setSearching(true)}
              className="flex h-6 w-8 shrink-0 items-center justify-center rounded-full border border-line text-mute coarse:h-8 coarse:w-10"
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
              className={`h-6 shrink-0 rounded-full border px-2.5 text-[11px] whitespace-nowrap transition-colors coarse:h-8 coarse:px-3 coarse:text-xs ${
                filter === f ? 'border-champagne bg-champagne text-ink-950' : 'border-line text-mute hover:border-line-strong hover:text-ivory'
              }`}
            >
              {f === 'all' ? 'All' : f === 'favorites' ? '★ Favourites' : ALL_CATEGORY_LABELS[f]}
            </button>
          ))}
        </div>
      </div>
      <div className={`scroll-quiet min-h-0 flex-1 ${strip ? 'overflow-hidden' : 'overflow-y-auto'} ${variant === 'panel' ? 'px-3 pb-4' : ''}`}>
        {presets.length === 0 ? (
          <p className="py-8 text-center text-xs text-mute">
            {filter === 'favorites' ? 'No favourites yet. Star a preset to keep it here.' : 'No presets match your search.'}
          </p>
        ) : (
          <ul
            className={
              strip
                ? 'scroll-quiet flex h-full gap-2 overflow-x-auto overscroll-x-contain px-3 pb-2'
                : `grid gap-x-2.5 gap-y-3 ${variant === 'panel' ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6'}`
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
        <p className="px-4 py-4 text-sm text-mute">
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
}: {
  actionVerb: string;
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

  const thumbKey = `${sourceId}:${preset.id}`;
  useEffect(() => {
    let alive = true;
    presetThumb(preset.id, preset.adjustments).then((u) => alive && setThumb({ key: thumbKey, url: u }), () => undefined);
    return () => {
      alive = false;
    };
  }, [preset.id, preset.adjustments, thumbKey]);
  const url = thumb?.key === thumbKey ? thumb.url : null;

  return (
    <li className={`group relative ${strip ? 'aspect-[3/4] h-full max-w-[44vw] min-w-24 shrink-0' : ''}`}>
      <button
        type="button"
        onClick={() => onApply?.(preset)}
        disabled={!onApply}
        aria-pressed={active}
        aria-label={`${onApply ? actionVerb : 'Preset'} ${preset.name}`}
        title={preset.description}
        className={`w-full overflow-hidden rounded-xs text-left ring-1 transition-[box-shadow,transform] duration-200 enabled:active:scale-[0.98] ${strip ? 'flex h-full flex-col' : 'block'} ${
          active ? 'ring-2 ring-amber' : 'ring-line-soft hover:ring-line-strong'
        }`}
      >
        <div className={`relative bg-ink-800 ${strip ? 'min-h-0 flex-1' : large ? 'aspect-[4/3]' : 'aspect-[3/2]'}`}>
          <AnimatePresence>
            {url && (
              <motion.img
                key={url}
                src={url}
                alt=""
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
                className="absolute inset-0 h-full w-full object-cover"
              />
            )}
          </AnimatePresence>
          {!url && <div className="absolute inset-0 animate-pulse bg-ink-750" />}
          {active && (
            <motion.span
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="absolute top-1.5 left-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-amber text-ink-950"
            >
              <Check size={12} strokeWidth={3} />
            </motion.span>
          )}
          {preset.origin === 'reference' && (
            <span className="absolute bottom-1.5 left-1.5 flex items-center gap-1 rounded-xs bg-ink-950/75 px-1 py-0.5 text-[9.5px] text-champagne">
              <Wand2 size={9} /> reference
            </span>
          )}
        </div>
        <div className="shrink-0 bg-ink-850 px-2 py-1.5">
          <p className={`truncate leading-tight text-ivory ${strip ? 'text-xs' : 'text-[11.5px]'}`}>{preset.name}</p>
          {large && <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-faint">{preset.description}</p>}
        </div>
      </button>
      <div className="absolute top-1 right-1 flex gap-0.5">
        <motion.button
          type="button"
          whileTap={{ scale: 0.8 }}
          aria-label={favorite ? `Remove ${preset.name} from favourites` : `Add ${preset.name} to favourites`}
          aria-pressed={favorite}
          onClick={() => toggleFavorite(preset.id)}
          className={`flex h-6 w-6 items-center justify-center rounded-full bg-ink-950/70 transition-opacity coarse:h-8 coarse:w-8 ${
            favorite ? 'text-amber opacity-100' : 'text-ivory/80 fine:opacity-0 fine:group-focus-within:opacity-100 fine:group-hover:opacity-100'
          }`}
        >
          <motion.span key={String(favorite)} initial={{ scale: 0.5 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 18 }}>
            <Star size={12} fill={favorite ? 'currentColor' : 'none'} />
          </motion.span>
        </motion.button>
        <button
          ref={menuButton}
          type="button"
          aria-label={`More actions for ${preset.name}`}
          aria-expanded={menu}
          onClick={() => setMenu(!menu)}
          className="flex h-6 w-6 items-center justify-center rounded-full bg-ink-950/70 text-ivory/80 coarse:h-8 coarse:w-8 fine:opacity-0 fine:group-focus-within:opacity-100 fine:group-hover:opacity-100"
        >
          <MoreHorizontal size={13} />
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
      className="fixed z-[95] w-42 rounded-sm border border-line bg-ink-900 p-1 shadow-float"
      style={{ top: pos?.top ?? -9999, left: pos?.left ?? -9999 }}
    >
      {children}
    </motion.div>,
    document.body,
  );
}

function MenuButton({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" role="menuitem" onClick={onClick} className={`flex h-7 w-full items-center gap-2 rounded-xs px-2 text-xs hover:bg-ink-700 coarse:h-10 coarse:text-[13px] ${danger ? 'text-safelight' : 'text-ivory-dim hover:text-ivory'}`}>
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
    <div className="space-y-3 p-4">
      <div>
        <label htmlFor="preset-name" className="mb-1 block text-xs text-mute">
          Name
        </label>
        <input
          id="preset-name"
          data-autofocus
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          className="h-9 w-full rounded-sm border border-line bg-ink-950 px-3 text-sm text-ivory outline-none focus:border-amber/60"
        />
      </div>
      <div>
        <label htmlFor="preset-desc" className="mb-1 block text-xs text-mute">
          Description
        </label>
        <textarea
          id="preset-desc"
          value={description}
          maxLength={400}
          rows={3}
          onChange={(e) => setDescription(e.target.value)}
          className="w-full rounded-sm border border-line bg-ink-950 px-3 py-2 text-sm text-ivory outline-none focus:border-amber/60"
        />
      </div>
      <div>
        <label htmlFor="preset-cat" className="mb-1 block text-xs text-mute">
          Category
        </label>
        <select
          id="preset-cat"
          value={category}
          onChange={(e) => setCategory(e.target.value as PresetCategoryId)}
          className="h-9 w-full rounded-sm border border-line bg-ink-950 px-2 text-sm text-ivory outline-none focus:border-amber/60"
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
