import React, { useMemo, useState } from 'react';
import { FlatList, Pressable, StatusBar, StyleSheet, Text, useColorScheme, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { didBreach } from '../domain/timer';
import type { SlaTimer } from '../domain/types';
import { useLiveActivities } from '../state/useLiveActivities';
import { useNotifications } from '../state/useNotifications';
import { useNow, useTickdown } from '../state/useTickdown';
import { AddTimerModal } from './AddTimerModal';
import { SettingsModal } from './SettingsModal';
import { TimerCard } from './TimerCard';
import { TimerDetailModal } from './TimerDetailModal';
import { Chip } from './parts';
import { dark, light } from './theme';

type Tab = 'active' | 'done';

function Separator() {
  return <View style={styles.separator} />;
}

export function HomeScreen() {
  const scheme = useColorScheme();
  const palette = scheme === 'dark' ? dark : light;
  const app = useTickdown();
  const now = useNow();

  useLiveActivities({
    ready: app.ready,
    timers: app.timers,
    policyById: app.policyById,
    calendarForTimer: app.calendarForTimer,
  });

  useNotifications({
    ready: app.ready,
    timers: app.timers,
    policyById: app.policyById,
    calendarForTimer: app.calendarForTimer,
  });

  const [tab, setTab] = useState<Tab>('active');
  const [adding, setAdding] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { active, done } = useMemo(() => {
    const byDeadline = (a: SlaTimer, b: SlaTimer) =>
      new Date(a.deadlineAt).getTime() - new Date(b.deadlineAt).getTime();
    return {
      active: app.timers.filter(timer => timer.status !== 'resolved').sort(byDeadline),
      done: app.timers
        .filter(timer => timer.status === 'resolved')
        .sort((a, b) => new Date(b.closedAt ?? 0).getTime() - new Date(a.closedAt ?? 0).getTime()),
    };
  }, [app.timers]);

  const met = done.filter(timer => !didBreach(timer, now)).length;
  const list = tab === 'active' ? active : done;
  const selected = selectedId ? app.timers.find(timer => timer.id === selectedId) ?? null : null;

  return (
    <SafeAreaView style={[styles.flex, { backgroundColor: palette.bg }]} edges={['top', 'left', 'right']}>
      <StatusBar barStyle={scheme === 'dark' ? 'light-content' : 'dark-content'} />

      <View style={styles.header}>
        <View>
          <Text style={[styles.wordmark, { color: palette.text }]}>Tickdown</Text>
          <Text style={[styles.tagline, { color: palette.faint }]}>
            {tab === 'active'
              ? `${active.length} on the clock`
              : done.length > 0
                ? `${met} of ${done.length} met`
                : 'nothing closed yet'}
          </Text>
        </View>
        <Pressable
          onPress={() => setSettingsOpen(true)}
          accessibilityRole="button"
          accessibilityLabel="Settings"
          hitSlop={10}
          style={({ pressed }) => [
            styles.gear,
            { backgroundColor: palette.surface, borderColor: palette.border, opacity: pressed ? 0.7 : 1 },
          ]}>
          <Text style={[styles.gearGlyph, { color: palette.muted }]}>⚙︎</Text>
        </Pressable>
      </View>

      <View style={styles.tabs}>
        <Chip label="Active" palette={palette} selected={tab === 'active'} onPress={() => setTab('active')} />
        <Chip label="Done" palette={palette} selected={tab === 'done'} onPress={() => setTab('done')} />
      </View>

      <FlatList
        data={list}
        keyExtractor={timer => timer.id}
        contentContainerStyle={list.length === 0 ? styles.emptyContainer : styles.listContent}
        ItemSeparatorComponent={Separator}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={[styles.emptyTitle, { color: palette.muted }]}>
              {tab === 'active' ? 'No timers running' : 'Nothing closed yet'}
            </Text>
            <Text style={[styles.emptyBody, { color: palette.faint }]}>
              {tab === 'active'
                ? 'Start one when a ticket lands. The clock pauses outside your working hours.'
                : 'Resolved timers land here with their SLA outcome.'}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const policy = app.policyById(item.policyId);
          const calendar = app.calendarForTimer(item);
          if (!policy || !calendar) {
            return null;
          }
          return (
            <TimerCard
              timer={item}
              policy={policy}
              calendar={calendar}
              now={now}
              palette={palette}
              onPress={() => setSelectedId(item.id)}
            />
          );
        }}
      />

      <Pressable
        onPress={() => setAdding(true)}
        accessibilityRole="button"
        accessibilityLabel="New timer"
        style={({ pressed }) => [
          styles.fab,
          { backgroundColor: palette.accent, opacity: pressed ? 0.8 : 1 },
        ]}>
        <Text style={[styles.fabGlyph, { color: palette.onAccent }]}>+</Text>
      </Pressable>

      <AddTimerModal
        visible={adding}
        palette={palette}
        policies={app.policies}
        calendarFor={policy => app.calendarById(policy.calendarId) ?? app.calendars[0]}
        onClose={() => setAdding(false)}
        onSubmit={app.add}
      />

      <TimerDetailModal
        timer={selected}
        policy={selected ? app.policyById(selected.policyId) : undefined}
        calendar={selected ? app.calendarForTimer(selected) : undefined}
        now={now}
        palette={palette}
        onClose={() => setSelectedId(null)}
        onPause={() => selected && app.pause(selected.id)}
        onResume={() => selected && app.resume(selected.id)}
        onResolve={() => selected && app.resolve(selected.id)}
        onReopen={() => selected && app.reopen(selected.id)}
        onDelete={() => selected && app.remove(selected.id)}
      />

      {app.officeCalendar ? (
        <SettingsModal
          visible={settingsOpen}
          palette={palette}
          calendar={app.officeCalendar}
          policies={app.policies}
          onClose={() => setSettingsOpen(false)}
          onUpdateCalendar={app.updateCalendar}
          onUpdatePolicy={app.updatePolicy}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  wordmark: { fontSize: 30, fontWeight: '700', letterSpacing: -0.8 },
  tagline: { fontSize: 13, marginTop: 1 },
  gear: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gearGlyph: { fontSize: 17 },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
  listContent: { paddingHorizontal: 16, paddingBottom: 110 },
  separator: { height: 10 },
  emptyContainer: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 40 },
  empty: { alignItems: 'center', gap: 6 },
  emptyTitle: { fontSize: 16, fontWeight: '600' },
  emptyBody: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 34,
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  fabGlyph: { fontSize: 30, fontWeight: '400', lineHeight: 34 },
});
