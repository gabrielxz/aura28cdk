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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2Vic2l0ZS1zdGFjay5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIndlYnNpdGUtc3RhY2sudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFDbkMsdURBQXlDO0FBQ3pDLHVFQUF5RDtBQUN6RCx1RkFBeUU7QUFDekUsd0VBQTBEO0FBQzFELHdFQUEwRDtBQUMxRCxpRUFBbUQ7QUFDbkQsaUZBQW1FO0FBQ25FLG1FQUFxRDtBQUNyRCxtRUFBcUQ7QUFFckQsZ0ZBQTJFO0FBQzNFLDhEQUEwRDtBQVMxRCxNQUFhLFlBQWEsU0FBUSxHQUFHLENBQUMsS0FBSztJQUN6QixZQUFZLENBQTBCO0lBQ3RDLE1BQU0sQ0FBWTtJQUNsQixJQUFJLENBQXVCO0lBQzNCLFNBQVMsQ0FBaUI7SUFDMUIsR0FBRyxDQUFlO0lBRWxDLFlBQVksS0FBZ0IsRUFBRSxFQUFVLEVBQUUsS0FBd0I7UUFDaEUsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsa0NBQWtDO1FBQ2xDLEdBQUcsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxTQUFTLEVBQUUsV0FBVyxDQUFDLENBQUM7UUFFOUMsTUFBTSxVQUFVLEdBQUcsS0FBSyxDQUFDLFNBQVM7WUFDaEMsQ0FBQyxDQUFDLEdBQUcsS0FBSyxDQUFDLFNBQVMsSUFBSSxLQUFLLENBQUMsVUFBVSxFQUFFO1lBQzFDLENBQUMsQ0FBQyxLQUFLLENBQUMsVUFBVSxDQUFDO1FBRXJCLGdDQUFnQztRQUNoQyxJQUFJLENBQUMsSUFBSSxHQUFHLElBQUksNkNBQW9CLENBQUMsSUFBSSxFQUFFLE1BQU0sRUFBRTtZQUNqRCxXQUFXLEVBQUUsS0FBSyxDQUFDLFdBQVc7WUFDOUIsWUFBWSxFQUFFLFVBQVUsS0FBSyxDQUFDLFdBQVcsRUFBRTtZQUMzQyxZQUFZLEVBQUUsQ0FBQyxx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V0FBVyxFQUFFLDZCQUE2QjtTQUMzQyxDQUFDLENBQUM7UUFFSCxJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLGVBQWUsRUFBRTtZQUN2QyxLQUFLLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxTQUFTO1lBQy9CLFdBQVcsRUFBRSwwQkFBMEI7U0FDeEMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxlQUFlLEVBQUU7WUFDdkMsS0FBSyxFQUFFLElBQUksQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLEdBQUc7WUFDdkIsV0FBVyxFQUFFLHlDQUF5QztTQUN2RCxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUEvUUQsb0NBK1FDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCAqIGFzIHMzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zMyc7XG5pbXBvcnQgKiBhcyBjbG91ZGZyb250IGZyb20gJ2F3cy1jZGstbGliL2F3cy1jbG91ZGZyb250JztcbmltcG9ydCAqIGFzIGNsb3VkZnJvbnRfb3JpZ2lucyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY2xvdWRmcm9udC1vcmlnaW5zJztcbmltcG9ydCAqIGFzIHMzZGVwbG95IGZyb20gJ2F3cy1jZGstbGliL2F3cy1zMy1kZXBsb3ltZW50JztcbmltcG9ydCAqIGFzIGFjbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY2VydGlmaWNhdGVtYW5hZ2VyJztcbmltcG9ydCAqIGFzIHJvdXRlNTMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXJvdXRlNTMnO1xuaW1wb3J0ICogYXMgcm91dGU1M190YXJnZXRzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1yb3V0ZTUzLXRhcmdldHMnO1xuaW1wb3J0ICogYXMgZHluYW1vZGIgZnJvbSAnYXdzLWNkay1saWIvYXdzLWR5bmFtb2RiJztcbmltcG9ydCAqIGFzIGxvY2F0aW9uIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sb2NhdGlvbic7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcbmltcG9ydCB7IENvZ25pdG9BdXRoQ29uc3RydWN0IH0gZnJvbSAnLi9jb25zdHJ1Y3RzL2NvZ25pdG8tYXV0aC1jb25zdHJ1Y3QnO1xuaW1wb3J0IHsgQXBpQ29uc3RydWN0IH0gZnJvbSAnLi9jb25zdHJ1Y3RzL2FwaS1jb25zdHJ1Y3QnO1xuXG5leHBvcnQgaW50ZXJmYWNlIFdlYnNpdGVTdGFja1Byb3BzIGV4dGVuZHMgY2RrLlN0YWNrUHJvcHMge1xuICBkb21haW5OYW1lOiBzdHJpbmc7XG4gIHN1YmRvbWFpbj86IHN0cmluZztcbiAgY2VydGlmaWNhdGVBcm4/OiBzdHJpbmc7XG4gIGVudmlyb25tZW50OiAnZGV2JyB8ICdwcm9kJztcbn1cblxuZXhwb3J0IGNsYXNzIFdlYnNpdGVTdGFjayBleHRlbmRzIGNkay5TdGFjayB7XG4gIHB1YmxpYyByZWFkb25seSBkaXN0cmlidXRpb246IGNsb3VkZnJvbnQuRGlzdHJpYnV0aW9uO1xuICBwdWJsaWMgcmVhZG9ubHkgYnVja2V0OiBzMy5CdWNrZXQ7XG4gIHB1YmxpYyByZWFkb25seSBhdXRoOiBDb2duaXRvQXV0aENvbnN0cnVjdDtcbiAgcHVibGljIHJlYWRvbmx5IHVzZXJUYWJsZTogZHluYW1vZGIuVGFibGU7XG4gIHB1YmxpYyByZWFkb25seSBhcGk6IEFwaUNvbnN0cnVjdDtcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogV2Vic2l0ZVN0YWNrUHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgIC8vIFRhZyBhbGwgcmVzb3VyY2VzIGluIHRoaXMgc3RhY2tcbiAgICBjZGsuVGFncy5vZih0aGlzKS5hZGQoJ1Byb2plY3QnLCAnQXVyYTI4Q0RLJyk7XG5cbiAgICBjb25zdCBzaXRlRG9tYWluID0gcHJvcHMuc3ViZG9tYWluXG4gICAgICA/IGAke3Byb3BzLnN1YmRvbWFpbn0uJHtwcm9wcy5kb21haW5OYW1lfWBcbiAgICAgIDogcHJvcHMuZG9tYWluTmFtZTtcblxuICAgIC8vIENyZWF0ZSBDb2duaXRvIGF1dGggcmVzb3VyY2VzXG4gICAgdGhpcy5hdXRoID0gbmV3IENvZ25pdG9BdXRoQ29uc3RydWN0KHRoaXMsICdBdXRoJywge1xuICAgICAgZW52aXJvbm1lbnQ6IHByb3BzLmVudmlyb25tZW50LFxuICAgICAgZG9tYWluUHJlZml4OiBgYXVyYTI4LSR7cHJvcHMuZW52aXJvbm1lbnR9YCxcbiAgICAgIGNhbGxiYWNrVXJsczogW2BodHRwOi8vbG9jYWxob3N0OjMwMDAvYXV0aC9jYWxsYmFja2AsIGBodHRwczovLyR7c2l0ZURvbWFpbn0vYXV0aC9jYWxsYmFja2BdLFxuICAgICAgbG9nb3V0VXJsczogW2BodHRwOi8vbG9jYWxob3N0OjMwMDBgLCBgaHR0cHM6Ly8ke3NpdGVEb21haW59YF0sXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgRHluYW1vREIgdGFibGUgZm9yIHVzZXIgZGF0YVxuICAgIHRoaXMudXNlclRhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsICdVc2VyVGFibGUnLCB7XG4gICAgICB0YWJsZU5hbWU6IGBBdXJhMjgtJHtwcm9wcy5lbnZpcm9ubWVudH0tVXNlcnNgLFxuICAgICAgcGFydGl0aW9uS2V5OiB7XG4gICAgICAgIG5hbWU6ICd1c2VySWQnLFxuICAgICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyxcbiAgICAgIH0sXG4gICAgICBzb3J0S2V5OiB7XG4gICAgICAgIG5hbWU6ICdjcmVhdGVkQXQnLFxuICAgICAgICB0eXBlOiBkeW5hbW9kYi5BdHRyaWJ1dGVUeXBlLlNUUklORyxcbiAgICAgIH0sXG4gICAgICBiaWxsaW5nTW9kZTogZHluYW1vZGIuQmlsbGluZ01vZGUuUEFZX1BFUl9SRVFVRVNULFxuICAgICAgcmVtb3ZhbFBvbGljeTpcbiAgICAgICAgcHJvcHMuZW52aXJvbm1lbnQgPT09ICdwcm9kJyA/IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTiA6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICBwb2ludEluVGltZVJlY292ZXJ5U3BlY2lmaWNhdGlvbjoge1xuICAgICAgICBwb2ludEluVGltZVJlY292ZXJ5RW5hYmxlZDogdHJ1ZSxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgQW1hem9uIExvY2F0aW9uIFNlcnZpY2UgUGxhY2UgSW5kZXhcbiAgICBjb25zdCBwbGFjZUluZGV4ID0gbmV3IGxvY2F0aW9uLkNmblBsYWNlSW5kZXgodGhpcywgJ1BsYWNlSW5kZXgnLCB7XG4gICAgICBpbmRleE5hbWU6IGBBdXJhMjgtJHtwcm9wcy5lbnZpcm9ubWVudH0tUGxhY2VJbmRleGAsXG4gICAgICBkYXRhU291cmNlOiAnSGVyZScsXG4gICAgICBkZXNjcmlwdGlvbjogJ1BsYWNlIGluZGV4IGZvciBBdXJhMjggYXBwbGljYXRpb24nLFxuICAgICAgcHJpY2luZ1BsYW46ICdSZXF1ZXN0QmFzZWRVc2FnZScsXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgRHluYW1vREIgdGFibGUgZm9yIG5hdGFsIGNoYXJ0IGRhdGFcbiAgICBjb25zdCBuYXRhbENoYXJ0VGFibGUgPSBuZXcgZHluYW1vZGIuVGFibGUodGhpcywgJ05hdGFsQ2hhcnRUYWJsZScsIHtcbiAgICAgIHRhYmxlTmFtZTogYEF1cmEyOC0ke3Byb3BzLmVudmlyb25tZW50fS1OYXRhbENoYXJ0c2AsXG4gICAgICBwYXJ0aXRpb25LZXk6IHtcbiAgICAgICAgbmFtZTogJ3VzZXJJZCcsXG4gICAgICAgIHR5cGU6IGR5bmFtb2RiLkF0dHJpYnV0ZVR5cGUuU1RSSU5HLFxuICAgICAgfSxcbiAgICAgIGJpbGxpbmdNb2RlOiBkeW5hbW9kYi5CaWxsaW5nTW9kZS5QQVlfUEVSX1JFUVVFU1QsXG4gICAgICByZW1vdmFsUG9saWN5OlxuICAgICAgICBwcm9wcy5lbnZpcm9ubWVudCA9PT0gJ3Byb2QnID8gY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOIDogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIHBvaW50SW5UaW1lUmVjb3ZlcnlTcGVjaWZpY2F0aW9uOiB7XG4gICAgICAgIHBvaW50SW5UaW1lUmVjb3ZlcnlFbmFibGVkOiB0cnVlLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBEeW5hbW9EQiB0YWJsZSBmb3IgcmVhZGluZ3NcbiAgICBjb25zdCByZWFkaW5nc1RhYmxlID0gbmV3IGR5bmFtb2RiLlRhYmxlKHRoaXMsICdSZWFkaW5nc1RhYmxlJywge1xuICAgICAgdGFibGVOYW1lOiBgQXVyYTI4LSR7cHJvcHMuZW52aXJvbm1lbnR9LVJlYWRpbmdzYCxcbiAgICAgIHBhcnRpdGlvbktleToge1xuICAgICAgICBuYW1lOiAndXNlcklkJyxcbiAgICAgICAgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcsXG4gICAgICB9LFxuICAgICAgc29ydEtleToge1xuICAgICAgICBuYW1lOiAncmVhZGluZ0lkJyxcbiAgICAgICAgdHlwZTogZHluYW1vZGIuQXR0cmlidXRlVHlwZS5TVFJJTkcsXG4gICAgICB9LFxuICAgICAgYmlsbGluZ01vZGU6IGR5bmFtb2RiLkJpbGxpbmdNb2RlLlBBWV9QRVJfUkVRVUVTVCxcbiAgICAgIHJlbW92YWxQb2xpY3k6XG4gICAgICAgIHByb3BzLmVudmlyb25tZW50ID09PSAncHJvZCcgPyBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4gOiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgcG9pbnRJblRpbWVSZWNvdmVyeVNwZWNpZmljYXRpb246IHtcbiAgICAgICAgcG9pbnRJblRpbWVSZWNvdmVyeUVuYWJsZWQ6IHRydWUsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIEFQSSBHYXRld2F5IGFuZCBMYW1iZGEgZnVuY3Rpb25zXG4gICAgdGhpcy5hcGkgPSBuZXcgQXBpQ29uc3RydWN0KHRoaXMsICdBcGknLCB7XG4gICAgICBlbnZpcm9ubWVudDogcHJvcHMuZW52aXJvbm1lbnQsXG4gICAgICB1c2VyVGFibGU6IHRoaXMudXNlclRhYmxlLFxuICAgICAgbmF0YWxDaGFydFRhYmxlOiBuYXRhbENoYXJ0VGFibGUsXG4gICAgICByZWFkaW5nc1RhYmxlOiByZWFkaW5nc1RhYmxlLFxuICAgICAgdXNlclBvb2w6IHRoaXMuYXV0aC51c2VyUG9vbCxcbiAgICAgIHBsYWNlSW5kZXhOYW1lOiBwbGFjZUluZGV4LmluZGV4TmFtZSxcbiAgICAgIGFsbG93ZWRPcmlnaW5zOiBbXG4gICAgICAgICdodHRwOi8vbG9jYWxob3N0OjMwMDAnLFxuICAgICAgICBgaHR0cHM6Ly8ke3NpdGVEb21haW59YCxcbiAgICAgICAgLi4uKHByb3BzLmVudmlyb25tZW50ID09PSAncHJvZCcgPyBbYGh0dHBzOi8vd3d3LiR7cHJvcHMuZG9tYWluTmFtZX1gXSA6IFtdKSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgUzMgYnVja2V0IGZvciBob3N0aW5nXG4gICAgdGhpcy5idWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsICdXZWJzaXRlQnVja2V0Jywge1xuICAgICAgYnVja2V0TmFtZTogYGF1cmEyOC0ke3Byb3BzLmVudmlyb25tZW50fS13ZWJzaXRlLSR7dGhpcy5hY2NvdW50fWAsXG4gICAgICBwdWJsaWNSZWFkQWNjZXNzOiBmYWxzZSxcbiAgICAgIGJsb2NrUHVibGljQWNjZXNzOiBzMy5CbG9ja1B1YmxpY0FjY2Vzcy5CTE9DS19BTEwsXG4gICAgICByZW1vdmFsUG9saWN5OlxuICAgICAgICBwcm9wcy5lbnZpcm9ubWVudCA9PT0gJ3Byb2QnID8gY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOIDogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIGF1dG9EZWxldGVPYmplY3RzOiBwcm9wcy5lbnZpcm9ubWVudCAhPT0gJ3Byb2QnLFxuICAgICAgbGlmZWN5Y2xlUnVsZXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIGlkOiAnQWJvcnRJbmNvbXBsZXRlTXVsdGlwYXJ0VXBsb2FkcycsXG4gICAgICAgICAgYWJvcnRJbmNvbXBsZXRlTXVsdGlwYXJ0VXBsb2FkQWZ0ZXI6IGNkay5EdXJhdGlvbi5kYXlzKDcpLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9KTtcblxuICAgIC8vIEdldCBob3N0ZWQgem9uZVxuICAgIGNvbnN0IGhvc3RlZFpvbmUgPSByb3V0ZTUzLkhvc3RlZFpvbmUuZnJvbUxvb2t1cCh0aGlzLCAnSG9zdGVkWm9uZScsIHtcbiAgICAgIGRvbWFpbk5hbWU6IHByb3BzLmRvbWFpbk5hbWUsXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgY2VydGlmaWNhdGUgKG11c3QgYmUgaW4gdXMtZWFzdC0xIGZvciBDbG91ZEZyb250KVxuICAgIGxldCBjZXJ0aWZpY2F0ZTogYWNtLklDZXJ0aWZpY2F0ZTtcblxuICAgIGlmIChwcm9wcy5jZXJ0aWZpY2F0ZUFybikge1xuICAgICAgY2VydGlmaWNhdGUgPSBhY20uQ2VydGlmaWNhdGUuZnJvbUNlcnRpZmljYXRlQXJuKHRoaXMsICdDZXJ0aWZpY2F0ZScsIHByb3BzLmNlcnRpZmljYXRlQXJuKTtcbiAgICB9IGVsc2Uge1xuICAgICAgY2VydGlmaWNhdGUgPSBuZXcgYWNtLkNlcnRpZmljYXRlKHRoaXMsICdDZXJ0aWZpY2F0ZScsIHtcbiAgICAgICAgZG9tYWluTmFtZTogc2l0ZURvbWFpbixcbiAgICAgICAgc3ViamVjdEFsdGVybmF0aXZlTmFtZXM6XG4gICAgICAgICAgcHJvcHMuZW52aXJvbm1lbnQgPT09ICdwcm9kJyA/IFtgd3d3LiR7cHJvcHMuZG9tYWluTmFtZX1gXSA6IHVuZGVmaW5lZCxcbiAgICAgICAgdmFsaWRhdGlvbjogYWNtLkNlcnRpZmljYXRlVmFsaWRhdGlvbi5mcm9tRG5zKGhvc3RlZFpvbmUpLFxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgLy8gQ2xvdWRGcm9udCBGdW5jdGlvbiBmb3IgaGFuZGxpbmcgcm91dGluZ1xuICAgIGNvbnN0IHJvdXRpbmdGdW5jdGlvbiA9IG5ldyBjbG91ZGZyb250LkZ1bmN0aW9uKHRoaXMsICdSb3V0aW5nRnVuY3Rpb24nLCB7XG4gICAgICBjb2RlOiBjbG91ZGZyb250LkZ1bmN0aW9uQ29kZS5mcm9tSW5saW5lKGBcbiAgICAgICAgZnVuY3Rpb24gaGFuZGxlcihldmVudCkge1xuICAgICAgICAgIHZhciByZXF1ZXN0ID0gZXZlbnQucmVxdWVzdDtcbiAgICAgICAgICB2YXIgdXJpID0gcmVxdWVzdC51cmk7XG4gICAgICAgICAgXG4gICAgICAgICAgLy8gQ2hlY2sgaWYgVVJJIGFscmVhZHkgaGFzIGFuIGV4dGVuc2lvblxuICAgICAgICAgIGlmICh1cmkuaW5jbHVkZXMoJy4nKSkge1xuICAgICAgICAgICAgcmV0dXJuIHJlcXVlc3Q7XG4gICAgICAgICAgfVxuICAgICAgICAgIFxuICAgICAgICAgIC8vIENoZWNrIGlmIFVSSSBlbmRzIHdpdGggL1xuICAgICAgICAgIGlmICh1cmkuZW5kc1dpdGgoJy8nKSkge1xuICAgICAgICAgICAgcmVxdWVzdC51cmkgPSB1cmkgKyAnaW5kZXguaHRtbCc7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIC8vIFRyeSB0byBhcHBlbmQgLmh0bWxcbiAgICAgICAgICAgIHJlcXVlc3QudXJpID0gdXJpICsgJy5odG1sJztcbiAgICAgICAgICB9XG4gICAgICAgICAgXG4gICAgICAgICAgcmV0dXJuIHJlcXVlc3Q7XG4gICAgICAgIH1cbiAgICAgIGApLFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIENsb3VkRnJvbnQgZGlzdHJpYnV0aW9uXG4gICAgdGhpcy5kaXN0cmlidXRpb24gPSBuZXcgY2xvdWRmcm9udC5EaXN0cmlidXRpb24odGhpcywgJ0Rpc3RyaWJ1dGlvbicsIHtcbiAgICAgIGRlZmF1bHRCZWhhdmlvcjoge1xuICAgICAgICBvcmlnaW46IGNsb3VkZnJvbnRfb3JpZ2lucy5TM0J1Y2tldE9yaWdpbi53aXRoT3JpZ2luQWNjZXNzQ29udHJvbCh0aGlzLmJ1Y2tldCksXG4gICAgICAgIHZpZXdlclByb3RvY29sUG9saWN5OiBjbG91ZGZyb250LlZpZXdlclByb3RvY29sUG9saWN5LlJFRElSRUNUX1RPX0hUVFBTLFxuICAgICAgICBmdW5jdGlvbkFzc29jaWF0aW9uczogW1xuICAgICAgICAgIHtcbiAgICAgICAgICAgIGZ1bmN0aW9uOiByb3V0aW5nRnVuY3Rpb24sXG4gICAgICAgICAgICBldmVudFR5cGU6IGNsb3VkZnJvbnQuRnVuY3Rpb25FdmVudFR5cGUuVklFV0VSX1JFUVVFU1QsXG4gICAgICAgICAgfSxcbiAgICAgICAgXSxcbiAgICAgICAgY2FjaGVQb2xpY3k6IGNsb3VkZnJvbnQuQ2FjaGVQb2xpY3kuQ0FDSElOR19PUFRJTUlaRUQsXG4gICAgICB9LFxuICAgICAgYWRkaXRpb25hbEJlaGF2aW9yczoge1xuICAgICAgICAnL2Zhdmljb24qJzoge1xuICAgICAgICAgIG9yaWdpbjogY2xvdWRmcm9udF9vcmlnaW5zLlMzQnVja2V0T3JpZ2luLndpdGhPcmlnaW5BY2Nlc3NDb250cm9sKHRoaXMuYnVja2V0KSxcbiAgICAgICAgICB2aWV3ZXJQcm90b2NvbFBvbGljeTogY2xvdWRmcm9udC5WaWV3ZXJQcm90b2NvbFBvbGljeS5SRURJUkVDVF9UT19IVFRQUyxcbiAgICAgICAgICBjYWNoZVBvbGljeTogbmV3IGNsb3VkZnJvbnQuQ2FjaGVQb2xpY3kodGhpcywgJ0Zhdmljb25DYWNoZVBvbGljeScsIHtcbiAgICAgICAgICAgIGNhY2hlUG9saWN5TmFtZTogYGF1cmEyOC0ke3Byb3BzLmVudmlyb25tZW50fS1mYXZpY29uLWNhY2hlLXBvbGljeWAsXG4gICAgICAgICAgICBkZWZhdWx0VHRsOiBjZGsuRHVyYXRpb24uaG91cnMoMSksXG4gICAgICAgICAgICBtYXhUdGw6IGNkay5EdXJhdGlvbi5ob3VycygyNCksXG4gICAgICAgICAgICBtaW5UdGw6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDApLFxuICAgICAgICAgICAgZW5hYmxlQWNjZXB0RW5jb2RpbmdHemlwOiB0cnVlLFxuICAgICAgICAgICAgZW5hYmxlQWNjZXB0RW5jb2RpbmdCcm90bGk6IHRydWUsXG4gICAgICAgICAgICBxdWVyeVN0cmluZ0JlaGF2aW9yOiBjbG91ZGZyb250LkNhY2hlUXVlcnlTdHJpbmdCZWhhdmlvci5ub25lKCksXG4gICAgICAgICAgICBoZWFkZXJCZWhhdmlvcjogY2xvdWRmcm9udC5DYWNoZUhlYWRlckJlaGF2aW9yLm5vbmUoKSxcbiAgICAgICAgICAgIGNvb2tpZUJlaGF2aW9yOiBjbG91ZGZyb250LkNhY2hlQ29va2llQmVoYXZpb3Iubm9uZSgpLFxuICAgICAgICAgIH0pLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIGRvbWFpbk5hbWVzOlxuICAgICAgICBwcm9wcy5lbnZpcm9ubWVudCA9PT0gJ3Byb2QnID8gW3Byb3BzLmRvbWFpbk5hbWUsIGB3d3cuJHtwcm9wcy5kb21haW5OYW1lfWBdIDogW3NpdGVEb21haW5dLFxuICAgICAgY2VydGlmaWNhdGUsXG4gICAgICBlcnJvclJlc3BvbnNlczogW1xuICAgICAgICB7XG4gICAgICAgICAgaHR0cFN0YXR1czogNDA0LFxuICAgICAgICAgIHJlc3BvbnNlSHR0cFN0YXR1czogMjAwLFxuICAgICAgICAgIHJlc3BvbnNlUGFnZVBhdGg6ICcvNDA0Lmh0bWwnLFxuICAgICAgICAgIHR0bDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoNSksXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgICAgZGVmYXVsdFJvb3RPYmplY3Q6ICdpbmRleC5odG1sJyxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBSb3V0ZTUzIEEgcmVjb3JkXG4gICAgbmV3IHJvdXRlNTMuQVJlY29yZCh0aGlzLCAnQWxpYXNSZWNvcmQnLCB7XG4gICAgICByZWNvcmROYW1lOiBzaXRlRG9tYWluLFxuICAgICAgdGFyZ2V0OiByb3V0ZTUzLlJlY29yZFRhcmdldC5mcm9tQWxpYXMoXG4gICAgICAgIG5ldyByb3V0ZTUzX3RhcmdldHMuQ2xvdWRGcm9udFRhcmdldCh0aGlzLmRpc3RyaWJ1dGlvbiksXG4gICAgICApLFxuICAgICAgem9uZTogaG9zdGVkWm9uZSxcbiAgICB9KTtcblxuICAgIC8vIElmIHByb2R1Y3Rpb24sIGNyZWF0ZSB3d3cgcmVkaXJlY3RcbiAgICBpZiAocHJvcHMuZW52aXJvbm1lbnQgPT09ICdwcm9kJykge1xuICAgICAgbmV3IHJvdXRlNTMuQVJlY29yZCh0aGlzLCAnV3d3QWxpYXNSZWNvcmQnLCB7XG4gICAgICAgIHJlY29yZE5hbWU6IGB3d3cuJHtwcm9wcy5kb21haW5OYW1lfWAsXG4gICAgICAgIHRhcmdldDogcm91dGU1My5SZWNvcmRUYXJnZXQuZnJvbUFsaWFzKFxuICAgICAgICAgIG5ldyByb3V0ZTUzX3RhcmdldHMuQ2xvdWRGcm9udFRhcmdldCh0aGlzLmRpc3RyaWJ1dGlvbiksXG4gICAgICAgICksXG4gICAgICAgIHpvbmU6IGhvc3RlZFpvbmUsXG4gICAgICB9KTtcbiAgICB9XG5cbiAgICAvLyBEZXBsb3kgc2l0ZSBjb250ZW50c1xuICAgIG5ldyBzM2RlcGxveS5CdWNrZXREZXBsb3ltZW50KHRoaXMsICdEZXBsb3lXZWJzaXRlJywge1xuICAgICAgc291cmNlczogW3MzZGVwbG95LlNvdXJjZS5hc3NldCgnLi4vZnJvbnRlbmQvb3V0JyldLFxuICAgICAgZGVzdGluYXRpb25CdWNrZXQ6IHRoaXMuYnVja2V0LFxuICAgICAgZGlzdHJpYnV0aW9uOiB0aGlzLmRpc3RyaWJ1dGlvbixcbiAgICAgIGRpc3RyaWJ1dGlvblBhdGhzOiBbJy8qJ10sXG4gICAgICBwcnVuZTogZmFsc2UsXG4gICAgfSk7XG5cbiAgICAvLyBPdXRwdXQgQ29nbml0byBjb25maWd1cmF0aW9uIGZvciBmcm9udGVuZFxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdDb2duaXRvVXNlclBvb2xJZCcsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmF1dGgudXNlclBvb2wudXNlclBvb2xJZCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQ29nbml0byBVc2VyIFBvb2wgSUQnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0NvZ25pdG9DbGllbnRJZCcsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmF1dGgudXNlclBvb2xDbGllbnQudXNlclBvb2xDbGllbnRJZCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQ29nbml0byBDbGllbnQgSUQnLFxuICAgIH0pO1xuXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0NvZ25pdG9Eb21haW4nLCB7XG4gICAgICB2YWx1ZTogYGF1cmEyOC0ke3Byb3BzLmVudmlyb25tZW50fWAsXG4gICAgICBkZXNjcmlwdGlvbjogJ0NvZ25pdG8gRG9tYWluIFByZWZpeCcsXG4gICAgfSk7XG5cbiAgICAvLyBPdXRwdXQgQ2xvdWRGcm9udCBVUkxcbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnRGlzdHJpYnV0aW9uVXJsJywge1xuICAgICAgdmFsdWU6IGBodHRwczovLyR7c2l0ZURvbWFpbn1gLFxuICAgICAgZGVzY3JpcHRpb246ICdXZWJzaXRlIFVSTCcsXG4gICAgfSk7XG5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQ2xvdWRGcm9udFVybCcsIHtcbiAgICAgIHZhbHVlOiBgaHR0cHM6Ly8ke3RoaXMuZGlzdHJpYnV0aW9uLmRpc3RyaWJ1dGlvbkRvbWFpbk5hbWV9YCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQ2xvdWRGcm9udCBEaXN0cmlidXRpb24gVVJMJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdVc2VyVGFibGVOYW1lJywge1xuICAgICAgdmFsdWU6IHRoaXMudXNlclRhYmxlLnRhYmxlTmFtZSxcbiAgICAgIGRlc2NyaXB0aW9uOiAnRHluYW1vREIgVXNlciBUYWJsZSBOYW1lJyxcbiAgICB9KTtcblxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdBcGlHYXRld2F5VXJsJywge1xuICAgICAgdmFsdWU6IHRoaXMuYXBpLmFwaS51cmwsXG4gICAgICBkZXNjcmlwdGlvbjogJ0FQSSBHYXRld2F5IFVSTCBmb3IgZnJvbnRlbmQgLmVudi5sb2NhbCcsXG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==