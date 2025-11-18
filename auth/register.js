// Register Page JavaScript

// Wait for DOM to be fully loaded and console debug checkpoint
document.addEventListener('DOMContentLoaded', () => {
    console.log('Register page loaded');

    // Check if user is already logged in
    checkIfAlreadyLoggedIn();

    // Setup form submission
    const form = document.getElementById('registerForm');
    form.addEventListener('submit', handleRegister);
});

/**
 * Check if user is already authenticated talks to console for debugging
 */
async function checkIfAlreadyLoggedIn() {
    try {
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
 */
async function handleRegister(e) {
    e.preventDefault();

    // Get form values
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

    // Disable submit button and show loading state
    const submitBtn = document.getElementById('submitBtn');
    const originalText = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating Account...';

    try {
        console.log('Starting registration process...');

        //Sign up with Supabase Authenticator, talks to supabases hidden table for storing passwords
        const { data: authData, error: authError } = await supabaseClient.auth.signUp({
            email: email,
            password: password,
            options: {
                data: {
                    full_name: fullName,
                    role: role
                }
            }
        });
        // If error console debug
        if (authError) {
            console.error('Auth error:', authError);
            showAlert(authError.message, 'error');
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
            return;
        }

        console.log('Auth signup successful:', authData);

        // Create user record in supabase users table
        if (authData.user) {
            const { data: userData, error: userError } = await supabaseClient
                .from('users')
                .insert([
                    {
                        user_id: authData.user.id,
                        email: email,
                        full_name: fullName,
                        role: role,
                        is_active: true
                    }
                ])
                .select();

            if (userError) {
                console.error('User table error:', userError);
                // Auth was created but table insert failed debug in console
                showAlert('Account created but profile setup incomplete. Please contact support.', 'error');
                submitBtn.disabled = false;
                submitBtn.textContent = originalText;
                return;
            }

            console.log('User record created:', userData);

            // If business role, create business record in business table as this user has business
            if (role === 'business') {
                const { data: businessData, error: businessError } = await supabaseClient
                    .from('business')
                    .insert([
                        {
                            user_id: authData.user.id,
                            business_name: fullName + "'s Business",
                            business_email: email,
                            status: 'pending'
                        }
                    ])
                    .select();
                //console debug
                if (businessError) {
                    console.error('Business table error:', businessError);
                }

                console.log('Business record created:', businessData);
            }

            // Success in alert box created in register.html
            showAlert('Account created successfully! Redirecting...', 'success');

            // Redirect to dashboard after 2 seconds
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
 */
async function redirectToDashboard(user) {
    try {
        // Get user role from supabase
        const { data: userData, error } = await supabaseClient
            .from('users')
            .select('role')
            .eq('user_id', user.id)
            .single();

        if (error) {
            console.error('Error fetching user role:', error);
            window.location.href = '../dashboards/user.html';
            return;
        }

        const role = userData.role;

        // Redirect based on role admin, business or user
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

/**
 * Real-time password confirmation validation for the user so that if passswords dont match before they hit submit then it tells them
 */
document.getElementById('confirmPassword')?.addEventListener('input', function() {
    const password = document.getElementById('password').value;
    const confirmPassword = this.value;

    if (confirmPassword && password !== confirmPassword) {
        this.setCustomValidity('Passwords do not match');
    } else {
        this.setCustomValidity('');
    }
});

