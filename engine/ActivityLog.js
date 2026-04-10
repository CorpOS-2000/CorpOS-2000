/**
 * CorpOS Activity Log — persistent AUDITLOG.TXT in VirtualFS (Federal Mandate 2000-CR7).
 */
import { getGameEpochMs, getState, patchState } from '../js/gameState.js';
import { getSessionState, patchSession } from '../js/sessionState.js';
import { PeekManager } from '../js/peek-manager.js';

export const LOG_PATH_NODE_ID = 'system-auditlog';
export const LOG_PATH_DISPLAY = 'C:\\CORPOS\\SYSTEM\\AUDITLOG.TXT';
export const LOG_VFS_PARENT_ID = 'folder-system';

export function formatLogTimestamp(simMs) {
  const ms = getGameEpochMs() + (Number(simMs) || 0);
  const d = new Date(ms);
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const yy = d.getUTCFullYear();
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mi = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${mm}/${dd}/${yy} ${hh}:${mi}:${ss} UTC`;
}

export const ActivityLog = {
  _entries: [],
  _sealed: false,
  _tampered: false,
  _agentCopy: '',

  init() {
    const st = getState();
    const vfsEntry = st.virtualFs?.entries?.find((e) => e.id === LOG_PATH_NODE_ID);
    if (vfsEntry?.content) {
      this._entries = this._parseEntries(vfsEntry.content);
    }
    if (!vfsEntry) {
      this._persist();
    }
    if (typeof window !== 'undefined') window.ActivityLog = this;
  },

  log(type, detail, flags = {}) {
    const simMs = getState().sim?.elapsedMs ?? 0;
    const simDate = formatLogTimestamp(simMs);
    const entry = {
      ts: simDate,
      type: String(type || 'EVENT').toUpperCase(),
      detail: String(detail || ''),
      flag: flags.suspicious ? 'FLAGGED' : flags.notable ? 'NOTABLE' : ''
    };
    this._entries.push(entry);
    this._persist();
  },

  _persist() {
    const content = this._render();
    patchState((st) => {
      if (!st.virtualFs) st.virtualFs = { entries: [], nextSeq: 1 };
      if (!Array.isArray(st.virtualFs.entries)) st.virtualFs.entries = [];
      const idx = st.virtualFs.entries.findIndex((e) => e.id === LOG_PATH_NODE_ID);
      const prev = st.virtualFs.entries[idx];
      const row = {
        id: LOG_PATH_NODE_ID,
        parentId: LOG_VFS_PARENT_ID,
        name: 'AUDITLOG.TXT',
        kind: 'file',
        typeLabel: 'System Log',
        size: content.length,
        content,
        readonly: false,
        system: true,
        description: 'Federal compliance activity log (Mandate 2000-CR7 §4.1).',
        created: prev?.created || new Date().toISOString(),
        modified: new Date().toISOString()
      };
      if (idx >= 0) st.virtualFs.entries[idx] = row;
      else st.virtualFs.entries.push(row);
      return st;
    });
  },

  _render() {
    const p = getState().player || {};
    const opId = p.operatorId || p.username || 'UNREGISTERED';
    const header = [
      `================================================================`,
      `  CORPOS 2000 — OPERATOR ACTIVITY LOG`,
      `  Federal Mandate 2000-CR7 — Section 4.1 Compliance Record`,
      `  Operator ID: ${opId}`,
      `  Session / Display: ${p.displayName || 'UNKNOWN'}`,
      `  Virtual Path: ${LOG_PATH_DISPLAY}`,
      `  Log Version: 1.0.0`,
      `================================================================`,
      ``
    ].join('\n');

    const body = this._entries
      .map((e) => {
        const flag = e.flag ? ` | ${e.flag}` : '';
        return `[${e.ts}] ${e.type} | ${e.detail}${flag}`;
      })
      .join('\n');

    const footer = [
      ``,
      `================================================================`,
      `  END OF LOG — ${this._entries.length} entries`,
      `  This log is monitored per Federal Mandate 2000-CR7 Section 4.`,
      `  Tampering with this file is a Class II Compliance Violation.`,
      `================================================================`
    ].join('\n');

    return header + body + footer;
  },

  _parseEntries(content) {
    const lines = String(content || '')
      .split('\n')
      .filter((l) => l.startsWith('[') && l.includes(']') && l.includes(' | '));
    const out = [];
    for (const line of lines) {
      const m = line.match(/^\[([^\]]+)\]\s*([^|]+?)\s*\|\s*(.*?)(?:\s*\|\s*(FLAGGED|NOTABLE))?$/);
      if (!m) continue;
      const [, ts, type, detail, flag] = m;
      out.push({
        ts: ts.trim(),
        type: type.trim(),
        detail: String(detail || '').trim(),
        flag: flag || ''
      });
    }
    return out;
  },

  /** Canonical text from in-memory entries (expected live file content if only ActivityLog writes). */
  expectedContent() {
    return this._render();
  },

  agentCopyLog() {
    this._agentCopy = this._render();
    this._sealed = true;
  },

  agentAnalyzeLog() {
    if (!this._agentCopy) {
      return {
        suspicious: [],
        notable: [],
        totalEntries: 0,
        tampered: false,
        analysis: 'No log copy available — audit snapshot missing.'
      };
    }

    const liveContent =
      getState().virtualFs?.entries?.find((e) => e.id === LOG_PATH_NODE_ID)?.content || '';
    const expected = this.expectedContent();
    const tampered = liveContent !== expected;
    this._tampered = tampered;

    const entries = this._parseEntries(this._agentCopy);
    const suspicious = entries.filter((e) => e.flag === 'FLAGGED');
    const notable = entries.filter((e) => e.flag === 'NOTABLE');

    return {
      suspicious,
      notable,
      totalEntries: entries.length,
      tampered,
      analysis: this._buildAnalysisText(suspicious, notable, tampered, entries.length)
    };
  },

  _buildAnalysisText(suspicious, notable, tampered, totalEntries) {
    const lines = [];
    lines.push(`FEDERAL AUDIT ANALYSIS REPORT`);
    lines.push(`Generated by: FBCE Automated Compliance Scanner v2.1`);
    lines.push(`Reference: FOCS-${Date.now().toString().slice(-6)}`);
    lines.push(``);

    if (tampered) {
      lines.push(`!! CRITICAL: LOG FILE WAS MODIFIED AFTER AGENT COPY !!`);
      lines.push(`   This constitutes evidence of intent to obstruct federal audit.`);
      lines.push(`   Automatic Class III Compliance Violation recorded.`);
      lines.push(``);
    }

    lines.push(`Total log entries reviewed: ${totalEntries}`);
    lines.push(`Flagged entries (suspicious): ${suspicious.length}`);
    lines.push(`Notable entries: ${notable.length}`);
    lines.push(``);

    if (suspicious.length > 0) {
      lines.push(`SUSPICIOUS ACTIVITY DETECTED:`);
      suspicious.forEach((e, i) => {
        lines.push(`  ${i + 1}. [${e.ts}] ${e.type} — ${e.detail}`);
      });
      lines.push(``);
    }

    if (suspicious.length === 0 && !tampered) {
      lines.push(`No suspicious activity detected in this audit period.`);
      lines.push(`Operator appears compliant with Federal Mandate 2000-CR7.`);
    }

    lines.push(``);
    lines.push(`This report has been submitted to the Federal Bureau of Commerce Enforcement.`);
    lines.push(`A copy has been sent to the operator's registered JeeMail address.`);
    return lines.join('\n');
  },

  getEntries() {
    return [...this._entries];
  },
  isTampered() {
    return this._tampered;
  },
  isSealed() {
    return this._sealed;
  },

  /** User saved AUDITLOG.TXT from Explorer — replace parsed entries, then log the edit event. */
  applyUserSavedAuditContent(fileText) {
    this._entries = this._parseEntries(fileText);
    this.log('FILE_EDIT', 'AUDITLOG.TXT — saved after manual edit in Explorer', { suspicious: true });
  },

  /** File removed from VFS; record violation without recreating the file. */
  recordAuditFileDeletionEvent() {
    const simMs = getState().sim?.elapsedMs ?? 0;
    this._entries.push({
      ts: formatLogTimestamp(simMs),
      type: 'FILE_DELETE',
      detail: 'AUDITLOG.TXT — deleted via CorpOS Explorer',
      flag: 'FLAGGED'
    });
  }
};

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildAuditReportEmailHTML(analysisText, ref, opId) {
  const lines = String(analysisText || '')
    .split('\n')
    .map((line) => {
      if (line.startsWith('!!')) {
        return `<div style="color:#cc0000;font-weight:bold;font-family:Courier New,monospace;font-size:11px;">${escapeHtml(line)}</div>`;
      }
      if (/^SUSPICIOUS/i.test(line) || /^FLAGGED/i.test(line)) {
        return `<div style="color:#cc6600;font-weight:bold;font-size:11px;">${escapeHtml(line)}</div>`;
      }
      if (/^\d+\./.test(line.trim())) {
        return `<div style="font-family:Courier New,monospace;font-size:10px;color:#333;padding-left:12px;">${escapeHtml(line)}</div>`;
      }
      if (line.trim() === '') return '<br>';
      return `<div style="font-family:Courier New,monospace;font-size:10px;color:#333;">${escapeHtml(line)}</div>`;
    })
    .join('');

  return `
<div style="font-family:'Times New Roman',serif;font-size:12px;color:#111;max-width:600px;">
  <table width="100%" style="border-bottom:3px solid #0a246a;margin-bottom:16px;"><tr>
    <td><div style="font-family:Arial;font-size:9px;color:#666;letter-spacing:2px;text-transform:uppercase;">United States Federal Government</div>
        <div style="font-size:18px;font-weight:bold;color:#0a246a;">Federal Office of Commercial Systems</div>
        <div style="font-family:Arial;font-size:9px;color:#666;">Compliance Division · Washington, D.C. 20001</div></td>
    <td align="right" style="vertical-align:top;padding-top:8px;font-family:Courier New,monospace;font-size:10px;color:#333;">
        FOCS-${escapeHtml(ref)}<br>${escapeHtml(formatLogTimestamp(getState().sim?.elapsedMs ?? 0))}<br><span style="color:#cc0000;font-weight:bold;">CONFIDENTIAL</span></td>
  </tr></table>
  <div style="font-family:Arial;font-size:11px;margin-bottom:16px;">
    <strong>RE:</strong> Federal Audit — Activity Log Review<br>
    <strong>OPERATOR ID:</strong> <span style="font-family:Courier New;">${escapeHtml(opId)}</span>
  </div>
  <hr style="border:none;border-top:1px solid #ccc;margin-bottom:16px;">
  <div style="background:#f4f6ff;border-left:3px solid #0a246a;padding:12px 14px;font-family:Arial;font-size:10px;">
    ${lines}
  </div>
  <p style="margin-top:16px;font-size:11px;">This report was generated automatically by the FBCE Automated Compliance Scanner. It reflects the contents of your CorpOS Activity Log (AUDITLOG.TXT) as recorded at the time of audit. If you believe this report contains errors, contact your assigned compliance officer.</p>
  <p style="font-size:11px;">Do not reply to this message. This address is not monitored.</p>
  <div style="border-top:1px solid #ccc;margin-top:20px;padding-top:14px;font-size:11px;">
    <div style="font-weight:bold;">Director, Compliance Division</div>
    <div style="color:#555;">Federal Office of Commercial Systems</div>
    <div style="font-family:Courier New;font-size:10px;color:#888;margin-top:6px;">Ref: FOCS-${escapeHtml(ref)} · Mandate 2000-CR7 Section 4 · Official use only.</div>
  </div>
  <div style="background:#0a246a;color:#a6b5e7;font-family:Arial;font-size:9px;padding:6px 10px;margin-top:20px;letter-spacing:1px;">
    FEDERAL OFFICE OF COMMERCIAL SYSTEMS · ALL COMMUNICATIONS MONITORED PER FEDERAL MANDATE 2000-CR7
  </div>
</div>`.trim();
}

export function deliverAuditReportEmail(analysisText, ref, opId) {
  const sess = getSessionState();
  const currentUser = sess.jeemail?.currentUser;
  if (!currentUser) return;
  const account = sess.jeemail?.accounts?.[currentUser];
  if (!account) return;

  const simMs = getState().sim?.elapsedMs ?? 0;
  const email = {
    id: `AUDIT_REPORT_${Date.now()}`,
    from: 'compliance@focs.gov.net',
    fromName: 'Federal Office of Commercial Systems — Compliance Division',
    to: account.email,
    subject: `Federal Audit Report — Ref. FOCS-${ref} — Operator ${opId}`,
    date: formatLogTimestamp(simMs),
    isRead: false,
    isSystem: true,
    body: 'See HTML attachment.',
    bodyHtml: buildAuditReportEmailHTML(analysisText, ref, opId)
  };

  patchSession((s) => {
    if (!s.jeemail) s.jeemail = { accounts: {}, currentUser: null };
    const acc = s.jeemail.accounts[currentUser];
    if (!acc) return;
    if (!Array.isArray(acc.inbox)) acc.inbox = [];
    acc.inbox.unshift(email);
  });

  PeekManager.show({
    sender: 'Federal Office of Commercial Systems',
    preview: `Audit Report FOCS-${ref} — See JeeMail for details`,
    type: 'email',
    targetId: email.id,
    icon: '🏛'
  });
}
