# Dropbox Integration Setup Guide

This guide will help you migrate from Firebase to Dropbox for virtual tour storage and set up the tour preview functionality.

## Overview of Changes

✅ **What's Been Done:**
1. Created `dropbox-storage.ts` module for Dropbox integration
2. Updated `upload.ts` to use Dropbox instead of Firebase
3. Updated `routes.ts` to use Dropbox storage
4. Added tour preview endpoint `/api/tours/preview/:propertyId`
5. Fixed the missing `tour-config.ts` module
6. Installed required dependencies (`dropbox` package)

## 🔧 Setup Instructions

### 1. Get Dropbox Access Token

You'll need to get an access token from Dropbox:

1. Go to https://www.dropbox.com/developers/apps
2. Click "Create app"
3. Choose "Scoped access"
4. Choose "Full Dropbox" (or "App folder" if you prefer)
5. Name your app (e.g., "RealEVR-Tours")
6. Go to the "Settings" tab
7. Scroll down to "Generated access token"
8. Click "Generate" to get your access token

### 2. Environment Variables

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

Edit `.env` and add your Dropbox access token:
```
DROPBOX_CLIENT_ID=wifh2kcy9zxidec
DROPBOX_CLIENT_SECRET=mkm08rg0k06ohja
DROPBOX_ACCESS_TOKEN=your_access_token_here
```

### 3. Test the Setup

After setting up your environment variables:

1. Start your server:
   ```bash
   npm run dev
   ```

2. Upload a virtual tour zip file using your existing upload form
3. The tour should now be uploaded to Dropbox instead of Firebase

## 🔄 How the Migration Works

### Dropbox URL Format
- **Old Firebase URL**: `https://firebasestorage.googleapis.com/v0/b/moxiescreen.appspot.com/o/tours%2Fproperty_W9bc2iUN...`
- **New Dropbox URL**: `https://dl.dropboxusercontent.com/s/abc123/index.html`

### Key Differences:
1. **Direct Access**: Dropbox URLs can be directly embedded in iframes
2. **No Download Issues**: Unlike Firebase URLs, Dropbox URLs properly serve HTML content
3. **Better Performance**: Dropbox provides better streaming for 3D tour content

## 📱 Tour Preview Functionality

### New Preview Endpoint
```
GET /api/tours/preview/:propertyId
```

**Response:**
```json
{
  "propertyId": 123,
  "propertyTitle": "Sample Property",
  "tourUrl": "https://dl.dropboxusercontent.com/s/abc123/index.html",
  "previewHtml": "<!DOCTYPE html>..."
}
```

### Frontend Integration
```javascript
// Fetch tour preview
const response = await fetch(`/api/tours/preview/${propertyId}`);
const tourData = await response.json();

// Use in iframe
const iframe = document.createElement('iframe');
iframe.src = tourData.tourUrl;
iframe.style.width = '100%';
iframe.style.height = '500px';
iframe.setAttribute('allowfullscreen', '');
document.getElementById('tour-container').appendChild(iframe);
```

### Preview in Property Form
After a successful upload, you can preview the tour using:
```javascript
// When upload completes with success and tourUrl
if (uploadResponse.tourUrl) {
  // Show preview iframe
  showTourPreview(uploadResponse.tourUrl);
}

function showTourPreview(tourUrl) {
  const previewContainer = document.getElementById('tour-preview');
  previewContainer.innerHTML = `
    <div style="width: 100%; height: 400px; border: 1px solid #ddd; border-radius: 8px;">
      <iframe 
        src="${tourUrl}" 
        style="width: 100%; height: 100%; border: none; border-radius: 8px;"
        allowfullscreen>
      </iframe>
    </div>
  `;
}
```

## 🔍 Troubleshooting

### Issue: "DROPBOX_ACCESS_TOKEN not found"
**Solution:** Make sure you've created a `.env` file with your Dropbox access token.

### Issue: "Failed to create shared link"
**Solution:** Check that your Dropbox app has the correct permissions:
- File content management
- File and folder sharing

### Issue: Tour not previewing correctly
**Solution:** Verify that the uploaded files include an `index.html` or `index.htm` file.

### Issue: "Tour not found in storage" error
**Solution:** This occurs when trying to enable a tour for a property that doesn't have uploaded tour files. Upload the tour first.

## 📊 File Structure in Dropbox

Your tours will be organized in Dropbox as:
```
/tours/
  ├── property_123/
  │   └── property_123_tour/
  │       ├── index.html
  │       ├── assets/
  │       └── ...
  └── property_456/
      └── property_456_tour/
          ├── index.html
          ├── assets/
          └── ...
```

## 🚀 Performance Benefits

1. **Better Loading**: Dropbox URLs load directly in browsers without download prompts
2. **CDN Performance**: Dropbox uses a global CDN for faster content delivery
3. **No Size Limits**: Unlike Firebase's URL length limits, Dropbox handles large tour files better
4. **Cost Effective**: Dropbox storage is more cost-effective for large files

## 🔐 Security Considerations

1. **Public Links**: Tours are accessible via public Dropbox links
2. **Access Control**: Implement your own access control in the application layer
3. **Link Expiration**: Consider implementing link rotation for sensitive content

## 📞 Support

If you encounter any issues:
1. Check the server logs for detailed error messages
2. Verify all environment variables are set correctly
3. Ensure your Dropbox app has the required permissions
4. Test with a small tour file first to validate the setup
