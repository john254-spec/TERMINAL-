const express = require("express");
const qrcode = require("qrcode");
const P = require("pino");
const fs = require("fs");
const axios = require("axios");

require("dotenv").config();

const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason
} = require("@whiskeysockets/baileys");

// =======================
// Express Server
// =======================

const app = express();

let currentQR = "";

// =======================
// HOME
// =======================

app.get("/", (req, res) => {
    res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>WhatsApp Bot</title>
</head>

<body style="
    font-family:Arial;
    text-align:center;
    margin-top:60px;
">

    <h1>WhatsApp Bot Running ✅</h1>

    <p>Server is online.</p>

    <p>
        <a href="/tiktok">
            TikTok Authentication
        </a>
    </p>

    <p>
        <a href="/tiktok/login">
            Login with TikTok
        </a>
    </p>

    <p>
        <a href="/health">
            Health Check
        </a>
    </p>

    <p>
        <a href="/qr">
            WhatsApp QR
        </a>
    </p>

</body>
</html>
    `);
});

// =======================
// HEALTH CHECK
// =======================

app.get("/health", (req, res) => {
    res.json({
        status: "online",
        tiktok: true,
        version: "tiktok-oauth-v1"
    });
});

// =======================
// WHATSAPP QR
// =======================

app.get("/qr", (req, res) => {

    if (!currentQR) {
        return res.send(
            "No QR available. WhatsApp bot may not be connected or may already be connected."
        );
    }

    res.send(`
<!DOCTYPE html>
<html>

<head>
    <title>WhatsApp QR</title>
</head>

<body style="
    text-align:center;
    font-family:Arial;
    margin-top:40px;
">

    <h2>WhatsApp QR Code</h2>

    <p>
        WhatsApp → Linked Devices → Link a Device
    </p>

    <img
        src="${currentQR}"
        alt="WhatsApp QR Code"
        width="300"
    >

</body>

</html>
    `);
});

// =======================
// TIKTOK AUTHENTICATION PAGE
// =======================

app.get("/tiktok", (req, res) => {

    res.send(`
<!DOCTYPE html>
<html>

<head>
    <title>TikTok Authentication</title>
</head>

<body style="
    font-family:Arial;
    text-align:center;
    margin-top:60px;
">

    <h1>TikTok Authentication</h1>

    <p>
        Connect your TikTok account to this application.
    </p>

    <a
        href="/tiktok/login"
        style="
            display:inline-block;
            padding:12px 20px;
            background:#000;
            color:#fff;
            text-decoration:none;
            border-radius:6px;
        "
    >
        Login with TikTok
    </a>

</body>

</html>
    `);
});

// =======================
// TIKTOK OAUTH LOGIN
// =======================

app.get("/tiktok/login", (req, res) => {

    const clientKey =
        process.env.TIKTOK_CLIENT_KEY;

    const redirectUri =
        process.env.TIKTOK_REDIRECT_URI;

    // Check Client Key
    if (!clientKey) {

        console.error(
            "TIKTOK_CLIENT_KEY is missing."
        );

        return res.status(500).send(
            "TIKTOK_CLIENT_KEY is missing from Render Environment Variables."
        );
    }

    // Check Redirect URI
    if (!redirectUri) {

        console.error(
            "TIKTOK_REDIRECT_URI is missing."
        );

        return res.status(500).send(
            "TIKTOK_REDIRECT_URI is missing from Render Environment Variables."
        );
    }

    // TikTok authorization parameters
    const params = new URLSearchParams({

        client_key:
            clientKey,

        response_type:
            "code",

        scope:
            "user.info.basic,video.list",

        redirect_uri:
            redirectUri,

        state:
            "tiktok_login"

    });

    const authorizationURL =
        "https://www.tiktok.com/v2/auth/authorize/?" +
        params.toString();

    console.log(
        "Redirecting to TikTok OAuth..."
    );

    console.log(
        "Redirect URI:",
        redirectUri
    );

    res.redirect(
        authorizationURL
    );
});

// =======================
// TIKTOK OAUTH CALLBACK
// =======================

app.get(
    "/tiktok/callback",
    async (req, res) => {

        const {
            code,
            state,
            error,
            error_description
        } = req.query;

        // =======================
        // TIKTOK ERROR
        // =======================

        if (error) {

            console.error(
                "TikTok returned an error:",
                error,
                error_description
            );

            return res.status(400).json({

                success: false,

                error:
                    error,

                error_description:
                    error_description ||
                    null

            });
        }

        // =======================
        // MISSING CODE
        // =======================

        if (!code) {

            return res.status(400).json({

                success: false,

                error:
                    "TikTok authorization code missing."

            });
        }

        // =======================
        // CHECK ENVIRONMENT
        // =======================

        if (!process.env.TIKTOK_CLIENT_KEY) {

            return res.status(500).json({

                success: false,

                error:
                    "TIKTOK_CLIENT_KEY is missing."

            });
        }

        if (!process.env.TIKTOK_CLIENT_SECRET) {

            return res.status(500).json({

                success: false,

                error:
                    "TIKTOK_CLIENT_SECRET is missing."

            });
        }

        if (!process.env.TIKTOK_REDIRECT_URI) {

            return res.status(500).json({

                success: false,

                error:
                    "TIKTOK_REDIRECT_URI is missing."

            });
        }

        // =======================
        // EXCHANGE CODE
        // =======================

        try {

            const params =
                new URLSearchParams();

            params.append(
                "client_key",
                process.env.TIKTOK_CLIENT_KEY
            );

            params.append(
                "client_secret",
                process.env.TIKTOK_CLIENT_SECRET
            );

            params.append(
                "code",
                code
            );

            params.append(
                "grant_type",
                "authorization_code"
            );

            params.append(
                "redirect_uri",
                process.env.TIKTOK_REDIRECT_URI
            );

            console.log(
                "Exchanging TikTok authorization code..."
            );

            const response =
                await axios.post(
                    "https://open.tiktokapis.com/v2/oauth/token/",
                    params.toString(),
                    {
                        headers: {
                            "Content-Type":
                                "application/x-www-form-urlencoded"
                        }
                    }
                );

            console.log(
                "TikTok OAuth successful."
            );

            console.log(
                "Open ID:",
                response.data.open_id
            );

            // =======================
            // SUCCESS
            // =======================

            res.json({

                success: true,

                message:
                    "TikTok authorization successful.",

                state:
                    state || null,

                open_id:
                    response.data.open_id ||
                    null,

                access_token_received:
                    !!response.data.access_token,

                refresh_token_received:
                    !!response.data.refresh_token,

                expires_in:
                    response.data.expires_in ||
                    null

            });

        } catch (error) {

            console.error(
                "TikTok OAuth error:"
            );

            console.error(
                error.response?.data ||
                error.message
            );

            res.status(500).json({

                success: false,

                error:
                    error.response?.data ||
                    error.message

            });
        }
    }
);

// =======================
// RENDER PORT
// =======================

const PORT =
    process.env.PORT || 3000;

app.listen(
    PORT,
    () => {

        console.log(
            `Server running on port ${PORT}`
        );

    }
);

// =======================
// STORAGE
// =======================

const savedUsers =
    new Set();

const messageStore =
    new Map();

// =======================
// START WHATSAPP BOT
// =======================

async function startBot() {

    try {

        const {
            state,
            saveCreds
        } =
            await useMultiFileAuthState(
                "auth_info"
            );

        const sock =
            makeWASocket({

                auth: state,

                logger: P({
                    level: "info"
                })

            });

        // =======================
        // SAVE CREDENTIALS
        // =======================

        sock.ev.on(
            "creds.update",
            saveCreds
        );

        // =======================
        // CONNECTION
        // =======================

        sock.ev.on(
            "connection.update",
            async (update) => {

                console.log(
                    "UPDATE:",
                    update
                );

                const {
                    connection,
                    qr,
                    lastDisconnect
                } = update;

                // =======================
                // QR CODE
                // =======================

                if (qr) {

                    console.log(
                        "New QR Code generated"
                    );

                    currentQR =
                        await qrcode.toDataURL(
                            qr
                        );

                    console.log(
                        "QR available at /qr"
                    );
                }

                // =======================
                // CONNECTED
                // =======================

                if (
                    connection === "open"
                ) {

                    currentQR = "";

                    console.log(
                        "WhatsApp Connected ✅"
                    );
                }

                // =======================
                // CONNECTION CLOSED
                // =======================

                if (
                    connection === "close"
                ) {

                    const statusCode =
                        lastDisconnect
                            ?.error
                            ?.output
                            ?.statusCode;

                    const reconnect =
                        statusCode !==
                        DisconnectReason.loggedOut;

                    if (reconnect) {

                        console.log(
                            "Reconnecting in 5 seconds..."
                        );

                        setTimeout(
                            () => {
                                startBot();
                            },
                            5000
                        );

                    } else {

                        console.log(
                            "Logged out. Scan QR again."
                        );

                    }
                }
            }
        );

        // =======================
        // MESSAGES
        // =======================

        sock.ev.on(
            "messages.upsert",
            async ({ messages }) => {

                const msg =
                    messages[0];

                if (!msg || !msg.message)
                    return;

                const jid =
                    msg.key.remoteJid;

                const text =
                    msg.message.conversation ||
                    msg.message.extendedTextMessage?.text ||
                    "";

                messageStore.set(
                    msg.key.id,
                    {
                        jid,
                        text
                    }
                );

                if (msg.key.fromMe)
                    return;

                const command =
                    text.trim().split(" ")[0];

                switch (command) {

                    // =======================
                    // HELP
                    // =======================

                    case "!help":

                        await sock.sendMessage(
                            jid,
                            {
                                text: `
Commands:

!help
!status
!myid
!id
!groups
!members
!users
!send text
!add number
!remove number
!promote
!demote
!deleteaccount
`
                            }
                        );

                        break;

                    // =======================
                    // STATUS
                    // =======================

                    case "!status":

                        await sock.sendMessage(
                            jid,
                            {
                                text:
                                    "Bot online ✅"
                            }
                        );

                        break;

                    // =======================
                    // MY ID
                    // =======================

                    case "!myid":

                        await sock.sendMessage(
                            jid,
                            {
                                text:
                                    `Bot ID:

${sock.user?.id || "Not available"}`
                            }
                        );

                        break;

                    // =======================
                    // ID
                    // =======================

                    case "!id":

                        await sock.sendMessage(
                            jid,
                            {
                                text:
                                    `
Chat ID:
${jid}

User ID:
${msg.key.participant || jid}
`
                            }
                        );

                        break;

                    // =======================
                    // GROUPS
                    // =======================

                    case "!groups": {

                        const groups =
                            await sock.groupFetchAllParticipating();

                        let groupList =
                            "Groups:\n\n";

                        Object.values(groups)
                            .forEach(
                                group => {

                                    groupList +=
                                        `
${group.subject}

ID:
${group.id}

----------------
`;

                                }
                            );

                        await sock.sendMessage(
                            jid,
                            {
                                text:
                                    groupList
                            }
                        );

                        break;
                    }

                    // =======================
                    // MEMBERS
                    // =======================

                    case "!members": {

                        if (
                            !jid.endsWith("@g.us")
                        ) {

                            await sock.sendMessage(
                                jid,
                                {
                                    text:
                                        "Use this command inside a group."
                                }
                            );

                            break;
                        }

                        const metadata =
                            await sock.groupMetadata(
                                jid
                            );

                        let members =
                            `
Group:
${metadata.subject}

ID:
${metadata.id}


Members:

`;

                        metadata.participants
                            .forEach(
                                member => {

                                    members +=
                                        `${member.id}\n`;

                                }
                            );

                        await sock.sendMessage(
                            jid,
                            {
                                text:
                                    members
                            }
                        );

                        break;
                    }

                    // =======================
                    // USERS
                    // =======================

                    case "!users": {

                        let users =
                            "Known WhatsApp Users:\n\n";

                        Object.values(
                            sock.contacts || {}
                        )
                            .forEach(
                                contact => {

                                    if (
                                        contact.id
                                    ) {

                                        users +=
                                            `${contact.name || "Unknown"}

${contact.id}

----------------

`;

                                    }
                                }
                            );

                        await sock.sendMessage(
                            jid,
                            {
                                text:
                                    users
                            }
                        );

                        break;
                    }

                    // =======================
                    // SEND
                    // =======================

                    case "!send": {

                        const sendText =
                            text
                                .replace(
                                    "!send",
                                    ""
                                )
                                .trim();

                        if (!sendText) {

                            await sock.sendMessage(
                                jid,
                                {
                                    text:
                                        "Usage: !send text"
                                }
                            );

                            break;
                        }

                        await sock.sendMessage(
                            jid,
                            {
                                text:
                                    sendText
                            }
                        );

                        break;
                    }

                    // =======================
                    // ADD USER
                    // =======================

                    case "!add": {

                        const number =
                            text.split(" ")[1];

                        if (!number) {

                            await sock.sendMessage(
                                jid,
                                {
                                    text:
                                        "Usage: !add number"
                                }
                            );

                            break;
                        }

                        savedUsers.add(
                            number
                        );

                        await sock.sendMessage(
                            jid,
                            {
                                text:
                                    `${number} added`
                            }
                        );

                        break;
                    }

                    // =======================
                    // REMOVE USER
                    // =======================

                    case "!remove": {

                        const remove =
                            text.split(" ")[1];

                        if (!remove) {

                            await sock.sendMessage(
                                jid,
                                {
                                    text:
                                        "Usage: !remove number"
                                }
                            );

                            break;
                        }

                        savedUsers.delete(
                            remove
                        );

                        await sock.sendMessage(
                            jid,
                            {
                                text:
                                    `${remove} removed`
                            }
                        );

                        break;
                    }

                    // =======================
                    // PROMOTE
                    // =======================

                    case "!promote":

                        if (
                            jid.endsWith("@g.us")
                        ) {

                            const participant =
                                msg.key.participant;

                            if (participant) {

                                await sock.groupParticipantsUpdate(
                                    jid,
                                    [
                                        participant
                                    ],
                                    "promote"
                                );

                            }
                        }

                        break;

                    // =======================
                    // DEMOTE
                    // =======================

                    case "!demote":

                        if (
                            jid.endsWith("@g.us")
                        ) {

                            const participant =
                                msg.key.participant;

                            if (participant) {

                                await sock.groupParticipantsUpdate(
                                    jid,
                                    [
                                        participant
                                    ],
                                    "demote"
                                );

                            }
                        }

                        break;

                    // =======================
                    // DELETE ACCOUNT
                    // =======================

                    case "!deleteaccount":

                        try {

                            await sock.sendMessage(
                                jid,
                                {
                                    text:
                                        "Deleting bot WhatsApp session..."
                                }
                            );

                        } catch (sendError) {

                            console.error(
                                "Could not send delete message:",
                                sendError.message
                            );

                        }

                        try {

                            await sock.logout();

                        } catch (logoutError) {

                            console.error(
                                "Logout error:",
                                logoutError.message
                            );

                        }

                        try {

                            if (
                                fs.existsSync(
                                    "auth_info"
                                )
                            ) {

                                fs.rmSync(
                                    "auth_info",
                                    {
                                        recursive: true,
                                        force: true
                                    }
                                );

                            }

                        } catch (fileError) {

                            console.error(
                                "Could not delete auth_info:",
                                fileError.message
                            );

                        }

                        break;

                    // =======================
                    // UNKNOWN COMMAND
                    // =======================

                    default:

                        break;
                }
            }
        );

    } catch (error) {

        console.error(
            "WhatsApp bot startup error:",
            error
        );

        setTimeout(
            () => {
                startBot();
            },
            5000
        );
    }
}

// ==================================================
// TEMPORARILY DISABLED
// ==================================================
//
// We are testing TikTok OAuth first.
// After TikTok works, change this:
//
// // startBot();
//
// to:
//
// startBot();
//
// ==================================================

// startBot();
