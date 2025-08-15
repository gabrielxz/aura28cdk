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
const ssm = __importStar(require("aws-cdk-lib/aws-ssm"));
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
            code: lambda.Code.fromInline(`
const { CodeBuildClient, StartBuildCommand } = require('@aws-sdk/client-codebuild');
const { S3Client, PutObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { LambdaClient, PublishLayerVersionCommand } = require('@aws-sdk/client-lambda');
const { SSMClient, PutParameterCommand } = require('@aws-sdk/client-ssm');
const { readFileSync } = require('fs');
const { join } = require('path');
const { createReadStream } = require('fs');
const { Upload } = require('@aws-sdk/lib-storage');

const codebuild = new CodeBuildClient();
const s3 = new S3Client();
const lambda = new LambdaClient();
const ssm = new SSMClient();

exports.handler = async (event, context) => {
  console.log('Event:', JSON.stringify(event, null, 2));
  
  if (event.RequestType === 'Delete') {
    return { PhysicalResourceId: event.PhysicalResourceId || 'swetest-layer' };
  }
  
  try {
    // Upload source code to S3
    console.log('Uploading source code to S3...');
    const sourceZip = await createSourceZip();
    await s3.send(new PutObjectCommand({
      Bucket: process.env.ARTIFACT_BUCKET,
      Key: 'source/swetest-src.zip',
      Body: sourceZip,
    }));
    
    // Start CodeBuild
    console.log('Starting CodeBuild project...');
    const buildResponse = await codebuild.send(new StartBuildCommand({
      projectName: process.env.BUILD_PROJECT_NAME,
    }));
    
    const buildId = buildResponse.build.id;
    console.log('Build started:', buildId);
    
    // Wait for build to complete
    await waitForBuild(buildId);
    
    // Download built layer from S3
    console.log('Downloading built layer...');
    const layerData = await s3.send(new GetObjectCommand({
      Bucket: process.env.ARTIFACT_BUCKET,
      Key: 'build/layer.zip',
    }));
    
    const layerBuffer = await streamToBuffer(layerData.Body);
    
    // Publish Lambda layer
    console.log('Publishing Lambda layer...');
    const layerResponse = await lambda.send(new PublishLayerVersionCommand({
      LayerName: \`aura28-\${process.env.ENVIRONMENT}-swetest\`,
      Description: 'Swiss Ephemeris for Node.js 20.x built on Amazon Linux 2023',
      Content: { ZipFile: layerBuffer },
      CompatibleRuntimes: ['nodejs20.x'],
      CompatibleArchitectures: ['x86_64'],
    }));
    
    const layerArn = layerResponse.LayerVersionArn;
    console.log('Layer published:', layerArn);
    
    // Store ARN in SSM Parameter Store
    console.log('Storing ARN in SSM Parameter Store...');
    await ssm.send(new PutParameterCommand({
      Name: process.env.SSM_PARAMETER_NAME,
      Value: layerArn,
      Type: 'String',
      Overwrite: true,
      Description: 'Swiss Ephemeris Lambda Layer ARN for Node.js 20.x',
    }));
    
    return {
      PhysicalResourceId: layerArn,
      Data: { LayerArn: layerArn },
    };
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
};

async function createSourceZip() {
  // In a real implementation, this would zip the swetest-src directory
  // For now, return a minimal zip with package.json and buildspec.yml
  const AdmZip = require('adm-zip');
  const zip = new AdmZip();
  
  // Add package.json
  zip.addFile('package.json', Buffer.from(JSON.stringify({
    name: 'swetest-layer',
    version: '1.0.0',
    dependencies: { swisseph: '^0.5.13' }
  }, null, 2)));
  
  // Add buildspec.yml (content from the actual file)
  const buildspecContent = \`version: 0.2

phases:
  install:
    runtime-versions:
      nodejs: 20
    commands:
      - yum update -y
      - yum install -y gcc-c++ make python3
  build:
    commands:
      - npm ci
      - mkdir -p nodejs
      - cp -r node_modules nodejs/
      - mkdir -p nodejs/node_modules/swisseph/ephe
      - |
        if [ -f "node_modules/swisseph/ephe/sepl_18.se1" ]; then
          cp node_modules/swisseph/ephe/sepl_18.se1 nodejs/node_modules/swisseph/ephe/
          cp node_modules/swisseph/ephe/seas_18.se1 nodejs/node_modules/swisseph/ephe/
          cp node_modules/swisseph/ephe/semo_18.se1 nodejs/node_modules/swisseph/ephe/
        fi
      - zip -rq layer.zip nodejs/
artifacts:
  files:
    - layer.zip
\`;
  
  zip.addFile('buildspec.yml', Buffer.from(buildspecContent));
  return zip.toBuffer();
}

async function waitForBuild(buildId) {
  const { CodeBuildClient, BatchGetBuildsCommand } = require('@aws-sdk/client-codebuild');
  const codebuild = new CodeBuildClient();
  
  let status = 'IN_PROGRESS';
  while (status === 'IN_PROGRESS') {
    await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
    
    const response = await codebuild.send(new BatchGetBuildsCommand({
      ids: [buildId],
    }));
    
    status = response.builds[0].buildStatus;
    console.log('Build status:', status);
  }
  
  if (status !== 'SUCCEEDED') {
    throw new Error(\`Build failed with status: \${status}\`);
  }
}

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
      `),
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
                lambda.LayerVersion.fromLayerVersionArn(this, 'CanarySwissEphemerisLayer', ssm.StringParameter.valueForStringParameter(this, this.ssmParameterName)),
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3dldGVzdC1sYXllci1jb25zdHJ1Y3QuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJzd2V0ZXN0LWxheWVyLWNvbnN0cnVjdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLGlEQUFtQztBQUNuQyxxRUFBdUQ7QUFDdkQsK0RBQWlEO0FBQ2pELHVEQUF5QztBQUN6Qyx5REFBMkM7QUFDM0MseURBQTJDO0FBQzNDLGlFQUFtRDtBQUNuRCwyREFBNkM7QUFDN0MsK0RBQWlEO0FBQ2pELHdFQUEwRDtBQUMxRCx1RUFBeUQ7QUFDekQsNEVBQThEO0FBQzlELDJDQUF1QztBQUN2QywyQ0FBNkI7QUFPN0IsTUFBYSxxQkFBc0IsU0FBUSxzQkFBUztJQUNsQyxlQUFlLENBQVM7SUFDdkIsZ0JBQWdCLENBQVM7SUFFMUMsWUFBWSxLQUFnQixFQUFFLEVBQVUsRUFBRSxLQUFpQztRQUN6RSxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRWpCLHlEQUF5RDtRQUN6RCxLQUFLLENBQUMsZUFBZSxFQUFFLE9BQU8sQ0FBQyxDQUFDLEVBQUUsRUFBRSxFQUFFO1lBQ3BDLE1BQU0sZUFBZSxHQUFJLEVBQW1DLENBQUMsT0FBTyxDQUFDO1lBQ3JFLElBQUksZUFBZSxJQUFJLGVBQWUsS0FBSyxNQUFNLENBQUMsT0FBTyxDQUFDLFdBQVcsRUFBRSxDQUFDO2dCQUN0RSxNQUFNLElBQUksS0FBSyxDQUNiLG1CQUFtQixFQUFFLENBQUMsWUFBWSxTQUFTLGVBQWUsQ0FBQyxJQUFJLG1FQUFtRSxDQUNuSSxDQUFDO1lBQ0osQ0FBQztRQUNILENBQUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLGdCQUFnQixHQUFHLFdBQVcsS0FBSyxDQUFDLFdBQVcscUJBQXFCLENBQUM7UUFFMUUsZ0NBQWdDO1FBQ2hDLE1BQU0sY0FBYyxHQUFHLElBQUksRUFBRSxDQUFDLE1BQU0sQ0FBQyxJQUFJLEVBQUUs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SSxDQUFDLENBQUMsQ0FBQzthQUM3QixDQUFDO1lBQ0YsU0FBUyxFQUFFLENBQUM7WUFDWixrQkFBa0IsRUFBRSxVQUFVLENBQUMsa0JBQWtCLENBQUMsbUJBQW1CO1lBQ3JFLGlCQUFpQixFQUFFLENBQUM7WUFDcEIsZ0JBQWdCLEVBQUUsVUFBVSxDQUFDLGdCQUFnQixDQUFDLFNBQVM7U0FDeEQsQ0FBQyxDQUFDO1FBRUgsNkJBQTZCO1FBQzdCLElBQUksR0FBRyxDQUFDLFNBQVMsQ0FBQyxJQUFJLEVBQUUsbUJBQW1CLEVBQUU7WUFDM0MsS0FBSyxFQUFFLGNBQWMsQ0FBQyxXQUFXO1lBQ2pDLFdBQVcsRUFBRSxtQ0FBbUM7U0FDakQsQ0FBQyxDQUFDO0lBQ0wsQ0FBQztDQUNGO0FBL1ZELHNEQStWQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCAqIGFzIGNkayBmcm9tICdhd3MtY2RrLWxpYic7XG5pbXBvcnQgKiBhcyBjb2RlYnVpbGQgZnJvbSAnYXdzLWNkay1saWIvYXdzLWNvZGVidWlsZCc7XG5pbXBvcnQgKiBhcyBsYW1iZGEgZnJvbSAnYXdzLWNkay1saWIvYXdzLWxhbWJkYSc7XG5pbXBvcnQgKiBhcyBzMyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtczMnO1xuaW1wb3J0ICogYXMgc3NtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1zc20nO1xuaW1wb3J0ICogYXMgaWFtIGZyb20gJ2F3cy1jZGstbGliL2F3cy1pYW0nO1xuaW1wb3J0ICogYXMgY3IgZnJvbSAnYXdzLWNkay1saWIvY3VzdG9tLXJlc291cmNlcyc7XG5pbXBvcnQgKiBhcyBsb2dzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sb2dzJztcbmltcG9ydCAqIGFzIGV2ZW50cyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtZXZlbnRzJztcbmltcG9ydCAqIGFzIHRhcmdldHMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWV2ZW50cy10YXJnZXRzJztcbmltcG9ydCAqIGFzIGNsb3Vkd2F0Y2ggZnJvbSAnYXdzLWNkay1saWIvYXdzLWNsb3Vkd2F0Y2gnO1xuaW1wb3J0ICogYXMgbGFtYmRhTm9kZUpzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sYW1iZGEtbm9kZWpzJztcbmltcG9ydCB7IENvbnN0cnVjdCB9IGZyb20gJ2NvbnN0cnVjdHMnO1xuaW1wb3J0ICogYXMgcGF0aCBmcm9tICdwYXRoJztcblxuZXhwb3J0IGludGVyZmFjZSBTd2V0ZXN0TGF5ZXJDb25zdHJ1Y3RQcm9wcyB7XG4gIGVudmlyb25tZW50OiAnZGV2JyB8ICdwcm9kJztcbiAgbGFtYmRhRnVuY3Rpb25zPzogbGFtYmRhLkZ1bmN0aW9uW107XG59XG5cbmV4cG9ydCBjbGFzcyBTd2V0ZXN0TGF5ZXJDb25zdHJ1Y3QgZXh0ZW5kcyBDb25zdHJ1Y3Qge1xuICBwdWJsaWMgcmVhZG9ubHkgbGF5ZXJWZXJzaW9uQXJuOiBzdHJpbmc7XG4gIHByaXZhdGUgcmVhZG9ubHkgc3NtUGFyYW1ldGVyTmFtZTogc3RyaW5nO1xuXG4gIGNvbnN0cnVjdG9yKHNjb3BlOiBDb25zdHJ1Y3QsIGlkOiBzdHJpbmcsIHByb3BzOiBTd2V0ZXN0TGF5ZXJDb25zdHJ1Y3RQcm9wcykge1xuICAgIHN1cGVyKHNjb3BlLCBpZCk7XG5cbiAgICAvLyBSdW50aW1lIGNvbnNpc3RlbmN5IGd1YXJkcmFpbCAtIHZhbGlkYXRlIGF0IHN5bnRoIHRpbWVcbiAgICBwcm9wcy5sYW1iZGFGdW5jdGlvbnM/LmZvckVhY2goKGZuKSA9PiB7XG4gICAgICBjb25zdCBmdW5jdGlvblJ1bnRpbWUgPSAoZm4gYXMgeyBydW50aW1lPzogbGFtYmRhLlJ1bnRpbWUgfSkucnVudGltZTtcbiAgICAgIGlmIChmdW5jdGlvblJ1bnRpbWUgJiYgZnVuY3Rpb25SdW50aW1lICE9PSBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjBfWCkge1xuICAgICAgICB0aHJvdyBuZXcgRXJyb3IoXG4gICAgICAgICAgYExhbWJkYSBmdW5jdGlvbiAke2ZuLmZ1bmN0aW9uTmFtZX0gdXNlcyAke2Z1bmN0aW9uUnVudGltZS5uYW1lfSBidXQgbXVzdCB1c2UgTk9ERUpTXzIwX1ggZm9yIFN3aXNzIEVwaGVtZXJpcyBsYXllciBjb21wYXRpYmlsaXR5YCxcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHRoaXMuc3NtUGFyYW1ldGVyTmFtZSA9IGAvYXVyYTI4LyR7cHJvcHMuZW52aXJvbm1lbnR9L2xheWVycy9zd2V0ZXN0LWFybmA7XG5cbiAgICAvLyBTMyBidWNrZXQgZm9yIGJ1aWxkIGFydGlmYWN0c1xuICAgIGNvbnN0IGFydGlmYWN0QnVja2V0ID0gbmV3IHMzLkJ1Y2tldCh0aGlzLCAnQXJ0aWZhY3RCdWNrZXQnLCB7XG4gICAgICBidWNrZXROYW1lOiBgYXVyYTI4LSR7cHJvcHMuZW52aXJvbm1lbnR9LXN3ZXRlc3QtbGF5ZXItYXJ0aWZhY3RzYCxcbiAgICAgIHJlbW92YWxQb2xpY3k6XG4gICAgICAgIHByb3BzLmVudmlyb25tZW50ID09PSAncHJvZCcgPyBjZGsuUmVtb3ZhbFBvbGljeS5SRVRBSU4gOiBjZGsuUmVtb3ZhbFBvbGljeS5ERVNUUk9ZLFxuICAgICAgYXV0b0RlbGV0ZU9iamVjdHM6IHByb3BzLmVudmlyb25tZW50ICE9PSAncHJvZCcsXG4gICAgICBsaWZlY3ljbGVSdWxlczogW1xuICAgICAgICB7XG4gICAgICAgICAgaWQ6ICdkZWxldGUtb2xkLWFydGlmYWN0cycsXG4gICAgICAgICAgZW5hYmxlZDogdHJ1ZSxcbiAgICAgICAgICBleHBpcmF0aW9uOiBjZGsuRHVyYXRpb24uZGF5cygzMCksXG4gICAgICAgIH0sXG4gICAgICBdLFxuICAgIH0pO1xuXG4gICAgLy8gQ29kZUJ1aWxkIHByb2plY3QgZm9yIGJ1aWxkaW5nIHRoZSBsYXllclxuICAgIGNvbnN0IGJ1aWxkUHJvamVjdCA9IG5ldyBjb2RlYnVpbGQuUHJvamVjdCh0aGlzLCAnTGF5ZXJCdWlsZFByb2plY3QnLCB7XG4gICAgICBwcm9qZWN0TmFtZTogYGF1cmEyOC0ke3Byb3BzLmVudmlyb25tZW50fS1zd2V0ZXN0LWxheWVyLWJ1aWxkYCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnQnVpbGRzIFN3aXNzIEVwaGVtZXJpcyBMYW1iZGEgbGF5ZXIgZm9yIE5vZGUuanMgMjAueCBvbiBBbWF6b24gTGludXggMjAyMycsXG4gICAgICBzb3VyY2U6IGNvZGVidWlsZC5Tb3VyY2UuczMoe1xuICAgICAgICBidWNrZXQ6IGFydGlmYWN0QnVja2V0LFxuICAgICAgICBwYXRoOiAnc291cmNlL3N3ZXRlc3Qtc3JjLnppcCcsXG4gICAgICB9KSxcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIGJ1aWxkSW1hZ2U6IGNvZGVidWlsZC5MaW51eEJ1aWxkSW1hZ2UuQU1BWk9OX0xJTlVYXzJfNSxcbiAgICAgICAgY29tcHV0ZVR5cGU6IGNvZGVidWlsZC5Db21wdXRlVHlwZS5TTUFMTCxcbiAgICAgICAgcHJpdmlsZWdlZDogZmFsc2UsXG4gICAgICB9LFxuICAgICAgYXJ0aWZhY3RzOiBjb2RlYnVpbGQuQXJ0aWZhY3RzLnMzKHtcbiAgICAgICAgYnVja2V0OiBhcnRpZmFjdEJ1Y2tldCxcbiAgICAgICAgcGF0aDogJ2J1aWxkJyxcbiAgICAgICAgbmFtZTogJ2xheWVyLnppcCcsXG4gICAgICAgIHBhY2thZ2VaaXA6IGZhbHNlLFxuICAgICAgfSksXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24ubWludXRlcygxNSksXG4gICAgICBjYWNoZTogY29kZWJ1aWxkLkNhY2hlLmxvY2FsKGNvZGVidWlsZC5Mb2NhbENhY2hlTW9kZS5TT1VSQ0UpLFxuICAgIH0pO1xuXG4gICAgLy8gTGFtYmRhIGZ1bmN0aW9uIHRvIG9yY2hlc3RyYXRlIHRoZSBidWlsZCBwcm9jZXNzXG4gICAgY29uc3Qgb3JjaGVzdHJhdG9yRnVuY3Rpb24gPSBuZXcgbGFtYmRhLkZ1bmN0aW9uKHRoaXMsICdPcmNoZXN0cmF0b3JGdW5jdGlvbicsIHtcbiAgICAgIGZ1bmN0aW9uTmFtZTogYGF1cmEyOC0ke3Byb3BzLmVudmlyb25tZW50fS1zd2V0ZXN0LWxheWVyLW9yY2hlc3RyYXRvcmAsXG4gICAgICBydW50aW1lOiBsYW1iZGEuUnVudGltZS5OT0RFSlNfMjBfWCxcbiAgICAgIGhhbmRsZXI6ICdpbmRleC5oYW5kbGVyJyxcbiAgICAgIHRpbWVvdXQ6IGNkay5EdXJhdGlvbi5taW51dGVzKDE1KSxcbiAgICAgIG1lbW9yeVNpemU6IDI1NixcbiAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgIEJVSUxEX1BST0pFQ1RfTkFNRTogYnVpbGRQcm9qZWN0LnByb2plY3ROYW1lLFxuICAgICAgICBBUlRJRkFDVF9CVUNLRVQ6IGFydGlmYWN0QnVja2V0LmJ1Y2tldE5hbWUsXG4gICAgICAgIFNTTV9QQVJBTUVURVJfTkFNRTogdGhpcy5zc21QYXJhbWV0ZXJOYW1lLFxuICAgICAgICBFTlZJUk9OTUVOVDogcHJvcHMuZW52aXJvbm1lbnQsXG4gICAgICB9LFxuICAgICAgY29kZTogbGFtYmRhLkNvZGUuZnJvbUlubGluZShgXG5jb25zdCB7IENvZGVCdWlsZENsaWVudCwgU3RhcnRCdWlsZENvbW1hbmQgfSA9IHJlcXVpcmUoJ0Bhd3Mtc2RrL2NsaWVudC1jb2RlYnVpbGQnKTtcbmNvbnN0IHsgUzNDbGllbnQsIFB1dE9iamVjdENvbW1hbmQsIEdldE9iamVjdENvbW1hbmQgfSA9IHJlcXVpcmUoJ0Bhd3Mtc2RrL2NsaWVudC1zMycpO1xuY29uc3QgeyBMYW1iZGFDbGllbnQsIFB1Ymxpc2hMYXllclZlcnNpb25Db21tYW5kIH0gPSByZXF1aXJlKCdAYXdzLXNkay9jbGllbnQtbGFtYmRhJyk7XG5jb25zdCB7IFNTTUNsaWVudCwgUHV0UGFyYW1ldGVyQ29tbWFuZCB9ID0gcmVxdWlyZSgnQGF3cy1zZGsvY2xpZW50LXNzbScpO1xuY29uc3QgeyByZWFkRmlsZVN5bmMgfSA9IHJlcXVpcmUoJ2ZzJyk7XG5jb25zdCB7IGpvaW4gfSA9IHJlcXVpcmUoJ3BhdGgnKTtcbmNvbnN0IHsgY3JlYXRlUmVhZFN0cmVhbSB9ID0gcmVxdWlyZSgnZnMnKTtcbmNvbnN0IHsgVXBsb2FkIH0gPSByZXF1aXJlKCdAYXdzLXNkay9saWItc3RvcmFnZScpO1xuXG5jb25zdCBjb2RlYnVpbGQgPSBuZXcgQ29kZUJ1aWxkQ2xpZW50KCk7XG5jb25zdCBzMyA9IG5ldyBTM0NsaWVudCgpO1xuY29uc3QgbGFtYmRhID0gbmV3IExhbWJkYUNsaWVudCgpO1xuY29uc3Qgc3NtID0gbmV3IFNTTUNsaWVudCgpO1xuXG5leHBvcnRzLmhhbmRsZXIgPSBhc3luYyAoZXZlbnQsIGNvbnRleHQpID0+IHtcbiAgY29uc29sZS5sb2coJ0V2ZW50OicsIEpTT04uc3RyaW5naWZ5KGV2ZW50LCBudWxsLCAyKSk7XG4gIFxuICBpZiAoZXZlbnQuUmVxdWVzdFR5cGUgPT09ICdEZWxldGUnKSB7XG4gICAgcmV0dXJuIHsgUGh5c2ljYWxSZXNvdXJjZUlkOiBldmVudC5QaHlzaWNhbFJlc291cmNlSWQgfHwgJ3N3ZXRlc3QtbGF5ZXInIH07XG4gIH1cbiAgXG4gIHRyeSB7XG4gICAgLy8gVXBsb2FkIHNvdXJjZSBjb2RlIHRvIFMzXG4gICAgY29uc29sZS5sb2coJ1VwbG9hZGluZyBzb3VyY2UgY29kZSB0byBTMy4uLicpO1xuICAgIGNvbnN0IHNvdXJjZVppcCA9IGF3YWl0IGNyZWF0ZVNvdXJjZVppcCgpO1xuICAgIGF3YWl0IHMzLnNlbmQobmV3IFB1dE9iamVjdENvbW1hbmQoe1xuICAgICAgQnVja2V0OiBwcm9jZXNzLmVudi5BUlRJRkFDVF9CVUNLRVQsXG4gICAgICBLZXk6ICdzb3VyY2Uvc3dldGVzdC1zcmMuemlwJyxcbiAgICAgIEJvZHk6IHNvdXJjZVppcCxcbiAgICB9KSk7XG4gICAgXG4gICAgLy8gU3RhcnQgQ29kZUJ1aWxkXG4gICAgY29uc29sZS5sb2coJ1N0YXJ0aW5nIENvZGVCdWlsZCBwcm9qZWN0Li4uJyk7XG4gICAgY29uc3QgYnVpbGRSZXNwb25zZSA9IGF3YWl0IGNvZGVidWlsZC5zZW5kKG5ldyBTdGFydEJ1aWxkQ29tbWFuZCh7XG4gICAgICBwcm9qZWN0TmFtZTogcHJvY2Vzcy5lbnYuQlVJTERfUFJPSkVDVF9OQU1FLFxuICAgIH0pKTtcbiAgICBcbiAgICBjb25zdCBidWlsZElkID0gYnVpbGRSZXNwb25zZS5idWlsZC5pZDtcbiAgICBjb25zb2xlLmxvZygnQnVpbGQgc3RhcnRlZDonLCBidWlsZElkKTtcbiAgICBcbiAgICAvLyBXYWl0IGZvciBidWlsZCB0byBjb21wbGV0ZVxuICAgIGF3YWl0IHdhaXRGb3JCdWlsZChidWlsZElkKTtcbiAgICBcbiAgICAvLyBEb3dubG9hZCBidWlsdCBsYXllciBmcm9tIFMzXG4gICAgY29uc29sZS5sb2coJ0Rvd25sb2FkaW5nIGJ1aWx0IGxheWVyLi4uJyk7XG4gICAgY29uc3QgbGF5ZXJEYXRhID0gYXdhaXQgczMuc2VuZChuZXcgR2V0T2JqZWN0Q29tbWFuZCh7XG4gICAgICBCdWNrZXQ6IHByb2Nlc3MuZW52LkFSVElGQUNUX0JVQ0tFVCxcbiAgICAgIEtleTogJ2J1aWxkL2xheWVyLnppcCcsXG4gICAgfSkpO1xuICAgIFxuICAgIGNvbnN0IGxheWVyQnVmZmVyID0gYXdhaXQgc3RyZWFtVG9CdWZmZXIobGF5ZXJEYXRhLkJvZHkpO1xuICAgIFxuICAgIC8vIFB1Ymxpc2ggTGFtYmRhIGxheWVyXG4gICAgY29uc29sZS5sb2coJ1B1Ymxpc2hpbmcgTGFtYmRhIGxheWVyLi4uJyk7XG4gICAgY29uc3QgbGF5ZXJSZXNwb25zZSA9IGF3YWl0IGxhbWJkYS5zZW5kKG5ldyBQdWJsaXNoTGF5ZXJWZXJzaW9uQ29tbWFuZCh7XG4gICAgICBMYXllck5hbWU6IFxcYGF1cmEyOC1cXCR7cHJvY2Vzcy5lbnYuRU5WSVJPTk1FTlR9LXN3ZXRlc3RcXGAsXG4gICAgICBEZXNjcmlwdGlvbjogJ1N3aXNzIEVwaGVtZXJpcyBmb3IgTm9kZS5qcyAyMC54IGJ1aWx0IG9uIEFtYXpvbiBMaW51eCAyMDIzJyxcbiAgICAgIENvbnRlbnQ6IHsgWmlwRmlsZTogbGF5ZXJCdWZmZXIgfSxcbiAgICAgIENvbXBhdGlibGVSdW50aW1lczogWydub2RlanMyMC54J10sXG4gICAgICBDb21wYXRpYmxlQXJjaGl0ZWN0dXJlczogWyd4ODZfNjQnXSxcbiAgICB9KSk7XG4gICAgXG4gICAgY29uc3QgbGF5ZXJBcm4gPSBsYXllclJlc3BvbnNlLkxheWVyVmVyc2lvbkFybjtcbiAgICBjb25zb2xlLmxvZygnTGF5ZXIgcHVibGlzaGVkOicsIGxheWVyQXJuKTtcbiAgICBcbiAgICAvLyBTdG9yZSBBUk4gaW4gU1NNIFBhcmFtZXRlciBTdG9yZVxuICAgIGNvbnNvbGUubG9nKCdTdG9yaW5nIEFSTiBpbiBTU00gUGFyYW1ldGVyIFN0b3JlLi4uJyk7XG4gICAgYXdhaXQgc3NtLnNlbmQobmV3IFB1dFBhcmFtZXRlckNvbW1hbmQoe1xuICAgICAgTmFtZTogcHJvY2Vzcy5lbnYuU1NNX1BBUkFNRVRFUl9OQU1FLFxuICAgICAgVmFsdWU6IGxheWVyQXJuLFxuICAgICAgVHlwZTogJ1N0cmluZycsXG4gICAgICBPdmVyd3JpdGU6IHRydWUsXG4gICAgICBEZXNjcmlwdGlvbjogJ1N3aXNzIEVwaGVtZXJpcyBMYW1iZGEgTGF5ZXIgQVJOIGZvciBOb2RlLmpzIDIwLngnLFxuICAgIH0pKTtcbiAgICBcbiAgICByZXR1cm4ge1xuICAgICAgUGh5c2ljYWxSZXNvdXJjZUlkOiBsYXllckFybixcbiAgICAgIERhdGE6IHsgTGF5ZXJBcm46IGxheWVyQXJuIH0sXG4gICAgfTtcbiAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICBjb25zb2xlLmVycm9yKCdFcnJvcjonLCBlcnJvcik7XG4gICAgdGhyb3cgZXJyb3I7XG4gIH1cbn07XG5cbmFzeW5jIGZ1bmN0aW9uIGNyZWF0ZVNvdXJjZVppcCgpIHtcbiAgLy8gSW4gYSByZWFsIGltcGxlbWVudGF0aW9uLCB0aGlzIHdvdWxkIHppcCB0aGUgc3dldGVzdC1zcmMgZGlyZWN0b3J5XG4gIC8vIEZvciBub3csIHJldHVybiBhIG1pbmltYWwgemlwIHdpdGggcGFja2FnZS5qc29uIGFuZCBidWlsZHNwZWMueW1sXG4gIGNvbnN0IEFkbVppcCA9IHJlcXVpcmUoJ2FkbS16aXAnKTtcbiAgY29uc3QgemlwID0gbmV3IEFkbVppcCgpO1xuICBcbiAgLy8gQWRkIHBhY2thZ2UuanNvblxuICB6aXAuYWRkRmlsZSgncGFja2FnZS5qc29uJywgQnVmZmVyLmZyb20oSlNPTi5zdHJpbmdpZnkoe1xuICAgIG5hbWU6ICdzd2V0ZXN0LWxheWVyJyxcbiAgICB2ZXJzaW9uOiAnMS4wLjAnLFxuICAgIGRlcGVuZGVuY2llczogeyBzd2lzc2VwaDogJ14wLjUuMTMnIH1cbiAgfSwgbnVsbCwgMikpKTtcbiAgXG4gIC8vIEFkZCBidWlsZHNwZWMueW1sIChjb250ZW50IGZyb20gdGhlIGFjdHVhbCBmaWxlKVxuICBjb25zdCBidWlsZHNwZWNDb250ZW50ID0gXFxgdmVyc2lvbjogMC4yXG5cbnBoYXNlczpcbiAgaW5zdGFsbDpcbiAgICBydW50aW1lLXZlcnNpb25zOlxuICAgICAgbm9kZWpzOiAyMFxuICAgIGNvbW1hbmRzOlxuICAgICAgLSB5dW0gdXBkYXRlIC15XG4gICAgICAtIHl1bSBpbnN0YWxsIC15IGdjYy1jKysgbWFrZSBweXRob24zXG4gIGJ1aWxkOlxuICAgIGNvbW1hbmRzOlxuICAgICAgLSBucG0gY2lcbiAgICAgIC0gbWtkaXIgLXAgbm9kZWpzXG4gICAgICAtIGNwIC1yIG5vZGVfbW9kdWxlcyBub2RlanMvXG4gICAgICAtIG1rZGlyIC1wIG5vZGVqcy9ub2RlX21vZHVsZXMvc3dpc3NlcGgvZXBoZVxuICAgICAgLSB8XG4gICAgICAgIGlmIFsgLWYgXCJub2RlX21vZHVsZXMvc3dpc3NlcGgvZXBoZS9zZXBsXzE4LnNlMVwiIF07IHRoZW5cbiAgICAgICAgICBjcCBub2RlX21vZHVsZXMvc3dpc3NlcGgvZXBoZS9zZXBsXzE4LnNlMSBub2RlanMvbm9kZV9tb2R1bGVzL3N3aXNzZXBoL2VwaGUvXG4gICAgICAgICAgY3Agbm9kZV9tb2R1bGVzL3N3aXNzZXBoL2VwaGUvc2Vhc18xOC5zZTEgbm9kZWpzL25vZGVfbW9kdWxlcy9zd2lzc2VwaC9lcGhlL1xuICAgICAgICAgIGNwIG5vZGVfbW9kdWxlcy9zd2lzc2VwaC9lcGhlL3NlbW9fMTguc2UxIG5vZGVqcy9ub2RlX21vZHVsZXMvc3dpc3NlcGgvZXBoZS9cbiAgICAgICAgZmlcbiAgICAgIC0gemlwIC1ycSBsYXllci56aXAgbm9kZWpzL1xuYXJ0aWZhY3RzOlxuICBmaWxlczpcbiAgICAtIGxheWVyLnppcFxuXFxgO1xuICBcbiAgemlwLmFkZEZpbGUoJ2J1aWxkc3BlYy55bWwnLCBCdWZmZXIuZnJvbShidWlsZHNwZWNDb250ZW50KSk7XG4gIHJldHVybiB6aXAudG9CdWZmZXIoKTtcbn1cblxuYXN5bmMgZnVuY3Rpb24gd2FpdEZvckJ1aWxkKGJ1aWxkSWQpIHtcbiAgY29uc3QgeyBDb2RlQnVpbGRDbGllbnQsIEJhdGNoR2V0QnVpbGRzQ29tbWFuZCB9ID0gcmVxdWlyZSgnQGF3cy1zZGsvY2xpZW50LWNvZGVidWlsZCcpO1xuICBjb25zdCBjb2RlYnVpbGQgPSBuZXcgQ29kZUJ1aWxkQ2xpZW50KCk7XG4gIFxuICBsZXQgc3RhdHVzID0gJ0lOX1BST0dSRVNTJztcbiAgd2hpbGUgKHN0YXR1cyA9PT0gJ0lOX1BST0dSRVNTJykge1xuICAgIGF3YWl0IG5ldyBQcm9taXNlKHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCAxMDAwMCkpOyAvLyBXYWl0IDEwIHNlY29uZHNcbiAgICBcbiAgICBjb25zdCByZXNwb25zZSA9IGF3YWl0IGNvZGVidWlsZC5zZW5kKG5ldyBCYXRjaEdldEJ1aWxkc0NvbW1hbmQoe1xuICAgICAgaWRzOiBbYnVpbGRJZF0sXG4gICAgfSkpO1xuICAgIFxuICAgIHN0YXR1cyA9IHJlc3BvbnNlLmJ1aWxkc1swXS5idWlsZFN0YXR1cztcbiAgICBjb25zb2xlLmxvZygnQnVpbGQgc3RhdHVzOicsIHN0YXR1cyk7XG4gIH1cbiAgXG4gIGlmIChzdGF0dXMgIT09ICdTVUNDRUVERUQnKSB7XG4gICAgdGhyb3cgbmV3IEVycm9yKFxcYEJ1aWxkIGZhaWxlZCB3aXRoIHN0YXR1czogXFwke3N0YXR1c31cXGApO1xuICB9XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHN0cmVhbVRvQnVmZmVyKHN0cmVhbSkge1xuICBjb25zdCBjaHVua3MgPSBbXTtcbiAgZm9yIGF3YWl0IChjb25zdCBjaHVuayBvZiBzdHJlYW0pIHtcbiAgICBjaHVua3MucHVzaChjaHVuayk7XG4gIH1cbiAgcmV0dXJuIEJ1ZmZlci5jb25jYXQoY2h1bmtzKTtcbn1cbiAgICAgIGApLFxuICAgICAgbG9nUmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX1dFRUssXG4gICAgfSk7XG5cbiAgICAvLyBHcmFudCBwZXJtaXNzaW9uc1xuICAgIGFydGlmYWN0QnVja2V0LmdyYW50UmVhZFdyaXRlKG9yY2hlc3RyYXRvckZ1bmN0aW9uKTtcbiAgICBhcnRpZmFjdEJ1Y2tldC5ncmFudFJlYWRXcml0ZShidWlsZFByb2plY3QpO1xuXG4gICAgb3JjaGVzdHJhdG9yRnVuY3Rpb24uYWRkVG9Sb2xlUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBhY3Rpb25zOiBbJ2NvZGVidWlsZDpTdGFydEJ1aWxkJywgJ2NvZGVidWlsZDpCYXRjaEdldEJ1aWxkcyddLFxuICAgICAgICByZXNvdXJjZXM6IFtidWlsZFByb2plY3QucHJvamVjdEFybl0sXG4gICAgICB9KSxcbiAgICApO1xuXG4gICAgb3JjaGVzdHJhdG9yRnVuY3Rpb24uYWRkVG9Sb2xlUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBhY3Rpb25zOiBbJ2xhbWJkYTpQdWJsaXNoTGF5ZXJWZXJzaW9uJ10sXG4gICAgICAgIHJlc291cmNlczogWycqJ10sXG4gICAgICB9KSxcbiAgICApO1xuXG4gICAgb3JjaGVzdHJhdG9yRnVuY3Rpb24uYWRkVG9Sb2xlUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBhY3Rpb25zOiBbJ3NzbTpQdXRQYXJhbWV0ZXInXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbXG4gICAgICAgICAgYGFybjphd3M6c3NtOiR7Y2RrLlN0YWNrLm9mKHRoaXMpLnJlZ2lvbn06JHtjZGsuU3RhY2sub2YodGhpcykuYWNjb3VudH06cGFyYW1ldGVyJHt0aGlzLnNzbVBhcmFtZXRlck5hbWV9YCxcbiAgICAgICAgXSxcbiAgICAgIH0pLFxuICAgICk7XG5cbiAgICAvLyBDdXN0b20gcmVzb3VyY2UgdG8gdHJpZ2dlciB0aGUgYnVpbGRcbiAgICBjb25zdCBwcm92aWRlciA9IG5ldyBjci5Qcm92aWRlcih0aGlzLCAnTGF5ZXJCdWlsZFByb3ZpZGVyJywge1xuICAgICAgb25FdmVudEhhbmRsZXI6IG9yY2hlc3RyYXRvckZ1bmN0aW9uLFxuICAgICAgbG9nUmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX1dFRUssXG4gICAgfSk7XG5cbiAgICBjb25zdCBjdXN0b21SZXNvdXJjZSA9IG5ldyBjZGsuQ3VzdG9tUmVzb3VyY2UodGhpcywgJ0xheWVyQnVpbGRSZXNvdXJjZScsIHtcbiAgICAgIHNlcnZpY2VUb2tlbjogcHJvdmlkZXIuc2VydmljZVRva2VuLFxuICAgICAgcHJvcGVydGllczoge1xuICAgICAgICBUaW1lc3RhbXA6IERhdGUubm93KCksIC8vIEZvcmNlIHVwZGF0ZSBvbiBlYWNoIGRlcGxveW1lbnRcbiAgICAgICAgRW52aXJvbm1lbnQ6IHByb3BzLmVudmlyb25tZW50LFxuICAgICAgfSxcbiAgICB9KTtcblxuICAgIHRoaXMubGF5ZXJWZXJzaW9uQXJuID0gY3VzdG9tUmVzb3VyY2UuZ2V0QXR0U3RyaW5nKCdMYXllckFybicpO1xuXG4gICAgLy8gT3V0cHV0IHRoZSBsYXllciBBUk5cbiAgICBuZXcgY2RrLkNmbk91dHB1dCh0aGlzLCAnU3dldGVzdExheWVyQXJuJywge1xuICAgICAgdmFsdWU6IHRoaXMubGF5ZXJWZXJzaW9uQXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdTd2lzcyBFcGhlbWVyaXMgTGFtYmRhIExheWVyIEFSTicsXG4gICAgICBleHBvcnROYW1lOiBgQXVyYTI4LSR7cHJvcHMuZW52aXJvbm1lbnR9LVN3ZXRlc3RMYXllckFybmAsXG4gICAgfSk7XG5cbiAgICAvLyBDcmVhdGUgRWluc3RlaW4gY2FuYXJ5IHRlc3QgTGFtYmRhXG4gICAgY29uc3QgY2FuYXJ5RnVuY3Rpb24gPSBuZXcgbGFtYmRhTm9kZUpzLk5vZGVqc0Z1bmN0aW9uKHRoaXMsICdFaW5zdGVpbkNhbmFyeUZ1bmN0aW9uJywge1xuICAgICAgZnVuY3Rpb25OYW1lOiBgYXVyYTI4LSR7cHJvcHMuZW52aXJvbm1lbnR9LXN3ZXRlc3QtY2FuYXJ5YCxcbiAgICAgIGVudHJ5OiBwYXRoLmpvaW4oX19kaXJuYW1lLCAnLi4vLi4vbGFtYmRhL3N3ZXRlc3QtY2FuYXJ5L2VpbnN0ZWluLWNhbmFyeS50cycpLFxuICAgICAgaGFuZGxlcjogJ2hhbmRsZXInLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIwX1gsXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24uc2Vjb25kcygzMCksXG4gICAgICBtZW1vcnlTaXplOiAyNTYsXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBFTlZJUk9OTUVOVDogcHJvcHMuZW52aXJvbm1lbnQsXG4gICAgICB9LFxuICAgICAgYnVuZGxpbmc6IHtcbiAgICAgICAgZXh0ZXJuYWxNb2R1bGVzOiBbJ0Bhd3Mtc2RrLyonLCAnc3dpc3NlcGgnXSxcbiAgICAgICAgZm9yY2VEb2NrZXJCdW5kbGluZzogZmFsc2UsXG4gICAgICB9LFxuICAgICAgbGF5ZXJzOiBbXG4gICAgICAgIGxhbWJkYS5MYXllclZlcnNpb24uZnJvbUxheWVyVmVyc2lvbkFybihcbiAgICAgICAgICB0aGlzLFxuICAgICAgICAgICdDYW5hcnlTd2lzc0VwaGVtZXJpc0xheWVyJyxcbiAgICAgICAgICBzc20uU3RyaW5nUGFyYW1ldGVyLnZhbHVlRm9yU3RyaW5nUGFyYW1ldGVyKHRoaXMsIHRoaXMuc3NtUGFyYW1ldGVyTmFtZSksXG4gICAgICAgICksXG4gICAgICBdLFxuICAgICAgbG9nUmV0ZW50aW9uOiBsb2dzLlJldGVudGlvbkRheXMuT05FX1dFRUssXG4gICAgfSk7XG5cbiAgICAvLyBHcmFudCBDbG91ZFdhdGNoIG1ldHJpY3MgcGVybWlzc2lvbnNcbiAgICBjYW5hcnlGdW5jdGlvbi5hZGRUb1JvbGVQb2xpY3koXG4gICAgICBuZXcgaWFtLlBvbGljeVN0YXRlbWVudCh7XG4gICAgICAgIGFjdGlvbnM6IFsnY2xvdWR3YXRjaDpQdXRNZXRyaWNEYXRhJ10sXG4gICAgICAgIHJlc291cmNlczogWycqJ10sXG4gICAgICB9KSxcbiAgICApO1xuXG4gICAgLy8gU2NoZWR1bGUgY2FuYXJ5IHRvIHJ1biBkYWlseVxuICAgIGNvbnN0IGNhbmFyeVNjaGVkdWxlID0gbmV3IGV2ZW50cy5SdWxlKHRoaXMsICdDYW5hcnlTY2hlZHVsZScsIHtcbiAgICAgIHJ1bGVOYW1lOiBgYXVyYTI4LSR7cHJvcHMuZW52aXJvbm1lbnR9LXN3ZXRlc3QtY2FuYXJ5LXNjaGVkdWxlYCxcbiAgICAgIGRlc2NyaXB0aW9uOiAnRGFpbHkgU3dpc3MgRXBoZW1lcmlzIGxheWVyIHZhbGlkYXRpb24nLFxuICAgICAgc2NoZWR1bGU6IGV2ZW50cy5TY2hlZHVsZS5yYXRlKGNkay5EdXJhdGlvbi5kYXlzKDEpKSxcbiAgICB9KTtcblxuICAgIGNhbmFyeVNjaGVkdWxlLmFkZFRhcmdldChuZXcgdGFyZ2V0cy5MYW1iZGFGdW5jdGlvbihjYW5hcnlGdW5jdGlvbikpO1xuXG4gICAgLy8gQ3JlYXRlIENsb3VkV2F0Y2ggYWxhcm0gZm9yIGNhbmFyeSBmYWlsdXJlc1xuICAgIG5ldyBjbG91ZHdhdGNoLkFsYXJtKHRoaXMsICdDYW5hcnlBbGFybScsIHtcbiAgICAgIGFsYXJtTmFtZTogYGF1cmEyOC0ke3Byb3BzLmVudmlyb25tZW50fS1zd2V0ZXN0LWNhbmFyeS1mYWlsdXJlYCxcbiAgICAgIGFsYXJtRGVzY3JpcHRpb246ICdTd2lzcyBFcGhlbWVyaXMgbGF5ZXIgY2FuYXJ5IHRlc3QgZmFpbHVyZScsXG4gICAgICBtZXRyaWM6IG5ldyBjbG91ZHdhdGNoLk1ldHJpYyh7XG4gICAgICAgIG5hbWVzcGFjZTogJ0F1cmEyOC9DYW5hcnknLFxuICAgICAgICBtZXRyaWNOYW1lOiAnU3dpc3NFcGhlbWVyaXNMYXllckhlYWx0aCcsXG4gICAgICAgIGRpbWVuc2lvbnNNYXA6IHtcbiAgICAgICAgICBFbnZpcm9ubWVudDogcHJvcHMuZW52aXJvbm1lbnQsXG4gICAgICAgICAgVGVzdDogJ0VpbnN0ZWluJyxcbiAgICAgICAgfSxcbiAgICAgICAgc3RhdGlzdGljOiAnQXZlcmFnZScsXG4gICAgICAgIHBlcmlvZDogY2RrLkR1cmF0aW9uLmRheXMoMSksXG4gICAgICB9KSxcbiAgICAgIHRocmVzaG9sZDogMSxcbiAgICAgIGNvbXBhcmlzb25PcGVyYXRvcjogY2xvdWR3YXRjaC5Db21wYXJpc29uT3BlcmF0b3IuTEVTU19USEFOX1RIUkVTSE9MRCxcbiAgICAgIGV2YWx1YXRpb25QZXJpb2RzOiAxLFxuICAgICAgdHJlYXRNaXNzaW5nRGF0YTogY2xvdWR3YXRjaC5UcmVhdE1pc3NpbmdEYXRhLkJSRUFDSElORyxcbiAgICB9KTtcblxuICAgIC8vIE91dHB1dCBjYW5hcnkgZnVuY3Rpb24gQVJOXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ0NhbmFyeUZ1bmN0aW9uQXJuJywge1xuICAgICAgdmFsdWU6IGNhbmFyeUZ1bmN0aW9uLmZ1bmN0aW9uQXJuLFxuICAgICAgZGVzY3JpcHRpb246ICdFaW5zdGVpbiBDYW5hcnkgVGVzdCBGdW5jdGlvbiBBUk4nLFxuICAgIH0pO1xuICB9XG59XG4iXX0=