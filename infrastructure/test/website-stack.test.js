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
// Check if Docker is available
const isDockerAvailable = () => {
    try {
        require('child_process').execSync('docker --version', { stdio: 'ignore' });
        return true;
    }
    catch {
        return false;
    }
};
const dockerAvailable = isDockerAvailable();
// Skip the entire test suite if Docker is not available
if (!dockerAvailable) {
    describe('WebsiteStack', () => {
        test.skip('All tests skipped - Docker not available', () => {
            // This test is skipped when Docker is not available
        });
    });
}
else {
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
            template.hasResource('AWS::CloudFront::Distribution', {
                Properties: {
                    DistributionConfig: {
                        Aliases: ['test.example.com'],
                        ViewerCertificate: {
                            AcmCertificateArn: assertions_1.Match.anyValue(),
                            MinimumProtocolVersion: 'TLSv1.2_2021',
                            SslSupportMethod: 'sni-only',
                        },
                    },
                },
            });
        });
        test('CloudFront function for routing is created', () => {
            template.hasResourceProperties('AWS::CloudFront::Function', {
                Name: assertions_1.Match.stringLikeRegexp('Aura28.*Routing.*'),
                FunctionConfig: {
                    Runtime: 'cloudfront-js-2.0',
                },
            });
        });
        test('Route53 A record is created', () => {
            template.hasResourceProperties('AWS::Route53::RecordSet', {
                Type: 'A',
                AliasTarget: assertions_1.Match.objectLike({
                    DNSName: assertions_1.Match.anyValue(),
                }),
            });
        });
        test('ACM certificate is created', () => {
            template.hasResourceProperties('AWS::CertificateManager::Certificate', {
                DomainName: 'test.example.com',
                DomainValidationOptions: [
                    {
                        DomainName: 'test.example.com',
                        HostedZoneId: assertions_1.Match.anyValue(),
                    },
                ],
                ValidationMethod: 'DNS',
            });
        });
        test('DynamoDB table is created with correct properties', () => {
            template.hasResourceProperties('AWS::DynamoDB::Table', {
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
        test('Resources are tagged with Project tag', () => {
            const stackJson = template.toJSON();
            const resources = stackJson.Resources;
            let hasProjectTag = false;
            // Check if at least some resources have the Project tag
            for (const resourceKey in resources) {
                const resource = resources[resourceKey];
                if (resource.Properties && resource.Properties.Tags) {
                    const projectTag = resource.Properties.Tags.find((tag) => tag.Key === 'Project' && tag.Value === 'Aura28CDK');
                    if (projectTag) {
                        hasProjectTag = true;
                        break;
                    }
                }
            }
            expect(hasProjectTag).toBe(true);
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
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2Vic2l0ZS1zdGFjay50ZXN0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsid2Vic2l0ZS1zdGFjay50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFDbkMsdURBQXlEO0FBQ3pELHdEQUFvRDtBQUNwRCx1Q0FBeUI7QUFDekIsMkNBQTZCO0FBRTdCLCtCQUErQjtBQUMvQixNQUFNLGlCQUFpQixHQUFHLEdBQUcsRUFBRTtJQUM3QixJQUFJLENBQUM7UUFDSCxPQUFPLENBQUMsZUFBZSxDQUFDLENBQUMsUUFBUSxDQUFDLGtCQUFrQixFQUFFLEVBQUUsS0FBSyxFQUFFLFFBQVEsRUFBRSxDQUFDLENBQUM7UUFDM0UsT0FBTyxJQUFJLENBQUM7SUFDZCxDQUFDO0lBQUMsTUFBTSxDQUFDO1FBQ1AsT0FBTyxLQUFLLENBQUM7SUFDZixDQUFDO0FBQ0gsQ0FBQyxDQUFDO0FBRUYsTUFBTSxlQUFlLEdBQUcsaUJBQWlCLEVBQUUsQ0FBQztBQUU1Qyx3REFBd0Q7QUFDeEQsSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO0lBQ3JCLFFBQVEsQ0FBQyxjQUFjLEVBQUUsR0FBRyxFQUFFO1FBQzVCLElBQUksQ0FBQyxJQUFJLENBQUMsMENBQTBDLEVBQUUsR0FBRyxFQUFFO1lBQ3pELG9EQUFvRDtRQUN0RCxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDO0FBQ0wsQ0FBQztLQUFNLENBQUM7SUFDTixRQUFRLENBQUMsY0FBYyxFQUFFLEdBQUcsRUFBRTtRQUM1QixJQUFJLEdBQVksQ0FBQztRQUNqQixJQUFJLEtBQW1CLENBQUM7UUFDeEIsSUFBSSxRQUFrQixDQUFDO1FBRXZCLHNEQUFzRDtRQUN0RCxNQUFNLGNBQWMsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxvQkFBb0IsQ0FBQyxDQUFDO1FBRWxFLFNBQVMsQ0FBQyxHQUFHLEVBQUU7WUFDYixJ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Z0JBQ3BELG9CQUFvQixFQUFFO29CQUNwQixxQkFBcUIsRUFBRTt3QkFDckIsUUFBUSxFQUFFLGFBQWE7d0JBQ3ZCLFFBQVEsRUFBRSxPQUFPO3FCQUNsQjtpQkFDRjthQUNGLENBQUMsQ0FBQztZQUVILDZCQUE2QjtZQUM3QixZQUFZLENBQUMsV0FBVyxDQUFDLCtCQUErQixFQUFFO2dCQUN4RCxVQUFVLEVBQUU7b0JBQ1Ysa0JBQWtCLEVBQUU7d0JBQ2xCLE9BQU8sRUFBRSxDQUFDLGlCQUFpQixDQUFDO3FCQUM3QjtpQkFDRjthQUNGLENBQUMsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLHFEQUFxRCxFQUFFLEdBQUcsRUFBRTtZQUMvRCxNQUFNLE9BQU8sR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLEVBQUUsQ0FBQztZQUM5QixNQUFNLFNBQVMsR0FBRyxJQUFJLDRCQUFZLENBQUMsT0FBTyxFQUFFLGVBQWUsRUFBRTtnQkFDM0QsVUFBVSxFQUFFLGFBQWE7Z0JBQ3pCLFdBQVcsRUFBRSxNQUFNO2dCQUNuQixHQUFHLEVBQUU7b0JBQ0gsT0FBTyxFQUFFLGNBQWM7b0JBQ3ZCLE1BQU0sRUFBRSxXQUFXO2lCQUNwQjthQUNGLENBQUMsQ0FBQztZQUNILE1BQU0sWUFBWSxHQUFHLHFCQUFRLENBQUMsU0FBUyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1lBRW5ELDhDQUE4QztZQUM5QyxZQUFZLENBQUMsV0FBVyxDQUFDLHNCQUFzQixFQUFFO2dCQUMvQyxjQUFjLEVBQUUsUUFBUTtnQkFDeEIsbUJBQW1CLEVBQUUsUUFBUTtnQkFDN0IsVUFBVSxFQUFFO29CQUNWLFNBQVMsRUFBRSxtQkFBbUI7aUJBQy9CO2FBQ0YsQ0FBQyxDQUFDO1FBQ0wsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQztBQUNMLENBQUMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0IHsgVGVtcGxhdGUsIE1hdGNoIH0gZnJvbSAnYXdzLWNkay1saWIvYXNzZXJ0aW9ucyc7XG5pbXBvcnQgeyBXZWJzaXRlU3RhY2sgfSBmcm9tICcuLi9saWIvd2Vic2l0ZS1zdGFjayc7XG5pbXBvcnQgKiBhcyBmcyBmcm9tICdmcyc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuXG4vLyBDaGVjayBpZiBEb2NrZXIgaXMgYXZhaWxhYmxlXG5jb25zdCBpc0RvY2tlckF2YWlsYWJsZSA9ICgpID0+IHtcbiAgdHJ5IHtcbiAgICByZXF1aXJlKCdjaGlsZF9wcm9jZXNzJykuZXhlY1N5bmMoJ2RvY2tlciAtLXZlcnNpb24nLCB7IHN0ZGlvOiAnaWdub3JlJyB9KTtcbiAgICByZXR1cm4gdHJ1ZTtcbiAgfSBjYXRjaCB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG59O1xuXG5jb25zdCBkb2NrZXJBdmFpbGFibGUgPSBpc0RvY2tlckF2YWlsYWJsZSgpO1xuXG4vLyBTa2lwIHRoZSBlbnRpcmUgdGVzdCBzdWl0ZSBpZiBEb2NrZXIgaXMgbm90IGF2YWlsYWJsZVxuaWYgKCFkb2NrZXJBdmFpbGFibGUpIHtcbiAgZGVzY3JpYmUoJ1dlYnNpdGVTdGFjaycsICgpID0+IHtcbiAgICB0ZXN0LnNraXAoJ0FsbCB0ZXN0cyBza2lwcGVkIC0gRG9ja2VyIG5vdCBhdmFpbGFibGUnLCAoKSA9PiB7XG4gICAgICAvLyBUaGlzIHRlc3QgaXMgc2tpcHBlZCB3aGVuIERvY2tlciBpcyBub3QgYXZhaWxhYmxlXG4gICAgfSk7XG4gIH0pO1xufSBlbHNlIHtcbiAgZGVzY3JpYmUoJ1dlYnNpdGVTdGFjaycsICgpID0+IHtcbiAgICBsZXQgYXBwOiBjZGsuQXBwO1xuICAgIGxldCBzdGFjazogV2Vic2l0ZVN0YWNrO1xuICAgIGxldCB0ZW1wbGF0ZTogVGVtcGxhdGU7XG5cbiAgICAvLyBDcmVhdGUgYSB0ZW1wb3JhcnkgZnJvbnRlbmQvb3V0IGRpcmVjdG9yeSBmb3IgdGVzdHNcbiAgICBjb25zdCBmcm9udGVuZE91dERpciA9IHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi8uLi9mcm9udGVuZC9vdXQnKTtcblxuICAgIGJlZm9yZUFsbCgoKSA9PiB7XG4gICAgICBpZiAoIWZzLmV4aXN0c1N5bmMoZnJvbnRlbmRPdXREaXIpKSB7XG4gICAgICAgIGZzLm1rZGlyU3luYyhmcm9udGVuZE91dERpciwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG4gICAgICAgIC8vIENyZWF0ZSBhIGR1bW15IGluZGV4Lmh0bWwgZmlsZVxuICAgICAgICBmcy53cml0ZUZpbGVTeW5jKHBhdGguam9pbihmcm9udGVuZE91dERpciwgJ2luZGV4Lmh0bWwnKSwgJzxodG1sPjwvaHRtbD4nKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIGFmdGVyQWxsKCgpID0+IHtcbiAgICAgIC8vIENsZWFuIHVwIHRoZSB0ZW1wb3JhcnkgZGlyZWN0b3J5XG4gICAgICBpZiAoZnMuZXhpc3RzU3luYyhmcm9udGVuZE91dERpcikpIHtcbiAgICAgICAgZnMucm1TeW5jKGZyb250ZW5kT3V0RGlyLCB7IHJlY3Vyc2l2ZTogdHJ1ZSwgZm9yY2U6IHRydWUgfSk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBiZWZvcmVFYWNoKCgpID0+IHtcbiAgICAgIC8vIFNldCBidW5kbGluZyB0byB1c2UgbG9jYWwgbW9kZSBmb3IgdGVzdHNcbiAgICAgIGFwcCA9IG5ldyBjZGsuQXBwKHtcbiAgICAgICAgY29udGV4dDoge1xuICAgICAgICAgICdhd3M6Y2RrOmJ1bmRsaW5nLXN0YWNrcyc6IFsnVGVzdFN0YWNrJ10sXG4gICAgICAgIH0sXG4gICAgICB9KTtcblxuICAgICAgLy8gTW9jayBidW5kbGluZyBmb3IgTGFtYmRhIGZ1bmN0aW9uc1xuICAgICAgcHJvY2Vzcy5lbnYuQ0RLX0JVTkRMSU5HX1NUQUdJTkdfRElTQUJMRUQgPSAnMSc7XG5cbiAgICAgIHN0YWNrID0gbmV3IFdlYnNpdGVTdGFjayhhcHAsICdUZXN0U3RhY2snLCB7XG4gICAgICAgIGRvbWFpbk5hbWU6ICdleGFtcGxlLmNvbScsXG4gICAgICAgIHN1YmRvbWFpbjogJ3Rlc3QnLFxuICAgICAgICBlbnZpcm9ubWVudDogJ2RldicsXG4gICAgICAgIGVudjoge1xuICAgICAgICAgIGFjY291bnQ6ICcxMjM0NTY3ODkwMTInLFxuICAgICAgICAgIHJlZ2lvbjogJ3VzLWVhc3QtMScsXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICAgIHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrKTtcbiAgICB9KTtcblxuICAgIHRlc3QoJ1MzIGJ1Y2tldCBpcyBjcmVhdGVkIHdpdGggY29ycmVjdCBwcm9wZXJ0aWVzJywgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OlMzOjpCdWNrZXQnLCB7XG4gICAgICAgIEJ1Y2tldE5hbWU6IE1hdGNoLnN0cmluZ0xpa2VSZWdleHAoJ2F1cmEyOC1kZXYtd2Vic2l0ZS0uKicpLFxuICAgICAgICBQdWJsaWNBY2Nlc3NCbG9ja0NvbmZpZ3VyYXRpb246IHtcbiAgICAgICAgICBCbG9ja1B1YmxpY0FjbHM6IHRydWUsXG4gICAgICAgICAgQmxvY2tQdWJsaWNQb2xpY3k6IHRydWUsXG4gICAgICAgICAgSWdub3JlUHVibGljQWNsczogdHJ1ZSxcbiAgICAgICAgICBSZXN0cmljdFB1YmxpY0J1Y2tldHM6IHRydWUsXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIHRlc3QoJ0Nsb3VkRnJvbnQgZGlzdHJpYnV0aW9uIGlzIGNyZWF0ZWQnLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZSgnQVdTOjpDbG91ZEZyb250OjpEaXN0cmlidXRpb24nLCB7XG4gICAgICAgIFByb3BlcnRpZXM6IHtcbiAgICAgICAgICBEaXN0cmlidXRpb25Db25maWc6IHtcbiAgICAgICAgICAgIEFsaWFzZXM6IFsndGVzdC5leGFtcGxlLmNvbSddLFxuICAgICAgICAgICAgVmlld2VyQ2VydGlmaWNhdGU6IHtcbiAgICAgICAgICAgICAgQWNtQ2VydGlmaWNhdGVBcm46IE1hdGNoLmFueVZhbHVlKCksXG4gICAgICAgICAgICAgIE1pbmltdW1Qcm90b2NvbFZlcnNpb246ICdUTFN2MS4yXzIwMjEnLFxuICAgICAgICAgICAgICBTc2xTdXBwb3J0TWV0aG9kOiAnc25pLW9ubHknLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdDbG91ZEZyb250IGZ1bmN0aW9uIGZvciByb3V0aW5nIGlzIGNyZWF0ZWQnLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6Q2xvdWRGcm9udDo6RnVuY3Rpb24nLCB7XG4gICAgICAgIE5hbWU6IE1hdGNoLnN0cmluZ0xpa2VSZWdleHAoJ0F1cmEyOC4qUm91dGluZy4qJyksXG4gICAgICAgIEZ1bmN0aW9uQ29uZmlnOiB7XG4gICAgICAgICAgUnVudGltZTogJ2Nsb3VkZnJvbnQtanMtMi4wJyxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgdGVzdCgnUm91dGU1MyBBIHJlY29yZCBpcyBjcmVhdGVkJywgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OlJvdXRlNTM6OlJlY29yZFNldCcsIHtcbiAgICAgICAgVHlwZTogJ0EnLFxuICAgICAgICBBbGlhc1RhcmdldDogTWF0Y2gub2JqZWN0TGlrZSh7XG4gICAgICAgICAgRE5TTmFtZTogTWF0Y2guYW55VmFsdWUoKSxcbiAgICAgICAgfSksXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIHRlc3QoJ0FDTSBjZXJ0aWZpY2F0ZSBpcyBjcmVhdGVkJywgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OkNlcnRpZmljYXRlTWFuYWdlcjo6Q2VydGlmaWNhdGUnLCB7XG4gICAgICAgIERvbWFpbk5hbWU6ICd0ZXN0LmV4YW1wbGUuY29tJyxcbiAgICAgICAgRG9tYWluVmFsaWRhdGlvbk9wdGlvbnM6IFtcbiAgICAgICAgICB7XG4gICAgICAgICAgICBEb21haW5OYW1lOiAndGVzdC5leGFtcGxlLmNvbScsXG4gICAgICAgICAgICBIb3N0ZWRab25lSWQ6IE1hdGNoLmFueVZhbHVlKCksXG4gICAgICAgICAgfSxcbiAgICAgICAgXSxcbiAgICAgICAgVmFsaWRhdGlvbk1ldGhvZDogJ0ROUycsXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIHRlc3QoJ0R5bmFtb0RCIHRhYmxlIGlzIGNyZWF0ZWQgd2l0aCBjb3JyZWN0IHByb3BlcnRpZXMnLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6RHluYW1vREI6OlRhYmxlJywge1xuICAgICAgICBUYWJsZU5hbWU6ICdBdXJhMjgtZGV2LVVzZXJzJyxcbiAgICAgICAgS2V5U2NoZW1hOiBbXG4gICAgICAgICAge1xuICAgICAgICAgICAgQXR0cmlidXRlTmFtZTogJ3VzZXJJZCcsXG4gICAgICAgICAgICBLZXlUeXBlOiAnSEFTSCcsXG4gICAgICAgICAgfSxcbiAgICAgICAgICB7XG4gICAgICAgICAgICBBdHRyaWJ1dGVOYW1lOiAnY3JlYXRlZEF0JyxcbiAgICAgICAgICAgIEtleVR5cGU6ICdSQU5HRScsXG4gICAgICAgICAgfSxcbiAgICAgICAgXSxcbiAgICAgICAgQmlsbGluZ01vZGU6ICdQQVlfUEVSX1JFUVVFU1QnLFxuICAgICAgICBQb2ludEluVGltZVJlY292ZXJ5U3BlY2lmaWNhdGlvbjoge1xuICAgICAgICAgIFBvaW50SW5UaW1lUmVjb3ZlcnlFbmFibGVkOiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdSZXNvdXJjZXMgYXJlIHRhZ2dlZCB3aXRoIFByb2plY3QgdGFnJywgKCkgPT4ge1xuICAgICAgY29uc3Qgc3RhY2tKc29uID0gdGVtcGxhdGUudG9KU09OKCk7XG4gICAgICBjb25zdCByZXNvdXJjZXMgPSBzdGFja0pzb24uUmVzb3VyY2VzO1xuICAgICAgbGV0IGhhc1Byb2plY3RUYWcgPSBmYWxzZTtcblxuICAgICAgLy8gQ2hlY2sgaWYgYXQgbGVhc3Qgc29tZSByZXNvdXJjZXMgaGF2ZSB0aGUgUHJvamVjdCB0YWdcbiAgICAgIGZvciAoY29uc3QgcmVzb3VyY2VLZXkgaW4gcmVzb3VyY2VzKSB7XG4gICAgICAgIGNvbnN0IHJlc291cmNlID0gcmVzb3VyY2VzW3Jlc291cmNlS2V5XTtcbiAgICAgICAgaWYgKHJlc291cmNlLlByb3BlcnRpZXMgJiYgcmVzb3VyY2UuUHJvcGVydGllcy5UYWdzKSB7XG4gICAgICAgICAgY29uc3QgcHJvamVjdFRhZyA9IHJlc291cmNlLlByb3BlcnRpZXMuVGFncy5maW5kKFxuICAgICAgICAgICAgKHRhZzogYW55KSA9PiB0YWcuS2V5ID09PSAnUHJvamVjdCcgJiYgdGFnLlZhbHVlID09PSAnQXVyYTI4Q0RLJyxcbiAgICAgICAgICApO1xuICAgICAgICAgIGlmIChwcm9qZWN0VGFnKSB7XG4gICAgICAgICAgICBoYXNQcm9qZWN0VGFnID0gdHJ1ZTtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuXG4gICAgICBleHBlY3QoaGFzUHJvamVjdFRhZykudG9CZSh0cnVlKTtcbiAgICB9KTtcblxuICAgIHRlc3QoJ1Byb2R1Y3Rpb24gc3RhY2sgaW5jbHVkZXMgd3d3IHJlZGlyZWN0JywgKCkgPT4ge1xuICAgICAgY29uc3QgcHJvZEFwcCA9IG5ldyBjZGsuQXBwKCk7XG4gICAgICBjb25zdCBwcm9kU3RhY2sgPSBuZXcgV2Vic2l0ZVN0YWNrKHByb2RBcHAsICdQcm9kVGVzdFN0YWNrJywge1xuICAgICAgICBkb21haW5OYW1lOiAnZXhhbXBsZS5jb20nLFxuICAgICAgICBlbnZpcm9ubWVudDogJ3Byb2QnLFxuICAgICAgICBlbnY6IHtcbiAgICAgICAgICBhY2NvdW50OiAnMTIzNDU2Nzg5MDEyJyxcbiAgICAgICAgICByZWdpb246ICd1cy1lYXN0LTEnLFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgICBjb25zdCBwcm9kVGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2socHJvZFN0YWNrKTtcblxuICAgICAgLy8gQ2hlY2sgZm9yIHd3dyByZWRpcmVjdCBidWNrZXRcbiAgICAgIHByb2RUZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6UzM6OkJ1Y2tldCcsIHtcbiAgICAgICAgV2Vic2l0ZUNvbmZpZ3VyYXRpb246IHtcbiAgICAgICAgICBSZWRpcmVjdEFsbFJlcXVlc3RzVG86IHtcbiAgICAgICAgICAgIEhvc3ROYW1lOiAnZXhhbXBsZS5jb20nLFxuICAgICAgICAgICAgUHJvdG9jb2w6ICdodHRwcycsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBDaGVjayBmb3Igd3d3IGRpc3RyaWJ1dGlvblxuICAgICAgcHJvZFRlbXBsYXRlLmhhc1Jlc291cmNlKCdBV1M6OkNsb3VkRnJvbnQ6OkRpc3RyaWJ1dGlvbicsIHtcbiAgICAgICAgUHJvcGVydGllczoge1xuICAgICAgICAgIERpc3RyaWJ1dGlvbkNvbmZpZzoge1xuICAgICAgICAgICAgQWxpYXNlczogWyd3d3cuZXhhbXBsZS5jb20nXSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdQcm9kdWN0aW9uIER5bmFtb0RCIHRhYmxlIGhhcyBSRVRBSU4gcmVtb3ZhbCBwb2xpY3knLCAoKSA9PiB7XG4gICAgICBjb25zdCBwcm9kQXBwID0gbmV3IGNkay5BcHAoKTtcbiAgICAgIGNvbnN0IHByb2RTdGFjayA9IG5ldyBXZWJzaXRlU3RhY2socHJvZEFwcCwgJ1Byb2RUZXN0U3RhY2snLCB7XG4gICAgICAgIGRvbWFpbk5hbWU6ICdleGFtcGxlLmNvbScsXG4gICAgICAgIGVudmlyb25tZW50OiAncHJvZCcsXG4gICAgICAgIGVudjoge1xuICAgICAgICAgIGFjY291bnQ6ICcxMjM0NTY3ODkwMTInLFxuICAgICAgICAgIHJlZ2lvbjogJ3VzLWVhc3QtMScsXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICAgIGNvbnN0IHByb2RUZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhwcm9kU3RhY2spO1xuXG4gICAgICAvLyBDaGVjayBmb3IgRHluYW1vREIgdGFibGUgd2l0aCBSRVRBSU4gcG9saWN5XG4gICAgICBwcm9kVGVtcGxhdGUuaGFzUmVzb3VyY2UoJ0FXUzo6RHluYW1vREI6OlRhYmxlJywge1xuICAgICAgICBEZWxldGlvblBvbGljeTogJ1JldGFpbicsXG4gICAgICAgIFVwZGF0ZVJlcGxhY2VQb2xpY3k6ICdSZXRhaW4nLFxuICAgICAgICBQcm9wZXJ0aWVzOiB7XG4gICAgICAgICAgVGFibGVOYW1lOiAnQXVyYTI4LXByb2QtVXNlcnMnLFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfSk7XG4gIH0pO1xufSJdfQ==