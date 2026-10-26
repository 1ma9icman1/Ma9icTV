# World playlist configuration backup (before EPG rebuild)

Branch: `feature/android-apk`
Source: `src/data/presetPlaylists.ts`

The original five Worldwide catalog entries had no `epgUrl`, so switching to them did not give Ma9icTV a guide source unless the playlist itself advertised one.

## Previous entries

- **Free-TV Curated Quality Playlist**
  - URL: https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8
  - Estimate: ~1,200 channels
  - Description: Quality-focused, tested public television channels with high availability.

- **All Worldwide Channels (iptv-org)**
  - URL: https://iptv-org.github.io/iptv/index.m3u
  - Estimate: ~8,000 channels
  - Description: Comprehensive global collection of publicly available TV channels.

- **Worldwide Channels (Grouped by Country)**
  - URL: https://iptv-org.github.io/iptv/index.country.m3u
  - Estimate: ~8,000 channels
  - Description: Global channels with country names formatted as group categories.

- **Worldwide Channels (Grouped by Category)**
  - URL: https://iptv-org.github.io/iptv/index.category.m3u
  - Estimate: ~8,000 channels
  - Description: Channels organized by genre (News, Sports, Movies, Animation, etc.).

- **Worldwide Channels (Grouped by Language)**
  - URL: https://iptv-org.github.io/iptv/index.language.m3u
  - Estimate: ~8,000 channels
  - Description: Global channels organized by broadcast language.

No existing playlist entries or streaming-service configurations are deleted by the EPG change.
