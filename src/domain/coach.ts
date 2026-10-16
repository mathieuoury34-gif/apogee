// Échange coach, format `ironapp/1` — repris de planning/coachExport.ts et coachImport.ts.
// Le CONTRAT est inchangé (mêmes champs, mêmes clés `session:<id>` / `phase:<id>`), avec trois corrections :
//  - le chevauchement des blocs de périodisation est vérifié sur l'état APRÈS import (avant : contre
//    l'état d'avant, si bien que décaler deux blocs consécutifs dans le même fichier était refusé, et deux
//    blocs qui se chevauchaient dans le même fichier passaient) ;
//  - `matchedPlanned` est toujours « linked » quand l'app a rattaché la séance (le rattachement
//    automatique existe depuis T4) ; « heuristic » ne reste qu'en dernier recours ;
//  - les champs ajoutés sont additifs (méthode de charge enrichie, `loadSummary.srpeFactor`), donc
//    lisibles par un coach qui ne connaît que la version précédente.
import { $t } from '../i18n';
import { validateSession, type DraftIssueCode } from './blocks';
import { addDays, mondayOf, today } from './dates';
import type { Derived } from './engine';
import { fnv1a, newId, nowIso } from './ids';
import { latestZone, liveRecords, sessionDay } from './load';
import type { AppData, Block, CoachExchange, PlannedDiscipline, PlannedSession, PreviewItem, TrainingPhase } from './types';
import { BLOCK_KINDS, BLOCK_MEASURES, PLANNED_DISCIPLINES, RELATIVE_REFS, SET_MODES, TARGET_TYPES, ZONE_KINDS } from './types';

export const SCHEMA = 'ironapp/1';
const UPCOMING_DAYS = 56;
const VOLUME_WEEKS = 6;

export const refKeyOfSession = (p: PlannedSession) => p.idempotencyKey ?? 'session:' + p.id;
export const refKeyOfPhase = (p: TrainingPhase) => p.idempotencyKey ?? 'phase:' + p.id;

const UNIT: Record<string, string> = { vma: 'm_s', css: 'm_s', ftp: 'w', hr_max: 'bpm' };
const blockOut = (b: Block): Block => ({ ...b, children: b.children.map((c) => ({ ...c, children: [] })) });

function instructions(): string {
  return [
    `CONTRAT DE RÉPONSE — dossier-athlète Quadra, schemaVersion "${SCHEMA}".`,
    "Ce texte s'adresse à N'IMPORTE QUEL modèle de langage lisant ce fichier,",
    'pas seulement à Claude : suis-le au mot près, sans supposer de contexte',
    'extérieur à ce dossier.',
    '',
    'RÈGLES DE FORME — AUCUNE EXCEPTION :',
    '- Ta réponse ENTIÈRE est UN SEUL bloc JSON. Rien avant, rien après : ni',
    "  phrase d'introduction, ni conclusion, ni balises ```json ou ```.",
    "- Le JSON ne contient AUCUN commentaire (le JSON standard n'en admet",
    '  pas) et aucune virgule finale.',
    '- Chaque `<...>` ci-dessous est un espace réservé à REMPLACER par une',
    '  vraie valeur — ne recopie jamais les chevrons ni le texte entre eux.',
    '- « une valeur parmi A, B, C » veut dire : choisis EXACTEMENT UN de ces',
    '  mots comme chaîne, jamais la liste entière.',
    '- `responseContract.example`, dans CE MÊME fichier, est un plan complet',
    '  et déjà valide : reprends sa STRUCTURE et sa ponctuation exactes,',
    '  jamais son contenu (dates, clés, séances) tel quel.',
    '',
    'LECTURE DU DOSSIER :',
    "- `upcomingPlannedSessions` et `recentPlannedSessions` montrent l'état ACTUEL des séances prévues, y compris",
    "  celles que l'athlète a modifiées ou déplacées après ton dernier plan (`editedByAthleteAt` non nul).",
    "  Pars de ces versions, pas de ce que tu avais écrit : ne les écrase pas sans raison, et dis laquelle dans `notes`.",
    "- `recentPlannedSessions` : séances prévues passées de la période, `status` « done » (réalisée) ou « missed » (non réalisée).",
    '',
    'FORME EXACTE DU FICHIER À RENVOYER :',
    '{',
    `  "schemaVersion": "${SCHEMA}",`,
    '  "generatedAt": "<instant ISO, ex. 2026-09-15T07:00:00.000Z>",',
    '  "planValidUntil": "<AAAA-MM-JJ, ou null si le plan n\'a pas d\'échéance>",',
    '  "operations": [ <Opération>, ... ]',
    '}',
    '',
    'Une Opération sur une SÉANCE (entity "session") :',
    '{',
    '  "entity": "session",',
    '  "action": "<une valeur parmi create, update, delete>",',
    '  "idempotencyKey": "<clé unique, texte>",',
    '  "discipline": "<une valeur parmi RUN, BIKE, SWIM, STRENGTH, BRICK>",',
    '  "plannedDate": "<AAAA-MM-JJ>",',
    '  "title": "<texte ou null>",',
    '  "notes": "<texte ou null>",',
    '  "blocks": [ <Bloc>, ... ]',
    '}',
    'Pour "delete" : n\'envoie QUE "entity", "action" et "idempotencyKey" —',
    'tout le reste est ignoré à la lecture, inutile de le deviner.',
    'Une séance sans bloc est refusée à l\'import — jamais "blocks": [].',
    '',
    'Un Bloc :',
    '{',
    '  "kind": "<une valeur parmi WARMUP, WORK, RECOVERY, REST, COOLDOWN, TRANSITION, SET>",',
    '  "measure": "<une valeur parmi TIME, DISTANCE, REPS, OPEN — ou null si kind est SET>",',
    '  "measureValue": <nombre ou null — secondes/mètres/répétitions selon measure ; null si measure est OPEN>,',
    '  "setMode": "<une valeur parmi REPEAT, AMRAP, EVERY — ou null si kind n\'est pas SET>",',
    '  "setCount": <entier ou null — obligatoire si setMode est REPEAT ou EVERY>,',
    '  "setWindowS": <secondes ou null — obligatoire si setMode est AMRAP ou EVERY>,',
    '  "targetType": "<une valeur parmi NONE, ZONE, PACE, SPEED, POWER, HR, LOAD, RPE>",',
    '  "targetLow": <nombre ou null — obligatoire dès que targetType n\'est pas NONE>,',
    '  "targetHigh": <nombre ou null — null veut dire valeur unique, pas une fourchette>,',
    '  "relativeTo": "<une valeur parmi FTP, VMA, CSS, HRMAX, ONE_RM — ou null si la cible n\'est pas un pourcentage>",',
    '  "label": "<texte ou null>",',
    '  "notes": "<texte ou null>",',
    '  "discipline": "<null presque toujours ; une valeur parmi RUN, BIKE, SWIM, STRENGTH UNIQUEMENT dans un BRICK, pour marquer un changement de discipline>",',
    '  "children": [ <Bloc>, ... ] (uniquement si kind est SET ; profondeur 1 maximum — un enfant ne peut pas lui-même avoir d\'enfants)',
    '}',
    'Unités SI partout : secondes, mètres, mètres par seconde, watts, battements par minute, kilogrammes.',
    'Une allure (targetType PACE) se donne en secondes par kilomètre (par 100 m en SWIM).',
    'Une vitesse (targetType SPEED) se donne en mètres par seconde.',
    'relativeTo renseigné → targetLow/targetHigh sont des POURCENTAGES (ex. 90',
    'pour 90 %), jamais résolus en valeur absolue.',
    'Un bloc WORK sans cible (targetType NONE) est un éducatif — technique,',
    'gainage, mobilité : dis dans "notes" ce qu\'il faut faire, rien d\'autre',
    'ne le décrit.',
    '',
    'Une Opération sur un BLOC DE PÉRIODISATION (entity "phase") :',
    '{',
    '  "entity": "phase",',
    '  "action": "<une valeur parmi create, update, delete>",',
    '  "idempotencyKey": "<clé unique, texte>",',
    '  "label": "<texte>",',
    '  "phase": "<texte ou null>",',
    '  "startDate": "<AAAA-MM-JJ>",',
    '  "endDate": "<AAAA-MM-JJ>",',
    '  "intent": "<texte ou null>",',
    '  "objective": "<texte ou null>",',
    '  "notes": "<texte ou null>"',
    '}',
    'Pour "delete" : n\'envoie QUE "entity", "action" et "idempotencyKey".',
    'Deux blocs de périodisation ne peuvent jamais se chevaucher (vérifié sur',
    "l'état obtenu APRÈS ton fichier : tu peux décaler plusieurs blocs à la fois).",
    '',
    'RÈGLE DE CLÉ — LA PLUS IMPORTANTE :',
    'Pour modifier ou supprimer un élément déjà présent dans ce fichier',
    '(sections "upcomingPlannedSessions" ou "phases"), reprends EXACTEMENT',
    'son "refKey" comme "idempotencyKey" de ton opération — y compris pour un',
    'élément dont le refKey commence par "session:" ou "phase:" (cela',
    "signifie seulement qu'il a été saisi à la main, pas par un échange",
    'précédent : la clé reste valide).',
    'Pour une création, invente une clé neuve qui ne commence PAS par',
    '"session:" ou "phase:" suivi uniquement de chiffres.',
    '',
    'À PROPOS DE "matchedPlanned" DANS recentActualSessions :',
    'Un "matchConfidence" à "linked" est un rattachement fait par l\'app',
    '(automatique ou confirmé à la main). Un "matchConfidence" à "heuristic" est',
    'une simple déduction (même jour, même discipline) : traite-le comme',
    'probable, pas comme certain. "matchedPlanned": null ne veut PAS dire',
    "qu'aucun prévu n'existait ce jour-là — vérifie aussi \"upcomingPlannedSessions\"",
    "et l'historique connu avant de conclure à une séance non planifiée.",
    '',
    'À PROPOS DE "loadMethod" : "trimp" = mesurée sur la série cardio ;',
    '"trimp_avg" = estimée sur la FC moyenne ; "srpe" = estimée depuis le RPE et',
    'recalée sur l\'échelle du TRIMP (coefficient loadSummary.srpeFactor) ;',
    '"provisional" = provisoire, sans FC ni RPE ; null = pas de charge.',
    '',
    'Un exemple de fichier complet et déjà valide se trouve dans',
    '"responseContract.example" de ce même dossier — reprends sa structure',
    'exacte pour ta réponse.',
  ].join('\n');
}

const B = (o: Partial<Block>): Block => ({ kind: 'WORK', measure: 'TIME', measureValue: null, setMode: null, setCount: null, setWindowS: null, targetType: 'NONE', targetLow: null, targetHigh: null, relativeTo: null, label: null, notes: null, discipline: null, children: [], ...o });

function example() {
  return {
    schemaVersion: SCHEMA, generatedAt: '2026-09-15T07:00:00.000Z', planValidUntil: '2026-09-22',
    operations: [
      {
        entity: 'session', action: 'create', idempotencyKey: '2026-09-16-run-endurance', discipline: 'RUN', plannedDate: '2026-09-16', title: 'Endurance fondamentale', notes: null,
        blocks: [B({ kind: 'WARMUP', measureValue: 600, label: 'Échauffement' }), B({ measureValue: 2400, targetType: 'PACE', targetLow: 330, label: 'Corps de séance', notes: 'Allure conversationnelle, sur sensations' }), B({ kind: 'COOLDOWN', measureValue: 300, label: 'Retour au calme' })],
      },
      { entity: 'session', action: 'delete', idempotencyKey: 'session:482' },
      { entity: 'phase', action: 'update', idempotencyKey: 'phase:12', label: 'Bloc de reprise', phase: 'base', startDate: '2026-09-08', endDate: '2026-09-28', intent: 'Reprendre le volume progressivement', objective: null, notes: null },
    ],
  };
}

// ------------------------------------------------------------------ export du dossier-athlète
export function buildDossier(data: AppData, d: Derived, selected: string[], now: Date = new Date(), periodFrom?: string) {
  const day = today(now);
  const a = data.athlete.main;
  const race = data.race.main && !data.race.main.deleted ? data.race.main : null;
  const volFrom = addDays(day, -7 * VOLUME_WEEKS);
  const vol = new Map<string, number>();
  for (const s of liveRecords(data.actual)) {
    const sd = sessionDay(s);
    if (sd < volFrom) continue;
    const k = mondayOf(sd) + '\u0000' + s.discipline;
    vol.set(k, (vol.get(k) ?? 0) + s.durationSec);
  }
  const upcoming = liveRecords(data.planned).filter((p) => p.plannedDate >= day && p.plannedDate <= addDays(day, UPCOMING_DAYS)).sort((x, y) => (x.plannedDate < y.plannedDate ? -1 : 1));
  const plannedOut = (p: PlannedSession) => ({ refKey: refKeyOfSession(p), discipline: p.discipline, plannedDate: p.plannedDate, title: p.title, notes: p.notes, origin: p.origin, editedByAthleteAt: p.editedAt ?? null, blocks: p.blocks.map(blockOut) });
  const past = periodFrom ? liveRecords(data.planned).filter((p) => p.plannedDate >= periodFrom && p.plannedDate < day).sort((x, y) => (x.plannedDate < y.plannedDate ? -1 : 1)) : [];
  const recent = selected.map((id) => data.actual[id]).filter((s) => s && !s.deleted).sort((x, y) => (x.startAt < y.startAt ? -1 : 1));
  return {
    schemaVersion: SCHEMA,
    generatedAt: now.toISOString(),
    responseContract: { version: SCHEMA, instructions: instructions(), example: example() },
    athlete: {
      displayName: a?.displayName ?? null, birthDate: a?.birthDate ?? null, sex: a?.sex ?? null,
      availability: a ? JSON.stringify(a.availability) : null, equipment: a ? JSON.stringify(a.equipment) : null, injuries: a ? JSON.stringify(a.injuries) : null,
    },
    race: race ? { name: race.name, raceDate: race.raceDate, targetTotalSeconds: race.targetTotalSeconds, swimDistanceM: race.swimDistanceM, bikeDistanceM: race.bikeDistanceM, runDistanceM: race.runDistanceM } : null,
    zones: ZONE_KINDS.map((k) => latestZone(data, k)).filter((z) => z).map((z) => ({ kind: z!.kind, value: z!.value, unit: UNIT[z!.kind], measuredAt: z!.measuredAt, source: z!.source })),
    phases: liveRecords(data.phases).sort((x, y) => (x.startDate < y.startDate ? -1 : 1)).map((p) => ({ refKey: refKeyOfPhase(p), label: p.label, phase: p.phase, startDate: p.startDate, endDate: p.endDate, intent: p.intent, objective: p.objective, notes: p.notes })),
    interruptions: liveRecords(data.interruptions).map((i) => ({ label: i.label, startDate: i.startDate, endDate: i.endDate, reason: i.reason, dailyLoadOverride: i.dailyLoadOverride })),
    loadSummary: {
      ...d.constat,
      srpeFactor: Math.round(d.ctx.srpeFactor * 1000) / 1000,
      weeklyVolumeByDiscipline: [...vol.entries()].map(([k, seconds]) => { const [weekStart, discipline] = k.split('\u0000'); return { weekStart, discipline, seconds }; }).sort((x, y) => (x.weekStart < y.weekStart ? -1 : 1)),
    },
    upcomingPlannedSessions: upcoming.map(plannedOut),
    recentPlannedSessions: past.map((p) => ({ ...plannedOut(p), status: d.links.byPlanned.has(p.id) ? 'done' : 'missed' })),
    recentActualSessions: recent.map((s) => {
      const link = d.links.byActual.get(s.id);
      let matched: { refKey: string; title: string | null; matchConfidence: 'linked' | 'heuristic' } | null = null;
      const lp = link?.plannedId ? data.planned[link.plannedId] : undefined;
      if (lp && !lp.deleted) matched = { refKey: refKeyOfSession(lp), title: lp.title, matchConfidence: 'linked' };
      else if (link?.type !== 'none') {
        const sd = sessionDay(s);
        const h = liveRecords(data.planned).find((p) => p.plannedDate === sd && p.discipline === s.discipline);
        if (h) matched = { refKey: refKeyOfSession(h), title: h.title, matchConfidence: 'heuristic' };
      }
      const l = d.loads.get(s.id);
      return {
        internalId: /^\d+$/.test(s.id) && s.id.length < 15 ? Number(s.id) : s.id,
        discipline: s.discipline, startAt: s.startAt, durationSec: s.durationSec, distanceM: s.distanceM, avgHrBpm: s.avgHrBpm,
        load: l?.load ?? null, loadMethod: l && l.method !== 'pending' ? l.method : null, hrDrift: l?.drift ?? null,
        rpe: s.rpe, comment: s.comment, matchedPlanned: matched,
      };
    }),
  };
}

// ------------------------------------------------------------------ lecture du plan
export interface SessionOp { entity: 'session'; action: 'create' | 'update' | 'delete'; idempotencyKey: string; discipline: PlannedDiscipline | null; plannedDate: string | null; title: string | null; notes: string | null; blocks: Block[] }
export interface PhaseOp { entity: 'phase'; action: 'create' | 'update' | 'delete'; idempotencyKey: string; label: string | null; phase: string | null; startDate: string | null; endDate: string | null; intent: string | null; objective: string | null; notes: string | null }
export type CoachOp = SessionOp | PhaseOp;
export interface CoachPlan { generatedAt: string; planValidUntil: string | null; operations: CoachOp[] }
export type ParseResult = { ok: true; plan: CoachPlan; malformed: number; hash: string } | { ok: false; code: 'JSON_INVALID' | 'SCHEMA_VERSION_UNSUPPORTED' | 'STRUCTURE_INVALID'; found?: unknown };

const isOneOf = <T extends readonly string[]>(v: unknown, l: T): v is T[number] => typeof v === 'string' && (l as readonly string[]).includes(v);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const str = (v: unknown) => (typeof v === 'string' ? v : null);
const numv = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function parseBlock(raw: unknown, depth: number): Block | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const v = raw as Record<string, unknown>;
  if (!isOneOf(v.kind, BLOCK_KINDS)) return null;
  const measure = v.measure ?? null;
  if (measure !== null && !isOneOf(measure, BLOCK_MEASURES)) return null;
  const setMode = v.setMode ?? null;
  if (setMode !== null && !isOneOf(setMode, SET_MODES)) return null;
  const targetType = v.targetType ?? 'NONE';
  if (!isOneOf(targetType, TARGET_TYPES)) return null;
  const rel = v.relativeTo ?? null;
  if (rel !== null && !isOneOf(rel, RELATIVE_REFS)) return null;
  const disc = v.discipline ?? null;
  if (disc !== null && !isOneOf(disc, PLANNED_DISCIPLINES)) return null;
  const rawChildren = Array.isArray(v.children) ? v.children : [];
  if (depth >= 1 && rawChildren.length) return null;
  const children: Block[] = [];
  for (const c of rawChildren) { const p = parseBlock(c, depth + 1); if (!p) return null; children.push(p); }
  return {
    kind: v.kind, measure: measure as Block['measure'], measureValue: numv(v.measureValue), setMode: setMode as Block['setMode'], setCount: numv(v.setCount), setWindowS: numv(v.setWindowS),
    targetType, targetLow: numv(v.targetLow), targetHigh: numv(v.targetHigh), relativeTo: rel as Block['relativeTo'], label: str(v.label), notes: str(v.notes), discipline: disc as Block['discipline'], children,
  };
}

function parseOp(raw: unknown): CoachOp | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const v = raw as Record<string, unknown>;
  if (typeof v.idempotencyKey !== 'string' || !v.idempotencyKey.trim()) return null;
  if (!isOneOf(v.action, ['create', 'update', 'delete'] as const)) return null;
  const base = { action: v.action, idempotencyKey: v.idempotencyKey };
  if (v.entity === 'session') {
    if (v.action === 'delete') return { entity: 'session', ...base, discipline: null, plannedDate: null, title: null, notes: null, blocks: [] };
    if (!isOneOf(v.discipline, PLANNED_DISCIPLINES) || typeof v.plannedDate !== 'string' || !DATE.test(v.plannedDate)) return null;
    const blocks: Block[] = [];
    for (const b of Array.isArray(v.blocks) ? v.blocks : []) { const p = parseBlock(b, 0); if (!p) return null; blocks.push(p); }
    return { entity: 'session', ...base, discipline: v.discipline, plannedDate: v.plannedDate, title: str(v.title), notes: str(v.notes), blocks };
  }
  if (v.entity === 'phase') {
    if (v.action === 'delete') return { entity: 'phase', ...base, label: null, phase: null, startDate: null, endDate: null, intent: null, objective: null, notes: null };
    if (typeof v.label !== 'string' || !v.label.trim() || typeof v.startDate !== 'string' || !DATE.test(v.startDate) || typeof v.endDate !== 'string' || !DATE.test(v.endDate)) return null;
    return { entity: 'phase', ...base, label: v.label, phase: str(v.phase), startDate: v.startDate, endDate: v.endDate, intent: str(v.intent), objective: str(v.objective), notes: str(v.notes) };
  }
  return null;
}

export function parsePlan(raw: string): ParseResult {
  let j: unknown;
  // tolère les balises ```json qu'un modèle ajoute parfois malgré la consigne
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try { j = JSON.parse(cleaned); } catch { return { ok: false, code: 'JSON_INVALID' }; }
  if (typeof j !== 'object' || j === null) return { ok: false, code: 'STRUCTURE_INVALID' };
  const v = j as Record<string, unknown>;
  if (v.schemaVersion !== SCHEMA) return { ok: false, code: 'SCHEMA_VERSION_UNSUPPORTED', found: v.schemaVersion };
  if (!Array.isArray(v.operations)) return { ok: false, code: 'STRUCTURE_INVALID' };
  const ops: CoachOp[] = [];
  let malformed = 0;
  for (const o of v.operations) { const p = parseOp(o); if (p) ops.push(p); else malformed++; }
  return { ok: true, malformed, hash: fnv1a(raw), plan: { generatedAt: str(v.generatedAt) ?? nowIso(), planValidUntil: typeof v.planValidUntil === 'string' && DATE.test(v.planValidUntil) ? v.planValidUntil : null, operations: ops } };
}

// ------------------------------------------------------------------ aperçu et application
export type PhaseIssueCode = 'PHASE_LABEL_MISSING' | 'PHASE_DATES_INVERTED' | 'PHASE_OVERLAP';
export const PHASE_ISSUE_TEXT: Record<PhaseIssueCode, string> = {
  PHASE_LABEL_MISSING: $t("Le bloc n’a pas de nom."),
  PHASE_DATES_INVERTED: $t("La date de fin précède la date de début."),
  PHASE_OVERLAP: $t("Cette période en chevauche une autre."),
};
export const ISSUE_LABEL = (code: string) => (code in PHASE_ISSUE_TEXT ? PHASE_ISSUE_TEXT[code as PhaseIssueCode] : code);

export function validatePhase(p: Pick<TrainingPhase, 'id' | 'label' | 'startDate' | 'endDate'>, others: Pick<TrainingPhase, 'id' | 'label' | 'startDate' | 'endDate'>[]): { code: PhaseIssueCode; with?: string }[] {
  const out: { code: PhaseIssueCode; with?: string }[] = [];
  if (!p.label.trim()) out.push({ code: 'PHASE_LABEL_MISSING' });
  if (p.endDate < p.startDate) out.push({ code: 'PHASE_DATES_INVERTED' });
  for (const o of others) if (o.id !== p.id && p.startDate <= o.endDate && o.startDate <= p.endDate) out.push({ code: 'PHASE_OVERLAP', with: o.label });
  return out;
}

function resolve<T extends { id: string; idempotencyKey: string | null; deleted?: boolean }>(rec: Record<string, T>, key: string, prefix: string): T | null {
  const byKey = Object.values(rec).find((r) => !r.deleted && r.idempotencyKey === key);
  if (byKey) return byKey;
  if (key.startsWith(prefix)) { const r = rec[key.slice(prefix.length)]; if (r && !r.deleted) return r; }
  return null;
}

export interface ResolvedOp { op: CoachOp; existingId: string | null; category: 'create' | 'update' | 'delete' | 'noop' | 'rejected' }
export interface Preview { resolved: ResolvedOp[]; created: PreviewItem[]; updated: PreviewItem[]; deleted: PreviewItem[]; rejected: PreviewItem[]; noop: PreviewItem[]; malformed: number }

const DISC_FR: Record<string, string> = { RUN: $t("Course"), BIKE: $t("Vélo"), SWIM: $t("Natation"), STRENGTH: $t("Renforcement"), BRICK: $t("Enchaînement") };
const dateFr = (d: string | null) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : d);
const sessionLabel = (o: { discipline: string | null; plannedDate: string | null; title: string | null }) => [o.discipline ? DISC_FR[o.discipline] ?? o.discipline : null, dateFr(o.plannedDate), o.title].filter(Boolean).join(' · ');

export function preview(data: AppData, plan: CoachPlan, malformed: number): Preview {
  const pv: Preview = { resolved: [], created: [], updated: [], deleted: [], rejected: [], noop: [], malformed };
  // État des phases APRÈS import : on retire d'abord tout ce que le fichier modifie ou supprime, puis chaque
  // création / modification est vérifiée dans l'ordre du fichier contre ce qui a déjà été accepté.
  const phaseState = new Map<string, { id: string; label: string; startDate: string; endDate: string }>();
  for (const p of liveRecords(data.phases)) phaseState.set(p.id, { id: p.id, label: p.label, startDate: p.startDate, endDate: p.endDate });
  const phaseOps: { op: PhaseOp; existing: TrainingPhase | null; tmpId: string }[] = [];
  for (const op of plan.operations) {
    if (op.entity !== 'phase') continue;
    const existing = resolve(data.phases, op.idempotencyKey, 'phase:');
    if (existing) phaseState.delete(existing.id);
    phaseOps.push({ op, existing, tmpId: existing?.id ?? 'new:' + op.idempotencyKey });
  }
  const restoreRejected = (existing: TrainingPhase | null) => { if (existing) phaseState.set(existing.id, existing); };
  let pi = 0;
  for (const op of plan.operations) {
    if (op.entity === 'session') {
      const ex = resolve(data.planned, op.idempotencyKey, 'session:');
      if (op.action === 'delete') {
        if (!ex) { pv.noop.push({ entity: 'session', idempotencyKey: op.idempotencyKey, label: op.idempotencyKey, issueCodes: [] }); pv.resolved.push({ op, existingId: null, category: 'noop' }); }
        else { pv.deleted.push({ entity: 'session', idempotencyKey: op.idempotencyKey, label: sessionLabel(ex), issueCodes: [] }); pv.resolved.push({ op, existingId: ex.id, category: 'delete' }); }
        continue;
      }
      const issues = validateSession({ discipline: op.discipline ?? 'RUN', plannedDate: op.plannedDate ?? '', blocks: op.blocks });
      const item: PreviewItem = { entity: 'session', idempotencyKey: op.idempotencyKey, label: sessionLabel(op), issueCodes: issues.map((i) => i.code as DraftIssueCode) };
      if (issues.length) { pv.rejected.push(item); pv.resolved.push({ op, existingId: ex?.id ?? null, category: 'rejected' }); continue; }
      (ex ? pv.updated : pv.created).push(item);
      pv.resolved.push({ op, existingId: ex?.id ?? null, category: ex ? 'update' : 'create' });
      continue;
    }
    const { existing, tmpId } = phaseOps[pi++];
    const label = [op.label, op.startDate && op.endDate ? `${dateFr(op.startDate)} → ${dateFr(op.endDate)}` : dateFr(op.startDate)].filter(Boolean).join(' · ') || op.idempotencyKey;
    if (op.action === 'delete') {
      if (!existing) { pv.noop.push({ entity: 'phase', idempotencyKey: op.idempotencyKey, label: op.idempotencyKey, issueCodes: [] }); pv.resolved.push({ op, existingId: null, category: 'noop' }); }
      else { pv.deleted.push({ entity: 'phase', idempotencyKey: op.idempotencyKey, label: existing.label + ' · ' + dateFr(existing.startDate), issueCodes: [] }); pv.resolved.push({ op, existingId: existing.id, category: 'delete' }); }
      continue;
    }
    const me = { id: tmpId, label: op.label ?? '', startDate: op.startDate ?? '', endDate: op.endDate ?? '' };
    const issues = validatePhase(me, [...phaseState.values()]);
    const withNames = [...new Set(issues.map((i) => i.with).filter(Boolean))];
    const item: PreviewItem = { entity: 'phase', idempotencyKey: op.idempotencyKey, label, issueCodes: [...new Set(issues.map((i) => i.code))], ...(withNames.length ? { detail: $t("En conflit avec : ") + withNames.map((n) => `« ${n} »`).join(', ') } : {}) };
    if (issues.length) { pv.rejected.push(item); pv.resolved.push({ op, existingId: existing?.id ?? null, category: 'rejected' }); restoreRejected(existing); continue; }
    phaseState.set(tmpId, me);
    (existing ? pv.updated : pv.created).push(item);
    pv.resolved.push({ op, existingId: existing?.id ?? null, category: existing ? 'update' : 'create' });
  }
  return pv;
}

export interface Mutations { puts: { coll: 'planned' | 'phases' | 'exchanges'; rec: PlannedSession | TrainingPhase | CoachExchange }[]; deletes: { coll: 'planned' | 'phases'; id: string }[] }

export function applyPreview(data: AppData, pv: Preview, plan: CoachPlan, hash: string): { mutations: Mutations; exchange: CoachExchange } {
  const now = nowIso();
  const exchangeId = newId();
  const m: Mutations = { puts: [], deletes: [] };
  for (const r of pv.resolved) {
    if (r.category === 'noop' || r.category === 'rejected') continue;
    if (r.category === 'delete') { m.deletes.push({ coll: r.op.entity === 'session' ? 'planned' : 'phases', id: r.existingId! }); continue; }
    if (r.op.entity === 'session') {
      const o = r.op;
      const prev = r.existingId ? data.planned[r.existingId] : undefined;
      m.puts.push({ coll: 'planned', rec: { id: r.existingId ?? newId(), updatedAt: now, discipline: o.discipline!, plannedDate: o.plannedDate!, title: o.title, notes: o.notes, origin: 'coach', idempotencyKey: prev?.idempotencyKey ?? (o.idempotencyKey.startsWith('session:') ? null : o.idempotencyKey), coachExchangeId: exchangeId, blocks: o.blocks, createdAt: prev?.createdAt ?? now, editedAt: null } });
    } else {
      const o = r.op;
      const prev = r.existingId ? data.phases[r.existingId] : undefined;
      m.puts.push({ coll: 'phases', rec: { id: r.existingId ?? newId(), updatedAt: now, label: o.label!.trim(), phase: o.phase, startDate: o.startDate!, endDate: o.endDate!, intent: o.intent, objective: o.objective, notes: o.notes, idempotencyKey: prev?.idempotencyKey ?? (o.idempotencyKey.startsWith('phase:') ? null : o.idempotencyKey), coachExchangeId: exchangeId } });
    }
  }
  const exchange: CoachExchange = {
    id: exchangeId, updatedAt: now, direction: 'import', schemaVersion: SCHEMA, occurredAt: now, status: 'applied',
    operationCount: pv.created.length + pv.updated.length + pv.deleted.length, payloadHash: hash, planValidUntil: plan.planValidUntil,
    importSummary: { created: pv.created, updated: pv.updated, deleted: pv.deleted, rejected: pv.rejected, noop: pv.noop, malformedCount: pv.malformed }, error: null,
  };
  m.puts.push({ coll: 'exchanges', rec: exchange });
  return { mutations: m, exchange };
}

/** Un fichier déjà importé (même empreinte) : signalé avant application. */
export function alreadyImported(data: AppData, hash: string): CoachExchange | null {
  return liveRecords(data.exchanges).find((e) => e.direction === 'import' && e.payloadHash === hash) ?? null;
}

export const PARSE_ERROR_TEXT = {
  JSON_INVALID: $t("Ce fichier n’est pas un JSON valide."),
  SCHEMA_VERSION_UNSUPPORTED: $t("Format de fichier non reconnu. Cette version de l’app attend \"ironapp/1\"."),
  STRUCTURE_INVALID: $t("Le fichier ne correspond pas à la forme attendue d’un plan coach."),
};

export function lastPlanValidity(data: AppData): string | null {
  return liveRecords(data.exchanges).filter((e) => e.direction === 'import').sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1))[0]?.planValidUntil ?? null;
}

