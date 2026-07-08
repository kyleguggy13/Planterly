const DEFAULT_REMINDER_HOUR = 21;
const DEFAULT_REMINDER_MINUTE = 0;
const DEFAULT_WINDOW_MINUTES = 15;

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

module.exports = {
  DEFAULT_REMINDER_HOUR,
  DEFAULT_REMINDER_MINUTE,
  DEFAULT_WINDOW_MINUTES,
  getLocalDateTimeParts,
  shouldSendReminderAt
};
