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
            'Authorization': `Bearer ${apiKey}`,
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
    const data = await response.json();
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
                body: JSON.stringify({ message: 'Natal chart not generated. Please complete your profile first.' }),
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGUtcmVhZGluZy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImdlbmVyYXRlLXJlYWRpbmcudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQ0EsOERBQTBEO0FBQzFELHdEQUF1RjtBQUN2RixvREFBcUU7QUFDckUsK0JBQW9DO0FBRXBDLE1BQU0sWUFBWSxHQUFHLElBQUksZ0NBQWMsQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUM1QyxNQUFNLFNBQVMsR0FBRyxxQ0FBc0IsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUM7QUFDNUQsTUFBTSxTQUFTLEdBQUcsSUFBSSxzQkFBUyxDQUFDLEVBQUUsQ0FBQyxDQUFDO0FBRXBDLElBQUksWUFBZ0MsQ0FBQztBQUVyQyxLQUFLLFVBQVUsZUFBZTtJQUM1QixJQUFJLENBQUMsWUFBWSxFQUFFLENBQUM7UUFDbEIsTUFBTSxhQUFhLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyw2QkFBNkIsQ0FBQztRQUNoRSxJQUFJLENBQUMsYUFBYSxFQUFFLENBQUM7WUFDbkIsTUFBTSxJQUFJLEtBQUssQ0FBQyw0REFBNEQsQ0FBQyxDQUFDO1FBQ2hGLENBQUM7UUFFRCxNQUFNLFFBQVEsR0FBRyxNQUFNLFNBQVMsQ0FBQyxJQUFJLENBQ25DLElBQUksZ0NBQW1CLENBQUM7WUFDdEIsSUFBSSxFQUFFLGFBQWE7WUFDbkIsY0FBYyxFQUFFLElBQUk7U0FDckIsQ0FBQyxDQUNILENBQUM7UUFFRixJQUFJLENBQUMsUUFBUSxDQUFDLFNBQVMsRUFBRSxLQUFLLEVBQUUsQ0FBQztZQUMvQixNQUFNLElBQUksS0FBSyxDQUFDLGlDQUFpQyxDQUFDLENBQUM7UUFDckQsQ0FBQztRQUVELFlBQVksR0FBRyxRQUFRLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQztJQUMxQyxDQUFDO0lBRUQsT0FBTyxZQUFZLENBQUM7QUFDdEIsQ0FBQztBQUVELEtBQUssVUFBVSxjQUFjLENBQUMsTUFBYztJQUMxQyxNQUFN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Q0FBQztJQUNKLENBQUM7QUFDSCxDQUFDLENBQUM7QUF6S1csUUFBQSxPQUFPLFdBeUtsQiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEFQSUdhdGV3YXlQcm94eUV2ZW50LCBBUElHYXRld2F5UHJveHlSZXN1bHQgfSBmcm9tICdhd3MtbGFtYmRhJztcbmltcG9ydCB7IER5bmFtb0RCQ2xpZW50IH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LWR5bmFtb2RiJztcbmltcG9ydCB7IER5bmFtb0RCRG9jdW1lbnRDbGllbnQsIFB1dENvbW1hbmQsIEdldENvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9saWItZHluYW1vZGInO1xuaW1wb3J0IHsgU1NNQ2xpZW50LCBHZXRQYXJhbWV0ZXJDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LXNzbSc7XG5pbXBvcnQgeyB2NCBhcyB1dWlkdjQgfSBmcm9tICd1dWlkJztcblxuY29uc3QgZHluYW1vQ2xpZW50ID0gbmV3IER5bmFtb0RCQ2xpZW50KHt9KTtcbmNvbnN0IGR5bmFtb0RvYyA9IER5bmFtb0RCRG9jdW1lbnRDbGllbnQuZnJvbShkeW5hbW9DbGllbnQpO1xuY29uc3Qgc3NtQ2xpZW50ID0gbmV3IFNTTUNsaWVudCh7fSk7XG5cbmxldCBvcGVuQWlBcGlLZXk6IHN0cmluZyB8IHVuZGVmaW5lZDtcblxuYXN5bmMgZnVuY3Rpb24gZ2V0T3BlbkFpQXBpS2V5KCk6IFByb21pc2U8c3RyaW5nPiB7XG4gIGlmICghb3BlbkFpQXBpS2V5KSB7XG4gICAgY29uc3QgcGFyYW1ldGVyTmFtZSA9IHByb2Nlc3MuZW52Lk9QRU5BSV9BUElfS0VZX1BBUkFNRVRFUl9OQU1FO1xuICAgIGlmICghcGFyYW1ldGVyTmFtZSkge1xuICAgICAgdGhyb3cgbmV3IEVycm9yKCdPUEVOQUlfQVBJX0tFWV9QQVJBTUVURVJfTkFNRSBlbnZpcm9ubWVudCB2YXJpYWJsZSBub3Qgc2V0Jyk7XG4gICAgfVxuXG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBzc21DbGllbnQuc2VuZChcbiAgICAgIG5ldyBHZXRQYXJhbWV0ZXJDb21tYW5kKHtcbiAgICAgICAgTmFtZTogcGFyYW1ldGVyTmFtZSxcbiAgICAgICAgV2l0aERlY3J5cHRpb246IHRydWUsXG4gICAgICB9KVxuICAgICk7XG5cbiAgICBpZiAoIXJlc3BvbnNlLlBhcmFtZXRlcj8uVmFsdWUpIHtcbiAgICAgIHRocm93IG5ldyBFcnJvcignT3BlbkFJIEFQSSBrZXkgbm90IGZvdW5kIGluIFNTTScpO1xuICAgIH1cblxuICAgIG9wZW5BaUFwaUtleSA9IHJlc3BvbnNlLlBhcmFtZXRlci5WYWx1ZTtcbiAgfVxuXG4gIHJldHVybiBvcGVuQWlBcGlLZXk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIGdldFVzZXJQcm9maWxlKHVzZXJJZDogc3RyaW5nKSB7XG4gIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZHluYW1vRG9jLnNlbmQoXG4gICAgbmV3IEdldENvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5VU0VSX1RBQkxFX05BTUUhLFxuICAgICAgS2V5OiB7XG4gICAgICAgIHVzZXJJZCxcbiAgICAgICAgY3JlYXRlZEF0OiAnUFJPRklMRScsXG4gICAgICB9LFxuICAgIH0pXG4gICk7XG4gIHJldHVybiByZXNwb25zZS5JdGVtO1xufVxuXG5hc3luYyBmdW5jdGlvbiBnZXROYXRhbENoYXJ0KHVzZXJJZDogc3RyaW5nKSB7XG4gIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZHluYW1vRG9jLnNlbmQoXG4gICAgbmV3IEdldENvbW1hbmQoe1xuICAgICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5OQVRBTF9DSEFSVF9UQUJMRV9OQU1FISxcbiAgICAgIEtleToge1xuICAgICAgICB1c2VySWQsXG4gICAgICB9LFxuICAgIH0pXG4gICk7XG4gIHJldHVybiByZXNwb25zZS5JdGVtO1xufVxuXG5hc3luYyBmdW5jdGlvbiBjYWxsT3BlbkFJKHByb21wdDogc3RyaW5nLCBhcGlLZXk6IHN0cmluZyk6IFByb21pc2U8c3RyaW5nPiB7XG4gIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goJ2h0dHBzOi8vYXBpLm9wZW5haS5jb20vdjEvY2hhdC9jb21wbGV0aW9ucycsIHtcbiAgICBtZXRob2Q6ICdQT1NUJyxcbiAgICBoZWFkZXJzOiB7XG4gICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgJ0F1dGhvcml6YXRpb24nOiBgQmVhcmVyICR7YXBpS2V5fWAsXG4gICAgfSxcbiAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICBtb2RlbDogJ2dwdC00LXR1cmJvLXByZXZpZXcnLFxuICAgICAgbWVzc2FnZXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIHJvbGU6ICdzeXN0ZW0nLFxuICAgICAgICAgIGNvbnRlbnQ6ICdZb3UgYXJlIGFuIGV4cGVydCBhc3Ryb2xvZ2VyIHByb3ZpZGluZyBTb3VsIEJsdWVwcmludCByZWFkaW5ncyBiYXNlZCBvbiBuYXRhbCBjaGFydHMuIEFsd2F5cyBlY2hvIGJhY2sgdGhlIG5hdGFsIGNoYXJ0IGRhdGEgeW91IHJlY2VpdmUgYXMgcGFydCBvZiB5b3VyIHJlc3BvbnNlIHRvIGNvbmZpcm0geW91IGhhdmUgdGhlIGNvcnJlY3QgaW5mb3JtYXRpb24uJyxcbiAgICAgICAgfSxcbiAgICAgICAge1xuICAgICAgICAgIHJvbGU6ICd1c2VyJyxcbiAgICAgICAgICBjb250ZW50OiBwcm9tcHQsXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgICAgdGVtcGVyYXR1cmU6IDAuNyxcbiAgICAgIG1heF90b2tlbnM6IDIwMDAsXG4gICAgfSksXG4gIH0pO1xuXG4gIGlmICghcmVzcG9uc2Uub2spIHtcbiAgICBjb25zdCBlcnJvciA9IGF3YWl0IHJlc3BvbnNlLnRleHQoKTtcbiAgICB0aHJvdyBuZXcgRXJyb3IoYE9wZW5BSSBBUEkgZXJyb3I6ICR7cmVzcG9uc2Uuc3RhdHVzfSAtICR7ZXJyb3J9YCk7XG4gIH1cblxuICBjb25zdCBkYXRhOiBhbnkgPSBhd2FpdCByZXNwb25zZS5qc29uKCk7XG4gIHJldHVybiBkYXRhLmNob2ljZXNbMF0ubWVzc2FnZS5jb250ZW50O1xufVxuXG5leHBvcnQgY29uc3QgaGFuZGxlciA9IGFzeW5jIChldmVudDogQVBJR2F0ZXdheVByb3h5RXZlbnQpOiBQcm9taXNlPEFQSUdhdGV3YXlQcm94eVJlc3VsdD4gPT4ge1xuICBjb25zb2xlLmxvZygnRXZlbnQ6JywgSlNPTi5zdHJpbmdpZnkoZXZlbnQpKTtcblxuICBjb25zdCBjb3JzSGVhZGVycyA9IHtcbiAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogJyonLFxuICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1IZWFkZXJzJzogJ0NvbnRlbnQtVHlwZSxBdXRob3JpemF0aW9uJyxcbiAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctTWV0aG9kcyc6ICdQT1NULE9QVElPTlMnLFxuICB9O1xuXG4gIHRyeSB7XG4gICAgLy8gRXh0cmFjdCB1c2VySWQgZnJvbSBwYXRoXG4gICAgY29uc3QgdXNlcklkID0gZXZlbnQucGF0aFBhcmFtZXRlcnM/LnVzZXJJZDtcbiAgICBpZiAoIXVzZXJJZCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNDAwLFxuICAgICAgICBoZWFkZXJzOiBjb3JzSGVhZGVycyxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBtZXNzYWdlOiAndXNlcklkIGlzIHJlcXVpcmVkJyB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gVmVyaWZ5IGF1dGhlbnRpY2F0ZWQgdXNlciBtYXRjaGVzIHJlcXVlc3RlZCB1c2VySWRcbiAgICBjb25zdCByZXF1ZXN0Q29udGV4dCA9IGV2ZW50LnJlcXVlc3RDb250ZXh0IGFzIGFueTtcbiAgICBjb25zdCBhdXRoZW50aWNhdGVkVXNlcklkID0gcmVxdWVzdENvbnRleHQ/LmF1dGhvcml6ZXI/LmNsYWltcz8uc3ViO1xuICAgIGlmIChhdXRoZW50aWNhdGVkVXNlcklkICE9PSB1c2VySWQpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMyxcbiAgICAgICAgaGVhZGVyczogY29yc0hlYWRlcnMsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgbWVzc2FnZTogJ1VuYXV0aG9yaXplZCB0byBnZW5lcmF0ZSByZWFkaW5nIGZvciB0aGlzIHVzZXInIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBHZXQgdXNlciBwcm9maWxlIGFuZCBuYXRhbCBjaGFydFxuICAgIGNvbnN0IFt1c2VyUHJvZmlsZSwgbmF0YWxDaGFydF0gPSBhd2FpdCBQcm9taXNlLmFsbChbXG4gICAgICBnZXRVc2VyUHJvZmlsZSh1c2VySWQpLFxuICAgICAgZ2V0TmF0YWxDaGFydCh1c2VySWQpLFxuICAgIF0pO1xuXG4gICAgaWYgKCF1c2VyUHJvZmlsZSkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNDA0LFxuICAgICAgICBoZWFkZXJzOiBjb3JzSGVhZGVycyxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBtZXNzYWdlOiAnVXNlciBwcm9maWxlIG5vdCBmb3VuZCcgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIGlmICghbmF0YWxDaGFydCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNDAwLFxuICAgICAgICBoZWFkZXJzOiBjb3JzSGVhZGVycyxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBtZXNzYWdlOiAnTmF0YWwgY2hhcnQgbm90IGdlbmVyYXRlZC4gUGxlYXNlIGNvbXBsZXRlIHlvdXIgcHJvZmlsZSBmaXJzdC4nIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBHZW5lcmF0ZSByZWFkaW5nIElEIGFuZCB0aW1lc3RhbXBcbiAgICBjb25zdCByZWFkaW5nSWQgPSB1dWlkdjQoKTtcbiAgICBjb25zdCB0aW1lc3RhbXAgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCk7XG5cbiAgICAvLyBDcmVhdGUgdGhlIHJlYWRpbmcgcmVjb3JkIHdpdGggc3RhdHVzICdQcm9jZXNzaW5nJ1xuICAgIGNvbnN0IHJlYWRpbmdSZWNvcmQgPSB7XG4gICAgICB1c2VySWQsXG4gICAgICByZWFkaW5nSWQsXG4gICAgICB0eXBlOiAnU291bCBCbHVlcHJpbnQnLFxuICAgICAgc3RhdHVzOiAnUHJvY2Vzc2luZycsXG4gICAgICBjcmVhdGVkQXQ6IHRpbWVzdGFtcCxcbiAgICAgIHVwZGF0ZWRBdDogdGltZXN0YW1wLFxuICAgIH07XG5cbiAgICAvLyBTYXZlIGluaXRpYWwgcmVhZGluZyByZWNvcmRcbiAgICBhd2FpdCBkeW5hbW9Eb2Muc2VuZChcbiAgICAgIG5ldyBQdXRDb21tYW5kKHtcbiAgICAgICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5SRUFESU5HU19UQUJMRV9OQU1FISxcbiAgICAgICAgSXRlbTogcmVhZGluZ1JlY29yZCxcbiAgICAgIH0pXG4gICAgKTtcblxuICAgIHRyeSB7XG4gICAgICAvLyBHZXQgT3BlbkFJIEFQSSBrZXlcbiAgICAgIGNvbnN0IGFwaUtleSA9IGF3YWl0IGdldE9wZW5BaUFwaUtleSgpO1xuXG4gICAgICAvLyBQcmVwYXJlIHByb21wdCBmb3IgT3BlbkFJXG4gICAgICBjb25zdCBwcm9tcHQgPSBgXG5HZW5lcmF0ZSBhIFNvdWwgQmx1ZXByaW50IHJlYWRpbmcgZm9yIHRoZSBmb2xsb3dpbmcgaW5kaXZpZHVhbDpcblxuQmlydGggSW5mb3JtYXRpb246XG4tIE5hbWU6ICR7dXNlclByb2ZpbGUucHJvZmlsZT8uYmlydGhOYW1lIHx8ICdVbmtub3duJ31cbi0gQmlydGggRGF0ZTogJHt1c2VyUHJvZmlsZS5wcm9maWxlPy5iaXJ0aERhdGUgfHwgJ1Vua25vd24nfVxuLSBCaXJ0aCBUaW1lOiAke3VzZXJQcm9maWxlLnByb2ZpbGU/LmJpcnRoVGltZSB8fCAnVW5rbm93bid9XG4tIEJpcnRoIExvY2F0aW9uOiAke3VzZXJQcm9maWxlLnByb2ZpbGU/LmJpcnRoQ2l0eX0sICR7dXNlclByb2ZpbGUucHJvZmlsZT8uYmlydGhTdGF0ZX0sICR7dXNlclByb2ZpbGUucHJvZmlsZT8uYmlydGhDb3VudHJ5fVxuXG5OYXRhbCBDaGFydCBEYXRhOlxuJHtKU09OLnN0cmluZ2lmeShuYXRhbENoYXJ0LCBudWxsLCAyKX1cblxuUGxlYXNlIHByb3ZpZGUgYSBjb21wcmVoZW5zaXZlIFNvdWwgQmx1ZXByaW50IHJlYWRpbmcgdGhhdCBpbmNsdWRlczpcblxuMS4gRmlyc3QsIGVjaG8gYmFjayB0aGUgbmF0YWwgY2hhcnQgaW5mb3JtYXRpb24gYWJvdmUgdG8gY29uZmlybSB5b3UgaGF2ZSByZWNlaXZlZCBpdCBjb3JyZWN0bHkuXG5cbjIuIFN1biBTaWduIEFuYWx5c2lzIC0gQ29yZSBpZGVudGl0eSBhbmQgbGlmZSBwdXJwb3NlXG5cbjMuIE1vb24gU2lnbiBBbmFseXNpcyAtIEVtb3Rpb25hbCBuYXR1cmUgYW5kIGlubmVyIHNlbGZcblxuNC4gUmlzaW5nIFNpZ24gQW5hbHlzaXMgLSBIb3cgeW91IHByZXNlbnQgdG8gdGhlIHdvcmxkXG5cbjUuIEtleSBQbGFuZXRhcnkgQXNwZWN0cyAtIE1ham9yIGluZmx1ZW5jZXMgYW5kIGNoYWxsZW5nZXNcblxuNi4gTGlmZSBQYXRoIEluc2lnaHRzIC0gWW91ciBzb3VsJ3Mgam91cm5leSBhbmQgbGVzc29uc1xuXG43LiBTdHJlbmd0aHMgYW5kIEdpZnRzIC0gWW91ciBuYXR1cmFsIHRhbGVudHNcblxuOC4gR3Jvd3RoIEFyZWFzIC0gV2hlcmUgdG8gZm9jdXMgeW91ciBkZXZlbG9wbWVudFxuXG5QbGVhc2UgbWFrZSB0aGUgcmVhZGluZyBwZXJzb25hbCwgaW5zaWdodGZ1bCwgYW5kIGFjdGlvbmFibGUgd2hpbGUgbWFpbnRhaW5pbmcgYSB3YXJtIGFuZCBlbmNvdXJhZ2luZyB0b25lLlxuYDtcblxuICAgICAgLy8gQ2FsbCBPcGVuQUkgQVBJXG4gICAgICBjb25zdCBjb250ZW50ID0gYXdhaXQgY2FsbE9wZW5BSShwcm9tcHQsIGFwaUtleSk7XG5cbiAgICAgIC8vIFVwZGF0ZSByZWFkaW5nIHdpdGggY29udGVudCBhbmQgc3RhdHVzXG4gICAgICBjb25zdCB1cGRhdGVkUmVhZGluZyA9IHtcbiAgICAgICAgLi4ucmVhZGluZ1JlY29yZCxcbiAgICAgICAgY29udGVudCxcbiAgICAgICAgc3RhdHVzOiAnUmVhZHknLFxuICAgICAgICB1cGRhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgICAgIH07XG5cbiAgICAgIGF3YWl0IGR5bmFtb0RvYy5zZW5kKFxuICAgICAgICBuZXcgUHV0Q29tbWFuZCh7XG4gICAgICAgICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5SRUFESU5HU19UQUJMRV9OQU1FISxcbiAgICAgICAgICBJdGVtOiB1cGRhdGVkUmVhZGluZyxcbiAgICAgICAgfSlcbiAgICAgICk7XG5cbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDIwMCxcbiAgICAgICAgaGVhZGVyczogY29yc0hlYWRlcnMsXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBtZXNzYWdlOiAnUmVhZGluZyBnZW5lcmF0ZWQgc3VjY2Vzc2Z1bGx5JyxcbiAgICAgICAgICByZWFkaW5nSWQsXG4gICAgICAgICAgc3RhdHVzOiAnUmVhZHknLFxuICAgICAgICB9KSxcbiAgICAgIH07XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGdlbmVyYXRpbmcgcmVhZGluZzonLCBlcnJvcik7XG5cbiAgICAgIC8vIFVwZGF0ZSByZWFkaW5nIHN0YXR1cyB0byBGYWlsZWRcbiAgICAgIGF3YWl0IGR5bmFtb0RvYy5zZW5kKFxuICAgICAgICBuZXcgUHV0Q29tbWFuZCh7XG4gICAgICAgICAgVGFibGVOYW1lOiBwcm9jZXNzLmVudi5SRUFESU5HU19UQUJMRV9OQU1FISxcbiAgICAgICAgICBJdGVtOiB7XG4gICAgICAgICAgICAuLi5yZWFkaW5nUmVjb3JkLFxuICAgICAgICAgICAgc3RhdHVzOiAnRmFpbGVkJyxcbiAgICAgICAgICAgIGVycm9yOiBlcnJvciBpbnN0YW5jZW9mIEVycm9yID8gZXJyb3IubWVzc2FnZSA6ICdVbmtub3duIGVycm9yJyxcbiAgICAgICAgICAgIHVwZGF0ZWRBdDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgICAgICAgIH0sXG4gICAgICAgIH0pXG4gICAgICApO1xuXG4gICAgICB0aHJvdyBlcnJvcjtcbiAgICB9XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3I6JywgZXJyb3IpO1xuICAgIHJldHVybiB7XG4gICAgICBzdGF0dXNDb2RlOiA1MDAsXG4gICAgICBoZWFkZXJzOiBjb3JzSGVhZGVycyxcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgbWVzc2FnZTogJ0ZhaWxlZCB0byBnZW5lcmF0ZSByZWFkaW5nJyxcbiAgICAgICAgZXJyb3I6IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogJ1Vua25vd24gZXJyb3InLFxuICAgICAgfSksXG4gICAgfTtcbiAgfVxufTsiXX0=