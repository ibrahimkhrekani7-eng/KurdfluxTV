import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { db } from './lib/firebase';
import { collection, onSnapshot, query, orderBy, doc, updateDoc, increment, setDoc, getDoc, limit } from 'firebase/firestore';

// Types
interface Channel {
  id?: string;
  name: string;
  logo: string;
  url: string;
  category?: string;
  type?: 'live' | 'movie' | 'series';
}

interface Ad {
  id?: number;
  image: string;
  link: string;
  position?: number;
}

interface Notification {
  id: number;
  title: string;
  message: string;
  created_at: string;
}

interface Translation {
  home: string;
  fav: string;
  search: string;
  error: string;
  cats: string[];
}

const translations: Record<string, Translation> = {
  ku: { home: "سەرەکی", fav: "دڵخوازەکان", search: "بگەڕێ...", error: "⚠️ ئەم کەناڵە کار ناکات!", cats: ["هەمووان", "کوردستان", "وەرزش", "هەواڵ", "منداڵان", "فیلم"] },
  en: { home: "Home", fav: "Favorites", search: "Search...", error: "⚠️ Channel Offline!", cats: ["All", "Kurdistan", "Sports", "News", "Kids", "Movies"] },
  tr: { home: "Anasayfa", fav: "Favoriler", search: "Ara...", error: "⚠️ Kanal Çalışmıyor!", cats: ["Hepsi", "Kürdistan", "Spor", "Haber", "Çocuk", "Filmler"] },
  ar: { home: "الرئيسية", fav: "المفضلات", search: "بحث...", error: "⚠️ القناة معطلة!", cats: ["الکل", "كوردستان", "رياضة", "أخبار", "أطفال", "أفلام"] }
};

const placeholderSVG = "data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2280%22%20height%3D%2280%22%20viewBox%3D%220%200%2080%2080%22%3E%3Crect%20width%3D%2280%22%20height%3D%2280%22%20fill%3D%22%23161618%22%2F%3E%3Ctext%20x%3D%2210%22%20y%3D%2245%22%20font-family%3D%22Arial%22%20font-size%3D%2214%22%20fill%3D%22%23ffffff%22%3ETV%3C%2Ftext%3E%3C%2Fsvg%3E";

export default function Home() {
  const [lang, setLang] = useState('ku');
  const [activeTab, setActiveTab] = useState<'home' | 'fav' | 'movies' | 'series'>('home');
  const [activeCat, setActiveCat] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  const [channels, setChannels] = useState<Channel[]>([]);
  const [sliderAds, setSliderAds] = useState<Ad[]>([]);
  const [gridAds, setGridAds] = useState<Ad[]>([]);
  const [notification, setNotification] = useState<Notification | null>(null);
  
  const [catCounts, setCatCounts] = useState<number[]>([0, 0, 0, 0, 0, 0]);
  const [favorites, setFavorites] = useState<Channel[]>(() => JSON.parse(localStorage.getItem('k_favs') || '[]'));
  const [history, setHistory] = useState<Channel[]>(() => JSON.parse(localStorage.getItem('k_history') || '[]'));
  const [currentPlayer, setCurrentPlayer] = useState<{ url: string, name: string } | null>(null);
  const [isTurboMode, setIsTurboMode] = useState(false);
  const [speed, setSpeed] = useState('0.0 Mbps');
  const [showUI, setShowUI] = useState(true);
  const [currentAdIndex, setCurrentAdIndex] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<any>(null);
  const plyrRef = useRef<any>(null);

  const t = translations[lang];
  const isRtl = lang === 'ku' || lang === 'ar';

  // Fetch Data from Firestore
  useEffect(() => {
    // Real-time channels
    const qChannels = query(collection(db, "channels"), orderBy("name"));
    const unsubChannels = onSnapshot(qChannels, (snapshot) => {
      const chList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Channel));
      setChannels(chList);
    }, (error) => {
      console.error("Firestore Channels Error:", error);
    });

    // Real-time Slider Ads
    const qSlider = query(collection(db, "sliderAds"));
    const unsubSlider = onSnapshot(qSlider, (snapshot) => {
      setSliderAds(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)));
    }, (error) => {
      console.error("Firestore Slider Error:", error);
    });

    // Real-time Grid Ads
    const qGrid = query(collection(db, "gridAds"));
    const unsubGrid = onSnapshot(qGrid, (snapshot) => {
      setGridAds(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)));
    }, (error) => {
      console.error("Firestore Grid Error:", error);
    });

    // Real-time Notifications
    const qNotif = query(collection(db, "notifications"), orderBy("created_at", "desc"), limit(1));
    const unsubNotif = onSnapshot(qNotif, (snapshot) => {
      if (!snapshot.empty) {
        const notif = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as any;
        setNotification(notif);
        setTimeout(() => setNotification(null), 10000);
      }
    }, (error) => {
      console.error("Firestore Notification Error:", error);
    });

    // Increment Total Visitors
    const incrementVisitors = async () => {
      const statsRef = doc(db, "stats", "main");
      try {
        const docSnap = await getDoc(statsRef);
        if (docSnap.exists()) {
          await updateDoc(statsRef, { totalVisitors: increment(1) });
        } else {
          await setDoc(statsRef, { totalVisitors: 1, onlineUsers: 1 });
        }
      } catch (e) {
        console.error("Error updating stats", e);
      }
    };
    incrementVisitors();

    return () => { 
      unsubChannels();
      unsubSlider();
      unsubGrid();
      unsubNotif();
    };
  }, []);

  useEffect(() => {
    const liveChannels = channels.filter(c => c.type === 'live' || !c.type);
    const counts = t.cats.map((cat, i) => {
      if (i === 0) return liveChannels.length;
      return liveChannels.filter(c => c.category === cat).length;
    });
    setCatCounts(counts);
  }, [channels, t.cats]);

  useEffect(() => {
    if (sliderAds.length > 0) {
      const interval = setInterval(() => {
        setCurrentAdIndex((prev) => (prev + 1) % sliderAds.length);
      }, 5000);
      return () => clearInterval(interval);
    }
  }, [sliderAds]);

  useEffect(() => {
    if (currentPlayer && videoRef.current) {
      const video = videoRef.current;
      // @ts-ignore
      if (window.Hls && window.Hls.isSupported()) {
        // @ts-ignore
        const hls = new window.Hls({ capLevelToPlayerSize: true });
        hlsRef.current = hls;
        hls.loadSource(currentPlayer.url);
        hls.attachMedia(video);
        // @ts-ignore
        hls.on(window.Hls.Events.MANIFEST_PARSED, () => video.play());
        // @ts-ignore
        hls.on(window.Hls.Events.FRAG_LOADED, (_e: any, d: any) => {
          if (d.stats.bw) setSpeed((d.stats.bw / (1024 * 1024)).toFixed(1) + " Mbps");
        });
      } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
        video.src = currentPlayer.url;
        video.addEventListener('loadedmetadata', () => video.play());
      }
      // @ts-ignore
      if (window.Plyr) {
        // @ts-ignore
        const plyr = new window.Plyr(video, { controls: ['play', 'progress', 'current-time', 'mute', 'volume', 'fullscreen'] });
        plyrRef.current = plyr;
      }
    }
    return () => {
      if (hlsRef.current) hlsRef.current.destroy();
      if (plyrRef.current) plyrRef.current.destroy();
    };
  }, [currentPlayer]);

  const toggleFav = (e: React.MouseEvent, ch: Channel) => {
    e.stopPropagation();
    const isFav = favorites.some(f => f.url === ch.url);
    const newFavs = isFav ? favorites.filter(f => f.url !== ch.url) : [...favorites, ch];
    setFavorites(newFavs);
    localStorage.setItem('k_favs', JSON.stringify(newFavs));
  };

  const playChannel = (ch: Channel) => {
    setCurrentPlayer({ url: ch.url, name: ch.name });
    const newHistory = [ch, ...history.filter(h => h.url !== ch.url)].slice(0, 15);
    setHistory(newHistory);
    localStorage.setItem('k_history', JSON.stringify(newHistory));
  };

  const filteredChannels = useMemo(() => {
    let list = channels;
    
    if (activeTab === 'fav') {
      list = favorites;
    } else if (activeTab === 'movies') {
      list = channels.filter(c => c.type === 'movie');
    } else if (activeTab === 'series') {
      list = channels.filter(c => c.type === 'series');
    } else {
      // Home tab - Live TV
      list = channels.filter(c => c.type === 'live' || !c.type);
      if (activeCat > 0) {
        const catName = t.cats[activeCat];
        list = list.filter(c => c.category === catName);
      }
    }

    return list.filter(c => c.name.toLowerCase().includes(searchQuery.toLowerCase()));
  }, [channels, favorites, searchQuery, activeTab, activeCat, t.cats]);

  return (
    <div className="min-h-screen bg-[#050505] text-white flex overflow-hidden" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Sidebar */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSidebarOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[90] lg:hidden"
          />
        )}
      </AnimatePresence>

      <aside className={`fixed lg:static inset-y-0 ${isRtl ? 'right-0' : 'left-0'} z-[100] w-64 bg-[#0a0a0c] border-x border-white/5 transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : (isRtl ? 'translate-x-full lg:translate-x-0' : '-translate-x-full lg:translate-x-0')}`}>
        <div className="p-6 flex items-center justify-between">
          <h1 className="text-2xl font-black tracking-tighter text-[#ff003c]">KURDFLUX<span className="text-white">+</span></h1>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-gray-500 hover:text-white">
            <i className="fa-solid fa-xmark text-xl"></i>
          </button>
        </div>
        
        <nav className="mt-4 px-3 space-y-1">
          {[
            { id: 'home', icon: 'fa-house', label: t.home },
            { id: 'fav', icon: 'fa-heart', label: t.fav },
            { id: 'movies', icon: 'fa-film', label: 'Movies' },
            { id: 'series', icon: 'fa-tv', label: 'Series' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => { setActiveTab(item.id as any); setSidebarOpen(false); }}
              className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-xl transition-all ${activeTab === item.id ? 'bg-[#ff003c]/10 text-[#ff003c] border-l-4 border-[#ff003c]' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}
            >
              <i className={`fa-solid ${item.icon} text-lg`}></i>
              <span className="font-bold">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="absolute bottom-6 left-6 right-6">
          <Link to="/admin" className="flex items-center gap-3 text-gray-500 hover:text-white transition-colors">
            <i className="fa-solid fa-gear"></i>
            <span className="text-sm font-medium">Settings</span>
          </Link>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Top Bar */}
        <header className="h-20 px-6 flex items-center justify-between glass-panel sticky top-0 z-50">
          <div className="flex items-center gap-4">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="lg:hidden w-10 h-10 flex items-center justify-center bg-white/5 rounded-xl">
              <i className="fa-solid fa-bars"></i>
            </button>
            <div className="relative flex-1 max-w-80">
              <i className={`fa-solid fa-magnifying-glass absolute top-1/2 -translate-y-1/2 text-gray-500 ${isRtl ? 'right-4' : 'left-4'}`}></i>
              <input 
                type="text" 
                placeholder={t.search} 
                className={`w-full bg-white/5 border border-white/5 rounded-2xl py-2 md:py-2.5 text-xs md:text-sm outline-none focus:border-[#ff003c]/50 transition-all ${isRtl ? 'pr-10 md:pr-12 pl-4' : 'pl-10 md:pl-12 pr-4'}`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center gap-4">
            <select 
              className="bg-white/5 border border-white/5 rounded-xl px-3 py-2 text-xs font-bold outline-none"
              value={lang}
              onChange={(e) => setLang(e.target.value)}
            >
              <option value="ku">Kurdî</option>
              <option value="en">English</option>
              <option value="ar">العربية</option>
            </select>
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#ff003c] to-[#ff6b6b] flex items-center justify-center font-bold text-sm">
              U
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 space-y-8">
          {/* Hero Slider */}
          {activeTab === 'home' && sliderAds.length > 0 && (
            <section className="relative h-[300px] md:h-[450px] rounded-[32px] overflow-hidden group">
              <img src={sliderAds[currentAdIndex].image} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" alt="" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#050505] via-transparent to-transparent"></div>
              <div className="absolute bottom-10 left-10 right-10">
                <span className="bg-[#ff003c] text-white text-[10px] font-black px-3 py-1 rounded-full uppercase tracking-widest mb-4 inline-block">Featured</span>
                <h2 className="text-4xl md:text-6xl font-black tracking-tighter mb-4">PREMIUM IPTV<br/>EXPERIENCE</h2>
                <div className="flex gap-4">
                  <button className="bg-white text-black px-8 py-3 rounded-2xl font-black hover:bg-[#ff003c] hover:text-white transition-all">WATCH NOW</button>
                  <button className="bg-white/10 backdrop-blur-md text-white px-8 py-3 rounded-2xl font-black border border-white/10 hover:bg-white/20 transition-all">DETAILS</button>
                </div>
              </div>
              <div className="absolute bottom-10 right-10 flex gap-2">
                {sliderAds.map((_, i) => (
                  <button key={i} onClick={() => setCurrentAdIndex(i)} className={`h-1.5 rounded-full transition-all ${currentAdIndex === i ? 'w-8 bg-[#ff003c]' : 'w-2 bg-white/20'}`}></button>
                ))}
              </div>
            </section>
          )}

          {/* Categories Bar */}
          {activeTab === 'home' && (
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-black tracking-tight flex items-center gap-2">
                  <span className="w-1.5 h-6 bg-[#ff003c] rounded-full"></span>
                  CATEGORIES
                </h3>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
                {t.cats.map((cat, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveCat(i)}
                    className={`px-6 py-3 rounded-2xl text-sm font-bold whitespace-nowrap border transition-all ${activeCat === i ? 'bg-[#ff003c] border-[#ff003c] text-white shadow-lg shadow-[#ff003c]/20' : 'bg-white/5 border-white/5 text-gray-400 hover:border-white/20 hover:text-white'}`}
                  >
                    {cat} <span className="ml-2 text-[10px] opacity-50">{catCounts[i]}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Grid Ads */}
          {activeTab === 'home' && gridAds.length > 0 && (
            <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {gridAds.map((ad, i) => (
                <a key={i} href={ad.link} target="_blank" rel="noopener noreferrer" className="relative h-32 rounded-3xl overflow-hidden group border border-white/5">
                  <img src={ad.image} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" alt="" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent"></div>
                  <div className="absolute bottom-4 left-4">
                    <span className="text-[10px] font-black tracking-widest text-white/60 uppercase">Sponsored</span>
                  </div>
                </a>
              ))}
            </section>
          )}

          {/* Channel Grid */}
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-black tracking-tight flex items-center gap-2">
                <span className="w-1.5 h-6 bg-[#ff003c] rounded-full"></span>
                {activeTab === 'home' ? 'LIVE CHANNELS' : t.fav}
              </h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
              {filteredChannels.map((ch, i) => (
                <motion.div 
                  key={i}
                  whileHover={{ y: -8 }}
                  className="group relative bg-[#121214] rounded-[24px] overflow-hidden border border-white/5 hover:border-[#ff003c]/30 transition-all cursor-pointer shadow-xl"
                  onClick={() => playChannel(ch)}
                >
                  <div className="aspect-square p-6 flex items-center justify-center relative">
                    <img src={ch.logo || placeholderSVG} className="max-w-full max-h-full object-contain transition-transform duration-500 group-hover:scale-110" alt="" />
                    <button 
                      onClick={(e) => toggleFav(e, ch)}
                      className={`absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center backdrop-blur-md transition-all ${favorites.some(f => f.url === ch.url) ? 'bg-yellow-400 text-black' : 'bg-black/40 text-white/40 hover:text-white'}`}
                    >
                      <i className="fa-solid fa-heart text-xs"></i>
                    </button>
                  </div>
                  <div className="p-4 bg-gradient-to-t from-black/80 to-transparent">
                    <div className="text-xs font-black truncate text-center group-hover:text-[#ff003c] transition-colors">{ch.name}</div>
                    <div className="text-[9px] text-gray-500 text-center mt-1 font-bold uppercase tracking-widest">{ch.category || 'General'}</div>
                  </div>
                </motion.div>
              ))}
            </div>
          </section>
        </main>
      </div>

      {/* Player Overlay */}
      <AnimatePresence>
        {currentPlayer && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black z-[2000] flex flex-col"
          >
            {/* Player Header */}
            <div className={`absolute top-0 inset-x-0 p-4 md:p-6 bg-gradient-to-b from-black/90 to-transparent z-[2100] flex justify-between items-center transition-opacity duration-500 ${!showUI ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
              <div className="flex items-center gap-3 md:gap-4 min-w-0">
                <button onClick={() => setCurrentPlayer(null)} className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-white/10 flex items-center justify-center hover:bg-[#ff003c] transition-all shrink-0">
                  <i className={`fa-solid ${isRtl ? 'fa-chevron-right' : 'fa-chevron-left'} text-base md:text-lg`}></i>
                </button>
                <div className="min-w-0">
                  <h4 className="text-lg md:text-xl font-black tracking-tight truncate">{currentPlayer.name}</h4>
                  <div className="flex items-center gap-2 text-[9px] md:text-[10px] font-bold text-gray-400">
                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                    <span className="truncate">LIVE STREAMING • {speed}</span>
                  </div>
                </div>
              </div>
              <div className="flex gap-2 md:gap-3 shrink-0">
                <button 
                  onClick={() => setIsTurboMode(!isTurboMode)}
                  className={`px-3 md:px-4 py-1.5 md:py-2 rounded-xl text-[9px] md:text-[10px] font-black border transition-all ${isTurboMode ? 'bg-green-500 border-green-500 text-black' : 'bg-white/5 border-white/10 text-white'}`}
                >
                  {isTurboMode ? 'TURBO' : 'NORMAL'}
                </button>
              </div>
            </div>

            {/* Video Area */}
            <div className="flex-1 flex items-center justify-center bg-black relative" onClick={() => setShowUI(!showUI)}>
              <video ref={videoRef} className="w-full h-full object-contain" playsInline crossOrigin="anonymous"></video>
              {!showUI && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                   <div className="w-20 h-20 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <i className="fa-solid fa-play text-3xl"></i>
                   </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Notification */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ x: 300, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 300, opacity: 0 }}
            className={`fixed top-6 ${isRtl ? 'left-6' : 'right-6'} z-[3000] w-80 bg-[#121214] border border-white/10 p-5 rounded-[24px] shadow-2xl flex gap-4`}
          >
            <div className="w-12 h-12 rounded-2xl bg-[#ff003c]/10 flex items-center justify-center shrink-0">
              <i className="fa-solid fa-bell text-[#ff003c] text-xl"></i>
            </div>
            <div className="flex-1">
              <h5 className="font-black text-sm mb-1">{notification.title}</h5>
              <p className="text-xs text-gray-400 leading-relaxed">{notification.message}</p>
            </div>
            <button onClick={() => setNotification(null)} className="text-gray-600 hover:text-white">
              <i className="fa-solid fa-xmark"></i>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
