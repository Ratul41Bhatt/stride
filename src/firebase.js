import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBiI70bMS3xeUDe3CuqBMRnICVDnnWYyiw",
  authDomain: "ffms-ba30d.firebaseapp.com",
  projectId: "ffms-ba30d",
  storageBucket: "ffms-ba30d.firebasestorage.app",
  messagingSenderId: "622749035355",
  appId: "1:622749035355:web:86a111a9eb482a5a54dbce"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
