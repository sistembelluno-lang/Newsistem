// Aggiunge al progetto Android (creato da "npx cap add android") i permessi
// che servono: fotocamera, foto della galleria e accesso alla cartella
// Documenti/CSE_SISTEM anche per i file portati da un'app di sincronizzazione
// con Google Drive (su Android 11 e successivi serve "Accesso a tutti i file",
// da concedere una volta nelle impostazioni dell'app).
import fs from 'fs';

const file = 'android/app/src/main/AndroidManifest.xml';
let xml = fs.readFileSync(file, 'utf8');
const permessi = [
  'android.permission.CAMERA',
  'android.permission.READ_MEDIA_IMAGES',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
  'android.permission.MANAGE_EXTERNAL_STORAGE',
];
for (const p of permessi) {
  if (!xml.includes(p)) xml = xml.replace('</manifest>', `    <uses-permission android:name="${p}" />\n</manifest>`);
}
// Android 10: accesso alla memoria condivisa con le regole precedenti
if (!xml.includes('requestLegacyExternalStorage')) {
  xml = xml.replace('<application', '<application android:requestLegacyExternalStorage="true"');
}
fs.writeFileSync(file, xml);
console.log('Permessi Android aggiunti');
