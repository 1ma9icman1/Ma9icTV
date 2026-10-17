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
}

// Generate rich, contextual 24h schedule for any channel based on category & name
function generateChannelSchedule(channel: Channel, baseDate: Date): EpgProgram[] {
  const schedule: EpgProgram[] = [];
  const startOfDay = new Date(baseDate);
  startOfDay.setHours(0, 0, 0, 0);

  const group = (channel.group || 'General').toLowerCase();
  const name = channel.name;
  const isNews = group.includes('news');
  const isSports = group.includes('sport');
  const isMovie = group.includes('movie') || group.includes('cinema');
  const isMusic = group.includes('music') || channel.isRadio;
  const isKids = group.includes('kid') || group.includes('anim');

  // 12 to 18 program blocks across 24 hours
  const templates = isNews
    ? [
        { title: `${name}: Morning News Brief`, durMin: 60, desc: 'Overnight headlines, markets report, world weather, and early commentary.' },
        { title: `${name}: World Today Live`, durMin: 90, desc: 'In-depth international news reporting, field correspondents, and interviews.' },
        { title: `${name}: Global Business Pulse`, durMin: 60, desc: 'Stock market updates, commodities, tech trends, and executive interviews.' },
        { title: `${name}: Live Midday Bulletin`, durMin: 60, desc: 'Breaking news from around the world as it happens, updated continuously.' },
        { title: `${name}: Focus World Investigation`, durMin: 90, desc: 'Special investigative reports on geopolitical affairs, climate, and society.' },
        { title: `${name}: The Afternoon Roundtable`, durMin: 60, desc: 'Analysis and debates on top international stories with global policy experts.' },
        { title: `${name}: Prime Time News Hour`, durMin: 60, desc: 'The flagship evening broadcast covering major stories of the day in depth.' },
        { title: `${name}: Panorama Documentary`, durMin: 90, desc: 'Compelling short documentary exploring cultural shifts, science, and nature.' },
        { title: `${name}: Late Night Roundup`, durMin: 60, desc: 'Recap of the biggest headlines from all continents before the day closes.' },
        { title: `${name}: Overnight Global Feed`, durMin: 180, desc: 'Automated 24/7 global wire reports and continuous live coverage.' },
      ]
    : isSports
    ? [
        { title: `${name}: Sports Morning Highlights`, durMin: 60, desc: 'All the goals, match points, and high-octane highlights from overnight.' },
        { title: `${name}: Championship Preview`, durMin: 90, desc: 'Tactical analysis, team lineups, and predictions for upcoming tournaments.' },
        { title: `${name}: Live Match Arena`, durMin: 120, desc: 'Exclusive live broadcast and commentary on today’s top sporting events.' },
        { title: `${name}: Extreme Sports & Action`, durMin: 60, desc: 'Freestyle stunts, adrenaline-fueled adventures, and athlete profiles.' },
        { title: `${name}: Post-Match Studio Debrief`, durMin: 60, desc: 'Manager press conferences, key replay breakdowns, and player interviews.' },
        { title: `${name}: Golden Classics & Archives`, durMin: 90, desc: 'Reliving legendary championship moments and historic rivalries.' },
        { title: `${name}: Late Night Sports Zone`, durMin: 120, desc: 'Global motorsport, boxing, basketball, and football news roundup.' },
      ]
    : isMovie
    ? [
        { title: 'Matinee Showcase: Cinema Spotlight', durMin: 105, desc: 'Classic and modern cinema feature film with full remastered audio.' },
        { title: 'Behind the Scenes: Film Masters', durMin: 45, desc: 'Directors, visual effects artists, and actors discussing their craft.' },
        { title: 'Feature Film: Hollywood Premiere', durMin: 120, desc: 'Acclaimed blockbuster drama full feature presentation in high definition.' },
        { title: 'Sci-Fi Universe: Galactic Odyssey', durMin: 110, desc: 'Epic space exploration and speculative fiction cinematic adventure.' },
        { title: 'Midnight Thriller: Edge of Suspense', durMin: 100, desc: 'Gripping psychological mystery and neo-noir crime thriller.' },
      ]
    : isMusic
    ? [
        { title: `${name}: Morning Acoustic & Lounge`, durMin: 90, desc: 'Mellow melodies and uplifting rhythms to kickstart your morning.' },
        { title: `${name}: Top 40 Global Hits`, durMin: 120, desc: 'The hottest tracks trending across international streaming charts.' },
        { title: `${name}: Live Concert Session`, durMin: 90, desc: 'High-energy live festival performance and acoustic studio showcase.' },
        { title: `${name}: Club Beats & Electronic Mix`, durMin: 120, desc: 'Non-stop DJ sets, synthesized grooves, and deep house vibes.' },
      ]
    : [
        { title: `${name}: Sunrise Daily Magazine`, durMin: 90, desc: 'Lifestyle, cooking, technology, and morning entertainment features.' },
        { title: `${name}: Discovery & Wildlife Explorer`, durMin: 60, desc: 'Journeying across diverse ecosystems and discovering planet Earth.' },
        { title: `${name}: Prime Time Entertainment Show`, durMin: 90, desc: 'Popular television entertainment, guest talks, and comedy.' },
        { title: `${name}: Evening Special Feature`, durMin: 120, desc: 'Spotlight on inspiring personalities, culinary journeys, and culture.' },
        { title: `${name}: Night Owl Cinema`, durMin: 100, desc: 'Late night movies, music retrospectives, and relaxation programming.' },
      ];

  const nowMs = Date.now();
  let currentStart = startOfDay.getTime();

  // Loop through templates to fill 24+ hours
  let idx = 0;
  while (currentStart < startOfDay.getTime() + 26 * 60 * 60 * 1000) {
    const tmpl = templates[idx % templates.length];
    const durMs = tmpl.durMin * 60 * 1000;
    const endMs = currentStart + durMs;
    const isLive = nowMs >= currentStart && nowMs < endMs;
    const prog = isLive ? Math.min(100, Math.max(0, ((nowMs - currentStart) / durMs) * 100)) : 0;

    schedule.push({
      id: `prog-${channel.id}-${currentStart}`,
      channelId: channel.tvgId || channel.name,
      title: tmpl.title,
      desc: tmpl.desc,
      category: channel.group || 'General',
      start: new Date(currentStart).toISOString(),
      stop: new Date(endMs).toISOString(),
      startTime: new Date(currentStart),
      stopTime: new Date(endMs),
      isLive,
      progress: Math.round(prog),
    });

    currentStart = endMs;
    idx++;
  }

  return schedule;
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
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedProgram, setSelectedProgram] = useState<EpgProgram | null>(null);
  const [epgUrlInput, setEpgUrlInput] = useState('');
  const [isLoadingEpg, setIsLoadingEpg] = useState(false);
  const [xmltvProgrammes, setXmltvProgrammes] = useState<EpgProgram[]>([]);

  const gridScrollRef = useRef<HTMLDivElement | null>(null);
  const [currentTimeMs, setCurrentTimeMs] = useState(Date.now());

  // Update clock every 30 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTimeMs(Date.now());
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  // The guide follows today's schedule; date shortcuts were removed for a cleaner mobile layout.
  const targetDate = useMemo(() => new Date(), []);

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

  // Generate or retrieve schedules for displayed channels
  const channelSchedules = useMemo(() => {
    const map = new Map<string, EpgProgram[]>();
    filteredChannels.forEach((ch) => {
      // Check if real XMLTV programmes match this channel
      const realMatches = xmltvProgrammes.filter(
        (p) =>
          p.channelId === ch.tvgId ||
          p.channelId === ch.name ||
          p.channelId?.toLowerCase() === ch.name.toLowerCase()
      );

      if (realMatches.length > 0) {
        map.set(ch.id, realMatches);
      } else {
        map.set(ch.id, generateChannelSchedule(ch, targetDate));
      }
    });
    return map;
  }, [filteredChannels, xmltvProgrammes, targetDate]);

  // Active channel programs
  const activeChannelPrograms = useMemo(() => {
    if (!selectedChannel) return [];
    return channelSchedules.get(selectedChannel.id) || generateChannelSchedule(selectedChannel, new Date());
  }, [selectedChannel, channelSchedules]);

  // Active current and next program
  const currentProgram = useMemo(() => {
    const now = currentTimeMs;
    return (
      activeChannelPrograms.find((p) => now >= p.startTime.getTime() && now < p.stopTime.getTime()) ||
      activeChannelPrograms[0] ||
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
  const handleLoadXmltv = async () => {
    if (!epgUrlInput.trim()) return;
    setIsLoadingEpg(true);
    try {
      const res = await fetch('/api/parse-epg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: epgUrlInput.trim() }),
      });
      if (!res.ok) throw new Error('Failed to load XMLTV file');
      const data = await res.json();
      if (data.programmes && Array.isArray(data.programmes)) {
        const parsed: EpgProgram[] = data.programmes.map((p: any, idx: number) => {
          let startMs = Date.parse(p.start);
          let stopMs = Date.parse(p.stop);
          const now = Date.now();
          if (isNaN(startMs)) startMs = now - 15 * 60000;
          if (isNaN(stopMs)) stopMs = now + 45 * 60000;
          const isLive = now >= startMs && now < stopMs;
          const progress = isLive ? Math.round(((now - startMs) / (stopMs - startMs)) * 100) : 0;
          return {
            id: `xmltv-${idx}`,
            channelId: p.channel,
            title: p.title || 'Broadcast Program',
            desc: p.desc || 'Live TV Schedule',
            category: p.category || 'General',
            start: p.start,
            stop: p.stop,
            startTime: new Date(startMs),
            stopTime: new Date(stopMs),
            isLive,
            progress,
          };
        });
        setXmltvProgrammes(parsed);
      }
    } catch (err: any) {
      console.error(err);
      alert('Could not parse XMLTV file from the provided URL.');
    } finally {
      setIsLoadingEpg(false);
    }
  };

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
                    NOW PLAYING
                  </span>
                  {currentProgram && (
                    <span className="text-xs text-slate-300 font-medium">
                      {currentProgram.startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} -{' '}
                      {currentProgram.stopTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>

                <h3 className="text-sm sm:text-base font-bold text-slate-100 truncate">
                  {currentProgram?.title || `${selectedChannel.name} Live Broadcast`}
                </h3>

                {/* Progress bar */}
                <div className="w-full bg-slate-950 h-1.5 rounded-full mt-2 overflow-hidden border border-slate-800/80">
                  <div
                    className="bg-gradient-to-r from-indigo-500 to-purple-500 h-full rounded-full transition-all duration-500"
                    style={{ width: `${currentProgram?.progress || 40}%` }}
                  ></div>
                </div>

                {/* Description */}
                <p className="text-xs text-slate-400 line-clamp-2 mt-2 leading-relaxed">
                  {currentProgram?.desc ||
                    'Continuous live broadcast coverage, breaking headlines, special features, and international commentary.'}
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

        {/* Right: Switch Playlist & XMLTV Sync */}
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
