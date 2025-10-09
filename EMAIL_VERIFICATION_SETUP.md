# Email Verification Setup Guide

This guide explains how to set up email verification for user registration in RealEVR Estates.

## Overview

The email verification system ensures that users provide valid email addresses during registration. Here's how it works:

1. **User Registration**: When a user registers, they receive a verification email
2. **Email Verification**: Users must click the verification link before they can log in
3. **Account Activation**: Once verified, users can access their account normally

## Features Implemented

### Backend Features
- ✅ Email verification token generation
- ✅ Verification email sending with HTML templates
- ✅ Email verification endpoint (`/api/verify-email`)
- ✅ Resend verification email endpoint (`/api/resend-verification`)
- ✅ Login protection for unverified users
- ✅ Database schema updates for verification tokens

### Frontend Features
- ✅ Updated registration flow (no auto-login)
- ✅ Email verification status messages
- ✅ Resend verification email functionality
- ✅ URL parameter handling for verification status
- ✅ User-friendly error messages

## Setup Instructions

### 1. Environment Variables

Add the following variables to your `.env` file:

```env
# Email Configuration
EMAIL_USER=your_email@gmail.com
EMAIL_PASSWORD=your_app_password_here
EMAIL_FROM=noreply@realevr.com

# Application Configuration
BASE_URL=http://localhost:5000
NODE_ENV=development
```

### 2. Email Service Configuration

#### For Gmail (Recommended for Development)
1. Enable 2-factor authentication on your Gmail account
2. Generate an App Password:
   - Go to Google Account settings
   - Security → 2-Step Verification → App passwords
   - Generate a password for "Mail"
3. Use your Gmail address as `EMAIL_USER`
4. Use the generated app password as `EMAIL_PASSWORD`

#### For Production
Consider using professional email services like:
- **SendGrid**: Reliable and scalable
- **Mailgun**: Developer-friendly
- **Amazon SES**: Cost-effective for high volume
- **Postmark**: Great for transactional emails

### 3. Database Migration

The database schema has been updated to include:
- `emailVerificationToken`: Stores the verification token
- `emailVerificationExpires`: Token expiration timestamp
- `isVerified`: Boolean flag for verification status

If using a SQL database, run the appropriate migration to add these fields.

## How It Works

### Registration Flow
1. User fills out registration form
2. System generates a unique verification token
3. User account is created with `isVerified: false`
4. Verification email is sent with a unique link
5. User receives success message asking them to check email

### Verification Flow
1. User clicks verification link in email
2. System validates the token and checks expiration
3. If valid, user account is marked as verified
4. User is redirected to login page with success message

### Login Flow
1. User attempts to log in
2. System checks if email is verified
3. If not verified, login is blocked with helpful message
4. User can request a new verification email

## API Endpoints

### POST /api/register
- **Purpose**: Register a new user
- **Changes**: No longer auto-logs in users
- **Response**: Includes verification status and message

### GET /api/verify-email?token=TOKEN
- **Purpose**: Verify email address
- **Parameters**: `token` (verification token)
- **Response**: Redirects to auth page with verification status

### POST /api/resend-verification
- **Purpose**: Resend verification email
- **Body**: `{ "email": "user@example.com" }`
- **Response**: Success/error message

### POST /api/login
- **Purpose**: User login
- **Changes**: Blocks unverified users
- **Response**: Includes verification requirement if needed

## Email Templates

The system includes professional HTML email templates with:
- RealEVR Estates branding
- Clear call-to-action buttons
- Mobile-responsive design
- Plain text fallback
- Security information

## Testing

### Development Testing
- Uses Ethereal Email for testing (no real emails sent)
- Check console for preview URLs during development
- Test with real email service before production

### Production Testing
1. Register a test account
2. Check email delivery
3. Verify link functionality
4. Test resend functionality
5. Confirm login protection works

## Troubleshooting

### Common Issues

**Emails not sending**
- Check EMAIL_USER and EMAIL_PASSWORD
- Verify Gmail app password is correct
- Check firewall/network restrictions

**Verification links not working**
- Ensure BASE_URL is correct
- Check token expiration (24 hours)
- Verify database token storage

**Users can't log in after verification**
- Check database `isVerified` field
- Verify token cleanup after verification
- Check for case sensitivity in email addresses

### Debug Mode
Set `NODE_ENV=development` to see detailed email logs and preview URLs.

## Security Considerations

- Tokens expire after 24 hours
- Tokens are cryptographically secure (32 bytes)
- Verification tokens are cleared after use
- Email addresses are validated before sending
- Rate limiting should be implemented for resend requests

## Future Enhancements

Potential improvements:
- Email template customization
- Multiple verification attempts tracking
- Admin panel for managing verification status
- Bulk verification for imported users
- Integration with email analytics services
