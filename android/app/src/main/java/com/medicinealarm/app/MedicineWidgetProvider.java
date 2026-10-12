package com.medicinealarm.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.view.View;
import android.widget.RemoteViews;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;

public class MedicineWidgetProvider extends AppWidgetProvider {
    public static final String ACTION_COMPLETE = "com.medicinealarm.app.COMPLETE_DOSE";

    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) manager.updateAppWidget(id, createViews(context, id, LocalDate.now(), LocalTime.now()));
    }

    @Override public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        String action = intent.getAction();
        if (ACTION_COMPLETE.equals(action)) {
            try { WidgetStore.complete(context, intent.getStringExtra("slotKey"), LocalDate.now(), Instant.now()); }
            catch (Exception ignored) { /* Preserve unreadable data; the widget offers the app as recovery. */ }
            publishAndUpdate(context);
        } else if (Intent.ACTION_DATE_CHANGED.equals(action) || Intent.ACTION_TIME_CHANGED.equals(action) || Intent.ACTION_TIMEZONE_CHANGED.equals(action)) {
            publishAndUpdate(context);
        }
    }

    private static void publishAndUpdate(Context context) {
        updateAll(context);
        MedicineWidgetPlugin.publishState();
    }

    public static void updateAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, MedicineWidgetProvider.class));
        for (int id : ids) manager.updateAppWidget(id, createViews(context, id, LocalDate.now(), LocalTime.now()));
    }

    public static RemoteViews createViews(Context context, int widgetId, LocalDate date, LocalTime now) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.medicine_widget);
        Intent open = new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openApp = PendingIntent.getActivity(context, widgetId, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        views.setOnClickPendingIntent(R.id.widget_open, openApp);
        views.setOnClickPendingIntent(R.id.widget_brand, openApp);
        views.setTextViewText(R.id.widget_date, date.format(DateTimeFormatter.ofPattern("M월 d일 (E)", Locale.KOREAN)));
        views.setViewVisibility(R.id.widget_complete, View.GONE);
        try {
            List<WidgetStore.Dose> slots = WidgetStore.schedule(WidgetStore.read(context).state, date);
            int done = 0;
            WidgetStore.Dose next = null;
            for (WidgetStore.Dose slot : slots) {
                if (slot.completed) done++;
                else if (next == null) next = slot;
            }
            views.setTextViewText(R.id.widget_progress_text, done + " / " + slots.size() + "회 완료");
            views.setProgressBar(R.id.widget_progress, Math.max(1, slots.size()), done, false);
            if (next == null) {
                views.setTextViewText(R.id.widget_time, slots.isEmpty() ? "오늘 일정 없음" : "오늘 복용 완료");
                views.setTextViewText(R.id.widget_name, slots.isEmpty() ? "앱에서 약과 복용 요일을 확인해 주세요." : "모든 복용 기록을 남겼어요.");
            } else {
                views.setTextViewText(R.id.widget_time, next.time + (LocalTime.parse(next.time).isAfter(now) ? " · 예정" : " · 미복용"));
                views.setTextViewText(R.id.widget_name, next.name + " · " + next.dose);
                views.setViewVisibility(R.id.widget_complete, View.VISIBLE);
                Intent complete = new Intent(context, MedicineWidgetProvider.class).setAction(ACTION_COMPLETE)
                    .setData(Uri.parse("medicinealarm://complete/" + widgetId + "/" + Uri.encode(next.key)))
                    .putExtra("slotKey", next.key);
                PendingIntent pending = PendingIntent.getBroadcast(context, widgetId, complete, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                views.setOnClickPendingIntent(R.id.widget_complete, pending);
            }
        } catch (Exception ignored) {
            views.setTextViewText(R.id.widget_progress_text, "확인 필요");
            views.setProgressBar(R.id.widget_progress, 1, 0, false);
            views.setTextViewText(R.id.widget_time, "앱에서 확인해 주세요");
            views.setTextViewText(R.id.widget_name, "저장된 복용 데이터를 읽지 못했습니다.");
        }
        return views;
    }
}
