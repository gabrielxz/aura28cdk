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
    let stack = null;
    let template = null;
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
        }
        catch {
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
    // Skip tests if Docker is not available
    const itIfDocker = dockerAvailable ? test : test.skip;
    itIfDocker('S3 bucket is created with correct properties', () => {
        expect(template).not.toBeNull();
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
    itIfDocker('CloudFront distribution is created', () => {
        expect(template).not.toBeNull();
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
    itIfDocker('CloudFront function for routing is created', () => {
        expect(template).not.toBeNull();
        template.hasResourceProperties('AWS::CloudFront::Function', {
            Name: assertions_1.Match.stringLikeRegexp('Aura28.*Routing.*'),
            FunctionConfig: {
                Runtime: 'cloudfront-js-2.0',
            },
        });
    });
    itIfDocker('Route53 A record is created', () => {
        expect(template).not.toBeNull();
        template.hasResourceProperties('AWS::Route53::RecordSet', {
            Type: 'A',
            AliasTarget: assertions_1.Match.objectLike({
                DNSName: assertions_1.Match.anyValue(),
            }),
        });
    });
    itIfDocker('ACM certificate is created', () => {
        expect(template).not.toBeNull();
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
    itIfDocker('DynamoDB table is created with correct properties', () => {
        expect(template).not.toBeNull();
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
    itIfDocker('Resources are tagged with Project tag', () => {
        expect(template).not.toBeNull();
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
    itIfDocker('Production stack includes www redirect', () => {
        if (!dockerAvailable)
            return;
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
    itIfDocker('Production DynamoDB table has RETAIN removal policy', () => {
        if (!dockerAvailable)
            return;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2Vic2l0ZS1zdGFjay50ZXN0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsid2Vic2l0ZS1zdGFjay50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFDbkMsdURBQXlEO0FBQ3pELHdEQUFvRDtBQUNwRCx1Q0FBeUI7QUFDekIsMkNBQTZCO0FBRTdCLFFBQVEsQ0FBQyxjQUFjLEVBQUUsR0FBRyxFQUFFO0lBQzVCLElBQUksR0FBWSxDQUFDO0lBQ2pCLElBQUksS0FBSyxHQUF3QixJQUFJLENBQUM7SUFDdEMsSUFBSSxRQUFRLEdBQW9CLElBQUksQ0FBQztJQUVyQyxzREFBc0Q7SUFDdEQsTUFBTSxjQUFjLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsb0JBQW9CLENBQUMsQ0FBQztJQUVsRSxTQUFTLENBQUMsR0FBRyxFQUFFO1FBQ2IsSUFBSSxDQUFDLEVBQUUsQ0FBQyxVQUFVLENBQUMsY0FBYyxDQUFDLEVBQUUsQ0FBQztZQUNuQyxFQUFFLENBQUMsU0FBUyxDQUFDLGNBQWMsRUFBRSxFQUFFLFNBQVMsRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1lBQ2xELGlDQUFpQztZQUNqQyxFQUFFLENBQUMsYUFBYSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsY0FBYyxFQUFFLFlBQVksQ0FBQyxFQUFFLGVBQWUsQ0FBQyxDQUFDO1FBQzdFLENBQUM7SUFDSCxDQUFDLENBQUMsQ0FBQztJQUVILFFBQVEsQ0FBQyxHQUFHLEVBQUU7UUFDWixtQ0FBbUM7UUFDbkMsSUFBSSxFQUFFLENBQUMsVUFBVSxDQUFDLGNBQWMsQ0FBQyxFQUFFLENBQUM7WUFDbEMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxjQUFjLEVBQUUsRUFBRSxTQUFTLEVBQUUsSUFBSSxFQUFFLEtBQUssRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDO1FBQzlELENBQUM7SUFDSCxDQUFDLENBQUMsQ0FB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LEVBQUUsV0FBVzthQUNwQjtTQUNGLENBQUMsQ0FBQztRQUNILE1BQU0sWUFBWSxHQUFHLHFCQUFRLENBQUMsU0FBUyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBRW5ELDhDQUE4QztRQUM5QyxZQUFZLENBQUMsV0FBVyxDQUFDLHNCQUFzQixFQUFFO1lBQy9DLGNBQWMsRUFBRSxRQUFRO1lBQ3hCLG1CQUFtQixFQUFFLFFBQVE7WUFDN0IsVUFBVSxFQUFFO2dCQUNWLFNBQVMsRUFBRSxtQkFBbUI7YUFDL0I7U0FDRixDQUFDLENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQztBQUNMLENBQUMsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IFRlbXBsYXRlLCBNYXRjaCB9IGZyb20gJ2F3cy1jZGstbGliL2Fzc2VydGlvbnMnO1xuaW1wb3J0IHsgV2Vic2l0ZVN0YWNrIH0gZnJvbSAnLi4vbGliL3dlYnNpdGUtc3RhY2snO1xuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcblxuZGVzY3JpYmUoJ1dlYnNpdGVTdGFjaycsICgpID0+IHtcbiAgbGV0IGFwcDogY2RrLkFwcDtcbiAgbGV0IHN0YWNrOiBXZWJzaXRlU3RhY2sgfCBudWxsID0gbnVsbDtcbiAgbGV0IHRlbXBsYXRlOiBUZW1wbGF0ZSB8IG51bGwgPSBudWxsO1xuXG4gIC8vIENyZWF0ZSBhIHRlbXBvcmFyeSBmcm9udGVuZC9vdXQgZGlyZWN0b3J5IGZvciB0ZXN0c1xuICBjb25zdCBmcm9udGVuZE91dERpciA9IHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi8uLi9mcm9udGVuZC9vdXQnKTtcblxuICBiZWZvcmVBbGwoKCkgPT4ge1xuICAgIGlmICghZnMuZXhpc3RzU3luYyhmcm9udGVuZE91dERpcikpIHtcbiAgICAgIGZzLm1rZGlyU3luYyhmcm9udGVuZE91dERpciwgeyByZWN1cnNpdmU6IHRydWUgfSk7XG4gICAgICAvLyBDcmVhdGUgYSBkdW1teSBpbmRleC5odG1sIGZpbGVcbiAgICAgIGZzLndyaXRlRmlsZVN5bmMocGF0aC5qb2luKGZyb250ZW5kT3V0RGlyLCAnaW5kZXguaHRtbCcpLCAnPGh0bWw+PC9odG1sPicpO1xuICAgIH1cbiAgfSk7XG5cbiAgYWZ0ZXJBbGwoKCkgPT4ge1xuICAgIC8vIENsZWFuIHVwIHRoZSB0ZW1wb3JhcnkgZGlyZWN0b3J5XG4gICAgaWYgKGZzLmV4aXN0c1N5bmMoZnJvbnRlbmRPdXREaXIpKSB7XG4gICAgICBmcy5ybVN5bmMoZnJvbnRlbmRPdXREaXIsIHsgcmVjdXJzaXZlOiB0cnVlLCBmb3JjZTogdHJ1ZSB9KTtcbiAgICB9XG4gIH0pO1xuXG4gIC8vIENoZWNrIGlmIERvY2tlciBpcyBhdmFpbGFibGVcbiAgY29uc3QgaXNEb2NrZXJBdmFpbGFibGUgPSAoKSA9PiB7XG4gICAgdHJ5IHtcbiAgICAgIHJlcXVpcmUoJ2NoaWxkX3Byb2Nlc3MnKS5leGVjU3luYygnZG9ja2VyIC0tdmVyc2lvbicsIHsgc3RkaW86ICdpZ25vcmUnIH0pO1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfSBjYXRjaCB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9O1xuXG4gIGNvbnN0IGRvY2tlckF2YWlsYWJsZSA9IGlzRG9ja2VyQXZhaWxhYmxlKCk7XG5cbiAgYmVmb3JlRWFjaCgoKSA9PiB7XG4gICAgaWYgKCFkb2NrZXJBdmFpbGFibGUpIHtcbiAgICAgIC8vIFNraXAgdGVzdCBzZXR1cCBpZiBEb2NrZXIgaXMgbm90IGF2YWlsYWJsZVxuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIC8vIFNldCBidW5kbGluZyB0byB1c2UgbG9jYWwgbW9kZSBmb3IgdGVzdHNcbiAgICBhcHAgPSBuZXcgY2RrLkFwcCh7XG4gICAgICBjb250ZXh0OiB7XG4gICAgICAgICdhd3M6Y2RrOmJ1bmRsaW5nLXN0YWNrcyc6IFsnVGVzdFN0YWNrJ10sXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gTW9jayBidW5kbGluZyBmb3IgTGFtYmRhIGZ1bmN0aW9uc1xuICAgIHByb2Nlc3MuZW52LkNES19CVU5ETElOR19TVEFHSU5HX0RJU0FCTEVEID0gJzEnO1xuXG4gICAgc3RhY2sgPSBuZXcgV2Vic2l0ZVN0YWNrKGFwcCwgJ1Rlc3RTdGFjaycsIHtcbiAgICAgIGRvbWFpbk5hbWU6ICdleGFtcGxlLmNvbScsXG4gICAgICBzdWJkb21haW46ICd0ZXN0JyxcbiAgICAgIGVudmlyb25tZW50OiAnZGV2JyxcbiAgICAgIGVudjoge1xuICAgICAgICBhY2NvdW50OiAnMTIzNDU2Nzg5MDEyJyxcbiAgICAgICAgcmVnaW9uOiAndXMtZWFzdC0xJyxcbiAgICAgIH0sXG4gICAgfSk7XG4gICAgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spO1xuICB9KTtcblxuICAvLyBTa2lwIHRlc3RzIGlmIERvY2tlciBpcyBub3QgYXZhaWxhYmxlXG4gIGNvbnN0IGl0SWZEb2NrZXIgPSBkb2NrZXJBdmFpbGFibGUgPyB0ZXN0IDogdGVzdC5za2lwO1xuXG4gIGl0SWZEb2NrZXIoJ1MzIGJ1Y2tldCBpcyBjcmVhdGVkIHdpdGggY29ycmVjdCBwcm9wZXJ0aWVzJywgKCkgPT4ge1xuICAgIGV4cGVjdCh0ZW1wbGF0ZSkubm90LnRvQmVOdWxsKCk7XG4gICAgdGVtcGxhdGUhLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpTMzo6QnVja2V0Jywge1xuICAgICAgQnVja2V0TmFtZTogTWF0Y2guc3RyaW5nTGlrZVJlZ2V4cCgnYXVyYTI4LWRldi13ZWJzaXRlLS4qJyksXG4gICAgICBQdWJsaWNBY2Nlc3NCbG9ja0NvbmZpZ3VyYXRpb246IHtcbiAgICAgICAgQmxvY2tQdWJsaWNBY2xzOiB0cnVlLFxuICAgICAgICBCbG9ja1B1YmxpY1BvbGljeTogdHJ1ZSxcbiAgICAgICAgSWdub3JlUHVibGljQWNsczogdHJ1ZSxcbiAgICAgICAgUmVzdHJpY3RQdWJsaWNCdWNrZXRzOiB0cnVlLFxuICAgICAgfSxcbiAgICB9KTtcbiAgfSk7XG5cbiAgaXRJZkRvY2tlcignQ2xvdWRGcm9udCBkaXN0cmlidXRpb24gaXMgY3JlYXRlZCcsICgpID0+IHtcbiAgICBleHBlY3QodGVtcGxhdGUpLm5vdC50b0JlTnVsbCgpO1xuICAgIHRlbXBsYXRlIS5oYXNSZXNvdXJjZSgnQVdTOjpDbG91ZEZyb250OjpEaXN0cmlidXRpb24nLCB7XG4gICAgICBQcm9wZXJ0aWVzOiB7XG4gICAgICAgIERpc3RyaWJ1dGlvbkNvbmZpZzoge1xuICAgICAgICAgIEFsaWFzZXM6IFsndGVzdC5leGFtcGxlLmNvbSddLFxuICAgICAgICAgIFZpZXdlckNlcnRpZmljYXRlOiB7XG4gICAgICAgICAgICBBY21DZXJ0aWZpY2F0ZUFybjogTWF0Y2guYW55VmFsdWUoKSxcbiAgICAgICAgICAgIE1pbmltdW1Qcm90b2NvbFZlcnNpb246ICdUTFN2MS4yXzIwMjEnLFxuICAgICAgICAgICAgU3NsU3VwcG9ydE1ldGhvZDogJ3NuaS1vbmx5JyxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9KTtcbiAgfSk7XG5cbiAgaXRJZkRvY2tlcignQ2xvdWRGcm9udCBmdW5jdGlvbiBmb3Igcm91dGluZyBpcyBjcmVhdGVkJywgKCkgPT4ge1xuICAgIGV4cGVjdCh0ZW1wbGF0ZSkubm90LnRvQmVOdWxsKCk7XG4gICAgdGVtcGxhdGUhLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpDbG91ZEZyb250OjpGdW5jdGlvbicsIHtcbiAgICAgIE5hbWU6IE1hdGNoLnN0cmluZ0xpa2VSZWdleHAoJ0F1cmEyOC4qUm91dGluZy4qJyksXG4gICAgICBGdW5jdGlvbkNvbmZpZzoge1xuICAgICAgICBSdW50aW1lOiAnY2xvdWRmcm9udC1qcy0yLjAnLFxuICAgICAgfSxcbiAgICB9KTtcbiAgfSk7XG5cbiAgaXRJZkRvY2tlcignUm91dGU1MyBBIHJlY29yZCBpcyBjcmVhdGVkJywgKCkgPT4ge1xuICAgIGV4cGVjdCh0ZW1wbGF0ZSkubm90LnRvQmVOdWxsKCk7XG4gICAgdGVtcGxhdGUhLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpSb3V0ZTUzOjpSZWNvcmRTZXQnLCB7XG4gICAgICBUeXBlOiAnQScsXG4gICAgICBBbGlhc1RhcmdldDogTWF0Y2gub2JqZWN0TGlrZSh7XG4gICAgICAgIEROU05hbWU6IE1hdGNoLmFueVZhbHVlKCksXG4gICAgICB9KSxcbiAgICB9KTtcbiAgfSk7XG5cbiAgaXRJZkRvY2tlcignQUNNIGNlcnRpZmljYXRlIGlzIGNyZWF0ZWQnLCAoKSA9PiB7XG4gICAgZXhwZWN0KHRlbXBsYXRlKS5ub3QudG9CZU51bGwoKTtcbiAgICB0ZW1wbGF0ZSEuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OkNlcnRpZmljYXRlTWFuYWdlcjo6Q2VydGlmaWNhdGUnLCB7XG4gICAgICBEb21haW5OYW1lOiAndGVzdC5leGFtcGxlLmNvbScsXG4gICAgICBEb21haW5WYWxpZGF0aW9uT3B0aW9uczogW1xuICAgICAgICB7XG4gICAgICAgICAgRG9tYWluTmFtZTogJ3Rlc3QuZXhhbXBsZS5jb20nLFxuICAgICAgICAgIEhvc3RlZFpvbmVJZDogTWF0Y2guYW55VmFsdWUoKSxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgICBWYWxpZGF0aW9uTWV0aG9kOiAnRE5TJyxcbiAgICB9KTtcbiAgfSk7XG5cbiAgaXRJZkRvY2tlcignRHluYW1vREIgdGFibGUgaXMgY3JlYXRlZCB3aXRoIGNvcnJlY3QgcHJvcGVydGllcycsICgpID0+IHtcbiAgICBleHBlY3QodGVtcGxhdGUpLm5vdC50b0JlTnVsbCgpO1xuICAgIHRlbXBsYXRlIS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6RHluYW1vREI6OlRhYmxlJywge1xuICAgICAgVGFibGVOYW1lOiAnQXVyYTI4LWRldi1Vc2VycycsXG4gICAgICBLZXlTY2hlbWE6IFtcbiAgICAgICAge1xuICAgICAgICAgIEF0dHJpYnV0ZU5hbWU6ICd1c2VySWQnLFxuICAgICAgICAgIEtleVR5cGU6ICdIQVNIJyxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIEF0dHJpYnV0ZU5hbWU6ICdjcmVhdGVkQXQnLFxuICAgICAgICAgIEtleVR5cGU6ICdSQU5HRScsXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgICAgQmlsbGluZ01vZGU6ICdQQVlfUEVSX1JFUVVFU1QnLFxuICAgICAgUG9pbnRJblRpbWVSZWNvdmVyeVNwZWNpZmljYXRpb246IHtcbiAgICAgICAgUG9pbnRJblRpbWVSZWNvdmVyeUVuYWJsZWQ6IHRydWUsXG4gICAgICB9LFxuICAgIH0pO1xuICB9KTtcblxuICBpdElmRG9ja2VyKCdSZXNvdXJjZXMgYXJlIHRhZ2dlZCB3aXRoIFByb2plY3QgdGFnJywgKCkgPT4ge1xuICAgIGV4cGVjdCh0ZW1wbGF0ZSkubm90LnRvQmVOdWxsKCk7XG4gICAgY29uc3Qgc3RhY2tKc29uID0gdGVtcGxhdGUhLnRvSlNPTigpO1xuICAgIGNvbnN0IHJlc291cmNlcyA9IHN0YWNrSnNvbi5SZXNvdXJjZXM7XG4gICAgbGV0IGhhc1Byb2plY3RUYWcgPSBmYWxzZTtcblxuICAgIC8vIENoZWNrIGlmIGF0IGxlYXN0IHNvbWUgcmVzb3VyY2VzIGhhdmUgdGhlIFByb2plY3QgdGFnXG4gICAgZm9yIChjb25zdCByZXNvdXJjZUtleSBpbiByZXNvdXJjZXMpIHtcbiAgICAgIGNvbnN0IHJlc291cmNlID0gcmVzb3VyY2VzW3Jlc291cmNlS2V5XTtcbiAgICAgIGlmIChyZXNvdXJjZS5Qcm9wZXJ0aWVzICYmIHJlc291cmNlLlByb3BlcnRpZXMuVGFncykge1xuICAgICAgICBjb25zdCBwcm9qZWN0VGFnID0gcmVzb3VyY2UuUHJvcGVydGllcy5UYWdzLmZpbmQoXG4gICAgICAgICAgKHRhZzogYW55KSA9PiB0YWcuS2V5ID09PSAnUHJvamVjdCcgJiYgdGFnLlZhbHVlID09PSAnQXVyYTI4Q0RLJyxcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKHByb2plY3RUYWcpIHtcbiAgICAgICAgICBoYXNQcm9qZWN0VGFnID0gdHJ1ZTtcbiAgICAgICAgICBicmVhaztcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGV4cGVjdChoYXNQcm9qZWN0VGFnKS50b0JlKHRydWUpO1xuICB9KTtcblxuICBpdElmRG9ja2VyKCdQcm9kdWN0aW9uIHN0YWNrIGluY2x1ZGVzIHd3dyByZWRpcmVjdCcsICgpID0+IHtcbiAgICBpZiAoIWRvY2tlckF2YWlsYWJsZSkgcmV0dXJuO1xuXG4gICAgY29uc3QgcHJvZEFwcCA9IG5ldyBjZGsuQXBwKCk7XG4gICAgY29uc3QgcHJvZFN0YWNrID0gbmV3IFdlYnNpdGVTdGFjayhwcm9kQXBwLCAnUHJvZFRlc3RTdGFjaycsIHtcbiAgICAgIGRvbWFpbk5hbWU6ICdleGFtcGxlLmNvbScsXG4gICAgICBlbnZpcm9ubWVudDogJ3Byb2QnLFxuICAgICAgZW52OiB7XG4gICAgICAgIGFjY291bnQ6ICcxMjM0NTY3ODkwMTInLFxuICAgICAgICByZWdpb246ICd1cy1lYXN0LTEnLFxuICAgICAgfSxcbiAgICB9KTtcbiAgICBjb25zdCBwcm9kVGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2socHJvZFN0YWNrKTtcblxuICAgIC8vIENoZWNrIGZvciB3d3cgcmVkaXJlY3QgYnVja2V0XG4gICAgcHJvZFRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpTMzo6QnVja2V0Jywge1xuICAgICAgV2Vic2l0ZUNvbmZpZ3VyYXRpb246IHtcbiAgICAgICAgUmVkaXJlY3RBbGxSZXF1ZXN0c1RvOiB7XG4gICAgICAgICAgSG9zdE5hbWU6ICdleGFtcGxlLmNvbScsXG4gICAgICAgICAgUHJvdG9jb2w6ICdodHRwcycsXG4gICAgICAgIH0sXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgLy8gQ2hlY2sgZm9yIHd3dyBkaXN0cmlidXRpb25cbiAgICBwcm9kVGVtcGxhdGUuaGFzUmVzb3VyY2UoJ0FXUzo6Q2xvdWRGcm9udDo6RGlzdHJpYnV0aW9uJywge1xuICAgICAgUHJvcGVydGllczoge1xuICAgICAgICBEaXN0cmlidXRpb25Db25maWc6IHtcbiAgICAgICAgICBBbGlhc2VzOiBbJ3d3dy5leGFtcGxlLmNvbSddLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICB9KTtcbiAgfSk7XG5cbiAgaXRJZkRvY2tlcignUHJvZHVjdGlvbiBEeW5hbW9EQiB0YWJsZSBoYXMgUkVUQUlOIHJlbW92YWwgcG9saWN5JywgKCkgPT4ge1xuICAgIGlmICghZG9ja2VyQXZhaWxhYmxlKSByZXR1cm47XG5cbiAgICBjb25zdCBwcm9kQXBwID0gbmV3IGNkay5BcHAoKTtcbiAgICBjb25zdCBwcm9kU3RhY2sgPSBuZXcgV2Vic2l0ZVN0YWNrKHByb2RBcHAsICdQcm9kVGVzdFN0YWNrJywge1xuICAgICAgZG9tYWluTmFtZTogJ2V4YW1wbGUuY29tJyxcbiAgICAgIGVudmlyb25tZW50OiAncHJvZCcsXG4gICAgICBlbnY6IHtcbiAgICAgICAgYWNjb3VudDogJzEyMzQ1Njc4OTAxMicsXG4gICAgICAgIHJlZ2lvbjogJ3VzLWVhc3QtMScsXG4gICAgICB9LFxuICAgIH0pO1xuICAgIGNvbnN0IHByb2RUZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhwcm9kU3RhY2spO1xuXG4gICAgLy8gQ2hlY2sgZm9yIER5bmFtb0RCIHRhYmxlIHdpdGggUkVUQUlOIHBvbGljeVxuICAgIHByb2RUZW1wbGF0ZS5oYXNSZXNvdXJjZSgnQVdTOjpEeW5hbW9EQjo6VGFibGUnLCB7XG4gICAgICBEZWxldGlvblBvbGljeTogJ1JldGFpbicsXG4gICAgICBVcGRhdGVSZXBsYWNlUG9saWN5OiAnUmV0YWluJyxcbiAgICAgIFByb3BlcnRpZXM6IHtcbiAgICAgICAgVGFibGVOYW1lOiAnQXVyYTI4LXByb2QtVXNlcnMnLFxuICAgICAgfSxcbiAgICB9KTtcbiAgfSk7XG59KTtcbiJdfQ==