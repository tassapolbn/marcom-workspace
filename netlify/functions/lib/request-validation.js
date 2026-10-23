function isRealDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [year, month, day] = s.split('-').map(Number);
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= days[month - 1];
}

function isRealTime(s) {
  if (typeof s !== 'string' || !/^\d{2}:\d{2}$/.test(s)) return false;
  const [hours, minutes] = s.split(':').map(Number);
  return hours <= 23 && minutes <= 59;
}

function scheduleErrors(type, d) {
  const errors = {};
  for (const key of ['deadline', 'eventDate']) {
    if (d[key] && !isRealDate(d[key])) errors[key] = 'invalid_date';
  }
  for (const key of ['startTime', 'endTime']) {
    if (d[key] && !isRealTime(d[key])) errors[key] = 'invalid_time';
  }
  if (type === 'photo' && isRealTime(d.startTime) && isRealTime(d.endTime) && d.endTime <= d.startTime) {
    errors.endTime = 'end_before_start';
  }
  return errors;
}

module.exports = { isRealDate, isRealTime, scheduleErrors };
