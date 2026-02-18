# Copilot Instructions for Blue Flame

## Project Overview

Blue Flame is a VS Code extension that provides a tree-based Firebase browser with webview panels for Firestore collection browsing, document editing, Firebase Authentication user management, and Firebase Storage file browsing/preview. It connects to Google Cloud Firebase via `firebase-admin` and supports multiple simultaneous connections.

## Tech Stack

- **Language**: TypeScript (strict mode, ES2022 target, Node16 modules)
- **Runtime**: VS Code Extension Host (Node.js)
- **Bundler**: esbuild (CJS output to `dist/extension.js`)
- **Firebase**: `firebase-admin` SDK (externalized from bundle, not bundled)
- **Webview UI**: `@vscode-elements/elements` for web components (buttons, tables, checkboxes, textareas)
- **Linting**: ESLint with `@typescript-eslint`
- **Testing**: `@vscode/test-cli` + `@vscode/test-electron`

## Architecture

```
src/
├── extension.ts              # Entry point — wires storage, tree, and commands
├── storage/                  # Connection persistence via globalState
│   ├── types.ts              # Connection interface
│   └── connections.ts        # ConnectionStorage CRUD class
├── firebase/                 # Firebase SDK wrappers
│   ├── adminAppFactory.ts    # App creation/caching/disposal
│   ├── firestoreService.ts   # Firestore CRUD operations
│   ├── authService.ts        # Firebase Auth user management
│   └── storageService.ts     # Firebase Storage file operations
├── commands/                 # VS Code command handlers
│   ├── index.ts              # registerAllCommands() aggregator
│   ├── connections.ts        # Add/remove connection commands
│   ├── firestore.ts          # Refresh, new/delete/view document
│   ├── auth.ts               # User edit/create/delete/disable/enable
│   ├── storage.ts            # Storage file operations (preview, delete, copy URL)
│   └── webviews.ts           # Open collection table, edit document
├── views/                    # Tree view providers
│   ├── nodes.ts              # TreeItem node types (Connection, Collection, Document, User, etc.)
│   └── firestoreExplorer.ts  # TreeDataProvider implementation
└── webview/                  # Webview panels
    ├── protocol.ts           # Typed message contracts (discriminated unions)
    ├── webviewBase.ts        # Base panel class with CSP, nonce, lifecycle
    ├── collectionTablePanel.ts
    ├── documentJsonPanel.ts
    ├── userEditorPanel.ts    # User details editor panel
    ├── storagePreviewPanel.ts # Storage file preview panel
    └── media/                # Static assets served to webviews
        ├── collection-table.js
        ├── document-editor.js
        ├── user-editor.js
        ├── storage-preview.js
        └── styles.css
```

## Key Patterns

### Connection Model
- Connections are stored in `globalState` (never secrets, only metadata and file paths).
- Auth modes: `adc` (Application Default Credentials), `serviceAccountPath` (JSON file), or `googleOAuth` (user OAuth flow).
- Firebase apps are cached in a `Map<string, admin.app.App>` keyed by connection ID (non-OAuth connections only).
- For OAuth connections, Firestore clients are cached separately using `@google-cloud/firestore` directly with OAuth credentials.

### Authentication Modes
- **Service Account / ADC**: Uses `firebase-admin` SDK directly via `getApp()`. Full support for all Firebase Admin SDK features.
- **Google OAuth**: Uses `google-auth-library` for OAuth2 flow, creates Firestore clients directly via `@google-cloud/firestore`, and uses Firebase Identity Toolkit REST API for Auth operations. Call `getFirestoreClient()` (not `getApp()`) for Firestore access.

### Factory Functions (adminAppFactory.ts)
- `getFirestoreClient(connection)`: Returns a `Firestore` client for any connection type. Preferred method.
- `getApp(connection)`: Returns Admin SDK app. Throws for OAuth connections.
- `isOAuthConnection(connection)`: Check if connection uses OAuth.
- `getAccessToken(connection)`: Get OAuth access token for REST API calls.
- `disposeConnection(connectionId)`: Dispose app and cached clients for a connection.
- `disposeAll()`: Dispose all cached resources.

### Tree View
- Hierarchy: Connection → FirestoreGroup → Collections → Documents → Subcollections.
- Hierarchy: Connection → AuthGroup → Users.
- Hierarchy: Connection → StorageGroup → Folders → Files.
- `contextValue` on each node controls which context menu commands appear.
- Pagination uses cursor-based `startAfter(lastDocId)` with a "Load more..." node for documents.
- User pagination uses `pageToken` from Firebase Auth API with a "Load more..." node.
- Storage pagination uses `nextPageToken` from Cloud Storage API with a "Load more..." node.

### Webview Communication
- Uses discriminated union types in `protocol.ts` for type-safe messaging.
- Extension → Webview: `PageLoaded`, `DocumentLoaded`, `SaveResult`, `UserLoaded`, `UserSaveResult`, `StorageFileLoaded`.
- Webview → Extension: `LoadPage`, `OpenDocument`, `LoadDocument`, `SaveDocument`, `DeleteDocument`, `LoadUser`, `SaveUser`, `DeleteUser`, `ToggleUserDisabled`, `RevokeTokens`, `LoadStorageFile`, `CopyStorageUrl`.
- Base panel class handles CSP, nonce generation, single-instance registry, and disposal.
- UI components use `@vscode-elements/elements` web components (loaded from `node_modules` via `localResourceRoots`).

### esbuild Configuration
All dependencies including `firebase-admin`, `@google-cloud/firestore`, and `google-auth-library` are bundled into a single `dist/extension.js` file. Only `vscode` is externalized.

### Extension Settings
User-configurable settings are retrieved via `vscode.workspace.getConfiguration("blue-flame")`:

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `logLevel` | enum | `"info"` | Log level for the extension |
| `pageSize` | number | 25 | Legacy fallback page size when `treePageSize`/`tablePageSize` are not set |
| `treePageSize` | number | 25 | Items per page in tree view (Firestore documents and Storage files/folders) |
| `tablePageSize` | number | 25 | Documents per page in collection table webview |
| `userListPageSize` | number | 25 | Users per page in Authentication tree |
| `defaultMergeOnSave` | boolean | true | Merge with existing data vs overwrite when saving documents |
| `documentOpenBehavior` | enum | `"nativeEditor"` | How to open documents: `nativeEditor` or `webviewPanel` |

Helper functions in source files read these settings at runtime (e.g., `getPageSize()`, `getUserListPageSize()`, `getDefaultMergeOnSave()`).

## Conventions

- **Command IDs**: `blue-flame.<verb><Noun>` (e.g., `blue-flame.addConnection`, `blue-flame.deleteDocument`).
- **View IDs**: `blueFlame.<name>` (e.g., `blueFlame.firestoreExplorer`).
- **Error handling**: Catch errors at command/tree boundaries, show `vscode.window.showErrorMessage()`, and render `ErrorNode` in the tree.
- **Curly braces**: ESLint enforces braces on all control flow (`curly: "warn"`).
- **Equality**: Always use strict equality (`eqeqeq: "warn"`).
- **Semicolons**: Required (`semi: "warn"`).

## Build & Development

```bash
npm run compile        # Type-check + lint + esbuild bundle
npm run watch          # Watch mode (parallel esbuild + tsc)
npm run lint           # ESLint only
npm run check-types    # TypeScript type-check only
npm run package        # Production build (minified)
npm test               # Run tests via @vscode/test-cli
```

Press **F5** in VS Code to launch the Extension Development Host for manual testing.

## Adding New Features

- **New Firebase service**: Create in `src/firebase/`. For Firestore operations, use `getFirestoreClient(connection)`. For services needing Admin SDK (non-OAuth), use `getApp(connection)`. For OAuth-compatible services, implement REST API fallback (see `authService.ts` pattern).
- **New tree group**: Add a node type in `nodes.ts`, add as child of `ConnectionNode` in its `getChildren()`.
- **New command**: Register in the appropriate `src/commands/*.ts` file, add to `package.json` contributes commands/menus, and wire in `commands/index.ts`.
- **New webview**: Extend `WebviewBase`, create a panel class, add media assets in `src/webview/media/`, add protocol messages in `protocol.ts`. Webview panels should lazily initialize services via `getService()` pattern for OAuth compatibility.
