import * as vscode from "vscode";
import { ConnectionStorage } from "../storage/connections";
import { getApp } from "../firebase/adminAppFactory";
import { FirestoreService } from "../firebase/firestoreService";
import { AuthService } from "../firebase/authService";
import {
    BaseNode,
    ConnectionNode,
    FirestoreGroupNode,
    AuthGroupNode,
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

            if (element instanceof CollectionNode) {
                return this.getDocuments(element.connection, element.collectionPath);
            }

            if (element instanceof DocumentNode) {
                return this.getSubcollections(element);
            }

            return [];
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            return [new ErrorNode(msg)];
        }
    }

    private async getRootCollections(group: FirestoreGroupNode): Promise<BaseNode[]> {
        const app = await getApp(group.connection);
        const svc = new FirestoreService(app, group.connection.databaseId);
        const collections = await svc.listRootCollections();
        if (collections.length === 0) {
            return [new ErrorNode("No collections found")];
        }
        return collections.map(
            (c) => new CollectionNode(group.connection, c.path, c.id)
        );
    }

    private async getDocuments(
        connection: import("../storage/types").Connection,
        collectionPath: string,
        startAfterDocId?: string
    ): Promise<BaseNode[]> {
        const app = await getApp(connection);
        const svc = new FirestoreService(app, connection.databaseId);
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
        const app = await getApp(docNode.connection);
        const svc = new FirestoreService(app, docNode.connection.databaseId);
        const collections = await svc.listSubcollections(docNode.docPath);
        if (collections.length === 0) {
            return [];
        }
        return collections.map(
            (c) => new CollectionNode(docNode.connection, c.path, c.id)
        );
    }

    private async getUsers(
        connection: import("../storage/types").Connection,
        pageToken?: string
    ): Promise<BaseNode[]> {
        const app = await getApp(connection);
        const svc = new AuthService(app);
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
}
