package com.medicinealarm.app;

import android.appwidget.AppWidgetManager;
import android.app.Activity;
import android.content.ComponentName;
import android.content.Intent;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.ActivityCallback;
import java.lang.ref.WeakReference;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "MedicineWidget")
public class MedicineWidgetPlugin extends Plugin {
    private static WeakReference<MedicineWidgetPlugin> active = new WeakReference<>(null);

    @Override public void load() { active = new WeakReference<>(this); }

    private JSObject payload(WidgetStore.Snapshot snapshot) {
        JSObject result = new JSObject();
        result.put("state", snapshot.state == null ? org.json.JSONObject.NULL : snapshot.state);
        result.put("revision", snapshot.revision);
        result.put("accepted", snapshot.accepted);
        return result;
    }

    @PluginMethod public void getState(PluginCall call) {
        call.resolve(payload(WidgetStore.read(getContext())));
    }

    @PluginMethod public void saveState(PluginCall call) {
        String state = call.getString("state");
        Long revision = call.getLong("expectedRevision");
        if (state == null || revision == null) { call.reject("저장할 데이터와 버전이 필요합니다."); return; }
        try {
            WidgetStore.Snapshot saved = WidgetStore.save(getContext(), state, revision);
            MedicineWidgetProvider.updateAll(getContext());
            call.resolve(payload(saved));
        } catch (Exception error) { call.reject("위젯 데이터를 저장하지 못했습니다.", error); }
    }

    @PluginMethod public void requestPin(PluginCall call) {
        AppWidgetManager manager = AppWidgetManager.getInstance(getContext());
        boolean supported = manager.isRequestPinAppWidgetSupported();
        JSObject result = new JSObject();
        result.put("supported", supported);
        result.put("requested", supported && manager.requestPinAppWidget(new ComponentName(getContext(), MedicineWidgetProvider.class), null, null));
        call.resolve(result);
    }

    @PluginMethod public void exportData(PluginCall call) {
        if (call.getString("content") == null) { call.reject("내보낼 데이터가 필요합니다."); return; }
        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
            .setType("application/json").putExtra(Intent.EXTRA_TITLE, call.getString("filename", "medicine-records.json"));
        startActivityForResult(call, intent, "documentCreated");
    }

    @ActivityCallback private void documentCreated(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null || result.getData().getData() == null) {
            JSObject cancelled = new JSObject(); cancelled.put("cancelled", true); call.resolve(cancelled); return;
        }
        try (OutputStream stream = getContext().getContentResolver().openOutputStream(result.getData().getData())) {
            if (stream == null) throw new IllegalStateException("파일을 열지 못했습니다.");
            stream.write(call.getString("content", "{}").getBytes(StandardCharsets.UTF_8));
            JSObject saved = new JSObject(); saved.put("cancelled", false); call.resolve(saved);
        } catch (Exception error) { call.reject("데이터 파일을 저장하지 못했습니다.", error); }
    }

    public static void publishState() {
        MedicineWidgetPlugin plugin = active.get();
        if (plugin != null) plugin.notifyListeners("stateChanged", plugin.payload(WidgetStore.read(plugin.getContext())));
    }

    @Override protected void handleOnResume() {
        publishState();
        MedicineWidgetProvider.updateAll(getContext());
    }

    @Override protected void handleOnDestroy() {
        if (active.get() == this) active.clear();
    }
}
