# CorpOS 2000 — Developer Context File
# Version 1.4 | For use with Cursor AI
# Read this file at the start of every session.
# Do not modify without designer approval.

---

## PROJECT OVERVIEW

**Name:** CorpOS 2000
**Type:** Business / Management Simulation Game
**Engine:** HTML5 + JavaScript + CSS + Electron (Steam/Itch.io)
**Tagline:** Built for Business. Designed for Oversight.
**Setting:** Year 2000. Player starts with $12,500 in mom's garage and builds a global conglomerate.
**Core Conceit:** The entire game plays out on a simulated Windows 2000 desktop called CorpOS — a government-mandated operating system every business must use. The cage was built by the same people who built the original prison.

---

## WORLD LORE (READ BEFORE BUILDING ANY CONTENT)

**RapidGate:** In 1997-1999, RapidEMart secretly built a behavioral prediction engine and sold consumer profiles to insurers, pharma, political orgs, and foreign investors. ~40-60M Americans affected. No law was broken. They walked free. Public outrage forced the government to act.

**CorpOS:** Mandatory OS for all registered US businesses effective January 1, 2000. Sold as "transparency, accountability, oversight." Built by private contractors — some of whom previously worked on RapidEMart's systems. Fragments of RapidEMart's data logic persist inside CorpOS. The system didn't replace RapidEMart. It absorbed it.

**Scandal name:** RapidGate

**Key people:**
- Barbara Moseng — Investigator who unraveled RapidGate by following Derek Sanderson. Forced into exile abroad, still active. Hidden late-game contact.
- Derek Sanderson — Corporate exec whose data preceded his own decisions. Exposed publicly. Resurfaced altered. Mid-game contact.
- RapidEMart leadership — Walked free. Distributed into boards, VC, subsidiaries.

**RapidEMart in gameplay:** Still exists. Distributed through subsidiaries. Acquirable late game. The ultimate irony — owning the company whose logic runs inside the system you operate on.

---

## TECHNICAL ARCHITECTURE

### Four Engine Pillars
```
Clock → Event System → D20 Resolver → Game State
```

### Real-Time Clock
- Start: January 1, 2000 at 06:00
- Speeds: PAUSE | 1x (1hr = ~60 real seconds) | 2x | 4x | 8x
- Dialogs auto-pause the clock
- Speed controls always visible in taskbar

### Event System
- Scheduled: fires at specific date/time
- Interval: repeating with randomness
- Triggered: fires when condition is met
- All events pass through D20 Resolver when uncertain

### D20 Resolver
- Roll 1-20 + modifiers vs Difficulty Class (DC)
- Player NEVER sees dice — they see business language outcomes
- DC scale: 6=easy, 10=moderate, 14=hard, 17=very hard, 20=near impossible
- Returns PASS or FAIL to event system

### Game State
- Single source of truth
- Every system reads and writes to it
- This IS the save file

### Content Pipeline
- All content in JSON files
- Engine reads at load time
- No code changes needed to add content

```json
// JSON schemas:
Website: { url, title, category, unlockRequirement, content, ads[] }
Character: { id, name, role, icon, phone, unlockRequirement, dialogue[], services[], modifiers{} }
Person: { id, name, age, profession, employer, socialWeight, opinionProfile{}, perceptionStats{}, vulnerabilities[] }
NewsEvent: { id, category, headline, triggerType, triggerCondition, effect{} }
Contract: { id, title, client, value, duration, requirements{}, rollDC, passOutcome, failOutcome }
```

---

## HIDDEN STATS (never shown to player by these names)

| In-Game Label | Hidden Stat | What It Affects |
|---|---|---|
| Reputation | Charisma | Contract quality, loan rates, negotiation |
| Business Acumen | Intelligence | Research speed, opportunity spotting |
| Market Sentiment | Luck | Random event bias |
| Political Influence | Strength | Government dealings, permits, bribery |
| Operational Efficiency | Dexterity | Task speed, PC performance |
| Financial Resilience | Constitution | Cash drought survival, loan default |

---

## DESKTOP UI

### Layout
- Background: Teal #008080
- NO HUD overlay on desktop — player checks status by opening modules
- Dynamic news ticker: slides in from top on significant events ONLY, runs, disappears. Never permanent.
- Taskbar: bottom, full width, silver #d4d0c8

### Start Button
- Bottom left of taskbar
- COS seal icon (miniature) + word "Start"
- Opens Start Menu with COS banner vertical on left side

### System Tray
- Bottom right: clock, network icon, volume icon

### Color Palette
```
Teal desktop:     #008080
Silver interface: #d4d0c8
Navy title bar:   #0a246a → #a6b5e7 (gradient)
Dark borders:     #404040
White content:    #ffffff
Green positive:   #006600
Orange warning:   #cc6600
Red danger:       #cc0000
```

### Typography
- Tahoma / MS Sans Serif / Arial
- 11px base size
- No decorative fonts in UI

### Win2K Border System
- Raised element: border-color #fff #404040 #404040 #fff
- Inset element:  border-color #404040 #fff #fff #404040
- Progress bars: repeating stripe pattern (never solid fills)

---

## BOOT SEQUENCE (7 stages — COMPLETE)

1. **BIOS/POST** — Black screen, green/white monospace. Hardware checks: Intek CPU, Seatech HDD, NetComm modem, NVidtek video, SoundMaster audio. Compliance drivers load: CORPNET.SYS, COMPLMON.SYS, AUDITLOG.SYS, REGWATCH.SYS. Federal Mandate 2000-CR7 ACTIVE. Loads slowly so user can read.
2. **Hardware audio** — Fan spin, HDD seek sounds
3. **Boot chime** — Original CorpOS tone (not Windows chime)
4. **Logo animation** — Corner brackets draw in → frame → C → O → S → dividing rule → CORPOS 2000 stamp → tagline fades
5. **Login screen** — COS seal, username/password, institutional disclaimer
6. **Verification** — "Verifying credentials with Federal Business Registry... Checking compliance status... Access granted."
7. **Desktop load** — Teal fades in, icons appear, taskbar slides up, toast notification fires

### Shutdown sequence
- Saving session data
- Closing active connections
- Flushing audit log buffer
- Synchronizing with Federal Business Registry
- Committing compliance records
- Terminating CorpOS services
- "It is now safe to turn off your computer."
- Footer: "All activity has been logged per Federal Mandate 2000-CR7."

---

## PARODY BRAND NAMES (use ONLY these — never real brand names)

| Real | Parody | Context |
|---|---|---|
| Intel | Intek | CPU, BIOS, My Computer |
| Seagate | Seatech | HDD, BIOS |
| SoundBlaster | SoundMaster | Audio, BIOS |
| US Robotics/3Com | NetComm | Modem, BIOS |
| NVIDIA | NVidtek | Video card, BIOS |
| Samsung | Samtek | Monitor, peripherals |
| BlackBerry | Black Cherry | In-game phone module |
| Internet Explorer | WorldNet Explorer | In-game browser |
| Yahoo | Wahoo! | Default search portal |
| Amazon | Amazone | E-commerce site |
| Walmart | ValuMart | Retail chain |
| Microsoft | MicroCorp | Software company |
| AOL | AOE — America Online Express | Dial-up ISP |
| eBay | eTrade Bay | Auction marketplace |
| PayPal | PayPass | Digital payments |
| Napster | Napstar | Music sharing cameo |

**Government agencies:**
| Real | Parody |
|---|---|
| IRS | Federal Revenue Authority (FRA) |
| FBI | Federal Bureau of Commerce Enforcement (FBCE) |
| SSA | Social Security Administration (keep as SSA) |

---

## MODULES (15 confirmed)

| # | Name | Phase | Status |
|---|---|---|---|
| 01 | Daily Herald | 1 | Build |
| 02 | WorldNet Explorer | 1 | Build — banking lives here |
| 03 | Black Cherry | 1 | Build |
| 04 | Properties & HQ | 1 | Build |
| 05 | My Computer | 1 | Build |
| 06 | Personal Profile | 1 | Build |
| 07 | Corporate Profile | 1 | Build |
| 08 | Active Tasks | 1 | Build |
| 09 | Media Player | 1 | Build |
| 10 | Corporate Ledger | 1 | Build |
| 11 | Business Manager | 2 | Later |
| 12 | Stock Market Terminal | 2 | Later |
| 13 | Contacts & CRM | 2 | Later |
| 14 | Espionage Folio | 3 | Later |
| 15 | Perception Dashboard | 3 | Later |

**REMOVED:** Finance Manager — banking moved to WorldNet Explorer

---

## PERSONAL PROFILE MODULE

Player as a legal person. Contains:
- Full legal name, age, DOB
- Social Security Number (masked display)
- Home address, personal email, personal phone
- Personal assets (home, vehicle)
- Bank account summary (read-only — actions happen in WorldNet Explorer)
- Personal criminal record

**Name Change Mechanic:**
- File via WorldNet SSA page ($150 fee)
- 3 in-game week processing time
- D20 roll: DC affected by Notoriety, Judicial Record, Political Influence
- Pass: name changed
- Fail: fee lost, 60-day cooldown, small Corporate Exposure bump added

---

## CORPORATE PROFILE MODULE

Player as business operator. Completely separate from Personal Profile. Contains:
- All owned companies listed
- Per company: Notoriety bar, Corporate Exposure bar, Judicial Record, reputation, perception stats
- Holding Company status (late game)

---

## BANKING SYSTEM

No standalone Finance module. All banking through WorldNet Explorer bank websites.
Personal Profile shows read-only summary.

**Confirmed banks:**
| Bank | Scrutiny | Available |
|---|---|---|
| First National Corp. Bank | Heavy | Week 1 |
| Meridian Savings & Trust | Medium | Week 1 |
| Harbor Credit Union | Low | Week 1 |
| Pacific Rim Financial | Very low | Mid-game |
| Dark Web Bank | Zero (catastrophic if found) | Late game |

Multi-account gameplay: strategic account separation matters for audit protection.
Large transfers between accounts trigger audit save rolls.

---

## THREE PERCEPTION STATS (per entity)

Every company, person, and institution carries all three. They feed each other.

- **Public Perception** — what regular people think. Driven by PR, ads, charity, media.
- **Corporate Perception** — what the business world thinks. Driven by contracts, deals, industry rep.
- **Government Perception** — most consequential. Driven by 5 hidden values:
  - Tax compliance (HEAVIEST positive)
  - Charitable activity (moderate positive)
  - Judicial Record (heavy negative)
  - Crime severity (heavy negative)
  - Corporate aggression (moderate negative)

---

## COMPANY STRUCTURE

- Max 3 active companies simultaneously
- Company 1: Free
- Company 2: Costs 2× Adjusted Valuation of Company 1
- Company 3: Costs 3× cost of Company 2
- Industry locked at creation
- All companies share one treasury

**Adjusted Valuation = (Revenue × multiplier) + Assets + Reputation Bonus - Debt - Liabilities**
(Starting multiplier: 4x — tune during balancing)

**Holding Company:** Late game. Requires 2+ active companies + valuation threshold.

**Inter-company transfers:** 5-15% fee. Frequent transfers trigger audit save roll.

**Named synergy playstyles:**
- Data Empire: Tech + Data + Advertising
- Influence Empire: Media + Advertising + Finance
- Industrial Powerhouse: Manufacturing + Logistics + Retail
- Shadow Operator: Cyber + Data + Finance

---

## NOTORIETY SYSTEM (0-200%)

| % | Status |
|---|---|
| 0% | Exemplary |
| 25% | Minor Irregularities |
| 50% | Non-Compliant |
| 75% | Under Review |
| 100% | Under Investigation |
| 125% | High-Risk Entity |
| 150% | Federal Interest |
| 175% | Priority Target |
| 200% | Federal Target — ticking clock, arrest fires if not resolved |

---

## CORPORATE EXPOSURE SYSTEM (0-100%)

Amplifies Notoriety gain. Formula: **Notoriety Gained = Base Crime Value + CE Bonus**

| CE % | Bonus |
|---|---|
| 0% | +0% |
| 25% | +1.5% |
| 50% | +5.5% |
| 75% | +25.5% |
| 100% | +50.5% |

**CE Tiers:**
| Range | Name | Consequence |
|---|---|---|
| 0-10% | Under the Radar | None |
| 11-25% | On Record | Compliance reminders |
| 26-40% | Flagged | DC8 roll or $2.5K-$10K fine |
| 41-55% | Monitored | Exposure gains 10% faster |
| 56-70% | Formal Inquiry | Tier 1 Investigator assigned |
| 71-85% | Under Audit | Tier 2 Investigator, transfers suspended |
| 86-99% | Active Investigation | Tier 3 Investigator, asset freeze possible |
| 100% | Regulatory Seizure | 30-day clock, DC20 Emergency Appeal |

---

## INVESTIGATOR SYSTEM

Named characters delivered via Black Cherry.

| Tier | Trigger | Dismissal DC | Fine Range | Frequency |
|---|---|---|---|---|
| 1 — Compliance Analyst | 56% CE | DC 12 + JR mod | $15K-$50K | Every 5-10 days |
| 2 — Senior Auditor | 71% CE | DC 16 + JR mod | $40K-$150K | Every 3-7 days |
| 3 — Federal Agent | 86% CE | DC 19 + JR mod | $100K-$500K | Every 2-5 days |

---

## COMPANY JUDICIAL RECORD

Permanent. Never expires. Every finalized legal loss adds one entry.

| Entries | DC Modifier |
|---|---|
| 0 | +0 |
| 1 | +2 |
| 2 | +4 |
| 3 | +7 |
| 4 | +11 |
| 5+ | +16 |

---

## LAWYER TIER SYSTEM

| Tier | DC Offset | Monthly Cost |
|---|---|---|
| No Lawyer | 0 | Free |
| Basic Retainer | Up to +2 | $500 |
| Mid-Tier Firm | Up to +5 | $2,000 |
| Top-Tier Firm | Up to +9 | $8,000 |
| Elite Legal Team | Up to +14 | $25,000 |

Note: Lawyers offset DC but cannot erase Judicial Record entries.

---

## CORPORATE COMBAT (5 types)

| Type | Primary Industry | Effect |
|---|---|---|
| Social | Media, Advertising | PR attacks, perception damage. Low risk, early game. |
| Espionage | Data, Security | Intel gathered, stored in Folio, deployed once per piece |
| Sabotage | Logistics, Manufacturing | Physical disruption, slows rival operations |
| Cyber | Security, Technology | Digital warfare. Lowest Notoriety gain. |
| Legal | Finance, Any | Lawsuits, Judicial Record entries. Most permanently damaging. |

**Combos:**
- Espionage + Social = Expose Attack
- Cyber + Sabotage = Operational Collapse
- Legal + Espionage = Evidence Submission
- Social + Legal = Public Trial Pressure
- Cyber + Espionage = Deep Infiltration
- All Five = Total War (endgame only)

Government uses same 5 types. Cannot be destroyed.

---

## DUAL GAMEPLAY LOOP

**Sandbox State:** Default. Always running. All systems available.

**Contract State:** Activates on Tier 3+ contract acceptance. Player stays on desktop. Changes:
- Media Player overrides to tension track (SYSTEM OVERRIDE message)
- Contract Brief window opens (timer, objectives, payout, Breach of Engagement Fee)
- Taskbar Contract Status indicator appears
- Daily Herald runs contract-relevant headlines
- Black Cherry delivers contract-relevant intel

---

## CONTRACT TIERS

| Tier | Source | Payout | Breach Fee | DC |
|---|---|---|---|---|
| 1 — Standard | Small companies | $5K-$50K | $2,500 | DC 8-10 |
| 2 — Corporate | Mid-ranking Ledger | $50K-$500K | $25,000 | DC 12-14 |
| 3 — Executive | Top-ranking Ledger | $500K-$5M | $150,000 | DC 16-18 |
| 4 — Conglomerate | Top 5 Ledger only | $5M+ | $500,000+ | DC 18-20 |

Contract Mode activates at Tier 3+.

**Perception impact on failure:**
- Finance, Tech, Logistics, Industrial Manufacturing → Corporate Perception only
- Retail, Media, Advertising, Consumer Manufacturing → Corporate + Public
- Data/Analytics → Corporate + minor Government
- Telecommunications → Corporate + Public + Government (all three)

Rule: "Does a regular person notice?" If yes, Public Perception moves.

---

## MUSIC SYSTEM

**Style:** Synthwave / early 2000s digital. Composed tracks: main theme, trailer track, 3 additional.

**Media Player Module:** Windows Media Player style. Play, pause, stop, skip, back, fast forward, select track.

**Purchase:** Tracks bought through WorldNet Explorer digital music store.

**System Override:**
- On critical events: media player grays out, controls disabled
- Display shows: "SYSTEM OVERRIDE — PLAYBACK CONTROLLED"
- Override trigger events: company under attack, Notoriety 100%+, Tier 2/3 investigator assigned, asset freeze, Contract Mode active, story events, victory moments
- Override tracks are pre-loaded, never purchasable, player can never control them

---

## 10 CONFIRMED INDUSTRIES

1. Technology — software, infrastructure, automation, system integration
2. Retail & E-Commerce — storefronts, inventory, pricing, customer satisfaction
3. Manufacturing — production, supply chains, quality control, scaling
4. Transportation & Logistics — routing, warehousing, shipping contracts
5. Media & Entertainment — content, PR, narrative control, scandal management
6. Telecommunications — infrastructure, network coverage, access tiers, bandwidth
7. Advertising & Marketing — campaigns, targeting, ROI, brand development
8. Data & Analytics — collection, pattern analysis, data sales, predictive models
9. Security & Cyber Operations — protection, hacking, counter-espionage
10. Finance & Markets — trading, assets, acquisition, capital raising

Industries interconnect: Data feeds Advertising, Telecom affects Tech speed, Media controls perception visibility.

---

## WIN CONDITIONS

- **Standard:** $10M net worth + 3+ active businesses
- **Conglomerate:** Businesses across 5 different industries simultaneously
- **Empire:** Monopoly in any single industry
- **Underworld:** Control city crime network with clean public front
- **Legacy:** Acquire RapidEMart or its primary assets

## LOSE CONDITIONS

- Cash $0 with no credit and no assets
- Notoriety 200% + arrest event fires
- Hostile takeover by rival (late game)
- Corporate Exposure 100% + Emergency Appeal fails

---

## THREE DOCUMENT SYSTEM

1. **Internal GDD** (PDF) — design document, this file references it
2. **Public Game Manual** — written in CorpOS institutional voice, Phase 2
3. **Progress Tracker** (HTML) — Win2K styled dashboard

---

## BUILD ORDER RECOMMENDATION

### Phase 1A — Foundation
1. Folder structure + file architecture
2. Game State object (single source of truth + save file)
3. Real-time clock + speed controls
4. Desktop shell (teal bg, taskbar, start button, icons, window system)

### Phase 1B — Core Modules
5. Boot sequence (BIOS → logo → login → desktop)
6. Daily Herald
7. Black Cherry (message system)
8. Personal Profile
9. Corporate Profile
10. WorldNet Explorer + Wahoo! portal + 3 bank websites

### Phase 1C — Engine
11. D20 Resolver
12. Event System (scheduled, interval, triggered)
13. JSON content pipeline

### Phase 1D — Economy
14. Cash/expense tick system ($480/week base living expenses always ticking)
15. Basic contract system (Tier 1-2 only)
16. Corporate Ledger

### Phase 2+ — later
Business Manager, Stock Market, full crime system, risk bars, rival AI, combat system, espionage folio

---

## IMPORTANT RULES FOR ALL CODE

- Never reference real brand names — use parody names from the brand list above
- Every window follows Win2K structure: title bar + menu bar + content + status bar
- Title bar: gradient #0a246a → #a6b5e7 when active, #7a96df → #b8c8f0 when inactive
- All borders use Win2K inset/raised system
- Progress bars always use repeating stripe pattern, never solid fills
- Player never sees dice rolls, stat names, or game mechanics — only business language outcomes
- Everything is CorpOS — every tool, every module, every document carries the same visual identity
- Federal Mandate 2000-CR7 is referenced throughout — it is the legal basis for CorpOS existing
