function parseTimeToMinutes(value) {
  if (!value || typeof value !== 'string') return null;
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

function getLocalMinutes(date, timeZone) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(date);
    const hour = Number(parts.find(p => p.type === 'hour')?.value ?? 0);
    const minute = Number(parts.find(p => p.type === 'minute')?.value ?? 0);
    return hour * 60 + minute;
  } catch {
    return null;
  }
}

function isInBlackout(date, blackout) {
  if (!blackout || !blackout.enabled) return false;
  const startMinutes = parseTimeToMinutes(blackout.start);
  const endMinutes = parseTimeToMinutes(blackout.end);
  if (startMinutes === null || endMinutes === null) return false;
  const localMinutes = getLocalMinutes(date, blackout.timezone || 'America/New_York');
  if (localMinutes === null) return false;
  if (startMinutes === endMinutes) return true;
  if (startMinutes < endMinutes) {
    return localMinutes >= startMinutes && localMinutes < endMinutes;
  }
  return localMinutes >= startMinutes || localMinutes < endMinutes;
}

function advanceToNextAllowedTick(date, intervalMs, blackout) {
  let tick = date;
  let guard = 0;
  while (isInBlackout(tick, blackout) && guard < 1000) {
    tick = new Date(tick.getTime() + intervalMs);
    guard += 1;
  }
  return tick;
}

module.exports = {
  parseTimeToMinutes,
  isInBlackout,
  advanceToNextAllowedTick,
};
