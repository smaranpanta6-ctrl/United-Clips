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


export default {

data: new SlashCommandBuilder()

.setName("campaign")

.setDescription("Campaign management system")

.addSubcommand(sub =>
    sub
    .setName("create")
    .setDescription("Create a paid editing campaign")

    .addStringOption(option =>
        option
        .setName("name")
        .setDescription("Campaign name")
        .setRequired(true)
    )

    .addStringOption(option =>
        option
        .setName("client")
        .setDescription("Client / Label")
        .setRequired(true)
    )

    .addStringOption(option =>
        option
        .setName("budget")
        .setDescription("Payment budget")
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
        .setName("slots")
        .setDescription("Editors needed")
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


try {


/*
 STAFF CHECK
*/

if(
!interaction.member.roles.cache.has(STAFF_ROLE_ID)
){

return interaction.reply({

content:
"❌ Only staff members can create campaigns.",

ephemeral:true

});

}



/*
 GET DATA
*/


const name =
interaction.options.getString("name");


const client =
interaction.options.getString("client");


const budget =
interaction.options.getString("budget");


const deadline =
interaction.options.getString("deadline");


const slots =
interaction.options.getString("slots");


const description =
interaction.options.getString("description");





/*
 CREATE CHANNEL
*/


const channel =
await interaction.guild.channels.create({

name:
`🎬-${name}`
.toLowerCase()
.replace(/[^a-z0-9-]/g,"-"),


type:
ChannelType.GuildText,


permissionOverwrites:[

{
id:
interaction.guild.roles.everyone.id,

deny:[
PermissionFlagsBits.ViewChannel
]

},


{
id:
STAFF_ROLE_ID,

allow:[
PermissionFlagsBits.ViewChannel,
PermissionFlagsBits.SendMessages,
PermissionFlagsBits.ManageMessages
]

}

]

});





/*
 EMBED
*/


const embed =
new EmbedBuilder()

.setColor("#5865F2")

.setTitle(
`🎬 ${name}`
)

.setDescription(
`
## Campaign Information


🎵 **Client**
${client}


💰 **Budget**
${budget}


👥 **Editors Needed**
${slots}


📅 **Deadline**
${deadline}


📝 **Description**
${description}



## Status

🟢 OPEN


Click apply if you want to join.
`
)

.setFooter({

text:
"United Clips Campaign System"

})

.setTimestamp();





/*
 BUTTONS
*/


const row =
new ActionRowBuilder()

.addComponents(

new ButtonBuilder()

.setCustomId("campaign_apply")

.setLabel("🎬 Apply")

.setStyle(
ButtonStyle.Success
),


new ButtonBuilder()

.setCustomId("campaign_submit")

.setLabel("📤 Submit Edit")

.setStyle(
ButtonStyle.Primary
),


new ButtonBuilder()

.setCustomId("campaign_approve")

.setLabel("✅ Approve")

.setStyle(
ButtonStyle.Success
),


new ButtonBuilder()

.setCustomId("campaign_reject")

.setLabel("❌ Reject")

.setStyle(
ButtonStyle.Danger
),


new ButtonBuilder()

.setCustomId("campaign_paid")

.setLabel("💰 Paid")

.setStyle(
ButtonStyle.Secondary
)

);





await channel.send({

embeds:[
embed
],

components:[
row
]

});






await interaction.reply({

content:
`✅ Campaign created: ${channel}`,

ephemeral:true

});



logger.info(
`Campaign created by ${interaction.user.tag}`
);



}


catch(error){


logger.error(
"Campaign error:",
error
);



if(!interaction.replied){

await interaction.reply({

content:
"❌ Something went wrong creating the campaign.",

ephemeral:true

});

}


}


}

};
