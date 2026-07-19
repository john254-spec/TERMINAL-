const express = require("express");
const qrcode = require("qrcode");
const P = require("pino");
const fs = require("fs");

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


app.get("/", (req,res)=>{
    res.send("WhatsApp Bot Running ✅");
});


app.get("/health",(req,res)=>{
    res.json({
        status:"online"
    });
});


// QR browser page

app.get("/qr", (req, res) => {

    if (!currentQR) {
        return res.send("No QR available. Bot may already be connected.");
    }

    res.send(`
<!DOCTYPE html>
<html>
<head>
    <title>WhatsApp QR</title>
</head>
<body style="text-align:center;font-family:Arial;margin-top:40px;">

    <h2>WhatsApp QR Code</h2>

    <p>WhatsApp → Linked Devices → Link a Device</p>

    <img src="${currentQR}" alt="WhatsApp QR Code" width="300">

</body>
</html>
    `);

});



app.listen(
    process.env.PORT || 3000,
    ()=>{
        console.log("Server running");
    }
);



// =======================
// Storage
// =======================

const savedUsers = new Set();

const messageStore = new Map();



// =======================
// Start Bot
// =======================

async function startBot(){


const {
    state,
    saveCreds
} = await useMultiFileAuthState(
    "auth_info"
);



const sock = makeWASocket({

    auth:state,

    logger:P({
        level:"info"
    })

});



sock.ev.on(
"creds.update",
saveCreds
);




// =======================
// Connection
// =======================

sock.ev.on(
"connection.update",
(update)=>{


const {
    connection,
    qr,
    lastDisconnect
}=update;
    
if (qr) {
    console.log("New QR Code generated");

    currentQR = await QRCode.toDataURL(qr);
}
});

    }

if(connection==="open"){

    currentQR = "";

    console.log(
        "WhatsApp Connected ✅"
    );

}



if(connection==="close"){


const reconnect =
lastDisconnect?.error?.output?.statusCode
!== DisconnectReason.loggedOut;



if(reconnect){

    console.log(
        "Reconnecting in 5 seconds..."
    );


    setTimeout(()=>{

        startBot();

    },5000);


}
else{

    console.log(
        "Logged out. Scan QR again."
    );

}


}



});





// =======================
// Messages
// =======================

sock.ev.on(
"messages.upsert",
async({messages})=>{


const msg = messages[0];


if(!msg.message)
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



if(msg.key.fromMe)
return;



const command =
text.trim().split(" ")[0];



switch(command){


case "!help":

await sock.sendMessage(
jid,
{
text:
`
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



case "!status":

await sock.sendMessage(
jid,
{
text:"Bot online ✅"
}
);

break;



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



case "!groups":

const groups =
await sock.groupFetchAllParticipating();


let groupList =
"Groups:\n\n";


Object.values(groups)
.forEach(group=>{

groupList +=
`
${group.subject}

ID:
${group.id}

----------------
`;

});


await sock.sendMessage(
jid,
{
text:groupList
}
);

break;



case "!members":


if(!jid.endsWith("@g.us")){

await sock.sendMessage(
jid,
{
text:"Use this inside a group."
}
);

break;

}



const metadata =
await sock.groupMetadata(jid);


let members =
`
Group:
${metadata.subject}

ID:
${metadata.id}


Members:

`;



metadata.participants.forEach(member=>{

members +=
`${member.id}\n`;

});



await sock.sendMessage(
jid,
{
text:members
}
);


break;



case "!users":


let users =
"Known WhatsApp Users:\n\n";


Object.values(sock.contacts || {})
.forEach(contact=>{


if(contact.id){

users +=
`${contact.name || "Unknown"}

${contact.id}

----------------

`;

}

});



await sock.sendMessage(
jid,
{
text:users
}
);


break;



case "!send":

const sendText =
text.replace(
"!send",
""
).trim();


await sock.sendMessage(
jid,
{
text:sendText
}
);

break;



case "!add":

const number =
text.split(" ")[1];


savedUsers.add(number);


await sock.sendMessage(
jid,
{
text:`${number} added`
}
);

break;



case "!remove":

const remove =
text.split(" ")[1];


savedUsers.delete(remove);


await sock.sendMessage(
jid,
{
text:`${remove} removed`
}
);

break;



case "!promote":

if(jid.endsWith("@g.us")){

await sock.groupParticipantsUpdate(
jid,
[
msg.key.participant
],
"promote"
);

}

break;



case "!demote":

if(jid.endsWith("@g.us")){

await sock.groupParticipantsUpdate(
jid,
[
msg.key.participant
],
"demote"
);

}

break;



case "!deleteaccount":


await sock.sendMessage(
jid,
{
text:
"Deleting bot WhatsApp session..."
}
);


await sock.logout();


if(fs.existsSync("auth_info")){

fs.rmSync(
"auth_info",
{
recursive:true,
force:true
}
);

}


break;


}



});




// =======================
// Deleted Message Recovery
// =======================

sock.ev.on(
"messages.update",
async updates=>{


for(const update of updates){


if(update.update.message===null){


const old =
messageStore.get(
update.key.id
);


if(old){

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


});


}


startBot();
