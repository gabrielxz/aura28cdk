import * as cdk from 'aws-cdk-lib';
import * as codebuild from 'aws-cdk-lib/aws-codebuild';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as cr from 'aws-cdk-lib/custom-resources';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as lambdaNodeJs from 'aws-cdk-lib/aws-lambda-nodejs';
import { Construct } from 'constructs';
import * as path from 'path';

export interface SwetestLayerConstructProps {
  environment: 'dev' | 'prod';
  lambdaFunctions?: lambda.Function[];
}

export class SwetestLayerConstruct extends Construct {
  public readonly layerVersionArn: string;
  private readonly ssmParameterName: string;

  constructor(scope: Construct, id: string, props: SwetestLayerConstructProps) {
    super(scope, id);

    // Runtime consistency guardrail - validate at synth time
    props.lambdaFunctions?.forEach((fn) => {
      const functionRuntime = (fn as { runtime?: lambda.Runtime }).runtime;
      if (functionRuntime && functionRuntime !== lambda.Runtime.NODEJS_20_X) {
        throw new Error(
          `Lambda function ${fn.functionName} uses ${functionRuntime.name} but must use NODEJS_20_X for Swiss Ephemeris layer compatibility`,
        );
      }
    });

    this.ssmParameterName = `/aura28/${props.environment}/layers/swetest-arn`;

    // S3 bucket for build artifacts
    const artifactBucket = new s3.Bucket(this, 'ArtifactBucket', {
      bucketName: `aura28-${props.environment}-swetest-layer-artifacts`,
      removalPolicy:
        props.environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: props.environment !== 'prod',
      lifecycleRules: [
        {
          id: 'delete-old-artifacts',
          enabled: true,
          expiration: cdk.Duration.days(30),
        },
      ],
    });

    // CodeBuild project for building the layer
    const buildProject = new codebuild.Project(this, 'LayerBuildProject', {
      projectName: `aura28-${props.environment}-swetest-layer-build`,
      description: 'Builds Swiss Ephemeris Lambda layer for Node.js 20.x on Amazon Linux 2023',
      source: codebuild.Source.s3({
        bucket: artifactBucket,
        path: 'source/swetest-src.zip',
      }),
      environment: {
        buildImage: codebuild.LinuxBuildImage.AMAZON_LINUX_2_5,
        computeType: codebuild.ComputeType.SMALL,
        privileged: false,
      },
      artifacts: codebuild.Artifacts.s3({
        bucket: artifactBucket,
        path: 'build',
        name: 'layer.zip',
        packageZip: false,
      }),
      timeout: cdk.Duration.minutes(15),
      cache: codebuild.Cache.local(codebuild.LocalCacheMode.SOURCE),
    });

    // Lambda function to orchestrate the build process
    const orchestratorFunction = new lambda.Function(this, 'OrchestratorFunction', {
      functionName: `aura28-${props.environment}-swetest-layer-orchestrator`,
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      timeout: cdk.Duration.minutes(15),
      memorySize: 256,
      environment: {
        BUILD_PROJECT_NAME: buildProject.projectName,
        ARTIFACT_BUCKET: artifactBucket.bucketName,
        SSM_PARAMETER_NAME: this.ssmParameterName,
        ENVIRONMENT: props.environment,
      },
      code: lambda.Code.fromAsset(path.join(__dirname, '../../lambda/swetest-orchestrator')),
      logRetention: logs.RetentionDays.ONE_WEEK,
    });

    // Grant permissions
    artifactBucket.grantReadWrite(orchestratorFunction);
    artifactBucket.grantReadWrite(buildProject);

    orchestratorFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['codebuild:StartBuild', 'codebuild:BatchGetBuilds'],
        resources: [buildProject.projectArn],
      }),
    );

    orchestratorFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['lambda:PublishLayerVersion'],
        resources: ['*'],
      }),
    );

    orchestratorFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['ssm:PutParameter'],
        resources: [
          `arn:aws:ssm:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:parameter${this.ssmParameterName}`,
        ],
      }),
    );

    // Custom resource to trigger the build
    const provider = new cr.Provider(this, 'LayerBuildProvider', {
      onEventHandler: orchestratorFunction,
      logRetention: logs.RetentionDays.ONE_WEEK,
    });

    const customResource = new cdk.CustomResource(this, 'LayerBuildResource', {
      serviceToken: provider.serviceToken,
      properties: {
        Timestamp: Date.now(), // Force update on each deployment
        Environment: props.environment,
      },
    });

    this.layerVersionArn = customResource.getAttString('LayerArn');

    // Output the layer ARN
    new cdk.CfnOutput(this, 'SwetestLayerArn', {
      value: this.layerVersionArn,
      description: 'Swiss Ephemeris Lambda Layer ARN',
      exportName: `Aura28-${props.environment}-SwetestLayerArn`,
    });

    // Create Einstein canary test Lambda
    const canaryFunction = new lambdaNodeJs.NodejsFunction(this, 'EinsteinCanaryFunction', {
      functionName: `aura28-${props.environment}-swetest-canary`,
      entry: path.join(__dirname, '../../lambda/swetest-canary/einstein-canary.ts'),
      handler: 'handler',
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        ENVIRONMENT: props.environment,
      },
      bundling: {
        externalModules: ['@aws-sdk/*', 'swisseph'],
        forceDockerBundling: false,
      },
      layers: [
        lambda.LayerVersion.fromLayerVersionArn(
          this,
          'CanarySwissEphemerisLayer',
          this.layerVersionArn, // Use the Custom Resource output directly
        ),
      ],
      logRetention: logs.RetentionDays.ONE_WEEK,
    });

    // Grant CloudWatch metrics permissions
    canaryFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['cloudwatch:PutMetricData'],
        resources: ['*'],
      }),
    );

    // Schedule canary to run daily
    const canarySchedule = new events.Rule(this, 'CanarySchedule', {
      ruleName: `aura28-${props.environment}-swetest-canary-schedule`,
      description: 'Daily Swiss Ephemeris layer validation',
      schedule: events.Schedule.rate(cdk.Duration.days(1)),
    });

    canarySchedule.addTarget(new targets.LambdaFunction(canaryFunction));

    // Create CloudWatch alarm for canary failures
    new cloudwatch.Alarm(this, 'CanaryAlarm', {
      alarmName: `aura28-${props.environment}-swetest-canary-failure`,
      alarmDescription: 'Swiss Ephemeris layer canary test failure',
      metric: new cloudwatch.Metric({
        namespace: 'Aura28/Canary',
        metricName: 'SwissEphemerisLayerHealth',
        dimensionsMap: {
          Environment: props.environment,
          Test: 'Einstein',
        },
        statistic: 'Average',
        period: cdk.Duration.days(1),
      }),
      threshold: 1,
      comparisonOperator: cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
      evaluationPeriods: 1,
      treatMissingData: cloudwatch.TreatMissingData.BREACHING,
    });

    // Output canary function ARN
    new cdk.CfnOutput(this, 'CanaryFunctionArn', {
      value: canaryFunction.functionArn,
      description: 'Einstein Canary Test Function ARN',
    });
  }
}
