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
        // Asynchronously invoke the natal chart generation Lambda
        const invocationPayload = {
            userId,
            birthDate: profileData.birthDate,
            birthTime: profileData.birthTime,
            latitude: profileData.birthLatitude,
            longitude: profileData.birthLongitude,
            ianaTimeZone: profileData.ianaTimeZone,
        };
        await lambdaClient.send(new client_lambda_1.InvokeCommand({
            FunctionName: GENERATE_NATAL_CHART_FUNCTION_NAME,
            InvocationType: 'Event', // Asynchronous invocation
            Payload: JSON.stringify(invocationPayload),
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
    catch {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidXBkYXRlLXVzZXItcHJvZmlsZS5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbInVwZGF0ZS11c2VyLXByb2ZpbGUudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQ0EsOERBQTBEO0FBQzFELHdEQUEyRTtBQUMzRSw4REFBMEY7QUFDMUYsMERBQXFFO0FBQ3JFLDBEQUFpQztBQUVqQyxNQUFNLFlBQVksR0FBRyxJQUFJLGdDQUFjLENBQUMsRUFBRSxDQUFDLENBQUM7QUFDNUMsTUFBTSxTQUFTLEdBQUcscUNBQXNCLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDO0FBQzVELE1BQU0sY0FBYyxHQUFHLElBQUksZ0NBQWMsQ0FBQyxFQUFFLENBQUMsQ0FBQztBQUM5QyxNQUFNLFlBQVksR0FBRyxJQUFJLDRCQUFZLENBQUMsRUFBRSxDQUFDLENBQUM7QUFFMUMsTUFBTSxVQUFVLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxVQUFXLENBQUM7QUFDM0MsTUFBTSxnQkFBZ0IsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLGdCQUFpQixDQUFDO0FBQ3ZELE1BQU0sa0NBQWtDLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxrQ0FBbUMsQ0FBQztBQXVCM0Y7O0dBRUc7QUFDSCxLQUFLLFVBQVUsVUFBVSxDQUFDLElBQVksRUFBRSxLQUFhLEVBQUUsT0FBZTtJQUNwRSxNQUFNLFVBQVUsR0FBRyxHQUFHLElBQUksS0FBSyxLQUFLLEtBQUssT0FBTyxFQUFFLENBQUM7SUFFbkQsSUFBSSxDQUFDO1FBQ0gsTUFBTSxPQUFPLEdBQUcsSUFBSSxnREFBOEIsQ0FBQztZQUNqRCxTQUFTLEVBQUUsZ0JBQWdCO1lBQzNCLElBQUksRUFBRSxVQUFVO1lBQ2hCLFVBQVUsRUFBRSxDQUFDO1NBQ2QsQ0FBQyxDQUFDO1FBQ0gsTUFBTSxRQUFRLEdBQUcsTUFBTSxjQUFjLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDO1FBRXBELElBQUksUUFBUSxD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bkM7WUFDRCxJQUFJLEVBQUUsSUFBSSxDQUFDLFNBQVMsQ0FBQztnQkFDbkIsT0FBTyxFQUFFLDhCQUE4QjtnQkFDdkMsT0FBTyxFQUFFLElBQUk7YUFDZCxDQUFDO1NBQ0gsQ0FBQztJQUNKLENBQUM7SUFBQyxNQUFNLENBQUM7UUFDUCxPQUFPO1lBQ0wsVUFBVSxFQUFFLEdBQUc7WUFDZixPQUFPLEVBQUU7Z0JBQ1AsY0FBYyxFQUFFLGtCQUFrQjtnQkFDbEMsNkJBQTZCLEVBQUUsR0FBRzthQUNuQztZQUNELElBQUksRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLEVBQUUsS0FBSyxFQUFFLHVCQUF1QixFQUFFLENBQUM7U0FDekQsQ0FBQztJQUNKLENBQUM7QUFDSCxDQUFDLENBQUM7QUFuTVcsUUFBQSxPQUFPLFdBbU1sQiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEFQSUdhdGV3YXlQcm94eUV2ZW50LCBBUElHYXRld2F5UHJveHlSZXN1bHQgfSBmcm9tICdhd3MtbGFtYmRhJztcbmltcG9ydCB7IER5bmFtb0RCQ2xpZW50IH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LWR5bmFtb2RiJztcbmltcG9ydCB7IER5bmFtb0RCRG9jdW1lbnRDbGllbnQsIFB1dENvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9saWItZHluYW1vZGInO1xuaW1wb3J0IHsgTG9jYXRpb25DbGllbnQsIFNlYXJjaFBsYWNlSW5kZXhGb3JUZXh0Q29tbWFuZCB9IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1sb2NhdGlvbic7XG5pbXBvcnQgeyBMYW1iZGFDbGllbnQsIEludm9rZUNvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9jbGllbnQtbGFtYmRhJztcbmltcG9ydCB0emxvb2t1cCBmcm9tICd0ei1sb29rdXAnO1xuXG5jb25zdCBkeW5hbW9DbGllbnQgPSBuZXcgRHluYW1vREJDbGllbnQoe30pO1xuY29uc3QgZG9jQ2xpZW50ID0gRHluYW1vREJEb2N1bWVudENsaWVudC5mcm9tKGR5bmFtb0NsaWVudCk7XG5jb25zdCBsb2NhdGlvbkNsaWVudCA9IG5ldyBMb2NhdGlvbkNsaWVudCh7fSk7XG5jb25zdCBsYW1iZGFDbGllbnQgPSBuZXcgTGFtYmRhQ2xpZW50KHt9KTtcblxuY29uc3QgVEFCTEVfTkFNRSA9IHByb2Nlc3MuZW52LlRBQkxFX05BTUUhO1xuY29uc3QgUExBQ0VfSU5ERVhfTkFNRSA9IHByb2Nlc3MuZW52LlBMQUNFX0lOREVYX05BTUUhO1xuY29uc3QgR0VORVJBVEVfTkFUQUxfQ0hBUlRfRlVOQ1RJT05fTkFNRSA9IHByb2Nlc3MuZW52LkdFTkVSQVRFX05BVEFMX0NIQVJUX0ZVTkNUSU9OX05BTUUhO1xuXG5pbnRlcmZhY2UgUHJvZmlsZURhdGEge1xuICBlbWFpbDogc3RyaW5nO1xuICBiaXJ0aE5hbWU6IHN0cmluZztcbiAgYmlydGhEYXRlOiBzdHJpbmc7XG4gIGJpcnRoVGltZT86IHN0cmluZztcbiAgYmlydGhDaXR5OiBzdHJpbmc7XG4gIGJpcnRoU3RhdGU6IHN0cmluZztcbiAgYmlydGhDb3VudHJ5OiBzdHJpbmc7XG4gIGJpcnRoTGF0aXR1ZGU/OiBudW1iZXI7XG4gIGJpcnRoTG9uZ2l0dWRlPzogbnVtYmVyO1xuICBpYW5hVGltZVpvbmU/OiBzdHJpbmc7XG4gIHN0YW5kYXJkaXplZExvY2F0aW9uTmFtZT86IHN0cmluZztcbn1cblxuaW50ZXJmYWNlIEdlb0RhdGEge1xuICBsYXRpdHVkZTogbnVtYmVyO1xuICBsb25naXR1ZGU6IG51bWJlcjtcbiAgaWFuYVRpbWVab25lOiBzdHJpbmc7XG4gIHN0YW5kYXJkaXplZExvY2F0aW9uTmFtZTogc3RyaW5nO1xufVxuXG4vKipcbiAqIEdlb2NvZGVzIGEgbG9jYXRpb24gYW5kIHJldHVybnMgaXRzIGNvb3JkaW5hdGVzLCB0aW1lIHpvbmUsIGFuZCBzdGFuZGFyZGl6ZWQgbmFtZS5cbiAqL1xuYXN5bmMgZnVuY3Rpb24gZ2V0R2VvRGF0YShjaXR5OiBzdHJpbmcsIHN0YXRlOiBzdHJpbmcsIGNvdW50cnk6IHN0cmluZyk6IFByb21pc2U8R2VvRGF0YSB8IG51bGw+IHtcbiAgY29uc3Qgc2VhcmNoVGV4dCA9IGAke2NpdHl9LCAke3N0YXRlfSwgJHtjb3VudHJ5fWA7XG5cbiAgdHJ5IHtcbiAgICBjb25zdCBjb21tYW5kID0gbmV3IFNlYXJjaFBsYWNlSW5kZXhGb3JUZXh0Q29tbWFuZCh7XG4gICAgICBJbmRleE5hbWU6IFBMQUNFX0lOREVYX05BTUUsXG4gICAgICBUZXh0OiBzZWFyY2hUZXh0LFxuICAgICAgTWF4UmVzdWx0czogMSxcbiAgICB9KTtcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGxvY2F0aW9uQ2xpZW50LnNlbmQoY29tbWFuZCk7XG5cbiAgICBpZiAocmVzcG9uc2UuUmVzdWx0cyAmJiByZXNwb25zZS5SZXN1bHRzLmxlbmd0aCA+IDAgJiYgcmVzcG9uc2UuUmVzdWx0c1swXS5QbGFjZSkge1xuICAgICAgY29uc3QgcGxhY2UgPSByZXNwb25zZS5SZXN1bHRzWzBdLlBsYWNlO1xuICAgICAgY29uc3QgW2xvbmdpdHVkZSwgbGF0aXR1ZGVdID0gcGxhY2UuR2VvbWV0cnk/LlBvaW50IHx8IFtdO1xuXG4gICAgICBpZiAobG9uZ2l0dWRlID09PSB1bmRlZmluZWQgfHwgbGF0aXR1ZGUgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIH1cblxuICAgICAgY29uc3QgaWFuYVRpbWVab25lID0gdHpsb29rdXAobGF0aXR1ZGUsIGxvbmdpdHVkZSk7XG4gICAgICBjb25zdCBzdGFuZGFyZGl6ZWRMb2NhdGlvbk5hbWUgPSBwbGFjZS5MYWJlbCB8fCBzZWFyY2hUZXh0O1xuXG4gICAgICByZXR1cm4ge1xuICAgICAgICBsYXRpdHVkZTogcGFyc2VGbG9hdChsYXRpdHVkZS50b0ZpeGVkKDYpKSxcbiAgICAgICAgbG9uZ2l0dWRlOiBwYXJzZUZsb2F0KGxvbmdpdHVkZS50b0ZpeGVkKDYpKSxcbiAgICAgICAgaWFuYVRpbWVab25lLFxuICAgICAgICBzdGFuZGFyZGl6ZWRMb2NhdGlvbk5hbWUsXG4gICAgICB9O1xuICAgIH1cbiAgICByZXR1cm4gbnVsbDtcbiAgfSBjYXRjaCB7XG4gICAgLy8gUmUtdGhyb3cgb3IgaGFuZGxlIGFzIGEgbm9uLWJsb2NraW5nIGVycm9yXG4gICAgdGhyb3cgbmV3IEVycm9yKCdGYWlsZWQgdG8gZ2VvY29kZSBsb2NhdGlvbiBkdWUgdG8gYSBzZXJ2aWNlIGVycm9yLicpO1xuICB9XG59XG5cbmludGVyZmFjZSBWYWxpZGF0aW9uRXJyb3Ige1xuICBmaWVsZDogc3RyaW5nO1xuICBtZXNzYWdlOiBzdHJpbmc7XG59XG5cbmNvbnN0IHZhbGlkYXRlQmlydGhEYXRhID0gKGRhdGE6IGFueSk6IFZhbGlkYXRpb25FcnJvcltdID0+IHtcbiAgY29uc3QgZXJyb3JzOiBWYWxpZGF0aW9uRXJyb3JbXSA9IFtdO1xuXG4gIC8vIEVtYWlsIHZhbGlkYXRpb25cbiAgaWYgKCFkYXRhLmVtYWlsIHx8IHR5cGVvZiBkYXRhLmVtYWlsICE9PSAnc3RyaW5nJykge1xuICAgIGVycm9ycy5wdXNoKHsgZmllbGQ6ICdlbWFpbCcsIG1lc3NhZ2U6ICdFbWFpbCBpcyByZXF1aXJlZCcgfSk7XG4gIH0gZWxzZSBpZiAoIS9eW15cXHNAXStAW15cXHNAXStcXC5bXlxcc0BdKyQvLnRlc3QoZGF0YS5lbWFpbCkpIHtcbiAgICBlcnJvcnMucHVzaCh7IGZpZWxkOiAnZW1haWwnLCBtZXNzYWdlOiAnSW52YWxpZCBlbWFpbCBmb3JtYXQnIH0pO1xuICB9XG5cbiAgLy8gQmlydGggbmFtZSB2YWxpZGF0aW9uXG4gIGlmICghZGF0YS5iaXJ0aE5hbWUgfHwgdHlwZW9mIGRhdGEuYmlydGhOYW1lICE9PSAnc3RyaW5nJykge1xuICAgIGVycm9ycy5wdXNoKHsgZmllbGQ6ICdiaXJ0aE5hbWUnLCBtZXNzYWdlOiAnQmlydGggbmFtZSBpcyByZXF1aXJlZCcgfSk7XG4gIH0gZWxzZSBpZiAoZGF0YS5iaXJ0aE5hbWUudHJpbSgpLmxlbmd0aCA9PT0gMCB8fCBkYXRhLmJpcnRoTmFtZS5sZW5ndGggPiAyNTYpIHtcbiAgICBlcnJvcnMucHVzaCh7IGZpZWxkOiAnYmlydGhOYW1lJywgbWVzc2FnZTogJ0JpcnRoIG5hbWUgbXVzdCBiZSAxLTI1NiBjaGFyYWN0ZXJzJyB9KTtcbiAgfSBlbHNlIGlmICghL15bYS16QS1aXFxzXFwtJ10rJC8udGVzdChkYXRhLmJpcnRoTmFtZSkpIHtcbiAgICBlcnJvcnMucHVzaCh7IGZpZWxkOiAnYmlydGhOYW1lJywgbWVzc2FnZTogJ0JpcnRoIG5hbWUgY29udGFpbnMgaW52YWxpZCBjaGFyYWN0ZXJzJyB9KTtcbiAgfVxuXG4gIC8vIEJpcnRoIGRhdGUgdmFsaWRhdGlvblxuICBpZiAoIWRhdGEuYmlydGhEYXRlIHx8IHR5cGVvZiBkYXRhLmJpcnRoRGF0ZSAhPT0gJ3N0cmluZycpIHtcbiAgICBlcnJvcnMucHVzaCh7IGZpZWxkOiAnYmlydGhEYXRlJywgbWVzc2FnZTogJ0JpcnRoIGRhdGUgaXMgcmVxdWlyZWQnIH0pO1xuICB9IGVsc2UgaWYgKCEvXlxcZHs0fS1cXGR7Mn0tXFxkezJ9JC8udGVzdChkYXRhLmJpcnRoRGF0ZSkpIHtcbiAgICBlcnJvcnMucHVzaCh7IGZpZWxkOiAnYmlydGhEYXRlJywgbWVzc2FnZTogJ0JpcnRoIGRhdGUgbXVzdCBiZSBpbiBZWVlZLU1NLUREIGZvcm1hdCcgfSk7XG4gIH0gZWxzZSB7XG4gICAgY29uc3QgZGF0ZSA9IG5ldyBEYXRlKGRhdGEuYmlydGhEYXRlKTtcbiAgICBjb25zdCBub3cgPSBuZXcgRGF0ZSgpO1xuICAgIGNvbnN0IG1pbkRhdGUgPSBuZXcgRGF0ZSgnMTkwMC0wMS0wMScpO1xuXG4gICAgaWYgKGlzTmFOKGRhdGUuZ2V0VGltZSgpKSkge1xuICAgICAgZXJyb3JzLnB1c2goeyBmaWVsZDogJ2JpcnRoRGF0ZScsIG1lc3NhZ2U6ICdJbnZhbGlkIGJpcnRoIGRhdGUnIH0pO1xuICAgIH0gZWxzZSBpZiAoZGF0ZSA+IG5vdykge1xuICAgICAgZXJyb3JzLnB1c2goeyBmaWVsZDogJ2JpcnRoRGF0ZScsIG1lc3NhZ2U6ICdCaXJ0aCBkYXRlIGNhbm5vdCBiZSBpbiB0aGUgZnV0dXJlJyB9KTtcbiAgICB9IGVsc2UgaWYgKGRhdGUgPCBtaW5EYXRlKSB7XG4gICAgICBlcnJvcnMucHVzaCh7IGZpZWxkOiAnYmlydGhEYXRlJywgbWVzc2FnZTogJ0JpcnRoIGRhdGUgY2Fubm90IGJlIGJlZm9yZSAxOTAwJyB9KTtcbiAgICB9XG4gIH1cblxuICAvLyBCaXJ0aCB0aW1lIHZhbGlkYXRpb24gKG9wdGlvbmFsKVxuICBpZiAoZGF0YS5iaXJ0aFRpbWUgJiYgdHlwZW9mIGRhdGEuYmlydGhUaW1lID09PSAnc3RyaW5nJykge1xuICAgIGlmICghL14oWzAtMV0/WzAtOV18MlswLTNdKTpbMC01XVswLTldJC8udGVzdChkYXRhLmJpcnRoVGltZSkpIHtcbiAgICAgIGVycm9ycy5wdXNoKHsgZmllbGQ6ICdiaXJ0aFRpbWUnLCBtZXNzYWdlOiAnQmlydGggdGltZSBtdXN0IGJlIGluIEhIOk1NIGZvcm1hdCAoMjQtaG91ciknIH0pO1xuICAgIH1cbiAgfVxuXG4gIC8vIExvY2F0aW9uIHZhbGlkYXRpb25cbiAgY29uc3QgbG9jYXRpb25SZWdleCA9IC9eW2EtekEtWlxcc1xcLScsXFwuXSskLztcblxuICBpZiAoIWRhdGEuYmlydGhDaXR5IHx8IHR5cGVvZiBkYXRhLmJpcnRoQ2l0eSAhPT0gJ3N0cmluZycpIHtcbiAgICBlcnJvcnMucHVzaCh7IGZpZWxkOiAnYmlydGhDaXR5JywgbWVzc2FnZTogJ0JpcnRoIGNpdHkgaXMgcmVxdWlyZWQnIH0pO1xuICB9IGVsc2UgaWYgKGRhdGEuYmlydGhDaXR5LnRyaW0oKS5sZW5ndGggPT09IDAgfHwgZGF0YS5iaXJ0aENpdHkubGVuZ3RoID4gMTAwKSB7XG4gICAgZXJyb3JzLnB1c2goeyBmaWVsZDogJ2JpcnRoQ2l0eScsIG1lc3NhZ2U6ICdCaXJ0aCBjaXR5IG11c3QgYmUgMS0xMDAgY2hhcmFjdGVycycgfSk7XG4gIH0gZWxzZSBpZiAoIWxvY2F0aW9uUmVnZXgudGVzdChkYXRhLmJpcnRoQ2l0eSkpIHtcbiAgICBlcnJvcnMucHVzaCh7IGZpZWxkOiAnYmlydGhDaXR5JywgbWVzc2FnZTogJ0JpcnRoIGNpdHkgY29udGFpbnMgaW52YWxpZCBjaGFyYWN0ZXJzJyB9KTtcbiAgfVxuXG4gIGlmICghZGF0YS5iaXJ0aFN0YXRlIHx8IHR5cGVvZiBkYXRhLmJpcnRoU3RhdGUgIT09ICdzdHJpbmcnKSB7XG4gICAgZXJyb3JzLnB1c2goeyBmaWVsZDogJ2JpcnRoU3RhdGUnLCBtZXNzYWdlOiAnQmlydGggc3RhdGUvcHJvdmluY2UgaXMgcmVxdWlyZWQnIH0pO1xuICB9IGVsc2UgaWYgKGRhdGEuYmlydGhTdGF0ZS50cmltKCkubGVuZ3RoID09PSAwIHx8IGRhdGEuYmlydGhTdGF0ZS5sZW5ndGggPiAxMDApIHtcbiAgICBlcnJvcnMucHVzaCh7IGZpZWxkOiAnYmlydGhTdGF0ZScsIG1lc3NhZ2U6ICdCaXJ0aCBzdGF0ZSBtdXN0IGJlIDEtMTAwIGNoYXJhY3RlcnMnIH0pO1xuICB9IGVsc2UgaWYgKCFsb2NhdGlvblJlZ2V4LnRlc3QoZGF0YS5iaXJ0aFN0YXRlKSkge1xuICAgIGVycm9ycy5wdXNoKHsgZmllbGQ6ICdiaXJ0aFN0YXRlJywgbWVzc2FnZTogJ0JpcnRoIHN0YXRlIGNvbnRhaW5zIGludmFsaWQgY2hhcmFjdGVycycgfSk7XG4gIH1cblxuICBpZiAoIWRhdGEuYmlydGhDb3VudHJ5IHx8IHR5cGVvZiBkYXRhLmJpcnRoQ291bnRyeSAhPT0gJ3N0cmluZycpIHtcbiAgICBlcnJvcnMucHVzaCh7IGZpZWxkOiAnYmlydGhDb3VudHJ5JywgbWVzc2FnZTogJ0JpcnRoIGNvdW50cnkgaXMgcmVxdWlyZWQnIH0pO1xuICB9IGVsc2UgaWYgKGRhdGEuYmlydGhDb3VudHJ5LnRyaW0oKS5sZW5ndGggPT09IDAgfHwgZGF0YS5iaXJ0aENvdW50cnkubGVuZ3RoID4gMTAwKSB7XG4gICAgZXJyb3JzLnB1c2goeyBmaWVsZDogJ2JpcnRoQ291bnRyeScsIG1lc3NhZ2U6ICdCaXJ0aCBjb3VudHJ5IG11c3QgYmUgMS0xMDAgY2hhcmFjdGVycycgfSk7XG4gIH0gZWxzZSBpZiAoIWxvY2F0aW9uUmVnZXgudGVzdChkYXRhLmJpcnRoQ291bnRyeSkpIHtcbiAgICBlcnJvcnMucHVzaCh7IGZpZWxkOiAnYmlydGhDb3VudHJ5JywgbWVzc2FnZTogJ0JpcnRoIGNvdW50cnkgY29udGFpbnMgaW52YWxpZCBjaGFyYWN0ZXJzJyB9KTtcbiAgfVxuXG4gIC8vIEZ1dHVyZSBsYXQvbG9uZyB2YWxpZGF0aW9uICh3aGVuIHByb3ZpZGVkKVxuICBpZiAoZGF0YS5iaXJ0aExhdGl0dWRlICE9PSB1bmRlZmluZWQpIHtcbiAgICBjb25zdCBsYXQgPSBwYXJzZUZsb2F0KGRhdGEuYmlydGhMYXRpdHVkZSk7XG4gICAgaWYgKGlzTmFOKGxhdCkgfHwgbGF0IDwgLTkwIHx8IGxhdCA+IDkwKSB7XG4gICAgICBlcnJvcnMucHVzaCh7IGZpZWxkOiAnYmlydGhMYXRpdHVkZScsIG1lc3NhZ2U6ICdJbnZhbGlkIGxhdGl0dWRlJyB9KTtcbiAgICB9XG4gIH1cblxuICBpZiAoZGF0YS5iaXJ0aExvbmdpdHVkZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgY29uc3QgbG5nID0gcGFyc2VGbG9hdChkYXRhLmJpcnRoTG9uZ2l0dWRlKTtcbiAgICBpZiAoaXNOYU4obG5nKSB8fCBsbmcgPCAtMTgwIHx8IGxuZyA+IDE4MCkge1xuICAgICAgZXJyb3JzLnB1c2goeyBmaWVsZDogJ2JpcnRoTG9uZ2l0dWRlJywgbWVzc2FnZTogJ0ludmFsaWQgbG9uZ2l0dWRlJyB9KTtcbiAgICB9XG4gIH1cblxuICByZXR1cm4gZXJyb3JzO1xufTtcblxuZXhwb3J0IGNvbnN0IGhhbmRsZXIgPSBhc3luYyAoZXZlbnQ6IEFQSUdhdGV3YXlQcm94eUV2ZW50KTogUHJvbWlzZTxBUElHYXRld2F5UHJveHlSZXN1bHQ+ID0+IHtcbiAgdHJ5IHtcbiAgICAvLyBFeHRyYWN0IHVzZXJJZCBmcm9tIHBhdGggcGFyYW1ldGVyc1xuICAgIGNvbnN0IHVzZXJJZCA9IGV2ZW50LnBhdGhQYXJhbWV0ZXJzPy51c2VySWQ7XG4gICAgaWYgKCF1c2VySWQpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMCxcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6ICcqJyxcbiAgICAgICAgfSxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ01pc3NpbmcgdXNlcklkIHBhcmFtZXRlcicgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIEV4dHJhY3QgdXNlciBzdWIgZnJvbSBhdXRob3JpemVyIGNvbnRleHRcbiAgICBjb25zdCBhdXRob3JpemVyVXNlcklkID0gZXZlbnQucmVxdWVzdENvbnRleHQuYXV0aG9yaXplcj8uY2xhaW1zPy5zdWI7XG5cbiAgICBpZiAoIWF1dGhvcml6ZXJVc2VySWQpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMSxcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6ICcqJyxcbiAgICAgICAgfSxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ1VuYXV0aG9yaXplZCcgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIFZlcmlmeSB1c2VyIGNhbiBvbmx5IHVwZGF0ZSB0aGVpciBvd24gcHJvZmlsZVxuICAgIGlmICh1c2VySWQgIT09IGF1dGhvcml6ZXJVc2VySWQpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMyxcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6ICcqJyxcbiAgICAgICAgfSxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoeyBlcnJvcjogJ0ZvcmJpZGRlbicgfSksXG4gICAgICB9O1xuICAgIH1cblxuICAgIC8vIFBhcnNlIHJlcXVlc3QgYm9keVxuICAgIGxldCBwcm9maWxlRGF0YTogUHJvZmlsZURhdGE7XG4gICAgdHJ5IHtcbiAgICAgIHByb2ZpbGVEYXRhID0gSlNPTi5wYXJzZShldmVudC5ib2R5IHx8ICd7fScpO1xuICAgIH0gY2F0Y2gge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNDAwLFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogJyonLFxuICAgICAgICB9LFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnSW52YWxpZCBKU09OIGJvZHknIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBHZW9jb2RlIGxvY2F0aW9uXG4gICAgY29uc3QgZ2VvRGF0YSA9IGF3YWl0IGdldEdlb0RhdGEoXG4gICAgICBwcm9maWxlRGF0YS5iaXJ0aENpdHksXG4gICAgICBwcm9maWxlRGF0YS5iaXJ0aFN0YXRlLFxuICAgICAgcHJvZmlsZURhdGEuYmlydGhDb3VudHJ5LFxuICAgICk7XG5cbiAgICBpZiAoIWdlb0RhdGEpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIHN0YXR1c0NvZGU6IDQwMCxcbiAgICAgICAgaGVhZGVyczoge1xuICAgICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6ICcqJyxcbiAgICAgICAgfSxcbiAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgIGVycm9yOiAnVmFsaWRhdGlvbiBmYWlsZWQnLFxuICAgICAgICAgIHZhbGlkYXRpb25FcnJvcnM6IFtcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgZmllbGQ6ICdiaXJ0aENpdHknLFxuICAgICAgICAgICAgICBtZXNzYWdlOiAnQ291bGQgbm90IGZpbmQgYSB2YWxpZCBsb2NhdGlvbiBmb3IgdGhlIGNpdHksIHN0YXRlLCBhbmQgY291bnRyeSBwcm92aWRlZC4nLFxuICAgICAgICAgICAgfSxcbiAgICAgICAgICBdLFxuICAgICAgICB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gQWRkIGdlbyBkYXRhIHRvIHByb2ZpbGVcbiAgICBwcm9maWxlRGF0YS5iaXJ0aExhdGl0dWRlID0gZ2VvRGF0YS5sYXRpdHVkZTtcbiAgICBwcm9maWxlRGF0YS5iaXJ0aExvbmdpdHVkZSA9IGdlb0RhdGEubG9uZ2l0dWRlO1xuICAgIHByb2ZpbGVEYXRhLmlhbmFUaW1lWm9uZSA9IGdlb0RhdGEuaWFuYVRpbWVab25lO1xuICAgIHByb2ZpbGVEYXRhLnN0YW5kYXJkaXplZExvY2F0aW9uTmFtZSA9IGdlb0RhdGEuc3RhbmRhcmRpemVkTG9jYXRpb25OYW1lO1xuXG4gICAgLy8gVmFsaWRhdGUgcHJvZmlsZSBkYXRhXG4gICAgY29uc3QgdmFsaWRhdGlvbkVycm9ycyA9IHZhbGlkYXRlQmlydGhEYXRhKHByb2ZpbGVEYXRhKTtcbiAgICBpZiAodmFsaWRhdGlvbkVycm9ycy5sZW5ndGggPiAwKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBzdGF0dXNDb2RlOiA0MDAsXG4gICAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiAnKicsXG4gICAgICAgIH0sXG4gICAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHtcbiAgICAgICAgICBlcnJvcjogJ1ZhbGlkYXRpb24gZmFpbGVkJyxcbiAgICAgICAgICB2YWxpZGF0aW9uRXJyb3JzLFxuICAgICAgICB9KSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgLy8gUHJlcGFyZSBpdGVtIGZvciBEeW5hbW9EQlxuICAgIGNvbnN0IG5vdyA9IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKTtcblxuICAgIC8vIEJ1aWxkIHByb2ZpbGUgb2JqZWN0IHdpdGhvdXQgdW5kZWZpbmVkIHZhbHVlc1xuICAgIGNvbnN0IHByb2ZpbGU6IGFueSA9IHtcbiAgICAgIGJpcnRoTmFtZTogcHJvZmlsZURhdGEuYmlydGhOYW1lLnRyaW0oKSxcbiAgICAgIGJpcnRoRGF0ZTogcHJvZmlsZURhdGEuYmlydGhEYXRlLFxuICAgICAgYmlydGhDaXR5OiBwcm9maWxlRGF0YS5iaXJ0aENpdHkudHJpbSgpLFxuICAgICAgYmlydGhTdGF0ZTogcHJvZmlsZURhdGEuYmlydGhTdGF0ZS50cmltKCksXG4gICAgICBiaXJ0aENvdW50cnk6IHByb2ZpbGVEYXRhLmJpcnRoQ291bnRyeS50cmltKCksXG4gICAgfTtcblxuICAgIC8vIE9ubHkgYWRkIG9wdGlvbmFsIGZpZWxkcyBpZiB0aGV5IGhhdmUgdmFsdWVzXG4gICAgaWYgKHByb2ZpbGVEYXRhLmJpcnRoVGltZSkge1xuICAgICAgcHJvZmlsZS5iaXJ0aFRpbWUgPSBwcm9maWxlRGF0YS5iaXJ0aFRpbWUudHJpbSgpO1xuICAgIH1cblxuICAgIGlmIChwcm9maWxlRGF0YS5iaXJ0aExhdGl0dWRlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIHByb2ZpbGUuYmlydGhMYXRpdHVkZSA9IHByb2ZpbGVEYXRhLmJpcnRoTGF0aXR1ZGU7XG4gICAgfVxuXG4gICAgaWYgKHByb2ZpbGVEYXRhLmJpcnRoTG9uZ2l0dWRlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIHByb2ZpbGUuYmlydGhMb25naXR1ZGUgPSBwcm9maWxlRGF0YS5iaXJ0aExvbmdpdHVkZTtcbiAgICB9XG5cbiAgICBpZiAocHJvZmlsZURhdGEuaWFuYVRpbWVab25lKSB7XG4gICAgICBwcm9maWxlLmlhbmFUaW1lWm9uZSA9IHByb2ZpbGVEYXRhLmlhbmFUaW1lWm9uZTtcbiAgICB9XG5cbiAgICBpZiAocHJvZmlsZURhdGEuc3RhbmRhcmRpemVkTG9jYXRpb25OYW1lKSB7XG4gICAgICBwcm9maWxlLnN0YW5kYXJkaXplZExvY2F0aW9uTmFtZSA9IHByb2ZpbGVEYXRhLnN0YW5kYXJkaXplZExvY2F0aW9uTmFtZTtcbiAgICB9XG5cbiAgICBjb25zdCBpdGVtID0ge1xuICAgICAgdXNlcklkLFxuICAgICAgY3JlYXRlZEF0OiAnUFJPRklMRScsIC8vIEZpeGVkIHNvcnQga2V5IGZvciBwcm9maWxlIGRhdGFcbiAgICAgIGVtYWlsOiBwcm9maWxlRGF0YS5lbWFpbCxcbiAgICAgIHByb2ZpbGUsXG4gICAgICBvbmJvYXJkaW5nQ29tcGxldGVkOiB0cnVlLFxuICAgICAgdXBkYXRlZEF0OiBub3csXG4gICAgICBmaXJzdENyZWF0ZWRBdDogbm93LCAvLyBXaWxsIGJlIG92ZXJ3cml0dGVuIGlmIHByb2ZpbGUgYWxyZWFkeSBleGlzdHNcbiAgICB9O1xuXG4gICAgLy8gU2F2ZSB0byBEeW5hbW9EQlxuICAgIGF3YWl0IGRvY0NsaWVudC5zZW5kKFxuICAgICAgbmV3IFB1dENvbW1hbmQoe1xuICAgICAgICBUYWJsZU5hbWU6IFRBQkxFX05BTUUsXG4gICAgICAgIEl0ZW06IGl0ZW0sXG4gICAgICAgIENvbmRpdGlvbkV4cHJlc3Npb246ICdhdHRyaWJ1dGVfbm90X2V4aXN0cyh1c2VySWQpIE9SIGF0dHJpYnV0ZV9leGlzdHModXNlcklkKScsXG4gICAgICB9KSxcbiAgICApO1xuXG4gICAgLy8gQXN5bmNocm9ub3VzbHkgaW52b2tlIHRoZSBuYXRhbCBjaGFydCBnZW5lcmF0aW9uIExhbWJkYVxuICAgIGNvbnN0IGludm9jYXRpb25QYXlsb2FkID0ge1xuICAgICAgdXNlcklkLFxuICAgICAgYmlydGhEYXRlOiBwcm9maWxlRGF0YS5iaXJ0aERhdGUsXG4gICAgICBiaXJ0aFRpbWU6IHByb2ZpbGVEYXRhLmJpcnRoVGltZSxcbiAgICAgIGxhdGl0dWRlOiBwcm9maWxlRGF0YS5iaXJ0aExhdGl0dWRlLFxuICAgICAgbG9uZ2l0dWRlOiBwcm9maWxlRGF0YS5iaXJ0aExvbmdpdHVkZSxcbiAgICAgIGlhbmFUaW1lWm9uZTogcHJvZmlsZURhdGEuaWFuYVRpbWVab25lLFxuICAgIH07XG5cbiAgICBhd2FpdCBsYW1iZGFDbGllbnQuc2VuZChcbiAgICAgIG5ldyBJbnZva2VDb21tYW5kKHtcbiAgICAgICAgRnVuY3Rpb25OYW1lOiBHRU5FUkFURV9OQVRBTF9DSEFSVF9GVU5DVElPTl9OQU1FLFxuICAgICAgICBJbnZvY2F0aW9uVHlwZTogJ0V2ZW50JywgLy8gQXN5bmNocm9ub3VzIGludm9jYXRpb25cbiAgICAgICAgUGF5bG9hZDogSlNPTi5zdHJpbmdpZnkoaW52b2NhdGlvblBheWxvYWQpLFxuICAgICAgfSksXG4gICAgKTtcblxuICAgIHJldHVybiB7XG4gICAgICBzdGF0dXNDb2RlOiAyMDAsXG4gICAgICBoZWFkZXJzOiB7XG4gICAgICAgICdDb250ZW50LVR5cGUnOiAnYXBwbGljYXRpb24vanNvbicsXG4gICAgICAgICdBY2Nlc3MtQ29udHJvbC1BbGxvdy1PcmlnaW4nOiAnKicsXG4gICAgICB9LFxuICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICBtZXNzYWdlOiAnUHJvZmlsZSB1cGRhdGVkIHN1Y2Nlc3NmdWxseScsXG4gICAgICAgIHByb2ZpbGU6IGl0ZW0sXG4gICAgICB9KSxcbiAgICB9O1xuICB9IGNhdGNoIHtcbiAgICByZXR1cm4ge1xuICAgICAgc3RhdHVzQ29kZTogNTAwLFxuICAgICAgaGVhZGVyczoge1xuICAgICAgICAnQ29udGVudC1UeXBlJzogJ2FwcGxpY2F0aW9uL2pzb24nLFxuICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogJyonLFxuICAgICAgfSxcbiAgICAgIGJvZHk6IEpTT04uc3RyaW5naWZ5KHsgZXJyb3I6ICdJbnRlcm5hbCBzZXJ2ZXIgZXJyb3InIH0pLFxuICAgIH07XG4gIH1cbn07XG4iXX0=