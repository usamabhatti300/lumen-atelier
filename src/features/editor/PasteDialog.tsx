import { Check } from 'lucide-react';
import { useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { PASTE_GROUPS, useEditor, type PasteGroup } from '@/state/editorStore';

export function PasteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const clip = useEditor((s) => s.clipboard);
  const paste = useEditor((s) => s.pasteAdjustments);
  const [groups, setGroups] = useState<PasteGroup[]>(PASTE_GROUPS.map((g) => g.id));
  const all = groups.length === PASTE_GROUPS.length;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Paste settings"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="accent"
            disabled={!groups.length}
            onClick={() => {
              paste(groups);
              onClose();
            }}
          >
            Paste {groups.length} group{groups.length === 1 ? '' : 's'}
          </Button>
        </>
      }
    >
      <div className="px-5 pb-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <p className="text-[13px] leading-relaxed text-fg-3">
            From <span className="text-fg">“{clip?.sourceName}”</span>. Crop, masks and retouching are never pasted.
          </p>
          <button
            type="button"
            onClick={() => setGroups(all ? [] : PASTE_GROUPS.map((g) => g.id))}
            className="shrink-0 rounded-full px-3 py-1.5 text-xs font-medium text-accent-fg hover:bg-accent/10 coarse:py-2.5"
          >
            {all ? 'Select none' : 'Select all'}
          </button>
        </div>
        <ul className="grid grid-cols-2 gap-2">
          {PASTE_GROUPS.map((g) => {
            const on = groups.includes(g.id);
            return (
              <li key={g.id}>
                <label
                  className={`flex min-h-11 cursor-pointer items-center gap-2.5 rounded-md border px-3 py-2 text-[13px] transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent-fg ${
                    on ? 'border-accent/40 bg-accent/10 text-fg' : 'border-line bg-well text-fg-3 hover:text-fg'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={on}
                    onChange={(e) => setGroups(e.target.checked ? [...groups, g.id] : groups.filter((x) => x !== g.id))}
                  />
                  <span
                    aria-hidden
                    className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full transition-colors ${on ? 'bg-accent text-on-accent' : 'border border-line-strong'}`}
                  >
                    {on && <Check size={12} strokeWidth={3} />}
                  </span>
                  {g.label}
                </label>
              </li>
            );
          })}
        </ul>
      </div>
    </Dialog>
  );
}
