import React, { useEffect, useRef, useState } from 'react';
import { Linking, Modal, Platform, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import { Feather } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { useAnalyzeMeal, useTranscribeMealNote, type MealAnalysis } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import { F } from '@/constants/type';
import { useStore } from '@/lib/store';
import { pickImage, fileToBase64, audioMime } from '@/lib/media';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { Button, Card, Field, Label, Notice, Press, Skeleton, tap, SAVE_COLORS } from '@/components/ui';
import { TimeField } from '@/components/TimeField';
import { Stepper } from '@/components/Stepper';
import { FoodPicker } from '@/components/FoodPicker';
import { IngredientList, RatioRef } from '@/components/MealRow';
import { foodAttribution, parseAmount, type Food } from '@/lib/foods';
import { errorMessage, fmt, num, uid, mealTitle, type Meal } from '@/lib/types';

interface Row { id: string; name: string; grams: string; per100: string; assumption: string }
const toStr = (n: number) => (Number.isFinite(n) ? String(n).replace('.', ',') : '');
const emptyRow = (): Row => ({ id: uid(), name: '', grams: '', per100: '', assumption: '' });
const rowCarbs = (r: Row) => (num(r.grams) * num(r.per100)) / 100;

function Pulse({ children }: { children: React.ReactNode }) {
  const o = useSharedValue(0.45);
  useEffect(() => { o.value = withRepeat(withTiming(1, { duration: 800 }), -1, true); }, [o]);
  const st = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={st}>{children}</Animated.View>;
}

export default function Capture() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string; start?: string }>();
  const voiceMode = params.start === 'voice';
  const { meals, saveMeal, settings, updateSettings } = useStore();
  const editing = params.id ? meals.find((m) => m.id === params.id) : undefined;

  const analyze = useAnalyzeMeal();
  const transcribe = useTranscribeMealNote();
  const recorder = useAudioRecorder({
    ...RecordingPresets.HIGH_QUALITY,
    web: {
      ...RecordingPresets.HIGH_QUALITY.web,
      mimeType: Platform.OS === 'web' && typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4' : 'audio/webm',
    },
  });

  const [phase, setPhase] = useState<'compose' | 'review'>(editing ? 'review' : 'compose');
  const [source, setSource] = useState<'ai' | 'manual'>(editing?.source ?? 'ai');
  const [photoUri, setPhotoUri] = useState<string | undefined>(editing?.photoUri);
  const [imageData, setImageData] = useState<string | undefined>();
  const [pickIssue, setPickIssue] = useState<string | null>(null);
  const [notes, setNotes] = useState(editing?.notes ?? '');
  const [recording, setRecording] = useState(false);
  const [audioBusy, setAudioBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [title, setTitle] = useState(editing ? mealTitle(editing) : '');
  const [timestamp, setTimestamp] = useState(editing?.timestamp ?? new Date().toISOString());
  const [rows, setRows] = useState<Row[]>(editing ? editing.ingredients.map((i) => ({ id: i.id, name: i.name, grams: toStr(i.grams), per100: toStr(i.carbsPer100g), assumption: i.assumption })) : []);
  const [analysis, setAnalysis] = useState<MealAnalysis | null>(editing && editing.source === 'ai' ? {
    title: editing.title, ingredients: [], totalCarbs: 0, detectedWeightGrams: editing.detectedWeightGrams, uncertainty: editing.uncertainty ?? '', warnings: editing.warnings,
  } : null);
  const [corrections, setCorrections] = useState<string[]>(editing?.corrections ?? []);
  const [correction, setCorrection] = useState('');
  const [scale, setScale] = useState<'pending' | 'confirmed' | 'rejected'>(editing?.confirmedWeightGrams ? 'confirmed' : 'pending');
  const [netWeight, setNetWeight] = useState(editing?.confirmedWeightGrams ? toStr(editing.confirmedWeightGrams) : '');
  const [detailsOpen, setDetailsOpen] = useState(!!editing);
  const [error, setError] = useState<{ msg: string; retry: () => void } | null>(null);
  const [saving, setSaving] = useState(false);
  const [foodPicker, setFoodPicker] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [consentFor, setConsentFor] = useState<null | (() => void)>(null);

  const started = useRef(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  const doPick = async (src: 'camera' | 'library') => {
    setPickIssue(null);
    const r = await pickImage(src);
    if (r.ok) { tap('success'); setPhotoUri(r.uri); setImageData(r.dataUrl); setSource('ai'); return; }
    if (r.reason === 'denied') setPickIssue(src === 'camera' ? 'Balanse har ikke tilgang til kameraet.' : 'Balanse har ikke tilgang til bildene dine.');
    else if (r.reason === 'too_large') setPickIssue('Bildet ble for stort selv etter komprimering. Prøv et annet bilde.');
    else if (r.reason === 'error') setPickIssue(src === 'camera' && Platform.OS === 'web' ? 'Kamera er ikke tilgjengelig i nettleseren. Velg et bilde i stedet.' : 'Kunne ikke hente bildet. Prøv igjen.');
  };

  const startManual = () => {
    setDetailsOpen(true);
    setSource('manual'); setAnalysis(null);
    if (rows.length === 0) setRows([emptyRow()]);
    setPhase('review');
  };

  useEffect(() => {
    if (started.current || editing) return;
    started.current = true;
    // Safari requires a direct tap for the file/camera picker, not a mount effect.
    if (params.start === 'camera' && Platform.OS !== 'web') doPick('camera');
    else if (params.start === 'library' && Platform.OS !== 'web') doPick('library');
    else if (params.start === 'manual') startManual();
    else if (params.start === 'foods') { startManual(); setFoodPicker(true); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const withConsent = (fn: () => void) => { if (settings.aiConsent) fn(); else setConsentFor(() => fn); };

  const buildNotes = (corr: string[], description = notes) =>
    [description.trim(), corr.length ? `Korreksjoner fra brukeren (prioriter disse):\n${corr.map((x) => `- ${x}`).join('\n')}` : ''].filter(Boolean).join('\n\n');

  const confirmedWeight = scale === 'confirmed' && num(netWeight) > 0 ? num(netWeight) : undefined;

  const currentAnalysis = (): MealAnalysis => {
    const ingredients = rows.filter((r) => r.name.trim()).map((r) => ({ name: r.name.trim(), grams: num(r.grams), carbsPer100g: num(r.per100), carbs: Math.round(rowCarbs(r) * 10) / 10, assumption: r.assumption }));
    return { title, ingredients, totalCarbs: Math.round(ingredients.reduce((s, i) => s + i.carbs, 0) * 10) / 10, detectedWeightGrams: analysis?.detectedWeightGrams, uncertainty: analysis?.uncertainty ?? '', warnings: analysis?.warnings ?? [] };
  };

  const runAnalyze = async (reanalyze: boolean, corr: string[] = corrections, description = notes) => {
    setError(null);
    const prevDetected = analysis?.detectedWeightGrams;
    try {
      const res = await analyze.mutateAsync({ data: {
        notes: buildNotes(corr, description),
        ...(imageData ? { imageBase64: imageData } : {}),
        ...(confirmedWeight ? { confirmedWeightGrams: confirmedWeight } : {}),
        ...(reanalyze ? { previousAnalysis: currentAnalysis() } : {}),
      } });
      tap('success');
      setAnalysis(res);
      setRows(res.ingredients.map((i) => ({ id: uid(), name: i.name, grams: toStr(i.grams), per100: toStr(i.carbsPer100g), assumption: i.assumption })));
      if (!reanalyze || !title.trim()) setTitle(res.title);
      if (res.detectedWeightGrams !== prevDetected && scale !== 'confirmed') setScale('pending');
      setDetailsOpen(false);
      setSource('ai');
      setPhase('review');
    } catch (e) {
      tap('warn');
      setError({ msg: errorMessage(e), retry: () => runAnalyze(reanalyze, corr, description) });
    }
  };

  const startRecording = async () => {
    if (audioBusy || recording || analyze.isPending) return;
    setAudioBusy(true);
    setError(null);
    try {
      const p = await requestRecordingPermissionsAsync();
      if (!p.granted) { setError({ msg: 'Balanse har ikke tilgang til mikrofonen. Gi tilgang i innstillinger, eller skriv i stedet.', retry: () => withConsent(startRecording) }); return; }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      tap('medium');
      setRecording(true); setElapsed(0);
      timer.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } catch (e) {
      setError({ msg: `Kunne ikke starte opptak. ${errorMessage(e)}`, retry: () => withConsent(startRecording) });
    } finally {
      setAudioBusy(false);
    }
  };

  const sendAudio = async (uri: string) => {
    setError(null);
    try {
      const audioBase64 = await fileToBase64(uri);
      const res = await transcribe.mutateAsync({ data: { audioBase64, mimeType: await audioMime(uri) } });
      if (!res.text.trim()) throw new Error('Ingen tale ble oppfattet. Prøv et nytt opptak eller skriv beskrivelsen.');
      tap('success');
      const description = [notes.trim(), res.text.trim()].filter(Boolean).join(' ');
      setNotes(description);
      // Pass the transcript explicitly: React state has not updated yet.
      if (voiceMode) await runAnalyze(false, corrections, description);
    } catch (e) {
      setError({ msg: `Transkribering feilet: ${errorMessage(e)}`, retry: () => sendAudio(uri) });
    }
  };

  const stopRecording = async () => {
    if (audioBusy) return;
    setAudioBusy(true);
    if (timer.current) clearInterval(timer.current);
    setRecording(false);
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false });
      const uri = recorder.uri;
      if (!uri) throw new Error('Lydopptaket mangler. Ta opp på nytt eller skriv beskrivelsen.');
      await sendAudio(uri);
    } catch (e) {
      setError({ msg: `Opptaket kunne ikke lagres. ${errorMessage(e)}`, retry: () => withConsent(startRecording) });
    } finally {
      setAudioBusy(false);
    }
  };

  const addCorrection = () => {
    const t = correction.trim();
    if (!t) return;
    tap();
    setCorrections((p) => [...p, t]);
    setCorrection('');
  };

  const updateRow = (id: string, p: Partial<Row>) => {
    setRows((rs) => rs.map((r) => r.id === id ? {
      ...r, ...p,
      ...((p.name !== undefined || p.per100 !== undefined) ? { assumption: 'Egen opplysning: navn eller næringsverdi er endret manuelt. Kontroller mot produktets etikett.' } : {}),
    } : r));
  };
  const addFood = (food: Food, grams: number) => {
    if (food.carbsPer100g === null) return;
    setRows(rs => [...rs.filter(r => r.name.trim() || r.grams || r.per100), {
      id: uid(), name: food.name, grams: toStr(grams), per100: toStr(food.carbsPer100g!), assumption: foodAttribution(food),
    }]);
    setFoodPicker(false);
  };
  const total = rows.reduce((s, r) => s + rowCarbs(r), 0);
  const validRows = rows.filter((r) => r.name.trim());
  const rowsValid = rows.every(r => r.name.trim() && parseAmount(r.grams) !== null &&
    /^\d+(?:[.,]\d+)?$/.test(r.per100.trim()) && num(r.per100) >= 0 && num(r.per100) <= 100);
  const resolvedTitle = mealTitle({ title, ingredients: validRows });
  const canSave = validRows.length > 0 && rowsValid && !analyze.isPending;

  const save = async () => {
    if (!canSave || saving) return;
    const now = new Date().toISOString();
    const meal: Meal = {
      id: editing?.id ?? uid(),
      title: resolvedTitle,
      timestamp,
      ingredients: validRows.map((r) => ({ id: r.id, name: r.name.trim(), grams: num(r.grams), carbsPer100g: num(r.per100), assumption: r.assumption })),
      notes: notes.trim(),
      corrections,
      source,
      consumed: editing?.consumed ?? true,
      uncertainty: analysis?.uncertainty || undefined,
      warnings: analysis?.warnings ?? [],
      detectedWeightGrams: analysis?.detectedWeightGrams,
      confirmedWeightGrams: confirmedWeight,
      photoUri,
      createdAt: editing?.createdAt ?? now,
      updatedAt: now,
    };
    setSaving(true);
    setSaveError(null);
    try {
      await saveMeal(meal);
    } catch (e) {
      tap('warn');
      setSaveError((e as Error).message || 'Kunne ikke lagre måltidet.');
      setSaving(false);
      return;
    }
    tap('success');
    if (editing) router.back(); else router.replace({ pathname: '/meal/[id]', params: { id: meal.id } });
  };

  const bottom = (Platform.OS === 'web' ? 34 : insets.bottom) + 40;
  const busy = analyze.isPending;

  const errorBox = error ? (
    <Animated.View entering={FadeIn}>
      <Notice icon="wifi-off" tone="danger" title="Det gikk ikke">
        <View style={{ gap: 10 }}>
          <Text style={{ fontFamily: F.body, fontSize: 14, lineHeight: 20, color: c.destructive }}>{error.msg}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button label="Prøv igjen" icon="refresh-cw" small variant="danger" onPress={error.retry} testID="retry" />
            <Button label="Lukk" small variant="ghost" onPress={() => setError(null)} />
          </View>
        </View>
      </Notice>
    </Animated.View>
  ) : null;

  const consentModal = (
    <Modal visible={!!consentFor} transparent animationType="fade" onRequestClose={() => setConsentFor(null)}>
      <View style={{ flex: 1, backgroundColor: c.overlay, justifyContent: 'flex-end', padding: 14, paddingBottom: insets.bottom + 14 }}>
        <Animated.View entering={FadeInDown.duration(260)} style={{ backgroundColor: c.card, borderRadius: 28, padding: 24, gap: 14 }}>
          <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Feather name="shield" size={22} color={c.accentForeground} />
          </View>
          <Text style={{ fontFamily: F.display, fontSize: 22, color: c.foreground }}>Før vi sender noe</Text>
          <Text style={{ fontFamily: F.body, fontSize: 15, lineHeight: 22, color: c.foreground }}>
            For å analysere sendes bildet, notatet og eventuelle lydopptak til Balanses server og videre til en AI-tjeneste. Den lagrede loggen din sendes ikke. Du kan trekke samtykket i Innstillinger.
          </Text>
          <Text style={{ fontFamily: F.body, fontSize: 13.5, lineHeight: 19, color: c.mutedForeground }}>
            Resultatet er et estimat og kan ta feil. Det skal ikke være eneste grunnlag for dosering.
          </Text>
          <Button label="Jeg samtykker" icon="check" testID="consent-accept" onPress={async () => { const fn = consentFor; try { await updateSettings({ aiConsent: true }); } catch (e) { setConsentFor(null); setError({ msg: (e as Error).message, retry: () => setConsentFor(() => fn) }); return; } setConsentFor(null); fn?.(); }} />
          <Button label="Ikke nå" variant="ghost" onPress={() => setConsentFor(null)} />
        </Animated.View>
      </View>
    </Modal>
  );

  if (phase === 'compose') {
    return (
      <>
        <Stack.Screen options={{ title: voiceMode ? 'Snakk inn måltidet' : 'Nytt måltid' }} />
        <KeyboardAwareScrollViewCompat bottomOffset={40} style={{ flex: 1, backgroundColor: c.background }} contentContainerStyle={{ padding: 20, paddingTop: 10, gap: 14, paddingBottom: bottom }}>
          {voiceMode ? (
            <View style={{ gap: 12 }}>
              <Text style={{ fontFamily: F.display, fontSize: 24, color: c.foreground }}>Hva har du spist?</Text>
              <Text style={{ fontFamily: F.body, fontSize: 14, lineHeight: 20, color: c.mutedForeground }}>
                Fortell hva maten består av og omtrent hvor mye. Når du stopper opptaket, beregner Balanse ingredienser og karbohydrater — uten bilde.
              </Text>
              <Button label={recording ? `Stopp og beregn · ${elapsed} s` : 'Start opptak'} icon={recording ? 'square' : 'mic'}
                testID="record-voice" variant={recording ? 'danger' : 'primary'}
                loading={audioBusy || transcribe.isPending} disabled={busy}
                onPress={() => recording ? stopRecording() : withConsent(startRecording)} />
            </View>
          ) : null}
          {photoUri ? (
            <Animated.View entering={FadeIn.duration(300)}>
              <Image source={{ uri: photoUri }} style={{ width: '100%', aspectRatio: 4 / 3, borderRadius: 26 }} contentFit="cover" />
              <View style={{ position: 'absolute', right: 12, bottom: 12, flexDirection: 'row', gap: 8 }}>
                <Button label="Nytt" icon="camera" small variant="secondary" onPress={() => doPick('camera')} />
                <Button label="Fjern" icon="x" small variant="secondary" onPress={() => { setPhotoUri(undefined); setImageData(undefined); }} />
              </View>
            </Animated.View>
          ) : !voiceMode ? (
            <View style={{ borderRadius: 26, borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.input, padding: 24, gap: 16, alignItems: 'center', backgroundColor: c.card }}>
              <Text style={{ fontFamily: F.display, fontSize: 21, color: c.foreground, textAlign: 'center' }}>Ta et bilde rett ovenfra</Text>
              <Text style={{ fontFamily: F.body, fontSize: 14, lineHeight: 20, color: c.mutedForeground, textAlign: 'center' }}>
                Står tallerkenen på en kjøkkenvekt, få med displayet. Du bekrefter alltid vekten selv.
              </Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Button label="Kamera" icon="camera" variant="accent" testID="pick-camera" onPress={() => doPick('camera')} />
                <Button label="Bilder" icon="image" variant="secondary" testID="pick-library" onPress={() => doPick('library')} />
              </View>
            </View>
          ) : null}
          {pickIssue ? (
            <Notice icon="camera-off" title="Bildet ble ikke hentet">
              <View style={{ gap: 8 }}>
                <Text style={{ fontFamily: F.body, fontSize: 14, color: c.warn }}>{pickIssue}</Text>
                {Platform.OS !== 'web' && pickIssue.includes('tilgang') ? <Button label="Åpne innstillinger" small variant="secondary" onPress={() => Linking.openSettings()} style={{ alignSelf: 'flex-start' }} /> : null}
              </View>
            </Notice>
          ) : null}

          <View style={{ gap: 8 }}>
            <Label>{voiceMode ? 'Beskrivelse av måltidet' : 'Kontekst før analyse'}</Label>
            <Field value={notes} onChangeText={setNotes} multiline testID="notes-input" editable={!audioBusy && !recording && !busy}
              placeholder={voiceMode ? 'Talen vises her. Du kan også skrive, f.eks. «to brødskiver med ost og ett glass melk».' : 'F.eks. «søt asiatisk saus, ca. halv porsjon ris, tallerkenen veier ikke med»'} />
            {!voiceMode ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Press testID="record" onPress={() => (recording ? stopRecording() : withConsent(startRecording))} disabled={audioBusy || transcribe.isPending || busy}
                accessibilityLabel={recording ? 'Stopp opptak' : 'Ta opp talenotat'}
                style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: recording ? c.destructive : c.primary, alignItems: 'center', justifyContent: 'center' }}>
                <Feather name={recording ? 'square' : 'mic'} size={20} color={c.primaryForeground} />
              </Press>
              <Text style={{ flex: 1, fontFamily: F.body, fontSize: 14, color: c.mutedForeground }}>
                {recording ? `Tar opp … ${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, '0')}  Trykk for å stoppe` : transcribe.isPending ? 'Gjør tale om til tekst …' : 'Snakk i stedet for å skrive. Du kan rette teksten etterpå.'}
              </Text>
            </View> : null}
          </View>

          {errorBox}

          {busy ? (
            <Card style={{ gap: 12 }}>
              <Pulse><Text style={{ fontFamily: F.displayItalic, fontSize: 17, color: c.primary }}>{imageData ? 'Ser på tallerkenen …' : 'Beregner måltidet …'}</Text></Pulse>
              <Skeleton h={14} w="80%" /><Skeleton h={14} w="60%" /><Skeleton h={14} w="70%" />
            </Card>
          ) : (
            <Button label="Analyser måltidet" icon="zap" testID="analyze" disabled={(!imageData && !notes.trim()) || recording || audioBusy || transcribe.isPending}
              onPress={() => withConsent(() => runAnalyze(false))} />
          )}
          <Press onPress={startManual} disabled={audioBusy || recording || busy} testID="manual-entry" style={{ alignSelf: 'center', padding: 8 }}>
            <Text style={{ fontFamily: F.semibold, fontSize: 14.5, color: c.accentForeground }}>Eller skriv inn ingrediensene selv</Text>
          </Press>
        </KeyboardAwareScrollViewCompat>
        {consentModal}
      </>
    );
  }

  const detected = analysis?.detectedWeightGrams;
  const saveLabel = editing ? 'Lagre endringer' : 'Lagre måltid';

  return (
    <>
      <Stack.Screen options={{ title: editing ? 'Rediger måltid' : 'Måltid' }} />
      <KeyboardAwareScrollViewCompat bottomOffset={40} style={{ flex: 1, backgroundColor: c.background }} contentContainerStyle={{ padding: 20, gap: 14, paddingBottom: bottom }}>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-end' }}>
          {photoUri ? <Image source={{ uri: photoUri }} style={{ width: 56, height: 56, borderRadius: 14 }} contentFit="cover" /> : null}
          <Field label="Navn på måltidet" style={{ flex: 1 }} value={title} onChangeText={setTitle} placeholder={validRows[0]?.name || 'Første ingrediens brukes som navn'} testID="title-input" />
        </View>

        <Animated.View entering={FadeInDown.duration(350)} style={{ backgroundColor: c.primary, borderRadius: 22, paddingVertical: 14, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ fontFamily: F.medium, fontSize: 11.5, letterSpacing: 1.1, textTransform: 'uppercase', color: c.primaryForeground, opacity: 0.75 }}>
              Karbohydrater
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}>
              <Text testID="total-carbs" style={{ fontFamily: F.display, fontSize: 40, lineHeight: 46, color: c.primaryForeground }}>≈{fmt(total, 1)}</Text>
              <Text style={{ fontFamily: F.medium, fontSize: 14, color: c.primaryForeground, opacity: 0.8, marginBottom: 8 }}>g karb</Text>
            </View>
            <RatioRef light />
          </View>
          <Press testID="save-meal" onPress={save} disabled={!canSave || saving} accessibilityLabel={saveLabel}
            style={{ backgroundColor: SAVE_COLORS.background, borderRadius: 999, paddingVertical: 12, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 6, opacity: !canSave || saving ? 0.5 : 1 }}>
            <Feather name="check" size={16} color={SAVE_COLORS.foreground} />
            <Text style={{ fontFamily: F.semibold, fontSize: 15, color: SAVE_COLORS.foreground }}>{saving ? 'Lagrer …' : 'Lagre'}</Text>
          </Press>
        </Animated.View>
        {saveError ? <Notice icon="alert-octagon" tone="danger" title="Ikke lagret">{saveError}</Notice> : null}
        {!canSave && !busy ? <Text style={{ fontFamily: F.body, fontSize: 13, color: c.mutedForeground }}>
          {!validRows.length || !rowsValid ? 'Fyll inn gyldige ingredienser og mengder under «Juster».' : ''}
        </Text> : null}

        {!detailsOpen ? (
          <IngredientList items={validRows.map((r) => ({ name: r.name.trim(), grams: num(r.grams), carbsPer100g: num(r.per100) }))} />
        ) : null}
        <Button label={detailsOpen ? 'Ferdig med justering' : 'Juster ingredienser'} icon={detailsOpen ? 'check' : 'sliders'} variant="secondary" small
          testID="toggle-breakdown" onPress={() => setDetailsOpen(v => !v)} />

        {detailsOpen ? <>
        <View style={{ gap: 10 }}>
          <Button label="Søk i matvaretabellen · uten nett" icon="search" variant="secondary" small testID="open-foods" onPress={() => setFoodPicker(true)} />
          {rows.map((r, idx) => (
            <Animated.View key={r.id} entering={FadeInDown.delay(idx * 30).duration(250)}>
              <Card style={{ gap: 8, padding: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <TextInput value={r.name} onChangeText={(t) => updateRow(r.id, { name: t })} placeholder="Ingrediens" placeholderTextColor={c.mutedForeground}
                    style={{ flex: 1, fontFamily: F.semibold, fontSize: 15.5, color: c.foreground, paddingVertical: 4 }} testID={`row-name-${idx}`} />
                  <Text style={{ fontFamily: F.display, fontSize: 17, color: c.primary }}>{fmt(rowCarbs(r), 1)} g</Text>
                  <Press onPress={() => { setRows((rs) => rs.filter((x) => x.id !== r.id)); }} accessibilityLabel="Fjern ingrediens" testID={`row-remove-${idx}`}
                    style={{ width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: c.muted }}>
                    <Feather name="x" size={14} color={c.mutedForeground} />
                  </Press>
                </View>
                <View style={{ gap: 10 }}>
                  <Stepper label="Mengde" suffix="g" step={10} value={r.grams} onChangeText={(t) => updateRow(r.id, { grams: t })} testID={`row-grams-${idx}`} />
                  <Field style={{ flex: 1 }} label="Karb / 100 g" suffix="g" value={r.per100} onChangeText={(t) => updateRow(r.id, { per100: t })} keyboardType="decimal-pad" placeholder="0" testID={`row-per100-${idx}`} />
                </View>
              </Card>
            </Animated.View>
          ))}
          <Button label="Legg til ingrediens" icon="plus" variant="secondary" small testID="add-row" onPress={() => { setRows((rs) => [...rs, emptyRow()]); }} />
          {rows.length > 0 && !rowsValid ? <Notice title="Kontroller ingrediensene">Alle rader må ha navn, en mengde over 0 og høyst 10 000 g, og karbohydrat fra 0 til 100 g per 100 g. Fjern tomme rader før lagring.</Notice> : null}
        </View>

        {source === 'ai' ? (
          <View style={{ gap: 8 }}>
            <Label>Rett opp analysen</Label>
            {corrections.map((x, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: c.secondary, borderRadius: 14, paddingVertical: 9, paddingHorizontal: 12 }}>
                <Feather name="corner-down-right" size={14} color={c.primary} />
                <Text style={{ flex: 1, fontFamily: F.body, fontSize: 14, color: c.foreground }}>{x}</Text>
                <Press onPress={() => setCorrections((p) => p.filter((_, j) => j !== i))} accessibilityLabel="Fjern rettelse"><Feather name="x" size={15} color={c.mutedForeground} /></Press>
              </View>
            ))}
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
              <Field style={{ flex: 1 }} value={correction} onChangeText={setCorrection} onSubmitEditing={addCorrection} returnKeyType="done" placeholder="F.eks. sausen er søt asiatisk" testID="correction-input" />
              <Press onPress={addCorrection} accessibilityLabel="Legg til rettelse" style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: c.primary, alignItems: 'center', justifyContent: 'center' }}>
                <Feather name="plus" size={20} color={c.primaryForeground} />
              </Press>
            </View>
            <Button label="Analyser på nytt" icon="refresh-cw" variant="accent" small loading={busy} testID="reanalyze"
              disabled={!corrections.length && !correction.trim() && !confirmedWeight}
              onPress={() => {
                const t = correction.trim();
                const corr = t ? [...corrections, t] : corrections;
                if (t) { setCorrections(corr); setCorrection(''); }
                withConsent(() => runAnalyze(true, corr));
              }} />
          </View>
        ) : null}
        </> : null}

        {errorBox}

        {detected ? (
          <Card style={{ gap: 10, padding: 14, borderColor: scale === 'confirmed' ? c.sage : c.accent, borderWidth: 1.5 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Feather name="disc" size={16} color={c.accentForeground} />
              <Text style={{ fontFamily: F.semibold, fontSize: 14.5, color: c.foreground, flex: 1 }}>Kjøkkenvekt i bildet</Text>
              <Text style={{ fontFamily: F.display, fontSize: 19, color: c.accentForeground }}>{fmt(detected)} g</Text>
            </View>
            <Text style={{ fontFamily: F.body, fontSize: 13, lineHeight: 18, color: c.mutedForeground }}>
              Ikke brukt i beregningen. Var vekten tarert, slik at tallet bare er maten?
            </Text>
            {scale === 'pending' ? (
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                <Button label="Ja, bruk som nettovekt" small variant="primary" testID="scale-confirm" onPress={() => { setNetWeight(toStr(detected)); setScale('confirmed'); }} />
                <Button label="Nei / usikker" small variant="secondary" testID="scale-reject" onPress={() => setScale('rejected')} />
              </View>
            ) : null}
            {scale !== 'pending' ? (
              <Field label={scale === 'confirmed' ? 'Bekreftet nettovekt mat' : 'Nettovekt uten tallerken (valgfritt)'} suffix="g" value={netWeight}
                onChangeText={(t) => { setNetWeight(t); if (num(t) > 0) setScale('confirmed'); }} keyboardType="decimal-pad" testID="net-weight" />
            ) : null}
            {confirmedWeight ? (
              <Button label={`Analyser på nytt med ${fmt(confirmedWeight)} g`} icon="refresh-cw" small variant="accent" loading={busy} onPress={() => withConsent(() => runAnalyze(true))} />
            ) : null}
          </Card>
        ) : null}

        <TimeField value={timestamp} onChange={setTimestamp} label="Når spiste du?" />
        <Field label="Notat" value={notes} onChangeText={setNotes} multiline placeholder="Valgfritt" />

        {rows.some((r) => r.assumption && r.name.trim()) ? (
          <View style={{ gap: 4 }}>
            <Label>Antakelser</Label>
            {rows.filter((r) => r.assumption && r.name.trim()).map((r) => (
              <Text key={r.id} style={{ fontFamily: F.displayItalic, fontSize: 13, lineHeight: 18, color: c.mutedForeground }}>{r.name.trim()}: {r.assumption}</Text>
            ))}
          </View>
        ) : null}
        {analysis?.uncertainty ? <Notice icon="alert-circle" title="Usikkerhet for dette måltidet">{analysis.uncertainty}</Notice> : null}

        {detailsOpen ? <Button label={saveLabel} icon="check" testID="save-meal-details" disabled={!canSave} loading={saving} onPress={save} /> : null}
        {!editing && source === 'ai' ? (
          <Button label={voiceMode ? 'Tilbake til beskrivelsen' : 'Tilbake til bilde og notat'} icon="arrow-left" variant="ghost" small onPress={() => setPhase('compose')} />
        ) : null}
      </KeyboardAwareScrollViewCompat>
      {consentModal}
      {foodPicker ? <FoodPicker onClose={() => setFoodPicker(false)} onSelect={addFood} /> : null}
    </>
  );
}
