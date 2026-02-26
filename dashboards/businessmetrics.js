// Iteration 4: Business Metrics

let currentBusiness = null;
let currentDays = 30;          // default range
let currentExperienceId = '';  // empty = all experiences

// Chart state
let activityChart = null;      // holds the Chart.js instance
let selectedMetric = 'all';    // 'all'  'view'  'save'  'booking_click'
let lastDailySeries = null;    // last daily data so we can re-draw without re-querying
let lastKpis = { views: 0, saves: 0, clicks: 0 };
let referrerChart = null;

document.addEventListener('DOMContentLoaded', async () => {
  console.log('businessmetrics.js loaded');


  // Sign-out button in the header
  document.getElementById('logoutBtn')?.addEventListener('click', async () => {
    await supabaseClient.auth.signOut();
    window.location.href = '../landing.html';
  });

  // Export report as it opens print dialog, user can here user can save as PDF
  document.getElementById('btnExportReport')?.addEventListener('click', () => {
    window.print();
  });


  // 1) Load business and display error if no business profile found
  currentBusiness = await getCurrentBusiness();
  if (!currentBusiness) {
    alert('No business profile found for this account.');
    window.location.href = 'business.html';
    return;
  }

  // 2) Then Load experiences for this business
  const experiences = await loadBusinessExperiences(currentBusiness.business_id);

  // 3) Populate UI controls
  populateExperienceDropdown(experiences);
  populateQuickPicks(experiences);

  // 4) Bind UI events so clicks register
  bindRangeTabs();
  bindExperienceSelect();

  // Chart filter buttons (All / Views / Saves / Booking clicks)
  wireActivityToolbar();

  // 5) Initial KPI load
  // refreshKpis also refreshes the chart now
  await refreshKpis();

  // 6) Referrer data refresh
  await refreshTopReferrers();
});

// ---------------------------
// Business lookup helpers
// ---------------------------

/**
 * Mapping Supabase auth user to public.users.user_id. and matching it to email
 */
async function getPublicUserId() {
  const { data: { user }, error } = await supabaseClient.auth.getUser();
  if (error) console.warn('auth.getUser warning:', error.message);

  if (!user) return null;

  const authEmail = (user.email || '').trim().toLowerCase();
  if (!authEmail) return null;

  const { data, error: usersErr } = await supabaseClient
    .from('users')
    .select('user_id, role')
    .ilike('email', authEmail)
    .single();

  if (usersErr) {
    console.warn('public.users lookup by email failed:', usersErr.message);
    return null;
  }

  return data?.user_id || null;
}

/**
 * Load the business record for this logged-in business user.
 */
async function getCurrentBusiness() {
  const publicUserId = await getPublicUserId();
  if (!publicUserId) return null;

  const { data, error } = await supabaseClient
    .from('business')
    .select('business_id, business_name')
    .eq('user_id', publicUserId)
    .single();

  if (error) {
    console.warn('Business lookup failed:', error.message);
    return null;
  }

  return data;
}

// ---------------------------
// Load experiences
// ---------------------------

async function loadBusinessExperiences(businessId) {
  const { data, error } = await supabaseClient
    .from('experiences')
    .select('experience_id, title, created_at')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

// ---------------------------
// Populate UI
// ---------------------------
//Experience Dropdown

function populateExperienceDropdown(experiences) {
  const select = document.getElementById('experienceSelect');
  if (!select) return;

  select.innerHTML = `<option value="">All experiences</option>`;

  experiences.forEach((exp) => {
    const opt = document.createElement('option');
    opt.value = exp.experience_id;
    opt.textContent = exp.title || 'Untitled experience';
    select.appendChild(opt);
  });
}
// Quick picks options, populating 4 experiences
function populateQuickPicks(experiences) {
  const wrap = document.getElementById('quickPicks');
  if (!wrap) return;

  const picks = experiences.slice(0, 4);

  if (!picks.length) {
    wrap.innerHTML = `<p class="muted">No experiences found yet.</p>`;
    return;
  }
  //Display of Quick Picks on web app embedded HTML
  wrap.innerHTML = `
  <h3 class="quick-picks-title" style="margin-top:16px;">Quick picks</h3>
    <div class="quick-pick-list">
      ${picks.map((e) => `
        <button type="button" class="quick-pick" data-exp="${e.experience_id}">
          <span class="quick-pick-title">${escapeHtml(e.title || 'Untitled experience')}</span>
          <span class="quick-pick-sub muted">Last 30 days</span>
        </button>
      `).join('')}
    </div>
  `;


  wrap.querySelectorAll('[data-exp]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const expId = btn.getAttribute('data-exp') || '';
      setSelectedExperience(expId);
      await refreshKpis();
    });
  });
}
//Change UI of experience dropdown when an experience is selected
function bindExperienceSelect() {
  const select = document.getElementById('experienceSelect');
  if (!select) return;

  select.addEventListener('change', async () => {
    setSelectedExperience(select.value || '');
    await refreshKpis();
  });
}
// Change UI based on day range chips
function bindRangeTabs() {
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', async () => {
      document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      currentDays = Number(btn.getAttribute('data-days') || 30);
      await refreshKpis();
    });
  });
}

/**
 * Store selected experience and update the label text.
 */
function setSelectedExperience(expId) {
  currentExperienceId = expId;

  const select = document.getElementById('experienceSelect');
  if (select) select.value = expId;

  const label = document.getElementById('snapshotLabel');
  if (label) {
    const expText = expId ? 'Selected: 1 experience' : 'Selected: All experiences';
    label.textContent = `${expText} • Last ${currentDays} days`;
  }
}

// ---------------------------
// KPI Queries
// ---------------------------
//ISO formatting of dates make t easier when selecting date range
function sinceISO(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

/**
 * Refresh the 3 top KPI numbers.
 * After KPI numbers load, we also refresh the chart.
 */
async function refreshKpis() {
  if (!currentBusiness) return;

  setText('kpiViews', '—');
  setText('kpiSaves', '—');
  setText('kpiClicks', '—');

  const start = sinceISO(currentDays);
  const businessId = currentBusiness.business_id;

  const [views, saves, clicks] = await Promise.all([
    countEvents({ businessId, start, eventType: 'view', experienceId: currentExperienceId }),
    countSaves({ businessId, start, experienceId: currentExperienceId }),
    countEvents({ businessId, start, eventType: 'booking_click', experienceId: currentExperienceId }),
  ]);

  setText('kpiViews', formatNumber(views));
  setText('kpiSaves', formatNumber(saves));
  setText('kpiClicks', formatNumber(clicks));

  // Save KPI totals so other UI blocks can reuse them (funnels etc.)
  lastKpis = { views, saves, clicks };

  // Funnel breakdown uses these totals
  renderFunnel(lastKpis);

  // Ensure the label text stays correct
  setSelectedExperience(currentExperienceId);

  // Keep chart in sync with filters
  await refreshDailyActivity();
}


/**
 * Count events using your event_metric_v view (fast and simple).
 */
async function countEvents({ businessId, start, eventType, experienceId }) {
  let q = supabaseClient
    .from('event_metric_v')
    .select('*', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .eq('event_type', eventType)
    .gte('created_at', start);

  if (experienceId) q = q.eq('experience_id', experienceId);

  const { count, error } = await q;
  if (error) {
    console.warn('countEvents error:', error.message);
    return 0;
  }

  return count || 0;
}

/**
 * Count saves using your favorite_v view.
 */
async function countSaves({ businessId, start, experienceId }) {
  let q = supabaseClient
    .from('favorite_v')
    .select('*', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .gte('created_at', start);

  if (experienceId) q = q.eq('experience_id', experienceId);

  const { count, error } = await q;
  if (error) {
    console.warn('countSaves error:', error.message);
    return 0;
  }

  return count || 0;
}

// ---------------------------
// Daily Activity Chart
// ---------------------------

/**
 * The toolbar controls which line(s) to show.
 * If the buttons do not exist yet in HTML, this function safely does nothing.
 */
function wireActivityToolbar() {
  const buttons = document.querySelectorAll('[data-metric]');
  if (!buttons.length) return;

  buttons.forEach((btn) => {
    btn.addEventListener('click', () => {
      selectedMetric = btn.getAttribute('data-metric') || 'all';
      setActiveChip(selectedMetric);

      // If we already have daily data, redraw the chart instantly
      if (lastDailySeries) {
        renderActivityChart(lastDailySeries);
        return;
      }

      // If not, fetch and render
      refreshDailyActivity();
    });
  });

  // Default highlight
  setActiveChip(selectedMetric);
}

/**
 * Highlights selected chip as is active and keeps rest as default
 */
function setActiveChip(metric) {
  document.querySelectorAll('[data-metric]').forEach((btn) => {
    const isActive = btn.getAttribute('data-metric') === metric;
    btn.classList.toggle('is-active', isActive);
  });
}

/**
 * DOUGHNUT CHART
 */
async function refreshDailyActivity() {
  if (!currentBusiness) return;

  // My views use DATE, so we filter using YYYY-MM-DD
  const startDateStr = sinceISO(currentDays).slice(0, 10);
  const endDateStr = new Date().toISOString().slice(0, 10);

  // Full list of days so missing days still show as zero
  const days = buildDayList(startDateStr, endDateStr);

  // Pulls both datasets at the same time
  const [eventsDaily, savesDaily] = await Promise.all([
    loadEventsDaily({
      businessId: currentBusiness.business_id,
      startDateStr,
      experienceId: currentExperienceId
    }),
    loadSavesDaily({
      businessId: currentBusiness.business_id,
      startDateStr,
      experienceId: currentExperienceId
    })
  ]);

  // Converts rows into maps (day -> total)
  const viewsMap = new Map();
  const clicksMap = new Map();
  const savesMap = new Map();

  // metrics_events_daily_v gives: day, event_type, total
  (eventsDaily || []).forEach((r) => {
    const day = r.day;
    const total = Number(r.total || 0);

    if (r.event_type === 'view') {
      viewsMap.set(day, (viewsMap.get(day) || 0) + total);
    }

    if (r.event_type === 'booking_click') {
      clicksMap.set(day, (clicksMap.get(day) || 0) + total);
    }
  });

  // metrics_saves_daily_v gives: day, saves
  (savesDaily || []).forEach((r) => {
    const day = r.day;
    const total = Number(r.saves || 0);
    savesMap.set(day, (savesMap.get(day) || 0) + total);
  });

  // Builds arrays aligned with "days"
  const series = {
    days,
    views: days.map((d) => viewsMap.get(d) || 0),
    saves: days.map((d) => savesMap.get(d) || 0),
    bookingClicks: days.map((d) => clicksMap.get(d) || 0),
  };

  // Cache series so switching tabs is instant
  lastDailySeries = series;

  // Draw the chart
  renderActivityChart(series);
}
//Chat GPT Pie Chart Helper
async function refreshTopReferrers() {
  if (!currentBusiness) return;

  const canvas = document.getElementById('referrerChart');
  if (!canvas) return;

  if (!window.Chart) {
    console.warn('Chart.js not found. Add the Chart.js CDN script before businessmetrics.js.');
    return;
  }

  const start = sinceISO(currentDays);
  const businessId = currentBusiness.business_id;

  // Pull only what we need and count sources in Supabase
  let q = supabaseClient
    .from('event_metric_v')
    .select('source, created_at')
    .eq('business_id', businessId)
    .gte('created_at', start);

  q = q.eq('event_type', 'view');

  if (currentExperienceId) q = q.eq('experience_id', currentExperienceId);

  const { data, error } = await q;
  if (error) {
    console.warn('refreshTopReferrers error:', error.message);
    return;
  }

  const rows = data || [];

  // Count each source
  const counts = new Map();
  rows.forEach((r) => {
    const src = String(r.source || 'direct').toLowerCase();
    counts.set(src, (counts.get(src) || 0) + 1);
  });

  // If no data, show an empty chart message in console and clear chart
  if (!counts.size) {
    if (referrerChart) {
      referrerChart.destroy();
      referrerChart = null;
    }
    return;
  }

  // Sort from biggest to smallest, take top 6, group rest as "other"
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);

  const top = sorted.slice(0, 6);
  const rest = sorted.slice(6);

  const otherTotal = rest.reduce((sum, [, v]) => sum + v, 0);
  if (otherTotal > 0) top.push(['other', otherTotal]);

  const labels = top.map(([k]) => prettySource(k));
  const values = top.map(([, v]) => v);

  // Palette: primary green like experienceme other colours blend with its for each category
  const colors = [
    '#16a34a', // green
    '#111827', // black
    '#6b7280', // grey
    '#94a3b8', // light slate
    '#334155', // slate
    '#0f172a', // deep
    '#9ca3af'  // other
  ].slice(0, labels.length);

  const ctx = canvas.getContext('2d');

  if (!referrerChart) {
    referrerChart = new Chart(ctx, {
      type: 'doughnut',
      options: {
        cutout: '55%'},
      data: {
        labels,
        datasets: [
          {
            data: values,
            backgroundColor: colors,
            borderWidth: 1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right' },
          tooltip: { enabled: true }
        }
      }
    });
    return;
  }

  // Update existing chart
  referrerChart.data.labels = labels;
  referrerChart.data.datasets[0].data = values;
  referrerChart.data.datasets[0].backgroundColor = colors;
  referrerChart.update();
}
// Logs as finder search share etc, working for finder and direct else not wired
function prettySource(src) {
  const s = String(src || '').toLowerCase();

  if (s === 'direct') return 'Direct';
  if (s === 'finder') return 'Finder';
  if (s === 'search') return 'Search';
  if (s === 'share') return 'Share';
  if (s === 'experiences') return 'Explore page';

  // fallback: Title Case
  return s.charAt(0).toUpperCase() + s.slice(1);
}
/**
 * Draws a line chart using Chart.js.
 * If the user selects "Views", I show one line.
 * If they select "All", I show all 3 lines.
 */
function renderActivityChart(series) {
  const canvas = document.getElementById('activityChart');

  // If the canvas isn't on the page, just stop
  if (!canvas) return;

  // If Chart.js wasn't loaded, explain it in console
  if (!window.Chart) {
    console.warn('Chart.js not found. Add the Chart.js CDN script before businessmetrics.js.');
    return;
  }

  const labels = series.days;

  // Decide what lines to show and forceS ExperienceMe colours
const GREEN = '#16a34a';
const BLACK = '#111827';
const GREY  = '#9ca3af';

function makeLine(label, data, color) {
  return {
    label,
    data,
    tension: 0.35,
    pointRadius: 2,
    borderWidth: 3,
    borderColor: color,
    backgroundColor: color,
    fill: false
  };
}

const datasets = [];

// Single metric selected = that metric is green
if (selectedMetric === 'view') {
  datasets.push(makeLine('Views', series.views, GREEN));
}

if (selectedMetric === 'save') {
  datasets.push(makeLine('Saves', series.saves, GREEN));
}

if (selectedMetric === 'booking_click') {
  datasets.push(makeLine('Booking clicks', series.bookingClicks, GREEN));
}

// All selected = green + grey + black
if (selectedMetric === 'all') {
  datasets.push(makeLine('Views', series.views, GREEN));
  datasets.push(makeLine('Saves', series.saves, GREY));
  datasets.push(makeLine('Booking clicks', series.bookingClicks, BLACK));
}

  // Create chart once, update afterwards
  if (!activityChart) {
    activityChart = new Chart(canvas.getContext('2d'), {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: true },
          tooltip: { mode: 'index', intersect: false }
        },
        interaction: { mode: 'index', intersect: false },
        scales: {
          y: { beginAtZero: true }
        }
      }
    });
    return;
  }

  activityChart.data.labels = labels;
  activityChart.data.datasets = datasets;
  activityChart.update();
}

/**
 * Build a list of dates from start -> end.
 * We use UTC to avoid timezone weirdness.
 */
function buildDayList(startDateStr, endDateStr) {
  const out = [];
  const start = new Date(startDateStr + 'T00:00:00Z');
  const end = new Date(endDateStr + 'T00:00:00Z');

  const d = new Date(start);
  while (d <= end) {
    out.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/**
 * Pull daily events from metrics_events_daily_v.
 * This view already groups by day so the data is small and fast.
 */
async function loadEventsDaily({ businessId, startDateStr, experienceId }) {
  let q = supabaseClient
    .from('metrics_events_daily_v')
    .select('day, event_type, total, experience_id')
    .eq('business_id', businessId)
    .gte('day', startDateStr)
    .in('event_type', ['view', 'booking_click']);

  if (experienceId) q = q.eq('experience_id', experienceId);

  const { data, error } = await q;
  if (error) {
    console.warn('loadEventsDaily error:', error.message);
    return [];
  }

  return data || [];
}

/**
 * Pull daily saves from metrics_saves_daily_v.
 */
async function loadSavesDaily({ businessId, startDateStr, experienceId }) {
  let q = supabaseClient
    .from('metrics_saves_daily_v')
    .select('day, saves, experience_id')
    .eq('business_id', businessId)
    .gte('day', startDateStr);

  if (experienceId) q = q.eq('experience_id', experienceId);

  const { data, error } = await q;
  if (error) {
    console.warn('loadSavesDaily error:', error.message);
    return [];
  }

  return data || [];
}

// ---------------------------
// Small DOM helpers
// ---------------------------

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function formatNumber(n) {
  return Number(n || 0).toLocaleString();
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

//BAR CHART FUNNEL SAVES TO BOOKINGS VIEWS TO BOOKINGS AND VIEWS TO SAVES
function renderFunnel({ views, saves, clicks }) {
  const box = document.getElementById('funnelBreakdown');
  if (!box) return;

  const v = Number(views || 0);
  const s = Number(saves || 0);
  const c = Number(clicks || 0);

  // Conversion rates
  const viewsToSaves  = v > 0 ? (s / v) * 100 : 0;
  const savesToClicks = s > 0 ? (c / s) * 100 : 0;
  const viewsToClicks = v > 0 ? (c / v) * 100 : 0;

  box.innerHTML = `
    ${funnelRow('Views to Saves', clampPercent(viewsToSaves))}
    ${funnelRow('Saves to Booking clicks', clampPercent(savesToClicks))}
    ${funnelRow('Views to Booking clicks', clampPercent(viewsToClicks))}
  `;
}
//Rows the chart
function funnelRow(label, percent) {
  const p = Number(percent || 0);
  return `
    <div class="funnel-row">
      <div class="funnel-label">${escapeHtml(label)}</div>
      <div class="funnel-bar">
        <div class="funnel-fill" style="width:${p.toFixed(1)}%"></div>
      </div>
      <div class="funnel-value">${p.toFixed(1)}%</div>
    </div>
  `;
}
// Doesn't go above 100% and never below 0%
function clampPercent(n) {
  const x = Number(n || 0);
  if (x < 0) return 0;
  if (x > 100) return 100;
  return x;
}
