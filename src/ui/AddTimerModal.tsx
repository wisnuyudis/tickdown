import React, { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { addBusinessTime } from '../domain/businessTime';
import type { BusinessCalendar, Policy } from '../domain/types';
import { formatBudget, formatFull } from './format';
import { Chip, SectionLabel } from './parts';
import type { Palette } from './theme';

const BACKDATE_OPTIONS = [
  { label: 'Now', minutes: 0 },
  { label: '15m ago', minutes: 15 },
  { label: '1h ago', minutes: 60 },
  { label: '4h ago', minutes: 240 },
];

export function AddTimerModal({
  visible,
  palette,
  policies,
  calendarFor,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  palette: Palette;
  policies: Policy[];
  calendarFor: (policy: Policy) => BusinessCalendar;
  onClose: () => void;
  onSubmit: (input: { title: string; ref: string; policyId: string; startedAt: Date }) => void;
}) {
  const [title, setTitle] = useState('');
  const [reference, setReference] = useState('');
  const [policyId, setPolicyId] = useState(policies[1]?.id ?? policies[0]?.id ?? '');
  const [backdate, setBackdate] = useState(0);

  const policy = policies.find(p => p.id === policyId) ?? policies[0];
  const calendar = policy ? calendarFor(policy) : undefined;

  // Recomputed on every change so the real deadline is visible before saving —
  // this is where the business-hours rule stops being abstract.
  const preview = useMemo(() => {
    if (!policy || !calendar) {
      return null;
    }
    const startedAt = new Date(Date.now() - backdate * 60_000);
    return {
      startedAt,
      due: addBusinessTime(startedAt, policy.durationMinutes, calendar),
      calendar,
    };
  }, [backdate, calendar, policy]);

  const reset = () => {
    setTitle('');
    setReference('');
    setBackdate(0);
  };

  const submit = () => {
    if (!policy || !title.trim()) {
      return;
    }
    onSubmit({
      title,
      ref: reference,
      policyId: policy.id,
      startedAt: new Date(Date.now() - backdate * 60_000),
    });
    reset();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.flex, { backgroundColor: palette.bg }]}>
        <View style={[styles.header, { borderBottomColor: palette.border }]}>
          <Pressable onPress={onClose} accessibilityRole="button" hitSlop={8}>
            <Text style={[styles.headerAction, { color: palette.muted }]}>Cancel</Text>
          </Pressable>
          <Text style={[styles.headerTitle, { color: palette.text }]}>New timer</Text>
          <Pressable onPress={submit} accessibilityRole="button" hitSlop={8} disabled={!title.trim()}>
            <Text
              style={[
                styles.headerAction,
                styles.headerActionStrong,
                { color: title.trim() ? palette.text : palette.faint },
              ]}>
              Start
            </Text>
          </Pressable>
        </View>

        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <TextInput
            value={title}
            onChangeText={setTitle}
            placeholder="What is on the clock?"
            placeholderTextColor={palette.faint}
            autoFocus
            returnKeyType="next"
            style={[styles.input, styles.titleInput, { backgroundColor: palette.surface, color: palette.text, borderColor: palette.border }]}
          />
          <TextInput
            value={reference}
            onChangeText={setReference}
            placeholder="Reference (INC-1234)"
            placeholderTextColor={palette.faint}
            autoCapitalize="characters"
            autoCorrect={false}
            style={[styles.input, { backgroundColor: palette.surface, color: palette.text, borderColor: palette.border }]}
          />

          <SectionLabel palette={palette} style={styles.label}>
            Policy
          </SectionLabel>
          <View style={styles.chipRow}>
            {policies.map(item => (
              <Chip
                key={item.id}
                label={item.name}
                palette={palette}
                tint={item.color}
                selected={item.id === policyId}
                onPress={() => setPolicyId(item.id)}
              />
            ))}
          </View>

          <SectionLabel palette={palette} style={styles.label}>
            Started
          </SectionLabel>
          <View style={styles.chipRow}>
            {BACKDATE_OPTIONS.map(option => (
              <Chip
                key={option.label}
                label={option.label}
                palette={palette}
                selected={option.minutes === backdate}
                onPress={() => setBackdate(option.minutes)}
              />
            ))}
          </View>

          {preview && policy ? (
            <View style={[styles.preview, { backgroundColor: palette.surface, borderColor: palette.border }]}>
              <Text style={[styles.previewLabel, { color: palette.faint }]}>Due</Text>
              <Text style={[styles.previewValue, { color: palette.text }]}>
                {formatFull(preview.due, preview.calendar.timeZone)}
              </Text>
              <Text style={[styles.previewNote, { color: palette.muted }]}>
                {formatBudget(policy.durationMinutes)} of {preview.calendar.alwaysOn ? 'round-the-clock' : 'working'} time
                {preview.calendar.alwaysOn ? '' : ` · ${preview.calendar.name}`}
              </Text>
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
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
  headerTitle: { fontSize: 16, fontWeight: '600' },
  headerAction: { fontSize: 16 },
  headerActionStrong: { fontWeight: '700' },
  body: { padding: 16, gap: 10 },
  input: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
  },
  titleInput: { fontSize: 18, fontWeight: '500' },
  label: { marginTop: 12, marginBottom: 2 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  preview: {
    marginTop: 20,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 3,
  },
  previewLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  previewValue: { fontSize: 20, fontWeight: '700', letterSpacing: -0.4 },
  previewNote: { fontSize: 13 },
});
