# Privacy Policy

**Blue Flame** is a VS Code extension that allows you to browse and manage Google Cloud Firestore databases. This document describes how the extension handles your data.

## Data Collection

**Blue Flame does not collect, transmit, or store any personal data on external servers controlled by the extension author.** The extension operates entirely within your local VS Code environment and communicates directly with your own Firebase/Google Cloud projects.

## Data Storage

The extension stores the following information locally on your machine using VS Code's built-in `globalState` storage:

- **Connection metadata**: Connection names, Firebase project IDs, database IDs, and authentication mode (ADC or service account)
- **Service account file paths**: If you use service account authentication, the file path to your JSON key file is stored (the file contents are not copied or stored by the extension)

This data is stored in VS Code's extension storage directory and is not transmitted externally.

## External Communications

The extension communicates only with:

- **Google Cloud / Firebase APIs**: To read and write Firestore data, manage Firebase Authentication users, and perform other Firebase operations using your own credentials
- **VS Code Marketplace**: Standard VS Code extension update checks (handled by VS Code, not the extension)

All communications with Firebase/Google Cloud use your own credentials (Application Default Credentials or your service account) and are subject to Google's [Privacy Policy](https://policies.google.com/privacy) and [Terms of Service](https://cloud.google.com/terms/).

## Credentials

The extension supports two authentication methods:

1. **Application Default Credentials (ADC)**: Uses credentials configured via `gcloud auth application-default login`. These credentials are managed by the Google Cloud SDK on your machine.
2. **Service Account JSON**: Uses a service account key file you provide. The extension reads this file at runtime but does not copy, cache, or transmit the file contents except to Google's authentication services.

**You are responsible for protecting your credentials.** Do not share service account files or commit them to version control.

## Telemetry

Blue Flame does not implement any custom telemetry or analytics. The extension does not track usage, collect error reports, or phone home.

VS Code itself may collect telemetry based on your VS Code settings. See the [VS Code Privacy Statement](https://code.visualstudio.com/docs/getstarted/telemetry) for details.

## Data You Access

When using the extension, you interact with data stored in your own Firebase projects. The extension provides a user interface for reading, creating, updating, and deleting:

- Firestore documents and collections
- Firebase Authentication users

This data is stored in and retrieved from your Firebase project, subject to your Firebase project's security rules and Google Cloud's data handling policies.

## Your Control

- **Remove connections**: Delete saved connections at any time via the extension's context menu
- **Revoke credentials**: Revoke ADC with `gcloud auth application-default revoke` or delete/disable service account keys in the Google Cloud Console
- **Uninstall**: Uninstalling the extension removes all locally stored connection metadata

## Third-Party Services

The extension depends on:

- **firebase-admin** (Google): Official Firebase Admin SDK for Node.js
- **@vscode-elements/elements**: UI components for webviews (no network activity)

## Changes to This Policy

Any changes to this privacy policy will be documented in the repository's commit history and noted in the [CHANGELOG](CHANGELOG.md).

## Contact

If you have questions about this privacy policy, please open an issue at [github.com/timheuer/blue-flame/issues](https://github.com/timheuer/blue-flame/issues).

---

*Last updated: February 2026*
