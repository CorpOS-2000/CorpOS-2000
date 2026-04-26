/**
 * Multi-stage federal audit overlay (desktop top-right).
 */
import { getGameEpochMs, getState } from './gameState.js';
import { SMS } from './bc-sms.js';
import { PeekManager } from './peek-manager.js';
import { ToastManager } from './toast.js';
import { TOAST_KEYS } from './toast.js';
import { deliverAuditReportEmail } from '../engine/ActivityLog.js';

function formatShortSimDate() {
  const ms = getGameEpochMs() + (getState().sim?.elapsedMs ?? 0);
  const d = new Date(ms);
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const yy = d.getUTCFullYear();
  return `${mm}/${dd}/${yy}`;
}

export const FederalAuditSequence = {
  _el: null,
  _interval: null,
  _timeout: null,

  trigger(level = 1) {
    void level;
    const desk = document.getElementById('desktop');
    if (!desk) return;

    if (!this._el) {
      this._el = document.createElement('div');
      this._el.id = 'federal-audit-overlay';
      desk.appendChild(this._el);
    }

    this._el.style.display = 'flex';
    this._el.style.opacity = '1';
    this._auditRef = String(Date.now()).slice(-6);
    this._lastAuditResult = null;
    this.runStage('standby');
  },

  runStage(stage) {
    clearInterval(this._interval);
    clearTimeout(this._timeout);
    clearTimeout(this._copyTimeout);
    clearTimeout(this._analysisTimeout);
    this._copyTimeout = null;
    this._analysisTimeout = null;

    // After Stage 3 (completed), branch: real violations vs clean path.
    if (stage === 'completed') {
      this._timeout = setTimeout(() => {
        const hasViolations = this._checkForViolations();
        this.runStage(hasViolations ? 'noncompliance_found' : 'no_violations');
      }, 2500);
      this.render({
        label: 'FEDERAL AUDIT COMPLETED',
        color: '#ffffff',
        bgColor: 'rgba(10, 36, 106, 0.92)',
        borderColor: '#a6b5e7',
        showTimer: false
      });
      return;
    }

    if (stage === 'finish_clean') {
      this._lastAuditResult = { clean: true, suspicious: [], tampered: false, notable: [] };
      this.fireComplianceNotification();
      this.cleanup();
      return;
    }

    if (stage === 'finish_violation') {
      this.fireComplianceNotification();
      this.cleanup();
      return;
    }

    const stages = {
      standby: {
        label: 'STANDBY FOR FEDERAL AUDIT',
        color: '#ffffff',
        bgColor: 'rgba(10, 36, 106, 0.92)',
        borderColor: '#a6b5e7',
        duration: 10,
        timerColor: '#ffffff',
        next: 'in_progress',
        showTimer: true
      },
      in_progress: {
        label: 'FEDERAL AUDIT IN PROGRESS',
        color: '#ffff00',
        bgColor: 'rgba(10, 36, 106, 0.95)',
        borderColor: '#ffff00',
        duration: 10,
        timerColor: '#ffff00',
        next: 'completed',
        showTimer: true
      },
      no_violations: {
        label: 'NO VIOLATIONS FOUND',
        color: '#00cc44',
        bgColor: 'rgba(0, 20, 0, 0.95)',
        borderColor: '#00aa33',
        duration: 2.5,
        showTimer: false,
        next: 'clean_complete'
      },
      clean_complete: {
        label: 'AUDIT COMPLETE — COMPLIANT',
        color: '#00cc44',
        bgColor: 'rgba(0, 20, 0, 0.95)',
        borderColor: '#00aa33',
        duration: 4,
        timerColor: '#00aa33',
        next: 'finish_clean',
        showTimer: true
      },
      noncompliance_found: {
        label: 'NONCOMPLIANCE FOUND',
        color: '#ff8800',
        bgColor: 'rgba(20, 8, 0, 0.95)',
        borderColor: '#ff8800',
        duration: 2.5,
        showTimer: false,
        next: 'analyzing'
      },
      analyzing: {
        label: 'ANALYZING NONCOMPLIANCE',
        color: '#ff8800',
        bgColor: 'rgba(20, 8, 0, 0.95)',
        borderColor: '#cc6600',
        duration: 15,
        timerColor: '#cc6600',
        next: 'violations_found',
        showTimer: true
      },
      violations_found: {
        label: 'VIOLATIONS FOUND',
        color: '#ff2222',
        bgColor: 'rgba(30, 0, 0, 0.97)',
        borderColor: '#cc0000',
        duration: 2.5,
        showTimer: false,
        next: 'reporting'
      },
      reporting: {
        label: 'REPORTING NONCOMPLIANCE',
        color: '#ff2222',
        bgColor: 'rgba(30, 0, 0, 0.97)',
        borderColor: '#cc0000',
        duration: 10,
        timerColor: '#cc0000',
        next: 'finish_violation',
        showTimer: true
      }
    };

    const cfg = stages[stage];
    if (!cfg) return;

    this.render(cfg);

    if (stage === 'in_progress') {
      this._copyTimeout = setTimeout(() => {
        this._copyTimeout = null;
        window.ActivityLog?.agentCopyLog?.();
      }, 2000);
    }

    if (stage === 'analyzing') {
      const delayMs = 15000;
      this._analysisTimeout = setTimeout(() => {
        this._analysisTimeout = null;
        const result = window.ActivityLog?.agentAnalyzeLog?.();
        this._lastAuditResult = result || this._lastAuditResult || null;
      }, Math.max(0, delayMs - 1000));
    }

    if (cfg.showTimer) {
      this.runTimer(cfg.duration, cfg.timerColor || cfg.color, () => {
        this.runStage(cfg.next);
      });
    } else {
      this._timeout = setTimeout(() => this.runStage(cfg.next), cfg.duration * 1000);
    }
  },

  _checkForViolations() {
    if (window.ActivityLog?.hasAgentCopy?.()) {
      const result = window.ActivityLog.agentAnalyzeLog?.();
      if (result) {
        this._lastAuditResult = result;
        return (result.suspicious?.length ?? 0) > 0 || result.tampered === true;
      }
    }
    const notoriety = getState().corporateProfile?.notoriety || 0;
    if (notoriety >= 50) {
      this._lastAuditResult = {
        suspicious: [
          {
            ts: '—',
            type: 'PROFILE',
            detail: 'Corporate notoriety exceeds federal review threshold',
            flag: 'FLAGGED'
          }
        ],
        notable: [],
        totalEntries: 1,
        tampered: false,
        analysis: 'FEDERAL AUDIT ANALYSIS REPORT (Supplemental)\nNotoriety-based threshold triggered. Operator profile requires enhanced oversight.'
      };
      return true;
    }
    return false;
  },

  render(cfg) {
    const el = this._el;
    if (!el) return;
    const p = getState().player || {};
    const opId = p.operatorId || '00-2000-0000';
    const dateStr = formatShortSimDate();

    el.style.cssText = `
      position: fixed;
      top: 12px;
      right: 14px;
      min-width: 280px;
      background: ${cfg.bgColor};
      border: 1px solid ${cfg.borderColor};
      border-left: 3px solid ${cfg.borderColor};
      padding: 10px 16px;
      z-index: 9990;
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      font-family: 'Share Tech Mono', 'Courier New', monospace;
      box-shadow: 0 0 20px ${cfg.borderColor}44, inset 0 0 8px rgba(0,0,0,0.4);
    `;

    el.innerHTML = `
      <div class="fad-label" style="
        font-size: 11px;
        font-weight: bold;
        color: ${cfg.color};
        letter-spacing: 2px;
        text-align: right;
        line-height: 1.4;
        text-shadow: 0 0 8px ${cfg.color}88;
      ">${cfg.label}</div>
      <div class="fad-sub" style="
        font-size: 9px;
        color: ${cfg.color}88;
        letter-spacing: 1px;
        margin-top: 3px;
        text-align: right;
      ">FEDERAL OFFICE OF COMMERCIAL SYSTEMS · MANDATE 2000-CR7</div>
      <div id="fad-timer" style="
        font-size: 28px;
        font-weight: bold;
        color: ${cfg.timerColor || cfg.color};
        text-align: right;
        margin-top: 4px;
        min-height: 36px;
        text-shadow: 0 0 12px ${cfg.timerColor || cfg.color}88;
        letter-spacing: 3px;
        display: ${cfg.showTimer ? 'block' : 'none'};
      ">--</div>
      <div style="
        width: 100%;
        height: 1px;
        background: ${cfg.borderColor}44;
        margin-top: 6px;
      "></div>
      <div style="
        font-size: 8px;
        color: ${cfg.color}55;
        letter-spacing: 1px;
        margin-top: 4px;
        text-align: right;
      ">OPERATOR: ${opId} · ${dateStr}</div>
    `;
  },

  runTimer(totalSeconds, color, onComplete) {
    let remaining = totalSeconds;

    const update = () => {
      const timerEl = document.getElementById('fad-timer');
      if (!timerEl) return;
      const mins = Math.floor(remaining / 60);
      const secs = remaining % 60;
      timerEl.textContent = mins > 0
        ? `${mins}:${String(secs).padStart(2, '0')}`
        : `0:${String(secs).padStart(2, '0')}`;
      if (remaining <= 3) {
        timerEl.style.animation = 'fad-pulse 0.4s ease-in-out infinite';
      } else {
        timerEl.style.animation = '';
      }
    };

    update();

    this._interval = setInterval(() => {
      remaining--;
      update();
      if (remaining <= 0) {
        clearInterval(this._interval);
        this._interval = null;
        const timerEl = document.getElementById('fad-timer');
        if (timerEl) timerEl.style.animation = '';
        onComplete();
      }
    }, 1000);
  },

  fireComplianceNotification() {
    const p = getState().player || {};
    const opId = p.operatorId || '00-2000-0000';
    const ref = this._auditRef || String(Date.now()).slice(-6);
    const simMs = getState().sim?.elapsedMs ?? 0;
    const result = this._lastAuditResult || {};
    const isClean = result.clean === true;
    const suspCount = result.suspicious?.length ?? 0;
    const tampered = result.tampered ?? false;

    const smsBody = isClean
      ? `COMPLIANCE NOTICE — Audit ref. FOCS-${ref} complete. No violations detected. Your operator record has been updated. Operator: ${opId}`
      : tampered
      ? `COMPLIANCE NOTICE — Audit ref. FOCS-${ref} complete. CRITICAL: Log tampering detected. Class III violation recorded. FBCE notified. Operator: ${opId}`
      : `COMPLIANCE NOTICE — Audit ref. FOCS-${ref} complete. ${suspCount} violation${suspCount === 1 ? '' : 's'} detected and reported to FBCE. A compliance officer will be in contact. Operator: ${opId}`;

    SMS.send({ from: 'CORPOS_SYSTEM', message: smsBody, gameTime: simMs });

    if (!isClean && result.analysis) {
      deliverAuditReportEmail(result.analysis, ref, opId);
    }

    PeekManager.show({
      sender: 'CORPOS COMPLIANCE',
      preview: isClean
        ? 'Audit complete — no violations found'
        : tampered
        ? 'CRITICAL: Log tampering detected — FBCE notified'
        : `Audit complete — ${suspCount} violation${suspCount > 1 ? 's' : ''} reported`,
      type: 'compliance',
      targetId: 'CORPOS_SYSTEM',
      icon: isClean ? '✓' : tampered ? '🚨' : '⚠'
    });

    ToastManager.fire({
      key: TOAST_KEYS.FEDERAL_AUDIT_RESULT,
      title: 'Federal Audit',
      message: isClean
        ? 'No violations found. Record updated.'
        : tampered
        ? 'Tampering detected. FBCE notified.'
        : `${suspCount} violation${suspCount > 1 ? 's' : ''} reported to FBCE.`,
      icon: '🏛'
    });
  },

  cleanup() {
    clearInterval(this._interval);
    clearTimeout(this._timeout);
    clearTimeout(this._copyTimeout);
    clearTimeout(this._analysisTimeout);
    this._interval = null;
    this._timeout = null;
    this._copyTimeout = null;
    this._analysisTimeout = null;

    if (this._el) {
      this._el.style.transition = 'opacity 1s ease';
      this._el.style.opacity = '0';
      setTimeout(() => {
        if (this._el) {
          this._el.style.display = 'none';
          this._el.style.opacity = '1';
          this._el.style.transition = '';
        }
      }, 1000);
    }
  }
};
