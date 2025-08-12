"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const client_ssm_1 = require("@aws-sdk/client-ssm");
const uuid_1 = require("uuid");
const dynamoClient = new client_dynamodb_1.DynamoDBClient({});
const dynamoDoc = lib_dynamodb_1.DynamoDBDocumentClient.from(dynamoClient);
const ssmClient = new client_ssm_1.SSMClient({});
let openAiApiKey;
async function getOpenAiApiKey() {
    if (!openAiApiKey) {
        const parameterName = process.env.OPENAI_API_KEY_PARAMETER_NAME;
        if (!parameterName) {
            throw new Error('OPENAI_API_KEY_PARAMETER_NAME environment variable not set');
        }
        const response = await ssmClient.send(new client_ssm_1.GetParameterCommand({
            Name: parameterName,
            WithDecryption: true,
        }));
        if (!response.Parameter?.Value) {
            throw new Error('OpenAI API key not found in SSM');
        }
        openAiApiKey = response.Parameter.Value;
    }
    return openAiApiKey;
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
async function callOpenAI(prompt, apiKey) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model: 'gpt-4-turbo-preview',
            messages: [
                {
                    role: 'system',
                    content: 'You are an expert astrologer providing Soul Blueprint readings based on natal charts. Always echo back the natal chart data you receive as part of your response to confirm you have the correct information.',
                },
                {
                    role: 'user',
                    content: prompt,
                },
            ],
            temperature: 0.7,
            max_tokens: 2000,
        }),
    });
    if (!response.ok) {
        const error = await response.text();
        throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }
    const data = (await response.json());
    return data.choices[0].message.content;
}
const handler = async (event) => {
    console.log('Event:', JSON.stringify(event));
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'POST,OPTIONS',
    };
    try {
        // Extract userId from path
        const userId = event.pathParameters?.userId;
        if (!userId) {
            return {
                statusCode: 400,
                headers: corsHeaders,
                body: JSON.stringify({ message: 'userId is required' }),
            };
        }
        // Verify authenticated user matches requested userId
        const requestContext = event.requestContext;
        const authenticatedUserId = requestContext?.authorizer?.claims?.sub;
        if (authenticatedUserId !== userId) {
            return {
                statusCode: 403,
                headers: corsHeaders,
                body: JSON.stringify({ message: 'Unauthorized to generate reading for this user' }),
            };
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
        };
        // Save initial reading record
        await dynamoDoc.send(new lib_dynamodb_1.PutCommand({
            TableName: process.env.READINGS_TABLE_NAME,
            Item: readingRecord,
        }));
        try {
            // Get OpenAI API key
            const apiKey = await getOpenAiApiKey();
            // Prepare prompt for OpenAI
            const prompt = `
Generate a Soul Blueprint reading for the following individual:

Birth Information:
- Name: ${userProfile.profile?.birthName || 'Unknown'}
- Birth Date: ${userProfile.profile?.birthDate || 'Unknown'}
- Birth Time: ${userProfile.profile?.birthTime || 'Unknown'}
- Birth Location: ${userProfile.profile?.birthCity}, ${userProfile.profile?.birthState}, ${userProfile.profile?.birthCountry}

Natal Chart Data:
${JSON.stringify(natalChart, null, 2)}

Please provide a comprehensive Soul Blueprint reading that includes:

1. First, echo back the natal chart information above to confirm you have received it correctly.

2. Sun Sign Analysis - Core identity and life purpose

3. Moon Sign Analysis - Emotional nature and inner self

4. Rising Sign Analysis - How you present to the world

5. Key Planetary Aspects - Major influences and challenges

6. Life Path Insights - Your soul's journey and lessons

7. Strengths and Gifts - Your natural talents

8. Growth Areas - Where to focus your development

Please make the reading personal, insightful, and actionable while maintaining a warm and encouraging tone.
`;
            // Call OpenAI API
            const content = await callOpenAI(prompt, apiKey);
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
            console.error('Error generating reading:', error);
            // Update reading status to Failed
            await dynamoDoc.send(new lib_dynamodb_1.PutCommand({
                TableName: process.env.READINGS_TABLE_NAME,
                Item: {
                    ...readingRecord,
                    status: 'Failed',
                    error: error instanceof Error ? error.message : 'Unknown error',
                    updatedAt: new Date().toISOString(),
                },
            }));
            throw error;
        }
    }
    catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({
                message: 'Failed to generate reading',
                error: error instanceof Error ? error.message : 'Unknown error',
            }),
        };
    }
};
exports.handler = handler;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGUtcmVhZGluZy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImdlbmVyYXRlLXJlYWRpbmcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQ0EsOERBQTBEO0FBQzFELHdEQUF1RjtBQUN2RixvREFBcUU7QUFDckUsK0JBQW9DO0FBRXBDLE1BQU0sWUFBWSxHQUFHLElBQUksZ0NBQWMsQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUM1QyxNQUFNLFNBQVMsR0FBRyxxQ0FBc0IsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUM7QUFDNUQsTUFBTSxTQUFTLEdBQUcsSUFBSSxzQkFBUyxDQUFDLEVBQUUsQ0FBQyxDQUFDO0FBRXBDLElBQUksWUFBZ0MsQ0FBQztBQUVyQyxLQUFLLFVBQVUsZUFBZTtJQUM1QixJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7UUFDbEIsTUFBTSxhQUFhLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyw2QkFBNkIsQ0FBQztRQUNoRSxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7WUFDbkIsTUFBTSxJQUFJLEtBQUssQ0FBQyw0REFBNEQsQ0FBQyxDQUFDO1FBQ2hGLENBQUM7UUFFRCxNQUFNLFFBQVEsR0FBRyxNQUFNLFNBQVMsQ0FBQyxJQUFJLENBQ25DLElBQUksZ0NBQW1CLENBQUM7WUFDdEIsSUFBSSxFQUFFLGFBQWE7WUFDbkIsY0FBYyxFQUFFLElBQUk7U0FDckIsQ0FBQyxDQUNILENBQUM7UUFFRixJQUFJLENBQUMsUUFBUSxDQUFDLFNBQVMsRUFBRSxLQUFLLEVBQUUsQ0FBQztZQUMvQixNQUFNLElBQUksS0FBSyxDQUFDLGlDQUFpQyxDQUFDLENBQUM7UUFDckQsQ0FBQztRQUVELFlBQVksR0FBRyxRQUFRLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQztJQUMxQyxDQUFDO0lBRUQsT0FBTyxZQUFZLENBQUM7QUFDdEIsQ0FBQztBQUVELEtBQUssVUFBVSxjQUFjLENBQUMsTUFBYztJQUMxQyxNQUFN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Q2hFLENBQUM7U0FDSCxDQUFDO0lBQ0osQ0FBQztBQUNILENBQUMsQ0FBQztBQTNLVyxRQUFBLE9BQU8sV0EyS2xCIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQVBJR2F0ZXdheVByb3h5RXZlbnQsIEFQSUdhdGV3YXlQcm94eVJlc3VsdCB9IGZyb20gJ2F3cy1sYW1iZGEnO1xuaW1wb3J0IHsgRHluYW1vREJDbGllbnQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtZHluYW1vZGInO1xuaW1wb3J0IHsgRHluYW1vREJEb2N1bWVudENsaWVudCwgUHV0Q29tbWFuZCwgR2V0Q29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2xpYi1keW5hbW9kYic7XG5pbXBvcnQgeyBTU01DbGllbnQsIEdldFBhcmFtZXRlckNvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtc3NtJztcbmltcG9ydCB7IHY0IGFzIHV1aWR2NCB9IGZyb20gJ3V1aWQnO1xuXG5jb25zdCBkeW5hbW9DbGllbnQgPSBuZXcgRHluYW1vREJDbGllbnQoe30pO1xuY29uc3QgZHluYW1vRG9jID0gRHluYW1vREJEb2N1bWVudENsaWVudC5mcm9tKGR5bmFtb0NsaWVudCk7XG5jb25zdCBzc21DbGllbnQgPSBuZXcgU1NNQ2xpZW50KHt9KTtcblxubGV0IG9wZW5BaUFwaUtleTogc3RyaW5nIHwgdW5kZWZpbmVkO1xuXG5hc3luYyBmdW5jdGlvbiBnZXRPcGVuQWlBcGlLZXkoKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgaWYgKCFvcGVuQWlBcGlLZXkpIHtcbiAgICBjb25zdCBwYXJhbWV0ZXJOYW1lID0gcHJvY2Vzcy5lbnYuT1BFTkFJX0FQSV9LRVlfUEFSQU1FVEVSX05BTUU7XG4gICAgaWYgKCFwYXJhbWV0ZXJOYW1lKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ09QRU5BSV9BUElfS0VZX1BBUkFNRVRFUl9OQU1FIGVudmlyb25tZW50IHZhcmlhYmxlIG5vdCBzZXQnKTtcbiAgICB9XG5cbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IHNzbUNsaWVudC5zZW5kKFxuICAgICAgbmV3IEdldFBhcmFtZXRlckNvbW1hbmQoe1xuICAgICAgICBOYW1lOiBwYXJhbWV0ZXJOYW1lLFxuICAgICAgICBXaXRoRGVjcnlwdGlvbjogdHJ1ZSxcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICBpZiAoIXJlc3BvbnNlLlBhcmFtZXRlcj8uVmFsdWUpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignT3BlbkFJIEFQSSBrZXkgbm90IGZvdW5kIGluIFNTTScpO1xuICAgIH1cblxuICAgIG9wZW5BaUFwaUtleSA9IHJlc3BvbnNlLlBhcmFtZXRlci5WYWx1ZTtcbiAgfVxuXG4gIHJldHVybiBvcGVuQWlBcGlLZXk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGdldFVzZXJQcm9maWxlKHVzZXJJZDogc3RyaW5nKSB7XG4gIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZHluYW1vRG9jLnNlbmQoXG4gICAgbmV3IEdldENvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5VU0VSX1RBQkxFX05BTUUhLFxuICAgICAgS2V5OiB7XG4gICAgICAgIHVzZXJJZCxcbiAgICAgICAgY3JlYXRlZEF0OiAnUFJPRklMRScsXG4gICAgICB9LFxuICAgIH0pLFxuICApO1xuICByZXR1cm4gcmVzcG9uc2UuSXRlbTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gZ2V0TmF0YWxDaGFydCh1c2VySWQ6IHN0cmluZykge1xuICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGR5bmFtb0RvYy5zZW5kKFxuICAgIG5ldyBHZXRDb21tYW5kKHtcbiAgICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuTkFUQUxfQ0hBUlRfVEFCTEVfTkFNRSEsXG4gICAgICBLZXk6IHtcbiAgICAgICAgdXNlcklkLFxuICAgICAgfSxcbiAgICB9KSxcbiAgKTtcbiAgcmV0dXJuIHJlc3BvbnNlLkl0ZW07XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGNhbGxPcGVuQUkocHJvbXB0OiBzdHJpbmcsIGFwaUtleTogc3RyaW5nKTogUHJvbWlzZTxzdHJpbmc+IHtcbiAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaCgnaHR0cHM6Ly9hcGkub3BlbmFpLmNvbS92MS9jaGF0L2NvbXBsZXRpb25zJywge1xuICAgIG1ldGhvZDogJ1BPU1QnLFxuICAgIGhlYWRlcnM6IHtcbiAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICBBdXRob3JpemF0aW9uOiBgQmVhcmVyICR7YXBpS2V5fWAsXG4gICAgfSxcbiAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICBtb2RlbDogJ2dwdC00LXR1cmJvLXByZXZpZXcnLFxuICAgICAgbWVzc2FnZXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIHJvbGU6ICdzeXN0ZW0nLFxuICAgICAgICAgIGNvbnRlbnQ6XG4gICAgICAgICAgICAnWW91IGFyZSBhbiBleHBlcnQgYXN0cm9sb2dlciBwcm92aWRpbmcgU291bCBCbHVlcHJpbnQgcmVhZGluZ3MgYmFzZWQgb24gbmF0YWwgY2hhcnRzLiBBbHdheXMgZWNobyBiYWNrIHRoZSBuYXRhbCBjaGFydCBkYXRhIHlvdSByZWNlaXZlIGFzIHBhcnQgb2YgeW91ciByZXNwb25zZSB0byBjb25maXJtIHlvdSBoYXZlIHRoZSBjb3JyZWN0IGluZm9ybWF0aW9uLicsXG4gICAgICAgIH0sXG4gICAgICAgIHtcbiAgICAgICAgICByb2xlOiAndXNlcicsXG4gICAgICAgICAgY29udGVudDogcHJvbXB0LFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICAgIHRlbXBlcmF0dXJlOiAwLjcsXG4gICAgICBtYXhfdG9rZW5zOiAyMDAwLFxuICAgIH0pLFxuICB9KTtcblxuICBpZiAoIXJlc3BvbnNlLm9rKSB7XG4gICAgY29uc3QgZXJyb3IgPSBhd2FpdCByZXNwb25zZS50ZXh0KCk7XG4gICAgdGhyb3cgbmV3IEVycm9yKGBPcGVuQUkgQVBJIGVycm9yOiAke3Jlc3BvbnNlLnN0YXR1c30gLSAke2Vycm9yfWApO1xuICB9XG5cbiAgY29uc3QgZGF0YSA9IChhd2FpdCByZXNwb25zZS5qc29uKCkpIGFzIHsgY2hvaWNlczogQXJyYXk8eyBtZXNzYWdlOiB7IGNvbnRlbnQ6IHN0cmluZyB9IH0+IH07XG4gIHJldHVybiBkYXRhLmNob2ljZXNbMF0ubWVzc2FnZS5jb250ZW50O1xufVxuXG5leHBvcnQgY29uc3QgaGFuZGxlciA9IGFzeW5jIChldmVudDogQVBJR2F0ZXdheVByb3h5RXZlbnQpOiBQcm9taXNlPEFQSUdhdGV3YXlQcm94eVJlc3VsdD4gPT4ge1xuICBjb25zb2xlLmxvZygnRXZlbnQ6JywgSlNPTi5zdHJpbmdpZnkoZXZlbnQpKTtcblxuICBjb25zdCBjb3JzSGVhZGVycyA9IHtcbiAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogJyonLFxuICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1IZWFkZXJzJzogJ0NvbnRlbnQtVHlwZSxBdXRob3JpemF0aW9uJyxcbiAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctTWV0aG9kcyc6ICdQT1NULE9QVElPTlMnLFxuICB9O1xuXG4gIHRyeSB7XG4gICAgLy8gRXh0cmFjdCB1c2VySWQgZnJvbSBwYXRoXG4gICAgY29uc3QgdXNlcklkID0gZXZlbnQucGF0aFBhcmFtZXRlcnM/LnVzZXJJZDtcbiAgICBpZiAoIXVzZXJJZCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNDAwLFxuICAgICAgICBoZWFkZXJzOiBjb3JzSGVhZGVycyxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBtZXNzYWdlOiAndXNlcklkIGlzIHJlcXVpcmVkJyB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gVmVyaWZ5IGF1dGhlbnRpY2F0ZWQgdXNlciBtYXRjaGVzIHJlcXVlc3RlZCB1c2VySWRcbiAgICBjb25zdCByZXF1ZXN0Q29udGV4dCA9IGV2ZW50LnJlcXVlc3RDb250ZXh0IGFzIHsgYXV0aG9yaXplcj86IHsgY2xhaW1zPzogeyBzdWI/OiBzdHJpbmcgfSB9IH07XG4gICAgY29uc3QgYXV0aGVudGljYXRlZFVzZXJJZCA9IHJlcXVlc3RDb250ZXh0Py5hdXRob3JpemVyPy5jbGFpbXM/LnN1YjtcbiAgICBpZiAoYXV0aGVudGljYXRlZFVzZXJJZCAhPT0gdXNlcklkKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA0MDMsXG4gICAgICAgIGhlYWRlcnM6IGNvcnNIZWFkZXJzLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IG1lc3NhZ2U6ICdVbmF1dGhvcml6ZWQgdG8gZ2VuZXJhdGUgcmVhZGluZyBmb3IgdGhpcyB1c2VyJyB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gR2V0IHVzZXIgcHJvZmlsZSBhbmQgbmF0YWwgY2hhcnRcbiAgICBjb25zdCBbdXNlclByb2ZpbGUsIG5hdGFsQ2hhcnRdID0gYXdhaXQgUHJvbWlzZS5hbGwoW1xuICAgICAgZ2V0VXNlclByb2ZpbGUodXNlcklkKSxcbiAgICAgIGdldE5hdGFsQ2hhcnQodXNlcklkKSxcbiAgICBdKTtcblxuICAgIGlmICghdXNlclByb2ZpbGUpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwNCxcbiAgICAgICAgaGVhZGVyczogY29yc0hlYWRlcnMsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgbWVzc2FnZTogJ1VzZXIgcHJvZmlsZSBub3QgZm91bmQnIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICBpZiAoIW5hdGFsQ2hhcnQpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMCxcbiAgICAgICAgaGVhZGVyczogY29yc0hlYWRlcnMsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBtZXNzYWdlOiAnTmF0YWwgY2hhcnQgbm90IGdlbmVyYXRlZC4gUGxlYXNlIGNvbXBsZXRlIHlvdXIgcHJvZmlsZSBmaXJzdC4nLFxuICAgICAgICB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gR2VuZXJhdGUgcmVhZGluZyBJRCBhbmQgdGltZXN0YW1wXG4gICAgY29uc3QgcmVhZGluZ0lkID0gdXVpZHY0KCk7XG4gICAgY29uc3QgdGltZXN0YW1wID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpO1xuXG4gICAgLy8gQ3JlYXRlIHRoZSByZWFkaW5nIHJlY29yZCB3aXRoIHN0YXR1cyAnUHJvY2Vzc2luZydcbiAgICBjb25zdCByZWFkaW5nUmVjb3JkID0ge1xuICAgICAgdXNlcklkLFxuICAgICAgcmVhZGluZ0lkLFxuICAgICAgdHlwZTogJ1NvdWwgQmx1ZXByaW50JyxcbiAgICAgIHN0YXR1czogJ1Byb2Nlc3NpbmcnLFxuICAgICAgY3JlYXRlZEF0OiB0aW1lc3RhbXAsXG4gICAgICB1cGRhdGVkQXQ6IHRpbWVzdGFtcCxcbiAgICB9O1xuXG4gICAgLy8gU2F2ZSBpbml0aWFsIHJlYWRpbmcgcmVjb3JkXG4gICAgYXdhaXQgZHluYW1vRG9jLnNlbmQoXG4gICAgICBuZXcgUHV0Q29tbWFuZCh7XG4gICAgICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuUkVBRElOR1NfVEFCTEVfTkFNRSEsXG4gICAgICAgIEl0ZW06IHJlYWRpbmdSZWNvcmQsXG4gICAgICB9KSxcbiAgICApO1xuXG4gICAgdHJ5IHtcbiAgICAgIC8vIEdldCBPcGVuQUkgQVBJIGtleVxuICAgICAgY29uc3QgYXBpS2V5ID0gYXdhaXQgZ2V0T3BlbkFpQXBpS2V5KCk7XG5cbiAgICAgIC8vIFByZXBhcmUgcHJvbXB0IGZvciBPcGVuQUlcbiAgICAgIGNvbnN0IHByb21wdCA9IGBcbkdlbmVyYXRlIGEgU291bCBCbHVlcHJpbnQgcmVhZGluZyBmb3IgdGhlIGZvbGxvd2luZyBpbmRpdmlkdWFsOlxuXG5CaXJ0aCBJbmZvcm1hdGlvbjpcbi0gTmFtZTogJHt1c2VyUHJvZmlsZS5wcm9maWxlPy5iaXJ0aE5hbWUgfHwgJ1Vua25vd24nfVxuLSBCaXJ0aCBEYXRlOiAke3VzZXJQcm9maWxlLnByb2ZpbGU/LmJpcnRoRGF0ZSB8fCAnVW5rbm93bid9XG4tIEJpcnRoIFRpbWU6ICR7dXNlclByb2ZpbGUucHJvZmlsZT8uYmlydGhUaW1lIHx8ICdVbmtub3duJ31cbi0gQmlydGggTG9jYXRpb246ICR7dXNlclByb2ZpbGUucHJvZmlsZT8uYmlydGhDaXR5fSwgJHt1c2VyUHJvZmlsZS5wcm9maWxlPy5iaXJ0aFN0YXRlfSwgJHt1c2VyUHJvZmlsZS5wcm9maWxlPy5iaXJ0aENvdW50cnl9XG5cbk5hdGFsIENoYXJ0IERhdGE6XG4ke0pTT04uc3RyaW5naWZ5KG5hdGFsQ2hhcnQsIG51bGwsIDIpfVxuXG5QbGVhc2UgcHJvdmlkZSBhIGNvbXByZWhlbnNpdmUgU291bCBCbHVlcHJpbnQgcmVhZGluZyB0aGF0IGluY2x1ZGVzOlxuXG4xLiBGaXJzdCwgZWNobyBiYWNrIHRoZSBuYXRhbCBjaGFydCBpbmZvcm1hdGlvbiBhYm92ZSB0byBjb25maXJtIHlvdSBoYXZlIHJlY2VpdmVkIGl0IGNvcnJlY3RseS5cblxuMi4gU3VuIFNpZ24gQW5hbHlzaXMgLSBDb3JlIGlkZW50aXR5IGFuZCBsaWZlIHB1cnBvc2VcblxuMy4gTW9vbiBTaWduIEFuYWx5c2lzIC0gRW1vdGlvbmFsIG5hdHVyZSBhbmQgaW5uZXIgc2VsZlxuXG40LiBSaXNpbmcgU2lnbiBBbmFseXNpcyAtIEhvdyB5b3UgcHJlc2VudCB0byB0aGUgd29ybGRcblxuNS4gS2V5IFBsYW5ldGFyeSBBc3BlY3RzIC0gTWFqb3IgaW5mbHVlbmNlcyBhbmQgY2hhbGxlbmdlc1xuXG42LiBMaWZlIFBhdGggSW5zaWdodHMgLSBZb3VyIHNvdWwncyBqb3VybmV5IGFuZCBsZXNzb25zXG5cbjcuIFN0cmVuZ3RocyBhbmQgR2lmdHMgLSBZb3VyIG5hdHVyYWwgdGFsZW50c1xuXG44LiBHcm93dGggQXJlYXMgLSBXaGVyZSB0byBmb2N1cyB5b3VyIGRldmVsb3BtZW50XG5cblBsZWFzZSBtYWtlIHRoZSByZWFkaW5nIHBlcnNvbmFsLCBpbnNpZ2h0ZnVsLCBhbmQgYWN0aW9uYWJsZSB3aGlsZSBtYWludGFpbmluZyBhIHdhcm0gYW5kIGVuY291cmFnaW5nIHRvbmUuXG5gO1xuXG4gICAgICAvLyBDYWxsIE9wZW5BSSBBUElcbiAgICAgIGNvbnN0IGNvbnRlbnQgPSBhd2FpdCBjYWxsT3BlbkFJKHByb21wdCwgYXBpS2V5KTtcblxuICAgICAgLy8gVXBkYXRlIHJlYWRpbmcgd2l0aCBjb250ZW50IGFuZCBzdGF0dXNcbiAgICAgIGNvbnN0IHVwZGF0ZWRSZWFkaW5nID0ge1xuICAgICAgICAuLi5yZWFkaW5nUmVjb3JkLFxuICAgICAgICBjb250ZW50LFxuICAgICAgICBzdGF0dXM6ICdSZWFkeScsXG4gICAgICAgIHVwZGF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgICAgfTtcblxuICAgICAgYXdhaXQgZHluYW1vRG9jLnNlbmQoXG4gICAgICAgIG5ldyBQdXRDb21tYW5kKHtcbiAgICAgICAgICBUYWJsZU5hbWU6IHByb2Nlc3MuZW52LlJFQURJTkdTX1RBQkxFX05BTUUhLFxuICAgICAgICAgIEl0ZW06IHVwZGF0ZWRSZWFkaW5nLFxuICAgICAgICB9KSxcbiAgICAgICk7XG5cbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDIwMCxcbiAgICAgICAgaGVhZGVyczogY29yc0hlYWRlcnMsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBtZXNzYWdlOiAnUmVhZGluZyBnZW5lcmF0ZWQgc3VjY2Vzc2Z1bGx5JyxcbiAgICAgICAgICByZWFkaW5nSWQsXG4gICAgICAgICAgc3RhdHVzOiAnUmVhZHknLFxuICAgICAgICB9KSxcbiAgICAgIH07XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGdlbmVyYXRpbmcgcmVhZGluZzonLCBlcnJvcik7XG5cbiAgICAgIC8vIFVwZGF0ZSByZWFkaW5nIHN0YXR1cyB0byBGYWlsZWRcbiAgICAgIGF3YWl0IGR5bmFtb0RvYy5zZW5kKFxuICAgICAgICBuZXcgUHV0Q29tbWFuZCh7XG4gICAgICAgICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5SRUFESU5HU19UQUJMRV9OQU1FISxcbiAgICAgICAgICBJdGVtOiB7XG4gICAgICAgICAgICAuLi5yZWFkaW5nUmVjb3JkLFxuICAgICAgICAgICAgc3RhdHVzOiAnRmFpbGVkJyxcbiAgICAgICAgICAgIGVycm9yOiBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6ICdVbmtub3duIGVycm9yJyxcbiAgICAgICAgICAgIHVwZGF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pLFxuICAgICAgKTtcblxuICAgICAgdGhyb3cgZXJyb3I7XG4gICAgfVxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yOicsIGVycm9yKTtcbiAgICByZXR1cm4ge1xuICAgICAgc3RhdHVzQ29kZTogNTAwLFxuICAgICAgaGVhZGVyczogY29yc0hlYWRlcnMsXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgIG1lc3NhZ2U6ICdGYWlsZWQgdG8gZ2VuZXJhdGUgcmVhZGluZycsXG4gICAgICAgIGVycm9yOiBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6ICdVbmtub3duIGVycm9yJyxcbiAgICAgIH0pLFxuICAgIH07XG4gIH1cbn07XG4iXX0=