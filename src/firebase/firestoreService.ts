import { getFirestore, FieldPath } from "firebase-admin/firestore";
import type { Firestore, DocumentSnapshot, Query } from "firebase-admin/firestore";
import type { App } from "firebase-admin/app";
import { logger } from "../extension";

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

    constructor(app: App, databaseId: string) {
        if (databaseId && databaseId !== "(default)") {
            this.db = getFirestore(app, databaseId);
        } else {
            this.db = getFirestore(app);
        }
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
        await this.db.doc(docPath).set(data, { merge: options.merge });
        logger.info(`Document saved: ${docPath}`);
    }

    async addDocument(
        collectionPath: string,
        data: Record<string, unknown>
    ): Promise<string> {
        logger.debug(`Adding new document to collection: ${collectionPath}`);
        const ref = await this.db.collection(collectionPath).add(data);
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
}
