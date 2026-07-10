const assert = require("node:assert/strict");
const {
  getSubscriptionIdForEndpoint,
  getSubscriptionValidationError,
  isTrustedPushEndpoint
} = require("../pushSecurity");

const appleEndpoint = "https://web.push.apple.com/QHexample";
const appleSubscriptionId = "F_9awoWSMFs8ldLN8Q_KfqFHpxz1mnuHEJi6CJsyNj8";

assert.equal(getSubscriptionIdForEndpoint(appleEndpoint), appleSubscriptionId);

assert.equal(isTrustedPushEndpoint(appleEndpoint), true);
assert.equal(isTrustedPushEndpoint("https://fcm.googleapis.com/fcm/send/example"), true);
assert.equal(isTrustedPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/example"), true);
assert.equal(isTrustedPushEndpoint("https://wns2-by2p.notify.windows.com/w/example"), true);
assert.equal(isTrustedPushEndpoint("http://web.push.apple.com/QHexample"), false);
assert.equal(isTrustedPushEndpoint("https://web.push.apple.com.evil.example/QHexample"), false);
assert.equal(isTrustedPushEndpoint("https://127.0.0.1/push"), false);
assert.equal(isTrustedPushEndpoint("https://user:password@web.push.apple.com/QHexample"), false);
assert.equal(isTrustedPushEndpoint("https://web.push.apple.com:8443/QHexample"), false);

const validSubscription = {
  endpoint: appleEndpoint,
  keys: {
    p256dh: "example-p256dh",
    auth: "example-auth"
  }
};

assert.equal(getSubscriptionValidationError(appleSubscriptionId, validSubscription), "");
assert.equal(getSubscriptionValidationError(appleSubscriptionId, undefined), "missing-subscription-data");
assert.equal(getSubscriptionValidationError("wrong-id", validSubscription), "subscription-id-mismatch");
assert.equal(getSubscriptionValidationError(appleSubscriptionId, {
  ...validSubscription,
  endpoint: "https://127.0.0.1/push"
}), "untrusted-subscription-endpoint");
assert.equal(getSubscriptionValidationError(appleSubscriptionId, {
  endpoint: appleEndpoint,
  keys: {}
}), "missing-subscription-data");

console.log("Push subscription security tests passed");
