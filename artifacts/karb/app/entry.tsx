import React, { useEffect, useRef, useState } from 'react';
import { AppState, Modal, Platform, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { RecordingPresets, getRecordingPermissionsAsync, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { useParseEntry, useTranscribeMealNote } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { F } from '@/constants/type';
import { useStore } from '@/lib/store';
import { audioMime, fileToBase64 } from '@/lib/media';
import { errorMessage, fmt } from '@/lib/types';
import { blankIngredient, draftError, draftNumber, draftRecords, fromParsed, newDraft, type EntryDraft, type DraftKind } from '@/lib/entryDraft';
import { confirmAsync } from '@/lib/confirm';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { Button, Card, Chip, Field, Label, Notice, Press, tap } from '@/components/ui';
import { TimeField } from '@/components/TimeField';
import { Stepper } from '@/components/Stepper';

const LABELS: Record<DraftKind, string> = { meal: 'Mat', insulin: 'Insulin', glucose: 'Glukose', exercise: 'Aktivitet' };
const KINDS = { hurtig: 'Hurtigvirkende', langtid: 'Langtidsvirkende', annet: 'Annet' } as const;

export default function Entry() {
  const c = useColors(), insets = useSafeAreaInsets();
  const { voice } = useLocalSearchParams<{ voice?: string }>();
  const { settings, updateSettings, saveEntries } = useStore();
  const parse = useParseEntry(), transcribe = useTranscribeMealNote();
  const recorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    web: { ...RecordingPresets.HIGH_QUALITY.web,
      mimeType: Platform.OS === 'web' && typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : 'audio/webm' },
  });
  const [text, setText] = useState('');
  const [drafts, setDrafts] = useState<EntryDraft[] | null>(null);
  const [questions, setQuestions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [audioBusy, setAudioBusy] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [saving, setSaving] = useState(false);
  const [consent, setConsent] = useState<(() => void) | null>(null);
  const recordingRef = useRef(false), mounted = useRef(true), saveLock = useRef(false);
  const parseLock = useRef(false), audioLock = useRef(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsed = useRef(0);
  const busy = saving || audioBusy || parse.isPending || transcribe.isPending;
  const clearTimer = () => { if (timer.current) clearInterval(timer.current); timer.current = null; };

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false; clearTimer();
      if (recordingRef.current) {
        recordingRef.current = false;
        recorder.stop().catch(() => {}).finally(() => setAudioModeAsync({ allowsRecording: false }).catch(() => {}));
      }
    };
  }, [recorder]);

  const withConsent = (fn: () => void) => settings.aiConsent ? fn() : setConsent(() => fn);
  const analyze = async (description: string) => {
    if (!description.trim() || parseLock.current) return;
    parseLock.current = true;
    setError(null);
    try {
      const result = await parse.mutateAsync({ data: { text: description.trim(), referenceTime: new Date().toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Oslo' } });
      if (!mounted.current) return;
      setDrafts(result.entries.map(fromParsed)); setQuestions(result.questions); tap('success');
    } catch (e) { if (mounted.current) setError(errorMessage(e)); }
    finally { parseLock.current = false; }
  };
  const stop = async () => {
    if (!recordingRef.current) return;
    recordingRef.current = false; clearTimer(); setRecording(false); setAudioBusy(true);
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false });
      const uri = recorder.uri;
      if (!uri) throw new Error('Opptaket mangler. Prøv igjen eller skriv i tekstfeltet.');
      const result = await transcribe.mutateAsync({ data: { audioBase64: await fileToBase64(uri), mimeType: await audioMime(uri) } });
      if (!mounted.current) return;
      if (!result.text.trim()) throw new Error('Ingen tale ble oppfattet. Prøv igjen eller skriv.');
      const description = [text.trim(), result.text.trim()].filter(Boolean).join('\n');
      setText(description);
      await analyze(description);
    } catch (e) { if (mounted.current) setError(errorMessage(e)); }
    finally { if (mounted.current) setAudioBusy(false); }
  };
  // Stop and keep/transcribe the clip if iOS interrupts it or the app is backgrounded.
  const stopRef = useRef(stop);
  stopRef.current = stop;
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => { if (state !== 'active' && recordingRef.current) void stopRef.current(); });
    return () => sub.remove();
  }, []);
  const start = async () => {
    if (busy || recordingRef.current || audioLock.current) return;
    audioLock.current = true;
    setAudioBusy(true); setError(null);
    try {
      let permission = await getRecordingPermissionsAsync();
      if (!permission.granted) permission = await requestRecordingPermissionsAsync();
      if (!permission.granted) throw new Error('Gi Balanse mikrofontilgang i Innstillinger eller skriv i stedet.');
      if (!mounted.current) return;
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      if (!mounted.current) { await setAudioModeAsync({ allowsRecording: false }); return; }
      recorder.record(); recordingRef.current = true; elapsed.current = 0;
      setRecording(true); setSeconds(0);
      timer.current = setInterval(() => {
        elapsed.current++; setSeconds(elapsed.current);
        if (elapsed.current >= 120) void stopRef.current();
      }, 1000);
    } catch (e) { if (mounted.current) setError(errorMessage(e)); await setAudioModeAsync({ allowsRecording: false }).catch(() => {}); }
    finally { audioLock.current = false; if (mounted.current) setAudioBusy(false); }
  };
  const update = (id: string, changes: Partial<EntryDraft>) => setDrafts(ds => ds?.map(d => d.id === id ? { ...d, ...changes } : d) ?? null);
  const save = async () => {
    if (saveLock.current || !drafts?.length) return;
    saveLock.current = true; setSaving(true); setError(null);
    try {
      const records = draftRecords(drafts, new Date().toISOString());
      await saveEntries(records.meals, records.health);
      tap('success'); router.replace('/log');
    } catch (e) { setError(errorMessage(e)); }
    finally { saveLock.current = false; if (mounted.current) setSaving(false); }
  };
  const valid = !!drafts?.length && drafts.every(d => !draftError(d));
  const goBackToText = async () => {
    if (drafts?.length && !await confirmAsync('Tilbake til teksten?', 'Endringer i utkastene erstattes ved neste analyse. Ingenting er lagret ennå.', 'Tilbake til tekst')) return;
    setDrafts(null); setQuestions([]); setError(null);
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Legg inn data' }} />
      <KeyboardAwareScrollViewCompat bottomOffset={40} style={{ flex: 1, backgroundColor: c.background }}
        keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, gap: 18, paddingBottom: Math.max(insets.bottom, 30) + 30 }}>
        {drafts === null ? (
          <Card style={{ gap: 16 }}>
            <Text style={{ fontFamily: F.display, fontSize: 23, color: c.foreground }}>Alt i én registrering</Text>
            <Field testID="entry-text" autoFocus={voice !== '1'} label="Mat, insulin, glukose eller aktivitet" multiline maxLength={8000}
              editable={!busy && !recording} value={text} onChangeText={setText}
              placeholder={'F.eks. Spiste to brødskiver med ost kl. 12. Tok 4 E hurtiginsulin. Målte glukose 6,2. Gikk en tur i 30 minutter.'} />
            <Button testID="entry-record" label={recording ? `Stopp opptak · ${seconds} s` : 'Snakk inn'} icon={recording ? 'square' : 'mic'}
              variant="secondary" disabled={busy} onPress={() => recording ? void stop() : withConsent(() => void start())} />
            <Button testID="entry-analyze" label="Analyser" icon="zap" loading={parse.isPending || audioBusy || transcribe.isPending}
              disabled={!text.trim() || recording || saving} onPress={() => withConsent(() => void analyze(text))} />
            <Text style={{ fontFamily: F.body, fontSize: 12.5, lineHeight: 18, color: c.mutedForeground }}>
              Teksten eller opptaket du legger inn sendes til AI for analyse, også hvis det inneholder helseopplysninger. Den lagrede loggen sendes ikke. Ingenting lagres i loggen før du velger Lagre.
            </Text>
          </Card>
        ) : (
          <>
            <View style={{ gap: 8 }}>
              <Text style={{ fontFamily: F.display, fontSize: 23, color: c.foreground }}>{drafts.length} {drafts.length === 1 ? 'oppføring' : 'oppføringer'}</Text>
              <Text style={{ fontFamily: F.body, fontSize: 14, color: c.mutedForeground }}>Du kan justere hver oppføring eller lagre direkte.</Text>
            </View>
            {drafts.map((d, index) => {
              const issue = draftError(d);
              const total = d.ingredients.reduce((s, i) => {
                const g = draftNumber(i.grams), p = draftNumber(i.carbsPer100g);
                return s + (Number.isFinite(g) && Number.isFinite(p) ? g * p / 100 : 0);
              }, 0);
              return (
                <Card key={d.id} style={{ gap: 14 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Label>{index + 1} · {LABELS[d.type]}</Label>
                    <Press testID={`entry-remove-${index}`} disabled={saving} accessibilityLabel={`Fjern oppføring ${index + 1} fra utkastet`}
                      onPress={() => setDrafts(ds => ds?.filter(x => x.id !== d.id) ?? null)}>
                      <Text style={{ fontFamily: F.medium, color: c.destructive, padding: 6 }}>Fjern</Text>
                    </Press>
                  </View>
                  {d.type === 'meal' ? (
                    <>
                      <Field testID={`entry-title-${index}`} label="Navn" value={d.title} editable={!saving} placeholder="Første ingrediens brukes som navn" onChangeText={title => update(d.id, { title })} />
                      <Text testID={`entry-carbs-${index}`} style={{ fontFamily: F.display, fontSize: 25, color: c.foreground }}>{fmt(total, 1)} g karbohydrat</Text>
                      {d.ingredients.map((ingredient, j) => {
                        const change = (patch: Partial<typeof ingredient>) => update(d.id, { ingredients: d.ingredients.map(i => i.id === ingredient.id ? { ...i, ...patch } : i) });
                        return (
                          <View key={ingredient.id} style={{ gap: 8, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: c.border }}>
                            <Field label="Ingrediens" value={ingredient.name} editable={!saving} onChangeText={name => change({ name })} testID={`entry-ingredient-${index}-${j}`} />
                            <View style={{ gap: 8 }}>
                              <View><Stepper label="Mengde" suffix="g" step={10} decimals={1} value={ingredient.grams} disabled={saving} onChangeText={grams => change({ grams })} testID={`entry-grams-${index}-${j}`} /></View>
                              <Field style={{ flex: 1 }} label="Karb per 100 g" suffix="g" value={ingredient.carbsPer100g} editable={!saving} keyboardType="decimal-pad" onChangeText={carbsPer100g => change({ carbsPer100g })} testID={`entry-per100-${index}-${j}`} />
                            </View>
                            {ingredient.assumption ? <Text style={{ fontFamily: F.body, fontSize: 12, color: c.mutedForeground }}>{ingredient.assumption}</Text> : null}
                            <Press disabled={saving} onPress={() => update(d.id, { ingredients: d.ingredients.filter(i => i.id !== ingredient.id) })}>
                              <Text style={{ fontFamily: F.medium, fontSize: 12.5, color: c.mutedForeground }}>Fjern ingrediens</Text>
                            </Press>
                          </View>
                        );
                      })}
                      <Button label="Legg til ingrediens" icon="plus" variant="secondary" small disabled={saving} onPress={() => update(d.id, { ingredients: [...d.ingredients, blankIngredient()] })} />
                    </>
                  ) : (
                    <Stepper testID={`entry-value-${index}`} label={d.type === 'insulin' ? 'Insulin satt' : d.type === 'glucose' ? 'Glukose målt' : 'Varighet'}
                      suffix={d.type === 'insulin' ? 'E' : d.type === 'glucose' ? 'mmol/L' : 'min'} value={d.value} disabled={saving}
                      step={d.type === 'glucose' ? 0.5 : d.type === 'insulin' ? 1 : 5} onChangeText={value => update(d.id, { value })} placeholder="Fyll inn" />
                  )}
                  {d.type === 'insulin' ? <View style={{ gap: 7 }}>
                    <Label>Insulintype</Label>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                      {(Object.keys(KINDS) as (keyof typeof KINDS)[]).map(k => <Chip key={k} label={KINDS[k]} active={d.insulinKind === k} onPress={() => !saving && update(d.id, { insulinKind: k })} />)}
                    </View>
                  </View> : null}
                  {d.type === 'exercise' ? <View style={{ gap: 7 }}>
                    <Label>Intensitet · valgfritt</Label>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {(['lett', 'moderat', 'hard'] as const).map(k => <Chip key={k} label={k[0].toUpperCase() + k.slice(1)} active={d.intensity === k} onPress={() => !saving && update(d.id, { intensity: d.intensity === k ? '' : k })} />)}
                    </View>
                  </View> : null}
                  <TimeField value={d.timestamp} onChange={timestamp => !saving && update(d.id, { timestamp })} />
                  <Field label="Notat" value={d.note} editable={!saving} onChangeText={note => update(d.id, { note })} multiline />
                  {issue ? <Text testID={`entry-issue-${index}`} style={{ fontFamily: F.body, fontSize: 13, color: c.destructive }}>{issue}</Text> : null}
                </Card>
              );
            })}
            <View style={{ gap: 10 }}>
              <Label>Mangler en oppføring?</Label>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 7 }}>
                {(Object.keys(LABELS) as DraftKind[]).map(k => <Chip key={k} label={`+ ${LABELS[k]}`} onPress={() => !saving && setDrafts(ds => [...(ds ?? []), newDraft(k)])} />)}
              </View>
            </View>
            {questions.length ? <Notice title="Fra analysen" tone="accent">{questions.join('\n')}</Notice> : null}
            <Button label={`Lagre ${drafts.length} ${drafts.length === 1 ? 'oppføring' : 'oppføringer'}`} icon="check" testID="entry-save" disabled={!valid || saving} loading={saving} onPress={save} />
            <Button label="Tilbake til teksten" variant="ghost" disabled={saving} onPress={goBackToText} />
          </>
        )}
        {error ? <Notice tone="danger" title="Ikke lagret">{error}</Notice> : null}
      </KeyboardAwareScrollViewCompat>
      <Modal visible={!!consent} transparent animationType="fade" onRequestClose={() => setConsent(null)}>
        <View style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.4)' }}>
          <Card style={{ gap: 16 }}>
            <Text style={{ fontFamily: F.display, fontSize: 22, color: c.foreground }}>Tillat AI-analyse?</Text>
            <Text style={{ fontFamily: F.body, fontSize: 15, lineHeight: 22, color: c.foreground }}>Teksten og lydopptaket du legger inn sendes til Balanses server og en AI-tjeneste. Dette kan inneholde helseopplysninger om mat, insulin, glukose og aktivitet. Din lagrede logg sendes ikke. Du kan trekke samtykket i Innstillinger.</Text>
            <Button label="Tillat og fortsett" onPress={async () => {
              try { await updateSettings({ aiConsent: true }); const fn = consent; setConsent(null); fn?.(); }
              catch (e) { setConsent(null); setError(errorMessage(e)); }
            }} />
            <Button label="Ikke nå" variant="ghost" onPress={() => setConsent(null)} />
          </Card>
        </View>
      </Modal>
    </>
  );
}
