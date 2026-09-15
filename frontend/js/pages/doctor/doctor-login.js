/**
 * MediKiosk Web — Doctor ID Login (no PIN / password)
 */

import { store } from '../../store.js';
import { authApi } from '../../api/auth.api.js';

export function renderDoctorLogin() {
  return `
    <div class="auth-shell">
      <div class="auth-card">
        <div class="auth-card__header">
          <div class="auth-card__icon auth-card__icon--doctor" aria-hidden="true">
            <i class="fa-solid fa-user-doctor"></i>
          </div>
          <h2 class="text-h2">Doctor Login</h2>
          <p class="auth-card__subtitle">
            Enter your Doctor ID to open the clinical workstation.
          </p>
        </div>

        <div class="auth-demo-hint" id="doctorDemoHint" style="display:none;">
          <div class="auth-demo-hint__label">Registered doctor on this edge server</div>
          <button type="button" id="btnQuickDoctorDemo" class="btn btn-secondary btn-lg" style="width:100%; justify-content:center;">
            Continue
          </button>
        </div>

        <form id="doctorLoginForm" class="auth-form">
          <div>
            <label class="auth-label" for="doctorIdInput">Doctor ID</label>
            <input
              type="text"
              id="doctorIdInput"
              class="form-input auth-input"
              placeholder="e.g. doc-1a2b3c4d"
              autocomplete="username"
              required
            />
          </div>

          <div id="doctorLoginError" class="auth-error" style="display:none;"></div>
          <div id="doctorLoginActions" class="auth-error-actions" style="display:none;"></div>

          <button type="submit" class="btn btn-primary btn-lg auth-submit">
            Login
          </button>
        </form>

        <div class="auth-footer">
          New doctor?
          <a href="#/register">Register / Sign Up</a>
        </div>
      </div>
    </div>
  `;
}

function showError(code, message) {
  const errorMsg = document.getElementById('doctorLoginError');
  const actions = document.getElementById('doctorLoginActions');
  if (!errorMsg) return;

  errorMsg.textContent = message || 'Login failed';
  errorMsg.style.display = 'block';

  if (actions) {
    if (code === 'DOCTOR_NOT_REGISTERED') {
      actions.innerHTML = `<a class="btn btn-secondary btn-lg" href="#/register/doctor" style="width:100%; justify-content:center;">Register / Sign Up</a>`;
      actions.style.display = 'block';
    } else {
      actions.innerHTML = `<button type="button" class="btn btn-ghost btn-lg" id="btnDoctorTryAgain" style="width:100%; justify-content:center;">Try Again</button>`;
      actions.style.display = 'block';
      document.getElementById('btnDoctorTryAgain')?.addEventListener('click', () => {
        errorMsg.style.display = 'none';
        actions.style.display = 'none';
        document.getElementById('doctorIdInput')?.focus();
      });
    }
  }
}

export function initDoctorLogin(query = {}) {
  const form = document.getElementById('doctorLoginForm');
  const idInput = document.getElementById('doctorIdInput');
  const demoBtn = document.getElementById('btnQuickDoctorDemo');
  const demoHint = document.getElementById('doctorDemoHint');

  if (query.id && idInput) {
    idInput.value = query.id;
  }

  // The quick-login shortcut reflects whoever is actually registered on this server
  authApi.getDirectory()
    .then((dir) => {
      const doctor = (dir.doctors || [])[0];
      if (!doctor || !demoBtn || !demoHint) return;
      demoBtn.textContent = `Continue as ${doctor.full_name} (${doctor.id})`;
      demoBtn.dataset.doctorId = doctor.id;
      demoHint.style.display = 'block';
    })
    .catch(() => { /* directory unavailable — manual entry only */ });

  demoBtn?.addEventListener('click', () => {
    const id = demoBtn.dataset.doctorId;
    if (!id || !idInput) return;
    idInput.value = id;
    form?.dispatchEvent(new Event('submit'));
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const doctorId = idInput?.value.trim();
    if (!doctorId) {
      showError('INVALID_DOCTOR_ID', 'Invalid Doctor ID');
      return;
    }

    try {
      const res = await authApi.login(doctorId, 'doctor');
      store.setDoctorAuthenticated(true, res.user, res.session_token);
      window.location.hash = '#/doctor/queue';
    } catch (err) {
      showError(err.code || 'INVALID_DOCTOR_ID', err.message || 'Invalid Doctor ID');
    }
  });
}
