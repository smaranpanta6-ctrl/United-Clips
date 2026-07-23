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
const ACTIVE_CATEGORY_ID = "1529961507062812752";


const campaigns = new Map();



export default {

data: new SlashCommandBuilder()

.setName("campaign")

.setDescription("Campaign management system")

.setDMPermission(false)

.addSubcommand(sub =>
sub
.setName("create")
.setDescription("Create a campaign")

.addStringOption(option =>
option
.setName("name")
.setDescription("Song campaign name")
.setRequired(true)
)

.addStringOption(option =>
option
.setName("client")
.setDescription("Label/client")
.setRequired(true)
)

.addStringOption(option =>
option
.setName("budget")
.setDescription("Budget")
.setRequired(true)
)

.addStringOption(option =>
option
.setName("cpm")
.setDescription("CPM")
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
.setDescription("Description")
.setRequired(true)
)

),



async execute(interaction){


if(
interaction.options.getSubcommand()
!== "create"
) return;



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



const id =
Date.now().toString();



const channelName =
data.name
.toLowerCase()
.replace(/[^a-z0-9]+/g,"-")
.slice(0,90);





// CREATE ONLY ONE CHANNEL

const campaignChannel =
await interaction.guild.channels.create({

name: channelName,

type:
ChannelType.GuildText,

parent:
ACTIVE_CATEGORY_ID

});




const campaign = {


id,

...data,


channel:
campaignChannel.id,


category:null,


members:[],


submissions:0,


views:0,


paid:0,


status:"Active"


};



campaigns.set(
id,
campaign
);





const embed =
new EmbedBuilder()

.setColor("Blue")

.setTitle(
`🎵 ${data.name}`
)

.setDescription(
`
🏷️ **Client**
${data.client}


💰 **Budget**
$${data.budget}


📈 **CPM**
${data.cpm}


📅 **Ends**
${data.deadline}


📝 **Description**
${data.description}


🟢 **Status**
Active


👥 **Editors Joined**
0
`
);





const buttons =
new ActionRowBuilder()

.addComponents(

new ButtonBuilder()

.setCustomId(
`campaign_join_${id}`
)

.setLabel(
"🎬 JOIN"
)

.setStyle(
ButtonStyle.Success
),



new ButtonBuilder()

.setCustomId(
`campaign_leave_${id}`
)

.setLabel(
"🚪 LEAVE"
)

.setStyle(
ButtonStyle.Danger
),



new ButtonBuilder()

.setCustomId(
`campaign_status_${id}`
)

.setLabel(
"📊 STATUS"
)

.setStyle(
ButtonStyle.Primary
)

);



await campaignChannel.send({

embeds:[
embed
],

components:[
buttons
]

});





await interaction.reply({

content:
`✅ Created campaign channel: ${campaignChannel}`,

ephemeral:true

});


},





async button(interaction){



const [action,id] =
interaction.customId
.split("_").slice(1);



const campaign =
campaigns.get(id);



if(!campaign)
return interaction.reply({

content:"❌ Campaign expired.",

ephemeral:true

});





// JOIN BUTTON

if(action==="join"){



if(
campaign.members.includes(
interaction.user.id
)
){

return interaction.reply({

content:
"❌ You already joined.",

ephemeral:true

});

}





campaign.members.push(
interaction.user.id
);





if(!campaign.category){



const category =
await interaction.guild.channels.create({


name:
campaign.name,


type:
ChannelType.GuildCategory,


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
PermissionFlagsBits.ViewChannel
]

},



{

id:
interaction.user.id,

allow:[
PermissionFlagsBits.ViewChannel
]

}


]


});



campaign.category =
category.id;





for(
const name of [

"information",
"rules",
"resources",
"chat",
"viral-examples"

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

},


{

id:
STAFF_ROLE_ID,

allow:[
PermissionFlagsBits.ViewChannel
]

},


{

id:
interaction.user.id,

allow:[
PermissionFlagsBits.ViewChannel
]

}


]

});


}



}





else{


const category =
interaction.guild.channels.cache.get(
campaign.category
);



await category.permissionOverwrites.create(

interaction.user.id,

{

ViewChannel:true

}

);


}




await interaction.reply({

content:
`✅ You joined **${campaign.name}**`,

ephemeral:true

});


}






// LEAVE BUTTON


if(action==="leave"){



campaign.members =
campaign.members.filter(
x=>x!==interaction.user.id
);



if(campaign.category){


const category =
interaction.guild.channels.cache.get(
campaign.category
);



if(category){

await category.permissionOverwrites.delete(
interaction.user.id
);

}

}





await interaction.reply({

content:
"🚪 You left the campaign.",

ephemeral:true

});


}







// STATUS BUTTON


if(action==="status"){


const embed =
new EmbedBuilder()

.setColor("Green")

.setTitle(
`📊 ${campaign.name} STATUS`
)

.setDescription(

`
👥 Editors:
${campaign.members.length}


📤 Submissions:
${campaign.submissions}


👀 Views:
${campaign.views}


💸 Paid:
$${campaign.paid}


🟢 Status:
${campaign.status}


📅 Deadline:
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
