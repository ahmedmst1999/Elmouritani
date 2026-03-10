
export interface Message {
  role: 'user' | 'assistant';
  content: string;
  image?: string;
  isAudio?: boolean;
}

export interface UserProfile {
  id: string;
  isActive: boolean; // True means full access (Voice + Chat)
  isGuest?: boolean;
  isAdmin?: boolean;
  expiryDate?: Date;
  dailyMessagesCount: number;
  dailyVoiceMinutes: number;
  firstUsageAt: number | null;
}

export enum AppMode {
  VOICE = 'voice',
  CHAT = 'chat'
}
