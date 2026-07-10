const assert = require("node:assert/strict");
const {
  getDueReminderAt,
  getEnabledReminderIds,
  getLocalDateTimeParts,
  shouldSendReminderAt
} = require("../reminderLogic");

const easternNinePm = new Date("2026-07-09T01:00:00.000Z");
const easternParts = getLocalDateTimeParts(easternNinePm, "America/New_York");

assert.equal(easternParts.localDate, "2026-07-08");
assert.equal(easternParts.hour, 21);
assert.equal(easternParts.minute, 0);
assert.equal(shouldSendReminderAt(easternNinePm, "America/New_York"), true);

const insideWindow = new Date("2026-07-09T01:14:00.000Z");
assert.equal(shouldSendReminderAt(insideWindow, "America/New_York"), true);

const outsideWindow = new Date("2026-07-09T01:15:00.000Z");
assert.equal(shouldSendReminderAt(outsideWindow, "America/New_York"), false);

const pacificNinePm = new Date("2026-07-09T04:00:00.000Z");
assert.equal(shouldSendReminderAt(pacificNinePm, "America/Los_Angeles"), true);
assert.equal(shouldSendReminderAt(pacificNinePm, "America/New_York"), false);

const allMealsEnabled = {
  enabled: true,
  reminders: {
    breakfast: true,
    lunch: true,
    dinner: true
  }
};

const easternTenAm = new Date("2026-07-08T14:00:00.000Z");
assert.equal(getDueReminderAt(easternTenAm, "America/New_York", allMealsEnabled)?.id, "breakfast");

const easternOnePm = new Date("2026-07-08T17:00:00.000Z");
assert.equal(getDueReminderAt(easternOnePm, "America/New_York", allMealsEnabled)?.id, "lunch");
assert.equal(getDueReminderAt(easternNinePm, "America/New_York", allMealsEnabled)?.id, "dinner");

const breakfastDisabled = {
  ...allMealsEnabled,
  reminders: { ...allMealsEnabled.reminders, breakfast: false }
};
assert.equal(getDueReminderAt(easternTenAm, "America/New_York", breakfastDisabled), null);

assert.deepEqual(getEnabledReminderIds({ enabled: false, reminders: allMealsEnabled.reminders }), []);
assert.deepEqual(getEnabledReminderIds({ enabled: true, reminders: {} }), []);
assert.deepEqual(getEnabledReminderIds({ enabled: true }), ["dinner"]);
assert.equal(getDueReminderAt(easternNinePm, "America/New_York", { enabled: true })?.id, "dinner");

console.log("Reminder timing tests passed");
