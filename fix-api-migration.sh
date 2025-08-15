#!/bin/bash

# Script to fix API Gateway resource conflict during migration
# from /api/admin/readings/{readingId} to /api/admin/readings/{userId}/{readingId}

echo "==========================================="
echo "API Gateway Migration Fix Script"
echo "==========================================="
echo ""
echo "This script will fix the API Gateway resource conflict by:"
echo "1. Temporarily commenting out the admin reading detail routes"
echo "2. Deploying to remove the old routes from AWS"
echo "3. Uncommenting the routes with the new structure"
echo "4. Deploying again with the correct routes"
echo ""
read -p "Continue? (y/n) " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 1
fi

cd infrastructure

echo ""
echo "Step 1: Creating backup of api-construct.ts"
cp lib/constructs/api-construct.ts lib/constructs/api-construct.ts.backup

echo ""
echo "Step 2: Commenting out admin reading detail routes temporarily"
# Use sed to comment out the routes (lines 560-595)
sed -i '560,595s/^/\/\/ TEMP_REMOVE: /' lib/constructs/api-construct.ts

echo ""
echo "Step 3: Building the infrastructure"
npm run build

echo ""
echo "Step 4: Deploying to remove old routes (this will take a few minutes)"
npx cdk deploy -c env=dev --require-approval never

if [ $? -ne 0 ]; then
    echo "Deployment failed. Restoring original file..."
    mv lib/constructs/api-construct.ts.backup lib/constructs/api-construct.ts
    exit 1
fi

echo ""
echo "Step 5: Restoring routes with new structure"
sed -i 's/^\/\/ TEMP_REMOVE: //' lib/constructs/api-construct.ts

echo ""
echo "Step 6: Building again with new routes"
npm run build

echo ""
echo "Step 7: Final deployment with new routes"
npx cdk deploy -c env=dev --require-approval never

if [ $? -ne 0 ]; then
    echo "Final deployment failed."
    exit 1
fi

echo ""
echo "Step 8: Cleaning up backup file"
rm lib/constructs/api-construct.ts.backup

echo ""
echo "==========================================="
echo "Migration completed successfully!"
echo "API routes have been updated to use {userId}/{readingId}"
echo "==========================================="