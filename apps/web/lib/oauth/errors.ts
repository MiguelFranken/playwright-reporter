/** RFC 6749 error responses: `{ error, error_description }`, never cached. */
export class OAuthProtocolError extends Error {
  constructor(
    public error: string,
    public description: string,
    public status = 400,
  ) {
    super(description);
  }

  toResponse() {
    return Response.json(
      { error: this.error, error_description: this.description },
      {
        status: this.status,
        headers: { 'cache-control': 'no-store', ...(this.status === 401 ? { 'www-authenticate': 'Basic realm="oauth"' } : {}) },
      },
    );
  }
}

export const invalidRequest = (d: string) => new OAuthProtocolError('invalid_request', d);
export const invalidClient = (d: string) => new OAuthProtocolError('invalid_client', d, 401);
export const invalidGrant = (d: string) => new OAuthProtocolError('invalid_grant', d);
