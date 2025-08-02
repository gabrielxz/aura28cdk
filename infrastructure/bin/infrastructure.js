#!/usr/bin/env node
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
const cdk = __importStar(require("aws-cdk-lib"));
const website_stack_1 = require("../lib/website-stack");
const app = new cdk.App();
// Get environment from context, default to 'dev'
const environment = app.node.tryGetContext('env') || 'dev';
const domainName = 'aura28.com';
// Create the appropriate stack based on environment
if (environment === 'prod') {
    new website_stack_1.WebsiteStack(app, `Aura28-${environment}-Stack`, {
        domainName,
        environment: 'prod',
        env: {
            account: process.env.CDK_DEFAULT_ACCOUNT,
            region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
        },
        crossRegionReferences: true,
    });
}
else {
    new website_stack_1.WebsiteStack(app, `Aura28-${environment}-Stack`, {
        domainName,
        subdomain: 'dev',
        environment: 'dev',
        env: {
            account: process.env.CDK_DEFAULT_ACCOUNT,
            region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
        },
        crossRegionReferences: true,
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiaW5mcmFzdHJ1Y3R1cmUuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJpbmZyYXN0cnVjdHVyZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUNBLGlEQUFtQztBQUNuQyx3REFBb0Q7QUFFcEQsTUFBTSxHQUFHLEdBQUcsSUFBSSxHQUFHLENBQUMsR0FBRyxFQUFFLENBQUM7QUFFMUIsaURBQWlEO0FBQ2pELE1BQU0sV0FBVyxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsYUFBYSxDQUFDLEtBQUssQ0FBQyxJQUFJLEtBQUssQ0FBQztBQUMzRCxNQUFNLFVBQVUsR0FBRyxZQUFZLENBQUM7QUFFaEMsb0RBQW9EO0FBQ3BELElBQUksV0FBVyxLQUFLLE1BQU0sRUFBRSxDQUFDO0lBQzNCLElBQUksNEJBQVksQ0FBQyxHQUFHLEVBQUUsVUFBVSxXQUFXLFFBQVEsRUFBRTtRQUNuRCxVQUFVO1FBQ1YsV0FBVyxFQUFFLE1BQU07UUFDbkIsR0FBRyxFQUFFO1lBQ0gsT0FBTyxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsbUJBQW1CO1lBQ3hDLE1BQU0sRUFBRSxPQUFPLENBQUMsR0FBRyxDQUFDLGtCQUFrQixJQUFJLFdBQVc7U0FDdEQ7UUFDRCxxQkFBcUIsRUFBRSxJQUFJO0tBQzVCLENBQUMsQ0FBQztBQUNMLENBQUM7S0FBTSxDQUFDO0lBQ04sSUFBSSw0QkFBWSxDQUFDLEdBQUcsRUFBRSxVQUFVLFdBQVcsUUFBUSxFQUFFO1FBQ25ELFVBQVU7UUFDVixTQUFTLEVBQUUsS0FBSztRQUNoQixXQUFXLEVBQUUsS0FBSztRQUNsQixHQUFHLEVBQUU7WUFDSCxPQUFPLEVBQUUsT0FBTyxDQUFDLEdBQUcsQ0FBQyxtQkFBbUI7WUFDeEMsTUFBTSxFQUFFLE9BQU8sQ0FBQyxHQUFHLENBQUMsa0JBQWtCLElBQUksV0FBVztTQUN0RDtRQUNELHFCQUFxQixFQUFFLElBQUk7S0FDNUIsQ0FBQyxDQUFDO0FBQ0wsQ0FBQyIsInNvdXJjZXNDb250ZW50IjpbIiMhL3Vzci9iaW4vZW52IG5vZGVcbmltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgeyBXZWJzaXRlU3RhY2sgfSBmcm9tICcuLi9saWIvd2Vic2l0ZS1zdGFjayc7XG5cbmNvbnN0IGFwcCA9IG5ldyBjZGsuQXBwKCk7XG5cbi8vIEdldCBlbnZpcm9ubWVudCBmcm9tIGNvbnRleHQsIGRlZmF1bHQgdG8gJ2RldidcbmNvbnN0IGVudmlyb25tZW50ID0gYXBwLm5vZGUudHJ5R2V0Q29udGV4dCgnZW52JykgfHwgJ2Rldic7XG5jb25zdCBkb21haW5OYW1lID0gJ2F1cmEyOC5jb20nO1xuXG4vLyBDcmVhdGUgdGhlIGFwcHJvcHJpYXRlIHN0YWNrIGJhc2VkIG9uIGVudmlyb25tZW50XG5pZiAoZW52aXJvbm1lbnQgPT09ICdwcm9kJykge1xuICBuZXcgV2Vic2l0ZVN0YWNrKGFwcCwgYEF1cmEyOC0ke2Vudmlyb25tZW50fS1TdGFja2AsIHtcbiAgICBkb21haW5OYW1lLFxuICAgIGVudmlyb25tZW50OiAncHJvZCcsXG4gICAgZW52OiB7XG4gICAgICBhY2NvdW50OiBwcm9jZXNzLmVudi5DREtfREVGQVVMVF9BQ0NPVU5ULFxuICAgICAgcmVnaW9uOiBwcm9jZXNzLmVudi5DREtfREVGQVVMVF9SRUdJT04gfHwgJ3VzLWVhc3QtMScsXG4gICAgfSxcbiAgICBjcm9zc1JlZ2lvblJlZmVyZW5jZXM6IHRydWUsXG4gIH0pO1xufSBlbHNlIHtcbiAgbmV3IFdlYnNpdGVTdGFjayhhcHAsIGBBdXJhMjgtJHtlbnZpcm9ubWVudH0tU3RhY2tgLCB7XG4gICAgZG9tYWluTmFtZSxcbiAgICBzdWJkb21haW46ICdkZXYnLFxuICAgIGVudmlyb25tZW50OiAnZGV2JyxcbiAgICBlbnY6IHtcbiAgICAgIGFjY291bnQ6IHByb2Nlc3MuZW52LkNES19ERUZBVUxUX0FDQ09VTlQsXG4gICAgICByZWdpb246IHByb2Nlc3MuZW52LkNES19ERUZBVUxUX1JFR0lPTiB8fCAndXMtZWFzdC0xJyxcbiAgICB9LFxuICAgIGNyb3NzUmVnaW9uUmVmZXJlbmNlczogdHJ1ZSxcbiAgfSk7XG59XG4iXX0=