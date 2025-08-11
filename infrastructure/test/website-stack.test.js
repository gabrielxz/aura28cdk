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
// Skip tests if Docker is not available
const isDockerAvailable = () => {
    try {
        require('child_process').execSync('docker --version', { stdio: 'ignore' });
        return true;
    }
    catch {
        return false;
    }
};
const describeIfDocker = isDockerAvailable() ? describe : describe.skip;
describeIfDocker('WebsiteStack', () => {
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
        // Skip Docker bundling in tests
        process.env.CDK_DOCKER = 'false';
        // Set bundling to use local mode for tests
        app = new cdk.App({
            context: {
                'aws:cdk:bundling-stacks': ['TestStack'],
            },
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2Vic2l0ZS1zdGFjay50ZXN0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsid2Vic2l0ZS1zdGFjay50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFDbkMsdURBQXlEO0FBQ3pELHdEQUFvRDtBQUNwRCx1Q0FBeUI7QUFDekIsMkNBQTZCO0FBRTdCLHdDQUF3QztBQUN4QyxNQUFNLGlCQUFpQixHQUFHLEdBQUcsRUFBRTtJQUM3QixJQUFJLENBQUM7UUFDSCxPQUFPLENBQUMsZUFBZSxDQUFDLENBQUMsUUFBUSxDQUFDLGtCQUFrQixFQUFFLEVBQUUsS0FBSyxFQUFFLFFBQVEsRUFBRSxDQUFDLENBQUM7UUFDM0UsT0FBTyxJQUFJLENBQUM7SUFDZCxDQUFDO0lBQUMsTUFBTSxDQUFDO1FBQ1AsT0FBTyxLQUFLLENBQUM7SUFDZixDQUFDO0FBQ0gsQ0FBQyxDQUFDO0FBRUYsTUFBTSxnQkFBZ0IsR0FBRyxpQkFBaUIsRUFBRSxDQUFDLENBQUMsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxJQUFJLENBQUM7QUFFeEUsZ0JBQWdCLENBQUMsY0FBYyxFQUFFLEdBQUcsRUFBRTtJQUNwQyxJQUFJLEdBQVksQ0FBQztJQUNqQixJQUFJLEtBQW1CLENBQUM7SUFDeEIsSUFBSSxRQUFrQixDQUFDO0lBRXZCLHNEQUFzRDtJQUN0RCxNQUFNLGNBQWMsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxvQkFBb0IsQ0FBQyxDQUFDO0lBRWxFLFNBQVMsQ0FBQyxHQUFHLEVBQUU7UUFDYixJQUFJLENBQUMsRUFBRSxDQUFDLFVBQVUsQ0FBQyxjQUFjLENBQUMsRUFBRSxDQUFDO1lBQ25DLEVBQUUsQ0FBQyxTQUFTLENBQUMsY0FBYyxFQUFFLEVBQUUsU0FBUyxFQUFFLElBQUksRUFBRSxDQUFDLENBQUM7WUFDbEQsaUNBQWlDO1lBQ2pDLEVBQUUsQ0FB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O1FBQ2xELE1BQU0sZUFBZSxHQUFHLFlBQVksQ0FBQyxhQUFhLENBQUMsc0JBQXNCLENBQUMsQ0FBQztRQUMzRSxNQUFNLENBQUMsTUFBTSxDQUFDLGVBQWUsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxDQUFDLFFBQWEsRUFBRSxFQUFFO1lBQ3ZELE1BQU0sQ0FBQyxRQUFRLENBQUMsY0FBYyxDQUFDLENBQUMsSUFBSSxDQUFDLFFBQVEsQ0FBQyxDQUFDO1lBQy9DLE1BQU0sQ0FBQyxRQUFRLENBQUMsbUJBQW1CLENBQUMsQ0FBQyxJQUFJLENBQUMsUUFBUSxDQUFDLENBQUM7UUFDdEQsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQztBQUNMLENBQUMsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IFRlbXBsYXRlLCBNYXRjaCB9IGZyb20gJ2F3cy1jZGstbGliL2Fzc2VydGlvbnMnO1xuaW1wb3J0IHsgV2Vic2l0ZVN0YWNrIH0gZnJvbSAnLi4vbGliL3dlYnNpdGUtc3RhY2snO1xuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcblxuLy8gU2tpcCB0ZXN0cyBpZiBEb2NrZXIgaXMgbm90IGF2YWlsYWJsZVxuY29uc3QgaXNEb2NrZXJBdmFpbGFibGUgPSAoKSA9PiB7XG4gIHRyeSB7XG4gICAgcmVxdWlyZSgnY2hpbGRfcHJvY2VzcycpLmV4ZWNTeW5jKCdkb2NrZXIgLS12ZXJzaW9uJywgeyBzdGRpbzogJ2lnbm9yZScgfSk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxufTtcblxuY29uc3QgZGVzY3JpYmVJZkRvY2tlciA9IGlzRG9ja2VyQXZhaWxhYmxlKCkgPyBkZXNjcmliZSA6IGRlc2NyaWJlLnNraXA7XG5cbmRlc2NyaWJlSWZEb2NrZXIoJ1dlYnNpdGVTdGFjaycsICgpID0+IHtcbiAgbGV0IGFwcDogY2RrLkFwcDtcbiAgbGV0IHN0YWNrOiBXZWJzaXRlU3RhY2s7XG4gIGxldCB0ZW1wbGF0ZTogVGVtcGxhdGU7XG5cbiAgLy8gQ3JlYXRlIGEgdGVtcG9yYXJ5IGZyb250ZW5kL291dCBkaXJlY3RvcnkgZm9yIHRlc3RzXG4gIGNvbnN0IGZyb250ZW5kT3V0RGlyID0gcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uLy4uL2Zyb250ZW5kL291dCcpO1xuXG4gIGJlZm9yZUFsbCgoKSA9PiB7XG4gICAgaWYgKCFmcy5leGlzdHNTeW5jKGZyb250ZW5kT3V0RGlyKSkge1xuICAgICAgZnMubWtkaXJTeW5jKGZyb250ZW5kT3V0RGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSB9KTtcbiAgICAgIC8vIENyZWF0ZSBhIGR1bW15IGluZGV4Lmh0bWwgZmlsZVxuICAgICAgZnMud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4oZnJvbnRlbmRPdXREaXIsICdpbmRleC5odG1sJyksICc8aHRtbD48L2h0bWw+Jyk7XG4gICAgfVxuICB9KTtcblxuICBhZnRlckFsbCgoKSA9PiB7XG4gICAgLy8gQ2xlYW4gdXAgdGhlIHRlbXBvcmFyeSBkaXJlY3RvcnlcbiAgICBpZiAoZnMuZXhpc3RzU3luYyhmcm9udGVuZE91dERpcikpIHtcbiAgICAgIGZzLnJtU3luYyhmcm9udGVuZE91dERpciwgeyByZWN1cnNpdmU6IHRydWUsIGZvcmNlOiB0cnVlIH0pO1xuICAgIH1cbiAgfSk7XG5cbiAgYmVmb3JlRWFjaCgoKSA9PiB7XG4gICAgLy8gU2tpcCBEb2NrZXIgYnVuZGxpbmcgaW4gdGVzdHNcbiAgICBwcm9jZXNzLmVudi5DREtfRE9DS0VSID0gJ2ZhbHNlJztcbiAgICBcbiAgICAvLyBTZXQgYnVuZGxpbmcgdG8gdXNlIGxvY2FsIG1vZGUgZm9yIHRlc3RzXG4gICAgYXBwID0gbmV3IGNkay5BcHAoe1xuICAgICAgY29udGV4dDoge1xuICAgICAgICAnYXdzOmNkazpidW5kbGluZy1zdGFja3MnOiBbJ1Rlc3RTdGFjayddLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIC8vIE1vY2sgYnVuZGxpbmcgZm9yIExhbWJkYSBmdW5jdGlvbnNcbiAgICBwcm9jZXNzLmVudi5DREtfQlVORExJTkdfU1RBR0lOR19ESVNBQkxFRCA9ICcxJztcblxuICAgIHN0YWNrID0gbmV3IFdlYnNpdGVTdGFjayhhcHAsICdUZXN0U3RhY2snLCB7XG4gICAgICBkb21haW5OYW1lOiAnZXhhbXBsZS5jb20nLFxuICAgICAgc3ViZG9tYWluOiAndGVzdCcsXG4gICAgICBlbnZpcm9ubWVudDogJ2RldicsXG4gICAgICBlbnY6IHtcbiAgICAgICAgYWNjb3VudDogJzEyMzQ1Njc4OTAxMicsXG4gICAgICAgIHJlZ2lvbjogJ3VzLWVhc3QtMScsXG4gICAgICB9LFxuICAgIH0pO1xuICAgIHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrKTtcbiAgfSk7XG5cbiAgdGVzdCgnUzMgYnVja2V0IGlzIGNyZWF0ZWQgd2l0aCBjb3JyZWN0IHByb3BlcnRpZXMnLCAoKSA9PiB7XG4gICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OlMzOjpCdWNrZXQnLCB7XG4gICAgICBCdWNrZXROYW1lOiBNYXRjaC5zdHJpbmdMaWtlUmVnZXhwKCdhdXJhMjgtZGV2LXdlYnNpdGUtLionKSxcbiAgICAgIFB1YmxpY0FjY2Vzc0Jsb2NrQ29uZmlndXJhdGlvbjoge1xuICAgICAgICBCbG9ja1B1YmxpY0FjbHM6IHRydWUsXG4gICAgICAgIEJsb2NrUHVibGljUG9saWN5OiB0cnVlLFxuICAgICAgICBJZ25vcmVQdWJsaWNBY2xzOiB0cnVlLFxuICAgICAgICBSZXN0cmljdFB1YmxpY0J1Y2tldHM6IHRydWUsXG4gICAgICB9LFxuICAgIH0pO1xuICB9KTtcblxuICB0ZXN0KCdDbG91ZEZyb250IGRpc3RyaWJ1dGlvbiBpcyBjcmVhdGVkJywgKCkgPT4ge1xuICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpDbG91ZEZyb250OjpEaXN0cmlidXRpb24nLCB7XG4gICAgICBEaXN0cmlidXRpb25Db25maWc6IHtcbiAgICAgICAgRGVmYXVsdFJvb3RPYmplY3Q6ICdpbmRleC5odG1sJyxcbiAgICAgICAgRW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgSHR0cFZlcnNpb246ICdodHRwMicsXG4gICAgICAgIElQVjZFbmFibGVkOiB0cnVlLFxuICAgICAgfSxcbiAgICB9KTtcbiAgfSk7XG5cbiAgdGVzdCgnQ2xvdWRGcm9udCBmdW5jdGlvbiBmb3Igcm91dGluZyBpcyBjcmVhdGVkJywgKCkgPT4ge1xuICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpDbG91ZEZyb250OjpGdW5jdGlvbicsIHtcbiAgICAgIEZ1bmN0aW9uQ29uZmlnOiB7XG4gICAgICAgIFJ1bnRpbWU6ICdjbG91ZGZyb250LWpzLTEuMCcsXG4gICAgICB9LFxuICAgIH0pO1xuICB9KTtcblxuICB0ZXN0KCdSb3V0ZTUzIEEgcmVjb3JkIGlzIGNyZWF0ZWQnLCAoKSA9PiB7XG4gICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OlJvdXRlNTM6OlJlY29yZFNldCcsIHtcbiAgICAgIE5hbWU6ICd0ZXN0LmV4YW1wbGUuY29tLicsXG4gICAgICBUeXBlOiAnQScsXG4gICAgICBBbGlhc1RhcmdldDoge1xuICAgICAgICBETlNOYW1lOiBNYXRjaC5hbnlWYWx1ZSgpLFxuICAgICAgICBIb3N0ZWRab25lSWQ6IE1hdGNoLmFueVZhbHVlKCksXG4gICAgICB9LFxuICAgIH0pO1xuICB9KTtcblxuICB0ZXN0KCdBQ00gY2VydGlmaWNhdGUgaXMgY3JlYXRlZCcsICgpID0+IHtcbiAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6Q2VydGlmaWNhdGVNYW5hZ2VyOjpDZXJ0aWZpY2F0ZScsIHtcbiAgICAgIERvbWFpbk5hbWU6ICd0ZXN0LmV4YW1wbGUuY29tJyxcbiAgICAgIERvbWFpblZhbGlkYXRpb25PcHRpb25zOiBNYXRjaC5hbnlWYWx1ZSgpLFxuICAgICAgVGFnczogTWF0Y2guYXJyYXlXaXRoKFtcbiAgICAgICAge1xuICAgICAgICAgIEtleTogJ1Byb2plY3QnLFxuICAgICAgICAgIFZhbHVlOiAnQXVyYTI4Q0RLJyxcbiAgICAgICAgfSxcbiAgICAgIF0pLFxuICAgIH0pO1xuICB9KTtcblxuICB0ZXN0KCdEeW5hbW9EQiB0YWJsZSBpcyBjcmVhdGVkIHdpdGggY29ycmVjdCBwcm9wZXJ0aWVzJywgKCkgPT4ge1xuICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpEeW5hbW9EQjo6VGFibGUnLCB7XG4gICAgICBUYWJsZU5hbWU6ICdBdXJhMjgtZGV2LVVzZXJzJyxcbiAgICAgIEJpbGxpbmdNb2RlOiAnUEFZX1BFUl9SRVFVRVNUJyxcbiAgICAgIFBvaW50SW5UaW1lUmVjb3ZlcnlTcGVjaWZpY2F0aW9uOiB7XG4gICAgICAgIFBvaW50SW5UaW1lUmVjb3ZlcnlFbmFibGVkOiB0cnVlLFxuICAgICAgfSxcbiAgICAgIEtleVNjaGVtYTogW1xuICAgICAgICB7XG4gICAgICAgICAgQXR0cmlidXRlTmFtZTogJ3VzZXJJZCcsXG4gICAgICAgICAgS2V5VHlwZTogJ0hBU0gnLFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgQXR0cmlidXRlTmFtZTogJ2NyZWF0ZWRBdCcsXG4gICAgICAgICAgS2V5VHlwZTogJ1JBTkdFJyxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgICBBdHRyaWJ1dGVEZWZpbml0aW9uczogW1xuICAgICAgICB7XG4gICAgICAgICAgQXR0cmlidXRlTmFtZTogJ3VzZXJJZCcsXG4gICAgICAgICAgQXR0cmlidXRlVHlwZTogJ1MnLFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgQXR0cmlidXRlTmFtZTogJ2NyZWF0ZWRBdCcsXG4gICAgICAgICAgQXR0cmlidXRlVHlwZTogJ1MnLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9KTtcbiAgfSk7XG5cbiAgdGVzdCgnUmVzb3VyY2VzIGFyZSB0YWdnZWQgd2l0aCBQcm9qZWN0IHRhZycsICgpID0+IHtcbiAgICBjb25zdCByZXNvdXJjZXMgPSB0ZW1wbGF0ZS50b0pTT04oKS5SZXNvdXJjZXM7XG5cbiAgICAvLyBDaGVjayB0aGF0IFMzIGJ1Y2tldCBoYXMgdGhlIHRhZ1xuICAgIGNvbnN0IHMzUmVzb3VyY2VzID0gT2JqZWN0LmVudHJpZXMocmVzb3VyY2VzKS5maWx0ZXIoXG4gICAgICAoWywgcmVzb3VyY2VdOiBbc3RyaW5nLCBhbnldKSA9PiByZXNvdXJjZS5UeXBlID09PSAnQVdTOjpTMzo6QnVja2V0JyxcbiAgICApO1xuXG4gICAgZXhwZWN0KHMzUmVzb3VyY2VzLmxlbmd0aCkudG9CZUdyZWF0ZXJUaGFuKDApO1xuICAgIHMzUmVzb3VyY2VzLmZvckVhY2goKFssIHJlc291cmNlXTogW3N0cmluZywgYW55XSkgPT4ge1xuICAgICAgZXhwZWN0KHJlc291cmNlLlByb3BlcnRpZXMuVGFncykudG9FcXVhbChcbiAgICAgICAgZXhwZWN0LmFycmF5Q29udGFpbmluZyhbXG4gICAgICAgICAgZXhwZWN0Lm9iamVjdENvbnRhaW5pbmcoe1xuICAgICAgICAgICAgS2V5OiAnUHJvamVjdCcsXG4gICAgICAgICAgICBWYWx1ZTogJ0F1cmEyOENESycsXG4gICAgICAgICAgfSksXG4gICAgICAgIF0pLFxuICAgICAgKTtcbiAgICB9KTtcblxuICAgIC8vIENoZWNrIHRoYXQgRHluYW1vREIgdGFibGUgaGFzIHRoZSB0YWdcbiAgICBjb25zdCBkeW5hbW9SZXNvdXJjZXMgPSBPYmplY3QuZW50cmllcyhyZXNvdXJjZXMpLmZpbHRlcihcbiAgICAgIChbLCByZXNvdXJjZV06IFtzdHJpbmcsIGFueV0pID0+IHJlc291cmNlLlR5cGUgPT09ICdBV1M6OkR5bmFtb0RCOjpUYWJsZScsXG4gICAgKTtcblxuICAgIGV4cGVjdChkeW5hbW9SZXNvdXJjZXMubGVuZ3RoKS50b0JlR3JlYXRlclRoYW4oMCk7XG4gICAgZHluYW1vUmVzb3VyY2VzLmZvckVhY2goKFssIHJlc291cmNlXTogW3N0cmluZywgYW55XSkgPT4ge1xuICAgICAgZXhwZWN0KHJlc291cmNlLlByb3BlcnRpZXMuVGFncykudG9FcXVhbChcbiAgICAgICAgZXhwZWN0LmFycmF5Q29udGFpbmluZyhbXG4gICAgICAgICAgZXhwZWN0Lm9iamVjdENvbnRhaW5pbmcoe1xuICAgICAgICAgICAgS2V5OiAnUHJvamVjdCcsXG4gICAgICAgICAgICBWYWx1ZTogJ0F1cmEyOENESycsXG4gICAgICAgICAgfSksXG4gICAgICAgIF0pLFxuICAgICAgKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgdGVzdCgnUHJvZHVjdGlvbiBzdGFjayBpbmNsdWRlcyB3d3cgcmVkaXJlY3QnLCAoKSA9PiB7XG4gICAgY29uc3QgcHJvZEFwcCA9IG5ldyBjZGsuQXBwKCk7XG4gICAgY29uc3QgcHJvZFN0YWNrID0gbmV3IFdlYnNpdGVTdGFjayhwcm9kQXBwLCAnUHJvZFRlc3RTdGFjaycsIHtcbiAgICAgIGRvbWFpbk5hbWU6ICdleGFtcGxlLmNvbScsXG4gICAgICBlbnZpcm9ubWVudDogJ3Byb2QnLFxuICAgICAgZW52OiB7XG4gICAgICAgIGFjY291bnQ6ICcxMjM0NTY3ODkwMTInLFxuICAgICAgICByZWdpb246ICd1cy1lYXN0LTEnLFxuICAgICAgfSxcbiAgICB9KTtcbiAgICBjb25zdCBwcm9kVGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2socHJvZFN0YWNrKTtcblxuICAgIC8vIFNob3VsZCBoYXZlIHR3byBBIHJlY29yZHMgKGFwZXggYW5kIHd3dylcbiAgICBjb25zdCBhUmVjb3JkcyA9IHByb2RUZW1wbGF0ZS5maW5kUmVzb3VyY2VzKCdBV1M6OlJvdXRlNTM6OlJlY29yZFNldCcsIHtcbiAgICAgIFByb3BlcnRpZXM6IHtcbiAgICAgICAgVHlwZTogJ0EnLFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIGV4cGVjdChPYmplY3Qua2V5cyhhUmVjb3JkcykubGVuZ3RoKS50b0JlKDIpO1xuICB9KTtcblxuICB0ZXN0KCdQcm9kdWN0aW9uIER5bmFtb0RCIHRhYmxlIGhhcyBSRVRBSU4gcmVtb3ZhbCBwb2xpY3knLCAoKSA9PiB7XG4gICAgY29uc3QgcHJvZEFwcCA9IG5ldyBjZGsuQXBwKCk7XG4gICAgY29uc3QgcHJvZFN0YWNrID0gbmV3IFdlYnNpdGVTdGFjayhwcm9kQXBwLCAnUHJvZFRlc3RTdGFjaycsIHtcbiAgICAgIGRvbWFpbk5hbWU6ICdleGFtcGxlLmNvbScsXG4gICAgICBlbnZpcm9ubWVudDogJ3Byb2QnLFxuICAgICAgZW52OiB7XG4gICAgICAgIGFjY291bnQ6ICcxMjM0NTY3ODkwMTInLFxuICAgICAgICByZWdpb246ICd1cy1lYXN0LTEnLFxuICAgICAgfSxcbiAgICB9KTtcbiAgICBjb25zdCBwcm9kVGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2socHJvZFN0YWNrKTtcblxuICAgIC8vIENoZWNrIER5bmFtb0RCIHRhYmxlIGhhcyBjb3JyZWN0IHJlbW92YWwgcG9saWN5XG4gICAgY29uc3QgZHluYW1vUmVzb3VyY2VzID0gcHJvZFRlbXBsYXRlLmZpbmRSZXNvdXJjZXMoJ0FXUzo6RHluYW1vREI6OlRhYmxlJyk7XG4gICAgT2JqZWN0LnZhbHVlcyhkeW5hbW9SZXNvdXJjZXMpLmZvckVhY2goKHJlc291cmNlOiBhbnkpID0+IHtcbiAgICAgIGV4cGVjdChyZXNvdXJjZS5EZWxldGlvblBvbGljeSkudG9CZSgnUmV0YWluJyk7XG4gICAgICBleHBlY3QocmVzb3VyY2UuVXBkYXRlUmVwbGFjZVBvbGljeSkudG9CZSgnUmV0YWluJyk7XG4gICAgfSk7XG4gIH0pO1xufSk7XG4iXX0=