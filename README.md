# Blue Flame 🔥

A VS Code extension for browsing and managing Google Cloud Firestore databases and Firebase Authentication users. Navigate collections and documents in a tree view, browse collections in tabular webview panels, edit document JSON, and manage authentication users — all without leaving your editor.

<img width="1715" height="990" alt="image" src="https://github.com/user-attachments/assets/6263a745-099b-4d7b-8bcb-bd006baa5594" />


## Features

### Firestore

- **Multi-connection support** — Connect to multiple Firebase projects simultaneously
- **Tree-based navigation** — Explore Firestore collections, documents, and subcollections in the VS Code sidebar
- **Collection table view** — Browse documents in a paginated tabular webview with field previews
- **Document editor** — View and edit document JSON with merge or replace save modes (webview panel or native VS Code editor)
- **CRUD operations** — Create, read, update, and delete documents from the tree or webview panels
- **Cursor-based pagination** — Efficiently page through large collections
- **Copy document path** — Copy the full document path for use in code or queries

### Firebase Authentication

- **User management** — List, create, edit, and delete Firebase Authentication users
- **User search** — Search users by email, UID, or phone number
- **Account controls** — Enable or disable user accounts directly from the tree view
- **User details editor** — Edit user properties (email, display name, phone, password) in a webview panel
- **Paginated user list** — Efficiently browse large user bases with "Load more" pagination

### Authentication Methods

- **Google OAuth** — Sign in with your Google account directly in VS Code
- **Application Default Credentials (ADC)** — Use `gcloud auth application-default login`
- **Service Account JSON** — Use a service account key file

## Getting Started

### Prerequisites

- [VS Code](https://code.visualstudio.com/) 1.109.0 or later
- A Google Cloud project with Firestore and/or Firebase Authentication enabled
- One of the following authentication methods:
  - **Google OAuth** — Sign in via VS Code's authentication system
  - **Application Default Credentials (ADC)** — Run `gcloud auth application-default login` ([Google Cloud CLI](https://cloud.google.com/sdk/docs/install))
  - **Service Account JSON** — Download a service account key file from the [Firebase Console](https://console.firebase.google.com/)

### Installation

Install **Blue Flame** from the VS Code Marketplace, or search for "Blue Flame" in the Extensions view (`Ctrl+Shift+X`).

### Adding a Connection

1. Open the **Blue Flame** panel in the Activity Bar (🔥 icon)
2. Click the **+** button in the Firestore Explorer title bar
3. Enter a connection name and your Firebase Project ID
4. Choose your authentication mode (Google OAuth, ADC, or Service Account JSON)
5. Optionally specify a database ID (defaults to `(default)`)

### Browsing Firestore Data

- **Expand** a connection → Firestore → collections → documents → subcollections
- **Right-click** a collection → **View Collection** to open the tabular browser
- **Right-click** a document → **View Document**, **Edit Document**, or **Open in Editor**
- **Right-click** a document → **Copy Document Path** to copy the full path

### Managing Documents

- **New Document** — Right-click a collection → **New Document** (auto-ID or specify an ID)
- **Edit Document** — Open the JSON editor, modify fields, toggle merge/replace, and click **Save**
- **Delete Document** — Right-click a document → **Delete Document** (with confirmation)

### Managing Users

- **Expand** a connection → Authentication to view users
- **Search Users** — Click the search icon to find users by email, UID, or phone
- **New User** — Click the **+** button or right-click → **New User**
- **Edit User** — Right-click a user → **Edit User** to open the user editor
- **Disable/Enable** — Right-click a user → **Disable User** or **Enable User**
- **Delete User** — Right-click a user → **Delete User** (with confirmation)

## Commands

### Connection Commands
| Command | Description |
|---------|-------------|
| `Blue Flame: Add Connection` | Add a new Firebase connection |
| `Blue Flame: Remove Connection` | Remove a saved connection |
| `Blue Flame: Refresh` | Refresh the entire Explorer tree |

### Firestore Commands
| Command | Description |
|---------|-------------|
| `Blue Flame: View Collection` | Open collection in a tabular webview |
| `Blue Flame: Refresh Collection` | Refresh documents in a collection |
| `Blue Flame: Refresh Collections` | Refresh all collections in a connection |
| `Blue Flame: View Document` | View document JSON in webview |
| `Blue Flame: Edit Document` | Edit document JSON with save/delete |
| `Blue Flame: Open in Editor` | Open document in VS Code's native editor |
| `Blue Flame: New Document` | Create a new document in a collection |
| `Blue Flame: Delete Document` | Delete a document |
| `Blue Flame: Copy Document Path` | Copy the document's full path |

### Authentication Commands
| Command | Description |
|---------|-------------|
| `Blue Flame: New User` | Create a new Firebase Authentication user |
| `Blue Flame: Edit User` | Edit user details in webview panel |
| `Blue Flame: Delete User` | Delete a user |
| `Blue Flame: Disable User` | Disable a user account |
| `Blue Flame: Enable User` | Enable a disabled user account |
| `Blue Flame: Search Users` | Search users by email, UID, or phone |
| `Blue Flame: Refresh Users` | Refresh the user list |

## Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| `blue-flame.logLevel` | enum | `info` | Log level (`off`, `error`, `warn`, `info`, `debug`, `trace`) |
| `blue-flame.pageSize` | number | `25` | Documents per page in tree view and collection tables (1–100) |
| `blue-flame.userListPageSize` | number | `25` | Users per page in Authentication tree (1–1000) |
| `blue-flame.defaultMergeOnSave` | boolean | `true` | Merge with existing data vs overwrite when saving documents |
| `blue-flame.documentOpenBehavior` | enum | `nativeEditor` | How to open documents: `nativeEditor` or `webviewPanel` |

## Development

```bash
npm install            # Install dependencies
npm run compile        # Type-check + lint + build
npm run watch          # Watch mode for development
npm test               # Run tests
```

Press **F5** to launch the Extension Development Host.

## License

[MIT](LICENSE) © Tim Heuer
