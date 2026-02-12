import * as vscode from "vscode";
import { WebviewBase } from "./webviewBase";
import { WebviewToExtensionMessage } from "./protocol";
import { FirestoreService } from "../firebase/firestoreService";
import { Connection } from "../storage/types";
import { buildDocumentUri } from "../firebase/firestoreFileSystemProvider";
import { getFirestoreClient } from "../firebase/adminAppFactory";
import { DocumentJsonPanel } from "./documentJsonPanel";
import { logger } from "../extension";

function getPageSize(): number {
    return vscode.workspace.getConfiguration("blue-flame").get<number>("pageSize", 25);
}

export class CollectionTablePanel extends WebviewBase {
    private service: FirestoreService | undefined;

    constructor(
        extensionUri: vscode.Uri,
        private readonly connection: Connection,
        private readonly collectionPath: string
    ) {
        super(
            extensionUri,
            "enFuego.collectionTable",
            `Collection: ${collectionPath}`,
            `collection:${connection.id}:${collectionPath}`
        );
    }

    private async getService(): Promise<FirestoreService> {
        if (!this.service) {
            const firestore = await getFirestoreClient(this.connection);
            this.service = new FirestoreService(firestore);
        }
        return this.service;
    }

    protected getHtmlContent(webview: vscode.Webview): string {
        const nonce = this.getNonce();
        const scriptUri = this.getMediaUri(webview, "collection-table.js");
        const styleUri = this.getMediaUri(webview, "styles.css");
        const vscodeElementsUri = this.getVscodeElementsUri(webview);

        return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="${styleUri}" rel="stylesheet">
    <title>Collection: ${this.escapeHtml(this.collectionPath)}</title>
</head>
<body>
    <div class="toolbar">
        <h2>${this.escapeHtml(this.collectionPath)}</h2>
        <vscode-button id="newDocBtn">New Document</vscode-button>
    </div>
    <div id="tableContainer"></div>
    <div class="pagination">
        <vscode-button id="prevBtn" disabled>Previous</vscode-button>
        <vscode-button id="nextBtn" disabled>Next</vscode-button>
    </div>
    <script nonce="${nonce}" type="module" src="${vscodeElementsUri}"></script>
    <script nonce="${nonce}" src="${scriptUri}"></script>
    <script nonce="${nonce}">
        initCollectionTable(${JSON.stringify(this.collectionPath)}, ${getPageSize()});
    </script>
</body>
</html>`;
    }

    protected async handleMessage(message: WebviewToExtensionMessage): Promise<void> {
        logger.debug(`CollectionTablePanel received message: ${message.type}`);
        switch (message.type) {
            case "loadPage": {
                if (typeof message.collectionPath !== "string" || typeof message.pageSize !== "number") {
                    return;
                }
                try {
                    const service = await this.getService();
                    const result = await service.listDocuments(
                        message.collectionPath,
                        {
                            pageSize: message.pageSize,
                            startAfterDocId: message.startAfterDocId,
                        }
                    );
                    const docs = result.docs.map((doc) => ({
                        id: doc.id,
                        path: doc.ref.path,
                        fields: (doc.data() as Record<string, unknown>) ?? {},
                    }));
                    this.postMessage({
                        type: "pageLoaded",
                        docs,
                        hasMore: result.hasMore,
                        collectionPath: message.collectionPath,
                    });
                } catch (err: unknown) {
                    const msg = err instanceof Error ? err.message : String(err);
                    logger.error(`Failed to load documents for ${message.collectionPath}: ${msg}`);
                    vscode.window.showErrorMessage(`Failed to load documents: ${msg}`);
                }
                break;
            }
            case "openDocument": {
                if (typeof message.docPath !== "string") {
                    return;
                }
                if (!message.docPath) {
                    const panel = new DocumentJsonPanel(
                        this.extensionUri,
                        this.connection,
                        this.collectionPath
                    );
                    panel.show();
                    break;
                }
                const uri = buildDocumentUri(this.connection.id, message.docPath);
                const doc = await vscode.workspace.openTextDocument(uri);
                await vscode.window.showTextDocument(doc, { preview: false });
                break;
            }
        }
    }

    async loadInitialPage(): Promise<void> {
        logger.debug(`Loading initial page for collection: ${this.collectionPath}`);
        this.show();
        try {
            const service = await this.getService();
            const result = await service.listDocuments(this.collectionPath, {
                pageSize: getPageSize(),
            });
            const docs = result.docs.map((doc) => ({
                id: doc.id,
                path: doc.ref.path,
                fields: (doc.data() as Record<string, unknown>) ?? {},
            }));
            this.postMessage({
                type: "pageLoaded",
                docs,
                hasMore: result.hasMore,
                collectionPath: this.collectionPath,
            });
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            logger.error(`Failed to load collection ${this.collectionPath}: ${msg}`);
            vscode.window.showErrorMessage(`Failed to load collection: ${msg}`);
        }
    }
}
