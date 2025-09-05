export interface CognitoConfig {
  userPoolId: string;
  clientId: string;
  domain: string;
  region: string;
  redirectUri: string;
  customDomain?: string;
}

export const getCognitoConfig = (): CognitoConfig => {
  const userPoolId = process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID || '';
  const clientId = process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || '';
  const domain = process.env.NEXT_PUBLIC_COGNITO_DOMAIN || '';
  const region = process.env.NEXT_PUBLIC_COGNITO_REGION || 'us-east-1';
  const customDomain = process.env.NEXT_PUBLIC_COGNITO_CUSTOM_DOMAIN || undefined;

  // During build time, we might not have these values
  if (typeof window !== 'undefined' && (!userPoolId || !clientId || !domain)) {
    throw new Error(
      'Missing required Cognito configuration. Please set NEXT_PUBLIC_COGNITO_USER_POOL_ID, NEXT_PUBLIC_COGNITO_CLIENT_ID, and NEXT_PUBLIC_COGNITO_DOMAIN environment variables.',
    );
  }

  const redirectUri =
    process.env.NEXT_PUBLIC_REDIRECT_URI ||
    (typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : '');

  return {
    userPoolId,
    clientId,
    domain,
    region,
    redirectUri,
    customDomain,
  };
};

export const getCognitoUrls = (config: CognitoConfig) => {
  // Use custom domain if available, otherwise fall back to default Cognito domain
  const baseUrl = config.customDomain
    ? `https://${config.customDomain}`
    : `https://${config.domain}.auth.${config.region}.amazoncognito.com`;

  return {
    login: `${baseUrl}/login?client_id=${config.clientId}&response_type=code&scope=email+openid+profile+aws.cognito.signin.user.admin&redirect_uri=${encodeURIComponent(
      config.redirectUri,
    )}`,
    logout: `${baseUrl}/logout?client_id=${config.clientId}&logout_uri=${encodeURIComponent(
      config.redirectUri.replace('/auth/callback', ''),
    )}`,
    token: `${baseUrl}/oauth2/token`,
  };
};
