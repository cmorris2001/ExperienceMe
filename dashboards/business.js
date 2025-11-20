// Business Dashboard JavaScript
// Handles business auth, loading their experiences, creating/editing/deleting experiences,
// image upload to Supabase Storage, filtering by status, and switching dashboard sections.

let currentUser = null;          // Supabase auth user
let currentBusiness = null;      // Matching record in "business" table
let experiences = [];            // All experiences owned by this business
let currentFilter = 'all';       // Which status tab is active (all/pending/etc.)
let uploadedImages = [];         // Store uploaded image files + preview URLs + upload state
let isEditMode = false;          // Are we editing an existing experience?
let editingExperienceId = null;  // If editing, which experience_id

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Business dashboard loaded');

    // Check authentication + load business record
    await checkAuth();

    // Load categories and counties for the create/edit form
    await loadFormData();

    // Load experiences for this business
    await loadExperiences();

    // Setup logout
    document.getElementById('logoutBtn').addEventListener('click', handleLogout);

    // Setup form submission (submit for approval)
    document.getElementById('createExperienceForm').addEventListener('submit', handleSubmitForApproval);

    // Setup image upload (dropzone + file input)
    setupImageUpload();

    // Show experiences section by default
    showSection('experiences');
});

/**
 * Check authentication
 * Makes sure user is logged in and has role = business.
 */
async function checkAuth() {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();

        if (!user) {
            // If not logged in, send to login page
            window.location.href = '../auth/login.html';
            return;
        }

        currentUser = user;

        // Get user record from users table
        const { data: userData } = await supabaseClient
            .from('users')
            .select('*')
            .eq('user_id', user.id)
            .single();

        // If user exists but is not business role, redirect them to their own dashboard
        if (userData && userData.role !== 'business') {
            alert('Access denied. Business account required.');
            window.location.href = `../dashboards/${userData.role}.html`;
            return;
        }

        // Get matching business record
        const { data: businessData } = await supabaseClient
            .from('business')
            .select('*')
            .eq('user_id', user.id)
            .single();

        if (businessData) {
            currentBusiness = businessData;
            displayUserInfo(userData, businessData);
        }

    } catch (error) {
        console.error('Auth error:', error);
        window.location.href = '../auth/login.html';
    }
}

/**
 * Display user + business info in the header and profile section.
 */
function displayUserInfo(userData, businessData) {
    document.getElementById('userInfo').innerHTML = `
        <p style="color: var(--text-secondary);">
            <strong>${businessData.business_name}</strong> • ${userData.email}
        </p>
    `;

    document.getElementById('businessInfo').innerHTML = `
        <div class="card">
            <h3>Business Information</h3>
            <p style="color: var(--text-secondary); margin-top: 1rem;">
                <strong>Business Name:</strong> ${businessData.business_name}<br>
                <strong>Email:</strong> ${businessData.business_email || userData.email}<br>
                <strong>Website:</strong> ${businessData.website_url || 'Not set'}<br>
                <strong>Status:</strong> <span class="status-badge status-${businessData.status}">${businessData.status}</span><br>
                <strong>Member Since:</strong> ${new Date(businessData.created_at).toLocaleDateString()}
            </p>
        </div>
    `;
}

/**
 * Load form data (categories and counties) from Supabase.
 */
async function loadFormData() {
    try {
        // Load categories from 'category' table
        const { data: categoriesData, error: catError } = await supabaseClient
            .from('category')
            .select('*')
            .order('category_name');

        if (catError) {
            console.error('Error loading categories:', catError);
            throw catError;
        }

        const categories = categoriesData || [];
        console.log('Categories loaded:', categories);

        // Populate category dropdown
        const categorySelect = document.getElementById('category');
        categorySelect.innerHTML = '<option value="">Select a category...</option>';
        categories.forEach(cat => {
            categorySelect.innerHTML += `<option value="${cat.category_id}">${cat.category_name}</option>`;
        });

        // Load counties from 'county' table
        const { data: countiesData, error: countyError } = await supabaseClient
            .from('county')
            .select('*')
            .order('county_id');

        if (countyError) {
            console.error('Error loading counties:', countyError);
            throw countyError;
        }

        const counties = countiesData || [];
        console.log('Counties loaded:', counties);

        // Populate county dropdown
        const countySelect = document.getElementById('county');
        countySelect.innerHTML = '<option value="">Select a county...</option>';
        counties.forEach(county => {
            countySelect.innerHTML += `<option value="${county.county_id}">${county.county_id}</option>`;
        });

        // If no counties found, show warning
        if (counties.length === 0) {
            console.warn('No counties found in database');
            showAlert('createAlert', 'Warning: No counties available. Please add counties to your database.', 'info');
        }

    } catch (error) {
        console.error('Error loading form data:', error);
        showAlert('createAlert', 'Error loading form data. Please refresh the page.', 'error');
    }
}

/**
 * Setup image upload functionality for dropzone + file input.
 */
function setupImageUpload() {
    const dropzone = document.getElementById('imageDropzone');
    const fileInput = document.getElementById('imageFileInput');

    // Click to upload => trigger hidden file input
    dropzone.addEventListener('click', () => {
        fileInput.click();
    });

    // File input change (when user selects files from dialog)
    fileInput.addEventListener('change', (e) => {
        handleFiles(e.target.files);
    });

    // Drag and drop styling + preventing default
    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.style.borderColor = 'var(--primary-color)';
        dropzone.style.background = 'rgba(0, 191, 99, 0.05)';
    });

    dropzone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropzone.style.borderColor = 'var(--border-color)';
        dropzone.style.background = 'transparent';
    });

    // Drop files into dropzone
    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.style.borderColor = 'var(--border-color)';
        dropzone.style.background = 'transparent';
        handleFiles(e.dataTransfer.files);
    });
}

/**
 * Handle file selection for image upload (validation + preview).
 */
function handleFiles(files) {
    const maxFiles = 5;
    const maxSize = 5 * 1024 * 1024; // 5MB

    // Check total count across already uploaded + new files
    if (uploadedImages.length + files.length > maxFiles) {
        showAlert('createAlert', `Maximum ${maxFiles} images allowed`, 'error');
        return;
    }

    // Process each file
    Array.from(files).forEach((file) => {
        // Validate file type
        if (!file.type.match('image/(jpeg|png|webp)')) {
            showAlert('createAlert', `${file.name} is not a supported format. Use JPG, PNG, or WebP.`, 'error');
            return;
        }

        // Validate file size
        if (file.size > maxSize) {
            showAlert('createAlert', `${file.name} is too large. Maximum size is 5MB.`, 'error');
            return;
        }

        // Add to uploaded images array
        const imageData = {
            file: file,
            preview: URL.createObjectURL(file), // local preview URL
            uploaded: false,                    // not sent to storage yet
            url: null                           // will later hold the public URL
        };

        uploadedImages.push(imageData);
    });

    // Display previews after adding images
    displayImagePreviews();
}

/**
 * Display image previews under the form.
 */
function displayImagePreviews() {
    const container = document.getElementById('imagePreviews');

    if (uploadedImages.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = uploadedImages.map((img, index) => `
        <div class="image-preview-item" data-index="${index}">
            <img src="${img.preview}" alt="Preview ${index + 1}">
            <div class="image-preview-overlay">
                ${index === 0 ? '<span class="primary-badge">Primary</span>' : ''}
                <button type="button" class="btn-preview-remove" onclick="removeImage(${index})">✕</button>
            </div>
            ${img.uploaded ? '<div class="upload-success">✓</div>' : ''}
        </div>
    `).join('');
}

/**
 * Remove image from preview + memory.
 */
function removeImage(index) {
    // Revoke the object URL to free memory
    if (uploadedImages[index].file) {
        URL.revokeObjectURL(uploadedImages[index].preview);
    }

    // Remove from array
    uploadedImages.splice(index, 1);

    // Update display
    displayImagePreviews();
}

/**
 * Upload images to Supabase Storage and return array of public URLs.
 */
async function uploadImagesToStorage() {
    if (uploadedImages.length === 0) {
        throw new Error('No images to upload');
    }

    const uploadProgress = document.getElementById('uploadProgress');
    uploadProgress.classList.remove('hidden');
    uploadProgress.innerHTML = '<p>Uploading images...</p>';

    const uploadedUrls = [];

    try {
        for (let i = 0; i < uploadedImages.length; i++) {
            const imageData = uploadedImages[i];

            // Skip if already uploaded (existing DB image when editing)
            if (imageData.uploaded && imageData.url) {
                uploadedUrls.push(imageData.url);
                continue;
            }

            // Create unique filename: businessId/timestamp_random.extension
            const timestamp = Date.now();
            const randomString = Math.random().toString(36).substring(7);
            const fileExt = imageData.file.name.split('.').pop();
            const fileName = `${currentBusiness.business_id}/${timestamp}_${randomString}.${fileExt}`;

            uploadProgress.innerHTML = `<p>Uploading image ${i + 1} of ${uploadedImages.length}...</p>`;

            // Upload to Supabase Storage bucket
            const { data, error } = await supabaseClient.storage
                .from('experience-images') // Bucket name in Supabase
                .upload(fileName, imageData.file, {
                    contentType: imageData.file.type,
                    cacheControl: '3600',
                    upsert: false
                });

            if (error) throw error;

            // Get public URL of uploaded file
            const { data: urlData } = supabaseClient.storage
                .from('experience-images')
                .getPublicUrl(fileName);

            imageData.uploaded = true;
            imageData.url = urlData.publicUrl;
            uploadedUrls.push(urlData.publicUrl);

            // Update preview to show "uploaded" check mark
            displayImagePreviews();
        }

        uploadProgress.innerHTML = '<p style="color: var(--success-color);">✓ All images uploaded successfully!</p>';
        setTimeout(() => {
            uploadProgress.classList.add('hidden');
        }, 2000);

        return uploadedUrls;

    } catch (error) {
        uploadProgress.innerHTML = `<p style="color: var(--danger-color);">Upload failed: ${error.message}</p>`;
        throw error;
    }
}

/**
 * Load experiences for current business from Supabase.
 */
async function loadExperiences() {
    if (!currentBusiness) return;

    try {
        // Load experiences for this business user
        const { data, error } = await supabaseClient
            .from('experiences')
            .select('*')
            .eq('business_id', currentBusiness.business_id)
            .order('created_at', { ascending: false });

        if (error) throw error;

        experiences = data || [];

        // Load images for each experience
        for (let exp of experiences) {
            const { data: images } = await supabaseClient
                .from('image')
                .select('*')
                .eq('experience_id', exp.experience_id)
                .order('display_order');

            exp.images = images || [];
            // Set primary image for easy access
            exp.primaryImage = images?.find(img => img.is_primary)?.image_url ||
                               images?.[0]?.image_url || null;
        }

        displayExperiences();

    } catch (error) {
        console.error('Error loading experiences:', error);
        document.getElementById('experiencesList').innerHTML = `
            <div class="alert alert-error">Error loading experiences: ${error.message}</div>
        `;
    }
}

/**
 * Display experiences based on current filter (all/pending/etc.).
 */
function displayExperiences() {
    const container = document.getElementById('experiencesList');

    // Filter experiences by status
    let filtered = experiences;
    if (currentFilter !== 'all') {
        filtered = experiences.filter(exp => exp.status === currentFilter);
    }

    // If no experiences match
    if (filtered.length === 0) {
        const message = currentFilter === 'all'
            ? "You haven't created any experiences yet. Click 'Create New Experience' to get started!"
            : `No ${currentFilter} experiences found.`;

        container.innerHTML = `
            <div style="text-align: center; padding: 3rem; color: var(--text-secondary);">
                <p>${message}</p>
            </div>
        `;
        return;
    }

    // Render experiences in grid layout
    container.innerHTML = `
        <div class="experiences-grid">
            ${filtered.map(exp => createExperienceCard(exp)).join('')}
        </div>
    `;
}

/**
 * Create experience card HTML (for the grid).
 */
function createExperienceCard(experience) {
    // Use primaryImage loaded earlier, fallback to placeholder
    const primaryImage = experience.primaryImage || 'https://via.placeholder.com/400x250?text=No+Image';

    const statusClass = `status-${experience.status}`;
    const statusText = experience.status.charAt(0).toUpperCase() + experience.status.slice(1);

    const priceDisplay = experience.min_price && experience.max_price
        ? `€${experience.min_price} - €${experience.max_price}`
        : experience.min_price
        ? `From €${experience.min_price}`
        : 'Price TBD';

    // County is stored as TEXT in the experiences table
    const countyDisplay = experience.county || 'Location TBD';

    return `
        <div class="experience-card">
            <div class="experience-image" style="background-image: url('${primaryImage}')">
                <span class="status-badge ${statusClass}">${statusText}</span>
            </div>
            <div class="experience-content">
                <h3>${experience.title}</h3>
                <p class="experience-meta">
                    ${countyDisplay}
                </p>
                <p class="experience-description">${truncateText(experience.event_description, 120)}</p>
                <div class="experience-footer">
                    <span class="experience-price">${priceDisplay}</span>
                    <div class="experience-actions">
                        <button class="btn-icon" onclick="editExperience('${experience.experience_id}')" title="Edit">
                            ✏️
                        </button>
                        <button class="btn-icon" onclick="deleteExperience('${experience.experience_id}')" title="Delete">
                            🗑️
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

/**
 * Truncate text helper (for descriptions).
 */
function truncateText(text, maxLength) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

/**
 * Filter experiences by status and update active tab.
 */
function filterExperiences(status) {
    currentFilter = status;

    // Update active tab based on the clicked button
    document.querySelectorAll('.status-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    // event.target is the clicked button here
    event.target.classList.add('active');

    displayExperiences();
}

/**
 * Show different dashboard sections (experiences / create / profile).
 */
function showSection(section) {
    // Hide all sections
    document.querySelectorAll('.dashboard-section').forEach(sec => {
        sec.classList.add('hidden');
    });

    // Remove highlight from nav links
    document.querySelectorAll('.nav-links a').forEach(link => {
        link.style.color = '';
    });

    // Show selected section
    document.getElementById(`${section}Section`).classList.remove('hidden');

    // Highlight active nav link
    const navLink = document.getElementById(`nav${section.charAt(0).toUpperCase() + section.slice(1)}`);
    if (navLink) {
        navLink.style.color = 'var(--primary-color)';
    }

    // Reset form when going to create section (only if not editing)
    if (section === 'create' && !isEditMode) {
        resetForm();
    }
}

/**
 * Save as draft (wrapper around submitExperience with draft status).
 */
async function saveDraft() {
    await submitExperience('draft');
}

/**
 * Handle submit for approval (form submit).
 */
async function handleSubmitForApproval(e) {
    e.preventDefault();
    await submitExperience('pending');
}

/**
 * Submit experience (either insert new or update existing).
 * status = 'draft' or 'pending'.
 */
async function submitExperience(status) {
    if (!currentBusiness) {
        console.error('ERROR: currentBusiness is null or undefined');
        showAlert('createAlert', 'Business information not found', 'error');
        return;
    }

    console.log('Starting experience submission...');
    console.log('Current business:', currentBusiness);
    console.log('Status:', status);

    try {
        // Get form values
        const title = document.getElementById('title').value.trim();
        const description = document.getElementById('description').value.trim();
        const categoryId = document.getElementById('category').value;
        const countyId = document.getElementById('county').value;
        const minPrice = document.getElementById('minPrice').value || null;
        const maxPrice = document.getElementById('maxPrice').value || null;
        const priceTier = document.getElementById('priceTier').value || null;

        console.log('Form values:', {
            title,
            description: description.substring(0, 50) + '...',
            categoryId,
            countyId,
            minPrice,
            maxPrice,
            priceTier
        });

        // Validation for required fields
        if (!title || !description) {
            console.error('Validation failed: title or description missing');
            showAlert('createAlert', 'Please fill in all required fields', 'error');
            return;
        }

        if (!categoryId || !countyId) {
            console.error('Validation failed: category or county not selected');
            showAlert('createAlert', 'Please select a category and county', 'error');
            return;
        }

        if (uploadedImages.length === 0) {
            console.error('Validation failed: no images');
            showAlert('createAlert', 'Please upload at least one image', 'error');
            return;
        }

        // Show loading info
        showAlert('createAlert', 'Processing...', 'info');

        // Upload images to storage (if not already)
        console.log('Uploading images to storage...');
        let imageUrls;
        try {
            imageUrls = await uploadImagesToStorage();
            console.log('Images uploaded successfully:', imageUrls);
        } catch (uploadError) {
            console.error('Image upload error:', uploadError);
            showAlert('createAlert', `Image upload failed: ${uploadError.message}`, 'error');
            return;
        }

        // Get the county NAME from dropdown (stored as TEXT in experiences table)
        const countySelect = document.getElementById('county');
        const countyName = countySelect.options[countySelect.selectedIndex].text;

        // Prepare row for experiences table (images stored separately)
        const experienceData = {
            business_id: currentBusiness.business_id,
            title: title,
            event_description: description,
            county: countyName,  // store county name, not id
            min_price: minPrice ? parseFloat(minPrice) : null,
            max_price: maxPrice ? parseFloat(maxPrice) : null,
            price_tier: priceTier,  // maps to price_code/price_tier depending on schema
            status: status
        };

        console.log('Experience data to insert:', experienceData);

        let result;
        if (isEditMode && editingExperienceId) {
            // Update existing experience
            console.log('Updating existing experience:', editingExperienceId);
            experienceData.updated_at = new Date().toISOString();

            const { data, error } = await supabaseClient
                .from('experiences')
                .update(experienceData)
                .eq('experience_id', editingExperienceId)
                .select()
                .single();

            if (error) {
                console.error('Update error details:', {
                    message: error.message,
                    details: error.details,
                    hint: error.hint,
                    code: error.code
                });
                throw error;
            }

            result = data;
            console.log('Update successful:', result);
        } else {
            // Insert new experience
            console.log('Inserting new experience...');
            experienceData.created_at = new Date().toISOString();

            const { data, error } = await supabaseClient
                .from('experiences')
                .insert([experienceData])
                .select()
                .single();

            if (error) {
                console.error('Insert error details:', {
                    message: error.message,
                    details: error.details,
                    hint: error.hint,
                    code: error.code,
                    fullError: error
                });

                // Provide more helpful error messages based on Postgres error codes
                if (error.code === '23503') {
                    showAlert('createAlert', 'Database error: Invalid category, county, or business ID. Please refresh and try again.', 'error');
                    return;
                }

                if (error.code === '23502') {
                    showAlert('createAlert', 'Database error: Missing required field. Please fill in all required fields.', 'error');
                    return;
                }

                if (error.code === '42501') {
                    showAlert('createAlert', 'Permission denied. Please contact support if this persists.', 'error');
                    return;
                }

                throw error;
            }

            result = data;
            console.log('Insert successful:', result);

            // Insert relationship into experience_category junction table
            console.log('Inserting category relationship...');
            const { error: categoryError } = await supabaseClient
                .from('experience_category')
                .insert([{
                    experience_id: result.experience_id,
                    category_id: categoryId
                }]);

            if (categoryError) {
                console.error('Category insert error:', categoryError);
                // Do not throw here - experience itself was created
            } else {
                console.log('Category relationship created');
            }

            // Insert images into image table
            console.log('Inserting images into image table...');
            const imageRecords = imageUrls.map((url, index) => ({
                experience_id: result.experience_id,
                image_url: url,
                is_primary: index === 0,  // first image is primary
                display_order: index
            }));

            const { error: imageError } = await supabaseClient
                .from('image')
                .insert(imageRecords);

            if (imageError) {
                console.error('Image insert error:', imageError);
                // Again, don't throw since experience exists
            } else {
                console.log('Images inserted successfully');
            }
        }

        // Build success message based on mode + status
        const successMessage = isEditMode
            ? 'Experience updated successfully!'
            : status === 'draft'
            ? 'Experience saved as draft!'
            : 'Experience submitted for approval!';

        showAlert('createAlert', successMessage, 'success');

        // Reset form and reload experiences
        setTimeout(() => {
            resetForm();
            loadExperiences();
            showSection('experiences');
        }, 1500);

    } catch (error) {
        console.error('Error saving experience:', error);
        console.error('Error type:', error.constructor.name);
        console.error('Error stack:', error.stack);

        // Build user-friendly message
        let errorMessage = error.message || 'Unknown error occurred';

        if (errorMessage.includes('Storage')) {
            errorMessage = 'Image upload failed. Please check your images and try again.';
        } else if (errorMessage.includes('foreign key')) {
            errorMessage = 'Invalid data relationship. Please refresh the page and try again.';
        } else if (errorMessage.includes('violates')) {
            errorMessage = 'Database validation error: ' + errorMessage;
        }

        showAlert('createAlert', `Error: ${errorMessage}`, 'error');
    }
}

/**
 * Reset form back to clean state (for new experience).
 */
function resetForm() {
    document.getElementById('createExperienceForm').reset();

    // Clear uploaded images and revoke previews
    uploadedImages.forEach(img => {
        if (img.file) {
            URL.revokeObjectURL(img.preview);
        }
    });
    uploadedImages = [];

    // Clear previews UI
    displayImagePreviews();

    // Clear alerts
    document.getElementById('createAlert').innerHTML = '';
    document.getElementById('uploadProgress').classList.add('hidden');

    // Reset edit mode flags
    isEditMode = false;
    editingExperienceId = null;

    // Reset form submit handler (still using handleSubmitForApproval)
    const form = document.getElementById('createExperienceForm');
    form.onsubmit = handleSubmitForApproval;
    form.querySelector('.btn-primary').textContent = 'Submit for Approval';
}

/**
 * Edit experience: load its data into the form and switch to edit mode.
 */
async function editExperience(experienceId) {
    try {
        // Find experience in local array
        const experience = experiences.find(exp => exp.experience_id === experienceId);
        if (!experience) return;

        // Enable edit mode
        isEditMode = true;
        editingExperienceId = experienceId;

        // Fill form fields with existing data
        document.getElementById('title').value = experience.title;
        document.getElementById('description').value = experience.event_description;

        // Load category from junction table
        const { data: expCategory } = await supabaseClient
            .from('experience_category')
            .select('category_id')
            .eq('experience_id', experienceId)
            .single();

        if (expCategory) {
            document.getElementById('category').value = expCategory.category_id;
        }

        // County is stored as text; find matching option in dropdown
        const countySelect = document.getElementById('county');
        for (let i = 0; i < countySelect.options.length; i++) {
            if (countySelect.options[i].text === experience.county) {
                countySelect.selectedIndex = i;
                break;
            }
        }

        document.getElementById('minPrice').value = experience.min_price || '';
        document.getElementById('maxPrice').value = experience.max_price || '';
        document.getElementById('priceTier').value = experience.price_tier || '';

        // Load existing images into uploadedImages array
        uploadedImages = [];
        if (experience.images && experience.images.length > 0) {
            experience.images.forEach(img => {
                uploadedImages.push({
                    file: null,             // existing image, no local file
                    preview: img.image_url, // use URL directly
                    uploaded: true,         // already uploaded
                    url: img.image_url,
                    imageId: img.image_id   // keep track of DB id if needed
                });
            });
            displayImagePreviews();
        }

        // Change button text to indicate update, not create
        const form = document.getElementById('createExperienceForm');
        form.querySelector('.btn-primary').textContent = 'Update Experience';

        // Show create section in "edit" mode
        showSection('create');
        showAlert('createAlert', 'Editing experience - make your changes and click Update', 'info');

    } catch (error) {
        console.error('Error loading experience for edit:', error);
        alert('Error loading experience');
    }
}

/**
 * Delete experience (and try to remove its images from storage).
 */
async function deleteExperience(experienceId) {
    if (!confirm('Are you sure you want to delete this experience? This action cannot be undone.')) {
        return;
    }

    try {
        // Get experience from local array, mainly to find image URLs
        const experience = experiences.find(exp => exp.experience_id === experienceId);

        // Delete images from storage (legacy logic using image_urls if present)
        if (experience && experience.image_urls && experience.image_urls.length > 0) {
            for (const url of experience.image_urls) {
                try {
                    // Extract file path from full public URL
                    const urlParts = url.split('/experience-images/');
                    if (urlParts.length > 1) {
                        const filePath = urlParts[1].split('?')[0]; // Remove query params
                        await supabaseClient.storage
                            .from('experience-images')
                            .remove([filePath]);
                    }
                } catch (imgError) {
                    console.error('Error deleting image:', imgError);
                }
            }
        }

        // Delete experience row from experiences table
        const { error } = await supabaseClient
            .from('experiences')
            .delete()
            .eq('experience_id', experienceId);

        if (error) throw error;

        // Reload refreshed list
        await loadExperiences();

        alert('Experience deleted successfully');

    } catch (error) {
        console.error('Error deleting experience:', error);
        alert(`Error deleting experience: ${error.message}`);
    }
}

/**
 * Show alert message inside a given container.
 * elementId is the container DIV id (e.g. "createAlert").
 */
function showAlert(elementId, message, type) {
    const alertDiv = document.getElementById(elementId);
    alertDiv.innerHTML = `
        <div class="alert alert-${type}">
            ${message}
        </div>
    `;

    // Auto-hide success messages after a short delay
    if (type === 'success') {
        setTimeout(() => {
            alertDiv.innerHTML = '';
        }, 3000);
    }
}

/**
 * Handle logout using Supabase auth.
 */
async function handleLogout() {
    try {
        await supabaseClient.auth.signOut();
        window.location.href = '../landing.html';
    } catch (error) {
        console.error('Logout error:', error);
        alert('Error logging out');
    }
}
