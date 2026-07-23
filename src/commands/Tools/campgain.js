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


const STAFF_ROLE_ID = "PUT_STAFF_ROLE_ID_HERE";

const campaigns = new Map();


export default {

data: new SlashCommandBuilder()

.setName("campaign")

.setDescription("Campaign system")

.addSubcommand(sub =>
    sub
    .setName("create")
    .setDescription("Create a campaign")

    .addStringOption(o =>
        o.setName("name")
        .setDescription("Campaign name")
        .setRequired(true)
    )

    .addStringOption(o =>
        o.setName("client")
        .setDescription("Client name")
        .setRequired(true)
    )

    .addStringOption(o =>
        o.setName("budget")
        .setDescription("Campaign budget")
        .setRequired(true)
    )

    .addStringOption(o =>
        o.setName("cpm")
        .setDescription("CPM")
        .setRequired(true)
    )

    .addStringOption(o =>
        o.setName("deadline")
        .setDescription("End date")
        .setRequired(true)
    )

    .addStringOption(o =>
        o.setName("description")
        .setDescription("Description")
        .setRequired(true)
    )
),



async execute(interaction){


if(
!interaction.member.roles.cache.has(STAFF_ROLE_ID)
){

return interaction.reply({
content:"❌ Staff only.",
ephemeral:true
});

}



const name =
interaction.options.getString("name");

const client =
interaction.options.getString("client");

const budget =
interaction.options.getString("budget");

const cpm =
interaction.options.getString("cpm");

const deadline =
interaction.options.getString("deadline");

const description =
interaction.options.getString("description");



const id =
Date.now().toString();



const category =
await interaction.guild.channels.create({

name:`🎬-${name}`,

type:ChannelType.GuildCategory

});



const channels = {};



for(const channelName of [
"general",
"rules",
"resources",
"information"
]){


channels[channelName] =
await interaction.guild.channels.create({

name:channelName,

type:ChannelType.GuildText,

parent:category.id,


permissionOverwrites:[

{
id:interaction.guild.roles.everyone.id,

deny:[
PermissionFlagsBits.ViewChannel
]

}

]

});


}




const campaign = {

id,

name,

client,

budget,

cpm,

deadline,

description,

category:category.id,

channels,

members:[],

submissions:0,

views:0,

approved:0,

paid:0,

status:"Active"

};


campaigns.set(id,campaign);





const embed =
new EmbedBuilder()

.setColor("#5865F2")

.setTitle(
`🎬 ${name}`
)

.setDescription(
`
🎵 **Client**
${client}


💰 **Budget**
$${budget}


📈 **CPM**
${cpm}


📅 **End Date**
${deadline}


📝 **Description**
${description}


🕒 **Status**
🟢 Active


👥 **Editors Joined**
0
`
)

.setTimestamp();




const buttons =
new ActionRowBuilder()

.addComponents(

new ButtonBuilder()

.setCustomId(
`join_${id}`
)

.setLabel(
"🎬 Join Campaign"
)

.setStyle(
ButtonStyle.Success
),


new ButtonBuilder()

.setCustomId(
`leave_${id}`
)

.setLabel(
"🚪 Leave"
)

.setStyle(
ButtonStyle.Danger
),


new ButtonBuilder()

.setCustomId(
`status_${id}`
)

.setLabel(
"📊 Status"
)

.setStyle(
ButtonStyle.Primary
)

);





const activeChannel =
interaction.guild.channels.cache.find(
c=>c.name==="active-campaigns"
);



if(activeChannel){

await activeChannel.send({

embeds:[embed],

components:[buttons]

});

}




await interaction.reply({

content:
`✅ Campaign created: ${name}`,

ephemeral:true

});





},




async button(interaction){


const parts =
interaction.customId.split("_");


const action =
parts[0];

const id =
parts[1];


const campaign =
campaigns.get(id);



if(!campaign){

return interaction.reply({

content:
"❌ Campaign expired.",

ephemeral:true

});

}





if(action==="join"){


if(
campaign.members.includes(
interaction.user.id
)
){

return interaction.reply({

content:
"⚠️ You already joined.",

ephemeral:true

});

}



campaign.members.push(
interaction.user.id
);



await interaction.reply({

content:
"🎬 You joined the campaign!",

ephemeral:true

});

}



if(action==="leave"){


campaign.members =
campaign.members.filter(
id=>id!==interaction.user.id
);



await interaction.reply({

content:
"🚪 You left the campaign.",

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


💰 Budget

$${campaign.budget}


📈 CPM

${campaign.cpm}


👥 Joined Editors

${campaign.members.length}


📤 Total Submissions

${campaign.submissions}


👀 Views

${campaign.views}


🟢 Approved

${campaign.approved}


💸 Paid Out

$${campaign.paid}


🕒 Status

${campaign.status}


📅 End Date

${campaign.deadline}
`
);



await interaction.reply({

embeds:[
embed
],

ephemeral:true

});


}


}


};
