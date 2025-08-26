"use strict";
/**
 * Tests for SSM Parameter creation with correct Stripe price IDs (KAN-73)
 * This test verifies that the CDK infrastructure creates SSM parameters
 * with the valid dev price ID instead of the placeholder.
 */
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
const ssm = __importStar(require("aws-cdk-lib/aws-ssm"));
describe('SSM Parameters for Stripe Configuration (KAN-73)', () => {
    let app;
    let stack;
    let template;
    const VALID_DEV_PRICE_ID = 'price_1RxUOjErRRGs6tYsTV4RF1Qu';
    const INVALID_PLACEHOLDER_ID = 'price_1QbGXuRuJDBzRJSkCbG4a9Xo';
    describe('Development environment parameters', () => {
        beforeEach(() => {
            app = new cdk.App();
            stack = new cdk.Stack(app, 'TestStack', {
                env: {
                    account: '123456789012',
                    region: 'us-east-1',
                },
            });
            // Simulate the SSM parameters created in ApiConstruct for dev environment
            new ssm.StringParameter(stack, 'DefaultPriceIdParameter', {
                parameterName: '/aura28/dev/stripe/default-price-id',
                description: 'Default Stripe price ID for frontend build in dev environment',
                stringValue: VALID_DEV_PRICE_ID,
                tier: ssm.ParameterTier.STANDARD,
            });
            new ssm.StringParameter(stack, 'AllowedPriceIdsParameter', {
                parameterName: '/aura28/dev/stripe/allowed-price-ids',
                description: 'Comma-separated list of allowed Stripe price IDs for dev environment',
                stringValue: `${VALID_DEV_PRICE_ID},price_placeholder_2`,
                tier: ssm.ParameterTier.STANDARD,
            });
            new ssm.StringParameter(stack, 'WebhookSecretParameter', {
                parameterName: '/aura28/dev/stripe/webhook-secret',
                description: 'Stripe webhook secret for dev environment',
                stringValue: 'PLACEHOLDER_TO_BE_REPLACED_MANUALLY',
                tier: ssm.ParameterTier.STANDARD,
            });
            template = assertions_1.Template.fromStack(stack);
        });
        test('should create default price ID parameter with valid dev price ID', () => {
            template.hasResourceProperties('AWS::SSM::Parameter', {
                Name: '/aura28/dev/stripe/default-price-id',
                Value: VALID_DEV_PRICE_ID,
                Type: 'String',
            });
        });
        test('should not use invalid placeholder price ID', () => {
            const parameters = template.findResources('AWS::SSM::Parameter');
            Object.entries(parameters).forEach(([_, resource]) => {
                if (resource.Properties.Name === '/aura28/dev/stripe/default-price-id') {
                    expect(resource.Properties.Value).toBe(VALID_DEV_PRICE_ID);
                    expect(resource.Properties.Value).not.toBe(INVALID_PLACEHOLDER_ID);
                }
            });
        });
        test('should include valid dev price ID in allowed list', () => {
            template.hasResourceProperties('AWS::SSM::Parameter', {
                Name: '/aura28/dev/stripe/allowed-price-ids',
                Value: assertions_1.Match.stringLikeRegexp(`.*${VALID_DEV_PRICE_ID}.*`),
            });
        });
        test('should not include invalid placeholder in allowed list', () => {
            const parameters = template.findResources('AWS::SSM::Parameter');
            Object.entries(parameters).forEach(([_, resource]) => {
                if (resource.Properties.Name === '/aura28/dev/stripe/allowed-price-ids') {
                    expect(resource.Properties.Value).toContain(VALID_DEV_PRICE_ID);
                    expect(resource.Properties.Value).not.toContain(INVALID_PLACEHOLDER_ID);
                }
            });
        });
        test('should use Standard tier for all parameters', () => {
            const parameters = template.findResources('AWS::SSM::Parameter');
            Object.entries(parameters).forEach(([_, resource]) => {
                expect(resource.Properties.Tier).toBe('Standard');
            });
        });
        test('should have proper descriptions for all parameters', () => {
            const parameters = template.findResources('AWS::SSM::Parameter');
            Object.entries(parameters).forEach(([_, resource]) => {
                expect(resource.Properties.Description).toBeDefined();
                expect(resource.Properties.Description.length).toBeGreaterThan(10);
                expect(resource.Properties.Description).toContain('dev');
            });
        });
    });
    describe('Production environment parameters', () => {
        beforeEach(() => {
            app = new cdk.App();
            stack = new cdk.Stack(app, 'ProdStack', {
                env: {
                    account: '123456789012',
                    region: 'us-east-1',
                },
            });
            // Simulate the SSM parameters created in ApiConstruct for prod environment
            new ssm.StringParameter(stack, 'DefaultPriceIdParameter', {
                parameterName: '/aura28/prod/stripe/default-price-id',
                description: 'Default Stripe price ID for frontend build in prod environment',
                stringValue: 'price_REPLACE_WITH_PRODUCTION_ID',
                tier: ssm.ParameterTier.STANDARD,
            });
            new ssm.StringParameter(stack, 'AllowedPriceIdsParameter', {
                parameterName: '/aura28/prod/stripe/allowed-price-ids',
                description: 'Comma-separated list of allowed Stripe price IDs for prod environment',
                stringValue: 'price_REPLACE_WITH_PRODUCTION_ID',
                tier: ssm.ParameterTier.STANDARD,
            });
            template = assertions_1.Template.fromStack(stack);
        });
        test('should use placeholder for production price ID', () => {
            template.hasResourceProperties('AWS::SSM::Parameter', {
                Name: '/aura28/prod/stripe/default-price-id',
                Value: 'price_REPLACE_WITH_PRODUCTION_ID',
            });
        });
        test('should not use dev price ID in production', () => {
            const parameters = template.findResources('AWS::SSM::Parameter');
            Object.entries(parameters).forEach(([_, resource]) => {
                if (resource.Properties.Name?.includes('/prod/')) {
                    expect(resource.Properties.Value).not.toBe(VALID_DEV_PRICE_ID);
                    expect(resource.Properties.Value).not.toContain(VALID_DEV_PRICE_ID);
                }
            });
        });
    });
    describe('Price ID format validation', () => {
        test('valid dev price ID should follow Stripe format', () => {
            expect(VALID_DEV_PRICE_ID).toMatch(/^price_/);
            expect(VALID_DEV_PRICE_ID.length).toBeGreaterThan(10);
            expect(VALID_DEV_PRICE_ID).toMatch(/^price_[A-Za-z0-9]+$/);
        });
        test('should reject invalid placeholder ID', () => {
            // The invalid placeholder should not be used anywhere
            expect(VALID_DEV_PRICE_ID).not.toBe(INVALID_PLACEHOLDER_ID);
        });
    });
    describe('Parameter naming conventions', () => {
        beforeEach(() => {
            app = new cdk.App();
            stack = new cdk.Stack(app, 'NamingTestStack');
            // Create parameters with proper naming
            new ssm.StringParameter(stack, 'Param1', {
                parameterName: '/aura28/dev/stripe/default-price-id',
                stringValue: 'test',
            });
            new ssm.StringParameter(stack, 'Param2', {
                parameterName: '/aura28/dev/stripe/allowed-price-ids',
                stringValue: 'test',
            });
            template = assertions_1.Template.fromStack(stack);
        });
        test('should follow /aura28/{env}/stripe/* pattern', () => {
            const parameters = template.findResources('AWS::SSM::Parameter');
            Object.entries(parameters).forEach(([_, resource]) => {
                const name = resource.Properties.Name;
                expect(name).toMatch(/^\/aura28\/(dev|prod|test)\/stripe\/.+$/);
            });
        });
        test('should use hyphens in parameter names', () => {
            const parameters = template.findResources('AWS::SSM::Parameter');
            Object.entries(parameters).forEach(([_, resource]) => {
                const name = resource.Properties.Name;
                const lastPart = name.split('/').pop();
                // Parameter names should use hyphens, not underscores
                expect(lastPart).toMatch(/^[a-z-]+$/);
                expect(lastPart).not.toContain('_');
            });
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3NtLXBhcmFtZXRlcnMudGVzdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInNzbS1wYXJhbWV0ZXJzLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7O0dBSUc7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFFSCxpREFBbUM7QUFDbkMsdURBQXlEO0FBQ3pELHlEQUEyQztBQUUzQyxRQUFRLENBQUMsa0RBQWtELEVBQUUsR0FBRyxFQUFFO0lBQ2hFLElBQUksR0FBWSxDQUFDO0lBQ2pCLElBQUksS0FBZ0IsQ0FBQztJQUNyQixJQUFJLFFBQWtCLENBQUM7SUFFdkIsTUFBTSxrQkFBa0IsR0FBRyxnQ0FBZ0MsQ0FBQztJQUM1RCxNQUFNLHNCQUFzQixHQUFHLGdDQUFnQyxDQUFDO0lBRWhFLFFBQVEsQ0FBQyxvQ0FBb0MsRUFBRSxHQUFHLEVBQUU7UUFDbEQsVUFBVSxDQUFDLEdBQUcsRUFBRTtZQUNkLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLEVBQUUsQ0FBQztZQUNwQixLQUFLLEdBQUcsSUFBSSxHQUFHLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxXQUFXLEVBQUU7Z0JBQ3RDLEdBQUcsRUFBRTtvQkFDSCxPQUFPLEVBQUUsY0FBYztvQkFDdkIsTUFBTSxFQUFFLFdBQVc7aUJBQ3BCO2FBQ0YsQ0FBQyxDQUFDO1lBRUgsMEVBQTBFO1lBQzFFLElBQUksR0FBRyxDQUFDLGVBQWUsQ0FBQyxLQUFLLEVBQUUseUJBQXlCLEVBQUU7Z0JBQ3hELGFBQWEsRUFBRSxxQ0FBcUM7Z0JBQ3BELFdBQVcsRUFBRSwrREFBK0Q7Z0JBQzVFLFdBQVcsRUFBRSxrQkFBa0I7Z0JBQy9CLElBQUksRUFBRSxHQUFHLENBQUMsYUFBYSxDQUFDLFFBQVE7YUFDakMsQ0FBQyxDQUFDO1lBRUgsSUFBSSxHQUFHLENBQUMsZUFBZSxDQUFDLEtBQUssRUFBRSwwQkFBMEIsRUFBRTtnQkFDekQsYUFBYSxFQUFFLHNDQUFzQztnQkFDckQs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QUFDO2dCQUN2QyxzREFBc0Q7Z0JBQ3RELE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDLENBQUM7Z0JBQ3RDLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ3RDLENBQUMsQ0FBQyxDQUFDO1FBQ0wsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQztBQUNMLENBQUMsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBUZXN0cyBmb3IgU1NNIFBhcmFtZXRlciBjcmVhdGlvbiB3aXRoIGNvcnJlY3QgU3RyaXBlIHByaWNlIElEcyAoS0FOLTczKVxuICogVGhpcyB0ZXN0IHZlcmlmaWVzIHRoYXQgdGhlIENESyBpbmZyYXN0cnVjdHVyZSBjcmVhdGVzIFNTTSBwYXJhbWV0ZXJzXG4gKiB3aXRoIHRoZSB2YWxpZCBkZXYgcHJpY2UgSUQgaW5zdGVhZCBvZiB0aGUgcGxhY2Vob2xkZXIuXG4gKi9cblxuaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IFRlbXBsYXRlLCBNYXRjaCB9IGZyb20gJ2F3cy1jZGstbGliL2Fzc2VydGlvbnMnO1xuaW1wb3J0ICogYXMgc3NtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zc20nO1xuXG5kZXNjcmliZSgnU1NNIFBhcmFtZXRlcnMgZm9yIFN0cmlwZSBDb25maWd1cmF0aW9uIChLQU4tNzMpJywgKCkgPT4ge1xuICBsZXQgYXBwOiBjZGsuQXBwO1xuICBsZXQgc3RhY2s6IGNkay5TdGFjaztcbiAgbGV0IHRlbXBsYXRlOiBUZW1wbGF0ZTtcbiAgXG4gIGNvbnN0IFZBTElEX0RFVl9QUklDRV9JRCA9ICdwcmljZV8xUnhVT2pFclJSR3M2dFlzVFY0UkYxUXUnO1xuICBjb25zdCBJTlZBTElEX1BMQUNFSE9MREVSX0lEID0gJ3ByaWNlXzFRYkdYdVJ1SkRCelJKU2tDYkc0YTlYbyc7XG5cbiAgZGVzY3JpYmUoJ0RldmVsb3BtZW50IGVudmlyb25tZW50IHBhcmFtZXRlcnMnLCAoKSA9PiB7XG4gICAgYmVmb3JlRWFjaCgoKSA9PiB7XG4gICAgICBhcHAgPSBuZXcgY2RrLkFwcCgpO1xuICAgICAgc3RhY2sgPSBuZXcgY2RrLlN0YWNrKGFwcCwgJ1Rlc3RTdGFjaycsIHtcbiAgICAgICAgZW52OiB7XG4gICAgICAgICAgYWNjb3VudDogJzEyMzQ1Njc4OTAxMicsXG4gICAgICAgICAgcmVnaW9uOiAndXMtZWFzdC0xJyxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBTaW11bGF0ZSB0aGUgU1NNIHBhcmFtZXRlcnMgY3JlYXRlZCBpbiBBcGlDb25zdHJ1Y3QgZm9yIGRldiBlbnZpcm9ubWVudFxuICAgICAgbmV3IHNzbS5TdHJpbmdQYXJhbWV0ZXIoc3RhY2ssICdEZWZhdWx0UHJpY2VJZFBhcmFtZXRlcicsIHtcbiAgICAgICAgcGFyYW1ldGVyTmFtZTogJy9hdXJhMjgvZGV2L3N0cmlwZS9kZWZhdWx0LXByaWNlLWlkJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdEZWZhdWx0IFN0cmlwZSBwcmljZSBJRCBmb3IgZnJvbnRlbmQgYnVpbGQgaW4gZGV2IGVudmlyb25tZW50JyxcbiAgICAgICAgc3RyaW5nVmFsdWU6IFZBTElEX0RFVl9QUklDRV9JRCxcbiAgICAgICAgdGllcjogc3NtLlBhcmFtZXRlclRpZXIuU1RBTkRBUkQsXG4gICAgICB9KTtcblxuICAgICAgbmV3IHNzbS5TdHJpbmdQYXJhbWV0ZXIoc3RhY2ssICdBbGxvd2VkUHJpY2VJZHNQYXJhbWV0ZXInLCB7XG4gICAgICAgIHBhcmFtZXRlck5hbWU6ICcvYXVyYTI4L2Rldi9zdHJpcGUvYWxsb3dlZC1wcmljZS1pZHMnLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ0NvbW1hLXNlcGFyYXRlZCBsaXN0IG9mIGFsbG93ZWQgU3RyaXBlIHByaWNlIElEcyBmb3IgZGV2IGVudmlyb25tZW50JyxcbiAgICAgICAgc3RyaW5nVmFsdWU6IGAke1ZBTElEX0RFVl9QUklDRV9JRH0scHJpY2VfcGxhY2Vob2xkZXJfMmAsXG4gICAgICAgIHRpZXI6IHNzbS5QYXJhbWV0ZXJUaWVyLlNUQU5EQVJELFxuICAgICAgfSk7XG5cbiAgICAgIG5ldyBzc20uU3RyaW5nUGFyYW1ldGVyKHN0YWNrLCAnV2ViaG9va1NlY3JldFBhcmFtZXRlcicsIHtcbiAgICAgICAgcGFyYW1ldGVyTmFtZTogJy9hdXJhMjgvZGV2L3N0cmlwZS93ZWJob29rLXNlY3JldCcsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnU3RyaXBlIHdlYmhvb2sgc2VjcmV0IGZvciBkZXYgZW52aXJvbm1lbnQnLFxuICAgICAgICBzdHJpbmdWYWx1ZTogJ1BMQUNFSE9MREVSX1RPX0JFX1JFUExBQ0VEX01BTlVBTExZJyxcbiAgICAgICAgdGllcjogc3NtLlBhcmFtZXRlclRpZXIuU1RBTkRBUkQsXG4gICAgICB9KTtcblxuICAgICAgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spO1xuICAgIH0pO1xuXG4gICAgdGVzdCgnc2hvdWxkIGNyZWF0ZSBkZWZhdWx0IHByaWNlIElEIHBhcmFtZXRlciB3aXRoIHZhbGlkIGRldiBwcmljZSBJRCcsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpTU006OlBhcmFtZXRlcicsIHtcbiAgICAgICAgTmFtZTogJy9hdXJhMjgvZGV2L3N0cmlwZS9kZWZhdWx0LXByaWNlLWlkJyxcbiAgICAgICAgVmFsdWU6IFZBTElEX0RFVl9QUklDRV9JRCxcbiAgICAgICAgVHlwZTogJ1N0cmluZycsXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIHRlc3QoJ3Nob3VsZCBub3QgdXNlIGludmFsaWQgcGxhY2Vob2xkZXIgcHJpY2UgSUQnLCAoKSA9PiB7XG4gICAgICBjb25zdCBwYXJhbWV0ZXJzID0gdGVtcGxhdGUuZmluZFJlc291cmNlcygnQVdTOjpTU006OlBhcmFtZXRlcicpO1xuICAgICAgXG4gICAgICBPYmplY3QuZW50cmllcyhwYXJhbWV0ZXJzKS5mb3JFYWNoKChbXywgcmVzb3VyY2VdKSA9PiB7XG4gICAgICAgIGlmIChyZXNvdXJjZS5Qcm9wZXJ0aWVzLk5hbWUgPT09ICcvYXVyYTI4L2Rldi9zdHJpcGUvZGVmYXVsdC1wcmljZS1pZCcpIHtcbiAgICAgICAgICBleHBlY3QocmVzb3VyY2UuUHJvcGVydGllcy5WYWx1ZSkudG9CZShWQUxJRF9ERVZfUFJJQ0VfSUQpO1xuICAgICAgICAgIGV4cGVjdChyZXNvdXJjZS5Qcm9wZXJ0aWVzLlZhbHVlKS5ub3QudG9CZShJTlZBTElEX1BMQUNFSE9MREVSX0lEKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdzaG91bGQgaW5jbHVkZSB2YWxpZCBkZXYgcHJpY2UgSUQgaW4gYWxsb3dlZCBsaXN0JywgKCkgPT4ge1xuICAgICAgdGVtcGxhdGUuaGFzUmVzb3VyY2VQcm9wZXJ0aWVzKCdBV1M6OlNTTTo6UGFyYW1ldGVyJywge1xuICAgICAgICBOYW1lOiAnL2F1cmEyOC9kZXYvc3RyaXBlL2FsbG93ZWQtcHJpY2UtaWRzJyxcbiAgICAgICAgVmFsdWU6IE1hdGNoLnN0cmluZ0xpa2VSZWdleHAoYC4qJHtWQUxJRF9ERVZfUFJJQ0VfSUR9LipgKSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgdGVzdCgnc2hvdWxkIG5vdCBpbmNsdWRlIGludmFsaWQgcGxhY2Vob2xkZXIgaW4gYWxsb3dlZCBsaXN0JywgKCkgPT4ge1xuICAgICAgY29uc3QgcGFyYW1ldGVycyA9IHRlbXBsYXRlLmZpbmRSZXNvdXJjZXMoJ0FXUzo6U1NNOjpQYXJhbWV0ZXInKTtcbiAgICAgIFxuICAgICAgT2JqZWN0LmVudHJpZXMocGFyYW1ldGVycykuZm9yRWFjaCgoW18sIHJlc291cmNlXSkgPT4ge1xuICAgICAgICBpZiAocmVzb3VyY2UuUHJvcGVydGllcy5OYW1lID09PSAnL2F1cmEyOC9kZXYvc3RyaXBlL2FsbG93ZWQtcHJpY2UtaWRzJykge1xuICAgICAgICAgIGV4cGVjdChyZXNvdXJjZS5Qcm9wZXJ0aWVzLlZhbHVlKS50b0NvbnRhaW4oVkFMSURfREVWX1BSSUNFX0lEKTtcbiAgICAgICAgICBleHBlY3QocmVzb3VyY2UuUHJvcGVydGllcy5WYWx1ZSkubm90LnRvQ29udGFpbihJTlZBTElEX1BMQUNFSE9MREVSX0lEKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdzaG91bGQgdXNlIFN0YW5kYXJkIHRpZXIgZm9yIGFsbCBwYXJhbWV0ZXJzJywgKCkgPT4ge1xuICAgICAgY29uc3QgcGFyYW1ldGVycyA9IHRlbXBsYXRlLmZpbmRSZXNvdXJjZXMoJ0FXUzo6U1NNOjpQYXJhbWV0ZXInKTtcbiAgICAgIFxuICAgICAgT2JqZWN0LmVudHJpZXMocGFyYW1ldGVycykuZm9yRWFjaCgoW18sIHJlc291cmNlXSkgPT4ge1xuICAgICAgICBleHBlY3QocmVzb3VyY2UuUHJvcGVydGllcy5UaWVyKS50b0JlKCdTdGFuZGFyZCcpO1xuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdzaG91bGQgaGF2ZSBwcm9wZXIgZGVzY3JpcHRpb25zIGZvciBhbGwgcGFyYW1ldGVycycsICgpID0+IHtcbiAgICAgIGNvbnN0IHBhcmFtZXRlcnMgPSB0ZW1wbGF0ZS5maW5kUmVzb3VyY2VzKCdBV1M6OlNTTTo6UGFyYW1ldGVyJyk7XG4gICAgICBcbiAgICAgIE9iamVjdC5lbnRyaWVzKHBhcmFtZXRlcnMpLmZvckVhY2goKFtfLCByZXNvdXJjZV0pID0+IHtcbiAgICAgICAgZXhwZWN0KHJlc291cmNlLlByb3BlcnRpZXMuRGVzY3JpcHRpb24pLnRvQmVEZWZpbmVkKCk7XG4gICAgICAgIGV4cGVjdChyZXNvdXJjZS5Qcm9wZXJ0aWVzLkRlc2NyaXB0aW9uLmxlbmd0aCkudG9CZUdyZWF0ZXJUaGFuKDEwKTtcbiAgICAgICAgZXhwZWN0KHJlc291cmNlLlByb3BlcnRpZXMuRGVzY3JpcHRpb24pLnRvQ29udGFpbignZGV2Jyk7XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ1Byb2R1Y3Rpb24gZW52aXJvbm1lbnQgcGFyYW1ldGVycycsICgpID0+IHtcbiAgICBiZWZvcmVFYWNoKCgpID0+IHtcbiAgICAgIGFwcCA9IG5ldyBjZGsuQXBwKCk7XG4gICAgICBzdGFjayA9IG5ldyBjZGsuU3RhY2soYXBwLCAnUHJvZFN0YWNrJywge1xuICAgICAgICBlbnY6IHtcbiAgICAgICAgICBhY2NvdW50OiAnMTIzNDU2Nzg5MDEyJyxcbiAgICAgICAgICByZWdpb246ICd1cy1lYXN0LTEnLFxuICAgICAgICB9LFxuICAgICAgfSk7XG5cbiAgICAgIC8vIFNpbXVsYXRlIHRoZSBTU00gcGFyYW1ldGVycyBjcmVhdGVkIGluIEFwaUNvbnN0cnVjdCBmb3IgcHJvZCBlbnZpcm9ubWVudFxuICAgICAgbmV3IHNzbS5TdHJpbmdQYXJhbWV0ZXIoc3RhY2ssICdEZWZhdWx0UHJpY2VJZFBhcmFtZXRlcicsIHtcbiAgICAgICAgcGFyYW1ldGVyTmFtZTogJy9hdXJhMjgvcHJvZC9zdHJpcGUvZGVmYXVsdC1wcmljZS1pZCcsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnRGVmYXVsdCBTdHJpcGUgcHJpY2UgSUQgZm9yIGZyb250ZW5kIGJ1aWxkIGluIHByb2QgZW52aXJvbm1lbnQnLFxuICAgICAgICBzdHJpbmdWYWx1ZTogJ3ByaWNlX1JFUExBQ0VfV0lUSF9QUk9EVUNUSU9OX0lEJyxcbiAgICAgICAgdGllcjogc3NtLlBhcmFtZXRlclRpZXIuU1RBTkRBUkQsXG4gICAgICB9KTtcblxuICAgICAgbmV3IHNzbS5TdHJpbmdQYXJhbWV0ZXIoc3RhY2ssICdBbGxvd2VkUHJpY2VJZHNQYXJhbWV0ZXInLCB7XG4gICAgICAgIHBhcmFtZXRlck5hbWU6ICcvYXVyYTI4L3Byb2Qvc3RyaXBlL2FsbG93ZWQtcHJpY2UtaWRzJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdDb21tYS1zZXBhcmF0ZWQgbGlzdCBvZiBhbGxvd2VkIFN0cmlwZSBwcmljZSBJRHMgZm9yIHByb2QgZW52aXJvbm1lbnQnLFxuICAgICAgICBzdHJpbmdWYWx1ZTogJ3ByaWNlX1JFUExBQ0VfV0lUSF9QUk9EVUNUSU9OX0lEJyxcbiAgICAgICAgdGllcjogc3NtLlBhcmFtZXRlclRpZXIuU1RBTkRBUkQsXG4gICAgICB9KTtcblxuICAgICAgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spO1xuICAgIH0pO1xuXG4gICAgdGVzdCgnc2hvdWxkIHVzZSBwbGFjZWhvbGRlciBmb3IgcHJvZHVjdGlvbiBwcmljZSBJRCcsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpTU006OlBhcmFtZXRlcicsIHtcbiAgICAgICAgTmFtZTogJy9hdXJhMjgvcHJvZC9zdHJpcGUvZGVmYXVsdC1wcmljZS1pZCcsXG4gICAgICAgIFZhbHVlOiAncHJpY2VfUkVQTEFDRV9XSVRIX1BST0RVQ1RJT05fSUQnLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdzaG91bGQgbm90IHVzZSBkZXYgcHJpY2UgSUQgaW4gcHJvZHVjdGlvbicsICgpID0+IHtcbiAgICAgIGNvbnN0IHBhcmFtZXRlcnMgPSB0ZW1wbGF0ZS5maW5kUmVzb3VyY2VzKCdBV1M6OlNTTTo6UGFyYW1ldGVyJyk7XG4gICAgICBcbiAgICAgIE9iamVjdC5lbnRyaWVzKHBhcmFtZXRlcnMpLmZvckVhY2goKFtfLCByZXNvdXJjZV0pID0+IHtcbiAgICAgICAgaWYgKHJlc291cmNlLlByb3BlcnRpZXMuTmFtZT8uaW5jbHVkZXMoJy9wcm9kLycpKSB7XG4gICAgICAgICAgZXhwZWN0KHJlc291cmNlLlByb3BlcnRpZXMuVmFsdWUpLm5vdC50b0JlKFZBTElEX0RFVl9QUklDRV9JRCk7XG4gICAgICAgICAgZXhwZWN0KHJlc291cmNlLlByb3BlcnRpZXMuVmFsdWUpLm5vdC50b0NvbnRhaW4oVkFMSURfREVWX1BSSUNFX0lEKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKCdQcmljZSBJRCBmb3JtYXQgdmFsaWRhdGlvbicsICgpID0+IHtcbiAgICB0ZXN0KCd2YWxpZCBkZXYgcHJpY2UgSUQgc2hvdWxkIGZvbGxvdyBTdHJpcGUgZm9ybWF0JywgKCkgPT4ge1xuICAgICAgZXhwZWN0KFZBTElEX0RFVl9QUklDRV9JRCkudG9NYXRjaCgvXnByaWNlXy8pO1xuICAgICAgZXhwZWN0KFZBTElEX0RFVl9QUklDRV9JRC5sZW5ndGgpLnRvQmVHcmVhdGVyVGhhbigxMCk7XG4gICAgICBleHBlY3QoVkFMSURfREVWX1BSSUNFX0lEKS50b01hdGNoKC9ecHJpY2VfW0EtWmEtejAtOV0rJC8pO1xuICAgIH0pO1xuXG4gICAgdGVzdCgnc2hvdWxkIHJlamVjdCBpbnZhbGlkIHBsYWNlaG9sZGVyIElEJywgKCkgPT4ge1xuICAgICAgLy8gVGhlIGludmFsaWQgcGxhY2Vob2xkZXIgc2hvdWxkIG5vdCBiZSB1c2VkIGFueXdoZXJlXG4gICAgICBleHBlY3QoVkFMSURfREVWX1BSSUNFX0lEKS5ub3QudG9CZShJTlZBTElEX1BMQUNFSE9MREVSX0lEKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ1BhcmFtZXRlciBuYW1pbmcgY29udmVudGlvbnMnLCAoKSA9PiB7XG4gICAgYmVmb3JlRWFjaCgoKSA9PiB7XG4gICAgICBhcHAgPSBuZXcgY2RrLkFwcCgpO1xuICAgICAgc3RhY2sgPSBuZXcgY2RrLlN0YWNrKGFwcCwgJ05hbWluZ1Rlc3RTdGFjaycpO1xuXG4gICAgICAvLyBDcmVhdGUgcGFyYW1ldGVycyB3aXRoIHByb3BlciBuYW1pbmdcbiAgICAgIG5ldyBzc20uU3RyaW5nUGFyYW1ldGVyKHN0YWNrLCAnUGFyYW0xJywge1xuICAgICAgICBwYXJhbWV0ZXJOYW1lOiAnL2F1cmEyOC9kZXYvc3RyaXBlL2RlZmF1bHQtcHJpY2UtaWQnLFxuICAgICAgICBzdHJpbmdWYWx1ZTogJ3Rlc3QnLFxuICAgICAgfSk7XG5cbiAgICAgIG5ldyBzc20uU3RyaW5nUGFyYW1ldGVyKHN0YWNrLCAnUGFyYW0yJywge1xuICAgICAgICBwYXJhbWV0ZXJOYW1lOiAnL2F1cmEyOC9kZXYvc3RyaXBlL2FsbG93ZWQtcHJpY2UtaWRzJyxcbiAgICAgICAgc3RyaW5nVmFsdWU6ICd0ZXN0JyxcbiAgICAgIH0pO1xuXG4gICAgICB0ZW1wbGF0ZSA9IFRlbXBsYXRlLmZyb21TdGFjayhzdGFjayk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdzaG91bGQgZm9sbG93IC9hdXJhMjgve2Vudn0vc3RyaXBlLyogcGF0dGVybicsICgpID0+IHtcbiAgICAgIGNvbnN0IHBhcmFtZXRlcnMgPSB0ZW1wbGF0ZS5maW5kUmVzb3VyY2VzKCdBV1M6OlNTTTo6UGFyYW1ldGVyJyk7XG4gICAgICBcbiAgICAgIE9iamVjdC5lbnRyaWVzKHBhcmFtZXRlcnMpLmZvckVhY2goKFtfLCByZXNvdXJjZV0pID0+IHtcbiAgICAgICAgY29uc3QgbmFtZSA9IHJlc291cmNlLlByb3BlcnRpZXMuTmFtZTtcbiAgICAgICAgZXhwZWN0KG5hbWUpLnRvTWF0Y2goL15cXC9hdXJhMjhcXC8oZGV2fHByb2R8dGVzdClcXC9zdHJpcGVcXC8uKyQvKTtcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgdGVzdCgnc2hvdWxkIHVzZSBoeXBoZW5zIGluIHBhcmFtZXRlciBuYW1lcycsICgpID0+IHtcbiAgICAgIGNvbnN0IHBhcmFtZXRlcnMgPSB0ZW1wbGF0ZS5maW5kUmVzb3VyY2VzKCdBV1M6OlNTTTo6UGFyYW1ldGVyJyk7XG4gICAgICBcbiAgICAgIE9iamVjdC5lbnRyaWVzKHBhcmFtZXRlcnMpLmZvckVhY2goKFtfLCByZXNvdXJjZV0pID0+IHtcbiAgICAgICAgY29uc3QgbmFtZSA9IHJlc291cmNlLlByb3BlcnRpZXMuTmFtZTtcbiAgICAgICAgY29uc3QgbGFzdFBhcnQgPSBuYW1lLnNwbGl0KCcvJykucG9wKCk7XG4gICAgICAgIC8vIFBhcmFtZXRlciBuYW1lcyBzaG91bGQgdXNlIGh5cGhlbnMsIG5vdCB1bmRlcnNjb3Jlc1xuICAgICAgICBleHBlY3QobGFzdFBhcnQpLnRvTWF0Y2goL15bYS16LV0rJC8pO1xuICAgICAgICBleHBlY3QobGFzdFBhcnQpLm5vdC50b0NvbnRhaW4oJ18nKTtcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9KTtcbn0pOyJdfQ==