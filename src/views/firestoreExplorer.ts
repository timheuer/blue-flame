import * as vscode from "vscode";
import { ConnectionStorage } from "../storage/connections";
import { getApp, getFirestoreClient, isOAuthConnection } from "../firebase/adminAppFactory";
import { FirestoreService } from "../firebase/firestoreService";
import { AuthService } from "../firebase/authService";
import { StorageService } from "../firebase/storageService";
import { Connection } from "../storage/types";
import {
    BaseNode,
    ConnectionNode,
    FirestoreGroupNode,
    AuthGroupNode,
    StorageGroupNode,
    StorageFolderNode,
    StorageFileNode,
    LoadMoreStorageNode,
    CollectionNode,
    DocumentNode,
    UserNode,
    LoadMoreNode,
    LoadMoreUsersNode,
    ErrorNode,
} from "./nodes";

function getPageSize(): number {
    return vscode.workspace.getConfiguration("blue-flame").get<number>("pageSize", 25);
}

function getUserListPageSize(): number {
    return vscode.workspace.getConfiguration("blue-flame").get<number>("userListPageSize", 25);
}

export class FirestoreExplorerProvider implements vscode.TreeDataProvider<BaseNode> {
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<BaseNode | undefined | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    constructor(private readonly connectionStorage: ConnectionStorage) { }

    refresh(node?: BaseNode): void {
        this._onDidChangeTreeData.fire(node);
    }

    getTreeItem(element: BaseNode): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: BaseNode): Promise<BaseNode[]> {
        if (!element) {
            const connections = this.connectionStorage.getAll();
            return connections.map((c) => new ConnectionNode(c));
        }

        try {
            if (element instanceof ConnectionNode) {
                return element.getChildren();
            }

            if (element instanceof FirestoreGroupNode) {
                return this.getRootCollections(element);
            }

            if (element instanceof AuthGroupNode) {
                return this.getUsers(element.connection);
            }

            if (element instanceof StorageGroupNode) {
                return this.getStorageItems(element.connection, "", element.bucketName);
            }

            if (element instanceof StorageFolderNode) {
                return this.getStorageItems(element.connection, element.folderPath, element.bucketName);
            }

            if (element instanceof CollectionNode) {
                return this.getDocuments(element.connection, element.collectionPath);
            }

            if (element instanceof LoadMoreNode) {
                return this.getDocuments(
                    element.connection,
                    element.collectionPath,
                    element.startAfterDocId
                );
            }

            if (element instanceof DocumentNode) {
                return this.getSubcollections(element);
            }

            if (element instanceof LoadMoreUsersNode) {
                return this.getUsers(element.connection, element.pageToken);
            }

            if (element instanceof LoadMoreStorageNode) {
                return this.getStorageItems(
                    element.connection,
                    element.prefix,
                    element.bucketName,
                    element.pageToken
                );
            }

            return [];
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            return [new ErrorNode(msg)];
        }
    }

    private async getRootCollections(group: FirestoreGroupNode): Promise<BaseNode[]> {
        const firestore = await getFirestoreClient(group.connection);
        const svc = new FirestoreService(firestore);
        const collections = await svc.listRootCollections();
        if (collections.length === 0) {
            return [new ErrorNode("No collections found")];
        }
        const counts = await Promise.all(
            collections.map((c) => svc.countDocuments(c.path))
        );
        return collections.map(
            (c, i) => new CollectionNode(group.connection, c.path, c.id, counts[i])
        );
    }

    private async getDocuments(
        connection: Connection,
        collectionPath: string,
        startAfterDocId?: string
    ): Promise<BaseNode[]> {
        const firestore = await getFirestoreClient(connection);
        const svc = new FirestoreService(firestore);
        const result = await svc.listDocuments(collectionPath, {
            pageSize: getPageSize(),
            startAfterDocId,
        });

        const nodes: BaseNode[] = await Promise.all(
            result.docs.map(async (doc) => {
                const subcollections = await svc.listSubcollections(doc.ref.path);
                return new DocumentNode(
                    connection,
                    doc.ref.path,
                    doc.id,
                    subcollections.length > 0
                );
            })
        );

        if (result.hasMore) {
            const lastDoc = result.docs[result.docs.length - 1];
            nodes.push(new LoadMoreNode(connection, collectionPath, lastDoc.id));
        }

        return nodes;
    }

    private async getSubcollections(docNode: DocumentNode): Promise<BaseNode[]> {
        const firestore = await getFirestoreClient(docNode.connection);
        const svc = new FirestoreService(firestore);
        const collections = await svc.listSubcollections(docNode.docPath);
        if (collections.length === 0) {
            return [];
        }
        const counts = await Promise.all(
            collections.map((c) => svc.countDocuments(c.path))
        );
        return collections.map(
            (c, i) => new CollectionNode(docNode.connection, c.path, c.id, counts[i])
        );
    }

    private async getUsers(
        connection: Connection,
        pageToken?: string
    ): Promise<BaseNode[]> {
        const svc = isOAuthConnection(connection)
            ? new AuthService(connection)
            : new AuthService(await getApp(connection));
        const result = await svc.listUsers(getUserListPageSize(), pageToken);

        if (result.users.length === 0 && !pageToken) {
            return [new ErrorNode("No users found")];
        }

        const nodes: BaseNode[] = result.users.map(
            (user) => new UserNode(
                connection,
                user.uid,
                user.email,
                user.displayName,
                user.disabled
            )
        );

        if (result.pageToken) {
            nodes.push(new LoadMoreUsersNode(connection, result.pageToken));
        }

        return nodes;
    }

    async getStorageItems(
        connection: Connection,
        prefix: string,
        bucketName?: string,
        pageToken?: string
    ): Promise<BaseNode[]> {
        const svc = isOAuthConnection(connection)
            ? new StorageService(connection, bucketName)
            : new StorageService(await getApp(connection), bucketName);

        const bucket = svc.getBucketName();
        const result = await svc.listAllFilesAndFolders(prefix, getPageSize(), pageToken);

        if (result.items.length === 0 && !pageToken) {
            return [new ErrorNode("No files found")];
        }

        const nodes: BaseNode[] = result.items.map((item) => {
            if (item.isFolder) {
                return new StorageFolderNode(
                    connection,
                    item.name,
                    item.displayName,
                    bucket
                );
            }
            return new StorageFileNode(
                connection,
                item.name,
                item.displayName,
                bucket,
                item.size,
                item.contentType
            );
        });

        if (result.nextPageToken) {
            nodes.push(new LoadMoreStorageNode(connection, prefix, bucket, result.nextPageToken));
        }

        return nodes;
    }
}
