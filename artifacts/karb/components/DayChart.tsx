import React, { useMemo, useState } from 'react';
import { LayoutChangeEvent, Pressable, ScrollView, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as NativeSvgText } from 'react-native-svg';
import { useColors } from '@/hooks/useColors';
import { F } from '@/constants/type';
import { fmt, fmtTime, type HealthEvent } from '@/lib/types';
import { HIGH, LOW, dayEnd, glucoseBand, glucoseMax, glucoseRuns, hourTicks, mealBars, placeValueLabels, requiredPlotWidth, type GlucoseBand } from '@/lib/chartLayout';

export type ChartPoint = { id: string; kind: 'glucose' | 'insulin' | 'meal'; t: number; value: number; label: string; sub?: string; insulinKind?: HealthEvent['insulinKind'] };

// Explicit chart colors requested by the user (override the grayscale app palette).
const RAPID = '#282828';
const LONG = '#2F5D8C';
const OTHER = '#5E5E5A';
const BAND = { low: '#B23A2E', in: '#3B3B39', high: '#A36A0C' } as const;
const RANGE_FILL = '#DCE7DF';

const AXIS_W = 20;
const PADX = 8;
const MEAL_BAR_H = 36, G_H = 112, GAP_Y = 12, TITLE_H = 20, AXIS_H = 20;

const insColor = (k?: string) => (k === 'hurtig' ? RAPID : k === 'langtid' ? LONG : OTHER);
const insName = (k?: string) => (k === 'hurtig' ? 'Hurtigvirkende' : k === 'langtid' ? 'Langtidsvirkende' : 'Annet / uspesifisert');
const bandName: Record<GlucoseBand, string> = { low: 'Under 3,9', in: '3,9–10', high: 'Over 10' };

/** Use the same locally bundled font faces as the surrounding native UI. */
function SvgText({ fontWeight, ...props }: React.ComponentProps<typeof NativeSvgText>) {
  const weight = Number(fontWeight ?? 500);
  return <NativeSvgText {...props} fontFamily={weight >= 600 ? F.semibold : weight <= 400 ? F.body : F.medium} />;
}

function InsulinShape({ kind, x, y, s }: { kind?: string; x: number; y: number; s: number }) {
  const col = insColor(kind);
  return <Path d={`M ${x} ${y - s} L ${x + s * 0.9} ${y + s * 0.7} L ${x - s * 0.9} ${y + s * 0.7} Z`}
    fill={kind === 'hurtig' || kind === 'langtid' ? col : '#FCFCFA'} stroke={col} strokeWidth={1.2} />;
}

function GlucoseShape({ band, x, y, s }: { band: GlucoseBand; x: number; y: number; s: number }) {
  return <Circle cx={x} cy={y} r={s * (band === 'low' ? 1 : 0.85)} fill={BAND[band]} stroke="#FCFCFA" strokeWidth={1.2} />;
}

export function DayChart({ start, points }: { start: number; points: ChartPoint[] }) {
  const c = useColors();
  const [w, setW] = useState(0);
  const [sel, setSel] = useState<string | null>(null);
  const [showList, setShowList] = useState(false);
  const end = dayEnd(start);

  const g = useMemo(() => points.filter((p) => p.kind === 'glucose').sort((a, b) => a.t - b.t), [points]);
  const ins = useMemo(() => points.filter((p) => p.kind === 'insulin'), [points]);
  const meals = useMemo(() => points.filter((p) => p.kind === 'meal'), [points]);
  const sorted = useMemo(() => [...points].sort((a, b) => a.t - b.t), [points]);
  const carbTotal = meals.reduce((sum, p) => sum + p.value, 0);
  const insulinTotal = ins.filter(p => p.insulinKind !== 'langtid').reduce((sum, p) => sum + p.value, 0);
  const rapidTotal = ins.filter(p => p.insulinKind === 'hurtig').reduce((sum, p) => sum + p.value, 0);
  const otherTotal = insulinTotal - rapidTotal;

  const availW = Math.max(1, w - AXIS_W);
  const plotW = requiredPlotWidth([g.map((p) => p.t), ins.map((p) => p.t), meals.map((p) => p.t)], start, end, 0, Math.max(1, availW - PADX * 2));
  const contentW = plotW + PADX * 2;
  const x = (t: number) => PADX + ((t - start) / (end - start)) * plotW;
  const lo = PADX, hi = PADX + plotW;

  const gMax = glucoseMax(g.map((p) => p.value));
  const mMax = Math.max(60, ...meals.map((p) => p.value));
  // Compute labels in local coordinates first so crowded values get headroom, never hidden.
  const insP = mealBars(ins, x, 0, 0, 1);
  const insLabels = placeValueLabels(insP.map(p => ({ id: p.item.id, x: p.x, y: -12, text: fmt(p.item.value, 1) })));
  const gLabels = placeValueLabels(g.map(p => ({ id: p.id, x: x(p.t), y: (1 - p.value / gMax) * G_H - 10, text: fmt(p.value, 1) })));
  const localBars = mealBars(meals, x, 0, MEAL_BAR_H, mMax);
  const mealLabels = placeValueLabels(localBars.map(p => ({ id: p.item.id, x: p.x, y: p.y - 5, text: fmt(p.item.value) })));
  const gTop = Math.max(18, 14 - Math.min(0, ...gLabels.map(p => p.y)));
  const H = {
    insulin: Math.max(30, 22 - Math.min(0, ...insLabels.map(p => p.y))),
    glucose: G_H + gTop + 6,
    meal: Math.max(MEAL_BAR_H + 18, 14 - Math.min(0, ...mealLabels.map(p => p.y))),
  };
  const Y0 = { insulin: TITLE_H, glucose: TITLE_H + H.insulin + GAP_Y + TITLE_H, meal: TITLE_H + H.insulin + GAP_Y + TITLE_H + G_H + GAP_Y + TITLE_H };
  const SVG_H = Y0.meal + H.meal + AXIS_H;

  const gy = (v: number) => Y0.glucose + gTop + (1 - v / gMax) * G_H;
  const mealBase = Y0.meal + H.meal;
  const bars = localBars.map(p => ({ ...p, y: mealBase + p.y }));
  const runs = glucoseRuns(g);
  const ticks = hourTicks(start, end, plotW > 600 ? 1 : 3);
  const selected = points.find((p) => p.id === sel);
  const toggle = (id: string) => setSel((s) => (s === id ? null : id));
  const dim = (id: string) => (sel && sel !== id ? 0.35 : 1);
  const scrollable = contentW > availW + 1;
  const empty = points.length === 0;
  const timeOf = (t: number) => fmtTime(new Date(t).toISOString());
  const short = (p: ChartPoint) => p.kind === 'glucose' ? `${fmt(p.value, 1)} mmol/L` : p.kind === 'insulin' ? `${fmt(p.value, 1)} E` : `${fmt(p.value)} g`;
  const kindName = (p: ChartPoint) => p.kind === 'glucose' ? `Glukose · ${bandName[glucoseBand(p.value)]}` : p.kind === 'insulin' ? `Insulin · ${insName(p.insulinKind)}` : 'Måltid · karbohydrat';
  const hit = (p: ChartPoint, cx: number, cy: number, r = 14) => (
    <Rect key={`h-${p.id}`} x={cx - r} y={cy - r} width={r * 2} height={r * 2} fill="transparent" accessibilityLabel={`${timeOf(p.t)}: ${p.label}`} onPress={() => toggle(p.id)} />
  );

  const rangeTop = gy(Math.min(HIGH, gMax)), rangeBot = gy(LOW);

  return (
    <View onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)} style={{ gap: 8 }} testID="day-chart">
      <View testID="chart-day-totals" style={{ backgroundColor: c.secondary, borderRadius: 16, padding: 10, gap: 4 }}>
        <Text style={{ fontFamily: F.semibold, fontSize: 16, color: c.foreground }}>{fmt(carbTotal, 1)} g karbohydrat · {fmt(insulinTotal, 1)} E insulin</Text>
        <Text style={{ fontFamily: F.body, fontSize: 12, color: c.mutedForeground }}>Sum for valgt dag · uten langtidsinsulin · {fmt(rapidTotal, 1)} E hurtig{otherTotal > 0 ? ` · ${fmt(otherTotal, 1)} E annet / uspesifisert` : ''}</Text>
      </View>
      {w > 0 ? (
        <View style={{ flexDirection: 'row' }}>
          <Svg width={AXIS_W} height={SVG_H} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {[gMax, HIGH, LOW, 0].filter((v) => v <= gMax).map((v) => (
              <SvgText key={v} x={AXIS_W - 2} y={gy(v) + 3.5} fontSize={9.5} fill={v === LOW || v === HIGH ? c.foreground : c.mutedForeground} fontWeight={v === LOW || v === HIGH ? '600' : '400'} textAnchor="end">{fmt(v, 1)}</SvgText>
            ))}
          </Svg>
          <ScrollView horizontal scrollEnabled={scrollable} showsHorizontalScrollIndicator={scrollable} style={{ flex: 1 }} contentContainerStyle={{ width: Math.max(contentW, availW) }}>
            <Svg width={Math.max(contentW, availW)} height={SVG_H} accessibilityLabel={`Døgngraf: ${g.length} glukosemålinger, ${ins.length} insulin, ${meals.length} måltider`}>
              {([
                ['Insulin (E)', Y0.insulin],
                ['Glukose (mmol/L)', Y0.glucose],
                ['Karbohydrater (g)', Y0.meal],
              ] as const).map(([title, top]) => (
                <SvgText key={title} x={lo} y={top - 8} fontSize={13} fontWeight="600" fill={c.foreground}>{title}</SvgText>
              ))}
              {/* lane backgrounds */}
              <Rect x={lo} y={Y0.insulin} width={plotW} height={H.insulin} fill={c.muted} rx={6} opacity={0.4} />
              <Rect x={lo} y={Y0.meal} width={plotW} height={H.meal} fill={c.muted} rx={6} opacity={0.4} />
              {/* target band 3.9–10 */}
              <Rect x={lo} y={rangeTop} width={plotW} height={rangeBot - rangeTop} fill={RANGE_FILL} />
              <Line x1={lo} x2={hi} y1={rangeTop} y2={rangeTop} stroke="#8FAE98" strokeWidth={1} strokeDasharray="4 3" />
              <Line x1={lo} x2={hi} y1={rangeBot} y2={rangeBot} stroke={BAND.low} strokeWidth={1} strokeDasharray="4 3" opacity={0.7} />

              {ticks.map((tk) => (
                <G key={tk.t}>
                  {([['insulin', Y0.insulin, H.insulin], ['glucose', Y0.glucose, H.glucose], ['meal', Y0.meal, H.meal]] as const).map(([key, top, height]) => (
                    <Line key={key} x1={x(tk.t)} x2={x(tk.t)} y1={top} y2={top + height} stroke={c.border} strokeWidth={1} />
                  ))}
                  <SvgText x={x(tk.t)} y={SVG_H - 5} fontSize={10.5} fill={c.mutedForeground} textAnchor="middle">{tk.label}</SvgText>
                </G>
              ))}
              <Line x1={lo} x2={hi} y1={gy(0)} y2={gy(0)} stroke={c.input} strokeWidth={1} />
              <Line x1={lo} x2={hi} y1={mealBase} y2={mealBase} stroke={c.input} strokeWidth={1} />
              {/* glucose: lines only between close consecutive measurements */}
              {runs.filter((r) => r.length > 1).map((r) => (
                <Path key={`run-${r[0].id}`} d={r.map((p, i) => `${i ? 'L' : 'M'}${x(p.t)} ${gy(p.value)}`).join(' ')} stroke={BAND.in} strokeWidth={1.4} fill="none" opacity={sel ? 0.25 : 0.55} />
              ))}
              {g.map((p) => {
                const px = x(p.t);
                const b = glucoseBand(p.value); const cy = gy(p.value);
                const ly = Y0.glucose + gTop + gLabels.find(l => l.id === p.id)!.y;
                const txt = fmt(p.value, 1); const tw = txt.length * 6.4 + 8;
                return (
                  <G key={p.id} opacity={dim(p.id)}>
                    {sel === p.id ? <Circle cx={px} cy={cy} r={9} fill="none" stroke={c.foreground} strokeWidth={1.5} /> : null}
                    <GlucoseShape band={b} x={px} y={cy} s={b === 'low' ? 5.5 : 4.2} />
                    {b === 'low' ? <Rect x={px - tw / 2} y={ly - 10} width={tw} height={13} rx={4} fill={BAND.low} /> : null}
                    <SvgText x={px} y={ly} fontSize={b === 'low' ? 11 : 10} fontWeight={b === 'in' ? '500' : '600'} fill={b === 'low' ? '#FCFCFA' : BAND[b]} textAnchor="middle">{txt}</SvgText>
                    {hit(p, px, cy)}
                  </G>
                );
              })}
              {insP.map(({ item: p, x: px }) => {
                const cy = Y0.insulin + H.insulin - 8; const col = insColor(p.insulinKind);
                const ly = cy + insLabels.find(l => l.id === p.id)!.y;
                return (
                  <G key={p.id} opacity={dim(p.id)}>
                    {sel === p.id ? <Circle cx={px} cy={cy} r={9} fill="none" stroke={c.foreground} strokeWidth={1.5} /> : null}
                    <InsulinShape kind={p.insulinKind} x={px} y={cy} s={6} />
                    <SvgText x={px} y={ly} fontSize={10.5} fontWeight="600" fill={col} textAnchor="middle">{fmt(p.value, 1)}</SvgText>
                    {hit(p, px, cy - 4, 13)}
                  </G>
                );
              })}
              {bars.map(({ item: p, x: px, width, y, height: bh }) => {
                const ly = mealBase + mealLabels.find(l => l.id === p.id)!.y;
                return (
                  <G key={p.id} opacity={dim(p.id)}>
                    <Rect x={px - width / 2} y={y} width={width} height={bh} rx={Math.min(2, width / 2)} fill={sel === p.id ? c.foreground : '#8A8A85'} />
                    <SvgText x={px} y={ly} fontSize={10.5} fontWeight="600" fill={c.foreground} textAnchor="middle">{fmt(p.value)}</SvgText>
                    <Rect x={px - 10} y={mealBase - Math.max(bh, 24)} width={20} height={Math.max(bh, 24)} fill="transparent" accessibilityLabel={`${timeOf(p.t)}: ${p.label}`} onPress={() => toggle(p.id)} />
                  </G>
                );
              })}
            </Svg>
          </ScrollView>
        </View>
      ) : null}
      {scrollable ? <Text style={{ fontFamily: F.body, fontSize: 12, color: c.mutedForeground }}>Tett dag – sveip sidelengs.</Text> : null}

      {empty ? (
        <Text testID="chart-empty" style={{ fontFamily: F.body, fontSize: 14, color: c.mutedForeground, textAlign: 'center' }}>Ingen registreringer denne dagen.</Text>
      ) : selected ? (
        <Pressable testID="chart-selection" onPress={() => setSel(null)} accessibilityRole="button" accessibilityLabel="Lukk detalj" style={{ backgroundColor: c.secondary, borderRadius: 14, padding: 12, gap: 2, borderLeftWidth: 4, borderLeftColor: selected.kind === 'glucose' ? BAND[glucoseBand(selected.value)] : selected.kind === 'insulin' ? insColor(selected.insulinKind) : c.primary }}>
          <Text style={{ fontFamily: F.medium, fontSize: 12, color: c.mutedForeground, letterSpacing: 0.4 }}>{kindName(selected).toUpperCase()}</Text>
          <Text style={{ fontFamily: F.semibold, fontSize: 15, color: c.foreground }}>kl. {timeOf(selected.t)} · {selected.label}</Text>
          {selected.sub ? <Text style={{ fontFamily: F.body, fontSize: 13, color: c.mutedForeground }}>{selected.sub}</Text> : null}
          <Text style={{ fontFamily: F.body, fontSize: 11.5, color: c.mutedForeground }}>Trykk for å lukke.</Text>
        </Pressable>
      ) : null}

      {!empty ? (
        <View style={{ gap: 6 }}>
          <Pressable onPress={() => setShowList((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: showList }} style={{ paddingVertical: 6 }}>
            <Text style={{ fontFamily: F.semibold, fontSize: 13.5, color: c.primary }}>{showList ? 'Skjul liste' : `Vis som liste (${points.length})`}</Text>
          </Pressable>
          {showList ? sorted.map((p) => (
            <Pressable key={p.id} onPress={() => toggle(p.id)} accessibilityRole="button" accessibilityState={{ selected: sel === p.id }} accessibilityLabel={`kl. ${timeOf(p.t)}, ${kindName(p)}, ${p.label}`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, backgroundColor: sel === p.id ? c.secondary : 'transparent' }}>
              <Text style={{ fontFamily: F.semibold, fontSize: 13, color: c.foreground, width: 44 }}>{timeOf(p.t)}</Text>
              <Svg width={14} height={14}>{p.kind === 'glucose' ? <GlucoseShape band={glucoseBand(p.value)} x={7} y={7} s={5} /> : p.kind === 'insulin' ? <InsulinShape kind={p.insulinKind} x={7} y={7} s={5} /> : <Rect x={3} y={2} width={8} height={11} rx={1.5} fill="#8A8A85" />}</Svg>
              <Text numberOfLines={1} style={{ flex: 1, fontFamily: F.body, fontSize: 13, color: c.mutedForeground }}>{kindName(p)}</Text>
              <Text style={{ fontFamily: F.semibold, fontSize: 13, color: p.kind === 'glucose' && glucoseBand(p.value) === 'low' ? BAND.low : c.foreground }}>{short(p)}</Text>
            </Pressable>
          )) : null}
        </View>
      ) : null}
    </View>
  );
}
