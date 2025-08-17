"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebsiteStack = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const s3 = __importStar(require("aws-cdk-lib/aws-s3"));
const cloudfront = __importStar(require("aws-cdk-lib/aws-cloudfront"));
const cloudfront_origins = __importStar(require("aws-cdk-lib/aws-cloudfront-origins"));
const s3deploy = __importStar(require("aws-cdk-lib/aws-s3-deployment"));
const acm = __importStar(require("aws-cdk-lib/aws-certificatemanager"));
const route53 = __importStar(require("aws-cdk-lib/aws-route53"));
const route53_targets = __importStar(require("aws-cdk-lib/aws-route53-targets"));
const dynamodb = __importStar(require("aws-cdk-lib/aws-dynamodb"));
const location = __importStar(require("aws-cdk-lib/aws-location"));
const cognito_auth_construct_1 = require("./constructs/cognito-auth-construct");
const api_construct_1 = require("./constructs/api-construct");
const swetest_layer_construct_1 = require("./constructs/swetest-layer-construct");
class WebsiteStack extends cdk.Stack {
    distribution;
    bucket;
    auth;
    userTable;
    api;
    constructor(scope, id, props) {
        super(scope, id, props);
        // Tag all resources in this stack
        cdk.Tags.of(this).add('Project', 'Aura28CDK');
        const siteDomain = props.subdomain
            ? `${props.subdomain}.${props.domainName}`
            : props.domainName;
        // Create Cognito auth resources
        this.auth = new cognito_auth_construct_1.CognitoAuthConstruct(this, 'Auth', {
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
            removalPolicy: props.environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
            pointInTimeRecoverySpecification: {
                pointInTimeRecoveryEnabled: true,
            },
        });
        // Create Amazon Location Service Place Index
        const placeIndex = new location.CfnPlaceIndex(this, 'PlaceIndex', {
            indexName: `Aura28-${props.environment}-PlaceIndex`,
            dataSource: 'Here',
            description: 'Place index for Aura28 application',
            pricingPlan: 'RequestBasedUsage',
        });
        // Create DynamoDB table for natal chart data
        const natalChartTable = new dynamodb.Table(this, 'NatalChartTable', {
            tableName: `Aura28-${props.environment}-NatalCharts`,
            partitionKey: {
                name: 'userId',
                type: dynamodb.AttributeType.STRING,
            },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: props.environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
            pointInTimeRecoverySpecification: {
                pointInTimeRecoveryEnabled: true,
            },
        });
        // Create DynamoDB table for readings
        const readingsTable = new dynamodb.Table(this, 'ReadingsTable', {
            tableName: `Aura28-${props.environment}-Readings`,
            partitionKey: {
                name: 'userId',
                type: dynamodb.AttributeType.STRING,
            },
            sortKey: {
                name: 'readingId',
                type: dynamodb.AttributeType.STRING,
            },
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
            removalPolicy: props.environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
            pointInTimeRecoverySpecification: {
                pointInTimeRecoveryEnabled: true,
            },
        });
        // Create Swiss Ephemeris layer construct
        const swetestLayer = new swetest_layer_construct_1.SwetestLayerConstruct(this, 'SwetestLayer', {
            environment: props.environment,
        });
        // Create API Gateway and Lambda functions
        this.api = new api_construct_1.ApiConstruct(this, 'Api', {
            environment: props.environment,
            userTable: this.userTable,
            natalChartTable: natalChartTable,
            readingsTable: readingsTable,
            userPool: this.auth.userPool,
            placeIndexName: placeIndex.indexName,
            allowedOrigins: [
                'http://localhost:3000',
                `https://${siteDomain}`,
                ...(props.environment === 'prod' ? [`https://www.${props.domainName}`] : []),
            ],
            swissEphemerisLayerArn: swetestLayer.layerVersionArn, // Pass the layer ARN from the construct
        });
        // Create S3 bucket for hosting
        this.bucket = new s3.Bucket(this, 'WebsiteBucket', {
            bucketName: `aura28-${props.environment}-website-${this.account}`,
            publicReadAccess: false,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            removalPolicy: props.environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
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
        let certificate;
        if (props.certificateArn) {
            certificate = acm.Certificate.fromCertificateArn(this, 'Certificate', props.certificateArn);
        }
        else {
            certificate = new acm.Certificate(this, 'Certificate', {
                domainName: siteDomain,
                subjectAlternativeNames: props.environment === 'prod' ? [`www.${props.domainName}`] : undefined,
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
            domainNames: props.environment === 'prod' ? [props.domainName, `www.${props.domainName}`] : [siteDomain],
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
            target: route53.RecordTarget.fromAlias(new route53_targets.CloudFrontTarget(this.distribution)),
            zone: hostedZone,
        });
        // If production, create www redirect
        if (props.environment === 'prod') {
            new route53.ARecord(this, 'WwwAliasRecord', {
                recordName: `www.${props.domainName}`,
                target: route53.RecordTarget.fromAlias(new route53_targets.CloudFrontTarget(this.distribution)),
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
exports.WebsiteStack = WebsiteStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2Vic2l0ZS1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIndlYnNpdGUtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFDbkMsdURBQXlDO0FBQ3pDLHVFQUF5RDtBQUN6RCx1RkFBeUU7QUFDekUsd0VBQTBEO0FBQzFELHdFQUEwRDtBQUMxRCxpRUFBbUQ7QUFDbkQsaUZBQW1FO0FBQ25FLG1FQUFxRDtBQUNyRCxtRUFBcUQ7QUFFckQsZ0ZBQTJFO0FBQzNFLDhEQUEwRDtBQUMxRCxrRkFBNkU7QUFTN0UsTUFBYSxZQUFhLFNBQVEsR0FBRyxDQUFDLEtBQUs7SUFDekIsWUFBWSxDQUEwQjtJQUN0QyxNQUFNLENBQVk7SUFDbEIsSUFBSSxDQUF1QjtJQUMzQixTQUFTLENBQWlCO0lBQzFCLEdBQUcsQ0FBZTtJQUVsQyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQXdCO1FBQ2hFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLGtDQUFrQztRQUNsQyxHQUFHLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxHQUFHLENBQUMsU0FBUyxFQUFFLFdBQVcsQ0FBQyxDQUFDO1FBRTlDLE1BQU0sVUFBVSxHQUFHLEtBQUssQ0FBQyxTQUFTO1lBQ2hDLENBQUMsQ0FBQyxHQUFHLEtBQUssQ0FBQyxTQUFTLElBQUksS0FBSyxDQUFDLFVBQVUsRUFBRTtZQUMxQyxDQUFDLENBQUMsS0FBSyxDQUFDLFVBQVUsQ0FBQztRQUVyQixnQ0FBZ0M7UUFDaEMsSUFBSSxDQUFDLElBQUksR0FBRyxJQUFJLDZDQUFvQixDQUFDLElBQUksRUFBRSxNQUFNLEVBQUU7WUFDakQsV0FBVyxFQUFFLEtBQUssQ0FBQyxXQUFXO1lBQzlCLFlBQVksRUFBRSxVQUFVLEtBQUssQ0FBQyxXQUFXLEVBQUU7WUFDM0MsWUFB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Q3pDLEtBQUssRUFBRSxXQUFXLFVBQVUsRUFBRTtZQUM5QixXQUFXLEVBQUUsYUFBYTtTQUMzQixDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLGVBQWUsRUFBRTtZQUN2QyxLQUFLLEVBQUUsV0FBVyxJQUFJLENBQUMsWUFBWSxDQUFDLHNCQUFzQixFQUFFO1lBQzVELFdBQVcsRUFBRSw2QkFBNkI7U0FDM0MsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxlQUFlLEVBQUU7WUFDdkMsS0FBSyxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsU0FBUztZQUMvQixXQUFXLEVBQUUsMEJBQTBCO1NBQ3hDLENBQUMsQ0FBQztRQUVILElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsZUFBZSxFQUFFO1lBQ3ZDLEtBQUssRUFBRSxJQUFJLENBQUMsR0FBRyxDQUFDLEdBQUcsQ0FBQyxHQUFHO1lBQ3ZCLFdBQVcsRUFBRSx5Q0FBeUM7U0FDdkQsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBclJELG9DQXFSQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgKiBhcyBzMyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtczMnO1xuaW1wb3J0ICogYXMgY2xvdWRmcm9udCBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY2xvdWRmcm9udCc7XG5pbXBvcnQgKiBhcyBjbG91ZGZyb250X29yaWdpbnMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWNsb3VkZnJvbnQtb3JpZ2lucyc7XG5pbXBvcnQgKiBhcyBzM2RlcGxveSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtczMtZGVwbG95bWVudCc7XG5pbXBvcnQgKiBhcyBhY20gZnJvbSAnYXdzLWNkay1saWIvYXdzLWNlcnRpZmljYXRlbWFuYWdlcic7XG5pbXBvcnQgKiBhcyByb3V0ZTUzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1yb3V0ZTUzJztcbmltcG9ydCAqIGFzIHJvdXRlNTNfdGFyZ2V0cyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtcm91dGU1My10YXJnZXRzJztcbmltcG9ydCAqIGFzIGR5bmFtb2RiIGZyb20gJ2F3cy1jZGstbGliL2F3cy1keW5hbW9kYic7XG5pbXBvcnQgKiBhcyBsb2NhdGlvbiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbG9jYXRpb24nO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQgeyBDb2duaXRvQXV0aENvbnN0cnVjdCB9IGZyb20gJy4vY29uc3RydWN0cy9jb2duaXRvLWF1dGgtY29uc3RydWN0JztcbmltcG9ydCB7IEFwaUNvbnN0cnVjdCB9IGZyb20gJy4vY29uc3RydWN0cy9hcGktY29uc3RydWN0JztcbmltcG9ydCB7IFN3ZXRlc3RMYXllckNvbnN0cnVjdCB9IGZyb20gJy4vY29uc3RydWN0cy9zd2V0ZXN0LWxheWVyLWNvbnN0cnVjdCc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgV2Vic2l0ZVN0YWNrUHJvcHMgZXh0ZW5kcyBjZGsuU3RhY2tQcm9wcyB7XG4gIGRvbWFpbk5hbWU6IHN0cmluZztcbiAgc3ViZG9tYWluPzogc3RyaW5nO1xuICBjZXJ0aWZpY2F0ZUFybj86IHN0cmluZztcbiAgZW52aXJvbm1lbnQ6ICdkZXYnIHwgJ3Byb2QnO1xufVxuXG5leHBvcnQgY2xhc3MgV2Vic2l0ZVN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgcHVibGljIHJlYWRvbmx5IGRpc3RyaWJ1dGlvbjogY2xvdWRmcm9udC5EaXN0cmlidXRpb247XG4gIHB1YmxpYyByZWFkb25seSBidWNrZXQ6IHMzLkJ1Y2tldDtcbiAgcHVibGljIHJlYWRvbmx5IGF1dGg6IENvZ25pdG9BdXRoQ29uc3RydWN0O1xuICBwdWJsaWMgcmVhZG9ubHkgdXNlclRhYmxlOiBkeW5hbW9kYi5UYWJsZTtcbiAgcHVibGljIHJlYWRvbmx5IGFwaTogQXBpQ29uc3RydWN0O1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBXZWJzaXRlU3RhY2tQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xuXG4gICAgLy8gVGFnIGFsbCByZXNvdXJjZXMgaW4gdGhpcyBzdGFja1xuICAgIGNkay5UYWdzLm9mKHRoaXMpLmFkZCgnUHJvamVjdCcsICdBdXJhMjhDREsnKTtcblxuICAgIGNvbnN0IHNpdGVEb21haW4gPSBwcm9wcy5zdWJkb21haW5cbiAgICAgID8gYCR7cHJvcHMuc3ViZG9tYWlufS4ke3Byb3BzLmRvbWFpbk5hbWV9YFxuICAgICAgOiBwcm9wcy5kb21haW5OYW1lO1xuXG4gICAgLy8gQ3JlYXRlIENvZ25pdG8gYXV0aCByZXNvdXJjZXNcbiAgICB0aGlzLmF1dGggPSBuZXcgQ29nbml0b0F1dGhDb25zdHJ1Y3QodGhpcywgJ0F1dGgnLCB7XG4gICAgICBlbnZpcm9ubWVudDogcHJvcHMuZW52aXJvbm1lbnQsXG4gICAgICBkb21haW5QcmVmaXg6IGBhdXJhMjgtJHtwcm9wcy5lbnZpcm9ubWVudH1gLFxuICAgICAgY2FsbGJhY2tVcmxzOiBbYGh0dHA6Ly9sb2NhbGhvc3Q6MzAwMC9hdXRoL2NhbGxiYWNrYCwgYGh0dHBzOi8vJHtzaXRlRG9tYWlufS9hdXRoL2NhbGxiYWNrYF0sXG4gICAgICBsb2dvdXRVcmxzOiBbYGh0dHA6Ly9sb2NhbGhvc3Q6MzAwMGAsIGBodHRwczovLyR7c2l0ZURvbWFpbn1gXSxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBEeW5hbW9EQiB0YWJsZSBmb3IgdXNlciBkYXRhXG4gICAgdGhpcy51c2VyVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgJ1VzZXJUYWJsZScsIHtcbiAgICAgIHRhYmxlTmFtZTogYEF1cmEyOC0ke3Byb3BzLmVudmlyb25tZW50fS1Vc2Vyc2AsXG4gICAgICBwYXJ0aXRpb25LZXk6IHtcbiAgICAgICAgbmFtZTogJ3VzZXJJZCcsXG4gICAgICAgIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HLFxuICAgICAgfSxcbiAgICAgIHNvcnRLZXk6IHtcbiAgICAgICAgbmFtZTogJ2NyZWF0ZWRBdCcsXG4gICAgICAgIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HLFxuICAgICAgfSxcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXG4gICAgICByZW1vdmFsUG9saWN5OlxuICAgICAgICBwcm9wcy5lbnZpcm9ubWVudCA9PT0gJ3Byb2QnID8gY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOIDogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIHBvaW50SW5UaW1lUmVjb3ZlcnlTcGVjaWZpY2F0aW9uOiB7XG4gICAgICAgIHBvaW50SW5UaW1lUmVjb3ZlcnlFbmFibGVkOiB0cnVlLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBBbWF6b24gTG9jYXRpb24gU2VydmljZSBQbGFjZSBJbmRleFxuICAgIGNvbnN0IHBsYWNlSW5kZXggPSBuZXcgbG9jYXRpb24uQ2ZuUGxhY2VJbmRleCh0aGlzLCAnUGxhY2VJbmRleCcsIHtcbiAgICAgIGluZGV4TmFtZTogYEF1cmEyOC0ke3Byb3BzLmVudmlyb25tZW50fS1QbGFjZUluZGV4YCxcbiAgICAgIGRhdGFTb3VyY2U6ICdIZXJlJyxcbiAgICAgIGRlc2NyaXB0aW9uOiAnUGxhY2UgaW5kZXggZm9yIEF1cmEyOCBhcHBsaWNhdGlvbicsXG4gICAgICBwcmljaW5nUGxhbjogJ1JlcXVlc3RCYXNlZFVzYWdlJyxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBEeW5hbW9EQiB0YWJsZSBmb3IgbmF0YWwgY2hhcnQgZGF0YVxuICAgIGNvbnN0IG5hdGFsQ2hhcnRUYWJsZSA9IG5ldyBkeW5hbW9kYi5UYWJsZSh0aGlzLCAnTmF0YWxDaGFydFRhYmxlJywge1xuICAgICAgdGFibGVOYW1lOiBgQXVyYTI4LSR7cHJvcHMuZW52aXJvbm1lbnR9LU5hdGFsQ2hhcnRzYCxcbiAgICAgIHBhcnRpdGlvbktleToge1xuICAgICAgICBuYW1lOiAndXNlcklkJyxcbiAgICAgICAgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcsXG4gICAgICB9LFxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcbiAgICAgIHJlbW92YWxQb2xpY3k6XG4gICAgICAgIHByb3BzLmVudmlyb25tZW50ID09PSAncHJvZCcgPyBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4gOiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgcG9pbnRJblRpbWVSZWNvdmVyeVNwZWNpZmljYXRpb246IHtcbiAgICAgICAgcG9pbnRJblRpbWVSZWNvdmVyeUVuYWJsZWQ6IHRydWUsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIER5bmFtb0RCIHRhYmxlIGZvciByZWFkaW5nc1xuICAgIGNvbnN0IHJlYWRpbmdzVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgJ1JlYWRpbmdzVGFibGUnLCB7XG4gICAgICB0YWJsZU5hbWU6IGBBdXJhMjgtJHtwcm9wcy5lbnZpcm9ubWVudH0tUmVhZGluZ3NgLFxuICAgICAgcGFydGl0aW9uS2V5OiB7XG4gICAgICAgIG5hbWU6ICd1c2VySWQnLFxuICAgICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyxcbiAgICAgIH0sXG4gICAgICBzb3J0S2V5OiB7XG4gICAgICAgIG5hbWU6ICdyZWFkaW5nSWQnLFxuICAgICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyxcbiAgICAgIH0sXG4gICAgICBiaWxsaW5nTW9kZTogZHluYW1vZGIuQmlsbGluZ01vZGUuUEFZX1BFUl9SRVFVRVNULFxuICAgICAgcmVtb3ZhbFBvbGljeTpcbiAgICAgICAgcHJvcHMuZW52aXJvbm1lbnQgPT09ICdwcm9kJyA/IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTiA6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICBwb2ludEluVGltZVJlY292ZXJ5U3BlY2lmaWNhdGlvbjoge1xuICAgICAgICBwb2ludEluVGltZVJlY292ZXJ5RW5hYmxlZDogdHJ1ZSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgU3dpc3MgRXBoZW1lcmlzIGxheWVyIGNvbnN0cnVjdFxuICAgIGNvbnN0IHN3ZXRlc3RMYXllciA9IG5ldyBTd2V0ZXN0TGF5ZXJDb25zdHJ1Y3QodGhpcywgJ1N3ZXRlc3RMYXllcicsIHtcbiAgICAgIGVudmlyb25tZW50OiBwcm9wcy5lbnZpcm9ubWVudCxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBBUEkgR2F0ZXdheSBhbmQgTGFtYmRhIGZ1bmN0aW9uc1xuICAgIHRoaXMuYXBpID0gbmV3IEFwaUNvbnN0cnVjdCh0aGlzLCAnQXBpJywge1xuICAgICAgZW52aXJvbm1lbnQ6IHByb3BzLmVudmlyb25tZW50LFxuICAgICAgdXNlclRhYmxlOiB0aGlzLnVzZXJUYWJsZSxcbiAgICAgIG5hdGFsQ2hhcnRUYWJsZTogbmF0YWxDaGFydFRhYmxlLFxuICAgICAgcmVhZGluZ3NUYWJsZTogcmVhZGluZ3NUYWJsZSxcbiAgICAgIHVzZXJQb29sOiB0aGlzLmF1dGgudXNlclBvb2wsXG4gICAgICBwbGFjZUluZGV4TmFtZTogcGxhY2VJbmRleC5pbmRleE5hbWUsXG4gICAgICBhbGxvd2VkT3JpZ2luczogW1xuICAgICAgICAnaHR0cDovL2xvY2FsaG9zdDozMDAwJyxcbiAgICAgICAgYGh0dHBzOi8vJHtzaXRlRG9tYWlufWAsXG4gICAgICAgIC4uLihwcm9wcy5lbnZpcm9ubWVudCA9PT0gJ3Byb2QnID8gW2BodHRwczovL3d3dy4ke3Byb3BzLmRvbWFpbk5hbWV9YF0gOiBbXSksXG4gICAgICBdLFxuICAgICAgc3dpc3NFcGhlbWVyaXNMYXllckFybjogc3dldGVzdExheWVyLmxheWVyVmVyc2lvbkFybiwgLy8gUGFzcyB0aGUgbGF5ZXIgQVJOIGZyb20gdGhlIGNvbnN0cnVjdFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIFMzIGJ1Y2tldCBmb3IgaG9zdGluZ1xuICAgIHRoaXMuYnVja2V0ID0gbmV3IHMzLkJ1Y2tldCh0aGlzLCAnV2Vic2l0ZUJ1Y2tldCcsIHtcbiAgICAgIGJ1Y2tldE5hbWU6IGBhdXJhMjgtJHtwcm9wcy5lbnZpcm9ubWVudH0td2Vic2l0ZS0ke3RoaXMuYWNjb3VudH1gLFxuICAgICAgcHVibGljUmVhZEFjY2VzczogZmFsc2UsXG4gICAgICBibG9ja1B1YmxpY0FjY2VzczogczMuQmxvY2tQdWJsaWNBY2Nlc3MuQkxPQ0tfQUxMLFxuICAgICAgcmVtb3ZhbFBvbGljeTpcbiAgICAgICAgcHJvcHMuZW52aXJvbm1lbnQgPT09ICdwcm9kJyA/IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTiA6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICBhdXRvRGVsZXRlT2JqZWN0czogcHJvcHMuZW52aXJvbm1lbnQgIT09ICdwcm9kJyxcbiAgICAgIGxpZmVjeWNsZVJ1bGVzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBpZDogJ0Fib3J0SW5jb21wbGV0ZU11bHRpcGFydFVwbG9hZHMnLFxuICAgICAgICAgIGFib3J0SW5jb21wbGV0ZU11bHRpcGFydFVwbG9hZEFmdGVyOiBjZGsuRHVyYXRpb24uZGF5cyg3KSxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICAvLyBHZXQgaG9zdGVkIHpvbmVcbiAgICBjb25zdCBob3N0ZWRab25lID0gcm91dGU1My5Ib3N0ZWRab25lLmZyb21Mb29rdXAodGhpcywgJ0hvc3RlZFpvbmUnLCB7XG4gICAgICBkb21haW5OYW1lOiBwcm9wcy5kb21haW5OYW1lLFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIGNlcnRpZmljYXRlIChtdXN0IGJlIGluIHVzLWVhc3QtMSBmb3IgQ2xvdWRGcm9udClcbiAgICBsZXQgY2VydGlmaWNhdGU6IGFjbS5JQ2VydGlmaWNhdGU7XG5cbiAgICBpZiAocHJvcHMuY2VydGlmaWNhdGVBcm4pIHtcbiAgICAgIGNlcnRpZmljYXRlID0gYWNtLkNlcnRpZmljYXRlLmZyb21DZXJ0aWZpY2F0ZUFybih0aGlzLCAnQ2VydGlmaWNhdGUnLCBwcm9wcy5jZXJ0aWZpY2F0ZUFybik7XG4gICAgfSBlbHNlIHtcbiAgICAgIGNlcnRpZmljYXRlID0gbmV3IGFjbS5DZXJ0aWZpY2F0ZSh0aGlzLCAnQ2VydGlmaWNhdGUnLCB7XG4gICAgICAgIGRvbWFpbk5hbWU6IHNpdGVEb21haW4sXG4gICAgICAgIHN1YmplY3RBbHRlcm5hdGl2ZU5hbWVzOlxuICAgICAgICAgIHByb3BzLmVudmlyb25tZW50ID09PSAncHJvZCcgPyBbYHd3dy4ke3Byb3BzLmRvbWFpbk5hbWV9YF0gOiB1bmRlZmluZWQsXG4gICAgICAgIHZhbGlkYXRpb246IGFjbS5DZXJ0aWZpY2F0ZVZhbGlkYXRpb24uZnJvbURucyhob3N0ZWRab25lKSxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIENsb3VkRnJvbnQgRnVuY3Rpb24gZm9yIGhhbmRsaW5nIHJvdXRpbmdcbiAgICBjb25zdCByb3V0aW5nRnVuY3Rpb24gPSBuZXcgY2xvdWRmcm9udC5GdW5jdGlvbih0aGlzLCAnUm91dGluZ0Z1bmN0aW9uJywge1xuICAgICAgY29kZTogY2xvdWRmcm9udC5GdW5jdGlvbkNvZGUuZnJvbUlubGluZShgXG4gICAgICAgIGZ1bmN0aW9uIGhhbmRsZXIoZXZlbnQpIHtcbiAgICAgICAgICB2YXIgcmVxdWVzdCA9IGV2ZW50LnJlcXVlc3Q7XG4gICAgICAgICAgdmFyIHVyaSA9IHJlcXVlc3QudXJpO1xuICAgICAgICAgIFxuICAgICAgICAgIC8vIENoZWNrIGlmIFVSSSBhbHJlYWR5IGhhcyBhbiBleHRlbnNpb25cbiAgICAgICAgICBpZiAodXJpLmluY2x1ZGVzKCcuJykpIHtcbiAgICAgICAgICAgIHJldHVybiByZXF1ZXN0O1xuICAgICAgICAgIH1cbiAgICAgICAgICBcbiAgICAgICAgICAvLyBDaGVjayBpZiBVUkkgZW5kcyB3aXRoIC9cbiAgICAgICAgICBpZiAodXJpLmVuZHNXaXRoKCcvJykpIHtcbiAgICAgICAgICAgIHJlcXVlc3QudXJpID0gdXJpICsgJ2luZGV4Lmh0bWwnO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAvLyBUcnkgdG8gYXBwZW5kIC5odG1sXG4gICAgICAgICAgICByZXF1ZXN0LnVyaSA9IHVyaSArICcuaHRtbCc7XG4gICAgICAgICAgfVxuICAgICAgICAgIFxuICAgICAgICAgIHJldHVybiByZXF1ZXN0O1xuICAgICAgICB9XG4gICAgICBgKSxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBDbG91ZEZyb250IGRpc3RyaWJ1dGlvblxuICAgIHRoaXMuZGlzdHJpYnV0aW9uID0gbmV3IGNsb3VkZnJvbnQuRGlzdHJpYnV0aW9uKHRoaXMsICdEaXN0cmlidXRpb24nLCB7XG4gICAgICBkZWZhdWx0QmVoYXZpb3I6IHtcbiAgICAgICAgb3JpZ2luOiBjbG91ZGZyb250X29yaWdpbnMuUzNCdWNrZXRPcmlnaW4ud2l0aE9yaWdpbkFjY2Vzc0NvbnRyb2wodGhpcy5idWNrZXQpLFxuICAgICAgICB2aWV3ZXJQcm90b2NvbFBvbGljeTogY2xvdWRmcm9udC5WaWV3ZXJQcm90b2NvbFBvbGljeS5SRURJUkVDVF9UT19IVFRQUyxcbiAgICAgICAgZnVuY3Rpb25Bc3NvY2lhdGlvbnM6IFtcbiAgICAgICAgICB7XG4gICAgICAgICAgICBmdW5jdGlvbjogcm91dGluZ0Z1bmN0aW9uLFxuICAgICAgICAgICAgZXZlbnRUeXBlOiBjbG91ZGZyb250LkZ1bmN0aW9uRXZlbnRUeXBlLlZJRVdFUl9SRVFVRVNULFxuICAgICAgICAgIH0sXG4gICAgICAgIF0sXG4gICAgICAgIGNhY2hlUG9saWN5OiBjbG91ZGZyb250LkNhY2hlUG9saWN5LkNBQ0hJTkdfT1BUSU1JWkVELFxuICAgICAgfSxcbiAgICAgIGFkZGl0aW9uYWxCZWhhdmlvcnM6IHtcbiAgICAgICAgJy9mYXZpY29uKic6IHtcbiAgICAgICAgICBvcmlnaW46IGNsb3VkZnJvbnRfb3JpZ2lucy5TM0J1Y2tldE9yaWdpbi53aXRoT3JpZ2luQWNjZXNzQ29udHJvbCh0aGlzLmJ1Y2tldCksXG4gICAgICAgICAgdmlld2VyUHJvdG9jb2xQb2xpY3k6IGNsb3VkZnJvbnQuVmlld2VyUHJvdG9jb2xQb2xpY3kuUkVESVJFQ1RfVE9fSFRUUFMsXG4gICAgICAgICAgY2FjaGVQb2xpY3k6IG5ldyBjbG91ZGZyb250LkNhY2hlUG9saWN5KHRoaXMsICdGYXZpY29uQ2FjaGVQb2xpY3knLCB7XG4gICAgICAgICAgICBjYWNoZVBvbGljeU5hbWU6IGBhdXJhMjgtJHtwcm9wcy5lbnZpcm9ubWVudH0tZmF2aWNvbi1jYWNoZS1wb2xpY3lgLFxuICAgICAgICAgICAgZGVmYXVsdFR0bDogY2RrLkR1cmF0aW9uLmhvdXJzKDEpLFxuICAgICAgICAgICAgbWF4VHRsOiBjZGsuRHVyYXRpb24uaG91cnMoMjQpLFxuICAgICAgICAgICAgbWluVHRsOiBjZGsuRHVyYXRpb24uc2Vjb25kcygwKSxcbiAgICAgICAgICAgIGVuYWJsZUFjY2VwdEVuY29kaW5nR3ppcDogdHJ1ZSxcbiAgICAgICAgICAgIGVuYWJsZUFjY2VwdEVuY29kaW5nQnJvdGxpOiB0cnVlLFxuICAgICAgICAgICAgcXVlcnlTdHJpbmdCZWhhdmlvcjogY2xvdWRmcm9udC5DYWNoZVF1ZXJ5U3RyaW5nQmVoYXZpb3Iubm9uZSgpLFxuICAgICAgICAgICAgaGVhZGVyQmVoYXZpb3I6IGNsb3VkZnJvbnQuQ2FjaGVIZWFkZXJCZWhhdmlvci5ub25lKCksXG4gICAgICAgICAgICBjb29raWVCZWhhdmlvcjogY2xvdWRmcm9udC5DYWNoZUNvb2tpZUJlaGF2aW9yLm5vbmUoKSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgfSxcbiAgICAgIH0sXG4gICAgICBkb21haW5OYW1lczpcbiAgICAgICAgcHJvcHMuZW52aXJvbm1lbnQgPT09ICdwcm9kJyA/IFtwcm9wcy5kb21haW5OYW1lLCBgd3d3LiR7cHJvcHMuZG9tYWluTmFtZX1gXSA6IFtzaXRlRG9tYWluXSxcbiAgICAgIGNlcnRpZmljYXRlLFxuICAgICAgZXJyb3JSZXNwb25zZXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIGh0dHBTdGF0dXM6IDQwNCxcbiAgICAgICAgICByZXNwb25zZUh0dHBTdGF0dXM6IDIwMCxcbiAgICAgICAgICByZXNwb25zZVBhZ2VQYXRoOiAnLzQwNC5odG1sJyxcbiAgICAgICAgICB0dGw6IGNkay5EdXJhdGlvbi5taW51dGVzKDUpLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICAgIGRlZmF1bHRSb290T2JqZWN0OiAnaW5kZXguaHRtbCcsXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgUm91dGU1MyBBIHJlY29yZFxuICAgIG5ldyByb3V0ZTUzLkFSZWNvcmQodGhpcywgJ0FsaWFzUmVjb3JkJywge1xuICAgICAgcmVjb3JkTmFtZTogc2l0ZURvbWFpbixcbiAgICAgIHRhcmdldDogcm91dGU1My5SZWNvcmRUYXJnZXQuZnJvbUFsaWFzKFxuICAgICAgICBuZXcgcm91dGU1M190YXJnZXRzLkNsb3VkRnJvbnRUYXJnZXQodGhpcy5kaXN0cmlidXRpb24pLFxuICAgICAgKSxcbiAgICAgIHpvbmU6IGhvc3RlZFpvbmUsXG4gICAgfSk7XG5cbiAgICAvLyBJZiBwcm9kdWN0aW9uLCBjcmVhdGUgd3d3IHJlZGlyZWN0XG4gICAgaWYgKHByb3BzLmVudmlyb25tZW50ID09PSAncHJvZCcpIHtcbiAgICAgIG5ldyByb3V0ZTUzLkFSZWNvcmQodGhpcywgJ1d3d0FsaWFzUmVjb3JkJywge1xuICAgICAgICByZWNvcmROYW1lOiBgd3d3LiR7cHJvcHMuZG9tYWluTmFtZX1gLFxuICAgICAgICB0YXJnZXQ6IHJvdXRlNTMuUmVjb3JkVGFyZ2V0LmZyb21BbGlhcyhcbiAgICAgICAgICBuZXcgcm91dGU1M190YXJnZXRzLkNsb3VkRnJvbnRUYXJnZXQodGhpcy5kaXN0cmlidXRpb24pLFxuICAgICAgICApLFxuICAgICAgICB6b25lOiBob3N0ZWRab25lLFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gRGVwbG95IHNpdGUgY29udGVudHNcbiAgICBuZXcgczNkZXBsb3kuQnVja2V0RGVwbG95bWVudCh0aGlzLCAnRGVwbG95V2Vic2l0ZScsIHtcbiAgICAgIHNvdXJjZXM6IFtzM2RlcGxveS5Tb3VyY2UuYXNzZXQoJy4uL2Zyb250ZW5kL291dCcpXSxcbiAgICAgIGRlc3RpbmF0aW9uQnVja2V0OiB0aGlzLmJ1Y2tldCxcbiAgICAgIGRpc3RyaWJ1dGlvbjogdGhpcy5kaXN0cmlidXRpb24sXG4gICAgICBkaXN0cmlidXRpb25QYXRoczogWycvKiddLFxuICAgICAgcHJ1bmU6IGZhbHNlLFxuICAgIH0pO1xuXG4gICAgLy8gT3V0cHV0IENvZ25pdG8gY29uZmlndXJhdGlvbiBmb3IgZnJvbnRlbmRcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQ29nbml0b1VzZXJQb29sSWQnLCB7XG4gICAgICB2YWx1ZTogdGhpcy5hdXRoLnVzZXJQb29sLnVzZXJQb29sSWQsXG4gICAgICBkZXNjcmlwdGlvbjogJ0NvZ25pdG8gVXNlciBQb29sIElEJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdDb2duaXRvQ2xpZW50SWQnLCB7XG4gICAgICB2YWx1ZTogdGhpcy5hdXRoLnVzZXJQb29sQ2xpZW50LnVzZXJQb29sQ2xpZW50SWQsXG4gICAgICBkZXNjcmlwdGlvbjogJ0NvZ25pdG8gQ2xpZW50IElEJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdDb2duaXRvRG9tYWluJywge1xuICAgICAgdmFsdWU6IGBhdXJhMjgtJHtwcm9wcy5lbnZpcm9ubWVudH1gLFxuICAgICAgZGVzY3JpcHRpb246ICdDb2duaXRvIERvbWFpbiBQcmVmaXgnLFxuICAgIH0pO1xuXG4gICAgLy8gT3V0cHV0IENsb3VkRnJvbnQgVVJMXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0Rpc3RyaWJ1dGlvblVybCcsIHtcbiAgICAgIHZhbHVlOiBgaHR0cHM6Ly8ke3NpdGVEb21haW59YCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnV2Vic2l0ZSBVUkwnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0Nsb3VkRnJvbnRVcmwnLCB7XG4gICAgICB2YWx1ZTogYGh0dHBzOi8vJHt0aGlzLmRpc3RyaWJ1dGlvbi5kaXN0cmlidXRpb25Eb21haW5OYW1lfWAsXG4gICAgICBkZXNjcmlwdGlvbjogJ0Nsb3VkRnJvbnQgRGlzdHJpYnV0aW9uIFVSTCcsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnVXNlclRhYmxlTmFtZScsIHtcbiAgICAgIHZhbHVlOiB0aGlzLnVzZXJUYWJsZS50YWJsZU5hbWUsXG4gICAgICBkZXNjcmlwdGlvbjogJ0R5bmFtb0RCIFVzZXIgVGFibGUgTmFtZScsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQXBpR2F0ZXdheVVybCcsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmFwaS5hcGkudXJsLFxuICAgICAgZGVzY3JpcHRpb246ICdBUEkgR2F0ZXdheSBVUkwgZm9yIGZyb250ZW5kIC5lbnYubG9jYWwnLFxuICAgIH0pO1xuICB9XG59XG4iXX0=