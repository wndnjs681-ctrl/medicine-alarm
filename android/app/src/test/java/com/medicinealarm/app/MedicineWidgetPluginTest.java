package com.medicinealarm.app;

import android.content.Context;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProviderInfo;
import android.content.ComponentName;
import com.getcapacitor.JSObject;
import com.getcapacitor.PluginCall;
import org.json.JSONObject;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.Shadows;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class MedicineWidgetPluginTest {
    private Context context;
    private MedicineWidgetPlugin plugin;

    private static class RecordingCall extends PluginCall {
        JSObject resolved;
        String rejected;
        RecordingCall(JSObject data) { super(null, "MedicineWidget", "test", "saveState", data); }
        @Override public void resolve(JSObject result) { resolved = result; }
        @Override public void reject(String message) { rejected = message; }
        @Override public void reject(String message, Exception error) { rejected = message; }
    }

    @Before public void setup() {
        context = RuntimeEnvironment.getApplication();
        context.getSharedPreferences("medicine_widget", Context.MODE_PRIVATE).edit().clear().commit();
        plugin = new MedicineWidgetPlugin() { @Override public Context getContext() { return context; } };
    }

    @Test public void javascriptIntegerRevisionCanSaveThroughTheRealPluginCall() throws Exception {
        String state = "{\"medicines\":[],\"records\":[],\"alerts\":[],\"notifications\":false}";
        JSObject data = new JSObject("{\"state\":" + JSONObject.quote(state) + ",\"expectedRevision\":0}");
        assertTrue(data.get("expectedRevision") instanceof Integer);
        RecordingCall call = new RecordingCall(data);
        plugin.saveState(call);
        assertNull(call.rejected);
        assertNotNull(call.resolved);
        assertTrue(call.resolved.getBoolean("accepted"));
        assertEquals(state, WidgetStore.read(context).state);
    }

    @Test public void pluginRejectsNonIntegerRevisionWithoutChangingData() throws Exception {
        for (String revision : new String[] { "0.5", "-1", "\"0\"" }) {
            RecordingCall call = new RecordingCall(new JSObject("{\"state\":\"{}\",\"expectedRevision\":" + revision + "}"));
            plugin.saveState(call);
            assertNotNull(call.rejected);
            assertNull(WidgetStore.read(context).state);
        }
    }

    @Test public void widgetPinningDistinguishesUnsupportedRequestFromRegisteredWidget() throws Exception {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        org.robolectric.shadows.ShadowAppWidgetManager shadow = Shadows.shadowOf(manager);
        shadow.setRequestPinAppWidgetSupported(false);
        JSObject unsupported = WidgetPinning.request(context);
        assertFalse(unsupported.getBoolean("requested"));
        assertEquals(0, unsupported.getInt("widgetCount"));
        shadow.setRequestPinAppWidgetSupported(true);
        shadow.setValidWidgetProviderComponentName(true);
        AppWidgetProviderInfo info = new AppWidgetProviderInfo();
        info.provider = new ComponentName(context, MedicineWidgetProvider.class);
        info.initialLayout = R.layout.medicine_widget;
        shadow.addInstalledProvider(info);
        JSObject requested = WidgetPinning.request(context);
        assertTrue(requested.getBoolean("requested"));
        assertEquals(0, requested.getInt("widgetCount"));
        int registered = WidgetPinning.status(context).getInt("widgetCount");
        shadow.addBoundWidget(5, info);
        assertEquals(registered + 1, WidgetPinning.status(context).getInt("widgetCount"));
    }
}
