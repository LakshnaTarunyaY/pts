/**
 * MediKiosk Web — Registration role selection
 */

export function renderRegisterRole() {
  return `
    <div class="auth-shell">
      <div class="auth-card" style="max-width:560px;">
        <div class="auth-card__header">
          <h2 class="text-h2">Register / Sign Up</h2>
          <p class="auth-card__subtitle">Select your role to create a MediKiosk account.</p>
        </div>

        <div class="register-role-grid">
          <a href="#/register/patient" class="register-role-card">
            <div class="auth-card__icon auth-card__icon--patient" aria-hidden="true">
              <i class="fa-solid fa-user"></i>
            </div>
            <h3 class="text-h3">Patient</h3>
            <p>Create an ABHA-linked health profile and upload previous medical records.</p>
            <span class="register-role-card__cta">Continue as Patient →</span>
          </a>

          <a href="#/register/doctor" class="register-role-card">
            <div class="auth-card__icon auth-card__icon--doctor" aria-hidden="true">
              <i class="fa-solid fa-user-doctor"></i>
            </div>
            <h3 class="text-h3">Doctor</h3>
            <p>Register as a clinician and receive a unique Doctor ID for login.</p>
            <span class="register-role-card__cta">Continue as Doctor →</span>
          </a>
        </div>

        <div class="auth-footer">
          Already registered?
          <a href="#/account-type">Back to portals</a>
        </div>
      </div>
    </div>
  `;
}

export function initRegisterRole() {}
