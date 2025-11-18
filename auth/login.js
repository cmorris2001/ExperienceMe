// Login Page JavaScript

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('Login page loaded');

    // Check if user is already logged in
    checkIfAlreadyLoggedIn();

    // Setup form submission
    const form = document.getElementById('loginForm');
    form.addEventListener('submit', handleLogin);
});

/**
 * Check if user is already authenticated
 */
async function checkIfAlreadyLoggedIn() {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();

        if (user) {
            console.log('User already logged in, redirecting...');
            redirectToDashboard(user);
        }
    } catch (error) {
        console.error('Error checking auth status:', error);
    }
}

/**
 * Login form submission
 */
async function handleLogin(e) {
    e.preventDefault();

    // Get form values from whatever the user entered in respective fields email and password
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;

    // Validate tht both inputs were entered
    if (!email || !password) {
        showAlert('Please enter both email and password', 'error');
        return;
    }

    // Disable submit button and show loading signing in
    const submitBtn = document.getElementById('submitBtn');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Signing In...';

    try {
        console.log('Attempting to sign in...');

        // Sign in with Supabase Auth
        const { data: authData, error: authError } = await supabaseClient.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (authError) {
            console.error('Login error:', authError);

            // Show user-friendly error messages such as wrong credentisls or confiming if email not done (This is pending not implemented yet)
            if (authError.message.includes('Invalid login credentials')) {
                showAlert('Invalid email or password. Please try again.', 'error');
            } else if (authError.message.includes('Email not confirmed')) {
                showAlert('Please verify your email address before logging in.', 'error');
            } else {
                showAlert(authError.message, 'error');
            }

            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
            return;
        }

        console.log('Login successful:', authData);

        if (authData.user) {
            // Update last_seen in visitor_session table in supabase
            await trackUserSession(authData.user.id);

            // Success!
            showAlert('Login successful! Redirecting...', 'success');

            // Redirect after 1 second
            setTimeout(() => {
                redirectToDashboard(authData.user);
            }, 1000);
        }
     // catch allows for better error debugging
    } catch (error) {
        console.error('Unexpected login error:', error);
        showAlert('An unexpected error occurred. Please try again.', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
}

/**
 * Track user session for analytics when they checked in, started at, last seen
 */
async function trackUserSession(userId) {
    try {
        const { data, error } = await supabaseClient
            .from('visitor_session')
            .insert([
                {
                    user_id: userId,
                    check_in: new Date().toISOString(),
                    started_at: new Date().toISOString(),
                    last_seen: new Date().toISOString()
                }
            ]);
        //error handling part
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
 * Redirect user to appropriate dashboard based on role so talks to supabase to get role of logging in user and then redirects to relevant screen based on this
 */
async function redirectToDashboard(user) {
    try {
        // Get user role from supabase
        const { data: userData, error } = await supabaseClient
            .from('users')
            .select('role')
            .eq('user_id', user.id)
            .single();
        // Error handling
        if (error) {
            console.error('Error fetching user role:', error);
            window.location.href = '../dashboards/user.html';
            return;
        }

        const role = userData.role;
        console.log('User role:', role);

        // Redirection based on role
        if (role === 'admin') {
            window.location.href = '../dashboards/admin.html';
        } else if (role === 'business') {
            window.location.href = '../dashboards/business.html';
        } else {
            window.location.href = '../dashboards/user.html';
        }
    } catch (error) {
        console.error('Redirect error:', error);
        window.location.href = '../dashboards/user.html';
    }
}

/**
 * Show alert messages in the alert container we made in lading.html frontend
 */
function showAlert(message, type) {
    const alertContainer = document.getElementById('alertContainer');
    const alertClass = type === 'success' ? 'alert-success' : 'alert-error';

    alertContainer.innerHTML = `
        <div class="alert ${alertClass}">
            ${message}
        </div>
    `;

    // Scroll to top to show alert
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Auto-remove error alerts after 5 seconds
    if (type === 'error') {
        setTimeout(() => {
            alertContainer.innerHTML = '';
        }, 5000);
    }
}