import React from 'react';
import { View } from 'react-native';
import { FontAwesome6, MaterialCommunityIcons } from '@expo/vector-icons';
import type { HealthEvent, HealthType } from '@/lib/types';

type EntryType = HealthType | 'meal';

const tones = {
  rapid: { foreground: '#282828', background: '#ECECE8' },
  long: { foreground: '#527DA4', background: '#E6EEF5' },
  other: { foreground: '#726C66', background: '#EDEBE7' },
  glucose: { foreground: '#B54F57', background: '#F6E5E7' },
  exercise: { foreground: '#282828', background: '#ECECE8' },
  meal: { foreground: '#9A7B34', background: '#F3ECD9' },
};

/** White panels stay white on both dark and light surfaces. */
export function ActivityIcon({ size = 24 }: { size?: number }) {
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ position: 'absolute', width: size * 0.8, height: size * 0.8, borderRadius: size / 2, backgroundColor: '#FFFFFF' }} />
      <MaterialCommunityIcons name="soccer" size={size} color={tones.exercise.foreground} />
    </View>
  );
}

/** Shared, decorative category symbols; the row text supplies the accessible label. */
export function EntryIcon({ type, insulinKind, bare = false }: { type: EntryType; insulinKind?: HealthEvent['insulinKind']; bare?: boolean }) {
  const tone = type === 'insulin'
    ? tones[insulinKind === 'hurtig' ? 'rapid' : insulinKind === 'langtid' ? 'long' : 'other']
    : tones[type];
  return (
    <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: bare ? 'transparent' : tone.background, alignItems: 'center', justifyContent: 'center' }}>
      {type === 'insulin'
        ? <FontAwesome6 name="syringe" size={bare ? 30 : 22} color={tone.foreground} />
        : type === 'exercise'
          ? <ActivityIcon size={bare ? 32 : 24} />
          : <MaterialCommunityIcons name={type === 'glucose' ? 'water' : 'fruit-pineapple'} size={bare ? 32 : 24} color={tone.foreground} />}
    </View>
  );
}
