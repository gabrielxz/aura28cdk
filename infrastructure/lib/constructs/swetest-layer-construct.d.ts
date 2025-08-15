import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';
export interface SwetestLayerConstructProps {
    environment: 'dev' | 'prod';
    lambdaFunctions?: lambda.Function[];
}
export declare class SwetestLayerConstruct extends Construct {
    readonly layerVersionArn: string;
    private readonly ssmParameterName;
    constructor(scope: Construct, id: string, props: SwetestLayerConstructProps);
}
