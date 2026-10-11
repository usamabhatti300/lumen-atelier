import { useEditor, type RightTab } from '@/state/editorStore';

/** Tabs whose canvas tools stay active when switching to them. */
const TOOL_TABS: RightTab[] = ['geometry', 'masks', 'portrait'];

/** Switches the adjustment tab, activating or dropping the canvas tool to match (shared by the desktop tabs and the mobile sheet). */
export function selectRightTab(id: RightTab) {
  const { tool, setUi } = useEditor.getState();
  // The Remove brush belongs to its own tab; other tool tabs keep crop / mask / portrait tools.
  setUi({ rightTab: id, tool: id === 'remove' ? 'remove' : TOOL_TABS.includes(id) && tool !== 'remove' ? tool : 'none' });
}
