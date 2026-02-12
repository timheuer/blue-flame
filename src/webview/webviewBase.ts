import * as vscode from "vscode";
import * as crypto from "crypto";
import { ExtensionToWebviewMessage, WebviewToExtensionMessage } from "./protocol";

export abstract class WebviewBase implements vscode.Disposable {
    protected panel: vscode.WebviewPanel | undefined;
    private static readonly panels = new Map<string, WebviewBase>();
    private disposables: vscode.Disposable[] = [];

    constructor(
        protected readonly extensionUri: vscode.Uri,
        private readonly viewType: string,
        private readonly title: string,
        private readonly panelKey: string
    ) { }

    show(column: vscode.ViewColumn = vscode.ViewColumn.One): void {
        const existing = WebviewBase.panels.get(this.panelKey);
        if (existing?.panel) {
            existing.panel.reveal(column);
            return;
        }

        this.panel = vscode.window.createWebviewPanel(
            this.viewType,
            this.title,
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(this.extensionUri, "dist", "webview", "media"),
                ],
            }
        );

        const icon = this.getIconPath();
        if (icon) {
            this.panel.iconPath = icon;
        }

        WebviewBase.panels.set(this.panelKey, this);

        this.panel.webview.html = this.getHtmlContent(this.panel.webview);

        this.panel.webview.onDidReceiveMessage(
            (msg: WebviewToExtensionMessage) => this.handleMessage(msg),
            undefined,
            this.disposables
        );

        this.panel.onDidDispose(() => this.dispose(), undefined, this.disposables);
    }

    protected postMessage(message: ExtensionToWebviewMessage): void {
        this.panel?.webview.postMessage(message);
    }

    protected abstract getHtmlContent(webview: vscode.Webview): string;
    protected abstract handleMessage(message: WebviewToExtensionMessage): void;

    protected getIconPath(): vscode.ThemeIcon | vscode.Uri | { light: vscode.Uri; dark: vscode.Uri } | undefined {
        return undefined;
    }

    protected getNonce(): string {
        return crypto.randomBytes(16).toString("base64");
    }

    protected escapeHtml(text: string): string {
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    protected getMediaUri(webview: vscode.Webview, ...pathSegments: string[]): vscode.Uri {
        return webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, "dist", "webview", "media", ...pathSegments)
        );
    }

    protected getVscodeElementsUri(webview: vscode.Webview): vscode.Uri {
        return webview.asWebviewUri(
            vscode.Uri.joinPath(this.extensionUri, "dist", "webview", "media", "vscode-elements.js")
        );
    }

    dispose(): void {
        WebviewBase.panels.delete(this.panelKey);
        this.panel?.dispose();
        this.panel = undefined;
        this.disposables.forEach((d) => d.dispose());
        this.disposables = [];
    }
}
