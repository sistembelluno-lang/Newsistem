// Aggiunge al progetto Android (creato da "npx cap add android") i permessi
// che servono: fotocamera e lettura delle foto dalla galleria.
import fs from 'fs';

const file = 'android/app/src/main/AndroidManifest.xml';
let xml = fs.readFileSync(file, 'utf8');
const permessi = [
  'android.permission.CAMERA',
  'android.permission.READ_MEDIA_IMAGES',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE',
];
for (const p of permessi) {
  if (!xml.includes(p)) xml = xml.replace('</manifest>', `    <uses-permission android:name="${p}" />\n</manifest>`);
}
fs.writeFileSync(file, xml);
console.log('Permessi Android aggiunti');
