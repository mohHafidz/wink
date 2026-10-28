import { emit } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { AppSettings, DEFAULT_SETTINGS } from './types';

const STORAGE_KEY = 'island_settings_v1';
export const SETTINGS_EVENT = 'island-settings-updated';

let cachedSettings: AppSettings = { ...DEFAULT_SETTINGS };

// Synchronous read (menggunakan cache memory / localStorage sebagai fallback instan)
export function getStoredSettings(): AppSettings {
  if (cachedSettings) return cachedSettings;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      cachedSettings = { ...DEFAULT_SETTINGS, ...parsed };
      return cachedSettings;
    }
  } catch (e) {
    console.warn('Failed to parse settings from localStorage', e);
  }

  cachedSettings = { ...DEFAULT_SETTINGS };
  return cachedSettings;
}

// Asynchronous fetch dari disk backend Rust (settings.json & Windows Startup Registry)
export async function fetchStoredSettings(): Promise<AppSettings> {
  try {
    const settings = await invoke<AppSettings>('get_app_settings');
    if (settings) {
      cachedSettings = { ...DEFAULT_SETTINGS, ...settings };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cachedSettings));
      } catch {
        // ignore
      }
      return cachedSettings;
    }
  } catch (err) {
    console.warn('Failed to load settings from Rust backend, using fallback', err);
  }
  return getStoredSettings();
}

// Simpan secara permanen ke disk via Rust + Registry Windows + localStorage + Tauri Event Broadcast
export async function saveStoredSettings(newSettings: AppSettings): Promise<void> {
  cachedSettings = { ...newSettings };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newSettings));
  } catch (e) {
    console.warn('Failed to save settings to localStorage', e);
  }

  try {
    await invoke('save_app_settings', { settings: newSettings });
  } catch (e) {
    console.error('Failed to save settings to Rust backend', e);
  }

  try {
    await emit(SETTINGS_EVENT, newSettings);
  } catch (e) {
    console.warn('Failed to emit settings event via Tauri', e);
  }
}
