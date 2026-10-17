import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Calendar,
  Clock,
  Search,
  Upload,
  Link as LinkIcon,
  Play,
  RefreshCw,
  Info,
  Tv,
  Heart,
  ChevronLeft,
  ChevronRight,
  Maximize2,
  FolderOpen,
  Sliders,
  Check,
  Radio,
  Zap,
} from 'lucide-react';
import { Channel, EpgProgram, AppSettings } from '../types';
import { VideoPlayer } from './VideoPlayer';

function normalizeEpgName(value: string): string {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

// XMLTV timestamps commonly look like YYYYMMDDHHmmss +0000 or YYYYMMDDHHmmss.
function parseXmltvDate(value: string): Date {
  const raw = String(value || '').trim();
  const match = raw.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(?:\s*([+-]\d{4}))?$/);
  if (!match) return new Date(raw);
  const [, year, month, day, hour, minute, second, zone] = match;
  const iso = `${year}-${month}-${day}T${hour}:${minute}:${second}${zone ? `${zone.slice(0, 3)}:${zone.slice(3)}` : 'Z'}`;
  return new Date(iso);
}

interface EpgGuideProps {
  channels: Channel[];
  selectedChannel: Channel | null;
  onSelectChannel: (channel: Channel) => void;
  settings: AppSettings;
  favorites: string[];
  onToggleFavorite: (channelId: string) => void;
  onNextChannel: () => void;
  onPrevChannel: () => void;
  onOpenPlaylistModal: () => void;
  onExpandPlayer?: () => void;
  activePlaylistTitle: string;
  activePlaylistEpgUrl?: string;
}

export const EpgGuide: React.FC<EpgGuideProps> = ({
  channels,
  selectedChannel,
  onSelectChannel,
  settings,
  favorites,
  onToggleFavorite,
  onNextChannel,
  onPrevChannel,
  onOpenPlaylistModal,
  onExpandPlayer,
  activePlaylistTitle,
  activePlaylistEpgUrl,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedProgram, setSelectedProgram] = useState<EpgProgram | null>(null);
  const [epgUrlInput, setEpgUrlInput] = useState(() => localStorage.getItem('ma9ictv-epg-url') || '');
  const [isLoadingEpg, setIsLoadingEpg] = useState(false);
  const [xmltvProgrammes, setXmltvProgrammes] = useState<EpgProgram[]>([]);
  const [xmltvChannelAliases, setXmltvChannelAliases] = useState<Record<string, string[]>>({});

  const gridScrollRef = useRef<HTMLDivElement | null>(null);
  const [currentTimeMs, setCurrentTimeMs] = useState(Date.now());

  // Update clock every 30 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTimeMs(Date.now());
    }, 30000);
    return () => clearInterval(timer);
  }, []);


  // Extract all channel groups for categories
  const categories = useMemo(() => {
    const set = new Set<string>();
    channels.forEach((c) => {
      if (c.group && c.group.trim()) set.add(c.group.trim());
    });
    return ['All', ...Array.from(set).slice(0, 15)];
  }, [channels]);

  // Filter channels by category and search
  const filteredChannels = useMemo(() => {
    return channels.filter((c) => {
      const matchCat = selectedCategory === 'All' || c.group?.toLowerCase() === selectedCategory.toLowerCase();
      if (!matchCat) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        c.name.toLowerCase().includes(q) ||
        c.group?.toLowerCase().includes(q) ||
        c.tvgName?.toLowerCase().includes(q)
      );
    });
  }, [channels, selectedCategory, searchQuery]);

  // Use actual XMLTV listings only. Never invent generic programme or episode titles.
  const channelSchedules = useMemo(() => {
    const map = new Map<string, EpgProgram[]>();
    filteredChannels.forEach((ch) => {
      const ids = [ch.tvgId, ch.tvgName, ch.name].filter(Boolean).map((v) => normalizeEpgName(String(v)));
      const matches = xmltvProgrammes.filter((p) => {
        const channelId = (p.channelId || '').trim().toLowerCase();
        const aliases = xmltvChannelAliases[channelId] || [];
        return ids.includes(normalizeEpgName(channelId)) || aliases.some((alias) => ids.includes(normalizeEpgName(alias)));
      });
      map.set(ch.id, matches);
    });
    return map;
  }, [filteredChannels, xmltvProgrammes, xmltvChannelAliases]);

  // Active channel programs
  const activeChannelPrograms = useMemo(() => {
    if (!selectedChannel) return [];
    return channelSchedules.get(selectedChannel.id) || [];
  }, [selectedChannel, channelSchedules]);

  // Active current and next program
  const currentProgram = useMemo(() => {
    const now = currentTimeMs;
    return (
      activeChannelPrograms.find((p) => now >= p.startTime.getTime() && now < p.stopTime.getTime()) ||
      null
    );
  }, [activeChannelPrograms, currentTimeMs]);

  const nextProgram = useMemo(() => {
    if (!currentProgram) return null;
    const curEnd = currentProgram.stopTime.getTime();
    return activeChannelPrograms.find((p) => p.startTime.getTime() >= curEnd) || null;
  }, [activeChannelPrograms, currentProgram]);

  // Time ruler slots (30-minute intervals from 4 hours ago to 20 hours ahead)
  const timeSlots = useMemo(() => {
    const slots: Date[] = [];
    const base = new Date(currentTimeMs);
    base.setMinutes(base.getMinutes() < 30 ? 0 : 30, 0, 0);
    // start 2 hours before now
    const startMs = base.getTime() - 2 * 60 * 60 * 1000;
    // 16 slots (8 hours window)
    for (let i = 0; i < 20; i++) {
      slots.push(new Date(startMs + i * 30 * 60 * 1000));
    }
    return slots;
  }, [currentTimeMs]);

  const timelineStartMs = timeSlots[0]?.getTime() || currentTimeMs - 2 * 3600000;
  const timelineTotalMs = (timeSlots.length - 1) * 30 * 60000;
  const minuteWidthPx = 4; // 4px per minute (120px per 30m slot)

  // Scroll timeline to "Now"
  const scrollToNow = () => {
    if (!gridScrollRef.current) return;
    const nowOffsetMin = (currentTimeMs - timelineStartMs) / 60000;
    const targetScroll = Math.max(0, nowOffsetMin * minuteWidthPx - 200);
    gridScrollRef.current.scrollTo({ left: targetScroll, behavior: 'smooth' });
  };

  useEffect(() => {
    // Scroll to now on initial mount
    const timer = setTimeout(scrollToNow, 400);
    return () => clearTimeout(timer);
  }, []);

  // Handle loading XMLTV URL
  const handleLoadXmltv = async (showAlert = true, urlOverride?: string) => {
    const sourceUrl = (urlOverride ?? epgUrlInput).trim();
    if (!sourceUrl) return;
    setIsLoadingEpg(true);
    try {
      const res = await fetch('/api/parse-epg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: sourceUrl }),
      });
      if (!res.ok) throw new Error('Failed to load XMLTV file');
      const data = await res.json();
      if (data.programmes && Array.isArray(data.programmes)) {
        const now = Date.now();
        const parsed: EpgProgram[] = data.programmes.flatMap((p: any, idx: number) => {
          const startMs = parseXmltvDate(p.start).getTime();
          const stopMs = parseXmltvDate(p.stop).getTime();
          // Discard malformed records rather than inventing times or generic titles.
          if (!p.channel || !p.title?.trim() || !Number.isFinite(startMs) || !Number.isFinite(stopMs) || stopMs <= startMs) return [];
          const isLive = now >= startMs && now < stopMs;
          const progress = isLive ? Math.max(0, Math.min(100, Math.round(((now - startMs) / (stopMs - startMs)) * 100))) : 0;
          return [{
            id: `xmltv-${idx}`,
            channelId: String(p.channel).trim(),
            title: String(p.title).trim(),
            desc: p.desc || '',
            category: p.category || '',
            start: new Date(startMs).toISOString(),
            stop: new Date(stopMs).toISOString(),
            startTime: new Date(startMs),
            stopTime: new Date(stopMs),
            isLive,
            progress,
          }];
        });
        const aliases: Record<string, string[]> = {};
        (Array.isArray(data.channels) ? data.channels : []).forEach((channel: any) => {
          const id = String(channel.id || '').trim().toLowerCase();
          if (!id) return;
          const names = Array.isArray(channel.names) ? channel.names : [channel.name].filter(Boolean);
          aliases[id] = names.map((name: unknown) => String(name).trim()).filter(Boolean);
        });
        setXmltvChannelAliases(aliases);
        setXmltvProgrammes(parsed);
        localStorage.setItem('ma9ictv-epg-url', sourceUrl);
        if (showAlert) localStorage.setItem('ma9ictv-manual-epg-url', sourceUrl);
        if (parsed.length === 0) throw new Error('The XMLTV file contained no valid programme titles and times.');
      } else {
        throw new Error('The server returned no XMLTV programmes.');
      }
    } catch (err: any) {
      console.error('Could not load XMLTV guide:', err);
      if (showAlert) alert('Could not load the XMLTV guide. Check the URL and server logs.');
    } finally {
      setIsLoadingEpg(false);
    }
  };

  // Prefer the active playlist's own guide feed. If it has none, fall back to
  // the user's manually configured XMLTV URL instead of leaking another playlist's guide.
  useEffect(() => {
    const playlistUrl = activePlaylistEpgUrl?.trim();
    const manualUrl = localStorage.getItem('ma9ictv-manual-epg-url')?.trim() || '';
    const sourceUrl = playlistUrl || manualUrl;

    setXmltvProgrammes([]);
    setXmltvChannelAliases({});
    setEpgUrlInput(sourceUrl);
    if (sourceUrl) {
      localStorage.setItem('ma9ictv-epg-url', sourceUrl);
      void handleLoadXmltv(false, sourceUrl);
    } else {
      localStorage.removeItem('ma9ictv-epg-url');
    }
    // The URL is the dependency; loading is deliberately initiated for each source change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePlaylistEpgUrl]);

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0a0e17] text-slate-100 overflow-hidden select-none">
      {/* =========================================================================
          STAGE 1: TOP HERO SECTION (LIVE VIDEO PLAYER + PROGRAM INFO PANE)
          ========================================================================= */}
      <section className="h-[170px] sm:h-[310px] md:h-[340px] flex-shrink-0 bg-gradient-to-b from-slate-950 via-[#0e1424] to-[#0a0e17] border-b border-slate-800/80 p-2 sm:p-4 flex flex-col md:flex-row gap-2 sm:gap-4 items-stretch z-20 shadow-lg">
        {/* Left: Live Video Player Preview Stage */}
        <div className="w-full md:w-[46%] lg:w-[42%] h-full min-h-0 md:h-full flex-shrink-0 relative">
          <VideoPlayer
            channel={selectedChannel}
            settings={settings}
            onNextChannel={onNextChannel}
            onPrevChannel={onPrevChannel}
            isFavorite={selectedChannel ? favorites.includes(selectedChannel.id) : false}
            onToggleFavorite={() => selectedChannel && onToggleFavorite(selectedChannel.id)}
            mode="epg-preview"
            onExpandPlayer={onExpandPlayer}
          />
        </div>

        {/* Right: Rich Channel & Current Program Synopsis */}
        <div className="hidden md:flex flex-1 min-w-0 flex-col justify-between overflow-hidden bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 shadow-xl backdrop-blur-md">
          {selectedChannel ? (
            <>
              {/* Top Row: Channel Badge & Live Tags */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-12 h-12 rounded-xl bg-slate-950 border border-slate-800 p-1.5 flex items-center justify-center overflow-hidden flex-shrink-0 shadow-md">
                    {selectedChannel.logo ? (
                      <img
                        src={selectedChannel.logo}
                        alt=""
                        className="w-full h-full object-contain"
                        onError={(e) => {
                          (e.target as HTMLElement).style.display = 'none';
                        }}
                      />
                    ) : (
                      <Tv className="w-6 h-6 text-indigo-400" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="text-base sm:text-lg font-bold text-white truncate tracking-tight">
                        {selectedChannel.name}
                      </h2>
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 uppercase tracking-wider">
                        {selectedChannel.group || 'Live'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 font-mono truncate max-w-sm">
                      {selectedChannel.tvgId || activePlaylistTitle}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => onToggleFavorite(selectedChannel.id)}
                    className={`p-2 rounded-xl border transition-all ${
                      favorites.includes(selectedChannel.id)
                        ? 'bg-rose-500/20 text-rose-400 border-rose-500/40 shadow-sm'
                        : 'bg-slate-950/80 text-slate-400 hover:text-white border-slate-800'
                    }`}
                    title={favorites.includes(selectedChannel.id) ? 'Remove Favorite' : 'Add Favorite'}
                  >
                    <Heart className={`w-4 h-4 ${favorites.includes(selectedChannel.id) ? 'fill-current' : ''}`} />
                  </button>
                  {onExpandPlayer && (
                    <button
                      onClick={onExpandPlayer}
                      className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-md transition-all active:scale-95"
                      title="Switch to Full Player Mode"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Full Player</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Middle: Current Show Title & Progress */}
              <div className="my-2 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-extrabold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    {currentProgram ? 'NOW PLAYING' : 'NO CURRENT LISTING'}
                  </span>
                  {currentProgram && (
                    <span className="text-xs text-slate-300 font-medium">
                      {currentProgram.startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} -{' '}
                      {currentProgram.stopTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>

                <h3 className="text-sm sm:text-base font-bold text-slate-100 truncate">
                  {currentProgram?.title || 'No programme information available'}
                </h3>

                {/* Progress bar */}
                <div className="w-full bg-slate-950 h-1.5 rounded-full mt-2 overflow-hidden border border-slate-800/80">
                  <div
                    className="bg-gradient-to-r from-indigo-500 to-purple-500 h-full rounded-full transition-all duration-500"
                    style={{ width: `${currentProgram?.progress || 0}%` }}
                  ></div>
                </div>

                {/* Description */}
                <p className="text-xs text-slate-400 line-clamp-2 mt-2 leading-relaxed">
                  {currentProgram?.desc ||
                    'Load a real XMLTV guide to see the actual episode, movie, and programme titles for this channel.'}
                </p>
              </div>

              {/* Bottom: Next Up preview */}
              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                <div className="flex items-center gap-2 truncate">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">UP NEXT:</span>
                  <span className="text-slate-300 font-medium truncate">
                    {nextProgram
                      ? `${nextProgram.startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} — ${nextProgram.title}`
                      : 'Upcoming TV Feature & Schedule'}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-[11px] text-indigo-400 flex-shrink-0">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{new Date(currentTimeMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
              <Tv className="w-8 h-8 mb-2 stroke-[1.5]" />
              <p className="text-xs">Select any channel below to start watching</p>
            </div>
          )}
        </div>
      </section>

      {/* =========================================================================
          STAGE 2: FILTER & CONTROLS TOOLBAR
          ========================================================================= */}
      <div className="bg-slate-950 border-b border-slate-800/80 px-2 sm:px-4 py-2 flex flex-wrap items-center justify-between gap-2 sm:gap-3 z-10">
        <div className="flex items-center">
          <button
            onClick={scrollToNow}
            className="min-h-10 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-indigo-300 border border-slate-800 text-sm font-semibold flex items-center justify-center gap-2 transition-colors shadow-sm touch-manipulation"
          >
            <Clock className="w-4 h-4 text-indigo-400" />
            <span>Jump to Now</span>
          </button>
        </div>

        {/* Center: Search */}
        <div className="relative w-full sm:w-64 flex-1 sm:flex-none min-w-[140px]">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search channels & shows..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-8 pr-3 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        {/* XMLTV source: real episode and movie titles come from this guide URL. */}
        <form
          onSubmit={(e) => { e.preventDefault(); void handleLoadXmltv(); }}
          className="flex w-full sm:w-auto min-w-0 flex-1 sm:flex-none items-center gap-2"
        >
          <input
            type="url"
            value={epgUrlInput}
            onChange={(e) => setEpgUrlInput(e.target.value)}
            placeholder="XMLTV EPG URL (.xml / .xml.gz)"
            aria-label="XMLTV EPG URL"
            className="min-w-0 flex-1 sm:w-64 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
          <button
            type="submit"
            disabled={isLoadingEpg || !epgUrlInput.trim()}
            className="min-h-10 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-semibold whitespace-nowrap"
          >
            {isLoadingEpg ? 'Loading…' : 'Load EPG'}
          </button>
        </form>

        {/* Right: Switch Playlist */}
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenPlaylistModal}
            className="px-3 py-1 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 text-xs font-medium flex items-center gap-1.5 transition-colors"
          >
            <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
            <span>Choose Playlist</span>
          </button>
        </div>
      </div>

      {/* Category Pills Bar */}
      <div className="bg-slate-950/60 border-b border-slate-800/60 px-4 py-1.5 overflow-x-auto flex items-center gap-1.5 no-scrollbar">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-3 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all ${
              selectedCategory === cat
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* =========================================================================
          STAGE 3: THE EPG MULTI-CHANNEL HORIZONTAL GRID
          ========================================================================= */}
      <div className="flex-1 overflow-hidden flex flex-col relative bg-[#070b12]">
        {/* Scrollable Container */}
        <div ref={gridScrollRef} className="flex-1 overflow-auto relative">
          <div
            className="min-w-max flex flex-col"
            style={{ width: `${(typeof window !== "undefined" && window.innerWidth < 640 ? 150 : 260) + (timeSlots.length - 1) * 30 * minuteWidthPx}px` }}
          >
            {/* 1. Sticky Time Ruler Header */}
            <div className="sticky top-0 z-30 flex bg-slate-950/95 backdrop-blur-md border-b border-slate-800 shadow-md">
              {/* Corner Channel Header */}
              <div className="w-[150px] sm:w-[260px] flex-shrink-0 px-2 sm:px-4 py-2 border-r border-slate-800 bg-slate-950 text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between gap-1">
                <span>Channels ({filteredChannels.length})</span>
                <span className="text-[10px] text-indigo-400 font-mono">LIVE TV</span>
              </div>

              {/* Time Interval Slots */}
              <div className="flex relative">
                {timeSlots.map((slot, index) => {
                  const timeLabel = slot.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                  return (
                    <div
                      key={index}
                      className="flex-shrink-0 border-r border-slate-800/80 px-2 py-2 text-xs font-mono font-semibold text-slate-400 flex items-center"
                      style={{ width: `${30 * minuteWidthPx}px` }}
                    >
                      <span>{timeLabel}</span>
                    </div>
                  );
                })}

                {/* Glowing Vertical Needle for Current Time */}
                {currentTimeMs >= timelineStartMs && (
                  <div
                    className="absolute top-0 bottom-0 z-40 pointer-events-none flex flex-col items-center"
                    style={{
                      left: `${((currentTimeMs - timelineStartMs) / 60000) * minuteWidthPx}px`,
                    }}
                  >
                    <div className="w-2.5 h-2.5 rounded-full bg-rose-500 shadow-md shadow-rose-500/50 -mt-1"></div>
                    <div className="w-[2px] h-[5000px] bg-gradient-to-b from-rose-500 via-rose-500/80 to-transparent shadow-sm"></div>
                  </div>
                )}
              </div>
            </div>

            {/* 2. Channel Rows with Horizontal Program Blocks */}
            {xmltvProgrammes.length === 0 && (
              <div className="sticky left-0 p-4 text-sm text-amber-200 bg-slate-950 border-b border-slate-800">
                No real programme guide loaded. Enter your provider's XMLTV EPG URL above and select Load EPG. Generic episode titles are intentionally disabled.
              </div>
            )}
            {xmltvProgrammes.length > 0 && filteredChannels.every((ch) => !(channelSchedules.get(ch.id)?.length)) && (
              <div className="sticky left-0 p-4 text-sm text-amber-200 bg-slate-950 border-b border-slate-800">
                EPG data loaded, but none of these channels matched. Check the playlist's tvg-id values and the XMLTV channel IDs.
              </div>
            )}
            <div className="flex flex-col divide-y divide-slate-800/50">
              {filteredChannels.map((channel, cIdx) => {
                const isSelected = selectedChannel?.id === channel.id;
                const programs = channelSchedules.get(channel.id) || [];

                return (
                  <div
                    key={channel.id}
                    className={`flex items-stretch transition-colors ${
                      isSelected
                        ? 'bg-indigo-950/25 ring-1 ring-inset ring-indigo-500/40'
                        : 'hover:bg-slate-900/40'
                    }`}
                  >
                    {/* Sticky Left Channel Card */}
                    <div
                      onClick={() => onSelectChannel(channel)}
                      className={`sticky left-0 z-20 w-[150px] sm:w-[260px] flex-shrink-0 px-2 sm:px-3 py-2.5 border-r border-slate-800 flex items-center justify-between gap-1 sm:gap-3 cursor-pointer select-none transition-colors ${
                        isSelected ? 'bg-indigo-950/80 text-white' : 'bg-slate-950/90 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        {/* Channel Number / Index */}
                        <span className="hidden sm:block text-[11px] font-mono font-bold text-slate-500 w-5 text-right flex-shrink-0">
                          {cIdx + 1}
                        </span>

                        {/* Logo */}
                        <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-slate-900 border border-slate-800 p-0.5 flex items-center justify-center overflow-hidden flex-shrink-0">
                          {channel.logo ? (
                            <img
                              src={channel.logo}
                              alt=""
                              className="w-full h-full object-contain"
                              onError={(e) => {
                                (e.target as HTMLElement).style.display = 'none';
                              }}
                            />
                          ) : (
                            <Tv className="w-4 h-4 text-slate-500" />
                          )}
                        </div>

                        {/* Name and Group */}
                        <div className="min-w-0">
                          <h4 className="text-xs font-semibold truncate leading-tight">{channel.name}</h4>
                          <span className="text-[10px] text-slate-500 truncate block">
                            {channel.group || 'General'}
                          </span>
                        </div>
                      </div>

                      {/* Play Button Indicator */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectChannel(channel);
                        }}
                        className={`p-2 sm:p-1.5 rounded-lg transition-colors flex-shrink-0 ${
                          isSelected
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'text-slate-500 hover:text-white hover:bg-slate-800'
                        }`}
                        title="Tune Channel"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                      </button>
                    </div>

                    {/* Timeline Program Blocks */}
                    <div className="flex items-center relative py-1.5">
                      {programs.map((prog) => {
                        const startMin = (prog.startTime.getTime() - timelineStartMs) / 60000;
                        const durationMin = (prog.stopTime.getTime() - prog.startTime.getTime()) / 60000;
                        const widthPx = Math.max(60, durationMin * minuteWidthPx);

                        // If program is before or after timeline window, skip or clamp
                        if (startMin + durationMin < 0 || startMin > (timeSlots.length - 1) * 30) {
                          return null;
                        }

                        const isNowPlayingThis =
                          currentTimeMs >= prog.startTime.getTime() && currentTimeMs < prog.stopTime.getTime();

                        return (
                          <div
                            key={prog.id}
                            onClick={() => {
                              onSelectChannel(channel);
                              setSelectedProgram(prog);
                            }}
                            className={`h-12 rounded-xl p-2 mr-1.5 flex flex-col justify-between overflow-hidden cursor-pointer transition-all border ${
                              isNowPlayingThis && isSelected
                                ? 'bg-indigo-600 text-white border-indigo-400 shadow-md shadow-indigo-600/30'
                                : isNowPlayingThis
                                ? 'bg-indigo-950/70 border-indigo-500/60 text-slate-100 hover:border-indigo-400'
                                : isSelected
                                ? 'bg-slate-900 border-indigo-900/60 text-slate-300 hover:bg-slate-800 hover:text-white'
                                : 'bg-slate-900/60 border-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white hover:border-slate-700'
                            }`}
                            style={{ width: `${widthPx - 6}px` }}
                          >
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-[10px] font-mono opacity-80 truncate">
                                {prog.startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                              {isNowPlayingThis && (
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0"></span>
                              )}
                            </div>
                            <h5 className="text-xs font-semibold truncate leading-tight">{prog.title}</h5>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Program Details Modal */}
      {selectedProgram && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 uppercase">
                  {selectedProgram.category || 'Program Details'}
                </span>
                <h3 className="text-lg font-bold text-white mt-1.5 leading-snug">{selectedProgram.title}</h3>
              </div>
              <button
                onClick={() => setSelectedProgram(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                ✕
              </button>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-300 font-mono bg-slate-950 p-2.5 rounded-xl border border-slate-800">
              <Clock className="w-4 h-4 text-indigo-400 flex-shrink-0" />
              <span>
                {selectedProgram.startTime.toLocaleString()} — {selectedProgram.stopTime.toLocaleTimeString()}
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 leading-relaxed">
              {selectedProgram.desc}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setSelectedProgram(null)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
