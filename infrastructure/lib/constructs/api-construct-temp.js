"use strict";
// TEMPORARY FILE - Use this for first deployment to remove old routes
// After deployment, switch back to api-construct.ts
Object.defineProperty(exports, "__esModule", { value: true });
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiYXBpLWNvbnN0cnVjdC10ZW1wLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiYXBpLWNvbnN0cnVjdC10ZW1wLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQSxzRUFBc0U7QUFDdEUsb0RBQW9EOztBQUVwRCxxREFBcUQ7QUFDckQ7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7TUFvRE0iLCJzb3VyY2VzQ29udGVudCI6WyIvLyBURU1QT1JBUlkgRklMRSAtIFVzZSB0aGlzIGZvciBmaXJzdCBkZXBsb3ltZW50IHRvIHJlbW92ZSBvbGQgcm91dGVzXG4vLyBBZnRlciBkZXBsb3ltZW50LCBzd2l0Y2ggYmFjayB0byBhcGktY29uc3RydWN0LnRzXG5cbi8vIENvcHkgdGhpcyBzZWN0aW9uIHRvIGFwaS1jb25zdHJ1Y3QudHMgdGVtcG9yYXJpbHk6XG4vKlxuICAgIC8vIEdFVCAvYXBpL2FkbWluL3JlYWRpbmdzIC0gR2V0IGFsbCByZWFkaW5ncyAoYWRtaW4gb25seSlcbiAgICBjb25zdCBhZG1pblJlYWRpbmdzUmVzb3VyY2UgPSBhZG1pblJlc291cmNlLmFkZFJlc291cmNlKCdyZWFkaW5ncycpO1xuICAgIGFkbWluUmVhZGluZ3NSZXNvdXJjZS5hZGRNZXRob2QoXG4gICAgICAnR0VUJyxcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHRoaXMuYWRtaW5HZXRBbGxSZWFkaW5nc0Z1bmN0aW9uKSxcbiAgICAgIHtcbiAgICAgICAgYXV0aG9yaXplcixcbiAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIC8vIFRFTVBPUkFSSUxZIENPTU1FTlRFRCBPVVQgVE8gUkVNT1ZFIE9MRCBST1VURVNcbiAgICAvLyBBZnRlciBkZXBsb3ltZW50LCB1bmNvbW1lbnQgdGhlIGZvbGxvd2luZyBzZWN0aW9uOlxuICAgIFxuICAgIC8qXG4gICAgLy8gL2FwaS9hZG1pbi9yZWFkaW5ncy97dXNlcklkfS97cmVhZGluZ0lkfSByZXNvdXJjZVxuICAgIGNvbnN0IGFkbWluVXNlcklkUmVzb3VyY2UgPSBhZG1pblJlYWRpbmdzUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3t1c2VySWR9Jyk7XG4gICAgY29uc3QgYWRtaW5SZWFkaW5nSWRSZXNvdXJjZSA9IGFkbWluVXNlcklkUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3tyZWFkaW5nSWR9Jyk7XG5cbiAgICAvLyBHRVQgL2FwaS9hZG1pbi9yZWFkaW5ncy97dXNlcklkfS97cmVhZGluZ0lkfSAtIEdldCByZWFkaW5nIGRldGFpbHMgKGFkbWluIG9ubHkpXG4gICAgYWRtaW5SZWFkaW5nSWRSZXNvdXJjZS5hZGRNZXRob2QoXG4gICAgICAnR0VUJyxcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHRoaXMuYWRtaW5HZXRSZWFkaW5nRGV0YWlsc0Z1bmN0aW9uKSxcbiAgICAgIHtcbiAgICAgICAgYXV0aG9yaXplcixcbiAgICAgICAgYXV0aG9yaXphdGlvblR5cGU6IGFwaWdhdGV3YXkuQXV0aG9yaXphdGlvblR5cGUuQ09HTklUTyxcbiAgICAgIH0sXG4gICAgKTtcblxuICAgIC8vIERFTEVURSAvYXBpL2FkbWluL3JlYWRpbmdzL3t1c2VySWR9L3tyZWFkaW5nSWR9IC0gRGVsZXRlIHJlYWRpbmcgKGFkbWluIG9ubHkpXG4gICAgYWRtaW5SZWFkaW5nSWRSZXNvdXJjZS5hZGRNZXRob2QoXG4gICAgICAnREVMRVRFJyxcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHRoaXMuYWRtaW5EZWxldGVSZWFkaW5nRnVuY3Rpb24pLFxuICAgICAge1xuICAgICAgICBhdXRob3JpemVyLFxuICAgICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgICAgfSxcbiAgICApO1xuXG4gICAgLy8gL2FwaS9hZG1pbi9yZWFkaW5ncy97dXNlcklkfS97cmVhZGluZ0lkfS9zdGF0dXMgcmVzb3VyY2VcbiAgICBjb25zdCBhZG1pblJlYWRpbmdTdGF0dXNSZXNvdXJjZSA9IGFkbWluUmVhZGluZ0lkUmVzb3VyY2UuYWRkUmVzb3VyY2UoJ3N0YXR1cycpO1xuXG4gICAgLy8gUEFUQ0ggL2FwaS9hZG1pbi9yZWFkaW5ncy97dXNlcklkfS97cmVhZGluZ0lkfS9zdGF0dXMgLSBVcGRhdGUgcmVhZGluZyBzdGF0dXMgKGFkbWluIG9ubHkpXG4gICAgYWRtaW5SZWFkaW5nU3RhdHVzUmVzb3VyY2UuYWRkTWV0aG9kKFxuICAgICAgJ1BBVENIJyxcbiAgICAgIG5ldyBhcGlnYXRld2F5LkxhbWJkYUludGVncmF0aW9uKHRoaXMuYWRtaW5VcGRhdGVSZWFkaW5nU3RhdHVzRnVuY3Rpb24pLFxuICAgICAge1xuICAgICAgICBhdXRob3JpemVyLFxuICAgICAgICBhdXRob3JpemF0aW9uVHlwZTogYXBpZ2F0ZXdheS5BdXRob3JpemF0aW9uVHlwZS5DT0dOSVRPLFxuICAgICAgfSxcbiAgICApO1xuICAgICovXG4iXX0=