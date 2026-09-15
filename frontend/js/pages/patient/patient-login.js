/**
 * MediKiosk Web — Patient ABHA Login (ID-only, no password)
 */

import { store } from '../../store.js';
import { authApi } from '../../api/auth.api.js';

export function renderPatientLogin() {
  return `
    <div class="auth-shell">
      <div class="auth-card">
        <div class="auth-card__header">
          <div class="auth-card__icon auth-card__icon--patient" aria-hidden="true">
            <i class="fa-solid fa-id-card"></i>
          </div>
          <h2 class="text-h2">Patient Login</h2>
          <p class="auth-card__subtitle">
            Enter your ABHA ID to open your health records.
          </p>
        </div>

        <div class="auth-demo-hint">
          <div class="auth-demo-hint__label">Demo ABHA</div>
          <button type="button" id="btnQuickPatientDemo" class="btn btn-secondary btn-lg" style="width:100%; justify-content:center;">
            Use demo ABHA: 91-4821-3910-4819
          </button>
        </div>

        <form id="patientLoginForm" class="auth-form">
          <div>
            <label class="auth-label" for="patientAbhaInput">ABHA ID</label>
            <input
              type="text"
              id="patientAbhaInput"
              class="form-input auth-input"
              placeholder="e.g. 91-4821-3910-4819"
              inputmode="numeric"
              autocomplete="username"
              required
            />
          </div>

          <div id="patientLoginError" class="auth-error" style="display:none;"></div>
          <div id="patientLoginActions" class="auth-error-actions" style="display:none;"></div>

          <button type="submit" class="btn btn-primary btn-lg auth-submit">
            Login
          </button>
        </form>

        <div class="auth-footer">
          New patient?
          <a href="#/register">Register / Sign Up</a>
        </div>
      </div>
    </div>
  `;
}

function showError(code, message) {
  const errorMsg = document.getElementById('patientLoginError');
  const actions = document.getElementById('patientLoginActions');
  if (!errorMsg) return;

  errorMsg.textContent = message || 'Login failed';
  errorMsg.style.display = 'block';

  if (actions) {
    if (code === 'ABHA_NOT_REGISTERED') {
      actions.innerHTML = `<a class="btn btn-secondary btn-lg" href="#/register/patient" style="width:100%; justify-content:center;">Register / Sign Up</a>`;
      actions.style.display = 'block';
    } else {
      actions.innerHTML = `<button type="button" class="btn btn-ghost btn-lg" id="btnTryAgain" style="width:100%; justify-content:center;">Try Again</button>`;
      actions.style.display = 'block';
      document.getElementById('btnTryAgain')?.addEventListener('click', () => {
        errorMsg.style.display = 'none';
        actions.style.display = 'none';
        document.getElementById('patientAbhaInput')?.focus();
      });
    }
  }
}

export function initPatientLogin(query = {}) {
  const form = document.getElementById('patientLoginForm');
  const demoBtn = document.getElementById('btnQuickPatientDemo');
  const abhaInput = document.getElementById('patientAbhaInput');

  if (query.abha && abhaInput) {
    abhaInput.value = query.abha;
  }

  demoBtn?.addEventListener('click', () => {
    if (abhaInput) abhaInput.value = '91-4821-3910-4819';
    form?.dispatchEvent(new Event('submit'));
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const abhaId = abhaInput?.value.trim();
    if (!abhaId) {
      showError('INVALID_ABHA', 'Invalid ABHA ID');
      return;
    }

    try {
      const res = await authApi.login(abhaId, 'patient');
      store.setUser(res.user, res.session_token);
      window.location.hash = '#/patient/dashboard';
    } catch (err) {
      showError(err.code || 'INVALID_ABHA', err.message || 'Invalid ABHA ID');
    }
  });
}
