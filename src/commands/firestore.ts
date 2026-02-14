import * as vscode from "vscode";
import { FirestoreExplorerProvider } from "../views/firestoreExplorer";
import { CollectionNode, DocumentNode, FirestoreGroupNode, LoadMoreNode } from "../views/nodes";
import { getFirestoreClient } from "../firebase/adminAppFactory";
import { FirestoreService } from "../firebase/firestoreService";
import { DocumentJsonPanel } from "../webview/documentJsonPanel";
import { logger } from "../extension";

export function registerFirestoreCommands(
    context: vscode.ExtensionContext,
    treeProvider: FirestoreExplorerProvider
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand("blue-flame.refreshExplorer", () => {
            logger.debug("Refreshing Firestore explorer");
            treeProvider.refresh();
        }),

        vscode.commands.registerCommand(
            "blue-flame.refreshFirestoreGroup",
            (node: FirestoreGroupNode) => {
                logger.debug(`Refreshing Firestore group for connection: ${node.connection.name}`);
                treeProvider.refresh(node);
            }
        ),

        vscode.commands.registerCommand(
            "blue-flame.refreshCollection",
            (node: CollectionNode) => {
                logger.debug(`Refreshing collection: ${node.collectionPath}`);
                treeProvider.setCollectionPageCursor(node.connection, node.collectionPath);
                treeProvider.refresh(node);
            }
        ),

        vscode.commands.registerCommand(
            "blue-flame.loadMore",
            async (node: LoadMoreNode) => {
                if (!node) { return; }
                logger.debug(`Loading more documents for collection: ${node.collectionPath}`);
                treeProvider.setCollectionPageCursor(node.connection, node.collectionPath, node.startAfterDocId);
                treeProvider.refresh(node.parentCollection);
            }
        ),

        vscode.commands.registerCommand(
            "blue-flame.newDocument",
            async (node: CollectionNode) => {
                if (!node) { return; }
                logger.debug(`Creating new document in collection: ${node.collectionPath}`);

                const docId = await vscode.window.showInputBox({
                    prompt: "Document ID (leave empty for auto-generated ID)",
                    placeHolder: "Optional document ID",
                });
                if (docId === undefined) { return; }

                const panel = new DocumentJsonPanel(
                    context.extensionUri,
                    node.connection,
                    docId
                        ? `${node.collectionPath}/${docId}`
                        : node.collectionPath
                );

                if (docId) {
                    panel.loadDocument();
                } else {
                    panel.show();
                }
            }
        ),

        vscode.commands.registerCommand(
            "blue-flame.deleteDocument",
            async (node: DocumentNode) => {
                if (!node) { return; }
                logger.debug(`Delete document requested: ${node.docPath}`);

                const confirm = await vscode.window.showWarningMessage(
                    `Delete document "${node.docId}"?`,
                    { modal: true },
                    "Delete"
                );
                if (confirm !== "Delete") { return; }

                try {
                    const firestore = await getFirestoreClient(node.connection);
                    const svc = new FirestoreService(firestore);
                    await svc.deleteDocument(node.docPath);
                    logger.info(`Document deleted: ${node.docPath}`);
                    vscode.window.showInformationMessage(`Document "${node.docId}" deleted`);
                    treeProvider.refresh();
                } catch (err: unknown) {
                    const msg = err instanceof Error ? err.message : String(err);
                    logger.error(`Failed to delete document ${node.docPath}: ${msg}`);
                    vscode.window.showErrorMessage(`Failed to delete: ${msg}`);
                }
            }
        ),

        vscode.commands.registerCommand(
            "blue-flame.viewDocument",
            async (
                connectionOrNode: DocumentNode | import("../storage/types").Connection,
                docPath?: string
            ) => {
                let connection: import("../storage/types").Connection;
                let path: string;

                if (connectionOrNode instanceof DocumentNode) {
                    connection = connectionOrNode.connection;
                    path = connectionOrNode.docPath;
                } else if (docPath) {
                    connection = connectionOrNode;
                    path = docPath;
                } else {
                    return;
                }
                logger.debug(`Viewing document: ${path}`);

                const panel = new DocumentJsonPanel(
                    context.extensionUri,
                    connection,
                    path
                );
                await panel.loadDocument();
            }
        ),

        vscode.commands.registerCommand(
            "blue-flame.copyDocumentPath",
            async (node: DocumentNode) => {
                if (!node) { return; }
                await vscode.env.clipboard.writeText(node.docPath);
                vscode.window.showInformationMessage(`Copied: ${node.docPath}`);
            }
        )
    );
}
