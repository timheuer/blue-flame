// Extension → Webview messages
export type ExtensionToWebviewMessage =
    | PageLoadedMessage
    | DocumentLoadedMessage
    | SaveResultMessage
    | UserLoadedMessage
    | UserSaveResultMessage
    | StorageFileLoadedMessage;

export interface PageLoadedMessage {
    type: "pageLoaded";
    docs: { id: string; path: string; fields: Record<string, unknown> }[];
    hasMore: boolean;
    collectionPath: string;
}

export interface DocumentLoadedMessage {
    type: "documentLoaded";
    docPath: string;
    exists: boolean;
    data: Record<string, unknown> | null;
}

export interface SaveResultMessage {
    type: "saveResult";
    success: boolean;
    error?: string;
}

export interface UserLoadedMessage {
    type: "userLoaded";
    user: {
        uid: string;
        email?: string;
        emailVerified: boolean;
        displayName?: string;
        photoURL?: string;
        phoneNumber?: string;
        disabled: boolean;
        metadata: {
            creationTime?: string;
            lastSignInTime?: string;
            lastRefreshTime?: string | null;
        };
        providerData: Array<{
            uid: string;
            displayName?: string;
            email?: string;
            phoneNumber?: string;
            photoURL?: string;
            providerId: string;
        }>;
        customClaims?: Record<string, unknown>;
    };
}

export interface UserSaveResultMessage {
    type: "userSaveResult";
    success: boolean;
    error?: string;
}

export interface StorageFileLoadedMessage {
    type: "storageFileLoaded";
    filePath: string;
    contentType: string;
    size: number;
    dataUrl?: string;
    textContent?: string;
    downloadUrl?: string;
    error?: string;
}

// Webview → Extension messages
export type WebviewToExtensionMessage =
    | LoadPageMessage
    | OpenDocumentMessage
    | LoadDocumentMessage
    | SaveDocumentMessage
    | DeleteDocumentMessage
    | OpenInNativeEditorMessage
    | LoadUserMessage
    | SaveUserMessage
    | DeleteUserMessage
    | ToggleUserDisabledMessage
    | RevokeTokensMessage
    | SaveCustomClaimsMessage
    | LoadStorageFileMessage
    | CopyStorageUrlMessage;

export interface LoadPageMessage {
    type: "loadPage";
    collectionPath: string;
    startAfterDocId?: string;
    pageSize: number;
}

export interface OpenDocumentMessage {
    type: "openDocument";
    docPath: string;
}

export interface LoadDocumentMessage {
    type: "loadDocument";
    docPath: string;
}

export interface SaveDocumentMessage {
    type: "saveDocument";
    docPath: string;
    data: Record<string, unknown>;
    merge: boolean;
}

export interface DeleteDocumentMessage {
    type: "deleteDocument";
    docPath: string;
}

export interface OpenInNativeEditorMessage {
    type: "openInNativeEditor";
    docPath: string;
}

export interface LoadUserMessage {
    type: "loadUser";
    uid: string;
}

export interface SaveUserMessage {
    type: "saveUser";
    uid: string;
    properties: {
        email?: string;
        password?: string;
        displayName?: string | null;
        phoneNumber?: string | null;
        photoURL?: string | null;
        disabled?: boolean;
        emailVerified?: boolean;
    };
}

export interface DeleteUserMessage {
    type: "deleteUser";
    uid: string;
}

export interface ToggleUserDisabledMessage {
    type: "toggleUserDisabled";
    uid: string;
    disabled: boolean;
}

export interface RevokeTokensMessage {
    type: "revokeTokens";
    uid: string;
}

export interface SaveCustomClaimsMessage {
    type: "saveCustomClaims";
    uid: string;
    claims: Record<string, unknown> | null;
}

export interface LoadStorageFileMessage {
    type: "loadStorageFile";
    filePath: string;
}

export interface CopyStorageUrlMessage {
    type: "copyStorageUrl";
    urlType: "gs" | "public" | "download";
}
