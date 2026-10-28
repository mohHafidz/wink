import { useState, useEffect } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { DynamicIsland } from './components/DynamicIsland';
import { SettingsWindow } from './components/SettingsWindow';
import './App.css';

export default function App() {
  const [isSettingsView, setIsSettingsView] = useState<boolean>(() => {
    try {
      return getCurrentWindow().label === 'settings' || window.location.hash === '#settings';
    } catch {
      return window.location.hash === '#settings';
    }
  });

  useEffect(() => {
    try {
      const win = getCurrentWindow();
      if (win.label === 'settings') {
        setIsSettingsView(true);
      }
    } catch (e) {
      console.warn('Could not read window label', e);
    }

    const handleHashChange = () => {
      setIsSettingsView(window.location.hash === '#settings');
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  if (isSettingsView) {
    return <SettingsWindow />;
  }

  return (
    <main className="w-screen h-screen overflow-hidden bg-transparent select-none">
      <DynamicIsland />
    </main>
  );
}
