/**
 * MediKiosk Web — Central Reactive State Store & Inactivity Watchdog
 */

class Store {
  constructor() {
    this.subscribers = new Set();

    // Load initial state or cached auth
    const cachedUser = localStorage.getItem('medikiosk_user');
    const parsedUser = cachedUser ? JSON.parse(cachedUser) : null;
    const cachedSession = localStorage.getItem('medikiosk_session') || sessionStorage.getItem('medikiosk_session');

    this.state = {
      auth: {
        user: parsedUser,
        role: parsedUser ? parsedUser.role : null,
        isAuthenticated: !!parsedUser,
        sessionToken: cachedSession || null,
      },
      kiosk: {
        encounterId: null,
        patientId: null,
        tokenNumber: null,
        language: 'hi', // default Indian language
        channel: 'kiosk',
        careStream: 'General Medicine',
        currentStep: 1,
        patientWords: '',
        extractedFacts: [],
        severityBadge: 'GREEN',
        sessionId: null,
        activeTurn: 0,
        uploadedDocument: null,
        ocrResult: null,
        ayushRecord: null,
      },
      patient: {
        profile: null,
        encounters: [],
        activeToken: null,
        documents: [],
      },
      doctor: {
        authenticated: false,
        profile: (() => {
          try {
            const raw = sessionStorage.getItem('medikiosk_doctor');
            return raw ? JSON.parse(raw) : null;
          } catch {
            return null;
          }
        })(),
        queue: [],
        totalWaiting: 0,
        selectedEncounterId: null,
        selectedPatientDetail: null,
      },
      ui: {
        networkOnline: navigator.onLine,
        inactivitySeconds: 0,
        showInactivityWarning: false,
        toasts: [],
      }
    };

    // Restore doctor auth from session
    if (this.state.doctor.profile?.id) {
      this.state.doctor.authenticated = true;
    }

    // Listen to network events
    window.addEventListener('online', () => this.setNetworkStatus(true));
    window.addEventListener('offline', () => this.setNetworkStatus(false));

    // Initialize Kiosk Inactivity Watchdog
    this._initInactivityWatchdog();
  }

  getState() {
    return this.state;
  }

  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  notify() {
    for (const callback of this.subscribers) {
      try {
        callback(this.state);
      } catch (err) {
        console.error('Error in store subscriber:', err);
      }
    }
  }

  // --- Auth Actions ---
  setSessionToken(token, { persist = true } = {}) {
    this.state.auth.sessionToken = token || null;
    try {
      if (token) {
        if (persist) localStorage.setItem('medikiosk_session', token);
        sessionStorage.setItem('medikiosk_session', token);
      } else {
        localStorage.removeItem('medikiosk_session');
        sessionStorage.removeItem('medikiosk_session');
      }
    } catch { /* ignore */ }
  }

  getSessionToken() {
    return this.state.auth.sessionToken
      || localStorage.getItem('medikiosk_session')
      || sessionStorage.getItem('medikiosk_session');
  }

  setUser(user, sessionToken = null) {
    this.state.auth.user = user;
    this.state.auth.role = user ? user.role : null;
    this.state.auth.isAuthenticated = !!user;
    if (user) {
      localStorage.setItem('medikiosk_user', JSON.stringify(user));
      if (sessionToken) this.setSessionToken(sessionToken, { persist: true });
    } else {
      localStorage.removeItem('medikiosk_user');
      this.setSessionToken(null);
    }
    this.notify();
  }

  setDoctorAuthenticated(authStatus, doctorUser = null, sessionToken = null) {
    this.state.doctor.authenticated = !!authStatus;
    if (authStatus) {
      const profile = doctorUser || this.state.doctor.profile;
      this.state.doctor.profile = profile;
      if (profile) sessionStorage.setItem('medikiosk_doctor', JSON.stringify(profile));
      sessionStorage.removeItem('medikiosk_doctor_pin');
      if (sessionToken) this.setSessionToken(sessionToken, { persist: false });
    } else {
      this.state.doctor.profile = null;
      sessionStorage.removeItem('medikiosk_doctor');
      sessionStorage.removeItem('medikiosk_doctor_pin');
      // Only clear session if it was a doctor session (avoid wiping patient token from shared browser carelessly)
      if (this.state.auth.role === 'doctor' || !this.state.auth.user) {
        this.setSessionToken(null);
      }
    }
    this.notify();
  }

  getDoctorId() {
    return this.state.doctor.profile?.id || null;
  }

  setDoctorProfile(profile) {
    if (!profile?.id) return;
    this.state.doctor.profile = { ...this.state.doctor.profile, ...profile };
    this.state.doctor.authenticated = true;
    try {
      sessionStorage.setItem('medikiosk_doctor', JSON.stringify(this.state.doctor.profile));
    } catch { /* ignore */ }
    this.notify();
  }

  isDoctorAuthenticated() {
    if (this.state.doctor.authenticated && this.state.doctor.profile?.id) return true;
    try {
      const raw = sessionStorage.getItem('medikiosk_doctor');
      if (raw) {
        const profile = JSON.parse(raw);
        if (profile?.id) {
          this.state.doctor.authenticated = true;
          this.state.doctor.profile = profile;
          return true;
        }
      }
    } catch { /* ignore */ }
    return false;
  }

  isPatientAuthenticated() {
    return !!(this.state.auth.isAuthenticated && this.state.auth.role === 'patient' && this.state.auth.user);
  }

  // --- Kiosk State Actions ---
  setKioskLanguage(lang) {
    this.state.kiosk.language = lang;
    this.notify();
  }

  setKioskBootstrapData({ encounterId, patientId, tokenNumber }) {
    this.state.kiosk.encounterId = encounterId;
    this.state.kiosk.patientId = patientId;
    this.state.kiosk.tokenNumber = tokenNumber;
    this.notify();
  }

  updateKioskIntake(updates) {
    this.state.kiosk = { ...this.state.kiosk, ...updates };
    this.notify();
  }

  resetKioskSession() {
    this.state.kiosk = {
      encounterId: null,
      patientId: null,
      tokenNumber: null,
      language: 'hi',
      channel: 'kiosk',
      careStream: 'General Medicine',
      currentStep: 1,
      patientWords: '',
      extractedFacts: [],
      severityBadge: 'GREEN',
      sessionId: null,
      activeTurn: 0,
      uploadedDocument: null,
      ocrResult: null,
      ayushRecord: null,
    };
    this.state.ui.inactivitySeconds = 0;
    this.state.ui.showInactivityWarning = false;
    this.notify();
  }

  // --- Doctor Actions ---
  setDoctorQueue(queue, total) {
    this.state.doctor.queue = queue || [];
    this.state.doctor.totalWaiting = total || (queue ? queue.length : 0);
    this.notify();
  }

  setSelectedPatientDetail(encounterId, detail) {
    this.state.doctor.selectedEncounterId = encounterId;
    this.state.doctor.selectedPatientDetail = detail;
    this.notify();
  }

  // --- Patient Actions ---
  setPatientDashboard(data) {
    if (!data) return;
    this.state.patient.profile = data.profile || data;
    this.state.patient.encounters = data.encounters || [];
    this.state.patient.activeToken = data.active_token || null;
    this.state.patient.documents = data.documents || [];
    this.notify();
  }

  // --- UI & Toast Actions ---
  setNetworkStatus(isOnline) {
    this.state.ui.networkOnline = isOnline;
    this.notify();
  }

  addToast(message, type = 'info', durationMs = 3500) {
    const id = Date.now() + Math.random().toString(36).substring(2, 6);
    const toast = { id, message, type };
    this.state.ui.toasts.push(toast);
    this.notify();

    setTimeout(() => {
      this.removeToast(id);
    }, durationMs);
  }

  removeToast(id) {
    this.state.ui.toasts = this.state.ui.toasts.filter(t => t.id !== id);
    this.notify();
  }

  // --- Inactivity Watchdog for Public Kiosk Mode ---
  _initInactivityWatchdog() {
    const resetTimer = () => {
      if (this.state.ui.inactivitySeconds > 0) {
        this.state.ui.inactivitySeconds = 0;
        this.state.ui.showInactivityWarning = false;
        this.notify();
      }
    };

    ['touchstart', 'mousedown', 'keydown', 'scroll'].forEach(evt => {
      window.addEventListener(evt, resetTimer, { passive: true });
    });

    setInterval(() => {
      // Only monitor in active Kiosk routes
      if (window.location.hash.startsWith('#/kiosk') && !window.location.hash.includes('welcome')) {
        this.state.ui.inactivitySeconds += 1;

        if (this.state.ui.inactivitySeconds === 45) {
          this.state.ui.showInactivityWarning = true;
          this.notify();
        } else if (this.state.ui.inactivitySeconds >= 60) {
          // Purge session and return to welcome
          this.resetKioskSession();
          window.location.hash = '#/kiosk/welcome';
        }
      }
    }, 1000);
  }
}

export const store = new Store();
