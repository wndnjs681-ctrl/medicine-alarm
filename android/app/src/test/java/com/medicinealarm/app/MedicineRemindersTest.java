package com.medicinealarm.app;

import android.Manifest;
import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.Shadows;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowAlarmManager;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Collections;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class MedicineRemindersTest {
    private Context context;
    private String raw;

    @Before public void setup() throws Exception {
        context = RuntimeEnvironment.getApplication();
        context.getSharedPreferences("medicine_widget", Context.MODE_PRIVATE).edit().clear().commit();
        context.getSharedPreferences("medicine_reminders", Context.MODE_PRIVATE).edit().clear().commit();
        Shadows.shadowOf(RuntimeEnvironment.getApplication()).grantPermissions(Manifest.permission.POST_NOTIFICATIONS);
        Shadows.shadowOf(context.getSystemService(NotificationManager.class)).setNotificationsEnabled(true);
        ShadowAlarmManager.setCanScheduleExactAlarms(true);
        raw = "{\"medicines\":[{\"id\":\"pill\",\"name\":\"주기 약\",\"dose\":\"1정\",\"note\":\"식후\",\"startDate\":\"2026-10-01\",\"times\":[\"08:00\",\"20:00\"],\"days\":[0,1,2,3,4,5,6],\"cycle\":{\"onDays\":21,\"offDays\":7}}],\"records\":[],\"alerts\":[],\"notifications\":true}";
    }

    private Instant time(String value) { return java.time.LocalDateTime.parse(value).atZone(ZoneId.systemDefault()).toInstant(); }

    @Test public void nextAlarmSkipsRestCompletedAndDeliveredDoses() throws Exception {
        assertEquals(time("2026-10-29T08:00:00").toEpochMilli(), MedicineReminders.next(raw, time("2026-10-22T12:00:00"), Collections.emptySet()));
        assertEquals(time("2026-10-12T20:00:00").toEpochMilli(), MedicineReminders.next(raw, time("2026-10-12T08:01:00"), Collections.singleton("pill:2026-10-12:08:00")));
        assertEquals(0, MedicineReminders.next(raw.replace("\"notifications\":true", "\"notifications\":false"), Instant.now(), Collections.emptySet()));
    }

    @Test public void farFutureStartAndLongRestStillSchedule() throws Exception {
        JSONObject state = new JSONObject(raw);
        state.getJSONArray("medicines").getJSONObject(0).put("startDate", "2032-01-01");
        assertEquals(time("2032-01-01T08:00:00").toEpochMilli(), MedicineReminders.next(state.toString(), time("2026-10-12T12:00:00"), Collections.emptySet()));
    }

    @Test public void refreshArmsOneAlarmAndFallsBackWithoutExactPermission() throws Exception {
        WidgetStore.save(context, raw, 0);
        MedicineReminders.refresh(context);
        assertEquals(1, Shadows.shadowOf(context.getSystemService(AlarmManager.class)).getScheduledAlarms().size());
        ShadowAlarmManager.setCanScheduleExactAlarms(false);
        MedicineReminders.refresh(context);
        assertFalse(MedicineReminders.status(context).getBool("exact"));
        assertEquals(1, Shadows.shadowOf(context.getSystemService(AlarmManager.class)).getScheduledAlarms().size());
        JSONObject off = new JSONObject(raw).put("notifications", false);
        WidgetStore.save(context, off.toString(), WidgetStore.read(context).revision);
        MedicineReminders.refresh(context);
        assertEquals(0, Shadows.shadowOf(context.getSystemService(AlarmManager.class)).getScheduledAlarms().size());
    }

    @Test public void closedAppDeliveryIsDeduplicatedAndCompletionActionUpdatesRecords() throws Exception {
        LocalDate today = LocalDate.now();
        JSONObject state = new JSONObject(raw);
        state.getJSONArray("medicines").getJSONObject(0).put("startDate", today.toString());
        WidgetStore.save(context, state.toString(), 0);
        Instant due = today.atTime(8, 1).atZone(ZoneId.systemDefault()).toInstant();
        MedicineReminders.fire(context, due);
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        String key = "pill:" + today + ":08:00";
        Notification notification = Shadows.shadowOf(manager).getNotification(key, 1);
        assertNotNull(notification);
        assertEquals(NotificationManager.IMPORTANCE_HIGH, manager.getNotificationChannel(MedicineReminders.CHANNEL).getImportance());
        assertEquals("복용 완료", notification.actions[0].title.toString());
        MedicineReminders.fire(context, due);
        assertEquals(1, Shadows.shadowOf(manager).size());
        new MedicineWidgetProvider().onReceive(context, Shadows.shadowOf(notification.actions[0].actionIntent).getSavedIntent());
        assertEquals(1, new JSONObject(WidgetStore.read(context).state).getJSONArray("records").length());
        assertNull(Shadows.shadowOf(manager).getNotification(key, 1));
    }

    @Test public void delayedAlarmStillNotifiesAndPermissionDenialCancelsScheduling() throws Exception {
        LocalDate today = LocalDate.now();
        JSONObject state = new JSONObject(raw);
        state.getJSONArray("medicines").getJSONObject(0).put("startDate", today.toString());
        WidgetStore.save(context, state.toString(), 0);
        context.getSharedPreferences("medicine_reminders", Context.MODE_PRIVATE).edit().putLong("next", today.atTime(8, 0).atZone(ZoneId.systemDefault()).toInstant().toEpochMilli()).commit();
        MedicineReminders.fire(context, today.atTime(9, 0).atZone(ZoneId.systemDefault()).toInstant());
        assertNotNull(Shadows.shadowOf(context.getSystemService(NotificationManager.class)).getNotification("pill:" + today + ":08:00", 1));
        Shadows.shadowOf(RuntimeEnvironment.getApplication()).denyPermissions(Manifest.permission.POST_NOTIFICATIONS);
        MedicineReminders.refresh(context);
        assertFalse(MedicineReminders.allowed(context));
        assertEquals(0, Shadows.shadowOf(context.getSystemService(AlarmManager.class)).getScheduledAlarms().size());
    }

    @Test public void rebootAndPackageUpdateRestoreSchedulingWithoutActivity() throws Exception {
        WidgetStore.save(context, raw, 0);
        new ReminderReceiver().onReceive(context, new Intent(Intent.ACTION_BOOT_COMPLETED));
        assertEquals(1, Shadows.shadowOf(context.getSystemService(AlarmManager.class)).getScheduledAlarms().size());
        new ReminderReceiver().onReceive(context, new Intent(Intent.ACTION_MY_PACKAGE_REPLACED));
        assertEquals(1, Shadows.shadowOf(context.getSystemService(AlarmManager.class)).getScheduledAlarms().size());
        JSONObject removed = new JSONObject(raw).put("medicines", new JSONArray());
        WidgetStore.save(context, removed.toString(), WidgetStore.read(context).revision);
        MedicineReminders.refresh(context);
        assertEquals(0, Shadows.shadowOf(context.getSystemService(AlarmManager.class)).getScheduledAlarms().size());
    }
}
