import React, { useRef } from 'react';
import { Platform, Text, View, type GestureResponderEvent } from 'react-native';
import Swipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { MealRow } from './MealRow';
import { Press } from './ui';
import { useColors } from '@/hooks/useColors';
import { F } from '@/constants/type';
import type { Meal } from '@/lib/types';

export function SwipeMealRow({ meal, disabled, onRemove }: {
  meal: Meal; disabled: boolean; onRemove: (meal: Meal) => Promise<void>;
}) {
  const c = useColors();
  const swipe = useRef<SwipeableMethods>(null);
  const open = useRef(false);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const dragged = useRef(false);
  const touchPoint = (e: GestureResponderEvent) => e.nativeEvent.touches[0] ?? e.nativeEvent.changedTouches[0];
  return (
    <View onTouchStart={Platform.OS === 'web' ? (e) => {
      const p = touchPoint(e);
      touch.current = p ? { x: p.pageX, y: p.pageY } : null;
      dragged.current = false;
    } : undefined}
      onTouchMove={Platform.OS === 'web' ? (e) => {
        const p = touchPoint(e), start = touch.current;
        if (p && start && (Math.abs(p.pageX - start.x) > 12 || Math.abs(p.pageY - start.y) > 12)) dragged.current = true;
      } : undefined}
      onTouchEnd={Platform.OS === 'web' ? (e) => {
        const p = touchPoint(e), start = touch.current;
        // Web touch release must not turn a horizontal drag into an edit tap.
        // Reveal only: removing still requires the separate, deliberate button press.
        if (p && start && Math.abs(p.pageY - start.y) < 24) {
          if (p.pageX - start.x < -40) swipe.current?.openRight();
          else if (p.pageX - start.x > 40) swipe.current?.close();
        }
        touch.current = null;
      } : undefined}>
    <Swipeable ref={swipe} enabled={!disabled} friction={1} rightThreshold={40}
      overshootRight={false} dragOffsetFromRightEdge={20}
      onSwipeableWillOpen={() => { open.current = true; }}
      onSwipeableClose={() => { open.current = false; }}
      renderRightActions={() => (
        <Press testID={`meal-remove-${meal.id}`} disabled={disabled}
          accessibilityLabel={`Fjern ${meal.title} fra dagens inntak`}
          onPress={() => { swipe.current?.close(); void onRemove(meal); }}
          style={{ width: 88, backgroundColor: c.destructive, justifyContent: 'center', alignItems: 'center', gap: 5, borderRadius: 12, marginVertical: 6 }}>
          <Feather name="trash-2" size={19} color={c.destructiveForeground} />
          <Text style={{ fontFamily: F.semibold, fontSize: 14, color: c.destructiveForeground }}>Fjern</Text>
          <Text style={{ fontFamily: F.body, fontSize: 11, color: c.destructiveForeground }}>fra i dag</Text>
        </Press>
      )}>
      <View style={{ backgroundColor: c.card }}>
        <MealRow meal={meal} action="none" disabled={disabled}
          onRevealActions={() => swipe.current?.openRight()}
          onOpen={() => {
            if (dragged.current) return;
            if (open.current) { swipe.current?.close(); return; }
            router.push({ pathname: '/capture', params: { id: meal.id } });
          }} />
      </View>
    </Swipeable>
    </View>
  );
}
