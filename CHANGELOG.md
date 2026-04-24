# Changelog

All notable Planterly changes are documented here.

Planterly uses semantic versioning: `MAJOR.MINOR.PATCH`. Major and minor version updates require explicit user consent before they are created. Patch entries may document fixes, documentation updates, and compatibility refinements that do not broaden the app's feature scope.

## v0.1.0 - 2026-04-24

### Major

- No major release changes.

### Minor

- Documented the first Planterly release as a static plant diversity tracker.
- Added meal logging by date, meal type, and selected plants.
- Added a categorized plant library with quick-add support.
- Added history views for day, week, month, and year.
- Added weekly 30-plant goal metrics and neutral metrics for non-week periods.
- Added browser autosave, JSON import/export, and Google/Firebase sync support.

### Patch

- Refined the data model so date is the source of truth for period calculations while legacy `week` fields remain compatible.
- Fixed mobile drawer dismissal so tapping outside the sidebar closes it.
- Added project documentation and this changelog.
