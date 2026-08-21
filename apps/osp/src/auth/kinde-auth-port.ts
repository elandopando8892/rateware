import createKindeClient, { type KindeClient } from '@kinde-oss/kinde-auth-pkce-js';
import { authRedirectUri, type RuntimeConfig } from '../config/runtime';
import { type AuthPort, type OspUser } from './auth-port';

const authErrorCodes = {
  initialization: 'AUTH_INITIALIZATION_FAILED',
  session: 'AUTH_SESSION_CHECK_FAILED',
  login: 'AUTH_LOGIN_FAILED',
  logout: 'AUTH_LOGOUT_FAILED',
  token: 'AUTH_TOKEN_UNAVAILABLE',
  profile: 'AUTH_PROFILE_UNAVAILABLE',
} as const;

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

  async function invoke<T>(
    code: (typeof authErrorCodes)[keyof typeof authErrorCodes],
    operation: (client: KindeClient) => Promise<T>,
  ): Promise<T> {
    try {
      return await operation(await getClient());
    } catch {
      throw new Error(code);
    }
  }

  return {
    async initialize() {
      await invoke(authErrorCodes.initialization, async () => undefined);
    },
    async isAuthenticated() {
      return invoke(authErrorCodes.session, async (client) => client.isAuthenticated());
    },
    async login(returnTo) {
      await invoke(authErrorCodes.login, async (client) => {
        if (returnTo) {
          await client.login({ app_state: { returnTo } });
          return;
        }
        await client.login();
      });
    },
    async logout() {
      await invoke(authErrorCodes.logout, async (client) => client.logout());
    },
    async getAccessToken(forceRefresh) {
      return invoke(authErrorCodes.token, async (client) => {
        const token = forceRefresh
          ? await client.getToken({ isForceRefresh: true })
          : await client.getAccessToken();
        if (!token) {
          throw new Error(authErrorCodes.token);
        }
        return token;
      });
    },
    async getUser(): Promise<OspUser | null> {
      return invoke(authErrorCodes.profile, async (client) => {
        const user = (await client.getUserProfile()) ?? client.getUser();
        const verifiedEmail = client.getClaim('email', 'id_token')?.value;
        if (
          !user.id ||
          !user.email ||
          client.getClaim('email_verified', 'id_token')?.value !== true ||
          typeof verifiedEmail !== 'string' ||
          verifiedEmail.toLowerCase() !== user.email.toLowerCase()
        ) {
          throw new Error(authErrorCodes.profile);
        }
        return {
          subject: user.id,
          email: user.email,
          displayName: displayNameFor(user.email, user.given_name, user.family_name),
        };
      });
    },
  };
}
