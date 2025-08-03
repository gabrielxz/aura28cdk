import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { WebsiteStack } from '../lib/website-stack';
import * as fs from 'fs';
import * as path from 'path';

describe('WebsiteStack', () => {
  let app: cdk.App;
  let stack: WebsiteStack;
  let template: Template;

  // Create a temporary frontend/out directory for tests
  const frontendOutDir = path.join(__dirname, '../../frontend/out');

  beforeAll(() => {
    if (!fs.existsSync(frontendOutDir)) {
      fs.mkdirSync(frontendOutDir, { recursive: true });
      // Create a dummy index.html file
      fs.writeFileSync(path.join(frontendOutDir, 'index.html'), '<html></html>');
    }
  });

  afterAll(() => {
    // Clean up the temporary directory
    if (fs.existsSync(frontendOutDir)) {
      fs.rmSync(frontendOutDir, { recursive: true, force: true });
    }
  });

  beforeEach(() => {
    // Set bundling to use local mode for tests
    app = new cdk.App({
      context: {
        'aws:cdk:bundling-stacks': ['TestStack'],
      },
    });

    // Mock bundling for Lambda functions
    process.env.CDK_BUNDLING_STAGING_DISABLED = '1';

    stack = new WebsiteStack(app, 'TestStack', {
      domainName: 'example.com',
      subdomain: 'test',
      environment: 'dev',
      env: {
        account: '123456789012',
        region: 'us-east-1',
      },
    });
    template = Template.fromStack(stack);
  });

  test('S3 bucket is created with correct properties', () => {
    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketName: Match.stringLikeRegexp('aura28-dev-website-.*'),
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });

  test('CloudFront distribution is created', () => {
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: {
        DefaultRootObject: 'index.html',
        Enabled: true,
        HttpVersion: 'http2',
        IPV6Enabled: true,
      },
    });
  });

  test('CloudFront function for routing is created', () => {
    template.hasResourceProperties('AWS::CloudFront::Function', {
      FunctionConfig: {
        Runtime: 'cloudfront-js-1.0',
      },
    });
  });

  test('Route53 A record is created', () => {
    template.hasResourceProperties('AWS::Route53::RecordSet', {
      Name: 'test.example.com.',
      Type: 'A',
      AliasTarget: {
        DNSName: Match.anyValue(),
        HostedZoneId: Match.anyValue(),
      },
    });
  });

  test('ACM certificate is created', () => {
    template.hasResourceProperties('AWS::CertificateManager::Certificate', {
      DomainName: 'test.example.com',
      DomainValidationOptions: Match.anyValue(),
      Tags: Match.arrayWith([
        {
          Key: 'Project',
          Value: 'Aura28CDK',
        },
      ]),
    });
  });

  test('DynamoDB table is created with correct properties', () => {
    template.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'Aura28-dev-Users',
      BillingMode: 'PAY_PER_REQUEST',
      PointInTimeRecoverySpecification: {
        PointInTimeRecoveryEnabled: true,
      },
      KeySchema: [
        {
          AttributeName: 'userId',
          KeyType: 'HASH',
        },
        {
          AttributeName: 'createdAt',
          KeyType: 'RANGE',
        },
      ],
      AttributeDefinitions: [
        {
          AttributeName: 'userId',
          AttributeType: 'S',
        },
        {
          AttributeName: 'createdAt',
          AttributeType: 'S',
        },
      ],
    });
  });

  test('Resources are tagged with Project tag', () => {
    const resources = template.toJSON().Resources;

    // Check that S3 bucket has the tag
    const s3Resources = Object.entries(resources).filter(
      ([, resource]: [string, any]) => resource.Type === 'AWS::S3::Bucket',
    );

    expect(s3Resources.length).toBeGreaterThan(0);
    s3Resources.forEach(([, resource]: [string, any]) => {
      expect(resource.Properties.Tags).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            Key: 'Project',
            Value: 'Aura28CDK',
          }),
        ]),
      );
    });

    // Check that DynamoDB table has the tag
    const dynamoResources = Object.entries(resources).filter(
      ([, resource]: [string, any]) => resource.Type === 'AWS::DynamoDB::Table',
    );

    expect(dynamoResources.length).toBeGreaterThan(0);
    dynamoResources.forEach(([, resource]: [string, any]) => {
      expect(resource.Properties.Tags).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            Key: 'Project',
            Value: 'Aura28CDK',
          }),
        ]),
      );
    });
  });

  test('Production stack includes www redirect', () => {
    const prodApp = new cdk.App();
    const prodStack = new WebsiteStack(prodApp, 'ProdTestStack', {
      domainName: 'example.com',
      environment: 'prod',
      env: {
        account: '123456789012',
        region: 'us-east-1',
      },
    });
    const prodTemplate = Template.fromStack(prodStack);

    // Should have two A records (apex and www)
    const aRecords = prodTemplate.findResources('AWS::Route53::RecordSet', {
      Properties: {
        Type: 'A',
      },
    });

    expect(Object.keys(aRecords).length).toBe(2);
  });

  test('Production DynamoDB table has RETAIN removal policy', () => {
    const prodApp = new cdk.App();
    const prodStack = new WebsiteStack(prodApp, 'ProdTestStack', {
      domainName: 'example.com',
      environment: 'prod',
      env: {
        account: '123456789012',
        region: 'us-east-1',
      },
    });
    const prodTemplate = Template.fromStack(prodStack);

    // Check DynamoDB table has correct removal policy
    const dynamoResources = prodTemplate.findResources('AWS::DynamoDB::Table');
    Object.values(dynamoResources).forEach((resource: any) => {
      expect(resource.DeletionPolicy).toBe('Retain');
      expect(resource.UpdateReplacePolicy).toBe('Retain');
    });
  });
});
