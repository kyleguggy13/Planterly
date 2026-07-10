# Planterly

Planterly is a static web app for tracking the plants you eat and building toward a 30-plants-per-week diversity goal.

Live app: [Planterly](https://kyleguggy13.github.io/Planterly/)

## Features

- Log meals by date, meal type, and plants eaten.
- Review plant diversity by day, week, month, and year.
- Track weekly goal progress toward 30 unique plants.
- Manage a reusable plant library with categories.
- See meal history, unique plants, meals logged, days tracked, and most frequent plants for the selected period.
- Autosave data in the browser.
- Export and import logs as JSON files.
- Sign in with Google to sync meals and library data with Firebase.
- Independently enable Breakfast reminders at 10:00 AM, Lunch at 1:00 PM, and Dinner at 9:00 PM.
- Send an on-demand test notification to the current device from the reminder controls.

## Usage

1. Open the app and use **Log meal** to choose a date, meal, and plants.
2. Add plants from the quick-add library or type a new plant name.
3. Use **History** to switch between day, week, month, and year views.
4. Use **Plant library** to add or remove saved plant options.
5. Use the menu to export/import logs, sign in for Firebase sync, or toggle meal reminders.
6. After selecting at least one reminder, choose **Send Test Notification**, then press Home or lock the device; the test push arrives after about eight seconds.

Weekly progress is calculated from meal dates using Sunday-Saturday weeks. Day, month, and year views show neutral period metrics without scaling the weekly 30-plant goal.

## Development

Planterly is a static frontend served from this repository and GitHub Pages. The main app lives in `index.html`, styling lives in `css/style.css`, and Firebase sync helpers live in `app.js` and `firebase.js`.

To run locally, serve the repository with any static file server so browser module imports work correctly.

Push reminders use a root service worker, `manifest.json`, and Firebase Cloud Functions in `functions/`. iPhone push notifications require iOS/iPadOS 16.4+ and the app installed to the Home Screen. Configure Web Push VAPID keys before enabling the reminder UI in production; see `functions/README.md`.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for release notes and versioning rules.
