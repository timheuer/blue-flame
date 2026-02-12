import * as admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import * as fs from "fs";
import * as path from "path";
import { Firestore } from "@google-cloud/firestore";
import { OAuth2Client, GoogleAuth } from "google-auth-library";
import { Connection } from "../storage/types";
import { GoogleAuthProvider } from "./googleAuthProvider";
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } from "./googleOAuthConstants";
import { logger } from "../extension";

const appCache = new Map<string, admin.app.App>();
const firestoreCache = new Map<string, Firestore>();
const oauthClientCache = new Map<string, OAuth2Client>();

let _authProvider: GoogleAuthProvider | undefined;

export function setAuthProvider(provider: GoogleAuthProvider): void {
    _authProvider = provider;
}

export function isOAuthConnection(connection: Connection): boolean {
    return connection.authMode === "googleOAuth";
}

async function getOAuthClient(connection: Connection): Promise<OAuth2Client> {
    const cached = oauthClientCache.get(connection.id);
    if (cached) {
        logger.debug(`Using cached OAuth client for connection: ${connection.id}`);
        return cached;
    }

    if (!_authProvider) {
        throw new Error("Google OAuth provider not initialized");
    }

    const refreshToken = await _authProvider.getRefreshToken();
    if (!refreshToken) {
        throw new Error("No Google OAuth refresh token found. Please sign in again.");
    }

    if (!GOOGLE_CLIENT_ID || GOOGLE_CLIENT_ID.length < 10) {
        logger.error("GOOGLE_CLIENT_ID is missing or invalid");
        throw new Error("OAuth Client ID is not configured. Check build configuration.");
    }
    if (!GOOGLE_CLIENT_SECRET || GOOGLE_CLIENT_SECRET.length < 10) {
        logger.error("GOOGLE_CLIENT_SECRET is missing or invalid");
        throw new Error("OAuth Client Secret is not configured. Check build configuration.");
    }

    const client = new OAuth2Client(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
    client.setCredentials({ refresh_token: refreshToken });
    logger.info(`OAuth client created for connection: ${connection.name}`);
    oauthClientCache.set(connection.id, client);
    return client;
}

export async function getAccessToken(connection: Connection): Promise<string> {
    if (!isOAuthConnection(connection)) {
        throw new Error("getAccessToken is only for OAuth connections");
    }
    logger.debug(`Getting access token for connection: ${connection.name}`);
    const client = await getOAuthClient(connection);
    try {
        const tokenResponse = await client.getAccessToken();
        if (!tokenResponse.token) {
            logger.error("getAccessToken returned null token");
            throw new Error("Failed to get access token");
        }
        logger.debug(`Access token obtained, length: ${tokenResponse.token.length}`);
        return tokenResponse.token;
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`Failed to get access token: ${msg}`);
        throw err;
    }
}

export async function getFirestoreClient(connection: Connection): Promise<Firestore> {
    const cacheKey = `${connection.id}:${connection.databaseId}`;
    const cached = firestoreCache.get(cacheKey);
    if (cached) {
        logger.debug(`Using cached Firestore client for connection: ${connection.name}`);
        return cached;
    }

    logger.debug(`Creating Firestore client for connection: ${connection.name} (project: ${connection.projectId}, auth: ${connection.authMode})`);

    let firestore: Firestore;

    if (connection.authMode === "googleOAuth") {
        const oauthClient = await getOAuthClient(connection);
        const authClient = new GoogleAuth({
            authClient: oauthClient,
            projectId: connection.projectId,
        });

        const databaseId = connection.databaseId && connection.databaseId !== "(default)"
            ? connection.databaseId
            : "(default)";

        firestore = new Firestore({
            projectId: connection.projectId,
            databaseId,
            authClient: authClient as unknown as GoogleAuth,
        });
        logger.info(`Firestore client created with OAuth: ${connection.name}`);
    } else {
        const app = await getApp(connection);
        if (connection.databaseId && connection.databaseId !== "(default)") {
            firestore = getFirestore(app, connection.databaseId);
        } else {
            firestore = getFirestore(app);
        }
        logger.info(`Firestore client created via Admin SDK: ${connection.name}`);
    }

    firestoreCache.set(cacheKey, firestore);
    return firestore;
}

export async function getApp(connection: Connection): Promise<admin.app.App> {
    if (connection.authMode === "googleOAuth") {
        throw new Error("Admin SDK App is not available for OAuth connections. Use getFirestoreClient() or getAccessToken() instead.");
    }

    const cached = appCache.get(connection.id);
    if (cached) {
        logger.debug(`Using cached Firebase app for connection: ${connection.name}`);
        return cached;
    }

    logger.debug(`Creating new Firebase app for connection: ${connection.name} (project: ${connection.projectId}, auth: ${connection.authMode})`);

    let credential: admin.credential.Credential;
    if (connection.authMode === "serviceAccountPath" && connection.serviceAccountPath) {
        logger.debug(`Loading service account from: ${connection.serviceAccountPath}`);
        const resolvedPath = path.resolve(connection.serviceAccountPath);
        if (!fs.existsSync(resolvedPath)) {
            logger.error(`Service account file not found: ${resolvedPath}`);
            throw new Error(`Service account file not found: ${resolvedPath}`);
        }
        const raw = fs.readFileSync(resolvedPath, "utf-8");
        const serviceAccount = JSON.parse(raw);
        credential = admin.credential.cert(serviceAccount);
    } else {
        logger.debug("Using Application Default Credentials (ADC)");
        credential = admin.credential.applicationDefault();
    }

    const app = admin.initializeApp(
        {
            credential,
            projectId: connection.projectId,
        },
        connection.id
    );
    appCache.set(connection.id, app);
    logger.info(`Firebase app initialized: ${connection.name} (${connection.projectId})`);
    return app;
}

export async function disposeConnection(connectionId: string): Promise<void> {
    const app = appCache.get(connectionId);
    if (app) {
        logger.debug(`Disposing Firebase app: ${connectionId}`);
        await app.delete();
        appCache.delete(connectionId);
        logger.info(`Firebase app disposed: ${connectionId}`);
    }

    for (const key of firestoreCache.keys()) {
        if (key.startsWith(`${connectionId}:`)) {
            const fs = firestoreCache.get(key);
            if (fs) {
                await fs.terminate();
            }
            firestoreCache.delete(key);
            logger.debug(`Firestore client disposed: ${key}`);
        }
    }

    oauthClientCache.delete(connectionId);
}

export async function disposeAll(): Promise<void> {
    logger.debug(`Disposing all Firebase resources (apps: ${appCache.size}, firestore: ${firestoreCache.size})`);

    const appPromises = Array.from(appCache.entries()).map(async ([id, app]) => {
        await app.delete();
        appCache.delete(id);
    });

    const fsPromises = Array.from(firestoreCache.entries()).map(async ([key, fs]) => {
        await fs.terminate();
        firestoreCache.delete(key);
    });

    await Promise.all([...appPromises, ...fsPromises]);
    oauthClientCache.clear();
    logger.info("All Firebase resources disposed");
}
