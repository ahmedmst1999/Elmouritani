
import React, { useState, useEffect } from 'react';
import { auth, db } from './firebase';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp, Timestamp, enableIndexedDbPersistence } from "firebase/firestore";
import { AppMode, UserProfile } from './types';
import Header from './components/Header';
import VoiceMode from './components/VoiceMode';
import ChatMode from './components/ChatMode';
import Login from './components/Login';

try {
  enableIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
      console.warn("Firestore Persistence failed: Multiple tabs open.");
    } else if (err.code === 'unimplemented') {
      console.warn("Firestore Persistence is not supported by this browser.");
    }
  });
} catch (e) {}

const App: React.FC = () => {
  const [mode, setMode] = useState<AppMode>(AppMode.CHAT);
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const [bypassActive, setBypassActive] = useState(false);

  const getUserData = async (uid: string): Promise<UserProfile> => {
    try {
      const docRef = doc(db, "subscriptions", uid);
      const docSnap = await getDoc(docRef);
      const today = new Date().toISOString().split('T')[0];
      
      let startDate: Date;
      let durationDays: number;
      let dailyMessagesCount = 0;
      let dailyVoiceMinutes = 0;
      let lastUsageReset = today;
      let isActive = false;

      if (docSnap.exists()) {
        const data = docSnap.data();
        startDate = (data.startDate as Timestamp).toDate();
        durationDays = data.durationDays || 30;
        
        const expiryDate = new Date(startDate);
        expiryDate.setDate(expiryDate.getDate() + durationDays);
        isActive = new Date() <= expiryDate;

        lastUsageReset = data.lastUsageReset || today;
        if (lastUsageReset !== today) {
          dailyMessagesCount = 0;
          dailyVoiceMinutes = 0;
          lastUsageReset = today;
          await setDoc(docRef, { lastUsageReset, dailyMessagesCount, dailyVoiceMinutes }, { merge: true });
        } else {
          dailyMessagesCount = data.dailyMessagesCount || 0;
          dailyVoiceMinutes = data.dailyVoiceMinutes || 0;
        }
      } else {
        startDate = new Date();
        durationDays = 30;
        isActive = true;
        try {
          await setDoc(docRef, {
            startDate: serverTimestamp(),
            durationDays: 30,
            dailyMessagesCount: 0,
            dailyVoiceMinutes: 0,
            lastUsageReset: today
          });
        } catch (setErr) {
          console.error("SetDoc error:", setErr);
        }
      }

      return {
        id: uid,
        isActive,
        dailyMessagesCount,
        dailyVoiceMinutes,
        lastUsageReset
      };
    } catch (error: any) {
      console.error("Fetch user data failed:", error);
      return {
        id: uid,
        isActive: true,
        dailyMessagesCount: 0,
        dailyVoiceMinutes: 0,
        lastUsageReset: new Date().toISOString().split('T')[0]
      }; 
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setIsAuthChecking(true);
      if (firebaseUser) {
        const userData = await getUserData(firebaseUser.uid);
        setUser(userData);
      } else if (!bypassActive) {
        setUser(null);
      }
      setIsAuthChecking(false);
    });
    return () => unsubscribe();
  }, [bypassActive]);

  const handleSecretBypass = () => {
    setBypassActive(true);
    setUser({
      id: 'admin_bypass',
      isActive: true,
      isAdmin: true,
      dailyMessagesCount: 0,
      dailyVoiceMinutes: 0,
      lastUsageReset: new Date().toISOString().split('T')[0]
    });
    alert("تم تفعيل وضع المسؤول");
  };

  const handleLogout = async () => {
    await signOut(auth);
    setBypassActive(false);
    setUser(null);
  };

  const handleLogin = async (email: string, pass: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, pass);
    } catch (error) {
      console.error("Login error:", error);
      throw error;
    }
  };

  if (isAuthChecking) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-950">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-purple-500/20 border-t-purple-500 rounded-full animate-spin"></div>
          <p className="text-slate-500 text-xs font-bold animate-pulse">جاري التحميل...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col h-screen max-w-md mx-auto bg-slate-950 items-center justify-center p-6 overflow-hidden">
        <Header onSecretBypass={handleSecretBypass} user={null} onLogout={() => {}} />
        <Login onLogin={handleLogin} />
      </div>
    );
  }

  const renderContent = () => {
    const onUpdateUser = (newData: Partial<UserProfile>) => {
      setUser(prev => prev ? { ...prev, ...newData } : null);
    };

    switch (mode) {
      case AppMode.VOICE:
        return <VoiceMode user={user} onUpdateUser={onUpdateUser} />;
      case AppMode.CHAT:
        return <ChatMode user={user} onUpdateUser={onUpdateUser} />;
      default:
        return <ChatMode user={user} onUpdateUser={onUpdateUser} />;
    }
  };

  return (
    <div className="flex flex-col h-screen max-w-md mx-auto relative overflow-hidden bg-slate-950">
      <Header 
        onSecretBypass={handleSecretBypass}
        user={user}
        onLogout={handleLogout}
      />
      
      <main className="flex-1 flex flex-col items-center justify-center p-6 pb-24 overflow-y-auto">
        {renderContent()}
      </main>

      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto h-20 glass border-t border-white/5 flex items-center justify-around px-4 z-40">
        <button 
          onClick={() => setMode(AppMode.CHAT)}
          className={`flex flex-col items-center gap-1 transition-colors ${mode === AppMode.CHAT ? 'text-purple-400' : 'text-slate-400'}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          <span className="text-[10px] font-bold">الدردشة</span>
        </button>

        <button 
          onClick={() => setMode(AppMode.VOICE)}
          className={`relative -top-6 w-16 h-16 rounded-full glass border-2 flex items-center justify-center transition-all ${mode === AppMode.VOICE ? 'border-purple-500 bg-purple-600/20 scale-110' : 'border-slate-700 text-slate-400'}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className={`w-8 h-8 ${mode === AppMode.VOICE ? 'text-white' : 'text-slate-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
          </svg>
        </button>

        <a 
          href="https://api.whatsapp.com/send?phone=22230707095&text=السلام%20عليكم%20الموريتاني،%20أريد%20تفعيل%20اشتراكي"
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-col items-center gap-1 text-slate-400 hover:text-purple-400 transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
          <span className="text-[10px] font-bold">تواصل مع الدعم</span>
        </a>
      </nav>
    </div>
  );
};

export default App;