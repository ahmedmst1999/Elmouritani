
import React, { useState } from 'react';

interface LoginProps {
  onLogin: (email: string, pass: string) => Promise<void>;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await onLogin(email, password);
    } catch (err: any) {
      if (err.code === 'auth/network-request-failed') {
        setError("مشكلة في الاتصال بالإنترنت. يرجى المحاولة لاحقاً.");
      } else {
        setError("البيانات غير صحيحة. تواصل مع الدعم.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-sm flex flex-col items-center gap-6 animate-in slide-in-from-bottom-10 duration-700 mt-10">
      <div className="text-center space-y-2">
        <h2 className="text-2xl font-black text-white tracking-tight">مرحباً بك في الموريتاني</h2>
        <p className="text-slate-400 text-sm">سجل دخول</p>
      </div>

      <form onSubmit={handleSubmit} className="w-full space-y-4">
        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-400 mr-1">البريد الإلكتروني</label>
          <input 
            type="email" 
            placeholder="example@mail.com"
            required
            className="w-full bg-slate-800/50 border border-slate-700 rounded-2xl p-4 text-white focus:outline-none focus:ring-1 focus:ring-purple-500 transition-all placeholder:text-slate-600 text-sm"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-bold text-slate-400 mr-1">كلمة المرور</label>
          <input 
            type="password" 
            placeholder="••••••••"
            required
            className="w-full bg-slate-800/50 border border-slate-700 rounded-2xl p-4 text-white focus:outline-none focus:ring-1 focus:ring-purple-500 transition-all placeholder:text-slate-600 text-sm"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        
        {error && (
          <div className="text-red-400 text-[11px] text-center bg-red-400/5 p-3 rounded-xl border border-red-400/20">
            {error}
          </div>
        )}

        <button 
          type="submit"
          disabled={loading}
          className="w-full py-4 bg-gradient-to-r from-purple-600 to-indigo-700 rounded-2xl font-bold text-lg shadow-xl hover:opacity-90 disabled:opacity-50 transition-all"
        >
          {loading ? "جاري التحميل..." : "دخول"}
        </button>
      </form>

      <div className="flex flex-col items-center gap-3 w-full border-t border-white/5 pt-6">
        <a 
          href="https://api.whatsapp.com/send?phone=22237372793&text=السلام%20عليكم%20الموريتاني"
          target="_blank"
          rel="noopener noreferrer"
          className="w-full py-3 bg-green-600/10 border border-green-500/20 rounded-2xl text-center text-sm font-bold text-green-500 hover:bg-green-600/20 transition-colors flex items-center justify-center gap-2"
        >
          تواصل مع الدعم الفني
        </a>
      </div>
    </div>
  );
};

export default Login;