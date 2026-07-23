import {
    SlashCommandBuilder,
    ChannelType,
    PermissionFlagsBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} from "discord.js";


const STAFF_ROLE_ID = "1529961495402778771";

const campaigns = new Map();


export default {

data: new SlashCommandBuilder()

    .setName("campaign")

    .setDescription("Campaign management system")

    .setDMPermission(false)

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
            .setDescription("Deadline")
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


const sub =
interaction.options.getSubcommand();


if(sub !== "create") return;



if(
!interaction.member.roles.cache.has(STAFF_ROLE_ID)
){

return interaction.reply({

content:
"❌ Only staff can create campaigns.",

ephemeral:true

});

}



const data = {

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



const campaignId =
Date.now().toString();



const category =
await interaction.guild.channels.create({

name:
`🎬 ${data.name}`,

type:
ChannelType.GuildCategory

});



for(
const name of [
"general",
"rules",
"resources",
"information"
]
){

await interaction.guild.channels.create({

name,

type:
ChannelType.GuildText,

parent:
category.id,

permissionOverwrites:[

{
id:
interaction.guild.roles.everyone.id,

deny:[
PermissionFlagsBits.ViewChannel
]

}

]

});

}



const campaign = {

id:campaignId,

...data,

members:[],

submissions:0,

views:0,

approved:0,

paid:0,

status:"Active"

};


campaigns.set(
campaignId,
campaign
);




const embed =
new EmbedBuilder()

.setColor("Blue")

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


📅 **Deadline**
${data.deadline}


📝 **Description**
${data.description}


🕒 **Status**
🟢 Active


👥 **Editors Joined**
0
`
);



const buttons =
new ActionRowBuilder()

.addComponents(

new ButtonBuilder()

.setCustomId(
`campaign_join_${campaignId}`
)

.setLabel(
"🎬 Join Campaign"
)

.setStyle(
ButtonStyle.Success
),


new ButtonBuilder()

.setCustomId(
`campaign_leave_${campaignId}`
)

.setLabel(
"🚪 Leave"
)

.setStyle(
ButtonStyle.Danger
),


new ButtonBuilder()

.setCustomId(
`campaign_status_${campaignId}`
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
channel =>
channel.name === "active-campaigns"
);



if(activeChannel){

await activeChannel.send({

embeds:[
embed
],

components:[
buttons
]

});

}



await interaction.reply({

content:
`✅ Campaign created: ${data.name}`,

ephemeral:true

});


},



async button(interaction){

// button system goes here

}

};
