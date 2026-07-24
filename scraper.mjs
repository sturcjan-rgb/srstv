// Sršni TV — scraper
//
// Co dělá:
// 1. Stáhne stránku Maxa NBL na tvcom.cz (celý sezónní rozpis, server-rendered HTML).
// 2. Vyfiltruje jen zápasy Sršňů (podle "Sršni" v názvu týmu).
// 3. U zápasů, které ještě nemáme vyřešené (bez embed GUID), stáhne detail
//    zápasu a zkusí z něj vytáhnout <iframe src="//embed.tvcom.cz/{GUID}/">.
// 4. Uloží výsledek do data/matches.json — přesně ve formátu, který čte web.
//
// Spouští se přes GitHub Actions (viz .github/workflows/scrape.yml), žádný
// ruční krok není potřeba. Lokálně jde spustit přes: node scraper.mjs

import fs from "node:fs";
import * as cheerio from "cheerio";

const LEAGUE_URL = "https://www.tvcom.cz/Zapasy/Sport-Basketbal/Soutez-Kooperativa-NBL/";
const BASE = "https://www.tvcom.cz";
const TEAM_MARK = "Sršni";
const OUT_PATH = "data/matches.json";
const REQUEST_DELAY_MS = 500; // ať to na tvcom nebušíme zbytečně rychle

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; SrsniTV-Scraper/1.0; +https://srsni.com/tv)",
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} pro ${url}`);
  }
  return await res.text();
}

// Vyparsuje jeden <a href="/Zapas/Sport-Basketbal/Soutez-Kooperativa-NBL/...">
// odkaz na zápas z textu odkazu. Formát textu (tak jak ho tvcom vykresluje):
//   "video 5. 5.18:00 Sršni Photomate Písek - BK KVIS Pardubice Basketbal Maxa NBLPlay-off"
//   "video 30. 12. 202517:40 BK ARMEX ENERGY Děčín - Sršni Photomate Písek Basketbal Maxa NBLZákladní část"
// Rok se v textu objevuje jen když zápas není v "aktuálním" roce zobrazení,
// proto rok při jeho absenci dopočítáváme ze sezóny v URL (Sezona-2025-2026).
function parseMatchAnchor(href, rawText) {
  if (!href || !href.includes("/Zapas/Sport-Basketbal/Soutez-Kooperativa-NBL/")) {
    return null;
  }

  let text = rawText.replace(/\s+/g, " ").trim();
  text = text.replace(/^video\s*/i, "");
  text = text.replace(/Studio Basketbal/i, "");

  const dateMatch = text.match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})?(\d{1,2}:\d{2})\s*(.+)$/);
  if (!dateMatch) return null;
  const [, day, month, yearInText, time, rest] = dateMatch;

  const teamsMatch = rest.match(/^(.*?)\s*-\s*(.*?)\s*Basketbal\s*Maxa NBL(.+)$/);
  if (!teamsMatch) return null;
  const home = teamsMatch[1].trim();
  const away = teamsMatch[2].trim();
  const phase = teamsMatch[3].trim();

  if (!home.includes(TEAM_MARK) && !away.includes(TEAM_MARK)) return null;

  let year = yearInText;
  if (!year) {
    const seasonMatch = href.match(/Sezona-(\d{4})-(\d{4})/);
    if (seasonMatch) {
      const [, y1, y2] = seasonMatch;
      year = Number(month) >= 8 ? y1 : y2; // srpen-prosinec => první rok sezóny
    }
  }
  if (!year) return null;

  const idMatch = href.match(/\/(\d+)-[^/]+\.htm$/);
  if (!idMatch) return null;

  return {
    id: idMatch[1],
    url: href.startsWith("http") ? href : BASE + href,
    date: `${Number(day)}. ${Number(month)}. ${year}`,
    time,
    home,
    away,
    phase,
    us: home.includes(TEAM_MARK) ? "home" : "away",
  };
}

async function getSrsniMatches() {
  const html = await fetchHtml(LEAGUE_URL);
  const $ = cheerio.load(html);

  const byId = new Map();
  $('a[href*="/Zapas/Sport-Basketbal/Soutez-Kooperativa-NBL/"]').each((_, el) => {
    const href = $(el).attr("href");
    const text = $(el).text();
    const parsed = parseMatchAnchor(href, text);
    if (parsed) byId.set(parsed.id, parsed);
  });

  return [...byId.values()];
}

async function getEmbedId(matchUrl) {
  const html = await fetchHtml(matchUrl);
  const m = html.match(/embed\.tvcom\.cz\/([a-f0-9-]{20,})\//i);
  return m ? m[1] : null;
}

function loadPrevious() {
  if (!fs.existsSync(OUT_PATH)) return new Map();
  try {
    const prev = JSON.parse(fs.readFileSync(OUT_PATH, "utf8"));
    const map = new Map();
    for (const m of prev) {
      map.set(`${m.date}|${m.time}|${m.home}|${m.away}`, m);
    }
    return map;
  } catch {
    return new Map();
  }
}

function toTimestamp(m) {
  const [d, mo, y] = m.date.split(".").map((s) => Number(s.trim()));
  const [hh, mm] = m.time.split(":").map(Number);
  return new Date(y, mo - 1, d, hh, mm).getTime();
}

async function main() {
  console.log(`Stahuji rozpis Maxa NBL: ${LEAGUE_URL}`);
  const found = await getSrsniMatches();
  console.log(`Nalezeno ${found.length} zápasů Sršňů na tvcom.cz`);

  const previous = loadPrevious();
  const result = [];

  for (const m of found) {
    const key = `${m.date}|${m.time}|${m.home}|${m.away}`;
    const prevMatch = previous.get(key);

    let embed = prevMatch?.embed ?? null;

    if (!embed) {
      try {
        embed = await getEmbedId(m.url);
        await sleep(REQUEST_DELAY_MS);
      } catch (e) {
        console.warn(`  ! Nepodařilo se načíst detail (${m.url}): ${e.message}`);
      }
    }

    result.push({
      date: m.date,
      time: m.time,
      home: m.home,
      away: m.away,
      phase: m.phase,
      us: m.us,
      ...(embed ? { embed } : {}),
    });
  }

  result.sort((a, b) => toTimestamp(b) - toTimestamp(a));

  fs.mkdirSync("data", { recursive: true });
  fs.writeFileSync(OUT_PATH, JSON.stringify(result, null, 2) + "\n", "utf8");

  const withVideo = result.filter((m) => m.embed).length;
  console.log(`Uloženo ${OUT_PATH}: ${result.length} zápasů, ${withVideo} s videem.`);
}

main().catch((err) => {
  console.error("Scraper selhal:", err);
  process.exit(1);
});
