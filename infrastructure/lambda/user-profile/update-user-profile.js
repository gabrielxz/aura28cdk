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
    catch (error) {
        // Log the error for debugging but don't crash the application
        console.error('Failed to geocode location:', error);
        return null;
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXBkYXRlLXVzZXItcHJvZmlsZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInVwZGF0ZS11c2VyLXByb2ZpbGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQ0EsOERBQTBEO0FBQzFELHdEQUEyRTtBQUMzRSw4REFBMEY7QUFDMUYsMERBQXFFO0FBQ3JFLDBEQUFpQztBQUVqQyxNQUFNLFlBQVksR0FBRyxJQUFJLGdDQUFjLENBQUMsRUFBRSxDQUFDLENBQUM7QUFDNUMsTUFBTSxTQUFTLEdBQUcscUNBQXNCLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDO0FBQzVELE1BQU0sY0FBYyxHQUFHLElBQUksZ0NBQWMsQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUM5QyxNQUFNLFlBQVksR0FBRyxJQUFJLDRCQUFZLENBQUMsRUFBRSxDQUFDLENBQUM7QUFFMUMsTUFBTSxVQUFVLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxVQUFXLENBQUM7QUFDM0MsTUFBTSxnQkFBZ0IsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLGdCQUFpQixDQUFDO0FBQ3ZELE1BQU0sa0NBQWtDLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxrQ0FBbUMsQ0FBQztBQXVCM0Y7O0dBRUc7QUFDSCxLQUFLLFVBQVUsVUFBVSxDQUFDLElBQVksRUFBRSxLQUFhLEVBQUUsT0FBZTtJQUNwRSxNQUFNLFVBQVUsR0FBRyxHQUFHLElBQUksS0FBSyxLQUFLLEtBQUssT0FBTyxFQUFFLENBQUM7SUFFbkQsSUFBSSxDQUFDO1FBQ0gsTUFBTSxPQUFPLEdBQUcsSUFBSSxnREFBOEIsQ0FBQztZQUNqRCxTQUFTLEVBQUUsZ0JBQWdCO1lBQzNCLElBQUksRUFBRSxVQUFVO1lBQ2hCLFVBQVUsRUFBRSxDQUFDO1NBQ2QsQ0FBQyxDQUFDO1FBQ0gsTUFBTSxRQUFRLEdBQUcsTUFBTSxjQUFjLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBRXBELElBQUksUUFBUSxD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SUdhdGV3YXlQcm94eVJlc3VsdCB9IGZyb20gJ2F3cy1sYW1iZGEnO1xuaW1wb3J0IHsgRHluYW1vREJDbGllbnQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtZHluYW1vZGInO1xuaW1wb3J0IHsgRHluYW1vREJEb2N1bWVudENsaWVudCwgUHV0Q29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2xpYi1keW5hbW9kYic7XG5pbXBvcnQgeyBMb2NhdGlvbkNsaWVudCwgU2VhcmNoUGxhY2VJbmRleEZvclRleHRDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LWxvY2F0aW9uJztcbmltcG9ydCB7IExhbWJkYUNsaWVudCwgSW52b2tlQ29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1sYW1iZGEnO1xuaW1wb3J0IHR6bG9va3VwIGZyb20gJ3R6LWxvb2t1cCc7XG5cbmNvbnN0IGR5bmFtb0NsaWVudCA9IG5ldyBEeW5hbW9EQkNsaWVudCh7fSk7XG5jb25zdCBkb2NDbGllbnQgPSBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LmZyb20oZHluYW1vQ2xpZW50KTtcbmNvbnN0IGxvY2F0aW9uQ2xpZW50ID0gbmV3IExvY2F0aW9uQ2xpZW50KHt9KTtcbmNvbnN0IGxhbWJkYUNsaWVudCA9IG5ldyBMYW1iZGFDbGllbnQoe30pO1xuXG5jb25zdCBUQUJMRV9OQU1FID0gcHJvY2Vzcy5lbnYuVEFCTEVfTkFNRSE7XG5jb25zdCBQTEFDRV9JTkRFWF9OQU1FID0gcHJvY2Vzcy5lbnYuUExBQ0VfSU5ERVhfTkFNRSE7XG5jb25zdCBHRU5FUkFURV9OQVRBTF9DSEFSVF9GVU5DVElPTl9OQU1FID0gcHJvY2Vzcy5lbnYuR0VORVJBVEVfTkFUQUxfQ0hBUlRfRlVOQ1RJT05fTkFNRSE7XG5cbmludGVyZmFjZSBQcm9maWxlRGF0YSB7XG4gIGVtYWlsOiBzdHJpbmc7XG4gIGJpcnRoTmFtZTogc3RyaW5nO1xuICBiaXJ0aERhdGU6IHN0cmluZztcbiAgYmlydGhUaW1lOiBzdHJpbmc7XG4gIGJpcnRoQ2l0eTogc3RyaW5nO1xuICBiaXJ0aFN0YXRlOiBzdHJpbmc7XG4gIGJpcnRoQ291bnRyeTogc3RyaW5nO1xuICBiaXJ0aExhdGl0dWRlPzogbnVtYmVyO1xuICBiaXJ0aExvbmdpdHVkZT86IG51bWJlcjtcbiAgaWFuYVRpbWVab25lPzogc3RyaW5nO1xuICBzdGFuZGFyZGl6ZWRMb2NhdGlvbk5hbWU/OiBzdHJpbmc7XG59XG5cbmludGVyZmFjZSBHZW9EYXRhIHtcbiAgbGF0aXR1ZGU6IG51bWJlcjtcbiAgbG9uZ2l0dWRlOiBudW1iZXI7XG4gIGlhbmFUaW1lWm9uZTogc3RyaW5nO1xuICBzdGFuZGFyZGl6ZWRMb2NhdGlvbk5hbWU6IHN0cmluZztcbn1cblxuLyoqXG4gKiBHZW9jb2RlcyBhIGxvY2F0aW9uIGFuZCByZXR1cm5zIGl0cyBjb29yZGluYXRlcywgdGltZSB6b25lLCBhbmQgc3RhbmRhcmRpemVkIG5hbWUuXG4gKi9cbmFzeW5jIGZ1bmN0aW9uIGdldEdlb0RhdGEoY2l0eTogc3RyaW5nLCBzdGF0ZTogc3RyaW5nLCBjb3VudHJ5OiBzdHJpbmcpOiBQcm9taXNlPEdlb0RhdGEgfCBudWxsPiB7XG4gIGNvbnN0IHNlYXJjaFRleHQgPSBgJHtjaXR5fSwgJHtzdGF0ZX0sICR7Y291bnRyeX1gO1xuXG4gIHRyeSB7XG4gICAgY29uc3QgY29tbWFuZCA9IG5ldyBTZWFyY2hQbGFjZUluZGV4Rm9yVGV4dENvbW1hbmQoe1xuICAgICAgSW5kZXhOYW1lOiBQTEFDRV9JTkRFWF9OQU1FLFxuICAgICAgVGV4dDogc2VhcmNoVGV4dCxcbiAgICAgIE1heFJlc3VsdHM6IDEsXG4gICAgfSk7XG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBsb2NhdGlvbkNsaWVudC5zZW5kKGNvbW1hbmQpO1xuXG4gICAgaWYgKHJlc3BvbnNlLlJlc3VsdHMgJiYgcmVzcG9uc2UuUmVzdWx0cy5sZW5ndGggPiAwICYmIHJlc3BvbnNlLlJlc3VsdHNbMF0uUGxhY2UpIHtcbiAgICAgIGNvbnN0IHBsYWNlID0gcmVzcG9uc2UuUmVzdWx0c1swXS5QbGFjZTtcbiAgICAgIGNvbnN0IFtsb25naXR1ZGUsIGxhdGl0dWRlXSA9IHBsYWNlLkdlb21ldHJ5Py5Qb2ludCB8fCBbXTtcblxuICAgICAgaWYgKGxvbmdpdHVkZSA9PT0gdW5kZWZpbmVkIHx8IGxhdGl0dWRlID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGlhbmFUaW1lWm9uZSA9IHR6bG9va3VwKGxhdGl0dWRlLCBsb25naXR1ZGUpO1xuICAgICAgY29uc3Qgc3RhbmRhcmRpemVkTG9jYXRpb25OYW1lID0gcGxhY2UuTGFiZWwgfHwgc2VhcmNoVGV4dDtcblxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgbGF0aXR1ZGU6IHBhcnNlRmxvYXQobGF0aXR1ZGUudG9GaXhlZCg2KSksXG4gICAgICAgIGxvbmdpdHVkZTogcGFyc2VGbG9hdChsb25naXR1ZGUudG9GaXhlZCg2KSksXG4gICAgICAgIGlhbmFUaW1lWm9uZSxcbiAgICAgICAgc3RhbmRhcmRpemVkTG9jYXRpb25OYW1lLFxuICAgICAgfTtcbiAgICB9XG4gICAgcmV0dXJuIG51bGw7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgLy8gTG9nIHRoZSBlcnJvciBmb3IgZGVidWdnaW5nIGJ1dCBkb24ndCBjcmFzaCB0aGUgYXBwbGljYXRpb25cbiAgICBjb25zb2xlLmVycm9yKCdGYWlsZWQgdG8gZ2VvY29kZSBsb2NhdGlvbjonLCBlcnJvcik7XG4gICAgcmV0dXJuIG51bGw7XG4gIH1cbn1cblxuaW50ZXJmYWNlIFZhbGlkYXRpb25FcnJvciB7XG4gIGZpZWxkOiBzdHJpbmc7XG4gIG1lc3NhZ2U6IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIFVzZXJQcm9maWxlIHtcbiAgYmlydGhOYW1lOiBzdHJpbmc7XG4gIGJpcnRoRGF0ZTogc3RyaW5nO1xuICBiaXJ0aFRpbWU6IHN0cmluZztcbiAgYmlydGhDaXR5OiBzdHJpbmc7XG4gIGJpcnRoU3RhdGU6IHN0cmluZztcbiAgYmlydGhDb3VudHJ5OiBzdHJpbmc7XG4gIGJpcnRoTGF0aXR1ZGU/OiBudW1iZXI7XG4gIGJpcnRoTG9uZ2l0dWRlPzogbnVtYmVyO1xuICBpYW5hVGltZVpvbmU/OiBzdHJpbmc7XG4gIHN0YW5kYXJkaXplZExvY2F0aW9uTmFtZT86IHN0cmluZztcbn1cblxuY29uc3QgdmFsaWRhdGVCaXJ0aERhdGEgPSAoZGF0YTogUHJvZmlsZURhdGEpOiBWYWxpZGF0aW9uRXJyb3JbXSA9PiB7XG4gIGNvbnN0IGVycm9yczogVmFsaWRhdGlvbkVycm9yW10gPSBbXTtcblxuICAvLyBFbWFpbCB2YWxpZGF0aW9uXG4gIGlmICghZGF0YS5lbWFpbCB8fCB0eXBlb2YgZGF0YS5lbWFpbCAhPT0gJ3N0cmluZycpIHtcbiAgICBlcnJvcnMucHVzaCh7IGZpZWxkOiAnZW1haWwnLCBtZXNzYWdlOiAnRW1haWwgaXMgcmVxdWlyZWQnIH0pO1xuICB9IGVsc2UgaWYgKCEvXlteXFxzQF0rQFteXFxzQF0rXFwuW15cXHNAXSskLy50ZXN0KGRhdGEuZW1haWwpKSB7XG4gICAgZXJyb3JzLnB1c2goeyBmaWVsZDogJ2VtYWlsJywgbWVzc2FnZTogJ0ludmFsaWQgZW1haWwgZm9ybWF0JyB9KTtcbiAgfVxuXG4gIC8vIEJpcnRoIG5hbWUgdmFsaWRhdGlvblxuICBpZiAoIWRhdGEuYmlydGhOYW1lIHx8IHR5cGVvZiBkYXRhLmJpcnRoTmFtZSAhPT0gJ3N0cmluZycpIHtcbiAgICBlcnJvcnMucHVzaCh7IGZpZWxkOiAnYmlydGhOYW1lJywgbWVzc2FnZTogJ0JpcnRoIG5hbWUgaXMgcmVxdWlyZWQnIH0pO1xuICB9IGVsc2UgaWYgKGRhdGEuYmlydGhOYW1lLnRyaW0oKS5sZW5ndGggPT09IDAgfHwgZGF0YS5iaXJ0aE5hbWUubGVuZ3RoID4gMjU2KSB7XG4gICAgZXJyb3JzLnB1c2goeyBmaWVsZDogJ2JpcnRoTmFtZScsIG1lc3NhZ2U6ICdCaXJ0aCBuYW1lIG11c3QgYmUgMS0yNTYgY2hhcmFjdGVycycgfSk7XG4gIH0gZWxzZSBpZiAoIS9eW2EtekEtWlxcc1xcLSddKyQvLnRlc3QoZGF0YS5iaXJ0aE5hbWUpKSB7XG4gICAgZXJyb3JzLnB1c2goeyBmaWVsZDogJ2JpcnRoTmFtZScsIG1lc3NhZ2U6ICdCaXJ0aCBuYW1lIGNvbnRhaW5zIGludmFsaWQgY2hhcmFjdGVycycgfSk7XG4gIH1cblxuICAvLyBCaXJ0aCBkYXRlIHZhbGlkYXRpb25cbiAgaWYgKCFkYXRhLmJpcnRoRGF0ZSB8fCB0eXBlb2YgZGF0YS5iaXJ0aERhdGUgIT09ICdzdHJpbmcnKSB7XG4gICAgZXJyb3JzLnB1c2goeyBmaWVsZDogJ2JpcnRoRGF0ZScsIG1lc3NhZ2U6ICdCaXJ0aCBkYXRlIGlzIHJlcXVpcmVkJyB9KTtcbiAgfSBlbHNlIGlmICghL15cXGR7NH0tXFxkezJ9LVxcZHsyfSQvLnRlc3QoZGF0YS5iaXJ0aERhdGUpKSB7XG4gICAgZXJyb3JzLnB1c2goeyBmaWVsZDogJ2JpcnRoRGF0ZScsIG1lc3NhZ2U6ICdCaXJ0aCBkYXRlIG11c3QgYmUgaW4gWVlZWS1NTS1ERCBmb3JtYXQnIH0pO1xuICB9IGVsc2Uge1xuICAgIGNvbnN0IGRhdGUgPSBuZXcgRGF0ZShkYXRhLmJpcnRoRGF0ZSk7XG4gICAgY29uc3Qgbm93ID0gbmV3IERhdGUoKTtcbiAgICBjb25zdCBtaW5EYXRlID0gbmV3IERhdGUoJzE5MDAtMDEtMDEnKTtcblxuICAgIGlmIChpc05hTihkYXRlLmdldFRpbWUoKSkpIHtcbiAgICAgIGVycm9ycy5wdXNoKHsgZmllbGQ6ICdiaXJ0aERhdGUnLCBtZXNzYWdlOiAnSW52YWxpZCBiaXJ0aCBkYXRlJyB9KTtcbiAgICB9IGVsc2UgaWYgKGRhdGUgPiBub3cpIHtcbiAgICAgIGVycm9ycy5wdXNoKHsgZmllbGQ6ICdiaXJ0aERhdGUnLCBtZXNzYWdlOiAnQmlydGggZGF0ZSBjYW5ub3QgYmUgaW4gdGhlIGZ1dHVyZScgfSk7XG4gICAgfSBlbHNlIGlmIChkYXRlIDwgbWluRGF0ZSkge1xuICAgICAgZXJyb3JzLnB1c2goeyBmaWVsZDogJ2JpcnRoRGF0ZScsIG1lc3NhZ2U6ICdCaXJ0aCBkYXRlIGNhbm5vdCBiZSBiZWZvcmUgMTkwMCcgfSk7XG4gICAgfVxuICB9XG5cbiAgLy8gQmlydGggdGltZSB2YWxpZGF0aW9uIChyZXF1aXJlZClcbiAgaWYgKCFkYXRhLmJpcnRoVGltZSB8fCB0eXBlb2YgZGF0YS5iaXJ0aFRpbWUgIT09ICdzdHJpbmcnKSB7XG4gICAgZXJyb3JzLnB1c2goeyBmaWVsZDogJ2JpcnRoVGltZScsIG1lc3NhZ2U6ICdCaXJ0aCB0aW1lIGlzIHJlcXVpcmVkJyB9KTtcbiAgfSBlbHNlIGlmICghL14oWzAtMV0/WzAtOV18MlswLTNdKTpbMC01XVswLTldJC8udGVzdChkYXRhLmJpcnRoVGltZSkpIHtcbiAgICBlcnJvcnMucHVzaCh7IGZpZWxkOiAnYmlydGhUaW1lJywgbWVzc2FnZTogJ0JpcnRoIHRpbWUgbXVzdCBiZSBpbiBISDpNTSBmb3JtYXQgKDI0LWhvdXIpJyB9KTtcbiAgfVxuXG4gIC8vIExvY2F0aW9uIHZhbGlkYXRpb25cbiAgY29uc3QgbG9jYXRpb25SZWdleCA9IC9eW2EtekEtWlxcc1xcLScsXFwuXSskLztcblxuICBpZiAoIWRhdGEuYmlydGhDaXR5IHx8IHR5cGVvZiBkYXRhLmJpcnRoQ2l0eSAhPT0gJ3N0cmluZycpIHtcbiAgICBlcnJvcnMucHVzaCh7IGZpZWxkOiAnYmlydGhDaXR5JywgbWVzc2FnZTogJ0JpcnRoIGNpdHkgaXMgcmVxdWlyZWQnIH0pO1xuICB9IGVsc2UgaWYgKGRhdGEuYmlydGhDaXR5LnRyaW0oKS5sZW5ndGggPT09IDAgfHwgZGF0YS5iaXJ0aENpdHkubGVuZ3RoID4gMTAwKSB7XG4gICAgZXJyb3JzLnB1c2goeyBmaWVsZDogJ2JpcnRoQ2l0eScsIG1lc3NhZ2U6ICdCaXJ0aCBjaXR5IG11c3QgYmUgMS0xMDAgY2hhcmFjdGVycycgfSk7XG4gIH0gZWxzZSBpZiAoIWxvY2F0aW9uUmVnZXgudGVzdChkYXRhLmJpcnRoQ2l0eSkpIHtcbiAgICBlcnJvcnMucHVzaCh7IGZpZWxkOiAnYmlydGhDaXR5JywgbWVzc2FnZTogJ0JpcnRoIGNpdHkgY29udGFpbnMgaW52YWxpZCBjaGFyYWN0ZXJzJyB9KTtcbiAgfVxuXG4gIGlmICghZGF0YS5iaXJ0aFN0YXRlIHx8IHR5cGVvZiBkYXRhLmJpcnRoU3RhdGUgIT09ICdzdHJpbmcnKSB7XG4gICAgZXJyb3JzLnB1c2goeyBmaWVsZDogJ2JpcnRoU3RhdGUnLCBtZXNzYWdlOiAnQmlydGggc3RhdGUvcHJvdmluY2UgaXMgcmVxdWlyZWQnIH0pO1xuICB9IGVsc2UgaWYgKGRhdGEuYmlydGhTdGF0ZS50cmltKCkubGVuZ3RoID09PSAwIHx8IGRhdGEuYmlydGhTdGF0ZS5sZW5ndGggPiAxMDApIHtcbiAgICBlcnJvcnMucHVzaCh7IGZpZWxkOiAnYmlydGhTdGF0ZScsIG1lc3NhZ2U6ICdCaXJ0aCBzdGF0ZSBtdXN0IGJlIDEtMTAwIGNoYXJhY3RlcnMnIH0pO1xuICB9IGVsc2UgaWYgKCFsb2NhdGlvblJlZ2V4LnRlc3QoZGF0YS5iaXJ0aFN0YXRlKSkge1xuICAgIGVycm9ycy5wdXNoKHsgZmllbGQ6ICdiaXJ0aFN0YXRlJywgbWVzc2FnZTogJ0JpcnRoIHN0YXRlIGNvbnRhaW5zIGludmFsaWQgY2hhcmFjdGVycycgfSk7XG4gIH1cblxuICBpZiAoIWRhdGEuYmlydGhDb3VudHJ5IHx8IHR5cGVvZiBkYXRhLmJpcnRoQ291bnRyeSAhPT0gJ3N0cmluZycpIHtcbiAgICBlcnJvcnMucHVzaCh7IGZpZWxkOiAnYmlydGhDb3VudHJ5JywgbWVzc2FnZTogJ0JpcnRoIGNvdW50cnkgaXMgcmVxdWlyZWQnIH0pO1xuICB9IGVsc2UgaWYgKGRhdGEuYmlydGhDb3VudHJ5LnRyaW0oKS5sZW5ndGggPT09IDAgfHwgZGF0YS5iaXJ0aENvdW50cnkubGVuZ3RoID4gMTAwKSB7XG4gICAgZXJyb3JzLnB1c2goeyBmaWVsZDogJ2JpcnRoQ291bnRyeScsIG1lc3NhZ2U6ICdCaXJ0aCBjb3VudHJ5IG11c3QgYmUgMS0xMDAgY2hhcmFjdGVycycgfSk7XG4gIH0gZWxzZSBpZiAoIWxvY2F0aW9uUmVnZXgudGVzdChkYXRhLmJpcnRoQ291bnRyeSkpIHtcbiAgICBlcnJvcnMucHVzaCh7IGZpZWxkOiAnYmlydGhDb3VudHJ5JywgbWVzc2FnZTogJ0JpcnRoIGNvdW50cnkgY29udGFpbnMgaW52YWxpZCBjaGFyYWN0ZXJzJyB9KTtcbiAgfVxuXG4gIC8vIEZ1dHVyZSBsYXQvbG9uZyB2YWxpZGF0aW9uICh3aGVuIHByb3ZpZGVkKVxuICBpZiAoZGF0YS5iaXJ0aExhdGl0dWRlICE9PSB1bmRlZmluZWQpIHtcbiAgICBjb25zdCBsYXQgPSBkYXRhLmJpcnRoTGF0aXR1ZGU7XG4gICAgaWYgKGlzTmFOKGxhdCkgfHwgbGF0IDwgLTkwIHx8IGxhdCA+IDkwKSB7XG4gICAgICBlcnJvcnMucHVzaCh7IGZpZWxkOiAnYmlydGhMYXRpdHVkZScsIG1lc3NhZ2U6ICdJbnZhbGlkIGxhdGl0dWRlJyB9KTtcbiAgICB9XG4gIH1cblxuICBpZiAoZGF0YS5iaXJ0aExvbmdpdHVkZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgY29uc3QgbG5nID0gZGF0YS5iaXJ0aExvbmdpdHVkZTtcbiAgICBpZiAoaXNOYU4obG5nKSB8fCBsbmcgPCAtMTgwIHx8IGxuZyA+IDE4MCkge1xuICAgICAgZXJyb3JzLnB1c2goeyBmaWVsZDogJ2JpcnRoTG9uZ2l0dWRlJywgbWVzc2FnZTogJ0ludmFsaWQgbG9uZ2l0dWRlJyB9KTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gZXJyb3JzO1xufTtcblxuZXhwb3J0IGNvbnN0IGhhbmRsZXIgPSBhc3luYyAoZXZlbnQ6IEFQSUdhdGV3YXlQcm94eUV2ZW50KTogUHJvbWlzZTxBUElHYXRld2F5UHJveHlSZXN1bHQ+ID0+IHtcbiAgdHJ5IHtcbiAgICAvLyBFeHRyYWN0IHVzZXJJZCBmcm9tIHBhdGggcGFyYW1ldGVyc1xuICAgIGNvbnN0IHVzZXJJZCA9IGV2ZW50LnBhdGhQYXJhbWV0ZXJzPy51c2VySWQ7XG4gICAgaWYgKCF1c2VySWQpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMCxcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6ICcqJyxcbiAgICAgICAgfSxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ01pc3NpbmcgdXNlcklkIHBhcmFtZXRlcicgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIEV4dHJhY3QgdXNlciBzdWIgZnJvbSBhdXRob3JpemVyIGNvbnRleHRcbiAgICBjb25zdCBhdXRob3JpemVyVXNlcklkID0gZXZlbnQucmVxdWVzdENvbnRleHQuYXV0aG9yaXplcj8uY2xhaW1zPy5zdWI7XG5cbiAgICBpZiAoIWF1dGhvcml6ZXJVc2VySWQpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMSxcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6ICcqJyxcbiAgICAgICAgfSxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ1VuYXV0aG9yaXplZCcgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIFZlcmlmeSB1c2VyIGNhbiBvbmx5IHVwZGF0ZSB0aGVpciBvd24gcHJvZmlsZVxuICAgIGlmICh1c2VySWQgIT09IGF1dGhvcml6ZXJVc2VySWQpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMyxcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6ICcqJyxcbiAgICAgICAgfSxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ0ZvcmJpZGRlbicgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIFBhcnNlIHJlcXVlc3QgYm9keVxuICAgIGxldCBwcm9maWxlRGF0YTogUHJvZmlsZURhdGE7XG4gICAgdHJ5IHtcbiAgICAgIHByb2ZpbGVEYXRhID0gSlNPTi5wYXJzZShldmVudC5ib2R5IHx8ICd7fScpO1xuICAgIH0gY2F0Y2gge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNDAwLFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogJyonLFxuICAgICAgICB9LFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnSW52YWxpZCBKU09OIGJvZHknIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBHZW9jb2RlIGxvY2F0aW9uXG4gICAgY29uc3QgZ2VvRGF0YSA9IGF3YWl0IGdldEdlb0RhdGEoXG4gICAgICBwcm9maWxlRGF0YS5iaXJ0aENpdHksXG4gICAgICBwcm9maWxlRGF0YS5iaXJ0aFN0YXRlLFxuICAgICAgcHJvZmlsZURhdGEuYmlydGhDb3VudHJ5LFxuICAgICk7XG5cbiAgICBpZiAoIWdlb0RhdGEpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMCxcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6ICcqJyxcbiAgICAgICAgfSxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgIGVycm9yOiAnVmFsaWRhdGlvbiBmYWlsZWQnLFxuICAgICAgICAgIHZhbGlkYXRpb25FcnJvcnM6IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgZmllbGQ6ICdiaXJ0aENpdHknLFxuICAgICAgICAgICAgICBtZXNzYWdlOiAnQ291bGQgbm90IGZpbmQgYSB2YWxpZCBsb2NhdGlvbiBmb3IgdGhlIGNpdHksIHN0YXRlLCBhbmQgY291bnRyeSBwcm92aWRlZC4nLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICBdLFxuICAgICAgICB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gQWRkIGdlbyBkYXRhIHRvIHByb2ZpbGVcbiAgICBwcm9maWxlRGF0YS5iaXJ0aExhdGl0dWRlID0gZ2VvRGF0YS5sYXRpdHVkZTtcbiAgICBwcm9maWxlRGF0YS5iaXJ0aExvbmdpdHVkZSA9IGdlb0RhdGEubG9uZ2l0dWRlO1xuICAgIHByb2ZpbGVEYXRhLmlhbmFUaW1lWm9uZSA9IGdlb0RhdGEuaWFuYVRpbWVab25lO1xuICAgIHByb2ZpbGVEYXRhLnN0YW5kYXJkaXplZExvY2F0aW9uTmFtZSA9IGdlb0RhdGEuc3RhbmRhcmRpemVkTG9jYXRpb25OYW1lO1xuXG4gICAgLy8gVmFsaWRhdGUgcHJvZmlsZSBkYXRhXG4gICAgY29uc3QgdmFsaWRhdGlvbkVycm9ycyA9IHZhbGlkYXRlQmlydGhEYXRhKHByb2ZpbGVEYXRhKTtcbiAgICBpZiAodmFsaWRhdGlvbkVycm9ycy5sZW5ndGggPiAwKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA0MDAsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiAnKicsXG4gICAgICAgIH0sXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBlcnJvcjogJ1ZhbGlkYXRpb24gZmFpbGVkJyxcbiAgICAgICAgICB2YWxpZGF0aW9uRXJyb3JzLFxuICAgICAgICB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gUHJlcGFyZSBpdGVtIGZvciBEeW5hbW9EQlxuICAgIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKTtcblxuICAgIC8vIEJ1aWxkIHByb2ZpbGUgb2JqZWN0IHdpdGhvdXQgdW5kZWZpbmVkIHZhbHVlc1xuICAgIGNvbnN0IHByb2ZpbGU6IFVzZXJQcm9maWxlID0ge1xuICAgICAgYmlydGhOYW1lOiBwcm9maWxlRGF0YS5iaXJ0aE5hbWUudHJpbSgpLFxuICAgICAgYmlydGhEYXRlOiBwcm9maWxlRGF0YS5iaXJ0aERhdGUsXG4gICAgICBiaXJ0aFRpbWU6IHByb2ZpbGVEYXRhLmJpcnRoVGltZS50cmltKCksXG4gICAgICBiaXJ0aENpdHk6IHByb2ZpbGVEYXRhLmJpcnRoQ2l0eS50cmltKCksXG4gICAgICBiaXJ0aFN0YXRlOiBwcm9maWxlRGF0YS5iaXJ0aFN0YXRlLnRyaW0oKSxcbiAgICAgIGJpcnRoQ291bnRyeTogcHJvZmlsZURhdGEuYmlydGhDb3VudHJ5LnRyaW0oKSxcbiAgICB9O1xuXG4gICAgLy8gT25seSBhZGQgb3B0aW9uYWwgZmllbGRzIGlmIHRoZXkgaGF2ZSB2YWx1ZXNcblxuICAgIGlmIChwcm9maWxlRGF0YS5iaXJ0aExhdGl0dWRlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIHByb2ZpbGUuYmlydGhMYXRpdHVkZSA9IHByb2ZpbGVEYXRhLmJpcnRoTGF0aXR1ZGU7XG4gICAgfVxuXG4gICAgaWYgKHByb2ZpbGVEYXRhLmJpcnRoTG9uZ2l0dWRlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIHByb2ZpbGUuYmlydGhMb25naXR1ZGUgPSBwcm9maWxlRGF0YS5iaXJ0aExvbmdpdHVkZTtcbiAgICB9XG5cbiAgICBpZiAocHJvZmlsZURhdGEuaWFuYVRpbWVab25lKSB7XG4gICAgICBwcm9maWxlLmlhbmFUaW1lWm9uZSA9IHByb2ZpbGVEYXRhLmlhbmFUaW1lWm9uZTtcbiAgICB9XG5cbiAgICBpZiAocHJvZmlsZURhdGEuc3RhbmRhcmRpemVkTG9jYXRpb25OYW1lKSB7XG4gICAgICBwcm9maWxlLnN0YW5kYXJkaXplZExvY2F0aW9uTmFtZSA9IHByb2ZpbGVEYXRhLnN0YW5kYXJkaXplZExvY2F0aW9uTmFtZTtcbiAgICB9XG5cbiAgICBjb25zdCBpdGVtID0ge1xuICAgICAgdXNlcklkLFxuICAgICAgY3JlYXRlZEF0OiAnUFJPRklMRScsIC8vIEZpeGVkIHNvcnQga2V5IGZvciBwcm9maWxlIGRhdGFcbiAgICAgIGVtYWlsOiBwcm9maWxlRGF0YS5lbWFpbCxcbiAgICAgIHByb2ZpbGUsXG4gICAgICBvbmJvYXJkaW5nQ29tcGxldGVkOiB0cnVlLFxuICAgICAgdXBkYXRlZEF0OiBub3csXG4gICAgICBmaXJzdENyZWF0ZWRBdDogbm93LCAvLyBXaWxsIGJlIG92ZXJ3cml0dGVuIGlmIHByb2ZpbGUgYWxyZWFkeSBleGlzdHNcbiAgICB9O1xuXG4gICAgLy8gU2F2ZSB0byBEeW5hbW9EQlxuICAgIGF3YWl0IGRvY0NsaWVudC5zZW5kKFxuICAgICAgbmV3IFB1dENvbW1hbmQoe1xuICAgICAgICBUYWJsZU5hbWU6IFRBQkxFX05BTUUsXG4gICAgICAgIEl0ZW06IGl0ZW0sXG4gICAgICAgIENvbmRpdGlvbkV4cHJlc3Npb246ICdhdHRyaWJ1dGVfbm90X2V4aXN0cyh1c2VySWQpIE9SIGF0dHJpYnV0ZV9leGlzdHModXNlcklkKScsXG4gICAgICB9KSxcbiAgICApO1xuXG4gICAgLy8gQXN5bmNocm9ub3VzbHkgaW52b2tlIHRoZSBuYXRhbCBjaGFydCBnZW5lcmF0aW9uIExhbWJkYVxuICAgIGNvbnN0IGludm9jYXRpb25QYXlsb2FkID0ge1xuICAgICAgdXNlcklkLFxuICAgICAgYmlydGhEYXRlOiBwcm9maWxlRGF0YS5iaXJ0aERhdGUsXG4gICAgICBiaXJ0aFRpbWU6IHByb2ZpbGVEYXRhLmJpcnRoVGltZSxcbiAgICAgIGxhdGl0dWRlOiBwcm9maWxlRGF0YS5iaXJ0aExhdGl0dWRlLFxuICAgICAgbG9uZ2l0dWRlOiBwcm9maWxlRGF0YS5iaXJ0aExvbmdpdHVkZSxcbiAgICAgIGlhbmFUaW1lWm9uZTogcHJvZmlsZURhdGEuaWFuYVRpbWVab25lLFxuICAgIH07XG5cbiAgICBjb25zb2xlLmluZm8oJ0ludm9raW5nIG5hdGFsIGNoYXJ0IGdlbmVyYXRpb24gd2l0aCBwYXlsb2FkOicsIGludm9jYXRpb25QYXlsb2FkKTtcbiAgICBjb25zb2xlLmluZm8oJ0Z1bmN0aW9uIG5hbWU6JywgR0VORVJBVEVfTkFUQUxfQ0hBUlRfRlVOQ1RJT05fTkFNRSk7XG5cbiAgICB0cnkge1xuICAgICAgY29uc3QgaW52b2NhdGlvblJlc3BvbnNlID0gYXdhaXQgbGFtYmRhQ2xpZW50LnNlbmQoXG4gICAgICAgIG5ldyBJbnZva2VDb21tYW5kKHtcbiAgICAgICAgICBGdW5jdGlvbk5hbWU6IEdFTkVSQVRFX05BVEFMX0NIQVJUX0ZVTkNUSU9OX05BTUUsXG4gICAgICAgICAgSW52b2NhdGlvblR5cGU6ICdFdmVudCcsIC8vIEFzeW5jaHJvbm91cyBpbnZvY2F0aW9uXG4gICAgICAgICAgUGF5bG9hZDogSlNPTi5zdHJpbmdpZnkoaW52b2NhdGlvblBheWxvYWQpLFxuICAgICAgICB9KSxcbiAgICAgICk7XG5cbiAgICAgIGNvbnNvbGUuaW5mbygnTmF0YWwgY2hhcnQgZ2VuZXJhdGlvbiBpbnZva2VkIHN1Y2Nlc3NmdWxseTonLCB7XG4gICAgICAgIHN0YXR1c0NvZGU6IGludm9jYXRpb25SZXNwb25zZS5TdGF0dXNDb2RlLFxuICAgICAgICBmdW5jdGlvbkVycm9yOiBpbnZvY2F0aW9uUmVzcG9uc2UuRnVuY3Rpb25FcnJvcixcbiAgICAgIH0pO1xuICAgIH0gY2F0Y2ggKGludm9jYXRpb25FcnJvcikge1xuICAgICAgY29uc29sZS5lcnJvcignRmFpbGVkIHRvIGludm9rZSBuYXRhbCBjaGFydCBnZW5lcmF0aW9uOicsIGludm9jYXRpb25FcnJvcik7XG4gICAgICAvLyBEb24ndCBmYWlsIHRoZSBwcm9maWxlIHVwZGF0ZSBpZiBuYXRhbCBjaGFydCBnZW5lcmF0aW9uIGZhaWxzXG4gICAgICAvLyBUaGUgdXNlciBjYW4gc3RpbGwgc2VlIHRoZWlyIHByb2ZpbGUgZXZlbiBpZiB0aGUgY2hhcnQgaXNuJ3QgcmVhZHlcbiAgICB9XG5cbiAgICByZXR1cm4ge1xuICAgICAgc3RhdHVzQ29kZTogMjAwLFxuICAgICAgaGVhZGVyczoge1xuICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogJyonLFxuICAgICAgfSxcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgbWVzc2FnZTogJ1Byb2ZpbGUgdXBkYXRlZCBzdWNjZXNzZnVsbHknLFxuICAgICAgICBwcm9maWxlOiBpdGVtLFxuICAgICAgfSksXG4gICAgfTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciBpbiB1cGRhdGUtdXNlci1wcm9maWxlIGhhbmRsZXI6JywgZXJyb3IpO1xuICAgIHJldHVybiB7XG4gICAgICBzdGF0dXNDb2RlOiA1MDAsXG4gICAgICBoZWFkZXJzOiB7XG4gICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiAnKicsXG4gICAgICB9LFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ0ludGVybmFsIHNlcnZlciBlcnJvcicgfSksXG4gICAgfTtcbiAgfVxufTtcbiJdfQ==