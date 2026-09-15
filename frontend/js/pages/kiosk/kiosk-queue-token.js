/**
 * MediKiosk Web — Screen 19: OPD Queue Ticket & Screen 24: Privacy Auto-Reset
 * Prints the OPD queue ticket and strictly resets patient data after 10 seconds for HIPAA/DPDP privacy.
 */

import { store } from '../../store.js';
import { queueApi } from '../../api/queue.api.js';
import { i18n } from '../../i18n.js';

let countdownInterval = null;

export function renderKioskQueueToken() {
  const kioskState = store.getState().kiosk;
  const lang = kioskState.language || 'hi';
  const token = kioskState.tokenNumber || '—';
  const queueStatus = kioskState.queueStatus || {};

  return `
    <div class="kiosk-shell">
      <div class="kiosk-split">
        <!-- Left Pane -->
        <div class="kiosk-left-pane">
          <div class="kiosk-brand-card">
            <div class="kiosk-step-indicator" style="background:var(--status-success-tint); color:var(--status-success);">
              ${i18n.t('intake_completed', lang)}
            </div>
            <h2 class="text-h2" style="margin-top:var(--space-4);">${i18n.t('case_ready', lang)}</h2>
            <p style="font-size:14px; color:var(--text-secondary); margin-top:var(--space-2);">
              ${i18n.t('case_ready_sub', lang)}
            </p>
          </div>

          <!-- Automated Privacy Reset Box -->
          <div style="background:var(--status-danger-tint); border:1.5px solid var(--status-danger); border-radius:var(--radius-xl); padding:var(--space-4); text-align:center;">
            <div style="font-size:11px; font-weight:700; color:var(--status-danger); text-transform:uppercase;">
              ${i18n.t('privacy_protection', lang)}
            </div>
            <div style="font-size:24px; font-weight:800; color:var(--status-danger); margin:6px 0;" id="kioskResetTimer">
              10s
            </div>
            <div style="font-size:12px; color:var(--pr-slate-800);">
              ${i18n.t('privacy_wipe_desc', lang)}
            </div>
          </div>
        </div>

        <!-- Right Pane: Digital Queue Ticket -->
        <div class="kiosk-right-pane">
          <div class="kiosk-task-canvas" style="align-items:center; justify-content:center;">
            <div class="queue-ticket">
              <div class="queue-ticket__header">All India Institute of Ayurveda · OPD Ticket</div>
              <div style="font-size:14px; color:var(--text-muted);" id="ticketDepartment">${queueStatus.department || i18n.t('dept_general', lang)}</div>
              
              <div class="queue-ticket__token" id="ticketTokenDisplay">${token}</div>
              
              <div class="queue-ticket__meta-grid">
                <div>
                  <span style="font-size:11px; color:var(--text-muted); text-transform:uppercase; display:block;">${i18n.t('consulting_doctor', lang)}</span>
                  <strong style="font-size:15px; color:var(--text-primary);" id="ticketDoctorName">${queueStatus.doctor_name || '—'}</strong>
                </div>
                <div>
                  <span style="font-size:11px; color:var(--text-muted); text-transform:uppercase; display:block;">${i18n.t('chamber_room', lang)}</span>
                  <strong style="font-size:15px; color:var(--brand-primary);" id="ticketDoctorRoom">${queueStatus.doctor_room || '—'}</strong>
                </div>
                <div style="margin-top:8px;">
                  <span style="font-size:11px; color:var(--text-muted); text-transform:uppercase; display:block;">${i18n.t('est_wait', lang)}</span>
                  <strong style="font-size:15px; color:var(--status-success);" id="ticketEstWait">${queueStatus.estimated_wait_minutes != null ? `~${queueStatus.estimated_wait_minutes} min` : '—'}</strong>
                </div>
                <div style="margin-top:8px;">
                  <span style="font-size:11px; color:var(--text-muted); text-transform:uppercase; display:block;">${i18n.t('patients_ahead', lang)}</span>
                  <strong style="font-size:15px; color:var(--status-warning);" id="ticketPatientsAhead">${queueStatus.patients_ahead != null ? queueStatus.patients_ahead : '—'}</strong>
                </div>
              </div>

              <div style="display:flex; flex-direction:column; gap:var(--space-3);">
                <button class="btn btn-secondary btn-lg" onclick="window.print()">
                  ${i18n.t('print_ticket', lang)}
                </button>
                <button id="btnResetKioskNow" class="btn btn-danger btn-lg">
                  ${i18n.t('wipe_exit_now', lang)}
                </button>
              </div>
            </div>
          </div>

          <div class="kiosk-footer-bar">
            <span style="font-size:13px; color:var(--text-muted);">
              ${i18n.t('proceed_waiting', lang)}
            </span>
            <a href="#/doctor/queue" class="btn btn-ghost btn-sm" style="color:var(--brand-primary); font-weight:700;">
              Open Doctor Station (Window 2) →
            </a>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function initKioskQueueToken() {
  const token = store.getState().kiosk.tokenNumber;

  if (token) {
    queueApi.getStatus(token)
      .then(status => {
        store.updateKioskIntake({ queueStatus: status });
        const set = (id, value) => {
          const el = document.getElementById(id);
          if (el && value != null && value !== '') el.textContent = value;
        };
        set('ticketDepartment', status.department);
        set('ticketDoctorName', status.doctor_name || 'To be assigned');
        set('ticketDoctorRoom', status.doctor_room || 'To be assigned');
        set('ticketEstWait', `~${status.estimated_wait_minutes} min`);
        set('ticketPatientsAhead', String(status.patients_ahead));
      })
      .catch(err => {
        console.warn('Queue status unavailable:', err);
      });
  }

  // Automated 10-Second Privacy Countdown
  let secondsRemaining = 10;
  const timerElem = document.getElementById('kioskResetTimer');

  countdownInterval = setInterval(() => {
    secondsRemaining -= 1;
    if (timerElem) {
      timerElem.textContent = `${secondsRemaining}s`;
    }

    if (secondsRemaining <= 0) {
      clearInterval(countdownInterval);
      store.resetKioskSession();
      window.location.hash = '#/kiosk/welcome';
    }
  }, 1000);

  // Manual reset button
  const resetBtn = document.getElementById('btnResetKioskNow');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      clearInterval(countdownInterval);
      store.resetKioskSession();
      window.location.hash = '#/kiosk/welcome';
    });
  }
}

export function destroyKioskQueueToken() {
  if (countdownInterval) {
    clearInterval(countdownInterval);
    countdownInterval = null;
  }
}
