
import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';
import { Message, UserProfile } from '../types';
import { SYSTEM_PROMPT } from '../constants';
import { db } from '../firebase';
import { doc, updateDoc, increment } from "firebase/firestore";

interface ChatModeProps {
  user: UserProfile;
  onUpdateUser: (newData: Partial<UserProfile>) => void;
}

const ChatMode: React.FC<ChatModeProps> = ({ user, onUpdateUser }) => {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: 'أهلاً بك! شماسي اليوم؟ شدور نساعدك فيه؟' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() && !image) return;

    if (!user.isAdmin && user.dailyMessagesCount >= 10) {
      setMessages(prev => [...prev, { role: 'assistant', content: 'لقد تجاوزت الحد المسموح به لليوم (10 رسائل). يمكنك العودة غداً.' }]);
      return;
    }

    const userMsg: Message = { role: 'user', content: input, image: image || undefined };
    setMessages(prev => [...prev, userMsg]);
    const currentInput = input;
    setInput('');
    setImage(null);
    setIsLoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      let contents: any;
      const brevityContext = " (أجب باختصار شديد جداً بالحسانية، لا تزد عن جملة واحدة) ";
      
      if (image) {
        contents = {
          parts: [
            { inlineData: { mimeType: 'image/jpeg', data: image.split(',')[1] } },
            { text: (currentInput || 'شنه هذا في الصورة؟') + brevityContext }
          ]
        };
      } else {
        contents = currentInput + brevityContext;
      }

      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: contents,
        config: {
          systemInstruction: SYSTEM_PROMPT + "\nتنبيه: أنت الآن في الدردشة النصية. الرد يجب أن يكون قصيراً جداً ومباشراً.",
          temperature: 0.8,
        }
      });

      const text = response.text || 'اسمحلي اخليكلي، ما كديت نرد حالن.';
      setMessages(prev => [...prev, { role: 'assistant', content: text }]);

      // Update usage count
      if (!user.isAdmin) {
        const newCount = user.dailyMessagesCount + 1;
        onUpdateUser({ dailyMessagesCount: newCount });
        const docRef = doc(db, "subscriptions", user.id);
        await updateDoc(docRef, {
          dailyMessagesCount: increment(1)
        });
      }
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { role: 'assistant', content: 'وقع مشكل، جرب مرة ثانية.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setImage(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="flex flex-col w-full h-full glass rounded-3xl overflow-hidden border-white/5 shadow-2xl bg-slate-900/20">
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}>
            <div className={`max-w-[85%] p-4 rounded-2xl shadow-sm ${msg.role === 'user' ? 'bg-slate-800 text-white rounded-tr-none' : 'bg-gradient-to-br from-purple-700 to-indigo-800 text-white rounded-tl-none'}`}>
              {msg.image && <img src={msg.image} alt="Uploaded" className="max-w-full h-auto rounded-lg mb-3 border border-white/10" />}
              <p className="leading-relaxed whitespace-pre-wrap text-sm">{msg.content}</p>
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-end">
            <div className="bg-purple-800/40 p-4 rounded-2xl animate-pulse">
              <div className="flex gap-1">
                <div className="w-1.5 h-1.5 bg-white rounded-full animate-bounce" />
                <div className="w-1.5 h-1.5 bg-white rounded-full animate-bounce [animation-delay:0.2s]" />
                <div className="w-1.5 h-1.5 bg-white rounded-full animate-bounce [animation-delay:0.4s]" />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="p-4 bg-slate-900/60 border-t border-white/5">
        {image && (
          <div className="relative inline-block mb-3">
            <img src={image} className="h-16 w-16 object-cover rounded-lg border border-purple-500" alt="Thumbnail" />
            <button onClick={() => setImage(null)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
            </button>
          </div>
        )}
        <div className="flex items-center gap-2">
          <label className="p-3 bg-slate-800 rounded-xl cursor-pointer hover:bg-slate-700 transition-colors">
            <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
          </label>
          <input 
            className="flex-1 bg-slate-800 rounded-xl p-3 focus:outline-none focus:ring-1 focus:ring-purple-500 text-white placeholder-slate-500 text-sm"
            placeholder="شتعدل حالن؟"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          />
          <button 
            onClick={handleSend}
            disabled={isLoading || (!input.trim() && !image)}
            className="p-3 bg-purple-600 rounded-xl hover:bg-purple-500 disabled:opacity-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-white rotate-180" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChatMode;