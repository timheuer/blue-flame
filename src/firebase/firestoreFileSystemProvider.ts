import * as vscode from "vscode";
import { ConnectionStorage } from "../storage/connections";
import { getApp } from "./adminAppFactory";
import { FirestoreService } from "./firestoreService";
import { logger } from "../extension";

export const BLUEFLAME_SCHEME = "blueflame";

interface ParsedUri {
    connectionId: string;
    docPath: string;
}

function parseUri(uri: vscode.Uri): ParsedUri {
    // Format: blueflame:/connectionId/path/to/document.json
    const uriPath = uri.path;
    const parts = uriPath.split("/").filter(Boolean);
    if (parts.length < 2) {
        throw new Error(`Invalid URI: ${uri.toString()}`);
    }
    const connectionId = parts[0];
    if (!connectionId || connectionId.includes("..")) {
        throw new Error(`Invalid connection ID in URI: ${uri.toString()}`);
    }
    let docPath = parts.slice(1).join("/");
    if (docPath.includes("..")) {
        throw new Error(`Invalid document path in URI: ${uri.toString()}`);
    }
    if (docPath.endsWith(".json")) {
        docPath = docPath.slice(0, -5);
    }
    return { connectionId, docPath };
}

export function buildDocumentUri(connectionId: string, docPath: string): vscode.Uri {
    return vscode.Uri.parse(`${BLUEFLAME_SCHEME}:/${connectionId}/${docPath}.json`);
}

export class FirestoreFileSystemProvider implements vscode.FileSystemProvider {
    private readonly _onDidChangeFile = new vscode.EventEmitter<vscode.FileChangeEvent[]>();
    readonly onDidChangeFile = this._onDidChangeFile.event;

    constructor(private readonly connectionStorage: ConnectionStorage) { }

    watch(): vscode.Disposable {
        return new vscode.Disposable(() => { });
    }

    stat(uri: vscode.Uri): vscode.FileStat {
        return {
            type: vscode.FileType.File,
            ctime: Date.now(),
            mtime: Date.now(),
            size: 0,
        };
    }

    readDirectory(): [string, vscode.FileType][] {
        return [];
    }

    createDirectory(): void { }

    async readFile(uri: vscode.Uri): Promise<Uint8Array> {
        const { connectionId, docPath } = parseUri(uri);
        const connection = this.connectionStorage.get(connectionId);
        if (!connection) {
            throw vscode.FileSystemError.FileNotFound(`Connection not found: ${connectionId}`);
        }

        const app = await getApp(connection);
        const svc = new FirestoreService(app, connection.databaseId);
        const result = await svc.getDocument(docPath);

        if (!result.exists) {
            throw vscode.FileSystemError.FileNotFound(`Document not found: ${docPath}`);
        }

        const json = JSON.stringify(result.data, null, 2);
        return new TextEncoder().encode(json);
    }

    async writeFile(uri: vscode.Uri, content: Uint8Array): Promise<void> {
        const { connectionId, docPath } = parseUri(uri);
        const connection = this.connectionStorage.get(connectionId);
        if (!connection) {
            throw vscode.FileSystemError.FileNotFound(`Connection not found: ${connectionId}`);
        }

        const json = new TextDecoder().decode(content);
        let data: Record<string, unknown>;
        try {
            data = JSON.parse(json);
        } catch {
            throw new Error("Invalid JSON");
        }

        const app = await getApp(connection);
        const svc = new FirestoreService(app, connection.databaseId);
        await svc.setDocument(docPath, data, { merge: false });
        logger.info(`Document saved: ${docPath}`);
    }

    delete(): void {
        throw vscode.FileSystemError.NoPermissions("Use context menu to delete documents");
    }

    rename(): void {
        throw vscode.FileSystemError.NoPermissions("Renaming documents is not supported");
    }
}
