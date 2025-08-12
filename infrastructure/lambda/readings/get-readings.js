"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const dynamoClient = new client_dynamodb_1.DynamoDBClient({});
const dynamoDoc = lib_dynamodb_1.DynamoDBDocumentClient.from(dynamoClient);
const handler = async (event) => {
    console.log('Event:', JSON.stringify(event));
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization',
        'Access-Control-Allow-Methods': 'GET,OPTIONS',
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
                body: JSON.stringify({ message: 'Unauthorized to view readings for this user' }),
            };
        }
        // Query all readings for this user
        const response = await dynamoDoc.send(new lib_dynamodb_1.QueryCommand({
            TableName: process.env.READINGS_TABLE_NAME,
            KeyConditionExpression: 'userId = :userId',
            ExpressionAttributeValues: {
                ':userId': userId,
            },
            ScanIndexForward: false, // Return in descending order (newest first)
        }));
        // Transform readings to exclude content for list view
        const readings = response.Items?.map((item) => ({
            readingId: item.readingId,
            type: item.type,
            status: item.status,
            createdAt: item.createdAt,
            updatedAt: item.updatedAt,
        })) || [];
        return {
            statusCode: 200,
            headers: corsHeaders,
            body: JSON.stringify({
                readings,
                count: readings.length,
            }),
        };
    }
    catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({
                message: 'Failed to retrieve readings',
                error: error instanceof Error ? error.message : 'Unknown error',
            }),
        };
    }
};
exports.handler = handler;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2V0LXJlYWRpbmdzLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZ2V0LXJlYWRpbmdzLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7OztBQUNBLDhEQUEwRDtBQUMxRCx3REFBNkU7QUFFN0UsTUFBTSxZQUFZLEdBQUcsSUFBSSxnQ0FBYyxDQUFDLEVBQUUsQ0FBQyxDQUFDO0FBQzVDLE1BQU0sU0FBUyxHQUFHLHFDQUFzQixDQUFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQztBQUVyRCxNQUFNLE9BQU8sR0FBRyxLQUFLLEVBQUUsS0FBMkIsRUFBa0MsRUFBRTtJQUMzRixPQUFPLENBQUMsR0FBRyxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssQ0FBQyxDQUFDLENBQUM7SUFFN0MsTUFBTSxXQUFXLEdBQUc7UUFDbEIsNkJBQTZCLEVBQUUsR0FBRztRQUNsQyw4QkFBOEIsRUFBRSw0QkFBNEI7UUFDNUQsOEJBQThCLEVBQUUsYUFBYTtLQUM5QyxDQUFDO0lBRUYsSUFBSSxDQUFDO1FBQ0gsMkJBQTJCO1FBQzNCLE1BQU0sTUFBTSxHQUFHLEtBQUssQ0FBQyxjQUFjLEVBQUUsTUFBTSxDQUFDO1FBQzVDLElBQUksQ0FBQyxNQUFNLEVBQUUsQ0FBQztZQUNaLE9BQU87Z0JBQ0wsVUFBVSxFQUFFLEdBQUc7Z0JBQ2YsT0FBTyxFQUFFLFdBQVc7Z0JBQ3BCLElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsT0FBTyxFQUFFLG9CQUFvQixFQUFFLENBQUM7YUFDeEQsQ0FBQztRQUNKLENBQUM7UUFFRCxxREFBcUQ7UUFDckQsTUFBTSxjQUFjLEdBQUcsS0FBSyxDQUFDLGNBQWdFLENBQUM7UUFDOUYsTUFBTSxtQkFBbUIsR0FBRyxjQUFjLEVBQUUsVUFBVSxFQUFFLE1BQU0sRUFBRSxHQUFHLENBQUM7UUFDcEUsSUFBSSxtQkFBbUIsS0FBSyxNQUFNLEVBQUUsQ0FBQztZQUNuQyxPQUFPO2dCQUNMLFVBQVUsRUFBRSxHQUFHO2dCQUNmLE9BQU8sRUFBRSxXQUFXO2dCQUNwQixJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLE9BQU8sRUFBRSw2Q0FBNkMsRUFBRSxDQUFDO2FBQ2pGLENBQUM7UUFDSixDQUFDO1FBRUQsbUNBQW1DO1FBQ25DLE1BQU0sUUFBUSxHQUFHLE1BQU0sU0FBUyxDQUFDLElBQUksQ0FDbkMsSUFBSSwyQkFBWSxDQUFDO1lBQ2YsU0FBUyxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsbUJBQW9CO1lBQzNDLHNCQUFzQixFQUFFLGtCQUFrQjtZQUMxQyx5QkFBeUIsRUFBRTtnQkFDekIsU0FBUyxFQUFFLE1BQU07YUFDbEI7WUFDRCxnQkFBZ0IsRUFBRSxLQUFLLEVBQUUsNENBQTRDO1NBQ3RFLENBQUMsQ0FDSCxDQUFDO1FBRUYsc0RBQXNEO1FBQ3RELE1BQU0sUUFBUSxHQUNaLFFBQVEsQ0FBQyxLQUFLLEVBQUUsR0FBRyxDQUFDLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQzdCLFNBQVMsRUFBRSxJQUFJLENBQUMsU0FBUztZQUN6QixJQUFJLEVBQUUsSUFBSSxDQUFDLElBQUk7WUFDZixNQUFNLEVBQUUsSUFBSSxDQUFDLE1BQU07WUFDbkIsU0FBUyxFQUFFLElBQUksQ0FBQyxTQUFTO1lBQ3pCLFNBQVMsRUFBRSxJQUFJLENBQUMsU0FBUztTQUMxQixDQUFDLENBQUMsSUFBSSxFQUFFLENBQUM7UUFFWixPQUFPO1lBQ0wsVUFBVSxFQUFFLEdBQUc7WUFDZixPQUFPLEVBQUUsV0FBVztZQUNwQixJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQztnQkFDbkIsUUFBUTtnQkFDUixLQUFLLEVBQUUsUUFBUSxDQUFDLE1BQU07YUFDdkIsQ0FBQztTQUNILENBQUM7SUFDSixDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMsUUFBUSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQy9CLE9BQU87WUFDTCxVQUFVLEVBQUUsR0FBRztZQUNmLE9BQU8sRUFBRSxXQUFXO1lBQ3BCLElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDO2dCQUNuQixPQUFPLEVBQUUsNkJBQTZCO2dCQUN0QyxLQUFLLEVBQUUsS0FBSyxZQUFZLEtBQUssQ0FBQyxDQUFDLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsZUFBZTthQUNoRSxDQUFDO1NBQ0gsQ0FBQztJQUNKLENBQUM7QUFDSCxDQUFDLENBQUM7QUF4RVcsUUFBQSxPQUFPLFdBd0VsQiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEFQSUdhdGV3YXlQcm94eUV2ZW50LCBBUElHYXRld2F5UHJveHlSZXN1bHQgfSBmcm9tICdhd3MtbGFtYmRhJztcbmltcG9ydCB7IER5bmFtb0RCQ2xpZW50IH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LWR5bmFtb2RiJztcbmltcG9ydCB7IER5bmFtb0RCRG9jdW1lbnRDbGllbnQsIFF1ZXJ5Q29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2xpYi1keW5hbW9kYic7XG5cbmNvbnN0IGR5bmFtb0NsaWVudCA9IG5ldyBEeW5hbW9EQkNsaWVudCh7fSk7XG5jb25zdCBkeW5hbW9Eb2MgPSBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LmZyb20oZHluYW1vQ2xpZW50KTtcblxuZXhwb3J0IGNvbnN0IGhhbmRsZXIgPSBhc3luYyAoZXZlbnQ6IEFQSUdhdGV3YXlQcm94eUV2ZW50KTogUHJvbWlzZTxBUElHYXRld2F5UHJveHlSZXN1bHQ+ID0+IHtcbiAgY29uc29sZS5sb2coJ0V2ZW50OicsIEpTT04uc3RyaW5naWZ5KGV2ZW50KSk7XG5cbiAgY29uc3QgY29yc0hlYWRlcnMgPSB7XG4gICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6ICcqJyxcbiAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctSGVhZGVycyc6ICdDb250ZW50LVR5cGUsQXV0aG9yaXphdGlvbicsXG4gICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU1ldGhvZHMnOiAnR0VULE9QVElPTlMnLFxuICB9O1xuXG4gIHRyeSB7XG4gICAgLy8gRXh0cmFjdCB1c2VySWQgZnJvbSBwYXRoXG4gICAgY29uc3QgdXNlcklkID0gZXZlbnQucGF0aFBhcmFtZXRlcnM/LnVzZXJJZDtcbiAgICBpZiAoIXVzZXJJZCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNDAwLFxuICAgICAgICBoZWFkZXJzOiBjb3JzSGVhZGVycyxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBtZXNzYWdlOiAndXNlcklkIGlzIHJlcXVpcmVkJyB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gVmVyaWZ5IGF1dGhlbnRpY2F0ZWQgdXNlciBtYXRjaGVzIHJlcXVlc3RlZCB1c2VySWRcbiAgICBjb25zdCByZXF1ZXN0Q29udGV4dCA9IGV2ZW50LnJlcXVlc3RDb250ZXh0IGFzIHsgYXV0aG9yaXplcj86IHsgY2xhaW1zPzogeyBzdWI/OiBzdHJpbmcgfSB9IH07XG4gICAgY29uc3QgYXV0aGVudGljYXRlZFVzZXJJZCA9IHJlcXVlc3RDb250ZXh0Py5hdXRob3JpemVyPy5jbGFpbXM/LnN1YjtcbiAgICBpZiAoYXV0aGVudGljYXRlZFVzZXJJZCAhPT0gdXNlcklkKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA0MDMsXG4gICAgICAgIGhlYWRlcnM6IGNvcnNIZWFkZXJzLFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IG1lc3NhZ2U6ICdVbmF1dGhvcml6ZWQgdG8gdmlldyByZWFkaW5ncyBmb3IgdGhpcyB1c2VyJyB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gUXVlcnkgYWxsIHJlYWRpbmdzIGZvciB0aGlzIHVzZXJcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGR5bmFtb0RvYy5zZW5kKFxuICAgICAgbmV3IFF1ZXJ5Q29tbWFuZCh7XG4gICAgICAgIFRhYmxlTmFtZTogcHJvY2Vzcy5lbnYuUkVBRElOR1NfVEFCTEVfTkFNRSEsXG4gICAgICAgIEtleUNvbmRpdGlvbkV4cHJlc3Npb246ICd1c2VySWQgPSA6dXNlcklkJyxcbiAgICAgICAgRXhwcmVzc2lvbkF0dHJpYnV0ZVZhbHVlczoge1xuICAgICAgICAgICc6dXNlcklkJzogdXNlcklkLFxuICAgICAgICB9LFxuICAgICAgICBTY2FuSW5kZXhGb3J3YXJkOiBmYWxzZSwgLy8gUmV0dXJuIGluIGRlc2NlbmRpbmcgb3JkZXIgKG5ld2VzdCBmaXJzdClcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICAvLyBUcmFuc2Zvcm0gcmVhZGluZ3MgdG8gZXhjbHVkZSBjb250ZW50IGZvciBsaXN0IHZpZXdcbiAgICBjb25zdCByZWFkaW5ncyA9XG4gICAgICByZXNwb25zZS5JdGVtcz8ubWFwKChpdGVtKSA9PiAoe1xuICAgICAgICByZWFkaW5nSWQ6IGl0ZW0ucmVhZGluZ0lkLFxuICAgICAgICB0eXBlOiBpdGVtLnR5cGUsXG4gICAgICAgIHN0YXR1czogaXRlbS5zdGF0dXMsXG4gICAgICAgIGNyZWF0ZWRBdDogaXRlbS5jcmVhdGVkQXQsXG4gICAgICAgIHVwZGF0ZWRBdDogaXRlbS51cGRhdGVkQXQsXG4gICAgICB9KSkgfHwgW107XG5cbiAgICByZXR1cm4ge1xuICAgICAgc3RhdHVzQ29kZTogMjAwLFxuICAgICAgaGVhZGVyczogY29yc0hlYWRlcnMsXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgIHJlYWRpbmdzLFxuICAgICAgICBjb3VudDogcmVhZGluZ3MubGVuZ3RoLFxuICAgICAgfSksXG4gICAgfTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvcjonLCBlcnJvcik7XG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1c0NvZGU6IDUwMCxcbiAgICAgIGhlYWRlcnM6IGNvcnNIZWFkZXJzLFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICBtZXNzYWdlOiAnRmFpbGVkIHRvIHJldHJpZXZlIHJlYWRpbmdzJyxcbiAgICAgICAgZXJyb3I6IGVycm9yIGluc3RhbmNlb2YgRXJyb3IgPyBlcnJvci5tZXNzYWdlIDogJ1Vua25vd24gZXJyb3InLFxuICAgICAgfSksXG4gICAgfTtcbiAgfVxufTtcbiJdfQ==