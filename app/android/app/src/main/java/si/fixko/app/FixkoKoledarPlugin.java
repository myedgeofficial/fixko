package si.fixko.app;

import android.content.Intent;
import android.provider.CalendarContract;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Termin dela v koledar: odpre koledar telefona z izpolnjenim terminom (uporabnik tapne Shrani).
@CapacitorPlugin(name = "FixkoKoledar")
public class FixkoKoledarPlugin extends Plugin {
    @PluginMethod
    public void dodaj(PluginCall call) {
        Double ms = call.getDouble("zacetek");
        String naslov = call.getString("naslov");
        if (ms == null || naslov == null) { call.reject("Manjka termin"); return; }
        long zacetek = ms.longValue();
        Intent i = new Intent(Intent.ACTION_INSERT)
            .setData(CalendarContract.Events.CONTENT_URI)
            .putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, zacetek)
            .putExtra(CalendarContract.EXTRA_EVENT_END_TIME, zacetek + 3600_000L)
            .putExtra(CalendarContract.Events.TITLE, naslov)
            .putExtra(CalendarContract.Events.DESCRIPTION, call.getString("opis", ""))
            .putExtra(CalendarContract.Events.EVENT_LOCATION, call.getString("kraj", ""))
            .putExtra(CalendarContract.Events.HAS_ALARM, 1);
        JSObject r = new JSObject();
        try {
            getActivity().startActivity(i);
            r.put("koledar", true);
            r.put("odprto", true);
        } catch (Exception e) {
            r.put("koledar", false);
        }
        r.put("opomnik", false);
        call.resolve(r);
    }
}
