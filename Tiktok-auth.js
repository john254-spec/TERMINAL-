const axios = require("axios");

/*
========================================
TikTok OAuth Configuration
========================================
*/

const TIKTOK_AUTHORIZE_URL =
    "https://www.tiktok.com/v2/auth/authorize/";

const TIKTOK_TOKEN_URL =
    "https://open.tiktokapis.com/v2/oauth/token/";


/*
========================================
Setup TikTok Authentication
========================================
*/

function setupTikTokAuth(app) {

    /*
    ========================================
    TikTok Login
    ========================================
    */

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

            client_key: clientKey,

            response_type: "code",

            scope:
                "user.info.basic,video.list",

            redirect_uri:
                redirectUri,

            state:
                "tiktok_login"

        });


        const loginURL =
            TIKTOK_AUTHORIZE_URL +
            "?" +
            params.toString();


        res.redirect(loginURL);

    });


    /*
    ========================================
    TikTok Callback
    ========================================
    */

    app.get(
        "/tiktok/callback",
        async (req, res) => {

            const {
                code,
                state,
                error,
                error_description
            } = req.query;


            /*
            --------------------------------
            Check TikTok error
            --------------------------------
            */

            if (error) {

                return res.status(400).json({

                    success: false,

                    error: error,

                    error_description:
                        error_description || null

                });

            }


            /*
            --------------------------------
            Check authorization code
            --------------------------------
            */

            if (!code) {

                return res.status(400).json({

                    success: false,

                    error:
                        "TikTok authorization code missing."

                });

            }


            /*
            --------------------------------
            Exchange code for access token
            --------------------------------
            */

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

                        TIKTOK_TOKEN_URL,

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


                /*
                --------------------------------
                Don't display the access token
                --------------------------------
                */

                res.json({

                    success: true,

                    message:
                        "TikTok login successful.",

                    open_id:
                        response.data.open_id || null,

                    access_token_received:
                        !!response.data.access_token,

                    expires_in:
                        response.data.expires_in || null,

                    refresh_token_received:
                        !!response.data.refresh_token

                });


            } catch (err) {

                console.error(
                    "TikTok OAuth error:"
                );


                console.error(
                    err.response?.data ||
                    err.message
                );


                res.status(500).json({

                    success: false,

                    error:
                        err.response?.data ||
                        err.message

                });

            }

        }
    );


    /*
    ========================================
    TikTok Auth Status
    ========================================
    */

    app.get(
        "/tiktok",
        (req, res) => {

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

        }
    );


    console.log(
        "TikTok OAuth routes loaded."
    );

}


module.exports =
    setupTikTokAuth;
