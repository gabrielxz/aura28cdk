"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const client_ssm_1 = require("@aws-sdk/client-ssm");
const client_s3_1 = require("@aws-sdk/client-s3");
const uuid_1 = require("uuid");
const dynamoClient = new client_dynamodb_1.DynamoDBClient({});
const dynamoDoc = lib_dynamodb_1.DynamoDBDocumentClient.from(dynamoClient);
const ssmClient = new client_ssm_1.SSMClient({});
const s3Client = new client_s3_1.S3Client({});
// Helper function to create sanitized error response
const createErrorResponse = (error, corsHeaders, context = {}) => {
    // Log detailed error to CloudWatch
    console.error('Error generating reading:', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        ...context,
        timestamp: new Date().toISOString(),
    });
    // Return generic error message to user
    return {
        statusCode: 500,
        headers: corsHeaders,
        body: JSON.stringify({
            message: "We're sorry, but we couldn't generate your reading at this time. Please try again later.",
        }),
    };
};
// Cache configuration on cold start
let cachedConfig = null;
// Fallback prompts in case S3 fails
const FALLBACK_SYSTEM_PROMPT = 'You are an expert astrologer providing Soul Blueprint readings based on natal charts.';
const FALLBACK_USER_TEMPLATE = `Generate a Soul Blueprint reading for:
Name: {{birthName}}
Birth: {{birthDate}} {{birthTime}}
Location: {{birthCity}}, {{birthState}}, {{birthCountry}}

Natal Chart:
{{natalChartData}}

Provide insights on sun sign, moon sign, rising sign, and life path.`;
async function fetchS3Content(bucket, key) {
    try {
        const response = await s3Client.send(new client_s3_1.GetObjectCommand({
            Bucket: bucket,
            Key: key,
        }));
        const content = (await response.Body?.transformToString()) || '';
        console.log(`Fetched S3 object: ${key}, ETag: ${response.ETag}`);
        return { content, etag: response.ETag };
    }
    catch (error) {
        console.error(`Failed to fetch S3 object ${key}:`, error);
        throw error;
    }
}
async function getOpenAIConfig() {
    // Return cached config if available
    if (cachedConfig) {
        console.log('Using cached configuration');
        return cachedConfig.config;
    }
    console.log('Loading configuration from SSM and S3...');
    const parameterNames = [
        process.env.OPENAI_API_KEY_PARAMETER_NAME,
        process.env.READING_MODEL_PARAMETER_NAME,
        process.env.READING_TEMPERATURE_PARAMETER_NAME,
        process.env.READING_MAX_TOKENS_PARAMETER_NAME,
        process.env.SYSTEM_PROMPT_S3KEY_PARAMETER_NAME,
        process.env.USER_PROMPT_S3KEY_PARAMETER_NAME,
    ];
    const bucketName = process.env.CONFIG_BUCKET_NAME;
    if (!bucketName) {
        throw new Error('CONFIG_BUCKET_NAME environment variable not set');
    }
    // Validate all parameter names are present
    const missingParams = parameterNames
        .map((name, index) => {
        const labels = [
            'OPENAI_API_KEY_PARAMETER_NAME',
            'READING_MODEL_PARAMETER_NAME',
            'READING_TEMPERATURE_PARAMETER_NAME',
            'READING_MAX_TOKENS_PARAMETER_NAME',
            'SYSTEM_PROMPT_S3KEY_PARAMETER_NAME',
            'USER_PROMPT_S3KEY_PARAMETER_NAME',
        ];
        return name ? null : labels[index];
    })
        .filter(Boolean);
    if (missingParams.length > 0) {
        throw new Error(`Missing environment variables: ${missingParams.join(', ')}`);
    }
    // Fetch all SSM parameters in parallel
    const parameterPromises = parameterNames.map((name) => ssmClient.send(new client_ssm_1.GetParameterCommand({
        Name: name,
        WithDecryption: true,
    })));
    const responses = await Promise.all(parameterPromises);
    // Extract SSM values
    const ssmValues = responses.map((response, index) => {
        if (!response.Parameter?.Value) {
            throw new Error(`Parameter ${parameterNames[index]} not found in SSM`);
        }
        return response.Parameter.Value;
    });
    // Log parameter names (not values) for debugging
    console.log('Loaded SSM parameters:', {
        model: process.env.READING_MODEL_PARAMETER_NAME,
        temperature: process.env.READING_TEMPERATURE_PARAMETER_NAME,
        maxTokens: process.env.READING_MAX_TOKENS_PARAMETER_NAME,
        systemPromptKey: ssmValues[4],
        userPromptKey: ssmValues[5],
    });
    // Fetch prompts from S3
    let systemPrompt = FALLBACK_SYSTEM_PROMPT;
    let userPromptTemplate = FALLBACK_USER_TEMPLATE;
    let systemETag;
    let userETag;
    try {
        const [systemResult, userResult] = await Promise.all([
            fetchS3Content(bucketName, ssmValues[4]),
            fetchS3Content(bucketName, ssmValues[5]),
        ]);
        systemPrompt = systemResult.content || FALLBACK_SYSTEM_PROMPT;
        userPromptTemplate = userResult.content || FALLBACK_USER_TEMPLATE;
        systemETag = systemResult.etag;
        userETag = userResult.etag;
    }
    catch (error) {
        console.error('Failed to fetch prompts from S3, using fallback prompts:', error);
    }
    const config = {
        apiKey: ssmValues[0],
        model: ssmValues[1],
        temperature: parseFloat(ssmValues[2]),
        maxTokens: parseInt(ssmValues[3], 10),
        systemPrompt,
        userPromptTemplate,
    };
    // Cache the configuration
    cachedConfig = {
        config,
        systemPromptETag: systemETag,
        userPromptETag: userETag,
    };
    return config;
}
async function getUserProfile(userId) {
    const response = await dynamoDoc.send(new lib_dynamodb_1.GetCommand({
        TableName: process.env.USER_TABLE_NAME,
        Key: {
            userId,
            createdAt: 'PROFILE',
        },
    }));
    return response.Item;
}
async function getNatalChart(userId) {
    const response = await dynamoDoc.send(new lib_dynamodb_1.GetCommand({
        TableName: process.env.NATAL_CHART_TABLE_NAME,
        Key: {
            userId,
        },
    }));
    return response.Item;
}
async function callOpenAI(prompt, config) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
            model: config.model,
            messages: [
                {
                    role: 'system',
                    content: config.systemPrompt,
                },
                {
                    role: 'user',
                    content: prompt,
                },
            ],
            temperature: config.temperature,
            max_tokens: config.maxTokens,
        }),
    });
    if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }
    const data = (await response.json());
    return data.choices[0].message.content;
}
// Type guard to check if this is an internal invocation with proper verification
function isInternalInvocation(event) {
    if (typeof event !== 'object' ||
        event === null ||
        !('source' in event) ||
        !('userId' in event) ||
        'pathParameters' in event) {
        return false;
    }
    const potentialInternalEvent = event;
    // Verify the internal invocation secret
    const expectedSecret = process.env.INTERNAL_INVOCATION_SECRET;
    if (!expectedSecret) {
        console.error('INTERNAL_INVOCATION_SECRET not configured');
        return false;
    }
    // Check if the event contains the correct secret
    if (potentialInternalEvent.internalSecret !== expectedSecret) {
        console.warn('Invalid internal invocation secret provided');
        return false;
    }
    return (potentialInternalEvent.source === 'webhook' && typeof potentialInternalEvent.userId === 'string');
}
const handler = async (event) => {
    console.log('Event:', JSON.stringify(event));
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'POST,OPTIONS',
    };
    try {
        let userId;
        let metadata = {};
        // Check if this is an internal invocation from webhook handler
        if (isInternalInvocation(event)) {
            console.info('Internal invocation from webhook handler:', {
                userId: event.userId,
                metadata: event.metadata,
            });
            userId = event.userId;
            metadata = event.metadata || {};
        }
        else {
            // Standard API Gateway invocation
            const apiEvent = event;
            // Extract userId from path
            userId = apiEvent.pathParameters?.userId || '';
            if (!userId) {
                return {
                    statusCode: 400,
                    headers: corsHeaders,
                    body: JSON.stringify({ message: 'userId is required' }),
                };
            }
            // Verify authenticated user matches requested userId
            const requestContext = apiEvent.requestContext;
            const authenticatedUserId = requestContext?.authorizer?.claims?.sub;
            if (authenticatedUserId !== userId) {
                return {
                    statusCode: 403,
                    headers: corsHeaders,
                    body: JSON.stringify({ message: 'Unauthorized to generate reading for this user' }),
                };
            }
            // Parse metadata from request body if present
            if (apiEvent.body) {
                try {
                    const parsed = JSON.parse(apiEvent.body);
                    metadata = parsed.metadata || {};
                }
                catch {
                    // Ignore parsing errors
                }
            }
        }
        // Get user profile and natal chart
        const [userProfile, natalChart] = await Promise.all([
            getUserProfile(userId),
            getNatalChart(userId),
        ]);
        if (!userProfile) {
            return {
                statusCode: 404,
                headers: corsHeaders,
                body: JSON.stringify({ message: 'User profile not found' }),
            };
        }
        if (!natalChart) {
            return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({
                    message: 'Natal chart not generated. Please complete your profile first.',
                }),
            };
        }
        // Log natal chart status for debugging
        console.info('Natal chart fetched:', {
            userId,
            hasNatalChart: !!natalChart,
            natalChartKeys: natalChart ? Object.keys(natalChart) : [],
            natalChartSize: natalChart ? JSON.stringify(natalChart).length : 0,
        });
        // Generate reading ID and timestamp
        const readingId = (0, uuid_1.v4)();
        const timestamp = new Date().toISOString();
        // Create the reading record with status 'Processing'
        const readingRecord = {
            userId,
            readingId,
            type: 'Soul Blueprint',
            status: 'Processing',
            createdAt: timestamp,
            updatedAt: timestamp,
            ...(Object.keys(metadata).length > 0 && { metadata }), // Include metadata if present
        };
        // Save initial reading record
        await dynamoDoc.send(new lib_dynamodb_1.PutCommand({
            TableName: process.env.READINGS_TABLE_NAME,
            Item: readingRecord,
        }));
        try {
            // Get OpenAI configuration
            const openAIConfig = await getOpenAIConfig();
            // Build user prompt from template
            const userPrompt = openAIConfig.userPromptTemplate
                .replace('{{birthName}}', userProfile.profile?.birthName || 'Unknown')
                .replace('{{birthDate}}', userProfile.profile?.birthDate || 'Unknown')
                .replace('{{birthTime}}', userProfile.profile?.birthTime || 'Unknown')
                .replace('{{birthCity}}', userProfile.profile?.birthCity || 'Unknown')
                .replace('{{birthState}}', userProfile.profile?.birthState || 'Unknown')
                .replace('{{birthCountry}}', userProfile.profile?.birthCountry || 'Unknown')
                .replace('{{natalChartData}}', JSON.stringify(natalChart, null, 2));
            // Log prompt info for debugging
            console.info('Prompt built:', {
                templateLength: openAIConfig.userPromptTemplate.length,
                promptLength: userPrompt.length,
                includesNatalChart: userPrompt.includes('planets'),
                natalChartInPrompt: userPrompt.includes(JSON.stringify(natalChart, null, 2)),
            });
            // Call OpenAI API
            const content = await callOpenAI(userPrompt, openAIConfig);
            // Update reading with content and status
            const updatedReading = {
                ...readingRecord,
                content,
                status: 'Ready',
                updatedAt: new Date().toISOString(),
            };
            await dynamoDoc.send(new lib_dynamodb_1.PutCommand({
                TableName: process.env.READINGS_TABLE_NAME,
                Item: updatedReading,
            }));
            return {
                statusCode: 200,
                headers: corsHeaders,
                body: JSON.stringify({
                    message: 'Reading generated successfully',
                    readingId,
                    status: 'Ready',
                }),
            };
        }
        catch (error) {
            // Log detailed error for debugging
            console.error('Error during reading generation:', {
                error: error instanceof Error ? error.message : 'Unknown error',
                stack: error instanceof Error ? error.stack : undefined,
                userId,
                readingId,
                timestamp: new Date().toISOString(),
            });
            // Update reading status to Failed with sanitized error
            await dynamoDoc.send(new lib_dynamodb_1.PutCommand({
                TableName: process.env.READINGS_TABLE_NAME,
                Item: {
                    ...readingRecord,
                    status: 'Failed',
                    error: 'GENERATION_FAILED', // Sanitized error indicator
                    updatedAt: new Date().toISOString(),
                },
            }));
            throw error;
        }
    }
    catch (error) {
        // Use helper function to create sanitized error response
        const contextData = isInternalInvocation(event)
            ? { userId: event.userId, source: 'webhook' }
            : {
                userId: event.pathParameters?.userId,
                path: event.path,
                method: event.httpMethod,
            };
        return createErrorResponse(error, corsHeaders, contextData);
    }
};
exports.handler = handler;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGUtcmVhZGluZy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImdlbmVyYXRlLXJlYWRpbmcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQ0EsOERBQTBEO0FBQzFELHdEQUF1RjtBQUN2RixvREFBcUU7QUFDckUsa0RBQWdFO0FBQ2hFLCtCQUFvQztBQUVwQyxNQUFNLFlBQVksR0FBRyxJQUFJLGdDQUFjLENBQUMsRUFBRSxDQUFDLENBQUM7QUFDNUMsTUFBTSxTQUFTLEdBQUcscUNBQXNCLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDO0FBQzVELE1BQU0sU0FBUyxHQUFHLElBQUksc0JBQVMsQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUNwQyxNQUFNLFFBQVEsR0FBRyxJQUFJLG9CQUFRLENBQUMsRUFBRSxDQUFDLENBQUM7QUFFbEMscURBQXFEO0FBQ3JELE1BQU0sbUJBQW1CLEdBQUcsQ0FDMUIsS0FBYyxFQUNkLFdBQW1DLEVBQ25DLFVBQW1DLEVBQUUsRUFDZCxFQUFFO0lBQ3pCLG1DQUFtQztJQUNuQyxPQUFPLENBQUMsS0FBSyxDQUFDLDJCQUEyQixFQUFFO1FBQ3pDLEtBQUssRUFBRSxLQUFLLFlBQVksS0FBSyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQyxlQUFlO1FBQy9ELEtBQUssRUFBRSxLQUFLLFlBQVksS0FBSyxDQUFDLENBQUMsQ0FBQyxLQUFLLENBQUMsS0FBSyxDQUFDLENBQUMsQ0FBQyxTQUFTO1FBQ3ZELEdBQUcsT0FBTztRQUNWLFNBQVMsRUFBRSxJQUFJLElBQUksRUFBRSxDQUFDLFdBQVcsRUFBRTtLQUNwQyxDQUFDLENBQUM7SUFFSCx1Q0FBdUM7SUFDdkMsT0FBTztRQUNMLFVBQVUsRUFBRSxHQUFHO1FBQ2YsT0FBTyxFQUFFLFdBQVc7UUFDcEIsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUM7WUFDbkIsT0FBTyxFQUNMLDBGQUEwRjtTQUM3RixD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QVMsRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLG1CQUFvQjtnQkFDM0MsSUFBSSxFQUFFO29CQUNKLEdBQUcsYUFBYTtvQkFDaEIsTUFBTSxFQUFFLFFBQVE7b0JBQ2hCLEtBQUssRUFBRSxtQkFBbUIsRUFBRSw0QkFBNEI7b0JBQ3hELFNBQVMsRUFBRSxJQUFJLElBQUksRUFBRSxDQUFDLFdBQVcsRUFBRTtpQkFDcEM7YUFDRixDQUFDLENBQ0gsQ0FBQztZQUVGLE1BQU0sS0FBSyxDQUFDO1FBQ2QsQ0FBQztJQUNILENBQUM7SUFBQyxPQUFPLEtBQUssRUFBRSxDQUFDO1FBQ2YseURBQXlEO1FBQ3pELE1BQU0sV0FBVyxHQUE0QixvQkFBb0IsQ0FBQyxLQUFLLENBQUM7WUFDdEUsQ0FBQyxDQUFDLEVBQUUsTUFBTSxFQUFFLEtBQUssQ0FBQyxNQUFNLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRTtZQUM3QyxDQUFDLENBQUM7Z0JBQ0UsTUFBTSxFQUFHLEtBQThCLENBQUMsY0FBYyxFQUFFLE1BQU07Z0JBQzlELElBQUksRUFBRyxLQUE4QixDQUFDLElBQUk7Z0JBQzFDLE1BQU0sRUFBRyxLQUE4QixDQUFDLFVBQVU7YUFDbkQsQ0FBQztRQUVOLE9BQU8sbUJBQW1CLENBQUMsS0FBSyxFQUFFLFdBQVcsRUFBRSxXQUFXLENBQUMsQ0FBQztJQUM5RCxDQUFDO0FBQ0gsQ0FBQyxDQUFDO0FBMU1XLFFBQUEsT0FBTyxXQTBNbEIiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBBUElHYXRld2F5UHJveHlFdmVudCwgQVBJR2F0ZXdheVByb3h5UmVzdWx0IH0gZnJvbSAnYXdzLWxhbWJkYSc7XG5pbXBvcnQgeyBEeW5hbW9EQkNsaWVudCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1keW5hbW9kYic7XG5pbXBvcnQgeyBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LCBQdXRDb21tYW5kLCBHZXRDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvbGliLWR5bmFtb2RiJztcbmltcG9ydCB7IFNTTUNsaWVudCwgR2V0UGFyYW1ldGVyQ29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1zc20nO1xuaW1wb3J0IHsgUzNDbGllbnQsIEdldE9iamVjdENvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtczMnO1xuaW1wb3J0IHsgdjQgYXMgdXVpZHY0IH0gZnJvbSAndXVpZCc7XG5cbmNvbnN0IGR5bmFtb0NsaWVudCA9IG5ldyBEeW5hbW9EQkNsaWVudCh7fSk7XG5jb25zdCBkeW5hbW9Eb2MgPSBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LmZyb20oZHluYW1vQ2xpZW50KTtcbmNvbnN0IHNzbUNsaWVudCA9IG5ldyBTU01DbGllbnQoe30pO1xuY29uc3QgczNDbGllbnQgPSBuZXcgUzNDbGllbnQoe30pO1xuXG4vLyBIZWxwZXIgZnVuY3Rpb24gdG8gY3JlYXRlIHNhbml0aXplZCBlcnJvciByZXNwb25zZVxuY29uc3QgY3JlYXRlRXJyb3JSZXNwb25zZSA9IChcbiAgZXJyb3I6IHVua25vd24sXG4gIGNvcnNIZWFkZXJzOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmc+LFxuICBjb250ZXh0OiBSZWNvcmQ8c3RyaW5nLCB1bmtub3duPiA9IHt9LFxuKTogQVBJR2F0ZXdheVByb3h5UmVzdWx0ID0+IHtcbiAgLy8gTG9nIGRldGFpbGVkIGVycm9yIHRvIENsb3VkV2F0Y2hcbiAgY29uc29sZS5lcnJvcignRXJyb3IgZ2VuZXJhdGluZyByZWFkaW5nOicsIHtcbiAgICBlcnJvcjogZXJyb3IgaW5zdGFuY2VvZiBFcnJvciA/IGVycm9yLm1lc3NhZ2UgOiAnVW5rbm93biBlcnJvcicsXG4gICAgc3RhY2s6IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5zdGFjayA6IHVuZGVmaW5lZCxcbiAgICAuLi5jb250ZXh0LFxuICAgIHRpbWVzdGFtcDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICB9KTtcblxuICAvLyBSZXR1cm4gZ2VuZXJpYyBlcnJvciBtZXNzYWdlIHRvIHVzZXJcbiAgcmV0dXJuIHtcbiAgICBzdGF0dXNDb2RlOiA1MDAsXG4gICAgaGVhZGVyczogY29yc0hlYWRlcnMsXG4gICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgbWVzc2FnZTpcbiAgICAgICAgXCJXZSdyZSBzb3JyeSwgYnV0IHdlIGNvdWxkbid0IGdlbmVyYXRlIHlvdXIgcmVhZGluZyBhdCB0aGlzIHRpbWUuIFBsZWFzZSB0cnkgYWdhaW4gbGF0ZXIuXCIsXG4gICAgfSksXG4gIH07XG59O1xuXG5pbnRlcmZhY2UgT3BlbkFJQ29uZmlnIHtcbiAgYXBpS2V5OiBzdHJpbmc7XG4gIG1vZGVsOiBzdHJpbmc7XG4gIHRlbXBlcmF0dXJlOiBudW1iZXI7XG4gIG1heFRva2VuczogbnVtYmVyO1xuICBzeXN0ZW1Qcm9tcHQ6IHN0cmluZztcbiAgdXNlclByb21wdFRlbXBsYXRlOiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBDYWNoZWRDb25maWcge1xuICBjb25maWc6IE9wZW5BSUNvbmZpZztcbiAgc3lzdGVtUHJvbXB0RVRhZz86IHN0cmluZztcbiAgdXNlclByb21wdEVUYWc/OiBzdHJpbmc7XG59XG5cbi8vIENhY2hlIGNvbmZpZ3VyYXRpb24gb24gY29sZCBzdGFydFxubGV0IGNhY2hlZENvbmZpZzogQ2FjaGVkQ29uZmlnIHwgbnVsbCA9IG51bGw7XG5cbi8vIEZhbGxiYWNrIHByb21wdHMgaW4gY2FzZSBTMyBmYWlsc1xuY29uc3QgRkFMTEJBQ0tfU1lTVEVNX1BST01QVCA9XG4gICdZb3UgYXJlIGFuIGV4cGVydCBhc3Ryb2xvZ2VyIHByb3ZpZGluZyBTb3VsIEJsdWVwcmludCByZWFkaW5ncyBiYXNlZCBvbiBuYXRhbCBjaGFydHMuJztcbmNvbnN0IEZBTExCQUNLX1VTRVJfVEVNUExBVEUgPSBgR2VuZXJhdGUgYSBTb3VsIEJsdWVwcmludCByZWFkaW5nIGZvcjpcbk5hbWU6IHt7YmlydGhOYW1lfX1cbkJpcnRoOiB7e2JpcnRoRGF0ZX19IHt7YmlydGhUaW1lfX1cbkxvY2F0aW9uOiB7e2JpcnRoQ2l0eX19LCB7e2JpcnRoU3RhdGV9fSwge3tiaXJ0aENvdW50cnl9fVxuXG5OYXRhbCBDaGFydDpcbnt7bmF0YWxDaGFydERhdGF9fVxuXG5Qcm92aWRlIGluc2lnaHRzIG9uIHN1biBzaWduLCBtb29uIHNpZ24sIHJpc2luZyBzaWduLCBhbmQgbGlmZSBwYXRoLmA7XG5cbmFzeW5jIGZ1bmN0aW9uIGZldGNoUzNDb250ZW50KFxuICBidWNrZXQ6IHN0cmluZyxcbiAga2V5OiBzdHJpbmcsXG4pOiBQcm9taXNlPHsgY29udGVudDogc3RyaW5nOyBldGFnPzogc3RyaW5nIH0+IHtcbiAgdHJ5IHtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHMzQ2xpZW50LnNlbmQoXG4gICAgICBuZXcgR2V0T2JqZWN0Q29tbWFuZCh7XG4gICAgICAgIEJ1Y2tldDogYnVja2V0LFxuICAgICAgICBLZXk6IGtleSxcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICBjb25zdCBjb250ZW50ID0gKGF3YWl0IHJlc3BvbnNlLkJvZHk/LnRyYW5zZm9ybVRvU3RyaW5nKCkpIHx8ICcnO1xuICAgIGNvbnNvbGUubG9nKGBGZXRjaGVkIFMzIG9iamVjdDogJHtrZXl9LCBFVGFnOiAke3Jlc3BvbnNlLkVUYWd9YCk7XG5cbiAgICByZXR1cm4geyBjb250ZW50LCBldGFnOiByZXNwb25zZS5FVGFnIH07XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcihgRmFpbGVkIHRvIGZldGNoIFMzIG9iamVjdCAke2tleX06YCwgZXJyb3IpO1xuICAgIHRocm93IGVycm9yO1xuICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGdldE9wZW5BSUNvbmZpZygpOiBQcm9taXNlPE9wZW5BSUNvbmZpZz4ge1xuICAvLyBSZXR1cm4gY2FjaGVkIGNvbmZpZyBpZiBhdmFpbGFibGVcbiAgaWYgKGNhY2hlZENvbmZpZykge1xuICAgIGNvbnNvbGUubG9nKCdVc2luZyBjYWNoZWQgY29uZmlndXJhdGlvbicpO1xuICAgIHJldHVybiBjYWNoZWRDb25maWcuY29uZmlnO1xuICB9XG5cbiAgY29uc29sZS5sb2coJ0xvYWRpbmcgY29uZmlndXJhdGlvbiBmcm9tIFNTTSBhbmQgUzMuLi4nKTtcblxuICBjb25zdCBwYXJhbWV0ZXJOYW1lcyA9IFtcbiAgICBwcm9jZXNzLmVudi5PUEVOQUlfQVBJX0tFWV9QQVJBTUVURVJfTkFNRSxcbiAgICBwcm9jZXNzLmVudi5SRUFESU5HX01PREVMX1BBUkFNRVRFUl9OQU1FLFxuICAgIHByb2Nlc3MuZW52LlJFQURJTkdfVEVNUEVSQVRVUkVfUEFSQU1FVEVSX05BTUUsXG4gICAgcHJvY2Vzcy5lbnYuUkVBRElOR19NQVhfVE9LRU5TX1BBUkFNRVRFUl9OQU1FLFxuICAgIHByb2Nlc3MuZW52LlNZU1RFTV9QUk9NUFRfUzNLRVlfUEFSQU1FVEVSX05BTUUsXG4gICAgcHJvY2Vzcy5lbnYuVVNFUl9QUk9NUFRfUzNLRVlfUEFSQU1FVEVSX05BTUUsXG4gIF07XG5cbiAgY29uc3QgYnVja2V0TmFtZSA9IHByb2Nlc3MuZW52LkNPTkZJR19CVUNLRVRfTkFNRTtcblxuICBpZiAoIWJ1Y2tldE5hbWUpIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0NPTkZJR19CVUNLRVRfTkFNRSBlbnZpcm9ubWVudCB2YXJpYWJsZSBub3Qgc2V0Jyk7XG4gIH1cblxuICAvLyBWYWxpZGF0ZSBhbGwgcGFyYW1ldGVyIG5hbWVzIGFyZSBwcmVzZW50XG4gIGNvbnN0IG1pc3NpbmdQYXJhbXMgPSBwYXJhbWV0ZXJOYW1lc1xuICAgIC5tYXAoKG5hbWUsIGluZGV4KSA9PiB7XG4gICAgICBjb25zdCBsYWJlbHMgPSBbXG4gICAgICAgICdPUEVOQUlfQVBJX0tFWV9QQVJBTUVURVJfTkFNRScsXG4gICAgICAgICdSRUFESU5HX01PREVMX1BBUkFNRVRFUl9OQU1FJyxcbiAgICAgICAgJ1JFQURJTkdfVEVNUEVSQVRVUkVfUEFSQU1FVEVSX05BTUUnLFxuICAgICAgICAnUkVBRElOR19NQVhfVE9LRU5TX1BBUkFNRVRFUl9OQU1FJyxcbiAgICAgICAgJ1NZU1RFTV9QUk9NUFRfUzNLRVlfUEFSQU1FVEVSX05BTUUnLFxuICAgICAgICAnVVNFUl9QUk9NUFRfUzNLRVlfUEFSQU1FVEVSX05BTUUnLFxuICAgICAgXTtcbiAgICAgIHJldHVybiBuYW1lID8gbnVsbCA6IGxhYmVsc1tpbmRleF07XG4gICAgfSlcbiAgICAuZmlsdGVyKEJvb2xlYW4pO1xuXG4gIGlmIChtaXNzaW5nUGFyYW1zLmxlbmd0aCA+IDApIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoYE1pc3NpbmcgZW52aXJvbm1lbnQgdmFyaWFibGVzOiAke21pc3NpbmdQYXJhbXMuam9pbignLCAnKX1gKTtcbiAgfVxuXG4gIC8vIEZldGNoIGFsbCBTU00gcGFyYW1ldGVycyBpbiBwYXJhbGxlbFxuICBjb25zdCBwYXJhbWV0ZXJQcm9taXNlcyA9IHBhcmFtZXRlck5hbWVzLm1hcCgobmFtZSkgPT5cbiAgICBzc21DbGllbnQuc2VuZChcbiAgICAgIG5ldyBHZXRQYXJhbWV0ZXJDb21tYW5kKHtcbiAgICAgICAgTmFtZTogbmFtZSEsXG4gICAgICAgIFdpdGhEZWNyeXB0aW9uOiB0cnVlLFxuICAgICAgfSksXG4gICAgKSxcbiAgKTtcblxuICBjb25zdCByZXNwb25zZXMgPSBhd2FpdCBQcm9taXNlLmFsbChwYXJhbWV0ZXJQcm9taXNlcyk7XG5cbiAgLy8gRXh0cmFjdCBTU00gdmFsdWVzXG4gIGNvbnN0IHNzbVZhbHVlcyA9IHJlc3BvbnNlcy5tYXAoKHJlc3BvbnNlLCBpbmRleCkgPT4ge1xuICAgIGlmICghcmVzcG9uc2UuUGFyYW1ldGVyPy5WYWx1ZSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKGBQYXJhbWV0ZXIgJHtwYXJhbWV0ZXJOYW1lc1tpbmRleF19IG5vdCBmb3VuZCBpbiBTU01gKTtcbiAgICB9XG4gICAgcmV0dXJuIHJlc3BvbnNlLlBhcmFtZXRlci5WYWx1ZTtcbiAgfSk7XG5cbiAgLy8gTG9nIHBhcmFtZXRlciBuYW1lcyAobm90IHZhbHVlcykgZm9yIGRlYnVnZ2luZ1xuICBjb25zb2xlLmxvZygnTG9hZGVkIFNTTSBwYXJhbWV0ZXJzOicsIHtcbiAgICBtb2RlbDogcHJvY2Vzcy5lbnYuUkVBRElOR19NT0RFTF9QQVJBTUVURVJfTkFNRSxcbiAgICB0ZW1wZXJhdHVyZTogcHJvY2Vzcy5lbnYuUkVBRElOR19URU1QRVJBVFVSRV9QQVJBTUVURVJfTkFNRSxcbiAgICBtYXhUb2tlbnM6IHByb2Nlc3MuZW52LlJFQURJTkdfTUFYX1RPS0VOU19QQVJBTUVURVJfTkFNRSxcbiAgICBzeXN0ZW1Qcm9tcHRLZXk6IHNzbVZhbHVlc1s0XSxcbiAgICB1c2VyUHJvbXB0S2V5OiBzc21WYWx1ZXNbNV0sXG4gIH0pO1xuXG4gIC8vIEZldGNoIHByb21wdHMgZnJvbSBTM1xuICBsZXQgc3lzdGVtUHJvbXB0ID0gRkFMTEJBQ0tfU1lTVEVNX1BST01QVDtcbiAgbGV0IHVzZXJQcm9tcHRUZW1wbGF0ZSA9IEZBTExCQUNLX1VTRVJfVEVNUExBVEU7XG4gIGxldCBzeXN0ZW1FVGFnOiBzdHJpbmcgfCB1bmRlZmluZWQ7XG4gIGxldCB1c2VyRVRhZzogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG4gIHRyeSB7XG4gICAgY29uc3QgW3N5c3RlbVJlc3VsdCwgdXNlclJlc3VsdF0gPSBhd2FpdCBQcm9taXNlLmFsbChbXG4gICAgICBmZXRjaFMzQ29udGVudChidWNrZXROYW1lLCBzc21WYWx1ZXNbNF0pLFxuICAgICAgZmV0Y2hTM0NvbnRlbnQoYnVja2V0TmFtZSwgc3NtVmFsdWVzWzVdKSxcbiAgICBdKTtcblxuICAgIHN5c3RlbVByb21wdCA9IHN5c3RlbVJlc3VsdC5jb250ZW50IHx8IEZBTExCQUNLX1NZU1RFTV9QUk9NUFQ7XG4gICAgdXNlclByb21wdFRlbXBsYXRlID0gdXNlclJlc3VsdC5jb250ZW50IHx8IEZBTExCQUNLX1VTRVJfVEVNUExBVEU7XG4gICAgc3lzdGVtRVRhZyA9IHN5c3RlbVJlc3VsdC5ldGFnO1xuICAgIHVzZXJFVGFnID0gdXNlclJlc3VsdC5ldGFnO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBmZXRjaCBwcm9tcHRzIGZyb20gUzMsIHVzaW5nIGZhbGxiYWNrIHByb21wdHM6JywgZXJyb3IpO1xuICB9XG5cbiAgY29uc3QgY29uZmlnOiBPcGVuQUlDb25maWcgPSB7XG4gICAgYXBpS2V5OiBzc21WYWx1ZXNbMF0sXG4gICAgbW9kZWw6IHNzbVZhbHVlc1sxXSxcbiAgICB0ZW1wZXJhdHVyZTogcGFyc2VGbG9hdChzc21WYWx1ZXNbMl0pLFxuICAgIG1heFRva2VuczogcGFyc2VJbnQoc3NtVmFsdWVzWzNdLCAxMCksXG4gICAgc3lzdGVtUHJvbXB0LFxuICAgIHVzZXJQcm9tcHRUZW1wbGF0ZSxcbiAgfTtcblxuICAvLyBDYWNoZSB0aGUgY29uZmlndXJhdGlvblxuICBjYWNoZWRDb25maWcgPSB7XG4gICAgY29uZmlnLFxuICAgIHN5c3RlbVByb21wdEVUYWc6IHN5c3RlbUVUYWcsXG4gICAgdXNlclByb21wdEVUYWc6IHVzZXJFVGFnLFxuICB9O1xuXG4gIHJldHVybiBjb25maWc7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGdldFVzZXJQcm9maWxlKHVzZXJJZDogc3RyaW5nKSB7XG4gIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZHluYW1vRG9jLnNlbmQoXG4gICAgbmV3IEdldENvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5VU0VSX1RBQkxFX05BTUUhLFxuICAgICAgS2V5OiB7XG4gICAgICAgIHVzZXJJZCxcbiAgICAgICAgY3JlYXRlZEF0OiAnUFJPRklMRScsXG4gICAgICB9LFxuICAgIH0pLFxuICApO1xuICByZXR1cm4gcmVzcG9uc2UuSXRlbTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gZ2V0TmF0YWxDaGFydCh1c2VySWQ6IHN0cmluZykge1xuICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGR5bmFtb0RvYy5zZW5kKFxuICAgIG5ldyBHZXRDb21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuTkFUQUxfQ0hBUlRfVEFCTEVfTkFNRSEsXG4gICAgICBLZXk6IHtcbiAgICAgICAgdXNlcklkLFxuICAgICAgfSxcbiAgICB9KSxcbiAgKTtcbiAgcmV0dXJuIHJlc3BvbnNlLkl0ZW07XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGNhbGxPcGVuQUkocHJvbXB0OiBzdHJpbmcsIGNvbmZpZzogT3BlbkFJQ29uZmlnKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCgnaHR0cHM6Ly9hcGkub3BlbmFpLmNvbS92MS9jaGF0L2NvbXBsZXRpb25zJywge1xuICAgIG1ldGhvZDogJ1BPU1QnLFxuICAgIGhlYWRlcnM6IHtcbiAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICBBdXRob3JpemF0aW9uOiBgQmVhcmVyICR7Y29uZmlnLmFwaUtleX1gLFxuICAgIH0sXG4gICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgbW9kZWw6IGNvbmZpZy5tb2RlbCxcbiAgICAgIG1lc3NhZ2VzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICByb2xlOiAnc3lzdGVtJyxcbiAgICAgICAgICBjb250ZW50OiBjb25maWcuc3lzdGVtUHJvbXB0LFxuICAgICAgICB9LFxuICAgICAgICB7XG4gICAgICAgICAgcm9sZTogJ3VzZXInLFxuICAgICAgICAgIGNvbnRlbnQ6IHByb21wdCxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgICB0ZW1wZXJhdHVyZTogY29uZmlnLnRlbXBlcmF0dXJlLFxuICAgICAgbWF4X3Rva2VuczogY29uZmlnLm1heFRva2VucyxcbiAgICB9KSxcbiAgfSk7XG5cbiAgaWYgKCFyZXNwb25zZS5vaykge1xuICAgIGNvbnN0IGVycm9yID0gYXdhaXQgcmVzcG9uc2UudGV4dCgpO1xuICAgIHRocm93IG5ldyBFcnJvcihgT3BlbkFJIEFQSSBlcnJvcjogJHtyZXNwb25zZS5zdGF0dXN9IC0gJHtlcnJvcn1gKTtcbiAgfVxuXG4gIGNvbnN0IGRhdGEgPSAoYXdhaXQgcmVzcG9uc2UuanNvbigpKSBhcyB7IGNob2ljZXM6IEFycmF5PHsgbWVzc2FnZTogeyBjb250ZW50OiBzdHJpbmcgfSB9PiB9O1xuICByZXR1cm4gZGF0YS5jaG9pY2VzWzBdLm1lc3NhZ2UuY29udGVudDtcbn1cblxuLy8gRGVmaW5lIGludGVyZmFjZSBmb3IgaW50ZXJuYWwgaW52b2NhdGlvblxuaW50ZXJmYWNlIEludGVybmFsSW52b2NhdGlvbkV2ZW50IHtcbiAgc291cmNlOiAnd2ViaG9vayc7XG4gIHVzZXJJZDogc3RyaW5nO1xuICBpbnRlcm5hbFNlY3JldDogc3RyaW5nO1xuICBtZXRhZGF0YT86IFJlY29yZDxzdHJpbmcsIHN0cmluZyB8IG51bWJlciB8IGJvb2xlYW4+O1xuICByZXF1ZXN0Q29udGV4dD86IHtcbiAgICBhdXRob3JpemVyPzoge1xuICAgICAgY2xhaW1zPzoge1xuICAgICAgICBzdWI/OiBzdHJpbmc7XG4gICAgICB9O1xuICAgIH07XG4gIH07XG59XG5cbi8vIFR5cGUgZ3VhcmQgdG8gY2hlY2sgaWYgdGhpcyBpcyBhbiBpbnRlcm5hbCBpbnZvY2F0aW9uIHdpdGggcHJvcGVyIHZlcmlmaWNhdGlvblxuZnVuY3Rpb24gaXNJbnRlcm5hbEludm9jYXRpb24oZXZlbnQ6IHVua25vd24pOiBldmVudCBpcyBJbnRlcm5hbEludm9jYXRpb25FdmVudCB7XG4gIGlmIChcbiAgICB0eXBlb2YgZXZlbnQgIT09ICdvYmplY3QnIHx8XG4gICAgZXZlbnQgPT09IG51bGwgfHxcbiAgICAhKCdzb3VyY2UnIGluIGV2ZW50KSB8fFxuICAgICEoJ3VzZXJJZCcgaW4gZXZlbnQpIHx8XG4gICAgJ3BhdGhQYXJhbWV0ZXJzJyBpbiBldmVudFxuICApIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICBjb25zdCBwb3RlbnRpYWxJbnRlcm5hbEV2ZW50ID0gZXZlbnQgYXMgSW50ZXJuYWxJbnZvY2F0aW9uRXZlbnQgJiB7IGludGVybmFsU2VjcmV0Pzogc3RyaW5nIH07XG5cbiAgLy8gVmVyaWZ5IHRoZSBpbnRlcm5hbCBpbnZvY2F0aW9uIHNlY3JldFxuICBjb25zdCBleHBlY3RlZFNlY3JldCA9IHByb2Nlc3MuZW52LklOVEVSTkFMX0lOVk9DQVRJT05fU0VDUkVUO1xuICBpZiAoIWV4cGVjdGVkU2VjcmV0KSB7XG4gICAgY29uc29sZS5lcnJvcignSU5URVJOQUxfSU5WT0NBVElPTl9TRUNSRVQgbm90IGNvbmZpZ3VyZWQnKTtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICAvLyBDaGVjayBpZiB0aGUgZXZlbnQgY29udGFpbnMgdGhlIGNvcnJlY3Qgc2VjcmV0XG4gIGlmIChwb3RlbnRpYWxJbnRlcm5hbEV2ZW50LmludGVybmFsU2VjcmV0ICE9PSBleHBlY3RlZFNlY3JldCkge1xuICAgIGNvbnNvbGUud2FybignSW52YWxpZCBpbnRlcm5hbCBpbnZvY2F0aW9uIHNlY3JldCBwcm92aWRlZCcpO1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIHJldHVybiAoXG4gICAgcG90ZW50aWFsSW50ZXJuYWxFdmVudC5zb3VyY2UgPT09ICd3ZWJob29rJyAmJiB0eXBlb2YgcG90ZW50aWFsSW50ZXJuYWxFdmVudC51c2VySWQgPT09ICdzdHJpbmcnXG4gICk7XG59XG5cbmV4cG9ydCBjb25zdCBoYW5kbGVyID0gYXN5bmMgKFxuICBldmVudDogQVBJR2F0ZXdheVByb3h5RXZlbnQgfCBJbnRlcm5hbEludm9jYXRpb25FdmVudCxcbik6IFByb21pc2U8QVBJR2F0ZXdheVByb3h5UmVzdWx0PiA9PiB7XG4gIGNvbnNvbGUubG9nKCdFdmVudDonLCBKU09OLnN0cmluZ2lmeShldmVudCkpO1xuXG4gIGNvbnN0IGNvcnNIZWFkZXJzID0ge1xuICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiAnKicsXG4gICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LUhlYWRlcnMnOiAnQ29udGVudC1UeXBlLEF1dGhvcml6YXRpb24nLFxuICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1NZXRob2RzJzogJ1BPU1QsT1BUSU9OUycsXG4gIH07XG5cbiAgdHJ5IHtcbiAgICBsZXQgdXNlcklkOiBzdHJpbmc7XG4gICAgbGV0IG1ldGFkYXRhOiBSZWNvcmQ8c3RyaW5nLCBzdHJpbmcgfCBudW1iZXIgfCBib29sZWFuPiA9IHt9O1xuXG4gICAgLy8gQ2hlY2sgaWYgdGhpcyBpcyBhbiBpbnRlcm5hbCBpbnZvY2F0aW9uIGZyb20gd2ViaG9vayBoYW5kbGVyXG4gICAgaWYgKGlzSW50ZXJuYWxJbnZvY2F0aW9uKGV2ZW50KSkge1xuICAgICAgY29uc29sZS5pbmZvKCdJbnRlcm5hbCBpbnZvY2F0aW9uIGZyb20gd2ViaG9vayBoYW5kbGVyOicsIHtcbiAgICAgICAgdXNlcklkOiBldmVudC51c2VySWQsXG4gICAgICAgIG1ldGFkYXRhOiBldmVudC5tZXRhZGF0YSxcbiAgICAgIH0pO1xuICAgICAgdXNlcklkID0gZXZlbnQudXNlcklkO1xuICAgICAgbWV0YWRhdGEgPSBldmVudC5tZXRhZGF0YSB8fCB7fTtcbiAgICB9IGVsc2Uge1xuICAgICAgLy8gU3RhbmRhcmQgQVBJIEdhdGV3YXkgaW52b2NhdGlvblxuICAgICAgY29uc3QgYXBpRXZlbnQgPSBldmVudCBhcyBBUElHYXRld2F5UHJveHlFdmVudDtcblxuICAgICAgLy8gRXh0cmFjdCB1c2VySWQgZnJvbSBwYXRoXG4gICAgICB1c2VySWQgPSBhcGlFdmVudC5wYXRoUGFyYW1ldGVycz8udXNlcklkIHx8ICcnO1xuICAgICAgaWYgKCF1c2VySWQpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBzdGF0dXNDb2RlOiA0MDAsXG4gICAgICAgICAgaGVhZGVyczogY29yc0hlYWRlcnMsXG4gICAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBtZXNzYWdlOiAndXNlcklkIGlzIHJlcXVpcmVkJyB9KSxcbiAgICAgICAgfTtcbiAgICAgIH1cblxuICAgICAgLy8gVmVyaWZ5IGF1dGhlbnRpY2F0ZWQgdXNlciBtYXRjaGVzIHJlcXVlc3RlZCB1c2VySWRcbiAgICAgIGNvbnN0IHJlcXVlc3RDb250ZXh0ID0gYXBpRXZlbnQucmVxdWVzdENvbnRleHQgYXMge1xuICAgICAgICBhdXRob3JpemVyPzogeyBjbGFpbXM/OiB7IHN1Yj86IHN0cmluZyB9IH07XG4gICAgICB9O1xuICAgICAgY29uc3QgYXV0aGVudGljYXRlZFVzZXJJZCA9IHJlcXVlc3RDb250ZXh0Py5hdXRob3JpemVyPy5jbGFpbXM/LnN1YjtcbiAgICAgIGlmIChhdXRoZW50aWNhdGVkVXNlcklkICE9PSB1c2VySWQpIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBzdGF0dXNDb2RlOiA0MDMsXG4gICAgICAgICAgaGVhZGVyczogY29yc0hlYWRlcnMsXG4gICAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBtZXNzYWdlOiAnVW5hdXRob3JpemVkIHRvIGdlbmVyYXRlIHJlYWRpbmcgZm9yIHRoaXMgdXNlcicgfSksXG4gICAgICAgIH07XG4gICAgICB9XG5cbiAgICAgIC8vIFBhcnNlIG1ldGFkYXRhIGZyb20gcmVxdWVzdCBib2R5IGlmIHByZXNlbnRcbiAgICAgIGlmIChhcGlFdmVudC5ib2R5KSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgY29uc3QgcGFyc2VkID0gSlNPTi5wYXJzZShhcGlFdmVudC5ib2R5KTtcbiAgICAgICAgICBtZXRhZGF0YSA9IHBhcnNlZC5tZXRhZGF0YSB8fCB7fTtcbiAgICAgICAgfSBjYXRjaCB7XG4gICAgICAgICAgLy8gSWdub3JlIHBhcnNpbmcgZXJyb3JzXG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBHZXQgdXNlciBwcm9maWxlIGFuZCBuYXRhbCBjaGFydFxuICAgIGNvbnN0IFt1c2VyUHJvZmlsZSwgbmF0YWxDaGFydF0gPSBhd2FpdCBQcm9taXNlLmFsbChbXG4gICAgICBnZXRVc2VyUHJvZmlsZSh1c2VySWQpLFxuICAgICAgZ2V0TmF0YWxDaGFydCh1c2VySWQpLFxuICAgIF0pO1xuXG4gICAgaWYgKCF1c2VyUHJvZmlsZSkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNDA0LFxuICAgICAgICBoZWFkZXJzOiBjb3JzSGVhZGVycyxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBtZXNzYWdlOiAnVXNlciBwcm9maWxlIG5vdCBmb3VuZCcgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIGlmICghbmF0YWxDaGFydCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNDAwLFxuICAgICAgICBoZWFkZXJzOiBjb3JzSGVhZGVycyxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgIG1lc3NhZ2U6ICdOYXRhbCBjaGFydCBub3QgZ2VuZXJhdGVkLiBQbGVhc2UgY29tcGxldGUgeW91ciBwcm9maWxlIGZpcnN0LicsXG4gICAgICAgIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBMb2cgbmF0YWwgY2hhcnQgc3RhdHVzIGZvciBkZWJ1Z2dpbmdcbiAgICBjb25zb2xlLmluZm8oJ05hdGFsIGNoYXJ0IGZldGNoZWQ6Jywge1xuICAgICAgdXNlcklkLFxuICAgICAgaGFzTmF0YWxDaGFydDogISFuYXRhbENoYXJ0LFxuICAgICAgbmF0YWxDaGFydEtleXM6IG5hdGFsQ2hhcnQgPyBPYmplY3Qua2V5cyhuYXRhbENoYXJ0KSA6IFtdLFxuICAgICAgbmF0YWxDaGFydFNpemU6IG5hdGFsQ2hhcnQgPyBKU09OLnN0cmluZ2lmeShuYXRhbENoYXJ0KS5sZW5ndGggOiAwLFxuICAgIH0pO1xuXG4gICAgLy8gR2VuZXJhdGUgcmVhZGluZyBJRCBhbmQgdGltZXN0YW1wXG4gICAgY29uc3QgcmVhZGluZ0lkID0gdXVpZHY0KCk7XG4gICAgY29uc3QgdGltZXN0YW1wID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpO1xuXG4gICAgLy8gQ3JlYXRlIHRoZSByZWFkaW5nIHJlY29yZCB3aXRoIHN0YXR1cyAnUHJvY2Vzc2luZydcbiAgICBjb25zdCByZWFkaW5nUmVjb3JkID0ge1xuICAgICAgdXNlcklkLFxuICAgICAgcmVhZGluZ0lkLFxuICAgICAgdHlwZTogJ1NvdWwgQmx1ZXByaW50JyxcbiAgICAgIHN0YXR1czogJ1Byb2Nlc3NpbmcnLFxuICAgICAgY3JlYXRlZEF0OiB0aW1lc3RhbXAsXG4gICAgICB1cGRhdGVkQXQ6IHRpbWVzdGFtcCxcbiAgICAgIC4uLihPYmplY3Qua2V5cyhtZXRhZGF0YSkubGVuZ3RoID4gMCAmJiB7IG1ldGFkYXRhIH0pLCAvLyBJbmNsdWRlIG1ldGFkYXRhIGlmIHByZXNlbnRcbiAgICB9O1xuXG4gICAgLy8gU2F2ZSBpbml0aWFsIHJlYWRpbmcgcmVjb3JkXG4gICAgYXdhaXQgZHluYW1vRG9jLnNlbmQoXG4gICAgICBuZXcgUHV0Q29tbWFuZCh7XG4gICAgICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuUkVBRElOR1NfVEFCTEVfTkFNRSEsXG4gICAgICAgIEl0ZW06IHJlYWRpbmdSZWNvcmQsXG4gICAgICB9KSxcbiAgICApO1xuXG4gICAgdHJ5IHtcbiAgICAgIC8vIEdldCBPcGVuQUkgY29uZmlndXJhdGlvblxuICAgICAgY29uc3Qgb3BlbkFJQ29uZmlnID0gYXdhaXQgZ2V0T3BlbkFJQ29uZmlnKCk7XG5cbiAgICAgIC8vIEJ1aWxkIHVzZXIgcHJvbXB0IGZyb20gdGVtcGxhdGVcbiAgICAgIGNvbnN0IHVzZXJQcm9tcHQgPSBvcGVuQUlDb25maWcudXNlclByb21wdFRlbXBsYXRlXG4gICAgICAgIC5yZXBsYWNlKCd7e2JpcnRoTmFtZX19JywgdXNlclByb2ZpbGUucHJvZmlsZT8uYmlydGhOYW1lIHx8ICdVbmtub3duJylcbiAgICAgICAgLnJlcGxhY2UoJ3t7YmlydGhEYXRlfX0nLCB1c2VyUHJvZmlsZS5wcm9maWxlPy5iaXJ0aERhdGUgfHwgJ1Vua25vd24nKVxuICAgICAgICAucmVwbGFjZSgne3tiaXJ0aFRpbWV9fScsIHVzZXJQcm9maWxlLnByb2ZpbGU/LmJpcnRoVGltZSB8fCAnVW5rbm93bicpXG4gICAgICAgIC5yZXBsYWNlKCd7e2JpcnRoQ2l0eX19JywgdXNlclByb2ZpbGUucHJvZmlsZT8uYmlydGhDaXR5IHx8ICdVbmtub3duJylcbiAgICAgICAgLnJlcGxhY2UoJ3t7YmlydGhTdGF0ZX19JywgdXNlclByb2ZpbGUucHJvZmlsZT8uYmlydGhTdGF0ZSB8fCAnVW5rbm93bicpXG4gICAgICAgIC5yZXBsYWNlKCd7e2JpcnRoQ291bnRyeX19JywgdXNlclByb2ZpbGUucHJvZmlsZT8uYmlydGhDb3VudHJ5IHx8ICdVbmtub3duJylcbiAgICAgICAgLnJlcGxhY2UoJ3t7bmF0YWxDaGFydERhdGF9fScsIEpTT04uc3RyaW5naWZ5KG5hdGFsQ2hhcnQsIG51bGwsIDIpKTtcblxuICAgICAgLy8gTG9nIHByb21wdCBpbmZvIGZvciBkZWJ1Z2dpbmdcbiAgICAgIGNvbnNvbGUuaW5mbygnUHJvbXB0IGJ1aWx0OicsIHtcbiAgICAgICAgdGVtcGxhdGVMZW5ndGg6IG9wZW5BSUNvbmZpZy51c2VyUHJvbXB0VGVtcGxhdGUubGVuZ3RoLFxuICAgICAgICBwcm9tcHRMZW5ndGg6IHVzZXJQcm9tcHQubGVuZ3RoLFxuICAgICAgICBpbmNsdWRlc05hdGFsQ2hhcnQ6IHVzZXJQcm9tcHQuaW5jbHVkZXMoJ3BsYW5ldHMnKSxcbiAgICAgICAgbmF0YWxDaGFydEluUHJvbXB0OiB1c2VyUHJvbXB0LmluY2x1ZGVzKEpTT04uc3RyaW5naWZ5KG5hdGFsQ2hhcnQsIG51bGwsIDIpKSxcbiAgICAgIH0pO1xuXG4gICAgICAvLyBDYWxsIE9wZW5BSSBBUElcbiAgICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCBjYWxsT3BlbkFJKHVzZXJQcm9tcHQsIG9wZW5BSUNvbmZpZyk7XG5cbiAgICAgIC8vIFVwZGF0ZSByZWFkaW5nIHdpdGggY29udGVudCBhbmQgc3RhdHVzXG4gICAgICBjb25zdCB1cGRhdGVkUmVhZGluZyA9IHtcbiAgICAgICAgLi4ucmVhZGluZ1JlY29yZCxcbiAgICAgICAgY29udGVudCxcbiAgICAgICAgc3RhdHVzOiAnUmVhZHknLFxuICAgICAgICB1cGRhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgICAgIH07XG5cbiAgICAgIGF3YWl0IGR5bmFtb0RvYy5zZW5kKFxuICAgICAgICBuZXcgUHV0Q29tbWFuZCh7XG4gICAgICAgICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5SRUFESU5HU19UQUJMRV9OQU1FISxcbiAgICAgICAgICBJdGVtOiB1cGRhdGVkUmVhZGluZyxcbiAgICAgICAgfSksXG4gICAgICApO1xuXG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiAyMDAsXG4gICAgICAgIGhlYWRlcnM6IGNvcnNIZWFkZXJzLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgbWVzc2FnZTogJ1JlYWRpbmcgZ2VuZXJhdGVkIHN1Y2Nlc3NmdWxseScsXG4gICAgICAgICAgcmVhZGluZ0lkLFxuICAgICAgICAgIHN0YXR1czogJ1JlYWR5JyxcbiAgICAgICAgfSksXG4gICAgICB9O1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAvLyBMb2cgZGV0YWlsZWQgZXJyb3IgZm9yIGRlYnVnZ2luZ1xuICAgICAgY29uc29sZS5lcnJvcignRXJyb3IgZHVyaW5nIHJlYWRpbmcgZ2VuZXJhdGlvbjonLCB7XG4gICAgICAgIGVycm9yOiBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6ICdVbmtub3duIGVycm9yJyxcbiAgICAgICAgc3RhY2s6IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5zdGFjayA6IHVuZGVmaW5lZCxcbiAgICAgICAgdXNlcklkLFxuICAgICAgICByZWFkaW5nSWQsXG4gICAgICAgIHRpbWVzdGFtcDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgICAgfSk7XG5cbiAgICAgIC8vIFVwZGF0ZSByZWFkaW5nIHN0YXR1cyB0byBGYWlsZWQgd2l0aCBzYW5pdGl6ZWQgZXJyb3JcbiAgICAgIGF3YWl0IGR5bmFtb0RvYy5zZW5kKFxuICAgICAgICBuZXcgUHV0Q29tbWFuZCh7XG4gICAgICAgICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5SRUFESU5HU19UQUJMRV9OQU1FISxcbiAgICAgICAgICBJdGVtOiB7XG4gICAgICAgICAgICAuLi5yZWFkaW5nUmVjb3JkLFxuICAgICAgICAgICAgc3RhdHVzOiAnRmFpbGVkJyxcbiAgICAgICAgICAgIGVycm9yOiAnR0VORVJBVElPTl9GQUlMRUQnLCAvLyBTYW5pdGl6ZWQgZXJyb3IgaW5kaWNhdG9yXG4gICAgICAgICAgICB1cGRhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgICAgICAgICB9LFxuICAgICAgICB9KSxcbiAgICAgICk7XG5cbiAgICAgIHRocm93IGVycm9yO1xuICAgIH1cbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAvLyBVc2UgaGVscGVyIGZ1bmN0aW9uIHRvIGNyZWF0ZSBzYW5pdGl6ZWQgZXJyb3IgcmVzcG9uc2VcbiAgICBjb25zdCBjb250ZXh0RGF0YTogUmVjb3JkPHN0cmluZywgdW5rbm93bj4gPSBpc0ludGVybmFsSW52b2NhdGlvbihldmVudClcbiAgICAgID8geyB1c2VySWQ6IGV2ZW50LnVzZXJJZCwgc291cmNlOiAnd2ViaG9vaycgfVxuICAgICAgOiB7XG4gICAgICAgICAgdXNlcklkOiAoZXZlbnQgYXMgQVBJR2F0ZXdheVByb3h5RXZlbnQpLnBhdGhQYXJhbWV0ZXJzPy51c2VySWQsXG4gICAgICAgICAgcGF0aDogKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KS5wYXRoLFxuICAgICAgICAgIG1ldGhvZDogKGV2ZW50IGFzIEFQSUdhdGV3YXlQcm94eUV2ZW50KS5odHRwTWV0aG9kLFxuICAgICAgICB9O1xuXG4gICAgcmV0dXJuIGNyZWF0ZUVycm9yUmVzcG9uc2UoZXJyb3IsIGNvcnNIZWFkZXJzLCBjb250ZXh0RGF0YSk7XG4gIH1cbn07XG4iXX0=