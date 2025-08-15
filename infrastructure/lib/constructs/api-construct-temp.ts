// TEMPORARY FILE - Use this for first deployment to remove old routes
// After deployment, switch back to api-construct.ts

// Copy this section to api-construct.ts temporarily:
/*
    // GET /api/admin/readings - Get all readings (admin only)
    const adminReadingsResource = adminResource.addResource('readings');
    adminReadingsResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(this.adminGetAllReadingsFunction),
      {
        authorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      },
    );

    // TEMPORARILY COMMENTED OUT TO REMOVE OLD ROUTES
    // After deployment, uncomment the following section:
    
    /*
    // /api/admin/readings/{userId}/{readingId} resource
    const adminUserIdResource = adminReadingsResource.addResource('{userId}');
    const adminReadingIdResource = adminUserIdResource.addResource('{readingId}');

    // GET /api/admin/readings/{userId}/{readingId} - Get reading details (admin only)
    adminReadingIdResource.addMethod(
      'GET',
      new apigateway.LambdaIntegration(this.adminGetReadingDetailsFunction),
      {
        authorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      },
    );

    // DELETE /api/admin/readings/{userId}/{readingId} - Delete reading (admin only)
    adminReadingIdResource.addMethod(
      'DELETE',
      new apigateway.LambdaIntegration(this.adminDeleteReadingFunction),
      {
        authorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      },
    );

    // /api/admin/readings/{userId}/{readingId}/status resource
    const adminReadingStatusResource = adminReadingIdResource.addResource('status');

    // PATCH /api/admin/readings/{userId}/{readingId}/status - Update reading status (admin only)
    adminReadingStatusResource.addMethod(
      'PATCH',
      new apigateway.LambdaIntegration(this.adminUpdateReadingStatusFunction),
      {
        authorizer,
        authorizationType: apigateway.AuthorizationType.COGNITO,
      },
    );
    */
