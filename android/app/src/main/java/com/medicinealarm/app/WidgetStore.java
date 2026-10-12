package com.medicinealarm.app;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

public final class WidgetStore {
    private static final String PREFERENCES = "medicine_widget";

    public static final class Snapshot {
        public final String state;
        public final long revision;
        public final boolean accepted;
        Snapshot(String state, long revision, boolean accepted) {
            this.state = state; this.revision = revision; this.accepted = accepted;
        }
    }

    public static final class Dose {
        public final String medicineId, name, dose, note, date, time, key;
        public final boolean completed;
        Dose(JSONObject medicine, String date, String time, boolean completed) throws JSONException {
            medicineId = medicine.getString("id"); name = medicine.getString("name");
            dose = medicine.getString("dose"); note = medicine.optString("note");
            this.date = date; this.time = time; this.completed = completed;
            key = medicineId + ":" + date + ":" + time;
        }
    }

    public static final class CyclePhase {
        public final String phase;
        public final int day, length;
        public final LocalDate resumeDate;
        CyclePhase(String phase, int day, int length, LocalDate resumeDate) {
            this.phase = phase; this.day = day; this.length = length; this.resumeDate = resumeDate;
        }
    }

    public static final class RestPeriod {
        public final String name;
        public final CyclePhase status;
        RestPeriod(String name, CyclePhase status) { this.name = name; this.status = status; }
    }

    private static SharedPreferences preferences(Context context) {
        return context.getApplicationContext().getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE);
    }

    public static synchronized Snapshot read(Context context) {
        SharedPreferences prefs = preferences(context);
        return new Snapshot(prefs.getString("state", null), prefs.getLong("revision", 0), true);
    }

    public static synchronized Snapshot save(Context context, String raw, long expectedRevision) throws JSONException {
        JSONObject state = new JSONObject(raw);
        validate(state);
        Snapshot current = read(context);
        if (current.revision != expectedRevision) return new Snapshot(current.state, current.revision, false);
        if (raw.equals(current.state)) return current;
        long revision = current.revision + 1;
        if (!preferences(context).edit().putString("state", raw).putLong("revision", revision).commit()) {
            throw new IllegalStateException("복용 기록을 저장하지 못했습니다.");
        }
        return new Snapshot(raw, revision, true);
    }

    private static void validate(JSONObject state) throws JSONException {
        JSONArray medicines = state.getJSONArray("medicines");
        state.getJSONArray("records"); state.getJSONArray("alerts"); state.getBoolean("notifications");
        for (int i = 0; i < medicines.length(); i++) {
            JSONObject medicine = medicines.getJSONObject(i);
            medicine.getString("id"); medicine.getString("name"); medicine.getString("dose");
            LocalDate.parse(medicine.getString("startDate"));
            JSONArray times = medicine.getJSONArray("times");
            JSONArray days = medicine.getJSONArray("days");
            if (times.length() == 0 || days.length() == 0) throw new JSONException("복용 일정이 비어 있습니다.");
            for (int j = 0; j < times.length(); j++) LocalTime.parse(times.getString(j));
            for (int j = 0; j < days.length(); j++) {
                int day = days.getInt(j);
                if (day < 0 || day > 6) throw new JSONException("복용 요일이 올바르지 않습니다.");
            }
            if (medicine.has("cycle") && !medicine.isNull("cycle")) {
                JSONObject cycle = medicine.getJSONObject("cycle");
                cycleLength(cycle, "onDays", 1);
                cycleLength(cycle, "offDays", 0);
            }
        }
    }

    private static int cycleLength(JSONObject cycle, String key, int minimum) throws JSONException {
        Object value = cycle.get(key);
        if (!(value instanceof Number)) throw new JSONException("주기 일수가 올바르지 않습니다.");
        Number number = (Number) value;
        double days = number.doubleValue();
        if (!Double.isFinite(days) || days < minimum || days > 365 || days != number.intValue()) throw new JSONException("주기 일수가 올바르지 않습니다.");
        return number.intValue();
    }

    public static CyclePhase cyclePhase(JSONObject medicine, LocalDate date) throws JSONException {
        if (!medicine.has("cycle") || medicine.isNull("cycle")) return null;
        JSONObject cycle = medicine.getJSONObject("cycle");
        int onDays = cycleLength(cycle, "onDays", 1), offDays = cycleLength(cycle, "offDays", 0);
        LocalDate start = LocalDate.parse(medicine.getString("startDate"));
        long elapsed = ChronoUnit.DAYS.between(start, date);
        if (elapsed < 0) return new CyclePhase("pending", 0, onDays, start);
        int position = (int) (elapsed % (onDays + offDays));
        return position < onDays
            ? new CyclePhase("taking", position + 1, onDays, null)
            : new CyclePhase("rest", position - onDays + 1, offDays, date.plusDays(onDays + offDays - position));
    }

    public static List<RestPeriod> restPeriods(String raw, LocalDate date) throws JSONException {
        List<RestPeriod> result = new ArrayList<>();
        if (raw == null) return result;
        JSONArray medicines = new JSONObject(raw).getJSONArray("medicines");
        for (int i = 0; i < medicines.length(); i++) {
            JSONObject medicine = medicines.getJSONObject(i);
            CyclePhase status = cyclePhase(medicine, date);
            if (status != null && "rest".equals(status.phase)) result.add(new RestPeriod(medicine.getString("name"), status));
        }
        return result;
    }

    public static List<Dose> schedule(String raw, LocalDate date) throws JSONException {
        List<Dose> result = new ArrayList<>();
        if (raw == null) return result;
        JSONObject state = new JSONObject(raw);
        JSONArray medicines = state.getJSONArray("medicines");
        JSONArray records = state.getJSONArray("records");
        String dateString = date.toString();
        int weekday = date.getDayOfWeek().getValue() % 7;
        for (int i = 0; i < medicines.length(); i++) {
            JSONObject medicine = medicines.getJSONObject(i);
            if (LocalDate.parse(medicine.getString("startDate")).isAfter(date)) continue;
            JSONArray days = medicine.getJSONArray("days");
            boolean scheduled = false;
            CyclePhase cycle = cyclePhase(medicine, date);
            if (cycle != null) scheduled = "taking".equals(cycle.phase);
            else for (int j = 0; j < days.length(); j++) if (days.getInt(j) == weekday) scheduled = true;
            if (!scheduled) continue;
            JSONArray times = medicine.getJSONArray("times");
            for (int j = 0; j < times.length(); j++) {
                String time = times.getString(j);
                boolean completed = false;
                for (int k = 0; k < records.length(); k++) {
                    JSONObject record = records.getJSONObject(k);
                    if (medicine.getString("id").equals(record.getString("medicineId")) && dateString.equals(record.getString("date")) && time.equals(record.getString("time"))) completed = true;
                }
                result.add(new Dose(medicine, dateString, time, completed));
            }
        }
        result.sort(Comparator.comparing((Dose d) -> d.time).thenComparing(d -> d.medicineId));
        return result;
    }

    public static synchronized boolean complete(Context context, String key, LocalDate date, Instant now) throws JSONException {
        Snapshot snapshot = read(context);
        for (Dose slot : schedule(snapshot.state, date)) {
            if (!slot.key.equals(key) || slot.completed) continue;
            JSONObject state = new JSONObject(snapshot.state);
            JSONObject record = new JSONObject();
            record.put("id", slot.key); record.put("medicineId", slot.medicineId);
            record.put("name", slot.name); record.put("dose", slot.dose);
            record.put("date", slot.date); record.put("time", slot.time); record.put("takenAt", now.toString());
            state.getJSONArray("records").put(record);
            return save(context, state.toString(), snapshot.revision).accepted;
        }
        return false;
    }

    private WidgetStore() {}
}
