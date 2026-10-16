// Coach — échange avec un assistant IA au format ironapp/1 (inchangé) :
//   1. export du dossier-athlète (séances jointes au choix) → fichier JSON ou presse-papiers ;
//   2. import du plan renvoyé, avec aperçu catégorisé avant application ;
//   3. journal des échanges.
import { $t } from '../i18n';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppHeader, ChipGroup, DiscIcon, Empty, ErrorBanner, Sheet, showToast } from '../ui/kit';
import { Icon } from '../ui/icons';
import { navigate, useRoute } from '../ui/router';
import { getData, useCalc } from '../data/store';
import { applyCoach, logExport } from '../data/actions';
import { dossierMessage, importDossier, restoreBackup } from '../data/backup';
import { isDossier, type Dossier } from '../domain/dossier';
import { addDays } from '../domain/dates';
import { ISSUE_TEXT, type DraftIssueCode } from '../domain/blocks';
import { alreadyImported, buildDossier, ISSUE_LABEL, lastPlanValidity, PARSE_ERROR_TEXT, parsePlan, preview, type CoachPlan, type Preview } from '../domain/coach';
import { liveRecords, METHOD_LABEL, sessionDay } from '../domain/load';
import type { ActualSession, PreviewItem } from '../domain/types';
import { native } from '../native/bridge';
import { dateFr, dateTimeFr, dayTitle, DISCIPLINE_LABEL, sessionLabel, duration, num, signed } from '../ui/format';

export function CoachScreen() {
  const route = useRoute();
  const { data, d } = useCalc();
  const [weeks, setWeeks] = useState<'1' | '2' | '4' | '8'>('2');
  const [importOpen, setImportOpen] = useState(route.query.get('importer') === '1');
  const from = addDays(d.today, -7 * +weeks + 1);
  const candidates = useMemo(() => liveRecords(data.actual).filter((s) => sessionDay(s) >= from).sort((a, b) => (a.startAt < b.startAt ? 1 : -1)), [data.actual, from]);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const selected = candidates.filter((s) => !excluded.has(s.id));
  const valid = lastPlanValidity(data);
  const exchanges = liveRecords(data.exchanges).sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));
  const toggle = (id: string) => setExcluded((x) => { const n = new Set(x); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const dossierText = () => JSON.stringify(buildDossier(data, d, selected.map((s) => s.id), new Date(), from), null, 2);
  const exportFile = async () => {
    try {
      await native.saveFile(`ironapp-dossier-${d.today}.json`, new Blob([dossierText()], { type: 'application/json' }));
      logExport(selected);
      showToast($t("Dossier exporté — transmets-le à ton coach IA"));
    } catch (e) { showToast($t("Export impossible : ") + (e as Error).message, { error: true }); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(dossierText()); logExport(selected); showToast($t("Dossier copié — colle-le dans la conversation avec ton coach")); }
    catch { showToast($t("Copie impossible sur ce navigateur : utilise « Exporter le fichier »."), { error: true }); }
  };
  return (
    <div className="screen" data-screen="coach">
      <AppHeader title={$t("Coach")} />
      <ErrorBanner />
      <main className="content dgrid">
        {valid !== null && <div className={'note dspan-12' + (valid < d.today ? ' note-warning' : '')}><Icon name="calendar" size={20} /><span>{valid < d.today ? $t("Le dernier plan a expiré le {0}. Il est temps de redemander un plan.", { 0: dateFr(valid) }) : $t("Plan en cours valable jusqu’au {0}.", { 0: dateFr(valid) })}</span></div>}

        <section className="card g12 dspan-7" aria-labelledby="h-export">
          <div className="between wrap" style={{ gap: 'var(--space-8)' }}>
            <h2 id="h-export">{$t("1. Envoyer le dossier")}</h2>
            <ChipGroup label={$t("Séances jointes")} value={weeks} onChange={(v) => { setWeeks(v); setExcluded(new Set()); }} options={[['1', $t("1 sem.")], ['2', $t("2 sem.")], ['4', $t("4 sem.")], ['8', $t("8 sem.")]]} />
          </div>
          <p className="t-caption c-neutral">{$t("Profil, course, indicateurs, périodisation, charge, séances prévues passées et à venir (telles que tu les as modifiées) et les séances cochées ci-dessous, avec la consigne de réponse au format ironapp/1.")}</p>
          {candidates.length ? (
            <ul className="check-list" aria-label={$t("Séances jointes")}>
              {candidates.map((s) => <SessionCheck key={s.id} s={s} on={!excluded.has(s.id)} onToggle={() => toggle(s.id)} load={d.loads.get(s.id)} />)}
            </ul>
          ) : <p className="t-caption c-moderate">{$t("Aucune séance sur la période : le dossier part sans séances jointes.")}</p>}
          <div className="row wrap" style={{ gap: 'var(--space-8)' }}>
            <button type="button" className="btn btn-primary" onClick={exportFile}><Icon name="download" size={18} />{$t("Exporter le fichier (")}{selected.length})</button>
            <button type="button" className="btn btn-secondary" onClick={copy}><Icon name="copy" size={18} />{$t("Copier")}</button>
          </div>
        </section>

        <section className="card g12 dspan-7" aria-labelledby="h-import">
          <h2 id="h-import">{$t("2. Importer le plan")}</h2>
          <p className="t-caption c-neutral">{$t("Colle la réponse du coach ou ouvre le fichier qu’il a produit. Rien n’est modifié avant ta validation de l’aperçu.")}</p>
          <button type="button" className="btn btn-primary" style={{ alignSelf: 'flex-start' }} onClick={() => setImportOpen(true)}><Icon name="upload" size={18} />{$t("Importer un plan")}</button>
        </section>

        <section className="card g8 dspan-5 dgrid-rows2" aria-labelledby="h-journal">
          <h2 id="h-journal">{$t("Journal des échanges")}</h2>
          {!exchanges.length ? <p className="t-caption c-moderate">{$t("Aucun échange pour l’instant.")}</p> : (
            <ul className="tile-list divided">
              {exchanges.slice(0, 12).map((e) => (
                <li key={e.id} className="settings-row" style={{ cursor: 'default' }}>
                  <Icon name={e.direction === 'export' ? 'upload' : 'download'} size={20} style={{ color: 'var(--text-neutral)' }} />
                  <span className="stack"><span className="t-strong">{e.direction === 'export' ? $t("Dossier envoyé · {0} séance(s)", { 0: e.operationCount }) : e.status === 'applied' ? $t("Plan importé · {0} opération(s)", { 0: e.operationCount }) : $t("Import refusé")}</span>
                    <span className="t-caption c-moderate">{dateTimeFr(e.occurredAt)}{e.importSummary ? $t(" · {0} créée(s), {1} modifiée(s), {2} supprimée(s){3}", { 0: e.importSummary.created.length, 1: e.importSummary.updated.length, 2: e.importSummary.deleted.length, 3: e.importSummary.rejected.length ? $t(", {0} rejetée(s)", { 0: e.importSummary.rejected.length }) : '' }) : ''}{e.planValidUntil ? $t(" · valable jusqu’au {0}", { 0: dateFr(e.planValidUntil) }) : ''}</span></span>
                  <span />
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
      {importOpen && <ImportSheet onClose={() => { setImportOpen(false); if (route.query.get('importer')) navigate('/coach', { replace: true }); }} />}
    </div>
  );
}

function SessionCheck({ s, on, onToggle, load }: { s: ActualSession; on: boolean; onToggle: () => void; load?: { load: number | null; method: keyof typeof METHOD_LABEL } }) {
  return (
    <li>
      <label className="check-row">
        <input type="checkbox" checked={on} onChange={onToggle} />
        <DiscIcon d={s.discipline} sub={s.subSport} size={28} />
        <span className="stack grow" style={{ minWidth: 0 }}><span className="t-caption-strong ellipsis">{sessionLabel(s)} · {dayTitle(sessionDay(s))}</span><span className="t-legal c-moderate">{duration(s.durationSec)}{s.rpe ? $t(" · RPE ") + s.rpe : $t(" · sans ressenti")}{s.comment ? $t(" · commentaire") : ''}</span></span>
        <span className="t-caption c-moderate nowrap">{load?.load !== null && load?.load !== undefined ? num(load.load, 0) : '—'}</span>
      </label>
    </li>
  );
}

function ImportSheet({ onClose }: { onClose: () => void }) {
  const { data } = useCalc();
  const [text, setText] = useState('');
  const [state, setState] = useState<{ plan: CoachPlan; pv: Preview; hash: string; dupAt: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { setState(null); setError(null); setDossier(null); }, [text]);
  const takeDossier = () => {
    if (!dossier) return;
    const prev = getData();
    const r = importDossier(dossier);
    onClose();
    showToast(dossierMessage(r), { undo: () => restoreBackup(prev) });
  };
  const analyse = (raw: string) => {
    // un dossier-athlète (celui qu'on envoie au coach) n'est pas un plan : on propose d'en reprendre les séances
    try { const j = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); if (isDossier(j)) { setDossier(j); return; } } catch { /* l'analyse ci-dessous dira pourquoi */ }
    const r = parsePlan(raw);
    if (!r.ok) { setError(PARSE_ERROR_TEXT[r.code] + (r.code === 'SCHEMA_VERSION_UNSUPPORTED' && r.found ? $t(" (trouvé : {0})", { 0: String(r.found) }) : '')); return; }
    const dup = alreadyImported(data, r.hash);
    // déjà importé : on le dit, sans bloquer — réimporter recrée les séances supprimées depuis
    setState({ plan: r.plan, pv: preview(data, r.plan, r.malformed), hash: r.hash, dupAt: dup ? dup.occurredAt : null });
  };
  const apply = () => {
    if (!state) return;
    applyCoach(state.pv, state.plan, state.hash);
    const n = state.pv.created.length + state.pv.updated.length + state.pv.deleted.length;
    onClose();
    showToast($t("Plan appliqué : {0} changement(s)", { 0: n }));
    navigate('/calendrier');
  };
  const pv = state?.pv;
  const changes = pv ? pv.created.length + pv.updated.length + pv.deleted.length : 0;
  return (
    <Sheet title={pv ? $t("Aperçu du plan") : $t("Importer un plan")} onClose={onClose} full
      footer={pv ? (
        <div className="row" style={{ gap: 'var(--space-8)' }}><button type="button" className="btn btn-secondary" onClick={() => setState(null)}>{$t("Retour")}</button><button type="button" className="btn btn-primary grow" disabled={!changes} onClick={apply}>{$t("Appliquer")} {changes} {$t("changement(s)")}</button></div>
      ) : <button type="button" className="btn btn-primary block" disabled={!text.trim()} onClick={() => analyse(text)}>{$t("Analyser")}</button>}>
      <div className="stack" style={{ gap: 'var(--space-16)', paddingBottom: 'var(--space-16)' }}>
        {!pv ? (
          <>
            <label className="field"><span className="lbl">{$t("Réponse du coach (JSON)")}</span><textarea className="input textarea mono" rows={10} value={text} placeholder={$t("{ \"schemaVersion\": \"ironapp/1\", \"operations\": [ … ] }")} onChange={(e) => setText(e.target.value)} /></label>
            <button type="button" className="btn btn-tertiary" style={{ alignSelf: 'flex-start' }} onClick={() => file.current?.click()}><Icon name="folder" size={18} />{$t("Ouvrir un fichier")}</button>
            <input ref={file} type="file" accept=".json,application/json,text/plain" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; const t = await f.text(); setText(t); setTimeout(() => analyse(t), 0); }} />
            {error && <div className="note note-critical" role="alert"><Icon name="alert" size={20} /><span>{error}</span></div>}
            {dossier && (
              <div className="stack-12">
                <div className="note note-warning" role="status"><Icon name="info" size={20} /><span>{$t("Ce fichier est un")} <strong>{$t("dossier-athlète")}</strong> {$t("(celui qu’on envoie au coach), pas un plan. Il contient")} {dossier.recentActualSessions.length} {$t("séance(s) réalisée(s) et")} {(dossier.upcomingPlannedSessions ?? []).length} {$t("séance(s) prévue(s).")}</span></div>
                <button type="button" className="btn btn-primary block" onClick={takeDossier}>{$t("Ajouter à mes données ce qui manque")}</button>
                <span className="t-caption c-moderate">{$t("Rien n’est écrasé : seules les séances absentes sont ajoutées, et les ressentis manquants complétés.")}</span>
              </div>
            )}
          </>
        ) : (
          <>
            {state!.dupAt && <div className="note note-warning" role="status"><Icon name="info" size={20} /><span>{$t("Ce plan a déjà été importé le {0}. Le réappliquer recrée les séances supprimées depuis et remet les autres comme le coach les a écrites.", { 0: dateTimeFr(state!.dupAt) })}</span></div>}
            {state!.plan.planValidUntil && <p className="t-caption c-neutral">{$t("Plan valable jusqu’au")} {dateFr(state!.plan.planValidUntil)}.</p>}
            <PreviewGroup title={$t("Créées")} tone="success" items={pv.created} />
            <PreviewGroup title={$t("Modifiées")} tone="info" items={pv.updated} />
            <PreviewGroup title={$t("Supprimées")} tone="warning" items={pv.deleted} />
            <PreviewGroup title={$t("Rejetées")} tone="critical" items={pv.rejected} />
            <PreviewGroup title={$t("Sans changement")} tone="neutral" items={pv.noop} />
            {pv.malformed > 0 && <div className="note note-warning"><Icon name="alert" size={20} /><span>{pv.malformed} {$t("opération(s) illisible(s) ignorée(s).")}</span></div>}
            {!changes && <div className="note"><Icon name="info" size={20} /><span>{$t("Ce plan n’apporte aucun changement applicable.")}</span></div>}
          </>
        )}
      </div>
    </Sheet>
  );
}

function PreviewGroup({ title, tone, items }: { title: string; tone: 'success' | 'info' | 'warning' | 'critical' | 'neutral'; items: PreviewItem[] }) {
  if (!items.length) return null;
  return (
    <section className="stack-8">
      <h3 className="t-label" style={{ color: tone === 'neutral' ? 'var(--text-moderate)' : `var(--${tone}-text)` }}>{title} · {items.length}</h3>
      <ul className="tile-list divided">
        {items.map((it, i) => (
          <li key={it.idempotencyKey + i} className="stack-4" style={{ padding: 'var(--space-8) 0' }}>
            <span className="t-caption-strong">{it.entity === 'phase' ? $t("Bloc · ") : ''}{it.label || it.idempotencyKey}</span>
            {[...new Set(it.issueCodes)].map((c) => <span key={c} className="t-legal c-critical">{c in ISSUE_TEXT ? ISSUE_TEXT[c as DraftIssueCode] : ISSUE_LABEL(c)}</span>)}
            {it.detail && <span className="t-legal c-moderate">{it.detail}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

export { Empty };
