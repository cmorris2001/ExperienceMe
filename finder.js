// finder.js
// Simple interactive filtering: answers -> filters -> live matches

// ---------------------------
// Finder state (store selections here)
// ---------------------------
const state = {
  recipient: '',   // partner/friend/family/etc not used for filtering yet, just UX
  occasion: '',    // birthday/anniversary/etc not used for filtering yet, just UX
  type: '',        // maps to category_id for filtering
  county: '',
  budget: ''
};

// ---------------------------
// Options
// ---------------------------
const RECIPIENTS = ['Partner', 'Family member', 'Friend', 'Colleague', 'Other'];
const OCCASIONS = ['Birthday', 'Anniversary', 'Thank you', 'Valentines', 'Just because'];
const TYPES = [
  { label: 'Food & drink', key: 'food' },
  { label: 'Outdoors', key: 'outdoors' },
  { label: 'Wellness', key: 'wellness' },
  { label: 'Adventure', key: 'adventure' },
  { label: 'Arts & creativity', key: 'arts' }
];

// IMPORTANT:
// Category types linking to supabase
const TYPE_TO_CATEGORY_ID = {
  food:      'b97c14aa-cd1e-4f9d-8670-6d7cb0ab5cd4',
  outdoors:  '50f6b39a-2399-43fa-a661-b85930e8f1d3',
  wellness:  'da794edb-3c5b-4f8b-aae6-29b22454fc6e',
  adventure: 'cd35ad00-dad3-4bb6-b0a9-c9709a74df4d',
  arts:      'f9a0e772-bbfd-4292-9ba4-a4f857b18135'
};

// ---------------------------
// DOM Ready
// ---------------------------
document.addEventListener('DOMContentLoaded', async () => {
  // Basic nav state
  await updateNavForAuthState();
  bindNavEvents();

  // Build chip UI
  renderChipRow('recipientChips', RECIPIENTS, (value) => {
    state.recipient = value;
    refreshMatches();
  });

  renderChipRow('occasionChips', OCCASIONS, (value) => {
    state.occasion = value;
    refreshMatches();
  });

  renderChipRow('typeChips', TYPES.map(t => t.label), (value) => {
    state.type = value;
    refreshMatches();
  });

  // Load counties into dropdown
  await loadCountyOptions();

  // Bind dropdowns + buttons
  bindFinderEvents();

  // First refresh (optional)
  refreshMatches();
});

// ---------------------------
// Nav helpers (role-aware)
// ---------------------------
async function updateNavForAuthState() {
  const navGuest = document.getElementById('navGuest');
  const navUser = document.getElementById('navUser');
  const navBusiness = document.getElementById('navBusiness');

  // default
  if (navGuest) navGuest.style.display = 'flex';
  if (navUser) navUser.style.display = 'none';
  if (navBusiness) navBusiness.style.display = 'none';

  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) return;

    const { data: userRow, error } = await supabaseClient
      .from('users')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (error) console.warn('Role lookup error (defaulting to user nav):', error);

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

function bindNavEvents() {
  const signOut = async () => {
    await supabaseClient.auth.signOut();
    window.location.href = 'landing.html';
  };

  document.getElementById('btnSignOut')?.addEventListener('click', signOut);
  document.getElementById('btnSignOutBusiness')?.addEventListener('click', signOut);
}


// ---------------------------
// UI building blocks
// ---------------------------
function renderChipRow(containerId, values, onPick) {
  const el = document.getElementById(containerId);
  if (!el) return;

  el.innerHTML = '';

  values.forEach((v) => {
    const btn = document.createElement('button');
    btn.className = 'chip';
    btn.type = 'button';
    btn.textContent = v;

    btn.addEventListener('click', () => {
      // Toggle behaviour: clicking the same chip unselects it
      const isActive = btn.classList.contains('active');
      el.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));

      if (!isActive) {
        btn.classList.add('active');
        onPick(v);
      } else {
        onPick(''); // unselect
      }
    });

    el.appendChild(btn);
  });
}

async function loadCountyOptions() {
  const countySelect = document.getElementById('countySelect');
  if (!countySelect) return;

  try {
    const { data, error } = await supabaseClient
      .from('county')
      .select('county_id')
      .order('county_id');

    if (error) throw error;

    (data || []).forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c.county_id;
      opt.textContent = c.county_id;
      countySelect.appendChild(opt);
    });
  } catch (err) {
    console.error('Failed to load counties:', err);
  }
}

function bindFinderEvents() {
  const countySelect = document.getElementById('countySelect');
  const budgetSelect = document.getElementById('budgetSelect');

  countySelect?.addEventListener('change', () => {
    state.county = countySelect.value || '';
    refreshMatches();
  });

  budgetSelect?.addEventListener('change', () => {
    state.budget = budgetSelect.value || '';
    refreshMatches();
  });

  document.getElementById('btnReset')?.addEventListener('click', () => {
    resetFinder();
    refreshMatches();
  });

  document.getElementById('btnSeeMatches')?.addEventListener('click', () => {
    goToExperiencesWithFinderFilters();
  });
}

function resetFinder() {
  state.recipient = '';
  state.occasion = '';
  state.type = '';
  state.county = '';
  state.budget = '';

  // Clear dropdowns
  const countySelect = document.getElementById('countySelect');
  const budgetSelect = document.getElementById('budgetSelect');
  if (countySelect) countySelect.value = '';
  if (budgetSelect) budgetSelect.value = '';

  // Clear chip highlights
  document.querySelectorAll('.chip-row').forEach(row => {
    row.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  });
}

// ---------------------------
// Core: refresh matches
// ---------------------------
async function refreshMatches() {
  const matchesList = document.getElementById('matchesList');
  if (!matchesList) return;

  matchesList.innerHTML = '<div class="loading">Loading matches...</div>';

  try {
    const filters = buildFiltersFromState();
    const results = await fetchMatches(filters);

    if (!results.length) {
      matchesList.innerHTML = '<div class="no-results">No matches yet — try different options.</div>';
      return;
    }

    matchesList.innerHTML = results.map(renderMatchCard).join('');

    // Wire up View buttons
    matchesList.querySelectorAll('[data-view-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-view-id');
        if (id) window.location.href = `detailed_experience.html?id=${encodeURIComponent(id)}&src=finder`;
      });
    });

  } catch (err) {
    console.error(err);
    matchesList.innerHTML = '<div class="no-results">Something went wrong loading matches.</div>';
  }
}

function buildFiltersFromState() {
  // Map selected type label -> type key -> category UUID
  const typeObj = TYPES.find(t => t.label === state.type);
  const typeKey = typeObj?.key || '';
  const categoryId = typeKey ? TYPE_TO_CATEGORY_ID[typeKey] : '';

  return {
    categoryId,
    county: state.county,
    budget: state.budget
  };
}

// ---------------------------
// Data: fetch matches from Supabase
// ---------------------------
async function fetchMatches({ categoryId, county, budget }) {
  // If category is selected, find matching experience IDs via link table (3NF safe)
  let categoryExperienceIds = null;

  if (categoryId) {
    categoryExperienceIds = await getExperienceIdsForCategory(categoryId);

    // no matches -> return early
    if (!categoryExperienceIds.length) return [];
  }

  let query = supabaseClient
    .from('experiences')
    .select(`
      experience_id,
      title,
      county,
      min_price,
      business:business_id(business_name),
      image(image_url, is_primary)
    `)
    .in('status', ['approved', 'Approved'])
    .eq('is_published', true);

  if (county) query = query.eq('county', county);

  if (budget === 'under_50') query = query.lte('min_price', 50);
  if (budget === '50_100') query = query.gte('min_price', 50).lte('min_price', 100);
  if (budget === '100_200') query = query.gte('min_price', 100).lte('min_price', 200);
  if (budget === '200_plus') query = query.gte('min_price', 200);

  if (Array.isArray(categoryExperienceIds)) {
    query = query.in('experience_id', categoryExperienceIds);
  }

  // Keep it light for the live panel
  const { data, error } = await query.limit(3);
  if (error) throw error;

  return data || [];
}

async function getExperienceIdsForCategory(categoryId) {
  const { data, error } = await supabaseClient
    .from('experience_category')
    .select('experience_id')
    .eq('category_id', categoryId);

  if (error) throw error;

  return [...new Set((data || []).map(r => r.experience_id))];
}

// ---------------------------
// Rendering matches (simple)
// ---------------------------
function renderMatchCard(exp) {
  const title = escapeHtml(exp.title || 'Experience');
  const county = escapeHtml(exp.county || 'Ireland');
  const businessName = escapeHtml(exp.business?.business_name || '');
  const fromPrice = exp.min_price != null ? `€${Number(exp.min_price).toFixed(0)}` : '€—';
  const imgUrl = getPrimaryImageUrl(exp) || 'https://via.placeholder.com/300x200';

  return `
    <div class="match-card">
      <img class="match-img" src="${imgUrl}" alt="${title}" loading="lazy" />
      <div class="match-body">
        <h3>${title}</h3>
        <p class="muted">${county} • From ${fromPrice}</p>
        <p class="muted">${businessName}</p>
      </div>
      <button class="btn-small" data-view-id="${exp.experience_id}">View</button>
    </div>
  `;
}

// ---------------------------
// Navigate to experiences.html with filters (simple)
// ---------------------------
function goToExperiencesWithFinderFilters() {
  const filters = buildFiltersFromState();

  const params = new URLSearchParams();
  if (filters.county) params.set('county', filters.county);
  if (filters.budget) params.set('budget', filters.budget);
  if (filters.categoryId) params.set('category_id', filters.categoryId);
  params.set('src', 'finder');

  window.location.href = `experiences.html?${params.toString()}`;
}

// ---------------------------
// Small helpers (safe for innerHTML)
// ---------------------------
function getPrimaryImageUrl(exp) {
  const imgs = exp?.image || [];
  const primary = imgs.find(i => i.is_primary) || imgs[0];
  return primary?.image_url || '';
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
