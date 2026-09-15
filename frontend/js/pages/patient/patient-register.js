/**
 * MediKiosk Web — Multi-step Patient Registration
 * Personal → Medical → Documents → Create account → Login
 */

import { authApi } from '../../api/auth.api.js';

const DOC_TYPES = [
  { value: 'prescription', label: 'Prescription' },
  { value: 'lab_report', label: 'Lab Report' },
  { value: 'scan_imaging', label: 'Scan / Imaging' },
  { value: 'discharge_summary', label: 'Discharge Summary' },
  { value: 'consultation', label: 'Previous Consultation' },
  { value: 'other', label: 'Other' },
];

let step = 1;
let pendingFiles = [];

export function renderPatientRegister() {
  return `
    <div class="auth-shell auth-shell--wide">
      <div class="auth-card auth-card--wide">
        <div class="auth-card__header">
          <h2 class="text-h2">Patient Registration</h2>
          <p class="auth-card__subtitle">Create your ABHA-linked MediKiosk profile.</p>
          <div class="register-steps" id="registerSteps">
            <span class="register-step is-active" data-step="1">1. Personal</span>
            <span class="register-step" data-step="2">2. Medical</span>
            <span class="register-step" data-step="3">3. Records</span>
          </div>
        </div>

        <form id="patientRegisterForm" class="auth-form">
          <div class="register-panel" data-panel="1">
            <div class="form-grid-2">
              <div class="form-span-2">
                <label class="auth-label" for="full_name">Full Name</label>
                <input class="form-input auth-input" id="full_name" name="full_name" required />
              </div>
              <div>
                <label class="auth-label" for="date_of_birth">Date of Birth</label>
                <input class="form-input auth-input" type="date" id="date_of_birth" name="date_of_birth" required />
              </div>
              <div>
                <label class="auth-label" for="age">Age</label>
                <input class="form-input auth-input" type="number" min="0" max="120" id="age" name="age" required />
              </div>
              <div>
                <label class="auth-label" for="gender">Gender</label>
                <select class="form-input auth-input" id="gender" name="gender" required>
                  <option value="">Select</option>
                  <option>Male</option>
                  <option>Female</option>
                  <option>Other</option>
                </select>
              </div>
              <div>
                <label class="auth-label" for="email">Email</label>
                <input class="form-input auth-input" type="email" id="email" name="email" />
              </div>
              <div>
                <label class="auth-label" for="phone">Phone Number</label>
                <input class="form-input auth-input" id="phone" name="phone" required inputmode="tel" />
              </div>
              <div>
                <label class="auth-label" for="city">City</label>
                <input class="form-input auth-input" id="city" name="city" required />
              </div>
              <div class="form-span-2">
                <label class="auth-label" for="emergency_contact">Emergency Contact</label>
                <input class="form-input auth-input" id="emergency_contact" name="emergency_contact" required placeholder="Name & phone" />
              </div>
              <div class="form-span-2">
                <label class="auth-label" for="abha_id">Existing ABHA ID (optional)</label>
                <input class="form-input auth-input" id="abha_id" name="abha_id" placeholder="Leave blank to generate a new ABHA ID" />
              </div>
            </div>
          </div>

          <div class="register-panel" data-panel="2" hidden>
            <div class="form-grid-2">
              <div>
                <label class="auth-label" for="blood_group">Blood Group</label>
                <select class="form-input auth-input" id="blood_group" name="blood_group">
                  <option value="">Select</option>
                  <option>A+</option><option>A-</option>
                  <option>B+</option><option>B-</option>
                  <option>AB+</option><option>AB-</option>
                  <option>O+</option><option>O-</option>
                  <option>Unknown</option>
                </select>
              </div>
              <div>
                <label class="auth-label" for="allergy_food">Food Allergies</label>
                <input class="form-input auth-input" id="allergy_food" name="allergy_food" placeholder="e.g. peanuts" />
              </div>
              <div>
                <label class="auth-label" for="allergy_drug">Drug Allergies</label>
                <input class="form-input auth-input" id="allergy_drug" name="allergy_drug" placeholder="e.g. penicillin" />
              </div>
              <div>
                <label class="auth-label" for="allergy_environmental">Environmental Allergies</label>
                <input class="form-input auth-input" id="allergy_environmental" name="allergy_environmental" placeholder="e.g. pollen" />
              </div>
              <div class="form-span-2">
                <label class="auth-label" for="current_medications">Current Medications</label>
                <textarea class="form-input auth-input" id="current_medications" name="current_medications" rows="2"></textarea>
              </div>
              <div class="form-span-2">
                <label class="auth-label" for="pre_existing_conditions">Major Pre-existing Conditions</label>
                <textarea class="form-input auth-input" id="pre_existing_conditions" name="pre_existing_conditions" rows="2"></textarea>
              </div>
              <div class="form-span-2">
                <label class="auth-label" for="chronic_diseases">Chronic Diseases</label>
                <textarea class="form-input auth-input" id="chronic_diseases" name="chronic_diseases" rows="2"></textarea>
              </div>
              <div class="form-span-2">
                <label class="auth-label" for="surgical_history">Previous Major Surgeries</label>
                <textarea class="form-input auth-input" id="surgical_history" name="surgical_history" rows="2"></textarea>
              </div>
              <div class="form-span-2">
                <label class="auth-label" for="medical_history">Relevant Medical History</label>
                <textarea class="form-input auth-input" id="medical_history" name="medical_history" rows="3"></textarea>
              </div>
            </div>
          </div>

          <div class="register-panel" data-panel="3" hidden>
            <p style="font-size:14px; color:var(--text-secondary); margin-bottom:var(--space-4);">
              Optionally upload previous medical records. Supported: images and common documents.
            </p>
            <div class="form-grid-2">
              <div>
                <label class="auth-label" for="document_type">Document Type</label>
                <select class="form-input auth-input" id="document_type">
                  ${DOC_TYPES.map((t) => `<option value="${t.value}">${t.label}</option>`).join('')}
                </select>
              </div>
              <div>
                <label class="auth-label" for="document_files">Choose Files</label>
                <input class="form-input auth-input" type="file" id="document_files" multiple accept="image/*,.pdf,.doc,.docx" />
              </div>
            </div>
            <button type="button" id="btnAddDocuments" class="btn btn-secondary btn-lg" style="margin-top:var(--space-3);">
              Add Documents
            </button>
            <ul id="documentList" class="register-doc-list"></ul>
          </div>

          <div id="patientRegisterError" class="auth-error" style="display:none;"></div>
          <div id="patientRegisterSuccess" class="auth-success" style="display:none;"></div>

          <div class="register-nav">
            <button type="button" id="btnRegBack" class="btn btn-ghost btn-lg" hidden>Back</button>
            <button type="button" id="btnRegNext" class="btn btn-primary btn-lg">Next</button>
            <button type="submit" id="btnRegSubmit" class="btn btn-primary btn-lg" hidden>Create Account</button>
          </div>
        </form>

        <div class="auth-footer">
          Already have an ABHA?
          <a href="#/patient/login">Login</a>
        </div>
      </div>
    </div>
  `;
}

function setStep(next) {
  step = next;
  document.querySelectorAll('.register-panel').forEach((panel) => {
    panel.hidden = Number(panel.dataset.panel) !== step;
  });
  document.querySelectorAll('.register-step').forEach((el) => {
    el.classList.toggle('is-active', Number(el.dataset.step) === step);
  });
  const back = document.getElementById('btnRegBack');
  const nextBtn = document.getElementById('btnRegNext');
  const submit = document.getElementById('btnRegSubmit');
  if (back) back.hidden = step === 1;
  if (nextBtn) nextBtn.hidden = step === 3;
  if (submit) submit.hidden = step !== 3;
}

function renderDocList() {
  const list = document.getElementById('documentList');
  if (!list) return;
  if (!pendingFiles.length) {
    list.innerHTML = '<li class="register-doc-empty">No documents added yet.</li>';
    return;
  }
  list.innerHTML = pendingFiles.map((item, idx) => `
    <li>
      <span>${item.file.name}</span>
      <span class="badge badge-blue">${item.type}</span>
      <button type="button" data-remove="${idx}" class="btn btn-ghost btn-sm">Remove</button>
    </li>
  `).join('');
  list.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.addEventListener('click', () => {
      pendingFiles.splice(Number(btn.dataset.remove), 1);
      renderDocList();
    });
  });
}

function validateStep1() {
  const required = ['full_name', 'date_of_birth', 'age', 'gender', 'phone', 'city', 'emergency_contact'];
  for (const id of required) {
    const el = document.getElementById(id);
    if (!el || !String(el.value || '').trim()) {
      el?.focus();
      return false;
    }
  }
  return true;
}

export function initPatientRegister() {
  step = 1;
  pendingFiles = [];
  setStep(1);
  renderDocList();

  const dob = document.getElementById('date_of_birth');
  const age = document.getElementById('age');
  dob?.addEventListener('change', () => {
    if (!dob.value || !age) return;
    const birth = new Date(dob.value);
    const today = new Date();
    let years = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) years -= 1;
    age.value = String(Math.max(0, years));
  });

  document.getElementById('btnRegBack')?.addEventListener('click', () => setStep(Math.max(1, step - 1)));
  document.getElementById('btnRegNext')?.addEventListener('click', () => {
    if (step === 1 && !validateStep1()) {
      const err = document.getElementById('patientRegisterError');
      if (err) {
        err.textContent = 'Please fill all required personal information fields.';
        err.style.display = 'block';
      }
      return;
    }
    const err = document.getElementById('patientRegisterError');
    if (err) err.style.display = 'none';
    setStep(Math.min(3, step + 1));
  });

  document.getElementById('btnAddDocuments')?.addEventListener('click', () => {
    const input = document.getElementById('document_files');
    const type = document.getElementById('document_type')?.value || 'other';
    const files = Array.from(input?.files || []);
    files.forEach((file) => pendingFiles.push({ file, type }));
    if (input) input.value = '';
    renderDocList();
  });

  document.getElementById('patientRegisterForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = document.getElementById('patientRegisterError');
    const ok = document.getElementById('patientRegisterSuccess');
    if (err) err.style.display = 'none';
    if (ok) ok.style.display = 'none';

    if (!validateStep1()) {
      setStep(1);
      if (err) {
        err.textContent = 'Please fill all required personal information fields.';
        err.style.display = 'block';
      }
      return;
    }

    const formData = new FormData();
    const fields = [
      'full_name', 'date_of_birth', 'age', 'gender', 'email', 'phone', 'city',
      'emergency_contact', 'blood_group', 'allergy_food', 'allergy_drug',
      'allergy_environmental', 'current_medications', 'pre_existing_conditions',
      'chronic_diseases', 'surgical_history', 'medical_history', 'abha_id',
    ];
    fields.forEach((name) => {
      const el = document.getElementById(name);
      formData.append(name, el ? el.value.trim() : '');
    });

    pendingFiles.forEach((item) => {
      formData.append('documents', item.file);
      formData.append('document_types', item.type);
    });

    const submitBtn = document.getElementById('btnRegSubmit');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Creating account…';
    }

    try {
      const res = await authApi.registerPatient(formData);
      const abha = res.abha_id || res.user?.abha_id;
      if (ok) {
        ok.innerHTML = `Account created. Your ABHA ID is <strong>${abha}</strong>. Redirecting to login…`;
        ok.style.display = 'block';
      }
      setTimeout(() => {
        window.location.hash = `#/patient/login?abha=${encodeURIComponent(abha || '')}`;
      }, 1800);
    } catch (ex) {
      if (err) {
        err.textContent = ex.message || 'Registration failed';
        err.style.display = 'block';
      }
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Account';
      }
    }
  });
}
