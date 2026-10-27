import React, { useState, useMemo, useEffect } from 'react';
import {
  Search,
  Heart,
  Star,
  Play,
  Radio,
  Tv,
  Clock,
  Sparkles,
  Grid,
  List as ListIcon,
  ChevronDown,
  Globe,
  ExternalLink,
  Camera,
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

type LiveFeed = { name: string; region: string; category: string; description: string; url: string; };
const LIVE_FEEDS: LiveFeed[] = [
{name:'World Webcam Explorer',region:'Worldwide',category:'Landmarks & Cities',description:'Large directory of live cameras including city views and famous places.',url:'https://openearth.live/webcams'},
{name:'EarthCam World Network',region:'Worldwide',category:'Landmarks & Cities',description:'Official webcam network with city streets, skylines and landmarks.',url:'https://www.earthcam.com/'},
{name:'Times Square 4K',region:'New York, USA',category:'Landmarks & Cities',description:'Live views of Times Square and surrounding streets.',url:'https://www.earthcam.com/usa/newyork/timessquare/'},
{name:'Statue of Liberty & New York Harbor',region:'New York, USA',category:'Historic Sites',description:'Official cameras showing the harbor, island and monument.',url:'https://www.statueofliberty.org/statue-of-liberty/earthcam/'},
{name:'US National Parks Cameras',region:'United States',category:'Nature & Wildlife',description:'National Park Service area cameras hosted through EarthCam.',url:'https://static.earthcam.com/usa/nps/'},
{name:'World Landmark Cameras',region:'Worldwide',category:'Historic Sites',description:'Live landmark and public-square cameras from multiple countries.',url:'https://earthlive24.com/cameras/landmarks'},
{name:'Tabi Landmark Cameras',region:'Worldwide',category:'Historic Sites',description:'Public square, city and landmark webcams around the world.',url:'https://tabi.cam/monuments/'},
{name:'GAIA News World Cameras',region:'Worldwide',category:'Landmarks & Cities',description:'Curated location cameras from identified operators, including Times Square and Shibuya.',url:'https://gaianews.com/'},
{name:'Explore.org Live Nature Cams',region:'Worldwide',category:'Nature & Wildlife',description:'Wildlife and nature cameras, including bears, birds and marine life.',url:'https://explore.org/livecams'},
{name:'Cornell Lab Bird Cams',region:'Worldwide',category:'Nature & Wildlife',description:'Live bird nests, feeders and wildlife habitats.',url:'https://www.allaboutbirds.org/cams/'},
{name:'Monterey Bay Aquarium Live Cams',region:'California, USA',category:'Ocean & Aquariums',description:'Live exhibits including kelp forest and ocean wildlife cameras.',url:'https://www.montereybayaquarium.org/animals/live-cams'},
{name:'Georgia Aquarium Live Cams',region:'Georgia, USA',category:'Ocean & Aquariums',description:'Aquarium cameras and underwater animal views.',url:'https://www.georgiaaquarium.org/webcam/'},
{name:'Port of Cams: Surf, Coast & Nature',region:'Worldwide',category:'Ocean & Coastlines',description:'Browse live surf, beach, volcano, wildlife and city cameras.',url:'https://portofcams.com/'},
{name:'afar.TV Nature Streams',region:'Worldwide',category:'Volcanoes & Geology',description:'Volcano, coastline, aurora and landscape livestream directory.',url:'https://www.afar.tv/'},
{name:'Open Earth Live Streams',region:'Worldwide',category:'Earth Science',description:'Live and recent coverage of eruptions, storms, oceans, geology and space events.',url:'https://openearth.live/watch/live'},
{name:'USGS Hawaiian Volcano Observatory',region:'Hawaii, USA',category:'Volcanoes & Geology',description:'Official Hawaiian volcano monitoring and camera resources.',url:'https://www.usgs.gov/observatories/hvo'},
{name:'Yellowstone Volcano Observatory',region:'Wyoming, USA',category:'Volcanoes & Geology',description:'Official monitoring information and camera resources for Yellowstone.',url:'https://www.usgs.gov/observatories/yvo'},
{name:'NASA Live / NASA TV',region:'Space',category:'Space & Astronomy',description:'Official NASA broadcasts, mission coverage and events.',url:'https://www.nasa.gov/nasatv/'},
{name:'NASA Live on YouTube',region:'Low Earth Orbit / Space',category:'Space & Astronomy',description:'NASA live broadcasts, including Earth views when available.',url:'https://www.youtube.com/@NASA/live'},
{name:'ESA Web TV',region:'Space',category:'Space & Astronomy',description:'European Space Agency mission, launch and science broadcasts.',url:'https://www.esa.int/ESA_Multimedia/ESA_Web_TV'},
{name:'SpaceX Live',region:'Space',category:'Space & Astronomy',description:'Official launch webcasts and mission coverage when scheduled.',url:'https://www.youtube.com/@SpaceX/live'},
{name:'NASA Jet Propulsion Laboratory',region:'Space',category:'Space & Astronomy',description:'Planetary science, spacecraft missions and live event coverage.',url:'https://www.jpl.nasa.gov/'},
{name:'NOAA Ocean Exploration',region:'Oceans',category:'Ocean & Coastlines',description:'Deep-ocean expedition livestreams and exploration video.',url:'https://oceanexplorer.noaa.gov/'},
{name:'NOAA Ocean Buoys',region:'Worldwide',category:'Earth Science',description:'Near-real-time ocean observations and marine conditions (data dashboard).',url:'https://www.ndbc.noaa.gov/'},
{name:'NOAA Space Weather',region:'Space',category:'Space & Astronomy',description:'Solar wind, geomagnetic activity and space-weather monitoring.',url:'https://www.swpc.noaa.gov/'},
{name:'USGS Earthquake Map',region:'Worldwide',category:'Earth Science',description:'Near-real-time earthquake map and event details (live data, not video).',url:'https://earthquake.usgs.gov/earthquakes/map/'},
{name:'Open Earth Live Planet Monitor',region:'Worldwide',category:'Earth Science',description:'Near-real-time earthquakes, volcanoes, wildfires, storms, tsunamis and space events.',url:'https://openearth.live/'},
{name:'Overwatch Earth Live Globe',region:'Worldwide',category:'Earth Science',description:'Interactive globe with environmental, transit, satellite and public-data layers.',url:'https://overwatch.earth/'},
{name:'Zenitmap Live World Map',region:'Worldwide',category:'Earth Science',description:'Live globe for aurora, earthquakes, ISS, aircraft, ships and webcam discovery.',url:'https://zenitmap.com/en/'},
{name:'Antarctic Research & Science',region:'Antarctica',category:'Polar & Remote Places',description:'Official Antarctic research, station updates and available camera links; continuous public webcams are limited.',url:'https://www.bas.ac.uk/'},
{name:'US Antarctic Program',region:'Antarctica',category:'Polar & Remote Places',description:'Official US Antarctic Program station information and expedition media.',url:'https://www.usap.gov/'},
{name:'Tokyo & Shibuya Cameras',region:'Tokyo, Japan',category:'Landmarks & Cities',description:'Find live street views and public camera links for Shibuya and Tokyo.',url:'https://gaianews.com/'},
{name:'Abbey Road Crossing',region:'London, UK',category:'Historic Sites',description:'Find live camera coverage of the famous Abbey Road crossing when available.',url:'https://tabi.cam/monuments/'},
{name:'Venice & St. Mark’s Square',region:'Venice, Italy',category:'Landmarks & Cities',description:'City and square cameras around Venice and its waterfront.',url:'https://earthlive24.com/cameras/landmarks'},
{name:'African Wildlife & Waterholes',region:'Africa',category:'Nature & Wildlife',description:'Wildlife camera directory for animals and remote habitats.',url:'https://explore.org/livecams'},
{name:'Coral Reefs & Tropical Seas',region:'Tropical oceans',category:'Ocean & Aquariums',description:'Underwater and marine-life cameras from public aquarium and nature networks.',url:'https://explore.org/livecams'},

{name:'SkylineWebcams: World Live Cameras',region:'Worldwide',category:'Landmarks & Cities',description:'Large live-camera network covering city squares, UNESCO sites, beaches, volcanoes and landscapes.',url:'https://www.skylinewebcams.com/en/webcam.html'},
{name:'UNESCO Heritage Camera Collection',region:'Worldwide',category:'Historic Sites',description:'Live camera collection featuring historic squares, bridges, ruins and heritage landmarks.',url:'https://www.skylinewebcams.com/en/live-cams-category/unesco-cams.html'},
{name:'Rome Colosseum',region:'Rome, Italy',category:'Historic Sites',description:'Live webcam listing for the Colosseum and nearby ancient Roman ruins.',url:'https://www.skylinewebcams.com/en/webcam/italia/lazio/roma/colosseo.html'},
{name:'Stonehenge Skyscape',region:'Wiltshire, England',category:'Historic Sites',description:'English Heritage live sky view from Stonehenge with sun, moon and planet context.',url:'https://www.english-heritage.org.uk/visit/places/stonehenge/history-and-stories/stonehenge360'},
{name:'Western Wall Live Camera',region:'Jerusalem',category:'Historic Sites',description:'Official Western Wall Heritage Foundation live view of the prayer plaza and nearby areas.',url:'https://thekotel.org/en/western-wall/israel-live-cam/'},
{name:'Eiffel Tower & Paris Views',region:'Paris, France',category:'Landmarks & Cities',description:'Live and frequently refreshed camera listings for the Eiffel Tower and central Paris.',url:'https://www.skylinewebcams.com/en/live-cams-category/city-cams.html'},
{name:'Acropolis & Athens Landmarks',region:'Athens, Greece',category:'Historic Sites',description:'Landmark webcam directory includes views of the Acropolis and historic city centers.',url:'https://earthlive24.com/cameras/landmarks'},
{name:'Sydney Harbour',region:'Sydney, Australia',category:'Ocean & Coastlines',description:'Live camera directory with Sydney Harbour, the Harbour Bridge and waterfront views.',url:'https://www.skylinewebcams.com/en/webcam.html'},
{name:'Mount Etna & Stromboli',region:'Italy',category:'Volcanoes & Geology',description:'Volcano webcam listings for Stromboli and other active volcanic areas.',url:'https://www.skylinewebcams.com/en/webcam.html'},
{name:'Jerusalem Old City Cameras',region:'Jerusalem',category:'Historic Sites',description:'Multiple live views of the Western Wall and Old City from public webcam directories.',url:'https://www.eta-il.com/en/webcams'},

{name:'Ocean Observatories Initiative',region:'Global oceans',category:'Ocean Science',description:'Real-time data from scientific instruments observing ocean conditions.',url:'https://oceanobservatories.org/'},
{name:'NOAA Sanctuaries Live',region:'United States oceans',category:'Ocean Science',description:'Underwater research video and marine sanctuary expeditions.',url:'https://sanctuaries.noaa.gov/live/'},
{name:'NOAA Okeanos Explorer Live',region:'Global oceans',category:'Ocean Science',description:'Official deep-sea exploration livestreams and expeditions.',url:'https://oceanexplorer.noaa.gov/livestreams/welcome.html'},
{name:'Ocean Networks Canada',region:'Pacific Ocean',category:'Ocean Science',description:'Ocean observatories, deep-water instruments and underwater cameras.',url:'https://www.oceannetworks.ca/observatories/'},
{name:'Ocean Today',region:'Global oceans',category:'Ocean Science',description:'Ocean science and deep-sea animal videos from NOAA.',url:'https://oceantoday.noaa.gov/'},
{name:'Open Oceans Global Webcams',region:'Worldwide',category:'Ocean Science',description:'Directory of coastal, research-vessel, underwater and aquarium cameras.',url:'https://www.openoceans.org/web-cams'},
{name:'SETI Institute',region:'Space',category:'Search for Extraterrestrial Life',description:'Scientific research into life beyond Earth and possible technosignatures; no confirmed alien stream.',url:'https://www.seti.org/'},
{name:'Breakthrough Listen',region:'Global radio telescopes',category:'Search for Extraterrestrial Life',description:'Scientific search for extraterrestrial technosignatures.',url:'https://breakthroughinitiatives.org/initiative/1'},
{name:'NASA UAP Research',region:'Earth & atmosphere',category:'UFOs & UAP Research',description:'NASA research and public information on unidentified anomalous phenomena.',url:'https://science.nasa.gov/uap/'},
{name:'AARO UAP Reports',region:'Worldwide reports',category:'UFOs & UAP Research',description:'Official U.S. government reporting and analysis of UAP reports.',url:'https://www.aaro.mil/'},
{name:'NASA Eyes on the Solar System',region:'Solar System',category:'Space & Astronomy',description:'Interactive 3D exploration of planets, moons, spacecraft and missions.',url:'https://eyes.nasa.gov/'},
{name:'NASA Eyes on Exoplanets',region:'Beyond the Solar System',category:'Space & Astronomy',description:'Interactive visualization of known exoplanets and their host stars.',url:'https://eyes.nasa.gov/apps/exo/'},
{name:'NASA Solar Dynamics Observatory',region:'The Sun',category:'Space & Astronomy',description:'Near-real-time solar imagery for flares and active regions.',url:'https://sdo.gsfc.nasa.gov/data/'},
{name:'NASA Mars Perseverance Images',region:'Mars',category:'Space & Astronomy',description:'Latest images and mission updates from the Perseverance rover.',url:'https://mars.nasa.gov/mars2020/multimedia/raw-images/'},
{name:'NASA Astronomy Picture of the Day',region:'Space',category:'Space & Astronomy',description:'Daily astronomy image with an expert explanation.',url:'https://apod.nasa.gov/apod/astropix.html'},
{name:'Smithsonian National Zoo Live Cams',region:'Washington, DC, USA',category:'Zoos & Famous Animals',description:'Official live cams featuring pandas, cheetahs, lions and naked mole-rats.',url:'https://nationalzoo.si.edu/webcams'},
{name:'San Diego Zoo Live Cams',region:'California, USA',category:'Zoos & Famous Animals',description:'Animal camera collection from San Diego Zoo Wildlife Alliance.',url:'https://zoo.sandiegozoo.org/live-cams'},
{name:'Houston Zoo Animal Cams',region:'Texas, USA',category:'Zoos & Famous Animals',description:'Live views of selected zoo habitats when cameras are operating.',url:'https://www.houstonzoo.org/explore/webcams/'},
{name:'Dublin Zoo Webcams',region:'Dublin, Ireland',category:'Zoos & Famous Animals',description:'Zoo webcam listings and animal habitat views.',url:'https://www.dublinzoo.ie/animals/animal-webcams/'},
{name:'Edinburgh Zoo Live Cams',region:'Scotland',category:'Zoos & Famous Animals',description:'Official animal webcams from the Royal Zoological Society of Scotland.',url:'https://www.edinburghzoo.org.uk/webcams'},
{name:'Decorah Eagles Nest',region:'Iowa, USA',category:'Zoos & Famous Animals',description:'Famous bald eagle nest camera and seasonal nesting activity.',url:'https://www.raptorresource.org/birdcams/decorah-eagles/'},
{name:'Brooks Falls Bear Cam',region:'Alaska, USA',category:'Zoos & Famous Animals',description:'Seasonal brown bear and salmon viewing at Katmai National Park.',url:'https://explore.org/livecams/brown-bears/brown-bear-salmon-cam-brooks-falls'},
{name:'Africam Wildlife Waterholes',region:'Africa',category:'Zoos & Famous Animals',description:'Wildlife cameras across African reserves and waterholes.',url:'https://africam.com/'},
{name:'Niagara Falls Live Cameras',region:'Canada / United States',category:'World Wonders & Epic Places',description:'Live views of Niagara Falls and the surrounding gorge.',url:'https://www.earthcam.com/world/canada/niagarafalls/'},
{name:'Grand Canyon Webcams',region:'Arizona, USA',category:'National Parks & Wild Places',description:'Official park camera resources and canyon viewpoints.',url:'https://www.nps.gov/grca/learn/photosmultimedia/webcams.htm'},
{name:'Yellowstone National Park Webcams',region:'Wyoming, USA',category:'National Parks & Wild Places',description:'Official webcams and current conditions for Yellowstone landscapes.',url:'https://www.nps.gov/yell/learn/photosmultimedia/webcams.htm'},
{name:'Yosemite National Park Webcams',region:'California, USA',category:'National Parks & Wild Places',description:'Official webcams showing Yosemite Valley and mountain scenery.',url:'https://www.nps.gov/yose/learn/photosmultimedia/webcams.htm'},
{name:'National Park Service Webcams',region:'United States',category:'National Parks & Wild Places',description:'Official directory of cameras across U.S. national parks and monuments.',url:'https://www.nps.gov/subjects/air/webcams.htm'},
{name:'Great Barrier Reef',region:'Australia',category:'World Wonders & Epic Places',description:'Reef conservation, marine science and underwater camera resources.',url:'https://www.barrierreef.org/'},
{name:'Machu Picchu',region:'Peru',category:'World Wonders & Epic Places',description:'Explore the Inca citadel and official heritage visitor resources.',url:'https://www.machupicchu.gob.pe/'},
{name:'Victoria Falls',region:'Zambia / Zimbabwe',category:'World Wonders & Epic Places',description:'Visitor resources for one of the world’s great waterfalls.',url:'https://www.zambiatourism.com/destinations/waterfalls/victoria-falls/'},
{name:'Iguazú Falls',region:'Argentina / Brazil',category:'World Wonders & Epic Places',description:'Explore the vast waterfall system and national park information.',url:'https://iguazuargentina.com/'},
{name:'World Beach & Surf Cameras',region:'Worldwide',category:'Beaches & Surf',description:'Global camera directory for beaches, surf breaks and coastlines.',url:'https://portofcams.com/cameras/'},
{name:'Waikiki Beach Cameras',region:'Hawaii, USA',category:'Beaches & Surf',description:'Beach and surf camera listings for Waikiki and Honolulu.',url:'https://portofcams.com/cameras/'},
{name:'Pipeline Surf Cam',region:'Oahu, Hawaii',category:'Beaches & Surf',description:'Surf camera listings around famous Banzai Pipeline.',url:'https://www.surfline.com/surf-report/banzai-pipeline/5842041f4e65fade4916a0b4'},
{name:'Myrtle Beach Cameras',region:'South Carolina, USA',category:'Beaches & Surf',description:'Boardwalk and beachfront camera listings.',url:'https://www.myrtlebeach.com/webcams/'},
{name:'Outer Banks Beach Cameras',region:'North Carolina, USA',category:'Beaches & Surf',description:'Beach and surf camera listings across the Outer Banks.',url:'https://www.outerbanks.org/webcams/'},
{name:'Bondi Beach Cameras',region:'Sydney, Australia',category:'Beaches & Surf',description:'Beach and surf camera listings for Bondi and nearby beaches.',url:'https://www.coastalwatch.com/surf-cams-surf-reports/nsw/sydney/bondi-beach'},
{name:'Copacabana Beach',region:'Rio de Janeiro, Brazil',category:'Beaches & Surf',description:'Beachfront camera directory for Rio’s famous waterfront.',url:'https://www.skylinewebcams.com/en/webcam.html'},
{name:'Greek Islands Beach Cameras',region:'Greece',category:'Beaches & Surf',description:'Beach, harbor and coastal camera listings around Greek islands.',url:'https://www.skylinewebcams.com/en/webcam.html'},
{name:'Maldives Atolls & Beaches',region:'Maldives',category:'Beaches & Surf',description:'Tropical island and reef camera listings from the Maldives region.',url:'https://www.skylinewebcams.com/en/webcam.html'},
{name:'Naturist Beaches & Resorts Directory (18+)',region:'Worldwide',category:'Naturist Beaches (18+)',description:'Adult-only directory for legal naturist beaches and resorts; destination listings, not explicit video.',url:'https://www.naturistdirectory.com/'},
{name:'Naturism Destinations (18+)',region:'Worldwide',category:'Naturist Beaches (18+)',description:'Find designated clothing-optional beaches and naturist destinations; check local laws and access rules.',url:'https://www.naturism.com/'},
{name:'American Association for Nude Recreation (18+)',region:'United States',category:'Naturist Beaches (18+)',description:'Information about naturist recreation, etiquette and affiliated locations for adults.',url:'https://www.aanr.com/'},
];
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

  const filteredLiveFeeds = useMemo(() => LIVE_FEEDS.filter((feed) => {
    const query = searchQuery.toLowerCase().trim();
    return !query || [feed.name, feed.region, feed.category, feed.description].some((value) => value.toLowerCase().includes(query));
  }), [searchQuery]);

  const visibleChannels = useMemo(() => {
    return filteredChannels.slice(0, pageLimit);
  }, [filteredChannels, pageLimit]);

  return (
    <div className="flex flex-col h-[48dvh] min-h-[220px] max-h-[56dvh] md:h-full md:max-h-none md:min-h-0 bg-slate-900 border-b md:border-b-0 md:border-r border-slate-800 w-full md:w-80 lg:w-96 min-w-0 flex-shrink-0 select-none">
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

        <button onClick={() => { setSelectedGroup('LIVE_FEEDS'); setSearchQuery(''); }} className={`w-full px-3 py-2 rounded-lg border text-xs font-semibold flex items-center justify-center gap-2 ${selectedGroup === 'LIVE_FEEDS' ? 'bg-emerald-600/20 border-emerald-500 text-emerald-200' : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-emerald-500/60'}`}><Camera className="w-4 h-4" /><span>WORLD LIVE FEEDS</span><span className="rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[10px]">{LIVE_FEEDS.length}</span></button>

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
        {selectedGroup === 'LIVE_FEEDS' ? (
          <div className="space-y-3">
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-950/20 p-3">
              <div className="flex items-center gap-2 text-emerald-300 font-semibold text-sm"><Globe className="w-4 h-4" /> World Live Feeds</div>
              <p className="text-[11px] text-slate-400 mt-1">Landmarks, ancient places, cities, wildlife, volcanoes, oceans, Antarctica and space. Select a feed to open its viewing page.</p>
              <p className="text-[10px] text-slate-500 mt-1">Some sources are live video; others are live-data dashboards or directories. Availability is controlled by each provider.</p>
            </div>
            {filteredLiveFeeds.length === 0 ? <div className="p-6 text-center text-xs text-slate-500">No live feeds match that search.</div> : filteredLiveFeeds.map((feed) => (
              <a key={feed.name} href={feed.url} target="_blank" rel="noopener noreferrer" className="group block rounded-xl border border-slate-800 bg-slate-950/60 p-3 hover:border-emerald-500/50 hover:bg-slate-800/70 transition-colors">
                <div className="flex items-start gap-2"><div className="mt-0.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-2 text-emerald-300"><Camera className="w-4 h-4" /></div><div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><h3 className="text-xs font-semibold text-slate-100 group-hover:text-emerald-200">{feed.name}</h3><ExternalLink className="w-3.5 h-3.5 flex-shrink-0 text-slate-500 group-hover:text-emerald-300" /></div><p className="text-[10px] text-emerald-300/80 mt-0.5">{feed.region}</p><p className="text-[11px] leading-relaxed text-slate-400 mt-1">{feed.description}</p></div></div>
              </a>
            ))}
            <p className="text-center text-[10px] text-slate-600 py-2">Curated directory · {filteredLiveFeeds.length} feeds shown · External sources may change or go offline.</p>
          </div>
        ) : filteredChannels.length === 0 ? (
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
                      aria-label={isFav ? `Remove ${channel.name} from favorites` : `Favorite ${channel.name}`}
                      title={isFav ? 'Remove favorite' : 'Add to favorites'}
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleFavorite(channel.id);
                      }}
                      className={`w-7 h-7 rounded-full border flex items-center justify-center transition-colors ${
                        isFav
                          ? 'text-amber-300 border-amber-400/40 bg-amber-400/10'
                          : 'text-slate-400 border-slate-700 hover:text-amber-300 hover:border-amber-400/50'
                      }`}
                    >
                      <Star className={`w-3.5 h-3.5 ${isFav ? 'fill-current' : ''}`} />
                    </button>
                    <button
                      aria-label={`Play ${channel.name}`}
                      title="Play channel"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectChannel(channel);
                      }}
                      className={`w-7 h-7 rounded-full border flex items-center justify-center transition-colors ${
                        isSelected
                          ? 'text-emerald-300 border-emerald-400/50 bg-emerald-400/10'
                          : 'text-slate-300 border-slate-700 hover:text-emerald-300 hover:border-emerald-400/50'
                      }`}
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
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
          {selectedGroup === 'LIVE_FEEDS' ? `Showing ${filteredLiveFeeds.length} live feeds` : `Showing ${Math.min(visibleChannels.length, filteredChannels.length)} of ${filteredChannels.length} channels`}
        </span>
        <span>{selectedGroup === 'LIVE_FEEDS' ? 'External viewing links' : `${favorites.length} favorited`}</span>
      </div>
    </div>
  );
};
