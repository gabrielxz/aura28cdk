"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const client_location_1 = require("@aws-sdk/client-location");
const client_lambda_1 = require("@aws-sdk/client-lambda");
const tz_lookup_1 = __importDefault(require("tz-lookup"));
const dynamoClient = new client_dynamodb_1.DynamoDBClient({});
const docClient = lib_dynamodb_1.DynamoDBDocumentClient.from(dynamoClient);
const locationClient = new client_location_1.LocationClient({});
const lambdaClient = new client_lambda_1.LambdaClient({});
const TABLE_NAME = process.env.TABLE_NAME;
const PLACE_INDEX_NAME = process.env.PLACE_INDEX_NAME;
const GENERATE_NATAL_CHART_FUNCTION_NAME = process.env.GENERATE_NATAL_CHART_FUNCTION_NAME;
/**
 * Geocodes a location and returns its coordinates, time zone, and standardized name.
 */
async function getGeoData(city, state, country) {
    const searchText = `${city}, ${state}, ${country}`;
    try {
        const command = new client_location_1.SearchPlaceIndexForTextCommand({
            IndexName: PLACE_INDEX_NAME,
            Text: searchText,
            MaxResults: 1,
        });
        const response = await locationClient.send(command);
        if (response.Results && response.Results.length > 0 && response.Results[0].Place) {
            const place = response.Results[0].Place;
            const [longitude, latitude] = place.Geometry?.Point || [];
            if (longitude === undefined || latitude === undefined) {
                return null;
            }
            const ianaTimeZone = (0, tz_lookup_1.default)(latitude, longitude);
            const standardizedLocationName = place.Label || searchText;
            return {
                latitude: parseFloat(latitude.toFixed(6)),
                longitude: parseFloat(longitude.toFixed(6)),
                ianaTimeZone,
                standardizedLocationName,
            };
        }
        return null;
    }
    catch {
        // Re-throw or handle as a non-blocking error
        throw new Error('Failed to geocode location due to a service error.');
    }
}
const validateBirthData = (data) => {
    const errors = [];
    // Email validation
    if (!data.email || typeof data.email !== 'string') {
        errors.push({ field: 'email', message: 'Email is required' });
    }
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
        errors.push({ field: 'email', message: 'Invalid email format' });
    }
    // Birth name validation
    if (!data.birthName || typeof data.birthName !== 'string') {
        errors.push({ field: 'birthName', message: 'Birth name is required' });
    }
    else if (data.birthName.trim().length === 0 || data.birthName.length > 256) {
        errors.push({ field: 'birthName', message: 'Birth name must be 1-256 characters' });
    }
    else if (!/^[a-zA-Z\s\-']+$/.test(data.birthName)) {
        errors.push({ field: 'birthName', message: 'Birth name contains invalid characters' });
    }
    // Birth date validation
    if (!data.birthDate || typeof data.birthDate !== 'string') {
        errors.push({ field: 'birthDate', message: 'Birth date is required' });
    }
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(data.birthDate)) {
        errors.push({ field: 'birthDate', message: 'Birth date must be in YYYY-MM-DD format' });
    }
    else {
        const date = new Date(data.birthDate);
        const now = new Date();
        const minDate = new Date('1900-01-01');
        if (isNaN(date.getTime())) {
            errors.push({ field: 'birthDate', message: 'Invalid birth date' });
        }
        else if (date > now) {
            errors.push({ field: 'birthDate', message: 'Birth date cannot be in the future' });
        }
        else if (date < minDate) {
            errors.push({ field: 'birthDate', message: 'Birth date cannot be before 1900' });
        }
    }
    // Birth time validation (required)
    if (!data.birthTime || typeof data.birthTime !== 'string') {
        errors.push({ field: 'birthTime', message: 'Birth time is required' });
    }
    else if (!/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(data.birthTime)) {
        errors.push({ field: 'birthTime', message: 'Birth time must be in HH:MM format (24-hour)' });
    }
    // Location validation
    const locationRegex = /^[a-zA-Z\s\-',\.]+$/;
    if (!data.birthCity || typeof data.birthCity !== 'string') {
        errors.push({ field: 'birthCity', message: 'Birth city is required' });
    }
    else if (data.birthCity.trim().length === 0 || data.birthCity.length > 100) {
        errors.push({ field: 'birthCity', message: 'Birth city must be 1-100 characters' });
    }
    else if (!locationRegex.test(data.birthCity)) {
        errors.push({ field: 'birthCity', message: 'Birth city contains invalid characters' });
    }
    if (!data.birthState || typeof data.birthState !== 'string') {
        errors.push({ field: 'birthState', message: 'Birth state/province is required' });
    }
    else if (data.birthState.trim().length === 0 || data.birthState.length > 100) {
        errors.push({ field: 'birthState', message: 'Birth state must be 1-100 characters' });
    }
    else if (!locationRegex.test(data.birthState)) {
        errors.push({ field: 'birthState', message: 'Birth state contains invalid characters' });
    }
    if (!data.birthCountry || typeof data.birthCountry !== 'string') {
        errors.push({ field: 'birthCountry', message: 'Birth country is required' });
    }
    else if (data.birthCountry.trim().length === 0 || data.birthCountry.length > 100) {
        errors.push({ field: 'birthCountry', message: 'Birth country must be 1-100 characters' });
    }
    else if (!locationRegex.test(data.birthCountry)) {
        errors.push({ field: 'birthCountry', message: 'Birth country contains invalid characters' });
    }
    // Future lat/long validation (when provided)
    if (data.birthLatitude !== undefined) {
        const lat = data.birthLatitude;
        if (isNaN(lat) || lat < -90 || lat > 90) {
            errors.push({ field: 'birthLatitude', message: 'Invalid latitude' });
        }
    }
    if (data.birthLongitude !== undefined) {
        const lng = data.birthLongitude;
        if (isNaN(lng) || lng < -180 || lng > 180) {
            errors.push({ field: 'birthLongitude', message: 'Invalid longitude' });
        }
    }
    return errors;
};
const handler = async (event) => {
    try {
        // Extract userId from path parameters
        const userId = event.pathParameters?.userId;
        if (!userId) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
                body: JSON.stringify({ error: 'Missing userId parameter' }),
            };
        }
        // Extract user sub from authorizer context
        const authorizerUserId = event.requestContext.authorizer?.claims?.sub;
        if (!authorizerUserId) {
            return {
                statusCode: 401,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
                body: JSON.stringify({ error: 'Unauthorized' }),
            };
        }
        // Verify user can only update their own profile
        if (userId !== authorizerUserId) {
            return {
                statusCode: 403,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
                body: JSON.stringify({ error: 'Forbidden' }),
            };
        }
        // Parse request body
        let profileData;
        try {
            profileData = JSON.parse(event.body || '{}');
        }
        catch {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
                body: JSON.stringify({ error: 'Invalid JSON body' }),
            };
        }
        // Geocode location
        const geoData = await getGeoData(profileData.birthCity, profileData.birthState, profileData.birthCountry);
        if (!geoData) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
                body: JSON.stringify({
                    error: 'Validation failed',
                    validationErrors: [
                        {
                            field: 'birthCity',
                            message: 'Could not find a valid location for the city, state, and country provided.',
                        },
                    ],
                }),
            };
        }
        // Add geo data to profile
        profileData.birthLatitude = geoData.latitude;
        profileData.birthLongitude = geoData.longitude;
        profileData.ianaTimeZone = geoData.ianaTimeZone;
        profileData.standardizedLocationName = geoData.standardizedLocationName;
        // Validate profile data
        const validationErrors = validateBirthData(profileData);
        if (validationErrors.length > 0) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
                body: JSON.stringify({
                    error: 'Validation failed',
                    validationErrors,
                }),
            };
        }
        // Prepare item for DynamoDB
        const now = new Date().toISOString();
        // Build profile object without undefined values
        const profile = {
            birthName: profileData.birthName.trim(),
            birthDate: profileData.birthDate,
            birthTime: profileData.birthTime.trim(),
            birthCity: profileData.birthCity.trim(),
            birthState: profileData.birthState.trim(),
            birthCountry: profileData.birthCountry.trim(),
        };
        // Only add optional fields if they have values
        if (profileData.birthLatitude !== undefined) {
            profile.birthLatitude = profileData.birthLatitude;
        }
        if (profileData.birthLongitude !== undefined) {
            profile.birthLongitude = profileData.birthLongitude;
        }
        if (profileData.ianaTimeZone) {
            profile.ianaTimeZone = profileData.ianaTimeZone;
        }
        if (profileData.standardizedLocationName) {
            profile.standardizedLocationName = profileData.standardizedLocationName;
        }
        const item = {
            userId,
            createdAt: 'PROFILE', // Fixed sort key for profile data
            email: profileData.email,
            profile,
            onboardingCompleted: true,
            updatedAt: now,
            firstCreatedAt: now, // Will be overwritten if profile already exists
        };
        // Save to DynamoDB
        await docClient.send(new lib_dynamodb_1.PutCommand({
            TableName: TABLE_NAME,
            Item: item,
            ConditionExpression: 'attribute_not_exists(userId) OR attribute_exists(userId)',
        }));
        // Asynchronously invoke the natal chart generation Lambda
        const invocationPayload = {
            userId,
            birthDate: profileData.birthDate,
            birthTime: profileData.birthTime,
            latitude: profileData.birthLatitude,
            longitude: profileData.birthLongitude,
            ianaTimeZone: profileData.ianaTimeZone,
        };
        console.info('Invoking natal chart generation with payload:', invocationPayload);
        console.info('Function name:', GENERATE_NATAL_CHART_FUNCTION_NAME);
        try {
            const invocationResponse = await lambdaClient.send(new client_lambda_1.InvokeCommand({
                FunctionName: GENERATE_NATAL_CHART_FUNCTION_NAME,
                InvocationType: 'Event', // Asynchronous invocation
                Payload: JSON.stringify(invocationPayload),
            }));
            console.info('Natal chart generation invoked successfully:', {
                statusCode: invocationResponse.StatusCode,
                functionError: invocationResponse.FunctionError,
            });
        }
        catch (invocationError) {
            console.error('Failed to invoke natal chart generation:', invocationError);
            // Don't fail the profile update if natal chart generation fails
            // The user can still see their profile even if the chart isn't ready
        }
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify({
                message: 'Profile updated successfully',
                profile: item,
            }),
        };
    }
    catch (error) {
        console.error('Error in update-user-profile handler:', error);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXBkYXRlLXVzZXItcHJvZmlsZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInVwZGF0ZS11c2VyLXByb2ZpbGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQ0EsOERBQTBEO0FBQzFELHdEQUEyRTtBQUMzRSw4REFBMEY7QUFDMUYsMERBQXFFO0FBQ3JFLDBEQUFpQztBQUVqQyxNQUFNLFlBQVksR0FBRyxJQUFJLGdDQUFjLENBQUMsRUFBRSxDQUFDLENBQUM7QUFDNUMsTUFBTSxTQUFTLEdBQUcscUNBQXNCLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDO0FBQzVELE1BQU0sY0FBYyxHQUFHLElBQUksZ0NBQWMsQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUM5QyxNQUFNLFlBQVksR0FBRyxJQUFJLDRCQUFZLENBQUMsRUFBRSxDQUFDLENBQUM7QUFFMUMsTUFBTSxVQUFVLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxVQUFXLENBQUM7QUFDM0MsTUFBTSxnQkFBZ0IsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLGdCQUFpQixDQUFDO0FBQ3ZELE1BQU0sa0NBQWtDLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxrQ0FBbUMsQ0FBQztBQXVCM0Y7O0dBRUc7QUFDSCxLQUFLLFVBQVUsVUFBVSxDQUFDLElBQVksRUFBRSxLQUFhLEVBQUUsT0FBZTtJQUNwRSxNQUFNLFVBQVUsR0FBRyxHQUFHLElBQUksS0FBSyxLQUFLLEtBQUssT0FBTyxFQUFFLENBQUM7SUFFbkQsSUFBSSxDQUFDO1FBQ0gsTUFBTSxPQUFPLEdBQUcsSUFBSSxnREFBOEIsQ0FBQztZQUNqRCxTQUFTLEVBQUUsZ0JBQWdCO1lBQzNCLElBQUksRUFBRSxVQUFVO1lBQ2hCLFVBQVUsRUFBRSxDQUFDO1NBQ2QsQ0FBQyxDQUFDO1FBQ0gsTUFBTSxRQUFRLEdBQUcsTUFBTSxjQUFjLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBRXBELElBQUksUUFBUSxD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SSxDQUFDLFNBQVMsQ0FBQyxpQkFBaUIsQ0FBQzthQUMzQyxDQUFDLENBQ0gsQ0FBQztZQUVGLE9BQU8sQ0FBQyxJQUFJLENBQUMsOENBQThDLEVBQUU7Z0JBQzNELFVBQVUsRUFBRSxrQkFBa0IsQ0FBQyxVQUFVO2dCQUN6QyxhQUFhLEVBQUUsa0JBQWtCLENBQUMsYUFBYTthQUNoRCxDQUFDLENBQUM7UUFDTCxDQUFDO1FBQUMsT0FBTyxlQUFlLEVBQUUsQ0FBQztZQUN6QixPQUFPLENBQUMsS0FBSyxDQUFDLDBDQUEwQyxFQUFFLGVBQWUsQ0FBQyxDQUFDO1lBQzNFLGdFQUFnRTtZQUNoRSxxRUFBcUU7UUFDdkUsQ0FBQztRQUVELE9BQU87WUFDTCxVQUFVLEVBQUUsR0FBRztZQUNmLE9BQU8sRUFBRTtnQkFDUCxjQUFjLEVBQUUsa0JBQWtCO2dCQUNsQyw2QkFBNkIsRUFBRSxHQUFHO2FBQ25DO1lBQ0QsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUM7Z0JBQ25CLE9BQU8sRUFBRSw4QkFBOEI7Z0JBQ3ZDLE9BQU8sRUFBRSxJQUFJO2FBQ2QsQ0FBQztTQUNILENBQUM7SUFDSixDQUFDO0lBQUMsT0FBTyxLQUFLLEVBQUUsQ0FBQztRQUNmLE9BQU8sQ0FBQyxLQUFLLENBQUMsdUNBQXVDLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDOUQsT0FBTztZQUNMLFVBQVUsRUFBRSxHQUFHO1lBQ2YsT0FBTyxFQUFFO2dCQUNQLGNBQWMsRUFBRSxrQkFBa0I7Z0JBQ2xDLDZCQUE2QixFQUFFLEdBQUc7YUFDbkM7WUFDRCxJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQyxFQUFFLEtBQUssRUFBRSx1QkFBdUIsRUFBRSxDQUFDO1NBQ3pELENBQUM7SUFDSixDQUFDO0FBQ0gsQ0FBQyxDQUFDO0FBaE5XLFFBQUEsT0FBTyxXQWdObEIiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBBUElHYXRld2F5UHJveHlFdmVudCwgQVBJR2F0ZXdheVByb3h5UmVzdWx0IH0gZnJvbSAnYXdzLWxhbWJkYSc7XG5pbXBvcnQgeyBEeW5hbW9EQkNsaWVudCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1keW5hbW9kYic7XG5pbXBvcnQgeyBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LCBQdXRDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvbGliLWR5bmFtb2RiJztcbmltcG9ydCB7IExvY2F0aW9uQ2xpZW50LCBTZWFyY2hQbGFjZUluZGV4Rm9yVGV4dENvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtbG9jYXRpb24nO1xuaW1wb3J0IHsgTGFtYmRhQ2xpZW50LCBJbnZva2VDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LWxhbWJkYSc7XG5pbXBvcnQgdHpsb29rdXAgZnJvbSAndHotbG9va3VwJztcblxuY29uc3QgZHluYW1vQ2xpZW50ID0gbmV3IER5bmFtb0RCQ2xpZW50KHt9KTtcbmNvbnN0IGRvY0NsaWVudCA9IER5bmFtb0RCRG9jdW1lbnRDbGllbnQuZnJvbShkeW5hbW9DbGllbnQpO1xuY29uc3QgbG9jYXRpb25DbGllbnQgPSBuZXcgTG9jYXRpb25DbGllbnQoe30pO1xuY29uc3QgbGFtYmRhQ2xpZW50ID0gbmV3IExhbWJkYUNsaWVudCh7fSk7XG5cbmNvbnN0IFRBQkxFX05BTUUgPSBwcm9jZXNzLmVudi5UQUJMRV9OQU1FITtcbmNvbnN0IFBMQUNFX0lOREVYX05BTUUgPSBwcm9jZXNzLmVudi5QTEFDRV9JTkRFWF9OQU1FITtcbmNvbnN0IEdFTkVSQVRFX05BVEFMX0NIQVJUX0ZVTkNUSU9OX05BTUUgPSBwcm9jZXNzLmVudi5HRU5FUkFURV9OQVRBTF9DSEFSVF9GVU5DVElPTl9OQU1FITtcblxuaW50ZXJmYWNlIFByb2ZpbGVEYXRhIHtcbiAgZW1haWw6IHN0cmluZztcbiAgYmlydGhOYW1lOiBzdHJpbmc7XG4gIGJpcnRoRGF0ZTogc3RyaW5nO1xuICBiaXJ0aFRpbWU6IHN0cmluZztcbiAgYmlydGhDaXR5OiBzdHJpbmc7XG4gIGJpcnRoU3RhdGU6IHN0cmluZztcbiAgYmlydGhDb3VudHJ5OiBzdHJpbmc7XG4gIGJpcnRoTGF0aXR1ZGU/OiBudW1iZXI7XG4gIGJpcnRoTG9uZ2l0dWRlPzogbnVtYmVyO1xuICBpYW5hVGltZVpvbmU/OiBzdHJpbmc7XG4gIHN0YW5kYXJkaXplZExvY2F0aW9uTmFtZT86IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIEdlb0RhdGEge1xuICBsYXRpdHVkZTogbnVtYmVyO1xuICBsb25naXR1ZGU6IG51bWJlcjtcbiAgaWFuYVRpbWVab25lOiBzdHJpbmc7XG4gIHN0YW5kYXJkaXplZExvY2F0aW9uTmFtZTogc3RyaW5nO1xufVxuXG4vKipcbiAqIEdlb2NvZGVzIGEgbG9jYXRpb24gYW5kIHJldHVybnMgaXRzIGNvb3JkaW5hdGVzLCB0aW1lIHpvbmUsIGFuZCBzdGFuZGFyZGl6ZWQgbmFtZS5cbiAqL1xuYXN5bmMgZnVuY3Rpb24gZ2V0R2VvRGF0YShjaXR5OiBzdHJpbmcsIHN0YXRlOiBzdHJpbmcsIGNvdW50cnk6IHN0cmluZyk6IFByb21pc2U8R2VvRGF0YSB8IG51bGw+IHtcbiAgY29uc3Qgc2VhcmNoVGV4dCA9IGAke2NpdHl9LCAke3N0YXRlfSwgJHtjb3VudHJ5fWA7XG5cbiAgdHJ5IHtcbiAgICBjb25zdCBjb21tYW5kID0gbmV3IFNlYXJjaFBsYWNlSW5kZXhGb3JUZXh0Q29tbWFuZCh7XG4gICAgICBJbmRleE5hbWU6IFBMQUNFX0lOREVYX05BTUUsXG4gICAgICBUZXh0OiBzZWFyY2hUZXh0LFxuICAgICAgTWF4UmVzdWx0czogMSxcbiAgICB9KTtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGxvY2F0aW9uQ2xpZW50LnNlbmQoY29tbWFuZCk7XG5cbiAgICBpZiAocmVzcG9uc2UuUmVzdWx0cyAmJiByZXNwb25zZS5SZXN1bHRzLmxlbmd0aCA+IDAgJiYgcmVzcG9uc2UuUmVzdWx0c1swXS5QbGFjZSkge1xuICAgICAgY29uc3QgcGxhY2UgPSByZXNwb25zZS5SZXN1bHRzWzBdLlBsYWNlO1xuICAgICAgY29uc3QgW2xvbmdpdHVkZSwgbGF0aXR1ZGVdID0gcGxhY2UuR2VvbWV0cnk/LlBvaW50IHx8IFtdO1xuXG4gICAgICBpZiAobG9uZ2l0dWRlID09PSB1bmRlZmluZWQgfHwgbGF0aXR1ZGUgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIH1cblxuICAgICAgY29uc3QgaWFuYVRpbWVab25lID0gdHpsb29rdXAobGF0aXR1ZGUsIGxvbmdpdHVkZSk7XG4gICAgICBjb25zdCBzdGFuZGFyZGl6ZWRMb2NhdGlvbk5hbWUgPSBwbGFjZS5MYWJlbCB8fCBzZWFyY2hUZXh0O1xuXG4gICAgICByZXR1cm4ge1xuICAgICAgICBsYXRpdHVkZTogcGFyc2VGbG9hdChsYXRpdHVkZS50b0ZpeGVkKDYpKSxcbiAgICAgICAgbG9uZ2l0dWRlOiBwYXJzZUZsb2F0KGxvbmdpdHVkZS50b0ZpeGVkKDYpKSxcbiAgICAgICAgaWFuYVRpbWVab25lLFxuICAgICAgICBzdGFuZGFyZGl6ZWRMb2NhdGlvbk5hbWUsXG4gICAgICB9O1xuICAgIH1cbiAgICByZXR1cm4gbnVsbDtcbiAgfSBjYXRjaCB7XG4gICAgLy8gUmUtdGhyb3cgb3IgaGFuZGxlIGFzIGEgbm9uLWJsb2NraW5nIGVycm9yXG4gICAgdGhyb3cgbmV3IEVycm9yKCdGYWlsZWQgdG8gZ2VvY29kZSBsb2NhdGlvbiBkdWUgdG8gYSBzZXJ2aWNlIGVycm9yLicpO1xuICB9XG59XG5cbmludGVyZmFjZSBWYWxpZGF0aW9uRXJyb3Ige1xuICBmaWVsZDogc3RyaW5nO1xuICBtZXNzYWdlOiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBVc2VyUHJvZmlsZSB7XG4gIGJpcnRoTmFtZTogc3RyaW5nO1xuICBiaXJ0aERhdGU6IHN0cmluZztcbiAgYmlydGhUaW1lOiBzdHJpbmc7XG4gIGJpcnRoQ2l0eTogc3RyaW5nO1xuICBiaXJ0aFN0YXRlOiBzdHJpbmc7XG4gIGJpcnRoQ291bnRyeTogc3RyaW5nO1xuICBiaXJ0aExhdGl0dWRlPzogbnVtYmVyO1xuICBiaXJ0aExvbmdpdHVkZT86IG51bWJlcjtcbiAgaWFuYVRpbWVab25lPzogc3RyaW5nO1xuICBzdGFuZGFyZGl6ZWRMb2NhdGlvbk5hbWU/OiBzdHJpbmc7XG59XG5cbmNvbnN0IHZhbGlkYXRlQmlydGhEYXRhID0gKGRhdGE6IFByb2ZpbGVEYXRhKTogVmFsaWRhdGlvbkVycm9yW10gPT4ge1xuICBjb25zdCBlcnJvcnM6IFZhbGlkYXRpb25FcnJvcltdID0gW107XG5cbiAgLy8gRW1haWwgdmFsaWRhdGlvblxuICBpZiAoIWRhdGEuZW1haWwgfHwgdHlwZW9mIGRhdGEuZW1haWwgIT09ICdzdHJpbmcnKSB7XG4gICAgZXJyb3JzLnB1c2goeyBmaWVsZDogJ2VtYWlsJywgbWVzc2FnZTogJ0VtYWlsIGlzIHJlcXVpcmVkJyB9KTtcbiAgfSBlbHNlIGlmICghL15bXlxcc0BdK0BbXlxcc0BdK1xcLlteXFxzQF0rJC8udGVzdChkYXRhLmVtYWlsKSkge1xuICAgIGVycm9ycy5wdXNoKHsgZmllbGQ6ICdlbWFpbCcsIG1lc3NhZ2U6ICdJbnZhbGlkIGVtYWlsIGZvcm1hdCcgfSk7XG4gIH1cblxuICAvLyBCaXJ0aCBuYW1lIHZhbGlkYXRpb25cbiAgaWYgKCFkYXRhLmJpcnRoTmFtZSB8fCB0eXBlb2YgZGF0YS5iaXJ0aE5hbWUgIT09ICdzdHJpbmcnKSB7XG4gICAgZXJyb3JzLnB1c2goeyBmaWVsZDogJ2JpcnRoTmFtZScsIG1lc3NhZ2U6ICdCaXJ0aCBuYW1lIGlzIHJlcXVpcmVkJyB9KTtcbiAgfSBlbHNlIGlmIChkYXRhLmJpcnRoTmFtZS50cmltKCkubGVuZ3RoID09PSAwIHx8IGRhdGEuYmlydGhOYW1lLmxlbmd0aCA+IDI1Nikge1xuICAgIGVycm9ycy5wdXNoKHsgZmllbGQ6ICdiaXJ0aE5hbWUnLCBtZXNzYWdlOiAnQmlydGggbmFtZSBtdXN0IGJlIDEtMjU2IGNoYXJhY3RlcnMnIH0pO1xuICB9IGVsc2UgaWYgKCEvXlthLXpBLVpcXHNcXC0nXSskLy50ZXN0KGRhdGEuYmlydGhOYW1lKSkge1xuICAgIGVycm9ycy5wdXNoKHsgZmllbGQ6ICdiaXJ0aE5hbWUnLCBtZXNzYWdlOiAnQmlydGggbmFtZSBjb250YWlucyBpbnZhbGlkIGNoYXJhY3RlcnMnIH0pO1xuICB9XG5cbiAgLy8gQmlydGggZGF0ZSB2YWxpZGF0aW9uXG4gIGlmICghZGF0YS5iaXJ0aERhdGUgfHwgdHlwZW9mIGRhdGEuYmlydGhEYXRlICE9PSAnc3RyaW5nJykge1xuICAgIGVycm9ycy5wdXNoKHsgZmllbGQ6ICdiaXJ0aERhdGUnLCBtZXNzYWdlOiAnQmlydGggZGF0ZSBpcyByZXF1aXJlZCcgfSk7XG4gIH0gZWxzZSBpZiAoIS9eXFxkezR9LVxcZHsyfS1cXGR7Mn0kLy50ZXN0KGRhdGEuYmlydGhEYXRlKSkge1xuICAgIGVycm9ycy5wdXNoKHsgZmllbGQ6ICdiaXJ0aERhdGUnLCBtZXNzYWdlOiAnQmlydGggZGF0ZSBtdXN0IGJlIGluIFlZWVktTU0tREQgZm9ybWF0JyB9KTtcbiAgfSBlbHNlIHtcbiAgICBjb25zdCBkYXRlID0gbmV3IERhdGUoZGF0YS5iaXJ0aERhdGUpO1xuICAgIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCk7XG4gICAgY29uc3QgbWluRGF0ZSA9IG5ldyBEYXRlKCcxOTAwLTAxLTAxJyk7XG5cbiAgICBpZiAoaXNOYU4oZGF0ZS5nZXRUaW1lKCkpKSB7XG4gICAgICBlcnJvcnMucHVzaCh7IGZpZWxkOiAnYmlydGhEYXRlJywgbWVzc2FnZTogJ0ludmFsaWQgYmlydGggZGF0ZScgfSk7XG4gICAgfSBlbHNlIGlmIChkYXRlID4gbm93KSB7XG4gICAgICBlcnJvcnMucHVzaCh7IGZpZWxkOiAnYmlydGhEYXRlJywgbWVzc2FnZTogJ0JpcnRoIGRhdGUgY2Fubm90IGJlIGluIHRoZSBmdXR1cmUnIH0pO1xuICAgIH0gZWxzZSBpZiAoZGF0ZSA8IG1pbkRhdGUpIHtcbiAgICAgIGVycm9ycy5wdXNoKHsgZmllbGQ6ICdiaXJ0aERhdGUnLCBtZXNzYWdlOiAnQmlydGggZGF0ZSBjYW5ub3QgYmUgYmVmb3JlIDE5MDAnIH0pO1xuICAgIH1cbiAgfVxuXG4gIC8vIEJpcnRoIHRpbWUgdmFsaWRhdGlvbiAocmVxdWlyZWQpXG4gIGlmICghZGF0YS5iaXJ0aFRpbWUgfHwgdHlwZW9mIGRhdGEuYmlydGhUaW1lICE9PSAnc3RyaW5nJykge1xuICAgIGVycm9ycy5wdXNoKHsgZmllbGQ6ICdiaXJ0aFRpbWUnLCBtZXNzYWdlOiAnQmlydGggdGltZSBpcyByZXF1aXJlZCcgfSk7XG4gIH0gZWxzZSBpZiAoIS9eKFswLTFdP1swLTldfDJbMC0zXSk6WzAtNV1bMC05XSQvLnRlc3QoZGF0YS5iaXJ0aFRpbWUpKSB7XG4gICAgZXJyb3JzLnB1c2goeyBmaWVsZDogJ2JpcnRoVGltZScsIG1lc3NhZ2U6ICdCaXJ0aCB0aW1lIG11c3QgYmUgaW4gSEg6TU0gZm9ybWF0ICgyNC1ob3VyKScgfSk7XG4gIH1cblxuICAvLyBMb2NhdGlvbiB2YWxpZGF0aW9uXG4gIGNvbnN0IGxvY2F0aW9uUmVnZXggPSAvXlthLXpBLVpcXHNcXC0nLFxcLl0rJC87XG5cbiAgaWYgKCFkYXRhLmJpcnRoQ2l0eSB8fCB0eXBlb2YgZGF0YS5iaXJ0aENpdHkgIT09ICdzdHJpbmcnKSB7XG4gICAgZXJyb3JzLnB1c2goeyBmaWVsZDogJ2JpcnRoQ2l0eScsIG1lc3NhZ2U6ICdCaXJ0aCBjaXR5IGlzIHJlcXVpcmVkJyB9KTtcbiAgfSBlbHNlIGlmIChkYXRhLmJpcnRoQ2l0eS50cmltKCkubGVuZ3RoID09PSAwIHx8IGRhdGEuYmlydGhDaXR5Lmxlbmd0aCA+IDEwMCkge1xuICAgIGVycm9ycy5wdXNoKHsgZmllbGQ6ICdiaXJ0aENpdHknLCBtZXNzYWdlOiAnQmlydGggY2l0eSBtdXN0IGJlIDEtMTAwIGNoYXJhY3RlcnMnIH0pO1xuICB9IGVsc2UgaWYgKCFsb2NhdGlvblJlZ2V4LnRlc3QoZGF0YS5iaXJ0aENpdHkpKSB7XG4gICAgZXJyb3JzLnB1c2goeyBmaWVsZDogJ2JpcnRoQ2l0eScsIG1lc3NhZ2U6ICdCaXJ0aCBjaXR5IGNvbnRhaW5zIGludmFsaWQgY2hhcmFjdGVycycgfSk7XG4gIH1cblxuICBpZiAoIWRhdGEuYmlydGhTdGF0ZSB8fCB0eXBlb2YgZGF0YS5iaXJ0aFN0YXRlICE9PSAnc3RyaW5nJykge1xuICAgIGVycm9ycy5wdXNoKHsgZmllbGQ6ICdiaXJ0aFN0YXRlJywgbWVzc2FnZTogJ0JpcnRoIHN0YXRlL3Byb3ZpbmNlIGlzIHJlcXVpcmVkJyB9KTtcbiAgfSBlbHNlIGlmIChkYXRhLmJpcnRoU3RhdGUudHJpbSgpLmxlbmd0aCA9PT0gMCB8fCBkYXRhLmJpcnRoU3RhdGUubGVuZ3RoID4gMTAwKSB7XG4gICAgZXJyb3JzLnB1c2goeyBmaWVsZDogJ2JpcnRoU3RhdGUnLCBtZXNzYWdlOiAnQmlydGggc3RhdGUgbXVzdCBiZSAxLTEwMCBjaGFyYWN0ZXJzJyB9KTtcbiAgfSBlbHNlIGlmICghbG9jYXRpb25SZWdleC50ZXN0KGRhdGEuYmlydGhTdGF0ZSkpIHtcbiAgICBlcnJvcnMucHVzaCh7IGZpZWxkOiAnYmlydGhTdGF0ZScsIG1lc3NhZ2U6ICdCaXJ0aCBzdGF0ZSBjb250YWlucyBpbnZhbGlkIGNoYXJhY3RlcnMnIH0pO1xuICB9XG5cbiAgaWYgKCFkYXRhLmJpcnRoQ291bnRyeSB8fCB0eXBlb2YgZGF0YS5iaXJ0aENvdW50cnkgIT09ICdzdHJpbmcnKSB7XG4gICAgZXJyb3JzLnB1c2goeyBmaWVsZDogJ2JpcnRoQ291bnRyeScsIG1lc3NhZ2U6ICdCaXJ0aCBjb3VudHJ5IGlzIHJlcXVpcmVkJyB9KTtcbiAgfSBlbHNlIGlmIChkYXRhLmJpcnRoQ291bnRyeS50cmltKCkubGVuZ3RoID09PSAwIHx8IGRhdGEuYmlydGhDb3VudHJ5Lmxlbmd0aCA+IDEwMCkge1xuICAgIGVycm9ycy5wdXNoKHsgZmllbGQ6ICdiaXJ0aENvdW50cnknLCBtZXNzYWdlOiAnQmlydGggY291bnRyeSBtdXN0IGJlIDEtMTAwIGNoYXJhY3RlcnMnIH0pO1xuICB9IGVsc2UgaWYgKCFsb2NhdGlvblJlZ2V4LnRlc3QoZGF0YS5iaXJ0aENvdW50cnkpKSB7XG4gICAgZXJyb3JzLnB1c2goeyBmaWVsZDogJ2JpcnRoQ291bnRyeScsIG1lc3NhZ2U6ICdCaXJ0aCBjb3VudHJ5IGNvbnRhaW5zIGludmFsaWQgY2hhcmFjdGVycycgfSk7XG4gIH1cblxuICAvLyBGdXR1cmUgbGF0L2xvbmcgdmFsaWRhdGlvbiAod2hlbiBwcm92aWRlZClcbiAgaWYgKGRhdGEuYmlydGhMYXRpdHVkZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgY29uc3QgbGF0ID0gZGF0YS5iaXJ0aExhdGl0dWRlO1xuICAgIGlmIChpc05hTihsYXQpIHx8IGxhdCA8IC05MCB8fCBsYXQgPiA5MCkge1xuICAgICAgZXJyb3JzLnB1c2goeyBmaWVsZDogJ2JpcnRoTGF0aXR1ZGUnLCBtZXNzYWdlOiAnSW52YWxpZCBsYXRpdHVkZScgfSk7XG4gICAgfVxuICB9XG5cbiAgaWYgKGRhdGEuYmlydGhMb25naXR1ZGUgIT09IHVuZGVmaW5lZCkge1xuICAgIGNvbnN0IGxuZyA9IGRhdGEuYmlydGhMb25naXR1ZGU7XG4gICAgaWYgKGlzTmFOKGxuZykgfHwgbG5nIDwgLTE4MCB8fCBsbmcgPiAxODApIHtcbiAgICAgIGVycm9ycy5wdXNoKHsgZmllbGQ6ICdiaXJ0aExvbmdpdHVkZScsIG1lc3NhZ2U6ICdJbnZhbGlkIGxvbmdpdHVkZScgfSk7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIGVycm9ycztcbn07XG5cbmV4cG9ydCBjb25zdCBoYW5kbGVyID0gYXN5bmMgKGV2ZW50OiBBUElHYXRld2F5UHJveHlFdmVudCk6IFByb21pc2U8QVBJR2F0ZXdheVByb3h5UmVzdWx0PiA9PiB7XG4gIHRyeSB7XG4gICAgLy8gRXh0cmFjdCB1c2VySWQgZnJvbSBwYXRoIHBhcmFtZXRlcnNcbiAgICBjb25zdCB1c2VySWQgPSBldmVudC5wYXRoUGFyYW1ldGVycz8udXNlcklkO1xuICAgIGlmICghdXNlcklkKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA0MDAsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiAnKicsXG4gICAgICAgIH0sXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICdNaXNzaW5nIHVzZXJJZCBwYXJhbWV0ZXInIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBFeHRyYWN0IHVzZXIgc3ViIGZyb20gYXV0aG9yaXplciBjb250ZXh0XG4gICAgY29uc3QgYXV0aG9yaXplclVzZXJJZCA9IGV2ZW50LnJlcXVlc3RDb250ZXh0LmF1dGhvcml6ZXI/LmNsYWltcz8uc3ViO1xuXG4gICAgaWYgKCFhdXRob3JpemVyVXNlcklkKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA0MDEsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiAnKicsXG4gICAgICAgIH0sXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICdVbmF1dGhvcml6ZWQnIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBWZXJpZnkgdXNlciBjYW4gb25seSB1cGRhdGUgdGhlaXIgb3duIHByb2ZpbGVcbiAgICBpZiAodXNlcklkICE9PSBhdXRob3JpemVyVXNlcklkKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA0MDMsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiAnKicsXG4gICAgICAgIH0sXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICdGb3JiaWRkZW4nIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBQYXJzZSByZXF1ZXN0IGJvZHlcbiAgICBsZXQgcHJvZmlsZURhdGE6IFByb2ZpbGVEYXRhO1xuICAgIHRyeSB7XG4gICAgICBwcm9maWxlRGF0YSA9IEpTT04ucGFyc2UoZXZlbnQuYm9keSB8fCAne30nKTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMCxcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6ICcqJyxcbiAgICAgICAgfSxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ0ludmFsaWQgSlNPTiBib2R5JyB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gR2VvY29kZSBsb2NhdGlvblxuICAgIGNvbnN0IGdlb0RhdGEgPSBhd2FpdCBnZXRHZW9EYXRhKFxuICAgICAgcHJvZmlsZURhdGEuYmlydGhDaXR5LFxuICAgICAgcHJvZmlsZURhdGEuYmlydGhTdGF0ZSxcbiAgICAgIHByb2ZpbGVEYXRhLmJpcnRoQ291bnRyeSxcbiAgICApO1xuXG4gICAgaWYgKCFnZW9EYXRhKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA0MDAsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiAnKicsXG4gICAgICAgIH0sXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBlcnJvcjogJ1ZhbGlkYXRpb24gZmFpbGVkJyxcbiAgICAgICAgICB2YWxpZGF0aW9uRXJyb3JzOiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIGZpZWxkOiAnYmlydGhDaXR5JyxcbiAgICAgICAgICAgICAgbWVzc2FnZTogJ0NvdWxkIG5vdCBmaW5kIGEgdmFsaWQgbG9jYXRpb24gZm9yIHRoZSBjaXR5LCBzdGF0ZSwgYW5kIGNvdW50cnkgcHJvdmlkZWQuJyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgXSxcbiAgICAgICAgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIEFkZCBnZW8gZGF0YSB0byBwcm9maWxlXG4gICAgcHJvZmlsZURhdGEuYmlydGhMYXRpdHVkZSA9IGdlb0RhdGEubGF0aXR1ZGU7XG4gICAgcHJvZmlsZURhdGEuYmlydGhMb25naXR1ZGUgPSBnZW9EYXRhLmxvbmdpdHVkZTtcbiAgICBwcm9maWxlRGF0YS5pYW5hVGltZVpvbmUgPSBnZW9EYXRhLmlhbmFUaW1lWm9uZTtcbiAgICBwcm9maWxlRGF0YS5zdGFuZGFyZGl6ZWRMb2NhdGlvbk5hbWUgPSBnZW9EYXRhLnN0YW5kYXJkaXplZExvY2F0aW9uTmFtZTtcblxuICAgIC8vIFZhbGlkYXRlIHByb2ZpbGUgZGF0YVxuICAgIGNvbnN0IHZhbGlkYXRpb25FcnJvcnMgPSB2YWxpZGF0ZUJpcnRoRGF0YShwcm9maWxlRGF0YSk7XG4gICAgaWYgKHZhbGlkYXRpb25FcnJvcnMubGVuZ3RoID4gMCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNDAwLFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogJyonLFxuICAgICAgICB9LFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgZXJyb3I6ICdWYWxpZGF0aW9uIGZhaWxlZCcsXG4gICAgICAgICAgdmFsaWRhdGlvbkVycm9ycyxcbiAgICAgICAgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIFByZXBhcmUgaXRlbSBmb3IgRHluYW1vREJcbiAgICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCk7XG5cbiAgICAvLyBCdWlsZCBwcm9maWxlIG9iamVjdCB3aXRob3V0IHVuZGVmaW5lZCB2YWx1ZXNcbiAgICBjb25zdCBwcm9maWxlOiBVc2VyUHJvZmlsZSA9IHtcbiAgICAgIGJpcnRoTmFtZTogcHJvZmlsZURhdGEuYmlydGhOYW1lLnRyaW0oKSxcbiAgICAgIGJpcnRoRGF0ZTogcHJvZmlsZURhdGEuYmlydGhEYXRlLFxuICAgICAgYmlydGhUaW1lOiBwcm9maWxlRGF0YS5iaXJ0aFRpbWUudHJpbSgpLFxuICAgICAgYmlydGhDaXR5OiBwcm9maWxlRGF0YS5iaXJ0aENpdHkudHJpbSgpLFxuICAgICAgYmlydGhTdGF0ZTogcHJvZmlsZURhdGEuYmlydGhTdGF0ZS50cmltKCksXG4gICAgICBiaXJ0aENvdW50cnk6IHByb2ZpbGVEYXRhLmJpcnRoQ291bnRyeS50cmltKCksXG4gICAgfTtcblxuICAgIC8vIE9ubHkgYWRkIG9wdGlvbmFsIGZpZWxkcyBpZiB0aGV5IGhhdmUgdmFsdWVzXG5cbiAgICBpZiAocHJvZmlsZURhdGEuYmlydGhMYXRpdHVkZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICBwcm9maWxlLmJpcnRoTGF0aXR1ZGUgPSBwcm9maWxlRGF0YS5iaXJ0aExhdGl0dWRlO1xuICAgIH1cblxuICAgIGlmIChwcm9maWxlRGF0YS5iaXJ0aExvbmdpdHVkZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICBwcm9maWxlLmJpcnRoTG9uZ2l0dWRlID0gcHJvZmlsZURhdGEuYmlydGhMb25naXR1ZGU7XG4gICAgfVxuXG4gICAgaWYgKHByb2ZpbGVEYXRhLmlhbmFUaW1lWm9uZSkge1xuICAgICAgcHJvZmlsZS5pYW5hVGltZVpvbmUgPSBwcm9maWxlRGF0YS5pYW5hVGltZVpvbmU7XG4gICAgfVxuXG4gICAgaWYgKHByb2ZpbGVEYXRhLnN0YW5kYXJkaXplZExvY2F0aW9uTmFtZSkge1xuICAgICAgcHJvZmlsZS5zdGFuZGFyZGl6ZWRMb2NhdGlvbk5hbWUgPSBwcm9maWxlRGF0YS5zdGFuZGFyZGl6ZWRMb2NhdGlvbk5hbWU7XG4gICAgfVxuXG4gICAgY29uc3QgaXRlbSA9IHtcbiAgICAgIHVzZXJJZCxcbiAgICAgIGNyZWF0ZWRBdDogJ1BST0ZJTEUnLCAvLyBGaXhlZCBzb3J0IGtleSBmb3IgcHJvZmlsZSBkYXRhXG4gICAgICBlbWFpbDogcHJvZmlsZURhdGEuZW1haWwsXG4gICAgICBwcm9maWxlLFxuICAgICAgb25ib2FyZGluZ0NvbXBsZXRlZDogdHJ1ZSxcbiAgICAgIHVwZGF0ZWRBdDogbm93LFxuICAgICAgZmlyc3RDcmVhdGVkQXQ6IG5vdywgLy8gV2lsbCBiZSBvdmVyd3JpdHRlbiBpZiBwcm9maWxlIGFscmVhZHkgZXhpc3RzXG4gICAgfTtcblxuICAgIC8vIFNhdmUgdG8gRHluYW1vREJcbiAgICBhd2FpdCBkb2NDbGllbnQuc2VuZChcbiAgICAgIG5ldyBQdXRDb21tYW5kKHtcbiAgICAgICAgVGFibGVOYW1lOiBUQUJMRV9OQU1FLFxuICAgICAgICBJdGVtOiBpdGVtLFxuICAgICAgICBDb25kaXRpb25FeHByZXNzaW9uOiAnYXR0cmlidXRlX25vdF9leGlzdHModXNlcklkKSBPUiBhdHRyaWJ1dGVfZXhpc3RzKHVzZXJJZCknLFxuICAgICAgfSksXG4gICAgKTtcblxuICAgIC8vIEFzeW5jaHJvbm91c2x5IGludm9rZSB0aGUgbmF0YWwgY2hhcnQgZ2VuZXJhdGlvbiBMYW1iZGFcbiAgICBjb25zdCBpbnZvY2F0aW9uUGF5bG9hZCA9IHtcbiAgICAgIHVzZXJJZCxcbiAgICAgIGJpcnRoRGF0ZTogcHJvZmlsZURhdGEuYmlydGhEYXRlLFxuICAgICAgYmlydGhUaW1lOiBwcm9maWxlRGF0YS5iaXJ0aFRpbWUsXG4gICAgICBsYXRpdHVkZTogcHJvZmlsZURhdGEuYmlydGhMYXRpdHVkZSxcbiAgICAgIGxvbmdpdHVkZTogcHJvZmlsZURhdGEuYmlydGhMb25naXR1ZGUsXG4gICAgICBpYW5hVGltZVpvbmU6IHByb2ZpbGVEYXRhLmlhbmFUaW1lWm9uZSxcbiAgICB9O1xuXG4gICAgY29uc29sZS5pbmZvKCdJbnZva2luZyBuYXRhbCBjaGFydCBnZW5lcmF0aW9uIHdpdGggcGF5bG9hZDonLCBpbnZvY2F0aW9uUGF5bG9hZCk7XG4gICAgY29uc29sZS5pbmZvKCdGdW5jdGlvbiBuYW1lOicsIEdFTkVSQVRFX05BVEFMX0NIQVJUX0ZVTkNUSU9OX05BTUUpO1xuXG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGludm9jYXRpb25SZXNwb25zZSA9IGF3YWl0IGxhbWJkYUNsaWVudC5zZW5kKFxuICAgICAgICBuZXcgSW52b2tlQ29tbWFuZCh7XG4gICAgICAgICAgRnVuY3Rpb25OYW1lOiBHRU5FUkFURV9OQVRBTF9DSEFSVF9GVU5DVElPTl9OQU1FLFxuICAgICAgICAgIEludm9jYXRpb25UeXBlOiAnRXZlbnQnLCAvLyBBc3luY2hyb25vdXMgaW52b2NhdGlvblxuICAgICAgICAgIFBheWxvYWQ6IEpTT04uc3RyaW5naWZ5KGludm9jYXRpb25QYXlsb2FkKSxcbiAgICAgICAgfSksXG4gICAgICApO1xuXG4gICAgICBjb25zb2xlLmluZm8oJ05hdGFsIGNoYXJ0IGdlbmVyYXRpb24gaW52b2tlZCBzdWNjZXNzZnVsbHk6Jywge1xuICAgICAgICBzdGF0dXNDb2RlOiBpbnZvY2F0aW9uUmVzcG9uc2UuU3RhdHVzQ29kZSxcbiAgICAgICAgZnVuY3Rpb25FcnJvcjogaW52b2NhdGlvblJlc3BvbnNlLkZ1bmN0aW9uRXJyb3IsXG4gICAgICB9KTtcbiAgICB9IGNhdGNoIChpbnZvY2F0aW9uRXJyb3IpIHtcbiAgICAgIGNvbnNvbGUuZXJyb3IoJ0ZhaWxlZCB0byBpbnZva2UgbmF0YWwgY2hhcnQgZ2VuZXJhdGlvbjonLCBpbnZvY2F0aW9uRXJyb3IpO1xuICAgICAgLy8gRG9uJ3QgZmFpbCB0aGUgcHJvZmlsZSB1cGRhdGUgaWYgbmF0YWwgY2hhcnQgZ2VuZXJhdGlvbiBmYWlsc1xuICAgICAgLy8gVGhlIHVzZXIgY2FuIHN0aWxsIHNlZSB0aGVpciBwcm9maWxlIGV2ZW4gaWYgdGhlIGNoYXJ0IGlzbid0IHJlYWR5XG4gICAgfVxuXG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1c0NvZGU6IDIwMCxcbiAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6ICcqJyxcbiAgICAgIH0sXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgIG1lc3NhZ2U6ICdQcm9maWxlIHVwZGF0ZWQgc3VjY2Vzc2Z1bGx5JyxcbiAgICAgICAgcHJvZmlsZTogaXRlbSxcbiAgICAgIH0pLFxuICAgIH07XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3IgaW4gdXBkYXRlLXVzZXItcHJvZmlsZSBoYW5kbGVyOicsIGVycm9yKTtcbiAgICByZXR1cm4ge1xuICAgICAgc3RhdHVzQ29kZTogNTAwLFxuICAgICAgaGVhZGVyczoge1xuICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogJyonLFxuICAgICAgfSxcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICdJbnRlcm5hbCBzZXJ2ZXIgZXJyb3InIH0pLFxuICAgIH07XG4gIH1cbn07XG4iXX0=