import { lazy, Suspense, useEffect } from 'react';
import { MotionConfig } from 'motion/react';
import { Route, Routes } from 'react-router';
import { useSettings } from '@/state/settingsStore';
import { Toasts } from '@/components/ui/misc';
import { GalleryScreen } from '@/screens/GalleryScreen';
import { PwaPrompts } from '@/pwa/PwaUi';

// Secondary screens are split out of the initial bundle.
const EditorScreen = lazy(() => import('@/screens/EditorScreen'));
const PresetLibraryScreen = lazy(() => import('@/screens/PresetLibraryScreen'));
const SettingsScreen = lazy(() => import('@/screens/SettingsScreen'));

export function App() {
  const loaded = useSettings((s) => s.loaded);
  const motion = useSettings((s) => s.motion);

  useEffect(() => {
    void useSettings.getState().load();
  }, []);

  useEffect(() => {
    if (motion === 'system') document.documentElement.removeAttribute('data-motion');
    else document.documentElement.setAttribute('data-motion', motion);
  }, [motion]);

  if (!loaded) return <div className="h-full bg-ground" />;

  return (
    <MotionConfig reducedMotion={motion === 'reduced' ? 'always' : motion === 'full' ? 'never' : 'user'}>
      <Suspense fallback={<div className="h-full bg-ground" />}>
        <Routes>
          <Route path="/" element={<GalleryScreen />} />
          <Route path="/project/:projectId" element={<EditorScreen />} />
          <Route path="/presets" element={<PresetLibraryScreen />} />
          <Route path="/settings" element={<SettingsScreen />} />
          <Route path="*" element={<GalleryScreen />} />
        </Routes>
      </Suspense>
      <Toasts />
      <PwaPrompts />
    </MotionConfig>
  );
}
