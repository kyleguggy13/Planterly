import {
  signInWithGoogle,
  logOut,
  watchAuth,
  saveMeal,
  savePlant,
  deleteMeal,
  deletePlant,
  loadUserData,
  getPlantDocId,
  saveNotificationPreference,
  loadNotificationPreference,
  savePushSubscription,
  disablePushSubscription,
  trackAnalyticsEvent
} from "./firebase.js";

const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const userStatus = document.getElementById("userStatus");
const enableNotificationsBtn = document.getElementById("enable-notifications-btn");
const disableNotificationsBtn = document.getElementById("disable-notifications-btn");
const notificationStatus = document.getElementById("notification-status");

let currentUser = null;
let authSyncInFlight = false;
let authSyncToken = 0;
let notificationPreference = null;
let notificationStatusOverride = "";
let serviceWorkerRegistrationPromise = null;

const REMINDER_HOUR = 21;
const REMINDER_MINUTE = 0;
const REMINDER_TIME_LABEL = "9:00 PM";
const PLANTERLY_VAPID_PUBLIC_KEY = "BH4FNBbz4b1AvUCk0cc5DT9EE4bjMjDJWdiNOwUzcU5xrVZLKyF3hx7qz4O50wYF-u895wB34koKhQZZ1GNMJRE";
const VAPID_PUBLIC_KEY_CONFIGURED = Boolean(
  PLANTERLY_VAPID_PUBLIC_KEY &&
  PLANTERLY_VAPID_PUBLIC_KEY !== "BH4FNBbz4b1AvUCk0cc5DT9EE4bjMjDJWdiNOwUzcU5xrVZLKyF3hx7qz4O50wYF-u895wB34koKhQZZ1GNMJRE"
);

const SCREEN_TITLES = {
  log: "Log meal",
  history: "History",
  library: "Plant library"
};

function getAppBridge() {
  return window.planterlyApp || null;
}

function setUserStatus(text) {
  userStatus.textContent = text;
}

function setAuthControls(user) {
  if (user) {
    loginBtn.style.display = "none";
    logoutBtn.style.display = "inline-block";
    return;
  }

  loginBtn.style.display = "inline-block";
  logoutBtn.style.display = "none";
}

function getActivePageName() {
  return document.querySelector(".nav-item.active")?.dataset.page || "log";
}

function trackEvent(eventName, eventParams = {}) {
  void trackAnalyticsEvent(eventName, eventParams);
}

function trackScreenView(page = getActivePageName()) {
  trackEvent("screen_view", {
    firebase_screen: page,
    firebase_screen_class: "Planterly",
    page_title: SCREEN_TITLES[page] || page
  });
}

function getLocalTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function isIOSDevice() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandaloneApp() {
  return window.matchMedia?.("(display-mode: standalone)")?.matches || window.navigator.standalone === true;
}

function getNotificationCapability() {
  if (!window.isSecureContext) {
    return { ok: false, reason: "secure-context", message: "Open Planterly over HTTPS to enable reminders." };
  }

  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
    return { ok: false, reason: "unsupported", message: "Push reminders are not supported in this browser." };
  }

  if (!VAPID_PUBLIC_KEY_CONFIGURED) {
    return { ok: false, reason: "not-configured", message: "Push reminders need a VAPID public key before they can be enabled." };
  }

  if (isIOSDevice() && !isStandaloneApp()) {
    return { ok: false, reason: "ios-home-screen", message: "Add Planterly to your iPhone Home Screen to enable reminders." };
  }

  return { ok: true };
}

function setNotificationStatus(text) {
  if (notificationStatus) notificationStatus.textContent = text;
}

function renderNotificationControls(message = "") {
  if (!enableNotificationsBtn || !disableNotificationsBtn || !notificationStatus) return;

  const capability = getNotificationCapability();
  const enabled = Boolean(notificationPreference?.enabled);
  enableNotificationsBtn.hidden = enabled;
  disableNotificationsBtn.hidden = !enabled;
  enableNotificationsBtn.disabled = true;
  disableNotificationsBtn.disabled = !currentUser;

  if (!currentUser) {
    notificationStatusOverride = "";
    setNotificationStatus("Sign in to enable reminders.");
    return;
  }

  if (!capability.ok) {
    notificationStatusOverride = "";
    setNotificationStatus(capability.message);
    return;
  }

  if (Notification.permission === "denied") {
    notificationStatusOverride = "";
    setNotificationStatus("Notification permission is blocked in this browser.");
    return;
  }

  enableNotificationsBtn.disabled = false;
  disableNotificationsBtn.disabled = false;

  if (message) {
    notificationStatusOverride = message;
    setNotificationStatus(message);
    return;
  }

  if (notificationStatusOverride) {
    setNotificationStatus(notificationStatusOverride);
    return;
  }

  if (enabled) {
    const timezone = notificationPreference.timezone || getLocalTimeZone();
    setNotificationStatus(`On at ${REMINDER_TIME_LABEL} (${timezone}).`);
    return;
  }

  setNotificationStatus(`Off. Enable a ${REMINDER_TIME_LABEL} reminder.`);
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

function arrayBufferToBase64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach(byte => {
    binary += String.fromCharCode(byte);
  });
  return window.btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function getSubscriptionId(endpoint) {
  if (window.crypto?.subtle && window.TextEncoder) {
    const endpointHash = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
    return arrayBufferToBase64Url(endpointHash);
  }

  return window.btoa(endpoint).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "").slice(0, 120);
}

function registerPlanterlyServiceWorker() {
  if (!("serviceWorker" in navigator) || !window.isSecureContext) return Promise.resolve(null);

  if (!serviceWorkerRegistrationPromise) {
    serviceWorkerRegistrationPromise = navigator.serviceWorker.register("./sw.js", { scope: "./" });
  }

  return serviceWorkerRegistrationPromise;
}

async function getReadyServiceWorkerRegistration() {
  await registerPlanterlyServiceWorker();
  return await navigator.serviceWorker.ready;
}

function getPushSubscriptionPayload(subscription) {
  const subscriptionJson = subscription.toJSON();
  return {
    endpoint: subscriptionJson.endpoint,
    expirationTime: subscriptionJson.expirationTime || null,
    keys: {
      p256dh: subscriptionJson.keys?.p256dh || "",
      auth: subscriptionJson.keys?.auth || ""
    },
    userAgent: navigator.userAgent,
    timezone: getLocalTimeZone()
  };
}

async function refreshEnabledReminderTimezone() {
  if (!currentUser || !notificationPreference?.enabled) return;
  const timezone = getLocalTimeZone();
  if (notificationPreference.timezone === timezone) return;

  await saveNotificationPreference(currentUser.uid, {
    enabled: true,
    timezone,
    hour: REMINDER_HOUR,
    minute: REMINDER_MINUTE
  });
  notificationPreference = { ...notificationPreference, timezone };
}

async function syncNotificationPreference() {
  notificationStatusOverride = "";

  if (!currentUser) {
    notificationPreference = null;
    renderNotificationControls();
    return;
  }

  try {
    notificationPreference = await loadNotificationPreference(currentUser.uid);
    await refreshEnabledReminderTimezone();
    renderNotificationControls();
  } catch (error) {
    console.error("Notification preference error:", error);
    renderNotificationControls("Could not load reminder settings.");
  }
}

async function enablePlantReminders() {
  if (!currentUser) {
    renderNotificationControls("Sign in to enable reminders.");
    return;
  }

  const capability = getNotificationCapability();
  if (!capability.ok) {
    renderNotificationControls(capability.message);
    return;
  }

  try {
    enableNotificationsBtn.disabled = true;
    renderNotificationControls("Requesting notification permission...");

    const permission = Notification.permission === "granted"
      ? "granted"
      : await Notification.requestPermission();

    if (permission !== "granted") {
      renderNotificationControls("Notification permission was not granted.");
      return;
    }

    const registration = await getReadyServiceWorkerRegistration();
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(PLANTERLY_VAPID_PUBLIC_KEY)
      });
    }

    const subscriptionId = await getSubscriptionId(subscription.endpoint);
    const timezone = getLocalTimeZone();

    await Promise.all([
      saveNotificationPreference(currentUser.uid, {
        enabled: true,
        timezone,
        hour: REMINDER_HOUR,
        minute: REMINDER_MINUTE
      }),
      savePushSubscription(currentUser.uid, subscriptionId, getPushSubscriptionPayload(subscription))
    ]);

    notificationPreference = {
      enabled: true,
      timezone,
      hour: REMINDER_HOUR,
      minute: REMINDER_MINUTE
    };
    trackEvent("plant_reminder_enabled", { timezone });
    renderNotificationControls(`On at ${REMINDER_TIME_LABEL} (${timezone}).`);
  } catch (error) {
    console.error("Enable reminders error:", error);
    renderNotificationControls(error.message || "Could not enable reminders.");
  }
}

async function disablePlantReminders() {
  if (!currentUser) {
    renderNotificationControls("Sign in to change reminders.");
    return;
  }

  try {
    disableNotificationsBtn.disabled = true;
    renderNotificationControls("Disabling reminders...");

    await saveNotificationPreference(currentUser.uid, {
      enabled: false,
      timezone: getLocalTimeZone(),
      hour: REMINDER_HOUR,
      minute: REMINDER_MINUTE
    });

    if ("serviceWorker" in navigator && window.isSecureContext) {
      const registration = await getReadyServiceWorkerRegistration();
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const subscriptionId = await getSubscriptionId(subscription.endpoint);
        await disablePushSubscription(currentUser.uid, subscriptionId);
        await subscription.unsubscribe();
      }
    }

    notificationPreference = {
      enabled: false,
      timezone: getLocalTimeZone(),
      hour: REMINDER_HOUR,
      minute: REMINDER_MINUTE
    };
    trackEvent("plant_reminder_disabled");
    renderNotificationControls("Reminders are off.");
  } catch (error) {
    console.error("Disable reminders error:", error);
    renderNotificationControls(error.message || "Could not disable reminders.");
  }
}

function getStateSnapshot() {
  return getAppBridge()?.getStateSnapshot?.() || { library: [], meals: [] };
}

async function seedRemoteState(uid, state) {
  const writes = [];

  for (const meal of state.meals) {
    writes.push(saveMeal(uid, String(meal.id), meal));
  }

  for (const plant of state.library) {
    writes.push(savePlant(uid, getPlantDocId(plant.name), plant));
  }

  await Promise.all(writes);
}

async function replaceRemoteState(uid, nextState) {
  const remoteState = await loadUserData(uid);
  const writes = [];

  const nextMealIds = new Set(nextState.meals.map(meal => String(meal.id)));
  const remoteMealIds = new Set(remoteState.meals.map(meal => String(meal.id)));
  const nextPlantIds = new Set(nextState.library.map(plant => getPlantDocId(plant.name)));
  const remotePlantIds = new Set(remoteState.library.map(plant => plant.id || getPlantDocId(plant.name)));

  for (const meal of nextState.meals) {
    writes.push(saveMeal(uid, String(meal.id), meal));
  }

  for (const plant of nextState.library) {
    writes.push(savePlant(uid, getPlantDocId(plant.name), plant));
  }

  for (const mealId of remoteMealIds) {
    if (!nextMealIds.has(mealId)) {
      writes.push(deleteMeal(uid, mealId));
    }
  }

  for (const plantId of remotePlantIds) {
    if (!nextPlantIds.has(plantId)) {
      writes.push(deletePlant(uid, plantId));
    }
  }

  await Promise.all(writes);
}

function updateSyncBridge() {
  window.planterlySync = {
    isSignedIn() {
      return Boolean(currentUser);
    },
    isReady() {
      return Boolean(currentUser) && !authSyncInFlight;
    },
    async saveMealEntry(entry) {
      if (!currentUser) throw new Error("Sign in first.");
      await saveMeal(currentUser.uid, String(entry.id), entry);
    },
    async deleteMealEntry(mealId) {
      if (!currentUser) throw new Error("Sign in first.");
      await deleteMeal(currentUser.uid, String(mealId));
    },
    async saveLibraryItem(item) {
      if (!currentUser) throw new Error("Sign in first.");
      await savePlant(currentUser.uid, getPlantDocId(item.name), item);
    },
    async deleteLibraryItem(name) {
      if (!currentUser) throw new Error("Sign in first.");
      await deletePlant(currentUser.uid, getPlantDocId(name));
    },
    async replaceRemoteState(nextState) {
      if (!currentUser) throw new Error("Sign in first.");
      await replaceRemoteState(currentUser.uid, nextState);
    }
  };
}

updateSyncBridge();

window.planterlyAnalytics = {
  trackEvent,
  trackScreenView
};

trackScreenView();
renderNotificationControls();
void registerPlanterlyServiceWorker().catch(error => {
  console.warn("Service worker registration failed:", error);
});

enableNotificationsBtn?.addEventListener("click", () => {
  void enablePlantReminders();
});

disableNotificationsBtn?.addEventListener("click", () => {
  void disablePlantReminders();
});

loginBtn.addEventListener("click", async () => {
  try {
    await signInWithGoogle();
    trackEvent("login", { method: "Google" });
  } catch (error) {
    trackEvent("login_failed", { method: "Google" });
    console.error("Login error:", error);
    setUserStatus(`Login failed: ${error.message}`);
  }
});

logoutBtn.addEventListener("click", async () => {
  try {
    await logOut();
    trackEvent("sign_out", { method: "Google" });
  } catch (error) {
    trackEvent("sign_out_failed", { method: "Google" });
    console.error("Logout error:", error);
    setUserStatus(`Logout failed: ${error.message}`);
  }
});

watchAuth(async user => {
  const syncToken = ++authSyncToken;

  currentUser = user;
  setAuthControls(user);
  updateSyncBridge();
  void syncNotificationPreference();

  if (!user) {
    authSyncInFlight = false;
    updateSyncBridge();
    setUserStatus("Not signed in");
    return;
  }

  authSyncInFlight = true;
  updateSyncBridge();
  setUserStatus(`Syncing ${user.email}...`);

  try {
    const remoteState = await loadUserData(user.uid);
    if (syncToken !== authSyncToken) return;

    if (remoteState.isEmpty) {
      await seedRemoteState(user.uid, getStateSnapshot());
      if (syncToken !== authSyncToken) return;
    } else {
      getAppBridge()?.applyRemoteState?.(remoteState);
    }

    setUserStatus(`Signed in as ${user.email}`);
  } catch (error) {
    if (syncToken !== authSyncToken) return;
    console.error("Firestore sync error:", error);
    setUserStatus(`Signed in as ${user.email}. Sync failed: ${error.message}`);
  } finally {
    if (syncToken === authSyncToken) {
      authSyncInFlight = false;
      updateSyncBridge();
    }
  }
});
