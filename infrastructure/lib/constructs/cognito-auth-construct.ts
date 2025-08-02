import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';

export interface CognitoAuthConstructProps {
  environment: 'dev' | 'prod';
  domainPrefix: string;
  callbackUrls: string[];
  logoutUrls: string[];
}

export class CognitoAuthConstruct extends Construct {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly userPoolDomain: cognito.UserPoolDomain;

  constructor(scope: Construct, id: string, props: CognitoAuthConstructProps) {
    super(scope, id);

    // Create User Pool
    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `aura28-${props.environment}-user-pool`,
      selfSignUpEnabled: true,
      signInAliases: {
        email: true,
        username: false,
      },
      autoVerify: {
        email: true,
      },
      standardAttributes: {
        email: {
          required: true,
          mutable: true,
        },
        givenName: {
          required: false,
          mutable: true,
        },
        familyName: {
          required: false,
          mutable: true,
        },
        birthdate: {
          required: false,
          mutable: true,
        },
      },
      customAttributes: {
        birthTime: new cognito.StringAttribute({
          minLen: 1,
          maxLen: 10,
          mutable: true,
        }),
        birthPlace: new cognito.StringAttribute({
          minLen: 1,
          maxLen: 256,
          mutable: true,
        }),
        birthLatitude: new cognito.StringAttribute({
          minLen: 1,
          maxLen: 20,
          mutable: true,
        }),
        birthLongitude: new cognito.StringAttribute({
          minLen: 1,
          maxLen: 20,
          mutable: true,
        }),
        birthCity: new cognito.StringAttribute({
          minLen: 1,
          maxLen: 100,
          mutable: true,
        }),
        birthState: new cognito.StringAttribute({
          minLen: 1,
          maxLen: 100,
          mutable: true,
        }),
        birthCountry: new cognito.StringAttribute({
          minLen: 1,
          maxLen: 100,
          mutable: true,
        }),
        birthDate: new cognito.StringAttribute({
          minLen: 10,
          maxLen: 10,
          mutable: true,
        }),
        birthName: new cognito.StringAttribute({
          minLen: 1,
          maxLen: 256,
          mutable: true,
        }),
      },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy:
        props.environment === 'dev' ? cdk.RemovalPolicy.DESTROY : cdk.RemovalPolicy.RETAIN,
    });

    // Create User Pool Domain
    this.userPoolDomain = new cognito.UserPoolDomain(this, 'UserPoolDomain', {
      userPool: this.userPool,
      cognitoDomain: {
        domainPrefix: props.domainPrefix,
      },
    });

    // Create User Pool Client
    this.userPoolClient = new cognito.UserPoolClient(this, 'UserPoolClient', {
      userPool: this.userPool,
      userPoolClientName: `aura28-${props.environment}-client`,
      generateSecret: false,
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      oAuth: {
        flows: {
          authorizationCodeGrant: true,
          implicitCodeGrant: false,
        },
        scopes: [cognito.OAuthScope.EMAIL, cognito.OAuthScope.OPENID, cognito.OAuthScope.PROFILE],
        callbackUrls: props.callbackUrls,
        logoutUrls: props.logoutUrls,
      },
      preventUserExistenceErrors: true,
      supportedIdentityProviders: [cognito.UserPoolClientIdentityProvider.COGNITO],
      readAttributes: new cognito.ClientAttributes()
        .withStandardAttributes({
          email: true,
          emailVerified: true,
          givenName: true,
          familyName: true,
          birthdate: true,
        })
        .withCustomAttributes(
          'birthTime',
          'birthPlace',
          'birthLatitude',
          'birthLongitude',
          'birthCity',
          'birthState',
          'birthCountry',
          'birthDate',
          'birthName',
        ),
      writeAttributes: new cognito.ClientAttributes()
        .withStandardAttributes({
          email: true,
          givenName: true,
          familyName: true,
          birthdate: true,
        })
        .withCustomAttributes(
          'birthTime',
          'birthPlace',
          'birthLatitude',
          'birthLongitude',
          'birthCity',
          'birthState',
          'birthCountry',
          'birthDate',
          'birthName',
        ),
    });

    // Create placeholder secrets for future OAuth providers
    const googleSecret = new secretsmanager.Secret(this, 'GoogleOAuthSecret', {
      secretName: `aura28/oauth/google/${props.environment}`,
      description: 'Google OAuth credentials (to be populated manually)',
      secretObjectValue: {
        client_id: cdk.SecretValue.unsafePlainText('PLACEHOLDER_GOOGLE_CLIENT_ID'),
        client_secret: cdk.SecretValue.unsafePlainText('PLACEHOLDER_GOOGLE_CLIENT_SECRET'),
      },
    });

    const facebookSecret = new secretsmanager.Secret(this, 'FacebookOAuthSecret', {
      secretName: `aura28/oauth/facebook/${props.environment}`,
      description: 'Facebook OAuth credentials (to be populated manually)',
      secretObjectValue: {
        app_id: cdk.SecretValue.unsafePlainText('PLACEHOLDER_FACEBOOK_APP_ID'),
        app_secret: cdk.SecretValue.unsafePlainText('PLACEHOLDER_FACEBOOK_APP_SECRET'),
      },
    });

    const appleSecret = new secretsmanager.Secret(this, 'AppleOAuthSecret', {
      secretName: `aura28/oauth/apple/${props.environment}`,
      description: 'Apple OAuth credentials (to be populated manually)',
      secretObjectValue: {
        services_id: cdk.SecretValue.unsafePlainText('PLACEHOLDER_APPLE_SERVICES_ID'),
        team_id: cdk.SecretValue.unsafePlainText('PLACEHOLDER_APPLE_TEAM_ID'),
        key_id: cdk.SecretValue.unsafePlainText('PLACEHOLDER_APPLE_KEY_ID'),
        private_key: cdk.SecretValue.unsafePlainText('PLACEHOLDER_APPLE_PRIVATE_KEY'),
      },
    });

    // Output values
    new cdk.CfnOutput(this, 'UserPoolId', {
      value: this.userPool.userPoolId,
      description: 'Cognito User Pool ID',
    });

    new cdk.CfnOutput(this, 'UserPoolClientId', {
      value: this.userPoolClient.userPoolClientId,
      description: 'Cognito User Pool Client ID',
    });

    new cdk.CfnOutput(this, 'CognitoDomainPrefix', {
      value: props.domainPrefix,
      description: 'Cognito Domain Prefix',
    });

    new cdk.CfnOutput(this, 'CognitoHostedUIURL', {
      value: `https://${props.domainPrefix}.auth.${cdk.Stack.of(this).region}.amazoncognito.com`,
      description: 'Cognito Hosted UI Base URL',
    });

    new cdk.CfnOutput(this, 'OAuthSecretsReminder', {
      value: `ACTION REQUIRED: When ready for social login, populate these secrets in AWS Secrets Manager: ${googleSecret.secretName}, ${facebookSecret.secretName}, ${appleSecret.secretName}`,
      description: 'OAuth Secrets Reminder',
    });
  }
}
