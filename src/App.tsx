import { useEffect } from 'react';
import { HOME, navigate, useRoute } from './ui/router';
import { TabBar, ToastHost } from './ui/kit';
import { HomeScreen } from './screens/Home';
import { AddSheet, CalendarMonthScreen, CalendarWeekScreen, PlannedDetailScreen } from './screens/Calendar';
import { PlannedEditorScreen } from './screens/Editor';
import { JournalScreen, ManualEntryScreen, ReviewScreen, StatsScreen } from './screens/Sessions';
import { LoadScreen, ObjectiveScreen, ZoneHistoryScreen, ZonesScreen } from './screens/Progress';
import { AnalysisScreen } from './screens/Analysis';
import { CoachScreen } from './screens/Coach';
import { PeriodizationScreen } from './screens/Periodization';
import { InterruptionsScreen, LoadingScreen, ProfileScreen, SettingsScreen } from './screens/Settings';
import { HelpScreen } from './screens/Help';
import { useReady } from './data/store';

const SECTIONS = ['accueil', 'calendrier', 'seances', 'progression', 'coach', 'parametres'];

function Screen() {
  const route = useRoute();
  const [a, b, c] = route.parts;
  switch (a) {
    case 'calendrier':
      if (b === 'mois') return <CalendarMonthScreen />;
      if (b === 'periodisation') return <PeriodizationScreen />;
      if (b === 'prevue' && c) return <PlannedDetailScreen key={c} id={c} />;
      if (b === 'editer' && c) return <PlannedEditorScreen key={route.key} id={c} />;
      return <CalendarWeekScreen />;
    case 'seances':
      if (b === 'stats') return <StatsScreen />;
      if (b === 'saisie') return <ManualEntryScreen key={route.key} />;
      if (b) return <ReviewScreen key={b} id={b} />;
      return <JournalScreen key={route.query.get('filtre') ?? ''} />;
    case 'progression':
      if (b === 'analyse') return <AnalysisScreen />;
      if (b === 'objectif') return <ObjectiveScreen />;
      if (b === 'zones' && c) return <ZoneHistoryScreen kind={c} />;
      if (b === 'zones') return <ZonesScreen key={route.query.get('ajout') ?? ''} />;
      return <LoadScreen />;
    case 'coach':
      return <CoachScreen key={route.query.get('importer') ?? ''} />;
    case 'parametres':
      if (b === 'profil') return <ProfileScreen />;
      if (b === 'aide') return <HelpScreen />;
      if (b === 'interruptions') return <InterruptionsScreen key={route.query.get('nouvelle') ?? ''} />;
      return <SettingsScreen />;
    default:
      return <HomeScreen />;
  }
}

export function App() {
  const route = useRoute();
  const ready = useReady();
  const sheet = route.query.get('sheet');
  // écrans de saisie plein écran : pas de barre d'onglets (comme les écrans Achat / Virement de PEAnalyze)
  const fullScreen = /^\/(seances\/saisie|calendrier\/editer|parametres\/profil)/.test(route.path);

  useEffect(() => {
    if (!SECTIONS.includes(route.parts[0])) navigate(HOME, { replace: true });
  }, [route.parts]);

  // L'app s'affiche dès que les données locales sont lues : elle n'attend pas le réseau (Firebase se connecte ensuite, en arrière-plan).
  useEffect(() => { if (ready) (window as unknown as { apogeeReady?: () => void }).apogeeReady?.(); }, [ready]);
  if (!ready) return <LoadingScreen />;

  return (
    <>
      <div className="app-main">
        <Screen />
      </div>
      {!fullScreen && <TabBar />}
      {sheet === 'ajouter' && <AddSheet />}
      <ToastHost />
    </>
  );
}
