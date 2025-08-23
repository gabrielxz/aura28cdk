import { Construct } from 'constructs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as cognito from 'aws-cdk-lib/aws-cognito';
export interface ApiConstructProps {
    environment: 'dev' | 'prod';
    userTable: dynamodb.Table;
    natalChartTable: dynamodb.Table;
    readingsTable: dynamodb.Table;
    userPool: cognito.UserPool;
    placeIndexName: string;
    allowedOrigins: string[];
    swissEphemerisLayerArn?: string;
}
export declare class ApiConstruct extends Construct {
    readonly api: apigateway.RestApi;
    readonly getUserProfileFunction: lambda.Function;
    readonly updateUserProfileFunction: lambda.Function;
    readonly generateNatalChartFunction: lambda.Function;
    readonly getNatalChartFunction: lambda.Function;
    readonly generateReadingFunction: lambda.Function;
    readonly getReadingsFunction: lambda.Function;
    readonly getReadingDetailFunction: lambda.Function;
    readonly adminGetAllReadingsFunction: lambda.Function;
    readonly adminGetAllUsersFunction: lambda.Function;
    readonly adminGetReadingDetailsFunction: lambda.Function;
    readonly adminUpdateReadingStatusFunction: lambda.Function;
    readonly adminDeleteReadingFunction: lambda.Function;
    readonly createCheckoutSessionFunction: lambda.Function;
    constructor(scope: Construct, id: string, props: ApiConstructProps);
}
