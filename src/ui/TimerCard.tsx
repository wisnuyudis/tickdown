import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  consumedFraction,
  didBreach,
  millisToDeadline,
  overdueMillis,
  remainingBusinessMinutes,
  urgencyOf,
} from '../domain/timer';
import type { BusinessCalendar, Policy, SlaTimer } from '../domain/types';
import { formatBudget, formatDeadline, formatDuration } from './format';
import { urgencyColor, type Palette } from './theme';

export function TimerCard({
  timer,
  policy,
  calendar,
  now,
  palette,
  onPress,
}: {
  timer: SlaTimer;
  policy: Policy;
  calendar: BusinessCalendar;
  now: Date;
  palette: Palette;
  onPress: () => void;
}) {
  const accent = urgencyColor(urgencyOf(timer, policy, calendar, now), palette);
  const paused = timer.status === 'paused';
  const resolved = timer.status === 'resolved';
  const breached = didBreach(timer, now);
  const overdue = overdueMillis(timer, calendar, now);
  const left = remainingBusinessMinutes(timer, calendar, now);
  const filled = consumedFraction(timer, policy, calendar, now);
  const dueText = formatDeadline(new Date(timer.deadlineAt), calendar.timeZone, now);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: palette.surface, borderColor: palette.border, opacity: pressed ? 0.8 : 1 },
      ]}>
      <View style={styles.headerRow}>
        <View style={[styles.policyDot, { backgroundColor: policy.color }]} />
        <Text style={[styles.policy, { color: palette.muted }]} numberOfLines={1}>
          {policy.name}
        </Text>
        {timer.ref ? (
          <Text style={[styles.ref, { color: palette.faint }]} numberOfLines={1}>
            {timer.ref}
          </Text>
        ) : null}
      </View>

      <Text style={[styles.title, { color: palette.text }]} numberOfLines={2}>
        {timer.title}
      </Text>

      <View style={styles.metricRow}>
        <Text style={[styles.countdown, { color: resolved ? palette.muted : accent }]}>
          {resolved
            ? breached
              ? 'Missed'
              : 'Met'
            : paused
              ? formatBudget(left)
              : formatDuration(overdue > 0 ? overdue : millisToDeadline(timer, now))}
        </Text>
        <View style={styles.metricMeta}>
          {paused ? (
            <Text style={[styles.badge, { color: palette.muted, backgroundColor: palette.surfaceAlt }]}>
              on hold
            </Text>
          ) : null}
          {!resolved && overdue > 0 ? (
            <Text style={[styles.badge, styles.badgeLoud, { backgroundColor: palette.breached }]}>
              OVERDUE
            </Text>
          ) : null}
          <Text style={[styles.deadline, { color: palette.faint }]}>
            {resolved ? 'due ' : ''}
            {dueText}
          </Text>
        </View>
      </View>

      <View style={[styles.track, { backgroundColor: palette.surfaceAlt }]}>
        <View
          style={[
            styles.fill,
            { backgroundColor: resolved ? palette.faint : accent, width: `${Math.round(filled * 100)}%` },
          ]}
        />
      </View>

      <Text style={[styles.footnote, { color: overdue > 0 && !resolved ? palette.breached : palette.faint }]}>
        {resolved
          ? breached
            ? `late by ${formatDuration(overdue)}`
            : 'resolved on time'
          : overdue > 0
            ? `late — was due ${dueText}`
            : paused
              ? `${formatBudget(left)} of work time held`
              : `${formatBudget(left)} of work time left`}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  policyDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  policy: {
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 1,
  },
  ref: {
    fontSize: 12,
    marginLeft: 'auto',
    fontVariant: ['tabular-nums'],
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    lineHeight: 22,
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 8,
  },
  countdown: {
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.6,
    fontVariant: ['tabular-nums'],
  },
  metricMeta: {
    alignItems: 'flex-end',
    gap: 4,
  },
  badge: {
    fontSize: 11,
    fontWeight: '600',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: 'hidden',
  },
  badgeLoud: {
    letterSpacing: 0.5,
    fontWeight: '700',
    color: '#ffffff',
  },
  deadline: {
    fontSize: 13,
  },
  track: {
    height: 4,
    borderRadius: 999,
    overflow: 'hidden',
  },
  fill: {
    height: 4,
    borderRadius: 999,
  },
  footnote: {
    fontSize: 12,
  },
});
