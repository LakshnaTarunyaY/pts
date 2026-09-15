/**
 * MediKiosk Web — Pages 33 & 39: Doctor Patient Review & 3-Column Consultation Workspace
 */

import { store } from '../../store.js';
import { doctorApi } from '../../api/doctor.api.js';
import { renderConsultationCockpit } from '../../components/consultation-cockpit.js';

export function renderDoctorPatient(encounterId) {
  const detail = store.getState().doctor.selectedPatientDetail;

  if (!detail) {
    return `
      <div style="padding:var(--space-10); text-align:center;">
        <div class="card" style="max-width:400px; margin:0 auto; padding:var(--space-8);">
          <div style="font-size:32px; margin-bottom:var(--space-3);">⏳</div>
          <h3 class="text-h3">Loading Patient Case...</h3>
          <p style="font-size:14px; color:var(--text-muted); margin-top:4px;">Fetching clinical facts and prescription evidence from edge server...</p>
        </div>
      </div>
    `;
  }

  return `
    <div style="height:calc(100vh - var(--header-height)); display:flex; flex-direction:column;">
      <!-- Sticky Patient Header Navigation -->
      <div style="background:var(--bg-surface); padding:10px var(--space-6); border-bottom:1px solid var(--border-default); display:flex; justify-content:space-between; align-items:center;">
        <div style="display:flex; align-items:center; gap:12px;">
          <a href="#/doctor/queue" class="btn btn-secondary btn-sm">← Back to Queue</a>
          <span style="font-size:14px; font-weight:700;">Encounter: ${encounterId}</span>
          <span class="badge ${detail.encounter.severity_badge === 'RED' ? 'badge-red' : 'badge-green'}">
            ${detail.encounter.severity_badge || 'GREEN'} Triage
          </span>
        </div>

        <div style="display:flex; gap:8px;">
          <button class="btn btn-primary btn-sm" id="btnTopCallNext">
            📞 Call Patient to Room
          </button>
        </div>
      </div>

      <!-- 3-Column Consultation Cockpit -->
      <div style="flex:1; overflow:hidden;">
        ${renderConsultationCockpit(detail)}
      </div>
    </div>
  `;
}

export async function initDoctorPatient(encounterId) {
  try {
    const res = await doctorApi.getPatientDetail(encounterId);
    store.setSelectedPatientDetail(encounterId, res);
    // Re-render
    const container = document.getElementById('pageContent');
    if (container) {
      container.innerHTML = renderDoctorPatient(encounterId);
      attachCockpitEvents(encounterId);
    }
  } catch (err) {
    console.warn('Doctor patient API fetch error:', err);
    const container = document.getElementById('pageContent');
    if (container) {
      container.innerHTML = `
        <div style="padding:var(--space-10); text-align:center;">
          <div class="card" style="max-width:500px; margin:0 auto; padding:var(--space-8); border:1.5px solid var(--status-danger);">
            <div style="font-size:36px; margin-bottom:var(--space-3);">⚠️</div>
            <h3 class="text-h3" style="color:var(--status-danger); margin-bottom:8px;">Unable to Load Patient Case</h3>
            <p style="font-size:14px; color:var(--text-muted); margin-bottom:16px; line-height:1.5;">
              Could not retrieve encounter data for <strong>${encounterId}</strong> from the server.<br>
              <small style="color:var(--text-secondary); font-size:12px;">${err.message || 'Server connection failed or encounter not found'}</small>
            </p>
            <div style="display:flex; justify-content:center; gap:12px;">
              <a href="#/doctor/queue" class="btn btn-secondary btn-sm">← Return to Queue</a>
              <button class="btn btn-primary btn-sm" id="btnRetryLoadPatient">🔄 Retry Now</button>
            </div>
          </div>
        </div>
      `;
      document.getElementById('btnRetryLoadPatient')?.addEventListener('click', () => {
        initDoctorPatient(encounterId);
      });
    }
  }
}

function attachCockpitEvents(encounterId) {
  const signOffBtn = document.getElementById('btnDoctorSignOff');
  if (signOffBtn) {
    signOffBtn.addEventListener('click', async () => {
      const notes = document.getElementById('doctorClinicalNotes')?.value.trim();
      if (!notes) {
        alert('Enter a clinical assessment before signing off.');
        return;
      }
      const originalLabel = signOffBtn.textContent;
      try {
        signOffBtn.disabled = true;
        signOffBtn.textContent = 'Signing & Reconciling...';
        const res = await doctorApi.verifyEncounter(encounterId, notes);
        alert(`Encounter signed by ${res.verified_by || store.getState().doctor.profile?.full_name || 'you'}. Case record locked.`);
        window.location.hash = '#/doctor/queue';
      } catch (e) {
        alert(`Sign-off failed: ${e.message || 'Server unreachable'}. The case remains unsigned.`);
        signOffBtn.disabled = false;
        signOffBtn.textContent = originalLabel;
      }
    });
  }

  const callNextBtn = document.getElementById('btnTopCallNext');
  if (callNextBtn) {
    callNextBtn.addEventListener('click', async () => {
      const originalLabel = callNextBtn.textContent;
      try {
        callNextBtn.disabled = true;
        callNextBtn.textContent = 'Calling…';
        const res = await doctorApi.callNextPatient(encounterId);
        const room = res.room_number || store.getState().doctor.profile?.room_number;
        alert(`Token ${res.token_number || ''} called${room ? ` to ${room}` : ''}.`.replace(/\s+/g, ' '));
      } catch (e) {
        alert(`Could not call the patient: ${e.message || 'Server unreachable'}`);
      } finally {
        callNextBtn.disabled = false;
        callNextBtn.textContent = originalLabel;
      }
    });
  }
}
