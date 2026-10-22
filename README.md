# Balanse (tidligere Karb)

En norsk app for å anslå karbohydrater i måltider, justere ingredienser og føre en personlig mat- og helselogg. Bygget med Expo, React Native og TypeScript, med en Express-API for bildeanalyse, tolkning av tekst og transkripsjon av tale.

Appen heter nå **Balanse**. Eksisterende tekniske navn som `artifacts/karb`, `@workspace/karb` og lokale lagringsnøkler er beholdt for kompatibilitet. Navnebyttet flytter eller nullstiller ikke eksisterende registreringer. Repositoriet er https://github.com/iwronski/Balanse.

Karb er laget for å gjøre daglig registrering ved diabetes type 1 enklere: fra bilde eller en kort beskrivelse til en oversikt over mat, glukose, insulin og aktivitet. Grensesnittet bruker rolige gråtoner, dempede aksentfarger og lokalt inkludert Geist-skrift.

## Funksjoner

- Ta eller velg et bilde av maten og få total karbohydratmengde og ingrediensnedbrytning.
- Suppler med tekst eller tale, og korriger mengder og ingredienser.
- Bekreft netto matvekt når analysen oppdager en vekt.
- Registrer måltider manuelt med søk i 2 121 norske matvarer.
- Registrer flere hendelser i ett tekst- eller taleinnlegg, med mulighet til å justere hvert utkast før lagring.
- Se karbohydrater og faktisk registrert hurtigvirkende insulin per dag, bla til tidligere dager og se gjennomsnitt for dager med relevante data.
- Fjern et måltid fra dagens inntak uten å miste referansen i loggen, eller slett det permanent.
- Samlet Logg med måltider, blodsukker, tatt insulin og aktivitet i kronologisk rekkefølge. Alle registreringstyper er tilgjengelige uten et eget modusvalg.
- Filtrer på én eller flere registreringstyper, rediger og slett oppføringer, og åpne måltidsbilder i større størrelse.
- Tidsbasert graf med glukose, målområde 3,9–10 mmol/L, måltider og ulike insulintyper.
- Eksporter loggen som tekst/CSV, eller ta en JSON-sikkerhetskopi som kan importeres og slås sammen med eksisterende data.
- Bruk nettversjonen fra hjemskjermen på iPhone.

Appen beregner ikke anbefalte insulindoser eller pumpeinnstillinger. Karbohydratfaktoren er en referanseinnstilling, ikke en automatisk doseringsfunksjon.

## Slik fungerer Balanse

### Bilde av et måltid

1. Ta eller velg et bilde, og legg eventuelt til en beskrivelse av maten.
2. Klienten sender bildet og beskrivelsen til API-et etter samtykke til AI-behandling.
3. AI returnerer ingredienser, anslått mengde, karbohydratinnhold og antakelser. Karbohydrater per ingrediens beregnes som `gram × karbohydrater per 100 g / 100`.
4. Totalen og ingredienslisten vises. Du kan lagre direkte eller korrigere, for eksempel fra en usøtet saus til en søt asiatisk saus.
5. Dersom en vekt oppdages i bildet, kan netto matvekt bekreftes. En synlig vektverdi er ikke nødvendigvis vekten av maten uten tallerken.

Bildeanalyse anslår innhold og mengder; den måler dem ikke. Den lokale matvaretabellen brukes til søk og manuell registrering og er ikke en garanti for at alle AI-estimater er slått opp i tabellen.

### «Skriv eller snakk inn»

Tekst og tale bruker samme registreringsflyt. Lyd transkriberes først til norsk tekst. Teksten analyseres deretter sammen med referansetidspunkt og tidssone, slik at flere hendelser og tidligere datoer kan behandles i samme innlegg.

Eksempel:

> Jeg spilte tennis mellom 9 og 10. Blodsukkeret mitt var 11 før trening og 5 etter trening. Jeg satt 3 E insulin 10:30 og spiste tre brødskiver klokka 11.

Dette er ment å bli fem separate utkast: aktivitet, to glukosemålinger, én insulinregistrering og ett måltid. Hvert utkast har egne redigerbare verdier og tidspunkt. Manglende nødvendige opplysninger må fylles inn før lagring. Samlet lagring skjer i én lokal oppdatering.

Insulin registreres bare når teksten oppgir at det faktisk er tatt. Når typen ikke er oppgitt og den rapporterte dosen er under 10 E, velges hurtigvirkende som redigerbart standardvalg. Ved 10 E eller mer må ukjent type avklares. En uttrykkelig angitt type beholdes uansett dose. Dette er klassifisering av registrerte doser, ikke en doseanbefaling.

### Forside, Logg og summer

- Forsiden viser spiste måltider og insulinregistreringer for valgt dag. Måltidslisten er sammenleggbar.
- Et måltid kan fjernes fra dagens inntak uten å slettes fra Logg. Permanent sletting er en separat handling.
- Dagskortet summerer karbohydrater fra spiste måltider og **hurtigvirkende insulin**. Gjennomsnittet teller dager med spiste måltider eller hurtigvirkende insulin, ikke tomme kalenderdager.
- Etterregistreringer med tidligere dato inngår i den aktuelle dagens summer.
- Grafoppsummeringen summerer karbohydrater og insulin **uten langtidsinsulin**; annet/uspesifisert insulin er fortsatt med. Langtidsinsulin vises fortsatt i selve grafen og i Logg.
- Ikoner skiller mellom hurtiginsulin, langtidsinsulin, glukose, aktivitet og måltid uten bilde. Måltider med bilde viser et miniatyrbilde.

### Hva skjer lokalt, og hva krever nett?

Registreringer, innstillinger, matvaretabell og summer håndteres lokalt. AI-bildeanalyse, teksttolkning og transkripsjon krever et tilgjengelig API og nettforbindelse. AI kjører ikke lokalt på telefonen i denne utgaven.

Når appen allerede er lastet, kan lokale registreringer brukes uten AI. Nettversjonen har ikke en implementert service worker som garanterer kald oppstart uten nett. Hjemskjerminstallasjon alene gir ikke denne garantien.

## Teknisk arkitektur

```text
Expo / React Native / nettklient
  ├─ AsyncStorage: måltider, helsehendelser og innstillinger
  ├─ lokal matvaretabell og lokale beregninger
  └─ HTTPS → Express API under /api
               ├─ /karb/analyze      → bilde og ingrediensestimat
               ├─ /karb/parse-entry  → tekst til flere registreringsutkast
               └─ /karb/transcribe   → lyd til norsk tekst
                         ↓
                OpenAI-kompatibel AI-tjeneste
```

Serveren validerer input og AI-resultater før de returneres. Klienten validerer utkast og lagrer journaldata lokalt. Koden bruker per i dag `gpt-5.4-mini` til analyse/teksttolkning og `gpt-4o-mini-transcribe` til transkripsjon; modellenes tilgjengelighet avhenger av AI-leverandøren.

## Prosjektstruktur

| Mappe | Innhold |
| --- | --- |
| `artifacts/karb` | Expo-app, nettversjon, lokal lagring og matvaredatabase |
| `artifacts/api-server` | Express-API for måltidsanalyse, teksttolkning og transkripsjon |
| `artifacts/mockup-sandbox` | Separat design-/komponentarbeidsområde |
| `lib/api-spec` | OpenAPI-kontrakt og kodegenerering |
| `lib/api-client-react` | Genererte klientfunksjoner og React Query-hooks |
| `lib/api-zod` | Genererte valideringsskjemaer |
| `lib/integrations-openai-ai-server` | Serverintegrasjon for AI |
| `lib/db` | Databasegrunnlag fra prosjektmalen; helseloggen lagres ikke her |
| `attached_assets` | Opprinnelig matvaretabell og bildeasset |
| `scripts/import-food-table.py` | Import av Excel-tabellen |

## Oppsett

Bruk Node.js 24 og pnpm 10 (prosjektet er brukt med pnpm 10.26.1).

```sh
git clone https://github.com/iwronski/Balanse.git
cd Balanse
pnpm install --frozen-lockfile
```

### Miljøvariabler

Legg hemmeligheter i driftsmiljøets hemmelighetslager, aldri i Git. Kommandoene nedenfor forutsetter at nødvendige variabler allerede er tilgjengelige i prosessen.

| Variabel | Bruk |
| --- | --- |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | Serverens AI-nøkkel |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | Serverens OpenAI-kompatible API-adresse |
| `PORT` | Port for hver serverprosess |
| `EXPO_PUBLIC_DOMAIN` | API-vertsnavn uten `https://` for Expo/utviklingsklienten |

Replit-oppsettet bruker Replit AI Integrations. En kopi på GitHub inkluderer ikke disse hemmelighetene eller betaling for API-bruk. Ved annen hosting må AI-tilgang, modellstøtte og HTTPS/ruting settes opp separat.

### Utvikling på Replit

Prosjektets arbeidsflyter ligger i `.replit`. Replit administrerer i tillegg artifact-ruting og forhåndsvisninger; slike lokale metadata er ikke nødvendigvis med i GitHub-kopien.

Start de eksisterende arbeidsflytene for API-server og Balanse. Expo-utviklingsskriptet bruker Replit-spesifikke variabler for forhåndsvisning og eventuell Expo-innlogging.

### Utvikling utenfor Replit

Start API-serveren:

```sh
PORT=8080 pnpm --filter @workspace/api-server run dev
```

Start Expo direkte i en annen terminal, med et HTTPS-vertsnavn som ruter `/api` til API-serveren:

```sh
cd artifacts/karb
EXPO_PUBLIC_DOMAIN=api.example.com pnpm exec expo start
```

Bytt ut `api.example.com` med ditt eget tilgjengelige API-vertsnavn. Mobiltelefonen må kunne nå adressen. Det eksisterende `dev`-skriptet er laget for Replit; kommandoen over omgår denne Replit-spesifikke oppstarten.

## Bygg og kjør nettversjonen

```sh
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/karb run build:web
```

Kjør serverne som separate prosesser:

```sh
PORT=8080 NODE_ENV=production pnpm --filter @workspace/api-server run start
PORT=25038 NODE_ENV=production pnpm --filter @workspace/karb run serve:web
```

I produksjon må en HTTPS-ruter sende `/api/*` til API-serveren og øvrige adresser til nettserveren. Nettklienten bruker samme domene for API-kall. Replit-konfigurasjonen inneholder denne tjenesterutingen; andre plattformer må konfigureres tilsvarende.

Bygget genererer `artifacts/karb/dist-web`, inkludert manifest og hjemskjermikon. Mappen skal ikke sjekkes inn i Git, men **må være med i driftsmiljøet etter bygging**. Ikke ekskluder den i `.replitignore`.

### På iPhone

Åpne den publiserte HTTPS-adressen i Safari → Del → Legg til på Hjem-skjermen. Dette krever ikke en App Store-utgivelse. Kamera og mikrofon krever tillatelse. En hjemskjermsnarvei gjør ikke appen tilgjengelig uten nett; offline-oppstart er ikke implementert.

## Data og personvern

- Måltider, helsehendelser og innstillinger lagres lokalt med AsyncStorage, på nett i nettleserens lagring.
- Serveren lagrer ikke helseloggen. Bilder, tekst og lyd som sendes til AI behandles via den konfigurerte AI-tjenesten.
- Lokal lagring er ikke en kryptert sikkerhetskopi. Sletting av nettleserdata kan slette loggen.
- Logger synkroniseres ikke mellom telefoner, nettlesere, Expo Go og publiserte domener.
- Nettklienten lagrer måltider, helsehendelser og innstillinger samlet som et lokalt øyeblikksbilde (`karb.snapshot.v1`). Lagring oppdaterer hele øyeblikksbildet før grensesnittet bekrefter endringen.
- JSON-import valideres før lagring og slås sammen med eksisterende oppføringer. En import gir aldri automatisk nytt samtykke til AI-behandling.
- JSON-sikkerhetskopien pakker ikke med selve bildefilene. En bildereferanse garanterer ikke at bildet kan åpnes på en annen enhet.
- Dette repositoriet inneholder kildekode og matvaregrunnlag, ikke brukerens personlige måltids- eller helselogg.
- Appen har ikke innebygd brukerinnlogging. Begrens tilgang i driftsmiljøet dersom API-et ikke skal være offentlig. Serverens ratebegrensning erstatter ikke autentisering eller kostnadskontroll.

### Oppdatere eller flytte appen uten å miste registreringer

Ta først en JSON-sikkerhetskopi fra Innstillinger og oppbevar den trygt. Behold samme publiserte domene og nettleser ved vanlige oppdateringer; ikke slett nettstedsdata. Opplasting av kode til GitHub endrer ikke dataene på telefonen og er heller ikke en sikkerhetskopi av dem.

Et nytt domene eller en annen enhet får egen lokal lagring. Flytting krever eksport og import; eventuelle bilder må håndteres separat. En oppdatering av kode må ikke nullstille eller erstatte eksisterende lokal lagring.

### Fortsette utviklingen i et annet program

1. Klon dette repositoriet i ønsket editor eller utviklingsverktøy. Installer avhengighetene med kommandoene over.
2. Sett opp AI-tjenesten i servermiljøet og tilgjengelig HTTPS-ruting til `/api`. Replit-hemmeligheter følger ikke med GitHub-kopien. Sjekk at den nye AI-leverandøren støtter de konfigurerte modellene; eventuelle modellbytter gjøres i serverkoden.
3. Kjør typekontroll og tester før du endrer eller publiserer appen.
4. På den eksisterende iPhone-installasjonen: åpne **Innstillinger → Sikkerhetskopi → Lagre JSON-sikkerhetskopi**. Kontroller at filen faktisk er lagret. Ikke legg denne ukrypterte helsefilen i et offentlig GitHub-repositorium.
5. Ved nytt domene/enhet: åpne den nye appen og velg **Hent fra JSON-fil → Slå sammen med min logg** i Innstillinger. Kontroller oppføringer og dagssummer før du slutter å bruke den gamle installasjonen. Måltidsbildene følger ikke med selve JSON-filen.

Kopien inneholder den aktuelle kildekoden, tester, konfigurasjon, låsefil, norsk matvaredatabase, det opprinnelige Excel-grunnlaget og logoressurser. Design-sandkassen er også med, men trengs ikke for å kjøre selve Balanse. Personlige helseopplysninger i skjermbilder, hemmeligheter, interne agentnotater, avhengighetsmapper og genererte bygg er utelatt. Eksporten overfører ikke intern Replit-samtale- eller checkpoint-historikk.

**Viktig ved videre utvikling:** Behold lagringsnøkkelen `karb.snapshot.v1` og støtte for eksisterende sikkerhetskopier. Ikke erstatt lagrede data med eksempeldata, ikke nullstill lagring ved oppstart, og behold det publiserte domenet ved vanlige oppdateringer. Kildekodeopplasting er ikke en sikkerhetskopi av telefonens logg.

### Drift og kostnader

Kildekoden kan kjøres på annen hosting, men løsningen er ikke uavhengig av tjenester slik den står nå. Nettversjonen trenger hosting, og AI-funksjonene trenger finansiert API-tilgang. Et vanlig Claude- eller ChatGPT-abonnement erstatter ikke serverens API-tilgang. GitHub lagrer kode og dokumentasjon, men kjører ikke denne serverløsningen automatisk.

## Matvaregrunnlag

Excel-filen `attached_assets/alle-matvarer_1791999529511.xlsx` er det vedlagte datagrunnlaget fra Matvaretabellen (Mattilsynet). Den importerte søkedatabasen ligger i `artifacts/karb/data/foods.json`.

Importer på nytt fra prosjektroten med Python 3, uten ekstra pakker:

```sh
python3 scripts/import-food-table.py attached_assets/alle-matvarer_1791999529511.xlsx
```

Importen forventer det medfølgende regnearkformatet og 2 121 unike matvarer. Ukjente karbohydratverdier beholdes som ukjente, ikke som null. Matvaredata og tredjepartsressurser følger sine respektive rettigheter og bruksvilkår.

## Kontroll og kodegenerering

```sh
pnpm --filter @workspace/karb run typecheck
pnpm --filter @workspace/api-server run typecheck
TZ=Europe/Oslo node --test artifacts/karb/tests/*.test.mjs
pnpm --filter @workspace/api-server run test:karb-entry
```

Testene dekker blant annet sikkerhetskopiering, sammenslåing, registreringsutkast, måltidsnavn, dagssummer og grafoppsett. Bruk `TZ=Europe/Oslo` for klienttestene: testen av sommer-/vintertid forutsetter norsk tidssone. API-testene kontrollerer blant annet flere hendelser, tidsangivelser og klassifisering av eksplisitt rapportert insulin.

Kjør `pnpm --filter @workspace/api-spec run codegen` når OpenAPI-kontrakten endres. Prosjektet inkluderer låsefil for reproduserbare installasjoner. Genererte bygg, avhengigheter, lokale agentnotater og hemmeligheter er ikke del av GitHub-eksporten.
