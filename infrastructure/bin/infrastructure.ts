#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { WebsiteStack } from '../lib/website-stack';

const app = new cdk.App();

const domainName = 'aura28.com';

// Development stack
new WebsiteStack(app, 'Aura28DevStack', {
  domainName,
  subdomain: 'dev',
  environment: 'dev',
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  crossRegionReferences: true,
});

// Production stack  
new WebsiteStack(app, 'Aura28ProdStack', {
  domainName,
  environment: 'prod',
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION || 'us-east-1',
  },
  crossRegionReferences: true,
});