import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

// One test case: a meal photo with a known (weighed) carbohydrate amount.
export type Sample = {
  id: string;
  imagePath: string;
  mediaType: "image/png" | "image/jpeg" | "image/webp";
  carbs: number;
  weightGrams?: number;
  note?: string;
  // "total" = US/USDA carbohydrate by difference (includes fiber), "available" = Norwegian/EU label (fiber excluded).
  carbDefinition: "total" | "available";
};

const N5K = "https://storage.googleapis.com/nutrition5k_dataset/nutrition5k_dataset";
// Overhead photos exist only for Cafe 1 dishes from this id onward (see dish_ids/README in the dataset).
const FIRST_OVERHEAD_DISH = 1556572657;

async function download(url: string, file: string): Promise<boolean> {
  if (existsSync(file)) return true;
  const res = await fetch(url);
  if (res.status === 404) return false;
  if (!res.ok) throw new Error(`Nedlasting feilet (${res.status}): ${url}`);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  return true;
}

// Small deterministic PRNG so the same --seed always picks the same dishes.
function shuffle<T>(items: T[], seed: number): T[] {
  const out = [...items];
  let s = seed >>> 0 || 1;
  for (let i = out.length - 1; i > 0; i--) {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Nutrition5k (Google Research, CC BY 4.0): cafeteria dishes weighed ingredient by ingredient.
// Uses the official RGB test split and the overhead camera photo of each dish.
export async function loadNutrition5k(opts: { n: number; seed: number; minCarbs: number; cacheDir: string }): Promise<Sample[]> {
  const dir = path.join(opts.cacheDir, "nutrition5k");
  const metaFile = path.join(dir, "dish_metadata_cafe1.csv");
  const splitFile = path.join(dir, "rgb_test_ids.txt");
  await download(`${N5K}/metadata/dish_metadata_cafe1.csv`, metaFile);
  await download(`${N5K}/dish_ids/splits/rgb_test_ids.txt`, splitFile);

  // Columns: dish_id, total_calories, total_mass, total_fat, total_carb, total_protein, then 7 columns per ingredient.
  const dishes = new Map<string, { mass: number; carbs: number; ingredients: string[] }>();
  for (const line of readFileSync(metaFile, "utf8").split("\n")) {
    const cols = line.trim().split(",");
    if (cols.length < 6 || !cols[0].startsWith("dish_")) continue;
    const ingredients: string[] = [];
    for (let i = 7; i < cols.length; i += 7) ingredients.push(cols[i]);
    dishes.set(cols[0], { mass: Number(cols[2]), carbs: Number(cols[4]), ingredients });
  }
  const candidates = readFileSync(splitFile, "utf8").split("\n").map(s => s.trim())
    .filter(id => Number(id.split("_")[1]) >= FIRST_OVERHEAD_DISH)
    .filter(id => (dishes.get(id)?.carbs ?? -1) >= opts.minCarbs);

  const samples: Sample[] = [];
  for (const id of shuffle(candidates.sort(), opts.seed)) {
    if (samples.length >= opts.n) break;
    const imagePath = path.join(dir, "images", `${id}.png`);
    if (!(await download(`${N5K}/imagery/realsense_overhead/${id}/rgb.png`, imagePath))) continue;
    const dish = dishes.get(id)!;
    samples.push({
      id, imagePath, mediaType: "image/png", carbs: dish.carbs, weightGrams: dish.mass,
      note: dish.ingredients.join(", "), carbDefinition: "total",
    });
  }
  if (samples.length < opts.n) console.warn(`Fant bare ${samples.length} retter med bilde (ba om ${opts.n}).`);
  return samples;
}

// Own photos: a folder with fasit.csv (header: fil,karbo_g[,vekt_g][,notat]) and the image files next to it.
// Carbs are expected as on Norwegian labels (available carbohydrate, fiber excluded).
export function loadFolder(dir: string, n: number): Sample[] {
  const csv = path.join(dir, "fasit.csv");
  if (!existsSync(csv)) throw new Error(`Fant ikke ${csv}. Se scripts/carb-bench/README.md.`);
  const lines = readFileSync(csv, "utf8").split(/\r?\n/).filter(l => l.trim());
  // Norwegian Excel saves with ";" and decimal comma, so pick the separator from the header.
  const sep = lines[0].includes(";") ? ";" : ",";
  const samples: Sample[] = [];
  for (const line of lines.slice(1)) {
    const [file, carbs, weight, ...note] = line.split(sep).map(s => s.trim());
    const ext = path.extname(file).toLowerCase();
    const mediaType = ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg";
    samples.push({
      id: path.basename(file, ext), imagePath: path.join(dir, file), mediaType,
      carbs: Number(carbs.replace(",", ".")), weightGrams: weight ? Number(weight.replace(",", ".")) : undefined,
      note: note.join(", ") || undefined, carbDefinition: "available",
    });
  }
  return samples.slice(0, n);
}
