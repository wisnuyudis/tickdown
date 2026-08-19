import React from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import type { Palette } from './theme';

export function Chip({
  label,
  selected,
  palette,
  onPress,
  tint,
}: {
  label: string;
  selected?: boolean;
  palette: Palette;
  onPress?: () => void;
  tint?: string;
}) {
  const active = Boolean(selected);
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={onPress ? { selected: active } : undefined}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: active ? tint ?? palette.accent : palette.surfaceAlt,
          borderColor: active ? tint ?? palette.accent : palette.border,
          opacity: pressed ? 0.7 : 1,
        },
      ]}>
      <Text
        style={[
          styles.chipText,
          { color: active ? (tint ? '#ffffff' : palette.onAccent) : palette.muted },
        ]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Button({
  label,
  palette,
  onPress,
  variant = 'primary',
  disabled,
}: {
  label: string;
  palette: Palette;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
}) {
  const background =
    variant === 'primary' ? palette.accent : variant === 'danger' ? palette.breached : palette.surfaceAlt;
  const color =
    variant === 'primary' ? palette.onAccent : variant === 'danger' ? '#ffffff' : palette.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: background, opacity: disabled ? 0.4 : pressed ? 0.75 : 1 },
      ]}>
      <Text style={[styles.buttonText, { color }]}>{label}</Text>
    </Pressable>
  );
}

export function Stepper({
  value,
  palette,
  onChange,
  step = 30,
  min = 0,
  max = Number.MAX_SAFE_INTEGER,
}: {
  value: number;
  palette: Palette;
  onChange: (next: number) => void;
  step?: number;
  min?: number;
  max?: number;
}) {
  const nudge = (delta: number) => onChange(Math.min(max, Math.max(min, value + delta)));
  return (
    <View style={styles.stepper}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Decrease"
        onPress={() => nudge(-step)}
        style={({ pressed }) => [
          styles.stepperButton,
          { backgroundColor: palette.surfaceAlt, opacity: pressed ? 0.6 : 1 },
        ]}>
        <Text style={[styles.stepperGlyph, { color: palette.text }]}>−</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Increase"
        onPress={() => nudge(step)}
        style={({ pressed }) => [
          styles.stepperButton,
          { backgroundColor: palette.surfaceAlt, opacity: pressed ? 0.6 : 1 },
        ]}>
        <Text style={[styles.stepperGlyph, { color: palette.text }]}>+</Text>
      </Pressable>
    </View>
  );
}

export function SectionLabel({ children, palette, style }: { children: string; palette: Palette; style?: ViewStyle }) {
  return (
    <View style={style}>
      <Text style={[styles.sectionLabel, { color: palette.faint }]}>{children.toUpperCase()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
  },
  button: {
    paddingVertical: 13,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '600',
  },
  stepper: {
    flexDirection: 'row',
    gap: 6,
  },
  stepperButton: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperGlyph: {
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 22,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.8,
  },
});
