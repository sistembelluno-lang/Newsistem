// Disco su Android (Capacitor): plugin Filesystem nella cartella Documents
// del telefono (CSE_SISTEM/...), fotocamera con il plugin Camera,
// condivisione dei PDF con il plugin Share.
//
// I plugin si ottengono da window.Capacitor (iniettato dall'app Android),
// senza bisogno di un "bundler": le pagine in www/ restano le stesse di Windows.

function b64DaByte(byte) {
  let s = '';
  for (let i = 0; i < byte.length; i += 0x8000) s += String.fromCharCode(...byte.subarray(i, i + 0x8000));
  return btoa(s);
}

function byteDaB64(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function plugin(nome, cap = globalThis.Capacitor) {
  if (!cap) throw new Error('Capacitor non disponibile');
  return cap.Plugins?.[nome] || cap.registerPlugin(nome);
}

export function discoCapacitor(cap = globalThis.Capacitor) {
  const fs = plugin('Filesystem', cap);
  const directory = 'DOCUMENTS';
  const enc = new TextEncoder();
  const dec = new TextDecoder();

  async function stat(p) {
    try {
      return await fs.stat({ path: p, directory });
    } catch {
      return null;
    }
  }

  return {
    nome: 'android',
    async esiste(p) {
      return (await stat(p)) !== null;
    },
    /** { size, mtime } di un file (per la sincronizzazione con Google Drive), o null. */
    async info(p) {
      const s = await stat(p);
      return s && s.type !== 'directory' ? { size: Number(s.size || 0), mtime: Number(s.mtime || 0) } : null;
    },
    async creaCartella(p) {
      if (await stat(p)) return;
      await fs.mkdir({ path: p, directory, recursive: true });
    },
    async scriviByte(p, byte) {
      await fs.writeFile({ path: p, directory, data: b64DaByte(byte), recursive: true });
    },
    async leggiByte(p) {
      const r = await fs.readFile({ path: p, directory });
      return byteDaB64(r.data);
    },
    async scriviTesto(p, testo) {
      return this.scriviByte(p, enc.encode(testo));
    },
    async leggiTesto(p) {
      return dec.decode(await this.leggiByte(p));
    },
    async elenca(p) {
      const r = await fs.readdir({ path: p, directory });
      return r.files.map((f) => ({ nome: f.name, cartella: f.type === 'directory' }));
    },
    async elimina(p) {
      const s = await stat(p);
      if (!s) return;
      if (s.type === 'directory') await fs.rmdir({ path: p, directory, recursive: true });
      else await fs.deleteFile({ path: p, directory });
    },
    /** Apre il file con l'app adatta del telefono (senza «Condividi»); se non si può, lo condivide. */
    async apri(p) {
      try {
        await plugin('Dispositivo', cap).apriConApp({ percorso: p });
      } catch (e) {
        if (/non c'è un'app/.test(String(e?.message))) throw e;
        const { uri } = await fs.getUri({ path: p, directory });
        await plugin('Share', cap).share({ url: uri });
      }
    },
    /** Menu «Condividi» di Android (per mandare il file via e-mail, WhatsApp, ...). */
    async condividi(p) {
      const { uri } = await fs.getUri({ path: p, directory });
      await plugin('Share', cap).share({ url: uri });
    },
  };
}

/** Altre funzioni del sistema su Android. */
export function serviziCapacitor(cap = globalThis.Capacitor) {
  return {
    /**
     * Stampa un documento HTML con il servizio di stampa di Android: si
     * sceglie la stampante oppure «Salva come PDF» (plugin nativo "Dispositivo").
     */
    async stampa(html, nome) {
      await plugin('Dispositivo', cap).stampa({ html, nome });
    },
    /**
     * Su Android l'app di sincronizzazione (Autosync, FolderSync) porta i file
     * mentre CSE_SISTEM è in secondo piano: al rientro nell'app si rilegge.
     */
    suCambiamenti(f) {
      const rientro = () => { if (document.visibilityState === 'visible') f([]); };
      document.addEventListener('visibilitychange', rientro);
      return () => document.removeEventListener('visibilitychange', rientro);
    },
    /** true se l'app può leggere tutti i file di Documenti/CSE_SISTEM. */
    async permessoFile() {
      return (await plugin('Dispositivo', cap).permessoFile()).concesso;
    },
    /**
     * Token per Google Drive (scelta dell'account e permesso con interattivo:
     * true, solo la prima volta): { token } oppure { serveConsenso: true }.
     */
    async tokenDrive({ interattivo = false } = {}) {
      try {
        return await plugin('Dispositivo', cap).tokenDrive({ interattivo });
      } catch (e) {
        const m = String(e?.message || e);
        // 10 = DEVELOPER_ERROR: l'app non è registrata nel progetto Google Cloud (nome del pacchetto e impronta SHA-1)
        if (/(^|\D)10(\D|$)/.test(m) || /DEVELOPER_ERROR/i.test(m)) {
          throw new Error('Google non riconosce ancora l’app: va registrata una volta nel progetto Google Cloud (vedi la guida, «Collegare Google Drive»).');
        }
        if (/annullato|codice Google 16|codice 0\b/i.test(m)) {
          throw new Error(`${m}. Se non hai annullato tu: Google ha bloccato l’accesso. Controlla in Google Cloud › Google Auth Platform › Pubblico che l’account scelto sia tra gli «Utenti di prova», oppure premi «Pubblica app».`);
        }
        throw new Error(m);
      }
    },
    /** Apre le impostazioni di Android per concedere «Accesso a tutti i file». */
    async apriPermessoFile() {
      await plugin('Dispositivo', cap).apriPermessoFile();
    },
    /** Scatta una foto con la fotocamera: { nome, byte, modificato }. */
    async scatta() {
      const foto = await plugin('Camera', cap).getPhoto({
        source: 'CAMERA', resultType: 'base64', quality: 90, saveToGallery: true, correctOrientation: true,
      });
      return { nome: `IMG_${Date.now()}.${foto.format || 'jpg'}`, byte: byteDaB64(foto.base64String), modificato: Date.now() };
    },
    /** Sceglie foto dalla galleria. */
    async scegliFoto() {
      const r = await plugin('Camera', cap).pickImages({ quality: 90 });
      const out = [];
      for (const f of r.photos) {
        const risp = await fetch(f.webPath);
        out.push({ nome: f.path?.split('/').pop() || `IMG_${Date.now()}.jpg`, byte: new Uint8Array(await risp.arrayBuffer()), modificato: Date.now() });
      }
      return out;
    },
  };
}
