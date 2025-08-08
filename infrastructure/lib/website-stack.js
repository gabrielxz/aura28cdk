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
            pointInTimeRecovery: true,
        });
        // Create Amazon Location Service Place Index
        const placeIndex = new location.CfnPlaceIndex(this, 'PlaceIndex', {
            indexName: `Aura28-${props.environment}-PlaceIndex`,
            dataSource: 'Here',
            description: 'Place index for Aura28 application',
            pricingPlan: 'RequestBasedUsage',
        });
        // Create API Gateway and Lambda functions
        this.api = new api_construct_1.ApiConstruct(this, 'Api', {
            environment: props.environment,
            userTable: this.userTable,
            userPool: this.auth.userPool,
            placeIndexName: placeIndex.indexName,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2Vic2l0ZS1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIndlYnNpdGUtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFDbkMsdURBQXlDO0FBQ3pDLHVFQUF5RDtBQUN6RCx1RkFBeUU7QUFDekUsd0VBQTBEO0FBQzFELHdFQUEwRDtBQUMxRCxpRUFBbUQ7QUFDbkQsaUZBQW1FO0FBQ25FLG1FQUFxRDtBQUNyRCxtRUFBcUQ7QUFFckQsZ0ZBQTJFO0FBQzNFLDhEQUEwRDtBQVMxRCxNQUFhLFlBQWEsU0FBUSxHQUFHLENBQUMsS0FBSztJQUN6QixZQUFZLENBQTBCO0lBQ3RDLE1BQU0sQ0FBWTtJQUNsQixJQUFJLENBQXVCO0lBQzNCLFNBQVMsQ0FBaUI7SUFDMUIsR0FBRyxDQUFlO0lBRWxDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBd0I7UUFDaEUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsa0NBQWtDO1FBQ2xDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxTQUFTLEVBQUUsV0FBVyxDQUFDLENBQUM7UUFFOUMsTUFBTSxVQUFVLEdBQUcsS0FBSyxDQUFDLFNBQVM7WUFDaEMsQ0FBQyxDQUFDLEdBQUcsS0FBSyxDQUFDLFNBQVMsSUFBSSxLQUFLLENBQUMsVUFBVSxFQUFFO1lBQzFDLENBQUMsQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDO1FBRXJCLGdDQUFnQztRQUNoQyxJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksNkNBQW9CLENBQUMsSUFBSSxFQUFFLE1BQU0sRUFBRTtZQUNqRCxXQUFXLEVBQUUsS0FBSyxDQUFDLFdBQVc7WUFDOUIsWUFBWSxFQUFFLFVBQVUsS0FBSyxDQUFDLFdBQVcsRUFBRTtZQUMzQyxZQUFZLEVBQUUsQ0FBQyxx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QUMsU0FBUyxDQUFDLFNBQVM7WUFDL0IsV0FBVyxFQUFFLDBCQUEwQjtTQUN4QyxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLGVBQWUsRUFBRTtZQUN2QyxLQUFLLEVBQUUsSUFBSSxDQUFDLEdBQUcsQ0FBQyxHQUFHLENBQUMsR0FBRztZQUN2QixXQUFXLEVBQUUseUNBQXlDO1NBQ3ZELENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQXpPRCxvQ0F5T0MiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0ICogYXMgczMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXMzJztcbmltcG9ydCAqIGFzIGNsb3VkZnJvbnQgZnJvbSAnYXdzLWNkay1saWIvYXdzLWNsb3VkZnJvbnQnO1xuaW1wb3J0ICogYXMgY2xvdWRmcm9udF9vcmlnaW5zIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jbG91ZGZyb250LW9yaWdpbnMnO1xuaW1wb3J0ICogYXMgczNkZXBsb3kgZnJvbSAnYXdzLWNkay1saWIvYXdzLXMzLWRlcGxveW1lbnQnO1xuaW1wb3J0ICogYXMgYWNtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jZXJ0aWZpY2F0ZW1hbmFnZXInO1xuaW1wb3J0ICogYXMgcm91dGU1MyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtcm91dGU1Myc7XG5pbXBvcnQgKiBhcyByb3V0ZTUzX3RhcmdldHMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXJvdXRlNTMtdGFyZ2V0cyc7XG5pbXBvcnQgKiBhcyBkeW5hbW9kYiBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZHluYW1vZGInO1xuaW1wb3J0ICogYXMgbG9jYXRpb24gZnJvbSAnYXdzLWNkay1saWIvYXdzLWxvY2F0aW9uJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0IHsgQ29nbml0b0F1dGhDb25zdHJ1Y3QgfSBmcm9tICcuL2NvbnN0cnVjdHMvY29nbml0by1hdXRoLWNvbnN0cnVjdCc7XG5pbXBvcnQgeyBBcGlDb25zdHJ1Y3QgfSBmcm9tICcuL2NvbnN0cnVjdHMvYXBpLWNvbnN0cnVjdCc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgV2Vic2l0ZVN0YWNrUHJvcHMgZXh0ZW5kcyBjZGsuU3RhY2tQcm9wcyB7XG4gIGRvbWFpbk5hbWU6IHN0cmluZztcbiAgc3ViZG9tYWluPzogc3RyaW5nO1xuICBjZXJ0aWZpY2F0ZUFybj86IHN0cmluZztcbiAgZW52aXJvbm1lbnQ6ICdkZXYnIHwgJ3Byb2QnO1xufVxuXG5leHBvcnQgY2xhc3MgV2Vic2l0ZVN0YWNrIGV4dGVuZHMgY2RrLlN0YWNrIHtcbiAgcHVibGljIHJlYWRvbmx5IGRpc3RyaWJ1dGlvbjogY2xvdWRmcm9udC5EaXN0cmlidXRpb247XG4gIHB1YmxpYyByZWFkb25seSBidWNrZXQ6IHMzLkJ1Y2tldDtcbiAgcHVibGljIHJlYWRvbmx5IGF1dGg6IENvZ25pdG9BdXRoQ29uc3RydWN0O1xuICBwdWJsaWMgcmVhZG9ubHkgdXNlclRhYmxlOiBkeW5hbW9kYi5UYWJsZTtcbiAgcHVibGljIHJlYWRvbmx5IGFwaTogQXBpQ29uc3RydWN0O1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBXZWJzaXRlU3RhY2tQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xuXG4gICAgLy8gVGFnIGFsbCByZXNvdXJjZXMgaW4gdGhpcyBzdGFja1xuICAgIGNkay5UYWdzLm9mKHRoaXMpLmFkZCgnUHJvamVjdCcsICdBdXJhMjhDREsnKTtcblxuICAgIGNvbnN0IHNpdGVEb21haW4gPSBwcm9wcy5zdWJkb21haW5cbiAgICAgID8gYCR7cHJvcHMuc3ViZG9tYWlufS4ke3Byb3BzLmRvbWFpbk5hbWV9YFxuICAgICAgOiBwcm9wcy5kb21haW5OYW1lO1xuXG4gICAgLy8gQ3JlYXRlIENvZ25pdG8gYXV0aCByZXNvdXJjZXNcbiAgICB0aGlzLmF1dGggPSBuZXcgQ29nbml0b0F1dGhDb25zdHJ1Y3QodGhpcywgJ0F1dGgnLCB7XG4gICAgICBlbnZpcm9ubWVudDogcHJvcHMuZW52aXJvbm1lbnQsXG4gICAgICBkb21haW5QcmVmaXg6IGBhdXJhMjgtJHtwcm9wcy5lbnZpcm9ubWVudH1gLFxuICAgICAgY2FsbGJhY2tVcmxzOiBbYGh0dHA6Ly9sb2NhbGhvc3Q6MzAwMC9hdXRoL2NhbGxiYWNrYCwgYGh0dHBzOi8vJHtzaXRlRG9tYWlufS9hdXRoL2NhbGxiYWNrYF0sXG4gICAgICBsb2dvdXRVcmxzOiBbYGh0dHA6Ly9sb2NhbGhvc3Q6MzAwMGAsIGBodHRwczovLyR7c2l0ZURvbWFpbn1gXSxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBEeW5hbW9EQiB0YWJsZSBmb3IgdXNlciBkYXRhXG4gICAgdGhpcy51c2VyVGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgJ1VzZXJUYWJsZScsIHtcbiAgICAgIHRhYmxlTmFtZTogYEF1cmEyOC0ke3Byb3BzLmVudmlyb25tZW50fS1Vc2Vyc2AsXG4gICAgICBwYXJ0aXRpb25LZXk6IHtcbiAgICAgICAgbmFtZTogJ3VzZXJJZCcsXG4gICAgICAgIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HLFxuICAgICAgfSxcbiAgICAgIHNvcnRLZXk6IHtcbiAgICAgICAgbmFtZTogJ2NyZWF0ZWRBdCcsXG4gICAgICAgIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HLFxuICAgICAgfSxcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXG4gICAgICByZW1vdmFsUG9saWN5OlxuICAgICAgICBwcm9wcy5lbnZpcm9ubWVudCA9PT0gJ3Byb2QnID8gY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOIDogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIHBvaW50SW5UaW1lUmVjb3Zlcnk6IHRydWUsXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgQW1hem9uIExvY2F0aW9uIFNlcnZpY2UgUGxhY2UgSW5kZXhcbiAgICBjb25zdCBwbGFjZUluZGV4ID0gbmV3IGxvY2F0aW9uLkNmblBsYWNlSW5kZXgodGhpcywgJ1BsYWNlSW5kZXgnLCB7XG4gICAgICBpbmRleE5hbWU6IGBBdXJhMjgtJHtwcm9wcy5lbnZpcm9ubWVudH0tUGxhY2VJbmRleGAsXG4gICAgICBkYXRhU291cmNlOiAnSGVyZScsXG4gICAgICBkZXNjcmlwdGlvbjogJ1BsYWNlIGluZGV4IGZvciBBdXJhMjggYXBwbGljYXRpb24nLFxuICAgICAgcHJpY2luZ1BsYW46ICdSZXF1ZXN0QmFzZWRVc2FnZScsXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgQVBJIEdhdGV3YXkgYW5kIExhbWJkYSBmdW5jdGlvbnNcbiAgICB0aGlzLmFwaSA9IG5ldyBBcGlDb25zdHJ1Y3QodGhpcywgJ0FwaScsIHtcbiAgICAgIGVudmlyb25tZW50OiBwcm9wcy5lbnZpcm9ubWVudCxcbiAgICAgIHVzZXJUYWJsZTogdGhpcy51c2VyVGFibGUsXG4gICAgICB1c2VyUG9vbDogdGhpcy5hdXRoLnVzZXJQb29sLFxuICAgICAgcGxhY2VJbmRleE5hbWU6IHBsYWNlSW5kZXguaW5kZXhOYW1lLFxuICAgICAgYWxsb3dlZE9yaWdpbnM6IFtcbiAgICAgICAgJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMCcsXG4gICAgICAgIGBodHRwczovLyR7c2l0ZURvbWFpbn1gLFxuICAgICAgICAuLi4ocHJvcHMuZW52aXJvbm1lbnQgPT09ICdwcm9kJyA/IFtgaHR0cHM6Ly93d3cuJHtwcm9wcy5kb21haW5OYW1lfWBdIDogW10pLFxuICAgICAgXSxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBTMyBidWNrZXQgZm9yIGhvc3RpbmdcbiAgICB0aGlzLmJ1Y2tldCA9IG5ldyBzMy5CdWNrZXQodGhpcywgJ1dlYnNpdGVCdWNrZXQnLCB7XG4gICAgICBidWNrZXROYW1lOiBgYXVyYTI4LSR7cHJvcHMuZW52aXJvbm1lbnR9LXdlYnNpdGUtJHt0aGlzLmFjY291bnR9YCxcbiAgICAgIHB1YmxpY1JlYWRBY2Nlc3M6IGZhbHNlLFxuICAgICAgYmxvY2tQdWJsaWNBY2Nlc3M6IHMzLkJsb2NrUHVibGljQWNjZXNzLkJMT0NLX0FMTCxcbiAgICAgIHJlbW92YWxQb2xpY3k6XG4gICAgICAgIHByb3BzLmVudmlyb25tZW50ID09PSAncHJvZCcgPyBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4gOiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgYXV0b0RlbGV0ZU9iamVjdHM6IHByb3BzLmVudmlyb25tZW50ICE9PSAncHJvZCcsXG4gICAgICBsaWZlY3ljbGVSdWxlczogW1xuICAgICAgICB7XG4gICAgICAgICAgaWQ6ICdBYm9ydEluY29tcGxldGVNdWx0aXBhcnRVcGxvYWRzJyxcbiAgICAgICAgICBhYm9ydEluY29tcGxldGVNdWx0aXBhcnRVcGxvYWRBZnRlcjogY2RrLkR1cmF0aW9uLmRheXMoNyksXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgLy8gR2V0IGhvc3RlZCB6b25lXG4gICAgY29uc3QgaG9zdGVkWm9uZSA9IHJvdXRlNTMuSG9zdGVkWm9uZS5mcm9tTG9va3VwKHRoaXMsICdIb3N0ZWRab25lJywge1xuICAgICAgZG9tYWluTmFtZTogcHJvcHMuZG9tYWluTmFtZSxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBjZXJ0aWZpY2F0ZSAobXVzdCBiZSBpbiB1cy1lYXN0LTEgZm9yIENsb3VkRnJvbnQpXG4gICAgbGV0IGNlcnRpZmljYXRlOiBhY20uSUNlcnRpZmljYXRlO1xuXG4gICAgaWYgKHByb3BzLmNlcnRpZmljYXRlQXJuKSB7XG4gICAgICBjZXJ0aWZpY2F0ZSA9IGFjbS5DZXJ0aWZpY2F0ZS5mcm9tQ2VydGlmaWNhdGVBcm4odGhpcywgJ0NlcnRpZmljYXRlJywgcHJvcHMuY2VydGlmaWNhdGVBcm4pO1xuICAgIH0gZWxzZSB7XG4gICAgICBjZXJ0aWZpY2F0ZSA9IG5ldyBhY20uQ2VydGlmaWNhdGUodGhpcywgJ0NlcnRpZmljYXRlJywge1xuICAgICAgICBkb21haW5OYW1lOiBzaXRlRG9tYWluLFxuICAgICAgICBzdWJqZWN0QWx0ZXJuYXRpdmVOYW1lczpcbiAgICAgICAgICBwcm9wcy5lbnZpcm9ubWVudCA9PT0gJ3Byb2QnID8gW2B3d3cuJHtwcm9wcy5kb21haW5OYW1lfWBdIDogdW5kZWZpbmVkLFxuICAgICAgICB2YWxpZGF0aW9uOiBhY20uQ2VydGlmaWNhdGVWYWxpZGF0aW9uLmZyb21EbnMoaG9zdGVkWm9uZSksXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBDbG91ZEZyb250IEZ1bmN0aW9uIGZvciBoYW5kbGluZyByb3V0aW5nXG4gICAgY29uc3Qgcm91dGluZ0Z1bmN0aW9uID0gbmV3IGNsb3VkZnJvbnQuRnVuY3Rpb24odGhpcywgJ1JvdXRpbmdGdW5jdGlvbicsIHtcbiAgICAgIGNvZGU6IGNsb3VkZnJvbnQuRnVuY3Rpb25Db2RlLmZyb21JbmxpbmUoYFxuICAgICAgICBmdW5jdGlvbiBoYW5kbGVyKGV2ZW50KSB7XG4gICAgICAgICAgdmFyIHJlcXVlc3QgPSBldmVudC5yZXF1ZXN0O1xuICAgICAgICAgIHZhciB1cmkgPSByZXF1ZXN0LnVyaTtcbiAgICAgICAgICBcbiAgICAgICAgICAvLyBDaGVjayBpZiBVUkkgYWxyZWFkeSBoYXMgYW4gZXh0ZW5zaW9uXG4gICAgICAgICAgaWYgKHVyaS5pbmNsdWRlcygnLicpKSB7XG4gICAgICAgICAgICByZXR1cm4gcmVxdWVzdDtcbiAgICAgICAgICB9XG4gICAgICAgICAgXG4gICAgICAgICAgLy8gQ2hlY2sgaWYgVVJJIGVuZHMgd2l0aCAvXG4gICAgICAgICAgaWYgKHVyaS5lbmRzV2l0aCgnLycpKSB7XG4gICAgICAgICAgICByZXF1ZXN0LnVyaSA9IHVyaSArICdpbmRleC5odG1sJztcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgLy8gVHJ5IHRvIGFwcGVuZCAuaHRtbFxuICAgICAgICAgICAgcmVxdWVzdC51cmkgPSB1cmkgKyAnLmh0bWwnO1xuICAgICAgICAgIH1cbiAgICAgICAgICBcbiAgICAgICAgICByZXR1cm4gcmVxdWVzdDtcbiAgICAgICAgfVxuICAgICAgYCksXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgQ2xvdWRGcm9udCBkaXN0cmlidXRpb25cbiAgICB0aGlzLmRpc3RyaWJ1dGlvbiA9IG5ldyBjbG91ZGZyb250LkRpc3RyaWJ1dGlvbih0aGlzLCAnRGlzdHJpYnV0aW9uJywge1xuICAgICAgZGVmYXVsdEJlaGF2aW9yOiB7XG4gICAgICAgIG9yaWdpbjogY2xvdWRmcm9udF9vcmlnaW5zLlMzQnVja2V0T3JpZ2luLndpdGhPcmlnaW5BY2Nlc3NDb250cm9sKHRoaXMuYnVja2V0KSxcbiAgICAgICAgdmlld2VyUHJvdG9jb2xQb2xpY3k6IGNsb3VkZnJvbnQuVmlld2VyUHJvdG9jb2xQb2xpY3kuUkVESVJFQ1RfVE9fSFRUUFMsXG4gICAgICAgIGZ1bmN0aW9uQXNzb2NpYXRpb25zOiBbXG4gICAgICAgICAge1xuICAgICAgICAgICAgZnVuY3Rpb246IHJvdXRpbmdGdW5jdGlvbixcbiAgICAgICAgICAgIGV2ZW50VHlwZTogY2xvdWRmcm9udC5GdW5jdGlvbkV2ZW50VHlwZS5WSUVXRVJfUkVRVUVTVCxcbiAgICAgICAgICB9LFxuICAgICAgICBdLFxuICAgICAgICBjYWNoZVBvbGljeTogY2xvdWRmcm9udC5DYWNoZVBvbGljeS5DQUNISU5HX09QVElNSVpFRCxcbiAgICAgIH0sXG4gICAgICBhZGRpdGlvbmFsQmVoYXZpb3JzOiB7XG4gICAgICAgICcvZmF2aWNvbionOiB7XG4gICAgICAgICAgb3JpZ2luOiBjbG91ZGZyb250X29yaWdpbnMuUzNCdWNrZXRPcmlnaW4ud2l0aE9yaWdpbkFjY2Vzc0NvbnRyb2wodGhpcy5idWNrZXQpLFxuICAgICAgICAgIHZpZXdlclByb3RvY29sUG9saWN5OiBjbG91ZGZyb250LlZpZXdlclByb3RvY29sUG9saWN5LlJFRElSRUNUX1RPX0hUVFBTLFxuICAgICAgICAgIGNhY2hlUG9saWN5OiBuZXcgY2xvdWRmcm9udC5DYWNoZVBvbGljeSh0aGlzLCAnRmF2aWNvbkNhY2hlUG9saWN5Jywge1xuICAgICAgICAgICAgY2FjaGVQb2xpY3lOYW1lOiBgYXVyYTI4LSR7cHJvcHMuZW52aXJvbm1lbnR9LWZhdmljb24tY2FjaGUtcG9saWN5YCxcbiAgICAgICAgICAgIGRlZmF1bHRUdGw6IGNkay5EdXJhdGlvbi5ob3VycygxKSxcbiAgICAgICAgICAgIG1heFR0bDogY2RrLkR1cmF0aW9uLmhvdXJzKDI0KSxcbiAgICAgICAgICAgIG1pblR0bDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMCksXG4gICAgICAgICAgICBlbmFibGVBY2NlcHRFbmNvZGluZ0d6aXA6IHRydWUsXG4gICAgICAgICAgICBlbmFibGVBY2NlcHRFbmNvZGluZ0Jyb3RsaTogdHJ1ZSxcbiAgICAgICAgICAgIHF1ZXJ5U3RyaW5nQmVoYXZpb3I6IGNsb3VkZnJvbnQuQ2FjaGVRdWVyeVN0cmluZ0JlaGF2aW9yLm5vbmUoKSxcbiAgICAgICAgICAgIGhlYWRlckJlaGF2aW9yOiBjbG91ZGZyb250LkNhY2hlSGVhZGVyQmVoYXZpb3Iubm9uZSgpLFxuICAgICAgICAgICAgY29va2llQmVoYXZpb3I6IGNsb3VkZnJvbnQuQ2FjaGVDb29raWVCZWhhdmlvci5ub25lKCksXG4gICAgICAgICAgfSksXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgICAgZG9tYWluTmFtZXM6XG4gICAgICAgIHByb3BzLmVudmlyb25tZW50ID09PSAncHJvZCcgPyBbcHJvcHMuZG9tYWluTmFtZSwgYHd3dy4ke3Byb3BzLmRvbWFpbk5hbWV9YF0gOiBbc2l0ZURvbWFpbl0sXG4gICAgICBjZXJ0aWZpY2F0ZSxcbiAgICAgIGVycm9yUmVzcG9uc2VzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBodHRwU3RhdHVzOiA0MDQsXG4gICAgICAgICAgcmVzcG9uc2VIdHRwU3RhdHVzOiAyMDAsXG4gICAgICAgICAgcmVzcG9uc2VQYWdlUGF0aDogJy80MDQuaHRtbCcsXG4gICAgICAgICAgdHRsOiBjZGsuRHVyYXRpb24ubWludXRlcyg1KSxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgICBkZWZhdWx0Um9vdE9iamVjdDogJ2luZGV4Lmh0bWwnLFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIFJvdXRlNTMgQSByZWNvcmRcbiAgICBuZXcgcm91dGU1My5BUmVjb3JkKHRoaXMsICdBbGlhc1JlY29yZCcsIHtcbiAgICAgIHJlY29yZE5hbWU6IHNpdGVEb21haW4sXG4gICAgICB0YXJnZXQ6IHJvdXRlNTMuUmVjb3JkVGFyZ2V0LmZyb21BbGlhcyhcbiAgICAgICAgbmV3IHJvdXRlNTNfdGFyZ2V0cy5DbG91ZEZyb250VGFyZ2V0KHRoaXMuZGlzdHJpYnV0aW9uKSxcbiAgICAgICksXG4gICAgICB6b25lOiBob3N0ZWRab25lLFxuICAgIH0pO1xuXG4gICAgLy8gSWYgcHJvZHVjdGlvbiwgY3JlYXRlIHd3dyByZWRpcmVjdFxuICAgIGlmIChwcm9wcy5lbnZpcm9ubWVudCA9PT0gJ3Byb2QnKSB7XG4gICAgICBuZXcgcm91dGU1My5BUmVjb3JkKHRoaXMsICdXd3dBbGlhc1JlY29yZCcsIHtcbiAgICAgICAgcmVjb3JkTmFtZTogYHd3dy4ke3Byb3BzLmRvbWFpbk5hbWV9YCxcbiAgICAgICAgdGFyZ2V0OiByb3V0ZTUzLlJlY29yZFRhcmdldC5mcm9tQWxpYXMoXG4gICAgICAgICAgbmV3IHJvdXRlNTNfdGFyZ2V0cy5DbG91ZEZyb250VGFyZ2V0KHRoaXMuZGlzdHJpYnV0aW9uKSxcbiAgICAgICAgKSxcbiAgICAgICAgem9uZTogaG9zdGVkWm9uZSxcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIC8vIERlcGxveSBzaXRlIGNvbnRlbnRzXG4gICAgbmV3IHMzZGVwbG95LkJ1Y2tldERlcGxveW1lbnQodGhpcywgJ0RlcGxveVdlYnNpdGUnLCB7XG4gICAgICBzb3VyY2VzOiBbczNkZXBsb3kuU291cmNlLmFzc2V0KCcuLi9mcm9udGVuZC9vdXQnKV0sXG4gICAgICBkZXN0aW5hdGlvbkJ1Y2tldDogdGhpcy5idWNrZXQsXG4gICAgICBkaXN0cmlidXRpb246IHRoaXMuZGlzdHJpYnV0aW9uLFxuICAgICAgZGlzdHJpYnV0aW9uUGF0aHM6IFsnLyonXSxcbiAgICAgIHBydW5lOiBmYWxzZSxcbiAgICB9KTtcblxuICAgIC8vIE91dHB1dCBDb2duaXRvIGNvbmZpZ3VyYXRpb24gZm9yIGZyb250ZW5kXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0NvZ25pdG9Vc2VyUG9vbElkJywge1xuICAgICAgdmFsdWU6IHRoaXMuYXV0aC51c2VyUG9vbC51c2VyUG9vbElkLFxuICAgICAgZGVzY3JpcHRpb246ICdDb2duaXRvIFVzZXIgUG9vbCBJRCcsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQ29nbml0b0NsaWVudElkJywge1xuICAgICAgdmFsdWU6IHRoaXMuYXV0aC51c2VyUG9vbENsaWVudC51c2VyUG9vbENsaWVudElkLFxuICAgICAgZGVzY3JpcHRpb246ICdDb2duaXRvIENsaWVudCBJRCcsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQ29nbml0b0RvbWFpbicsIHtcbiAgICAgIHZhbHVlOiBgYXVyYTI4LSR7cHJvcHMuZW52aXJvbm1lbnR9YCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQ29nbml0byBEb21haW4gUHJlZml4JyxcbiAgICB9KTtcblxuICAgIC8vIE91dHB1dCBDbG91ZEZyb250IFVSTFxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdEaXN0cmlidXRpb25VcmwnLCB7XG4gICAgICB2YWx1ZTogYGh0dHBzOi8vJHtzaXRlRG9tYWlufWAsXG4gICAgICBkZXNjcmlwdGlvbjogJ1dlYnNpdGUgVVJMJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdDbG91ZEZyb250VXJsJywge1xuICAgICAgdmFsdWU6IGBodHRwczovLyR7dGhpcy5kaXN0cmlidXRpb24uZGlzdHJpYnV0aW9uRG9tYWluTmFtZX1gLFxuICAgICAgZGVzY3JpcHRpb246ICdDbG91ZEZyb250IERpc3RyaWJ1dGlvbiBVUkwnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1VzZXJUYWJsZU5hbWUnLCB7XG4gICAgICB2YWx1ZTogdGhpcy51c2VyVGFibGUudGFibGVOYW1lLFxuICAgICAgZGVzY3JpcHRpb246ICdEeW5hbW9EQiBVc2VyIFRhYmxlIE5hbWUnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0FwaUdhdGV3YXlVcmwnLCB7XG4gICAgICB2YWx1ZTogdGhpcy5hcGkuYXBpLnVybCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQVBJIEdhdGV3YXkgVVJMIGZvciBmcm9udGVuZCAuZW52LmxvY2FsJyxcbiAgICB9KTtcbiAgfVxufVxuIl19