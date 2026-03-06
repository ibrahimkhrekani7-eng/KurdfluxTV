import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { db, auth } from './lib/firebase';
import { collection, addDoc, deleteDoc, doc, onSnapshot, query, orderBy, updateDoc } from 'firebase/firestore';
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth';

interface Channel {
  id?: string;
  name: string;
  logo: string;
  url: string;
  category?: string;
  type?: 'live' | 'movie' | 'series';
  status?: 'online' | 'offline';
}

interface Ad {
  id?: string;
  image: string;
  link: string;
  position?: number;
}

export default function Admin() {
  const [adminAuth, setAdminAuth] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [channels, setChannels] = useState<Channel[]>([]);
  const [sliderAds, setSliderAds] = useState<Ad[]>([]);
  const [gridAds, setGridAds] = useState<Ad[]>([]);
  const [stats, setStats] = useState({
    onlineUsers: 0,
    totalVisitors: 0,
    totalChannels: 0,
    onlineChannels: 0,
    offlineChannels: 0
  });
  const [isChecking, setIsChecking] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) {
        setAdminAuth(true);
      } else {
        setAdminAuth(false);
      }
    });

    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (adminAuth) {
      // Real-time channels from Firestore
      const qChannels = query(collection(db, "channels"), orderBy("name"));
      const unsubChannels = onSnapshot(qChannels, (snapshot) => {
        const chList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Channel));
        setChannels(chList);
        
        // Update stats based on channels
        const online = chList.filter(c => c.status === 'online').length;
        const offline = chList.filter(c => c.status === 'offline').length;
        setStats(prev => ({
          ...prev,
          totalChannels: chList.length,
          onlineChannels: online,
          offlineChannels: offline
        }));
      }, (error) => {
        console.error("Admin Channels Error:", error);
      });

      // Real-time Slider Ads
      const qSlider = query(collection(db, "sliderAds"));
      const unsubSlider = onSnapshot(qSlider, (snapshot) => {
        setSliderAds(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Ad)));
      }, (error) => {
        console.error("Admin Slider Error:", error);
      });

      // Real-time Grid Ads
      const qGrid = query(collection(db, "gridAds"));
      const unsubGrid = onSnapshot(qGrid, (snapshot) => {
        setGridAds(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Ad)));
      }, (error) => {
        console.error("Admin Grid Error:", error);
      });

      // Real-time Stats (Visitors)
      const unsubStats = onSnapshot(doc(db, "stats", "main"), (docSnap) => {
        if (docSnap.exists()) {
          setStats(prev => ({
            ...prev,
            totalVisitors: docSnap.data().totalVisitors || 0,
            onlineUsers: docSnap.data().onlineUsers || 0
          }));
        }
      }, (error) => {
        console.error("Admin Stats Error:", error);
      });

      return () => {
        unsubChannels();
        unsubSlider();
        unsubGrid();
        unsubStats();
      };
    }
  }, [adminAuth]);

  const handleAddChannel = async (e: any) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData);
    
    try {
      await addDoc(collection(db, "channels"), {
        ...data,
        status: 'online',
        type: data.type || 'live'
      });
      e.target.reset();
    } catch (error) {
      console.error("Error adding channel: ", error);
      alert("Error adding channel to Firebase");
    }
  };

  const handleDeleteChannel = async (id: string) => {
    try {
      await deleteDoc(doc(db, "channels", id));
    } catch (error) {
      console.error("Error deleting channel: ", error);
    }
  };

  const handleAddSliderAd = async (e: any) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData);
    try {
      await addDoc(collection(db, "sliderAds"), data);
      e.target.reset();
    } catch (error) {
      console.error("Error adding slider ad", error);
    }
  };

  const handleDeleteSliderAd = async (id: string) => {
    try {
      await deleteDoc(doc(db, "sliderAds", id));
    } catch (error) {
      console.error("Error deleting slider ad", error);
    }
  };

  const handleAddGridAd = async (e: any) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData);
    try {
      await addDoc(collection(db, "gridAds"), data);
      e.target.reset();
    } catch (error) {
      console.error("Error adding grid ad", error);
    }
  };

  const handleDeleteGridAd = async (id: string) => {
    try {
      await deleteDoc(doc(db, "gridAds", id));
    } catch (error) {
      console.error("Error deleting grid ad", error);
    }
  };

  const handleCheckChannels = async () => {
    setIsChecking(true);
    try {
      for (const ch of channels) {
        if (!ch.id) continue;
        try {
          // Note: This fetch is a health check for the stream URL, not a backend API call.
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3000);
          await fetch(ch.url, { method: 'HEAD', mode: 'no-cors', signal: controller.signal });
          clearTimeout(timeoutId);
          await updateDoc(doc(db, "channels", ch.id), { status: 'online' });
        } catch (e) {
          await updateDoc(doc(db, "channels", ch.id), { status: 'offline' });
        }
      }
    } catch (e) {
      console.error("Check failed", e);
    }
    setIsChecking(false);
  };

  const handleLogin = async () => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error: any) {
      alert("Login failed: " + error.message);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (error: any) {
      console.error("Logout failed", error);
    }
  };

  if (!adminAuth) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center p-6 font-['Inter']">
        <div className="w-full max-w-md bg-[#121214] p-10 rounded-[32px] border border-white/5 shadow-2xl">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-black tracking-tighter text-[#ff003c] mb-2">KURDFLUX<span className="text-white">+</span></h1>
            <p className="text-gray-500 text-sm font-bold uppercase tracking-widest">Admin Portal</p>
          </div>
          <div className="space-y-4">
            <div className="relative">
              <i className="fa-solid fa-envelope absolute left-4 top-1/2 -translate-y-1/2 text-gray-500"></i>
              <input 
                type="email" 
                placeholder="Admin Email" 
                className="w-full bg-white/5 border border-white/5 rounded-2xl py-4 pl-12 pr-4 text-white outline-none focus:border-[#ff003c]/50 transition-all"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="relative">
              <i className="fa-solid fa-lock absolute left-4 top-1/2 -translate-y-1/2 text-gray-500"></i>
              <input 
                type="password" 
                placeholder="Admin Password" 
                className="w-full bg-white/5 border border-white/5 rounded-2xl py-4 pl-12 pr-4 text-white outline-none focus:border-[#ff003c]/50 transition-all"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              />
            </div>
            <button 
              className="w-full bg-[#ff003c] text-white font-black py-4 rounded-2xl shadow-lg shadow-[#ff003c]/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
              onClick={handleLogin}
            >
              SIGN IN
            </button>
            <Link to="/" className="block w-full text-center text-gray-600 hover:text-white mt-6 text-xs font-bold uppercase tracking-widest transition-colors">Back to Application</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white font-['Inter'] flex relative">
      {/* Mobile Sidebar Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Admin Sidebar */}
      <aside className={`fixed lg:static inset-y-0 left-0 z-[110] w-64 bg-[#0a0a0c] border-r border-white/5 flex flex-col transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="p-8 flex items-center justify-between">
          <h1 className="text-xl font-black tracking-tighter text-[#ff003c]">ADMIN<span className="text-white">PANEL</span></h1>
          <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden text-gray-500 hover:text-white">
            <i className="fa-solid fa-xmark text-xl"></i>
          </button>
        </div>
        <nav className="flex-1 px-4 space-y-2">
          <div className="px-4 py-2 text-[10px] font-black text-gray-600 uppercase tracking-widest">Main</div>
          <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-[#ff003c]/10 text-[#ff003c] border-l-4 border-[#ff003c] font-bold text-sm">
            <i className="fa-solid fa-chart-line"></i> Dashboard
          </button>
          <Link to="/" className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-gray-500 hover:bg-white/5 hover:text-white transition-all font-bold text-sm">
            <i className="fa-solid fa-eye"></i> View App
          </Link>
        </nav>
        <div className="p-6 border-t border-white/5">
          <button onClick={handleLogout} className="w-full py-3 rounded-xl bg-white/5 text-gray-400 font-bold text-xs hover:bg-red-500/10 hover:text-red-500 transition-all">LOGOUT</button>
        </div>
      </aside>

      {/* Admin Main Content */}
      <main className="flex-1 overflow-y-auto p-4 md:p-10 space-y-6 md:space-y-10">
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden w-10 h-10 flex items-center justify-center bg-white/5 rounded-xl">
              <i className="fa-solid fa-bars"></i>
            </button>
            <div>
              <h2 className="text-2xl md:text-3xl font-black tracking-tight">DASHBOARD</h2>
              <p className="text-gray-500 text-xs md:text-sm font-medium">Manage your IPTV ecosystem</p>
            </div>
          </div>
          <button 
            onClick={handleCheckChannels}
            disabled={isChecking}
            className={`w-full md:w-auto px-6 py-3 rounded-2xl font-black text-xs tracking-widest flex items-center justify-center gap-3 transition-all ${isChecking ? 'bg-gray-800 text-gray-500' : 'bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-600/20'}`}
          >
            <i className={`fa-solid ${isChecking ? 'fa-spinner fa-spin' : 'fa-shield-heart'}`}></i>
            {isChecking ? 'CHECKING...' : 'HEALTH CHECK'}
          </button>
        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 md:gap-6">
          {[
            { label: 'Online Users', val: stats.onlineUsers, color: 'text-green-500', icon: 'fa-users' },
            { label: 'Total Visitors', val: stats.totalVisitors, color: 'text-white', icon: 'fa-globe' },
            { label: 'Total Channels', val: stats.totalChannels, color: 'text-white', icon: 'fa-tv' },
            { label: 'Healthy', val: stats.onlineChannels, color: 'text-emerald-400', icon: 'fa-circle-check' },
            { label: 'Offline', val: stats.offlineChannels, color: 'text-red-500', icon: 'fa-circle-xmark' },
          ].map((s, i) => (
            <div key={i} className="bg-[#121214] p-4 md:p-6 rounded-[24px] border border-white/5 shadow-xl">
              <div className="flex items-center justify-between mb-3 md:mb-4">
                <div className={`w-8 h-8 md:w-10 md:h-10 rounded-xl bg-white/5 flex items-center justify-center text-sm md:text-base ${s.color}`}>
                  <i className={`fa-solid ${s.icon}`}></i>
                </div>
              </div>
              <p className="text-gray-500 text-[9px] md:text-[10px] font-black uppercase tracking-widest">{s.label}</p>
              <p className={`text-xl md:text-3xl font-black mt-1 ${s.color}`}>{s.val}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 md:gap-10">
          {/* Channel Management */}
          <section className="bg-[#121214] p-6 md:p-8 rounded-[32px] border border-white/5 shadow-2xl">
            <h3 className="text-lg md:text-xl font-black mb-6 flex items-center gap-3">
              <span className="w-1.5 h-6 bg-[#ff003c] rounded-full"></span>
              CHANNELS
            </h3>
            <form onSubmit={handleAddChannel} className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
              <input name="name" placeholder="Name" className="bg-white/5 border border-white/5 rounded-xl p-3 text-sm outline-none focus:border-[#ff003c]/50" required />
              <input name="logo" placeholder="Logo URL" className="bg-white/5 border border-white/5 rounded-xl p-3 text-sm outline-none focus:border-[#ff003c]/50" required />
              <input name="url" placeholder="Stream URL" className="md:col-span-2 bg-white/5 border border-white/5 rounded-xl p-3 text-sm outline-none focus:border-[#ff003c]/50" required />
              <select name="type" className="bg-white/5 border border-white/5 rounded-xl p-3 text-sm outline-none">
                <option value="live">Live TV</option>
                <option value="movie">Movie</option>
                <option value="series">Series</option>
              </select>
              <select name="category" className="bg-white/5 border border-white/5 rounded-xl p-3 text-sm outline-none">
                <option value="Kurdistan">Kurdistan</option>
                <option value="Sports">Sports</option>
                <option value="News">News</option>
                <option value="Kids">Kids</option>
                <option value="Movies">Movies</option>
              </select>
              <button className="md:col-span-2 bg-[#ff003c] py-3 rounded-xl font-black text-xs tracking-widest shadow-lg shadow-[#ff003c]/20">ADD CONTENT</button>
            </form>
            
            <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2 no-scrollbar">
              {channels.map(ch => (
                <div key={ch.id} className="flex items-center justify-between bg-white/5 p-3 md:p-4 rounded-2xl border border-white/5 group hover:bg-white/10 transition-all">
                  <div className="flex items-center gap-3 md:gap-4">
                    <div className="w-10 h-10 md:w-12 md:h-12 rounded-xl bg-white p-2 flex items-center justify-center shrink-0">
                      <img src={ch.logo} className="max-w-full max-h-full object-contain" alt="" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs md:text-sm font-black group-hover:text-[#ff003c] transition-colors truncate">{ch.name}</div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[8px] md:text-[9px] font-black uppercase tracking-widest text-gray-500 bg-black/30 px-2 py-0.5 rounded-md">{ch.type || 'live'}</span>
                        <span className={`text-[8px] md:text-[9px] font-black uppercase tracking-widest ${ch.status === 'online' ? 'text-emerald-500' : 'text-red-500'}`}>
                          {ch.status || 'online'}
                        </span>
                      </div>
                    </div>
                  </div>
                  <button onClick={() => handleDeleteChannel(ch.id!)} className="w-8 h-8 md:w-10 md:h-10 rounded-xl bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white transition-all shrink-0">
                    <i className="fa-solid fa-trash-can text-xs md:text-sm"></i>
                  </button>
                </div>
              ))}
            </div>
          </section>

          <div className="space-y-6 md:space-y-10">
            {/* Slider Ads */}
            <section className="bg-[#121214] p-6 md:p-8 rounded-[32px] border border-white/5 shadow-2xl">
              <h3 className="text-lg md:text-xl font-black mb-6 flex items-center gap-3">
                <span className="w-1.5 h-6 bg-[#ff003c] rounded-full"></span>
                HERO SLIDER
              </h3>
              <form onSubmit={handleAddSliderAd} className="space-y-4 mb-6">
                <input name="image" placeholder="Image URL" className="w-full bg-white/5 border border-white/5 rounded-xl p-3 text-sm outline-none focus:border-[#ff003c]/50" required />
                <input name="link" placeholder="Link (Optional)" className="w-full bg-white/5 border border-white/5 rounded-xl p-3 text-sm outline-none focus:border-[#ff003c]/50" />
                <button className="w-full bg-[#ff003c] py-3 rounded-xl font-black text-xs tracking-widest">ADD SLIDE</button>
              </form>
              <div className="grid grid-cols-2 gap-3 md:gap-4">
                {sliderAds.map(ad => (
                  <div key={ad.id} className="relative group rounded-2xl overflow-hidden border border-white/5">
                    <img src={ad.image} className="w-full h-20 md:h-24 object-cover" alt="" />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all">
                      <button onClick={() => handleDeleteSliderAd(ad.id!)} className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-red-500 text-white"><i className="fa-solid fa-trash text-xs"></i></button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Grid Ads */}
            <section className="bg-[#121214] p-6 md:p-8 rounded-[32px] border border-white/5 shadow-2xl">
              <h3 className="text-lg md:text-xl font-black mb-6 flex items-center gap-3">
                <span className="w-1.5 h-6 bg-[#ff003c] rounded-full"></span>
                GRID ADS
              </h3>
              <form onSubmit={handleAddGridAd} className="space-y-4 mb-6">
                <input name="image" placeholder="Image URL" className="w-full bg-white/5 border border-white/5 rounded-xl p-3 text-sm outline-none focus:border-[#ff003c]/50" required />
                <input name="link" placeholder="Link (Optional)" className="w-full bg-white/5 border border-white/5 rounded-xl p-3 text-sm outline-none focus:border-[#ff003c]/50" />
                <button className="w-full bg-[#ff003c] py-3 rounded-xl font-black text-xs tracking-widest">ADD GRID AD</button>
              </form>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4">
                {gridAds.map(ad => (
                  <div key={ad.id} className="relative group rounded-2xl overflow-hidden border border-white/5">
                    <img src={ad.image} className="w-full h-16 md:h-20 object-cover" alt="" />
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all">
                      <button onClick={() => handleDeleteGridAd(ad.id!)} className="w-8 h-8 md:w-10 md:h-10 rounded-full bg-red-500 text-white"><i className="fa-solid fa-trash text-xs"></i></button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Notifications */}
            <section className="bg-[#121214] p-6 md:p-8 rounded-[32px] border border-white/5 shadow-2xl">
              <h3 className="text-lg md:text-xl font-black mb-6 flex items-center gap-3">
                <span className="w-1.5 h-6 bg-blue-600 rounded-full"></span>
                NOTIFICATIONS
              </h3>
              <form onSubmit={async (e: any) => {
                e.preventDefault();
                const formData = new FormData(e.target);
                const data = Object.fromEntries(formData);
                try {
                  await addDoc(collection(db, "notifications"), {
                    ...data,
                    created_at: new Date().toISOString()
                  });
                  e.target.reset();
                  alert('Sent!');
                } catch (error) {
                  console.error("Error sending notification", error);
                }
              }} className="space-y-4">
                <input name="title" placeholder="Title" className="w-full bg-white/5 border border-white/5 rounded-xl p-3 text-sm outline-none focus:border-blue-500/50" required />
                <textarea name="message" placeholder="Message" className="w-full bg-white/5 border border-white/5 rounded-xl p-3 text-sm outline-none h-24 focus:border-blue-500/50" required></textarea>
                <button className="w-full bg-blue-600 py-3 rounded-xl font-black text-xs tracking-widest flex items-center justify-center gap-3">
                  <i className="fa-solid fa-paper-plane"></i> BROADCAST
                </button>
              </form>
            </section>

            {/* Security (Firebase Auth handles this now) */}
            <section className="bg-[#121214] p-6 md:p-8 rounded-[32px] border border-white/5 shadow-2xl">
              <h3 className="text-lg md:text-xl font-black mb-6 flex items-center gap-3">
                <span className="w-1.5 h-6 bg-orange-500 rounded-full"></span>
                ACCOUNT
              </h3>
              <p className="text-gray-500 text-sm mb-4">Manage your admin account via Firebase Console.</p>
              <button onClick={handleLogout} className="w-full bg-red-600 py-3 rounded-xl font-black text-xs tracking-widest">LOGOUT</button>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
