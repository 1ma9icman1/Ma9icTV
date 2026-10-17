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
import { INITIAL_PRESETS } from './data/presetPlaylists';

import { ChannelList } from './components/ChannelList';
import { VideoPlayer } from './components/VideoPlayer';
import { PlaylistModal } from './components/PlaylistModal';
import { EpgGuide } from './components/EpgGuide';
import { SettingsModal } from './components/SettingsModal';
import { ShortcutsModal } from './components/ShortcutsModal';

export default function App() {
  // Playlists and Channels state
  const [playlists, setPlaylists] = useState<Playlist[]>(() => getSavedPlaylists());
  const [activePlaylistIdState, setActivePlaylistIdState] = useState<string>(() => getActivePlaylistId());
  const [selectedChannel, setSelectedChannel] = useState<Channel | null>(null);

  // Favorites and History
  const [favorites, setFavorites] = useState<string[]>(() => getFavorites());
  const [recentlyPlayed, setRecentlyPlayed] = useState<Channel[]>(() => getRecentlyPlayed());

  // Settings
  const [settings, setSettings] = useState<AppSettings>(() => getSettings());

  // Navigation / Views
  const [currentView, setCurrentView] = useState<'player' | 'epg'>('player');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false);
  const [isRefreshingPlaylist, setIsRefreshingPlaylist] = useState<boolean>(false);

  // Modals
  const [isPlaylistModalOpen, setIsPlaylistModalOpen] = useState<boolean>(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState<boolean>(false);
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState<boolean>(false);

  // Current active playlist object
  const activePlaylist = useMemo(() => {
    return playlists.find((p) => p.id === activePlaylistIdState) || playlists[0] || INITIAL_PRESETS[0];
  }, [playlists, activePlaylistIdState]);

  // Set default selected channel on first load or when playlist changes
  useEffect(() => {
    if (activePlaylist && activePlaylist.channels.length > 0) {
      const existsInCurrent = selectedChannel && activePlaylist.channels.some((c) => c.id === selectedChannel.id);
      if (!existsInCurrent) {
        setSelectedChannel(activePlaylist.channels[0]);
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
  }, []);

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
    <div className={`flex h-screen w-screen overflow-hidden ${themeClasses} font-sans`}>
      {/* 1. Slim Left App Navigation Bar */}
      <aside className="w-16 flex-shrink-0 bg-slate-950/80 border-r border-slate-800/80 flex flex-col items-center justify-between py-4 select-none z-30">
        {/* Top: Logo & Main Navigation */}
        <div className="flex flex-col items-center gap-6 w-full">
          {/* IPTVnator Logo */}
          <div
            onClick={() => setCurrentView('player')}
            className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-purple-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/25 cursor-pointer hover:scale-105 active:scale-95 transition-all"
            title="IPTVnator Home"
          >
            <Tv className="w-5 h-5 stroke-[2.2]" />
          </div>

          <div className="w-8 h-[1px] bg-slate-800"></div>

          {/* Nav Buttons */}
          <nav className="flex flex-col items-center gap-2 w-full px-2">
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
        <div className="flex flex-col items-center gap-2 w-full px-2">
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
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header Bar */}
        <header className="h-11 bg-slate-950/90 border-b border-slate-800/80 px-4 flex items-center justify-between text-xs select-none z-20">
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
              onClick={() => setIsPlaylistModalOpen(true)}
              className="px-2.5 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white border border-indigo-500/30 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">Browse Catalog (40+ Playlists)</span>
              <span className="sm:hidden">Catalog</span>
            </button>

            <div className="flex items-center bg-slate-900 rounded-lg border border-slate-800 p-0.5">
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
        <main className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
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
              />
            </>
          ) : (
            /* EPG Guide View */
            <EpgGuide
              channels={activePlaylist.channels}
              selectedChannel={selectedChannel}
              onTuneChannel={(channel) => {
                handleSelectChannel(channel);
                setCurrentView('player');
              }}
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
