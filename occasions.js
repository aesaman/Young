/** Professional occasion badges (SVG) — offline list + optional online refresh. */

const FA = "۰۱۲۳۴۵۶۷۸۹";

/** Built-in occasions: mm-dd Gregorian and optional jy/jm/jd Shamsi keys */
const BUILTIN = [
  { g: "01-01", title: "سال نو میلادی", icon: "spark", color: "#E6A817" },
  { g: "02-14", title: "روز عشق", icon: "heart", color: "#ff5d8f" },
  { g: "03-08", title: "روز جهانی زن", icon: "flower", color: "#e89ab0" },
  { g: "03-20", title: "آغاز بهار", icon: "leaf", color: "#3dd68c" },
  { g: "03-21", title: "نوروز", icon: "fish", color: "#7eb6ff" },
  { g: "03-22", title: "نوروز", icon: "fish", color: "#7eb6ff" },
  { g: "04-01", title: "روز طبیعت", icon: "leaf", color: "#3dd68c" },
  { g: "04-07", title: "روز جهانی سلامت", icon: "health", color: "#5ec8ff" },
  { g: "04-22", title: "روز زمین", icon: "earth", color: "#4caf50" },
  { g: "05-01", title: "روز کارگر", icon: "gear", color: "#c0c0c0" },
  { g: "05-12", title: "روز پرستار", icon: "health", color: "#ff8fab" },
  { g: "06-05", title: "روز محیط زیست", icon: "leaf", color: "#66bb6a" },
  { g: "08-19", title: "روز پزشک", icon: "med", color: "#5ec8ff" },
  { g: "09-01", title: "آغاز سال تحصیلی", icon: "book", color: "#E6A817" },
  { g: "09-27", title: "روز جهانی گردشگری", icon: "plane", color: "#7eb6ff" },
  { g: "10-05", title: "روز معلم", icon: "book", color: "#E6A817" },
  { g: "10-31", title: "هالووین", icon: "moon", color: "#ff9f43" },
  { g: "11-10", title: "روز دانش‌آموز", icon: "book", color: "#E6A817" },
  { g: "12-03", title: "روز معلولین", icon: "heart", color: "#a78bfa" },
  { g: "12-25", title: "کریسمس", icon: "tree", color: "#3dd68c" },
  // Shamsi fixed approximate (user device local)
  { j: "01-01", title: "نوروز", icon: "fish", color: "#7eb6ff" },
  { j: "01-02", title: "نوروز", icon: "fish", color: "#7eb6ff" },
  { j: "01-03", title: "نوروز", icon: "fish", color: "#7eb6ff" },
  { j: "01-04", title: "نوروز", icon: "fish", color: "#7eb6ff" },
  { j: "01-12", title: "روز جمهوری اسلامی", icon: "star", color: "#E6A817" },
  { j: "01-13", title: "روز طبیعت", icon: "leaf", color: "#3dd68c" },
  { j: "07-15", title: "آغاز سال تحصیلی", icon: "book", color: "#E6A817" }
];

const SVG = {
  med: (c) => `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><circle cx="32" cy="32" r="30" fill="rgba(0,0,0,.25)"/><path d="M28 12h8v16h16v8H36v16h-8V36H12v-8h16z" fill="${c}"/><circle cx="32" cy="32" r="28" fill="none" stroke="${c}" stroke-width="2" opacity=".35"/></svg>`,
  health: (c) => `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><path d="M32 8c-6 0-10 4-10 10v6H14c-4 0-6 2-6 6v20c0 8 8 14 24 14s24-6 24-14V30c0-4-2-6-6-6h-8v-6c0-6-4-10-10-10z" fill="${c}" opacity=".9"/><path d="M29 34h6v8h8v6h-8v8h-6v-8h-8v-6h8z" fill="#0a0a0c"/></svg>`,
  book: (c) => `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><path d="M10 12h20c6 0 10 3 12 6 2-3 6-6 12-6h20v40H34c-4 0-6 1-8 3-2-2-4-3-8-3H10V12z" fill="${c}" opacity=".85"/><path d="M32 18v34" stroke="#0a0a0c" stroke-width="2"/></svg>`,
  leaf: (c) => `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><path d="M48 8C28 10 14 24 12 44c12 2 28-6 34-22-4 2-8 6-10 12 8-4 14-14 12-26z" fill="${c}"/><path d="M22 42c6-8 14-14 24-18" stroke="#0a0a0c" stroke-width="2" fill="none" opacity=".4"/></svg>`,
  heart: (c) => `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><path d="M32 54S8 40 8 24c0-8 6-14 14-14 6 0 10 4 10 4s4-4 10-4c8 0 14 6 14 14 0 16-24 30-24 30z" fill="${c}"/></svg>`,
  earth: (c) => `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><circle cx="32" cy="32" r="22" fill="${c}" opacity=".85"/><path d="M18 28c4-2 8 0 12-2s8-2 12 2M14 36c8 2 16-2 24 0M28 14c2 6 0 12 2 18" stroke="#0a0a0c" stroke-width="2" fill="none" opacity=".35"/></svg>`,
  moon: (c) => `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><path d="M40 8a24 24 0 1 0 16 40A20 20 0 0 1 40 8z" fill="${c}"/></svg>`,
  star: (c) => `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><path d="M32 6l6 18h18l-14 12 6 18-16-12-16 12 6-18L8 24h18z" fill="${c}"/></svg>`,
  fish: (c) => `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><path d="M8 32c10-14 28-18 40-10l8-8v28l-8-8c-12 8-30 4-40-10z" fill="${c}"/><circle cx="20" cy="30" r="2.5" fill="#0a0a0c"/></svg>`,
  tree: (c) => `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><path d="M32 6l14 22H36l12 16H38l10 14H16l10-14H14l12-16H18z" fill="${c}"/><rect x="28" y="48" width="8" height="12" rx="1" fill="#6d4c41"/></svg>`,
  gear: (c) => `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><circle cx="32" cy="32" r="10" fill="#0a0a0c" stroke="${c}" stroke-width="6"/><path d="M30 6h4v10h-4zM30 48h4v10h-4zM6 30h10v4H6zM48 30h10v4H48z" fill="${c}"/><path d="M12 12l7 7-3 3-7-7zM48 12l-7 7 3 3 7-7zM12 52l7-7 3 3-7 7zM48 52l-7-7-3 3 7 7z" fill="${c}"/></svg>`,
  plane: (c) => `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><path d="M8 34l20-4 8-16h6l-4 16 16 4v6l-16-2-2 12h-6l4-12-20 2z" fill="${c}"/></svg>`,
  spark: (c) => `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><path d="M32 4v16M32 44v16M4 32h16M44 32h16M12 12l12 12M40 40l12 12M52 12L40 24M24 40L12 52" stroke="${c}" stroke-width="4" stroke-linecap="round"/></svg>`,
  flower: (c) => `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><circle cx="32" cy="32" r="8" fill="${c}"/><circle cx="32" cy="16" r="8" fill="${c}" opacity=".85"/><circle cx="32" cy="48" r="8" fill="${c}" opacity=".85"/><circle cx="16" cy="32" r="8" fill="${c}" opacity=".85"/><circle cx="48" cy="32" r="8" fill="${c}" opacity=".85"/></svg>`
};

let remoteList = null;

export async function refreshOccasionsOnline() {
  try {
    // optional remote pack — fails silently offline
    const res = await fetch("https://cdn.jsdelivr.net/gh/ful1e5/apple_cursor@main/README.md", { method: "HEAD", signal: AbortSignal.timeout?.(3000) });
    // keep builtin; remote extension placeholder for future JSON endpoint
    if (!res.ok) return;
  } catch {}
}

export function findOccasion(date = new Date(), jalaliKey = null) {
  const list = [...(remoteList || []), ...BUILTIN];
  const g = `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  let hit = list.find((o) => o.g === g);
  if (!hit && jalaliKey) {
    // jalaliKey: YYYY-MM-DD
    const parts = String(jalaliKey).split("-");
    if (parts.length >= 3) {
      const j = `${parts[1]}-${parts[2]}`;
      hit = list.find((o) => o.j === j);
    }
  }
  return hit || null;
}

export function renderOccasionBadge(occ) {
  if (!occ) return "";
  const fn = SVG[occ.icon] || SVG.star;
  const svg = fn(occ.color || "#E6A817");
  return `<div class="occasion-badge" title="${occ.title}">
    <div class="occasion-icon">${svg}</div>
    <span class="occasion-title">${occ.title}</span>
  </div>`;
}

/** Night decor: vector bats orbiting moon position */
export function skyDecorSvg(isDay, moonX = 50, moonY = 40) {
  if (isDay) {
    return `<svg class="sky-fx" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <g class="cloud-soft" opacity=".25" fill="#fff">
        <ellipse cx="22" cy="28" rx="12" ry="5"/>
        <ellipse cx="28" cy="28" rx="8" ry="4"/>
        <ellipse cx="70" cy="36" rx="14" ry="5"/>
        <ellipse cx="78" cy="36" rx="9" ry="4"/>
      </g>
    </svg>`;
  }
  return `<svg class="sky-fx" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
    <g class="stars" fill="#fff">
      <circle cx="12" cy="18" r=".6" opacity=".7"/>
      <circle cx="28" cy="12" r=".4" opacity=".5"/>
      <circle cx="55" cy="20" r=".5" opacity=".6"/>
      <circle cx="82" cy="16" r=".7" opacity=".8"/>
      <circle cx="90" cy="30" r=".4" opacity=".5"/>
    </g>
    <g class="bat-orbit" style="transform-origin:${moonX}% ${moonY}%">
      <g class="bat-spin">
        <path transform="translate(${moonX - 18},${moonY - 8}) scale(.35)" fill="#1a1a1e" stroke="#888" stroke-width="1"
          d="M0 8 C4 0 10 2 12 8 C14 2 20 0 24 8 C18 10 14 14 12 18 C10 14 6 10 0 8Z"/>
      </g>
    </g>
    <g class="bat-orbit reverse" style="transform-origin:${moonX}% ${moonY}%">
      <g class="bat-spin-2">
        <path transform="translate(${moonX + 10},${moonY + 6}) scale(.28)" fill="#121218" stroke="#666" stroke-width="1"
          d="M0 8 C4 0 10 2 12 8 C14 2 20 0 24 8 C18 10 14 14 12 18 C10 14 6 10 0 8Z"/>
      </g>
    </g>
    <g class="pumpkins" fill="#e67e22">
      <ellipse cx="18" cy="92" rx="4" ry="3.2"/>
      <ellipse cx="50" cy="93" rx="5" ry="3.5"/>
      <ellipse cx="82" cy="92" rx="4.2" ry="3"/>
      <rect x="17" y="88" width="2" height="3" fill="#2e7d32"/>
      <rect x="49" y="88" width="2" height="3" fill="#2e7d32"/>
      <rect x="81" y="88" width="2" height="3" fill="#2e7d32"/>
    </g>
  </svg>`;
}
