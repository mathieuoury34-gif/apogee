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
import { navigate } from '../ui/router';
import { getPrefs } from '../data/store';
import { native } from './bridge';

const LOOKAHEAD = 3, DUE_WARNING = 3, OVERDUE_AFTER = 7, OVERDUE_REPEAT = 7;

function suspended(data: AppData, day: string): boolean {
  return liveRecords(data.interruptions).some((i) => i.suspendsReminders && i.startDate <= day && i.endDate >= day);
}

/** Heure locale du rappel du point de la semaine le dimanche `sunday`. */
export function weeklySlot(sunday: string, hour: number | undefined): Date {
  const [y, m, dd] = sunday.split('-').map(Number);
  return new Date(y, m - 1, dd, hour ?? 18, 0, 0, 0);
}
/** Dernier rappel du point de la semaine déjà sonné (AAAA-MM-JJTHH, heure locale). */
export function latestWeeklySlot(now: Date, hour: number | undefined): string {
  let sunday = addDays(mondayOf(today(now)), 6);
  if (weeklySlot(sunday, hour) > now) sunday = addDays(sunday, -7);
  return sunday + 'T' + String(hour ?? 18).padStart(2, '0');
}

let last = '';
let listening = false;
export async function scheduleReminders(data: AppData, d: Derived): Promise<void> {
  const ln = native.notifications();
  if (!ln) return;
  const hour = getPrefs().reminderHour;
  const at = (day: string) => { const [y, m, dd] = day.split('-').map(Number); return new Date(y, m - 1, dd, hour, 0, 0, 0); };
  const now = new Date();
  const t = today(now);
  const list: { id: number; title: string; body: string; schedule: { at: Date; allowWhileIdle: boolean }; extra?: { route: string } }[] = [];
  let id = 1;
  const sessions = getPrefs().sessionReminder !== false;
  for (const p of sessions ? liveRecords(data.planned) : []) {
    if (p.plannedDate < t || p.plannedDate > addDays(t, LOOKAHEAD - 1) || d.links.byPlanned.has(p.id) || suspended(data, p.plannedDate)) continue;
    const when = at(p.plannedDate);
    if (when <= now) continue;
    const disc = DISCIPLINE_LABEL[p.discipline];
    list.push({ id: id++, title: $t("Séance du jour"), body: p.title ? `${disc} — ${p.title}` : $t("{0} au programme aujourd’hui.", { 0: disc }), schedule: { at: when, allowWhileIdle: true }, extra: { route: '/calendrier/prevue/' + p.id } });
  }
  const valid = lastPlanValidity(data);
  if (sessions) {
  const overdue = (day: string) => !suspended(data, day) && at(day) > now && list.push({ id: id++, title: $t("Plan à renouveler"), body: $t("Ton plan n’a pas été renouvelé depuis un moment. Un nouvel échange avec ton coach, quand tu es prêt."), schedule: { at: at(day), allowWhileIdle: true }, extra: { route: '/coach' } });
  if (!valid) overdue(at(t) > now ? t : addDays(t, 1));
  else {
    const warn = addDays(valid, -DUE_WARNING);
    if (warn >= t && !suspended(data, warn) && at(warn) > now) list.push({ id: id++, title: $t("Plan bientôt à échéance"), body: $t("Ton plan arrive à échéance dans {0} jours — pense à échanger avec ton coach.", { 0: DUE_WARNING }), schedule: { at: at(warn), allowWhileIdle: true }, extra: { route: '/coach' } });
    let o = addDays(valid, OVERDUE_AFTER);
    while (o < t) o = addDays(o, OVERDUE_REPEAT);
    overdue(o);
  }
  }
  // point de la semaine : chaque dimanche, à l'heure choisie (18 h par défaut). Il ouvre directement le formulaire (relevé de la montre
  // et corrections de pas, étages, calories, sommeil), rempli ou non pour la semaine.
  const prefs = getPrefs();
  if (prefs.weeklyReminder !== false) {
    for (let k = 0; k < 3; k++) {
      const sunday = addDays(mondayOf(addDays(t, 7 * k)), 6);
      const when = weeklySlot(sunday, prefs.weeklyReminderHour);
      if (when <= now || suspended(data, sunday)) continue;
      list.push({ id: id++, title: $t("Point de la semaine"), body: $t("Deux minutes pour recopier ta montre (VO₂max, ressenti, prédictions) et corriger pas, étages, calories et sommeil d’après Garmin Connect."), schedule: { at: when, allowWhileIdle: true }, extra: { route: '/accueil?point=1' } });
    }
  }
  // sommeil : chaque matin, une invitation à valider (ou corriger) les heures de coucher et de lever
  if (prefs.sleepReminder !== false) {
    const sh = prefs.sleepReminderHour ?? 8;
    for (let k = 0; k < 3; k++) {
      const day = addDays(t, k);
      const [y, m, dd] = day.split('-').map(Number);
      const when = new Date(y, m - 1, dd, sh, 0, 0, 0);
      if (when <= now || suspended(data, day)) continue;
      list.push({ id: id++, title: $t("Ta nuit"), body: $t("Valide tes heures de coucher et de lever, ou corrige-les si la montre s’est trompée."), schedule: { at: when, allowWhileIdle: true }, extra: { route: '/progression/sante?ancre=sommeil' } });
    }
  }
  const key = JSON.stringify(list.map((x) => [x.title, x.body, x.schedule.at.getTime()]));
  if (key === last) return;
  last = key;
  try {
    const perm = await ln.checkPermissions();
    if (perm.display !== 'granted') { const r = await ln.requestPermissions(); if (r.display !== 'granted') return; }
    if (!listening) {
      listening = true;
      ln.addListener?.('localNotificationActionPerformed', (e: { notification?: { extra?: { route?: string } } }) => { const r = e?.notification?.extra?.route; if (r) navigate(r); });
    }
    const pending = await ln.getPending();
    if (pending.notifications?.length) await ln.cancel({ notifications: pending.notifications.map((n: { id: number }) => ({ id: n.id })) });
    if (list.length) await ln.schedule({ notifications: list });
  } catch (e) {
    console.warn('[notify]', e);
  }
}
