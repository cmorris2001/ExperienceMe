// Register Page JavaScript
// Handles checking if user is already logged in, registering new users with Supabase,
// creating user + business records, redirecting to dashboards, and showing alerts.

// Wait for DOM to be fully loaded and console debug checkpoint
document.addEventListener('DOMContentLoaded', () => {
    console.log('Register page loaded');

    // Check if user is already logged in (if yes, no need to register again)
    checkIfAlreadyLoggedIn();

    // Setup form submission handler for the registration form
    const form = document.getElementById('registerForm');
    form.addEventListener('submit', handleRegister);
});

/**
 * Check if user is already authenticated (using Supabase auth)
 * If they are logged in, redirect them instead of showing registration form.
 */
async function checkIfAlreadyLoggedIn() {
    try {
        // Supabase method to get currently logged in user
        const { data: { user } } = await supabaseClient.auth.getUser();

        if (user) {
            console.log('User already logged in, redirecting...');
            // Redirect based on role
            redirectToDashboard(user);
        }
    } catch (error) {
        console.error('Error checking auth status:', error);
    }
}

/**
 * Handle registration form submission
 * Validates inputs and creates account using Supabase Auth + my own tables.
 */
async function handleRegister(e) {
    e.preventDefault(); // stop page from refreshing on form submit

    // Get form values from input fields
    const fullName = document.getElementById('fullName').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const role = document.getElementById('role').value;

    // Validate passwords match or display error message
    if (password !== confirmPassword) {
        showAlert('Passwords do not match', 'error');
        return;
    }

    // Validate password length or display error message
    if (password.length < 6) {
        showAlert('Password must be at least 6 characters long', 'error');
        return;
    }

    // Disable submit button and show loading state text
    const submitBtn = document.getElementById('submitBtn');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating Account...';

    try {
        console.log('Starting registration process...');

        // Sign up with Supabase Authenticator
        // Uses Supabase auth table (managed by Supabase, not my own)
        const { data: authData, error: authError } = await supabaseClient.auth.signUp({
            email: email,
            password: password,
            options: {
                // Extra user data stored in auth metadata
                data: {
                    full_name: fullName,
                    role: role
                }
            }
        });

        // If error from Supabase Auth, log and show message
        if (authError) {
            console.error('Auth error:', authError);
            showAlert(authError.message, 'error');
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
            return;
        }

        console.log('Auth signup successful:', authData);

        // Create user record in my own Supabase "users" table
        if (authData.user) {
            const { data: userData, error: userError } = await supabaseClient
                .from('users')
                .insert([
                    {
                        user_id: authData.user.id, // link to Supabase auth user id
                        email: email,
                        full_name: fullName,
                        role: role,
                        is_active: true
                    }
                ])
                .select();

            if (userError) {
                console.error('User table error:', userError);
                // Auth account was created but profile insert failed
                showAlert('Account created but profile setup incomplete. Please contact support.', 'error');
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
                return;
            }

            console.log('User record created:', userData);

            // If role is business, also create a record in "business" table
            if (role === 'business') {
                const { data: businessData, error: businessError } = await supabaseClient
                    .from('business')
                    .insert([
                        {
                            user_id: authData.user.id,
                            // For now just using full name as basic business name
                            business_name: fullName + "'s Business",
                            business_email: email,
                            status: 'pending' // later can be approved/verified
                        }
                    ])
                    .select();

                // console debug in case anything goes wrong
                if (businessError) {
                    console.error('Business table error:', businessError);
                }

                console.log('Business record created:', businessData);
            }

            // Show success message in alert box created in register.html
            showAlert('Account created successfully! Redirecting...', 'success');

            // Redirect to dashboard after 2 seconds (gives time to read message)
            setTimeout(() => {
                redirectToDashboard(authData.user);
            }, 2000);
        }

        //debug in console if needed
    } catch (error) {
        console.error('Registration error:', error);
        showAlert('An unexpected error occurred. Please try again.', 'error');
        submitBtn.disabled = false;
        submitBtn.textContent = originalText;
    }
}

/**
 * Redirect user to appropriate dashboard based on role
 * Reads role from users table and sends them to admin / business / user dashboard.
 */
async function redirectToDashboard(user) {
    try {
        // Get user role from Supabase users table
        const { data: userData, error } = await supabaseClient
            .from('users')
            .select('role')
            .eq('user_id', user.id)
            .single(); // expect only one record

        // If something goes wrong, log and redirect to default user dashboard
        if (error) {
            console.error('Error fetching user role:', error);
            window.location.href = '../dashboards/user.html';
            return;
        }

        const role = userData.role;

        // Redirect based on role: admin, business or user
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
 * Show alert message in container
 * Used for both success + error messages at top of the form.
 */
function showAlert(message, type) {
    const alertContainer = document.getElementById('alertContainer');
    const alertClass = type === 'success' ? 'alert-success' : 'alert-error';

    // Inject alert HTML into the container (using template string)
    alertContainer.innerHTML = `
        <div class="alert ${alertClass}">
            ${message}
        </div>
    `;

    // Scroll to top to show alert (in case user is further down the page)
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // Auto-remove error alerts after 5 seconds (success can stay until redirect)
    if (type === 'error') {
        setTimeout(() => {
            alertContainer.innerHTML = '';
        }, 5000);
    }
}

/**
 * Real-time password confirmation validation for the user
 * If passwords don't match while typing, browser will show message before submit.
 */
document.getElementById('confirmPassword')?.addEventListener('input', function() {
    const password = document.getElementById('password').value;
    const confirmPassword = this.value;

    // Set custom validity message on confirmPassword field
    if (confirmPassword && password !== confirmPassword) {
        this.setCustomValidity('Passwords do not match');
    } else {
        this.setCustomValidity('');
    }
});

