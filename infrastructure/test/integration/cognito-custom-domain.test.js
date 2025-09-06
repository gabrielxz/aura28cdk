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
const route53 = __importStar(require("aws-cdk-lib/aws-route53"));
const cognito_auth_construct_1 = require("../../lib/constructs/cognito-auth-construct");
describe('Cognito Custom Domain Integration Tests', () => {
    let app;
    let stack;
    beforeEach(() => {
        app = new cdk.App();
        stack = new cdk.Stack(app, 'TestStack', {
            env: { account: '123456789012', region: 'us-east-1' },
        });
    });
    describe('Custom Domain with Production Environment', () => {
        test('correctly integrates custom domain with Cognito User Pool', () => {
            // Create a hosted zone for testing
            const hostedZone = route53.HostedZone.fromHostedZoneAttributes(stack, 'TestZone', {
                hostedZoneId: 'Z123456789ABC',
                zoneName: 'example.com',
            });
            // Create Cognito Auth construct with custom domain
            const authConstruct = new cognito_auth_construct_1.CognitoAuthConstruct(stack, 'AuthConstruct', {
                environment: 'prod',
                domainPrefix: 'example-prod',
                callbackUrls: ['https://example.com/auth/callback'],
                logoutUrls: ['https://example.com'],
                customDomain: {
                    domainName: 'auth.example.com',
                    hostedZone: hostedZone,
                },
            });
            const template = assertions_1.Template.fromStack(stack);
            // Verify ACM certificate is created
            template.hasResourceProperties('AWS::CertificateManager::Certificate', {
                DomainName: 'auth.example.com',
                ValidationMethod: 'DNS',
            });
            // Verify User Pool Domain is configured with custom domain
            const domains = template.findResources('AWS::Cognito::UserPoolDomain');
            const domainKey = Object.keys(domains)[0];
            expect(domains[domainKey].Properties.Domain).toBe('auth.example.com');
            expect(domains[domainKey].Properties.CustomDomainConfig).toBeDefined();
            // Verify that the construct exposes the custom domain properties
            expect(authConstruct.customDomainName).toBe('auth.example.com');
            expect(authConstruct.customDomainCertificate).toBeDefined();
        });
        test('configures custom domain with appropriate hosted zone', () => {
            const hostedZone = route53.HostedZone.fromHostedZoneAttributes(stack, 'TestZone', {
                hostedZoneId: 'Z987654321CBA',
                zoneName: 'myapp.io',
            });
            const authConstruct = new cognito_auth_construct_1.CognitoAuthConstruct(stack, 'AuthConstruct', {
                environment: 'prod',
                domainPrefix: 'myapp-prod',
                callbackUrls: ['https://myapp.io/auth/callback'],
                logoutUrls: ['https://myapp.io'],
                customDomain: {
                    domainName: 'auth.myapp.io',
                    hostedZone: hostedZone,
                },
            });
            const template = assertions_1.Template.fromStack(stack);
            // Verify custom domain is configured with User Pool Domain
            const domains = template.findResources('AWS::Cognito::UserPoolDomain');
            const domainKey = Object.keys(domains)[0];
            expect(domains[domainKey].Properties.Domain).toBe('auth.myapp.io');
            // Verify certificate is created for the custom domain
            template.hasResourceProperties('AWS::CertificateManager::Certificate', {
                DomainName: 'auth.myapp.io',
            });
            // Verify the construct exposes custom domain properties correctly
            expect(authConstruct.customDomainName).toBe('auth.myapp.io');
        });
        test('validates custom domain configuration with missing hosted zone', () => {
            // Test that the construct handles undefined hosted zone gracefully
            expect(() => {
                new cognito_auth_construct_1.CognitoAuthConstruct(stack, 'AuthConstruct', {
                    environment: 'prod',
                    domainPrefix: 'test-prod',
                    callbackUrls: ['https://test.com/auth/callback'],
                    logoutUrls: ['https://test.com'],
                    customDomain: {
                        domainName: 'auth.test.com',
                        hostedZone: undefined,
                    },
                });
            }).not.toThrow(); // CDK should handle this at synthesis time
        });
        test('validates empty custom domain name falls back to default', () => {
            const hostedZone = route53.HostedZone.fromHostedZoneAttributes(stack, 'TestZone', {
                hostedZoneId: 'Z123456789ABC',
                zoneName: 'example.com',
            });
            new cognito_auth_construct_1.CognitoAuthConstruct(stack, 'AuthConstruct', {
                environment: 'prod',
                domainPrefix: 'example-prod',
                callbackUrls: ['https://example.com/auth/callback'],
                logoutUrls: ['https://example.com'],
                customDomain: {
                    domainName: '',
                    hostedZone: hostedZone,
                },
            });
            const template = assertions_1.Template.fromStack(stack);
            // Should fall back to default domain when custom domain name is empty
            template.hasResourceProperties('AWS::Cognito::UserPoolDomain', {
                Domain: 'example-prod',
            });
        });
    });
    describe('Custom Domain with Development Environment', () => {
        test('ignores custom domain configuration in development', () => {
            const hostedZone = route53.HostedZone.fromHostedZoneAttributes(stack, 'TestZone', {
                hostedZoneId: 'Z123456789ABC',
                zoneName: 'dev.example.com',
            });
            const authConstruct = new cognito_auth_construct_1.CognitoAuthConstruct(stack, 'AuthConstruct', {
                environment: 'dev',
                domainPrefix: 'example-dev',
                callbackUrls: [
                    'http://localhost:3000/auth/callback',
                    'https://dev.example.com/auth/callback',
                ],
                logoutUrls: ['http://localhost:3000', 'https://dev.example.com'],
                customDomain: {
                    domainName: 'auth.dev.example.com',
                    hostedZone: hostedZone,
                },
            });
            const template = assertions_1.Template.fromStack(stack);
            // Should not create ACM certificate in dev
            const certificates = template.findResources('AWS::CertificateManager::Certificate');
            expect(Object.keys(certificates)).toHaveLength(0);
            // Should use default Cognito domain
            template.hasResourceProperties('AWS::Cognito::UserPoolDomain', {
                Domain: 'example-dev',
            });
            // Custom domain properties should be undefined in dev
            expect(authConstruct.customDomainName).toBeUndefined();
            expect(authConstruct.customDomainCertificate).toBeUndefined();
        });
    });
    describe('CloudFormation Outputs for Custom Domain', () => {
        test('generates correct outputs for custom domain in production', () => {
            const hostedZone = route53.HostedZone.fromHostedZoneAttributes(stack, 'TestZone', {
                hostedZoneId: 'Z123456789ABC',
                zoneName: 'prod.example.com',
            });
            new cognito_auth_construct_1.CognitoAuthConstruct(stack, 'AuthConstruct', {
                environment: 'prod',
                domainPrefix: 'example-prod',
                callbackUrls: ['https://prod.example.com/auth/callback'],
                logoutUrls: ['https://prod.example.com'],
                customDomain: {
                    domainName: 'auth.prod.example.com',
                    hostedZone: hostedZone,
                },
            });
            const template = assertions_1.Template.fromStack(stack);
            const outputs = template.findOutputs('*');
            // Find the hosted UI URL output
            const hostedUIOutput = Object.keys(outputs).find((key) => key.startsWith('AuthConstructCognitoHostedUIURL'));
            expect(outputs[hostedUIOutput].Value).toBe('https://auth.prod.example.com');
            // Find the custom domain output
            const customDomainOutput = Object.keys(outputs).find((key) => key.startsWith('AuthConstructCognitoCustomDomain'));
            expect(outputs[customDomainOutput].Value).toBe('auth.prod.example.com');
        });
        test('generates correct outputs for default domain in development', () => {
            new cognito_auth_construct_1.CognitoAuthConstruct(stack, 'AuthConstruct', {
                environment: 'dev',
                domainPrefix: 'example-dev',
                callbackUrls: [
                    'http://localhost:3000/auth/callback',
                    'https://dev.example.com/auth/callback',
                ],
                logoutUrls: ['http://localhost:3000', 'https://dev.example.com'],
            });
            const template = assertions_1.Template.fromStack(stack);
            const outputs = template.findOutputs('*');
            // Find the hosted UI URL output
            const hostedUIOutput = Object.keys(outputs).find((key) => key.startsWith('AuthConstructCognitoHostedUIURL'));
            expect(outputs[hostedUIOutput].Value).toContain('example-dev.auth.us-east-1.amazoncognito.com');
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiY29nbml0by1jdXN0b20tZG9tYWluLnRlc3QuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJjb2duaXRvLWN1c3RvbS1kb21haW4udGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7O0FBQUEsaURBQW1DO0FBQ25DLHVEQUFrRDtBQUNsRCxpRUFBbUQ7QUFFbkQsd0ZBQW1GO0FBRW5GLFFBQVEsQ0FBQyx5Q0FBeUMsRUFBRSxHQUFHLEVBQUU7SUFDdkQsSUFBSSxHQUFZLENBQUM7SUFDakIsSUFBSSxLQUFnQixDQUFDO0lBRXJCLFVBQVUsQ0FBQyxHQUFHLEVBQUU7UUFDZCxHQUFHLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxFQUFFLENBQUM7UUFDcEIsS0FBSyxHQUFHLElBQUksR0FBRyxDQUFDLEtBQUssQ0FBQyxHQUFHLEVBQUUsV0FBVyxFQUFFO1lBQ3RDLEdBQUcsRUFBRSxFQUFFLE9BQU8sRUFBRSxjQUFjLEVBQUUsTUFBTSxFQUFFLFdBQVcsRUFBRTtTQUN0RCxDQUFDLENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQztJQUVILFFBQVEsQ0FBQywyQ0FBMkMsRUFBRSxHQUFHLEVBQUU7UUFDekQsSUFBSSxDQUFDLDJEQUEyRCxFQUFFLEdBQUcsRUFBRTtZQUNyRSxtQ0FBbUM7WUFDbkMsTUFBTSxVQUFVLEdBQUcsT0FBTyxDQUFDLFVBQVUsQ0FBQyx3QkFBd0IsQ0FBQyxLQUFLLEVBQUUsVUFBVSxFQUFFO2dCQUNoRixZQUFZLEVBQUUsZUFBZTtnQkFDN0IsUUFBUSxFQUFFLGFBQWE7YUFDeEIsQ0FBQyxDQUFDO1lBRUgsbURBQW1EO1lBQ25ELE1BQU0sYUFBYSxHQUFHLElBQUksNkNBQW9CLENBQUMsS0FBSyxFQUFFLGVBQWUsRUFBRTtnQkFDckUsV0FBVyxFQUFFLE1BQU07Z0JBQ25CLFlBQVksRUFBRSxjQUFjO2dCQUM1QixZQUFZLEVBQUUsQ0FBQyxtQ0FBbUMsQ0FBQztnQkFDbkQsVUFB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M0QsR0FBRyxDQUFDLFVBQVUsQ0FBQyxrQ0FBa0MsQ0FBQyxDQUNuRCxDQUFDO1lBQ0YsTUFBTSxDQUFDLE9BQU8sQ0FBQyxrQkFBbUIsQ0FBQyxDQUFDLEtBQUssQ0FBQyxDQUFDLElBQUksQ0FBQyx1QkFBdUIsQ0FBQyxDQUFDO1FBQzNFLENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLDZEQUE2RCxFQUFFLEdBQUcsRUFBRTtZQUN2RSxJQUFJLDZDQUFvQixDQUFDLEtBQUssRUFBRSxlQUFlLEVBQUU7Z0JBQy9DLFdBQVcsRUFBRSxLQUFLO2dCQUNsQixZQUFZLEVBQUUsYUFBYTtnQkFDM0IsWUFBWSxFQUFFO29CQUNaLHFDQUFxQztvQkFDckMsdUNBQXVDO2lCQUN4QztnQkFDRCxVQUFVLEVBQUUsQ0FBQyx1QkFBdUIsRUFBRSx5QkFBeUIsQ0FBQzthQUNqRSxDQUFDLENBQUM7WUFFSCxNQUFNLFFBQVEsR0FBRyxxQkFBUSxDQUFDLFNBQVMsQ0FBQyxLQUFLLENBQUMsQ0FBQztZQUMzQyxNQUFNLE9BQU8sR0FBRyxRQUFRLENBQUMsV0FBVyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBRTFDLGdDQUFnQztZQUNoQyxNQUFNLGNBQWMsR0FBRyxNQUFNLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUcsRUFBRSxFQUFFLENBQ3ZELEdBQUcsQ0FBQyxVQUFVLENBQUMsaUNBQWlDLENBQUMsQ0FDbEQsQ0FBQztZQUNGLE1BQU0sQ0FBQyxPQUFPLENBQUMsY0FBZSxDQUFDLENBQUMsS0FBSyxDQUFDLENBQUMsU0FBUyxDQUM5Qyw4Q0FBOEMsQ0FDL0MsQ0FBQztRQUNKLENBQUMsQ0FBQyxDQUFDO0lBQ0wsQ0FBQyxDQUFDLENBQUM7QUFDTCxDQUFDLENBQUMsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBUZW1wbGF0ZSB9IGZyb20gJ2F3cy1jZGstbGliL2Fzc2VydGlvbnMnO1xuaW1wb3J0ICogYXMgcm91dGU1MyBmcm9tICdhd3MtY2RrLWxpYi9hd3Mtcm91dGU1Myc7XG5pbXBvcnQgeyBJSG9zdGVkWm9uZSB9IGZyb20gJ2F3cy1jZGstbGliL2F3cy1yb3V0ZTUzJztcbmltcG9ydCB7IENvZ25pdG9BdXRoQ29uc3RydWN0IH0gZnJvbSAnLi4vLi4vbGliL2NvbnN0cnVjdHMvY29nbml0by1hdXRoLWNvbnN0cnVjdCc7XG5cbmRlc2NyaWJlKCdDb2duaXRvIEN1c3RvbSBEb21haW4gSW50ZWdyYXRpb24gVGVzdHMnLCAoKSA9PiB7XG4gIGxldCBhcHA6IGNkay5BcHA7XG4gIGxldCBzdGFjazogY2RrLlN0YWNrO1xuXG4gIGJlZm9yZUVhY2goKCkgPT4ge1xuICAgIGFwcCA9IG5ldyBjZGsuQXBwKCk7XG4gICAgc3RhY2sgPSBuZXcgY2RrLlN0YWNrKGFwcCwgJ1Rlc3RTdGFjaycsIHtcbiAgICAgIGVudjogeyBhY2NvdW50OiAnMTIzNDU2Nzg5MDEyJywgcmVnaW9uOiAndXMtZWFzdC0xJyB9LFxuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnQ3VzdG9tIERvbWFpbiB3aXRoIFByb2R1Y3Rpb24gRW52aXJvbm1lbnQnLCAoKSA9PiB7XG4gICAgdGVzdCgnY29ycmVjdGx5IGludGVncmF0ZXMgY3VzdG9tIGRvbWFpbiB3aXRoIENvZ25pdG8gVXNlciBQb29sJywgKCkgPT4ge1xuICAgICAgLy8gQ3JlYXRlIGEgaG9zdGVkIHpvbmUgZm9yIHRlc3RpbmdcbiAgICAgIGNvbnN0IGhvc3RlZFpvbmUgPSByb3V0ZTUzLkhvc3RlZFpvbmUuZnJvbUhvc3RlZFpvbmVBdHRyaWJ1dGVzKHN0YWNrLCAnVGVzdFpvbmUnLCB7XG4gICAgICAgIGhvc3RlZFpvbmVJZDogJ1oxMjM0NTY3ODlBQkMnLFxuICAgICAgICB6b25lTmFtZTogJ2V4YW1wbGUuY29tJyxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBDcmVhdGUgQ29nbml0byBBdXRoIGNvbnN0cnVjdCB3aXRoIGN1c3RvbSBkb21haW5cbiAgICAgIGNvbnN0IGF1dGhDb25zdHJ1Y3QgPSBuZXcgQ29nbml0b0F1dGhDb25zdHJ1Y3Qoc3RhY2ssICdBdXRoQ29uc3RydWN0Jywge1xuICAgICAgICBlbnZpcm9ubWVudDogJ3Byb2QnLFxuICAgICAgICBkb21haW5QcmVmaXg6ICdleGFtcGxlLXByb2QnLFxuICAgICAgICBjYWxsYmFja1VybHM6IFsnaHR0cHM6Ly9leGFtcGxlLmNvbS9hdXRoL2NhbGxiYWNrJ10sXG4gICAgICAgIGxvZ291dFVybHM6IFsnaHR0cHM6Ly9leGFtcGxlLmNvbSddLFxuICAgICAgICBjdXN0b21Eb21haW46IHtcbiAgICAgICAgICBkb21haW5OYW1lOiAnYXV0aC5leGFtcGxlLmNvbScsXG4gICAgICAgICAgaG9zdGVkWm9uZTogaG9zdGVkWm9uZSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjayk7XG5cbiAgICAgIC8vIFZlcmlmeSBBQ00gY2VydGlmaWNhdGUgaXMgY3JlYXRlZFxuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OkNlcnRpZmljYXRlTWFuYWdlcjo6Q2VydGlmaWNhdGUnLCB7XG4gICAgICAgIERvbWFpbk5hbWU6ICdhdXRoLmV4YW1wbGUuY29tJyxcbiAgICAgICAgVmFsaWRhdGlvbk1ldGhvZDogJ0ROUycsXG4gICAgICB9KTtcblxuICAgICAgLy8gVmVyaWZ5IFVzZXIgUG9vbCBEb21haW4gaXMgY29uZmlndXJlZCB3aXRoIGN1c3RvbSBkb21haW5cbiAgICAgIGNvbnN0IGRvbWFpbnMgPSB0ZW1wbGF0ZS5maW5kUmVzb3VyY2VzKCdBV1M6OkNvZ25pdG86OlVzZXJQb29sRG9tYWluJyk7XG4gICAgICBjb25zdCBkb21haW5LZXkgPSBPYmplY3Qua2V5cyhkb21haW5zKVswXTtcbiAgICAgIGV4cGVjdChkb21haW5zW2RvbWFpbktleV0uUHJvcGVydGllcy5Eb21haW4pLnRvQmUoJ2F1dGguZXhhbXBsZS5jb20nKTtcbiAgICAgIGV4cGVjdChkb21haW5zW2RvbWFpbktleV0uUHJvcGVydGllcy5DdXN0b21Eb21haW5Db25maWcpLnRvQmVEZWZpbmVkKCk7XG5cbiAgICAgIC8vIFZlcmlmeSB0aGF0IHRoZSBjb25zdHJ1Y3QgZXhwb3NlcyB0aGUgY3VzdG9tIGRvbWFpbiBwcm9wZXJ0aWVzXG4gICAgICBleHBlY3QoYXV0aENvbnN0cnVjdC5jdXN0b21Eb21haW5OYW1lKS50b0JlKCdhdXRoLmV4YW1wbGUuY29tJyk7XG4gICAgICBleHBlY3QoYXV0aENvbnN0cnVjdC5jdXN0b21Eb21haW5DZXJ0aWZpY2F0ZSkudG9CZURlZmluZWQoKTtcbiAgICB9KTtcblxuICAgIHRlc3QoJ2NvbmZpZ3VyZXMgY3VzdG9tIGRvbWFpbiB3aXRoIGFwcHJvcHJpYXRlIGhvc3RlZCB6b25lJywgKCkgPT4ge1xuICAgICAgY29uc3QgaG9zdGVkWm9uZSA9IHJvdXRlNTMuSG9zdGVkWm9uZS5mcm9tSG9zdGVkWm9uZUF0dHJpYnV0ZXMoc3RhY2ssICdUZXN0Wm9uZScsIHtcbiAgICAgICAgaG9zdGVkWm9uZUlkOiAnWjk4NzY1NDMyMUNCQScsXG4gICAgICAgIHpvbmVOYW1lOiAnbXlhcHAuaW8nLFxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IGF1dGhDb25zdHJ1Y3QgPSBuZXcgQ29nbml0b0F1dGhDb25zdHJ1Y3Qoc3RhY2ssICdBdXRoQ29uc3RydWN0Jywge1xuICAgICAgICBlbnZpcm9ubWVudDogJ3Byb2QnLFxuICAgICAgICBkb21haW5QcmVmaXg6ICdteWFwcC1wcm9kJyxcbiAgICAgICAgY2FsbGJhY2tVcmxzOiBbJ2h0dHBzOi8vbXlhcHAuaW8vYXV0aC9jYWxsYmFjayddLFxuICAgICAgICBsb2dvdXRVcmxzOiBbJ2h0dHBzOi8vbXlhcHAuaW8nXSxcbiAgICAgICAgY3VzdG9tRG9tYWluOiB7XG4gICAgICAgICAgZG9tYWluTmFtZTogJ2F1dGgubXlhcHAuaW8nLFxuICAgICAgICAgIGhvc3RlZFpvbmU6IGhvc3RlZFpvbmUsXG4gICAgICAgIH0sXG4gICAgICB9KTtcblxuICAgICAgY29uc3QgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spO1xuXG4gICAgICAvLyBWZXJpZnkgY3VzdG9tIGRvbWFpbiBpcyBjb25maWd1cmVkIHdpdGggVXNlciBQb29sIERvbWFpblxuICAgICAgY29uc3QgZG9tYWlucyA9IHRlbXBsYXRlLmZpbmRSZXNvdXJjZXMoJ0FXUzo6Q29nbml0bzo6VXNlclBvb2xEb21haW4nKTtcbiAgICAgIGNvbnN0IGRvbWFpbktleSA9IE9iamVjdC5rZXlzKGRvbWFpbnMpWzBdO1xuICAgICAgZXhwZWN0KGRvbWFpbnNbZG9tYWluS2V5XS5Qcm9wZXJ0aWVzLkRvbWFpbikudG9CZSgnYXV0aC5teWFwcC5pbycpO1xuXG4gICAgICAvLyBWZXJpZnkgY2VydGlmaWNhdGUgaXMgY3JlYXRlZCBmb3IgdGhlIGN1c3RvbSBkb21haW5cbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpDZXJ0aWZpY2F0ZU1hbmFnZXI6OkNlcnRpZmljYXRlJywge1xuICAgICAgICBEb21haW5OYW1lOiAnYXV0aC5teWFwcC5pbycsXG4gICAgICB9KTtcblxuICAgICAgLy8gVmVyaWZ5IHRoZSBjb25zdHJ1Y3QgZXhwb3NlcyBjdXN0b20gZG9tYWluIHByb3BlcnRpZXMgY29ycmVjdGx5XG4gICAgICBleHBlY3QoYXV0aENvbnN0cnVjdC5jdXN0b21Eb21haW5OYW1lKS50b0JlKCdhdXRoLm15YXBwLmlvJyk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCd2YWxpZGF0ZXMgY3VzdG9tIGRvbWFpbiBjb25maWd1cmF0aW9uIHdpdGggbWlzc2luZyBob3N0ZWQgem9uZScsICgpID0+IHtcbiAgICAgIC8vIFRlc3QgdGhhdCB0aGUgY29uc3RydWN0IGhhbmRsZXMgdW5kZWZpbmVkIGhvc3RlZCB6b25lIGdyYWNlZnVsbHlcbiAgICAgIGV4cGVjdCgoKSA9PiB7XG4gICAgICAgIG5ldyBDb2duaXRvQXV0aENvbnN0cnVjdChzdGFjaywgJ0F1dGhDb25zdHJ1Y3QnLCB7XG4gICAgICAgICAgZW52aXJvbm1lbnQ6ICdwcm9kJyxcbiAgICAgICAgICBkb21haW5QcmVmaXg6ICd0ZXN0LXByb2QnLFxuICAgICAgICAgIGNhbGxiYWNrVXJsczogWydodHRwczovL3Rlc3QuY29tL2F1dGgvY2FsbGJhY2snXSxcbiAgICAgICAgICBsb2dvdXRVcmxzOiBbJ2h0dHBzOi8vdGVzdC5jb20nXSxcbiAgICAgICAgICBjdXN0b21Eb21haW46IHtcbiAgICAgICAgICAgIGRvbWFpbk5hbWU6ICdhdXRoLnRlc3QuY29tJyxcbiAgICAgICAgICAgIGhvc3RlZFpvbmU6IHVuZGVmaW5lZCBhcyB1bmtub3duIGFzIElIb3N0ZWRab25lLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuICAgICAgfSkubm90LnRvVGhyb3coKTsgLy8gQ0RLIHNob3VsZCBoYW5kbGUgdGhpcyBhdCBzeW50aGVzaXMgdGltZVxuICAgIH0pO1xuXG4gICAgdGVzdCgndmFsaWRhdGVzIGVtcHR5IGN1c3RvbSBkb21haW4gbmFtZSBmYWxscyBiYWNrIHRvIGRlZmF1bHQnLCAoKSA9PiB7XG4gICAgICBjb25zdCBob3N0ZWRab25lID0gcm91dGU1My5Ib3N0ZWRab25lLmZyb21Ib3N0ZWRab25lQXR0cmlidXRlcyhzdGFjaywgJ1Rlc3Rab25lJywge1xuICAgICAgICBob3N0ZWRab25lSWQ6ICdaMTIzNDU2Nzg5QUJDJyxcbiAgICAgICAgem9uZU5hbWU6ICdleGFtcGxlLmNvbScsXG4gICAgICB9KTtcblxuICAgICAgbmV3IENvZ25pdG9BdXRoQ29uc3RydWN0KHN0YWNrLCAnQXV0aENvbnN0cnVjdCcsIHtcbiAgICAgICAgZW52aXJvbm1lbnQ6ICdwcm9kJyxcbiAgICAgICAgZG9tYWluUHJlZml4OiAnZXhhbXBsZS1wcm9kJyxcbiAgICAgICAgY2FsbGJhY2tVcmxzOiBbJ2h0dHBzOi8vZXhhbXBsZS5jb20vYXV0aC9jYWxsYmFjayddLFxuICAgICAgICBsb2dvdXRVcmxzOiBbJ2h0dHBzOi8vZXhhbXBsZS5jb20nXSxcbiAgICAgICAgY3VzdG9tRG9tYWluOiB7XG4gICAgICAgICAgZG9tYWluTmFtZTogJycsXG4gICAgICAgICAgaG9zdGVkWm9uZTogaG9zdGVkWm9uZSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjayk7XG5cbiAgICAgIC8vIFNob3VsZCBmYWxsIGJhY2sgdG8gZGVmYXVsdCBkb21haW4gd2hlbiBjdXN0b20gZG9tYWluIG5hbWUgaXMgZW1wdHlcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpDb2duaXRvOjpVc2VyUG9vbERvbWFpbicsIHtcbiAgICAgICAgRG9tYWluOiAnZXhhbXBsZS1wcm9kJyxcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnQ3VzdG9tIERvbWFpbiB3aXRoIERldmVsb3BtZW50IEVudmlyb25tZW50JywgKCkgPT4ge1xuICAgIHRlc3QoJ2lnbm9yZXMgY3VzdG9tIGRvbWFpbiBjb25maWd1cmF0aW9uIGluIGRldmVsb3BtZW50JywgKCkgPT4ge1xuICAgICAgY29uc3QgaG9zdGVkWm9uZSA9IHJvdXRlNTMuSG9zdGVkWm9uZS5mcm9tSG9zdGVkWm9uZUF0dHJpYnV0ZXMoc3RhY2ssICdUZXN0Wm9uZScsIHtcbiAgICAgICAgaG9zdGVkWm9uZUlkOiAnWjEyMzQ1Njc4OUFCQycsXG4gICAgICAgIHpvbmVOYW1lOiAnZGV2LmV4YW1wbGUuY29tJyxcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCBhdXRoQ29uc3RydWN0ID0gbmV3IENvZ25pdG9BdXRoQ29uc3RydWN0KHN0YWNrLCAnQXV0aENvbnN0cnVjdCcsIHtcbiAgICAgICAgZW52aXJvbm1lbnQ6ICdkZXYnLFxuICAgICAgICBkb21haW5QcmVmaXg6ICdleGFtcGxlLWRldicsXG4gICAgICAgIGNhbGxiYWNrVXJsczogW1xuICAgICAgICAgICdodHRwOi8vbG9jYWxob3N0OjMwMDAvYXV0aC9jYWxsYmFjaycsXG4gICAgICAgICAgJ2h0dHBzOi8vZGV2LmV4YW1wbGUuY29tL2F1dGgvY2FsbGJhY2snLFxuICAgICAgICBdLFxuICAgICAgICBsb2dvdXRVcmxzOiBbJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMCcsICdodHRwczovL2Rldi5leGFtcGxlLmNvbSddLFxuICAgICAgICBjdXN0b21Eb21haW46IHtcbiAgICAgICAgICBkb21haW5OYW1lOiAnYXV0aC5kZXYuZXhhbXBsZS5jb20nLFxuICAgICAgICAgIGhvc3RlZFpvbmU6IGhvc3RlZFpvbmUsXG4gICAgICAgIH0sXG4gICAgICB9KTtcblxuICAgICAgY29uc3QgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spO1xuXG4gICAgICAvLyBTaG91bGQgbm90IGNyZWF0ZSBBQ00gY2VydGlmaWNhdGUgaW4gZGV2XG4gICAgICBjb25zdCBjZXJ0aWZpY2F0ZXMgPSB0ZW1wbGF0ZS5maW5kUmVzb3VyY2VzKCdBV1M6OkNlcnRpZmljYXRlTWFuYWdlcjo6Q2VydGlmaWNhdGUnKTtcbiAgICAgIGV4cGVjdChPYmplY3Qua2V5cyhjZXJ0aWZpY2F0ZXMpKS50b0hhdmVMZW5ndGgoMCk7XG5cbiAgICAgIC8vIFNob3VsZCB1c2UgZGVmYXVsdCBDb2duaXRvIGRvbWFpblxuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OkNvZ25pdG86OlVzZXJQb29sRG9tYWluJywge1xuICAgICAgICBEb21haW46ICdleGFtcGxlLWRldicsXG4gICAgICB9KTtcblxuICAgICAgLy8gQ3VzdG9tIGRvbWFpbiBwcm9wZXJ0aWVzIHNob3VsZCBiZSB1bmRlZmluZWQgaW4gZGV2XG4gICAgICBleHBlY3QoYXV0aENvbnN0cnVjdC5jdXN0b21Eb21haW5OYW1lKS50b0JlVW5kZWZpbmVkKCk7XG4gICAgICBleHBlY3QoYXV0aENvbnN0cnVjdC5jdXN0b21Eb21haW5DZXJ0aWZpY2F0ZSkudG9CZVVuZGVmaW5lZCgpO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnQ2xvdWRGb3JtYXRpb24gT3V0cHV0cyBmb3IgQ3VzdG9tIERvbWFpbicsICgpID0+IHtcbiAgICB0ZXN0KCdnZW5lcmF0ZXMgY29ycmVjdCBvdXRwdXRzIGZvciBjdXN0b20gZG9tYWluIGluIHByb2R1Y3Rpb24nLCAoKSA9PiB7XG4gICAgICBjb25zdCBob3N0ZWRab25lID0gcm91dGU1My5Ib3N0ZWRab25lLmZyb21Ib3N0ZWRab25lQXR0cmlidXRlcyhzdGFjaywgJ1Rlc3Rab25lJywge1xuICAgICAgICBob3N0ZWRab25lSWQ6ICdaMTIzNDU2Nzg5QUJDJyxcbiAgICAgICAgem9uZU5hbWU6ICdwcm9kLmV4YW1wbGUuY29tJyxcbiAgICAgIH0pO1xuXG4gICAgICBuZXcgQ29nbml0b0F1dGhDb25zdHJ1Y3Qoc3RhY2ssICdBdXRoQ29uc3RydWN0Jywge1xuICAgICAgICBlbnZpcm9ubWVudDogJ3Byb2QnLFxuICAgICAgICBkb21haW5QcmVmaXg6ICdleGFtcGxlLXByb2QnLFxuICAgICAgICBjYWxsYmFja1VybHM6IFsnaHR0cHM6Ly9wcm9kLmV4YW1wbGUuY29tL2F1dGgvY2FsbGJhY2snXSxcbiAgICAgICAgbG9nb3V0VXJsczogWydodHRwczovL3Byb2QuZXhhbXBsZS5jb20nXSxcbiAgICAgICAgY3VzdG9tRG9tYWluOiB7XG4gICAgICAgICAgZG9tYWluTmFtZTogJ2F1dGgucHJvZC5leGFtcGxlLmNvbScsXG4gICAgICAgICAgaG9zdGVkWm9uZTogaG9zdGVkWm9uZSxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuXG4gICAgICBjb25zdCB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjayk7XG4gICAgICBjb25zdCBvdXRwdXRzID0gdGVtcGxhdGUuZmluZE91dHB1dHMoJyonKTtcblxuICAgICAgLy8gRmluZCB0aGUgaG9zdGVkIFVJIFVSTCBvdXRwdXRcbiAgICAgIGNvbnN0IGhvc3RlZFVJT3V0cHV0ID0gT2JqZWN0LmtleXMob3V0cHV0cykuZmluZCgoa2V5KSA9PlxuICAgICAgICBrZXkuc3RhcnRzV2l0aCgnQXV0aENvbnN0cnVjdENvZ25pdG9Ib3N0ZWRVSVVSTCcpLFxuICAgICAgKTtcbiAgICAgIGV4cGVjdChvdXRwdXRzW2hvc3RlZFVJT3V0cHV0IV0uVmFsdWUpLnRvQmUoJ2h0dHBzOi8vYXV0aC5wcm9kLmV4YW1wbGUuY29tJyk7XG5cbiAgICAgIC8vIEZpbmQgdGhlIGN1c3RvbSBkb21haW4gb3V0cHV0XG4gICAgICBjb25zdCBjdXN0b21Eb21haW5PdXRwdXQgPSBPYmplY3Qua2V5cyhvdXRwdXRzKS5maW5kKChrZXkpID0+XG4gICAgICAgIGtleS5zdGFydHNXaXRoKCdBdXRoQ29uc3RydWN0Q29nbml0b0N1c3RvbURvbWFpbicpLFxuICAgICAgKTtcbiAgICAgIGV4cGVjdChvdXRwdXRzW2N1c3RvbURvbWFpbk91dHB1dCFdLlZhbHVlKS50b0JlKCdhdXRoLnByb2QuZXhhbXBsZS5jb20nKTtcbiAgICB9KTtcblxuICAgIHRlc3QoJ2dlbmVyYXRlcyBjb3JyZWN0IG91dHB1dHMgZm9yIGRlZmF1bHQgZG9tYWluIGluIGRldmVsb3BtZW50JywgKCkgPT4ge1xuICAgICAgbmV3IENvZ25pdG9BdXRoQ29uc3RydWN0KHN0YWNrLCAnQXV0aENvbnN0cnVjdCcsIHtcbiAgICAgICAgZW52aXJvbm1lbnQ6ICdkZXYnLFxuICAgICAgICBkb21haW5QcmVmaXg6ICdleGFtcGxlLWRldicsXG4gICAgICAgIGNhbGxiYWNrVXJsczogW1xuICAgICAgICAgICdodHRwOi8vbG9jYWxob3N0OjMwMDAvYXV0aC9jYWxsYmFjaycsXG4gICAgICAgICAgJ2h0dHBzOi8vZGV2LmV4YW1wbGUuY29tL2F1dGgvY2FsbGJhY2snLFxuICAgICAgICBdLFxuICAgICAgICBsb2dvdXRVcmxzOiBbJ2h0dHA6Ly9sb2NhbGhvc3Q6MzAwMCcsICdodHRwczovL2Rldi5leGFtcGxlLmNvbSddLFxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrKTtcbiAgICAgIGNvbnN0IG91dHB1dHMgPSB0ZW1wbGF0ZS5maW5kT3V0cHV0cygnKicpO1xuXG4gICAgICAvLyBGaW5kIHRoZSBob3N0ZWQgVUkgVVJMIG91dHB1dFxuICAgICAgY29uc3QgaG9zdGVkVUlPdXRwdXQgPSBPYmplY3Qua2V5cyhvdXRwdXRzKS5maW5kKChrZXkpID0+XG4gICAgICAgIGtleS5zdGFydHNXaXRoKCdBdXRoQ29uc3RydWN0Q29nbml0b0hvc3RlZFVJVVJMJyksXG4gICAgICApO1xuICAgICAgZXhwZWN0KG91dHB1dHNbaG9zdGVkVUlPdXRwdXQhXS5WYWx1ZSkudG9Db250YWluKFxuICAgICAgICAnZXhhbXBsZS1kZXYuYXV0aC51cy1lYXN0LTEuYW1hem9uY29nbml0by5jb20nLFxuICAgICAgKTtcbiAgICB9KTtcbiAgfSk7XG59KTtcbiJdfQ==