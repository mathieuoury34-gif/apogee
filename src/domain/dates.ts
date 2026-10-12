// Jours civils. Deux questions distinctes (SPECS-TECH §2) :
//  - `localDay(instant, décalage)` : quel jour était-ce QUAND la montre a mesuré ? Ne bouge jamais,
//    même après un changement de fuseau (installation à Munich).
//  - `today()` : quel jour sommes-nous pour l'athlète, maintenant ? Suit le fuseau de l'appareil.

export function localDay(isoInstant: string, offsetMinutes: number | null | undefined): string {
  const shifted = new Date(new Date(isoInstant).getTime() + (offsetMinutes ?? 0) * 60_000);
  return shifted.toISOString().slice(0, 10);
}

export function today(now: Date = new Date()): string {
  return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
}

export function addDays(day: string, delta: number): string {
  const d = new Date(day + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86_400_000);
}

export function mondayOf(day: string): string {
  const wd = new Date(day + 'T00:00:00Z').getUTCDay();
  return addDays(day, -((wd + 6) % 7));
}

/** 0 = lundi … 6 = dimanche */
export function weekdayIndex(day: string): number {
  return (new Date(day + 'T00:00:00Z').getUTCDay() + 6) % 7;
}

export function ageAt(birthDate: string, on: Date = new Date()): number {
  const b = new Date(birthDate + 'T00:00:00Z');
  let age = on.getUTCFullYear() - b.getUTCFullYear();
  const m = on.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && on.getUTCDate() < b.getUTCDate())) age -= 1;
  return age;
}

export function dayRange(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

export function monthOf(day: string): string {
  return day.slice(0, 7);
}

/** Lundis couvrant un mois (la première semaine partielle comprise — correctif du 15/09). */
export function weeksOfMonth(month: string): string[] {
  const first = mondayOf(month + '-01');
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const out: string[] = [];
  for (let w = first; w <= last; w = addDays(w, 7)) out.push(w);
  return out;
}
