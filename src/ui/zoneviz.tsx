// Petits diagrammes des zones de fréquence cardiaque (méthode de Karvonen) : l'échelle des fourchettes en bpm et les lignes « temps par zone ».
import { $t } from '../i18n';
import { NBSP, duration, num, pct } from './format';
import type { ZoneSeconds } from '../domain/zones';

/** Teintes des 5 zones : trois verts-bleus de plus en plus foncés, puis ambre (soutenue) et rouge (intense), comme le reste de l'appli. */
export const ZONE_COLOR = ['var(--form-fresh)', 'var(--form-ready)', 'var(--form-steady)', 'var(--zone-hard)', 'var(--zone-intense)'];
export const ZONE_NAME = [$t("Échauffement"), $t("Facile"), $t("Aérobie"), $t("Seuil"), $t("Maximum")];
export interface ZoneRange { lo: number; hi: number }

/** Fourchette en bpm d'une zone : « < 136 », « 136–149 », « ≥ 177 ». */
export function rangeText(r: ZoneRange[], i: number): string {
  const lo = Math.round(r[i].lo), hi = Math.round(r[i].hi);
  return i === 0 ? `< ${hi}` : i === r.length - 1 ? `≥ ${lo}` : `${lo}–${hi}`;
}

/** Échelle : une barre de la FC de repos à la FC max, découpée en 5 zones à largeur proportionnelle aux bpm, avec les seuils dessous. */
export function ZoneScale({ ranges, caption = true }: { ranges: ZoneRange[]; caption?: boolean }) {
  const lo = ranges[0].lo, hi = ranges[ranges.length - 1].hi, span = Math.max(1, hi - lo);
  const edges = ranges.map((r) => r.lo).concat(hi);
  return (
    <div className="stack-4" role="img" aria-label={$t("Zones de FC en bpm : {0}", { 0: ranges.map((_, i) => 'Z' + (i + 1) + ' ' + rangeText(ranges, i)).join(', ') })}>
      <div className="zscale">
        {ranges.map((r, i) => <span key={i} style={{ width: `${((r.hi - r.lo) / span) * 100}%`, background: ZONE_COLOR[i] }}>Z{i + 1}</span>)}
      </div>
      <div className="zscale-ticks">
        {edges.map((e, i) => <span key={i} style={{ left: `${((e - lo) / span) * 100}%` }}>{Math.round(e)}</span>)}
      </div>
      {caption && <span className="t-legal c-moderate">{$t("de ta FC de repos ({0} bpm) à ta FC max ({1} bpm)", { 0: Math.round(lo), 1: Math.round(hi) })}</span>}
    </div>
  );
}

/** Une ligne par zone, de la plus haute à la plus basse, comme Garmin Connect : nom, fourchette, barre, temps ou part. */
export function ZoneRows({ zones, ranges, mode = 'time' }: { zones: ZoneSeconds; ranges: ZoneRange[]; mode?: 'time' | 'pct' }) {
  const tot = zones.reduce((t, v) => t + v, 0);
  const top = Math.max(1, ...zones);
  return (
    <ul className="zrows">
      {[4, 3, 2, 1, 0].map((i) => (
        <li key={i}>
          <div className="between baseline"><span className="t-label">{$t("Zone {0}", { 0: i + 1 })}<span className="t-caption c-moderate"> · {rangeText(ranges, i)}{NBSP}bpm · {ZONE_NAME[i]}</span></span>
            <span className="t-caption-strong nowrap">{mode === 'time' ? duration(zones[i]) : pct(tot ? zones[i] / tot : 0)}</span></div>
          <div className="zrow-bar" aria-hidden="true"><span style={{ width: `${(zones[i] / top) * 100}%`, background: ZONE_COLOR[i] }} /></div>
        </li>
      ))}
    </ul>
  );
}

// ------------------------------------------------------------------ jauge d'effet d'entraînement (0 à 5, comme sur les montres)
// dégradé : bleu clair → bleu franc → vert → ambre → rouge (comme les niveaux des montres, sans segments gris)
const TE_SEG: [string, number][] = [['var(--info-icon)', 0.3], ['var(--info-icon)', 0.6], ['var(--info-icon)', 1], ['var(--success)', 1], ['var(--warning)', 1]];
export function TeGauge({ value, color, label }: { value: number | null; color: string; label: string }) {
  const v = value === null ? null : Math.min(5.25, Math.max(0, value));
  return (
    <div className="tegauge" role="img" aria-label={label + ' ' + (value === null ? '—' : num(value, 1) + ' / 5')}>
      {TE_SEG.map(([c, o], i) => <span key={i} style={{ background: c, opacity: o }} />)}
      <span className="over" style={{ background: 'var(--critical)' }} />
      {v !== null && <i className="dot" style={{ left: `${(v / 5.25) * 100}%`, background: color }} />}
    </div>
  );
}
