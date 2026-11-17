// Completa il progetto Android generato da "npx cap add android":
//  - aggiunge il plugin nativo "Dispositivo" (stampa, permesso sui file, accesso a Google Drive) (android-extra/DispositivoPlugin.java)
//    con la libreria play-services-auth;
//    e lo registra in MainActivity;
//  - mette icona e schermata di avvio di CSE_SISTEM (android-extra/res);
//  - scrive nel programma il numero di versione di package.json.
// Da eseguire dopo android-permessi.mjs e prima di "npx cap sync android".
import fs from 'fs';
import path from 'path';

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const cartellaJava = 'android/app/src/main/java/it/sistembelluno/csesistem';

// plugin nativo
fs.copyFileSync('android-extra/DispositivoPlugin.java', path.join(cartellaJava, 'DispositivoPlugin.java'));
fs.writeFileSync(path.join(cartellaJava, 'MainActivity.java'), `package it.sistembelluno.csesistem;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(DispositivoPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
`);

// icone e schermata di avvio (stesse cartelle e nomi del progetto generato)
fs.cpSync('android-extra/res', 'android/app/src/main/res', { recursive: true });

// versione e libreria Google per l'accesso a Drive (scelta dell'account e permesso)
const [a, b, c] = pkg.version.split('.').map(Number);
const gradle = 'android/app/build.gradle';
let g = fs.readFileSync(gradle, 'utf8');
if (!g.includes('play-services-auth')) {
  g = g.replace(/dependencies\s*\{/, (m) => `${m}\n    implementation 'com.google.android.gms:play-services-auth:21.2.0'`);
}
g = g.replace(/versionCode \d+/, `versionCode ${a * 10000 + b * 100 + c}`).replace(/versionName "[^"]*"/, `versionName "${pkg.version}"`);
fs.writeFileSync(gradle, g);

console.log(`Progetto Android pronto: plugin Dispositivo, icone, versione ${pkg.version}`);
