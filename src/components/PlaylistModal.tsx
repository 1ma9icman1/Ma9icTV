import React, { useState, useMemo } from 'react';
import {
  Upload,
  Link,
  FileText,
  Server,
  Layers,
  Trash2,
  Check,
  Plus,
  RefreshCw,
  Sparkles,
  AlertCircle,
  Search,
  Globe,
  Tv,
  Film,
  Zap,
  Play,
} from 'lucide-react';
import { Playlist, Channel } from '../types';
import { parseM3uString } from '../utils/playlistParser';
import { CATALOG_PLAYLISTS, CatalogPlaylist } from '../data/presetPlaylists';

function extractM3uEpgUrl(text: string): string | undefined {
  const header = text.split(/\r?\n/).find((line) => line.trim().startsWith('#EXTM3U')) || '';
  const match = header.match(/(?:url-tvg|x-tvg-url|tvg-url)\s*=\s*[\"']([^\"']+)[\"']/i);
  return match?.[1]?.trim() || undefined;
}

interface PlaylistModalProps {
  isOpen: boolean;
  onClose: () => void;
  playlists: Playlist[];
  activePlaylistId: string;
  onSelectPlaylist: (id: string) => void;
  onAddPlaylist: (playlist: Playlist) => void;
  onDeletePlaylist: (id: string) => void;
  onRefreshPlaylist?: (playlist: Playlist) => void;
}

export const PlaylistModal: React.FC<PlaylistModalProps> = ({
  isOpen,
  onClose,
  playlists,
  activePlaylistId,
  onSelectPlaylist,
  onAddPlaylist,
  onDeletePlaylist,
}) => {
  const [activeTab, setActiveTab] = useState<'catalog' | 'manage' | 'url' | 'file' | 'paste' | 'xtream'>('catalog');

  // Form states
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [userAgent, setUserAgent] = useState('');
  const [pastedText, setPastedText] = useState('');
  const [file, setFile] = useState<File | null>(null);

  // Xtream state
  const [xtreamServer, setXtreamServer] = useState('');
  const [xtreamUser, setXtreamUser] = useState('');
  const [xtreamPass, setXtreamPass] = useState('');

  // Catalog search & filter states
  const [catalogCategory, setCatalogCategory] = useState<'All' | 'Worldwide' | 'Streaming Services' | 'Countries' | 'Categories'>('All');
  const [catalogSearch, setCatalogSearch] = useState('');
  const [loadingItemUrl, setLoadingItemUrl] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filter catalog items
  const filteredCatalog = useMemo(() => {
    return CATALOG_PLAYLISTS.filter((item) => {
      const matchesCategory = catalogCategory === 'All' || item.category === catalogCategory;
      if (!matchesCategory) return false;
      if (!catalogSearch.trim()) return true;
      const q = catalogSearch.toLowerCase();
      return (
        item.name.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q)
      );
    }).sort((a, b) => {
      const order: Record<string, number> = { 'Streaming Services': 0, Worldwide: 1, Categories: 2, Countries: 3 };
      return (order[a.category] ?? 99) - (order[b.category] ?? 99);
    });
  }, [catalogCategory, catalogSearch]);

  if (!isOpen) return null;

  // Import a playlist by URL helper
  const importPlaylistByUrl = async (targetUrl: string, targetTitle?: string, customUA?: string, targetEpgUrl?: string) => {
    setIsLoading(true);
    setLoadingItemUrl(targetUrl);
    setErrorMsg(null);

    try {
      const playlistId = `pl-${Date.now()}`;
      const response = await fetch('/api/parse-playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: targetUrl.trim(),
          userAgent: customUA?.trim() || undefined,
        }),
      });

      if (!response.ok) {
        let reason = response.statusText || 'Request failed';
        try {
          const errorData = await response.json();
          reason = errorData?.error || errorData?.details || reason;
        } catch {
          // Keep the HTTP status text if the server did not return JSON.
        }
        throw new Error(`Failed to load playlist (HTTP ${response.status}): ${reason}`);
      }

      const data = await response.json();
      if (!data.items || data.items.length === 0) {
        throw new Error('Playlist contains no valid stream entries.');
      }

      const channels: Channel[] = data.items.map((item: any, idx: number) => ({
        id: `${playlistId}-ch-${idx}`,
        name: item.name || 'Unnamed Channel',
        url: item.url,
        // M3U group-title values can contain semicolon-separated labels.
        // Display those as clean category names instead of raw delimiters.
        group: String(item.group?.title || 'General')
          .split(';')
          .map((part: string) => part.trim())
          .filter(Boolean)
          .join(' / ') || 'General',
        logo: item.tvg?.logo || undefined,
        tvgId: item.tvg?.id || undefined,
        tvgName: item.tvg?.name || undefined,
        isRadio: item.radio === 'true' || item.url?.endsWith('.mp3'),
        httpUserAgent: item.httpUserAgent || undefined,
        httpReferrer: item.httpReferrer || undefined,
        raw: item.raw,
      }));

      const newPlaylist: Playlist = {
        id: playlistId,
        title: targetTitle || `Playlist (${channels.length} channels)`,
        url: targetUrl.trim(),
        type: 'm3u-url',
        channelCount: channels.length,
        addedAt: Date.now(),
        lastUpdated: Date.now(),
        userAgent: customUA?.trim() || undefined,
        epgUrl: data.header?.urlTvg || targetEpgUrl || undefined,
        channels,
      };

      onAddPlaylist(newPlaylist);
      onSelectPlaylist(playlistId);
      onClose();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err?.message || 'Failed to import playlist.');
    } finally {
      setIsLoading(false);
      setLoadingItemUrl(null);
    }
  };

  // Handle URL form submit
  const handleAddUrl = async () => {
    if (!url.trim()) return;
    await importPlaylistByUrl(url, title.trim() || undefined, userAgent);
  };

  // Handle 1-click catalog import
  const handleLoadCatalogItem = async (item: CatalogPlaylist) => {
    await importPlaylistByUrl(item.url, item.name, undefined, item.epgUrl);
  };

  // Handle local file upload
  const handleFileUpload = async () => {
    if (!file) return;
    setIsLoading(true);
    setErrorMsg(null);

    try {
      const text = await file.text();
      const playlistEpgUrl = extractM3uEpgUrl(text);
      const playlistId = `pl-file-${Date.now()}`;
      const channels = parseM3uString(text, playlistId);

      if (channels.length === 0) {
        throw new Error('No valid channel entries found in uploaded file.');
      }

      const newPlaylist: Playlist = {
        id: playlistId,
        title: title.trim() || file.name.replace(/\.[^/.]+$/, ''),
        type: 'm3u-file',
        channelCount: channels.length,
        addedAt: Date.now(),
        lastUpdated: Date.now(),
        epgUrl: playlistEpgUrl,
        channels,
      };

      onAddPlaylist(newPlaylist);
      onSelectPlaylist(playlistId);
      onClose();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err?.message || 'Failed to parse file.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle raw M3U text paste
  const handlePasteSubmit = () => {
    if (!pastedText.trim()) return;
    setIsLoading(true);
    setErrorMsg(null);

    try {
      const playlistId = `pl-paste-${Date.now()}`;
      const playlistEpgUrl = extractM3uEpgUrl(pastedText);
      const channels = parseM3uString(pastedText, playlistId);

      if (channels.length === 0) {
        throw new Error('No valid channels found in pasted text.');
      }

      const newPlaylist: Playlist = {
        id: playlistId,
        title: title.trim() || `Pasted M3U (${channels.length} channels)`,
        type: 'm3u-file',
        channelCount: channels.length,
        addedAt: Date.now(),
        lastUpdated: Date.now(),
        channels,
        epgUrl: playlistEpgUrl,
      };

      onAddPlaylist(newPlaylist);
      onSelectPlaylist(playlistId);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to parse pasted text.');
    } finally {
      setIsLoading(false);
    }
  };

  // Handle Xtream Codes Login
  const handleXtreamSubmit = async () => {
    if (!xtreamServer || !xtreamUser || !xtreamPass) {
      setErrorMsg('Please enter server URL, username, and password.');
      return;
    }
    setIsLoading(true);
    setErrorMsg(null);

    try {
      const response = await fetch('/api/xtream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serverUrl: xtreamServer.trim(),
          username: xtreamUser.trim(),
          password: xtreamPass.trim(),
          action: 'get_live_streams',
        }),
      });

      if (!response.ok) {
        throw new Error('Xtream server connection failed or invalid credentials.');
      }

      const streams = await response.json();
      if (!Array.isArray(streams)) {
        throw new Error('Unexpected response from Xtream server.');
      }

      const cleanServer = xtreamServer.trim().replace(/\/+$/, '');
      const playlistId = `pl-xtream-${Date.now()}`;

      const channels: Channel[] = streams.map((s: any, idx: number) => ({
        id: `${playlistId}-ch-${s.stream_id || idx}`,
        name: s.name || 'Channel',
        url: `${cleanServer}/live/${encodeURIComponent(xtreamUser.trim())}/${encodeURIComponent(xtreamPass.trim())}/${s.stream_id}.m3u8`,
        group: s.category_name || s.category_id || 'Live TV',
        logo: s.stream_icon || undefined,
        tvgId: s.epg_channel_id || undefined,
        tvgName: s.name || undefined,
        tvgChno: s.num ? String(s.num) : undefined,
      }));

      const newPlaylist: Playlist = {
        id: playlistId,
        title: title.trim() || `Xtream: ${new URL(cleanServer).hostname}`,
        url: cleanServer,
        type: 'xtream',
        channelCount: channels.length,
        addedAt: Date.now(),
        lastUpdated: Date.now(),
        channels,
      };

      onAddPlaylist(newPlaylist);
      onSelectPlaylist(playlistId);
      onClose();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err?.message || 'Failed to authenticate Xtream account.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/75 backdrop-blur-sm animate-fade-in select-none">
      <div className="bg-slate-900 border border-slate-800 rounded-xl sm:rounded-2xl w-full max-w-3xl min-w-0 overflow-hidden shadow-2xl flex flex-col h-[96dvh] max-h-[96dvh] sm:h-auto sm:max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-3 py-3 sm:px-6 sm:py-4 border-b border-slate-800 flex items-center justify-between gap-2 flex-shrink-0">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-semibold text-white">Playlists & Channel Catalog</h3>
              <p className="hidden sm:block text-xs text-slate-400">Browse worldwide IPTV collections, FAST services, or import custom M3U/Xtream</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors">
            ✕
          </button>
        </div>

        {/* Modal Navigation Tabs */}
        <div className="flex-shrink-0 flex border-b border-slate-800 bg-slate-950/50 px-2 sm:px-6 gap-1 sm:gap-2 overflow-x-auto no-scrollbar text-xs font-medium">
          <button
            onClick={() => setActiveTab('catalog')}
            className={`py-3 px-3 border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap ${
              activeTab === 'catalog' ? 'border-indigo-500 text-indigo-400 font-semibold' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-4 h-4 text-amber-400" />
            <span>Playlist Catalog ({CATALOG_PLAYLISTS.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('manage')}
            className={`py-3 px-3 border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap ${
              activeTab === 'manage' ? 'border-indigo-500 text-indigo-400 font-semibold' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>My Playlists ({playlists.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('url')}
            className={`py-3 px-3 border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap ${
              activeTab === 'url' ? 'border-indigo-500 text-indigo-400 font-semibold' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Link className="w-4 h-4" />
            <span>Custom URL</span>
          </button>

          <button
            onClick={() => setActiveTab('file')}
            className={`py-3 px-3 border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap ${
              activeTab === 'file' ? 'border-indigo-500 text-indigo-400 font-semibold' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Upload className="w-4 h-4" />
            <span>Upload File</span>
          </button>

          <button
            onClick={() => setActiveTab('paste')}
            className={`py-3 px-3 border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap ${
              activeTab === 'paste' ? 'border-indigo-500 text-indigo-400 font-semibold' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>Paste M3U</span>
          </button>

          <button
            onClick={() => setActiveTab('xtream')}
            className={`py-3 px-3 border-b-2 flex items-center gap-2 transition-colors whitespace-nowrap ${
              activeTab === 'xtream' ? 'border-indigo-500 text-indigo-400 font-semibold' : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Server className="w-4 h-4" />
            <span>Xtream Codes</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="min-h-0 min-w-0 p-3 sm:p-6 overflow-y-auto overscroll-contain flex-1">
          {errorMsg && (
            <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* 1. Catalog Explorer Tab */}
          {activeTab === 'catalog' && (
            <div className="space-y-4">
              {/* Category Pills & Search */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
                  {(['All', 'Streaming Services', 'Worldwide', 'Categories', 'Countries'] as const).map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setCatalogCategory(cat)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                        catalogCategory === cat
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>

                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    placeholder="Search catalog (e.g. Pluto, US, News)..."
                    value={catalogSearch}
                    onChange={(e) => setCatalogSearch(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* Catalog Items Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 sm:gap-3 max-h-[58dvh] sm:max-h-[50vh] overflow-y-auto overscroll-contain pr-1">
                {filteredCatalog.map((item, index) => {
                  const isCurrentItemLoading = loadingItemUrl === item.url;
                  const alreadyLoaded = playlists.some((p) => p.url === item.url);

                  return (
                    <React.Fragment key={item.url}>
                    {(index === 0 || item.category !== filteredCatalog[index - 1]?.category) && (
                      <div className="col-span-full flex items-center gap-2 pt-2 pb-1 border-b border-slate-800/80">
                        <span className="text-sm">{item.category === 'Worldwide' ? '🌍' : item.category === 'Streaming Services' ? '📺' : item.category === 'Countries' ? '🗺️' : '🎬'}</span>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">{item.category === 'Worldwide' ? 'Worldwide Playlists' : item.category}</h4>
                        <span className="text-[10px] text-slate-500">{filteredCatalog.filter((entry) => entry.category === item.category).length} lists</span>
                      </div>
                    )}
                    <div
                      className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 hover:border-slate-700 flex flex-col justify-between gap-3 transition-colors"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            {item.flag && <span className="text-base">{item.flag}</span>}
                            <h5 className="text-xs font-bold text-white truncate">{item.name}</h5>
                          </div>
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 whitespace-nowrap flex-shrink-0">
                            {item.channelEstimate || item.category}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                          {item.description}
                        </p>
                      </div>

                      <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800/60">
                        <span className="text-[10px] text-slate-500 font-mono truncate max-w-[180px]">
                          {item.url.replace('https://', '')}
                        </span>

                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {alreadyLoaded && (
                            <button
                              onClick={() => {
                                const match = playlists.find((p) => p.url === item.url);
                                if (match) {
                                  onSelectPlaylist(match.id);
                                  onClose();
                                }
                              }}
                              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 transition-all shadow-sm active:scale-95"
                              title="Switch to this playlist and open EPG guide"
                            >
                              <Play className="w-3.5 h-3.5 fill-current" />
                              <span>Open Guide</span>
                            </button>
                          )}

                          <button
                            disabled={isLoading}
                            onClick={() => handleLoadCatalogItem(item)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm active:scale-95 ${
                              alreadyLoaded
                                ? 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                                : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                            }`}
                          >
                            {isCurrentItemLoading ? (
                              <>
                                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                <span>Loading...</span>
                              </>
                            ) : alreadyLoaded ? (
                              <>
                                <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
                                <span>Update</span>
                              </>
                            ) : (
                              <>
                                <Plus className="w-3.5 h-3.5" />
                                <span>Load Playlist</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
          )}

          {/* 2. My Playlists Tab */}
          {activeTab === 'manage' && (
            <div className="space-y-3">
              {playlists.map((pl) => {
                const isActive = pl.id === activePlaylistId;
                return (
                  <div
                    key={pl.id}
                    className={`p-4 rounded-xl border flex items-center justify-between gap-4 transition-all ${
                      isActive
                        ? 'bg-indigo-950/40 border-indigo-500/80 shadow-md ring-1 ring-indigo-500/40'
                        : 'bg-slate-950/40 border-slate-800 hover:bg-slate-800/60'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h4 className="text-sm font-semibold text-white truncate">{pl.title}</h4>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700 uppercase">
                          {pl.type}
                        </span>
                        {isActive && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                            <Check className="w-2.5 h-2.5" /> ACTIVE
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        {pl.channelCount} channels • Added {new Date(pl.addedAt).toLocaleDateString()}
                      </p>
                      {pl.url && <p className="text-[11px] text-slate-500 font-mono truncate mt-0.5">{pl.url}</p>}
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {!isActive && (
                        <button
                          onClick={() => onSelectPlaylist(pl.id)}
                          className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-all shadow-sm active:scale-95"
                        >
                          Switch
                        </button>
                      )}

                      {playlists.length > 1 && (
                        <button
                          onClick={() => onDeletePlaylist(pl.id)}
                          className="p-2 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                          title="Delete Playlist"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}

              <div className="pt-2">
                <button
                  onClick={() => setActiveTab('catalog')}
                  className="w-full py-3 rounded-xl border border-dashed border-slate-700 text-slate-400 hover:text-white hover:border-indigo-500 text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
                >
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  Explore Catalog to Add More Playlists
                </button>
              </div>
            </div>
          )}

          {/* 3. Custom URL Tab */}
          {activeTab === 'url' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Playlist Name (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. My Premium IPTV"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Playlist URL <span className="text-indigo-400">*</span>
                </label>
                <input
                  type="url"
                  placeholder="https://example.com/live/playlist.m3u8"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
                <p className="text-[11px] text-slate-500 mt-1">Supports HTTP, HTTPS, M3U and M3U8 URLs (including gzipped playlists).</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Custom User-Agent (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. VLC/3.0.18 LibVLC/3.0.18"
                  value={userAgent}
                  onChange={(e) => setUserAgent(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="pt-2">
                <button
                  disabled={isLoading || !url.trim()}
                  onClick={handleAddUrl}
                  className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-md active:scale-95"
                >
                  {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  <span>{isLoading ? 'Downloading & Parsing...' : 'Import Playlist URL'}</span>
                </button>
              </div>
            </div>
          )}

          {/* 4. Upload File Tab */}
          {activeTab === 'file' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Playlist Name (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Local Sports M3U"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Select .m3u / .m3u8 file</label>
                <input
                  type="file"
                  accept=".m3u,.m3u8,.txt"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-indigo-600 file:text-white hover:file:bg-indigo-500 cursor-pointer bg-slate-950 border border-slate-800 rounded-xl p-2"
                />
              </div>

              <div className="pt-2">
                <button
                  disabled={isLoading || !file}
                  onClick={handleFileUpload}
                  className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-md active:scale-95"
                >
                  {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  <span>{isLoading ? 'Parsing File...' : 'Upload & Import Channels'}</span>
                </button>
              </div>
            </div>
          )}

          {/* 5. Paste M3U Tab */}
          {activeTab === 'paste' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Playlist Name</label>
                <input
                  type="text"
                  placeholder="e.g. My Quick Paste"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Raw M3U Content</label>
                <textarea
                  rows={8}
                  placeholder="#EXTM3U&#10;#EXTINF:-1 tvg-id=&quot;cnn&quot; group-title=&quot;News&quot;, CNN HD&#10;https://example.com/stream.m3u8"
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-mono text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <button
                  disabled={isLoading || !pastedText.trim()}
                  onClick={handlePasteSubmit}
                  className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-md active:scale-95"
                >
                  <Plus className="w-4 h-4" />
                  <span>Parse and Save</span>
                </button>
              </div>
            </div>
          )}

          {/* 6. Xtream Codes Tab */}
          {activeTab === 'xtream' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Playlist / Server Name (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Xtream VIP Portal"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Server URL <span className="text-indigo-400">*</span>
                </label>
                <input
                  type="url"
                  placeholder="http://iptv.provider.com:8080"
                  value={xtreamServer}
                  onChange={(e) => setXtreamServer(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">Username</label>
                  <input
                    type="text"
                    placeholder="user123"
                    value={xtreamUser}
                    onChange={(e) => setXtreamUser(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">Password</label>
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={xtreamPass}
                    onChange={(e) => setXtreamPass(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  disabled={isLoading || !xtreamServer || !xtreamUser || !xtreamPass}
                  onClick={handleXtreamSubmit}
                  className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-md active:scale-95"
                >
                  {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Server className="w-4 h-4" />}
                  <span>{isLoading ? 'Authenticating & Fetching Streams...' : 'Connect Xtream Codes Account'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
