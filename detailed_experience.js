/**
 * detailed_experience.js
 * What it does:
 *  - Loads 1 experience (approved + published)
 *  - Renders title/meta/description, images, host, pricing, lists
 *  - Handles auth nav state + sign out
 *  - Supports favourites + share
 */
// ---------------------------
// Page state: stores the logged-in user, the current experience ID from the URL, and whether this experience is saved as a favorite
// ---------------------------
let authUser = null;
let currentExperienceId = null;
let isFavorited = false;

// ---------------------------
// DOM Ready (entry point)
// ---------------------------
document.addEventListener('DOMContentLoaded', async () => {
  const els = getEls();

  authUser = await getAuthUser();
  setNavState(els, authUser);

  bindStaticEvents(els);

  const experienceId = new URLSearchParams(window.location.search).get('id');
  if (!experienceId) {
    showError(els, 'Missing experience id in URL.');
    return;
  }

  currentExperienceId = experienceId;
  await loadAndRenderExperience(els, experienceId);
});

// ---------------------------
// Cache DOM elements once
// ---------------------------
function getEls() {
  return {
    navGuest: document.getElementById('navGuest'),
    navUser: document.getElementById('navUser'),
    btnSignOut: document.getElementById('btnSignOut'),

    crumbLocation: document.getElementById('crumbLocation'),
    expTitle: document.getElementById('expTitle'),
    expMeta: document.getElementById('expMeta'),
    expDescription: document.getElementById('expDescription'),

    detailError: document.getElementById('detailError'),

    mainImage: document.getElementById('mainImage'),
    thumbsRow: document.getElementById('thumbsRow'),

    hostLogoWrap: document.getElementById('hostLogoWrap'),
    hostLogo: document.getElementById('hostLogo'),
    hostName: document.getElementById('hostName'),
    hostLocation: document.getElementById('hostLocation'),
    hostDescription: document.getElementById('hostDescription'),

    priceFrom: document.getElementById('priceFrom'),
    priceTier: document.getElementById('priceTier'),
    priceRange: document.getElementById('priceRange'),
    badgePill: document.getElementById('badgePill'),

    btnBusinessSite: document.getElementById('btnBusinessSite'),
    btnSave: document.getElementById('btnSave'),
    btnShare: document.getElementById('btnShare'),

    whatYouDoList: document.getElementById('whatYouDoList'),
    whatsIncludedList: document.getElementById('whatsIncludedList'),
  };
}

// ---------------------------
// Auth helpers
// ---------------------------
async function getAuthUser() {
  try {
    const { data: { user }, error } = await supabaseClient.auth.getUser();
    if (error) console.warn('Auth getUser warning:', error.message);
    return user || null;
  } catch {
    return null;
  }
}

function setNavState(els, user) {
  const loggedIn = !!user;
  if (els.navGuest) els.navGuest.style.display = loggedIn ? 'none' : 'flex';
  if (els.navUser) els.navUser.style.display = loggedIn ? 'flex' : 'none';
}

// ---------------------------
// Bind events that do not depend on data
// ---------------------------
function bindStaticEvents(els) {
  // Sign out
  els.btnSignOut?.addEventListener('click', async () => {
    try {
      await supabaseClient.auth.signOut();
      window.location.href = 'landing.html';
    } catch {
      alert('Could not sign out. Please try again.');
    }
  });

  // Share link and error handling
  els.btnShare?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      alert('Link copied!');
    } catch {
      alert('Could not copy link. You can copy from the address bar.');
    }
  });

  // Save / favourite
  els.btnSave?.addEventListener('click', async () => {
    if (!authUser) {
      window.location.href = 'auth/login.html';
      return;
    }
    if (!currentExperienceId) return;
    await toggleFavorite(currentExperienceId);
    updateSaveButtonUI(els);
  });
}

// ---------------------------
// Load experience and favourite state, then render
// ---------------------------
async function loadAndRenderExperience(els, experienceId) {
  try {
    hideError(els);

    // 1) Load the experience
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

    if (error || !exp) {
      console.error('Error loading experience:', error);
      showError(els, 'Could not load this experience.');
      return;
    }

    // 2) If logged in, load favourite state
    if (authUser) {
      await loadFavoriteState(experienceId);
    }
    updateSaveButtonUI(els);

    // 3) Render
    renderDetail(els, exp);
  } catch (err) {
    console.error('Error in loadAndRenderExperience:', err);
    showError(els, 'Something went wrong.');
  }
}

// ---------------------------
// Render UI
// ---------------------------
function renderDetail(els, exp) {
  // Title + breadcrumb
  setText(els.expTitle, exp.title || 'Experience');
  setText(els.crumbLocation, exp.county || 'Ireland');

  // Description (prefer full event_description)
  const description =
    (exp.event_description && exp.event_description.trim()) ||
    (exp.short_description && exp.short_description.trim()) ||
    'No description provided yet.';
  setText(els.expDescription, description);

  // Meta line
  const durationText = exp.duration_minutes ? `${exp.duration_minutes} mins` : 'Duration TBD';
  const metaParts = [exp.county || 'Ireland', durationText].filter(Boolean);
  setText(els.expMeta, metaParts.join(' • '));

  // Host block
  const biz = exp.business || {};
  setText(els.hostName, biz.business_name || 'Business');
  setText(els.hostLocation, biz.location_text || (exp.county ? `${exp.county}, Ireland` : 'Ireland'));
  setText(els.hostDescription, (biz.business_description || '').trim() || 'Business description coming soon.');

  if (biz.business_image_url && els.hostLogoWrap && els.hostLogo) {
    els.hostLogo.src = biz.business_image_url;
    els.hostLogoWrap.style.display = 'block';
  } else if (els.hostLogoWrap) {
    els.hostLogoWrap.style.display = 'none';
  }

  // Pricing
  setText(els.priceFrom, exp.min_price != null ? `€${toMoney(exp.min_price)}` : '€—');
  setText(els.priceTier, exp.price_tier || '—');

  const range =
    (exp.min_price != null && exp.max_price != null)
      ? `€${toMoney(exp.min_price)} - €${toMoney(exp.max_price)}`
      : (exp.min_price != null)
        ? `From €${toMoney(exp.min_price)}`
        : '—';
  setText(els.priceRange, range);

  setText(els.badgePill, exp.duration_minutes ? `${exp.duration_minutes} mins` : 'Info');

  // Booking URL
  const finalUrl = exp.booking_url || biz.website_url || '';
  if (els.btnBusinessSite) {
    if (finalUrl) {
      els.btnBusinessSite.href = finalUrl;
      els.btnBusinessSite.style.pointerEvents = 'auto';
      els.btnBusinessSite.style.opacity = '1';
    } else {
      els.btnBusinessSite.href = '#';
      els.btnBusinessSite.style.pointerEvents = 'none';
      els.btnBusinessSite.style.opacity = '0.6';
    }
  }

  // Images + thumbnails
  const images = Array.isArray(exp.image) ? exp.image : [];
  const sorted = images
    .slice()
    .sort((a, b) => (a.display_order ?? 999) - (b.display_order ?? 999));

  const primary = sorted.find(i => i.is_primary) || sorted[0];
  const mainUrl = primary?.image_url || `https://via.placeholder.com/1200x800?text=${encodeURIComponent(exp.title || 'Experience')}`;
  if (els.mainImage) els.mainImage.src = mainUrl;

  renderThumbnails(els, sorted);

  // Lists (what you'll do / what's included)
  renderList(els.whatYouDoList, splitToItems(exp.what_you_do));
  renderList(els.whatsIncludedList, splitToItems(exp.whats_included));
}

// ---------------------------
// Thumbnails
// ---------------------------
function renderThumbnails(els, images) {
  if (!els.thumbsRow) return;

  if (!images.length) {
    els.thumbsRow.innerHTML = '';
    return;
  }

  const thumbs = images.slice(0, 4);
  els.thumbsRow.innerHTML = thumbs.map((img) => {
    const url = img.image_url || '';
    return `
      <div class="detail-thumb" data-url="${escapeAttr(url)}">
        <img src="${url}" alt="Thumbnail">
      </div>
    `;
  }).join('');

  els.thumbsRow.querySelectorAll('.detail-thumb').forEach((thumb) => {
    thumb.addEventListener('click', () => {
      const url = thumb.getAttribute('data-url') || '';
      if (els.mainImage && url) els.mainImage.src = url;
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

function updateSaveButtonUI(els) {
  if (!els.btnSave) return;

  if (!authUser) {
    els.btnSave.textContent = '♡ Save';
    els.btnSave.title = 'Log in to save favourites';
    els.btnSave.style.opacity = '0.7';
    return;
  }

  els.btnSave.style.opacity = '1';
  els.btnSave.textContent = isFavorited ? '♥ Saved' : '♡ Save';
  els.btnSave.title = isFavorited ? 'Remove from favourites' : 'Add to favourites';
}

// ---------------------------
// List + text helpers
// ---------------------------
// Bullet points render in where there is a list lik for whats included and what you will do sections
function renderList(ulEl, items) {
  if (!ulEl) return;

  if (!items.length) {
    ulEl.innerHTML = '<li>Details coming soon.</li>';
    return;
  }

  ulEl.innerHTML = items.map(i => `<li>${escapeHtml(i)}</li>`).join('');
}

function splitToItems(text) {
  if (!text || !String(text).trim()) return [];
  const raw = String(text).trim();

  // Split by newline; if no newline, allow comma-separated
  let parts = raw.split('\n').map(s => s.trim()).filter(Boolean);
  if (parts.length <= 1 && raw.includes(',')) {
    parts = raw.split(',').map(s => s.trim()).filter(Boolean);
  }

  // Strip leading bullets/dashes
  return parts
    .map(p => p.replace(/^[-•\u2022]\s*/, '').trim())
    .filter(Boolean);
}

function toMoney(n) {
  const num = Number(n);
  if (!Number.isFinite(num)) return String(n);
  return num.toFixed(0);
}

// ---------------------------
// UI helpers
// ---------------------------
function setText(el, text) {
  if (!el) return;
  el.textContent = text ?? '';
}

function showError(els, message) {
  if (!els.detailError) return;
  els.detailError.classList.remove('hidden');
  els.detailError.textContent = message || 'Something went wrong loading this experience.';
}

function hideError(els) {
  if (!els.detailError) return;
  els.detailError.classList.add('hidden');
}

function renderList(ulEl, items) {
  if (!ulEl) return;

  if (!items.length) {
    ulEl.innerHTML = '<li>Details coming soon.</li>';
    return;
  }

  ulEl.innerHTML = items.map(i => `<li>${escapeHtml(i)}</li>`).join('');
}
// Attribute escape for data-url (prevents quote breaking)
function escapeAttr(str) {
  return String(str).replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}
