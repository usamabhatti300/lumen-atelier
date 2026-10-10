import { useState } from 'react';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { PASTE_GROUPS, useEditor, type PasteGroup } from '@/state/editorStore';

export function PasteDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const clip = useEditor((s) => s.clipboard);
  const paste = useEditor((s) => s.pasteAdjustments);
  const [groups, setGroups] = useState<PasteGroup[]>(PASTE_GROUPS.map((g) => g.id));
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
            variant="primary"
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
      <div className="p-4">
        <p className="mb-3 text-xs text-mute">From “{clip?.sourceName}”. Crop, masks and retouching are never pasted.</p>
        <ul className="grid grid-cols-2 gap-1.5">
          {PASTE_GROUPS.map((g) => (
            <li key={g.id}>
              <label className="flex cursor-pointer items-center gap-2 text-[13px] text-ivory-dim">
                <input
                  type="checkbox"
                  className="accent-[var(--color-amber)]"
                  checked={groups.includes(g.id)}
                  onChange={(e) => setGroups(e.target.checked ? [...groups, g.id] : groups.filter((x) => x !== g.id))}
                />
                {g.label}
              </label>
            </li>
          ))}
        </ul>
      </div>
    </Dialog>
  );
}
