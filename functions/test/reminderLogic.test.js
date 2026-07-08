const assert = require("node:assert/strict");
const {
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

console.log("Reminder timing tests passed");
