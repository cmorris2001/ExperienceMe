/**
 * experiences.js
 * Purpose:
 *  - Load filter dropdowns (category + county)
 *  - Load experiences (approved + published)
 *  - Apply filters (search, county, budget, category)
 *  - Keep nav state correct (guest vs user) + sign out
 *
 * Notes:
 *  - This version avoids using PostgREST inner-join syntax in the select string.
 *  - Category filtering is done in two steps:
 *      1) Get matching experience_ids from experience_category
 *      2) Filter experiences using .in('experience_id', [...])
 */
// Wait for DOM to be fully loaded before running any JS
  document.addEventListener('DOMContentLoaded', async () => {
  console.log('✅ experiences.js loaded', { supabaseClient: typeof supabaseClient });

  const els = getEls();

  // 1) Nav
  await updateNavForAuthState(els);

  // 2) Events
  bindEvents(els);

  // 3) Load dropdowns first (important)
  await loadFilterOptions(els);

  // 4) Apply URL params into the UI, then load experiences
  applyFiltersFromUrl(els);
  await loadExperiences(els);
});


// =============================
// Element cache helper
// =============================
function getEls() {
  return {
    navGuest: document.getElementById('navGuest'),
    navUser: document.getElementById('navUser'),
    btnSignOut: document.getElementById('btnSignOut'),

    heroSearch: document.getElementById('heroSearch'),
    btnHeroSearch: document.getElementById('btnHeroSearch'),

    categorySelect: document.getElementById('categorySelect'),
    countySelect: document.getElementById('countySelect'),
    budgetSelect: document.getElementById('budgetSelect'),

    btnApplyFilters: document.getElementById('btnApplyFilters'),
    btnClearFilters: document.getElementById('btnClearFilters'),

    resultsMeta: document.getElementById('resultsMeta'),
    experiencesGrid: document.getElementById('experiencesGrid'),
  };
}

// =============================
// Auth + nav state
// =============================
async function updateNavForAuthState(els) {
  try {
    const { data: { user }, error } = await supabaseClient.auth.getUser();
    if (error) console.warn('Auth getUser warning:', error.message);

    const isLoggedIn = !!user;
    if (els.navGuest) els.navGuest.style.display = isLoggedIn ? 'none' : 'flex';
    if (els.navUser) els.navUser.style.display = isLoggedIn ? 'flex' : 'none';
  } catch (err) {
    console.warn('Auth check failed:', err);
    // If auth fails, default to guest
    if (els.navGuest) els.navGuest.style.display = 'flex';
    if (els.navUser) els.navUser.style.display = 'none';
  }
}

// =============================
// UI event bindings
// =============================
function bindEvents(els) {
  // Apply filters button
  els.btnApplyFilters?.addEventListener('click', () => loadExperiences(els));

  // Clear filters button
  els.btnClearFilters?.addEventListener('click', () => {
    els.categorySelect.value = '';
    els.countySelect.value = '';
    els.budgetSelect.value = '';
    els.heroSearch.value = '';
    loadExperiences(els);
  });

  // Search button in hero
  els.btnHeroSearch?.addEventListener('click', () => loadExperiences(els));

  // Enter key in hero search input
  els.heroSearch?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') loadExperiences(els);
  });

  // Sign out (only exists in logged-in nav)
  els.btnSignOut?.addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    window.location.reload();
  });
}

// =============================
// Load dropdown options (category + county)
// =============================
async function loadFilterOptions(els) {
  // Load categories
  try {
    const { data: categories, error } = await supabaseClient
      .from('category')
      .select('category_id, category_name')
      .order('category_name');

    if (error) throw error;

    (categories || []).forEach((cat) => {
      const opt = document.createElement('option');
      opt.value = cat.category_id;
      opt.textContent = cat.category_name;
      els.categorySelect.appendChild(opt);
    });
  } catch (err) {
    console.error('Failed to load categories:', err);
  }

  // Load counties
  try {
    const { data: counties, error } = await supabaseClient
      .from('county')
      .select('county_id')
      .order('county_id');

    if (error) throw error;

    (counties || []).forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c.county_id;
      opt.textContent = c.county_id;
      els.countySelect.appendChild(opt);
    });
  } catch (err) {
    console.error('Failed to load counties:', err);
  }
}

// =============================
// Read filters from UI
// =============================
function getFilters(els) {
  return {
    searchText: (els.heroSearch.value || '').trim(),
    categoryId: els.categorySelect.value || '',
    county: els.countySelect.value || '',
    budget: els.budgetSelect.value || '',
  };
}

// =============================
// Category filter helper (no inner join)
// =============================
async function getExperienceIdsForCategory(categoryId) {
  if (!categoryId) return null; // means "no category filtering"

  const { data, error } = await supabaseClient
    .from('experience_category')
    .select('experience_id')
    .eq('category_id', categoryId);

  if (error) throw error;

  const ids = (data || []).map((r) => r.experience_id).filter(Boolean);
  return ids;
}

// =============================
// Main loader: build query + render
// =============================
async function loadExperiences(els) {
  // Show loading state
  els.resultsMeta.textContent = 'Loading experiences...';
  els.experiencesGrid.innerHTML = '<div class="loading">Loading...</div>';

  const { searchText, categoryId, county, budget } = getFilters(els);
  console.log('Filters:', getFilters(els));

  try {
    // 1) If category selected, fetch matching experience IDs first
    let categoryExperienceIds = null;
    if (categoryId) {
      categoryExperienceIds = await getExperienceIdsForCategory(categoryId);

      // No matches => quick exit
      if (!categoryExperienceIds.length) {
        els.resultsMeta.textContent = '0 experiences found';
        els.experiencesGrid.innerHTML = '<div class="no-results">No experiences found</div>';
        return;
      }
    }

    // 2) Build base experiences query
    let query = supabaseClient
      .from('experiences')
      .select(`
        experience_id,
        title,
        event_description,
        county,
        min_price,
        max_price,
        business:business_id(business_name),
        image(image_url, is_primary)
      `)
      .in('status', ['approved', 'Approved'])
      .eq('is_published', true);

    // 3) Apply filters
    if (searchText) {
      // Search title or description
      query = query.or(`title.ilike.%${searchText}%,event_description.ilike.%${searchText}%`);
    }

    if (county) {
      query = query.eq('county', county);
    }

    if (budget) {
      // Budget filtering based on min_price (simple + consistent)
      if (budget === 'under_50') query = query.lte('min_price', 50);
      if (budget === '50_100') query = query.gte('min_price', 50).lte('min_price', 100);
      if (budget === '100_200') query = query.gte('min_price', 100).lte('min_price', 200);
      if (budget === '200_plus') query = query.gte('min_price', 200);
    }

    if (Array.isArray(categoryExperienceIds)) {
      query = query.in('experience_id', categoryExperienceIds);
    }

    // 4) Run query
    const { data: experiences, error } = await query;
    if (error) throw error;

    const list = experiences || [];
    els.resultsMeta.textContent = `${list.length} experiences found`;
    console.log('Experiences returned:', list.length, list);

    // 5) Render to grid
    renderExperiences(els, list);
  } catch (err) {
    console.error('Error loading experiences:', err);
    els.resultsMeta.textContent = 'Error loading experiences';
    els.experiencesGrid.innerHTML =
      '<div class="no-results">Something went wrong loading experiences.</div>';
  }
}


// =============================
// Rendering (cards)
// =============================
function renderExperiences(els, experiences) {
  if (!experiences.length) {
    els.experiencesGrid.innerHTML = '<div class="no-results">No experiences found</div>';
    return;
  }

  els.experiencesGrid.innerHTML = experiences
    .map((exp) => {
      const imgUrl = getPrimaryImageUrl(exp) || 'https://via.placeholder.com/300x200';
      const title = escapeHtml(exp.title || 'Experience');
      const county = escapeHtml(exp.county || 'Ireland');
      const desc = escapeHtml((exp.event_description || '').slice(0, 110));
      const businessName = escapeHtml(exp.business?.business_name || '');
      const fromPrice = formatEuro(exp.min_price);

      return `
        <div class="experience-card" data-id="${exp.experience_id}">
          <img
            src="${imgUrl}"
            alt="${title}"
            class="experience-card-img"
            loading="lazy"
          />
          <div class="experience-card-body">
            <h3>${title}</h3>
            <p class="location">${county} • From ${fromPrice}</p>
            <p class="description">${desc}${desc.length ? '...' : ''}</p>
            <p class="business">${businessName}</p>
          </div>
        </div>
      `;
    })
    .join('');

  // Click handling (no inline onclick attributes)
  els.experiencesGrid.querySelectorAll('.experience-card').forEach((card) => {
    card.addEventListener('click', () => {
      const id = card.getAttribute('data-id');
      if (id) window.location.href = `detailed_experience.html?id=${encodeURIComponent(id)}`;
    });
  });
}

// =============================
// Helpers
// =============================
function getPrimaryImageUrl(exp) {
  const imgs = exp?.image || [];
  const primary = imgs.find((i) => i.is_primary) || imgs[0];
  return primary?.image_url || '';
}

function formatEuro(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '€0';
  return `€${n.toFixed(0)}`;
}

// Minimal HTML escape to avoid broken markup when titles/descriptions contain symbols
function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function applyFiltersFromUrl(els) {
  const params = new URLSearchParams(window.location.search);

  const q = (params.get('q') || '').trim();
  const county = (params.get('county') || '').trim();
  const categoryId = (params.get('category_id') || '').trim();
  const budget = (params.get('budget') || '').trim();

  // Set the hero search
  if (q) els.heroSearch.value = q;

  // Set county dropdown (only if option exists)
  if (county && [...els.countySelect.options].some(o => o.value === county)) {
    els.countySelect.value = county;
  }

  // Set category dropdown (only if option exists)
  if (categoryId && [...els.categorySelect.options].some(o => o.value === categoryId)) {
    els.categorySelect.value = categoryId;
  }
}
