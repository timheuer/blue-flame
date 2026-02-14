import { FieldPath, Timestamp, GeoPoint } from "@google-cloud/firestore";
import type { Firestore, DocumentSnapshot, Query } from "@google-cloud/firestore";
import { logger } from "../extension";

/**
 * Recursively converts plain objects back to Firestore native types.
 * Handles Timestamp and GeoPoint which get serialized to plain objects in JSON.
 */
function reconstructFirestoreTypes(data: unknown): unknown {
    if (data === null || data === undefined) {
        return data;
    }

    if (Array.isArray(data)) {
        return data.map(reconstructFirestoreTypes);
    }

    if (typeof data === "object") {
        const obj = data as Record<string, unknown>;

        // Check for Timestamp pattern: { _seconds: number, _nanoseconds: number }
        if (
            typeof obj._seconds === "number" &&
            typeof obj._nanoseconds === "number" &&
            Object.keys(obj).length === 2
        ) {
            return new Timestamp(obj._seconds, obj._nanoseconds);
        }

        // Check for GeoPoint pattern: { _latitude: number, _longitude: number }
        if (
            typeof obj._latitude === "number" &&
            typeof obj._longitude === "number" &&
            Object.keys(obj).length === 2
        ) {
            return new GeoPoint(obj._latitude, obj._longitude);
        }

        // Recursively process nested objects
        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(obj)) {
            result[key] = reconstructFirestoreTypes(value);
        }
        return result;
    }

    return data;
}

export interface CollectionRefInfo {
    id: string;
    path: string;
}

export interface PageResult<T> {
    docs: T[];
    hasMore: boolean;
}

export interface ListDocumentsOptions {
    pageSize: number;
    startAfterDocId?: string;
    orderByField?: string;
}

export class FirestoreService {
    private readonly db: Firestore;

    constructor(firestore: Firestore) {
        this.db = firestore;
    }

    async listRootCollections(): Promise<CollectionRefInfo[]> {
        logger.debug("Listing root collections");
        const collections = await this.db.listCollections();
        logger.debug(`Found ${collections.length} root collections`);
        return collections.map((c) => ({ id: c.id, path: c.path }));
    }

    async listDocuments(
        collectionPath: string,
        options: ListDocumentsOptions
    ): Promise<PageResult<DocumentSnapshot>> {
        logger.debug(`Listing documents in ${collectionPath} (pageSize: ${options.pageSize}, startAfter: ${options.startAfterDocId || "none"})`);
        let query: Query = this.db
            .collection(collectionPath)
            .orderBy(FieldPath.documentId())
            .limit(options.pageSize + 1);

        if (options.startAfterDocId) {
            query = query.startAfter(options.startAfterDocId);
        }

        const snapshot = await query.get();
        const hasMore = snapshot.docs.length > options.pageSize;
        const docs = hasMore ? snapshot.docs.slice(0, options.pageSize) : snapshot.docs;
        logger.debug(`Retrieved ${docs.length} documents (hasMore: ${hasMore})`);

        return { docs, hasMore };
    }

    async getDocument(
        docPath: string
    ): Promise<{ exists: boolean; data: Record<string, unknown> | null }> {
        logger.debug(`Getting document: ${docPath}`);
        const snap = await this.db.doc(docPath).get();
        logger.debug(`Document ${docPath} exists: ${snap.exists}`);
        return {
            exists: snap.exists,
            data: snap.exists ? (snap.data() as Record<string, unknown>) : null,
        };
    }

    async setDocument(
        docPath: string,
        data: Record<string, unknown>,
        options: { merge: boolean }
    ): Promise<void> {
        logger.debug(`Setting document: ${docPath} (merge: ${options.merge})`);
        const reconstructedData = reconstructFirestoreTypes(data) as Record<string, unknown>;
        logger.debug(`Document data: ${JSON.stringify(data)}`);
        await this.db.doc(docPath).set(reconstructedData, { merge: options.merge });
        logger.info(`Document saved: ${docPath}`);
    }

    async addDocument(
        collectionPath: string,
        data: Record<string, unknown>
    ): Promise<string> {
        logger.debug(`Adding new document to collection: ${collectionPath}`);
        const reconstructedData = reconstructFirestoreTypes(data) as Record<string, unknown>;
        const ref = await this.db.collection(collectionPath).add(reconstructedData);
        logger.info(`Document created: ${ref.path}`);
        return ref.id;
    }

    async deleteDocument(docPath: string): Promise<void> {
        logger.debug(`Deleting document: ${docPath}`);
        await this.db.doc(docPath).delete();
        logger.info(`Document deleted: ${docPath}`);
    }

    async listSubcollections(docPath: string): Promise<CollectionRefInfo[]> {
        logger.debug(`Listing subcollections for: ${docPath}`);
        const collections = await this.db.doc(docPath).listCollections();
        logger.debug(`Found ${collections.length} subcollections`);
        return collections.map((c) => ({ id: c.id, path: c.path }));
    }

    async countDocuments(collectionPath: string): Promise<number> {
        logger.debug(`Counting documents in: ${collectionPath}`);
        const snapshot = await this.db.collection(collectionPath).count().get();
        const count = snapshot.data().count;
        logger.debug(`Collection ${collectionPath} has ${count} documents`);
        return count;
    }
}
