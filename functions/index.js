const { createHash } = require("node:crypto");
const admin = require("firebase-admin");
const { getFunctions } = require("firebase-admin/functions");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { HttpsError, onCall } = require("firebase-functions/v2/https");
const { onTaskDispatched } = require("firebase-functions/v2/tasks");
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
const {
  getSubscriptionValidationError
} = require("./pushSecurity");

admin.initializeApp();

const db = admin.firestore();
const fieldValue = admin.firestore.FieldValue;

const vapidPublicKey = defineSecret("PLANTERLY_VAPID_PUBLIC_KEY");
const vapidPrivateKey = defineSecret("PLANTERLY_VAPID_PRIVATE_KEY");
const vapidSubject = defineSecret("PLANTERLY_VAPID_SUBJECT");

const APP_URL = "https://kyleguggy13.github.io/Planterly/";
const DEFAULT_ICON = `${APP_URL}assets/icons/icon-192.png`;
const FUNCTIONS_RUNTIME_SERVICE_ACCOUNT = "275892702436-compute@developer.gserviceaccount.com";
const TEST_NOTIFICATION_DELAY_SECONDS = 8;
const TEST_NOTIFICATION_RATE_LIMIT_MS = 30000;
const TEST_PUSH_OPTIONS = {
  TTL: 0,
  urgency: "high",
  timeout: 10000
};

function configureWebPush() {
  const publicKey = vapidPublicKey.value();
  const privateKey = vapidPrivateKey.value();
  const subject = vapidSubject.value();

  if (!publicKey || !privateKey || !subject) return false;

  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

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

function getTestPushPayload() {
  return JSON.stringify({
    title: "Planterly test",
    body: "Your test notification worked.",
    icon: DEFAULT_ICON,
    badge: DEFAULT_ICON,
    tag: `plant-log-test-${Date.now()}`,
    data: {
      url: APP_URL,
      test: true
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
  const validationError = getSubscriptionValidationError(subscriptionDoc.id, subscription);

  if (validationError) {
    await subscriptionDoc.ref.set({
      enabled: false,
      disabledReason: validationError,
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

async function reserveTestNotification(uid, subscriptionId, requestedAtMs, reservationId) {
  const subscriptionRef = db.collection("users").doc(uid)
    .collection("pushSubscriptions").doc(subscriptionId);
  const rateLimitRef = db.collection("notificationTestRateLimits").doc(uid);

  await db.runTransaction(async transaction => {
    const subscriptionSnapshot = await transaction.get(subscriptionRef);
    const rateLimitSnapshot = await transaction.get(rateLimitRef);

    if (!subscriptionSnapshot.exists || subscriptionSnapshot.data().enabled !== true) {
      throw new HttpsError(
        "failed-precondition",
        "This device does not have an active push subscription. Disable and re-enable reminders, then try again."
      );
    }

    const subscription = subscriptionSnapshot.data();
    if (getSubscriptionValidationError(subscriptionId, subscription)) {
      throw new HttpsError(
        "failed-precondition",
        "This device's push subscription is invalid. Disable and re-enable reminders, then try again."
      );
    }

    const lastRequestedAt = rateLimitSnapshot.data()?.lastRequestedAt?.toMillis?.() || 0;
    if (requestedAtMs - lastRequestedAt < TEST_NOTIFICATION_RATE_LIMIT_MS) {
      throw new HttpsError("resource-exhausted", "Wait 30 seconds before sending another test notification.");
    }

    transaction.set(subscriptionRef, {
      disabledReason: fieldValue.delete(),
      lastError: fieldValue.delete(),
      lastTestRequestedAt: fieldValue.serverTimestamp(),
      lastTestStatus: "queued",
      updatedAt: fieldValue.serverTimestamp()
    }, { merge: true });
    transaction.set(rateLimitRef, {
      lastRequestedAt: fieldValue.serverTimestamp(),
      reservationId,
      subscriptionId
    }, { merge: true });
  });
}

async function releaseTestNotificationReservation(uid, subscriptionId, reservationId, error) {
  const subscriptionRef = db.collection("users").doc(uid)
    .collection("pushSubscriptions").doc(subscriptionId);
  const rateLimitRef = db.collection("notificationTestRateLimits").doc(uid);

  await db.runTransaction(async transaction => {
    const rateLimitSnapshot = await transaction.get(rateLimitRef);
    if (rateLimitSnapshot.data()?.reservationId !== reservationId) return;

    transaction.set(rateLimitRef, {
      lastRequestedAt: fieldValue.delete(),
      reservationId: fieldValue.delete()
    }, { merge: true });
    transaction.set(subscriptionRef, {
      lastError: String(error?.message || error),
      lastTestStatus: "queue-failed",
      updatedAt: fieldValue.serverTimestamp()
    }, { merge: true });
  });
}

async function sendTestPush(subscriptionRef, subscription) {
  try {
    await webpush.sendNotification({
      endpoint: subscription.endpoint,
      expirationTime: subscription.expirationTime || null,
      keys: subscription.keys
    }, getTestPushPayload(), TEST_PUSH_OPTIONS);
  } catch (error) {
    const update = {
      lastError: String(error.message || error),
      lastTestStatus: "failed",
      updatedAt: fieldValue.serverTimestamp()
    };

    if (isExpiredSubscriptionError(error)) {
      update.enabled = false;
      update.disabledReason = "expired";
    }

    await subscriptionRef.set(update, { merge: true });
    logger.warn("Test notification push failed", {
      subscriptionId: subscriptionRef.id,
      statusCode: error?.statusCode,
      message: error?.message
    });

    if (isExpiredSubscriptionError(error)) {
      throw new Error("This device's push subscription expired.");
    }

    throw new Error("The push service rejected the test notification.");
  }

  try {
    await subscriptionRef.set({
      disabledReason: fieldValue.delete(),
      lastTestSentAt: fieldValue.serverTimestamp(),
      lastTestStatus: "sent",
      lastError: fieldValue.delete(),
      updatedAt: fieldValue.serverTimestamp()
    }, { merge: true });
  } catch (error) {
    logger.warn("Could not record successful test notification", {
      subscriptionId: subscriptionRef.id,
      message: error?.message
    });
  }
}

exports.deliverTestNotification = onTaskDispatched({
  invoker: FUNCTIONS_RUNTIME_SERVICE_ACCOUNT,
  serviceAccount: FUNCTIONS_RUNTIME_SERVICE_ACCOUNT,
  retryConfig: {
    maxAttempts: 1
  },
  rateLimits: {
    maxConcurrentDispatches: 10,
    maxDispatchesPerSecond: 10
  },
  timeoutSeconds: 30,
  secrets: [vapidPublicKey, vapidPrivateKey, vapidSubject]
}, async request => {
  const uid = request.data?.uid;
  const subscriptionId = request.data?.subscriptionId;

  if (typeof uid !== "string" || !uid ||
      typeof subscriptionId !== "string" || !/^[A-Za-z0-9_-]{20,150}$/.test(subscriptionId)) {
    throw new Error("The queued test notification data is invalid.");
  }

  if (!configureWebPush()) {
    throw new Error("Push notifications are not configured on the server.");
  }

  const subscriptionRef = db.collection("users").doc(uid)
    .collection("pushSubscriptions").doc(subscriptionId);
  const snapshot = await subscriptionRef.get();
  const subscription = snapshot.data();
  const validationError = snapshot.exists && subscription?.enabled === true
    ? getSubscriptionValidationError(subscriptionId, subscription)
    : "inactive-subscription";

  if (validationError) {
    if (snapshot.exists) {
      await subscriptionRef.set({
        enabled: false,
        disabledReason: validationError,
        lastError: `The queued push subscription is invalid: ${validationError}.`,
        lastTestStatus: "failed",
        updatedAt: fieldValue.serverTimestamp()
      }, { merge: true });
    }
    throw new Error(`The queued push subscription is invalid: ${validationError}.`);
  }

  await sendTestPush(subscriptionRef, subscription);
  logger.info("Test notification sent", { uid, subscriptionId });
});

exports.sendTestNotification = onCall({
  serviceAccount: FUNCTIONS_RUNTIME_SERVICE_ACCOUNT,
  timeoutSeconds: 30,
  secrets: [vapidPublicKey, vapidPrivateKey, vapidSubject]
}, async request => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in before sending a test notification.");
  }

  const subscriptionId = request.data?.subscriptionId;
  if (typeof subscriptionId !== "string" || !/^[A-Za-z0-9_-]{20,150}$/.test(subscriptionId)) {
    throw new HttpsError("invalid-argument", "A valid push subscription is required.");
  }

  if (!configureWebPush()) {
    throw new HttpsError("failed-precondition", "Push notifications are not configured on the server.");
  }

  const requestedAtMs = Date.now();
  const taskId = `test-${createHash("sha256")
    .update(`${request.auth.uid}:${Math.floor(requestedAtMs / TEST_NOTIFICATION_RATE_LIMIT_MS)}`)
    .digest("hex")}`;
  await reserveTestNotification(request.auth.uid, subscriptionId, requestedAtMs, taskId);

  try {
    await getFunctions().taskQueue("deliverTestNotification").enqueue({
      uid: request.auth.uid,
      subscriptionId
    }, {
      id: taskId,
      scheduleDelaySeconds: TEST_NOTIFICATION_DELAY_SECONDS,
      dispatchDeadlineSeconds: 30
    });
  } catch (error) {
    logger.warn("Could not queue test notification", {
      uid: request.auth.uid,
      subscriptionId,
      code: error?.code,
      message: error?.message
    });

    if (error?.code === "functions/task-already-exists") {
      throw new HttpsError("resource-exhausted", "Wait 30 seconds before sending another test notification.");
    }

    try {
      await releaseTestNotificationReservation(request.auth.uid, subscriptionId, taskId, error);
    } catch (releaseError) {
      logger.warn("Could not release failed test notification reservation", {
        uid: request.auth.uid,
        subscriptionId,
        message: releaseError?.message
      });
    }

    throw new HttpsError(
      "internal",
      "Could not queue the test notification. Check the Cloud Tasks permissions and function logs."
    );
  }

  logger.info("Test notification queued", { uid: request.auth.uid, subscriptionId });

  return {
    queued: true,
    delaySeconds: TEST_NOTIFICATION_DELAY_SECONDS
  };
});

exports.sendPlantLogReminders = onSchedule({
  schedule: "every 15 minutes",
  timeZone: "Etc/UTC",
  secrets: [vapidPublicKey, vapidPrivateKey, vapidSubject]
}, async () => {
  if (!configureWebPush()) {
    logger.warn("Plant reminders are not configured. Set PLANTERLY_VAPID_PUBLIC_KEY, PLANTERLY_VAPID_PRIVATE_KEY, and PLANTERLY_VAPID_SUBJECT.");
    return;
  }

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
