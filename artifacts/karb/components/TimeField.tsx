import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { F } from '@/constants/type';
import { Chip, Field, Label, Press } from './ui';

const pad = (n: number) => String(n).padStart(2, '0');
const dateStr = (d: Date) => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
const timeStr = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/** Date/time with editable text plus large hour/minute/day steppers (no native picker dependency). */
export function TimeField({ value, onChange, label = 'Tidspunkt' }: { value: string; onChange: (iso: string) => void; label?: string }) {
  const c = useColors();
  const d = new Date(value);
  const [date, setDate] = useState(dateStr(d));
  const [time, setTime] = useState(timeStr(d));
  const [typing, setTyping] = useState(false);

  const apply = (nd: Date) => { setDate(dateStr(nd)); setTime(timeStr(nd)); onChange(nd.toISOString()); };
  const commit = () => {
    const dm = date.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    const tm = time.replace('.', ':').match(/^(\d{1,2}):(\d{2})$/);
    if (dm && tm && +tm[1] < 24 && +tm[2] < 60) {
      const nd = new Date(+dm[3], +dm[2] - 1, +dm[1], +tm[1], +tm[2]);
      if (!isNaN(nd.getTime()) && nd.getFullYear() === +dm[3] &&
          nd.getMonth() === +dm[2] - 1 && nd.getDate() === +dm[1]) return apply(nd);
    }
    apply(new Date(value));
  };
  const shift = (min: number) => apply(new Date(new Date(value).getTime() + min * 60000));
  const shiftDay = (n: number) => { const nd = new Date(value); nd.setDate(nd.getDate() + n); apply(nd); };

  const wheel = (part: string, display: string, up: () => void, down: () => void, id: string) => (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Press testID={`${id}-inc`} accessibilityLabel={`Øk ${part}`} onPress={up} style={{ height: 32, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' }}>
        <Feather name="chevron-up" size={18} color={c.primary} />
      </Press>
      <Text accessibilityLabel={`${part} ${display}`} style={{ fontFamily: F.semibold, fontSize: 19, lineHeight: 24, color: c.foreground, fontVariant: ['tabular-nums'] }}>{display}</Text>
      <Press testID={`${id}-dec`} accessibilityLabel={`Reduser ${part}`} onPress={down} style={{ height: 32, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' }}>
        <Feather name="chevron-down" size={18} color={c.primary} />
      </Press>
    </View>
  );
  const today = dateStr(new Date()) === dateStr(d);
  const yesterday = dateStr(new Date(Date.now() - 864e5)) === dateStr(d);

  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Label>{label}</Label>
        <Press testID="time-toggle-typing" accessibilityLabel={typing ? 'Bruk hjul' : 'Skriv inn tid'} onPress={() => { setDate(dateStr(d)); setTime(timeStr(d)); setTyping(!typing); }}>
          <Text style={{ fontFamily: F.medium, fontSize: 13, color: c.primary, padding: 4 }}>{typing ? 'Bruk hjul' : 'Skriv inn'}</Text>
        </Press>
      </View>
      {typing ? (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Field style={{ flex: 1.4 }} value={date} onChangeText={setDate} onBlur={commit} placeholder="dd.mm.åååå" keyboardType="numbers-and-punctuation" testID="date-input" />
          <Field style={{ flex: 1 }} value={time} onChangeText={setTime} onBlur={commit} placeholder="tt:mm" keyboardType="numbers-and-punctuation" testID="time-input" />
        </View>
      ) : (
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: c.background, borderRadius: 14, borderWidth: 1.5, borderColor: c.input, paddingHorizontal: 6 }}>
          {wheel('dag', today ? 'I dag' : yesterday ? 'I går' : `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`, () => shiftDay(1), () => shiftDay(-1), 'time-day')}
          <View style={{ width: 1, height: 32, backgroundColor: c.border }} />
          {wheel('time', pad(d.getHours()), () => shift(60), () => shift(-60), 'time-hour')}
          <Text style={{ fontFamily: F.semibold, fontSize: 19, color: c.mutedForeground }}>:</Text>
          {wheel('minutt', pad(d.getMinutes()), () => shift(5), () => shift(-5), 'time-minute')}
        </View>
      )}
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        <Chip label="Nå" icon="clock" onPress={() => apply(new Date())} />
        <Chip label="−15 min" onPress={() => shift(-15)} />
        <Chip label="−1 t" onPress={() => shift(-60)} />
        <Chip label="+15 min" onPress={() => shift(15)} />
      </View>
    </View>
  );
}
