// User Dashboard
// - Auth + profile info
// - Explore: landing-style hero + search + recently added approved experiences
// - Favorites: add/remove via hearts (table: favorite)

let currentUser = null;
let currentUserData = null;

let allExperiences = [];               // all approved experiences for Explore
let favoriteExperienceIds = new Set(); // experience_ids the user has favorited
let exploreSearchTerm = '';            // current search term

document.addEventListener('DOMContentLoaded', async () => {
    console.log("User dashboard loaded");

    // Auth check
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
        window.location.href = '../auth/login.html';
        return;
    }

    currentUser = user;

    // Load user info
    await loadUserInfo();

    // Load explore data + favorites in parallel
    await Promise.all([
        loadExploreExperiences(),
        loadFavorites()
    ]);

    // Logout button
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);

    // Live search on heroSearch
    const searchInput = document.getElementById('heroSearch');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            exploreSearchTerm = searchInput.value.trim().toLowerCase();
            renderExploreList();
        });
    }

    // Default section
    showSection('explore');
});

/* ======================
   Load User Information
   ====================== */
async function loadUserInfo() {
    const { data, error } = await supabaseClient
        .from('users')
        .select('*')
        .eq('user_id', currentUser.id)
        .single();

    if (error) {
        console.error("Error loading user:", error);
        return;
    }

    currentUserData = data;

    document.getElementById('userInfo').innerHTML = `
        <p style="color: var(--text-secondary);">
            <strong>Name:</strong> ${data.full_name}<br>
            <strong>Email:</strong> ${data.email}<br>
            <strong>Role:</strong> ${data.role}
        </p>
    `;
}

/* ======================
   Explore: Approved Experiences
   ====================== */
async function loadExploreExperiences() {
    try {
        const { data, error } = await supabaseClient
            .from('experiences')
            .select('*')
            .eq('status', 'approved')
            .order('created_at', { ascending: false });

        if (error) throw error;

        // If you want only the top N recent, slice here:
        // allExperiences = (data || []).slice(0, 8);
        allExperiences = data || [];

        renderExploreList();
    } catch (err) {
        console.error('Error loading explore experiences:', err);
        const container = document.getElementById('exploreResults');
        if (container) {
            container.innerHTML = '<p class="alert alert-error">Error loading experiences</p>';
        }
    }
}

function getFilteredExploreExperiences() {
    if (!exploreSearchTerm) return allExperiences;

    return allExperiences.filter(exp => {
        const title = (exp.title || '').toLowerCase();
        const county = (exp.county || '').toLowerCase();
        return title.includes(exploreSearchTerm) || county.includes(exploreSearchTerm);
    });
}

function renderExploreList() {
    const container = document.getElementById('exploreResults');
    if (!container) return;

    const list = getFilteredExploreExperiences();

    if (!list.length) {
        container.innerHTML = `
            <div style="padding:2rem;text-align:center;color:var(--text-secondary);">
                No experiences found. Try a different search.
            </div>
        `;
        return;
    }

    const template = document.getElementById('exploreCardTemplate');
    const fragment = document.createDocumentFragment();

    list.forEach(exp => {
        const card = template.content.cloneNode(true);

        card.querySelector('[data-field="title"]').textContent = exp.title || 'Untitled';

        const meta = `${exp.county || 'Location TBD'}`;
        card.querySelector('[data-field="meta"]').textContent = meta;

        const price = (exp.min_price && exp.max_price)
            ? `€${exp.min_price} – €${exp.max_price}`
            : (exp.min_price ? `From €${exp.min_price}` : 'Price TBD');
        card.querySelector('[data-field="price"]').textContent = price;

        const favBtn = card.querySelector('.favorite-toggle');
        const isFav = favoriteExperienceIds.has(exp.experience_id);

        favBtn.textContent = isFav ? '♥' : '♡';
        favBtn.title = isFav ? 'Remove from favorites' : 'Add to favorites';

        favBtn.addEventListener('click', () => toggleFavorite(exp.experience_id));

        fragment.appendChild(card);
    });

    container.innerHTML = '';
    container.appendChild(fragment);
}

/* Manual search button (called from onclick in HTML) */
function searchExplore() {
    const input = document.getElementById('heroSearch');
    exploreSearchTerm = (input?.value || '').trim().toLowerCase();
    renderExploreList();
}

/* ======================
   Favorites (table: favorite)
   ====================== */
async function loadFavorites() {
    try {
        const { data, error } = await supabaseClient
            .from('favorite') // <--- singular table name
            .select('experience_id')
            .eq('user_id', currentUser.id);

        if (error) throw error;

        favoriteExperienceIds = new Set((data || []).map(row => row.experience_id));

        // Sync UI
        renderExploreList();
        renderFavoritesList();
    } catch (err) {
        console.error('Error loading favorites:', err);
        const container = document.getElementById('favoritesList');
        if (container) {
            container.innerHTML = '<p class="alert alert-error">Error loading favorites</p>';
        }
    }
}

function renderFavoritesList() {
    const container = document.getElementById('favoritesList');
    if (!container) return;

    const favorites = allExperiences.filter(exp =>
        favoriteExperienceIds.has(exp.experience_id)
    );

    if (!favorites.length) {
        container.innerHTML = `
            <div style="padding:2rem;text-align:center;color:var(--text-secondary);">
                You have no favorites yet. Go to <strong>Explore</strong> and add some!
            </div>
        `;
        return;
    }

    const template = document.getElementById('favoriteCardTemplate');
    const fragment = document.createDocumentFragment();

    favorites.forEach(exp => {
        const card = template.content.cloneNode(true);

        card.querySelector('[data-field="title"]').textContent = exp.title || 'Untitled';

        const meta = `${exp.county || 'Location TBD'}`;
        card.querySelector('[data-field="meta"]').textContent = meta;

        const price = (exp.min_price && exp.max_price)
            ? `€${exp.min_price} – €${exp.max_price}`
            : (exp.min_price ? `From €${exp.min_price}` : 'Price TBD');
        card.querySelector('[data-field="price"]').textContent = price;

        const favBtn = card.querySelector('.favorite-toggle');
        favBtn.addEventListener('click', () => toggleFavorite(exp.experience_id));

        fragment.appendChild(card);
    });

    container.innerHTML = '';
    container.appendChild(fragment);
}

/* ======================
   Toggle Favorite (Add / Remove)
   ====================== */
async function toggleFavorite(experienceId) {
    try {
        if (favoriteExperienceIds.has(experienceId)) {
            // remove
            const { error } = await supabaseClient
                .from('favorite') // <--- singular table name
                .delete()
                .eq('user_id', currentUser.id)
                .eq('experience_id', experienceId);

            if (error) throw error;

            favoriteExperienceIds.delete(experienceId);
            showAlert('Removed from favorites', 'info');
        } else {
            // add
            const { error } = await supabaseClient
                .from('favorite') // <--- singular table name
                .insert({
                    user_id: currentUser.id,
                    experience_id: experienceId
                });

            if (error) throw error;

            favoriteExperienceIds.add(experienceId);
            showAlert('Added to favorites', 'success');
        }

        // Refresh UI
        renderExploreList();
        renderFavoritesList();
    } catch (err) {
        console.error('Error toggling favorite:', err);
        showAlert('Error updating favorites', 'error');
    }
}

/* ======================
   Section Navigation
   ====================== */
function showSection(section) {
    document.querySelectorAll('.user-section').forEach(sec => sec.classList.add('hidden'));

    const target = document.getElementById(`${section}Section`);
    if (target) target.classList.remove('hidden');

    const prettyName = section.charAt(0).toUpperCase() + section.slice(1);
    document.getElementById('pageTitle').textContent = prettyName;
}

/* ======================
   Alerts
   ====================== */
function showAlert(message, type) {
    const el = document.createElement('div');
    const map = {
        success: 'alert-success',
        error: 'alert-error',
        info: 'alert-info'
    };

    el.className = `alert ${map[type] || ''}`;
    el.textContent = message;
    el.style.position = 'fixed';
    el.style.bottom = '20px';
    el.style.right = '20px';
    el.style.zIndex = '9999';

    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2500);
}

/* ======================
   Logout
   ====================== */
async function handleLogout() {
    await supabaseClient.auth.signOut();
    window.location.href = '../landing.html';
}

/* Expose for inline onclick */
window.showSection = showSection;
window.searchExplore = searchExplore;

