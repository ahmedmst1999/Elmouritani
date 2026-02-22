
import React, { useState } from 'react';
import { UserProfile } from '../types';

interface HeaderProps {
  onSecretBypass: () => void;
  user: UserProfile | null;
  onLogout: () => void;
}

const Header: React.FC<HeaderProps> = ({ onSecretBypass, user, onLogout }) => {
  const [clickCount, setClickCount] = useState(0);

  const handleTitleClick = () => {
    const newCount = clickCount + 1;
    setClickCount(newCount);
    if (newCount >= 5) {
      onSecretBypass();
      setClickCount(0);
    }
  };

  return (
    <header className="flex items-center justify-between px-6 py-4 glass sticky top-0 z-40">
      <div className="flex items-center gap-3">
        <div 
          onClick={handleTitleClick}
          className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-600 to-indigo-700 flex items-center justify-center text-xl font-black text-white shadow-lg cursor-pointer active:scale-95 transition-transform"
        >
          م
        </div>
        <h1 
          className="text-lg font-extrabold tracking-tight cursor-default select-none bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400"
        >
          الموريتاني
        </h1>
      </div>

      <div className="flex items-center gap-3">
        {user && (
          <div className="flex items-center gap-2">
            <span className="bg-purple-500/10 text-purple-500 text-[9px] font-bold px-2 py-0.5 rounded-full border border-purple-500/20">
              نشـط
            </span>
            <button 
              onClick={onLogout}
              className="p-2 hover:bg-white/5 rounded-full transition-colors text-slate-400 hover:text-red-400"
              title="تسجيل الخروج"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;