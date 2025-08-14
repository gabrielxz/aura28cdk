"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const logger_1 = require("../utils/logger");
const dynamoClient = new client_dynamodb_1.DynamoDBClient({});
const docClient = lib_dynamodb_1.DynamoDBDocumentClient.from(dynamoClient);
const READINGS_TABLE_NAME = process.env.READINGS_TABLE_NAME;
const USER_TABLE_NAME = process.env.USER_TABLE_NAME;
const handler = async (event) => {
    logger_1.logger.info('Get reading details event:', event);
    try {
        // Check if user is admin
        const userGroups = event.requestContext?.authorizer?.claims?.['cognito:groups'];
        const isAdmin = userGroups &&
            (typeof userGroups === 'string'
                ? userGroups.split(',').includes('admin')
                : Array.isArray(userGroups) && userGroups.includes('admin'));
        if (!isAdmin) {
            return {
                statusCode: 403,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
                body: JSON.stringify({ error: 'Access denied. Admin privileges required.' }),
            };
        }
        // Get reading ID from path parameters
        const readingId = event.pathParameters?.readingId;
        if (!readingId) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
                body: JSON.stringify({ error: 'Reading ID is required' }),
            };
        }
        // Fetch reading from DynamoDB
        const readingResult = await docClient.send(new lib_dynamodb_1.GetCommand({
            TableName: READINGS_TABLE_NAME,
            Key: {
                readingId: readingId,
            },
        }));
        if (!readingResult.Item) {
            return {
                statusCode: 404,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
                body: JSON.stringify({ error: 'Reading not found' }),
            };
        }
        const reading = readingResult.Item;
        // Fetch user email if userId exists
        if (reading.userId) {
            try {
                const userResult = await docClient.send(new lib_dynamodb_1.GetCommand({
                    TableName: USER_TABLE_NAME,
                    Key: {
                        userId: reading.userId,
                        createdAt: 'PROFILE',
                    },
                }));
                if (userResult.Item) {
                    reading.userEmail = userResult.Item.email;
                    // Include user profile birth information if available
                    if (userResult.Item.profile) {
                        reading.userProfile = {
                            birthName: userResult.Item.profile.birthName,
                            birthDate: userResult.Item.profile.birthDate,
                            birthTime: userResult.Item.profile.birthTime,
                            birthCity: userResult.Item.profile.birthCity,
                            birthState: userResult.Item.profile.birthState,
                            birthCountry: userResult.Item.profile.birthCountry,
                        };
                    }
                }
            }
            catch (error) {
                logger_1.logger.warn(`Failed to fetch user ${reading.userId}:`, error);
            }
        }
        // Format the response with full details
        const response = {
            readingId: reading.readingId,
            userId: reading.userId,
            userEmail: reading.userEmail,
            userProfile: reading.userProfile || null,
            type: reading.type,
            status: reading.status,
            createdAt: reading.createdAt,
            updatedAt: reading.updatedAt,
            content: reading.content || null,
            error: reading.error || null,
            metadata: reading.metadata || null,
        };
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify(response),
        };
    }
    catch (error) {
        logger_1.logger.error('Error in get-reading-details handler:', error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({ error: 'Internal server error' }),
        };
    }
};
exports.handler = handler;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2V0LXJlYWRpbmctZGV0YWlscy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImdldC1yZWFkaW5nLWRldGFpbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQ0EsOERBQTBEO0FBQzFELHdEQUEyRTtBQUMzRSw0Q0FBeUM7QUFFekMsTUFBTSxZQUFZLEdBQUcsSUFBSSxnQ0FBYyxDQUFDLEVBQUUsQ0FBQyxDQUFDO0FBQzVDLE1BQU0sU0FBUyxHQUFHLHFDQUFzQixDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQztBQUU1RCxNQUFNLG1CQUFtQixHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsbUJBQW9CLENBQUM7QUFDN0QsTUFBTSxlQUFlLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxlQUFnQixDQUFDO0FBRTlDLE1BQU0sT0FBTyxHQUFHLEtBQUssRUFBRSxLQUEyQixFQUFrQyxFQUFFO0lBQzNGLGVBQU0sQ0FBQyxJQUFJLENBQUMsNEJBQTRCLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFFakQsSUFBSSxDQUFDO1FBQ0gseUJBQXlCO1FBQ3pCLE1BQU0sVUFBVSxHQUFHLEtBQUssQ0FBQyxjQUFjLEVBQUUsVUFBVSxFQUFFLE1BQU0sRUFBRSxDQUFDLGdCQUFnQixDQUFDLENBQUM7UUFDaEYsTUFBTSxPQUFPLEdBQ1gsVUFBVTtZQUNWLENBQUMsT0FBTyxVQUFVLEtBQUssUUFBUTtnQkFDN0IsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQztnQkFDekMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDLElBQUksVUFBVSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO1FBRWpFLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUNiLE9BQU87Z0JBQ0wsVUFBVSxFQUFFLEdBQUc7Z0JBQ2YsT0FBTyxFQUFFO29CQUNQLGNBQWMs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eVByb3h5UmVzdWx0IH0gZnJvbSAnYXdzLWxhbWJkYSc7XG5pbXBvcnQgeyBEeW5hbW9EQkNsaWVudCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1keW5hbW9kYic7XG5pbXBvcnQgeyBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LCBHZXRDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvbGliLWR5bmFtb2RiJztcbmltcG9ydCB7IGxvZ2dlciB9IGZyb20gJy4uL3V0aWxzL2xvZ2dlcic7XG5cbmNvbnN0IGR5bmFtb0NsaWVudCA9IG5ldyBEeW5hbW9EQkNsaWVudCh7fSk7XG5jb25zdCBkb2NDbGllbnQgPSBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LmZyb20oZHluYW1vQ2xpZW50KTtcblxuY29uc3QgUkVBRElOR1NfVEFCTEVfTkFNRSA9IHByb2Nlc3MuZW52LlJFQURJTkdTX1RBQkxFX05BTUUhO1xuY29uc3QgVVNFUl9UQUJMRV9OQU1FID0gcHJvY2Vzcy5lbnYuVVNFUl9UQUJMRV9OQU1FITtcblxuZXhwb3J0IGNvbnN0IGhhbmRsZXIgPSBhc3luYyAoZXZlbnQ6IEFQSUdhdGV3YXlQcm94eUV2ZW50KTogUHJvbWlzZTxBUElHYXRld2F5UHJveHlSZXN1bHQ+ID0+IHtcbiAgbG9nZ2VyLmluZm8oJ0dldCByZWFkaW5nIGRldGFpbHMgZXZlbnQ6JywgZXZlbnQpO1xuXG4gIHRyeSB7XG4gICAgLy8gQ2hlY2sgaWYgdXNlciBpcyBhZG1pblxuICAgIGNvbnN0IHVzZXJHcm91cHMgPSBldmVudC5yZXF1ZXN0Q29udGV4dD8uYXV0aG9yaXplcj8uY2xhaW1zPy5bJ2NvZ25pdG86Z3JvdXBzJ107XG4gICAgY29uc3QgaXNBZG1pbiA9XG4gICAgICB1c2VyR3JvdXBzICYmXG4gICAgICAodHlwZW9mIHVzZXJHcm91cHMgPT09ICdzdHJpbmcnXG4gICAgICAgID8gdXNlckdyb3Vwcy5zcGxpdCgnLCcpLmluY2x1ZGVzKCdhZG1pbicpXG4gICAgICAgIDogQXJyYXkuaXNBcnJheSh1c2VyR3JvdXBzKSAmJiB1c2VyR3JvdXBzLmluY2x1ZGVzKCdhZG1pbicpKTtcblxuICAgIGlmICghaXNBZG1pbikge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNDAzLFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogJyonLFxuICAgICAgICB9LFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnQWNjZXNzIGRlbmllZC4gQWRtaW4gcHJpdmlsZWdlcyByZXF1aXJlZC4nIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBHZXQgcmVhZGluZyBJRCBmcm9tIHBhdGggcGFyYW1ldGVyc1xuICAgIGNvbnN0IHJlYWRpbmdJZCA9IGV2ZW50LnBhdGhQYXJhbWV0ZXJzPy5yZWFkaW5nSWQ7XG4gICAgaWYgKCFyZWFkaW5nSWQpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMCxcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6ICcqJyxcbiAgICAgICAgfSxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ1JlYWRpbmcgSUQgaXMgcmVxdWlyZWQnIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBGZXRjaCByZWFkaW5nIGZyb20gRHluYW1vREJcbiAgICBjb25zdCByZWFkaW5nUmVzdWx0ID0gYXdhaXQgZG9jQ2xpZW50LnNlbmQoXG4gICAgICBuZXcgR2V0Q29tbWFuZCh7XG4gICAgICAgIFRhYmxlTmFtZTogUkVBRElOR1NfVEFCTEVfTkFNRSxcbiAgICAgICAgS2V5OiB7XG4gICAgICAgICAgcmVhZGluZ0lkOiByZWFkaW5nSWQsXG4gICAgICAgIH0sXG4gICAgICB9KSxcbiAgICApO1xuXG4gICAgaWYgKCFyZWFkaW5nUmVzdWx0Lkl0ZW0pIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwNCxcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6ICcqJyxcbiAgICAgICAgfSxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ1JlYWRpbmcgbm90IGZvdW5kJyB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgY29uc3QgcmVhZGluZyA9IHJlYWRpbmdSZXN1bHQuSXRlbTtcblxuICAgIC8vIEZldGNoIHVzZXIgZW1haWwgaWYgdXNlcklkIGV4aXN0c1xuICAgIGlmIChyZWFkaW5nLnVzZXJJZCkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgdXNlclJlc3VsdCA9IGF3YWl0IGRvY0NsaWVudC5zZW5kKFxuICAgICAgICAgIG5ldyBHZXRDb21tYW5kKHtcbiAgICAgICAgICAgIFRhYmxlTmFtZTogVVNFUl9UQUJMRV9OQU1FLFxuICAgICAgICAgICAgS2V5OiB7XG4gICAgICAgICAgICAgIHVzZXJJZDogcmVhZGluZy51c2VySWQsXG4gICAgICAgICAgICAgIGNyZWF0ZWRBdDogJ1BST0ZJTEUnLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgKTtcblxuICAgICAgICBpZiAodXNlclJlc3VsdC5JdGVtKSB7XG4gICAgICAgICAgcmVhZGluZy51c2VyRW1haWwgPSB1c2VyUmVzdWx0Lkl0ZW0uZW1haWw7XG4gICAgICAgICAgLy8gSW5jbHVkZSB1c2VyIHByb2ZpbGUgYmlydGggaW5mb3JtYXRpb24gaWYgYXZhaWxhYmxlXG4gICAgICAgICAgaWYgKHVzZXJSZXN1bHQuSXRlbS5wcm9maWxlKSB7XG4gICAgICAgICAgICByZWFkaW5nLnVzZXJQcm9maWxlID0ge1xuICAgICAgICAgICAgICBiaXJ0aE5hbWU6IHVzZXJSZXN1bHQuSXRlbS5wcm9maWxlLmJpcnRoTmFtZSxcbiAgICAgICAgICAgICAgYmlydGhEYXRlOiB1c2VyUmVzdWx0Lkl0ZW0ucHJvZmlsZS5iaXJ0aERhdGUsXG4gICAgICAgICAgICAgIGJpcnRoVGltZTogdXNlclJlc3VsdC5JdGVtLnByb2ZpbGUuYmlydGhUaW1lLFxuICAgICAgICAgICAgICBiaXJ0aENpdHk6IHVzZXJSZXN1bHQuSXRlbS5wcm9maWxlLmJpcnRoQ2l0eSxcbiAgICAgICAgICAgICAgYmlydGhTdGF0ZTogdXNlclJlc3VsdC5JdGVtLnByb2ZpbGUuYmlydGhTdGF0ZSxcbiAgICAgICAgICAgICAgYmlydGhDb3VudHJ5OiB1c2VyUmVzdWx0Lkl0ZW0ucHJvZmlsZS5iaXJ0aENvdW50cnksXG4gICAgICAgICAgICB9O1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgbG9nZ2VyLndhcm4oYEZhaWxlZCB0byBmZXRjaCB1c2VyICR7cmVhZGluZy51c2VySWR9OmAsIGVycm9yKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBGb3JtYXQgdGhlIHJlc3BvbnNlIHdpdGggZnVsbCBkZXRhaWxzXG4gICAgY29uc3QgcmVzcG9uc2UgPSB7XG4gICAgICByZWFkaW5nSWQ6IHJlYWRpbmcucmVhZGluZ0lkLFxuICAgICAgdXNlcklkOiByZWFkaW5nLnVzZXJJZCxcbiAgICAgIHVzZXJFbWFpbDogcmVhZGluZy51c2VyRW1haWwsXG4gICAgICB1c2VyUHJvZmlsZTogcmVhZGluZy51c2VyUHJvZmlsZSB8fCBudWxsLFxuICAgICAgdHlwZTogcmVhZGluZy50eXBlLFxuICAgICAgc3RhdHVzOiByZWFkaW5nLnN0YXR1cyxcbiAgICAgIGNyZWF0ZWRBdDogcmVhZGluZy5jcmVhdGVkQXQsXG4gICAgICB1cGRhdGVkQXQ6IHJlYWRpbmcudXBkYXRlZEF0LFxuICAgICAgY29udGVudDogcmVhZGluZy5jb250ZW50IHx8IG51bGwsXG4gICAgICBlcnJvcjogcmVhZGluZy5lcnJvciB8fCBudWxsLFxuICAgICAgbWV0YWRhdGE6IHJlYWRpbmcubWV0YWRhdGEgfHwgbnVsbCxcbiAgICB9O1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1c0NvZGU6IDIwMCxcbiAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6ICcqJyxcbiAgICAgIH0sXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeShyZXNwb25zZSksXG4gICAgfTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBsb2dnZXIuZXJyb3IoJ0Vycm9yIGluIGdldC1yZWFkaW5nLWRldGFpbHMgaGFuZGxlcjonLCBlcnJvcik7XG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1c0NvZGU6IDUwMCxcbiAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6ICcqJyxcbiAgICAgIH0sXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnSW50ZXJuYWwgc2VydmVyIGVycm9yJyB9KSxcbiAgICB9O1xuICB9XG59O1xuIl19