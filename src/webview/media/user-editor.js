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

/** @type {string} */
let currentUid = "";
/** @type {boolean} */
let isNewUser = false;

/**
 * @param {string} uid
 * @param {boolean} isNew
 */
function initUserEditor(uid, isNew) {
    currentUid = uid;
    isNewUser = isNew;

    window.addEventListener("message", (event) => {
        const msg = event.data;
        switch (msg.type) {
            case "userLoaded":
                populateForm(msg.user);
                break;
            case "userSaveResult":
                showStatus(msg.success ? "Saved successfully" : `Error: ${msg.error}`, msg.success);
                break;
        }
    });

    document.getElementById("saveBtn")?.addEventListener("click", saveUser);
    document.getElementById("deleteBtn")?.addEventListener("click", deleteUser);
    document.getElementById("revokeBtn")?.addEventListener("click", revokeTokens);
    document.getElementById("saveClaimsBtn")?.addEventListener("click", saveCustomClaims);
    document.getElementById("photoURL")?.addEventListener("input", updatePhotoPreview);

    if (!isNewUser) {
        // Show additional buttons for existing users
        const deleteBtn = document.getElementById("deleteBtn");
        const revokeBtn = document.getElementById("revokeBtn");
        if (deleteBtn) { deleteBtn.style.display = "inline-block"; }
        if (revokeBtn) { revokeBtn.style.display = "inline-block"; }

        vscode.postMessage({ type: "loadUser", uid: currentUid });
    }
}

/**
 * @param {object} user
 */
function populateForm(user) {
    setValue("uid", user.uid);
    setValue("email", user.email || "");
    setValue("displayName", user.displayName || "");
    setValue("phoneNumber", user.phoneNumber || "");
    setValue("photoURL", user.photoURL || "");
    setChecked("emailVerified", user.emailVerified);
    setChecked("disabled", user.disabled);
    updatePhotoPreview();

    // Show metadata section
    const metadataSection = document.getElementById("metadata");
    if (metadataSection && user.metadata) {
        metadataSection.style.display = "block";
        setText("creationTime", formatDate(user.metadata.creationTime));
        setText("lastSignInTime", formatDate(user.metadata.lastSignInTime));
        setText("lastRefreshTime", formatDate(user.metadata.lastRefreshTime));
    }

    // Show providers section
    const providersSection = document.getElementById("providers");
    const providerList = document.getElementById("providerList");
    if (providersSection && providerList && user.providerData && user.providerData.length > 0) {
        providersSection.style.display = "block";
        providerList.innerHTML = user.providerData
            .map((p) => `<div class="provider-item"><strong>${escapeHtml(p.providerId)}</strong>: ${escapeHtml(p.email || p.phoneNumber || p.uid)}</div>`)
            .join("");
    }

    // Show custom claims section (always for existing users to allow adding)
    const claimsSection = document.getElementById("claims");
    const claimsField = document.getElementById("customClaims");
    if (claimsSection && claimsField) {
        claimsSection.style.display = "block";
        if (user.customClaims && Object.keys(user.customClaims).length > 0) {
            claimsField.value = JSON.stringify(user.customClaims, null, 2);
        } else {
            claimsField.value = "{}";
        }
    }
}

function saveUser() {
    const properties = {};

    const email = getValue("email");
    const password = getValue("password");
    const displayName = getValue("displayName");
    const phoneNumber = getValue("phoneNumber");
    const photoURL = getValue("photoURL");
    const emailVerified = getChecked("emailVerified");
    const disabled = getChecked("disabled");

    if (email) { properties.email = email; }
    if (password) { properties.password = password; }
    if (displayName !== undefined) { properties.displayName = displayName || null; }
    if (phoneNumber !== undefined) { properties.phoneNumber = phoneNumber || null; }
    if (photoURL !== undefined) { properties.photoURL = photoURL || null; }
    properties.emailVerified = emailVerified;
    properties.disabled = disabled;

    vscode.postMessage({
        type: "saveUser",
        uid: currentUid,
        properties,
    });
}

function deleteUser() {
    vscode.postMessage({ type: "deleteUser", uid: currentUid });
}

function revokeTokens() {
    vscode.postMessage({ type: "revokeTokens", uid: currentUid });
}

function saveCustomClaims() {
    const claimsField = document.getElementById("customClaims");
    if (!claimsField) { return; }
    try {
        const claimsText = claimsField.value.trim();
        const claims = claimsText ? JSON.parse(claimsText) : null;
        vscode.postMessage({ type: "saveCustomClaims", uid: currentUid, claims });
    } catch (err) {
        showStatus("Invalid JSON in custom claims", false);
    }
}

/**
 * @param {string} id
 * @param {string} value
 */
function setValue(id, value) {
    const el = document.getElementById(id);
    if (el) { el.value = value; }
}

/**
 * @param {string} id
 * @returns {string}
 */
function getValue(id) {
    const el = document.getElementById(id);
    return el ? el.value : "";
}

/**
 * @param {string} id
 * @param {boolean} checked
 */
function setChecked(id, checked) {
    const el = document.getElementById(id);
    if (el) { el.checked = checked; }
}

/**
 * @param {string} id
 * @returns {boolean}
 */
function getChecked(id) {
    const el = document.getElementById(id);
    return el ? el.checked : false;
}

/**
 * @param {string} id
 * @param {string} text
 */
function setText(id, text) {
    const el = document.getElementById(id);
    if (el) { el.textContent = text; }
}

/**
 * @param {string | null | undefined} dateStr
 * @returns {string}
 */
function formatDate(dateStr) {
    if (!dateStr) { return "-"; }
    try {
        return new Date(dateStr).toLocaleString();
    } catch {
        return dateStr;
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

function updatePhotoPreview() {
    const photoURL = getValue("photoURL");
    const preview = document.getElementById("photoPreview");
    if (!preview) { return; }
    if (photoURL && isValidUrl(photoURL)) {
        preview.src = photoURL;
        preview.style.display = "block";
    } else {
        preview.style.display = "none";
        preview.src = "";
    }
}

/**
 * @param {string} str
 * @returns {boolean}
 */
function isValidUrl(str) {
    try {
        const url = new URL(str);
        return url.protocol === "https:" || url.protocol === "http:";
    } catch {
        return false;
    }
}
