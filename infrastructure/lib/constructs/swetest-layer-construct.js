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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoic3dldGVzdC1sYXllci1jb25zdHJ1Y3QuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJzd2V0ZXN0LWxheWVyLWNvbnN0cnVjdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7OztBQUFBLGlEQUFtQztBQUNuQyxxRUFBdUQ7QUFDdkQsK0RBQWlEO0FBQ2pELHVEQUF5QztBQUN6Qyx5REFBMkM7QUFDM0MsaUVBQW1EO0FBQ25ELDJEQUE2QztBQUM3QywrREFBaUQ7QUFDakQsd0VBQTBEO0FBQzFELHVFQUF5RDtBQUN6RCw0RUFBOEQ7QUFDOUQsMkNBQXVDO0FBQ3ZDLDJDQUE2QjtBQU83QixNQUFhLHFCQUFzQixTQUFRLHNCQUFTO0lBQ2xDLGVBQWUsQ0FBUztJQUN2QixnQkFBZ0IsQ0FBUztJQUUxQyxZQUFZLEtBQWdCLEVBQUUsRUFBVSxFQUFFLEtBQWlDO1FBQ3pFLEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxDQUFDLENBQUM7UUFFakIseURBQXlEO1FBQ3pELEtBQUssQ0FBQyxlQUFlLEVBQUUsT0FBTyxDQUFDLENBQUMsRUFBRSxFQUFFLEVBQUU7WUFDcEMsTUFBTSxlQUFlLEdBQUksRUFBbUMsQ0FBQyxPQUFPLENBQUM7WUFDckUsSUFBSSxlQUFlLElBQUksZUFBZSxLQUFLLE1BQU0sQ0FBQyxPQUFPLENBQUMsV0FBVyxFQUFFLENBQUM7Z0JBQ3RFLE1BQU0sSUFBSSxLQUFLLENBQ2IsbUJBQW1CLEVBQUUsQ0FBQyxZQUFZLFNBQVMsZUFBZSxDQUFDLElBQUksbUVBQW1FLENBQ25JLENBQUM7WUFDSixDQUFDO1FBQ0gsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsZ0JBQWdCLEdBQUcsV0FBVyxLQUFLLENBQUMsV0FBVyxxQkFBcUIsQ0FBQztRQUUxRSxnQ0FBZ0M7UUFDaEMsTUFBTSxjQUFjLEdBQUcsSUFBSSxFQUFFLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxnQkFBZ0IsRUFBRTtZQUMzRCxVQUFVLEVBQUUsVUFBVSxLQUFLLENBQUMsV0FBVywwQkFBMEI7WUFDakUsYUFBYSxFQUNYLEtBQUssQ0FBQyxXQUFXLEtBQUssTUFBTSxDQUFDLENBQUMsQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUMsR0FBRyxDQUFDLGFBQWEsQ0FBQyxPQUFPO1lBQ3JGLGlCQUFpQixFQUFFLEtBQUssQ0FBQyxXQUFXLEtBQUssTUFBTTtZQUMvQyxjQUFjLEVBQUU7Z0JBQ2Q7b0JBQ0UsRUFBRSxFQUFFLHNCQUFzQjtvQkFDMUIsT0FBTyxFQUFFLElBQUk7b0JBQ2IsVUFBVSxFQUFFLEdBQUcsQ0FBQyxRQUFRLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQztpQkFDbEM7YUFDRjtTQUNGLENBQUMsQ0FBQztRQUVILDJDQUEyQztRQUMzQyxNQUFNLFlBQVksR0FBRyxJQUFJLFNBQVMsQ0FBQyxPQUFPLENBQUMsSUFBSSxFQUFFLG1CQUFtQixFQUFFO1lBQ3BFLFdBQVcsRUFBRSxVQUFVLEtBQUssQ0FBQyxXQUFXLHNCQUFzQjtZQUM5RCxXQUFXLEVBQUUsMkVBQTJFO1lBQ3hGLE1BQU0sRUFBRSxTQUFTLENBQUMsTUFBTSxDQUFDLEVBQUUsQ0FBQztnQkFDMUIsTUFBTSxFQUFFLGNBQWM7Z0JBQ3RCLElBQUksRUFBRSx3QkFBd0I7YUFDL0IsQ0FBQztZQUNGLFdBQVcsRUFBRTtnQkFDWCxVQUFVLEVBQUUsU0FBUyxDQUFDLGVBQWUsQ0FBQyxnQkFBZ0I7Z0JBQ3RELFdBQVcsRUFBRSxTQUFTLENBQUMsV0FBVyxDQUFDLEtBQUs7Z0JBQ3hDLFVBQVUsRUFBRSxLQUFLO2FBQ2xCO1lBQ0QsU0FBUyxFQUFFLFNBQVMsQ0FBQyxTQUFTLENBQUMsRUFBRSxDQUFDO2dCQUNoQyxNQUFNLEVBQUUsY0FBYztnQkFDdEIsSUFBSSxFQUFFLE9BQU87Z0JBQ2IsSUFBSSxFQUFFLFdBQVc7Z0JBQ2pCLFVBQVUsRUFBRSxLQUFLO2FBQ2xCLENBQUM7WUFDRixPQUFPLEVBQUUsR0FBRyxDQUFDLFFBQVEsQ0FBQyxPQUFPLENBQUMsRUFBRSxDQUFDO1lBQ2pDLEtBQUssRUFBRSxTQUFTLENBQUMsS0FBSyxDQUFDLEtBQUssQ0FBQyxTQUFTLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQztTQUM5RCxDQUFDLENBQUM7UUFFSCxtREFBbUQ7UUFDbkQsTUFBTSxvQkFBb0IsR0FBRyxJQUFJLE1BQU0sQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLHNCQUFzQixFQUFFO1lBQzdFLFlBQVksRUFBRSxVQUFVLEtBQUssQ0FBQyxXQUFXLDZCQUE2QjtZQUN0RSxPQUFPLEVBQUUsTUFBTSxDQUFDLE9BQU8sQ0FBQyxXQUFXO1lBQ25DLE9BQU8sRUFBRSxlQUFlO1lBQ3hCLE9BQU8sRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7WUFDakMsVUFBVSxFQUFFLEdBQUc7WUFDZixXQUFXLEVBQUU7Z0JBQ1gsa0JBQWtCLEVBQUUsWUFBWSxDQUFDLFdBQVc7Z0JBQzVDLGVBQWUsRUFBRSxjQUFjLENBQUMsVUFBVTtnQkFDMUMsa0JBQWtCLEVBQUUsSUFBSSxDQUFDLGdCQUFnQjtnQkFDekMsV0FBVyxFQUFFLEtBQUssQ0FBQyxXQUFXO2FBQy9CO1lBQ0QsSUFBSSxFQUFFLE1BQU0sQ0FBQyxJQUFJLENBQUMsVUFBVSxDQUFDOzs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7Ozs7T0ErSjVCLENBQUM7WUFDRixZQUFZLEVBQUUsSUFBSSxDQUFDLGFBQWEsQ0FBQyxRQUFRO1NBQzFDLENBQUMsQ0FBQztRQUVILG9CQUFvQjtRQUNwQixjQUFjLENBQUMsY0FBYyxDQUFDLG9CQUFvQixDQUFDLENBQUM7UUFDcEQsY0FBYyxDQUFDLGNBQWMsQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUU1QyxvQkFBb0IsQ0FBQyxlQUFlLENBQ2xDLElBQUksR0FBRyxDQUFDLGVBQWUsQ0FBQztZQUN0QixPQUFPLEVBQUUsQ0FBQyxzQkFBc0IsRUFBRSwwQkFBMEIsQ0FBQztZQUM3RCxTQUFTLEVBQUUsQ0FBQyxZQUFZLENBQUMsVUFBVSxDQUFDO1NBQ3JDLENBQUMsQ0FDSCxDQUFDO1FBRUYsb0JBQW9CLENBQUMsZUFBZSxDQUNsQyxJQUFJLEdBQUcsQ0FBQyxlQUFlLENBQUM7WUFDdEIsT0FBTyxFQUFFLENBQUMsNEJBQTRCLENBQUM7WUFDdkMsU0FBUyxFQUFFLENBQUMsR0FBRyxDQUFDO1NBQ2pCLENBQUMsQ0FDSCxDQUFDO1FBRUYsb0JBQW9CLENBQUMsZUFBZSxDQUNsQyxJQUFJLEdBQUcsQ0FBQyxlQUFlLENBQUM7WUFDdEIsT0FBTyxFQUFFLENBQUMsa0JBQWtCLENBQUM7WUFDN0IsU0FBUyxFQUFFO2dCQUNULGVBQWUsR0FBRyxDQUFDLEtBQUssQ0FBQyxFQUFFLENBQUMsSUFBSSxDQUFDLENBQUMsTUFBTSxJQUFJLEdBQUcsQ0FBQyxLQUFLLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxDQUFDLE9BQU8sYUFBYSxJQUFJLENBQUMsZ0JBQWdCLEVBQUU7YUFDM0c7U0FDRixDQUFDLENBQ0gsQ0FBQztRQUVGLHVDQUF1QztRQUN2QyxNQUFNLFFBQVEsR0FBRyxJQUFJLEVBQUUsQ0FBQyxRQUFRLENBQUMsSUFBSSxFQUFFLG9CQUFvQixFQUFFO1lBQzNELGNBQWMsRUFBRSxvQkFBb0I7WUFDcEMsWUFBWSxFQUFFLElBQUksQ0FBQyxhQUFhLENBQUMsUUFBUTtTQUMxQyxDQUFDLENBQUM7UUFFSCxNQUFNLGNBQWMsR0FBRyxJQUFJLEdBQUcsQ0FBQyxjQUFjLENBQUMsSUFBSSxFQUFFLG9CQUFvQixFQUFFO1lBQ3hFLFlBQVksRUFBRSxRQUFRLENBQUMsWUFBWTtZQUNuQyxVQUFVLEVBQUU7Z0JBQ1YsU0FBUyxFQUFFLElBQUksQ0FBQyxHQUFHLEVBQUUsRUFBRSxrQ0FBa0M7Z0JBQ3pELFdBQVcsRUFBRSxLQUFLLENBQUMsV0FBVzthQUMvQjtTQUNGLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxlQUFlLEdBQUcsY0FBYyxDQUFDLFlBQVksQ0FBQyxVQUFVLENBQUMsQ0FBQztRQUUvRCx1QkFBdUI7UUFDdkIsSUFBSSxHQUFHLENBQUMsU0FBUyxDQUFDLElBQUksRUFBRSxpQkFBaUIsRUFBRTtZQUN6QyxLQUFLLEVBQUUsSUFBSSxDQUFDLGVBQWU7WUFDM0IsV0FBVyxFQUFFLGtDQUFrQztZQUMvQyxVQUFVLEVBQUUsVUFBVSxLQUFLLENBQUMsV0FBVyxrQkFBa0I7U0FDMUQsQ0FBQyxDQUFDO1FBRUgscUNBQXFDO1FBQ3JDLE1BQU0sY0FBYyxHQUFHLElBQUksWUFBWSxDQUFDLGNBQWMsQ0FBQyxJQUFJLEVBQUUsd0JBQXdCLEVBQUU7WUFDckYsWUFBWSxFQUFFLFVBQVUsS0FBSyxDQUFDLFdBQVcsaUJBQWlCO1lBQzFELEtBQUssRUFBRSxJQUFJLENBQUMsSUFBSSxDQUFDLFNBQVMsRUFBRSxnREFBZ0QsQ0FBQztZQUM3RSxPQUFPLEVBQUUsU0FBUztZQUNsQixPQUFPLEVBQUUsTUFBTSxDQUFDLE9BQU8sQ0FBQyxXQUFXO1lBQ25DLE9BQU8sRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLE9BQU8sQ0FBQyxFQUFFLENBQUM7WUFDakMsVUFBVSxFQUFFLEdBQUc7WUFDZixXQUFXLEVBQUU7Z0JBQ1gsV0FBVyxFQUFFLEtBQUssQ0FBQyxXQUFXO2FBQy9CO1lBQ0QsUUFBUSxFQUFFO2dCQUNSLGVBQWUsRUFBRSxDQUFDLFlBQVksRUFBRSxVQUFVLENBQUM7Z0JBQzNDLG1CQUFtQixFQUFFLEtBQUs7YUFDM0I7WUFDRCxNQUFNLEVBQUU7Z0JBQ04sTUFBTSxDQUFDLFlBQVksQ0FBQyxtQkFBbUIsQ0FDckMsSUFBSSxFQUNKLDJCQUEyQixFQUMzQixJQUFJLENBQUMsZUFBZSxDQUNyQjthQUNGO1lBQ0QsWUFBWSxFQUFFLElBQUksQ0FBQyxhQUFhLENBQUMsUUFBUTtTQUMxQyxDQUFDLENBQUM7UUFFSCx1Q0FBdUM7UUFDdkMsY0FBYyxDQUFDLGVBQWUsQ0FDNUIsSUFBSSxHQUFHLENBQUMsZUFBZSxDQUFDO1lBQ3RCLE9BQU8sRUFBRSxDQUFDLDBCQUEwQixDQUFDO1lBQ3JDLFNBQVMsRUFBRSxDQUFDLEdBQUcsQ0FBQztTQUNqQixDQUFDLENBQ0gsQ0FBQztRQUVGLCtCQUErQjtRQUMvQixNQUFNLGNBQWMsR0FBRyxJQUFJLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxFQUFFLGdCQUFnQixFQUFFO1lBQzdELFFBQVEsRUFBRSxVQUFVLEtBQUssQ0FBQyxXQUFXLDBCQUEwQjtZQUMvRCxXQUFXLEVBQUUsd0NBQXdDO1lBQ3JELFFBQVEsRUFBRSxNQUFNLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxHQUFHLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztTQUNyRCxDQUFDLENBQUM7UUFFSCxjQUFjLENBQUMsU0FBUyxDQUFDLElBQUksT0FBTyxDQUFDLGNBQWMsQ0FBQyxjQUFjLENBQUMsQ0FBQyxDQUFDO1FBRXJFLDhDQUE4QztRQUM5QyxJQUFJLFVBQVUsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLGFBQWEsRUFBRTtZQUN4QyxTQUFTLEVBQUUsVUFBVSxLQUFLLENBQUMsV0FBVyx5QkFBeUI7WUFDL0QsZ0JBQWdCLEVBQUUsMkNBQTJDO1lBQzdELE1BQU0sRUFBRSxJQUFJLFVBQVUsQ0FBQyxNQUFNLENBQUM7Z0JBQzVCLFNBQVMsRUFBRSxlQUFlO2dCQUMxQixVQUFVLEVBQUUsMkJBQTJCO2dCQUN2QyxhQUFhLEVBQUU7b0JBQ2IsV0FBVyxFQUFFLEtBQUssQ0FBQyxXQUFXO29CQUM5QixJQUFJLEVBQUUsVUFBVTtpQkFDakI7Z0JBQ0QsU0FBUyxFQUFFLFNBQVM7Z0JBQ3BCLE1BQU0sRUFBRSxHQUFHLENBQUMsUUFBUSxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUM7YUFDN0IsQ0FBQztZQUNGLFNBQVMsRUFBRSxDQUFDO1lBQ1osa0JBQWtCLEVBQUUsVUFBVSxDQUFDLGtCQUFrQixDQUFDLG1CQUFtQjtZQUNyRSxpQkFBaUIsRUFBRSxDQUFDO1lBQ3BCLGdCQUFnQixFQUFFLFVBQVUsQ0FBQyxnQkFBZ0IsQ0FBQyxTQUFTO1NBQ3hELENBQUMsQ0FBQztRQUVILDZCQUE2QjtRQUM3QixJQUFJLEdBQUcsQ0FBQyxTQUFTLENBQUMsSUFBSSxFQUFFLG1CQUFtQixFQUFFO1lBQzNDLEtBQUssRUFBRSxjQUFjLENBQUMsV0FBVztZQUNqQyxXQUFXLEVBQUUsbUNBQW1DO1NBQ2pELENBQUMsQ0FBQztJQUNMLENBQUM7Q0FDRjtBQS9WRCxzREErVkMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgKiBhcyBjZGsgZnJvbSAnYXdzLWNkay1saWInO1xuaW1wb3J0ICogYXMgY29kZWJ1aWxkIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jb2RlYnVpbGQnO1xuaW1wb3J0ICogYXMgbGFtYmRhIGZyb20gJ2F3cy1jZGstbGliL2F3cy1sYW1iZGEnO1xuaW1wb3J0ICogYXMgczMgZnJvbSAnYXdzLWNkay1saWIvYXdzLXMzJztcbmltcG9ydCAqIGFzIGlhbSBmcm9tICdhd3MtY2RrLWxpYi9hd3MtaWFtJztcbmltcG9ydCAqIGFzIGNyIGZyb20gJ2F3cy1jZGstbGliL2N1c3RvbS1yZXNvdXJjZXMnO1xuaW1wb3J0ICogYXMgbG9ncyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbG9ncyc7XG5pbXBvcnQgKiBhcyBldmVudHMgZnJvbSAnYXdzLWNkay1saWIvYXdzLWV2ZW50cyc7XG5pbXBvcnQgKiBhcyB0YXJnZXRzIGZyb20gJ2F3cy1jZGstbGliL2F3cy1ldmVudHMtdGFyZ2V0cyc7XG5pbXBvcnQgKiBhcyBjbG91ZHdhdGNoIGZyb20gJ2F3cy1jZGstbGliL2F3cy1jbG91ZHdhdGNoJztcbmltcG9ydCAqIGFzIGxhbWJkYU5vZGVKcyBmcm9tICdhd3MtY2RrLWxpYi9hd3MtbGFtYmRhLW5vZGVqcyc7XG5pbXBvcnQgeyBDb25zdHJ1Y3QgfSBmcm9tICdjb25zdHJ1Y3RzJztcbmltcG9ydCAqIGFzIHBhdGggZnJvbSAncGF0aCc7XG5cbmV4cG9ydCBpbnRlcmZhY2UgU3dldGVzdExheWVyQ29uc3RydWN0UHJvcHMge1xuICBlbnZpcm9ubWVudDogJ2RldicgfCAncHJvZCc7XG4gIGxhbWJkYUZ1bmN0aW9ucz86IGxhbWJkYS5GdW5jdGlvbltdO1xufVxuXG5leHBvcnQgY2xhc3MgU3dldGVzdExheWVyQ29uc3RydWN0IGV4dGVuZHMgQ29uc3RydWN0IHtcbiAgcHVibGljIHJlYWRvbmx5IGxheWVyVmVyc2lvbkFybjogc3RyaW5nO1xuICBwcml2YXRlIHJlYWRvbmx5IHNzbVBhcmFtZXRlck5hbWU6IHN0cmluZztcblxuICBjb25zdHJ1Y3RvcihzY29wZTogQ29uc3RydWN0LCBpZDogc3RyaW5nLCBwcm9wczogU3dldGVzdExheWVyQ29uc3RydWN0UHJvcHMpIHtcbiAgICBzdXBlcihzY29wZSwgaWQpO1xuXG4gICAgLy8gUnVudGltZSBjb25zaXN0ZW5jeSBndWFyZHJhaWwgLSB2YWxpZGF0ZSBhdCBzeW50aCB0aW1lXG4gICAgcHJvcHMubGFtYmRhRnVuY3Rpb25zPy5mb3JFYWNoKChmbikgPT4ge1xuICAgICAgY29uc3QgZnVuY3Rpb25SdW50aW1lID0gKGZuIGFzIHsgcnVudGltZT86IGxhbWJkYS5SdW50aW1lIH0pLnJ1bnRpbWU7XG4gICAgICBpZiAoZnVuY3Rpb25SdW50aW1lICYmIGZ1bmN0aW9uUnVudGltZSAhPT0gbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIwX1gpIHtcbiAgICAgICAgdGhyb3cgbmV3IEVycm9yKFxuICAgICAgICAgIGBMYW1iZGEgZnVuY3Rpb24gJHtmbi5mdW5jdGlvbk5hbWV9IHVzZXMgJHtmdW5jdGlvblJ1bnRpbWUubmFtZX0gYnV0IG11c3QgdXNlIE5PREVKU18yMF9YIGZvciBTd2lzcyBFcGhlbWVyaXMgbGF5ZXIgY29tcGF0aWJpbGl0eWAsXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICB0aGlzLnNzbVBhcmFtZXRlck5hbWUgPSBgL2F1cmEyOC8ke3Byb3BzLmVudmlyb25tZW50fS9sYXllcnMvc3dldGVzdC1hcm5gO1xuXG4gICAgLy8gUzMgYnVja2V0IGZvciBidWlsZCBhcnRpZmFjdHNcbiAgICBjb25zdCBhcnRpZmFjdEJ1Y2tldCA9IG5ldyBzMy5CdWNrZXQodGhpcywgJ0FydGlmYWN0QnVja2V0Jywge1xuICAgICAgYnVja2V0TmFtZTogYGF1cmEyOC0ke3Byb3BzLmVudmlyb25tZW50fS1zd2V0ZXN0LWxheWVyLWFydGlmYWN0c2AsXG4gICAgICByZW1vdmFsUG9saWN5OlxuICAgICAgICBwcm9wcy5lbnZpcm9ubWVudCA9PT0gJ3Byb2QnID8gY2RrLlJlbW92YWxQb2xpY3kuUkVUQUlOIDogY2RrLlJlbW92YWxQb2xpY3kuREVTVFJPWSxcbiAgICAgIGF1dG9EZWxldGVPYmplY3RzOiBwcm9wcy5lbnZpcm9ubWVudCAhPT0gJ3Byb2QnLFxuICAgICAgbGlmZWN5Y2xlUnVsZXM6IFtcbiAgICAgICAge1xuICAgICAgICAgIGlkOiAnZGVsZXRlLW9sZC1hcnRpZmFjdHMnLFxuICAgICAgICAgIGVuYWJsZWQ6IHRydWUsXG4gICAgICAgICAgZXhwaXJhdGlvbjogY2RrLkR1cmF0aW9uLmRheXMoMzApLFxuICAgICAgICB9LFxuICAgICAgXSxcbiAgICB9KTtcblxuICAgIC8vIENvZGVCdWlsZCBwcm9qZWN0IGZvciBidWlsZGluZyB0aGUgbGF5ZXJcbiAgICBjb25zdCBidWlsZFByb2plY3QgPSBuZXcgY29kZWJ1aWxkLlByb2plY3QodGhpcywgJ0xheWVyQnVpbGRQcm9qZWN0Jywge1xuICAgICAgcHJvamVjdE5hbWU6IGBhdXJhMjgtJHtwcm9wcy5lbnZpcm9ubWVudH0tc3dldGVzdC1sYXllci1idWlsZGAsXG4gICAgICBkZXNjcmlwdGlvbjogJ0J1aWxkcyBTd2lzcyBFcGhlbWVyaXMgTGFtYmRhIGxheWVyIGZvciBOb2RlLmpzIDIwLnggb24gQW1hem9uIExpbnV4IDIwMjMnLFxuICAgICAgc291cmNlOiBjb2RlYnVpbGQuU291cmNlLnMzKHtcbiAgICAgICAgYnVja2V0OiBhcnRpZmFjdEJ1Y2tldCxcbiAgICAgICAgcGF0aDogJ3NvdXJjZS9zd2V0ZXN0LXNyYy56aXAnLFxuICAgICAgfSksXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBidWlsZEltYWdlOiBjb2RlYnVpbGQuTGludXhCdWlsZEltYWdlLkFNQVpPTl9MSU5VWF8yXzUsXG4gICAgICAgIGNvbXB1dGVUeXBlOiBjb2RlYnVpbGQuQ29tcHV0ZVR5cGUuU01BTEwsXG4gICAgICAgIHByaXZpbGVnZWQ6IGZhbHNlLFxuICAgICAgfSxcbiAgICAgIGFydGlmYWN0czogY29kZWJ1aWxkLkFydGlmYWN0cy5zMyh7XG4gICAgICAgIGJ1Y2tldDogYXJ0aWZhY3RCdWNrZXQsXG4gICAgICAgIHBhdGg6ICdidWlsZCcsXG4gICAgICAgIG5hbWU6ICdsYXllci56aXAnLFxuICAgICAgICBwYWNrYWdlWmlwOiBmYWxzZSxcbiAgICAgIH0pLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLm1pbnV0ZXMoMTUpLFxuICAgICAgY2FjaGU6IGNvZGVidWlsZC5DYWNoZS5sb2NhbChjb2RlYnVpbGQuTG9jYWxDYWNoZU1vZGUuU09VUkNFKSxcbiAgICB9KTtcblxuICAgIC8vIExhbWJkYSBmdW5jdGlvbiB0byBvcmNoZXN0cmF0ZSB0aGUgYnVpbGQgcHJvY2Vzc1xuICAgIGNvbnN0IG9yY2hlc3RyYXRvckZ1bmN0aW9uID0gbmV3IGxhbWJkYS5GdW5jdGlvbih0aGlzLCAnT3JjaGVzdHJhdG9yRnVuY3Rpb24nLCB7XG4gICAgICBmdW5jdGlvbk5hbWU6IGBhdXJhMjgtJHtwcm9wcy5lbnZpcm9ubWVudH0tc3dldGVzdC1sYXllci1vcmNoZXN0cmF0b3JgLFxuICAgICAgcnVudGltZTogbGFtYmRhLlJ1bnRpbWUuTk9ERUpTXzIwX1gsXG4gICAgICBoYW5kbGVyOiAnaW5kZXguaGFuZGxlcicsXG4gICAgICB0aW1lb3V0OiBjZGsuRHVyYXRpb24ubWludXRlcygxNSksXG4gICAgICBtZW1vcnlTaXplOiAyNTYsXG4gICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICBCVUlMRF9QUk9KRUNUX05BTUU6IGJ1aWxkUHJvamVjdC5wcm9qZWN0TmFtZSxcbiAgICAgICAgQVJUSUZBQ1RfQlVDS0VUOiBhcnRpZmFjdEJ1Y2tldC5idWNrZXROYW1lLFxuICAgICAgICBTU01fUEFSQU1FVEVSX05BTUU6IHRoaXMuc3NtUGFyYW1ldGVyTmFtZSxcbiAgICAgICAgRU5WSVJPTk1FTlQ6IHByb3BzLmVudmlyb25tZW50LFxuICAgICAgfSxcbiAgICAgIGNvZGU6IGxhbWJkYS5Db2RlLmZyb21JbmxpbmUoYFxuY29uc3QgeyBDb2RlQnVpbGRDbGllbnQsIFN0YXJ0QnVpbGRDb21tYW5kIH0gPSByZXF1aXJlKCdAYXdzLXNkay9jbGllbnQtY29kZWJ1aWxkJyk7XG5jb25zdCB7IFMzQ2xpZW50LCBQdXRPYmplY3RDb21tYW5kLCBHZXRPYmplY3RDb21tYW5kIH0gPSByZXF1aXJlKCdAYXdzLXNkay9jbGllbnQtczMnKTtcbmNvbnN0IHsgTGFtYmRhQ2xpZW50LCBQdWJsaXNoTGF5ZXJWZXJzaW9uQ29tbWFuZCB9ID0gcmVxdWlyZSgnQGF3cy1zZGsvY2xpZW50LWxhbWJkYScpO1xuY29uc3QgeyBTU01DbGllbnQsIFB1dFBhcmFtZXRlckNvbW1hbmQgfSA9IHJlcXVpcmUoJ0Bhd3Mtc2RrL2NsaWVudC1zc20nKTtcbmNvbnN0IHsgcmVhZEZpbGVTeW5jIH0gPSByZXF1aXJlKCdmcycpO1xuY29uc3QgeyBqb2luIH0gPSByZXF1aXJlKCdwYXRoJyk7XG5jb25zdCB7IGNyZWF0ZVJlYWRTdHJlYW0gfSA9IHJlcXVpcmUoJ2ZzJyk7XG5jb25zdCB7IFVwbG9hZCB9ID0gcmVxdWlyZSgnQGF3cy1zZGsvbGliLXN0b3JhZ2UnKTtcblxuY29uc3QgY29kZWJ1aWxkID0gbmV3IENvZGVCdWlsZENsaWVudCgpO1xuY29uc3QgczMgPSBuZXcgUzNDbGllbnQoKTtcbmNvbnN0IGxhbWJkYSA9IG5ldyBMYW1iZGFDbGllbnQoKTtcbmNvbnN0IHNzbSA9IG5ldyBTU01DbGllbnQoKTtcblxuZXhwb3J0cy5oYW5kbGVyID0gYXN5bmMgKGV2ZW50LCBjb250ZXh0KSA9PiB7XG4gIGNvbnNvbGUubG9nKCdFdmVudDonLCBKU09OLnN0cmluZ2lmeShldmVudCwgbnVsbCwgMikpO1xuICBcbiAgaWYgKGV2ZW50LlJlcXVlc3RUeXBlID09PSAnRGVsZXRlJykge1xuICAgIHJldHVybiB7IFBoeXNpY2FsUmVzb3VyY2VJZDogZXZlbnQuUGh5c2ljYWxSZXNvdXJjZUlkIHx8ICdzd2V0ZXN0LWxheWVyJyB9O1xuICB9XG4gIFxuICB0cnkge1xuICAgIC8vIFVwbG9hZCBzb3VyY2UgY29kZSB0byBTM1xuICAgIGNvbnNvbGUubG9nKCdVcGxvYWRpbmcgc291cmNlIGNvZGUgdG8gUzMuLi4nKTtcbiAgICBjb25zdCBzb3VyY2VaaXAgPSBhd2FpdCBjcmVhdGVTb3VyY2VaaXAoKTtcbiAgICBhd2FpdCBzMy5zZW5kKG5ldyBQdXRPYmplY3RDb21tYW5kKHtcbiAgICAgIEJ1Y2tldDogcHJvY2Vzcy5lbnYuQVJUSUZBQ1RfQlVDS0VULFxuICAgICAgS2V5OiAnc291cmNlL3N3ZXRlc3Qtc3JjLnppcCcsXG4gICAgICBCb2R5OiBzb3VyY2VaaXAsXG4gICAgfSkpO1xuICAgIFxuICAgIC8vIFN0YXJ0IENvZGVCdWlsZFxuICAgIGNvbnNvbGUubG9nKCdTdGFydGluZyBDb2RlQnVpbGQgcHJvamVjdC4uLicpO1xuICAgIGNvbnN0IGJ1aWxkUmVzcG9uc2UgPSBhd2FpdCBjb2RlYnVpbGQuc2VuZChuZXcgU3RhcnRCdWlsZENvbW1hbmQoe1xuICAgICAgcHJvamVjdE5hbWU6IHByb2Nlc3MuZW52LkJVSUxEX1BST0pFQ1RfTkFNRSxcbiAgICB9KSk7XG4gICAgXG4gICAgY29uc3QgYnVpbGRJZCA9IGJ1aWxkUmVzcG9uc2UuYnVpbGQuaWQ7XG4gICAgY29uc29sZS5sb2coJ0J1aWxkIHN0YXJ0ZWQ6JywgYnVpbGRJZCk7XG4gICAgXG4gICAgLy8gV2FpdCBmb3IgYnVpbGQgdG8gY29tcGxldGVcbiAgICBhd2FpdCB3YWl0Rm9yQnVpbGQoYnVpbGRJZCk7XG4gICAgXG4gICAgLy8gRG93bmxvYWQgYnVpbHQgbGF5ZXIgZnJvbSBTM1xuICAgIGNvbnNvbGUubG9nKCdEb3dubG9hZGluZyBidWlsdCBsYXllci4uLicpO1xuICAgIGNvbnN0IGxheWVyRGF0YSA9IGF3YWl0IHMzLnNlbmQobmV3IEdldE9iamVjdENvbW1hbmQoe1xuICAgICAgQnVja2V0OiBwcm9jZXNzLmVudi5BUlRJRkFDVF9CVUNLRVQsXG4gICAgICBLZXk6ICdidWlsZC9sYXllci56aXAnLFxuICAgIH0pKTtcbiAgICBcbiAgICBjb25zdCBsYXllckJ1ZmZlciA9IGF3YWl0IHN0cmVhbVRvQnVmZmVyKGxheWVyRGF0YS5Cb2R5KTtcbiAgICBcbiAgICAvLyBQdWJsaXNoIExhbWJkYSBsYXllclxuICAgIGNvbnNvbGUubG9nKCdQdWJsaXNoaW5nIExhbWJkYSBsYXllci4uLicpO1xuICAgIGNvbnN0IGxheWVyUmVzcG9uc2UgPSBhd2FpdCBsYW1iZGEuc2VuZChuZXcgUHVibGlzaExheWVyVmVyc2lvbkNvbW1hbmQoe1xuICAgICAgTGF5ZXJOYW1lOiBcXGBhdXJhMjgtXFwke3Byb2Nlc3MuZW52LkVOVklST05NRU5UfS1zd2V0ZXN0XFxgLFxuICAgICAgRGVzY3JpcHRpb246ICdTd2lzcyBFcGhlbWVyaXMgZm9yIE5vZGUuanMgMjAueCBidWlsdCBvbiBBbWF6b24gTGludXggMjAyMycsXG4gICAgICBDb250ZW50OiB7IFppcEZpbGU6IGxheWVyQnVmZmVyIH0sXG4gICAgICBDb21wYXRpYmxlUnVudGltZXM6IFsnbm9kZWpzMjAueCddLFxuICAgICAgQ29tcGF0aWJsZUFyY2hpdGVjdHVyZXM6IFsneDg2XzY0J10sXG4gICAgfSkpO1xuICAgIFxuICAgIGNvbnN0IGxheWVyQXJuID0gbGF5ZXJSZXNwb25zZS5MYXllclZlcnNpb25Bcm47XG4gICAgY29uc29sZS5sb2coJ0xheWVyIHB1Ymxpc2hlZDonLCBsYXllckFybik7XG4gICAgXG4gICAgLy8gU3RvcmUgQVJOIGluIFNTTSBQYXJhbWV0ZXIgU3RvcmVcbiAgICBjb25zb2xlLmxvZygnU3RvcmluZyBBUk4gaW4gU1NNIFBhcmFtZXRlciBTdG9yZS4uLicpO1xuICAgIGF3YWl0IHNzbS5zZW5kKG5ldyBQdXRQYXJhbWV0ZXJDb21tYW5kKHtcbiAgICAgIE5hbWU6IHByb2Nlc3MuZW52LlNTTV9QQVJBTUVURVJfTkFNRSxcbiAgICAgIFZhbHVlOiBsYXllckFybixcbiAgICAgIFR5cGU6ICdTdHJpbmcnLFxuICAgICAgT3ZlcndyaXRlOiB0cnVlLFxuICAgICAgRGVzY3JpcHRpb246ICdTd2lzcyBFcGhlbWVyaXMgTGFtYmRhIExheWVyIEFSTiBmb3IgTm9kZS5qcyAyMC54JyxcbiAgICB9KSk7XG4gICAgXG4gICAgcmV0dXJuIHtcbiAgICAgIFBoeXNpY2FsUmVzb3VyY2VJZDogbGF5ZXJBcm4sXG4gICAgICBEYXRhOiB7IExheWVyQXJuOiBsYXllckFybiB9LFxuICAgIH07XG4gIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgY29uc29sZS5lcnJvcignRXJyb3I6JywgZXJyb3IpO1xuICAgIHRocm93IGVycm9yO1xuICB9XG59O1xuXG5hc3luYyBmdW5jdGlvbiBjcmVhdGVTb3VyY2VaaXAoKSB7XG4gIC8vIEluIGEgcmVhbCBpbXBsZW1lbnRhdGlvbiwgdGhpcyB3b3VsZCB6aXAgdGhlIHN3ZXRlc3Qtc3JjIGRpcmVjdG9yeVxuICAvLyBGb3Igbm93LCByZXR1cm4gYSBtaW5pbWFsIHppcCB3aXRoIHBhY2thZ2UuanNvbiBhbmQgYnVpbGRzcGVjLnltbFxuICBjb25zdCBBZG1aaXAgPSByZXF1aXJlKCdhZG0temlwJyk7XG4gIGNvbnN0IHppcCA9IG5ldyBBZG1aaXAoKTtcbiAgXG4gIC8vIEFkZCBwYWNrYWdlLmpzb25cbiAgemlwLmFkZEZpbGUoJ3BhY2thZ2UuanNvbicsIEJ1ZmZlci5mcm9tKEpTT04uc3RyaW5naWZ5KHtcbiAgICBuYW1lOiAnc3dldGVzdC1sYXllcicsXG4gICAgdmVyc2lvbjogJzEuMC4wJyxcbiAgICBkZXBlbmRlbmNpZXM6IHsgc3dpc3NlcGg6ICdeMC41LjEzJyB9XG4gIH0sIG51bGwsIDIpKSk7XG4gIFxuICAvLyBBZGQgYnVpbGRzcGVjLnltbCAoY29udGVudCBmcm9tIHRoZSBhY3R1YWwgZmlsZSlcbiAgY29uc3QgYnVpbGRzcGVjQ29udGVudCA9IFxcYHZlcnNpb246IDAuMlxuXG5waGFzZXM6XG4gIGluc3RhbGw6XG4gICAgcnVudGltZS12ZXJzaW9uczpcbiAgICAgIG5vZGVqczogMjBcbiAgICBjb21tYW5kczpcbiAgICAgIC0geXVtIHVwZGF0ZSAteVxuICAgICAgLSB5dW0gaW5zdGFsbCAteSBnY2MtYysrIG1ha2UgcHl0aG9uM1xuICBidWlsZDpcbiAgICBjb21tYW5kczpcbiAgICAgIC0gbnBtIGNpXG4gICAgICAtIG1rZGlyIC1wIG5vZGVqc1xuICAgICAgLSBjcCAtciBub2RlX21vZHVsZXMgbm9kZWpzL1xuICAgICAgLSBta2RpciAtcCBub2RlanMvbm9kZV9tb2R1bGVzL3N3aXNzZXBoL2VwaGVcbiAgICAgIC0gfFxuICAgICAgICBpZiBbIC1mIFwibm9kZV9tb2R1bGVzL3N3aXNzZXBoL2VwaGUvc2VwbF8xOC5zZTFcIiBdOyB0aGVuXG4gICAgICAgICAgY3Agbm9kZV9tb2R1bGVzL3N3aXNzZXBoL2VwaGUvc2VwbF8xOC5zZTEgbm9kZWpzL25vZGVfbW9kdWxlcy9zd2lzc2VwaC9lcGhlL1xuICAgICAgICAgIGNwIG5vZGVfbW9kdWxlcy9zd2lzc2VwaC9lcGhlL3NlYXNfMTguc2UxIG5vZGVqcy9ub2RlX21vZHVsZXMvc3dpc3NlcGgvZXBoZS9cbiAgICAgICAgICBjcCBub2RlX21vZHVsZXMvc3dpc3NlcGgvZXBoZS9zZW1vXzE4LnNlMSBub2RlanMvbm9kZV9tb2R1bGVzL3N3aXNzZXBoL2VwaGUvXG4gICAgICAgIGZpXG4gICAgICAtIHppcCAtcnEgbGF5ZXIuemlwIG5vZGVqcy9cbmFydGlmYWN0czpcbiAgZmlsZXM6XG4gICAgLSBsYXllci56aXBcblxcYDtcbiAgXG4gIHppcC5hZGRGaWxlKCdidWlsZHNwZWMueW1sJywgQnVmZmVyLmZyb20oYnVpbGRzcGVjQ29udGVudCkpO1xuICByZXR1cm4gemlwLnRvQnVmZmVyKCk7XG59XG5cbmFzeW5jIGZ1bmN0aW9uIHdhaXRGb3JCdWlsZChidWlsZElkKSB7XG4gIGNvbnN0IHsgQ29kZUJ1aWxkQ2xpZW50LCBCYXRjaEdldEJ1aWxkc0NvbW1hbmQgfSA9IHJlcXVpcmUoJ0Bhd3Mtc2RrL2NsaWVudC1jb2RlYnVpbGQnKTtcbiAgY29uc3QgY29kZWJ1aWxkID0gbmV3IENvZGVCdWlsZENsaWVudCgpO1xuICBcbiAgbGV0IHN0YXR1cyA9ICdJTl9QUk9HUkVTUyc7XG4gIHdoaWxlIChzdGF0dXMgPT09ICdJTl9QUk9HUkVTUycpIHtcbiAgICBhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgMTAwMDApKTsgLy8gV2FpdCAxMCBzZWNvbmRzXG4gICAgXG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBjb2RlYnVpbGQuc2VuZChuZXcgQmF0Y2hHZXRCdWlsZHNDb21tYW5kKHtcbiAgICAgIGlkczogW2J1aWxkSWRdLFxuICAgIH0pKTtcbiAgICBcbiAgICBzdGF0dXMgPSByZXNwb25zZS5idWlsZHNbMF0uYnVpbGRTdGF0dXM7XG4gICAgY29uc29sZS5sb2coJ0J1aWxkIHN0YXR1czonLCBzdGF0dXMpO1xuICB9XG4gIFxuICBpZiAoc3RhdHVzICE9PSAnU1VDQ0VFREVEJykge1xuICAgIHRocm93IG5ldyBFcnJvcihcXGBCdWlsZCBmYWlsZWQgd2l0aCBzdGF0dXM6IFxcJHtzdGF0dXN9XFxgKTtcbiAgfVxufVxuXG5hc3luYyBmdW5jdGlvbiBzdHJlYW1Ub0J1ZmZlcihzdHJlYW0pIHtcbiAgY29uc3QgY2h1bmtzID0gW107XG4gIGZvciBhd2FpdCAoY29uc3QgY2h1bmsgb2Ygc3RyZWFtKSB7XG4gICAgY2h1bmtzLnB1c2goY2h1bmspO1xuICB9XG4gIHJldHVybiBCdWZmZXIuY29uY2F0KGNodW5rcyk7XG59XG4gICAgICBgKSxcbiAgICAgIGxvZ1JldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLLFxuICAgIH0pO1xuXG4gICAgLy8gR3JhbnQgcGVybWlzc2lvbnNcbiAgICBhcnRpZmFjdEJ1Y2tldC5ncmFudFJlYWRXcml0ZShvcmNoZXN0cmF0b3JGdW5jdGlvbik7XG4gICAgYXJ0aWZhY3RCdWNrZXQuZ3JhbnRSZWFkV3JpdGUoYnVpbGRQcm9qZWN0KTtcblxuICAgIG9yY2hlc3RyYXRvckZ1bmN0aW9uLmFkZFRvUm9sZVBvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgYWN0aW9uczogWydjb2RlYnVpbGQ6U3RhcnRCdWlsZCcsICdjb2RlYnVpbGQ6QmF0Y2hHZXRCdWlsZHMnXSxcbiAgICAgICAgcmVzb3VyY2VzOiBbYnVpbGRQcm9qZWN0LnByb2plY3RBcm5dLFxuICAgICAgfSksXG4gICAgKTtcblxuICAgIG9yY2hlc3RyYXRvckZ1bmN0aW9uLmFkZFRvUm9sZVBvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgYWN0aW9uczogWydsYW1iZGE6UHVibGlzaExheWVyVmVyc2lvbiddLFxuICAgICAgICByZXNvdXJjZXM6IFsnKiddLFxuICAgICAgfSksXG4gICAgKTtcblxuICAgIG9yY2hlc3RyYXRvckZ1bmN0aW9uLmFkZFRvUm9sZVBvbGljeShcbiAgICAgIG5ldyBpYW0uUG9saWN5U3RhdGVtZW50KHtcbiAgICAgICAgYWN0aW9uczogWydzc206UHV0UGFyYW1ldGVyJ10sXG4gICAgICAgIHJlc291cmNlczogW1xuICAgICAgICAgIGBhcm46YXdzOnNzbToke2Nkay5TdGFjay5vZih0aGlzKS5yZWdpb259OiR7Y2RrLlN0YWNrLm9mKHRoaXMpLmFjY291bnR9OnBhcmFtZXRlciR7dGhpcy5zc21QYXJhbWV0ZXJOYW1lfWAsXG4gICAgICAgIF0sXG4gICAgICB9KSxcbiAgICApO1xuXG4gICAgLy8gQ3VzdG9tIHJlc291cmNlIHRvIHRyaWdnZXIgdGhlIGJ1aWxkXG4gICAgY29uc3QgcHJvdmlkZXIgPSBuZXcgY3IuUHJvdmlkZXIodGhpcywgJ0xheWVyQnVpbGRQcm92aWRlcicsIHtcbiAgICAgIG9uRXZlbnRIYW5kbGVyOiBvcmNoZXN0cmF0b3JGdW5jdGlvbixcbiAgICAgIGxvZ1JldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLLFxuICAgIH0pO1xuXG4gICAgY29uc3QgY3VzdG9tUmVzb3VyY2UgPSBuZXcgY2RrLkN1c3RvbVJlc291cmNlKHRoaXMsICdMYXllckJ1aWxkUmVzb3VyY2UnLCB7XG4gICAgICBzZXJ2aWNlVG9rZW46IHByb3ZpZGVyLnNlcnZpY2VUb2tlbixcbiAgICAgIHByb3BlcnRpZXM6IHtcbiAgICAgICAgVGltZXN0YW1wOiBEYXRlLm5vdygpLCAvLyBGb3JjZSB1cGRhdGUgb24gZWFjaCBkZXBsb3ltZW50XG4gICAgICAgIEVudmlyb25tZW50OiBwcm9wcy5lbnZpcm9ubWVudCxcbiAgICAgIH0sXG4gICAgfSk7XG5cbiAgICB0aGlzLmxheWVyVmVyc2lvbkFybiA9IGN1c3RvbVJlc291cmNlLmdldEF0dFN0cmluZygnTGF5ZXJBcm4nKTtcblxuICAgIC8vIE91dHB1dCB0aGUgbGF5ZXIgQVJOXG4gICAgbmV3IGNkay5DZm5PdXRwdXQodGhpcywgJ1N3ZXRlc3RMYXllckFybicsIHtcbiAgICAgIHZhbHVlOiB0aGlzLmxheWVyVmVyc2lvbkFybixcbiAgICAgIGRlc2NyaXB0aW9uOiAnU3dpc3MgRXBoZW1lcmlzIExhbWJkYSBMYXllciBBUk4nLFxuICAgICAgZXhwb3J0TmFtZTogYEF1cmEyOC0ke3Byb3BzLmVudmlyb25tZW50fS1Td2V0ZXN0TGF5ZXJBcm5gLFxuICAgIH0pO1xuXG4gICAgLy8gQ3JlYXRlIEVpbnN0ZWluIGNhbmFyeSB0ZXN0IExhbWJkYVxuICAgIGNvbnN0IGNhbmFyeUZ1bmN0aW9uID0gbmV3IGxhbWJkYU5vZGVKcy5Ob2RlanNGdW5jdGlvbih0aGlzLCAnRWluc3RlaW5DYW5hcnlGdW5jdGlvbicsIHtcbiAgICAgIGZ1bmN0aW9uTmFtZTogYGF1cmEyOC0ke3Byb3BzLmVudmlyb25tZW50fS1zd2V0ZXN0LWNhbmFyeWAsXG4gICAgICBlbnRyeTogcGF0aC5qb2luKF9fZGlybmFtZSwgJy4uLy4uL2xhbWJkYS9zd2V0ZXN0LWNhbmFyeS9laW5zdGVpbi1jYW5hcnkudHMnKSxcbiAgICAgIGhhbmRsZXI6ICdoYW5kbGVyJyxcbiAgICAgIHJ1bnRpbWU6IGxhbWJkYS5SdW50aW1lLk5PREVKU18yMF9YLFxuICAgICAgdGltZW91dDogY2RrLkR1cmF0aW9uLnNlY29uZHMoMzApLFxuICAgICAgbWVtb3J5U2l6ZTogMjU2LFxuICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgRU5WSVJPTk1FTlQ6IHByb3BzLmVudmlyb25tZW50LFxuICAgICAgfSxcbiAgICAgIGJ1bmRsaW5nOiB7XG4gICAgICAgIGV4dGVybmFsTW9kdWxlczogWydAYXdzLXNkay8qJywgJ3N3aXNzZXBoJ10sXG4gICAgICAgIGZvcmNlRG9ja2VyQnVuZGxpbmc6IGZhbHNlLFxuICAgICAgfSxcbiAgICAgIGxheWVyczogW1xuICAgICAgICBsYW1iZGEuTGF5ZXJWZXJzaW9uLmZyb21MYXllclZlcnNpb25Bcm4oXG4gICAgICAgICAgdGhpcyxcbiAgICAgICAgICAnQ2FuYXJ5U3dpc3NFcGhlbWVyaXNMYXllcicsXG4gICAgICAgICAgdGhpcy5sYXllclZlcnNpb25Bcm4sIC8vIFVzZSB0aGUgQ3VzdG9tIFJlc291cmNlIG91dHB1dCBkaXJlY3RseVxuICAgICAgICApLFxuICAgICAgXSxcbiAgICAgIGxvZ1JldGVudGlvbjogbG9ncy5SZXRlbnRpb25EYXlzLk9ORV9XRUVLLFxuICAgIH0pO1xuXG4gICAgLy8gR3JhbnQgQ2xvdWRXYXRjaCBtZXRyaWNzIHBlcm1pc3Npb25zXG4gICAgY2FuYXJ5RnVuY3Rpb24uYWRkVG9Sb2xlUG9saWN5KFxuICAgICAgbmV3IGlhbS5Qb2xpY3lTdGF0ZW1lbnQoe1xuICAgICAgICBhY3Rpb25zOiBbJ2Nsb3Vkd2F0Y2g6UHV0TWV0cmljRGF0YSddLFxuICAgICAgICByZXNvdXJjZXM6IFsnKiddLFxuICAgICAgfSksXG4gICAgKTtcblxuICAgIC8vIFNjaGVkdWxlIGNhbmFyeSB0byBydW4gZGFpbHlcbiAgICBjb25zdCBjYW5hcnlTY2hlZHVsZSA9IG5ldyBldmVudHMuUnVsZSh0aGlzLCAnQ2FuYXJ5U2NoZWR1bGUnLCB7XG4gICAgICBydWxlTmFtZTogYGF1cmEyOC0ke3Byb3BzLmVudmlyb25tZW50fS1zd2V0ZXN0LWNhbmFyeS1zY2hlZHVsZWAsXG4gICAgICBkZXNjcmlwdGlvbjogJ0RhaWx5IFN3aXNzIEVwaGVtZXJpcyBsYXllciB2YWxpZGF0aW9uJyxcbiAgICAgIHNjaGVkdWxlOiBldmVudHMuU2NoZWR1bGUucmF0ZShjZGsuRHVyYXRpb24uZGF5cygxKSksXG4gICAgfSk7XG5cbiAgICBjYW5hcnlTY2hlZHVsZS5hZGRUYXJnZXQobmV3IHRhcmdldHMuTGFtYmRhRnVuY3Rpb24oY2FuYXJ5RnVuY3Rpb24pKTtcblxuICAgIC8vIENyZWF0ZSBDbG91ZFdhdGNoIGFsYXJtIGZvciBjYW5hcnkgZmFpbHVyZXNcbiAgICBuZXcgY2xvdWR3YXRjaC5BbGFybSh0aGlzLCAnQ2FuYXJ5QWxhcm0nLCB7XG4gICAgICBhbGFybU5hbWU6IGBhdXJhMjgtJHtwcm9wcy5lbnZpcm9ubWVudH0tc3dldGVzdC1jYW5hcnktZmFpbHVyZWAsXG4gICAgICBhbGFybURlc2NyaXB0aW9uOiAnU3dpc3MgRXBoZW1lcmlzIGxheWVyIGNhbmFyeSB0ZXN0IGZhaWx1cmUnLFxuICAgICAgbWV0cmljOiBuZXcgY2xvdWR3YXRjaC5NZXRyaWMoe1xuICAgICAgICBuYW1lc3BhY2U6ICdBdXJhMjgvQ2FuYXJ5JyxcbiAgICAgICAgbWV0cmljTmFtZTogJ1N3aXNzRXBoZW1lcmlzTGF5ZXJIZWFsdGgnLFxuICAgICAgICBkaW1lbnNpb25zTWFwOiB7XG4gICAgICAgICAgRW52aXJvbm1lbnQ6IHByb3BzLmVudmlyb25tZW50LFxuICAgICAgICAgIFRlc3Q6ICdFaW5zdGVpbicsXG4gICAgICAgIH0sXG4gICAgICAgIHN0YXRpc3RpYzogJ0F2ZXJhZ2UnLFxuICAgICAgICBwZXJpb2Q6IGNkay5EdXJhdGlvbi5kYXlzKDEpLFxuICAgICAgfSksXG4gICAgICB0aHJlc2hvbGQ6IDEsXG4gICAgICBjb21wYXJpc29uT3BlcmF0b3I6IGNsb3Vkd2F0Y2guQ29tcGFyaXNvbk9wZXJhdG9yLkxFU1NfVEhBTl9USFJFU0hPTEQsXG4gICAgICBldmFsdWF0aW9uUGVyaW9kczogMSxcbiAgICAgIHRyZWF0TWlzc2luZ0RhdGE6IGNsb3Vkd2F0Y2guVHJlYXRNaXNzaW5nRGF0YS5CUkVBQ0hJTkcsXG4gICAgfSk7XG5cbiAgICAvLyBPdXRwdXQgY2FuYXJ5IGZ1bmN0aW9uIEFSTlxuICAgIG5ldyBjZGsuQ2ZuT3V0cHV0KHRoaXMsICdDYW5hcnlGdW5jdGlvbkFybicsIHtcbiAgICAgIHZhbHVlOiBjYW5hcnlGdW5jdGlvbi5mdW5jdGlvbkFybixcbiAgICAgIGRlc2NyaXB0aW9uOiAnRWluc3RlaW4gQ2FuYXJ5IFRlc3QgRnVuY3Rpb24gQVJOJyxcbiAgICB9KTtcbiAgfVxufVxuIl19