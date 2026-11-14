import { Sparkles } from 'lucide-react';
import { runAutoEnhance } from '@/engine/autoEnhance';
import { useEditor } from '@/state/editorStore';

/** Auto: one tap balances light (and colour, when no look is on) from measurements of this photo. */
export function AutoButton({ className = '' }: { className?: string }) {
  const hasPhoto = useEditor((s) => !!s.activePhotoId);
  const showToast = useEditor((s) => s.showToast);
  return (
    <button
      type="button"
      disabled={!hasPhoto}
      data-testid="auto-enhance"
      title="Balance exposure, highlights, shadows and colour from this photo. Every change stays editable."
      onClick={() => {
        const result = runAutoEnhance();
        if (result.status === 'changed') showToast(`Auto: ${result.summary}`, 'success');
        else if (result.status === 'balanced') showToast('Already balanced: Auto found nothing to change.', 'info');
        else showToast('The photo is still loading. Try Auto again in a moment.', 'info');
      }}
      className={`flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-line bg-raised-2 px-3 text-[13px] font-medium text-fg transition-[transform,background-color] hover:bg-control active:scale-95 disabled:opacity-40 coarse:h-10 coarse:px-3.5 ${className}`}
    >
      <Sparkles size={14} aria-hidden />
      Auto
    </button>
  );
}
