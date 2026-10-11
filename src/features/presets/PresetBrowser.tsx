import { AnimatePresence, motion } from 'motion/react';
import { Check, Copy, Download, MoreHorizontal, Pencil, Search, Star, Trash2, Wand2 } from 'lucide-react';
import { memo, useEffect, useMemo, useState } from 'react';
import { usePresets, ALL_CATEGORY_LABELS, downloadText } from '@/state/presetStore';
import { useEditor } from '@/state/editorStore';
import { presetThumb, thumbSourceListeners, previewSourceId } from '@/engine/presetThumbs';
import { PRESET_CATEGORY_IDS, type Preset, type PresetCategoryId } from '@/lib/schema/preset';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';

type Filter = 'all' | 'favorites' | PresetCategoryId;

export function PresetBrowser({
  variant = 'panel',
  onApply,
  canApply = true,
  actionVerb = 'Apply',
}: {
  variant?: 'panel' | 'page';
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
      <div className={`shrink-0 space-y-2 ${variant === 'panel' ? 'px-3 pt-3 pb-2' : 'pb-4'}`}>
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
            className="h-8 w-full rounded-sm border border-line bg-ink-950 pr-2 pl-8 text-xs text-ivory placeholder:text-faint focus:border-amber/60 focus:outline-none"
          />
        </label>
        <div className={`flex gap-1 ${variant === 'panel' ? 'scroll-quiet -mx-3 overflow-x-auto px-3 pb-1' : 'flex-wrap'}`} role="tablist" aria-label="Preset categories">
          {filters.map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filter === f}
              onClick={() => setFilter(f)}
              className={`h-6 shrink-0 rounded-full border px-2.5 text-[11px] whitespace-nowrap transition-colors ${
                filter === f ? 'border-champagne bg-champagne text-ink-950' : 'border-line text-mute hover:border-line-strong hover:text-ivory'
              }`}
            >
              {f === 'all' ? 'All' : f === 'favorites' ? '★ Favourites' : ALL_CATEGORY_LABELS[f]}
            </button>
          ))}
        </div>
      </div>
      <div className={`scroll-quiet min-h-0 flex-1 overflow-y-auto ${variant === 'panel' ? 'px-3 pb-4' : ''}`}>
        {presets.length === 0 ? (
          <p className="py-8 text-center text-xs text-mute">
            {filter === 'favorites' ? 'No favourites yet. Star a preset to keep it here.' : 'No presets match your search.'}
          </p>
        ) : (
          <ul className={`grid gap-x-2.5 gap-y-3 ${variant === 'panel' ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6'}`}>
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
  actionVerb,
}: {
  actionVerb: string;
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
    <li className="group relative">
      <button
        type="button"
        onClick={() => onApply?.(preset)}
        disabled={!onApply}
        aria-pressed={active}
        aria-label={`${onApply ? actionVerb : 'Preset'} ${preset.name}`}
        title={preset.description}
        className={`block w-full overflow-hidden rounded-xs text-left ring-1 transition-[box-shadow,transform] duration-200 enabled:active:scale-[0.98] ${
          active ? 'ring-2 ring-amber' : 'ring-line-soft hover:ring-line-strong'
        }`}
      >
        <div className={`relative bg-ink-800 ${large ? 'aspect-[4/3]' : 'aspect-[3/2]'}`}>
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
        <div className="bg-ink-850 px-2 py-1.5">
          <p className="truncate text-[11.5px] leading-tight text-ivory">{preset.name}</p>
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
          className={`flex h-6 w-6 items-center justify-center rounded-full bg-ink-950/70 transition-opacity ${
            favorite ? 'text-amber opacity-100' : 'text-ivory/80 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100'
          }`}
        >
          <motion.span key={String(favorite)} initial={{ scale: 0.5 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 500, damping: 18 }}>
            <Star size={12} fill={favorite ? 'currentColor' : 'none'} />
          </motion.span>
        </motion.button>
        <button
          type="button"
          aria-label={`More actions for ${preset.name}`}
          aria-expanded={menu}
          onClick={() => setMenu(!menu)}
          className="flex h-6 w-6 items-center justify-center rounded-full bg-ink-950/70 text-ivory/80 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100"
        >
          <MoreHorizontal size={13} />
        </button>
      </div>
      <AnimatePresence>
        {menu && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.14 }}
            className="absolute top-8 right-1 z-20 w-40 rounded-sm border border-line bg-ink-900 p-1 shadow-float"
            onMouseLeave={() => setMenu(false)}
          >
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
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
});

function MenuButton({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} className={`flex h-7 w-full items-center gap-2 rounded-xs px-2 text-xs hover:bg-ink-700 ${danger ? 'text-safelight' : 'text-ivory-dim hover:text-ivory'}`}>
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
