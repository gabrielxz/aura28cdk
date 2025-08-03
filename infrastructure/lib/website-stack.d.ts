import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import { CognitoAuthConstruct } from './constructs/cognito-auth-construct';
import { ApiConstruct } from './constructs/api-construct';
export interface WebsiteStackProps extends cdk.StackProps {
  domainName: string;
  subdomain?: string;
  certificateArn?: string;
  environment: 'dev' | 'prod';
}
export declare class WebsiteStack extends cdk.Stack {
  readonly distribution: cloudfront.Distribution;
  readonly bucket: s3.Bucket;
  readonly auth: CognitoAuthConstruct;
  readonly userTable: dynamodb.Table;
  readonly api: ApiConstruct;
  constructor(scope: Construct, id: string, props: WebsiteStackProps);
}
