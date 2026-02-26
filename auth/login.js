// Login Page JavaScript
// Handles checking if user is already logged in, logging in with Supabase auth,
// redirecting based on role, and showing alerts on the login page.

// Wait for DOM to be fully loaded before running any JS
document.addEventListener('DOMContentLoaded', () => {
    console.log('Login page loaded');

    // Check if user is already logged in (if yes, skip login form and redirect)
    checkIfAlreadyLoggedIn();

    // Get the login form and attach the submit handler function
    const form = document.getElementById('loginForm');
    form.addEventListener('submit', handleLogin);
});

/**
 * Check if user is already authenticated with Supabase
 * If they are, don't make them login again, just send them to dashboard.
 */
async function checkIfAlreadyLoggedIn() {
    try {
        // Supabase built-in auth method to get current user (from their SDK docs)
        const { data: { user } } = await supabaseClient.auth.getUser();

        if (user) {
            console.log('User already logged in, redirecting...');
            redirectToDashboard(user); // send them straight to the right dashboard
        }
    } catch (error) {
        console.error('Error checking auth status:', error);
    }
}

/**
 * Login form submission handler
 * This is triggered when user clicks "Sign In" on the form.
 */
async function handleLogin(e) {
    e.preventDefault(); // stop normal form submit (full page reload)

    // Get form values from whatever the user entered in respective fields email and password
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    // Validate that both inputs were entered
    if (!email || !password) {
        showAlert('Please enter both email and password', 'error');
        return;
    }

    // Disable submit button and show loading state "Signing In..."
    const submitBtn = document.getElementById('submitBtn');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Signing In...';

    try {
        console.log('Attempting to sign in...');

        // Sign in with Supabase Auth (using email + password method from docs)
        const { data: authData, error: authError } = await supabaseClient.auth.signInWithPassword({
            email: email,
            password: password
        });

        // If Supabase returns an auth error
        if (authError) {
            console.error('Login error:', authError);

            // Show user-friendly error messages such as wrong credentials or email not confirmed
            // (Exact messages based on Supabase error messages, some logic inspired by Supabase docs/examples)
            if (authError.message.includes('Invalid login credentials')) {
                showAlert('Invalid email or password. Please try again.', 'error');
            } else if (authError.message.includes('Email not confirmed')) {
                showAlert('Please verify your email address before logging in.', 'error');
            } else {
                showAlert(authError.message, 'error');
            }

            // Re-enable button + reset text since login failed
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
            return;
        }

        console.log('Login successful:', authData);

        // If login is successful and user object exists
        if (authData.user) {
            // Update last_seen in visitor_session table in Supabase (my own analytics tracking)
            await trackUserSession(authData.user.id);

            // Show success message
            showAlert('Login successful! Redirecting...', 'success');

            // Redirect after 1 second (gives time to read alert)
            setTimeout(() => {
                redirectToDashboard(authData.user);
            }, 1000);
        }

    // catch allows for better error debugging
    } catch (error) {
        console.error('Unexpected login error:', error);
        showAlert('An unexpected error occurred. Please try again.', 'error');

        // Make sure button is usable again after unexpected error
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
}

/**
 * Track user session for analytics: when they checked in, started at, last seen
 * Inserts a row into visitor_session table in Supabase.
 */
async function trackUserSession(userId) {
    try {
        // Insert new session record into visitor_session table
        const { data, error } = await supabaseClient
            .from('visitor_session')
            .insert([
                {
                    user_id: userId,
                    check_in: new Date().toISOString(),   // when they logged in
                    started_at: new Date().toISOString(), // when the session started
                    last_seen: new Date().toISOString()   // last active time at login
                }
            ]);

        // error handling for non-critical analytics (login still works even if this fails)
        if (error) {
            console.log('Session tracking error (non-critical):', error);
        } else {
            console.log('Session tracked successfully');
        }
    } catch (error) {
        console.log('Session tracking failed (non-critical):', error);
    }
}

/**
 * Redirect user to appropriate dashboard based on role
 * Talks to Supabase to get role of logging in user and then redirects to relevant screen.
 */
async function redirectToDashboard(user) {
    try {
        // Get user role from users table in Supabase, matching on user_id
        const { data: userData, error } = await supabaseClient
            .from('users')
            .select('role')
            .eq('user_id', user.id)
            .single(); // expect one row

        // Error handling: if role fetch fails, just send to normal user dashboard
        if (error) {
            console.error('Error fetching user role:', error);
            window.location.href = '../dashboards/user.html';
            return;
        }

        const role = userData.role;
        console.log('User role:', role);

        // Redirection based on role value stored in DB
        if (role === 'admin') {
            window.location.href = '../dashboards/admin.html';
        } else if (role === 'business') {
            window.location.href = '../dashboards/business.html';
        } else {
            // Default user dashboard if no special role or anything unexpected
            window.location.href = '../dashboards/user.html';
        }
    } catch (error) {
        // In case of any unexpected error, still redirect to basic user dashboard
        console.error('Redirect error:', error);
        window.location.href = '../dashboards/user.html';
    }
}

/**
 * Show alert messages in the alert container we made in login.html frontend
 * Used for success (green) and error (red) messages.
 */
function showAlert(message, type) {
    const alertContainer = document.getElementById('alertContainer');

    // Decide which CSS class to use based on type
    const alertClass = type === 'success' ? 'alert-success' : 'alert-error';

    // Inject alert HTML into container (template string makes this easy)
    alertContainer.innerHTML = `
        <div class="alert ${alertClass}">
            ${message}
        </div>
    `;

    // Scroll to top to ensure the user actually sees the alert
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Auto-remove error alerts after 5 seconds (success stays until redirect)
    if (type === 'error') {
        setTimeout(() => {
            alertContainer.innerHTML = '';
        }, 5000);
    }
}
