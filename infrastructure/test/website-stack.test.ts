import * as cdk from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import { WebsiteStack } from '../lib/website-stack';
import * as fs from 'fs';
import * as path from 'path';

describe('WebsiteStack', () => {
  let app: cdk.App;
  let stack: WebsiteStack | null = null;
  let template: Template | null = null;

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

  // Check if Docker is available
  const isDockerAvailable = () => {
    try {
      require('child_process').execSync('docker --version', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  };

  const dockerAvailable = isDockerAvailable();

  beforeEach(() => {
    if (!dockerAvailable) {
      // Skip test setup if Docker is not available
      return;
    }

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

  // Skip tests if Docker is not available
  const itIfDocker = dockerAvailable ? test : test.skip;

  itIfDocker('S3 bucket is created with correct properties', () => {
    expect(template).not.toBeNull();
    template!.hasResourceProperties('AWS::S3::Bucket', {
      BucketName: Match.stringLikeRegexp('aura28-dev-website-.*'),
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });

  itIfDocker('CloudFront distribution is created', () => {
    expect(template).not.toBeNull();
    template!.hasResource('AWS::CloudFront::Distribution', {
      Properties: {
        DistributionConfig: {
          Aliases: ['test.example.com'],
          ViewerCertificate: {
            AcmCertificateArn: Match.anyValue(),
            MinimumProtocolVersion: 'TLSv1.2_2021',
            SslSupportMethod: 'sni-only',
          },
        },
      },
    });
  });

  itIfDocker('CloudFront function for routing is created', () => {
    expect(template).not.toBeNull();
    template!.hasResourceProperties('AWS::CloudFront::Function', {
      Name: Match.stringLikeRegexp('Aura28.*Routing.*'),
      FunctionConfig: {
        Runtime: 'cloudfront-js-2.0',
      },
    });
  });

  itIfDocker('Route53 A record is created', () => {
    expect(template).not.toBeNull();
    template!.hasResourceProperties('AWS::Route53::RecordSet', {
      Type: 'A',
      AliasTarget: Match.objectLike({
        DNSName: Match.anyValue(),
      }),
    });
  });

  itIfDocker('ACM certificate is created', () => {
    expect(template).not.toBeNull();
    template!.hasResourceProperties('AWS::CertificateManager::Certificate', {
      DomainName: 'test.example.com',
      DomainValidationOptions: [
        {
          DomainName: 'test.example.com',
          HostedZoneId: Match.anyValue(),
        },
      ],
      ValidationMethod: 'DNS',
    });
  });

  itIfDocker('DynamoDB table is created with correct properties', () => {
    expect(template).not.toBeNull();
    template!.hasResourceProperties('AWS::DynamoDB::Table', {
      TableName: 'Aura28-dev-Users',
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
      BillingMode: 'PAY_PER_REQUEST',
      PointInTimeRecoverySpecification: {
        PointInTimeRecoveryEnabled: true,
      },
    });
  });

  itIfDocker('Resources are tagged with Project tag', () => {
    expect(template).not.toBeNull();
    const stackJson = template!.toJSON();
    const resources = stackJson.Resources;
    let hasProjectTag = false;

    // Check if at least some resources have the Project tag
    for (const resourceKey in resources) {
      const resource = resources[resourceKey];
      if (resource.Properties && resource.Properties.Tags) {
        const projectTag = resource.Properties.Tags.find(
          (tag: any) => tag.Key === 'Project' && tag.Value === 'Aura28CDK',
        );
        if (projectTag) {
          hasProjectTag = true;
          break;
        }
      }
    }

    expect(hasProjectTag).toBe(true);
  });

  itIfDocker('Production stack includes www redirect', () => {
    if (!dockerAvailable) return;

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

    // Check for www redirect bucket
    prodTemplate.hasResourceProperties('AWS::S3::Bucket', {
      WebsiteConfiguration: {
        RedirectAllRequestsTo: {
          HostName: 'example.com',
          Protocol: 'https',
        },
      },
    });

    // Check for www distribution
    prodTemplate.hasResource('AWS::CloudFront::Distribution', {
      Properties: {
        DistributionConfig: {
          Aliases: ['www.example.com'],
        },
      },
    });
  });

  itIfDocker('Production DynamoDB table has RETAIN removal policy', () => {
    if (!dockerAvailable) return;

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

    // Check for DynamoDB table with RETAIN policy
    prodTemplate.hasResource('AWS::DynamoDB::Table', {
      DeletionPolicy: 'Retain',
      UpdateReplacePolicy: 'Retain',
      Properties: {
        TableName: 'Aura28-prod-Users',
      },
    });
  });
});
