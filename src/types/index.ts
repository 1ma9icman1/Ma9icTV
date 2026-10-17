export interface Channel {
  id: string;
  name: string;
  url: string;
  group: string;
  logo?: string;
  tvgId?: string;
  tvgName?: string;
  tvgChno?: string;
  isRadio?: boolean;
  httpUserAgent?: string;
  httpReferrer?: string;
  raw?: string;
  timeshift?: string;
  catchupDays?: string;
}

export interface Playlist {
  id: string;
  title: string;
  url?: string;
  type: 'preset' | 'm3u-url' | 'm3u-file' | 'xtream';
  channelCount: number;
  addedAt: number;
  lastUpdated: number;
  userAgent?: string;
  epgUrl?: string;
  channels: Channel[];
}

export interface EpgProgram {
  id: string;
  channelId: string;
  title: string;
  desc?: string;
  start: string; // ISO or YYYYMMDDHHmmss
  stop: string;
  category?: string;
  startTime: Date;
  stopTime: Date;
  isLive: boolean;
  progress: number; // 0 - 100
}

export interface XtreamCategory {
  category_id: string;
  category_name: string;
  parent_id?: number;
}

export interface XtreamStream {
  num?: number;
  name: string;
  stream_type: 'live' | 'movie' | 'series';
  stream_id: number;
  stream_icon?: string;
  epg_channel_id?: string;
  added?: string;
  category_id?: string;
  custom_sid?: string;
  tv_archive?: number;
  direct_source?: string;
  rating?: string;
  rating_5based?: number;
}

export interface AppSettings {
  theme: 'dark' | 'oled' | 'light';
  proxyMode: 'auto' | 'always' | 'direct';
  customUserAgent: string;
  bufferLengthSeconds: number;
  autoPlayNext: boolean;
  compactView: boolean;
  volume: number;
  muted: boolean;
}
