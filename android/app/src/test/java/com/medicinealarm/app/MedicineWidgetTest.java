package com.medicinealarm.app;

import android.content.Context;
import android.content.Intent;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.TextView;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Rect;
import org.json.JSONObject;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.GraphicsMode;
import java.io.File;
import java.io.FileOutputStream;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34)
public class MedicineWidgetTest {
    private Context context;
    private final LocalDate date = LocalDate.of(2026, 10, 12);
    private final String state = "{\"medicines\":[{\"id\":\"vitamin\",\"name\":\"비타민 D\",\"dose\":\"1정\",\"note\":\"식사 후\",\"startDate\":\"2026-10-12\",\"times\":[\"18:00\",\"08:00\"],\"days\":[1,3,5]}],\"records\":[],\"alerts\":[],\"notifications\":false}";

    @Before public void setup() {
        context = RuntimeEnvironment.getApplication();
        context.getSharedPreferences("medicine_widget", Context.MODE_PRIVATE).edit().clear().commit();
    }

    @Test public void storageRejectsStaleAppWritesAfterWidgetCompletion() throws Exception {
        assertNull(WidgetStore.read(context).state);
        assertEquals(1, WidgetStore.save(context, state, 0).revision);
        assertTrue(WidgetStore.complete(context, "vitamin:2026-10-12:08:00", date, Instant.parse("2026-10-12T00:10:00Z")));
        WidgetStore.Snapshot rejected = WidgetStore.save(context, state, 1);
        assertFalse(rejected.accepted);
        assertEquals(2, rejected.revision);
        assertEquals(1, new JSONObject(rejected.state).getJSONArray("records").length());
    }

    @Test public void scheduleRespectsWeekdaysStartDateAndTimeOrder() throws Exception {
        assertEquals("08:00", WidgetStore.schedule(state, date).get(0).time);
        assertEquals("18:00", WidgetStore.schedule(state, date).get(1).time);
        assertTrue(WidgetStore.schedule(state, date.plusDays(1)).isEmpty());
        assertTrue(WidgetStore.schedule(state, date.minusDays(3)).isEmpty());
    }

    @Test public void widgetCompletionIsIdempotentAndPreservesOtherData() throws Exception {
        WidgetStore.save(context, state, 0);
        assertTrue(WidgetStore.complete(context, "vitamin:2026-10-12:08:00", date, Instant.parse("2026-10-12T00:10:00Z")));
        assertFalse(WidgetStore.complete(context, "vitamin:2026-10-12:08:00", date, Instant.now()));
        assertFalse(WidgetStore.complete(context, "other:2026-10-12:08:00", date, Instant.now()));
        JSONObject saved = new JSONObject(WidgetStore.read(context).state);
        assertEquals(1, saved.getJSONArray("medicines").length());
        assertEquals(1, saved.getJSONArray("records").length());
        assertEquals("비타민 D", saved.getJSONArray("records").getJSONObject(0).getString("name"));
        assertEquals("2026-10-12T00:10:00Z", saved.getJSONArray("records").getJSONObject(0).getString("takenAt"));
        assertTrue(WidgetStore.schedule(saved.toString(), date).get(0).completed);
        assertFalse(WidgetStore.schedule(saved.toString(), date).get(1).completed);
    }

    @Test public void oldWidgetButtonDoesNotRecordANewDaysDose() throws Exception {
        WidgetStore.save(context, state, 0);
        assertFalse(WidgetStore.complete(context, "vitamin:2026-10-12:08:00", date.plusDays(2), Instant.now()));
        assertEquals(0, new JSONObject(WidgetStore.read(context).state).getJSONArray("records").length());
    }

    @Test public void deletingMedicinePreservesCompletedHistory() throws Exception {
        WidgetStore.save(context, state, 0);
        WidgetStore.complete(context, "vitamin:2026-10-12:08:00", date, Instant.now());
        WidgetStore.Snapshot snapshot = WidgetStore.read(context);
        JSONObject changed = new JSONObject(snapshot.state);
        changed.put("medicines", new org.json.JSONArray());
        WidgetStore.save(context, changed.toString(), snapshot.revision);
        assertTrue(WidgetStore.schedule(WidgetStore.read(context).state, date).isEmpty());
        assertEquals(1, new JSONObject(WidgetStore.read(context).state).getJSONArray("records").length());
    }

    @Test public void remoteViewsRenderProgressAndMoveToNextPendingDose() throws Exception {
        WidgetStore.save(context, state, 0);
        WidgetStore.complete(context, "vitamin:2026-10-12:08:00", date, Instant.now());
        View view = MedicineWidgetProvider.createViews(context, 1, date, LocalTime.of(12, 0)).apply(context, new FrameLayout(context));
        assertEquals("1 / 2회 완료", ((TextView) view.findViewById(R.id.widget_progress_text)).getText().toString());
        assertEquals("18:00 · 예정", ((TextView) view.findViewById(R.id.widget_time)).getText().toString());
        assertEquals("비타민 D · 1정", ((TextView) view.findViewById(R.id.widget_name)).getText().toString());
        assertEquals(View.VISIBLE, view.findViewById(R.id.widget_complete).getVisibility());
    }

    @Test public void allCompletedAndEmptyStatesHideCompletionAction() throws Exception {
        View empty = MedicineWidgetProvider.createViews(context, 1, date, LocalTime.NOON).apply(context, new FrameLayout(context));
        assertEquals(View.GONE, empty.findViewById(R.id.widget_complete).getVisibility());
        WidgetStore.save(context, state, 0);
        WidgetStore.complete(context, "vitamin:2026-10-12:08:00", date, Instant.now());
        WidgetStore.complete(context, "vitamin:2026-10-12:18:00", date, Instant.now());
        View completed = MedicineWidgetProvider.createViews(context, 1, date, LocalTime.NOON).apply(context, new FrameLayout(context));
        assertEquals("오늘 복용 완료", ((TextView) completed.findViewById(R.id.widget_time)).getText().toString());
        assertEquals(View.GONE, completed.findViewById(R.id.widget_complete).getVisibility());
    }

    @Test public void malformedStateDoesNotOverwriteExistingRecords() throws Exception {
        WidgetStore.save(context, state, 0);
        assertThrows(Exception.class, () -> WidgetStore.save(context, "{broken", 1));
        assertEquals(state, WidgetStore.read(context).state);
    }

    @Test public void receiverCompletesTodaysDoseWithoutOpeningTheApp() throws Exception {
        LocalDate today = LocalDate.now();
        JSONObject data = new JSONObject(state);
        data.getJSONArray("medicines").getJSONObject(0).put("startDate", today.toString()).put("days", new org.json.JSONArray("[0,1,2,3,4,5,6]"));
        WidgetStore.save(context, data.toString(), 0);
        Intent action = new Intent(context, MedicineWidgetProvider.class).setAction(MedicineWidgetProvider.ACTION_COMPLETE).putExtra("slotKey", "vitamin:" + today + ":08:00");
        new MedicineWidgetProvider().onReceive(context, action);
        assertEquals(1, new JSONObject(WidgetStore.read(context).state).getJSONArray("records").length());
    }

    @Test @GraphicsMode(GraphicsMode.Mode.NATIVE)
    public void nativeWidgetRendersWithoutOverlappingItsCompletionButton() throws Exception {
        WidgetStore.save(context, state, 0);
        View view = MedicineWidgetProvider.createViews(context, 1, date, LocalTime.NOON).apply(context, new FrameLayout(context));
        view.measure(View.MeasureSpec.makeMeasureSpec(320, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(200, View.MeasureSpec.EXACTLY));
        view.layout(0, 0, 320, 200);
        TextView name = view.findViewById(R.id.widget_name);
        TextView complete = view.findViewById(R.id.widget_complete);
        Rect nameBounds = new Rect(), completeBounds = new Rect();
        name.getDrawingRect(nameBounds); complete.getDrawingRect(completeBounds);
        ((android.view.ViewGroup) view).offsetDescendantRectToMyCoords(name, nameBounds);
        ((android.view.ViewGroup) view).offsetDescendantRectToMyCoords(complete, completeBounds);
        assertFalse(Rect.intersects(nameBounds, completeBounds));
        assertTrue(completeBounds.bottom <= view.getHeight());
        Bitmap bitmap = Bitmap.createBitmap(320, 200, Bitmap.Config.ARGB_8888);
        view.draw(new Canvas(bitmap));
        assertNotEquals(bitmap.getPixel(20, 20), bitmap.getPixel(240, 170));
        File output = new File("build/reports/widget-preview.png");
        output.getParentFile().mkdirs();
        try (FileOutputStream stream = new FileOutputStream(output)) { assertTrue(bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream)); }
    }
}
