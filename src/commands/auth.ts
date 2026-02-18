import * as vscode from "vscode";
import { UserEditorPanel } from "../webview/userEditorPanel";
import { UserNode, AuthGroupNode, LoadMoreUsersNode } from "../views/nodes";
import { FirestoreExplorerProvider } from "../views/firestoreExplorer";
import { getApp, isOAuthConnection } from "../firebase/adminAppFactory";
import { AuthService } from "../firebase/authService";
import { Connection } from "../storage/types";
import { logger } from "../extension";

async function createAuthService(connection: Connection): Promise<AuthService> {
    if (isOAuthConnection(connection)) {
        return new AuthService(connection);
    }
    const app = await getApp(connection);
    return new AuthService(app);
}

export function registerAuthCommands(
    context: vscode.ExtensionContext,
    treeProvider: FirestoreExplorerProvider
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "blue-flame.editUser",
            async (node: UserNode) => {
                logger.debug(`Opening user editor for UID: ${node.uid}`);
                const panel = new UserEditorPanel(
                    context.extensionUri,
                    node.connection,
                    node.uid,
                    false
                );
                await panel.loadUser();
            }
        ),

        vscode.commands.registerCommand(
            "blue-flame.newUser",
            async (node: AuthGroupNode) => {
                logger.debug("Creating new user");
                const panel = new UserEditorPanel(
                    context.extensionUri,
                    node.connection,
                    "",
                    true
                );
                await panel.loadUser();
            }
        ),

        vscode.commands.registerCommand(
            "blue-flame.deleteUser",
            async (node: UserNode) => {
                logger.debug(`Delete user requested: ${node.uid}`);
                const confirm = await vscode.window.showWarningMessage(
                    `Delete user "${node.displayName || node.email || node.uid}"? This action cannot be undone.`,
                    { modal: true },
                    "Delete"
                );
                if (confirm !== "Delete") { return; }

                try {
                    const svc = await createAuthService(node.connection);
                    await svc.deleteUser(node.uid);
                    logger.info(`User deleted: ${node.uid}`);
                    vscode.window.showInformationMessage("User deleted");
                    treeProvider.refresh();
                } catch (err: unknown) {
                    const msg = err instanceof Error ? err.message : String(err);
                    logger.error(`Failed to delete user ${node.uid}: ${msg}`);
                    vscode.window.showErrorMessage(`Failed to delete user: ${msg}`);
                }
            }
        ),

        vscode.commands.registerCommand(
            "blue-flame.disableUser",
            async (node: UserNode) => {
                logger.debug(`Disabling user: ${node.uid}`);
                try {
                    const svc = await createAuthService(node.connection);
                    await svc.updateUser(node.uid, { disabled: true });
                    logger.info(`User disabled: ${node.uid}`);
                    vscode.window.showInformationMessage("User disabled");
                    treeProvider.refresh();
                } catch (err: unknown) {
                    const msg = err instanceof Error ? err.message : String(err);
                    logger.error(`Failed to disable user ${node.uid}: ${msg}`);
                    vscode.window.showErrorMessage(`Failed to disable user: ${msg}`);
                }
            }
        ),

        vscode.commands.registerCommand(
            "blue-flame.enableUser",
            async (node: UserNode) => {
                logger.debug(`Enabling user: ${node.uid}`);
                try {
                    const svc = await createAuthService(node.connection);
                    await svc.updateUser(node.uid, { disabled: false });
                    logger.info(`User enabled: ${node.uid}`);
                    vscode.window.showInformationMessage("User enabled");
                    treeProvider.refresh();
                } catch (err: unknown) {
                    const msg = err instanceof Error ? err.message : String(err);
                    logger.error(`Failed to enable user ${node.uid}: ${msg}`);
                    vscode.window.showErrorMessage(`Failed to enable user: ${msg}`);
                }
            }
        ),

        vscode.commands.registerCommand(
            "blue-flame.loadMoreUsers",
            async (node: LoadMoreUsersNode) => {
                treeProvider.incrementUserPageSize(node.connection);
                treeProvider.refresh(node.parentAuthGroup);
            }
        ),

        vscode.commands.registerCommand(
            "blue-flame.refreshAuthGroup",
            (node: AuthGroupNode) => {
                logger.debug(`Refreshing auth group for connection: ${node.connection.name}`);
                treeProvider.resetUserPageSize(node.connection);
                treeProvider.refresh(node);
            }
        ),

        vscode.commands.registerCommand(
            "blue-flame.searchUsers",
            async (node: AuthGroupNode | Connection) => {
                const connection = node instanceof AuthGroupNode ? node.connection : node;
                logger.debug(`Searching users for connection: ${connection.name}`);
                const query = await vscode.window.showInputBox({
                    prompt: "Search by email or UID",
                    placeHolder: "user@example.com or uid",
                });
                if (!query) { return; }

                try {
                    const svc = await createAuthService(connection);
                    let user;
                    if (query.includes("@")) {
                        logger.debug(`Searching by email: ${query}`);
                        user = await svc.getUserByEmail(query);
                    } else {
                        logger.debug(`Searching by UID: ${query}`);
                        user = await svc.getUser(query);
                    }
                    logger.info(`User found: ${user.uid}`);
                    const panel = new UserEditorPanel(
                        context.extensionUri,
                        connection,
                        user.uid,
                        false
                    );
                    await panel.loadUser();
                } catch (err: unknown) {
                    const msg = err instanceof Error ? err.message : String(err);
                    logger.debug(`User search failed: ${msg}`);
                    vscode.window.showErrorMessage(`User not found: ${msg}`);
                }
            }
        )
    );
}
