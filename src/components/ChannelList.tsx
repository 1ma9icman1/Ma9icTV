import React, { useState, useMemo, useEffect } from 'react';
import {
  Search,
  Heart,
  Radio,
  Tv,
  Clock,
  Sparkles,
  Grid,
  List as ListIcon,
  ChevronDown,
} from 'lucide-react';
import { Channel } from '../types';

interface ChannelListProps {
  channels: Channel[];
  selectedChannel: Channel | null;
  onSelectChannel: (channel: Channel) => void;
  favorites: string[];
  onToggleFavorite: (channelId: string) => void;
  recentlyPlayed: Channel[];
}

export const ChannelList: React.FC<ChannelListProps> = ({
  channels,
  selectedChannel,
  onSelectChannel,
  favorites,
  onToggleFavorite,
  recentlyPlayed,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string>('ALL');
  const [isGridView, setIsGridView] = useState<boolean>(false);
  const [pageLimit, setPageLimit] = useState<number>(150);

  // Reset pagination when filter changes
  useEffect(() => {
    setPageLimit(150);
  }, [searchQuery, selectedGroup]);

  // Extract all distinct groups and their counts
  const groupStats = useMemo(() => {
    const counts: Record<string, number> = {};
    channels.forEach((c) => {
      const g = c.group || 'General';
      counts[g] = (counts[g] || 0) + 1;
    });

    const sortedGroups = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return sortedGroups;
  }, [channels]);

  // Filter channels based on tab, group, and query
  const filteredChannels = useMemo(() => {
    let list = channels;

    if (selectedGroup === 'FAVORITES') {
      list = channels.filter((c) => favorites.includes(c.id));
    } else if (selectedGroup === 'RECENT') {
      list = recentlyPlayed;
    } else if (selectedGroup === 'RADIO') {
      list = channels.filter((c) => c.isRadio);
    } else if (selectedGroup !== 'ALL') {
      list = channels.filter((c) => (c.group || 'General') === selectedGroup);
    }

    if (!searchQuery.trim()) return list;

    const query = searchQuery.toLowerCase().trim();
    return list.filter(
      (c) =>
        c.name.toLowerCase().includes(query) ||
        (c.group && c.group.toLowerCase().includes(query)) ||
        (c.tvgId && c.tvgId.toLowerCase().includes(query))
    );
  }, [channels, selectedGroup, favorites, recentlyPlayed, searchQuery]);

  const visibleChannels = useMemo(() => {
    return filteredChannels.slice(0, pageLimit);
  }, [filteredChannels, pageLimit]);

  return (
    <div className="flex flex-col h-[40%] min-h-[145px] max-h-[44dvh] md:h-full md:max-h-none md:min-h-0 bg-slate-900 border-b md:border-b-0 md:border-r border-slate-800 w-full md:w-80 lg:w-96 min-w-0 flex-shrink-0 select-none">
      {/* Search Bar & View Mode Header */}
      <div className="p-3 border-b border-slate-800 space-y-2">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search channels, categories, IDs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                // Android keyboards send the Go/Search action as Enter. Filtering
                // is live, so consume the action and dismiss the keyboard cleanly.
                if (e.key === 'Enter' || e.key === 'Go' || e.key === 'Search') {
                  e.preventDefault();
                  e.currentTarget.blur();
                }
              }}
              enterKeyHint="search"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex items-center bg-slate-950 rounded-lg border border-slate-800 p-0.5">
            <button
              onClick={() => setIsGridView(false)}
              className={`p-1.5 rounded ${
                !isGridView ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="List View"
            >
              <ListIcon className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setIsGridView(true)}
              className={`p-1.5 rounded ${
                isGridView ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
              }`}
              title="Grid View"
            >
              <Grid className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Group Filter Tabs (Horizontally scrollable) */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
          <button
            onClick={() => setSelectedGroup('ALL')}
            className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              selectedGroup === 'ALL'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'bg-slate-950/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
            }`}
          >
            <Tv className="w-3 h-3" />
            <span>All</span>
            <span className="text-[10px] opacity-75">({channels.length})</span>
          </button>

          <button
            onClick={() => setSelectedGroup('FAVORITES')}
            className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              selectedGroup === 'FAVORITES'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'bg-slate-950/60 text-slate-400 hover:text-rose-400 hover:bg-slate-800'
            }`}
          >
            <Heart className="w-3 h-3 fill-current" />
            <span>Favorites</span>
            <span className="text-[10px] opacity-75">({favorites.length})</span>
          </button>

          <button
            onClick={() => setSelectedGroup('RECENT')}
            className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              selectedGroup === 'RECENT'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'bg-slate-950/60 text-slate-400 hover:text-amber-400 hover:bg-slate-800'
            }`}
          >
            <Clock className="w-3 h-3" />
            <span>Recent</span>
            <span className="text-[10px] opacity-75">({recentlyPlayed.length})</span>
          </button>

          <button
            onClick={() => setSelectedGroup('RADIO')}
            className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
              selectedGroup === 'RADIO'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-slate-950/60 text-slate-400 hover:text-emerald-400 hover:bg-slate-800'
            }`}
          >
            <Radio className="w-3 h-3" />
            <span>Radio</span>
          </button>

          {groupStats.map(([grp, count]) => (
            <button
              key={grp}
              onClick={() => setSelectedGroup(grp)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium whitespace-nowrap transition-colors flex items-center gap-1.5 ${
                selectedGroup === grp
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-950/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
            >
              <span>{grp}</span>
              <span className="text-[10px] opacity-75">({count})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Channels List / Grid Area */}
      <div className="flex-1 min-h-0 min-w-0 overflow-y-auto overscroll-contain p-2 space-y-1">
        {filteredChannels.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center text-slate-500 h-64">
            <Sparkles className="w-10 h-10 mb-2 stroke-[1.5] text-slate-600" />
            <p className="text-sm font-medium text-slate-400">No channels found</p>
            <p className="text-xs text-slate-500 mt-1">Try a different search keyword or category tab.</p>
          </div>
        ) : isGridView ? (
          /* Grid View Mode */
          <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-2">
            {visibleChannels.map((channel) => {
              const isSelected = selectedChannel?.id === channel.id;
              const isFav = favorites.includes(channel.id);

              return (
                <div
                  key={channel.id}
                  onClick={() => onSelectChannel(channel)}
                  className={`group relative p-2.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between h-28 ${
                    isSelected
                      ? 'bg-indigo-950/40 border-indigo-500 shadow-md ring-1 ring-indigo-500/50'
                      : 'bg-slate-950/60 border-slate-800/80 hover:bg-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-start justify-between gap-1">
                    <div className="w-9 h-9 rounded-lg bg-slate-900 border border-slate-800 p-1 flex items-center justify-center overflow-hidden flex-shrink-0">
                      {channel.logo ? (
                        <img
                          src={channel.logo}
                          alt=""
                          className="w-full h-full object-contain rounded-full"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      ) : channel.isRadio ? (
                        <Radio className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <Tv className="w-4 h-4 text-slate-500" />
                      )}
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleFavorite(channel.id);
                      }}
                      className={`p-1 rounded-md transition-colors ${
                        isFav
                          ? 'text-rose-400'
                          : 'text-slate-600 opacity-0 group-hover:opacity-100 hover:text-rose-400'
                      }`}
                    >
                      <Heart className={`w-3.5 h-3.5 ${isFav ? 'fill-current' : ''}`} />
                    </button>
                  </div>

                  <div>
                    <h5
                      className={`text-xs font-medium truncate ${
                        isSelected ? 'text-indigo-200 font-semibold' : 'text-slate-200'
                      }`}
                    >
                      {channel.name}
                    </h5>
                    <div className="flex items-center justify-between text-[10px] text-slate-500 mt-1">
                      <span className="truncate max-w-[80px]">{channel.group || 'Live'}</span>
                      {isSelected && (
                        <span className="flex items-center gap-1 text-emerald-400 font-bold">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                          PLAYING
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* List View Mode */
          <div className="space-y-1">
            {visibleChannels.map((channel) => {
              const isSelected = selectedChannel?.id === channel.id;
              const isFav = favorites.includes(channel.id);

              return (
                <div
                  key={channel.id}
                  onClick={() => onSelectChannel(channel)}
                  className={`group px-3 py-2 rounded-xl border cursor-pointer transition-all flex items-center justify-between gap-3 ${
                    isSelected
                      ? 'bg-indigo-950/50 border-indigo-500 text-white shadow-sm'
                      : 'bg-slate-950/40 border-slate-800/60 hover:bg-slate-800/70 hover:border-slate-700 text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-slate-950 border border-slate-600 p-1 flex items-center justify-center overflow-hidden flex-shrink-0 shadow-sm">
                      {channel.logo ? (
                        <img
                          src={channel.logo}
                          alt=""
                          className="w-full h-full object-contain"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      ) : channel.isRadio ? (
                        <Radio className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <Tv className="w-4 h-4 text-slate-500" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-xs font-medium truncate ${
                            isSelected ? 'text-indigo-200 font-semibold' : 'text-slate-200'
                          }`}
                        >
                          {channel.name}
                        </span>
                        {channel.isRadio && (
                          <span className="px-1 py-0.2 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            AUDIO
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500 truncate">{channel.group || 'General'}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleFavorite(channel.id);
                      }}
                      className={`p-1.5 rounded-lg transition-colors ${
                        isFav
                          ? 'text-rose-400'
                          : 'text-slate-600 opacity-0 group-hover:opacity-100 hover:text-rose-400'
                      }`}
                    >
                      <Heart className={`w-3.5 h-3.5 ${isFav ? 'fill-current' : ''}`} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Load more button if large playlist */}
        {filteredChannels.length > pageLimit && (
          <div className="pt-2 pb-1 text-center">
            <button
              onClick={() => setPageLimit((prev) => prev + 150)}
              className="w-full py-2 px-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 text-indigo-400 hover:text-indigo-300 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
            >
              <ChevronDown className="w-4 h-4" />
              <span>Load more ({pageLimit} of {filteredChannels.length} shown)</span>
            </button>
          </div>
        )}
      </div>

      {/* Footer Info */}
      <div className="p-2 border-t border-slate-800 text-[11px] text-slate-500 text-center flex items-center justify-between px-4">
        <span>
          Showing {Math.min(visibleChannels.length, filteredChannels.length)} of {filteredChannels.length} channels
        </span>
        <span>{favorites.length} favorited</span>
      </div>
    </div>
  );
};
