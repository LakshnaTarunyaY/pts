/**
 * MediKiosk Web — Unified Institutional Header Component
 */

import { store } from '../store.js';
import { authApi } from '../api/auth.api.js';

export function renderTopbar(currentPath) {
  const state = store.getState();
  const isOnline = state.ui.networkOnline;
  const isDoctorAuth = store.isDoctorAuthenticated();
  const isPatientAuth = store.isPatientAuthenticated();
  const patientName = state.auth.user ? state.auth.user.full_name : null;
  const doctorName = state.doctor.profile?.full_name || 'Doctor';
  const doctorId = state.doctor.profile?.id || '';

  return `
    <header class="topbar">
      <!-- Left: Institutional Brand -->
      <a href="#/welcome" class="topbar__brand">
        <div class="topbar__brand-icon" aria-hidden="true">
          <img src="/medikiosk-mark.png" alt="" class="topbar__brand-mark" width="56" height="56" />
        </div>
        <div>
          <div class="topbar__title">MediKiosk <span style="font-family:var(--font-body); font-weight:500; color:var(--brand-primary); font-size:14px;">AI</span></div>
          <div class="topbar__subtitle">AIIA New Delhi · AYUSH OPD</div>
        </div>
      </a>

      <!-- Center: Portal Switcher Navigation -->
      <nav class="topbar__portal-nav" aria-label="Portal switcher">
        <a href="#/account-type" class="topbar__portal-btn ${currentPath === '/account-type' ? 'active' : ''}">
          <i class="fa-solid fa-globe" aria-hidden="true"></i> Role Hub
        </a>
        <a href="#/kiosk/welcome" class="topbar__portal-btn ${currentPath.startsWith('/kiosk') ? 'active' : ''}">
          <i class="fa-solid fa-hospital" aria-hidden="true"></i> OPD Kiosk
        </a>
        <a href="#/patient/login" class="topbar__portal-btn ${currentPath.startsWith('/patient') || currentPath.startsWith('/register') ? 'active' : ''}">
          <i class="fa-solid fa-user" aria-hidden="true"></i> Patient Portal
        </a>
        <a href="#/doctor/login" class="topbar__portal-btn ${currentPath.startsWith('/doctor') ? 'active' : ''}">
          <i class="fa-solid fa-user-doctor" aria-hidden="true"></i> Doctor Station
        </a>
        <a href="#/ivr" class="topbar__portal-btn ${currentPath.startsWith('/ivr') ? 'active' : ''}">
          <i class="fa-solid fa-phone" aria-hidden="true"></i> 2G IVR Studio
        </a>
        <a href="/mobile.html" target="_blank" class="topbar__portal-btn" style="text-decoration:none;">
          <i class="fa-solid fa-mobile-screen" aria-hidden="true"></i> Mobile App
        </a>
      </nav>

      <!-- Right: System Status & User Action -->
      <div class="topbar__actions">
        <span class="badge ${isOnline ? 'badge-green' : 'badge-amber'}" title="Backend Connectivity">
          <span style="display:inline-block; width:6px; height:6px; border-radius:50%; background:currentColor;"></span>
          ${isOnline ? 'Edge Hub Online' : 'Offline Mode'}
        </span>

        ${isDoctorAuth ? `
          <span class="badge badge-blue" title="${doctorId}">${doctorName}</span>
          <button class="btn btn-ghost btn-sm" onclick="window.doctorLogout()">Sign Out</button>
        ` : isPatientAuth ? `
          <span class="badge badge-teal">${patientName || 'Patient'}</span>
          <button class="btn btn-ghost btn-sm" onclick="window.patientLogout()">Sign Out</button>
        ` : `
          <a href="#/register" class="btn btn-secondary btn-sm">Register</a>
          <a href="#/account-type" class="btn btn-secondary btn-sm">Select Portal</a>
        `}
      </div>
    </header>
  `;
}

// Global logout handlers
window.doctorLogout = async () => {
  try { await authApi.logout?.(); } catch { /* ignore */ }
  store.setDoctorAuthenticated(false);
  window.location.hash = '#/doctor/login';
};

window.patientLogout = async () => {
  try { await authApi.logout?.(); } catch { /* ignore */ }
  store.setUser(null);
  window.location.hash = '#/patient/login';
};
