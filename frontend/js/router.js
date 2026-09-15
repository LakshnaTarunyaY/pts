/**
 * MediKiosk Web — Hash-Based Client Router & Route Guard Manager
 */

import { renderTopbar } from './components/topbar.js';
import { store } from './store.js';

// Import Views
import { renderWelcomePage, initWelcomePage } from './pages/public/welcome.js';
import { renderAccountTypePage } from './pages/public/account-type.js';
import { renderRegisterRole, initRegisterRole } from './pages/public/register-role.js';
import { renderKioskWelcome, initKioskWelcome, destroyKioskWelcome } from './pages/kiosk/kiosk-welcome.js';
import { renderKioskLanguage, initKioskLanguage } from './pages/kiosk/kiosk-language.js';
import { renderKioskConsent, initKioskConsent } from './pages/kiosk/kiosk-consent.js';
import { renderKioskCareStream, initKioskCareStream } from './pages/kiosk/kiosk-care-stream.js';
import { renderKioskVoiceIntake, initKioskVoiceIntake, destroyKioskVoiceIntake } from './pages/kiosk/kiosk-voice-intake.js';
import { renderKioskExplainBack, initKioskExplainBack, destroyKioskExplainBack } from './pages/kiosk/kiosk-explain-back.js';
import { renderKioskDocScan, initKioskDocScan, destroyKioskDocScan } from './pages/kiosk/kiosk-doc-scan.js';
import { renderKioskOcrResults, initKioskOcrResults } from './pages/kiosk/kiosk-ocr-results.js';
import { renderKioskAyush, initKioskAyush } from './pages/kiosk/kiosk-ayush.js';
import { renderKioskQueueToken, initKioskQueueToken, destroyKioskQueueToken } from './pages/kiosk/kiosk-queue-token.js';
import { renderKioskTriageAlert, initKioskTriageAlert } from './pages/kiosk/kiosk-triage-alert.js';
import { renderDoctorLogin, initDoctorLogin } from './pages/doctor/doctor-login.js';
import { renderDoctorRegister, initDoctorRegister } from './pages/doctor/doctor-register.js';
import { renderDoctorQueue, initDoctorQueue, destroyDoctorQueue } from './pages/doctor/doctor-queue.js';
import { renderDoctorPatient, initDoctorPatient } from './pages/doctor/doctor-patient.js';
import { renderPatientLogin, initPatientLogin } from './pages/patient/patient-login.js';
import { renderPatientRegister, initPatientRegister } from './pages/patient/patient-register.js';
import { renderPatientDashboard, initPatientDashboard } from './pages/patient/patient-dashboard.js';
import { renderIvrSimulator, initIvrSimulator } from './pages/ivr/ivr-simulator.js';
import { renderKioskAvatarPreview, initKioskAvatarPreview, destroyKioskAvatarPreview } from './pages/kiosk/kiosk-avatar-preview.js';

let currentDestroyFn = null;

function getHashQuery() {
  const fullHash = window.location.hash.slice(1) || '';
  const qIndex = fullHash.indexOf('?');
  if (qIndex === -1) return {};
  return Object.fromEntries(new URLSearchParams(fullHash.slice(qIndex + 1)));
}

export class Router {
  constructor(appElement) {
    this.app = appElement;
    window.addEventListener('hashchange', () => this.handleRoute());
  }

  start() {
    if (!window.location.hash) {
      window.location.hash = '#/welcome';
    } else {
      this.handleRoute();
    }
  }

  handleRoute() {
    // Teardown previous view
    if (currentDestroyFn) {
      currentDestroyFn();
      currentDestroyFn = null;
    }

    const fullHash = window.location.hash.slice(1) || '/welcome';
    const [path] = fullHash.split('?');
    const query = getHashQuery();

    // Route Guards
    if (path.startsWith('/doctor') && path !== '/doctor/login' && path !== '/doctor/register') {
      if (!store.isDoctorAuthenticated()) {
        window.location.hash = '#/doctor/login';
        return;
      }
    }

    if ((path === '/patient/dashboard' || path === '/patient/queue') && !store.isPatientAuthenticated()) {
      window.location.hash = '#/patient/login';
      return;
    }

    // Dynamic Parameter Matching (e.g. /doctor/patient/:id)
    if (path.startsWith('/doctor/patient/')) {
      const encounterId = path.replace('/doctor/patient/', '');
      this._renderView(path, () => renderDoctorPatient(encounterId), () => initDoctorPatient(encounterId));
      return;
    }

    switch (path) {
      // Public
      case '/':
      case '/welcome':
        this._renderView(path, renderWelcomePage, initWelcomePage);
        break;
      case '/account-type':
        this._renderView(path, renderAccountTypePage);
        break;
      case '/register':
        this._renderView(path, renderRegisterRole, initRegisterRole);
        break;
      case '/register/patient':
      case '/patient/register':
        this._renderView(path, renderPatientRegister, initPatientRegister);
        break;
      case '/register/doctor':
      case '/doctor/register':
        this._renderView(path, renderDoctorRegister, initDoctorRegister);
        break;

      // Kiosk Walk-in Flow
      case '/kiosk/welcome':
        this._renderView(path, renderKioskWelcome, initKioskWelcome, destroyKioskWelcome);
        break;
      case '/kiosk/avatar-preview':
        this._renderView(path, renderKioskAvatarPreview, initKioskAvatarPreview, destroyKioskAvatarPreview);
        break;
      case '/kiosk/language':
        this._renderView(path, renderKioskLanguage, initKioskLanguage);
        break;
      case '/kiosk/consent':
        this._renderView(path, renderKioskConsent, initKioskConsent);
        break;
      case '/kiosk/care-stream':
        this._renderView(path, renderKioskCareStream, initKioskCareStream);
        break;
      case '/kiosk/intake':
        this._renderView(path, renderKioskVoiceIntake, initKioskVoiceIntake, destroyKioskVoiceIntake);
        break;
      case '/kiosk/summary':
        this._renderView(path, renderKioskExplainBack, initKioskExplainBack, destroyKioskExplainBack);
        break;
      case '/kiosk/triage':
        this._renderView(path, renderKioskTriageAlert, initKioskTriageAlert);
        break;
      case '/kiosk/documents':
        this._renderView(path, renderKioskDocScan, initKioskDocScan, destroyKioskDocScan);
        break;
      case '/kiosk/ocr-results':
        this._renderView(path, renderKioskOcrResults, initKioskOcrResults);
        break;
      case '/kiosk/ayush':
        this._renderView(path, renderKioskAyush, initKioskAyush);
        break;
      case '/kiosk/queue':
        this._renderView(path, renderKioskQueueToken, initKioskQueueToken, destroyKioskQueueToken);
        break;

      // Doctor Portal
      case '/doctor/login':
        this._renderView(path, renderDoctorLogin, () => initDoctorLogin(query));
        break;
      case '/doctor/queue':
        this._renderView(path, renderDoctorQueue, initDoctorQueue, destroyDoctorQueue);
        break;

      // Patient Portal
      case '/patient/login':
        this._renderView(path, renderPatientLogin, () => initPatientLogin(query));
        break;
      case '/patient/dashboard':
      case '/patient/queue':
        this._renderView(path, renderPatientDashboard, initPatientDashboard);
        break;

      // IVR Studio
      case '/ivr':
        this._renderView(path, renderIvrSimulator, initIvrSimulator);
        break;

      default:
        window.location.hash = '#/welcome';
        break;
    }
  }

  _renderView(path, renderFn, initFn = null, destroyFn = null) {
    currentDestroyFn = destroyFn;
    this.app.innerHTML = `
      ${renderTopbar(path)}
      <div id="pageContent">${renderFn()}</div>
      <div id="toastContainer" class="toast-container"></div>
    `;

    if (initFn) {
      initFn();
    }
  }
}
