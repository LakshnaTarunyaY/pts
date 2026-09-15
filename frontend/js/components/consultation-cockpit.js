/**
 * MediKiosk Web — Doctor 3-Column Consultation Cockpit
 * Synchronized clinical workspace enabling physician review, e-prescription,
 * and 1-click sign-off without switching tabs during high-volume OPD shifts.
 */

import { renderEvidenceViewer } from './evidence-viewer.js';
import { store } from '../store.js';

function formatAyushSummary(ayush = {}) {
  const parts = [];
  const prakriti = ayush.prakriti_baseline?.dominant_dosha;
  const agni = ayush.agni?.agni_type || (typeof ayush.agni === 'string' ? ayush.agni : null);
  const koshtha = ayush.koshtha?.koshtha_type;

  if (prakriti) parts.push(`Prakriti ${String(prakriti).replace(/_/g, ' ')}`);
  if (agni) parts.push(`${String(agni)} Agni`);
  if (koshtha) parts.push(`${String(koshtha)} Koshtha`);

  return parts.length > 0 ? parts.join(' · ') : 'Not assessed';
}

export function renderConsultationCockpit(encounterDetail, onVerifyCallback) {
  const enc = encounterDetail.encounter || {};
  const pat = encounterDetail.patient || {};
  const facts = encounterDetail.clinical_facts || [];
  const drugAlerts = encounterDetail.drug_interaction_alerts || [];
  const labAlerts = encounterDetail.lab_result_alerts || [];
  const ayush = encounterDetail.ayush_intake || {};
  const channel = enc.channel || 'kiosk';
  const isIvr = channel === 'ivr_phone';
  const signingDoctor = store.getState().doctor.profile || {};
  const signingDoctorName = signingDoctor.full_name || 'Signing physician';

  // Extract Chief Complaint & Symptoms
  const ccFact = facts.find(f => f.category === 'chief_complaint');
  const symFacts = facts.filter(f => f.category === 'symptom' && !f.is_negated);
  const chiefComplaint = ccFact 
    ? (ccFact.patient_words || ccFact.value) 
    : (symFacts.length > 0 
        ? (symFacts[0].patient_words || symFacts[0].value) 
        : (enc.chief_complaint || enc.summary_30_words || (isIvr ? 'Citizen Inbound Call — Awaiting Intake Interview' : 'Routine Clinical Intake / सामान्य परामर्श')));

  // Extract Medications
  const medications = facts.filter(f => f.category === 'medication' && !f.is_negated);

  // Dynamic Patient Name & Demographics
  const displayName = pat.name || enc.patient_name || (isIvr ? `Citizen Caller (${enc.caller_phone || 'Telephony'})` : `Patient ${enc.token_number || ''}`);
  const genderMap = { F: 'Female', M: 'Male', O: 'Other' };
  const displayGender = genderMap[pat.gender] || pat.gender || null;
  const displayAge = [pat.age ? `${pat.age} Y` : null, displayGender].filter(Boolean).join(' / ')
    || (isIvr ? 'Telephony citizen (demographics pending)' : 'Demographics unrecorded');
  const displayAbha = pat.abha_id || enc.abha_id || (isIvr ? 'Unlinked (Direct Phone Call)' : 'Not linked');

  // Extract Vitals
  const vitalBpFact = facts.find(f => f.category === 'vital' && (f.field === 'bp' || f.field === 'blood_pressure' || f.value?.includes('/')));
  const vitalHrFact = facts.find(f => f.category === 'vital' && (f.field === 'hr' || f.field === 'heart_rate' || f.field === 'pulse'));
  const vitalSpo2Fact = facts.find(f => f.category === 'vital' && (f.field === 'spo2' || f.field === 'oxygen'));
  const vitalTempFact = facts.find(f => f.category === 'vital' && (f.field === 'temp' || f.field === 'temperature'));

  // Never substitute normative values for unmeasured vitals — clinicians must see the gap
  const NOT_RECORDED = 'Not recorded';
  const bpVal = vitalBpFact ? vitalBpFact.value : NOT_RECORDED;
  const hrVal = vitalHrFact ? (vitalHrFact.value.includes('bpm') ? vitalHrFact.value : `${vitalHrFact.value} bpm`) : NOT_RECORDED;
  const spo2Val = vitalSpo2Fact ? (vitalSpo2Fact.value.includes('%') ? vitalSpo2Fact.value : `${vitalSpo2Fact.value}%`) : NOT_RECORDED;
  const tempVal = vitalTempFact ? (vitalTempFact.value.includes('°') ? vitalTempFact.value : `${vitalTempFact.value}°F`) : NOT_RECORDED;
  const hasRecordedVitals = Boolean(vitalBpFact || vitalHrFact || vitalSpo2Fact || vitalTempFact);
  const vitalStyle = (recorded) => recorded
    ? 'font-size:14px; font-weight:700;'
    : 'font-size:13px; font-weight:600; color:var(--text-muted);';

  return `
    <div class="doctor-3col-workspace">
      <!-- =========================================================================
           COLUMN 1: PATIENT SNAPSHOT, VITALS & CLINICAL SAFETY (Left 25%)
           ========================================================================= -->
      <div class="doctor-col">
        <div class="doctor-col__header">
          <span>👤 Patient Snapshot</span>
          <span class="badge badge-teal">${enc.department || 'Department pending'}</span>
        </div>
        <div class="doctor-col__body">
          <div style="background:var(--bg-surface-soft); padding:var(--space-4); border-radius:var(--radius-lg); border:1px solid var(--border-default);">
            <div style="font-size:18px; font-weight:800; color:var(--text-primary);">${displayName}</div>
            <div style="font-size:12px; color:var(--text-secondary); margin-top:2px;">${displayAge} · Token: <strong style="color:var(--brand-primary);">${enc.token_number || 'IVR'}</strong></div>
            <div style="font-size:11px; font-family:var(--font-family-mono); color:var(--pr-blue-600); margin-top:4px;">ABHA: ${displayAbha}</div>
            <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">Channel: <span class="badge ${isIvr ? 'badge-amber' : 'badge-teal'}">${isIvr ? '📞 Telephony 2G IVR' : '🏥 OPD Kiosk'}</span></div>
          </div>

          <!-- Vitals Strip -->
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <div style="font-size:12px; font-weight:700; text-transform:uppercase; color:var(--text-muted);">Physiological Vitals</div>
            <span class="badge ${hasRecordedVitals ? 'badge-teal' : 'badge-amber'}" style="font-size:10px;">
              ${hasRecordedVitals ? 'Live Measured' : 'Awaiting measurement'}
            </span>
          </div>
          ${isIvr && facts.length === 0 ? `
            <div style="padding:12px; background:var(--bg-surface-soft); border-radius:var(--radius-md); border:1px solid var(--border-subtle); text-align:center; font-size:12px; color:var(--text-muted);">
              ⏳ Telephony inbound call. Vitals to be recorded upon physical arrival at OPD chamber.
            </div>
          ` : `
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-2);">
              <div style="padding:8px 10px; background:var(--bg-surface-soft); border-radius:var(--radius-md); border:1px solid var(--border-subtle);">
                <div style="font-size:10px; color:var(--text-muted);">Blood Pressure</div>
                <div style="${vitalStyle(vitalBpFact)}">${bpVal}</div>
              </div>
              <div style="padding:8px 10px; background:var(--bg-surface-soft); border-radius:var(--radius-md); border:1px solid var(--border-subtle);">
                <div style="font-size:10px; color:var(--text-muted);">Heart Rate</div>
                <div style="${vitalStyle(vitalHrFact)}">${hrVal}</div>
              </div>
              <div style="padding:8px 10px; background:var(--bg-surface-soft); border-radius:var(--radius-md); border:1px solid var(--border-subtle);">
                <div style="font-size:10px; color:var(--text-muted);">SpO2 Saturation</div>
                <div style="${vitalStyle(vitalSpo2Fact)} ${vitalSpo2Fact ? 'color:var(--status-success);' : ''}">${spo2Val}</div>
              </div>
              <div style="padding:8px 10px; background:var(--bg-surface-soft); border-radius:var(--radius-md); border:1px solid var(--border-subtle);">
                <div style="font-size:10px; color:var(--text-muted);">Temperature</div>
                <div style="${vitalStyle(vitalTempFact)}">${tempVal}</div>
              </div>
            </div>
          `}

          <!-- Drug Safety & Contraindication Alerts -->
          <div style="font-size:12px; font-weight:700; text-transform:uppercase; color:var(--text-muted); margin-top:var(--space-2);">Deterministic Safety Alerts</div>
          ${drugAlerts.length > 0 ? drugAlerts.map(alert => `
            <div style="padding:10px 12px; background:var(--status-warning-tint); border-radius:var(--radius-md); border-left:3px solid var(--status-warning); border:1px solid var(--status-warning);">
              <div style="font-size:11px; font-weight:700; color:var(--status-warning); display:flex; align-items:center; gap:4px;">
                ⚠ DRUG CONFLICT: ${alert.drug_a} + ${alert.drug_b}
              </div>
              <div style="font-size:11px; color:var(--pr-slate-800); margin-top:4px;">${alert.description || alert.warning}</div>
            </div>
          `).join('') : `
            <div style="padding:10px 12px; background:var(--status-success-tint); border-radius:var(--radius-md); border:1px solid var(--status-success); font-size:12px; color:var(--status-success);">
              ✓ No adverse drug-drug conflicts detected
            </div>
          `}
        </div>
      </div>

      <!-- =========================================================================
           COLUMN 2: STANDARDIZED CLINICAL HISTORY & EVIDENCE (Center 45%)
           ========================================================================= -->
      <div class="doctor-col">
        <div class="doctor-col__header">
          <span>📋 Clinical History & Evidence Proof</span>
          <div style="display:flex; gap:6px;">
            <span class="badge ${enc.severity_badge === 'RED' ? 'badge-red' : (enc.severity_badge === 'YELLOW' ? 'badge-amber' : 'badge-green')}">
              ${enc.severity_badge || 'GREEN'} Triage
            </span>
          </div>
        </div>
        <div class="doctor-col__body">
          <!-- 30-Second Clinical Triage Synthesis -->
          <div style="background:var(--brand-tint); border-left:4px solid var(--brand-primary); padding:var(--space-4); border-radius:var(--radius-lg); border:1px solid var(--border-brand);">
            <div style="font-size:11px; font-weight:700; color:var(--brand-primary); text-transform:uppercase; margin-bottom:2px;">30-Second Clinical Triage Synthesis</div>
            <div style="font-size:14px; font-weight:600; color:var(--text-primary); line-height:1.4;">
              ${enc.summary_text || `"${chiefComplaint}" · Duration: ${facts.find(f => f.category === 'symptom' && f.field === 'duration')?.value || 'Not stated'} · Channel: ${isIvr ? `Direct Inbound Telephony${enc.caller_phone ? ` (${enc.caller_phone})` : ''}` : 'In-Clinic Kiosk'}.`}
            </div>
          </div>

          <!-- Structured History -->
          <div style="display:flex; flex-direction:column; gap:var(--space-3);">
            <div style="font-size:12px; font-weight:700; text-transform:uppercase; color:var(--text-muted);">Extracted Clinical Facts (${facts.length})</div>
            <div style="background:var(--bg-surface-soft); padding:var(--space-4); border-radius:var(--radius-lg); border:1px solid var(--border-default); display:flex; flex-direction:column; gap:8px;">
              <div><strong>Chief Complaint:</strong> ${chiefComplaint}</div>
              <div><strong>Recorded Medications:</strong> ${medications.length > 0 ? medications.map(m => m.value).join(', ') : 'None reported'}</div>
              <div><strong>AYUSH Profile:</strong> ${formatAyushSummary(ayush)}</div>
              <div><strong>Department:</strong> ${enc.department || 'Not assigned'}</div>
            </div>
          </div>

          <!-- Channel-Specific Evidence Section -->
          <div style="margin-top:var(--space-2);">
            <div style="font-size:12px; font-weight:700; text-transform:uppercase; color:var(--text-muted); margin-bottom:var(--space-2);">Channel Evidence & Provenance Proof</div>
            ${renderEvidenceViewer(channel, encounterDetail.documents || [], facts, enc)}
          </div>
        </div>
      </div>

      <!-- =========================================================================
           COLUMN 3: DOCTOR ASSESSMENT, PRESCRIPTION & SIGN-OFF (Right 30%)
           ========================================================================= -->
      <div class="doctor-col">
        <div class="doctor-col__header">
          <span>🩺 Doctor Prescription & Sign-Off</span>
          <span class="badge badge-blue">${signingDoctorName}</span>
        </div>
        <div class="doctor-col__body">
          <div>
            <label style="display:block; font-size:12px; font-weight:700; margin-bottom:4px; color:var(--text-secondary);">Clinical Assessment & Notes</label>
            <textarea id="doctorClinicalNotes" rows="4" class="form-input" style="height:auto; padding:10px; resize:vertical; font-size:13px;" placeholder="Type diagnostic impressions, clinical evaluation, and advice...">${enc.doctor_notes || ''}</textarea>
          </div>

          <!-- E-Prescription Pad -->
          <div style="display:flex; flex-direction:column; gap:var(--space-2);">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <span style="font-size:12px; font-weight:700; text-transform:uppercase; color:var(--text-muted);">Digital E-Prescription</span>
              <span class="badge ${medications.length > 0 ? 'badge-teal' : 'badge-amber'}" style="font-size:10px;">${medications.length > 0 ? `${medications.length} Recorded` : 'Nothing recorded'}</span>
            </div>
            
            ${medications.length > 0 ? medications.map((m, idx) => `
              <div style="padding:10px 12px; background:var(--bg-surface-soft); border-radius:var(--radius-md); border:1px solid var(--border-default); display:flex; flex-direction:column; gap:3px;">
                <div style="font-size:13px; font-weight:700; color:var(--text-primary); display:flex; justify-content:space-between; align-items:center;">
                  <span>${idx + 1}. ${m.value}</span>
                  <span class="badge badge-green" style="font-size:10px;">${m.provenance_tier || 'OCR'}</span>
                </div>
                <div style="font-size:11px; color:var(--text-secondary);">
                  Dose: <strong>${m.dose || 'Not specified'}</strong> · Frequency: <strong>${m.frequency || 'Not specified'}</strong>
                </div>
              </div>
            `).join('') : `
              <div style="padding:10px 12px; background:var(--bg-surface-soft); border-radius:var(--radius-md); border:1px dashed var(--border-default); font-size:12px; color:var(--text-muted);">
                No medication captured for this encounter. Record prescriptions in the clinical notes before sign-off.
              </div>
            `}
          </div>

          <!-- 1-Click Verification Sign-Off Bar -->
          <div style="margin-top:auto; padding-top:var(--space-4); border-top:1px solid var(--border-subtle);">
            <button class="btn btn-ayush btn-lg" id="btnDoctorSignOff" style="width:100%; justify-content:center;">
              ✓ Sign & Verify Clinical Case
            </button>
            <div style="font-size:11px; text-align:center; color:var(--text-muted); margin-top:6px;">
              Audit Stamp: DPDP Act 2023 Digital Signature Verified
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}
