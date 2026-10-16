// Adapte le projet Android généré par `npx cap add android` (dossier android/, jamais versionné) :
//  - autorisations Health Connect (lecture seule) + historique, écran de justification exigé par Android 14 ;
//  - lien ironapp://auth (retour de la connexion Google ouverte dans le navigateur) ;
//  - module natif IronHealth (Kotlin) enregistré dans MainActivity ;
//  - minSdk 26 (Health Connect), Kotlin, keystore de debug versionné (les mises à jour s'installent
//    par-dessus l'APK précédent au lieu d'exiger une désinstallation) ;
//  - icônes d'Quadra.
// Le script est idempotent : le relancer ne duplique rien.
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const A = 'android';
const APP = join(A, 'app');
const PKG = 'com/mathieu/ironapp/v2';
const read = (p) => readFileSync(p, 'utf8');
const write = (p, s) => writeFileSync(p, s);
const must = (cond, msg) => { if (!cond) { console.error('patch-android : ' + msg); process.exit(1); } };
must(existsSync(APP), 'dossier android/app introuvable (lancer « npx cap add android » avant)');

// ---------------------------------------------------------------- manifeste
const manifestPath = join(APP, 'src/main/AndroidManifest.xml');
let m = read(manifestPath);
const PERMS = [
  'android.permission.health.READ_EXERCISE',
  'android.permission.health.READ_HEART_RATE',
  'android.permission.health.READ_SPEED',
  'android.permission.health.READ_DISTANCE',
  'android.permission.health.READ_ACTIVE_CALORIES_BURNED',
  'android.permission.health.READ_TOTAL_CALORIES_BURNED',
  'android.permission.health.READ_ELEVATION_GAINED',
  'android.permission.health.READ_SLEEP',
  'android.permission.health.READ_RESTING_HEART_RATE',
  'android.permission.health.READ_HEALTH_DATA_HISTORY',
  'android.permission.POST_NOTIFICATIONS',
];
if (!m.includes('READ_EXERCISE')) {
  const lines = PERMS.map((p) => `    <uses-permission android:name="${p}" />`).join('\n');
  m = m.replace(/<\/manifest>\s*$/, `${lines}\n    <queries>\n        <package android:name="com.google.android.apps.healthdata" />\n    </queries>\n</manifest>\n`);
}
if (!m.includes('ACTION_SHOW_PERMISSIONS_RATIONALE')) {
  // filtres d'intention ajoutés à l'activité principale
  const filters = `
            <intent-filter>
                <action android:name="androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE" />
            </intent-filter>
            <intent-filter android:autoVerify="false">
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="ironapp" android:host="auth" />
            </intent-filter>
`;
  const i = m.indexOf('</activity>');
  must(i > 0, 'balise </activity> introuvable dans le manifeste');
  m = m.slice(0, i) + filters + '        ' + m.slice(i);
  // Android 14+ : l'écran « utilisation des autorisations » doit pointer vers l'app
  const alias = `
        <activity-alias
            android:name="ViewPermissionUsageActivity"
            android:exported="true"
            android:targetActivity=".MainActivity"
            android:permission="android.permission.START_VIEW_PERMISSION_USAGE">
            <intent-filter>
                <action android:name="android.intent.action.VIEW_PERMISSION_USAGE" />
                <category android:name="android.intent.category.HEALTH_PERMISSIONS" />
            </intent-filter>
        </activity-alias>
`;
  const j = m.indexOf('</activity>') + '</activity>'.length;
  m = m.slice(0, j) + '\n' + alias + m.slice(j);
}
write(manifestPath, m);

// ---------------------------------------------------------------- minSdk 26
const varsPath = join(A, 'variables.gradle');
let v = read(varsPath);
v = v.replace(/minSdkVersion\s*=\s*\d+/, 'minSdkVersion = 26');
write(varsPath, v);

// ---------------------------------------------------------------- Kotlin (projet)
const rootGradle = join(A, 'build.gradle');
let rg = read(rootGradle);
if (!rg.includes('kotlin-gradle-plugin')) {
  rg = rg.replace(/(classpath ['"]com\.android\.tools\.build:gradle:[^'"]+['"])/, `$1\n        classpath 'org.jetbrains.kotlin:kotlin-gradle-plugin:2.0.21'`);
  must(rg.includes('kotlin-gradle-plugin'), 'classpath du plugin Android introuvable dans android/build.gradle');
}
write(rootGradle, rg);

// ---------------------------------------------------------------- module app
const appGradle = join(APP, 'build.gradle');
let g = read(appGradle);
if (!g.includes("apply plugin: 'kotlin-android'")) g = g.replace("apply plugin: 'com.android.application'", "apply plugin: 'com.android.application'\napply plugin: 'kotlin-android'");
if (!g.includes('iron-debug.keystore')) {
  g = g.replace(/android\s*\{/, `android {
    signingConfigs {
        debug {
            storeFile file('../../keystore/iron-debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    compileOptions {
        sourceCompatibility JavaVersion.VERSION_21
        targetCompatibility JavaVersion.VERSION_21
    }
    kotlinOptions { jvmTarget = '21' }`);
}
if (!g.includes('connect-client')) {
  g = g.replace(/dependencies\s*\{/, `dependencies {
    implementation 'androidx.health.connect:connect-client:1.1.0-alpha10'
    implementation 'org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1'
    implementation 'androidx.activity:activity-ktx:1.9.3'`);
}
write(appGradle, g);

// ---------------------------------------------------------------- module natif + MainActivity
const javaDir = join(APP, 'src/main/java', PKG);
mkdirSync(javaDir, { recursive: true });
cpSync('plugin/IronHealthPlugin.kt', join(javaDir, 'IronHealthPlugin.kt'));
write(join(javaDir, 'MainActivity.java'), `package com.mathieu.ironapp.v2;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(IronHealthPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
`);

// ---------------------------------------------------------------- icônes
cpSync('res', join(APP, 'src/main/res'), { recursive: true });
mkdirSync(join(APP, 'src/main/res/values'), { recursive: true });
const bg = join(APP, 'src/main/res/values/ic_launcher_background.xml');
write(bg, `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#E9E3D6</color>\n</resources>\n`);

console.log('Projet Android adapté pour Quadra.');
