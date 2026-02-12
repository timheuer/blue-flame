import { getAuth, UserRecord, ListUsersResult } from "firebase-admin/auth";
import type { Auth, CreateRequest, UpdateRequest } from "firebase-admin/auth";
import type { App } from "firebase-admin/app";
import { logger } from "../extension";

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

export class AuthService {
    private readonly auth: Auth;

    constructor(app: App) {
        this.auth = getAuth(app);
    }

    async listUsers(maxResults: number = 25, pageToken?: string): Promise<PagedUsersResult> {
        logger.debug(`Listing users (maxResults: ${maxResults}, pageToken: ${pageToken ? "present" : "none"})`);
        const result: ListUsersResult = await this.auth.listUsers(maxResults, pageToken);
        logger.debug(`Retrieved ${result.users.length} users`);
        return {
            users: result.users.map(toUserInfo),
            pageToken: result.pageToken,
        };
    }

    async getUser(uid: string): Promise<UserInfo> {
        logger.debug(`Getting user by UID: ${uid}`);
        const user = await this.auth.getUser(uid);
        return toUserInfo(user);
    }

    async getUserByEmail(email: string): Promise<UserInfo> {
        logger.debug(`Getting user by email: ${email}`);
        const user = await this.auth.getUserByEmail(email);
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
        const user = await this.auth.createUser(properties as CreateRequest);
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
        const user = await this.auth.updateUser(uid, properties as UpdateRequest);
        logger.info(`User updated: ${uid}`);
        return toUserInfo(user);
    }

    async deleteUser(uid: string): Promise<void> {
        logger.debug(`Deleting user: ${uid}`);
        await this.auth.deleteUser(uid);
        logger.info(`User deleted: ${uid}`);
    }

    async setCustomClaims(uid: string, claims: Record<string, unknown> | null): Promise<void> {
        logger.debug(`Setting custom claims for user: ${uid}`);
        await this.auth.setCustomUserClaims(uid, claims);
        logger.info(`Custom claims updated for user: ${uid}`);
    }

    async revokeRefreshTokens(uid: string): Promise<void> {
        logger.debug(`Revoking refresh tokens for user: ${uid}`);
        await this.auth.revokeRefreshTokens(uid);
        logger.info(`Refresh tokens revoked for user: ${uid}`);
    }
}
