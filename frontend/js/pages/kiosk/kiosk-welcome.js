/**
 * MediKiosk Web — Screen 01: Kiosk Welcome
 * Features interactive AI Doctor Avatar, high-visibility touch CTAs, and language quick toggle.
 */

import { store } from '../../store.js';
import { DoctorAvatar } from '../../components/avatar-3d.js';
import { kioskApi } from '../../api/kiosk.api.js';
import { tts } from '../../audio/tts-reader.js';
import { i18n } from '../../i18n.js';

let avatarInstance = null;

export function renderKioskWelcome() {
  const state = store.getState();
  const lang = state.kiosk.language || 'hi';

  const welcomeHeading = i18n.t('welcome_heading', lang);
  const welcomeSub = i18n.t('welcome_sub', lang);
  const startBtnText = i18n.t('start_intake', lang);

  return `
    <div class="kiosk-shell">
      <div class="kiosk-split">
        <!-- Left Pane (35%): Hospital Brand & Attendant Help -->
        <div class="kiosk-left-pane">
          <div class="kiosk-brand-card">
            <div style="display:flex; align-items:center; gap:12px;">
              <div style="width:44px; height:44px; border-radius:12px; background:var(--brand-primary); color:#fff; display:flex; align-items:center; justify-content:center;">
                <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 2v20M2 12h20"></path>
                </svg>
              </div>
              <div>
                <h2 style="font-size:18px; font-weight:800; line-height:1.1;">All India Institute of Ayurveda</h2>
                <div style="font-size:12px; color:var(--status-ayush); font-weight:600;">Autonomous OPD Intake Kiosk</div>
              </div>
            </div>

            <div class="kiosk-step-indicator" style="margin-top:var(--space-6);">
              Screen 01 · Lobby Reception
            </div>

            <p style="font-size:14px; color:var(--text-secondary); line-height:1.5; margin-top:var(--space-3);">
              This autonomous station prepares your case history, digitizes paper prescriptions, and assigns your queue ticket.
            </p>
          </div>

          <!-- Doctor Station Shortcut & Attendant Help -->
          <div style="display:flex; flex-direction:column; gap:var(--space-3);">
            <div id="btnKioskAudioHelp" class="kiosk-audio-help-box" style="cursor:pointer;" role="button" tabindex="0" title="Tap to hear Dr. Verma welcome you">
              <span style="font-size:24px;">🔊</span>
              <div style="font-size:13px; color:var(--text-primary);">
                <strong>Voice-Guided:</strong> Tap to hear Dr. Verma welcome you.
              </div>
            </div>

            <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px; color:var(--text-muted);">
              <span>Station ID: KIOSK-OPD-01</span>
              <a href="#/doctor/login" style="color:var(--text-muted); text-decoration:none;">🔒 Doctor Login</a>
            </div>
          </div>
        </div>

        <!-- Right Pane (65%): Doctor Avatar & Oversized Primary CTA -->
        <div class="kiosk-right-pane">
          <div class="kiosk-task-canvas" style="align-items:center; justify-content:center; text-align:center;">
            <!-- 3D / Animated Doctor Avatar Canvas Container -->
            <div id="kioskAvatarContainer" style="margin-bottom:var(--space-6);"></div>

            <h1 class="text-h1" style="margin-bottom:var(--space-3);">${welcomeHeading}</h1>
            <p class="text-body-lg" style="max-width:600px; margin-bottom:var(--space-4);">${welcomeSub}</p>

            <div style="width:100%; max-width:440px; margin-bottom:var(--space-5); text-align:left;">
              <label for="kioskReturningAbha" style="display:block; font-size:13px; font-weight:700; color:var(--text-secondary); margin-bottom:6px;">
                Returning patient? Enter ABHA (optional)
              </label>
              <input
                id="kioskReturningAbha"
                class="form-input auth-input"
                type="text"
                inputmode="numeric"
                placeholder="e.g. 91-4821-3910-4819"
                value="${(store.getState().auth.user && store.getState().auth.user.role === 'patient' && store.getState().auth.user.abha_id) ? store.getState().auth.user.abha_id : ''}"
              />
              <div style="font-size:12px; color:var(--text-muted); margin-top:6px;">
                Leave blank for a new walk-in visit. ABHA reuses your existing health record.
              </div>
              <div id="kioskAbhaError" class="auth-error" style="display:none; margin-top:8px;"></div>
            </div>

            <button id="btnKioskStart" class="btn btn-primary btn-touch" style="width:100%; max-width:440px; justify-content:center;">
              ${startBtnText} →
            </button>
          </div>

          <div class="kiosk-footer-bar">
            <span style="font-size:13px; color:var(--text-muted);">
              English · हिन्दी · தமிழ் · తెలుగు · मराठी
            </span>
            <a href="#/account-type" class="btn btn-ghost btn-sm">Switch Portal</a>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function initKioskWelcome() {
  // Mount Doctor Avatar
  avatarInstance = new DoctorAvatar('kioskAvatarContainer');
  avatarInstance.mount();

  const audioHelpBtn = document.getElementById('btnKioskAudioHelp');
  if (audioHelpBtn) {
    audioHelpBtn.addEventListener('click', () => {
      const state = store.getState();
      const lang = state.kiosk.language || 'hi';
      const greeting = lang === 'en'
        ? "Hello and welcome to All India Institute of Ayurveda. I am Dr. Verma, your clinical assistant. I will prepare your case history and queue token today. Tap the primary blue button to begin."
        : "नमस्ते! अखिल भारतीय आयुर्वेद संस्थान में आपका स्वागत है। मैं डॉक्टर वर्मा हूँ। मैं आपकी केस हिस्ट्री और ओपीडी टोकन तैयार करने में मदद करूँगा। शुरू करने के लिए नीचे दिए गए बटन को दबाएं।";
      tts.speak(greeting, lang);
    });
  }

  const startBtn = document.getElementById('btnKioskStart');
  if (startBtn) {
    startBtn.addEventListener('click', async () => {
      // Stop speech when navigating
      tts.stop();

      const abhaInput = document.getElementById('kioskReturningAbha');
      const abhaError = document.getElementById('kioskAbhaError');
      const abhaId = (abhaInput?.value || '').trim();
      if (abhaError) abhaError.style.display = 'none';

      // Bootstrap encounter with backend (optional ABHA for returning patients)
      try {
        startBtn.disabled = true;
        startBtn.textContent = abhaId ? 'Linking ABHA & Starting…' : 'Initializing Encounter...';
        const res = await kioskApi.bootstrap({
          device_channel: 'kiosk',
          language: store.getState().kiosk.language || 'hi',
          abha_id: abhaId || null,
        });
        store.setKioskBootstrapData({
          encounterId: res.encounter_id,
          patientId: res.patient_id,
          tokenNumber: res.token_number,
        });
        if (res.returning_patient) {
          store.addToast(`Welcome back${res.patient_name ? `, ${res.patient_name}` : ''}`, 'success');
        }
      } catch (e) {
        if (abhaId && e?.status === 404) {
          if (abhaError) {
            abhaError.textContent = 'ABHA Not Registered. Continue without ABHA or register first.';
            abhaError.style.display = 'block';
          }
          startBtn.disabled = false;
          startBtn.textContent = `${i18n.t('start_intake', store.getState().kiosk.language || 'hi')} →`;
          return;
        }
        // Never fabricate a token: a local-only token would never reach the doctor queue
        console.error('Kiosk bootstrap failed:', e);
        if (abhaError) {
          abhaError.textContent = `Could not start the intake: ${e.message || 'edge server unreachable'}. Please try again or ask reception for help.`;
          abhaError.style.display = 'block';
        }
        startBtn.disabled = false;
        startBtn.textContent = `${i18n.t('start_intake', store.getState().kiosk.language || 'hi')} →`;
        return;
      }
      window.location.hash = '#/kiosk/language';
    });
  }
}

export function destroyKioskWelcome() {
  tts.stop();
  if (avatarInstance) {
    avatarInstance.destroy();
    avatarInstance = null;
  }
}
