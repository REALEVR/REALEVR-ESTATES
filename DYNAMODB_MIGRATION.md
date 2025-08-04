# DynamoDB Migration Guide

This guide explains how to migrate your RealEVR Estates application from Neon PostgreSQL to AWS DynamoDB.

## Overview

The migration includes:
- ✅ Complete DynamoDB storage implementation
- ✅ Direct AWS SDK connection (no Lambda functions)
- ✅ Retry logic and error handling
- ✅ Data migration utilities
- ✅ Table creation automation
- ✅ Backward compatibility with existing interfaces

## Prerequisites

1. **AWS Account**: You need an AWS account with DynamoDB access
2. **AWS Credentials**: IAM user with DynamoDB permissions
3. **Node.js Dependencies**: AWS SDK packages (already added to package.json)

## Required AWS Permissions

Your AWS IAM user needs the following DynamoDB permissions:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "dynamodb:CreateTable",
                "dynamodb:DescribeTable",
                "dynamodb:ListTables",
                "dynamodb:PutItem",
                "dynamodb:GetItem",
                "dynamodb:UpdateItem",
                "dynamodb:DeleteItem",
                "dynamodb:Scan",
                "dynamodb:Query"
            ],
            "Resource": "*"
        }
    ]
}
```

## Step-by-Step Migration

### 1. Install Dependencies

Dependencies are already added to package.json. If needed, install manually:

```bash
npm install @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb @aws-sdk/util-dynamodb
```

### 2. Configure AWS Credentials

Copy the example environment file and fill in your credentials:

```bash
cp .env.dynamodb.example .env
```

Edit `.env` and add your AWS credentials:

```env
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key_here
AWS_SECRET_ACCESS_KEY=your_secret_key_here
```

### FTP Configuration for Virtual Tours

For virtual tours to work correctly, you need to configure the FTP settings in your `.env` file. This includes the public-facing URL for your FTP content.

```env
# FTP Configuration
FTP_HOST=your_ftp_host
FTP_USER=your_ftp_username
FTP_PASSWORD=your_ftp_password
FTP_PUBLIC_URL=https://your-cdn-or-web-accessible-url.com
```

**Important:** The `FTP_PUBLIC_URL` is the base URL from which your tour content is served. This might be different from your `FTP_HOST`. For example, your `FTP_HOST` might be `ftp.yourdomain.com`, but the content might be served from `https://cdn.yourdomain.com`. The tour URL will be constructed as `${FTP_PUBLIC_URL}/tours/property_{propertyId}_tour/index.html`.

### 3. Set Up DynamoDB Tables

Run the setup script to create the required tables:

```bash
npm run dynamodb:setup
```

This will:
- Check your AWS connection
- Create the required tables if they don't exist
- Wait for tables to become active

### 4. Migrate Your Data

Choose one of the migration options:

#### Option A: Migrate from JSON file (recommended if you have data.json)

```bash
npm run dynamodb:migrate-from-json
```

#### Option B: Migrate from existing database

```bash
npm run dynamodb:migrate-from-db
```

### 5. Verify Migration

Check that your data was migrated successfully:

```bash
npm run dynamodb:verify
```

### 6. Update Your Application

The application is already configured to use DynamoDB storage. Simply restart your application:

```bash
npm run dev
```

## Table Structure

The migration creates four DynamoDB tables:

| Table Name | Primary Key | Purpose |
|------------|-------------|---------|
| `realevr-users` | `id` (String) | User accounts and profiles |
| `realevr-properties` | `id` (String) | Property listings |
| `realevr-amenities` | `id` (String) | Available amenities |
| `realevr-property-types` | `id` (String) | Property type categories |

## Key Features

### Direct Connection
- No Lambda functions required
- Direct AWS SDK integration
- Reduced latency and complexity

### Retry Logic
- Automatic retry for transient errors
- Exponential backoff
- Configurable retry limits

### Data Consistency
- Maintains existing data structure
- Preserves relationships
- Handles array fields (amenities)

### Error Handling
- Comprehensive error logging
- Graceful degradation
- Health checks

## Troubleshooting

### Common Issues

1. **"UnrecognizedClientException"**
   - Check your AWS credentials
   - Verify AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY

2. **"AccessDenied"**
   - Check IAM permissions
   - Ensure your user has DynamoDB access

3. **"NetworkingError"**
   - Check internet connection
   - Verify AWS region setting

4. **"ResourceNotFoundException"**
   - Tables don't exist
   - Run `npm run dynamodb:setup` first

### Manual Commands

You can also run migration commands directly:

```bash
# Setup tables
tsx server/setup-dynamodb.ts

# Migrate from JSON
tsx server/migrate-to-dynamodb.ts from-json

# Migrate from database
tsx server/migrate-to-dynamodb.ts from-db

# Verify migration
tsx server/migrate-to-dynamodb.ts verify
```

## Rollback Plan

If you need to rollback to the previous database:

1. Comment out the DynamoDB storage in `server/storage.ts`:
   ```typescript
   // export const storage = new DynamoDBStorage();
   export const storage = new DatabaseStorage();
   ```

2. Restart your application

## Cost Considerations

- DynamoDB uses pay-per-request billing mode
- No upfront costs
- You pay only for what you use
- Typically more cost-effective than maintaining a database server

## Performance Benefits

- **Scalability**: Automatic scaling based on demand
- **Availability**: 99.99% availability SLA
- **Speed**: Single-digit millisecond latency
- **Global**: Multi-region replication available

## Support

If you encounter issues:

1. Check the console logs for detailed error messages
2. Verify your AWS credentials and permissions
3. Ensure your internet connection is stable
4. Check AWS service status

## Files Created/Modified

### New Files
- `server/dynamodb.ts` - DynamoDB connection and utilities
- `server/dynamodb-storage.ts` - Storage implementation
- `server/migrate-to-dynamodb.ts` - Migration utilities
- `server/setup-dynamodb.ts` - Table setup script
- `.env.dynamodb.example` - Environment template

### Modified Files
- `package.json` - Added AWS SDK dependencies and scripts
- `server/storage.ts` - Updated to use DynamoDB storage

The migration is complete and ready to use! 🎉
