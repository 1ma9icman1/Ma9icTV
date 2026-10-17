import React, { useState, useMemo } from 'react';
import {
  Calendar,
  Clock,
  Search,
  Upload,
  Link,
  Play,
  RefreshCw,
  Info,
  Tv,
} from 'lucide-react';
import { Channel, EpgProgram } from '../types';

interface EpgGuideProps {
  channels: Channel[];
  onTuneChannel: (channel: Channel) => void;
  selectedChannel: Channel | null;
}

export const EpgGuide: React.FC<EpgGuideProps> = ({
  channels,
  onTuneChannel,
  selectedChannel,
}) => {
  const [epgUrl, setEpgUrl] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProgram, setSelectedProgram] = useState<EpgProgram | null>(null);

  // In-memory sample / fetched EPG programs
  const [programmes, setProgrammes] = useState<EpgProgram[]>(() => {
    // Generate realistic live demo schedules for preset channels
    const now = Date.now();
    const demoItems: EpgProgram[] = [];

    channels.forEach((ch, idx) => {
      const channelId = ch.tvgId || ch.name;
      // Current program
      const startMs = now - ((idx * 7) % 35) * 60 * 1000;
      const endMs = startMs + 45 * 60 * 1000;
      const progress = Math.min(100, Math.max(5, ((now - startMs) / (endMs - startMs)) * 100));

      demoItems.push({
        id: `prog-${ch.id}-now`,
        channelId,
        title: `${ch.name}: Live Broadcast & In-Depth Coverage`,
        desc: `Comprehensive continuous coverage from the newsroom, feature interviews, international roundups, and special analysis for ${ch.group || 'general'} viewers.`,
        start: new Date(startMs).toISOString(),
        stop: new Date(endMs).toISOString(),
        category: ch.group || 'Live News',
        startTime: new Date(startMs),
        stopTime: new Date(endMs),
        isLive: true,
        progress: Math.round(progress),
      });

      // Next program
      const nextEndMs = endMs + 60 * 60 * 1000;
      demoItems.push({
        id: `prog-${ch.id}-next`,
        channelId,
        title: `${ch.name} Prime: World Perspectives`,
        desc: 'Special documentary feature looking at global innovation, environmental changes, and frontline stories from around the globe.',
        start: new Date(endMs).toISOString(),
        stop: new Date(nextEndMs).toISOString(),
        category: 'Documentary',
        startTime: new Date(endMs),
        stopTime: new Date(nextEndMs),
        isLive: false,
        progress: 0,
      });
    });

    return demoItems;
  });

  // Handle loading real XMLTV from URL
  const handleLoadXmltv = async () => {
    if (!epgUrl.trim()) return;
    setIsLoading(true);

    try {
      const res = await fetch('/api/parse-epg', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: epgUrl.trim() }),
      });

      if (!res.ok) {
        throw new Error('Failed to load XMLTV file');
      }

      const data = await res.json();
      if (data.programmes && Array.isArray(data.programmes)) {
        const parsed: EpgProgram[] = data.programmes.map((p: any, idx: number) => {
          const now = Date.now();
          // parse XMLTV format YYYYMMDDHHmmss +0000 or ISO
          let startMs = Date.parse(p.start);
          let stopMs = Date.parse(p.stop);
          if (isNaN(startMs)) startMs = now - 10 * 60 * 1000;
          if (isNaN(stopMs)) stopMs = now + 40 * 60 * 1000;

          const isLive = now >= startMs && now <= stopMs;
          const prog = isLive ? Math.round(((now - startMs) / (stopMs - startMs)) * 100) : 0;

          return {
            id: `xmltv-${idx}`,
            channelId: p.channel,
            title: p.title || 'Untitled Program',
            desc: p.desc || 'No description provided.',
            category: p.category || 'General',
            start: p.start,
            stop: p.stop,
            startTime: new Date(startMs),
            stopTime: new Date(stopMs),
            isLive,
            progress: prog,
          };
        });

        setProgrammes(parsed);
      }
    } catch (err) {
      console.error(err);
      alert('Could not parse XMLTV file from the provided URL.');
    } finally {
      setIsLoading(false);
    }
  };

  const filteredChannels = useMemo(() => {
    if (!searchQuery.trim()) return channels;
    const q = searchQuery.toLowerCase();
    return channels.filter((c) => c.name.toLowerCase().includes(q) || c.group?.toLowerCase().includes(q));
  }, [channels, searchQuery]);

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 text-slate-100 overflow-hidden">
      {/* EPG Toolbar */}
      <div className="p-4 border-b border-slate-800 bg-slate-900/60 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white">Electronic Program Guide (EPG)</h3>
            <p className="text-xs text-slate-400">Real-time TV schedule, now playing, and upcoming lineups</p>
          </div>
        </div>

        {/* XMLTV URL Import */}
        <div className="flex items-center gap-2 max-w-md w-full sm:w-auto">
          <div className="relative flex-1">
            <Link className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="url"
              placeholder="Load XMLTV URL (.xml / .xml.gz)..."
              value={epgUrl}
              onChange={(e) => setEpgUrl(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
          </div>
          <button
            onClick={handleLoadXmltv}
            disabled={isLoading || !epgUrl.trim()}
            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors flex-shrink-0"
          >
            {isLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            <span>Sync</span>
          </button>
        </div>
      </div>

      {/* Filter and Search */}
      <div className="px-4 py-2 border-b border-slate-800/80 bg-slate-900/30 flex items-center justify-between">
        <div className="relative w-72">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search TV Guide..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-900 border border-slate-800 rounded-lg pl-8 pr-3 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-400">
          <Clock className="w-3.5 h-3.5 text-indigo-400" />
          <span>Current Time: {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        </div>
      </div>

      {/* Main EPG Timeline / Channel Grid */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {filteredChannels.map((channel) => {
          const isSelected = selectedChannel?.id === channel.id;
          const channelProgs = programmes.filter(
            (p) =>
              p.channelId === channel.tvgId ||
              p.channelId === channel.name ||
              p.channelId?.toLowerCase() === channel.name.toLowerCase()
          );

          const liveProg = channelProgs.find((p) => p.isLive) || channelProgs[0];
          const nextProg = channelProgs.find((p) => !p.isLive);

          return (
            <div
              key={channel.id}
              className={`p-3.5 rounded-xl border transition-all ${
                isSelected
                  ? 'bg-indigo-950/30 border-indigo-500/80 ring-1 ring-indigo-500/30'
                  : 'bg-slate-900/50 border-slate-800/80 hover:bg-slate-900 hover:border-slate-700'
              }`}
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                {/* Channel Header */}
                <div className="flex items-center gap-3 w-64 flex-shrink-0">
                  <div className="w-10 h-10 rounded-lg bg-slate-900 border border-slate-800 p-1 flex items-center justify-center overflow-hidden flex-shrink-0">
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
                      <Tv className="w-5 h-5 text-slate-500" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-semibold text-white truncate">{channel.name}</h4>
                    <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-slate-800 text-slate-400 border border-slate-700 uppercase">
                      {channel.group || 'Live'}
                    </span>
                  </div>
                </div>

                {/* Programs: Now Playing & Next */}
                <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-3">
                  {/* Now Playing */}
                  {liveProg ? (
                    <div
                      onClick={() => setSelectedProgram(liveProg)}
                      className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800/70 hover:border-indigo-500/50 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                          <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">NOW</span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {liveProg.startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} -{' '}
                          {liveProg.stopTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <h5 className="text-xs font-semibold text-slate-100 truncate">{liveProg.title}</h5>
                      <p className="text-[11px] text-slate-400 line-clamp-1 mt-0.5">{liveProg.desc}</p>

                      {/* Progress Bar */}
                      <div className="w-full bg-slate-800 h-1 rounded-full mt-2 overflow-hidden">
                        <div
                          className="bg-indigo-500 h-full rounded-full transition-all"
                          style={{ width: `${liveProg.progress}%` }}
                        ></div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-2.5 rounded-lg bg-slate-950/30 border border-dashed border-slate-800 text-center text-xs text-slate-500">
                      No current guide data
                    </div>
                  )}

                  {/* Next Up */}
                  {nextProg ? (
                    <div
                      onClick={() => setSelectedProgram(nextProg)}
                      className="p-2.5 rounded-lg bg-slate-950/40 border border-slate-800/50 hover:border-slate-700 cursor-pointer transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">NEXT</span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {nextProg.startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} -{' '}
                          {nextProg.stopTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <h5 className="text-xs font-medium text-slate-300 truncate">{nextProg.title}</h5>
                      <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">{nextProg.desc}</p>
                    </div>
                  ) : null}
                </div>

                {/* Tune Channel Button */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => onTuneChannel(channel)}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    <span>Watch</span>
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Program Details Modal */}
      {selectedProgram && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 uppercase">
                  {selectedProgram.category || 'Program'}
                </span>
                <h3 className="text-lg font-bold text-white mt-1.5">{selectedProgram.title}</h3>
              </div>
              <button
                onClick={() => setSelectedProgram(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                ✕
              </button>
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-400 font-mono">
              <Clock className="w-4 h-4 text-indigo-400" />
              <span>
                {selectedProgram.startTime.toLocaleString()} — {selectedProgram.stopTime.toLocaleTimeString()}
              </span>
            </div>

            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-300 leading-relaxed">
              {selectedProgram.desc}
            </div>

            <div className="flex justify-end pt-2">
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
