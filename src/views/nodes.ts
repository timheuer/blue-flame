import * as vscode from "vscode";
import { Connection } from "../storage/types";

export abstract class BaseNode extends vscode.TreeItem {
    abstract getChildren(): Promise<BaseNode[]>;
}

export class ConnectionNode extends BaseNode {
    constructor(public readonly connection: Connection) {
        super(connection.name, vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = "connection";
        this.tooltip = `${connection.projectId} (${connection.databaseId})`;
        this.iconPath = new vscode.ThemeIcon("plug");
    }

    async getChildren(): Promise<BaseNode[]> {
        return [
            new FirestoreGroupNode(this.connection),
            new AuthGroupNode(this.connection),
            new StorageGroupNode(this.connection),
        ];
    }
}

export class FirestoreGroupNode extends BaseNode {
    constructor(public readonly connection: Connection) {
        super("Firestore", vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = "firestoreGroup";
        this.iconPath = new vscode.ThemeIcon("database");
    }

    async getChildren(): Promise<BaseNode[]> {
        return [];
    }
}

export class AuthGroupNode extends BaseNode {
    constructor(public readonly connection: Connection) {
        super("Authentication", vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = "authGroup";
        this.iconPath = new vscode.ThemeIcon("shield");
    }

    async getChildren(): Promise<BaseNode[]> {
        return [];
    }
}

export class StorageGroupNode extends BaseNode {
    constructor(
        public readonly connection: Connection,
        public readonly bucketName?: string
    ) {
        super("Storage", vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = "storageGroup";
        this.iconPath = new vscode.ThemeIcon("archive");
        this.tooltip = bucketName || `${connection.projectId}.firebasestorage.app`;
    }

    async getChildren(): Promise<BaseNode[]> {
        return [];
    }
}

export class StorageFolderNode extends BaseNode {
    constructor(
        public readonly connection: Connection,
        public readonly folderPath: string,
        public readonly folderName: string,
        public readonly bucketName: string
    ) {
        super(folderName, vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = "storageFolder";
        this.tooltip = `gs://${bucketName}/${folderPath}`;
        this.iconPath = new vscode.ThemeIcon("folder");
    }

    async getChildren(): Promise<BaseNode[]> {
        return [];
    }
}

export class StorageFileNode extends BaseNode {
    constructor(
        public readonly connection: Connection,
        public readonly filePath: string,
        public readonly fileName: string,
        public readonly bucketName: string,
        public readonly size: number,
        public readonly contentType: string
    ) {
        super(fileName, vscode.TreeItemCollapsibleState.None);
        this.contextValue = "storageFile";
        this.description = this.formatSize(size);
        this.tooltip = `${filePath}\nSize: ${this.formatSize(size)}\nType: ${contentType}`;
        this.iconPath = this.getIconForContentType(contentType);
        this.command = {
            command: "blue-flame.previewStorageFile",
            title: "Preview File",
            arguments: [this],
        };
    }

    private formatSize(bytes: number): string {
        if (bytes === 0) {
            return "0 B";
        }
        const units = ["B", "KB", "MB", "GB"];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return `${(bytes / Math.pow(1024, i)).toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
    }

    private getIconForContentType(contentType: string): vscode.ThemeIcon {
        if (contentType.startsWith("image/")) {
            return new vscode.ThemeIcon("file-media");
        }
        if (contentType.startsWith("video/")) {
            return new vscode.ThemeIcon("device-camera-video");
        }
        if (contentType.startsWith("audio/")) {
            return new vscode.ThemeIcon("unmute");
        }
        if (contentType.startsWith("text/") || contentType === "application/json") {
            return new vscode.ThemeIcon("file-code");
        }
        if (contentType === "application/pdf") {
            return new vscode.ThemeIcon("file-pdf");
        }
        return new vscode.ThemeIcon("file");
    }

    async getChildren(): Promise<BaseNode[]> {
        return [];
    }
}

export class LoadMoreStorageNode extends BaseNode {
    constructor(
        public readonly connection: Connection,
        public readonly prefix: string,
        public readonly bucketName: string,
        public readonly pageToken: string
    ) {
        super("Load more...", vscode.TreeItemCollapsibleState.None);
        this.contextValue = "loadMoreStorage";
        this.iconPath = new vscode.ThemeIcon("ellipsis");
    }

    async getChildren(): Promise<BaseNode[]> {
        return [];
    }
}

export class UserNode extends BaseNode {
    constructor(
        public readonly connection: Connection,
        public readonly uid: string,
        public readonly email: string | undefined,
        public readonly displayName: string | undefined,
        public readonly disabled: boolean
    ) {
        super(
            displayName || email || uid,
            vscode.TreeItemCollapsibleState.None
        );
        this.contextValue = disabled ? "userDisabled" : "user";
        this.description = email && displayName ? email : undefined;
        this.tooltip = `UID: ${uid}${email ? `\nEmail: ${email}` : ""}${disabled ? "\n(Disabled)" : ""}`;
        this.iconPath = new vscode.ThemeIcon(disabled ? "account" : "person");
        this.command = {
            command: "blue-flame.editUser",
            title: "Edit User",
            arguments: [this],
        };
    }

    async getChildren(): Promise<BaseNode[]> {
        return [];
    }
}

export class LoadMoreUsersNode extends BaseNode {
    constructor(
        public readonly connection: Connection,
        public readonly pageToken: string
    ) {
        super("Load more...", vscode.TreeItemCollapsibleState.None);
        this.contextValue = "loadMoreUsers";
        this.iconPath = new vscode.ThemeIcon("ellipsis");
    }

    async getChildren(): Promise<BaseNode[]> {
        return [];
    }
}

export class CollectionNode extends BaseNode {
    constructor(
        public readonly connection: Connection,
        public readonly collectionPath: string,
        public readonly collectionId: string,
        public readonly documentCount?: number
    ) {
        super(collectionId, vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = "collection";
        this.tooltip = collectionPath;
        this.iconPath = new vscode.ThemeIcon("folder");
        if (documentCount !== undefined) {
            this.description = `(${documentCount})`;
        }
    }

    async getChildren(): Promise<BaseNode[]> {
        return [];
    }
}

export class DocumentNode extends BaseNode {
    constructor(
        public readonly connection: Connection,
        public readonly docPath: string,
        public readonly docId: string,
        hasSubcollections: boolean = false
    ) {
        super(
            docId,
            hasSubcollections
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None
        );
        this.contextValue = "document";
        this.tooltip = docPath;
        this.iconPath = new vscode.ThemeIcon("file");

        const openBehavior = vscode.workspace.getConfiguration("blue-flame").get<string>("documentOpenBehavior", "nativeEditor");
        this.command = openBehavior === "webviewPanel"
            ? { command: "blue-flame.editDocument", title: "Edit Document", arguments: [this] }
            : { command: "blue-flame.openDocumentNative", title: "Open in Editor", arguments: [this] };
    }

    async getChildren(): Promise<BaseNode[]> {
        return [];
    }
}

export class LoadMoreNode extends BaseNode {
    constructor(
        public readonly connection: Connection,
        public readonly collectionPath: string,
        public readonly startAfterDocId: string
    ) {
        super("Load more...", vscode.TreeItemCollapsibleState.None);
        this.contextValue = "loadMore";
        this.iconPath = new vscode.ThemeIcon("ellipsis");
    }

    async getChildren(): Promise<BaseNode[]> {
        return [];
    }
}

export class LoadingNode extends BaseNode {
    constructor() {
        super("Loading...", vscode.TreeItemCollapsibleState.None);
        this.contextValue = "loading";
        this.iconPath = new vscode.ThemeIcon("loading~spin");
    }

    async getChildren(): Promise<BaseNode[]> {
        return [];
    }
}

export class ErrorNode extends BaseNode {
    constructor(message: string) {
        super(message, vscode.TreeItemCollapsibleState.None);
        this.contextValue = "error";
        this.iconPath = new vscode.ThemeIcon("error");
    }

    async getChildren(): Promise<BaseNode[]> {
        return [];
    }
}
