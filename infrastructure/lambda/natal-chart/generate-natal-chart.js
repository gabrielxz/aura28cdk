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
    const tempDate = new Date(birthDateTimeStr);
    // This is a simplified way to get timezone offset. A robust solution would use a library
    // that handles historical timezone changes, but for this scope, this is sufficient.
    const timezoneOffsetInHours = new Date(tempDate.toLocaleString('en-US', { timeZone: ianaTimeZone })).getTimezoneOffset() /
        -60;
    try {
        const chartData = (0, ephemeris_1.getAllPlanets)(birthDateTimeStr, longitude, latitude, timezoneOffsetInHours);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGUtbmF0YWwtY2hhcnQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJnZW5lcmF0ZS1uYXRhbC1jaGFydC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7QUFBQSw4REFBMEQ7QUFDMUQsd0RBQTJFO0FBQzNFLHlDQUEwQztBQUUxQyxNQUFNLFlBQVksR0FBRyxJQUFJLGdDQUFjLENBQUMsRUFBRSxDQUFDLENBQUM7QUFDNUMsTUFBTSxTQUFTLEdBQUcscUNBQXNCLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDO0FBVzVELE1BQU0sYUFBYSxHQUFHLENBQUMsS0FBVSxFQUFtQixFQUFFO0lBQ3BELElBQ0UsQ0FBQyxLQUFLLENBQUMsTUFBTTtRQUNiLENBQUMsS0FBSyxDQUFDLFNBQVM7UUFDaEIsQ0FBQyxLQUFLLENBQUMsUUFBUTtRQUNmLENBQUMsS0FBSyxDQUFDLFNBQVM7UUFDaEIsQ0FBQyxLQUFLLENBQUMsWUFBWSxFQUNuQixDQUFDO1FBQ0QsTUFBTSxJQUFJLEtBQUssQ0FBQyxtQ0FBbUMsQ0FBQyxDQUFDO0lBQ3ZELENBQUM7SUFDRCxPQUFPLEtBQUssQ0FBQztBQUNmLENBQUMsQ0FBQztBQUVLLE1BQU0sT0FBTyxHQUFHLEtBQUssRUFBRSxLQUFVLEVBQWlCLEVBQUU7SUFDekQsTUFBTSxzQkFBc0IsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLHNCQUF1QixDQUFDO0lBQ25FLE9BQU8sQ0FBQyxHQUFHLENBQUMsaUJBQWlCLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxLQUFLLEVBQUUsSUFBSSxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQUM7SUFFL0QsTUFBTSxjQUFjLEdBQUcsYUFBYSxDQUFDLEtBQUssQ0FBQyxDQUFDO0lBQzVDLE1BQU0sRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsWUFBWSxFQUFFLEdBQUcsY0FBYyxDQUFDO0lBRWhGLE1BQU0sZUFBZSxHQUFHLENBQUMsY0FBYyxDQUFDLFNBQVMsQ0FBQztJQUNsRCxNQUFNLFNBQVMsR0FBRyxjQUFjLENBQUMsU0FBUyxJQUFJLE9BQU8sQ0FBQztJQUV0RCw4REFBOEQ7SUFDOUQsaUVBQWlFO0lBQ2pFLHNEQUFzRDtJQUN0RCxNQUFNLGdCQUFnQixHQUFHLEdBQUcsU0FBUyxJQUFJLFNBQVMsS0FBSyxDQUFDO0lBRXhELDRFQUE0RTtJQUM1RSxNQUFNLFFBQVEsR0FBRyxJQUFJLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDO0lBRTVDLHlGQUF5RjtJQUN6RixvRkFBb0Y7SUFDcEYsTUFBTSxxQkFBcUIsR0FDekIsSUFBSSxJQUFJLENBQUMsUUFBUSxDQUFDLGNBQWMsQ0FBQyxPQUFPLEVBQUUsRUFBRSxRQUFRLEVBQUUsWUFBWSxFQUFFLENBQUMsQ0FBQyxDQUFDLGlCQUFpQixFQUFFO1FBQzFGLENBQUMsRUFBRSxDQUFDO0lBRU4sSUFBSSxDQUFDO1FBQ0gsTUFBTSxTQUFTLEdBQUcsSUFBQSx5QkFBYSxFQUFDLGdCQUFnQixFQUFFLFNBQVMsRUFBRSxRQUFRLEVBQUUscUJBQXFCLENBQUMsQ0FBQztRQUU5RixNQUFNLElBQUksR0FBRztZQUNYLE1BQU07WUFDTixTQUFTLEVBQUUsT0FBTztZQUNsQixTQUFTLEVBQUUsSUFBSSxJQUFJLEVBQUUsQ0FBQyxXQUFXLEVBQUU7WUFDbkMsZUFBZTtZQUNmLFNBQVMsRUFBRTtnQkFDVCxHQUFHLGNBQWM7Z0JBQ2pCLFNBQVMsRUFBRSwrQ0FBK0M7YUFDM0Q7WUFDRCxPQUFPLEVBQUUsU0FBUyxDQUFDLE9BQU87WUFDMUIsTUFBTSxFQUFFLFNBQVMsQ0FBQyxNQUFNO1NBQ3pCLENBQUM7UUFFRixNQUFNLFNBQVMsQ0FBQyxJQUFJLENBQ2xCLElBQUkseUJBQVUsQ0FBQztZQUNiLFNBQVMsRUFBRSxzQkFBc0I7WUFDakMsSUFBSSxFQUFFLElBQUk7U0FDWCxDQUFDLENBQ0gsQ0FBQztRQUVGLE9BQU8sQ0FBQyxHQUFHLENBQUMsNkRBQTZELE1BQU0sRUFBRSxDQUFDLENBQUM7SUFDckYsQ0FBQztJQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7UUFDZixPQUFPLENBQUMsS0FBSyxDQUFDLDJDQUEyQyxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBQ2xFLDREQUE0RDtRQUM1RCxNQUFNLEtBQUssQ0FBQztJQUNkLENBQUM7QUFDSCxDQUFDLENBQUM7QUFyRFcsUUFBQSxPQUFPLFdBcURsQiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IER5bmFtb0RCQ2xpZW50IH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LWR5bmFtb2RiJztcbmltcG9ydCB7IER5bmFtb0RCRG9jdW1lbnRDbGllbnQsIFB1dENvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9saWItZHluYW1vZGInO1xuaW1wb3J0IHsgZ2V0QWxsUGxhbmV0cyB9IGZyb20gJ2VwaGVtZXJpcyc7XG5cbmNvbnN0IGR5bmFtb0NsaWVudCA9IG5ldyBEeW5hbW9EQkNsaWVudCh7fSk7XG5jb25zdCBkb2NDbGllbnQgPSBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LmZyb20oZHluYW1vQ2xpZW50KTtcblxuaW50ZXJmYWNlIE5hdGFsQ2hhcnRFdmVudCB7XG4gIHVzZXJJZDogc3RyaW5nO1xuICBiaXJ0aERhdGU6IHN0cmluZzsgLy8gWVlZWS1NTS1ERFxuICBiaXJ0aFRpbWU/OiBzdHJpbmc7IC8vIEhIOk1NXG4gIGxhdGl0dWRlOiBudW1iZXI7XG4gIGxvbmdpdHVkZTogbnVtYmVyO1xuICBpYW5hVGltZVpvbmU6IHN0cmluZztcbn1cblxuY29uc3QgdmFsaWRhdGVFdmVudCA9IChldmVudDogYW55KTogTmF0YWxDaGFydEV2ZW50ID0+IHtcbiAgaWYgKFxuICAgICFldmVudC51c2VySWQgfHxcbiAgICAhZXZlbnQuYmlydGhEYXRlIHx8XG4gICAgIWV2ZW50LmxhdGl0dWRlIHx8XG4gICAgIWV2ZW50LmxvbmdpdHVkZSB8fFxuICAgICFldmVudC5pYW5hVGltZVpvbmVcbiAgKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdNaXNzaW5nIHJlcXVpcmVkIGV2ZW50IHByb3BlcnRpZXMnKTtcbiAgfVxuICByZXR1cm4gZXZlbnQ7XG59O1xuXG5leHBvcnQgY29uc3QgaGFuZGxlciA9IGFzeW5jIChldmVudDogYW55KTogUHJvbWlzZTx2b2lkPiA9PiB7XG4gIGNvbnN0IE5BVEFMX0NIQVJUX1RBQkxFX05BTUUgPSBwcm9jZXNzLmVudi5OQVRBTF9DSEFSVF9UQUJMRV9OQU1FITtcbiAgY29uc29sZS5sb2coJ1JlY2VpdmVkIGV2ZW50OicsIEpTT04uc3RyaW5naWZ5KGV2ZW50LCBudWxsLCAyKSk7XG5cbiAgY29uc3QgdmFsaWRhdGVkRXZlbnQgPSB2YWxpZGF0ZUV2ZW50KGV2ZW50KTtcbiAgY29uc3QgeyB1c2VySWQsIGJpcnRoRGF0ZSwgbGF0aXR1ZGUsIGxvbmdpdHVkZSwgaWFuYVRpbWVab25lIH0gPSB2YWxpZGF0ZWRFdmVudDtcblxuICBjb25zdCBpc1RpbWVFc3RpbWF0ZWQgPSAhdmFsaWRhdGVkRXZlbnQuYmlydGhUaW1lO1xuICBjb25zdCBiaXJ0aFRpbWUgPSB2YWxpZGF0ZWRFdmVudC5iaXJ0aFRpbWUgfHwgJzEyOjAwJztcblxuICAvLyBUaGUgZXBoZW1lcmlzIGxpYnJhcnkgZXhwZWN0cyBkYXRlIGFuZCB0aW1lIHRvIGJlIGNvbWJpbmVkLlxuICAvLyBJdCBhbHNvIG5lZWRzIHRoZSB0aW1lem9uZSBvZmZzZXQuIFdlIGNhbiBjcmVhdGUgYSBkYXRlIG9iamVjdFxuICAvLyBpbiB0aGUgdGFyZ2V0IHRpbWV6b25lIGFuZCB0aGVuIGdldCB0aGUgVVRDIG9mZnNldC5cbiAgY29uc3QgYmlydGhEYXRlVGltZVN0ciA9IGAke2JpcnRoRGF0ZX1UJHtiaXJ0aFRpbWV9OjAwYDtcblxuICAvLyBDcmVhdGUgYSBkYXRlIG9iamVjdCB0aGF0IHJlcHJlc2VudHMgdGhlIGxvY2FsIHRpbWUgYXQgdGhlIGJpcnRoIGxvY2F0aW9uXG4gIGNvbnN0IHRlbXBEYXRlID0gbmV3IERhdGUoYmlydGhEYXRlVGltZVN0cik7XG5cbiAgLy8gVGhpcyBpcyBhIHNpbXBsaWZpZWQgd2F5IHRvIGdldCB0aW1lem9uZSBvZmZzZXQuIEEgcm9idXN0IHNvbHV0aW9uIHdvdWxkIHVzZSBhIGxpYnJhcnlcbiAgLy8gdGhhdCBoYW5kbGVzIGhpc3RvcmljYWwgdGltZXpvbmUgY2hhbmdlcywgYnV0IGZvciB0aGlzIHNjb3BlLCB0aGlzIGlzIHN1ZmZpY2llbnQuXG4gIGNvbnN0IHRpbWV6b25lT2Zmc2V0SW5Ib3VycyA9XG4gICAgbmV3IERhdGUodGVtcERhdGUudG9Mb2NhbGVTdHJpbmcoJ2VuLVVTJywgeyB0aW1lWm9uZTogaWFuYVRpbWVab25lIH0pKS5nZXRUaW1lem9uZU9mZnNldCgpIC9cbiAgICAtNjA7XG5cbiAgdHJ5IHtcbiAgICBjb25zdCBjaGFydERhdGEgPSBnZXRBbGxQbGFuZXRzKGJpcnRoRGF0ZVRpbWVTdHIsIGxvbmdpdHVkZSwgbGF0aXR1ZGUsIHRpbWV6b25lT2Zmc2V0SW5Ib3Vycyk7XG5cbiAgICBjb25zdCBpdGVtID0ge1xuICAgICAgdXNlcklkLFxuICAgICAgY2hhcnRUeXBlOiAnbmF0YWwnLFxuICAgICAgY3JlYXRlZEF0OiBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCksXG4gICAgICBpc1RpbWVFc3RpbWF0ZWQsXG4gICAgICBiaXJ0aEluZm86IHtcbiAgICAgICAgLi4udmFsaWRhdGVkRXZlbnQsXG4gICAgICAgIGJpcnRoVGltZSwgLy8gZW5zdXJlIGJpcnRoVGltZSBpcyBzdG9yZWQgZXZlbiBpZiBlc3RpbWF0ZWRcbiAgICAgIH0sXG4gICAgICBwbGFuZXRzOiBjaGFydERhdGEucGxhbmV0cyxcbiAgICAgIGhvdXNlczogY2hhcnREYXRhLmhvdXNlcyxcbiAgICB9O1xuXG4gICAgYXdhaXQgZG9jQ2xpZW50LnNlbmQoXG4gICAgICBuZXcgUHV0Q29tbWFuZCh7XG4gICAgICAgIFRhYmxlTmFtZTogTkFUQUxfQ0hBUlRfVEFCTEVfTkFNRSxcbiAgICAgICAgSXRlbTogaXRlbSxcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICBjb25zb2xlLmxvZyhgU3VjY2Vzc2Z1bGx5IGdlbmVyYXRlZCBhbmQgc3RvcmVkIG5hdGFsIGNoYXJ0IGZvciB1c2VySWQ6ICR7dXNlcklkfWApO1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0Vycm9yIGNhbGN1bGF0aW5nIG9yIHN0b3JpbmcgbmF0YWwgY2hhcnQ6JywgZXJyb3IpO1xuICAgIC8vIERlcGVuZGluZyBvbiByZXF1aXJlbWVudHMsIG1pZ2h0IGFkZCB0byBhIERMUSBvciByZS10aHJvd1xuICAgIHRocm93IGVycm9yO1xuICB9XG59O1xuIl19