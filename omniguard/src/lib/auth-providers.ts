/**
 * OmniGuard Authentication Providers
 * Supports: Okta, Microsoft Entra, Google Workspace, GitHub, Auth0, Generic OIDC/SAML
 * Features: OIDC, OAuth2, SAML, SCIM, JIT Provisioning, SSO, Role/Group Sync
 */

export interface AuthProvider {
  id: string
  name: string
  type: 'oidc' | 'saml' | 'oauth2'
  config: ProviderConfig
  enabled: boolean
}

export interface ProviderConfig {
  // OIDC/OAuth2
  clientId?: string
  clientSecret?: string
  authorizationUrl?: string
  tokenUrl?: string
  userInfoUrl?: string
  jwksUrl?: string
  issuer?: string
  scopes?: string[]

  // SAML
  entityId?: string
  ssoUrl?: string
  sloUrl?: string
  certificate?: string

  // Common
  redirectUri?: string
  postLogoutRedirectUri?: string

  // Advanced
  enableProvisioning?: boolean
  enableJit?: boolean
  enableGroupSync?: boolean
  defaultRole?: string
  groupsClaim?: string
  emailClaim?: string
  nameClaim?: string
}

export interface SSOConfig {
  provider: string
  domain?: string
  tenantId?: string
}

// Provider definitions
export const AUTH_PROVIDERS: Record<string, AuthProvider> = {
  okta: {
    id: 'okta',
    name: 'Okta',
    type: 'oidc',
    enabled: true,
    config: {
      authorizationUrl: 'https://{domain}/oauth2/v1/authorize',
      tokenUrl: 'https://{domain}/oauth2/v1/token',
      userInfoUrl: 'https://{domain}/oauth2/v1/userinfo',
      jwksUrl: 'https://{domain}/oauth2/v1/keys',
      issuer: 'https://{domain}',
      scopes: ['openid', 'profile', 'email', 'groups'],
      groupsClaim: 'groups',
      emailClaim: 'email',
      nameClaim: 'name',
      enableProvisioning: true,
      enableJit: true,
      enableGroupSync: true,
      defaultRole: 'member',
    },
  },

  entra: {
    id: 'entra',
    name: 'Microsoft Entra ID',
    type: 'oidc',
    enabled: true,
    config: {
      authorizationUrl: 'https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/authorize',
      tokenUrl: 'https://login.microsoftonline.com/{tenantId}/oauth2/v2.0/token',
      userInfoUrl: 'https://graph.microsoft.com/v1.0/me',
      jwksUrl: 'https://login.microsoftonline.com/{tenantId}/discovery/v2.0/keys',
      issuer: 'https://login.microsoftonline.com/{tenantId}/v2.0',
      scopes: ['openid', 'profile', 'email', 'User.Read', 'GroupMember.Read.All'],
      groupsClaim: 'groups',
      emailClaim: 'email',
      nameClaim: 'name',
      enableProvisioning: true,
      enableJit: true,
      enableGroupSync: true,
      defaultRole: 'member',
    },
  },

  google: {
    id: 'google',
    name: 'Google Workspace',
    type: 'oidc',
    enabled: true,
    config: {
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      userInfoUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
      jwksUrl: 'https://www.googleapis.com/oauth2/v3/certs',
      issuer: 'https://accounts.google.com',
      scopes: ['openid', 'profile', 'email'],
      emailClaim: 'email',
      nameClaim: 'name',
      enableJit: true,
      defaultRole: 'member',
    },
  },

  github: {
    id: 'github',
    name: 'GitHub',
    type: 'oauth2',
    enabled: true,
    config: {
      authorizationUrl: 'https://github.com/login/oauth/authorize',
      tokenUrl: 'https://github.com/login/oauth/access_token',
      userInfoUrl: 'https://api.github.com/user',
      scopes: ['read:user', 'user:email', 'repo'],
      emailClaim: 'email',
      nameClaim: 'name',
      enableJit: true,
      defaultRole: 'member',
    },
  },

  gitlab: {
    id: 'gitlab',
    name: 'GitLab',
    type: 'oidc',
    enabled: true,
    config: {
      authorizationUrl: 'https://gitlab.com/oauth/authorize',
      tokenUrl: 'https://gitlab.com/oauth/token',
      userInfoUrl: 'https://gitlab.com/api/v4/user',
      scopes: ['openid', 'profile', 'email', 'api'],
      emailClaim: 'email',
      nameClaim: 'name',
      enableJit: true,
      defaultRole: 'member',
    },
  },

  auth0: {
    id: 'auth0',
    name: 'Auth0',
    type: 'oidc',
    enabled: true,
    config: {
      authorizationUrl: 'https://{domain}/authorize',
      tokenUrl: 'https://{domain}/oauth/token',
      userInfoUrl: 'https://{domain}/userinfo',
      jwksUrl: 'https://{domain}/.well-known/jwks.json',
      issuer: 'https://{domain}',
      scopes: ['openid', 'profile', 'email'],
      groupsClaim: 'https://omniguard.io/groups',
      emailClaim: 'email',
      nameClaim: 'name',
      enableJit: true,
      enableGroupSync: true,
      defaultRole: 'member',
    },
  },

  saml: {
    id: 'saml',
    name: 'SAML 2.0',
    type: 'saml',
    enabled: true,
    config: {
      entityId: 'https://omniguard.io/saml/metadata',
      ssoUrl: '',
      sloUrl: '',
      certificate: '',
      enableJit: true,
      defaultRole: 'member',
    },
  },
}

/**
 * Generate OIDC authorization URL
 */
export function generateAuthorizationUrl(
  provider: AuthProvider,
  config: SSOConfig,
  clientId: string,
  redirectUri: string,
  state: string,
  codeChallenge?: string
): string {
  const providerConfig = provider.config
  let authUrl = providerConfig.authorizationUrl || ''

  // Replace placeholders
  authUrl = authUrl.replace('{domain}', config.domain || '')
  authUrl = authUrl.replace('{tenantId}', config.tenantId || '')

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: (providerConfig.scopes || ['openid', 'profile', 'email']).join(' '),
    state,
  })

  if (codeChallenge) {
    params.append('code_challenge', codeChallenge)
    params.append('code_challenge_method', 'S256')
  }

  // Provider-specific params
  if (provider.id === 'okta') {
    params.append('response_mode', 'query')
  }

  return `${authUrl}?${params.toString()}`
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(
  provider: AuthProvider,
  config: SSOConfig,
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string,
  codeVerifier?: string
): Promise<{ accessToken: string; idToken?: string; refreshToken?: string; expiresIn: number }> {
  const providerConfig = provider.config
  let tokenUrl = providerConfig.tokenUrl || ''

  // Replace placeholders
  tokenUrl = tokenUrl.replace('{domain}', config.domain || '')
  tokenUrl = tokenUrl.replace('{tenantId}', config.tenantId || '')

  const body: Record<string, string> = {
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  }

  if (codeVerifier) {
    body.code_verifier = codeVerifier
  }

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: new URLSearchParams(body).toString(),
  })

  if (!response.ok) {
    throw new Error(`Token exchange failed: ${response.status}`)
  }

  const data = await response.json()

  return {
    accessToken: data.access_token,
    idToken: data.id_token,
    refreshToken: data.refresh_token,
    expiresIn: data.expires_in,
  }
}

/**
 * Fetch user info from provider
 */
export async function fetchUserInfo(
  provider: AuthProvider,
  config: SSOConfig,
  accessToken: string
): Promise<{
  id: string
  email: string
  name?: string
  firstName?: string
  lastName?: string
  picture?: string
  groups?: string[]
  raw: Record<string, any>
}> {
  const providerConfig = provider.config
  let userInfoUrl = providerConfig.userInfoUrl || ''

  // Replace placeholders
  userInfoUrl = userInfoUrl.replace('{domain}', config.domain || '')
  userInfoUrl = userInfoUrl.replace('{tenantId}', config.tenantId || '')

  const headers: Record<string, string> = {
    'Authorization': `Bearer ${accessToken}`,
    'Accept': 'application/json',
  }

  // GitHub needs specific Accept header
  if (provider.id === 'github') {
    headers['Accept'] = 'application/vnd.github.v3+json'
  }

  // Microsoft Graph needs different endpoint
  if (provider.id === 'entra') {
    userInfoUrl = 'https://graph.microsoft.com/v1.0/me'
  }

  const response = await fetch(userInfoUrl, { headers })

  if (!response.ok) {
    throw new Error(`User info fetch failed: ${response.status}`)
  }

  const data = await response.json()

  // Normalize user info across providers
  const email = data[providerConfig.emailClaim || 'email'] || data.email || data.mail || ''
  const name = data[providerConfig.nameClaim || 'name'] || data.name || data.displayName || ''
  const groups = data[providerConfig.groupsClaim || 'groups'] || []

  let firstName, lastName
  if (data.given_name) {
    firstName = data.given_name
    lastName = data.family_name
  } else if (data.first_name) {
    firstName = data.first_name
    lastName = data.last_name
  } else {
    const parts = (name || '').split(' ')
    firstName = parts[0] || ''
    lastName = parts.slice(1).join(' ') || ''
  }

  // GitHub specific: fetch email separately if not in user data
  let finalEmail = email
  if (provider.id === 'github' && !email) {
    const emailResponse = await fetch('https://api.github.com/user/emails', { headers })
    if (emailResponse.ok) {
      const emails = await emailResponse.json()
      const primary = emails.find((e: any) => e.primary)
      finalEmail = primary?.email || emails[0]?.email || ''
    }
  }

  return {
    id: data.sub || data.id || data.login || '',
    email: finalEmail,
    name,
    firstName,
    lastName,
    picture: data.picture || data.avatar_url || '',
    groups: Array.isArray(groups) ? groups : [],
    raw: data,
  }
}

/**
 * PKCE helpers for CLI/desktop apps
 */
export function generateCodeVerifier(): string {
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  return base64UrlEncode(array)
}

export function generateCodeChallenge(verifier: string): string {
  const encoder = new TextEncoder()
  const data = encoder.encode(verifier)
  const hash = crypto.subtle.digestSync('SHA-256', data)
  return base64UrlEncode(new Uint8Array(hash))
}

function base64UrlEncode(array: Uint8Array): string {
  let str = ''
  for (const byte of array) {
    str += String.fromCharCode(byte)
  }
  return btoa(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

/**
 * Generate random state for CSRF protection
 */
export function generateState(): string {
  const array = new Uint8Array(16)
  crypto.getRandomValues(array)
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('')
}

/**
 * SCIM 2.0 user schema for provisioning
 */
export interface SCIMUser {
  schemas: ['urn:ietf:params:scim:schemas:core:2.0:User']
  id?: string
  externalId?: string
  userName: string
  name?: {
    givenName?: string
    familyName?: string
    formatted?: string
  }
  displayName?: string
  emails: Array<{
    value: string
    type?: string
    primary?: boolean
  }>
  active: boolean
  groups?: Array<{
    value: string
    display: string
    type?: string
  }>
  meta?: {
    resourceType: 'User'
    created?: string
    lastModified?: string
  }
}

/**
 * Convert user info to SCIM format
 */
export function toSCIMUser(userInfo: Awaited<ReturnType<typeof fetchUserInfo>>): SCIMUser {
  return {
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
    userName: userInfo.email,
    name: {
      givenName: userInfo.firstName,
      familyName: userInfo.lastName,
      formatted: userInfo.name,
    },
    displayName: userInfo.name,
    emails: [{
      value: userInfo.email,
      type: 'work',
      primary: true,
    }],
    active: true,
  }
}

/**
 * Device authorization flow (for CLI)
 */
export async function startDeviceFlow(
  provider: AuthProvider,
  config: SSOConfig,
  clientId: string
): Promise<{ deviceCode: string; userCode: string; verificationUri: string; expiresIn: number; interval: number }> {
  // Okta and Auth0 support device authorization
  let deviceUrl = ''

  if (provider.id === 'okta') {
    deviceUrl = `https://${config.domain}/oauth2/v1/device/authorize`
  } else if (provider.id === 'auth0') {
    deviceUrl = `https://${config.domain}/oauth/device/code`
  } else {
    throw new Error('Device flow not supported for this provider')
  }

  const response = await fetch(deviceUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      client_id: clientId,
      scope: (provider.config.scopes || ['openid']).join(' '),
    }).toString(),
  })

  if (!response.ok) {
    throw new Error('Device flow start failed')
  }

  return response.json()
}

/**
 * Poll for device authorization
 */
export async function pollDeviceToken(
  provider: AuthProvider,
  config: SSOConfig,
  clientId: string,
  deviceCode: string
): Promise<{ accessToken: string; idToken?: string } | null> {
  let tokenUrl = ''

  if (provider.id === 'okta') {
    tokenUrl = `https://${config.domain}/oauth2/v1/token`
  } else if (provider.id === 'auth0') {
    tokenUrl = `https://${config.domain}/oauth/token`
  } else {
    throw new Error('Device flow not supported')
  }

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      client_id: clientId,
      device_code: deviceCode,
    }).toString(),
  })

  if (response.status === 400) {
    const data = await response.json()
    if (data.error === 'authorization_pending') {
      return null
    }
    throw new Error(data.error_description || 'Authorization failed')
  }

  if (!response.ok) {
    throw new Error('Token request failed')
  }

  const data = await response.json()
  return {
    accessToken: data.access_token,
    idToken: data.id_token,
  }
}
