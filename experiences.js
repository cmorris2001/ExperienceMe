/**
 * experiences.js
 *  - Load filter dropdowns (category + county)
 *  - Load experiences (approved + published)
 *  - Apply filters (search, county, budget, category)
 *  - Keep nav state correct (guest vs user) + sign out
 */
// Wait for DOM to be fully loaded before running any JS
// experiences.js
// Entry point: run only when the HTML has loaded
document.addEventListener('DOMContentLoaded', async () => {
  console.log('✅ experiences.js loaded', { supabaseClient: typeof supabaseClient });

  // 1) Update nav based on whether user is logged in or not
  await updateNavForAuthState();

  // Wire up all page event buttons (search, filters, reset, etc.)
  bindEvents();

  // Load filter dropdown options FIRST (category/county/budget)
  await loadFilterOptions();

  // Update the filter options from the URL, new Iteration 5
  applyFiltersFromURL();

  // Fetch + render experiences using whatever the UI filters currently are
  await loadExperiences();
});

// =============================
// Auth + nav state
// =============================
// Changed for itertion 5 for view filtering based on role

async function updateNavForAuthState() {
  const navGuest = document.getElementById('navGuest');
  const navUser = document.getElementById('navUser');
  const navBusiness = document.getElementById('navBusiness');

  const { data: { user } } = await supabaseClient.auth.getUser();

  // default
  if (navGuest) navGuest.style.display = 'flex';
  if (navUser) navUser.style.display = 'none';
  if (navBusiness) navBusiness.style.display = 'none';

  if (!user) return;

  // fetch role from public.users
  const { data: userRow } = await supabaseClient
    .from('users')
    .select('role')
    .eq('user_id', user.id)
    .single();

  const role = userRow?.role || 'user';

  if (navGuest) navGuest.style.display = 'none';

  if (role === 'business') {
    if (navBusiness) navBusiness.style.display = 'flex';
  } else {
    if (navUser) navUser.style.display = 'flex';
  }
}

// =============================
// UI event bindings
// =============================
// "Bind events" = connect buttons/inputs to the functions they should run.
function bindEvents() {
  // Grab elements directly from the DOM (Option B style)
  const btnApplyFilters = document.getElementById('btnApplyFilters');
  const btnClearFilters = document.getElementById('btnClearFilters');

  const categorySelect = document.getElementById('categorySelect');
  const countySelect   = document.getElementById('countySelect');
  const budgetSelect   = document.getElementById('budgetSelect');

  const heroSearch     = document.getElementById('heroSearch');
  const btnHeroSearch  = document.getElementById('btnHeroSearch');

  // Apply filters button: reload experiences using current filter values
  btnApplyFilters?.addEventListener('click', async () => {
    await loadExperiences();
  });

  // Clear filters button: reset all inputs, then reload experiences
  btnClearFilters?.addEventListener('click', async () => {
    if (categorySelect) categorySelect.value = '';
    if (countySelect)   countySelect.value = '';
    if (budgetSelect)   budgetSelect.value = '';
    if (heroSearch)     heroSearch.value = '';

    await loadExperiences();
  });

  // Search button in hero: reload experiences
  btnHeroSearch?.addEventListener('click', async () => {
    await loadExperiences();
  });

  // Enter key in hero search input: reload experiences
  heroSearch?.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') await loadExperiences();
  });
  // Sign Out functionality for users and business users
  const btnSignOut = document.getElementById('btnSignOut');
  const btnSignOutBusiness = document.getElementById('btnSignOutBusiness');

  const signOutHandler = async () => {
  await supabaseClient.auth.signOut();
  window.location.href = 'landing.html'; // or reload if you prefer
  };

  btnSignOut?.addEventListener('click', signOutHandler);
  btnSignOutBusiness?.addEventListener('click', signOutHandler);

}

// Iteration 5, to make filtering actually work
function applyFiltersFromURL() {
  const params = new URLSearchParams(window.location.search);

  const q = (params.get('q') || '').trim();
  const categoryId = (params.get('category_id') || '').trim();
  const county = (params.get('county') || '').trim();
  const budget = (params.get('budget') || '').trim();

  const heroSearch = document.getElementById('heroSearch');
  const categorySelect = document.getElementById('categorySelect');
  const countySelect = document.getElementById('countySelect');
  const budgetSelect = document.getElementById('budgetSelect');

  if (heroSearch && q) heroSearch.value = q;
  if (categorySelect && categoryId) categorySelect.value = categoryId;
  if (countySelect && county) countySelect.value = county;
  if (budgetSelect && budget) budgetSelect.value = budget;

  console.log('✅ Applied URL filters:', { q, categoryId, county });
}


// =============================
// Load dropdown options for category + county
// =============================
// Fetches categories + counties from Supabase and fills the <select> dropdowns.
async function loadFilterOptions() {
  // Grab dropdowns directly from the DOM (Option B style)
  const categorySelect = document.getElementById('categorySelect');
  const countySelect   = document.getElementById('countySelect');

  // If the dropdowns don't exist on this page, stop safely
  if (!categorySelect || !countySelect) return;

  // prevents duplicate options if function is called more than once
  // Keeps the first option and clears the rest for category and county
  categorySelect.querySelectorAll('option:not(:first-child)').forEach(o => o.remove());
  countySelect.querySelectorAll('option:not(:first-child)').forEach(o => o.remove());

  // -----------------------------
  // Load categories
  // -----------------------------
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
      categorySelect.appendChild(opt);
    });
  } catch (err) {
    console.error('Failed to load categories:', err);
  }

  // -----------------------------
  // Load counties
  // -----------------------------
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
      countySelect.appendChild(opt);
    });
  } catch (err) {
    console.error('Failed to load counties:', err);
  }
}

// =============================
// Read filters from UI
// =============================
function getFilters() {
  // Grab filter inputs directly from the DOM
  const heroSearch     = document.getElementById('heroSearch');
  const categorySelect = document.getElementById('categorySelect');
  const countySelect   = document.getElementById('countySelect');
  const budgetSelect   = document.getElementById('budgetSelect');

  return {
    // Text search (trim removes extra spaces at the start/end)
    searchText: (heroSearch?.value || '').trim(),

    // Dropdown values (empty string means "no filter")
    categoryId: categorySelect?.value || '',
    county: countySelect?.value || '',
    budget: budgetSelect?.value || '',
  };
}

// =============================
// Category filter helper
// =============================

//Looks up which experiences belong to a selected category and returns their IDs so you can filter the experiences list properly.

async function getExperienceIdsForCategory(categoryId) {
  if (!categoryId) return null; // means return all experiences when category isn't filtered

  const { data, error } = await supabaseClient
    .from('experience_category')
    .select('experience_id')
    .eq('category_id', categoryId);

  if (error) throw error;

  const ids = (data || []).map((r) => r.experience_id).filter(Boolean);
  return ids;
}

// =============================
// Main loader of experiences
// =============================
// =============================
// Load + render experiences
// =============================
async function loadExperiences() {
  // Grab UI elements directly from the DOM
  const resultsMeta = document.getElementById('resultsMeta');
  const experiencesGrid = document.getElementById('experiencesGrid');

  // If the grid/meta doesn't exist, stop safely (prevents console errors)
  if (!resultsMeta || !experiencesGrid) return;

  // Show loading state while we fetch data
  resultsMeta.textContent = 'Loading experiences...';
  experiencesGrid.innerHTML = '<div class="loading">Loading...</div>';

  // Read current filters from the UI
  const { searchText, categoryId, county, budget } = getFilters();
  console.log('Filters:', { searchText, categoryId, county, budget }); // Debug in console

  try {
    // ------------------------------------------------------------
    // If a category is selected, fetch matching experience IDs first
    //    (This avoids needing an inner join on the category linking table.)
    // ------------------------------------------------------------
    let categoryExperienceIds = null;

    if (categoryId) {
      categoryExperienceIds = await getExperienceIdsForCategory(categoryId);

      // If nothing matches this category, we can exit early
      if (!categoryExperienceIds.length) {
        resultsMeta.textContent = '0 experiences found';
        experiencesGrid.innerHTML = '<div class="no-results">No experiences found</div>';
        return;
      }
    }

    // ------------------------------------------------------------
    // Build base experiences query
    // ------------------------------------------------------------
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
      .eq('is_published', true); // Problem child during iteration 3

    // ------------------------------------------------------------
    // Apply filters to the query
    // ------------------------------------------------------------

    // Text search across title or description of experience, implementing type of key word search
    if (searchText) {
      query = query.or(`title.ilike.%${searchText}%,event_description.ilike.%${searchText}%`);
    }

    // County filter
    if (county) {
      query = query.eq('county', county);
    }

    // Budget filter (based on min_price)
    if (budget) {
      if (budget === 'under_50') query = query.lte('min_price', 50);
      if (budget === '50_100') query = query.gte('min_price', 50).lte('min_price', 100);
      if (budget === '100_200') query = query.gte('min_price', 100).lte('min_price', 200);
      if (budget === '200_plus') query = query.gte('min_price', 200);
    }

    // Category filter: only include experiences whose IDs are in our category list
    if (Array.isArray(categoryExperienceIds)) {
      query = query.in('experience_id', categoryExperienceIds);
    }

    // ------------------------------------------------------------
    // Run query
    // ------------------------------------------------------------
    const { data: experiences, error } = await query;
    if (error) throw error;

    const list = experiences || [];
    resultsMeta.textContent = `${list.length} experiences found`;
    console.log('Experiences returned:', list.length, list);

    // ------------------------------------------------------------
    // Render results into the grid
    // ------------------------------------------------------------
    renderExperiences(list);

  } catch (err) {
    console.error('Error loading experiences:', err);

    // Show user-friendly error message
    resultsMeta.textContent = 'Error loading experiences';
    experiencesGrid.innerHTML =
      '<div class="no-results">Something went wrong loading experiences.</div>';
  }
}

// =============================
// Render experiences into the results grid
// =============================
// Converts the experiences array into HTML cards and injects into #experiencesGrid.
function renderExperiences(experiences) {
  const experiencesGrid = document.getElementById('experiencesGrid');
  if (!experiencesGrid) return;

  // If there are no results, show a friendly message
  if (!experiences || !experiences.length) {
    experiencesGrid.innerHTML = '<div class="no-results">No experiences found</div>';
    return;
  }

  // Build all cards as one HTML string (map + join avoids commas)
  experiencesGrid.innerHTML = experiences
    .map((exp) => {
      // Pick primary image if available, else use a placeholder
      const imgUrl = getPrimaryImageUrl(exp) || 'https://via.placeholder.com/300x200';

      // Escape text to prevent broken HTML / XSS issues
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

  // Add click listeners to each card (keeps HTML clean: no inline onclick)
  experiencesGrid.querySelectorAll('.experience-card').forEach((card) => {
    card.addEventListener('click', () => {
      const id = card.getAttribute('data-id');
      if (id) {
        window.location.href = `detailed_experience.html?id=${encodeURIComponent(id)}`;
      }
    });
  });
}

// =============================
// Helpers
// =============================
//
function getPrimaryImageUrl(exp) {
  const imgs = exp?.image || []; // get exp.image array, or [] if missing
  const primary = imgs.find((i) => i.is_primary) || imgs[0]; // try to find the one marked primary
  return primary?.image_url || ''; // return its URL or empty string
}
//Format euro sign and round
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

