import { Playlist } from '../types';

export interface CatalogPlaylist {
  name: string;
  url: string;
  category: 'Worldwide' | 'Streaming Services' | 'Countries' | 'Categories';
  description: string;
  flag?: string;
  channelEstimate?: string;
  epgUrl?: string;
  sourceUrls?: string[];
}

export const INITIAL_PRESETS: Playlist[] = [
  {
    id: 'preset-world-live',
    title: 'Featured World Live Channels',
    // Start the worldwide guide with US data, then merge additional regions.
    epgUrl: 'https://iptv-org.github.io/epg/guides/us/directv.com.epg.xml.gz,https://iptv-org.github.io/epg/guides/us/tvguide.com.epg.xml.gz,https://iptv-org.github.io/epg/guides/us/gatotv.com.epg.xml.gz,https://iptv-org.github.io/epg/guides/us/ontvtonight.com.epg.xml.gz,https://iptv-org.github.io/epg/guides/uk/sky.com.epg.xml.gz,https://iptv-org.github.io/epg/guides/ca/tvhebdo.com.epg.xml.gz',
    type: 'preset',
    channelCount: 12,
    addedAt: Date.now(),
    lastUpdated: Date.now(),
    channels: [
      {
        id: 'ch-dw',
        name: 'DW News English Live',
        url: 'https://dwamdstream102.akamaized.net/hls/live/2015525/dwstream102/index.m3u8',
        group: 'News',
        logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/75/Deutsche_Welle_logo.svg/320px-Deutsche_Welle_logo.svg.png',
        tvgId: 'DWEnglish.de',
        tvgName: 'DW English',
      },
      {
        id: 'ch-redbull',
        name: 'Red Bull TV Sports & Action',
        url: 'https://rbmn-live.akamaized.net/hls/live/590964/BoRB-AT/master.m3u8',
        group: 'Sports',
        logo: 'https://upload.wikimedia.org/wikipedia/en/thumb/8/87/Red_Bull_TV_logo.svg/320px-Red_Bull_TV_logo.svg.png',
        tvgId: 'RedBullTV.at',
        tvgName: 'Red Bull TV',
      },
      {
        id: 'ch-a2cnn',
        name: 'A2 CNN News Live',
        url: 'https://tv.a2news.com/live/smil:a2cnnweb.stream.smil/playlist.m3u8',
        group: 'News',
        logo: 'https://i.imgur.com/TgO3Lzi.png',
        tvgId: 'A2CNN.al',
        tvgName: 'A2 CNN',
      },
      {
        id: 'ch-news24',
        name: 'News 24 24/7 Live Stream',
        url: 'https://tv.balkanweb.com/news24/livestream/playlist.m3u8',
        group: 'News',
        logo: 'https://i.imgur.com/TgO3Lzi.png',
        tvgId: 'News24.al',
        tvgName: 'News 24',
      },
      {
        id: 'ch-cna',
        name: 'CNA TV Information',
        url: 'https://live1.mediadesk.al/cnatvlive.m3u8',
        group: 'News',
        logo: 'https://i.imgur.com/X3ukD5t.png',
        tvgId: 'CNA.al',
        tvgName: 'CNA',
      },
      {
        id: 'ch-oranews',
        name: 'Ora News Live Broadcast',
        url: 'https://live1.mediadesk.al/oranews.m3u8',
        group: 'News',
        logo: 'https://i.imgur.com/rL2v9pM.png',
        tvgId: 'OraNews.al',
        tvgName: 'Ora News',
      },
      {
        id: 'ch-syri',
        name: 'Syri TV Live Broadcast',
        url: 'https://stream.syritv.al/live/syritv/playlist.m3u8',
        group: 'News',
        logo: 'https://i.imgur.com/Pr4ixiA.png',
        tvgId: 'SyriTV.al',
        tvgName: 'Syri TV',
      },
      {
        id: 'ch-andorra',
        name: 'Andorra TV HD Live',
        url: 'https://livesg1.rtva.hiway.media/11a6d6f4-ee13-47c7-9c27-7313cf5424e2/manifest.m3u8',
        group: 'Entertainment',
        logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/91/Andorra_televisi%C3%B3_logo.svg/320px-Andorra_televisi%C3%B3_logo.svg.png',
        tvgId: 'AndorraTV.ad',
        tvgName: 'Andorra TV',
      },
      {
        id: 'ch-albkanale',
        name: 'AlbKanale Music TV HD',
        url: 'https://albportal.net/albkanalemusic.m3u8',
        group: 'Music',
        logo: 'https://i.imgur.com/JdKxscs.png',
        tvgId: 'AlbKanale.al',
        tvgName: 'AlbKanale Music',
      },
      {
        id: 'ch-bigbuck',
        name: 'Big Buck Bunny (HLS HD Test)',
        url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
        group: 'Movies',
        logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Big_buck_bunny_poster_big.jpg/240px-Big_buck_bunny_poster_big.jpg',
        tvgId: 'demo.bbb',
        tvgName: 'Big Buck Bunny',
      },
      {
        id: 'ch-tears',
        name: 'Tears of Steel (Sci-Fi Cinema)',
        url: 'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8',
        group: 'Movies',
        logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/02/Tears_of_Steel_poster.jpg/240px-Tears_of_Steel_poster.jpg',
        tvgId: 'demo.tears',
        tvgName: 'Tears of Steel',
      },
      {
        id: 'ch-radio-swiss',
        name: 'Radio Swiss Classic (Hi-Fi Stream)',
        url: 'https://stream.srg-ssr.ch/m/rsc_de/mp3_128',
        group: 'Radio',
        isRadio: true,
        logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Radio_Swiss_Classic_Logo.svg/320px-Radio_Swiss_Classic_Logo.svg.png',
        tvgId: 'swissclassic.ch',
        tvgName: 'Swiss Classic',
      },
    ],
  },
];

// Public XMLTV guides used by the worldwide catalog. iptv-org/epg is the
// guide-generation toolkit; these are published XMLTV feeds, not the toolkit repo.
// IDs in iptv-org playlists follow the iptv-org database convention. Name aliases
// in EpgGuide also help Free-TV entries whose IDs differ or are absent.
const WORLD_EPG_URLS = [
  // Start with US guides so the global EPG has useful data immediately.
  'https://iptv-org.github.io/epg/guides/us/directv.com.epg.xml.gz',
  'https://iptv-org.github.io/epg/guides/us/tvguide.com.epg.xml.gz',
  'https://iptv-org.github.io/epg/guides/us/gatotv.com.epg.xml.gz',
  'https://iptv-org.github.io/epg/guides/us/ontvtonight.com.epg.xml.gz',
  'https://iptv-org.github.io/epg/guides/uk/sky.com.epg.xml.gz',
  'https://iptv-org.github.io/epg/guides/uk/tv24.co.uk.epg.xml.gz',
  'https://iptv-org.github.io/epg/guides/ca/tvhebdo.com.epg.xml.gz',
  'https://iptv-org.github.io/epg/guides/ca/watch.sportsnet.ca.epg.xml.gz',
  'https://iptv-org.github.io/epg/guides/au/foxtel.com.au.epg.xml.gz',
  'https://iptv-org.github.io/epg/guides/au/abc.net.au.epg.xml.gz',
  'https://iptv-org.github.io/epg/guides/fr/chaines-tv.orange.fr.epg.xml.gz',
  'https://iptv-org.github.io/epg/guides/fr/tv.sfr.fr.epg.xml.gz',
  'https://iptv-org.github.io/epg/guides/de/web.magentatv.de.epg.xml.gz',
  'https://iptv-org.github.io/epg/guides/it/guidatv.sky.it.epg.xml.gz',
  'https://iptv-org.github.io/epg/guides/it/superguidatv.it.epg.xml.gz',
  'https://iptv-org.github.io/epg/guides/pt/vodafone.pt.epg.xml.gz',
  'https://iptv-org.github.io/epg/guides/nl/tvgids.nl.epg.xml.gz',
  'https://iptv-org.github.io/epg/guides/za/dstv.com.epg.xml.gz',
  'https://iptv-org.github.io/epg/guides/in/tataplay.com.epg.xml.gz',
  'https://iptv-org.github.io/epg/guides/br/claro.com.br.epg.xml.gz',
].join(',');

export const CATALOG_PLAYLISTS: CatalogPlaylist[] = [
  // --- 1. Worldwide channels: one country-sorted lineup + multi-country EPG ---
  // The country-grouped master M3U keeps every country in one channel list.
  // The EPG loader merges country guides in batches and matches IDs first,
  // then display names. UK is first so it is the initial guide to be loaded.
  {
    name: 'World Channels (Sorted by Country)',
    url: 'https://iptv-org.github.io/iptv/index.country.m3u',
    category: 'Worldwide',
    description: 'One global channel list grouped by country, with merged EPG guides for the most-used regions.',
    flag: '🌍',
    channelEstimate: '~8,000 channels',
    epgUrl: 'https://iptv-org.github.io/epg/guides/us/directv.com.epg.xml.gz,https://iptv-org.github.io/epg/guides/us/tvguide.com.epg.xml.gz,https://iptv-org.github.io/epg/guides/us/gatotv.com.epg.xml.gz,https://iptv-org.github.io/epg/guides/us/ontvtonight.com.epg.xml.gz,https://iptv-org.github.io/epg/guides/uk/sky.com.epg.xml.gz,https://iptv-org.github.io/epg/guides/uk/tv24.co.uk.epg.xml.gz,https://iptv-org.github.io/epg/guides/ca/tvhebdo.com.epg.xml.gz,https://iptv-org.github.io/epg/guides/ca/watch.sportsnet.ca.epg.xml.gz,https://iptv-org.github.io/epg/guides/au/foxtel.com.au.epg.xml.gz,https://iptv-org.github.io/epg/guides/au/abc.net.au.epg.xml.gz,https://iptv-org.github.io/epg/guides/nz/sky.co.nz.epg.xml.gz,https://iptv-org.github.io/epg/guides/ie/sky.com.epg.xml.gz,https://iptv-org.github.io/epg/guides/fr/chaines-tv.orange.fr.epg.xml.gz,https://iptv-org.github.io/epg/guides/fr/tv.sfr.fr.epg.xml.gz,https://iptv-org.github.io/epg/guides/de/web.magentatv.de.epg.xml.gz,https://iptv-org.github.io/epg/guides/it/guidatv.sky.it.epg.xml.gz,https://iptv-org.github.io/epg/guides/it/superguidatv.it.epg.xml.gz,https://iptv-org.github.io/epg/guides/es/guia-tv.es.epg.xml.gz,https://iptv-org.github.io/epg/guides/pt/vodafone.pt.epg.xml.gz,https://iptv-org.github.io/epg/guides/nl/tvgids.nl.epg.xml.gz,https://iptv-org.github.io/epg/guides/za/dstv.com.epg.xml.gz,https://iptv-org.github.io/epg/guides/in/tataplay.com.epg.xml.gz,https://iptv-org.github.io/epg/guides/br/claro.com.br.epg.xml.gz,https://iptv-org.github.io/epg/guides/jp/tvguide.or.jp.epg.xml.gz,https://iptv-org.github.io/epg/guides/kr/skylife.co.kr.epg.xml.gz,https://iptv-org.github.io/epg/guides/ph/sky.com.ph.epg.xml.gz,https://iptv-org.github.io/epg/guides/mx/totalplay.com.mx.epg.xml.gz,https://iptv-org.github.io/epg/guides/be/tv.vrt.be.epg.xml.gz,https://iptv-org.github.io/epg/guides/se/tv.nu.epg.xml.gz,https://iptv-org.github.io/epg/guides/no/tvguide.no.epg.xml.gz,https://iptv-org.github.io/epg/guides/dk/tvtid.dk.epg.xml.gz,https://iptv-org.github.io/epg/guides/fi/telkku.com.epg.xml.gz,https://iptv-org.github.io/epg/guides/pl/teleman.pl.epg.xml.gz,https://iptv-org.github.io/epg/guides/cz/programy-tv.cz.epg.xml.gz,https://iptv-org.github.io/epg/guides/at/tv.orf.at.epg.xml.gz,https://iptv-org.github.io/epg/guides/ch/tv.blue.ch.epg.xml.gz,https://iptv-org.github.io/epg/guides/gr/athinorama.gr.epg.xml.gz,https://iptv-org.github.io/epg/guides/tr/digiturk.com.tr.epg.xml.gz,https://iptv-org.github.io/epg/guides/ro/program-tv.ro.epg.xml.gz,https://iptv-org.github.io/epg/guides/hu/port.hu.epg.xml.gz,https://iptv-org.github.io/epg/guides/ve/directv.com.ve.epg.xml.gz,https://iptv-org.github.io/epg/guides/uy/directv.com.uy.epg.xml.gz,https://iptv-org.github.io/epg/guides/py/directv.com.py.epg.xml.gz,https://iptv-org.github.io/epg/guides/pe/directv.com.pe.epg.xml.gz,https://iptv-org.github.io/epg/guides/ec/directv.com.ec.epg.xml.gz,https://iptv-org.github.io/epg/guides/co/directv.com.co.epg.xml.gz,https://iptv-org.github.io/epg/guides/cl/vtr.com.epg.xml.gz,https://iptv-org.github.io/epg/guides/bo/tv.yandex.ru.epg.xml.gz,https://iptv-org.github.io/epg/guides/ar/cablevision.com.ar.epg.xml.gz,https://iptv-org.github.io/epg/guides/ca/rogers.com.epg.xml.gz,https://iptv-org.github.io/epg/guides/cn/tv.cctv.com.epg.xml.gz,https://iptv-org.github.io/epg/guides/ru/tv.yandex.ru.epg.xml.gz',
  },

  // --- 2. FAST Streaming Services (BuddyChewChew App M3U Generator) ---
  {
    name: 'Samsung TV Plus (United States)',
    url: 'https://raw.githubusercontent.com/BuddyChewChew/app-m3u-generator/main/playlists/samsungtvplus_us.m3u',
    category: 'Streaming Services',
    description: 'Samsung TV Plus linear free channels (US lineup).',
    flag: '🇺🇸',
    channelEstimate: '~320 channels',
    epgUrl: 'https://i.mjh.nz/SamsungTVPlus/us.xml.gz',
  },
  {
    name: 'Samsung TV Plus (All Regions)',
    url: 'https://raw.githubusercontent.com/BuddyChewChew/app-m3u-generator/main/playlists/samsungtvplus_all.m3u',
    category: 'Streaming Services',
    description: 'Full international Samsung TV Plus catalog (11+ countries).',
    flag: '🌐',
    channelEstimate: '~1,200 channels',
    epgUrl: 'https://i.mjh.nz/SamsungTVPlus/all.xml.gz',
  },
  {
    name: 'Pluto TV (United States)',
    url: 'https://raw.githubusercontent.com/BuddyChewChew/app-m3u-generator/main/playlists/plutotv_us.m3u',
    category: 'Streaming Services',
    description: 'Pluto TV US live streaming channels with proxy support and embedded guide.',
    flag: '🇺🇸',
    channelEstimate: '~350 channels',
    epgUrl: 'https://i.mjh.nz/PlutoTV/us.xml.gz',
  },
  {
    name: 'Pluto TV (All Global Regions)',
    url: 'https://raw.githubusercontent.com/BuddyChewChew/app-m3u-generator/main/playlists/plutotv_all.m3u',
    category: 'Streaming Services',
    description: 'Complete worldwide Pluto TV catalog spanning 14+ international regions.',
    flag: '🌐',
    channelEstimate: '~1,500 channels',
    epgUrl: 'https://i.mjh.nz/PlutoTV/all.xml.gz',
  },
  {
    name: 'Plex TV (United States)',
    url: 'https://raw.githubusercontent.com/BuddyChewChew/app-m3u-generator/main/playlists/plex_us.m3u',
    category: 'Streaming Services',
    description: 'Free live TV channels on Plex (US region).',
    flag: '🇺🇸',
    channelEstimate: '~400 channels',
    epgUrl: 'https://github.com/matthuisman/i.mjh.nz/raw/master/Plex/us.xml.gz',
  },
  {
    name: 'Plex TV (All Global Regions)',
    url: 'https://raw.githubusercontent.com/BuddyChewChew/app-m3u-generator/main/playlists/plex_all.m3u',
    category: 'Streaming Services',
    description: 'Plex Live TV streams across 8+ international regions.',
    flag: '🌐',
    channelEstimate: '~1,000 channels',
    epgUrl: 'https://github.com/matthuisman/i.mjh.nz/raw/master/Plex/all.xml.gz',
  },
  {
    name: 'The Roku Channel (All Channels)',
    url: 'https://raw.githubusercontent.com/BuddyChewChew/app-m3u-generator/main/playlists/roku_all.m3u',
    category: 'Streaming Services',
    description: 'Full Roku Linear TV lineup including news, movies, and classics.',
    flag: '📺',
    channelEstimate: '~450 channels',
    epgUrl: 'https://github.com/matthuisman/i.mjh.nz/raw/master/Roku/all.xml.gz',
  },
  {
    name: 'Tubi TV (Live TV)',
    url: 'https://raw.githubusercontent.com/BuddyChewChew/app-m3u-generator/refs/heads/main/playlists/tubi_all.m3u',
    category: 'Streaming Services',
    description: 'Tubi free ad-supported streaming television live channels.',
    flag: '🍿',
    channelEstimate: '~250 channels',
    epgUrl: 'https://raw.githubusercontent.com/BuddyChewChew/app-m3u-generator/main/playlists/tubi_epg.xml',
  },

  // --- Curated combined categories: fewer choices, broader subject coverage ---
  {
    name: 'News, Business & Weather',
    url: 'https://raw.githubusercontent.com/1ma9icman1/Ma9icTV/main/m3u_lists/popular-news-iptv.m3u',
    sourceUrls: ['https://raw.githubusercontent.com/1ma9icman1/Ma9icTV/main/m3u_lists/popular-news-iptv.m3u','https://raw.githubusercontent.com/1ma9icman1/Ma9icTV/main/m3u_lists/popular-business-iptv.m3u'],
    category: 'Categories',
    description: 'Breaking news, world affairs, financial markets, business reporting, and current events.',
    channelEstimate: 'Combined news and business channels',
  },
  {
    name: 'Movies, Classics & Drama',
    url: 'https://raw.githubusercontent.com/1ma9icman1/Ma9icTV/main/m3u_lists/popular-movies-iptv.m3u',
    sourceUrls: ['https://raw.githubusercontent.com/1ma9icman1/Ma9icTV/main/m3u_lists/popular-movies-iptv.m3u','https://raw.githubusercontent.com/1ma9icman1/Ma9icTV/main/m3u_lists/popular-general-iptv.m3u'],
    category: 'Categories',
    description: 'Movie channels, classic cinema, drama, and general entertainment in one larger collection.',
    channelEstimate: 'Combined movie and entertainment channels',
  },
  {
    name: 'Comedy & Entertainment',
    url: 'https://raw.githubusercontent.com/1ma9icman1/Ma9icTV/main/m3u_lists/popular-comedy-iptv.m3u',
    sourceUrls: ['https://raw.githubusercontent.com/1ma9icman1/Ma9icTV/main/m3u_lists/popular-comedy-iptv.m3u','https://raw.githubusercontent.com/1ma9icman1/Ma9icTV/main/m3u_lists/popular-general-iptv.m3u'],
    category: 'Categories',
    description: 'Sitcoms, stand-up, comedy films, light entertainment, and general-interest channels.',
    channelEstimate: 'Combined comedy and entertainment channels',
  },
  {
    name: 'Documentaries, Science & Discovery',
    url: 'https://raw.githubusercontent.com/1ma9icman1/Ma9icTV/main/m3u_lists/popular-documentary-iptv.m3u',
    sourceUrls: ['https://raw.githubusercontent.com/1ma9icman1/Ma9icTV/main/m3u_lists/popular-documentary-iptv.m3u','https://raw.githubusercontent.com/1ma9icman1/Ma9icTV/main/m3u_lists/popular-science-iptv.m3u'],
    category: 'Categories',
    description: 'History, nature, science, technology, space, and real-world stories.',
    channelEstimate: 'Combined factual and science channels',
  },
  {
    name: 'Kids, Family & Animation',
    url: 'https://raw.githubusercontent.com/1ma9icman1/Ma9icTV/main/m3u_lists/popular-kids-iptv.m3u',
    sourceUrls: ['https://raw.githubusercontent.com/1ma9icman1/Ma9icTV/main/m3u_lists/popular-kids-iptv.m3u'],
    category: 'Categories',
    description: 'Family-friendly viewing, cartoons, animated adventures, and children’s programming.',
    channelEstimate: 'Kids and family channels',
  },
  {
    name: 'Sports & Outdoor',
    url: 'https://raw.githubusercontent.com/1ma9icman1/Ma9icTV/main/m3u_lists/popular-sports-iptv.m3u',
    sourceUrls: ['https://raw.githubusercontent.com/1ma9icman1/Ma9icTV/main/m3u_lists/popular-sports-iptv.m3u','https://raw.githubusercontent.com/1ma9icman1/Ma9icTV/main/m3u_lists/popular-travel-iptv.m3u'],
    category: 'Categories',
    description: 'Live sports, competitions, outdoor adventures, travel, and destination programming.',
    channelEstimate: 'Combined sports and travel channels',
  },
  {
    name: 'Music, Concerts & Culture',
    url: 'https://raw.githubusercontent.com/1ma9icman1/Ma9icTV/main/m3u_lists/popular-music-iptv.m3u',
    sourceUrls: ['https://raw.githubusercontent.com/1ma9icman1/Ma9icTV/main/m3u_lists/popular-music-iptv.m3u'],
    category: 'Categories',
    description: 'Music television, live performances, concerts, and music-focused cultural programming.',
    channelEstimate: 'Music and concert channels',
  },

];

// Fill EPG sources for every catalog playlist. Country collections use a
// country-specific merged guide; worldwide and genre collections combine the
// major regional guides so a US-only schedule is not used for every channel.
const COUNTRY_EPG_CODES: Record<string, string> = {
  'United States': 'us',
  'United Kingdom': 'uk',
  Canada: 'ca',
  Australia: 'au',
  'New Zealand': 'nz',
  Ireland: 'ie',
  France: 'fr',
  Germany: 'de',
  Spain: 'es',
  Italy: 'it',
  Portugal: 'pt',
  Netherlands: 'nl',
  'South Africa': 'za',
  India: 'in',
  Japan: 'jp',
  'South Korea': 'kr',
  Philippines: 'ph',
  Brazil: 'br',
  Mexico: 'mx',
};

// iptv-org publishes provider-specific XMLTV files inside country folders;
// the old /guides/us.xml.gz-style URLs are no longer valid. Combine working
// provider feeds across regions for the worldwide and category playlists.
const WORLDWIDE_EPG_SOURCES = [
  'https://iptv-org.github.io/epg/guides/us/directv.com.epg.xml.gz',
  'https://iptv-org.github.io/epg/guides/us/tvguide.com.epg.xml.gz',
  'https://iptv-org.github.io/epg/guides/us/gatotv.com.epg.xml.gz',
  'https://iptv-org.github.io/epg/guides/us/ontvtonight.com.epg.xml.gz',
  'https://iptv-org.github.io/epg/guides/uk/sky.com.epg.xml.gz',
  'https://iptv-org.github.io/epg/guides/uk/tv24.co.uk.epg.xml.gz',
  'https://iptv-org.github.io/epg/guides/ca/tvhebdo.com.epg.xml.gz',
  'https://iptv-org.github.io/epg/guides/ca/watch.sportsnet.ca.epg.xml.gz',
  'https://iptv-org.github.io/epg/guides/au/foxtel.com.au.epg.xml.gz',
  'https://iptv-org.github.io/epg/guides/au/abc.net.au.epg.xml.gz',
  'https://iptv-org.github.io/epg/guides/fr/chaines-tv.orange.fr.epg.xml.gz',
  'https://iptv-org.github.io/epg/guides/fr/tv.sfr.fr.epg.xml.gz',
  'https://iptv-org.github.io/epg/guides/de/web.magentatv.de.epg.xml.gz',
  'https://iptv-org.github.io/epg/guides/it/guidatv.sky.it.epg.xml.gz',
  'https://iptv-org.github.io/epg/guides/it/superguidatv.it.epg.xml.gz',
  'https://iptv-org.github.io/epg/guides/pt/vodafone.pt.epg.xml.gz',
  'https://iptv-org.github.io/epg/guides/nl/tvgids.nl.epg.xml.gz',
  'https://iptv-org.github.io/epg/guides/za/dstv.com.epg.xml.gz',
  'https://iptv-org.github.io/epg/guides/in/tataplay.com.epg.xml.gz',
  'https://iptv-org.github.io/epg/guides/br/claro.com.br.epg.xml.gz',
];

for (const playlist of CATALOG_PLAYLISTS) {
  // Do not change the working EPG configuration for streaming services.
  if (playlist.epgUrl || playlist.category === 'Streaming Services') continue;
  if (playlist.category === 'Countries') {
    const code = COUNTRY_EPG_CODES[playlist.name];
    if (code === 'us') playlist.epgUrl = WORLDWIDE_EPG_SOURCES.slice(0, 4).join(',');
    else if (code) playlist.epgUrl = `https://iptv-org.github.io/epg/guides/${code}.xml.gz`;
  } else if (playlist.category === 'Worldwide' || playlist.category === 'Categories') {
    playlist.epgUrl = WORLDWIDE_EPG_SOURCES.join(',');
  }
}
