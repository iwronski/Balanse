import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { DayChart, type ChartPoint } from '@/components/DayChart';
import { Modal, Platform, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { EntryIcon } from '@/components/EntryIcon';
import { router } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { F } from '@/constants/type';
import { useStore } from '@/lib/store';
import { Button, Chip, Empty, Label, Press } from '@/components/ui';
import { HealthEditor, META } from '@/components/HealthEditor';
import { dayKey, fmt, fmtDay, fmtTime, isConsumed, mealCarbs, mealTitle, type HealthEvent, type HealthType, type Meal } from '@/lib/types';

type Row = { kind: 'health'; t: string; h: HealthEvent } | { kind: 'meal'; t: string; m: Meal };
type Filter = 'meal' | HealthType;
const FILTERS: { k: Filter; label: string }[] = [{ k: 'meal', label: 'Mat' }, { k: 'insulin', label: 'Insulin' }, { k: 'glucose', label: 'Glukose' }, { k: 'exercise', label: 'Aktivitet' }];
const KIND_LABEL = { hurtig: 'hurtigvirkende', langtid: 'langtidsvirkende', annet: 'annet' } as const;

export default function Log() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { health, meals } = useStore();
  const [filters, setFilters] = useState<Filter[]>(FILTERS.map((f) => f.k));
  const [viewer, setViewer] = useState<string | null>(null);
  const toggleFilter = (k: Filter) => setFilters((f) => f.includes(k) ? f.filter((x) => x !== k) : [...f, k]);
  const [editing, setEditing] = useState<HealthEvent | null>(null);
  const [mode, setMode] = useState<'list' | 'graph'>('list');
  const [day, setDay] = useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); });

  const rows = useMemo<Row[]>(() => [
    ...health.map((h) => ({ kind: 'health' as const, t: h.timestamp, h })),
    ...meals.map((m) => ({ kind: 'meal' as const, t: m.timestamp, m })),
  ].sort((a, b) => new Date(b.t).getTime() - new Date(a.t).getTime()), [health, meals]);

  const dayIso = new Date(day).toISOString();
  const key = dayKey(dayIso);
  const shift = (n: number) => { const d = new Date(day); d.setDate(d.getDate() + n); d.setHours(0, 0, 0, 0); setDay(d.getTime()); };
  const isToday = key === dayKey(new Date().toISOString());
  const dayRows = rows.filter((r) => dayKey(r.t) === key && (r.kind === 'health' || isConsumed(r.m)));
  const shown = rows.filter((r) => filters.includes(r.kind === 'meal' ? 'meal' : r.h.type));
  const points: ChartPoint[] = dayRows.flatMap((r): ChartPoint[] => {
    const t = new Date(r.t).getTime();
    if (r.kind === 'meal') return [{ id: `meal-${r.m.id}`, kind: 'meal', t, value: mealCarbs(r.m), label: `${mealTitle(r.m)} · ${fmt(mealCarbs(r.m), 1)} g karbohydrat` }];
    if (r.h.type === 'glucose') return [{ id: r.h.id, kind: 'glucose', t, value: r.h.value, label: `Glukose ${fmt(r.h.value, 1)} mmol/L`, sub: r.h.note || undefined }];
    if (r.h.type === 'insulin') return [{ id: r.h.id, kind: 'insulin', t, value: r.h.value, insulinKind: r.h.insulinKind, label: `Insulin ${fmt(r.h.value, 1)} enheter · ${r.h.insulinKind ? KIND_LABEL[r.h.insulinKind] : 'Uspesifisert'}`, sub: r.h.note || undefined }];
    return [];
  });


  const toggle = (
    <View style={{ flexDirection: 'row', backgroundColor: c.secondary, borderRadius: 999, padding: 4 }}>
      {(['list', 'graph'] as const).map((k) => (
        <Press key={k} testID={`log-mode-${k}`} accessibilityLabel={k === 'list' ? 'Vis liste' : 'Vis graf'} onPress={() => setMode(k)}
          style={{ flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, paddingVertical: 8, borderRadius: 999, backgroundColor: mode === k ? c.card : 'transparent' }}>
          <Feather name={k === 'list' ? 'list' : 'bar-chart-2'} size={14} color={c.primary} />
          <Text style={{ fontFamily: F.semibold, fontSize: 14, color: c.primary }}>{k === 'list' ? 'Liste' : 'Graf'}</Text>
        </Press>
      ))}
    </View>
  );

  const renderRow = (item: Row, index: number, list: Row[]) => {
    const showDay = index === 0 || dayKey(list[index - 1].t) !== dayKey(item.t);
    const label = showDay ? <Label style={{ marginTop: index ? 14 : 0, marginBottom: 8 }}>{fmtDay(item.t)}</Label> : null;
    if (item.kind === 'meal') {
      const m = item.m; const ref = !isConsumed(m);
      return (
        <View key={`m-${m.id}`}>
          {label}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {m.photoUri ? (
            <Pressable testID={`log-photo-${m.id}`} accessibilityRole="imagebutton" accessibilityLabel={`Vis bilde av ${mealTitle(m)} i full størrelse`} onPress={() => setViewer(m.photoUri!)}>
              <Image source={{ uri: m.photoUri }} style={{ width: 68, height: 68, borderRadius: 16, backgroundColor: c.muted }} contentFit="cover" />
            </Pressable>
          ) : null}
          <Press testID={`log-meal-${m.id}`} accessibilityLabel={`Åpne måltid ${mealTitle(m)}`} onPress={() => router.push({ pathname: '/meal/[id]', params: { id: m.id } })} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: c.card, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: c.border, opacity: ref ? 0.75 : 1 }}>
            {!m.photoUri ? <EntryIcon type="meal" /> : null}
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={{ fontFamily: F.semibold, fontSize: 15, color: c.foreground }}>{mealTitle(m)}</Text>
              <Text numberOfLines={1} style={{ fontFamily: F.body, fontSize: 13, color: c.mutedForeground }}>{ref ? 'Referanse, ikke spist' : 'Måltid'} · kl. {fmtTime(m.timestamp)}</Text>
            </View>
            <Text style={{ fontFamily: F.display, fontSize: 20, color: c.primary }}>{fmt(mealCarbs(m))} <Text style={{ fontFamily: F.medium, fontSize: 12, color: c.mutedForeground }}>g karb</Text></Text>
          </Press>
          </View>
        </View>
      );
    }
    const h = item.h; const mm = META[h.type];
    return (
      <View key={`h-${h.id}`}>
        {label}
        <Press testID={`health-${h.id}`} onPress={() => setEditing(h)} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: c.card, borderRadius: 18, padding: 14, borderWidth: 1, borderColor: c.border }}>
          <EntryIcon type={h.type} insulinKind={h.insulinKind} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontFamily: F.semibold, fontSize: 15, color: c.foreground }}>{mm.label}{h.insulinKind ? ` · ${h.insulinKind}` : ''}{h.intensity ? ` · ${h.intensity}` : ''}</Text>
            <Text numberOfLines={1} style={{ fontFamily: F.body, fontSize: 13, color: c.mutedForeground }}>kl. {fmtTime(h.timestamp)}{h.note ? ` · ${h.note}` : ''}</Text>
          </View>
          <Text style={{ fontFamily: F.display, fontSize: 20, color: c.primary }}>{fmt(h.value, 1)} <Text style={{ fontFamily: F.medium, fontSize: 12, color: c.mutedForeground }}>{mm.unit}</Text></Text>
        </Press>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingTop: 8, gap: 8, paddingBottom: 16, flexGrow: 1 }}>
        <View style={{ gap: 8 }}>
          {toggle}
          {mode === 'graph' ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Press testID="log-day-prev" accessibilityLabel="Forrige dag" onPress={() => shift(-1)} style={{ padding: 8 }}><Feather name="chevron-left" size={22} color={c.primary} /></Press>
              <Text testID="log-day-label" style={{ fontFamily: F.display, fontSize: 19, color: c.foreground }}>{fmtDay(dayIso)}</Text>
              <Press testID="log-day-next" accessibilityLabel="Neste dag" disabled={isToday} onPress={() => shift(1)} style={{ padding: 8 }}><Feather name="chevron-right" size={22} color={c.primary} /></Press>
            </View>
          ) : null}
          {mode === 'list' ? (
            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                {FILTERS.map((f) => <Chip key={f.k} label={f.label} active={filters.includes(f.k)} onPress={() => toggleFilter(f.k)} />)}
              </View>
              <View style={{ flexDirection: 'row', gap: 16, justifyContent: 'center' }}>
                <Press testID="filter-all" accessibilityLabel="Vis alle typer" onPress={() => setFilters(FILTERS.map((f) => f.k))}><Text style={{ fontFamily: F.semibold, fontSize: 13, color: c.primary }}>Vis alle</Text></Press>
                <Press testID="filter-clear" accessibilityLabel="Fjern alle filtre" onPress={() => setFilters([])}><Text style={{ fontFamily: F.semibold, fontSize: 13, color: c.mutedForeground }}>Fjern valg</Text></Press>
              </View>
            </View>
          ) : null}
        </View>
        {mode === 'graph' ? (
          <View style={{ backgroundColor: c.card, borderRadius: 20, padding: 10, borderWidth: 1, borderColor: c.border }}>
            <DayChart key={key} start={day} points={points} />
          </View>
        ) : rows.length === 0 ? (
          <Empty icon="activity" title="Ingen oppføringer ennå" body="Registrer mat, insulin, glukose eller aktivitet med «Skriv eller snakk inn»." />
        ) : shown.length === 0 ? (
          <Empty icon="filter" title={filters.length ? 'Ingenting av denne typen' : 'Ingen typer valgt'} body="Velg en eller flere typer over, eller vis alle.">
            <Button label="Vis alle" small variant="secondary" onPress={() => setFilters(FILTERS.map((f) => f.k))} style={{ marginTop: 10 }} />
          </Empty>
        ) : shown.map((r, i) => renderRow(r, i, shown))}
      </ScrollView>
      <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: Math.max(8, insets.bottom), backgroundColor: c.background }}>
        <Button label="Skriv eller snakk inn" icon="edit-3" testID="log-add-entry" onPress={() => router.push('/entry')} />
      </View>
      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(20,14,16,0.94)', justifyContent: 'center' }}>
          {viewer ? <Image testID="photo-viewer" source={{ uri: viewer }} style={{ width: '100%', height: '80%' }} contentFit="contain" accessibilityLabel="Måltidsbilde i full størrelse" /> : null}
          <Press testID="photo-viewer-close" accessibilityLabel="Lukk bilde" onPress={() => setViewer(null)}
            style={{ position: 'absolute', top: insets.top + 16, right: 16, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}>
            <Feather name="x" size={22} color="#FAF6F2" />
          </Press>
        </View>
      </Modal>
      <Modal visible={!!editing} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditing(null)}>
        {editing ? <HealthEditor key={editing.id} initial={editing} onClose={() => setEditing(null)} /> : null}
      </Modal>
    </View>
  );
}
