// Admin Dashboard JavaScript - STEP 2 (Clean Version)
// HTML stays in HTML, JavaScript just fills in data

let currentUser = null;
let currentAdmin = null;
let experiences = [];
let currentFilter = 'pending'; // default view for experiences
let filterTabsBound = false;

document.addEventListener('DOMContentLoaded', async () => {
  console.log('Admin dashboard loaded - Step 2');

  // Nav links: no inline handlers; attach once
  document.querySelectorAll('.nav-links a[data-section]').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const section = link.getAttribute('data-section');
      setHash(section);
    });
  });

  // Logout
  document.getElementById('logoutBtn').addEventListener('click', handleLogout);

  await checkAuth();
  await loadDashboardStats();

  // Hash routing (#dashboard | #experiences | #businesses | #users)
  window.addEventListener('hashchange', () => {
    const section = getSectionFromHash();
    showSection(section);
  });

  // initial section from hash (fallback to dashboard)
  const initial = getSectionFromHash() || 'dashboard';
  showSection(initial);
});

/* =========================
   Auth
   ========================= */
async function checkAuth() {
  try {
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      window.location.href = '../auth/login.html';
      return;
    }

    currentUser = user;

    const { data: userData } = await supabaseClient
      .from('users')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (userData && userData.role !== 'admin') {
      alert('Access denied. Admin account required.');
      window.location.href = `../dashboards/${userData.role}.html`;
      return;
    }

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
function displayUserInfo(userData) {
  // minimal innerHTML here is fine; it’s static chrome
  document.getElementById('adminInfo').innerHTML = `
    <p style="color: var(--text-secondary);">
      <strong>${userData.full_name}</strong> • ${userData.email} •
      <span style="color: var(--primary-color); font-weight: 600;">Admin</span>
    </p>
  `;
}

async function loadDashboardStats() {
  try {
    const { count: pendingCount } = await supabaseClient
      .from('experiences')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    const { count: totalExp } = await supabaseClient
      .from('experiences')
      .select('*', { count: 'exact', head: true });

    const { count: totalBiz } = await supabaseClient
      .from('business')
      .select('*', { count: 'exact', head: true });

    const { count: totalUsers } = await supabaseClient
      .from('users')
      .select('*', { count: 'exact', head: true });

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
async function loadExperiences() {
  const container = document.getElementById('experiencesList');
  container.innerHTML = '<p style="text-align:center;padding:2rem;">Loading...</p>';

  try {
    const { data, error } = await supabaseClient
      .from('experiences')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    experiences = data || [];

    // hydrate related data in parallel per experience
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

      exp.images = images || [];
      exp.primaryImage = images?.find(i => i.is_primary)?.image_url || images?.[0]?.image_url || null;
      exp.business = business || null;
      exp.categoryName = expCategory?.category?.category_name || 'Uncategorized';
    }

    displayExperiences();
  } catch (error) {
    console.error('Error loading experiences:', error);
    container.innerHTML = '<p class="alert alert-error">Error loading experiences</p>';
  }
}

function displayExperiences() {
  const container = document.getElementById('experiencesList');

  // Filter
  let list = experiences;
  if (currentFilter !== 'all') {
    list = experiences.filter(e => e.status === currentFilter);
  }

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

  list.forEach((exp) => {
    const frag = template.content.cloneNode(true);

    // Image
    const imageEl = frag.querySelector('[data-field="image"]');
    imageEl.style.backgroundImage = `url('${exp.primaryImage || 'https://via.placeholder.com/800x500?text=No+Image'}')`;

    // Status badge
    const statusBadge = frag.querySelector('[data-field="statusBadge"]');
    statusBadge.className = `status-badge status-${exp.status}`;
    statusBadge.textContent = exp.status.charAt(0).toUpperCase() + exp.status.slice(1);

    // Title
    frag.querySelector('[data-field="title"]').textContent = exp.title || 'Untitled';

    // Meta (business • county • category)
    const meta = `${exp.business?.business_name || 'Unknown'} • ${exp.county || 'Location TBD'} • ${exp.categoryName}`;
    frag.querySelector('[data-field="meta"]').textContent = meta;

    // Description (truncate)
    const desc = exp.event_description || '';
    frag.querySelector('[data-field="description"]').textContent =
      desc.length > 140 ? `${desc.slice(0, 140)}…` : desc;

    // Price
    const price = (exp.min_price && exp.max_price)
      ? `€${exp.min_price} – €${exp.max_price}`
      : (exp.min_price ? `From €${exp.min_price}` : 'Price TBD');
    frag.querySelector('[data-field="price"]').textContent = price;

    // Actions
    frag.querySelector('.btn-approve').addEventListener('click', () => approveExperience(exp.experience_id));
    frag.querySelector('.btn-reject').addEventListener('click', () => rejectExperience(exp.experience_id));

    grid.appendChild(frag);
  });

  container.innerHTML = '';
  container.appendChild(grid);
}

/* =========================
   Filters
   ========================= */
function bindFilterTabsOnce() {
  if (filterTabsBound) return;
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

function filterExperiences(status) {
  currentFilter = status;

  document.querySelectorAll('.status-tab').forEach(tab => {
    tab.classList.toggle('active', tab.getAttribute('data-filter') === status);
  });

  displayExperiences();
}

/* =========================
   Approve / Reject
   ========================= */
async function approveExperience(experienceId) {
  if (!confirm('Approve this experience?')) return;

  try {
    const { error } = await supabaseClient
      .from('experiences')
      .update({ status: 'approved', updated_at: new Date().toISOString() })
      .eq('experience_id', experienceId);

    if (error) throw error;

    await Promise.all([loadExperiences(), loadDashboardStats()]);
    showAlert('Experience approved!', 'success');
  } catch (error) {
    console.error('Error approving:', error);
    alert('Error approving experience');
  }
}

async function rejectExperience(experienceId) {
  const reason = prompt('Reason for rejection:');
  if (!reason) return;

  try {
    const { error } = await supabaseClient
      .from('experiences')
      .update({ status: 'rejected', updated_at: new Date().toISOString() })
      .eq('experience_id', experienceId);

    if (error) throw error;

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
function showAlert(message, type) {
  const el = document.createElement('div');
  el.className = `alert alert-${type}`;
  el.textContent = message;
  el.style.position = 'fixed';
  el.style.top = '20px';
  el.style.right = '20px';
  el.style.zIndex = '9999';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

/* =========================
   Navigation
   ========================= */
function showSection(section) {
  // hide all
  document.querySelectorAll('.dashboard-section').forEach(sec => sec.classList.add('hidden'));

  // reset nav link color
  document.querySelectorAll('.nav-links a').forEach(link => link.style.color = '');

  // show selected
  const target = document.getElementById(`${section}Section`);
  target?.classList.remove('hidden');

  // highlight nav
  const navId = `nav${section.charAt(0).toUpperCase() + section.slice(1)}`;
  const navLink = document.getElementById(navId);
  if (navLink) navLink.style.color = 'var(--primary-color)';

  // section-specific bootstrapping
  if (section === 'experiences') {
    bindFilterTabsOnce();
    // default active tab state on first entry
    if (!document.querySelector('.status-tab.active')) {
      document.querySelector('.status-tab[data-filter="pending"]')?.classList.add('active');
    }
    loadExperiences();
  }
}

// keep URL in sync with state
function setHash(section) {
  const wanted = `#${section}`;
  if (location.hash !== wanted) {
    location.hash = wanted;
  } else {
    // hashchange won’t fire if it’s the same; call directly
    showSection(section);
  }
}
function getSectionFromHash() {
  const h = (location.hash || '').replace('#', '').trim();
  if (['dashboard', 'experiences', 'businesses', 'users'].includes(h)) return h;
  return null;
}

/* =========================
   Logout
   ========================= */
async function handleLogout() {
  try {
    await supabaseClient.auth.signOut();
    window.location.href = '../landing.html';
  } catch (error) {
    console.error('Logout error:', error);
    alert('Error logging out');
  }
}

