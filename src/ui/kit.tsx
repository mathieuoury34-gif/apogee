// Composants partagés (planche Système de PEAnalyze, adaptés à Apogée)
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { $t } from '../i18n';
import { Icon, Logo } from './icons';
import { back, closeSheet, navigate, tabOf, useRoute, type Tab } from './router';
import { usePrefs } from '../data/store';
import { useSync } from '../data/sync';
import { native } from '../native/bridge';
import { runHealthSync, useHealth } from '../native/healthSync';
import { dateTimeFr, dayTitle, MONTHS_TITLE, DISCIPLINE_ICON, dvar } from './format';
import type { Discipline } from '../domain/types';
import { SPORT_GROUPS, SUB_SPORTS, subSportOf } from '../domain/subsports';

// ------------------------------------------------------------------ mesure
export function useWidth<T extends HTMLElement>(fallback = 326): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = () => setW(Math.max(200, Math.round(el.getBoundingClientRect().width)));
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

export function useScrolled(threshold = 20): boolean {
  const [s, setS] = useState(false);
  useEffect(() => {
    let raf = 0;
    const on = () => { raf = 0; setS(window.scrollY >= threshold); };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(on); };
    on();
    window.addEventListener('scroll', schedule, { passive: true });
    return () => { window.removeEventListener('scroll', schedule); if (raf) cancelAnimationFrame(raf); };
  }, [threshold]);
  return s;
}

// ------------------------------------------------------------------ en-têtes
export function useUpdatedText(): string {
  const prefs = usePrefs();
  const sync = useSync();
  if (native.hasHealth() && prefs.healthLastRun) return $t('Montre lue le {d}', { d: dateTimeFr(prefs.healthLastRun) });
  if (sync.user && sync.lastSync) return $t('Synchronisé le {d}', { d: dateTimeFr(sync.lastSync) });
  if (sync.user) return $t('Synchronisation…');
  return $t('Données enregistrées sur cet appareil');
}

export function AppHeader({ title }: { title: string }) {
  const compact = useScrolled();
  const updated = useUpdatedText();
  const health = useHealth();
  const sync = useSync();
  const busy = health.running || sync.state === 'syncing';
  const showRefresh = native.hasHealth();
  return (
    <header className={'app-header' + (compact ? ' compact' : '')} data-component="AppHeader">
      <div className="bar">
        <div className="titles">
          <h1>{title}</h1>
          <span className="updated">{updated}</span>
        </div>
        <div className="actions">
          {showRefresh && (
            <button type="button" className={'icon-btn' + (busy ? ' spin' : '')} aria-label={$t('Lire la montre (Health Connect)')} onClick={() => { runHealthSync().then((r) => r && showToast(r.inserted || r.updated ? $t('{n} séance(s) nouvelle(s) ou complétée(s)', { n: r.inserted + r.updated }) : $t('Rien de nouveau sur la montre'))); }} disabled={busy}>
              <Icon name="refresh" />
            </button>
          )}
          {!showRefresh && sync.state === 'syncing' && <span className="icon-btn spin neutral" aria-label={$t('Synchronisation')}><Icon name="cloud" /></span>}
          <a href="#/parametres" className="icon-btn" aria-label={$t('Paramètres')} onClick={(e) => { e.preventDefault(); navigate('/parametres'); }}>
            <Icon name="settings" />
          </a>
        </div>
      </div>
    </header>
  );
}

export function SubHeader({ title, fallback, close, bordered, right }: { title: string; fallback: string; close?: boolean; bordered?: boolean; right?: ReactNode }) {
  return (
    <header className={'sub-header' + (bordered ? ' bordered' : '')}>
      <div className="bar">
        <button type="button" className={'icon-btn' + (close ? ' neutral' : '')} aria-label={close ? $t('Fermer sans enregistrer') : $t('Retour')} onClick={() => back(fallback)}>
          <Icon name={close ? 'close' : 'back'} />
        </button>
        <h1>{title}</h1>
        {right || <span />}
      </div>
    </header>
  );
}

/** Bandeau d'erreur : synchronisation cloud ou lecture de la montre (T0-02). */
export function ErrorBanner() {
  const sync = useSync();
  const health = useHealth();
  const msg = health.error ? $t('Lecture de la montre impossible : {e}', { e: health.error }) : sync.state === 'error' ? sync.error : '';
  if (!msg) return null;
  return (
    <div role="alert" className="banner-error">
      <Icon name="alert" size={20} />
      <span>{msg}</span>
      <button type="button" onClick={() => navigate('/parametres')}>{$t('Paramètres')}</button>
    </div>
  );
}

// ------------------------------------------------------------------ sous-navigation
export function SubNav({ items, label, children, bordered }: { items: { to: string; label: string }[]; label: string; children?: ReactNode; bordered?: boolean }) {
  const route = useRoute();
  return (
    <div className={'subnav' + (bordered ? ' bordered' : '')}>
      <nav aria-label={label} className="seg" data-component="SegmentedControl">
        {items.map((it) => (
          <a key={it.to} href={'#' + it.to} aria-current={route.path === it.to ? 'page' : undefined}
            onClick={(e) => { e.preventDefault(); if (route.path !== it.to) navigate(it.to, { replace: true }); }}>
            {it.label}
          </a>
        ))}
      </nav>
      {children}
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: { value: T; options: [T, string][]; onChange: (v: T) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="seg" data-component="SegmentedControl">
      {options.map(([id, l]) => (
        <button key={id} type="button" aria-pressed={value === id} onClick={() => onChange(id)}>{l}</button>
      ))}
    </div>
  );
}

export function ChipGroup<T extends string>({ value, options, onChange, label, className }: { value: T; options: [T, ReactNode][]; onChange: (v: T) => void; label: string; className?: string }) {
  return (
    <div role="group" aria-label={label} className={className ?? 'row wrap'} style={className ? undefined : { gap: 'var(--space-6)' }}>
      {options.map(([id, l]) => (
        <button key={id} type="button" className="chip" aria-pressed={value === id} onClick={() => onChange(id)}>{l}</button>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ navigation principale
const TABS: { id: Exclude<Tab, 'none'>; label: string; to: string }[] = [
  { id: 'accueil', label: $t("Accueil"), to: '/accueil' },
  { id: 'calendrier', label: $t("Calendrier"), to: '/calendrier' },
  { id: 'seances', label: $t("Séances"), to: '/seances' },
  { id: 'progression', label: $t("Progression"), to: '/progression' },
  { id: 'coach', label: $t("Coach"), to: '/coach' },
];

export function TabBar() {
  const route = useRoute();
  const active = tabOf(route.path);
  const go = (to: string) => (e: React.MouseEvent) => { e.preventDefault(); if (route.path !== to) navigate(to); };
  return (
    <>
      <nav aria-label={$t('Navigation principale')} className="tabbar" data-component="TabBar">
        {TABS.map((t) => (
          <a key={t.id} href={'#' + t.to} aria-current={active === t.id ? 'page' : undefined} onClick={go(t.to)}>
            <span className="pill"><Icon name={t.id} /></span>
            {$t(t.label)}
          </a>
        ))}
      </nav>
      <aside className="sidenav" aria-label={$t('Navigation principale')}>
        <Logo size={20} />
        <nav>
          {TABS.map((t) => (
            <a key={t.id} href={'#' + t.to} aria-current={active === t.id ? 'page' : undefined} onClick={go(t.to)}>
              <Icon name={t.id} />{$t(t.label)}
            </a>
          ))}
          <a href="#/parametres" aria-current={route.path.startsWith('/parametres') ? 'page' : undefined} onClick={go('/parametres')}>
            <Icon name="settings" />{$t('Paramètres')}
          </a>
        </nav>
        <SyncFoot />
      </aside>
    </>
  );
}

function SyncFoot() {
  const updated = useUpdatedText();
  return <div className="foot">{updated}</div>;
}

export function Fab({ onClick, label = $t('Ajouter une séance') }: { onClick: () => void; label?: string }) {
  return (
    <button type="button" className="fab" aria-label={label} onClick={onClick} data-component="Button.fab">
      <Icon name="plus" />
    </button>
  );
}

// ------------------------------------------------------------------ feuilles
/** Les gestes dans une feuille ne doivent pas remonter à l'écran dessous (un balayage dans le calendrier de la feuille changeait la semaine de l'écran). */
const stopTouch = (e: { stopPropagation(): void }) => e.stopPropagation();

export function Sheet({ title, children, footer, full, onClose = closeSheet, head }: { title: string; children: ReactNode; footer?: ReactNode; full?: boolean; onClose?: () => void; head?: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close.current(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; prev?.focus?.(); };
  }, []);
  return (
    <>
      <div className="overlay" onClick={onClose} onTouchStart={stopTouch} onTouchEnd={stopTouch} aria-hidden="true" />
      <section ref={ref} onTouchStart={stopTouch} onTouchEnd={stopTouch} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className={'sheet' + (full ? ' full' : '')} data-component={full ? 'BottomSheet.full' : 'BottomSheet'} style={{ outline: 'none' }}>
        <span className="handle" aria-hidden="true" />
        <div className="sheet-head" style={full ? { borderBottom: '1px solid var(--divider-minimal)' } : undefined}>
          <div className="between">
            <h2 className="t-h2">{title}</h2>
            <button type="button" className="icon-btn neutral" aria-label={$t('Fermer')} onClick={onClose} style={{ marginRight: 'calc(-1 * var(--space-10))' }}>
              <Icon name="close" />
            </button>
          </div>
          {head}
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </section>
    </>
  );
}

// ------------------------------------------------------------------ toasts
interface ToastState { id: number; text: string; undo?: () => void; error?: boolean }
let toast: ToastState | null = null;
let toastTimer: ReturnType<typeof setTimeout> | undefined;
const toastListeners = new Set<() => void>();
export function showToast(text: string, opts: { undo?: () => void; error?: boolean } = {}) {
  toast = { id: Date.now(), text, ...opts };
  toastListeners.forEach((l) => l());
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast = null; toastListeners.forEach((l) => l()); }, opts.undo ? 6000 : 3500);
}
export function ToastHost() {
  const t = useSyncExternalStore((l) => { toastListeners.add(l); return () => toastListeners.delete(l); }, () => toast);
  if (!t) return null;
  return (
    <div role="status" className={'toast' + (t.error ? ' error' : '')} key={t.id} data-component="Toast">
      <Icon name={t.error ? 'alert' : 'success'} />
      <span className="t-strong">{t.text}</span>
      {t.undo ? <button type="button" onClick={() => { t.undo!(); toast = null; toastListeners.forEach((l) => l()); }}>{$t('Annuler')}</button> : <span />}
    </div>
  );
}

// ------------------------------------------------------------------ petits éléments
/** Pastille ronde de discipline (icône dans un disque teinté). */
export function DiscIcon({ d, size = 40, style, sub }: { d: Discipline; size?: number; style?: React.CSSProperties; sub?: string | null }) {
  const ss = d === 'OTHER' ? subSportOf(sub) : null;
  return (
    <span className="disc-icon" style={{ width: size, height: size, background: `var(--d-${d}-bg)`, color: dvar(d), ...style }} aria-hidden="true">
      <Icon name={ss ? ss.icon : DISCIPLINE_ICON[d]} size={Math.round(size * 0.5)} />
    </span>
  );
}

/** Banque de pictogrammes pour les séances « Autre » : touche un pictogramme pour le choisir, touche-le encore (ou « Générique ») pour revenir au pictogramme par défaut. */
export function SportPicker({ value, onChange }: { value: string | null; onChange: (id: string | null) => void }) {
  return (
    <div className="sport-picker" role="group" aria-label={$t("Pictogramme de l’activité")}>
      <button type="button" className="sport-btn" aria-pressed={!value} onClick={() => onChange(null)}><Icon name="other" size={26} /><span>{$t("Générique")}</span></button>
      {SPORT_GROUPS.map((g) => (
        <div key={g.id} className="sport-group">
          <span className="overline">{g.label}</span>
          <div className="sport-grid">
            {SUB_SPORTS.filter((x) => x.group === g.id).map((x) => (
              <button key={x.id} type="button" className="sport-btn" aria-pressed={value === x.id} onClick={() => onChange(value === x.id ? null : x.id)}>
                <Icon name={x.icon} size={26} /><span>{x.label}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function DiscDot({ d, size = 10 }: { d: Discipline; size?: number }) {
  return <span className="dot" style={{ width: size, height: size, background: dvar(d) }} />;
}

export function Switch({ checked, onChange, labelledBy, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; labelledBy?: string; label?: string; disabled?: boolean }) {
  return <button type="button" role="switch" className="switch" aria-checked={checked} aria-labelledby={labelledBy} aria-label={label} disabled={disabled} onClick={() => onChange(!checked)} data-component="Toggle" />;
}

/** Préférence d'affichage « inclure Autre » dans les volumes (éteinte par défaut), partagée entre Séances › Statistiques et Progression. */
const OTHER_KEY = 'apogee:withOther';
const otherListeners = new Set<() => void>();
const readOther = () => { try { return localStorage.getItem(OTHER_KEY) === '1'; } catch { return false; } };
let withOther = readOther();
export function useWithOther(): [boolean, (v: boolean) => void] {
  const v = useSyncExternalStore((l) => { otherListeners.add(l); return () => otherListeners.delete(l); }, () => withOther);
  return [v, (x: boolean) => { withOther = x; try { localStorage.setItem(OTHER_KEY, x ? '1' : '0'); } catch { /* sans stockage : valable pour la session */ } otherListeners.forEach((l) => l()); }];
}
export function OtherToggle() {
  const [on, set] = useWithOther();
  return (
    <label className="row other-toggle" style={{ gap: 'var(--space-8)', justifyContent: 'space-between' }}>
      <span className="t-caption c-neutral" id="other-lbl">{$t("Inclure « Autre » (randonnée, kayak…)")}</span>
      <Switch checked={on} onChange={set} labelledBy="other-lbl" />
    </label>
  );
}

export function Empty({ icon = 'inbox', title, text, action }: { icon?: string; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="empty" data-component="EmptyState">
      <span className="empty-icon"><Icon name={icon} size={40} /></span>
      <h2 className="t-h3">{title}</h2>
      <p className="c-neutral">{text}</p>
      {action}
    </div>
  );
}

/** Balayage horizontal : à gauche = suivant, à droite = précédent. Ignore les gestes surtout verticaux (défilement). */
export function useSwipe(onNext: () => void, onPrev: () => void) {
  const start = useRef<{ x: number; y: number; t: number } | null>(null);
  return {
    onTouchStart: (e: React.TouchEvent) => { const t = e.touches[0]; start.current = e.touches.length === 1 ? { x: t.clientX, y: t.clientY, t: Date.now() } : null; },
    onTouchEnd: (e: React.TouchEvent) => {
      const s0 = start.current; start.current = null;
      if (!s0) return;
      const t = e.changedTouches[0];
      const dx = t.clientX - s0.x, dy = t.clientY - s0.y;
      if (Math.abs(dx) < 55 || Math.abs(dy) > Math.abs(dx) * 0.6 || Date.now() - s0.t > 700) return;
      if (dx < 0) onNext(); else onPrev();
    },
  };
}

/** Calendrier (DatePicker) : mois navigable, en-tête vert. */
export function DatePicker({ value, onChange, label = $t('Date') }: { value: string; onChange: (iso: string) => void; label?: string }) {
  const [view, setView] = useState(value.slice(0, 7));
  const y = +view.slice(0, 4), m = +view.slice(5, 7);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const offset = (first.getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const MONTHS = MONTHS_TITLE;
  const shift = (k: number) => { let mm = m + k, yy = y; if (mm < 1) { mm = 12; yy--; } if (mm > 12) { mm = 1; yy++; } setView(yy + '-' + String(mm).padStart(2, '0')); };
  const today = new Date().toISOString().slice(0, 10);
  const long = dayTitle(value);
  const swipe = useSwipe(() => shift(1), () => shift(-1));
  return (
    <div className="datepicker" data-component="DatePicker" {...swipe}>
      <div className="head">
        <span className="overline">{label}</span>
        <span className="t-h2">{long}</span>
      </div>
      <div className="body">
        <div className="month">
          <button type="button" className="icon-btn" aria-label={$t('Mois précédent')} onClick={() => shift(-1)}><Icon name="back" size={20} /></button>
          <span>{MONTHS[m - 1]} {y}</span>
          <button type="button" className="icon-btn" aria-label={$t('Mois suivant')} onClick={() => shift(1)}><Icon name="next" size={20} /></button>
        </div>
        <div className="grid">
          {$t('L,M,M,J,V,S,D').split(',').map((d, i) => <span key={i}>{d}</span>)}
          {Array.from({ length: offset }, (_, i) => <button key={'b' + i} type="button" disabled tabIndex={-1} />)}
          {Array.from({ length: days }, (_, i) => {
            const iso = view + '-' + String(i + 1).padStart(2, '0');
            return (
              <button key={iso} type="button" aria-pressed={iso === value} className={iso === today ? 'today' : undefined} onClick={() => onChange(iso)}>{i + 1}</button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function Hero({ label, value, chip, children, className = '' }: { label: string; value: string; chip?: string; children?: ReactNode; className?: string }) {
  return (
    <section aria-label={label} className={'hero ' + className} data-component="Card.hero">
      <div className="stack-4">
        <span className="overline">{label}</span>
        <span className="t-display">{value}</span>
        {chip && <span className="row"><span className="chip-reverse">{chip}</span></span>}
      </div>
      {children}
    </section>
  );
}
