import * as vscode from "vscode";
import * as crypto from "crypto";
import { ConnectionStorage } from "../storage/connections";
import { Connection } from "../storage/types";
import { disposeConnection } from "../firebase/adminAppFactory";
import { FirestoreExplorerProvider } from "../views/firestoreExplorer";
import { GoogleAuthProvider } from "../firebase/googleAuthProvider";
import { ConnectionNode } from "../views/nodes";
import { logger } from "../extension";

export function registerConnectionCommands(
    context: vscode.ExtensionContext,
    connectionStorage: ConnectionStorage,
    treeProvider: FirestoreExplorerProvider
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand("blue-flame.addConnection", async () => {
            logger.debug("Add connection command initiated");
            const name = await vscode.window.showInputBox({
                prompt: "Connection name",
                placeHolder: "My Firebase Project",
                validateInput: (v) => (v.trim() ? undefined : "Name is required"),
            });
            if (!name) { return; }

            const projectId = await vscode.window.showInputBox({
                prompt: "Firebase Project ID",
                placeHolder: "my-project-id",
                validateInput: (v) => (v.trim() ? undefined : "Project ID is required"),
            });
            if (!projectId) { return; }

            const authMode = await vscode.window.showQuickPick(
                [
                    { label: "Google Account (OAuth)", value: "googleOAuth" as const },
                    { label: "Application Default Credentials (ADC)", value: "adc" as const },
                    { label: "Service Account JSON File", value: "serviceAccountPath" as const },
                ],
                { placeHolder: "Select authentication mode" }
            );
            if (!authMode) { return; }

            let serviceAccountPath: string | undefined;
            if (authMode.value === "serviceAccountPath") {
                const files = await vscode.window.showOpenDialog({
                    canSelectFiles: true,
                    canSelectMany: false,
                    filters: { "JSON Files": ["json"] },
                    title: "Select Service Account JSON",
                });
                if (!files || files.length === 0) { return; }
                serviceAccountPath = files[0].fsPath;
            }

            if (authMode.value === "googleOAuth") {
                logger.debug("Initiating Google OAuth sign-in");
                try {
                    await vscode.authentication.getSession(
                        GoogleAuthProvider.providerId,
                        GoogleAuthProvider.defaultScopes,
                        { createIfNone: true }
                    );
                } catch (e) {
                    logger.error(`Google sign-in failed: ${e instanceof Error ? e.message : String(e)}`);
                    vscode.window.showErrorMessage(`Google sign-in failed: ${e instanceof Error ? e.message : String(e)}`);
                    return;
                }
            }

            const databaseId = await vscode.window.showInputBox({
                prompt: "Database ID (leave empty for default)",
                placeHolder: "(default)",
                value: "(default)",
            });

            const connection: Connection = {
                id: crypto.randomUUID(),
                name: name.trim(),
                projectId: projectId.trim(),
                databaseId: databaseId?.trim() || "(default)",
                authMode: authMode.value,
                serviceAccountPath,
            };

            await connectionStorage.add(connection);
            treeProvider.refresh();
            logger.info(`Connection added: ${connection.name} (${connection.projectId}, auth: ${connection.authMode})`);
            vscode.window.showInformationMessage(`Connection "${connection.name}" added`);
        }),

        vscode.commands.registerCommand("blue-flame.removeConnection", async (node?: ConnectionNode) => {
            logger.debug("Remove connection command initiated");

            let connectionId: string;
            let connectionName: string;

            if (node) {
                connectionId = node.connection.id;
                connectionName = node.connection.name;
            } else {
                const connections = connectionStorage.getAll();
                if (connections.length === 0) {
                    vscode.window.showInformationMessage("No connections to remove");
                    return;
                }

                const pick = await vscode.window.showQuickPick(
                    connections.map((c) => ({ label: c.name, description: c.projectId, id: c.id })),
                    { placeHolder: "Select connection to remove" }
                );
                if (!pick) { return; }
                connectionId = pick.id;
                connectionName = pick.label;
            }

            const confirm = await vscode.window.showWarningMessage(
                `Remove connection "${connectionName}"?`,
                { modal: true },
                "Remove"
            );
            if (confirm !== "Remove") { return; }

            await disposeConnection(connectionId);
            await connectionStorage.remove(connectionId);
            treeProvider.refresh();
            logger.info(`Connection removed: ${connectionName}`);
            vscode.window.showInformationMessage(`Connection "${connectionName}" removed`);
        })
    );
}
