/**
 * Background Service Worker for Meesho AI Extension
 * Handles authentication state and message routing
 */

// Storage keys
const STORAGE_KEYS = {
  licenseKey: 'meesho_license_key',
  licenseInfo: 'meesho_license_info',
  isLoggedIn: 'is_logged_in'
};

// ─── Message Listeners ────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  
  // Handle license validation from popup
  if (message.action === 'CHECK_LICENSE') {
    checkLicenseStatus().then(result => {
      sendResponse(result);
    });
    return true;
  }
  
  // Handle logout
  if (message.action === 'LOGOUT') {
    handleLogout().then(result => {
      sendResponse(result);
    });
    return true;
  }
  
  // Handle open popup after login
  if (message.action === 'OPEN_POPUP') {
    // Store the license info if provided
    if (message.licenseKey && message.licenseInfo) {
      chrome.storage.local.set({
        [STORAGE_KEYS.licenseKey]: message.licenseKey,
        [STORAGE_KEYS.licenseInfo]: message.licenseInfo,
        [STORAGE_KEYS.isLoggedIn]: true
      });
    }
    
    // Update badge to show logged in
    chrome.action.setBadgeBackgroundColor({ color: '#00FF00' });
    chrome.action.setBadgeText({ text: '✓' });
    
    sendResponse({ success: true });
    return true;
  }
  
  // Handle save field
  if (message.action === 'SAVE_FIELD') {
    handleSaveField(message.payload).then(result => {
      sendResponse({ success: result });
    });
    return true;
  }
  
  // Handle save AI profile
  if (message.action === 'SAVE_AI_PROFILE') {
    handleSaveAIProfile(message.payload).then(result => {
      sendResponse({ success: result });
    });
    return true;
  }
});

// ─── Check License Status ─────────────────────────────────────────────────────
async function checkLicenseStatus() {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEYS.licenseKey, STORAGE_KEYS.licenseInfo, STORAGE_KEYS.isLoggedIn], (result) => {
      if (result.licenseKey && result.licenseInfo && result.isLoggedIn) {
        resolve({
          isLoggedIn: true,
          licenseKey: result.licenseKey,
          licenseInfo: result.licenseInfo
        });
      } else {
        resolve({ isLoggedIn: false });
      }
    });
  });
}

// ─── Handle Logout ───────────────────────────────────────────────────────────
async function handleLogout() {
  return new Promise((resolve) => {
    chrome.storage.local.remove([
      STORAGE_KEYS.licenseKey,
      STORAGE_KEYS.licenseInfo,
      STORAGE_KEYS.isLoggedIn
    ], () => {
      // Reset badge
      chrome.action.setBadgeText({ text: '' });
      resolve({ success: true });
    });
  });
}

// ─── Save Field Handler ─────────────────────────────────────────────────────
async function handleSaveField(payload) {
  try {
    const { profileId, field } = payload;
    if (!profileId || !field) return false;
    
    let profiles = (await chrome.storage.local.get(['profiles'])).profiles || {};
    
    if (!profiles[profileId]) return false;
    
    const index = profiles[profileId].fields.findIndex(f => f.selector === field.selector);
    
    if (index > -1) {
      profiles[profileId].fields[index] = field;
    } else {
      profiles[profileId].fields.push(field);
    }
    
    await chrome.storage.local.set({ profiles });
    return true;
  } catch (e) {
    return false;
  }
}

// ─── Save AI Profile Handler ────────────────────────────────────────────────
async function handleSaveAIProfile(payload) {
  try {
    const { profileId, profileName, fields } = payload;
    if (!profileId || !profileName || !fields) return false;
    
    const data = await chrome.storage.local.get(['profiles']);
    const profiles = data.profiles || {};
    
    profiles[profileId] = {
      id: profileId,
      name: profileName,
      fields: fields,
      createdAt: Date.now(),
      source: 'ai-text'
    };
    
    await chrome.storage.local.set({ profiles });
    return true;
  } catch (e) {
    return false;
  }
}

// ─── Extension Install/Update Handler ───────────────────────────────────────
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Fresh install - clear any old data
    chrome.storage.local.clear();
    chrome.action.setBadgeText({ text: '' });
  }
});

// ─── Check license on startup ───────────────────────────────────────────────
chrome.runtime.onStartup.addListener(() => {
  checkLicenseStatus().then(result => {
    if (result.isLoggedIn) {
      chrome.action.setBadgeBackgroundColor({ color: '#00FF00' });
      chrome.action.setBadgeText({ text: '✓' });
    }
  });
});

