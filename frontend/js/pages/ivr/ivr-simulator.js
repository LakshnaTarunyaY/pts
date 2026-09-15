/**
 * MediKiosk Web — Page 44: 2G IVR Phone Call Simulator & Waterfall Diagnostic
 * Demonstrates the non-internet audio telephone intake channel for rural citizens.
 * Supports both real physical phone calls (Exotel DID: 040-4189-7954) and in-browser simulation.
 */

import { ivrApi } from '../../api/ivr.api.js';

export function renderIvrSimulator() {
  return `
    <div style="max-width:1100px; margin:0 auto; padding:var(--space-8) var(--space-6);">
      <!-- Top Title Bar -->
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:var(--space-6);">
        <div>
          <div style="display:flex; align-items:center; gap:8px;">
            <h1 class="text-h2">2G IVR Telephony Studio</h1>
            <span class="badge badge-green">Domestic ExoPhone DID</span>
          </div>
          <p style="font-size:14px; color:var(--text-secondary); margin-top:2px;">
            Channel 3: Ingesting conversational speech over basic 2G feature phones without internet or smartphones.
          </p>
        </div>

        <a href="#/doctor/queue" target="_blank" class="btn btn-secondary btn-md">
          Open Doctor Workstation Window 2 ↗
        </a>
      </div>

      <!-- Real Live ExoPhone Callout Banner -->
      <div style="background:linear-gradient(135deg, rgba(8, 145, 178, 0.12) 0%, rgba(16, 185, 129, 0.12) 100%); border:1.5px solid #0891b2; border-radius:var(--radius-xl); padding:16px 20px; margin-bottom:var(--space-6); display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:14px;">
        <div>
          <div style="font-size:11px; font-weight:800; color:var(--brand-primary); text-transform:uppercase; letter-spacing:0.06em;">
            🔴 Live Indian Telephony Carrier DID (Exotel)
          </div>
          <div style="font-size:22px; font-weight:800; color:#0284c7; font-family:var(--font-family-mono); margin-top:2px;">
            040-4189-7954 <span style="font-size:13px; font-weight:600; color:var(--text-secondary);">(Hyderabad Domestic DID)</span>
          </div>
          <div style="font-size:13px; color:var(--text-secondary); margin-top:3px;">
            Dial directly from any Indian mobile SIM (Airtel, Jio, Vi) or test via the interactive keypad simulator below.
          </div>
        </div>
        <div style="text-align:right;">
          <span class="badge badge-green" style="font-size:12px; padding:6px 12px;">Exotel SIP Trunk Ready</span>
          <div style="font-size:11px; color:var(--text-muted); margin-top:4px;">Trial Pilot: <strong>09513886363</strong> (Pin: <strong>9182-4452-10</strong>)</div>
        </div>
      </div>

      <div style="display:grid; grid-template-columns:380px 1fr; gap:var(--space-8); align-items:flex-start;">
        <!-- Left Column: Stylized Smartphone / Feature Phone Dialer -->
        <div class="card" style="background:#0F172A; color:#fff; border-radius:var(--radius-2xl); padding:var(--space-6); box-shadow:var(--shadow-xl); border:3px solid #1E293B;">
          <div style="text-align:center; padding-bottom:var(--space-4); border-bottom:1px solid #334155; margin-bottom:var(--space-4);">
            <div style="font-size:11px; text-transform:uppercase; color:#94a3b8;">Inbound Voice Call</div>
            <div style="font-size:18px; font-weight:700; color:#38BDF8; margin-top:2px;">040-4189-7954</div>
            <div id="ivrCallStatusBadge" class="badge badge-amber" style="margin-top:6px;">Idle · Ready to Dial</div>
          </div>

          <!-- Caller Info Fields -->
          <div style="margin-bottom:var(--space-4);">
            <label style="display:block; font-size:11px; text-transform:uppercase; color:#94a3b8; margin-bottom:4px;">Caller Phone Number</label>
            <input type="text" id="ivrCallerPhoneInput" value="9876543210" class="form-input" style="background:#1E293B; border-color:#475569; color:#fff; font-family:var(--font-family-mono);" />
          </div>

          <!-- Presets -->
          <div style="display:flex; gap:6px; margin-bottom:var(--space-4); flex-wrap:wrap;">
            <button class="btn btn-secondary btn-sm ivr-quick-preset" data-phone="9876543210" style="background:#1E293B; border-color:#334155; color:#94a3b8; font-size:11px; padding:4px 8px;">
              👤 Ramesh (Delhi)
            </button>
            <button class="btn btn-secondary btn-sm ivr-quick-preset" data-phone="9841023456" style="background:#1E293B; border-color:#334155; color:#94a3b8; font-size:11px; padding:4px 8px;">
              👤 Lakshmi (Tamil Nadu)
            </button>
            <button class="btn btn-secondary btn-sm ivr-quick-preset" data-phone="9123456789" style="background:#1E293B; border-color:#334155; color:#94a3b8; font-size:11px; padding:4px 8px;">
              👤 Rural Fallback
            </button>
          </div>

          <!-- Phone Keypad Grid -->
          <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:10px; margin-bottom:var(--space-6);">
            ${['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'].map(k => `
              <button class="btn btn-secondary" style="background:#1E293B; border-color:#334155; color:#fff; font-size:18px; font-weight:700; height:50px; border-radius:12px;" onclick="const inp = document.getElementById('ivrCallerPhoneInput'); if(inp) inp.value += '${k}';">
                ${k}
              </button>
            `).join('')}
          </div>

          <!-- Call Action Buttons -->
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-3);">
            <button id="btnStartIvrCall" class="btn btn-ayush btn-lg" style="justify-content:center; background:#10B981; border:none;">
              📞 Call AI
            </button>
            <button id="btnEndIvrCall" class="btn btn-danger btn-lg" style="justify-content:center;" disabled>
              🔴 End Call
            </button>
          </div>
        </div>

        <!-- Right Column: 4-Step Location Waterfall & Real-Time Call Dialogue -->
        <div style="display:flex; flex-direction:column; gap:var(--space-6);">
          <!-- 4-Step Waterfall Diagnostic Card -->
          <div class="card">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:var(--space-3);">
              <h3 class="text-h3" style="font-size:16px;">4-Step Waterfall Location Routing (2ms, Zero GPS)</h3>
              <button id="btnTestWaterfall" class="btn btn-secondary btn-sm">⚡ Run Diagnostic Test</button>
            </div>
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:var(--space-3);" id="waterfallStepsContainer">
              <div id="wfStep1" style="padding:10px; background:var(--bg-surface-soft); border-radius:var(--radius-md); border:1.5px solid var(--border-subtle); transition:all 0.2s ease;">
                <div style="font-size:10px; font-weight:700; color:var(--text-muted);">STEP 1: CITIZEN ABHA</div>
                <div id="wfStep1Status" style="font-size:12px; font-weight:600; color:var(--status-success); margin-top:2px;">Home Clinic Match</div>
              </div>
              <div id="wfStep2" style="padding:10px; background:var(--bg-surface-soft); border-radius:var(--radius-md); border:1.5px solid var(--border-subtle); transition:all 0.2s ease;">
                <div style="font-size:10px; font-weight:700; color:var(--text-muted);">STEP 2: DIALED DID</div>
                <div id="wfStep2Status" style="font-size:12px; font-weight:600; color:var(--text-muted); margin-top:2px;">Direct Virtual Number</div>
              </div>
              <div id="wfStep3" style="padding:10px; background:var(--bg-surface-soft); border-radius:var(--radius-md); border:1.5px solid var(--border-subtle); transition:all 0.2s ease;">
                <div style="font-size:10px; font-weight:700; color:var(--text-muted);">STEP 3: DOT MSC CIR</div>
                <div id="wfStep3Status" style="font-size:12px; font-weight:600; color:var(--text-muted); margin-top:2px;">Telecom Circle Hub</div>
              </div>
              <div id="wfStep4" style="padding:10px; background:var(--bg-surface-soft); border-radius:var(--radius-md); border:1.5px solid var(--border-subtle); transition:all 0.2s ease;">
                <div style="font-size:10px; font-weight:700; color:var(--text-muted);">STEP 4: NATIONAL DEF</div>
                <div id="wfStep4Status" style="font-size:12px; font-weight:600; color:var(--text-muted); margin-top:2px;">AIIA Apex Center</div>
              </div>
            </div>
            <div id="waterfallResultSummary" style="margin-top:var(--space-3); font-size:13px; color:var(--brand-primary); font-weight:600;">
              Assigned Clinic: All India Institute of Ayurveda (AIIA), New Delhi (Confidence: 100%)
            </div>
          </div>

          <!-- Live Telephone Speech Turns Card -->
          <div class="card" style="min-height:300px; display:flex; flex-direction:column;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:var(--space-4); border-bottom:1px solid var(--border-subtle); padding-bottom:var(--space-3);">
              <h3 class="text-h3" style="font-size:16px;">Live Telephone Turn Dialogue</h3>
              <span class="badge badge-teal" id="ivrCallTimer">00:00</span>
            </div>

            <div id="ivrDialogueTranscript" style="flex:1; display:flex; flex-direction:column; gap:var(--space-3); overflow-y:auto;">
              <div style="color:var(--text-muted); font-size:14px; text-align:center; padding:var(--space-6);">
                Dial 040-4189-7954 or click "Call AI" on the left to start an inbound voice call simulation.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function initIvrSimulator() {
  const startBtn = document.getElementById('btnStartIvrCall');
  const endBtn = document.getElementById('btnEndIvrCall');
  const phoneInput = document.getElementById('ivrCallerPhoneInput');
  const statusBadge = document.getElementById('ivrCallStatusBadge');
  const transcriptDiv = document.getElementById('ivrDialogueTranscript');
  const timerBadge = document.getElementById('ivrCallTimer');
  const testWfBtn = document.getElementById('btnTestWaterfall');
  const presets = document.querySelectorAll('.ivr-quick-preset');

  let callActive = false;
  let callSeconds = 0;
  let timerInterval = null;

  // Preset button clicks
  presets.forEach(btn => {
    btn.addEventListener('click', () => {
      const phone = btn.dataset.phone;
      if (phoneInput && phone) {
        phoneInput.value = phone;
        runWaterfallTest(phone);
      }
    });
  });

  // Waterfall diagnostic click
  async function runWaterfallTest(phone) {
    if (!testWfBtn) return;
    testWfBtn.disabled = true;
    testWfBtn.textContent = '⚡ Resolving...';

    try {
      const data = await ivrApi.resolveLocation(phone);
      const step = data.waterfall_step || 1;
      const clinic = data.clinic || {};

      // Reset all steps
      for (let i = 1; i <= 4; i++) {
        const stepEl = document.getElementById(`wfStep${i}`);
        const statusEl = document.getElementById(`wfStep${i}Status`);
        if (!stepEl || !statusEl) continue;

        if (i === step) {
          stepEl.style.borderColor = 'var(--status-success)';
          stepEl.style.background = 'var(--status-success-tint)';
          statusEl.style.color = 'var(--status-success)';
          statusEl.textContent = `✓ MATCHED (${Math.round((data.confidence || 1.0) * 100)}%)`;
        } else if (i < step) {
          stepEl.style.borderColor = 'var(--border-subtle)';
          stepEl.style.background = 'var(--bg-surface-soft)';
          statusEl.style.color = 'var(--text-muted)';
          statusEl.textContent = 'No Match';
        } else {
          stepEl.style.borderColor = 'var(--border-subtle)';
          stepEl.style.background = 'var(--bg-surface-soft)';
          statusEl.style.color = 'var(--text-muted)';
          statusEl.textContent = 'Skipped';
        }
      }

      const summaryEl = document.getElementById('waterfallResultSummary');
      if (summaryEl) {
        summaryEl.textContent = `Assigned Clinic: ${clinic.name || 'Unresolved'} (${clinic.room_number || 'room pending'}) · ${data.resolution_type} · ${data.rationale}`;
      }
    } catch (err) {
      console.warn('Waterfall test error:', err);
    } finally {
      testWfBtn.disabled = false;
      testWfBtn.textContent = '⚡ Run Diagnostic Test';
    }
  }

  if (testWfBtn) {
    testWfBtn.addEventListener('click', () => {
      const phone = phoneInput?.value?.trim() || '9876543210';
      runWaterfallTest(phone);
    });
  }

  if (startBtn) {
    startBtn.addEventListener('click', async () => {
      const phone = phoneInput.value.trim() || '9876543210';
      startBtn.disabled = true;
      endBtn.disabled = false;
      callActive = true;
      statusBadge.className = 'badge badge-green';
      statusBadge.textContent = 'Active Call · Connected';

      timerInterval = setInterval(() => {
        callSeconds += 1;
        const mins = String(Math.floor(callSeconds / 60)).padStart(2, '0');
        const secs = String(callSeconds % 60).padStart(2, '0');
        if (timerBadge) timerBadge.textContent = `${mins}:${secs}`;
      }, 1000);

      // Run waterfall test on dial
      runWaterfallTest(phone);

      // Call backend incoming call
      let backendRes = null;
      try {
        backendRes = await ivrApi.simulateIncomingCall(phone, '040-4189-7954', 'hi');
      } catch (e) {
        console.warn('IVR simulate incoming call fallback:', e);
      }

      const greeting = backendRes?.exotel_say || backendRes?.opening_prompt || 'नमस्ते! अखिल भारतीय आयुर्वेद संस्थान (AIIA) की टेलीफोन सेवा में आपका स्वागत है। आपको क्या परेशानी हो रही है?';
      const token = backendRes?.token_number || 'IVR-402';

      transcriptDiv.innerHTML = `
        <div style="padding:10px 14px; background:var(--bg-surface-soft); border-radius:12px; border:1px solid var(--border-subtle);">
          <strong style="color:var(--brand-primary); font-size:12px; text-transform:uppercase;">AI Attendant (AIIA Voice Trunk):</strong>
          <p style="font-size:14px; margin-top:2px;">"${greeting}"</p>
        </div>
      `;

      // Simulate patient answering after 2 seconds
      setTimeout(() => {
        if (!callActive) return;
        transcriptDiv.innerHTML += `
          <div style="padding:10px 14px; background:var(--brand-tint); border-radius:12px; border:1px solid var(--border-brand); align-self:flex-end; max-width:85%;">
            <strong style="color:var(--brand-primary); font-size:12px; text-transform:uppercase;">Citizen (${phone}):</strong>
            <p style="font-size:14px; margin-top:2px;">"नमस्ते, मुझे पिछले 3 दिनों से सीने में दर्द और भारीपन लग रहा है।"</p>
          </div>
        `;
      }, 2000);

      // Simulate AI follow up & red flag preemption
      setTimeout(() => {
        if (!callActive) return;
        transcriptDiv.innerHTML += `
          <div style="padding:10px 14px; background:var(--bg-surface-soft); border-radius:12px; border:1px solid var(--border-subtle);">
            <strong style="color:var(--brand-primary); font-size:12px; text-transform:uppercase;">AI Attendant (AIIA Voice Trunk):</strong>
            <p style="font-size:14px; margin-top:2px;">"यह गंभीर हो सकता है। आपकी जानकारी डॉ. एस. वर्मा को प्राथमिक आपातकालीन फ्लैग (RED) के साथ भेज दी गई है। आपका टोकन ${token} है।"</p>
          </div>
          <div style="padding:8px 12px; background:var(--status-danger-tint); border:1px solid var(--status-danger); border-radius:8px; font-size:12px; color:var(--status-danger); font-weight:700; text-align:center;">
            🚨 PRIORITY CASE CONVERGED TO DOCTOR WORKSTATION (${token})
          </div>
        `;
      }, 4500);
    });
  }

  if (endBtn) {
    endBtn.addEventListener('click', () => {
      callActive = false;
      startBtn.disabled = false;
      endBtn.disabled = true;
      statusBadge.className = 'badge badge-amber';
      statusBadge.textContent = 'Call Ended';
      if (timerInterval) clearInterval(timerInterval);
    });
  }
}

