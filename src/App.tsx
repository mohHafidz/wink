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

  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

  return (
    <main
      className={`w-screen h-screen overflow-hidden select-none relative ${
        isTauri
          ? 'bg-transparent'
          : 'bg-[#0c0d12] bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(45,212,191,0.12),rgba(0,0,0,0.8))] flex flex-col items-center justify-start'
      }`}
    >
      <DynamicIsland />

      {!isTauri && (
        <div className="absolute bottom-6 inset-x-0 flex flex-col items-center justify-center gap-2 pointer-events-none text-center">
          <div className="px-3.5 py-1.5 rounded-full bg-white/[0.06] border border-white/10 backdrop-blur-md text-xs font-mono text-zinc-300 shadow-xl flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Wink Web Preview Simulator</span>
            <span className="text-zinc-600">•</span>
            <span className="text-zinc-400">Arahkan kursor ke Notch atas layar</span>
          </div>
          <p className="text-[11px] text-zinc-500 font-sans">
            Klik ikon audio 🎧 di kanan atas untuk mencoba Radial Floating Bubbles
          </p>
        </div>
      )}
    </main>
  );
}
