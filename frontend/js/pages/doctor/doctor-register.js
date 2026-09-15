/**
 * MediKiosk Web — Doctor Registration (generates Doctor ID)
 */

import { authApi } from '../../api/auth.api.js';

export function renderDoctorRegister() {
  return `
    <div class="auth-shell">
      <div class="auth-card auth-card--wide">
        <div class="auth-card__header">
          <h2 class="text-h2">Doctor Registration</h2>
          <p class="auth-card__subtitle">
            Create a clinician account. You will receive a Doctor ID for login.
          </p>
        </div>

        <form id="doctorRegisterForm" class="auth-form">
          <div class="form-grid-2">
            <div class="form-span-2">
              <label class="auth-label" for="doc_full_name">Full Name</label>
              <input class="form-input auth-input" id="doc_full_name" required placeholder="Dr. …" />
            </div>
            <div>
              <label class="auth-label" for="doc_email">Email</label>
              <input class="form-input auth-input" type="email" id="doc_email" required />
            </div>
            <div>
              <label class="auth-label" for="doc_phone">Phone Number</label>
              <input class="form-input auth-input" id="doc_phone" required inputmode="tel" />
            </div>
            <div>
              <label class="auth-label" for="doc_specialization">Specialization</label>
              <input class="form-input auth-input" id="doc_specialization" required placeholder="e.g. General Medicine" />
            </div>
            <div>
              <label class="auth-label" for="doc_city">City</label>
              <input class="form-input auth-input" id="doc_city" required />
            </div>
            <div class="form-span-2">
              <label class="auth-label" for="doc_reg_number">Medical / Professional Registration Number</label>
              <input class="form-input auth-input" id="doc_reg_number" required />
            </div>
            <div class="form-span-2">
              <label class="auth-label" for="doc_verification">Other Verification Information</label>
              <textarea class="form-input auth-input" id="doc_verification" rows="3" placeholder="Hospital affiliation, council details, etc."></textarea>
            </div>
          </div>

          <div id="doctorRegisterError" class="auth-error" style="display:none;"></div>
          <div id="doctorRegisterSuccess" class="auth-success" style="display:none;"></div>

          <button type="submit" class="btn btn-primary btn-lg auth-submit">Create Doctor Account</button>
        </form>

        <div class="auth-footer">
          Already registered?
          <a href="#/doctor/login">Doctor Login</a>
        </div>
      </div>
    </div>
  `;
}

export function initDoctorRegister() {
  const form = document.getElementById('doctorRegisterForm');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = document.getElementById('doctorRegisterError');
    const ok = document.getElementById('doctorRegisterSuccess');
    if (err) err.style.display = 'none';
    if (ok) ok.style.display = 'none';

    const payload = {
      full_name: document.getElementById('doc_full_name')?.value.trim(),
      email: document.getElementById('doc_email')?.value.trim(),
      phone: document.getElementById('doc_phone')?.value.trim(),
      specialization: document.getElementById('doc_specialization')?.value.trim(),
      city: document.getElementById('doc_city')?.value.trim(),
      registration_number: document.getElementById('doc_reg_number')?.value.trim(),
      verification_notes: document.getElementById('doc_verification')?.value.trim() || null,
    };

    const submitBtn = form.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Creating account…';
    }

    try {
      const res = await authApi.registerDoctor(payload);
      const doctorId = res.doctor_id || res.user?.id;
      if (ok) {
        ok.innerHTML = `Account created. Your Doctor ID is <strong>${doctorId}</strong>. Redirecting to login…`;
        ok.style.display = 'block';
      }
      setTimeout(() => {
        window.location.hash = `#/doctor/login?id=${encodeURIComponent(doctorId || '')}`;
      }, 1800);
    } catch (ex) {
      if (err) {
        err.textContent = ex.message || 'Registration failed';
        err.style.display = 'block';
      }
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Doctor Account';
      }
    }
  });
}
