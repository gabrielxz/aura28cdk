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
        const lat = parseFloat(data.birthLatitude);
        if (isNaN(lat) || lat < -90 || lat > 90) {
            errors.push({ field: 'birthLatitude', message: 'Invalid latitude' });
        }
    }
    if (data.birthLongitude !== undefined) {
        const lng = parseFloat(data.birthLongitude);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXBkYXRlLXVzZXItcHJvZmlsZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInVwZGF0ZS11c2VyLXByb2ZpbGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQ0EsOERBQTBEO0FBQzFELHdEQUEyRTtBQUMzRSw4REFBMEY7QUFDMUYsMERBQXFFO0FBQ3JFLDBEQUFpQztBQUVqQyxNQUFNLFlBQVksR0FBRyxJQUFJLGdDQUFjLENBQUMsRUFBRSxDQUFDLENBQUM7QUFDNUMsTUFBTSxTQUFTLEdBQUcscUNBQXNCLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDO0FBQzVELE1BQU0sY0FBYyxHQUFHLElBQUksZ0NBQWMsQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUM5QyxNQUFNLFlBQVksR0FBRyxJQUFJLDRCQUFZLENBQUMsRUFBRSxDQUFDLENBQUM7QUFFMUMsTUFBTSxVQUFVLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxVQUFXLENBQUM7QUFDM0MsTUFBTSxnQkFBZ0IsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLGdCQUFpQixDQUFDO0FBQ3ZELE1BQU0sa0NBQWtDLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxrQ0FBbUMsQ0FBQztBQXVCM0Y7O0dBRUc7QUFDSCxLQUFLLFVBQVUsVUFBVSxDQUFDLElBQVksRUFBRSxLQUFhLEVBQUUsT0FBZTtJQUNwRSxNQUFNLFVBQVUsR0FBRyxHQUFHLElBQUksS0FBSyxLQUFLLEtBQUssT0FBTyxFQUFFLENBQUM7SUFFbkQsSUFBSSxDQUFDO1FBQ0gsTUFBTSxPQUFPLEdBQUcsSUFBSSxnREFBOEIsQ0FBQztZQUNqRCxTQUFTLEVBQUUsZ0JBQWdCO1lBQzNCLElBQUksRUFBRSxVQUFVO1lBQ2hCLFVBQVUsRUFBRSxDQUFDO1NBQ2QsQ0FBQyxDQUFDO1FBQ0gsTUFBTSxRQUFRLEdBQUcsTUFBTSxjQUFjLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBRXBELElBQUksUUFBUSxD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UmVzdWx0IH0gZnJvbSAnYXdzLWxhbWJkYSc7XG5pbXBvcnQgeyBEeW5hbW9EQkNsaWVudCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1keW5hbW9kYic7XG5pbXBvcnQgeyBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LCBQdXRDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvbGliLWR5bmFtb2RiJztcbmltcG9ydCB7IExvY2F0aW9uQ2xpZW50LCBTZWFyY2hQbGFjZUluZGV4Rm9yVGV4dENvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtbG9jYXRpb24nO1xuaW1wb3J0IHsgTGFtYmRhQ2xpZW50LCBJbnZva2VDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LWxhbWJkYSc7XG5pbXBvcnQgdHpsb29rdXAgZnJvbSAndHotbG9va3VwJztcblxuY29uc3QgZHluYW1vQ2xpZW50ID0gbmV3IER5bmFtb0RCQ2xpZW50KHt9KTtcbmNvbnN0IGRvY0NsaWVudCA9IER5bmFtb0RCRG9jdW1lbnRDbGllbnQuZnJvbShkeW5hbW9DbGllbnQpO1xuY29uc3QgbG9jYXRpb25DbGllbnQgPSBuZXcgTG9jYXRpb25DbGllbnQoe30pO1xuY29uc3QgbGFtYmRhQ2xpZW50ID0gbmV3IExhbWJkYUNsaWVudCh7fSk7XG5cbmNvbnN0IFRBQkxFX05BTUUgPSBwcm9jZXNzLmVudi5UQUJMRV9OQU1FITtcbmNvbnN0IFBMQUNFX0lOREVYX05BTUUgPSBwcm9jZXNzLmVudi5QTEFDRV9JTkRFWF9OQU1FITtcbmNvbnN0IEdFTkVSQVRFX05BVEFMX0NIQVJUX0ZVTkNUSU9OX05BTUUgPSBwcm9jZXNzLmVudi5HRU5FUkFURV9OQVRBTF9DSEFSVF9GVU5DVElPTl9OQU1FITtcblxuaW50ZXJmYWNlIFByb2ZpbGVEYXRhIHtcbiAgZW1haWw6IHN0cmluZztcbiAgYmlydGhOYW1lOiBzdHJpbmc7XG4gIGJpcnRoRGF0ZTogc3RyaW5nO1xuICBiaXJ0aFRpbWU6IHN0cmluZztcbiAgYmlydGhDaXR5OiBzdHJpbmc7XG4gIGJpcnRoU3RhdGU6IHN0cmluZztcbiAgYmlydGhDb3VudHJ5OiBzdHJpbmc7XG4gIGJpcnRoTGF0aXR1ZGU/OiBudW1iZXI7XG4gIGJpcnRoTG9uZ2l0dWRlPzogbnVtYmVyO1xuICBpYW5hVGltZVpvbmU/OiBzdHJpbmc7XG4gIHN0YW5kYXJkaXplZExvY2F0aW9uTmFtZT86IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIEdlb0RhdGEge1xuICBsYXRpdHVkZTogbnVtYmVyO1xuICBsb25naXR1ZGU6IG51bWJlcjtcbiAgaWFuYVRpbWVab25lOiBzdHJpbmc7XG4gIHN0YW5kYXJkaXplZExvY2F0aW9uTmFtZTogc3RyaW5nO1xufVxuXG4vKipcbiAqIEdlb2NvZGVzIGEgbG9jYXRpb24gYW5kIHJldHVybnMgaXRzIGNvb3JkaW5hdGVzLCB0aW1lIHpvbmUsIGFuZCBzdGFuZGFyZGl6ZWQgbmFtZS5cbiAqL1xuYXN5bmMgZnVuY3Rpb24gZ2V0R2VvRGF0YShjaXR5OiBzdHJpbmcsIHN0YXRlOiBzdHJpbmcsIGNvdW50cnk6IHN0cmluZyk6IFByb21pc2U8R2VvRGF0YSB8IG51bGw+IHtcbiAgY29uc3Qgc2VhcmNoVGV4dCA9IGAke2NpdHl9LCAke3N0YXRlfSwgJHtjb3VudHJ5fWA7XG5cbiAgdHJ5IHtcbiAgICBjb25zdCBjb21tYW5kID0gbmV3IFNlYXJjaFBsYWNlSW5kZXhGb3JUZXh0Q29tbWFuZCh7XG4gICAgICBJbmRleE5hbWU6IFBMQUNFX0lOREVYX05BTUUsXG4gICAgICBUZXh0OiBzZWFyY2hUZXh0LFxuICAgICAgTWF4UmVzdWx0czogMSxcbiAgICB9KTtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGxvY2F0aW9uQ2xpZW50LnNlbmQoY29tbWFuZCk7XG5cbiAgICBpZiAocmVzcG9uc2UuUmVzdWx0cyAmJiByZXNwb25zZS5SZXN1bHRzLmxlbmd0aCA+IDAgJiYgcmVzcG9uc2UuUmVzdWx0c1swXS5QbGFjZSkge1xuICAgICAgY29uc3QgcGxhY2UgPSByZXNwb25zZS5SZXN1bHRzWzBdLlBsYWNlO1xuICAgICAgY29uc3QgW2xvbmdpdHVkZSwgbGF0aXR1ZGVdID0gcGxhY2UuR2VvbWV0cnk/LlBvaW50IHx8IFtdO1xuXG4gICAgICBpZiAobG9uZ2l0dWRlID09PSB1bmRlZmluZWQgfHwgbGF0aXR1ZGUgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIH1cblxuICAgICAgY29uc3QgaWFuYVRpbWVab25lID0gdHpsb29rdXAobGF0aXR1ZGUsIGxvbmdpdHVkZSk7XG4gICAgICBjb25zdCBzdGFuZGFyZGl6ZWRMb2NhdGlvbk5hbWUgPSBwbGFjZS5MYWJlbCB8fCBzZWFyY2hUZXh0O1xuXG4gICAgICByZXR1cm4ge1xuICAgICAgICBsYXRpdHVkZTogcGFyc2VGbG9hdChsYXRpdHVkZS50b0ZpeGVkKDYpKSxcbiAgICAgICAgbG9uZ2l0dWRlOiBwYXJzZUZsb2F0KGxvbmdpdHVkZS50b0ZpeGVkKDYpKSxcbiAgICAgICAgaWFuYVRpbWVab25lLFxuICAgICAgICBzdGFuZGFyZGl6ZWRMb2NhdGlvbk5hbWUsXG4gICAgICB9O1xuICAgIH1cbiAgICByZXR1cm4gbnVsbDtcbiAgfSBjYXRjaCB7XG4gICAgLy8gUmUtdGhyb3cgb3IgaGFuZGxlIGFzIGEgbm9uLWJsb2NraW5nIGVycm9yXG4gICAgdGhyb3cgbmV3IEVycm9yKCdGYWlsZWQgdG8gZ2VvY29kZSBsb2NhdGlvbiBkdWUgdG8gYSBzZXJ2aWNlIGVycm9yLicpO1xuICB9XG59XG5cbmludGVyZmFjZSBWYWxpZGF0aW9uRXJyb3Ige1xuICBmaWVsZDogc3RyaW5nO1xuICBtZXNzYWdlOiBzdHJpbmc7XG59XG5cbmNvbnN0IHZhbGlkYXRlQmlydGhEYXRhID0gKGRhdGE6IGFueSk6IFZhbGlkYXRpb25FcnJvcltdID0+IHtcbiAgY29uc3QgZXJyb3JzOiBWYWxpZGF0aW9uRXJyb3JbXSA9IFtdO1xuXG4gIC8vIEVtYWlsIHZhbGlkYXRpb25cbiAgaWYgKCFkYXRhLmVtYWlsIHx8IHR5cGVvZiBkYXRhLmVtYWlsICE9PSAnc3RyaW5nJykge1xuICAgIGVycm9ycy5wdXNoKHsgZmllbGQ6ICdlbWFpbCcsIG1lc3NhZ2U6ICdFbWFpbCBpcyByZXF1aXJlZCcgfSk7XG4gIH0gZWxzZSBpZiAoIS9eW15cXHNAXStAW15cXHNAXStcXC5bXlxcc0BdKyQvLnRlc3QoZGF0YS5lbWFpbCkpIHtcbiAgICBlcnJvcnMucHVzaCh7IGZpZWxkOiAnZW1haWwnLCBtZXNzYWdlOiAnSW52YWxpZCBlbWFpbCBmb3JtYXQnIH0pO1xuICB9XG5cbiAgLy8gQmlydGggbmFtZSB2YWxpZGF0aW9uXG4gIGlmICghZGF0YS5iaXJ0aE5hbWUgfHwgdHlwZW9mIGRhdGEuYmlydGhOYW1lICE9PSAnc3RyaW5nJykge1xuICAgIGVycm9ycy5wdXNoKHsgZmllbGQ6ICdiaXJ0aE5hbWUnLCBtZXNzYWdlOiAnQmlydGggbmFtZSBpcyByZXF1aXJlZCcgfSk7XG4gIH0gZWxzZSBpZiAoZGF0YS5iaXJ0aE5hbWUudHJpbSgpLmxlbmd0aCA9PT0gMCB8fCBkYXRhLmJpcnRoTmFtZS5sZW5ndGggPiAyNTYpIHtcbiAgICBlcnJvcnMucHVzaCh7IGZpZWxkOiAnYmlydGhOYW1lJywgbWVzc2FnZTogJ0JpcnRoIG5hbWUgbXVzdCBiZSAxLTI1NiBjaGFyYWN0ZXJzJyB9KTtcbiAgfSBlbHNlIGlmICghL15bYS16QS1aXFxzXFwtJ10rJC8udGVzdChkYXRhLmJpcnRoTmFtZSkpIHtcbiAgICBlcnJvcnMucHVzaCh7IGZpZWxkOiAnYmlydGhOYW1lJywgbWVzc2FnZTogJ0JpcnRoIG5hbWUgY29udGFpbnMgaW52YWxpZCBjaGFyYWN0ZXJzJyB9KTtcbiAgfVxuXG4gIC8vIEJpcnRoIGRhdGUgdmFsaWRhdGlvblxuICBpZiAoIWRhdGEuYmlydGhEYXRlIHx8IHR5cGVvZiBkYXRhLmJpcnRoRGF0ZSAhPT0gJ3N0cmluZycpIHtcbiAgICBlcnJvcnMucHVzaCh7IGZpZWxkOiAnYmlydGhEYXRlJywgbWVzc2FnZTogJ0JpcnRoIGRhdGUgaXMgcmVxdWlyZWQnIH0pO1xuICB9IGVsc2UgaWYgKCEvXlxcZHs0fS1cXGR7Mn0tXFxkezJ9JC8udGVzdChkYXRhLmJpcnRoRGF0ZSkpIHtcbiAgICBlcnJvcnMucHVzaCh7IGZpZWxkOiAnYmlydGhEYXRlJywgbWVzc2FnZTogJ0JpcnRoIGRhdGUgbXVzdCBiZSBpbiBZWVlZLU1NLUREIGZvcm1hdCcgfSk7XG4gIH0gZWxzZSB7XG4gICAgY29uc3QgZGF0ZSA9IG5ldyBEYXRlKGRhdGEuYmlydGhEYXRlKTtcbiAgICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpO1xuICAgIGNvbnN0IG1pbkRhdGUgPSBuZXcgRGF0ZSgnMTkwMC0wMS0wMScpO1xuXG4gICAgaWYgKGlzTmFOKGRhdGUuZ2V0VGltZSgpKSkge1xuICAgICAgZXJyb3JzLnB1c2goeyBmaWVsZDogJ2JpcnRoRGF0ZScsIG1lc3NhZ2U6ICdJbnZhbGlkIGJpcnRoIGRhdGUnIH0pO1xuICAgIH0gZWxzZSBpZiAoZGF0ZSA+IG5vdykge1xuICAgICAgZXJyb3JzLnB1c2goeyBmaWVsZDogJ2JpcnRoRGF0ZScsIG1lc3NhZ2U6ICdCaXJ0aCBkYXRlIGNhbm5vdCBiZSBpbiB0aGUgZnV0dXJlJyB9KTtcbiAgICB9IGVsc2UgaWYgKGRhdGUgPCBtaW5EYXRlKSB7XG4gICAgICBlcnJvcnMucHVzaCh7IGZpZWxkOiAnYmlydGhEYXRlJywgbWVzc2FnZTogJ0JpcnRoIGRhdGUgY2Fubm90IGJlIGJlZm9yZSAxOTAwJyB9KTtcbiAgICB9XG4gIH1cblxuICAvLyBCaXJ0aCB0aW1lIHZhbGlkYXRpb24gKHJlcXVpcmVkKVxuICBpZiAoIWRhdGEuYmlydGhUaW1lIHx8IHR5cGVvZiBkYXRhLmJpcnRoVGltZSAhPT0gJ3N0cmluZycpIHtcbiAgICBlcnJvcnMucHVzaCh7IGZpZWxkOiAnYmlydGhUaW1lJywgbWVzc2FnZTogJ0JpcnRoIHRpbWUgaXMgcmVxdWlyZWQnIH0pO1xuICB9IGVsc2UgaWYgKCEvXihbMC0xXT9bMC05XXwyWzAtM10pOlswLTVdWzAtOV0kLy50ZXN0KGRhdGEuYmlydGhUaW1lKSkge1xuICAgIGVycm9ycy5wdXNoKHsgZmllbGQ6ICdiaXJ0aFRpbWUnLCBtZXNzYWdlOiAnQmlydGggdGltZSBtdXN0IGJlIGluIEhIOk1NIGZvcm1hdCAoMjQtaG91ciknIH0pO1xuICB9XG5cbiAgLy8gTG9jYXRpb24gdmFsaWRhdGlvblxuICBjb25zdCBsb2NhdGlvblJlZ2V4ID0gL15bYS16QS1aXFxzXFwtJyxcXC5dKyQvO1xuXG4gIGlmICghZGF0YS5iaXJ0aENpdHkgfHwgdHlwZW9mIGRhdGEuYmlydGhDaXR5ICE9PSAnc3RyaW5nJykge1xuICAgIGVycm9ycy5wdXNoKHsgZmllbGQ6ICdiaXJ0aENpdHknLCBtZXNzYWdlOiAnQmlydGggY2l0eSBpcyByZXF1aXJlZCcgfSk7XG4gIH0gZWxzZSBpZiAoZGF0YS5iaXJ0aENpdHkudHJpbSgpLmxlbmd0aCA9PT0gMCB8fCBkYXRhLmJpcnRoQ2l0eS5sZW5ndGggPiAxMDApIHtcbiAgICBlcnJvcnMucHVzaCh7IGZpZWxkOiAnYmlydGhDaXR5JywgbWVzc2FnZTogJ0JpcnRoIGNpdHkgbXVzdCBiZSAxLTEwMCBjaGFyYWN0ZXJzJyB9KTtcbiAgfSBlbHNlIGlmICghbG9jYXRpb25SZWdleC50ZXN0KGRhdGEuYmlydGhDaXR5KSkge1xuICAgIGVycm9ycy5wdXNoKHsgZmllbGQ6ICdiaXJ0aENpdHknLCBtZXNzYWdlOiAnQmlydGggY2l0eSBjb250YWlucyBpbnZhbGlkIGNoYXJhY3RlcnMnIH0pO1xuICB9XG5cbiAgaWYgKCFkYXRhLmJpcnRoU3RhdGUgfHwgdHlwZW9mIGRhdGEuYmlydGhTdGF0ZSAhPT0gJ3N0cmluZycpIHtcbiAgICBlcnJvcnMucHVzaCh7IGZpZWxkOiAnYmlydGhTdGF0ZScsIG1lc3NhZ2U6ICdCaXJ0aCBzdGF0ZS9wcm92aW5jZSBpcyByZXF1aXJlZCcgfSk7XG4gIH0gZWxzZSBpZiAoZGF0YS5iaXJ0aFN0YXRlLnRyaW0oKS5sZW5ndGggPT09IDAgfHwgZGF0YS5iaXJ0aFN0YXRlLmxlbmd0aCA+IDEwMCkge1xuICAgIGVycm9ycy5wdXNoKHsgZmllbGQ6ICdiaXJ0aFN0YXRlJywgbWVzc2FnZTogJ0JpcnRoIHN0YXRlIG11c3QgYmUgMS0xMDAgY2hhcmFjdGVycycgfSk7XG4gIH0gZWxzZSBpZiAoIWxvY2F0aW9uUmVnZXgudGVzdChkYXRhLmJpcnRoU3RhdGUpKSB7XG4gICAgZXJyb3JzLnB1c2goeyBmaWVsZDogJ2JpcnRoU3RhdGUnLCBtZXNzYWdlOiAnQmlydGggc3RhdGUgY29udGFpbnMgaW52YWxpZCBjaGFyYWN0ZXJzJyB9KTtcbiAgfVxuXG4gIGlmICghZGF0YS5iaXJ0aENvdW50cnkgfHwgdHlwZW9mIGRhdGEuYmlydGhDb3VudHJ5ICE9PSAnc3RyaW5nJykge1xuICAgIGVycm9ycy5wdXNoKHsgZmllbGQ6ICdiaXJ0aENvdW50cnknLCBtZXNzYWdlOiAnQmlydGggY291bnRyeSBpcyByZXF1aXJlZCcgfSk7XG4gIH0gZWxzZSBpZiAoZGF0YS5iaXJ0aENvdW50cnkudHJpbSgpLmxlbmd0aCA9PT0gMCB8fCBkYXRhLmJpcnRoQ291bnRyeS5sZW5ndGggPiAxMDApIHtcbiAgICBlcnJvcnMucHVzaCh7IGZpZWxkOiAnYmlydGhDb3VudHJ5JywgbWVzc2FnZTogJ0JpcnRoIGNvdW50cnkgbXVzdCBiZSAxLTEwMCBjaGFyYWN0ZXJzJyB9KTtcbiAgfSBlbHNlIGlmICghbG9jYXRpb25SZWdleC50ZXN0KGRhdGEuYmlydGhDb3VudHJ5KSkge1xuICAgIGVycm9ycy5wdXNoKHsgZmllbGQ6ICdiaXJ0aENvdW50cnknLCBtZXNzYWdlOiAnQmlydGggY291bnRyeSBjb250YWlucyBpbnZhbGlkIGNoYXJhY3RlcnMnIH0pO1xuICB9XG5cbiAgLy8gRnV0dXJlIGxhdC9sb25nIHZhbGlkYXRpb24gKHdoZW4gcHJvdmlkZWQpXG4gIGlmIChkYXRhLmJpcnRoTGF0aXR1ZGUgIT09IHVuZGVmaW5lZCkge1xuICAgIGNvbnN0IGxhdCA9IHBhcnNlRmxvYXQoZGF0YS5iaXJ0aExhdGl0dWRlKTtcbiAgICBpZiAoaXNOYU4obGF0KSB8fCBsYXQgPCAtOTAgfHwgbGF0ID4gOTApIHtcbiAgICAgIGVycm9ycy5wdXNoKHsgZmllbGQ6ICdiaXJ0aExhdGl0dWRlJywgbWVzc2FnZTogJ0ludmFsaWQgbGF0aXR1ZGUnIH0pO1xuICAgIH1cbiAgfVxuXG4gIGlmIChkYXRhLmJpcnRoTG9uZ2l0dWRlICE9PSB1bmRlZmluZWQpIHtcbiAgICBjb25zdCBsbmcgPSBwYXJzZUZsb2F0KGRhdGEuYmlydGhMb25naXR1ZGUpO1xuICAgIGlmIChpc05hTihsbmcpIHx8IGxuZyA8IC0xODAgfHwgbG5nID4gMTgwKSB7XG4gICAgICBlcnJvcnMucHVzaCh7IGZpZWxkOiAnYmlydGhMb25naXR1ZGUnLCBtZXNzYWdlOiAnSW52YWxpZCBsb25naXR1ZGUnIH0pO1xuICAgIH1cbiAgfVxuXG4gIHJldHVybiBlcnJvcnM7XG59O1xuXG5leHBvcnQgY29uc3QgaGFuZGxlciA9IGFzeW5jIChldmVudDogQVBJR2F0ZXdheVByb3h5RXZlbnQpOiBQcm9taXNlPEFQSUdhdGV3YXlQcm94eVJlc3VsdD4gPT4ge1xuICB0cnkge1xuICAgIC8vIEV4dHJhY3QgdXNlcklkIGZyb20gcGF0aCBwYXJhbWV0ZXJzXG4gICAgY29uc3QgdXNlcklkID0gZXZlbnQucGF0aFBhcmFtZXRlcnM/LnVzZXJJZDtcbiAgICBpZiAoIXVzZXJJZCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNDAwLFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogJyonLFxuICAgICAgICB9LFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnTWlzc2luZyB1c2VySWQgcGFyYW1ldGVyJyB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gRXh0cmFjdCB1c2VyIHN1YiBmcm9tIGF1dGhvcml6ZXIgY29udGV4dFxuICAgIGNvbnN0IGF1dGhvcml6ZXJVc2VySWQgPSBldmVudC5yZXF1ZXN0Q29udGV4dC5hdXRob3JpemVyPy5jbGFpbXM/LnN1YjtcblxuICAgIGlmICghYXV0aG9yaXplclVzZXJJZCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNDAxLFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogJyonLFxuICAgICAgICB9LFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnVW5hdXRob3JpemVkJyB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gVmVyaWZ5IHVzZXIgY2FuIG9ubHkgdXBkYXRlIHRoZWlyIG93biBwcm9maWxlXG4gICAgaWYgKHVzZXJJZCAhPT0gYXV0aG9yaXplclVzZXJJZCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNDAzLFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogJyonLFxuICAgICAgICB9LFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnRm9yYmlkZGVuJyB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gUGFyc2UgcmVxdWVzdCBib2R5XG4gICAgbGV0IHByb2ZpbGVEYXRhOiBQcm9maWxlRGF0YTtcbiAgICB0cnkge1xuICAgICAgcHJvZmlsZURhdGEgPSBKU09OLnBhcnNlKGV2ZW50LmJvZHkgfHwgJ3t9Jyk7XG4gICAgfSBjYXRjaCB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA0MDAsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiAnKicsXG4gICAgICAgIH0sXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICdJbnZhbGlkIEpTT04gYm9keScgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIEdlb2NvZGUgbG9jYXRpb25cbiAgICBjb25zdCBnZW9EYXRhID0gYXdhaXQgZ2V0R2VvRGF0YShcbiAgICAgIHByb2ZpbGVEYXRhLmJpcnRoQ2l0eSxcbiAgICAgIHByb2ZpbGVEYXRhLmJpcnRoU3RhdGUsXG4gICAgICBwcm9maWxlRGF0YS5iaXJ0aENvdW50cnksXG4gICAgKTtcblxuICAgIGlmICghZ2VvRGF0YSkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNDAwLFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogJyonLFxuICAgICAgICB9LFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgZXJyb3I6ICdWYWxpZGF0aW9uIGZhaWxlZCcsXG4gICAgICAgICAgdmFsaWRhdGlvbkVycm9yczogW1xuICAgICAgICAgICAge1xuICAgICAgICAgICAgICBmaWVsZDogJ2JpcnRoQ2l0eScsXG4gICAgICAgICAgICAgIG1lc3NhZ2U6ICdDb3VsZCBub3QgZmluZCBhIHZhbGlkIGxvY2F0aW9uIGZvciB0aGUgY2l0eSwgc3RhdGUsIGFuZCBjb3VudHJ5IHByb3ZpZGVkLicsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgIF0sXG4gICAgICAgIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBBZGQgZ2VvIGRhdGEgdG8gcHJvZmlsZVxuICAgIHByb2ZpbGVEYXRhLmJpcnRoTGF0aXR1ZGUgPSBnZW9EYXRhLmxhdGl0dWRlO1xuICAgIHByb2ZpbGVEYXRhLmJpcnRoTG9uZ2l0dWRlID0gZ2VvRGF0YS5sb25naXR1ZGU7XG4gICAgcHJvZmlsZURhdGEuaWFuYVRpbWVab25lID0gZ2VvRGF0YS5pYW5hVGltZVpvbmU7XG4gICAgcHJvZmlsZURhdGEuc3RhbmRhcmRpemVkTG9jYXRpb25OYW1lID0gZ2VvRGF0YS5zdGFuZGFyZGl6ZWRMb2NhdGlvbk5hbWU7XG5cbiAgICAvLyBWYWxpZGF0ZSBwcm9maWxlIGRhdGFcbiAgICBjb25zdCB2YWxpZGF0aW9uRXJyb3JzID0gdmFsaWRhdGVCaXJ0aERhdGEocHJvZmlsZURhdGEpO1xuICAgIGlmICh2YWxpZGF0aW9uRXJyb3JzLmxlbmd0aCA+IDApIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMCxcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6ICcqJyxcbiAgICAgICAgfSxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgIGVycm9yOiAnVmFsaWRhdGlvbiBmYWlsZWQnLFxuICAgICAgICAgIHZhbGlkYXRpb25FcnJvcnMsXG4gICAgICAgIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBQcmVwYXJlIGl0ZW0gZm9yIER5bmFtb0RCXG4gICAgY29uc3Qgbm93ID0gbmV3IERhdGUoKS50b0lTT1N0cmluZygpO1xuXG4gICAgLy8gQnVpbGQgcHJvZmlsZSBvYmplY3Qgd2l0aG91dCB1bmRlZmluZWQgdmFsdWVzXG4gICAgY29uc3QgcHJvZmlsZTogYW55ID0ge1xuICAgICAgYmlydGhOYW1lOiBwcm9maWxlRGF0YS5iaXJ0aE5hbWUudHJpbSgpLFxuICAgICAgYmlydGhEYXRlOiBwcm9maWxlRGF0YS5iaXJ0aERhdGUsXG4gICAgICBiaXJ0aFRpbWU6IHByb2ZpbGVEYXRhLmJpcnRoVGltZS50cmltKCksXG4gICAgICBiaXJ0aENpdHk6IHByb2ZpbGVEYXRhLmJpcnRoQ2l0eS50cmltKCksXG4gICAgICBiaXJ0aFN0YXRlOiBwcm9maWxlRGF0YS5iaXJ0aFN0YXRlLnRyaW0oKSxcbiAgICAgIGJpcnRoQ291bnRyeTogcHJvZmlsZURhdGEuYmlydGhDb3VudHJ5LnRyaW0oKSxcbiAgICB9O1xuXG4gICAgLy8gT25seSBhZGQgb3B0aW9uYWwgZmllbGRzIGlmIHRoZXkgaGF2ZSB2YWx1ZXNcblxuICAgIGlmIChwcm9maWxlRGF0YS5iaXJ0aExhdGl0dWRlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIHByb2ZpbGUuYmlydGhMYXRpdHVkZSA9IHByb2ZpbGVEYXRhLmJpcnRoTGF0aXR1ZGU7XG4gICAgfVxuXG4gICAgaWYgKHByb2ZpbGVEYXRhLmJpcnRoTG9uZ2l0dWRlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIHByb2ZpbGUuYmlydGhMb25naXR1ZGUgPSBwcm9maWxlRGF0YS5iaXJ0aExvbmdpdHVkZTtcbiAgICB9XG5cbiAgICBpZiAocHJvZmlsZURhdGEuaWFuYVRpbWVab25lKSB7XG4gICAgICBwcm9maWxlLmlhbmFUaW1lWm9uZSA9IHByb2ZpbGVEYXRhLmlhbmFUaW1lWm9uZTtcbiAgICB9XG5cbiAgICBpZiAocHJvZmlsZURhdGEuc3RhbmRhcmRpemVkTG9jYXRpb25OYW1lKSB7XG4gICAgICBwcm9maWxlLnN0YW5kYXJkaXplZExvY2F0aW9uTmFtZSA9IHByb2ZpbGVEYXRhLnN0YW5kYXJkaXplZExvY2F0aW9uTmFtZTtcbiAgICB9XG5cbiAgICBjb25zdCBpdGVtID0ge1xuICAgICAgdXNlcklkLFxuICAgICAgY3JlYXRlZEF0OiAnUFJPRklMRScsIC8vIEZpeGVkIHNvcnQga2V5IGZvciBwcm9maWxlIGRhdGFcbiAgICAgIGVtYWlsOiBwcm9maWxlRGF0YS5lbWFpbCxcbiAgICAgIHByb2ZpbGUsXG4gICAgICBvbmJvYXJkaW5nQ29tcGxldGVkOiB0cnVlLFxuICAgICAgdXBkYXRlZEF0OiBub3csXG4gICAgICBmaXJzdENyZWF0ZWRBdDogbm93LCAvLyBXaWxsIGJlIG92ZXJ3cml0dGVuIGlmIHByb2ZpbGUgYWxyZWFkeSBleGlzdHNcbiAgICB9O1xuXG4gICAgLy8gU2F2ZSB0byBEeW5hbW9EQlxuICAgIGF3YWl0IGRvY0NsaWVudC5zZW5kKFxuICAgICAgbmV3IFB1dENvbW1hbmQoe1xuICAgICAgICBUYWJsZU5hbWU6IFRBQkxFX05BTUUsXG4gICAgICAgIEl0ZW06IGl0ZW0sXG4gICAgICAgIENvbmRpdGlvbkV4cHJlc3Npb246ICdhdHRyaWJ1dGVfbm90X2V4aXN0cyh1c2VySWQpIE9SIGF0dHJpYnV0ZV9leGlzdHModXNlcklkKScsXG4gICAgICB9KSxcbiAgICApO1xuXG4gICAgLy8gQXN5bmNocm9ub3VzbHkgaW52b2tlIHRoZSBuYXRhbCBjaGFydCBnZW5lcmF0aW9uIExhbWJkYVxuICAgIGNvbnN0IGludm9jYXRpb25QYXlsb2FkID0ge1xuICAgICAgdXNlcklkLFxuICAgICAgYmlydGhEYXRlOiBwcm9maWxlRGF0YS5iaXJ0aERhdGUsXG4gICAgICBiaXJ0aFRpbWU6IHByb2ZpbGVEYXRhLmJpcnRoVGltZSxcbiAgICAgIGxhdGl0dWRlOiBwcm9maWxlRGF0YS5iaXJ0aExhdGl0dWRlLFxuICAgICAgbG9uZ2l0dWRlOiBwcm9maWxlRGF0YS5iaXJ0aExvbmdpdHVkZSxcbiAgICAgIGlhbmFUaW1lWm9uZTogcHJvZmlsZURhdGEuaWFuYVRpbWVab25lLFxuICAgIH07XG5cbiAgICBjb25zb2xlLmluZm8oJ0ludm9raW5nIG5hdGFsIGNoYXJ0IGdlbmVyYXRpb24gd2l0aCBwYXlsb2FkOicsIGludm9jYXRpb25QYXlsb2FkKTtcbiAgICBjb25zb2xlLmluZm8oJ0Z1bmN0aW9uIG5hbWU6JywgR0VORVJBVEVfTkFUQUxfQ0hBUlRfRlVOQ1RJT05fTkFNRSk7XG5cbiAgICB0cnkge1xuICAgICAgY29uc3QgaW52b2NhdGlvblJlc3BvbnNlID0gYXdhaXQgbGFtYmRhQ2xpZW50LnNlbmQoXG4gICAgICAgIG5ldyBJbnZva2VDb21tYW5kKHtcbiAgICAgICAgICBGdW5jdGlvbk5hbWU6IEdFTkVSQVRFX05BVEFMX0NIQVJUX0ZVTkNUSU9OX05BTUUsXG4gICAgICAgICAgSW52b2NhdGlvblR5cGU6ICdFdmVudCcsIC8vIEFzeW5jaHJvbm91cyBpbnZvY2F0aW9uXG4gICAgICAgICAgUGF5bG9hZDogSlNPTi5zdHJpbmdpZnkoaW52b2NhdGlvblBheWxvYWQpLFxuICAgICAgICB9KSxcbiAgICAgICk7XG5cbiAgICAgIGNvbnNvbGUuaW5mbygnTmF0YWwgY2hhcnQgZ2VuZXJhdGlvbiBpbnZva2VkIHN1Y2Nlc3NmdWxseTonLCB7XG4gICAgICAgIHN0YXR1c0NvZGU6IGludm9jYXRpb25SZXNwb25zZS5TdGF0dXNDb2RlLFxuICAgICAgICBmdW5jdGlvbkVycm9yOiBpbnZvY2F0aW9uUmVzcG9uc2UuRnVuY3Rpb25FcnJvcixcbiAgICAgIH0pO1xuICAgIH0gY2F0Y2ggKGludm9jYXRpb25FcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIGludm9rZSBuYXRhbCBjaGFydCBnZW5lcmF0aW9uOicsIGludm9jYXRpb25FcnJvcik7XG4gICAgICAvLyBEb24ndCBmYWlsIHRoZSBwcm9maWxlIHVwZGF0ZSBpZiBuYXRhbCBjaGFydCBnZW5lcmF0aW9uIGZhaWxzXG4gICAgICAvLyBUaGUgdXNlciBjYW4gc3RpbGwgc2VlIHRoZWlyIHByb2ZpbGUgZXZlbiBpZiB0aGUgY2hhcnQgaXNuJ3QgcmVhZHlcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgc3RhdHVzQ29kZTogMjAwLFxuICAgICAgaGVhZGVyczoge1xuICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogJyonLFxuICAgICAgfSxcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgbWVzc2FnZTogJ1Byb2ZpbGUgdXBkYXRlZCBzdWNjZXNzZnVsbHknLFxuICAgICAgICBwcm9maWxlOiBpdGVtLFxuICAgICAgfSksXG4gICAgfTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciBpbiB1cGRhdGUtdXNlci1wcm9maWxlIGhhbmRsZXI6JywgZXJyb3IpO1xuICAgIHJldHVybiB7XG4gICAgICBzdGF0dXNDb2RlOiA1MDAsXG4gICAgICBoZWFkZXJzOiB7XG4gICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiAnKicsXG4gICAgICB9LFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ0ludGVybmFsIHNlcnZlciBlcnJvcicgfSksXG4gICAgfTtcbiAgfVxufTtcbiJdfQ==