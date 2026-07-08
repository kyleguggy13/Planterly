const admin = require("firebase-admin");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const logger = require("firebase-functions/logger");
const webpush = require("web-push");
const {
  DEFAULT_REMINDER_HOUR,
  DEFAULT_REMINDER_MINUTE,
  DEFAULT_WINDOW_MINUTES,
  getLocalDateTimeParts,
  shouldSendReminderAt
} = require("./reminderLogic");

admin.initializeApp();

const db = admin.firestore();
const fieldValue = admin.firestore.FieldValue;

const vapidPublicKey = defineSecret("PLANTERLY_VAPID_PUBLIC_KEY");
const vapidPrivateKey = defineSecret("PLANTERLY_VAPID_PRIVATE_KEY");
const vapidSubject = defineSecret("PLANTERLY_VAPID_SUBJECT");

const APP_URL = "https://kyleguggy13.github.io/Planterly/";
const DEFAULT_ICON = `${APP_URL}assets/icons/icon-192.png`;

function getUserRefFromPreferenceDoc(preferenceDoc) {
  return preferenceDoc.ref.parent.parent;
}

function getPreferenceSchedule(preference) {
  return {
    hour: Number.isInteger(preference.hour) ? preference.hour : DEFAULT_REMINDER_HOUR,
    minute: Number.isInteger(preference.minute) ? preference.minute : DEFAULT_REMINDER_MINUTE,
    windowMinutes: DEFAULT_WINDOW_MINUTES
  };
}

function getPushPayload(localDate) {
  return JSON.stringify({
    title: "Planterly",
    body: "Remember to log today's plants.",
    icon: DEFAULT_ICON,
    badge: DEFAULT_ICON,
    tag: `plant-log-reminder-${localDate}`,
    data: {
      url: APP_URL,
      localDate
    }
  });
}

function isExpiredSubscriptionError(error) {
  return error?.statusCode === 404 || error?.statusCode === 410;
}

async function userHasLoggedPlantsToday(userRef, localDate) {
  const meals = await userRef.collection("meals")
    .where("date", "==", localDate)
    .limit(1)
    .get();
  return !meals.empty;
}

async function sendReminderToSubscription(subscriptionDoc, payload, localDate) {
  const subscription = subscriptionDoc.data();

  if (!subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
    await subscriptionDoc.ref.set({
      enabled: false,
      disabledReason: "missing-subscription-data",
      updatedAt: fieldValue.serverTimestamp()
    }, { merge: true });
    return { sent: false, skipped: true };
  }

  if (subscription.lastSentLocalDate === localDate) {
    return { sent: false, skipped: true };
  }

  try {
    await webpush.sendNotification({
      endpoint: subscription.endpoint,
      expirationTime: subscription.expirationTime || null,
      keys: subscription.keys
    }, payload);

    await subscriptionDoc.ref.set({
      lastSentLocalDate: localDate,
      lastSentAt: fieldValue.serverTimestamp(),
      lastError: fieldValue.delete(),
      updatedAt: fieldValue.serverTimestamp()
    }, { merge: true });
    return { sent: true, skipped: false };
  } catch (error) {
    if (isExpiredSubscriptionError(error)) {
      await subscriptionDoc.ref.set({
        enabled: false,
        disabledReason: "expired",
        lastError: String(error.message || error),
        updatedAt: fieldValue.serverTimestamp()
      }, { merge: true });
      return { sent: false, skipped: false };
    }

    await subscriptionDoc.ref.set({
      lastError: String(error.message || error),
      updatedAt: fieldValue.serverTimestamp()
    }, { merge: true });
    logger.warn("Plant reminder push failed", {
      subscriptionId: subscriptionDoc.id,
      statusCode: error?.statusCode,
      message: error?.message
    });
    return { sent: false, skipped: false };
  }
}

async function sendReminderForPreference(preferenceDoc, now) {
  if (preferenceDoc.id !== "plantReminder") return { sent: 0, skipped: 0 };

  const userRef = getUserRefFromPreferenceDoc(preferenceDoc);
  if (!userRef) return { sent: 0, skipped: 1 };

  const preference = preferenceDoc.data();
  const timeZone = preference.timezone || "UTC";
  const schedule = getPreferenceSchedule(preference);

  if (!shouldSendReminderAt(now, timeZone, schedule)) {
    return { sent: 0, skipped: 1 };
  }

  const { localDate } = getLocalDateTimeParts(now, timeZone);
  const subscriptions = await userRef.collection("pushSubscriptions")
    .where("enabled", "==", true)
    .get();

  if (subscriptions.empty) {
    return { sent: 0, skipped: 1 };
  }

  if (await userHasLoggedPlantsToday(userRef, localDate)) {
    return { sent: 0, skipped: subscriptions.size };
  }

  const payload = getPushPayload(localDate);
  let sent = 0;
  let skipped = 0;

  for (const subscriptionDoc of subscriptions.docs) {
    const result = await sendReminderToSubscription(subscriptionDoc, payload, localDate);
    if (result.sent) sent += 1;
    if (result.skipped) skipped += 1;
  }

  return { sent, skipped };
}

exports.sendPlantLogReminders = onSchedule({
  schedule: "every 15 minutes",
  timeZone: "Etc/UTC",
  secrets: [vapidPublicKey, vapidPrivateKey, vapidSubject]
}, async () => {
  const publicKey = vapidPublicKey.value();
  const privateKey = vapidPrivateKey.value();
  const subject = vapidSubject.value();

  if (!publicKey || !privateKey || !subject) {
    logger.warn("Plant reminders are not configured. Set PLANTERLY_VAPID_PUBLIC_KEY, PLANTERLY_VAPID_PRIVATE_KEY, and PLANTERLY_VAPID_SUBJECT.");
    return;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);

  const now = new Date();
  const preferences = await db.collectionGroup("notificationPreferences")
    .where("enabled", "==", true)
    .get();

  let sent = 0;
  let skipped = 0;

  for (const preferenceDoc of preferences.docs) {
    const result = await sendReminderForPreference(preferenceDoc, now);
    sent += result.sent;
    skipped += result.skipped;
  }

  logger.info("Plant reminder run complete", {
    preferences: preferences.size,
    sent,
    skipped
  });
});
