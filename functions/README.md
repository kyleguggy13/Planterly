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
