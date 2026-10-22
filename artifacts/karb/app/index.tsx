import React, { useEffect, useMemo, useState } from 'react';
import { AppState, Modal, Platform, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { EntryIcon } from '@/components/EntryIcon';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useColors } from '@/hooks/useColors';
import { F } from '@/constants/type';
import { useStore } from '@/lib/store';
import { Button, Card, Press, Skeleton } from '@/components/ui';
import { SwipeMealRow } from '@/components/SwipeMealRow';
import { useMealRemoval } from '@/hooks/useMealRemoval';
import { HealthEditor, newHealthEvent } from '@/components/HealthEditor';
import { HomeSummary } from '@/components/HomeSummary';
import { clampKey, earliestKey, periodAverage, todayTimeline } from '@/lib/homeSummary';
import { dayKey, fmt, fmtTime, type HealthEvent } from '@/lib/types';

const KIND = { hurtig: 'hurtigvirkende', langtid: 'langtidsvirkende', annet: 'annet' } as const;

/** Current local day key; refreshes at local midnight and when the app returns to foreground. */
function useTodayKey() {
  const [key, setKey] = useState(() => dayKey(new Date().toISOString()));
  useEffect(() => {
    const sync = () => setKey(dayKey(new Date().toISOString()));
    let t: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const now = new Date();
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
      t = setTimeout(() => { sync(); schedule(); }, Math.min(next.getTime() - now.getTime(), 60 * 60 * 1000));
    };
    schedule();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') sync(); });
    return () => { clearTimeout(t); sub.remove(); };
  }, []);
  return key;
}

export default function Home() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { ready, meals, health } = useStore();
  const top = Platform.OS === 'web' ? Math.max(8, insets.top) : insets.top;
  const today = useTodayKey();
  const removal = useMealRemoval();
  const lastRemoved = removal.pending[removal.pending.length - 1];
  const [picked, setPicked] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<HealthEvent | null>(null);
  const earliest = useMemo(() => earliestKey(meals, health, today), [meals, health, today]);
  const day = clampKey(picked ?? today, earliest, today);
  const avg = useMemo(() => periodAverage(meals, health, today), [meals, health, today]);
  const timeline = useMemo(() => todayTimeline(meals, health, today), [meals, health, today]);
  const mealCount = timeline.filter((r) => r.kind === 'meal').length;
  const insulinCount = timeline.length - mealCount;
  const go = (k: string) => setPicked(k === today ? null : k);

  const actions = [
    { id: 'entry', icon: 'edit-3', label: 'Skriv eller snakk inn', background: '#C38F91' },
    { id: 'foods', icon: 'search', label: 'Matvaretabell', sub: 'uten nett', background: '#E3C4C5' },
  ] as const;

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
    <LinearGradient colors={['#E2E2DE', c.background, c.background]} locations={[0, 0.65, 1]}
      pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingTop: top, paddingBottom: (Platform.OS === 'web' ? 32 : insets.bottom) + (lastRemoved || removal.error ? 160 : 24), paddingHorizontal: 16, gap: 16 }}>
      <View style={{ height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Text accessibilityRole="header" testID="home-title" numberOfLines={1}
          style={{ flex: 1, fontFamily: F.bold, fontSize: 34, lineHeight: 40, letterSpacing: -1, color: c.foreground }}>Balanse</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {([['list', 'Logg', 'nav-log', '/log'], ['settings', 'Innstillinger', 'nav-settings', '/settings']] as const).map(([icon, label, id, href]) => (
            <Press key={id} testID={id} accessibilityLabel={label} onPress={() => router.push(href)}
              style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: c.primary }}>
              <Feather name={icon} size={20} color={c.primaryForeground} />
            </Press>
          ))}
        </View>
      </View>

      <Animated.View entering={FadeInDown.duration(500)}>
        <HomeSummary ready={ready} meals={meals} health={health} day={day} today={today} earliest={earliest} avg={avg} onChange={go} />
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(40).duration(500)} testID="quick-add-row" style={{ flexDirection: 'row', gap: 10 }}>
        {([
          ['glucose', 'Legg til glukose'],
          ['insulin', 'Legg til insulin'],
          ['meal', 'Legg til måltid'],
          ['exercise', 'Legg til aktivitet'],
        ] as const).map(([t, label]) => (
          <Press key={t} testID={`quick-add-${t}`} accessibilityLabel={label}
            onPress={() => t === 'meal' ? router.push({ pathname: '/capture', params: { start: 'manual' } }) : setEditing(newHealthEvent(t))}
            style={{ flex: 1, height: 64, alignItems: 'center', justifyContent: 'center' }}>
            <EntryIcon type={t} insulinKind={t === 'insulin' ? 'hurtig' : undefined} bare />
          </Press>
        ))}
      </Animated.View>

      <Animated.View testID="meal-entry-card" entering={FadeInDown.delay(80).duration(500)} style={{ gap: 12 }}>
          <Press testID="start-camera" accessibilityLabel="Fotografer måltid" onPress={() => router.push({ pathname: '/capture', params: { start: 'camera' } })}
            style={{ height: 64, backgroundColor: '#A15D60', borderRadius: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Feather name="camera" size={20} color="#FFFFFF" />
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.semibold, fontSize: 17, lineHeight: 22.1, color: '#FFFFFF' }}>Fotografer</Text>
              <Text numberOfLines={1} style={{ fontFamily: F.medium, fontSize: 13, lineHeight: 16.9, color: '#FFFFFF' }}>AI-estimat av tallerkenen</Text>
            </View>
          </Press>
          <View style={{ gap: 12 }}>
            {actions.map((a) => (
              <Press key={a.id} testID={`start-${a.id}`} onPress={() => a.id === 'entry' ? router.push('/entry') : router.push({ pathname: '/capture', params: { start: a.id } })}
                accessibilityLabel={a.id === 'foods' ? 'Søk i matvaretabellen uten nett' : a.label}
                style={{ height: 52, backgroundColor: a.background, borderRadius: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <Feather name={a.icon} size={20} color={c.foreground} />
                <Text numberOfLines={1} adjustsFontSizeToFit style={{ flex: 1, fontFamily: F.semibold, fontSize: 17, lineHeight: 22.1, color: c.foreground }}>{a.label}</Text>
                {'sub' in a ? <Text style={{ fontFamily: F.medium, fontSize: 13, lineHeight: 16.9, color: c.secondaryForeground }}>{a.sub}</Text> : null}
              </Press>
            ))}
          </View>
      </Animated.View>

      <Animated.View entering={FadeInDown.delay(200).duration(500)} style={{ gap: 8 }}>
        <Press testID="today-timeline-toggle" accessibilityLabel={open ? 'Skjul dagens registreringer' : 'Vis dagens registreringer'}
          onPress={() => setOpen(!open)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 12, minHeight: 44 }}>
          <Text style={{ fontFamily: F.semibold, fontSize: 17, lineHeight: 22.1, color: c.foreground }}>I dag</Text>
          <Text testID="today-timeline-count" style={{ flex: 1, fontFamily: F.medium, fontSize: 13, lineHeight: 16.9, color: c.mutedForeground }}>
            {mealCount} {mealCount === 1 ? 'måltid' : 'måltider'} · {insulinCount} insulin
          </Text>
          <Text style={{ fontFamily: F.semibold, fontSize: 15, lineHeight: 21, color: c.primary }}>{open ? 'Skjul' : 'Vis'}</Text>
          <Feather name={open ? 'chevron-up' : 'chevron-down'} size={18} color={c.primary} />
        </Press>
        {open ? (
          !ready ? <Card style={{ borderRadius: 20, padding: 16 }}><Skeleton h={52} /></Card> : timeline.length === 0 ? (
            <Card style={{ alignItems: 'center', gap: 8, padding: 24, borderRadius: 20 }}>
              <Feather name="sun" size={20} color={c.mutedForeground} />
              <Text style={{ fontFamily: F.body, fontSize: 15, lineHeight: 21, color: c.mutedForeground, textAlign: 'center' }}>Ingen måltider eller insulin registrert i dag ennå.</Text>
            </Card>
          ) : (
            <View testID="today-timeline" style={{ gap: 8 }}>
              <Text style={{ fontFamily: F.medium, fontSize: 13, lineHeight: 16.9, color: c.mutedForeground }}>Nyeste først · trykk for å endre · sveip måltid til venstre for å fjerne</Text>
              <Card style={{ paddingVertical: 4, paddingHorizontal: 16, borderRadius: 20 }}>
                {timeline.map((r, i) => (
                  <View key={r.kind === 'meal' ? `m-${r.meal.id}` : `h-${r.h.id}`} style={{ borderTopWidth: i ? 1 : 0, borderTopColor: c.border }}>
                    {r.kind === 'meal' ? (
                      <SwipeMealRow meal={r.meal} disabled={removal.busy} onRemove={removal.remove} />
                    ) : (
                      <Press testID={`timeline-insulin-${r.h.id}`} accessibilityLabel={`Endre insulin ${fmt(r.h.value, 1)} enheter kl. ${fmtTime(r.h.timestamp)}`}
                        onPress={() => setEditing(r.h)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
                        <EntryIcon type="insulin" insulinKind={r.h.insulinKind} />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontFamily: F.semibold, fontSize: 15, lineHeight: 21, color: c.foreground }}>Insulin · {r.h.insulinKind ? KIND[r.h.insulinKind] : 'uspesifisert'}</Text>
                          <Text numberOfLines={1} style={{ fontFamily: F.medium, fontSize: 13, lineHeight: 16.9, color: c.mutedForeground }}>kl. {fmtTime(r.h.timestamp)}{r.h.note ? ` · ${r.h.note}` : ''}</Text>
                        </View>
                        <Text style={{ fontFamily: F.semibold, fontSize: 17, lineHeight: 22.1, fontVariant: ['tabular-nums'], color: c.primary }}>{fmt(r.h.value, 1)} <Text style={{ fontFamily: F.medium, fontSize: 13, color: c.mutedForeground }}>E</Text></Text>
                      </Press>
                    )}
                  </View>
                ))}
              </Card>
            </View>
          )
        ) : null}
      </Animated.View>

    </ScrollView>
    <Modal visible={!!editing} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setEditing(null)}>
      {editing ? <HealthEditor key={editing.id} initial={editing} onClose={() => setEditing(null)} /> : null}
    </Modal>
    {lastRemoved || removal.error ? (
      <View testID="meal-removal-notice" accessibilityLiveRegion="polite"
        style={{ position: 'absolute', left: 16, right: 16, bottom: Math.max(insets.bottom, Platform.OS === 'web' ? 16 : 12),
          backgroundColor: c.card, borderRadius: 20, borderWidth: 1, borderColor: c.input, padding: 16, gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1, gap: 4 }}>
            <Text numberOfLines={2} style={{ fontFamily: F.semibold, fontSize: 15, lineHeight: 21, color: c.foreground }}>
              {lastRemoved ? `${lastRemoved.title || 'Måltidet'} fjernet fra i dag` : 'Endringen ble ikke lagret'}
            </Text>
            {lastRemoved ? <Text style={{ fontFamily: F.medium, fontSize: 13, lineHeight: 16.9, color: c.mutedForeground }}>
              Beholdt i loggen{removal.pending.length > 1 ? ` · ${removal.pending.length} kan angres` : ''}
            </Text> : null}
          </View>
          {lastRemoved ? <Button label="Angre" testID="undo-meal-removal" small loading={removal.busy} onPress={removal.undo} /> : null}
          <Press accessibilityLabel="Lukk angremelding" testID="dismiss-meal-removal" disabled={removal.busy} onPress={removal.dismiss}
            style={{ width: 40, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Feather name="x" size={18} color={c.mutedForeground} />
          </Press>
        </View>
        {removal.error ? <Text style={{ fontFamily: F.medium, fontSize: 13, lineHeight: 16.9, color: c.destructive }}>{removal.error}</Text> : null}
      </View>
    ) : null}
    </View>
  );
}
