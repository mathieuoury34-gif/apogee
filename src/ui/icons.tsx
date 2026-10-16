// Icônes Lucide (trait 2 px), tracés identiques aux maquettes.
import type { CSSProperties } from 'react';

const P: Record<string, string[]> = {
  refresh: ['M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8', 'M21 3v5h-5', 'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16', 'M8 16H3v5'],
  settings: ['M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z', 'circle:12,12,3'],
  marches: ['M3 3v16a2 2 0 0 0 2 2h16', 'm19 9-5 5-4-4-3 3'],
  historique: ['M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8', 'M3 3v5h5', 'M12 7v5l4 2'],
  portefeuille: ['M21 12c.552 0 1.005-.449.95-.998a10 10 0 0 0-8.953-8.951c-.55-.055-.998.398-.998.95v8a1 1 0 0 0 1 1z', 'M21.21 15.89A10 10 0 1 1 8 2.83'],
  simulateur: ['rect:4,2,16,20,2', 'M8 6h8', 'M16 14v4', 'M16 10h.01', 'M12 10h.01', 'M8 10h.01', 'M12 14h.01', 'M8 14h.01', 'M12 18h.01', 'M8 18h.01'],
  back: ['m15 18-6-6 6-6'],
  next: ['m9 18 6-6-6-6'],
  down: ['m6 9 6 6 6-6'],
  up: ['m18 15-6-6-6 6'],
  plus: ['M5 12h14', 'M12 5v14'],
  minus: ['M5 12h14'],
  close: ['M18 6 6 18', 'm6 6 12 12'],
  search: ['circle:11,11,8', 'm21 21-4.3-4.3'],
  sort: ['m21 16-4 4-4-4', 'M17 20V4', 'm3 8 4-4 4 4', 'M7 4v16'],
  plusCircle: ['circle:12,12,10', 'M8 12h8', 'M12 8v8'],
  calendar: ['M8 2v4', 'M16 2v4', 'rect:3,4,18,18,2', 'M3 10h18'],
  info: ['circle:12,12,10', 'M12 16v-4', 'M12 8h.01'],
  deposit: ['M12 17V3', 'm6 11 6 6 6-6', 'M19 21H5'],
  cart: ['circle:8,21,1', 'circle:19,21,1', 'M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12'],
  pencil: ['M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z'],
  trash: ['M3 6h18', 'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6', 'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2', 'M10 11v6', 'M14 11v6'],
  sparkle: ['M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z'],
  upload: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M17 8l-5-5-5 5', 'M12 3v12'],
  download: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M7 10l5 5 5-5', 'M12 15V3'],
  sheet: ['M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z', 'M14 2v4a2 2 0 0 0 2 2h4', 'M8 13h2', 'M14 13h2', 'M8 17h2', 'M14 17h2'],
  trend: ['M22 7 13.5 15.5 8.5 10.5 2 17', 'M16 7h6v6'],
  alert: ['m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3', 'M12 9v4', 'M12 17h.01'],
  success: ['M22 11.08V12a10 10 0 1 1-5.93-9.14', 'm9 11 3 3L22 4'],
  inbox: ['M22 12h-6l-2 3h-4l-2-3H2', 'M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z'],
  check: ['M20 6 9 17l-5-5'],
  cloud: ['M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z'],
  logout: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'm16 17 5-5-5-5', 'M21 12H9'],
  list: ['M3 12h.01', 'M3 18h.01', 'M3 6h.01', 'M8 12h13', 'M8 18h13', 'M8 6h13'],
  grip: ['circle:9,12,1', 'circle:9,5,1', 'circle:9,19,1', 'circle:15,12,1', 'circle:15,5,1', 'circle:15,19,1'],

  // ---- ajouts Quadra (Lucide, trait 2 px) ----
  accueil: ['M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8', 'M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'],
  calendrier: ['M8 2v4', 'M16 2v4', 'rect:3,4,18,18,2', 'M3 10h18', 'M8 14h.01', 'M12 14h.01', 'M16 14h.01', 'M8 18h.01', 'M12 18h.01', 'M16 18h.01'],
  seances: ['M22 12h-4l-3 9L9 3l-3 9H2'],
  progression: ['M3 3v16a2 2 0 0 0 2 2h16', 'M18 17V9', 'M13 17V5', 'M8 17v-3'],
  coach: ['M8 3 4 7l4 4', 'M4 7h16', 'm16 21 4-4-4-4', 'M20 17H4'],
  user: ['M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2', 'circle:12,7,4'],
  heart: ['M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z'],
  moon: ['M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z'],
  flame: ['M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z'],
  flag: ['M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z', 'M4 22v-7'],
  target: ['circle:12,12,10', 'circle:12,12,6', 'circle:12,12,2'],
  timer: ['M10 2h4', 'M12 14l3-3', 'circle:12,14,8'],
  clock: ['circle:12,12,10', 'M12 6v6l4 2'],
  gauge: ['m12 14 4-4', 'M3.34 19a10 10 0 1 1 17.32 0'],
  layers: ['m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z', 'm22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65', 'm22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65'],
  pause: ['circle:12,12,10', 'M10 15V9', 'M14 15V9'],
  phone: ['rect:5,2,14,20,2', 'M12 18h.01'],
  link: ['M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71', 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'],
  copy: ['rect:8,8,14,14,2', 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2'],
  clipboard: ['rect:8,2,8,4,1', 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2'],
  route: ['circle:6,19,3', 'M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15', 'circle:18,5,3'],
  more: ['circle:12,12,1', 'circle:12,5,1', 'circle:12,19,1'],
  database: ['M3 5a9 3 0 1 0 18 0 9 3 0 1 0-18 0', 'M3 5v14a9 3 0 0 0 18 0V5', 'M3 12a9 3 0 0 0 18 0'],
  folder: ['M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z'],
  shield: ['M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z'],
  bell: ['M10.268 21a2 2 0 0 0 3.464 0', 'M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326'],
  sun: ['circle:12,12,4', 'M12 2v2', 'M12 20v2', 'm4.93 4.93 1.41 1.41', 'm17.66 17.66 1.41 1.41', 'M2 12h2', 'M20 12h2', 'm6.34 17.66-1.41 1.41', 'm19.07 4.93-1.41 1.41'],
  edit: ['M12 20h9', 'M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.854z'],
  arrowUp: ['m5 12 7-7 7 7', 'M12 19V5'],
  arrowDown: ['M12 5v14', 'm19 12-7 7-7-7'],
  // disciplines
  run: ['M4 16v-2.38C4 11.5 2.97 10.5 3 8c.03-2.72 1.49-6 4.5-6C9.37 2 10 3.8 10 5.5c0 3.11-2 5.66-2 8.68V16a2 2 0 1 1-4 0Z', 'M20 20v-2.38c0-2.12 1.03-3.12 1-5.62-.03-2.72-1.49-6-4.5-6C14.63 6 14 7.8 14 9.5c0 3.11 2 5.66 2 8.68V20a2 2 0 1 0 4 0Z', 'M16 17h4', 'M4 13h4'],
  bike: ['circle:18.5,17.5,3.5', 'circle:5.5,17.5,3.5', 'circle:15,5,1', 'M12 17.5V14l-3-3 4-3 2 3h2'],
  swim: ['M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1', 'M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1', 'M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1'],
  strength: ['m6.5 6.5 11 11', 'm21 21-1-1', 'm3 3 1 1', 'm18 22 4-4', 'm2 6 4-4', 'm3 10 7-7', 'm14 21 7-7'],
  brick: ['M5.7 18C9 18 9 12 12 12s3-6 6.3-6', 'circle:4,18,1.6', 'circle:20,6,1.6'],
  other: ['m8 3 4 8 5-5 5 15H2L8 3z'],
  hike: ['m8 3 4 8 5-5 5 15H2L8 3z', 'M4.14 15.08c2.62-1.57 5.24-1.43 7.86.42 2.74 1.94 5.49 2 8.23.19'],
  walk: ['circle:12,5,1', 'm9 20 3-6 3 6', 'm6 8 6 2 6-2', 'M12 10v4'],
  kayak: ['M2 14c5 3 15 3 20 0', 'm5 6 14 7', 'M3 4l3 3', 'M18 17l3 3'],
  climb: ['M7 4h7a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V8', 'm5 8 2-4', 'M9 12h6'],
  ski: ['m3 20 18-6', 'm9 10 6-4', 'circle:16,3.5,1.5', 'm12 11-3 6'],
  row: ['M20 4 9 15', 'm9 15-5 5', 'M4 15h5v5', 'M16 4h4v4'],
  yoga: ['M12 5a3 3 0 1 1 3 3m-3-3a3 3 0 1 0-3 3m3-3v1', 'M9 8a3 3 0 1 0 3 3m-3-3h1m5 0a3 3 0 1 1-3 3m3-3h-1m-2 3v-1', 'circle:12,8,2', 'M12 10v12', 'M12 22c4.2 0 7-1.667 7-5-4.2 0-7 1.667-7 5Z', 'M12 22c-4.2 0-7-1.667-7-5 4.2 0 7 1.667 7 5Z'],
  racket: ['circle:9.5,9.5,6.5', 'm14.2 14.2 7 7', 'M6 7l7 5'],
  ball: ['circle:12,12,10', 'M2 12h20', 'M12 2a15 15 0 0 1 0 20', 'M12 2a15 15 0 0 0 0 20'],
};

export function Icon({ name, size = 24, style, strokeWidth = 2 }: { name: keyof typeof P | string; size?: number; style?: CSSProperties; strokeWidth?: number }) {
  const parts = P[name] || [];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, ...style }}>
      {parts.map((d, i) => {
        if (d.startsWith('circle:')) {
          const [cx, cy, r] = d.slice(7).split(',').map(Number);
          return <circle key={i} cx={cx} cy={cy} r={r} />;
        }
        if (d.startsWith('rect:')) {
          const [x, y, w, h, rx] = d.slice(5).split(',').map(Number);
          return <rect key={i} x={x} y={y} width={w} height={h} rx={rx} />;
        }
        return <path key={i} d={d} />;
      })}
    </svg>
  );
}

/** Coche pleine. */
export function CheckFilled({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="currentColor" />
      <path d="m8 12.5 2.8 2.8L16.5 9.5" fill="none" stroke="var(--text-reverse)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Logotype Quadra : le pictogramme de l'icône (trait plein = mesuré, trait tireté = estimé) + « Quadra » (le nom vient des quatre disciplines). */
export function Logo({ size = 18 }: { size?: number }) {
  return (
    <span className="logo" style={{ fontSize: size, lineHeight: 1 }}>
      <LogoMark size={size * 1.45} />
      <span style={{ color: 'var(--text)' }}>Quadra</span>
    </span>
  );
}

/** Pictogramme de l'icône : un anneau en quatre arcs, aux couleurs des quatre sports (natation, vélo, course, renforcement), sur le fond papier. */
export function LogoMark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 108 108" aria-hidden="true" style={{ flexShrink: 0, borderRadius: size * 0.24 }}>
      <rect width="108" height="108" rx="0" style={{ fill: 'var(--bg-brand-minimal)' }} />
      <path d="M61.8 28.4A26.8 26.8 0 0 1 79.6 46.2" fill="none" strokeWidth="13.4" strokeLinecap="round" style={{ stroke: '#1E9DB8' }} />
      <path d="M79.6 61.8A26.8 26.8 0 0 1 61.8 79.6" fill="none" strokeWidth="13.4" strokeLinecap="round" style={{ stroke: '#F0A61E' }} />
      <path d="M46.2 79.6A26.8 26.8 0 0 1 28.4 61.8" fill="none" strokeWidth="13.4" strokeLinecap="round" style={{ stroke: '#E2552E' }} />
      <path d="M28.4 46.2A26.8 26.8 0 0 1 46.2 28.4" fill="none" strokeWidth="13.4" strokeLinecap="round" style={{ stroke: '#6A5BD6' }} />
    </svg>
  );
}
