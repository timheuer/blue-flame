import * as vscode from "vscode";
import { WebviewBase } from "./webviewBase";
import { WebviewToExtensionMessage } from "./protocol";
import { AuthService, UserInfo } from "../firebase/authService";
import { Connection } from "../storage/types";
import { getApp, isOAuthConnection } from "../firebase/adminAppFactory";
import { logger } from "../extension";

export class UserEditorPanel extends WebviewBase {
    private service: AuthService | undefined;

    constructor(
        extensionUri: vscode.Uri,
        private readonly connection: Connection,
        private readonly uid: string,
        private readonly isNew: boolean = false
    ) {
        super(
            extensionUri,
            "enFuego.userEditor",
            isNew ? "New User" : `User: ${uid}`,
            `user:${connection.id}:${uid}`
        );
    }

    private async getService(): Promise<AuthService> {
        if (!this.service) {
            if (isOAuthConnection(this.connection)) {
                this.service = new AuthService(this.connection);
            } else {
                const app = await getApp(this.connection);
                this.service = new AuthService(app);
            }
        }
        return this.service;
    }

    protected override getIconPath(): vscode.ThemeIcon {
        return new vscode.ThemeIcon("person");
    }

    protected getHtmlContent(webview: vscode.Webview): string {
        const nonce = this.getNonce();
        const scriptUri = this.getMediaUri(webview, "user-editor.js");
        const styleUri = this.getMediaUri(webview, "styles.css");
        const vscodeElementsUri = this.getVscodeElementsUri(webview);

        return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} https:;">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link href="${styleUri}" rel="stylesheet">
    <title>${this.isNew ? "New User" : this.escapeHtml(this.uid)}</title>
</head>
<body>
    <div class="toolbar">
        <h2>${this.isNew ? "Create New User" : "Edit User"}</h2>
    </div>
    <div class="user-form">
        <div class="form-group">
            <label for="uid">UID</label>
            <vscode-textfield id="uid" readonly value="${this.escapeHtml(this.uid)}"></vscode-textfield>
        </div>
        <div class="form-group">
            <label for="email">Email</label>
            <vscode-textfield id="email" type="email" placeholder="user@example.com"></vscode-textfield>
        </div>
        <div class="form-group">
            <label for="password">Password${this.isNew ? "" : " (leave empty to keep current)"}</label>
            <vscode-textfield id="password" type="password" placeholder="••••••••"></vscode-textfield>
        </div>
        <div class="form-group">
            <label for="displayName">Display Name</label>
            <vscode-textfield id="displayName" placeholder="John Doe"></vscode-textfield>
        </div>
        <div class="form-group">
            <label for="phoneNumber">Phone Number</label>
            <vscode-textfield id="phoneNumber" type="tel" placeholder="+1234567890"></vscode-textfield>
        </div>
        <div class="form-group">
            <label for="photoURL">Photo URL</label>
            <vscode-textfield id="photoURL" type="url" placeholder="https://example.com/photo.jpg"></vscode-textfield>
            <img id="photoPreview" width="100" height="100" style="display: none; object-fit: cover; margin-top: 8px; border-radius: 4px;" alt="User photo">
        </div>
        <div class="form-row">
            <vscode-checkbox id="emailVerified">Email Verified</vscode-checkbox>
            <vscode-checkbox id="disabled">Disabled</vscode-checkbox>
        </div>
        <div id="metadata" class="metadata-section" style="display: none;">
            <h3>Metadata</h3>
            <div class="metadata-grid">
                <span>Created:</span><span id="creationTime">-</span>
                <span>Last Sign In:</span><span id="lastSignInTime">-</span>
                <span>Last Refresh:</span><span id="lastRefreshTime">-</span>
            </div>
        </div>
        <div id="providers" class="providers-section" style="display: none;">
            <h3>Provider Data</h3>
            <div id="providerList"></div>
        </div>
        <div id="claims" class="claims-section" style="display: none;">
            <h3>Custom Claims</h3>
            <vscode-textarea id="customClaims" rows="5" monospace placeholder="{}"></vscode-textarea>
            <vscode-button id="saveClaimsBtn" appearance="secondary" style="margin-top: 8px;">Save Claims</vscode-button>
        </div>
    </div>
    <div class="actions">
        <vscode-button id="saveBtn">Save</vscode-button>
        <vscode-button id="revokeBtn" appearance="secondary" style="display: none;">Revoke Tokens</vscode-button>
        <vscode-button id="deleteBtn" appearance="secondary" style="display: none;">Delete User</vscode-button>
    </div>
    <div id="statusMessage"></div>
    <script nonce="${nonce}" type="module" src="${vscodeElementsUri}"></script>
    <script nonce="${nonce}" src="${scriptUri}"></script>
    <script nonce="${nonce}">
        initUserEditor(${JSON.stringify(this.uid)}, ${this.isNew});
    </script>
</body>
</html>`;
    }

    protected async handleMessage(message: WebviewToExtensionMessage): Promise<void> {
        logger.debug(`UserEditorPanel received message: ${message.type}`);
        switch (message.type) {
            case "loadUser": {
                if (typeof message.uid !== "string") {
                    return;
                }
                try {
                    const service = await this.getService();
                    const user = await service.getUser(message.uid);
                    this.postMessage({
                        type: "userLoaded",
                        user,
                    });
                } catch (err: unknown) {
                    const msg = err instanceof Error ? err.message : String(err);
                    logger.error(`Failed to load user ${message.uid}: ${msg}`);
                    vscode.window.showErrorMessage(`Failed to load user: ${msg}`);
                }
                break;
            }
            case "saveUser": {
                if (typeof message.uid !== "string" || typeof message.properties !== "object" || message.properties === null) {
                    return;
                }
                logger.debug(`Saving user: ${message.uid} (isNew: ${this.isNew})`);
                try {
                    const service = await this.getService();
                    let user: UserInfo;
                    if (this.isNew) {
                        const createProps: {
                            email?: string;
                            password?: string;
                            displayName?: string;
                            phoneNumber?: string;
                            photoURL?: string;
                            disabled?: boolean;
                            emailVerified?: boolean;
                        } = {};
                        if (message.properties.email) { createProps.email = message.properties.email; }
                        if (message.properties.password) { createProps.password = message.properties.password; }
                        if (message.properties.displayName) { createProps.displayName = message.properties.displayName; }
                        if (message.properties.phoneNumber) { createProps.phoneNumber = message.properties.phoneNumber; }
                        if (message.properties.photoURL) { createProps.photoURL = message.properties.photoURL; }
                        if (message.properties.disabled !== undefined) { createProps.disabled = message.properties.disabled; }
                        if (message.properties.emailVerified !== undefined) { createProps.emailVerified = message.properties.emailVerified; }
                        user = await service.createUser(createProps);
                    } else {
                        user = await service.updateUser(message.uid, message.properties);
                    }
                    this.postMessage({ type: "userSaveResult", success: true });
                    this.postMessage({ type: "userLoaded", user });
                    logger.info(`User ${this.isNew ? "created" : "updated"}: ${user.uid}`);
                    vscode.window.showInformationMessage(
                        this.isNew ? "User created successfully" : "User updated successfully"
                    );
                    vscode.commands.executeCommand("blue-flame.refreshExplorer");
                } catch (err: unknown) {
                    const msg = err instanceof Error ? err.message : String(err);
                    logger.error(`Failed to save user ${message.uid}: ${msg}`);
                    this.postMessage({ type: "userSaveResult", success: false, error: msg });
                    vscode.window.showErrorMessage(`Failed to save user: ${msg}`);
                }
                break;
            }
            case "deleteUser": {
                if (typeof message.uid !== "string") {
                    return;
                }
                logger.debug(`Delete user requested via webview: ${message.uid}`);
                const confirm = await vscode.window.showWarningMessage(
                    `Delete user "${message.uid}"? This action cannot be undone.`,
                    { modal: true },
                    "Delete"
                );
                if (confirm === "Delete") {
                    try {
                        const service = await this.getService();
                        await service.deleteUser(message.uid);
                        logger.info(`User deleted via webview: ${message.uid}`);
                        vscode.window.showInformationMessage("User deleted");
                        vscode.commands.executeCommand("blue-flame.refreshExplorer");
                        this.dispose();
                    } catch (err: unknown) {
                        const msg = err instanceof Error ? err.message : String(err);
                        logger.error(`Failed to delete user ${message.uid}: ${msg}`);
                        vscode.window.showErrorMessage(`Failed to delete user: ${msg}`);
                    }
                }
                break;
            }
            case "toggleUserDisabled": {
                if (typeof message.uid !== "string" || typeof message.disabled !== "boolean") {
                    return;
                }
                logger.debug(`Toggling user disabled state: ${message.uid} -> ${message.disabled}`);
                try {
                    const service = await this.getService();
                    const user = await service.updateUser(message.uid, {
                        disabled: message.disabled,
                    });
                    this.postMessage({ type: "userLoaded", user });
                    logger.info(`User ${message.disabled ? "disabled" : "enabled"}: ${message.uid}`);
                    vscode.window.showInformationMessage(
                        message.disabled ? "User disabled" : "User enabled"
                    );
                    vscode.commands.executeCommand("blue-flame.refreshExplorer");
                } catch (err: unknown) {
                    const msg = err instanceof Error ? err.message : String(err);
                    logger.error(`Failed to toggle user disabled state ${message.uid}: ${msg}`);
                    vscode.window.showErrorMessage(`Failed to update user: ${msg}`);
                }
                break;
            }
            case "revokeTokens": {
                if (typeof message.uid !== "string") {
                    return;
                }
                logger.debug(`Revoke tokens requested for user: ${message.uid}`);
                const confirm = await vscode.window.showWarningMessage(
                    `Revoke all refresh tokens for user "${message.uid}"? The user will need to sign in again.`,
                    { modal: true },
                    "Revoke"
                );
                if (confirm === "Revoke") {
                    try {
                        const service = await this.getService();
                        await service.revokeRefreshTokens(message.uid);
                        logger.info(`Tokens revoked for user via webview: ${message.uid}`);
                        vscode.window.showInformationMessage("Tokens revoked successfully");
                    } catch (err: unknown) {
                        const msg = err instanceof Error ? err.message : String(err);
                        logger.error(`Failed to revoke tokens for user ${message.uid}: ${msg}`);
                        vscode.window.showErrorMessage(`Failed to revoke tokens: ${msg}`);
                    }
                }
                break;
            }
            case "saveCustomClaims": {
                if (typeof message.uid !== "string") {
                    return;
                }
                logger.debug(`Saving custom claims for user: ${message.uid}`);
                try {
                    const service = await this.getService();
                    const claims = message.claims as Record<string, unknown> | null;
                    await service.setCustomClaims(message.uid, claims);
                    logger.info(`Custom claims saved for user: ${message.uid}`);
                    vscode.window.showInformationMessage("Custom claims saved");
                    const user = await service.getUser(message.uid);
                    this.postMessage({ type: "userLoaded", user });
                } catch (err: unknown) {
                    const msg = err instanceof Error ? err.message : String(err);
                    logger.error(`Failed to save claims for user ${message.uid}: ${msg}`);
                    vscode.window.showErrorMessage(`Failed to save claims: ${msg}`);
                }
                break;
            }
        }
    }

    async loadUser(): Promise<void> {
        logger.debug(`Loading user: ${this.uid} (isNew: ${this.isNew})`);
        this.show();
        if (!this.isNew) {
            try {
                const service = await this.getService();
                const user = await service.getUser(this.uid);
                this.postMessage({
                    type: "userLoaded",
                    user,
                });
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : String(err);
                logger.error(`Failed to load user ${this.uid}: ${msg}`);
                vscode.window.showErrorMessage(`Failed to load user: ${msg}`);
            }
        }
    }
}
