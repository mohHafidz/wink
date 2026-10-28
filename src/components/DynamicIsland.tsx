import { useState, useEffect, useRef } from 'react';
import {
  ChevronLeft,
  FolderDown,
  Clipboard,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  X,
  ExternalLink,
  Trash2,
  Check,
  Settings,
  Volume2,
  VolumeX,
  Download,
  RotateCw,
} from 'lucide-react';
import { check, Update } from '@tauri-apps/plugin-updater';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWebview } from '@tauri-apps/api/webview';
import { LifecycleState, Track, ShelfFile, ClipboardEntry, ThemeMode, MediaTrackInfo, AppSettings } from '../types';
import { getStoredSettings, fetchStoredSettings, SETTINGS_EVENT } from '../settingsStore';
import { WaveCanvas } from './WaveCanvas';
import { WinkGlyph } from './WinkGlyph';

const DEFAULT_PLAYLIST: Track[] = [
  {
    title: 'Midnight City',
    artist: 'M83',
    album: "Hurry Up, We're Dreaming",
    duration: 243,
    cover: 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?w=200&q=80',
    accent: '#A8C4FF', // Soft Periwinkle
  },
  {
    title: 'Starboy',
    artist: 'The Weeknd, Daft Punk',
    album: 'Starboy',
    duration: 230,
    cover: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=200&q=80',
    accent: '#FFBDBD', // Soft Blossom Coral
  },
  {
    title: 'Resonance',
    artist: 'HOME',
    album: 'Odyssey',
    duration: 212,
    cover: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=200&q=80',
    accent: '#A0DFBD', // Soft Mint Sage
  },
];

const INITIAL_CLIPBOARD: ClipboardEntry[] = [
  { id: 'c1', item_type: 'URL', content: 'https://developer.apple.com/design/human-interface-guidelines', time: 'Baru saja' },
  { id: 'c2', item_type: 'CODE', content: 'cubic-bezier(0.16, 1, 0.28, 1)', time: '3m lalu' },
  { id: 'c3', item_type: 'COLOR', content: '#A8C4FF', time: '8m lalu' },
  { id: 'c4', item_type: 'TEXT', content: 'git commit -m "feat: fluid spring physics"', time: '18m lalu' },
];

export const DynamicIsland: React.FC = () => {
  const [state, setState] = useState<LifecycleState>('pure-idle');
  const [settings, setSettings] = useState<AppSettings>(() => getStoredSettings());
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(() => {
    return window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)').matches : true;
  });

  const isDark = settings.themeMode === 'system'
    ? systemPrefersDark
    : settings.themeMode === 'dark';
  const theme: ThemeMode = isDark ? 'dark' : 'light';

  const [playlist] = useState<Track[]>(DEFAULT_PLAYLIST);
  const [trackIdx, setTrackIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(134);
  const [shelfFiles, setShelfFiles] = useState<ShelfFile[]>([]);
  const [clipboard, setClipboard] = useState<ClipboardEntry[]>(INITIAL_CLIPBOARD);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState('11:18');
  const [isGsmtcActive, setIsGsmtcActive] = useState(false);
  const [liveTrack, setLiveTrack] = useState<Track | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isForegroundMax, setIsForegroundMax] = useState(false);
  const [isStealthPeeking, setIsStealthPeeking] = useState(false);
  const [currentVolume, setCurrentVolume] = useState<number>(64);
  const [previousNonVolumeState, setPreviousNonVolumeState] = useState<LifecycleState>('pure-idle');
  const [isVolumeFading, setIsVolumeFading] = useState(false);
  const isCapsuleHoveredRef = useRef(false);

  const toastTimeoutRef = useRef<number | null>(null);
  const hoverDebounceRef = useRef<number | null>(null);
  const stealthRestoreRef = useRef<number | null>(null);
  const stealthPulseTimeoutRef = useRef<number | null>(null);
  const volumeTimeoutRef = useRef<number | null>(null);
  const lastGsmtcTitleRef = useRef<string>('');
  const lastPlayingRef = useRef<boolean | null>(null);
  const isSkipActionRef = useRef<boolean>(false);
  const stoppedSinceRef = useRef<number>(Date.now()); // Waktu sejak media berhenti (idle/paused)

  // Auto-Updater State
  const [updateObj, setUpdateObj] = useState<Update | null>(null);
  const [updateMeta, setUpdateMeta] = useState<{ version: string; body?: string } | null>(null);
  const [hasPendingUpdate, setHasPendingUpdate] = useState<boolean>(false);
  const [downloadProgress, setDownloadProgress] = useState<{ percent: number; currentMb: number; totalMb: number }>({
    percent: 0,
    currentMb: 0,
    totalMb: 0,
  });
  const updateToastTimerRef = useRef<number | null>(null);

  // Listen for realtime cross-window Settings updates from SettingsWindow
  useEffect(() => {
    let unlistenFn: (() => void) | null = null;

    // Muat konfigurasi tersimpan dari disk backend Rust saat startup
    fetchStoredSettings().then((fresh) => {
      setSettings(fresh);
    });

    listen<AppSettings>(SETTINGS_EVENT, (event) => {
      if (event.payload) {
        setSettings(event.payload);
      }
    }).then((unlisten) => {
      unlistenFn = unlisten;
    }).catch(console.error);

    const handleStorage = () => {
      setSettings(getStoredSettings());
    };
    window.addEventListener('storage', handleStorage);

    // Watch system dark theme preference
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handlePref = (e: MediaQueryListEvent) => setSystemPrefersDark(e.matches);
    mediaQuery.addEventListener('change', handlePref);

    return () => {
      if (unlistenFn) unlistenFn();
      window.removeEventListener('storage', handleStorage);
      mediaQuery.removeEventListener('change', handlePref);
    };
  }, []);

  // Listen for manual trigger from Settings window & Check updates on startup
  useEffect(() => {
    let unlistenSim: (() => void) | null = null;
    listen<{ version?: string; body?: string }>('wink-trigger-update-alert', (event) => {
      setUpdateMeta({
        version: event.payload?.version || 'v1.2.1',
        body: event.payload?.body || 'Sinkronisasi GSMTC & Fluid Spring Physics',
      });
      setState('update-alert');
      if (updateToastTimerRef.current) clearTimeout(updateToastTimerRef.current);
      updateToastTimerRef.current = window.setTimeout(() => {
        setHasPendingUpdate(true);
        setState((prev) => (prev === 'update-alert' ? (isPlaying ? 'ambient-active' : 'pure-idle') : prev));
      }, 6000);
    }).then((un) => {
      unlistenSim = un;
    }).catch(() => {});

    // Check GitHub Releases after 5 seconds of startup
    const startupTimer = setTimeout(async () => {
      try {
        const update = await check();
        if (update) {
          setUpdateObj(update);
          setUpdateMeta({
            version: update.version,
            body: update.body || 'Pembaruan versi terbaru Wink',
          });
          setState('update-alert');
          if (updateToastTimerRef.current) clearTimeout(updateToastTimerRef.current);
          updateToastTimerRef.current = window.setTimeout(() => {
            setHasPendingUpdate(true);
            setState((prev) => (prev === 'update-alert' ? (isPlaying ? 'ambient-active' : 'pure-idle') : prev));
          }, 6000);
        }
      } catch (err) {
        // Silent in local/offline environment
      }
    }, 5000);

    return () => {
      clearTimeout(startupTimer);
      if (updateToastTimerRef.current) clearTimeout(updateToastTimerRef.current);
      if (unlistenSim) unlistenSim();
    };
  }, [isPlaying]);

  const startDownload = async () => {
    if (updateToastTimerRef.current) clearTimeout(updateToastTimerRef.current);
    setState('update-downloading');

    if (!updateObj) {
      // In dev or simulated test: animate download
      let p = 15;
      const interval = setInterval(() => {
        p += 12;
        if (p >= 100) {
          p = 100;
          clearInterval(interval);
          setDownloadProgress({ percent: 100, currentMb: 24.8, totalMb: 24.8 });
          setTimeout(() => setState('update-ready'), 350);
        } else {
          setDownloadProgress({
            percent: p,
            currentMb: parseFloat(((p / 100) * 24.8).toFixed(1)),
            totalMb: 24.8,
          });
        }
      }, 160);
      return;
    }

    try {
      let downloaded = 0;
      let total = 0;
      await updateObj.download((event) => {
        if (event.event === 'Started') {
          total = event.data.contentLength || 0;
        } else if (event.event === 'Progress') {
          downloaded += event.data.chunkLength;
          const pct = total > 0 ? Math.round((downloaded / total) * 100) : 50;
          setDownloadProgress({
            percent: pct,
            currentMb: parseFloat((downloaded / (1024 * 1024)).toFixed(1)),
            totalMb: parseFloat((total / (1024 * 1024)).toFixed(1)),
          });
        } else if (event.event === 'Finished') {
          setState('update-ready');
        }
      });
      setState('update-ready');
    } catch (e) {
      console.error('Download update error:', e);
      setHasPendingUpdate(true);
      setState(isPlaying ? 'ambient-active' : 'pure-idle');
    }
  };

  const applyUpdateAndRestart = async () => {
    if (updateObj) {
      try {
        await updateObj.install({ restartAfterInstall: true });
      } catch (err) {
        console.error('Install error:', err);
      }
    } else {
      // Simulation: reset back to ambient
      setState(isPlaying ? 'ambient-active' : 'pure-idle');
      setHasPendingUpdate(false);
    }
  };

  const dismissUpdateToast = () => {
    if (updateToastTimerRef.current) clearTimeout(updateToastTimerRef.current);
    setHasPendingUpdate(true);
    setState(isPlaying ? 'ambient-active' : 'pure-idle');
  };

  // Sync monitor mode whenever settings change
  useEffect(() => {
    invoke('set_monitor_mode', { mode: settings.monitorPlacement }).catch(console.error);
  }, [settings.monitorPlacement]);

  // Sync animation duration to root CSS variable for global spring physics
  useEffect(() => {
    document.documentElement.style.setProperty('--anim-duration', settings.animDuration);
  }, [settings.animDuration]);

  // Sync current capsule physical bounding box to Rust backend for pixel-perfect Win32 hit-testing.
  // This lets clicks pass 100% through to Spotify/tabs outside the capsule without resizing the OS window!
  useEffect(() => {
    let w = 192;
    let h = 34;
    let top = settings.verticalOffset;

    switch (state) {
      case 'stealth-micro':
        // Hitbox pad (56x8px) di level hit-test OS agar kursor mudah menyentuh micro-pill
        w = isStealthPeeking ? 76 : 56;
        h = isStealthPeeking ? 16 : 8;
        top = 0;
        break;
      case 'pure-idle':
        w = 130;
        h = 34;
        top = settings.verticalOffset;
        break;
      case 'ambient-active':
        w = 204;
        h = 34;
        top = settings.verticalOffset;
        break;
      case 'update-alert':
        w = 375;
        h = 48;
        top = settings.verticalOffset;
        break;
      case 'update-downloading':
        w = 330;
        h = 44;
        top = settings.verticalOffset;
        break;
      case 'update-ready':
        w = 340;
        h = 48;
        top = settings.verticalOffset;
        break;
      case 'transient-toast':
        w = 340;
        h = 46;
        top = settings.verticalOffset;
        break;
      case 'hover-media':
        w = 456;
        h = 64;
        top = 0;
        break;
      case 'pinned-shelf':
        w = 470;
        h = 180;
        top = 0;
        break;
      case 'pinned-clip':
        w = 430;
        h = 180;
        top = 0;
        break;
      case 'volume-hud':
        w = 210;
        h = 36;
        top = previousNonVolumeState === 'stealth-micro' ? 0 : settings.verticalOffset;
        break;
    }

    // Window canvas is 600px wide, centered horizontally
    const left = Math.round((600 - w) / 2);
    try {
      invoke('update_capsule_bounds', { x: left, y: top, width: w, height: h });
    } catch {
      // Fallback
    }
  }, [state, isStealthPeeking, previousNonVolumeState, settings.verticalOffset]);

  const currentTrack = liveTrack || playlist[trackIdx];

  // System clock ticker
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Poll Windows GSMTC (Global System Media Transport Controls)
  useEffect(() => {
    let isMounted = true;

    const pollMedia = async () => {
      try {
        const info = await invoke<MediaTrackInfo | null>('get_media_info');
        if (!isMounted) return;

        if (info && info.title && info.title.trim() !== '') {
          setIsGsmtcActive(true);
          const wasPlaying = lastPlayingRef.current;
          const isNowPlaying = info.is_playing;
          const titleChanged = lastGsmtcTitleRef.current !== '' && lastGsmtcTitleRef.current !== info.title;
          const justStartedPlaying = wasPlaying === false && isNowPlaying;

          setIsPlaying(isNowPlaying);
          if (typeof info.position === 'number') setProgress(info.position);

          const trackObj: Track = {
            title: info.title,
            artist: info.artist || 'Unknown Artist',
            album: info.album || '',
            duration: info.duration > 0 ? info.duration : 240,
            cover: info.cover || DEFAULT_PLAYLIST[0].cover,
            accent: '#A8C4FF',
          };
          setLiveTrack(trackObj);

          // Cek durasi sejak media berhenti: jika berhenti > 4 detik lalu di-play kembali, baru tampilkan toast banner
          const wasStoppedLongEnough = Date.now() - stoppedSinceRef.current >= 4000;
          const shouldShowToastOnPlay = justStartedPlaying && wasStoppedLongEnough;

          // Pergantian lagu otomatis saat playlist berjalan tetap update judul in-place tanpa memicu toast banner
          if (titleChanged) {
            // Updated in-place
          }

          if (isNowPlaying) {
            stoppedSinceRef.current = 0; // Sedang berputar
          }

          if (isSkipActionRef.current) {
            // User explicitly pressed next/prev, suppress the toast banner
            isSkipActionRef.current = false;
          } else if (shouldShowToastOnPlay) {
            // Hanya munculkan Toast Banner jika lagu mulai diputar setelah lama berhenti!
            // Pergantian lagu (titleChanged) atau next/prev TIDAK memicu toast banner!
            if (stealthPulseTimeoutRef.current) clearTimeout(stealthPulseTimeoutRef.current);

            setState((curr) => {
              if (curr === 'stealth-micro') {
                // Di mode stealth, jangan membesar jadi banner toast!
                // Trigger micro-peek: sedikit melebar (76px) & meninggi (16px) dengan wave selama 2.5s lalu susut kembali ke 36x5px.
                setIsStealthPeeking(true);
                stealthPulseTimeoutRef.current = window.setTimeout(() => {
                  setIsStealthPeeking(false);
                }, 2500);
                return 'stealth-micro';
              }
              if (curr === 'ambient-active' || curr === 'pure-idle') {
                if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
                toastTimeoutRef.current = window.setTimeout(() => {
                  setState(isForegroundMax ? 'stealth-micro' : 'ambient-active');
                }, 2500);
                return 'transient-toast';
              }
              return curr;
            });
          } else if (!isNowPlaying && wasPlaying === true) {
            // Media dijeda/stop: jika di ambient, kembali ke pure-idle atau stealth
            stoppedSinceRef.current = Date.now();
            setState((curr) => (curr === 'ambient-active' ? (isForegroundMax ? 'stealth-micro' : 'pure-idle') : curr));
          }

          lastGsmtcTitleRef.current = info.title;
          lastPlayingRef.current = isNowPlaying;
        } else {
          setIsGsmtcActive(false);
          if (lastPlayingRef.current === true) {
            lastPlayingRef.current = false;
            setState((curr) => (curr === 'ambient-active' ? 'pure-idle' : curr));
          }
        }
      } catch (err) {
        setIsGsmtcActive(false);
      }
    };

    pollMedia();
    const pollInterval = setInterval(pollMedia, 1000);
    return () => {
      isMounted = false;
      clearInterval(pollInterval);
    };
  }, []);

  // Poll Windows Real-Time Clipboard History
  useEffect(() => {
    let isMounted = true;

    const pollClipboard = async () => {
      try {
        const hist = await invoke<ClipboardEntry[]>('clipboard_get_history');
        if (isMounted && hist && hist.length > 0) {
          setClipboard(hist);
        }
      } catch (err) {
        // Fallback gracefully
      }
    };

    pollClipboard();
    const pollInterval = setInterval(pollClipboard, 800);
    return () => {
      isMounted = false;
      clearInterval(pollInterval);
    };
  }, []);

  // Poll Windows OS Master Volume Events (Physical keys / System slider)
  useEffect(() => {
    let isMounted = true;
    const checkVolume = async () => {
      try {
        const [vol, changed] = await invoke<[number, boolean]>('get_volume_status');
        if (!isMounted) return;

        setCurrentVolume(vol);

        if (changed && settings.volumeHudEnabled) {
          // Volume level has changed from physical keys or Windows slider!
          setIsVolumeFading(false);
          setState((curr) => {
            if (curr !== 'volume-hud') {
              setPreviousNonVolumeState(curr);
            }
            return 'volume-hud';
          });

          // Debounced auto-retreat with configurable duration & 160ms pre-fade
          if (volumeTimeoutRef.current) clearTimeout(volumeTimeoutRef.current);
          volumeTimeoutRef.current = window.setTimeout(() => {
            setIsVolumeFading(true);
            setTimeout(() => {
              setIsVolumeFading(false);
              setState((curr) => {
                if (curr === 'volume-hud') {
                  return previousNonVolumeState;
                }
                return curr;
              });
            }, 160);
          }, Math.max(800, settings.volumeDuration - 160));
        }
      } catch {
        // Fallback
      }
    };

    checkVolume();
    const interval = setInterval(checkVolume, 100);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [previousNonVolumeState, settings.volumeHudEnabled, settings.volumeDuration]);

  // Poll Foreground Window Maximized status (Universal Win32 Detection)
  useEffect(() => {
    let isMounted = true;
    const checkMaximized = async () => {
      try {
        const isMax = await invoke<boolean>('is_foreground_maximized');
        if (!isMounted) return;
        setIsForegroundMax(isMax);

        // Auto transition into stealth-micro when maximized and not interacted
        setState((curr) => {
          if (settings.autoStealth && isMax) {
            // When user is not hovering capsule or opened a drawer or seeing transient toast
            if (curr === 'pure-idle' || (curr === 'ambient-active' && !isCapsuleHoveredRef.current)) {
              return 'stealth-micro';
            }
          } else {
            // If window un-maximized OR autoStealth disabled, restore from stealth to idle/ambient
            if (curr === 'stealth-micro') {
              return isPlaying ? 'ambient-active' : 'pure-idle';
            }
          }
          return curr;
        });
      } catch (err) {
        // Fallback gracefully
      }
    };

    checkMaximized();
    const interval = setInterval(checkMaximized, 500);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [isPlaying, settings.autoStealth]);

  // Global cursor listener for Edge-Proximity Wake Gesture
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      // Jika kursor sedang berada di dalam kapsul Island, jangan pernah paksa menutup!
      if (isCapsuleHoveredRef.current) {
        if (stealthRestoreRef.current) clearTimeout(stealthRestoreRef.current);
        return;
      }

      const near = e.clientY <= 14; // Topmost screen edge gesture

      if (near && settings.edgeWake) {
        if (stealthRestoreRef.current) clearTimeout(stealthRestoreRef.current);
        setState((curr) => {
          if (curr === 'stealth-micro') {
            return 'hover-media';
          }
          return curr;
        });
      } else {
        // Hanya tutup jika kursor benar-benar keluar dan autoStealth aktif
        if (settings.autoStealth && isForegroundMax && !isCapsuleHoveredRef.current) {
          if (stealthRestoreRef.current) clearTimeout(stealthRestoreRef.current);
          stealthRestoreRef.current = window.setTimeout(() => {
            if (!isCapsuleHoveredRef.current) {
              setState((curr) => {
                if (curr === 'pure-idle' || curr === 'ambient-active' || curr === 'hover-media') {
                  return 'stealth-micro';
                }
                return curr;
              });
            }
          }, 350); // HIG 350ms graceful retreat
        }
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      if (stealthRestoreRef.current) clearTimeout(stealthRestoreRef.current);
    };
  }, [isForegroundMax, isPlaying, settings.edgeWake, settings.autoStealth]);

  // Tauri native Window Drag & Drop Event Listener
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    try {
      getCurrentWebview()
        .onDragDropEvent(async (event) => {
          if (event.payload.type === 'enter' || event.payload.type === 'over') {
            setIsDragOver(true);
            setState('pinned-shelf');
          } else if (event.payload.type === 'leave') {
            setIsDragOver(false);
          } else if (event.payload.type === 'drop') {
            setIsDragOver(false);
            const droppedPaths = event.payload.paths;
            if (droppedPaths && droppedPaths.length > 0) {
              for (const path of droppedPaths) {
                try {
                  const fileInfo = await invoke<ShelfFile>('shelf_inspect_file', { path });
                  setShelfFiles((prev) => {
                    if (prev.some((f) => f.path === path)) return prev;
                    return [fileInfo, ...prev];
                  });
                } catch (e) {
                  console.error('Failed to inspect dropped file:', e);
                }
              }
            }
          }
        })
        .then((fn) => {
          unlisten = fn;
        })
        .catch((e) => {
          console.warn('onDragDropEvent not available in browser mode:', e);
        });
    } catch (e) {
      console.warn('Webview not available:', e);
    }

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  // Local fallback progress ticker when GSMTC is not actively playing
  useEffect(() => {
    if (!isPlaying || isGsmtcActive) return;
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= currentTrack.duration) {
          setTrackIdx((idx) => (idx + 1) % playlist.length);
          return 0;
        }
        return prev + 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isPlaying, isGsmtcActive, currentTrack.duration, playlist.length]);

  // Escape key listener to dismiss pinned drawers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (state === 'pinned-shelf' || state === 'pinned-clip' || state === 'hover-media') {
          setState(isPlaying ? 'ambient-active' : 'pure-idle');
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state, isPlaying]);

  const formatSeconds = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  const getInkAccent = (hex: string) => {
    if (theme === 'dark') return hex;
    const map: Record<string, string> = {
      '#A8C4FF': '#3F5FC4',
      '#A0DFBD': '#23784F',
      '#FDE2A7': '#9A6410',
      '#FFBDBD': '#B83E3E',
    };
    return map[hex.toUpperCase()] || '#1c1f26';
  };

  // --- Hover interaction handlers with 80ms intent guard ---
  const handleMouseEnter = () => {
    isCapsuleHoveredRef.current = true;
    if (stealthRestoreRef.current) clearTimeout(stealthRestoreRef.current);
    if (stealthPulseTimeoutRef.current) clearTimeout(stealthPulseTimeoutRef.current);
    setIsStealthPeeking(false);

    if (state === 'ambient-active' || state === 'pure-idle' || state === 'stealth-micro') {
      if (hoverDebounceRef.current) clearTimeout(hoverDebounceRef.current);
      hoverDebounceRef.current = window.setTimeout(() => {
        // Direct to hover-media: Natural HIG progression from Micro-Pulse directly to actionable controls
        setState('hover-media');
      }, 80);
    }
  };

  const handleMouseLeave = () => {
    isCapsuleHoveredRef.current = false;
    if (hoverDebounceRef.current) clearTimeout(hoverDebounceRef.current);
    if (state === 'hover-media') {
      if (isForegroundMax) {
        setState('stealth-micro');
      } else {
        setState(isPlaying ? 'ambient-active' : 'pure-idle');
      }
    }
  };

  // --- Media Controls with Windows GSMTC Bridge ---
  const handleSkipNext = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    isSkipActionRef.current = settings.inPlaceTrack;
    if (isGsmtcActive) {
      try {
        await invoke('media_skip_next');
      } catch (err) {
        console.error(err);
      }
    } else {
      setTrackIdx((prev) => (prev + 1) % playlist.length);
      setProgress(0);
      setIsPlaying(true);
      if (!settings.inPlaceTrack && state !== 'hover-media') {
        setState('transient-toast');
        if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
        toastTimeoutRef.current = window.setTimeout(() => setState('ambient-active'), 2000);
      }
    }
  };

  const handleSkipPrev = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    isSkipActionRef.current = settings.inPlaceTrack;
    if (isGsmtcActive) {
      try {
        await invoke('media_skip_previous');
      } catch (err) {
        console.error(err);
      }
    } else {
      if (progress > 4) {
        setProgress(0);
      } else {
        setTrackIdx((prev) => (prev - 1 + playlist.length) % playlist.length);
        setProgress(0);
      }
      setIsPlaying(true);
      if (!settings.inPlaceTrack && state !== 'hover-media') {
        setState('transient-toast');
        if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
        toastTimeoutRef.current = window.setTimeout(() => setState('ambient-active'), 2000);
      }
    }
  };

  const handleTogglePlay = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    const nextPlaying = !isPlaying;
    setIsPlaying(nextPlaying);

    if (isGsmtcActive) {
      try {
        await invoke('media_toggle_play_pause');
      } catch (err) {
        console.error(err);
      }
    }

    // Jika sedang di drawer (shelf/clipboard), biarkan drawer tetap terbuka
    if (state === 'pinned-shelf' || state === 'pinned-clip') {
      return;
    }

    if (nextPlaying) {
      if (state === 'hover-media') {
        // Jika sedang di hover action menu, jangan pernah munculkan toast banner!
        // Biarkan tetap di hover action menu dengan ikon berubah jadi Pause & wave bergerak
        return;
      }

      if (state === 'stealth-micro') {
        // Trigger micro-peek: sedikit melebar & meninggi selama 2.5s lalu susut kembali ke 36x5px
        setIsStealthPeeking(true);
        if (stealthPulseTimeoutRef.current) clearTimeout(stealthPulseTimeoutRef.current);
        stealthPulseTimeoutRef.current = window.setTimeout(() => {
          setIsStealthPeeking(false);
        }, 2500);
        return;
      }

      // Cek apakah media sudah berhenti lama (>4s) sebelum di-play manual dari luar
      const wasStoppedLongEnough = Date.now() - stoppedSinceRef.current >= 4000;
      if (wasStoppedLongEnough) {
        setState('transient-toast');
        if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
        toastTimeoutRef.current = window.setTimeout(() => {
          setState(isForegroundMax ? 'stealth-micro' : 'ambient-active');
        }, 2500);
      } else {
        setState(isForegroundMax ? 'stealth-micro' : 'ambient-active');
      }
    } else {
      stoppedSinceRef.current = Date.now();
      // Saat menekan tombol Pause di dalam Hover Action Menu:
      // JANGAN menutup menu! Tetap buka Hover Action Menu agar pengguna bisa scrub timeline, ganti lagu, dsb.
      if (state === 'hover-media') {
        return;
      }
      setState(isForegroundMax ? 'stealth-micro' : 'pure-idle');
    }
  };

  // --- Shelf File Actions ---
  const handleRevealInExplorer = async (filePath?: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!filePath) return;
    try {
      await invoke('shelf_reveal_in_explorer', { path: filePath });
    } catch (err) {
      console.error('Failed to reveal file:', err);
    }
  };

  // --- Clipboard Stash Actions ---
  const handleCopyClipboardItem = async (entry: ClipboardEntry, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await invoke('clipboard_copy', { text: entry.content });
    } catch {
      navigator.clipboard?.writeText(entry.content);
    }
    setCopiedId(entry.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleRemoveClipboardItem = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await invoke('clipboard_remove', { id });
    } catch (err) {
      console.error(err);
    }
    setClipboard((prev) => prev.filter((item) => item.id !== id));
  };

  const handleClearClipboard = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await invoke('clipboard_clear');
    } catch (err) {
      console.error(err);
    }
    setClipboard([]);
  };

  // --- Capsule Geometry per State ---
  const getCapsuleStyles = (): React.CSSProperties => {
    switch (state) {
      case 'stealth-micro':
        return {
          top: '0px',
          width: isStealthPeeking ? '76px' : '56px',
          height: isStealthPeeking ? '16px' : '6px',
          borderRadius: '0px 0px 8px 8px',
          opacity: 1,
        };
      case 'pure-idle':
        return {
          top: `${settings.verticalOffset}px`,
          width: '130px',
          height: '34px',
          borderRadius: '9999px',
        };
      case 'transient-toast':
        return {
          top: `${settings.verticalOffset}px`,
          width: '340px',
          height: '46px',
          borderRadius: '9999px',
        };
      case 'ambient-active':
        return {
          top: `${settings.verticalOffset}px`,
          width: '204px',
          height: '34px',
          borderRadius: '9999px',
        };
      case 'hover-media':
        return {
          top: '0px',
          width: '456px',
          height: '64px',
          borderRadius: '0px 0px 24px 24px',
        };
      case 'pinned-shelf':
        return {
          top: '0px',
          width: '470px',
          height: '180px',
          borderRadius: '0px 0px 24px 24px',
        };
      case 'pinned-clip':
        return {
          top: '0px',
          width: '430px',
          height: '180px',
          borderRadius: '0px 0px 24px 24px',
        };
      case 'volume-hud':
        const fromStealth = previousNonVolumeState === 'stealth-micro';
        return {
          top: fromStealth ? '0px' : `${settings.verticalOffset}px`,
          width: '210px',
          height: fromStealth ? '32px' : '36px',
          borderRadius: fromStealth ? '0px 0px 16px 16px' : '9999px',
        };
      case 'update-alert':
        return {
          top: `${settings.verticalOffset}px`,
          width: '375px',
          height: '48px',
          borderRadius: '24px',
        };
      case 'update-downloading':
        return {
          top: `${settings.verticalOffset}px`,
          width: '330px',
          height: '44px',
          borderRadius: '22px',
        };
      case 'update-ready':
        return {
          top: `${settings.verticalOffset}px`,
          width: '340px',
          height: '48px',
          borderRadius: '24px',
        };
    }
  };

  const textPrimary = isDark ? '#f4f5f8' : '#1c1f26';
  const textMuted = isDark ? 'rgba(244, 245, 248, 0.55)' : 'rgba(28, 31, 38, 0.6)';
  const textSubtle = isDark ? 'rgba(244, 245, 248, 0.38)' : 'rgba(28, 31, 38, 0.45)';
  const cardBg = isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(15, 23, 42, 0.04)';
  const cardBorder = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(15, 23, 42, 0.1)';
  const cardBorderSubtle = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(15, 23, 42, 0.08)';

  const getClipBadgeStyle = (type: string) => {
    switch (type) {
      case 'URL':
        return isDark
          ? { background: 'rgba(56, 189, 248, 0.15)', color: '#7dd3fc' }
          : { background: 'rgba(2, 132, 199, 0.12)', color: '#0369a1' };
      case 'CODE':
        return isDark
          ? { background: 'rgba(52, 211, 153, 0.15)', color: '#6ee7b7' }
          : { background: 'rgba(5, 150, 105, 0.12)', color: '#047857' };
      case 'COLOR':
        return isDark
          ? { background: 'rgba(251, 191, 36, 0.15)', color: '#fde047' }
          : { background: 'rgba(217, 119, 6, 0.12)', color: '#b45309' };
      default:
        return isDark
          ? { background: 'rgba(168, 85, 247, 0.15)', color: '#d8b4fe' }
          : { background: 'rgba(126, 34, 206, 0.12)', color: '#7e22ce' };
    }
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragOver(true);
        if (state !== 'pinned-shelf') setState('pinned-shelf');
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOver(false);
      }}
      className="relative w-screen h-screen flex justify-center items-start select-none"
    >
      {/* Dynamic Island Capsule */}
      <div
        id="islandCapsule"
        onClick={() => {
          if (hasPendingUpdate && (state === 'pure-idle' || state === 'ambient-active')) {
            setState('update-alert');
          }
        }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={`relative ${
          isDark ? 'hig-glass-dark' : 'hig-glass-light'
        } ${
          isDragOver ? 'ring-2 ring-teal-400 ring-offset-2 ring-offset-transparent' : ''
        } transition-all ease-apple overflow-hidden flex flex-col pointer-events-auto`}
        style={{
          ...getCapsuleStyles(),
          transitionDuration: settings.animDuration,
        }}
      >
        {/* State 0: Stealth Micro-Pill */}
        {state === 'stealth-micro' && (
          <div
            onClick={() => setState('hover-media')}
            className="w-full h-full flex items-center justify-center cursor-pointer select-none"
          >
            {isStealthPeeking ? (
              <div className="w-full h-full flex items-center justify-center">
                <WaveCanvas width={64} height={14} isPlaying={isPlaying} theme={theme} />
              </div>
            ) : (
              <div className="w-4 h-[1.5px] rounded-full bg-white/60 hover:bg-white/90 transition-opacity" />
            )}
          </div>
        )}

        {/* State 7: Volume HUD Indicator (Apple HIG Micro-Bar) */}
        {state === 'volume-hud' && (
          <div
            className={`flex items-center gap-2.5 w-full h-full px-3 transition-opacity duration-150 ${
              isVolumeFading ? 'opacity-0' : 'opacity-100'
            }`}
          >
            {currentVolume === 0 ? (
              <VolumeX className="w-4 h-4 text-rose-500 shrink-0" />
            ) : (
              <Volume2 className="w-4 h-4 shrink-0" style={{ color: isDark ? "#2dd4bf" : "#0d9488" }} />
            )}
            {/* Volume Slider Track */}
            <div
              className="flex-1 h-2 rounded-full overflow-hidden p-0.5 flex items-center"
              style={{ background: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(15, 23, 42, 0.12)' }}
            >
              <div
                className={`h-full rounded-full transition-all duration-100 ${
                  isDark
                    ? 'bg-gradient-to-r from-teal-400 to-indigo-400'
                    : 'bg-gradient-to-r from-teal-600 to-indigo-600'
                }`}
                style={{ width: `${currentVolume}%` }}
              />
            </div>
            <span className="text-xs font-mono font-semibold tnum shrink-0 w-8 text-right" style={{ color: textPrimary }}>
              {currentVolume}%
            </span>
          </div>
        )}

        {/* State 1: Pure Idle (Clock + Floating Wink Glyph) */}
        {state === 'pure-idle' && (
          <div className="w-full h-full flex items-center justify-center gap-2.5 px-3">
            <div className="relative inline-flex items-center">
              <WinkGlyph
                width={26}
                height={11}
                color={isDark ? '#ffffff' : '#1c1f26'}
              />
              {hasPendingUpdate && (
                <span className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_#38bdf8] animate-pulse" />
              )}
            </div>
            <span className="text-xs font-semibold tnum" style={{ color: textPrimary }}>
              {currentTime}
            </span>
          </div>
        )}

        {/* State 2: Transient Toast Banner (New track 2.5s) */}
        {state === 'transient-toast' && (
          <div className="w-full h-full flex items-center gap-2.5 px-3">
            <img
              src={currentTrack.cover}
              className="w-7 h-7 rounded-full object-cover border border-white/10 shrink-0"
              alt="Art"
            />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold truncate tracking-tight" style={{ color: textPrimary }}>
                {currentTrack.title}
              </p>
              <p className="text-[10px] truncate" style={{ color: textMuted }}>
                {currentTrack.artist}
              </p>
            </div>
            <WaveCanvas width={48} height={18} isPlaying={isPlaying} theme={theme} />
          </div>
        )}

        {/* State 3: Ambient Active (Wink Glyph + Clock + One UI 8/9 3D Wave Canvas) */}
        {state === 'ambient-active' && (
          <div className="w-full h-full flex items-center justify-between px-3">
            <div className="flex items-center gap-2">
              <div className="relative inline-flex items-center">
                <WinkGlyph
                  width={22}
                  height={10}
                  color={isDark ? '#ffffff' : '#1c1f26'}
                />
                {hasPendingUpdate && (
                  <span className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_#38bdf8] animate-pulse" />
                )}
              </div>
              <span className="text-xs font-semibold tnum" style={{ color: textPrimary }}>
                {currentTime}
              </span>
            </div>
            <WaveCanvas width={52} height={18} isPlaying={isPlaying} theme={theme} />
          </div>
        )}

        {/* State: Update Alert Toast */}
        {state === 'update-alert' && (
          <div className="w-full h-full flex items-center justify-between px-3 gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center shrink-0 relative">
                <WinkGlyph width={18} height={8} color="#38bdf8" />
                <span className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping" />
              </div>
              <div className="flex flex-col text-left min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-bold text-white tracking-tight truncate">
                    Update {updateMeta?.version || 'v1.2.1'}
                  </span>
                  <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 shrink-0">
                    Baru
                  </span>
                </div>
                <span className="text-[10px] text-zinc-400 truncate max-w-[150px]">
                  {updateMeta?.body || 'Sinkronisasi GSMTC & Spring Fisika'}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  startDownload();
                }}
                className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-zinc-200 text-black font-semibold text-xs transition active:scale-95 flex items-center gap-1 shadow-sm"
              >
                <Download className="w-3.5 h-3.5 text-black" />
                <span>Perbarui</span>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  dismissUpdateToast();
                }}
                className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-white/10 transition"
                title="Ingatkan Nanti"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* State: Update Downloading HUD */}
        {state === 'update-downloading' && (
          <div className="w-full h-full flex flex-col justify-center px-3 gap-1">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-white text-[11px] flex items-center gap-1.5">
                <RotateCw className="w-3 h-3 text-cyan-400 animate-spin" />
                Mengunduh {updateMeta?.version || 'v1.2.1'}
              </span>
              <span className="font-mono text-[10px] text-cyan-400 font-medium">
                {downloadProgress.percent}% {downloadProgress.totalMb > 0 ? `(${downloadProgress.currentMb} / ${downloadProgress.totalMb} MB)` : ''}
              </span>
            </div>
            <div className="w-full h-1.5 bg-white/15 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-400 to-emerald-400 rounded-full transition-all duration-200"
                style={{ width: `${downloadProgress.percent}%` }}
              />
            </div>
          </div>
        )}

        {/* State: Update Ready to Restart */}
        {state === 'update-ready' && (
          <div className="w-full h-full flex items-center justify-between px-3 gap-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                <Check className="w-4 h-4" />
              </div>
              <div className="text-left">
                <div className="text-xs font-bold text-white">Unduhan Siap</div>
                <div className="text-[10px] text-zinc-400">Klik restart untuk menerapkan</div>
              </div>
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation();
                applyUpdateAndRestart();
              }}
              className="px-3 py-1.5 rounded-lg bg-emerald-400 hover:bg-emerald-300 text-black font-semibold text-xs transition active:scale-95 flex items-center gap-1 shadow-sm shrink-0"
            >
              <RotateCw className="w-3.5 h-3.5" />
              <span>Restart</span>
            </button>
          </div>
        )}

        {/* State 4: Hover-to-Reveal Media Controls + Satellite Buttons */}
        {state === 'hover-media' && (
          <div className="w-full h-full flex items-center gap-2.5 px-3">
            {/* Cover Art */}
            <img
              src={currentTrack.cover}
              className="w-9 h-9 rounded-xl object-cover border border-white/10 shrink-0"
              alt="Art"
            />

            {/* Title & Progress line */}
            <div className="flex-1 min-w-0 flex flex-col justify-center">
              <div className="flex items-center justify-between mb-0.5">
                <span className="text-xs font-semibold truncate tracking-tight" style={{ color: textPrimary }}>
                  {currentTrack.title}
                </span>
                <span className="text-[10px] font-mono tnum" style={{ color: textMuted }}>
                  {formatSeconds(progress)} / {formatSeconds(currentTrack.duration)}
                </span>
              </div>
              <div className="w-full h-1 bg-white/15 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-150"
                  style={{
                    width: `${Math.min(100, (progress / currentTrack.duration) * 100)}%`,
                    backgroundColor: getInkAccent(currentTrack.accent),
                  }}
                />
              </div>
            </div>

            {/* Playback Controls */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={handleSkipPrev}
                className="w-6 h-6 rounded-full flex items-center justify-center text-white/70 hover:text-white transition active:scale-90"
                title="Sebelumnya"
              >
                <SkipBack className="w-3.5 h-3.5 fill-current" />
              </button>
              <button
                onClick={handleTogglePlay}
                className="play-btn w-7 h-7 rounded-full flex items-center justify-center font-bold shadow-md transition active:scale-90"
                style={{ backgroundColor: currentTrack.accent, color: '#121316' }}
                title="Play/Pause"
              >
                {isPlaying ? (
                  <Pause className="w-3.5 h-3.5 fill-current" />
                ) : (
                  <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                )}
              </button>
              <button
                onClick={handleSkipNext}
                className="w-6 h-6 rounded-full flex items-center justify-center text-white/70 hover:text-white transition active:scale-90"
                title="Berikutnya"
              >
                <SkipForward className="w-3.5 h-3.5 fill-current" />
              </button>
            </div>

            {/* Hairline Divider */}
            <div className="h-6 w-[1px] bg-white/[0.1] mx-0.5" />

            {/* Three Satellite Action Buttons: Drop Shelf, Clipboard, Settings */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setState('pinned-shelf');
                }}
                className="h-8 px-2 rounded-xl transition flex items-center gap-1.5 active:scale-95"
                style={{
                  background: cardBg,
                  border: `1px solid ${cardBorder}`,
                }}
                title="Buka File Drop Shelf"
              >
                <FolderDown className="w-3.5 h-3.5" style={{ color: isDark ? '#2dd4bf' : '#0d9488' }} />
                <span className="text-[10px] font-mono font-medium" style={{ color: textMuted }}>
                  {shelfFiles.length}
                </span>
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setState('pinned-clip');
                }}
                className="h-8 w-8 rounded-xl transition flex items-center justify-center active:scale-95"
                style={{
                  background: cardBg,
                  border: `1px solid ${cardBorder}`,
                }}
                title="Buka Clipboard Stash"
              >
                <Clipboard className="w-3.5 h-3.5" style={{ color: isDark ? '#fbbf24' : '#d97706' }} />
              </button>

              <button
                onClick={(e) => {
                  e.stopPropagation();
                  invoke('open_settings_window').catch(console.error);
                }}
                className="h-8 w-8 rounded-xl transition flex items-center justify-center active:scale-95"
                style={{
                  background: cardBg,
                  border: `1px solid ${cardBorder}`,
                }}
                title="Buka Pengaturan (Settings)"
              >
                <Settings className="w-3.5 h-3.5" style={{ color: isDark ? '#818cf8' : '#4f46e5' }} />
              </button>
            </div>
          </div>
        )}

        {/* State 5: Pinned Top-Docked Shelf Drawer */}
        {state === 'pinned-shelf' && (
          <div className="flex flex-col w-full h-full py-2 px-3 justify-between">
            {/* Header */}
            <div
              className="flex items-center justify-between pb-1.5"
              style={{ borderBottom: `1px solid ${cardBorderSubtle}` }}
            >
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setState('hover-media');
                  }}
                  className="w-6 h-6 rounded-lg flex items-center justify-center transition active:scale-90"
                  style={{
                    background: cardBg,
                    border: `1px solid ${cardBorder}`,
                    color: textPrimary,
                  }}
                  title="Kembali ke Kontrol Media"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <FolderDown className="w-4 h-4" style={{ color: isDark ? '#2dd4bf' : '#0d9488' }} />
                <span className="text-xs font-semibold tracking-tight" style={{ color: textPrimary }}>
                  File Drop Shelf
                </span>
                <span
                  className="text-[10px] font-mono px-2 py-0.5 rounded-full font-medium"
                  style={{
                    background: isDark ? 'rgba(45, 212, 191, 0.15)' : 'rgba(13, 148, 136, 0.15)',
                    color: isDark ? '#5eead4' : '#0f766e',
                  }}
                >
                  {shelfFiles.length} Berkas
                </span>
              </div>
              <div className="flex items-center gap-2">
                {shelfFiles.length > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShelfFiles([]);
                    }}
                    className="text-[10px] hover:text-rose-500 transition flex items-center gap-1"
                    style={{ color: textSubtle }}
                    title="Kosongkan Shelf"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Kosongkan</span>
                  </button>
                )}
                <span className="text-[10px] font-mono" style={{ color: textSubtle }}>ESC</span>
              </div>
            </div>

            {/* Drag Over Hint Zone */}
            {isDragOver ? (
              <div
                className="flex-1 my-1 border-2 border-dashed rounded-xl flex items-center justify-center"
                style={{
                  borderColor: isDark ? 'rgba(45, 212, 191, 0.6)' : 'rgba(13, 148, 136, 0.6)',
                  background: isDark ? 'rgba(45, 212, 191, 0.1)' : 'rgba(13, 148, 136, 0.1)',
                }}
              >
                <span
                  className="text-xs font-medium animate-pulse"
                  style={{ color: isDark ? '#5eead4' : '#0d9488' }}
                >
                  Lepaskan berkas di sini untuk simpan ke Shelf
                </span>
              </div>
            ) : shelfFiles.length === 0 ? (
              <div
                className="flex-1 my-1 border border-dashed rounded-xl flex flex-col items-center justify-center gap-1 select-none"
                style={{ borderColor: cardBorder }}
              >
                <FolderDown className="w-5 h-5" style={{ color: textSubtle }} />
                <span className="text-xs" style={{ color: textMuted }}>Shelf masih kosong</span>
                <span className="text-[10px]" style={{ color: isDark ? '#2dd4bf' : '#0d9488' }}>
                  Tarik berkas dari mana saja & letakkan di sini
                </span>
              </div>
            ) : (
              /* File Items Grid */
              <div className="grid grid-cols-2 gap-2 my-1 overflow-y-auto hig-scrollbar max-h-24 pr-1">
                {shelfFiles.map((file) => (
                  <div
                    key={file.id}
                    className="group relative flex items-center gap-2 p-1.5 rounded-xl transition cursor-default shadow-sm"
                    style={{ background: cardBg, border: `1px solid ${cardBorder}` }}
                  >
                    {/* Extension Badge */}
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center font-mono font-bold text-[9px] shrink-0"
                      style={{
                        background: `${file.color}${isDark ? '20' : '33'}`,
                        color: isDark ? file.color : getInkAccent(file.color),
                      }}
                    >
                      {file.ext}
                    </div>

                    {/* File Info */}
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-medium truncate" style={{ color: textPrimary }}>
                        {file.name}
                      </p>
                      <p className="text-[9px] font-mono" style={{ color: textMuted }}>
                        {file.size}
                      </p>
                    </div>

                    {/* Action buttons on card hover */}
                    <div className="flex items-center gap-0.5 shrink-0">
                      {file.path && (
                        <button
                          onClick={(e) => handleRevealInExplorer(file.path, e)}
                          className="p-1 hover:text-teal-500 transition"
                          style={{ color: textSubtle }}
                          title="Buka di File Explorer"
                        >
                          <ExternalLink className="w-3 h-3" style={{ color: isDark ? '#2dd4bf' : '#0d9488' }} />
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShelfFiles((prev) => prev.filter((f) => f.id !== file.id));
                        }}
                        className="p-1 hover:text-rose-500 transition"
                        style={{ color: textSubtle }}
                        title="Hapus dari Shelf"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Footer */}
            <div
              className="flex items-center justify-between text-[11px] pt-1"
              style={{ borderTop: `1px solid ${cardBorderSubtle}`, color: textMuted }}
            >
              <span>Transit hub berkas sementara</span>
              <span
                className="text-[10px] font-mono"
                style={{ color: isDark ? 'rgba(45, 212, 191, 0.8)' : '#0d9488' }}
              >
                Drag & Drop ke Wink
              </span>
            </div>
          </div>
        )}

        {/* State 6: Pinned Top-Docked Clipboard Drawer */}
        {state === 'pinned-clip' && (
          <div className="flex flex-col w-full h-full py-2 px-3 justify-between">
            {/* Header */}
            <div
              className="flex items-center justify-between pb-1.5"
              style={{ borderBottom: `1px solid ${cardBorderSubtle}` }}
            >
              <div className="flex items-center gap-2">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setState('hover-media');
                  }}
                  className="w-6 h-6 rounded-lg flex items-center justify-center transition active:scale-90"
                  style={{
                    background: cardBg,
                    border: `1px solid ${cardBorder}`,
                    color: textPrimary,
                  }}
                  title="Kembali ke Kontrol Media"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <Clipboard className="w-4 h-4" style={{ color: isDark ? '#fbbf24' : '#d97706' }} />
                <span className="text-xs font-semibold tracking-tight" style={{ color: textPrimary }}>
                  Papan Klip Cepat
                </span>
                <span
                  className="text-[10px] font-mono px-2 py-0.5 rounded-full font-medium"
                  style={{
                    background: isDark ? 'rgba(245, 158, 11, 0.15)' : 'rgba(217, 119, 6, 0.15)',
                    color: isDark ? '#fcd34d' : '#b45309',
                  }}
                >
                  {clipboard.length} Riwayat
                </span>
              </div>
              <div className="flex items-center gap-2">
                {clipboard.length > 0 && (
                  <button
                    onClick={handleClearClipboard}
                    className="text-[10px] hover:text-rose-500 transition flex items-center gap-1"
                    style={{ color: textSubtle }}
                    title="Kosongkan Riwayat Clipboard"
                  >
                    <Trash2 className="w-3 h-3" />
                    <span>Kosongkan</span>
                  </button>
                )}
                <span className="text-[10px] font-mono" style={{ color: textSubtle }}>ESC</span>
              </div>
            </div>

            {/* Clipboard Items List */}
            {clipboard.length === 0 ? (
              <div
                className="flex-1 my-1 border border-dashed rounded-xl flex flex-col items-center justify-center gap-1"
                style={{ borderColor: cardBorder }}
              >
                <Clipboard className="w-5 h-5" style={{ color: textSubtle }} />
                <span className="text-xs" style={{ color: textMuted }}>Riwayat clipboard kosong</span>
                <span className="text-[10px]" style={{ color: isDark ? '#fbbf24' : '#d97706' }}>
                  Salin teks di mana saja (Ctrl+C)
                </span>
              </div>
            ) : (
              <div className="space-y-1.5 my-1 overflow-y-auto hig-scrollbar max-h-24 pr-1">
                {clipboard.map((entry) => {
                  const isCopied = copiedId === entry.id;
                  const isColor = entry.item_type === 'COLOR';

                  return (
                    <div
                      key={entry.id}
                      onClick={(e) => handleCopyClipboardItem(entry, e)}
                      className="group flex items-center justify-between p-1.5 rounded-xl transition cursor-pointer text-xs"
                      style={{ background: cardBg, border: `1px solid ${cardBorder}` }}
                      title="Klik untuk salin instan"
                    >
                      <div className="flex items-center gap-2 truncate flex-1 min-w-0">
                        {/* Type badge */}
                        <span
                          className="text-[9px] font-mono px-1.5 py-0.5 rounded font-bold shrink-0"
                          style={getClipBadgeStyle(entry.item_type)}
                        >
                          {entry.item_type}
                        </span>

                        {/* Color Preview Swatch */}
                        {isColor && (
                          <div
                            className="w-3.5 h-3.5 rounded shrink-0"
                            style={{
                              backgroundColor: entry.content.trim(),
                              border: `1px solid ${cardBorder}`,
                            }}
                          />
                        )}

                        {/* Snippet text */}
                        <span className="truncate font-mono text-[11px]" style={{ color: textPrimary }}>
                          {entry.content}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0 ml-2">
                        {isCopied ? (
                          <span
                            className="text-[9px] font-mono px-1.5 py-0.5 rounded font-semibold flex items-center gap-0.5"
                            style={{
                              background: isDark ? 'rgba(52, 211, 153, 0.2)' : 'rgba(5, 150, 105, 0.15)',
                              color: isDark ? '#6ee7b7' : '#047857',
                            }}
                          >
                            <Check className="w-2.5 h-2.5" />
                            <span>Tersalin!</span>
                          </span>
                        ) : (
                          <span className="text-[10px]" style={{ color: textMuted }}>
                            {entry.time}
                          </span>
                        )}

                        <button
                          onClick={(e) => handleRemoveClipboardItem(entry.id, e)}
                          className="p-1 opacity-0 group-hover:opacity-100 hover:text-rose-500 transition"
                          style={{ color: textSubtle }}
                          title="Hapus baris ini"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Footer */}
            <div
              className="flex items-center justify-between text-[11px] pt-1"
              style={{ borderTop: `1px solid ${cardBorderSubtle}`, color: textMuted }}
            >
              <span>Klik baris untuk salin</span>
              <span
                className="text-[10px] font-mono"
                style={{ color: isDark ? 'rgba(245, 158, 11, 0.8)' : '#b45309' }}
              >
                Riwayat Clipboard
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
