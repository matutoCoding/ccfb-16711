// 统一线框图标：24x24 viewBox，stroke 1.7，圆角端点，currentColor 继承颜色
const wrap = (paths: string, size = 18): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`

export const iconSvg = {
  library: (s?: number) =>
    wrap('<path d="M4 4h16v4H4z"/><path d="M4 12h10v8H4z"/><path d="M18 12h2v8h-2z"/>', s),
  luggage: (s?: number) =>
    wrap('<rect x="6" y="7" width="12" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M6 11h12"/><path d="M10 20v2M14 20v2"/>', s),
  train: (s?: number) =>
    wrap('<path d="M4 15V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9"/><path d="M4 15h16v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><circle cx="8.5" cy="17.5" r="1"/><circle cx="15.5" cy="17.5" r="1"/><path d="M9 8h6"/>', s),
  exam: (s?: number) =>
    wrap('<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M9 14l2 2 4-4"/>', s),
  chart: (s?: number) =>
    wrap('<path d="M4 20V4"/><path d="M4 20h16"/><rect x="7" y="12" width="3" height="5"/><rect x="12" y="8" width="3" height="9"/><rect x="17" y="5" width="3" height="12"/>', s),
  settings: (s?: number) =>
    wrap('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>', s),
  plus: (s?: number) => wrap('<path d="M12 5v14M5 12h14"/>', s),
  trash: (s?: number) =>
    wrap('<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/>', s),
  download: (s?: number) =>
    wrap('<path d="M12 3v12"/><path d="M7 10l5 5 5-5"/><path d="M4 21h16"/>', s),
  upload: (s?: number) =>
    wrap('<path d="M12 15V3"/><path d="M7 8l5-5 5 5"/><path d="M4 21h16"/>', s),
  zoom: (s?: number) =>
    wrap('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/><path d="M11 8v6M8 11h6"/>', s),
  play: (s?: number) => wrap('<polygon points="6 4 20 12 6 20 6 4"/>', s),
  stop: (s?: number) => wrap('<rect x="6" y="6" width="12" height="12" rx="1"/>', s),
  refresh: (s?: number) =>
    wrap('<path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/>', s),
  user: (s?: number) =>
    wrap('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>', s),
}

export const Icon = ({ name, size }: { name: keyof typeof iconSvg; size?: number }): string =>
  iconSvg[name](size)
