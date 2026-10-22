import React, { useMemo, useState } from 'react';
import { FlatList, Modal, Platform, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors } from '@/hooks/useColors';
import { F } from '@/constants/type';
import { FOOD_SOURCE, foods, parseAmount, searchFoods, type Food } from '@/lib/foods';
import { fmt } from '@/lib/types';
import { Button, Field, Notice, Press } from './ui';
import { KeyboardAwareScrollViewCompat } from './KeyboardAwareScrollViewCompat';

export function FoodPicker({ onClose, onSelect }: { onClose: () => void; onSelect: (food: Food, grams: number) => void }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Food | null>(null);
  const [amount, setAmount] = useState('100');
  const matches = useMemo(() => searchFoods(query), [query]);
  const grams = parseAmount(amount);
  const text = { fontFamily: F.body, color: c.foreground, fontSize: 15 };
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: c.background, paddingTop: Platform.OS === 'web' ? 67 : insets.top, paddingBottom: Math.max(insets.bottom, 24), paddingHorizontal: 20, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 12 }}>
          <Text accessibilityRole="header" style={{ ...text, fontFamily: F.display, fontSize: 26 }}>Matvaretabellen</Text>
          <Button label="Lukk" small variant="secondary" onPress={onClose} testID="foods-close" />
        </View>
        <Text style={{ ...text, color: c.mutedForeground }}>{foods.length.toLocaleString('nb-NO')} matvarer · Tilgjengelig uten nett</Text>
        {selected ? <KeyboardAwareScrollViewCompat contentContainerStyle={{ gap: 14, paddingBottom: 24 }} bottomOffset={24}>
          <Button label="Tilbake til søk" icon="arrow-left" small variant="secondary" onPress={() => setSelected(null)} />
          <Text style={{ ...text, fontFamily: F.semibold, fontSize: 20 }}>{selected.name}</Text>
          <Text style={text}>{fmt(selected.carbsPer100g!, 1)} g karbohydrat per 100 g spiselig del</Text>
          <Notice title="Kontroller varianten">Bruk vekten slik maten er beskrevet: kokt, rå eller tørr. Vei maten uten tallerken og uten uspiselige deler. Kostfiber skal ikke trekkes fra karbohydratverdien.</Notice>
          <Field label="Mengde spiselig mat" suffix="g" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" testID="food-grams" />
          <Text accessibilityLiveRegion="polite" style={{ ...text, fontFamily: F.display, fontSize: 32 }}>
            {grams === null ? 'Ugyldig mengde' : `${fmt(grams * selected.carbsPer100g! / 100, 1)} g karbohydrat`}
          </Text>
          {grams === null ? <Text style={{ ...text, color: c.destructive }}>Oppgi en mengde over 0 og høyst 10 000 g. Desimalkomma er tillatt.</Text> : null}
          <Button label="Legg til måltidet" icon="plus" testID="food-add" disabled={grams === null} onPress={() => { if (grams !== null) onSelect(selected, grams); }} />
        </KeyboardAwareScrollViewCompat> : <>
          <Field placeholder="Søk, for eksempel ris kokt eller brunost" accessibilityLabel="Søk i matvaretabellen" value={query} onChangeText={setQuery} testID="food-search" />
          <Text style={{ ...text, color: c.mutedForeground }}>{matches.length} treff · Velg riktig tilberedning</Text>
          <FlatList data={matches} keyExtractor={item => item.id} keyboardShouldPersistTaps="handled" initialNumToRender={15}
            ListEmptyComponent={<Text style={{ ...text, paddingVertical: 24 }}>Ingen treff. Prøv et kortere søk, eller legg inn matvaren manuelt.</Text>}
            renderItem={({ item }) => (
              <Press onPress={() => { setSelected(item); setAmount('100'); }} disabled={item.carbsPer100g === null} testID={`food-${item.id}`}
                style={{ paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: c.border, gap: 5 }}>
                <Text style={{ ...text, fontFamily: F.semibold }}>{item.name}</Text>
                <Text style={{ ...text, color: c.mutedForeground, fontSize: 13 }}>{item.category}</Text>
                <Text style={{ ...text, color: c.primary }}>{item.carbsPer100g === null ? 'Karbohydratverdi mangler – bruk etikett manuelt' : `${fmt(item.carbsPer100g, 1)} g karbohydrat / 100 g`}</Text>
              </Press>
            )} />
        </>}
        <Text style={{ ...text, color: c.mutedForeground, fontSize: 12 }}>{FOOD_SOURCE}. Generiske tabellverdier kan avvike fra produktets etikett. Porsjonen må kontrolleres.</Text>
      </View>
    </Modal>
  );
}
