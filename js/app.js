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
  loadPushSubscription,
  disablePushSubscription,
  requestTestNotification,
  trackAnalyticsEvent
} from "./firebase.js";

const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const userStatus = document.getElementById("userStatus");
const enableNotificationsBtn = document.getElementById("enable-notifications-btn");
const testNotificationBtn = document.getElementById("test-notification-btn");
const notificationStatus = document.getElementById("notification-status");
const reminderToggleInputs = Array.from(document.querySelectorAll("[data-reminder-id]"));

let currentUser = null;
let authSyncInFlight = false;
let authSyncToken = 0;
let notificationPreference = null;
let notificationStatusOverride = "";
let serviceWorkerRegistrationPromise = null;
let currentDevicePushReady = false;
let notificationChangeInFlight = false;
let testNotificationInFlight = false;
let pendingTestNotification = null;
let pendingTestCheckTimer = null;

const MEAL_REMINDERS = Object.freeze([
  Object.freeze({ id: "breakfast", label: "Breakfast", timeLabel: "10:00 AM" }),
  Object.freeze({ id: "lunch", label: "Lunch", timeLabel: "1:00 PM" }),
  Object.freeze({ id: "dinner", label: "Dinner", timeLabel: "9:00 PM" })
]);
const PLANTERLY_VAPID_PUBLIC_KEY = "BH4FNBbz4b1AvUCk0cc5DT9EE4bjMjDJWdiNOwUzcU5xrVZLKyF3hx7qz4O50wYF-u895wB34koKhQZZ1GNMJRE";
// const VAPID_PUBLIC_KEY_CONFIGURED = Boolean(
//   PLANTERLY_VAPID_PUBLIC_KEY &&
//   PLANTERLY_VAPID_PUBLIC_KEY !== "BH4FNBbz4b1AvUCk0cc5DT9EE4bjMjDJWdiNOwUzcU5xrVZLKyF3hx7qz4O50wYF-u895wB34koKhQZZ1GNMJRE"
// );
const VAPID_PUBLIC_KEY_CONFIGURED = true; // For testing purposes, set to true. In production, ensure the key is properly configured.

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

function getEmptyReminderSettings() {
  return Object.fromEntries(MEAL_REMINDERS.map(reminder => [reminder.id, false]));
}

function normalizeNotificationPreference(preference) {
  const hasReminderSettings = preference?.reminders && typeof preference.reminders === "object";
  const reminders = getEmptyReminderSettings();

  if (hasReminderSettings) {
    MEAL_REMINDERS.forEach(reminder => {
      reminders[reminder.id] = preference.reminders[reminder.id] === true;
    });
  } else if (preference?.enabled) {
    // Preserve the legacy single 9:00 PM reminder as Dinner.
    reminders.dinner = true;
  }

  return {
    ...(preference || {}),
    enabled: Object.values(reminders).some(Boolean),
    timezone: preference?.timezone || getLocalTimeZone(),
    reminders
  };
}

function getEnabledMealReminders(preference = notificationPreference) {
  const reminders = preference?.reminders || {};
  return MEAL_REMINDERS.filter(reminder => reminders[reminder.id] === true);
}

function getReminderStatusSummary(preference = notificationPreference) {
  return getEnabledMealReminders(preference)
    .map(reminder => `${reminder.label} ${reminder.timeLabel}`)
    .join(", ");
}

function renderNotificationControls(message = "") {
  if (!enableNotificationsBtn || !testNotificationBtn || !notificationStatus || reminderToggleInputs.length === 0) return;

  const capability = getNotificationCapability();
  const enabled = Boolean(notificationPreference?.enabled);
  const notificationOperationInFlight = notificationChangeInFlight ||
    testNotificationInFlight || Boolean(pendingTestNotification);

  reminderToggleInputs.forEach(input => {
    input.checked = notificationPreference?.reminders?.[input.dataset.reminderId] === true;
    input.disabled = !currentUser || notificationOperationInFlight;
  });

  enableNotificationsBtn.hidden = true;
  enableNotificationsBtn.disabled = true;
  testNotificationBtn.hidden = true;
  testNotificationBtn.disabled = true;

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
    setNotificationStatus(enabled
      ? "Notification permission is blocked. You can switch reminders off or allow Planterly in Settings."
      : "Notification permission is blocked in this browser.");
    return;
  }

  const deviceNeedsSetup = enabled &&
    (Notification.permission !== "granted" || !currentDevicePushReady);
  enableNotificationsBtn.hidden = !deviceNeedsSetup;
  enableNotificationsBtn.textContent = "Set Up This Device";
  enableNotificationsBtn.disabled = notificationOperationInFlight;
  testNotificationBtn.hidden = !enabled || deviceNeedsSetup;
  testNotificationBtn.disabled = !enabled || Notification.permission !== "granted" ||
    notificationOperationInFlight;

  if (message) {
    notificationStatusOverride = message;
    setNotificationStatus(message);
    return;
  }

  if (notificationStatusOverride) {
    setNotificationStatus(notificationStatusOverride);
    return;
  }

  if (deviceNeedsSetup) {
    setNotificationStatus("Reminders are on for your account. Set up notifications on this device.");
    return;
  }

  if (enabled) {
    const timezone = notificationPreference.timezone || getLocalTimeZone();
    setNotificationStatus(`On: ${getReminderStatusSummary()} (${timezone}).`);
    return;
  }

  setNotificationStatus("All meal reminders are off.");
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
  if (!window.crypto?.subtle || !window.TextEncoder) {
    throw new Error("Secure push subscription IDs are not supported in this browser.");
  }

  const endpointHash = await window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
  return arrayBufferToBase64Url(endpointHash);
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

async function syncCurrentDevicePushState() {
  const capability = getNotificationCapability();
  if (!capability.ok || Notification.permission !== "granted") {
    currentDevicePushReady = false;
    return;
  }

  const registration = await getReadyServiceWorkerRegistration();
  currentDevicePushReady = Boolean(await registration.pushManager.getSubscription());
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

function getNotificationPreferencePayload(reminders, timezone = getLocalTimeZone()) {
  return {
    enabled: Object.values(reminders).some(Boolean),
    timezone,
    reminders
  };
}

async function refreshStoredReminderPreference(storedPreference) {
  if (!currentUser || !storedPreference) return;
  const timezone = getLocalTimeZone();
  const needsMigration = !storedPreference?.reminders || typeof storedPreference.reminders !== "object";
  const needsEnabledCorrection = storedPreference.enabled !== notificationPreference.enabled;
  const needsTimezoneRefresh = notificationPreference.enabled && notificationPreference.timezone !== timezone;
  if (!needsMigration && !needsEnabledCorrection && !needsTimezoneRefresh) return;

  notificationPreference = getNotificationPreferencePayload(notificationPreference.reminders, timezone);
  await saveNotificationPreference(currentUser.uid, notificationPreference);
}

async function syncNotificationPreference() {
  notificationStatusOverride = "";

  if (!currentUser) {
    notificationPreference = null;
    currentDevicePushReady = false;
    renderNotificationControls();
    return;
  }

  try {
    const storedPreference = await loadNotificationPreference(currentUser.uid);
    notificationPreference = normalizeNotificationPreference(storedPreference);
    await refreshStoredReminderPreference(storedPreference);
    await syncCurrentDevicePushState();
    renderNotificationControls();
  } catch (error) {
    console.error("Notification preference error:", error);
    renderNotificationControls("Could not load reminder settings.");
  }
}

async function ensureCurrentPushSubscription(user) {
  const permission = Notification.permission === "granted"
    ? "granted"
    : await Notification.requestPermission();

  if (permission !== "granted") {
    throw new Error("Notification permission was not granted.");
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
  await savePushSubscription(user.uid, subscriptionId, getPushSubscriptionPayload(subscription));
  currentDevicePushReady = true;
  return { subscription, subscriptionId };
}

async function disableCurrentPushSubscription(user) {
  currentDevicePushReady = false;
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !window.isSecureContext) return;
  const registration = await getReadyServiceWorkerRegistration();
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  const subscriptionId = await getSubscriptionId(subscription.endpoint);
  await disablePushSubscription(user.uid, subscriptionId);
  await subscription.unsubscribe();
}

async function setupNotificationsForCurrentDevice() {
  if (notificationChangeInFlight || testNotificationInFlight || pendingTestNotification) return;
  if (!currentUser || !notificationPreference?.enabled) {
    renderNotificationControls("Choose at least one meal reminder first.");
    return;
  }

  const capability = getNotificationCapability();
  if (!capability.ok) {
    renderNotificationControls(capability.message);
    return;
  }

  const user = currentUser;
  try {
    notificationChangeInFlight = true;
    notificationStatusOverride = "";
    renderNotificationControls("Setting up notifications on this device...");
    await ensureCurrentPushSubscription(user);

    notificationPreference = getNotificationPreferencePayload(
      notificationPreference.reminders,
      getLocalTimeZone()
    );
    await saveNotificationPreference(user.uid, notificationPreference);
    trackEvent("plant_reminder_device_setup");
    renderNotificationControls("This device is ready for meal reminders.");
  } catch (error) {
    console.error("Set up reminders error:", error);
    renderNotificationControls(error.message || "Could not set up reminders on this device.");
  } finally {
    notificationChangeInFlight = false;
    renderNotificationControls(notificationStatusOverride);
  }
}

async function updateMealReminder(reminderId, nextEnabled) {
  if (notificationChangeInFlight || testNotificationInFlight || pendingTestNotification) return;
  if (!currentUser) {
    renderNotificationControls("Sign in to change reminders.");
    return;
  }

  const reminder = MEAL_REMINDERS.find(option => option.id === reminderId);
  if (!reminder) return;

  const capability = getNotificationCapability();
  if (nextEnabled && !capability.ok) {
    renderNotificationControls(capability.message);
    renderNotificationControls(notificationStatusOverride);
    return;
  }

  const user = currentUser;
  const currentPreference = normalizeNotificationPreference(notificationPreference);
  const nextReminders = {
    ...currentPreference.reminders,
    [reminderId]: nextEnabled
  };
  const nextPreference = getNotificationPreferencePayload(nextReminders, getLocalTimeZone());

  try {
    notificationChangeInFlight = true;
    notificationStatusOverride = "";
    renderNotificationControls(`${nextEnabled ? "Enabling" : "Disabling"} ${reminder.label} reminders...`);

    if (nextEnabled) await ensureCurrentPushSubscription(user);
    await saveNotificationPreference(user.uid, nextPreference);
    notificationPreference = nextPreference;

    if (!nextPreference.enabled) await disableCurrentPushSubscription(user);

    trackEvent("meal_reminder_updated", {
      meal: reminderId,
      enabled: nextEnabled,
      timezone: nextPreference.timezone
    });
    renderNotificationControls(`${reminder.label} reminders are ${nextEnabled ? "on" : "off"}.`);
  } catch (error) {
    console.error("Update meal reminder error:", error);
    renderNotificationControls(error.message || `Could not update ${reminder.label} reminders.`);
  } finally {
    notificationChangeInFlight = false;
    renderNotificationControls(notificationStatusOverride);
  }
}

function clearPendingTestNotification() {
  if (pendingTestCheckTimer) window.clearTimeout(pendingTestCheckTimer);
  pendingTestCheckTimer = null;
  pendingTestNotification = null;
}

function schedulePendingTestCheck(delayMs = 12000) {
  if (pendingTestCheckTimer) window.clearTimeout(pendingTestCheckTimer);
  pendingTestCheckTimer = window.setTimeout(() => {
    pendingTestCheckTimer = null;
    void checkPendingTestNotification();
  }, delayMs);
}

async function checkPendingTestNotification() {
  const pending = pendingTestNotification;
  if (!pending || !currentUser || currentUser.uid !== pending.uid || document.visibilityState === "hidden") return;

  try {
    const subscription = await loadPushSubscription(pending.uid, pending.subscriptionId);
    if (pendingTestNotification !== pending) return;

    if (subscription?.lastTestStatus === "sent") {
      clearPendingTestNotification();
      renderNotificationControls("The push service accepted the test. Check Notification Center if no banner appeared.");
      return;
    }

    if (subscription?.lastTestStatus === "failed") {
      clearPendingTestNotification();
      renderNotificationControls("Test delivery failed. Switch all meal reminders off, then turn one back on and retry.");
      return;
    }

    if (subscription?.lastTestStatus === "queue-failed") {
      clearPendingTestNotification();
      renderNotificationControls("The test could not be queued. Try again or check the Firebase function logs.");
      return;
    }

    pending.checksRemaining -= 1;
    if (pending.checksRemaining > 0) {
      schedulePendingTestCheck(3000);
      return;
    }

    clearPendingTestNotification();
    renderNotificationControls("No delivery result was recorded. Check the Firebase task-function logs and IAM settings.");
  } catch (error) {
    console.warn("Could not check test notification status:", error);
    clearPendingTestNotification();
    renderNotificationControls("Could not verify the delivery result. Check the notification and Firebase function logs.");
  }
}

async function sendTestNotification() {
  if (testNotificationInFlight || notificationChangeInFlight || pendingTestNotification) return;

  if (!currentUser || !notificationPreference?.enabled) {
    renderNotificationControls("Choose at least one meal reminder before sending a test.");
    return;
  }
  const testUser = currentUser;

  const capability = getNotificationCapability();
  if (!capability.ok) {
    renderNotificationControls(capability.message);
    return;
  }

  if (Notification.permission !== "granted") {
    renderNotificationControls("Notification permission is not granted. Set up this device first.");
    return;
  }

  try {
    testNotificationInFlight = true;
    renderNotificationControls("Preparing a test notification...");

    const registration = await getReadyServiceWorkerRegistration();
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(PLANTERLY_VAPID_PUBLIC_KEY)
      });
    }

    const subscriptionId = await getSubscriptionId(subscription.endpoint);
    await savePushSubscription(testUser.uid, subscriptionId, getPushSubscriptionPayload(subscription));
    currentDevicePushReady = true;

    renderNotificationControls("Queuing a test notification...");
    trackEvent("plant_reminder_test_requested");
    const result = await requestTestNotification(subscriptionId);
    const delaySeconds = Number(result?.delaySeconds) || 8;
    pendingTestNotification = {
      uid: testUser.uid,
      subscriptionId,
      checksRemaining: 5
    };
    schedulePendingTestCheck((delaySeconds + 4) * 1000);
    trackEvent("plant_reminder_test_queued");
    renderNotificationControls(`Test queued. Press Home or lock your iPhone now; it should arrive in about ${delaySeconds} seconds.`);
  } catch (error) {
    trackEvent("plant_reminder_test_failed");
    console.error("Test notification error:", error);
    renderNotificationControls(error.message || "Could not send the test notification.");
  } finally {
    testNotificationInFlight = false;
    renderNotificationControls(notificationStatusOverride);
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
  void setupNotificationsForCurrentDevice();
});

reminderToggleInputs.forEach(input => {
  input.addEventListener("change", () => {
    void updateMealReminder(input.dataset.reminderId, input.checked);
  });
});

testNotificationBtn?.addEventListener("click", () => {
  void sendTestNotification();
});

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && pendingTestNotification) {
    void checkPendingTestNotification();
  }
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
  if (!user || (pendingTestNotification && pendingTestNotification.uid !== user.uid)) {
    clearPendingTestNotification();
  }
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
