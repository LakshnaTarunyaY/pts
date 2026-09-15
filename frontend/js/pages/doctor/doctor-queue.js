/**
 * MediKiosk Web — Page 32: Doctor Live OPD Waiting Queue & Clinical Triaging Table
 * Single Pane of Glass: All 3 channels (Kiosk, BYOD, IVR) converge here.
 */

import { store } from '../../store.js';
import { doctorApi } from '../../api/doctor.api.js';

let pollTimer = null;

function _clinicLabel(profile) {
  const room = profile?.room_number && profile.room_number !== 'Pending Assignment'
    ? profile.room_number
    : 'Room not assigned';
  const dept = profile?.department || profile?.specialization;
  return dept ? `${room} · ${dept}` : room;
}

export function renderDoctorQueue() {
  const queue = store.getState().doctor.queue || [];
  const profile = store.getState().doctor.profile || {};
  const total = queue.length;
  const redCount = queue.filter(q => q.severity_badge === 'RED').length;

  return `
    <div style="max-width:1400px; margin:0 auto; padding:var(--space-8) var(--space-6);">
      <!-- Top Metrics Strip -->
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:var(--space-6);">
        <div>
          <div style="display:flex; align-items:center; gap:8px;">
            <h1 class="text-h2">Clinical Command Center</h1>
            <span class="badge badge-teal" id="doctorClinicBadge">${_clinicLabel(profile)}</span>
          </div>
          <p style="font-size:14px; color:var(--text-secondary); margin-top:2px;">
            Single Pane of Glass where In-Clinic Kiosk, Mobile BYOD, and 2G IVR encounters converge.
          </p>
        </div>

        <div style="display:flex; gap:var(--space-3);">
          <button id="btnRefreshDoctorQueue" class="btn btn-secondary btn-md">
            🔄 Refresh Queue
          </button>
          <a href="#/kiosk/welcome" target="_blank" class="btn btn-primary btn-md" style="text-decoration:none;">
            + Open Kiosk Window 1 ↗
          </a>
        </div>
      </div>

      <!-- Stat Cards Strip -->
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:var(--space-4); margin-bottom:var(--space-6);">
        <div class="card card-sm">
          <div style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Waiting Patients</div>
          <div style="font-size:32px; font-weight:800; color:var(--brand-primary); margin-top:4px;" id="doctorQueueCount">${total}</div>
          <div style="font-size:12px; color:var(--text-muted); margin-top:2px;">Active in OPD Queue</div>
        </div>

        <div class="card card-sm" style="border-left:4px solid var(--status-danger);">
          <div style="font-size:11px; font-weight:700; color:var(--status-danger); text-transform:uppercase;">Critical / Red Flag</div>
          <div style="font-size:32px; font-weight:800; color:var(--status-danger); margin-top:4px;" id="doctorCriticalCount">${redCount}</div>
          <div style="font-size:12px; color:var(--text-muted); margin-top:2px;">Immediate attention required</div>
        </div>

        <div class="card card-sm">
          <div style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Average Consult Time</div>
          <div style="font-size:32px; font-weight:800; color:var(--status-success); margin-top:4px;" id="doctorAvgConsult">—</div>
          <div style="font-size:12px; color:var(--text-muted); margin-top:2px;" id="doctorAvgConsultSub">Target: 2-5 mins OPD</div>
        </div>

        <div class="card card-sm">
          <div style="font-size:11px; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Active Physician</div>
          <div style="font-size:20px; font-weight:800; color:var(--text-primary); margin-top:8px;" id="doctorActiveName">${profile.full_name || 'Loading…'}</div>
          <div style="font-size:12px; color:var(--status-ayush); margin-top:2px;" id="doctorActiveQualification">${profile.qualification || profile.specialization || ''}</div>
        </div>
      </div>

      <!-- ABHA Longitudinal Lookup (authorized doctors only) -->
      <div class="card" style="margin-bottom:var(--space-6);">
        <div style="display:flex; flex-wrap:wrap; gap:var(--space-3); align-items:flex-end;">
          <div style="flex:1; min-width:220px;">
            <label for="doctorAbhaSearchInput" style="display:block; font-size:12px; font-weight:700; color:var(--text-secondary); margin-bottom:6px;">
              Longitudinal ABHA Lookup
            </label>
            <input id="doctorAbhaSearchInput" class="form-input" placeholder="Enter patient ABHA ID (e.g. 91-XXXX-XXXX-XXXX)" autocomplete="off" />
          </div>
          <button id="doctorAbhaSearchBtn" class="btn btn-primary btn-md">Search Records</button>
        </div>
        <div id="doctorAbhaSearchResult" style="margin-top:var(--space-4); display:none;"></div>
      </div>

      <!-- Live Waiting Queue Table -->
      <div class="card" style="padding:0; overflow:hidden;">
        <div style="padding:var(--space-4) var(--space-6); background:var(--bg-surface-soft); border-bottom:1px solid var(--border-default); display:flex; justify-content:space-between; align-items:center;">
          <h3 class="text-h3" style="font-size:16px;">Active Patient Queue & Triage Synthesis</h3>
          <span style="font-size:12px; color:var(--text-muted);">Real-time SQLite WAL Sync</span>
        </div>

        <div class="clinical-table-container" style="border:none; box-shadow:none;">
          <table class="clinical-table">
            <thead>
              <tr>
                <th style="width:150px;">Token / Patient</th>
                <th style="width:140px;">Channel</th>
                <th style="width:110px;">Priority</th>
                <th>30-Second Clinical Triage Synthesis</th>
                <th style="width:90px;">Documents</th>
                <th style="width:140px; text-align:right;">Action</th>
              </tr>
            </thead>
            <tbody id="doctorQueueTableBody">
              ${_renderRows(queue)}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

function _renderRows(queue) {
  if (!queue || queue.length === 0) {
    return `
      <tr>
        <td colspan="6" style="text-align:center; padding:var(--space-8); color:var(--text-muted);">
          No patients currently waiting in queue. Use Window 1 to intake a patient.
        </td>
      </tr>
    `;
  }

  const langLabels = {
    'hi': 'हिन्दी',
    'en': 'English',
    'ta': 'தமிழ்',
    'te': 'తెలుగు',
    'mr': 'मराठी'
  };

  return queue.map(entry => {
    const channelBadge = entry.channel === 'ivr_phone'
      ? '<span class="badge badge-amber">📞 Citizen IVR</span>'
      : entry.channel === 'android_byod'
      ? '<span class="badge badge-purple">📱 BYOD</span>'
      : '<span class="badge badge-teal">🏥 Kiosk</span>';

    const langName = langLabels[entry.language] || entry.language || '';
    const langBadge = langName
      ? `<span class="badge badge-purple" style="font-size:11px;" title="Patient Language: ${langName}">🗣 ${langName}</span>`
      : '';

    const demographics = [
      entry.patient_age ? `${entry.patient_age} Y` : null,
      entry.patient_gender || null
    ].filter(Boolean).join(' / ');

    const severityBadge = entry.severity_badge === 'RED'
      ? '<span class="badge badge-red">🔴 CRITICAL</span>'
      : entry.severity_badge === 'YELLOW'
      ? '<span class="badge badge-amber">🟡 MODERATE</span>'
      : '<span class="badge badge-green">🟢 ROUTINE</span>';

    return `
      <tr style="${entry.severity_badge === 'RED' ? 'background:var(--status-danger-tint);' : ''}">
        <td>
          <strong class="text-mono" style="font-size:17px; color:var(--brand-primary);">${entry.token_number}</strong>
          <div style="font-size:12px; font-weight:600; color:var(--text-primary); margin-top:2px;">${entry.patient_name || 'Unidentified patient'}</div>
          ${demographics ? `<div style="font-size:11px; color:var(--text-muted);">${demographics}</div>` : ''}
        </td>
        <td>
          <div style="display:flex; flex-direction:column; gap:4px; align-items:flex-start;">
            ${channelBadge}
            ${langBadge}
          </div>
        </td>
        <td>${severityBadge}</td>
        <td>
          <div style="font-weight:600; color:var(--text-primary); font-size:14px;">${entry.summary_30_words || 'Patient intake recorded'}</div>
          ${entry.has_medication_conflict ? '<span style="color:var(--status-warning); font-size:11px; font-weight:700;">⚠ Drug Interaction Alert</span>' : ''}
        </td>
        <td><span class="badge ${entry.fact_count ? 'badge-blue' : 'badge-amber'}">${entry.fact_count ?? 0} facts</span></td>
        <td style="text-align:right;">
          <a href="#/doctor/patient/${entry.encounter_id}" class="btn btn-primary btn-sm">
            Review Case →
          </a>
        </td>
      </tr>
    `;
  }).join('');
}

export async function initDoctorQueue() {
  async function fetchProfile() {
    try {
      const res = await doctorApi.me();
      const doc = res.doctor || {};
      const stats = res.stats || {};

      const nameEl = document.getElementById('doctorActiveName');
      if (nameEl) nameEl.textContent = doc.full_name || 'Unknown physician';

      const qualEl = document.getElementById('doctorActiveQualification');
      if (qualEl) qualEl.textContent = doc.qualification || doc.specialization || 'Qualification not on record';

      const clinicEl = document.getElementById('doctorClinicBadge');
      if (clinicEl) clinicEl.textContent = _clinicLabel(doc);

      const avgEl = document.getElementById('doctorAvgConsult');
      const avgSubEl = document.getElementById('doctorAvgConsultSub');
      if (avgEl) {
        avgEl.textContent = stats.average_consult_minutes != null
          ? `${stats.average_consult_minutes} m`
          : '—';
      }
      if (avgSubEl) {
        avgSubEl.textContent = stats.average_consult_minutes != null
          ? `Across ${stats.average_consult_sample} signed consult(s)`
          : 'No signed consults yet · Target 2-5 mins';
      }
    } catch (e) {
      console.warn('Doctor profile fetch error:', e);
      if (/401|session/i.test(e.message || '')) {
        store.setDoctorAuthenticated(false);
        window.location.hash = '#/doctor/login';
      }
    }
  }

  async function fetchQueue() {
    try {
      const res = await doctorApi.getQueue();
      const q = res.queue || [];
      store.setDoctorQueue(q, res.total_waiting);
      _updateDom(q);
    } catch (e) {
      console.warn('Doctor queue API fetch error:', e);
      // Show error state instead of fake mock data
      const tbody = document.getElementById('doctorQueueTableBody');
      if (tbody) {
        tbody.innerHTML = `
          <tr>
            <td colspan="6" style="text-align:center; padding:var(--space-8); color:var(--status-danger);">
              <div style="font-size:20px; margin-bottom:8px;">⚠️</div>
              <div style="font-weight:700; font-size:14px; margin-bottom:4px;">Unable to load patient queue</div>
              <div style="font-size:12px; color:var(--text-muted); margin-bottom:12px;">Backend server may be starting up or unreachable. Error: ${e.message || 'Connection failed'}</div>
              <button class="btn btn-primary btn-sm" onclick="document.getElementById('btnRefreshDoctorQueue')?.click()">🔄 Retry Now</button>
            </td>
          </tr>
        `;
      }
    }
  }

  function _updateDom(q) {
    const totalEl = document.getElementById('doctorQueueCount');
    if (totalEl) totalEl.textContent = q.length;

    const critEl = document.getElementById('doctorCriticalCount');
    if (critEl) critEl.textContent = q.filter(x => x.severity_badge === 'RED').length;

    const tbody = document.getElementById('doctorQueueTableBody');
    if (tbody) tbody.innerHTML = _renderRows(q);
  }

  await Promise.all([fetchProfile(), fetchQueue()]);

  const refreshBtn = document.getElementById('btnRefreshDoctorQueue');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      fetchProfile();
      fetchQueue();
    });
  }

  const abhaBtn = document.getElementById('doctorAbhaSearchBtn');
  const abhaInput = document.getElementById('doctorAbhaSearchInput');
  const abhaResult = document.getElementById('doctorAbhaSearchResult');
  const doAbhaSearch = async () => {
    const abhaId = abhaInput?.value.trim();
    if (!abhaId || !abhaResult) return;
    abhaResult.style.display = 'block';
    abhaResult.innerHTML = '<div class="spinner spinner-lg"></div> Searching authorized longitudinal history…';
    try {
      const data = await doctorApi.getPatientByAbha(abhaId);
      const patient = data.patient || {};
      const visits = data.timeline || [];
      abhaResult.innerHTML = `
        <div style="padding:12px; background:var(--bg-surface-soft); border-radius:var(--radius-md);">
          <div style="font-weight:800; font-size:15px;">${patient.full_name || 'Patient'} · <span class="text-mono">${data.abha_id}</span></div>
          <div style="font-size:12px; color:var(--text-muted); margin-top:4px;">Access: ${data.access_reason || 'authorized'} · ${data.total_visits || visits.length} visit(s)</div>
          <ul style="margin:12px 0 0; padding-left:18px; font-size:13px;">
            ${visits.slice(0, 8).map((v) => `<li><a href="#/doctor/patient/${v.encounter_id}">${v.token_number || v.encounter_id}</a> · ${v.department || ''} · ${v.status || ''} · ${v.visit_date || ''}</li>`).join('') || '<li>No encounters</li>'}
          </ul>
        </div>
      `;
    } catch (err) {
      abhaResult.innerHTML = `<div class="auth-error">${err.message || 'Lookup failed'}</div>`;
    }
  };
  abhaBtn?.addEventListener('click', doAbhaSearch);
  abhaInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doAbhaSearch();
  });

  // Auto-poll every 5 seconds for live multi-window synchronization
  pollTimer = setInterval(fetchQueue, 5000);
}

export function destroyDoctorQueue() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}
