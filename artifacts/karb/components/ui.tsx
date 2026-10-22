import React, { useState } from 'react';
import {
  ActivityIndicator, Platform, Pressable, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle, StyleProp, type PressableProps,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Pressable as GesturePressable } from 'react-native-gesture-handler';
import { useColors } from '@/hooks/useColors';
import { F } from '@/constants/type';

export type IconName = React.ComponentProps<typeof Feather>['name'];
export const tap = (k: 'light' | 'medium' | 'success' | 'warn' = 'light') => {
  if (Platform.OS === 'web') return;
  if (k === 'success') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  else if (k === 'warn') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  else Haptics.impactAsync(k === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light).catch(() => {});
};

export function Press({ onPress, style, children, disabled, testID, haptic = true, accessibilityLabel, onLongPress, accessibilityHint, accessibilityActions, onAccessibilityAction, accessibilityState, gestureAware = false }: {
  onPress?: () => void; onLongPress?: () => void; style?: StyleProp<ViewStyle>; children: React.ReactNode; disabled?: boolean; testID?: string; haptic?: boolean; accessibilityLabel?: string; gestureAware?: boolean;
} & Pick<PressableProps, 'accessibilityHint' | 'accessibilityActions' | 'onAccessibilityAction' | 'accessibilityState'>) {
  const Target = gestureAware ? GesturePressable : Pressable;
  return (
    <Target
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ ...accessibilityState, disabled: !!disabled }}
      accessibilityActions={accessibilityActions}
      onAccessibilityAction={onAccessibilityAction}
      onLongPress={onLongPress}
      disabled={disabled}
      onPress={() => { if (haptic) tap(); onPress?.(); }}
      style={({ pressed }) => [style, { opacity: disabled ? 0.45 : pressed ? 0.82 : 1, transform: [{ scale: pressed ? 0.975 : 1 }] }]}
    >
      {children}
    </Target>
  );
}

export const SAVE_COLORS = { background: '#C3D5C5', foreground: '#263E2C' };

export function Button({ label, icon, onPress, variant = /^lagre/i.test(label) ? 'save' : 'primary', loading, disabled, testID, style, small }: {
  label: string; icon?: IconName; onPress?: () => void; variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'accent' | 'save';
  loading?: boolean; disabled?: boolean; testID?: string; style?: StyleProp<ViewStyle>; small?: boolean;
}) {
  const c = useColors();
  const bg = { primary: c.primary, secondary: c.secondary, ghost: 'transparent', danger: c.destructive, accent: c.accent, save: SAVE_COLORS.background }[variant];
  const fg = { primary: c.primaryForeground, secondary: c.secondaryForeground, ghost: c.primary, danger: c.destructiveForeground, accent: c.foreground, save: SAVE_COLORS.foreground }[variant];
  return (
    <Press testID={testID} onPress={onPress} disabled={disabled || loading}
      style={[{ backgroundColor: bg, borderRadius: 999, paddingVertical: small ? 10 : 15, paddingHorizontal: small ? 14 : 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, style]}>
      {loading ? <ActivityIndicator color={fg} size="small" /> : icon ? <Feather name={icon} size={small ? 15 : 18} color={fg} /> : null}
      <Text style={{ color: fg, fontFamily: F.semibold, fontSize: small ? 14 : 16 }}>{label}</Text>
    </Press>
  );
}

export function IconButton({ icon, onPress, testID, tone = 'card', label }: { icon: IconName; onPress: () => void; testID?: string; tone?: 'card' | 'plain'; label: string }) {
  const c = useColors();
  return (
    <Press testID={testID} onPress={onPress} accessibilityLabel={label}
      style={{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: tone === 'card' ? c.card : 'transparent', borderWidth: tone === 'card' ? StyleSheet.hairlineWidth : 0, borderColor: c.border }}>
      <Feather name={icon} size={19} color={c.primary} />
    </Press>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return <View style={[{ backgroundColor: c.card, borderRadius: c.radius, padding: 18, borderWidth: StyleSheet.hairlineWidth, borderColor: c.border, shadowColor: c.shadow, shadowOpacity: 0.06, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 1 }, style]}>{children}</View>;
}

export function Label({ children, style }: { children: React.ReactNode; style?: StyleProp<import('react-native').TextStyle> }) {
  const c = useColors();
  return <Text style={[{ fontFamily: F.semibold, fontSize: 11.5, letterSpacing: 1.2, textTransform: 'uppercase', color: c.mutedForeground }, style]}>{children}</Text>;
}

export function Field({ label, suffix, style, ...props }: TextInputProps & { label?: string; suffix?: string; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  const [focus, setFocus] = useState(false);
  return (
    <View style={style}>
      {label ? <Label style={{ marginBottom: 6 }}>{label}</Label> : null}
      <View style={{ flexDirection: 'row', alignItems: props.multiline ? 'flex-start' : 'center', backgroundColor: c.background, borderRadius: 14, borderWidth: 1.5, borderColor: focus ? c.primary : c.input, paddingHorizontal: 14 }}>
        <TextInput
          placeholderTextColor={c.mutedForeground}
          {...props}
          onFocus={(e) => { setFocus(true); props.onFocus?.(e); }}
          onBlur={(e) => { setFocus(false); props.onBlur?.(e); }}
          style={{ flex: 1, fontFamily: F.body, fontSize: 16, color: c.foreground, paddingVertical: 12, minHeight: props.multiline ? 88 : undefined, textAlignVertical: props.multiline ? 'top' : 'center' }}
        />
        {suffix ? <Text style={{ fontFamily: F.medium, color: c.mutedForeground, fontSize: 14, marginLeft: 6 }}>{suffix}</Text> : null}
      </View>
    </View>
  );
}

export function Chip({ label, active, onPress, icon }: { label: string; active?: boolean; onPress: () => void; icon?: IconName | React.ReactElement }) {
  const c = useColors();
  return (
    <Press onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, backgroundColor: active ? c.primary : c.secondary }}>
      {typeof icon === 'string' ? <Feather name={icon} size={14} color={active ? c.primaryForeground : c.secondaryForeground} /> : icon ?? null}
      <Text style={{ fontFamily: F.medium, fontSize: 14, color: active ? c.primaryForeground : c.secondaryForeground }}>{label}</Text>
    </Press>
  );
}

export function Notice({ icon = 'info', tone = 'warn', title, children, style }: { icon?: IconName; tone?: 'warn' | 'sage' | 'accent' | 'danger'; title?: string; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  const map = { warn: [c.warnSoft, c.warn], sage: [c.sageSoft, c.sage], accent: [c.accentSoft, c.accentForeground], danger: [c.destructiveSoft, c.destructive] } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={[{ backgroundColor: bg, borderRadius: 16, padding: 14, flexDirection: 'row', gap: 12 }, style]}>
      <Feather name={icon} size={18} color={fg} style={{ marginTop: 1 }} />
      <View style={{ flex: 1, gap: 3 }}>
        {title ? <Text style={{ fontFamily: F.semibold, fontSize: 14.5, color: fg }}>{title}</Text> : null}
        {typeof children === 'string' ? <Text style={{ fontFamily: F.body, fontSize: 14, lineHeight: 20, color: fg }}>{children}</Text> : children}
      </View>
    </View>
  );
}

export function Check({ checked, onToggle, label, testID }: { checked: boolean; onToggle: () => void; label: string; testID?: string }) {
  const c = useColors();
  return (
    <Press testID={testID} onPress={onToggle} style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
      <View style={{ width: 24, height: 24, borderRadius: 8, borderWidth: 2, borderColor: checked ? c.sage : c.input, backgroundColor: checked ? c.sage : 'transparent', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
        {checked ? <Feather name="check" size={15} color={c.card} /> : null}
      </View>
      <Text style={{ flex: 1, fontFamily: F.body, fontSize: 15, lineHeight: 21, color: c.foreground }}>{label}</Text>
    </Press>
  );
}

export function Empty({ icon, title, body, children }: { icon: IconName; title: string; body: string; children?: React.ReactNode }) {
  const c = useColors();
  return (
    <View style={{ alignItems: 'center', paddingVertical: 36, paddingHorizontal: 24, gap: 10 }}>
      <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 6 }}>
        <Feather name={icon} size={26} color={c.accentForeground} />
      </View>
      <Text style={{ fontFamily: F.display, fontSize: 21, color: c.foreground, textAlign: 'center' }}>{title}</Text>
      <Text style={{ fontFamily: F.body, fontSize: 15, lineHeight: 22, color: c.mutedForeground, textAlign: 'center', maxWidth: 320 }}>{body}</Text>
      {children}
    </View>
  );
}

export function Skeleton({ h = 18, w = '100%' as `${number}%` | number, style }: { h?: number; w?: `${number}%` | number; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return <View style={[{ height: h, width: w, borderRadius: 8, backgroundColor: c.muted }, style]} />;
}
