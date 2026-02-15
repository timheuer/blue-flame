import * as vscode from "vscode";
import { StorageGroupNode, StorageFolderNode, StorageFileNode, LoadMoreStorageNode } from "../views/nodes";
import { FirestoreExplorerProvider } from "../views/firestoreExplorer";
import { getApp, isOAuthConnection } from "../firebase/adminAppFactory";
import { StorageService } from "../firebase/storageService";
import { Connection } from "../storage/types";
import { logger } from "../extension";

async function createStorageService(connection: Connection, bucketName?: string): Promise<StorageService> {
    if (isOAuthConnection(connection)) {
        return new StorageService(connection, bucketName);
    }
    const app = await getApp(connection);
    return new StorageService(app, bucketName);
}

export function registerStorageCommands(
    context: vscode.ExtensionContext,
    treeProvider: FirestoreExplorerProvider
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand(
            "blue-flame.refreshStorageGroup",
            (node: StorageGroupNode) => {
                logger.debug(`Refreshing storage group for connection: ${node.connection.name}`);
                const bucketName = node.bucketName || `${node.connection.projectId}.firebasestorage.app`;
                treeProvider.resetStoragePageSize(node.connection, "", bucketName);
                treeProvider.refresh(node);
            }
        ),

        vscode.commands.registerCommand(
            "blue-flame.refreshStorageFolder",
            (node: StorageFolderNode) => {
                logger.debug(`Refreshing storage folder: ${node.folderPath}`);
                treeProvider.resetStoragePageSize(node.connection, node.folderPath, node.bucketName);
                treeProvider.refresh(node);
            }
        ),

        vscode.commands.registerCommand(
            "blue-flame.loadMoreStorage",
            async (node: LoadMoreStorageNode) => {
                logger.debug(`Loading more storage items for prefix: ${node.prefix}`);
                treeProvider.incrementStoragePageSize(node.connection, node.prefix, node.bucketName);
                treeProvider.refresh(node.parentNode);
            }
        ),

        vscode.commands.registerCommand(
            "blue-flame.deleteStorageFile",
            async (node: StorageFileNode) => {
                logger.debug(`Delete storage file requested: ${node.filePath}`);
                const confirm = await vscode.window.showWarningMessage(
                    `Delete file "${node.fileName}"? This action cannot be undone.`,
                    { modal: true },
                    "Delete"
                );
                if (confirm !== "Delete") { return; }

                try {
                    const svc = await createStorageService(node.connection, node.bucketName);
                    await svc.deleteFile(node.filePath);
                    logger.info(`Storage file deleted: ${node.filePath}`);
                    vscode.window.showInformationMessage("File deleted");
                    treeProvider.refresh();
                } catch (err: unknown) {
                    const msg = err instanceof Error ? err.message : String(err);
                    logger.error(`Failed to delete file ${node.filePath}: ${msg}`);
                    vscode.window.showErrorMessage(`Failed to delete file: ${msg}`);
                }
            }
        ),

        vscode.commands.registerCommand(
            "blue-flame.deleteStorageFolder",
            async (node: StorageFolderNode) => {
                logger.debug(`Delete storage folder requested: ${node.folderPath}`);
                const confirm = await vscode.window.showWarningMessage(
                    `Delete folder "${node.folderName}" and all its contents? This action cannot be undone.`,
                    { modal: true },
                    "Delete"
                );
                if (confirm !== "Delete") { return; }

                try {
                    const svc = await createStorageService(node.connection, node.bucketName);
                    // List all files in the folder and delete them
                    let pageToken: string | undefined;
                    let deletedCount = 0;
                    do {
                        const result = await svc.listFiles(node.folderPath, 100, pageToken);
                        for (const item of result.items) {
                            await svc.deleteFile(item.name);
                            deletedCount++;
                        }
                        pageToken = result.nextPageToken;
                    } while (pageToken);

                    logger.info(`Storage folder deleted: ${node.folderPath} (${deletedCount} files)`);
                    vscode.window.showInformationMessage(`Folder deleted (${deletedCount} files)`);
                    treeProvider.refresh();
                } catch (err: unknown) {
                    const msg = err instanceof Error ? err.message : String(err);
                    logger.error(`Failed to delete folder ${node.folderPath}: ${msg}`);
                    vscode.window.showErrorMessage(`Failed to delete folder: ${msg}`);
                }
            }
        ),

        vscode.commands.registerCommand(
            "blue-flame.copyStorageFileUrl",
            async (node: StorageFileNode) => {
                logger.debug(`Copying storage file URL: ${node.filePath}`);
                try {
                    const svc = await createStorageService(node.connection, node.bucketName);
                    const gsUrl = await svc.copyFileUrl(node.filePath);
                    await vscode.env.clipboard.writeText(gsUrl);
                    logger.info(`Copied gs:// URL to clipboard: ${gsUrl}`);
                    vscode.window.showInformationMessage("Copied to clipboard: " + gsUrl);
                } catch (err: unknown) {
                    const msg = err instanceof Error ? err.message : String(err);
                    logger.error(`Failed to copy URL: ${msg}`);
                    vscode.window.showErrorMessage(`Failed to copy URL: ${msg}`);
                }
            }
        ),

        vscode.commands.registerCommand(
            "blue-flame.copyStoragePublicUrl",
            async (node: StorageFileNode) => {
                logger.debug(`Copying public URL: ${node.filePath}`);
                try {
                    const svc = await createStorageService(node.connection, node.bucketName);
                    const publicUrl = await svc.getPublicUrl(node.filePath);
                    await vscode.env.clipboard.writeText(publicUrl);
                    logger.info(`Copied public URL to clipboard: ${publicUrl}`);
                    vscode.window.showInformationMessage("Copied to clipboard: " + publicUrl);
                } catch (err: unknown) {
                    const msg = err instanceof Error ? err.message : String(err);
                    logger.error(`Failed to copy public URL: ${msg}`);
                    vscode.window.showErrorMessage(`Failed to copy public URL: ${msg}`);
                }
            }
        ),

        vscode.commands.registerCommand(
            "blue-flame.copyStorageFolderPath",
            async (node: StorageFolderNode) => {
                const gsUrl = `gs://${node.bucketName}/${node.folderPath}`;
                await vscode.env.clipboard.writeText(gsUrl);
                logger.info(`Copied folder path to clipboard: ${gsUrl}`);
                vscode.window.showInformationMessage("Copied to clipboard: " + gsUrl);
            }
        ),

        vscode.commands.registerCommand(
            "blue-flame.previewStorageFile",
            async (node: StorageFileNode) => {
                logger.debug(`Opening preview for file: ${node.filePath}`);
                try {
                    const { StoragePreviewPanel } = await import("../webview/storagePreviewPanel.js");
                    const panel = new StoragePreviewPanel(
                        context.extensionUri,
                        node.connection,
                        node.filePath,
                        node.bucketName,
                        node.contentType,
                        node.size
                    );
                    await panel.loadContent();
                } catch (err: unknown) {
                    const msg = err instanceof Error ? err.message : String(err);
                    logger.error(`Failed to preview file ${node.filePath}: ${msg}`);
                    vscode.window.showErrorMessage(`Failed to preview file: ${msg}`);
                }
            }
        ),

        vscode.commands.registerCommand(
            "blue-flame.getStorageFileMetadata",
            async (node: StorageFileNode) => {
                logger.debug(`Getting metadata for file: ${node.filePath}`);
                try {
                    const svc = await createStorageService(node.connection, node.bucketName);
                    const metadata = await svc.getFileMetadata(node.filePath);
                    const doc = await vscode.workspace.openTextDocument({
                        content: JSON.stringify(metadata, null, 2),
                        language: "json",
                    });
                    await vscode.window.showTextDocument(doc);
                } catch (err: unknown) {
                    const msg = err instanceof Error ? err.message : String(err);
                    logger.error(`Failed to get metadata: ${msg}`);
                    vscode.window.showErrorMessage(`Failed to get metadata: ${msg}`);
                }
            }
        )
    );
}
