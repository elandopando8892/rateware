import createKindeClient, { type KindeClient } from '@kinde-oss/kinde-auth-pkce-js';
import { authRedirectUri, type RuntimeConfig } from '../config/runtime';
import { type AuthPort, type OspUser } from './auth-port';

function displayNameFor(email: string, givenName: string | undefined, familyName: string | undefined): string {
  return [givenName, familyName].filter(Boolean).join(' ') || email;
}

export function createKindeAuthPort(config: RuntimeConfig): AuthPort {
  let clientPromise: Promise<KindeClient> | undefined;

  function getClient(): Promise<KindeClient> {
    clientPromise ??= createKindeClient({
      domain: config.VITE_KINDE_DOMAIN,
      client_id: config.VITE_KINDE_CLIENT_ID,
      redirect_uri: authRedirectUri(window.location.origin),
      logout_uri: authRedirectUri(window.location.origin),
      is_dangerously_use_local_storage: false,
    });
    return clientPromise;
  }

  return {
    async initialize() {
      await getClient();
    },
    async isAuthenticated() {
      return (await getClient()).isAuthenticated();
    },
    async login(returnTo) {
      const client = await getClient();
      if (returnTo) {
        await client.login({ app_state: { returnTo } });
        return;
      }
      await client.login();
    },
    async logout() {
      await (await getClient()).logout();
    },
    async getAccessToken(forceRefresh) {
      const client = await getClient();
      const token = forceRefresh
        ? (await client.getToken({ isForceRefresh: true })) ?? (await client.getAccessToken())
        : await client.getAccessToken();
      if (!token) {
        throw new Error('No access token is available for this session.');
      }
      return token;
    },
    async getUser(): Promise<OspUser | null> {
      const client = await getClient();
      const user = (await client.getUserProfile()) ?? client.getUser();
      if (!user.id) {
        throw new Error('Kinde user profile is missing a subject.');
      }
      if (!user.email || client.getClaim('email_verified', 'id_token')?.value !== true) {
        throw new Error('Kinde user profile is missing a verified email.');
      }
      return {
        subject: user.id,
        email: user.email,
        displayName: displayNameFor(user.email, user.given_name, user.family_name),
      };
    },
  };
}
