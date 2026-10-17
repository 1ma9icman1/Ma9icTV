import { Channel } from '../types';

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

      currentChannel.name = titlePart || 'Unnamed Channel';
      currentChannel.tvgId = tvgIdMatch ? tvgIdMatch[1] : undefined;
      currentChannel.tvgName = tvgNameMatch ? tvgNameMatch[1] : undefined;
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

        channels.push(currentChannel as Channel);
        currentChannel = null;
      }
    }
  }

  return channels;
}
