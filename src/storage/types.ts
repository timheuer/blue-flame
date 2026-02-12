export interface Connection {
    id: string;
    name: string;
    projectId: string;
    databaseId: string;
    authMode: "adc" | "serviceAccountPath" | "googleOAuth";
    serviceAccountPath?: string;
}
