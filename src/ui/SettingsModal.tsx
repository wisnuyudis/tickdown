import React, { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { ALWAYS_ON_CALENDAR_ID, OFFICE_CALENDAR_ID, WEEKDAY_LABELS } from '../domain/defaults';
import type { BusinessCalendar, Policy, TimeWindow, Weekday } from '../domain/types';
import { formatBudget, formatClock, isDateKey } from './format';
import { Chip, SectionLabel, Stepper } from './parts';
import type { Palette } from './theme';

const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 0];
const DEFAULT_DAY: TimeWindow = { start: 9 * 60, end: 17 * 60 };

/** A day is described by its outer bounds plus an optional break in the middle. */
function dayShape(windows: TimeWindow[]) {
  if (windows.length === 0) {
    return null;
  }
  const sorted = [...windows].sort((a, b) => a.start - b.start);
  return {
    start: sorted[0].start,
    end: sorted[sorted.length - 1].end,
    breakStart: sorted.length > 1 ? sorted[0].end : null,
    breakEnd: sorted.length > 1 ? sorted[1].start : null,
  };
}

function buildDay(start: number, end: number, breakRange: { start: number; end: number } | null): TimeWindow[] {
  if (!breakRange || breakRange.start <= start || breakRange.end >= end) {
    return [{ start, end }];
  }
  return [
    { start, end: breakRange.start },
    { start: breakRange.end, end },
  ];
}

/** The break is kept uniform across the week — per-day breaks are not worth the UI. */
function currentBreak(calendar: BusinessCalendar): { start: number; end: number } | null {
  for (const day of WEEKDAYS) {
    const shape = dayShape(calendar.windows[day] ?? []);
    if (shape?.breakStart != null && shape.breakEnd != null) {
      return { start: shape.breakStart, end: shape.breakEnd };
    }
  }
  return null;
}

export function SettingsModal({
  visible,
  palette,
  calendar,
  policies,
  onClose,
  onUpdateCalendar,
  onUpdatePolicy,
}: {
  visible: boolean;
  palette: Palette;
  calendar: BusinessCalendar;
  policies: Policy[];
  onClose: () => void;
  onUpdateCalendar: (id: string, change: (calendar: BusinessCalendar) => BusinessCalendar) => void;
  onUpdatePolicy: (id: string, change: (policy: Policy) => Policy) => void;
}) {
  const [holidayDraft, setHolidayDraft] = useState('');
  const breakRange = currentBreak(calendar);

  const setDay = (day: Weekday, windows: TimeWindow[]) => {
    onUpdateCalendar(calendar.id, current => ({
      ...current,
      windows: { ...current.windows, [day]: windows },
    }));
  };

  const nudgeDay = (day: Weekday, edge: 'start' | 'end', delta: number) => {
    const shape = dayShape(calendar.windows[day] ?? []);
    if (!shape) {
      return;
    }
    const start = edge === 'start' ? Math.max(0, Math.min(shape.end - 30, shape.start + delta)) : shape.start;
    const end = edge === 'end' ? Math.min(24 * 60, Math.max(shape.start + 30, shape.end + delta)) : shape.end;
    setDay(day, buildDay(start, end, breakRange));
  };

  const setBreak = (next: { start: number; end: number } | null) => {
    onUpdateCalendar(calendar.id, current => {
      const windows = { ...current.windows };
      for (const day of WEEKDAYS) {
        const shape = dayShape(windows[day] ?? []);
        if (shape) {
          windows[day] = buildDay(shape.start, shape.end, next);
        }
      }
      return { ...current, windows };
    });
  };

  const addHoliday = () => {
    const value = holidayDraft.trim();
    if (!isDateKey(value)) {
      return;
    }
    onUpdateCalendar(calendar.id, current =>
      current.holidays.includes(value)
        ? current
        : { ...current, holidays: [...current.holidays, value].sort() },
    );
    setHolidayDraft('');
  };

  const removeHoliday = (value: string) => {
    onUpdateCalendar(calendar.id, current => ({
      ...current,
      holidays: current.holidays.filter(holiday => holiday !== value),
    }));
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={[styles.flex, { backgroundColor: palette.bg }]}>
        <View style={[styles.header, { borderBottomColor: palette.border }]}>
          <View style={styles.headerSpacer} />
          <Text style={[styles.headerTitle, { color: palette.text }]}>Settings</Text>
          <Pressable onPress={onClose} accessibilityRole="button" hitSlop={8}>
            <Text style={[styles.headerAction, { color: palette.muted }]}>Done</Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <SectionLabel palette={palette}>Working hours</SectionLabel>
          <Text style={[styles.note, { color: palette.faint }]}>
            Timers on office policies only count down inside these windows. Zone: {calendar.timeZone}
          </Text>
          <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            {WEEKDAYS.map((day, index) => {
              const shape = dayShape(calendar.windows[day] ?? []);
              const enabled = shape !== null;
              return (
                <View
                  key={day}
                  style={[
                    styles.dayRow,
                    index < WEEKDAYS.length - 1 && {
                      borderBottomColor: palette.border,
                      borderBottomWidth: StyleSheet.hairlineWidth,
                    },
                  ]}>
                  <Text style={[styles.dayName, { color: enabled ? palette.text : palette.faint }]}>
                    {WEEKDAY_LABELS[day]}
                  </Text>
                  {enabled && shape ? (
                    <View style={styles.dayControls}>
                      <View style={styles.edge}>
                        <Text style={[styles.time, { color: palette.text }]}>{formatClock(shape.start)}</Text>
                        <Stepper
                          value={shape.start}
                          palette={palette}
                          onChange={next => nudgeDay(day, 'start', next - shape.start)}
                        />
                      </View>
                      <View style={styles.edge}>
                        <Text style={[styles.time, { color: palette.text }]}>{formatClock(shape.end)}</Text>
                        <Stepper
                          value={shape.end}
                          palette={palette}
                          onChange={next => nudgeDay(day, 'end', next - shape.end)}
                        />
                      </View>
                    </View>
                  ) : (
                    <Text style={[styles.closed, { color: palette.faint }]}>closed</Text>
                  )}
                  <Switch
                    value={enabled}
                    onValueChange={on => setDay(day, on ? buildDay(DEFAULT_DAY.start, DEFAULT_DAY.end, breakRange) : [])}
                  />
                </View>
              );
            })}
          </View>

          <SectionLabel palette={palette} style={styles.label}>
            Break
          </SectionLabel>
          <View style={[styles.card, styles.breakRow, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <Text style={[styles.breakLabel, { color: palette.text }]}>
              {breakRange ? `${formatClock(breakRange.start)} – ${formatClock(breakRange.end)}` : 'No break'}
            </Text>
            {breakRange ? (
              <View style={styles.dayControls}>
                <Stepper
                  value={breakRange.start}
                  palette={palette}
                  onChange={next => setBreak({ start: Math.min(next, breakRange.end - 30), end: breakRange.end })}
                />
                <Stepper
                  value={breakRange.end}
                  palette={palette}
                  onChange={next => setBreak({ start: breakRange.start, end: Math.max(next, breakRange.start + 30) })}
                />
              </View>
            ) : null}
            <Switch
              value={breakRange !== null}
              onValueChange={on => setBreak(on ? { start: 12 * 60, end: 13 * 60 } : null)}
            />
          </View>

          <SectionLabel palette={palette} style={styles.label}>
            Holidays
          </SectionLabel>
          <View style={styles.holidayInputRow}>
            <TextInput
              value={holidayDraft}
              onChangeText={setHolidayDraft}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={palette.faint}
              autoCapitalize="none"
              autoCorrect={false}
              onSubmitEditing={addHoliday}
              returnKeyType="done"
              style={[
                styles.input,
                { backgroundColor: palette.surface, color: palette.text, borderColor: palette.border },
              ]}
            />
            <Chip label="Add" palette={palette} selected={isDateKey(holidayDraft.trim())} onPress={addHoliday} />
          </View>
          {calendar.holidays.length > 0 ? (
            <View style={styles.chipRow}>
              {calendar.holidays.map(holiday => (
                <Chip key={holiday} label={`${holiday}  ✕`} palette={palette} onPress={() => removeHoliday(holiday)} />
              ))}
            </View>
          ) : (
            <Text style={[styles.note, { color: palette.faint }]}>None yet — the clock runs every working day.</Text>
          )}

          <SectionLabel palette={palette} style={styles.label}>
            Policies
          </SectionLabel>
          <View style={[styles.card, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            {policies.map((policy, index) => (
              <View
                key={policy.id}
                style={[
                  styles.policyRow,
                  index < policies.length - 1 && {
                    borderBottomColor: palette.border,
                    borderBottomWidth: StyleSheet.hairlineWidth,
                  },
                ]}>
                <View style={[styles.policyDot, { backgroundColor: policy.color }]} />
                <View style={styles.policyText}>
                  <Text style={[styles.policyName, { color: palette.text }]}>{policy.name}</Text>
                  <Text style={[styles.policyMeta, { color: palette.faint }]}>
                    {formatBudget(policy.durationMinutes)} ·{' '}
                    {policy.calendarId === ALWAYS_ON_CALENDAR_ID ? '24/7' : 'working hours'}
                  </Text>
                </View>
                <Stepper
                  value={policy.durationMinutes}
                  palette={palette}
                  min={30}
                  step={30}
                  onChange={next => onUpdatePolicy(policy.id, current => ({ ...current, durationMinutes: next }))}
                />
                <Switch
                  value={policy.calendarId === ALWAYS_ON_CALENDAR_ID}
                  onValueChange={on =>
                    onUpdatePolicy(policy.id, current => ({
                      ...current,
                      calendarId: on ? ALWAYS_ON_CALENDAR_ID : OFFICE_CALENDAR_ID,
                    }))
                  }
                />
              </View>
            ))}
          </View>
          <Text style={[styles.note, { color: palette.faint }]}>
            The switch puts a policy on the round-the-clock calendar, for the priorities that never pause.
            Changing a policy affects new timers only.
          </Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerSpacer: { width: 44 },
  headerTitle: { fontSize: 16, fontWeight: '600' },
  headerAction: { fontSize: 16, fontWeight: '600' },
  body: { padding: 16, paddingBottom: 48, gap: 8 },
  label: { marginTop: 22 },
  note: { fontSize: 12, lineHeight: 17, marginBottom: 4 },
  card: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  dayName: { fontSize: 14, fontWeight: '600', width: 36 },
  dayControls: { flexDirection: 'row', alignItems: 'center', gap: 12, marginLeft: 'auto' },
  edge: { alignItems: 'center', gap: 4 },
  time: { fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  closed: { fontSize: 13, marginLeft: 'auto' },
  breakRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  breakLabel: { fontSize: 14, fontWeight: '500', fontVariant: ['tabular-nums'] },
  holidayInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    flex: 1,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 11,
    fontSize: 15,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  policyRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  policyDot: { width: 8, height: 8, borderRadius: 4 },
  policyText: { flex: 1 },
  policyName: { fontSize: 14, fontWeight: '600' },
  policyMeta: { fontSize: 12 },
});
