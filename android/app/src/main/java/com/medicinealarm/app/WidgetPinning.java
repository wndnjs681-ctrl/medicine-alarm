package com.medicinealarm.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import com.getcapacitor.JSObject;

public final class WidgetPinning {
    public static JSObject status(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        JSObject result = new JSObject();
        result.put("supported", manager.isRequestPinAppWidgetSupported());
        result.put("widgetCount", manager.getAppWidgetIds(new ComponentName(context, MedicineWidgetProvider.class)).length);
        return result;
    }

    public static JSObject request(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        JSObject result = status(context);
        boolean requested = false;
        if (manager.isRequestPinAppWidgetSupported()) {
            ComponentName provider = new ComponentName(context, MedicineWidgetProvider.class);
            MedicineWidgetProvider.updateAll(context);
            Intent callback = new Intent(context, WidgetPinCallbackReceiver.class);
            PendingIntent success = PendingIntent.getBroadcast(context, 0, callback, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            Bundle extras = new Bundle();
            extras.putParcelable(AppWidgetManager.EXTRA_APPWIDGET_PREVIEW, MedicineWidgetProvider.createViews(context, 0, java.time.LocalDate.now(), java.time.LocalTime.now()));
            requested = manager.requestPinAppWidget(provider, extras, success);
        }
        result.put("requested", requested);
        return result;
    }

    private WidgetPinning() {}
}
