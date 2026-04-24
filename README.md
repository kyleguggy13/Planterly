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

## Usage

1. Open the app and use **Log meal** to choose a date, meal, and plants.
2. Add plants from the quick-add library or type a new plant name.
3. Use **History** to switch between day, week, month, and year views.
4. Use **Plant library** to add or remove saved plant options.
5. Use the menu to export/import logs or sign in for Firebase sync.

Weekly progress is calculated from meal dates using Sunday-Saturday weeks. Day, month, and year views show neutral period metrics without scaling the weekly 30-plant goal.

## Development

Planterly is a static frontend served from this repository and GitHub Pages. The main app lives in `index.html`, styling lives in `css/style.css`, and Firebase sync helpers live in `app.js` and `firebase.js`.

To run locally, serve the repository with any static file server so browser module imports work correctly.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for release notes and versioning rules.
