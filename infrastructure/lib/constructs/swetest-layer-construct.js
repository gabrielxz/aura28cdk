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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3dldGVzdC1sYXllci1jb25zdHJ1Y3QuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJzd2V0ZXN0LWxheWVyLWNvbnN0cnVjdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLGlEQUFtQztBQUNuQyxxRUFBdUQ7QUFDdkQsK0RBQWlEO0FBQ2pELHVEQUF5QztBQUN6Qyx5REFBMkM7QUFDM0MsaUVBQW1EO0FBQ25ELDJEQUE2QztBQUM3QywrREFBaUQ7QUFDakQsd0VBQTBEO0FBQzFELHVFQUF5RDtBQUN6RCw0RUFBOEQ7QUFDOUQsMkNBQXVDO0FBQ3ZDLDJDQUE2QjtBQU83QixNQUFhLHFCQUFzQixTQUFRLHNCQUFTO0lBQ2xDLGVBQWUsQ0FBUztJQUN2QixnQkFBZ0IsQ0FBUztJQUUxQyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQWlDO1FBQ3pFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIseURBQXlEO1FBQ3pELEtBQUssQ0FBQyxlQUFlLEVBQUUsT0FBTyxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUU7WUFDcEMsTUFBTSxlQUFlLEdBQUksRUFBbUMsQ0FBQyxPQUFPLENBQUM7WUFDckUsSUFBSSxlQUFlLElBQUksZUFBZSxLQUFLLE1BQU0sQ0FBQyxPQUFPLENBQUMsV0FBVyxFQUFFLENBQUM7Z0JBQ3RFLE1BQU0sSUFBSSxLQUFLLENBQ2IsbUJBQW1CLEVBQUUsQ0FBQyxZQUFZLFNBQVMsZUFBZSxDQUFDLElBQUksbUVBQW1FLENBQ25JLENBQUM7WUFDSixDQUFDO1FBQ0gsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsZ0JBQWdCLEdBQUcsV0FBVyxLQUFLLENBQUMsV0FBVyxxQkFBcUIsQ0FBQztRQUUxRSxnQ0FBZ0M7UUFDaEMsTUFBTSxjQUFjLEdBQUcsSUFBSSxFQUFFLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxnQkFBZ0IsRUFBRTtZ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NkJBQTZCO1FBQzdCLElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsbUJBQW1CLEVBQUU7WUFDM0MsS0FBSyxFQUFFLGNBQWMsQ0FBQyxXQUFXO1lBQ2pDLFdBQVcsRUFBRSxtQ0FBbUM7U0FDakQsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBbE1ELHNEQWtNQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgKiBhcyBjb2RlYnVpbGQgZnJvbSAnYXdzLWNkay1saWIvYXdzLWNvZGVidWlsZCc7XG5pbXBvcnQgKiBhcyBsYW1iZGEgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxhbWJkYSc7XG5pbXBvcnQgKiBhcyBzMyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtczMnO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1pYW0nO1xuaW1wb3J0ICogYXMgY3IgZnJvbSAnYXdzLWNkay1saWIvY3VzdG9tLXJlc291cmNlcyc7XG5pbXBvcnQgKiBhcyBsb2dzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sb2dzJztcbmltcG9ydCAqIGFzIGV2ZW50cyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZXZlbnRzJztcbmltcG9ydCAqIGFzIHRhcmdldHMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWV2ZW50cy10YXJnZXRzJztcbmltcG9ydCAqIGFzIGNsb3Vkd2F0Y2ggZnJvbSAnYXdzLWNkay1saWIvYXdzLWNsb3Vkd2F0Y2gnO1xuaW1wb3J0ICogYXMgbGFtYmRhTm9kZUpzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sYW1iZGEtbm9kZWpzJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcblxuZXhwb3J0IGludGVyZmFjZSBTd2V0ZXN0TGF5ZXJDb25zdHJ1Y3RQcm9wcyB7XG4gIGVudmlyb25tZW50OiAnZGV2JyB8ICdwcm9kJztcbiAgbGFtYmRhRnVuY3Rpb25zPzogbGFtYmRhLkZ1bmN0aW9uW107XG59XG5cbmV4cG9ydCBjbGFzcyBTd2V0ZXN0TGF5ZXJDb25zdHJ1Y3QgZXh0ZW5kcyBDb25zdHJ1Y3Qge1xuICBwdWJsaWMgcmVhZG9ubHkgbGF5ZXJWZXJzaW9uQXJuOiBzdHJpbmc7XG4gIHByaXZhdGUgcmVhZG9ubHkgc3NtUGFyYW1ldGVyTmFtZTogc3RyaW5nO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBTd2V0ZXN0TGF5ZXJDb25zdHJ1Y3RQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCk7XG5cbiAgICAvLyBSdW50aW1lIGNvbnNpc3RlbmN5IGd1YXJkcmFpbCAtIHZhbGlkYXRlIGF0IHN5bnRoIHRpbWVcbiAgICBwcm9wcy5sYW1iZGFGdW5jdGlvbnM/LmZvckVhY2goKGZuKSA9PiB7XG4gICAgICBjb25zdCBmdW5jdGlvblJ1bnRpbWUgPSAoZm4gYXMgeyBydW50aW1lPzogbGFtYmRhLlJ1bnRpbWUgfSkucnVudGltZTtcbiAgICAgIGlmIChmdW5jdGlvblJ1bnRpbWUgJiYgZnVuY3Rpb25SdW50aW1lICE9PSBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjBfWCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgYExhbWJkYSBmdW5jdGlvbiAke2ZuLmZ1bmN0aW9uTmFtZX0gdXNlcyAke2Z1bmN0aW9uUnVudGltZS5uYW1lfSBidXQgbXVzdCB1c2UgTk9ERUpTXzIwX1ggZm9yIFN3aXNzIEVwaGVtZXJpcyBsYXllciBjb21wYXRpYmlsaXR5YCxcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHRoaXMuc3NtUGFyYW1ldGVyTmFtZSA9IGAvYXVyYTI4LyR7cHJvcHMuZW52aXJvbm1lbnR9L2xheWVycy9zd2V0ZXN0LWFybmA7XG5cbiAgICAvLyBTMyBidWNrZXQgZm9yIGJ1aWxkIGFydGlmYWN0c1xuICAgIGNvbnN0IGFydGlmYWN0QnVja2V0ID0gbmV3IHMzLkJ1Y2tldCh0aGlzLCAnQXJ0aWZhY3RCdWNrZXQnLCB7XG4gICAgICBidWNrZXROYW1lOiBgYXVyYTI4LSR7cHJvcHMuZW52aXJvbm1lbnR9LXN3ZXRlc3QtbGF5ZXItYXJ0aWZhY3RzYCxcbiAgICAgIHJlbW92YWxQb2xpY3k6XG4gICAgICAgIHByb3BzLmVudmlyb25tZW50ID09PSAncHJvZCcgPyBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4gOiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgYXV0b0RlbGV0ZU9iamVjdHM6IHByb3BzLmVudmlyb25tZW50ICE9PSAncHJvZCcsXG4gICAgICBsaWZlY3ljbGVSdWxlczogW1xuICAgICAgICB7XG4gICAgICAgICAgaWQ6ICdkZWxldGUtb2xkLWFydGlmYWN0cycsXG4gICAgICAgICAgZW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICBleHBpcmF0aW9uOiBjZGsuRHVyYXRpb24uZGF5cygzMCksXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgLy8gQ29kZUJ1aWxkIHByb2plY3QgZm9yIGJ1aWxkaW5nIHRoZSBsYXllclxuICAgIGNvbnN0IGJ1aWxkUHJvamVjdCA9IG5ldyBjb2RlYnVpbGQuUHJvamVjdCh0aGlzLCAnTGF5ZXJCdWlsZFByb2plY3QnLCB7XG4gICAgICBwcm9qZWN0TmFtZTogYGF1cmEyOC0ke3Byb3BzLmVudmlyb25tZW50fS1zd2V0ZXN0LWxheWVyLWJ1aWxkYCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQnVpbGRzIFN3aXNzIEVwaGVtZXJpcyBMYW1iZGEgbGF5ZXIgZm9yIE5vZGUuanMgMjAueCBvbiBBbWF6b24gTGludXggMjAyMycsXG4gICAgICBzb3VyY2U6IGNvZGVidWlsZC5Tb3VyY2UuczMoe1xuICAgICAgICBidWNrZXQ6IGFydGlmYWN0QnVja2V0LFxuICAgICAgICBwYXRoOiAnc291cmNlL3N3ZXRlc3Qtc3JjLnppcCcsXG4gICAgICB9KSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIGJ1aWxkSW1hZ2U6IGNvZGVidWlsZC5MaW51eEJ1aWxkSW1hZ2UuQU1BWk9OX0xJTlVYXzJfNSxcbiAgICAgICAgY29tcHV0ZVR5cGU6IGNvZGVidWlsZC5Db21wdXRlVHlwZS5TTUFMTCxcbiAgICAgICAgcHJpdmlsZWdlZDogZmFsc2UsXG4gICAgICB9LFxuICAgICAgYXJ0aWZhY3RzOiBjb2RlYnVpbGQuQXJ0aWZhY3RzLnMzKHtcbiAgICAgICAgYnVja2V0OiBhcnRpZmFjdEJ1Y2tldCxcbiAgICAgICAgcGF0aDogJ2J1aWxkJyxcbiAgICAgICAgbmFtZTogJ2xheWVyLnppcCcsXG4gICAgICAgIHBhY2thZ2VaaXA6IGZhbHNlLFxuICAgICAgfSksXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24ubWludXRlcygxNSksXG4gICAgICBjYWNoZTogY29kZWJ1aWxkLkNhY2hlLmxvY2FsKGNvZGVidWlsZC5Mb2NhbENhY2hlTW9kZS5TT1VSQ0UpLFxuICAgIH0pO1xuXG4gICAgLy8gTGFtYmRhIGZ1bmN0aW9uIHRvIG9yY2hlc3RyYXRlIHRoZSBidWlsZCBwcm9jZXNzXG4gICAgY29uc3Qgb3JjaGVzdHJhdG9yRnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdPcmNoZXN0cmF0b3JGdW5jdGlvbicsIHtcbiAgICAgIGZ1bmN0aW9uTmFtZTogYGF1cmEyOC0ke3Byb3BzLmVudmlyb25tZW50fS1zd2V0ZXN0LWxheWVyLW9yY2hlc3RyYXRvcmAsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjBfWCxcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5taW51dGVzKDE1KSxcbiAgICAgIG1lbW9yeVNpemU6IDI1NixcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIEJVSUxEX1BST0pFQ1RfTkFNRTogYnVpbGRQcm9qZWN0LnByb2plY3ROYW1lLFxuICAgICAgICBBUlRJRkFDVF9CVUNLRVQ6IGFydGlmYWN0QnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICAgIFNTTV9QQVJBTUVURVJfTkFNRTogdGhpcy5zc21QYXJhbWV0ZXJOYW1lLFxuICAgICAgICBFTlZJUk9OTUVOVDogcHJvcHMuZW52aXJvbm1lbnQsXG4gICAgICB9LFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUFzc2V0KFxuICAgICAgICBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vLi4vbGFtYmRhL3N3ZXRlc3Qtb3JjaGVzdHJhdG9yL29yY2hlc3RyYXRvci56aXAnKSxcbiAgICAgICksXG4gICAgICBsb2dSZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfV0VFSyxcbiAgICB9KTtcblxuICAgIC8vIEdyYW50IHBlcm1pc3Npb25zXG4gICAgYXJ0aWZhY3RCdWNrZXQuZ3JhbnRSZWFkV3JpdGUob3JjaGVzdHJhdG9yRnVuY3Rpb24pO1xuICAgIGFydGlmYWN0QnVja2V0LmdyYW50UmVhZFdyaXRlKGJ1aWxkUHJvamVjdCk7XG5cbiAgICBvcmNoZXN0cmF0b3JGdW5jdGlvbi5hZGRUb1JvbGVQb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGFjdGlvbnM6IFsnY29kZWJ1aWxkOlN0YXJ0QnVpbGQnLCAnY29kZWJ1aWxkOkJhdGNoR2V0QnVpbGRzJ10sXG4gICAgICAgIHJlc291cmNlczogW2J1aWxkUHJvamVjdC5wcm9qZWN0QXJuXSxcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICBvcmNoZXN0cmF0b3JGdW5jdGlvbi5hZGRUb1JvbGVQb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGFjdGlvbnM6IFsnbGFtYmRhOlB1Ymxpc2hMYXllclZlcnNpb24nXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbJyonXSxcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICBvcmNoZXN0cmF0b3JGdW5jdGlvbi5hZGRUb1JvbGVQb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGFjdGlvbnM6IFsnc3NtOlB1dFBhcmFtZXRlciddLFxuICAgICAgICByZXNvdXJjZXM6IFtcbiAgICAgICAgICBgYXJuOmF3czpzc206JHtjZGsuU3RhY2sub2YodGhpcykucmVnaW9ufToke2Nkay5TdGFjay5vZih0aGlzKS5hY2NvdW50fTpwYXJhbWV0ZXIke3RoaXMuc3NtUGFyYW1ldGVyTmFtZX1gLFxuICAgICAgICBdLFxuICAgICAgfSksXG4gICAgKTtcblxuICAgIC8vIEN1c3RvbSByZXNvdXJjZSB0byB0cmlnZ2VyIHRoZSBidWlsZFxuICAgIGNvbnN0IHByb3ZpZGVyID0gbmV3IGNyLlByb3ZpZGVyKHRoaXMsICdMYXllckJ1aWxkUHJvdmlkZXInLCB7XG4gICAgICBvbkV2ZW50SGFuZGxlcjogb3JjaGVzdHJhdG9yRnVuY3Rpb24sXG4gICAgICBsb2dSZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfV0VFSyxcbiAgICB9KTtcblxuICAgIGNvbnN0IGN1c3RvbVJlc291cmNlID0gbmV3IGNkay5DdXN0b21SZXNvdXJjZSh0aGlzLCAnTGF5ZXJCdWlsZFJlc291cmNlJywge1xuICAgICAgc2VydmljZVRva2VuOiBwcm92aWRlci5zZXJ2aWNlVG9rZW4sXG4gICAgICBwcm9wZXJ0aWVzOiB7XG4gICAgICAgIFRpbWVzdGFtcDogRGF0ZS5ub3coKSwgLy8gRm9yY2UgdXBkYXRlIG9uIGVhY2ggZGVwbG95bWVudFxuICAgICAgICBFbnZpcm9ubWVudDogcHJvcHMuZW52aXJvbm1lbnQsXG4gICAgICB9LFxuICAgIH0pO1xuXG4gICAgdGhpcy5sYXllclZlcnNpb25Bcm4gPSBjdXN0b21SZXNvdXJjZS5nZXRBdHRTdHJpbmcoJ0xheWVyQXJuJyk7XG5cbiAgICAvLyBPdXRwdXQgdGhlIGxheWVyIEFSTlxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdTd2V0ZXN0TGF5ZXJBcm4nLCB7XG4gICAgICB2YWx1ZTogdGhpcy5sYXllclZlcnNpb25Bcm4sXG4gICAgICBkZXNjcmlwdGlvbjogJ1N3aXNzIEVwaGVtZXJpcyBMYW1iZGEgTGF5ZXIgQVJOJyxcbiAgICAgIGV4cG9ydE5hbWU6IGBBdXJhMjgtJHtwcm9wcy5lbnZpcm9ubWVudH0tU3dldGVzdExheWVyQXJuYCxcbiAgICB9KTtcblxuICAgIC8vIENyZWF0ZSBFaW5zdGVpbiBjYW5hcnkgdGVzdCBMYW1iZGFcbiAgICBjb25zdCBjYW5hcnlGdW5jdGlvbiA9IG5ldyBsYW1iZGFOb2RlSnMuTm9kZWpzRnVuY3Rpb24odGhpcywgJ0VpbnN0ZWluQ2FuYXJ5RnVuY3Rpb24nLCB7XG4gICAgICBmdW5jdGlvbk5hbWU6IGBhdXJhMjgtJHtwcm9wcy5lbnZpcm9ubWVudH0tc3dldGVzdC1jYW5hcnlgLFxuICAgICAgZW50cnk6IHBhdGguam9pbihfX2Rpcm5hbWUsICcuLi8uLi9sYW1iZGEvc3dldGVzdC1jYW5hcnkvZWluc3RlaW4tY2FuYXJ5LnRzJyksXG4gICAgICBoYW5kbGVyOiAnaGFuZGxlcicsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjBfWCxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5zZWNvbmRzKDMwKSxcbiAgICAgIG1lbW9yeVNpemU6IDI1NixcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIEVOVklST05NRU5UOiBwcm9wcy5lbnZpcm9ubWVudCxcbiAgICAgIH0sXG4gICAgICBidW5kbGluZzoge1xuICAgICAgICBleHRlcm5hbE1vZHVsZXM6IFsnQGF3cy1zZGsvKicsICdzd2lzc2VwaCddLFxuICAgICAgICBmb3JjZURvY2tlckJ1bmRsaW5nOiBmYWxzZSxcbiAgICAgIH0sXG4gICAgICBsYXllcnM6IFtcbiAgICAgICAgbGFtYmRhLkxheWVyVmVyc2lvbi5mcm9tTGF5ZXJWZXJzaW9uQXJuKFxuICAgICAgICAgIHRoaXMsXG4gICAgICAgICAgJ0NhbmFyeVN3aXNzRXBoZW1lcmlzTGF5ZXInLFxuICAgICAgICAgIHRoaXMubGF5ZXJWZXJzaW9uQXJuLCAvLyBVc2UgdGhlIEN1c3RvbSBSZXNvdXJjZSBvdXRwdXQgZGlyZWN0bHlcbiAgICAgICAgKSxcbiAgICAgIF0sXG4gICAgICBsb2dSZXRlbnRpb246IGxvZ3MuUmV0ZW50aW9uRGF5cy5PTkVfV0VFSyxcbiAgICB9KTtcblxuICAgIC8vIEdyYW50IENsb3VkV2F0Y2ggbWV0cmljcyBwZXJtaXNzaW9uc1xuICAgIGNhbmFyeUZ1bmN0aW9uLmFkZFRvUm9sZVBvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgYWN0aW9uczogWydjbG91ZHdhdGNoOlB1dE1ldHJpY0RhdGEnXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbJyonXSxcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICAvLyBTY2hlZHVsZSBjYW5hcnkgdG8gcnVuIGRhaWx5XG4gICAgY29uc3QgY2FuYXJ5U2NoZWR1bGUgPSBuZXcgZXZlbnRzLlJ1bGUodGhpcywgJ0NhbmFyeVNjaGVkdWxlJywge1xuICAgICAgcnVsZU5hbWU6IGBhdXJhMjgtJHtwcm9wcy5lbnZpcm9ubWVudH0tc3dldGVzdC1jYW5hcnktc2NoZWR1bGVgLFxuICAgICAgZGVzY3JpcHRpb246ICdEYWlseSBTd2lzcyBFcGhlbWVyaXMgbGF5ZXIgdmFsaWRhdGlvbicsXG4gICAgICBzY2hlZHVsZTogZXZlbnRzLlNjaGVkdWxlLnJhdGUoY2RrLkR1cmF0aW9uLmRheXMoMSkpLFxuICAgIH0pO1xuXG4gICAgY2FuYXJ5U2NoZWR1bGUuYWRkVGFyZ2V0KG5ldyB0YXJnZXRzLkxhbWJkYUZ1bmN0aW9uKGNhbmFyeUZ1bmN0aW9uKSk7XG5cbiAgICAvLyBDcmVhdGUgQ2xvdWRXYXRjaCBhbGFybSBmb3IgY2FuYXJ5IGZhaWx1cmVzXG4gICAgbmV3IGNsb3Vkd2F0Y2guQWxhcm0odGhpcywgJ0NhbmFyeUFsYXJtJywge1xuICAgICAgYWxhcm1OYW1lOiBgYXVyYTI4LSR7cHJvcHMuZW52aXJvbm1lbnR9LXN3ZXRlc3QtY2FuYXJ5LWZhaWx1cmVgLFxuICAgICAgYWxhcm1EZXNjcmlwdGlvbjogJ1N3aXNzIEVwaGVtZXJpcyBsYXllciBjYW5hcnkgdGVzdCBmYWlsdXJlJyxcbiAgICAgIG1ldHJpYzogbmV3IGNsb3Vkd2F0Y2guTWV0cmljKHtcbiAgICAgICAgbmFtZXNwYWNlOiAnQXVyYTI4L0NhbmFyeScsXG4gICAgICAgIG1ldHJpY05hbWU6ICdTd2lzc0VwaGVtZXJpc0xheWVySGVhbHRoJyxcbiAgICAgICAgZGltZW5zaW9uc01hcDoge1xuICAgICAgICAgIEVudmlyb25tZW50OiBwcm9wcy5lbnZpcm9ubWVudCxcbiAgICAgICAgICBUZXN0OiAnRWluc3RlaW4nLFxuICAgICAgICB9LFxuICAgICAgICBzdGF0aXN0aWM6ICdBdmVyYWdlJyxcbiAgICAgICAgcGVyaW9kOiBjZGsuRHVyYXRpb24uZGF5cygxKSxcbiAgICAgIH0pLFxuICAgICAgdGhyZXNob2xkOiAxLFxuICAgICAgY29tcGFyaXNvbk9wZXJhdG9yOiBjbG91ZHdhdGNoLkNvbXBhcmlzb25PcGVyYXRvci5MRVNTX1RIQU5fVEhSRVNIT0xELFxuICAgICAgZXZhbHVhdGlvblBlcmlvZHM6IDEsXG4gICAgICB0cmVhdE1pc3NpbmdEYXRhOiBjbG91ZHdhdGNoLlRyZWF0TWlzc2luZ0RhdGEuQlJFQUNISU5HLFxuICAgIH0pO1xuXG4gICAgLy8gT3V0cHV0IGNhbmFyeSBmdW5jdGlvbiBBUk5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnQ2FuYXJ5RnVuY3Rpb25Bcm4nLCB7XG4gICAgICB2YWx1ZTogY2FuYXJ5RnVuY3Rpb24uZnVuY3Rpb25Bcm4sXG4gICAgICBkZXNjcmlwdGlvbjogJ0VpbnN0ZWluIENhbmFyeSBUZXN0IEZ1bmN0aW9uIEFSTicsXG4gICAgfSk7XG4gIH1cbn1cbiJdfQ==