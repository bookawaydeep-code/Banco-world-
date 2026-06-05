import puppeteer from "puppeteer";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const url = "file://" + path.join(__dirname, "soundified-preview.html") + "?noloop=1";

// badge mounts at 3400ms (end of loading). Reload per shot for exact timing.
const shots = [
  [1500, "01-loading"],
  [4150, "02-checkmark"],
  [4420, "03-rip-flash"],
  [4750, "04-music-note"],
  [5250, "05-wave-shove"],
];

const browser = await puppeteer.launch({
  headless: "new",
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--force-color-profile=srgb"],
});

for (const [at, name] of shots) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1000, height: 700, deviceScaleFactor: 2 });
  const loadedAt = Date.now();
  await page.goto(url, { waitUntil: "load" });
  const wait = at - (Date.now() - loadedAt);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  await page.screenshot({ path: path.join(__dirname, `frame-${name}.png`) });
  await page.close();
  console.log("captured", name, "@", at, "ms");
}

await browser.close();
console.log("done");
