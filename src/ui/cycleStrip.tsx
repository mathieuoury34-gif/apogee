// Frise des cycles de charge : une seule bande fine, graduée en jours, où chaque cycle est un segment coloré
// (montée : bleu → violet, descente : vert). Remplace les listes de puces : peu de texte, tout se lit d'un coup d'œil.
import { addDays, daysBetween } from '../domain/dates';
import { type CycleInfo } from '../domain/cycles';

/** Étiquette courte dans le segment : rang de la montée (1, 2, 3…), « ↑ » pour une montée seule, « ↓ » pour une descente. */
const shortLabel = (c: CycleInfo) => (c.cycle.kind === 'down' ? '↓' : c.count > 1 ? String(c.rank) : '↑');

export function CycleStrip({ items, from, to, today, marker, labels = true, thin = false, label }: { items: CycleInfo[]; from: string; to: string; today?: string; marker?: string; labels?: boolean; thin?: boolean; label: string }) {
  const span = Math.max(1, daysBetween(from, to) + 1);
  const pos = (day: string) => (Math.min(span, Math.max(0, daysBetween(from, day))) / span) * 100;
  return (
    <div className={'cstrip' + (thin ? ' thin' : '')} role="img" aria-label={label}>
      {items.map((c) => {
        const s = c.cycle.startDate < from ? from : c.cycle.startDate, e = c.cycle.endDate > to ? to : c.cycle.endDate;
        if (e < s) return null;
        return <span key={c.cycle.startDate} className="cstrip-seg" title={c.text} style={{ left: pos(s) + '%', width: `calc(${pos(addDays(e, 1)) - pos(s)}% - 1px)`, ['--cyc' as string]: c.color }}>{labels && !thin ? shortLabel(c) : ''}</span>;
      })}
      {today && today >= from && today <= to && <span className="cstrip-mark" style={{ left: pos(today) + '%' }} />}
      {marker && marker >= from && marker <= to && <span className="cstrip-mark sel" style={{ left: pos(marker) + '%', width: `${100 / span}%` }} />}
    </div>
  );
}
