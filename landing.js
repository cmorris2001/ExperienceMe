// Landing Page JavaScript
// Handles: Supabase connection test, loading categories + counties from DB,
// basic search placeholders, simple auth check, and smooth scrolling on the landing page.

document.addEventListener('DOMContentLoaded', async () => {
    console.log('Landing page loaded');

    //Creates Anonymous Session earlier rather than later, Iteration 5
    await getOrCreateVisitorSessionId();

    // Test Supabase connection (for debugging in dev tools / F12)
    await testSupabaseConnection();

    // Load categories and counties from Supabase into the landing page grids
    await loadCategories();
    await loadCounties();

    // Check if user is already logged in (for future personalised UI)
    await checkAuthStatus();

    // Wire up sign out button (only visible when logged in)
    wireUpSignOut();
});

/**
 * Test Supabase connection.
 * This is for debugging reasons: I can open dev tools (F12) and see
 * if the app can actually talk to Supabase, and where it fails if not.
 */
async function testSupabaseConnection() {
    try {
        console.log('Testing Supabase connection...');

        const { data, error } = await supabaseClient
            .from('users')
            .select('count')
            .limit(1); // Just a tiny query to see if it works

        if (error) {
            console.error('Supabase connection error:', error);
        } else {
            console.log('Supabase connected successfully!');
        }
    } catch (err) {
        console.error('Error testing connection:', err);
    }
}

// Session getting created once page loads vs justr in detailed experience.js, Iteration 5
async function getOrCreateVisitorSessionId() {
  const key = 'visitor_session_id';
  let sessionId = localStorage.getItem(key);

  if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem(key, sessionId);

    const { error } = await supabaseClient
      .from('visitor_session') //
      .insert({ session_id: sessionId });

    if (error) console.warn('visitor_session insert warning:', error.message);
  }

  return sessionId;
}

/**
 * Load categories from Supabase.
 * Logs everything in console (F12) for easier debugging.
 */
async function loadCategories() {
    try {
        console.log('Loading categories...');

        const { data: categories, error } = await supabaseClient
            .from('category')
            .select('*')
            .order('category_name'); // Order alphabetically by name

        if (error) {
            console.error('Error loading categories:', error);
            document.getElementById('categoriesGrid').innerHTML =
                '<p class="loading" style="color: var(--danger-color);">Failed to load categories</p>';
            return;
        }

        console.log('Categories loaded:', categories);
        displayCategories(categories); // Pass to UI renderer

    } catch (err) {
        console.error('Error in loadCategories:', err);
    }
}

/**
 * Display categories in grid on landing page.
 * Takes a list of category rows from Supabase and renders them as cards.
 */
function displayCategories(categories) {
    const grid = document.getElementById('categoriesGrid');

    if (!categories || categories.length === 0) {
        grid.innerHTML = '<p class="loading">No categories available yet</p>';
        return;
    }

    // Loops through each category and creates HTML for it
    // Inside the map we build each card and then join it into one big string
    grid.innerHTML = categories.map(category => `
        <div class="image-card" onclick="searchByCategory('${category.category_id}', '${category.category_name}')">
            <img
                src="${category.category_image_url}"
                alt="${category.category_name}"
                onerror="this.src='https://via.placeholder.com/400x300?text=${encodeURIComponent(category.category_name)}'"
            >
            <div class="image-card-overlay">
                <h3 class="image-card-title">${category.category_name}</h3>
            </div>
        </div>
    `).join('');
}

/**
 * Load counties from Supabase.
 * Again logging everything to console F12 to help debug.
 */
async function loadCounties() {
    try {
        console.log('Loading counties...');

        const { data: counties, error } = await supabaseClient
            .from('county')
            .select('*')
            .order('county_id'); // Ordered by county_id

        if (error) {
            console.error('Error loading counties:', error);
            document.getElementById('countiesGrid').innerHTML =
                '<p class="loading" style="color: var(--danger-color);">Failed to load counties</p>';
            return;
        }

        console.log('Counties loaded:', counties);
        displayCounties(counties);

    } catch (err) {
        console.error('Error in loadCounties:', err);
    }
}

/**
 * Display counties in grid on landing page.
 */
function displayCounties(counties) {
    const grid = document.getElementById('countiesGrid');

    if (!counties || counties.length === 0) {
        grid.innerHTML = '<p class="loading">No counties available yet</p>';
        return;
    }

    // Loops through each county and creates HTML for it
    // Inside the map we create the card and then join into one string
    grid.innerHTML = counties.map(county => `
        <div class="image-card" onclick="searchByCounty('${county.county_id}')">
            <img
                src="${county.county_image_url}"
                alt="${county.county_id}"
                onerror="this.src='https://via.placeholder.com/400x300?text=${encodeURIComponent(county.county_id)}'"
            >
            <div class="image-card-overlay">
                <h3 class="image-card-title">${county.county_id}</h3>
            </div>
        </div>
    `).join(''); // smashes it all together into HTML
}

/**
 * Search by category.
 */
function searchByCategory(categoryId, categoryName) {
    console.log('Searching by category:', categoryName);

    // Instead of alerts, we send user to real experiences results page with filters applied
    goToExperiencesPage({
        category_id: categoryId,
        category_name: categoryName
    });
}

/**
 * Search by county.
 * Same idea as above
 */
function searchByCounty(countyName) {
    console.log('Searching by county:', countyName);

    // Send user to real experiences results page filtered by county
    goToExperiencesPage({
        county: countyName
    });
}

/**
 * Handle search from hero search bar.
 */
function handleSearch() {
    const searchInput = document.getElementById('heroSearch');
    const query = searchInput.value.trim();

    if (!query) {
        alert('Please enter a search term');
        return;
    }

    console.log('Searching for:', query);

    // Send user to real experiences results page with search query
    goToExperiencesPage({
        q: query
    });
}

// Allow search when user presses Enter key inside hero search input
document.getElementById('heroSearch')?.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        handleSearch();
    }
});

/**
 * Central helper for navigation to experiences results page.
 * This keeps category / county / search all consistent
 */
// Mozilla Developer Network (MDN) (2025) ‘URL: URL() constructor’. Available at: https://developer.mozilla.org/en-US/docs/Web/API/URL/URL (Accessed: 31 January 2026).
// Mozilla Developer Network (MDN) (2025) ‘URL: searchParams property’. Available at: https://developer.mozilla.org/en-US/docs/Web/API/URL/searchParams (Accessed: 31 January 2026).
// Mozilla Developer Network (MDN) (2024) ‘URLSearchParams: set() method’. Available at: https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams/set (Accessed: 31 January 2026).
// Mozilla Developer Network (MDN) (2025) ‘Window: location property’. Available at: https://developer.mozilla.org/en-US/docs/Web/API/Window/location (Accessed: 31 January 2026).
function goToExperiencesPage(params = {}) {
    const url = new URL(window.location.origin + window.location.pathname.replace('landing.html', 'experiences.html'));

    // If user loads site without landing.html it will still open experiences.html kind of a safety net
    if (!url.pathname.endsWith('experiences.html')) {
        url.pathname = url.pathname.replace(/\/[^\/]*$/, '/experiences.html');
    }

    Object.keys(params).forEach((key) => {
        if (params[key] !== undefined && params[key] !== null && params[key] !== '') {
            url.searchParams.set(key, String(params[key]));
        }
    });

    window.location.href = url.toString();
}

/**
 * Check if user is authenticated, logs result in console. Iteration 5 change
 */
async function checkAuthStatus() {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();

        if (user) {
            console.log('User is logged in:', user.email);

            // Fetch role from users table
            const { data: userRow, error } = await supabaseClient
                .from('users')
                .select('role')
                .eq('user_id', user.id)
                .single();

            if (error) {
                console.warn('Could not fetch user role (defaulting to user nav):', error);
                updateUIForLoggedInUser(user); // fallback: treat as normal user
                return;
            }

            const role = userRow?.role;
            console.log('User role:', role);

            if (role === 'business') {
                updateUIForBusinessUser(user);
            } else {
                updateUIForLoggedInUser(user);
            }

        } else {
            console.log('No user logged in');
            updateUIForLoggedOutUser();
        }
    } catch (error) {
        console.error('Error checking auth status:', error);
    }
}
 // Updated UI for Business users
function updateUIForBusinessUser(user) {
    console.log('Business user authenticated');

    const navGuest = document.getElementById('navGuest');
    const navUser = document.getElementById('navUser');
    const navBusiness = document.getElementById('navBusiness');

    if (navGuest) navGuest.style.display = 'none';
    if (navUser) navUser.style.display = 'none';
    if (navBusiness) navBusiness.style.display = 'flex';
}
/**
 * Update UI for logged in users. Iteration 5 change
 */
function updateUIForLoggedInUser(user) {
    console.log('User authenticated, showing user nav');

    const navGuest = document.getElementById('navGuest');
    const navUser = document.getElementById('navUser');
    const navBusiness = document.getElementById('navBusiness');

    if (navGuest) navGuest.style.display = 'none';
    if (navUser) navUser.style.display = 'flex';
    if (navBusiness) navBusiness.style.display = 'none';
}

/**
   Update UI for logged out users.
 * This keeps behaviour consistent if session changes or user signs out. Iteration 5 change
 */
function updateUIForLoggedOutUser() {
    const navGuest = document.getElementById('navGuest');
    const navUser = document.getElementById('navUser');
    const navBusiness = document.getElementById('navBusiness');

    if (navGuest) navGuest.style.display = 'flex';
    if (navUser) navUser.style.display = 'none';
    if (navBusiness) navBusiness.style.display = 'none';
}

/**
 Sign out button so logged-in users can sign out from landing page. Iteration 5 change
 */
/**
 * Sign out button so logged-in users can sign out from landing page.
 * Supports both normal user nav and business nav.
 */
function wireUpSignOut() {
    const btnUser = document.getElementById('btnSignOut');
    const btnBusiness = document.getElementById('btnSignOutBusiness');

    [btnUser, btnBusiness].forEach((btn) => {
        if (!btn) return;

        btn.addEventListener('click', async () => {
            try {
                console.log('Signing out...');

                const { error } = await supabaseClient.auth.signOut();
                if (error) {
                    console.error('Sign out error:', error);
                    alert('Could not sign out. Please try again.');
                    return;
                }

                console.log('Signed out successfully');
                updateUIForLoggedOutUser();
            } catch (err) {
                console.error('Error during sign out:', err);
                alert('Could not sign out. Please try again.');
            }
        });
    });
}

/**
 * Smooth scroll for anchor links (like #features, #about).
 * Makes navigation feel smoother and nicer
 */
// https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollIntoView
// Implementation helped by Claude AI
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) {
            target.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    });
});