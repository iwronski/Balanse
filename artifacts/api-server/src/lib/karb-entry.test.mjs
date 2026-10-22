import assert from "node:assert/strict";
import test from "node:test";
import { keepExplicitlyReported, isIanaTimezone, validateEntryParse } from "./karb-entry.ts";

const insulin = {
  type: "insulin",
  timestamp: "2025-01-03T12:00:00+01:00",
  title: "Insulin",
  note: "",
  value: 4,
  insulinKind: null,
};

test("retains number-first spoken glucose and a separate already-taken insulin dose", () => {
  const text = "8,5 i glukose nå, satt 3 enheter insulin for 10 minutter siden.";
  const referenceTime = "2026-10-20T12:00:00+02:00";
  const result = validateEntryParse({
    entries: [
      { type: "glucose", timestamp: referenceTime, title: "Glukose", note: "", value: 8.5, evidence: "8,5 i glukose nå" },
      { ...insulin, timestamp: "2026-10-20T11:50:00+02:00", value: 3, evidence: "satt 3 enheter insulin for 10 minutter siden" },
    ], questions: [],
  }, { text, referenceTime, timezone: "Europe/Oslo" });
  assert.equal(result.entries.length, 2);
  assert.equal(result.entries[0].value, 8.5);
  assert.equal(result.entries[1].value, 3);
  assert.equal(result.entries[1].insulinKind, "hurtig");
  assert.equal(Date.parse(result.entries[0].timestamp) - Date.parse(result.entries[1].timestamp), 10 * 60_000);
  assert.deepEqual(result.questions, []);
});

test("number-first glucose does not turn a goal, uncertainty or question into a measurement", () => {
  const glucose = { type: "glucose", timestamp: insulin.timestamp, title: "Glukose", note: "", value: 8.5 };
  for (const text of [
    "Jeg vil ha 8,5 i glukose nå",
    "Kanskje 8,5 i glukose nå",
    "8,5 i glukose nå?",
    "Ikke 8,5 i glukose nå",
    "Hvis 8,5 i glukose nå",
  ]) {
    assert.equal(keepExplicitlyReported(glucose, "8,5 i glukose nå", text), false, text);
  }
  assert.equal(keepExplicitlyReported(glucose, "8,5 i glukose nå", "8,5 i glukose nå"), true);
  assert.equal(keepExplicitlyReported(glucose, "åtte komma fem i glukose nå", "åtte komma fem i glukose nå"), true);
  assert.equal(keepExplicitlyReported(glucose, "Glukosen er 8,5 nå", "Glukosen er 8,5 nå"), true);
});

test("accepts a directly reported completed administration, not an intention or question", () => {
  assert.equal(keepExplicitlyReported(insulin, "Jeg tok 4 enheter insulin", "Jeg tok 4 enheter insulin."), true);
  assert.equal(keepExplicitlyReported(insulin, "Tok jeg 4 enheter insulin?", "Tok jeg 4 enheter insulin?"), false);
  assert.equal(keepExplicitlyReported(insulin, "Jeg skal ta 4 enheter insulin", "Jeg skal ta 4 enheter insulin"), false);
  assert.equal(keepExplicitlyReported(insulin, "Jeg tror jeg tok 4 enheter insulin", "Jeg tror jeg tok 4 enheter insulin"), false);
  assert.equal(keepExplicitlyReported(insulin, "Jeg tok 4 enheter insulin", "Jeg vurderer insulin"), false);
});

test("validates and strips internal evidence, and defaults a small dose to rapid insulin", () => {
  const result = validateEntryParse({
    entries: [{ ...insulin, evidence: "Jeg tok 4 enheter insulin" }],
    questions: [],
  }, {
    text: "Jeg tok 4 enheter insulin",
    referenceTime: "2025-01-03T12:00:00+01:00",
    timezone: "Europe/Oslo",
  });
  assert.equal(result.entries[0].insulinKind, "hurtig");
  assert.match(result.entries[0].note, /under 10 E/);
  assert.deepEqual(result.questions, []);
  assert.equal("evidence" in result.entries[0], false);
});

test("rejects non-finite and out-of-bounds ingredient values", () => {
  assert.throws(() => validateEntryParse({
    entries: [{
      type: "meal",
      timestamp: "2025-01-03T12:00:00+01:00",
      title: "Lunsj",
      note: "",
      ingredients: [{ name: "Brød", grams: 5001, carbsPer100g: 40, assumption: "" }],
    }],
    questions: [],
  }, {
    text: "Spiste brød",
    referenceTime: "2025-01-03T12:00:00+01:00",
    timezone: "Europe/Oslo",
  }));
});

test("validates IANA time zones", () => {
  assert.equal(isIanaTimezone("Europe/Oslo"), true);
  assert.equal(isIanaTimezone("Not/A-Timezone"), false);
});

test("normalizes only empty inapplicable fields from JSON output", () => {
  const result = validateEntryParse({
    entries: [
      { type: "meal", timestamp: insulin.timestamp, title: "Brød", note: "", value: null, insulinKind: null, intensity: null,
        ingredients: [{ name: "Brød", grams: 80, carbsPer100g: 40, assumption: "" }] },
      { ...insulin, ingredients: [], intensity: null, evidence: "Insulin 4 E" },
    ], questions: [],
  }, { text: "Brød. Insulin 4 E", referenceTime: insulin.timestamp, timezone: "Europe/Oslo" });
  assert.equal(result.entries.length, 2);
  assert.equal("value" in result.entries[0], false);
  assert.equal("ingredients" in result.entries[1], false);
});

test("retains concise labelled insulin, glucose and exercise journal facts", () => {
  const text = "Insulin 4 E hurtig kl 12, glukose 6,2 kl 12.30, aktivitet 30 min rolig gåtur";
  const result = validateEntryParse({
    entries: [
      { ...insulin, insulinKind: "hurtig", evidence: "Insulin 4 E hurtig kl 12" },
      {
        type: "glucose", timestamp: insulin.timestamp, title: "Blodsukker", note: "",
        value: 6.2, evidence: "glukose 6,2 kl 12.30",
      },
      {
        type: "exercise", timestamp: insulin.timestamp, title: "Gåtur", note: "",
        value: 30, intensity: "lett", evidence: "aktivitet 30 min rolig gåtur",
      },
    ],
    questions: [],
  }, { text, referenceTime: insulin.timestamp, timezone: "Europe/Oslo" });
  assert.equal(result.entries.length, 3);
  assert.deepEqual(result.entries.map(entry => entry.value), [4, 6.2, 30]);
  assert.deepEqual(result.questions, []);
  assert.equal(keepExplicitlyReported(insulin, "Novorapid 4 E", "Novorapid 4 E"), true);
  assert.equal(keepExplicitlyReported(insulin, "Humalog 4 E", "Humalog 4 E"), true);
});

test("keeps labelled drafts when quantities are missing and normalizes them to null", () => {
  const result = validateEntryParse({
    entries: [{
      type: "exercise", timestamp: insulin.timestamp, title: "Gåtur", note: "",
      evidence: "Aktivitet rolig gåtur",
    }],
    questions: [],
  }, {
    text: "Aktivitet rolig gåtur", referenceTime: insulin.timestamp, timezone: "Europe/Oslo",
  });
  assert.equal(result.entries.length, 1);
  assert.equal(result.entries[0].value, null);
  assert.equal(result.entries[0].intensity, null);
  assert.ok(result.questions.some(question => question.includes("minutter")));
});

test("does not bypass plans, questions or negation by citing only a labelled substring", () => {
  assert.equal(keepExplicitlyReported(insulin, "insulin 4 E", "Skal ta insulin 4 E"), false);
  assert.equal(keepExplicitlyReported(insulin, "insulin 4 E", "Kan jeg ta insulin 4 E?"), false);
  assert.equal(keepExplicitlyReported(insulin, "Insulin 4 E", "Insulin 4 E ikke tatt"), false);
});

test("retains all five events, including two glucose fragments, from the tennis example", () => {
  const text = "Jeg spilte tennis mellom 9 og 10. Blodsukkeret mitt var 11 før trening og 5 etter trening. Jeg satt 3 E insulin 10:30 og spiste tre brødskiver klokka 11.";
  const timestamp = hour => `2026-10-19T${hour}:00+02:00`;
  const result = validateEntryParse({
    entries: [
      { type: "exercise", timestamp: timestamp("09:00"), title: "Tennis", note: "", value: 60, evidence: "Jeg spilte tennis mellom 9 og 10." },
      { type: "glucose", timestamp: timestamp("09:00"), title: "Glukose før", note: "", value: 11, evidence: "11 før trening" },
      { type: "glucose", timestamp: timestamp("10:00"), title: "Glukose etter", note: "", value: 5, evidence: "5 etter trening" },
      { ...insulin, timestamp: timestamp("10:30"), value: 3, evidence: "3 E insulin 10:30" },
      { type: "meal", timestamp: timestamp("11:00"), title: "Brød", note: "", ingredients: [{ name: "Brød", grams: 120, carbsPer100g: 40, assumption: "Tre standardskiver" }] },
    ], questions: [],
  }, { text, referenceTime: timestamp("14:00"), timezone: "Europe/Oslo" });
  assert.equal(result.entries.length, 5);
  assert.deepEqual(result.entries.filter(e => e.type === "glucose").map(e => e.value), [11, 5]);
  assert.equal(result.entries.find(e => e.type === "insulin").insulinKind, "hurtig");
  assert.ok(!result.questions.some(q => q.includes("faktisk")));
});

test("insulin default is strictly below ten, and explicit kinds always win", () => {
  for (const [value, given, expected] of [
    [3, null, "hurtig"], [9.9, null, "hurtig"], [10, null, null], [12, null, null],
    [0, null, null], [null, null, null], [3, "langtid", "langtid"], [3, "annet", "annet"],
  ]) {
    const text = `Jeg tok insulin${given === 'langtid' ? ' langtid' : given === 'annet' ? ' annet' : ''}`;
    const result = validateEntryParse({ entries: [{ ...insulin, value, insulinKind: given, evidence: text }], questions: [] },
      { text, referenceTime: insulin.timestamp, timezone: "Europe/Oslo" });
    assert.equal(result.entries[0].insulinKind, expected, `${value} E with ${given}`);
    assert.equal(result.questions.includes("Hvilken type insulin var det?"), expected === null);
  }
});

test("AI guesses cannot bypass the dose threshold or borrow a type from another event", () => {
  const text = "Jeg tok 3 E langtid. Jeg tok 10 E insulin. Jeg tok 9,9 E insulin.";
  const result = validateEntryParse({ entries: [
    { ...insulin, value: 3, insulinKind: "langtid", evidence: "Jeg tok 3 E langtid", insulinKindEvidence: "langtid" },
    { ...insulin, value: 10, insulinKind: "hurtig", evidence: "Jeg tok 10 E insulin" },
    { ...insulin, value: 9.9, insulinKind: "langtid", evidence: "Jeg tok 9,9 E insulin", insulinKindEvidence: "langtid" },
  ], questions: [] }, { text, referenceTime: insulin.timestamp, timezone: "Europe/Oslo" });
  assert.deepEqual(result.entries.map(e => e.insulinKind), ["langtid", null, "hurtig"]);
  assert.match(result.entries[2].note, /automatisk/);
  assert.equal("insulinKindEvidence" in result.entries[0], false);
});

test("contextual fragments cannot turn future, uncertain or negated events into records", () => {
  assert.equal(keepExplicitlyReported({ ...insulin, type: "exercise" }, "tennis", "Jeg skal spille tennis mellom 9 og 10."), false);
  assert.equal(keepExplicitlyReported({ ...insulin, type: "exercise" }, "tennis", "Jeg spilte ikke tennis mellom 9 og 10."), false);
  assert.equal(keepExplicitlyReported({ ...insulin, type: "glucose" }, "5 etter trening", "Jeg tror blodsukkeret mitt var 5 etter trening."), false);
  assert.equal(keepExplicitlyReported(insulin, "3 E insulin", "Har jeg tatt 3 E insulin?"), false);
  assert.equal(keepExplicitlyReported(insulin, "3 E insulin", "Jeg satt ikke 3 E insulin."), false);
  assert.equal(keepExplicitlyReported(insulin, "3 E insulin", "Jeg skal ta 3 E insulin. Jeg spilte tennis."), false);
});
