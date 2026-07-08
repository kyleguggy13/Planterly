// firebase.js

// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  getFirestore,
  collection,
  doc,
  setDoc,
  deleteDoc,
  getDocs,
  getDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";


// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAgaTsP4ExxzHisv8-V-sUy1XK29azD7eI",
  authDomain: "planterly-data.firebaseapp.com",
  projectId: "planterly-data",
  storageBucket: "planterly-data.firebasestorage.app",
  messagingSenderId: "275892702436",
  appId: "1:275892702436:web:a03a7cfc3c5b91ab9ef0f1",
  measurementId: "G-XHD08RYSXP"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
let analytics = null;
let analyticsLogEvent = null;
let analyticsReady = null;

// Initialize services
export const auth = getAuth(app);
export const db = getFirestore(app);

function getAnalyticsReady() {
  if (!analyticsReady) {
    analyticsReady = import("https://www.gstatic.com/firebasejs/10.12.5/firebase-analytics.js")
      .then(async ({ getAnalytics, isSupported, logEvent }) => {
        if (!(await isSupported())) return null;
        analytics = getAnalytics(app);
        analyticsLogEvent = logEvent;
        return analytics;
      })
      .catch(() => null);
  }

  return analyticsReady;
}

export async function trackAnalyticsEvent(eventName, eventParams = {}) {
  try {
    const activeAnalytics = analytics || await getAnalyticsReady();
    if (!activeAnalytics || typeof analyticsLogEvent !== "function") return;
    analyticsLogEvent(activeAnalytics, eventName, eventParams);
  } catch (_) {
    analytics = null;
    analyticsLogEvent = null;
    analyticsReady = Promise.resolve(null);
  }
}

// Google sign-in provider
const googleProvider = new GoogleAuthProvider();

// Sign in
export async function signInWithGoogle() {
  return await signInWithPopup(auth, googleProvider);
}

// Sign out
export async function logOut() {
  return await signOut(auth);
}

// Watch login state
export function watchAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export function getPlantDocId(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[\/\\]+/g, "-")
    .replace(/\s+/g, "-");
}

const PLANT_REMINDER_DOC_ID = "plantReminder";

export async function saveNotificationPreference(uid, preferenceData) {
  const preferenceRef = doc(db, "users", uid, "notificationPreferences", PLANT_REMINDER_DOC_ID);

  await setDoc(preferenceRef, {
    ...preferenceData,
    updatedAt: serverTimestamp()
  }, { merge: true });
}

export async function loadNotificationPreference(uid) {
  const preferenceRef = doc(db, "users", uid, "notificationPreferences", PLANT_REMINDER_DOC_ID);
  const snapshot = await getDoc(preferenceRef);
  return snapshot.exists() ? snapshot.data() : null;
}

export async function savePushSubscription(uid, subscriptionId, subscriptionData) {
  const subscriptionRef = doc(db, "users", uid, "pushSubscriptions", subscriptionId);

  await setDoc(subscriptionRef, {
    ...subscriptionData,
    enabled: true,
    updatedAt: serverTimestamp(),
    createdAt: subscriptionData.createdAt || serverTimestamp()
  }, { merge: true });
}

export async function disablePushSubscription(uid, subscriptionId) {
  const subscriptionRef = doc(db, "users", uid, "pushSubscriptions", subscriptionId);

  await setDoc(subscriptionRef, {
    enabled: false,
    updatedAt: serverTimestamp()
  }, { merge: true });
}

// Save one meal
export async function saveMeal(uid, mealId, mealData) {
  const mealRef = doc(db, "users", uid, "meals", mealId);

  await setDoc(mealRef, {
    ...mealData,
    updatedAt: serverTimestamp()
  }, { merge: true });
}

// Save one plant/library item
export async function savePlant(uid, plantId, plantData) {
  const plantRef = doc(db, "users", uid, "library", plantId);

  await setDoc(plantRef, {
    ...plantData,
    updatedAt: serverTimestamp()
  }, { merge: true });
}

export async function deleteMeal(uid, mealId) {
  const mealRef = doc(db, "users", uid, "meals", mealId);
  await deleteDoc(mealRef);
}

export async function deletePlant(uid, plantId) {
  const plantRef = doc(db, "users", uid, "library", plantId);
  await deleteDoc(plantRef);
}

// Load all meals
export async function loadMeals(uid) {
  const mealsRef = collection(db, "users", uid, "meals");
  const snapshot = await getDocs(mealsRef);

  return snapshot.docs.map(snapshotDoc => {
    const data = snapshotDoc.data();
    const numericId = Number(snapshotDoc.id);

    return {
      id: Number.isFinite(numericId) ? numericId : snapshotDoc.id,
      date: data.date,
      week: data.week,
      meal: data.meal,
      plants: Array.isArray(data.plants) ? data.plants : []
    };
  });
}

// Load all plants/library items
export async function loadLibrary(uid) {
  const libraryRef = collection(db, "users", uid, "library");
  const snapshot = await getDocs(libraryRef);

  return snapshot.docs.map(snapshotDoc => {
    const data = snapshotDoc.data();

    return {
      id: snapshotDoc.id,
      name: data.name,
      cat: data.cat
    };
  });
}

export async function loadUserData(uid) {
  const [meals, library] = await Promise.all([
    loadMeals(uid),
    loadLibrary(uid)
  ]);

  return {
    meals,
    library,
    isEmpty: meals.length === 0 && library.length === 0
  };
}
