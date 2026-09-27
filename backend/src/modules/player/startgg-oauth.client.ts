const STARTGG_AUTHORIZE_URL = "https://start.gg/oauth/authorize";
const STARTGG_ACCESS_TOKEN_URL = "https://api.start.gg/oauth/access_token";
const STARTGG_REFRESH_TOKEN_URL = "https://api.start.gg/oauth/refresh";
const STARTGG_GRAPHQL_URL = "https://api.start.gg/gql/alpha";

export interface StartggOAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  scope: string;
  tokenType: string;
}

export interface StartggCurrentUserIdentity {
  userId: string;
  playerId?: string;
  gamerTag: string;
  displayName: string;
}

export interface StartggEntrantLookupResult {
  entrantId?: string;
  entrantName?: string;
}

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope?: string;
  token_type: string;
};

type CurrentUserResponse = {
  currentUser?: {
    id?: string | number | null;
    slug?: string | null;
    discriminator?: string | null;
    player?: {
      id?: string | number | null;
      gamerTag?: string | null;
      prefix?: string | null;
    } | null;
  } | null;
};

type EventEntrantsResponse = {
  event?: {
    entrants?: {
      pageInfo?: {
        totalPages?: number | null;
      } | null;
      nodes?: Array<{
        id?: string | number | null;
        name?: string | null;
        participants?: Array<{
          gamerTag?: string | null;
          player?: {
            id?: string | number | null;
          } | null;
        }> | null;
      }> | null;
    } | null;
  } | null;
};

export class StartggOAuthClient {
  constructor(
    private readonly clientId: string | undefined,
    private readonly clientSecret: string | undefined,
    private readonly scope = "user.identity",
  ) {}

  createAuthorizationUrl(redirectUri: string, state: string): string {
    this.ensureOAuthConfigured();
    const url = new URL(STARTGG_AUTHORIZE_URL);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("client_id", this.clientId!);
    url.searchParams.set("scope", this.scope);
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    return url.toString();
  }

  async exchangeAuthorizationCode(code: string, redirectUri: string): Promise<StartggOAuthTokens> {
    this.ensureOAuthConfigured();
    const response = await fetch(STARTGG_ACCESS_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        grant_type: "authorization_code",
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code,
        redirect_uri: redirectUri,
        scope: this.scope,
      }),
    });
    if (!response.ok) {
      throw new Error(`start.gg OAuth exchange failed (${response.status})`);
    }
    const payload = await response.json() as TokenResponse;
    return {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token,
      expiresIn: payload.expires_in,
      scope: payload.scope ?? this.scope,
      tokenType: payload.token_type,
    };
  }

  async refreshAccessToken(refreshToken: string, redirectUri: string): Promise<StartggOAuthTokens> {
    this.ensureOAuthConfigured();
    const response = await fetch(STARTGG_REFRESH_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: this.clientId,
        client_secret: this.clientSecret,
        redirect_uri: redirectUri,
        scope: this.scope,
      }),
    });
    if (!response.ok) {
      throw new Error(`start.gg OAuth refresh failed (${response.status})`);
    }
    const payload = await response.json() as TokenResponse;
    return {
      accessToken: payload.access_token,
      refreshToken: payload.refresh_token,
      expiresIn: payload.expires_in,
      scope: payload.scope ?? this.scope,
      tokenType: payload.token_type,
    };
  }

  async fetchCurrentUserIdentity(accessToken: string): Promise<StartggCurrentUserIdentity> {
    const response = await this.graphql<CurrentUserResponse>(
      accessToken,
      `
        query CurrentUserIdentity {
          currentUser {
            id
            slug
            discriminator
            player {
              id
              gamerTag
              prefix
            }
          }
        }
      `,
    );

    const userId = response.currentUser?.id != null ? String(response.currentUser.id) : undefined;
    const gamerTag = response.currentUser?.player?.gamerTag?.trim()
      || response.currentUser?.slug?.trim()
      || response.currentUser?.discriminator?.trim();
    if (!userId || !gamerTag) {
      throw new Error("Unable to resolve the current start.gg user identity");
    }

    const prefix = response.currentUser?.player?.prefix?.trim();
    const displayName = prefix ? `${prefix} | ${gamerTag}` : gamerTag;
    return {
      userId,
      playerId: response.currentUser?.player?.id != null ? String(response.currentUser.player.id) : undefined,
      gamerTag,
      displayName,
    };
  }

  async findEntrantForEvent(
    accessToken: string,
    eventId: string,
    identity: StartggCurrentUserIdentity,
  ): Promise<StartggEntrantLookupResult> {
    // Nicknames are mutable and are not unique, including within the same event.
    if (!identity.playerId) return {};
    const perPage = 128;
    let page = 1;
    let totalPages = 1;
    while (page <= totalPages) {
      const response = await this.graphql<EventEntrantsResponse>(
        accessToken,
        `
          query EventEntrants($eventId: ID!, $page: Int!, $perPage: Int!) {
            event(id: $eventId) {
              entrants(query: { page: $page, perPage: $perPage }) {
                pageInfo {
                  totalPages
                }
                nodes {
                  id
                  name
                  participants {
                    gamerTag
                    player {
                      id
                    }
                  }
                }
              }
            }
          }
        `,
        {
          eventId,
          page,
          perPage,
        },
      );

      totalPages = response.event?.entrants?.pageInfo?.totalPages ?? page;
      const nodes = response.event?.entrants?.nodes ?? [];
      for (const node of nodes) {
        const participants = node.participants ?? [];
        const hasPlayerId = identity.playerId
          ? participants.some((participant) => participant.player?.id != null && String(participant.player.id) === identity.playerId)
          : false;
        if (hasPlayerId) {
          return {
            entrantId: node.id != null ? String(node.id) : undefined,
            entrantName: node.name ?? undefined,
          };
        }
      }

      page += 1;
    }

    return {};
  }

  private ensureOAuthConfigured(): void {
    if (!this.clientId || !this.clientSecret) {
      throw new Error("STARTGG_OAUTH_CLIENT_ID and STARTGG_OAUTH_CLIENT_SECRET are required");
    }
  }

  private async graphql<T>(accessToken: string, query: string, variables?: Record<string, unknown>): Promise<T> {
    const response = await fetch(STARTGG_GRAPHQL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ query, variables }),
    });
    if (!response.ok) {
      throw new Error(`start.gg GraphQL request failed (${response.status})`);
    }
    const payload = await response.json() as { data?: T; errors?: Array<{ message?: string }> };
    if (payload.errors?.length) {
      throw new Error(payload.errors.map((item) => item.message).filter(Boolean).join("; ") || "start.gg GraphQL error");
    }
    if (!payload.data) {
      throw new Error("start.gg GraphQL response did not include data");
    }
    return payload.data;
  }
}
