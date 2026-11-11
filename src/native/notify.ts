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
import { resolveBank } from '../domain/foods';
import { intakeText, leadText, nutritionForSession, type NutriEvent } from '../domain/nutrition';
import { navigate } from '../ui/router';
import { getPrefs, setPrefs } from '../data/store';
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
  // alimentation : « avant » (repas, caféine) le matin à l'heure par défaut ou à l'heure exacte donnée avec la cloche ; « après » dès que la séance réalisée est reçue
  const nmode = prefs.nutriMode ?? 'off';
  if (nmode !== 'off') {
    const bank = resolveBank(data);
    const txt = (e: NutriEvent) => (e.items.length ? e.items.map(intakeText).join(' + ') : e.text ?? e.title);
    const afterDone: Record<string, number> = {};
    for (const p of liveRecords(data.planned)) {
      if (p.blocks.length === 0 || suspended(data, p.plannedDate)) continue;
      const nopt = data.nutri[p.id] && !data.nutri[p.id].deleted ? data.nutri[p.id] : undefined;
      const bells = nopt?.bells ?? {};
      const linked = d.links.byPlanned.get(p.id) ?? [];
      const near = (p.plannedDate >= t && p.plannedDate <= addDays(t, LOOKAHEAD - 1) && linked.length === 0) || linked.length > 0;
      if (!near) continue;
      const n = nutritionForSession(data, d.refsAt(p.plannedDate), p, bank, t, (id) => d.links.byPlanned.has(id));
      if (!n.plan) continue;
      const disc = DISCIPLINE_LABEL[p.discipline];
      // avant : repas (par défaut en mode « toutes ») et toute cloche posée
      if (linked.length === 0) {
        for (const e of n.plan.events.filter((x) => x.phase === 'before' && x.bell)) {
          const bell = bells[e.bell as string];
          if (nmode === 'chosen' && !bell) continue;
          if (nmode === 'all' && !bell && e.bell !== 'meal') continue;
          const [y, m, dd] = p.plannedDate.split('-').map(Number);
          const when = bell && bell.startMin !== null && bell.startMin !== undefined ? new Date(y, m - 1, dd, 0, bell.startMin + e.atMin, 0, 0) : new Date(y, m - 1, dd, prefs.nutriHour ?? 7, 0, 0, 0);
          if (when <= now) continue;
          list.push({ id: id++, title: $t("Alimentation : avant la séance"), body: $t("Pense à prendre {0}, {1} avant la séance de {2}.", { 0: txt(e), 1: leadText(-e.atMin), 2: disc.toLowerCase() }), schedule: { at: when, allowWhileIdle: true }, extra: { route: '/calendrier/prevue/' + p.id } });
        }
      }
      // après : séance réalisée reçue depuis moins de 3 h
      if (linked.length > 0) {
        const afterEvents = n.plan.events.filter((x) => x.phase === 'after' && x.items.length);
        const first = afterEvents.find((x) => x.bell === 'after');
        const bell = bells['after'];
        if (!first || (nmode === 'chosen' && !bell)) continue;
        const act = linked.map((a) => data.actual[a]).filter(Boolean).sort((a, b) => (a.endAt < b.endAt ? 1 : -1))[0];
        if (!act) continue;
        const k = p.id + ':' + act.id;
        const end = Date.parse(act.endAt);
        if (!isFinite(end) || now.getTime() - end > 3 * 3600000) continue;
        const prev = prefs.nutriAfter?.[k];
        const at2 = prev ?? Math.max(end + 5 * 60000, now.getTime() + 10000);
        afterDone[k] = at2;
        if (at2 + 60000 < now.getTime()) continue;
        const items = afterEvents.slice(0, 2).map(txt).join(' + ');
        list.push({ id: id++, title: $t("Alimentation : récupération"), body: $t("Séance de {0} terminée : {1}, dans les 2 h.", { 0: disc.toLowerCase(), 1: items }), schedule: { at: new Date(at2), allowWhileIdle: true }, extra: { route: '/calendrier/prevue/' + p.id } });
      }
    }
    const prevAfter = prefs.nutriAfter ?? {};
    const keep: Record<string, number> = { ...afterDone };
    for (const [k, v] of Object.entries(prevAfter)) if (v > now.getTime() - 86400000 && !(k in keep)) keep[k] = v;
    if (JSON.stringify(keep) !== JSON.stringify(prevAfter)) setPrefs({ nutriAfter: keep });
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
