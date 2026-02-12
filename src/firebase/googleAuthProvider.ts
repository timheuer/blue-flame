import * as vscode from "vscode";
import * as http from "http";
import * as crypto from "crypto";
import { logger } from "../extension";
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } from "./googleOAuthConstants";

const AUTH_PROVIDER_ID = "blueFlame.googleOAuth";
const AUTH_PROVIDER_LABEL = "Google (Blue Flame)";
const SESSIONS_SECRET_KEY = "blueFlame.googleOAuth.sessions";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";

const DEFAULT_SCOPES = [
    "https://www.googleapis.com/auth/cloud-platform",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "openid",
];

interface StoredSession {
    id: string;
    accessToken: string;
    refreshToken: string;
    account: { id: string; label: string };
    scopes: string[];
}

export class GoogleAuthProvider implements vscode.AuthenticationProvider, vscode.Disposable {
    private readonly _sessionChangeEmitter = new vscode.EventEmitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>();
    readonly onDidChangeSessions = this._sessionChangeEmitter.event;
    private readonly _disposables: vscode.Disposable[] = [];
    private _sessions: vscode.AuthenticationSession[] = [];

    constructor(private readonly context: vscode.ExtensionContext) {
        this._disposables.push(
            vscode.authentication.registerAuthenticationProvider(
                AUTH_PROVIDER_ID,
                AUTH_PROVIDER_LABEL,
                this,
                { supportsMultipleAccounts: false }
            )
        );
    }

    static get providerId(): string {
        return AUTH_PROVIDER_ID;
    }

    static get defaultScopes(): string[] {
        return DEFAULT_SCOPES;
    }

    async getSessions(scopes?: readonly string[]): Promise<vscode.AuthenticationSession[]> {
        if (this._sessions.length === 0) {
            await this._restoreSessions();
        }

        if (!scopes || scopes.length === 0) {
            return this._sessions;
        }

        return this._sessions.filter((session) =>
            scopes.every((scope) => session.scopes.includes(scope))
        );
    }

    async createSession(scopes: readonly string[]): Promise<vscode.AuthenticationSession> {
        const resolvedScopes = scopes.length > 0 ? [...scopes] : [...DEFAULT_SCOPES];
        const { accessToken, refreshToken } = await this._performOAuthFlow(resolvedScopes);
        const userInfo = await this._fetchUserInfo(accessToken);

        const session: vscode.AuthenticationSession = {
            id: crypto.randomUUID(),
            accessToken,
            account: {
                id: userInfo.email,
                label: userInfo.name || userInfo.email,
            },
            scopes: resolvedScopes,
        };

        this._sessions.push(session);
        await this._storeSessions(refreshToken, session);

        this._sessionChangeEmitter.fire({
            added: [session],
            removed: [],
            changed: [],
        });

        logger.info(`Google OAuth session created for ${session.account.label}`);
        return session;
    }

    async removeSession(sessionId: string): Promise<void> {
        const removed = this._sessions.find((s) => s.id === sessionId);
        this._sessions = this._sessions.filter((s) => s.id !== sessionId);
        await this._clearStoredSessions();

        if (removed) {
            this._sessionChangeEmitter.fire({
                added: [],
                removed: [removed],
                changed: [],
            });
            logger.info(`Google OAuth session removed for ${removed.account.label}`);
        }
    }

    async getRefreshToken(): Promise<string | undefined> {
        const raw = await this.context.secrets.get(SESSIONS_SECRET_KEY);
        if (!raw) { return undefined; }
        try {
            const stored: StoredSession = JSON.parse(raw);
            return stored.refreshToken;
        } catch {
            return undefined;
        }
    }

    private async _performOAuthFlow(scopes: string[]): Promise<{ accessToken: string; refreshToken: string }> {
        const { port, redirectUri, serverPromise } = await this._startCallbackServer();
        const state = crypto.randomUUID();
        const codeVerifier = crypto.randomBytes(32).toString("base64url");
        const codeChallenge = crypto
            .createHash("sha256")
            .update(codeVerifier)
            .digest("base64url");

        const authUrl = new URL(AUTH_URL);
        authUrl.searchParams.set("client_id", GOOGLE_CLIENT_ID);
        authUrl.searchParams.set("redirect_uri", redirectUri);
        authUrl.searchParams.set("response_type", "code");
        authUrl.searchParams.set("scope", scopes.join(" "));
        authUrl.searchParams.set("access_type", "offline");
        authUrl.searchParams.set("prompt", "consent");
        authUrl.searchParams.set("state", state);
        authUrl.searchParams.set("code_challenge", codeChallenge);
        authUrl.searchParams.set("code_challenge_method", "S256");

        await vscode.env.openExternal(vscode.Uri.parse(authUrl.toString()));

        const code = await serverPromise;

        const tokenResponse = await fetch(TOKEN_URL, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                code,
                client_id: GOOGLE_CLIENT_ID,
                client_secret: GOOGLE_CLIENT_SECRET,
                redirect_uri: redirectUri,
                grant_type: "authorization_code",
                code_verifier: codeVerifier,
            }),
        });

        if (!tokenResponse.ok) {
            const errorText = await tokenResponse.text();
            throw new Error(`Token exchange failed: ${errorText}`);
        }

        const tokens = (await tokenResponse.json()) as {
            access_token: string;
            refresh_token?: string;
        };

        if (!tokens.refresh_token) {
            throw new Error("No refresh token received. Ensure access_type=offline and prompt=consent are set.");
        }

        return { accessToken: tokens.access_token, refreshToken: tokens.refresh_token };
    }

    private _startCallbackServer(): Promise<{ port: number; redirectUri: string; serverPromise: Promise<string> }> {
        return new Promise((resolveSetup) => {
            const server = http.createServer();
            server.listen(0, "127.0.0.1", () => {
                const addr = server.address();
                const port = typeof addr === "object" && addr ? addr.port : 0;
                const redirectUri = `http://127.0.0.1:${port}/callback`;

                const serverPromise = new Promise<string>((resolveCode, rejectCode) => {
                    const timeout = setTimeout(() => {
                        server.close();
                        rejectCode(new Error("OAuth callback timed out after 120 seconds"));
                    }, 120_000);

                    server.on("request", (req, res) => {
                        const url = new URL(req.url || "", `http://127.0.0.1:${port}`);
                        if (url.pathname === "/callback") {
                            const code = url.searchParams.get("code");
                            const error = url.searchParams.get("error");

                            res.writeHead(200, { "Content-Type": "text/html" });
                            if (code) {
                                res.end("<html><body><h2>Authentication successful!</h2><p>You can close this window and return to VS Code.</p></body></html>");
                                clearTimeout(timeout);
                                server.close();
                                resolveCode(code);
                            } else {
                                res.end("<html><body><h2>Authentication failed</h2><p>Please try again.</p></body></html>");
                                clearTimeout(timeout);
                                server.close();
                                rejectCode(new Error(`OAuth error: ${error || "unknown"}`));
                            }
                        }
                    });
                });

                resolveSetup({ port, redirectUri, serverPromise });
            });
        });
    }

    private async _fetchUserInfo(accessToken: string): Promise<{ email: string; name?: string }> {
        const response = await fetch(USERINFO_URL, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (!response.ok) {
            throw new Error(`Failed to fetch user info: ${response.statusText}`);
        }
        return (await response.json()) as { email: string; name?: string };
    }

    private async _storeSessions(refreshToken: string, session: vscode.AuthenticationSession): Promise<void> {
        const stored: StoredSession = {
            id: session.id,
            accessToken: session.accessToken,
            refreshToken,
            account: session.account,
            scopes: [...session.scopes],
        };
        await this.context.secrets.store(SESSIONS_SECRET_KEY, JSON.stringify(stored));
    }

    private async _restoreSessions(): Promise<void> {
        const raw = await this.context.secrets.get(SESSIONS_SECRET_KEY);
        if (!raw) { return; }
        try {
            const stored: StoredSession = JSON.parse(raw);
            this._sessions = [{
                id: stored.id,
                accessToken: stored.accessToken,
                account: stored.account,
                scopes: stored.scopes,
            }];
        } catch {
            await this._clearStoredSessions();
        }
    }

    private async _clearStoredSessions(): Promise<void> {
        await this.context.secrets.delete(SESSIONS_SECRET_KEY);
    }

    dispose(): void {
        this._disposables.forEach((d) => d.dispose());
        this._sessionChangeEmitter.dispose();
    }
}
