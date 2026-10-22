# Karbohydrat-benchmark

Et automatisk testoppsett som måler hvor godt ulike AI-modeller anslår karbohydrater fra et bilde av et måltid.
Hver modell får de samme bildene, og svaret sammenlignes med en fasit der maten er veid.

## Datasett

**Nutrition5k** (Google Research, lisens CC BY 4.0). Rundt 5000 kantinetallerkener fra USA der hver ingrediens er veid,
og næringsinnholdet er regnet ut fra USDA-databasen. Skriptet bruker den offisielle testdelen og bildet tatt rett ovenfra.
Bildene lastes ned automatisk første gang (ca 0,4 MB per bilde) og lagres i `scripts/carb-bench/data/`, som ikke sjekkes inn.

Ting å vite om fasiten:

- Karbohydrat i Nutrition5k er *totalt* karbohydrat (fiber regnes med), slik amerikanske tabeller gjør. Testen ber derfor
  modellen om totalt karbohydrat for dette datasettet, mens appen ellers bruker norsk/europeisk definisjon (uten fiber).
- Maten er amerikansk kantinemat, ikke norsk hverdagsmat. Til slutt bør vi derfor også teste på egne bilder (se under).
- Retter med under 10 g karbohydrat hoppes over som standard (`--min-carbs`), fordi de er lite relevante for insulin.

## Slik kjører du

Fra mappen `scripts` i repoet:

```bash
pnpm carb-bench --n 20
```

Uten `--yes` er dette en **prøvekjøring**: den laster ned bildene og viser hva det vil koste, men kaller ingen modell.
Når prisen ser grei ut:

```bash
OPENAI_API_KEY=... ANTHROPIC_API_KEY=... pnpm carb-bench --n 20 --yes
```

Modeller uten nøkkel hoppes over. Resultatet skrives til skjermen og lagres i `scripts/carb-bench/results/<tidspunkt>/report.md`.

| Valg | Betydning | Standard |
|---|---|---|
| `--n 20` | Antall bilder | 20 |
| `--models a,b` | Modeller som testes. `:low`/`:medium`/`:high` bak navnet styrer hvor mye modellen tenker | `gpt-5.4-mini,claude-haiku-5-5` |
| `--with-weight` | Gir modellen tallerkenens nettovekt, som når brukeren har veid maten | av |
| `--with-notes` | Gir modellen ingredienslisten som tekst, som når brukeren beskriver måltidet | av |
| `--seed 1` | Bytt tall for å trekke andre bilder | 1 |
| `--dataset mappe` | Bruk egne bilder i stedet for Nutrition5k (se under) | nutrition5k |
| `--import navn=fil.csv` | Ta med svar fra en annen kilde, for eksempel iPhone-modellen | |
| `--yes` | Kjør modellene for alvor (koster penger) | av |

## Hva tallene betyr

- **Snittfeil (g)**: hvor mange gram karbohydrat modellen i snitt bommer med. Dette er hovedtallet.
- **Snittfeil (%)**: det samme i prosent av fasiten.
- **Skjevhet**: over null betyr at modellen i snitt anslår for mye, under null for lite.
- **Innen ±10 g / ±20 %**: andelen måltider der anslaget var godt nok til praktisk bruk.
- **Tid** og **kr per bilde** er målt fra de faktiske kallene. Prisene ligger i `scripts/src/carb-bench/models.ts` og bør sjekkes
  mot leverandørenes prisside av og til.

## Egne bilder

Lag en mappe med bildene og en fil `fasit.csv`:

```
fil;karbo_g;vekt_g;notat
middag1.jpg;62;480;kylling, ris og brokkoli
frokost1.jpg;35;;to brødskiver med ost
```

Vekt og notat kan stå tomme. Kjør så `pnpm carb-bench --dataset ../min-mappe --n 30`. Her brukes norsk definisjon (uten fiber).
30 egne, veide måltider er det beste grunnlaget for å velge modell til appen.

## iPhones innebygde modell (Apple Foundation Models)

Apple sin modell kjører bare på Apple-maskinvare, så den kan ikke kalles fra skyen eller fra dette skriptet direkte.
Planen er å teste den på Mac-en, som har den samme modellen når Apple Intelligence er slått på (macOS 27):

1. Kjør benchmarken som vanlig. Den skriver `samples.csv` med de samme bildene og fasiten i resultatmappen.
2. Et lite Swift-program på Mac-en leser `samples.csv`, sender hvert bilde med samme instruks til `SystemLanguageModel`
   (og eventuelt `PrivateCloudComputeLanguageModel`), og skriver `apple.csv` med kolonnene `id,predicted_carbs,latency_ms`.
3. `pnpm carb-bench --n 20 --import apple-on-device=apple.csv` legger Apple-svarene inn i samme tabell som de andre modellene.

Bildeinput til Apple-modellen kom med iOS 27 / macOS 27 (juni 2026). Swift-programmet må lages og prøves på en Mac med
Xcode, så det er neste steg. Forvent at den lille modellen på telefonen er klart svakere enn skymodellene på porsjonsstørrelser,
men den er gratis per kall og sender ingen data ut av telefonen.
