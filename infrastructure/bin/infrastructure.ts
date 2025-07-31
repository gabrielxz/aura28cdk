#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { WebsiteStack } from '../lib/website-stack';

const app = new cdk.App();

// Get environment from context, default to 'dev'
const environment = app.node.tryGetContext('env') || 'dev';
const domainName = 'aura28.com';

// Create the appropriate stack based on environment
if (environment === 'prod') {
  new WebsiteStack(app, `Aura28-${environment}-Stack`, {
    domainName,
    environment: 'prod',
    env: {
      account: process.env.CDK_DEFAULT_ACCOUNT,
      region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
    },
    crossRegionReferences: true,
  });
} else {
  new WebsiteStack(app, `Aura28-${environment}-Stack`, {
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
