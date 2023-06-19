export type TokenResponse = {
  token_type: "Bearer";
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope: string;
};
