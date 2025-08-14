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
        // Check if reading exists
        const getResult = await docClient.send(new lib_dynamodb_1.GetCommand({
            TableName: READINGS_TABLE_NAME,
            Key: {
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
                readingId: readingId,
            },
        }));
        logger_1.logger.info(`Successfully deleted reading ${readingId}`);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZGVsZXRlLXJlYWRpbmcuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJkZWxldGUtcmVhZGluZy50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFDQSw4REFBMEQ7QUFDMUQsd0RBQTBGO0FBQzFGLDRDQUF5QztBQUV6QyxNQUFNLFlBQVksR0FBRyxJQUFJLGdDQUFjLENBQUMsRUFBRSxDQUFDLENBQUM7QUFDNUMsTUFBTSxTQUFTLEdBQUcscUNBQXNCLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDO0FBRTVELE1BQU0sbUJBQW1CLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxtQkFBb0IsQ0FBQztBQUV0RCxNQUFNLE9BQU8sR0FBRyxLQUFLLEVBQUUsS0FBMkIsRUFBa0MsRUFBRTtJQUMzRixlQUFNLENBQUMsSUFBSSxDQUFDLHVCQUF1QixFQUFFLEtBQUssQ0FBQyxDQUFDO0lBRTVDLElBQUksQ0FBQztRQUNILHlCQUF5QjtRQUN6QixNQUFNLFVBQVUsR0FBRyxLQUFLLENBQUMsY0FBYyxFQUFFLFVBQVUsRUFBRSxNQUFNLEVBQUUsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO1FBQ2hGLE1BQU0sT0FBTyxHQUNYLFVBQVU7WUFDVixDQUFDLE9BQU8sVUFBVSxLQUFLLFFBQVE7Z0JBQzdCLENBQUMsQ0FBQyxVQUFVLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUM7Z0JBQ3pDLENBQUMsQ0FBQyxLQUFLLENBQUMsT0FBTyxDQUFDLFVBQVUsQ0FBQyxJQUFJLFVBQVUsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztRQUVqRSxJQUFJLENBQUMsT0FBTyxFQUFFLENBQUM7WUFDYixPQUFPO2dCQUNMLFVBQVUsRUFBRSxHQUFHO2dCQUNmLE9BQU8sRUFBRTtvQkFDUCxjQUFjLEVBQUUsa0JBQWtCO29CQUNsQyw2QkFBNkIsRUFBRSxHQUFHO2lCQUNuQztnQkFDRCxJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLEtBQUssRUFBRSwyQ0FBMkMsRUFBRSxDQUFDO2FBQzdFLENBQUM7UUFDSixDQUFDO1FBRUQsc0NBQXNDO1FBQ3RDLE1BQU0sU0FBUyxHQUFHLEtBQUssQ0FBQyxjQUFjLEVBQUUsU0FBUyxDQUFDO1FBQ2xELElBQUksQ0FBQyxTQUFTLEVBQUUsQ0FBQztZQUNmLE9BQU87Z0JBQ0wsVUFBVSxFQUFFLEdBQUc7Z0JBQ2YsT0FBTyxFQUFFO29CQUNQLGNBQWMsRUFBRSxrQkFBa0I7b0JBQ2xDLDZCQUE2QixFQUFFLEdBQUc7aUJBQ25DO2dCQUNELElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsS0FBSyxFQUFFLHdCQUF3QixFQUFFLENBQUM7YUFDMUQsQ0FBQztRQUNKLENBQUM7UUFFRCwwQkFBMEI7UUFDMUIsTUFBTSxTQUFTLEdBQUcsTUFBTSxTQUFTLENBQUMsSUFBSSxDQUNwQyxJQUFJLHlCQUFVLENBQUM7WUFDYixTQUFTLEVBQUUsbUJBQW1CO1lBQzlCLEdBQUcsRUFBRTtnQkFDSCxTQUFTLEVBQUUsU0FBUzthQUNyQjtTQUNGLENBQUMsQ0FDSCxDQUFDO1FBRUYsSUFBSSxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsQ0FBQztZQUNwQixPQUFPO2dCQUNMLFVBQVUsRUFBRSxHQUFHO2dCQUNmLE9BQU8sRUFBRTtvQkFDUCxjQUFjLEVBQUUsa0JBQWtCO29CQUNsQyw2QkFBNkIsRUFBRSxHQUFHO2lCQUNuQztnQkFDRCxJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLEtBQUssRUFBRSxtQkFBbUIsRUFBRSxDQUFDO2FBQ3JELENBQUM7UUFDSixDQUFDO1FBRUQscUJBQXFCO1FBQ3JCLE1BQU0sU0FBUyxDQUFDLElBQUksQ0FDbEIsSUFBSSw0QkFBYSxDQUFDO1lBQ2hCLFNBQVMsRUFBRSxtQkFBbUI7WUFDOUIsR0FBRyxFQUFFO2dCQUNILFNBQVMsRUFBRSxTQUFTO2FBQ3JCO1NBQ0YsQ0FBQyxDQUNILENBQUM7UUFFRixlQUFNLENBQUMsSUFBSSxDQUFDLGdDQUFnQyxTQUFTLEVBQUUsQ0FBQyxDQUFDO1FBRXpELE9BQU87WUFDTCxVQUFVLEVBQUUsR0FBRztZQUNmLE9BQU8sRUFBRTtnQkFDUCxjQUFjLEVBQUUsa0JBQWtCO2dCQUNsQyw2QkFBNkIsRUFBRSxHQUFHO2FBQ25DO1lBQ0QsSUFBSSxFQUFFLEVBQUU7U0FDVCxDQUFDO0lBQ0osQ0FBQztJQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7UUFDZixlQUFNLENBQUMsS0FBSyxDQUFDLGtDQUFrQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ3hELE9BQU87WUFDTCxVQUFVLEVBQUUsR0FBRztZQUNmLE9BQU8sRUFBRTtnQkFDUCxjQUFjLEVBQUUsa0JBQWtCO2dCQUNsQyw2QkFBNkIsRUFBRSxHQUFHO2FBQ25DO1lBQ0QsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxLQUFLLEVBQUUsdUJBQXVCLEVBQUUsQ0FBQztTQUN6RCxDQUFDO0lBQ0osQ0FBQztBQUNILENBQUMsQ0FBQztBQXhGVyxRQUFBLE9BQU8sV0F3RmxCIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQVBJR2F0ZXdheVByb3h5RXZlbnQsIEFQSUdhdGV3YXlQcm94eVJlc3VsdCB9IGZyb20gJ2F3cy1sYW1iZGEnO1xuaW1wb3J0IHsgRHluYW1vREJDbGllbnQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtZHluYW1vZGInO1xuaW1wb3J0IHsgRHluYW1vREJEb2N1bWVudENsaWVudCwgR2V0Q29tbWFuZCwgRGVsZXRlQ29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2xpYi1keW5hbW9kYic7XG5pbXBvcnQgeyBsb2dnZXIgfSBmcm9tICcuLi91dGlscy9sb2dnZXInO1xuXG5jb25zdCBkeW5hbW9DbGllbnQgPSBuZXcgRHluYW1vREJDbGllbnQoe30pO1xuY29uc3QgZG9jQ2xpZW50ID0gRHluYW1vREJEb2N1bWVudENsaWVudC5mcm9tKGR5bmFtb0NsaWVudCk7XG5cbmNvbnN0IFJFQURJTkdTX1RBQkxFX05BTUUgPSBwcm9jZXNzLmVudi5SRUFESU5HU19UQUJMRV9OQU1FITtcblxuZXhwb3J0IGNvbnN0IGhhbmRsZXIgPSBhc3luYyAoZXZlbnQ6IEFQSUdhdGV3YXlQcm94eUV2ZW50KTogUHJvbWlzZTxBUElHYXRld2F5UHJveHlSZXN1bHQ+ID0+IHtcbiAgbG9nZ2VyLmluZm8oJ0RlbGV0ZSByZWFkaW5nIGV2ZW50OicsIGV2ZW50KTtcblxuICB0cnkge1xuICAgIC8vIENoZWNrIGlmIHVzZXIgaXMgYWRtaW5cbiAgICBjb25zdCB1c2VyR3JvdXBzID0gZXZlbnQucmVxdWVzdENvbnRleHQ/LmF1dGhvcml6ZXI/LmNsYWltcz8uWydjb2duaXRvOmdyb3VwcyddO1xuICAgIGNvbnN0IGlzQWRtaW4gPVxuICAgICAgdXNlckdyb3VwcyAmJlxuICAgICAgKHR5cGVvZiB1c2VyR3JvdXBzID09PSAnc3RyaW5nJ1xuICAgICAgICA/IHVzZXJHcm91cHMuc3BsaXQoJywnKS5pbmNsdWRlcygnYWRtaW4nKVxuICAgICAgICA6IEFycmF5LmlzQXJyYXkodXNlckdyb3VwcykgJiYgdXNlckdyb3Vwcy5pbmNsdWRlcygnYWRtaW4nKSk7XG5cbiAgICBpZiAoIWlzQWRtaW4pIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMyxcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6ICcqJyxcbiAgICAgICAgfSxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ0FjY2VzcyBkZW5pZWQuIEFkbWluIHByaXZpbGVnZXMgcmVxdWlyZWQuJyB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gR2V0IHJlYWRpbmcgSUQgZnJvbSBwYXRoIHBhcmFtZXRlcnNcbiAgICBjb25zdCByZWFkaW5nSWQgPSBldmVudC5wYXRoUGFyYW1ldGVycz8ucmVhZGluZ0lkO1xuICAgIGlmICghcmVhZGluZ0lkKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA0MDAsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiAnKicsXG4gICAgICAgIH0sXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICdSZWFkaW5nIElEIGlzIHJlcXVpcmVkJyB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gQ2hlY2sgaWYgcmVhZGluZyBleGlzdHNcbiAgICBjb25zdCBnZXRSZXN1bHQgPSBhd2FpdCBkb2NDbGllbnQuc2VuZChcbiAgICAgIG5ldyBHZXRDb21tYW5kKHtcbiAgICAgICAgVGFibGVOYW1lOiBSRUFESU5HU19UQUJMRV9OQU1FLFxuICAgICAgICBLZXk6IHtcbiAgICAgICAgICByZWFkaW5nSWQ6IHJlYWRpbmdJZCxcbiAgICAgICAgfSxcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICBpZiAoIWdldFJlc3VsdC5JdGVtKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA0MDQsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiAnKicsXG4gICAgICAgIH0sXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICdSZWFkaW5nIG5vdCBmb3VuZCcgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIERlbGV0ZSB0aGUgcmVhZGluZ1xuICAgIGF3YWl0IGRvY0NsaWVudC5zZW5kKFxuICAgICAgbmV3IERlbGV0ZUNvbW1hbmQoe1xuICAgICAgICBUYWJsZU5hbWU6IFJFQURJTkdTX1RBQkxFX05BTUUsXG4gICAgICAgIEtleToge1xuICAgICAgICAgIHJlYWRpbmdJZDogcmVhZGluZ0lkLFxuICAgICAgICB9LFxuICAgICAgfSksXG4gICAgKTtcblxuICAgIGxvZ2dlci5pbmZvKGBTdWNjZXNzZnVsbHkgZGVsZXRlZCByZWFkaW5nICR7cmVhZGluZ0lkfWApO1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1c0NvZGU6IDIwNCxcbiAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6ICcqJyxcbiAgICAgIH0sXG4gICAgICBib2R5OiAnJyxcbiAgICB9O1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGxvZ2dlci5lcnJvcignRXJyb3IgaW4gZGVsZXRlLXJlYWRpbmcgaGFuZGxlcjonLCBlcnJvcik7XG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1c0NvZGU6IDUwMCxcbiAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6ICcqJyxcbiAgICAgIH0sXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnSW50ZXJuYWwgc2VydmVyIGVycm9yJyB9KSxcbiAgICB9O1xuICB9XG59O1xuIl19