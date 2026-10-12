package com.medicinealarm.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class WidgetPinCallbackReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        MedicineWidgetProvider.updateAll(context);
        MedicineWidgetPlugin.publishWidgetStatus();
    }
}
