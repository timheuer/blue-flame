import { getAuth, UserRecord, ListUsersResult } from "firebase-admin/auth";
import type { Auth, CreateRequest, UpdateRequest } from "firebase-admin/auth";
import type { App } from "firebase-admin/app";
import { logger } from "../extension";
import { Connection } from "../storage/types";
import { getAccessToken, isOAuthConnection } from "./adminAppFactory";

const IDENTITY_TOOLKIT_URL = "https://identitytoolkit.googleapis.com/v1";

export interface UserInfo {
    uid: string;
    email?: string;
    emailVerified: boolean;
    displayName?: string;
    photoURL?: string;
    phoneNumber?: string;
    disabled: boolean;
    metadata: {
        creationTime?: string;
        lastSignInTime?: string;
        lastRefreshTime?: string | null;
    };
    providerData: Array<{
        uid: string;
        displayName?: string;
        email?: string;
        phoneNumber?: string;
        photoURL?: string;
        providerId: string;
    }>;
    customClaims?: Record<string, unknown>;
}

export interface PagedUsersResult {
    users: UserInfo[];
    pageToken?: string;
}

function toUserInfo(user: UserRecord): UserInfo {
    return {
        uid: user.uid,
        email: user.email,
        emailVerified: user.emailVerified,
        displayName: user.displayName,
        photoURL: user.photoURL,
        phoneNumber: user.phoneNumber,
        disabled: user.disabled,
        metadata: {
            creationTime: user.metadata.creationTime,
            lastSignInTime: user.metadata.lastSignInTime,
            lastRefreshTime: user.metadata.lastRefreshTime,
        },
        providerData: user.providerData.map((p) => ({
            uid: p.uid,
            displayName: p.displayName,
            email: p.email,
            phoneNumber: p.phoneNumber,
            photoURL: p.photoURL,
            providerId: p.providerId,
        })),
        customClaims: user.customClaims,
    };
}

interface IdentityToolkitUser {
    localId: string;
    email?: string;
    emailVerified?: boolean;
    displayName?: string;
    photoUrl?: string;
    phoneNumber?: string;
    disabled?: boolean;
    createdAt?: string;
    lastLoginAt?: string;
    lastRefreshAt?: string;
    providerUserInfo?: Array<{
        rawId: string;
        displayName?: string;
        email?: string;
        phoneNumber?: string;
        photoUrl?: string;
        providerId: string;
    }>;
    customAttributes?: string;
}

function identityToolkitUserToUserInfo(user: IdentityToolkitUser): UserInfo {
    let customClaims: Record<string, unknown> | undefined;
    if (user.customAttributes) {
        try {
            customClaims = JSON.parse(user.customAttributes);
        } catch {
            customClaims = undefined;
        }
    }

    return {
        uid: user.localId,
        email: user.email,
        emailVerified: user.emailVerified ?? false,
        displayName: user.displayName,
        photoURL: user.photoUrl,
        phoneNumber: user.phoneNumber,
        disabled: user.disabled ?? false,
        metadata: {
            creationTime: user.createdAt ? new Date(parseInt(user.createdAt)).toUTCString() : undefined,
            lastSignInTime: user.lastLoginAt ? new Date(parseInt(user.lastLoginAt)).toUTCString() : undefined,
            lastRefreshTime: user.lastRefreshAt || null,
        },
        providerData: (user.providerUserInfo || []).map((p) => ({
            uid: p.rawId,
            displayName: p.displayName,
            email: p.email,
            phoneNumber: p.phoneNumber,
            photoURL: p.photoUrl,
            providerId: p.providerId,
        })),
        customClaims,
    };
}

export class AuthService {
    private readonly auth: Auth | null;
    private readonly connection: Connection | null;

    constructor(appOrConnection: App | Connection) {
        if ("name" in appOrConnection && "projectId" in appOrConnection && "authMode" in appOrConnection) {
            this.connection = appOrConnection as Connection;
            this.auth = null;
        } else {
            this.auth = getAuth(appOrConnection as App);
            this.connection = null;
        }
    }

    private isRestMode(): boolean {
        return this.connection !== null && isOAuthConnection(this.connection);
    }

    private async fetchWithAuth(url: string, options: RequestInit = {}): Promise<Response> {
        if (!this.connection) {
            throw new Error("Connection required for REST API calls");
        }
        const accessToken = await getAccessToken(this.connection);
        const headers = {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            ...options.headers,
        };
        return fetch(url, { ...options, headers });
    }

    async listUsers(maxResults: number = 25, pageToken?: string): Promise<PagedUsersResult> {
        logger.debug(`Listing users (maxResults: ${maxResults}, pageToken: ${pageToken ? "present" : "none"})`);

        if (this.isRestMode()) {
            const url = new URL(`${IDENTITY_TOOLKIT_URL}/projects/${this.connection!.projectId}/accounts:batchGet`);
            url.searchParams.set("maxResults", maxResults.toString());
            if (pageToken) {
                url.searchParams.set("nextPageToken", pageToken);
            }

            const response = await this.fetchWithAuth(url.toString());
            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Failed to list users: ${error}`);
            }

            const data = await response.json() as { users?: IdentityToolkitUser[]; nextPageToken?: string };
            const users = (data.users || []).map(identityToolkitUserToUserInfo);
            logger.debug(`Retrieved ${users.length} users via REST`);
            return { users, pageToken: data.nextPageToken };
        }

        const result: ListUsersResult = await this.auth!.listUsers(maxResults, pageToken);
        logger.debug(`Retrieved ${result.users.length} users`);
        return {
            users: result.users.map(toUserInfo),
            pageToken: result.pageToken,
        };
    }

    async getUser(uid: string): Promise<UserInfo> {
        logger.debug(`Getting user by UID: ${uid}`);

        if (this.isRestMode()) {
            const url = `${IDENTITY_TOOLKIT_URL}/projects/${this.connection!.projectId}/accounts:lookup`;
            const response = await this.fetchWithAuth(url, {
                method: "POST",
                body: JSON.stringify({ localId: [uid] }),
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Failed to get user: ${error}`);
            }

            const data = await response.json() as { users?: IdentityToolkitUser[] };
            if (!data.users || data.users.length === 0) {
                throw new Error(`User not found: ${uid}`);
            }
            return identityToolkitUserToUserInfo(data.users[0]);
        }

        const user = await this.auth!.getUser(uid);
        return toUserInfo(user);
    }

    async getUserByEmail(email: string): Promise<UserInfo> {
        logger.debug(`Getting user by email: ${email}`);

        if (this.isRestMode()) {
            const url = `${IDENTITY_TOOLKIT_URL}/projects/${this.connection!.projectId}/accounts:lookup`;
            const response = await this.fetchWithAuth(url, {
                method: "POST",
                body: JSON.stringify({ email: [email] }),
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Failed to get user by email: ${error}`);
            }

            const data = await response.json() as { users?: IdentityToolkitUser[] };
            if (!data.users || data.users.length === 0) {
                throw new Error(`User not found: ${email}`);
            }
            return identityToolkitUserToUserInfo(data.users[0]);
        }

        const user = await this.auth!.getUserByEmail(email);
        return toUserInfo(user);
    }

    async createUser(properties: {
        email?: string;
        password?: string;
        displayName?: string;
        phoneNumber?: string;
        photoURL?: string;
        disabled?: boolean;
        emailVerified?: boolean;
    }): Promise<UserInfo> {
        logger.debug("Creating new user");

        if (this.isRestMode()) {
            const url = `${IDENTITY_TOOLKIT_URL}/projects/${this.connection!.projectId}/accounts`;
            const body: Record<string, unknown> = {};
            if (properties.email) { body.email = properties.email; }
            if (properties.password) { body.password = properties.password; }
            if (properties.displayName) { body.displayName = properties.displayName; }
            if (properties.phoneNumber) { body.phoneNumber = properties.phoneNumber; }
            if (properties.photoURL) { body.photoUrl = properties.photoURL; }
            if (properties.disabled !== undefined) { body.disabled = properties.disabled; }
            if (properties.emailVerified !== undefined) { body.emailVerified = properties.emailVerified; }

            const response = await this.fetchWithAuth(url, {
                method: "POST",
                body: JSON.stringify(body),
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Failed to create user: ${error}`);
            }

            const data = await response.json() as IdentityToolkitUser;
            logger.info(`User created: ${data.localId}`);
            return identityToolkitUserToUserInfo(data);
        }

        const user = await this.auth!.createUser(properties as CreateRequest);
        logger.info(`User created: ${user.uid}`);
        return toUserInfo(user);
    }

    async updateUser(
        uid: string,
        properties: {
            email?: string;
            password?: string;
            displayName?: string | null;
            phoneNumber?: string | null;
            photoURL?: string | null;
            disabled?: boolean;
            emailVerified?: boolean;
        }
    ): Promise<UserInfo> {
        logger.debug(`Updating user: ${uid}`);

        if (this.isRestMode()) {
            const url = `${IDENTITY_TOOLKIT_URL}/projects/${this.connection!.projectId}/accounts:update`;
            const body: Record<string, unknown> = { localId: uid };

            const deleteFields: string[] = [];
            if (properties.email !== undefined) { body.email = properties.email; }
            if (properties.password !== undefined) { body.password = properties.password; }
            if (properties.displayName === null) {
                deleteFields.push("DISPLAY_NAME");
            } else if (properties.displayName !== undefined) {
                body.displayName = properties.displayName;
            }
            if (properties.phoneNumber === null) {
                deleteFields.push("PHONE_NUMBER");
            } else if (properties.phoneNumber !== undefined) {
                body.phoneNumber = properties.phoneNumber;
            }
            if (properties.photoURL === null) {
                deleteFields.push("PHOTO_URL");
            } else if (properties.photoURL !== undefined) {
                body.photoUrl = properties.photoURL;
            }
            if (properties.disabled !== undefined) { body.disableUser = properties.disabled; }
            if (properties.emailVerified !== undefined) { body.emailVerified = properties.emailVerified; }
            if (deleteFields.length > 0) { body.deleteAttribute = deleteFields; }

            const response = await this.fetchWithAuth(url, {
                method: "POST",
                body: JSON.stringify(body),
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Failed to update user: ${error}`);
            }

            logger.info(`User updated: ${uid}`);
            return this.getUser(uid);
        }

        const user = await this.auth!.updateUser(uid, properties as UpdateRequest);
        logger.info(`User updated: ${uid}`);
        return toUserInfo(user);
    }

    async deleteUser(uid: string): Promise<void> {
        logger.debug(`Deleting user: ${uid}`);

        if (this.isRestMode()) {
            const url = `${IDENTITY_TOOLKIT_URL}/projects/${this.connection!.projectId}/accounts:delete`;
            const response = await this.fetchWithAuth(url, {
                method: "POST",
                body: JSON.stringify({ localId: uid }),
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Failed to delete user: ${error}`);
            }

            logger.info(`User deleted: ${uid}`);
            return;
        }

        await this.auth!.deleteUser(uid);
        logger.info(`User deleted: ${uid}`);
    }

    async setCustomClaims(uid: string, claims: Record<string, unknown> | null): Promise<void> {
        logger.debug(`Setting custom claims for user: ${uid}`);

        if (this.isRestMode()) {
            const url = `${IDENTITY_TOOLKIT_URL}/projects/${this.connection!.projectId}/accounts:update`;
            const response = await this.fetchWithAuth(url, {
                method: "POST",
                body: JSON.stringify({
                    localId: uid,
                    customAttributes: claims ? JSON.stringify(claims) : "{}",
                }),
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Failed to set custom claims: ${error}`);
            }

            logger.info(`Custom claims updated for user: ${uid}`);
            return;
        }

        await this.auth!.setCustomUserClaims(uid, claims);
        logger.info(`Custom claims updated for user: ${uid}`);
    }

    async revokeRefreshTokens(uid: string): Promise<void> {
        logger.debug(`Revoking refresh tokens for user: ${uid}`);

        if (this.isRestMode()) {
            const url = `${IDENTITY_TOOLKIT_URL}/projects/${this.connection!.projectId}/accounts:update`;
            const response = await this.fetchWithAuth(url, {
                method: "POST",
                body: JSON.stringify({
                    localId: uid,
                    validSince: Math.floor(Date.now() / 1000).toString(),
                }),
            });

            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Failed to revoke tokens: ${error}`);
            }

            logger.info(`Refresh tokens revoked for user: ${uid}`);
            return;
        }

        await this.auth!.revokeRefreshTokens(uid);
        logger.info(`Refresh tokens revoked for user: ${uid}`);
    }
}
