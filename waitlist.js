// waitlist.js

// ---------------------------
// DOM Ready
// ---------------------------
document.addEventListener('DOMContentLoaded', async () => {
  // Optional nav handling (only works if these IDs exist on the page)
  await updateNavForAuthState_Safe();
  bindNavEvents_Safe();

  // Load dropdowns (county + category)
  await loadCountyOptions();
  await loadCategoryOptions();

  // Bind submit handler
  bindWaitlistForm();
});


// ---------------------------
// NAV HELPERS
// ---------------------------
async function updateNavForAuthState_Safe() {
  const navGuest = document.getElementById('navGuest');
  const navUser = document.getElementById('navUser');
  const navBusiness = document.getElementById('navBusiness');

  // If nav not present on this page, exit safely
  if (!navGuest && !navUser && !navBusiness) return;

  // Default state: guest visible
  if (navGuest) navGuest.style.display = 'flex';
  if (navUser) navUser.style.display = 'none';
  if (navBusiness) navBusiness.style.display = 'none';

  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;

    // Role is stored in your public.users table (based on your previous finder.js)
    const { data: userRow, error } = await supabaseClient
      .from('users')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (error) console.warn('Role lookup error (defaulting to guest nav):', error);

    const role = userRow?.role || 'user';

    if (navGuest) navGuest.style.display = 'none';
    if (role === 'business') {
      if (navBusiness) navBusiness.style.display = 'flex';
    } else {
      if (navUser) navUser.style.display = 'flex';
    }
  } catch (e) {
    console.warn('Auth/nav error:', e);
    if (navGuest) navGuest.style.display = 'flex';
    if (navUser) navUser.style.display = 'none';
    if (navBusiness) navBusiness.style.display = 'none';
  }
}

function bindNavEvents_Safe() {
  const btnSignOut = document.getElementById('btnSignOut');
  const btnSignOutBusiness = document.getElementById('btnSignOutBusiness');

  // If buttons not on this page, safely ignore
  if (!btnSignOut && !btnSignOutBusiness) return;

  const signOut = async () => {
    await supabaseClient.auth.signOut();
    window.location.href = 'landing.html';
  };

  btnSignOut?.addEventListener('click', signOut);
  btnSignOutBusiness?.addEventListener('click', signOut);
}


// ---------------------------
// LOAD COUNTY OPTIONS
// ---------------------------
async function loadCountyOptions() {
  const countySelect = document.getElementById('countySelect');
  if (!countySelect) return;

  try {
    const { data, error } = await supabaseClient
      .from('county')
      .select('county_id')
      .order('county_id');

    if (error) throw error;

    // Populate dropdown
    (data || []).forEach((row) => {
      const opt = document.createElement('option');
      opt.value = row.county_id;      // This matches your county table (text PK)
      opt.textContent = row.county_id;
      countySelect.appendChild(opt);
    });

  } catch (err) {
    console.error('Failed to load county options:', err);
    showAlert('Could not load counties. Please refresh the page.', 'error');
  }
}


// ---------------------------
// LOAD CATEGORY OPTIONS
// ---------------------------

async function loadCategoryOptions() {
  const categorySelect = document.getElementById('categorySelect');
  if (!categorySelect) return;

  try {

    const selectAttempts = [
      'category_id, category_name',
      'category_id, name',
      'category_id, label',
      'category_id, title',
      'category_id'
    ];

    let data = null;

    for (const selectStr of selectAttempts) {
      const res = await supabaseClient
        .from('category')
        .select(selectStr)
        .order('category_id');

      if (!res.error) {
        data = res.data || [];
        break;
      }
    }

    if (!data) {
      showAlert('Could not load categories. Please refresh the page.', 'error');
      return;
    }

    // Populate dropdown
    data.forEach((row) => {
      const opt = document.createElement('option');
      opt.value = row.category_id;

      // Display name fallback logic
      const display =
        row.category_name ||
        row.name ||
        row.label ||
        row.title ||
        row.category_id;

      opt.textContent = display;
      categorySelect.appendChild(opt);
    });

  } catch (err) {
    console.error('Failed to load category options:', err);
    showAlert('Could not load categories. Please refresh the page.', 'error');
  }
}


// ---------------------------
// FORM SUBMIT and INSERT INTO business_waitlist
// ---------------------------
function bindWaitlistForm() {
  const form = document.getElementById('waitlistForm');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Read inputs
    const contact_name = getValue('contactName');
    const contact_email = getValue('contactEmail').toLowerCase();
    const business_name = getValue('businessName');
    const website = getValue('website');
    const county = getValue('countySelect');
    const category_id = getValue('categorySelect');
    const challenges_getting_bookings = getValue('challenges');

    // Basic validation
    if (!contact_name || !contact_email || !business_name || !website || !county || !category_id || !challenges_getting_bookings) {
      showAlert('Please fill in all required fields before submitting.', 'error');
      return;
    }

    if (!isValidEmail(contact_email)) {
      showAlert('Please enter a valid email address.', 'error');
      return;
    }

    // Submit state
    const submitBtn = form.querySelector('button[type="submit"]');
    setSubmitting(submitBtn, true);

    try {
      // Insert into waitlist table
      const { error } = await supabaseClient
        .from('business_waitlist')
        .insert([{
          contact_name,
          contact_email,
          business_name,
          website,
          county,
          category_id,
          challenges_getting_bookings,
          status: 'new' // default stage
        }]);

      if (error) {
        console.error('Insert error:', error);

        //  Duplicate handling (unique constraint on contact_email) as many businesses are the similiar
        if (isDuplicateEmailError(error)) {
          showAlert('You are already on the waitlist with this email. If you need to update details, contact us.', 'error');
        } else {
          showAlert('Something went wrong submitting the form. Please try again.', 'error');
        }

        setSubmitting(submitBtn, false);
        return;
      }

      // Success
      showAlert('Success! You are on the Early Business Access list. We will email you with next steps.', 'success');

      // Reset form after success
      form.reset();

      // Reset dropdowns back to placeholder option
      document.getElementById('countySelect').value = '';
      document.getElementById('categorySelect').value = '';

      setSubmitting(submitBtn, false);

    } catch (err) {
      console.error('Unexpected submit error:', err);
      showAlert('Unexpected error. Please refresh the page and try again.', 'error');
      setSubmitting(submitBtn, false);
    }
  });
}


// ---------------------------
// ALERT UI
// ---------------------------

function showAlert(message, type = 'info') {
  const alertEl = document.getElementById('waitlistAlert');
  if (!alertEl) return;

  alertEl.textContent = message;

  // Reset classes
  alertEl.classList.remove('alert-info', 'alert-success', 'alert-error', 'hidden');

  // Apply type class
  if (type === 'success') alertEl.classList.add('alert-success');
  else if (type === 'error') alertEl.classList.add('alert-error');
  else alertEl.classList.add('alert-info');

  // Ensure visible
  alertEl.classList.remove('hidden');

  // Optional: auto-hide success messages after a few seconds
  if (type === 'success') {
    setTimeout(() => {
      alertEl.classList.add('hidden');
    }, 6000);
  }
}


// ---------------------------
// SMALL HELPERS
// ---------------------------
function getValue(id) {
  const el = document.getElementById(id);
  if (!el) return '';
  return String(el.value || '').trim();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function isDuplicateEmailError(error) {
  // Postgres unique_violation code is 23505
  if (error?.code === '23505') return true;

  const msg = String(error?.message || '').toLowerCase();
  return msg.includes('duplicate') || msg.includes('unique') || msg.includes('contact_email');
}

function setSubmitting(btn, isSubmitting) {
  if (!btn) return;
  btn.disabled = isSubmitting;
  btn.textContent = isSubmitting ? 'Submitting...' : 'Join waitlist';
}