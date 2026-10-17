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
  Zap,
  Info,
  Maximize2,
} from 'lucide-react';
import { Channel, AppSettings } from '../types';

interface VideoPlayerProps {
  channel: Channel | null;
  settings: AppSettings;
  onNextChannel?: () => void;
  onPrevChannel?: () => void;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  mode?: 'full' | 'compact' | 'epg-preview';
  onExpandPlayer?: () => void;
  onStreamConnected?: () => void;
}

// Detect YouTube or Twitch embeds for channels in public IPTV playlists
function getThirdPartyEmbed(url: string): { type: 'youtube' | 'twitch' | null; embedUrl: string } {
  if (!url) return { type: null, embedUrl: '' };

  // YouTube Live or Watch
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    const watchMatch = url.match(/[?&]v=([^&]+)/);
    if (watchMatch) {
      return {
        type: 'youtube',
        embedUrl: `https://www.youtube-nocookie.com/embed/${watchMatch[1]}?autoplay=1&mute=0`,
      };
    }
    const shortMatch = url.match(/youtu\.be\/([^?&/]+)/);
    if (shortMatch) {
      return {
        type: 'youtube',
        embedUrl: `https://www.youtube-nocookie.com/embed/${shortMatch[1]}?autoplay=1&mute=0`,
      };
    }
    const liveMatch = url.match(/youtube\.com\/live\/([^?&/]+)/);
    if (liveMatch) {
      return {
        type: 'youtube',
        embedUrl: `https://www.youtube-nocookie.com/embed/${liveMatch[1]}?autoplay=1&mute=0`,
      };
    }
    // Channel live handle, e.g. @EuronewsAlbania/live
    const handleMatch = url.match(/youtube\.com\/@([^/?&]+)/);
    if (handleMatch) {
      return {
        type: 'youtube',
        embedUrl: `https://www.youtube.com/embed/live_stream?channel=${handleMatch[1]}&autoplay=1`,
      };
    }
  }

  // Twitch Stream
  if (url.includes('twitch.tv/')) {
    const channelName = url.split('twitch.tv/')[1]?.split(/[/?#]/)[0];
    if (channelName) {
      const hostname = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
      return {
        type: 'twitch',
        embedUrl: `https://player.twitch.tv/?channel=${channelName}&parent=${hostname}&autoplay=true&muted=false`,
      };
    }
  }

  return { type: null, embedUrl: '' };
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({
  channel,
  settings,
  onNextChannel,
  onPrevChannel,
  isFavorite,
  onToggleFavorite,
  mode = 'full',
  onExpandPlayer,
  onStreamConnected,
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  // Keep audio enabled by default across channel changes. Browser autoplay rules may
  // require a user click, but we never silently switch the player into muted mode.
  const [volume, setVolume] = useState<number>(settings.volume > 0 ? settings.volume : 0.8);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const volumeRef = useRef<number>(settings.volume > 0 ? settings.volume : 0.8);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isUsingProxy, setIsUsingProxy] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [aspectRatio, setAspectRatio] = useState<'contain' | 'cover' | '16/9' | '4/3'>('contain');
  const [qualities, setQualities] = useState<{ id: number; height: number; bitrate: number; name: string }[]>([]);
  const [currentQuality, setCurrentQuality] = useState<number>(-1); // -1 = auto
  const [showQualityMenu, setShowQualityMenu] = useState<boolean>(false);
  const [showStats, setShowStats] = useState<boolean>(false);
  const [autoSkipCountdown, setAutoSkipCountdown] = useState<number | null>(null);

  const [stats, setStats] = useState<{ resolution: string; bitrate: string; buffer: string }>({
    resolution: 'Unknown',
    bitrate: 'Auto',
    buffer: '0s',
  });

  const embedInfo = channel ? getThirdPartyEmbed(channel.url) : { type: null, embedUrl: '' };

  // Countdown timer for automatic advance on error
  useEffect(() => {
    if (autoSkipCountdown === null) return;
    if (autoSkipCountdown <= 0) {
      setAutoSkipCountdown(null);
      if (onNextChannel) {
        onNextChannel();
      }
      return;
    }

    const timer = setTimeout(() => {
      setAutoSkipCountdown((prev) => (prev !== null ? prev - 1 : null));
    }, 1000);

    return () => clearTimeout(timer);
  }, [autoSkipCountdown, onNextChannel]);

  // Initialize playback
  const initPlayer = useCallback(
    (forceProxy?: boolean) => {
      if (!channel) return;
      setAutoSkipCountdown(null);

      // Check if YouTube or Twitch embed
      const thirdParty = getThirdPartyEmbed(channel.url);
      if (thirdParty.type !== null) {
        setErrorMsg(null);
        setIsLoading(false);
        setIsPlaying(true);
        return;
      }

      if (!videoRef.current) return;
      const video = videoRef.current;
      // Stop and detach the previous channel before attaching the new stream.
      // Reusing stale media state can leave the player looking idle after a channel click.
      video.pause();
      video.onloadedmetadata = null;
      video.onerror = null;
      video.removeAttribute('src');
      video.load();
      video.muted = false;
      video.volume = Math.max(0.01, volumeRef.current);
      setIsMuted(false);
      setIsPlaying(false);
      setErrorMsg(null);
      setIsLoading(true);
      setQualities([]);
      setCurrentQuality(-1);

      // Clean up previous HLS instance
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }

      // In web browsers, CORS proxy is required for 95% of IPTV streams unless explicitly forced direct
      const shouldProxy = forceProxy !== undefined ? forceProxy : settings.proxyMode !== 'direct';
      setIsUsingProxy(shouldProxy);

      const streamUrl = shouldProxy
        ? `/api/proxy?url=${encodeURIComponent(channel.url)}&userAgent=${encodeURIComponent(settings.customUserAgent)}`
        : channel.url;

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

          video.volume = Math.max(0.01, volumeRef.current);
          video.muted = false;
          setIsMuted(false);

          const playPromise = video.play();
          if (playPromise !== undefined) {
            playPromise
              .then(() => setIsPlaying(true))
              .catch(() => {
                // Do not retry muted: leave audio enabled and let the user start playback.
                video.muted = false;
                setIsMuted(false);
                setIsPlaying(false);
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
          console.warn('HLS Event Error:', data.type, data.details);
          if (data.fatal) {
            switch (data.type) {
              case Hls.ErrorTypes.NETWORK_ERROR:
                networkRetries++;
                if (networkRetries <= 2) {
                  hls.startLoad();
                } else if (!shouldProxy) {
                  // Direct connection blocked by CORS or host firewall; retry via internal proxy
                  initPlayer(true);
                } else {
                  hls.destroy();
                  setErrorMsg('Stream host may be offline, geo-restricted, or blocking direct access.');
                  setIsLoading(false);
                  if (settings.autoPlayNext && onNextChannel) {
                    setAutoSkipCountdown(4);
                  }
                }
                break;
              case Hls.ErrorTypes.MEDIA_ERROR:
                mediaRetries++;
                if (mediaRetries <= 2) {
                  hls.recoverMediaError();
                } else {
                  hls.destroy();
                  setErrorMsg(`Media format incompatibility (${data.details})`);
                  setIsLoading(false);
                  if (settings.autoPlayNext && onNextChannel) {
                    setAutoSkipCountdown(4);
                  }
                }
                break;
              default:
                hls.destroy();
                setErrorMsg(`Stream playback encountered an error (${data.details || 'Unknown'})`);
                setIsLoading(false);
                if (settings.autoPlayNext && onNextChannel) {
                  setAutoSkipCountdown(4);
                }
                break;
            }
          }
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl') || !isHlsStream) {
        // Native Safari HLS or direct audio/mp4 stream
        video.src = streamUrl;
        video.volume = Math.max(0.01, volume);
        video.muted = false;
        setIsMuted(false);

        video.onloadedmetadata = () => {
          setIsLoading(false);
          const playPromise = video.play();
          if (playPromise !== undefined) {
            playPromise.then(() => setIsPlaying(true)).catch(() => {
              // Leave the player in its ready state; the visible Play Channel button
              // retries playback directly from a user gesture without muting audio.
              setIsPlaying(false);
            });
          }
        };

        video.onerror = () => {
          if (!shouldProxy) {
            initPlayer(true);
          } else {
            setErrorMsg('Host may be blocking direct access or stream link has expired.');
            setIsLoading(false);
            if (settings.autoPlayNext && onNextChannel) {
              setAutoSkipCountdown(4);
            }
          }
        };
      } else {
        setErrorMsg('HLS playback is not supported in this browser.');
        setIsLoading(false);
      }
    },
    [channel, settings.bufferLengthSeconds, settings.proxyMode, settings.customUserAgent, settings.autoPlayNext, onNextChannel]
  );

  useEffect(() => {
    initPlayer();
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [channel, initPlayer]);

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
      const bars = 28;
      const barWidth = canvas.width / bars;

      for (let i = 0; i < bars; i++) {
        const heightMultiplier = isPlaying ? Math.sin(tick * 0.08 + i * 0.4) * 0.4 + 0.6 : 0.1;
        const barHeight = canvas.height * 0.7 * heightMultiplier;
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

  // Keyboard controls
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

  const handleVolumeChange = (newVol: number) => {
    const safeVolume = Math.max(0.05, Math.min(1, newVol));
    setVolume(safeVolume);
    volumeRef.current = safeVolume;
    setIsMuted(false);
    if (videoRef.current) {
      videoRef.current.volume = safeVolume;
      videoRef.current.muted = false;
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    videoRef.current.muted = nextMute;
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(console.error);
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(console.error);
    }
  };

  const handleSelectQuality = (qualityId: number) => {
    if (!hlsRef.current) return;
    hlsRef.current.currentLevel = qualityId;
    setCurrentQuality(qualityId);
    setShowQualityMenu(false);
  };

  if (!channel) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-slate-950 text-slate-500 p-8 select-none">
        <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center mb-4 text-slate-600">
          <Tv className="w-8 h-8 stroke-[1.5]" />
        </div>
        <h3 className="text-base font-semibold text-slate-300 mb-1">No Channel Selected</h3>
        <p className="text-xs text-slate-500 max-w-sm text-center">
          Choose a channel from the guide or playlist catalog to start watching live TV.
        </p>
      </div>
    );
  }

  const isEpgPreview = mode === 'epg-preview';

  return (
    <div
      ref={containerRef}
      className={`relative bg-black flex items-center justify-center overflow-hidden select-none group ${
        isEpgPreview
          ? 'w-full h-full rounded-2xl border border-slate-800 shadow-2xl'
          : 'flex-1 w-full h-full'
      }`}
    >
      {/* 1. Third Party Embed (YouTube Live / Twitch) */}
      {embedInfo.type !== null ? (
        <div className="w-full h-full flex items-center justify-center bg-black relative">
          <iframe
            onLoad={onStreamConnected}
            src={embedInfo.embedUrl}
            title={channel.name}
            className="w-full h-full border-0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
          {/* Header Tag */}
          <div className="absolute top-2 left-2 z-10 pointer-events-none">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-600 text-white flex items-center gap-1 shadow-md">
              <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>
              {embedInfo.type.toUpperCase()} LIVE
            </span>
          </div>
        </div>
      ) : (
        /* 2. HTML5 HLS Video Element */
        <>
          <video
            ref={videoRef}
            className={`w-full h-full ${
              aspectRatio === 'contain'
                ? 'object-contain'
                : aspectRatio === 'cover'
                ? 'object-cover'
                : aspectRatio === '16/9'
                ? 'aspect-video object-fill'
                : 'aspect-[4/3] object-fill'
            }`}
            playsInline
            autoPlay
            preload="auto"
            onPlaying={() => {
              setIsPlaying(true);
              onStreamConnected?.();
            }}
            onPause={() => setIsPlaying(false)}
            onTimeUpdate={() => {
              if (videoRef.current && videoRef.current.buffered.length > 0) {
                const buf =
                  videoRef.current.buffered.end(videoRef.current.buffered.length - 1) -
                  videoRef.current.currentTime;
                setStats((prev) => ({ ...prev, buffer: `${Math.max(0, Math.round(buf))}s` }));
              }
            }}
          />



          {/* Radio Audio Visualizer */}
          {channel.isRadio && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-indigo-950/60 to-slate-950 z-10 p-6 pointer-events-none">
              <div className="w-20 h-20 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400 mb-4 shadow-xl">
                <Radio className="w-10 h-10 animate-pulse" />
              </div>
              <h3 className="text-lg font-bold text-white mb-1">{channel.name}</h3>
              <p className="text-xs text-indigo-300 font-medium mb-6">Live Digital Radio Broadcast</p>
              <canvas ref={canvasRef} width={340} height={70} className="w-80 h-16" />
            </div>
          )}

          {/* Loading Spinner */}
          {isLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm z-20 pointer-events-none">
              <RefreshCw className="w-10 h-10 text-indigo-400 animate-spin mb-3" />
              <p className="text-xs font-semibold tracking-wide text-slate-200 uppercase">Connecting to Stream...</p>
            </div>
          )}

          {/* Error Overlay with Auto-Skip and Diagnostics */}
          {errorMsg && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/95 backdrop-blur-md p-6 text-center z-30 select-none">
              <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mb-3 shadow-lg">
                <AlertCircle className="w-7 h-7" />
              </div>
              <h4 className="text-base font-bold text-white mb-1">Stream Host Unavailable</h4>
              <p className="max-w-md text-xs text-slate-300 mb-2 leading-relaxed">
                {errorMsg}
              </p>
              <p className="max-w-md text-[11px] text-slate-400 mb-4">
                Public IPTV streams may change CDN endpoints or restrict direct access.
              </p>

              {/* Auto Skip Countdown banner */}
              {autoSkipCountdown !== null && (
                <div className="mb-4 px-3 py-1.5 rounded-lg bg-indigo-950/60 border border-indigo-500/40 text-xs text-indigo-200 flex items-center gap-2">
                  <span>Auto-advancing to next channel in <strong className="text-white font-mono">{autoSkipCountdown}s</strong></span>
                  <button
                    onClick={() => setAutoSkipCountdown(null)}
                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-300 ml-2"
                  >
                    Cancel
                  </button>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-center gap-2">
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
                  onClick={() => initPlayer(!isUsingProxy)}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-all border border-slate-700"
                >
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  {isUsingProxy ? 'Try Direct Connection' : 'Retry via Proxy'}
                </button>
                <button
                  onClick={() => initPlayer(true)}
                  className="px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 text-xs font-medium flex items-center gap-1.5 transition-colors border border-slate-800"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Reload
                </button>
                <a
                  href={channel.url}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-2 rounded-xl border border-slate-800 hover:bg-slate-800 text-slate-400 hover:text-white text-xs font-medium flex items-center gap-1.5 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Source
                </a>
              </div>
            </div>
          )}
        </>
      )}

      {/* Top Overlay Badge for EPG Preview Mode */}
      <div className="absolute top-2 left-2 z-20 flex items-center gap-2 pointer-events-none">
        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-black/70 backdrop-blur-md text-emerald-400 border border-emerald-500/30 flex items-center gap-1 shadow-md">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
          LIVE TV
        </span>
        {stats.resolution !== 'Unknown' && (
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-black/70 backdrop-blur-md text-indigo-300 border border-indigo-500/30 shadow-md">
            {stats.resolution}
          </span>
        )}
      </div>

      {/* Top Right Quick Controls */}
      <div className="absolute top-2 right-2 z-20 flex items-center gap-1.5">
        {onExpandPlayer && isEpgPreview && (
          <button
            onClick={onExpandPlayer}
            className="p-1.5 rounded-lg bg-black/60 hover:bg-indigo-600 text-white/80 hover:text-white backdrop-blur-md border border-white/10 transition-colors shadow-md"
            title="Expand to Full Player"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          onClick={toggleFullscreen}
          className="p-1.5 rounded-lg bg-black/60 hover:bg-indigo-600 text-white/80 hover:text-white backdrop-blur-md border border-white/10 transition-colors shadow-md"
          title="Fullscreen (F)"
        >
          {isFullscreen ? <Minimize className="w-3.5 h-3.5" /> : <Maximize className="w-3.5 h-3.5" />}
        </button>
      </div>

      {/* Floating Bottom Control Bar (Shown on hover or in preview) */}
      <div
        className={`absolute bottom-0 inset-x-0 p-3 bg-gradient-to-t from-black/90 via-black/50 to-transparent transition-opacity duration-300 z-20 flex items-center justify-between ${
          isEpgPreview ? 'opacity-90 group-hover:opacity-100' : 'opacity-0 group-hover:opacity-100'
        }`}
      >
        <div className="flex items-center gap-2">
          {/* Play / Pause */}
          <button
            onClick={togglePlay}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors backdrop-blur-md"
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
          >
            {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
          </button>

          {/* Prev Channel */}
          {onPrevChannel && (
            <button
              onClick={onPrevChannel}
              className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
              title="Previous Channel ([)"
            >
              <SkipBack className="w-4 h-4" />
            </button>
          )}

          {/* Next Channel */}
          {onNextChannel && (
            <button
              onClick={onNextChannel}
              className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
              title="Next Channel (])"
            >
              <SkipForward className="w-4 h-4" />
            </button>
          )}

          {/* Mute & Volume Slider */}
          <div className="flex items-center gap-1.5 ml-1">
            <button
              onClick={toggleMute}
              className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
              title="Mute / Unmute (M)"
            >
              {isMuted || volume === 0 ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={isMuted ? 0 : volume}
              onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
              className="w-16 h-1 accent-indigo-500 bg-slate-700 rounded-lg cursor-pointer hidden sm:block"
            />
          </div>
        </div>

        {/* Channel Name Label */}
        <div className="hidden md:flex items-center gap-2 truncate max-w-xs">
          {channel.logo && (
            <img
              src={channel.logo}
              alt=""
              className="w-4 h-4 object-contain rounded"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          )}
          <span className="text-xs font-semibold text-white truncate">{channel.name}</span>
        </div>

        {/* Right tools */}
        <div className="flex items-center gap-1">
          {/* Quality menu */}
          {qualities.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setShowQualityMenu(!showQualityMenu)}
                className="px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-white text-[10px] font-bold backdrop-blur-md flex items-center gap-1"
                title="Select Stream Quality"
              >
                <Sliders className="w-3 h-3" />
                <span>
                  {currentQuality === -1 ? 'AUTO' : qualities[currentQuality]?.name || 'HD'}
                </span>
              </button>

              {showQualityMenu && (
                <div className="absolute bottom-full right-0 mb-2 w-32 bg-slate-900 border border-slate-700 rounded-xl p-1.5 shadow-2xl z-40 text-xs">
                  <button
                    onClick={() => handleSelectQuality(-1)}
                    className={`w-full px-2.5 py-1.5 rounded-lg text-left flex items-center justify-between text-xs ${
                      currentQuality === -1 ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span>Auto</span>
                    {currentQuality === -1 && <Check className="w-3.5 h-3.5" />}
                  </button>
                  {qualities.map((q) => (
                    <button
                      key={q.id}
                      onClick={() => handleSelectQuality(q.id)}
                      className={`w-full px-2.5 py-1.5 rounded-lg text-left flex items-center justify-between text-xs ${
                        currentQuality === q.id ? 'bg-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <span>{q.name}</span>
                      {currentQuality === q.id && <Check className="w-3.5 h-3.5" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Stats toggle */}
          <button
            onClick={() => setShowStats(!showStats)}
            className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-white/10 text-xs"
            title="Stream Diagnostics"
          >
            <Info className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Diagnostics HUD */}
      {showStats && (
        <div className="absolute top-10 right-2 bg-slate-950/90 border border-slate-700/80 rounded-xl p-3 text-[10px] font-mono text-slate-300 shadow-xl backdrop-blur-md z-30 space-y-1">
          <p><span className="text-slate-500">Res:</span> {stats.resolution}</p>
          <p><span className="text-slate-500">Bitrate:</span> {stats.bitrate}</p>
          <p><span className="text-slate-500">Buffer:</span> {stats.buffer}</p>
          <p><span className="text-slate-500">Mode:</span> {isUsingProxy ? 'CORS Proxy' : 'Direct'}</p>
          <p className="max-w-[180px] truncate"><span className="text-slate-500">Host:</span> {channel.url}</p>
        </div>
      )}
    </div>
  );
};
