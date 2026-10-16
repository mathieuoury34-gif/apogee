// Écrit capacitor.config.json : l'APK charge l'app web publiée (GitHub Pages), si bien qu'une mise à jour du
// site met aussi l'application Android à jour, sans réinstaller l'APK.
// SITE_URL : adresse publique de l'app, ex. https://mathieu.github.io/quadra/
import { writeFileSync } from 'node:fs';
const url = process.env.SITE_URL;
if (!url) { console.error('SITE_URL manquant'); process.exit(1); }
const host = new URL(url).host;
const config = {
  appId: 'com.mathieu.quadra',
  appName: 'Quadra',
  webDir: 'www',
  server: { url, cleartext: false, allowNavigation: [host, 'www.gstatic.com', '*.googleapis.com', '*.firebaseapp.com'] },
  android: { backgroundColor: '#F2F0EA' },
  plugins: { LocalNotifications: { smallIcon: 'ic_stat_quadra', iconColor: '#16181B' } },
};
writeFileSync('capacitor.config.json', JSON.stringify(config, null, 2));
console.log('capacitor.config.json →', url);
