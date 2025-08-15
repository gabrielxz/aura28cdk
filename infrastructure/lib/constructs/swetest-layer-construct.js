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
exports.SwetestLayerConstruct = void 0;
const cdk = __importStar(require("aws-cdk-lib"));
const codebuild = __importStar(require("aws-cdk-lib/aws-codebuild"));
const lambda = __importStar(require("aws-cdk-lib/aws-lambda"));
const s3 = __importStar(require("aws-cdk-lib/aws-s3"));
const iam = __importStar(require("aws-cdk-lib/aws-iam"));
const cr = __importStar(require("aws-cdk-lib/custom-resources"));
const logs = __importStar(require("aws-cdk-lib/aws-logs"));
const events = __importStar(require("aws-cdk-lib/aws-events"));
const targets = __importStar(require("aws-cdk-lib/aws-events-targets"));
const cloudwatch = __importStar(require("aws-cdk-lib/aws-cloudwatch"));
const lambdaNodeJs = __importStar(require("aws-cdk-lib/aws-lambda-nodejs"));
const constructs_1 = require("constructs");
const path = __importStar(require("path"));
class SwetestLayerConstruct extends constructs_1.Construct {
    layerVersionArn;
    ssmParameterName;
    constructor(scope, id, props) {
        super(scope, id);
        // Runtime consistency guardrail - validate at synth time
        props.lambdaFunctions?.forEach((fn) => {
            const functionRuntime = fn.runtime;
            if (functionRuntime && functionRuntime !== lambda.Runtime.NODEJS_20_X) {
                throw new Error(`Lambda function ${fn.functionName} uses ${functionRuntime.name} but must use NODEJS_20_X for Swiss Ephemeris layer compatibility`);
            }
        });
        this.ssmParameterName = `/aura28/${props.environment}/layers/swetest-arn`;
        // S3 bucket for build artifacts
        const artifactBucket = new s3.Bucket(this, 'ArtifactBucket', {
            bucketName: `aura28-${props.environment}-swetest-layer-artifacts`,
            removalPolicy: props.environment === 'prod' ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
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
            code: lambda.Code.fromAsset(path.join(__dirname, '../../lambda/swetest-orchestrator/orchestrator.zip')),
            logRetention: logs.RetentionDays.ONE_WEEK,
        });
        // Grant permissions
        artifactBucket.grantReadWrite(orchestratorFunction);
        artifactBucket.grantReadWrite(buildProject);
        orchestratorFunction.addToRolePolicy(new iam.PolicyStatement({
            actions: ['codebuild:StartBuild', 'codebuild:BatchGetBuilds'],
            resources: [buildProject.projectArn],
        }));
        orchestratorFunction.addToRolePolicy(new iam.PolicyStatement({
            actions: ['lambda:PublishLayerVersion'],
            resources: ['*'],
        }));
        orchestratorFunction.addToRolePolicy(new iam.PolicyStatement({
            actions: ['ssm:PutParameter'],
            resources: [
                `arn:aws:ssm:${cdk.Stack.of(this).region}:${cdk.Stack.of(this).account}:parameter${this.ssmParameterName}`,
            ],
        }));
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
                lambda.LayerVersion.fromLayerVersionArn(this, 'CanarySwissEphemerisLayer', this.layerVersionArn),
            ],
            logRetention: logs.RetentionDays.ONE_WEEK,
        });
        // Grant CloudWatch metrics permissions
        canaryFunction.addToRolePolicy(new iam.PolicyStatement({
            actions: ['cloudwatch:PutMetricData'],
            resources: ['*'],
        }));
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
exports.SwetestLayerConstruct = SwetestLayerConstruct;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3dldGVzdC1sYXllci1jb25zdHJ1Y3QuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJzd2V0ZXN0LWxheWVyLWNvbnN0cnVjdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLGlEQUFtQztBQUNuQyxxRUFBdUQ7QUFDdkQsK0RBQWlEO0FBQ2pELHVEQUF5QztBQUN6Qyx5REFBMkM7QUFDM0MsaUVBQW1EO0FBQ25ELDJEQUE2QztBQUM3QywrREFBaUQ7QUFDakQsd0VBQTBEO0FBQzFELHVFQUF5RDtBQUN6RCw0RUFBOEQ7QUFDOUQsMkNBQXVDO0FBQ3ZDLDJDQUE2QjtBQU83QixNQUFhLHFCQUFzQixTQUFRLHNCQUFTO0lBQ2xDLGVBQWUsQ0FBUztJQUN2QixnQkFBZ0IsQ0FBUztJQUUxQyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQWlDO1FBQ3pFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIseURBQXlEO1FBQ3pELEtBQUssQ0FBQyxlQUFlLEVBQUUsT0FBTyxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUU7WUFDcEMsTUFBTSxlQUFlLEdBQUksRUFBbUMsQ0FBQyxPQUFPLENBQUM7WUFDckUsSUFBSSxlQUFlLElBQUksZUFBZSxLQUFLLE1BQU0sQ0FBQyxPQUFPLENBQUMsV0FBVyxFQUFFLENBQUM7Z0JBQ3RFLE1BQU0sSUFBSSxLQUFLLENBQ2IsbUJBQW1CLEVBQUUsQ0FBQyxZQUFZLFNBQVMsZUFBZSxDQUFDLElBQUksbUVBQW1FLENBQ25JLENBQUM7WUFDSixDQUFDO1FBQ0gsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsZ0JBQWdCLEdBQUcsV0FBVyxLQUFLLENBQUMsV0FBVyxxQkFBcUIsQ0FBQztRQUUxRSxnQ0FBZ0M7UUFDaEMsTUFBTSxjQUFjLEdBQUcsSUFBSSxFQUFFLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxnQkFBZ0IsRUFBRTtZ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QkFBNkI7UUFDN0IsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxtQkFBbUIsRUFBRTtZQUMzQyxLQUFLLEVBQUUsY0FBYyxDQUFDLFdBQVc7WUFDakMsV0FBVyxFQUFFLG1DQUFtQztTQUNqRCxDQUFDLENBQUM7SUFDTCxDQUFDO0NBQ0Y7QUFoTUQsc0RBZ01DIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0ICogYXMgY2RrIGZyb20gJ2F3cy1jZGstbGliJztcbmltcG9ydCAqIGFzIGNvZGVidWlsZCBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY29kZWJ1aWxkJztcbmltcG9ydCAqIGFzIGxhbWJkYSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhJztcbmltcG9ydCAqIGFzIHMzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zMyc7XG5pbXBvcnQgKiBhcyBpYW0gZnJvbSAnYXdzLWNkay1saWIvYXdzLWlhbSc7XG5pbXBvcnQgKiBhcyBjciBmcm9tICdhd3MtY2RrLWxpYi9jdXN0b20tcmVzb3VyY2VzJztcbmltcG9ydCAqIGFzIGxvZ3MgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxvZ3MnO1xuaW1wb3J0ICogYXMgZXZlbnRzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1ldmVudHMnO1xuaW1wb3J0ICogYXMgdGFyZ2V0cyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZXZlbnRzLXRhcmdldHMnO1xuaW1wb3J0ICogYXMgY2xvdWR3YXRjaCBmcm9tICdhd3MtY2RrLWxpYi9hd3MtY2xvdWR3YXRjaCc7XG5pbXBvcnQgKiBhcyBsYW1iZGFOb2RlSnMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxhbWJkYS1ub2RlanMnO1xuaW1wb3J0IHsgQ29uc3RydWN0IH0gZnJvbSAnY29uc3RydWN0cyc7XG5pbXBvcnQgKiBhcyBwYXRoIGZyb20gJ3BhdGgnO1xuXG5leHBvcnQgaW50ZXJmYWNlIFN3ZXRlc3RMYXllckNvbnN0cnVjdFByb3BzIHtcbiAgZW52aXJvbm1lbnQ6ICdkZXYnIHwgJ3Byb2QnO1xuICBsYW1iZGFGdW5jdGlvbnM/OiBsYW1iZGEuRnVuY3Rpb25bXTtcbn1cblxuZXhwb3J0IGNsYXNzIFN3ZXRlc3RMYXllckNvbnN0cnVjdCBleHRlbmRzIENvbnN0cnVjdCB7XG4gIHB1YmxpYyByZWFkb25seSBsYXllclZlcnNpb25Bcm46IHN0cmluZztcbiAgcHJpdmF0ZSByZWFkb25seSBzc21QYXJhbWV0ZXJOYW1lOiBzdHJpbmc7XG5cbiAgY29uc3RydWN0b3Ioc2NvcGU6IENvbnN0cnVjdCwgaWQ6IHN0cmluZywgcHJvcHM6IFN3ZXRlc3RMYXllckNvbnN0cnVjdFByb3BzKSB7XG4gICAgc3VwZXIoc2NvcGUsIGlkKTtcblxuICAgIC8vIFJ1bnRpbWUgY29uc2lzdGVuY3kgZ3VhcmRyYWlsIC0gdmFsaWRhdGUgYXQgc3ludGggdGltZVxuICAgIHByb3BzLmxhbWJkYUZ1bmN0aW9ucz8uZm9yRWFjaCgoZm4pID0+IHtcbiAgICAgIGNvbnN0IGZ1bmN0aW9uUnVudGltZSA9IChmbiBhcyB7IHJ1bnRpbWU/OiBsYW1iZGEuUnVudGltZSB9KS5ydW50aW1lO1xuICAgICAgaWYgKGZ1bmN0aW9uUnVudGltZSAmJiBmdW5jdGlvblJ1bnRpbWUgIT09IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMF9YKSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcihcbiAgICAgICAgICBgTGFtYmRhIGZ1bmN0aW9uICR7Zm4uZnVuY3Rpb25OYW1lfSB1c2VzICR7ZnVuY3Rpb25SdW50aW1lLm5hbWV9IGJ1dCBtdXN0IHVzZSBOT0RFSlNfMjBfWCBmb3IgU3dpc3MgRXBoZW1lcmlzIGxheWVyIGNvbXBhdGliaWxpdHlgLFxuICAgICAgICApO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgdGhpcy5zc21QYXJhbWV0ZXJOYW1lID0gYC9hdXJhMjgvJHtwcm9wcy5lbnZpcm9ubWVudH0vbGF5ZXJzL3N3ZXRlc3QtYXJuYDtcblxuICAgIC8vIFMzIGJ1Y2tldCBmb3IgYnVpbGQgYXJ0aWZhY3RzXG4gICAgY29uc3QgYXJ0aWZhY3RCdWNrZXQgPSBuZXcgczMuQnVja2V0KHRoaXMsICdBcnRpZmFjdEJ1Y2tldCcsIHtcbiAgICAgIGJ1Y2tldE5hbWU6IGBhdXJhMjgtJHtwcm9wcy5lbnZpcm9ubWVudH0tc3dldGVzdC1sYXllci1hcnRpZmFjdHNgLFxuICAgICAgcmVtb3ZhbFBvbGljeTpcbiAgICAgICAgcHJvcHMuZW52aXJvbm1lbnQgPT09ICdwcm9kJyA/IGNkay5SZW1vdmFsUG9saWN5LlJFVEFJTiA6IGNkay5SZW1vdmFsUG9saWN5LkRFU1RST1ksXG4gICAgICBhdXRvRGVsZXRlT2JqZWN0czogcHJvcHMuZW52aXJvbm1lbnQgIT09ICdwcm9kJyxcbiAgICAgIGxpZmVjeWNsZVJ1bGVzOiBbXG4gICAgICAgIHtcbiAgICAgICAgICBpZDogJ2RlbGV0ZS1vbGQtYXJ0aWZhY3RzJyxcbiAgICAgICAgICBlbmFibGVkOiB0cnVlLFxuICAgICAgICAgIGV4cGlyYXRpb246IGNkay5EdXJhdGlvbi5kYXlzKDMwKSxcbiAgICAgICAgfSxcbiAgICAgIF0sXG4gICAgfSk7XG5cbiAgICAvLyBDb2RlQnVpbGQgcHJvamVjdCBmb3IgYnVpbGRpbmcgdGhlIGxheWVyXG4gICAgY29uc3QgYnVpbGRQcm9qZWN0ID0gbmV3IGNvZGVidWlsZC5Qcm9qZWN0KHRoaXMsICdMYXllckJ1aWxkUHJvamVjdCcsIHtcbiAgICAgIHByb2plY3ROYW1lOiBgYXVyYTI4LSR7cHJvcHMuZW52aXJvbm1lbnR9LXN3ZXRlc3QtbGF5ZXItYnVpbGRgLFxuICAgICAgZGVzY3JpcHRpb246ICdCdWlsZHMgU3dpc3MgRXBoZW1lcmlzIExhbWJkYSBsYXllciBmb3IgTm9kZS5qcyAyMC54IG9uIEFtYXpvbiBMaW51eCAyMDIzJyxcbiAgICAgIHNvdXJjZTogY29kZWJ1aWxkLlNvdXJjZS5zMyh7XG4gICAgICAgIGJ1Y2tldDogYXJ0aWZhY3RCdWNrZXQsXG4gICAgICAgIHBhdGg6ICdzb3VyY2Uvc3dldGVzdC1zcmMuemlwJyxcbiAgICAgIH0pLFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgYnVpbGRJbWFnZTogY29kZWJ1aWxkLkxpbnV4QnVpbGRJbWFnZS5BTUFaT05fTElOVVhfMl81LFxuICAgICAgICBjb21wdXRlVHlwZTogY29kZWJ1aWxkLkNvbXB1dGVUeXBlLlNNQUxMLFxuICAgICAgICBwcml2aWxlZ2VkOiBmYWxzZSxcbiAgICAgIH0sXG4gICAgICBhcnRpZmFjdHM6IGNvZGVidWlsZC5BcnRpZmFjdHMuczMoe1xuICAgICAgICBidWNrZXQ6IGFydGlmYWN0QnVja2V0LFxuICAgICAgICBwYXRoOiAnYnVpbGQnLFxuICAgICAgICBuYW1lOiAnbGF5ZXIuemlwJyxcbiAgICAgICAgcGFja2FnZVppcDogZmFsc2UsXG4gICAgICB9KSxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5taW51dGVzKDE1KSxcbiAgICAgIGNhY2hlOiBjb2RlYnVpbGQuQ2FjaGUubG9jYWwoY29kZWJ1aWxkLkxvY2FsQ2FjaGVNb2RlLlNPVVJDRSksXG4gICAgfSk7XG5cbiAgICAvLyBMYW1iZGEgZnVuY3Rpb24gdG8gb3JjaGVzdHJhdGUgdGhlIGJ1aWxkIHByb2Nlc3NcbiAgICBjb25zdCBvcmNoZXN0cmF0b3JGdW5jdGlvbiA9IG5ldyBsYW1iZGEuRnVuY3Rpb24odGhpcywgJ09yY2hlc3RyYXRvckZ1bmN0aW9uJywge1xuICAgICAgZnVuY3Rpb25OYW1lOiBgYXVyYTI4LSR7cHJvcHMuZW52aXJvbm1lbnR9LXN3ZXRlc3QtbGF5ZXItb3JjaGVzdHJhdG9yYCxcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMF9YLFxuICAgICAgaGFuZGxlcjogJ2luZGV4LmhhbmRsZXInLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoMTUpLFxuICAgICAgbWVtb3J5U2l6ZTogMjU2LFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgQlVJTERfUFJPSkVDVF9OQU1FOiBidWlsZFByb2plY3QucHJvamVjdE5hbWUsXG4gICAgICAgIEFSVElGQUNUX0JVQ0tFVDogYXJ0aWZhY3RCdWNrZXQuYnVja2V0TmFtZSxcbiAgICAgICAgU1NNX1BBUkFNRVRFUl9OQU1FOiB0aGlzLnNzbVBhcmFtZXRlck5hbWUsXG4gICAgICAgIEVOVklST05NRU5UOiBwcm9wcy5lbnZpcm9ubWVudCxcbiAgICAgIH0sXG4gICAgICBjb2RlOiBsYW1iZGEuQ29kZS5mcm9tQXNzZXQocGF0aC5qb2luKF9fZGlybmFtZSwgJy4uLy4uL2xhbWJkYS9zd2V0ZXN0LW9yY2hlc3RyYXRvci9vcmNoZXN0cmF0b3IuemlwJykpLFxuICAgICAgbG9nUmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX1dFRUssXG4gICAgfSk7XG5cbiAgICAvLyBHcmFudCBwZXJtaXNzaW9uc1xuICAgIGFydGlmYWN0QnVja2V0LmdyYW50UmVhZFdyaXRlKG9yY2hlc3RyYXRvckZ1bmN0aW9uKTtcbiAgICBhcnRpZmFjdEJ1Y2tldC5ncmFudFJlYWRXcml0ZShidWlsZFByb2plY3QpO1xuXG4gICAgb3JjaGVzdHJhdG9yRnVuY3Rpb24uYWRkVG9Sb2xlUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBhY3Rpb25zOiBbJ2NvZGVidWlsZDpTdGFydEJ1aWxkJywgJ2NvZGVidWlsZDpCYXRjaEdldEJ1aWxkcyddLFxuICAgICAgICByZXNvdXJjZXM6IFtidWlsZFByb2plY3QucHJvamVjdEFybl0sXG4gICAgICB9KSxcbiAgICApO1xuXG4gICAgb3JjaGVzdHJhdG9yRnVuY3Rpb24uYWRkVG9Sb2xlUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBhY3Rpb25zOiBbJ2xhbWJkYTpQdWJsaXNoTGF5ZXJWZXJzaW9uJ10sXG4gICAgICAgIHJlc291cmNlczogWycqJ10sXG4gICAgICB9KSxcbiAgICApO1xuXG4gICAgb3JjaGVzdHJhdG9yRnVuY3Rpb24uYWRkVG9Sb2xlUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBhY3Rpb25zOiBbJ3NzbTpQdXRQYXJhbWV0ZXInXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgICAgYGFybjphd3M6c3NtOiR7Y2RrLlN0YWNrLm9mKHRoaXMpLnJlZ2lvbn06JHtjZGsuU3RhY2sub2YodGhpcykuYWNjb3VudH06cGFyYW1ldGVyJHt0aGlzLnNzbVBhcmFtZXRlck5hbWV9YCxcbiAgICAgICAgXSxcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICAvLyBDdXN0b20gcmVzb3VyY2UgdG8gdHJpZ2dlciB0aGUgYnVpbGRcbiAgICBjb25zdCBwcm92aWRlciA9IG5ldyBjci5Qcm92aWRlcih0aGlzLCAnTGF5ZXJCdWlsZFByb3ZpZGVyJywge1xuICAgICAgb25FdmVudEhhbmRsZXI6IG9yY2hlc3RyYXRvckZ1bmN0aW9uLFxuICAgICAgbG9nUmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX1dFRUssXG4gICAgfSk7XG5cbiAgICBjb25zdCBjdXN0b21SZXNvdXJjZSA9IG5ldyBjZGsuQ3VzdG9tUmVzb3VyY2UodGhpcywgJ0xheWVyQnVpbGRSZXNvdXJjZScsIHtcbiAgICAgIHNlcnZpY2VUb2tlbjogcHJvdmlkZXIuc2VydmljZVRva2VuLFxuICAgICAgcHJvcGVydGllczoge1xuICAgICAgICBUaW1lc3RhbXA6IERhdGUubm93KCksIC8vIEZvcmNlIHVwZGF0ZSBvbiBlYWNoIGRlcGxveW1lbnRcbiAgICAgICAgRW52aXJvbm1lbnQ6IHByb3BzLmVudmlyb25tZW50LFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIHRoaXMubGF5ZXJWZXJzaW9uQXJuID0gY3VzdG9tUmVzb3VyY2UuZ2V0QXR0U3RyaW5nKCdMYXllckFybicpO1xuXG4gICAgLy8gT3V0cHV0IHRoZSBsYXllciBBUk5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnU3dldGVzdExheWVyQXJuJywge1xuICAgICAgdmFsdWU6IHRoaXMubGF5ZXJWZXJzaW9uQXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdTd2lzcyBFcGhlbWVyaXMgTGFtYmRhIExheWVyIEFSTicsXG4gICAgICBleHBvcnROYW1lOiBgQXVyYTI4LSR7cHJvcHMuZW52aXJvbm1lbnR9LVN3ZXRlc3RMYXllckFybmAsXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgRWluc3RlaW4gY2FuYXJ5IHRlc3QgTGFtYmRhXG4gICAgY29uc3QgY2FuYXJ5RnVuY3Rpb24gPSBuZXcgbGFtYmRhTm9kZUpzLk5vZGVqc0Z1bmN0aW9uKHRoaXMsICdFaW5zdGVpbkNhbmFyeUZ1bmN0aW9uJywge1xuICAgICAgZnVuY3Rpb25OYW1lOiBgYXVyYTI4LSR7cHJvcHMuZW52aXJvbm1lbnR9LXN3ZXRlc3QtY2FuYXJ5YCxcbiAgICAgIGVudHJ5OiBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vLi4vbGFtYmRhL3N3ZXRlc3QtY2FuYXJ5L2VpbnN0ZWluLWNhbmFyeS50cycpLFxuICAgICAgaGFuZGxlcjogJ2hhbmRsZXInLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIwX1gsXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICBtZW1vcnlTaXplOiAyNTYsXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBFTlZJUk9OTUVOVDogcHJvcHMuZW52aXJvbm1lbnQsXG4gICAgICB9LFxuICAgICAgYnVuZGxpbmc6IHtcbiAgICAgICAgZXh0ZXJuYWxNb2R1bGVzOiBbJ0Bhd3Mtc2RrLyonLCAnc3dpc3NlcGgnXSxcbiAgICAgICAgZm9yY2VEb2NrZXJCdW5kbGluZzogZmFsc2UsXG4gICAgICB9LFxuICAgICAgbGF5ZXJzOiBbXG4gICAgICAgIGxhbWJkYS5MYXllclZlcnNpb24uZnJvbUxheWVyVmVyc2lvbkFybihcbiAgICAgICAgICB0aGlzLFxuICAgICAgICAgICdDYW5hcnlTd2lzc0VwaGVtZXJpc0xheWVyJyxcbiAgICAgICAgICB0aGlzLmxheWVyVmVyc2lvbkFybiwgLy8gVXNlIHRoZSBDdXN0b20gUmVzb3VyY2Ugb3V0cHV0IGRpcmVjdGx5XG4gICAgICAgICksXG4gICAgICBdLFxuICAgICAgbG9nUmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX1dFRUssXG4gICAgfSk7XG5cbiAgICAvLyBHcmFudCBDbG91ZFdhdGNoIG1ldHJpY3MgcGVybWlzc2lvbnNcbiAgICBjYW5hcnlGdW5jdGlvbi5hZGRUb1JvbGVQb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGFjdGlvbnM6IFsnY2xvdWR3YXRjaDpQdXRNZXRyaWNEYXRhJ10sXG4gICAgICAgIHJlc291cmNlczogWycqJ10sXG4gICAgICB9KSxcbiAgICApO1xuXG4gICAgLy8gU2NoZWR1bGUgY2FuYXJ5IHRvIHJ1biBkYWlseVxuICAgIGNvbnN0IGNhbmFyeVNjaGVkdWxlID0gbmV3IGV2ZW50cy5SdWxlKHRoaXMsICdDYW5hcnlTY2hlZHVsZScsIHtcbiAgICAgIHJ1bGVOYW1lOiBgYXVyYTI4LSR7cHJvcHMuZW52aXJvbm1lbnR9LXN3ZXRlc3QtY2FuYXJ5LXNjaGVkdWxlYCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnRGFpbHkgU3dpc3MgRXBoZW1lcmlzIGxheWVyIHZhbGlkYXRpb24nLFxuICAgICAgc2NoZWR1bGU6IGV2ZW50cy5TY2hlZHVsZS5yYXRlKGNkay5EdXJhdGlvbi5kYXlzKDEpKSxcbiAgICB9KTtcblxuICAgIGNhbmFyeVNjaGVkdWxlLmFkZFRhcmdldChuZXcgdGFyZ2V0cy5MYW1iZGFGdW5jdGlvbihjYW5hcnlGdW5jdGlvbikpO1xuXG4gICAgLy8gQ3JlYXRlIENsb3VkV2F0Y2ggYWxhcm0gZm9yIGNhbmFyeSBmYWlsdXJlc1xuICAgIG5ldyBjbG91ZHdhdGNoLkFsYXJtKHRoaXMsICdDYW5hcnlBbGFybScsIHtcbiAgICAgIGFsYXJtTmFtZTogYGF1cmEyOC0ke3Byb3BzLmVudmlyb25tZW50fS1zd2V0ZXN0LWNhbmFyeS1mYWlsdXJlYCxcbiAgICAgIGFsYXJtRGVzY3JpcHRpb246ICdTd2lzcyBFcGhlbWVyaXMgbGF5ZXIgY2FuYXJ5IHRlc3QgZmFpbHVyZScsXG4gICAgICBtZXRyaWM6IG5ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XG4gICAgICAgIG5hbWVzcGFjZTogJ0F1cmEyOC9DYW5hcnknLFxuICAgICAgICBtZXRyaWNOYW1lOiAnU3dpc3NFcGhlbWVyaXNMYXllckhlYWx0aCcsXG4gICAgICAgIGRpbWVuc2lvbnNNYXA6IHtcbiAgICAgICAgICBFbnZpcm9ubWVudDogcHJvcHMuZW52aXJvbm1lbnQsXG4gICAgICAgICAgVGVzdDogJ0VpbnN0ZWluJyxcbiAgICAgICAgfSxcbiAgICAgICAgc3RhdGlzdGljOiAnQXZlcmFnZScsXG4gICAgICAgIHBlcmlvZDogY2RrLkR1cmF0aW9uLmRheXMoMSksXG4gICAgICB9KSxcbiAgICAgIHRocmVzaG9sZDogMSxcbiAgICAgIGNvbXBhcmlzb25PcGVyYXRvcjogY2xvdWR3YXRjaC5Db21wYXJpc29uT3BlcmF0b3IuTEVTU19USEFOX1RIUkVTSE9MRCxcbiAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiAxLFxuICAgICAgdHJlYXRNaXNzaW5nRGF0YTogY2xvdWR3YXRjaC5UcmVhdE1pc3NpbmdEYXRhLkJSRUFDSElORyxcbiAgICB9KTtcblxuICAgIC8vIE91dHB1dCBjYW5hcnkgZnVuY3Rpb24gQVJOXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0NhbmFyeUZ1bmN0aW9uQXJuJywge1xuICAgICAgdmFsdWU6IGNhbmFyeUZ1bmN0aW9uLmZ1bmN0aW9uQXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdFaW5zdGVpbiBDYW5hcnkgVGVzdCBGdW5jdGlvbiBBUk4nLFxuICAgIH0pO1xuICB9XG59XG4iXX0=