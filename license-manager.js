/**
 * License Manager for Meesho AI Extension
 * Handles license key generation, validation, and management
 */

const fs = require('fs');
const path = require('path');

const KEYS_FILE = path.join(__dirname, 'keys.json');
const ADMIN_FILE = path.join(__dirname, 'admin.json');

// Default admin credentials
const DEFAULT_ADMIN = {
  username: 'admin',
  password: 'meesho_admin_2024' // CHANGE THIS!
};

// Initialize files if they don't exist
function initFiles() {
  if (!fs.existsSync(KEYS_FILE)) {
    fs.writeFileSync(KEYS_FILE, JSON.stringify({ keys: [] }, null, 2));
  }
  if (!fs.existsSync(ADMIN_FILE)) {
    fs.writeFileSync(ADMIN_FILE, JSON.stringify(DEFAULT_ADMIN, null, 2));
  }
}

initFiles();

// Generate a unique license key
function generateLicenseKey(prefix = 'MEESHO') {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}

// Get all license keys
function getAllKeys() {
  const data = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
  return data.keys;
}

// Add a new license key
function addKey(plan = 'monthly', expiryDays = 30) {
  const data = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
  
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + expiryDays);
  
  const newKey = {
    key: generateLicenseKey(),
    plan: plan,
    created: new Date().toISOString(),
    expiry: expiryDate.toISOString(),
    active: true,
    usedBy: null,
    usageCount: 0
  };
  
  data.keys.push(newKey);
  fs.writeFileSync(KEYS_FILE, JSON.stringify(data, null, 2));
  
  return newKey;
}

// Validate a license key
function validateKey(key) {
  const data = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
  
  const found = data.keys.find(k => k.key === key);
  
  if (!found) {
    return { valid: false, error: 'License key not found' };
  }
  
  if (!found.active) {
    return { valid: false, error: 'License key has been deactivated' };
  }
  
  const now = new Date();
  const expiry = new Date(found.expiry);
  
  if (now > expiry) {
    return { valid: false, error: 'License key has expired' };
  }
  
  return {
    valid: true,
    key: found.key,
    plan: found.plan,
    expiry: found.expiry,
    remainingDays: Math.ceil((expiry - now) / (1000 * 60 * 60 * 24))
  };
}

// Use/validate a license key (increment usage)
function useKey(key) {
  const data = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
  
  const index = data.keys.findIndex(k => k.key === key);
  
  if (index === -1) {
    return { success: false, error: 'License key not found' };
  }
  
  const found = data.keys[index];
  
  if (!found.active) {
    return { success: false, error: 'License key has been deactivated' };
  }
  
  const now = new Date();
  const expiry = new Date(found.expiry);
  
  if (now > expiry) {
    return { success: false, error: 'License key has expired' };
  }
  
  data.keys[index].usageCount += 1;
  fs.writeFileSync(KEYS_FILE, JSON.stringify(data, null, 2));
  
  return { success: true };
}

// Deactivate a license key
function deactivateKey(key) {
  const data = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
  
  const index = data.keys.findIndex(k => k.key === key);
  
  if (index === -1) {
    return { success: false, error: 'License key not found' };
  }
  
  data.keys[index].active = false;
  fs.writeFileSync(KEYS_FILE, JSON.stringify(data, null, 2));
  
  return { success: true };
}

// Get key info (without sensitive data)
function getKeyInfo(key) {
  const data = JSON.parse(fs.readFileSync(KEYS_FILE, 'utf8'));
  
  const found = data.keys.find(k => k.key === key);
  
  if (!found) {
    return null;
  }
  
  return {
    key: found.key,
    plan: found.plan,
    created: found.created,
    expiry: found.expiry,
    active: found.active,
    usageCount: found.usageCount
  };
}

// Export functions
module.exports = {
  generateLicenseKey,
  getAllKeys,
  addKey,
  validateKey,
  useKey,
  deactivateKey,
  getKeyInfo
};

