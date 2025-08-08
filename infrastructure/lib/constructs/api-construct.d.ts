import { Construct } from 'constructs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from 'aws-cdk-lib/aws-cognito';
export interface ApiConstructProps {
    environment: 'dev' | 'prod';
    userTable: dynamodb.Table;
    userPool: cognito.UserPool;
    placeIndexName: string;
    allowedOrigins: string[];
}
export declare class ApiConstruct extends Construct {
    readonly api: apigateway.RestApi;
    readonly getUserProfileFunction: lambda.Function;
    readonly updateUserProfileFunction: lambda.Function;
    constructor(scope: Construct, id: string, props: ApiConstructProps);
}
