// Landing Page JavaScript

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Landing page loaded');

    // Test Supabase connection
    await testSupabaseConnection();

    // Load categories and counties
    await loadCategories();
    await loadCounties();

    // Check if user is already logged in
    await checkAuthStatus();
});

/**
 * Test Supabase connection this is for debugging reasons, I can open dev tools by pressing F12 then each of these steps are displayed in my console, so if thewre is an error i casn fix it and know where the connection lies
 */
async function testSupabaseConnection() {
    try {
        console.log('Testing Supabase connection...');

        const { data, error } = await supabaseClient
            .from('users')
            .select('count')
            .limit(1);

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
 * Load categories from supabase logging all in console F12 for debugging
 */
async function loadCategories() {
    try {
        console.log('Loading categories...');

        const { data: categories, error } = await supabaseClient
            .from('category')
            .select('*')
            .order('category_name');

        if (error) {
            console.error('Error loading categories:', error);
            document.getElementById('categoriesGrid').innerHTML =
                '<p class="loading" style="color: var(--danger-color);">Failed to load categories</p>';
            return;
        }

        console.log('Categories loaded:', categories);
        displayCategories(categories);

    } catch (err) {
        console.error('Error in loadCategories:', err);
    }
}

/**
 * Display categories in grid
 */
function displayCategories(categories) {
    const grid = document.getElementById('categoriesGrid');

    if (!categories || categories.length === 0) {
        grid.innerHTML = '<p class="loading">No categories available yet</p>';
        return;
    }
 //loops through each category and creates HTML for it
//inside the map
    grid.innerHTML = categories.map(category => `
        <div class="image-card" onclick="searchByCategory('${category.category_name}')">
            <img src="${category.category_image_url}" alt="${category.category_name}" onerror="this.src='https://via.placeholder.com/400x300?text=${encodeURIComponent(category.category_name)}'">
            <div class="image-card-overlay">
                <h3 class="image-card-title">${category.category_name}</h3>
            </div>
        </div>
    `).join('');
}

/**
 * Load counties from supabase logging all in console for debugging with F12
 */
async function loadCounties() {
    try {
        console.log('Loading counties...');

        const { data: counties, error } = await supabaseClient
            .from('county')
            .select('*')
            .order('county_id');

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
 * Display counties in grid
 */
function displayCounties(counties) {
    const grid = document.getElementById('countiesGrid');

    if (!counties || counties.length === 0) {
        grid.innerHTML = '<p class="loading">No counties available yet</p>';
        return;
    }
//loops through each county and creates HTML for it//
//Inside the map
    grid.innerHTML = counties.map(county => `
        <div class="image-card" onclick="searchByCounty('${county.county_id}')">
            <img src="${county.county_image_url}" alt="${county.county_id}" onerror="this.src='https://via.placeholder.com/400x300?text=${encodeURIComponent(county.county_id)}'">
            <div class="image-card-overlay">
                <h3 class="image-card-title">${county.county_id}</h3>
            </div>
        </div>
    `).join(''); // smashes it all together
}

/**
 * Search by category not set up yet doesnt go anywhere just has pop up with selected expereinces name and coming soon
 */
function searchByCategory(categoryName) {
    console.log('Searching by category:', categoryName);

    alert(`Searching for ${categoryName} experiences. (Experiences page coming soon!)`);
}

/**
 * Search by county not set up yet doesnt go anywhere
 */
function searchByCounty(countyName) {
    console.log('Searching by county:', countyName);

    alert(`Searching for experiences in ${countyName}. (Experiences page coming soon!)`);
}

/**
 * Handle search from hero not set up yet, doesnt go anywhere
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

// Allow search on when user press enter key
document.getElementById('heroSearch')?.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        handleSearch();
    }
});

/**
 * Check if user is authenticated and hows in F12 console log
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
 * Update UI for logged in users
 */
function updateUIForLoggedInUser(user) {
    console.log('User authenticated, could show personalized content');

}

/**
 * Smooth scroll for anchor links
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
