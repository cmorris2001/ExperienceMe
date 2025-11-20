// User Dashboard
// - Handles auth + profile info
// - Explore tab: landing-style hero, search, recently added approved experiences
// - Favorites tab: add/remove favorites using a "favorite" table in Supabase

let currentUser = null;          // Supabase auth user
let currentUserData = null;      // Matching record from "users" table

let allExperiences = [];               // All approved experiences for Explore tab
let favoriteExperienceIds = new Set(); // Set of experience_ids the user has favorited
let exploreSearchTerm = '';            // Current search term in Explore search bar

document.addEventListener('DOMContentLoaded', async () => {
    console.log("User dashboard loaded");

    // Check if user is logged in via Supabase auth
    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
        // If no user, send them back to login
        window.location.href = '../auth/login.html';
        return;
    }

    currentUser = user;

    // Load user profile info (name, email, role)
    await loadUserInfo();

    // Load explore experiences + favorites at the same time
    await Promise.all([
        loadExploreExperiences(),
        loadFavorites()
    ]);

    // Logout button logic
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);

    // Live search on heroSearch input (Explore tab)
    const searchInput = document.getElementById('heroSearch');
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            exploreSearchTerm = searchInput.value.trim().toLowerCase();
            renderExploreList(); // Re-filter experiences as user types
        });
    }

    // Default tab when user opens dashboard
    showSection('explore');
});

/* ======================
   Load User Information
   ====================== */

/**
 * Load user info from "users" table and display on profile tab.
 */
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

    // Insert basic user info into #userInfo div
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

/**
 * Load all approved experiences from Supabase for the Explore tab.
 */
async function loadExploreExperiences() {
    try {
        const { data, error } = await supabaseClient
            .from('experiences')
            .select('*')
            .eq('status', 'approved')
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Could slice here if you only want a subset (top 8 etc.)
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

/**
 * Apply search filter to experiences based on title or county.
 */
function getFilteredExploreExperiences() {
    if (!exploreSearchTerm) return allExperiences;

    return allExperiences.filter(exp => {
        const title = (exp.title || '').toLowerCase();
        const county = (exp.county || '').toLowerCase();
        // Match search term on title or county
        return title.includes(exploreSearchTerm) || county.includes(exploreSearchTerm);
    });
}

/**
 * Render Explore list into #exploreResults using exploreCardTemplate.
 */
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

        // Title
        card.querySelector('[data-field="title"]').textContent = exp.title || 'Untitled';

        // Meta (for now just county, can be extended later)
        const meta = `${exp.county || 'Location TBD'}`;
        card.querySelector('[data-field="meta"]').textContent = meta;

        // Price formatting
        const price = (exp.min_price && exp.max_price)
            ? `€${exp.min_price} – €${exp.max_price}`
            : (exp.min_price ? `From €${exp.min_price}` : 'Price TBD');
        card.querySelector('[data-field="price"]').textContent = price;

        // Favorite button heart state
        const favBtn = card.querySelector('.favorite-toggle');
        const isFav = favoriteExperienceIds.has(exp.experience_id);

        favBtn.textContent = isFav ? '♥' : '♡'; // filled vs hollow heart
        favBtn.title = isFav ? 'Remove from favorites' : 'Add to favorites';

        // Clicking heart toggles favorite in DB and UI
        favBtn.addEventListener('click', () => toggleFavorite(exp.experience_id));

        fragment.appendChild(card);
    });

    container.innerHTML = '';
    container.appendChild(fragment);
}

/**
 * Manual search button handler (called from onclick in HTML).
 * Basically same as typing into input but triggered by button.
 */
function searchExplore() {
    const input = document.getElementById('heroSearch');
    exploreSearchTerm = (input?.value || '').trim().toLowerCase();
    renderExploreList();
}

/* ======================
   Favorites (table: favorite)
   ====================== */

/**
 * Load favorites for current user from "favorite" table.
 */
async function loadFavorites() {
    try {
        const { data, error } = await supabaseClient
            .from('favorite') // table name is singular
            .select('experience_id')
            .eq('user_id', currentUser.id);

        if (error) throw error;

        // Store as a Set for quick lookup
        favoriteExperienceIds = new Set((data || []).map(row => row.experience_id));

        // Update both Explore hearts + Favorites tab
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

/**
 * Render "My Favorites" list into #favoritesList using favoriteCardTemplate.
 */
function renderFavoritesList() {
    const container = document.getElementById('favoritesList');
    if (!container) return;

    // Filter allExperiences against favorite ids
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

        // Title
        card.querySelector('[data-field="title"]').textContent = exp.title || 'Untitled';

        // Meta
        const meta = `${exp.county || 'Location TBD'}`;
        card.querySelector('[data-field="meta"]').textContent = meta;

        // Price
        const price = (exp.min_price && exp.max_price)
            ? `€${exp.min_price} – €${exp.max_price}`
            : (exp.min_price ? `From €${exp.min_price}` : 'Price TBD');
        card.querySelector('[data-field="price"]').textContent = price;

        // Heart button removes from favorites
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

/**
 * Toggle favorite state for a given experience:
 * - If already favorite, delete from "favorite" table.
 * - If not favorite, insert into "favorite" table.
 * Then update Set + re-render UI.
 */
async function toggleFavorite(experienceId) {
    try {
        if (favoriteExperienceIds.has(experienceId)) {
            // Remove from favorites
            const { error } = await supabaseClient
                .from('favorite')
                .delete()
                .eq('user_id', currentUser.id)
                .eq('experience_id', experienceId);

            if (error) throw error;

            favoriteExperienceIds.delete(experienceId);
            showAlert('Removed from favorites', 'info');
        } else {
            // Add to favorites
            const { error } = await supabaseClient
                .from('favorite')
                .insert({
                    user_id: currentUser.id,
                    experience_id: experienceId
                });

            if (error) throw error;

            favoriteExperienceIds.add(experienceId);
            showAlert('Added to favorites', 'success');
        }

        // Refresh lists to reflect updated hearts
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

/**
 * Show one of the three sections: explore, favorites, profile.
 * (Hooked up to inline onclick in userDashboard.html)
 */
function showSection(section) {
    // Hide all user sections
    document.querySelectorAll('.user-section').forEach(sec => sec.classList.add('hidden'));

    // Show selected section
    const target = document.getElementById(`${section}Section`);
    if (target) target.classList.remove('hidden');

    // Optional: update some page title element if present
    const prettyName = section.charAt(0).toUpperCase() + section.slice(1);
    const titleEl = document.getElementById('pageTitle');
    if (titleEl) {
        titleEl.textContent = prettyName;
    }
}

/* ======================
   Alerts
   ====================== */

/**
 * Floating alert helper (bottom-right) for quick feedback.
 * type: 'success' | 'error' | 'info'
 */
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

/**
 * Log user out and send back to landing page.
 */
async function handleLogout() {
    await supabaseClient.auth.signOut();
    window.location.href = '../landing.html';
}

/* Expose functions for inline onclick attributes in HTML */
window.showSection = showSection;
window.searchExplore = searchExplore;

