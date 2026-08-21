export type OspUser = {
  subject: string;
  email: string;
  displayName: string;
};

export interface AuthPort {
  initialize(): Promise<void>;
  isAuthenticated(): Promise<boolean>;
  login(returnTo?: string): Promise<void>;
  logout(): Promise<void>;
  getAccessToken(forceRefresh?: boolean): Promise<string>;
  getUser(): Promise<OspUser | null>;
}
