/**
 * Registry metadata + URL maps for the 100 interactive WorldNet sites (Y2K expansion).
 * Merged into worldnet-pages-extended.js / worldnet-routes.js.
 */

/** @typedef {'politics'|'sports'|'food'|'blog'|'civic'|'advocacy'|'hobby'|'business'|'entertainment'|'weird'} WnCategory */

/**
 * @type {Array<{
 *   pageKey: string,
 *   url: string,
 *   title: string,
 *   category: WnCategory,
 *   description: string,
 *   searchKeywords: string[],
 *   district: number|null,
 *   tone: 'official'|'amateur'|'corporate'|'underground'
 * }>}
 */
export const WORLDNET_SITE_REGISTRY = [
  // CATEGORY 1 — POLITICIANS
  {
    pageKey: 'councilman_pete',
    url: 'http://www.pete-for-district4.com/',
    title: "Pete Harrington — District 4 Re-Election",
    category: 'politics',
    description: 'Campaign site: parking meters, potholes, transparency corner.',
    searchKeywords: ['pete', 'harrington', 'district 4', 'council', 'election'],
    district: 4,
    tone: 'amateur'
  },
  {
    pageKey: 'mayor_dobbs',
    url: 'http://www.cityofhargrove.gov.net/mayor/',
    title: 'Office of the Mayor — City of Hargrove',
    category: 'politics',
    description: 'Official mayor biography, FAQ, ribbon-cutting calendar.',
    searchKeywords: ['mayor', 'dobbs', 'city hall', 'government'],
    district: null,
    tone: 'official'
  },
  {
    pageKey: 'alderman_greta',
    url: 'http://greta-swanson.tripod.com/',
    title: 'Greta Swanson — Northside Alderman',
    category: 'politics',
    description: 'Zoning, cats, Tripod-hosted campaign page.',
    searchKeywords: ['greta', 'swanson', 'northside', 'alderman', 'cats'],
    district: null,
    tone: 'amateur'
  },
  {
    pageKey: 'judge_mcallister',
    url: 'http://www.hargrove-courts.gov.net/judge-mcallister/',
    title: 'Hon. Wm. T. McAllister — Hargrove Courts',
    category: 'politics',
    description: 'Judicial bio, redacted docket, stonewall FAQ.',
    searchKeywords: ['judge', 'mcallister', 'court', 'redacted'],
    district: null,
    tone: 'official'
  },
  {
    pageKey: 'senator_hayes',
    url: 'http://www.senatorhayes-california.com/',
    title: 'Senator Barbara Hayes — Official Site',
    category: 'politics',
    description: 'Press releases, constituent corner, newsletter.',
    searchKeywords: ['senator', 'hayes', 'california', 'constituent'],
    district: null,
    tone: 'corporate'
  },
  {
    pageKey: 'commissioner_voss',
    url: 'http://www.hargrove-parking-commission.gov.net/',
    title: 'Hargrove Parking Commission — Commissioner Voss',
    category: 'politics',
    description: 'Parking enforcement statistics, appeals, tips.',
    searchKeywords: ['parking', 'voss', 'ticket', 'citation'],
    district: null,
    tone: 'official'
  },
  {
    pageKey: 'councilman_ramos',
    url: 'http://www.davidramos-d7.com/',
    title: 'David Ramos — District 7 Council',
    category: 'politics',
    description: 'Competent, boring, reasonable municipal platform.',
    searchKeywords: ['ramos', 'district 7', 'council'],
    district: 7,
    tone: 'corporate'
  },
  {
    pageKey: 'mayor_candidate_buck',
    url: 'http://www.bucktanner2002.com/',
    title: 'Buck Tanner for Mayor 2002',
    category: 'politics',
    description: 'Hardware store owner; early campaign; yard signs.',
    searchKeywords: ['buck', 'tanner', 'mayor', 'hardware'],
    district: null,
    tone: 'amateur'
  },
  {
    pageKey: 'alderwoman_petrov',
    url: 'http://www.petrov-harbor.gov.net/',
    title: 'Tatiana Petrov — Harbor District',
    category: 'politics',
    description: 'Harbor district alderwoman; seawall feud updates.',
    searchKeywords: ['petrov', 'harbor', 'seawall', 'alderwoman'],
    district: null,
    tone: 'official'
  },
  {
    pageKey: 'councilman_thatcher',
    url: 'http://www.reggie-thatcher-truthsource.angelfire.com/',
    title: 'Reggie Thatcher TRUTHSOURCE (Unofficial)',
    category: 'politics',
    description: 'Angelfire conspiracy mirror of council communications.',
    searchKeywords: ['thatcher', 'truth', 'angelfire', 'corruption'],
    district: null,
    tone: 'underground'
  },
  // CATEGORY 2 — SPORTS
  {
    pageKey: 'hargrove_hawks',
    url: 'http://www.hargrovehawks.com/',
    title: 'Hargrove Hawks Semi-Pro Basketball',
    category: 'sports',
    description: 'Roster, schedule, merch, season tickets.',
    searchKeywords: ['hawks', 'basketball', 'semi-pro', 'sports'],
    district: null,
    tone: 'corporate'
  },
  {
    pageKey: 'hargrove_bowling',
    url: 'http://www.hargrove-tuesdays-bowling.angelfire.com/',
    title: 'Tuesday Night Bowling League',
    category: 'sports',
    description: 'Standings, rules, team names, trophy case.',
    searchKeywords: ['bowling', 'league', 'tuesday', 'bowl-o-rama'],
    district: null,
    tone: 'amateur'
  },
  {
    pageKey: 'hargrove_5k',
    url: 'http://www.hargrove5k.com/',
    title: 'Annual Hargrove 5K Fun Run',
    category: 'sports',
    description: 'Y2K race results, registration for 2001.',
    searchKeywords: ['5k', 'run', 'race', 'donut world'],
    district: null,
    tone: 'corporate'
  },
  {
    pageKey: 'southside_boxing',
    url: 'http://www.southside-boxing.com/',
    title: 'Southside Boxing Club',
    category: 'sports',
    description: 'Classes, sparring, not a fight club.',
    searchKeywords: ['boxing', 'southside', 'gym'],
    district: null,
    tone: 'corporate'
  },
  {
    pageKey: 'hargrove_disc_golf',
    url: 'http://www.hargrovedisc.tripod.com/',
    title: 'Hargrove Disc Golf Association',
    category: 'sports',
    description: '18 holes, membership, Discraft vs Innova holy war.',
    searchKeywords: ['disc golf', 'frisbee', 'course'],
    district: null,
    tone: 'amateur'
  },
  {
    pageKey: 'chess_masters',
    url: 'http://www.hargrove-chess.com/',
    title: 'Hargrove Chess Society',
    category: 'sports',
    description: 'ELO standings, PGN, library room schedule.',
    searchKeywords: ['chess', 'elo', 'library', 'tournament'],
    district: null,
    tone: 'official'
  },
  {
    pageKey: 'fishing_club',
    url: 'http://www.hargroveanglersclub.com/',
    title: 'Hargrove Anglers Club',
    category: 'sports',
    description: 'Catch of the week, reservoir conditions, fish fry.',
    searchKeywords: ['fishing', 'bass', 'anglers', 'reservoir'],
    district: null,
    tone: 'amateur'
  },
  {
    pageKey: 'little_league',
    url: 'http://www.hargrovell.org/',
    title: 'Hargrove Little League',
    category: 'sports',
    description: 'Spring schedule, snack parents, conduct rules.',
    searchKeywords: ['little league', 'baseball', 'youth'],
    district: null,
    tone: 'official'
  },
  {
    pageKey: 'hargrove_runners',
    url: 'http://www.hargroverunners.org/',
    title: 'Hargrove Runners Club',
    category: 'sports',
    description: 'Group runs, pace groups, injury report.',
    searchKeywords: ['running', 'marathon', 'training'],
    district: null,
    tone: 'corporate'
  },
  {
    pageKey: 'hargrove_yoga',
    url: 'http://www.hargroveyoga.com/',
    title: 'Yoga & Wellness Studio — Hargrove',
    category: 'sports',
    description: 'Classes, chakras, manifestation wall.',
    searchKeywords: ['yoga', 'wellness', 'vinyasa'],
    district: null,
    tone: 'corporate'
  },
  // CATEGORY 3 — FOOD
  {
    pageKey: 'mamas_kitchen',
    url: 'http://www.mamashargrove.com/',
    title: "Mama Rosa's Kitchen",
    category: 'food',
    description: 'Italian family restaurant — sauce recipe NOT online.',
    searchKeywords: ['mama rosa', 'italian', 'restaurant'],
    district: null,
    tone: 'amateur'
  },
  {
    pageKey: 'bobs_burgers',
    url: 'http://www.bobs-burger-palace.com/',
    title: "Bob's Burger Palace",
    category: 'food',
    description: 'Burgasaurus challenge, specialty burgers, coupons.',
    searchKeywords: ['bob', 'burger', 'diner', 'challenge'],
    district: null,
    tone: 'amateur'
  },
  {
    pageKey: 'hargrove_diner',
    url: 'http://www.hargrovediner1952.com/',
    title: 'The Hargrove Diner — Since 1952',
    category: 'food',
    description: 'Blue plate specials, pie, breakfast all day.',
    searchKeywords: ['diner', 'pie', 'breakfast'],
    district: null,
    tone: 'amateur'
  },
  {
    pageKey: 'wok_n_roll',
    url: 'http://www.wok-n-roll.com/',
    title: 'Wok N Roll Buffet',
    category: 'food',
    description: 'Chinese-American buffet, fortune cookie widget.',
    searchKeywords: ['buffet', 'chinese', 'wok'],
    district: null,
    tone: 'corporate'
  },
  {
    pageKey: 'pizza_pete',
    url: 'http://www.pizzapete-hargrove.com/',
    title: "Pizza Pete's — Order Online",
    category: 'food',
    description: 'Live order total calculator, toppings grid.',
    searchKeywords: ['pizza', 'delivery', 'pete'],
    district: null,
    tone: 'corporate'
  },
  {
    pageKey: 'garden_cafe',
    url: 'http://www.thegardenhargrove.com/',
    title: 'The Garden Café — Vegetarian',
    category: 'food',
    description: 'Seasonal menu, poetry night, offline webcam joke.',
    searchKeywords: ['vegetarian', 'cafe', 'organic'],
    district: null,
    tone: 'corporate'
  },
  {
    pageKey: 'el_taco_loco',
    url: 'http://www.eltacoloco-hargrove.com/',
    title: 'El Taco Loco — Late Night Tacos',
    category: 'food',
    description: 'Loco challenge, loud CAPS menu.',
    searchKeywords: ['taco', 'late night', 'mexican'],
    district: null,
    tone: 'amateur'
  },
  {
    pageKey: 'donut_world',
    url: 'http://www.donutworldhargrove.com/',
    title: 'Donut World — 24 Hours',
    category: 'food',
    description: 'The Wall of donuts, weekly poll.',
    searchKeywords: ['donut', '24 hour', 'coffee'],
    district: null,
    tone: 'corporate'
  },
  {
    pageKey: 'coffee_bean_world',
    url: 'http://www.coffeebeanworld.com/',
    title: 'Coffee Bean World',
    category: 'food',
    description: 'Regional chain, glossary, WiFi coming soon.',
    searchKeywords: ['coffee', 'espresso', 'café'],
    district: null,
    tone: 'corporate'
  },
  {
    pageKey: 'brew_masters',
    url: 'http://www.hargrovebrew.com/',
    title: 'Hargrove Home Brewing Society',
    category: 'food',
    description: 'Recipes, competitions, February 1999 incident report.',
    searchKeywords: ['homebrew', 'beer', 'hops'],
    district: null,
    tone: 'amateur'
  },
  // CATEGORY 4 — BLOGS
  {
    pageKey: 'debras_diary',
    url: 'http://debras-hargrove.angelfire.com/',
    title: "Debra's Diary",
    category: 'blog',
    description: 'Y2K diary, cats, guestbook.',
    searchKeywords: ['debra', 'diary', 'angelfire'],
    district: null,
    tone: 'amateur'
  },
  {
    pageKey: 'tech_ted',
    url: 'http://www.tedstek-tips.tripod.com/',
    title: "Ted's Tech Tips",
    category: 'blog',
    description: 'Outdated Y2K-era PC tips, Ask Ted form.',
    searchKeywords: ['tech tips', 'defrag', 'modem'],
    district: null,
    tone: 'amateur'
  },
  {
    pageKey: 'grandma_betty',
    url: 'http://www.grandma-bettys-recipes.com/',
    title: "Grandma Betty's Recipe Corner",
    category: 'blog',
    description: '12 recipes, butter evangelism.',
    searchKeywords: ['recipes', 'cooking', 'betty'],
    district: null,
    tone: 'amateur'
  },
  {
    pageKey: 'paranoid_pete',
    url: 'http://www.petesconspiracy-corner.net/',
    title: "Pete's Conspiracy Corner",
    category: 'blog',
    description: 'RapidGate walls of text, milk report.',
    searchKeywords: ['conspiracy', 'rapidgate', 'pete'],
    district: null,
    tone: 'underground'
  },
  {
    pageKey: 'singles_hargrove',
    url: 'http://www.hargrove-singles.com/',
    title: 'Hargrove Singles',
    category: 'blog',
    description: 'Profiles, winks, brutal honesty.',
    searchKeywords: ['dating', 'singles', 'personals'],
    district: null,
    tone: 'amateur'
  },
  {
    pageKey: 'ufo_watch',
    url: 'http://www.hargrove-ufo-watch.tripod.com/',
    title: 'Hargrove UFO Watch Society',
    category: 'blog',
    description: 'Sighting log, mostly airplanes.',
    searchKeywords: ['ufo', 'sightings', 'tripod'],
    district: null,
    tone: 'amateur'
  },
  {
    pageKey: 'dog_show_darla',
    url: 'http://darlas-dogshow.angelfire.com/',
    title: "Darla's Dog Show Diary",
    category: 'blog',
    description: 'Biscuit the golden retriever — AKC drama.',
    searchKeywords: ['dog show', 'golden retriever', 'biscuit'],
    district: null,
    tone: 'amateur'
  },
  {
    pageKey: 'train_collector',
    url: 'http://www.carls-model-trains.com/',
    title: "Carl's Model Trains",
    category: 'blog',
    description: 'Locomotive table, wantlist, layout of the month.',
    searchKeywords: ['model trains', 'ho scale', 'collector'],
    district: null,
    tone: 'amateur'
  },
  {
    pageKey: 'retirement_ray',
    url: 'http://www.rays-retirement-world.com/',
    title: "Ray's Retirement World",
    category: 'blog',
    description: 'Daily log, hardware store recommendations.',
    searchKeywords: ['retirement', 'ray', 'journal'],
    district: null,
    tone: 'amateur'
  },
  {
    pageKey: 'funky_brackets',
    url: 'http://funky-brackets.tripod.com/',
    title: 'The Funky Brackets (Band)',
    category: 'blog',
    description: 'Weddings through funerals booking.',
    searchKeywords: ['band', 'music', 'funky brackets'],
    district: null,
    tone: 'amateur'
  },
  // CATEGORY 5 — CIVIC
  {
    pageKey: 'hargrove_community_college',
    url: 'http://www.hcc-hargrove.edu/',
    title: 'Hargrove Community College',
    category: 'civic',
    description: 'Spring 2000 catalog, Internet fad lecture.',
    searchKeywords: ['hcc', 'community college', 'enrollment'],
    district: null,
    tone: 'official'
  },
  {
    pageKey: 'hargrove_fire_dept',
    url: 'http://www.hargrovefiredept.gov.net/',
    title: 'Hargrove Fire Department',
    category: 'civic',
    description: 'Stations, safety tips, recruitment.',
    searchKeywords: ['fire', '911', 'department'],
    district: null,
    tone: 'official'
  },
  {
    pageKey: 'hpd',
    url: 'http://www.hpd.hargrove.gov.net/',
    title: 'Hargrove Police Department',
    category: 'civic',
    description: 'Crime prevention, vague most wanted.',
    searchKeywords: ['police', 'hpd', 'tips'],
    district: null,
    tone: 'official'
  },
  {
    pageKey: 'hargrove_city_council',
    url: 'http://www.hargrove-city-council.gov.net/',
    title: 'Hargrove City Council',
    category: 'civic',
    description: 'Agenda, roster, address the council rules.',
    searchKeywords: ['city council', 'minutes', 'agenda'],
    district: null,
    tone: 'official'
  },
  {
    pageKey: 'hargrove_animal_control',
    url: 'http://www.hargrove-animal-control.gov.net/',
    title: 'Hargrove Animal Control',
    category: 'civic',
    description: 'Adoptions, honesty, spay/neuter.',
    searchKeywords: ['animal control', 'adoption', 'pets'],
    district: null,
    tone: 'official'
  },
  {
    pageKey: 'hargrove_dmv',
    url: 'http://www.hargrove-dmv.ca.gov.net/',
    title: 'DMV Field Office — Hargrove',
    category: 'civic',
    description: 'Wait times, checklists, apologies.',
    searchKeywords: ['dmv', 'license', 'registration'],
    district: null,
    tone: 'official'
  },
  {
    pageKey: 'youth_services',
    url: 'http://www.hargrove-youth.org/',
    title: 'Hargrove Youth Services',
    category: 'civic',
    description: 'After-school programs, holiday schedule rant.',
    searchKeywords: ['youth', 'after school', 'kids'],
    district: null,
    tone: 'official'
  },
  {
    pageKey: 'senior_center',
    url: 'http://www.hargrove-senior-center.org/',
    title: 'Hargrove Senior Center',
    category: 'civic',
    description: 'Bingo schedule, Internet Basics class.',
    searchKeywords: ['senior', 'bingo', 'activities'],
    district: null,
    tone: 'official'
  },
  {
    pageKey: 'hargrove_library',
    url: 'http://www.hargrove-public-library.net/',
    title: 'Hargrove Public Library',
    category: 'civic',
    description: 'Dan Brown catalog gag, holds, spreadsheet easter egg.',
    searchKeywords: ['library', 'catalog', 'books'],
    district: null,
    tone: 'official'
  },
  {
    pageKey: 'hargrove_elementary',
    url: 'http://www.hargrove-elementary.edu.net/',
    title: 'Hargrove Elementary — School of Fish',
    category: 'civic',
    description: 'Fish students, Dr. Finnegan, plankton lunch.',
    searchKeywords: ['elementary', 'school', 'fish'],
    district: null,
    tone: 'official'
  },
  // CATEGORY 6 — ADVOCACY
  {
    pageKey: 'ban_leaf_blowers',
    url: 'http://www.banleafblowers-hargrove.com/',
    title: 'Ban Leaf Blowers Coalition',
    category: 'advocacy',
    description: 'Decibel chart, petition vs blowers.',
    searchKeywords: ['leaf blower', 'noise', 'petition'],
    district: null,
    tone: 'amateur'
  },
  {
    pageKey: 'save_the_bees',
    url: 'http://www.savehargrovebees.org/',
    title: "Save Hargrove's Bees",
    category: 'advocacy',
    description: 'Margaret Waverly pollinator advocacy.',
    searchKeywords: ['bees', 'pollinator', 'pesticides'],
    district: null,
    tone: 'corporate'
  },
  {
    pageKey: 'savethecookies',
    url: 'http://www.savethecookies.org/',
    title: 'Save The Cookies Coalition',
    category: 'advocacy',
    description: 'Satire petition harvesting “cookie” theft data.',
    searchKeywords: ['cookies', 'petition', 'margaret'],
    district: null,
    tone: 'amateur'
  },
  {
    pageKey: 'meridian_traffic_light',
    url: 'http://www.meridian-traffic-light.com/',
    title: 'Meridian Traffic Light Petition',
    category: 'advocacy',
    description: '847 signatures and pride.',
    searchKeywords: ['meridian', 'traffic light', 'accident'],
    district: null,
    tone: 'amateur'
  },
  {
    pageKey: 'clean_creek',
    url: 'http://www.cleanhargrove-creek.org/',
    title: 'Clean Up Hargrove Creek',
    category: 'advocacy',
    description: 'Volunteer days, dumped junk list.',
    searchKeywords: ['creek', 'cleanup', 'environment'],
    district: null,
    tone: 'corporate'
  },
  {
    pageKey: 'historical_society',
    url: 'http://www.hargrove-history.org/',
    title: 'Hargrove Historical Society',
    category: 'advocacy',
    description: 'Collingsworth House feud, archives.',
    searchKeywords: ['history', 'museum', 'archive'],
    district: null,
    tone: 'official'
  },
  {
    pageKey: 'hargrove_watch',
    url: 'http://www.hargroveneighborhoodwatch.com/',
    title: 'Hargrove Neighborhood Watch',
    category: 'advocacy',
    description: 'Incident log, Elm Street car saga.',
    searchKeywords: ['neighborhood watch', 'safety'],
    district: null,
    tone: 'amateur'
  },
  {
    pageKey: 'parents_assoc',
    url: 'http://www.hpa-hargrove.org/',
    title: 'Hargrove Parents Association',
    category: 'advocacy',
    description: 'Bake sale totals, crossing guard campaign.',
    searchKeywords: ['pta', 'parents', 'schools'],
    district: null,
    tone: 'amateur'
  },
  {
    pageKey: 'hargrove_environmental',
    url: 'http://www.hargrove-green.org/',
    title: 'Hargrove Environmental Coalition',
    category: 'advocacy',
    description: 'Air quality, adopt-a-tree.',
    searchKeywords: ['green', 'environment', 'recycling'],
    district: null,
    tone: 'corporate'
  },
  {
    pageKey: 'hargrove_homeless_coalition',
    url: 'http://www.hargrove-homeless-services.org/',
    title: 'Hargrove Homeless Services',
    category: 'advocacy',
    description: 'Shelter hours, donation needs — the competent site.',
    searchKeywords: ['homeless', 'shelter', 'donate'],
    district: null,
    tone: 'corporate'
  },
  // CATEGORY 7 — HOBBIES
  {
    pageKey: 'patricias_garden',
    url: 'http://www.patricias-garden-corner.net/',
    title: "Patricia's Garden Corner",
    category: 'hobby',
    description: 'Orchid shrine, guestbook, AXIS discover.',
    searchKeywords: ['orchids', 'garden', 'patricia'],
    district: 5,
    tone: 'amateur'
  },
  {
    pageKey: 'bird_watchers',
    url: 'http://www.hargrove-birding.org/',
    title: 'Hargrove Birding Society',
    category: 'hobby',
    description: 'Bird of the week, Big Year tracker.',
    searchKeywords: ['birding', 'ornithology', 'sightings'],
    district: null,
    tone: 'amateur'
  },
  {
    pageKey: 'astronomy_club',
    url: 'http://www.hargrove-astronomy.org/',
    title: 'Hargrove Amateur Astronomy Club',
    category: 'hobby',
    description: 'Star parties, light pollution beef.',
    searchKeywords: ['astronomy', 'telescope', 'stars'],
    district: null,
    tone: 'amateur'
  },
  {
    pageKey: 'hiking_trails',
    url: 'http://www.hargrovetrails.org/',
    title: 'Hargrove Trails & Parks Guide',
    category: 'hobby',
    description: 'Trail conditions MUDDY, horse rule.',
    searchKeywords: ['hiking', 'trails', 'parks'],
    district: null,
    tone: 'official'
  },
  {
    pageKey: 'mineral_hunters',
    url: 'http://www.hargroverocks.tripod.com/',
    title: 'Hargrove Rock & Mineral Club',
    category: 'hobby',
    description: 'Field trips, Greg’s warning about collecting.',
    searchKeywords: ['rocks', 'minerals', 'geology'],
    district: null,
    tone: 'amateur'
  },
  {
    pageKey: 'ham_radio',
    url: 'http://www.w6hrg.com/',
    title: 'W6HRG Amateur Radio Club',
    category: 'hobby',
    description: 'Net schedule, Y2K after action report.',
    searchKeywords: ['ham radio', 'amateur radio', 'w6hrg'],
    district: null,
    tone: 'official'
  },
  {
    pageKey: 'quilt_guild',
    url: 'http://www.hargrove-quilting.com/',
    title: 'Hargrove Quilting Guild',
    category: 'hobby',
    description: 'Millennium quilt, longarm lending.',
    searchKeywords: ['quilt', 'patchwork', 'guild'],
    district: null,
    tone: 'amateur'
  },
  {
    pageKey: 'beekeepers',
    url: 'http://www.hargrovebeekeeper.org/',
    title: 'Hargrove Beekeeping Society',
    category: 'hobby',
    description: 'Swarm hotline, Margaret crossover.',
    searchKeywords: ['beekeeping', 'honey', 'hive'],
    district: null,
    tone: 'amateur'
  },
  {
    pageKey: 'model_aviation',
    url: 'http://www.hargrove-rc-aviation.com/',
    title: 'Hargrove RC Aircraft Club',
    category: 'hobby',
    description: 'Crash of the Month, Sunday flying field.',
    searchKeywords: ['rc plane', 'model aviation'],
    district: null,
    tone: 'amateur'
  },
  {
    pageKey: 'chess_kids',
    url: 'http://www.hargrovejuniorchess.com/',
    title: 'Hargrove Junior Chess Club',
    category: 'hobby',
    description: 'Beat Coach Greg pizza tracker.',
    searchKeywords: ['chess', 'kids', 'library'],
    district: null,
    tone: 'amateur'
  },
  // CATEGORY 8 — BUSINESS
  {
    pageKey: 'petes_plumbing',
    url: 'http://www.petesplumbing-hargrove.com/',
    title: "Pete's Plumbing",
    category: 'business',
    description: 'Emergency line, elevator exclusion epic.',
    searchKeywords: ['plumber', 'plumbing', 'pete'],
    district: null,
    tone: 'amateur'
  },
  {
    pageKey: 'hargrove_auto',
    url: 'http://www.hargrovemotors.com/',
    title: 'Hargrove Motors — Auto Repair & Sales',
    category: 'business',
    description: 'Used inventory, Y2K diagnostic boast.',
    searchKeywords: ['used cars', 'repair', 'mechanic'],
    district: null,
    tone: 'corporate'
  },
  {
    pageKey: 'morrison_klein_law',
    url: 'http://www.morrison-klein-law.com/',
    title: 'Morrison Klein LLP',
    category: 'business',
    description: 'Practice areas, consultation form.',
    searchKeywords: ['lawyer', 'attorney', 'injury'],
    district: null,
    tone: 'corporate'
  },
  {
    pageKey: 'hargrove_realty',
    url: 'http://www.hargroverealty.com/',
    title: 'Hargrove Realty Group',
    category: 'business',
    description: 'Listings, mortgage calculator JS.',
    searchKeywords: ['real estate', 'realtor', 'homes'],
    district: null,
    tone: 'corporate'
  },
  {
    pageKey: 'quick_tax',
    url: 'http://www.quicktax-hargrove.com/',
    title: 'QuickTax — Hargrove',
    category: 'business',
    description: 'Refund season, appointment booking.',
    searchKeywords: ['tax', 'refund', 'april 15'],
    district: null,
    tone: 'corporate'
  },
  {
    pageKey: 'fitlife_gym',
    url: 'http://www.fitlife-hargrove.com/',
    title: 'FitLife Gym',
    category: 'business',
    description: 'Classes, 1999 equipment brag wall.',
    searchKeywords: ['gym', 'fitness', 'trainers'],
    district: null,
    tone: 'corporate'
  },
  {
    pageKey: 'curl_up_dye',
    url: 'http://www.curl-up-and-dye.com/',
    title: 'Curl Up & Dye Salon',
    category: 'business',
    description: 'Stylist bios, before/after described.',
    searchKeywords: ['salon', 'hair', 'highlights'],
    district: null,
    tone: 'corporate'
  },
  {
    pageKey: 'lightning_clean',
    url: 'http://www.lightning-cleaners.com/',
    title: 'Lightning Cleaners',
    category: 'business',
    description: 'Same-day dry cleaning, stain hall of fame.',
    searchKeywords: ['dry cleaning', 'laundry'],
    district: null,
    tone: 'corporate'
  },
  {
    pageKey: 'bug_b_gone',
    url: 'http://www.bugbgone-hargrove.com/',
    title: 'Bug-B-Gone Pest Control',
    category: 'business',
    description: 'Bug of the Month biology lesson.',
    searchKeywords: ['pest control', 'termites', 'ants'],
    district: null,
    tone: 'corporate'
  },
  {
    pageKey: 'hargrove_storage_extra',
    url: 'http://www.cheap-storage-hargrove.com/',
    title: 'Cheap Storage Hargrove',
    category: 'business',
    description: 'Cash only, suspiciously cheap.',
    searchKeywords: ['storage', 'cheap', 'units'],
    district: null,
    tone: 'amateur'
  },
  // CATEGORY 9 — ENTERTAINMENT
  {
    pageKey: 'hargrove_theater',
    url: 'http://www.hargrove-community-theater.org/',
    title: 'Hargrove Community Theater',
    category: 'entertainment',
    description: 'Our Town season, auditions.',
    searchKeywords: ['theater', 'our town', 'tickets'],
    district: null,
    tone: 'amateur'
  },
  {
    pageKey: 'arcade_zone',
    url: 'http://www.arcadezone-hargrove.com/',
    title: 'Arcade Zone',
    category: 'entertainment',
    description: 'High scores, tournaments, neon chaos.',
    searchKeywords: ['arcade', 'games', 'tokens'],
    district: null,
    tone: 'amateur'
  },
  {
    pageKey: 'valley_drive_in',
    url: 'http://www.valley-drive-in.com/',
    title: 'Valley Drive-In Theater',
    category: 'entertainment',
    description: 'Double features Matrix/Fight Club era.',
    searchKeywords: ['drive in', 'movies'],
    district: null,
    tone: 'amateur'
  },
  {
    pageKey: 'karaoke_kings',
    url: 'http://karaoke-kings.tripod.com/',
    title: 'Karaoke Kings',
    category: 'entertainment',
    description: 'Song book, booth reservations.',
    searchKeywords: ['karaoke', 'singing', 'bar'],
    district: null,
    tone: 'amateur'
  },
  {
    pageKey: 'night_owl_records',
    url: 'http://www.nightowlrecords.com/',
    title: 'Night Owl Records',
    category: 'entertainment',
    description: 'Used CDs, listening booths, staff picks.',
    searchKeywords: ['records', 'cds', 'vinyl'],
    district: null,
    tone: 'corporate'
  },
  {
    pageKey: 'book_swap',
    url: 'http://www.bookswapcentral.com/',
    title: 'Book Swap Central',
    category: 'entertainment',
    description: 'Trade policy, Bartholomew the cat.',
    searchKeywords: ['used books', 'bookstore'],
    district: null,
    tone: 'amateur'
  },
  {
    pageKey: 'khrg_radio',
    url: 'http://www.khrg997fm.com/',
    title: 'KHRG 99.7 FM',
    category: 'entertainment',
    description: 'Top 40, request line, contests.',
    searchKeywords: ['radio', 'khrg', 'top 40'],
    district: null,
    tone: 'corporate'
  },
  {
    pageKey: 'puzzle_room',
    url: 'http://www.tedspuzzleroom-hargrove.com/',
    title: "Ted's Puzzle Room",
    category: 'entertainment',
    description: 'Basement proto-escape room themes.',
    searchKeywords: ['puzzle', 'escape room', 'ted'],
    district: null,
    tone: 'amateur'
  },
  {
    pageKey: 'hargrove_concert_hall',
    url: 'http://www.hargrove-concert-hall.com/',
    title: 'Hargrove Concert Hall',
    category: 'entertainment',
    description: 'Symphony season subscriptions.',
    searchKeywords: ['symphony', 'concert', 'classical'],
    district: null,
    tone: 'official'
  },
  {
    pageKey: 'hargrove_billiards',
    url: 'http://hargrove-billiards.tripod.com/',
    title: 'Hargrove Billiards',
    category: 'entertainment',
    description: 'Leagues, chalk incident disclaimer.',
    searchKeywords: ['pool', 'billiards', 'darts'],
    district: null,
    tone: 'amateur'
  },
  // CATEGORY 10 — WEIRD
  {
    pageKey: 'flat_earth_society',
    url: 'http://www.hargrove-flat-earth.tripod.com/',
    title: 'Hargrove Flat Earth Research',
    category: 'weird',
    description: 'Evidence: look outside.',
    searchKeywords: ['flat earth', 'tripod'],
    district: null,
    tone: 'underground'
  },
  {
    pageKey: 'professional_napper',
    url: 'http://daves-naps.angelfire.com/',
    title: "Dave's Professional Napping Services",
    category: 'weird',
    description: 'Paid naps for offices.',
    searchKeywords: ['nap', 'sleep', 'dave'],
    district: null,
    tone: 'amateur'
  },
  {
    pageKey: 'left_socks_support',
    url: 'http://www.left-socks-missing.com/',
    title: 'Left Sock Support Group',
    category: 'weird',
    description: 'Theories, memorial wall.',
    searchKeywords: ['socks', 'laundry', 'support group'],
    district: null,
    tone: 'amateur'
  },
  {
    pageKey: 'inland_seagulls',
    url: 'http://www.protect-hargrove-seagulls.org/',
    title: 'Inland Seagull Protection Society',
    category: 'weird',
    description: 'Zero seagulls, maximum belief.',
    searchKeywords: ['seagull', 'inland', 'birds'],
    district: null,
    tone: 'amateur'
  },
  {
    pageKey: 'complaint_dept',
    url: 'http://www.hargrove-complaint-dept.gov.net/',
    title: "Hargrove Official Complaint Department",
    category: 'weird',
    description: 'Tracked gripes: leaf blowers vs potholes.',
    searchKeywords: ['complaints', 'city', '311'],
    district: null,
    tone: 'official'
  },
  {
    pageKey: 'speed_typing_competition',
    url: 'http://www.hargrove-speed-typing.com/',
    title: 'Hargrove Speed Typing Championship',
    category: 'weird',
    description: 'Live typing test JS, leaderboard.',
    searchKeywords: ['typing', 'wpm', 'keyboard'],
    district: null,
    tone: 'corporate'
  },
  {
    pageKey: 'chair_society',
    url: 'http://www.hargrove-chair-society.com/',
    title: 'Chair Appreciation Society',
    category: 'weird',
    description: 'Stools are NOT chairs — settled.',
    searchKeywords: ['chairs', 'furniture', 'tour'],
    district: null,
    tone: 'amateur'
  },
  {
    pageKey: 'truthseekers',
    url: 'http://www.truthseekers2000.net/',
    title: 'Truth Seekers 2000',
    category: 'weird',
    description: 'Contradictory posts, Moseng email buried in post 7.',
    searchKeywords: ['truth seekers', 'conspiracy', 'deepnode'],
    district: null,
    tone: 'underground'
  },
  {
    pageKey: 'room2847',
    url: 'http://www.room2847.net/',
    title: 'Room 2847',
    category: 'weird',
    description: 'Twelve-page liminal crawl.',
    searchKeywords: ['liminal', '2847', 'corridor'],
    district: null,
    tone: 'underground'
  },
  {
    pageKey: 'millennium_club',
    url: 'http://www.hargrove-y2k-prep.com/',
    title: 'Millennium Club — Disaster Preparedness',
    category: 'weird',
    description: 'Post-Y2K embarrassment inventory blowout.',
    searchKeywords: ['y2k', 'prep', 'canned goods'],
    district: null,
    tone: 'amateur'
  }
];

/** Page key → canonical root URL */
export const WORLDNET_100_ROOT_URLS = Object.freeze(
  Object.fromEntries(WORLDNET_SITE_REGISTRY.map((s) => [s.pageKey, s.url.endsWith('/') ? s.url : `${s.url}/`]))
);

/** Flat host aliases (with and without www) */
export function buildWorldNet100HostAliases() {
  /** @type {[string, string][]} */
  const out = [];
  for (const s of WORLDNET_SITE_REGISTRY) {
    try {
      const u = new URL(s.url);
      let host = u.hostname.toLowerCase();
      const bare = host.replace(/^www\./, '');
      out.push([host, s.pageKey]);
      if (host.startsWith('www.')) {
        out.push([bare, s.pageKey]);
      } else {
        out.push([`www.${bare}`, s.pageKey]);
      }
    } catch {
      /* skip */
    }
  }
  return out;
}

export const WORLDNET_100_TITLES = Object.freeze(
  Object.fromEntries(WORLDNET_SITE_REGISTRY.map((s) => [s.pageKey, s.title]))
);

/** Category → page keys (for Wahoo grouping UI) */
export const WORLDNET_SITES_BY_CATEGORY = Object.freeze(
  WORLDNET_SITE_REGISTRY.reduce((acc, s) => {
    const k = s.category;
    if (!acc[k]) acc[k] = [];
    acc[k].push(s.pageKey);
    return acc;
  }, /** @type {Record<string, string[]>} */ ({}))
);

/** Fast membership check for WorldNet 100 routing */
export const WORLDNET_100_KEYS = new Set(WORLDNET_SITE_REGISTRY.map((s) => s.pageKey));

/** Default persisted slice for gameState.worldnet (known 99669 listings + interaction stores). */
export function createDefaultWorldNetState() {
  return {
    knownSites: Object.fromEntries(
      WORLDNET_SITE_REGISTRY.map((s) => [s.pageKey, { listed99669: true }])
    ),
    formSubmissions: {},
    pollVotes: {},
    petitions: {},
    complaintLog: [],
    counters: {}
  };
}

/**
 * Wahoo search helper — keyword/title/description match.
 * @param {string} q
 * @param {number} [limit]
 */
export function searchWorldNetRegistry(q, limit = 24) {
  const raw = String(q || '').trim().toLowerCase();
  if (!raw) return WORLDNET_SITE_REGISTRY.slice(0, Math.min(limit, 12));
  const words = raw.split(/\s+/).filter(Boolean);
  const scored = WORLDNET_SITE_REGISTRY.map((s) => {
    const hay = `${s.title} ${s.description} ${s.searchKeywords.join(' ')} ${s.pageKey}`.toLowerCase();
    let score = 0;
    for (const w of words) {
      if (!w) continue;
      if (hay.includes(w)) score += 3;
      if (s.pageKey.includes(w)) score += 2;
      if ((s.searchKeywords || []).some((k) => k.includes(w))) score += 2;
    }
    return { s, score };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.s);
  return scored.slice(0, limit);
}
