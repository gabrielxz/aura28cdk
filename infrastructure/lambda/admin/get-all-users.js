"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_cognito_identity_provider_1 = require("@aws-sdk/client-cognito-identity-provider");
const cognitoClient = new client_cognito_identity_provider_1.CognitoIdentityProviderClient({});
const USER_POOL_ID = process.env.USER_POOL_ID;
const handler = async (event) => {
    console.info('Get all users event:', JSON.stringify(event, null, 2));
    try {
        // Check if user is admin
        const userGroups = event.requestContext.authorizer?.claims?.['cognito:groups'];
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
        // Parse query parameters
        const queryParams = event.queryStringParameters || {};
        const searchTerm = queryParams.search;
        const nextToken = queryParams.nextToken;
        // Build list users parameters
        const listUsersParams = {
            UserPoolId: USER_POOL_ID,
            Limit: 60, // Max allowed by Cognito
            PaginationToken: nextToken,
        };
        // Add filter if search term provided
        if (searchTerm) {
            // Search by email
            listUsersParams.Filter = `email ^= "${searchTerm}"`;
        }
        // List users from Cognito
        const listUsersResult = await cognitoClient.send(new client_cognito_identity_provider_1.ListUsersCommand(listUsersParams));
        // Transform user data
        const users = (listUsersResult.Users || []).map((user) => {
            const emailAttr = user.Attributes?.find((attr) => attr.Name === 'email');
            const givenNameAttr = user.Attributes?.find((attr) => attr.Name === 'given_name');
            const familyNameAttr = user.Attributes?.find((attr) => attr.Name === 'family_name');
            const name = givenNameAttr?.Value && familyNameAttr?.Value
                ? `${givenNameAttr.Value} ${familyNameAttr.Value}`
                : givenNameAttr?.Value || familyNameAttr?.Value || undefined;
            return {
                userId: user.Username,
                email: emailAttr?.Value || 'No email',
                name,
                createdAt: user.UserCreateDate?.toISOString() || '',
            };
        });
        // Prepare response
        const response = {
            users,
            count: users.length,
            nextToken: listUsersResult.PaginationToken,
        };
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
            },
            body: JSON.stringify(response),
        };
    }
    catch (error) {
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2V0LWFsbC11c2Vycy5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbImdldC1hbGwtdXNlcnMudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6Ijs7O0FBQ0EsZ0dBSW1EO0FBRW5ELE1BQU0sYUFBYSxHQUFHLElBQUksZ0VBQTZCLENBQUMsRUFBRSxDQUFDLENBQUM7QUFDNUQsTUFBTSxZQUFZLEdBQUcsT0FBTyxDQUFDLEdBQUcsQ0FBQyxZQUFhLENBQUM7QUFFeEMsTUFBTSxPQUFPLEdBQUcsS0FBSyxFQUFFLEtBQTJCLEVBQWtDLEVBQUU7SUFDM0YsT0FBTyxDQUFDLElBQUksQ0FBQyxzQkFBc0IsRUFBRSxJQUFJLENBQUMsU0FBUyxDQUFDLEtBQUssRUFBRSxJQUFJLEVBQUUsQ0FBQyxDQUFDLENBQUMsQ0FBQztJQUVyRSxJQUFJLENBQUM7UUFDSCx5QkFBeUI7UUFDekIsTUFBTSxVQUFVLEdBQUcsS0FBSyxDQUFDLGNBQWMsQ0FBQyxVQUFVLEVBQUUsTUFBTSxFQUFFLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztRQUMvRSxNQUFNLE9BQU8sR0FDWCxVQUFVO1lBQ1YsQ0FBQyxPQUFPLFVBQVUsS0FBSyxRQUFRO2dCQUM3QixDQUFDLENBQUMsVUFBVSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxRQUFRLENBQUMsT0FBTyxDQUFDO2dCQUN6QyxDQUFDLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxVQUFVLENBQUMsSUFBSSxVQUFVLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxDQUFDLENBQUM7UUFFakUsSUFBSSxDQUFDLE9BQU8sRUFBRSxDQUFDO1lBQ2IsT0FBTztnQkFDTCxVQUFVLEVBQUUsR0FBRztnQkFDZixPQUFPLEVBQUU7b0JBQ1AsY0FBYyxFQUFFLGtCQUFrQjtvQkFDbEMsNkJBQTZCLEVBQUUsR0FBRztpQkFDbkM7Z0JBQ0QsSUFBSSxFQUFFLElBQUksQ0FBQyxTQUFTLENBQUMsRUFBRSxLQUFLLEVBQUUsMkNBQTJDLEVBQUUs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QUFFLHVCQUF1QixFQUFFLENBQUM7U0FDekQsQ0FBQztJQUNKLENBQUM7QUFDSCxDQUFDLENBQUM7QUF6RlcsUUFBQSxPQUFPLFdBeUZsQiIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IEFQSUdhdGV3YXlQcm94eUV2ZW50LCBBUElHYXRld2F5UHJveHlSZXN1bHQgfSBmcm9tICdhd3MtbGFtYmRhJztcbmltcG9ydCB7XG4gIENvZ25pdG9JZGVudGl0eVByb3ZpZGVyQ2xpZW50LFxuICBMaXN0VXNlcnNDb21tYW5kLFxuICBMaXN0VXNlcnNDb21tYW5kSW5wdXQsXG59IGZyb20gJ0Bhd3Mtc2RrL2NsaWVudC1jb2duaXRvLWlkZW50aXR5LXByb3ZpZGVyJztcblxuY29uc3QgY29nbml0b0NsaWVudCA9IG5ldyBDb2duaXRvSWRlbnRpdHlQcm92aWRlckNsaWVudCh7fSk7XG5jb25zdCBVU0VSX1BPT0xfSUQgPSBwcm9jZXNzLmVudi5VU0VSX1BPT0xfSUQhO1xuXG5leHBvcnQgY29uc3QgaGFuZGxlciA9IGFzeW5jIChldmVudDogQVBJR2F0ZXdheVByb3h5RXZlbnQpOiBQcm9taXNlPEFQSUdhdGV3YXlQcm94eVJlc3VsdD4gPT4ge1xuICBjb25zb2xlLmluZm8oJ0dldCBhbGwgdXNlcnMgZXZlbnQ6JywgSlNPTi5zdHJpbmdpZnkoZXZlbnQsIG51bGwsIDIpKTtcblxuICB0cnkge1xuICAgIC8vIENoZWNrIGlmIHVzZXIgaXMgYWRtaW5cbiAgICBjb25zdCB1c2VyR3JvdXBzID0gZXZlbnQucmVxdWVzdENvbnRleHQuYXV0aG9yaXplcj8uY2xhaW1zPy5bJ2NvZ25pdG86Z3JvdXBzJ107XG4gICAgY29uc3QgaXNBZG1pbiA9XG4gICAgICB1c2VyR3JvdXBzICYmXG4gICAgICAodHlwZW9mIHVzZXJHcm91cHMgPT09ICdzdHJpbmcnXG4gICAgICAgID8gdXNlckdyb3Vwcy5zcGxpdCgnLCcpLmluY2x1ZGVzKCdhZG1pbicpXG4gICAgICAgIDogQXJyYXkuaXNBcnJheSh1c2VyR3JvdXBzKSAmJiB1c2VyR3JvdXBzLmluY2x1ZGVzKCdhZG1pbicpKTtcblxuICAgIGlmICghaXNBZG1pbikge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgc3RhdHVzQ29kZTogNDAzLFxuICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgICAnQWNjZXNzLUNvbnRyb2wtQWxsb3ctT3JpZ2luJzogJyonLFxuICAgICAgICB9LFxuICAgICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnQWNjZXNzIGRlbmllZC4gQWRtaW4gcHJpdmlsZWdlcyByZXF1aXJlZC4nIH0pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICAvLyBQYXJzZSBxdWVyeSBwYXJhbWV0ZXJzXG4gICAgY29uc3QgcXVlcnlQYXJhbXMgPSBldmVudC5xdWVyeVN0cmluZ1BhcmFtZXRlcnMgfHwge307XG4gICAgY29uc3Qgc2VhcmNoVGVybSA9IHF1ZXJ5UGFyYW1zLnNlYXJjaDtcbiAgICBjb25zdCBuZXh0VG9rZW4gPSBxdWVyeVBhcmFtcy5uZXh0VG9rZW47XG5cbiAgICAvLyBCdWlsZCBsaXN0IHVzZXJzIHBhcmFtZXRlcnNcbiAgICBjb25zdCBsaXN0VXNlcnNQYXJhbXM6IExpc3RVc2Vyc0NvbW1hbmRJbnB1dCA9IHtcbiAgICAgIFVzZXJQb29sSWQ6IFVTRVJfUE9PTF9JRCxcbiAgICAgIExpbWl0OiA2MCwgLy8gTWF4IGFsbG93ZWQgYnkgQ29nbml0b1xuICAgICAgUGFnaW5hdGlvblRva2VuOiBuZXh0VG9rZW4sXG4gICAgfTtcblxuICAgIC8vIEFkZCBmaWx0ZXIgaWYgc2VhcmNoIHRlcm0gcHJvdmlkZWRcbiAgICBpZiAoc2VhcmNoVGVybSkge1xuICAgICAgLy8gU2VhcmNoIGJ5IGVtYWlsXG4gICAgICBsaXN0VXNlcnNQYXJhbXMuRmlsdGVyID0gYGVtYWlsIF49IFwiJHtzZWFyY2hUZXJtfVwiYDtcbiAgICB9XG5cbiAgICAvLyBMaXN0IHVzZXJzIGZyb20gQ29nbml0b1xuICAgIGNvbnN0IGxpc3RVc2Vyc1Jlc3VsdCA9IGF3YWl0IGNvZ25pdG9DbGllbnQuc2VuZChuZXcgTGlzdFVzZXJzQ29tbWFuZChsaXN0VXNlcnNQYXJhbXMpKTtcblxuICAgIC8vIFRyYW5zZm9ybSB1c2VyIGRhdGFcbiAgICBjb25zdCB1c2VycyA9IChsaXN0VXNlcnNSZXN1bHQuVXNlcnMgfHwgW10pLm1hcCgodXNlcikgPT4ge1xuICAgICAgY29uc3QgZW1haWxBdHRyID0gdXNlci5BdHRyaWJ1dGVzPy5maW5kKChhdHRyKSA9PiBhdHRyLk5hbWUgPT09ICdlbWFpbCcpO1xuICAgICAgY29uc3QgZ2l2ZW5OYW1lQXR0ciA9IHVzZXIuQXR0cmlidXRlcz8uZmluZCgoYXR0cikgPT4gYXR0ci5OYW1lID09PSAnZ2l2ZW5fbmFtZScpO1xuICAgICAgY29uc3QgZmFtaWx5TmFtZUF0dHIgPSB1c2VyLkF0dHJpYnV0ZXM/LmZpbmQoKGF0dHIpID0+IGF0dHIuTmFtZSA9PT0gJ2ZhbWlseV9uYW1lJyk7XG5cbiAgICAgIGNvbnN0IG5hbWUgPVxuICAgICAgICBnaXZlbk5hbWVBdHRyPy5WYWx1ZSAmJiBmYW1pbHlOYW1lQXR0cj8uVmFsdWVcbiAgICAgICAgICA/IGAke2dpdmVuTmFtZUF0dHIuVmFsdWV9ICR7ZmFtaWx5TmFtZUF0dHIuVmFsdWV9YFxuICAgICAgICAgIDogZ2l2ZW5OYW1lQXR0cj8uVmFsdWUgfHwgZmFtaWx5TmFtZUF0dHI/LlZhbHVlIHx8IHVuZGVmaW5lZDtcblxuICAgICAgcmV0dXJuIHtcbiAgICAgICAgdXNlcklkOiB1c2VyLlVzZXJuYW1lISxcbiAgICAgICAgZW1haWw6IGVtYWlsQXR0cj8uVmFsdWUgfHwgJ05vIGVtYWlsJyxcbiAgICAgICAgbmFtZSxcbiAgICAgICAgY3JlYXRlZEF0OiB1c2VyLlVzZXJDcmVhdGVEYXRlPy50b0lTT1N0cmluZygpIHx8ICcnLFxuICAgICAgfTtcbiAgICB9KTtcblxuICAgIC8vIFByZXBhcmUgcmVzcG9uc2VcbiAgICBjb25zdCByZXNwb25zZSA9IHtcbiAgICAgIHVzZXJzLFxuICAgICAgY291bnQ6IHVzZXJzLmxlbmd0aCxcbiAgICAgIG5leHRUb2tlbjogbGlzdFVzZXJzUmVzdWx0LlBhZ2luYXRpb25Ub2tlbixcbiAgICB9O1xuXG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1c0NvZGU6IDIwMCxcbiAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6ICcqJyxcbiAgICAgIH0sXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeShyZXNwb25zZSksXG4gICAgfTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvcjonLCBlcnJvcik7XG4gICAgcmV0dXJuIHtcbiAgICAgIHN0YXR1c0NvZGU6IDUwMCxcbiAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgJ0FjY2Vzcy1Db250cm9sLUFsbG93LU9yaWdpbic6ICcqJyxcbiAgICAgIH0sXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7IGVycm9yOiAnSW50ZXJuYWwgc2VydmVyIGVycm9yJyB9KSxcbiAgICB9O1xuICB9XG59O1xuIl19