"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const ephemeris_1 = require("ephemeris");
const dynamoClient = new client_dynamodb_1.DynamoDBClient({});
const docClient = lib_dynamodb_1.DynamoDBDocumentClient.from(dynamoClient);
const validateEvent = (event) => {
    if (!event.userId ||
        !event.birthDate ||
        !event.latitude ||
        !event.longitude ||
        !event.ianaTimeZone) {
        throw new Error('Missing required event properties');
    }
    return event;
};
const handler = async (event) => {
    const NATAL_CHART_TABLE_NAME = process.env.NATAL_CHART_TABLE_NAME;
    console.log('Received event:', JSON.stringify(event, null, 2));
    const validatedEvent = validateEvent(event);
    const { userId, birthDate, latitude, longitude, ianaTimeZone } = validatedEvent;
    const isTimeEstimated = !validatedEvent.birthTime;
    const birthTime = validatedEvent.birthTime || '12:00';
    // The ephemeris library expects date and time to be combined.
    // It also needs the timezone offset. We can create a date object
    // in the target timezone and then get the UTC offset.
    const birthDateTimeStr = `${birthDate}T${birthTime}:00`;
    // Create a date object that represents the local time at the birth location
    const birthDateTime = new Date(birthDateTimeStr);
    // This is a simplified way to get timezone offset. A robust solution would use a library
    // that handles historical timezone changes, but for this scope, this is sufficient.
    const timezoneOffsetInHours = new Date(birthDateTime.toLocaleString('en-US', { timeZone: ianaTimeZone })).getTimezoneOffset() /
        -60;
    try {
        // The ephemeris library expects a Date object, not a string
        const chartData = (0, ephemeris_1.getAllPlanets)(birthDateTime, longitude, latitude, timezoneOffsetInHours);
        const item = {
            userId,
            chartType: 'natal',
            createdAt: new Date().toISOString(),
            isTimeEstimated,
            birthInfo: {
                ...validatedEvent,
                birthTime, // ensure birthTime is stored even if estimated
            },
            planets: chartData.planets,
            houses: chartData.houses,
        };
        await docClient.send(new lib_dynamodb_1.PutCommand({
            TableName: NATAL_CHART_TABLE_NAME,
            Item: item,
        }));
        console.log(`Successfully generated and stored natal chart for userId: ${userId}`);
    }
    catch (error) {
        console.error('Error calculating or storing natal chart:', error);
        // Depending on requirements, might add to a DLQ or re-throw
        throw error;
    }
};
exports.handler = handler;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGUtbmF0YWwtY2hhcnQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJnZW5lcmF0ZS1uYXRhbC1jaGFydC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSw4REFBMEQ7QUFDMUQsd0RBQTJFO0FBQzNFLHlDQUEwQztBQUUxQyxNQUFNLFlBQVksR0FBRyxJQUFJLGdDQUFjLENBQUMsRUFBRSxDQUFDLENBQUM7QUFDNUMsTUFBTSxTQUFTLEdBQUcscUNBQXNCLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDO0FBVzVELE1BQU0sYUFBYSxHQUFHLENBQUMsS0FBVSxFQUFtQixFQUFFO0lBQ3BELElBQ0UsQ0FBQyxLQUFLLENBQUMsTUFBTTtRQUNiLENBQUMsS0FBSyxDQUFDLFNBQVM7UUFDaEIsQ0FBQyxLQUFLLENBQUMsUUFBUTtRQUNmLENBQUMsS0FBSyxDQUFDLFNBQVM7UUFDaEIsQ0FBQyxLQUFLLENBQUMsWUFBWSxFQUNuQixDQUFDO1FBQ0QsTUFBTSxJQUFJLEtBQUssQ0FBQyxtQ0FBbUMsQ0FBQyxDQUFDO0lBQ3ZELENBQUM7SUFDRCxPQUFPLEtBQUssQ0FBQztBQUNmLENBQUMsQ0FBQztBQUVLLE1BQU0sT0FBTyxHQUFHLEtBQUssRUFBRSxLQUFVLEVBQWlCLEVBQUU7SUFDekQsTUFBTSxzQkFBc0IsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLHNCQUF1QixDQUFDO0lBQ25FLE9BQU8sQ0FBQyxHQUFHLENBQUMsaUJBQWlCLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFFL0QsTUFBTSxjQUFjLEdBQUcsYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQzVDLE1BQU0sRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsWUFBWSxFQUFFLEdBQUcsY0FBYyxDQUFDO0lBRWhGLE1BQU0sZUFBZSxHQUFHLENBQUMsY0FBYyxDQUFDLFNBQVMsQ0FBQztJQUNsRCxNQUFNLFNBQVMsR0FBRyxjQUFjLENBQUMsU0FBUyxJQUFJLE9BQU8sQ0FBQztJQUV0RCw4REFBOEQ7SUFDOUQsaUVBQWlFO0lBQ2pFLHNEQUFzRDtJQUN0RCxNQUFNLGdCQUFnQixHQUFHLEdBQUcsU0FBUyxJQUFJLFNBQVMsS0FBSyxDQUFDO0lBRXhELDRFQUE0RTtJQUM1RSxNQUFNLGFBQWEsR0FBRyxJQUFJLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO0lBRWpELHlGQUF5RjtJQUN6RixvRkFBb0Y7SUFDcEYsTUFBTSxxQkFBcUIsR0FDekIsSUFBSSxJQUFJLENBQUMsYUFBYSxDQUFDLGNBQWMsQ0FBQyxPQUFPLEVBQUUsRUFBRSxRQUFRLEVBQUUsWUFBWSxFQUFFLENBQUMsQ0FBQyxDQUFDLGlCQUFpQixFQUFFO1FBQy9GLENBQUMsRUFBRSxDQUFDO0lBRU4sSUFBSSxDQUFDO1FBQ0gsNERBQTREO1FBQzVELE1BQU0sU0FBUyxHQUFHLElBQUEseUJBQWEsRUFBQyxhQUFhLEVBQUUsU0FBUyxFQUFFLFFBQVEsRUFBRSxxQkFBcUIsQ0FBQyxDQUFDO1FBRTNGLE1BQU0sSUFBSSxHQUFHO1lBQ1gsTUFBTTtZQUNOLFNBQVMsRUFBRSxPQUFPO1lBQ2xCLFNBQVMsRUFBRSxJQUFJLElBQUksRUFBRSxDQUFDLFdBQVcsRUFBRTtZQUNuQyxlQUFlO1lBQ2YsU0FBUyxFQUFFO2dCQUNULEdBQUcsY0FBYztnQkFDakIsU0FBUyxFQUFFLCtDQUErQzthQUMzRDtZQUNELE9BQU8sRUFBRSxTQUFTLENBQUMsT0FBTztZQUMxQixNQUFNLEVBQUUsU0FBUyxDQUFDLE1BQU07U0FDekIsQ0FBQztRQUVGLE1BQU0sU0FBUyxDQUFDLElBQUksQ0FDbEIsSUFBSSx5QkFBVSxDQUFDO1lBQ2IsU0FBUyxFQUFFLHNCQUFzQjtZQUNqQyxJQUFJLEVBQUUsSUFBSTtTQUNYLENBQUMsQ0FDSCxDQUFDO1FBRUYsT0FBTyxDQUFDLEdBQUcsQ0FBQyw2REFBNkQsTUFBTSxFQUFFLENBQUMsQ0FBQztJQUNyRixDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMsMkNBQTJDLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDbEUsNERBQTREO1FBQzVELE1BQU0sS0FBSyxDQUFDO0lBQ2QsQ0FBQztBQUNILENBQUMsQ0FBQztBQXREVyxRQUFBLE9BQU8sV0FzRGxCIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgRHluYW1vREJDbGllbnQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtZHluYW1vZGInO1xuaW1wb3J0IHsgRHluYW1vREJEb2N1bWVudENsaWVudCwgUHV0Q29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2xpYi1keW5hbW9kYic7XG5pbXBvcnQgeyBnZXRBbGxQbGFuZXRzIH0gZnJvbSAnZXBoZW1lcmlzJztcblxuY29uc3QgZHluYW1vQ2xpZW50ID0gbmV3IER5bmFtb0RCQ2xpZW50KHt9KTtcbmNvbnN0IGRvY0NsaWVudCA9IER5bmFtb0RCRG9jdW1lbnRDbGllbnQuZnJvbShkeW5hbW9DbGllbnQpO1xuXG5pbnRlcmZhY2UgTmF0YWxDaGFydEV2ZW50IHtcbiAgdXNlcklkOiBzdHJpbmc7XG4gIGJpcnRoRGF0ZTogc3RyaW5nOyAvLyBZWVlZLU1NLUREXG4gIGJpcnRoVGltZT86IHN0cmluZzsgLy8gSEg6TU1cbiAgbGF0aXR1ZGU6IG51bWJlcjtcbiAgbG9uZ2l0dWRlOiBudW1iZXI7XG4gIGlhbmFUaW1lWm9uZTogc3RyaW5nO1xufVxuXG5jb25zdCB2YWxpZGF0ZUV2ZW50ID0gKGV2ZW50OiBhbnkpOiBOYXRhbENoYXJ0RXZlbnQgPT4ge1xuICBpZiAoXG4gICAgIWV2ZW50LnVzZXJJZCB8fFxuICAgICFldmVudC5iaXJ0aERhdGUgfHxcbiAgICAhZXZlbnQubGF0aXR1ZGUgfHxcbiAgICAhZXZlbnQubG9uZ2l0dWRlIHx8XG4gICAgIWV2ZW50LmlhbmFUaW1lWm9uZVxuICApIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ01pc3NpbmcgcmVxdWlyZWQgZXZlbnQgcHJvcGVydGllcycpO1xuICB9XG4gIHJldHVybiBldmVudDtcbn07XG5cbmV4cG9ydCBjb25zdCBoYW5kbGVyID0gYXN5bmMgKGV2ZW50OiBhbnkpOiBQcm9taXNlPHZvaWQ+ID0+IHtcbiAgY29uc3QgTkFUQUxfQ0hBUlRfVEFCTEVfTkFNRSA9IHByb2Nlc3MuZW52Lk5BVEFMX0NIQVJUX1RBQkxFX05BTUUhO1xuICBjb25zb2xlLmxvZygnUmVjZWl2ZWQgZXZlbnQ6JywgSlNPTi5zdHJpbmdpZnkoZXZlbnQsIG51bGwsIDIpKTtcblxuICBjb25zdCB2YWxpZGF0ZWRFdmVudCA9IHZhbGlkYXRlRXZlbnQoZXZlbnQpO1xuICBjb25zdCB7IHVzZXJJZCwgYmlydGhEYXRlLCBsYXRpdHVkZSwgbG9uZ2l0dWRlLCBpYW5hVGltZVpvbmUgfSA9IHZhbGlkYXRlZEV2ZW50O1xuXG4gIGNvbnN0IGlzVGltZUVzdGltYXRlZCA9ICF2YWxpZGF0ZWRFdmVudC5iaXJ0aFRpbWU7XG4gIGNvbnN0IGJpcnRoVGltZSA9IHZhbGlkYXRlZEV2ZW50LmJpcnRoVGltZSB8fCAnMTI6MDAnO1xuXG4gIC8vIFRoZSBlcGhlbWVyaXMgbGlicmFyeSBleHBlY3RzIGRhdGUgYW5kIHRpbWUgdG8gYmUgY29tYmluZWQuXG4gIC8vIEl0IGFsc28gbmVlZHMgdGhlIHRpbWV6b25lIG9mZnNldC4gV2UgY2FuIGNyZWF0ZSBhIGRhdGUgb2JqZWN0XG4gIC8vIGluIHRoZSB0YXJnZXQgdGltZXpvbmUgYW5kIHRoZW4gZ2V0IHRoZSBVVEMgb2Zmc2V0LlxuICBjb25zdCBiaXJ0aERhdGVUaW1lU3RyID0gYCR7YmlydGhEYXRlfVQke2JpcnRoVGltZX06MDBgO1xuXG4gIC8vIENyZWF0ZSBhIGRhdGUgb2JqZWN0IHRoYXQgcmVwcmVzZW50cyB0aGUgbG9jYWwgdGltZSBhdCB0aGUgYmlydGggbG9jYXRpb25cbiAgY29uc3QgYmlydGhEYXRlVGltZSA9IG5ldyBEYXRlKGJpcnRoRGF0ZVRpbWVTdHIpO1xuXG4gIC8vIFRoaXMgaXMgYSBzaW1wbGlmaWVkIHdheSB0byBnZXQgdGltZXpvbmUgb2Zmc2V0LiBBIHJvYnVzdCBzb2x1dGlvbiB3b3VsZCB1c2UgYSBsaWJyYXJ5XG4gIC8vIHRoYXQgaGFuZGxlcyBoaXN0b3JpY2FsIHRpbWV6b25lIGNoYW5nZXMsIGJ1dCBmb3IgdGhpcyBzY29wZSwgdGhpcyBpcyBzdWZmaWNpZW50LlxuICBjb25zdCB0aW1lem9uZU9mZnNldEluSG91cnMgPVxuICAgIG5ldyBEYXRlKGJpcnRoRGF0ZVRpbWUudG9Mb2NhbGVTdHJpbmcoJ2VuLVVTJywgeyB0aW1lWm9uZTogaWFuYVRpbWVab25lIH0pKS5nZXRUaW1lem9uZU9mZnNldCgpIC9cbiAgICAtNjA7XG5cbiAgdHJ5IHtcbiAgICAvLyBUaGUgZXBoZW1lcmlzIGxpYnJhcnkgZXhwZWN0cyBhIERhdGUgb2JqZWN0LCBub3QgYSBzdHJpbmdcbiAgICBjb25zdCBjaGFydERhdGEgPSBnZXRBbGxQbGFuZXRzKGJpcnRoRGF0ZVRpbWUsIGxvbmdpdHVkZSwgbGF0aXR1ZGUsIHRpbWV6b25lT2Zmc2V0SW5Ib3Vycyk7XG5cbiAgICBjb25zdCBpdGVtID0ge1xuICAgICAgdXNlcklkLFxuICAgICAgY2hhcnRUeXBlOiAnbmF0YWwnLFxuICAgICAgY3JlYXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG4gICAgICBpc1RpbWVFc3RpbWF0ZWQsXG4gICAgICBiaXJ0aEluZm86IHtcbiAgICAgICAgLi4udmFsaWRhdGVkRXZlbnQsXG4gICAgICAgIGJpcnRoVGltZSwgLy8gZW5zdXJlIGJpcnRoVGltZSBpcyBzdG9yZWQgZXZlbiBpZiBlc3RpbWF0ZWRcbiAgICAgIH0sXG4gICAgICBwbGFuZXRzOiBjaGFydERhdGEucGxhbmV0cyxcbiAgICAgIGhvdXNlczogY2hhcnREYXRhLmhvdXNlcyxcbiAgICB9O1xuXG4gICAgYXdhaXQgZG9jQ2xpZW50LnNlbmQoXG4gICAgICBuZXcgUHV0Q29tbWFuZCh7XG4gICAgICAgIFRhYmxlTmFtZTogTkFUQUxfQ0hBUlRfVEFCTEVfTkFNRSxcbiAgICAgICAgSXRlbTogaXRlbSxcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICBjb25zb2xlLmxvZyhgU3VjY2Vzc2Z1bGx5IGdlbmVyYXRlZCBhbmQgc3RvcmVkIG5hdGFsIGNoYXJ0IGZvciB1c2VySWQ6ICR7dXNlcklkfWApO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGNhbGN1bGF0aW5nIG9yIHN0b3JpbmcgbmF0YWwgY2hhcnQ6JywgZXJyb3IpO1xuICAgIC8vIERlcGVuZGluZyBvbiByZXF1aXJlbWVudHMsIG1pZ2h0IGFkZCB0byBhIERMUSBvciByZS10aHJvd1xuICAgIHRocm93IGVycm9yO1xuICB9XG59O1xuIl19