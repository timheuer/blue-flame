import * as vscode from "vscode";
import { Connection } from "./types";

const STORAGE_KEY = "blue-flame.connections";

export class ConnectionStorage {
    constructor(private readonly context: vscode.ExtensionContext) {}

    getAll(): Connection[] {
        return this.context.globalState.get<Connection[]>(STORAGE_KEY, []);
    }

    get(id: string): Connection | undefined {
        return this.getAll().find((c) => c.id === id);
    }

    async add(connection: Connection): Promise<void> {
        const all = this.getAll();
        all.push(connection);
        await this.context.globalState.update(STORAGE_KEY, all);
    }

    async remove(id: string): Promise<void> {
        const all = this.getAll().filter((c) => c.id !== id);
        await this.context.globalState.update(STORAGE_KEY, all);
    }

    async update(connection: Connection): Promise<void> {
        const all = this.getAll().map((c) =>
            c.id === connection.id ? connection : c
        );
        await this.context.globalState.update(STORAGE_KEY, all);
    }
}
