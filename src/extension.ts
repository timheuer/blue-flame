import * as vscode from "vscode";
import { createLoggerFromConfig, Logger } from "@timheuer/vscode-ext-logger";
import { ConnectionStorage } from "./storage/connections";
import { FirestoreExplorerProvider } from "./views/firestoreExplorer";
import { registerAllCommands } from "./commands";
import { disposeAll, setAuthProvider } from "./firebase/adminAppFactory";
import { FirestoreFileSystemProvider, BLUEFLAME_SCHEME } from "./firebase/firestoreFileSystemProvider";
import { GoogleAuthProvider } from "./firebase/googleAuthProvider";

export let logger: Logger;
export let connectionStorage: ConnectionStorage;

export function activate(context: vscode.ExtensionContext) {
	logger = createLoggerFromConfig(
		context.extension.packageJSON.displayName,
		"blue-flame",
		"logLevel",
		"info",
		true,
		context,
		true
	);
	logger.info("Blue Flame extension activated");

	connectionStorage = new ConnectionStorage(context);

	const googleAuthProvider = new GoogleAuthProvider(context);
	setAuthProvider(googleAuthProvider);
	context.subscriptions.push(googleAuthProvider);

	const treeProvider = new FirestoreExplorerProvider(connectionStorage);

	const fsProvider = new FirestoreFileSystemProvider(connectionStorage);
	context.subscriptions.push(
		vscode.workspace.registerFileSystemProvider(BLUEFLAME_SCHEME, fsProvider, {
			isCaseSensitive: true,
			isReadonly: false,
		})
	);

	const treeView = vscode.window.createTreeView("blueFlame.firestoreExplorer", {
		treeDataProvider: treeProvider,
		showCollapseAll: true,
	});

	registerAllCommands(context, connectionStorage, treeProvider);

	context.subscriptions.push(treeView);
}

export async function deactivate() {
	logger?.dispose();
	await disposeAll();
}
