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
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.getcapacitor.PermissionState;
import android.os.Build;
import android.provider.Settings;
import android.net.Uri;
import java.lang.ref.WeakReference;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "MedicineWidget", permissions = { @Permission(alias = "notifications", strings = { android.Manifest.permission.POST_NOTIFICATIONS }) })
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
        Object revisionValue = call.getData().opt("expectedRevision");
        if (state == null || !(revisionValue instanceof Number)) { call.reject("저장할 데이터와 버전이 필요합니다."); return; }
        Number number = (Number) revisionValue;
        double value = number.doubleValue();
        if (!Double.isFinite(value) || value < 0 || value > 9007199254740991L || value != number.longValue()) {
            call.reject("데이터 버전이 올바르지 않습니다."); return;
        }
        long revision = number.longValue();
        try {
            WidgetStore.Snapshot saved = WidgetStore.save(getContext(), state, revision);
            MedicineWidgetProvider.updateAll(getContext());
            MedicineReminders.refresh(getContext());
            call.resolve(payload(saved));
        } catch (Exception error) { call.reject("위젯 데이터를 저장하지 못했습니다.", error); }
    }

    @PluginMethod public void requestPin(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                JSObject result = WidgetPinning.request(getContext());
                call.resolve(result);
            } catch (Exception error) { call.reject("홈 화면 위젯 추가를 요청하지 못했습니다.", error); }
        });
    }

    @PluginMethod public void getWidgetStatus(PluginCall call) { call.resolve(WidgetPinning.status(getContext())); }

    @PluginMethod public void getNotificationStatus(PluginCall call) { call.resolve(MedicineReminders.status(getContext())); }

    @PluginMethod public void requestNotificationPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notifications") != PermissionState.GRANTED) requestPermissionForAlias("notifications", call, "notificationPermissionResult");
        else notificationPermissionResult(call);
    }

    @PermissionCallback private void notificationPermissionResult(PluginCall call) {
        MedicineReminders.refresh(getContext());
        call.resolve(MedicineReminders.status(getContext()));
    }

    @PluginMethod public void openNotificationSettings(PluginCall call) {
        try {
            getActivity().startActivity(new Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName()).putExtra(Settings.EXTRA_CHANNEL_ID, MedicineReminders.CHANNEL));
            call.resolve();
        } catch (Exception error) { call.reject("알림 설정을 열지 못했습니다.", error); }
    }

    @PluginMethod public void requestExactAlarmPermission(PluginCall call) {
        try {
            if (Build.VERSION.SDK_INT >= 31) getActivity().startActivity(new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:" + getContext().getPackageName())));
            call.resolve();
        } catch (Exception error) { call.reject("알람 설정을 열지 못했습니다.", error); }
    }

    @PluginMethod public void testNotification(PluginCall call) {
        if (!MedicineReminders.allowed(getContext())) { call.reject("알림 권한을 허용해 주세요."); return; }
        MedicineReminders.test(getContext()); call.resolve();
    }

    @PluginMethod public void openHome(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                getActivity().startActivity(new Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME));
                call.resolve();
            } catch (Exception error) { call.reject("홈 화면을 열지 못했습니다.", error); }
        });
    }

    public static void publishWidgetStatus() {
        MedicineWidgetPlugin plugin = active.get();
        if (plugin != null) plugin.notifyListeners("widgetStatusChanged", WidgetPinning.status(plugin.getContext()));
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
        MedicineReminders.refresh(getContext());
        publishState();
        publishWidgetStatus();
        MedicineWidgetProvider.updateAll(getContext());
    }

    @Override protected void handleOnDestroy() {
        if (active.get() == this) active.clear();
    }
}
