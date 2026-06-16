# Meesho AI Extension - Setup & License Management Guide

## Overview
This extension now includes a license key system for monetizing your Meesho AI tool. You can manually generate license keys and share them with clients via WhatsApp.

## Files Created/Modified

### Backend
- `license-manager.js` - License key management module
- `keys.json` - Stores all license keys
- `admin.json` - Admin credentials
- `server.js` - Updated with license validation

### Frontend
- `popup.html` - Main UI with auth screen
- `popup.js` - Updated with license validation
- `background.js` - Auth message handling
- `auth.html` - Standalone auth page
- `auth.js` - Standalone auth logic
- `manifest.json` - Updated permissions

## How to Generate License Keys

### Option 1: Using the Admin API (Recommended)

Make a POST request to generate a new license key:

```bash
# Replace with your actual credentials
curl -X POST http://localhost:5001/admin/generate-key \
  -H "Authorization: Basic YWRtaW46bWVlc2hvX2FkbWluXzIwMjQ=" \
  -H "Content-Type: application/json" \
  -d '{"plan": "monthly", "expiryDays": 30}'
```

The Authorization header is base64 encoded `username:password`. Default is `admin:meesho_admin_2024`

#### Response:
```json
{
  "success": true,
  "key": "MEESHO-XXXXX-XXXXX-XXXXX",
  "plan": "monthly",
  "expiry": "2024-12-31T23:59:59.000Z",
  "message": "License key generated successfully"
}
```

### Option 2: Create a Simple Admin Page

You can create a simple HTML page to generate keys. Let me know if you need this!

## Admin API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/admin/generate-key` | POST | Generate new license key |
| `/admin/keys` | GET | List all license keys |
| `/admin/deactivate-key` | POST | Deactivate a key |
| `/admin/key/:key` | GET | Get key info |
| `/admin/stats` | GET | Get license statistics |

## Default Admin Credentials

- **Username:** admin
- **Password:** meesho_admin_2024

**IMPORTANT:** Change the admin password in `admin.json` before going live!

## How to Distribute to Clients

1. **Generate a key** using the admin API
2. **Send via WhatsApp** to your client with instructions:
   ```
   Hi! Here's your license key for Meesho AI Tool:
   
   MEESHO-XXXXXXXX-XXXXXX-XXXXX
   
   To activate:
   1. Click the extension icon
   2. Enter this key
   3. Click "Activate Extension"
   
   Valid for 30 days. Contact for renewal!
   ```

## Testing Locally

1. Start the server:
   ```bash
   node server.js
   ```

2. Generate a test key:
   ```bash
   curl -X POST http://localhost:5001/admin/generate-key \
     -H "Authorization: Basic YWRtaW46bWVlc2hvX2FkbWluXzIwMjQ=" \
     -H "Content-Type: application/json" \
     -d '{"plan": "monthly", "expiryDays": 30}'
   ```

3. Load the extension in Chrome:
   - Go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the extension folder

4. Click the extension icon and enter your test key

## Going Live

1. **Change admin password** in `admin.json`
2. **Deploy server** to Railway/Render/VPS
3. **Update server URL** in popup.js if needed
4. **Test license generation** via API
5. **Distribute to clients!**

## Disable License Validation (Development)

For local development without license:
```bash
SKIP_LICENSE=true node server.js
```

Or in `.env` file:
```
SKIP_LICENSE=true
```

## Support

If you need help with:
- Creating an admin dashboard
- Payment integration
- Custom license plans
- Extension distribution

Let me know!

