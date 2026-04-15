export interface JwtPayload {
  sub: string;        // user.id
  email: string;
  tenantId?: string;  // active tenant (optional — set after tenant selection)
}
