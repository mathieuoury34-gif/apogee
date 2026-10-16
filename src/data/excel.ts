// Classeur Excel de Quadra (même générateur que PEAnalyze, aux couleurs de Quadra).
// Les données (séances, charge, zones…) sont des valeurs ; les synthèses hebdomadaires et mensuelles sont
// en FORMULES (SOMME.SI.ENS sur l'onglet Séances) : le fichier reste vivant si tu y ajoutes des lignes.
import { estimateDistance, estimateDuration } from '../domain/blocks';
import { addDays, mondayOf } from '../domain/dates';
import type { Derived } from '../domain/engine';
import { liveRecords, sessionDay, zoneHistory, METHOD_LABEL } from '../domain/load';
import type { AppData } from '../domain/types';
import { CORE } from '../domain/stats';
import { FORM_STEP_LABEL, formStep } from '../domain/form';
import { blocksSummary } from '../ui/format';
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

export function buildWorkbook(data: AppData, d: Derived): Workbook {
  const wb = new Workbook();
  const today = d.today;
  const actual = liveRecords(data.actual).sort((a, b) => (a.startAt < b.startAt ? -1 : 1));

  // ---------------------------------------------------------------- Tableau de bord
  const db = page(wb, 'Tableau de bord', 'Quadra — tableau de bord', `Export du ${today.split('-').reverse().join('/')} · valeurs du jour, puis synthèses calculées par formules`, 8);
  const race = data.race.main && !data.race.main.deleted ? data.race.main : null;
  const rows: [string, Value, string?][] = [
    ['Course visée', race ? race.name + ' — ' + race.raceDate.split('-').reverse().join('/') : '—'],
    ['Jours avant la course', race ? f(`DATE(${race.raceDate.slice(0, 4)},${+race.raceDate.slice(5, 7)},${+race.raceDate.slice(8, 10)})-TODAY()`) : '—', INT],
    ['Forme du jour (/100)', d.form ? Math.round(d.form.score) : '—', INT],
    ['Forme de fond', d.constat.fitness ?? '—', DEC1],
    ['Fatigue', d.constat.fatigue ?? '—', DEC1],
    ['Fraîcheur', d.constat.freshness ?? '—', DEC1],
    ['Ratio aigu / chronique', d.constat.acuteChronicRatio ?? '—', DEC2],
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
  const ss = page(wb, 'Séances', 'Séances réalisées', 'Une ligne par séance · durée en h:mm · charge selon sa méthode (mesurée ou estimée)', 15);
  const H = ['Date', 'Discipline', 'Heure', 'Source', 'Durée', 'Distance (km)', 'Allure / vitesse', 'FC moy.', 'FC max', 'Charge', 'Méthode de charge', 'RPE', 'Séance prévue rattachée', 'Dérive cardiaque', 'Commentaire'];
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
  });
  [11, 12, 7, 8, 9, 11, 14, 8, 8, 8, 26, 6, 30, 10, 40].forEach((w, i) => ss.width(i + 1, w));
  ss.freeze = 'A5';
  ss.autoFilter = `A4:O${4 + Math.max(1, actual.length)}`;

  // ---------------------------------------------------------------- Séances prévues
  const pl = page(wb, 'Plan', 'Séances prévues', 'Durée et distance estimées à partir des blocs · statut calculé par l’app', 8);
  header(pl, 4, ['Date', 'Discipline', 'Titre', 'Durée estimée', 'Distance estimée (km)', 'Statut', 'Origine', 'Blocs']);
  liveRecords(data.planned).sort((a, b) => (a.plannedDate < b.plannedDate ? -1 : 1)).forEach((p, i) => {
    const r = 5 + i;
    const dur = estimateDuration(p.blocks, p.discipline, d.refs), dist = estimateDistance(p.blocks, p.discipline, d.refs);
    const done = d.links.byPlanned.has(p.id);
    pl.set(r, 1, dayValue(p.plannedDate), cell({ fmt: DATE }));
    pl.set(r, 2, DISCIPLINE_LABEL[p.discipline], cell({ b: true, color: DISC[p.discipline] }));
    pl.set(r, 3, p.title ?? '', cell());
    pl.set(r, 4, dur.certainty === 'unknown' ? null : secToDay(dur.value), cell({ fmt: HMM, h: 'right' }));
    pl.set(r, 5, dist.certainty === 'unknown' ? null : dist.value / 1000, cell({ fmt: KM, h: 'right' }));
    pl.set(r, 6, done ? 'Réalisée' : p.plannedDate < today ? 'Non réalisée' : 'À venir', cell({ color: done ? '2E7560' : p.plannedDate < today ? '8E2B20' : MUTED }));
    pl.set(r, 7, p.origin === 'coach' ? 'Coach' : 'Saisie', cell({ color: MUTED }));
    pl.set(r, 8, blocksSummary(p.blocks, p.discipline), cell());
  });
  [11, 13, 28, 12, 12, 13, 9, 80].forEach((w, i) => pl.width(i + 1, w));
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
  const ph = page(wb, 'Périodisation', 'Blocs de préparation', 'Une seule échelle de blocs datés, sans chevauchement', 7);
  header(ph, 4, ['Bloc', 'Phase', 'Début', 'Fin', 'Jours', 'Intention', 'Objectif']);
  liveRecords(data.phases).sort((a, b) => (a.startDate < b.startDate ? -1 : 1)).forEach((p, i) => {
    const r = 5 + i;
    ph.set(r, 1, p.label, cell({ b: true }));
    ph.set(r, 2, p.phase ?? '', cell({ color: MUTED }));
    ph.set(r, 3, dayValue(p.startDate), cell({ fmt: DATE }));
    ph.set(r, 4, dayValue(p.endDate), cell({ fmt: DATE }));
    ph.set(r, 5, f(`D${r}-C${r}+1`), cell({ fmt: INT, h: 'right' }));
    ph.set(r, 6, p.intent ?? '', cell());
    ph.set(r, 7, p.objective ?? '', cell());
  });
  [22, 16, 11, 11, 7, 40, 40].forEach((w, i) => ph.width(i + 1, w));
  return wb;
}

export async function exportExcel(data: AppData, d: Derived): Promise<Blob> {
  const wb = buildWorkbook(data, d);
  return wb.zip().generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', compression: 'DEFLATE' });
}
