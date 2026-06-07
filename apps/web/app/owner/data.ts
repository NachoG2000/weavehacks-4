// Hardcoded mockup data for the owner view. Grounded in @weavehacks/truth + seed so it reads
// real, but fixed here so the demo never depends on a live run. Swap for live agent output later.

export const RESTAURANT = { name: "Le Kyoto", area: "Paris, 14e", cuisine: "Ramen · takeout & delivery" };

export const TARGET = { weekday: "Friday", dateLabel: "12 June", service: "dinner service, 18:00–22:30" };

export const brief = {
  headline: "Friday is not a normal Friday. Cook for about 28% more, weighted to broth.",
  body: [
    "Four things land at once tonight: steady rain, the PSG home derby at the Parc, the first night of school holidays, and an RER B strike. They all push the same way, more delivery, and they push people toward hot broth, away from the cold dishes.",
    "I had the brigade size each factor on its own against three years of your POS, so this is grounded, not a hunch. The call: prep roughly 28% over an average Friday, lean hard into tonkotsu, and pull the cold soba back before it sits.",
  ],
  grounding: "Grounded in 3 years of POS. Every figure traces to a tool call logged in Weave.",
};

export type Dir = "up" | "down";

export const signals: { label: string; source: string; effect: string; dir: Dir }[] = [
  { label: "Rain, ~8mm across service", source: "Météo-France", effect: "Broth up, cold soba down", dir: "up" },
  { label: "PSG home derby at the Parc", source: "Ligue 1 fixtures", effect: "Local delivery spikes 19:00–21:00", dir: "up" },
  { label: "School holidays begin", source: "Académie de Paris", effect: "More family orders, earlier", dir: "up" },
  { label: "RER B strike", source: "RATP alerts", effect: "People stay local and order in", dir: "up" },
];

export const reconciliation = {
  historian: {
    role: "Historian",
    claim: "An average Friday is 138 orders. On the numbers alone, treat tonight as normal.",
    basis: "mean of 156 past Fridays",
  },
  scout: {
    role: "Scout",
    claim: "Tonight is not average. Four real-world drivers stack, and every one points up.",
    basis: "today's live conditions",
  },
  prep: {
    role: "Prep",
    claim: "Reconciled: 177 orders, about 28% over baseline, broth-weighted. Not a flat average, not raw panic.",
    basis: "base rate plus a measured delta per factor",
  },
};

export const proof = {
  soloErr: 24,
  teamErr: 8,
  line:
    "A single agent forecasting from the average Friday under-prepped atypical nights by 24% in backtest. The brigade, sizing each factor over many nights, cut that to 8%.",
  onTheNight: "On a night like this, the average-Friday guess runs out of tonkotsu broth around 20:30.",
};

export type PrepRow = { item: string; normal: number; rec: number; driver: string };

export const prep: PrepRow[] = [
  { item: "Tonkotsu Ramen", normal: 55, rec: 77, driver: "rain + derby + holidays" },
  { item: "Gyoza (6)", normal: 60, rec: 78, driver: "delivery sides up" },
  { item: "Shoyu Ramen", normal: 35, rec: 44, driver: "general lift" },
  { item: "Edamame", normal: 40, rec: 50, driver: "general lift" },
  { item: "Cold Soba", normal: 22, rec: 14, driver: "rain suppresses cold dishes" },
];

export const draftPost = {
  channels: "Instagram + Google",
  text: "Rainy Friday, derby night. The 18-hour tonkotsu is on and the kitchen is ready. Order ahead, we deliver across the 14e.",
  why: "Tonkotsu is your most-mentioned dish in 5-star reviews. This is a public post, so it waits for your OK.",
};

export type ChatMsg = { from: "chef" | "owner"; text: string };

export const chatSeed: ChatMsg[] = [
  {
    from: "chef",
    text: "Chef here. Tonight's plan is set and grounded. Ask me anything, why the broth, how sure I am, or have me redraft the post.",
  },
];

export const suggestions = [
  "Why so much broth?",
  "What if the strike is called off?",
  "How sure are you?",
  "Make the post quieter",
];

// Scripted, grounded replies for the mockup. Keyed by suggestion; keyword fallback below.
export const scripted: Record<string, string> = {
  "Why so much broth?":
    "Three of tonight's four drivers push toward hot broth: rain, a cool evening, and people staying in for the derby. Cold soba moves the other way. In your POS, rainy Fridays sell 41% more tonkotsu than dry ones (n = 23 nights), so I put the lift on broth, not flat across the menu.",
  "What if the strike is called off?":
    "Then I would drop the prep to about +18%. The strike and the holidays are the two biggest 'stay local' drivers. Lose the strike and delivery cools a little, but the rain and the derby still hold. I would keep the broth weighting either way.",
  "How sure are you?":
    "On recent nights I can score myself against, the brigade landed within 8% of what actually sold; a flat-average guess was off by 24%. Every number here traces to a POS query you can open in Weave. Trust the direction strongly, the exact count to within a dozen orders.",
  "Make the post quieter":
    "Quieter version: \"The 18-hour tonkotsu is on tonight. Order ahead, we deliver across the 14e.\" Same dish, less noise, no derby angle. Still waiting on your OK before it goes out.",
};

export const fallbackReply =
  "Good question. I will ground that in your POS and reviews before I commit to a number. The short version for tonight: cook about 28% over a normal Friday, broth-heavy, and hold the soba.";

export function replyFor(text: string): string {
  if (scripted[text]) return scripted[text];
  const t = text.toLowerCase();
  if (t.includes("strike")) return scripted["What if the strike is called off?"];
  if (t.includes("broth") || t.includes("tonkotsu") || t.includes("ramen")) return scripted["Why so much broth?"];
  if (t.includes("sure") || t.includes("confiden") || t.includes("trust") || t.includes("accura")) return scripted["How sure are you?"];
  if (t.includes("post") || t.includes("quiet") || t.includes("instagram")) return scripted["Make the post quieter"];
  if (t.includes("soba")) return "Cold soba drops on wet nights. Your POS shows about 35% fewer soba on rainy Fridays, so I cut it from 22 to 14 to avoid waste.";
  return fallbackReply;
}
