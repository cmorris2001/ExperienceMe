// Business Dashboard JavaScript
// Handles business auth, loading their experiences, creating/editing/deleting experiences,
// image upload to Supabase Storage, filtering by status, switching sections,
// and updating business profile (website/location/description/logo).

let currentUser = null;
let currentUserData = null;      // row from public.users
let currentBusiness = null;      // row from public.business

let experiences = [];
let currentFilter = 'all';

let uploadedImages = [];         // { file|null, preview, uploaded, url, imageId?, isPrimary? }
let isEditMode = false;
let editingExperienceId = null;

let isSubmitting = false;        // prevents duplicate experience submits
let isSavingProfile = false;     // prevents duplicate profile saves

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', async () => {
    console.log('Business dashboard loaded');

    await checkAuth();
    await loadFormData();
    await loadExperiences();

    document.getElementById('logoutBtn').addEventListener('click', handleLogout);

    // Experience form submit (ONLY ONE handler)
    document.getElementById('createExperienceForm').addEventListener('submit', handleSubmitForApproval);

    // Business profile form submit (NEW)
    const profileForm = document.getElementById('businessProfileForm');
    if (profileForm) {
        profileForm.addEventListener('submit', handleBusinessProfileSave);
    }

    // Populate profile form inputs from DB (NEW)
    populateBusinessProfileForm();

    setupImageUpload();
    showSection('experiences');
});

/**
 * Check authentication
 */
async function checkAuth() {
    try {
        const { data: { user } } = await supabaseClient.auth.getUser();

        if (!user) {
            window.location.href = '../auth/login.html';
            return;
        }

        currentUser = user;

        const { data: userData, error: userErr } = await supabaseClient
            .from('users')
            .select('*')
            .eq('user_id', user.id)
            .single();

        if (userErr) throw userErr;

        currentUserData = userData;

        if (userData && userData.role !== 'business') {
            alert('Access denied. Business account required.');
            window.location.href = `../dashboards/${userData.role}.html`;
            return;
        }

        const { data: businessData, error: bizErr } = await supabaseClient
            .from('business')
            .select('*')
            .eq('user_id', user.id)
            .single();

        if (bizErr) throw bizErr;

        if (businessData) {
            currentBusiness = businessData;
            displayUserInfo(currentUserData, currentBusiness);
        }

    } catch (error) {
        console.error('Auth error:', error);
        window.location.href = '../auth/login.html';
    }
}

/**
 * Display user + business info
 */
function displayUserInfo(userData, businessData) {
    document.getElementById('userInfo').innerHTML = `
        <p style="color: var(--text-secondary);">
            <strong>${businessData.business_name}</strong> • ${userData.email}
        </p>
    `;

    const logoHtml = businessData.business_image_url
        ? `<div style="margin-top:1rem;">
                <img src="${businessData.business_image_url}" alt="Business logo" style="max-width:120px;border-radius:12px;border:1px solid var(--border-color);">
           </div>`
        : '';

    document.getElementById('businessInfo').innerHTML = `
        <div class="card">
            <h3>Business Information</h3>
            <p style="color: var(--text-secondary); margin-top: 1rem;">
                <strong>Business Name:</strong> ${businessData.business_name}<br>
                <strong>Email:</strong> ${businessData.business_email || userData.email}<br>
                <strong>Website:</strong> ${businessData.website_url || 'Not set'}<br>
                <strong>Location:</strong> ${businessData.location_text || 'Not set'}<br>
                <strong>Description:</strong> ${businessData.business_description || 'Not set'}<br>
                <strong>Status:</strong> <span class="status-badge status-${businessData.status}">${businessData.status}</span><br>
                <strong>Member Since:</strong> ${businessData.created_at ? new Date(businessData.created_at).toLocaleDateString() : '—'}
            </p>
            ${logoHtml}
        </div>
    `;
}

/**
 * Populate business profile form with DB values (NEW)
 */
function populateBusinessProfileForm() {
    if (!currentBusiness) return;

    const website = document.getElementById('businessWebsiteUrl');
    const loc = document.getElementById('businessLocationText');
    const desc = document.getElementById('businessDescription');

    if (website) website.value = currentBusiness.website_url || '';
    if (loc) loc.value = currentBusiness.location_text || '';
    if (desc) desc.value = currentBusiness.business_description || '';
}

/**
 * Save business profile to Supabase (NEW)
 */
async function handleBusinessProfileSave(e) {
    e.preventDefault();

    if (!currentBusiness) {
        showAlert('profileAlert', 'Business record not found.', 'error');
        return;
    }

    if (isSavingProfile) return;
    isSavingProfile = true;

    try {
        showAlert('profileAlert', 'Saving profile...', 'info');

        let website_url = document.getElementById('businessWebsiteUrl')?.value.trim() || null;
        const location_text = document.getElementById('businessLocationText')?.value.trim() || null;
        const business_description = document.getElementById('businessDescription')?.value.trim() || null;

        // normalize website URL
        if (website_url && !website_url.startsWith('http://') && !website_url.startsWith('https://')) {
            website_url = `https://${website_url}`;
        }

        // optional logo upload
        const logoFile = document.getElementById('businessLogoInput')?.files?.[0] || null;
        let business_image_url = currentBusiness.business_image_url || null;

        if (logoFile) {
            const maxSize = 5 * 1024 * 1024;

            if (!logoFile.type.match('image/(jpeg|png|webp)')) {
                showAlert('profileAlert', 'Logo must be JPG, PNG, or WebP.', 'error');
                return;
            }
            if (logoFile.size > maxSize) {
                showAlert('profileAlert', 'Logo too large. Max 5MB.', 'error');
                return;
            }

            // Upload logo into existing bucket to avoid extra storage/RLS surprises
            const ext = logoFile.name.split('.').pop();
            const path = `business-logos/${currentBusiness.business_id}/logo_${Date.now()}.${ext}`;

            const { error: upErr } = await supabaseClient.storage
                .from('experience-images')
                .upload(path, logoFile, {
                    contentType: logoFile.type,
                    cacheControl: '3600',
                    upsert: true
                });

            if (upErr) throw upErr;

            const { data: urlData } = supabaseClient.storage
                .from('experience-images')
                .getPublicUrl(path);

            business_image_url = urlData.publicUrl;
        }

        const payload = {
            website_url,
            location_text,
            business_description,
            business_image_url,
            updated_at: new Date().toISOString()
        };

        const { data, error } = await supabaseClient
            .from('business')
            .update(payload)
            .eq('business_id', currentBusiness.business_id)
            .select('*')
            .single();

        if (error) throw error;

        currentBusiness = data;

        // update UI
        displayUserInfo(currentUserData, currentBusiness);
        populateBusinessProfileForm();

        showAlert('profileAlert', '✅ Profile updated!', 'success');

    } catch (err) {
        console.error('Profile save error:', err);
        showAlert('profileAlert', `Error saving profile: ${err.message}`, 'error');
    } finally {
        isSavingProfile = false;
    }
}

/**
 * Load form data (categories and counties)
 */
async function loadFormData() {
    try {
        const { data: categoriesData, error: catError } = await supabaseClient
            .from('category')
            .select('*')
            .order('category_name');

        if (catError) throw catError;

        const categorySelect = document.getElementById('category');
        categorySelect.innerHTML = '<option value="">Select a category...</option>';
        (categoriesData || []).forEach(cat => {
            categorySelect.innerHTML += `<option value="${cat.category_id}">${cat.category_name}</option>`;
        });

        const { data: countiesData, error: countyError } = await supabaseClient
            .from('county')
            .select('*')
            .order('county_id');

        if (countyError) throw countyError;

        const countySelect = document.getElementById('county');
        countySelect.innerHTML = '<option value="">Select a county...</option>';
        (countiesData || []).forEach(county => {
            countySelect.innerHTML += `<option value="${county.county_id}">${county.county_id}</option>`;
        });

    } catch (error) {
        console.error('Error loading form data:', error);
        showAlert('createAlert', 'Error loading form data. Please refresh the page.', 'error');
    }
}

/**
 * Setup image upload
 */
function setupImageUpload() {
    const dropzone = document.getElementById('imageDropzone');
    const fileInput = document.getElementById('imageFileInput');

    dropzone.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
        handleFiles(e.target.files);
        fileInput.value = ''; // allow re-selecting same file
    });

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

    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.style.borderColor = 'var(--border-color)';
        dropzone.style.background = 'transparent';
        handleFiles(e.dataTransfer.files);
    });
}

/**
 * Handle file selection
 */
function handleFiles(files) {
    const maxFiles = 5;
    const maxSize = 5 * 1024 * 1024;

    if (uploadedImages.length + files.length > maxFiles) {
        showAlert('createAlert', `Maximum ${maxFiles} images allowed`, 'error');
        return;
    }

    Array.from(files).forEach((file) => {
        if (!file.type.match('image/(jpeg|png|webp)')) {
            showAlert('createAlert', `${file.name} is not a supported format. Use JPG, PNG, or WebP.`, 'error');
            return;
        }
        if (file.size > maxSize) {
            showAlert('createAlert', `${file.name} is too large. Maximum size is 5MB.`, 'error');
            return;
        }

        uploadedImages.push({
            file,
            preview: URL.createObjectURL(file),
            uploaded: false,
            url: null,
            isPrimary: false
        });
    });

    if (!uploadedImages.some(i => i.isPrimary) && uploadedImages.length) {
        uploadedImages[0].isPrimary = true;
    }

    displayImagePreviews();
}

function setPrimaryImage(index) {
    uploadedImages.forEach((img, i) => img.isPrimary = (i === index));
    displayImagePreviews();
}

function displayImagePreviews() {
    const container = document.getElementById('imagePreviews');

    if (uploadedImages.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = uploadedImages.map((img, index) => `
        <div class="image-preview-item" data-index="${index}">
            <img src="${img.preview}" alt="Preview ${index + 1}">
            <div class="image-preview-overlay" style="display:flex;gap:0.5rem;align-items:center;justify-content:space-between;">
                <div>
                    ${img.isPrimary ? '<span class="primary-badge">Primary</span>' : ''}
                </div>
                <div style="display:flex;gap:0.5rem;">
                    ${!img.isPrimary ? `<button type="button" class="btn btn-secondary" style="padding:0.25rem 0.5rem;font-size:0.8rem;" onclick="setPrimaryImage(${index})">Make Primary</button>` : ''}
                    <button type="button" class="btn-preview-remove" onclick="removeImage(${index})">✕</button>
                </div>
            </div>
            ${img.uploaded ? '<div class="upload-success">✓</div>' : ''}
        </div>
    `).join('');
}

function removeImage(index) {
    if (uploadedImages[index]?.file) {
        URL.revokeObjectURL(uploadedImages[index].preview);
    }
    uploadedImages.splice(index, 1);

    if (uploadedImages.length && !uploadedImages.some(i => i.isPrimary)) {
        uploadedImages[0].isPrimary = true;
    }

    displayImagePreviews();
}

/**
 * Upload images to Storage; returns URLs in display order with primary first
 */
async function uploadImagesToStorage() {
    if (uploadedImages.length === 0) throw new Error('No images to upload');

    const uploadProgress = document.getElementById('uploadProgress');
    uploadProgress.classList.remove('hidden');
    uploadProgress.innerHTML = '<p>Uploading images...</p>';

    const ordered = [
        ...uploadedImages.filter(i => i.isPrimary),
        ...uploadedImages.filter(i => !i.isPrimary)
    ];

    const uploadedUrls = [];

    try {
        for (let i = 0; i < ordered.length; i++) {
            const imageData = ordered[i];

            if (imageData.uploaded && imageData.url) {
                uploadedUrls.push(imageData.url);
                continue;
            }

            const timestamp = Date.now();
            const randomString = Math.random().toString(36).substring(7);
            const fileExt = imageData.file.name.split('.').pop();
            const fileName = `${currentBusiness.business_id}/${timestamp}_${randomString}.${fileExt}`;

            uploadProgress.innerHTML = `<p>Uploading image ${i + 1} of ${ordered.length}...</p>`;

            const { error } = await supabaseClient.storage
                .from('experience-images')
                .upload(fileName, imageData.file, {
                    contentType: imageData.file.type,
                    cacheControl: '3600',
                    upsert: false
                });

            if (error) throw error;

            const { data: urlData } = supabaseClient.storage
                .from('experience-images')
                .getPublicUrl(fileName);

            imageData.uploaded = true;
            imageData.url = urlData.publicUrl;

            uploadedUrls.push(urlData.publicUrl);
            displayImagePreviews();
        }

        uploadProgress.innerHTML = '<p style="color: var(--success-color);">✓ All images uploaded successfully!</p>';
        setTimeout(() => uploadProgress.classList.add('hidden'), 2000);

        return uploadedUrls;

    } catch (error) {
        uploadProgress.innerHTML = `<p style="color: var(--danger-color);">Upload failed: ${error.message}</p>`;
        throw error;
    }
}

/**
 * Load experiences
 */
async function loadExperiences() {
    if (!currentBusiness) return;

    try {
        const { data, error } = await supabaseClient
            .from('experiences')
            .select('*')
            .eq('business_id', currentBusiness.business_id)
            .order('created_at', { ascending: false });

        if (error) throw error;

        experiences = data || [];

        for (let exp of experiences) {
            const { data: images } = await supabaseClient
                .from('image')
                .select('*')
                .eq('experience_id', exp.experience_id)
                .order('display_order');

            exp.images = images || [];
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
 * Display experiences
 */
function displayExperiences() {
    const container = document.getElementById('experiencesList');

    let filtered = experiences;
    if (currentFilter !== 'all') {
        filtered = experiences.filter(exp => exp.status === currentFilter);
    }

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

    container.innerHTML = `
        <div class="experiences-grid">
            ${filtered.map(exp => createExperienceCard(exp)).join('')}
        </div>
    `;
}

/**
 * Card HTML
 */
function createExperienceCard(experience) {
    const primaryImage = experience.primaryImage || 'https://via.placeholder.com/400x250?text=No+Image';

    const statusClass = `status-${experience.status}`;
    const statusText = experience.status.charAt(0).toUpperCase() + experience.status.slice(1);

    const priceDisplay = experience.min_price && experience.max_price
        ? `€${experience.min_price} - €${experience.max_price}`
        : experience.min_price
        ? `From €${experience.min_price}`
        : 'Price TBD';

    const countyDisplay = experience.county || 'Location TBD';

    return `
        <div class="experience-card">
            <div class="experience-image" style="background-image: url('${primaryImage}')">
                <span class="status-badge ${statusClass}">${statusText}</span>
            </div>
            <div class="experience-content">
                <h3>${experience.title}</h3>
                <p class="experience-meta">${countyDisplay}</p>
                <p class="experience-description">${truncateText(experience.short_description || experience.event_description, 120)}</p>
                <div class="experience-footer">
                    <span class="experience-price">${priceDisplay}</span>
                    <div class="experience-actions">
                        <button class="btn-icon" onclick="editExperience('${experience.experience_id}')" title="Edit">✏️</button>
                        <button class="btn-icon" onclick="deleteExperience('${experience.experience_id}')" title="Delete">🗑️</button>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function truncateText(text, maxLength) {
    if (!text) return '';
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength) + '...';
}

/**
 * Filter experiences
 */
function filterExperiences(status, e) {
    currentFilter = status;

    document.querySelectorAll('.status-tab').forEach(tab => tab.classList.remove('active'));
    if (e?.target) e.target.classList.add('active');

    displayExperiences();
}

/**
 * Show section
 */
function showSection(section) {
    document.querySelectorAll('.dashboard-section').forEach(sec => sec.classList.add('hidden'));
    document.querySelectorAll('.nav-links a').forEach(link => link.style.color = '');

    document.getElementById(`${section}Section`).classList.remove('hidden');

    const navLink = document.getElementById(`nav${section.charAt(0).toUpperCase() + section.slice(1)}`);
    if (navLink) navLink.style.color = 'var(--primary-color)';

    if (section === 'create' && !isEditMode) resetForm();
}

/**
 * Save draft
 */
async function saveDraft() {
    await submitExperience('draft');
}

/**
 * Submit pending approval
 */
async function handleSubmitForApproval(e) {
    e.preventDefault();
    await submitExperience('pending');
}

/**
 * Submit experience (insert or update)
 */
async function submitExperience(status) {
    if (!currentBusiness) {
        showAlert('createAlert', 'Business information not found', 'error');
        return;
    }

    if (isSubmitting) return; // ✅ prevents duplicate inserts
    isSubmitting = true;

    try {
        const title = document.getElementById('title').value.trim();
        const shortDescription = document.getElementById('shortDescription').value.trim();
        const description = document.getElementById('description').value.trim();

        const bookingUrlRaw = document.getElementById('bookingUrl').value.trim();
        const booking_url = bookingUrlRaw || null;

        const durationRaw = document.getElementById('durationMinutes').value;
        const duration_minutes = durationRaw ? parseInt(durationRaw, 10) : null;

        const what_you_do = document.getElementById('whatYouDo').value.trim() || null;
        const whats_included = document.getElementById('whatsIncluded').value.trim() || null;

        const categoryId = document.getElementById('category').value;
        const countyId = document.getElementById('county').value;

        const minPrice = document.getElementById('minPrice').value || null;
        const maxPrice = document.getElementById('maxPrice').value || null;
        const price_tier = document.getElementById('priceTier').value || null;

        if (!title || !shortDescription || !description) {
            showAlert('createAlert', 'Please fill in all required fields', 'error');
            return;
        }
        if (!categoryId || !countyId) {
            showAlert('createAlert', 'Please select a category and county', 'error');
            return;
        }
        if (uploadedImages.length === 0) {
            showAlert('createAlert', 'Please upload at least one image', 'error');
            return;
        }

        showAlert('createAlert', 'Processing...', 'info');

        const imageUrls = await uploadImagesToStorage();

        const countySelect = document.getElementById('county');
        const countyName = countySelect.options[countySelect.selectedIndex].text;

        const experienceData = {
            business_id: currentBusiness.business_id,
            title,
            short_description: shortDescription,
            event_description: description,
            county: countyName,
            price_tier,
            min_price: minPrice ? parseFloat(minPrice) : null,
            max_price: maxPrice ? parseFloat(maxPrice) : null,
            booking_url,
            duration_minutes,
            whats_included,
            what_you_do,
            status,
            updated_at: new Date().toISOString()
        };

        let saved;

        if (isEditMode && editingExperienceId) {
            const { data, error } = await supabaseClient
                .from('experiences')
                .update(experienceData)
                .eq('experience_id', editingExperienceId)
                .select()
                .single();

            if (error) throw error;
            saved = data;

            await supabaseClient
                .from('experience_category')
                .delete()
                .eq('experience_id', editingExperienceId);

            await supabaseClient
                .from('experience_category')
                .insert([{ experience_id: editingExperienceId, category_id: categoryId }]);

            await supabaseClient
                .from('image')
                .delete()
                .eq('experience_id', editingExperienceId);

            const imageRecords = imageUrls.map((url, index) => ({
                experience_id: editingExperienceId,
                image_url: url,
                is_primary: index === 0,
                display_order: index
            }));

            const { error: imageErr } = await supabaseClient
                .from('image')
                .insert(imageRecords);

            if (imageErr) console.error('Image re-insert error:', imageErr);

        } else {
            const { data, error } = await supabaseClient
                .from('experiences')
                .insert([experienceData])
                .select()
                .single();

            if (error) throw error;
            saved = data;

            await supabaseClient
                .from('experience_category')
                .insert([{ experience_id: saved.experience_id, category_id: categoryId }]);

            const imageRecords = imageUrls.map((url, index) => ({
                experience_id: saved.experience_id,
                image_url: url,
                is_primary: index === 0,
                display_order: index
            }));

            const { error: imageError } = await supabaseClient
                .from('image')
                .insert(imageRecords);

            if (imageError) console.error('Image insert error:', imageError);
        }

        const successMessage = isEditMode
            ? 'Experience updated successfully!'
            : (status === 'draft' ? 'Experience saved as draft!' : 'Experience submitted for approval!');

        showAlert('createAlert', successMessage, 'success');

        setTimeout(async () => {
            resetForm();
            await loadExperiences();
            showSection('experiences');
        }, 1200);

    } catch (error) {
        console.error('Error saving experience:', error);
        showAlert('createAlert', `Error: ${error.message || 'Unknown error'}`, 'error');
    } finally {
        isSubmitting = false;
    }
}

/**
 * Reset form
 */
function resetForm() {
    document.getElementById('createExperienceForm').reset();

    uploadedImages.forEach(img => {
        if (img.file) URL.revokeObjectURL(img.preview);
    });
    uploadedImages = [];

    document.getElementById('createAlert').innerHTML = '';
    document.getElementById('uploadProgress').classList.add('hidden');
    document.getElementById('imagePreviews').innerHTML = '';

    isEditMode = false;
    editingExperienceId = null;

    // ✅ IMPORTANT: do NOT set form.onsubmit (it double-fires with addEventListener)
    const form = document.getElementById('createExperienceForm');
    form.querySelector('.btn-primary').textContent = 'Submit for Approval';
    document.getElementById('createSectionHeading').textContent = 'Create New Experience';
}

/**
 * Edit experience: load into form
 */
async function editExperience(experienceId) {
    try {
        const experience = experiences.find(exp => exp.experience_id === experienceId);
        if (!experience) return;

        isEditMode = true;
        editingExperienceId = experienceId;

        document.getElementById('title').value = experience.title || '';
        document.getElementById('shortDescription').value = experience.short_description || '';
        document.getElementById('description').value = experience.event_description || '';

        document.getElementById('bookingUrl').value = experience.booking_url || '';
        document.getElementById('durationMinutes').value = experience.duration_minutes || '';

        document.getElementById('whatYouDo').value = experience.what_you_do || '';
        document.getElementById('whatsIncluded').value = experience.whats_included || '';

        const { data: expCategory } = await supabaseClient
            .from('experience_category')
            .select('category_id')
            .eq('experience_id', experienceId)
            .single();

        if (expCategory) document.getElementById('category').value = expCategory.category_id;

        const countySelect = document.getElementById('county');
        for (let i = 0; i < countySelect.options.length; i++) {
            if (countySelect.options[i].text === experience.county) {
                countySelect.selectedIndex = i;
                break;
            }
        }

        document.getElementById('minPrice').value = experience.min_price ?? '';
        document.getElementById('maxPrice').value = experience.max_price ?? '';
        document.getElementById('priceTier').value = experience.price_tier ?? '';

        uploadedImages = [];
        if (experience.images?.length) {
            const sorted = [...experience.images].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
            sorted.forEach(img => {
                uploadedImages.push({
                    file: null,
                    preview: img.image_url,
                    uploaded: true,
                    url: img.image_url,
                    imageId: img.image_id,
                    isPrimary: !!img.is_primary
                });
            });

            if (!uploadedImages.some(i => i.isPrimary) && uploadedImages.length) {
                uploadedImages[0].isPrimary = true;
            }

            displayImagePreviews();
        }

        const form = document.getElementById('createExperienceForm');
        form.querySelector('.btn-primary').textContent = 'Update Experience';
        document.getElementById('createSectionHeading').textContent = 'Edit Experience';

        showSection('create');
        showAlert('createAlert', 'Editing experience - make your changes and click Update', 'info');

    } catch (error) {
        console.error('Error loading experience for edit:', error);
        alert('Error loading experience');
    }
}

/**
 * Delete experience
 */
async function deleteExperience(experienceId) {
    if (!confirm('Are you sure you want to delete this experience? This action cannot be undone.')) return;

    try {
        const { error } = await supabaseClient
            .from('experiences')
            .delete()
            .eq('experience_id', experienceId);

        if (error) throw error;

        await loadExperiences();
        alert('Experience deleted successfully');

    } catch (error) {
        console.error('Error deleting experience:', error);
        alert(`Error deleting experience: ${error.message}`);
    }
}

/**
 * Alerts
 */
function showAlert(elementId, message, type) {
    const alertDiv = document.getElementById(elementId);
    if (!alertDiv) return;

    alertDiv.innerHTML = `
        <div class="alert alert-${type}">
            ${message}
        </div>
    `;

    if (type === 'success') {
        setTimeout(() => { alertDiv.innerHTML = ''; }, 3000);
    }
}

/**
 * Logout
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