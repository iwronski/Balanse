import React, { useEffect, useState } from 'react';
import { Platform, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getRecordingPermissionsAsync, requestRecordingPermissionsAsync } from 'expo-audio';
import { useColors } from '@/hooks/useColors';
import { F } from '@/constants/type';
import { useStore } from '@/lib/store';
import { downloadBackup, pickBackup, shareExport } from '@/lib/export';
import { mergeBackup, parseBackup, type Backup } from '@/lib/backup';
import { confirmAsync } from '@/lib/confirm';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { Button, Card, Field, Label, Notice, tap } from '@/components/ui';
import { fmt, num } from '@/lib/types';

function Row({ title, body, value, onChange, testID }: { title: string; body: string; value: boolean; onChange: (v: boolean) => void; testID: string }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ fontFamily: F.semibold, fontSize: 16, color: c.foreground }}>{title}</Text>
        <Text style={{ fontFamily: F.body, fontSize: 13.5, lineHeight: 19, color: c.mutedForeground }}>{body}</Text>
      </View>
      <Switch testID={testID} value={value} onValueChange={(v) => { tap(); onChange(v); }} trackColor={{ true: c.sage, false: c.input }} thumbColor={c.card} />
    </View>
  );
}

export default function SettingsScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { settings, updateSettings, meals, health, wipeAll, importBackup } = useStore();
  const [ratio, setRatio] = useState(settings.clinicianRatio ? String(settings.clinicianRatio).replace('.', ',') : '');
  const [ratioNote, setRatioNote] = useState(settings.ratioNote);
  const [shareErr, setShareErr] = useState<string | null>(null);
  const [storeErr, setStoreErr] = useState<string | null>(null);
  const [pending, setPending] = useState<{ raw: string; backup: Backup } | null>(null);
  const [restoreSettings, setRestoreSettings] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupMessage, setBackupMessage] = useState<string | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [mic, setMic] = useState<'unknown' | 'granted' | 'denied' | 'undetermined' | 'unavailable'>('unknown');
  const [micBusy, setMicBusy] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  useEffect(() => { getRecordingPermissionsAsync().then((r) => setMic(r.granted ? 'granted' : r.canAskAgain ? 'undetermined' : 'denied')).catch(() => setMic('unavailable')); }, []);
  const askMic = async () => {
    setMicBusy(true);
    try { const r = await requestRecordingPermissionsAsync(); setMic(r.granted ? 'granted' : r.canAskAgain ? 'undetermined' : 'denied'); }
    catch { setMic('unavailable'); } finally { setMicBusy(false); }
  };
  const MIC_TEXT = { unknown: 'Sjekker status …', granted: 'Tillatt akkurat nå', denied: 'Avslått – endre i telefonens eller nettleserens innstillinger', undetermined: 'Ikke gitt ennå', unavailable: 'Mikrofon er ikke tilgjengelig her' } as const;
  const preview = pending ? mergeBackup({ meals, health, settings }, pending.backup, restoreSettings) : null;
  const persist = async (p: Parameters<typeof updateSettings>[0]) => { setStoreErr(null); try { await updateSettings(p); } catch (e) { setStoreErr((e as Error).message); } };

  const doShare = async (k: 'text' | 'csv') => {
    setShareErr(null);
    try { await shareExport(k, meals, health, settings); } catch { setShareErr('Deling er ikke tilgjengelig her. Prøv på telefonen.'); }
  };

  return (
    <KeyboardAwareScrollViewCompat bottomOffset={40} style={{ flex: 1, backgroundColor: c.background }} contentContainerStyle={{ padding: 20, gap: 22, paddingBottom: (Platform.OS === 'web' ? 34 : insets.bottom) + 40 }}>
      <View style={{ gap: 12 }}>
        <Button testID="about-balanse" label="Om Balanse" icon="info" variant="secondary" onPress={() => setShowAbout((shown) => !shown)} />
        {showAbout ? (
          <Card style={{ gap: 12 }}>
            <Text accessibilityRole="header" style={{ fontFamily: F.semibold, fontSize: 17, color: c.foreground }}>Om Balanse</Text>
            <Text style={{ fontFamily: F.body, fontSize: 15, lineHeight: 21, color: c.foreground }}>
              Balanse hjelper deg å få bedre kontroll på diabetes og forstå hvordan kroppen din reagerer på karbohydrater, insulin og aktivitet.
            </Text>
            <Text style={{ fontFamily: F.body, fontSize: 15, lineHeight: 21, color: c.foreground }}>
              Registrer mat med bilde, tekst, tale eller matvaretabellen. AI tolker det du legger inn og anslår karbohydrater i maten. Du kan justere oppføringene selv og registrere glukose, insulin og aktivitet.
            </Text>
            <Text style={{ fontFamily: F.body, fontSize: 15, lineHeight: 21, color: c.foreground }}>
              I Logg ser du registreringene samlet i en tidslinje og i grafer, slik at det blir lettere å oppdage sammenhenger over tid. Loggen lagres på enheten din.
            </Text>
          </Card>
        ) : null}
      </View>
      {storeErr ? <Notice icon="alert-octagon" tone="danger" title="Ikke lagret">{storeErr}</Notice> : null}
      <Card style={{ gap: 18 }}>
        <Row testID="toggle-consent" title="Samtykke til AI-analyse" body="Bilder, tekst og lydopptak du selv legger inn – også helseopplysninger som glukose, insulin og aktivitet – sendes til serveren og en AI-tjeneste for analyse av den nye registreringen, bare når du starter analysen. Den lagrede loggen din sendes ikke." value={settings.aiConsent} onChange={(v) => persist({ aiConsent: v })} />
      </Card>

      <View style={{ gap: 10 }}>
        <Label>Mikrofon</Label>
        <Card style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: mic === 'granted' ? c.sage : mic === 'denied' || mic === 'unavailable' ? c.destructive : c.input }} />
            <Text testID="mic-status" style={{ flex: 1, fontFamily: F.semibold, fontSize: 15, color: c.foreground }}>{MIC_TEXT[mic]}</Text>
          </View>
          <Text style={{ fontFamily: F.body, fontSize: 13.5, lineHeight: 19, color: c.mutedForeground }}>
            Brukes til Snakk inn. Balanse lagrer ikke tillatelsen selv – iPhone eller nettleseren bestemmer, og kan spørre på nytt neste gang du tar opp, særlig i Safari eller fra hjemskjermen.
          </Text>
          {mic !== 'granted' ? <Button testID="mic-request" label="Gi tilgang til mikrofon" icon="mic" variant="secondary" small loading={micBusy} disabled={mic === 'unavailable'} onPress={askMic} /> : null}
        </Card>
      </View>

      <View style={{ gap: 10 }}>
        <Label>Din karbohydratfaktor</Label>
        <Card style={{ gap: 12 }}>
          <Text style={{ fontFamily: F.body, fontSize: 14, lineHeight: 20, color: c.mutedForeground }}>
            Ditt eget anslag for hvor mange gram karbohydrat én enhet dekker. Vises bare som referanse under totalen – Balanse regner aldri ut doser.
          </Text>
          <Field label="Faktor (valgfritt)" suffix="g/enhet" value={ratio} onChangeText={setRatio} keyboardType="decimal-pad" placeholder="Tom = skjult" testID="ratio-input"
            onBlur={() => { const n = num(ratio); persist({ clinicianRatio: n > 0 ? n : null }); }} />
          <Field label="Merknad" value={ratioNote} onChangeText={setRatioNote} onBlur={() => persist({ ratioNote })} placeholder="f.eks. gjelder frokost" />
          {settings.clinicianRatio ? <Text style={{ fontFamily: F.medium, fontSize: 13, color: c.sage }}>Lagret: {fmt(settings.clinicianRatio, 1)} g/enhet</Text> : null}
        </Card>
      </View>

      <View style={{ gap: 10 }}>
        <Label>Eksport til behandler</Label>
        <Card style={{ gap: 12 }}>
          <Text style={{ fontFamily: F.body, fontSize: 14, lineHeight: 20, color: c.mutedForeground }}>
            {meals.length} måltider og {health.length} oppføringer for insulin, glukose og aktivitet deles via telefonens delingsmeny.
          </Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button label="Del som tekst" icon="share" small style={{ flex: 1 }} onPress={() => doShare('text')} disabled={!meals.length && !health.length} />
            <Button label="Del CSV" icon="file-text" small variant="secondary" style={{ flex: 1 }} onPress={() => doShare('csv')} disabled={!meals.length && !health.length} />
          </View>
          {shareErr ? <Text style={{ fontFamily: F.body, color: c.destructive }}>{shareErr}</Text> : null}
        </Card>
      </View>

      <View style={{ gap: 10 }}>
        <Label>Sikkerhetskopi</Label>
        <Card style={{ gap: 12 }}>
          <Text style={{ fontFamily: F.body, fontSize: 14, lineHeight: 20, color: c.mutedForeground }}>
            JSON-kopien inneholder alle {meals.length} måltider, {health.length} helseoppføringer og lagrede innstillinger. Tekst og CSV er ikke sikkerhetskopier. Filen inneholder ukrypterte helseopplysninger – lagre den et trygt sted. Bildereferanser beholdes, men selve bildefilene følger ikke med og kan mangle på en annen enhet.
          </Text>
          <Button testID="backup-export" label="Lagre JSON-sikkerhetskopi" icon="download" disabled={backupBusy} onPress={async () => {
            setBackupError(null); setBackupMessage(null); setBackupBusy(true);
            try { await downloadBackup({ meals, health, settings }); setBackupMessage('Sikkerhetskopien er sendt til nedlasting eller deling. Kontroller at JSON-filen er lagret.'); }
            catch (e) { setBackupError((e as Error).message); }
            finally { setBackupBusy(false); }
          }} />
          <Button testID="backup-pick" label="Hent fra JSON-fil" icon="upload" variant="secondary" disabled={backupBusy} onPress={async () => {
            setBackupError(null); setBackupMessage(null); setPending(null); setRestoreSettings(false);
            // Keep the picker in the user gesture (Safari); cancellation never writes data.
            try { const raw = await pickBackup(); if (raw !== null) setPending({ raw, backup: parseBackup(raw) }); }
            catch (e) { setBackupError((e as Error).message); }
          }} />
          {pending && preview ? (
            <View style={{ gap: 12 }}>
              <Text testID="backup-preview" style={{ fontFamily: F.body, fontSize: 14, lineHeight: 21, color: c.foreground }}>
                Kopi fra {new Date(pending.backup.exportedAt).toLocaleString('nb-NO')}: {pending.backup.meals.length} måltider og {pending.backup.health.length} helseoppføringer.
                {'\n'}{preview.added} legges til, {preview.skipped} identiske hoppes over, {preview.conflicts} ID-konflikter får nye ID-er. Eksisterende oppføringer beholdes uendret.
              </Text>
              <Row testID="backup-settings" title="Hent også innstillinger" body="Av som standard. Erstatter faktor og merknad. Ditt nåværende AI-samtykke beholdes." value={restoreSettings} onChange={setRestoreSettings} />
              {restoreSettings ? <Text style={{ fontFamily: F.body, color: c.mutedForeground }}>
                Faktor i filen: {pending.backup.settings.clinicianRatio === null ? 'skjult' : `${fmt(pending.backup.settings.clinicianRatio, 1)} g/enhet`}. Merknad: {pending.backup.settings.ratioNote || '(tom)'}.
              </Text> : null}
              <Button testID="backup-import" label="Slå sammen med min logg" disabled={backupBusy} onPress={async () => {
                if (!await confirmAsync('Hente sikkerhetskopien?', `Eksisterende logg beholdes. ${restoreSettings ? 'Innstillingene erstattes, bortsett fra AI-samtykke.' : 'Innstillingene beholdes.'}`, 'Slå sammen')) return;
                setBackupBusy(true); setBackupError(null); setBackupMessage(null);
                try {
                  await importBackup(pending.raw, restoreSettings);
                  if (restoreSettings) {
                    setRatio(pending.backup.settings.clinicianRatio === null ? '' : String(pending.backup.settings.clinicianRatio).replace('.', ','));
                    setRatioNote(pending.backup.settings.ratioNote);
                  }
                  setPending(null); setBackupMessage('Sikkerhetskopien er slått sammen med loggen og lagret på enheten.');
                } catch (e) { setBackupError((e as Error).message); }
                finally { setBackupBusy(false); }
              }} />
              <Button testID="backup-cancel" label="Avbryt import" variant="ghost" disabled={backupBusy} onPress={() => setPending(null)} />
            </View>
          ) : null}
          {backupError ? <Notice icon="alert-octagon" tone="danger" title="Kunne ikke fullføre">{backupError}</Notice> : null}
          {backupMessage ? <Text testID="backup-message" style={{ fontFamily: F.body, color: c.foreground }}>{backupMessage}</Text> : null}
        </Card>
      </View>

      <View style={{ gap: 10 }}>
        <Label>Personvern</Label>
        <Notice icon="shield" tone="sage" title="Hva som skjer med dataene dine">
          <Text style={{ fontFamily: F.body, fontSize: 14, lineHeight: 21, color: c.sage }}>
            Måltider, logg og innstillinger lagres lokalt på enheten med AsyncStorage. De er ikke kryptert, så alle med tilgang til en ulåst telefon kan i prinsippet lese dem. Den lagrede loggen sendes aldri til serveren. Bilder, tekst og opptak du legger inn sendes kun når du selv starter en analyse av den nye registreringen, etter samtykke.
          </Text>
        </Notice>
        <Button label="Slett alle lokale data" icon="trash-2" variant="ghost" testID="wipe" onPress={async () => {
          if (await confirmAsync('Slette alt?', 'Alle måltider, logg og innstillinger fjernes fra denne enheten.', 'Slett alt')) { setStoreErr(null); try { await wipeAll(); } catch (e) { setStoreErr((e as Error).message); return; } tap('warn'); setRatio(''); setRatioNote(''); }
        }} />
      </View>
    </KeyboardAwareScrollViewCompat>
  );
}
