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
const cdk = __importStar(require("aws-cdk-lib"));
const assertions_1 = require("aws-cdk-lib/assertions");
const website_stack_1 = require("../lib/website-stack");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
describe('WebsiteStack', () => {
    let app;
    let stack;
    let template;
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
                'aws:cdk:bundling-stacks': ['TestStack']
            }
        });
        // Mock bundling for Lambda functions
        process.env.CDK_BUNDLING_STAGING_DISABLED = '1';
        stack = new website_stack_1.WebsiteStack(app, 'TestStack', {
            domainName: 'example.com',
            subdomain: 'test',
            environment: 'dev',
            env: {
                account: '123456789012',
                region: 'us-east-1',
            },
        });
        template = assertions_1.Template.fromStack(stack);
    });
    test('S3 bucket is created with correct properties', () => {
        template.hasResourceProperties('AWS::S3::Bucket', {
            BucketName: assertions_1.Match.stringLikeRegexp('aura28-dev-website-.*'),
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
                DNSName: assertions_1.Match.anyValue(),
                HostedZoneId: assertions_1.Match.anyValue(),
            },
        });
    });
    test('ACM certificate is created', () => {
        template.hasResourceProperties('AWS::CertificateManager::Certificate', {
            DomainName: 'test.example.com',
            DomainValidationOptions: assertions_1.Match.anyValue(),
            Tags: assertions_1.Match.arrayWith([
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
        const s3Resources = Object.entries(resources).filter(([, resource]) => resource.Type === 'AWS::S3::Bucket');
        expect(s3Resources.length).toBeGreaterThan(0);
        s3Resources.forEach(([, resource]) => {
            expect(resource.Properties.Tags).toEqual(expect.arrayContaining([
                expect.objectContaining({
                    Key: 'Project',
                    Value: 'Aura28CDK',
                }),
            ]));
        });
        // Check that DynamoDB table has the tag
        const dynamoResources = Object.entries(resources).filter(([, resource]) => resource.Type === 'AWS::DynamoDB::Table');
        expect(dynamoResources.length).toBeGreaterThan(0);
        dynamoResources.forEach(([, resource]) => {
            expect(resource.Properties.Tags).toEqual(expect.arrayContaining([
                expect.objectContaining({
                    Key: 'Project',
                    Value: 'Aura28CDK',
                }),
            ]));
        });
    });
    test('Production stack includes www redirect', () => {
        const prodApp = new cdk.App();
        const prodStack = new website_stack_1.WebsiteStack(prodApp, 'ProdTestStack', {
            domainName: 'example.com',
            environment: 'prod',
            env: {
                account: '123456789012',
                region: 'us-east-1',
            },
        });
        const prodTemplate = assertions_1.Template.fromStack(prodStack);
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
        const prodStack = new website_stack_1.WebsiteStack(prodApp, 'ProdTestStack', {
            domainName: 'example.com',
            environment: 'prod',
            env: {
                account: '123456789012',
                region: 'us-east-1',
            },
        });
        const prodTemplate = assertions_1.Template.fromStack(prodStack);
        // Check DynamoDB table has correct removal policy
        const dynamoResources = prodTemplate.findResources('AWS::DynamoDB::Table');
        Object.values(dynamoResources).forEach((resource) => {
            expect(resource.DeletionPolicy).toBe('Retain');
            expect(resource.UpdateReplacePolicy).toBe('Retain');
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2Vic2l0ZS1zdGFjay50ZXN0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsid2Vic2l0ZS1zdGFjay50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFDbkMsdURBQXlEO0FBQ3pELHdEQUFvRDtBQUNwRCx1Q0FBeUI7QUFDekIsMkNBQTZCO0FBRTdCLFFBQVEsQ0FBQyxjQUFjLEVBQUUsR0FBRyxFQUFFO0lBQzVCLElBQUksR0FBWSxDQUFDO0lBQ2pCLElBQUksS0FBbUIsQ0FBQztJQUN4QixJQUFJLFFBQWtCLENBQUM7SUFFdkIsc0RBQXNEO0lBQ3RELE1BQU0sY0FBYyxHQUFHLElBQUksQ0FBQyxJQUFJLENBQUMsU0FBUyxFQUFFLG9CQUFvQixDQUFDLENBQUM7SUFFbEUsU0FBUyxDQUFDLEdBQUcsRUFBRTtRQUNiLElBQUksQ0FBQyxFQUFFLENBQUMsVUFBVSxDQUFDLGNBQWMsQ0FBQyxFQUFFLENBQUM7WUFDbkMsRUFBRSxDQUFDLFNBQVMsQ0FBQyxjQUFjLEVBQUUsRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztZQUNsRCxpQ0FBaUM7WUFDakMsRUFBRSxDQUFDLGFBQWEsQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLGNBQWMsRUFBRSxZQUFZLENBQUMsRUFBRSxlQUFlLENBQUMsQ0FBQztRQUM3RSxDQUFDO0lBQ0gsQ0FBQyxDQUFDLENBQUM7SUFFSCxRQUFRLENBQUMsR0FBRyxFQUFFO1FBQ1osbUNBQW1DO1FBQ25DLElBQUksRUFBRSxDQUFDLFVBQVUsQ0FBQyxjQUFjLENBQUMsRUFBRSxDQUFDO1lBQ2xDLEVBQUUsQ0FBQyxNQUFNLENBQUMsY0FBYyxFQUFFLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxLQUFLLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQztRQUM5RCxDQUFDO0lBQ0gsQ0FBQyxDQUFDLENBQUM7SUFFSCxVQUFVLENBQUMsR0FB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IFRlbXBsYXRlLCBNYXRjaCB9IGZyb20gJ2F3cy1jZGstbGliL2Fzc2VydGlvbnMnO1xuaW1wb3J0IHsgV2Vic2l0ZVN0YWNrIH0gZnJvbSAnLi4vbGliL3dlYnNpdGUtc3RhY2snO1xuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcblxuZGVzY3JpYmUoJ1dlYnNpdGVTdGFjaycsICgpID0+IHtcbiAgbGV0IGFwcDogY2RrLkFwcDtcbiAgbGV0IHN0YWNrOiBXZWJzaXRlU3RhY2s7XG4gIGxldCB0ZW1wbGF0ZTogVGVtcGxhdGU7XG5cbiAgLy8gQ3JlYXRlIGEgdGVtcG9yYXJ5IGZyb250ZW5kL291dCBkaXJlY3RvcnkgZm9yIHRlc3RzXG4gIGNvbnN0IGZyb250ZW5kT3V0RGlyID0gcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uLy4uL2Zyb250ZW5kL291dCcpO1xuXG4gIGJlZm9yZUFsbCgoKSA9PiB7XG4gICAgaWYgKCFmcy5leGlzdHNTeW5jKGZyb250ZW5kT3V0RGlyKSkge1xuICAgICAgZnMubWtkaXJTeW5jKGZyb250ZW5kT3V0RGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbiAgICAgIC8vIENyZWF0ZSBhIGR1bW15IGluZGV4Lmh0bWwgZmlsZVxuICAgICAgZnMud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4oZnJvbnRlbmRPdXREaXIsICdpbmRleC5odG1sJyksICc8aHRtbD48L2h0bWw+Jyk7XG4gICAgfVxuICB9KTtcblxuICBhZnRlckFsbCgoKSA9PiB7XG4gICAgLy8gQ2xlYW4gdXAgdGhlIHRlbXBvcmFyeSBkaXJlY3RvcnlcbiAgICBpZiAoZnMuZXhpc3RzU3luYyhmcm9udGVuZE91dERpcikpIHtcbiAgICAgIGZzLnJtU3luYyhmcm9udGVuZE91dERpciwgeyByZWN1cnNpdmU6IHRydWUsIGZvcmNlOiB0cnVlIH0pO1xuICAgIH1cbiAgfSk7XG5cbiAgYmVmb3JlRWFjaCgoKSA9PiB7XG4gICAgLy8gU2V0IGJ1bmRsaW5nIHRvIHVzZSBsb2NhbCBtb2RlIGZvciB0ZXN0c1xuICAgIGFwcCA9IG5ldyBjZGsuQXBwKHtcbiAgICAgIGNvbnRleHQ6IHtcbiAgICAgICAgJ2F3czpjZGs6YnVuZGxpbmctc3RhY2tzJzogWydUZXN0U3RhY2snXVxuICAgICAgfVxuICAgIH0pO1xuICAgIFxuICAgIC8vIE1vY2sgYnVuZGxpbmcgZm9yIExhbWJkYSBmdW5jdGlvbnNcbiAgICBwcm9jZXNzLmVudi5DREtfQlVORExJTkdfU1RBR0lOR19ESVNBQkxFRCA9ICcxJztcbiAgICBcbiAgICBzdGFjayA9IG5ldyBXZWJzaXRlU3RhY2soYXBwLCAnVGVzdFN0YWNrJywge1xuICAgICAgZG9tYWluTmFtZTogJ2V4YW1wbGUuY29tJyxcbiAgICAgIHN1YmRvbWFpbjogJ3Rlc3QnLFxuICAgICAgZW52aXJvbm1lbnQ6ICdkZXYnLFxuICAgICAgZW52OiB7XG4gICAgICAgIGFjY291bnQ6ICcxMjM0NTY3ODkwMTInLFxuICAgICAgICByZWdpb246ICd1cy1lYXN0LTEnLFxuICAgICAgfSxcbiAgICB9KTtcbiAgICB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjayk7XG4gIH0pO1xuXG4gIHRlc3QoJ1MzIGJ1Y2tldCBpcyBjcmVhdGVkIHdpdGggY29ycmVjdCBwcm9wZXJ0aWVzJywgKCkgPT4ge1xuICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpTMzo6QnVja2V0Jywge1xuICAgICAgQnVja2V0TmFtZTogTWF0Y2guc3RyaW5nTGlrZVJlZ2V4cCgnYXVyYTI4LWRldi13ZWJzaXRlLS4qJyksXG4gICAgICBQdWJsaWNBY2Nlc3NCbG9ja0NvbmZpZ3VyYXRpb246IHtcbiAgICAgICAgQmxvY2tQdWJsaWNBY2xzOiB0cnVlLFxuICAgICAgICBCbG9ja1B1YmxpY1BvbGljeTogdHJ1ZSxcbiAgICAgICAgSWdub3JlUHVibGljQWNsczogdHJ1ZSxcbiAgICAgICAgUmVzdHJpY3RQdWJsaWNCdWNrZXRzOiB0cnVlLFxuICAgICAgfSxcbiAgICB9KTtcbiAgfSk7XG5cbiAgdGVzdCgnQ2xvdWRGcm9udCBkaXN0cmlidXRpb24gaXMgY3JlYXRlZCcsICgpID0+IHtcbiAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6Q2xvdWRGcm9udDo6RGlzdHJpYnV0aW9uJywge1xuICAgICAgRGlzdHJpYnV0aW9uQ29uZmlnOiB7XG4gICAgICAgIERlZmF1bHRSb290T2JqZWN0OiAnaW5kZXguaHRtbCcsXG4gICAgICAgIEVuYWJsZWQ6IHRydWUsXG4gICAgICAgIEh0dHBWZXJzaW9uOiAnaHR0cDInLFxuICAgICAgICBJUFY2RW5hYmxlZDogdHJ1ZSxcbiAgICAgIH0sXG4gICAgfSk7XG4gIH0pO1xuXG4gIHRlc3QoJ0Nsb3VkRnJvbnQgZnVuY3Rpb24gZm9yIHJvdXRpbmcgaXMgY3JlYXRlZCcsICgpID0+IHtcbiAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6Q2xvdWRGcm9udDo6RnVuY3Rpb24nLCB7XG4gICAgICBGdW5jdGlvbkNvbmZpZzoge1xuICAgICAgICBSdW50aW1lOiAnY2xvdWRmcm9udC1qcy0xLjAnLFxuICAgICAgfSxcbiAgICB9KTtcbiAgfSk7XG5cbiAgdGVzdCgnUm91dGU1MyBBIHJlY29yZCBpcyBjcmVhdGVkJywgKCkgPT4ge1xuICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpSb3V0ZTUzOjpSZWNvcmRTZXQnLCB7XG4gICAgICBOYW1lOiAndGVzdC5leGFtcGxlLmNvbS4nLFxuICAgICAgVHlwZTogJ0EnLFxuICAgICAgQWxpYXNUYXJnZXQ6IHtcbiAgICAgICAgRE5TTmFtZTogTWF0Y2guYW55VmFsdWUoKSxcbiAgICAgICAgSG9zdGVkWm9uZUlkOiBNYXRjaC5hbnlWYWx1ZSgpLFxuICAgICAgfSxcbiAgICB9KTtcbiAgfSk7XG5cbiAgdGVzdCgnQUNNIGNlcnRpZmljYXRlIGlzIGNyZWF0ZWQnLCAoKSA9PiB7XG4gICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OkNlcnRpZmljYXRlTWFuYWdlcjo6Q2VydGlmaWNhdGUnLCB7XG4gICAgICBEb21haW5OYW1lOiAndGVzdC5leGFtcGxlLmNvbScsXG4gICAgICBEb21haW5WYWxpZGF0aW9uT3B0aW9uczogTWF0Y2guYW55VmFsdWUoKSxcbiAgICAgIFRhZ3M6IE1hdGNoLmFycmF5V2l0aChbXG4gICAgICAgIHtcbiAgICAgICAgICBLZXk6ICdQcm9qZWN0JyxcbiAgICAgICAgICBWYWx1ZTogJ0F1cmEyOENESycsXG4gICAgICAgIH0sXG4gICAgICBdKSxcbiAgICB9KTtcbiAgfSk7XG5cbiAgdGVzdCgnRHluYW1vREIgdGFibGUgaXMgY3JlYXRlZCB3aXRoIGNvcnJlY3QgcHJvcGVydGllcycsICgpID0+IHtcbiAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6RHluYW1vREI6OlRhYmxlJywge1xuICAgICAgVGFibGVOYW1lOiAnQXVyYTI4LWRldi1Vc2VycycsXG4gICAgICBCaWxsaW5nTW9kZTogJ1BBWV9QRVJfUkVRVUVTVCcsXG4gICAgICBQb2ludEluVGltZVJlY292ZXJ5U3BlY2lmaWNhdGlvbjoge1xuICAgICAgICBQb2ludEluVGltZVJlY292ZXJ5RW5hYmxlZDogdHJ1ZSxcbiAgICAgIH0sXG4gICAgICBLZXlTY2hlbWE6IFtcbiAgICAgICAge1xuICAgICAgICAgIEF0dHJpYnV0ZU5hbWU6ICd1c2VySWQnLFxuICAgICAgICAgIEtleVR5cGU6ICdIQVNIJyxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIEF0dHJpYnV0ZU5hbWU6ICdjcmVhdGVkQXQnLFxuICAgICAgICAgIEtleVR5cGU6ICdSQU5HRScsXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgICAgQXR0cmlidXRlRGVmaW5pdGlvbnM6IFtcbiAgICAgICAge1xuICAgICAgICAgIEF0dHJpYnV0ZU5hbWU6ICd1c2VySWQnLFxuICAgICAgICAgIEF0dHJpYnV0ZVR5cGU6ICdTJyxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIEF0dHJpYnV0ZU5hbWU6ICdjcmVhdGVkQXQnLFxuICAgICAgICAgIEF0dHJpYnV0ZVR5cGU6ICdTJyxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgfSk7XG4gIH0pO1xuXG4gIHRlc3QoJ1Jlc291cmNlcyBhcmUgdGFnZ2VkIHdpdGggUHJvamVjdCB0YWcnLCAoKSA9PiB7XG4gICAgY29uc3QgcmVzb3VyY2VzID0gdGVtcGxhdGUudG9KU09OKCkuUmVzb3VyY2VzO1xuXG4gICAgLy8gQ2hlY2sgdGhhdCBTMyBidWNrZXQgaGFzIHRoZSB0YWdcbiAgICBjb25zdCBzM1Jlc291cmNlcyA9IE9iamVjdC5lbnRyaWVzKHJlc291cmNlcykuZmlsdGVyKFxuICAgICAgKFssIHJlc291cmNlXTogW3N0cmluZywgYW55XSkgPT4gcmVzb3VyY2UuVHlwZSA9PT0gJ0FXUzo6UzM6OkJ1Y2tldCcsXG4gICAgKTtcblxuICAgIGV4cGVjdChzM1Jlc291cmNlcy5sZW5ndGgpLnRvQmVHcmVhdGVyVGhhbigwKTtcbiAgICBzM1Jlc291cmNlcy5mb3JFYWNoKChbLCByZXNvdXJjZV06IFtzdHJpbmcsIGFueV0pID0+IHtcbiAgICAgIGV4cGVjdChyZXNvdXJjZS5Qcm9wZXJ0aWVzLlRhZ3MpLnRvRXF1YWwoXG4gICAgICAgIGV4cGVjdC5hcnJheUNvbnRhaW5pbmcoW1xuICAgICAgICAgIGV4cGVjdC5vYmplY3RDb250YWluaW5nKHtcbiAgICAgICAgICAgIEtleTogJ1Byb2plY3QnLFxuICAgICAgICAgICAgVmFsdWU6ICdBdXJhMjhDREsnLFxuICAgICAgICAgIH0pLFxuICAgICAgICBdKSxcbiAgICAgICk7XG4gICAgfSk7XG5cbiAgICAvLyBDaGVjayB0aGF0IER5bmFtb0RCIHRhYmxlIGhhcyB0aGUgdGFnXG4gICAgY29uc3QgZHluYW1vUmVzb3VyY2VzID0gT2JqZWN0LmVudHJpZXMocmVzb3VyY2VzKS5maWx0ZXIoXG4gICAgICAoWywgcmVzb3VyY2VdOiBbc3RyaW5nLCBhbnldKSA9PiByZXNvdXJjZS5UeXBlID09PSAnQVdTOjpEeW5hbW9EQjo6VGFibGUnLFxuICAgICk7XG5cbiAgICBleHBlY3QoZHluYW1vUmVzb3VyY2VzLmxlbmd0aCkudG9CZUdyZWF0ZXJUaGFuKDApO1xuICAgIGR5bmFtb1Jlc291cmNlcy5mb3JFYWNoKChbLCByZXNvdXJjZV06IFtzdHJpbmcsIGFueV0pID0+IHtcbiAgICAgIGV4cGVjdChyZXNvdXJjZS5Qcm9wZXJ0aWVzLlRhZ3MpLnRvRXF1YWwoXG4gICAgICAgIGV4cGVjdC5hcnJheUNvbnRhaW5pbmcoW1xuICAgICAgICAgIGV4cGVjdC5vYmplY3RDb250YWluaW5nKHtcbiAgICAgICAgICAgIEtleTogJ1Byb2plY3QnLFxuICAgICAgICAgICAgVmFsdWU6ICdBdXJhMjhDREsnLFxuICAgICAgICAgIH0pLFxuICAgICAgICBdKSxcbiAgICAgICk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIHRlc3QoJ1Byb2R1Y3Rpb24gc3RhY2sgaW5jbHVkZXMgd3d3IHJlZGlyZWN0JywgKCkgPT4ge1xuICAgIGNvbnN0IHByb2RBcHAgPSBuZXcgY2RrLkFwcCgpO1xuICAgIGNvbnN0IHByb2RTdGFjayA9IG5ldyBXZWJzaXRlU3RhY2socHJvZEFwcCwgJ1Byb2RUZXN0U3RhY2snLCB7XG4gICAgICBkb21haW5OYW1lOiAnZXhhbXBsZS5jb20nLFxuICAgICAgZW52aXJvbm1lbnQ6ICdwcm9kJyxcbiAgICAgIGVudjoge1xuICAgICAgICBhY2NvdW50OiAnMTIzNDU2Nzg5MDEyJyxcbiAgICAgICAgcmVnaW9uOiAndXMtZWFzdC0xJyxcbiAgICAgIH0sXG4gICAgfSk7XG4gICAgY29uc3QgcHJvZFRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHByb2RTdGFjayk7XG5cbiAgICAvLyBTaG91bGQgaGF2ZSB0d28gQSByZWNvcmRzIChhcGV4IGFuZCB3d3cpXG4gICAgY29uc3QgYVJlY29yZHMgPSBwcm9kVGVtcGxhdGUuZmluZFJlc291cmNlcygnQVdTOjpSb3V0ZTUzOjpSZWNvcmRTZXQnLCB7XG4gICAgICBQcm9wZXJ0aWVzOiB7XG4gICAgICAgIFR5cGU6ICdBJyxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICBleHBlY3QoT2JqZWN0LmtleXMoYVJlY29yZHMpLmxlbmd0aCkudG9CZSgyKTtcbiAgfSk7XG5cbiAgdGVzdCgnUHJvZHVjdGlvbiBEeW5hbW9EQiB0YWJsZSBoYXMgUkVUQUlOIHJlbW92YWwgcG9saWN5JywgKCkgPT4ge1xuICAgIGNvbnN0IHByb2RBcHAgPSBuZXcgY2RrLkFwcCgpO1xuICAgIGNvbnN0IHByb2RTdGFjayA9IG5ldyBXZWJzaXRlU3RhY2socHJvZEFwcCwgJ1Byb2RUZXN0U3RhY2snLCB7XG4gICAgICBkb21haW5OYW1lOiAnZXhhbXBsZS5jb20nLFxuICAgICAgZW52aXJvbm1lbnQ6ICdwcm9kJyxcbiAgICAgIGVudjoge1xuICAgICAgICBhY2NvdW50OiAnMTIzNDU2Nzg5MDEyJyxcbiAgICAgICAgcmVnaW9uOiAndXMtZWFzdC0xJyxcbiAgICAgIH0sXG4gICAgfSk7XG4gICAgY29uc3QgcHJvZFRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHByb2RTdGFjayk7XG5cbiAgICAvLyBDaGVjayBEeW5hbW9EQiB0YWJsZSBoYXMgY29ycmVjdCByZW1vdmFsIHBvbGljeVxuICAgIGNvbnN0IGR5bmFtb1Jlc291cmNlcyA9IHByb2RUZW1wbGF0ZS5maW5kUmVzb3VyY2VzKCdBV1M6OkR5bmFtb0RCOjpUYWJsZScpO1xuICAgIE9iamVjdC52YWx1ZXMoZHluYW1vUmVzb3VyY2VzKS5mb3JFYWNoKChyZXNvdXJjZTogYW55KSA9PiB7XG4gICAgICBleHBlY3QocmVzb3VyY2UuRGVsZXRpb25Qb2xpY3kpLnRvQmUoJ1JldGFpbicpO1xuICAgICAgZXhwZWN0KHJlc291cmNlLlVwZGF0ZVJlcGxhY2VQb2xpY3kpLnRvQmUoJ1JldGFpbicpO1xuICAgIH0pO1xuICB9KTtcbn0pO1xuIl19