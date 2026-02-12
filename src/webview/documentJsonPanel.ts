import * as vscode from "vscode";
import { WebviewBase } from "./webviewBase";
import { WebviewToExtensionMessage } from "./protocol";
import { FirestoreService } from "../firebase/firestoreService";
import { Connection } from "../storage/types";
import { buildDocumentUri } from "../firebase/firestoreFileSystemProvider";
import type { App } from "firebase-admin/app";
import { logger } from "../extension";

function getDefaultMergeOnSave(): boolean {
    return vscode.workspace.getConfiguration("blue-flame").get<boolean>("defaultMergeOnSave", true);
}

export class DocumentJsonPanel extends WebviewBase {
    private readonly service: FirestoreService;

    constructor(
        extensionUri: vscode.Uri,
        private readonly connection: Connection,
        private readonly docPath: string,
        app: App
    ) {
        super(
            extensionUri,
            "enFuego.documentJson",
            docPath,
            `document:${connection.id}:${docPath}`
        );
        this.service = new FirestoreService(app, connection.databaseId);
    }

    protected getHtmlContent(webview: vscode.Webview): string {
        const nonce = this.getNonce();
        const scriptUri = this.getMediaUri(webview, "document-editor.js");
        const styleUri = this.getMediaUri(webview, "styles.css");
        const vscodeElementsUri = this.getVscodeElementsUri(webview);

        return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="${styleUri}" rel="stylesheet">
    <title>${this.escapeHtml(this.docPath)}</title>
</head>
<body>
    <div class="toolbar">
        <h2>${this.escapeHtml(this.docPath)}</h2>
        <vscode-button id="openNativeBtn" appearance="secondary">Open in Editor</vscode-button>
    </div>
    <vscode-textarea id="jsonEditor" rows="20" resize="vertical" monospace></vscode-textarea>
    <div class="actions">
        <vscode-checkbox id="mergeToggle" ${getDefaultMergeOnSave() ? "checked" : ""}>Merge</vscode-checkbox>
        <vscode-button id="saveBtn">Save</vscode-button>
        <vscode-button id="deleteBtn" appearance="secondary">Delete</vscode-button>
    </div>
    <div id="statusMessage"></div>
    <script nonce="${nonce}" type="module" src="${vscodeElementsUri}"></script>
    <script nonce="${nonce}" src="${scriptUri}"></script>
    <script nonce="${nonce}">
        initDocumentEditor(${JSON.stringify(this.docPath)});
    </script>
</body>
</html>`;
    }

    protected async handleMessage(message: WebviewToExtensionMessage): Promise<void> {
        logger.debug(`DocumentJsonPanel received message: ${message.type}`);
        switch (message.type) {
            case "loadDocument": {
                if (typeof message.docPath !== "string") {
                    return;
                }
                try {
                    const result = await this.service.getDocument(message.docPath);
                    this.postMessage({
                        type: "documentLoaded",
                        docPath: message.docPath,
                        exists: result.exists,
                        data: result.data,
                    });
                } catch (err: unknown) {
                    const msg = err instanceof Error ? err.message : String(err);
                    logger.error(`Failed to load document ${message.docPath}: ${msg}`);
                    vscode.window.showErrorMessage(`Failed to load document: ${msg}`);
                }
                break;
            }
            case "saveDocument": {
                if (typeof message.docPath !== "string" || typeof message.data !== "object" || message.data === null) {
                    return;
                }
                logger.debug(`Saving document: ${message.docPath} (merge: ${message.merge})`);
                try {
                    await this.service.setDocument(message.docPath, message.data, {
                        merge: message.merge,
                    });
                    this.postMessage({ type: "saveResult", success: true });
                    vscode.window.showInformationMessage("Document saved successfully");
                } catch (err: unknown) {
                    const msg = err instanceof Error ? err.message : String(err);
                    logger.error(`Failed to save document ${message.docPath}: ${msg}`);
                    this.postMessage({ type: "saveResult", success: false, error: msg });
                    vscode.window.showErrorMessage(`Failed to save document: ${msg}`);
                }
                break;
            }
            case "deleteDocument": {
                if (typeof message.docPath !== "string") {
                    return;
                }
                logger.debug(`Delete document requested via webview: ${message.docPath}`);
                const confirm = await vscode.window.showWarningMessage(
                    `Delete document "${message.docPath}"?`,
                    { modal: true },
                    "Delete"
                );
                if (confirm === "Delete") {
                    try {
                        await this.service.deleteDocument(message.docPath);
                        logger.info(`Document deleted via webview: ${message.docPath}`);
                        vscode.window.showInformationMessage("Document deleted");
                        this.dispose();
                    } catch (err: unknown) {
                        const msg = err instanceof Error ? err.message : String(err);
                        logger.error(`Failed to delete document ${message.docPath}: ${msg}`);
                        vscode.window.showErrorMessage(`Failed to delete document: ${msg}`);
                    }
                }
                break;
            }
            case "openInNativeEditor": {
                if (typeof message.docPath !== "string") {
                    return;
                }
                const uri = buildDocumentUri(this.connection.id, message.docPath);
                const doc = await vscode.workspace.openTextDocument(uri);
                await vscode.window.showTextDocument(doc, { preview: false });
                break;
            }
        }
    }

    async loadDocument(): Promise<void> {
        logger.debug(`Loading document: ${this.docPath}`);
        this.show();
        try {
            const result = await this.service.getDocument(this.docPath);
            this.postMessage({
                type: "documentLoaded",
                docPath: this.docPath,
                exists: result.exists,
                data: result.data,
            });
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            logger.error(`Failed to load document ${this.docPath}: ${msg}`);
            vscode.window.showErrorMessage(`Failed to load document: ${msg}`);
        }
    }
}
