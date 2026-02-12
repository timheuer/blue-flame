import * as admin from "firebase-admin";
import * as fs from "fs";
import * as path from "path";
import { Connection } from "../storage/types";
import { GoogleAuthProvider } from "./googleAuthProvider";
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } from "./googleOAuthConstants";
import { logger } from "../extension";

const appCache = new Map<string, admin.app.App>();

let _authProvider: GoogleAuthProvider | undefined;

export function setAuthProvider(provider: GoogleAuthProvider): void {
    _authProvider = provider;
}

export async function getApp(connection: Connection): Promise<admin.app.App> {
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
    } else if (connection.authMode === "googleOAuth" && _authProvider) {
        logger.debug("Using Google OAuth credentials");
        const refreshToken = await _authProvider.getRefreshToken();
        if (!refreshToken) {
            logger.error("No Google OAuth refresh token found");
            throw new Error("No Google OAuth refresh token found. Please sign in again.");
        }
        credential = admin.credential.refreshToken({
            type: "authorized_user",
            client_id: GOOGLE_CLIENT_ID,
            client_secret: GOOGLE_CLIENT_SECRET,
            refresh_token: refreshToken,
        });
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

export async function disposeApp(connectionId: string): Promise<void> {
    const app = appCache.get(connectionId);
    if (app) {
        logger.debug(`Disposing Firebase app: ${connectionId}`);
        await app.delete();
        appCache.delete(connectionId);
        logger.info(`Firebase app disposed: ${connectionId}`);
    }
}

export async function disposeAll(): Promise<void> {
    logger.debug(`Disposing all Firebase apps (count: ${appCache.size})`);
    const promises = Array.from(appCache.entries()).map(async ([id, app]) => {
        await app.delete();
        appCache.delete(id);
    });
    await Promise.all(promises);
    logger.info("All Firebase apps disposed");
}
