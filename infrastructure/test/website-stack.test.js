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
                FunctionConfig: {
                    Runtime: 'cloudfront-js-1.0',
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
            // Check that the main distribution includes www alias
            prodTemplate.hasResource('AWS::CloudFront::Distribution', {
                Properties: {
                    DistributionConfig: {
                        Aliases: assertions_1.Match.arrayWith(['example.com', 'www.example.com']),
                    },
                },
            });
            // Check for www A record
            prodTemplate.hasResourceProperties('AWS::Route53::RecordSet', {
                Name: 'www.example.com.',
                Type: 'A',
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoid2Vic2l0ZS1zdGFjay50ZXN0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsid2Vic2l0ZS1zdGFjay50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBQSxpREFBbUM7QUFDbkMsdURBQXlEO0FBQ3pELHdEQUFvRDtBQUNwRCx1Q0FBeUI7QUFDekIsMkNBQTZCO0FBRTdCLCtCQUErQjtBQUMvQixNQUFNLGlCQUFpQixHQUFHLEdBQUcsRUFBRTtJQUM3QixJQUFJLENBQUM7UUFDSCxPQUFPLENBQUMsZUFBZSxDQUFDLENBQUMsUUFBUSxDQUFDLGtCQUFrQixFQUFFLEVBQUUsS0FBSyxFQUFFLFFBQVEsRUFBRSxDQUFDLENBQUM7UUFDM0UsT0FBTyxJQUFJLENBQUM7SUFDZCxDQUFDO0lBQUMsTUFBTSxDQUFDO1FBQ1AsT0FBTyxLQUFLLENBQUM7SUFDZixDQUFDO0FBQ0gsQ0FBQyxDQUFDO0FBRUYsTUFBTSxlQUFlLEdBQUcsaUJBQWlCLEVBQUUsQ0FBQztBQUU1Qyx3REFBd0Q7QUFDeEQsSUFBSSxDQUFDLGVBQWUsRUFBRSxDQUFDO0lBQ3JCLFFBQVEsQ0FBQyxjQUFjLEVBQUUsR0FBRyxFQUFFO1FBQzVCLElBQUksQ0FBQyxJQUFJLENBQUMsMENBQTBDLEVBQUUsR0FBRyxFQUFFO1lBQ3pELG9EQUFvRDtRQUN0RCxDQUFDLENBQUMsQ0FBQztJQUNMLENBQUMsQ0FBQyxDQUFDO0FBQ0wsQ0FBQztLQUFNLENBQUM7SUFDTixRQUFRLENBQUMsY0FBYyxFQUFFLEdBQUcsRUFBRTtRQUM1QixJQUFJLEdBQVksQ0FBQztRQUNqQixJQUFJLEtBQW1CLENBQUM7UUFDeEIsSUFBSSxRQUFrQixDQUFDO1FBRXZCLHNEQUFzRDtRQUN0RCxNQUFNLGNBQWMsR0FBRyxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxvQkFBb0IsQ0FBQyxDQUFDO1FBRWxFLFNBQVMsQ0FBQyxHQUFHLEVBQUU7WUFDYixJ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QUFLLENBQUMsU0FBUyxDQUFDLENBQUMsYUFBYSxFQUFFLGlCQUFpQixDQUFDLENBQUM7cUJBQzdEO2lCQUNGO2FBQ0YsQ0FBQyxDQUFDO1lBRUgseUJBQXlCO1lBQ3pCLFlBQVksQ0FBQyxxQkFBcUIsQ0FBQyx5QkFBeUIsRUFBRTtnQkFDNUQsSUFBSSxFQUFFLGtCQUFrQjtnQkFDeEIsSUFBSSxFQUFFLEdBQUc7YUFDVixDQUFDLENBQUM7UUFDTCxDQUFDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxxREFBcUQsRUFBRSxHQUFHLEVBQUU7WUFDL0QsTUFBTSxPQUFPLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxFQUFFLENBQUM7WUFDOUIsTUFBTSxTQUFTLEdBQUcsSUFBSSw0QkFBWSxDQUFDLE9BQU8sRUFBRSxlQUFlLEVBQUU7Z0JBQzNELFVBQVUsRUFBRSxhQUFhO2dCQUN6QixXQUFXLEVBQUUsTUFBTTtnQkFDbkIsR0FBRyxFQUFFO29CQUNILE9BQU8sRUFBRSxjQUFjO29CQUN2QixNQUFNLEVBQUUsV0FBVztpQkFDcEI7YUFDRixDQUFDLENBQUM7WUFDSCxNQUFNLFlBQVksR0FBRyxxQkFBUSxDQUFDLFNBQVMsQ0FBQyxTQUFTLENBQUMsQ0FBQztZQUVuRCw4Q0FBOEM7WUFDOUMsWUFBWSxDQUFDLFdBQVcsQ0FBQyxzQkFBc0IsRUFBRTtnQkFDL0MsY0FBYyxFQUFFLFFBQVE7Z0JBQ3hCLG1CQUFtQixFQUFFLFFBQVE7Z0JBQzdCLFVBQVUsRUFBRTtvQkFDVixTQUFTLEVBQUUsbUJBQW1CO2lCQUMvQjthQUNGLENBQUMsQ0FBQztRQUNMLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUM7QUFDTCxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IFRlbXBsYXRlLCBNYXRjaCB9IGZyb20gJ2F3cy1jZGstbGliL2Fzc2VydGlvbnMnO1xuaW1wb3J0IHsgV2Vic2l0ZVN0YWNrIH0gZnJvbSAnLi4vbGliL3dlYnNpdGUtc3RhY2snO1xuaW1wb3J0ICogYXMgZnMgZnJvbSAnZnMnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcblxuLy8gQ2hlY2sgaWYgRG9ja2VyIGlzIGF2YWlsYWJsZVxuY29uc3QgaXNEb2NrZXJBdmFpbGFibGUgPSAoKSA9PiB7XG4gIHRyeSB7XG4gICAgcmVxdWlyZSgnY2hpbGRfcHJvY2VzcycpLmV4ZWNTeW5jKCdkb2NrZXIgLS12ZXJzaW9uJywgeyBzdGRpbzogJ2lnbm9yZScgfSk7XG4gICAgcmV0dXJuIHRydWU7XG4gIH0gY2F0Y2gge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxufTtcblxuY29uc3QgZG9ja2VyQXZhaWxhYmxlID0gaXNEb2NrZXJBdmFpbGFibGUoKTtcblxuLy8gU2tpcCB0aGUgZW50aXJlIHRlc3Qgc3VpdGUgaWYgRG9ja2VyIGlzIG5vdCBhdmFpbGFibGVcbmlmICghZG9ja2VyQXZhaWxhYmxlKSB7XG4gIGRlc2NyaWJlKCdXZWJzaXRlU3RhY2snLCAoKSA9PiB7XG4gICAgdGVzdC5za2lwKCdBbGwgdGVzdHMgc2tpcHBlZCAtIERvY2tlciBub3QgYXZhaWxhYmxlJywgKCkgPT4ge1xuICAgICAgLy8gVGhpcyB0ZXN0IGlzIHNraXBwZWQgd2hlbiBEb2NrZXIgaXMgbm90IGF2YWlsYWJsZVxuICAgIH0pO1xuICB9KTtcbn0gZWxzZSB7XG4gIGRlc2NyaWJlKCdXZWJzaXRlU3RhY2snLCAoKSA9PiB7XG4gICAgbGV0IGFwcDogY2RrLkFwcDtcbiAgICBsZXQgc3RhY2s6IFdlYnNpdGVTdGFjaztcbiAgICBsZXQgdGVtcGxhdGU6IFRlbXBsYXRlO1xuXG4gICAgLy8gQ3JlYXRlIGEgdGVtcG9yYXJ5IGZyb250ZW5kL291dCBkaXJlY3RvcnkgZm9yIHRlc3RzXG4gICAgY29uc3QgZnJvbnRlbmRPdXREaXIgPSBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vLi4vZnJvbnRlbmQvb3V0Jyk7XG5cbiAgICBiZWZvcmVBbGwoKCkgPT4ge1xuICAgICAgaWYgKCFmcy5leGlzdHNTeW5jKGZyb250ZW5kT3V0RGlyKSkge1xuICAgICAgICBmcy5ta2RpclN5bmMoZnJvbnRlbmRPdXREaXIsIHsgcmVjdXJzaXZlOiB0cnVlIH0pO1xuICAgICAgICAvLyBDcmVhdGUgYSBkdW1teSBpbmRleC5odG1sIGZpbGVcbiAgICAgICAgZnMud3JpdGVGaWxlU3luYyhwYXRoLmpvaW4oZnJvbnRlbmRPdXREaXIsICdpbmRleC5odG1sJyksICc8aHRtbD48L2h0bWw+Jyk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICBhZnRlckFsbCgoKSA9PiB7XG4gICAgICAvLyBDbGVhbiB1cCB0aGUgdGVtcG9yYXJ5IGRpcmVjdG9yeVxuICAgICAgaWYgKGZzLmV4aXN0c1N5bmMoZnJvbnRlbmRPdXREaXIpKSB7XG4gICAgICAgIGZzLnJtU3luYyhmcm9udGVuZE91dERpciwgeyByZWN1cnNpdmU6IHRydWUsIGZvcmNlOiB0cnVlIH0pO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgYmVmb3JlRWFjaCgoKSA9PiB7XG4gICAgICAvLyBTZXQgYnVuZGxpbmcgdG8gdXNlIGxvY2FsIG1vZGUgZm9yIHRlc3RzXG4gICAgICBhcHAgPSBuZXcgY2RrLkFwcCh7XG4gICAgICAgIGNvbnRleHQ6IHtcbiAgICAgICAgICAnYXdzOmNkazpidW5kbGluZy1zdGFja3MnOiBbJ1Rlc3RTdGFjayddLFxuICAgICAgICB9LFxuICAgICAgfSk7XG5cbiAgICAgIC8vIE1vY2sgYnVuZGxpbmcgZm9yIExhbWJkYSBmdW5jdGlvbnNcbiAgICAgIHByb2Nlc3MuZW52LkNES19CVU5ETElOR19TVEFHSU5HX0RJU0FCTEVEID0gJzEnO1xuXG4gICAgICBzdGFjayA9IG5ldyBXZWJzaXRlU3RhY2soYXBwLCAnVGVzdFN0YWNrJywge1xuICAgICAgICBkb21haW5OYW1lOiAnZXhhbXBsZS5jb20nLFxuICAgICAgICBzdWJkb21haW46ICd0ZXN0JyxcbiAgICAgICAgZW52aXJvbm1lbnQ6ICdkZXYnLFxuICAgICAgICBlbnY6IHtcbiAgICAgICAgICBhY2NvdW50OiAnMTIzNDU2Nzg5MDEyJyxcbiAgICAgICAgICByZWdpb246ICd1cy1lYXN0LTEnLFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgICB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjayk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdTMyBidWNrZXQgaXMgY3JlYXRlZCB3aXRoIGNvcnJlY3QgcHJvcGVydGllcycsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpTMzo6QnVja2V0Jywge1xuICAgICAgICBCdWNrZXROYW1lOiBNYXRjaC5zdHJpbmdMaWtlUmVnZXhwKCdhdXJhMjgtZGV2LXdlYnNpdGUtLionKSxcbiAgICAgICAgUHVibGljQWNjZXNzQmxvY2tDb25maWd1cmF0aW9uOiB7XG4gICAgICAgICAgQmxvY2tQdWJsaWNBY2xzOiB0cnVlLFxuICAgICAgICAgIEJsb2NrUHVibGljUG9saWN5OiB0cnVlLFxuICAgICAgICAgIElnbm9yZVB1YmxpY0FjbHM6IHRydWUsXG4gICAgICAgICAgUmVzdHJpY3RQdWJsaWNCdWNrZXRzOiB0cnVlLFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdDbG91ZEZyb250IGRpc3RyaWJ1dGlvbiBpcyBjcmVhdGVkJywgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2UoJ0FXUzo6Q2xvdWRGcm9udDo6RGlzdHJpYnV0aW9uJywge1xuICAgICAgICBQcm9wZXJ0aWVzOiB7XG4gICAgICAgICAgRGlzdHJpYnV0aW9uQ29uZmlnOiB7XG4gICAgICAgICAgICBBbGlhc2VzOiBbJ3Rlc3QuZXhhbXBsZS5jb20nXSxcbiAgICAgICAgICAgIFZpZXdlckNlcnRpZmljYXRlOiB7XG4gICAgICAgICAgICAgIEFjbUNlcnRpZmljYXRlQXJuOiBNYXRjaC5hbnlWYWx1ZSgpLFxuICAgICAgICAgICAgICBNaW5pbXVtUHJvdG9jb2xWZXJzaW9uOiAnVExTdjEuMl8yMDIxJyxcbiAgICAgICAgICAgICAgU3NsU3VwcG9ydE1ldGhvZDogJ3NuaS1vbmx5JyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgdGVzdCgnQ2xvdWRGcm9udCBmdW5jdGlvbiBmb3Igcm91dGluZyBpcyBjcmVhdGVkJywgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OkNsb3VkRnJvbnQ6OkZ1bmN0aW9uJywge1xuICAgICAgICBGdW5jdGlvbkNvbmZpZzoge1xuICAgICAgICAgIFJ1bnRpbWU6ICdjbG91ZGZyb250LWpzLTEuMCcsXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIHRlc3QoJ1JvdXRlNTMgQSByZWNvcmQgaXMgY3JlYXRlZCcsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpSb3V0ZTUzOjpSZWNvcmRTZXQnLCB7XG4gICAgICAgIFR5cGU6ICdBJyxcbiAgICAgICAgQWxpYXNUYXJnZXQ6IE1hdGNoLm9iamVjdExpa2Uoe1xuICAgICAgICAgIEROU05hbWU6IE1hdGNoLmFueVZhbHVlKCksXG4gICAgICAgIH0pLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdBQ00gY2VydGlmaWNhdGUgaXMgY3JlYXRlZCcsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpDZXJ0aWZpY2F0ZU1hbmFnZXI6OkNlcnRpZmljYXRlJywge1xuICAgICAgICBEb21haW5OYW1lOiAndGVzdC5leGFtcGxlLmNvbScsXG4gICAgICAgIERvbWFpblZhbGlkYXRpb25PcHRpb25zOiBbXG4gICAgICAgICAge1xuICAgICAgICAgICAgRG9tYWluTmFtZTogJ3Rlc3QuZXhhbXBsZS5jb20nLFxuICAgICAgICAgICAgSG9zdGVkWm9uZUlkOiBNYXRjaC5hbnlWYWx1ZSgpLFxuICAgICAgICAgIH0sXG4gICAgICAgIF0sXG4gICAgICAgIFZhbGlkYXRpb25NZXRob2Q6ICdETlMnLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdEeW5hbW9EQiB0YWJsZSBpcyBjcmVhdGVkIHdpdGggY29ycmVjdCBwcm9wZXJ0aWVzJywgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OkR5bmFtb0RCOjpUYWJsZScsIHtcbiAgICAgICAgVGFibGVOYW1lOiAnQXVyYTI4LWRldi1Vc2VycycsXG4gICAgICAgIEtleVNjaGVtYTogW1xuICAgICAgICAgIHtcbiAgICAgICAgICAgIEF0dHJpYnV0ZU5hbWU6ICd1c2VySWQnLFxuICAgICAgICAgICAgS2V5VHlwZTogJ0hBU0gnLFxuICAgICAgICAgIH0sXG4gICAgICAgICAge1xuICAgICAgICAgICAgQXR0cmlidXRlTmFtZTogJ2NyZWF0ZWRBdCcsXG4gICAgICAgICAgICBLZXlUeXBlOiAnUkFOR0UnLFxuICAgICAgICAgIH0sXG4gICAgICAgIF0sXG4gICAgICAgIEJpbGxpbmdNb2RlOiAnUEFZX1BFUl9SRVFVRVNUJyxcbiAgICAgICAgUG9pbnRJblRpbWVSZWNvdmVyeVNwZWNpZmljYXRpb246IHtcbiAgICAgICAgICBQb2ludEluVGltZVJlY292ZXJ5RW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgdGVzdCgnUmVzb3VyY2VzIGFyZSB0YWdnZWQgd2l0aCBQcm9qZWN0IHRhZycsICgpID0+IHtcbiAgICAgIGNvbnN0IHN0YWNrSnNvbiA9IHRlbXBsYXRlLnRvSlNPTigpO1xuICAgICAgY29uc3QgcmVzb3VyY2VzID0gc3RhY2tKc29uLlJlc291cmNlcztcbiAgICAgIGxldCBoYXNQcm9qZWN0VGFnID0gZmFsc2U7XG5cbiAgICAgIC8vIENoZWNrIGlmIGF0IGxlYXN0IHNvbWUgcmVzb3VyY2VzIGhhdmUgdGhlIFByb2plY3QgdGFnXG4gICAgICBmb3IgKGNvbnN0IHJlc291cmNlS2V5IGluIHJlc291cmNlcykge1xuICAgICAgICBjb25zdCByZXNvdXJjZSA9IHJlc291cmNlc1tyZXNvdXJjZUtleV07XG4gICAgICAgIGlmIChyZXNvdXJjZS5Qcm9wZXJ0aWVzICYmIHJlc291cmNlLlByb3BlcnRpZXMuVGFncykge1xuICAgICAgICAgIGNvbnN0IHByb2plY3RUYWcgPSByZXNvdXJjZS5Qcm9wZXJ0aWVzLlRhZ3MuZmluZChcbiAgICAgICAgICAgICh0YWc6IGFueSkgPT4gdGFnLktleSA9PT0gJ1Byb2plY3QnICYmIHRhZy5WYWx1ZSA9PT0gJ0F1cmEyOENESycsXG4gICAgICAgICAgKTtcbiAgICAgICAgICBpZiAocHJvamVjdFRhZykge1xuICAgICAgICAgICAgaGFzUHJvamVjdFRhZyA9IHRydWU7XG4gICAgICAgICAgICBicmVhaztcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgZXhwZWN0KGhhc1Byb2plY3RUYWcpLnRvQmUodHJ1ZSk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdQcm9kdWN0aW9uIHN0YWNrIGluY2x1ZGVzIHd3dyByZWRpcmVjdCcsICgpID0+IHtcbiAgICAgIGNvbnN0IHByb2RBcHAgPSBuZXcgY2RrLkFwcCgpO1xuICAgICAgY29uc3QgcHJvZFN0YWNrID0gbmV3IFdlYnNpdGVTdGFjayhwcm9kQXBwLCAnUHJvZFRlc3RTdGFjaycsIHtcbiAgICAgICAgZG9tYWluTmFtZTogJ2V4YW1wbGUuY29tJyxcbiAgICAgICAgZW52aXJvbm1lbnQ6ICdwcm9kJyxcbiAgICAgICAgZW52OiB7XG4gICAgICAgICAgYWNjb3VudDogJzEyMzQ1Njc4OTAxMicsXG4gICAgICAgICAgcmVnaW9uOiAndXMtZWFzdC0xJyxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgICAgY29uc3QgcHJvZFRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHByb2RTdGFjayk7XG5cbiAgICAgIC8vIENoZWNrIHRoYXQgdGhlIG1haW4gZGlzdHJpYnV0aW9uIGluY2x1ZGVzIHd3dyBhbGlhc1xuICAgICAgcHJvZFRlbXBsYXRlLmhhc1Jlc291cmNlKCdBV1M6OkNsb3VkRnJvbnQ6OkRpc3RyaWJ1dGlvbicsIHtcbiAgICAgICAgUHJvcGVydGllczoge1xuICAgICAgICAgIERpc3RyaWJ1dGlvbkNvbmZpZzoge1xuICAgICAgICAgICAgQWxpYXNlczogTWF0Y2guYXJyYXlXaXRoKFsnZXhhbXBsZS5jb20nLCAnd3d3LmV4YW1wbGUuY29tJ10pLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0sXG4gICAgICB9KTtcblxuICAgICAgLy8gQ2hlY2sgZm9yIHd3dyBBIHJlY29yZFxuICAgICAgcHJvZFRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpSb3V0ZTUzOjpSZWNvcmRTZXQnLCB7XG4gICAgICAgIE5hbWU6ICd3d3cuZXhhbXBsZS5jb20uJyxcbiAgICAgICAgVHlwZTogJ0EnLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdQcm9kdWN0aW9uIER5bmFtb0RCIHRhYmxlIGhhcyBSRVRBSU4gcmVtb3ZhbCBwb2xpY3knLCAoKSA9PiB7XG4gICAgICBjb25zdCBwcm9kQXBwID0gbmV3IGNkay5BcHAoKTtcbiAgICAgIGNvbnN0IHByb2RTdGFjayA9IG5ldyBXZWJzaXRlU3RhY2socHJvZEFwcCwgJ1Byb2RUZXN0U3RhY2snLCB7XG4gICAgICAgIGRvbWFpbk5hbWU6ICdleGFtcGxlLmNvbScsXG4gICAgICAgIGVudmlyb25tZW50OiAncHJvZCcsXG4gICAgICAgIGVudjoge1xuICAgICAgICAgIGFjY291bnQ6ICcxMjM0NTY3ODkwMTInLFxuICAgICAgICAgIHJlZ2lvbjogJ3VzLWVhc3QtMScsXG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICAgIGNvbnN0IHByb2RUZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhwcm9kU3RhY2spO1xuXG4gICAgICAvLyBDaGVjayBmb3IgRHluYW1vREIgdGFibGUgd2l0aCBSRVRBSU4gcG9saWN5XG4gICAgICBwcm9kVGVtcGxhdGUuaGFzUmVzb3VyY2UoJ0FXUzo6RHluYW1vREI6OlRhYmxlJywge1xuICAgICAgICBEZWxldGlvblBvbGljeTogJ1JldGFpbicsXG4gICAgICAgIFVwZGF0ZVJlcGxhY2VQb2xpY3k6ICdSZXRhaW4nLFxuICAgICAgICBQcm9wZXJ0aWVzOiB7XG4gICAgICAgICAgVGFibGVOYW1lOiAnQXVyYTI4LXByb2QtVXNlcnMnLFxuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfSk7XG4gIH0pO1xufVxuIl19