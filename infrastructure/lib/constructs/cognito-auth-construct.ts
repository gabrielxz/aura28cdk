import { Construct } from 'constructs';
import * as cdk from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';

export interface CognitoAuthConstructProps {
  environment: 'dev' | 'prod';
  domainPrefix: string;
  callbackUrls: string[];
  logoutUrls: string[];
  customDomain?: {
    domainName: string; // e.g., auth.aura28.com
    hostedZone: route53.IHostedZone;
  };
}

export class CognitoAuthConstruct extends Construct {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly userPoolDomain: cognito.UserPoolDomain;
  public readonly customDomainCertificate?: acm.Certificate;
  public readonly customDomainName?: string;

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

    // Create certificate for custom domain if needed (only for production)
    if (props.customDomain && props.environment === 'prod') {
      // Certificate must be in us-east-1 for Cognito custom domains
      this.customDomainCertificate = new acm.Certificate(this, 'CustomDomainCertificate', {
        domainName: props.customDomain.domainName,
        validation: acm.CertificateValidation.fromDns(props.customDomain.hostedZone),
      });
      this.customDomainName = props.customDomain.domainName;
    }

    // Create User Pool Domain
    if (this.customDomainCertificate && this.customDomainName) {
      // Production with custom domain
      this.userPoolDomain = new cognito.UserPoolDomain(this, 'UserPoolDomain', {
        userPool: this.userPool,
        customDomain: {
          domainName: this.customDomainName,
          certificate: this.customDomainCertificate,
        },
      });
    } else {
      // Dev environment or production without custom domain (fallback)
      this.userPoolDomain = new cognito.UserPoolDomain(this, 'UserPoolDomain', {
        userPool: this.userPool,
        cognitoDomain: {
          domainPrefix: props.domainPrefix,
        },
      });
    }

    // Reference the existing Google OAuth secret from Secrets Manager
    // This secret should be manually created with real Google OAuth credentials
    const googleSecret = secretsmanager.Secret.fromSecretNameV2(
      this,
      'GoogleOAuthSecret',
      `aura28/oauth/google/${props.environment}`,
    );

    // Create Google identity provider using credentials from Secrets Manager
    const googleProvider = new cognito.UserPoolIdentityProviderGoogle(this, 'GoogleProvider', {
      clientId: googleSecret.secretValueFromJson('client_id').unsafeUnwrap(),
      clientSecretValue: googleSecret.secretValueFromJson('client_secret'),
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

    // Note: Facebook OAuth can be added later by creating a secret in Secrets Manager
    // with the name: aura28/oauth/facebook/${environment}
    // containing: { "app_id": "...", "app_secret": "..." }

    // Note: Apple OAuth can be added later by creating a secret in Secrets Manager
    // with the name: aura28/oauth/apple/${environment}
    // containing: { "services_id": "...", "team_id": "...", "key_id": "...", "private_key": "..." }

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

    // Output the appropriate hosted UI URL based on whether custom domain is used
    const hostedUIUrl = this.customDomainName
      ? `https://${this.customDomainName}`
      : `https://${props.domainPrefix}.auth.${cdk.Stack.of(this).region}.amazoncognito.com`;

    new cdk.CfnOutput(this, 'CognitoHostedUIURL', {
      value: hostedUIUrl,
      description: 'Cognito Hosted UI Base URL',
    });

    // Output custom domain if configured
    if (this.customDomainName) {
      new cdk.CfnOutput(this, 'CognitoCustomDomain', {
        value: this.customDomainName,
        description: 'Cognito Custom Domain',
      });
    }

    new cdk.CfnOutput(this, 'AdminGroupName', {
      value: 'admin',
      description: 'Cognito Admin Group Name',
    });

    new cdk.CfnOutput(this, 'OAuthSecretsReminder', {
      value: `Google OAuth is configured. To add more providers, create secrets in AWS Secrets Manager: aura28/oauth/facebook/${props.environment}, aura28/oauth/apple/${props.environment}`,
      description: 'OAuth Configuration Status',
    });
  }
}
