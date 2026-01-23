// User Dashboard (user.js)
// - Handles auth + profile info
// - Favorites tab: loads favorites directly from DB (no Explore section)
// - Allows user to remove favorites (heart button)
// - Simple section switching (profile / favorites)

let currentUser = null;               // Supabase auth user
let currentUserData = null;           // Matching row from "users" table
let favoriteExperienceIds = new Set(); // Set of experience_ids the user has favorited

document.addEventListener('DOMContentLoaded', async () => {
    console.log("User dashboard loaded");

    // 1) Check if user is logged in via Supabase auth
    const { data: { user }, error } = await supabaseClient.auth.getUser();
    if (error) console.warn('Auth getUser warning:', error.message);

    if (!user) {
        // If no user, send to login
        window.location.href = '../auth/login.html';
        return;
    }

    currentUser = user;

    // 2) Load user profile info (name, email, role)
    await loadUserInfo();

    // 3) Load favorites list
    await loadFavorites();

    // 4) Logout button
    document.getElementById('logoutBtn')?.addEventListener('click', handleLogout);

    // Default tab when user opens dashboard (Profile)
    showSection('profile');
});

/* ======================
   Load User Information
   ====================== */

/**
 * Load user info from "users" table and display on profile section.
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
    const fullName = data.full_name || '—';
    const email = data.email || currentUser.email || '—';
    const role = data.role || 'user';

    document.getElementById('userInfo').innerHTML = `
        <p style="color: var(--text-secondary);">
            <strong>Name:</strong> ${fullName}<br>
            <strong>Email:</strong> ${email}<br>
            <strong>Role:</strong> ${role}
        </p>
    `;
}

/* ======================
   Favorites (table: favorite)
   ====================== */

/**
 * Load favorites for current user from "favorite" table,
 * then fetch the matching experiences from "experiences".
 */
async function loadFavorites() {
    try {
        // 1) Get favorite IDs for this user
        const { data: favRows, error: favErr } = await supabaseClient
            .from('favorite')               // table name is singular in your project
            .select('experience_id')
            .eq('user_id', currentUser.id);

        if (favErr) throw favErr;

        const ids = (favRows || []).map(r => r.experience_id);
        favoriteExperienceIds = new Set(ids);

        // If none saved, render empty state
        if (ids.length === 0) {
            renderFavoritesList([]);
            return;
        }

        // 2) Fetch the experiences for those IDs
        const { data: exps, error: expErr } = await supabaseClient
            .from('experiences')
            .select('experience_id, title, county, min_price, max_price, status, is_published')
            .in('experience_id', ids)
            .order('created_at', { ascending: false });

        if (expErr) throw expErr;

        // Optional: only show approved/published experiences
        const safe = (exps || []).filter(e => e.status === 'approved' && e.is_published === true);

        renderFavoritesList(safe);

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
function renderFavoritesList(favorites) {
    const container = document.getElementById('favoritesList');
    if (!container) return;

    if (!favorites.length) {
        container.innerHTML = `
            <div style="padding:2rem;text-align:center;color:var(--text-secondary);">
                You have no favorites yet. Go to <a href="../experiences.html"><strong>Explore</strong></a> and add some!
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

        // Meta (for now just county)
        card.querySelector('[data-field="meta"]').textContent = exp.county || 'Location TBD';

        // Price formatting
        const price = (exp.min_price != null && exp.max_price != null)
            ? `€${exp.min_price} – €${exp.max_price}`
            : (exp.min_price != null ? `From €${exp.min_price}` : 'Price TBD');
        card.querySelector('[data-field="price"]').textContent = price;

        // View details link
        const viewLink = card.querySelector('[data-field="viewLink"]');
        if (viewLink) {
            viewLink.href = `../detailed_experience.html?id=${encodeURIComponent(exp.experience_id)}`;
        }

        // Heart button removes favorite
        const favBtn = card.querySelector('.favorite-toggle');
        favBtn.addEventListener('click', () => toggleFavorite(exp.experience_id));

        fragment.appendChild(card);
    });

    container.innerHTML = '';
    container.appendChild(fragment);
}

/* ======================
   Toggle Favorite (Remove)
   ====================== */

/**
 * Toggle favorite state:
 * - If already favorite, delete from "favorite" table.
 * - If not favorite, insert into "favorite" table.
 * Then reload favorites so UI stays accurate.
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
            showToast('Removed from favorites', 'info');
        } else {
            // Add back (in case you reuse this on other pages later)
            const { error } = await supabaseClient
                .from('favorite')
                .insert({
                    user_id: currentUser.id,
                    experience_id: experienceId
                });

            if (error) throw error;

            favoriteExperienceIds.add(experienceId);
            showToast('Added to favorites', 'success');
        }

        // Reload favorites list from DB (single source of truth)
        await loadFavorites();

    } catch (err) {
        console.error('Error toggling favorite:', err);
        showToast('Error updating favorites', 'error');
    }
}

/* ======================
   Section Navigation
   ====================== */

/**
 * Show one of the sections: favorites or profile.
 * (Hooked up to inline onclick in user.html)
 */
function showSection(section) {
    // Hide all user sections
    document.querySelectorAll('.user-section').forEach(sec => sec.classList.add('hidden'));

    // Show selected section
    const target = document.getElementById(`${section}Section`);
    if (target) target.classList.remove('hidden');
}

/* ======================
   Toast Alerts (simple)
   ====================== */

/**
 * Floating toast helper (bottom-right) for quick feedback.
 * type: 'success' | 'error' | 'info'
 */
function showToast(message, type) {
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
    el.style.maxWidth = '320px';

    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2200);
}

/* ======================
   Logout
   ====================== */

/**
 * Log user out and send back to landing page.
 */
async function handleLogout() {
    try {
        await supabaseClient.auth.signOut();
        window.location.href = '../landing.html';
    } catch (err) {
        console.error('Logout error:', err);
        showToast('Error logging out', 'error');
    }
}

/* Expose function for inline onclick in HTML */
window.showSection = showSection;
