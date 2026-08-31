export type OspAuthorizationIdentity = {
  issuer: string;
  authorizedParty: string;
  subject: string;
  organization: string;
  email: string;
  emailVerified: true;
};

export type OspDisplayProfile = {
  displayName: string;
};

export type BoundSession = {
  identity: OspAuthorizationIdentity;
  generation: string;
  approvalSessionIssuedAt?: string;
};

export interface AuthPort {
  initialize(): Promise<BoundSession | null>;
  revalidate(reason: 'focus' | 'visible' | 'cross-tab' | 'refresh'): Promise<BoundSession | null>;
  subscribe(listener: () => void): () => void;
  getCurrentSession(): BoundSession | null;
  login(returnTo: string, email?: string): Promise<void>;
  logout(): Promise<void>;
  getAccessToken(expected: BoundSession, forceRefresh?: boolean): Promise<string>;
}

export interface ManagedAuthPort extends AuthPort {
  activate(): void | Promise<void>;
  deactivate(): void;
}
