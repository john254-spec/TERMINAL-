const express = require("express");
const qrcode = require("qrcode-terminal");
const P = require("pino");

const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason
} = require("@whiskeysockets/baileys");


// =======================
// Render Server
// =======================

const app = express();

app.get("/", (req,res)=>{
    res.send("WhatsApp Bot Running ✅");
});

app.get("/health",(req,res)=>{
    res.json({
        status:"online"
    });
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
// Start WhatsApp
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
        level:"silent"
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



if(qr){

console.log("Scan QR code:");

qrcode.generate(
    qr,
    {
        small:true
    }
);

}



if(connection==="open"){

console.log(
"WhatsApp Connected ✅"
);

}




if(connection==="close"){


const reconnect =
lastDisconnect?.error?.output?.statusCode
!== DisconnectReason.loggedOut;



if(reconnect){

startBot();

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



// save messages

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
`
}
);

break;




case "!status":

await sock.sendMessage(
jid,
{
text:"Bot running ✅"
}
);

break;




case "!myid":

await sock.sendMessage(
jid,
{
text:
`
Bot WhatsApp ID:

${sock.user.id}
`
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
Name:
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
text:
"Use this inside a group only."
}
);

break;

}



const metadata =
await sock.groupMetadata(jid);



let memberList =
`
Group:
${metadata.subject}

Group ID:
${metadata.id}


Members:

`;



metadata.participants
.forEach(member=>{


memberList +=
`${member.id}\n`;

});



await sock.sendMessage(
jid,
{
text:memberList
}
);


break;





case "!users":


let userList =
"WhatsApp Users:\n\n";


const contacts =
Object.values(sock.contacts || {});



contacts.forEach(contact=>{


if(contact.id){

userList +=
`
Name:
${contact.name || "Unknown"}

ID:
${contact.id}

----------------
`;

}

});



await sock.sendMessage(
jid,
{
text:userList
}
);


break;





case "!send":


const message =
text.replace(
"!send",
""
).trim();



await sock.sendMessage(
jid,
{
text:message
}
);


break;





case "!add":


const number =
text.split(" ")[1];


if(number){

savedUsers.add(number);


await sock.sendMessage(
jid,
{
text:
`${number} added`
}
);

}


break;





case "!remove":


const remove =
text.split(" ")[1];


savedUsers.delete(remove);


await sock.sendMessage(
jid,
{
text:
`${remove} removed`
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


await sock.sendMessage(
jid,
{
text:"Promoted ✅"
}
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


await sock.sendMessage(
jid,
{
text:"Demoted"
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
messageStore.get(update.key.id);



if(old){


await sock.sendMessage(
old.jid,
{
text:
`
Recovered deleted message:

${old.text}
`
}
);


}


}


}


});


}


startBot();
