/** Sunrise/sunset + weather — accurate city-local times. */

export const CITIES = [
  { id: "tehran", name: "تهران", lat: 35.6892, lon: 51.3890, tz: 3.5 },
  { id: "mashhad", name: "مشهد", lat: 36.2605, lon: 59.6168, tz: 3.5 },
  { id: "isfahan", name: "اصفهان", lat: 32.6546, lon: 51.6680, tz: 3.5 },
  { id: "shiraz", name: "شیراز", lat: 29.5918, lon: 52.5837, tz: 3.5 },
  { id: "tabriz", name: "تبریز", lat: 38.0962, lon: 46.2738, tz: 3.5 },
  { id: "karaj", name: "کرج", lat: 35.8400, lon: 50.9391, tz: 3.5 },
  { id: "ahvaz", name: "اهواز", lat: 31.3183, lon: 48.6706, tz: 3.5 },
  { id: "qom", name: "قم", lat: 34.6416, lon: 50.8746, tz: 3.5 },
  { id: "rasht", name: "رشت", lat: 37.2808, lon: 49.5832, tz: 3.5 },
  { id: "yazd", name: "یزد", lat: 31.8974, lon: 54.3569, tz: 3.5 },
  { id: "kerman", name: "کرمان", lat: 30.2832, lon: 57.0788, tz: 3.5 },
  { id: "kermanshah", name: "کرمانشاه", lat: 34.3142, lon: 47.0650, tz: 3.5 },
  { id: "urmia", name: "ارومیه", lat: 37.5527, lon: 45.0761, tz: 3.5 },
  { id: "sari", name: "ساری", lat: 36.5633, lon: 53.0601, tz: 3.5 },
  { id: "bandarabbas", name: "بندرعباس", lat: 27.1832, lon: 56.2666, tz: 3.5 },
  { id: "bushehr", name: "بوشهر", lat: 28.9234, lon: 50.8203, tz: 3.5 },
  { id: "zahedan", name: "زاهدان", lat: 29.4963, lon: 60.8629, tz: 3.5 },
  { id: "ardabil", name: "اردبیل", lat: 38.2498, lon: 48.2933, tz: 3.5 },
  { id: "istanbul", name: "استانبول", lat: 41.0082, lon: 28.9784, tz: 3 },
  { id: "dubai", name: "دبی", lat: 25.2048, lon: 55.2708, tz: 4 },
  { id: "london", name: "لندن", lat: 51.5074, lon: -0.1278, tz: 0 }
];

function toRad(d) { return d * Math.PI / 180; }

/** Offline sunrise/sunset minutes from city-local midnight (USNO-style). */
export function sunTimes(lat, lon, date = new Date(), tzOffsetHours = 3.5) {
  const cityMs = date.getTime() + tzOffsetHours * 3600000;
  const cd = new Date(cityMs);
  const y = cd.getUTCFullYear();
  const m = cd.getUTCMonth() + 1;
  const day = cd.getUTCDate();

  const N1 = Math.floor(275 * m / 9);
  const N2 = Math.floor((m + 9) / 12);
  const N3 = 1 + Math.floor((y - 4 * Math.floor(y / 4) + 2) / 3);
  const N = N1 - (N2 * N3) + day - 30;
  const lngHour = lon / 15;

  const compute = (isRise) => {
    const t = N + ((isRise ? 6 : 18) - lngHour) / 24;
    const M = (0.9856 * t) - 3.289;
    let L = M + (1.916 * Math.sin(toRad(M))) + (0.020 * Math.sin(toRad(2 * M))) + 282.634;
    L = ((L % 360) + 360) % 360;
    let RA = Math.atan(0.91764 * Math.tan(toRad(L))) * 180 / Math.PI;
    RA = ((RA % 360) + 360) % 360;
    RA = RA + (Math.floor(L / 90) * 90 - Math.floor(RA / 90) * 90);
    RA = RA / 15;
    const sinDec = 0.39782 * Math.sin(toRad(L));
    const cosDec = Math.cos(Math.asin(sinDec));
    const cosH = (Math.cos(toRad(90.833)) - (sinDec * Math.sin(toRad(lat)))) / (cosDec * Math.cos(toRad(lat)));
    if (cosH > 1) return { polar: "night" };
    if (cosH < -1) return { polar: "day" };
    let H = Math.acos(Math.max(-1, Math.min(1, cosH))) * 180 / Math.PI;
    H = isRise ? (360 - H) : H;
    H = H / 15;
    let T = H + RA - (0.06571 * t) - 6.622;
    let UT = T - lngHour;
    UT = ((UT % 24) + 24) % 24;
    let local = UT + tzOffsetHours;
    local = ((local % 24) + 24) % 24;
    return { hours: local, polar: false };
  };

  const r = compute(true);
  const s = compute(false);
  if (r.polar === "night") return { riseMin: 0, setMin: 0, polar: "night" };
  if (r.polar === "day") return { riseMin: 0, setMin: 24 * 60 - 1, polar: "day" };
  return {
    riseMin: Math.round(r.hours * 60) % (24 * 60),
    setMin: Math.round(s.hours * 60) % (24 * 60),
    polar: false
  };
}

export function fmtMin(min) {
  const h = Math.floor(min / 60) % 24;
  const m = Math.floor(min % 60);
  return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
}

export function localMinutes(now, tzOffsetHours = 3.5) {
  const utcMins = now.getUTCHours() * 60 + now.getUTCMinutes() + now.getUTCSeconds() / 60;
  let mins = utcMins + tzOffsetHours * 60;
  return ((mins % (24 * 60)) + 24 * 60) % (24 * 60);
}

export function skyPosition(now, riseMin, setMin, tzOffsetHours = 3.5) {
  const mins = localMinutes(now, tzOffsetHours);
  const isDay = riseMin <= setMin
    ? (mins >= riseMin && mins < setMin)
    : (mins >= riseMin || mins < setMin);

  let t;
  if (isDay) {
    const span = setMin > riseMin ? (setMin - riseMin) : (24 * 60 - riseMin + setMin);
    const elapsed = mins >= riseMin ? (mins - riseMin) : (mins + 24 * 60 - riseMin);
    t = elapsed / Math.max(1, span);
  } else {
    const span = setMin < riseMin ? (riseMin - setMin) : (24 * 60 - setMin + riseMin);
    let elapsed;
    if (mins >= setMin) elapsed = mins - setMin;
    else elapsed = mins + 24 * 60 - setMin;
    t = elapsed / Math.max(1, span);
  }
  t = Math.max(0, Math.min(1, t));
  // Match CSS .sky-arc: left/right 8%, top 18%, height 120% of path → ellipse center ~50%,78%
  // parameter t=0 at left (rise/set start), t=1 at right
  const angle = Math.PI * (1 - t); // π → 0
  const cx = 50, cy = 78, rx = 42, ry = 55;
  const x = cx + rx * Math.cos(angle);
  const y = cy - ry * Math.sin(angle);
  return { isDay, x, y, t, localMins: mins };
}

export async function fetchSunTimes(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=sunrise,sunset&timezone=auto&forecast_days=1`;
  const res = await fetch(url, { signal: AbortSignal.timeout?.(10000) });
  if (!res.ok) throw new Error("sun");
  const data = await res.json();
  const rise = data.daily?.sunrise?.[0];
  const set = data.daily?.sunset?.[0];
  if (!rise || !set) throw new Error("sun empty");
  const parseIsoLocal = (iso) => {
    const m = String(iso).match(/T(\d{2}):(\d{2})/);
    if (m) return Number(m[1]) * 60 + Number(m[2]);
    const d = new Date(iso);
    return d.getHours() * 60 + d.getMinutes();
  };
  return { riseMin: parseIsoLocal(rise), setMin: parseIsoLocal(set), polar: false, source: "api" };
}

export async function fetchWeather(lat, lon, isDay = true) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,is_day&timezone=auto`;
  const res = await fetch(url, { signal: AbortSignal.timeout?.(8000) });
  if (!res.ok) throw new Error("wx");
  const data = await res.json();
  const code = data.current?.weather_code ?? 0;
  const temp = data.current?.temperature_2m;
  // prefer API is_day if present
  if (data.current?.is_day != null) isDay = !!data.current.is_day;
  const dayMap = {
    0: ["☀️", "صاف"], 1: ["🌤", "عمدتاً صاف"], 2: ["⛅", "نیمه‌ابری"], 3: ["☁️", "ابری"],
    45: ["🌫", "مه"], 48: ["🌫", "مه یخ‌زده"],
    51: ["🌦", "نم‌نم"], 61: ["🌧", "بارانی"], 63: ["🌧", "باران متوسط"], 65: ["🌧", "باران شدید"],
    71: ["❄️", "برفی"], 73: ["❄️", "برف متوسط"], 75: ["❄️", "برف شدید"],
    80: ["🌦", "رگبار"], 95: ["⛈", "رعدوبرق"]
  };
  const nightMap = {
    0: ["🌙", "آسمان صاف"], 1: ["🌙", "عمدتاً صاف"], 2: ["☁️", "نیمه‌ابری"], 3: ["☁️", "ابری"],
    45: ["🌫", "مه"], 48: ["🌫", "مه یخ‌زده"],
    51: ["🌧", "نم‌نم"], 61: ["🌧", "بارانی"], 63: ["🌧", "باران متوسط"], 65: ["🌧", "باران شدید"],
    71: ["❄️", "برفی"], 73: ["❄️", "برف متوسط"], 75: ["❄️", "برف شدید"],
    80: ["🌧", "رگبار"], 95: ["⛈", "رعدوبرق"]
  };
  const map = isDay ? dayMap : nightMap;
  const [icon, label] = map[code] || map[0];
  return { icon, label, temp, offline: false, isDay: !!isDay };
}

export function offlineWeatherHint(isDay) {
  return { icon: isDay ? "☀️" : "🌙", label: isDay ? "روز (آفلاین)" : "شب (آفلاین)", temp: null, offline: true };
}
