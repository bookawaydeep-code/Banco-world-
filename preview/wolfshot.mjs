import puppeteer from "puppeteer";
import { fileURLToPath } from "url"; import path from "path";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const b = await puppeteer.launch({ headless:"new", args:["--no-sandbox","--disable-setuid-sandbox"] });
const p = await b.newPage();
await p.setViewport({ width: 700, height: 360, deviceScaleFactor: 2 });
await p.goto("file://"+path.join(__dirname,"wolf-test.html"), { waitUntil:"load" });
await p.screenshot({ path: path.join(__dirname,"wolf-candidates.png") });
await b.close(); console.log("ok");
