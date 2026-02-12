// @ts-check

const vscode = acquireVsCodeApi();

/** @type {string[]} */
let pageStack = [];
/** @type {string} */
let collectionPath = "";
/** @type {number} */
let pageSize = 25;

/**
 * @param {string} path
 * @param {number} size
 */
function initCollectionTable(path, size) {
    collectionPath = path;
    pageSize = size;

    window.addEventListener("message", (event) => {
        const msg = event.data;
        if (msg.type === "pageLoaded") {
            renderTable(msg.docs, msg.hasMore);
        }
    });

    document.getElementById("prevBtn")?.addEventListener("click", () => {
        pageStack.pop();
        const startAfter = pageStack.length > 0 ? pageStack[pageStack.length - 1] : undefined;
        loadPage(startAfter);
    });

    document.getElementById("nextBtn")?.addEventListener("click", () => {
        const rows = document.querySelectorAll("#docTable tbody tr");
        if (rows.length > 0) {
            const lastId = rows[rows.length - 1].getAttribute("data-id") || "";
            pageStack.push(lastId);
            loadPage(lastId);
        }
    });

    document.getElementById("newDocBtn")?.addEventListener("click", () => {
        vscode.postMessage({ type: "openDocument", docPath: "" });
    });
}

/**
 * @param {string} [startAfterDocId]
 */
function loadPage(startAfterDocId) {
    vscode.postMessage({
        type: "loadPage",
        collectionPath,
        startAfterDocId,
        pageSize,
    });
}

/**
 * @param {{ id: string; path: string; fields: Record<string, unknown> }[]} docs
 * @param {boolean} hasMore
 */
function renderTable(docs, hasMore) {
    const container = document.getElementById("tableContainer");
    if (!container) { return; }

    if (docs.length === 0) {
        container.innerHTML = "<p class='empty'>No documents found.</p>";
        return;
    }

    const allKeys = new Set();
    docs.forEach((doc) => Object.keys(doc.fields).forEach((k) => allKeys.add(k)));
    const keys = Array.from(allKeys).slice(0, 8);

    let html = `<vscode-table zebra-bordered-rows>
        <vscode-table-header slot="header">
            <vscode-table-header-cell>ID</vscode-table-header-cell>`;
    keys.forEach((k) => { html += `<vscode-table-header-cell>${escapeHtml(String(k))}</vscode-table-header-cell>`; });
    html += `</vscode-table-header>
        <vscode-table-body slot="body">`;

    docs.forEach((doc) => {
        html += `<vscode-table-row data-id="${escapeHtml(doc.id)}" data-path="${escapeHtml(doc.path)}" class="clickable">`;
        html += `<vscode-table-cell>${escapeHtml(doc.id)}</vscode-table-cell>`;
        keys.forEach((k) => {
            const val = doc.fields[String(k)];
            html += `<vscode-table-cell>${escapeHtml(preview(val))}</vscode-table-cell>`;
        });
        html += "</vscode-table-row>";
    });

    html += `</vscode-table-body></vscode-table>`;
    container.innerHTML = html;

    document.querySelectorAll("vscode-table-row.clickable").forEach((row) => {
        row.addEventListener("click", () => {
            const docPath = row.getAttribute("data-path");
            if (docPath) {
                vscode.postMessage({ type: "openDocument", docPath });
            }
        });
    });

    const prevBtn = document.getElementById("prevBtn");
    const nextBtn = document.getElementById("nextBtn");
    if (prevBtn) { prevBtn.disabled = pageStack.length === 0; }
    if (nextBtn) { nextBtn.disabled = !hasMore; }
}

/**
 * @param {unknown} value
 * @returns {string}
 */
function preview(value) {
    if (value === null || value === undefined) { return ""; }
    if (typeof value === "object") { return JSON.stringify(value).slice(0, 50); }
    return String(value).slice(0, 50);
}

/**
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}
