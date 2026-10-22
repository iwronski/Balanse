import React, { useState } from 'react';
import { Platform, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { F } from '@/constants/type';
import { useStore } from '@/lib/store';
import { confirmAsync } from '@/lib/confirm';
import { Button, Empty, Label, Notice, Press, tap } from '@/components/ui';
import { IngredientList, RatioRef } from '@/components/MealRow';
import { fmt, fmtDay, fmtTime, isConsumed, mealCarbs, mealTitle } from '@/lib/types';

export default function MealDetail() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { meals, deleteMeal } = useStore();
  const [err, setErr] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const meal = meals.find((m) => m.id === id);

  if (!meal) return <Empty icon="search" title="Fant ikke måltidet" body="Det kan ha blitt slettet."><Button label="Til forsiden" onPress={() => router.replace('/')} /></Empty>;

  const remove = async () => {
    if (deleting) return;
    if (!(await confirmAsync('Slette permanent?', 'Måltidet slettes fra enheten for godt. Dette kan ikke angres.', 'Slett permanent'))) return;
    setErr(null); setDeleting(true);
    try { await deleteMeal(meal.id); } catch (e) { setErr((e as Error).message); setDeleting(false); return; }
    tap('warn'); router.back();
  };
  const eaten = isConsumed(meal);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.background }} contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: (Platform.OS === 'web' ? 34 : insets.bottom) + 30 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {meal.photoUri ? <Image source={{ uri: meal.photoUri }} style={{ width: 64, height: 64, borderRadius: 16 }} contentFit="cover" /> : null}
        <View style={{ flex: 1, gap: 2 }}>
          <Label>{fmtDay(meal.timestamp)} · kl. {fmtTime(meal.timestamp)}</Label>
          <Text numberOfLines={2} style={{ fontFamily: F.display, fontSize: 22, color: c.foreground, lineHeight: 28 }}>{mealTitle(meal)}</Text>
        </View>
        <Press testID="edit-meal" accessibilityLabel="Rediger" disabled={deleting} onPress={() => router.push({ pathname: '/capture', params: { id: meal.id } })}
          style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.secondary, alignItems: 'center', justifyContent: 'center' }}>
          <Feather name="edit-2" size={16} color={c.secondaryForeground} />
        </Press>
        <Press testID="delete-meal" accessibilityLabel="Slett måltid permanent" disabled={deleting} onPress={remove}
          style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.destructiveSoft, alignItems: 'center', justifyContent: 'center', opacity: deleting ? 0.5 : 1 }}>
          <Feather name="trash-2" size={16} color={c.destructive} />
        </Press>
      </View>
      {err ? <Notice icon="alert-octagon" tone="danger" title="Endringen ble ikke lagret">{err}</Notice> : null}

      {!eaten ? <Notice icon="bookmark" tone="accent" title="Referanse · ikke spist">Dette måltidet teller ikke i inntakstotalen. Det ligger i historikken som referanse.</Notice> : null}

      <View style={{ backgroundColor: eaten ? c.primary : c.mutedForeground, borderRadius: 22, paddingVertical: 14, paddingHorizontal: 18, gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
          <Text style={{ fontFamily: F.display, fontSize: 40, color: c.primaryForeground, lineHeight: 46 }}>≈{fmt(mealCarbs(meal), 1)}</Text>
          <Text style={{ fontFamily: F.medium, fontSize: 15, color: c.primaryForeground, opacity: 0.8, marginBottom: 8 }}>g karbohydrat</Text>
        </View>
        <RatioRef light />
      </View>

      <IngredientList items={meal.ingredients} />

      {meal.confirmedWeightGrams ? <Notice icon="check-circle" tone="sage">{`Nettovekt bekreftet: ${fmt(meal.confirmedWeightGrams)} g`}</Notice> : null}
      {meal.notes ? <View style={{ gap: 4 }}><Label>Notat</Label><Text style={{ fontFamily: F.body, fontSize: 14.5, lineHeight: 21, color: c.foreground }}>{meal.notes}</Text></View> : null}
      {meal.corrections.length ? <View style={{ gap: 4 }}><Label>Korreksjoner</Label>{meal.corrections.map((x, i) => <Text key={i} style={{ fontFamily: F.body, fontSize: 14, color: c.foreground }}>– {x}</Text>)}</View> : null}
      {meal.uncertainty ? <Notice icon="alert-circle" title="Usikkerhet for dette måltidet">{meal.uncertainty}</Notice> : null}
    </ScrollView>
  );
}
