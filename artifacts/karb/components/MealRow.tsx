import React, { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import { EntryIcon } from './EntryIcon';
import { router } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { F } from '@/constants/type';
import { useStore } from '@/lib/store';
import { confirmAsync } from '@/lib/confirm';
import { Press, tap } from './ui';
import { carbsOf, fmt, fmtTime, isConsumed, mealCarbs, mealTitle, type Ingredient, type Meal } from '@/lib/types';

/** Small, non-computational reference to the user's own ratio. Never divides carbs. */
export function RatioRef({ light }: { light?: boolean }) {
  const c = useColors();
  const { settings } = useStore();
  if (!settings.clinicianRatio) return null;
  return (
    <Text testID="ratio-ref" style={{ fontFamily: F.medium, fontSize: 12.5, color: light ? c.primaryForeground : c.mutedForeground, opacity: light ? 0.8 : 1 }}>
      Din faktor: {fmt(settings.clinicianRatio, 1)} g/enhet
    </Text>
  );
}

/** Compact read-only ingredient list: name · grams · carbs. */
export function IngredientList({ items }: { items: Pick<Ingredient, 'name' | 'grams' | 'carbsPer100g'>[] }) {
  const c = useColors();
  if (!items.length) return <Text style={{ fontFamily: F.body, fontSize: 14, color: c.mutedForeground, paddingVertical: 10 }}>Ingen ingredienser</Text>;
  return (
    <View testID="ingredient-list" style={{ backgroundColor: c.card, borderRadius: c.radius, borderWidth: 1, borderColor: c.border, paddingHorizontal: 14 }}>
      {items.map((i, idx) => (
        <View key={idx} style={{ flexDirection: 'row', alignItems: 'baseline', gap: 10, paddingVertical: 9, borderTopWidth: idx ? 1 : 0, borderTopColor: c.border }}>
          <Text numberOfLines={2} style={{ flex: 1, fontFamily: F.medium, fontSize: 14.5, color: c.foreground }}>{i.name || 'Uten navn'}</Text>
          <Text style={{ fontFamily: F.body, fontSize: 13, color: c.mutedForeground, minWidth: 52, textAlign: 'right' }}>{fmt(i.grams)} g</Text>
          <Text style={{ fontFamily: F.semibold, fontSize: 14.5, color: c.primary, minWidth: 58, textAlign: 'right' }}>{fmt(carbsOf(i), 1)} g</Text>
        </View>
      ))}
    </View>
  );
}

export function MealRow({ meal, action = 'delete', onOpen, onRevealActions, disabled = false }: {
  meal: Meal; action?: 'unconsume' | 'delete' | 'none'; onOpen?: () => void; onRevealActions?: () => void; disabled?: boolean;
}) {
  const c = useColors();
  const { deleteMeal, setMealConsumed } = useStore();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const eaten = isConsumed(meal);
  const name = mealTitle(meal);

  const run = async () => {
    if (busy) return;
    setErr(null);
    if (action === 'unconsume') {
      if (!(await confirmAsync('Fjerne fra inntak i dag?', `«${name}» trekkes fra dagens total og beholdes i historikken som referanse (ikke spist). Du kan gjenopprette det senere.`, 'Fjern fra inntak'))) return;
    } else if (!(await confirmAsync('Slette permanent?', `«${name}» slettes fra enheten for godt. Dette kan ikke angres.`, 'Slett permanent'))) return;
    setBusy(true);
    try {
      if (action === 'unconsume') await setMealConsumed(meal.id, false); else await deleteMeal(meal.id);
      tap('warn');
    } catch (e) { setErr((e as Error).message || 'Noe gikk galt.'); }
    setBusy(false);
  };

  return (
    <View style={{ opacity: busy ? 0.5 : 1 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Press gestureAware={!!onRevealActions} testID={`meal-${meal.id}`} disabled={busy || disabled} onPress={onOpen ?? (() => router.push({ pathname: '/meal/[id]', params: { id: meal.id } }))}
          onLongPress={onRevealActions}
          accessibilityLabel={onOpen ? `Rediger ${name}` : `Åpne ${name}`}
          accessibilityHint={onRevealActions ? 'Sveip mot venstre eller hold inne for å vise fjern-knappen.' : undefined}
          accessibilityActions={onRevealActions ? [{ name: 'remove', label: 'Vis fjern-knappen' }] : undefined}
          onAccessibilityAction={onRevealActions ? (e) => { if (e.nativeEvent.actionName === 'remove') onRevealActions(); } : undefined}
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12 }}>
          <View style={{ width: 52, height: 52, borderRadius: 16, overflow: 'hidden', opacity: eaten ? 1 : 0.55, backgroundColor: meal.source === 'ai' ? c.accentSoft : c.sageSoft, alignItems: 'center', justifyContent: 'center' }}>
            {meal.photoUri ? <Image source={{ uri: meal.photoUri }} style={{ width: 52, height: 52 }} contentFit="cover" />
              : <EntryIcon type="meal" />}
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text numberOfLines={1} style={{ fontFamily: F.semibold, fontSize: 16, color: eaten ? c.foreground : c.mutedForeground }}>{name}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {!eaten ? (
                <View testID={`meal-ref-${meal.id}`} style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, backgroundColor: c.muted }}>
                  <Text style={{ fontFamily: F.semibold, fontSize: 11, color: c.mutedForeground }}>Referanse · ikke spist</Text>
                </View>
              ) : null}
              <Text style={{ fontFamily: F.body, fontSize: 13.5, color: c.mutedForeground }}>
                {fmtTime(meal.timestamp)} · {meal.ingredients.length} {meal.ingredients.length === 1 ? 'ingrediens' : 'ingredienser'}
              </Text>
            </View>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontFamily: F.display, fontSize: 22, color: eaten ? c.primary : c.mutedForeground, textDecorationLine: eaten ? 'none' : 'line-through' }}>≈{fmt(mealCarbs(meal))}</Text>
            <Text style={{ fontFamily: F.medium, fontSize: 11, color: c.mutedForeground }}>g karb</Text>
          </View>
        </Press>
        {action !== 'none' ? <Press testID={action === 'unconsume' ? `meal-unconsume-${meal.id}` : `meal-delete-${meal.id}`} onPress={run} disabled={busy}
          accessibilityLabel={action === 'unconsume' ? `Fjern ${name} fra inntak i dag` : `Slett ${name} permanent`}
          style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: action === 'unconsume' ? c.muted : c.destructiveSoft }}>
          {busy ? <ActivityIndicator size="small" color={c.mutedForeground} />
            : <Feather name={action === 'unconsume' ? 'minus-circle' : 'trash-2'} size={15} color={action === 'unconsume' ? c.mutedForeground : c.destructive} />}
        </Press> : null}
      </View>
      {err ? <Text style={{ fontFamily: F.body, fontSize: 13, color: c.destructive, paddingBottom: 8 }}>{action === 'unconsume' ? 'Ikke fjernet fra inntak' : 'Ikke slettet'}: {err}</Text> : null}
    </View>
  );
}
