package si.fixko.app;

import android.os.Bundle;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(FixkoKoledarPlugin.class);
        super.onCreate(savedInstanceState);

        // Tipka Nazaj: najprej zapre odprto okno v Fixku (window.fixkoNazaj), šele nato skrije aplikacijo.
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (bridge == null || bridge.getWebView() == null) { moveTaskToBack(true); return; }
                bridge.getWebView().evaluateJavascript(
                    "(window.fixkoNazaj && window.fixkoNazaj()) ? 'da' : 'ne'",
                    (r) -> {
                        if ("\"da\"".equals(r)) return;
                        // Strani brez Fixko kode (npr. Zasebnost): nazaj na prejšnjo stran.
                        if (bridge.getWebView().canGoBack()) bridge.getWebView().goBack();
                        else moveTaskToBack(true);
                    });
            }
        });
    }
}
