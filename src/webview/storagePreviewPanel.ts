import * as vscode from "vscode";
import { WebviewBase } from "./webviewBase";
import { WebviewToExtensionMessage } from "./protocol";
import { StorageService } from "../firebase/storageService";
import { Connection } from "../storage/types";
import { getApp, isOAuthConnection } from "../firebase/adminAppFactory";
import { logger } from "../extension";

const MAX_PREVIEW_SIZE = 5 * 1024 * 1024; // 5MB

const PREVIEWABLE_TEXT_TYPES = [
    "text/",
    "application/json",
    "application/xml",
    "application/javascript",
    "application/typescript",
    "application/x-yaml",
    "application/x-sh",
];

const PREVIEWABLE_IMAGE_TYPES = [
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
    "image/svg+xml",
    "image/bmp",
    "image/ico",
    "image/x-icon",
];

function isPreviewableText(contentType: string): boolean {
    return PREVIEWABLE_TEXT_TYPES.some((t) => contentType.startsWith(t));
}

function isPreviewableImage(contentType: string): boolean {
    return PREVIEWABLE_IMAGE_TYPES.some((t) => contentType === t || contentType.startsWith(t));
}

function formatFileSize(bytes: number): string {
    if (bytes === 0) { return "0 B"; }
    const units = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const size = bytes / Math.pow(1024, i);
    return `${size.toFixed(i > 0 ? 2 : 0)} ${units[i]}`;
}

export class StoragePreviewPanel extends WebviewBase {
    private service: StorageService | undefined;

    constructor(
        extensionUri: vscode.Uri,
        private readonly connection: Connection,
        private readonly filePath: string,
        private readonly bucketName: string,
        private readonly contentType: string,
        private readonly size: number
    ) {
        super(
            extensionUri,
            "blueFlame.storagePreview",
            `Preview: ${getFileName(filePath)}`,
            `storage:${connection.id}:${bucketName}:${filePath}`
        );
    }

    private async getService(): Promise<StorageService> {
        if (!this.service) {
            if (isOAuthConnection(this.connection)) {
                this.service = new StorageService(this.connection, this.bucketName);
            } else {
                const app = await getApp(this.connection);
                this.service = new StorageService(app, this.bucketName);
            }
        }
        return this.service;
    }

    protected override getIconPath(): vscode.ThemeIcon {
        return new vscode.ThemeIcon("file");
    }

    protected getHtmlContent(webview: vscode.Webview): string {
        const nonce = this.getNonce();
        const scriptUri = this.getMediaUri(webview, "storage-preview.js");
        const styleUri = this.getMediaUri(webview, "styles.css");
        const vscodeElementsUri = this.getVscodeElementsUri(webview);

        const fileName = getFileName(this.filePath);
        const gsUrl = `gs://${this.bucketName}/${this.filePath}`;

        return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} https: data:;">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="${styleUri}" rel="stylesheet">
    <title>${this.escapeHtml(fileName)}</title>
    <style>
        .storage-header {
            padding: 16px;
            border-bottom: 1px solid var(--vscode-panel-border);
            background: var(--vscode-editor-background);
        }
        .storage-header h2 {
            margin: 0 0 12px 0;
            word-break: break-all;
        }
        .metadata-row {
            display: flex;
            gap: 24px;
            flex-wrap: wrap;
            margin-bottom: 12px;
            font-size: 13px;
        }
        .metadata-item {
            display: flex;
            gap: 6px;
        }
        .metadata-label {
            color: var(--vscode-descriptionForeground);
        }
        .metadata-value {
            color: var(--vscode-foreground);
        }
        .url-section {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
        }
        .preview-container {
            padding: 16px;
            overflow: auto;
            flex: 1;
        }
        .preview-image {
            max-width: 100%;
            max-height: 80vh;
            object-fit: contain;
        }
        .preview-code {
            background: var(--vscode-textCodeBlock-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            padding: 16px;
            overflow-x: auto;
            font-family: var(--vscode-editor-font-family);
            font-size: var(--vscode-editor-font-size);
            white-space: pre-wrap;
            word-break: break-word;
        }
        .download-section {
            text-align: center;
            padding: 48px 16px;
        }
        .download-section p {
            margin: 0 0 16px 0;
            color: var(--vscode-descriptionForeground);
        }
        .loading {
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 48px;
            color: var(--vscode-descriptionForeground);
        }
        .error-message {
            color: var(--vscode-errorForeground);
            padding: 16px;
            background: var(--vscode-inputValidation-errorBackground);
            border: 1px solid var(--vscode-inputValidation-errorBorder);
            border-radius: 4px;
            margin: 16px;
        }
    </style>
</head>
<body>
    <div class="storage-header">
        <h2 id="fileName">${this.escapeHtml(fileName)}</h2>
        <div class="metadata-row">
            <div class="metadata-item">
                <span class="metadata-label">Size:</span>
                <span class="metadata-value" id="fileSize">${formatFileSize(this.size)}</span>
            </div>
            <div class="metadata-item">
                <span class="metadata-label">Type:</span>
                <span class="metadata-value" id="contentType">${this.escapeHtml(this.contentType)}</span>
            </div>
            <div class="metadata-item">
                <span class="metadata-label">Path:</span>
                <span class="metadata-value" id="filePath">${this.escapeHtml(this.filePath)}</span>
            </div>
        </div>
        <div class="url-section">
            <vscode-button id="copyGsUrl" appearance="secondary">
                Copy gs:// URL
            </vscode-button>
            <vscode-button id="copyPublicUrl" appearance="secondary">
                Copy Public URL
            </vscode-button>
            <vscode-button id="downloadBtn" appearance="secondary">
                Download
            </vscode-button>
            <vscode-button id="refreshBtn" appearance="secondary">
                Refresh
            </vscode-button>
        </div>
    </div>
    <div class="preview-container" id="previewContainer">
        <div class="loading" id="loadingIndicator">Loading preview...</div>
    </div>
    <script nonce="${nonce}" type="module" src="${vscodeElementsUri}"></script>
    <script nonce="${nonce}" src="${scriptUri}"></script>
    <script nonce="${nonce}">
        initStoragePreview(${JSON.stringify({
            filePath: this.filePath,
            bucketName: this.bucketName,
            contentType: this.contentType,
            size: this.size,
            gsUrl,
        })});
    </script>
</body>
</html>`;
    }

    protected async handleMessage(message: WebviewToExtensionMessage): Promise<void> {
        logger.debug(`StoragePreviewPanel received message: ${message.type}`);
        switch (message.type) {
            case "loadStorageFile": {
                await this.loadAndSendContent();
                break;
            }
            case "copyStorageUrl": {
                await this.copyUrl(message.urlType);
                break;
            }
        }
    }

    private async copyUrl(urlType: "gs" | "public" | "download"): Promise<void> {
        try {
            const service = await this.getService();
            let url: string;

            switch (urlType) {
                case "gs":
                    url = await service.copyFileUrl(this.filePath);
                    break;
                case "public":
                    url = await service.getPublicUrl(this.filePath);
                    break;
                case "download":
                    url = await service.getDownloadUrl(this.filePath);
                    break;
            }

            await vscode.env.clipboard.writeText(url);
            vscode.window.showInformationMessage(`URL copied to clipboard`);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            logger.error(`Failed to copy URL: ${msg}`);
            vscode.window.showErrorMessage(`Failed to copy URL: ${msg}`);
        }
    }

    async loadContent(): Promise<void> {
        logger.debug(`Loading storage file: ${this.filePath}`);
        this.show();
        await this.loadAndSendContent();
    }

    private async loadAndSendContent(): Promise<void> {
        try {
            const service = await this.getService();
            const canPreview = this.size <= MAX_PREVIEW_SIZE &&
                (isPreviewableText(this.contentType) || isPreviewableImage(this.contentType));

            if (!canPreview) {
                // File is too large or not a previewable type - just send download URL
                const downloadUrl = await service.getDownloadUrl(this.filePath);
                this.postMessage({
                    type: "storageFileLoaded",
                    filePath: this.filePath,
                    contentType: this.contentType,
                    size: this.size,
                    downloadUrl,
                });
                return;
            }

            // Fetch the content
            const { url, headers } = await service.getAuthenticatedDownloadUrl(this.filePath);

            if (isPreviewableImage(this.contentType)) {
                // For images, we'll send the URL and let the webview decide
                // If OAuth, we need to fetch the image and convert to data URL
                if (isOAuthConnection(this.connection)) {
                    const imageData = await this.fetchAsDataUrl(url, headers, this.contentType);
                    this.postMessage({
                        type: "storageFileLoaded",
                        filePath: this.filePath,
                        contentType: this.contentType,
                        size: this.size,
                        dataUrl: imageData,
                    });
                } else {
                    // For Admin SDK, we have a signed URL that works directly
                    this.postMessage({
                        type: "storageFileLoaded",
                        filePath: this.filePath,
                        contentType: this.contentType,
                        size: this.size,
                        dataUrl: url, // Signed URL can be used directly as image src
                    });
                }
            } else if (isPreviewableText(this.contentType)) {
                // Fetch text content
                const textContent = await this.fetchAsText(url, headers);
                this.postMessage({
                    type: "storageFileLoaded",
                    filePath: this.filePath,
                    contentType: this.contentType,
                    size: this.size,
                    textContent,
                });
            }
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            logger.error(`Failed to load storage file: ${msg}`);
            this.postMessage({
                type: "storageFileLoaded",
                filePath: this.filePath,
                contentType: this.contentType,
                size: this.size,
                error: msg,
            });
        }
    }

    private async fetchAsDataUrl(
        url: string,
        headers?: Record<string, string>,
        contentType?: string
    ): Promise<string> {
        const response = await fetch(url, { headers });
        if (!response.ok) {
            throw new Error(`Failed to fetch file: ${response.status} ${response.statusText}`);
        }
        const buffer = await response.arrayBuffer();
        const base64 = Buffer.from(buffer).toString("base64");
        const mimeType = contentType || response.headers.get("content-type") || "application/octet-stream";
        return `data:${mimeType};base64,${base64}`;
    }

    private async fetchAsText(url: string, headers?: Record<string, string>): Promise<string> {
        const response = await fetch(url, { headers });
        if (!response.ok) {
            throw new Error(`Failed to fetch file: ${response.status} ${response.statusText}`);
        }
        return await response.text();
    }
}

function getFileName(filePath: string): string {
    const parts = filePath.split("/");
    return parts[parts.length - 1] || filePath;
}
