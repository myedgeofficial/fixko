// Preproste ikone (24×24, črta) za stroke in korake. Barvo vzamejo iz currentColor.
const P = {
  vodovod: '<path d="M4 10h9a3 3 0 0 1 3 3v1"/><path d="M8 10V7h4v3"/><path d="M6 7h8"/><path d="M16 17.5c0 1 .7 1.8 1.5 1.8S19 18.5 19 17.5c0-1-1.5-2.8-1.5-2.8S16 16.5 16 17.5z"/>',
  elektrika: '<path d="M13 3 5 14h6l-1 7 8-11h-6z"/>',
  keramika: '<rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M4 12h16M12 4v16"/>',
  pleskanje: '<rect x="4" y="4" width="13" height="5" rx="1.2"/><path d="M17 6.5h2.5v5H11v3"/><rect x="9.5" y="14.5" width="3" height="6" rx="1"/>',
  mizarstvo: '<path d="M14 3.5 20.5 10l-3 3L11 6.5z"/><path d="M12.5 8 4 16.5 7.5 20 16 11.5"/>',
  montaza: '<rect x="4" y="4" width="16" height="13" rx="1.5"/><path d="M12 4v13M9.5 10.5h.5M14 10.5h.5M6.5 17v3M17.5 17v3"/>',
  ogrevanje: '<path d="M10 14V5a2 2 0 0 1 4 0v9a4 4 0 1 1-4 0z"/><path d="M12 10v6"/>',
  streha: '<path d="M3 12 12 4l9 8"/><path d="M5.5 10v10h13V10"/><path d="M10 20v-5h4v5"/>',
  vrt: '<path d="M5 19C5 11 11 5 20 5c0 9-6 15-14 15"/><path d="M5 19l7-7"/>',
  ciscenje: '<path d="M11 3l1.8 4.2L17 9l-4.2 1.8L11 15l-1.8-4.2L5 9l4.2-1.8z"/><path d="M18 14.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z"/>',
  selitve: '<path d="M3 6h11v10H3zM14 9h4l3 3v4h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  drugo: '<rect x="3" y="8" width="18" height="11" rx="1.5"/><path d="M8 8V5h8v3M3 13h18M11 12v2h2v-2"/>',
  tla: '<path d="M3 20h18"/><path d="M3 15.5h18"/><path d="M8 15.5V20M15 15.5V20M11.5 11V15.5"/><path d="M3 11h18"/>',
  zidar: '<rect x="3" y="5" width="18" height="14" rx="1"/><path d="M3 9.7h18M3 14.3h18M9 5v4.7M15 5v4.7M6 9.7v4.6M12 9.7v4.6M18 9.7v4.6M9 14.3V19M15 14.3V19"/>',
  okna: '<rect x="4" y="3" width="16" height="18" rx="1.2"/><path d="M12 3v18M4 12h16"/>',
  aparati: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M5 7.5h14M8 5.2h.5M11 5.2h.5"/><circle cx="12" cy="14" r="4"/>',
  // splošne
  kamera: '<path d="M3 8h3.5l1.7-2.5h7.6L17.5 8H21v11H3z"/><circle cx="12" cy="13.5" r="3.6"/>',
  smeti: '<path d="M4 7h16M9.5 7V4.5h5V7M6 7l1 13h10l1-13M10 11v5.5M14 11v5.5"/>',
  telefon: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
  dom: '<path d="M3 11 12 3l9 8"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
  orodje: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L3 17.8 6.2 21l6.3-6.3a4 4 0 0 0 5.2-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  kljukica: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  zvezda: '<path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 16.9l-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z"/>',
  vprasaj: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5v.7"/><path d="M12 17v.01"/>',
  koledar: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4M12 13.5v4M10 15.5h4"/>',
  mojster: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'
};
export const ikona = (k, s = 24, w = 1.8) =>
  `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[k] || P.drugo}</svg>`;
