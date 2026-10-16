// Aide (Paramètres › Aide) : explique toutes les fonctionnalités et tous les calculs, avec recherche.
// Le contenu est dans help-content.ts (français / anglais), aligné sur le code de src/domain.
import { Fragment, useMemo, useState } from 'react';
import { $t, lang } from '../i18n';
import { Icon } from '../ui/icons';
import { SubHeader } from '../ui/kit';
import { useRoute } from '../ui/router';
import { native } from '../native/bridge';
import { APK_FILE, APK_PAGE, HELP, type Block, type HelpSection, type Pair } from './help-content';

const L = (p: Pair) => (lang === 'en' ? p[1] : p[0]);

/** Lien externe : dans l'APK, ouvre le navigateur du téléphone (un lien target=_blank n'y fait rien). */
export function ExtLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <a className={className} href={href} target="_blank" rel="noopener noreferrer" onClick={(e) => { if (native.isApp()) { e.preventDefault(); native.openBrowser(href); } }}>
      {children}
    </a>
  );
}

/** **gras** et `code` dans une ligne de texte. */
function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((s, i) =>
        s.startsWith('**') ? <strong key={i}>{s.slice(2, -2)}</strong>
          : s.startsWith('`') ? <code key={i} className="help-code">{s.slice(1, -1)}</code>
            : <Fragment key={i}>{s}</Fragment>)}
    </>
  );
}

function Blocks({ blocks }: { blocks: Block[] }) {
  return (
    <>
      {blocks.map((b, i) => {
        if (b.t === 'p') return <p key={i} className="help-p"><Inline text={L(b.v)} /></p>;
        if (b.t === 'ul') return <ul key={i} className="help-ul">{b.v.map((x, j) => <li key={j}><Inline text={L(x)} /></li>)}</ul>;
        if (b.t === 'f') return <pre key={i} className="help-f">{L(b.v)}</pre>;
        return (
          <ExtLink key={i} href={b.href} className="help-link">
            <Icon name="download" size={20} /><span>{L(b.v)}</span>
          </ExtLink>
        );
      })}
    </>
  );
}

const textOf = (s: HelpSection) =>
  [L(s.title), ...s.blocks.flatMap((b) => (b.t === 'ul' ? b.v.map(L) : [L(b.v)]))].join(' \n ').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
const norm = (q: string) => q.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

export function HelpScreen() {
  const route = useRoute();
  const first = route.query.get('rubrique') ?? '';
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Set<string>>(new Set(first ? [first] : ['start']));
  const index = useMemo(() => HELP.map((s) => ({ s, text: textOf(s) })), [lang]); // eslint-disable-line react-hooks/exhaustive-deps
  const words = norm(q).split(/\s+/).filter(Boolean);
  const shown = words.length ? index.filter((x) => words.every((w) => x.text.includes(w))).map((x) => x.s) : HELP;
  const toggle = (id: string) => setOpen((o) => { const n = new Set(o); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <div className="screen" data-screen="aide">
      <SubHeader title={$t("Aide")} fallback="/parametres" />
      <main className="content form-narrow stack-16">
        <p className="t-caption c-neutral">{$t("Tout ce que fait l’application et la façon dont chaque chiffre est calculé. Cherche un mot (RPE, TRIMP, APK, rappel…) ou ouvre une rubrique.")}</p>
        <label className="help-search">
          <Icon name="search" size={20} style={{ color: 'var(--text-moderate)' }} />
          <input className="help-search-in" type="search" value={q} placeholder={$t("Rechercher dans l’aide")} aria-label={$t("Rechercher dans l’aide")} onChange={(e) => setQ(e.target.value)} />
        </label>
        <ExtLink href={APK_PAGE} className="help-link help-apk">
          <Icon name="download" size={20} /><span>{$t("Télécharger l’application Android (APK)")}</span>
        </ExtLink>
        {!shown.length && <p className="t-caption c-neutral">{$t("Aucune rubrique ne correspond. Essaie un autre mot.")}</p>}
        <div className="help-list">
          {shown.map((s) => {
            const isOpen = words.length > 0 || open.has(s.id);
            return (
              <section key={s.id} className="help-sec" data-open={isOpen}>
                <h2>
                  <button type="button" className="help-head" aria-expanded={isOpen} aria-controls={'h-' + s.id} onClick={() => toggle(s.id)}>
                    <Icon name={s.icon} style={{ color: 'var(--primary-fg)' }} />
                    <span className="grow t-strong">{L(s.title)}</span>
                    <Icon name="down" size={20} style={{ color: 'var(--text-moderate)', transform: isOpen ? 'rotate(180deg)' : undefined }} />
                  </button>
                </h2>
                {isOpen && <div id={'h-' + s.id} className="help-body"><Blocks blocks={s.blocks} /></div>}
              </section>
            );
          })}
        </div>
        <ExtLink href={APK_FILE} className="help-inline t-caption">{$t("Lien direct vers apogee.apk")}</ExtLink>
      </main>
    </div>
  );
}
