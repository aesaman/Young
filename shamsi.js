/* Jalali calendar — offline, no network. Algorithm: jalaali-js compatible. */
export const MONTHS = ["فروردین","اردیبهشت","خرداد","تیر","مرداد","شهریور","مهر","آبان","آذر","دی","بهمن","اسفند"];
export const WEEKDAYS = ["یکشنبه","دوشنبه","سه‌شنبه","چهارشنبه","پنجشنبه","جمعه","شنبه"];

export function toFaDigits(value) {
  const map = "۰۱۲۳۴۵۶۷۸۹";
  return String(value).replace(/\d/g, (d) => map[d]);
}

export function pad2(n) {
  return String(n).padStart(2, "0");
}

export function div(a, b) { return ~~(a / b); }
export function mod(a, b) { return a - ~~(a / b) * b; }

export function gregorianToJalali(gy, gm, gd) {
  const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  let jy = gy <= 1600 ? 0 : 979;
  gy -= gy <= 1600 ? 621 : 1600;
  const gy2 = gm > 2 ? gy + 1 : gy;
  let days = 365 * gy + div(gy2 + 3, 4) - div(gy2 + 99, 100) + div(gy2 + 399, 400) - 80 + gd + g_d_m[gm - 1];
  jy += 33 * div(days, 12053);
  days = mod(days, 12053);
  jy += 4 * div(days, 1461);
  days = mod(days, 1461);
  if (days > 365) {
    jy += div(days - 1, 365);
    days = mod(days - 1, 365);
  }
  const jm = days < 186 ? 1 + div(days, 31) : 7 + div(days - 186, 30);
  const jd = 1 + (days < 186 ? mod(days, 31) : mod(days - 186, 30));
  return { jy, jm, jd };
}

export function jalaliToGregorian(jy, jm, jd) {
  let gy = jy <= 979 ? 621 : 1600;
  jy -= jy <= 979 ? 0 : 979;
  let days = 365 * jy + div(jy, 33) * 8 + div(mod(jy, 33) + 3, 4) + 78 + jd + (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
  gy += 400 * div(days, 146097);
  days = mod(days, 146097);
  if (days > 36524) {
    gy += 100 * div(--days, 36524);
    days = mod(days, 36524);
    if (days >= 365) days++;
  }
  gy += 4 * div(days, 1461);
  days = mod(days, 1461);
  if (days > 365) {
    gy += div(days - 1, 365);
    days = mod(days - 1, 365);
  }
  let gd = days + 1;
  const sal_a = [0, 31, (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 0;
  for (gm = 1; gm <= 12 && gd > sal_a[gm]; gm++) gd -= sal_a[gm];
  return { gy, gm, gd };
}

export function isLeapJalali(jy) {
  const r = mod(jy - (jy > 0 ? 474 : 473), 2820) + 474;
  return mod((r + 38) * 682, 2816) < 682;
}

export function daysInJalaliMonth(jy, jm) {
  if (jm <= 6) return 31;
  if (jm <= 11) return 30;
  return isLeapJalali(jy) ? 30 : 29;
}

export function dateKey(jy, jm, jd) {
  return `${jy}-${pad2(jm)}-${pad2(jd)}`;
}

export function parseKey(key) {
  const [jy, jm, jd] = key.split("-").map(Number);
  return { jy, jm, jd };
}

export function todayKey(date = new Date()) {
  const j = gregorianToJalali(date.getFullYear(), date.getMonth() + 1, date.getDate());
  return dateKey(j.jy, j.jm, j.jd);
}

export function formatLong(key) {
  const { jy, jm, jd } = parseKey(key);
  const g = jalaliToGregorian(jy, jm, jd);
  const dt = new Date(g.gy, g.gm - 1, g.gd);
  const wd = WEEKDAYS[dt.getDay()];
  return `${wd} ${toFaDigits(jd)} ${MONTHS[jm - 1]} ${toFaDigits(jy)}`;
}

export function formatShort(key) {
  const { jm, jd } = parseKey(key);
  return `${toFaDigits(jd)} ${MONTHS[jm - 1]}`;
}

export function shiftKey(key, deltaDays) {
  const { jy, jm, jd } = parseKey(key);
  const g = jalaliToGregorian(jy, jm, jd);
  const dt = new Date(g.gy, g.gm - 1, g.gd);
  dt.setDate(dt.getDate() + deltaDays);
  return todayKey(dt);
}

export function compareKeys(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}
