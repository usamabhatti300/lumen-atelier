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
      <div role="tablist" aria-label="Adjustment panels" className="grid shrink-0 grid-cols-7 border-b border-line-soft px-1">
        {RIGHT_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls="right-tabpanel"
            onClick={() => selectRightTab(t.id)}
            className={`relative flex flex-col items-center gap-0.5 py-2 text-[10px] tracking-wide transition-colors ${
              tab === t.id ? 'text-fg' : 'text-fg-4 hover:text-fg-2'
            }`}
          >
            <t.icon size={15} strokeWidth={1.6} />
            {t.label}
            {tab === t.id && (
              <motion.span layoutId="right-tab-underline" className="absolute inset-x-2 -bottom-px h-px bg-accent" transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }} />
            )}
          </button>
        ))}
      </div>
      <div id="right-tabpanel" role="tabpanel" aria-labelledby={`tab-${tab}`} className="scroll-quiet min-h-0 flex-1 overflow-y-auto">
        <motion.div key={tab} initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.2 }}>
          <PanelContent tab={tab} />
        </motion.div>
      </div>
    </div>
  );
}
