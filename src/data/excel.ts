// Classeur Excel d’Apogée (même générateur que PEAnalyze, aux couleurs d’Apogée).
// Les données (séances, charge, zones…) sont des valeurs ; les synthèses hebdomadaires et mensuelles sont
// en FORMULES (SOMME.SI.ENS sur l'onglet Séances) : le fichier reste vivant si tu y ajoutes des lignes.
import { estimateDistance, estimateDuration } from '../domain/blocks';
import { addDays, mondayOf } from '../domain/dates';
import { cycleInfos } from '../domain/cycles';
import type { Derived } from '../domain/engine';
import { liveRecords, sessionDay, zoneHistory, METHOD_LABEL } from '../domain/load';
import type { AppData } from '../domain/types';
import { CORE } from '../domain/stats';
import { FORM_STEP_LABEL, formStep } from '../domain/form';
import { blocksSummary } from '../ui/format';
import { checkinsSorted } from '../domain/checkin';
import { foodName, foodUnit, fracText, resolveBank, sodiumOf, stepOf } from '../domain/foods';
import { nutritionForSession } from '../domain/nutrition';
import { brickLegs, planTimeline } from '../domain/planTimeline';
import type { Discipline } from '../domain/types';

// Le classeur reste en français quelle que soit la langue de l'app : ses formules filtrent sur ces libellés.
const DISCIPLINE_LABEL: Record<Discipline, string> = { RUN: 'Course', BIKE: 'Vélo', SWIM: 'Natation', STRENGTH: 'Renforcement', BRICK: 'Enchaînement', OTHER: 'Autre' };
import { Workbook, colName as L, excelDate, type Sheet, type Style, type Value } from './xlsx';

const INK = '16181B', MUTED = '656970', DIV = 'E9E6DF', SUB = 'C3BEB2';
const DISC: Record<string, string> = { RUN: 'B4432A', BIKE: '9A6B12', SWIM: '1D6E80', STRENGTH: '4B4499', BRICK: '7C3663', OTHER: '6B6F76' };
const FIT = '3E7A86', FAT = '4C5C8E', FRESH = '7BBFA8';
const DATE = 'dd/mm/yyyy', HMM = '[h]:mm', KM = '0.0', INT = '0', DEC1 = '0.0', DEC2 = '0.00';
const f = (s: string): Value => ({ f: s });

function cell(o: { fmt?: string; b?: boolean; color?: string; h?: 'left' | 'center' | 'right'; bg?: string; sz?: number } = {}): Style {
  return { font: { sz: o.sz ?? 10, b: o.b, color: o.color ?? INK }, numFmt: o.fmt, fill: o.bg, align: o.h ? { h: o.h, v: 'center' } : undefined, border: { bottom: ['thin', DIV] } };
}
function page(wb: Workbook, name: string, title: string, subtitle: string, ncol: number): Sheet {
  const ws = wb.sheet(name);
  ws.tab = INK;
  for (let c = 1; c <= ncol; c++) { ws.set(1, c, null, { fill: INK }); ws.set(2, c, null, { fill: INK }); }
  ws.height(1, 30).height(2, 20).height(3, 10);
  ws.set(1, 1, title, { font: { sz: 16, b: true, color: 'FBFAF7' }, fill: INK, align: { v: 'center', indent: 1 } });
  ws.set(2, 1, subtitle, { font: { sz: 9, color: SUB }, fill: INK, align: { v: 'top', indent: 1 } });
  return ws;
}
function header(ws: Sheet, r: number, labels: string[]) {
  labels.forEach((l, i) => ws.set(r, i + 1, l, { font: { sz: 9, b: true, color: 'FBFAF7' }, fill: INK, align: { h: 'center', v: 'center', wrap: true } }));
  ws.height(r, 30);
}
const dayValue = (iso: string) => excelDate(iso);
const secToDay = (s: number) => s / 86400;
const FOOD_CATEGORY_LABEL: Record<string, string> = { drink: 'Boisson', gel: 'Gel', paste: 'Pâte de fruits', candy: 'Bonbons', bar: 'Barre', fruit: 'Fruit', sugar: 'Sucre, miel', salty: 'Salé', salt: 'Sel', before: 'Avant la séance', after: 'Après la séance' };
const INTENSITY_LABEL: Record<string, string> = { easy: 'Facile', moderate: 'Modérée', quality: 'Intense' };

export function buildWorkbook(data: AppData, d: Derived): Workbook {
  const wb = new Workbook();
  const today = d.today;
  const actual = liveRecords(data.actual).sort((a, b) => (a.startAt < b.startAt ? -1 : 1));
  // enchaînements réalisés : paires confirmées + séances rattachées à un BRICK prévu (un groupe = un enchaînement)
  const groupsOf = new Map<string, string[]>();
  const addGroup = (ids: string[]) => { const live = ids.filter((id) => data.actual[id] && !data.actual[id].deleted); if (live.length > 1) for (const id of live) groupsOf.set(id, live); };
  for (const b of liveRecords(data.bricks)) if (b.status === 'confirmed') addGroup([b.firstId, b.secondId]);
  for (const [pid, aids] of d.links.byPlanned) if (data.planned[pid]?.discipline === 'BRICK') addGroup(aids);
  const brickCount = new Set([...groupsOf.values()].map((g) => [...g].sort().join('|'))).size;

  // ---------------------------------------------------------------- Tableau de bord
  const db = page(wb, 'Tableau de bord', 'Apogée — tableau de bord', `Export du ${today.split('-').reverse().join('/')} · valeurs du jour, puis synthèses calculées par formules`, 8);
  const race = data.race.main && !data.race.main.deleted ? data.race.main : null;
  const rows: [string, Value, string?][] = [
    ['Course visée', race ? race.name + ' — ' + race.raceDate.split('-').reverse().join('/') : '—'],
    ['Jours avant la course', race ? f(`DATE(${race.raceDate.slice(0, 4)},${+race.raceDate.slice(5, 7)},${+race.raceDate.slice(8, 10)})-TODAY()`) : '—', INT],
    ['Forme du jour (/100)', d.form ? Math.round(d.form.score) : '—', INT],
    ['Forme de fond', d.constat.fitness ?? '—', DEC1],
    ['Fatigue', d.constat.fatigue ?? '—', DEC1],
    ['Fraîcheur', d.constat.freshness ?? '—', DEC1],
    ['Ratio aigu / chronique', d.constat.acuteChronicRatio ?? '—', DEC2],
    ['Enchaînements réalisés', brickCount, INT],
    ['Séances (hors « Autre »)', f(`COUNTIFS('Séances'!B:B,"<>Autre",'Séances'!A:A,">0")`), INT],
    ['Volume total', f(`SUMIFS('Séances'!E:E,'Séances'!B:B,"<>Autre")`), HMM],
  ];
  rows.forEach(([label, v, fmt], i) => {
    db.set(4 + i, 1, label, cell({ color: MUTED }));
    db.set(4 + i, 3, v, cell({ fmt, b: true, h: 'right' }));
  });
  db.width('A', 30).width('B', 4).width('C', 22);
  // volume des 12 dernières semaines par discipline (formules)
  const wr = 15;
  header(db, wr, ['Semaine du', ...CORE.map((c) => DISCIPLINE_LABEL[c]), 'Total', 'Charge']);
  const firstWeek = addDays(mondayOf(today), -7 * 11);
  for (let i = 0; i < 12; i++) {
    const r = wr + 1 + i, w = addDays(firstWeek, 7 * i);
    db.set(r, 1, new Date(w + 'T12:00:00Z'), cell({ fmt: DATE }));
    CORE.forEach((c, k) => db.set(r, 2 + k, f(`SUMIFS('Séances'!$E:$E,'Séances'!$B:$B,"${DISCIPLINE_LABEL[c]}",'Séances'!$A:$A,">="&$A${r},'Séances'!$A:$A,"<"&($A${r}+7))`), cell({ fmt: HMM, h: 'right' })));
    db.set(r, 6, f(`SUM(B${r}:E${r})`), cell({ fmt: HMM, h: 'right', b: true }));
    db.set(r, 7, f(`SUMIFS('Séances'!$J:$J,'Séances'!$A:$A,">="&$A${r},'Séances'!$A:$A,"<"&($A${r}+7))`), cell({ fmt: INT, h: 'right' }));
  }
  ['B', 'C', 'D', 'E', 'F', 'G'].forEach((c) => db.width(c, 13));
  db.chart({ kind: 'col', title: 'Volume hebdomadaire (heures)', at: [4, 10], size: [17, 8], catText: false, catFmt: 'dd/mm', valFmt: '[h]', series: CORE.map((c, k) => ({ nameRef: `'Tableau de bord'!$${L(2 + k)}$${wr}`, cat: `'Tableau de bord'!$A$${wr + 1}:$A$${wr + 12}`, val: `'Tableau de bord'!$${L(2 + k)}$${wr + 1}:$${L(2 + k)}$${wr + 12}`, color: DISC[c] })) });

  // ---------------------------------------------------------------- Séances réalisées
  const ss = page(wb, 'Séances', 'Séances réalisées', 'Une ligne par séance · durée en h:mm · charge selon sa méthode (mesurée ou estimée) · une jambe d’enchaînement compte dans son sport', 16);
  const H = ['Date', 'Discipline', 'Heure', 'Source', 'Durée', 'Distance (km)', 'Allure / vitesse', 'FC moy.', 'FC max', 'Charge', 'Méthode de charge', 'RPE', 'Séance prévue rattachée', 'Dérive cardiaque', 'Commentaire', 'Enchaînement'];
  header(ss, 4, H);
  actual.forEach((s, i) => {
    const r = 5 + i;
    const day = sessionDay(s);
    const l = d.loads.get(s.id);
    const link = d.links.byActual.get(s.id);
    const p = link?.plannedId ? data.planned[link.plannedId] : undefined;
    const dist = s.distanceM ? s.distanceM / 1000 : null;
    let pace: Value = '';
    if (s.distanceM && s.durationSec) {
      if (s.discipline === 'BIKE') pace = f(`IF(F${r}>0,F${r}/(E${r}*24),"")`);
      else if (s.discipline === 'SWIM') pace = f(`IF(F${r}>0,E${r}/(F${r}*10),"")`);
      else pace = f(`IF(F${r}>0,E${r}/F${r},"")`);
    }
    ss.set(r, 1, dayValue(day), cell({ fmt: DATE }));
    ss.set(r, 2, DISCIPLINE_LABEL[s.discipline], { ...cell({ b: true, color: DISC[s.discipline] }) });
    ss.set(r, 3, s.source === 'manual' ? '' : new Date(s.startAt).toISOString().slice(11, 16), cell({ h: 'center' }));
    ss.set(r, 4, s.source === 'manual' ? 'Saisie' : 'Montre', cell({ color: MUTED }));
    ss.set(r, 5, secToDay(s.durationSec), cell({ fmt: HMM, h: 'right' }));
    ss.set(r, 6, dist, cell({ fmt: KM, h: 'right' }));
    ss.set(r, 7, pace, cell({ fmt: s.discipline === 'BIKE' ? '0.0" km/h"' : s.discipline === 'SWIM' ? 'm:ss"/100 m"' : 'm:ss"/km"', h: 'right' }));
    ss.set(r, 8, s.avgHrBpm ? Math.round(s.avgHrBpm) : null, cell({ fmt: INT, h: 'right' }));
    ss.set(r, 9, s.maxHrBpm, cell({ fmt: INT, h: 'right' }));
    ss.set(r, 10, l?.load ?? null, cell({ fmt: INT, h: 'right' }));
    ss.set(r, 11, l ? METHOD_LABEL[l.method] : '', cell({ color: MUTED }));
    ss.set(r, 12, s.rpe, cell({ fmt: INT, h: 'center' }));
    ss.set(r, 13, p ? [p.title ?? DISCIPLINE_LABEL[p.discipline], p.plannedDate.split('-').reverse().join('/')].join(' · ') : link?.type === 'none' ? 'non prévue' : '', cell({ color: MUTED }));
    ss.set(r, 14, l?.drift ?? null, cell({ fmt: '+0.0%;-0.0%', h: 'right' }));
    ss.set(r, 15, s.comment ?? '', cell());
    const grp = groupsOf.get(s.id);
    ss.set(r, 16, grp ? grp.map((id) => DISCIPLINE_LABEL[data.actual[id].discipline]).join(' + ') : '', cell({ color: MUTED }));
  });
  [11, 12, 7, 8, 9, 11, 14, 8, 8, 8, 26, 6, 30, 10, 40, 22].forEach((w, i) => ss.width(i + 1, w));
  ss.freeze = 'A5';
  ss.autoFilter = `A4:P${4 + Math.max(1, actual.length)}`;

  // ---------------------------------------------------------------- Séances prévues
  const pl = page(wb, 'Plan', 'Séances prévues', 'Durée et distance estimées à partir des blocs (transitions comprises) · statut calculé par l’app', 9);
  header(pl, 4, ['Date', 'Discipline', 'Titre', 'Durée estimée', 'Distance estimée (km)', 'Statut', 'Origine', 'Blocs', 'Jambes (enchaînement)']);
  liveRecords(data.planned).sort((a, b) => (a.plannedDate < b.plannedDate ? -1 : 1)).forEach((p, i) => {
    const r = 5 + i;
    const dur = estimateDuration(p.blocks, p.discipline, d.refsAt(p.plannedDate)), dist = estimateDistance(p.blocks, p.discipline, d.refsAt(p.plannedDate));
    const done = d.links.byPlanned.has(p.id);
    pl.set(r, 1, dayValue(p.plannedDate), cell({ fmt: DATE }));
    pl.set(r, 2, DISCIPLINE_LABEL[p.discipline], cell({ b: true, color: DISC[p.discipline] }));
    pl.set(r, 3, p.title ?? '', cell());
    pl.set(r, 4, dur.certainty === 'unknown' ? null : secToDay(dur.value), cell({ fmt: HMM, h: 'right' }));
    pl.set(r, 5, dist.certainty === 'unknown' ? null : dist.value / 1000, cell({ fmt: KM, h: 'right' }));
    pl.set(r, 6, done ? 'Réalisée' : p.plannedDate < today ? 'Non réalisée' : 'À venir', cell({ color: done ? '2E7560' : p.plannedDate < today ? '8E2B20' : MUTED }));
    pl.set(r, 7, p.origin === 'coach' ? 'Coach' : 'Saisie', cell({ color: MUTED }));
    pl.set(r, 8, blocksSummary(p.blocks, p.discipline), cell());
    pl.set(r, 9, p.discipline === 'BRICK' ? brickLegs(planTimeline(p, d.refsAt(p.plannedDate))).map((l) => `${DISCIPLINE_LABEL[l.disc]} ${Math.round(l.minutes)} min`).join(' › ') : '', cell());
  });
  [11, 13, 28, 12, 12, 13, 9, 80, 44].forEach((w, i) => pl.width(i + 1, w));
  pl.freeze = 'A5';

  // ---------------------------------------------------------------- Charge quotidienne
  const ch = page(wb, 'Charge', 'Charge quotidienne et forme', 'Modèle de Banister (forme de fond 42 j, fatigue 7 j) · fraîcheur = fond − fatigue', 9);
  header(ch, 4, ['Jour', 'Charge', 'Forme de fond', 'Fatigue', 'Fraîcheur', 'Forme du jour', 'Palier', 'Sommeil (h)', 'FC repos']);
  d.series.days.forEach((x, i) => {
    const r = 5 + i;
    const form = d.formByDay.get(x.day);
    ch.set(r, 1, dayValue(x.day), cell({ fmt: DATE }));
    ch.set(r, 2, x.load, cell({ fmt: INT, h: 'right' }));
    ch.set(r, 3, x.fitness, cell({ fmt: DEC1, h: 'right' }));
    ch.set(r, 4, x.fatigue, cell({ fmt: DEC1, h: 'right' }));
    ch.set(r, 5, f(`C${r}-D${r}`), cell({ fmt: '+0.0;-0.0;0.0', h: 'right', b: true }));
    ch.set(r, 6, form ? Math.round(form.score) : null, cell({ fmt: INT, h: 'right' }));
    ch.set(r, 7, form ? FORM_STEP_LABEL[formStep(form.score)] : '', cell({ color: MUTED }));
    const night = data.sleep[x.day];
    ch.set(r, 8, night && !night.deleted ? night.durationSec / 3600 : null, cell({ fmt: DEC1, h: 'right' }));
    const rh = data.resting[x.day];
    ch.set(r, 9, rh && !rh.deleted ? rh.bpm : null, cell({ fmt: INT, h: 'right' }));
  });
  [11, 9, 13, 10, 11, 12, 12, 11, 10].forEach((w, i) => ch.width(i + 1, w));
  ch.freeze = 'A5';
  const last = 4 + d.series.days.length;
  if (d.series.days.length > 1) {
    ch.chart({ kind: 'line', title: 'Forme de fond, fatigue, fraîcheur', at: [4, 11], size: [20, 9], catFmt: 'dd/mm', valFmt: '0', tickSkip: 14, series: [
      { name: 'Forme de fond', cat: `'Charge'!$A$5:$A$${last}`, val: `'Charge'!$C$5:$C$${last}`, color: FIT, line: { w: 28000 } },
      { name: 'Fatigue', cat: `'Charge'!$A$5:$A$${last}`, val: `'Charge'!$D$5:$D$${last}`, color: FAT, line: { w: 19000, dash: 'dash' } },
      { name: 'Fraîcheur', cat: `'Charge'!$A$5:$A$${last}`, val: `'Charge'!$E$5:$E$${last}`, color: FRESH, line: { w: 19000 } },
    ] });
  }

  // ---------------------------------------------------------------- Zones
  const zn = page(wb, 'Zones', 'Indicateurs de référence', 'Historique complet, jamais écrasé · VMA en km/h, CSS en allure aux 100 m', 5);
  header(zn, 4, ['Indicateur', 'Date', 'Valeur', 'Source', 'Notes']);
  let zr = 5;
  for (const k of ['vma', 'css', 'ftp', 'hr_max'] as const) {
    for (const z of zoneHistory(data, k).slice().reverse()) {
      const label = { vma: 'VMA', css: 'CSS', ftp: 'FTP', hr_max: 'FC max' }[k];
      const v = k === 'vma' ? z.value * 3.6 : k === 'css' ? 100 / z.value / 86400 : z.value;
      zn.set(zr, 1, label, cell({ b: true }));
      zn.set(zr, 2, dayValue(z.measuredAt.slice(0, 10)), cell({ fmt: DATE }));
      zn.set(zr, 3, v, cell({ fmt: k === 'vma' ? '0.0" km/h"' : k === 'css' ? 'm:ss"/100 m"' : k === 'ftp' ? '0" W"' : '0" bpm"', h: 'right' }));
      zn.set(zr, 4, { test: 'Test', estimation: 'Estimation', manual: 'Saisie' }[z.source], cell({ color: MUTED }));
      zn.set(zr, 5, z.notes ?? '', cell());
      zr++;
    }
  }
  [14, 12, 14, 12, 50].forEach((w, i) => zn.width(i + 1, w));

  // ---------------------------------------------------------------- Périodisation
  const ph = page(wb, 'Périodisation', 'Blocs de préparation', 'Une seule échelle de blocs datés, sans chevauchement', 8);
  header(ph, 4, ['Bloc', 'Phase', 'Début', 'Fin', 'Jours', 'Intention', 'Objectif', 'Cycles de charge']);
  liveRecords(data.phases).sort((a, b) => (a.startDate < b.startDate ? -1 : 1)).forEach((p, i) => {
    const r = 5 + i;
    ph.set(r, 1, p.label, cell({ b: true }));
    ph.set(r, 2, p.phase ?? '', cell({ color: MUTED }));
    ph.set(r, 3, dayValue(p.startDate), cell({ fmt: DATE }));
    ph.set(r, 4, dayValue(p.endDate), cell({ fmt: DATE }));
    ph.set(r, 5, f(`D${r}-C${r}+1`), cell({ fmt: INT, h: 'right' }));
    ph.set(r, 6, p.intent ?? '', cell());
    ph.set(r, 7, p.objective ?? '', cell());
    ph.set(r, 8, cycleInfos(p.cycles).map((c) => c.text + ' (' + c.cycle.startDate + ' → ' + c.cycle.endDate + ')').join(' ; '), cell());
  });
  [22, 16, 11, 11, 7, 40, 40, 60].forEach((w, i) => ph.width(i + 1, w));

  // ---------------------------------------------------------------- Course visée (plan de course)
  const cr = page(wb, 'Course', 'Course visée et plan de course', 'Objectifs par discipline et transitions : le total est la somme des parties (formule)', 4);
  if (race) {
    header(cr, 4, ['Élément', 'Distance (km)', 'Temps visé', 'Allure ou vitesse visée']);
    const legs: [string, number | null, number | null, 'swim' | 'bike' | 'run'][] = [['Natation', race.swimDistanceM, race.targetSwimSeconds, 'swim'], ['Vélo', race.bikeDistanceM, race.targetBikeSeconds, 'bike'], ['Course à pied', race.runDistanceM, race.targetRunSeconds, 'run']];
    legs.forEach(([label, m, sec, kind], i) => {
      const r = 5 + i;
      cr.set(r, 1, label, cell({ b: true }));
      cr.set(r, 2, m !== null ? m / 1000 : null, cell({ fmt: '0.00', h: 'right' }));
      cr.set(r, 3, sec !== null ? secToDay(sec) : null, cell({ fmt: HMM, h: 'right' }));
      cr.set(r, 4, m && sec ? (kind === 'bike' ? f(`B${r}/(C${r}*24)`) : kind === 'swim' ? f(`C${r}/(B${r}*10)`) : f(`C${r}/B${r}`)) : null, cell({ fmt: kind === 'bike' ? '0.0" km/h"' : kind === 'swim' ? 'm:ss"/100 m"' : 'm:ss"/km"', h: 'right' }));
    });
    cr.set(8, 1, 'Transitions (T1 + T2)', cell({ b: true }));
    cr.set(8, 3, race.targetTransitionSeconds !== null ? secToDay(race.targetTransitionSeconds) : null, cell({ fmt: HMM, h: 'right' }));
    cr.set(9, 1, 'Total visé (somme)', cell({ b: true }));
    cr.set(9, 3, f('SUM(C5:C8)'), cell({ fmt: HMM, b: true, h: 'right' }));
    cr.set(10, 1, 'Total visé (saisi)', cell({ color: MUTED }));
    cr.set(10, 3, race.targetTotalSeconds !== null ? secToDay(race.targetTotalSeconds) : null, cell({ fmt: HMM, h: 'right' }));
    cr.set(12, 1, 'Course', cell({ color: MUTED })); cr.set(12, 3, race.name, cell({ h: 'right' }));
    cr.set(13, 1, 'Date', cell({ color: MUTED })); cr.set(13, 3, dayValue(race.raceDate), cell({ fmt: DATE, h: 'right' }));
    cr.set(14, 1, 'Objectif révisé le', cell({ color: MUTED })); cr.set(14, 3, race.targetRevisedAt ? dayValue(race.targetRevisedAt.slice(0, 10)) : null, cell({ fmt: DATE, h: 'right' }));
    cr.set(15, 1, 'Notes', cell({ color: MUTED })); cr.set(15, 3, race.notes ?? '', cell({ h: 'right' }));
  } else cr.set(4, 1, 'Aucune course visée.', cell({ color: MUTED }));
  [30, 14, 16, 24].forEach((w, i) => cr.width(i + 1, w));

  // ---------------------------------------------------------------- Alimentation des séances à venir
  const nu = page(wb, 'Alimentation', 'Alimentation des séances à venir', 'Calculée par l’app (banque d’aliments, intensité, choix à la main) · glucides en g, boisson en ml, sodium en mg', 13);
  header(nu, 4, ['Date', 'Discipline', 'Titre', 'Durée (min)', 'Intensité', 'Glucides avant (g)', 'Glucides pendant (g/h)', 'Boisson pendant (ml/h)', 'Sodium pendant (mg/h)', 'Glucides pendant, total (g)', 'Récupération rapide', 'Choix à la main', 'Aliments à emporter pendant']);
  const bankAll = resolveBank(data);
  let nr = 5;
  for (const p of liveRecords(data.planned).filter((x) => x.plannedDate >= today && x.blocks.length).sort((a, b) => (a.plannedDate < b.plannedDate ? -1 : 1))) {
    const n = nutritionForSession(data, d.refsAt(p.plannedDate), p, bankAll, today, (id) => d.links.byPlanned.has(id));
    const o = data.nutri[p.id] && !data.nutri[p.id].deleted ? data.nutri[p.id] : null;
    nu.set(nr, 1, dayValue(p.plannedDate), cell({ fmt: DATE }));
    nu.set(nr, 2, DISCIPLINE_LABEL[p.discipline], cell({ b: true, color: DISC[p.discipline] }));
    nu.set(nr, 3, p.title ?? '', cell());
    if (n.plan) {
      const pl2 = n.plan;
      nu.set(nr, 4, pl2.minutes, cell({ fmt: INT, h: 'right' }));
      nu.set(nr, 5, INTENSITY_LABEL[n.level] + (n.hot ? ' · chaud' : ''), cell({ color: MUTED }));
      nu.set(nr, 6, pl2.before.carbs ? Math.round((pl2.before.carbs[0] + pl2.before.carbs[1]) / 2) : null, cell({ fmt: INT, h: 'right' }));
      nu.set(nr, 7, pl2.during.carbsPerHActual || null, cell({ fmt: INT, h: 'right' }));
      nu.set(nr, 8, pl2.during.fluidPerHPlanned || null, cell({ fmt: INT, h: 'right' }));
      nu.set(nr, 9, pl2.during.sodiumPerHActual || null, cell({ fmt: INT, h: 'right' }));
      nu.set(nr, 10, pl2.during.totalCarbs || null, cell({ fmt: INT, h: 'right' }));
      nu.set(nr, 11, pl2.after.fast ? 'oui' : '', cell({ h: 'center' }));
      nu.set(nr, 12, o?.edits && Object.keys(o.edits).length ? 'oui' : '', cell({ h: 'center' }));
      nu.set(nr, 13, pl2.during.shopping.map((x) => (x.liquid || x.ml > 0 ? Math.round(x.ml) + ' ml' : fracText(x.qty) + ' ×') + ' ' + x.name).join(' · '), cell());
    } else nu.set(nr, 5, 'durée inconnue', cell({ color: MUTED }));
    nr++;
  }
  [11, 13, 28, 11, 14, 14, 16, 16, 16, 18, 14, 12, 70].forEach((w, i) => nu.width(i + 1, w));
  nu.freeze = 'A5';

  // ---------------------------------------------------------------- Banque d'aliments
  const fb = page(wb, 'Aliments', 'Banque d’aliments', 'Produits de l’athlète (défaut, modifiés, ajoutés) · valeurs pour 100 g ou 100 ml · plus petite part = fraction de portion qu’on peut manger', 11);
  header(fb, 4, ['Produit', 'Catégorie', 'Portion', 'Masse ou volume (g, ml)', 'Glucides / 100', 'Protéines / 100', 'Sodium / portion (mg)', 'Caféine / portion (mg)', 'Glucose + fructose', 'Favori', 'Plus petite part']);
  resolveBank(data, true).sort((a, b) => a.category.localeCompare(b.category) || foodName(a).localeCompare(foodName(b))).forEach((fd, i) => {
    const r = 5 + i;
    fb.set(r, 1, foodName(fd), cell({ b: true }));
    fb.set(r, 2, FOOD_CATEGORY_LABEL[fd.category] ?? fd.category, cell({ color: MUTED }));
    fb.set(r, 3, foodUnit(fd), cell());
    fb.set(r, 4, fd.massG, cell({ fmt: INT, h: 'right' }));
    fb.set(r, 5, fd.carbs100, cell({ fmt: DEC1, h: 'right' }));
    fb.set(r, 6, fd.protein100 ?? null, cell({ fmt: DEC1, h: 'right' }));
    fb.set(r, 7, Math.round(sodiumOf(fd)) || null, cell({ fmt: INT, h: 'right' }));
    fb.set(r, 8, fd.caffeineMg || null, cell({ fmt: INT, h: 'right' }));
    fb.set(r, 9, fd.mixed ? 'oui' : '', cell({ h: 'center' }));
    fb.set(r, 10, fd.fav ? '♥' : '', cell({ h: 'center' }));
    fb.set(r, 11, fracText(stepOf(fd)), cell({ h: 'center' }));
  });
  [34, 18, 18, 14, 12, 12, 14, 14, 12, 8, 14].forEach((w, i) => fb.width(i + 1, w));
  fb.freeze = 'A5';

  // ---------------------------------------------------------------- Mesures de la montre (point de la semaine)
  const cp = page(wb, 'Capacités', 'Mesures de la montre', 'Point de la semaine : valeurs relevées sur la montre Garmin (jamais recalculées par l’app) · prédictions en h:mm:ss', 12);
  header(cp, 4, ['Relevé du', 'VO₂max', 'Seuil : FC (bpm)', 'Seuil : allure (/km)', 'Prédiction 5 km', 'Prédiction 10 km', 'Prédiction semi', 'Prédiction marathon', 'HRV (ms)', 'Statut HRV', 'Sommeil ressenti (1-5)', 'Récupération ressentie (1-5)']);
  checkinsSorted(data).forEach((c, i) => {
    const r = 5 + i;
    cp.set(r, 1, dayValue((c.day || c.week) as string), cell({ fmt: DATE }));
    cp.set(r, 2, c.vo2max, cell({ fmt: DEC1, h: 'right' }));
    cp.set(r, 3, c.lthrBpm, cell({ fmt: INT, h: 'right' }));
    cp.set(r, 4, c.lthPaceSecKm !== null ? secToDay(c.lthPaceSecKm) : null, cell({ fmt: 'm:ss', h: 'right' }));
    for (const [k, v] of [c.pred5kSec, c.pred10kSec, c.predHalfSec, c.predMarathonSec].entries()) cp.set(r, 5 + k, v !== null ? secToDay(v) : null, cell({ fmt: '[h]:mm:ss', h: 'right' }));
    cp.set(r, 9, c.hrvMs, cell({ fmt: INT, h: 'right' }));
    cp.set(r, 10, c.hrvStatus ?? '', cell({ color: MUTED }));
    cp.set(r, 11, c.sleepFelt, cell({ fmt: INT, h: 'center' }));
    cp.set(r, 12, c.recoveryFelt, cell({ fmt: INT, h: 'center' }));
  });
  [12, 9, 14, 16, 14, 14, 14, 16, 10, 12, 16, 18].forEach((w, i) => cp.width(i + 1, w));
  cp.freeze = 'A5';

  // ---------------------------------------------------------------- Poids et interruptions
  const sv = page(wb, 'Suivi', 'Poids et interruptions', 'Pesées (kg) et périodes d’interruption (blessure, voyage…) avec la charge quotidienne retenue', 7);
  header(sv, 4, ['Pesée du', 'Poids (kg)', 'Source', '', 'Interruption', 'Début', 'Fin']);
  liveRecords(data.weight).sort((a, b) => (a.day < b.day ? -1 : 1)).forEach((w, i) => {
    sv.set(5 + i, 1, dayValue(w.day), cell({ fmt: DATE }));
    sv.set(5 + i, 2, w.kg, cell({ fmt: DEC1, h: 'right' }));
    sv.set(5 + i, 3, w.source === 'health' ? 'Montre' : 'Saisie', cell({ color: MUTED }));
  });
  liveRecords(data.interruptions).sort((a, b) => (a.startDate < b.startDate ? -1 : 1)).forEach((x, i) => {
    sv.set(5 + i, 5, x.label + ' (' + x.reason + (x.dailyLoadOverride !== null ? ', charge ' + x.dailyLoadOverride + '/j' : '') + ')', cell());
    sv.set(5 + i, 6, dayValue(x.startDate), cell({ fmt: DATE }));
    sv.set(5 + i, 7, dayValue(x.endDate), cell({ fmt: DATE }));
  });
  [12, 12, 10, 3, 46, 12, 12].forEach((w, i) => sv.width(i + 1, w));
  sv.freeze = 'A5';
  return wb;
}

export async function exportExcel(data: AppData, d: Derived): Promise<Blob> {
  const wb = buildWorkbook(data, d);
  return wb.zip().generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', compression: 'DEFLATE' });
}
