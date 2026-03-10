
import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { UserProfile } from '../types';
import { SYSTEM_PROMPT } from '../constants';
import { db } from '../firebase';
import { doc, updateDoc, increment } from "firebase/firestore";

interface VoiceModeProps {
  user: UserProfile;
  onUpdateUser: (newData: Partial<UserProfile>) => void;
}

const VoiceMode: React.FC<VoiceModeProps> = ({ user, onUpdateUser }) => {
  const [isActive, setIsActive] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isResponding, setIsResponding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [limitReached, setLimitReached] = useState(false);

  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const nextStartTimeRef = useRef(0);
  const sourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  const sessionRef = useRef<any>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const reconnectTimeoutRef = useRef<any>(null);
  const isComponentMounted = useRef(true);
  const startTimeRef = useRef<number | null>(null);
  const durationIntervalRef = useRef<any>(null);

  const stopSession = (fullStop = true) => {
    if (fullStop) {
      setIsActive(false);
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
      
      // Update duration in firestore if session was active
      if (startTimeRef.current) {
        const elapsedMs = Date.now() - startTimeRef.current;
        const elapsedMinutes = elapsedMs / (1000 * 60);
        updateVoiceDuration(elapsedMinutes);
        startTimeRef.current = null;
      }
    }
    
    setIsListening(false);
    setIsResponding(false);

    if (sessionRef.current) {
      try { sessionRef.current.close(); } catch (e) {}
      sessionRef.current = null;
    }
    
    if (fullStop) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      if (inputAudioContextRef.current) {
        inputAudioContextRef.current.close().catch(console.error);
        inputAudioContextRef.current = null;
      }
      if (outputAudioContextRef.current) {
        outputAudioContextRef.current.close().catch(console.error);
        outputAudioContextRef.current = null;
      }
    }

    sourcesRef.current.forEach(source => { try { source.stop(); source.disconnect(); } catch(e) {} });
    sourcesRef.current.clear();
    
    if (processorRef.current) {
      processorRef.current.onaudioprocess = null;
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    
    nextStartTimeRef.current = 0;
  };

  const updateVoiceDuration = async (minutes: number) => {
    if (user.isAdmin || minutes <= 0) return;
    try {
      const isFirstUsage = !user.firstUsageAt && user.dailyMessagesCount === 0 && user.dailyVoiceMinutes === 0;
      const firstUsageAt = isFirstUsage ? Date.now() : user.firstUsageAt;

      const docRef = doc(db, "subscriptions", user.id);
      const updateData: any = {
        dailyVoiceMinutes: increment(minutes)
      };
      if (isFirstUsage) {
        updateData.firstUsageAt = firstUsageAt;
      }
      await updateDoc(docRef, updateData);
      onUpdateUser({ 
        dailyVoiceMinutes: user.dailyVoiceMinutes + minutes,
        firstUsageAt: firstUsageAt
      });
    } catch (e) {
      console.error("Failed to update voice duration:", e);
    }
  };

  const startSession = async () => {
    if (!user.isActive || !isComponentMounted.current) return;
    
    if (!user.isAdmin && user.dailyVoiceMinutes >= 10) {
      setLimitReached(true);
      return;
    }

    try {
      stopSession(false);
      setIsActive(true);
      setError(null);
      setLimitReached(false);
      startTimeRef.current = Date.now();

      // Track duration every minute
      durationIntervalRef.current = setInterval(() => {
        if (startTimeRef.current) {
          const elapsedMs = Date.now() - startTimeRef.current;
          const totalMinutes = user.dailyVoiceMinutes + (elapsedMs / (1000 * 60));
          
          if (!user.isAdmin && totalMinutes >= 10) {
            stopSession(true);
            setLimitReached(true);
          }
        }
      }, 30000); // Check every 30 seconds

      const AudioContextClass = (window.AudioContext || (window as any).webkitAudioContext);
      
      if (!inputAudioContextRef.current) {
        inputAudioContextRef.current = new AudioContextClass({ sampleRate: 16000 });
      }
      if (!outputAudioContextRef.current) {
        outputAudioContextRef.current = new AudioContextClass({ sampleRate: 24000 });
      }

      await inputAudioContextRef.current.resume();
      await outputAudioContextRef.current.resume();

      if (!streamRef.current) {
        streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      
      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',
        callbacks: {
          onopen: () => {
            if (!inputAudioContextRef.current || !streamRef.current) return;
            
            const source = inputAudioContextRef.current.createMediaStreamSource(streamRef.current);
            const scriptProcessor = inputAudioContextRef.current.createScriptProcessor(4096, 1, 1);
            processorRef.current = scriptProcessor;

            scriptProcessor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const pcmBlob = createPcmBlob(inputData);
              sessionPromise.then((session) => {
                session.sendRealtimeInput({ media: pcmBlob });
              });
            };

            source.connect(scriptProcessor);
            scriptProcessor.connect(inputAudioContextRef.current.destination);
            setIsListening(true);
          },
          onmessage: async (message: LiveServerMessage) => {
            const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
            if (audioData && outputAudioContextRef.current) {
              setIsResponding(true); 
              setIsListening(false);
              
              const audioCtx = outputAudioContextRef.current;
              nextStartTimeRef.current = Math.max(nextStartTimeRef.current, audioCtx.currentTime);
              
              const decodedBytes = decodeBase64(audioData);
              const audioBuffer = await decodeAudioData(decodedBytes, audioCtx, 24000, 1);
              
              const source = audioCtx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(audioCtx.destination);
              
              source.onended = () => {
                sourcesRef.current.delete(source); 
                source.disconnect();
                if (sourcesRef.current.size === 0) {
                  setIsResponding(false);
                  setIsListening(true);
                }
              };

              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              sourcesRef.current.add(source);
            }

            if (message.serverContent?.interrupted) {
              sourcesRef.current.forEach(s => { try { s.stop(); s.disconnect(); } catch(e) {} });
              sourcesRef.current.clear();
              nextStartTimeRef.current = 0;
              setIsResponding(false);
              setIsListening(true);
            }
            
            if (message.serverContent?.turnComplete) {
              setIsResponding(false);
              setIsListening(true);
            }
          },
          onerror: (e) => { 
            console.error("Live API Error:", e);
            if (isActive && isComponentMounted.current) {
              reconnectTimeoutRef.current = setTimeout(startSession, 2000);
            }
          },
          onclose: (e) => {
            console.log("Live API Closed:", e);
            if (isActive && isComponentMounted.current) {
              reconnectTimeoutRef.current = setTimeout(startSession, 1000);
            }
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { 
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Charon' } } 
          },
          systemInstruction: SYSTEM_PROMPT + "\nتنبيه هام: أنت في جلسة صوتية مستمرة. أجب دائماً باختصار طبيعي وودود. استمر في الاستماع دوماً.",
        }
      });
      
      sessionRef.current = await sessionPromise;
    } catch (err) {
      console.error("Failed to start voice session:", err);
      if (isActive && isComponentMounted.current) {
        reconnectTimeoutRef.current = setTimeout(startSession, 3000);
      }
    }
  };

  function createPcmBlob(data: Float32Array) {
    const l = data.length; 
    const int16 = new Int16Array(l);
    for (let i = 0; i < l; i++) int16[i] = data[i] * 32768;
    return { data: encodeBase64(new Uint8Array(int16.buffer)), mimeType: 'audio/pcm;rate=16000' };
  }

  function encodeBase64(bytes: Uint8Array) {
    let binary = ''; 
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]); 
    return btoa(binary);
  }

  function decodeBase64(base64: string) {
    const binaryString = atob(base64); 
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i); 
    return bytes;
  }

  async function decodeAudioData(data: Uint8Array, ctx: AudioContext, sampleRate: number, numChannels: number) {
    const dataInt16 = new Int16Array(data.buffer); 
    const frameCount = dataInt16.length / numChannels;
    const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);
    for (let channel = 0; channel < numChannels; channel++) {
      const channelData = buffer.getChannelData(channel);
      for (let i = 0; i < frameCount; i++) channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
    return buffer;
  }

  useEffect(() => {
    isComponentMounted.current = true;
    return () => {
      isComponentMounted.current = false;
      stopSession(true);
    };
  }, []);

  if (limitReached) {
    return (
      <div className="flex flex-col items-center justify-center w-full h-full text-center space-y-8 animate-in fade-in duration-700">
        <div className="w-48 h-48 rounded-full flex items-center justify-center bg-slate-900 border-2 border-slate-800 shadow-2xl relative">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-20 w-20 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        <div className="space-y-4 px-4">
          <h2 className="text-xl font-bold text-white leading-relaxed">لقد تجاوزت الحد المسموح به في اليوم</h2>
          <p className="text-slate-400">يمكنك العودة غداً لمواصلة التحدث.</p>
        </div>
      </div>
    );
  }

  if (!user.isActive) {
    return (
      <div className="flex flex-col items-center justify-center w-full h-full text-center space-y-8 animate-in fade-in duration-700">
        <div className="w-48 h-48 rounded-full flex items-center justify-center bg-slate-900 border-2 border-slate-800 shadow-2xl relative">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-20 w-20 text-slate-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
        </div>
        <div className="space-y-4 px-4">
          <h2 className="text-xl font-bold text-white leading-relaxed">هذه الميزة متاحة للمشتركين فقط. تواصل معنا لتفعيل حسابك الآن.</h2>
          <div className="pt-4">
            <a 
              href="https://api.whatsapp.com/send?phone=22237372793&text=السلام%20عليكم%20الموريتاني" 
              target="_blank" 
              rel="noopener noreferrer"
              className="inline-flex items-center gap-3 px-10 py-4 bg-green-600 rounded-full font-bold text-white shadow-xl hover:bg-green-500 transition-all active:scale-95"
            >
              تواصل مع الدعم
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center w-full h-full text-center space-y-12">
      <div className="relative">
        <div className={`w-48 h-48 rounded-full transition-all duration-700 flex items-center justify-center ${isActive ? 'animate-pulse-orb' : 'scale-90 opacity-50'} bg-gradient-to-br from-indigo-600 via-purple-700 to-indigo-900 shadow-[0_0_50px_rgba(124,58,237,0.3)]`}>
          {isActive ? (
            <div className="flex items-center gap-1">
              {[...Array(5)].map((_, i) => (
                <div key={i} className={`w-1.5 bg-white/80 rounded-full transition-all duration-300 ${isResponding ? 'h-12' : isListening ? 'h-6 animate-bounce' : 'h-1'}`} style={{ animationDelay: `${i * 0.1}s`, height: isResponding ? `${Math.random() * 40 + 20}px` : undefined }} />
              ))}
            </div>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-16 w-16 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
          )}
        </div>
        <div className="absolute -bottom-16 left-1/2 -translate-x-1/2 w-max text-center">
          <h2 className="text-xl font-bold text-white mb-1 tracking-tight">{!isActive ? 'اضغط للبدء' : isResponding ? 'الموريتاني يتحدث...' : isListening ? 'تفضل، أنا أسمعك...' : 'جاري الاتصال...'}</h2>
          <p className="text-slate-400 text-sm">باللهجة الحسانية الموريتانية</p>
        </div>
      </div>
      <div className="pt-20 space-y-4">
        {error && <p className="text-red-400 text-xs bg-red-400/5 px-4 py-2 rounded-lg">{error}</p>}
        {!isActive ? (
          <button onClick={startSession} className="px-12 py-4 bg-purple-600 rounded-full font-bold text-lg hover:bg-purple-500 transition-all shadow-xl active:scale-95 shadow-purple-900/20">تكلم مع الموريتاني</button>
        ) : (
          <button onClick={() => stopSession(true)} className="px-10 py-3 bg-slate-800/80 border border-slate-700 rounded-full font-bold text-white hover:bg-slate-700 transition-all flex items-center gap-2 active:scale-95">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />إنهاء الجلسة
          </button>
        )}
      </div>
    </div>
  );
};

export default VoiceMode;