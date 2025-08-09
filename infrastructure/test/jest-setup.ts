// Skip bundling for NodejsFunction during tests
process.env.AWS_CDK_SKIP_BUNDLING = 'true';

// Add custom matchers for aws-sdk-client-mock
import 'aws-sdk-client-mock-jest';
