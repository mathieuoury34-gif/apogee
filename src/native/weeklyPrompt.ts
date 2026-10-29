// Ouverture directe du formulaire « Point de la semaine » : la première fois qu'on ouvre l'application après que le rappel du dimanche a sonné,
// le formulaire est la première page (le tap sur la notification y mène aussi). Pas à l'installation, et pas si le rappel est coupé.
import { getData, getPrefs, setPrefs } from '../data/store';
import { liveRecords } from '../domain/load';
import { navigate } from '../ui/router';
import { latestWeeklySlot } from './notify';

export function openWeeklyIfDue(now: Date = new Date()): void {
  const p = getPrefs();
  if (p.weeklyReminder === false) return;
  const slot = latestWeeklySlot(now, p.weeklyReminderHour);
  if (p.weeklyPromptAck === undefined) { setPrefs({ weeklyPromptAck: slot }); return; }
  if (slot <= p.weeklyPromptAck) return;
  setPrefs({ weeklyPromptAck: slot });
  const day = slot.slice(0, 10);
  if (liveRecords(getData().interruptions).some((i) => i.suspendsReminders && i.startDate <= day && i.endDate >= day)) return;
  navigate('/accueil?point=1', { replace: true });
}
