import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { WebsiteStack } from '../lib/website-stack';

describe('WebsiteStack', () => {
  let app: cdk.App;
  let stack: WebsiteStack;
  let template: Template;

  beforeEach(() => {
    app = new cdk.App();
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

  test('Resources are tagged with Project tag', () => {
    const resources = template.toJSON().Resources;

    // Check that S3 bucket has the tag
    const s3Resources = Object.entries(resources).filter(
      ([_key, resource]: [string, any]) => resource.Type === 'AWS::S3::Bucket',
    );

    expect(s3Resources.length).toBeGreaterThan(0);
    s3Resources.forEach(([_key, resource]: [string, any]) => {
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
});
