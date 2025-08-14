"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const logger_1 = require("../utils/logger");
const dynamoClient = new client_dynamodb_1.DynamoDBClient({});
const docClient = lib_dynamodb_1.DynamoDBDocumentClient.from(dynamoClient);
const READINGS_TABLE_NAME = process.env.READINGS_TABLE_NAME;
const handler = async (event) => {
    logger_1.logger.info('Delete reading event:', event);
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
        // Delete the reading
        await docClient.send(new lib_dynamodb_1.DeleteCommand({
            TableName: READINGS_TABLE_NAME,
            Key: {
                userId: userId,
                readingId: readingId,
            },
        }));
        logger_1.logger.info(`Successfully deleted reading ${readingId} for user ${userId}`);
        return {
            statusCode: 204,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
            body: '',
        };
    }
    catch (error) {
        logger_1.logger.error('Error in delete-reading handler:', error);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVsZXRlLXJlYWRpbmcuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJkZWxldGUtcmVhZGluZy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFDQSw4REFBMEQ7QUFDMUQsd0RBQTBGO0FBQzFGLDRDQUF5QztBQUV6QyxNQUFNLFlBQVksR0FBRyxJQUFJLGdDQUFjLENBQUMsRUFBRSxDQUFDLENBQUM7QUFDNUMsTUFBTSxTQUFTLEdBQUcscUNBQXNCLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDO0FBRTVELE1BQU0sbUJBQW1CLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxtQkFBb0IsQ0FBQztBQUV0RCxNQUFNLE9BQU8sR0FBRyxLQUFLLEVBQUUsS0FBMkIsRUFBa0MsRUFBRTtJQUMzRixlQUFNLENBQUMsSUFBSSxDQUFDLHVCQUF1QixFQUFFLEtBQUssQ0FBQyxDQUFDO0lBRTVDLElBQUksQ0FBQztRQUNILHlCQUF5QjtRQUN6QixNQUFNLFVBQVUsR0FBRyxLQUFLLENBQUMsY0FBYyxFQUFFLFVBQVUsRUFBRSxNQUFNLEVBQUUsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO1FBQ2hGLE1BQU0sT0FBTyxHQUNYLFVBQVU7WUFDVixDQUFDLE9BQU8sVUFBVSxLQUFLLFFBQVE7Z0JBQzdCLENBQUMsQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUM7Z0JBQ3pDLENBQUMsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQyxJQUFJLFVBQVUsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztRQUVqRSxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDYixPQUFPO2dCQUNMLFVBQVUsRUFBRSxHQUFHO2dCQUNmLE9BQU8sRUFBRTtvQkFDUCxjQUFjLEVBQUUsa0JBQWtCO29CQUNsQyw2QkFBNkIsRUFBRSxHQUFHO2lCQUNuQztnQkFDRCxJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLEtBQUssRUFBRSwyQ0FBMkMsRUFBRSxDQUFDO2FBQzdFLENBQUM7UUFDSixDQUFDO1FBRUQsa0RBQWtEO1FBQ2xELE1BQU0sTUFBTSxHQUFHLEtBQUssQ0FBQyxjQUFjLEVBQUUsTUFBTSxDQUFDO1FBQzVDLE1BQU0sU0FBUyxHQUFHLEtBQUssQ0FBQyxjQUFjLEVBQUUsU0FBUyxDQUFDO1FBQ2xELElBQUksQ0FBQyxNQUFNLElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUMxQixPQUFPO2dCQUNMLFVBQVUsRUFBRSxHQUFHO2dCQUNmLE9BQU8sRUFBRTtvQkFDUCxjQUFjLEVBQUUsa0JBQWtCO29CQUNsQyw2QkFBNkIsRUFBRSxHQUFHO2lCQUNuQztnQkFDRCxJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLEtBQUssRUFBRSxxQ0FBcUMsRUFBRSxDQUFDO2FBQ3ZFLENBQUM7UUFDSixDQUFDO1FBRUQsMEJBQTBCO1FBQzFCLE1BQU0sU0FBUyxHQUFHLE1BQU0sU0FBUyxDQUFDLElBQUksQ0FDcEMsSUFBSSx5QkFBVSxDQUFDO1lBQ2IsU0FBUyxFQUFFLG1CQUFtQjtZQUM5QixHQUFHLEVBQUU7Z0JBQ0gsTUFBTSxFQUFFLE1BQU07Z0JBQ2QsU0FBUyxFQUFFLFNBQVM7YUFDckI7U0FDRixDQUFDLENBQ0gsQ0FBQztRQUVGLElBQUksQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLENBQUM7WUFDcEIsT0FBTztnQkFDTCxVQUFVLEVBQUUsR0FBRztnQkFDZixPQUFPLEVBQUU7b0JBQ1AsY0FBYyxFQUFFLGtCQUFrQjtvQkFDbEMsNkJBQTZCLEVBQUUsR0FBRztpQkFDbkM7Z0JBQ0QsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxLQUFLLEVBQUUsbUJBQW1CLEVBQUUsQ0FBQzthQUNyRCxDQUFDO1FBQ0osQ0FBQztRQUVELHFCQUFxQjtRQUNyQixNQUFNLFNBQVMsQ0FBQyxJQUFJLENBQ2xCLElBQUksNEJBQWEsQ0FBQztZQUNoQixTQUFTLEVBQUUsbUJBQW1CO1lBQzlCLEdBQUcsRUFBRTtnQkFDSCxNQUFNLEVBQUUsTUFBTTtnQkFDZCxTQUFTLEVBQUUsU0FBUzthQUNyQjtTQUNGLENBQUMsQ0FDSCxDQUFDO1FBRUYsZUFBTSxDQUFDLElBQUksQ0FBQyxnQ0FBZ0MsU0FBUyxhQUFhLE1BQU0sRUFBRSxDQUFDLENBQUM7UUFFNUUsT0FBTztZQUNMLFVBQVUsRUFBRSxHQUFHO1lBQ2YsT0FBTyxFQUFFO2dCQUNQLGNBQWMsRUFBRSxrQkFBa0I7Z0JBQ2xDLDZCQUE2QixFQUFFLEdBQUc7YUFDbkM7WUFDRCxJQUFJLEVBQUUsRUFBRTtTQUNULENBQUM7SUFDSixDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLGVBQU0sQ0FBQyxLQUFLLENBQUMsa0NBQWtDLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDeEQsT0FBTztZQUNMLFVBQVUsRUFBRSxHQUFHO1lBQ2YsT0FBTyxFQUFFO2dCQUNQLGNBQWMsRUFBRSxrQkFBa0I7Z0JBQ2xDLDZCQUE2QixFQUFFLEdBQUc7YUFDbkM7WUFDRCxJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLEtBQUssRUFBRSx1QkFBdUIsRUFBRSxDQUFDO1NBQ3pELENBQUM7SUFDSixDQUFDO0FBQ0gsQ0FBQyxDQUFDO0FBM0ZXLFFBQUEsT0FBTyxXQTJGbEIiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBBUElHYXRld2F5UHJveHlFdmVudCwgQVBJR2F0ZXdheVByb3h5UmVzdWx0IH0gZnJvbSAnYXdzLWxhbWJkYSc7XG5pbXBvcnQgeyBEeW5hbW9EQkNsaWVudCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1keW5hbW9kYic7XG5pbXBvcnQgeyBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LCBHZXRDb21tYW5kLCBEZWxldGVDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvbGliLWR5bmFtb2RiJztcbmltcG9ydCB7IGxvZ2dlciB9IGZyb20gJy4uL3V0aWxzL2xvZ2dlcic7XG5cbmNvbnN0IGR5bmFtb0NsaWVudCA9IG5ldyBEeW5hbW9EQkNsaWVudCh7fSk7XG5jb25zdCBkb2NDbGllbnQgPSBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LmZyb20oZHluYW1vQ2xpZW50KTtcblxuY29uc3QgUkVBRElOR1NfVEFCTEVfTkFNRSA9IHByb2Nlc3MuZW52LlJFQURJTkdTX1RBQkxFX05BTUUhO1xuXG5leHBvcnQgY29uc3QgaGFuZGxlciA9IGFzeW5jIChldmVudDogQVBJR2F0ZXdheVByb3h5RXZlbnQpOiBQcm9taXNlPEFQSUdhdGV3YXlQcm94eVJlc3VsdD4gPT4ge1xuICBsb2dnZXIuaW5mbygnRGVsZXRlIHJlYWRpbmcgZXZlbnQ6JywgZXZlbnQpO1xuXG4gIHRyeSB7XG4gICAgLy8gQ2hlY2sgaWYgdXNlciBpcyBhZG1pblxuICAgIGNvbnN0IHVzZXJHcm91cHMgPSBldmVudC5yZXF1ZXN0Q29udGV4dD8uYXV0aG9yaXplcj8uY2xhaW1zPy5bJ2NvZ25pdG86Z3JvdXBzJ107XG4gICAgY29uc3QgaXNBZG1pbiA9XG4gICAgICB1c2VyR3JvdXBzICYmXG4gICAgICAodHlwZW9mIHVzZXJHcm91cHMgPT09ICdzdHJpbmcnXG4gICAgICAgID8gdXNlckdyb3Vwcy5zcGxpdCgnLCcpLmluY2x1ZGVzKCdhZG1pbicpXG4gICAgICAgIDogQXJyYXkuaXNBcnJheSh1c2VyR3JvdXBzKSAmJiB1c2VyR3JvdXBzLmluY2x1ZGVzKCdhZG1pbicpKTtcblxuICAgIGlmICghaXNBZG1pbikge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNDAzLFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogJyonLFxuICAgICAgICB9LFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnQWNjZXNzIGRlbmllZC4gQWRtaW4gcHJpdmlsZWdlcyByZXF1aXJlZC4nIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBHZXQgdXNlciBJRCBhbmQgcmVhZGluZyBJRCBmcm9tIHBhdGggcGFyYW1ldGVyc1xuICAgIGNvbnN0IHVzZXJJZCA9IGV2ZW50LnBhdGhQYXJhbWV0ZXJzPy51c2VySWQ7XG4gICAgY29uc3QgcmVhZGluZ0lkID0gZXZlbnQucGF0aFBhcmFtZXRlcnM/LnJlYWRpbmdJZDtcbiAgICBpZiAoIXVzZXJJZCB8fCAhcmVhZGluZ0lkKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA0MDAsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiAnKicsXG4gICAgICAgIH0sXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICdVc2VyIElEIGFuZCBSZWFkaW5nIElEIGFyZSByZXF1aXJlZCcgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIENoZWNrIGlmIHJlYWRpbmcgZXhpc3RzXG4gICAgY29uc3QgZ2V0UmVzdWx0ID0gYXdhaXQgZG9jQ2xpZW50LnNlbmQoXG4gICAgICBuZXcgR2V0Q29tbWFuZCh7XG4gICAgICAgIFRhYmxlTmFtZTogUkVBRElOR1NfVEFCTEVfTkFNRSxcbiAgICAgICAgS2V5OiB7XG4gICAgICAgICAgdXNlcklkOiB1c2VySWQsXG4gICAgICAgICAgcmVhZGluZ0lkOiByZWFkaW5nSWQsXG4gICAgICAgIH0sXG4gICAgICB9KSxcbiAgICApO1xuXG4gICAgaWYgKCFnZXRSZXN1bHQuSXRlbSkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNDA0LFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogJyonLFxuICAgICAgICB9LFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnUmVhZGluZyBub3QgZm91bmQnIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBEZWxldGUgdGhlIHJlYWRpbmdcbiAgICBhd2FpdCBkb2NDbGllbnQuc2VuZChcbiAgICAgIG5ldyBEZWxldGVDb21tYW5kKHtcbiAgICAgICAgVGFibGVOYW1lOiBSRUFESU5HU19UQUJMRV9OQU1FLFxuICAgICAgICBLZXk6IHtcbiAgICAgICAgICB1c2VySWQ6IHVzZXJJZCxcbiAgICAgICAgICByZWFkaW5nSWQ6IHJlYWRpbmdJZCxcbiAgICAgICAgfSxcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICBsb2dnZXIuaW5mbyhgU3VjY2Vzc2Z1bGx5IGRlbGV0ZWQgcmVhZGluZyAke3JlYWRpbmdJZH0gZm9yIHVzZXIgJHt1c2VySWR9YCk7XG5cbiAgICByZXR1cm4ge1xuICAgICAgc3RhdHVzQ29kZTogMjA0LFxuICAgICAgaGVhZGVyczoge1xuICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogJyonLFxuICAgICAgfSxcbiAgICAgIGJvZHk6ICcnLFxuICAgIH07XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgbG9nZ2VyLmVycm9yKCdFcnJvciBpbiBkZWxldGUtcmVhZGluZyBoYW5kbGVyOicsIGVycm9yKTtcbiAgICByZXR1cm4ge1xuICAgICAgc3RhdHVzQ29kZTogNTAwLFxuICAgICAgaGVhZGVyczoge1xuICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogJyonLFxuICAgICAgfSxcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICdJbnRlcm5hbCBzZXJ2ZXIgZXJyb3InIH0pLFxuICAgIH07XG4gIH1cbn07XG4iXX0=