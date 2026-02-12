import { getStorage } from "firebase-admin/storage";
import type { App } from "firebase-admin/app";
import { logger } from "../extension";
import { Connection } from "../storage/types";
import { getAccessToken, isOAuthConnection } from "./adminAppFactory";

const STORAGE_API_URL = "https://storage.googleapis.com/storage/v1";

export interface StorageFileInfo {
    name: string;         // Full path
    displayName: string;  // Just the filename
    size: number;
    contentType: string;
    timeCreated: string;
    updated: string;
    isFolder: boolean;
}

export interface StoragePageResult {
    items: StorageFileInfo[];
    prefixes: string[];   // "folders" returned by delimiter
    nextPageToken?: string;
}

interface CloudStorageObject {
    name: string;
    size?: string;
    contentType?: string;
    timeCreated?: string;
    updated?: string;
    metadata?: Record<string, string>;
}

interface CloudStorageListResponse {
    items?: CloudStorageObject[];
    prefixes?: string[];
    nextPageToken?: string;
}

function getDisplayName(fullPath: string): string {
    const trimmed = fullPath.endsWith("/") ? fullPath.slice(0, -1) : fullPath;
    const parts = trimmed.split("/");
    return parts[parts.length - 1] || trimmed;
}

function cloudObjectToFileInfo(obj: CloudStorageObject): StorageFileInfo {
    return {
        name: obj.name,
        displayName: getDisplayName(obj.name),
        size: obj.size ? parseInt(obj.size, 10) : 0,
        contentType: obj.contentType || "application/octet-stream",
        timeCreated: obj.timeCreated || "",
        updated: obj.updated || "",
        isFolder: false,
    };
}

function prefixToFolderInfo(prefix: string): StorageFileInfo {
    return {
        name: prefix,
        displayName: getDisplayName(prefix),
        size: 0,
        contentType: "application/x-directory",
        timeCreated: "",
        updated: "",
        isFolder: true,
    };
}

export class StorageService {
    private readonly app: App | null;
    private readonly connection: Connection | null;
    private readonly bucketName: string;

    constructor(appOrConnection: App | Connection, bucketName?: string) {
        if ("name" in appOrConnection && "projectId" in appOrConnection && "authMode" in appOrConnection) {
            this.connection = appOrConnection as Connection;
            this.app = null;
            this.bucketName = bucketName || this.getDefaultBucketName(this.connection.projectId);
        } else {
            this.app = appOrConnection as App;
            this.connection = null;
            const projectId = this.app.options.projectId;
            if (!projectId) {
                throw new Error("App must have a projectId configured");
            }
            this.bucketName = bucketName || this.getDefaultBucketName(projectId);
        }
        logger.debug(`StorageService initialized with bucket: ${this.bucketName}`);
    }

    private getDefaultBucketName(projectId: string): string {
        // Firebase Storage default bucket is {projectId}.firebasestorage.app (newer)
        // or {projectId}.appspot.com (legacy)
        // We'll use the newer format by default
        return `${projectId}.firebasestorage.app`;
    }

    getBucketName(): string {
        return this.bucketName;
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

    async listFiles(
        prefix: string = "",
        maxResults: number = 100,
        pageToken?: string
    ): Promise<StoragePageResult> {
        logger.debug(`Listing files in bucket: ${this.bucketName}, prefix: "${prefix}", maxResults: ${maxResults}`);

        if (this.isRestMode()) {
            const url = new URL(`${STORAGE_API_URL}/b/${encodeURIComponent(this.bucketName)}/o`);
            if (prefix) {
                url.searchParams.set("prefix", prefix);
            }
            url.searchParams.set("delimiter", "/");
            url.searchParams.set("maxResults", maxResults.toString());
            if (pageToken) {
                url.searchParams.set("pageToken", pageToken);
            }

            const response = await this.fetchWithAuth(url.toString());
            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Failed to list files: ${error}`);
            }

            const data = await response.json() as CloudStorageListResponse;
            const items = (data.items || []).map(cloudObjectToFileInfo);
            const prefixes = data.prefixes || [];

            logger.debug(`Listed ${items.length} files and ${prefixes.length} prefixes via REST`);
            return {
                items,
                prefixes,
                nextPageToken: data.nextPageToken,
            };
        }

        // Admin SDK mode
        const bucket = getStorage(this.app!).bucket(this.bucketName);
        const [files, , apiResponse] = await bucket.getFiles({
            prefix: prefix || undefined,
            delimiter: "/",
            maxResults,
            pageToken,
            autoPaginate: false,
        });

        const items: StorageFileInfo[] = files.map((file) => ({
            name: file.name,
            displayName: getDisplayName(file.name),
            size: file.metadata.size ? parseInt(String(file.metadata.size), 10) : 0,
            contentType: file.metadata.contentType || "application/octet-stream",
            timeCreated: file.metadata.timeCreated || "",
            updated: file.metadata.updated || "",
            isFolder: false,
        }));

        const prefixes: string[] = (apiResponse as { prefixes?: string[] })?.prefixes || [];
        const nextPageToken = (apiResponse as { nextPageToken?: string })?.nextPageToken;

        logger.debug(`Listed ${items.length} files and ${prefixes.length} prefixes via Admin SDK`);
        return { items, prefixes, nextPageToken };
    }

    async getFileMetadata(filePath: string): Promise<StorageFileInfo> {
        logger.debug(`Getting metadata for file: ${filePath} in bucket: ${this.bucketName}`);

        if (this.isRestMode()) {
            const encodedPath = encodeURIComponent(filePath);
            const url = `${STORAGE_API_URL}/b/${encodeURIComponent(this.bucketName)}/o/${encodedPath}`;

            const response = await this.fetchWithAuth(url);
            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Failed to get file metadata: ${error}`);
            }

            const data = await response.json() as CloudStorageObject;
            logger.debug(`Retrieved metadata for ${filePath} via REST`);
            return cloudObjectToFileInfo(data);
        }

        // Admin SDK mode
        const bucket = getStorage(this.app!).bucket(this.bucketName);
        const file = bucket.file(filePath);
        const [metadata] = await file.getMetadata();

        logger.debug(`Retrieved metadata for ${filePath} via Admin SDK`);
        return {
            name: file.name,
            displayName: getDisplayName(file.name),
            size: metadata.size ? parseInt(String(metadata.size), 10) : 0,
            contentType: metadata.contentType || "application/octet-stream",
            timeCreated: metadata.timeCreated || "",
            updated: metadata.updated || "",
            isFolder: false,
        };
    }

    async deleteFile(filePath: string): Promise<void> {
        logger.debug(`Deleting file: ${filePath} from bucket: ${this.bucketName}`);

        if (this.isRestMode()) {
            const encodedPath = encodeURIComponent(filePath);
            const url = `${STORAGE_API_URL}/b/${encodeURIComponent(this.bucketName)}/o/${encodedPath}`;

            const response = await this.fetchWithAuth(url, { method: "DELETE" });
            if (!response.ok) {
                const error = await response.text();
                throw new Error(`Failed to delete file: ${error}`);
            }

            logger.info(`File deleted via REST: ${filePath}`);
            return;
        }

        // Admin SDK mode
        const bucket = getStorage(this.app!).bucket(this.bucketName);
        await bucket.file(filePath).delete();
        logger.info(`File deleted via Admin SDK: ${filePath}`);
    }

    async getSignedUrl(
        filePath: string,
        expiresInMinutes: number = 60
    ): Promise<string> {
        logger.debug(`Generating signed URL for: ${filePath}, expires in ${expiresInMinutes} minutes`);

        if (this.isRestMode()) {
            // For OAuth mode, we can't generate proper signed URLs without service account private key
            // Instead, return an authenticated download URL that works with the access token
            // The client will need to add the Authorization header when downloading
            const encodedPath = encodeURIComponent(filePath);
            const url = `https://storage.googleapis.com/${encodeURIComponent(this.bucketName)}/${encodedPath}`;
            logger.debug(`Generated direct URL for OAuth mode: ${url}`);
            return url;
        }

        // Admin SDK mode - generate actual signed URL
        const bucket = getStorage(this.app!).bucket(this.bucketName);
        const file = bucket.file(filePath);
        const expiresAt = Date.now() + expiresInMinutes * 60 * 1000;

        const [signedUrl] = await file.getSignedUrl({
            action: "read",
            expires: expiresAt,
        });

        logger.debug(`Generated signed URL for: ${filePath}`);
        return signedUrl;
    }

    async getDownloadUrl(filePath: string): Promise<string> {
        logger.debug(`Getting download URL for: ${filePath}`);

        // For public files, construct the public URL
        const encodedPath = encodeURIComponent(filePath);
        const publicUrl = `https://storage.googleapis.com/${encodeURIComponent(this.bucketName)}/${encodedPath}`;

        if (this.isRestMode()) {
            // For OAuth, return URL with alt=media for direct download
            return `${publicUrl}?alt=media`;
        }

        // For Admin SDK, try to get a signed URL for authenticated access
        try {
            return await this.getSignedUrl(filePath, 60);
        } catch (err) {
            // Fall back to public URL if signed URL generation fails
            logger.warn(`Failed to generate signed URL, using public URL: ${err}`);
            return publicUrl;
        }
    }

    async getPublicUrl(filePath: string): Promise<string> {
        const encodedPath = encodeURIComponent(filePath);
        return `https://storage.googleapis.com/${encodeURIComponent(this.bucketName)}/${encodedPath}`;
    }

    async getAuthenticatedDownloadUrl(filePath: string): Promise<{ url: string; headers?: Record<string, string> }> {
        logger.debug(`Getting authenticated download URL for: ${filePath}`);

        if (this.isRestMode()) {
            const accessToken = await getAccessToken(this.connection!);
            const encodedPath = encodeURIComponent(filePath);
            const url = `https://storage.googleapis.com/${encodeURIComponent(this.bucketName)}/${encodedPath}?alt=media`;
            return {
                url,
                headers: {
                    "Authorization": `Bearer ${accessToken}`,
                },
            };
        }

        // For Admin SDK, use signed URL (no headers needed)
        const signedUrl = await this.getSignedUrl(filePath, 60);
        return { url: signedUrl };
    }

    async copyFileUrl(filePath: string): Promise<string> {
        // Returns the gs:// URL format for Firebase Storage
        return `gs://${this.bucketName}/${filePath}`;
    }

    async fileExists(filePath: string): Promise<boolean> {
        logger.debug(`Checking if file exists: ${filePath}`);

        if (this.isRestMode()) {
            const encodedPath = encodeURIComponent(filePath);
            const url = `${STORAGE_API_URL}/b/${encodeURIComponent(this.bucketName)}/o/${encodedPath}`;

            const response = await this.fetchWithAuth(url);
            return response.ok;
        }

        // Admin SDK mode
        const bucket = getStorage(this.app!).bucket(this.bucketName);
        const [exists] = await bucket.file(filePath).exists();
        return exists;
    }

    async listAllFilesAndFolders(
        prefix: string = "",
        maxResults: number = 100,
        pageToken?: string
    ): Promise<StoragePageResult> {
        const result = await this.listFiles(prefix, maxResults, pageToken);

        // Convert prefixes to folder items and combine with files
        const folders = result.prefixes.map(prefixToFolderInfo);
        const allItems = [...folders, ...result.items];

        return {
            items: allItems,
            prefixes: result.prefixes,
            nextPageToken: result.nextPageToken,
        };
    }
}
