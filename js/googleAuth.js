// Google Authentication utility functions
const GOOGLE_CLIENT_ID = '253453371558-prtcr9vvdtdsghggjs5c64g6qbtmbrl6.apps.googleusercontent.com';

function initializeGoogleAuth() {
    // Only initialize for Irvine sites
    const params = new URLSearchParams(window.location.search);

    const isIrvine = window.location.href.includes('/irvine');
    if (!isIrvine) {
        const googleButtons = document.querySelectorAll('.google-auth-button');
        googleButtons.forEach(button => button.style.display = 'none');
        return;
    }

    // Wait until google.accounts is available (accounts library loads async)
    console.debug('[googleAuth] initializeGoogleAuth called isIrvine=', isIrvine);
    let retryCount = 0;
    const maxRetries = 50; // Retry for up to 5 seconds (50 * 100ms)

    const init = () => {
        if (window.google && google.accounts && google.accounts.id) {
            console.debug('[googleAuth] google.accounts available, initializing');
            google.accounts.id.initialize({
                client_id: GOOGLE_CLIENT_ID,
                callback: handleGoogleCredentialResponse,
                auto_select: false,
                cancel_on_tap_outside: true
            });
        } else if (retryCount < maxRetries) {
            retryCount++;
            setTimeout(init, 100);
        } else {
            console.error('[googleAuth] google.accounts library failed to load after maximum retries');
            showToastMessage('Google login unavailable. Please try again later.', 'error');
        }
    };
    init();
}

function handleGoogleCredentialResponse(response) {
    const baseUrl = "https://backend4.sharemyworks.com/api/";
    const token = response.credential;
    
    // Decode the JWT to get user info
    const payload = JSON.parse(atob(token.split('.')[1]));
    
    // Get URL parameters
    const params = new URLSearchParams(window.location.search);
    const courseId = params.get("courseId");
    const price = params.get("price");
    const chinese = window.location.href.includes("cn");

    // Create user data object
    const userData = {
        email: payload.email,
        firstName: payload.given_name,
        lastName: payload.family_name,
        password: generateRandomPassword(), // Generate a random password for backend compatibility
        username: generateUsername(payload.given_name, payload.family_name),
        preferedLanguage: chinese ? "Chinese" : "English",
    };

    // First, check if user exists
    checkUserExists(userData.email)
        .then(existingUser => {
            if (existingUser) {
                // Login flow
                loginWithGoogle(userData, courseId, price);
            } else {
                // Registration flow
                registerWithGoogle(userData, courseId, price);
            }
        })
        .catch(error => {
            console.error('Google auth error:', error);
            showToastMessage('Authentication failed. Please try again or use regular login.', 'error');
        });
}

function checkUserExists(email) {
    const baseUrl = "https://backend4.sharemyworks.com/api/";
    return fetch(`${baseUrl}Account/findOne?filter={"where":{"email":"${email}"}}`)
        .then(response => response.json())
        .then(user => Boolean(user));
}

function loginWithGoogle(userData, courseId, price) {
    const baseUrl = "https://backend4.sharemyworks.com/api/";
    
    // Use email login endpoint
    fetch(`${baseUrl}Account/login`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            email: userData.email,
            password: userData.password
        })
    })
    .then(response => response.json())
    .then(loginData => {
        // Store authentication data
        localStorage.setItem('registrationAccountId', loginData.userId);
        localStorage.setItem('registrationCourseId', courseId || '');
        localStorage.setItem('registrationToken', loginData.id);
        
        showToastMessage('Login successful! Redirecting...', 'success');
        
        // Redirect to appropriate page based on course
        if (courseId) {
            window.location.href = `/course-continue-confirmation.html?accountId=${loginData.userId}&courseId=${courseId}&price=${price}&token=${loginData.id}`;
        } else {
            window.location.href = '/student-profile.html';
        }
    })
    .catch(error => {
        console.error('Login failed:', error);
        showToastMessage('Login failed. Please try again.', 'error');
    });
}

function registerWithGoogle(userData, courseId, price) {
    const baseUrl = "https://backend4.sharemyworks.com/api/";
    
    fetch(`${baseUrl}Account`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify(userData)
    })
    .then(response => response.json())
    .then(accountData => {
        // If course ID exists, attach student to course
        if (courseId) {
            return attachStudentToCourse(accountData.id, courseId)
                .then(() => accountData);
        }
        return accountData;
    })
    .then(accountData => {
        showToastMessage('Registration successful! Redirecting...', 'success');
        
        // Store registration data
        localStorage.setItem('registrationAccountId', accountData.id);
        localStorage.setItem('registrationCourseId', courseId || '');
        localStorage.setItem('registrationToken', accountData.id);
        
        // Redirect based on course
        if (courseId) {
            window.location.href = `/course-continue-confirmation.html?accountId=${accountData.id}&courseId=${courseId}&price=${price}&token=${accountData.id}`;
        } else {
            window.location.href = '/student-profile.html';
        }
    })
    .catch(error => {
        console.error('Registration failed:', error);
        showToastMessage('Registration failed. Please try again.', 'error');
    });
}

function attachStudentToCourse(studentId, courseId) {
    const baseUrl = "https://backend4.sharemyworks.com/api/";
    
    return fetch(`${baseUrl}Course/${courseId}/students/rel/${studentId}`, {
        method: "PUT"
    });
}

function generateUsername(firstName, lastName) {
    const base = (firstName + lastName).replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    return `${base}${Math.floor(Math.random() * 900 + 100)}`;
}

function generateRandomPassword() {
    const length = 12;
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';
    for (let i = 0; i < length; i++) {
        const randomIndex = Math.floor(Math.random() * charset.length);
        password += charset[randomIndex];
    }
    return password;
}

function showToastMessage(message, type = 'info') {
    Toastify({
        text: message,
        duration: 5000,
        close: true,
        gravity: "top",
        position: 'right',
        style: {
            background: type === 'error' ? "red" : "green",
        },
        className: "info",
    }).showToast();
}

// Export functions
window.initializeGoogleAuth = initializeGoogleAuth;
window.handleGoogleCredentialResponse = handleGoogleCredentialResponse;

// Safe render helper that waits for the library to load
window.renderGoogleButtonSafe = function(containerId, options) {
    const render = () => {
        if (window.google && google.accounts && google.accounts.id) {
            console.debug('[googleAuth] rendering google button into', containerId);
            const container = document.getElementById(containerId);
            if (container) {
                try {
                    google.accounts.id.renderButton(container, options || {});
                } catch (e) {
                    console.error('[googleAuth] renderButton failed', e);
                }
            } else {
                console.warn('[googleAuth] container not found:', containerId);
            }
        } else {
            // Wait and retry
            setTimeout(render, 100);
        }
    };
    render();
};