// Notifications locales (APK) : les quatre comportements de la version Android (SPECS-TECH §8), recalculés en
// entier à chaque changement : rappel de séance (3 jours glissants), plan bientôt à échéance, plan échu
// (relance hebdomadaire), suspension pendant une interruption. Ton neutre, jamais culpabilisant.
import { $t } from '../i18n';
import { addDays, mondayOf, today } from '../domain/dates';
import { lastPlanValidity } from '../domain/coach';
import { liveRecords } from '../domain/load';
import type { Derived } from '../domain/engine';
import type { AppData } from '../domain/types';
import { DISCIPLINE_LABEL } from '../ui/format';
import { getPrefs } from '../data/store';
import { native } from './bridge';

const LOOKAHEAD = 3, DUE_WARNING = 3, OVERDUE_AFTER = 7, OVERDUE_REPEAT = 7;

function suspended(data: AppData, day: string): boolean {
  return liveRecords(data.interruptions).some((i) => i.suspendsReminders && i.startDate <= day && i.endDate >= day);
}

let last = '';
export async function scheduleReminders(data: AppData, d: Derived): Promise<void> {
  const ln = native.notifications();
  if (!ln) return;
  const hour = getPrefs().reminderHour;
  const at = (day: string) => { const [y, m, dd] = day.split('-').map(Number); return new Date(y, m - 1, dd, hour, 0, 0, 0); };
  const now = new Date();
  const t = today(now);
  const list: { id: number; title: string; body: string; schedule: { at: Date; allowWhileIdle: boolean } }[] = [];
  let id = 1;
  for (const p of liveRecords(data.planned)) {
    if (p.plannedDate < t || p.plannedDate > addDays(t, LOOKAHEAD - 1) || d.links.byPlanned.has(p.id) || suspended(data, p.plannedDate)) continue;
    const when = at(p.plannedDate);
    if (when <= now) continue;
    const disc = DISCIPLINE_LABEL[p.discipline];
    list.push({ id: id++, title: $t("Séance du jour"), body: p.title ? `${disc} — ${p.title}` : $t("{0} au programme aujourd’hui.", { 0: disc }), schedule: { at: when, allowWhileIdle: true } });
  }
  const valid = lastPlanValidity(data);
  const overdue = (day: string) => !suspended(data, day) && at(day) > now && list.push({ id: id++, title: $t("Plan à renouveler"), body: $t("Ton plan n’a pas été renouvelé depuis un moment. Un nouvel échange avec ton coach, quand tu es prêt."), schedule: { at: at(day), allowWhileIdle: true } });
  if (!valid) overdue(at(t) > now ? t : addDays(t, 1));
  else {
    const warn = addDays(valid, -DUE_WARNING);
    if (warn >= t && !suspended(data, warn) && at(warn) > now) list.push({ id: id++, title: $t("Plan bientôt à échéance"), body: $t("Ton plan arrive à échéance dans {0} jours — pense à échanger avec ton coach.", { 0: DUE_WARNING }), schedule: { at: at(warn), allowWhileIdle: true } });
    let o = addDays(valid, OVERDUE_AFTER);
    while (o < t) o = addDays(o, OVERDUE_REPEAT);
    overdue(o);
  }
  // point hebdomadaire : dimanche à 18 h, seulement s'il n'est pas déjà rempli pour la semaine
  for (let k = 0; k < 2; k++) {
    const sunday = addDays(mondayOf(addDays(t, 7 * k)), 6);
    const [y, m, dd] = sunday.split('-').map(Number);
    const when = new Date(y, m - 1, dd, 18, 0, 0, 0);
    const c = data.checkins[mondayOf(sunday)];
    if (when <= now || (c && !c.deleted) || suspended(data, sunday)) continue;
    list.push({ id: id++, title: $t("Point de la semaine"), body: $t("Deux minutes pour noter VO₂max, ressenti et prédictions : tes courbes se complètent."), schedule: { at: when, allowWhileIdle: true } });
  }
  const key = JSON.stringify(list.map((x) => [x.title, x.body, x.schedule.at.getTime()]));
  if (key === last) return;
  last = key;
  try {
    const perm = await ln.checkPermissions();
    if (perm.display !== 'granted') { const r = await ln.requestPermissions(); if (r.display !== 'granted') return; }
    const pending = await ln.getPending();
    if (pending.notifications?.length) await ln.cancel({ notifications: pending.notifications.map((n: { id: number }) => ({ id: n.id })) });
    if (list.length) await ln.schedule({ notifications: list });
  } catch (e) {
    console.warn('[notify]', e);
  }
}
