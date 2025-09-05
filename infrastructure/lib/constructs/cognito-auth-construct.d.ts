import { Construct } from 'constructs';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
export interface CognitoAuthConstructProps {
    environment: 'dev' | 'prod';
    domainPrefix: string;
    callbackUrls: string[];
    logoutUrls: string[];
    customDomain?: {
        domainName: string;
        hostedZone: route53.IHostedZone;
    };
}
export declare class CognitoAuthConstruct extends Construct {
    readonly userPool: cognito.UserPool;
    readonly userPoolClient: cognito.UserPoolClient;
    readonly userPoolDomain: cognito.UserPoolDomain;
    readonly customDomainCertificate?: acm.Certificate;
    readonly customDomainName?: string;
    constructor(scope: Construct, id: string, props: CognitoAuthConstructProps);
}
