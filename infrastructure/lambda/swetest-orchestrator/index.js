const AWS = require('aws-sdk');
const s3 = new AWS.S3();
const codebuild = new AWS.CodeBuild();
const lambda = new AWS.Lambda();
const ssm = new AWS.SSM();
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

exports.handler = async (event) => {
  console.info('Event:', JSON.stringify(event, null, 2));
  
  const buildProjectName = process.env.BUILD_PROJECT_NAME;
  const bucketName = process.env.ARTIFACT_BUCKET;
  const ssmParameterName = process.env.SSM_PARAMETER_NAME;
  const environment = process.env.ENVIRONMENT;
  
  if (event.RequestType === 'Delete') {
    return {
      PhysicalResourceId: event.PhysicalResourceId || 'swetest-layer',
      Data: { LayerArn: event.PhysicalResourceId || '' }
    };
  }
  
  try {
    // Create a minimal source package for CodeBuild
    const sourceContent = {
      'buildspec.yml': `version: 0.2
phases:
  install:
    runtime-versions:
      nodejs: 20
    commands:
      - echo "Node version:" && node --version
      - echo "NPM version:" && npm --version
  pre_build:
    commands:
      - mkdir -p nodejs
      - cd nodejs
  build:
    commands:
      - npm init -y
      - npm install swisseph@2.10.3
      - echo "Installed packages:"
      - ls -la node_modules/
      - echo "Swiss Ephemeris files:"
      - ls -la node_modules/swisseph/
      - echo "Ephemeris data files:"
      - ls -la node_modules/swisseph/ephe/
      - |
        # Size validation
        TOTAL_SIZE=$(du -sb node_modules/swisseph/ephe/*.se1 2>/dev/null | awk '{sum+=$1} END {print sum}')
        echo "Total ephemeris files size: $TOTAL_SIZE bytes"
        if [ "$TOTAL_SIZE" -gt 10485760 ]; then
          echo "ERROR: Ephemeris files exceed 10MB limit"
          exit 1
        fi
      - |
        # Copy only required ephemeris files (2.1MB total)
        mkdir -p ../nodejs-clean/node_modules/swisseph/ephe
        cp -r node_modules/swisseph/*.js ../nodejs-clean/node_modules/swisseph/
        cp -r node_modules/swisseph/*.json ../nodejs-clean/node_modules/swisseph/
        cp -r node_modules/swisseph/build ../nodejs-clean/node_modules/swisseph/
        cp -r node_modules/swisseph/lib ../nodejs-clean/node_modules/swisseph/
        cp -r node_modules/swisseph/src ../nodejs-clean/node_modules/swisseph/
        cp node_modules/swisseph/ephe/sepl_18.se1 ../nodejs-clean/node_modules/swisseph/ephe/
        cp node_modules/swisseph/ephe/seas_18.se1 ../nodejs-clean/node_modules/swisseph/ephe/
        cp node_modules/swisseph/ephe/semo_18.se1 ../nodejs-clean/node_modules/swisseph/ephe/
        cd ..
        mv nodejs-clean nodejs
  post_build:
    commands:
      - echo "Creating layer package..."
      - zip -r layer.zip nodejs
      - echo "Layer size:" && ls -lh layer.zip
artifacts:
  files:
    - layer.zip
  name: layer.zip`,
      'package.json': JSON.stringify({
        name: 'swetest-layer',
        version: '1.0.0',
        description: 'Swiss Ephemeris Lambda Layer'
      })
    };
    
    // Create zip file using native Node.js child_process
    const tmpDir = '/tmp/swetest-src-' + Date.now();
    fs.mkdirSync(tmpDir, { recursive: true });
    
    // Write files to temp directory
    Object.entries(sourceContent).forEach(([filename, content]) => {
      fs.writeFileSync(path.join(tmpDir, filename), content);
    });
    
    // Create zip using the zip command (available in Lambda runtime)
    const zipPath = '/tmp/swetest-src.zip';
    execSync(`cd ${tmpDir} && zip -r ${zipPath} .`);
    
    // Upload source to S3
    console.info('Uploading source to S3...');
    await s3.putObject({
      Bucket: bucketName,
      Key: 'source/swetest-src.zip',
      Body: fs.readFileSync(zipPath)
    }).promise();
    
    // Clean up temp directory
    execSync(`rm -rf ${tmpDir}`);
    
    // Start CodeBuild
    console.info('Starting CodeBuild...');
    const buildResult = await codebuild.startBuild({
      projectName: buildProjectName
    }).promise();
    
    const buildId = buildResult.build.id;
    console.info('Build started:', buildId);
    
    // Wait for build to complete
    let buildStatus = 'IN_PROGRESS';
    while (buildStatus === 'IN_PROGRESS') {
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      const builds = await codebuild.batchGetBuilds({
        ids: [buildId]
      }).promise();
      
      buildStatus = builds.builds[0].buildStatus;
      console.info('Build status:', buildStatus);
    }
    
    if (buildStatus !== 'SUCCEEDED') {
      throw new Error(`Build failed with status: ${buildStatus}`);
    }
    
    // Download the built layer
    console.info('Downloading built layer...');
    const layerObject = await s3.getObject({
      Bucket: bucketName,
      Key: 'build/layer.zip'
    }).promise();
    
    // Publish layer version
    console.info('Publishing layer version...');
    const layerResult = await lambda.publishLayerVersion({
      LayerName: `aura28-${environment}-swetest-layer`,
      Description: 'Swiss Ephemeris native module for Node.js 20.x',
      Content: {
        ZipFile: layerObject.Body
      },
      CompatibleRuntimes: ['nodejs20.x'],
      CompatibleArchitectures: ['x86_64']
    }).promise();
    
    const layerArn = layerResult.LayerVersionArn;
    console.info('Layer published:', layerArn);
    
    // Store in SSM Parameter Store
    await ssm.putParameter({
      Name: ssmParameterName,
      Value: layerArn,
      Type: 'String',
      Overwrite: true,
      Description: 'Swiss Ephemeris Lambda Layer ARN'
    }).promise();
    
    return {
      PhysicalResourceId: layerArn,
      Data: { LayerArn: layerArn }
    };
    
  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
};