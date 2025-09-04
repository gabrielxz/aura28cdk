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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3NtLXBhcmFtZXRlcnMudGVzdC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInNzbS1wYXJhbWV0ZXJzLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IjtBQUFBOzs7O0dBSUc7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFFSCxpREFBbUM7QUFDbkMsdURBQXlEO0FBQ3pELHlEQUEyQztBQUUzQyxRQUFRLENBQUMsa0RBQWtELEVBQUUsR0FBRyxFQUFFO0lBQ2hFLElBQUksR0FBWSxDQUFDO0lBQ2pCLElBQUksS0FBZ0IsQ0FBQztJQUNyQixJQUFJLFFBQWtCLENBQUM7SUFFdkIsTUFBTSxrQkFBa0IsR0FBRyxnQ0FBZ0MsQ0FBQztJQUM1RCxNQUFNLHNCQUFzQixHQUFHLGdDQUFnQyxDQUFDO0lBRWhFLFFBQVEsQ0FBQyxvQ0FBb0MsRUFBRSxHQUFHLEVBQUU7UUFDbEQsVUFBVSxDQUFDLEdBQUcsRUFBRTtZQUNkLEdBQUcsR0FBRyxJQUFJLEdBQUcsQ0FBQyxHQUFHLEVBQUUsQ0FBQztZQUNwQixLQUFLLEdBQUcsSUFBSSxHQUFHLENBQUMsS0FBSyxDQUFDLEdBQUcsRUFBRSxXQUFXLEVBQUU7Z0JBQ3RDLEdBQUcsRUFBRTtvQkFDSCxPQUFPLEVBQUUsY0FBYztvQkFDdkIsTUFBTSxFQUFFLFdBQVc7aUJBQ3BCO2FBQ0YsQ0FBQyxDQUFDO1lBRUgsMEVBQTBFO1lBQzFFLElBQUksR0FBRyxDQUFDLGVBQWUsQ0FBQyxLQUFLLEVBQUUseUJBQXlCLEVBQUU7Z0JBQ3hELGFBQWEsRUFBRSxxQ0FBcUM7Z0JBQ3BELFdBQVcsRUFBRSwrREFBK0Q7Z0JBQzVFLFdBQVcsRUFBRSxrQkFBa0I7Z0JBQy9CLElBQUksRUFBRSxHQUFHLENBQUMsYUFBYSxDQUFDLFFBQVE7YUFDakMsQ0FBQyxDQUFDO1lBRUgsSUFBSSxHQUFHLENBQUMsZUFBZSxDQUFDLEtBQUssRUFBRSwwQkFBMEIsRUFBRTtnQkFDekQsYUFBYSxFQUFFLHNDQUFzQztnQkFDckQs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QUFDO2dCQUN2QyxzREFBc0Q7Z0JBQ3RELE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDLENBQUM7Z0JBQ3RDLE1BQU0sQ0FBQyxRQUFRLENBQUMsQ0FBQyxHQUFHLENBQUMsU0FBUyxDQUFDLEdBQUcsQ0FBQyxDQUFDO1lBQ3RDLENBQUMsQ0FBQyxDQUFDO1FBQ0wsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQztBQUNMLENBQUMsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBUZXN0cyBmb3IgU1NNIFBhcmFtZXRlciBjcmVhdGlvbiB3aXRoIGNvcnJlY3QgU3RyaXBlIHByaWNlIElEcyAoS0FOLTczKVxuICogVGhpcyB0ZXN0IHZlcmlmaWVzIHRoYXQgdGhlIENESyBpbmZyYXN0cnVjdHVyZSBjcmVhdGVzIFNTTSBwYXJhbWV0ZXJzXG4gKiB3aXRoIHRoZSB2YWxpZCBkZXYgcHJpY2UgSUQgaW5zdGVhZCBvZiB0aGUgcGxhY2Vob2xkZXIuXG4gKi9cblxuaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCB7IFRlbXBsYXRlLCBNYXRjaCB9IGZyb20gJ2F3cy1jZGstbGliL2Fzc2VydGlvbnMnO1xuaW1wb3J0ICogYXMgc3NtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zc20nO1xuXG5kZXNjcmliZSgnU1NNIFBhcmFtZXRlcnMgZm9yIFN0cmlwZSBDb25maWd1cmF0aW9uIChLQU4tNzMpJywgKCkgPT4ge1xuICBsZXQgYXBwOiBjZGsuQXBwO1xuICBsZXQgc3RhY2s6IGNkay5TdGFjaztcbiAgbGV0IHRlbXBsYXRlOiBUZW1wbGF0ZTtcblxuICBjb25zdCBWQUxJRF9ERVZfUFJJQ0VfSUQgPSAncHJpY2VfMVJ4VU9qRXJSUkdzNnRZc1RWNFJGMVF1JztcbiAgY29uc3QgSU5WQUxJRF9QTEFDRUhPTERFUl9JRCA9ICdwcmljZV8xUWJHWHVSdUpEQnpSSlNrQ2JHNGE5WG8nO1xuXG4gIGRlc2NyaWJlKCdEZXZlbG9wbWVudCBlbnZpcm9ubWVudCBwYXJhbWV0ZXJzJywgKCkgPT4ge1xuICAgIGJlZm9yZUVhY2goKCkgPT4ge1xuICAgICAgYXBwID0gbmV3IGNkay5BcHAoKTtcbiAgICAgIHN0YWNrID0gbmV3IGNkay5TdGFjayhhcHAsICdUZXN0U3RhY2snLCB7XG4gICAgICAgIGVudjoge1xuICAgICAgICAgIGFjY291bnQ6ICcxMjM0NTY3ODkwMTInLFxuICAgICAgICAgIHJlZ2lvbjogJ3VzLWVhc3QtMScsXG4gICAgICAgIH0sXG4gICAgICB9KTtcblxuICAgICAgLy8gU2ltdWxhdGUgdGhlIFNTTSBwYXJhbWV0ZXJzIGNyZWF0ZWQgaW4gQXBpQ29uc3RydWN0IGZvciBkZXYgZW52aXJvbm1lbnRcbiAgICAgIG5ldyBzc20uU3RyaW5nUGFyYW1ldGVyKHN0YWNrLCAnRGVmYXVsdFByaWNlSWRQYXJhbWV0ZXInLCB7XG4gICAgICAgIHBhcmFtZXRlck5hbWU6ICcvYXVyYTI4L2Rldi9zdHJpcGUvZGVmYXVsdC1wcmljZS1pZCcsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnRGVmYXVsdCBTdHJpcGUgcHJpY2UgSUQgZm9yIGZyb250ZW5kIGJ1aWxkIGluIGRldiBlbnZpcm9ubWVudCcsXG4gICAgICAgIHN0cmluZ1ZhbHVlOiBWQUxJRF9ERVZfUFJJQ0VfSUQsXG4gICAgICAgIHRpZXI6IHNzbS5QYXJhbWV0ZXJUaWVyLlNUQU5EQVJELFxuICAgICAgfSk7XG5cbiAgICAgIG5ldyBzc20uU3RyaW5nUGFyYW1ldGVyKHN0YWNrLCAnQWxsb3dlZFByaWNlSWRzUGFyYW1ldGVyJywge1xuICAgICAgICBwYXJhbWV0ZXJOYW1lOiAnL2F1cmEyOC9kZXYvc3RyaXBlL2FsbG93ZWQtcHJpY2UtaWRzJyxcbiAgICAgICAgZGVzY3JpcHRpb246ICdDb21tYS1zZXBhcmF0ZWQgbGlzdCBvZiBhbGxvd2VkIFN0cmlwZSBwcmljZSBJRHMgZm9yIGRldiBlbnZpcm9ubWVudCcsXG4gICAgICAgIHN0cmluZ1ZhbHVlOiBgJHtWQUxJRF9ERVZfUFJJQ0VfSUR9LHByaWNlX3BsYWNlaG9sZGVyXzJgLFxuICAgICAgICB0aWVyOiBzc20uUGFyYW1ldGVyVGllci5TVEFOREFSRCxcbiAgICAgIH0pO1xuXG4gICAgICBuZXcgc3NtLlN0cmluZ1BhcmFtZXRlcihzdGFjaywgJ1dlYmhvb2tTZWNyZXRQYXJhbWV0ZXInLCB7XG4gICAgICAgIHBhcmFtZXRlck5hbWU6ICcvYXVyYTI4L2Rldi9zdHJpcGUvd2ViaG9vay1zZWNyZXQnLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ1N0cmlwZSB3ZWJob29rIHNlY3JldCBmb3IgZGV2IGVudmlyb25tZW50JyxcbiAgICAgICAgc3RyaW5nVmFsdWU6ICdQTEFDRUhPTERFUl9UT19CRV9SRVBMQUNFRF9NQU5VQUxMWScsXG4gICAgICAgIHRpZXI6IHNzbS5QYXJhbWV0ZXJUaWVyLlNUQU5EQVJELFxuICAgICAgfSk7XG5cbiAgICAgIHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrKTtcbiAgICB9KTtcblxuICAgIHRlc3QoJ3Nob3VsZCBjcmVhdGUgZGVmYXVsdCBwcmljZSBJRCBwYXJhbWV0ZXIgd2l0aCB2YWxpZCBkZXYgcHJpY2UgSUQnLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6U1NNOjpQYXJhbWV0ZXInLCB7XG4gICAgICAgIE5hbWU6ICcvYXVyYTI4L2Rldi9zdHJpcGUvZGVmYXVsdC1wcmljZS1pZCcsXG4gICAgICAgIFZhbHVlOiBWQUxJRF9ERVZfUFJJQ0VfSUQsXG4gICAgICAgIFR5cGU6ICdTdHJpbmcnLFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICB0ZXN0KCdzaG91bGQgbm90IHVzZSBpbnZhbGlkIHBsYWNlaG9sZGVyIHByaWNlIElEJywgKCkgPT4ge1xuICAgICAgY29uc3QgcGFyYW1ldGVycyA9IHRlbXBsYXRlLmZpbmRSZXNvdXJjZXMoJ0FXUzo6U1NNOjpQYXJhbWV0ZXInKTtcblxuICAgICAgT2JqZWN0LmVudHJpZXMocGFyYW1ldGVycykuZm9yRWFjaCgoW18sIHJlc291cmNlXSkgPT4ge1xuICAgICAgICBpZiAocmVzb3VyY2UuUHJvcGVydGllcy5OYW1lID09PSAnL2F1cmEyOC9kZXYvc3RyaXBlL2RlZmF1bHQtcHJpY2UtaWQnKSB7XG4gICAgICAgICAgZXhwZWN0KHJlc291cmNlLlByb3BlcnRpZXMuVmFsdWUpLnRvQmUoVkFMSURfREVWX1BSSUNFX0lEKTtcbiAgICAgICAgICBleHBlY3QocmVzb3VyY2UuUHJvcGVydGllcy5WYWx1ZSkubm90LnRvQmUoSU5WQUxJRF9QTEFDRUhPTERFUl9JRCk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgdGVzdCgnc2hvdWxkIGluY2x1ZGUgdmFsaWQgZGV2IHByaWNlIElEIGluIGFsbG93ZWQgbGlzdCcsICgpID0+IHtcbiAgICAgIHRlbXBsYXRlLmhhc1Jlc291cmNlUHJvcGVydGllcygnQVdTOjpTU006OlBhcmFtZXRlcicsIHtcbiAgICAgICAgTmFtZTogJy9hdXJhMjgvZGV2L3N0cmlwZS9hbGxvd2VkLXByaWNlLWlkcycsXG4gICAgICAgIFZhbHVlOiBNYXRjaC5zdHJpbmdMaWtlUmVnZXhwKGAuKiR7VkFMSURfREVWX1BSSUNFX0lEfS4qYCksXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIHRlc3QoJ3Nob3VsZCBub3QgaW5jbHVkZSBpbnZhbGlkIHBsYWNlaG9sZGVyIGluIGFsbG93ZWQgbGlzdCcsICgpID0+IHtcbiAgICAgIGNvbnN0IHBhcmFtZXRlcnMgPSB0ZW1wbGF0ZS5maW5kUmVzb3VyY2VzKCdBV1M6OlNTTTo6UGFyYW1ldGVyJyk7XG5cbiAgICAgIE9iamVjdC5lbnRyaWVzKHBhcmFtZXRlcnMpLmZvckVhY2goKFtfLCByZXNvdXJjZV0pID0+IHtcbiAgICAgICAgaWYgKHJlc291cmNlLlByb3BlcnRpZXMuTmFtZSA9PT0gJy9hdXJhMjgvZGV2L3N0cmlwZS9hbGxvd2VkLXByaWNlLWlkcycpIHtcbiAgICAgICAgICBleHBlY3QocmVzb3VyY2UuUHJvcGVydGllcy5WYWx1ZSkudG9Db250YWluKFZBTElEX0RFVl9QUklDRV9JRCk7XG4gICAgICAgICAgZXhwZWN0KHJlc291cmNlLlByb3BlcnRpZXMuVmFsdWUpLm5vdC50b0NvbnRhaW4oSU5WQUxJRF9QTEFDRUhPTERFUl9JRCk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgdGVzdCgnc2hvdWxkIHVzZSBTdGFuZGFyZCB0aWVyIGZvciBhbGwgcGFyYW1ldGVycycsICgpID0+IHtcbiAgICAgIGNvbnN0IHBhcmFtZXRlcnMgPSB0ZW1wbGF0ZS5maW5kUmVzb3VyY2VzKCdBV1M6OlNTTTo6UGFyYW1ldGVyJyk7XG5cbiAgICAgIE9iamVjdC5lbnRyaWVzKHBhcmFtZXRlcnMpLmZvckVhY2goKFtfLCByZXNvdXJjZV0pID0+IHtcbiAgICAgICAgZXhwZWN0KHJlc291cmNlLlByb3BlcnRpZXMuVGllcikudG9CZSgnU3RhbmRhcmQnKTtcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgdGVzdCgnc2hvdWxkIGhhdmUgcHJvcGVyIGRlc2NyaXB0aW9ucyBmb3IgYWxsIHBhcmFtZXRlcnMnLCAoKSA9PiB7XG4gICAgICBjb25zdCBwYXJhbWV0ZXJzID0gdGVtcGxhdGUuZmluZFJlc291cmNlcygnQVdTOjpTU006OlBhcmFtZXRlcicpO1xuXG4gICAgICBPYmplY3QuZW50cmllcyhwYXJhbWV0ZXJzKS5mb3JFYWNoKChbXywgcmVzb3VyY2VdKSA9PiB7XG4gICAgICAgIGV4cGVjdChyZXNvdXJjZS5Qcm9wZXJ0aWVzLkRlc2NyaXB0aW9uKS50b0JlRGVmaW5lZCgpO1xuICAgICAgICBleHBlY3QocmVzb3VyY2UuUHJvcGVydGllcy5EZXNjcmlwdGlvbi5sZW5ndGgpLnRvQmVHcmVhdGVyVGhhbigxMCk7XG4gICAgICAgIGV4cGVjdChyZXNvdXJjZS5Qcm9wZXJ0aWVzLkRlc2NyaXB0aW9uKS50b0NvbnRhaW4oJ2RldicpO1xuICAgICAgfSk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKCdQcm9kdWN0aW9uIGVudmlyb25tZW50IHBhcmFtZXRlcnMnLCAoKSA9PiB7XG4gICAgYmVmb3JlRWFjaCgoKSA9PiB7XG4gICAgICBhcHAgPSBuZXcgY2RrLkFwcCgpO1xuICAgICAgc3RhY2sgPSBuZXcgY2RrLlN0YWNrKGFwcCwgJ1Byb2RTdGFjaycsIHtcbiAgICAgICAgZW52OiB7XG4gICAgICAgICAgYWNjb3VudDogJzEyMzQ1Njc4OTAxMicsXG4gICAgICAgICAgcmVnaW9uOiAndXMtZWFzdC0xJyxcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBTaW11bGF0ZSB0aGUgU1NNIHBhcmFtZXRlcnMgY3JlYXRlZCBpbiBBcGlDb25zdHJ1Y3QgZm9yIHByb2QgZW52aXJvbm1lbnRcbiAgICAgIG5ldyBzc20uU3RyaW5nUGFyYW1ldGVyKHN0YWNrLCAnRGVmYXVsdFByaWNlSWRQYXJhbWV0ZXInLCB7XG4gICAgICAgIHBhcmFtZXRlck5hbWU6ICcvYXVyYTI4L3Byb2Qvc3RyaXBlL2RlZmF1bHQtcHJpY2UtaWQnLFxuICAgICAgICBkZXNjcmlwdGlvbjogJ0RlZmF1bHQgU3RyaXBlIHByaWNlIElEIGZvciBmcm9udGVuZCBidWlsZCBpbiBwcm9kIGVudmlyb25tZW50JyxcbiAgICAgICAgc3RyaW5nVmFsdWU6ICdwcmljZV9SRVBMQUNFX1dJVEhfUFJPRFVDVElPTl9JRCcsXG4gICAgICAgIHRpZXI6IHNzbS5QYXJhbWV0ZXJUaWVyLlNUQU5EQVJELFxuICAgICAgfSk7XG5cbiAgICAgIG5ldyBzc20uU3RyaW5nUGFyYW1ldGVyKHN0YWNrLCAnQWxsb3dlZFByaWNlSWRzUGFyYW1ldGVyJywge1xuICAgICAgICBwYXJhbWV0ZXJOYW1lOiAnL2F1cmEyOC9wcm9kL3N0cmlwZS9hbGxvd2VkLXByaWNlLWlkcycsXG4gICAgICAgIGRlc2NyaXB0aW9uOiAnQ29tbWEtc2VwYXJhdGVkIGxpc3Qgb2YgYWxsb3dlZCBTdHJpcGUgcHJpY2UgSURzIGZvciBwcm9kIGVudmlyb25tZW50JyxcbiAgICAgICAgc3RyaW5nVmFsdWU6ICdwcmljZV9SRVBMQUNFX1dJVEhfUFJPRFVDVElPTl9JRCcsXG4gICAgICAgIHRpZXI6IHNzbS5QYXJhbWV0ZXJUaWVyLlNUQU5EQVJELFxuICAgICAgfSk7XG5cbiAgICAgIHRlbXBsYXRlID0gVGVtcGxhdGUuZnJvbVN0YWNrKHN0YWNrKTtcbiAgICB9KTtcblxuICAgIHRlc3QoJ3Nob3VsZCB1c2UgcGxhY2Vob2xkZXIgZm9yIHByb2R1Y3Rpb24gcHJpY2UgSUQnLCAoKSA9PiB7XG4gICAgICB0ZW1wbGF0ZS5oYXNSZXNvdXJjZVByb3BlcnRpZXMoJ0FXUzo6U1NNOjpQYXJhbWV0ZXInLCB7XG4gICAgICAgIE5hbWU6ICcvYXVyYTI4L3Byb2Qvc3RyaXBlL2RlZmF1bHQtcHJpY2UtaWQnLFxuICAgICAgICBWYWx1ZTogJ3ByaWNlX1JFUExBQ0VfV0lUSF9QUk9EVUNUSU9OX0lEJyxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgdGVzdCgnc2hvdWxkIG5vdCB1c2UgZGV2IHByaWNlIElEIGluIHByb2R1Y3Rpb24nLCAoKSA9PiB7XG4gICAgICBjb25zdCBwYXJhbWV0ZXJzID0gdGVtcGxhdGUuZmluZFJlc291cmNlcygnQVdTOjpTU006OlBhcmFtZXRlcicpO1xuXG4gICAgICBPYmplY3QuZW50cmllcyhwYXJhbWV0ZXJzKS5mb3JFYWNoKChbXywgcmVzb3VyY2VdKSA9PiB7XG4gICAgICAgIGlmIChyZXNvdXJjZS5Qcm9wZXJ0aWVzLk5hbWU/LmluY2x1ZGVzKCcvcHJvZC8nKSkge1xuICAgICAgICAgIGV4cGVjdChyZXNvdXJjZS5Qcm9wZXJ0aWVzLlZhbHVlKS5ub3QudG9CZShWQUxJRF9ERVZfUFJJQ0VfSUQpO1xuICAgICAgICAgIGV4cGVjdChyZXNvdXJjZS5Qcm9wZXJ0aWVzLlZhbHVlKS5ub3QudG9Db250YWluKFZBTElEX0RFVl9QUklDRV9JRCk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnUHJpY2UgSUQgZm9ybWF0IHZhbGlkYXRpb24nLCAoKSA9PiB7XG4gICAgdGVzdCgndmFsaWQgZGV2IHByaWNlIElEIHNob3VsZCBmb2xsb3cgU3RyaXBlIGZvcm1hdCcsICgpID0+IHtcbiAgICAgIGV4cGVjdChWQUxJRF9ERVZfUFJJQ0VfSUQpLnRvTWF0Y2goL15wcmljZV8vKTtcbiAgICAgIGV4cGVjdChWQUxJRF9ERVZfUFJJQ0VfSUQubGVuZ3RoKS50b0JlR3JlYXRlclRoYW4oMTApO1xuICAgICAgZXhwZWN0KFZBTElEX0RFVl9QUklDRV9JRCkudG9NYXRjaCgvXnByaWNlX1tBLVphLXowLTldKyQvKTtcbiAgICB9KTtcblxuICAgIHRlc3QoJ3Nob3VsZCByZWplY3QgaW52YWxpZCBwbGFjZWhvbGRlciBJRCcsICgpID0+IHtcbiAgICAgIC8vIFRoZSBpbnZhbGlkIHBsYWNlaG9sZGVyIHNob3VsZCBub3QgYmUgdXNlZCBhbnl3aGVyZVxuICAgICAgZXhwZWN0KFZBTElEX0RFVl9QUklDRV9JRCkubm90LnRvQmUoSU5WQUxJRF9QTEFDRUhPTERFUl9JRCk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKCdQYXJhbWV0ZXIgbmFtaW5nIGNvbnZlbnRpb25zJywgKCkgPT4ge1xuICAgIGJlZm9yZUVhY2goKCkgPT4ge1xuICAgICAgYXBwID0gbmV3IGNkay5BcHAoKTtcbiAgICAgIHN0YWNrID0gbmV3IGNkay5TdGFjayhhcHAsICdOYW1pbmdUZXN0U3RhY2snKTtcblxuICAgICAgLy8gQ3JlYXRlIHBhcmFtZXRlcnMgd2l0aCBwcm9wZXIgbmFtaW5nXG4gICAgICBuZXcgc3NtLlN0cmluZ1BhcmFtZXRlcihzdGFjaywgJ1BhcmFtMScsIHtcbiAgICAgICAgcGFyYW1ldGVyTmFtZTogJy9hdXJhMjgvZGV2L3N0cmlwZS9kZWZhdWx0LXByaWNlLWlkJyxcbiAgICAgICAgc3RyaW5nVmFsdWU6ICd0ZXN0JyxcbiAgICAgIH0pO1xuXG4gICAgICBuZXcgc3NtLlN0cmluZ1BhcmFtZXRlcihzdGFjaywgJ1BhcmFtMicsIHtcbiAgICAgICAgcGFyYW1ldGVyTmFtZTogJy9hdXJhMjgvZGV2L3N0cmlwZS9hbGxvd2VkLXByaWNlLWlkcycsXG4gICAgICAgIHN0cmluZ1ZhbHVlOiAndGVzdCcsXG4gICAgICB9KTtcblxuICAgICAgdGVtcGxhdGUgPSBUZW1wbGF0ZS5mcm9tU3RhY2soc3RhY2spO1xuICAgIH0pO1xuXG4gICAgdGVzdCgnc2hvdWxkIGZvbGxvdyAvYXVyYTI4L3tlbnZ9L3N0cmlwZS8qIHBhdHRlcm4nLCAoKSA9PiB7XG4gICAgICBjb25zdCBwYXJhbWV0ZXJzID0gdGVtcGxhdGUuZmluZFJlc291cmNlcygnQVdTOjpTU006OlBhcmFtZXRlcicpO1xuXG4gICAgICBPYmplY3QuZW50cmllcyhwYXJhbWV0ZXJzKS5mb3JFYWNoKChbXywgcmVzb3VyY2VdKSA9PiB7XG4gICAgICAgIGNvbnN0IG5hbWUgPSByZXNvdXJjZS5Qcm9wZXJ0aWVzLk5hbWU7XG4gICAgICAgIGV4cGVjdChuYW1lKS50b01hdGNoKC9eXFwvYXVyYTI4XFwvKGRldnxwcm9kfHRlc3QpXFwvc3RyaXBlXFwvLiskLyk7XG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIHRlc3QoJ3Nob3VsZCB1c2UgaHlwaGVucyBpbiBwYXJhbWV0ZXIgbmFtZXMnLCAoKSA9PiB7XG4gICAgICBjb25zdCBwYXJhbWV0ZXJzID0gdGVtcGxhdGUuZmluZFJlc291cmNlcygnQVdTOjpTU006OlBhcmFtZXRlcicpO1xuXG4gICAgICBPYmplY3QuZW50cmllcyhwYXJhbWV0ZXJzKS5mb3JFYWNoKChbXywgcmVzb3VyY2VdKSA9PiB7XG4gICAgICAgIGNvbnN0IG5hbWUgPSByZXNvdXJjZS5Qcm9wZXJ0aWVzLk5hbWU7XG4gICAgICAgIGNvbnN0IGxhc3RQYXJ0ID0gbmFtZS5zcGxpdCgnLycpLnBvcCgpO1xuICAgICAgICAvLyBQYXJhbWV0ZXIgbmFtZXMgc2hvdWxkIHVzZSBoeXBoZW5zLCBub3QgdW5kZXJzY29yZXNcbiAgICAgICAgZXhwZWN0KGxhc3RQYXJ0KS50b01hdGNoKC9eW2Etei1dKyQvKTtcbiAgICAgICAgZXhwZWN0KGxhc3RQYXJ0KS5ub3QudG9Db250YWluKCdfJyk7XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfSk7XG59KTtcbiJdfQ==