export type LifecycleState =
  | 'pure-idle'
  | 'transient-toast'
  | 'ambient-active'
  | 'hover-media'
  | 'pinned-shelf'
  | 'pinned-clip'
  | 'stealth-micro'
  | 'volume-hud'
  | 'update-alert'
  | 'update-downloading'
  | 'update-ready';

export interface UpdateInfo {
  version: string;
  currentVersion: string;
  body?: string;
  date?: string;
}

export interface MediaTrackInfo {
  title: string;
  artist: string;
  album: string;
  duration: number; // in seconds
  position: number; // in seconds
  is_playing: boolean;
  cover?: string | null;
}

export interface Track {
  title: string;
  artist: string;
  album: string;
  duration: number;
  cover: string;
  accent: string;
}

export interface ShelfFile {
  id: string;
  name: string;
  path?: string;
  size: string;
  ext: string;
  color: string;
}

export interface ClipboardEntry {
  id: string;
  item_type: string; // 'URL' | 'CODE' | 'COLOR' | 'TEXT'
  content: string;
  time: string;
}

export interface MonitorDetails {
  index: number;
  name: string;
  is_primary: boolean;
  width: number;
  height: number;
  scale_factor: number;
}

export type ThemeMode = 'dark' | 'light';

export interface AppSettings {
  themeMode: 'dark' | 'light' | 'system';
  animDuration: '450ms' | '580ms' | '750ms';
  verticalOffset: number; // e.g. 0 to 24 px
  autoStealth: boolean;
  edgeWake: boolean;
  inPlaceTrack: boolean;
  volumeHudEnabled: boolean;
  volumeDuration: number; // e.g. 1400 ms
  monitorPlacement: 'auto' | 'fixed';
  autoStart: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  themeMode: 'dark',
  animDuration: '580ms',
  verticalOffset: 8,
  autoStealth: true,
  edgeWake: true,
  inPlaceTrack: true,
  volumeHudEnabled: true,
  volumeDuration: 1400,
  monitorPlacement: 'auto',
  autoStart: false,
};
