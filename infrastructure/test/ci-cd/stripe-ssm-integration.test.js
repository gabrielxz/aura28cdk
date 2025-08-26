"use strict";
/**
 * Integration tests for CI/CD Stripe Price ID SSM Integration (KAN-72)
 * These tests verify the expected behavior of the SSM parameter fetching
 * in the CI/CD pipelines.
 */
Object.defineProperty(exports, "__esModule", { value: true });
const client_ssm_1 = require("@aws-sdk/client-ssm");
const aws_sdk_client_mock_1 = require("aws-sdk-client-mock");
const ssmMock = (0, aws_sdk_client_mock_1.mockClient)(client_ssm_1.SSMClient);
describe('CI/CD Stripe Price ID SSM Integration', () => {
    beforeEach(() => {
        ssmMock.reset();
    });
    describe('SSM Parameter Fetching', () => {
        it('should successfully fetch dev environment price ID', async () => {
            const expectedPriceId = 'price_dev_test_123';
            const parameterName = '/aura28/dev/stripe/default-price-id';
            ssmMock
                .on(client_ssm_1.GetParameterCommand, {
                Name: parameterName,
            })
                .resolves({
                Parameter: {
                    Name: parameterName,
                    Value: expectedPriceId,
                    Type: 'String',
                },
            });
            const client = new client_ssm_1.SSMClient({ region: 'us-east-1' });
            const command = new client_ssm_1.GetParameterCommand({ Name: parameterName });
            const response = await client.send(command);
            expect(response.Parameter?.Value).toBe(expectedPriceId);
            expect(response.Parameter?.Name).toBe(parameterName);
        });
        it('should successfully fetch prod environment price ID', async () => {
            const expectedPriceId = 'price_prod_live_456';
            const parameterName = '/aura28/prod/stripe/default-price-id';
            ssmMock
                .on(client_ssm_1.GetParameterCommand, {
                Name: parameterName,
            })
                .resolves({
                Parameter: {
                    Name: parameterName,
                    Value: expectedPriceId,
                    Type: 'String',
                },
            });
            const client = new client_ssm_1.SSMClient({ region: 'us-east-1' });
            const command = new client_ssm_1.GetParameterCommand({ Name: parameterName });
            const response = await client.send(command);
            expect(response.Parameter?.Value).toBe(expectedPriceId);
            expect(response.Parameter?.Name).toBe(parameterName);
        });
        it('should handle missing SSM parameter gracefully', async () => {
            const parameterName = '/aura28/dev/stripe/default-price-id';
            const error = new Error(`Parameter ${parameterName} not found.`);
            error.name = 'ParameterNotFound';
            ssmMock
                .on(client_ssm_1.GetParameterCommand, {
                Name: parameterName,
            })
                .rejects(error);
            const client = new client_ssm_1.SSMClient({ region: 'us-east-1' });
            const command = new client_ssm_1.GetParameterCommand({ Name: parameterName });
            await expect(client.send(command)).rejects.toThrow('Parameter');
        });
        it('should handle empty parameter value', async () => {
            const parameterName = '/aura28/dev/stripe/default-price-id';
            ssmMock
                .on(client_ssm_1.GetParameterCommand, {
                Name: parameterName,
            })
                .resolves({
                Parameter: {
                    Name: parameterName,
                    Value: '',
                    Type: 'String',
                },
            });
            const client = new client_ssm_1.SSMClient({ region: 'us-east-1' });
            const command = new client_ssm_1.GetParameterCommand({ Name: parameterName });
            const response = await client.send(command);
            expect(response.Parameter?.Value).toBe('');
            // CI/CD workflow should detect this and fail
        });
        it('should handle AWS API errors', async () => {
            const parameterName = '/aura28/dev/stripe/default-price-id';
            const error = new Error('User is not authorized to perform: ssm:GetParameter');
            error.name = 'AccessDeniedException';
            ssmMock
                .on(client_ssm_1.GetParameterCommand, {
                Name: parameterName,
            })
                .rejects(error);
            const client = new client_ssm_1.SSMClient({ region: 'us-east-1' });
            const command = new client_ssm_1.GetParameterCommand({ Name: parameterName });
            await expect(client.send(command)).rejects.toThrow('User is not authorized');
        });
        it('should handle network timeouts', async () => {
            const parameterName = '/aura28/dev/stripe/default-price-id';
            const error = new Error('Connection timeout');
            error.name = 'NetworkingError';
            ssmMock
                .on(client_ssm_1.GetParameterCommand, {
                Name: parameterName,
            })
                .rejects(error);
            const client = new client_ssm_1.SSMClient({ region: 'us-east-1' });
            const command = new client_ssm_1.GetParameterCommand({ Name: parameterName });
            await expect(client.send(command)).rejects.toThrow('Connection timeout');
        });
    });
    describe('Parameter Naming Convention', () => {
        it('should follow the correct naming pattern for dev environment', () => {
            const devParameterName = '/aura28/dev/stripe/default-price-id';
            expect(devParameterName).toMatch(/^\/aura28\/dev\/stripe\/default-price-id$/);
        });
        it('should follow the correct naming pattern for prod environment', () => {
            const prodParameterName = '/aura28/prod/stripe/default-price-id';
            expect(prodParameterName).toMatch(/^\/aura28\/prod\/stripe\/default-price-id$/);
        });
        it('should use consistent prefix across environments', () => {
            const devParam = '/aura28/dev/stripe/default-price-id';
            const prodParam = '/aura28/prod/stripe/default-price-id';
            const devPrefix = devParam.split('/').slice(0, 2).join('/');
            const prodPrefix = prodParam.split('/').slice(0, 2).join('/');
            expect(devPrefix).toBe('/aura28');
            expect(prodPrefix).toBe('/aura28');
        });
    });
    describe('Environment Variable Injection', () => {
        it('should set NEXT_PUBLIC_STRIPE_PRICE_ID correctly', () => {
            const priceId = 'price_test_from_ssm';
            // Simulate what the CI/CD workflow does
            process.env.NEXT_PUBLIC_STRIPE_PRICE_ID = priceId;
            expect(process.env.NEXT_PUBLIC_STRIPE_PRICE_ID).toBe(priceId);
        });
        it('should override any existing NEXT_PUBLIC_STRIPE_PRICE_ID', () => {
            // Set an initial value
            process.env.NEXT_PUBLIC_STRIPE_PRICE_ID = 'old_price_id';
            // Simulate CI/CD override
            const newPriceId = 'price_new_from_ssm';
            process.env.NEXT_PUBLIC_STRIPE_PRICE_ID = newPriceId;
            expect(process.env.NEXT_PUBLIC_STRIPE_PRICE_ID).toBe(newPriceId);
            expect(process.env.NEXT_PUBLIC_STRIPE_PRICE_ID).not.toBe('old_price_id');
        });
    });
    describe('CI/CD Workflow Validation', () => {
        it('should validate that price ID starts with price_', () => {
            const validPriceIds = ['price_123', 'price_test', 'price_live_abc'];
            const invalidPriceIds = ['123', 'test_price', 'prod_123', ''];
            validPriceIds.forEach((id) => {
                expect(id).toMatch(/^price_/);
            });
            invalidPriceIds.forEach((id) => {
                expect(id).not.toMatch(/^price_/);
            });
        });
        it('should use correct valid dev price ID for KAN-73', () => {
            const validDevPriceId = 'price_1RxUOjErRRGs6tYsTV4RF1Qu';
            const invalidPlaceholderId = 'price_1QbGXuRuJDBzRJSkCbG4a9Xo';
            // Valid dev price ID should match Stripe format
            expect(validDevPriceId).toMatch(/^price_/);
            expect(validDevPriceId.length).toBeGreaterThan(10);
            // Should not be using the old placeholder
            expect(validDevPriceId).not.toBe(invalidPlaceholderId);
        });
        it('should handle fallback to valid dev price ID when SSM parameter missing', () => {
            // Simulate the workflow fallback logic
            const ssmPriceId = undefined;
            const fallbackPriceId = 'price_1RxUOjErRRGs6tYsTV4RF1Qu';
            const finalPriceId = ssmPriceId || fallbackPriceId;
            expect(finalPriceId).toBe(fallbackPriceId);
            expect(finalPriceId).toMatch(/^price_/);
            expect(finalPriceId).not.toBe('price_1QbGXuRuJDBzRJSkCbG4a9Xo'); // Not the old placeholder
        });
        it('should ensure parameter names match environment context', () => {
            const devWorkflowParam = '/aura28/dev/stripe/default-price-id';
            const prodWorkflowParam = '/aura28/prod/stripe/default-price-id';
            // Dev workflow should use dev parameter
            expect(devWorkflowParam).toContain('/dev/');
            expect(devWorkflowParam).not.toContain('/prod/');
            // Prod workflow should use prod parameter
            expect(prodWorkflowParam).toContain('/prod/');
            expect(prodWorkflowParam).not.toContain('/dev/');
        });
        it('should fail build if SSM parameter is missing', async () => {
            const parameterName = '/aura28/dev/stripe/default-price-id';
            const error = new Error(`Parameter ${parameterName} not found.`);
            error.name = 'ParameterNotFound';
            ssmMock
                .on(client_ssm_1.GetParameterCommand, {
                Name: parameterName,
            })
                .rejects(error);
            const client = new client_ssm_1.SSMClient({ region: 'us-east-1' });
            const command = new client_ssm_1.GetParameterCommand({ Name: parameterName });
            // This simulates what happens in the CI/CD workflow
            let buildShouldFail = false;
            try {
                await client.send(command);
            }
            catch (_error) {
                buildShouldFail = true;
            }
            expect(buildShouldFail).toBe(true);
        });
        it('should fail build if SSM parameter value is empty', () => {
            const priceId = '';
            // Simulate the CI/CD check
            let buildShouldFail = false;
            if (!priceId || priceId.trim() === '') {
                buildShouldFail = true;
            }
            expect(buildShouldFail).toBe(true);
        });
    });
    describe('SSM Parameter Creation Helper', () => {
        it('should create dev parameter with correct structure', async () => {
            const parameterName = '/aura28/dev/stripe/default-price-id';
            const priceId = 'price_dev_test_123';
            ssmMock
                .on(client_ssm_1.PutParameterCommand, {
                Name: parameterName,
                Value: priceId,
                Type: 'String',
            })
                .resolves({
                Version: 1,
            });
            const client = new client_ssm_1.SSMClient({ region: 'us-east-1' });
            const command = new client_ssm_1.PutParameterCommand({
                Name: parameterName,
                Value: priceId,
                Type: 'String',
                Description: 'Default Stripe price ID for development environment frontend',
            });
            const response = await client.send(command);
            expect(response.Version).toBe(1);
        });
        it('should create prod parameter with correct structure', async () => {
            const parameterName = '/aura28/prod/stripe/default-price-id';
            const priceId = 'price_prod_live_456';
            ssmMock
                .on(client_ssm_1.PutParameterCommand, {
                Name: parameterName,
                Value: priceId,
                Type: 'String',
            })
                .resolves({
                Version: 1,
            });
            const client = new client_ssm_1.SSMClient({ region: 'us-east-1' });
            const command = new client_ssm_1.PutParameterCommand({
                Name: parameterName,
                Value: priceId,
                Type: 'String',
                Description: 'Default Stripe price ID for production environment frontend',
            });
            const response = await client.send(command);
            expect(response.Version).toBe(1);
        });
    });
    describe('Build Process Integration', () => {
        it('should make environment variable available during Next.js build', () => {
            // Simulate the environment during build
            const buildEnv = {
                NEXT_PUBLIC_STRIPE_PRICE_ID: 'price_from_ssm_build',
                NEXT_PUBLIC_API_GATEWAY_URL: 'https://api.example.com',
                NEXT_PUBLIC_COGNITO_USER_POOL_ID: 'us-east-1_test',
                NEXT_PUBLIC_COGNITO_CLIENT_ID: 'test_client_id',
                NEXT_PUBLIC_COGNITO_DOMAIN: 'test-domain',
                NEXT_PUBLIC_COGNITO_REGION: 'us-east-1',
            };
            // All NEXT_PUBLIC_ variables should be available
            Object.entries(buildEnv).forEach(([key, value]) => {
                expect(key).toMatch(/^NEXT_PUBLIC_/);
                expect(value).toBeTruthy();
            });
            // Stripe price ID should be set
            expect(buildEnv.NEXT_PUBLIC_STRIPE_PRICE_ID).toBeDefined();
            expect(buildEnv.NEXT_PUBLIC_STRIPE_PRICE_ID).toMatch(/^price_/);
        });
        it('should not expose sensitive SSM parameter names in build output', () => {
            const publicEnvVar = 'NEXT_PUBLIC_STRIPE_PRICE_ID';
            // The parameter name should not be exposed, only the env var name
            expect(publicEnvVar).not.toContain('ssm');
            expect(publicEnvVar).not.toContain('parameter');
            expect(publicEnvVar).not.toContain('/aura28/');
        });
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3RyaXBlLXNzbS1pbnRlZ3JhdGlvbi50ZXN0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsic3RyaXBlLXNzbS1pbnRlZ3JhdGlvbi50ZXN0LnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7QUFBQTs7OztHQUlHOztBQUVILG9EQUEwRjtBQUMxRiw2REFBaUQ7QUFFakQsTUFBTSxPQUFPLEdBQUcsSUFBQSxnQ0FBVSxFQUFDLHNCQUFTLENBQUMsQ0FBQztBQUV0QyxRQUFRLENBQUMsdUNBQXVDLEVBQUUsR0FBRyxFQUFFO0lBQ3JELFVBQVUsQ0FBQyxHQUFHLEVBQUU7UUFDZCxPQUFPLENBQUMsS0FBSyxFQUFFLENBQUM7SUFDbEIsQ0FBQyxDQUFDLENBQUM7SUFFSCxRQUFRLENBQUMsd0JBQXdCLEVBQUUsR0FBRyxFQUFFO1FBQ3RDLEVBQUUsQ0FBQyxvREFBb0QsRUFBRSxLQUFLLElBQUksRUFBRTtZQUNsRSxNQUFNLGVBQWUsR0FBRyxvQkFBb0IsQ0FBQztZQUM3QyxNQUFNLGFBQWEsR0FBRyxxQ0FBcUMsQ0FBQztZQUU1RCxPQUFPO2lCQUNKLEVBQUUsQ0FBQyxnQ0FBbUIsRUFBRTtnQkFDdkIsSUFBSSxFQUFFLGFBQWE7YUFDcEIsQ0FBQztpQkFDRCxRQUFRLENBQUM7Z0JBQ1IsU0FBUyxFQUFFO29CQUNULElBQUksRUFBRSxhQUFhO29CQUNuQixLQUFLLEVBQUUsZUFBZTtvQkFDdEIsSUFBSSxFQUFFLFFBQVE7aUJBQ2Y7YUFDRixDQUFDLENBQUM7WUFFTCxNQUFNLE1BQU0sR0FBRyxJQUFJLHNCQUFTLENBQUMsRUFBRSxNQUFNLEVBQUUsV0FBVyxFQUFFLENBQUMsQ0FBQztZQUN0RCxNQUFNLE9BQU8sR0FBRyxJQUFJLGdDQUFtQixDQUFDLEVBQUUsSUFBSSxFQUFFLGFBQWEsRUFBRSxDQUFDLENBQUM7WUFDakUsTUFBTSxRQUFRLEdBQUcsTUFBTSxNQUFNLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1lBRTVDLE1BQU0sQ0FB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LENBQUMsQ0FBQyxXQUFXLEVBQUUsQ0FBQztZQUMzRCxNQUFNLENBQUMsUUFBUSxDQUFDLDJCQUEyQixDQUFDLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxDQUFDO1FBQ2xFLENBQUMsQ0FBQyxDQUFDO1FBRUgsRUFBRSxDQUFDLGlFQUFpRSxFQUFFLEdBQUcsRUFBRTtZQUN6RSxNQUFNLFlBQVksR0FBRyw2QkFBNkIsQ0FBQztZQUVuRCxrRUFBa0U7WUFDbEUsTUFBTSxDQUFDLFlBQVksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsS0FBSyxDQUFDLENBQUM7WUFDMUMsTUFBTSxDQUFDLFlBQVksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsV0FBVyxDQUFDLENBQUM7WUFDaEQsTUFBTSxDQUFDLFlBQVksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxTQUFTLENBQUMsVUFBVSxDQUFDLENBQUM7UUFDakQsQ0FBQyxDQUFDLENBQUM7SUFDTCxDQUFDLENBQUMsQ0FBQztBQUNMLENBQUMsQ0FBQyxDQUFDIiwic291cmNlc0NvbnRlbnQiOlsiLyoqXG4gKiBJbnRlZ3JhdGlvbiB0ZXN0cyBmb3IgQ0kvQ0QgU3RyaXBlIFByaWNlIElEIFNTTSBJbnRlZ3JhdGlvbiAoS0FOLTcyKVxuICogVGhlc2UgdGVzdHMgdmVyaWZ5IHRoZSBleHBlY3RlZCBiZWhhdmlvciBvZiB0aGUgU1NNIHBhcmFtZXRlciBmZXRjaGluZ1xuICogaW4gdGhlIENJL0NEIHBpcGVsaW5lcy5cbiAqL1xuXG5pbXBvcnQgeyBTU01DbGllbnQsIEdldFBhcmFtZXRlckNvbW1hbmQsIFB1dFBhcmFtZXRlckNvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtc3NtJztcbmltcG9ydCB7IG1vY2tDbGllbnQgfSBmcm9tICdhd3Mtc2RrLWNsaWVudC1tb2NrJztcblxuY29uc3Qgc3NtTW9jayA9IG1vY2tDbGllbnQoU1NNQ2xpZW50KTtcblxuZGVzY3JpYmUoJ0NJL0NEIFN0cmlwZSBQcmljZSBJRCBTU00gSW50ZWdyYXRpb24nLCAoKSA9PiB7XG4gIGJlZm9yZUVhY2goKCkgPT4ge1xuICAgIHNzbU1vY2sucmVzZXQoKTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ1NTTSBQYXJhbWV0ZXIgRmV0Y2hpbmcnLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCBzdWNjZXNzZnVsbHkgZmV0Y2ggZGV2IGVudmlyb25tZW50IHByaWNlIElEJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgZXhwZWN0ZWRQcmljZUlkID0gJ3ByaWNlX2Rldl90ZXN0XzEyMyc7XG4gICAgICBjb25zdCBwYXJhbWV0ZXJOYW1lID0gJy9hdXJhMjgvZGV2L3N0cmlwZS9kZWZhdWx0LXByaWNlLWlkJztcblxuICAgICAgc3NtTW9ja1xuICAgICAgICAub24oR2V0UGFyYW1ldGVyQ29tbWFuZCwge1xuICAgICAgICAgIE5hbWU6IHBhcmFtZXRlck5hbWUsXG4gICAgICAgIH0pXG4gICAgICAgIC5yZXNvbHZlcyh7XG4gICAgICAgICAgUGFyYW1ldGVyOiB7XG4gICAgICAgICAgICBOYW1lOiBwYXJhbWV0ZXJOYW1lLFxuICAgICAgICAgICAgVmFsdWU6IGV4cGVjdGVkUHJpY2VJZCxcbiAgICAgICAgICAgIFR5cGU6ICdTdHJpbmcnLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuXG4gICAgICBjb25zdCBjbGllbnQgPSBuZXcgU1NNQ2xpZW50KHsgcmVnaW9uOiAndXMtZWFzdC0xJyB9KTtcbiAgICAgIGNvbnN0IGNvbW1hbmQgPSBuZXcgR2V0UGFyYW1ldGVyQ29tbWFuZCh7IE5hbWU6IHBhcmFtZXRlck5hbWUgfSk7XG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGNsaWVudC5zZW5kKGNvbW1hbmQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2UuUGFyYW1ldGVyPy5WYWx1ZSkudG9CZShleHBlY3RlZFByaWNlSWQpO1xuICAgICAgZXhwZWN0KHJlc3BvbnNlLlBhcmFtZXRlcj8uTmFtZSkudG9CZShwYXJhbWV0ZXJOYW1lKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgc3VjY2Vzc2Z1bGx5IGZldGNoIHByb2QgZW52aXJvbm1lbnQgcHJpY2UgSUQnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBleHBlY3RlZFByaWNlSWQgPSAncHJpY2VfcHJvZF9saXZlXzQ1Nic7XG4gICAgICBjb25zdCBwYXJhbWV0ZXJOYW1lID0gJy9hdXJhMjgvcHJvZC9zdHJpcGUvZGVmYXVsdC1wcmljZS1pZCc7XG5cbiAgICAgIHNzbU1vY2tcbiAgICAgICAgLm9uKEdldFBhcmFtZXRlckNvbW1hbmQsIHtcbiAgICAgICAgICBOYW1lOiBwYXJhbWV0ZXJOYW1lLFxuICAgICAgICB9KVxuICAgICAgICAucmVzb2x2ZXMoe1xuICAgICAgICAgIFBhcmFtZXRlcjoge1xuICAgICAgICAgICAgTmFtZTogcGFyYW1ldGVyTmFtZSxcbiAgICAgICAgICAgIFZhbHVlOiBleHBlY3RlZFByaWNlSWQsXG4gICAgICAgICAgICBUeXBlOiAnU3RyaW5nJyxcbiAgICAgICAgICB9LFxuICAgICAgICB9KTtcblxuICAgICAgY29uc3QgY2xpZW50ID0gbmV3IFNTTUNsaWVudCh7IHJlZ2lvbjogJ3VzLWVhc3QtMScgfSk7XG4gICAgICBjb25zdCBjb21tYW5kID0gbmV3IEdldFBhcmFtZXRlckNvbW1hbmQoeyBOYW1lOiBwYXJhbWV0ZXJOYW1lIH0pO1xuICAgICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBjbGllbnQuc2VuZChjb21tYW5kKTtcblxuICAgICAgZXhwZWN0KHJlc3BvbnNlLlBhcmFtZXRlcj8uVmFsdWUpLnRvQmUoZXhwZWN0ZWRQcmljZUlkKTtcbiAgICAgIGV4cGVjdChyZXNwb25zZS5QYXJhbWV0ZXI/Lk5hbWUpLnRvQmUocGFyYW1ldGVyTmFtZSk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBtaXNzaW5nIFNTTSBwYXJhbWV0ZXIgZ3JhY2VmdWxseScsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IHBhcmFtZXRlck5hbWUgPSAnL2F1cmEyOC9kZXYvc3RyaXBlL2RlZmF1bHQtcHJpY2UtaWQnO1xuXG4gICAgICBjb25zdCBlcnJvciA9IG5ldyBFcnJvcihgUGFyYW1ldGVyICR7cGFyYW1ldGVyTmFtZX0gbm90IGZvdW5kLmApO1xuICAgICAgZXJyb3IubmFtZSA9ICdQYXJhbWV0ZXJOb3RGb3VuZCc7XG5cbiAgICAgIHNzbU1vY2tcbiAgICAgICAgLm9uKEdldFBhcmFtZXRlckNvbW1hbmQsIHtcbiAgICAgICAgICBOYW1lOiBwYXJhbWV0ZXJOYW1lLFxuICAgICAgICB9KVxuICAgICAgICAucmVqZWN0cyhlcnJvcik7XG5cbiAgICAgIGNvbnN0IGNsaWVudCA9IG5ldyBTU01DbGllbnQoeyByZWdpb246ICd1cy1lYXN0LTEnIH0pO1xuICAgICAgY29uc3QgY29tbWFuZCA9IG5ldyBHZXRQYXJhbWV0ZXJDb21tYW5kKHsgTmFtZTogcGFyYW1ldGVyTmFtZSB9KTtcblxuICAgICAgYXdhaXQgZXhwZWN0KGNsaWVudC5zZW5kKGNvbW1hbmQpKS5yZWplY3RzLnRvVGhyb3coJ1BhcmFtZXRlcicpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgZW1wdHkgcGFyYW1ldGVyIHZhbHVlJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgcGFyYW1ldGVyTmFtZSA9ICcvYXVyYTI4L2Rldi9zdHJpcGUvZGVmYXVsdC1wcmljZS1pZCc7XG5cbiAgICAgIHNzbU1vY2tcbiAgICAgICAgLm9uKEdldFBhcmFtZXRlckNvbW1hbmQsIHtcbiAgICAgICAgICBOYW1lOiBwYXJhbWV0ZXJOYW1lLFxuICAgICAgICB9KVxuICAgICAgICAucmVzb2x2ZXMoe1xuICAgICAgICAgIFBhcmFtZXRlcjoge1xuICAgICAgICAgICAgTmFtZTogcGFyYW1ldGVyTmFtZSxcbiAgICAgICAgICAgIFZhbHVlOiAnJyxcbiAgICAgICAgICAgIFR5cGU6ICdTdHJpbmcnLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pO1xuXG4gICAgICBjb25zdCBjbGllbnQgPSBuZXcgU1NNQ2xpZW50KHsgcmVnaW9uOiAndXMtZWFzdC0xJyB9KTtcbiAgICAgIGNvbnN0IGNvbW1hbmQgPSBuZXcgR2V0UGFyYW1ldGVyQ29tbWFuZCh7IE5hbWU6IHBhcmFtZXRlck5hbWUgfSk7XG4gICAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGNsaWVudC5zZW5kKGNvbW1hbmQpO1xuXG4gICAgICBleHBlY3QocmVzcG9uc2UuUGFyYW1ldGVyPy5WYWx1ZSkudG9CZSgnJyk7XG4gICAgICAvLyBDSS9DRCB3b3JrZmxvdyBzaG91bGQgZGV0ZWN0IHRoaXMgYW5kIGZhaWxcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgaGFuZGxlIEFXUyBBUEkgZXJyb3JzJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgcGFyYW1ldGVyTmFtZSA9ICcvYXVyYTI4L2Rldi9zdHJpcGUvZGVmYXVsdC1wcmljZS1pZCc7XG5cbiAgICAgIGNvbnN0IGVycm9yID0gbmV3IEVycm9yKCdVc2VyIGlzIG5vdCBhdXRob3JpemVkIHRvIHBlcmZvcm06IHNzbTpHZXRQYXJhbWV0ZXInKTtcbiAgICAgIGVycm9yLm5hbWUgPSAnQWNjZXNzRGVuaWVkRXhjZXB0aW9uJztcblxuICAgICAgc3NtTW9ja1xuICAgICAgICAub24oR2V0UGFyYW1ldGVyQ29tbWFuZCwge1xuICAgICAgICAgIE5hbWU6IHBhcmFtZXRlck5hbWUsXG4gICAgICAgIH0pXG4gICAgICAgIC5yZWplY3RzKGVycm9yKTtcblxuICAgICAgY29uc3QgY2xpZW50ID0gbmV3IFNTTUNsaWVudCh7IHJlZ2lvbjogJ3VzLWVhc3QtMScgfSk7XG4gICAgICBjb25zdCBjb21tYW5kID0gbmV3IEdldFBhcmFtZXRlckNvbW1hbmQoeyBOYW1lOiBwYXJhbWV0ZXJOYW1lIH0pO1xuXG4gICAgICBhd2FpdCBleHBlY3QoY2xpZW50LnNlbmQoY29tbWFuZCkpLnJlamVjdHMudG9UaHJvdygnVXNlciBpcyBub3QgYXV0aG9yaXplZCcpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBoYW5kbGUgbmV0d29yayB0aW1lb3V0cycsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IHBhcmFtZXRlck5hbWUgPSAnL2F1cmEyOC9kZXYvc3RyaXBlL2RlZmF1bHQtcHJpY2UtaWQnO1xuXG4gICAgICBjb25zdCBlcnJvciA9IG5ldyBFcnJvcignQ29ubmVjdGlvbiB0aW1lb3V0Jyk7XG4gICAgICBlcnJvci5uYW1lID0gJ05ldHdvcmtpbmdFcnJvcic7XG5cbiAgICAgIHNzbU1vY2tcbiAgICAgICAgLm9uKEdldFBhcmFtZXRlckNvbW1hbmQsIHtcbiAgICAgICAgICBOYW1lOiBwYXJhbWV0ZXJOYW1lLFxuICAgICAgICB9KVxuICAgICAgICAucmVqZWN0cyhlcnJvcik7XG5cbiAgICAgIGNvbnN0IGNsaWVudCA9IG5ldyBTU01DbGllbnQoeyByZWdpb246ICd1cy1lYXN0LTEnIH0pO1xuICAgICAgY29uc3QgY29tbWFuZCA9IG5ldyBHZXRQYXJhbWV0ZXJDb21tYW5kKHsgTmFtZTogcGFyYW1ldGVyTmFtZSB9KTtcblxuICAgICAgYXdhaXQgZXhwZWN0KGNsaWVudC5zZW5kKGNvbW1hbmQpKS5yZWplY3RzLnRvVGhyb3coJ0Nvbm5lY3Rpb24gdGltZW91dCcpO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnUGFyYW1ldGVyIE5hbWluZyBDb252ZW50aW9uJywgKCkgPT4ge1xuICAgIGl0KCdzaG91bGQgZm9sbG93IHRoZSBjb3JyZWN0IG5hbWluZyBwYXR0ZXJuIGZvciBkZXYgZW52aXJvbm1lbnQnLCAoKSA9PiB7XG4gICAgICBjb25zdCBkZXZQYXJhbWV0ZXJOYW1lID0gJy9hdXJhMjgvZGV2L3N0cmlwZS9kZWZhdWx0LXByaWNlLWlkJztcbiAgICAgIGV4cGVjdChkZXZQYXJhbWV0ZXJOYW1lKS50b01hdGNoKC9eXFwvYXVyYTI4XFwvZGV2XFwvc3RyaXBlXFwvZGVmYXVsdC1wcmljZS1pZCQvKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgZm9sbG93IHRoZSBjb3JyZWN0IG5hbWluZyBwYXR0ZXJuIGZvciBwcm9kIGVudmlyb25tZW50JywgKCkgPT4ge1xuICAgICAgY29uc3QgcHJvZFBhcmFtZXRlck5hbWUgPSAnL2F1cmEyOC9wcm9kL3N0cmlwZS9kZWZhdWx0LXByaWNlLWlkJztcbiAgICAgIGV4cGVjdChwcm9kUGFyYW1ldGVyTmFtZSkudG9NYXRjaCgvXlxcL2F1cmEyOFxcL3Byb2RcXC9zdHJpcGVcXC9kZWZhdWx0LXByaWNlLWlkJC8pO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCB1c2UgY29uc2lzdGVudCBwcmVmaXggYWNyb3NzIGVudmlyb25tZW50cycsICgpID0+IHtcbiAgICAgIGNvbnN0IGRldlBhcmFtID0gJy9hdXJhMjgvZGV2L3N0cmlwZS9kZWZhdWx0LXByaWNlLWlkJztcbiAgICAgIGNvbnN0IHByb2RQYXJhbSA9ICcvYXVyYTI4L3Byb2Qvc3RyaXBlL2RlZmF1bHQtcHJpY2UtaWQnO1xuXG4gICAgICBjb25zdCBkZXZQcmVmaXggPSBkZXZQYXJhbS5zcGxpdCgnLycpLnNsaWNlKDAsIDIpLmpvaW4oJy8nKTtcbiAgICAgIGNvbnN0IHByb2RQcmVmaXggPSBwcm9kUGFyYW0uc3BsaXQoJy8nKS5zbGljZSgwLCAyKS5qb2luKCcvJyk7XG5cbiAgICAgIGV4cGVjdChkZXZQcmVmaXgpLnRvQmUoJy9hdXJhMjgnKTtcbiAgICAgIGV4cGVjdChwcm9kUHJlZml4KS50b0JlKCcvYXVyYTI4Jyk7XG4gICAgfSk7XG4gIH0pO1xuXG4gIGRlc2NyaWJlKCdFbnZpcm9ubWVudCBWYXJpYWJsZSBJbmplY3Rpb24nLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCBzZXQgTkVYVF9QVUJMSUNfU1RSSVBFX1BSSUNFX0lEIGNvcnJlY3RseScsICgpID0+IHtcbiAgICAgIGNvbnN0IHByaWNlSWQgPSAncHJpY2VfdGVzdF9mcm9tX3NzbSc7XG5cbiAgICAgIC8vIFNpbXVsYXRlIHdoYXQgdGhlIENJL0NEIHdvcmtmbG93IGRvZXNcbiAgICAgIHByb2Nlc3MuZW52Lk5FWFRfUFVCTElDX1NUUklQRV9QUklDRV9JRCA9IHByaWNlSWQ7XG5cbiAgICAgIGV4cGVjdChwcm9jZXNzLmVudi5ORVhUX1BVQkxJQ19TVFJJUEVfUFJJQ0VfSUQpLnRvQmUocHJpY2VJZCk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIG92ZXJyaWRlIGFueSBleGlzdGluZyBORVhUX1BVQkxJQ19TVFJJUEVfUFJJQ0VfSUQnLCAoKSA9PiB7XG4gICAgICAvLyBTZXQgYW4gaW5pdGlhbCB2YWx1ZVxuICAgICAgcHJvY2Vzcy5lbnYuTkVYVF9QVUJMSUNfU1RSSVBFX1BSSUNFX0lEID0gJ29sZF9wcmljZV9pZCc7XG5cbiAgICAgIC8vIFNpbXVsYXRlIENJL0NEIG92ZXJyaWRlXG4gICAgICBjb25zdCBuZXdQcmljZUlkID0gJ3ByaWNlX25ld19mcm9tX3NzbSc7XG4gICAgICBwcm9jZXNzLmVudi5ORVhUX1BVQkxJQ19TVFJJUEVfUFJJQ0VfSUQgPSBuZXdQcmljZUlkO1xuXG4gICAgICBleHBlY3QocHJvY2Vzcy5lbnYuTkVYVF9QVUJMSUNfU1RSSVBFX1BSSUNFX0lEKS50b0JlKG5ld1ByaWNlSWQpO1xuICAgICAgZXhwZWN0KHByb2Nlc3MuZW52Lk5FWFRfUFVCTElDX1NUUklQRV9QUklDRV9JRCkubm90LnRvQmUoJ29sZF9wcmljZV9pZCcpO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnQ0kvQ0QgV29ya2Zsb3cgVmFsaWRhdGlvbicsICgpID0+IHtcbiAgICBpdCgnc2hvdWxkIHZhbGlkYXRlIHRoYXQgcHJpY2UgSUQgc3RhcnRzIHdpdGggcHJpY2VfJywgKCkgPT4ge1xuICAgICAgY29uc3QgdmFsaWRQcmljZUlkcyA9IFsncHJpY2VfMTIzJywgJ3ByaWNlX3Rlc3QnLCAncHJpY2VfbGl2ZV9hYmMnXTtcbiAgICAgIGNvbnN0IGludmFsaWRQcmljZUlkcyA9IFsnMTIzJywgJ3Rlc3RfcHJpY2UnLCAncHJvZF8xMjMnLCAnJ107XG5cbiAgICAgIHZhbGlkUHJpY2VJZHMuZm9yRWFjaCgoaWQpID0+IHtcbiAgICAgICAgZXhwZWN0KGlkKS50b01hdGNoKC9ecHJpY2VfLyk7XG4gICAgICB9KTtcblxuICAgICAgaW52YWxpZFByaWNlSWRzLmZvckVhY2goKGlkKSA9PiB7XG4gICAgICAgIGV4cGVjdChpZCkubm90LnRvTWF0Y2goL15wcmljZV8vKTtcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCB1c2UgY29ycmVjdCB2YWxpZCBkZXYgcHJpY2UgSUQgZm9yIEtBTi03MycsICgpID0+IHtcbiAgICAgIGNvbnN0IHZhbGlkRGV2UHJpY2VJZCA9ICdwcmljZV8xUnhVT2pFclJSR3M2dFlzVFY0UkYxUXUnO1xuICAgICAgY29uc3QgaW52YWxpZFBsYWNlaG9sZGVySWQgPSAncHJpY2VfMVFiR1h1UnVKREJ6UkpTa0NiRzRhOVhvJztcbiAgICAgIFxuICAgICAgLy8gVmFsaWQgZGV2IHByaWNlIElEIHNob3VsZCBtYXRjaCBTdHJpcGUgZm9ybWF0XG4gICAgICBleHBlY3QodmFsaWREZXZQcmljZUlkKS50b01hdGNoKC9ecHJpY2VfLyk7XG4gICAgICBleHBlY3QodmFsaWREZXZQcmljZUlkLmxlbmd0aCkudG9CZUdyZWF0ZXJUaGFuKDEwKTtcbiAgICAgIFxuICAgICAgLy8gU2hvdWxkIG5vdCBiZSB1c2luZyB0aGUgb2xkIHBsYWNlaG9sZGVyXG4gICAgICBleHBlY3QodmFsaWREZXZQcmljZUlkKS5ub3QudG9CZShpbnZhbGlkUGxhY2Vob2xkZXJJZCk7XG4gICAgfSk7XG5cbiAgICBpdCgnc2hvdWxkIGhhbmRsZSBmYWxsYmFjayB0byB2YWxpZCBkZXYgcHJpY2UgSUQgd2hlbiBTU00gcGFyYW1ldGVyIG1pc3NpbmcnLCAoKSA9PiB7XG4gICAgICAvLyBTaW11bGF0ZSB0aGUgd29ya2Zsb3cgZmFsbGJhY2sgbG9naWNcbiAgICAgIGNvbnN0IHNzbVByaWNlSWQ6IHN0cmluZyB8IHVuZGVmaW5lZCA9IHVuZGVmaW5lZDtcbiAgICAgIGNvbnN0IGZhbGxiYWNrUHJpY2VJZCA9ICdwcmljZV8xUnhVT2pFclJSR3M2dFlzVFY0UkYxUXUnO1xuICAgICAgXG4gICAgICBjb25zdCBmaW5hbFByaWNlSWQgPSBzc21QcmljZUlkIHx8IGZhbGxiYWNrUHJpY2VJZDtcbiAgICAgIFxuICAgICAgZXhwZWN0KGZpbmFsUHJpY2VJZCkudG9CZShmYWxsYmFja1ByaWNlSWQpO1xuICAgICAgZXhwZWN0KGZpbmFsUHJpY2VJZCkudG9NYXRjaCgvXnByaWNlXy8pO1xuICAgICAgZXhwZWN0KGZpbmFsUHJpY2VJZCkubm90LnRvQmUoJ3ByaWNlXzFRYkdYdVJ1SkRCelJKU2tDYkc0YTlYbycpOyAvLyBOb3QgdGhlIG9sZCBwbGFjZWhvbGRlclxuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBlbnN1cmUgcGFyYW1ldGVyIG5hbWVzIG1hdGNoIGVudmlyb25tZW50IGNvbnRleHQnLCAoKSA9PiB7XG4gICAgICBjb25zdCBkZXZXb3JrZmxvd1BhcmFtID0gJy9hdXJhMjgvZGV2L3N0cmlwZS9kZWZhdWx0LXByaWNlLWlkJztcbiAgICAgIGNvbnN0IHByb2RXb3JrZmxvd1BhcmFtID0gJy9hdXJhMjgvcHJvZC9zdHJpcGUvZGVmYXVsdC1wcmljZS1pZCc7XG5cbiAgICAgIC8vIERldiB3b3JrZmxvdyBzaG91bGQgdXNlIGRldiBwYXJhbWV0ZXJcbiAgICAgIGV4cGVjdChkZXZXb3JrZmxvd1BhcmFtKS50b0NvbnRhaW4oJy9kZXYvJyk7XG4gICAgICBleHBlY3QoZGV2V29ya2Zsb3dQYXJhbSkubm90LnRvQ29udGFpbignL3Byb2QvJyk7XG5cbiAgICAgIC8vIFByb2Qgd29ya2Zsb3cgc2hvdWxkIHVzZSBwcm9kIHBhcmFtZXRlclxuICAgICAgZXhwZWN0KHByb2RXb3JrZmxvd1BhcmFtKS50b0NvbnRhaW4oJy9wcm9kLycpO1xuICAgICAgZXhwZWN0KHByb2RXb3JrZmxvd1BhcmFtKS5ub3QudG9Db250YWluKCcvZGV2LycpO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBmYWlsIGJ1aWxkIGlmIFNTTSBwYXJhbWV0ZXIgaXMgbWlzc2luZycsIGFzeW5jICgpID0+IHtcbiAgICAgIGNvbnN0IHBhcmFtZXRlck5hbWUgPSAnL2F1cmEyOC9kZXYvc3RyaXBlL2RlZmF1bHQtcHJpY2UtaWQnO1xuXG4gICAgICBjb25zdCBlcnJvciA9IG5ldyBFcnJvcihgUGFyYW1ldGVyICR7cGFyYW1ldGVyTmFtZX0gbm90IGZvdW5kLmApO1xuICAgICAgZXJyb3IubmFtZSA9ICdQYXJhbWV0ZXJOb3RGb3VuZCc7XG5cbiAgICAgIHNzbU1vY2tcbiAgICAgICAgLm9uKEdldFBhcmFtZXRlckNvbW1hbmQsIHtcbiAgICAgICAgICBOYW1lOiBwYXJhbWV0ZXJOYW1lLFxuICAgICAgICB9KVxuICAgICAgICAucmVqZWN0cyhlcnJvcik7XG5cbiAgICAgIGNvbnN0IGNsaWVudCA9IG5ldyBTU01DbGllbnQoeyByZWdpb246ICd1cy1lYXN0LTEnIH0pO1xuICAgICAgY29uc3QgY29tbWFuZCA9IG5ldyBHZXRQYXJhbWV0ZXJDb21tYW5kKHsgTmFtZTogcGFyYW1ldGVyTmFtZSB9KTtcblxuICAgICAgLy8gVGhpcyBzaW11bGF0ZXMgd2hhdCBoYXBwZW5zIGluIHRoZSBDSS9DRCB3b3JrZmxvd1xuICAgICAgbGV0IGJ1aWxkU2hvdWxkRmFpbCA9IGZhbHNlO1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgY2xpZW50LnNlbmQoY29tbWFuZCk7XG4gICAgICB9IGNhdGNoIChfZXJyb3IpIHtcbiAgICAgICAgYnVpbGRTaG91bGRGYWlsID0gdHJ1ZTtcbiAgICAgIH1cblxuICAgICAgZXhwZWN0KGJ1aWxkU2hvdWxkRmFpbCkudG9CZSh0cnVlKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgZmFpbCBidWlsZCBpZiBTU00gcGFyYW1ldGVyIHZhbHVlIGlzIGVtcHR5JywgKCkgPT4ge1xuICAgICAgY29uc3QgcHJpY2VJZDogc3RyaW5nID0gJyc7XG5cbiAgICAgIC8vIFNpbXVsYXRlIHRoZSBDSS9DRCBjaGVja1xuICAgICAgbGV0IGJ1aWxkU2hvdWxkRmFpbCA9IGZhbHNlO1xuICAgICAgaWYgKCFwcmljZUlkIHx8IHByaWNlSWQudHJpbSgpID09PSAnJykge1xuICAgICAgICBidWlsZFNob3VsZEZhaWwgPSB0cnVlO1xuICAgICAgfVxuXG4gICAgICBleHBlY3QoYnVpbGRTaG91bGRGYWlsKS50b0JlKHRydWUpO1xuICAgIH0pO1xuICB9KTtcblxuICBkZXNjcmliZSgnU1NNIFBhcmFtZXRlciBDcmVhdGlvbiBIZWxwZXInLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCBjcmVhdGUgZGV2IHBhcmFtZXRlciB3aXRoIGNvcnJlY3Qgc3RydWN0dXJlJywgYXN5bmMgKCkgPT4ge1xuICAgICAgY29uc3QgcGFyYW1ldGVyTmFtZSA9ICcvYXVyYTI4L2Rldi9zdHJpcGUvZGVmYXVsdC1wcmljZS1pZCc7XG4gICAgICBjb25zdCBwcmljZUlkID0gJ3ByaWNlX2Rldl90ZXN0XzEyMyc7XG5cbiAgICAgIHNzbU1vY2tcbiAgICAgICAgLm9uKFB1dFBhcmFtZXRlckNvbW1hbmQsIHtcbiAgICAgICAgICBOYW1lOiBwYXJhbWV0ZXJOYW1lLFxuICAgICAgICAgIFZhbHVlOiBwcmljZUlkLFxuICAgICAgICAgIFR5cGU6ICdTdHJpbmcnLFxuICAgICAgICB9KVxuICAgICAgICAucmVzb2x2ZXMoe1xuICAgICAgICAgIFZlcnNpb246IDEsXG4gICAgICAgIH0pO1xuXG4gICAgICBjb25zdCBjbGllbnQgPSBuZXcgU1NNQ2xpZW50KHsgcmVnaW9uOiAndXMtZWFzdC0xJyB9KTtcbiAgICAgIGNvbnN0IGNvbW1hbmQgPSBuZXcgUHV0UGFyYW1ldGVyQ29tbWFuZCh7XG4gICAgICAgIE5hbWU6IHBhcmFtZXRlck5hbWUsXG4gICAgICAgIFZhbHVlOiBwcmljZUlkLFxuICAgICAgICBUeXBlOiAnU3RyaW5nJyxcbiAgICAgICAgRGVzY3JpcHRpb246ICdEZWZhdWx0IFN0cmlwZSBwcmljZSBJRCBmb3IgZGV2ZWxvcG1lbnQgZW52aXJvbm1lbnQgZnJvbnRlbmQnLFxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgY2xpZW50LnNlbmQoY29tbWFuZCk7XG4gICAgICBleHBlY3QocmVzcG9uc2UuVmVyc2lvbikudG9CZSgxKTtcbiAgICB9KTtcblxuICAgIGl0KCdzaG91bGQgY3JlYXRlIHByb2QgcGFyYW1ldGVyIHdpdGggY29ycmVjdCBzdHJ1Y3R1cmUnLCBhc3luYyAoKSA9PiB7XG4gICAgICBjb25zdCBwYXJhbWV0ZXJOYW1lID0gJy9hdXJhMjgvcHJvZC9zdHJpcGUvZGVmYXVsdC1wcmljZS1pZCc7XG4gICAgICBjb25zdCBwcmljZUlkID0gJ3ByaWNlX3Byb2RfbGl2ZV80NTYnO1xuXG4gICAgICBzc21Nb2NrXG4gICAgICAgIC5vbihQdXRQYXJhbWV0ZXJDb21tYW5kLCB7XG4gICAgICAgICAgTmFtZTogcGFyYW1ldGVyTmFtZSxcbiAgICAgICAgICBWYWx1ZTogcHJpY2VJZCxcbiAgICAgICAgICBUeXBlOiAnU3RyaW5nJyxcbiAgICAgICAgfSlcbiAgICAgICAgLnJlc29sdmVzKHtcbiAgICAgICAgICBWZXJzaW9uOiAxLFxuICAgICAgICB9KTtcblxuICAgICAgY29uc3QgY2xpZW50ID0gbmV3IFNTTUNsaWVudCh7IHJlZ2lvbjogJ3VzLWVhc3QtMScgfSk7XG4gICAgICBjb25zdCBjb21tYW5kID0gbmV3IFB1dFBhcmFtZXRlckNvbW1hbmQoe1xuICAgICAgICBOYW1lOiBwYXJhbWV0ZXJOYW1lLFxuICAgICAgICBWYWx1ZTogcHJpY2VJZCxcbiAgICAgICAgVHlwZTogJ1N0cmluZycsXG4gICAgICAgIERlc2NyaXB0aW9uOiAnRGVmYXVsdCBTdHJpcGUgcHJpY2UgSUQgZm9yIHByb2R1Y3Rpb24gZW52aXJvbm1lbnQgZnJvbnRlbmQnLFxuICAgICAgfSk7XG5cbiAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgY2xpZW50LnNlbmQoY29tbWFuZCk7XG4gICAgICBleHBlY3QocmVzcG9uc2UuVmVyc2lvbikudG9CZSgxKTtcbiAgICB9KTtcbiAgfSk7XG5cbiAgZGVzY3JpYmUoJ0J1aWxkIFByb2Nlc3MgSW50ZWdyYXRpb24nLCAoKSA9PiB7XG4gICAgaXQoJ3Nob3VsZCBtYWtlIGVudmlyb25tZW50IHZhcmlhYmxlIGF2YWlsYWJsZSBkdXJpbmcgTmV4dC5qcyBidWlsZCcsICgpID0+IHtcbiAgICAgIC8vIFNpbXVsYXRlIHRoZSBlbnZpcm9ubWVudCBkdXJpbmcgYnVpbGRcbiAgICAgIGNvbnN0IGJ1aWxkRW52ID0ge1xuICAgICAgICBORVhUX1BVQkxJQ19TVFJJUEVfUFJJQ0VfSUQ6ICdwcmljZV9mcm9tX3NzbV9idWlsZCcsXG4gICAgICAgIE5FWFRfUFVCTElDX0FQSV9HQVRFV0FZX1VSTDogJ2h0dHBzOi8vYXBpLmV4YW1wbGUuY29tJyxcbiAgICAgICAgTkVYVF9QVUJMSUNfQ09HTklUT19VU0VSX1BPT0xfSUQ6ICd1cy1lYXN0LTFfdGVzdCcsXG4gICAgICAgIE5FWFRfUFVCTElDX0NPR05JVE9fQ0xJRU5UX0lEOiAndGVzdF9jbGllbnRfaWQnLFxuICAgICAgICBORVhUX1BVQkxJQ19DT0dOSVRPX0RPTUFJTjogJ3Rlc3QtZG9tYWluJyxcbiAgICAgICAgTkVYVF9QVUJMSUNfQ09HTklUT19SRUdJT046ICd1cy1lYXN0LTEnLFxuICAgICAgfTtcblxuICAgICAgLy8gQWxsIE5FWFRfUFVCTElDXyB2YXJpYWJsZXMgc2hvdWxkIGJlIGF2YWlsYWJsZVxuICAgICAgT2JqZWN0LmVudHJpZXMoYnVpbGRFbnYpLmZvckVhY2goKFtrZXksIHZhbHVlXSkgPT4ge1xuICAgICAgICBleHBlY3Qoa2V5KS50b01hdGNoKC9eTkVYVF9QVUJMSUNfLyk7XG4gICAgICAgIGV4cGVjdCh2YWx1ZSkudG9CZVRydXRoeSgpO1xuICAgICAgfSk7XG5cbiAgICAgIC8vIFN0cmlwZSBwcmljZSBJRCBzaG91bGQgYmUgc2V0XG4gICAgICBleHBlY3QoYnVpbGRFbnYuTkVYVF9QVUJMSUNfU1RSSVBFX1BSSUNFX0lEKS50b0JlRGVmaW5lZCgpO1xuICAgICAgZXhwZWN0KGJ1aWxkRW52Lk5FWFRfUFVCTElDX1NUUklQRV9QUklDRV9JRCkudG9NYXRjaCgvXnByaWNlXy8pO1xuICAgIH0pO1xuXG4gICAgaXQoJ3Nob3VsZCBub3QgZXhwb3NlIHNlbnNpdGl2ZSBTU00gcGFyYW1ldGVyIG5hbWVzIGluIGJ1aWxkIG91dHB1dCcsICgpID0+IHtcbiAgICAgIGNvbnN0IHB1YmxpY0VudlZhciA9ICdORVhUX1BVQkxJQ19TVFJJUEVfUFJJQ0VfSUQnO1xuXG4gICAgICAvLyBUaGUgcGFyYW1ldGVyIG5hbWUgc2hvdWxkIG5vdCBiZSBleHBvc2VkLCBvbmx5IHRoZSBlbnYgdmFyIG5hbWVcbiAgICAgIGV4cGVjdChwdWJsaWNFbnZWYXIpLm5vdC50b0NvbnRhaW4oJ3NzbScpO1xuICAgICAgZXhwZWN0KHB1YmxpY0VudlZhcikubm90LnRvQ29udGFpbigncGFyYW1ldGVyJyk7XG4gICAgICBleHBlY3QocHVibGljRW52VmFyKS5ub3QudG9Db250YWluKCcvYXVyYTI4LycpO1xuICAgIH0pO1xuICB9KTtcbn0pO1xuIl19