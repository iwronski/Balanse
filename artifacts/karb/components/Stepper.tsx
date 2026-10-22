import React, { useRef } from 'react';
import { Text, TextInput, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { F } from '@/constants/type';
import { Label, Press } from './ui';
import { adjustQuantity, parseDecimal, formatDecimal } from '@/lib/numericInput';

/**
 * Editable numeric value with minus/plus. Only changes the local text value via onChangeText;
 * never saves.
 */
export function Stepper({ label, value, onChangeText, step = 1, min = 0, suffix, decimals = 1, testID, disabled, placeholder = '0', accessibilityLabel, quick, autoFocus }: {
  label?: string; value: string; onChangeText: (v: string) => void; step?: number; min?: number; suffix?: string; decimals?: number;
  testID?: string; disabled?: boolean; placeholder?: string; accessibilityLabel?: string; quick?: number[]; autoFocus?: boolean;
}) {
  const c = useColors();
  const valRef = useRef(value); valRef.current = value;
  const cbRef = useRef(onChangeText); cbRef.current = onChangeText;
  const name = accessibilityLabel ?? label ?? 'Verdi';

  const bump = (dir: 1 | -1) => {
    const s = adjustQuantity(valRef.current, step, dir, min, decimals);
    valRef.current = s; cbRef.current(s);
  };

  const btn = (dir: 1 | -1) => (
    <Press testID={testID ? `${testID}-${dir > 0 ? 'inc' : 'dec'}` : undefined} disabled={disabled || (dir < 0 && !(parseDecimal(value) > min))}
      accessibilityLabel={`${dir > 0 ? 'Øk' : 'Reduser'} ${name.toLowerCase()} med ${formatDecimal(step, decimals)}`}
      onPress={() => bump(dir)} 
      style={{ width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: c.secondary }}>
      <Feather name={dir > 0 ? 'plus' : 'minus'} size={20} color={c.secondaryForeground} />
    </Press>
  );

  return (
    <View style={{ gap: 6 }}>
      {label ? <Label>{label}</Label> : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {btn(-1)}
        <View style={{ flex: 1, height: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', borderRadius: 14, borderWidth: 1.5, borderColor: c.input, backgroundColor: c.background, paddingHorizontal: 10 }}>
          <TextInput testID={testID} accessibilityLabel={name} value={value} editable={!disabled} autoFocus={autoFocus}
            onChangeText={(t) => { if (/^\d*(?:[.,]\d*)?$/.test(t)) onChangeText(t); }} keyboardType="decimal-pad" inputMode="decimal"
            placeholder={placeholder} placeholderTextColor={c.mutedForeground} selectTextOnFocus
            style={{ flex: 1, minWidth: 0, textAlign: 'center', fontFamily: F.semibold, fontSize: 19, color: c.foreground, fontVariant: ['tabular-nums'], paddingVertical: 0 }} />
          {suffix ? <Text style={{ fontFamily: F.medium, fontSize: 13, color: c.mutedForeground }}>{suffix}</Text> : null}
        </View>
        {btn(1)}
      </View>
      {quick?.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {quick.map((q) => (
            <Press key={q} disabled={disabled} testID={testID ? `${testID}-quick-${q}` : undefined} accessibilityLabel={`Sett ${name.toLowerCase()} til ${formatDecimal(q, decimals)}`}
              onPress={() => onChangeText(formatDecimal(q, decimals))}
              style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, backgroundColor: parseDecimal(value) === q ? c.primary : c.secondary }}>
              <Text style={{ fontFamily: F.medium, fontSize: 13, color: parseDecimal(value) === q ? c.primaryForeground : c.secondaryForeground }}>{formatDecimal(q, decimals)}</Text>
            </Press>
          ))}
        </View>
      ) : null}
    </View>
  );
}
