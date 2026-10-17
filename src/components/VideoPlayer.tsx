import React, { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  Radio,
  Tv,
  RefreshCw,
  ExternalLink,
  Sliders,
  Check,
  AlertCircle,
  SkipBack,
  SkipForward,
  Compass,
  Zap,
} from 'lucide-react';
import { Channel, AppSettings } from '../types';

interface VideoPlayerProps {
  channel: Channel | null;
  settings: AppSettings;
  onNextChannel?: () => void;
  onPrevChannel?: () => void;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  channel,
  settings,
  onNextChannel,
  onPrevChannel,
  isFavorite,
  onToggleFavorite,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(settings.volume);
  const [isMuted, setIsMuted] = useState<boolean>(settings.muted);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isUsingProxy, setIsUsingProxy] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [aspectRatio, setAspectRatio] = useState<'contain' | 'cover' | '16/9' | '4/3'>('contain');
  const [qualities, setQualities] = useState<{ id: number; height: number; bitrate: number; name: string }[]>([]);
  const [currentQuality, setCurrentQuality] = useState<number>(-1); // -1 = auto
  const [showQualityMenu, setShowQualityMenu] = useState<boolean>(false);
  const [showStats, setShowStats] = useState<boolean>(false);
  const [stats, setStats] = useState<{ resolution: string; bitrate: string; buffer: string }>({
    resolution: 'Unknown',
    bitrate: 'Auto',
    buffer: '0s',
  });

  // Calculate stream URL according to proxy settings
  const getStreamUrl = useCallback(
    (originalUrl: string, forceProxy: boolean = false) => {
      if (settings.proxyMode === 'always' || forceProxy) {
        return `/api/proxy?url=${encodeURIComponent(originalUrl)}&userAgent=${encodeURIComponent(settings.customUserAgent)}`;
      }
      return originalUrl;
    },
    [settings.proxyMode, settings.customUserAgent]
  );

  // Initialize playback
  const initPlayer = useCallback(
    (useProxy: boolean = false) => {
      if (!channel || !videoRef.current) return;

      const video = videoRef.current;
      setErrorMsg(null);
      setIsLoading(true);
      setIsUsingProxy(useProxy);
      setQualities([]);
      setCurrentQuality(-1);

      // Clean up previous HLS instance
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }

      // Determine if proxy should be used (always proxy unless user explicitly configured direct)
      const shouldProxy = settings.proxyMode !== 'direct' || useProxy;
      const streamUrl = shouldProxy
        ? `/api/proxy?url=${encodeURIComponent(channel.url)}&userAgent=${encodeURIComponent(settings.customUserAgent)}`
        : channel.url;

      setIsUsingProxy(shouldProxy);

      const isHlsStream = streamUrl.includes('.m3u8') || !channel.isRadio;

      if (isHlsStream && Hls.isSupported()) {
        const hls = new Hls({
          maxBufferLength: settings.bufferLengthSeconds || 30,
          maxMaxBufferLength: 60,
          liveSyncDurationCount: 3,
          enableWorker: true,
          lowLatencyMode: false,
          backBufferLength: 30,
        });

        hlsRef.current = hls;
        hls.loadSource(streamUrl);
        hls.attachMedia(video);

        let networkRetries = 0;
        let mediaRetries = 0;

        hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
          setIsLoading(false);
          const levels = data.levels.map((lvl, index) => ({
            id: index,
            height: lvl.height,
            bitrate: lvl.bitrate,
            name: lvl.height ? `${lvl.height}p` : `${Math.round(lvl.bitrate / 1000)}k`,
          }));
          setQualities(levels);
          const playPromise = video.play();
          if (playPromise !== undefined) {
            playPromise
              .then(() => setIsPlaying(true))
              .catch(() => {
                // Autoplay with sound may be blocked by browser; retry muted
                video.muted = true;
                setIsMuted(true);
                video.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
              });
          }
        });

        hls.on(Hls.Events.LEVEL_SWITCHED, (_event, data) => {
          const level = hls.levels[data.level];
          if (level) {
            setStats((prev) => ({
              ...prev,
              resolution: `${level.width}x${level.height}`,
              bitrate: `${Math.round(level.bitrate / 1000)} kbps`,
            }));
          }
        });

        hls.on(Hls.Events.ERROR, (_event, data) => {
          console.warn('HLS Event Error:', data);
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                networkRetries++;
                if (networkRetries <= 2) {
                  console.log(`Network glitch, reloading stream (attempt ${networkRetries}/2)...`);
                  hls.startLoad();
                } else if (!shouldProxy) {
                  console.log('Retrying through internal CORS proxy...');
                  initPlayer(true);
                } else {
                  setErrorMsg('Network stream error. Host may be offline or stream source expired.');
                  hls.destroy();
                  setIsLoading(false);
                }
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                mediaRetries++;
                if (mediaRetries <= 2) {
                  console.log(`Media error, recovering (attempt ${mediaRetries}/2)...`);
                  hls.recoverMediaError();
                } else {
                  hls.destroy();
                  setErrorMsg(`Playback media format error (${data.details})`);
                  setIsLoading(false);
                }
                break;
              default:
                hls.destroy();
                setErrorMsg(`Playback failed (${data.details || 'Unknown error'})`);
                setIsLoading(false);
                break;
            }
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl') || !isHlsStream) {
        // Native HLS (Safari/iOS) or standard MP4/audio
        video.src = streamUrl;
        video.addEventListener('loadedmetadata', () => {
          setIsLoading(false);
          const playPromise = video.play();
          if (playPromise !== undefined) {
            playPromise.then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
          }
        });
        video.onerror = () => {
          if (!shouldProxy) {
            console.log('Native error, retrying via proxy...');
            initPlayer(true);
          } else {
            setErrorMsg('Unable to play stream format.');
            setIsLoading(false);
          }
        };
      } else {
        setErrorMsg('HLS playback is not supported in this browser.');
        setIsLoading(false);
      }
    },
    [channel, settings.bufferLengthSeconds, settings.proxyMode, settings.customUserAgent]
  );

  useEffect(() => {
    initPlayer(settings.proxyMode === 'always');
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [channel, initPlayer, settings.proxyMode]);

  // Audio visualizer for radio mode
  useEffect(() => {
    if (!channel?.isRadio || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let tick = 0;

    const draw = () => {
      tick++;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const bars = 36;
      const barWidth = canvas.width / bars;

      for (let i = 0; i < bars; i++) {
        const heightMultiplier = isPlaying ? Math.sin(tick * 0.08 + i * 0.4) * 0.4 + 0.6 : 0.1;
        const barHeight = (canvas.height * 0.7) * heightMultiplier;
        const x = i * barWidth;
        const y = canvas.height - barHeight;

        const gradient = ctx.createLinearGradient(0, y, 0, canvas.height);
        gradient.addColorStop(0, '#6366f1');
        gradient.addColorStop(1, '#a855f7');

        ctx.fillStyle = gradient;
        ctx.fillRect(x + 2, y, barWidth - 4, barHeight);
      }
      animId = requestAnimationFrame(draw);
    };

    draw();
    return () => cancelAnimationFrame(animId);
  }, [channel?.isRadio, isPlaying]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.code === 'KeyF') {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.code === 'KeyM') {
        e.preventDefault();
        toggleMute();
      } else if (e.code === 'ArrowUp') {
        e.preventDefault();
        handleVolumeChange(Math.min(1, volume + 0.05));
      } else if (e.code === 'ArrowDown') {
        e.preventDefault();
        handleVolumeChange(Math.max(0, volume - 0.05));
      } else if (e.code === 'BracketRight') {
        e.preventDefault();
        onNextChannel?.();
      } else if (e.code === 'BracketLeft') {
        e.preventDefault();
        onPrevChannel?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [volume, onNextChannel, onPrevChannel]);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().then(() => setIsPlaying(true)).catch(console.error);
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    const nextMuted = !isMuted;
    videoRef.current.muted = nextMuted;
    setIsMuted(nextMuted);
  };

  const handleVolumeChange = (newVal: number) => {
    if (!videoRef.current) return;
    videoRef.current.volume = newVal;
    setVolume(newVal);
    if (newVal > 0 && isMuted) {
      videoRef.current.muted = false;
      setIsMuted(false);
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(console.error);
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(console.error);
    }
  };

  const selectQuality = (levelIndex: number) => {
    if (!hlsRef.current) return;
    hlsRef.current.currentLevel = levelIndex;
    setCurrentQuality(levelIndex);
    setShowQualityMenu(false);
  };

  if (!channel) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-slate-950 p-8 text-center text-slate-400">
        <div className="w-20 h-20 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-500 mb-4 shadow-xl">
          <Tv className="w-10 h-10 stroke-[1.5]" />
        </div>
        <h3 className="text-xl font-semibold text-slate-200 mb-2">No Channel Selected</h3>
        <p className="max-w-md text-sm text-slate-400 mb-6">
          Pick a live channel from the channel list, search by name, or import an M3U / Xtream playlist.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative flex-1 flex flex-col bg-black overflow-hidden group select-none"
    >
      {/* Video Element */}
      <div className="relative flex-1 flex items-center justify-center bg-black overflow-hidden">
        {channel.isRadio ? (
          <div className="flex flex-col items-center justify-center p-8 z-10 w-full max-w-lg">
            <div className="relative w-44 h-44 rounded-2xl overflow-hidden bg-slate-900 border-2 border-indigo-500/30 shadow-2xl flex items-center justify-center mb-6">
              {channel.logo ? (
                <img
                  src={channel.logo}
                  alt={channel.name}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              ) : (
                <Radio className="w-20 h-20 text-indigo-400 animate-pulse" />
              )}
              <div className="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-indigo-600/90 text-[10px] font-bold text-white uppercase tracking-wider">
                Radio Live
              </div>
            </div>
            <h2 className="text-2xl font-bold text-white text-center mb-1">{channel.name}</h2>
            <p className="text-xs text-indigo-400 font-medium mb-6 uppercase tracking-wider">{channel.group || 'Online Audio Station'}</p>
            <canvas ref={canvasRef} width={360} height={70} className="w-full max-w-sm rounded-lg opacity-90" />
          </div>
        ) : null}

        <video
          ref={videoRef}
          className={`w-full h-full object-contain ${
            channel.isRadio ? 'hidden' : ''
          } ${
            aspectRatio === 'cover'
              ? 'object-cover'
              : aspectRatio === '16/9'
              ? 'aspect-video object-contain'
              : aspectRatio === '4/3'
              ? 'aspect-[4/3] object-contain'
              : 'object-contain'
          }`}
          playsInline
          onTimeUpdate={() => {
            if (videoRef.current && videoRef.current.buffered.length > 0) {
              const buf = videoRef.current.buffered.end(videoRef.current.buffered.length - 1) - videoRef.current.currentTime;
              setStats((prev) => ({ ...prev, buffer: `${Math.max(0, Math.round(buf))}s` }));
            }
          }}
        />

        {/* Loading Spinner */}
        {isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm z-20">
            <RefreshCw className="w-10 h-10 text-indigo-400 animate-spin mb-3" />
            <p className="text-sm font-medium text-slate-200">Buffering stream...</p>
          </div>
        )}

        {/* Error Overlay with Proxy Retry & Skip to Next */}
        {errorMsg && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/95 backdrop-blur-md p-6 text-center z-30 select-none">
            <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mb-4 shadow-lg">
              <AlertCircle className="w-8 h-8" />
            </div>
            <h4 className="text-lg font-bold text-white mb-1.5">Stream Unavailable</h4>
            <p className="max-w-md text-xs text-slate-300 mb-2 leading-relaxed">
              {errorMsg}
            </p>
            <p className="max-w-md text-[11px] text-slate-500 mb-6">
              Public IPTV broadcast streams frequently change or experience downtime. Use the Anti-CORS proxy or switch to verified channels like <span className="text-indigo-400 font-medium">DW News, Red Bull TV, A2 CNN, News 24, or Pluto TV</span>.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              {onNextChannel && (
                <button
                  onClick={onNextChannel}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-2 transition-all shadow-md active:scale-95"
                >
                  <SkipForward className="w-4 h-4" />
                  Skip to Next Channel
                </button>
              )}
              <button
                onClick={() => initPlayer(true)}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-2 transition-all border border-slate-700"
              >
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                Retry with CORS Proxy
              </button>
              <button
                onClick={() => initPlayer(false)}
                className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-medium flex items-center gap-1.5 transition-colors border border-slate-800"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Reload
              </button>
              <a
                href={channel.url}
                target="_blank"
                rel="noreferrer"
                className="px-3.5 py-2 rounded-xl border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white text-xs font-medium flex items-center gap-1.5 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Open Source
              </a>
            </div>
          </div>
        )}

        {/* Top Channel Info Bar (fades on hover) */}
        <div className="absolute top-0 inset-x-0 p-4 bg-gradient-to-b from-black/80 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-between z-20">
          <div className="flex items-center gap-3">
            {channel.logo ? (
              <img
                src={channel.logo}
                alt=""
                className="w-8 h-8 object-contain rounded bg-slate-900 p-0.5 border border-slate-700"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            ) : null}
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-white text-sm tracking-tight">{channel.name}</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 uppercase">
                  {channel.group || 'Live'}
                </span>
                {isUsingProxy && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                    <Zap className="w-2.5 h-2.5" /> Proxy Active
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 font-mono truncate max-w-md">{channel.url}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onToggleFavorite && (
              <button
                onClick={onToggleFavorite}
                className={`p-2 rounded-lg backdrop-blur-md transition-all ${
                  isFavorite
                    ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                    : 'bg-black/50 text-slate-300 hover:text-white border border-white/10'
                }`}
                title="Toggle Favorite"
              >
                ★
              </button>
            )}
            <button
              onClick={() => setShowStats(!showStats)}
              className="p-2 rounded-lg bg-black/50 text-slate-300 hover:text-white border border-white/10 backdrop-blur-md text-xs font-mono"
              title="Stream Diagnostics"
            >
              Info
            </button>
          </div>
        </div>

        {/* Stats diagnostics popover */}
        {showStats && (
          <div className="absolute top-16 right-4 p-4 rounded-xl bg-slate-900/95 border border-slate-800 text-xs font-mono text-slate-300 z-30 shadow-2xl backdrop-blur-md w-64 space-y-2">
            <div className="font-bold text-white border-b border-slate-800 pb-1 flex items-center justify-between">
              <span>Stream Diagnostics</span>
              <button onClick={() => setShowStats(false)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Resolution:</span>
              <span className="text-white font-medium">{stats.resolution}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Current Bitrate:</span>
              <span className="text-white font-medium">{stats.bitrate}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Buffer Size:</span>
              <span className="text-emerald-400 font-medium">{stats.buffer}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Mode:</span>
              <span className="text-indigo-400 font-medium">{isUsingProxy ? 'Proxied (Anti-CORS)' : 'Direct'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Engine:</span>
              <span className="text-slate-300">Hls.js {Hls.version}</span>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Controls Bar */}
      <div className="bg-slate-950/95 border-t border-slate-800 px-4 py-3 flex items-center justify-between gap-4 z-20">
        <div className="flex items-center gap-2">
          {/* Prev channel */}
          {onPrevChannel && (
            <button
              onClick={onPrevChannel}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="Previous Channel ([)"
            >
              <SkipBack className="w-4 h-4" />
            </button>
          )}

          {/* Play / Pause */}
          <button
            onClick={togglePlay}
            className="p-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition-all shadow-md active:scale-95"
            title="Play / Pause (Space)"
          >
            {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
          </button>

          {/* Next channel */}
          {onNextChannel && (
            <button
              onClick={onNextChannel}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="Next Channel (])"
            >
              <SkipForward className="w-4 h-4" />
            </button>
          )}

          {/* Volume */}
          <div className="flex items-center gap-2 ml-2">
            <button
              onClick={toggleMute}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              title="Mute / Unmute (M)"
            >
              {isMuted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={isMuted ? 0 : volume}
              onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
              className="w-20 accent-indigo-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
            />
          </div>

          <div className="hidden sm:flex items-center gap-2 ml-3 pl-3 border-l border-slate-800">
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
            <span className="text-[11px] font-bold tracking-wider text-slate-300 uppercase">LIVE</span>
          </div>
        </div>

        {/* Right side controls */}
        <div className="flex items-center gap-2 relative">
          {/* Quality selector */}
          {qualities.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowQualityMenu(!showQualityMenu)}
                className="px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 flex items-center gap-1.5 transition-colors"
              >
                <Sliders className="w-3.5 h-3.5 text-indigo-400" />
                <span>{currentQuality === -1 ? 'Auto' : qualities[currentQuality]?.name || 'HD'}</span>
              </button>

              {showQualityMenu && (
                <div className="absolute bottom-full right-0 mb-2 w-36 rounded-xl bg-slate-900 border border-slate-800 shadow-2xl py-1 z-50 text-xs">
                  <button
                    onClick={() => selectQuality(-1)}
                    className="w-full px-3 py-1.5 text-left flex items-center justify-between hover:bg-slate-800 text-slate-200"
                  >
                    <span>Auto (Adaptive)</span>
                    {currentQuality === -1 && <Check className="w-3.5 h-3.5 text-indigo-400" />}
                  </button>
                  {qualities.map((lvl) => (
                    <button
                      key={lvl.id}
                      onClick={() => selectQuality(lvl.id)}
                      className="w-full px-3 py-1.5 text-left flex items-center justify-between hover:bg-slate-800 text-slate-200"
                    >
                      <span>{lvl.name}</span>
                      {currentQuality === lvl.id && <Check className="w-3.5 h-3.5 text-indigo-400" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Aspect Ratio */}
          <button
            onClick={() => {
              const modes: ('contain' | 'cover' | '16/9' | '4/3')[] = ['contain', 'cover', '16/9', '4/3'];
              const nextIdx = (modes.indexOf(aspectRatio) + 1) % modes.length;
              setAspectRatio(modes[nextIdx]);
            }}
            className="px-2 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors flex items-center gap-1"
            title="Cycle Aspect Ratio"
          >
            <Compass className="w-3.5 h-3.5" />
            <span className="uppercase text-[10px]">{aspectRatio}</span>
          </button>

          {/* Reload / Re-sync */}
          <button
            onClick={() => initPlayer(isUsingProxy)}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Reload Stream"
          >
            <RefreshCw className="w-4 h-4" />
          </button>

          {/* Fullscreen */}
          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Fullscreen (F)"
          >
            {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
};
