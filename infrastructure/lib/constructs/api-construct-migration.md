# API Gateway Migration Instructions

## Problem

The deployment is failing because API Gateway doesn't allow two sibling resources with path parameters. The old API structure has:

- `/api/admin/readings/{readingId}`

And we're trying to create a new structure:

- `/api/admin/readings/{userId}/{readingId}`

## Solution - Two-Step Deployment

### Step 1: Remove Old Routes (Temporary)

Comment out the admin reading routes temporarily to remove them from the stack:

1. Comment out lines in `api-construct.ts` that create the admin reading routes
2. Deploy to remove the old routes
3. Uncomment and deploy again with the new structure

### Alternative Solution - Manual AWS Console

1. Go to AWS API Gateway console
2. Find the Aura28-dev API
3. Delete the resource `/api/admin/readings/{readingId}` and its methods
4. Re-run the deployment

### Long-term Solution

Consider using resource names that don't conflict or versioning the API (e.g., `/api/v2/admin/readings/{userId}/{readingId}`)
