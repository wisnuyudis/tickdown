import React from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  didBreach,
  millisToDeadline,
  overdueMillis,
  remainingBusinessMinutes,
  urgencyOf,
} from '../domain/timer';
import type { BusinessCalendar, Policy, SlaTimer } from '../domain/types';
import { formatBudget, formatDuration, formatFull } from './format';
import { Button, SectionLabel } from './parts';
import { urgencyColor, type Palette } from './theme';

export function TimerDetailModal({
  timer,
  policy,
  calendar,
  now,
  palette,
  onClose,
  onPause,
  onResume,
  onResolve,
  onReopen,
  onDelete,
}: {
  timer: SlaTimer | null;
  policy: Policy | undefined;
  calendar: BusinessCalendar | undefined;
  now: Date;
  palette: Palette;
  onClose: () => void;
  onPause: () => void;
  onResume: () => void;
  onResolve: () => void;
  onReopen: () => void;
  onDelete: () => void;
}) {
  const open = Boolean(timer && policy && calendar);

  const confirmDelete = () => {
    Alert.alert('Delete timer?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          onDelete();
          onClose();
        },
      },
    ]);
  };

  return (
    <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      {timer && policy && calendar ? (
        <View style={[styles.flex, { backgroundColor: palette.bg }]}>
          <View style={[styles.header, { borderBottomColor: palette.border }]}>
            <View style={styles.headerSpacer} />
            <Text style={[styles.headerTitle, { color: palette.text }]}>Timer</Text>
            <Pressable onPress={onClose} accessibilityRole="button" hitSlop={8}>
              <Text style={[styles.headerAction, { color: palette.muted }]}>Done</Text>
            </Pressable>
          </View>

          <ScrollView contentContainerStyle={styles.body}>
            <View style={styles.titleBlock}>
              <View style={styles.policyRow}>
                <View style={[styles.policyDot, { backgroundColor: policy.color }]} />
                <Text style={[styles.policyName, { color: palette.muted }]}>{policy.name}</Text>
                {timer.ref ? <Text style={[styles.ref, { color: palette.faint }]}>{timer.ref}</Text> : null}
              </View>
              <Text style={[styles.title, { color: palette.text }]}>{timer.title}</Text>
            </View>

            <View style={[styles.hero, { backgroundColor: palette.surface, borderColor: palette.border }]}>
              <Text
                style={[
                  styles.heroValue,
                  {
                    color:
                      timer.status === 'resolved'
                        ? palette.muted
                        : urgencyColor(urgencyOf(timer, policy, calendar, now), palette),
                  },
                ]}>
                {timer.status === 'resolved'
                  ? didBreach(timer, now)
                    ? 'Missed'
                    : 'Met'
                  : timer.status === 'paused'
                    ? formatBudget(remainingBusinessMinutes(timer, calendar, now))
                    : formatDuration(
                        overdueMillis(timer, calendar, now) > 0
                          ? overdueMillis(timer, calendar, now)
                          : millisToDeadline(timer, now),
                      )}
              </Text>
              <Text style={[styles.heroCaption, { color: palette.muted }]}>
                {timer.status === 'paused'
                  ? 'work time held'
                  : timer.status === 'resolved'
                    ? didBreach(timer, now)
                      ? `late by ${formatDuration(overdueMillis(timer, calendar, now))}`
                      : `resolved on time · ${timer.closedAt ? formatFull(new Date(timer.closedAt), calendar.timeZone) : ''}`
                    : overdueMillis(timer, calendar, now) > 0
                      ? 'overdue — counting time past the deadline'
                      : `${formatBudget(remainingBusinessMinutes(timer, calendar, now))} of work time left`}
              </Text>
            </View>

            <SectionLabel palette={palette} style={styles.label}>
              Detail
            </SectionLabel>
            <View style={[styles.rows, { backgroundColor: palette.surface, borderColor: palette.border }]}>
              <Row palette={palette} label="Deadline" value={formatFull(new Date(timer.deadlineAt), calendar.timeZone)} />
              <Row palette={palette} label="Started" value={formatFull(new Date(timer.startedAt), calendar.timeZone)} />
              <Row palette={palette} label="Budget" value={`${formatBudget(policy.durationMinutes)} · ${calendar.name}`} />
              <Row palette={palette} label="Time zone" value={calendar.timeZone} last />
            </View>

            {timer.pauses.length > 0 ? (
              <>
                <SectionLabel palette={palette} style={styles.label}>
                  Holds
                </SectionLabel>
                <View style={[styles.rows, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                  {timer.pauses.map((pause, index) => (
                    <Row
                      key={`${pause.from}-${index}`}
                      palette={palette}
                      label={formatFull(new Date(pause.from), calendar.timeZone)}
                      value={pause.to ? formatFull(new Date(pause.to), calendar.timeZone) : 'ongoing'}
                      last={index === timer.pauses.length - 1}
                    />
                  ))}
                </View>
              </>
            ) : null}

            <View style={styles.actions}>
              {timer.status === 'running' ? (
                <Button label="Put on hold" palette={palette} variant="secondary" onPress={onPause} />
              ) : null}
              {timer.status === 'paused' ? (
                <Button label="Resume" palette={palette} variant="secondary" onPress={onResume} />
              ) : null}
              {timer.status === 'resolved' ? (
                <Button label="Reopen" palette={palette} variant="secondary" onPress={onReopen} />
              ) : (
                <Button label="Mark resolved" palette={palette} onPress={onResolve} />
              )}
              <Button label="Delete" palette={palette} variant="danger" onPress={confirmDelete} />
            </View>
          </ScrollView>
        </View>
      ) : null}
    </Modal>
  );
}

function Row({
  label,
  value,
  palette,
  last,
}: {
  label: string;
  value: string;
  palette: Palette;
  last?: boolean;
}) {
  return (
    <View style={[styles.row, !last && { borderBottomColor: palette.border, borderBottomWidth: StyleSheet.hairlineWidth }]}>
      <Text style={[styles.rowLabel, { color: palette.muted }]}>{label}</Text>
      <Text style={[styles.rowValue, { color: palette.text }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
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
  body: { padding: 16, paddingBottom: 40, gap: 6 },
  titleBlock: { gap: 6, marginBottom: 6 },
  policyRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  policyDot: { width: 7, height: 7, borderRadius: 4 },
  policyName: { fontSize: 13, fontWeight: '600' },
  ref: { fontSize: 13, marginLeft: 'auto' },
  title: { fontSize: 24, fontWeight: '700', letterSpacing: -0.5, lineHeight: 30 },
  hero: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingVertical: 24,
    alignItems: 'center',
    gap: 4,
  },
  heroValue: { fontSize: 44, fontWeight: '700', letterSpacing: -1.4, fontVariant: ['tabular-nums'] },
  heroCaption: { fontSize: 14 },
  label: { marginTop: 18, marginBottom: 6 },
  rows: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 12,
  },
  rowLabel: { fontSize: 14 },
  rowValue: { fontSize: 14, fontWeight: '500', flexShrink: 1 },
  actions: { marginTop: 24, gap: 10 },
});
