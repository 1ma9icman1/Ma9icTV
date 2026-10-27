import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Layers,
  Heart,
  ChevronLeft,
  Sparkles,
  RefreshCw,
  FolderOpen,
  Maximize2,
  Minimize2,
  Search,
  Star,
} from 'lucide-react';

import { Channel, Playlist, AppSettings } from './types';
import {
  getSavedPlaylists,
  savePlaylists,
  setActivePlaylistId,
  getFavorites,
  saveFavorites,
  getFavoriteChannels,
  saveFavoriteChannels,
  toggleFavorite,
  getRecentlyPlayed,
  addRecentlyPlayed,
  getSettings,
  saveSettings,
  resetAppStorage,
  addBlacklistedChannel,
} from './utils/storage';
import { INITIAL_PRESETS, CATALOG_PLAYLISTS } from './data/presetPlaylists';
import { parseM3uString } from './utils/playlistParser';
import { apiUrl, isStaticClient, networkUrl } from './utils/api';

import { ChannelList } from './components/ChannelList';
import { VideoPlayer } from './components/VideoPlayer';
import { PlaylistModal } from './components/PlaylistModal';
import { EpgGuide } from './components/EpgGuide';
import { SettingsModal } from './components/SettingsModal';
import { ShortcutsModal } from './components/ShortcutsModal';

// Pick a real HTTP(S) stream instead of blindly selecting a playlist's first
// metadata row, which can be empty or non-playable and leave the EPG visible
// with no video on startup.
function getFirstStreamChannel(channels: Channel[]): Channel | null {
  return channels.find((channel) => /^https?:\/\//i.test(String(channel.url || '').trim())) || null;
}

const DEFAULT_SAMSUNG_PLAYLIST_ID = 'default-samsung-tv-plus-us';
const DEFAULT_SAMSUNG_PLAYLIST_URL = 'https://raw.githubusercontent.com/BuddyChewChew/app-m3u-generator/main/playlists/samsungtvplus_us.m3u';
const DEFAULT_SAMSUNG_EPG_URL = 'https://i.mjh.nz/SamsungTVPlus/us.xml.gz';

// Keep Samsung as the selected startup playlist even before its remote lineup arrives.
// This prevents an unrelated built-in worldwide preset from showing while Samsung loads.
function createSamsungPlaylistPlaceholder(): Playlist {
  return {
    id: DEFAULT_SAMSUNG_PLAYLIST_ID,
    title: 'Samsung TV Plus US',
    url: DEFAULT_SAMSUNG_PLAYLIST_URL,
    type: 'm3u-url',
    channelCount: 0,
    addedAt: Date.now(),
    lastUpdated: Date.now(),
    epgUrl: DEFAULT_SAMSUNG_EPG_URL,
    channels: [],
  };
}

function getStartupPlaylists(): Playlist[] {
  const saved = getSavedPlaylists();
  if (saved.some((playlist) => playlist.id === DEFAULT_SAMSUNG_PLAYLIST_ID)) return saved;
  return [
    createSamsungPlaylistPlaceholder(),
    ...saved.filter((playlist) => playlist.url !== DEFAULT_SAMSUNG_PLAYLIST_URL),
  ];
}

export default function App() {
  // Playlists and Channels state. Samsung is the intended startup playlist;
  // saved worldwide/custom lists remain available in the playlist picker.
  const [playlists, setPlaylists] = useState<Playlist[]>(() => getStartupPlaylists());
  const [activePlaylistIdState, setActivePlaylistIdState] = useState<string>(() => DEFAULT_SAMSUNG_PLAYLIST_ID);
  // Only start playback from a cached Samsung channel. Do not briefly select a worldwide preset.
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(() => {
    const cachedDefault = getSavedPlaylists().find((playlist) => playlist.id === DEFAULT_SAMSUNG_PLAYLIST_ID);
    return cachedDefault ? getFirstStreamChannel(cachedDefault.channels) : null;
  });

  // Favorites and History
  const [favorites, setFavorites] = useState<string[]>(() => getFavorites());
  const [favoriteChannels, setFavoriteChannels] = useState<Channel[]>(() => {
    const favoriteIds = new Set(getFavorites());
    const stored = getFavoriteChannels().filter((channel) => favoriteIds.has(channel.id));
    const known = getSavedPlaylists().flatMap((playlist) => playlist.channels || [])
      .filter((channel) => favoriteIds.has(channel.id));
    const byId = new Map<string, Channel>();
    [...stored, ...known].forEach((channel) => byId.set(channel.id, channel));
    return [...byId.values()];
  });
  const [recentlyPlayed, setRecentlyPlayed] = useState<Channel[]>(() => getRecentlyPlayed());

  // Settings
  const [settings, setSettings] = useState<AppSettings>(() => getSettings());

  // Start in the combined EPG + live stream layout.
  // Fullscreen is requested separately below; browser policy may require one user gesture.
  const [currentView, setCurrentView] = useState<'player' | 'epg'>('epg');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isRefreshingPlaylist, setIsRefreshingPlaylist] = useState<boolean>(false);
  const [epgSearchQuery, setEpgSearchQuery] = useState('');
  const [showFavoriteEpg, setShowFavoriteEpg] = useState(false);
  const [isEpgLoading, setIsEpgLoading] = useState(false);
  const [samsungReloadToken, setSamsungReloadToken] = useState<number>(0);
  const [isAppFullscreen, setIsAppFullscreen] = useState<boolean>(() => Boolean(document.fullscreenElement));

  useEffect(() => {
    const syncFullscreenState = () => setIsAppFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', syncFullscreenState);
    return () => document.removeEventListener('fullscreenchange', syncFullscreenState);
  }, []);

  // Do not automatically enter fullscreen on the first user interaction.
  // In particular, clicks on EPG controls must never trigger a fullscreen transition.
  // Fullscreen remains available through the explicit Fullscreen button.
  const toggleAppFullscreen = async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch (error) {
      console.warn('Ma9icTV fullscreen is not supported or was blocked by this browser.', error);
    }
  };

  // Keep the playlist picker closed on startup; users can open it from the Layers button.
  const [isPlaylistModalOpen, setIsPlaylistModalOpen] = useState<boolean>(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState<boolean>(false);
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState<boolean>(false);

  // Current active playlist object
  const activePlaylist = useMemo(() => {
    const selected = playlists.find((p) => p.id === activePlaylistIdState) || playlists[0] || INITIAL_PRESETS[0];
    const catalogEntry = CATALOG_PLAYLISTS.find((item) => item.url === selected.url);
    // Catalog guide URLs are maintained centrally; prefer them over stale guide URLs
    // saved by earlier versions. For custom playlists, keep the URL from their M3U header.
    const resolvedEpgUrl = catalogEntry?.epgUrl || selected.epgUrl;
    return resolvedEpgUrl && selected.epgUrl !== resolvedEpgUrl
      ? { ...selected, epgUrl: resolvedEpgUrl }
      : selected;
  }, [playlists, activePlaylistIdState]);

  // Load Samsung TV Plus US by default. GitHub Pages cannot run the Express API,
  // so parse the public Samsung M3U directly in the browser on the Pages deployment.
  // Local/server deployments keep using /api/parse-playlist as before.
  useEffect(() => {
    let cancelled = false;

    const loadDefaultSamsung = async () => {
      const samsungUrl = DEFAULT_SAMSUNG_PLAYLIST_URL;
      const samsungId = DEFAULT_SAMSUNG_PLAYLIST_ID;

      // Select Samsung immediately; never present the worldwide fallback as the startup lineup.
      setActivePlaylistIdState(samsungId);
      setActivePlaylistId(samsungId);

      const cached = getSavedPlaylists().find((playlist) => playlist.id === samsungId);
      if (cached?.channels?.length) {
        if (cancelled) return;
        const firstStream = getFirstStreamChannel(cached.channels);
        if (firstStream) setSelectedChannel(firstStream);
        setCurrentView('epg');
        setIsSidebarCollapsed(true);
        return;
      }

      try {
        let channels: Channel[] = [];

        if (isStaticClient) {
          const response = await fetch(networkUrl(samsungUrl), {
            headers: { Accept: 'text/plain' },
            cache: 'no-store',
          });
          if (!response.ok) {
            throw new Error(`Samsung TV Plus M3U request failed (HTTP ${response.status}).`);
          }

          const rawM3u = await response.text();
          channels = parseM3uString(rawM3u, samsungId).map((channel, index) => ({
            ...channel,
            id: `${samsungId}-ch-${index}`,
            group: channel.group || 'Samsung TV Plus',
          }));
        } else {
          const response = await fetch(apiUrl('/api/parse-playlist'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: samsungUrl }),
          });
          if (!response.ok) {
            throw new Error(`Samsung TV Plus request failed (HTTP ${response.status}).`);
          }

          const data = await response.json();
          channels = (Array.isArray(data.items) ? data.items : []).map((item: any, idx: number) => ({
            id: `${samsungId}-ch-${idx}`,
            name: item.name || 'Samsung TV Plus Channel',
            url: item.url,
            group: item.group?.title || 'Samsung TV Plus',
            logo: item.tvg?.logo || undefined,
            tvgId: item.tvg?.id || undefined,
            tvgName: item.tvg?.name || undefined,
            tvgChno: item.tvg?.chno ? String(item.tvg.chno) : undefined,
            isRadio: item.radio === 'true' || item.url?.endsWith('.mp3'),
            raw: item.raw,
          }));
        }

        if (channels.length === 0) {
          throw new Error('Samsung TV Plus returned no valid channels.');
        }
        if (cancelled) return;

        const samsungPlaylist: Playlist = {
          id: samsungId,
          title: 'Samsung TV Plus US',
          url: samsungUrl,
          type: 'm3u-url',
          channelCount: channels.length,
          addedAt: cached?.addedAt || Date.now(),
          lastUpdated: Date.now(),
          epgUrl: DEFAULT_SAMSUNG_EPG_URL,
          channels,
        };

        setPlaylists((prev) => {
          const updated = [
            samsungPlaylist,
            ...prev.filter((playlist) => playlist.id !== samsungId && playlist.url !== samsungUrl),
          ];
          savePlaylists(updated);
          return updated;
        });
        setActivePlaylistIdState(samsungId);
        setActivePlaylistId(samsungId);
        const firstStream = getFirstStreamChannel(channels);
        setSelectedChannel(firstStream);
        setCurrentView('epg');
        setIsSidebarCollapsed(true);
      } catch (error) {
        console.warn('Ma9icTV: Could not load Samsung TV Plus US.', error);
        if (cancelled) return;

        // Keep the empty Samsung placeholder selected instead of silently showing
        // an unrelated Worldwide preset when this remote source is unavailable.
        const placeholder = createSamsungPlaylistPlaceholder();
        setPlaylists((prev) => [
          placeholder,
          ...prev.filter((playlist) => playlist.id !== samsungId && playlist.url !== samsungUrl),
        ]);
        setActivePlaylistIdState(samsungId);
        setActivePlaylistId(samsungId);
        setSelectedChannel(null);
        setCurrentView('epg');
        setIsSidebarCollapsed(true);
      }
    };

    void loadDefaultSamsung();
    return () => { cancelled = true; };
  }, [samsungReloadToken]);

  // Set default selected channel on first load or when playlist changes
  useEffect(() => {
    if (activePlaylist && activePlaylist.channels.length > 0) {
      const existsInCurrent = selectedChannel && activePlaylist.channels.some((c) => c.id === selectedChannel.id);
      if (!existsInCurrent) {
        const firstStream = getFirstStreamChannel(activePlaylist.channels);
        if (firstStream) setSelectedChannel(firstStream);
      }
    }
  }, [activePlaylist, selectedChannel]);

  // Channel select handler
  const handleSelectChannel = useCallback((channel: Channel) => {
    setSelectedChannel(channel);
    const updatedRecents = addRecentlyPlayed(channel);
    setRecentlyPlayed(updatedRecents);
  }, []);

  // When a stream fails or times out, advance to the next channel if autoPlayNext is enabled,
  // without permanently purging the channel from the user's saved playlists.
  const handleStreamFailed = useCallback((failedChannel: Channel, reason: string) => {
    if (!failedChannel?.url) return;
    console.warn('[Ma9icTV] stream playback failed', {
      name: failedChannel.name,
      url: failedChannel.url,
      reason,
      at: new Date().toISOString(),
    });

    if (settings.autoPlayNext) {
      const currentChannels = activePlaylist?.channels || [];
      const failedIndex = currentChannels.findIndex(
        (item) => item.url.toLowerCase() === failedChannel.url.toLowerCase()
          || item.id === failedChannel.id
      );
      if (failedIndex !== -1 && currentChannels.length > 1) {
        const nextIndex = (failedIndex + 1) % currentChannels.length;
        setSelectedChannel(currentChannels[nextIndex]);
      }
    }
  }, [activePlaylist, settings.autoPlayNext]);

  // Persist favorite IDs for the UI and complete channel records for text backup/restore.
  const handleToggleFavorite = useCallback((channelId: string) => {
    const lookup = new Map<string, Channel>();
    [...favoriteChannels, ...playlists.flatMap((playlist) => playlist.channels || []), ...recentlyPlayed,
      ...(selectedChannel ? [selectedChannel] : [])].forEach((channel) => lookup.set(channel.id, channel));
    const target = lookup.get(channelId);
    const updated = toggleFavorite(channelId);
    setFavorites(updated);
    setFavoriteChannels((previous) => {
      const next = previous.filter((channel) => channel.id !== channelId);
      if (updated.includes(channelId) && target) next.unshift(target);
      saveFavoriteChannels(next);
      return next;
    });
  }, [favoriteChannels, playlists, recentlyPlayed, selectedChannel]);

  const handleImportFavoriteChannels = useCallback((imported: Channel[]) => {
    const available = new Map<string, Channel>();
    [...playlists.flatMap((playlist) => playlist.channels || []), ...favoriteChannels, ...recentlyPlayed,
      ...(selectedChannel ? [selectedChannel] : [])].forEach((channel) => available.set(channel.url, channel));
    const resolved = imported.map((channel) => available.get(channel.url) || channel);
    const byId = new Map<string, Channel>();
    [...favoriteChannels, ...resolved].forEach((channel) => byId.set(channel.id, channel));
    const nextChannels = [...byId.values()];
    const nextIds = [...new Set([...favorites, ...resolved.map((channel) => channel.id)])];
    saveFavorites(nextIds);
    saveFavoriteChannels(nextChannels);
    setFavorites(nextIds);
    setFavoriteChannels(nextChannels);
  }, [playlists, favoriteChannels, recentlyPlayed, selectedChannel, favorites]);

  // Next / Previous Channel Skip
  const handleNextChannel = useCallback(() => {
    if (!selectedChannel || !activePlaylist) return;
    const channels = activePlaylist.channels;
    const currentIndex = channels.findIndex((c) => c.id === selectedChannel.id);
    if (currentIndex !== -1 && currentIndex < channels.length - 1) {
      handleSelectChannel(channels[currentIndex + 1]);
    } else if (channels.length > 0) {
      handleSelectChannel(channels[0]);
    }
  }, [selectedChannel, activePlaylist, handleSelectChannel]);

  const handlePrevChannel = useCallback(() => {
    if (!selectedChannel || !activePlaylist) return;
    const channels = activePlaylist.channels;
    const currentIndex = channels.findIndex((c) => c.id === selectedChannel.id);
    if (currentIndex > 0) {
      handleSelectChannel(channels[currentIndex - 1]);
    } else if (channels.length > 0) {
      handleSelectChannel(channels[channels.length - 1]);
    }
  }, [selectedChannel, activePlaylist, handleSelectChannel]);

  // Playlist management handlers
  const handleSelectPlaylist = useCallback((id: string) => {
    setActivePlaylistIdState(id);
    setActivePlaylistId(id);
    const target = playlists.find((p) => p.id === id);
    if (target && target.channels.length > 0) {
      setSelectedChannel(target.channels[0]);
    }
    setCurrentView('epg');
  }, [playlists]);

  const handleAddPlaylist = useCallback((newPlaylist: Playlist) => {
    setPlaylists((prev) => {
      // Replace if existing with same id or url, or append
      const existingIdx = prev.findIndex((p) => p.id === newPlaylist.id || (p.url && p.url === newPlaylist.url));
      let updated: Playlist[];
      if (existingIdx !== -1) {
        updated = [...prev];
        updated[existingIdx] = newPlaylist;
      } else {
        updated = [...prev, newPlaylist];
      }
      savePlaylists(updated);
      return updated;
    });
    // When importing a new playlist, select its first stream immediately so
    // the player can start while the EPG guide loads. Preserve the current
    // channel when refreshing the already-active playlist.
    if (newPlaylist.id !== activePlaylistIdState && newPlaylist.channels.length > 0) {
      setSelectedChannel(newPlaylist.channels[0]);
    }
  }, [activePlaylistIdState]);

  const handleDeletePlaylist = useCallback((id: string) => {
    setPlaylists((prev) => {
      const updated = prev.filter((p) => p.id !== id);
      savePlaylists(updated);
      return updated;
    });
    if (activePlaylistIdState === id) {
      const remaining = playlists.filter((p) => p.id !== id);
      if (remaining.length > 0) {
        handleSelectPlaylist(remaining[0].id);
      }
    }
  }, [activePlaylistIdState, playlists, handleSelectPlaylist]);

  // Refresh active playlist from remote URL
  const handleRefreshActivePlaylist = async () => {
    if (!activePlaylist.url || activePlaylist.type === 'm3u-file') {
      alert('Local file or preset playlist cannot be refreshed from remote URL.');
      return;
    }

    setIsRefreshingPlaylist(true);
    try {
      let channels: Channel[] = [];
      let refreshedEpgUrl = activePlaylist.epgUrl || undefined;

      if (isStaticClient) {
        const response = await fetch(networkUrl(activePlaylist.url, activePlaylist.userAgent), {
          cache: 'no-store',
          headers: { Accept: 'text/plain' },
        });
        if (!response.ok) throw new Error(`Failed to refresh playlist (HTTP ${response.status}).`);
        const rawM3u = await response.text();
        channels = parseM3uString(rawM3u, activePlaylist.id).map((channel, idx) => ({
          ...channel,
          id: `${activePlaylist.id}-ch-${idx}`,
          group: channel.group || 'General',
        }));
        const header = rawM3u.split(/\r?\n/).find((line) => line.trim().startsWith('#EXTM3U')) || '';
        const epgMatch = header.match(/(?:url-tvg|x-tvg-url|tvg-url)\s*=\s*["']([^"']+)["']/i);
        refreshedEpgUrl = epgMatch?.[1]?.trim() || refreshedEpgUrl;
      } else {
        const response = await fetch(apiUrl('/api/parse-playlist'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: activePlaylist.url,
            userAgent: activePlaylist.userAgent,
          }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || 'Failed to refresh playlist.');
        channels = (Array.isArray(data.items) ? data.items : []).map((item: any, idx: number) => ({
          id: `${activePlaylist.id}-ch-${idx}`,
          name: item.name || 'Channel',
          url: item.url,
          group: item.group?.title || 'General',
          logo: item.tvg?.logo || undefined,
          tvgId: item.tvg?.id || undefined,
          tvgName: item.tvg?.name || undefined,
          isRadio: item.radio === 'true' || item.url?.endsWith('.mp3'),
          raw: item.raw,
        }));
        refreshedEpgUrl = data.header?.urlTvg || refreshedEpgUrl;
      }

      if (channels.length === 0) {
        throw new Error('Remote playlist returned no channels. If this is a cross-origin source, the provider may block browser access.');
      }

      const refreshed: Playlist = {
        ...activePlaylist,
        channelCount: channels.length,
        lastUpdated: Date.now(),
        epgUrl: refreshedEpgUrl,
        channels,
      };

      handleAddPlaylist(refreshed);
      if (channels.length > 0) {
        setSelectedChannel(channels[0]);
      }
    } catch (err: any) {
      alert(err?.message || 'Error refreshing playlist.');
    } finally {
      setIsRefreshingPlaylist(false);
    }
  };

  // Reset all data. Keep the same Samsung TV Plus US startup default after reset.
  const handleResetAllData = useCallback(() => {
    // Reset only Ma9icTV data, not unrelated sites' LocalStorage on this origin.
    resetAppStorage();
    const resetPlaylists = [createSamsungPlaylistPlaceholder()];
    setPlaylists(resetPlaylists);
    savePlaylists(resetPlaylists);
    setActivePlaylistIdState(DEFAULT_SAMSUNG_PLAYLIST_ID);
    setActivePlaylistId(DEFAULT_SAMSUNG_PLAYLIST_ID);
    setFavorites([]);
    setFavoriteChannels([]);
    window.dispatchEvent(new Event('ma9ictv-storage-reset'));
    setRecentlyPlayed([]);
    const defaultSettings = getSettings();
    setSettings(defaultSettings);
    saveSettings(defaultSettings);
    setSelectedChannel(null);
    // Re-run the Samsung loader; do not select the worldwide demo preset on reset.
    setSamsungReloadToken((previous) => previous + 1);
  }, []);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === 'p' || e.key === 'P') {
        setIsPlaylistModalOpen((prev) => !prev);
      } else if (e.key === 's' || e.key === 'S') {
        setIsSettingsModalOpen((prev) => !prev);
      } else if (e.key === 'e' || e.key === 'E') {
        setCurrentView((prev) => (prev === 'player' ? 'epg' : 'player'));
      } else if (e.key === '?') {
        setIsShortcutsModalOpen((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Android TV: a short remote Back press dismisses the topmost UI layer,
  // or returns from EPG to the player. The native activity only exits on a long hold.
  useEffect(() => {
    const handleRemoteBack = () => {
      if (isShortcutsModalOpen) setIsShortcutsModalOpen(false);
      else if (isSettingsModalOpen) setIsSettingsModalOpen(false);
      else if (isPlaylistModalOpen) setIsPlaylistModalOpen(false);
      else if (currentView === 'epg') setCurrentView('player');
    };
    window.addEventListener('ma9ictv-back', handleRemoteBack);
    return () => window.removeEventListener('ma9ictv-back', handleRemoteBack);
  }, [isShortcutsModalOpen, isSettingsModalOpen, isPlaylistModalOpen, currentView]);

  // Theme application
  const themeClasses = useMemo(() => {
    if (settings.theme === 'oled') return 'bg-black text-slate-100';
    if (settings.theme === 'light') return 'bg-slate-100 text-slate-900';
    return 'bg-[#0b0f19] text-slate-100'; // Dark Slate (signature IPTVnator)
  }, [settings.theme]);

  return (
    <div className={`flex h-[100dvh] w-full overflow-hidden ${themeClasses} font-sans`}>
      {/* 2. Main Content Layout with Top Status Header */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Top Header Bar */}
        <header className="min-h-11 bg-slate-950/95 border-b border-slate-800/80 px-2 sm:px-3 py-1 flex flex-nowrap gap-2 items-center justify-between text-xs select-none z-20">
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="flex items-center bg-slate-900 rounded-md border border-slate-800 p-0.5 flex-shrink-0">
              <button onClick={() => { setCurrentView('player'); setIsSidebarCollapsed(false); }} className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${currentView === 'player' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`} aria-pressed={currentView === 'player'}>Player</button>
              <button onClick={() => setCurrentView('epg')} className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${currentView === 'epg' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`} aria-pressed={currentView === 'epg'}>EPG Guide</button>
            </div>
            {currentView === 'epg' && (
              <>
                <div className="relative flex-1 min-w-[90px] max-w-[240px]">
                  <Search className="w-3 h-3 text-slate-400 absolute left-2 top-1/2 -translate-y-1/2" />
                  <input
                    type="search"
                    placeholder="Search channels & shows"
                    value={epgSearchQuery}
                    onChange={(e) => setEpgSearchQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === 'Go' || e.key === 'Search') {
                        e.preventDefault();
                        e.currentTarget.blur();
                      }
                    }}
                    enterKeyHint="search"
                    className="w-full h-8 bg-slate-900 border border-slate-800 rounded-md pl-6 pr-1.5 text-[10px] text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setShowFavoriteEpg((value) => !value)}
                  aria-pressed={showFavoriteEpg}
                  title={showFavoriteEpg ? 'Return to active playlist' : 'Show favorite channels'}
                  className={`h-8 w-8 flex-shrink-0 rounded-md border flex items-center justify-center ${showFavoriteEpg ? 'border-amber-400/60 bg-amber-400/15 text-amber-300' : 'border-slate-800 bg-slate-900 text-slate-400 hover:text-amber-300'}`}
                >
                  <Star className={`h-3.5 w-3.5 ${showFavoriteEpg ? 'fill-current' : ''}`} />
                </button>
                <div className="flex flex-shrink-0 items-center gap-1 text-[10px] font-semibold uppercase" role="status" aria-live="polite">
                  <span className={isEpgLoading ? 'text-indigo-300' : 'text-slate-400'}>EPG</span>
                  {isEpgLoading && <RefreshCw className="h-3.5 w-3.5 animate-spin text-indigo-400" />}
                </div>
              </>
            )}
            <button
              onClick={() => setIsPlaylistModalOpen(true)}
              className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-200 transition-colors truncate max-w-xs sm:max-w-md"
              title="Change active playlist"
            >
              <FolderOpen className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
              <span className="font-semibold truncate">{activePlaylist.title}</span>
              <span className="text-[10px] text-slate-400 bg-slate-950 px-1.5 py-0.2 rounded border border-slate-800">
                {activePlaylist.channelCount} channels
              </span>
            </button>

            {activePlaylist.url && (
              <button
                disabled={isRefreshingPlaylist}
                onClick={handleRefreshActivePlaylist}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-900 transition-colors"
                title="Refresh current playlist from URL"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingPlaylist ? 'animate-spin text-indigo-400' : ''}`} />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={toggleAppFullscreen}
              className="flex items-center justify-center gap-1.5 min-w-9 min-h-9 px-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-800 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-400"
              title={isAppFullscreen ? 'Exit fullscreen' : 'Fullscreen — hide browser controls'}
              aria-label={isAppFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            >
              {isAppFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              <span className="hidden lg:inline">{isAppFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</span>
            </button>
            <button
              onClick={() => setIsPlaylistModalOpen(true)}
              className="hidden sm:flex px-2.5 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/30 text-xs font-semibold items-center gap-1.5 transition-all shadow-sm"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>CHOOSE SERVICE</span>
            </button>


          </div>
        </header>

        {/* Main Body */}
        <main className="flex-1 min-h-0 min-w-0 flex flex-col md:flex-row overflow-hidden relative">
          {currentView === 'player' ? (
            <>
              {/* Sidebar toggle button for mobile/compact */}
              {!isSidebarCollapsed && (
                <ChannelList
                  channels={activePlaylist.channels}
                  selectedChannel={selectedChannel}
                  onSelectChannel={handleSelectChannel}
                  favorites={favorites}
                  onToggleFavorite={handleToggleFavorite}
                  recentlyPlayed={recentlyPlayed}
                />
              )}

              {/* Toggle collapse button */}
              <div className="hidden md:flex items-center">
                <button
                  onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                  className="w-4 h-16 bg-slate-800/80 hover:bg-indigo-600 text-slate-400 hover:text-white rounded-r flex items-center justify-center transition-all -ml-[1px] z-20"
                  title={isSidebarCollapsed ? 'Show Channels' : 'Hide Channels'}
                >
                  <ChevronLeft className={`w-3.5 h-3.5 transition-transform ${isSidebarCollapsed ? 'rotate-180' : ''}`} />
                </button>
              </div>

              {/* Video Player Main Stage */}
              <VideoPlayer
                key={selectedChannel?.id || selectedChannel?.url || 'no-channel'}
                channel={selectedChannel}
                settings={settings}
                onNextChannel={handleNextChannel}
                onPrevChannel={handlePrevChannel}
                onStreamFailed={handleStreamFailed}
                isFavorite={selectedChannel ? favorites.includes(selectedChannel.id) : false}
                onToggleFavorite={() => selectedChannel && handleToggleFavorite(selectedChannel.id)}
                mode="full"
                onExpandPlayer={() => setCurrentView('epg')}
              />
            </>
          ) : (
            /* EPG Guide View with Live Player embedded at top stage */
            <EpgGuide
              channels={activePlaylist.channels}
              selectedChannel={selectedChannel}
              onSelectChannel={handleSelectChannel}
              settings={settings}
              favorites={favorites}
              favoriteChannels={favoriteChannels}
              onToggleFavorite={handleToggleFavorite}
              onImportFavoriteChannels={handleImportFavoriteChannels}
              onNextChannel={handleNextChannel}
              onPrevChannel={handlePrevChannel}
              onStreamFailed={handleStreamFailed}
               onOpenPlaylistModal={() => setIsPlaylistModalOpen(true)}
              onExpandPlayer={() => setCurrentView('player')}
              activePlaylistTitle={activePlaylist.title}
              activePlaylistEpgUrl={activePlaylist.epgUrl}
            />
          )}
        </main>
      </div>

      {/* 3. Modals */}
      <PlaylistModal
        isOpen={isPlaylistModalOpen}
        onClose={() => setIsPlaylistModalOpen(false)}
        playlists={playlists}
        activePlaylistId={activePlaylistIdState}
        onSelectPlaylist={handleSelectPlaylist}
        onAddPlaylist={handleAddPlaylist}
        onDeletePlaylist={handleDeletePlaylist}
      />

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        settings={settings}
        onUpdateSettings={(newSettings) => {
          setSettings(newSettings);
          saveSettings(newSettings);
        }}
        onResetAllData={handleResetAllData}
      />

      <ShortcutsModal
        isOpen={isShortcutsModalOpen}
        onClose={() => setIsShortcutsModalOpen(false)}
      />
    </div>
  );
}
