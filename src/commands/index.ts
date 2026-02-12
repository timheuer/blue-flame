import * as vscode from "vscode";
import { ConnectionStorage } from "../storage/connections";
import { FirestoreExplorerProvider } from "../views/firestoreExplorer";
import { registerConnectionCommands } from "./connections";
import { registerFirestoreCommands } from "./firestore";
import { registerWebviewCommands } from "./webviews";
import { registerAuthCommands } from "./auth";

export function registerAllCommands(
    context: vscode.ExtensionContext,
    connectionStorage: ConnectionStorage,
    treeProvider: FirestoreExplorerProvider
): void {
    registerConnectionCommands(context, connectionStorage, treeProvider);
    registerFirestoreCommands(context, treeProvider);
    registerWebviewCommands(context);
    registerAuthCommands(context, treeProvider);
}
