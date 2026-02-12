// @ts-check

const vscode = acquireVsCodeApi();

/** @type {string} */
let currentDocPath = "";

/**
 * @param {string} docPath
 */
function initDocumentEditor(docPath) {
    currentDocPath = docPath;

    window.addEventListener("message", (event) => {
        const msg = event.data;
        switch (msg.type) {
            case "documentLoaded":
                setEditorContent(msg.data);
                break;
            case "saveResult":
                showStatus(msg.success ? "Saved successfully" : `Error: ${msg.error}`, msg.success);
                break;
        }
    });

    document.getElementById("saveBtn")?.addEventListener("click", () => {
        const editor = document.getElementById("jsonEditor");
        const mergeToggle = document.getElementById("mergeToggle");
        if (!editor) { return; }

        try {
            const data = JSON.parse(editor.value);
            vscode.postMessage({
                type: "saveDocument",
                docPath: currentDocPath,
                data,
                merge: mergeToggle?.checked ?? true,
            });
        } catch {
            showStatus("Invalid JSON", false);
        }
    });

    document.getElementById("deleteBtn")?.addEventListener("click", () => {
        vscode.postMessage({ type: "deleteDocument", docPath: currentDocPath });
    });

    document.getElementById("openNativeBtn")?.addEventListener("click", () => {
        vscode.postMessage({ type: "openInNativeEditor", docPath: currentDocPath });
    });

    vscode.postMessage({ type: "loadDocument", docPath: currentDocPath });
}

/**
 * @param {Record<string, unknown> | null} data
 */
function setEditorContent(data) {
    const editor = document.getElementById("jsonEditor");
    if (editor) {
        editor.value = data ? JSON.stringify(data, null, 2) : "{}";
    }
}

/**
 * @param {string} message
 * @param {boolean} success
 */
function showStatus(message, success) {
    const el = document.getElementById("statusMessage");
    if (el) {
        el.textContent = message;
        el.className = success ? "status-success" : "status-error";
        setTimeout(() => { el.textContent = ""; }, 3000);
    }
}
