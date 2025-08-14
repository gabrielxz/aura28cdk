"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const logger_1 = require("../utils/logger");
const dynamoClient = new client_dynamodb_1.DynamoDBClient({});
const docClient = lib_dynamodb_1.DynamoDBDocumentClient.from(dynamoClient);
const READINGS_TABLE_NAME = process.env.READINGS_TABLE_NAME;
const VALID_STATUSES = ['Processing', 'Ready', 'Failed', 'In Review'];
const handler = async (event) => {
    logger_1.logger.info('Update reading status event:', event);
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
        // Parse request body
        const body = JSON.parse(event.body || '{}');
        const { status } = body;
        if (!status) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
                body: JSON.stringify({ error: 'Status is required' }),
            };
        }
        if (!VALID_STATUSES.includes(status)) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
                body: JSON.stringify({
                    error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`,
                }),
            };
        }
        // Check if reading exists
        const getResult = await docClient.send(new lib_dynamodb_1.GetCommand({
            TableName: READINGS_TABLE_NAME,
            Key: {
                userId: userId,
                readingId: readingId,
            },
        }));
        if (!getResult.Item) {
            return {
                statusCode: 404,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
                body: JSON.stringify({ error: 'Reading not found' }),
            };
        }
        // Update the reading status
        const updateResult = await docClient.send(new lib_dynamodb_1.UpdateCommand({
            TableName: READINGS_TABLE_NAME,
            Key: {
                userId: userId,
                readingId: readingId,
            },
            UpdateExpression: 'SET #status = :status, updatedAt = :updatedAt',
            ExpressionAttributeNames: {
                '#status': 'status',
            },
            ExpressionAttributeValues: {
                ':status': status,
                ':updatedAt': new Date().toISOString(),
            },
            ReturnValues: 'ALL_NEW',
        }));
        const updatedReading = updateResult.Attributes;
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({
                readingId: updatedReading?.readingId,
                userId: updatedReading?.userId,
                type: updatedReading?.type,
                status: updatedReading?.status,
                createdAt: updatedReading?.createdAt,
                updatedAt: updatedReading?.updatedAt,
            }),
        };
    }
    catch (error) {
        logger_1.logger.error('Error in update-reading-status handler:', error);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXBkYXRlLXJlYWRpbmctc3RhdHVzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsidXBkYXRlLXJlYWRpbmctc3RhdHVzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUNBLDhEQUEwRDtBQUMxRCx3REFBMEY7QUFDMUYsNENBQXlDO0FBRXpDLE1BQU0sWUFBWSxHQUFHLElBQUksZ0NBQWMsQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUM1QyxNQUFNLFNBQVMsR0FBRyxxQ0FBc0IsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUM7QUFFNUQsTUFBTSxtQkFBbUIsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLG1CQUFvQixDQUFDO0FBRTdELE1BQU0sY0FBYyxHQUFHLENBQUMsWUFBWSxFQUFFLE9BQU8sRUFBRSxRQUFRLEVBQUUsV0FBVyxDQUFDLENBQUM7QUFFL0QsTUFBTSxPQUFPLEdBQUcsS0FBSyxFQUFFLEtBQTJCLEVBQWtDLEVBQUU7SUFDM0YsZUFBTSxDQUFDLElBQUksQ0FBQyw4QkFBOEIsRUFBRSxLQUFLLENBQUMsQ0FBQztJQUVuRCxJQUFJLENBQUM7UUFDSCx5QkFBeUI7UUFDekIsTUFBTSxVQUFVLEdBQUcsS0FBSyxDQUFDLGNBQWMsRUFBRSxVQUFVLEVBQUUsTUFBTSxFQUFFLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztRQUNoRixNQUFNLE9BQU8sR0FDWCxVQUFVO1lBQ1YsQ0FBQyxPQUFPLFVBQVUsS0FBSyxRQUFRO2dCQUM3QixDQUFDLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDO2dCQUN6QyxDQUFDLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUMsSUFBSSxVQUFVLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7UUFFakUsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ2IsT0FBTztnQkFDTCxVQUFVLEVBQUUsR0FBRztnQkFD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O2dCQUN6QixTQUFTLEVBQUUsTUFBTTtnQkFDakIsWUFBWSxFQUFFLElBQUksSUFBSSxFQUFFLENBQUMsV0FBVyxFQUFFO2FBQ3ZDO1lBQ0QsWUFBWSxFQUFFLFNBQVM7U0FDeEIsQ0FBQyxDQUNILENBQUM7UUFFRixNQUFNLGNBQWMsR0FBRyxZQUFZLENBQUMsVUFBVSxDQUFDO1FBRS9DLE9BQU87WUFDTCxVQUFVLEVBQUUsR0FBRztZQUNmLE9BQU8sRUFBRTtnQkFDUCxjQUFjLEVBQUUsa0JBQWtCO2dCQUNsQyw2QkFBNkIsRUFBRSxHQUFHO2FBQ25DO1lBQ0QsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUM7Z0JBQ25CLFNBQVMsRUFBRSxjQUFjLEVBQUUsU0FBUztnQkFDcEMsTUFBTSxFQUFFLGNBQWMsRUFBRSxNQUFNO2dCQUM5QixJQUFJLEVBQUUsY0FBYyxFQUFFLElBQUk7Z0JBQzFCLE1BQU0sRUFBRSxjQUFjLEVBQUUsTUFBTTtnQkFDOUIsU0FBUyxFQUFFLGNBQWMsRUFBRSxTQUFTO2dCQUNwQyxTQUFTLEVBQUUsY0FBYyxFQUFFLFNBQVM7YUFDckMsQ0FBQztTQUNILENBQUM7SUFDSixDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLGVBQU0sQ0FBQyxLQUFLLENBQUMseUNBQXlDLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDL0QsT0FBTztZQUNMLFVBQVUsRUFBRSxHQUFHO1lBQ2YsT0FBTyxFQUFFO2dCQUNQLGNBQWMsRUFBRSxrQkFBa0I7Z0JBQ2xDLDZCQUE2QixFQUFFLEdBQUc7YUFDbkM7WUFDRCxJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLEtBQUssRUFBRSx1QkFBdUIsRUFBRSxDQUFDO1NBQ3pELENBQUM7SUFDSixDQUFDO0FBQ0gsQ0FBQyxDQUFDO0FBdklXLFFBQUEsT0FBTyxXQXVJbEIiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBBUElHYXRld2F5UHJveHlFdmVudCwgQVBJR2F0ZXdheVByb3h5UmVzdWx0IH0gZnJvbSAnYXdzLWxhbWJkYSc7XG5pbXBvcnQgeyBEeW5hbW9EQkNsaWVudCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1keW5hbW9kYic7XG5pbXBvcnQgeyBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LCBHZXRDb21tYW5kLCBVcGRhdGVDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvbGliLWR5bmFtb2RiJztcbmltcG9ydCB7IGxvZ2dlciB9IGZyb20gJy4uL3V0aWxzL2xvZ2dlcic7XG5cbmNvbnN0IGR5bmFtb0NsaWVudCA9IG5ldyBEeW5hbW9EQkNsaWVudCh7fSk7XG5jb25zdCBkb2NDbGllbnQgPSBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LmZyb20oZHluYW1vQ2xpZW50KTtcblxuY29uc3QgUkVBRElOR1NfVEFCTEVfTkFNRSA9IHByb2Nlc3MuZW52LlJFQURJTkdTX1RBQkxFX05BTUUhO1xuXG5jb25zdCBWQUxJRF9TVEFUVVNFUyA9IFsnUHJvY2Vzc2luZycsICdSZWFkeScsICdGYWlsZWQnLCAnSW4gUmV2aWV3J107XG5cbmV4cG9ydCBjb25zdCBoYW5kbGVyID0gYXN5bmMgKGV2ZW50OiBBUElHYXRld2F5UHJveHlFdmVudCk6IFByb21pc2U8QVBJR2F0ZXdheVByb3h5UmVzdWx0PiA9PiB7XG4gIGxvZ2dlci5pbmZvKCdVcGRhdGUgcmVhZGluZyBzdGF0dXMgZXZlbnQ6JywgZXZlbnQpO1xuXG4gIHRyeSB7XG4gICAgLy8gQ2hlY2sgaWYgdXNlciBpcyBhZG1pblxuICAgIGNvbnN0IHVzZXJHcm91cHMgPSBldmVudC5yZXF1ZXN0Q29udGV4dD8uYXV0aG9yaXplcj8uY2xhaW1zPy5bJ2NvZ25pdG86Z3JvdXBzJ107XG4gICAgY29uc3QgaXNBZG1pbiA9XG4gICAgICB1c2VyR3JvdXBzICYmXG4gICAgICAodHlwZW9mIHVzZXJHcm91cHMgPT09ICdzdHJpbmcnXG4gICAgICAgID8gdXNlckdyb3Vwcy5zcGxpdCgnLCcpLmluY2x1ZGVzKCdhZG1pbicpXG4gICAgICAgIDogQXJyYXkuaXNBcnJheSh1c2VyR3JvdXBzKSAmJiB1c2VyR3JvdXBzLmluY2x1ZGVzKCdhZG1pbicpKTtcblxuICAgIGlmICghaXNBZG1pbikge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNDAzLFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogJyonLFxuICAgICAgICB9LFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnQWNjZXNzIGRlbmllZC4gQWRtaW4gcHJpdmlsZWdlcyByZXF1aXJlZC4nIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBHZXQgdXNlciBJRCBhbmQgcmVhZGluZyBJRCBmcm9tIHBhdGggcGFyYW1ldGVyc1xuICAgIGNvbnN0IHVzZXJJZCA9IGV2ZW50LnBhdGhQYXJhbWV0ZXJzPy51c2VySWQ7XG4gICAgY29uc3QgcmVhZGluZ0lkID0gZXZlbnQucGF0aFBhcmFtZXRlcnM/LnJlYWRpbmdJZDtcbiAgICBpZiAoIXVzZXJJZCB8fCAhcmVhZGluZ0lkKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA0MDAsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiAnKicsXG4gICAgICAgIH0sXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICdVc2VyIElEIGFuZCBSZWFkaW5nIElEIGFyZSByZXF1aXJlZCcgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIFBhcnNlIHJlcXVlc3QgYm9keVxuICAgIGNvbnN0IGJvZHkgPSBKU09OLnBhcnNlKGV2ZW50LmJvZHkgfHwgJ3t9Jyk7XG4gICAgY29uc3QgeyBzdGF0dXMgfSA9IGJvZHk7XG5cbiAgICBpZiAoIXN0YXR1cykge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNDAwLFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogJyonLFxuICAgICAgICB9LFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnU3RhdHVzIGlzIHJlcXVpcmVkJyB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgaWYgKCFWQUxJRF9TVEFUVVNFUy5pbmNsdWRlcyhzdGF0dXMpKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA0MDAsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiAnKicsXG4gICAgICAgIH0sXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBlcnJvcjogYEludmFsaWQgc3RhdHVzLiBNdXN0IGJlIG9uZSBvZjogJHtWQUxJRF9TVEFUVVNFUy5qb2luKCcsICcpfWAsXG4gICAgICAgIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBDaGVjayBpZiByZWFkaW5nIGV4aXN0c1xuICAgIGNvbnN0IGdldFJlc3VsdCA9IGF3YWl0IGRvY0NsaWVudC5zZW5kKFxuICAgICAgbmV3IEdldENvbW1hbmQoe1xuICAgICAgICBUYWJsZU5hbWU6IFJFQURJTkdTX1RBQkxFX05BTUUsXG4gICAgICAgIEtleToge1xuICAgICAgICAgIHVzZXJJZDogdXNlcklkLFxuICAgICAgICAgIHJlYWRpbmdJZDogcmVhZGluZ0lkLFxuICAgICAgICB9LFxuICAgICAgfSksXG4gICAgKTtcblxuICAgIGlmICghZ2V0UmVzdWx0Lkl0ZW0pIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwNCxcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6ICcqJyxcbiAgICAgICAgfSxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ1JlYWRpbmcgbm90IGZvdW5kJyB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gVXBkYXRlIHRoZSByZWFkaW5nIHN0YXR1c1xuICAgIGNvbnN0IHVwZGF0ZVJlc3VsdCA9IGF3YWl0IGRvY0NsaWVudC5zZW5kKFxuICAgICAgbmV3IFVwZGF0ZUNvbW1hbmQoe1xuICAgICAgICBUYWJsZU5hbWU6IFJFQURJTkdTX1RBQkxFX05BTUUsXG4gICAgICAgIEtleToge1xuICAgICAgICAgIHVzZXJJZDogdXNlcklkLFxuICAgICAgICAgIHJlYWRpbmdJZDogcmVhZGluZ0lkLFxuICAgICAgICB9LFxuICAgICAgICBVcGRhdGVFeHByZXNzaW9uOiAnU0VUICNzdGF0dXMgPSA6c3RhdHVzLCB1cGRhdGVkQXQgPSA6dXBkYXRlZEF0JyxcbiAgICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZU5hbWVzOiB7XG4gICAgICAgICAgJyNzdGF0dXMnOiAnc3RhdHVzJyxcbiAgICAgICAgfSxcbiAgICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczoge1xuICAgICAgICAgICc6c3RhdHVzJzogc3RhdHVzLFxuICAgICAgICAgICc6dXBkYXRlZEF0JzogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgICAgICB9LFxuICAgICAgICBSZXR1cm5WYWx1ZXM6ICdBTExfTkVXJyxcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICBjb25zdCB1cGRhdGVkUmVhZGluZyA9IHVwZGF0ZVJlc3VsdC5BdHRyaWJ1dGVzO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1c0NvZGU6IDIwMCxcbiAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6ICcqJyxcbiAgICAgIH0sXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgIHJlYWRpbmdJZDogdXBkYXRlZFJlYWRpbmc/LnJlYWRpbmdJZCxcbiAgICAgICAgdXNlcklkOiB1cGRhdGVkUmVhZGluZz8udXNlcklkLFxuICAgICAgICB0eXBlOiB1cGRhdGVkUmVhZGluZz8udHlwZSxcbiAgICAgICAgc3RhdHVzOiB1cGRhdGVkUmVhZGluZz8uc3RhdHVzLFxuICAgICAgICBjcmVhdGVkQXQ6IHVwZGF0ZWRSZWFkaW5nPy5jcmVhdGVkQXQsXG4gICAgICAgIHVwZGF0ZWRBdDogdXBkYXRlZFJlYWRpbmc/LnVwZGF0ZWRBdCxcbiAgICAgIH0pLFxuICAgIH07XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgbG9nZ2VyLmVycm9yKCdFcnJvciBpbiB1cGRhdGUtcmVhZGluZy1zdGF0dXMgaGFuZGxlcjonLCBlcnJvcik7XG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1c0NvZGU6IDUwMCxcbiAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6ICcqJyxcbiAgICAgIH0sXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnSW50ZXJuYWwgc2VydmVyIGVycm9yJyB9KSxcbiAgICB9O1xuICB9XG59O1xuIl19