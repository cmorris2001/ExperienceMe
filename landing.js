// Landing Page JavaScript
// Handles: Supabase connection test, loading categories + counties from DB,
// basic search placeholders, simple auth check, and smooth scrolling on the landing page.

// Wait for DOM to be fully loaded before running any JS
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Landing page loaded');

    // Test Supabase connection (for debugging in dev tools / F12)
    await testSupabaseConnection();

    // Load categories and counties from Supabase into the landing page grids
    await loadCategories();
    await loadCounties();

    // Check if user is already logged in (for future personalised UI)
    await checkAuthStatus();
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
        <div class="image-card" onclick="searchByCategory('${category.category_name}')">
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
 * Not set up yet for a real results page, just logs + pop up.
 */
function searchByCategory(categoryName) {
    console.log('Searching by category:', categoryName);

    alert(`Searching for ${categoryName} experiences. (Experiences page coming soon!)`);
}

/**
 * Search by county.
 * Same idea as above, placeholder only.
 */
function searchByCounty(countyName) {
    console.log('Searching by county:', countyName);

    alert(`Searching for experiences in ${countyName}. (Experiences page coming soon!)`);
}

/**
 * Handle search from hero search bar.
 * Also just a placeholder right now, doesn’t go to a results page yet.
 */
function handleSearch() {
    const searchInput = document.getElementById('heroSearch');
    const query = searchInput.value.trim();

    if (!query) {
        alert('Please enter a search term');
        return;
    }

    console.log('Searching for:', query);

    alert(`Searching for "${query}". (Experiences page coming soon!)`);
}

// Allow search when user presses Enter key inside hero search input
document.getElementById('heroSearch')?.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        handleSearch();
    }
});

/**
 * Check if user is authenticated, logs result in console.
 * Later I could use this to change nav buttons (e.g. show “Dashboard”).
 */
async function checkAuthStatus() {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();

        if (user) {
            console.log('User is logged in:', user.email);
            updateUIForLoggedInUser(user);
        } else {
            console.log('No user logged in');
        }
    } catch (error) {
        console.error('Error checking auth status:', error);
    }
}

/**
 * Update UI for logged in users.
 * Right now just a placeholder, but this is where I could show personalised landing.
 */
function updateUIForLoggedInUser(user) {
    console.log('User authenticated, could show personalized content');
    // e.g. show “Go to Dashboard” button instead of Login in the future
}

/**
 * Smooth scroll for anchor links (like #features, #about).
 * Makes navigation feel nicer than instant jumps.
 */
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
