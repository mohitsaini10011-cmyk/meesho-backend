/**
 * Auth - License Key Validation for Meesho AI Extension
 * Handles license validation and session management
 */

// ─── Configuration ────────────────────────────────────────────────────────────
// Default server URL
let SERVER_URL = 'https://meesho-backend-ga8x.onrender.com';

// Storage keys
const STORAGE_KEYS = {
  licenseKey: 'meesho_license_key',
  licenseInfo: 'meesho_license_info',
  serverUrl: 'serverUrl',
  isLoggedIn: 'is_logged_in'
};

// ─── DOM Ready ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  
  // Load saved server URL
  chrome.storage.sync.get([STORAGE_KEYS.serverUrl], (result) => {
    if (result.serverUrl) {
      SERVER_URL = result.serverUrl.replace(/\/$/, '');
    }
  });
  
  // Check if already logged in
  checkExistingSession();
  
  // Login button handler
  const loginBtn = document.getElementById('loginBtn');
  loginBtn.addEventListener('click', handleLogin);
  
  // Enter key handler
  const licenseInput = document.getElementById('licenseKey');
  licenseInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      handleLogin();
    }
  });
});

// ─── Check Existing Session ─────────────────────────────────────────────────
function checkExistingSession() {
  chrome.storage.local.get([STORAGE_KEYS.licenseKey, STORAGE_KEYS.licenseInfo], (result) => {
    if (result.licenseKey && result.licenseInfo) {
      // Validate stored license
      validateStoredLicense(result.licenseKey, result.licenseInfo);
    }
  });
}

// ─── Validate Stored License ────────────────────────────────────────────────
function validateStoredLicense(key, info) {
  setLoading(true, 'Validating license...');
  
  fetch(`${SERVER_URL}/validate-license`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ licenseKey: key })
  })
  .then(response => {
    // Check if response is OK before parsing JSON
    if (!response.ok) {
      return response.text().then(text => {
        console.error('Server error response:', text);
        throw new Error(`Server returned ${response.status}: Cannot connect to server`);
      });
    }
    return response.json();
  })
  .then(data => {
    if (data.success && data.valid) {
      // License still valid
      showStatus('License validated! Redirecting...', 'success');
      setTimeout(() => {
        chrome.runtime.sendMessage({ 
          action: 'OPEN_POPUP',
          licenseKey: key,
          licenseInfo: data
        });
        window.close();
      }, 1000);
    } else {
      // License expired or invalid
      clearStoredLicense();
      showStatus(data.error || 'License expired. Please enter a valid key.', 'error');
    }
  })
  .catch(err => {
    // Network error - require server connection
    console.error('License validation error:', err);
    showStatus('Could not connect to server. Please check your internet connection and try again.', 'error');
  })
  .finally(() => {
    setLoading(false);
  });
}

// ─── Handle Login ────────────────────────────────────────────────────────────
function handleLogin() {
  const licenseKey = document.getElementById('licenseKey').value.trim().toUpperCase();
  
  if (!licenseKey) {
    showStatus('Please enter your license key', 'error');
    return;
  }
  
  // Basic format validation
  if (!licenseKey.startsWith('MEESHO-')) {
    showStatus('Invalid license key format. Keys start with MEESHO-', 'error');
    return;
  }
  
  setLoading(true, 'Validating license key...');
  
  fetch(`${SERVER_URL}/validate-license`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ licenseKey: licenseKey })
  })
  .then(response => {
    // Check if response is OK before parsing JSON
    if (!response.ok) {
      return response.text().then(text => {
        console.error('Server error response:', text);
        throw new Error(`Server returned ${response.status}: Cannot connect to server`);
      });
    }
    return response.json();
  })
  .then(data => {
    if (data.success && data.valid) {
      // Store license info
      const licenseInfo = {
        valid: true,
        plan: data.plan,
        expiry: data.expiry,
        remainingDays: data.remainingDays,
        validatedAt: Date.now()
      };
      
      chrome.storage.local.set({
        [STORAGE_KEYS.licenseKey]: licenseKey,
        [STORAGE_KEYS.licenseInfo]: licenseInfo,
        [STORAGE_KEYS.isLoggedIn]: true
      }, () => {
        showStatus(`License activated! ${data.remainingDays} days remaining.`, 'success');
        
        // Update badge
        chrome.action.setBadgeBackgroundColor({ color: '#00FF00' });
        chrome.action.setBadgeText({ text: '✓' });
        
        // Redirect to main popup after short delay
        setTimeout(() => {
          // Change popup to main popup.html
          chrome.management.getSelf((ext) => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
              // Open a new tab with the main popup content as a workaround
              // since we can't directly change popup.html dynamically
              const manifest = chrome.runtime.getManifest();
              const extensionUrl = `chrome-extension://${chrome.runtime.id}/popup.html`;
              
              // Close current auth popup and open main popup
              chrome.runtime.sendMessage({ 
                action: 'OPEN_POPUP',
                licenseKey: licenseKey,
                licenseInfo: licenseInfo
              });
              
              window.close();
            });
          });
        }, 1500);
      });
    } else {
      showStatus(data.error || 'Invalid license key', 'error');
    }
  })
  .catch(err => {
    console.error('Login error:', err);
    showStatus('Could not connect to server. Please try again.', 'error');
  })
  .finally(() => {
    setLoading(false);
  });
}

// ─── Clear Stored License ───────────────────────────────────────────────────
function clearStoredLicense() {
  chrome.storage.local.remove([
    STORAGE_KEYS.licenseKey,
    STORAGE_KEYS.licenseInfo,
    STORAGE_KEYS.isLoggedIn
  ]);
}

// ─── UI Helpers ───────────────────────────────────────────────────────────────
function showStatus(message, type) {
  const statusEl = document.getElementById('status');
  statusEl.textContent = message;
  statusEl.className = 'status ' + type;
}

function setLoading(loading, label) {
  const btn = document.getElementById('loginBtn');
  const input = document.getElementById('licenseKey');
  
  if (loading) {
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span>${label || 'Loading...'}`;
    input.disabled = true;
  } else {
    btn.disabled = false;
    btn.textContent = 'Activate Extension';
    input.disabled = false;
  }
}

