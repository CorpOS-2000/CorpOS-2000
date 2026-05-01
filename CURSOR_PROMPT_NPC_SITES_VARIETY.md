# NPC Website Variety — Diagnosis & Cursor Prompt

---

## DIAGNOSIS

### The Problem in One Sentence

About 94 of the 100+ NPC WorldNet sites all render through a single rigid function —
`buildGenericWorldNetSite` in `js/worldnet-sites-builders.js` — that produces the same
single-column table layout for every site, regardless of site type, with no layout switching,
no typography variation, and almost no Y2K artifact variety.

---

### The Architecture (Two Separate Rendering Tracks)

The game has **two completely separate site rendering pipelines** that do not share logic:

**Track A — JSON-defined Y2K sites** (`data/worldnet-y2k-sites.json`, ~30 sites):
- Rendered by `renderY2kSiteHtml()` in `js/worldnet-y2k-renderer.js`
- Selected in `renderPageDefinitionHtml()` in `js/worldnet-page-renderer.js` when `pageDef.style === 'y2k'`
- These sites already have **10 template functions**: `corporate`, `forum`, `personal`, `news`,
  `shop`, `portal`, `fansite`, `gov`, `education`, `community`
- Each site in the JSON specifies its own `y2k.bg`, `y2k.accent`, `y2k.font`, `y2k.headerBg`
- Has Y2K artifacts: marquees, hit counters, webrings, guestbooks — but only when the JSON
  author remembered to set `y2k.hasHitCounter: true` etc.
- **Still single-column** — no layout archetype switching (no two-column brochure, no three-column portal)
- **This track is better than Track B but still incomplete**

**Track B — Registry-based sites** (`js/worldnet-sites-registry.js` → `WORLDNET_SITE_REGISTRY`,
~94 sites):
- Routed through `buildWorldNet100Site()` in `js/worldnet-sites-builders.js`
- 6 hand-crafted sites have unique HTML (patricias_garden, room2847, truthseekers, savethecookies,
  hargrove_library, hargrove_elementary)
- **The other ~88 sites all fall to `buildGenericWorldNetSite()`** — this is where everything looks the same

---

### What `buildGenericWorldNetSite` Actually Renders (the bug)

Every registry site that isn't hand-crafted gets this exact structure:

```
[Colored header bar with title]
[Description paragraph]
[Visitor hits count]
[Subsection placeholder if sub param exists]
[Related links table (always 3 links)]
[h3 "Interact"]
[One form — action switches between 8 types]
[Footer with cross-links]
```

What is variable:
- Header/border/inner background via `CAT_PAL` (10 category palettes — this part works)
- Form action type (guestbook / petition / newsletter / poll / order / contact / donate / complaint)
- A very small marquee div triggered only when `key.length % 3 === 0`

What is NOT variable (and should be):
- **Layout structure**: always single column, always same element order
- **Typography**: always `Tahoma, Arial, sans-serif`, always `font-size: 11px`
- **Modules/sections**: no forum threads, no news articles, no product tables, no profile grids,
  no classifieds, no chat placeholders, no FAQ blocks — none of the content module types from
  the Y2K renderer are used at all
- **Y2K artifacts**: no hit counters, no webrings, no marquees (except the `length % 3` quirk),
  no "Best Viewed In" badge, no "Under Construction" banners, no blink elements
- **Layout column count**: always one column, never two-column brochure, never three-column portal,
  never news front page with sidebar

The registry entries DO have rich metadata that could drive all this variety:
- `category` — 10 values: politics, sports, food, blog, civic, advocacy, hobby, business,
  entertainment, weird
- `tone` — 4 values: official, amateur, corporate, underground

This data is currently used **only** for palette selection and the one form action type.
It is not used to select layouts, typography, modules, or artifacts.

---

### Root Cause (Specific Functions/Lines)

**File: `js/worldnet-sites-builders.js`**

- `buildGenericWorldNetSite()` (line 368–416): The single-template function that handles ~88 sites.
  It has no layout selection, no module system, no typography mapping, no Y2K artifact logic.

- `CAT_PAL` (lines 19–30): Palette map exists and works. Does NOT have typography or layout info.

- `buildWorldNet100Site()` (lines 423–440): The router — calls unique builders for 6 sites and
  falls to `buildGenericWorldNetSite` for everything else.

**File: `js/worldnet-y2k-renderer.js`**

- `renderY2kSiteHtml()` (line 530–553): Entry point for Track A sites. Has good template dispatch
  via `TEMPLATES[pageDef.y2kTemplate]` but **Track B sites never reach this code**.

- `templateCorporate`, `templateForum`, `templatePersonal`, `templateNews`, `templateShop`,
  `templatePortal`, `templateFansite`, `templateGov`, `templateEducation`, `templateCommunity`
  (lines 370–526): These are 10 well-built template functions that Track B sites never use.

- `marqueeHtml`, `webringHtml`, `guestbookHtml`, `digitCounter` (lines 79–118): Y2K artifact
  helpers that Track B sites never call.

**File: `js/worldnet-sites-registry.js`**

- `WORLDNET_SITE_REGISTRY` (line 20 onward): ~94 site definitions with `category` and `tone`
  fields. These two fields are the correct signal for driving variety but only `category` is
  used (for palette).

---

### Summary of What's Missing vs. the Y2K Design Bible

| Bible Dimension      | Track A (y2k JSON) | Track B (registry, ~88 sites) |
|----------------------|--------------------|-------------------------------|
| Color palette        | ✅ per-site JSON    | ✅ CAT_PAL by category         |
| Layout archetype     | ❌ always 1-col     | ❌ always 1-col                |
| Typography           | ⚠️ per-site JSON    | ❌ always Tahoma 11px          |
| Module/section mix   | ✅ Y2K renderer     | ❌ description + 1 form only   |
| Y2K artifacts        | ⚠️ opt-in per site  | ❌ marquee only (1 in 3 sites) |
| Site-type behaviors  | ⚠️ template helps   | ❌ no type-aware logic         |

---

---

## CURSOR PROMPT

Paste this directly into Cursor's chat. The prompt is self-contained.

---

```
I am working on CorpOS 2000, a solo indie game with a Y2K aesthetic. The game has 100+
NPC-owned websites rendered in a simulated late-1990s browser called WorldNet. The developer
wants authentic era variety: different layouts, typography, color schemes, and module mixes
based on what type of site each one is.

The problem is that approximately 88 of those sites all render through one function that
produces the exact same layout every time. I need you to replace that function with a
proper type-driven module system. Here is everything you need to know.

---

## FILE REFERENCES (add these to your context)

@js/worldnet-sites-builders.js
@js/worldnet-sites-registry.js
@js/worldnet-y2k-renderer.js
@js/worldnet-page-renderer.js
@data/worldnet-y2k-sites.json

---

## THE PROBLEM — BE SPECIFIC

Open `js/worldnet-sites-builders.js`. Find `buildGenericWorldNetSite()` starting around
line 368. This function handles ~88 NPC websites. Every single one of them renders the same
structure:

  colored header bar → description text → visit counter → related links table →
  "Interact" h3 → one form → footer

The `category` field on each registry entry (from `WORLDNET_SITE_REGISTRY` in
`js/worldnet-sites-registry.js`) has 10 values: politics, sports, food, blog, civic,
advocacy, hobby, business, entertainment, weird.

The `tone` field has 4 values: official, amateur, corporate, underground.

Currently `category` only drives the color palette (`CAT_PAL`). `tone` is not used
for rendering at all. Neither drives layout, typography, modules, or Y2K artifacts.

The Y2K artifact helpers (marquees, hit counters, webrings, guestbooks, blink elements,
forum threads, news articles, product tables) already exist in `js/worldnet-y2k-renderer.js`
but are never called by `buildGenericWorldNetSite`.

---

## WHAT TO BUILD

Refactor `buildGenericWorldNetSite()` in `js/worldnet-sites-builders.js` to be a
type-driven rendering system. Do NOT modify any other file. Do NOT touch `renderY2kSiteHtml`,
`renderPageDefinitionHtml`, `WebEx-Publisher`, or any game logic files. Only touch
`worldnet-sites-builders.js`.

The system should work as follows:

### Step 1 — Derive a "site profile" from the registry metadata

Given `meta.category` and `meta.tone`, derive four things deterministically (no randomness
beyond `mulberry32` seeded on the pageKey string):

**A. Layout archetype** — one of these 5 structures:
  - `single_col` — one column, header → content → form → footer (current layout, keep for
    personal/hobby/amateur/weird)
  - `two_col_brochure` — left sidebar (120px) with nav/links + right main content; use for
    corporate/official/business/civic
  - `three_col_portal` — left sidebar (110px) + wide center + right sidebar (110px); use for
    politics/entertainment/community
  - `news_front` — full-width masthead + two-column body (wide left article column + narrow
    right sidebar with section links); use for blog/food/sports/news-type sites
  - `gov_formal` — centered 680px table with official blue banner, extra government preamble
    row, form-heavy; use for official/gov/civic sites with tone='official'

**B. Typography stack** — map category+tone to font-family and size:
  - corporate/official: `Verdana, Geneva, sans-serif` · body size 11px · headers Arial Bold
  - editorial/blog: `Georgia, Times New Roman, serif` · body size 12px · headers Arial Bold 14px
  - personal/amateur/hobby: `Comic Sans MS, cursive` · body size 12px · headers in neon or pastel
  - government/official: `Times New Roman, serif` · body size 11px · headers Arial Bold
  - forum/community: `Verdana, Geneva, sans-serif` · body size 10px (dense)
  - entertainment/weird: pick from a small seeded list: Courier New, Impact, or the site's
    base font but overridden to a bold display style

**C. Module selection** — pick 2–4 modules from the appropriate pool for this site type:

  Pool for `politics` + `official`/`corporate`:
    - press_release_list (renders 4–6 short "PRESS RELEASE: ..." divs with dates)
    - newsletter_signup (email field + subscribe button)
    - constituent_form (contact form branded as "Contact My Office")
    - endorsement_list (table of 4–6 names and titles)
    - faq_block (2–3 canned FAQ items about the politician's platform)

  Pool for `politics` + `amateur`/`underground`:
    - rant_text (a strong-opinion paragraph using meta.description expanded)
    - forum_threads (mini forum with 3–4 thread stubs using actorHandle/actorComment helpers)
    - guestbook (signature form)
    - webring (a "Local Politics Ring")
    - hit_counter

  Pool for `sports`:
    - standings_table (a fake league table with 6 rows: team name, W, L, points)
    - poll_widget (a "Who wins?" radio poll)
    - news_snippets (3 short game recap snippets)
    - guestbook
    - hit_counter

  Pool for `food`:
    - product_table (menu items with name, description, price in a bordered table)
    - hours_block (M–F 11am–9pm style table)
    - order_form (simple "Name + Item + Qty" form)
    - review_snippets (3 short customer review divs with star chars ★)
    - hit_counter

  Pool for `blog`:
    - news_articles (use the existing `newsArticles()` helper from the y2k renderer —
      import it or copy the logic)
    - guestbook
    - webring (a "Personal Blog Ring")
    - hit_counter
    - construction_banner (show when tone='amateur')

  Pool for `civic` + `official`:
    - faq_block (civic FAQ: hours, location, procedure)
    - contact_form (branded "Submit a Request")
    - gov_disclaimer (a small gray box: "This is an official City of Hargrove resource...")
    - links_list (3–4 related government sites)

  Pool for `advocacy`:
    - petition_form (name + email + zip)
    - rant_text
    - endorsement_list
    - hit_counter
    - construction_banner (for tone='amateur')

  Pool for `hobby`:
    - text_block (main hobby description, use meta.description)
    - links_list (3–4 related hobby sites from registry cross-links)
    - guestbook
    - webring (e.g. "Hobbyist Ring" or "Collectors Ring")
    - hit_counter
    - construction_banner

  Pool for `business` + tone `corporate`:
    - services_table (4–6 services in a table with Name and tagline columns)
    - contact_form (branded "Request a Quote" or "Contact Sales")
    - testimonial_snippets (3 short customer quote divs)
    - newsletter_signup
    - hit_counter

  Pool for `business` + tone `amateur`/`underground`:
    - product_table (2–5 products with prices)
    - order_form
    - guestbook
    - hit_counter
    - construction_banner

  Pool for `entertainment`:
    - review_snippets
    - forum_threads (mini)
    - poll_widget ("Which is better?" style)
    - guestbook
    - hit_counter
    - webring ("Fan Site Ring" or "Enthusiast Ring")

  Pool for `weird`:
    - rant_text (absurdist)
    - guestbook
    - hit_counter
    - construction_banner
    - webring ("Weird Wide Web Ring")

  Selection rule: seed a `mulberry32` RNG with the pageKey string (reduce to int). Use it to
  pick 2–4 modules from the pool, always including hit_counter if the category has it in pool,
  always including at least one content module (not just forms).

**D. Y2K artifacts** — in addition to the modules above, add these based on category+tone:
  - Marquee scrolling text: always for `personal`, `hobby`, `entertainment`, `weird` and when
    `tone === 'amateur'`. Use the meta.description or a short generated string as marquee text.
  - Hit counter: always for `personal`, `hobby`, `blog`, `entertainment`, `weird`; never for
    `official` government sites
  - Webring: for `hobby`, `blog`, `entertainment`, `weird`; pick a ring name derived from category
  - "Best Viewed In WorldNet Explorer 5.0 at 800×600": already in footer, keep it
  - "Under Construction" gif placeholder (the text/emoji version): for `tone === 'amateur'`
    and some `weird` sites (seeded coin flip)
  - Blink element for "NEW!" or "UPDATED!": for `entertainment`, `hobby`, `amateur` tone
  - "Official Site" badge (styled blue box): for `tone === 'official'`

---

### Step 2 — Implement module renderers

Inside `worldnet-sites-builders.js` (NOT in the y2k renderer file), implement these
HTML-returning helper functions. They should return table-layout Y2K HTML using `<font>`,
`<table>`, `<b>`, inline styles. They should NOT use modern CSS like flexbox or grid.
Use the `escapeHtml` import already in the file. Use `getWorldNetVisitCount` for hit counters
(already imported). Use the `mulberry32`-seeded RNG passed from the parent so outputs are
deterministic per site.

Function signatures (add these near the top of the file, after the existing helpers):

```js
function renderPressReleaseList(meta, rng, pal) { ... }
function renderNewsSnippets(meta, rng, pal) { ... }
function renderForumThreadStubs(meta, rng, pal) { ... }
function renderProductTable(meta, rng, pal) { ... }
function renderServicesTable(meta, rng, pal) { ... }
function renderStandingsTable(meta, rng, pal) { ... }
function renderTestimonialSnippets(meta, rng, pal) { ... }
function renderEndorsementList(meta, rng, pal) { ... }
function renderHoursBlock(meta, rng, pal) { ... }
function renderFaqBlock(meta, rng, pal) { ... }
function renderRantText(meta, rng, pal) { ... }
function renderPollWidget(meta, rng, pal) { ... }
function renderGuestbookSimple(pageKey, pal) { ... }
function renderNewsletterSignup(meta, pal) { ... }
function renderPetitionForm(meta, pal) { ... }
function renderOrderForm(meta, pal) { ... }
function renderContactForm(meta, label, pal) { ... }
function renderLinksList(pageKey, related, pal) { ... }
function renderHitCounter(pageKey) { ... }
function renderWebring(name, pageKey) { ... }
function renderMarquee(text, pal) { ... }
function renderConstructionBanner() { ... }
function renderGovDisclaimer(meta) { ... }
function renderOfficialBadge(meta) { ... }
```

For content that needs "fake data" (press releases, standings, reviews), generate it
deterministically from the RNG and from meta.title / meta.description. Do not hardcode
data for individual sites — the goal is that any registry site gets plausible-looking
content for its type.

---

### Step 3 — Implement the layout wrappers

Add these layout wrapper functions:

```js
function layoutSingleCol(headerHtml, contentHtml, pal, font) { ... }
function layoutTwoColBrochure(headerHtml, leftHtml, mainHtml, pal, font) { ... }
function layoutThreeColPortal(headerHtml, leftHtml, centerHtml, rightHtml, pal, font) { ... }
function layoutNewsFront(headerHtml, mastHead, mainArticleHtml, sidebarHtml, pal, font) { ... }
function layoutGovFormal(headerHtml, disclaimerHtml, contentHtml, pal, font) { ... }
```

Each layout function takes pre-rendered HTML strings and assembles them into a
`<table>`-based Y2K structure. Use the palette for background colors, borders, and bar colors.
Use `font-family` from the typography mapping in the outer `style=""` on the wrapper.

---

### Step 4 — Replace `buildGenericWorldNetSite`

Replace the body of `buildGenericWorldNetSite(key, sub)` with:

```js
function buildGenericWorldNetSite(key, sub) {
  const meta = REG_BY_KEY.get(key);
  if (!meta) return `<div class="iebody"><p>Site not found: ${escapeHtml(key)}</p></div>`;

  // 1. Derive site profile
  const seed = key.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const rng = mulberry32(seed);
  const pal = CAT_PAL[meta.category] || CAT_PAL.blog;
  const archetype = selectLayoutArchetype(meta);
  const font = selectTypography(meta);
  const modules = selectModules(meta, rng);
  const artifacts = selectArtifacts(meta, rng);

  // 2. Render selected modules
  const renderedModules = renderModules(modules, artifacts, meta, key, rng, pal);

  // 3. Render cross-links (keep existing logic)
  const related = searchWorldNetRegistry(meta.searchKeywords[0] || meta.title, 4)
    .filter(s => s.pageKey !== key).slice(0, 3);

  // 4. Render layout
  const headerHtml = buildSiteHeader(meta, pal, font);
  const footerHtml_ = footerHtml(key);
  const body = assembleLayout(archetype, headerHtml, renderedModules, related, footerHtml_, pal, font);

  return `<div class="iebody" style="background:${pal.page};">${body}</div>`;
}
```

Implement `selectLayoutArchetype(meta)`, `selectTypography(meta)`, `selectModules(meta, rng)`,
`selectArtifacts(meta, rng)`, `renderModules(...)`, `assembleLayout(...)` as separate functions
in the same file.

---

## WHAT MUST NOT BE TOUCHED

- `js/worldnet-y2k-renderer.js` — do not modify at all
- `js/worldnet-page-renderer.js` — do not modify at all
- `js/webex-publisher.js` — do not modify at all (this is the player's website builder tool)
- `data/worldnet-y2k-sites.json` — do not modify
- `js/worldnet-sites-registry.js` — do not modify (the registry data is fine as-is)
- The 6 hand-crafted site builders: `buildPatriciaGarden`, `buildRoom2847`,
  `buildTruthseekers`, `buildSavethecookies`, `buildLibrary`, `buildElementary` — keep as-is
- `buildWorldNet100Site()` — keep its switch-case; only the `default` branch (which calls
  `buildGenericWorldNetSite`) changes behavior
- All game state, actor, and economy logic — this is purely a rendering change

---

## CONSTRAINTS & QUALITY BARS

1. **All output is deterministic**: given the same pageKey, the page always renders the same
   way. Use `mulberry32(seed)` seeded from pageKey for all random choices.

2. **Table-layout HTML only**: use `<table>`, `<tr>`, `<td>`, `<font>`, `<b>`, `<marquee>`
   (for Y2K authenticity), inline `style=""`. No flexbox, no CSS grid, no `<div>` soup
   that looks like modern web.

3. **Use `escapeHtml`** from the existing import for any variable content.

4. **Use `getWorldNetVisitCount(key)`** (already imported) for hit counters.

5. **Import nothing new** unless absolutely necessary. All the helpers you need are in-scope
   or can be written inline.

6. **Do not import from `worldnet-y2k-renderer.js`** — copy any logic you need inline rather
   than creating a circular or cross-module dependency on that file.

7. **Minimum visual output per site**:
   - At minimum 2 distinct content sections (not counting header and footer)
   - At minimum 1 form or interactive element
   - At minimum 1 Y2K artifact if the site category supports it

8. **Performance**: no network calls, no async. All data comes from the registry and the
   deterministic RNG.

---

## EXAMPLE EXPECTED OUTPUT AFTER FIX

**`councilman_pete` (politics, amateur)**:
- Layout: `three_col_portal`
- Left sidebar: navigation links + hit counter
- Center: press release list + rant text paragraph
- Right sidebar: endorsement list + webring ("Local Politics Ring")
- Marquee at top: "VOTE PETE HARRINGTON — DISTRICT 4 NEEDS REAL LEADERSHIP"
- Typography: Verdana 11px body, Arial Bold headers
- "Under Construction" banner (amateur tone)

**`hargrove_bike_club` (sports, amateur)**:
- Layout: `news_front`
- Masthead: site title + "UPDATED! ★" blink badge
- Main: standings table + news snippets
- Sidebar: poll widget + hit counter + webring ("Cyclists Ring")
- Marquee: club description text
- Typography: Verdana 11px

**`mayor_dobbs` (politics, official)**:
- Layout: `gov_formal`
- Official badge at top
- Gov disclaimer row
- FAQ block (office hours, contact procedure)
- Constituent contact form
- Newsletter signup
- No hit counter, no webring, no marquee
- Typography: Times New Roman 11px body, Arial Bold headers

**`hargrove_burger_hut` (food, amateur)**:
- Layout: `single_col`
- Marquee: "BEST BURGERS IN HARGROVE — EST. 1987"
- Product table (menu items + prices)
- Hours block
- Hit counter
- Guestbook
- Construction banner
- Typography: Comic Sans MS 12px
```

---

## AFTER THE IMPLEMENTATION

Once implemented, verify by calling `buildWorldNet100Site` with a few different pageKeys and
checking that:
1. `councilman_pete` and `mayor_dobbs` produce visually different layouts
2. A `hobby` category site has a webring and hit counter
3. An `official` tone site has no hit counter and no marquee
4. No two category/tone combinations produce identical HTML structure

The goal is that any player visiting any of the 88 generic NPC sites should encounter a page
that looks like it belongs to a specific type of 1999–2000 website, not a templated clone.
```

---

*Document generated by code analysis of the CorpOS 2000 codebase.*
*Do not commit this file — it is a development reference only.*
