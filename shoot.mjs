import { chromium } from "playwright";

const out = process.argv[2] ?? "shots";
const base = "http://localhost:3100";
const shots = [
  { url: "/dashboard", name: "01-dashboard" },
  { url: "/vacancies/vac-001/ranking", name: "02-ranking" },
  { url: "/vacancies/vac-001/candidates/CND-4A19", name: "03-scorecard-competencies" },
  { url: "/", name: "05-code-entry" },
  { url: "/status", name: "06-status" },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: 1 });

for (const s of shots) {
  await page.goto(base + s.url, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${out}/${s.name}.png`, fullPage: false });
  console.log("shot", s.name);
}

// scorecard: overview tab
await page.goto(base + "/vacancies/vac-001/candidates/CND-4A19", { waitUntil: "networkidle" });
await page.getByRole("button", { name: "Overview" }).click();
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/04-scorecard-overview.png` });
console.log("shot 04-scorecard-overview");

// command palette open
await page.keyboard.press("Control+KeyK");
await page.waitForTimeout(400);
await page.screenshot({ path: `${out}/07-command-k.png` });
console.log("shot 07-command-k");

await browser.close();
