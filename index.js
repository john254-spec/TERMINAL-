
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
// Render Server
// =======================

const app = express();

let currentQR = "";

// =======================
// Home
// =======================

app.get("/", (req, res) => {
    res.send(`
        <h1>WhatsApp Bot Running ✅</h1>
        <p>Server is online.</p>
        <p><a href="/tiktok">TikTok Authentication</a></p>
        <p><a href="/tiktok/login">Login with TikTok</a></p>
        <p><a href="/health">Health Check</a></p>
        <p><a href="/qr">WhatsApp QR</a></p>
    `);
});

// =======================
// Health
// =======================

app.get("/health", (req, res) => {
    res.json({
        status: "online"
    });
});

// =======================
// WhatsApp QR Page
// =======================

app.get("/qr", (req, res) => {

    if (!currentQR) {
        return res.send(
            "No QR available. Bot may already be connected."
        );
    }

    res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>WhatsApp QR</title>
</head>

<body style="text-align:center;font-family:Arial;margin-top:40px;">

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
// TikTok Authentication Page
// =======================

app.get("/tiktok", (req, res) => {

    res.send(`
<!DOCTYPE html>
<html>

<head>
    <title>TikTok Authentication</title>
</head>

<body
    style="
        font-family:Arial;
        text-align:center;
        margin-top:60px;
    "
>

    <h1>TikTok Authentication</h1>

    <p>
        Connect your TikTok account.
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
// TikTok OAuth Login
// =======================

app.get("/tiktok/login", (req, res) => {

    const clientKey =
        process.env.TIKTOK_CLIENT_KEY;

    const redirectUri =
        process.env.TIKTOK_REDIRECT_URI;

    if (!clientKey) {

        return res.status(500).send(
            "TIKTOK_CLIENT_KEY is missing."
        );

    }

    if (!redirectUri) {

        return res.status(500).send(
            "TIKTOK_REDIRECT_URI is missing."
        );

    }

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

    res.redirect(
        authorizationURL
    );

});

// =======================
// TikTok OAuth Callback
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
        // TikTok Error
        // =======================

        if (error) {

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
        // Missing Code
        // =======================

        if (!code) {

            return res.status(400).json({

                success: false,

                error:
                    "TikTok authorization code missing."

            });

        }

        // =======================
        // Exchange Code
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
            // Success Response
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
// Render Port
// =======================

app.listen(
    process.env.PORT || 3000,
    () => {

        console.log(
            `Server running on port ${
                process.env.PORT || 3000
            }`
        );

    }
);

// =======================
// Storage
// =======================

const savedUsers =
    new Set();

const messageStore =
    new Map();

// =======================
// Start WhatsApp Bot
// =======================

async function startBot() {

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
    // Save Credentials
    // =======================

    sock.ev.on(
        "creds.update",
        saveCreds
    );

    // =======================
    // Connection
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
            // QR
            // =======================

            if (qr) {

                console.log(
                    "New QR Code generated"
                );

                currentQR =
                    await qrcode.toDataURL(
                        qr
                    );

            }

            // =======================
            // Connected
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
            // Connection Closed
            // =======================

            if (
                connection === "close"
            ) {

                const reconnect =
                    lastDisconnect
                        ?.error
                        ?.output
                        ?.statusCode !==
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
    // Messages
    // =======================

    sock.ev.on(
        "messages.upsert",
        async ({ messages }) => {

            const msg =
                messages[0];

            if (!msg.message)
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

${sock.user.id}`
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

                case "!groups":

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

                // =======================
                // MEMBERS
                // =======================

                case "!members":

                    if (
                        !jid.endsWith("@g.us")
                    ) {

                        await sock.sendMessage(
                            jid,
                            {
                                text:
                                    "Use this inside a group."
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

                // =======================
                // USERS
                // =======================

                case "!users":

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

                // =======================
                // SEND
                // =======================

                case "!send":

                    const sendText =
                        text
                            .replace(
                                "!send",
                                ""
                            )
                            .trim();

                    await sock.sendMessage(
                        jid,
                        {
                            text:
                                sendText
                        }
                    );

                    break;

                // =======================
                // ADD USER
                // =======================

                case "!add":

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

                // =======================
                // REMOVE USER
                // =======================

                case "!remove":

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

                // =======================
                // PROMOTE
                // =======================

                case "!promote":

                    if (
                        jid.endsWith("@g.us")
                    ) {

                        await sock.groupParticipantsUpdate(
                            jid,
                            [
                                msg.key.participant
                            ],
                            "promote"
                        );

                    }

                    break;

                // =======================
                // DEMOTE
                // =======================

                case "!demote":

                    if (
                        jid.endsWith("@g.us")
                    ) {

                        await sock.groupParticipantsUpdate(
                            jid,
                            [
                                msg.key.participant
                            ],
                            "demote"
                        );

                    }

                    break;

                // =======================
                // DELETE ACCOUNT
                // =======================

                case "!deleteaccount":

                    await sock.sendMessage(
                        jid,
                        {
                            text:
                                "Deleting bot WhatsApp session..."
                        }
                    );

                    await sock.logout();

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

                    break;

            }

        }
    );

    // =======================
    // Deleted Message Recovery
    // =======================

    sock.ev.on(
        "messages.update",
        async updates => {

            for (
                const update of updates
            ) {

                if (
                    update.update.message === null
                ) {

                    const old =
                        messageStore.get(
                            update.key.id
                        );

                    if (old) {

                        await sock.sendMessage(
                            old.jid,
                            {
                                text:
                                    `Recovered deleted message:

${old.text}`
                            }
                        );

                    }

                }

            }

        }
    );

}

// =======================
// Start Bot
// =======================

startBot();
