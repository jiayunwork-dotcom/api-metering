import dayjs from 'dayjs';

export function getMonthKey(date = new Date()) {
  return dayjs(date).format('YYYY-MM');
}

export function getMonthStart(date = new Date()) {
  return dayjs(date).startOf('month').toDate();
}

export function getMonthEnd(date = new Date()) {
  return dayjs(date).endOf('month').toDate();
}

export function getMinuteStart(date = new Date()) {
  return dayjs(date).startOf('minute').toDate();
}

export function getMinuteEnd(date = new Date()) {
  return dayjs(date).endOf('minute').toDate();
}

export function getHourStart(date = new Date()) {
  return dayjs(date).startOf('hour').toDate();
}

export function getHourEnd(date = new Date()) {
  return dayjs(date).endOf('hour').toDate();
}

export function getDayStart(date = new Date()) {
  return dayjs(date).startOf('day').toDate();
}

export function getDayEnd(date = new Date()) {
  return dayjs(date).endOf('day').toDate();
}

export function getEventId(tenantId, apiInterfaceId, timestamp) {
  const ts = dayjs(timestamp).valueOf();
  return `${tenantId}:${apiInterfaceId}:${ts}`;
}

export function formatDate(date, format = 'YYYY-MM-DD HH:mm:ss') {
  return dayjs(date).format(format);
}

export default {
  getMonthKey,
  getMonthStart,
  getMonthEnd,
  getMinuteStart,
  getMinuteEnd,
  getHourStart,
  getHourEnd,
  getDayStart,
  getDayEnd,
  getEventId,
  formatDate,
};
