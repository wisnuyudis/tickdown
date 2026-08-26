/**
 * @format
 */

import React from 'react';
import { Modal, Text } from 'react-native';
import ReactTestRenderer from 'react-test-renderer';

import type { SecurityAlert } from '../state/useSecurityAlert';
import { SecuritySheet } from './SecuritySheet';
import { light } from './theme';

function render(alert: SecurityAlert | null) {
  const onDismiss = jest.fn();
  let tree!: ReactTestRenderer.ReactTestRenderer;
  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(
      <SecuritySheet alert={alert} palette={light} onDismiss={onDismiss} />,
    );
  });
  return {
    modal: tree.root.findByType(Modal),
    labels: tree.root.findAllByType(Text).flatMap(node => node.props.children).join(' '),
    onDismiss,
  };
}

const environment: SecurityAlert = {
  kind: 'environment',
  threats: ['jailbroken', 'resigned'],
  blocking: true,
};

const callWarning: SecurityAlert = {
  kind: 'call',
  threats: ['possibleCall'],
  blocking: false,
};

test('stays hidden while nothing is detected', () => {
  expect(render(null).modal.props.visible).toBe(false);
});

test('a compromised environment cannot be dismissed', () => {
  const { modal, labels, onDismiss } = render(environment);
  expect(modal.props.visible).toBe(true);
  expect(labels).toContain('Permintaan tidak dapat diproses');
  // A dismissible sheet would let the user keep going on a compromised device.
  modal.props.onRequestClose();
  expect(onDismiss).not.toHaveBeenCalled();
});

test('spells out every threat it was given', () => {
  const { labels } = render(environment);
  expect(labels).toContain('Perangkat dimodifikasi (jailbreak)');
  expect(labels).toContain('Aplikasi ditandatangani ulang');
});

test('a weak call signal is a warning the user can wave away', () => {
  const { modal, labels, onDismiss } = render(callWarning);
  expect(labels).toContain('Aktivitas panggilan terdeteksi');
  expect(labels).toContain('Saya mengerti');
  modal.props.onRequestClose();
  expect(onDismiss).toHaveBeenCalled();
});

test('a confirmed call closes the app instead', () => {
  const { labels } = render({ kind: 'call', threats: ['activeCall'], blocking: true });
  expect(labels).toContain('Panggilan terdeteksi');
  expect(labels).toContain('Tutup aplikasi');
});
