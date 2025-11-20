// Admin Dashboard JavaScript - STEP 2 (Clean Version)
// HTML stays in HTML, JavaScript just fills in data and handles interactions for admin.
// This file: checks admin auth, loads stats, manages experiences list, filters, approve/reject, simple routing.

let currentUser = null;        // Logged-in Supabase auth user
let currentAdmin = null;       // Matching record from my "users" table with role = admin
let experiences = [];          // All experiences pulled from Supabase
let currentFilter = 'pending'; // default view for experiences list
let filterTabsBound = false;   // so I only attach filter tab click handler once

// Run when page is fully loaded
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Admin dashboard loaded - Step 2');

  // Nav links: no inline handlers; attach click events here once
  document.querySelectorAll('.nav-links a[data-section]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const section = link.getAttribute('data-section'); // dashboard / experiences / businesses / users
      setHash(section); // update URL hash and trigger section display
    });
  });

  // Logout button event
  document.getElementById('logoutBtn').addEventListener('click', handleLogout);

  // Check if user is logged in + is admin
  await checkAuth();

  // Load top-level dashboard stats for cards (pending, totals etc.)
  await loadDashboardStats();

  // Hash routing (#dashboard | #experiences | #businesses | #users)
  window.addEventListener('hashchange', () => {
    const section = getSectionFromHash();
    showSection(section);
  });

  // initial section from hash (fallback to dashboard if none)
  const initial = getSectionFromHash() || 'dashboard';
  showSection(initial);
});

/* =========================
   Auth
   ========================= */

/**
 * Check if user is authenticated and an admin.
 * Uses Supabase auth + my users table for role checking.
 */
async function checkAuth() {
  try {
    // Get current logged in user from Supabase (standard SDK method)
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      // If no user, send them to login page
      window.location.href = '../auth/login.html';
      return;
    }

    currentUser = user;

    // Get user record from my "users" table
    const { data: userData } = await supabaseClient
      .from('users')
      .select('*')
      .eq('user_id', user.id)
      .single();

    // If user exists but role is not admin, block access and send them to their own dashboard
    if (userData && userData.role !== 'admin') {
      alert('Access denied. Admin account required.');
      window.location.href = `../dashboards/${userData.role}.html`;
      return;
    }

    // Save admin info and show it in UI
    currentAdmin = userData;
    displayUserInfo(userData);
  } catch (error) {
    console.error('Auth error:', error);
    window.location.href = '../auth/login.html';
  }
}

/* =========================
   UI helpers
   ========================= */

/**
 * Show logged in admin info at top of dashboard.
 */
function displayUserInfo(userData) {
  // minimal innerHTML here is fine; static little info block
  document.getElementById('adminInfo').innerHTML = `
    <p style="color: var(--text-secondary);">
      <strong>${userData.full_name}</strong> • ${userData.email} •
      <span style="color: var(--primary-color); font-weight: 600;">Admin</span>
    </p>
  `;
}

/**
 * Load the counts for dashboard: pending, experiences, businesses, users.
 * Uses Supabase count option (head: true) to just get totals.
 */
async function loadDashboardStats() {
  try {
    // Pending experiences
    const { count: pendingCount } = await supabaseClient
      .from('experiences')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    // Total experiences
    const { count: totalExp } = await supabaseClient
      .from('experiences')
      .select('*', { count: 'exact', head: true });

    // Total businesses
    const { count: totalBiz } = await supabaseClient
      .from('business')
      .select('*', { count: 'exact', head: true });

    // Total users
    const { count: totalUsers } = await supabaseClient
      .from('users')
      .select('*', { count: 'exact', head: true });

    // Update dashboard stat cards in the DOM
    document.getElementById('pendingCount').textContent = pendingCount || 0;
    document.getElementById('totalExperiences').textContent = totalExp || 0;
    document.getElementById('totalBusinesses').textContent = totalBiz || 0;
    document.getElementById('totalUsers').textContent = totalUsers || 0;
  } catch (error) {
    console.error('Error loading dashboard stats:', error);
  }
}

/* =========================
   Experiences (Step 2)
   ========================= */

/**
 * Load all experiences from Supabase and enrich them
 * with images, business info, and category name.
 */
async function loadExperiences() {
  const container = document.getElementById('experiencesList');
  // Show loading message while fetching
  container.innerHTML = '<p style="text-align:center;padding:2rem;">Loading...</p>';

  try {
    // Get all experiences ordered by newest first
    const { data, error } = await supabaseClient
      .from('experiences')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    experiences = data || [];

    // For each experience, pull related images, business and category in parallel
    for (const exp of experiences) {
      const [{ data: images }, { data: business }, { data: expCategory }] = await Promise.all([
        supabaseClient.from('image')
          .select('*')
          .eq('experience_id', exp.experience_id)
          .order('display_order'),
        supabaseClient.from('business')
          .select('business_name,business_email')
          .eq('business_id', exp.business_id)
          .single(),
        supabaseClient.from('experience_category')
          .select('category!inner(category_name)')
          .eq('experience_id', exp.experience_id)
          .single()
      ]);

      // Attach extra data onto experience object for easier rendering later
      exp.images = images || [];
      exp.primaryImage = images?.find(i => i.is_primary)?.image_url || images?.[0]?.image_url || null;
      exp.business = business || null;
      exp.categoryName = expCategory?.category?.category_name || 'Uncategorized';
    }

    // Render the experience cards
    displayExperiences();
  } catch (error) {
    console.error('Error loading experiences:', error);
    container.innerHTML = '<p class="alert alert-error">Error loading experiences</p>';
  }
}

/**
 * Display experiences into the admin experiences section
 * applying the current status filter.
 */
function displayExperiences() {
  const container = document.getElementById('experiencesList');

  // Filter list based on currentFilter (pending/approved/rejected/all)
  let list = experiences;
  if (currentFilter !== 'all') {
    list = experiences.filter(e => e.status === currentFilter);
  }

  // If no experiences to show for current filter
  if (list.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;padding:3rem;color:var(--text-secondary);">
        <p>No ${currentFilter === 'all' ? '' : currentFilter} experiences found.</p>
      </div>
    `;
    return;
  }

  const template = document.getElementById('experienceCardTemplate');
  const grid = document.createElement('div');
  grid.className = 'experiences-grid';

  // Build each card from the template
  list.forEach((exp) => {
    const frag = template.content.cloneNode(true);

    // Image background (or placeholder if no image)
    const imageEl = frag.querySelector('[data-field="image"]');
    imageEl.style.backgroundImage = `url('${exp.primaryImage || 'https://via.placeholder.com/800x500?text=No+Image'}')`;

    // Status badge styling + text
    const statusBadge = frag.querySelector('[data-field="statusBadge"]');
    statusBadge.className = `status-badge status-${exp.status}`;
    statusBadge.textContent = exp.status.charAt(0).toUpperCase() + exp.status.slice(1);

    // Title
    frag.querySelector('[data-field="title"]').textContent = exp.title || 'Untitled';

    // Meta = business name • county • category
    const meta = `${exp.business?.business_name || 'Unknown'} • ${exp.county || 'Location TBD'} • ${exp.categoryName}`;
    frag.querySelector('[data-field="meta"]').textContent = meta;

    // Description truncated to 140 chars
    const desc = exp.event_description || '';
    frag.querySelector('[data-field="description"]').textContent =
      desc.length > 140 ? `${desc.slice(0, 140)}…` : desc;

    // Price display logic (min-max or from / TBD)
    const price = (exp.min_price && exp.max_price)
      ? `€${exp.min_price} – €${exp.max_price}`
      : (exp.min_price ? `From €${exp.min_price}` : 'Price TBD');
    frag.querySelector('[data-field="price"]').textContent = price;

    // Approve/Reject button handlers
    frag.querySelector('.btn-approve').addEventListener('click', () => approveExperience(exp.experience_id));
    frag.querySelector('.btn-reject').addEventListener('click', () => rejectExperience(exp.experience_id));

    grid.appendChild(frag);
  });

  // Replace previous content with new grid
  container.innerHTML = '';
  container.appendChild(grid);
}

/* =========================
   Filters
   ========================= */

/**
 * Bind click handler for filter tabs only once.
 * Uses event delegation on the tabs container.
 */
function bindFilterTabsOnce() {
  if (filterTabsBound) return; // already bound

  const tabsContainer = document.querySelector('#experiencesSection .status-tabs');
  if (!tabsContainer) return;

  tabsContainer.addEventListener('click', (e) => {
    const btn = e.target.closest('.status-tab[data-filter]');
    if (!btn) return;
    const status = btn.getAttribute('data-filter');
    filterExperiences(status);
  });

  filterTabsBound = true;
}

/**
 * Change currentFilter and re-render experiences.
 */
function filterExperiences(status) {
  currentFilter = status;

  // Toggle active class on the tabs
  document.querySelectorAll('.status-tab').forEach(tab => {
    tab.classList.toggle('active', tab.getAttribute('data-filter') === status);
  });

  // Refresh the list with new filter
  displayExperiences();
}

/* =========================
   Approve / Reject
   ========================= */

/**
 * Approve an experience by updating its status in Supabase.
 */
async function approveExperience(experienceId) {
  if (!confirm('Approve this experience?')) return;

  try {
    const { error } = await supabaseClient
      .from('experiences')
      .update({ status: 'approved', updated_at: new Date().toISOString() })
      .eq('experience_id', experienceId);

    if (error) throw error;

    // Reload experiences and stats in parallel after approval
    await Promise.all([loadExperiences(), loadDashboardStats()]);
    showAlert('Experience approved!', 'success');
  } catch (error) {
    console.error('Error approving:', error);
    alert('Error approving experience');
  }
}

/**
 * Reject an experience, asking admin for a reason first.
 */
async function rejectExperience(experienceId) {
  const reason = prompt('Reason for rejection:'); // simple prompt for now
  if (!reason) return;

  try {
    const { error } = await supabaseClient
      .from('experiences')
      .update({ status: 'rejected', updated_at: new Date().toISOString() })
      .eq('experience_id', experienceId);

    if (error) throw error;

    // Reload list and stats
    await Promise.all([loadExperiences(), loadDashboardStats()]);
    showAlert('Experience rejected', 'success');
  } catch (error) {
    console.error('Error rejecting:', error);
    alert('Error rejecting experience');
  }
}

/* =========================
   Alerts
   ========================= */

/**
 * Simple floating alert in top-right corner.
 * Type is usually 'success' or 'error' for styling.
 */
function showAlert(message, type) {
  const el = document.createElement('div');
  el.className = `alert alert-${type}`;
  el.textContent = message;
  el.style.position = 'fixed';
  el.style.top = '20px';
  el.style.right = '20px';
  el.style.zIndex = '9999';
  document.body.appendChild(el);

  // Auto remove after 3 seconds
  setTimeout(() => el.remove(), 3000);
}

/* =========================
   Navigation
   ========================= */

/**
 * Show the correct dashboard section and highlight matching nav item.
 */
function showSection(section) {
  // Hide all sections
  document.querySelectorAll('.dashboard-section').forEach(sec => sec.classList.add('hidden'));

  // Reset nav link text color
  document.querySelectorAll('.nav-links a').forEach(link => link.style.color = '');

  // Show selected section
  const target = document.getElementById(`${section}Section`);
  target?.classList.remove('hidden');

  // Highlight active nav link
  const navId = `nav${section.charAt(0).toUpperCase() + section.slice(1)}`;
  const navLink = document.getElementById(navId);
  if (navLink) navLink.style.color = 'var(--primary-color)';

  // Section-specific setup
  if (section === 'experiences') {
    bindFilterTabsOnce();
    // Make sure pending tab is active first time if none selected
    if (!document.querySelector('.status-tab.active')) {
      document.querySelector('.status-tab[data-filter="pending"]')?.classList.add('active');
    }
    loadExperiences();
  }
}

/**
 * Update URL hash to match current section.
 */
function setHash(section) {
  const wanted = `#${section}`;
  if (location.hash !== wanted) {
    location.hash = wanted;
  } else {
    // hashchange won’t fire if setting to same value, so manually show section
    showSection(section);
  }
}

/**
 * Get section name from the URL hash, or null if invalid.
 */
function getSectionFromHash() {
  const h = (location.hash || '').replace('#', '').trim();
  if (['dashboard', 'experiences', 'businesses', 'users'].includes(h)) return h;
  return null;
}

/* =========================
   Logout
   ========================= */

/**
 * Log out the admin using Supabase auth and return to landing page.
 */
async function handleLogout() {
  try {
    await supabaseClient.auth.signOut();
    window.location.href = '../landing.html';
  } catch (error) {
    console.error('Logout error:', error);
    alert('Error logging out');
  }
}
