const DEFAULT_REMINDER_HOUR = 21;
const DEFAULT_REMINDER_MINUTE = 0;
const DEFAULT_WINDOW_MINUTES = 15;
const MEAL_REMINDER_SCHEDULES = Object.freeze([
  Object.freeze({ id: "breakfast", meal: "Breakfast", hour: 10, minute: 0, timeLabel: "10:00 AM" }),
  Object.freeze({ id: "lunch", meal: "Lunch", hour: 13, minute: 0, timeLabel: "1:00 PM" }),
  Object.freeze({ id: "dinner", meal: "Dinner", hour: 21, minute: 0, timeLabel: "9:00 PM" })
]);

function getFormatter(timeZone) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  });
}

function getLocalDateTimeParts(date = new Date(), timeZone = "UTC") {
  const parts = getFormatter(timeZone).formatToParts(date).reduce((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    localDate: `${parts.year}-${parts.month}-${parts.day}`
  };
}

function shouldSendReminderAt(date, timeZone, options = {}) {
  const hour = Number.isInteger(options.hour) ? options.hour : DEFAULT_REMINDER_HOUR;
  const minute = Number.isInteger(options.minute) ? options.minute : DEFAULT_REMINDER_MINUTE;
  const windowMinutes = Number.isInteger(options.windowMinutes) ? options.windowMinutes : DEFAULT_WINDOW_MINUTES;
  const local = getLocalDateTimeParts(date, timeZone || "UTC");
  const currentMinuteOfDay = local.hour * 60 + local.minute;
  const reminderMinuteOfDay = hour * 60 + minute;

  return currentMinuteOfDay >= reminderMinuteOfDay &&
    currentMinuteOfDay < reminderMinuteOfDay + windowMinutes;
}

function getEnabledReminderIds(preference = {}) {
  if (preference.enabled !== true) return [];

  if (preference.reminders && typeof preference.reminders === "object") {
    return MEAL_REMINDER_SCHEDULES
      .filter(reminder => preference.reminders[reminder.id] === true)
      .map(reminder => reminder.id);
  }

  // Migrate the legacy single 9:00 PM reminder to Dinner.
  return ["dinner"];
}

function getDueReminderAt(date, timeZone, preference = {}) {
  const enabledReminderIds = new Set(getEnabledReminderIds(preference));

  return MEAL_REMINDER_SCHEDULES.find(reminder =>
    enabledReminderIds.has(reminder.id) &&
    shouldSendReminderAt(date, timeZone, {
      hour: reminder.hour,
      minute: reminder.minute
    })
  ) || null;
}

module.exports = {
  DEFAULT_REMINDER_HOUR,
  DEFAULT_REMINDER_MINUTE,
  DEFAULT_WINDOW_MINUTES,
  MEAL_REMINDER_SCHEDULES,
  getDueReminderAt,
  getEnabledReminderIds,
  getLocalDateTimeParts,
  shouldSendReminderAt
};
