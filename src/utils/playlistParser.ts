import { Channel } from '../types';
import { isChannelBlacklisted } from './storage';

/**
 * Sanitizes channel names and removes unwanted junk text,
 * including variations of "Discovery & Wildlife Explorer" and "Evening Specials Features".
 */
export function sanitizeChannelName(name: string): string {
  if (!name) return 'Unnamed Channel';
  let cleaned = name;

  // Remove "Discovery&wildlife explorer" and variations/typos
  cleaned = cleaned.replace(/discovery\s*&?\s*wildlife\s*explore?r(e|er)?/gi, '');
  // Remove "Evening Specials Features" and variations
  cleaned = cleaned.replace(/evening\s*specials?\s*features?/gi, '');
  // Remove simulated suffixes/prefixes
  cleaned = cleaned.replace(/simulated\s*(program|stream|channel)?/gi, '');
  
  // Clean up dangling delimiters like " - ", " : ", " | "
  cleaned = cleaned.replace(/^\s*[-:–—|/]\s*|\s*[-:–—|/]\s*$/g, '');
  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();

  return cleaned || name.trim() || 'Channel';
}

export function parseM3uString(content: string, playlistId: string): Channel[] {
  const lines = content.split(/\r?\n/);
  const channels: Channel[] = [];

  let currentChannel: Partial<Channel> | null = null;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();

    if (!line) continue;

    if (line.startsWith('#EXTINF:')) {
      currentChannel = {};

      // Parse metadata from #EXTINF line
      // Format: #EXTINF:-1 tvg-id="id" tvg-name="name" tvg-logo="url" group-title="group", Channel Name
      const commaIdx = line.indexOf(',');
      const infoPart = commaIdx !== -1 ? line.substring(0, commaIdx) : line;
      const titlePart = commaIdx !== -1 ? line.substring(commaIdx + 1).trim() : 'Unknown Channel';

      // Extract attributes using regex
      const tvgIdMatch = infoPart.match(/tvg-id="([^"]*)"/i);
      const tvgNameMatch = infoPart.match(/tvg-name="([^"]*)"/i);
      const tvgLogoMatch = infoPart.match(/tvg-logo="([^"]*)"/i);
      const groupTitleMatch = infoPart.match(/group-title="([^"]*)"/i);
      const tvgChnoMatch = infoPart.match(/tvg-chno="([^"]*)"/i);
      const isRadioMatch = infoPart.match(/radio="(true|1)"/i);

      currentChannel.name = sanitizeChannelName(titlePart);
      currentChannel.tvgId = tvgIdMatch ? tvgIdMatch[1] : undefined;
      currentChannel.tvgName = tvgNameMatch ? sanitizeChannelName(tvgNameMatch[1]) : undefined;
      currentChannel.logo = tvgLogoMatch ? tvgLogoMatch[1] : undefined;
      currentChannel.group = groupTitleMatch ? groupTitleMatch[1] : 'General';
      currentChannel.tvgChno = tvgChnoMatch ? tvgChnoMatch[1] : undefined;
      currentChannel.isRadio = Boolean(isRadioMatch);
    } else if (line.startsWith('#EXTVLCOPT:')) {
      if (currentChannel) {
        if (line.includes('http-user-agent=')) {
          currentChannel.httpUserAgent = line.split('http-user-agent=')[1]?.trim();
        } else if (line.includes('http-referrer=')) {
          currentChannel.httpReferrer = line.split('http-referrer=')[1]?.trim();
        }
      }
    } else if (line.startsWith('#KODIPROP:')) {
      // Kodi property tags if present
    } else if (!line.startsWith('#')) {
      // This is the stream URL
      if (currentChannel && line.length > 5) {
        currentChannel.url = line;
        currentChannel.id = `${playlistId}-ch-${channels.length + 1}-${Math.random().toString(36).substring(2, 7)}`;
        
        // Auto-detect radio if url ends in audio extension
        if (!currentChannel.isRadio && (line.endsWith('.mp3') || line.endsWith('.aac') || line.includes('/mp3_') || currentChannel.group?.toLowerCase().includes('radio'))) {
          currentChannel.isRadio = true;
        }

        // Filter out if user previously blacklisted this channel URL
        if (!isChannelBlacklisted({ url: currentChannel.url, id: currentChannel.id })) {
          channels.push(currentChannel as Channel);
        }
        currentChannel = null;
      }
    }
  }

  return channels;
}
