package it.sistembelluno.csesistem;

// Funzioni di Android che i plugin standard di Capacitor non hanno:
//  - stampa dei documenti (verbali, verifiche dei POS): la pagina HTML viene
//    caricata in una WebView invisibile e passata al servizio di stampa del
//    sistema; l'utente sceglie la stampante oppure «Salva come PDF»;
//  - permesso «Accesso a tutti i file» (serve per leggere i file portati in
//    Documenti/CSE_SISTEM dall'app di sincronizzazione con Google Drive).

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.Settings;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "Dispositivo")
public class DispositivoPlugin extends Plugin {

    // la WebView deve restare viva finché il sistema prepara la stampa
    private WebView vista;

    @PluginMethod
    public void stampa(PluginCall call) {
        final String html = call.getString("html", "");
        final String nome = call.getString("nome", "CSE_SISTEM");
        getActivity().runOnUiThread(() -> {
            WebView wv = new WebView(getActivity());
            wv.getSettings().setJavaScriptEnabled(false);
            vista = wv;
            wv.setWebViewClient(new WebViewClient() {
                private boolean fatto = false;

                @Override
                public void onPageFinished(WebView view, String url) {
                    if (fatto) return;
                    fatto = true;
                    try {
                        PrintManager pm = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
                        PrintDocumentAdapter adattatore = view.createPrintDocumentAdapter(nome);
                        PrintAttributes attributi = new PrintAttributes.Builder()
                                .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
                                .build();
                        pm.print(nome, adattatore, attributi);
                        call.resolve();
                    } catch (Exception e) {
                        call.reject("Stampa non riuscita: " + e.getMessage());
                    }
                }
            });
            wv.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
        });
    }

    /** { concesso: true/false } — su Android 10 e precedenti basta il permesso normale. */
    @PluginMethod
    public void permessoFile(PluginCall call) {
        JSObject r = new JSObject();
        r.put("concesso", Build.VERSION.SDK_INT < Build.VERSION_CODES.R || Environment.isExternalStorageManager());
        call.resolve(r);
    }

    /** Apre la pagina delle impostazioni dove si concede «Accesso a tutti i file». */
    @PluginMethod
    public void apriPermessoFile(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            call.resolve();
            return;
        }
        try {
            Intent i = new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        } catch (Exception e) {
            Intent i = new Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
        }
        call.resolve();
    }
}
