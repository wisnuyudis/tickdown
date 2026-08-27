import React from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { exitApp } from '../native/appSealing';
import type { SecurityAlert } from '../state/useSecurityAlert';
import { Button } from './parts';
import { securityMessage } from './securityCopy';
import type { Palette } from './theme';

/**
 * Blocking sheet shown when AppSealing reports a problem.
 *
 * Slides up over a dimmed backdrop. A blocking alert cannot be dismissed — no
 * backdrop tap, no Android back button — because the device or the moment is
 * not safe to keep using. A non-blocking one is a warning the user can wave
 * away, used only for a call signal weak enough to be a false positive.
 *
 * Holds no wording of its own; every string comes from `securityMessage()`.
 */
export function SecuritySheet({
  alert,
  palette,
  onDismiss,
}: {
  alert: SecurityAlert | null;
  palette: Palette;
  onDismiss: () => void;
}) {
  const message = alert ? securityMessage(alert) : null;
  const blocking = alert?.blocking !== false;

  return (
    <Modal
      visible={alert !== null}
      animationType="slide"
      transparent
      statusBarTranslucent
      onRequestClose={() => {
        if (!blocking) {
          onDismiss();
        }
      }}>
      <View style={styles.backdrop}>
        <SafeAreaView edges={['bottom']} style={[styles.sheet, { backgroundColor: palette.surface }]}>
          <View style={[styles.badge, { backgroundColor: palette.surfaceAlt }]}>
            <Text
              style={[styles.badgeGlyph, { color: blocking ? palette.breached : palette.warning }]}>
              !
            </Text>
          </View>

          <Text style={[styles.title, { color: palette.text }]}>{message?.title}</Text>
          <Text style={[styles.body, { color: palette.muted }]}>{message?.body}</Text>

          {message && message.reasons.length > 0 ? (
            <View style={[styles.reasons, { backgroundColor: palette.surfaceAlt }]}>
              {message.reasons.map(reason => (
                <Text key={reason} style={[styles.reason, { color: palette.muted }]}>
                  •  {reason}
                </Text>
              ))}
            </View>
          ) : null}

          <View style={styles.action}>
            <Button
              label={message?.action ?? ''}
              palette={palette}
              variant={blocking ? 'danger' : 'secondary'}
              onPress={blocking ? exitApp : onDismiss}
            />
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0, 0, 0, 0.45)' },
  sheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 32,
    paddingBottom: 24,
    alignItems: 'center',
  },
  badge: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  badgeGlyph: { fontSize: 52, fontWeight: '800', lineHeight: 60 },
  title: { fontSize: 22, fontWeight: '700', textAlign: 'center', marginBottom: 12 },
  body: { fontSize: 14, lineHeight: 21, textAlign: 'center' },
  reasons: { alignSelf: 'stretch', borderRadius: 12, padding: 14, gap: 4, marginTop: 20 },
  reason: { fontSize: 13, lineHeight: 19 },
  action: { alignSelf: 'stretch', marginTop: 24 },
});
