# Planterly Functions

Firebase Cloud Functions sends the 9:00 PM plant log reminders.

## VAPID keys

Generate a Web Push VAPID key pair:

```powershell
npx web-push generate-vapid-keys
```

Use the public key in two places:

1. Replace `PASTE_PUBLIC_VAPID_KEY_HERE` in `../js/app.js`.
2. Set the Firebase secret:

```powershell
firebase functions:secrets:set PLANTERLY_VAPID_PUBLIC_KEY
```

Set the private key and subject as secrets:

```powershell
firebase functions:secrets:set PLANTERLY_VAPID_PRIVATE_KEY
firebase functions:secrets:set PLANTERLY_VAPID_SUBJECT
```

Use a subject like `mailto:you@example.com`.

## Deploy

```powershell
npm --prefix functions install
npm --prefix functions test
firebase deploy --only functions
```

The scheduled function checks every 15 minutes. It sends only when a signed-in user's saved timezone is in the 9:00 PM reminder window and no meal exists for that local date.

Its filtered collection-group query requires a collection-group-scope ascending index on `notificationPreferences.enabled`. Verify that index in Firestore (or create it from the link in the scheduled function's index error) before relying on nightly reminders.

The first deploy of `deliverTestNotification` also creates its private Cloud Tasks queue. Both test functions use the project's Gen 2 runtime service account, and the task worker declares that account as its only invoker so Firebase can maintain the queue enqueuer and function invoker bindings. Cloud Tasks may still require a one-time `roles/iam.serviceAccountUser` self-binding so that account can mint its task OIDC token; follow Firebase's task queue IAM setup if the callable reports an `iam.serviceAccounts.actAs` error.

```powershell
gcloud iam service-accounts add-iam-policy-binding `
  275892702436-compute@developer.gserviceaccount.com `
  --project=planterly-data `
  --member="serviceAccount:275892702436-compute@developer.gserviceaccount.com" `
  --role="roles/iam.serviceAccountUser"
```

Firestore rules must deny client access to the root `notificationTestRateLimits` collection because it is maintained only by the callable's Admin SDK. The signed-in user still needs owner-only read/write access to their `users/{uid}/pushSubscriptions` documents so the app can save the current device and report the test result.

## Manual test

The same deployment creates the authenticated `sendTestNotification` callable and the private `deliverTestNotification` task function. After a signed-in user enables reminders, **Send Test Notification** validates the current device's subscription and queues a task scheduled eight seconds later. The app only tells the user to press Home or lock an iPhone after Cloud Tasks accepts the request.

This is an end-to-end test of the saved subscription, VAPID configuration, push service, and service worker. Test requests are limited to one per signed-in account every 30 seconds, and diagnostic pushes expire immediately if the device is offline.
