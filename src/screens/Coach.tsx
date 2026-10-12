// Coach — échange avec un assistant IA au format ironapp/1 (inchangé) :
//   1. constat factuel de la charge ;
//   2. export du dossier-athlète (séances jointes au choix) → fichier JSON ou presse-papiers ;
//   3. import du plan renvoyé, avec aperçu catégorisé avant application ;
//   4. journal des échanges.
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppHeader, ChipGroup, DiscIcon, Empty, ErrorBanner, Sheet, showToast } from '../ui/kit';
import { Icon } from '../ui/icons';
import { navigate, useRoute } from '../ui/router';
import { useCalc } from '../data/store';
import { applyCoach, logExport } from '../data/actions';
import { addDays } from '../domain/dates';
import { ISSUE_TEXT, type DraftIssueCode } from '../domain/blocks';
import { alreadyImported, buildDossier, ISSUE_LABEL, lastPlanValidity, PARSE_ERROR_TEXT, parsePlan, preview, type CoachPlan, type Preview } from '../domain/coach';
import { liveRecords, METHOD_LABEL, sessionDay } from '../domain/load';
import type { ActualSession, PreviewItem } from '../domain/types';
import { native } from '../native/bridge';
import { dateFr, dateTimeFr, dayTitle, DISCIPLINE_LABEL, duration, num, signed } from '../ui/format';

export function CoachScreen() {
  const route = useRoute();
  const { data, d } = useCalc();
  const [weeks, setWeeks] = useState<'1' | '2' | '4' | '8'>('2');
  const [importOpen, setImportOpen] = useState(route.query.get('importer') === '1');
  const from = addDays(d.today, -7 * +weeks + 1);
  const candidates = useMemo(() => liveRecords(data.actual).filter((s) => sessionDay(s) >= from).sort((a, b) => (a.startAt < b.startAt ? 1 : -1)), [data.actual, from]);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const selected = candidates.filter((s) => !excluded.has(s.id));
  const c = d.constat;
  const valid = lastPlanValidity(data);
  const exchanges = liveRecords(data.exchanges).sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));
  const toggle = (id: string) => setExcluded((x) => { const n = new Set(x); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const dossierText = () => JSON.stringify(buildDossier(data, d, selected.map((s) => s.id)), null, 2);
  const exportFile = async () => {
    try {
      await native.saveFile(`ironapp-dossier-${d.today}.json`, new Blob([dossierText()], { type: 'application/json' }));
      logExport(selected);
      showToast('Dossier exporté — transmets-le à ton coach IA');
    } catch (e) { showToast('Export impossible : ' + (e as Error).message, { error: true }); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(dossierText()); logExport(selected); showToast('Dossier copié — colle-le dans la conversation avec ton coach'); }
    catch { showToast('Copie impossible sur ce navigateur : utilise « Exporter le fichier ».', { error: true }); }
  };
  return (
    <div className="screen" data-screen="coach">
      <AppHeader title="Coach" />
      <ErrorBanner />
      <main className="content dgrid">
        <section className="card g12 dspan-5 hero-soft" aria-label="Constat">
          <div className="row" style={{ gap: 'var(--space-12)' }}>
            <span className="assistant-icon" aria-hidden="true"><Icon name="coach" size={24} /></span>
            <span className="stack grow"><h2>Le constat</h2><span className="t-caption c-moderate">ce que le coach recevra, sans interprétation</span></span>
          </div>
          <dl className="kv">
            <dt>Forme de fond</dt><dd>{c.fitness === null ? '—' : num(c.fitness, 0)} <span className="c-moderate">{c.fitnessDelta === null ? '' : `(${signed(c.fitnessDelta, 0)} / 7 j)`}</span></dd>
            <dt>Fatigue</dt><dd>{c.fatigue === null ? '—' : num(c.fatigue, 0)} <span className="c-moderate">{c.fatigueDelta === null ? '' : `(${signed(c.fatigueDelta, 0)} / 7 j)`}</span></dd>
            <dt>Fraîcheur</dt><dd>{c.freshness === null ? '—' : signed(c.freshness, 0)}</dd>
            <dt>Rapport aigu / chronique</dt><dd>{c.acuteChronicRatio === null ? 'après 28 jours' : num(c.acuteChronicRatio, 2)}</dd>
          </dl>
          <div className={'note' + (valid && valid < d.today ? ' note-warning' : '')}><Icon name="calendar" size={20} /><span>{valid ? (valid < d.today ? `Le dernier plan a expiré le ${dateFr(valid)}. Il est temps de redemander un plan.` : `Plan en cours valable jusqu’au ${dateFr(valid)}.`) : 'Aucun plan importé pour l’instant.'}</span></div>
        </section>

        <section className="card g12 dspan-7" aria-labelledby="h-export">
          <div className="between wrap" style={{ gap: 'var(--space-8)' }}>
            <h2 id="h-export">1. Envoyer le dossier</h2>
            <ChipGroup label="Séances jointes" value={weeks} onChange={(v) => { setWeeks(v); setExcluded(new Set()); }} options={[['1', '1 sem.'], ['2', '2 sem.'], ['4', '4 sem.'], ['8', '8 sem.']]} />
          </div>
          <p className="t-caption c-neutral">Profil, course, indicateurs, périodisation, charge, séances prévues des 8 prochaines semaines et les séances cochées ci-dessous, avec la consigne de réponse au format ironapp/1.</p>
          {candidates.length ? (
            <ul className="check-list" aria-label="Séances jointes">
              {candidates.map((s) => <SessionCheck key={s.id} s={s} on={!excluded.has(s.id)} onToggle={() => toggle(s.id)} load={d.loads.get(s.id)} />)}
            </ul>
          ) : <p className="t-caption c-moderate">Aucune séance sur la période : le dossier part sans séances jointes.</p>}
          <div className="row wrap" style={{ gap: 'var(--space-8)' }}>
            <button type="button" className="btn btn-primary" onClick={exportFile}><Icon name="download" size={18} />Exporter le fichier ({selected.length})</button>
            <button type="button" className="btn btn-secondary" onClick={copy}><Icon name="copy" size={18} />Copier</button>
          </div>
        </section>

        <section className="card g12 dspan-7" aria-labelledby="h-import">
          <h2 id="h-import">2. Importer le plan</h2>
          <p className="t-caption c-neutral">Colle la réponse du coach ou ouvre le fichier qu’il a produit. Rien n’est modifié avant ta validation de l’aperçu.</p>
          <button type="button" className="btn btn-primary" style={{ alignSelf: 'flex-start' }} onClick={() => setImportOpen(true)}><Icon name="upload" size={18} />Importer un plan</button>
        </section>

        <section className="card g8 dspan-5" aria-labelledby="h-journal">
          <h2 id="h-journal">Journal des échanges</h2>
          {!exchanges.length ? <p className="t-caption c-moderate">Aucun échange pour l’instant.</p> : (
            <ul className="tile-list divided">
              {exchanges.slice(0, 12).map((e) => (
                <li key={e.id} className="settings-row" style={{ cursor: 'default' }}>
                  <Icon name={e.direction === 'export' ? 'upload' : 'download'} size={20} style={{ color: 'var(--text-neutral)' }} />
                  <span className="stack"><span className="t-strong">{e.direction === 'export' ? `Dossier envoyé · ${e.operationCount} séance(s)` : e.status === 'applied' ? `Plan importé · ${e.operationCount} opération(s)` : 'Import refusé'}</span>
                    <span className="t-caption c-moderate">{dateTimeFr(e.occurredAt)}{e.importSummary ? ` · ${e.importSummary.created.length} créée(s), ${e.importSummary.updated.length} modifiée(s), ${e.importSummary.deleted.length} supprimée(s)${e.importSummary.rejected.length ? `, ${e.importSummary.rejected.length} rejetée(s)` : ''}` : ''}{e.planValidUntil ? ` · valable jusqu’au ${dateFr(e.planValidUntil)}` : ''}</span></span>
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
        <DiscIcon d={s.discipline} size={28} />
        <span className="stack grow" style={{ minWidth: 0 }}><span className="t-caption-strong ellipsis">{DISCIPLINE_LABEL[s.discipline]} · {dayTitle(sessionDay(s))}</span><span className="t-legal c-moderate">{duration(s.durationSec)}{s.rpe ? ' · RPE ' + s.rpe : ' · sans ressenti'}{s.comment ? ' · commentaire' : ''}</span></span>
        <span className="t-caption c-moderate nowrap">{load?.load !== null && load?.load !== undefined ? num(load.load, 0) : '—'}</span>
      </label>
    </li>
  );
}

function ImportSheet({ onClose }: { onClose: () => void }) {
  const { data } = useCalc();
  const [text, setText] = useState('');
  const [state, setState] = useState<{ plan: CoachPlan; pv: Preview; hash: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => { setState(null); setError(null); }, [text]);
  const analyse = (raw: string) => {
    const r = parsePlan(raw);
    if (!r.ok) { setError(PARSE_ERROR_TEXT[r.code] + (r.code === 'SCHEMA_VERSION_UNSUPPORTED' && r.found ? ` (trouvé : ${String(r.found)})` : '')); return; }
    const dup = alreadyImported(data, r.hash);
    if (dup) { setError(`Ce plan a déjà été importé le ${dateTimeFr(dup.occurredAt)}.`); return; }
    setState({ plan: r.plan, pv: preview(data, r.plan, r.malformed), hash: r.hash });
  };
  const apply = () => {
    if (!state) return;
    applyCoach(state.pv, state.plan, state.hash);
    const n = state.pv.created.length + state.pv.updated.length + state.pv.deleted.length;
    onClose();
    showToast(`Plan appliqué : ${n} changement(s)`);
    navigate('/calendrier');
  };
  const pv = state?.pv;
  const changes = pv ? pv.created.length + pv.updated.length + pv.deleted.length : 0;
  return (
    <Sheet title={pv ? 'Aperçu du plan' : 'Importer un plan'} onClose={onClose} full
      footer={pv ? (
        <div className="row" style={{ gap: 'var(--space-8)' }}><button type="button" className="btn btn-secondary" onClick={() => setState(null)}>Retour</button><button type="button" className="btn btn-primary grow" disabled={!changes} onClick={apply}>Appliquer {changes} changement(s)</button></div>
      ) : <button type="button" className="btn btn-primary block" disabled={!text.trim()} onClick={() => analyse(text)}>Analyser</button>}>
      <div className="stack" style={{ gap: 'var(--space-16)', paddingBottom: 'var(--space-16)' }}>
        {!pv ? (
          <>
            <label className="field"><span className="lbl">Réponse du coach (JSON)</span><textarea className="input textarea mono" rows={10} value={text} placeholder={'{ "schemaVersion": "ironapp/1", "operations": [ … ] }'} onChange={(e) => setText(e.target.value)} /></label>
            <button type="button" className="btn btn-tertiary" style={{ alignSelf: 'flex-start' }} onClick={() => file.current?.click()}><Icon name="folder" size={18} />Ouvrir un fichier</button>
            <input ref={file} type="file" accept=".json,application/json,text/plain" hidden onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return; const t = await f.text(); setText(t); setTimeout(() => analyse(t), 0); }} />
            {error && <div className="note note-critical" role="alert"><Icon name="alert" size={20} /><span>{error}</span></div>}
          </>
        ) : (
          <>
            {state!.plan.planValidUntil && <p className="t-caption c-neutral">Plan valable jusqu’au {dateFr(state!.plan.planValidUntil)}.</p>}
            <PreviewGroup title="Créées" tone="success" items={pv.created} />
            <PreviewGroup title="Modifiées" tone="info" items={pv.updated} />
            <PreviewGroup title="Supprimées" tone="warning" items={pv.deleted} />
            <PreviewGroup title="Rejetées" tone="critical" items={pv.rejected} />
            <PreviewGroup title="Sans changement" tone="neutral" items={pv.noop} />
            {pv.malformed > 0 && <div className="note note-warning"><Icon name="alert" size={20} /><span>{pv.malformed} opération(s) illisible(s) ignorée(s).</span></div>}
            {!changes && <div className="note"><Icon name="info" size={20} /><span>Ce plan n’apporte aucun changement applicable.</span></div>}
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
            <span className="t-caption-strong">{it.entity === 'phase' ? 'Bloc · ' : ''}{it.label || it.idempotencyKey}</span>
            {[...new Set(it.issueCodes)].map((c) => <span key={c} className="t-legal c-critical">{c in ISSUE_TEXT ? ISSUE_TEXT[c as DraftIssueCode] : ISSUE_LABEL(c)}</span>)}
            {it.detail && <span className="t-legal c-moderate">{it.detail}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

export { Empty };
