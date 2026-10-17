import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Tv,
  Calendar,
  Layers,
  Heart,
  Settings as SettingsIcon,
  HelpCircle,
  ChevronLeft,
  Sparkles,
  RefreshCw,
  FolderOpen,
  Maximize2,
  Minimize2,
} from 'lucide-react';

import { Channel, Playlist, AppSettings } from './types';
import {
  getSavedPlaylists,
  savePlaylists,
  getActivePlaylistId,
  setActivePlaylistId,
  getFavorites,
  toggleFavorite,
  getRecentlyPlayed,
  addRecentlyPlayed,
  getSettings,
  saveSettings,
} from './utils/storage';
import { INITIAL_PRESETS, CATALOG_PLAYLISTS } from './data/presetPlaylists';

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

export default function App() {
  // Playlists and Channels state
  const [playlists, setPlaylists] = useState<Playlist[]>(() => getSavedPlaylists());
  const [activePlaylistIdState, setActivePlaylistIdState] = useState<string>(() => getActivePlaylistId());
  // Select a saved channel immediately so the embedded EPG player can begin
  // loading while the default Pluto playlist is fetched in the background.
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(() => {
    const savedPlaylists = getSavedPlaylists();
    const savedActiveId = getActivePlaylistId();
    const savedActive = savedPlaylists.find((playlist) => playlist.id === savedActiveId)
      || savedPlaylists[0]
      || INITIAL_PRESETS[0];
    return savedActive ? getFirstStreamChannel(savedActive.channels) : null;
  });

  // Favorites and History
  const [favorites, setFavorites] = useState<string[]>(() => getFavorites());
  const [recentlyPlayed, setRecentlyPlayed] = useState<Channel[]>(() => getRecentlyPlayed());

  // Settings
  const [settings, setSettings] = useState<AppSettings>(() => getSettings());

  // Start in the combined EPG + live stream layout.
  // Fullscreen is requested separately below; browser policy may require one user gesture.
  const [currentView, setCurrentView] = useState<'player' | 'epg'>('epg');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(true);
  const [isRefreshingPlaylist, setIsRefreshingPlaylist] = useState<boolean>(false);
  const [isAppFullscreen, setIsAppFullscreen] = useState<boolean>(() => Boolean(document.fullscreenElement));

  useEffect(() => {
    const syncFullscreenState = () => setIsAppFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', syncFullscreenState);
    return () => document.removeEventListener('fullscreenchange', syncFullscreenState);
  }, []);

  // Try fullscreen immediately on startup. Browsers that require a user gesture
  // will reject this attempt, so retry on the first remote/keyboard/mouse input.
  useEffect(() => {
    let enteredFullscreen = false;

    const enterFullscreen = async () => {
      if (enteredFullscreen || document.fullscreenElement) return;
      if (!document.documentElement.requestFullscreen) return;

      try {
        await document.documentElement.requestFullscreen();
        enteredFullscreen = true;
        setIsAppFullscreen(true);
        removeGestureListeners();
      } catch {
        // Expected on browsers that only allow fullscreen after user interaction.
      }
    };

    const removeGestureListeners = () => {
      window.removeEventListener('pointerdown', enterFullscreen);
      window.removeEventListener('keydown', enterFullscreen);
      window.removeEventListener('touchstart', enterFullscreen);
    };

    void enterFullscreen();
    window.addEventListener('pointerdown', enterFullscreen, { passive: true });
    window.addEventListener('keydown', enterFullscreen);
    window.addEventListener('touchstart', enterFullscreen, { passive: true });

    return removeGestureListeners;
  }, []);

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

  // Load Pluto TV by default on startup, without opening the playlist picker.
  // The normal playlist menu remains available for users to switch sources.
  useEffect(() => {
    let cancelled = false;
    const loadDefaultPluto = async () => {
      const plutoUrl = 'https://raw.githubusercontent.com/BuddyChewChew/app-m3u-generator/main/playlists/plutotv_us.m3u';
      const plutoId = 'default-pluto-tv-us';
      try {
        const response = await fetch('/api/parse-playlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: plutoUrl }),
        });
        if (!response.ok) throw new Error('Unable to load Pluto TV playlist');
        const data = await response.json();
        if (!Array.isArray(data.items) || data.items.length === 0) throw new Error('Pluto TV returned no channels');
        if (cancelled) return;

        const channels: Channel[] = data.items.map((item: any, idx: number) => ({
          id: `${plutoId}-ch-${idx}`,
          name: item.name || 'Pluto TV Channel',
          url: item.url,
          group: item.group?.title || 'Pluto TV',
          logo: item.tvg?.logo || undefined,
          tvgId: item.tvg?.id || undefined,
          tvgName: item.tvg?.name || undefined,
          isRadio: item.radio === 'true' || item.url?.endsWith('.mp3'),
          raw: item.raw,
        }));
        const plutoPlaylist: Playlist = {
          id: plutoId,
          title: 'Pluto TV US',
          url: plutoUrl,
          type: 'm3u-url',
          channelCount: channels.length,
          addedAt: Date.now(),
          lastUpdated: Date.now(),
          epgUrl: 'https://i.mjh.nz/PlutoTV/us.xml.gz',
          channels,
        };
        setPlaylists((prev) => {
          const updated = [plutoPlaylist, ...prev.filter((playlist) => playlist.id !== plutoId && playlist.url !== plutoUrl)];
          savePlaylists(updated);
          return updated;
        });
        setActivePlaylistIdState(plutoId);
        setActivePlaylistId(plutoId);
        const firstStream = getFirstStreamChannel(channels);
        if (firstStream) setSelectedChannel(firstStream);
        setCurrentView('epg');
        setIsSidebarCollapsed(true);
      } catch (error) {
        // Keep the built-in fallback stream playable if the Pluto playlist endpoint is unavailable.
        console.warn('Ma9icTV: Could not auto-load Pluto TV; keeping the fallback playlist.', error);
      }
    };
    void loadDefaultPluto();
    return () => { cancelled = true; };
  }, []);

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

  // Favorites toggle handler
  const handleToggleFavorite = useCallback((channelId: string) => {
    const updated = toggleFavorite(channelId);
    setFavorites(updated);
  }, []);

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
      const response = await fetch('/api/parse-playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: activePlaylist.url,
          userAgent: activePlaylist.userAgent,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to refresh playlist.');
      }

      const data = await response.json();
      if (!data.items || data.items.length === 0) {
        throw new Error('Remote playlist returned no channels.');
      }

      const channels: Channel[] = data.items.map((item: any, idx: number) => ({
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

      const refreshed: Playlist = {
        ...activePlaylist,
        channelCount: channels.length,
        lastUpdated: Date.now(),
        epgUrl: data.header?.urlTvg || activePlaylist.epgUrl || undefined,
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

  // Reset all data
  const handleResetAllData = useCallback(() => {
    localStorage.clear();
    setPlaylists(INITIAL_PRESETS);
    setActivePlaylistIdState(INITIAL_PRESETS[0].id);
    setFavorites([]);
    setRecentlyPlayed([]);
    const defaultSettings = getSettings();
    setSettings(defaultSettings);
    if (INITIAL_PRESETS[0].channels.length > 0) {
      setSelectedChannel(INITIAL_PRESETS[0].channels[0]);
    }
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

  // Theme application
  const themeClasses = useMemo(() => {
    if (settings.theme === 'oled') return 'bg-black text-slate-100';
    if (settings.theme === 'light') return 'bg-slate-100 text-slate-900';
    return 'bg-[#0b0f19] text-slate-100'; // Dark Slate (signature IPTVnator)
  }, [settings.theme]);

  return (
    <div className={`flex h-[100dvh] w-full overflow-hidden ${themeClasses} font-sans`}>
      {/* 1. Slim Left App Navigation Bar */}
      <aside className="fixed bottom-0 left-0 right-0 z-40 h-14 w-full flex-shrink-0 bg-slate-950/95 border-t border-slate-800/80 flex flex-row items-center justify-around px-2 py-1 select-none md:static md:h-auto md:w-16 md:flex-col md:justify-between md:border-t-0 md:border-r md:px-0 md:py-4">
        {/* Top: Logo & Main Navigation */}
        <div className="flex flex-row items-center gap-2 h-full md:h-auto md:flex-col md:gap-6 w-auto md:w-full">
          {/* IPTVnator Logo */}
          <div
            onClick={() => setCurrentView('player')}
            className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/25 cursor-pointer hover:scale-105 active:scale-95 transition-all"
            title="IPTVnator Home"
          >
            <Tv className="w-5 h-5 stroke-[2.2]" />
          </div>

          <div className="hidden md:block w-8 h-[1px] bg-slate-800"></div>

          {/* Nav Buttons */}
          <nav className="flex flex-row items-center gap-1 h-full md:h-auto md:flex-col md:gap-2 w-auto md:w-full px-0 md:px-2">
            {/* TV / Channels Mode */}
            <button
              onClick={() => setCurrentView('player')}
              className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all ${
                currentView === 'player'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
              title="Channels & Live Player"
            >
              <Tv className="w-5 h-5" />
            </button>

            {/* EPG / TV Guide */}
            <button
              onClick={() => setCurrentView('epg')}
              className={`w-11 h-11 rounded-xl flex items-center justify-center transition-all ${
                currentView === 'epg'
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
              }`}
              title="Electronic Program Guide (EPG)"
            >
              <Calendar className="w-5 h-5" />
            </button>

            {/* Playlists Catalog & Manager */}
            <button
              onClick={() => setIsPlaylistModalOpen(true)}
              className="w-11 h-11 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-slate-900 transition-all relative"
              title="Playlists & Channel Catalog (P)"
            >
              <Layers className="w-5 h-5" />
              <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-indigo-500"></span>
            </button>
          </nav>
        </div>

        {/* Bottom: Settings & Shortcuts */}
        <div className="flex flex-row items-center gap-1 w-auto md:flex-col md:gap-2 md:w-full px-0 md:px-2">
          {/* Shortcuts Info */}
          <button
            onClick={() => setIsShortcutsModalOpen(true)}
            className="w-11 h-11 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-slate-900 transition-all"
            title="Keyboard Shortcuts (?)"
          >
            <HelpCircle className="w-5 h-5" />
          </button>

          {/* Settings */}
          <button
            onClick={() => setIsSettingsModalOpen(true)}
            className="w-11 h-11 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-slate-900 transition-all"
            title="Settings (S)"
          >
            <SettingsIcon className="w-5 h-5" />
          </button>
        </div>
      </aside>

      {/* 2. Main Content Layout with Top Status Header */}
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden pb-14 md:pb-0">
        {/* Top Header Bar */}
        <header className="min-h-11 bg-slate-950/90 border-b border-slate-800/80 px-2 sm:px-4 py-1.5 flex flex-wrap gap-2 items-center justify-between text-xs select-none z-20">
          <div className="flex items-center gap-3 min-w-0">
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

            <div className="hidden sm:flex items-center bg-slate-900 rounded-lg border border-slate-800 p-0.5">
              <button
                onClick={() => setCurrentView('player')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors ${
                  currentView === 'player' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Tv className="w-3 h-3" />
                <span>Player</span>
              </button>
              <button
                onClick={() => setCurrentView('epg')}
                className={`px-2.5 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors ${
                  currentView === 'epg' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'
                }`}
              >
                <Calendar className="w-3 h-3" />
                <span>EPG Guide</span>
              </button>
            </div>
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
                channel={selectedChannel}
                settings={settings}
                onNextChannel={handleNextChannel}
                onPrevChannel={handlePrevChannel}
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
              onToggleFavorite={handleToggleFavorite}
              onNextChannel={handleNextChannel}
              onPrevChannel={handlePrevChannel}
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
