import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDQpr2uNaLZj1ft1ymXKQx_ys8BjUQPM6E",
  authDomain: "ghaithapp-3ad22.firebaseapp.com",
  projectId: "ghaithapp-3ad22",
  storageBucket: "ghaithapp-3ad22.firebasestorage.app",
  messagingSenderId: "426307965082",
  appId: "1:426307965082:android:1f58e5c44af440f44d4f23"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export default app;
