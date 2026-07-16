export const WEEKDAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
]

export const DINING_OFFER_SCHEDULE_OPTIONS = [
  { value: "all_days", label: "All Days" },
  { value: "weekdays", label: "Weekdays Only (Mon-Fri)" },
  { value: "weekends", label: "Weekends Only (Sat-Sun)" },
  { value: "custom", label: "Custom Days" },
]

export const HAPPY_HOURS_DAYS_MESSAGE = "Please select the applicable day(s) before configuring Happy Hours."
export const DATE_RANGE_REQUIRED_MESSAGE = "Start date and end date are required for every dining offer."
export const DATE_RANGE_ORDER_MESSAGE = "End date cannot be earlier than start date."

export const parseLocalDate = (value) => {
  if (!value) return undefined
  const parts = String(value).split("-").map(Number)
  if (parts.length !== 3 || parts.some(Number.isNaN)) return undefined
  const [year, month, day] = parts
  return new Date(year, month - 1, day)
}

export const normalizeSchedule = (schedule) => {
  const validModes = new Set(["all_days", "weekdays", "weekends", "custom"])
  const mode = validModes.has(schedule?.mode) ? schedule.mode : "all_days"
  const customDays =
    mode === "custom"
      ? [...new Set((Array.isArray(schedule?.customDays) ? schedule.customDays : []).map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6))]
      : []
  const happyHours = Array.isArray(schedule?.happyHours)
    ? schedule.happyHours.map((slot) => ({
        start: String(slot?.start || "").trim(),
        end: String(slot?.end || "").trim(),
      }))
    : []

  return { mode, customDays, happyHours }
}

export const isDayValidForSchedule = (dayOfWeek, schedule) => {
  const normalizedSchedule = normalizeSchedule(schedule)
  if (normalizedSchedule.mode === "all_days") return true
  if (normalizedSchedule.mode === "weekdays") return dayOfWeek >= 1 && dayOfWeek <= 5
  if (normalizedSchedule.mode === "weekends") return dayOfWeek === 0 || dayOfWeek === 6
  if (normalizedSchedule.mode === "custom") {
    return normalizedSchedule.customDays.includes(dayOfWeek)
  }
  return true
}

const getScheduleWindowLabel = (schedule) => {
  const normalizedSchedule = normalizeSchedule(schedule)
  if (normalizedSchedule.mode === "weekdays") return "weekday(s)"
  if (normalizedSchedule.mode === "weekends") return "weekend day(s)"
  if (normalizedSchedule.mode === "custom") return "selected custom day(s)"
  return "day(s)"
}

export const dateRangeIncludesScheduledDay = (startDateValue, endDateValue, schedule) => {
  const startDate = parseLocalDate(startDateValue)
  const endDate = parseLocalDate(endDateValue)
  if (!startDate || !endDate) return false

  const current = new Date(startDate)
  current.setHours(0, 0, 0, 0)
  const end = new Date(endDate)
  end.setHours(0, 0, 0, 0)

  while (current.getTime() <= end.getTime()) {
    if (isDayValidForSchedule(current.getDay(), schedule)) return true
    current.setDate(current.getDate() + 1)
  }

  return false
}

export const validateHappyHourSlots = (slots) => {
  const normalizedSlots = Array.isArray(slots)
    ? slots.map((slot) => ({
        start: String(slot?.start || "").trim(),
        end: String(slot?.end || "").trim(),
      }))
    : []

  if (normalizedSlots.length === 0) {
    return "Add at least one valid Happy Hour time slot."
  }

  for (let index = 0; index < normalizedSlots.length; index += 1) {
    const slot = normalizedSlots[index]
    if (!slot.start || !slot.end) {
      return "All Happy Hour slots must have a start and end time."
    }
    if (slot.start >= slot.end) {
      return `Happy Hour slot ${index + 1} must end after it starts.`
    }
  }

  const sortedSlots = [...normalizedSlots].sort((a, b) => a.start.localeCompare(b.start))
  for (let index = 1; index < sortedSlots.length; index += 1) {
    if (sortedSlots[index].start < sortedSlots[index - 1].end) {
      return `Happy Hour slots ${sortedSlots[index - 1].start}-${sortedSlots[index - 1].end} and ${sortedSlots[index].start}-${sortedSlots[index].end} overlap.`
    }
  }

  return ""
}

export const validateDiningOfferSchedule = ({
  startDate,
  endDate,
  schedule,
  happyHoursEnabled,
  requireFutureDates = false,
  todayDateString = "",
}) => {
  const normalizedSchedule = normalizeSchedule(schedule)

  if (!startDate || !endDate) {
    return DATE_RANGE_REQUIRED_MESSAGE
  }

  if (startDate > endDate) {
    return DATE_RANGE_ORDER_MESSAGE
  }

  if (requireFutureDates && todayDateString) {
    if (startDate < todayDateString) return "Start date cannot be in the past."
    if (endDate < todayDateString) return "End date cannot be in the past."
  }

  if (normalizedSchedule.mode === "custom" && normalizedSchedule.customDays.length === 0) {
    return "Please select at least one custom day."
  }

  if (!dateRangeIncludesScheduledDay(startDate, endDate, normalizedSchedule)) {
    return `The selected date range does not include any ${getScheduleWindowLabel(normalizedSchedule)}. Please adjust the dates or schedule.`
  }

  if (happyHoursEnabled) {
    if (normalizedSchedule.mode === "custom" && normalizedSchedule.customDays.length === 0) {
      return HAPPY_HOURS_DAYS_MESSAGE
    }

    return validateHappyHourSlots(normalizedSchedule.happyHours)
  }

  return ""
}
