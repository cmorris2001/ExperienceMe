/**
 * detailed_experience.js
 */

// ---------------------------
// Page state
// ---------------------------
// Stores the logged-in user, the current experience ID from the URL,
// and whether this experience is saved as a favourite.
let authUser = null;
let currentExperienceId = null;
let isFavorited = false;

// ---------------------------
// DOM Ready
// ---------------------------
document.addEventListener('DOMContentLoaded', async () => {
  console.log('✅ detailed_experience.js loaded');

  // Update nav based on login state. Iteration 5 added await
  await setNavState(authUser);

  // Wire up buttons/links that always exist on this page
  bindStaticEvents();

  // Read experience id from the URL (e.g. detailed_experience.html?id=123)
  const experienceId = new URLSearchParams(window.location.search).get('id');

  // If no ID, show an error message and stop
  if (!experienceId) {
    showError('Missing experience id in URL.');
    return;
  }

  // Load and render the experience data
  currentExperienceId = experienceId;
  await loadAndRenderExperience(experienceId);

  // Iteration 4: log a "view" once per 30 minutes
  await logViewOnce(experienceId);
});


// ---------------------------
// Nav state (guest vs user vs business) Iteration 5.
// ---------------------------
async function setNavState(user) {
  const navGuest = document.getElementById('navGuest');
  const navUser = document.getElementById('navUser');
  const navBusiness = document.getElementById('navBusiness');

  // default
  if (navGuest) navGuest.style.display = 'flex';
  if (navUser) navUser.style.display = 'none';
  if (navBusiness) navBusiness.style.display = 'none';

  if (!user) return;

  try {
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
    console.warn('setNavState error:', e);
    // fallback: treat as normal logged in uservisitor
    if (navGuest) navGuest.style.display = 'none';
    if (navUser) navUser.style.display = 'flex';
    if (navBusiness) navBusiness.style.display = 'none';
  }
}

// ---------------------------
// Bind events that do not depend on data
// ---------------------------
// "Static" = buttons that exist regardless of which experience is loaded.
function bindStaticEvents() {
  const btnSignOut = document.getElementById('btnSignOut');
  const btnSignOutBusiness = document.getElementById('btnSignOutBusiness'); // Iteration 5 sign out button wire up
  const btnShare   = document.getElementById('btnShare');
  const btnSave    = document.getElementById('btnSave');

  // Sign out (works for both user + business nav)
  const signOutHandler = async () => {
    try {
      await supabaseClient.auth.signOut();
      window.location.href = 'landing.html';
    } catch {
      alert('Could not sign out. Please try again.');
    }
  };

  btnSignOut?.addEventListener('click', signOutHandler);
  btnSignOutBusiness?.addEventListener('click', signOutHandler);

  // Share link (copy URL to clipboard)
  btnShare?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      alert('Link copied!');
    } catch {
      alert('Could not copy link. You can copy from the address bar.');
    }
  });

  // Save / favourite
  btnSave?.addEventListener('click', async () => {
    if (!authUser) {
      window.location.href = 'auth/login.html';
      return;
    }
    if (!currentExperienceId) return;

    await toggleFavorite(currentExperienceId);
    updateSaveButtonUI();
  });
}

// ---------------------------
// Load experience and favourite state, then render
// ---------------------------
// 1) Hide any previous error
// 2) Load the experience from Supabase
// 3) If logged in, load favourite status + update save button
// 4) Render the experience details to the page
async function loadAndRenderExperience(experienceId) {
  try {
    hideError();

    const { data: exp, error } = await supabaseClient
      .from('experiences')
      .select(`
        experience_id,
        title,
        short_description,
        event_description,
        county,
        duration_minutes,
        min_price,
        max_price,
        price_tier,
        status,
        is_published,
        booking_url,
        what_you_do,
        whats_included,
        business:business_id (
          business_name,
          website_url,
          location_text,
          business_description,
          business_image_url
        ),
        image ( image_url, is_primary, display_order )
      `)
      .eq('experience_id', experienceId)
      .eq('status', 'approved')
      .eq('is_published', true)
      .single();

    // If Supabase returns an error or no record, show a friendly message
    if (error || !exp) {
      console.error('Error loading experience:', error);
      showError('Could not load this experience.');
      return;
    }

    // If logged in, load favourite state for this experience
    if (authUser) {
      await loadFavoriteState(experienceId);
    }

    // Update Save button UI (e.g. "Save" vs "Saved")
    updateSaveButtonUI();

    // Render all detail sections
    renderDetail(exp);

  } catch (err) {
    console.error('Error in loadAndRenderExperience:', err);
    showError('Something went wrong.');
  }
}


// ---------------------------
// Render UI
// ---------------------------
// Takes the experience record from Supabase and fills the HTML elements on the page.
function renderDetail(exp) {
  // Grab elements directly from the DOM (Option B style)
  const crumbLocation   = document.getElementById('crumbLocation');
  const expTitle        = document.getElementById('expTitle');
  const expMeta         = document.getElementById('expMeta');
  const expDescription  = document.getElementById('expDescription');

  const mainImage       = document.getElementById('mainImage');
  const thumbsRow       = document.getElementById('thumbsRow');

  const hostLogoWrap    = document.getElementById('hostLogoWrap');
  const hostLogo        = document.getElementById('hostLogo');
  const hostName        = document.getElementById('hostName');
  const hostLocation    = document.getElementById('hostLocation');
  const hostDescription = document.getElementById('hostDescription');

  const priceFrom       = document.getElementById('priceFrom');
  const priceTier       = document.getElementById('priceTier');
  const priceRange      = document.getElementById('priceRange');
  const badgePill       = document.getElementById('badgePill');

  const btnBusinessSite = document.getElementById('btnBusinessSite');

  const whatYouDoList      = document.getElementById('whatYouDoList');
  const whatsIncludedList  = document.getElementById('whatsIncludedList');

  // ---------------------------
  // Title + breadcrumb
  // ---------------------------
  setText(expTitle, exp.title || 'Experience');
  setText(crumbLocation, exp.county || 'Ireland');

  // ---------------------------
  // Description (prefer full event_description)
  // ---------------------------
  const description =
    (exp.event_description && exp.event_description.trim()) ||
    (exp.short_description && exp.short_description.trim()) ||
    'No description provided yet.';
  setText(expDescription, description);

  // ---------------------------
  // Meta line (county + duration)
  // ---------------------------
  const durationText = exp.duration_minutes ? `${exp.duration_minutes} mins` : 'Duration TBD';
  const metaParts = [exp.county || 'Ireland', durationText].filter(Boolean);
  setText(expMeta, metaParts.join(' • '));

  // ---------------------------
  // Host (business) block
  // ---------------------------
  const biz = exp.business || {};
  setText(hostName, biz.business_name || 'Business');
  setText(hostLocation, biz.location_text || (exp.county ? `${exp.county}, Ireland` : 'Ireland'));
  setText(hostDescription, (biz.business_description || '').trim() || 'Business description coming soon.');

  // Show/hide host logo
  if (biz.business_image_url && hostLogoWrap && hostLogo) {
    hostLogo.src = biz.business_image_url;
    hostLogoWrap.style.display = 'block';
  } else if (hostLogoWrap) {
    hostLogoWrap.style.display = 'none';
  }

  // ---------------------------
  // Pricing
  // ---------------------------
  setText(priceFrom, exp.min_price != null ? `€${toMoney(exp.min_price)}` : '€—');
  setText(priceTier, exp.price_tier || '—');

  const range =
    (exp.min_price != null && exp.max_price != null)
      ? `€${toMoney(exp.min_price)} - €${toMoney(exp.max_price)}`
      : (exp.min_price != null)
        ? `From €${toMoney(exp.min_price)}`
        : '—';
  setText(priceRange, range);

  // Small badge pill (duration or generic info)
  setText(badgePill, exp.duration_minutes ? `${exp.duration_minutes} mins` : 'Info');

  // ---------------------------
  // Booking URL (prefer booking_url, fall back to business website_url)
  // ---------------------------
  const finalUrl = exp.booking_url || biz.website_url || '';

  if (btnBusinessSite) {
    if (finalUrl) {
      // If this is an <a>, this sets where it goes. We'll still preventDefault and log first.
      btnBusinessSite.href = finalUrl;
      btnBusinessSite.style.pointerEvents = 'auto';
      btnBusinessSite.style.opacity = '1';
    } else {
      btnBusinessSite.href = '#';
      btnBusinessSite.style.pointerEvents = 'none';
      btnBusinessSite.style.opacity = '0.6';
    }

    // Iteration 4: Track booking clicks
    wireBookingClickTracking(exp.experience_id, finalUrl);
  }

  // ---------------------------
  // Images + thumbnails
  // ---------------------------
  const images = Array.isArray(exp.image) ? exp.image : [];

  // Sort by display_order (lowest first); items with no display_order go last
  const sorted = images
    .slice()
    .sort((a, b) => (a.display_order ?? 999) - (b.display_order ?? 999));

  // Choose primary image, else first image, else placeholder
  const primary = sorted.find(i => i.is_primary) || sorted[0];
  const mainUrl =
    primary?.image_url ||
    `https://via.placeholder.com/1200x800?text=${encodeURIComponent(exp.title || 'Experience')}`;

  if (mainImage) mainImage.src = mainUrl;

  // Render thumbnail row
  renderThumbnails(sorted);

  // ---------------------------
  // Lists (what you'll do / what's included)
  // ---------------------------
  renderList(whatYouDoList, splitToItems(exp.what_you_do));
  renderList(whatsIncludedList, splitToItems(exp.whats_included));
}

// ---------------------------
// Thumbnails
// ---------------------------
// Renders up to 4 thumbnails into the thumbs row.
// Clicking a thumbnail swaps the main image.
function renderThumbnails(images) {
  const thumbsRow = document.getElementById('thumbsRow');
  const mainImage = document.getElementById('mainImage');
  if (!thumbsRow) return;

  if (!images || !images.length) {
    thumbsRow.innerHTML = '';
    return;
  }

  const thumbs = images.slice(0, 4);

  // Clear then build thumbnails using DOM methods
  thumbsRow.innerHTML = '';

  thumbs.forEach((img) => {
    const url = img.image_url || '';
    const thumb = document.createElement('div');
    thumb.className = 'detail-thumb';
    thumb.dataset.url = url;

    const imageEl = document.createElement('img');
    imageEl.src = url;
    imageEl.alt = 'Thumbnail';

    thumb.appendChild(imageEl);
    thumbsRow.appendChild(thumb);
  });

  // Click handler (swap main image)
  thumbsRow.querySelectorAll('.detail-thumb').forEach((thumb) => {
    thumb.addEventListener('click', () => {
      const url = thumb.dataset.url || '';
      if (mainImage && url) mainImage.src = url;
    });
  });
}


// ---------------------------
// Favourites
// ---------------------------
async function loadFavoriteState(experienceId) {
  try {
    const { data, error } = await supabaseClient
      .from('favorite')
      .select('favorite_id')
      .eq('user_id', authUser.id)
      .eq('experience_id', experienceId)
      .maybeSingle();

    if (error) throw error;
    isFavorited = !!data;
  } catch (err) {
    console.error('Error loading favourite state:', err);
    isFavorited = false;
  }
}

async function toggleFavorite(experienceId) {
  if (!authUser) return;

  try {
    if (isFavorited) {
      const { error } = await supabaseClient
        .from('favorite')
        .delete()
        .eq('user_id', authUser.id)
        .eq('experience_id', experienceId);

      if (error) throw error;
      isFavorited = false;
    } else {
      const { error } = await supabaseClient
        .from('favorite')
        .insert({ user_id: authUser.id, experience_id: experienceId });

      if (error) throw error;
      isFavorited = true;
    }
  } catch (err) {
    console.error('Error toggling favourite:', err);
    alert('Error updating favourites.');
  }
}

// ---------------------------
// Update the Save / Favourite button based on login + favourite state
// ---------------------------
function updateSaveButtonUI() {
  const btnSave = document.getElementById('btnSave');
  if (!btnSave) return;

  // If user is not logged in, show disabled-style save button
  if (!authUser) {
    btnSave.textContent = '♡ Save';
    btnSave.title = 'Log in to save favourites';
    btnSave.style.opacity = '0.7';
    return;
  }

  // Logged in: show saved state based on isFavorited
  btnSave.style.opacity = '1';
  btnSave.textContent = isFavorited ? '♥ Saved' : '♡ Save';
  btnSave.title = isFavorited ? 'Remove from favourites' : 'Add to favourites';
}


// ---------------------------
// List + text helpers
// ---------------------------

// Convert a text block into bullet list items.
// Supports newline OR comma separated input.
// Also strips leading bullets/dashes like "- item" or "• item".
function splitToItems(text) {
  const raw = String(text || '').trim();
  if (!raw) return [];

  let parts = raw.split('\n').map(s => s.trim()).filter(Boolean);

  // If it's a single line but contains commas, treat as comma-separated
  if (parts.length <= 1 && raw.includes(',')) {
    parts = raw.split(',').map(s => s.trim()).filter(Boolean);
  }

  return parts
    .map(p => p.replace(/^[-•\u2022]\s*/, '').trim())
    .filter(Boolean);
}

// Render bullet list into a UL element
function renderList(ulEl, items) {
  if (!ulEl) return;

  if (!items || !items.length) {
    ulEl.innerHTML = '<li>Details coming soon.</li>';
    return;
  }

  ulEl.innerHTML = items.map(i => `<li>${escapeHtml(i)}</li>`).join('');
}

// Format price numbers as whole euros (no decimals)
function toMoney(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(0) : '—';
}


// ---------------------------
// UI helpers
// ---------------------------
function setText(el, text) {
  if (el) el.textContent = text ?? '';
}

function showError(message) {
  const detailError = document.getElementById('detailError');
  if (!detailError) return;

  detailError.classList.remove('hidden');
  detailError.textContent = message || 'Something went wrong loading this experience.';
}

function hideError() {
  const detailError = document.getElementById('detailError');
  if (!detailError) return;

  detailError.classList.add('hidden');
}

// Escape text so it's safe to inject into innerHTML
function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}


// =====================================================
// Iteration 4: Metrics tracking (visitor_session + event_metric)
// =====================================================

// Visitor session ID for guests (stored in localStorage so we can count unique visits)
async function getOrCreateVisitorSessionId() {
  const key = 'visitor_session_id';
  let sessionId = localStorage.getItem(key);

  // If none, create one and store it
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem(key, sessionId);

    // Create a visitor_session row (optional but useful for analytics)
    try {
      await supabaseClient.from('visitor_session').insert({ session_id: sessionId });
    } catch (e) {
      // If RLS/constraints block it, we still keep sessionId locally.
      console.warn('visitor_session insert warning:', e?.message || e);
    }
  }

  return sessionId;
}

// Source = where they came from (finder/search/shared/direct)
function getSourceFromUrl() {
  const src = new URLSearchParams(window.location.search).get('src');
  return (src || 'direct').toLowerCase();
}

// Insert a row into event_metric
async function logEvent({ experienceId, eventType, source }) {
  const sessionId = await getOrCreateVisitorSessionId();
  const { data: { user } } = await supabaseClient.auth.getUser();

  const payload = {
    experience_id: experienceId,
    event_type: eventType,               // 'view' | 'booking_click' | 'share'
    source: source || getSourceFromUrl(),
    session_id: sessionId,
    user_id: user?.id ?? null            // optional (guest = null)
  };

  const { error } = await supabaseClient.from('event_metric').insert(payload);
  if (error) console.warn('logEvent insert warning:', error.message);
}

// Log a view once per 30 minutes per experience this prevents refresh inflating stats
async function logViewOnce(experienceId) {
  const dedupeKey = `viewed_${experienceId}`;
  const last = Number(localStorage.getItem(dedupeKey) || 0);
  const now = Date.now();

  // 30 minute window
  if (now - last < 30 * 60 * 1000) return;
  localStorage.setItem(dedupeKey, String(now));

  await logEvent({ experienceId, eventType: 'view' });
}

// Log a booking click once per 30 minutes per experience
async function logBookingClickOnce(experienceId, minutes = 30) {
  const dedupeKey = `booking_${experienceId}`;
  const last = Number(localStorage.getItem(dedupeKey) || 0);
  const now = Date.now();

  if (now - last < minutes * 60 * 1000) return;
  localStorage.setItem(dedupeKey, String(now));

  await logEvent({ experienceId, eventType: 'booking_click' });
}

// Track booking button clicks before navigating away
function wireBookingClickTracking(experienceId, finalUrl) {
  const btn = document.getElementById('btnBusinessSite');
  if (!btn) return;

  // Prevent double-binding if render runs more than once
  if (btn.dataset.trackingBound === 'true') return;
  btn.dataset.trackingBound = 'true';

  btn.addEventListener('click', async (e) => {
    if (!finalUrl) {
      e.preventDefault();
      return;
    }

    // Stop default navigation so Supabase insert completes
    e.preventDefault();

    await logBookingClickOnce(experienceId, 30);

    // Navigate AFTER logging
    window.open(finalUrl, '_blank', 'noopener');
  });
}
