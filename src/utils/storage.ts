import { AppSettings, Channel, Playlist } from '../types';
import { INITIAL_PRESETS } from '../data/presetPlaylists';

const STORAGE_KEYS = {
  PLAYLISTS: 'iptvnator_playlists',
  ACTIVE_PLAYLIST_ID: 'iptvnator_active_playlist',
  FAVORITES: 'iptvnator_favorites',
  RECENTLY_PLAYED: 'iptvnator_recent_channels',
  SETTINGS: 'iptvnator_settings',
  XTREAM_ACCOUNTS: 'iptvnator_xtream_accounts',
  EPG_URLS: 'iptvnator_epg_urls',
  PRESET_VERSION: 'iptvnator_preset_v3',
  BLACKLISTED_CHANNELS: 'iptvnator_blacklisted_channels',
};

const DEFAULT_SETTINGS: AppSettings = {
  theme: 'dark',
  proxyMode: 'always', // Essential in web browsers to bypass CORS and stream seamlessly
  customUserAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 IPTVnator/0.25.0',
  bufferLengthSeconds: 30,
  autoPlayNext: true,
  compactView: false,
  volume: 0.8,
  muted: false,
};

// ==========================================
// Blacklist Management
// ==========================================
export interface BlacklistedEntry {
  url: string;
  id?: string;
  name?: string;
  addedAt: number;
}

export function getBlacklistedChannels(): BlacklistedEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.BLACKLISTED_CHANNELS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function isChannelBlacklisted(channel: { url?: string; id?: string; name?: string }): boolean {
  if (!channel) return false;
  const list = getBlacklistedChannels();
  return list.some((b) => {
    if (channel.url && b.url && channel.url.toLowerCase() === b.url.toLowerCase()) return true;
    if (channel.id && b.id && channel.id === b.id) return true;
    return false;
  });
}

export function addBlacklistedChannel(channel: { url: string; id?: string; name?: string }): BlacklistedEntry[] {
  try {
    const current = getBlacklistedChannels();
    const normalizedUrl = channel.url.toLowerCase().trim();
    if (!current.some((b) => b.url.toLowerCase() === normalizedUrl)) {
      const updated = [
        ...current,
        {
          url: channel.url,
          id: channel.id,
          name: channel.name,
          addedAt: Date.now(),
        },
      ];
      localStorage.setItem(STORAGE_KEYS.BLACKLISTED_CHANNELS, JSON.stringify(updated));
      return updated;
    }
    return current;
  } catch (err) {
    console.error('Failed to blacklist channel:', err);
    return [];
  }
}

export function removeBlacklistedChannel(url: string): BlacklistedEntry[] {
  try {
    const current = getBlacklistedChannels();
    const updated = current.filter((b) => b.url.toLowerCase() !== url.toLowerCase());
    localStorage.setItem(STORAGE_KEYS.BLACKLISTED_CHANNELS, JSON.stringify(updated));
    return updated;
  } catch {
    return [];
  }
}

// ==========================================
// Playlist Storage & Retrieval
// ==========================================
export function getSavedPlaylists(): Playlist[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.PLAYLISTS);
    const version = localStorage.getItem(STORAGE_KEYS.PRESET_VERSION);
    const blacklist = getBlacklistedChannels();
    const blacklistedUrls = new Set(blacklist.map((b) => b.url.toLowerCase()));

    const filterBlacklist = (pls: Playlist[]): Playlist[] => {
      return pls.map((pl) => {
        const cleanChannels = pl.channels.filter((c) => !blacklistedUrls.has(c.url.toLowerCase()));
        return {
          ...pl,
          channelCount: cleanChannels.length,
          channels: cleanChannels,
        };
      });
    };

    if (!raw || version !== 'v3') {
      const existing = raw ? JSON.parse(raw) : [];
      const userCustomPlaylists = Array.isArray(existing)
        ? existing.filter((p: Playlist) => p.type !== 'preset')
        : [];
      const updated = filterBlacklist([INITIAL_PRESETS[0], ...userCustomPlaylists]);
      savePlaylists(updated);
      localStorage.setItem(STORAGE_KEYS.PRESET_VERSION, 'v3');
      return updated;
    }

    const parsed = JSON.parse(raw);
    const finalPlaylists = Array.isArray(parsed) && parsed.length > 0 ? parsed : INITIAL_PRESETS;
    return filterBlacklist(finalPlaylists);
  } catch (err) {
    console.error('Failed to load playlists:', err);
    return INITIAL_PRESETS;
  }
}

export function savePlaylists(playlists: Playlist[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.PLAYLISTS, JSON.stringify(playlists));
  } catch (err) {
    console.error('Failed to save playlists:', err);
  }
}

export function getActivePlaylistId(): string {
  const saved = localStorage.getItem(STORAGE_KEYS.ACTIVE_PLAYLIST_ID);
  return saved || INITIAL_PRESETS[0].id;
}

export function setActivePlaylistId(id: string): void {
  localStorage.setItem(STORAGE_KEYS.ACTIVE_PLAYLIST_ID, id);
}

export function getFavorites(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.FAVORITES);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function toggleFavorite(channelId: string): string[] {
  const current = getFavorites();
  const exists = current.includes(channelId);
  const updated = exists ? current.filter((id) => id !== channelId) : [...current, channelId];
  localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(updated));
  return updated;
}

export function getRecentlyPlayed(): Channel[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.RECENTLY_PLAYED);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function addRecentlyPlayed(channel: Channel): Channel[] {
  try {
    const current = getRecentlyPlayed();
    const filtered = current.filter((c) => c.url !== channel.url && c.id !== channel.id);
    const updated = [channel, ...filtered].slice(0, 25);
    localStorage.setItem(STORAGE_KEYS.RECENTLY_PLAYED, JSON.stringify(updated));
    return updated;
  } catch {
    return [];
  }
}

export function getSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...parsed, proxyMode: parsed.proxyMode || 'always' };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings): void {
  localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
}

export function exportAppState(): string {
  const state = {
    version: '0.25.0',
    exportDate: new Date().toISOString(),
    playlists: getSavedPlaylists(),
    favorites: getFavorites(),
    recentlyPlayed: getRecentlyPlayed(),
    blacklisted: getBlacklistedChannels(),
    settings: getSettings(),
  };
  return JSON.stringify(state, null, 2);
}

export function importAppState(jsonStr: string): boolean {
  try {
    const data = JSON.parse(jsonStr);
    if (data.playlists && Array.isArray(data.playlists)) {
      savePlaylists(data.playlists);
    }
    if (data.favorites && Array.isArray(data.favorites)) {
      localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(data.favorites));
    }
    if (data.blacklisted && Array.isArray(data.blacklisted)) {
      localStorage.setItem(STORAGE_KEYS.BLACKLISTED_CHANNELS, JSON.stringify(data.blacklisted));
    }
    if (data.settings && typeof data.settings === 'object') {
      saveSettings({ ...DEFAULT_SETTINGS, ...data.settings });
    }
    return true;
  } catch (err) {
    console.error('Failed to import app state:', err);
    return false;
  }
}
