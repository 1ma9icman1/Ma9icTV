import React, { useState, useMemo, useRef, useEffect } from 'react';
import {
  Calendar,
  Clock,
  Upload,
  Download,
  FileUp,
  Star,
  Plus,
  Minus,
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
import { apiUrl, isStaticClient, networkUrl } from '../utils/api';
import { VideoPlayer } from './VideoPlayer';
import { getEpgExcludedChannels, saveEpgExcludedChannels } from '../utils/storage';

const EpgProgramTitle: React.FC<{ title: string }> = ({ title }) => {
  const titleRef = useRef<HTMLSpanElement | null>(null);
  const windowRef = useRef<HTMLDivElement | null>(null);
  const [overflows, setOverflows] = useState(false);
  const [scrollDistance, setScrollDistance] = useState(0);
  useEffect(() => {
    const measure = () => {
      const titleNode = titleRef.current;
      const windowNode = windowRef.current;
      if (!titleNode || !windowNode) return;
      const distance = Math.max(0, titleNode.scrollWidth - windowNode.clientWidth);
      setScrollDistance(distance);
      setOverflows(distance > 2);
    };
    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (windowRef.current) observer?.observe(windowRef.current);
    if (titleRef.current) observer?.observe(titleRef.current);
    return () => observer?.disconnect();
  }, [title]);
  return (
    <div ref={windowRef} className="epg-title-window flex h-[18px] min-w-0 items-center" title={title}>
      <span ref={titleRef} className={overflows ? 'epg-title-marquee' : 'truncate'}
        style={overflows ? ({ '--epg-title-distance': '-' + scrollDistance + 'px' } as React.CSSProperties) : undefined}>
        {title}
      </span>
    </div>
  );
};
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


async function parseXmltvOffMainThread(xml: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../workers/xmltvParser.worker.ts', import.meta.url), { type: 'module' });
    const cleanup = () => worker.terminate();
    worker.onmessage = (event: MessageEvent<{ tv?: any; error?: string }>) => {
      cleanup();
      if (event.data.error) reject(new Error(event.data.error));
      else resolve(event.data.tv);
    };
    worker.onerror = () => {
      cleanup();
      reject(new Error('The background XMLTV parser failed.'));
    };
    worker.postMessage({ id: 1, xml });
  });
}

// Read public XMLTV guides in a browser when deployed as a static GitHub Pages
// site. Sources that block CORS still require running the local/server app.
function readXmltvText(value: any): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (Array.isArray(value)) return value.map(readXmltvText).filter(Boolean).join(' ');
  if (value && typeof value === 'object' && typeof value['#text'] === 'string') return value['#text'];
  return '';
}

function asXmltvArray(value: any): any[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

async function parseXmltvInBrowser(sourceValue: string) {
  const urls = Array.from(new Set(
    sourceValue.split(/,\s*(?=https?:\/\/)/i).map((url) => url.trim()).filter(Boolean)
  )).slice(0, 32);
  if (urls.length === 0) throw new Error('No valid XMLTV URLs were provided.');

  const channelsById = new Map<string, any>();
  const programmesByKey = new Map<string, any>();
  const failedSources: string[] = [];
  let loadedSourceCount = 0;

  const nowMs = Date.now();
  const windowStartMs = nowMs - 3 * 60 * 60 * 1000;
  const windowEndMs = nowMs + 9 * 60 * 60 * 1000;

  const parseSource = async (url: string, sourceIndex: number) => {
    try {
      const response = await fetch(networkUrl(url), {
        cache: 'no-store',
        signal: AbortSignal.timeout(20000),
        headers: { Accept: 'application/xml,text/xml,*/*' },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const buffer = await response.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      let rawXml: string;
      if (bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
        if (typeof DecompressionStream === 'undefined') {
          throw new Error('This browser cannot decompress the gzipped XMLTV guide.');
        }
        const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('gzip'));
        rawXml = await new Response(stream).text();
      } else {
        rawXml = new TextDecoder('utf-8').decode(buffer);
      }

      // XML parsing is CPU-heavy for large XMLTV feeds; keep it off the UI thread.
      const tvData = await parseXmltvOffMainThread(rawXml);
      if (!tvData) throw new Error('The response is not valid XMLTV data.');

      const sourceChannels = asXmltvArray(tvData.channel);
      const sourceProgrammes = asXmltvArray(tvData.programme);

      for (const channel of sourceChannels) {
        const id = String(channel?.['@_id'] || '').trim();
        if (!id) continue;
        const names = asXmltvArray(channel['display-name']).map(readXmltvText).filter(Boolean);
        const iconEntries = asXmltvArray(channel.icon);
        const icon = iconEntries.find((entry) => entry?.['@_src'])?.['@_src'] || '';
        const old = channelsById.get(id);
        channelsById.set(id, {
          id,
          name: names[0] || old?.name || id,
          names: Array.from(new Set([...(old?.names || []), ...names])),
          icon: icon || old?.icon || '',
        });
      }

      for (const programme of sourceProgrammes) {
        const channel = String(programme?.['@_channel'] || '').trim();
        const start = String(programme?.['@_start'] || '').trim();
        const stop = String(programme?.['@_stop'] || '').trim();
        const showTitle = readXmltvText(programme?.title).trim();
        const episodeTitle = readXmltvText(programme?.['sub-title']).trim();
        const cleanTitle = (value: string) => value.replace(/\s*;\s*/g, ' ').replace(/\s+/g, ' ').trim();
        const cleanShowTitle = cleanTitle(showTitle);
        const cleanEpisodeTitle = cleanTitle(episodeTitle);
        const title = cleanShowTitle && cleanEpisodeTitle
          && cleanEpisodeTitle.toLocaleLowerCase() !== cleanShowTitle.toLocaleLowerCase()
          ? `${cleanShowTitle} — ${cleanEpisodeTitle}`
          : (cleanShowTitle || cleanEpisodeTitle);
        if (!channel || !start || !stop || !title) continue;

        const startMs = parseXmltvDate(start).getTime();
        const stopMs = parseXmltvDate(stop).getTime();
        if (!Number.isFinite(startMs) || !Number.isFinite(stopMs) || stopMs <= startMs) continue;
        if (stopMs < windowStartMs || startMs > windowEndMs) continue;

        const key = `${channel}| ${start}| ${stop}| ${title}`;
        if (!programmesByKey.has(key)) {
          programmesByKey.set(key, {
            channel,
            start,
            stop,
            title,
            desc: readXmltvText(programme?.desc),
            category: readXmltvText(programme?.category),
          });
        }
      }
      loadedSourceCount += 1;
    } catch (error: any) {
      // Do not echo complete source URLs; some custom guides use private query tokens.
      failedSources.push(`Guide source ${sourceIndex + 1}: ${error?.message || 'fetch/parse failed'}`);
    }
  };

  for (let i = 0; i < urls.length; i += 4) {
    await Promise.all(urls.slice(i, i + 4).map((url, offset) => parseSource(url, i + offset)));
  }

  return {
    channels: Array.from(channelsById.values()),
    programmes: Array.from(programmesByKey.values()),
    sourceCount: urls.length,
    loadedSourceCount,
    failedSourceCount: failedSources.length,
    failedSources: failedSources.slice(0, 10),
  };
}

interface EpgGuideProps {
  channels: Channel[];
  selectedChannel: Channel | null;
  onSelectChannel: (channel: Channel) => void;
  settings: AppSettings;
  favorites: string[];
  favoriteChannels: Channel[];
  onToggleFavorite: (channelId: string) => void;
  onImportFavoriteChannels: (channels: Channel[]) => void;
  onNextChannel: () => void;
  onPrevChannel: () => void;
  onStreamFailed: (channel: Channel, reason: string) => void;
  onOpenPlaylistModal: () => void;
  onExpandPlayer?: () => void;
  activePlaylistTitle: string;
  activePlaylistEpgUrl?: string;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  showFavoritePlaylist: boolean;
  onToggleFavoritePlaylist: () => void;
  onEpgLoadingChange: (loading: boolean) => void;
}

export const EpgGuide: React.FC<EpgGuideProps> = ({
  channels,
  selectedChannel,
  onSelectChannel,
  settings,
  favorites,
  favoriteChannels,
  onToggleFavorite,
  onImportFavoriteChannels,
  onNextChannel,
  onPrevChannel,
  onStreamFailed,
  onOpenPlaylistModal,
  onExpandPlayer,
  activePlaylistTitle,
  activePlaylistEpgUrl,
  searchQuery,
  onSearchQueryChange,
  showFavoritePlaylist,
  onToggleFavoritePlaylist,
  onEpgLoadingChange,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [epgPageLimit, setEpgPageLimit] = useState(100);
  const [remoteFocusedChannelIndex, setRemoteFocusedChannelIndex] = useState(0);
  const [selectedProgram, setSelectedProgram] = useState<EpgProgram | null>(null);
  const [epgUrlInput, setEpgUrlInput] = useState(() => localStorage.getItem('ma9ictv-epg-url') || '');
  const [isLoadingEpg, setIsLoadingEpg] = useState(false);
  useEffect(() => { onEpgLoadingChange(isLoadingEpg); }, [isLoadingEpg, onEpgLoadingChange]);
  const [streamConnectedForBatchLoad, setStreamConnectedForBatchLoad] = useState(false);
  const [hasConnectedForEpg, setHasConnectedForEpg] = useState(false);
  const [excludedEpgChannels, setExcludedEpgChannels] = useState<Channel[]>(() => getEpgExcludedChannels());
  const [showExcludedEpgChannels, setShowExcludedEpgChannels] = useState(false);
  const guideChannels = showFavoritePlaylist ? favoriteChannels : channels;
  const favoriteFileInputRef = useRef<HTMLInputElement | null>(null);
  const [epgLoadError, setEpgLoadError] = useState('');
  const [xmltvProgrammes, setXmltvProgrammes] = useState<EpgProgram[]>([]);
  const [xmltvChannelAliases, setXmltvChannelAliases] = useState<Record<string, string[]>>({});
  const gridScrollRef = useRef<HTMLDivElement | null>(null);
  // Keep the guide DOM small even when playlists contain thousands of channels.
  const [gridScrollTop, setGridScrollTop] = useState(0);
  const gridScrollRafRef = useRef<number | null>(null);
  const guideRowHeight = 49;
  const guideHeaderHeight = 34;
  const guideViewportHeight = gridScrollRef.current?.clientHeight || 600;
  const firstVisibleGuideRow = Math.max(0, Math.floor(Math.max(0, gridScrollTop - guideHeaderHeight) / guideRowHeight) - 8);
  const categoryScrollRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{ pointerId: number; startX: number; startY: number; scrollLeft: number; scrollTop: number; active: boolean; suppressClick: boolean } | null>(null);
  const legacySavedEpgUrl = useRef(localStorage.getItem('ma9ictv-epg-url') || '');
  const legacyEpgResolved = useRef(false);
  // Gate the first EPG request on playback independently of channel pagination.
  const [currentTimeMs, setCurrentTimeMs] = useState(Date.now());

  useEffect(() => {
    const clearPersonalEpg = () => {
      setExcludedEpgChannels([]);
      setShowExcludedEpgChannels(false);
      saveEpgExcludedChannels([]);
    };
    window.addEventListener('ma9ictv-storage-reset', clearPersonalEpg);
    return () => window.removeEventListener('ma9ictv-storage-reset', clearPersonalEpg);
  }, []);

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
    guideChannels.forEach((c) => {
      if (c.group && c.group.trim()) set.add(c.group.trim());
    });
    // Do not cap this list: genre playlists can include dozens of countries
    // and regional groups, and every one must remain reachable by scrolling.
    return ['All', ...Array.from(set).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }))];
  }, [guideChannels]);

  // Switching between Plex, Samsung, Pluto, and World must discard the
  // previous playlist's category/search/scroll state. Otherwise a category such
  // as "Work Countries" remains selected and filters every channel from the new list.
  useEffect(() => {
    setSelectedCategory('All');
    onSearchQueryChange('');
    setEpgPageLimit(100);
    setEpgLoadError('');
    setSelectedProgram(null);
    if (gridScrollRef.current) gridScrollRef.current.scrollTop = 0;
    if (categoryScrollRef.current) categoryScrollRef.current.scrollLeft = 0;
  }, [activePlaylistTitle]);

  // The worldwide country-sorted lineup should open on the United Kingdom,
  // rather than showing every country at once. Match the real group label so
  // both "United Kingdom" and common "UK" naming variants are supported.
  useEffect(() => {
    if (!/world channels/i.test(activePlaylistTitle) || showFavoritePlaylist) return;
    const ukCategory = categories.find((category) =>
      category !== 'All' && /^(united kingdom|uk|great britain|gb)$/i.test(category.trim())
    );
    if (ukCategory) setSelectedCategory(ukCategory);
  }, [activePlaylistTitle, categories, showFavoritePlaylist]);

  // Filter channels by category and search
  const excludedChannelKeys = useMemo(() => {
    const keys = new Set<string>();
    excludedEpgChannels.forEach((channel) => {
      if (channel.id) keys.add(`id:${channel.id}`);
      if (channel.url) keys.add(`url:${channel.url.trim().toLowerCase()}`);
    });
    return keys;
  }, [excludedEpgChannels]);

  const filteredChannels = useMemo(() => {
    return guideChannels.filter((c) => {
      const isExcluded = excludedChannelKeys.has(`id:${c.id}`) ||
        excludedChannelKeys.has(`url:${String(c.url || '').trim().toLowerCase()}`);
      if (!showFavoritePlaylist && showExcludedEpgChannels !== isExcluded) return false;
      const normalizeCategory = (value: string | undefined) => String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
      const matchCat = selectedCategory === 'All' || normalizeCategory(c.group) === normalizeCategory(selectedCategory);
      if (!matchCat) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        c.name.toLowerCase().includes(q) ||
        c.group?.toLowerCase().includes(q) ||
        c.tvgName?.toLowerCase().includes(q)
      );
    });
  }, [guideChannels, selectedCategory, searchQuery, excludedChannelKeys, showExcludedEpgChannels, showFavoritePlaylist]);

  const lastVisibleGuideRow = Math.min(
    Math.min(filteredChannels.length, epgPageLimit),
    Math.ceil(Math.max(0, gridScrollTop - guideHeaderHeight + guideViewportHeight) / guideRowHeight) + 8
  );

  // Start with 100 rows for a fast first render, then expand the guide in
  // background batches after a channel has been selected. This avoids making
  // playlist import or initial video startup wait for a huge guide render.
  useEffect(() => {
    setEpgPageLimit(100);
  }, [guideChannels, selectedCategory, searchQuery, showFavoritePlaylist]);

  useEffect(() => {
    setStreamConnectedForBatchLoad(false);
  }, [selectedChannel?.id]);

  useEffect(() => {
    if (!streamConnectedForBatchLoad || !selectedChannel || epgPageLimit >= filteredChannels.length) return;
    let cancelled = false;
    // Wait until the video reports playback, then render more rows in paced
    // batches so the guide never delays starting the stream.
    const delayMs = epgPageLimit <= 100 ? 1200 : 900;
    const timer = window.setTimeout(() => {
      if (!cancelled) {
        setEpgPageLimit((limit) => Math.min(limit + 100, filteredChannels.length));
      }
    }, delayMs);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [streamConnectedForBatchLoad, selectedChannel?.id, epgPageLimit, filteredChannels.length]);

  // Build schedules only for the rows currently on screen. Scanning and
  // indexing every channel/programme combination made opening large guides freeze.
  const channelSchedules = useMemo(() => {
    const scheduleChannels = filteredChannels.slice(0, epgPageLimit);
    if (!showFavoritePlaylist && selectedChannel && !scheduleChannels.some((channel) => channel.id === selectedChannel.id)) {
      scheduleChannels.push(selectedChannel);
    }

    const relevantKeys = new Set<string>();
    const channelKeys = new Map<string, string[]>();
    for (const channel of scheduleChannels) {
      const keys = [channel.tvgId, channel.tvgName, channel.name]
        .filter(Boolean)
        .map((value) => normalizeEpgName(String(value)))
        .filter(Boolean);
      channelKeys.set(channel.id, keys);
      keys.forEach((key) => relevantKeys.add(key));
    }

    // Add XMLTV display-name aliases that plausibly correspond to one of the
    // visible channel names. This keeps the index small while allowing common
    // naming variants such as "Example TV HD" vs "Example TV" to match.
    const channelNameKeys = [...relevantKeys];
    for (const aliases of Object.values(xmltvChannelAliases)) {
      for (const alias of aliases) {
        const normalizedAlias = normalizeEpgName(alias);
        if (normalizedAlias.length < 6) continue;
        if (channelNameKeys.some((key) =>
          key.length >= 6 &&
          (normalizedAlias.startsWith(key) || key.startsWith(normalizedAlias))
        )) relevantKeys.add(normalizedAlias);
      }
    }

    const programmesByName = new Map<string, EpgProgram[]>();
    const addProgramme = (key: string, programme: EpgProgram) => {
      const normalized = normalizeEpgName(key);
      if (!normalized || !relevantKeys.has(normalized)) return;
      const existing = programmesByName.get(normalized);
      if (existing) existing.push(programme);
      else programmesByName.set(normalized, [programme]);
    };

    const now = Date.now();
    const windowStart = now - 2 * 60 * 60 * 1000;
    const windowEnd = now + 8 * 60 * 60 * 1000;
    for (const programme of xmltvProgrammes) {
      const channelId = (programme.channelId || '').trim().toLowerCase();
      if (!channelId) continue;
      const startsAt = programme.startTime.getTime();
      const stopsAt = programme.stopTime.getTime();
      if (stopsAt < windowStart || startsAt > windowEnd) continue;
      addProgramme(channelId, programme);
      for (const alias of xmltvChannelAliases[channelId] || []) addProgramme(alias, programme);
    }

    const map = new Map<string, EpgProgram[]>();
    for (const channel of scheduleChannels) {
      const matches: EpgProgram[] = [];
      const seen = new Set<string>();
      const keys = channelKeys.get(channel.id) || [];
      const addMatches = (programmes: EpgProgram[]) => {
        for (const programme of programmes) {
          if (!seen.has(programme.id)) {
            seen.add(programme.id);
            matches.push(programme);
          }
        }
      };

      // Prefer exact ID/name matches. Many genre M3Us omit tvg-id, while XMLTV
      // display names often include or omit suffixes such as HD, FHD, or region.
      for (const key of keys) addMatches(programmesByName.get(key) || []);
      if (matches.length === 0) {
        const relatedKeys = [...programmesByName.keys()].filter((guideKey) =>
          keys.some((channelKey) =>
            channelKey.length >= 6 && guideKey.length >= 6 &&
            (guideKey.startsWith(channelKey) || channelKey.startsWith(guideKey))
          )
        );
        for (const key of relatedKeys) addMatches(programmesByName.get(key) || []);
      }

      matches.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
      map.set(channel.id, matches);
    }
    return map;
  }, [filteredChannels, epgPageLimit, selectedChannel, xmltvProgrammes, xmltvChannelAliases, showFavoritePlaylist]);

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

  // Click-and-hold drag scrolling for mouse, touch, and trackpad users.
  // The same scroll areas also respond to TV remote arrow keys below.
  const handleDragPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    // Do not capture pointer events from controls inside the guide. Capturing
    // a Play/Tune button on the scrolling parent can prevent its click event
    // from reaching the button, especially in TV browsers.
    const target = event.target;
    // Category pills are part of the horizontal scroll surface, so dragging
    // should work even when the pointer starts directly on a pill. Keep other
    // interactive controls click-only so Tune/Favorite buttons remain reliable.
    const element = event.currentTarget;
    if (element !== categoryScrollRef.current &&
      target instanceof Element &&
      target.closest('button, a, input, textarea, select, [role="button"]')) {
      dragStateRef.current = null;
      return;
    }

    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: element.scrollLeft,
      scrollTop: element.scrollTop,
      active: false,
      suppressClick: false,
    };
    // Avoid pointer capture on the category bar: capture retargets pointerup
    // away from a pill and can prevent a normal category click from firing.
    if (element !== categoryScrollRef.current) {
      try { element.setPointerCapture(event.pointerId); } catch { /* capture may be unavailable on some TV browsers */ }
    }
  };

  const handleDragPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.active && Math.hypot(dx, dy) < 6) return;
    drag.active = true;
    drag.suppressClick = true;
    event.preventDefault();
    const element = event.currentTarget;
    if (element === categoryScrollRef.current) {
      element.scrollLeft = drag.scrollLeft - dx;
    } else {
      element.scrollLeft = drag.scrollLeft - dx;
      element.scrollTop = drag.scrollTop - dy;
    }
  };

  const handleDragPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const wasDragged = drag.active;
    // Keep the immediately following click from activating a programme/category after a drag.
    dragStateRef.current = wasDragged
      ? { ...drag, pointerId: -1, active: false, suppressClick: true }
      : null;
    if (wasDragged) {
      window.setTimeout(() => {
        if (dragStateRef.current?.pointerId === -1) dragStateRef.current = null;
      }, 50);
    }
  };

  const handleDragClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    // A real drag should never activate a channel/programme underneath the
    // pointer. Ordinary clicks leave dragStateRef null on pointer-up, so they
    // continue to tune channels normally.
    if (dragStateRef.current?.suppressClick) {
      event.preventDefault();
      event.stopPropagation();
      dragStateRef.current = null;
    }
  };

  // TV remote / keyboard navigation: Up and Down move through channel rows.
  // Keep these keys dedicated to the guide while this view is mounted.
  useEffect(() => {
    const handleGuideKeys = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) return;
      if (!['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'PageDown', 'PageUp'].includes(event.key)) return;
      const categoryBar = categoryScrollRef.current;
      const focusedCategory = categoryBar && event.target instanceof HTMLElement ? event.target.closest('button') : null;
      if (categoryBar && focusedCategory && categoryBar.contains(focusedCategory) && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
        const buttons = Array.from(categoryBar.querySelectorAll('button'));
        const index = buttons.indexOf(focusedCategory as HTMLButtonElement);
        const next = buttons[index + (event.key === 'ArrowRight' ? 1 : -1)];
        if (next) { event.preventDefault(); event.stopPropagation(); next.focus(); }
        return;
      }
      const grid = gridScrollRef.current;
      if (!grid) return;
      // The first Down from the header/player enters the guide and focuses a real channel target.
      if (!(event.target instanceof Node) || !grid.contains(event.target)) {
        if (event.key === 'ArrowDown') {
          const firstRow = grid.querySelector<HTMLElement>('[data-channel-index="0"] [data-tune-channel="true"]')
            || grid.querySelector<HTMLElement>('[data-channel-index="0"]');
          if (firstRow) {
            event.preventDefault();
            event.stopPropagation();
            firstRow.focus();
            firstRow.scrollIntoView({ block: 'nearest' });
            return;
          }
        }
        if (event.key === 'ArrowUp') return;
        event.preventDefault();
        event.stopPropagation();
        grid.focus();
        return;
      }
      if (event.target instanceof Node && grid.contains(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      const horizontal = event.key === 'ArrowLeft' || event.key === 'ArrowRight';
      // One arrow press moves one EPG time slot horizontally (30 minutes) or
      // one channel row vertically. Page Up/Down still jump most of a screen.
      const distance = event.key === 'PageDown' || event.key === 'PageUp'
        ? Math.max(180, Math.floor(grid.clientHeight * 0.75))
        : horizontal ? 30 * minuteWidthPx : 60;
      if (horizontal) grid.scrollBy({ left: event.key === 'ArrowLeft' ? -distance : distance, behavior: 'smooth' });
      else grid.scrollBy({ top: event.key === 'ArrowUp' || event.key === 'PageUp' ? -distance : distance, behavior: 'smooth' });
    };
    window.addEventListener('keydown', handleGuideKeys, { capture: true });
    return () => window.removeEventListener('keydown', handleGuideKeys, { capture: true });
  }, []);

  // The server accepts a comma-separated bundle and limits upstream XMLTV
  // downloads to four at a time. Keep the bundle in one request; fanning it out
  // from the browser launches eight large XMLTV parses concurrently and can
  // overwhelm the server, causing every EPG request to fail.
  const handleLoadXmltv = async (showAlert = true, urlOverride?: string, append = false) => {
    const sourceUrl = (urlOverride ?? epgUrlInput).trim();
    if (!sourceUrl) return;
    setIsLoadingEpg(true);
    setEpgLoadError('');
    try {
      let data: any;
      if (isStaticClient) {
        data = await parseXmltvInBrowser(sourceUrl);
        if (data.loadedSourceCount === 0) {
          throw new Error('The browser could not load any XMLTV sources. A source may block cross-origin browser access; sources with that restriction need a local/server connection.');
        }
      } else {
        const response = await fetch(apiUrl('/api/parse-epg'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: sourceUrl }),
        });
        data = await response.json();
        if (!response.ok) {
          throw new Error(data?.error || `EPG server returned HTTP ${response.status}`);
        }
      }
      if (!Array.isArray(data.programmes) || data.programmes.length === 0) {
        throw new Error('The EPG server returned no programme data for the selected source(s).');
      }
      const allProgrammes = data.programmes;
      const allChannels = Array.isArray(data.channels) ? data.channels : [];

      const now = Date.now();
      const seenProgrammes = new Set<string>();
      const parsed: EpgProgram[] = allProgrammes.flatMap((p: any) => {
        const startMs = parseXmltvDate(p.start).getTime();
        const stopMs = parseXmltvDate(p.stop).getTime();
        // Discard malformed records rather than inventing times or generic titles.
        if (!p.channel || !p.title?.trim() || !Number.isFinite(startMs) || !Number.isFinite(stopMs) || stopMs <= startMs) return [];
        const title = String(p.title).trim();
        const channelId = String(p.channel).trim();
        const programmeKey = `${channelId.toLowerCase()}|${startMs}|${stopMs}|${title.toLowerCase()}`;
        if (seenProgrammes.has(programmeKey)) return [];
        seenProgrammes.add(programmeKey);
        const isLive = now >= startMs && now < stopMs;
        const progress = isLive ? Math.max(0, Math.min(100, Math.round(((now - startMs) / (stopMs - startMs)) * 100))) : 0;
        return [{
          id: `xmltv-${encodeURIComponent(channelId)}-${startMs}-${stopMs}`,
          channelId,
          title,
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
      allChannels.forEach((channel: any) => {
        const id = String(channel.id || '').trim().toLowerCase();
        if (!id) return;
        const names = Array.isArray(channel.names) ? channel.names : [channel.name].filter(Boolean);
        const mergedNames = [...(aliases[id] || []), ...names.map((name: unknown) => String(name).trim()).filter(Boolean)];
        aliases[id] = Array.from(new Set(mergedNames));
      });
      if (parsed.length === 0) throw new Error('The XMLTV source(s) contained no valid programme titles and times.');
      // Publish the first regional guide immediately. Additional regions are
      // merged later, so the guide is useful before every large XMLTV feed finishes.
      setXmltvChannelAliases((previous) => {
        if (!append) return aliases;
        const merged: Record<string, string[]> = { ...previous };
        Object.entries(aliases).forEach(([id, names]) => {
          merged[id] = Array.from(new Set([...(merged[id] || []), ...names]));
        });
        return merged;
      });
      setXmltvProgrammes((previous) => {
        if (!append) return parsed;
        const merged = new Map<string, EpgProgram>();
        [...previous, ...parsed].forEach((programme) => {
          const key = `${programme.channelId.toLowerCase()}|${programme.start}|${programme.stop}|${programme.title.toLowerCase()}`;
          if (!merged.has(key)) merged.set(key, programme);
        });
        return Array.from(merged.values());
      });
      if (showAlert) {
        localStorage.setItem('ma9ictv-epg-url', sourceUrl);
        localStorage.setItem('ma9ictv-manual-epg-url', sourceUrl);
      }
      if (Number(data.failedSourceCount) > 0) {
        setEpgLoadError(`Loaded guide data from ${data.loadedSourceCount || 0} of ${data.sourceCount || 0} EPG sources; some regional guides were unavailable.`);
      }
    } catch (err: any) {
      console.error('Could not load XMLTV guide:', err);
      setEpgLoadError(err?.message || 'Could not load the XMLTV guide. Check the URL and server logs.');
      if (showAlert) alert('Could not load the XMLTV guide. Check the URL and server logs.');
    } finally {
      setIsLoadingEpg(false);
    }
  };

  // Load the guide after the first successful stream; channel changes must not
  // restart large XMLTV downloads. Changing the playlist guide still reloads it.
  const playlistEpgSource = activePlaylistEpgUrl?.trim() || '';
  useEffect(() => {
    // Load programme data as soon as the active playlist is known. Guide
    // availability must not depend on a stream successfully connecting.
    let manualUrl = localStorage.getItem('ma9ictv-manual-epg-url')?.trim() || '';
    if (!legacyEpgResolved.current) {
      if (!manualUrl && legacySavedEpgUrl.current && legacySavedEpgUrl.current !== playlistEpgSource) {
        manualUrl = legacySavedEpgUrl.current;
        localStorage.setItem('ma9ictv-manual-epg-url', manualUrl);
      }
      legacyEpgResolved.current = true;
    }

    const sourceUrl = playlistEpgSource || manualUrl;
    setXmltvProgrammes([]);
    setXmltvChannelAliases({});
    setEpgUrlInput(sourceUrl);

    let cancelled = false;
    if (sourceUrl) {
      localStorage.setItem('ma9ictv-epg-url', sourceUrl);
      const sources = sourceUrl.split(',').map((url) => url.trim()).filter(Boolean);
      if (sources.length > 1) {
        // Load one region first, then progressively merge small regional batches.
        // This keeps the first guide visible quickly without dropping sources
        // after the old eight-source server limit.
        void (async () => {
          await handleLoadXmltv(false, sources[0], false);
          if (cancelled) return;
          for (let index = 1; index < sources.length; index += 4) {
            if (cancelled) return;
            await handleLoadXmltv(false, sources.slice(index, index + 4).join(','), true);
          }
        })();
      } else {
        void handleLoadXmltv(false, sourceUrl, false);
      }
    } else {
      localStorage.removeItem('ma9ictv-epg-url');
      setEpgLoadError('');
    }
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePlaylistEpgUrl, activePlaylistTitle]);

  const updateExcludedEpgChannel = (channel: Channel, exclude: boolean) => {
    setExcludedEpgChannels((previous) => {
      const matches = (item: Channel) => item.id === channel.id ||
        item.url.trim().toLowerCase() === channel.url.trim().toLowerCase();
      const next = exclude ? [...previous.filter((item) => !matches(item)), channel] : previous.filter((item) => !matches(item));
      saveEpgExcludedChannels(next);
      return next;
    });
  };

  const exportFavoritesText = () => {
    const lines = [
      '# Ma9icTV Favorites & Personal EPG v1',
      ...favoriteChannels.map((channel) => JSON.stringify({ type: 'favorite', channel })),
      ...excludedEpgChannels.map((channel) => JSON.stringify({ type: 'epg-excluded', channel })),
    ];
    const file = new Blob([lines.join('\r\n')], { type: 'text/plain;charset=utf-8' });
    const objectUrl = URL.createObjectURL(file);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = 'ma9ictv-favorites.txt';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  };

  const importFavoritesText = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const rawText = (await file.text()).trim();
      let records: unknown[] = [];
      try {
        const parsed: unknown = JSON.parse(rawText);
        if (Array.isArray(parsed)) records = parsed;
        else if (parsed && typeof parsed === 'object' && Array.isArray((parsed as any).channels)) records = (parsed as any).channels;
        else records = [parsed];
      } catch {
        records = rawText.split(/\r?\n/).map((line) => line.trim())
          .filter((line) => line && !line.startsWith('#')).map((line) => JSON.parse(line));
      }
      const validChannel = (value: unknown): value is Channel => {
        if (!value || typeof value !== 'object') return false;
        const channel = value as Partial<Channel>;
        return typeof channel.id === 'string' && typeof channel.name === 'string' &&
          typeof channel.url === 'string' &&
          (channel.url.startsWith('https://') || channel.url.startsWith('http://'));
      };
      const importedFavorites: Channel[] = [];
      const importedExcluded: Channel[] = [];
      for (const record of records) {
        if (!record || typeof record !== 'object') continue;
        const row = record as any;
        if (row.type === 'favorite' && validChannel(row.channel)) importedFavorites.push(row.channel);
        else if (row.type === 'epg-excluded' && validChannel(row.channel)) importedExcluded.push(row.channel);
        else if (validChannel(row.channel)) importedFavorites.push(row.channel);
        else if (validChannel(row)) importedFavorites.push(row);
      }
      if (!importedFavorites.length && !importedExcluded.length) {
        throw new Error('No valid favorites or personal EPG entries were found in this text file.');
      }
      if (importedFavorites.length) onImportFavoriteChannels(importedFavorites);
      if (importedExcluded.length) {
        setExcludedEpgChannels((previous) => {
          const byUrl = new Map<string, Channel>();
          [...previous, ...importedExcluded].forEach((channel) => byUrl.set(channel.url.trim().toLowerCase(), channel));
          const next = [...byUrl.values()];
          saveEpgExcludedChannels(next);
          return next;
        });
      }
      alert(`Loaded ${importedFavorites.length} favorite(s) and ${importedExcluded.length} excluded EPG channel(s).`);
    } catch (error: any) {
      alert(error?.message || 'Could not read the favorites text file.');
    } finally {
      event.target.value = '';
    }
  };

  // Android TV / D-pad navigation: arrows move guide focus without switching streams.
  useEffect(() => {
    const selectedIndex = filteredChannels.findIndex((channel) => channel.id === selectedChannel?.id);
    if (selectedIndex >= 0) setRemoteFocusedChannelIndex(selectedIndex);
    else setRemoteFocusedChannelIndex((index) => Math.min(index, Math.max(0, filteredChannels.length - 1)));
  }, [selectedChannel?.id, filteredChannels]);

  const handleGuideRemoteKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const grid = gridScrollRef.current;
    if (!grid || !filteredChannels.length) return;
    const target = event.target as HTMLElement;
    const isInteractive = !!target.closest('button, input, textarea, select, a, [role="button"]');
    if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault();
      event.stopPropagation();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      const nextIndex = Math.max(0, Math.min(filteredChannels.length - 1, remoteFocusedChannelIndex + delta));

      // At the first EPG row, Up returns to the top navigation. Otherwise,
      // vertical arrows stay inside the guide and move one channel at a time.
      if (event.key === 'ArrowUp' && remoteFocusedChannelIndex === 0) {
        const topStop = document.querySelector<HTMLElement>('header button[aria-pressed="true"]')
          || document.querySelector<HTMLElement>('header button');
        topStop?.focus();
        return;
      }

      setRemoteFocusedChannelIndex(nextIndex);
      const row = grid.querySelector<HTMLElement>('[data-channel-index="' + nextIndex + '"]');
      if (row) {
        const top = row.offsetTop;
        const bottom = top + row.offsetHeight;
        if (top < grid.scrollTop + 42) grid.scrollTo({ top: Math.max(0, top - 42), behavior: 'auto' });
        else if (bottom > grid.scrollTop + grid.clientHeight) grid.scrollTo({ top: bottom - grid.clientHeight, behavior: 'auto' });
        const channelTarget = row.querySelector<HTMLElement>('[data-tune-channel="true"]');
        channelTarget?.focus();
      }
      return;
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      // Left/Right should always move the EPG timeline, even when a programme
      // cell has focus. Up/Down continue to move the channel focus.
      event.preventDefault();
      event.stopPropagation();
      grid.scrollBy({ left: (event.key === 'ArrowRight' ? 1 : -1) * Math.max(180, grid.clientWidth * 0.65), behavior: 'smooth' });
      return;
    }
    if (event.key === 'Enter' || event.key === ' ') {
      if (isInteractive) return;
      event.preventDefault();
      const channel = filteredChannels[remoteFocusedChannelIndex];
      if (channel) { onSelectChannel(channel); setSelectedProgram(null); }
    }
  };
  return (
    <div className="flex-1 min-h-0 min-w-0 flex flex-col h-full bg-[#0a0e17] text-slate-100 overflow-hidden select-none">
      {/* =========================================================================
          STAGE 1: TOP HERO SECTION (LIVE VIDEO PLAYER + PROGRAM INFO PANE)
          ========================================================================= */}
      <section className="h-[clamp(190px,35dvh,420px)] flex-shrink-0 bg-black border-b border-slate-800/80 p-1 sm:p-1.5 flex flex-col gap-1 items-stretch z-20 shadow-lg">
        {/* Left: Live Video Player Preview Stage */}
        <div className="w-full h-full min-h-0 flex-shrink-0 relative">
          <VideoPlayer
            key={selectedChannel?.id || selectedChannel?.url || 'no-channel'}
            channel={selectedChannel}
            settings={settings}
            onNextChannel={onNextChannel}
            onPrevChannel={onPrevChannel}
            onStreamFailed={onStreamFailed}
            isFavorite={selectedChannel ? favorites.includes(selectedChannel.id) : false}
            onToggleFavorite={() => selectedChannel && onToggleFavorite(selectedChannel.id)}
            mode="epg-preview"
            onExpandPlayer={onExpandPlayer}
            onStreamConnected={() => {
              setHasConnectedForEpg(true);
              setStreamConnectedForBatchLoad(true);
            }}
          />
        </div>

        {/* Right: Rich Channel & Current Program Synopsis */}
        <div className="hidden">
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
                    <div className="flex items-center gap-1 flex-shrink-0">
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

                <div className="flex items-center gap-1 flex-shrink-0">
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

      {/* Category Pills Bar */}
      <div ref={categoryScrollRef} onPointerDown={handleDragPointerDown} onPointerMove={handleDragPointerMove} onPointerUp={handleDragPointerUp} onPointerCancel={handleDragPointerUp} onClickCapture={handleDragClickCapture} className="bg-slate-950/60 border-b border-slate-800/60 px-1 py-0.5 overflow-x-auto overflow-y-hidden flex flex-nowrap items-center gap-0.5 cursor-grab active:cursor-grabbing select-none" style={{ touchAction: "pan-x", WebkitOverflowScrolling: "touch", scrollbarWidth: "thin", scrollbarColor: "#6366f1 #0f172a" }} aria-label="Scrollable channel categories">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`flex-shrink-0 px-1.5 py-0 rounded text-[7px] leading-3 font-semibold whitespace-nowrap transition-all ${
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
      <div className="flex-1 min-h-0 min-w-0 overflow-hidden flex flex-col relative bg-[#070b12]">
        {/* Scrollable Container */}
        <div ref={gridScrollRef} onScroll={(event) => {
          const nextTop = event.currentTarget.scrollTop;
          if (gridScrollRafRef.current !== null) return;
          gridScrollRafRef.current = window.requestAnimationFrame(() => {
            gridScrollRafRef.current = null;
            setGridScrollTop(gridScrollRef.current?.scrollTop ?? nextTop);
          });
        }} onPointerDown={handleDragPointerDown} onPointerMove={handleDragPointerMove} onPointerUp={handleDragPointerUp} onPointerCancel={handleDragPointerUp} onClickCapture={handleDragClickCapture} onKeyDown={handleGuideRemoteKeyDown} className="flex-1 min-h-0 min-w-0 relative overscroll-contain cursor-grab active:cursor-grabbing" style={{ height: 0, overflowX: "auto", overflowY: "scroll", WebkitOverflowScrolling: "touch", touchAction: "pan-x pan-y", overscrollBehavior: "contain", scrollbarWidth: "auto", scrollbarColor: "#6366f1 #0f172a", userSelect: "none" }} aria-label="Scrollable TV guide. Click and drag horizontally for times and vertically for channels, or use TV remote arrows." tabIndex={0}>
          <div
            className="min-w-max flex flex-col relative"
            style={{ width: `${(typeof window !== "undefined" && window.innerWidth < 640 ? 112 : 190) + timeSlots.length * 30 * minuteWidthPx}px` }}
          >
            {/* Current-time marker spans the complete EPG schedule, not just the time ruler. */}
            {currentTimeMs >= timelineStartMs && (
              <div
                className="absolute top-0 bottom-0 z-20 pointer-events-none"
                style={{
                  left: `${(typeof window !== "undefined" && window.innerWidth < 640 ? 112 : 190) + ((currentTimeMs - timelineStartMs) / 60000) * minuteWidthPx}px`,
                }}
                aria-hidden="true"
              >
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-rose-500 shadow-md shadow-rose-500/50" />
                <div className="absolute top-2 bottom-0 left-1/2 -translate-x-1/2 w-[2px] bg-rose-500/90 shadow-sm" />
              </div>
            )}
            {/* 1. Sticky Time Ruler Header */}
            <div className="relative z-10 flex bg-slate-950/95 border-b border-slate-800 shadow-md">
              {/* Corner Channel Header */}
              <div className="sticky left-0 z-30 w-[148px] sm:w-[220px] flex-shrink-0 px-1 sm:px-2 py-1 border-r border-slate-700 bg-[#070b12] text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between gap-1">
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
                      className="flex-shrink-0 border-r border-slate-800/80 px-1.5 py-1 text-[10px] font-mono font-semibold text-slate-400 flex items-center"
                      style={{ width: `${30 * minuteWidthPx}px` }}
                    >
                      <span>{timeLabel}</span>
                    </div>
                  );
                })}


              </div>
            </div>

            {/* 2. Virtualized channel rows with spacers preserving scroll height */}
            <div className="flex flex-col divide-y divide-slate-800/50">
              <div aria-hidden="true" style={{ height: firstVisibleGuideRow * guideRowHeight, flexShrink: 0 }} />
              {filteredChannels.slice(firstVisibleGuideRow, lastVisibleGuideRow).map((channel, visibleIdx) => {
                const cIdx = firstVisibleGuideRow + visibleIdx;
                const isSelected = selectedChannel?.id === channel.id;
                const isFavorite = favorites.includes(channel.id);
                const isExcluded = showExcludedEpgChannels;
                const programs = channelSchedules.get(channel.id) || [];

                return (
                  <div
                    key={channel.id}
                    data-channel-index={cIdx}
                    tabIndex={-1}
                    className={`flex items-stretch transition-colors ${
                      isSelected
                        ? 'bg-indigo-950/25 ring-1 ring-inset ring-indigo-500/40'
                        : remoteFocusedChannelIndex === cIdx
                        ? 'bg-sky-950/30 ring-1 ring-inset ring-sky-400/70'
                        : 'hover:bg-slate-900/40'
                    }`}
                  >
                    {/* Sticky Left Channel Card */}
                    <div
                      data-tune-channel="true"
                      tabIndex={0}
                      role="button"
                      aria-label={`Tune ${channel.name}`}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          onSelectChannel(channel);
                          setSelectedProgram(null);
                        }
                      }}
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        onSelectChannel(channel);
                        setSelectedProgram(null);
                      }}
                      className={`sticky left-0 z-20 w-[148px] sm:w-[220px] flex-shrink-0 px-1 sm:px-1.5 py-1 border-r border-slate-700 flex items-center justify-between gap-1 sm:gap-3 cursor-pointer select-none transition-colors ${
                        isSelected ? 'bg-[#1b1b46] text-white' : remoteFocusedChannelIndex === cIdx ? 'bg-[#10263b] text-white ring-1 ring-inset ring-sky-400/70' : 'bg-[#070b12] text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-1 min-w-0">
                        {/* Channel number and personal EPG include/exclude toggle */}
                        <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
                          <span className="hidden sm:block text-[11px] font-mono font-bold text-slate-500 w-5 text-right">
                            {cIdx + 1}
                          </span>
                          <button type="button" onClick={(e) => { e.stopPropagation(); updateExcludedEpgChannel(channel, !isExcluded); }}
                            className={`p-1 rounded-md transition-colors ${isExcluded ? 'text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20' : 'text-slate-600 hover:text-amber-300 hover:bg-slate-800'}`}
                            title={isExcluded ? 'Add channel back to personal EPG' : 'Remove channel from personal EPG'}
                            aria-label={isExcluded ? `Add ${channel.name} back to personal EPG` : `Remove ${channel.name} from personal EPG`}>
                            {isExcluded ? <Plus className="w-3.5 h-3.5" /> : <Minus className="w-3.5 h-3.5" />}
                          </button>
                        </div>

                        {/* Channel logo, number and title grouped in one visible pill */}
                        <div className="flex items-center gap-1.5 min-w-0 max-w-full rounded-full px-1.5 py-1 bg-slate-900/90 border border-slate-700/90 shadow-sm">
                          <span className="text-[9px] sm:text-[10px] font-mono font-bold text-cyan-200 flex-shrink-0">
                            {channel.tvgChno || cIdx + 1}
                          </span>
                          <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-slate-950 border border-slate-600 p-0.5 flex items-center justify-center overflow-hidden flex-shrink-0 shadow-sm">
                            {channel.logo ? (
                              <img
                                src={channel.logo}
                                alt=""
                                className="w-full h-full object-contain rounded-full"
                                onError={(e) => {
                                  (e.target as HTMLElement).style.display = 'none';
                                }}
                              />
                            ) : (
                              <Tv className="w-4 h-4 text-slate-500" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-[10px] sm:text-[11px] font-semibold truncate leading-tight">{channel.name}</h4>
                            <span className="text-[8px] text-slate-500 truncate block">
                              {channel.group || 'General'}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        <button type="button" onClick={(e) => { e.stopPropagation(); onToggleFavorite(channel.id); }}
                          className={`p-1 rounded transition-colors ${isFavorite ? 'text-amber-300 bg-amber-400/10' : 'text-slate-500 hover:text-amber-300 hover:bg-slate-800'}`}
                          title={isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
                          aria-label={isFavorite ? `Remove ${channel.name} from Favorites` : `Add ${channel.name} to Favorites`}
                          aria-pressed={isFavorite}>
                          <Star className={`w-3.5 h-3.5 ${isFavorite ? 'fill-current' : ''}`} />
                        </button>
                        <button type="button" onClick={(e) => { e.stopPropagation(); onSelectChannel(channel); }}
                          className={`p-1 rounded transition-colors flex-shrink-0 ${isSelected ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-white hover:bg-slate-800'}`}
                          title="Tune Channel" aria-label={`Tune ${channel.name}`}>
                          <Play className="w-3.5 h-3.5 fill-current" />
                        </button>
                      </div>
                    </div>

                    {/* Timeline Program Blocks */}
                    <div
                      className="relative flex-shrink-0 py-0.5"
                      style={{ width: `${timeSlots.length * 30 * minuteWidthPx}px`, height: '48px' }}
                    >
                      {programs.length === 0 && (
                        <div
                          className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-600 italic pointer-events-none"
                          aria-label={xmltvProgrammes.length > 0 ? 'No matching programme listing for this channel' : 'Programme guide is loading or unavailable'}
                        >
                          {xmltvProgrammes.length > 0 ? 'No matching show listing' : isLoadingEpg ? 'Loading show listings…' : 'No show listing available'}
                        </div>
                      )}
                      {programs.map((prog) => {
                        const startMin = (prog.startTime.getTime() - timelineStartMs) / 60000;
                        const durationMin = (prog.stopTime.getTime() - prog.startTime.getTime()) / 60000;
                        const visibleEndMin = timeSlots.length * 30;

                        // Place each programme at its actual clock-time position. Previously
                        // blocks flowed next to one another, hiding schedule gaps and shifting
                        // programme highlights away from the red current-time line.
                        if (startMin + durationMin <= 0 || startMin >= visibleEndMin) return null;

                        const visibleStartMin = Math.max(0, startMin);
                        const visibleDurationMin = Math.min(visibleEndMin, startMin + durationMin) - visibleStartMin;
                        const isNowPlayingThis =
                          currentTimeMs >= prog.startTime.getTime() && currentTimeMs < prog.stopTime.getTime();

                        return (
                          <div
                            key={prog.id}
                            data-tune-channel="true"
                            onClick={(event) => {
                              // Every visible programme block is a channel-tune target,
                              // whether it is in the past, live now, or scheduled later.
                              // Tune immediately instead of opening a details overlay first.
                              event.preventDefault();
                              event.stopPropagation();
                              onSelectChannel(channel);
                              setSelectedProgram(null);
                            }}
                            role="button"
                            tabIndex={0}
                            aria-label={`Tune ${channel.name} from programme: ${prog.title}`}
                            title={`Watch ${channel.name}`}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                onSelectChannel(channel);
                                setSelectedProgram(null);
                              }
                            }}
                            className={`absolute top-1 h-10 rounded-md p-1.5 flex flex-col justify-between overflow-hidden cursor-pointer transition-colors border ${
                              isNowPlayingThis && isSelected
                                ? 'bg-indigo-600 text-white border-indigo-400 shadow-md shadow-indigo-600/30'
                                : isNowPlayingThis
                                ? 'bg-indigo-950/70 border-indigo-500/60 text-slate-100 hover:border-indigo-400'
                                : isSelected
                                ? 'bg-slate-900 border-indigo-900/60 text-slate-300 hover:bg-slate-800 hover:text-white'
                                : 'bg-slate-900/60 border-slate-800/80 text-slate-300 hover:bg-slate-800 hover:text-white hover:border-slate-700'
                            }`}
                            style={{
                              left: `${visibleStartMin * minuteWidthPx}px`,
                              width: `${Math.max(0, visibleDurationMin * minuteWidthPx - 3)}px`,
                            }}
                          >
                            <div className="flex items-center justify-between gap-1">
                              <span className="text-[10px] font-mono opacity-80 truncate">
                                {prog.startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                              {isNowPlayingThis && (
                                <span
                                  className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0 shadow-[0_0_8px_rgba(52,211,153,0.9)]"
                                  title="Currently airing"
                                  aria-label="Currently airing"
                                ></span>
                              )}
                            </div>
                            <EpgProgramTitle title={prog.title} />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              <div aria-hidden="true" style={{ height: Math.max(0, Math.min(filteredChannels.length, epgPageLimit) - lastVisibleGuideRow) * guideRowHeight, flexShrink: 0 }} />
              {filteredChannels.length > epgPageLimit && (
                <div className="sticky left-0 flex items-center justify-center gap-2 p-2 bg-slate-950 border-t border-slate-800">
                  <span className="text-xs text-slate-400">
                    Showing {Math.min(epgPageLimit, filteredChannels.length).toLocaleString()} of {filteredChannels.length.toLocaleString()} channels
                  </span>
                  <button
                    onClick={() => setEpgPageLimit((limit) => Math.min(limit + 100, filteredChannels.length))}
                    className="px-2 py-1 rounded-md bg-indigo-600 hover:bg-indigo-500 text-[10px] font-semibold"
                  >
                    Load 100 More Channels
                  </button>
                </div>
              )}
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
