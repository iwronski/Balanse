import { z } from "zod";

const timestamp = z.string().datetime({ offset: true });
const ingredientSchema = z.object({
  name: z.string().min(1).max(160),
  grams: z.number().finite().min(0).max(5000).nullable(),
  carbsPer100g: z.number().finite().min(0).max(100).nullable(),
  assumption: z.string().max(1000),
}).strict();
const entrySchema = z.object({
  type: z.enum(["meal", "insulin", "glucose", "exercise"]),
  timestamp,
  title: z.string().min(1).max(160),
  note: z.string().max(2000),
  value: z.number().finite().min(0).max(10000).nullable().optional(),
  insulinKind: z.enum(["hurtig", "langtid", "annet"]).nullable().optional(),
  intensity: z.enum(["lett", "moderat", "hard"]).nullable().optional(),
  ingredients: z.array(ingredientSchema).max(30).optional(),
}).strict();
const responseSchema = z.object({
  entries: z.array(entrySchema).max(30),
  questions: z.array(z.string().min(1).max(500)).max(30),
}).strict();

export type EntryParseInput = {
  text: string;
  referenceTime: string;
  timezone: string;
};
export type EntryParseResult = z.infer<typeof responseSchema>;

export function isIanaTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

const explicitReport: Record<Exclude<z.infer<typeof entrySchema>["type"], "meal">, RegExp> = {
  insulin: /\b(?:jeg\s+)?(?:har\s+)?(?:tok|tatt|satte|satt|injiserte|injisert|administrerte|administrert)\b/i,
  glucose: /\b(?:målte|målt|avleste|(?:blodsukker(?:et)?|glukose(?:n)?)\s+(?:mitt\s+)?(?:var|viste|er))\b/i,
  exercise: /\b(?:gikk|løp|jogget|trente|spilte|syklet|svømte|danset|gikk på ski|tok en tur|spaserte|gjennomførte)\b/i,
};
const labelledRecord: typeof explicitReport = {
  insulin: /^(?:insulin|novorapid|humalog|fiasp|apidra|novomix|lantus|levemir|tresiba|toujeo|basaglar|insulatard|dose(?=\s*:?\s*\d+(?:[.,]\d+)?\s*(?:e\b|enhet)))\b/i,
  glucose: /^(?:(?:glukose|blodsukker(?:et)?|bs)\b|(?:\d+(?:[.,]\d+)?|(?:null|en|ett|to|tre|fire|fem|seks|sju|syv|åtte|ni|ti|elleve|tolv)(?:\s+komma\s+(?:null|en|ett|to|tre|fire|fem|seks|sju|syv|åtte|ni))?)\s+(?:mmol(?:\s*\/\s*l)?\s+)?(?:i\s+)?(?:glukose|blodsukker)\b)/i,
  exercise: /^(?:aktivitet|trening|gåtur|joggetur|løpetur|sykkeltur|svømmetur|rolig\s+gåtur)\b/i,
};
const intentOrQuestion = /\b(skal|kommer til å|tenker å|planlegger|vil ta|vil ha|trenger|ønsker|bør|kan jeg|hva om|hvis|dersom|ville|kunne|burde|kanskje|tror|usikker|spør|spurte|lurer på|vurderer|glemte å|ikke|aldri|tok jeg|satte jeg|målte jeg|har jeg tatt)\b/i;
const insulinKindWords = {
  hurtig: /\b(?:hurtig\w*|korttid\w*|måltidsinsulin|bolus|novorapid|humalog|fiasp|apidra|actrapid|lyumjev|insuman rapid)\b/i,
  langtid: /\b(?:langtid\w*|langsom\w*|basal\w*|tresiba|lantus|levemir|toujeo|basaglar|insulatard|protaphane|nph)\b/i,
  annet: /\b(?:annet|annen|blanding\w*|mix\w*|novomix|humalogmix)\b/i,
};

function evidenceClauses(sourceText: string, evidence: unknown): string[] {
  if (typeof evidence !== 'string' || !evidence.trim()) return [];
  const source = sourceText.toLocaleLowerCase('nb-NO');
  const quote = evidence.toLocaleLowerCase('nb-NO');
  if (!source.includes(quote)) return [];
  const phrase = quote.replace(/[.;!]+$/, '').trim();
  return source.split(/(?<=[;!?\n])|,(?!\d)|\.(?!\d)/).filter(clause => clause.includes(phrase));
}

/**
 * Only retain medical/exercise events when the model can cite a literal source
 * phrase describing a completed event or a terse labelled journal fact.
 * Citations and their surrounding clause are screened for plans/questions.
 * Citations are internal and never returned to the caller.
 */
export function keepExplicitlyReported(
  entry: z.infer<typeof entrySchema>,
  evidence: unknown,
  sourceText: string,
): boolean {
  if (entry.type === "meal") return true;
  if (typeof evidence !== "string" || evidence.length === 0 || evidence.length > 500) return false;
  const quote = evidence.toLocaleLowerCase("nb-NO");
  const source = sourceText.toLocaleLowerCase("nb-NO");
  if (!source.includes(quote) || evidence.includes("?") || intentOrQuestion.test(evidence)) return false;
  // Keep decimal commas and clock separators intact. Inspect the full clause,
  // not merely the model's substring, so "skal ta [insulin 4 E]" cannot pass.
  const contexts = evidenceClauses(sourceText, evidence);
  const reportPattern = explicitReport[entry.type], labelPattern = labelledRecord[entry.type];
  // A citation may be a fragment, e.g. "5 etter trening" in a sentence that
  // explicitly reports both glucose readings. Validate its own surrounding
  // clause, not only the fragment and not an unrelated sentence.
  return (contexts.length ? contexts : [source]).some(clause =>
    !clause.includes("?") && !intentOrQuestion.test(clause) &&
    (reportPattern.test(clause) || labelPattern.test(clause.trim())),
  );
}

export function validateEntryParse(
  raw: unknown,
  input: EntryParseInput,
): EntryParseResult {
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as { entries?: unknown }).entries)) {
    throw new Error("Invalid entry response");
  }
  const internal = raw as { entries: Array<Record<string, unknown>>; questions?: unknown };
  const cleanRaw = {
    ...raw,
    entries: internal.entries.map(({ evidence: _evidence, insulinKindEvidence: _kindEvidence, ...entry }) => {
      // JSON-mode models sometimes include null for inapplicable optional fields.
      // Ignore only empty inapplicable fields; unexpected populated fields still fail.
      if (entry.type === 'meal') {
        for (const key of ['value', 'insulinKind', 'intensity']) if (entry[key] === null) delete entry[key];
      } else {
        if (entry.ingredients === null || (Array.isArray(entry.ingredients) && entry.ingredients.length === 0)) delete entry.ingredients;
        if (entry.type !== 'insulin' && entry.insulinKind === null) delete entry.insulinKind;
        if (entry.type !== 'exercise' && entry.intensity === null) delete entry.intensity;
      }
      return entry;
    }),
  };
  const data = responseSchema.parse(cleanRaw);
  const retained: EntryParseResult["entries"] = [];
  const questions = [...data.questions];

  data.entries.forEach((entry, index) => {
    if (!keepExplicitlyReported(entry, internal.entries[index]?.evidence, input.text)) {
      questions.push(
        entry.type === "insulin"
          ? "Var dette en insulindose du faktisk tok? Oppgi type og mengde hvis du vil loggføre den."
          : entry.type === "glucose"
            ? "Ble denne blodsukkerverdien faktisk målt? Oppgi verdien hvis du vil loggføre den."
            : "Ble denne aktiviteten faktisk gjennomført? Oppgi varighet hvis du vil loggføre den.",
      );
      return;
    }

    if (entry.type === "meal") {
      if (entry.value !== undefined || entry.insulinKind !== undefined || entry.intensity !== undefined) {
        throw new Error("Invalid meal fields");
      }
      for (const ingredient of entry.ingredients ?? []) {
        if (ingredient.grams === null || ingredient.carbsPer100g === null) {
          questions.push(`Oppgi mengde eller karbohydratinnhold for ${ingredient.name} hvis du kjenner det.`);
        }
      }
    } else {
      if (entry.ingredients !== undefined) throw new Error("Invalid non-meal ingredients");
      if (entry.value === undefined) entry.value = null;
      if (entry.type === "insulin") {
        if (entry.intensity !== undefined) throw new Error("Invalid insulin intensity");
        if (entry.insulinKind === undefined) entry.insulinKind = null;
        // Do not trust an AI-supplied type unless its words/brand are grounded
        // in this event's source clause. The AI can otherwise guess even at 10 E.
        if (entry.insulinKind !== null) {
          const internalEntry = internal.entries[index];
          const kindEvidence = internalEntry?.insulinKindEvidence ?? internalEntry?.evidence;
          const kindWords = insulinKindWords[entry.insulinKind];
          const supported = typeof kindEvidence === 'string' && kindWords.test(kindEvidence) &&
            evidenceClauses(input.text, internalEntry?.evidence)
              .some(clause => clause.includes(kindEvidence.toLocaleLowerCase('nb-NO')));
          if (!supported) entry.insulinKind = null;
        }
        // User-selected logging default, not a dose calculation. Never replace
        // an explicitly supplied kind or apply this to old stored records.
        if (entry.insulinKind === null && entry.value !== null && entry.value > 0 && entry.value < 10) {
          entry.insulinKind = "hurtig";
          entry.note = [entry.note.slice(0, 1850), "Hurtigvirkende valgt automatisk fordi dosen er under 10 E."].filter(Boolean).join("\n");
        }
        if (entry.value === undefined || entry.value === null) questions.push("Hvor mange insulinenheter tok du?");
        if (entry.insulinKind === null) questions.push("Hvilken type insulin var det?");
      } else if (entry.type === "glucose") {
        if (entry.insulinKind !== undefined || entry.intensity !== undefined) throw new Error("Invalid glucose fields");
        if (entry.value === undefined || entry.value === null) questions.push("Hva var den målte blodsukkerverdien i mmol/L?");
      } else {
        if (entry.insulinKind !== undefined) throw new Error("Invalid exercise insulin kind");
        if (entry.intensity === undefined) entry.intensity = null;
        if (entry.value === undefined || entry.value === null) questions.push("Hvor lenge varte aktiviteten i minutter?");
        if (entry.intensity === null) questions.push("Hvordan vil du beskrive intensiteten: lett, moderat eller hard?");
      }
    }
    retained.push(entry);
  });
  if (retained.length > 30 || questions.length > 30) {
    throw new Error("Entry response exceeds limits");
  }
  return { entries: retained, questions: [...new Set(questions)] };
}

export const parseEntryOutputSchema = responseSchema;
