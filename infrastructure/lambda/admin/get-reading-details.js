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
        // Get user ID and reading ID from path parameters
        const userId = event.pathParameters?.userId;
        const readingId = event.pathParameters?.readingId;
        if (!userId || !readingId) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
                body: JSON.stringify({ error: 'User ID and Reading ID are required' }),
            };
        }
        // Fetch reading from DynamoDB
        const readingResult = await docClient.send(new lib_dynamodb_1.GetCommand({
            TableName: READINGS_TABLE_NAME,
            Key: {
                userId: userId,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2V0LXJlYWRpbmctZGV0YWlscy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImdldC1yZWFkaW5nLWRldGFpbHMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQ0EsOERBQTBEO0FBQzFELHdEQUEyRTtBQUMzRSw0Q0FBeUM7QUFFekMsTUFBTSxZQUFZLEdBQUcsSUFBSSxnQ0FBYyxDQUFDLEVBQUUsQ0FBQyxDQUFDO0FBQzVDLE1BQU0sU0FBUyxHQUFHLHFDQUFzQixDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQztBQUU1RCxNQUFNLG1CQUFtQixHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsbUJBQW9CLENBQUM7QUFDN0QsTUFBTSxlQUFlLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxlQUFnQixDQUFDO0FBRTlDLE1BQU0sT0FBTyxHQUFHLEtBQUssRUFBRSxLQUEyQixFQUFrQyxFQUFFO0lBQzNGLGVBQU0sQ0FBQyxJQUFJLENBQUMsNEJBQTRCLEVBQUUsS0FBSyxDQUFDLENBQUM7SUFFakQsSUFBSSxDQUFDO1FBQ0gseUJBQXlCO1FBQ3pCLE1BQU0sVUFBVSxHQUFHLEtBQUssQ0FBQyxjQUFjLEVBQUUsVUFBVSxFQUFFLE1BQU0sRUFBRSxDQUFDLGdCQUFnQixDQUFDLENBQUM7UUFDaEYsTUFBTSxPQUFPLEdBQ1gsVUFBVTtZQUNWLENBQUMsT0FBTyxVQUFVLEtBQUssUUFBUTtnQkFDN0IsQ0FBQyxDQUFDLFVBQVUsQ0FBQyxLQUFLLENBQUMsR0FBRyxDQUFDLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQztnQkFDekMsQ0FBQyxDQUFDLEtBQUssQ0FBQyxPQUFPLENBQUMsVUFBVSxDQUFDLElBQUksVUFBVSxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsQ0FBQyxDQUFDO1FBRWpFLElBQUksQ0FBQyxPQUFPLEVBQUUsQ0FBQztZQUNiLE9BQU87Z0JBQ0wsVUFBVSxFQUFFLEdBQUc7Z0JBQ2YsT0FBTyxFQUFFO29CQUNQLGNBQWMs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Q0FBQztBQS9IVyxRQUFBLE9BQU8sV0ErSGxCIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQVBJR2F0ZXdheVByb3h5RXZlbnQsIEFQSUdhdGV3YXlQcm94eVJlc3VsdCB9IGZyb20gJ2F3cy1sYW1iZGEnO1xuaW1wb3J0IHsgRHluYW1vREJDbGllbnQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtZHluYW1vZGInO1xuaW1wb3J0IHsgRHluYW1vREJEb2N1bWVudENsaWVudCwgR2V0Q29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2xpYi1keW5hbW9kYic7XG5pbXBvcnQgeyBsb2dnZXIgfSBmcm9tICcuLi91dGlscy9sb2dnZXInO1xuXG5jb25zdCBkeW5hbW9DbGllbnQgPSBuZXcgRHluYW1vREJDbGllbnQoe30pO1xuY29uc3QgZG9jQ2xpZW50ID0gRHluYW1vREJEb2N1bWVudENsaWVudC5mcm9tKGR5bmFtb0NsaWVudCk7XG5cbmNvbnN0IFJFQURJTkdTX1RBQkxFX05BTUUgPSBwcm9jZXNzLmVudi5SRUFESU5HU19UQUJMRV9OQU1FITtcbmNvbnN0IFVTRVJfVEFCTEVfTkFNRSA9IHByb2Nlc3MuZW52LlVTRVJfVEFCTEVfTkFNRSE7XG5cbmV4cG9ydCBjb25zdCBoYW5kbGVyID0gYXN5bmMgKGV2ZW50OiBBUElHYXRld2F5UHJveHlFdmVudCk6IFByb21pc2U8QVBJR2F0ZXdheVByb3h5UmVzdWx0PiA9PiB7XG4gIGxvZ2dlci5pbmZvKCdHZXQgcmVhZGluZyBkZXRhaWxzIGV2ZW50OicsIGV2ZW50KTtcblxuICB0cnkge1xuICAgIC8vIENoZWNrIGlmIHVzZXIgaXMgYWRtaW5cbiAgICBjb25zdCB1c2VyR3JvdXBzID0gZXZlbnQucmVxdWVzdENvbnRleHQ/LmF1dGhvcml6ZXI/LmNsYWltcz8uWydjb2duaXRvOmdyb3VwcyddO1xuICAgIGNvbnN0IGlzQWRtaW4gPVxuICAgICAgdXNlckdyb3VwcyAmJlxuICAgICAgKHR5cGVvZiB1c2VyR3JvdXBzID09PSAnc3RyaW5nJ1xuICAgICAgICA/IHVzZXJHcm91cHMuc3BsaXQoJywnKS5pbmNsdWRlcygnYWRtaW4nKVxuICAgICAgICA6IEFycmF5LmlzQXJyYXkodXNlckdyb3VwcykgJiYgdXNlckdyb3Vwcy5pbmNsdWRlcygnYWRtaW4nKSk7XG5cbiAgICBpZiAoIWlzQWRtaW4pIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMyxcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6ICcqJyxcbiAgICAgICAgfSxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ0FjY2VzcyBkZW5pZWQuIEFkbWluIHByaXZpbGVnZXMgcmVxdWlyZWQuJyB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gR2V0IHVzZXIgSUQgYW5kIHJlYWRpbmcgSUQgZnJvbSBwYXRoIHBhcmFtZXRlcnNcbiAgICBjb25zdCB1c2VySWQgPSBldmVudC5wYXRoUGFyYW1ldGVycz8udXNlcklkO1xuICAgIGNvbnN0IHJlYWRpbmdJZCA9IGV2ZW50LnBhdGhQYXJhbWV0ZXJzPy5yZWFkaW5nSWQ7XG4gICAgaWYgKCF1c2VySWQgfHwgIXJlYWRpbmdJZCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNDAwLFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogJyonLFxuICAgICAgICB9LFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnVXNlciBJRCBhbmQgUmVhZGluZyBJRCBhcmUgcmVxdWlyZWQnIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBGZXRjaCByZWFkaW5nIGZyb20gRHluYW1vREJcbiAgICBjb25zdCByZWFkaW5nUmVzdWx0ID0gYXdhaXQgZG9jQ2xpZW50LnNlbmQoXG4gICAgICBuZXcgR2V0Q29tbWFuZCh7XG4gICAgICAgIFRhYmxlTmFtZTogUkVBRElOR1NfVEFCTEVfTkFNRSxcbiAgICAgICAgS2V5OiB7XG4gICAgICAgICAgdXNlcklkOiB1c2VySWQsXG4gICAgICAgICAgcmVhZGluZ0lkOiByZWFkaW5nSWQsXG4gICAgICAgIH0sXG4gICAgICB9KSxcbiAgICApO1xuXG4gICAgaWYgKCFyZWFkaW5nUmVzdWx0Lkl0ZW0pIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwNCxcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6ICcqJyxcbiAgICAgICAgfSxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ1JlYWRpbmcgbm90IGZvdW5kJyB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgY29uc3QgcmVhZGluZyA9IHJlYWRpbmdSZXN1bHQuSXRlbTtcblxuICAgIC8vIEZldGNoIHVzZXIgZW1haWwgaWYgdXNlcklkIGV4aXN0c1xuICAgIGlmIChyZWFkaW5nLnVzZXJJZCkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgY29uc3QgdXNlclJlc3VsdCA9IGF3YWl0IGRvY0NsaWVudC5zZW5kKFxuICAgICAgICAgIG5ldyBHZXRDb21tYW5kKHtcbiAgICAgICAgICAgIFRhYmxlTmFtZTogVVNFUl9UQUJMRV9OQU1FLFxuICAgICAgICAgICAgS2V5OiB7XG4gICAgICAgICAgICAgIHVzZXJJZDogcmVhZGluZy51c2VySWQsXG4gICAgICAgICAgICAgIGNyZWF0ZWRBdDogJ1BST0ZJTEUnLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICB9KSxcbiAgICAgICAgKTtcblxuICAgICAgICBpZiAodXNlclJlc3VsdC5JdGVtKSB7XG4gICAgICAgICAgcmVhZGluZy51c2VyRW1haWwgPSB1c2VyUmVzdWx0Lkl0ZW0uZW1haWw7XG4gICAgICAgICAgLy8gSW5jbHVkZSB1c2VyIHByb2ZpbGUgYmlydGggaW5mb3JtYXRpb24gaWYgYXZhaWxhYmxlXG4gICAgICAgICAgaWYgKHVzZXJSZXN1bHQuSXRlbS5wcm9maWxlKSB7XG4gICAgICAgICAgICByZWFkaW5nLnVzZXJQcm9maWxlID0ge1xuICAgICAgICAgICAgICBiaXJ0aE5hbWU6IHVzZXJSZXN1bHQuSXRlbS5wcm9maWxlLmJpcnRoTmFtZSxcbiAgICAgICAgICAgICAgYmlydGhEYXRlOiB1c2VyUmVzdWx0Lkl0ZW0ucHJvZmlsZS5iaXJ0aERhdGUsXG4gICAgICAgICAgICAgIGJpcnRoVGltZTogdXNlclJlc3VsdC5JdGVtLnByb2ZpbGUuYmlydGhUaW1lLFxuICAgICAgICAgICAgICBiaXJ0aENpdHk6IHVzZXJSZXN1bHQuSXRlbS5wcm9maWxlLmJpcnRoQ2l0eSxcbiAgICAgICAgICAgICAgYmlydGhTdGF0ZTogdXNlclJlc3VsdC5JdGVtLnByb2ZpbGUuYmlydGhTdGF0ZSxcbiAgICAgICAgICAgICAgYmlydGhDb3VudHJ5OiB1c2VyUmVzdWx0Lkl0ZW0ucHJvZmlsZS5iaXJ0aENvdW50cnksXG4gICAgICAgICAgICB9O1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgICAgbG9nZ2VyLndhcm4oYEZhaWxlZCB0byBmZXRjaCB1c2VyICR7cmVhZGluZy51c2VySWR9OmAsIGVycm9yKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvLyBGb3JtYXQgdGhlIHJlc3BvbnNlIHdpdGggZnVsbCBkZXRhaWxzXG4gICAgY29uc3QgcmVzcG9uc2UgPSB7XG4gICAgICByZWFkaW5nSWQ6IHJlYWRpbmcucmVhZGluZ0lkLFxuICAgICAgdXNlcklkOiByZWFkaW5nLnVzZXJJZCxcbiAgICAgIHVzZXJFbWFpbDogcmVhZGluZy51c2VyRW1haWwsXG4gICAgICB1c2VyUHJvZmlsZTogcmVhZGluZy51c2VyUHJvZmlsZSB8fCBudWxsLFxuICAgICAgdHlwZTogcmVhZGluZy50eXBlLFxuICAgICAgc3RhdHVzOiByZWFkaW5nLnN0YXR1cyxcbiAgICAgIGNyZWF0ZWRBdDogcmVhZGluZy5jcmVhdGVkQXQsXG4gICAgICB1cGRhdGVkQXQ6IHJlYWRpbmcudXBkYXRlZEF0LFxuICAgICAgY29udGVudDogcmVhZGluZy5jb250ZW50IHx8IG51bGwsXG4gICAgICBlcnJvcjogcmVhZGluZy5lcnJvciB8fCBudWxsLFxuICAgICAgbWV0YWRhdGE6IHJlYWRpbmcubWV0YWRhdGEgfHwgbnVsbCxcbiAgICB9O1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1c0NvZGU6IDIwMCxcbiAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6ICcqJyxcbiAgICAgIH0sXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeShyZXNwb25zZSksXG4gICAgfTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBsb2dnZXIuZXJyb3IoJ0Vycm9yIGluIGdldC1yZWFkaW5nLWRldGFpbHMgaGFuZGxlcjonLCBlcnJvcik7XG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1c0NvZGU6IDUwMCxcbiAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6ICcqJyxcbiAgICAgIH0sXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnSW50ZXJuYWwgc2VydmVyIGVycm9yJyB9KSxcbiAgICB9O1xuICB9XG59O1xuIl19