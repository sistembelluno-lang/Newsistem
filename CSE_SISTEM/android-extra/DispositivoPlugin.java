package it.sistembelluno.csesistem;

// Funzioni di Android che i plugin standard di Capacitor non hanno:
//  - stampa dei documenti (verbali, verifiche dei POS): la pagina HTML viene
//    caricata in una WebView invisibile e passata al servizio di stampa del
//    sistema; l'utente sceglie la stampante oppure «Salva come PDF»;
//  - permesso «Accesso a tutti i file» (serve per leggere i file portati in
//    Documenti/CSE_SISTEM dall'app di sincronizzazione con Google Drive);
//  - accesso a Google Drive: l'utente sceglie l'account Google e concede il
//    permesso una volta; poi il programma riceve un «token» con cui la pagina
//    (www/js/servizi/drive.js) legge e scrive la cartella CSE_SISTEM di Drive.

import android.app.Activity;
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

import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.common.api.Scope;

import java.util.Collections;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "Dispositivo", requestCodes = { DispositivoPlugin.RICHIESTA_DRIVE })
public class DispositivoPlugin extends Plugin {

    static final int RICHIESTA_DRIVE = 7361;
    private static final String AMBITO_DRIVE = "https://www.googleapis.com/auth/drive";

    private AuthorizationRequest richiestaDrive() {
        return AuthorizationRequest.builder()
                .setRequestedScopes(Collections.singletonList(new Scope(AMBITO_DRIVE)))
                .build();
    }

    private static JSObject conToken(AuthorizationResult r) {
        JSObject o = new JSObject();
        o.put("token", r.getAccessToken());
        o.put("serveConsenso", false);
        return o;
    }

    /**
     * Token per Google Drive. { interattivo: false } (sincronizzazioni
     * automatiche): se serve il consenso dell'utente risponde
     * { serveConsenso: true } senza mostrare niente. { interattivo: true }
     * (pulsante «Collega Google Drive»): mostra la scelta dell'account e il
     * permesso. Google rinnova il token da solo: si chiede di nuovo quando
     * scade (dopo circa un'ora).
     */
    @PluginMethod
    public void tokenDrive(PluginCall call) {
        final boolean interattivo = Boolean.TRUE.equals(call.getBoolean("interattivo", false));
        final Activity attivita = getActivity();
        Identity.getAuthorizationClient(attivita).authorize(richiestaDrive())
                .addOnSuccessListener(r -> {
                    if (!r.hasResolution()) {
                        call.resolve(conToken(r));
                        return;
                    }
                    if (!interattivo || r.getPendingIntent() == null) {
                        JSObject o = new JSObject();
                        o.put("serveConsenso", true);
                        call.resolve(o);
                        return;
                    }
                    try {
                        saveCall(call);
                        attivita.startIntentSenderForResult(r.getPendingIntent().getIntentSender(), RICHIESTA_DRIVE, null, 0, 0, 0, null);
                    } catch (Exception e) {
                        freeSavedCall();
                        call.reject("Accesso a Google non avviato: " + e.getMessage());
                    }
                })
                .addOnFailureListener(e -> call.reject("Google: " + e.getMessage()));
    }

    @Override
    protected void handleOnActivityResult(int requestCode, int resultCode, Intent data) {
        super.handleOnActivityResult(requestCode, resultCode, data);
        if (requestCode != RICHIESTA_DRIVE) return;
        PluginCall call = getSavedCall();
        if (call == null) return;
        freeSavedCall();
        if (data == null) {
            // la finestra di Google si è chiusa senza risposta: annullata, oppure bloccata da Google
            call.reject("Accesso a Google Drive annullato (Google non ha risposto, codice " + resultCode + ")");
            return;
        }
        try {
            AuthorizationResult r = Identity.getAuthorizationClient(getActivity()).getAuthorizationResultFromIntent(data);
            if (r.getAccessToken() == null) {
                call.reject("Accesso a Google Drive non concesso (nessun token, codice " + resultCode + ")");
                return;
            }
            call.resolve(conToken(r));
        } catch (ApiException e) {
            call.reject("Accesso a Google Drive non concesso: codice Google " + e.getStatusCode() + (e.getMessage() != null ? " – " + e.getMessage() : ""));
        }
    }

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
