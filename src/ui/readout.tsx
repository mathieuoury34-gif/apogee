// Bandeau de valeurs d'un graphe : la date lue par le curseur, puis une cellule par courbe (pastille de légende + libellé + valeur).
// Sert de légende ET de lecture exacte ; les cellules sont alignées en grille, sur téléphone comme sur ordinateur.
import type { ReactNode } from 'react';

export interface ReadoutCell { label: string; value: ReactNode; color?: string; dashed?: boolean; note?: string; key?: boolean; valueColor?: string }

export function Readout({ when, cells, cols }: { when: ReactNode; cells: ReadoutCell[]; cols?: number }) {
  return (
    <div role="status" aria-live="polite" className="readout" data-component="Readout" style={cols ? { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` } : undefined}>
      <span className="when t-caption-strong">{when}</span>
      {cells.map((c, i) => (
        <span key={i} className={'cell' + (c.key ? ' key' : '')}>
          <span className="lab">
            {c.color && <span className="sw" style={c.dashed ? { borderTop: `2.5px dashed ${c.color}`, height: 0 } : { background: c.color }} />}
            <span>{c.label}</span>
          </span>
          <strong className="val" style={c.valueColor ? { color: c.valueColor } : undefined}>{c.value}</strong>
          {c.note && <em>{c.note}</em>}
        </span>
      ))}
    </div>
  );
}

/** Grandes tuiles des chiffres clés d'une page (ex. charge aiguë et rapport de charge). */
export function KeyFigures({ items }: { items: { label: string; value: ReactNode; sub?: ReactNode; color?: string }[] }) {
  return (
    <div className="key-figures" data-component="KeyFigures">
      {items.map((k, i) => (
        <div key={i} className="kf" style={k.color ? { ['--kf' as string]: k.color } : undefined}>
          <span className="t-caption c-neutral">{k.label}</span>
          <strong className="num">{k.value}</strong>
          {k.sub && <span className="t-caption-strong sub">{k.sub}</span>}
        </div>
      ))}
    </div>
  );
}
