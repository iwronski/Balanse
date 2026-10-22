import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { loadFolder, loadNutrition5k, type Sample } from "./dataset";
import { callModel, costUsd, estimateUsdPerPhoto, hasKey, parseModelSpec, type ModelSpec } from "./models";
import { predictedCarbs } from "./prompt";

const here = path.dirname(fileURLToPath(import.meta.url));
const benchDir = path.resolve(here, "../../carb-bench");

const { values } = parseArgs({
  args: process.argv.slice(2).filter(a => a !== "--"),
  options: {
    dataset: { type: "string", default: "nutrition5k" },
    n: { type: "string", default: "20" },
    seed: { type: "string", default: "1" },
    "min-carbs": { type: "string", default: "10" },
    models: { type: "string", default: "gpt-5.4-mini,claude-haiku-5-5" },
    "with-weight": { type: "boolean", default: false },
    "with-notes": { type: "boolean", default: false },
    import: { type: "string", multiple: true, default: [] },
    concurrency: { type: "string", default: "3" },
    "usd-nok": { type: "string", default: "10.5" },
    yes: { type: "boolean", default: false },
  },
});

type Prediction = { id: string; label: string; truth: number; predicted?: number; latencyMs?: number; costUsd?: number; error?: string };

const n = Number(values.n);
const usdNok = Number(values["usd-nok"]);
const callOpts = { withWeight: values["with-weight"]!, withNotes: values["with-notes"]! };

const samples: Sample[] = values.dataset === "nutrition5k"
  ? await loadNutrition5k({ n, seed: Number(values.seed), minCarbs: Number(values["min-carbs"]), cacheDir: path.join(benchDir, "data") })
  : loadFolder(path.resolve(values.dataset!), n);
const specs = values.models!.split(",").map(s => s.trim()).filter(Boolean).map(parseModelSpec);

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const outDir = path.join(benchDir, "results", stamp);
mkdirSync(outDir, { recursive: true });
// The sample list lets other runners (for example an on-device test on the Mac) answer exactly the same photos.
writeFileSync(path.join(outDir, "samples.csv"),
  "id,image,carbs_g,weight_g\n" + samples.map(s => `${s.id},${s.imagePath},${s.carbs},${s.weightGrams ?? ""}`).join("\n") + "\n");

console.log(`\n${samples.length} bilder fra ${values.dataset}. Fasit snitt ${mean(samples.map(s => s.carbs)).toFixed(1)} g karbohydrat.`);
console.log(`Vekt oppgitt til modellen: ${callOpts.withWeight ? "ja" : "nei"}. Ingrediensliste oppgitt: ${callOpts.withNotes ? "ja" : "nei"}.\n`);
console.log("Kostnadsanslag (øvre grense):");
let estimateTotal = 0;
for (const spec of specs) {
  const perPhoto = estimateUsdPerPhoto(spec.model);
  if (perPhoto !== undefined) estimateTotal += perPhoto * samples.length;
  const key = hasKey(spec) ? "" : "  (mangler API-nøkkel, hoppes over)";
  console.log(`  ${spec.label.padEnd(26)} ${perPhoto === undefined ? "ukjent pris" : `ca ${(perPhoto * samples.length * usdNok).toFixed(2)} kr`}${key}`);
}
console.log(`  Totalt ca ${(estimateTotal * usdNok).toFixed(2)} kr ($${estimateTotal.toFixed(3)})\n`);

const predictions: Prediction[] = [];
const runnable = specs.filter(hasKey);
if (!values.yes && runnable.length) {
  console.log("Prøvekjøring: ingen modeller ble kalt. Legg til --yes for å kjøre (og betale) for alvor.\n");
} else {
  for (const spec of runnable) predictions.push(...await runModel(spec));
}
for (const entry of values.import!) predictions.push(...importPredictions(entry));

if (predictions.length) {
  const report = buildReport(predictions);
  writeFileSync(path.join(outDir, "report.md"), report);
  writeFileSync(path.join(outDir, "predictions.json"), JSON.stringify(predictions, null, 2));
  console.log(report);
  console.log(`Resultater lagret i ${path.relative(process.cwd(), outDir)}`);
}

async function runModel(spec: ModelSpec): Promise<Prediction[]> {
  const log = path.join(outDir, "answers.jsonl");
  const out: Prediction[] = [];
  let next = 0, done = 0;
  async function worker() {
    while (next < samples.length) {
      const sample = samples[next++];
      const start = Date.now();
      const p: Prediction = { id: sample.id, label: spec.label, truth: sample.carbs };
      try {
        const answer = await callModel(spec, sample, callOpts);
        p.latencyMs = Date.now() - start;
        p.costUsd = costUsd(spec.model, answer.inputTokens, answer.outputTokens);
        p.predicted = predictedCarbs(answer.raw);
        if (p.predicted === undefined) p.error = "Ugyldig svar";
        appendFileSync(log, JSON.stringify({ id: sample.id, label: spec.label, answer }) + "\n");
      } catch (err) {
        p.error = err instanceof Error ? err.message : String(err);
      }
      out.push(p);
      process.stdout.write(`\r  ${spec.label}: ${++done}/${samples.length}`);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Number(values.concurrency)) }, worker));
  process.stdout.write("\n");
  return out;
}

// --import "apple-on-device=svar.csv" with columns id,predicted_carbs[,latency_ms][,cost_usd]
function importPredictions(entry: string): Prediction[] {
  const [label, file] = entry.includes("=") ? entry.split("=", 2) : [path.basename(entry, ".csv"), entry];
  if (!existsSync(file)) throw new Error(`Fant ikke ${file}`);
  const byId = new Map(samples.map(s => [s.id, s]));
  return readFileSync(file, "utf8").split(/\r?\n/).slice(1).filter(l => l.trim()).flatMap(line => {
    const [id, predicted, latency, cost] = line.split(",").map(s => s.trim());
    const sample = byId.get(id);
    if (!sample) return [];
    const value = Number(predicted);
    return [{
      id, label, truth: sample.carbs,
      predicted: predicted !== "" && Number.isFinite(value) ? value : undefined,
      error: predicted !== "" && Number.isFinite(value) ? undefined : "Mangler svar",
      latencyMs: latency ? Number(latency) : undefined, costUsd: cost ? Number(cost) : 0,
    }];
  });
}

function mean(xs: number[]): number { return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN; }
function median(xs: number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function fmt(x: number, digits = 1): string { return Number.isFinite(x) ? x.toFixed(digits) : "–"; }

function buildReport(all: Prediction[]): string {
  const labels = [...new Set(all.map(p => p.label))];
  const rows = labels.map(label => {
    const ps = all.filter(p => p.label === label);
    const ok = ps.filter(p => p.predicted !== undefined);
    const err = ok.map(p => p.predicted! - p.truth);
    const abs = err.map(Math.abs);
    const pct = ok.filter(p => p.truth >= 10).map(p => Math.abs(p.predicted! - p.truth) / p.truth * 100);
    const costs = ps.map(p => p.costUsd).filter((c): c is number => c !== undefined);
    const lat = ps.map(p => p.latencyMs).filter((l): l is number => l !== undefined);
    return {
      label, total: ps.length, ok: ok.length,
      mae: mean(abs), medae: median(abs), mape: mean(pct), bias: mean(err),
      within10g: ok.length ? abs.filter(a => a <= 10).length / ok.length * 100 : NaN,
      within20pct: ok.length ? ok.filter(p => Math.abs(p.predicted! - p.truth) <= 0.2 * p.truth).length / ok.length * 100 : NaN,
      latency: mean(lat) / 1000, costPerPhoto: costs.length ? mean(costs) : NaN,
    };
  }).sort((a, b) => a.mae - b.mae);

  const lines = [
    `# Karbohydrat-benchmark ${new Date().toISOString().slice(0, 16).replace("T", " ")}`,
    "",
    `Datasett: ${values.dataset}, ${samples.length} bilder (seed ${values.seed}, minst ${values["min-carbs"]} g karbo). ` +
      `Vekt oppgitt: ${callOpts.withWeight ? "ja" : "nei"}. Ingredienser oppgitt: ${callOpts.withNotes ? "ja" : "nei"}.`,
    "",
    "| Modell | Svar | Snittfeil (g) | Medianfeil (g) | Snittfeil (%) | Skjevhet (g) | Innen ±10 g | Innen ±20 % | Tid (s) | Kr per bilde | Kr per 1000 bilder |",
    "|---|---|---|---|---|---|---|---|---|---|---|",
    ...rows.map(r => `| ${r.label} | ${r.ok}/${r.total} | ${fmt(r.mae)} | ${fmt(r.medae)} | ${fmt(r.mape, 0)} % | ${r.bias > 0 ? "+" : ""}${fmt(r.bias)} | ${fmt(r.within10g, 0)} % | ${fmt(r.within20pct, 0)} % | ${fmt(r.latency)} | ${fmt(r.costPerPhoto * usdNok, 3)} | ${fmt(r.costPerPhoto * usdNok * 1000, 0)} |`),
    "",
    "Snittfeil = gjennomsnittlig avvik fra fasit i gram (MAE). Snittfeil % regnes bare for retter med minst 10 g fasit (MAPE). " +
      "Skjevhet over null betyr at modellen i snitt overestimerer. Kostnad er beregnet fra faktisk tokenbruk og listepris " +
      `(kurs ${usdNok} kr per USD).`,
    "",
    "## Per bilde",
    "",
    `| Bilde | Fasit (g) | ${labels.join(" | ")} |`,
    `|---|---|${labels.map(() => "---").join("|")}|`,
    ...samples.map(s => {
      const cells = labels.map(label => {
        const p = all.find(x => x.id === s.id && x.label === label);
        return p?.predicted !== undefined ? fmt(p.predicted) : p?.error ? "feil" : "–";
      });
      return `| ${s.id} | ${fmt(s.carbs)} | ${cells.join(" | ")} |`;
    }),
    "",
  ];
  const failures = all.filter(p => p.error && p.error !== "Mangler svar");
  if (failures.length) {
    lines.push("## Feil", "", ...failures.map(p => `- ${p.label} / ${p.id}: ${p.error}`), "");
  }
  return lines.join("\n");
}
