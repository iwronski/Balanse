import React, { useState } from 'react';
import { Platform, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { F } from '@/constants/type';
import { useStore } from '@/lib/store';
import { confirmAsync } from '@/lib/confirm';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { Button, Chip, Field, IconName, Notice, Press, tap } from '@/components/ui';
import { TimeField } from '@/components/TimeField';
import { Stepper } from '@/components/Stepper';
import { ActivityIcon } from '@/components/EntryIcon';
import { num, uid, type HealthEvent, type HealthType } from '@/lib/types';

/** Unsaved form defaults only; never replaces an existing or AI-reported value. */
export const newHealthEvent = (type: HealthType): HealthEvent => ({ id: uid(), type, timestamp: new Date().toISOString(), value: type === 'glucose' ? 6 : 0, note: '', ...(type === 'insulin' ? { insulinKind: 'hurtig' as const } : {}) });

export const META: Record<HealthType, { label: string; unit: string; icon: IconName | React.ReactElement; placeholder: string }> = {
  glucose: { label: 'Glukose', unit: 'mmol/L', icon: 'droplet', placeholder: 'f.eks. 7,4' },
  insulin: { label: 'Insulin', unit: 'enheter', icon: 'edit', placeholder: 'som tatt' },
  exercise: { label: 'Aktivitet', unit: 'min', icon: <ActivityIcon size={16} />, placeholder: 'varighet' },
};

export function HealthEditor({ initial, onClose }: { initial: HealthEvent; onClose: () => void }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { saveHealth, deleteHealth, health } = useStore();
  const [e, setE] = useState<HealthEvent>(initial);
  const [value, setValue] = useState(initial.value ? String(initial.value).replace('.', ',') : '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const exists = health.some((h) => h.id === initial.id);
  const m = META[e.type];
  const v = num(value);
  const invalid = !(v > 0) || (e.type === 'glucose' && v > 40);

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, paddingTop: Platform.OS === 'web' ? 30 : 20 }}>
        <Text style={{ fontFamily: F.display, fontSize: 22, color: c.foreground }}>{exists ? 'Endre oppføring' : 'Ny oppføring'}</Text>
        <Press onPress={onClose} accessibilityLabel="Lukk"><Feather name="x" size={24} color={c.primary} /></Press>
      </View>
      <KeyboardAwareScrollViewCompat bottomOffset={40} contentContainerStyle={{ padding: 20, paddingTop: 0, gap: 20, paddingBottom: insets.bottom + 40 }}>
        {!exists ? <View style={{ flexDirection: 'row', gap: 8 }}>
          {(Object.keys(META) as HealthType[]).map((t) => (
            <Chip key={t} label={META[t].label} icon={META[t].icon} active={e.type === t} onPress={() => {
              if (t === e.type) return;
              setE({ ...e, type: t, insulinKind: t === 'insulin' ? (e.insulinKind ?? 'hurtig') : e.insulinKind });
              setValue(t === 'glucose' ? '6' : '');
            }} />
          ))}
        </View> : null}
        <Stepper label={`${m.label} (${m.unit})`} suffix={m.unit} value={value} onChangeText={setValue} placeholder={m.placeholder} testID="health-value"
          step={e.type === 'glucose' ? 0.5 : e.type === 'insulin' ? 1 : 5} decimals={1}
          quick={e.type === 'exercise' ? [15, 30, 45, 60] : undefined} />
        {e.type === 'insulin' ? (
          <>
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
              {(['hurtig', 'langtid'] as const).map((k) => (
                <Chip key={k} label={k === 'hurtig' ? 'Hurtigvirkende' : 'Langtidsvirkende'} active={e.insulinKind === k} onPress={() => setE({ ...e, insulinKind: k })} />
              ))}
            </View>
          </>
        ) : null}
        {e.type === 'exercise' ? (
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(['lett', 'moderat', 'hard'] as const).map((k) => (
              <Chip key={k} label={k[0].toUpperCase() + k.slice(1)} active={e.intensity === k} onPress={() => setE({ ...e, intensity: k })} />
            ))}
          </View>
        ) : null}
        <TimeField value={e.timestamp} onChange={(t) => setE({ ...e, timestamp: t })} />
        <Field label="Notat" value={e.note} onChangeText={(t) => setE({ ...e, note: t })} placeholder="Valgfritt" multiline />
        {err ? <Notice icon="alert-octagon" tone="danger" title="Ikke lagret">{err}</Notice> : null}
        <Button label="Lagre" icon="check" variant="save" testID="save-health" disabled={invalid} loading={busy} onPress={async () => { setBusy(true); setErr(null); try { await saveHealth({ ...e, value: v }); } catch (x) { setErr((x as Error).message); setBusy(false); return; } tap('success'); onClose(); }} />
        {exists ? (
          <Button label="Slett oppføring" icon="trash-2" variant="ghost" onPress={async () => {
            if (await confirmAsync('Slette oppføring?', 'Dette kan ikke angres.', 'Slett')) { setErr(null); try { await deleteHealth(e.id); } catch (x) { setErr((x as Error).message); return; } onClose(); }
          }} />
        ) : null}
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

