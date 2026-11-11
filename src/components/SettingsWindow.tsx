import React, { useState, useEffect } from 'react';
import {
  Sun,
  Moon,
  Monitor,
  Zap,
  Volume2,
  Power,
  Check,
  RotateCw,
  Pipette,
} from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { emit } from '@tauri-apps/api/event';
import { check } from '@tauri-apps/plugin-updater';
import { AppSettings, DEFAULT_SETTINGS } from '../types';
import { getStoredSettings, fetchStoredSettings, saveStoredSettings } from '../settingsStore';

interface SettingsProps {
  onClose?: () => void;
}

export const SettingsWindow: React.FC<SettingsProps> = ({ onClose }) => {
  const [activeTab, setActiveTab] = useState<'tampilan' | 'perilaku' | 'audio' | 'monitor' | 'sistem' | 'pembaruan'>('tampilan');
  const [settings, setSettings] = useState<AppSettings>(() => getStoredSettings());
  const [isSavedNotice, setIsSavedNotice] = useState<boolean>(false);
  const [isCheckingUpdate, setIsCheckingUpdate] = useState<boolean>(false);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);
  const [isRecordingShortcut, setIsRecordingShortcut] = useState<boolean>(false);
  const [recordedKeys, setRecordedKeys] = useState<string[]>([]);

  const handleCheckUpdate = async () => {
    setIsCheckingUpdate(true);
    setUpdateStatus('Memeriksa server GitHub...');
    try {
      const update = await check();
      if (update) {
        setUpdateStatus(`Versi ${update.version} tersedia untuk dipasang!`);
        emit('wink-trigger-update-alert', {
          version: update.version,
          body: update.body || 'Pembaruan resmi Wink',
        });
      } else {
        setUpdateStatus('Aplikasi Anda sudah menggunakan versi terbaru (v1.2.5).');
      }
    } catch {
      setUpdateStatus('Tidak dapat terhubung ke server update saat ini.');
    } finally {
      setIsCheckingUpdate(false);
    }
  };

  useEffect(() => {
    // Muat konfigurasi terbaru langsung dari disk & registry Windows saat jendela pengaturan dibuka
    fetchStoredSettings().then((fresh) => {
      setSettings(fresh);
    });

    // Sync if storage updated externally
    const handleStorage = () => {
      setSettings(getStoredSettings());
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const handleClose = async () => {
    try {
      const win = getCurrentWindow();
      await win.hide();
    } catch {
      if (onClose) onClose();
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isRecordingShortcut) {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isRecordingShortcut]);

  // Hotkey Recorder Effect
  useEffect(() => {
    if (!isRecordingShortcut) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === 'Escape') {
        setIsRecordingShortcut(false);
        setRecordedKeys([]);
        return;
      }

      const parts: string[] = [];
      if (e.ctrlKey) parts.push('Ctrl');
      if (e.shiftKey) parts.push('Shift');
      if (e.altKey) parts.push('Alt');
      if (e.metaKey) parts.push('Win');

      const rawKey = e.key.toUpperCase();
      if (!['CONTROL', 'SHIFT', 'ALT', 'META'].includes(rawKey)) {
        let cleanKey = rawKey;
        if (e.code.startsWith('Key')) cleanKey = e.code.replace('Key', '');
        else if (e.code.startsWith('Digit')) cleanKey = e.code.replace('Digit', '');
        else if (rawKey === ' ') cleanKey = 'Space';

        // Ensure at least one modifier key is used, or allow function keys F1-F12
        if (parts.length === 0 && !cleanKey.startsWith('F')) {
          parts.push('Ctrl');
        }

        parts.push(cleanKey);
        const finalShortcut = parts.join('+');
        updateSetting('colorPickerShortcut', finalShortcut);
        setIsRecordingShortcut(false);
        setRecordedKeys([]);
      } else {
        setRecordedKeys(parts);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const parts: string[] = [];
      if (e.ctrlKey) parts.push('Ctrl');
      if (e.shiftKey) parts.push('Shift');
      if (e.altKey) parts.push('Alt');
      if (e.metaKey) parts.push('Win');
      setRecordedKeys(parts);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isRecordingShortcut]);

  const showSavedFlash = () => {
    setIsSavedNotice(true);
    setTimeout(() => setIsSavedNotice(false), 1200);
  };

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((prev) => {
      const updated = { ...prev, [key]: value };
      saveStoredSettings(updated);
      return updated;
    });
    showSavedFlash();
  };

  return (
    <div className="w-full h-screen bg-[#1c1d22] text-[#f3f4f6] flex select-none overflow-hidden font-sans">
      {/* Sidebar Nav */}
      <aside className="w-48 bg-black/20 border-r border-white/[0.06] p-2.5 flex flex-col justify-between">
          <div className="space-y-1">
            <div className="text-[10px] font-semibold text-white/40 uppercase tracking-wider px-2 py-1">Kategori</div>
            
            <button
              onClick={() => setActiveTab('tampilan')}
              className={`w-full text-left px-2.5 py-2 rounded-lg text-xs font-medium flex items-center gap-2.5 transition ${
                activeTab === 'tampilan' ? 'bg-white/10 text-teal-300' : 'text-white/60 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <Sun className="w-4 h-4" />
              <span>Tampilan & Tema</span>
            </button>

            <button
              onClick={() => setActiveTab('perilaku')}
              className={`w-full text-left px-2.5 py-2 rounded-lg text-xs font-medium flex items-center gap-2.5 transition ${
                activeTab === 'perilaku' ? 'bg-white/10 text-teal-300' : 'text-white/60 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <Zap className="w-4 h-4" />
              <span>Perilaku Pintar</span>
            </button>

            <button
              onClick={() => setActiveTab('audio')}
              className={`w-full text-left px-2.5 py-2 rounded-lg text-xs font-medium flex items-center gap-2.5 transition ${
                activeTab === 'audio' ? 'bg-white/10 text-teal-300' : 'text-white/60 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <Volume2 className="w-4 h-4" />
              <span>Audio & Volume</span>
            </button>

            <button
              onClick={() => setActiveTab('monitor')}
              className={`w-full text-left px-2.5 py-2 rounded-lg text-xs font-medium flex items-center gap-2.5 transition ${
                activeTab === 'monitor' ? 'bg-white/10 text-teal-300' : 'text-white/60 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <Monitor className="w-4 h-4" />
              <span>Multi-Monitor</span>
            </button>

            <button
              onClick={() => setActiveTab('sistem')}
              className={`w-full text-left px-2.5 py-2 rounded-lg text-xs font-medium flex items-center gap-2.5 transition ${
                activeTab === 'sistem' ? 'bg-white/10 text-teal-300' : 'text-white/60 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <Power className="w-4 h-4" />
              <span>Sistem & Startup</span>
            </button>

            <button
              onClick={() => setActiveTab('pembaruan')}
              className={`w-full text-left px-2.5 py-2 rounded-lg text-xs font-medium flex items-center gap-2.5 transition ${
                activeTab === 'pembaruan' ? 'bg-white/10 text-teal-300' : 'text-white/60 hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <RotateCw className="w-4 h-4" />
              <span>Pembaruan</span>
            </button>
          </div>

          <div className="px-2 pt-2 border-t border-white/[0.06] text-[10px] text-white/40 flex items-center justify-between">
            <span>v1.2.5</span>
          </div>
        </aside>

        {/* Content Canvas */}
        <main className="flex-1 p-5 overflow-y-auto space-y-4 relative">
          {isSavedNotice && (
            <div className="fixed top-3 right-5 z-50 flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30 backdrop-blur-md font-medium animate-in fade-in duration-200 shadow-lg">
              <Check className="w-3.5 h-3.5" />
              <span>Tersimpan</span>
            </div>
          )}
          {/* TAB 1: TAMPILAN */}
          {activeTab === 'tampilan' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-white/95">Tampilan & Tema</h2>
                <p className="text-xs text-white/50 mt-0.5">Atur skema visual kaca (Mica glass) dan kecepatan gerak animasi pegas.</p>
              </div>

              {/* Tema Antarmuka */}
              <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-3.5 space-y-2.5">
                <div className="text-xs font-semibold text-white/90">Tema Antarmuka</div>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => updateSetting('themeMode', 'dark')}
                    className={`flex items-center gap-2 p-2 rounded-lg border text-left transition ${
                      settings.themeMode === 'dark' ? 'bg-teal-500/15 border-teal-500/40 text-teal-300' : 'bg-white/[0.02] border-white/[0.06] text-white/70 hover:bg-white/[0.04]'
                    }`}
                  >
                    <Moon className="w-4 h-4 shrink-0" />
                    <div className="text-xs">
                      <div className="font-semibold">Gelap</div>
                      <div className="text-[10px] opacity-60">Obsidian Glass</div>
                    </div>
                  </button>

                  <button
                    onClick={() => updateSetting('themeMode', 'light')}
                    className={`flex items-center gap-2 p-2 rounded-lg border text-left transition ${
                      settings.themeMode === 'light' ? 'bg-teal-500/15 border-teal-500/40 text-teal-300' : 'bg-white/[0.02] border-white/[0.06] text-white/70 hover:bg-white/[0.04]'
                    }`}
                  >
                    <Sun className="w-4 h-4 shrink-0" />
                    <div className="text-xs">
                      <div className="font-semibold">Terang</div>
                      <div className="text-[10px] opacity-60">Slate Ink</div>
                    </div>
                  </button>

                  <button
                    onClick={() => updateSetting('themeMode', 'system')}
                    className={`flex items-center gap-2 p-2 rounded-lg border text-left transition ${
                      settings.themeMode === 'system' ? 'bg-teal-500/15 border-teal-500/40 text-teal-300' : 'bg-white/[0.02] border-white/[0.06] text-white/70 hover:bg-white/[0.04]'
                    }`}
                  >
                    <Monitor className="w-4 h-4 shrink-0" />
                    <div className="text-xs">
                      <div className="font-semibold">Sistem</div>
                      <div className="text-[10px] opacity-60">Auto Windows</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Kecepatan Animasi */}
              <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-3.5 space-y-2.5">
                <div className="text-xs font-semibold text-white/90">Kelenturan Animasi (HIG Spring Physics)</div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => updateSetting('animDuration', '450ms')}
                    className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium border transition ${
                      settings.animDuration === '450ms' ? 'bg-teal-500/20 border-teal-500/40 text-teal-300 font-semibold' : 'bg-white/[0.03] border-white/[0.06] text-white/70 hover:bg-white/[0.06]'
                    }`}
                  >
                    Snappy (450ms)
                  </button>
                  <button
                    onClick={() => updateSetting('animDuration', '580ms')}
                    className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium border transition ${
                      settings.animDuration === '580ms' ? 'bg-teal-500/20 border-teal-500/40 text-teal-300 font-semibold' : 'bg-white/[0.03] border-white/[0.06] text-white/70 hover:bg-white/[0.06]'
                    }`}
                  >
                    Graceful (580ms)
                  </button>
                  <button
                    onClick={() => updateSetting('animDuration', '750ms')}
                    className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-medium border transition ${
                      settings.animDuration === '750ms' ? 'bg-teal-500/20 border-teal-500/40 text-teal-300 font-semibold' : 'bg-white/[0.03] border-white/[0.06] text-white/70 hover:bg-white/[0.06]'
                    }`}
                  >
                    Extra Soft (750ms)
                  </button>
                </div>
              </div>

              {/* Vertical Offset */}
              <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-3.5 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-white/90">Jarak Vertikal Desktop (Offset)</div>
                  <div className="text-[11px] text-white/50">Jarak mengambang di desktop normal (0px = menempel atas).</div>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="0"
                    max="20"
                    value={settings.verticalOffset}
                    onChange={(e) => updateSetting('verticalOffset', Number(e.target.value))}
                    className="w-24 accent-teal-400 cursor-pointer"
                  />
                  <span className="text-xs font-mono font-bold text-teal-300 w-8 text-right">{settings.verticalOffset}px</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PERILAKU */}
          {activeTab === 'perilaku' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-white/95">Perilaku Pintar</h2>
                <p className="text-xs text-white/50 mt-0.5">Adaptasi cerdas terhadap jendela penuh, tab browser, dan kursor.</p>
              </div>

              {/* Toggle Auto Stealth */}
              <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-3.5 flex items-center justify-between">
                <div className="pr-4">
                  <div className="text-xs font-semibold text-white/90">Auto-Stealth saat Aplikasi Layar Penuh (Maximized)</div>
                  <div className="text-[11px] text-white/50 mt-0.5">
                    Wink menyusut menjadi strip mikro agar tab browser tidak terhalang.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.autoStealth}
                  onChange={(e) => updateSetting('autoStealth', e.target.checked)}
                  className="w-4 h-4 accent-teal-400 cursor-pointer"
                />
              </div>

              {/* Toggle Edge Wake */}
              <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-3.5 flex items-center justify-between">
                <div className="pr-4">
                  <div className="text-xs font-semibold text-white/90">Gesture Sentuh Tepi Atas (Edge-Proximity Wake)</div>
                  <div className="text-[11px] text-white/50 mt-0.5">
                    Sentuhkan kursor ke garis paling atas layar untuk langsung membuka Action Menu.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.edgeWake}
                  onChange={(e) => updateSetting('edgeWake', e.target.checked)}
                  className="w-4 h-4 accent-teal-400 cursor-pointer"
                />
              </div>

              {/* Toggle In-Place Song Switch */}
              <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-3.5 flex items-center justify-between">
                <div className="pr-4">
                  <div className="text-xs font-semibold text-white/90">Ganti Lagu Tenang (In-Place Track Switch)</div>
                  <div className="text-[11px] text-white/50 mt-0.5">
                    Ganti lagu tanpa memunculkan banner toast yang melompat tiba-tiba.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.inPlaceTrack}
                  onChange={(e) => updateSetting('inPlaceTrack', e.target.checked)}
                  className="w-4 h-4 accent-teal-400 cursor-pointer"
                />
              </div>

              {/* Pintasan Cepat Color Picker (Eyedropper) */}
              <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="pr-4">
                    <div className="text-xs font-semibold text-white/90 flex items-center gap-1.5">
                      <Pipette className="w-3.5 h-3.5 text-purple-400" />
                      <span>Pintasan Cepat Color Picker (Eyedropper)</span>
                    </div>
                    <div className="text-[11px] text-white/50 mt-0.5">
                      Aktifkan shortcut keyboard untuk langsung mengambil warna dari layar ke palet.
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.colorPickerShortcutEnabled}
                    onChange={(e) => updateSetting('colorPickerShortcutEnabled', e.target.checked)}
                    className="w-4 h-4 accent-purple-400 cursor-pointer"
                  />
                </div>

                {settings.colorPickerShortcutEnabled && (
                  <div className="pt-2.5 border-t border-white/[0.06] flex flex-col gap-2.5">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-xs font-medium text-white/80">Kombinasi Tombol Pintasan</div>
                        <div className="text-[10px] text-white/40 mt-0.5">
                          {isRecordingShortcut
                            ? 'Tekan tombol di keyboard Anda sekarang...'
                            : 'Klik tombol di kanan untuk merekam shortcut baru'}
                        </div>
                      </div>

                      {/* Hotkey Keycap Recorder Pill */}
                      {!isRecordingShortcut ? (
                        <button
                          type="button"
                          onClick={() => {
                            setIsRecordingShortcut(true);
                            setRecordedKeys([]);
                          }}
                          className="group flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/40 hover:bg-black/60 border border-white/10 hover:border-purple-400/50 transition cursor-pointer shadow-inner active:scale-95"
                          title="Klik untuk merekam kombinasi tombol baru"
                        >
                          {(settings.colorPickerShortcut || 'Ctrl+Shift+C').split('+').map((k, i, arr) => (
                            <React.Fragment key={`${k}-${i}`}>
                              <kbd className="px-2 py-0.5 rounded bg-white/10 group-hover:bg-purple-500/20 border border-white/15 group-hover:border-purple-400/40 text-[11px] font-mono font-semibold text-white/90 group-hover:text-purple-300 shadow-sm transition">
                                {k}
                              </kbd>
                              {i < arr.length - 1 && (
                                <span className="text-[10px] text-white/30">+</span>
                              )}
                            </React.Fragment>
                          ))}
                          <span className="ml-1 text-[10px] font-medium text-white/40 group-hover:text-purple-400">
                            Ubah
                          </span>
                        </button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500/15 border border-purple-400/60 ring-2 ring-purple-500/30 animate-pulse">
                            {recordedKeys.length > 0 ? (
                              recordedKeys.map((k, i) => (
                                <React.Fragment key={`${k}-${i}`}>
                                  <kbd className="px-2 py-0.5 rounded bg-purple-500/30 border border-purple-400/60 text-[11px] font-mono font-semibold text-purple-200 shadow-sm">
                                    {k}
                                  </kbd>
                                  <span className="text-[10px] text-purple-300">+</span>
                                </React.Fragment>
                              ))
                            ) : null}
                            <span className="text-[11px] font-mono text-purple-200">
                              {recordedKeys.length > 0 ? 'Tekan tombol...' : 'Tekan tombol kombinasi...'}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setIsRecordingShortcut(false);
                              setRecordedKeys([]);
                            }}
                            className="text-[10px] text-white/50 hover:text-white px-2 py-1 rounded hover:bg-white/10 transition cursor-pointer"
                          >
                            Batal (Esc)
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Quick Presets */}
                    <div className="flex items-center gap-1.5 pt-1">
                      <span className="text-[10px] text-white/40">Preset Cepat:</span>
                      {['Ctrl+Shift+C', 'Alt+C', 'Ctrl+Alt+C', 'Ctrl+Shift+X'].map((preset) => (
                        <button
                          key={preset}
                          type="button"
                          onClick={() => updateSetting('colorPickerShortcut', preset)}
                          className={`text-[10px] font-mono px-2 py-0.5 rounded-md border transition cursor-pointer ${
                            settings.colorPickerShortcut === preset
                              ? 'bg-purple-500/25 border-purple-400/60 text-purple-200 shadow-[0_0_8px_rgba(168,85,247,0.3)]'
                              : 'bg-white/[0.03] border-white/10 text-white/60 hover:text-white hover:bg-white/10'
                          }`}
                        >
                          {preset}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: AUDIO */}
          {activeTab === 'audio' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-white/95">Audio & Indikator Volume</h2>
                <p className="text-xs text-white/50 mt-0.5">Konfigurasi HUD volume dinamis saat tombol volume ditekan.</p>
              </div>

              <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-3.5 flex items-center justify-between">
                <div className="pr-4">
                  <div className="text-xs font-semibold text-white/90">Indikator Volume di Wink (Volume HUD)</div>
                  <div className="text-[11px] text-white/50 mt-0.5">
                    Menampilkan slider horizontal ramping (210x36px) saat volume fisik keyboard ditekan.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.volumeHudEnabled}
                  onChange={(e) => updateSetting('volumeHudEnabled', e.target.checked)}
                  className="w-4 h-4 accent-teal-400 cursor-pointer"
                />
              </div>

              <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-3.5 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-white/90">Durasi Tampil Volume HUD</div>
                  <div className="text-[11px] text-white/50">Waktu sebelum bar volume menyusut kembali.</div>
                </div>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="800"
                    max="3000"
                    step="100"
                    value={settings.volumeDuration}
                    onChange={(e) => updateSetting('volumeDuration', Number(e.target.value))}
                    className="w-24 accent-teal-400 cursor-pointer"
                  />
                  <span className="text-xs font-mono font-bold text-teal-300 w-12 text-right">{(settings.volumeDuration / 1000).toFixed(1)}s</span>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: MONITOR */}
          {activeTab === 'monitor' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-white/95">Multi-Monitor (Layar Eksternal)</h2>
                <p className="text-xs text-white/50 mt-0.5">Pengaturan docking posisi Wink pada layar tambahan atau proyektor.</p>
              </div>

              <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-3.5 space-y-2.5">
                <div className="text-xs font-semibold text-white/90">Mode Penempatan Layar</div>
                <div className="space-y-2">
                  <label
                    onClick={() => updateSetting('monitorPlacement', 'auto')}
                    className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition ${
                      settings.monitorPlacement === 'auto' ? 'bg-teal-500/15 border-teal-500/40 text-teal-300' : 'bg-white/[0.02] border-white/[0.06] text-white/70 hover:bg-white/[0.04]'
                    }`}
                  >
                    <input type="radio" checked={settings.monitorPlacement === 'auto'} onChange={() => {}} className="accent-teal-400" />
                    <div className="text-xs">
                      <div className="font-semibold text-white">Auto: Ikuti Kursor Mouse (Rekomendasi)</div>
                      <div className="text-[10px] text-white/50">Wink otomatis meluncur ke layar tempat kursor aktif bekerja.</div>
                    </div>
                  </label>

                  <label
                    onClick={() => updateSetting('monitorPlacement', 'fixed')}
                    className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition ${
                      settings.monitorPlacement === 'fixed' ? 'bg-teal-500/15 border-teal-500/40 text-teal-300' : 'bg-white/[0.02] border-white/[0.06] text-white/70 hover:bg-white/[0.04]'
                    }`}
                  >
                    <input type="radio" checked={settings.monitorPlacement === 'fixed'} onChange={() => {}} className="accent-teal-400" />
                    <div className="text-xs">
                      <div className="font-semibold text-white">Terkunci di Layar Utama (Fixed)</div>
                      <div className="text-[10px] text-white/50">Hanya tampil di monitor utama sistem.</div>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: SISTEM */}
          {activeTab === 'sistem' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-white/95">Sistem & Startup</h2>
                <p className="text-xs text-white/50 mt-0.5">Konfigurasi boot Windows dan pemeliharaan riwayat penyimpanan.</p>
              </div>

              <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-3.5 flex items-center justify-between">
                <div className="pr-4">
                  <div className="text-xs font-semibold text-white/90">Buka Otomatis saat Windows Menyala (Run on Startup)</div>
                  <div className="text-[11px] text-white/50 mt-0.5">
                    Wink langsung siap dan standby begitu Anda login ke Windows.
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={settings.autoStart}
                  onChange={(e) => updateSetting('autoStart', e.target.checked)}
                  className="w-4 h-4 accent-teal-400 cursor-pointer"
                />
              </div>

              <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-3.5 flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-white/90">Kembalikan ke Pengaturan Default</div>
                  <div className="text-[11px] text-white/50">Reset seluruh konfigurasi ke nilai bawaan pabrik.</div>
                </div>
                <button
                  onClick={() => {
                    setSettings({ ...DEFAULT_SETTINGS });
                    saveStoredSettings({ ...DEFAULT_SETTINGS });
                    showSavedFlash();
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-500/15 text-rose-300 border border-rose-500/25 hover:bg-rose-500/25 transition active:scale-[0.98]"
                >
                  Reset Default
                </button>
              </div>
            </div>
          )}

          {/* TAB 6: PEMBARUAN */}
          {activeTab === 'pembaruan' && (
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-white/95">Pembaruan Aplikasi</h2>
                <p className="text-xs text-white/50">Kelola versi Wink dan sinkronisasi rilis otomatis via GitHub.</p>
              </div>

              {/* Status Card */}
              <div className="bg-white/[0.04] border border-white/[0.06] rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-[11px] font-mono text-white/50">Versi Terpasang</div>
                    <div className="text-sm font-bold text-white font-mono flex items-center gap-2 mt-0.5">
                      <span>v1.2.5-stable</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                        Aktif
                      </span>
                    </div>
                  </div>

                  <button
                    onClick={handleCheckUpdate}
                    disabled={isCheckingUpdate}
                    className="px-3.5 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 border border-white/15 text-white font-medium text-xs transition flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
                  >
                    <RotateCw className={`w-3.5 h-3.5 ${isCheckingUpdate ? 'animate-spin' : ''}`} />
                    <span>{isCheckingUpdate ? 'Memeriksa...' : 'Periksa Sekarang'}</span>
                  </button>
                </div>

                {updateStatus && (
                  <div className="text-xs font-mono text-teal-300 bg-teal-500/10 border border-teal-500/20 p-2.5 rounded-lg">
                    {updateStatus}
                  </div>
                )}
              </div>

              <div className="text-[11px] text-white/40 font-mono pt-2">
                Pembaruan biner diverifikasi otomatis menggunakan tanda tangan kriptografi Minisign SHA-256.
              </div>
            </div>
          )}
        </main>
    </div>
  );
};
