/**
 * Meesho AI Extension - Popup with License Validation
 * Main popup interface that checks for valid license
 */

// ─── Configuration ────────────────────────────────────────────────────────────
let SERVER_URL = 'https://dyanacore-creator-api.onrender.com';

// Storage keys
const STORAGE_KEYS = {
  licenseKey: 'meesho_license_key',
  licenseInfo: 'meesho_license_info',
  serverUrl: 'serverUrl',
  isLoggedIn: 'is_logged_in',
  defaultFields: 'meesho_default_fields'
};

// Global state
let isAuthenticated = false;
let currentLicenseKey = null;
let defaultFields = {};
let currentCaptureProfileId = null;
let currentCaptureProfileName = null;

// ─── Field Selector Map ───────────────────────────────────────────────────────
const FIELD_SELECTOR_MAP = {
  product_name:           { selector: 'input[id="product_name"]',           label: 'Product Name' },
  color:                  { selector: 'input[id="color"]',                   label: 'Color' },
  meesho_price:           { selector: 'input[id="meesho_price"]',            label: 'Meesho Price (₹)' },
  product_mrp:            { selector: 'input[id="product_mrp"]',             label: 'MRP (₹)' },
  only_wrong_return_price:{ selector: 'input[id="only_wrong_return_price"]', label: 'Wrong Return Price (₹)' },
  inventory:              { selector: 'input[id="inventory"]',               label: 'Inventory (qty)' },
  supplier_gst_percent:   { selector: 'input[id="supplier_gst_percent"]',    label: 'GST (%)' },
  hsn_code:               { selector: 'input[id="hsn_code"]',               label: 'HSN Code' },
  product_weight_in_gms:  { selector: 'input[id="product_weight_in_gms"]',   label: 'Weight (gms)' },
  supplier_product_id:    { selector: 'input[id="supplier_product_id"]',     label: 'Supplier Product ID' },
  category:               { selector: 'input[id="category"]',                label: 'Category' },
  brand:                  { selector: 'input[id="brand"]',                   label: 'Brand' },
  description:            { selector: 'textarea[id="description"]',          label: 'Description' },
};

let scannedFields  = null;
let generatedFields = [];

// ─── DOM Ready ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Load saved server URL
  chrome.storage.sync.get([STORAGE_KEYS.serverUrl], (result) => {
    if (result.serverUrl) {
      SERVER_URL = result.serverUrl.replace(/\/$/, '');
    }
    const serverUrlInput = document.getElementById('serverUrlInput');
    if (serverUrlInput) serverUrlInput.value = "Ai Server connected";
  });

  // Check authentication status - wait for result
  const storedData = await new Promise((resolve) => {
    chrome.storage.local.get(null, resolve);
  });
  
  const licenseKey = storedData[STORAGE_KEYS.licenseKey];
  const licenseInfo = storedData[STORAGE_KEYS.licenseInfo];
  const isLoggedIn = storedData[STORAGE_KEYS.isLoggedIn];
  
  console.log('Stored auth:', { licenseKey, licenseInfo, isLoggedIn });
  
  // For now, allow access without license validation
  // Just check if user has logged in before (stored data)
  if (licenseKey && licenseInfo && isLoggedIn) {
    isAuthenticated = true;
    currentLicenseKey = licenseKey;
  } else {
    // Auto-authenticate without license check
    isAuthenticated = true;
    currentLicenseKey = 'FREE_USER';
    
    // Store as authenticated
    const licenseInfo = {
      valid: true,
      plan: 'free',
      expiry: null,
      remainingDays: 999,
      validatedAt: Date.now()
    };
    
    const storageData = {
      [STORAGE_KEYS.licenseKey]: 'FREE_USER',
      [STORAGE_KEYS.licenseInfo]: licenseInfo,
      [STORAGE_KEYS.isLoggedIn]: true
    };
    
    await new Promise((resolve) => {
      chrome.storage.local.set(storageData, resolve);
    });
  }
  
  // Setup auth screen 
  setupAuthScreen();
  
  if (isAuthenticated) {
    // Load default fields first
    const storedDefaults = await new Promise((resolve) => {
      chrome.storage.local.get([STORAGE_KEYS.defaultFields], resolve);
    });
    defaultFields = storedDefaults[STORAGE_KEYS.defaultFields] || {};
    
    // Show main UI directly - no license validation needed
    showMainUI();
    setupTabSwitching();
    setupSettings();
    setupDefaultsTab();
    setupImageTab();
    setupTextTab();
    setupCaptureTab();
    setupLogout();
  } else {
    // Show auth screen if not authenticated
    showAuthRequired();
  }
});

// ─── Authentication Check ───────────────────────────────────────────────────
function checkAuthentication() {
  return new Promise((resolve) => {
    chrome.storage.local.get([
      STORAGE_KEYS.licenseKey,
      STORAGE_KEYS.licenseInfo,
      STORAGE_KEYS.isLoggedIn
    ], (result) => {
      console.log('Storage result:', result);
      console.log('licenseKey:', result.licenseKey);
      console.log('licenseInfo:', result.licenseInfo);
      console.log('isLoggedIn:', result.isLoggedIn);
      
      if (result.licenseKey && result.licenseInfo && result.isLoggedIn) {
        // If there's stored license info, consider user authenticated
        isAuthenticated = true;
        currentLicenseKey = result.licenseKey;
        console.log('Setting isAuthenticated = true');
        resolve(true);
      } else {
        isAuthenticated = false;
        console.log('Setting isAuthenticated = false');
        resolve(false);
      }
    });
  });
}

// ─── Setup Auth Screen ───────────────────────────────────────────────────────
function setupAuthScreen() {
  const authLoginBtn = document.getElementById('authLoginBtn');
  const authLicenseKey = document.getElementById('authLicenseKey');
  
  if (!authLoginBtn) return;
  
  // Login button handler
  authLoginBtn.addEventListener('click', handleAuthLogin);
  
  // Enter key handler
  if (authLicenseKey) {
    authLicenseKey.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        handleAuthLogin();
      }
    });
  }
}

// ─── Handle Auth Login ──────────────────────────────────────────────────────
function handleAuthLogin() {
  const authLicenseKey = document.getElementById('authLicenseKey');
  const authStatus = document.getElementById('auth-status');
  const authLoginBtn = document.getElementById('authLoginBtn');
  
  if (!authLicenseKey) return;
  
  const licenseKey = authLicenseKey.value.trim().toUpperCase();
  
  if (!licenseKey) {
    showAuthStatus('Please enter your license key', 'error');
    return;
  }
  
  // Basic format validation - accept any non-empty key
  if (!licenseKey || licenseKey.length < 5) {
    showAuthStatus('Please enter a valid license key', 'error');
    return;
  }
  
  // Set loading state
  authLoginBtn.disabled = true;
  authLoginBtn.innerHTML = '<span class="spinner"></span>Validating...';
  authLicenseKey.disabled = true;
  
  // Get device info for validation
  const deviceInfo = {
    deviceId: localStorage.device_id || 'chrome-extension-' + Date.now(),
    userAgent: navigator.userAgent
  };
  
  // Show loading first
  showAuthStatus('Validating license...', 'info');
  
  console.log('Attempting to connect to:', SERVER_URL);
  
  fetch(`${SERVER_URL}/validate-license`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ 
      licenseKey: licenseKey,
      deviceInfo: deviceInfo
    })
  })
  .then(response => {
    console.log('Response status:', response.status);
    // Check if response is OK before parsing JSON
    if (!response.ok) {
      return response.text().then(text => {
        console.error('Server error response:', text);
        throw new Error(`Server returned ${response.status}: Cannot connect to server at ${SERVER_URL}. Make sure the server is running.`);
      });
    }
    return response.json();
  })
  .then(data => {
    console.log('Login API response:', data);
    
    // Check if license is valid
    if (data.valid === true) {
      // Store license info - valid license
      const licenseInfo = {
        valid: true,
        plan: data.plan || 'monthly',
        expiry: data.expiry || null,
        remainingDays: data.remainingDays || 30,
        validatedAt: Date.now()
      };
      
      const storageData = {
        [STORAGE_KEYS.licenseKey]: licenseKey,
        [STORAGE_KEYS.licenseInfo]: licenseInfo,
        [STORAGE_KEYS.isLoggedIn]: true
      };
      
      console.log('Saving to storage:', storageData);
      
      chrome.storage.local.set(storageData, () => {
        console.log('Storage saved, checking error:', chrome.runtime.lastError);
        
        showAuthStatus(`License activated! ${data.remainingDays || 30} days remaining.`, 'success');
        
        // Update badge
        chrome.action.setBadgeBackgroundColor({ color: '#00FF00' });
        chrome.action.setBadgeText({ text: '✓' });
        
        // Reload to show main UI
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      });
    } else {
      showAuthStatus(data.error || 'Invalid license key', 'error');
      authLoginBtn.disabled = false;
      authLoginBtn.textContent = 'Activate Extension';
      authLicenseKey.disabled = false;
    }
  })
  .catch(err => {
    console.error('Login error:', err);
    console.error('Server URL:', SERVER_URL);
    
    // Show error message
    if (err.message && err.message.includes('Failed to fetch')) {
      showAuthStatus('Cannot connect to server. Check if server is running at: ' + SERVER_URL, 'error');
    } else {
      showAuthStatus('Connection error: ' + err.message, 'error');
    }
    
    // Re-enable the login button
    authLoginBtn.disabled = false;
    authLoginBtn.textContent = 'Activate Extension';
    authLicenseKey.disabled = false;
  });
}

// ─── Show Auth Status ────────────────────────────────────────────────────────
function showAuthStatus(message, type) {
  const authStatus = document.getElementById('auth-status');
  if (authStatus) {
    authStatus.textContent = message;
    authStatus.className = 'status ' + type;
  }
}

// ─── Validate License with Server ───────────────────────────────────────────
async function validateLicense(licenseKey) {
  try {
    const response = await fetch(`${SERVER_URL}/validate-license`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey })
    });
    
    // Check if response is OK before parsing JSON
    if (!response.ok) {
      const text = await response.text();
      console.error('Server error response:', text);
      throw new Error(`Server returned ${response.status}: Cannot connect to server at ${SERVER_URL}`);
    }
    
    const data = await response.json();
    console.log('License validation response:', data);
    
    // Only allow access if server explicitly says valid
    if (data.valid === true) {
      return true;
    }
    // Any other response means invalid
    return false;
  } catch (e) {
    console.error('License validation error:', e);
    // On network error, deny access (strict mode)
    return false;
  }
}

// Validate license on popup load - check if still valid
async function validateLicenseOnLoad() {
  if (!currentLicenseKey) return;
  
  try {
    const response = await fetch(`${SERVER_URL}/validate-license`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey: currentLicenseKey })
    });
    
    // Check if response is OK before parsing JSON
    if (!response.ok) {
      const text = await response.text();
      console.error('Server error response:', text);
      // On connection error, show warning but don't logout
      console.warn('Could not connect to server for license check. Keeping user logged in.');
      return;
    }
    
    const data = await response.json();
    console.log('License check on load:', data);
    
    if (data.valid === false) {
      // License is no longer valid - logout and show auth screen
      console.log('License invalidated, logging out...');
      await handleLogout();
      isAuthenticated = false;
      showAuthRequired();
      showAuthStatus('Your license has been deactivated. Please contact admin.', 'error');
    }
  } catch (e) {
    console.error('License check error:', e);
    // On network error, still allow access if previously logged in
    // Just show a warning in console
    console.warn('Could not verify license. User remains logged in.');
  }
}

// ─── Handle Logout ───────────────────────────────────────────────────────────
async function handleLogout() {
  return new Promise((resolve) => {
    chrome.storage.local.remove([
      STORAGE_KEYS.licenseKey,
      STORAGE_KEYS.licenseInfo,
      STORAGE_KEYS.isLoggedIn
    ], () => {
      chrome.action.setBadgeText({ text: '' });
      resolve();
    });
  });
}

// ─── Show Auth Required Screen ──────────────────────────────────────────────
function showAuthRequired() {
  document.getElementById('auth-screen').style.display = 'block';
  document.getElementById('main-content').style.display = 'none';
}

// ─── Show Main UI ───────────────────────────────────────────────────────────
function showMainUI() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('main-content').style.display = 'block';
  
  // Update license info display
  chrome.storage.local.get([STORAGE_KEYS.licenseInfo], (result) => {
    if (result.licenseInfo) {
      const badge = document.getElementById('license-badge');
      if (badge) {
        badge.textContent = `✓ Active - ${result.licenseInfo.remainingDays || 0} days`;
      }
    }
  });
}

// ─── Tab Switching ───────────────────────────────────────────────────────────
function setupTabSwitching() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab).classList.add('active');
    });
  });
}

// ─── Settings Tab ───────────────────────────────────────────────────────────
function setupSettings() {
  const saveServerUrlBtn = document.getElementById('saveServerUrlBtn');
  const settingsStatus = document.getElementById('settings-status');
  
  if (saveServerUrlBtn) {
    saveServerUrlBtn.addEventListener('click', () => {
      const input = document.getElementById('serverUrlInput').value.trim().replace(/\/$/, '');
      if (!input || !input.startsWith('http')) {
        showStatus(settingsStatus, '❌ Please enter a valid URL starting with http:// or https://', 'error');
        return;
      }
      chrome.storage.sync.set({ serverUrl: input }, () => {
        SERVER_URL = input;
        showStatus(settingsStatus, `✅ Server URL saved: ${input}`, 'success');
      });
    });
  }
}

// ─── Defaults Tab ─────────────────────────────────────────────────────────────
function setupDefaultsTab() {
  const defaultsList = document.getElementById('defaults-list');
  const saveDefaultsBtn = document.getElementById('saveDefaultsBtn');
  const clearDefaultsBtn = document.getElementById('clearDefaultsBtn');
  const defaultsStatus = document.getElementById('defaults-status');
  const addFieldBtn = document.getElementById('addFieldBtn');
  
  // Default fields to configure
  let defaultFieldConfigs = [
    { key: 'inventory', label: 'Inventory (Stock)', defaultValue: '100' },
    { key: 'net_quantity', label: 'Net Quantity', defaultValue: '1' },
    { key: 'multipack', label: 'Multipack', defaultValue: '1' },
    { key: 'packaging_breadth', label: 'Packaging Breadth', defaultValue: '0.5' },
    { key: 'packaging_height', label: 'Packaging Height', defaultValue: '0.5' },
    { key: 'packaging_length', label: 'Packaging Length', defaultValue: '0.5' },
    { key: 'packaging_unit', label: 'Packaging Unit', defaultValue: 'cm' },
    { key: 'product_breadth', label: 'Product Breadth', defaultValue: '0.5' },
    { key: 'product_height', label: 'Product Height', defaultValue: '0.5' },
    { key: 'product_length', label: 'Product Length', defaultValue: '0.5' },
    { key: 'product_unit', label: 'Product Unit', defaultValue: 'cm' },
    { key: 'type', label: 'Type', defaultValue: '' },
    { key: 'weight', label: 'Weight', defaultValue: '0.5' },
    { key: 'weight_unit', label: 'Weight Unit', defaultValue: 'Kg' },
    { key: 'country_of_origin', label: 'Country of Origin', defaultValue: 'India' },
    { key: 'manufacturer_name', label: 'Manufacturer Name', defaultValue: 'BizB' },
    { key: 'manufacturer_address', label: 'Manufacturer Address', defaultValue: 'DAWARPAR, GORAKHPUR, UTTARPRADESH' },
    { key: 'manufacturer_pincode', label: 'Manufacturer Pincode', defaultValue: '247776' },
    { key: 'packer_name', label: 'Packer Name', defaultValue: 'BizB' },
    { key: 'packer_address', label: 'Packer Address', defaultValue: 'Shamli, Shamli, UTTARPRADESH' },
    { key: 'packer_pincode', label: 'Packer Pincode', defaultValue: '247776' },
    { key: 'importer_name', label: 'Importer Name', defaultValue: 'Not Required' },
    { key: 'importer_address', label: 'Importer Address', defaultValue: 'Not Required' },
    { key: 'importer_pincode', label: 'Importer Pincode', defaultValue: '' },
    { key: 'supplier_gst_percent', label: 'GST (%)', defaultValue: '5' },
    { key: 'hsn_code', label: 'HSN Code', defaultValue: '' },
    { key: 'product_weight_in_gms', label: 'Weight (gms)', defaultValue: '' },
    { key: 'category', label: 'Category', defaultValue: '' },
    { key: 'brand', label: 'Brand', defaultValue: '' },
    { key: 'supplier_product_id', label: 'SKU ID', defaultValue: '' },
  ];
  
  // Built-in field keys (cannot be deleted)
  const builtInKeys = defaultFieldConfigs.map(f => f.key);
  
  // Load saved defaults
  function loadDefaults() {
    chrome.storage.local.get([STORAGE_KEYS.defaultFields], (result) => {
      defaultFields = result[STORAGE_KEYS.defaultFields] || {};
      renderDefaultsList();
    });
  }
  
  // Render the defaults list
  function renderDefaultsList() {
    if (!defaultsList) return;
    defaultsList.innerHTML = '';
    
    defaultFieldConfigs.forEach((config, index) => {
      const row = document.createElement('div');
      row.className = 'field-row';
      row.style.marginBottom = '8px';
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.gap = '5px';
      
      const labelEl = document.createElement('div');
      labelEl.className = 'field-label';
      labelEl.textContent = config.label;
      labelEl.style.width = '130px';
      labelEl.style.flexShrink = '0';
      labelEl.style.fontSize = '9px';
      
      const inputEl = document.createElement('input');
      inputEl.className = 'field-value';
      inputEl.type = 'text';
      inputEl.placeholder = config.defaultValue || 'Enter value...';
      inputEl.dataset.key = config.key;
      inputEl.value = defaultFields[config.key] || '';
      inputEl.style.flex = '1';
      inputEl.style.padding = '5px';
      inputEl.style.fontSize = '11px';
      
      // Delete button for custom fields
      const deleteBtn = document.createElement('button');
      deleteBtn.innerHTML = '✕';
      deleteBtn.title = 'Delete this field';
      deleteBtn.style.cssText = 'background:#ff4444;color:#fff;border:none;padding:4px 6px;border-radius:3px;cursor:pointer;font-size:10px;font-weight:bold;width:24px;height:24px;flex-shrink:0;';
      
      // Check if this is a built-in field
      if (!builtInKeys.includes(config.key)) {
        // Custom field - allow delete
        deleteBtn.addEventListener('click', function() {
          deleteCustomField(index);
        });
      } else {
        // Built-in field - disable delete
        deleteBtn.disabled = true;
        deleteBtn.style.background = '#ccc';
        deleteBtn.style.cursor = 'not-allowed';
        deleteBtn.title = 'Cannot delete built-in fields';
      }
      
      row.appendChild(labelEl);
      row.appendChild(inputEl);
      row.appendChild(deleteBtn);
      defaultsList.appendChild(row);
    });
  }
  
  // Add new custom field
  function addCustomField() {
    const fieldLabel = prompt('Enter field label (e.g., "Custom Field"):');
    if (!fieldLabel || !fieldLabel.trim()) return;
    
    const fieldKey = prompt('Enter field key/ID (e.g., "custom_field") - this should match the form field ID:');
    if (!fieldKey || !fieldKey.trim()) return;
    
    // Check if key already exists
    if (defaultFieldConfigs.some(f => f.key === fieldKey.trim())) {
      alert('This field key already exists!');
      return;
    }
    
    // Add to configs
    defaultFieldConfigs.push({
      key: fieldKey.trim(),
      label: fieldLabel.trim(),
      defaultValue: ''
    });
    
    renderDefaultsList();
    showStatus(defaultsStatus, `✅ Added "${fieldLabel}" field`, 'success');
  }
  
  // Delete custom field
  function deleteCustomField(index) {
    const config = defaultFieldConfigs[index];
    if (!config) {
      console.error('Config not found at index:', index);
      return;
    }
    
    console.log('Deleting field at index:', index, config);
    
    if (!confirm(`Delete "${config.label}" from defaults?`)) return;
    
    // Remove from configs
    defaultFieldConfigs.splice(index, 1);
    
    // Remove from saved defaults
    if (defaultFields[config.key]) {
      delete defaultFields[config.key];
      chrome.storage.local.set({ [STORAGE_KEYS.defaultFields]: defaultFields });
    }
    
    console.log('Updated defaultFieldConfigs:', defaultFieldConfigs);
    renderDefaultsList();
    showStatus(defaultsStatus, `🗑️ Deleted "${config.label}" field`, 'success');
  }
  
  // Save defaults
  if (saveDefaultsBtn) {
    saveDefaultsBtn.addEventListener('click', () => {
      const inputs = defaultsList.querySelectorAll('input');
      const newDefaults = {};
      
      inputs.forEach(input => {
        const key = input.dataset.key;
        const value = input.value.trim();
        if (value) {
          newDefaults[key] = value;
        }
      });
      
      chrome.storage.local.set({ [STORAGE_KEYS.defaultFields]: newDefaults }, () => {
        defaultFields = newDefaults;
        showStatus(defaultsStatus, `✅ Saved ${Object.keys(newDefaults).length} default values!`, 'success');
      });
    });
  }
  
  // Add field button
  if (addFieldBtn) {
    addFieldBtn.addEventListener('click', addCustomField);
  }
  
  // Clear defaults
  if (clearDefaultsBtn) {
    clearDefaultsBtn.addEventListener('click', () => {
      if (confirm('Are you sure you want to clear all default values? This will reset all fields to empty.')) {
        chrome.storage.local.remove([STORAGE_KEYS.defaultFields], () => {
          defaultFields = {};
          renderDefaultsList();
          showStatus(defaultsStatus, '🗑️ All defaults cleared!', 'success');
        });
      }
    });
  }
  
  // Load defaults on init
  loadDefaults();
}

// ─── Logout Button ───────────────────────────────────────────────────────────
function setupCaptureTab() {
  const startCaptureBtn = document.getElementById('startCaptureBtn');
  const stopCaptureBtn = document.getElementById('stopCaptureBtn');
  const captureStatus = document.getElementById('capture-status');
  const captureFileNameInput = document.getElementById('captureFileName');
  const captureProfileSelect = document.getElementById('captureProfileSelect');
  const autofillCaptureBtn = document.getElementById('autofillCaptureBtn');
  const exportDataBtn = document.getElementById('exportDataBtn');
  const importDataBtn = document.getElementById('importDataBtn');
  const importDataFile = document.getElementById('importDataFile');
  const dataStatus = document.getElementById('data-status');

  if (startCaptureBtn) {
    startCaptureBtn.addEventListener('click', async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.url || !tab.url.includes('supplier.meesho.com')) {
          showStatus(captureStatus, '⚠ Open Meesho supplier listing page first.', 'error');
          return;
        }
        const rawName = (captureFileNameInput && captureFileNameInput.value || '').trim();
        if (!rawName) {
          showStatus(captureStatus, '⚠ Please enter capture file name first.', 'error');
          return;
        }

        const safeName = rawName
          .replace(/[^\w\s-]/g, '')
          .replace(/\s+/g, '_')
          .replace(/_+/g, '_')
          .trim();

        if (!safeName) {
          showStatus(captureStatus, '⚠ Enter a valid capture file name.', 'error');
          return;
        }

        const profileId = `capture_${safeName}_${Date.now()}`;

        try {
          await chrome.tabs.sendMessage(tab.id, { action: 'PING' });
        } catch (e) {
          await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['selector-utils.js', 'content.js'] });
          await new Promise(r => setTimeout(r, 600));
        }

        const storage = await new Promise(resolve => chrome.storage.local.get(['profiles'], resolve));
        const profiles = storage.profiles || {};
        profiles[profileId] = {
          id: profileId,
          name: rawName,
          fields: profiles[profileId]?.fields || []
        };
        await new Promise(resolve => chrome.storage.local.set({ profiles }, resolve));

        await chrome.tabs.sendMessage(tab.id, { action: 'START_CAPTURE', profileId });
        currentCaptureProfileId = profileId;
        currentCaptureProfileName = rawName;
        showStatus(captureStatus, `✅ Capture started for "${rawName}".`, 'success');
      } catch (err) {
        showStatus(captureStatus, '❌ Failed to start capture. Refresh tab and try again.', 'error');
      }
    });
  }

  if (stopCaptureBtn) {
    stopCaptureBtn.addEventListener('click', async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) {
          showStatus(captureStatus, '⚠ No active tab found.', 'error');
          return;
        }
        try {
          await chrome.tabs.sendMessage(tab.id, { action: 'PING' });
        } catch (e) {
          await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['selector-utils.js', 'content.js'] });
          await new Promise(r => setTimeout(r, 600));
        }
        await chrome.tabs.sendMessage(tab.id, { action: 'STOP_CAPTURE' });

        const storage = await new Promise(resolve => chrome.storage.local.get(['profiles'], resolve));
        const profiles = storage.profiles || {};
        const profile = currentCaptureProfileId ? profiles[currentCaptureProfileId] : null;

        if (profile) {
          const filename = await exportCaptureProfile(profile);
          showStatus(captureStatus, `⛔ Capture stopped. Auto-saved: ${filename}`, 'success');
        } else {
          showStatus(captureStatus, '⛔ Capture stopped.', 'info');
        }

        await refreshCaptureProfiles();
      } catch (err) {
        console.error('Stop capture failed:', err);
        showStatus(captureStatus, '❌ Failed to stop capture.', 'error');
      }
    });
  }

  async function refreshCaptureProfiles() {
    if (!captureProfileSelect) return;
    const storage = await new Promise(resolve => chrome.storage.local.get(['profiles'], resolve));
    const profiles = storage.profiles || {};
    const options = Object.values(profiles).filter(p => p && p.id && String(p.id).startsWith('capture_'));

    captureProfileSelect.innerHTML = '<option value="">-- Select Capture Profile --</option>';
    options.forEach(profile => {
      const option = document.createElement('option');
      option.value = profile.id;
      option.textContent = `${profile.name || profile.id} (${(profile.fields || []).length} fields)`;
      captureProfileSelect.appendChild(option);
    });
  }

  async function exportCaptureProfile(profile) {
    const capturePayload = {
      exportedAt: new Date().toISOString(),
      type: 'capture_profile',
      profile
    };

    const blob = new Blob([JSON.stringify(capturePayload, null, 2)], { type: 'application/json' });
    const baseName = (profile.name || 'capture_profile')
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '_')
      .replace(/_+/g, '_')
      .trim() || 'capture_profile';

    const filename = `${baseName}.json`;
    const reader = new FileReader();

    return new Promise((resolve, reject) => {
      reader.onload = async () => {
        try {
          const dataUrl = reader.result;
          await chrome.downloads.download({
            url: dataUrl,
            filename,
            saveAs: true
          });
          resolve(filename);
        } catch (downloadErr) {
          try {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            resolve(filename);
          } catch (fallbackErr) {
            reject(fallbackErr);
          }
        }
      };

      reader.onerror = () => reject(new Error('Failed to prepare capture file'));
      reader.readAsDataURL(blob);
    });
  }

  if (autofillCaptureBtn) {
    autofillCaptureBtn.addEventListener('click', async () => {
      try {
        const selectedId = captureProfileSelect && captureProfileSelect.value;
        if (!selectedId) {
          showStatus(captureStatus, '⚠ Please select a capture profile first.', 'error');
          return;
        }

        const storage = await new Promise(resolve => chrome.storage.local.get(['profiles'], resolve));
        const profiles = storage.profiles || {};
        const profile = profiles[selectedId];

        if (!profile || !Array.isArray(profile.fields) || profile.fields.length === 0) {
          showStatus(captureStatus, '⚠ Selected profile has no fields to autofill.', 'error');
          return;
        }

        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.url || !tab.url.includes('supplier.meesho.com')) {
          showStatus(captureStatus, '⚠ Open Meesho supplier listing page first.', 'error');
          return;
        }

        try {
          await chrome.tabs.sendMessage(tab.id, { action: 'PING' });
        } catch (e) {
          await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['selector-utils.js', 'content.js'] });
          await new Promise(r => setTimeout(r, 600));
        }

        await chrome.tabs.sendMessage(tab.id, {
          action: 'AUTOFILL',
          data: { fields: profile.fields, force: true }
        });

        showStatus(captureStatus, `✅ Autofill started from "${profile.name || selectedId}".`, 'success');
      } catch (err) {
        console.error('Autofill selected capture failed:', err);
        showStatus(captureStatus, '❌ Autofill from selected file failed.', 'error');
      }
    });
  }

  if (exportDataBtn) {
    exportDataBtn.addEventListener('click', async () => {
      try {
        const store = await new Promise(resolve => {
          chrome.storage.local.get(['profiles', STORAGE_KEYS.defaultFields], resolve);
        });
        const payload = {
          exportedAt: new Date().toISOString(),
          version: '1.0',
          defaults: store[STORAGE_KEYS.defaultFields] || {},
          profiles: store.profiles || {}
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const filename = `meesho-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        const reader = new FileReader();

        reader.onload = async () => {
          try {
            const dataUrl = reader.result;
            await chrome.downloads.download({
              url: dataUrl,
              filename,
              saveAs: true
            });
            showStatus(dataStatus, `✅ Exported as ${filename}`, 'success');
          } catch (downloadErr) {
            console.error('Download API export failed:', downloadErr);
            // fallback anchor method
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
            showStatus(dataStatus, `✅ Exported as ${filename}`, 'success');
          }
        };

        reader.onerror = () => {
          showStatus(dataStatus, '❌ Export failed while preparing file.', 'error');
        };

        reader.readAsDataURL(blob);
      } catch (err) {
        console.error('Export failed:', err);
        showStatus(dataStatus, '❌ Export failed.', 'error');
      }
    });
  }

  if (importDataBtn) {
    importDataBtn.addEventListener('click', async () => {
      try {
        const file = importDataFile && importDataFile.files && importDataFile.files[0];
        if (!file) {
          showStatus(dataStatus, '⚠ Select a JSON file first.', 'error');
          return;
        }

        const text = await file.text();
        const parsed = JSON.parse(text);

        if (!parsed || typeof parsed !== 'object') {
          showStatus(dataStatus, '❌ Invalid JSON format.', 'error');
          return;
        }

        const importedDefaults = (parsed.defaults && typeof parsed.defaults === 'object') ? parsed.defaults : {};
        const importedProfiles = (parsed.profiles && typeof parsed.profiles === 'object') ? parsed.profiles : {};

        const existing = await new Promise(resolve => chrome.storage.local.get(['profiles', STORAGE_KEYS.defaultFields], resolve));
        const mergedDefaults = { ...(existing[STORAGE_KEYS.defaultFields] || {}), ...importedDefaults };
        const mergedProfiles = { ...(existing.profiles || {}), ...importedProfiles };

        await new Promise(resolve => chrome.storage.local.set({
          [STORAGE_KEYS.defaultFields]: mergedDefaults,
          profiles: mergedProfiles
        }, resolve));

        defaultFields = mergedDefaults;
        await refreshCaptureProfiles();
        showStatus(dataStatus, `✅ Imported ${Object.keys(importedProfiles).length} profiles and ${Object.keys(importedDefaults).length} defaults.`, 'success');
      } catch (err) {
        showStatus(dataStatus, '❌ Import failed. Ensure file is valid JSON.', 'error');
      }
    });
  }

  refreshCaptureProfiles();
}

function setupLogout() {
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await handleLogout();
      window.location.reload();
    });
  }
  
  // Admin button - opens admin dashboard in new tab
  const adminBtn = document.getElementById('adminBtn');
  if (adminBtn) {
    adminBtn.addEventListener('click', () => {
      chrome.runtime.getURL('admin.html').then(url => {
        chrome.tabs.create({ url: url });
      });
    });
  }
}

// ─── IMAGE TAB ──────────────────────────────────────────────────────────────
function setupImageTab() {
  const generateFromImageBtn = document.getElementById('generateFromImage');
  const fileInput = document.getElementById('aiImage');
  const imageResult = document.getElementById('image-result');
  const imageStatus = document.getElementById('image-status');
  const imgScanFormBtn = document.getElementById('imgScanFormBtn');
  const imgScanBadge = document.getElementById('img-scan-badge');
  const imgAutofillBtn = document.getElementById('imgAutofillBtn');
  const imgMeeshoPriceInput = document.getElementById('imgMeeshoPrice');
  const quickImgAutofillBtn = document.getElementById('quickImgAutofillBtn');

  let imgScannedFields = null;
  let imgGeneratedFields = [];

  // Quick AutoFill - One click to scan, generate and fill
  if (quickImgAutofillBtn) {
    quickImgAutofillBtn.addEventListener('click', async () => {
      const fileInputVal = fileInput.files[0];
      const priceOverride = imgMeeshoPriceInput.value.trim();
      
      if (!fileInputVal) {
        showStatus(imageStatus, 'Please select an image first.', 'error');
        return;
      }
      
      setButtonLoading(quickImgAutofillBtn, true, '⚡ Quick AutoFill...');
      clearStatus(imageStatus);
      
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.url || !tab.url.includes('supplier.meesho.com')) {
          showStatus(imageStatus, '⚠ Please open the Meesho supplier listing page first', 'error');
          return;
        }
        
        // Ensure content script is loaded
        try { await chrome.tabs.sendMessage(tab.id, { action: 'PING' }); }
        catch (e) {
          await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['selector-utils.js', 'content.js'] });
          await new Promise(r => setTimeout(r, 600));
        }
        
        // Scan form first
        showStatus(imageStatus, '🔍 Scanning form...', 'info');
        const scanResult = await chrome.tabs.sendMessage(tab.id, { action: 'SCAN_FORM' });
        
        if (!scanResult || !scanResult.success || !scanResult.fields || scanResult.fields.length === 0) {
          showStatus(imageStatus, '⚠ Could not scan form fields. Make sure you are on the listing page.', 'error');
          return;
        }
        
        imgScannedFields = scanResult.fields;
        
        // Analyze image
        showStatus(imageStatus, '🖼️ Analyzing image...', 'info');
        const formData = new FormData();
        formData.append('image', fileInputVal);
        
        const response = await fetch(`${SERVER_URL}/generate`, {
          method: 'POST',
          body: formData,
          headers: {  }
        });
        
        // Check if response is OK before parsing JSON
        if (!response.ok) {
          const text = await response.text();
          console.error('Server error response:', text);
          if (text.includes('LICENSE_INVALID') || text.includes('LICENSE_REQUIRED')) {
            showStatus(imageStatus, '❌ License expired. Please contact admin.', 'error');
            return;
          }
          throw new Error(`Server returned ${response.status}: Cannot connect to server at ${SERVER_URL}`);
        }
        
        const data = await response.json();
        if (!data.success) {
          showStatus(imageStatus, '❌ Image analysis failed.', 'error');
          return;
        }
        
        // Generate fields with AI
        showStatus(imageStatus, '🤖 Generating listing fields...', 'info');
        let imageDescription = data.result;
        
        const descWithPrice = priceOverride
          ? imageDescription + ` Meesho price: ₹${priceOverride}.`
          : imageDescription;

        const formResp = await fetch(`${SERVER_URL}/generate-from-form`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
                      },
          body: JSON.stringify({ description: descWithPrice, formFields: imgScannedFields })
        });

        // Check if response is OK before parsing JSON
        if (!formResp.ok) {
          const text = await formResp.text();
          console.error('Server error response:', text);
          showStatus(imageStatus, '❌ Failed to generate fields.', 'error');
          return;
        }
        
        const formData2 = await formResp.json();
        if (!formData2.success || !formData2.fields) {
          showStatus(imageStatus, '❌ Failed to generate fields.', 'error');
          return;
        }
        
        let fields = formData2.fields;
        
        // Apply price override
        if (priceOverride) {
          fields = applyPriceOverride(fields, priceOverride);
        }
        
        // Apply defaults
        fields = applyDefaultFields(fields);
        
        // AutoFill on Meesho
        showStatus(imageStatus, '🎯 AutoFilling form...', 'info');
        await chrome.tabs.sendMessage(tab.id, { action: 'AUTOFILL', data: { fields, force: true } });
        
        showStatus(imageStatus, '🎉 Done! Form has been filled.', 'success');
        
      } catch (err) {
        console.error('Quick autofill error:', err);
        showStatus(imageStatus, '❌ Error: ' + err.message, 'error');
      } finally {
        setButtonLoading(quickImgAutofillBtn, false, '⚡ Quick Scan & AutoFill');
      }
    });
  }

  // Scan Form
  if (imgScanFormBtn) {
    imgScanFormBtn.addEventListener('click', async () => {
      setButtonLoading(imgScanFormBtn, true, 'Scanning...', true);
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.url || !tab.url.includes('supplier.meesho.com')) {
          imgScanBadge.className = 'scan-badge none';
          imgScanBadge.textContent = '⚠ Please open the Meesho supplier listing page first';
          return;
        }
        try { await chrome.tabs.sendMessage(tab.id, { action: 'PING' }); }
        catch (e) {
          await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['selector-utils.js', 'content.js'] });
          await new Promise(r => setTimeout(r, 600));
        }
        const result = await chrome.tabs.sendMessage(tab.id, { action: 'SCAN_FORM' });
        if (result && result.success && result.fields && result.fields.length > 0) {
          imgScannedFields = result.fields;
          imgScanBadge.className = 'scan-badge found';
          imgScanBadge.textContent = `✅ ${result.fields.length} fields found`;
        } else {
          imgScannedFields = null;
          imgScanBadge.className = 'scan-badge none';
          imgScanBadge.textContent = '⚠ No fields found — make sure you are on the listing add/edit page';
        }
      } catch (err) {
        console.error('Img scan error:', err);
        imgScanBadge.className = 'scan-badge none';
        imgScanBadge.textContent = '⚠ Scan failed — refresh the Meesho page and try again';
      } finally {
        setButtonLoading(imgScanFormBtn, false, '📋 Scan Meesho Form Fields');
      }
    });
  }

  // Generate from Image
  if (generateFromImageBtn) {
    generateFromImageBtn.addEventListener('click', async () => {
      if (!fileInput.files.length) {
        showStatus(imageStatus, 'Please select an image first.', 'error');
        return;
      }
      
      const formData = new FormData();
      formData.append('image', fileInput.files[0]);
      
      setButtonLoading(generateFromImageBtn, true, 'Analyzing Image...');
      imageResult.style.display = 'none';
      imgAutofillBtn.style.display = 'none';
      clearStatus(imageStatus);
      imgGeneratedFields = [];

      try {
        // Step 1: Analyze image
        const response = await fetch(`${SERVER_URL}/generate`, {
          method: 'POST',
          body: formData,
          headers: {  }
        });
        
        // Check if response is OK before parsing JSON
        if (!response.ok) {
          const text = await response.text();
          console.error('Server error response:', text);
          if (text.includes('LICENSE_INVALID') || text.includes('LICENSE_REQUIRED')) {
            showStatus(imageStatus, '❌ License expired. Please contact admin.', 'error');
            return;
          }
          throw new Error(`Server returned ${response.status}: Cannot connect to server at ${SERVER_URL}`);
        }
        
        const data = await response.json();

        if (!data.success) {
          showStatus(imageStatus, '❌ ' + (data.error || 'Image analysis failed.'), 'error');
          return;
        }

        const imageDescription = data.result;
        imageResult.textContent = imageDescription;
        imageResult.style.display = 'block';

        // Step 2: Generate structured fields
        if (imgScannedFields && imgScannedFields.length > 0) {
          showStatus(imageStatus, '🤖 Generating listing fields from image analysis...', 'info');

          const priceOverride = imgMeeshoPriceInput.value.trim();
          const descWithPrice = priceOverride
            ? imageDescription + ` Meesho price: ₹${priceOverride}.`
            : imageDescription;

          const formResp = await fetch(`${SERVER_URL}/generate-from-form`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
                          },
            body: JSON.stringify({ description: descWithPrice, formFields: imgScannedFields })
          });

          // Check if response is OK before parsing JSON
          if (formResp.ok) {
            const formData2 = await formResp.json();
            if (formData2.success && formData2.fields) {
              let fields = formData2.fields;
              if (priceOverride) {
                fields = applyPriceOverride(fields, priceOverride);
              }
              // Apply default values
              fields = applyDefaultFields(fields);
              imgGeneratedFields = fields;
              imgAutofillBtn.style.display = 'block';
              showStatus(imageStatus, `✅ Image analyzed! ${fields.length} fields generated. Click Autofill to fill the form.`, 'success');
            } else {
              showStatus(imageStatus, '✅ Image analyzed! Click Autofill to fill the form.', 'success');
            }
          } else {
            showStatus(imageStatus, '✅ Image analyzed! (Scan form first for autofill)', 'success');
          }
        } else {
          showStatus(imageStatus, '✅ Image analyzed! Scan the Meesho form first, then click Generate again to autofill.', 'success');
        }

      } catch (err) {
        console.error('Image generate error:', err);
        showStatus(imageStatus, `❌ Could not connect to server at ${SERVER_URL}`, 'error');
      } finally {
        setButtonLoading(generateFromImageBtn, false, '✨ Analyze Image & Generate');
      }
    });
  }

  // Autofill Button
  if (imgAutofillBtn) {
    imgAutofillBtn.addEventListener('click', async () => {
      if (!imgGeneratedFields.length) {
        showStatus(imageStatus, 'No fields to autofill. Please generate first.', 'error');
        return;
      }
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab || !tab.url || !tab.url.includes('supplier.meesho.com')) {
          showStatus(imageStatus, '⚠️ Please open the Meesho supplier listing page first.', 'error');
          return;
        }
        try { await chrome.tabs.sendMessage(tab.id, { action: 'PING' }); }
        catch (e) {
          await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['selector-utils.js', 'content.js'] });
          await new Promise(r => setTimeout(r, 600));
        }
        await chrome.tabs.sendMessage(tab.id, { action: 'AUTOFILL', data: { fields: imgGeneratedFields, force: true } });
        showStatus(imageStatus, '🚀 Autofill started on Meesho tab!', 'success');
      } catch (err) {
        console.error('Img autofill error:', err);
        showStatus(imageStatus, '❌ Autofill failed: ' + err.message, 'error');
      }
    });
  }
}

// ─── TEXT TAB ───────────────────────────────────────────────────────────────
function setupTextTab() {
  const scanFormBtn = document.getElementById('scanFormBtn');
  const scanBadge = document.getElementById('scan-badge');
  const generateFromTextBtn = document.getElementById('generateFromText');
  const descriptionInput = document.getElementById('productDescription');
  const textStatus = document.getElementById('text-status');
  const fieldsPanel = document.getElementById('fields-panel');
  const fieldsList = document.getElementById('fields-list');
  const autofillBtn = document.getElementById('autofillBtn');
  const saveProfileBtn = document.getElementById('saveProfileBtn');

  // STEP 1: Scan Form
  if (scanFormBtn) {
    scanFormBtn.addEventListener('click', async () => {
      setButtonLoading(scanFormBtn, true, 'Scanning...', true);
      clearStatus(textStatus);

      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (!tab || !tab.url || !tab.url.includes('supplier.meesho.com')) {
          scanBadge.className = 'scan-badge none';
          scanBadge.textContent = '⚠ Please open the Meesho supplier listing page first';
          setButtonLoading(scanFormBtn, false, '📋 Scan Meesho Form Fields');
          return;
        }

        try {
          await chrome.tabs.sendMessage(tab.id, { action: 'PING' });
        } catch (e) {
          await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['selector-utils.js', 'content.js'] });
          await new Promise(r => setTimeout(r, 600));
        }

        const result = await chrome.tabs.sendMessage(tab.id, { action: 'SCAN_FORM' });

        if (result && result.success && result.fields && result.fields.length > 0) {
          scannedFields = result.fields;
          scanBadge.className = 'scan-badge found';
          scanBadge.textContent = `✅ ${result.fields.length} fields found on Meesho form`;
          showStatus(textStatus, `✅ Scanned ${result.fields.length} form fields. Now describe your product and click Generate & Autofill.`, 'success');
        } else {
          scannedFields = null;
          scanBadge.className = 'scan-badge none';
          scanBadge.textContent = '⚠ No fields found — make sure you are on the listing add/edit page';
        }
      } catch (err) {
        console.error('Scan error:', err);
        scannedFields = null;
        scanBadge.className = 'scan-badge none';
        scanBadge.textContent = '⚠ Scan failed — refresh the Meesho page and try again';
      } finally {
        setButtonLoading(scanFormBtn, false, '📋 Scan Meesho Form Fields');
      }
    });
  }

  // STEP 3: Generate & Autofill
  if (generateFromTextBtn) {
    generateFromTextBtn.addEventListener('click', async () => {
      const description = descriptionInput.value.trim();
      if (!description) {
        showStatus(textStatus, 'Please enter a product description first.', 'error');
        return;
      }

      setButtonLoading(generateFromTextBtn, true, 'Generating...');
      clearStatus(textStatus);
      fieldsPanel.style.display = 'none';
      autofillBtn.style.display = 'none';
      saveProfileBtn.style.display = 'none';
      fieldsList.innerHTML = '';
      generatedFields = [];

      const priceOverride = document.getElementById('txtMeeshoPrice').value.trim();

      try {
        let fields = [];

        if (scannedFields && scannedFields.length > 0) {
          // Smart path
          showStatus(textStatus, '🤖 Sending scanned fields + description to AI...', 'info');

          const descWithPrice = priceOverride
            ? description + ` Meesho price: ₹${priceOverride}.`
            : description;

          const response = await fetch(`${SERVER_URL}/generate-from-form`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
                          },
            body: JSON.stringify({ description: descWithPrice, formFields: scannedFields })
          });

          // Check if response is OK before parsing JSON
          if (!response.ok) {
            const text = await response.text();
            console.error('Server error response:', text);
            if (text.includes('LICENSE_INVALID') || text.includes('LICENSE_REQUIRED')) {
              showStatus(textStatus, '❌ License expired. Please contact admin.', 'error');
              return;
            }
            throw new Error(`Server returned ${response.status}: Cannot connect to server at ${SERVER_URL}`);
          }
          
          const data = await response.json();

          if (!data.success) {
            showStatus(textStatus, '❌ ' + (data.error || 'Failed to generate listing.'), 'error');
            return;
          }

          fields = data.fields;

          if (priceOverride) {
            fields = applyPriceOverride(fields, priceOverride);
          }
          
          // Apply default values
          fields = applyDefaultFields(fields);

          generatedFields = fields;
          renderFieldsFromArray(fields, fieldsList);
          fieldsPanel.style.display = 'block';
          autofillBtn.style.display = 'block';
          saveProfileBtn.style.display = 'block';
          showStatus(textStatus, `✅ AI generated ${fields.length} field values. Review below, then click Autofill.`, 'success');

        } else {
          // Fallback path
          showStatus(textStatus, '🤖 Generating listing (tip: scan form first for better results)...', 'info');

          const descWithPrice = priceOverride
            ? description + ` Meesho price: ₹${priceOverride}.`
            : description;

          const response = await fetch(`${SERVER_URL}/generate-from-text`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
                          },
            body: JSON.stringify({ description: descWithPrice })
          });

          // Check if response is OK before parsing JSON
          if (!response.ok) {
            const text = await response.text();
            console.error('Server error response:', text);
            throw new Error(`Server returned ${response.status}: Cannot connect to server at ${SERVER_URL}`);
          }
          
          const data = await response.json();

          if (!data.success || !data.fields) {
            showStatus(textStatus, '❌ ' + (data.error || 'Failed to generate listing.'), 'error');
            return;
          }

          fields = Object.entries(data.fields)
            .filter(([, v]) => v && v.trim())
            .map(([key, value]) => {
              const meta = FIELD_SELECTOR_MAP[key];
              return { selector: meta ? meta.selector : `input[id="${key}"]`, value, label: meta ? meta.label : key };
            });

          if (priceOverride) {
            fields = applyPriceOverride(fields, priceOverride);
          }
          
          // Apply default values
          fields = applyDefaultFields(fields);

          generatedFields = fields;
          renderFieldsFromArray(fields, fieldsList);
          fieldsPanel.style.display = 'block';
          autofillBtn.style.display = 'block';
          saveProfileBtn.style.display = 'block';
          showStatus(textStatus, `✅ Generated ${fields.length} fields. Review below, then click Autofill.`, 'success');
        }

      } catch (err) {
        console.error('Text generate error:', err);
        showStatus(textStatus, `❌ Could not connect to server at ${SERVER_URL}`, 'error');
      } finally {
        setButtonLoading(generateFromTextBtn, false, '✨ Generate & Autofill');
      }
    });
  }

  // Autofill Button
  if (autofillBtn) {
    autofillBtn.addEventListener('click', async () => {
      const fields = collectFieldsFromUI();
      if (!fields.length) {
        showStatus(textStatus, 'No fields to autofill.', 'error');
        return;
      }

      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

        if (!tab || !tab.url || !tab.url.includes('supplier.meesho.com')) {
          showStatus(textStatus, '⚠️ Please open the Meesho supplier listing page first, then click Autofill.', 'error');
          return;
        }

        try {
          await chrome.tabs.sendMessage(tab.id, { action: 'PING' });
        } catch (e) {
          await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['selector-utils.js', 'content.js'] });
          await new Promise(r => setTimeout(r, 600));
        }

        await chrome.tabs.sendMessage(tab.id, {
          action: 'AUTOFILL',
          data: { fields, force: true }
        });

        showStatus(textStatus, '🚀 Autofill started on Meesho tab! Watch the form fill automatically.', 'success');
      } catch (err) {
        console.error('Autofill error:', err);
        showStatus(textStatus, '❌ Autofill failed: ' + err.message, 'error');
      }
    });
  }

  // Save Profile Button
  if (saveProfileBtn) {
    saveProfileBtn.addEventListener('click', async () => {
      const fields = collectFieldsFromUI();
      if (!fields.length) return;

      const profileName = prompt('Enter a name for this profile:', 'AI Generated - ' + new Date().toLocaleDateString());
      if (!profileName) return;

      const profileId = 'ai_' + Date.now();
      chrome.runtime.sendMessage({
        action: 'SAVE_AI_PROFILE',
        payload: { profileId, profileName, fields }
      }, (res) => {
        if (res && res.success) {
          showStatus(textStatus, `💾 Profile "${profileName}" saved!`, 'success');
        } else {
          showStatus(textStatus, '❌ Failed to save profile.', 'error');
        }
      });
    });
  }
}

// ─── Helper Functions ────────────────────────────────────────────────────────

function renderFieldsFromArray(fields, container) {
  container.innerHTML = '';
  for (const field of fields) {
    const label = field.label || field.selector;
    const row = document.createElement('div');
    row.className = 'field-row';
    row.dataset.selector = field.selector;

    const labelEl = document.createElement('div');
    labelEl.className = 'field-label';
    labelEl.textContent = label;
    labelEl.title = field.selector;

    const inputEl = document.createElement('input');
    inputEl.className = 'field-value';
    inputEl.type = 'text';
    inputEl.value = String(field.value || '');
    inputEl.dataset.selector = field.selector;

    row.appendChild(labelEl);
    row.appendChild(inputEl);
    container.appendChild(row);
  }
}

function collectFieldsFromUI() {
  const inputs = document.querySelectorAll('#fields-list .field-value');
  const fields = [];
  inputs.forEach(input => {
    const selector = input.dataset.selector;
    const value = input.value.trim();
    if (selector && value) {
      fields.push({ selector, value });
    }
  });
  return fields;
}

function applyPriceOverride(fields, price) {
  const priceStr = String(price).trim();
  let hasPriceField = false;
  const updated = fields.map(f => {
    const sel = f.selector || '';
    if (sel.includes('meesho_price') || (f.label && f.label.toLowerCase().includes('meesho price'))) {
      hasPriceField = true;
      return { ...f, value: priceStr };
    }
    return f;
  });
  if (!hasPriceField) {
    updated.push({ selector: 'input[id="meesho_price"]', value: priceStr, label: 'Meesho Price (₹)' });
  }
  return updated;
}

// Apply default values to fields - matches by selector/label and ALWAYS applies defaults
function applyDefaultFields(fields) {
  if (!defaultFields || Object.keys(defaultFields).length === 0) {
    return fields;
  }
  
  console.log('Applying defaults, defaultFields:', defaultFields);
  console.log('Fields received:', fields);
  
  // If no fields to process, return as-is
  if (!fields || !Array.isArray(fields) || fields.length === 0) {
    return fields;
  }
  
  let appliedCount = 0;
  
  const updatedFields = fields.map(f => {
    const sel = String(f.selector || '').toLowerCase();
    const lbl = String(f.label || '').toLowerCase();
    const val = String(f.value || '');
    let fieldKey = null;
    
    // Debug: log each field
    console.log('Processing field:', { selector: sel, label: lbl, value: val });
    
    // INVENTORY - highest priority match
    if (sel.includes('inventory') || lbl.includes('inventory') || lbl.includes('stock')) {
      fieldKey = 'inventory';
      console.log('Matched inventory fieldKey:', fieldKey);
    }
    // NET QUANTITY
    else if (sel.includes('net_quantity') || lbl.includes('net quantity') || lbl.includes('net qty')) {
      fieldKey = 'net_quantity';
    }
    // MULTIPACK
    else if (sel.includes('multipack') || lbl.includes('multipack')) {
      fieldKey = 'multipack';
    }
    // PACKAGING FIELDS
    else if (sel.includes('packaging_breadth') || lbl.includes('packaging breadth')) {
      fieldKey = 'packaging_breadth';
    }
    else if (sel.includes('packaging_height') || lbl.includes('packaging height')) {
      fieldKey = 'packaging_height';
    }
    else if (sel.includes('packaging_length') || lbl.includes('packaging length')) {
      fieldKey = 'packaging_length';
    }
    else if (sel.includes('packaging_unit') || lbl.includes('packaging unit')) {
      fieldKey = 'packaging_unit';
    }
    // PRODUCT DIMENSIONS
    else if (sel.includes('product_breadth') || lbl.includes('product breadth')) {
      fieldKey = 'product_breadth';
    }
    else if (sel.includes('product_height') || lbl.includes('product height')) {
      fieldKey = 'product_height';
    }
    else if (sel.includes('product_length') || lbl.includes('product length')) {
      fieldKey = 'product_length';
    }
    else if (sel.includes('product_unit') || lbl.includes('product unit')) {
      fieldKey = 'product_unit';
    }
    // TYPE
    else if (sel.includes('type') || lbl === 'type') {
      fieldKey = 'type';
    }
    // WEIGHT (not product_weight)
    else if ((sel.includes('weight') || lbl.includes('weight')) && !sel.includes('product_weight') && !lbl.includes('product weight')) {
      fieldKey = 'weight';
    }
    // WEIGHT UNIT
    else if (sel.includes('weight_unit') || lbl.includes('weight unit')) {
      fieldKey = 'weight_unit';
    }
    // COUNTRY OF ORIGIN
    else if (sel.includes('country_of_origin') || lbl.includes('country of origin') || lbl.includes('country')) {
      fieldKey = 'country_of_origin';
    }
    // MANUFACTURER
    else if (sel.includes('manufacturer_name') || lbl.includes('manufacturer name')) {
      fieldKey = 'manufacturer_name';
    }
    else if (sel.includes('manufacturer_address') || lbl.includes('manufacturer address')) {
      fieldKey = 'manufacturer_address';
    }
    else if (sel.includes('manufacturer_pincode') || lbl.includes('manufacturer pincode')) {
      fieldKey = 'manufacturer_pincode';
    }
    // PACKER
    else if (sel.includes('packer_name') || lbl.includes('packer name')) {
      fieldKey = 'packer_name';
    }
    else if (sel.includes('packer_address') || lbl.includes('packer address')) {
      fieldKey = 'packer_address';
    }
    else if (sel.includes('packer_pincode') || lbl.includes('packer pincode')) {
      fieldKey = 'packer_pincode';
    }
    // IMPORTER
    else if (sel.includes('importer_name') || lbl.includes('importer name')) {
      fieldKey = 'importer_name';
    }
    else if (sel.includes('importer_address') || lbl.includes('importer address')) {
      fieldKey = 'importer_address';
    }
    else if (sel.includes('importer_pincode') || lbl.includes('importer pincode')) {
      fieldKey = 'importer_pincode';
    }
    // GST
    else if (sel.includes('gst') || lbl.includes('gst') || lbl.includes('tax')) {
      fieldKey = 'supplier_gst_percent';
    }
    // HSN
    else if (sel.includes('hsn') || lbl.includes('hsn')) {
      fieldKey = 'hsn_code';
    }
    // PRODUCT WEIGHT
    else if (sel.includes('product_weight') || lbl.includes('product weight') || lbl.includes('weight in gms')) {
      fieldKey = 'product_weight_in_gms';
    }
    // CATEGORY
    else if (sel.includes('category') || lbl.includes('category')) {
      fieldKey = 'category';
    }
    // BRAND
    else if (sel.includes('brand') || lbl.includes('brand')) {
      fieldKey = 'brand';
    }
    // SKU
    else if (sel.includes('supplier_product_id') || sel.includes('sku') || lbl.includes('sku') || lbl.includes('product id')) {
      fieldKey = 'supplier_product_id';
    }
    
    // ALWAYS apply default if found - override any existing value
    if (fieldKey && defaultFields[fieldKey] && String(defaultFields[fieldKey]).trim() !== '') {
      console.log('Applying default for', fieldKey, ':', defaultFields[fieldKey], 'was:', val);
      appliedCount++;
      return { ...f, value: String(defaultFields[fieldKey]) };
    }
    
    return f;
  });
  
  console.log('Applied defaults to', appliedCount, 'fields');
  return updatedFields;
}

function showStatus(el, msg, type) {
  el.textContent = msg;
  el.className = 'status ' + type;
}

function clearStatus(el) {
  el.textContent = '';
  el.className = 'status';
}

function setButtonLoading(btn, loading, label, darkSpinner = false) {
  if (loading) {
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner${darkSpinner ? ' spinner-dark' : ''}"></span>${label}`;
  } else {
    btn.disabled = false;
    btn.textContent = label;
  }
}

