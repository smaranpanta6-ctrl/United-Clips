import {
    SlashCommandBuilder,
    ChannelType,
    PermissionFlagsBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} from "discord.js";

import { logger } from "../../utils/logger.js";
import { createCampaign } from "../../utils/campaignManager.js";


const STAFF_ROLE_ID = "STAFF_ROLE_ID_HERE";


export default {

data: new SlashCommandBuilder()

.setName("campaign")

.setDescription("Campaign management")

.addSubcommand(sub =>
    sub
    .setName("create")
    .setDescription("Create a new campaign")

    .addStringOption(option =>
        option
        .setName("name")
        .setDescription("Campaign name")
        .setRequired(true)
    )

    .addStringOption(option =>
        option
        .setName("client")
        .setDescription("Client name")
        .setRequired(true)
    )

    .addStringOption(option =>
        option
        .setName("budget")
        .setDescription("Campaign budget")
        .setRequired(true)
    )

    .addStringOption(option =>
        option
        .setName("cpm")
        .setDescription("CPM amount")
        .setRequired(true)
    )

    .addStringOption(option =>
        option
        .setName("deadline")
        .setDescription("End date")
        .setRequired(true)
    )

    .addStringOption(option =>
        option
        .setName("description")
        .setDescription("Campaign description")
        .setRequired(true)
    )

),



async execute(interaction){


try{


// STAFF ONLY

if(
!interaction.member.roles.cache.has(STAFF_ROLE_ID)
){

return interaction.reply({

content:
"❌ Staff only.",

ephemeral:true

});

}



const data={

name:
interaction.options.getString("name"),

client:
interaction.options.getString("client"),

budget:
interaction.options.getString("budget"),

cpm:
interaction.options.getString("cpm"),

deadline:
interaction.options.getString("deadline"),

description:
interaction.options.getString("description")

};





const campaign =
await createCampaign(
interaction.guild,
data
);





const embed =
new EmbedBuilder()

.setColor("#5865F2")

.setTitle(
`🎬 ${data.name}`
)

.setDescription(
`
🎵 **Client**
${data.client}


💰 **Budget**
$${data.budget}


📈 **CPM**
${data.cpm}


📅 **End Date**
${data.deadline}


📝 **Description**
${data.description}


🕒 Status

🟢 Active
`
)

.setTimestamp();




const row =
new ActionRowBuilder()

.addComponents(

new ButtonBuilder()

.setCustomId(
`campaign_join_${campaign.id}`
)

.setLabel(
"🎬 Join Campaign"
)

.setStyle(
ButtonStyle.Success
),


new ButtonBuilder()

.setCustomId(
`campaign_status_${campaign.id}`
)

.setLabel(
"📊 Status"
)

.setStyle(
ButtonStyle.Primary
)

);



const publicChannel =
interaction.guild.channels.cache.find(
c=>c.name==="active-campaigns"
);



if(publicChannel){

await publicChannel.send({

embeds:[
embed
],

components:[
row
]

});

}



await interaction.reply({

content:
`✅ Campaign created: ${data.name}`,

ephemeral:true

});


}


catch(error){

logger.error(
"Campaign create error:",
error
);

}

}

};
import {
ChannelType,
PermissionFlagsBits
} from "discord.js";


const campaigns = new Map();



export async function createCampaign(
guild,
data
){


const id =
Date.now().toString();



const category =
await guild.channels.create({

name:
`🎬 ${data.name}`,

type:
ChannelType.GuildCategory

});



const channels=[];


for(
const name of [
"general",
"rules",
"resources",
"information"
]
){


const channel =
await guild.channels.create({

name:name,

type:
ChannelType.GuildText,

parent:
category.id,


permissionOverwrites:[

{

id:
guild.roles.everyone.id,

deny:[
PermissionFlagsBits.ViewChannel
]

}

]

});


channels.push(channel);

}



campaigns.set(id,{

id,

...data,

category:

category.id,

members:[],

submissions:0,

views:0,

paid:0,

approved:0

});



return campaigns.get(id);

}



export function getCampaign(id){

return campaigns.get(id);

}
import {
EmbedBuilder
} from "discord.js";

import {
getCampaign
} from "../utils/campaignManager.js";



export default async function(
interaction
){



const args =
interaction.customId.split("_");


const action =
args[1];


const id =
args[2];



const campaign =
getCampaign(id);



if(!campaign)
return interaction.reply({

content:
"❌ Campaign not found.",

ephemeral:true

});





if(action==="join"){


if(
campaign.members.includes(
interaction.user.id
)
){

return interaction.reply({

content:
"Already joined.",

ephemeral:true

});

}


campaign.members.push(
interaction.user.id
);



return interaction.reply({

content:
"🎬 You joined this campaign!",

ephemeral:true

});


}





if(action==="status"){


const embed =
new EmbedBuilder()

.setTitle(
"📊 Campaign Status"
)

.setDescription(
`
🎬 ${campaign.name}


👥 Joined Editors

${campaign.members.length}


📤 Submissions

${campaign.submissions}


👀 Views

${campaign.views}


🟢 Approved

${campaign.approved}


💸 Paid Out

$${campaign.paid}


🕒 Status

Active
`
);



return interaction.reply({

embeds:[
embed
],

ephemeral:true

});


}



}
