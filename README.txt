# Sršni TV — ostrá verze

Samoobslužná stránka se zápasy Sršňů Photomate Písek. Scraper běží sám na
pozadí (GitHub Actions), nic se neaktualizuje ručně.

## Jak to funguje

```
tvcom.cz (rozpis Maxa NBL)
        │
        ▼
scraper.mjs  ──── běží automaticky každé 2h přes GitHub Actions
        │
        ▼
data/matches.json  ──── scraper sem zapisuje výsledek
        │
        ▼
index.html  ──── web si matches.json načte a zobrazí
```

Scraper stahuje **jen** to, co tvcom.cz servíruje jako obyčejné HTML (žádný
headless prohlížeč, žádné přihlašování) — najde zápasy Sršňů v rozpisu Maxa
NBL a u každého zkusí dohledat embed přehrávače. Jakmile jednou najde embed,
příště ho už znovu nestahuje (šetří to tvcom i čas běhu).

## Nasazení (jednorázově)

1. **Založ nový repozitář na GitHubu** (klidně soukromý i veřejný — GitHub
   Pages funguje u obojího, u soukromého potřebuješ placený plán GitHubu).
2. **Nahraj do něj obsah týhle složky** (buď přes web rozhraní "Add file →
   Upload files", nebo přes `git push`, pokud s gitem umíš).
3. **Zapni GitHub Pages:**
   Settings → Pages → Source: **GitHub Actions** (případně "Deploy from a
   branch" → `main` → `/ (root)`, pokud chceš jednodušší variantu bez
   vlastního deploy workflow).
4. **Povol scraperu zapisovat zpět do repozitáře:**
   Settings → Actions → General → Workflow permissions → zaškrtni
   **"Read and write permissions"** → Save.
   (Bez tohohle kroku scraper stáhne data, ale nepůjde mu je commitnout.)
5. **Spusť scraper poprvé ručně:**
   záložka Actions → "Aktualizace zápasů Sršni TV" → Run workflow.
   Pak se počkej pár desítek vteřin a zkontroluj, že se v `data/matches.json`
   něco změnilo / přibylo.
6. Dál už se to spouští samo, každé 2 hodiny (`cron` v
   `.github/workflows/scrape.yml` — čas jde upravit, viz komentář v souboru).

## Struktura souborů

- `index.html` — samotná stránka (logo, hero, filtry, vyhledávání, přehrávač)
- `scraper.mjs` — scraper (Node.js, čistý `fetch` + `cheerio`, bez závislosti
  na headless prohlížeči)
- `data/matches.json` — výstup scraperu; nastartovaný aktuálními daty sezóny
  2025/2026, aby stránka fungovala hned od začátku
- `.github/workflows/scrape.yml` — plán, kdy a jak se scraper spouští
- `package.json` — jediná závislost je `cheerio` (parsování HTML)

## Lokální testování

Pokud chceš scraper vyzkoušet u sebe na počítači před nasazením:

```bash
npm install
npm run scrape
```

Vypíše, kolik zápasů našel a kolik z nich už má video, a přepíše
`data/matches.json`.

## Co hlídat

- **Souhlas tvcomu.** Scraper jen vkládá jejich veřejný embed přehrávač
  (`embed.tvcom.cz/...`) — nic nestahuje ani nekopíruje. Než se stránka
  pustí naostro pro veřejnost, počkej na jejich odpověď na e-mail.
- **Nová sezóna.** Adresa `Zapasy/Sport-Basketbal/Soutez-Kooperativa-NBL/`
  zobrazuje aktuální sezónu automaticky, takže by scraper měl fungovat i po
  přechodu na sezónu 2026/2027 bez zásahu. Doporučuju to ale na startu nové
  sezóny jednou zkontrolovat ručně (Actions → Run workflow → zkouknout,
  jestli se objevily nové zápasy).
- **Pokud tvcom změní strukturu stránky**, scraper přestane nacházet zápasy
  nebo embed GUID. Actions záložka na GitHubu ukáže červený běh (chybu) —
  to je signál, že je potřeba scraper aktualizovat.
