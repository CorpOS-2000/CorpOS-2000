/**
 * WorldNet HTML templates (same source as data/build-pages.mjs).
 * Run `npm run build:data` to emit data/pages.json after edits.
 */
export const worldnetPages = {
  home: `<div class="iebody">
<div class="ntbar">◆ MARKETS UP — Dot-com boom continues &nbsp;|&nbsp; ◆ RAPIDGATE — One year later &nbsp;|&nbsp; ◆ CORPOS MANDATE — 100% compliance achieved</div>
<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
  <div style="font-size:36px;font-weight:900;color:#cc0000;font-family:'Times New Roman',serif;">Wahoo!</div>
  <div style="font-size:11px;color:#666;">The World's #1 Search Portal &nbsp;|&nbsp; Year 2000</div>
</div>
<div style="border:2px solid #cc0000;padding:6px;margin-bottom:8px;background:#fff8f0;">
  <div class="sbox">
    <input class="sinput" type="text" placeholder="Search the WorldNet..." id="wsearch">
    <button class="sbtn" data-action="wahoo-search">Wahoo Search!</button>
    &nbsp;<a data-nav="lucky" style="font-size:11px;">I'm Feeling Lucky</a>
  </div>
  <div style="font-size:10px;color:#888;text-align:center;">Search 1,420,000,000 web pages</div>
</div>
<div class="ad">📢 <b>FEATURED:</b> CorpOS 2000 Certified Business Tools — <a data-wnet-nav="http://www.corptools.net">Click Here</a></div>
<div style="max-width:100%;">
<div class="cgrid">
  <div class="cat"><div class="cat-t">💼 Business & Finance</div><a data-nav="bizreg">Register a Business</a><a data-nav="bank">First National Bank</a><a data-nav="bank_meridian">Meridian Savings</a><a data-nav="bank_harbor">Harbor Credit Union</a><a data-nav="bank_pacific">Pacific Rim Financial</a><a data-nav="stocks">Stock Market</a><a data-wnet-nav="http://www.realestatenow.net">Real Estate</a></div>
  <div class="cat"><div class="cat-t">📰 News & Media</div><a data-nav="herald">Daily Herald Online</a><a data-wnet-nav="http://www.corpnews.net">CorpNews Wire</a><a data-wnet-nav="http://www.megamergers.com">MegaMergers</a><a data-wnet-nav="http://www.weatherchannel2k.com">Weather</a></div>
  <div class="cat"><div class="cat-t">🛒 Shopping</div><a data-wnet-nav="http://www.amazone.com">Amazone.com</a><a data-nav="wn_shop" data-wnet-subpath="rapidmart/home">RapidMart 1999</a><a data-wnet-nav="http://www.bidbattle.net">BidBattle Auctions</a><a data-wnet-nav="http://www.discountelectronicsdirect.com">Electronics Direct</a></div>
  <div class="cat"><div class="cat-t">👥 People & Jobs</div><a data-nav="hiring">Job Listings</a><a data-nav="staffing">Staffing Agency</a><a data-nav="yourspace">yourspace.net</a><a data-wnet-nav="http://www.careerlaunchpad.com">CareerLaunchPad</a><a data-wnet-nav="http://www.classmatesfinder.net">ClassmatesFinder</a></div>
  <div class="cat"><div class="cat-t">⚖️ Government</div><a data-nav="ssa">SSA — ID Services</a><a data-nav="bizreg">Business Registry</a><a data-nav="web_registry">World Wide Web Registry</a><a data-nav="net99669">99669.net — Site Directory</a><a data-nav="fra">Federal Revenue Auth.</a><a data-wnet-nav="http://www.citypermits.gov.net">Permits & Licenses</a></div>
  <div class="cat"><div class="cat-t">💻 Technology</div><a data-nav="moogle_home">Moogle — Search</a><a data-wnet-nav="http://www.intek-corp.com">Intek Corporation</a><a data-nav="devtools">devtools.net</a><a data-nav="reviewbomber">reviewbomber.net</a><a data-nav="mytube">mytube.net</a><a data-wnet-nav="http://www.driverdump.com">DriverDump</a><a data-wnet-nav="http://www.pixelperfect.net">Web Tutorials</a></div>
  <div class="cat"><div class="cat-t">🗺️ Maps & Directions</div><a data-nav="moogle_maps">Moogle Maps — Hargrove</a><a data-wnet-nav="http://www.weatherchannel2k.com">Weather Forecast</a><a data-nav="net99669">Yellow Pages</a></div>
</div>
</div>
<div style="margin-top:10px;font-size:10px;color:#888;text-align:center;border-top:1px solid #ddd;padding-top:6px;">
  &copy; 2000 Wahoo! Inc. &nbsp;|&nbsp; <a>Privacy</a> &nbsp;|&nbsp; <a>Terms</a> &nbsp;|&nbsp; All activity monitored per Federal Mandate 2000-CR7
</div></div>`,

  bizreg: `<div class="iebody" data-wn-ad-page="bizreg">
<div style="display:flex;gap:8px;align-items:flex-start;">
<aside style="width:120px;flex-shrink:0;"><div data-wnet-ad-slot="left-rail-primary" data-wnet-ad-region="left-rail"></div></aside>
<div style="flex:1;min-width:0;">
<div data-wnet-ad-slot="below-header" data-wnet-ad-region="below-header" style="margin:6px 0;"></div>
<h1 style="font-size:18px;color:#333;font-family:Arial,sans-serif;">📋 Federal Business Registry</h1>
<div style="font-size:10px;color:#666;margin-bottom:8px;">Official Registry — Federal Office of Commercial Systems &nbsp;|&nbsp; Mandate 2000-CR7</div>
<h2 style="margin-bottom:6px;">Register a New Business Entity</h2>
<p style="margin-bottom:8px;font-size:11px;">All business entities operating within federal jurisdiction must register through CorpOS 2000. Applications are processed within three (3) business days.</p>
<table style="width:100%;border-collapse:collapse;margin-bottom:10px;font-size:11px;">
<tr style="background:#0a246a;color:#fff;"><th style="padding:4px 8px;text-align:left;">Entity Type</th><th style="padding:4px 8px;text-align:left;">Filing Fee</th><th style="padding:4px 8px;text-align:left;">Processing</th><th style="padding:4px 8px;text-align:left;">Benefits</th></tr>
<tr style="background:#f0f0f0;"><td style="padding:4px 8px;">Sole Proprietorship</td><td>$200</td><td>3 biz days</td><td>Basic contract access</td></tr>
<tr><td style="padding:4px 8px;">LLC</td><td>$500</td><td>3 biz days</td><td>Full contracts, legal protection</td></tr>
<tr style="background:#f0f0f0;"><td style="padding:4px 8px;">Corporation (Inc.)</td><td>$2,000</td><td>3 biz days</td><td>Stock issuance, IPO eligible</td></tr>
</table>
<div data-wnet-ad-slot="content-break" data-wnet-ad-region="content-break" style="margin:8px 0;"></div>
<div id="bizreg-form" style="border:2px solid #0a246a;padding:10px 14px;background:#f8f8ff;margin-bottom:10px;">
<h3 style="font-size:13px;color:#0a246a;margin-bottom:8px;">Application Form — Registrant Information</h3>
<div id="bizreg-identity" style="background:#eef0f8;border:1px solid #bbb;padding:6px 10px;margin-bottom:10px;font-size:10px;color:#333;"></div>
<h3 style="font-size:12px;color:#0a246a;margin:8px 0 6px;">Business Details</h3>
<div style="display:grid;grid-template-columns:140px 1fr;gap:6px 10px;font-size:11px;align-items:center;">
  <label for="bizreg-trading">Trading Name:</label>
  <input id="bizreg-trading" type="text" maxlength="60" style="height:20px;font-size:11px;padding:0 4px;" placeholder="e.g. CyberConnect Solutions">
  <label for="bizreg-legal">Legal Name:</label>
  <input id="bizreg-legal" type="text" maxlength="80" style="height:20px;font-size:11px;padding:0 4px;" placeholder="Leave blank to use trading name">
  <label for="bizreg-prior-names">Prior Names / DBA:</label>
  <input id="bizreg-prior-names" type="text" maxlength="120" style="height:20px;font-size:11px;padding:0 4px;" placeholder="Any previous business names (if applicable)">
  <label for="bizreg-entity">Entity Type:</label>
  <select id="bizreg-entity" style="height:22px;font-size:11px;">
    <option value="Sole Proprietorship">Sole Proprietorship</option>
    <option value="LLC" selected>LLC</option>
    <option value="Corporation">Corporation (Inc.)</option>
  </select>
  <label for="bizreg-industry">Industry:</label>
  <select id="bizreg-industry" style="height:22px;font-size:11px;">
    <option value="technology">Technology</option>
    <option value="retail">Retail</option>
    <option value="food">Food & Beverage</option>
    <option value="finance">Finance</option>
    <option value="healthcare">Healthcare</option>
    <option value="services">Professional Services</option>
    <option value="media">Media & Entertainment</option>
    <option value="manufacturing">Manufacturing</option>
    <option value="construction">Construction</option>
    <option value="transport">Transportation & Logistics</option>
    <option value="education">Education</option>
    <option value="agriculture">Agriculture</option>
  </select>
  <label for="bizreg-naics">NAICS Subcategory:</label>
  <input id="bizreg-naics" type="text" maxlength="80" style="height:20px;font-size:11px;padding:0 4px;" placeholder="e.g. Custom Computer Programming Services">
  <label for="bizreg-offerings">Products/Services:</label>
  <textarea id="bizreg-offerings" rows="2" maxlength="300" style="font-size:11px;padding:4px;resize:vertical;" placeholder="Brief description of primary goods or services offered"></textarea>
  <label for="bizreg-ein">EIN (if assigned):</label>
  <input id="bizreg-ein" type="text" maxlength="12" style="height:20px;font-size:11px;padding:0 4px;" placeholder="XX-XXXXXXX (optional)">
  <label for="bizreg-address">Physical Address:</label>
  <div style="display:flex;gap:4px;align-items:center;">
    <input id="bizreg-address" type="text" maxlength="120" style="flex:1;height:20px;font-size:11px;padding:0 4px;" placeholder="Search commercial/mixed Hargrove addresses...">
    <input type="hidden" id="bizreg-address-id" value="">
  </div>
  <label for="bizreg-mailing">Mailing Address:</label>
  <input id="bizreg-mailing" type="text" maxlength="120" style="height:20px;font-size:11px;padding:0 4px;" placeholder="Same as physical (leave blank) or enter separately">
  <label for="bizreg-phone">Business Phone:</label>
  <input id="bizreg-phone" type="text" maxlength="20" style="height:20px;font-size:11px;padding:0 4px;" placeholder="559-555-XXXX">
  <label for="bizreg-fax">Fax Number:</label>
  <input id="bizreg-fax" type="text" maxlength="20" style="height:20px;font-size:11px;padding:0 4px;" placeholder="559-555-XXXX (optional)">
  <label for="bizreg-email">Business Email:</label>
  <input id="bizreg-email" type="text" maxlength="60" style="height:20px;font-size:11px;padding:0 4px;" placeholder="contact@yourbusiness.com">
  <label for="bizreg-agent">Registered Agent:</label>
  <input id="bizreg-agent" type="text" maxlength="60" style="height:20px;font-size:11px;padding:0 4px;" placeholder="Legal contact name">
  <label for="bizreg-agent-addr">Agent Address:</label>
  <input id="bizreg-agent-addr" type="text" maxlength="120" style="height:20px;font-size:11px;padding:0 4px;" placeholder="Agent's mailing address">
  <label for="bizreg-employees">Est. Employees:</label>
  <select id="bizreg-employees" style="height:22px;font-size:11px;">
    <option value="1">1 (Owner only)</option>
    <option value="2-5">2 \u2013 5</option>
    <option value="6-25">6 \u2013 25</option>
    <option value="26-100">26 \u2013 100</option>
    <option value="100+">100+</option>
  </select>
  <label for="bizreg-fiscal">Fiscal Year End:</label>
  <select id="bizreg-fiscal" style="height:22px;font-size:11px;">
    <option value="dec">December 31</option>
    <option value="mar">March 31</option>
    <option value="jun">June 30</option>
    <option value="sep">September 30</option>
  </select>
</div>
<div style="margin-top:10px;text-align:right;">
  <button type="button" data-action="bizreg-submit" style="height:26px;padding:0 20px;background:#0a246a;color:white;border:1px outset #3366cc;cursor:pointer;font-size:11px;font-weight:bold;">Submit Application</button>
</div>
</div>
<div id="bizreg-status" style="margin-bottom:10px;"></div>
<div data-wnet-ad-slot="above-footer" data-wnet-ad-region="above-footer" style="margin-top:10px;"></div>
</div>
<aside style="width:120px;flex-shrink:0;"><div data-wnet-ad-slot="right-rail-primary" data-wnet-ad-region="right-rail"></div></aside>
</div>
</div>`,

  stocks: `<div class="iebody">
<div style="display:flex;gap:8px;align-items:flex-start;">
<aside style="width:120px;flex-shrink:0;"><div data-wnet-ad-slot="left-rail-primary" data-wnet-ad-region="left-rail"></div></aside>
<div style="flex:1;min-width:0;">
<div data-wnet-ad-slot="below-header" data-wnet-ad-region="below-header" style="margin:6px 0;"></div>
<h1 style="font-size:18px;color:#006600;font-family:Arial,sans-serif;">📈 WorldNet Market Watch — Year 2000</h1>
<div class="ad">▲ Markets trending UP — Dot-com sector at all-time high.</div>
<h2>Top Movers Today</h2>
<table><tr><th>Ticker</th><th>Company</th><th>Price</th><th>Change</th><th>Volume</th></tr>
<tr><td><b>DOTC</b></td><td>DotCom Inc.</td><td>$124.00</td><td style="color:#006600;">▲ +8.1%</td><td>4.2M</td></tr>
<tr><td><b>MCRP</b></td><td>MicroCorp</td><td>$58.20</td><td style="color:#006600;">▲ +2.3%</td><td>18.1M</td></tr>
<tr><td><b>INTK</b></td><td>Intek Corp.</td><td>$142.50</td><td style="color:#006600;">▲ +1.8%</td><td>12.4M</td></tr>
<tr><td><b>OILX</b></td><td>OilTex Resources</td><td>$32.40</td><td style="color:#cc0000;">▼ -0.5%</td><td>2.1M</td></tr>
<tr><td><b>RPEM</b></td><td>RapidEMart</td><td>$18.30</td><td style="color:#cc0000;">▼ -0.2%</td><td>8.9M</td></tr></table>
<div style="margin-top:8px;">
  <button type="button" data-action="stub" style="height:24px;padding:0 12px;background:#006600;color:white;border:none;cursor:pointer;font-size:11px;">Trade Now</button>
  &nbsp;<button type="button" data-action="stub" style="height:24px;padding:0 12px;background:#0a246a;color:white;border:none;cursor:pointer;font-size:11px;">My Portfolio</button>
</div>
<div data-wnet-ad-slot="above-footer" data-wnet-ad-region="above-footer" style="margin-top:8px;"></div>
</div>
<aside style="width:120px;flex-shrink:0;"><div data-wnet-ad-slot="right-rail-primary" data-wnet-ad-region="right-rail"></div></aside>
</div>
</div>`,

  hiring: `<div class="iebody">
<div style="display:flex;gap:8px;align-items:flex-start;">
<aside style="width:120px;flex-shrink:0;"><div data-wnet-ad-slot="left-rail-primary" data-wnet-ad-region="left-rail"></div></aside>
<div style="flex:1;min-width:0;">
<div data-wnet-ad-slot="below-header" data-wnet-ad-region="below-header" style="margin:6px 0;"></div>
<h1 style="font-size:18px;color:#0a246a;font-family:Arial,sans-serif;">👥 StaffingPlus — Professional Placement</h1>
<h2>Available Positions in Your Area</h2>
<table><tr><th>Role</th><th>Salary/Week</th><th>Skills</th><th>Action</th></tr>
<tr><td>General Assistant</td><td>$380</td><td>General ops</td><td><a data-nav="stub">Hire</a></td></tr>
<tr><td>Accountant</td><td>$650</td><td>Finance +30%</td><td><a data-nav="stub">Hire</a></td></tr>
<tr><td>Sales Rep</td><td>$500 + comm.</td><td>Revenue +15%</td><td><a data-nav="stub">Hire</a></td></tr>
<tr><td>IT Technician</td><td>$720</td><td>PC Speed +40%</td><td><a data-nav="stub">Hire</a></td></tr>
<tr><td>Legal Assistant</td><td>$580</td><td>Legal rolls +1</td><td><a data-nav="stub">Hire</a></td></tr></table>
<div data-wnet-ad-slot="content-break" data-wnet-ad-region="content-break" style="margin-top:8px;"></div>
</div>
<aside style="width:120px;flex-shrink:0;"><div data-wnet-ad-slot="right-rail-primary" data-wnet-ad-region="right-rail"></div></aside>
</div>
</div>`,

  stub: `<div class="iebody">
<h1 style="font-size:18px;color:#666;font-family:Arial,sans-serif;">🚧 Page Under Construction</h1>
<div style="font-size:10px;color:#888;margin-bottom:8px;">WorldNet Explorer — CorpOS 2000</div>
<p style="font-size:12px;margin-bottom:10px;">This site is currently under construction or not yet available on WorldNet.</p>
<div style="padding:8px;background:#fff8f0;border:1px solid #cc9900;font-size:11px;">
  ⚠️ The page you requested could not be found. It may have been moved, renamed, or is not yet indexed in the WorldNet directory.
</div>
<div style="margin-top:10px;font-size:11px;"><a data-nav="home">← Return to Wahoo! Home</a></div>
</div>`,

  ssa: `<div class="iebody">
<div style="display:flex;gap:8px;align-items:flex-start;">
<aside style="width:120px;flex-shrink:0;"><div data-wnet-ad-slot="left-rail-primary" data-wnet-ad-region="left-rail"></div></aside>
<div style="flex:1;min-width:0;">
<div data-wnet-ad-slot="below-header" data-wnet-ad-region="below-header" style="margin:6px 0;"></div>
<h1 style="font-size:18px;color:#333;font-family:Arial,sans-serif;">🏛️ Social Security Administration</h1>
<div style="font-size:10px;color:#666;margin-bottom:8px;">Federal Identity Services &nbsp;|&nbsp; CorpOS Integrated</div>
<h2>Available Services</h2>
<table><tr><th>Service</th><th>Fee</th><th>Processing</th></tr>
<tr><td>Name Change Request</td><td>$150</td><td>3 weeks (subject to approval)</td></tr>
<tr><td>Address Update</td><td>Free</td><td>Immediate</td></tr>
<tr><td>SS Card Replacement</td><td>$25</td><td>5-7 business days</td></tr>
<tr><td>Identity Verification</td><td>Free</td><td>Instant</td></tr></table>
<div style="margin-top:8px;padding:6px;background:#fff8f0;border:1px solid #cc9900;font-size:11px;">
⚠️ Name change requests are subject to federal review. Your current standing with regulators may affect the outcome. Filing fee is non-refundable.
</div>
<div style="margin-top:8px;"><button type="button" data-action="ssa-name-change" style="height:24px;padding:0 16px;background:#0a246a;color:white;border:none;cursor:pointer;font-size:11px;">File Name Change Request</button></div>
<h2 style="margin-top:14px;">Address Update</h2>
<div style="border:2px solid #0a246a;padding:10px 14px;background:#f8f8ff;margin-bottom:10px;">
<p style="font-size:10px;color:#555;margin-bottom:6px;">Update your residential address on file with the Social Security Administration.</p>
<div id="ssa-addr-current" style="font-size:11px;color:#333;margin-bottom:6px;"></div>
<div style="display:flex;gap:4px;align-items:center;">
  <input type="text" id="ssa-addr" maxlength="120" style="flex:1;height:20px;font-size:11px;padding:0 4px;" placeholder="Type to search Hargrove addresses...">
  <input type="hidden" id="ssa-addr-id" value="">
  <button type="button" data-action="ssa-addr-lookup" style="font-size:10px;height:20px;padding:0 6px;cursor:pointer;">Lookup\u2026</button>
</div>
<div id="ssa-addr-picker" style="display:none;margin-top:4px;"></div>
<div style="margin-top:8px;text-align:right;">
  <button type="button" data-action="ssa-addr-update" style="height:24px;padding:0 16px;background:#0a246a;color:white;border:none;cursor:pointer;font-size:11px;">Update Address</button>
</div>
</div>
<div data-wnet-ad-slot="above-footer" data-wnet-ad-region="above-footer" style="margin-top:8px;"></div>
</div>
<aside style="width:120px;flex-shrink:0;"><div data-wnet-ad-slot="right-rail-primary" data-wnet-ad-region="right-rail"></div></aside>
</div>
</div>`,

  devtools: `<div class="iebody" data-wn-ad-page="devtools">
<div class="ntbar">◆ OFFICIAL CORPOS SOFTWARE CHANNEL &nbsp;|&nbsp; ◆ DIGITAL DELIVERY &nbsp;|&nbsp; ◆ DEVTOOLS.NET CERTIFIED</div>
<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:8px;">
  <div>
    <div style="font-size:30px;font-weight:900;color:#0a246a;font-family:Verdana,Arial,sans-serif;letter-spacing:-1px;">devtools.net</div>
    <div style="font-size:11px;color:#666;">Native CorpOS application downloads for builders, editors, and administrators.</div>
  </div>
  <div style="font-size:10px;color:#666;text-align:right;">Trusted host &nbsp;|&nbsp; WorldNet software mirror</div>
</div>
<div style="display:flex;gap:8px;align-items:flex-start;">
<aside style="width:120px;flex-shrink:0;">
<div data-wnet-ad-slot="left-rail-primary" data-wnet-ad-region="left-rail"></div>
</aside>
<div style="flex:1;min-width:0;">
<div data-wnet-ad-slot="below-header" data-wnet-ad-region="below-header" style="margin:6px 0;"></div>
<div style="border:1px solid #9aa7c6;background:#f3f7ff;padding:8px;margin-bottom:10px;font-size:11px;line-height:1.5;">
  Purchase certified CorpOS packages (priced per title). Payment posts immediately to your primary FNCB checking account when you confirm; download and install follow on the simulated timeline. Installed applications appear on the desktop when setup completes.
</div>
<div data-wnet-ad-slot="content-break" data-wnet-ad-region="content-break" style="margin:8px 0;"></div>
<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;">
  <div data-devtools-app="media-player"></div>
  <div data-devtools-app="admin-web"></div>
  <div data-devtools-app="webex-publisher"></div>
  <div data-devtools-app="admin-company"></div>
  <div data-devtools-app="admin-npc"></div>
  <div data-devtools-app="admin-gov"></div>
  <div data-devtools-app="admin-axis"></div>
</div>
<div style="margin-top:14px;padding-top:6px;border-top:1px solid #ddd;font-size:9px;color:#ccc;">
  <span style="color:#bbb;">devtools.net &copy; 2000 — </span>
  <a data-nav="home" style="color:#aaa;">Home</a> &nbsp;|&nbsp;
  <a data-nav="web_registry" style="color:#aaa;">Registry</a> &nbsp;|&nbsp;
  <a href="#" data-nav="backrooms" style="color:#bbb;text-decoration:none;" title="...">other channels</a>
</div>
</div>
<aside style="width:120px;flex-shrink:0;">
<div data-wnet-ad-slot="right-rail-primary" data-wnet-ad-region="right-rail"></div>
<div data-wnet-ad-slot="right-rail-secondary" data-wnet-ad-region="right-rail"></div>
</aside>
</div>
</div>`,

  reviewbomber: `<div class="iebody rb-page" data-wn-ad-page="reviewbomber">
<div class="ntbar">◆ HOT LISTINGS &nbsp;|&nbsp; ◆ VIRAL BUZZ &nbsp;|&nbsp; ◆ CONSUMER OPINION — entertainment use only</div>
<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:8px;flex-wrap:wrap;">
  <div>
    <div style="font-size:26px;font-weight:900;color:#8b0000;font-family:Verdana,Arial,sans-serif;letter-spacing:-1px;">Review Bomber</div>
    <div style="font-size:11px;color:#666;">reviewbomber.net — tell the world what you bought (and what you regret).</div>
  </div>
  <div style="font-size:10px;color:#666;text-align:right;">Est. 1999 &nbsp;|&nbsp; Not affiliated with any retailer</div>
</div>
<div style="display:flex;gap:8px;align-items:flex-start;">
<aside style="width:120px;flex-shrink:0;">
<div data-wnet-ad-slot="left-rail-primary" data-wnet-ad-region="left-rail"></div>
<div data-wnet-ad-slot="left-rail-secondary" data-wnet-ad-region="left-rail"></div>
</aside>
<div style="flex:1;min-width:0;">
<div data-wnet-ad-slot="below-header" data-wnet-ad-region="below-header" style="margin:6px 0;"></div>
<div style="border:2px solid;border-color:#fff #404040 #404040 #fff;background:#f0f0f0;padding:8px;margin-bottom:10px;font-size:11px;line-height:1.45;">
  <b>Welcome.</b> Posts are user-submitted. Heat scores are approximate. CorpOS is not responsible for gastrointestinal choices.
</div>
<div id="rb-root" data-wnet-reviewbomber="1"></div>
<div data-wnet-ad-slot="above-footer" data-wnet-ad-region="above-footer" style="margin-top:10px;"></div>
</div>
<aside style="width:120px;flex-shrink:0;">
<div data-wnet-ad-slot="right-rail-primary" data-wnet-ad-region="right-rail"></div>
<div data-wnet-ad-slot="right-rail-secondary" data-wnet-ad-region="right-rail"></div>
</aside>
</div>
<div style="margin-top:8px;font-size:10px;color:#888;text-align:center;">
  <a data-nav="home">Wahoo! Home</a> &nbsp;|&nbsp; <a data-nav="web_registry">WWW Registry</a>
</div>
</div>`,

  yourspace: `<div class="iebody ys-page" data-wn-ad-page="yourspace">
<div class="ys-glitter-bar">★ ☆ yourspace.net ☆ ★ a place for friends &nbsp;|&nbsp; CorpOS-monitored for your safety</div>
<div style="display:flex;gap:8px;align-items:flex-start;">
<aside style="width:120px;flex-shrink:0;">
<div data-wnet-ad-slot="left-rail-primary" data-wnet-ad-region="left-rail"></div>
</aside>
<div style="flex:1;min-width:0;">
<div data-wnet-ad-slot="below-header" data-wnet-ad-region="below-header" style="margin:6px 0;"></div>
<div class="ys-header">
  <span class="ys-logo">yourspace</span>
  <span class="ys-tag">Where everyone™ is someone's Top 8</span>
</div>
<div id="ys-root" data-wnet-yourspace="1"></div>
<p style="font-size:10px;color:#666;margin-top:10px;"><a data-nav="home">Wahoo! Home</a> &nbsp;|&nbsp; <a data-nav="reviewbomber">Review Bomber</a> &nbsp;|&nbsp; <a data-nav="mytube">MyTube</a> &nbsp;|&nbsp; <a data-nav="devtools">devtools.net</a></p>
</div>
<aside style="width:120px;flex-shrink:0;">
<div data-wnet-ad-slot="right-rail-primary" data-wnet-ad-region="right-rail"></div>
<div data-wnet-ad-slot="right-rail-secondary" data-wnet-ad-region="right-rail"></div>
</aside>
</div>
</div>`,

  mytube: `<div class="iebody mt-page" data-wn-ad-page="mytube">
<div style="display:flex;gap:8px;align-items:flex-start;">
<aside style="width:120px;flex-shrink:0;">
<div data-wnet-ad-slot="left-rail-primary" data-wnet-ad-region="left-rail"></div>
</aside>
<div style="flex:1;min-width:0;">
<div data-wnet-ad-slot="below-header" data-wnet-ad-region="below-header" style="margin:6px 0;"></div>
<div id="mt-root" data-wnet-mytube="1"></div>
<p style="font-size:10px;color:#666;margin-top:10px;"><a data-nav="home">Wahoo! Home</a> &nbsp;|&nbsp; <a data-nav="yourspace">yourspace.net</a> &nbsp;|&nbsp; <a data-nav="reviewbomber">Review Bomber</a></p>
</div>
<aside style="width:120px;flex-shrink:0;">
<div data-wnet-ad-slot="right-rail-primary" data-wnet-ad-region="right-rail"></div>
<div data-wnet-ad-slot="right-rail-secondary" data-wnet-ad-region="right-rail"></div>
</aside>
</div>
</div>`,

  market_pulse: `<div class="iebody" data-wn-ad-page="market_pulse">
<div style="text-align:center;margin-bottom:8px;">
<div style="font-family:'Courier New',monospace;font-size:22px;font-weight:bold;color:#00cc00;background:#0a0a0a;padding:8px;letter-spacing:2px;">MARKET PULSE</div>
<div style="font-size:10px;color:#00aa00;background:#0a0a0a;padding:2px 8px 6px;font-family:'Courier New',monospace;">HARGROVE COMMERCE ANALYTICS — LIVE DATA FEED</div>
</div>
<div id="market-pulse-root"></div>
<p style="font-size:10px;color:#666;margin-top:10px;font-family:'Courier New',monospace;"><a data-nav="home">Wahoo! Home</a> &nbsp;|&nbsp; <a data-nav="warehouse">WhereAllThingsGo</a> &nbsp;|&nbsp; <a data-nav="bizreg">Business Registry</a></p>
</div>`,

  warehouse: `<div class="iebody" data-wn-ad-page="warehouse">
<div style="display:flex;gap:8px;align-items:flex-start;">
<div style="flex:1;min-width:0;">
<div style="text-align:center;margin-bottom:10px;">
<div style="font-size:26px;font-weight:bold;color:#663300;font-family:Georgia,serif;">WhereAllThingsGo.net</div>
<div style="font-size:11px;color:#555;margin-top:2px;">Hargrove's Premier Self-Storage &amp; Liquidation Outlet</div>
<div style="font-size:9px;color:#888;margin-top:2px;">1400 Warehouse Row, Southside Industrial — Hargrove, CA 94526</div>
</div>
<hr style="border:none;border-top:2px solid #c0a880;">
<div id="warehouse-root"></div>
<p style="font-size:10px;color:#666;margin-top:10px;"><a data-nav="home">Wahoo! Home</a> &nbsp;|&nbsp; <a data-nav="moogle_maps">Moogle Maps</a> &nbsp;|&nbsp; <a data-nav="bizreg">Business Registry</a></p>
</div>
<aside style="width:120px;flex-shrink:0;">
<div data-wnet-ad-slot="right-rail-primary" data-wnet-ad-region="right-rail"></div>
</aside>
</div>
</div>`,

  backrooms: `<div class="iebody" style="background:#080808;color:#00ff41;font-family:'Courier New',monospace;font-size:11px;padding:0;min-height:100%;">
<div style="background:#000;border-bottom:1px solid #003300;padding:4px 10px;">
  <span style="color:#003300;font-size:9px;letter-spacing:3px;">/// ENCRYPTED CHANNEL — TRACE ROUTE MASKED — NODE 7F.A2.0C ///</span>
</div>
<div style="padding:12px 16px;">
<pre style="color:#00ff41;font-size:18px;font-weight:bold;line-height:1.1;margin:0 0 4px;">
 ____             _                                    _     _    
| __ )  __ _  ___| | ___ __ ___   ___  _ __ ___  ___  | |__ | | __
|  _ \\ / _\` |/ __| |/ / '__/ _ \\ / _ \\| '_ \` _ \\/ __| | '_ \\| |/ /
| |_) | (_| | (__|   &lt;| | | (_) | (_) | | | | | \\__ \\_| | | |   &lt; 
|____/ \\__,_|\\___|_|\\_\\_|  \\___/ \\___/|_| |_| |_|___(_)_| |_|_|\\_\\
</pre>
<div style="color:#006600;font-size:9px;margin-bottom:12px;letter-spacing:2px;">UNDERGROUND SOFTWARE COLLECTIVE — EST. 1997 — .hck DOMAIN</div>
<div style="border:1px solid #003300;background:#0a0a0a;padding:8px;margin-bottom:10px;">
  <span style="color:#ff0000;font-size:10px;font-weight:bold;">⚠ NOTICE:</span>
  <span style="color:#888;font-size:10px;"> This site operates outside CorpOS jurisdiction. Software distributed here is NOT verified by any corporate authority. All downloads are final. All transactions are untraceable. By proceeding you accept full liability.</span>
</div>
<div style="color:#006600;font-size:9px;border-bottom:1px solid #001a00;padding-bottom:4px;margin-bottom:8px;letter-spacing:2px;">▓▓ AVAILABLE TOOLS ▓▓</div>
<div style="display:grid;grid-template-columns:1fr;gap:8px;max-width:640px;">
  <div data-backrooms-app="webexploiter"></div>
</div>
<div style="margin-top:16px;border-top:1px solid #001a00;padding-top:8px;">
  <div style="color:#003300;font-size:9px;letter-spacing:1px;margin-bottom:6px;">▓▓ COMMUNITY BOARD ▓▓</div>
  <div style="background:#0a0a0a;border:1px solid #002200;padding:6px;font-size:10px;">
    <div style="color:#005500;margin-bottom:4px;">[xXd4rkm4tterXx] anyone tested the new exploiter on gov sites? asking for a friend</div>
    <div style="color:#004400;margin-bottom:4px;">[zeroc00l_99] works clean. took down a corp site in 4 hits. security was trash</div>
    <div style="color:#005500;margin-bottom:4px;">[gh0stpr0t0c0l] careful with notoriety. the feds are watching everything post-mandate</div>
    <div style="color:#004400;margin-bottom:4px;">[n3tph4nt0m] new version drops next month. full stealth mode. $0 notoriety.</div>
    <div style="color:#003300;margin-bottom:4px;">[sys_null] ^^^ scam. nobody has stealth working yet. stick to v1.0</div>
    <div style="color:#005500;margin-bottom:4px;">[packet_witch] just use it smart. hit traffic first, drain security, then takedown. ez.</div>
    <div style="color:#004400;">[cr4sh_0v3rrid3] feds got no jurisdiction on .hck domains. we're ghosts out here</div>
  </div>
</div>
<div style="margin-top:16px;border-top:1px solid #001a00;padding-top:8px;">
  <div style="color:#003300;font-size:9px;letter-spacing:1px;margin-bottom:6px;">▓▓ SITE STATS ▓▓</div>
  <div style="font-size:9px;color:#004400;">
    Active nodes: 1,247 &nbsp;|&nbsp; Tools distributed: 8,914 &nbsp;|&nbsp; Uptime: 99.7% &nbsp;|&nbsp; Last raid survived: Dec 12 1999<br>
    Mirror: backrooms2.hck (offline) &nbsp;|&nbsp; IRC: #backrooms @ irc.undernet.hck<br>
    PGP key: 0xDEAD BEEF 1337 C0DE
  </div>
</div>
<div style="margin-top:12px;font-size:9px;color:#002200;letter-spacing:1px;">
  <a data-nav="home" style="color:#006600;">[ EXIT TO CLEARNET ]</a> &nbsp;
  <span style="color:#001a00;">|</span> &nbsp;
  <span style="color:#003300;">backrooms.hck — we were never here</span>
</div>
</div>
</div>`
};
