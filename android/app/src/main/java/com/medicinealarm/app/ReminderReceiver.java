package com.medicinealarm.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import java.time.Instant;

public class ReminderReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        if (MedicineReminders.FIRE.equals(intent.getAction())) MedicineReminders.fire(context, Instant.now());
        else MedicineReminders.refresh(context);
    }
}
