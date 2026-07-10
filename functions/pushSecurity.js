const { createHash } = require("node:crypto");

function getSubscriptionIdForEndpoint(endpoint) {
  return createHash("sha256").update(endpoint).digest("base64url");
}

function isTrustedPushEndpoint(endpoint) {
  try {
    const url = new URL(endpoint);
    const hostname = url.hostname.toLowerCase();
    const trustedHostname = hostname === "fcm.googleapis.com" ||
      hostname === "push.services.mozilla.com" ||
      hostname.endsWith(".push.services.mozilla.com") ||
      hostname === "push.apple.com" ||
      hostname.endsWith(".push.apple.com") ||
      hostname === "notify.windows.com" ||
      hostname.endsWith(".notify.windows.com");

    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === "443") &&
      trustedHostname;
  } catch (_) {
    return false;
  }
}

function getSubscriptionValidationError(subscriptionId, subscription) {
  if (!subscription?.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
    return "missing-subscription-data";
  }

  if (!isTrustedPushEndpoint(subscription.endpoint)) {
    return "untrusted-subscription-endpoint";
  }

  if (getSubscriptionIdForEndpoint(subscription.endpoint) !== subscriptionId) {
    return "subscription-id-mismatch";
  }

  return "";
}

module.exports = {
  getSubscriptionIdForEndpoint,
  getSubscriptionValidationError,
  isTrustedPushEndpoint
};
