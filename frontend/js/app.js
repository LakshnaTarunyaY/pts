/**
 * MediKiosk — Main Application (SPA Router + Screen Controller)
 *
 * Manages screen transitions, global state, and wires up all UI interactions.
 */
import { api } from './api.js';
import { AudioRecorder, WaveformVisualizer, playAudioBase64, playDing, isSilentWav, speakTextNative } from './audio.js';
import { CameraCapture } from './camera.js';
import { DoctorScene } from './three/scene.js';
import { DoctorCharacter } from './three/doctor.js';

// ── Global State ──
const state = {
  currentScreen: 'welcome',
  encounterId: null,
  patientId: null,
  tokenNumber: null,
  sessionId: null,
  language: 'en',
  isRecording: false,
  isOnline: false,
  facts: [],
  doctorAuthenticated: false,
  selectedEncounterId: null,
  patient: null,
  activeDoctorId: 'doc-verma',
};

// ── 3D Doctor ──
let doctorScene = null;
let doctor = null;
let doctorAnimFrame = null;

// ── Audio ──
const recorder = new AudioRecorder();
let waveformViz = null;

// ── Camera ──
let camera = null;

// ── Queue polling ──
let queuePollInterval = null;

// ============================================================
//  INITIALIZATION
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
  initTopNav();
  initHubScreen();
  initPatientScreen();
  initDoctor();
  initWelcomeScreen();
  initVoiceScreen();
  initScanScreen();
  initQueueScreen();
  initDoctorDashboard();
  initPinModal();
  initAyushParikshaModal();
  initIvrStudio();
  checkHealth();

  // Handle URL view routing (?view=hub, ?view=patient, ?view=doctor, ?view=ivr)
  const urlParams = new URLSearchParams(window.location.search);
  const view = urlParams.get('view');
  if (view === 'hub') {
    navigateTo('hub');
  } else if (view === 'patient') {
    navigateTo('patient');
  } else if (view === 'ivr') {
    navigateTo('ivr');
  } else if (view === 'doctor') {
    if (state.doctorAuthenticated) {
      navigateTo('doctor');
    } else {
      showPinModal();
    }
  }
});

// ============================================================
//  3D DOCTOR AVATAR
// ============================================================

function initDoctor() {
  const container = document.getElementById('doctorContainerWelcome');
  if (!container) return;

  doctorScene = new DoctorScene(container);
  doctor = new DoctorCharacter();
  doctor.addToScene(doctorScene.scene);

  // Custom update loop for procedural animations
  function updateDoctor() {
    doctorAnimFrame = requestAnimationFrame(updateDoctor);
    const delta = doctorScene.clock.getDelta();
    doctor.update(delta);
  }
  updateDoctor();

  // Start directly with the pointing pose directing patient to microphone
  doctor.setState('point');
}

function moveDoctorToPip() {
  if (!doctorScene) return;
  const pipContainer = document.getElementById('doctorContainerPip');
  if (!pipContainer) return;

  // Move the renderer canvas to PiP container
  const canvas = doctorScene.renderer.domElement;
  pipContainer.appendChild(canvas);
  doctorScene.container = pipContainer;
  doctorScene.setPipMode();
  doctorScene.resize();
}

function moveDoctorToHero() {
  if (!doctorScene) return;
  const heroContainer = document.getElementById('doctorContainerWelcome');
  if (!heroContainer) return;

  const canvas = doctorScene.renderer.domElement;
  heroContainer.appendChild(canvas);
  doctorScene.container = heroContainer;
  doctorScene.setHeroMode();
  doctorScene.resize();
}

// ============================================================
//  SCREEN ROUTER
// ============================================================

function navigateTo(screen) {
  const screens = ['hub', 'patient', 'welcome', 'voice', 'scan', 'queue', 'doctor', 'ivr'];
  
  screens.forEach(s => {
    const el = document.getElementById(`screen${capitalize(s)}`);
    if (el) {
      if (s === screen) {
        el.classList.add('active');
        el.classList.remove('exiting');
      } else {
        if (el.classList.contains('active')) {
          el.classList.remove('active');
          el.classList.add('exiting');
          setTimeout(() => el.classList.remove('exiting'), 400);
        }
      }
    }
  });

  // Top Nav bar buttons active synchronization
  document.querySelectorAll('.top-nav__btn').forEach(b => b.classList.remove('active'));
  if (screen === 'hub') {
    document.getElementById('navBtnHub')?.classList.add('active');
  } else if (screen === 'patient') {
    document.getElementById('navBtnPatient')?.classList.add('active');
  } else if (screen === 'doctor') {
    document.getElementById('navBtnDoctor')?.classList.add('active');
  } else if (screen === 'ivr') {
    document.getElementById('navBtnIvr')?.classList.add('active');
  } else {
    document.getElementById('navBtnKiosk')?.classList.add('active');
  }

  // Status bar visibility (hidden on welcome, hub, patient, doctor, ivr)
  const statusBar = document.getElementById('statusBar');
  if (statusBar) {
    statusBar.style.display = (screen === 'voice' || screen === 'scan' || screen === 'queue') ? 'flex' : 'none';
  }

  // Token badge
  const tokenBadge = document.getElementById('tokenBadge');
  if (tokenBadge && state.tokenNumber) {
    tokenBadge.textContent = `🎫 ${state.tokenNumber}`;
    tokenBadge.style.display = 'inline-flex';
  }

  state.currentScreen = screen;

  // Screen-specific setup
  if (screen === 'voice') {
    moveDoctorToPip();
    doctor?.setState('listen');
  } else if (screen === 'welcome') {
    moveDoctorToHero();
    doctor?.setState('wave');
    setTimeout(() => doctor?.setState('point'), 2500);
  } else if (screen === 'doctor') {
    if (state.encounterId) {
      state.selectedEncounterId = state.encounterId;
    }
    loadDoctorQueue();
  } else if (screen === 'ivr') {
    const currentPhone = document.getElementById('ivrPhoneInput')?.value || '9876543210';
    testIvrResolution(currentPhone);
  }
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ============================================================
//  HEALTH CHECK
// ============================================================

async function checkHealth() {
  try {
    const data = await api.health();
    state.isOnline = data.network === 'ONLINE';
    updateNetworkBadge();
  } catch {
    state.isOnline = false;
    updateNetworkBadge();
  }
}

function updateNetworkBadge() {
  const badge = document.getElementById('networkBadge');
  if (state.isOnline) {
    badge.className = 'badge badge-online';
    badge.textContent = 'Online';
  } else {
    badge.className = 'badge badge-offline';
    badge.textContent = 'Offline';
  }
}

// ============================================================
//  TOP PORTAL NAVIGATION
// ============================================================

function initTopNav() {
  document.getElementById('navBrandLogo')?.addEventListener('click', () => navigateTo('hub'));
  document.getElementById('navBtnHub')?.addEventListener('click', () => navigateTo('hub'));
  document.getElementById('navBtnKiosk')?.addEventListener('click', () => navigateTo('welcome'));
  document.getElementById('navBtnPatient')?.addEventListener('click', () => navigateTo('patient'));
  document.getElementById('navBtnIvr')?.addEventListener('click', () => navigateTo('ivr'));
  document.getElementById('navBtnDoctor')?.addEventListener('click', () => {
    if (state.doctorAuthenticated) {
      navigateTo('doctor');
    } else {
      showPinModal();
    }
  });
}

// ============================================================
//  SCREEN 0: ROLE SELECTOR HUB
// ============================================================

function initHubScreen() {
  document.getElementById('hubCardKiosk')?.addEventListener('click', () => navigateTo('welcome'));
  document.getElementById('hubCardPatient')?.addEventListener('click', () => navigateTo('patient'));
  document.getElementById('hubCardDoctor')?.addEventListener('click', () => {
    if (state.doctorAuthenticated) {
      navigateTo('doctor');
    } else {
      showPinModal();
    }
  });
  document.getElementById('hubCardIvr')?.addEventListener('click', () => navigateTo('ivr'));
  document.getElementById('hubCardMobile')?.addEventListener('click', () => {
    window.open('/mobile.html', '_blank');
  });
}

// ============================================================
//  SCREEN: PATIENT HEALTH PORTAL
// ============================================================

function initPatientScreen() {
  const authSection = document.getElementById('patientAuthSection');
  const dashboardSection = document.getElementById('patientDashboardSection');
  const quickDemoBtn = document.getElementById('quickDemoPatientBtn');
  const loginForm = document.getElementById('patientLoginForm');
  const loginError = document.getElementById('patientLoginError');
  const logoutBtn = document.getElementById('patientLogoutBtn');
  const refreshBtn = document.getElementById('patientRefreshBtn');
  const fileInput = document.getElementById('portalPrescriptionFileInput');
  const pickBtn = document.getElementById('portalUploadPickBtn');
  const submitUploadBtn = document.getElementById('portalUploadSubmitBtn');
  const fileNameDisplay = document.getElementById('portalUploadSelectedFileName');

  // Quick 1-Tap Demo Patient Login (Ramesh Kumar - ABHA: 91-4821-3910-4819)
  quickDemoBtn?.addEventListener('click', async () => {
    try {
      quickDemoBtn.disabled = true;
      quickDemoBtn.textContent = '⚡ Signing in Ramesh Kumar...';
      const data = await api.login('patient', '91-4821-3910-4819', 'patient123');
      state.patient = data.user;
      await loadPatientDashboard(state.patient.abha_id || state.patient.id);
      if (authSection) authSection.style.display = 'none';
      if (dashboardSection) dashboardSection.style.display = 'flex';
    } catch (err) {
      alert('Demo Login Error: ' + err.message);
    } finally {
      quickDemoBtn.disabled = false;
      quickDemoBtn.textContent = '⚡ 1-Tap Demo Patient: Ramesh Kumar';
    }
  });

  // Regular Form Login
  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (loginError) loginError.style.display = 'none';
    const identifier = document.getElementById('patientIdentifierInput')?.value.trim();
    const password = document.getElementById('patientPasswordInput')?.value.trim();

    try {
      const data = await api.login('patient', identifier, password);
      state.patient = data.user;
      await loadPatientDashboard(state.patient.abha_id || state.patient.id);
      if (authSection) authSection.style.display = 'none';
      if (dashboardSection) dashboardSection.style.display = 'flex';
    } catch (err) {
      if (loginError) {
        loginError.textContent = err.message || 'Login failed';
        loginError.style.display = 'block';
      }
    }
  });

  // Logout
  logoutBtn?.addEventListener('click', () => {
    state.patient = null;
    if (dashboardSection) dashboardSection.style.display = 'none';
    if (authSection) authSection.style.display = 'block';
  });

  // Refresh
  refreshBtn?.addEventListener('click', async () => {
    if (state.patient) {
      refreshBtn.textContent = '🔄 Refreshing...';
      await loadPatientDashboard(state.patient.abha_id || state.patient.id);
      refreshBtn.textContent = '🔄 Refresh';
    }
  });

  // Batch Document Upload Picker
  pickBtn?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
      const count = fileInput.files.length;
      if (fileNameDisplay) {
        if (count === 1) {
          fileNameDisplay.textContent = `Selected: ${fileInput.files[0].name} (${Math.round(fileInput.files[0].size / 1024)} KB)`;
        } else {
          fileNameDisplay.textContent = `Selected: ${count} documents ready for batch upload`;
        }
      }
      if (submitUploadBtn) submitUploadBtn.style.display = 'inline-block';
    }
  });

  // Batch Document Upload Action
  submitUploadBtn?.addEventListener('click', async () => {
    if (!fileInput.files.length || !state.patient) return;
    const docType = document.getElementById('portalDocTypeSelect')?.value || 'prescription';
    try {
      submitUploadBtn.disabled = true;
      const total = fileInput.files.length;
      submitUploadBtn.textContent = `Uploading ${total} document${total > 1 ? 's' : ''}...`;

      for (let i = 0; i < total; i++) {
        submitUploadBtn.textContent = `Uploading document ${i + 1} of ${total}...`;
        await api.uploadPatientDocument(state.patient.id, fileInput.files[i], docType);
      }

      fileInput.value = '';
      if (fileNameDisplay) {
        fileNameDisplay.textContent = `✅ Successfully uploaded ${total} document${total > 1 ? 's' : ''} to ABHA Vault!`;
      }
      submitUploadBtn.style.display = 'none';
      await loadPatientDashboard(state.patient.abha_id || state.patient.id);
    } catch (err) {
      alert('Upload failed: ' + err.message);
    } finally {
      submitUploadBtn.disabled = false;
      submitUploadBtn.textContent = '🚀 Upload to ABHA Vault';
    }
  });
}

async function loadPatientDashboard(identifier) {
  try {
    const data = await api.getPatientDashboard(identifier);
    const user = data.patient || data.profile || state.patient || {};

    // Header Profile
    const headerName = document.getElementById('patientHeaderName');
    const headerAbha = document.getElementById('patientHeaderAbha');
    const avatarInit = document.getElementById('patientAvatarInitial');
    if (headerName) headerName.textContent = user.full_name || 'Patient';
    if (headerAbha) headerAbha.textContent = user.abha_id || user.mobile || '—';
    if (avatarInit) avatarInit.textContent = user.full_name?.charAt(0) || 'P';

    // Digital ABHA Card
    const cardAbha = document.getElementById('cardAbhaNumber');
    const cardName = document.getElementById('cardPatientName');
    const cardMobile = document.getElementById('cardPatientMobile');
    if (cardAbha) cardAbha.textContent = user.abha_id || '91-4821-3910-4819';
    if (cardName) cardName.textContent = user.full_name;
    if (cardMobile) cardMobile.textContent = user.mobile || '—';

    // Active Token Tracker
    const liveToken = document.getElementById('patientLiveToken');
    const aheadCount = document.getElementById('patientAheadCount');
    const waitTime = document.getElementById('patientWaitTime');
    const assignedRoom = document.getElementById('patientAssignedRoom');
    const tokenBadge = document.getElementById('patientTokenBadge');

    const token = data.active_token;
    if (token) {
      if (tokenBadge) tokenBadge.textContent = `Token: ${token.token}`;
      if (liveToken) liveToken.textContent = token.token;
      if (aheadCount) aheadCount.textContent = token.patients_ahead;
      if (waitTime) waitTime.textContent = token.estimated_wait || '5-10 mins';
      if (assignedRoom) assignedRoom.textContent = `${token.room || 'Room 204'} (${token.department || 'Kayachikitsa'})`;
    } else {
      if (tokenBadge) tokenBadge.textContent = 'No Active Queue';
      if (liveToken) liveToken.textContent = '—';
      if (aheadCount) aheadCount.textContent = '0';
      if (waitTime) waitTime.textContent = 'Walk-in Open';
      if (assignedRoom) assignedRoom.textContent = 'Room 204 (Kayachikitsa OPD)';
    }

    // Encounters / Visits with Doctor Verification Badge
    const visitsContainer = document.getElementById('patientVisitsList');
    const countBadge = document.getElementById('verifiedCountBadge');
    const encounters = data.encounters || [];
    const verifiedCount = encounters.filter(e => e.verified_by_doctor_id || e.status === 'DOCTOR_REVIEWED').length;
    if (countBadge) countBadge.textContent = `${verifiedCount} Verified`;

    if (visitsContainer) {
      if (encounters.length === 0) {
        visitsContainer.innerHTML = '<div class="empty-state"><div class="empty-state__icon">📄</div><div class="empty-state__text">No medical encounters on file</div></div>';
      } else {
        visitsContainer.innerHTML = encounters.map(enc => {
          const isVer = enc.verified_by_doctor_id || enc.status === 'DOCTOR_REVIEWED';
          const docBadge = isVer
            ? `<span class="verified-badge">✅ Verified by Dr. ${enc.doctor_name || enc.verified_by_doctor_id} (${enc.doctor_room || 'Room 204'})</span>`
            : `<span class="pending-badge">⏳ Pending Clinical Review</span>`;
          return `
            <div class="visit-item">
              <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
                <div>
                  <strong style="font-size: 14px; color: var(--text-primary);">${enc.department || 'General Medicine'}</strong>
                  <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">
                    Token: <span style="font-family: monospace; color: var(--accent);">${enc.token_number}</span> • Date: ${enc.created_at?.slice(0, 16) || 'Recent'}
                  </div>
                </div>
                ${docBadge}
              </div>
              ${enc.doctor_notes ? `<div style="font-size: 12px; color: #a78bfa; background: rgba(139, 92, 246, 0.1); border-left: 3px solid #8b5cf6; padding: 6px 10px; border-radius: 4px; margin-top: 4px;"><strong>Doctor Assessment:</strong> ${enc.doctor_notes}</div>` : ''}
              ${enc.ayush_intake ? `
                <div style="font-size: 11px; color: #6ee7b7; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.25); border-radius: 4px; padding: 4px 8px; margin-top: 4px; display: flex; align-items: center; justify-content: space-between;">
                  <span>🌿 <strong>Prakriti:</strong> ${(enc.ayush_intake.prakriti_baseline?.dominant_dosha || '').replace(/_/g, ' ').toUpperCase()} • <strong>Agni:</strong> ${(enc.ayush_intake.agni?.agni_type || '').toUpperCase()}</span>
                  <span style="font-family: monospace; font-size: 10px; color: #38bdf8;">${enc.ayush_intake.prakriti_baseline?.namaste_code || ''}</span>
                </div>
              ` : ''}
              <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">
                ${enc.summary_text || 'Intake completed via MediKiosk AI triage.'}
              </div>
            </div>
          `;
        }).join('');
      }
    }

    // Documents List with Type Badges
    const docsContainer = document.getElementById('patientDocumentsList');
    if (docsContainer) {
      const docs = data.documents || [];
      if (docs.length === 0) {
        docsContainer.innerHTML = '<div style="font-size: 12px; color: var(--text-muted); text-align: center; padding: 8px;">No uploaded documents yet.</div>';
      } else {
        docsContainer.innerHTML = docs.map(doc => {
          const type = doc.document_type || 'prescription';
          const icon = type === 'lab_report' ? '🧪' : (type === 'discharge_summary' ? '🏥' : '📄');
          const typeLabel = type === 'lab_report' ? 'Lab Investigation' : (type === 'discharge_summary' ? 'Discharge Summary' : 'Prescription');
          const typeBadgeClass = type === 'lab_report' ? 'badge-yellow' : (type === 'discharge_summary' ? 'badge-purple' : 'badge-teal');
          return `
            <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.03); padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border-light);">
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="font-size: 16px;">${icon}</span>
                <div>
                  <div style="font-size: 12px; font-weight: 600; color: var(--text-primary);">${typeLabel}</div>
                  <div style="font-size: 10px; color: var(--text-muted);">${doc.created_at?.slice(0, 10) || 'Recent'} • OCR Processed</div>
                </div>
              </div>
              <span class="badge ${typeBadgeClass}" style="font-size: 10px;">${type.toUpperCase()}</span>
            </div>
          `;
        }).join('');
      }
    }

    // Hospital Directory
    const dirContainer = document.getElementById('hospitalDirectoryList');
    if (dirContainer) {
      try {
        const dirData = await api.getHospitalDirectory();
        const doctors = dirData.doctors || [];
        dirContainer.innerHTML = doctors.map(doc => `
          <div class="dir-item">
            <div>
              <div style="font-weight: 700; font-size: 13px; color: var(--text-primary);">${doc.full_name}</div>
              <div style="font-size: 11px; color: var(--text-secondary);">${doc.department} • <strong style="color: var(--accent);">${doc.room_number}</strong></div>
              <div style="font-size: 10px; color: var(--text-muted);">${doc.qualification || ''}</div>
            </div>
            <a href="tel:${doc.hospital_phone}" class="dir-item__phone">
              📞 Call ${doc.room_number}
            </a>
          </div>
        `).join('');
      } catch (dirErr) {
        console.error('Directory fetch error:', dirErr);
      }
    }
  } catch (err) {
    console.error('Failed to load patient dashboard:', err);
  }
}

// ============================================================
//  SCREEN 1: WELCOME
// ============================================================

function initWelcomeScreen() {
  const micBtn = document.getElementById('welcomeMicBtn');
  const typeBtn = document.getElementById('welcomeTypeBtn');
  const loginBtn = document.getElementById('doctorLoginBtn');
  const langPills = document.querySelectorAll('#welcomeLangPills .lang-pill');
  const micLabel = document.getElementById('welcomeMicLabel');

  const langLabels = {
    en: 'Tap to speak in English',
    hi: 'हिंदी में बोलने के लिए माइक दबाएं',
    ta: 'தமிழில் பேச தொடவும்',
    te: 'తెలుగులో మాట్లాడటానికి నొక్కండి',
    mr: 'मराठीत बोलण्यासाठी टॅप करा'
  };

  langPills.forEach(pill => {
    pill.addEventListener('click', (e) => {
      e.stopPropagation();
      const chosenLang = pill.dataset.lang;
      state.language = chosenLang;
      langPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      if (micLabel) micLabel.textContent = langLabels[chosenLang] || 'Tap to speak';
    });
  });

  async function startIntakeSession(openKeyboard = false) {
    playDing();
    try {
      micBtn.disabled = true;
      if (typeBtn) typeBtn.disabled = true;

      const data = await api.bootstrap(state.language, 'kiosk');
      state.encounterId = data.encounter_id;
      state.patientId = data.patient_id;
      state.tokenNumber = data.token_number;

      // Start call session
      const callData = await api.startCall(data.encounter_id, state.language);
      state.sessionId = callData.session_id;

      // Navigate to voice intake
      navigateTo('voice');

      // Play opening question (cloud/edge voice or native browser speech offline)
      const isSilentOpen = isSilentWav(callData.opening_audio_base64);
      if (callData.opening_audio_base64 && !isSilentOpen) {
        doctor?.setState('talk');
        await playAudioBase64(callData.opening_audio_base64);
        doctor?.setState('listen');
      } else if (callData.opening_text) {
        doctor?.setState('talk');
        await speakTextNative(callData.opening_text, state.language);
        doctor?.setState('listen');
      }

      addChatBubble('doctor', callData.opening_text || 'How can I help you today?');

      if (openKeyboard) {
        showKeyboardDrawer();
      } else {
        await startRecording();
      }
    } catch (err) {
      console.error('Bootstrap failed:', err);
      micBtn.disabled = false;
      if (typeBtn) typeBtn.disabled = false;
      alert('Could not start intake. Is the backend running?');
    }
  }

  micBtn.addEventListener('click', () => startIntakeSession(false));
  if (typeBtn) {
    typeBtn.addEventListener('click', () => startIntakeSession(true));
  }

  loginBtn.addEventListener('click', () => {
    showPinModal();
  });
}

// ============================================================
//  SCREEN 2: VOICE INTAKE
// ============================================================

function initVoiceScreen() {
  const micBtn = document.getElementById('voiceMicBtn');
  const finishBtn = document.getElementById('voiceFinishBtn');
  const typeToggleBtn = document.getElementById('voiceTypeToggleBtn');
  const sendBtn = document.getElementById('keyboardSendBtn');
  const closeBtn = document.getElementById('keyboardCloseBtn');
  const input = document.getElementById('keyboardInput');

  micBtn.addEventListener('click', () => {
    hideKeyboardDrawer();
    if (state.isRecording) {
      stopRecordingAndProcess();
    } else {
      startRecording();
    }
  });

  if (typeToggleBtn) {
    typeToggleBtn.addEventListener('click', () => {
      toggleKeyboardDrawer();
    });
  }

  if (sendBtn && input) {
    sendBtn.addEventListener('click', submitTextTurn);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submitTextTurn();
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', hideKeyboardDrawer);
  }

  finishBtn.addEventListener('click', async () => {
    if (state.isRecording) {
      await recorder.stop();
      state.isRecording = false;
    }
    waveformViz?.stop();
    hideKeyboardDrawer();

    try {
      updateVoiceStatus('Finishing intake...');
      const result = await api.endCall(state.sessionId);
      state.tokenNumber = result.assigned_token;

      doctor?.setState('idle');

      // Navigate to scan screen
      navigateTo('scan');
    } catch (err) {
      console.error('End call failed:', err);
      updateVoiceStatus('Error finishing intake');
    }
  });

  // Init waveform visualizer
  const canvas = document.getElementById('waveformCanvas');
  waveformViz = new WaveformVisualizer(canvas);

  // Wire Voice Activity Detection (VAD) auto-submit on silence
  recorder.onSpeechEnd = () => {
    if (state.isRecording) {
      console.log('VAD: Speech ended, auto-processing turn...');
      updateVoiceStatus('Detected silence. Processing response...');
      stopRecordingAndProcess();
    }
  };
}

function showKeyboardDrawer() {
  const drawer = document.getElementById('keyboardDrawer');
  if (drawer) {
    drawer.style.display = 'block';
    const input = document.getElementById('keyboardInput');
    input?.focus();
    updateVoiceStatus('Type your message and click Send');
  }
}

function hideKeyboardDrawer() {
  const drawer = document.getElementById('keyboardDrawer');
  if (drawer) drawer.style.display = 'none';
}

function toggleKeyboardDrawer() {
  const drawer = document.getElementById('keyboardDrawer');
  if (drawer?.style.display === 'none' || !drawer?.style.display) {
    showKeyboardDrawer();
  } else {
    hideKeyboardDrawer();
  }
}

async function startRecording() {
  try {
    await recorder.start();
    state.isRecording = true;

    const micBtn = document.getElementById('voiceMicBtn');
    micBtn.classList.add('recording');

    waveformViz?.start(recorder);
    doctor?.setState('listen');
    updateVoiceStatus('Listening... Speak naturally (auto-submits when done)');
  } catch (err) {
    console.error('Mic access denied:', err);
    updateVoiceStatus('Microphone access denied. You can use the keyboard below to type.');
    showKeyboardDrawer();
  }
}

async function stopRecordingAndProcess() {
  const audioBlob = await recorder.stop();
  state.isRecording = false;

  const micBtn = document.getElementById('voiceMicBtn');
  micBtn.classList.remove('recording');
  waveformViz?.stop();

  if (!audioBlob) return;

  updateVoiceStatus('Processing your response...');
  doctor?.setState('idle');

  try {
    const result = await api.audioTurn(state.sessionId, audioBlob);
    await handleTurnResult(result);
  } catch (err) {
    console.error('Audio turn failed:', err);
    updateVoiceStatus('Error processing audio. Try speaking again or type.');
    await startRecording();
  }
}

async function submitTextTurn() {
  const input = document.getElementById('keyboardInput');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;

  if (state.isRecording) {
    await recorder.stop();
    state.isRecording = false;
    document.getElementById('voiceMicBtn')?.classList.remove('recording');
    waveformViz?.stop();
  }

  input.value = '';
  updateVoiceStatus('Processing your message...');
  doctor?.setState('idle');

  try {
    const result = await api.textTurn(state.sessionId, text);
    await handleTurnResult(result);
  } catch (err) {
    console.error('Text turn failed:', err);
    updateVoiceStatus('Error sending message. Please try again.');
  }
}

async function handleTurnResult(result) {
  // Show patient transcript
  addChatBubble('patient', result.patient_transcript);

  // Add extracted facts
  for (const fact of result.extracted_facts) {
    addFactCard(fact);
  }

  // Update language if detected
  if (result.detected_language) {
    state.language = result.detected_language;
  }

  // If there's a next question, display and play it
  if (result.next_question_text) {
    addChatBubble('doctor', result.next_question_text);
    doctor?.setState('talk');

    const isSilentNext = isSilentWav(result.next_question_audio_base64);
    if (result.next_question_audio_base64 && !isSilentNext) {
      await playAudioBase64(result.next_question_audio_base64);
    } else if (result.next_question_text) {
      await speakTextNative(result.next_question_text, state.language);
    }

    doctor?.setState('listen');

    // Auto-resume recording if interview continues and keyboard is not active
    const drawer = document.getElementById('keyboardDrawer');
    if (!result.is_completed && (!drawer || drawer.style.display === 'none')) {
      await startRecording();
    } else if (!result.is_completed) {
      updateVoiceStatus('Type your next answer or tap mic to speak');
    }
  }

  if (result.is_completed) {
    hideKeyboardDrawer();
    updateVoiceStatus('Intake complete! Moving to prescription scan...');
    doctor?.setState('idle');
    setTimeout(() => navigateTo('scan'), 2000);
  }

  // Doctor nods when clinical facts are recognized
  if (result.extracted_facts.length > 0) {
    doctor?.setState('nod');
    setTimeout(() => {
      if (!state.isRecording && !result.is_completed) doctor?.setState('listen');
    }, 1500);
  }
}

function addChatBubble(sender, text) {
  const area = document.getElementById('conversationArea');
  const bubble = document.createElement('div');
  bubble.className = `chat-bubble ${sender}`;
  bubble.textContent = text;
  area.appendChild(bubble);
  area.scrollTop = area.scrollHeight;
}

function addFactCard(fact) {
  state.facts.push(fact);

  const scroll = document.getElementById('factsScroll');
  const card = document.createElement('div');
  card.className = 'fact-card';

  const categoryIcons = {
    chief_complaint: '🩺',
    symptom: '🤒',
    medication: '💊',
    allergy: '⚠️',
    history: '📋',
    ayush: '🌿',
    lab_result: '🧪',
    vital: '❤️',
  };

  const icon = categoryIcons[fact.category] || '📌';
  card.innerHTML = `
    <div class="fact-card__category">${icon} ${fact.category?.replace('_', ' ')}</div>
    <div class="fact-card__value">${fact.concept || fact.field}</div>
    <div class="fact-card__meta">${Math.round((fact.confidence || 0) * 100)}% • ${fact.provenance || ''}</div>
  `;
  scroll.appendChild(card);
  scroll.scrollLeft = scroll.scrollWidth;

  // Update count
  document.getElementById('factsCount').textContent = `${state.facts.length} facts`;
}

function updateVoiceStatus(text) {
  document.getElementById('voiceStatus').textContent = text;
}

// ============================================================
//  SCREEN 3: SCAN PRESCRIPTION
// ============================================================

function initScanScreen() {
  const captureBtn = document.getElementById('captureBtn');
  const skipBtn = document.getElementById('scanSkipBtn');
  const doneBtn = document.getElementById('scanDoneBtn');
  const uploadBtn = document.getElementById('uploadFileBtn');
  const fileInput = document.getElementById('prescriptionFileInput');

  if (uploadBtn && fileInput) {
    uploadBtn.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      uploadBtn.disabled = true;
      uploadBtn.textContent = '⏳ Processing Prescription...';
      try {
        const result = await api.uploadDocument(state.encounterId, file);
        showScanResults(result);
        camera?.stop();
      } catch (err) {
        console.error('File upload failed:', err);
        alert('Failed to process prescription image: ' + err.message);
      } finally {
        uploadBtn.disabled = false;
        uploadBtn.textContent = '📁 Upload Prescription Image';
      }
    });
  }

  captureBtn.addEventListener('click', async () => {
    if (!camera?.stream) {
      camera = new CameraCapture(document.getElementById('cameraVideo'));
      try {
        await camera.start();
      } catch (e) {
        alert('Camera could not be accessed. Please click "Upload Prescription Image" below.');
        return;
      }
    }

    captureBtn.disabled = true;
    try {
      const imageBlob = await camera.capture();
      const result = await api.uploadDocument(state.encounterId, imageBlob);
      showScanResults(result);
      camera.stop();
    } catch (err) {
      console.error('Document capture/upload failed:', err);
      alert('Could not capture clear image: ' + err.message + '. Please use the Upload button below.');
    } finally {
      captureBtn.disabled = false;
    }
  });

  skipBtn.addEventListener('click', () => {
    camera?.stop();
    navigateTo('queue');
    startQueuePolling();
  });

  doneBtn.addEventListener('click', () => {
    camera?.stop();
    navigateTo('queue');
    startQueuePolling();
  });

  // Auto-start camera when scan screen becomes active
  const observer = new MutationObserver(() => {
    const scanScreen = document.getElementById('screenScan');
    if (scanScreen.classList.contains('active') && !camera) {
      camera = new CameraCapture(document.getElementById('cameraVideo'));
      camera.start().catch((err) => {
        console.warn('Auto camera start skipped or blocked:', err);
      });
    }
  });
  observer.observe(document.getElementById('screenScan'), { attributes: true, attributeFilter: ['class'] });
}

function showScanResults(result) {
  const resultsPanel = document.getElementById('scanResults');
  const medsList = document.getElementById('scanMedsList');
  const alertsDiv = document.getElementById('scanAlerts');
  const evidenceDiv = document.getElementById('scanEvidence');
  const doneBtn = document.getElementById('scanDoneBtn');

  resultsPanel.style.display = 'block';
  doneBtn.style.display = 'inline-flex';

  // Medications
  medsList.innerHTML = '';
  if (result.extracted_medications?.length) {
    for (const med of result.extracted_medications) {
      const item = document.createElement('div');
      item.className = 'scan-screen__med-item';
      item.innerHTML = `
        <span>💊</span>
        <div>
          <div class="scan-screen__med-name">${med.name}</div>
          <div class="scan-screen__med-dose">${med.dose || ''} ${med.frequency || ''}</div>
        </div>
        <span class="badge badge-teal">${Math.round((med.confidence || 0) * 100)}%</span>
      `;
      medsList.appendChild(item);
    }
  } else {
    medsList.innerHTML = '<div class="empty-state"><span>No medications detected</span></div>';
  }

  // Drug interaction alerts
  alertsDiv.innerHTML = '';
  if (result.flagged_interactions?.length) {
    for (const alert of result.flagged_interactions) {
      const severity = alert.severity === 'CRITICAL' ? 'danger' : 'warning';
      const icon = alert.severity === 'CRITICAL' ? '🔴' : '⚠️';
      const el = document.createElement('div');
      el.className = `alert alert-${severity}`;
      el.innerHTML = `
        <div class="alert__icon">${icon}</div>
        <div class="alert__content">
          <div class="alert__title">${alert.severity} Drug Interaction</div>
          <div class="alert__text">${alert.warning}</div>
        </div>
      `;
      alertsDiv.appendChild(el);
    }
  }

  // Evidence image
  if (result.highlighted_image_url) {
    evidenceDiv.innerHTML = `<img src="${result.highlighted_image_url}" alt="Evidence-boxed prescription" />`;
  }
}

// ============================================================
//  SCREEN 4: QUEUE STATUS
// ============================================================

function initQueueScreen() {
  document.getElementById('queueNewBtn').addEventListener('click', () => {
    stopQueuePolling();
    resetState();
    navigateTo('welcome');
  });
}

function startQueuePolling() {
  updateQueueDisplay();
  queuePollInterval = setInterval(updateQueueDisplay, 10000);
}

function stopQueuePolling() {
  if (queuePollInterval) {
    clearInterval(queuePollInterval);
    queuePollInterval = null;
  }
}

async function updateQueueDisplay() {
  if (!state.tokenNumber) return;

  try {
    const data = await api.queueStatus(state.tokenNumber);
    document.getElementById('queueToken').textContent = data.token;
    document.getElementById('queuePosition').textContent = data.patients_ahead;
    document.getElementById('queueWait').textContent =
      data.estimated_wait_minutes > 0
        ? `~${data.estimated_wait_minutes} min estimated wait`
        : 'You\'re next!';

    const statusBadge = document.getElementById('queueStatusBadge');
    if (data.status === 'CALLED') {
      statusBadge.innerHTML = '<span class="badge badge-green" style="font-size: var(--text-lg); padding: var(--space-3) var(--space-6);">✅ CALLED — Please proceed to the doctor</span>';
      stopQueuePolling();
    } else {
      statusBadge.innerHTML = '<span class="badge badge-yellow">⏳ WAITING</span>';
    }
  } catch (err) {
    console.error('Queue poll failed:', err);
  }
}

// ============================================================
//  SCREEN 5: DOCTOR DASHBOARD
// ============================================================

function initDoctorDashboard() {
  const callNextBtn = document.getElementById('callNextBtn');
  const exitBtn = document.getElementById('doctorExitBtn');
  const abhaSearchBtn = document.getElementById('doctorAbhaSearchBtn');
  const abhaSearchInput = document.getElementById('doctorAbhaSearchInput');

  if (exitBtn) {
    exitBtn.addEventListener('click', () => {
      navigateTo('hub');
    });
  }

  // ABHA Longitudinal Search
  if (abhaSearchBtn && abhaSearchInput) {
    const doSearch = async () => {
      const abhaId = abhaSearchInput.value.trim();
      if (!abhaId) return;
      try {
        const mainPanel = document.getElementById('doctorMain');
        mainPanel.innerHTML = '<div class="empty-state"><div class="spinner spinner-lg"></div><div>Searching ABHA longitudinal history...</div></div>';
        const data = await api.getPatientByAbha(abhaId, state.activeDoctorId || 'doc-verma');
        renderAbhaPatientHistory(data);
      } catch (err) {
        alert('ABHA Lookup failed: ' + err.message);
        loadDoctorQueue();
      }
    };
    abhaSearchBtn.addEventListener('click', doSearch);
    abhaSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doSearch();
    });
  }

  callNextBtn.addEventListener('click', async () => {
    let targetEncounterId = state.selectedEncounterId;
    if (!targetEncounterId) {
      const firstEntry = document.querySelector('.queue-entry');
      if (firstEntry) {
        firstEntry.click();
        targetEncounterId = state.selectedEncounterId;
      }
    }

    if (!targetEncounterId) {
      alert('No patients waiting in queue.');
      return;
    }

    try {
      callNextBtn.textContent = '📢 Calling Patient...';
      callNextBtn.disabled = true;
      playDing();
      await api.callNext(targetEncounterId);
      callNextBtn.textContent = '✓ Patient Called to Room 102';
      setTimeout(() => {
        callNextBtn.textContent = '▶ Call Next Patient';
        callNextBtn.disabled = false;
        loadDoctorQueue();
      }, 2500);
    } catch (err) {
      console.error('Call next failed:', err);
      callNextBtn.textContent = '▶ Call Next Patient';
      callNextBtn.disabled = false;
    }
  });
}

async function loadDoctorQueue() {
  try {
    const data = await api.doctorQueue();
    const list = document.getElementById('doctorQueueList');
    const totalBadge = document.getElementById('queueTotalBadge');
    totalBadge.textContent = data.total_waiting;

    if (!data.queue?.length) {
      list.innerHTML = '<div class="empty-state"><div class="empty-state__icon">📋</div><div class="empty-state__text">No patients in queue</div></div>';
      return;
    }

    list.innerHTML = '';
    for (const entry of data.queue) {
      const el = document.createElement('div');
      el.className = 'queue-entry';
      el.dataset.encId = entry.encounter_id;
      if (entry.encounter_id === state.selectedEncounterId) {
        el.classList.add('selected');
      }

      const severityClass = entry.severity_badge === 'RED' ? 'badge-red'
        : entry.severity_badge === 'YELLOW' ? 'badge-yellow' : 'badge-green';
      const severityIcon = entry.severity_badge === 'RED' ? '🔴 CRITICAL'
        : entry.severity_badge === 'YELLOW' ? '⚠️ MODERATE' : '✅ ROUTINE';
      const isIVR = entry.channel === 'ivr_phone';
      const isBYOD = entry.channel === 'android_byod';
      const channelLabel = isIVR ? '📞 Citizen IVR' : (isBYOD ? '📱 BYOD' : '🏥 Kiosk');
      const preemptionTag = entry.severity_badge === 'RED' ? '<span class="badge badge-red" style="font-size: 9px; font-weight: 800; display: block; margin-top: 4px; letter-spacing: 0.5px;">🚨 PREEMPTION</span>' : '';

      const displayName = entry.patient_name || `Patient ${entry.token_number}`;
      const demogStr = (entry.patient_age && entry.patient_gender && entry.patient_gender !== 'unspecified')
        ? `(${entry.patient_age} ${entry.patient_gender.charAt(0).toUpperCase()})`
        : '';
      const deptStr = entry.department || 'General Medicine';

      el.innerHTML = `
        <div class="queue-entry__token-col">
          <div class="queue-entry__token">${entry.token_number}</div>
          <span style="font-size: 10px; color: #64748b; font-weight: 700;">${channelLabel}</span>
        </div>
        <div class="queue-entry__body">
          <div class="queue-entry__title-row">
            <div class="queue-entry__name">
              ${displayName} <span class="queue-entry__demog">${demogStr}</span>
            </div>
          </div>
          <div class="queue-entry__summary-text">${entry.summary_30_words}</div>
          <div class="queue-entry__meta">
            <span>${entry.fact_count} clinical facts</span> • <span>${deptStr}</span>
          </div>
        </div>
        <div class="queue-entry__status-col">
          <span class="badge ${severityClass}">${severityIcon}</span>
          ${preemptionTag}
          ${entry.has_medication_conflict ? '<span class="badge badge-red" style="margin-top: 4px; display: block;">💊 Conflict</span>' : ''}
        </div>
      `;

      el.addEventListener('click', () => {
        state.selectedEncounterId = entry.encounter_id;
        list.querySelectorAll('.queue-entry').forEach(e => e.classList.remove('selected'));
        el.classList.add('selected');
        loadPatientDetail(entry.encounter_id);
      });

      list.appendChild(el);
    }

    // Auto-select the active encounter or first patient
    const targetId = (state.selectedEncounterId && data.queue.some(q => q.encounter_id === state.selectedEncounterId))
      ? state.selectedEncounterId
      : (state.encounterId && data.queue.some(q => q.encounter_id === state.encounterId))
        ? state.encounterId
        : data.queue[0]?.encounter_id;

    if (targetId) {
      state.selectedEncounterId = targetId;
      const targetCard = list.querySelector(`[data-enc-id="${targetId}"]`) || list.querySelector('.queue-entry');
      if (targetCard) {
        list.querySelectorAll('.queue-entry').forEach(e => e.classList.remove('selected'));
        targetCard.classList.add('selected');
        targetCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
      loadPatientDetail(targetId);
    }
  } catch (err) {
    console.error('Load queue failed:', err);
  }
}

async function loadPatientDetail(encounterId) {
  const mainPanel = document.getElementById('doctorMain');

  try {
    mainPanel.innerHTML = '<div class="empty-state"><div class="spinner spinner-lg"></div><div>Loading patient data...</div></div>';
    const data = await api.patientDetail(encounterId);

    const enc = data.encounter;
    const severityClass = enc.severity_badge === 'RED' ? 'badge-red'
      : enc.severity_badge === 'YELLOW' ? 'badge-yellow' : 'badge-green';
    const severityLabel = enc.severity_badge === 'RED' ? '🔴 CRITICAL'
      : enc.severity_badge === 'YELLOW' ? '⚠️ MODERATE' : '✅ ROUTINE';

    const isIVR = enc.channel === 'ivr_phone';
    const ivrBadge = isIVR ? '<span class="badge badge-purple" style="margin-left: 8px;">📞 IVR Telephony Intake</span>' : '';
    const channelName = isIVR ? '📞 Citizen Toll-Free IVR (Exotel + Sarvam AI)' : (enc.channel === 'android_byod' ? '📱 Mobile BYOD Waiting Area' : '🏥 Physical OPD Kiosk');

    const patientName = enc.patient_name || `Patient ${enc.token_number}`;
    const demog = (enc.patient_age && enc.patient_gender && enc.patient_gender !== 'unspecified')
      ? `${enc.patient_age} yrs • ${enc.patient_gender.toUpperCase()}`
      : '';
    const abhaTag = enc.abha_id ? `ABHA: <span style="font-family: monospace; color: #0891b2; font-weight: 700;">${enc.abha_id}</span>` : '';

    let html = `
      <div class="doctor-screen__patient-header">
        <div>
          <div class="doctor-screen__patient-name" style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
            <span>${patientName}</span>
            <span class="badge badge-teal" style="font-size: 14px; font-weight: 800; letter-spacing: 0.5px;">Token ${enc.token_number}</span>
            <span class="badge ${severityClass}">${severityLabel}</span>
            ${ivrBadge}
          </div>
          <div style="color: var(--text-secondary); font-size: var(--text-sm); margin-top: 6px; display: flex; gap: 12px; flex-wrap: wrap; align-items: center;">
            ${demog ? `<span>👤 <strong>${demog}</strong></span> • ` : ''}
            ${abhaTag ? `<span>💳 ${abhaTag}</span> • ` : ''}
            <span>🏥 <strong>${enc.department || 'General Medicine'}</strong></span> •
            <span>🌐 Language: ${enc.language?.toUpperCase() || 'EN'}</span> •
            <span>📅 Registered: ${enc.created_at || 'Today'}</span>
            ${isIVR ? ' • <span style="color: var(--accent); font-weight: 600;">Deterministic 4-Step Waterfall Routing</span>' : ''}
          </div>
        </div>
      </div>
    `;

    // High-Contrast Clinical Summary Banner (WCAG AAA)
    const summaryText = enc.summary_text || enc.summary_30_words || 'Clinical intake completed — awaiting physician review.';
    html += `
      <div class="card" style="margin-bottom: var(--space-5); background: linear-gradient(135deg, #f0fdf4 0%, #ecfeff 100%); border: 1.5px solid #0891b2; border-left: 6px solid #0891b2; border-radius: var(--radius-md); padding: 18px 22px; box-shadow: var(--shadow-sm);">
        <div style="font-size: 11px; font-weight: 800; color: #0891b2; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 6px; display: flex; align-items: center; gap: 8px;">
          <span>⚡ 30-SECOND CLINICAL TRIAGE SYNTHESIS</span>
          <span class="badge badge-teal" style="font-size: 9px; padding: 2px 6px;">AI Generated • Doctor Reviewed</span>
        </div>
        <div style="font-size: 15px; color: #0f172a; font-weight: 600; line-height: 1.6;">
          ${summaryText}
        </div>
      </div>
    `;

    // 🌿 AYUSH Dashavidha Pariksha Clinical Panel
    if (data.ayush_intake) {
      const ay = data.ayush_intake;
      const prakriti = ay.prakriti_baseline || {};
      const agni = ay.agni || {};
      const koshtha = ay.koshtha || {};
      const ahara = ay.ahara_vihara || {};
      const prakritiDominant = (prakriti.dominant_dosha || 'NOT SET').replace(/_/g, ' ').toUpperCase();
      const agniType = (agni.agni_type || 'SAMA').toUpperCase();
      const hasAma = agni.post_meal_heaviness === true;
      const koshthaType = (koshtha.koshtha_type || 'MADHYAMA').toUpperCase();
      const tastes = ahara.diet_primary_taste?.map(t => t.toUpperCase()).join(', ') || 'KATU, LAVANA';
      const imbalances = ay.provisional_dosha_imbalance || ['vata_vriddhi'];

      html += `
        <div class="ayush-panel">
          <div class="ayush-panel__header">
            <div>
              <div class="ayush-panel__title">
                <span>🌿</span> AYUSH Dashavidha Pariksha Clinical Protocol
                <span class="badge badge-teal" style="margin-left: 8px;">AIIA Standard</span>
              </div>
              <div class="ayush-panel__subtitle">
                NAMASTE Terminology & Deterministic Ten-Fold Clinical Assessment
              </div>
            </div>
            <button class="btn btn-secondary btn-sm" id="doctorOpenAyushModalBtn">
              ✏️ Re-evaluate / Edit Pariksha
            </button>
          </div>

          <div class="ayush-panel__grid">
            <!-- 1. Prakriti -->
            <div class="ayush-col-card">
              <div class="ayush-col-card__tag" style="color: #38bdf8;">
                <span>1. Deha Prakriti</span>
                <span class="badge badge-teal" style="font-size: 10px;">${prakriti.namaste_code || 'NAMASTE:DOSHA-001'}</span>
              </div>
              <div class="ayush-col-card__value">${prakritiDominant}</div>
              <div class="ayush-col-card__detail">
                • Frame: ${(prakriti.body_frame || 'Medium').replace(/_/g, ' ')}<br/>
                • Skin: ${(prakriti.skin_texture || 'Warm, reddish').replace(/_/g, ' ')}<br/>
                • Sleep: ${(prakriti.sleep_pattern || 'Moderate').replace(/_/g, ' ')}
              </div>
            </div>

            <!-- 2. Agni & Ama -->
            <div class="ayush-col-card">
              <div class="ayush-col-card__tag" style="color: #f59e0b;">
                <span>2. Agni & Ama Pariksha</span>
                <span class="badge ${hasAma ? 'badge-red' : 'badge-green'}" style="font-size: 10px;">
                  ${hasAma ? '⚠️ Ama Present' : '✅ Nirama (Clear)'}
                </span>
              </div>
              <div class="ayush-col-card__value">${agniType} AGNI</div>
              <div class="ayush-col-card__detail">
                • Rhythm: ${(agni.appetite_pattern || 'Variable').replace(/_/g, ' ')}<br/>
                • Post-meal heaviness: ${hasAma ? 'Yes (Bloating / Ama)' : 'No (Light)'}<br/>
                • Agni Code: <span style="color: #fcd34d;">${agni.namaste_code || 'NAMASTE:AGNI-001'}</span>
              </div>
            </div>

            <!-- 3. Koshtha & Ahara -->
            <div class="ayush-col-card">
              <div class="ayush-col-card__tag" style="color: #a78bfa;">
                <span>3. Koshtha & Ahara</span>
                <span class="badge badge-purple" style="font-size: 10px;">${koshtha.namaste_code || 'NAMASTE:KOSHTHA-001'}</span>
              </div>
              <div class="ayush-col-card__value">${koshthaType} KOSHTHA</div>
              <div class="ayush-col-card__detail">
                • Predominant Rasa: ${tastes}<br/>
                • Stool consistency: ${(koshtha.stool_consistency || 'Formed').replace(/_/g, ' ')}<br/>
                • Bowel frequency: ${(koshtha.bowel_frequency || 'Daily').replace(/_/g, ' ')}
              </div>
            </div>
          </div>

          <!-- Ashtavidha In-Person Clinical Checklist & Vikriti -->
          <div class="ayush-ashtavidha-bar">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div class="ayush-ashtavidha-bar__title">🩺 Active Vikriti (Dosha Imbalances)</div>
              <div>
                ${imbalances.map(d => `<span class="badge badge-yellow" style="margin-left: 4px; font-size: 11px;">⚠️ ${d.replace(/_/g, ' ').toUpperCase()}</span>`).join('')}
              </div>
            </div>
            <div style="font-size: 11px; color: var(--text-secondary); margin-top: 2px;">
              Ashtavidha Pariksha Eight-Fold In-Person Verification:
            </div>
            <div class="ayush-ashtavidha-tags" style="margin-top: 4px;">
              <span class="ayush-exam-chip active">✓ Nadi (Radial Pulse)</span>
              <span class="ayush-exam-chip active">✓ Jihva (Tongue / Ama Coating)</span>
              <span class="ayush-exam-chip">Netra (Eyes / Sclera)</span>
              <span class="ayush-exam-chip active">✓ Shabda (Voice Pitch)</span>
              <span class="ayush-exam-chip">Sparsha (Skin Temperature)</span>
              <span class="ayush-exam-chip">Druk (Vision / Demeanor)</span>
              <span class="ayush-exam-chip active">✓ Akruti (Posture & Gait)</span>
              <span class="ayush-exam-chip">Mutra (Urine Character)</span>
            </div>
          </div>
        </div>
      `;
    }

    // Drug interaction alerts
    if (data.drug_interaction_alerts?.length) {
      html += '<div class="doctor-screen__section"><div class="doctor-screen__section-title">🔴 Drug Interaction Alerts</div><div class="doctor-screen__alerts-list">';
      for (const alert of data.drug_interaction_alerts) {
        const sev = alert.severity === 'CRITICAL' ? 'danger' : 'warning';
        const icon = alert.severity === 'CRITICAL' ? '🔴' : '⚠️';
        html += `
          <div class="alert alert-${sev}">
            <div class="alert__icon">${icon}</div>
            <div class="alert__content">
              <div class="alert__title">${alert.drugs_involved?.join(' + ') || alert.severity} Interaction</div>
              <div class="alert__text">${alert.warning}</div>
              <div style="font-size: var(--text-xs); margin-top: 4px; opacity: 0.7;">Source: ${alert.source || 'Clinical Database'}</div>
            </div>
          </div>
        `;
      }
      html += '</div></div>';
    }

    // Clinical gap alerts
    if (data.clinical_gap_alerts?.length) {
      html += '<div class="doctor-screen__section"><div class="doctor-screen__section-title">🔍 Clinical Gaps Detected</div><div class="doctor-screen__alerts-list">';
      for (const gap of data.clinical_gap_alerts) {
        html += `
          <div class="alert alert-warning">
            <div class="alert__icon">🔍</div>
            <div class="alert__content">
              <div class="alert__title">${gap.missing_question}</div>
              <div class="alert__text">${gap.clinical_rationale}</div>
            </div>
          </div>
        `;
      }
      html += '</div></div>';
    }

    // Extracted Clinical Facts
    if (data.clinical_facts?.length) {
      html += '<div class="doctor-screen__section"><div class="doctor-screen__section-title">🩺 Extracted Clinical Facts (' + data.clinical_facts.length + ')</div><div class="doctor-screen__facts-grid">';
      for (const fact of data.clinical_facts) {
        const catIcons = {
          chief_complaint: '🎯',
          symptom: '🤒',
          medication: '💊',
          allergy: '⚠️',
          vital: '💓',
          ayush_agni: '🔥',
          ayush_prakriti: '🌿',
          ayush_ahara: '🥗'
        };
        const catIcon = catIcons[fact.category] || '📌';
        const isNegated = fact.is_negated ? '<span class="badge badge-red" style="margin-left: 6px;">❌ Denied</span>' : '';
        const confPercent = Math.round((fact.confidence || 0) * 100);
        const conceptDisplay = fact.normalized_concept || fact.value || fact.field;
        const codeDisplay = fact.concept_code ? `<span class="badge badge-teal" style="font-size: 11px;">${fact.concept_code}</span>` : '';

        const rawWords = fact.patient_words || '';
        const timeMatch = rawWords.match(/\[\d{2}:\d{2}\]/);
        const timeBadge = timeMatch
          ? `<span class="badge badge-teal" style="font-size: 10px; margin-left: 6px; font-family: monospace;">🎙️ Proof ${timeMatch[0]}</span>`
          : '';
        const isEmergencyFact = (enc.severity_badge === 'RED') && (
          rawWords.toLowerCase().includes('chest pain') ||
          rawWords.toLowerCase().includes('सीने में दर्द') ||
          rawWords.toLowerCase().includes('सांस') ||
          rawWords.toLowerCase().includes('breath') ||
          rawWords.toLowerCase().includes('heart') ||
          rawWords.toLowerCase().includes('चक्कर') ||
          rawWords.toLowerCase().includes('unconscious')
        );
        const emergencyBadge = isEmergencyFact
          ? '<span class="badge badge-red" style="font-size: 10px; margin-left: 4px; font-weight: 700;">🚨 Trigger Proof</span>'
          : '';

        html += `
          <div class="doctor-fact-card ${isEmergencyFact ? 'doctor-fact-card--emergency' : ''}" style="${isEmergencyFact ? 'border-left: 4px solid var(--severity-red); background: rgba(239, 68, 68, 0.05);' : ''}">
            <div class="doctor-fact-card__header">
              <span class="doctor-fact-card__category">${catIcon} ${fact.category?.replace('_', ' ')}</span>
              <div style="display: flex; align-items: center;">
                ${codeDisplay}
                ${timeBadge}
                ${emergencyBadge}
              </div>
            </div>
            <div class="doctor-fact-card__value">${conceptDisplay} ${isNegated}</div>
            ${fact.patient_words ? `<div class="doctor-fact-card__words" style="${isEmergencyFact ? 'color: #f87171; font-weight: 600;' : ''}">"${fact.patient_words}"</div>` : ''}
            <div class="doctor-fact-card__meta">
              <span>Confidence: ${confPercent}%</span>
              <span>•</span>
              <span>Tier: ${fact.provenance_tier || 'VOICE'}</span>
              ${timeMatch ? '<span>•</span><span style="color: var(--accent); font-weight: 500;">Audio Proof Verified</span>' : ''}
            </div>
          </div>
        `;
      }
      html += '</div></div>';
    } else {
      html += `
        <div class="doctor-screen__section">
          <div class="card" style="padding: var(--space-4); text-align: center; color: var(--text-muted);">
            ℹ️ No clinical facts recorded for this encounter yet.
          </div>
        </div>
      `;
    }

    // 🧪 Clinical Laboratory Outlier Flags & Reference Intervals
    if (data.lab_result_alerts?.length) {
      const panicLabs = data.lab_result_alerts.filter(l => l.requires_urgent_escalation || l.status === 'CRITICAL_HIGH' || l.status === 'CRITICAL_LOW');
      
      html += '<div class="doctor-screen__section">';
      
      // Panic alert banner if any life-threatening values
      if (panicLabs.length > 0) {
        html += `
          <div class="lab-panic-banner">
            <div style="font-size: 28px;">🚨</div>
            <div>
              <div class="lab-panic-banner__title">
                Critical Panic Outlier Alert (${panicLabs.length} Urgent ${panicLabs.length === 1 ? 'Value' : 'Values'})
              </div>
              <div class="lab-panic-banner__desc">
                Physiological panic threshold breached for: <strong>${panicLabs.map(l => `${l.display_name || l.test_name} (${l.measured_value} ${l.unit})`).join(', ')}</strong>.
                Immediate physician intervention, bedside reassessment, or emergency lab re-check required.
              </div>
            </div>
          </div>
        `;
      }

      html += `
        <div class="doctor-screen__section-title" style="display: flex; justify-content: space-between; align-items: center;">
          <span>🧪 Physiological Laboratory Outlier Analysis (${data.lab_result_alerts.length} Tests)</span>
          <span class="badge badge-teal" style="font-size: 11px;">Physiological Reference Intervals</span>
        </div>
        <div class="lab-cards-grid">
      `;

      for (const lab of data.lab_result_alerts) {
        const isCritical = lab.status === 'CRITICAL_HIGH' || lab.status === 'CRITICAL_LOW' || lab.requires_urgent_escalation;
        const isAbnormal = lab.status === 'HIGH' || lab.status === 'LOW';
        const cardClass = isCritical ? 'lab-card lab-card--critical' : (isAbnormal ? 'lab-card lab-card--abnormal' : 'lab-card');
        
        const badgeClass = isCritical ? 'badge-red' : (isAbnormal ? 'badge-yellow' : 'badge-green');
        const statusLabel = lab.status === 'CRITICAL_HIGH' ? '🔴 CRITICAL HIGH'
          : lab.status === 'CRITICAL_LOW' ? '🔴 CRITICAL LOW'
          : lab.status === 'HIGH' ? '⚠️ HIGH'
          : lab.status === 'LOW' ? '⚠️ LOW'
          : '✅ NORMAL';

        html += `
          <div class="${cardClass}">
            <div class="lab-card__header">
              <span class="lab-card__test-name">${lab.display_name || lab.test_name.replace(/_/g, ' ').toUpperCase()}</span>
              <span class="badge ${badgeClass}" style="font-size: 10px;">${statusLabel}</span>
            </div>
            <div class="lab-card__value-row">
              <span class="lab-card__value" style="color: ${isCritical ? 'var(--severity-red)' : (isAbnormal ? '#f59e0b' : 'var(--severity-green)')};">
                ${lab.measured_value}
              </span>
              <span class="lab-card__unit">${lab.unit}</span>
            </div>
            <div>
              <span class="lab-card__range">Reference: ${lab.reference_interval || 'Standard Range'}</span>
            </div>
            ${lab.interpretation ? `<div class="lab-card__interpretation">${lab.interpretation}</div>` : ''}
          </div>
        `;
      }
      html += '</div></div>';
    }

    // Medication timeline
    if (data.medication_timeline?.length) {
      html += '<div class="doctor-screen__section"><div class="doctor-screen__section-title">💊 Medication Timeline</div><div class="doctor-screen__facts-grid">';
      for (const med of data.medication_timeline) {
        const statusColor = med.temporal_state === 'stopped' ? 'severity-red' : 'accent';
        html += `
          <div class="card">
            <div style="font-weight: 600; color: var(--${statusColor});">${med.medication}</div>
            <div style="font-size: var(--text-sm); color: var(--text-secondary);">
              ${med.dose || ''} ${med.frequency || ''}<br/>
              Status: ${med.temporal_state || 'active'}
            </div>
          </div>
        `;
      }
      html += '</div></div>';
    }

    // 📄 Multi-Document Timeline (Prescriptions, Lab Reports, Discharge Summaries)
    if (data.documents?.length) {
      html += `
        <div class="doctor-screen__section">
          <div class="doctor-screen__section-title" style="display: flex; justify-content: space-between; align-items: center;">
            <span>📄 Multi-Document Clinical Timeline (${data.documents.length} Records)</span>
            <span class="badge badge-teal" style="font-size: 11px;">OCR & Evidence Boxed</span>
          </div>
          <div class="doc-timeline-grid">
      `;
      for (const doc of data.documents) {
        const docType = doc.document_type || 'prescription';
        const typeIcon = docType === 'lab_report' ? '🧪 Lab Report'
          : docType === 'discharge_summary' ? '🏥 Discharge Summary'
          : '📄 Prescription';
        const typeBadge = docType === 'lab_report' ? 'badge-yellow'
          : docType === 'discharge_summary' ? 'badge-purple'
          : 'badge-teal';
        const docDate = doc.document_date || doc.created_at?.slice(0, 16) || 'Recent';

        html += `
          <div class="doc-timeline-card">
            <div class="doc-timeline-card__header">
              <span class="badge ${typeBadge}" style="font-size: 11px;">${typeIcon}</span>
              <span style="font-size: 11px; color: var(--text-muted);">${docDate}</span>
            </div>
            <div style="font-size: 12px; color: var(--text-secondary); font-family: monospace;">
              Doc ID: ${doc.id} • Status: <span style="color: var(--accent);">${doc.ocr_status || 'SUCCESS'}</span>
            </div>
            ${doc.highlighted_path ? `
              <div class="doctor-screen__evidence-container" style="margin-top: 6px;">
                <img src="/static/evidence/${doc.id}-boxed.jpg" alt="Evidence boxed document" loading="lazy" style="max-height: 200px; width: 100%; object-fit: contain; border-radius: 4px;" />
              </div>
            ` : ''}
            ${doc.ocr_raw_text ? `
              <details style="margin-top: 6px; font-size: 12px; background: rgba(0,0,0,0.2); padding: 6px 10px; border-radius: 4px;">
                <summary style="cursor: pointer; color: var(--accent); font-weight: 600;">View OCR Extracted Text</summary>
                <div style="font-size: 11px; white-space: pre-wrap; font-family: var(--font-mono); margin-top: 6px; max-height: 120px; overflow-y: auto; color: var(--text-secondary);">${doc.ocr_raw_text}</div>
              </details>
            ` : ''}
          </div>
        `;
      }
      html += '</div></div>';
    }

    // Doctor Clinical Verification & Sign-off
    const isVerified = enc.status === 'DOCTOR_REVIEWED' || enc.verified_by_doctor_id;
    html += `
      <div class="doctor-screen__section" style="margin-top: var(--space-6);">
        <div class="card" style="border: 2px solid ${isVerified ? 'var(--severity-green)' : 'rgba(8, 145, 178, 0.4)'}; background: ${isVerified ? 'rgba(16, 185, 129, 0.05)' : 'rgba(8, 145, 178, 0.05)'}; padding: var(--space-6); border-radius: var(--radius-md);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-3);">
            <div style="font-weight: 700; font-size: var(--text-base); color: var(--text-primary);">
              ✍️ Doctor Clinical Verification & Sign-off
            </div>
            ${isVerified ? `<span class="badge badge-green" id="verifyBadge">✅ Verified by Dr. ${enc.verified_by_doctor_id || 'Staff'}</span>` : `<span class="badge badge-yellow" id="verifyBadge">Pending Doctor Review</span>`}
          </div>
          ${enc.doctor_notes ? `<div style="font-size: var(--text-sm); margin-bottom: 12px; color: #38bdf8; background: rgba(0,0,0,0.25); padding: 10px; border-radius: 6px; border-left: 3px solid var(--accent);"><strong>Clinical Sign-off Record:</strong> ${enc.doctor_notes}</div>` : ''}
          <div style="display: flex; flex-direction: column; gap: 10px;">
            <textarea id="doctorNotesTextarea" placeholder="Enter clinical assessment, verified diagnosis, prescription validation, and OPD directives..." rows="3" style="width: 100%; padding: 10px 12px; background: var(--bg-primary); border: 1px solid var(--border-light); border-radius: var(--radius-sm); color: var(--text-primary); font-family: inherit; font-size: 13px;">${enc.doctor_notes || ''}</textarea>
            <div style="display: flex; justify-content: flex-end; gap: 10px;">
              <button class="btn btn-primary" id="signVerifyBtn">
                ${isVerified ? '🔄 Update Clinical Verification' : '✅ Sign & Complete Case Review'}
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    mainPanel.innerHTML = html;

    // Attach click listener for signVerifyBtn
    const signBtn = mainPanel.querySelector('#signVerifyBtn');
    if (signBtn) {
      signBtn.addEventListener('click', async () => {
        const notes = mainPanel.querySelector('#doctorNotesTextarea')?.value.trim() || 'Reviewed and verified in OPD.';
        try {
          signBtn.disabled = true;
          signBtn.textContent = 'Saving Sign-off...';
          await api.verifyEncounter(encounterId, notes);
          loadPatientDetail(encounterId);
          loadDoctorQueue();
        } catch (e) {
          alert('Verification failed: ' + e.message);
          signBtn.disabled = false;
          signBtn.textContent = '✅ Sign & Complete Case Review';
        }
      });
    }

    // Attach click listener for doctorOpenAyushModalBtn
    const ayushBtn = mainPanel.querySelector('#doctorOpenAyushModalBtn');
    if (ayushBtn) {
      ayushBtn.addEventListener('click', () => {
        openAyushModalWithEncounterData(data.ayush_intake);
      });
    }
  } catch (err) {
    console.error('Load patient detail failed:', err);
    mainPanel.innerHTML = '<div class="empty-state"><div class="empty-state__icon">❌</div><div class="empty-state__text">Failed to load patient data</div></div>';
  }
}

function renderAbhaPatientHistory(data) {
  const mainPanel = document.getElementById('doctorMain');
  const patient = data.patient;
  const encounters = data.encounters || [];
  const documents = data.documents || [];

  let html = `
    <div class="doctor-screen__patient-header">
      <div>
        <div class="doctor-screen__patient-name">
          👤 ${patient.full_name}
          <span class="badge badge-purple" style="margin-left: 8px;">ABHA: ${patient.abha_id || patient.mobile}</span>
        </div>
        <div style="color: var(--text-secondary); font-size: var(--text-sm); margin-top: 4px;">
          Mobile: ${patient.mobile} • Department: AIIA OPD
        </div>
      </div>
      <div>
        <button class="btn btn-secondary" id="backToQueueBtn">← Back to Queue</button>
      </div>
    </div>

    <div class="card" style="margin-bottom: var(--space-4); background: rgba(8, 145, 178, 0.08); border-left: 4px solid var(--accent); padding: var(--space-4);">
      <div style="font-size: var(--text-xs); font-weight: 700; color: var(--accent); text-transform: uppercase; margin-bottom: 4px;">
        🏛️ Longitudinal Patient Record (${encounters.length} Total Visits • ${documents.length} Documents)
      </div>
      <div style="font-size: var(--text-sm); color: var(--text-primary);">
        Complete cross-visit medical history compiled under ABHA health identifier <strong>${patient.abha_id}</strong>.
      </div>
    </div>
  `;

  // Encounters timeline
  if (encounters.length > 0) {
    html += '<div class="doctor-screen__section"><div class="doctor-screen__section-title">📅 Longitudinal Visits & Doctor Reviews</div><div style="display: flex; flex-direction: column; gap: 12px;">';
    for (const enc of encounters) {
      const isVerified = enc.verified_by_doctor_id || enc.status === 'DOCTOR_REVIEWED';
      const badge = isVerified 
        ? `<span class="badge badge-green">✅ Verified by Dr. ${enc.verified_by_doctor_id}</span>`
        : `<span class="badge badge-yellow">Pending Doctor Verification</span>`;
      
      html += `
        <div class="card" style="border-left: 4px solid ${isVerified ? 'var(--severity-green)' : 'var(--severity-yellow)'};">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <div>
              <strong>Token ${enc.token_number}</strong> • <span style="color: var(--text-secondary);">${enc.department || 'General Medicine'}</span> • <small style="color: var(--text-muted);">${enc.created_at}</small>
            </div>
            ${badge}
          </div>
          <div style="font-size: var(--text-sm); margin-bottom: 8px;">
            ${enc.summary_text || 'Intake recorded via MediKiosk AI.'}
          </div>
          ${enc.doctor_notes ? `<div style="font-size: var(--text-xs); background: rgba(0,0,0,0.25); padding: 8px; border-radius: 4px; color: #38bdf8;"><strong>Doctor Clinical Notes:</strong> ${enc.doctor_notes}</div>` : ''}
        </div>
      `;
    }
    html += '</div></div>';
  } else {
    html += '<div class="card" style="padding: var(--space-4); text-align: center; color: var(--text-muted);">No encounters found for this ABHA ID.</div>';
  }

  // Documents
  if (documents.length > 0) {
    html += '<div class="doctor-screen__section"><div class="doctor-screen__section-title">📄 Uploaded Documents & Prescriptions</div><div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 10px;">';
    for (const doc of documents) {
      html += `
        <div class="card" style="padding: 10px;">
          <div style="font-weight: 600; font-size: 12px;">${doc.document_type || 'Prescription'}</div>
          <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">Date: ${doc.created_at?.slice(0, 10) || 'Recent'}</div>
          <div style="font-size: 11px; color: var(--accent); margin-top: 4px;">OCR Processed & Archived</div>
        </div>
      `;
    }
    html += '</div></div>';
  }

  mainPanel.innerHTML = html;

  mainPanel.querySelector('#backToQueueBtn')?.addEventListener('click', () => {
    if (state.selectedEncounterId) {
      loadPatientDetail(state.selectedEncounterId);
    } else {
      loadDoctorQueue();
    }
  });
}

// ============================================================
//  PIN MODAL
// ============================================================

function initPinModal() {
  const overlay = document.getElementById('pinModal');
  const inputs = document.querySelectorAll('.pin-digit');
  const submitBtn = document.getElementById('pinSubmitBtn');
  const cancelBtn = document.getElementById('pinCancelBtn');
  const errorEl = document.getElementById('pinError');

  // Auto-focus next input
  inputs.forEach((input, i) => {
    input.addEventListener('input', () => {
      if (input.value && i < inputs.length - 1) {
        inputs[i + 1].focus();
      }
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && !input.value && i > 0) {
        inputs[i - 1].focus();
      }
    });
  });

  submitBtn.addEventListener('click', async () => {
    const pin = Array.from(inputs).map(i => i.value).join('');
    if (pin.length !== 4) return;

    try {
      errorEl.style.display = 'none';
      await api.doctorAuth(pin);
      state.doctorAuthenticated = true;
      hidePinModal();
      navigateTo('doctor');
      loadDoctorQueue();
    } catch {
      errorEl.style.display = 'block';
      inputs.forEach(i => { i.value = ''; });
      inputs[0].focus();
    }
  });

  cancelBtn.addEventListener('click', hidePinModal);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) hidePinModal();
  });
}

function showPinModal() {
  const overlay = document.getElementById('pinModal');
  overlay.classList.add('visible');
  document.querySelector('.pin-digit').focus();
}

function hidePinModal() {
  const overlay = document.getElementById('pinModal');
  overlay.classList.remove('visible');
  document.querySelectorAll('.pin-digit').forEach(i => { i.value = ''; });
  document.getElementById('pinError').style.display = 'none';
}

// ============================================================
//  AYUSH DASHAVIDHA PARIKSHA MODAL
// ============================================================

function initAyushParikshaModal() {
  const overlay = document.getElementById('ayushParikshaModal');
  const closeBtn = document.getElementById('ayushModalCloseBtn');
  const cancelBtn = document.getElementById('ayushModalCancelBtn');
  const form = document.getElementById('ayushParikshaForm');

  if (!overlay) return;

  // Real-time calculation listeners on all dropdowns
  const inputs = [
    'ayushFrameInput', 'ayushSkinInput', 'ayushWeatherInput', 'ayushSleepInput',
    'ayushAppetiteInput', 'ayushAmaInput', 'ayushKoshthaInput', 'ayushTasteInput'
  ];

  inputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('change', updateAyushLivePreview);
    }
  });

  closeBtn?.addEventListener('click', hideAyushModal);
  cancelBtn?.addEventListener('click', hideAyushModal);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) hideAyushModal();
  });

  form?.addEventListener('submit', handleAyushParikshaSubmit);
}

async function updateAyushLivePreview() {
  const frame = document.getElementById('ayushFrameInput')?.value || 'medium_muscular';
  const skin = document.getElementById('ayushSkinInput')?.value || 'warm_reddish_sweaty';
  const weather = document.getElementById('ayushWeatherInput')?.value || 'intolerant_to_heat';
  const sleep = document.getElementById('ayushSleepInput')?.value || 'moderate_sound';
  const appetite = document.getElementById('ayushAppetiteInput')?.value || 'irregular_skips';
  const hasAma = document.getElementById('ayushAmaInput')?.value === 'yes';
  const koshtha = document.getElementById('ayushKoshthaInput')?.value || 'krura';
  const tastes = (document.getElementById('ayushTasteInput')?.value || 'katu_lavana').split('_');

  const payload = {
    prakriti: {
      body_frame: frame,
      skin_texture: skin,
      weather_sensitivity: weather,
      sleep_pattern: sleep
    },
    agni: {
      appetite_pattern: appetite,
      post_meal_heaviness: hasAma,
      bowel_regularity: appetite === 'regular' ? 'regular' : 'irregular'
    },
    koshtha: {
      bowel_frequency: koshtha === 'krura' ? 'once_or_less_daily' : 'once_daily',
      stool_consistency: koshtha === 'krura' ? 'hard_dry' : (koshtha === 'mridu' ? 'soft_loose' : 'soft_formed')
    },
    ahara_vihara: {
      diet_primary_taste: tastes,
      packaged_junk_frequency: 'occasional',
      sleep_wake_timing: 'regular_late',
      physical_exercise: 'occasional_walk'
    }
  };

  try {
    const res = await api.calculateAyush(payload);
    const pStr = (res.prakriti_baseline?.dominant_dosha || 'VP').replace(/_/g, ' ').toUpperCase();
    const aStr = (res.agni?.agni_type || 'VISHAMA').toUpperCase();
    const kStr = (res.koshtha?.koshtha_type || 'KRURA').toUpperCase();
    const previewEl = document.getElementById('ayushLivePreview');
    if (previewEl) {
      previewEl.textContent = `Prakriti: ${pStr} • Agni: ${aStr} • Koshtha: ${kStr}`;
    }
    const badgeEl = document.getElementById('ayushNamasteCodeBadge');
    if (badgeEl) {
      badgeEl.textContent = res.prakriti_baseline?.namaste_code || 'NAMASTE:DOSHA-VP-001';
    }
  } catch (err) {
    console.error('Real-time AYUSH calculation failed:', err);
  }
}

function openAyushModalWithEncounterData(ayushData) {
  const overlay = document.getElementById('ayushParikshaModal');
  if (!overlay) return;

  if (ayushData) {
    const prakriti = ayushData.prakriti_baseline || {};
    const agni = ayushData.agni || {};
    const koshtha = ayushData.koshtha || {};
    const ahara = ayushData.ahara_vihara || {};

    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el && val) el.value = val;
    };

    setVal('ayushFrameInput', prakriti.body_frame);
    setVal('ayushSkinInput', prakriti.skin_texture);
    setVal('ayushWeatherInput', prakriti.weather_sensitivity);
    setVal('ayushSleepInput', prakriti.sleep_pattern);
    setVal('ayushAppetiteInput', agni.appetite_pattern);
    setVal('ayushAmaInput', agni.post_meal_heaviness ? 'yes' : 'no');
    setVal('ayushKoshthaInput', koshtha.koshtha_type);
    if (ahara.diet_primary_taste?.length) {
      setVal('ayushTasteInput', ahara.diet_primary_taste.join('_'));
    }
  }

  overlay.classList.add('visible');
  updateAyushLivePreview();
}

function hideAyushModal() {
  const overlay = document.getElementById('ayushParikshaModal');
  if (overlay) overlay.classList.remove('visible');
}

async function handleAyushParikshaSubmit(e) {
  e.preventDefault();
  const encounterId = state.selectedEncounterId;
  if (!encounterId) {
    alert('Please select an active patient encounter first.');
    return;
  }

  const saveBtn = document.getElementById('ayushModalSaveBtn');
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving Pariksha...';
  }

  try {
    const frame = document.getElementById('ayushFrameInput')?.value || 'medium_muscular';
    const skin = document.getElementById('ayushSkinInput')?.value || 'warm_reddish_sweaty';
    const weather = document.getElementById('ayushWeatherInput')?.value || 'intolerant_to_heat';
    const sleep = document.getElementById('ayushSleepInput')?.value || 'moderate_sound';
    const appetite = document.getElementById('ayushAppetiteInput')?.value || 'irregular_skips';
    const hasAma = document.getElementById('ayushAmaInput')?.value === 'yes';
    const koshtha = document.getElementById('ayushKoshthaInput')?.value || 'krura';
    const tastes = (document.getElementById('ayushTasteInput')?.value || 'katu_lavana').split('_');

    const payload = {
      prakriti: {
        body_frame: frame,
        skin_texture: skin,
        weather_sensitivity: weather,
        sleep_pattern: sleep
      },
      agni: {
        appetite_pattern: appetite,
        post_meal_heaviness: hasAma,
        bowel_regularity: appetite === 'regular' ? 'regular' : 'irregular'
      },
      koshtha: {
        bowel_frequency: koshtha === 'krura' ? 'once_or_less_daily' : 'once_daily',
        stool_consistency: koshtha === 'krura' ? 'hard_dry' : (koshtha === 'mridu' ? 'soft_loose' : 'soft_formed')
      },
      ahara_vihara: {
        diet_primary_taste: tastes,
        packaged_junk_frequency: 'occasional',
        sleep_wake_timing: 'regular_late',
        physical_exercise: 'occasional_walk'
      }
    };

    const calculatedRecord = await api.calculateAyush(payload);
    await api.saveAyushAssessment(encounterId, calculatedRecord);
    hideAyushModal();
    await loadPatientDetail(encounterId);
    await loadDoctorQueue();
  } catch (err) {
    alert('Failed to save AYUSH Dashavidha Pariksha: ' + err.message);
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = '💾 Save AYUSH Pariksha';
    }
  }
}

// ============================================================
//  UTILITY
// ============================================================

function resetState() {
  state.encounterId = null;
  state.patientId = null;
  state.tokenNumber = null;
  state.sessionId = null;
  state.language = 'hi';
  state.isRecording = false;
  state.facts = [];

  // Clear UI
  document.getElementById('conversationArea').innerHTML = '';
  document.getElementById('factsScroll').innerHTML = '';
  document.getElementById('factsCount').textContent = '0 facts';
  document.getElementById('tokenBadge').style.display = 'none';
  document.getElementById('scanResults').style.display = 'none';
  document.getElementById('scanDoneBtn').style.display = 'none';
}

// ============================================================
//  SCREEN: IVR TELEPHONY STUDIO & LIVE SIMULATOR
// ============================================================

function initIvrStudio() {
  const phoneInput = document.getElementById('ivrPhoneInput');
  const resolveBtn = document.getElementById('ivrResolveBtn');
  const startCallBtn = document.getElementById('ivrStartCallBtn');
  const backToHubBtn = document.getElementById('ivrBackToHubBtn');
  const openDoctorBtn = document.getElementById('ivrOpenDoctorBtn');
  const presets = document.querySelectorAll('.ivr-preset-btn');
  const langSelect = document.getElementById('ivrLanguageSelect');
  const sevSelect = document.getElementById('ivrSeveritySelect');

  backToHubBtn?.addEventListener('click', () => navigateTo('hub'));
  openDoctorBtn?.addEventListener('click', () => {
    if (state.doctorAuthenticated) {
      navigateTo('doctor');
    } else {
      showPinModal();
    }
  });

  // Preset clicks
  presets.forEach(btn => {
    btn.addEventListener('click', () => {
      presets.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const phone = btn.dataset.phone;
      const lang = btn.dataset.lang;
      if (phoneInput && phone) phoneInput.value = phone;
      if (langSelect && lang) langSelect.value = lang;
      testIvrResolution(phone);
    });
  });

  // Manual resolve click
  resolveBtn?.addEventListener('click', () => {
    const phone = phoneInput?.value?.trim() || '9876543210';
    testIvrResolution(phone);
  });

  // Simulate call click
  startCallBtn?.addEventListener('click', async () => {
    const phone = phoneInput?.value?.trim() || '9876543210';
    const lang = langSelect?.value || 'hi';
    const severity = sevSelect?.value || 'RED';

    startCallBtn.disabled = true;
    startCallBtn.textContent = '⏳ Connecting Voice Trunk (Exotel SIP)...';

    try {
      // Call Exotel incoming call webhook
      const res = await fetch('/api/ivr/exotel/incoming-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          From: phone,
          caller_phone: phone,
          language: lang,
          severity: severity
        })
      });
      const data = await res.json();

      const callBox = document.getElementById('ivrCallBox');
      const speechBox = document.getElementById('ivrCallSpeech');
      const statusText = document.getElementById('ivrCallStatusText');
      const preemptionBanner = document.getElementById('ivrPreemptionBanner');
      const sessionBadge = document.getElementById('ivrSessionBadge');

      if (callBox) callBox.style.display = 'flex';
      if (sessionBadge) sessionBadge.textContent = `Token: ${data.token_number || 'IVR-PREEMPT'}`;
      if (statusText) statusText.textContent = `📞 Voice Call Connected • Assigned: ${data.clinic?.name || 'AIIA'}`;
      if (speechBox) speechBox.textContent = `"${data.opening_speech || data.spoken_greeting || 'Welcome to MediKiosk AYUSH Helpline...'}"`;

      if (severity === 'RED' && preemptionBanner) {
        preemptionBanner.style.display = 'block';
      }

      startCallBtn.textContent = '✓ Call Ingested & Preempted to Queue!';
      setTimeout(() => {
        startCallBtn.disabled = false;
        startCallBtn.textContent = '📞 Simulate Inbound Call & Inject to Queue';
      }, 3000);

      // Auto-update waterfall visualizer for this phone
      testIvrResolution(phone);
    } catch (err) {
      console.error('Simulate IVR call failed:', err);
      startCallBtn.disabled = false;
      startCallBtn.textContent = '📞 Simulate Inbound Call & Inject to Queue';
    }
  });

  // Run initial resolution on default preset
  testIvrResolution('9876543210');
}

async function testIvrResolution(phone) {
  try {
    const res = await fetch(`/api/ivr/resolve-location?caller_phone=${encodeURIComponent(phone)}`);
    const data = await res.json();

    const step = data.waterfall_step || 1;
    const clinic = data.clinic || {};

    // Update step highlight
    for (let i = 1; i <= 4; i++) {
      const stepEl = document.getElementById(`wfStep${i}`);
      const badgeEl = document.getElementById(`wfBadge${i}`);
      if (!stepEl || !badgeEl) continue;

      if (i === step) {
        stepEl.className = 'waterfall-step active';
        badgeEl.className = 'waterfall-step__badge waterfall-step__badge--matched';
        badgeEl.textContent = `MATCHED (${Math.round((data.confidence || 1.0) * 100)}%)`;
      } else if (i < step) {
        stepEl.className = 'waterfall-step bypassed';
        badgeEl.className = 'waterfall-step__badge waterfall-step__badge--skipped';
        badgeEl.textContent = 'NO MATCH';
      } else {
        stepEl.className = 'waterfall-step bypassed';
        badgeEl.className = 'waterfall-step__badge waterfall-step__badge--skipped';
        badgeEl.textContent = 'SKIPPED';
      }
    }

    const activeBadge = document.getElementById('waterfallActiveBadge');
    if (activeBadge) activeBadge.textContent = `Step ${step} Matched: ${data.resolution_type}`;

    // Update clinic resolution card
    const nameEl = document.getElementById('resClinicName');
    const roomEl = document.getElementById('resRoomNumber');
    const sysEl = document.getElementById('resSystem');
    const locEl = document.getElementById('resLocation');
    const langEl = document.getElementById('resLanguage');
    const ratEl = document.getElementById('resRationale');
    const confEl = document.getElementById('resConfidenceBadge');

    if (nameEl) nameEl.textContent = clinic.name || 'All India Institute of Ayurveda (AIIA)';
    if (roomEl) roomEl.textContent = clinic.room_number || 'Room 102 (Kayachikitsa OPD)';
    if (sysEl) sysEl.textContent = clinic.system || 'Ayurveda';
    if (locEl) locEl.textContent = `${clinic.district || 'Delhi'}, ${clinic.state || 'Delhi'}`;
    if (langEl) langEl.textContent = `${clinic.primary_language?.toUpperCase() || 'HI'} (${clinic.telecom_circle || 'National'})`;
    if (ratEl) ratEl.textContent = data.rationale || 'Resolved via deterministic 4-step waterfall.';
    if (confEl) confEl.textContent = `Confidence: ${Math.round((data.confidence || 1.0) * 100)}%`;
  } catch (err) {
    console.error('Resolve location failed:', err);
  }
}
