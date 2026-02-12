// @ts-check

const vscode = acquireVsCodeApi();

/**
 * Escapes HTML special characters to prevent XSS
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
    if (text === null || text === undefined) { return ""; }
    const div = document.createElement("div");
    div.textContent = String(text);
    return div.innerHTML;
}

/**
 * Formats file size in human-readable format
 * @param {number} bytes
 * @returns {string}
 */
function formatFileSize(bytes) {
    if (bytes === 0) { return "0 B"; }
    const units = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    const size = bytes / Math.pow(1024, i);
    return `${size.toFixed(i > 0 ? 2 : 0)} ${units[i]}`;
}

/**
 * Gets the file extension from content type or filename
 * @param {string} contentType
 * @param {string} filePath
 * @returns {string}
 */
function getFileExtension(contentType, filePath) {
    // Try to get from filename first
    const dotIndex = filePath.lastIndexOf(".");
    if (dotIndex !== -1) {
        return filePath.substring(dotIndex + 1).toLowerCase();
    }
    // Fall back to content type mapping
    const typeMap = {
        "application/json": "json",
        "application/javascript": "js",
        "application/typescript": "ts",
        "application/xml": "xml",
        "application/x-yaml": "yaml",
        "application/x-sh": "sh",
        "text/html": "html",
        "text/css": "css",
        "text/markdown": "md",
        "text/plain": "txt",
    };
    return typeMap[contentType] || "txt";
}

/** @type {{ filePath: string; bucketName: string; contentType: string; size: number; gsUrl: string }} */
let fileInfo = { filePath: "", bucketName: "", contentType: "", size: 0, gsUrl: "" };

/** @type {string | undefined} */
let currentDownloadUrl;

/**
 * @param {{ filePath: string; bucketName: string; contentType: string; size: number; gsUrl: string }} info
 */
function initStoragePreview(info) {
    fileInfo = info;

    window.addEventListener("message", (event) => {
        const msg = event.data;
        switch (msg.type) {
            case "storageFileLoaded":
                handleFileLoaded(msg);
                break;
        }
    });

    document.getElementById("copyGsUrl")?.addEventListener("click", () => {
        vscode.postMessage({ type: "copyStorageUrl", urlType: "gs" });
    });

    document.getElementById("copyPublicUrl")?.addEventListener("click", () => {
        vscode.postMessage({ type: "copyStorageUrl", urlType: "public" });
    });

    document.getElementById("downloadBtn")?.addEventListener("click", () => {
        if (currentDownloadUrl) {
            // Open in new window/tab to trigger download
            vscode.postMessage({ type: "copyStorageUrl", urlType: "download" });
        }
    });

    document.getElementById("refreshBtn")?.addEventListener("click", () => {
        showLoading();
        vscode.postMessage({ type: "loadStorageFile", filePath: fileInfo.filePath });
    });

    // Request initial load
    vscode.postMessage({ type: "loadStorageFile", filePath: fileInfo.filePath });
}

function showLoading() {
    const container = document.getElementById("previewContainer");
    if (container) {
        container.innerHTML = '<div class="loading">Loading preview...</div>';
    }
}

/**
 * @param {{ filePath: string; contentType: string; size: number; dataUrl?: string; textContent?: string; downloadUrl?: string; error?: string }} msg
 */
function handleFileLoaded(msg) {
    const container = document.getElementById("previewContainer");
    if (!container) { return; }

    currentDownloadUrl = msg.downloadUrl;

    if (msg.error) {
        container.innerHTML = `<div class="error-message">Error loading file: ${escapeHtml(msg.error)}</div>`;
        return;
    }

    if (msg.dataUrl && isImageType(msg.contentType)) {
        // Display image
        container.innerHTML = `
            <img 
                class="preview-image" 
                src="${escapeHtml(msg.dataUrl)}" 
                alt="${escapeHtml(getFileName(msg.filePath))}"
                onerror="this.parentElement.innerHTML='<div class=\\'error-message\\'>Failed to load image</div>'"
            >
        `;
    } else if (msg.textContent !== undefined) {
        // Display text/code
        const extension = getFileExtension(msg.contentType, msg.filePath);
        const formattedContent = formatTextContent(msg.textContent, msg.contentType);
        container.innerHTML = `
            <pre class="preview-code"><code class="language-${escapeHtml(extension)}">${escapeHtml(formattedContent)}</code></pre>
        `;
    } else if (msg.downloadUrl) {
        // Show download link for binary/large files
        container.innerHTML = `
            <div class="download-section">
                <p>This file cannot be previewed directly.</p>
                <p>File size: ${formatFileSize(msg.size)}</p>
                <p>Content type: ${escapeHtml(msg.contentType)}</p>
                <vscode-button id="downloadLink">
                    Copy Download URL
                </vscode-button>
            </div>
        `;
        document.getElementById("downloadLink")?.addEventListener("click", () => {
            vscode.postMessage({ type: "copyStorageUrl", urlType: "download" });
        });
    } else {
        container.innerHTML = '<div class="error-message">Unable to preview this file type.</div>';
    }
}

/**
 * @param {string} contentType
 * @returns {boolean}
 */
function isImageType(contentType) {
    return contentType.startsWith("image/");
}

/**
 * @param {string} filePath
 * @returns {string}
 */
function getFileName(filePath) {
    const parts = filePath.split("/");
    return parts[parts.length - 1] || filePath;
}

/**
 * @param {string} content
 * @param {string} contentType
 * @returns {string}
 */
function formatTextContent(content, contentType) {
    // Try to pretty-print JSON
    if (contentType === "application/json" || contentType.endsWith("+json")) {
        try {
            const parsed = JSON.parse(content);
            return JSON.stringify(parsed, null, 2);
        } catch {
            // Not valid JSON, return as-is
        }
    }
    return content;
}
