import React, { useMemo, useRef, useState } from 'react';
import { Animated, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { F } from '@/constants/type';
import { Press, Skeleton } from '@/components/ui';
import { fmt, fmtDay } from '@/lib/types';
import { dateOfKey, shiftKey, summarizeDay, type PeriodAverage, type SumHealth, type SumMeal } from '@/lib/homeSummary';

const shortDate = (k: string) => { const d = dateOfKey(k); return `${d.getDate()}.${d.getMonth() + 1}.${String(d.getFullYear()).slice(2)}`; };

/** Dark day summary. Only the selected day is rendered; swipe or chevrons move one calendar day. */
export function HomeSummary({ ready, meals, health, day, today, earliest, avg, onChange }: {
  ready: boolean; meals: SumMeal[]; health: SumHealth[]; day: string; today: string; earliest: string; avg: PeriodAverage; onChange: (k: string) => void;
}) {
  const c = useColors();
  const [explainOpen, setExplainOpen] = useState(false);
  const s = useMemo(() => summarizeDay(meals, health, day), [meals, health, day]);
  const canPrev = day > earliest;
  const canNext = day < today;
  const x = useRef(new Animated.Value(0)).current;
  const st = useRef({ canPrev, canNext, day, onChange });
  st.current = { canPrev, canNext, day, onChange };

  const pan = useMemo(() => Gesture.Pan().runOnJS(true)
    .activeOffsetX([-12, 12]).failOffsetY([-16, 16])
    .onUpdate((g) => {
      const { canPrev: p, canNext: n } = st.current;
      const blocked = (g.translationX > 0 && !p) || (g.translationX < 0 && !n);
      x.setValue(blocked ? g.translationX * 0.2 : g.translationX);
    })
    .onEnd((g) => {
      const { canPrev: p, canNext: n, day: d, onChange: go } = st.current;
      const dir = g.translationX > 60 && p ? -1 : g.translationX < -60 && n ? 1 : 0;
      if (!dir) { Animated.spring(x, { toValue: 0, useNativeDriver: true }).start(); return; }
      Animated.timing(x, { toValue: dir > 0 ? -320 : 320, duration: 140, useNativeDriver: true }).start(() => {
        go(shiftKey(d, dir));
        x.setValue(dir > 0 ? 160 : -160);
        Animated.spring(x, { toValue: 0, useNativeDriver: true, speed: 18 }).start();
      });
    })
    .onFinalize((_, success) => { if (!success) Animated.spring(x, { toValue: 0, useNativeDriver: true }).start(); }), [x]);

  const fg = c.primaryForeground;
  const mut = '#C9C9C5';
  const dayLabel = fmtDay(dateOfKey(day).toISOString());
  const opacity = x.interpolate({ inputRange: [-320, 0, 320], outputRange: [0, 1, 0], extrapolate: 'clamp' });

  return (
    <GestureDetector gesture={pan} touchAction="pan-y">
    <View testID="home-summary" style={{ backgroundColor: c.primary, borderRadius: 20, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 20 }}>
        <Press testID="summary-prev" accessibilityLabel="Forrige dag" disabled={!canPrev} onPress={() => onChange(shiftKey(day, -1))}
          style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
          <Feather name="chevron-left" size={22} color={fg} />
        </Press>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text testID="summary-day-label" accessibilityLiveRegion="polite" style={{ fontFamily: F.semibold, fontSize: 17, lineHeight: 22.1, color: fg }}>{dayLabel}</Text>
          {day !== today ? (
            <Press testID="summary-today" onPress={() => onChange(today)} accessibilityLabel="Gå til i dag">
              <Text style={{ fontFamily: F.medium, fontSize: 13, lineHeight: 16.9, color: mut, textDecorationLine: 'underline' }}>Tilbake til i dag</Text>
            </Press>
          ) : null}
        </View>
        <Press testID="summary-next" accessibilityLabel="Neste dag" disabled={!canNext} onPress={() => onChange(shiftKey(day, 1))}
          style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
          <Feather name="chevron-right" size={22} color={fg} />
        </Press>
      </View>

      <Animated.View style={{ transform: [{ translateX: x }], opacity, paddingHorizontal: 20, paddingTop: 8, paddingBottom: 20 }}>
        {!ready ? <Skeleton h={44} w={140} style={{ opacity: 0.25 }} /> : (
          <View style={{ flexDirection: 'row', alignItems: 'stretch', gap: 16 }}>
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
              <Text testID="today-total" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}
                accessibilityLabel={`${fmt(s.carbs)} gram karbohydrat, ${dayLabel}`}
                style={{ fontFamily: F.semibold, fontSize: 44, lineHeight: 44, letterSpacing: -0.88, fontVariant: ['tabular-nums'], color: fg }}>
                {fmt(s.carbs)} <Text style={{ fontFamily: F.medium, fontSize: 20, letterSpacing: 0, color: mut }}>g</Text>
              </Text>
              <Text style={{ fontFamily: F.medium, fontSize: 13, lineHeight: 16.9, color: mut }}>Karbohydrat</Text>
              <Text style={{ fontFamily: F.medium, fontSize: 13, lineHeight: 16.9, color: mut }}>
                {s.meals ? `${s.meals} ${s.meals === 1 ? 'måltid' : 'måltider'}` : 'Ingen måltider'}
              </Text>
            </View>
            <View style={{ width: 1, backgroundColor: 'rgba(255,255,255,0.25)', marginVertical: 4 }} />
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
              <Text testID="today-rapid-insulin" numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}
                accessibilityLabel={`${fmt(s.rapid, 1)} enheter hurtigvirkende insulin, ${dayLabel}`}
                style={{ fontFamily: F.semibold, fontSize: 44, lineHeight: 44, letterSpacing: -0.88, fontVariant: ['tabular-nums'], color: fg }}>
                {fmt(s.rapid, 1)} <Text style={{ fontFamily: F.medium, fontSize: 20, letterSpacing: 0, color: mut }}>E</Text>
              </Text>
              <Text style={{ fontFamily: F.medium, fontSize: 13, lineHeight: 16.9, color: mut }}>Hurtiginsulin</Text>
              <Text style={{ fontFamily: F.medium, fontSize: 13, lineHeight: 16.9, color: mut }}>
                {s.rapidCount ? `${s.rapidCount} ${s.rapidCount === 1 ? 'registrering' : 'registreringer'}` : 'Ingen registreringer'}
              </Text>
            </View>
          </View>
        )}
      </Animated.View>

      <Press testID="period-average" accessibilityLabel="Snitt per dag"
        accessibilityHint={explainOpen ? 'Skjul forklaring' : 'Vis forklaring av gjennomsnittet'}
        accessibilityState={{ expanded: explainOpen }} onPress={() => setExplainOpen(open => !open)}
        style={{ backgroundColor: 'rgba(255,255,255,0.09)', paddingHorizontal: 20, paddingVertical: 12, gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
              <Text style={{ fontFamily: F.medium, fontSize: 13, lineHeight: 16.9, color: mut }}>Snitt per dag</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text testID="period-average-values" style={{ fontFamily: F.semibold, fontSize: 15, lineHeight: 21, fontVariant: ['tabular-nums'], color: fg }}>
                  {avg.days ? `${fmt(avg.carbs)} g · ${fmt(avg.rapid, 1)} E` : '—'}
                </Text>
                <Feather name={explainOpen ? 'chevron-up' : 'chevron-down'} size={16} color={fg} />
              </View>
            </View>
            {explainOpen ? <Text testID="period-average-explainer" style={{ fontFamily: F.medium, fontSize: 13, lineHeight: 16.9, color: mut }}>
              {avg.days === 0 ? 'Snitt per dag vises når du har registrert måltider eller hurtiginsulin.' :
                `${avg.days} ${avg.days === 1 ? 'dag' : 'dager'} med data${avg.firstKey && avg.firstKey !== avg.lastKey ? ` (${shortDate(avg.firstKey)}–${shortDate(avg.lastKey!)})` : ''}: måltider ${avg.carbDays} d, hurtiginsulin ${avg.rapidDays} d. Dager uten noen av delene telles ikke; mangler én, regnes den som 0.`}
            </Text> : null}
      </Press>
    </View>
    </GestureDetector>
  );
}
