// Roulettes de l'éditeur de bloc : durée, distance, répétitions et chaque sorte d'intensité.
// Les valeurs sont manipulées dans une unité entière d'affichage (secondes, dixièmes de km/h, dixièmes de kg, watts, bpm, %…) ;
// `toDisp` / `fromDisp` font le lien avec ce que stocke le bloc (m/s pour la vitesse, kg pour la charge).
import { $t } from '../i18n';
import { DurationWheel, IntWheel, SplitWheel } from './kit';
import { NBSP } from './format';
import type { Block, PlannedDiscipline } from '../domain/types';
export { defaultDisp, fromDisp, toDisp } from './targetUnits';

type Type = Block['targetType'];
/** Roulette de ce qui termine un bloc. */
export function MeasureWheel({ measure, value, onChange, discipline }: { measure: 'TIME' | 'DISTANCE' | 'REPS'; value: number; onChange: (v: number) => void; discipline: PlannedDiscipline | 'OTHER' }) {
  if (measure === 'TIME') return <DurationWheel value={value} onChange={onChange} label={$t("Durée")} />;
  if (measure === 'REPS') return <IntWheel value={value} onChange={onChange} label={$t("Répétitions")} min={1} max={100} unit={$t("rép.")} />;
  return <SplitWheel value={value} onChange={onChange} label={$t("Distance")} base={1000} hiMax={99} hiUnit="km" loUnit="m" loStep={discipline === 'SWIM' ? 25 : 10} loPad={3} />;
}

/** Roulette d'une valeur d'intensité (valeur ou borne). */
export function TargetWheel({ type, rel, value, onChange, label }: { type: Type; rel: Block['relativeTo']; value: number; onChange: (v: number) => void; label: string }) {
  if (rel !== null) return <IntWheel value={value} onChange={onChange} label={label} min={10} max={250} unit="%" />;
  switch (type) {
    case 'ZONE': return <IntWheel value={value} onChange={onChange} label={label} min={1} max={5} unit={$t("zone")} />;
    case 'RPE': return <IntWheel value={value} onChange={onChange} label={label} min={1} max={10} unit="/10" />;
    case 'HR': return <IntWheel value={value} onChange={onChange} label={label} min={30} max={230} unit="bpm" />;
    case 'PACE': return <SplitWheel value={value} onChange={onChange} label={label} base={60} hiMax={19} hiUnit="min" loUnit="s" />;
    case 'SPEED': return <SplitWheel value={value} onChange={onChange} label={label} base={10} hiMax={90} hiUnit="," loUnit={NBSP + 'km/h'} loPad={1} />;
    case 'POWER': return <SplitWheel value={value} onChange={onChange} label={label} base={100} hiMax={20} hiUnit="" loUnit="W" loStep={5} />;
    case 'LOAD': return <SplitWheel value={value} onChange={onChange} label={label} base={10} hiMax={300} hiUnit="," loUnit={NBSP + 'kg'} loStep={5} loPad={1} />;
    default: return null;
  }
}
