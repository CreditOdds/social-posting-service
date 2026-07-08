/**
 * Shared request-field validation helpers.
 */

function parseOptionalInt(value, fieldName) {
  if (value === undefined) return { provided: false };
  if (value === null || value === '') return { provided: true, value: null };
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return { provided: true, error: `${fieldName} must be a number` };
  }
  return { provided: true, value: Math.trunc(parsed) };
}

function normalizeQueueGroup(value) {
  if (value === undefined) return { provided: false };
  if (value === null) return { provided: true, value: null };
  const trimmed = String(value).trim();
  return { provided: true, value: trimmed.length > 0 ? trimmed : null };
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

module.exports = { parseOptionalInt, normalizeQueueGroup, toDate };
