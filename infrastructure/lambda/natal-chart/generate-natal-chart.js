"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = void 0;
const client_dynamodb_1 = require("@aws-sdk/client-dynamodb");
const lib_dynamodb_1 = require("@aws-sdk/lib-dynamodb");
const crypto = __importStar(require("crypto"));
const calculator_1 = require("./calculator");
const dynamoClient = new client_dynamodb_1.DynamoDBClient({});
const docClient = lib_dynamodb_1.DynamoDBDocumentClient.from(dynamoClient);
const generateCacheKey = (birthDate, birthTime, latitude, longitude) => {
    const input = `${birthDate}T${birthTime}:00Z_${latitude}_${longitude}_placidus_tropical_v2.10.03_refactored`;
    return crypto.createHash('sha256').update(input).digest('hex');
};
const getCachedChartData = async (cacheKey) => {
    const NATAL_CHART_TABLE_NAME = process.env.NATAL_CHART_TABLE_NAME;
    try {
        const result = await docClient.send(new lib_dynamodb_1.GetCommand({
            TableName: NATAL_CHART_TABLE_NAME,
            Key: { userId: `CACHE#${cacheKey}`, chartType: 'chart_cache' },
        }));
        if (result.Item) {
            console.info('Cache hit for chart calculations');
            return result.Item.chartData;
        }
    }
    catch (error) {
        console.error('Error retrieving cached data:', error);
    }
    return null;
};
const saveCachedChartData = async (cacheKey, chartData) => {
    const NATAL_CHART_TABLE_NAME = process.env.NATAL_CHART_TABLE_NAME;
    try {
        const ttl = Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60; // 30 days TTL
        await docClient.send(new lib_dynamodb_1.PutCommand({
            TableName: NATAL_CHART_TABLE_NAME,
            Item: {
                userId: `CACHE#${cacheKey}`,
                chartType: 'chart_cache',
                chartData,
                ttl,
                createdAt: new Date().toISOString(),
            },
        }));
    }
    catch (error) {
        console.error('Error saving cached data:', error);
    }
};
const handler = async (event) => {
    const NATAL_CHART_TABLE_NAME = process.env.NATAL_CHART_TABLE_NAME;
    console.info('Received event:', JSON.stringify(event, null, 2));
    const validatedEvent = validateEvent(event);
    const { userId, birthDate, latitude, longitude, ianaTimeZone } = validatedEvent;
    if (!validatedEvent.birthTime) {
        throw new Error('Birth time is required for house calculations');
    }
    const birthTime = validatedEvent.birthTime;
    try {
        const { fromZonedTime } = await import('date-fns-tz');
        const birthDateTimeStr = `${birthDate}T${birthTime}`;
        const birthDateTime = fromZonedTime(birthDateTimeStr, ianaTimeZone);
        const cacheKey = generateCacheKey(birthDate, birthTime, latitude, longitude);
        let chartData = await getCachedChartData(cacheKey);
        if (!chartData) {
            console.info('Cache miss. Calculating chart with Swiss Ephemeris.');
            chartData = (0, calculator_1.calculateChartWithSwisseph)(birthDateTime, latitude, longitude);
            if (chartData) {
                await saveCachedChartData(cacheKey, chartData);
            }
        }
        if (!chartData) {
            throw new Error('Failed to generate natal chart data.');
        }
        const item = {
            userId,
            chartType: 'natal',
            createdAt: new Date().toISOString(),
            isTimeEstimated: false,
            birthInfo: { ...validatedEvent },
            planets: chartData.planets,
            houses: { status: 'success', data: chartData.houses },
            ascendant: chartData.ascendant,
            midheaven: chartData.midheaven,
            planetHouses: Object.entries(chartData.planets).reduce((acc, [name, data]) => {
                acc[name] = data.house;
                return acc;
            }, {}),
            metadata: {
                calculationTimestamp: new Date().toISOString(),
                algoVersion: '2.1.0-refactored',
                swetestVersion: '2.10.03',
                inputHash: cacheKey,
            },
        };
        await docClient.send(new lib_dynamodb_1.PutCommand({
            TableName: NATAL_CHART_TABLE_NAME,
            Item: item,
        }));
        console.info(`Successfully generated and stored natal chart for userId: ${userId}`);
    }
    catch (error) {
        console.error('Error calculating or storing natal chart:', error);
    }
};
exports.handler = handler;
function validateEvent(event) {
    if (!event.userId ||
        !event.birthDate ||
        event.latitude === undefined ||
        event.longitude === undefined ||
        !event.ianaTimeZone) {
        throw new Error('Missing required event properties');
    }
    if (event.latitude < -90 || event.latitude > 90) {
        throw new Error('Invalid latitude');
    }
    if (event.longitude < -180 || event.longitude > 180) {
        throw new Error('Invalid longitude');
    }
    return event;
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZ2VuZXJhdGUtbmF0YWwtY2hhcnQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJnZW5lcmF0ZS1uYXRhbC1jaGFydC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLDhEQUEwRDtBQUMxRCx3REFBdUY7QUFDdkYsK0NBQWlDO0FBQ2pDLDZDQUEwRDtBQUcxRCxNQUFNLFlBQVksR0FBRyxJQUFJLGdDQUFjLENBQUMsRUFBRSxDQUFDLENBQUM7QUFDNUMsTUFBTSxTQUFTLEdBQUcscUNBQXNCLENBQUMsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDO0FBRTVELE1BQU0sZ0JBQWdCLEdBQUcsQ0FDdkIsU0FBaUIsRUFDakIsU0FBaUIsRUFDakIsUUFBZ0IsRUFDaEIsU0FBaUIsRUFDVCxFQUFFO0lBQ1YsTUFBTSxLQUFLLEdBQUcsR0FBRyxTQUFTLElBQUksU0FBUyxRQUFRLFFBQVEsSUFBSSxTQUFTLHdDQUF3QyxDQUFDO0lBQzdHLE9BQU8sTUFBTSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsQ0FBQyxNQUFNLENBQUMsS0FBSyxDQUFDLENBQUMsTUFBTSxDQUFDLEtBQUssQ0FBQyxDQUFDO0FBQ2pFLENBQUMsQ0FBQztBQUVGLE1BQU0sa0JBQWtCLEdBQUcsS0FBSyxFQUFFLFFBQWdCLEVBQTZCLEVBQUU7SUFDL0UsTUFBTSxzQkFBc0IsR0FBRyxPQUFPLENBQUMsR0FBRyxDQUFDLHNCQUF1QixDQUFDO0lBQ25FLElBQUksQ0FBQztRQUNILE1BQU0sTUFBTSxHQUFHLE1BQU0sU0FBUyxDQUFDLElBQUksQ0FDakMsSUFBSSx5QkFBVSxDQUFDO1lBQ2IsU0FBUyxFQUFFLHNCQUFzQjtZQUNqQyxHQUFHLEVBQUUsRUFBRSxNQUFNLEVBQUUsU0FBUyxRQUFRLEVBQUUsRUFBRSxTQUFTLEVBQUUsYUFBYSxFQUFFO1NBQy9ELENBQUMsQ0FDSCxDQUFDO1FBQ0YsSUFBSSxNQUFNLENBQUMsSUFBSSxFQUFF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akMsSUFBSSxFQUFFLElBQUk7U0FDWCxDQUFDLENBQ0gsQ0FBQztRQUVGLE9BQU8sQ0FBQyxJQUFJLENBQUMsNkRBQTZELE1BQU0sRUFBRSxDQUFDLENBQUM7SUFDdEYsQ0FBQztJQUFDLE9BQU8sS0FBSyxFQUFFLENBQUM7UUFDZixPQUFPLENBQUMsS0FBSyxDQUFDLDJDQUEyQyxFQUFFLEtBQUssQ0FBQyxDQUFDO0lBQ3BFLENBQUM7QUFDSCxDQUFDLENBQUM7QUFyRVcsUUFBQSxPQUFPLFdBcUVsQjtBQUVGLFNBQVMsYUFBYSxDQUFDLEtBQVU7SUFDL0IsSUFDRSxDQUFDLEtBQUssQ0FBQyxNQUFNO1FBQ2IsQ0FBQyxLQUFLLENBQUMsU0FBUztRQUNoQixLQUFLLENBQUMsUUFBUSxLQUFLLFNBQVM7UUFDNUIsS0FBSyxDQUFDLFNBQVMsS0FBSyxTQUFTO1FBQzdCLENBQUMsS0FBSyxDQUFDLFlBQVksRUFDbkIsQ0FBQztRQUNELE1BQU0sSUFBSSxLQUFLLENBQUMsbUNBQW1DLENBQUMsQ0FBQztJQUN2RCxDQUFDO0lBQ0QsSUFBSSxLQUFLLENBQUMsUUFBUSxHQUFHLENBQUMsRUFBRSxJQUFJLEtBQUssQ0FBQyxRQUFRLEdBQUcsRUFBRSxFQUFFLENBQUM7UUFDaEQsTUFBTSxJQUFJLEtBQUssQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDO0lBQ3RDLENBQUM7SUFDRCxJQUFJLEtBQUssQ0FBQyxTQUFTLEdBQUcsQ0FBQyxHQUFHLElBQUksS0FBSyxDQUFDLFNBQVMsR0FBRyxHQUFHLEVBQUUsQ0FBQztRQUNwRCxNQUFNLElBQUksS0FBSyxDQUFDLG1CQUFtQixDQUFDLENBQUM7SUFDdkMsQ0FBQztJQUNELE9BQU8sS0FBSyxDQUFDO0FBQ2YsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IER5bmFtb0RCQ2xpZW50IH0gZnJvbSAnQGF3cy1zZGsvY2xpZW50LWR5bmFtb2RiJztcbmltcG9ydCB7IER5bmFtb0RCRG9jdW1lbnRDbGllbnQsIFB1dENvbW1hbmQsIEdldENvbW1hbmQgfSBmcm9tICdAYXdzLXNkay9saWItZHluYW1vZGInO1xuaW1wb3J0ICogYXMgY3J5cHRvIGZyb20gJ2NyeXB0byc7XG5pbXBvcnQgeyBjYWxjdWxhdGVDaGFydFdpdGhTd2lzc2VwaCB9IGZyb20gJy4vY2FsY3VsYXRvcic7XG5pbXBvcnQgeyBDaGFydERhdGEsIE5hdGFsQ2hhcnRFdmVudCB9IGZyb20gJy4vdHlwZXMnO1xuXG5jb25zdCBkeW5hbW9DbGllbnQgPSBuZXcgRHluYW1vREJDbGllbnQoe30pO1xuY29uc3QgZG9jQ2xpZW50ID0gRHluYW1vREJEb2N1bWVudENsaWVudC5mcm9tKGR5bmFtb0NsaWVudCk7XG5cbmNvbnN0IGdlbmVyYXRlQ2FjaGVLZXkgPSAoXG4gIGJpcnRoRGF0ZTogc3RyaW5nLFxuICBiaXJ0aFRpbWU6IHN0cmluZyxcbiAgbGF0aXR1ZGU6IG51bWJlcixcbiAgbG9uZ2l0dWRlOiBudW1iZXIsXG4pOiBzdHJpbmcgPT4ge1xuICBjb25zdCBpbnB1dCA9IGAke2JpcnRoRGF0ZX1UJHtiaXJ0aFRpbWV9OjAwWl8ke2xhdGl0dWRlfV8ke2xvbmdpdHVkZX1fcGxhY2lkdXNfdHJvcGljYWxfdjIuMTAuMDNfcmVmYWN0b3JlZGA7XG4gIHJldHVybiBjcnlwdG8uY3JlYXRlSGFzaCgnc2hhMjU2JykudXBkYXRlKGlucHV0KS5kaWdlc3QoJ2hleCcpO1xufTtcblxuY29uc3QgZ2V0Q2FjaGVkQ2hhcnREYXRhID0gYXN5bmMgKGNhY2hlS2V5OiBzdHJpbmcpOiBQcm9taXNlPENoYXJ0RGF0YSB8IG51bGw+ID0+IHtcbiAgY29uc3QgTkFUQUxfQ0hBUlRfVEFCTEVfTkFNRSA9IHByb2Nlc3MuZW52Lk5BVEFMX0NIQVJUX1RBQkxFX05BTUUhO1xuICB0cnkge1xuICAgIGNvbnN0IHJlc3VsdCA9IGF3YWl0IGRvY0NsaWVudC5zZW5kKFxuICAgICAgbmV3IEdldENvbW1hbmQoe1xuICAgICAgICBUYWJsZU5hbWU6IE5BVEFMX0NIQVJUX1RBQkxFX05BTUUsXG4gICAgICAgIEtleTogeyB1c2VySWQ6IGBDQUNIRSMke2NhY2hlS2V5fWAsIGNoYXJ0VHlwZTogJ2NoYXJ0X2NhY2hlJyB9LFxuICAgICAgfSksXG4gICAgKTtcbiAgICBpZiAocmVzdWx0Lkl0ZW0pIHtcbiAgICAgIGNvbnNvbGUuaW5mbygnQ2FjaGUgaGl0IGZvciBjaGFydCBjYWxjdWxhdGlvbnMnKTtcbiAgICAgIHJldHVybiByZXN1bHQuSXRlbS5jaGFydERhdGEgYXMgQ2hhcnREYXRhO1xuICAgIH1cbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciByZXRyaWV2aW5nIGNhY2hlZCBkYXRhOicsIGVycm9yKTtcbiAgfVxuICByZXR1cm4gbnVsbDtcbn07XG5cbmNvbnN0IHNhdmVDYWNoZWRDaGFydERhdGEgPSBhc3luYyAoY2FjaGVLZXk6IHN0cmluZywgY2hhcnREYXRhOiBDaGFydERhdGEpOiBQcm9taXNlPHZvaWQ+ID0+IHtcbiAgY29uc3QgTkFUQUxfQ0hBUlRfVEFCTEVfTkFNRSA9IHByb2Nlc3MuZW52Lk5BVEFMX0NIQVJUX1RBQkxFX05BTUUhO1xuICB0cnkge1xuICAgIGNvbnN0IHR0bCA9IE1hdGguZmxvb3IoRGF0ZS5ub3coKSAvIDEwMDApICsgMzAgKiAyNCAqIDYwICogNjA7IC8vIDMwIGRheXMgVFRMXG4gICAgYXdhaXQgZG9jQ2xpZW50LnNlbmQoXG4gICAgICBuZXcgUHV0Q29tbWFuZCh7XG4gICAgICAgIFRhYmxlTmFtZTogTkFUQUxfQ0hBUlRfVEFCTEVfTkFNRSxcbiAgICAgICAgSXRlbToge1xuICAgICAgICAgIHVzZXJJZDogYENBQ0hFIyR7Y2FjaGVLZXl9YCxcbiAgICAgICAgICBjaGFydFR5cGU6ICdjaGFydF9jYWNoZScsXG4gICAgICAgICAgY2hhcnREYXRhLFxuICAgICAgICAgIHR0bCxcbiAgICAgICAgICBjcmVhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgICAgICAgfSxcbiAgICAgIH0pLFxuICAgICk7XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3Igc2F2aW5nIGNhY2hlZCBkYXRhOicsIGVycm9yKTtcbiAgfVxufTtcblxuZXhwb3J0IGNvbnN0IGhhbmRsZXIgPSBhc3luYyAoZXZlbnQ6IGFueSk6IFByb21pc2U8dm9pZD4gPT4ge1xuICBjb25zdCBOQVRBTF9DSEFSVF9UQUJMRV9OQU1FID0gcHJvY2Vzcy5lbnYuTkFUQUxfQ0hBUlRfVEFCTEVfTkFNRSE7XG4gIGNvbnNvbGUuaW5mbygnUmVjZWl2ZWQgZXZlbnQ6JywgSlNPTi5zdHJpbmdpZnkoZXZlbnQsIG51bGwsIDIpKTtcblxuICBjb25zdCB2YWxpZGF0ZWRFdmVudCA9IHZhbGlkYXRlRXZlbnQoZXZlbnQpO1xuICBjb25zdCB7IHVzZXJJZCwgYmlydGhEYXRlLCBsYXRpdHVkZSwgbG9uZ2l0dWRlLCBpYW5hVGltZVpvbmUgfSA9IHZhbGlkYXRlZEV2ZW50O1xuXG4gIGlmICghdmFsaWRhdGVkRXZlbnQuYmlydGhUaW1lKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdCaXJ0aCB0aW1lIGlzIHJlcXVpcmVkIGZvciBob3VzZSBjYWxjdWxhdGlvbnMnKTtcbiAgfVxuXG4gIGNvbnN0IGJpcnRoVGltZSA9IHZhbGlkYXRlZEV2ZW50LmJpcnRoVGltZTtcblxuICB0cnkge1xuICAgIGNvbnN0IHsgZnJvbVpvbmVkVGltZSB9ID0gYXdhaXQgaW1wb3J0KCdkYXRlLWZucy10eicpO1xuICAgIGNvbnN0IGJpcnRoRGF0ZVRpbWVTdHIgPSBgJHtiaXJ0aERhdGV9VCR7YmlydGhUaW1lfWA7XG4gICAgY29uc3QgYmlydGhEYXRlVGltZSA9IGZyb21ab25lZFRpbWUoYmlydGhEYXRlVGltZVN0ciwgaWFuYVRpbWVab25lKTtcblxuICAgIGNvbnN0IGNhY2hlS2V5ID0gZ2VuZXJhdGVDYWNoZUtleShiaXJ0aERhdGUsIGJpcnRoVGltZSwgbGF0aXR1ZGUsIGxvbmdpdHVkZSk7XG4gICAgbGV0IGNoYXJ0RGF0YSA9IGF3YWl0IGdldENhY2hlZENoYXJ0RGF0YShjYWNoZUtleSk7XG5cbiAgICBpZiAoIWNoYXJ0RGF0YSkge1xuICAgICAgY29uc29sZS5pbmZvKCdDYWNoZSBtaXNzLiBDYWxjdWxhdGluZyBjaGFydCB3aXRoIFN3aXNzIEVwaGVtZXJpcy4nKTtcbiAgICAgIGNoYXJ0RGF0YSA9IGNhbGN1bGF0ZUNoYXJ0V2l0aFN3aXNzZXBoKGJpcnRoRGF0ZVRpbWUsIGxhdGl0dWRlLCBsb25naXR1ZGUpO1xuICAgICAgaWYgKGNoYXJ0RGF0YSkge1xuICAgICAgICBhd2FpdCBzYXZlQ2FjaGVkQ2hhcnREYXRhKGNhY2hlS2V5LCBjaGFydERhdGEpO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmICghY2hhcnREYXRhKSB7XG4gICAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZhaWxlZCB0byBnZW5lcmF0ZSBuYXRhbCBjaGFydCBkYXRhLicpO1xuICAgIH1cblxuICAgIGNvbnN0IGl0ZW0gPSB7XG4gICAgICB1c2VySWQsXG4gICAgICBjaGFydFR5cGU6ICduYXRhbCcsXG4gICAgICBjcmVhdGVkQXQ6IG5ldyBEYXRlKCkudG9JU09TdHJpbmcoKSxcbiAgICAgIGlzVGltZUVzdGltYXRlZDogZmFsc2UsXG4gICAgICBiaXJ0aEluZm86IHsgLi4udmFsaWRhdGVkRXZlbnQgfSxcbiAgICAgIHBsYW5ldHM6IGNoYXJ0RGF0YS5wbGFuZXRzLFxuICAgICAgaG91c2VzOiB7IHN0YXR1czogJ3N1Y2Nlc3MnLCBkYXRhOiBjaGFydERhdGEuaG91c2VzIH0sXG4gICAgICBhc2NlbmRhbnQ6IGNoYXJ0RGF0YS5hc2NlbmRhbnQsXG4gICAgICBtaWRoZWF2ZW46IGNoYXJ0RGF0YS5taWRoZWF2ZW4sXG4gICAgICBwbGFuZXRIb3VzZXM6IE9iamVjdC5lbnRyaWVzKGNoYXJ0RGF0YS5wbGFuZXRzKS5yZWR1Y2UoXG4gICAgICAgIChhY2MsIFtuYW1lLCBkYXRhXSkgPT4ge1xuICAgICAgICAgIGFjY1tuYW1lXSA9IGRhdGEuaG91c2U7XG4gICAgICAgICAgcmV0dXJuIGFjYztcbiAgICAgICAgfSxcbiAgICAgICAge30gYXMgUmVjb3JkPHN0cmluZywgbnVtYmVyPixcbiAgICAgICksXG4gICAgICBtZXRhZGF0YToge1xuICAgICAgICBjYWxjdWxhdGlvblRpbWVzdGFtcDogbmV3IERhdGUoKS50b0lTT1N0cmluZygpLFxuICAgICAgICBhbGdvVmVyc2lvbjogJzIuMS4wLXJlZmFjdG9yZWQnLFxuICAgICAgICBzd2V0ZXN0VmVyc2lvbjogJzIuMTAuMDMnLFxuICAgICAgICBpbnB1dEhhc2g6IGNhY2hlS2V5LFxuICAgICAgfSxcbiAgICB9O1xuXG4gICAgYXdhaXQgZG9jQ2xpZW50LnNlbmQoXG4gICAgICBuZXcgUHV0Q29tbWFuZCh7XG4gICAgICAgIFRhYmxlTmFtZTogTkFUQUxfQ0hBUlRfVEFCTEVfTkFNRSxcbiAgICAgICAgSXRlbTogaXRlbSxcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICBjb25zb2xlLmluZm8oYFN1Y2Nlc3NmdWxseSBnZW5lcmF0ZWQgYW5kIHN0b3JlZCBuYXRhbCBjaGFydCBmb3IgdXNlcklkOiAke3VzZXJJZH1gKTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvciBjYWxjdWxhdGluZyBvciBzdG9yaW5nIG5hdGFsIGNoYXJ0OicsIGVycm9yKTtcbiAgfVxufTtcblxuZnVuY3Rpb24gdmFsaWRhdGVFdmVudChldmVudDogYW55KTogTmF0YWxDaGFydEV2ZW50IHtcbiAgaWYgKFxuICAgICFldmVudC51c2VySWQgfHxcbiAgICAhZXZlbnQuYmlydGhEYXRlIHx8XG4gICAgZXZlbnQubGF0aXR1ZGUgPT09IHVuZGVmaW5lZCB8fFxuICAgIGV2ZW50LmxvbmdpdHVkZSA9PT0gdW5kZWZpbmVkIHx8XG4gICAgIWV2ZW50LmlhbmFUaW1lWm9uZVxuICApIHtcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ01pc3NpbmcgcmVxdWlyZWQgZXZlbnQgcHJvcGVydGllcycpO1xuICB9XG4gIGlmIChldmVudC5sYXRpdHVkZSA8IC05MCB8fCBldmVudC5sYXRpdHVkZSA+IDkwKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGxhdGl0dWRlJyk7XG4gIH1cbiAgaWYgKGV2ZW50LmxvbmdpdHVkZSA8IC0xODAgfHwgZXZlbnQubG9uZ2l0dWRlID4gMTgwKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKCdJbnZhbGlkIGxvbmdpdHVkZScpO1xuICB9XG4gIHJldHVybiBldmVudDtcbn1cbiJdfQ==