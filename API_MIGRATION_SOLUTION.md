# API Gateway Migration Solution

## Problem

The deployment to AWS failed with the error:

```
A sibling ({readingId}) of this resource already has a variable path part -- only one is allowed
```

This occurs because:

- The **old API structure** has: `/api/admin/readings/{readingId}`
- The **new API structure** needs: `/api/admin/readings/{userId}/{readingId}`
- API Gateway doesn't allow two sibling resources with path parameters

## Solution Options

### Option 1: Use the Migration Script (Recommended)

Run the provided migration script that handles the two-phase deployment automatically:

```bash
cd /path/to/aura28cdk
./fix-api-migration.sh
```

This script will:

1. Temporarily comment out the conflicting routes
2. Deploy to remove old routes from AWS
3. Restore the routes with the new structure
4. Deploy again with the correct routes

### Option 2: Manual Two-Phase Deployment

If you prefer to do it manually:

**Phase 1: Remove old routes**

1. Edit `infrastructure/lib/constructs/api-construct.ts`
2. Comment out lines 560-595 (the admin reading detail routes)
3. Deploy: `cd infrastructure && npx cdk deploy -c env=dev`

**Phase 2: Add new routes**

1. Uncomment the lines you commented in Phase 1
2. Deploy again: `cd infrastructure && npx cdk deploy -c env=dev`

### Option 3: Manual AWS Console Fix

1. Go to AWS API Gateway console
2. Find the Aura28-dev API
3. Navigate to Resources
4. Find `/api/admin/readings/{readingId}`
5. Delete this resource and all its methods
6. Re-run the deployment from GitHub Actions

## Root Cause

This happened because the API structure was changed from using just `{readingId}` to using composite keys `{userId}/{readingId}` to match the DynamoDB table structure. CloudFormation tried to create the new structure while the old one still existed, causing the conflict.

## Prevention

For future API structure changes:

- Consider versioning APIs (e.g., `/api/v2/admin/...`)
- Plan migration strategies before changing path parameters
- Use feature flags to gradually roll out API changes
