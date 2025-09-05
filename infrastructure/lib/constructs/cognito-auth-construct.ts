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

    // Create Admin Group
    this.userPool.addGroup('AdminGroup', {
      groupName: 'admin',
      description: 'Administrator users with elevated privileges',
      precedence: 1, // Highest priority
    });

    // Create User Pool Domain
    this.userPoolDomain = new cognito.UserPoolDomain(this, 'UserPoolDomain', {
      userPool: this.userPool,
      cognitoDomain: {
        domainPrefix: props.domainPrefix,
      },
    });

    // Create or reference Google OAuth secret
    // Always create a placeholder for now (will be replaced with actual credentials later)
    new secretsmanager.Secret(this, 'GoogleOAuthSecret', {
      secretName: `aura28/oauth/google/${props.environment}`,
      description: 'Google OAuth credentials (to be populated manually)',
      secretObjectValue: {
        client_id: cdk.SecretValue.unsafePlainText('PLACEHOLDER_GOOGLE_CLIENT_ID'),
        client_secret: cdk.SecretValue.unsafePlainText('PLACEHOLDER_GOOGLE_CLIENT_SECRET'),
      },
    });

    // Create Google identity provider
    const googleProvider = new cognito.UserPoolIdentityProviderGoogle(this, 'GoogleProvider', {
      clientId: 'PLACEHOLDER_GOOGLE_CLIENT_ID',
      clientSecretValue: cdk.SecretValue.unsafePlainText('PLACEHOLDER_GOOGLE_CLIENT_SECRET'),
      userPool: this.userPool,
      attributeMapping: {
        email: cognito.ProviderAttribute.GOOGLE_EMAIL,
        givenName: cognito.ProviderAttribute.GOOGLE_GIVEN_NAME,
        familyName: cognito.ProviderAttribute.GOOGLE_FAMILY_NAME,
      },
      scopes: ['profile', 'email', 'openid'],
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
        scopes: [
          cognito.OAuthScope.EMAIL,
          cognito.OAuthScope.OPENID,
          cognito.OAuthScope.PROFILE,
          cognito.OAuthScope.COGNITO_ADMIN,
        ],
        callbackUrls: props.callbackUrls,
        logoutUrls: props.logoutUrls,
      },
      preventUserExistenceErrors: true,
      supportedIdentityProviders: [
        cognito.UserPoolClientIdentityProvider.COGNITO,
        cognito.UserPoolClientIdentityProvider.GOOGLE,
      ],
      readAttributes: new cognito.ClientAttributes()
        .withStandardAttributes({
          email: true,
          emailVerified: true,
          givenName: true,
          familyName: true,
          birthdate: true,
        })
        .withCustomAttributes(),
      writeAttributes: new cognito.ClientAttributes()
        .withStandardAttributes({
          email: true,
          givenName: true,
          familyName: true,
          birthdate: true,
        })
        .withCustomAttributes(),
    });

    // Ensure proper dependency - client depends on provider
    this.userPoolClient.node.addDependency(googleProvider);

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

    new cdk.CfnOutput(this, 'AdminGroupName', {
      value: 'admin',
      description: 'Cognito Admin Group Name',
    });

    new cdk.CfnOutput(this, 'OAuthSecretsReminder', {
      value: `ACTION REQUIRED: When ready for social login, populate these secrets in AWS Secrets Manager: aura28/oauth/google/${props.environment}, ${facebookSecret.secretName}, ${appleSecret.secretName}`,
      description: 'OAuth Secrets Reminder',
    });
  }
}
