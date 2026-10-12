package com.medicinealarm.app;

import android.Manifest;
import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.HashSet;
import java.util.Set;
import org.json.JSONObject;
import org.json.JSONArray;

public final class MedicineReminders {
    static final String CHANNEL = "medicine-doses";
    static final String FIRE = "com.medicinealarm.app.REMIND";
    private static final long GRACE = 15 * 60 * 1000;

    static void channel(Context context) {
        NotificationChannel channel = new NotificationChannel(CHANNEL, "복용 알림", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription("예약한 약 복용 시간 알림");
        context.getSystemService(NotificationManager.class).createNotificationChannel(channel);
    }

    static boolean allowed(Context context) {
        channel(context);
        return (Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED)
            && NotificationManagerCompat.from(context).areNotificationsEnabled()
            && context.getSystemService(NotificationManager.class).getNotificationChannel(CHANNEL).getImportance() != NotificationManager.IMPORTANCE_NONE;
    }

    static PendingIntent alarmIntent(Context context) {
        return PendingIntent.getBroadcast(context, 720, new Intent(context, ReminderReceiver.class).setAction(FIRE), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static Set<String> delivered(Context context, LocalDate date) {
        android.content.SharedPreferences prefs = context.getSharedPreferences("medicine_reminders", Context.MODE_PRIVATE);
        return date.toString().equals(prefs.getString("date", "")) ? new HashSet<>(prefs.getStringSet("delivered", new HashSet<>())) : new HashSet<>();
    }

    // Only one alarm is armed. Each delivery schedules the next dose, including after a rest period.
    static long next(String raw, Instant now, Set<String> sent) throws Exception {
        if (raw == null) return 0;
        JSONObject state = new JSONObject(raw);
        if (!state.optBoolean("notifications")) return 0;
        JSONArray medicines = state.getJSONArray("medicines");
        ZoneId zone = ZoneId.systemDefault();
        LocalDate today = now.atZone(zone).toLocalDate();
        long earliest = Long.MAX_VALUE;
        for (int i = 0; i < medicines.length(); i++) {
            JSONObject medicine = medicines.getJSONObject(i);
            LocalDate start = LocalDate.parse(medicine.getString("startDate"));
            LocalDate from = start.isAfter(today) ? start : today;
            JSONObject single = new JSONObject(raw);
            single.put("medicines", new JSONArray().put(medicine));
            for (int day = 0; day <= 731; day++) {
                LocalDate date = from.plusDays(day);
                boolean found = false;
                for (WidgetStore.Dose dose : WidgetStore.schedule(single.toString(), date)) {
                    long at = date.atTime(java.time.LocalTime.parse(dose.time)).atZone(zone).toInstant().toEpochMilli();
                    if (dose.completed || (date.equals(today) && sent.contains(dose.key)) || at < now.toEpochMilli() - GRACE) continue;
                    earliest = Math.min(earliest, Math.max(at, now.toEpochMilli() + 1000));
                    found = true;
                }
                if (found) break;
            }
        }
        return earliest == Long.MAX_VALUE ? 0 : earliest;
    }

    public static synchronized void refresh(Context context) {
        AlarmManager alarms = context.getSystemService(AlarmManager.class);
        alarms.cancel(alarmIntent(context));
        long next = 0;
        try {
            String raw = WidgetStore.read(context).state;
            boolean enabled = raw != null && new JSONObject(raw).optBoolean("notifications") && allowed(context);
            NotificationManager manager = context.getSystemService(NotificationManager.class);
            Set<String> pending = new HashSet<>();
            for (WidgetStore.Dose dose : WidgetStore.schedule(raw, LocalDate.now())) if (!dose.completed) pending.add(dose.key);
            for (android.service.notification.StatusBarNotification notification : manager.getActiveNotifications()) {
                if (notification.getId() == 1 && (!enabled || !pending.contains(notification.getTag()))) manager.cancel(notification.getTag(), 1);
            }
            if (enabled) next = next(raw, Instant.now(), delivered(context, LocalDate.now()));
            if (next > 0) {
                if (Build.VERSION.SDK_INT < 31 || alarms.canScheduleExactAlarms()) alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, alarmIntent(context));
                else alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, alarmIntent(context));
            }
        } catch (Exception error) {
            android.util.Log.e("MedicineReminders", "Unable to schedule dose reminder", error);
            next = 0;
        }
        context.getSharedPreferences("medicine_reminders", Context.MODE_PRIVATE).edit().putLong("next", next).apply();
    }

    static void show(Context context, WidgetStore.Dose dose) {
        PendingIntent open = PendingIntent.getActivity(context, 721, new Intent(context, MainActivity.class), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Intent complete = new Intent(context, MedicineWidgetProvider.class).setAction(MedicineWidgetProvider.ACTION_COMPLETE)
            .setData(Uri.parse("medicinealarm://notification/" + Uri.encode(dose.key))).putExtra("slotKey", dose.key);
        PendingIntent action = PendingIntent.getBroadcast(context, 722, complete, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder notification = new NotificationCompat.Builder(context, CHANNEL).setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(dose.name + " · 복용 시간").setContentText(dose.time + " · " + dose.dose + (dose.note.isEmpty() ? "" : " · " + dose.note))
            .setPriority(NotificationCompat.PRIORITY_HIGH).setCategory(NotificationCompat.CATEGORY_REMINDER).setAutoCancel(true)
            .setContentIntent(open).addAction(R.drawable.ic_notification, "복용 완료", action);
        context.getSystemService(NotificationManager.class).notify(dose.key, 1, notification.build());
    }

    static synchronized void fire(Context context, Instant now) {
        try {
            String raw = WidgetStore.read(context).state;
            if (raw == null || !new JSONObject(raw).optBoolean("notifications") || !allowed(context)) return;
            LocalDate date = now.atZone(ZoneId.systemDefault()).toLocalDate();
            Set<String> sent = delivered(context, date);
            long armed = context.getSharedPreferences("medicine_reminders", Context.MODE_PRIVATE).getLong("next", 0);
            for (WidgetStore.Dose dose : WidgetStore.schedule(raw, date)) {
                long at = date.atTime(java.time.LocalTime.parse(dose.time)).atZone(ZoneId.systemDefault()).toInstant().toEpochMilli();
                long age = now.toEpochMilli() - at;
                // Doze can delay an inexact alarm beyond the normal catch-up window.
                if (!dose.completed && !sent.contains(dose.key) && age >= 0 && (age <= GRACE || Math.abs(at - armed) <= 1000)) { show(context, dose); sent.add(dose.key); }
            }
            if (!context.getSharedPreferences("medicine_reminders", Context.MODE_PRIVATE).edit().putString("date", date.toString()).putStringSet("delivered", sent).commit()) {
                throw new IllegalStateException("알림 전달 기록을 저장하지 못했습니다.");
            }
        } catch (Exception error) { android.util.Log.e("MedicineReminders", "Unable to deliver reminder", error); }
        finally { refresh(context); MedicineWidgetProvider.updateAll(context); }
    }

    static JSObject status(Context context) {
        JSObject result = new JSObject();
        result.put("allowed", allowed(context));
        result.put("exact", Build.VERSION.SDK_INT < 31 || context.getSystemService(AlarmManager.class).canScheduleExactAlarms());
        result.put("next", context.getSharedPreferences("medicine_reminders", Context.MODE_PRIVATE).getLong("next", 0));
        return result;
    }

    static void test(Context context) {
        channel(context);
        context.getSystemService(NotificationManager.class).notify("test", 2, new NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_notification).setContentTitle("복약노트 · 테스트 알림").setContentText("복용 알림이 허용되어 있습니다.")
            .setPriority(NotificationCompat.PRIORITY_HIGH).setAutoCancel(true).build());
    }

    private MedicineReminders() {}
}
