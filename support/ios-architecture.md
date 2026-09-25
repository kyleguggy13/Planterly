# Planterly iOS architecture and shared data contract

This is the handoff for a future native app, not an implemented iOS client. The sibling `Planterly-iOS` repository was empty when inspected. DriveTrace-iOS is a native SwiftUI/SwiftData app with a shared backend, rather than a web-view wrapper; use that same separation for Planterly.

## Platform boundaries

| Layer | Web | Planned iOS |
| --- | --- | --- |
| UI | Existing HTML/CSS/JavaScript | SwiftUI |
| Hosting/distribution | Sites-managed Cloudflare hosting | Xcode, TestFlight, App Store |
| Local data | Existing browser storage | SwiftData behind a repository protocol |
| Identity | Firebase Auth with Google | Firebase Auth with native provider integration |
| Shared data | Firestore in `planterly-data` | The same Firestore project and user UID |
| Reminders | Web Push and Firebase Functions | Native local notifications initially, or APNs/FCM for server-driven delivery |

Keep Firebase as the shared backend. Register a separate iOS app within `planterly-data`; do not create a new Firebase project or copy browser credentials into a WebView. Keep domain hosting independent of native persistence and sync.

Suggested native folders: `App`, `Features`, `Models`, `Persistence`, `Networking`, `Synchronization`, `Notifications`, and `Resources`. A repository protocol should isolate local storage, with a separate sync coordinator reconciling pending edits and remote records. Confirm deployment target and signing details when implementation starts; DriveTrace's SwiftData approach uses iOS 17 or later.

## Existing Firestore contract

The current implementation in `js/firebase.js`, `js/app.js`, `index.html`, and `functions/reminderLogic.js` is authoritative. This migration makes no schema changes.

| Path | Current fields and behavior |
| --- | --- |
| `users/{uid}/meals/{mealId}` | `id` (numeric in current exports), `date` (`YYYY-MM-DD`), `meal` (display label), `plants` (array of names), `updatedAt` (server timestamp) |
| `users/{uid}/library/{plantId}` | `name`, `cat`, `updatedAt` (server timestamp) |
| `users/{uid}/notificationPreferences/plantReminder` | `enabled`, `timezone` (IANA identifier), `reminders` map with `breakfast`, `lunch`, `dinner` booleans, `updatedAt` |
| `users/{uid}/pushSubscriptions/{subscriptionId}` | Browser Web Push subscription, endpoint-derived ID, enabled state and delivery metadata; not a native device token |

The account namespace is Firebase Auth's UID, not email or an iOS device ID. Existing meal document IDs are stringified numeric IDs generated with `Date.now()`. Preserve existing IDs. Before introducing UUID IDs for new native meals, update the web import validator and shared contract deliberately; it currently rejects nonnumeric IDs. Millisecond IDs can collide across clients, so coordinated ID migration is an implementation prerequisite for robust concurrent creation, not something to silently change on iOS alone.

Library IDs use `getPlantDocId`: trim, lowercase, replace consecutive forward/back slashes with `-`, and replace whitespace runs with `-`. Match the existing behavior, including its possible collisions, until a coordinated migration changes it. Existing category values include `vegetable`, `fruit`, `legume`, `grain`, `nut`, `herb`, and `other`.

A meal's `date` is a calendar date and must not shift when decoded through a UTC timestamp. Weeks run Sunday through Saturday. The weekly diversity goal is 30 unique plants. Preserve names and check normalization against the web implementation before computing cross-client statistics.

## Import/export and synchronization

The existing JSON export has `version: 1`, `exportedAt` (ISO timestamp), `library: [{name, cat}]`, and `meals: [{id, date, meal, plants}]`. Native import should accept that format so browser-only users have a migration path.

The web import currently replaces remote records, deleting meals/library entries absent from the imported snapshot. Do not use that replacement operation for routine native synchronization. Implement per-record upserts, pending-edit tracking, conflict handling, and a coordinated deletion strategy before shipping two-way offline sync. Test round trips between the web app and iOS with the same account.

Firestore rules must enforce owner-only data access for both clients. Keep Admin SDK credentials and VAPID private keys server-side. Authentication, signing configuration, and device tests belong in the native repository when implementation begins.

## Native reminders

The existing web schedules are Breakfast 10:00, Lunch 13:00, and Dinner 21:00 in the saved timezone. The server skips a meal already logged for that date. Legacy preferences with `enabled: true` and no `reminders` map mean Dinner only.

A native app cannot register its APNs/FCM token in the web subscription collection: the existing server validates browser push endpoints. Local notifications can provide device reminders, but cannot reliably observe meals entered on another device while the app is suspended. If cross-device skip behavior is required, add a separate native token collection and an APNs/FCM delivery path to the existing scheduler. Keep device enrollment separate from account reminder preferences, and prevent duplicate delivery when users also have the web app installed.

Do not assume the PWA's service worker, notification permission, or installed-app identity transfers into a native app. Universal Links can be added later, once the Apple team ID, bundle ID, and intended routes are known; no placeholder association file is deployed now.

## Implementation sequence

1. Establish models and tests for dates, diversity counts, library normalization, IDs, and JSON import/export.
2. Build SwiftUI meal logging, history, and library screens with durable local storage.
3. Register the iOS app in the existing Firebase project and add native authentication.
4. Add sync with explicit conflict/deletion behavior and test web/iOS round trips.
5. Implement native reminders and verify them on a physical device.
6. Complete signing, account lifecycle, privacy/support information, and TestFlight validation in the native repository.

References: [Firebase Apple setup](https://firebase.google.com/docs/ios/setup), [Apple local notifications](https://developer.apple.com/documentation/usernotifications/scheduling-a-notification-locally-from-your-app).
