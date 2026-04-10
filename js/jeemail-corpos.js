/**
 * CorpOS / JeeMail — welcome packet email and helpers.
 */
import { getGameEpochMs, getState } from './gameState.js';
import { getSessionState, patchSession } from './sessionState.js';
import { ActorDB } from '../engine/ActorDB.js';
import { PeekManager } from './peek-manager.js';

const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/** Sim calendar date string e.g. "January 1, 2000". */
export function formatSimDateLong() {
  const ms = getGameEpochMs() + (getState().sim?.elapsedMs ?? 0);
  const d = new Date(ms);
  return `${MONTHS_LONG[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

/** Minimal non-cryptographic hash — avoids plain-text password in session JSON. */
export function simpleHash(str) {
  let hash = 0;
  const s = String(str);
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash) + s.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString(16);
}

function operatorIdFallback() {
  return `00-2000-${Math.floor(Math.random() * 9000) + 1000}`;
}

export function buildWelcomePacketHTML(playerName, username, emailAddress, operatorId, registeredDate) {
  return `
<div style="font-family: 'Times New Roman', Times, serif; font-size: 12px; color: #111; max-width: 600px; background: #fff; padding: 0;">

  <table width="100%" cellpadding="0" cellspacing="0" style="border-bottom: 3px solid #0a246a; margin-bottom: 16px;">
    <tr>
      <td style="padding: 12px 0 10px 0;">
        <div style="font-family: Arial, sans-serif; font-size: 9px; color: #666; letter-spacing: 2px; text-transform: uppercase;">United States Federal Government</div>
        <div style="font-family: 'Times New Roman', serif; font-size: 18px; font-weight: bold; color: #0a246a; margin: 2px 0;">Federal Office of Commercial Systems</div>
        <div style="font-family: Arial, sans-serif; font-size: 9px; color: #666;">Division of Operator Registration &amp; Compliance &middot; Washington, D.C. 20001</div>
      </td>
      <td align="right" style="vertical-align: top; padding-top: 8px;">
        <div style="font-family: 'Courier New', monospace; font-size: 10px; color: #333; text-align: right;">
          <div>FOCS-ORP-2000-01-01</div>
          <div>${registeredDate}</div>
          <div style="color: #0a246a; font-weight: bold;">CONFIDENTIAL</div>
        </div>
      </td>
    </tr>
  </table>

  <div style="font-family: Arial, sans-serif; font-size: 11px; margin-bottom: 16px;">
    <strong>RE:</strong> CorpOS 2000 Operator Activation &mdash; Welcome Packet &amp; Mandatory Disclosures<br>
    <strong>TO:</strong> ${playerName}<br>
    <strong>OPERATOR ID:</strong> <span style="font-family: 'Courier New', monospace;">${operatorId}</span><br>
    <strong>REGISTERED EMAIL:</strong> <span style="font-family: 'Courier New', monospace;">${emailAddress}</span>
  </div>

  <hr style="border: none; border-top: 1px solid #ccc; margin-bottom: 16px;">

  <p>Dear ${playerName},</p>

  <p>
    Congratulations on the successful activation of your CorpOS 2000 operator account. This communication serves as your official onboarding packet and is issued pursuant to <strong>Federal Mandate 2000-CR7</strong>, Section 3.1 &mdash; <em>Operator Notification and Disclosure Requirements</em>.
  </p>

  <p>
    Your operator registration has been recorded in the Federal Business Registry and is now active. All commercial activity conducted through CorpOS 2000 is subject to continuous monitoring in accordance with the Mandate. Please review the enclosed disclosures carefully.
  </p>

  <div style="background: #f4f6ff; border-left: 3px solid #0a246a; padding: 10px 14px; margin: 16px 0;">
    <div style="font-family: Arial, sans-serif; font-size: 10px; font-weight: bold; color: #0a246a; letter-spacing: 1px; text-transform: uppercase; margin-bottom: 6px;">Section 1 &mdash; Your Operator Account</div>
    <table width="100%" cellpadding="3" cellspacing="0" style="font-family: 'Courier New', monospace; font-size: 11px;">
      <tr><td style="color: #666; width: 45%;">Full Legal Name</td><td style="color: #111; font-weight: bold;">${playerName}</td></tr>
      <tr style="background:#eef0ff;"><td style="color: #666;">Operator ID</td><td style="color: #111; font-weight: bold;">${operatorId}</td></tr>
      <tr><td style="color: #666;">JeeMail Address</td><td style="color: #111;">${emailAddress}</td></tr>
      <tr style="background:#eef0ff;"><td style="color: #666;">Account Status</td><td style="color: #006600; font-weight: bold;">ACTIVE &mdash; COMPLIANT</td></tr>
      <tr><td style="color: #666;">Registration Date</td><td style="color: #111;">${registeredDate}</td></tr>
      <tr style="background:#eef0ff;"><td style="color: #666;">Compliance Mode</td><td style="color: #111;">Federal Mandate 2000-CR7 &middot; ENABLED</td></tr>
      <tr><td style="color: #666;">Activity Logging</td><td style="color: #cc6600; font-weight: bold;">ON &mdash; All sessions recorded</td></tr>
    </table>
  </div>

  <div style="font-family: Arial, sans-serif; font-size: 11px; font-weight: bold; color: #0a246a; margin: 16px 0 6px;">Mandatory Disclosures &mdash; Federal Mandate 2000-CR7</div>

  <p>
    CorpOS 2000 operates under full authority of Federal Mandate 2000-CR7, enacted January 1, 2000. The Mandate was established in direct response to the <strong>RapidGate Incident of 1997-1999</strong>, during which the commercial enterprise RapidEMart, Inc. engaged in the unauthorized collection and sale of behavioral and financial profiles of an estimated 40 to 60 million American consumers.
  </p>

  <p>
    As no applicable federal statute prohibited the conduct at the time, the principals of RapidEMart, Inc. faced no criminal liability. In response, Congress enacted the Commercial Systems Oversight and Registration Act (2000), from which Mandate 2000-CR7 derives its authority.
  </p>

  <p style="font-family: Arial, sans-serif; font-size: 10px; color: #333; background: #fff8e8; border: 1px solid #cc9900; padding: 8px 10px;">
    &#9888; <strong>NOTICE:</strong> By activating your CorpOS 2000 operator account, you have acknowledged and accepted all terms outlined in Federal Mandate 2000-CR7 in full. This acknowledgment is legally binding and was recorded at the time of system login. A copy of the Mandate is available at the link below.
  </p>

  <div style="background: #f4f6ff; border: 1px solid #d0d8f0; padding: 10px 14px; margin: 16px 0;">
    <div style="font-family: Arial, sans-serif; font-size: 10px; font-weight: bold; color: #0a246a; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 1px;">Official Resources &mdash; Bookmark These Links</div>
    <table width="100%" cellpadding="4" cellspacing="0" style="font-size: 11px;">
      <tr>
        <td style="width: 60%;"><a href="http://www.corpos.gov.net/operators" style="color: #0000cc; text-decoration: underline;">http://www.corpos.gov.net/operators</a></td>
        <td style="color: #555; font-size: 10px;">CorpOS Operator Portal &mdash; onboarding video, guides, support</td>
      </tr>
      <tr style="background: #eef0ff;">
        <td><a href="http://www.focs.gov.net/mandate/2000-cr7" style="color: #0000cc; text-decoration: underline;">http://www.focs.gov.net/mandate/2000-cr7</a></td>
        <td style="color: #555; font-size: 10px;">Federal Mandate 2000-CR7 &mdash; full legislative text, all 8 Titles</td>
      </tr>
      <tr>
        <td><a href="http://www.fedbizreg.gov/register" style="color: #0000cc; text-decoration: underline;">http://www.fedbizreg.gov/register</a></td>
        <td style="color: #555; font-size: 10px;">Federal Business Registry &mdash; verify your registration status</td>
      </tr>
      <tr style="background: #eef0ff;">
        <td><a href="http://www.fra.gov.net/compliance" style="color: #0000cc; text-decoration: underline;">http://www.fra.gov.net/compliance</a></td>
        <td style="color: #555; font-size: 10px;">Federal Revenue Authority &mdash; tax obligations for registered operators</td>
      </tr>
      <tr>
        <td><a href="http://www.corpos.gov.net/support" style="color: #0000cc; text-decoration: underline;">http://www.corpos.gov.net/support</a></td>
        <td style="color: #555; font-size: 10px;">Technical support &mdash; account issues, compliance questions</td>
      </tr>
    </table>
  </div>

  <div style="font-family: Arial, sans-serif; font-size: 11px; font-weight: bold; color: #0a246a; margin: 16px 0 6px;">Recommended Next Steps</div>

  <p>The Federal Office of Commercial Systems recommends all new operators complete the following within their first 30 days of operation:</p>

  <table width="100%" cellpadding="5" cellspacing="0" style="font-size: 11px; border-collapse: collapse;">
    <tr style="background: #0a246a;">
      <td style="color: #fff; font-family: Arial; font-size: 10px; padding: 4px 8px; width: 32px;">#</td>
      <td style="color: #fff; font-family: Arial; font-size: 10px; padding: 4px 8px;">Action</td>
      <td style="color: #fff; font-family: Arial; font-size: 10px; padding: 4px 8px;">Priority</td>
    </tr>
    <tr>
      <td style="border: 1px solid #ddd; padding: 5px 8px; text-align: center;">1</td>
      <td style="border: 1px solid #ddd; padding: 5px 8px;">Watch the CorpOS Operator Orientation Video at corpos.gov.net/operators</td>
      <td style="border: 1px solid #ddd; padding: 5px 8px; color: #cc0000; font-weight: bold;">REQUIRED</td>
    </tr>
    <tr style="background: #f9f9ff;">
      <td style="border: 1px solid #ddd; padding: 5px 8px; text-align: center;">2</td>
      <td style="border: 1px solid #ddd; padding: 5px 8px;">Register your first business entity at fedbizreg.gov.net</td>
      <td style="border: 1px solid #ddd; padding: 5px 8px; color: #cc6600; font-weight: bold;">RECOMMENDED</td>
    </tr>
    <tr>
      <td style="border: 1px solid #ddd; padding: 5px 8px; text-align: center;">3</td>
      <td style="border: 1px solid #ddd; padding: 5px 8px;">Open a business banking account at an approved federal institution</td>
      <td style="border: 1px solid #ddd; padding: 5px 8px; color: #cc6600; font-weight: bold;">RECOMMENDED</td>
    </tr>
    <tr style="background: #f9f9ff;">
      <td style="border: 1px solid #ddd; padding: 5px 8px; text-align: center;">4</td>
      <td style="border: 1px solid #ddd; padding: 5px 8px;">Review your rights and obligations under Mandate 2000-CR7 Title IV</td>
      <td style="border: 1px solid #ddd; padding: 5px 8px; color: #006600;">ADVISORY</td>
    </tr>
    <tr>
      <td style="border: 1px solid #ddd; padding: 5px 8px; text-align: center;">5</td>
      <td style="border: 1px solid #ddd; padding: 5px 8px;">Familiarize yourself with the CorpOS Compliance Health Indicator in your Corporate Profile</td>
      <td style="border: 1px solid #ddd; padding: 5px 8px; color: #006600;">ADVISORY</td>
    </tr>
  </table>

  <p style="margin-top: 20px;">
    Operators who complete onboarding demonstrate significantly lower rates of compliance irregularities in their first operational quarter. The Federal Office of Commercial Systems wishes you a productive and compliant year of operation.
  </p>

  <p>
    If you have questions regarding your account, your operator rights, or the provisions of Federal Mandate 2000-CR7, please contact your assigned CorpOS Account Manager or visit the support portal linked above.
  </p>

  <p>Do not reply to this message. This address is not monitored.</p>

  <div style="border-top: 1px solid #ccc; margin-top: 20px; padding-top: 14px; font-size: 11px;">
    <div style="font-weight: bold;">Gerald P. Whitmore</div>
    <div style="color: #555;">Director, Office of Operator Registration &amp; Compliance</div>
    <div style="color: #555;">Federal Office of Commercial Systems</div>
    <div style="color: #555;">Washington, D.C. 20001</div>
    <div style="margin-top: 6px; font-family: 'Courier New', monospace; font-size: 10px; color: #888;">
      Document Reference: FOCS-ORP-2000-CR7-WELCOME<br>
      Issued under authority of: Federal Mandate 2000-CR7<br>
      This communication is for official use only.
    </div>
  </div>

  <div style="background: #0a246a; color: #a6b5e7; font-family: Arial, sans-serif; font-size: 9px; padding: 6px 10px; margin-top: 20px; letter-spacing: 1px;">
    FEDERAL OFFICE OF COMMERCIAL SYSTEMS &middot; CORPOS 2000 &middot; ALL COMMUNICATIONS MONITORED PER FEDERAL MANDATE 2000-CR7
  </div>

</div>
  `.trim();
}

/**
 * Injects the official welcome email into the account inbox and shows a peek.
 * @param {string} fullEmail full address user@jeemail.net (account key)
 * @param {string} localPart username local part (before @)
 */
export function deliverCorpOSWelcomePacket(fullEmail, localPart) {
  const playerActor = ActorDB.getRaw('PLAYER_PRIMARY');
  const playerName = playerActor?.full_legal_name || localPart;
  const operatorId = operatorIdFallback();
  const registeredOn = formatSimDateLong();

  const plainStub =
    'Welcome to CorpOS 2000. This email contains your official Operator Onboarding Packet. Open the message to view the full document.';

  const id = `SYS_WELCOME_${Date.now()}`;
  const email = {
    id,
    from: 'no-reply@corpos.gov.net',
    fromName: 'Federal Office of Commercial Systems',
    to: fullEmail,
    subject: 'Welcome to CorpOS 2000 — Operator Onboarding Packet',
    date: registeredOn,
    isRead: false,
    isSystem: true,
    body: plainStub,
    bodyHtml: buildWelcomePacketHTML(playerName, localPart, fullEmail, operatorId, registeredOn)
  };

  patchSession((s) => {
    const acc = s.jeemail?.accounts?.[fullEmail];
    if (acc) {
      if (!Array.isArray(acc.inbox)) acc.inbox = [];
      acc.inbox.unshift(email);
    }
  });

  PeekManager.show({
    sender: 'Federal Office of Commercial Systems',
    preview: 'Welcome to CorpOS 2000 — Operator Onboarding Packet',
    type: 'email',
    targetId: id,
    icon: '✉'
  });
}
