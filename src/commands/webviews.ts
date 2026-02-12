import * as vscode from "vscode";
import { CollectionNode, DocumentNode } from "../views/nodes";
import { CollectionTablePanel } from "../webview/collectionTablePanel";
import { DocumentJsonPanel } from "../webview/documentJsonPanel";
import { buildDocumentUri } from "../firebase/firestoreFileSystemProvider";
import { logger } from "../extension";

export function registerWebviewCommands(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "blue-flame.openCollectionTable",
            async (node: CollectionNode) => {
                if (!node) { return; }
                logger.debug(`Opening collection table: ${node.collectionPath}`);
                const panel = new CollectionTablePanel(
                    context.extensionUri,
                    node.connection,
                    node.collectionPath
                );
                await panel.loadInitialPage();
            }
        ),

        vscode.commands.registerCommand(
            "blue-flame.editDocument",
            async (node: DocumentNode) => {
                if (!node) { return; }
                logger.debug(`Opening document editor (webview): ${node.docPath}`);
                const panel = new DocumentJsonPanel(
                    context.extensionUri,
                    node.connection,
                    node.docPath
                );
                await panel.loadDocument();
            }
        ),

        vscode.commands.registerCommand(
            "blue-flame.openDocumentNative",
            async (node: DocumentNode) => {
                if (!node) { return; }
                logger.debug(`Opening document in native editor: ${node.docPath}`);
                const uri = buildDocumentUri(node.connection.id, node.docPath);
                const doc = await vscode.workspace.openTextDocument(uri);
                await vscode.window.showTextDocument(doc, { preview: false });
            }
        )
    );
}
