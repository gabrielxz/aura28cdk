import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as cloudfront_origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53_targets from 'aws-cdk-lib/aws-route53-targets';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import { CognitoAuthConstruct } from './constructs/cognito-auth-construct';
import { ApiConstruct } from './constructs/api-construct';

export interface WebsiteStackProps extends cdk.StackProps {
  domainName: string;
  subdomain?: string;
  certificateArn?: string;
  environment: 'dev' | 'prod';
}

export class WebsiteStack extends cdk.Stack {
  public readonly distribution: cloudfront.Distribution;
  public readonly bucket: s3.Bucket;
  public readonly auth: CognitoAuthConstruct;
  public readonly userTable: dynamodb.Table;
  public readonly api: ApiConstruct;

  constructor(scope: Construct, id: string, props: WebsiteStackProps) {
    super(scope, id, props);

    // Tag all resources in this stack
    cdk.Tags.of(this).add('Project', 'Aura28CDK');

    const siteDomain = props.subdomain
      ? `${props.subdomain}.${props.domainName}`
      : props.domainName;

    // Create Cognito auth resources
    this.auth = new CognitoAuthConstruct(this, 'Auth', {
      environment: props.environment,
      domainPrefix: `aura28-${props.environment}`,
      callbackUrls: [`http://localhost:3000/auth/callback`, `https://${siteDomain}/auth/callback`],
      logoutUrls: [`http://localhost:3000`, `https://${siteDomain}`],
    });

    // Create DynamoDB table for user data
    this.userTable = new dynamodb.Table(this, 'UserTable', {
      tableName: `Aura28-${props.environment}-Users`,
      partitionKey: {
        name: 'userId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'createdAt',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy:
        props.environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      pointInTimeRecovery: true,
    });

    // Create API Gateway and Lambda functions
    this.api = new ApiConstruct(this, 'Api', {
      environment: props.environment,
      userTable: this.userTable,
      userPool: this.auth.userPool,
      allowedOrigins: [
        'http://localhost:3000',
        `https://${siteDomain}`,
        ...(props.environment === 'prod' ? [`https://www.${props.domainName}`] : []),
      ],
    });

    // Create S3 bucket for hosting
    this.bucket = new s3.Bucket(this, 'WebsiteBucket', {
      bucketName: `aura28-${props.environment}-website-${this.account}`,
      publicReadAccess: false,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy:
        props.environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: props.environment !== 'prod',
      lifecycleRules: [
        {
          id: 'AbortIncompleteMultipartUploads',
          abortIncompleteMultipartUploadAfter: cdk.Duration.days(7),
        },
      ],
    });

    // Get hosted zone
    const hostedZone = route53.HostedZone.fromLookup(this, 'HostedZone', {
      domainName: props.domainName,
    });

    // Create certificate (must be in us-east-1 for CloudFront)
    let certificate: acm.ICertificate;

    if (props.certificateArn) {
      certificate = acm.Certificate.fromCertificateArn(this, 'Certificate', props.certificateArn);
    } else {
      certificate = new acm.Certificate(this, 'Certificate', {
        domainName: siteDomain,
        subjectAlternativeNames:
          props.environment === 'prod' ? [`www.${props.domainName}`] : undefined,
        validation: acm.CertificateValidation.fromDns(hostedZone),
      });
    }

    // CloudFront Function for handling routing
    const routingFunction = new cloudfront.Function(this, 'RoutingFunction', {
      code: cloudfront.FunctionCode.fromInline(`
        function handler(event) {
          var request = event.request;
          var uri = request.uri;
          
          // Check if URI already has an extension
          if (uri.includes('.')) {
            return request;
          }
          
          // Check if URI ends with /
          if (uri.endsWith('/')) {
            request.uri = uri + 'index.html';
          } else {
            // Try to append .html
            request.uri = uri + '.html';
          }
          
          return request;
        }
      `),
    });

    // Create CloudFront distribution
    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultBehavior: {
        origin: cloudfront_origins.S3BucketOrigin.withOriginAccessControl(this.bucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        functionAssociations: [
          {
            function: routingFunction,
            eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
          },
        ],
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      },
      additionalBehaviors: {
        '/favicon*': {
          origin: cloudfront_origins.S3BucketOrigin.withOriginAccessControl(this.bucket),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: new cloudfront.CachePolicy(this, 'FaviconCachePolicy', {
            cachePolicyName: `aura28-${props.environment}-favicon-cache-policy`,
            defaultTtl: cdk.Duration.hours(1),
            maxTtl: cdk.Duration.hours(24),
            minTtl: cdk.Duration.seconds(0),
            enableAcceptEncodingGzip: true,
            enableAcceptEncodingBrotli: true,
            queryStringBehavior: cloudfront.CacheQueryStringBehavior.none(),
            headerBehavior: cloudfront.CacheHeaderBehavior.none(),
            cookieBehavior: cloudfront.CacheCookieBehavior.none(),
          }),
        },
      },
      domainNames:
        props.environment === 'prod' ? [props.domainName, `www.${props.domainName}`] : [siteDomain],
      certificate,
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/404.html',
          ttl: cdk.Duration.minutes(5),
        },
      ],
      defaultRootObject: 'index.html',
    });

    // Create Route53 A record
    new route53.ARecord(this, 'AliasRecord', {
      recordName: siteDomain,
      target: route53.RecordTarget.fromAlias(
        new route53_targets.CloudFrontTarget(this.distribution),
      ),
      zone: hostedZone,
    });

    // If production, create www redirect
    if (props.environment === 'prod') {
      new route53.ARecord(this, 'WwwAliasRecord', {
        recordName: `www.${props.domainName}`,
        target: route53.RecordTarget.fromAlias(
          new route53_targets.CloudFrontTarget(this.distribution),
        ),
        zone: hostedZone,
      });
    }

    // Deploy site contents
    new s3deploy.BucketDeployment(this, 'DeployWebsite', {
      sources: [s3deploy.Source.asset('../frontend/out')],
      destinationBucket: this.bucket,
      distribution: this.distribution,
      distributionPaths: ['/*'],
      prune: false,
    });

    // Output Cognito configuration for frontend
    new cdk.CfnOutput(this, 'CognitoUserPoolId', {
      value: this.auth.userPool.userPoolId,
      description: 'Cognito User Pool ID',
    });

    new cdk.CfnOutput(this, 'CognitoClientId', {
      value: this.auth.userPoolClient.userPoolClientId,
      description: 'Cognito Client ID',
    });

    new cdk.CfnOutput(this, 'CognitoDomain', {
      value: `aura28-${props.environment}`,
      description: 'Cognito Domain Prefix',
    });

    // Output CloudFront URL
    new cdk.CfnOutput(this, 'DistributionUrl', {
      value: `https://${siteDomain}`,
      description: 'Website URL',
    });

    new cdk.CfnOutput(this, 'CloudFrontUrl', {
      value: `https://${this.distribution.distributionDomainName}`,
      description: 'CloudFront Distribution URL',
    });

    new cdk.CfnOutput(this, 'UserTableName', {
      value: this.userTable.tableName,
      description: 'DynamoDB User Table Name',
    });

    new cdk.CfnOutput(this, 'ApiGatewayUrl', {
      value: this.api.api.url,
      description: 'API Gateway URL for frontend .env.local',
    });
  }
}
