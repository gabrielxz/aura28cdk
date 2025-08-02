import { Construct } from 'constructs';
import * as cognito from 'aws-cdk-lib/aws-cognito';
export interface CognitoAuthConstructProps {
  environment: 'dev' | 'prod';
  domainPrefix: string;
  callbackUrls: string[];
  logoutUrls: string[];
}
export declare class CognitoAuthConstruct extends Construct {
  readonly userPool: cognito.UserPool;
  readonly userPoolClient: cognito.UserPoolClient;
  readonly userPoolDomain: cognito.UserPoolDomain;
  constructor(scope: Construct, id: string, props: CognitoAuthConstructProps);
}
