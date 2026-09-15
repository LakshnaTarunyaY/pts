/**
 * MediKiosk Web — Page 08: Patient Health Workspace & ABHA Locker
 */

import { store } from '../../store.js';
import { patientApi } from '../../api/patient.api.js';
import { authApi } from '../../api/auth.api.js';

function esc(value) {
  return String(value ?? '—')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function renderPatientDashboard() {
  const user = store.getState().auth.user || {};
  const patientState = store.getState().patient;
  const profile = patientState.profile || user;
  const activeToken = patientState.activeToken || null;
  const encounters = patientState.encounters || [];
  const documents = patientState.documents || [];
  const verifiedVisits = encounters.filter((enc) => enc.doctor_verification?.is_verified).length;

  const medicalRows = [
    ['Blood Group', profile.blood_group],
    ['Food Allergies', profile.allergy_food],
    ['Drug Allergies', profile.allergy_drug],
    ['Environmental Allergies', profile.allergy_environmental],
    ['Current Medications', profile.current_medications],
    ['Pre-existing Conditions', profile.pre_existing_conditions],
    ['Chronic Diseases', profile.chronic_diseases],
    ['Surgical History', profile.surgical_history],
    ['Medical History', profile.medical_history],
    ['Emergency Contact', profile.emergency_contact],
  ];

  const encounterCards = encounters.length
    ? encounters.map((enc) => {
        const verified = enc.doctor_verification?.is_verified;
        return `
          <div style="border:1px solid var(--border-default); border-radius:var(--radius-lg); padding:var(--space-4); margin-bottom:var(--space-3); display:flex; justify-content:space-between; align-items:center; gap:12px;">
            <div>
              <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                <span class="badge badge-teal">${esc(enc.department || 'OPD')}</span>
                <span style="font-size:12px; color:var(--text-muted);">${esc(enc.date || '')}</span>
                ${verified ? '<span class="badge badge-green">Verified</span>' : '<span class="badge badge-yellow">Pending</span>'}
              </div>
              <div style="font-size:15px; font-weight:700; color:var(--text-primary); margin-top:4px;">
                Token ${esc(enc.token_number || '—')} · ${esc(enc.status || '')}
              </div>
              <div style="font-size:12px; color:var(--text-secondary); margin-top:2px;">
                ${esc(enc.doctor_verification?.doctor_name || 'Awaiting physician review')}
                ${enc.doctor_verification?.doctor_notes ? ` · ${esc(enc.doctor_verification.doctor_notes)}` : ''}
              </div>
            </div>
          </div>
        `;
      }).join('')
    : `<div style="color:var(--text-muted); font-size:14px;">No consultation records yet. Start a kiosk intake when you visit.</div>`;

  const docList = documents.length
    ? documents.map((doc) => {
        const label = doc.original_filename || doc.document_type || 'document';
        const when = doc.document_date || doc.created_at || '';
        const href = doc.file_path || doc.highlighted_path || '';
        const kind = _docPreviewKind(href, label);
        return `
          <li style="display:flex; justify-content:space-between; align-items:center; gap:12px; padding:10px 0; border-bottom:1px solid var(--border-subtle); font-size:13px;">
            <div style="min-width:0; flex:1;">
              <button
                type="button"
                class="patient-doc-preview-btn"
                data-doc-url="${esc(href)}"
                data-doc-name="${esc(label)}"
                data-doc-kind="${kind}"
                style="background:none; border:none; padding:0; cursor:pointer; font-weight:700; color:var(--brand-primary); text-align:left; font:inherit;"
                ${href ? '' : 'disabled'}
              >
                ${esc(label)}
              </button>
              <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">
                ${esc(doc.document_type || 'document')} · ${esc(when)} · ${esc(doc.id)}
                ${href ? ' · <span style="color:var(--brand-primary);">Click to preview</span>' : ''}
              </div>
            </div>
            <span class="badge ${doc.ocr_status === 'SUCCESS' ? 'badge-green' : 'badge-blue'}">${esc(doc.ocr_status || 'STORED')}</span>
          </li>
        `;
      }).join('')
    : '<li style="color:var(--text-muted); font-size:13px;">No uploaded documents yet. Use “+ Upload Document” to add prescriptions or reports.</li>';

  return `
    <div class="workspace-shell">
      <aside class="workspace-sidebar">
        <div>
          <div style="padding:var(--space-3) var(--space-4); margin-bottom:var(--space-4); display:flex; align-items:center; gap:10px;">
            <div style="width:36px; height:36px; border-radius:50%; background:#0F766E; color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700;">
              ${esc((profile.full_name || 'P')[0])}
            </div>
            <div>
              <div style="font-size:14px; font-weight:700; color:var(--text-primary);">${esc(profile.full_name || 'Patient')}</div>
              <div style="font-size:11px; color:var(--text-muted); font-family:var(--font-family-mono);">${esc(profile.abha_id || '')}</div>
            </div>
          </div>

          <ul class="workspace-nav-list">
            <li><a href="#/patient/dashboard" class="workspace-nav-link active">❖ <span>Dashboard</span></a></li>
            <li><a href="#/kiosk/welcome" class="workspace-nav-link">📋 <span>Start New Intake</span></a></li>
            <li><a href="#/patient/queue" class="workspace-nav-link">🎫 <span>Live Queue Token</span></a></li>
          </ul>
        </div>

        <div>
          <button class="btn btn-ghost btn-sm" style="width:100%; justify-content:flex-start;" id="btnPatientLogout">
            🚪 Sign Out
          </button>
        </div>
      </aside>

      <main class="workspace-main-content">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:var(--space-6); gap:12px; flex-wrap:wrap;">
          <div>
            <h1 class="text-h2">Citizen Health Workspace</h1>
            <p style="font-size:14px; color:var(--text-secondary); margin-top:2px;">
              ABHA-linked longitudinal health locker
            </p>
          </div>
          <label class="btn btn-primary btn-md" style="cursor:pointer;">
            + Upload Document
            <input type="file" id="patientUploadInput" accept="image/*,.pdf" hidden />
          </label>
        </div>

        <div style="display:grid; grid-template-columns:1.2fr 1fr; gap:var(--space-6); margin-bottom:var(--space-6);">
          <div class="card" style="background:linear-gradient(135deg, #0F172A, #134E4A); color:#fff; border:none; padding:var(--space-6);">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:var(--space-6);">
              <div>
                <div style="font-size:11px; text-transform:uppercase; color:#94a3b8; letter-spacing:0.06em;">Government of India · ABDM</div>
                <div style="font-size:18px; font-weight:800; color:#fff; margin-top:2px;">ABHA DIGITAL HEALTH CARD</div>
              </div>
              <span class="badge ${profile.abha_id ? 'badge-teal' : 'badge-amber'}" style="font-size:10px;">
                ${profile.abha_id ? 'ABDM Linked' : 'ABHA Not Linked'}
              </span>
            </div>

            <div style="font-size:24px; font-weight:800; letter-spacing:3px; font-family:var(--font-family-mono); color:#5EEAD4; margin-bottom:var(--space-6);">
              ${esc(profile.abha_id || '—')}
            </div>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-4);">
              <div>
                <span style="font-size:10px; text-transform:uppercase; color:#94a3b8;">Patient Name</span>
                <div style="font-size:15px; font-weight:700;">${esc(profile.full_name || '—')}</div>
              </div>
              <div>
                <span style="font-size:10px; text-transform:uppercase; color:#94a3b8;">Linked Mobile</span>
                <div style="font-size:15px; font-weight:700; font-family:var(--font-family-mono);">${esc(profile.mobile || '—')}</div>
              </div>
            </div>
          </div>

          <div class="card" style="border-left:4px solid var(--brand-primary); display:flex; flex-direction:column; justify-content:space-between;">
            ${activeToken ? `
              <div>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:var(--space-3);">
                  <span style="font-size:12px; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Live OPD Queue Token</span>
                  <span class="badge badge-blue">${esc(activeToken.status)}</span>
                </div>
                <div style="font-size:38px; font-weight:800; color:var(--brand-primary); font-family:var(--font-family-mono);">
                  ${esc(activeToken.token)}
                </div>
                <div style="font-size:14px; font-weight:600; color:var(--text-primary); margin-top:4px;">
                  ${esc(activeToken.doctor_room || activeToken.department || 'Room pending')}
                </div>
              </div>
              <div style="display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--border-subtle); padding-top:var(--space-3); margin-top:var(--space-4);">
                <span style="font-size:13px; color:var(--text-muted);">Ahead of you: <strong>${esc(activeToken.patients_ahead ?? '—')}</strong></span>
                <span style="font-size:13px; color:var(--status-success); font-weight:700;">Wait: ~${esc(activeToken.estimated_wait_minutes ?? '—')} mins</span>
              </div>
            ` : `
              <div>
                <div style="font-size:12px; font-weight:700; color:var(--text-muted); text-transform:uppercase; margin-bottom:var(--space-3);">Live OPD Queue Token</div>
                <div style="font-size:15px; font-weight:700; color:var(--text-primary);">No active token</div>
                <p style="font-size:13px; color:var(--text-secondary); margin-top:6px;">
                  You are not currently in an OPD queue. Start a kiosk intake at the clinic to receive a token.
                </p>
              </div>
              <a href="#/kiosk/welcome" class="btn btn-secondary btn-sm" style="margin-top:var(--space-4); text-decoration:none;">Start New Intake</a>
            `}
          </div>
        </div>

        <div class="card" style="margin-bottom:var(--space-6);">
          <h3 class="text-h3" style="font-size:16px; margin-bottom:var(--space-4);">Structured Medical Profile</h3>
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:var(--space-3);">
            ${medicalRows.map(([label, value]) => `
              <div style="padding:10px 12px; background:var(--bg-surface-soft); border-radius:var(--radius-md);">
                <div style="font-size:11px; text-transform:uppercase; color:var(--text-muted); font-weight:700;">${label}</div>
                <div style="font-size:14px; font-weight:600; margin-top:4px; color:var(--text-primary);">${esc(value || 'Not recorded')}</div>
              </div>
            `).join('')}
          </div>
        </div>

        <div class="card" style="padding:0; overflow:hidden; margin-bottom:var(--space-6);">
          <div style="padding:var(--space-4) var(--space-6); background:var(--bg-surface-soft); border-bottom:1px solid var(--border-default); display:flex; justify-content:space-between; align-items:center;">
            <h3 class="text-h3" style="font-size:16px;">Consultation History</h3>
            <span class="badge ${encounters.length ? 'badge-green' : 'badge-amber'}">
              ${encounters.length} visit(s) · ${verifiedVisits} verified
            </span>
          </div>
          <div style="padding:var(--space-6);" id="patientEncounterList">
            ${encounterCards}
          </div>
        </div>

        <div class="card">
          <h3 class="text-h3" style="font-size:16px; margin-bottom:var(--space-3);">Linked Documents</h3>
          <p style="font-size:12px; color:var(--text-muted); margin:-4px 0 var(--space-3);">
            Files stay in your ABHA health locker and reappear every time you sign in.
          </p>
          <ul id="patientDocumentList" style="list-style:none; padding:0; margin:0;">${docList}</ul>
        </div>
      </main>

      <!-- Document preview modal (patient locker only) -->
      <div id="patientDocPreviewScrim" class="modal-scrim" role="dialog" aria-modal="true" aria-labelledby="patientDocPreviewTitle" hidden>
        <div class="modal-card patient-doc-preview-card">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; padding:var(--space-4) var(--space-5); border-bottom:1px solid var(--border-default);">
            <div style="min-width:0;">
              <div id="patientDocPreviewTitle" style="font-size:15px; font-weight:800; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"></div>
              <div style="font-size:11px; color:var(--text-muted); margin-top:2px;">Document preview</div>
            </div>
            <div style="display:flex; gap:8px; flex-shrink:0;">
              <a id="patientDocPreviewOpenTab" class="btn btn-secondary btn-sm" href="#" target="_blank" rel="noopener">Open in tab</a>
              <button type="button" class="btn btn-ghost btn-sm" id="patientDocPreviewClose">Close</button>
            </div>
          </div>
          <div id="patientDocPreviewBody" class="patient-doc-preview-body"></div>
        </div>
      </div>
    </div>
  `;
}

function _docPreviewKind(url = '', name = '') {
  const hay = `${url} ${name}`.toLowerCase();
  if (/\.(png|jpe?g|gif|webp|bmp|heic)(\?|$)/i.test(hay)) return 'image';
  if (/\.pdf(\?|$)/i.test(hay)) return 'pdf';
  return 'other';
}

function _closePatientDocPreview() {
  const scrim = document.getElementById('patientDocPreviewScrim');
  if (!scrim) return;
  scrim.classList.remove('open');
  scrim.hidden = true;
  const body = document.getElementById('patientDocPreviewBody');
  if (body) body.innerHTML = '';
}

function _openPatientDocPreview({ url, name, kind }) {
  const scrim = document.getElementById('patientDocPreviewScrim');
  const title = document.getElementById('patientDocPreviewTitle');
  const body = document.getElementById('patientDocPreviewBody');
  const openTab = document.getElementById('patientDocPreviewOpenTab');
  if (!scrim || !body || !url) return;

  if (title) title.textContent = name || 'Document';
  if (openTab) {
    openTab.href = url;
    openTab.style.display = '';
  }

  if (kind === 'image') {
    body.innerHTML = `
      <div class="patient-doc-preview-frame">
        <img src="${esc(url)}" alt="${esc(name || 'Uploaded document')}" />
      </div>
    `;
  } else if (kind === 'pdf') {
    body.innerHTML = `
      <div class="patient-doc-preview-frame patient-doc-preview-frame--pdf">
        <iframe src="${esc(url)}#toolbar=1&navpanes=0" title="${esc(name || 'PDF preview')}"></iframe>
      </div>
    `;
  } else {
    body.innerHTML = `
      <div style="padding:var(--space-8); text-align:center;">
        <p style="font-size:14px; color:var(--text-secondary); margin-bottom:var(--space-4);">
          Inline preview is not available for this file type. Open it in a new tab to view.
        </p>
        <a class="btn btn-primary btn-md" href="${esc(url)}" target="_blank" rel="noopener">Open document</a>
      </div>
    `;
  }

  scrim.hidden = false;
  // Force reflow so CSS transition applies
  void scrim.offsetWidth;
  scrim.classList.add('open');
}

export async function initPatientDashboard() {
  const user = store.getState().auth.user;
  if (!user) {
    window.location.hash = '#/patient/login';
    return;
  }

  const identifier = user.abha_id || user.id;
  _bindDashboardEvents(identifier);
  await refreshDashboard(identifier);
}

function _bindDashboardEvents(identifier) {
  document.getElementById('btnPatientLogout')?.addEventListener('click', async () => {
    try {
      await authApi.logout();
    } catch (err) {
      console.warn('Session revoke failed, clearing locally:', err);
    }
    store.setUser(null);
    window.location.hash = '#/patient/login';
  });

  document.getElementById('patientUploadInput')?.addEventListener('change', async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await patientApi.uploadDocument(identifier, file, 'other');
      store.addToast('Document uploaded', 'success');
      await refreshDashboard(identifier);
    } catch (err) {
      store.addToast(err.message || 'Upload failed', 'error');
    } finally {
      e.target.value = '';
    }
  });

  document.querySelectorAll('.patient-doc-preview-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      _openPatientDocPreview({
        url: btn.dataset.docUrl,
        name: btn.dataset.docName,
        kind: btn.dataset.docKind || _docPreviewKind(btn.dataset.docUrl, btn.dataset.docName),
      });
    });
  });

  document.getElementById('patientDocPreviewClose')?.addEventListener('click', _closePatientDocPreview);
  document.getElementById('patientDocPreviewScrim')?.addEventListener('click', (e) => {
    if (e.target.id === 'patientDocPreviewScrim') _closePatientDocPreview();
  });
}

function _onPreviewEscape(e) {
  if (e.key !== 'Escape') return;
  const scrim = document.getElementById('patientDocPreviewScrim');
  if (scrim?.classList.contains('open')) _closePatientDocPreview();
}

if (typeof window !== 'undefined' && !window.__patientDocPreviewEscapeBound) {
  window.__patientDocPreviewEscapeBound = true;
  document.addEventListener('keydown', _onPreviewEscape);
}

async function refreshDashboard(identifier) {
  try {
    const data = await patientApi.getDashboard(identifier);
    store.setPatientDashboard(data);
    if (data.profile || data.patient) {
      store.setUser({ ...store.getState().auth.user, ...(data.profile || data.patient) }, store.getSessionToken());
    }
    // Re-render with fresh store data
    const page = document.getElementById('pageContent');
    if (page) {
      page.innerHTML = renderPatientDashboard();
      _bindDashboardEvents(identifier);
    }
  } catch (err) {
    console.warn('Patient dashboard API fetch failed:', err);
    if (err.status === 401 || err.status === 403) {
      store.setUser(null);
      window.location.hash = '#/patient/login';
      return;
    }
    store.addToast(err.message || 'Unable to load patient records', 'error');
  }
}
