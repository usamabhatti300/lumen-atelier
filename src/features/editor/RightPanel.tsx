import { motion } from 'motion/react';
import { Crop, Eraser, Layers, Palette, ScanFace, SlidersHorizontal, Sparkle } from 'lucide-react';
import { useEditor, type RightTab } from '@/state/editorStore';
import { selectRightTab } from './rightTabs';
import { Histogram } from './Histogram';
import { LightPanel } from './panels/LightPanel';
import { ColorPanel } from './panels/ColorPanel';
import { DetailPanel } from './panels/DetailPanel';
import { GeometryPanel } from './panels/GeometryPanel';
import { MasksPanel } from './panels/MasksPanel';
import { PortraitPanel } from './panels/PortraitPanel';
import { RemovePanel } from './panels/RemovePanel';

export const RIGHT_TABS: { id: RightTab; label: string; icon: typeof SlidersHorizontal }[] = [
  { id: 'adjust', label: 'Light', icon: SlidersHorizontal },
  { id: 'color', label: 'Colour', icon: Palette },
  { id: 'detail', label: 'Detail', icon: Sparkle },
  { id: 'masks', label: 'Masks', icon: Layers },
  { id: 'portrait', label: 'Portrait', icon: ScanFace },
  { id: 'remove', label: 'Remove', icon: Eraser },
  { id: 'geometry', label: 'Crop', icon: Crop },
];

export function PanelContent({ tab }: { tab: RightTab }) {
  switch (tab) {
    case 'adjust':
      return <LightPanel />;
    case 'color':
      return <ColorPanel />;
    case 'detail':
      return <DetailPanel />;
    case 'masks':
      return <MasksPanel />;
    case 'portrait':
      return <PortraitPanel />;
    case 'remove':
      return <RemovePanel />;
    case 'geometry':
      return <GeometryPanel />;
  }
}

export function RightPanel() {
  const tab = useEditor((s) => s.rightTab);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <Histogram />
      <div role="tablist" aria-label="Adjustment panels" className="mx-1.5 mb-1 grid shrink-0 grid-cols-7 rounded-lg bg-raised p-1 ring-1 ring-line-soft">
        {RIGHT_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="right-tabpanel"
            onClick={() => selectRightTab(t.id)}
            className={`relative flex min-w-0 flex-col items-center gap-1 rounded-md py-2 text-[10.5px] font-medium tracking-[-0.02em] transition-colors ${
              tab === t.id ? 'text-fg' : 'text-fg-3 hover:text-fg'
            }`}
          >
            {tab === t.id && (
              <motion.span layoutId="right-tab-pill" className="absolute inset-0 rounded-md bg-control-2" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />
            )}
            <t.icon size={16} strokeWidth={tab === t.id ? 2 : 1.6} className={`relative ${tab === t.id ? 'text-accent' : ''}`} />
            <span className="relative">{t.label}</span>
          </button>
        ))}
      </div>
      <div id="right-tabpanel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="scroll-quiet min-h-0 flex-1 overflow-y-auto">
        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}>
          <PanelContent tab={tab} />
        </motion.div>
      </div>
    </div>
  );
}
