"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const client_location_1 = require("@aws-sdk/client-location");
const tz_lookup_1 = __importDefault(require("tz-lookup"));
const dynamoClient = new client_dynamodb_1.DynamoDBClient({});
const docClient = lib_dynamodb_1.DynamoDBDocumentClient.from(dynamoClient);
const locationClient = new client_location_1.LocationClient({});
const TABLE_NAME = process.env.TABLE_NAME;
const PLACE_INDEX_NAME = process.env.PLACE_INDEX_NAME;
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
        console.error('Geocoding error:', error);
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
    // Birth time validation (optional)
    if (data.birthTime && typeof data.birthTime === 'string') {
        if (!/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(data.birthTime)) {
            errors.push({ field: 'birthTime', message: 'Birth time must be in HH:MM format (24-hour)' });
        }
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
    // eslint-disable-next-line no-console
    console.log('Event:', JSON.stringify(event, null, 2));
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
            birthCity: profileData.birthCity.trim(),
            birthState: profileData.birthState.trim(),
            birthCountry: profileData.birthCountry.trim(),
        };
        // Only add optional fields if they have values
        if (profileData.birthTime) {
            profile.birthTime = profileData.birthTime.trim();
        }
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
        // eslint-disable-next-line no-console
        console.error('Error:', error);
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXBkYXRlLXVzZXItcHJvZmlsZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInVwZGF0ZS11c2VyLXByb2ZpbGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQ0EsOERBQTBEO0FBQzFELHdEQUEyRTtBQUMzRSw4REFBMEY7QUFDMUYsMERBQWlDO0FBRWpDLE1BQU0sWUFBWSxHQUFHLElBQUksZ0NBQWMsQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUM1QyxNQUFNLFNBQVMsR0FBRyxxQ0FBc0IsQ0FBQyxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUM7QUFDNUQsTUFBTSxjQUFjLEdBQUcsSUFBSSxnQ0FBYyxDQUFDLEVBQUUsQ0FBQyxDQUFDO0FBRTlDLE1BQU0sVUFBVSxHQUFHLE9BQU8sQ0FBQyxHQUFHLENBQUMsVUFBVyxDQUFDO0FBQzNDLE1BQU0sZ0JBQWdCLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxnQkFBaUIsQ0FBQztBQXVCdkQ7O0dBRUc7QUFDSCxLQUFLLFVBQVUsVUFBVSxDQUFDLElBQVksRUFBRSxLQUFhLEVBQUUsT0FBZTtJQUNwRSxNQUFNLFVBQVUsR0FBRyxHQUFHLElBQUksS0FBSyxLQUFLLEtBQUssT0FBTyxFQUFFLENBQUM7SUFFbkQsSUFBSSxDQUFDO1FBQ0gsTUFBTSxPQUFPLEdBQUcsSUFBSSxnREFBOEIsQ0FBQztZQUNqRCxTQUFTLEVBQUUsZ0JBQWdCO1lBQzNCLElBQUksRUFBRSxVQUFVO1lBQ2hCLFVBQVUsRUFBRSxDQUFDO1NBQ2QsQ0FBQyxDQUFDO1FBQ0gsTUFBTSxRQUFRLEdBQUcsTUFBTSxjQUFjLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBRXBELElBQUksUUFBUSxDQUFDLE9BQU8sSUFBSSxRQUFRLENBQUMsT0FBTyxDQUFDLE1BQU0sR0FBRyxDQUFDLElBQUksUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUMsQ0FBQyxLQUFLLEVBQUUsQ0FBQztZQUNqRixNQUFNLEtBQUss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Q0FBQyxFQUFFLEtBQUssRUFBRSx1QkFBdUIsRUFBRSxDQUFDO1NBQ3pELENBQUM7SUFDSixDQUFDO0FBQ0gsQ0FBQyxDQUFDO0FBdExXLFFBQUEsT0FBTyxXQXNMbEIiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBBUElHYXRld2F5UHJveHlFdmVudCwgQVBJR2F0ZXdheVByb3h5UmVzdWx0IH0gZnJvbSAnYXdzLWxhbWJkYSc7XG5pbXBvcnQgeyBEeW5hbW9EQkNsaWVudCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1keW5hbW9kYic7XG5pbXBvcnQgeyBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LCBQdXRDb21tYW5kIH0gZnJvbSAnQGF3cy1zZGsvbGliLWR5bmFtb2RiJztcbmltcG9ydCB7IExvY2F0aW9uQ2xpZW50LCBTZWFyY2hQbGFjZUluZGV4Rm9yVGV4dENvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtbG9jYXRpb24nO1xuaW1wb3J0IHR6bG9va3VwIGZyb20gJ3R6LWxvb2t1cCc7XG5cbmNvbnN0IGR5bmFtb0NsaWVudCA9IG5ldyBEeW5hbW9EQkNsaWVudCh7fSk7XG5jb25zdCBkb2NDbGllbnQgPSBEeW5hbW9EQkRvY3VtZW50Q2xpZW50LmZyb20oZHluYW1vQ2xpZW50KTtcbmNvbnN0IGxvY2F0aW9uQ2xpZW50ID0gbmV3IExvY2F0aW9uQ2xpZW50KHt9KTtcblxuY29uc3QgVEFCTEVfTkFNRSA9IHByb2Nlc3MuZW52LlRBQkxFX05BTUUhO1xuY29uc3QgUExBQ0VfSU5ERVhfTkFNRSA9IHByb2Nlc3MuZW52LlBMQUNFX0lOREVYX05BTUUhO1xuXG5pbnRlcmZhY2UgUHJvZmlsZURhdGEge1xuICBlbWFpbDogc3RyaW5nO1xuICBiaXJ0aE5hbWU6IHN0cmluZztcbiAgYmlydGhEYXRlOiBzdHJpbmc7XG4gIGJpcnRoVGltZT86IHN0cmluZztcbiAgYmlydGhDaXR5OiBzdHJpbmc7XG4gIGJpcnRoU3RhdGU6IHN0cmluZztcbiAgYmlydGhDb3VudHJ5OiBzdHJpbmc7XG4gIGJpcnRoTGF0aXR1ZGU/OiBudW1iZXI7XG4gIGJpcnRoTG9uZ2l0dWRlPzogbnVtYmVyO1xuICBpYW5hVGltZVpvbmU/OiBzdHJpbmc7XG4gIHN0YW5kYXJkaXplZExvY2F0aW9uTmFtZT86IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIEdlb0RhdGEge1xuICBsYXRpdHVkZTogbnVtYmVyO1xuICBsb25naXR1ZGU6IG51bWJlcjtcbiAgaWFuYVRpbWVab25lOiBzdHJpbmc7XG4gIHN0YW5kYXJkaXplZExvY2F0aW9uTmFtZTogc3RyaW5nO1xufVxuXG4vKipcbiAqIEdlb2NvZGVzIGEgbG9jYXRpb24gYW5kIHJldHVybnMgaXRzIGNvb3JkaW5hdGVzLCB0aW1lIHpvbmUsIGFuZCBzdGFuZGFyZGl6ZWQgbmFtZS5cbiAqL1xuYXN5bmMgZnVuY3Rpb24gZ2V0R2VvRGF0YShjaXR5OiBzdHJpbmcsIHN0YXRlOiBzdHJpbmcsIGNvdW50cnk6IHN0cmluZyk6IFByb21pc2U8R2VvRGF0YSB8IG51bGw+IHtcbiAgY29uc3Qgc2VhcmNoVGV4dCA9IGAke2NpdHl9LCAke3N0YXRlfSwgJHtjb3VudHJ5fWA7XG5cbiAgdHJ5IHtcbiAgICBjb25zdCBjb21tYW5kID0gbmV3IFNlYXJjaFBsYWNlSW5kZXhGb3JUZXh0Q29tbWFuZCh7XG4gICAgICBJbmRleE5hbWU6IFBMQUNFX0lOREVYX05BTUUsXG4gICAgICBUZXh0OiBzZWFyY2hUZXh0LFxuICAgICAgTWF4UmVzdWx0czogMSxcbiAgICB9KTtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGxvY2F0aW9uQ2xpZW50LnNlbmQoY29tbWFuZCk7XG5cbiAgICBpZiAocmVzcG9uc2UuUmVzdWx0cyAmJiByZXNwb25zZS5SZXN1bHRzLmxlbmd0aCA+IDAgJiYgcmVzcG9uc2UuUmVzdWx0c1swXS5QbGFjZSkge1xuICAgICAgY29uc3QgcGxhY2UgPSByZXNwb25zZS5SZXN1bHRzWzBdLlBsYWNlO1xuICAgICAgY29uc3QgW2xvbmdpdHVkZSwgbGF0aXR1ZGVdID0gcGxhY2UuR2VvbWV0cnk/LlBvaW50IHx8IFtdO1xuXG4gICAgICBpZiAobG9uZ2l0dWRlID09PSB1bmRlZmluZWQgfHwgbGF0aXR1ZGUgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIH1cblxuICAgICAgY29uc3QgaWFuYVRpbWVab25lID0gdHpsb29rdXAobGF0aXR1ZGUsIGxvbmdpdHVkZSk7XG4gICAgICBjb25zdCBzdGFuZGFyZGl6ZWRMb2NhdGlvbk5hbWUgPSBwbGFjZS5MYWJlbCB8fCBzZWFyY2hUZXh0O1xuXG4gICAgICByZXR1cm4ge1xuICAgICAgICBsYXRpdHVkZTogcGFyc2VGbG9hdChsYXRpdHVkZS50b0ZpeGVkKDYpKSxcbiAgICAgICAgbG9uZ2l0dWRlOiBwYXJzZUZsb2F0KGxvbmdpdHVkZS50b0ZpeGVkKDYpKSxcbiAgICAgICAgaWFuYVRpbWVab25lLFxuICAgICAgICBzdGFuZGFyZGl6ZWRMb2NhdGlvbk5hbWUsXG4gICAgICB9O1xuICAgIH1cbiAgICByZXR1cm4gbnVsbDtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdHZW9jb2RpbmcgZXJyb3I6JywgZXJyb3IpO1xuICAgIC8vIFJlLXRocm93IG9yIGhhbmRsZSBhcyBhIG5vbi1ibG9ja2luZyBlcnJvclxuICAgIHRocm93IG5ldyBFcnJvcignRmFpbGVkIHRvIGdlb2NvZGUgbG9jYXRpb24gZHVlIHRvIGEgc2VydmljZSBlcnJvci4nKTtcbiAgfVxufVxuXG5pbnRlcmZhY2UgVmFsaWRhdGlvbkVycm9yIHtcbiAgZmllbGQ6IHN0cmluZztcbiAgbWVzc2FnZTogc3RyaW5nO1xufVxuXG5jb25zdCB2YWxpZGF0ZUJpcnRoRGF0YSA9IChkYXRhOiBhbnkpOiBWYWxpZGF0aW9uRXJyb3JbXSA9PiB7XG4gIGNvbnN0IGVycm9yczogVmFsaWRhdGlvbkVycm9yW10gPSBbXTtcblxuICAvLyBFbWFpbCB2YWxpZGF0aW9uXG4gIGlmICghZGF0YS5lbWFpbCB8fCB0eXBlb2YgZGF0YS5lbWFpbCAhPT0gJ3N0cmluZycpIHtcbiAgICBlcnJvcnMucHVzaCh7IGZpZWxkOiAnZW1haWwnLCBtZXNzYWdlOiAnRW1haWwgaXMgcmVxdWlyZWQnIH0pO1xuICB9IGVsc2UgaWYgKCEvXlteXFxzQF0rQFteXFxzQF0rXFwuW15cXHNAXSskLy50ZXN0KGRhdGEuZW1haWwpKSB7XG4gICAgZXJyb3JzLnB1c2goeyBmaWVsZDogJ2VtYWlsJywgbWVzc2FnZTogJ0ludmFsaWQgZW1haWwgZm9ybWF0JyB9KTtcbiAgfVxuXG4gIC8vIEJpcnRoIG5hbWUgdmFsaWRhdGlvblxuICBpZiAoIWRhdGEuYmlydGhOYW1lIHx8IHR5cGVvZiBkYXRhLmJpcnRoTmFtZSAhPT0gJ3N0cmluZycpIHtcbiAgICBlcnJvcnMucHVzaCh7IGZpZWxkOiAnYmlydGhOYW1lJywgbWVzc2FnZTogJ0JpcnRoIG5hbWUgaXMgcmVxdWlyZWQnIH0pO1xuICB9IGVsc2UgaWYgKGRhdGEuYmlydGhOYW1lLnRyaW0oKS5sZW5ndGggPT09IDAgfHwgZGF0YS5iaXJ0aE5hbWUubGVuZ3RoID4gMjU2KSB7XG4gICAgZXJyb3JzLnB1c2goeyBmaWVsZDogJ2JpcnRoTmFtZScsIG1lc3NhZ2U6ICdCaXJ0aCBuYW1lIG11c3QgYmUgMS0yNTYgY2hhcmFjdGVycycgfSk7XG4gIH0gZWxzZSBpZiAoIS9eW2EtekEtWlxcc1xcLSddKyQvLnRlc3QoZGF0YS5iaXJ0aE5hbWUpKSB7XG4gICAgZXJyb3JzLnB1c2goeyBmaWVsZDogJ2JpcnRoTmFtZScsIG1lc3NhZ2U6ICdCaXJ0aCBuYW1lIGNvbnRhaW5zIGludmFsaWQgY2hhcmFjdGVycycgfSk7XG4gIH1cblxuICAvLyBCaXJ0aCBkYXRlIHZhbGlkYXRpb25cbiAgaWYgKCFkYXRhLmJpcnRoRGF0ZSB8fCB0eXBlb2YgZGF0YS5iaXJ0aERhdGUgIT09ICdzdHJpbmcnKSB7XG4gICAgZXJyb3JzLnB1c2goeyBmaWVsZDogJ2JpcnRoRGF0ZScsIG1lc3NhZ2U6ICdCaXJ0aCBkYXRlIGlzIHJlcXVpcmVkJyB9KTtcbiAgfSBlbHNlIGlmICghL15cXGR7NH0tXFxkezJ9LVxcZHsyfSQvLnRlc3QoZGF0YS5iaXJ0aERhdGUpKSB7XG4gICAgZXJyb3JzLnB1c2goeyBmaWVsZDogJ2JpcnRoRGF0ZScsIG1lc3NhZ2U6ICdCaXJ0aCBkYXRlIG11c3QgYmUgaW4gWVlZWS1NTS1ERCBmb3JtYXQnIH0pO1xuICB9IGVsc2Uge1xuICAgIGNvbnN0IGRhdGUgPSBuZXcgRGF0ZShkYXRhLmJpcnRoRGF0ZSk7XG4gICAgY29uc3Qgbm93ID0gbmV3IERhdGUoKTtcbiAgICBjb25zdCBtaW5EYXRlID0gbmV3IERhdGUoJzE5MDAtMDEtMDEnKTtcblxuICAgIGlmIChpc05hTihkYXRlLmdldFRpbWUoKSkpIHtcbiAgICAgIGVycm9ycy5wdXNoKHsgZmllbGQ6ICdiaXJ0aERhdGUnLCBtZXNzYWdlOiAnSW52YWxpZCBiaXJ0aCBkYXRlJyB9KTtcbiAgICB9IGVsc2UgaWYgKGRhdGUgPiBub3cpIHtcbiAgICAgIGVycm9ycy5wdXNoKHsgZmllbGQ6ICdiaXJ0aERhdGUnLCBtZXNzYWdlOiAnQmlydGggZGF0ZSBjYW5ub3QgYmUgaW4gdGhlIGZ1dHVyZScgfSk7XG4gICAgfSBlbHNlIGlmIChkYXRlIDwgbWluRGF0ZSkge1xuICAgICAgZXJyb3JzLnB1c2goeyBmaWVsZDogJ2JpcnRoRGF0ZScsIG1lc3NhZ2U6ICdCaXJ0aCBkYXRlIGNhbm5vdCBiZSBiZWZvcmUgMTkwMCcgfSk7XG4gICAgfVxuICB9XG5cbiAgLy8gQmlydGggdGltZSB2YWxpZGF0aW9uIChvcHRpb25hbClcbiAgaWYgKGRhdGEuYmlydGhUaW1lICYmIHR5cGVvZiBkYXRhLmJpcnRoVGltZSA9PT0gJ3N0cmluZycpIHtcbiAgICBpZiAoIS9eKFswLTFdP1swLTldfDJbMC0zXSk6WzAtNV1bMC05XSQvLnRlc3QoZGF0YS5iaXJ0aFRpbWUpKSB7XG4gICAgICBlcnJvcnMucHVzaCh7IGZpZWxkOiAnYmlydGhUaW1lJywgbWVzc2FnZTogJ0JpcnRoIHRpbWUgbXVzdCBiZSBpbiBISDpNTSBmb3JtYXQgKDI0LWhvdXIpJyB9KTtcbiAgICB9XG4gIH1cblxuICAvLyBMb2NhdGlvbiB2YWxpZGF0aW9uXG4gIGNvbnN0IGxvY2F0aW9uUmVnZXggPSAvXlthLXpBLVpcXHNcXC0nLFxcLl0rJC87XG5cbiAgaWYgKCFkYXRhLmJpcnRoQ2l0eSB8fCB0eXBlb2YgZGF0YS5iaXJ0aENpdHkgIT09ICdzdHJpbmcnKSB7XG4gICAgZXJyb3JzLnB1c2goeyBmaWVsZDogJ2JpcnRoQ2l0eScsIG1lc3NhZ2U6ICdCaXJ0aCBjaXR5IGlzIHJlcXVpcmVkJyB9KTtcbiAgfSBlbHNlIGlmIChkYXRhLmJpcnRoQ2l0eS50cmltKCkubGVuZ3RoID09PSAwIHx8IGRhdGEuYmlydGhDaXR5Lmxlbmd0aCA+IDEwMCkge1xuICAgIGVycm9ycy5wdXNoKHsgZmllbGQ6ICdiaXJ0aENpdHknLCBtZXNzYWdlOiAnQmlydGggY2l0eSBtdXN0IGJlIDEtMTAwIGNoYXJhY3RlcnMnIH0pO1xuICB9IGVsc2UgaWYgKCFsb2NhdGlvblJlZ2V4LnRlc3QoZGF0YS5iaXJ0aENpdHkpKSB7XG4gICAgZXJyb3JzLnB1c2goeyBmaWVsZDogJ2JpcnRoQ2l0eScsIG1lc3NhZ2U6ICdCaXJ0aCBjaXR5IGNvbnRhaW5zIGludmFsaWQgY2hhcmFjdGVycycgfSk7XG4gIH1cblxuICBpZiAoIWRhdGEuYmlydGhTdGF0ZSB8fCB0eXBlb2YgZGF0YS5iaXJ0aFN0YXRlICE9PSAnc3RyaW5nJykge1xuICAgIGVycm9ycy5wdXNoKHsgZmllbGQ6ICdiaXJ0aFN0YXRlJywgbWVzc2FnZTogJ0JpcnRoIHN0YXRlL3Byb3ZpbmNlIGlzIHJlcXVpcmVkJyB9KTtcbiAgfSBlbHNlIGlmIChkYXRhLmJpcnRoU3RhdGUudHJpbSgpLmxlbmd0aCA9PT0gMCB8fCBkYXRhLmJpcnRoU3RhdGUubGVuZ3RoID4gMTAwKSB7XG4gICAgZXJyb3JzLnB1c2goeyBmaWVsZDogJ2JpcnRoU3RhdGUnLCBtZXNzYWdlOiAnQmlydGggc3RhdGUgbXVzdCBiZSAxLTEwMCBjaGFyYWN0ZXJzJyB9KTtcbiAgfSBlbHNlIGlmICghbG9jYXRpb25SZWdleC50ZXN0KGRhdGEuYmlydGhTdGF0ZSkpIHtcbiAgICBlcnJvcnMucHVzaCh7IGZpZWxkOiAnYmlydGhTdGF0ZScsIG1lc3NhZ2U6ICdCaXJ0aCBzdGF0ZSBjb250YWlucyBpbnZhbGlkIGNoYXJhY3RlcnMnIH0pO1xuICB9XG5cbiAgaWYgKCFkYXRhLmJpcnRoQ291bnRyeSB8fCB0eXBlb2YgZGF0YS5iaXJ0aENvdW50cnkgIT09ICdzdHJpbmcnKSB7XG4gICAgZXJyb3JzLnB1c2goeyBmaWVsZDogJ2JpcnRoQ291bnRyeScsIG1lc3NhZ2U6ICdCaXJ0aCBjb3VudHJ5IGlzIHJlcXVpcmVkJyB9KTtcbiAgfSBlbHNlIGlmIChkYXRhLmJpcnRoQ291bnRyeS50cmltKCkubGVuZ3RoID09PSAwIHx8IGRhdGEuYmlydGhDb3VudHJ5Lmxlbmd0aCA+IDEwMCkge1xuICAgIGVycm9ycy5wdXNoKHsgZmllbGQ6ICdiaXJ0aENvdW50cnknLCBtZXNzYWdlOiAnQmlydGggY291bnRyeSBtdXN0IGJlIDEtMTAwIGNoYXJhY3RlcnMnIH0pO1xuICB9IGVsc2UgaWYgKCFsb2NhdGlvblJlZ2V4LnRlc3QoZGF0YS5iaXJ0aENvdW50cnkpKSB7XG4gICAgZXJyb3JzLnB1c2goeyBmaWVsZDogJ2JpcnRoQ291bnRyeScsIG1lc3NhZ2U6ICdCaXJ0aCBjb3VudHJ5IGNvbnRhaW5zIGludmFsaWQgY2hhcmFjdGVycycgfSk7XG4gIH1cblxuICAvLyBGdXR1cmUgbGF0L2xvbmcgdmFsaWRhdGlvbiAod2hlbiBwcm92aWRlZClcbiAgaWYgKGRhdGEuYmlydGhMYXRpdHVkZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgY29uc3QgbGF0ID0gcGFyc2VGbG9hdChkYXRhLmJpcnRoTGF0aXR1ZGUpO1xuICAgIGlmIChpc05hTihsYXQpIHx8IGxhdCA8IC05MCB8fCBsYXQgPiA5MCkge1xuICAgICAgZXJyb3JzLnB1c2goeyBmaWVsZDogJ2JpcnRoTGF0aXR1ZGUnLCBtZXNzYWdlOiAnSW52YWxpZCBsYXRpdHVkZScgfSk7XG4gICAgfVxuICB9XG5cbiAgaWYgKGRhdGEuYmlydGhMb25naXR1ZGUgIT09IHVuZGVmaW5lZCkge1xuICAgIGNvbnN0IGxuZyA9IHBhcnNlRmxvYXQoZGF0YS5iaXJ0aExvbmdpdHVkZSk7XG4gICAgaWYgKGlzTmFOKGxuZykgfHwgbG5nIDwgLTE4MCB8fCBsbmcgPiAxODApIHtcbiAgICAgIGVycm9ycy5wdXNoKHsgZmllbGQ6ICdiaXJ0aExvbmdpdHVkZScsIG1lc3NhZ2U6ICdJbnZhbGlkIGxvbmdpdHVkZScgfSk7XG4gICAgfVxuICB9XG5cbiAgcmV0dXJuIGVycm9ycztcbn07XG5cbmV4cG9ydCBjb25zdCBoYW5kbGVyID0gYXN5bmMgKGV2ZW50OiBBUElHYXRld2F5UHJveHlFdmVudCk6IFByb21pc2U8QVBJR2F0ZXdheVByb3h5UmVzdWx0PiA9PiB7XG4gIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1jb25zb2xlXG4gIGNvbnNvbGUubG9nKCdFdmVudDonLCBKU09OLnN0cmluZ2lmeShldmVudCwgbnVsbCwgMikpO1xuXG4gIHRyeSB7XG4gICAgLy8gRXh0cmFjdCB1c2VySWQgZnJvbSBwYXRoIHBhcmFtZXRlcnNcbiAgICBjb25zdCB1c2VySWQgPSBldmVudC5wYXRoUGFyYW1ldGVycz8udXNlcklkO1xuICAgIGlmICghdXNlcklkKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA0MDAsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiAnKicsXG4gICAgICAgIH0sXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICdNaXNzaW5nIHVzZXJJZCBwYXJhbWV0ZXInIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBFeHRyYWN0IHVzZXIgc3ViIGZyb20gYXV0aG9yaXplciBjb250ZXh0XG4gICAgY29uc3QgYXV0aG9yaXplclVzZXJJZCA9IGV2ZW50LnJlcXVlc3RDb250ZXh0LmF1dGhvcml6ZXI/LmNsYWltcz8uc3ViO1xuXG4gICAgaWYgKCFhdXRob3JpemVyVXNlcklkKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA0MDEsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiAnKicsXG4gICAgICAgIH0sXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICdVbmF1dGhvcml6ZWQnIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBWZXJpZnkgdXNlciBjYW4gb25seSB1cGRhdGUgdGhlaXIgb3duIHByb2ZpbGVcbiAgICBpZiAodXNlcklkICE9PSBhdXRob3JpemVyVXNlcklkKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA0MDMsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiAnKicsXG4gICAgICAgIH0sXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICdGb3JiaWRkZW4nIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBQYXJzZSByZXF1ZXN0IGJvZHlcbiAgICBsZXQgcHJvZmlsZURhdGE6IFByb2ZpbGVEYXRhO1xuICAgIHRyeSB7XG4gICAgICBwcm9maWxlRGF0YSA9IEpTT04ucGFyc2UoZXZlbnQuYm9keSB8fCAne30nKTtcbiAgICB9IGNhdGNoIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMCxcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6ICcqJyxcbiAgICAgICAgfSxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ0ludmFsaWQgSlNPTiBib2R5JyB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gR2VvY29kZSBsb2NhdGlvblxuICAgIGNvbnN0IGdlb0RhdGEgPSBhd2FpdCBnZXRHZW9EYXRhKFxuICAgICAgcHJvZmlsZURhdGEuYmlydGhDaXR5LFxuICAgICAgcHJvZmlsZURhdGEuYmlydGhTdGF0ZSxcbiAgICAgIHByb2ZpbGVEYXRhLmJpcnRoQ291bnRyeSxcbiAgICApO1xuXG4gICAgaWYgKCFnZW9EYXRhKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA0MDAsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiAnKicsXG4gICAgICAgIH0sXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBlcnJvcjogJ1ZhbGlkYXRpb24gZmFpbGVkJyxcbiAgICAgICAgICB2YWxpZGF0aW9uRXJyb3JzOiBbXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgIGZpZWxkOiAnYmlydGhDaXR5JyxcbiAgICAgICAgICAgICAgbWVzc2FnZTogJ0NvdWxkIG5vdCBmaW5kIGEgdmFsaWQgbG9jYXRpb24gZm9yIHRoZSBjaXR5LCBzdGF0ZSwgYW5kIGNvdW50cnkgcHJvdmlkZWQuJyxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgXSxcbiAgICAgICAgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIEFkZCBnZW8gZGF0YSB0byBwcm9maWxlXG4gICAgcHJvZmlsZURhdGEuYmlydGhMYXRpdHVkZSA9IGdlb0RhdGEubGF0aXR1ZGU7XG4gICAgcHJvZmlsZURhdGEuYmlydGhMb25naXR1ZGUgPSBnZW9EYXRhLmxvbmdpdHVkZTtcbiAgICBwcm9maWxlRGF0YS5pYW5hVGltZVpvbmUgPSBnZW9EYXRhLmlhbmFUaW1lWm9uZTtcbiAgICBwcm9maWxlRGF0YS5zdGFuZGFyZGl6ZWRMb2NhdGlvbk5hbWUgPSBnZW9EYXRhLnN0YW5kYXJkaXplZExvY2F0aW9uTmFtZTtcblxuICAgIC8vIFZhbGlkYXRlIHByb2ZpbGUgZGF0YVxuICAgIGNvbnN0IHZhbGlkYXRpb25FcnJvcnMgPSB2YWxpZGF0ZUJpcnRoRGF0YShwcm9maWxlRGF0YSk7XG4gICAgaWYgKHZhbGlkYXRpb25FcnJvcnMubGVuZ3RoID4gMCkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNDAwLFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogJyonLFxuICAgICAgICB9LFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgICAgZXJyb3I6ICdWYWxpZGF0aW9uIGZhaWxlZCcsXG4gICAgICAgICAgdmFsaWRhdGlvbkVycm9ycyxcbiAgICAgICAgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIFByZXBhcmUgaXRlbSBmb3IgRHluYW1vREJcbiAgICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpLnRvSVNPU3RyaW5nKCk7XG5cbiAgICAvLyBCdWlsZCBwcm9maWxlIG9iamVjdCB3aXRob3V0IHVuZGVmaW5lZCB2YWx1ZXNcbiAgICBjb25zdCBwcm9maWxlOiBhbnkgPSB7XG4gICAgICBiaXJ0aE5hbWU6IHByb2ZpbGVEYXRhLmJpcnRoTmFtZS50cmltKCksXG4gICAgICBiaXJ0aERhdGU6IHByb2ZpbGVEYXRhLmJpcnRoRGF0ZSxcbiAgICAgIGJpcnRoQ2l0eTogcHJvZmlsZURhdGEuYmlydGhDaXR5LnRyaW0oKSxcbiAgICAgIGJpcnRoU3RhdGU6IHByb2ZpbGVEYXRhLmJpcnRoU3RhdGUudHJpbSgpLFxuICAgICAgYmlydGhDb3VudHJ5OiBwcm9maWxlRGF0YS5iaXJ0aENvdW50cnkudHJpbSgpLFxuICAgIH07XG5cbiAgICAvLyBPbmx5IGFkZCBvcHRpb25hbCBmaWVsZHMgaWYgdGhleSBoYXZlIHZhbHVlc1xuICAgIGlmIChwcm9maWxlRGF0YS5iaXJ0aFRpbWUpIHtcbiAgICAgIHByb2ZpbGUuYmlydGhUaW1lID0gcHJvZmlsZURhdGEuYmlydGhUaW1lLnRyaW0oKTtcbiAgICB9XG5cbiAgICBpZiAocHJvZmlsZURhdGEuYmlydGhMYXRpdHVkZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICBwcm9maWxlLmJpcnRoTGF0aXR1ZGUgPSBwcm9maWxlRGF0YS5iaXJ0aExhdGl0dWRlO1xuICAgIH1cblxuICAgIGlmIChwcm9maWxlRGF0YS5iaXJ0aExvbmdpdHVkZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICBwcm9maWxlLmJpcnRoTG9uZ2l0dWRlID0gcHJvZmlsZURhdGEuYmlydGhMb25naXR1ZGU7XG4gICAgfVxuXG4gICAgaWYgKHByb2ZpbGVEYXRhLmlhbmFUaW1lWm9uZSkge1xuICAgICAgcHJvZmlsZS5pYW5hVGltZVpvbmUgPSBwcm9maWxlRGF0YS5pYW5hVGltZVpvbmU7XG4gICAgfVxuXG4gICAgaWYgKHByb2ZpbGVEYXRhLnN0YW5kYXJkaXplZExvY2F0aW9uTmFtZSkge1xuICAgICAgcHJvZmlsZS5zdGFuZGFyZGl6ZWRMb2NhdGlvbk5hbWUgPSBwcm9maWxlRGF0YS5zdGFuZGFyZGl6ZWRMb2NhdGlvbk5hbWU7XG4gICAgfVxuXG4gICAgY29uc3QgaXRlbSA9IHtcbiAgICAgIHVzZXJJZCxcbiAgICAgIGNyZWF0ZWRBdDogJ1BST0ZJTEUnLCAvLyBGaXhlZCBzb3J0IGtleSBmb3IgcHJvZmlsZSBkYXRhXG4gICAgICBlbWFpbDogcHJvZmlsZURhdGEuZW1haWwsXG4gICAgICBwcm9maWxlLFxuICAgICAgb25ib2FyZGluZ0NvbXBsZXRlZDogdHJ1ZSxcbiAgICAgIHVwZGF0ZWRBdDogbm93LFxuICAgICAgZmlyc3RDcmVhdGVkQXQ6IG5vdywgLy8gV2lsbCBiZSBvdmVyd3JpdHRlbiBpZiBwcm9maWxlIGFscmVhZHkgZXhpc3RzXG4gICAgfTtcblxuICAgIC8vIFNhdmUgdG8gRHluYW1vREJcbiAgICBhd2FpdCBkb2NDbGllbnQuc2VuZChcbiAgICAgIG5ldyBQdXRDb21tYW5kKHtcbiAgICAgICAgVGFibGVOYW1lOiBUQUJMRV9OQU1FLFxuICAgICAgICBJdGVtOiBpdGVtLFxuICAgICAgICBDb25kaXRpb25FeHByZXNzaW9uOiAnYXR0cmlidXRlX25vdF9leGlzdHModXNlcklkKSBPUiBhdHRyaWJ1dGVfZXhpc3RzKHVzZXJJZCknLFxuICAgICAgfSksXG4gICAgKTtcblxuICAgIHJldHVybiB7XG4gICAgICBzdGF0dXNDb2RlOiAyMDAsXG4gICAgICBoZWFkZXJzOiB7XG4gICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiAnKicsXG4gICAgICB9LFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICBtZXNzYWdlOiAnUHJvZmlsZSB1cGRhdGVkIHN1Y2Nlc3NmdWxseScsXG4gICAgICAgIHByb2ZpbGU6IGl0ZW0sXG4gICAgICB9KSxcbiAgICB9O1xuICB9IGNhdGNoIChlcnJvcikge1xuICAgIC8vIGVzbGludC1kaXNhYmxlLW5leHQtbGluZSBuby1jb25zb2xlXG4gICAgY29uc29sZS5lcnJvcignRXJyb3I6JywgZXJyb3IpO1xuICAgIHJldHVybiB7XG4gICAgICBzdGF0dXNDb2RlOiA1MDAsXG4gICAgICBoZWFkZXJzOiB7XG4gICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiAnKicsXG4gICAgICB9LFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ0ludGVybmFsIHNlcnZlciBlcnJvcicgfSksXG4gICAgfTtcbiAgfVxufTtcbiJdfQ==